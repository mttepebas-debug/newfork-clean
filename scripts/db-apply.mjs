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

// ledger: Map version -> { md5, n } (n = statement count). files: [{ file, sql }] in version order.
// A file in the ledger with the same content is skipped; with other content, or split by the CLI, it stops
// the run: an applied migration never changes, a fix is a new migration.
export function pending(ledger, files) {
  const apply = [];
  for (const { file, sql } of files) {
    const row = ledger.get(version(file));
    if (!row) {
      apply.push(file);
      continue;
    }
    if (row.n !== 1) return { apply, stop: `${file}: ledger'da ${row.n} deyim olarak var (CLI ile uygulanmış); içerik karşılaştırılamadı` };
    if (row.md5 !== md5(sql)) return { apply, stop: `${file}: ortak DB'de başka içerikle uygulanmış; düzeltme yeni migration'la` };
  }
  return { apply, stop: null };
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
  const q = psql(db, "select version || ' ' || coalesce(md5(statements[1]), '-') || ' ' || coalesce(array_length(statements, 1), 0) from supabase_migrations.schema_migrations;", true);
  if (q.status !== 0) {
    console.error(`ortak DB okunamadı: ${q.err.trim()}`);
    return 1;
  }
  const ledger = new Map(q.out.split("\n").filter(Boolean).map((l) => l.trim().split(" ")).map(([v, m, n]) => [v, { md5: m, n: Number(n) }]));
  const { apply, stop } = pending(ledger, files);
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
