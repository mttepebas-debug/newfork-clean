#!/usr/bin/env node
// PARALEL-1 (BL-897): coverage for scripts/test-db.mjs without a database. A temp git repo plays the
// worktree (its own builder) and origin/main (another builder); docker and supabase are a fake exec.
// Run: node --test scripts/test-db.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { scopeToBuilder, nonTransactional, prepareRun, mainBuilder, run, RUN_DIR } from "./test-db.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "newfork-test-db-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
const write = (dir, file, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
};
const TEST = (name) => `-- ${name}\nbegin;\ncreate extension if not exists pgtap with schema extensions;\nselect plan(1);\nselect ok(true);\nselect * from finish();\nrollback;\n`;

// A worktree whose builder differs from origin/main's, like a branch that changed the test world.
let n = 0;
function worktree() {
  const origin = path.join(tmp, `origin-${++n}.git`);
  const dir = path.join(tmp, `wt-${n}`);
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  execFileSync("git", ["clone", "-q", origin, dir], { stdio: "ignore" });
  git(dir, "checkout", "-q", "-B", "main");
  write(dir, "supabase/config.toml", 'project_id = "nf-test"\n');
  write(dir, "supabase/test-support/builder.sql", "-- builder on main\ncreate or replace function tests.main_only() returns int language sql as $$ select 1 $$;\n");
  write(dir, "supabase/tests/a.test.sql", TEST("a"));
  write(dir, "supabase/tests/b.test.sql", TEST("b"));
  write(dir, "supabase/tests/ci-green.txt", "supabase/tests/a.test.sql\n");
  git(dir, "add", "-A");
  git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init");
  git(dir, "push", "-q", "origin", "HEAD:main");
  git(dir, "checkout", "-q", "-b", "task/x");
  write(dir, "supabase/test-support/builder.sql", "-- builder on the branch\ncreate or replace function tests.branch_only() returns int language sql as $$ select 2 $$;\n");
  return dir;
}

// Records every call; the supabase call also snapshots the run folder it was handed.
function fakeExec({ dockerStatus = 0, supabaseStatus = 0 } = {}) {
  const calls = [];
  const exec = (cmd, args, opts = {}) => {
    const call = { cmd, args, input: opts.input ? String(opts.input) : null };
    if (cmd === "supabase") {
      const runDir = path.join(opts.cwd, RUN_DIR);
      call.files = fs.readdirSync(runDir).sort();
      call.builder = fs.readFileSync(path.join(runDir, "builder.psql"), "utf8");
      call.a = fs.existsSync(path.join(runDir, "a.test.sql")) ? fs.readFileSync(path.join(runDir, "a.test.sql"), "utf8") : null;
    }
    calls.push(call);
    return { status: cmd === "docker" ? dockerStatus : supabaseStatus };
  };
  return { calls, exec };
}
const quiet = () => {
  const lines = [];
  return { lines, log: (s) => lines.push(String(s)) };
};

test("scopeToBuilder: the first begin; line also includes the builder, every line keeps its number", () => {
  const sql = "-- header\n\nbegin;\nselect plan(1);\nbegin; -- not the first\nrollback;\n";
  const out = scopeToBuilder(sql, "builder.psql", "x.test.sql");
  assert.equal(out.split("\n").length, sql.split("\n").length);
  assert.equal(out.split("\n")[2], "begin; \\ir builder.psql");
  assert.equal(out.split("\n")[4], "begin; -- not the first");
  assert.equal(out.replace("begin; \\ir builder.psql", "begin;"), sql);
});

test("scopeToBuilder: a file that does not open its own transaction is refused by name", () => {
  assert.throws(() => scopeToBuilder("select plan(1);\nbegin;\nrollback;\n", "builder.psql", "late.test.sql"), /late\.test\.sql/);
  assert.throws(() => scopeToBuilder("-- nothing\nselect 1;\n", "builder.psql", "none.test.sql"), /none\.test\.sql/);
});

test("nonTransactional: what cannot run inside a test's transaction is named; today's builder has none", () => {
  assert.deepEqual(nonTransactional("create or replace function f() returns int language sql as $$ select 1 $$;"), []);
  assert.equal(nonTransactional("create index concurrently i on t (x);").length, 1);
  assert.equal(nonTransactional("vacuum t;\n").length, 1);
  assert.equal(nonTransactional("select 1;\ncommit;\n").length, 1);
  const real = fs.readFileSync(new URL("../supabase/test-support/builder.sql", import.meta.url), "utf8");
  assert.deepEqual(nonTransactional(real), []);
});

test("prepareRun: every test file is copied scoped to the worktree's builder; tracked files never change", () => {
  const dir = worktree();
  const before = fs.readFileSync(path.join(dir, "supabase/tests/a.test.sql"), "utf8");
  write(dir, `${RUN_DIR}/stale.test.sql`, TEST("stale")); // a killed run's leftover
  assert.deepEqual(prepareRun(dir), [RUN_DIR]); // what `supabase test db` is handed
  const abs = path.join(dir, RUN_DIR);
  assert.deepEqual(fs.readdirSync(abs).sort(), ["a.test.sql", "b.test.sql", "builder.psql"]);
  assert.match(fs.readFileSync(path.join(abs, "a.test.sql"), "utf8"), /^-- a\nbegin; \\ir builder\.psql\n/);
  const builder = fs.readFileSync(path.join(abs, "builder.psql"), "utf8");
  assert.match(builder, /^set client_min_messages = warning;\n/);
  assert.match(builder, /tests\.branch_only/);
  assert.match(builder, /reset client_min_messages;\n$/);
  assert.equal(fs.readFileSync(path.join(dir, "supabase/tests/a.test.sql"), "utf8"), before);
  assert.equal(git(dir, "status", "--porcelain", "supabase/tests"), `?? ${RUN_DIR}/`);
});

