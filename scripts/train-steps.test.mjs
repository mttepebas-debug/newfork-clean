#!/usr/bin/env node
// TREN-ARACI: scripts/train.mjs apply-local, gate and push, in the throwaway world of train-test-world.mjs.
// Run: node --test scripts/train-steps.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build, applyLocal, gate, push, take, git, write, commit, auditLines, lock, md5, STAMP, ID, text, state, built, gated, w } from "./train-test-world.mjs";

// ---- apply-local ----

test("apply-local: takes and keeps db.lock (never main.lock), applies new migrations in number order with their ledger rows", () => {
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
  assert.equal(lock("db").identity, ID);
  assert.equal(lock("main").free, true);
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

// ---- gate ----

test("gate: runs every step in the train folder, keeps heavy.lock for the push, lets db.lock go", () => {
  w.branch("task/a", ["a", { "docs/a.md": "a\n" }]);
  built("task/a");
  const r = gate(w.ctx, { e2e: ["e2e/a.spec.ts", "e2e/b.spec.ts"] });
  assert.equal(r.code, 0, text(r));
  assert.deepEqual(
    w.calls.pnpm.map((c) => c.args.join(" ")),
    [
      "install --frozen-lockfile",
      "--filter @newfork/shared --filter @newfork/ui build",
      "lint",
      "typecheck",
      "test",
      "build",
      "test:db",
      "e2e e2e/a.spec.ts e2e/b.spec.ts",
    ],
  );
  assert.ok(w.calls.pnpm.every((c) => c.cwd === w.ctx.trainDir));
  assert.equal(lock("db").free, true);
  assert.equal(lock("heavy").identity, ID);
  assert.deepEqual({ ok: state().gate.ok, head: state().gate.head }, { ok: true, head: state().head });
});

test("gate: stops at the first red step, names its log, and lets db.lock and heavy.lock go", () => {
  w.branch("task/a", ["a", { "docs/a.md": "a\n" }]);
  built("task/a");
  w.redStep = "typecheck";
  const r = gate(w.ctx, {});
  assert.equal(r.code, 1);
  assert.deepEqual(w.calls.pnpm.map((c) => c.args[0]).slice(-1), ["typecheck"]);
  assert.match(text(r), /typecheck: kırmızı \(çıkış 1\), log: .*gate-typecheck\.log/);
  assert.equal(lock("db").free, true);
  assert.equal(lock("heavy").free, true);
  assert.equal(state().gate.ok, false);
});

test("gate: an uncommitted change in the train folder stops it before any step, override or not", () => {
  w.branch("task/a", ["a", { "docs/a.md": "a\n" }]);
  built("task/a");
  write(w.ctx.trainDir, "docs/a.md", "edited, not committed\n");
  const r = gate({ ...w.ctx, override: "an override does not pass this" }, {});
  assert.equal(r.code, 1);
  assert.match(text(r), /DUR: tren klasörü temiz değil/);
  assert.equal(w.calls.pnpm.length, 0);
  assert.equal(lock("heavy").free, true);
});

test("gate: a step that leaves the train folder changed turns the gate red", () => {
  w.branch("task/a", ["a", { "docs/a.md": "a\n" }]);
  built("task/a");
  const pnpm = w.ctx.exec.pnpm;
  const exec = {
    ...w.ctx.exec,
    pnpm(args, o) {
      if (args[0] === "build") write(w.ctx.trainDir, "docs/a.md", "rewritten by a step\n");
      return pnpm(args, o);
    },
  };
  const r = gate({ ...w.ctx, exec }, {});
  assert.equal(r.code, 1);
  assert.match(text(r), /kapı bitti ama tren klasörü değişti/);
  assert.equal(state().gate.ok, false);
});

test("gate: a running CI stops it before any step; NF_OVERRIDE runs it and is logged", () => {
  w.branch("task/a", ["a", { "docs/a.md": "a\n" }]);
  built("task/a");
  process.env.NEWFORK_CI_STATE = "running";
  const r = gate(w.ctx, {});
  assert.equal(r.code, 1);
  assert.match(text(r), /CI koşuyor/);
  assert.equal(w.calls.pnpm.length, 0);
  const o = gate({ ...w.ctx, override: "CI is the docs-only run" }, {});
  assert.equal(o.code, 0, text(o));
  assert.equal(auditLines().find((l) => l.event === "train-override").step, "gate");
});

test("gate: another session's heavy.lock stops it", () => {
  w.branch("task/a", ["a", { "docs/a.md": "a\n" }]);
  built("task/a");
  take("heavy", "oturum/ekran-02, e2e");
  const r = gate(w.ctx, {});
  assert.equal(r.code, 1);
  assert.match(text(r), /heavy\.lock başka kimlikte: oturum\/ekran-02/);
  assert.equal(w.calls.pnpm.length, 0);
});

// ---- push ----

test("push: takes main.lock, fast-forwards origin main to the train, lets main and heavy go, logs the push", () => {
  w.branch("task/a", ["a", { "docs/a.md": "a\n" }]);
  gated("task/a");
  const before = git(w.repo, "rev-parse", "origin/main");
  const r = push(w.ctx);
  assert.equal(r.code, 0, text(r));
  assert.equal(git(w.origin, "rev-parse", "main"), state().head);
  assert.equal(lock("main").free, true);
  assert.equal(lock("heavy").free, true);
  const p = auditLines().find((l) => l.event === "train-push");
  assert.deepEqual({ before: p.before, after: p.after, branch: p.branch, tool: p.tool }, { before, after: state().head, branch: `train/${STAMP}`, tool: "train" });
});

test("push: main moved since the build is refused (no force), main.lock let go", () => {
  w.branch("task/a", ["a", { "docs/a.md": "a\n" }]);
  gated("task/a");
  write(w.repo, "docs/elsewhere.md", "x\n");
  commit(w.repo, "someone else on main");
  git(w.repo, "push", "-q", "origin", "HEAD:main");
  const moved = git(w.origin, "rev-parse", "main");
  const r = push({ ...w.ctx, override: "even with an override" });
  assert.equal(r.code, 1);
  assert.match(text(r), /main ilerledi, yeniden build/);
  assert.equal(git(w.origin, "rev-parse", "main"), moved);
  assert.equal(lock("main").free, true);
});

test("push: another identity's main.lock is refused; origin main and that lock stay", () => {
  w.branch("task/a", ["a", { "docs/a.md": "a\n" }]);
  gated("task/a");
  take("main", "oturum/eski, elle push");
  const before = git(w.origin, "rev-parse", "main");
  const r = push(w.ctx);
  assert.equal(r.code, 1);
  assert.match(text(r), /main\.lock başka kimlikte: oturum\/eski/);
  assert.equal(git(w.origin, "rev-parse", "main"), before);
  assert.equal(lock("main").identity, "oturum/eski");
});

test("push: passing another identity's main.lock with NF_OVERRIDE first saves origin main under refs/nf-backup/main/", () => {
  w.branch("task/a", ["a", { "docs/a.md": "a\n" }]);
  gated("task/a");
  take("main", "oturum/eski, elle push");
  const before = git(w.origin, "rev-parse", "main");
  const r = push({ ...w.ctx, override: "the old lock is from a dead session" });
  assert.equal(r.code, 0, text(r));
  const [ref, sha] = git(w.repo, "for-each-ref", "--format=%(refname) %(objectname)", "refs/nf-backup/main/").split(" ");
  assert.match(ref, /^refs\/nf-backup\/main\//);
  assert.equal(sha, before);
  const o = auditLines().find((l) => l.event === "train-override" && l.step === "push");
  assert.equal(o.backup, ref);
  assert.equal(lock("main").identity, "oturum/eski"); // never someone else's lock to delete
});

test("push: heavy.lock held by another identity is refused", () => {
  w.branch("task/a", ["a", { "docs/a.md": "a\n" }]);
  built("task/a");
  gate(w.ctx, {});
  fs.rmSync(path.join(process.env.NEWFORK_LOCK_DIR, "heavy.lock"));
  take("heavy", "oturum/ekran-02, e2e");
  const before = git(w.origin, "rev-parse", "main");
  const r = push(w.ctx);
  assert.equal(r.code, 1);
  assert.match(text(r), /heavy\.lock başka kimlikte: oturum\/ekran-02/);
  assert.equal(git(w.origin, "rev-parse", "main"), before);
});

test("push: a train head the gate did not run on is refused", () => {
  w.branch("task/a", ["a", { "docs/a.md": "a\n" }]);
  gated("task/a");
  write(w.ctx.trainDir, "docs/late.md", "late\n");
  commit(w.ctx.trainDir, "a fix after the gate");
  const before = git(w.origin, "rev-parse", "main");
  const r = push(w.ctx);
  assert.equal(r.code, 1);
  assert.match(text(r), /kapı bu sha'da koşmadı/);
  assert.equal(git(w.origin, "rev-parse", "main"), before);
});
