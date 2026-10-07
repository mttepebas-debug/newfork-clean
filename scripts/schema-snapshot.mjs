#!/usr/bin/env node
// SCHEMA-SNAP: supabase/schema.sql is a read-only snapshot of the public and
// app_private schemas as the migrations in supabase/migrations build them on an
// empty database. Nothing ever applies it; sessions read it to find the current
// definition of a function, policy or table instead of hunting the newest of
// hundreds of migrations (and reading a dropped or replaced one by mistake).
//
//   node scripts/schema-snapshot.mjs write       throwaway database -> supabase/schema.sql
//                                                (pnpm.cmd db:schema; run it after adding a migration)
//   node scripts/schema-snapshot.mjs check-fast  no database: was the file regenerated after the
//                                                last change in supabase/migrations? (pnpm lint)
//   node scripts/schema-snapshot.mjs check       dump the running local stack and compare
//                                                (CI's db job, right after `supabase start`)
//
// `write` never touches the shared local stack (project newfork-clean, ports
// 553xx): it copies supabase/ to a temp folder, renames the project and moves
// its ports to 595xx (the idea of scripts/ci-supabase-apart.sh; CI uses
// 590xx-592xx), and starts or stops nothing unless both changes took. The name
// is new on every run: `db start` answers "already running" with success, so a
// shared name let a second run dump the first one's half-built database and
// stop it (measured 2026-10-07). Two runs at once now collide on the ports and
// the second fails alone.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ILKELER P16: a new check arrives as a warning. Flip to true once every
// session knows the rule; then a stale file fails `pnpm lint` and CI's db job.
const STRICT = false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = path.join(ROOT, "supabase", "schema.sql");
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");
const SNAP_PROJECT = "newfork-schema-snap";
const SNAP_PORT_PREFIX = "595";
const REGENERATE = "pnpm.cmd db:schema";

// Every CR goes: Windows and CI must hash and render alike, one migration keeps
// CR bytes inside function bodies on purpose (.gitattributes), and git turns a
// CRLF in this file into LF on commit (supabase/**/*.sql eol=lf).
const noCr = (text) => text.replace(/\r/g, "");

export function fingerprint(dir = MIGRATIONS) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const hash = crypto.createHash("sha256");
  for (const f of files) hash.update(`${f}\0${noCr(fs.readFileSync(path.join(dir, f), "utf8"))}\0`);
  return { count: files.length, last: files.at(-1) ?? "-", hash: hash.digest("hex") };
}

export function render(dump, fp) {
  const header = [
    "-- GENERATED FILE, DO NOT EDIT. Read-only snapshot of the public and app_private",
    "-- schemas after every migration in supabase/migrations runs on an empty database.",
    "-- Nothing applies this file: change the schema with a new migration, then run",
    `-- ${REGENERATE} and commit both (SCHEMA-SNAP). CI compares this file with a fresh dump.`,
    "-- CR bytes are dropped: 20260909003001 keeps some inside a function body on purpose.",
    `-- migrations: ${fp.count}, last: ${fp.last}`,
    `-- fingerprint: sha256:${fp.hash}`,
  ];
  return `${header.join("\n")}\n\n${noCr(dump).replace(/^\n+/, "").replace(/\n*$/, "\n")}`;
}

export function headerHash(text) {
  return /^-- fingerprint: sha256:([0-9a-f]{64})$/m.exec(text)?.[1] ?? null;
}

// Retargets a copy of supabase/config.toml; throws unless both changes took.
export function apartConfig(toml, project) {
  if (!project.startsWith(`${SNAP_PROJECT}-`)) throw new Error(`not a throwaway project: ${project}`);
  const out = noCr(toml)
    .replace(/^project_id = .*$/m, `project_id = "${project}"`)
    .replace(/^((?:shadow_)?port) = 553(\d\d)$/gm, `$1 = ${SNAP_PORT_PREFIX}$2`);
  if (!out.includes(`project_id = "${project}"`) || /^(shadow_)?port = 553/m.test(out)) {
    throw new Error("could not move the throwaway project away from newfork-clean / 553xx");
  }
  return out;
}

function supabase(args, quiet = false) {
  // ponytail: shell on Windows only, where `supabase` is an npm .cmd shim.
  const win = process.platform === "win32";
  const argv = win ? args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : args;
  return spawnSync("supabase", argv, { stdio: quiet ? "pipe" : "inherit", shell: win, encoding: "utf8" });
}

