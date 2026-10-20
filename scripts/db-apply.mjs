#!/usr/bin/env node
// Applies origin/main's migrations the shared local database lacks, one transaction each (psql -1), with the
// ledger row written in the same transaction, as MCP `apply_migration` records it on live. Run it under the db
// lock after a push to main: `node scripts/lock.mjs run db -- node scripts/db-apply.mjs`.
// Not `supabase migration up --local`: the CLI runs a file statement by statement and needs --include-all for
// out-of-order files (a migration renamed to its live ledger version).
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { container, nonTransactional } from "./test-db.mjs";

const MIGRATIONS = "supabase/migrations";
const NAME = /^\d{14}_[\w-]+\.sql$/;
export const version = (file) => file.split("_")[0];
const md5 = (text) => createHash("md5").update(text).digest("hex");

// What a ledger row is compared by: the text without its trailing spaces, newlines and one closing semicolon,
// as the CLI (statement by statement), db-apply and MCP (the whole file) each leave a row's end differently.
export const ending = (sql) => sql.replace(/[ \t\r\n]+$/, "").replace(/;$/, "").replace(/[ \t\r\n]+$/, "");
export const fingerprint = (sql) => md5(ending(sql));

// ledger: Map version -> { md5, n } (md5 = fingerprint of statements[1]; n = statement count). files: [{ file, sql }]
// in version order. A one-statement row is compared: the same text is skipped, other text stops the run (an applied
// migration never changes, a fix is a new migration). A row the CLI split into statements can't be compared and
// counts as applied (Mert 2026-10-20); `cli` counts those.
export function pending(ledger, files) {
  const apply = [];
  let cli = 0;
  for (const { file, sql } of files) {
    const row = ledger.get(version(file));
    if (!row) {
      apply.push(file);
      continue;
    }
    if (row.n !== 1) {
      cli += 1;
      continue;
    }
    if (row.md5 !== fingerprint(sql)) return { apply, stop: `${file}: ortak DB'de başka içerikle uygulanmış; düzeltme yeni migration'la`, cli };
  }
  return { apply, stop: null, cli };
}

const literal = (sql) => {
  let tag = "$nf_apply$";
  for (let k = 1; sql.includes(tag); k++) tag = `$nf_apply${k}$`;
  return `${tag}${sql}${tag}`;
};
export function applySql(file, sql) {
  const name = file.replace(/^\d+_/, "").replace(/\.sql$/, "").replace(/'/g, "''");
  return (
    `set client_min_messages = warning;\n${sql}\n` +
    `insert into supabase_migrations.schema_migrations(version, name, statements) values ('${version(file)}', '${name}', array[${literal(sql)}]);\n`
  );
}

function psql(db, sql, query) {
  const args = ["exec", "-i", db, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"];
  const r = spawnSync("docker", query ? [...args, "-At", "-c", sql] : [...args, "-1", "-f", "-"], { input: query ? "" : sql, encoding: "utf8" });
  return { status: r.status ?? 1, out: r.stdout ?? "", err: r.stderr || String(r.error ?? "") };
}

function main() {
  const root = process.cwd();
  const git = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  git(["fetch", "-q", "origin"]);
  const files = git(["ls-tree", "--name-only", "origin/main", `${MIGRATIONS}/`])
    .split("\n")
    .map((l) => l.trim().split("/").pop())
    .filter((f) => f && NAME.test(f))
    .sort()
    .map((file) => ({ file, sql: git(["show", `origin/main:${MIGRATIONS}/${file}`]) }));
  const db = container(root);
  // statements[1] by the same ending rule as `ending` (Postgres: trailing whitespace, one semicolon, whitespace).
  const q = psql(
    db,
    "select version || ' ' || coalesce(md5(rtrim(regexp_replace(rtrim(statements[1], E' \t\r\n'), ';$', ''), E' \t\r\n')), '-') || ' ' || " +
      "coalesce(array_length(statements, 1), 0) from supabase_migrations.schema_migrations;",
    true,
  );
  if (q.status !== 0) {
    console.error(`ortak DB okunamadı: ${q.err.trim()}`);
    return 1;
  }
  const ledger = new Map(q.out.split("\n").filter(Boolean).map((l) => l.trim().split(" ")).map(([v, m, n]) => [v, { md5: m, n: Number(n) }]));
  const { apply, stop, cli } = pending(ledger, files);
  if (cli) console.log(`${cli} eski satır CLI ile deyim deyim yazılmış; içerik karşılaştırılamadı, uygulanmış sayıldı`);
  if (stop) {
    console.error(`DUR: ${stop}`);
    return 1;
  }
  if (!apply.length) console.log("uygulanacak migration yok");
  for (const file of apply) {
    const { sql } = files.find((f) => f.file === file);
    const outside = nonTransactional(sql);
    if (outside.length) {
      console.error(`${file}: işlem içinde koşamayan deyim (${outside[0]}); elle uygula`);
      return 1;
    }
    const r = psql(db, applySql(file, sql), false);
    if (r.status !== 0) {
      console.error(`${file}: KIRMIZI: ${r.err.trim().split("\n").slice(-5).join(" | ")}`);
      return 1;
    }
    console.log(`${file}: uygulandı`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
