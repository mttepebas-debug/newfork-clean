#!/usr/bin/env node
// TREN-ARACI: scripts/train.mjs apply-local, ci, push and run, in the throwaway world of train-test-world.mjs.
// Run: node --test scripts/train-steps.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build, applyLocal, ci, run, push, take, release, git, write, commit, auditLines, lock, md5, STAMP, ID, text, state, built, greened, w } from "./train-test-world.mjs";
import { ciWait } from "./train.mjs";

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

test("apply-local: a train without new migrations neither asks for db.lock nor reads the shared database", () => {
  w.branch("task/a", ["a", { "docs/a.md": "a\n" }]);
  built("task/a");
  take("db", "oturum/ekran-01, e2e");
  const sleep = () => {
    throw new Error("waited in the db queue");
  };
  const r = applyLocal({ ...w.ctx, lockWaitMin: 30, sleep });
  assert.equal(r.code, 0, text(r));
  assert.match(text(r), /uygulanacak göç yok; db\.lock istenmedi/);
  assert.equal(w.calls.psql.length, 0);
  assert.equal(lock("db").identity, "oturum/ekran-01"); // the holder's lock stays, no ticket of ours in its queue
  const queue = path.join(process.env.NEWFORK_LOCK_DIR, "queue-db");
  assert.equal(fs.existsSync(queue) ? fs.readdirSync(queue).length : 0, 0);
  assert.equal(auditLines().some((l) => l.event === "train-blocked"), false);
  // a train with a migration still waits for the same holder
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "create table m1(id int);\n" }]);
  built("task/m1");
  assert.throws(() => applyLocal({ ...w.ctx, lockWaitMin: 30, sleep }), /waited in the db queue/);
});

test("run: a docs-only train ends while another session's e2e holds db", () => {
  w.branch("task/a", ["a", { "docs/a.md": "a\n" }]);
  take("db", "oturum/ekran-01, e2e");
  const r = run({ ...w.ctx, sleep: () => assert.fail("waited in the db queue") }, ["task/a"]);
  assert.equal(r.code, 0, text(r));
  assert.equal(git(w.origin, "rev-parse", "refs/heads/main"), state().head);
  assert.match(text(r), /uygulanacak göç yok/);
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

test("push: NF_OVERRIDE past a red CI records that run, its conclusion and failed jobs in the audit entry", () => {
  w.branch("task/a", code("a"));
  built("task/a");
  w.ciResult = { conclusion: "failure", run: 303, failedJobs: ["e2e", "db"] };
  assert.equal(ci(w.ctx).code, 1);
  const r = push({ ...w.ctx, override: "acil düzeltme" });
  assert.equal(r.code, 0, text(r));
  const o = auditLines().find((l) => l.event === "train-override");
  assert.deepEqual(o.ci, { run: 303, conclusion: "failure", failedJobs: ["e2e", "db"], head: state().ci.head });
});

test("push: NF_OVERRIDE with no CI at all records that no CI ran", () => {
  w.branch("task/a", code("a"));
  built("task/a");
  const r = push({ ...w.ctx, override: "acil düzeltme" });
  assert.equal(r.code, 0, text(r));
  const o = auditLines().find((l) => l.event === "train-override");
  assert.deepEqual(o.ci, { run: null, conclusion: "yok", failedJobs: [], head: null });
});

// ---- run ----

test("run: build, ci, push and apply-local in one command; main ends at the train, db.lock is free", () => {
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "create table m1(id int);\n" }]);
  const r = run(w.ctx, ["task/m1"]);
  assert.equal(r.code, 0, text(r));
  assert.equal(git(w.origin, "rev-parse", "refs/heads/main"), state().head);
  assert.deepEqual(state().applied, ["20261008020000_m1.sql"]);
  assert.equal(lock("db").free, true);
  assert.doesNotMatch(text(r), /tren main'e girene kadar/); // pushed first: main has it
});

// ---- train.lock: one train at a time on this PC ----

// Another session's train: it holds train.lock, and when it lets go its push has moved origin's main.
function otherTrainLands() {
  git(w.repo, "checkout", "-q", "-b", "other-train", "origin/main");
  write(w.repo, "docs/other.md", "landed by another session's train\n");
  commit(w.repo, "docs: the other train");
  git(w.repo, "push", "-q", "origin", "HEAD:main");
  git(w.repo, "checkout", "-q", "main");
  release("train", "tren/other-1");
}

