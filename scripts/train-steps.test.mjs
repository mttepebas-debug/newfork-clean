#!/usr/bin/env node
// TREN-ARACI: scripts/train.mjs apply-local, ci, push and run, in the throwaway world of train-test-world.mjs.
// Run: node --test scripts/train-steps.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build, applyLocal, ci, run, push, take, git, write, commit, auditLines, lock, md5, STAMP, ID, text, state, built, greened, w } from "./train-test-world.mjs";

// ---- apply-local ----

test("apply-local: applies new migrations in number order with their ledger rows and lets db.lock go", () => {
  w.branch("task/m2", ["m2", { "supabase/migrations/20261008030000_m2.sql": "create table m2(id int);\n" }]);
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "create table m1(id int);\n" }]);
  w.branch("task/m0", ["m0", { "supabase/migrations/20261008010000_m0.sql": "create table m0(id int);\n" }]);
  built("task/m2", "task/m1", "task/m0");
  w.ledger.set("20261008010000", { md5: md5("create table m0(id int);\n"), n: 1 }); // already in the shared database, same content: skipped
  const r = applyLocal(w.ctx);
  assert.equal(r.code, 0, text(r));
  const applies = w.calls.psql.filter((s) => s.includes("insert into supabase_migrations"));
  assert.equal(applies.length, 2);
  assert.match(applies[0], /create table m1[\s\S]*values \('20261008020000', 'm1', array\[/);
  assert.match(applies[1], /create table m2[\s\S]*values \('20261008030000', 'm2', array\[/);
  assert.equal(lock("db").free, true);
  assert.deepEqual(state().applied, ["20261008020000_m1.sql", "20261008030000_m2.sql"]);
  const a = auditLines().find((l) => l.event === "train-apply-local");
  assert.deepEqual(a.applied, ["20261008020000_m1.sql", "20261008030000_m2.sql"]);
  assert.equal(a.tool, "train");
});

test("apply-local: stops at the first failing migration and applies nothing after it", () => {
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "create table m1(id int);\n" }]);
  w.branch("task/m2", ["m2", { "supabase/migrations/20261008030000_m2.sql": "create table m2(id int);\n" }]);
  w.branch("task/m3", ["m3", { "supabase/migrations/20261008040000_m3.sql": "create table m3(id int);\n" }]);
  built("task/m1", "task/m2", "task/m3");
  w.failOn = "create table m2";
  const r = applyLocal(w.ctx);
  assert.equal(r.code, 1);
  assert.match(text(r), /20261008030000_m2\.sql[\s\S]*stand-in failure/);
  assert.equal(w.calls.psql.some((s) => s.includes("create table m3")), false);
  assert.deepEqual(state().applied, ["20261008020000_m1.sql"]);
  assert.match(text(r), /ortak DB'de main'de olmayan göç: 20261008020000_m1\.sql/);
});

test("build: migrations an unpushed train left in the shared database stay listed in every later train's state", () => {
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "create table m1(id int);\n" }]);
  built("task/m1");
  assert.equal(applyLocal(w.ctx).code, 0);
  w.branch("task/a", ["a", { "docs/a.md": "a\n" }]);
  for (const hour of ["11", "12"]) {
    const r = build({ ...w.ctx, now: () => new Date(`2026-10-08T${hour}:00:00Z`) }, ["task/a"]);
    assert.equal(r.code, 0, text(r));
    assert.deepEqual(state().strayInSharedDb, ["20261008020000_m1.sql"]);
    assert.match(text(r), /UYARI: ortak DB'de main'de olmayan göç: 20261008020000_m1\.sql/);
  }
});

test("build: a stray migration leaves the list once main has it, also under its live number", () => {
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "create table m1(id int);\n" }]);
  built("task/m1");
  assert.equal(applyLocal(w.ctx).code, 0);
  // the branch shipped later with the file renamed to the live ledger number (supabase/CLAUDE.md "Canlı")
  write(w.repo, "supabase/migrations/20261008052513_m1.sql", "create table m1(id int);\n");
  commit(w.repo, "m1 under its live number");
  git(w.repo, "push", "-q", "origin", "HEAD:main");
  w.branch("task/a", ["a", { "docs/a.md": "a\n" }]);
  const r = build({ ...w.ctx, now: () => new Date("2026-10-08T11:00:00Z") }, ["task/a"]);
  assert.notEqual(r.code, 1, text(r));
  assert.deepEqual(state().strayInSharedDb, []);
});