test("prepareRun: named files only, and nothing outside supabase/tests", () => {
  const dir = worktree();
  assert.deepEqual(prepareRun(dir, ["supabase/tests/b.test.sql"]), [`${RUN_DIR}/b.test.sql`]);
  assert.deepEqual(fs.readdirSync(path.join(dir, RUN_DIR)).sort(), ["b.test.sql", "builder.psql"]);
  assert.throws(() => prepareRun(dir, ["supabase/test-support/builder.sql"]), /supabase\/tests/);
  assert.throws(() => prepareRun(dir, ["supabase/tests/missing.test.sql"]), /missing\.test\.sql/);
});

test("prepareRun: a builder that cannot run inside a transaction stops the run before any test", () => {
  const dir = worktree();
  write(dir, "supabase/test-support/builder.sql", "create index concurrently i on tests.ids (id);\n");
  assert.throws(() => prepareRun(dir), /concurrently/);
});

test("mainBuilder: the permanent load comes from origin/main, never the worktree", () => {
  const dir = worktree();
  assert.match(mainBuilder(dir), /tests\.main_only/);
  assert.doesNotMatch(mainBuilder(dir), /branch_only/);
  assert.equal(mainBuilder(dir, "origin/no-such-branch"), null);
});

test("run: origin/main's builder loads in one transaction, then pgTAP runs on the scoped copies", () => {
  const dir = worktree();
  const { calls, exec } = fakeExec({ supabaseStatus: 3 });
  const { log } = quiet();
  const code = run({ root: dir, argv: [], exec, log });
  assert.equal(code, 3); // pgTAP's own exit code
  assert.deepEqual(calls.map((c) => c.cmd), ["docker", "supabase"]);
  const [load, pgtap] = calls;
  assert.deepEqual(load.args.slice(0, 3), ["exec", "-i", "supabase_db_nf-test"]);
  assert.ok(load.args.includes("-1"), "one transaction: a failing builder never half-loads");
  assert.ok(load.args.includes("ON_ERROR_STOP=1"));
  assert.match(load.input, /tests\.main_only/);
  assert.doesNotMatch(load.input, /branch_only/);
  assert.deepEqual(pgtap.args, ["test", "db", RUN_DIR]);
  assert.deepEqual(pgtap.files, ["a.test.sql", "b.test.sql", "builder.psql"]);
  assert.match(pgtap.builder, /tests\.branch_only/);
  assert.match(pgtap.a, /begin; \\ir builder\.psql/);
  assert.equal(fs.existsSync(path.join(dir, RUN_DIR)), false, "the copies are gone after the run");
});

test("run: named files reach pgTAP as their scoped copies", () => {
  const dir = worktree();
  const { calls, exec } = fakeExec();
  assert.equal(run({ root: dir, argv: ["supabase/tests/b.test.sql"], exec, log: quiet().log }), 0);
  assert.deepEqual(calls[1].args, ["test", "db", `${RUN_DIR}/b.test.sql`]);
  assert.deepEqual(calls[1].files, ["b.test.sql", "builder.psql"]);
});

test("run: --load-only loads origin/main's builder and runs no test", () => {
  const dir = worktree();
  const { calls, exec } = fakeExec();
  assert.equal(run({ root: dir, argv: ["--load-only"], exec, log: quiet().log }), 0);
  assert.deepEqual(calls.map((c) => c.cmd), ["docker"]);
  assert.match(calls[0].input, /tests\.main_only/);
});

test("run: a failing permanent load warns and the tests still run on their own builder", () => {
  const dir = worktree();
  const { calls, exec } = fakeExec({ dockerStatus: 1 });
  const { lines, log } = quiet();
  assert.equal(run({ root: dir, argv: [], exec, log }), 0);
  assert.deepEqual(calls.map((c) => c.cmd), ["docker", "supabase"]);
  assert.match(lines.join("\n"), /origin\/main/);
});

test("run: without origin/main the permanent load is skipped with a warning", () => {
  const dir = worktree();
  git(dir, "update-ref", "-d", "refs/remotes/origin/main");
  const { calls, exec } = fakeExec();
  const { lines, log } = quiet();
  assert.equal(run({ root: dir, argv: [], exec, log }), 0);
  assert.deepEqual(calls.map((c) => c.cmd), ["supabase"]);
  assert.match(lines.join("\n"), /origin\/main/);
});

test("run: a refused test file stops the run before the database is touched", () => {
  const dir = worktree();
  write(dir, "supabase/tests/late.test.sql", "select 1;\nbegin;\nrollback;\n");
  const { calls, exec } = fakeExec();
  const { lines, log } = quiet();
  assert.equal(run({ root: dir, argv: [], exec, log }), 1);
  assert.deepEqual(calls, []);
  assert.match(lines.join("\n"), /late\.test\.sql/);
  assert.equal(fs.existsSync(path.join(dir, RUN_DIR)), false);
});