test("run: a second train waits for train.lock, then builds on the main the first one moved, and lands", () => {
  w.branch("task/a", code("a"));
  take("train", "tren/other-1, run task/other");
  let waited = 0;
  const sleep = () => {
    if (waited++ === 0) otherTrainLands();
  };
  const r = run({ ...w.ctx, sleep, trainWaitMin: 1 }, ["task/a"]);
  assert.equal(r.code, 0, text(r));
  assert.ok(waited > 0, "the train never waited");
  assert.doesNotMatch(text(r), /main ilerledi/);
  const main = git(w.origin, "rev-parse", "refs/heads/main");
  assert.equal(main, state().head);
  assert.equal(git(w.origin, "log", "--format=%s", "-3", "refs/heads/main").includes("docs: the other train"), true);
  assert.equal(lock("train").free, true);
});

test("run: a train.lock that stays held past the wait stops the train before build; main and the train folder untouched", () => {
  w.branch("task/a", code("a"));
  take("train", "tren/other-1, run task/other");
  const before = git(w.origin, "rev-parse", "refs/heads/main");
  const r = run({ ...w.ctx, trainWaitMin: 0.002 }, ["task/a"]);
  assert.equal(r.code, 1);
  assert.equal(r.failedStep, "train-lock");
  assert.match(text(r), /train\.lock başka trende: tren\/other-1 \(run task\/other\)/);
  assert.equal(git(w.origin, "rev-parse", "refs/heads/main"), before);
  assert.equal(fs.existsSync(path.join(w.ctx.trainDir, "artifacts/train/state.json")), false);
  assert.equal(lock("train").identity, "tren/other-1");
  assert.equal(auditLines().at(-1).event, "train-blocked");
});

test("run: train.lock is let go after a green train and after a red one", () => {
  w.branch("task/a", code("a"));
  assert.equal(run(w.ctx, ["task/a"]).code, 0);
  assert.equal(lock("train").free, true);
  w.branch("task/b", code("b"));
  w.ciResult = { conclusion: "failure", run: 404, failedJobs: ["e2e"] };
  assert.equal(run(w.ctx, ["task/b"]).code, 1);
  assert.equal(lock("train").free, true);
});

test("run: a train.lock whose holder died (an earlier train process, gone) is cleared, not waited for", () => {
  w.branch("task/a", code("a"));
  fs.mkdirSync(process.env.NEWFORK_LOCK_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(process.env.NEWFORK_LOCK_DIR, "train.lock"),
    JSON.stringify({ identity: "tren/eski-4242", purpose: "run task/old", startedAt: "2000-01-01T00:00:00Z", pid: 4242 }),
  );
  const r = run({ ...w.ctx, trainWaitMin: 0.002 }, ["task/a"]);
  assert.equal(r.code, 0, text(r));
  assert.match(text(r), /ölü sahibinden temizlendi: tren\/eski-4242/);
  assert.equal(lock("train").free, true);
});

test("run: train.lock is let go when a step throws", () => {
  w.branch("task/a", code("a"));
  const exec = { ...w.ctx.exec, ciWait: () => { throw new Error("gh vanished"); } };
  assert.throws(() => run({ ...w.ctx, exec }, ["task/a"]), /gh vanished/);
  assert.equal(lock("train").free, true);
});