test("apply-local: a shared database missing one of main's migrations stops before applying", () => {
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "create table m1(id int);\n" }]);
  built("task/m1");
  w.ledger.delete("20260101000000");
  const r = applyLocal(w.ctx);
  assert.equal(r.code, 1);
  assert.match(text(r), /ortak DB main'in gerisinde: 20260101000000/);
  assert.equal(w.calls.psql.filter((s) => s.includes("insert into")).length, 0);
});

test("apply-local: another session's db.lock stops it; NF_OVERRIDE passes and is logged", () => {
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "create table m1(id int);\n" }]);
  built("task/m1");
  take("db", "oturum/ekran-01, test:db");
  const r = applyLocal(w.ctx);
  assert.equal(r.code, 1);
  assert.match(text(r), /db\.lock başka kimlikte: oturum\/ekran-01/);
  assert.equal(auditLines().at(-1).event, "train-blocked");
  const o = applyLocal({ ...w.ctx, override: "ekran-01 asked to share" });
  assert.equal(o.code, 0, text(o));
  const e = auditLines().find((l) => l.event === "train-override");
  assert.equal(e.reason, "ekran-01 asked to share");
  assert.equal(e.step, "apply-local");
  assert.match(text(o), /db\.lock trende değil \(NF_OVERRIDE ile aşıldı\)/);
  assert.doesNotMatch(text(o), /db\.lock trende kaldı/);
});

test("apply-local: a ledger row with the same number but other content stops the train (a fixed migration kept its name)", () => {
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "create table m1(id int, fixed int);\n" }]);
  built("task/m1");
  w.ledger.set("20261008020000", { md5: md5("create table m1(id int);\n"), n: 1 }); // an earlier train's first version
  const r = applyLocal(w.ctx);
  assert.equal(r.code, 1);
  assert.match(text(r), /DUR: 20261008020000_m1\.sql ortak DB'de başka içerikle uygulanmış/);
  assert.equal(w.calls.psql.filter((s) => s.includes("insert into")).length, 0);
  assert.equal(lock("db").free, true);
});

test("apply-local: a ledger row the CLI split into statements cannot be compared: a warning, not a stop", () => {
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "create table m1(id int);\n" }]);
  built("task/m1");
  w.ledger.set("20261008020000", { md5: "0".repeat(32), n: 3 });
  const r = applyLocal(w.ctx);
  assert.equal(r.code, 0, text(r));
  assert.match(text(r), /UYARI: 20261008020000_m1\.sql ledger'da 3 deyim olarak var \(CLI\); içerik karşılaştırılamadı, atlandı/);
});

test("apply-local: a db.lock whose holder died (taken before this boot) is cleared, not waited for", () => {
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "create table m1(id int);\n" }]);
  built("task/m1");
  fs.mkdirSync(process.env.NEWFORK_LOCK_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(process.env.NEWFORK_LOCK_DIR, "db.lock"),
    JSON.stringify({ identity: "oturum/eski", purpose: "test:db", startedAt: "2000-01-01T00:00:00Z", pid: 4242 }),
  );
  const r = applyLocal(w.ctx);
  assert.equal(r.code, 0, text(r));
  assert.match(text(r), /ölü sahibinden temizlendi: oturum\/eski/);
});

// ---- ci ----

const code = (name) => ["code", { [`apps/web/src/${name}.ts`]: `export const ${name} = 1;\n` }];

test("ci: pushes train/<stamp>, waits for that sha's run and records it green", () => {
  w.branch("task/a", code("a"));
  built("task/a");
  const r = ci(w.ctx);
  assert.equal(r.code, 0, text(r));
  const head = git(w.repo, "rev-parse", `train/${STAMP}`);
  assert.equal(git(w.origin, "rev-parse", `refs/heads/train/${STAMP}`), head);
  assert.deepEqual(w.calls.ci, [{ branch: `train/${STAMP}`, sha: head }]);
  assert.deepEqual({ ok: state().ci.ok, head: state().ci.head, run: state().ci.run }, { ok: true, head, run: 101 });
  assert.equal(auditLines().at(-1).event, "train-ci-green");
});

