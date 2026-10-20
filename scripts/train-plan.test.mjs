#!/usr/bin/env node
// TREN-ARACI: scripts/train.mjs plan and build, in the throwaway world of train-test-world.mjs.
// Run: node --test scripts/train-plan.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { plan, build, fingerprint, headerHash, git, write, commit, auditLines, STAMP, ID, text, refs, state, subjects, w } from "./train-test-world.mjs";

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

test("plan: a branch that edits a migration already on main stops the train; one that deletes it is a warning", () => {
  w.branch("task/edit", ["edit base", { "supabase/migrations/20260101000000_base.sql": "create table base(id int, x int);\n" }]);
  git(w.repo, "checkout", "-q", "-b", "task/rename", "origin/main");
  git(w.repo, "rm", "-q", "supabase/migrations/20260101000000_base.sql");
  write(w.repo, "supabase/migrations/20260101000001_base.sql", "create table base(id int);\n");
  commit(w.repo, "base takes its live number");
  git(w.repo, "checkout", "-q", "main");
  const r = plan(w.ctx, ["task/edit", "task/rename"]);
  assert.equal(r.code, 1);
  assert.match(text(r), /ENGEL: task\/edit: main'deki göç değişiyor: 20260101000000_base\.sql \(uygulanmış göç değişmez; düzeltme yeni göçle\)/);
  assert.match(text(r), /UYARI: task\/rename: main'deki göç siliniyor: 20260101000000_base\.sql \(canlı numarasına yeniden adlandırma mı\? kontrol et\)/);
  assert.doesNotMatch(text(r), /ENGEL: task\/rename/);
});

test("plan: a migration file name that is not <14 digits>_<name>.sql stops the train", () => {
  w.branch("task/bad", ["bad name", { "supabase/migrations/2026_oops.sql": "select 1;\n" }]);
  const r = plan(w.ctx, ["task/bad"]);
  assert.equal(r.code, 1);
  assert.match(text(r), /ENGEL: task\/bad: göç adı geçersiz: 2026_oops\.sql/);
});

test("plan: a merge commit on a branch stops the train (it would be dropped without a word)", () => {
  w.branch("task/side", ["side", { "docs/side.md": "s\n" }]);
  w.branch("task/merged", ["own", { "docs/own.md": "o\n" }]);
  git(w.repo, "checkout", "-q", "task/merged");
  git(w.repo, "merge", "-q", "--no-ff", "-m", "merge side", "task/side");
  git(w.repo, "checkout", "-q", "main");
  const r = plan(w.ctx, ["task/merged"]);
  assert.equal(r.code, 1);
  assert.match(text(r), /ENGEL: task\/merged: birleştirme commit'i var/);
});

test("plan: a migration whose commit already shipped (a branch not rebased since) is not counted twice", () => {
  const sha = w.branch("task/half", ["m1", { "supabase/migrations/20261008020000_m1.sql": "select 1;\n" }], ["docs", { "docs/half.md": "h\n" }]);
  git(w.repo, "cherry-pick", `${sha}~1`); // the first train carried m1
  git(w.repo, "push", "-q", "origin", "HEAD:main");
  const r = plan(w.ctx, ["task/half"]);
  assert.equal(r.code, 0, text(r));
  assert.match(text(r), /task\/half: girer, 1 commit/);
  assert.doesNotMatch(text(r), /iki kez/);
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

test("plan: a task branch whose own commits touch a record file stops the train; coord/kayit2 does not", () => {
  w.branch("task/rec", ["code", { "docs/a.md": "a\n" }], ["records too", { "docs/plan/KARARLAR.md": "# Kararlar\n" }]);
  const r = plan(w.ctx, ["task/rec"]);
  assert.equal(r.code, 1, text(r));
  assert.match(text(r), /ENGEL: task\/rec: kayıt dosyasına dokunuyor: docs\/plan\/KARARLAR\.md; kayıtları yalnız koordinatör yazar \(CLAUDE\.md §6\)/);
  const e = auditLines().at(-1);
  assert.equal(e.event, "train-blocked");
  assert.equal(e.step, "plan");
  w.branch("coord/kayit2", ["records", { "docs/plan/KARARLAR.md": "# Kararlar\n", "DURUM.md": "# Durum\n" }]);
  const c = plan(w.ctx, ["coord/kayit2"]);
  assert.equal(c.code, 0, text(c));
  assert.doesNotMatch(text(c), /kayıt dosyasına dokunuyor/);
});

test("plan: a task branch adding a quarantine line stops the train; coord/kayit2 carries it (S-106)", () => {
  const line = "employee hub tomorrow | BL-1 | 2026-10-08 | 2026-10-09\n";
  w.branch("task/kq", ["quarantine", { "e2e/karantina.txt": line }]);
  const r = plan(w.ctx, ["task/kq"]);
  assert.equal(r.code, 1, text(r));
  assert.match(text(r), /ENGEL: task\/kq: kayıt dosyasına dokunuyor: e2e\/karantina\.txt/);
  w.branch("coord/kayit2", ["quarantine", { "e2e/karantina.txt": line }]);
  const c = plan(w.ctx, ["coord/kayit2"]);
  assert.equal(c.code, 0, text(c));
  assert.doesNotMatch(text(c), /kayıt dosyasına dokunuyor/);
});

// A records commit that a train already carried, but whose context changed on main first: `git cherry` sees a
// different patch and calls it new, and replaying it clashes (TREN-KAYIT-ATLA). `landedTwin` puts the train's copy
// on main (same author, date and message, as copyCommit keeps them; other context) and one new commit on the branch.
function landedTwin(name) {
  const old = w.branch(name, ["records: four", { "README.md": "one\ntwo\nthree\nfour\n" }]);
  write(w.repo, "README.md", "one\ntwo\nTHREE\n");
  commit(w.repo, "main: three in capitals");
  write(w.repo, "README.md", "one\ntwo\nTHREE\nfour\n");
  git(w.repo, "add", "-A");
  // the train's copy, made as copyCommit makes it: commit-tree fed `%B`, which leaves one more trailing newline
  const [author, email, date] = git(w.repo, "log", "-1", "--format=%an%x00%ae%x00%aI", old).split("\0");
  const copy = execFileSync("git", ["-C", w.repo, "commit-tree", git(w.repo, "write-tree"), "-p", "HEAD", "-F", "-"], {
    encoding: "utf8",
    input: execFileSync("git", ["-C", w.repo, "log", "-1", "--format=%B", old], { encoding: "utf8" }),
    env: { ...process.env, GIT_AUTHOR_NAME: author, GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date },
  }).trim();
  git(w.repo, "update-ref", "refs/heads/main", copy); // main is checked out and its index already holds this tree
  git(w.repo, "push", "-q", "origin", "HEAD:main");
  git(w.repo, "checkout", "-q", name);
  write(w.repo, "docs/next.md", "next\n");
  commit(w.repo, "records: next");
  git(w.repo, "checkout", "-q", "main");
  assert.match(git(w.repo, "cherry", "origin/main", name), new RegExp(`^\\+ ${old}`)); // the patch differs
  return old;
}

test("plan: a coord/kayit2 commit main already carries under another context is left out and named; the new one rides", () => {
  const old = landedTwin("coord/kayit2");
  const r = plan(w.ctx, ["coord/kayit2"]);
  assert.equal(r.code, 0, text(r));
  assert.match(text(r), new RegExp(`coord/kayit2: zaten main'de \\(kopyası main'de\\): ${old.slice(0, 8)} = main @\\w{8}`));
  assert.match(text(r), /coord\/kayit2: girer, 1 commit/);
  assert.equal(r.sim.results[0].commits.length, 1);
});

test("plan: coord/kayit2 holding only commits main already carries is already on main", () => {
  landedTwin("coord/kayit2");
  git(w.repo, "branch", "-f", "coord/kayit2", "coord/kayit2~1");
  const r = plan(w.ctx, ["coord/kayit2"]);
  assert.equal(r.code, 0, text(r));
  assert.match(text(r), /^coord\/kayit2: zaten main'de$/m);
  assert.deepEqual(r.order, []);
});

test("plan: a task branch is not let off by a copy on main; its commit is replayed as before", () => {
  landedTwin("task/w");
  const r = plan(w.ctx, ["task/w"]);
  assert.equal(r.code, 2, text(r));
  assert.match(text(r), /task\/w: ATLANIR, çakışma: README\.md, 2 commit/);
  assert.doesNotMatch(text(r), /kopyası main'de/);
});

test("plan: NF_OVERRIDE passes a branch touching a record file, and the pass is logged", () => {
  w.branch("task/rec", ["records", { "DURUM.md": "# Durum\n" }]);
  const r = plan({ ...w.ctx, override: "Mert kayıt düzeltmesini işçiye verdi" }, ["task/rec"]);
  assert.equal(r.code, 0, text(r));
  assert.match(text(r), /AŞILDI \(NF_OVERRIDE\): task\/rec: kayıt dosyasına dokunuyor: DURUM\.md/);
  const e = auditLines().at(-1);
  assert.equal(e.event, "train-override");
  assert.equal(e.reason, "Mert kayıt düzeltmesini işçiye verdi");
  assert.match(e.blocker, /kayıt dosyasına dokunuyor: DURUM\.md/);
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
