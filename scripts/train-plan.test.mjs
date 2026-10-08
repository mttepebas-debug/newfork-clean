#!/usr/bin/env node
// TREN-ARACI: scripts/train.mjs plan and build, in the throwaway world of train-test-world.mjs.
// Run: node --test scripts/train-plan.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { plan, build, fingerprint, headerHash, git, write, commit, STAMP, ID, text, refs, state, subjects, w } from "./train-test-world.mjs";

// ---- plan ----

test("plan: branches without migrations first in the given order, then by smallest migration; a shipped branch is named", () => {
  w.branch("task/mig-b", ["b: migration", { "supabase/migrations/20261008030000_b.sql": "create table b(id int);\n" }]);
  w.branch("task/docs", ["docs: note", { "docs/a.md": "a\n" }]);
  w.branch("task/mig-a", ["a: migration", { "supabase/migrations/20261008020000_a.sql": "create table a(id int);\n" }]);
  git(w.repo, "branch", "task/old", "origin/main");
  git(w.repo, "push", "-q", "origin", "task/mig-b", "task/docs", "task/mig-a", "task/old");
  // a local commit nobody pushed: the train takes what the session pushed
  git(w.repo, "checkout", "-q", "task/docs");
  write(w.repo, "docs/local.md", "not pushed\n");
  commit(w.repo, "docs: local only");
  git(w.repo, "checkout", "-q", "main");
  const r = plan(w.ctx, ["task/mig-b", "task/docs", "task/mig-a", "task/old"]);
  assert.equal(r.code, 0, text(r));
  assert.deepEqual(r.order, ["task/docs", "task/mig-a", "task/mig-b"]);
  assert.match(text(r), /task\/old: zaten main'de/);
  assert.match(text(r), /task\/docs: girer, 1 commit/);
});

test("plan: <branch>@<sha> takes that commit and says when the branch has moved on", () => {
  const first = w.branch("task/a", ["a: first", { "docs/a.md": "a\n" }]);
  git(w.repo, "checkout", "-q", "task/a");
  write(w.repo, "docs/a.md", "a2\n");
  commit(w.repo, "a: later");
  git(w.repo, "checkout", "-q", "main");
  const r = plan(w.ctx, [`task/a@${first.slice(0, 8)}`]);
  assert.equal(r.code, 0, text(r));
  assert.match(text(r), /task\/a: girer, 1 commit/);
  assert.match(text(r), new RegExp(`UYARI: task/a: dal @\\w{8}'a ilerlemiş; tren @${first.slice(0, 8)}'yı alıyor`));
});

test("plan: the same migration number on two branches stops the train", () => {
  w.branch("task/x", ["x", { "supabase/migrations/20261008020000_x.sql": "select 1;\n" }]);
  w.branch("task/y", ["y", { "supabase/migrations/20261008020000_y.sql": "select 2;\n" }]);
  const r = plan(w.ctx, ["task/x", "task/y"]);
  assert.equal(r.code, 1);
  assert.match(text(r), /ENGEL: 20261008020000 iki kez/);
});

test("plan: a missing branch stops the train", () => {
  const r = plan(w.ctx, ["task/nope"]);
  assert.equal(r.code, 1);
  assert.match(text(r), /ENGEL: task\/nope bulunamadı/);
});

test("plan: a migration below main's last one is a warning, not a stop", () => {
  w.branch("task/late", ["late", { "supabase/migrations/20251231000000_late.sql": "select 1;\n" }]);
  const r = plan(w.ctx, ["task/late"]);
  assert.equal(r.code, 0, text(r));
  assert.match(text(r), /20251231000000_late\.sql sırasız: canlıya bu sırayla mı girdi\? kontrol et/);
});

test("plan: foresees a conflict (branch skipped, exit 2) and a schema.sql-only clash (rebuilt), touching nothing", () => {
  w.branch("task/one", ["one", { "README.md": "one\nTWO-a\nthree\n" }]);
  w.branch("task/two", ["two", { "README.md": "one\nTWO-b\nthree\n" }]);
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "select 1;\n" }]);
  w.branch("task/m2", ["m2", { "supabase/migrations/20261008030000_m2.sql": "select 2;\n" }]);
  git(w.repo, "fetch", "-q", "origin"); // the one thing plan may change
  const before = refs(w.repo);
  const r = plan(w.ctx, ["task/one", "task/two", "task/m1", "task/m2"]);
  assert.equal(r.code, 2, text(r));
  assert.match(text(r), /task\/two: ATLANIR, çakışma: README\.md/);
  assert.match(text(r), /task\/m2: girer \(schema\.sql yeniden üretilecek\)/);
  assert.equal(refs(w.repo), before);
  assert.equal(fs.existsSync(w.ctx.trainDir), false);
});