test("build alone waits for train.lock too; NF_OVERRIDE passes it and is logged", () => {
  w.branch("task/a", code("a"));
  take("train", "tren/other-1, run task/other");
  const r = build({ ...w.ctx, trainWaitMin: 0.002 }, ["task/a"]);
  assert.equal(r.code, 1);
  assert.match(text(r), /train\.lock başka trende: tren\/other-1/);
  const o = build({ ...w.ctx, trainWaitMin: 0.002, override: "the other train hung, Mert said go" }, ["task/a"]);
  assert.notEqual(o.code, 1, text(o));
  const e = auditLines().find((l) => l.event === "train-override");
  assert.equal(e.step, "build");
  assert.equal(e.reason, "the other train hung, Mert said go");
  assert.equal(lock("train").identity, "tren/other-1");
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

test("run: coord/kayit2 rides along while it holds commits main lacks, and not after", () => {
  w.branch("coord/kayit2", ["records", { "DURUM.md": "# Durum\n" }]);
  const r = run(w.ctx, []);
  assert.equal(r.code, 0, text(r));
  assert.deepEqual(state().included.map((b) => b.name), ["coord/kayit2"]);
  const again = run({ ...w.ctx, now: () => new Date("2026-10-08T11:00:00Z") }, []);
  assert.equal(again.code, 1);
  assert.match(text(again), /trene girecek dal yok/);
});

// ---- review round 1 ----

test("ci: a code file renamed into docs/ is not a docs-only train", () => {
  write(w.repo, "apps/web/src/x.ts", "export const x = 1;\n");
  commit(w.repo, "x");
  git(w.repo, "push", "-q", "origin", "HEAD:main");
  git(w.repo, "checkout", "-q", "-b", "task/r", "origin/main");
  fs.mkdirSync(path.join(w.repo, "docs"), { recursive: true });
  git(w.repo, "mv", "apps/web/src/x.ts", "docs/x.md");
  commit(w.repo, "x to docs");
  git(w.repo, "checkout", "-q", "main");
  built("task/r");
  const r = ci(w.ctx);
  assert.equal(r.code, 0, text(r));
  assert.equal(w.calls.ci.length, 1);
  assert.equal(state().ci.docsOnly, false);
});

test("apply-local: a dead db.lock under the train's own identity (an earlier train process) is moved to dead/ and taken anew", () => {
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "create table m1(id int);\n" }]);
  built("task/m1");
  fs.mkdirSync(process.env.NEWFORK_LOCK_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(process.env.NEWFORK_LOCK_DIR, "db.lock"),
    JSON.stringify({ identity: ID, purpose: "tren apply-local", startedAt: "2000-01-01T00:00:00Z", pid: 4242 }),
  );
  const seen = [];
  const psql = w.ctx.exec.psql;
  const exec = { ...w.ctx.exec, psql: (sql, o) => (seen.push(lock("db")), psql(sql, o)) };
  const r = applyLocal({ ...w.ctx, exec });
  assert.equal(r.code, 0, text(r));
  assert.match(text(r), /ölü sahibinden temizlendi: koordinator\/tren-/);
  assert.equal(fs.readdirSync(path.join(process.env.NEWFORK_LOCK_DIR, "dead")).length, 1);
  assert.deepEqual({ identity: seen[0].identity, pid: seen[0].pid }, { identity: ID, pid: process.pid });
});

test("apply-local: a live db.lock under the train's identity but another process's pid is not the train's", () => {
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "create table m1(id int);\n" }]);
  built("task/m1");
  fs.mkdirSync(process.env.NEWFORK_LOCK_DIR, { recursive: true });
  const held = { identity: ID, purpose: "tren apply-local", startedAt: new Date().toISOString(), pid: process.ppid }; // a second train process, alive
  fs.writeFileSync(path.join(process.env.NEWFORK_LOCK_DIR, "db.lock"), JSON.stringify(held));
  const r = applyLocal(w.ctx);
  assert.equal(r.code, 1, text(r));
  assert.match(text(r), /DUR: .*db\.lock aynı kimlikte başka süreçte/);
  assert.equal(w.calls.psql.length, 0);
  assert.deepEqual({ identity: lock("db").identity, pid: lock("db").pid }, { identity: ID, pid: process.ppid }); // left as it was
});

test("apply-local: waits its turn while another session holds db, then applies once it is let go", () => {
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "create table m1(id int);\n" }]);
  built("task/m1");
  take("db", "oturum/ekran-01, test:db");
  let sleeps = 0;
  const sleep = () => {
    if (++sleeps === 1) release("db", "oturum/ekran-01");
  };
  const r = applyLocal({ ...w.ctx, lockWaitMin: 1, sleep });
  assert.equal(r.code, 0, text(r));
  assert.equal(sleeps, 1);
  assert.doesNotMatch(text(r), /DUR/);
  assert.deepEqual(state().applied, ["20261008020000_m1.sql"]);
  assert.equal(lock("db").free, true);
});

test("run: coord/kayit2 only on origin (no local branch) still rides along", () => {
  w.branch("coord/kayit2", ["records", { "DURUM.md": "# Durum\n" }]);
  git(w.repo, "push", "-q", "origin", "coord/kayit2");
  git(w.repo, "branch", "-q", "-D", "coord/kayit2");
  const r = run(w.ctx, []);
  assert.equal(r.code, 0, text(r));
  assert.deepEqual(state().included.map((b) => b.name), ["coord/kayit2"]);
});

test("build: branches that change nothing in the end make no train", () => {
  git(w.repo, "checkout", "-q", "-b", "task/z", "origin/main");
  write(w.repo, "docs/z.md", "z\n");
  commit(w.repo, "z");
  fs.rmSync(path.join(w.repo, "docs/z.md"));
  commit(w.repo, "z gone");
  git(w.repo, "checkout", "-q", "main");
  const r = build(w.ctx, ["task/z"]);
  assert.equal(r.code, 1);
  assert.match(text(r), /trene girecek değişiklik yok/);
  assert.equal(fs.existsSync(w.ctx.trainDir), false);
});