test("ci: a red run names its failed jobs, and push then refuses that head", () => {
  w.branch("task/a", code("a"));
  built("task/a");
  w.ciResult = { conclusion: "failure", run: 202, failedJobs: ["e2e"] };
  const r = ci(w.ctx);
  assert.equal(r.code, 1);
  assert.match(text(r), /CI failure: run 202; düşen işler: e2e/);
  const before = git(w.origin, "rev-parse", "refs/heads/main");
  const p = push(w.ctx);
  assert.equal(p.code, 1);
  assert.match(text(p), /CI bu sha'da yeşil değil/);
  assert.equal(git(w.origin, "rev-parse", "refs/heads/main"), before);
});

test("ci: no run showing up for the sha (Actions down) is a stop, not an endless wait", () => {
  w.branch("task/a", code("a"));
  built("task/a");
  w.ciResult = { conclusion: "no-run", run: null, failedJobs: [] };
  const r = ci(w.ctx);
  assert.equal(r.code, 1);
  assert.match(text(r), /CI no-run/);
  assert.equal(state().ci.ok, false);
});

test("ci: a docs-only train needs no CI run", () => {
  w.branch("task/d", ["d", { "docs/plan/x.md": "x\n" }]);
  built("task/d");
  const r = ci(w.ctx);
  assert.equal(r.code, 0, text(r));
  assert.equal(w.calls.ci.length, 0);
  assert.equal(state().ci.docsOnly, true);
});

test("ci: an uncommitted change in the train folder stops it before anything is pushed", () => {
  w.branch("task/a", code("a"));
  built("task/a");
  write(w.ctx.trainDir, "stray.txt", "x");
  const r = ci(w.ctx);
  assert.equal(r.code, 1);
  assert.match(text(r), /tren klasörü temiz değil/);
  assert.equal(w.calls.ci.length, 0);
  assert.throws(() => git(w.origin, "rev-parse", "--verify", `refs/heads/train/${STAMP}`));
});

// ---- push ----

test("push: fast-forwards origin main to a train CI passed, takes no lock, logs the push", () => {
  w.branch("task/a", code("a"));
  greened("task/a");
  const head = state().ci.head;
  const r = push(w.ctx);
  assert.equal(r.code, 0, text(r));
  assert.equal(git(w.origin, "rev-parse", "refs/heads/main"), head);
  assert.equal(lock("db").free, true);
  assert.equal(auditLines().at(-1).event, "train-push");
});

test("push: main moved since the build is refused (no force)", () => {
  w.branch("task/a", code("a"));
  greened("task/a");
  write(w.repo, "README.md", "moved\n");
  commit(w.repo, "moved");
  git(w.repo, "push", "-q", "origin", "HEAD:main");
  const r = push(w.ctx);
  assert.equal(r.code, 1);
  assert.match(text(r), /main ilerledi, yeniden build/);
});

test("push: NF_OVERRIDE passes a head CI did not pass, after saving origin main under refs/nf-backup/main/", () => {
  w.branch("task/a", code("a"));
  built("task/a");
  const before = git(w.origin, "rev-parse", "refs/heads/main");
  const r = push({ ...w.ctx, override: "acil düzeltme" });
  assert.equal(r.code, 0, text(r));
  assert.match(git(w.repo, "for-each-ref", "--format=%(refname)", "refs/nf-backup/main/"), /refs\/nf-backup\/main\//);
  const o = auditLines().find((l) => l.event === "train-override");
  assert.equal(o.reason, "acil düzeltme");
  assert.equal(o.sha, before);
});

// ---- run ----

test("run: build, ci, push and apply-local in one command; main ends at the train, db.lock is free", () => {
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "create table m1(id int);\n" }]);
  const r = run(w.ctx, ["task/m1"]);
  assert.equal(r.code, 0, text(r));
  assert.equal(git(w.origin, "rev-parse", "refs/heads/main"), state().head);
  assert.deepEqual(state().applied, ["20261008020000_m1.sql"]);
  assert.equal(lock("db").free, true);
});

test("run: a red CI stops before push; main does not move", () => {
  w.branch("task/a", code("a"));
  w.ciResult = { conclusion: "failure", run: 303, failedJobs: ["check"] };
  const before = git(w.origin, "rev-parse", "refs/heads/main");
  const r = run(w.ctx, ["task/a"]);
  assert.equal(r.code, 1);
  assert.equal(r.failedStep, "ci");
  assert.equal(git(w.origin, "rev-parse", "refs/heads/main"), before);
});

test("run: coord/kayit rides along while it holds commits main lacks, and not after", () => {
  w.branch("coord/kayit", ["records", { "DURUM.md": "# Durum\n" }]);
  const r = run(w.ctx, []);
  assert.equal(r.code, 0, text(r));
  assert.deepEqual(state().included.map((b) => b.name), ["coord/kayit"]);
  const again = run({ ...w.ctx, now: () => new Date("2026-10-08T11:00:00Z") }, []);
  assert.equal(again.code, 1);
  assert.match(text(again), /trene girecek dal yok/);
});