// ---- build ----

test("build: train/<stamp> from origin/main carries each branch's commits in order, author and message kept", () => {
  w.branch("task/a", ["a: first", { "docs/a.md": "a\n" }], ["a: second", { "docs/a.md": "a2\n" }]);
  w.branch("task/b", ["b: only", { "docs/b.md": "b\n" }]);
  const r = build(w.ctx, ["task/b", "task/a"]);
  assert.equal(r.code, 0, text(r));
  const s = state();
  assert.equal(s.branch, `train/${STAMP}`);
  assert.equal(s.identity, ID);
  assert.equal(s.base, git(w.repo, "rev-parse", "origin/main"));
  assert.deepEqual(subjects(s.branch), ["b: only", "a: first", "a: second"]);
  assert.equal(git(w.repo, "log", "-1", "--format=%an <%ae>", s.branch), "Ada <ada@test>");
  assert.equal(git(w.ctx.trainDir, "rev-parse", "HEAD"), s.head);
  assert.equal(w.calls.dbSchema.length, 0); // the one migration-free snapshot still matches
});

test("build: a schema.sql-only clash keeps the train's file and regenerates it once at the end", () => {
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "select 1;\n" }]);
  w.branch("task/m2", ["m2", { "supabase/migrations/20261008030000_m2.sql": "select 2;\n" }]);
  const r = build(w.ctx, ["task/m1", "task/m2"]);
  assert.equal(r.code, 0, text(r));
  const s = state();
  assert.deepEqual(w.calls.dbSchema, [w.ctx.trainDir]);
  assert.deepEqual(subjects(s.branch), ["m1", "m2", `chore(db): schema snapshot for train/${STAMP} (TREN)`]);
  const schema = fs.readFileSync(path.join(w.ctx.trainDir, "supabase/schema.sql"), "utf8");
  assert.equal(headerHash(schema), fingerprint(path.join(w.ctx.trainDir, "supabase/migrations")).hash);
  assert.deepEqual(s.newMigrations, ["20261008020000_m1.sql", "20261008030000_m2.sql"]);
});

test("build: any other conflict leaves out every commit of that branch and keeps the rest of the train", () => {
  w.branch("task/one", ["one", { "README.md": "one\nTWO-a\nthree\n" }]);
  w.branch("task/two", ["two: clean first", { "docs/two.md": "2\n" }], ["two: clashes", { "README.md": "one\nTWO-b\nthree\n" }]);
  w.branch("task/three", ["three", { "docs/three.md": "3\n" }]);
  const r = build(w.ctx, ["task/one", "task/two", "task/three"]);
  assert.equal(r.code, 2, text(r));
  const s = state();
  assert.deepEqual(subjects(s.branch), ["one", "three"]);
  assert.deepEqual(s.skipped, [{ name: "task/two", files: ["README.md"] }]);
  assert.equal(fs.existsSync(path.join(w.ctx.trainDir, "docs/two.md")), false);
});

test("build: a dirty train folder stops before anything moves", () => {
  w.branch("task/a", ["a", { "docs/a.md": "a\n" }]);
  assert.equal(build(w.ctx, ["task/a"]).code, 0);
  const head = git(w.ctx.trainDir, "rev-parse", "HEAD");
  write(w.ctx.trainDir, "README.md", "edited by hand\n");
  w.branch("task/b", ["b", { "docs/b.md": "b\n" }]);
  const r = build({ ...w.ctx, now: () => new Date("2026-10-08T11:00:00Z") }, ["task/b"]);
  assert.equal(r.code, 1);
  assert.match(text(r), /tren klasörü temiz değil/);
  assert.equal(git(w.ctx.trainDir, "rev-parse", "HEAD"), head);
});