test("ciWait: asks for ci.yml runs only, logs a failing gh's stderr, and names the failed jobs", () => {
  const log = path.join(w.dir, "ci.log");
  fs.writeFileSync(log, "");
  const asked = [];
  const gh = (args) => {
    asked.push(args);
    if (asked.length === 1) return { status: 1, stdout: "", stderr: "HTTP 502: bad gateway\n" };
    if (args[1] === "list") return { status: 0, stdout: JSON.stringify([{ databaseId: 7, headSha: "abc" }]), stderr: "" };
    const jobs = [
      { name: "check", conclusion: "success" },
      { name: "e2e", conclusion: "failure" },
    ];
    return { status: 0, stdout: JSON.stringify({ status: "completed", conclusion: "failure", jobs }), stderr: "" };
  };
  const r = ciWait({ cwd: w.repo, branch: "train/x", sha: "abc", log, timeoutMin: 1, gh, sleep: () => {} });
  assert.deepEqual(r, { conclusion: "failure", run: 7, failedJobs: ["e2e"] });
  const lists = asked.filter((a) => a[1] === "list");
  assert.ok(lists.length >= 2 && lists.every((a) => a.join(" ").includes("--workflow ci.yml")), JSON.stringify(lists));
  assert.match(fs.readFileSync(log, "utf8"), /HTTP 502: bad gateway/);
});

// ---- integration fixes (WORKFLOW-V2) ----

test("apply-local: with NF_OVERRIDE a held db.lock is not waited for: one try, then the override path", () => {
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "create table m1(id int);\n" }]);
  built("task/m1");
  take("db", "oturum/ekran-01, test:db");
  let sleeps = 0;
  const sleep = () => {
    sleeps++;
    throw new Error("waited in the queue");
  };
  const r = applyLocal({ ...w.ctx, override: "acil", lockWaitMin: 30, sleep });
  assert.equal(r.code, 0, text(r));
  assert.equal(sleeps, 0);
  assert.match(text(r), /AŞILDI \(NF_OVERRIDE\): db\.lock başka kimlikte: oturum\/ekran-01 \(test:db\)/);
  assert.equal(lock("db").identity, "oturum/ekran-01"); // the holder's lock stays
});

test("apply-local: a wait that runs out names what kept it: the holder, or a ticket ahead in the queue", () => {
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "create table m1(id int);\n" }]);
  built("task/m1");
  take("db", "oturum/ekran-01, test:db");
  const held = applyLocal(w.ctx);
  assert.equal(held.code, 1);
  assert.match(text(held), /DUR: db\.lock için [\d.]+ dk beklendi; alınamadı: db\.lock başka kimlikte: oturum\/ekran-01 \(test:db\)/);
  release("db", "oturum/ekran-01");
  const queue = path.join(process.env.NEWFORK_LOCK_DIR, "queue-db");
  fs.mkdirSync(queue, { recursive: true });
  const ticket = { identity: "run/ekran-02-1", command: "pnpm test:db", pid: process.pid, startedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(queue, "000000000000001-1-aaaaaa.json"), JSON.stringify(ticket));
  const queued = applyLocal(w.ctx);
  assert.equal(queued.code, 1);
  assert.match(text(queued), /DUR: db\.lock için [\d.]+ dk beklendi; alınamadı: db\.lock sırasında önde: run\/ekran-02-1 \(pnpm test:db\)/);
  assert.equal(lock("db").free, true);
});

test("run: fetches origin first, so a coord/kayit2 another clone pushed since the last fetch rides along", () => {
  const other = path.join(w.dir, "other");
  git(w.dir, "clone", "-q", w.origin, other);
  git(other, "checkout", "-q", "-b", "coord/kayit2");
  write(other, "DURUM.md", "# Durum\n");
  git(other, "add", "DURUM.md");
  git(other, "-c", "user.email=o@test", "-c", "user.name=O", "commit", "-q", "-m", "records");
  git(other, "push", "-q", "origin", "coord/kayit2");
  assert.equal(git(w.repo, "branch", "-a", "--list", "*coord/kayit2*"), ""); // not fetched yet
  const r = run(w.ctx, []);
  assert.equal(r.code, 0, text(r));
  assert.deepEqual(state().included.map((b) => b.name), ["coord/kayit2"]);
});
