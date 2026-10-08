// TREN-ARACI: the shared test world for train-plan.test.mjs and train-steps.test.mjs (two files so `node --test`
// runs them side by side). Every case runs in a throwaway repo with a local bare origin, temp lock and inbox
// folders, and stand-ins for psql, pnpm, db:schema and CI: never the real ../newfork-wt/train, the shared
// database, the real locks or GitHub. Importing it registers the per-test reset.
import { beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "newfork-train-test-"));
process.env.NEWFORK_LOCK_DIR = path.join(root, "locks");
process.env.NEWFORK_INBOX_DIR = path.join(root, "inbox");
process.env.NEWFORK_CI_STATE = "idle"; // never ask the real `gh`

export const { plan, build, applyLocal, ci, push, run } = await import("./train.mjs");
export const { take, status } = await import("./lock.mjs");
export const { fingerprint, render, headerHash } = await import("./schema-snapshot.mjs");

export const md5 = (s) => createHash("md5").update(s).digest("hex");
export const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
export const write = (dir, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};
export const commit = (dir, message, author = "Ada <ada@test>") => {
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "--author", author, "-m", message);
};
// A schema.sql whose header matches the migrations beside it, as `pnpm db:schema` leaves it.
export const snapshot = (dir, dump) => write(dir, "supabase/schema.sql", render(dump, fingerprint(path.join(dir, "supabase/migrations"))));
export const auditLines = () => {
  try {
    return fs.readFileSync(path.join(process.env.NEWFORK_INBOX_DIR, "audit.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};
export const lock = (name) => status().find((l) => l.name === name);
export const STAMP = "20261008T1000Z";
export const now = () => new Date("2026-10-08T10:00:30Z");
export const ID = `koordinator/tren-${STAMP}`;

// A repo cloned from a bare origin, main holding one migration, a matching schema.sql and a shared README.
// Built once; every test gets a copy (git is slow to start on Windows, a copy is not).
const template = path.join(root, "template");
{
  const origin = path.join(template, "origin.git");
  const repo = path.join(template, "repo");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  execFileSync("git", ["clone", "-q", origin, repo], { stdio: "ignore" });
  git(repo, "config", "user.email", "coord@test");
  git(repo, "config", "user.name", "Coord");
  git(repo, "checkout", "-q", "-B", "main");
  write(repo, "supabase/migrations/20260101000000_base.sql", "create table base(id int);\n");
  write(repo, "README.md", "one\ntwo\nthree\n");
  write(repo, ".gitignore", "artifacts/\n");
  snapshot(repo, "-- dump: base\n");
  commit(repo, "init");
  git(repo, "push", "-q", "origin", "HEAD:main");
}

let n = 0;
export let w; // this test's world
function world() {
  const dir = path.join(root, `w${++n}`);
  fs.cpSync(template, dir, { recursive: true });
  const origin = path.join(dir, "origin.git");
  const repo = path.join(dir, "repo");
  git(repo, "remote", "set-url", "origin", origin);
  const calls = { psql: [], pnpm: [], dbSchema: [], ci: [] };
  // version -> { md5: md5(statements[1]), n: how many statements } (the CLI splits a file, psql -1 keeps it whole)
  const ledger = new Map([["20260101000000", { md5: md5("create table base(id int);\n"), n: 1 }]]);
  const exec = {
    psql(sql, { query = false } = {}) {
      calls.psql.push(sql);
      if (query) return { status: 0, stdout: [...ledger].map(([v, r]) => `${v} ${r.md5} ${r.n}`).join("\n"), stderr: "" };
      const v = sql.match(/schema_migrations\(version, name, statements\) values \('(\d+)'/)?.[1];
      if (w.failOn && sql.includes(w.failOn)) return { status: 3, stdout: "", stderr: `ERROR: stand-in failure in ${w.failOn}` };
      const body = sql.match(/array\[\$(nf_train\d*)\$([\s\S]*)\$\1\$\]\);\n$/)?.[2];
      if (v) ledger.set(v, { md5: md5(body), n: 1 });
      return { status: 0, stdout: "", stderr: "" };
    },
    pnpm(args, { cwd, log }) {
      calls.pnpm.push({ args, cwd });
      fs.appendFileSync(log, `pnpm ${args.join(" ")}\n`);
      return w.redStep && args.join(" ") === w.redStep ? 1 : 0;
    },
    dbSchema(cwd, log) {
      calls.dbSchema.push(cwd);
      fs.appendFileSync(log, "db:schema\n");
      snapshot(cwd, "-- dump: regenerated\n");
      return 0;
    },
    ciWait({ branch, sha, log }) {
      calls.ci.push({ branch, sha });
      fs.appendFileSync(log, `ci ${branch} ${sha}\n`);
      return w.ciResult ?? { conclusion: "success", run: 101, failedJobs: [] };
    },
  };
  const ctx = { repo, trainDir: path.join(dir, "train"), exec, now };
  // A local task branch from origin/main, one commit per [message, files] entry (train.mjs reads origin's branch
  // first and falls back to the local one; the first plan test publishes its branches to cover origin's).
  const branch = (name, ...commits) => {
    git(repo, "checkout", "-q", "-b", name, "origin/main");
    for (const [message, files] of commits) {
      for (const [rel, text] of Object.entries(files)) write(repo, rel, text);
      if (Object.keys(files).some((f) => f.startsWith("supabase/migrations/"))) snapshot(repo, `-- dump: ${name}\n`);
      commit(repo, message);
    }
    git(repo, "checkout", "-q", "main");
    return git(repo, "rev-parse", name);
  };
  return { dir, origin, repo, ctx, calls, ledger, branch, failOn: null, redStep: null, ciResult: null };
}
export const text = (r) => r.lines.join("\n");
export const refs = (repo) => git(repo, "for-each-ref", "--format=%(refname) %(objectname)");
export const state = () => JSON.parse(fs.readFileSync(path.join(w.ctx.trainDir, "artifacts/train/state.json"), "utf8"));
export const subjects = (ref) => git(w.repo, "log", "--format=%s", `origin/main..${ref}`).split("\n").filter(Boolean).reverse();

beforeEach(() => {
  fs.rmSync(process.env.NEWFORK_LOCK_DIR, { recursive: true, force: true });
  fs.rmSync(process.env.NEWFORK_INBOX_DIR, { recursive: true, force: true });
  process.env.NEWFORK_CI_STATE = "idle";
  w = world();
});

after(() => fs.rmSync(root, { recursive: true, force: true }));

export function built(...branches) {
  const r = build(w.ctx, branches);
  assert.notEqual(r.code, 1, text(r));
}

export function greened(...branches) {
  built(...branches);
  const r = ci(w.ctx);
  assert.equal(r.code, 0, text(r));
}