function dump(workdir) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nf-schema-dump-")), "dump.sql");
  const args = ["db", "dump", "--local", "-s", "public,app_private", "-f", out];
  if (workdir) args.push("--workdir", workdir);
  if (supabase(args).status !== 0) throw new Error("supabase db dump failed");
  const text = fs.readFileSync(out, "utf8");
  fs.rmSync(path.dirname(out), { recursive: true, force: true });
  return text;
}

function write() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "nf-schema-snap-"));
  const sb = path.join(work, "supabase");
  fs.mkdirSync(sb);
  // What CI's db job has: migrations, seed.sql and the test world builder (no
  // gitignored local fixture). Seeds hold no DDL today; copying them keeps the
  // two databases alike if that ever changes.
  for (const p of ["migrations", "seed.sql", "test-support"]) {
    fs.cpSync(path.join(ROOT, "supabase", p), path.join(sb, p), { recursive: true });
  }
  const project = `${SNAP_PROJECT}-${process.pid}`;
  fs.writeFileSync(
    path.join(sb, "config.toml"),
    apartConfig(fs.readFileSync(path.join(ROOT, "supabase", "config.toml"), "utf8"), project),
  );
  // CI pins the CLI; another version may dump differently and CI would disagree.
  const pinned = /setup-cli@v1\s+with:\s+version:\s*([\d.]+)/.exec(
    fs.readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf8"),
  )?.[1];
  const cli = supabase(["--version"], true).stdout?.trim();
  if (pinned && cli !== pinned) console.warn(`warning: supabase CLI ${cli} here, CI pins ${pinned}`);
  const fp = fingerprint();
  try {
    if (supabase(["db", "start", "--workdir", work]).status !== 0) {
      throw new Error(
        `supabase db start failed; ports ${SNAP_PORT_PREFIX}xx busy? Another db:schema may be running ` +
          `(or a killed one's containers: docker ps --filter name=${SNAP_PROJECT})`,
      );
    }
    fs.writeFileSync(SNAPSHOT, render(dump(work), fp));
    console.log(`wrote supabase/schema.sql (${fp.count} migrations, last ${fp.last})`);
  } finally {
    // BL-143: Docker's network prune lock is per daemon; a CI job stopping at
    // the same moment makes `stop` fail once. A retry is a no-op once stopped.
    let stopped = false;
    for (let i = 1; i <= 3 && !(stopped = supabase(["stop", "--no-backup", "--workdir", work]).status === 0); i++) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, i * 5000);
    }
    if (!stopped) console.warn(`warning: ${project} is still running: supabase stop --project-id ${project} --no-backup`);
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function fail(message) {
  const level = STRICT ? "error" : "warning";
  console.log(process.env.GITHUB_ACTIONS ? `::${level}::${message}` : `${level}: ${message}`);
  if (STRICT) process.exit(1);
}

function checkFast() {
  const committed = fs.existsSync(SNAPSHOT) ? headerHash(fs.readFileSync(SNAPSHOT, "utf8")) : null;
  if (committed !== fingerprint().hash) {
    fail(`supabase/schema.sql is older than supabase/migrations: run ${REGENERATE} and commit it (SCHEMA-SNAP)`);
  }
}

function check() {
  let fresh;
  try {
    fresh = render(dump(), fingerprint());
  } catch (error) {
    return fail(`schema snapshot check could not run: ${error.message}`);
  }
  const committed = fs.existsSync(SNAPSHOT) ? noCr(fs.readFileSync(SNAPSHOT, "utf8")) : "";
  if (committed === fresh) return console.log("supabase/schema.sql matches the migrations");
  const a = committed.split("\n");
  const b = fresh.split("\n");
  let i = 0;
  while (a[i] === b[i]) i++;
  console.log(`first difference at line ${i + 1}:\n  file: ${a[i] ?? "(end)"}\n  dump: ${b[i] ?? "(end)"}`);
  fail(`supabase/schema.sql does not match what the migrations build: run ${REGENERATE} and commit it (SCHEMA-SNAP)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const mode = process.argv[2];
  if (mode === "write") write();
  else if (mode === "check-fast") checkFast();
  else if (mode === "check") check();
  else {
    console.error("usage: node scripts/schema-snapshot.mjs <write|check-fast|check>");
    process.exit(2);
  }
}
