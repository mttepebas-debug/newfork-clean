#!/usr/bin/env node
// WORKFLOW-V2: scripts/wt-hazirla.mjs against a throwaway repo with a local bare origin. Never the real main folder.
// Run: node --test scripts/wt-hazirla.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { prepare, branchOf } from "./wt-hazirla.mjs";

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
function world(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "newfork-wt-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const origin = path.join(root, "origin.git");
  const repo = path.join(root, "repo");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  execFileSync("git", ["clone", "-q", origin, repo], { stdio: "ignore" });
  git(repo, "config", "user.email", "t@t");
  git(repo, "config", "user.name", "t");
  git(repo, "checkout", "-q", "-B", "main");
  fs.writeFileSync(path.join(repo, "README.md"), "x\n");
  git(repo, "add", "README.md");
  git(repo, "commit", "-q", "-m", "init");
  git(repo, "push", "-q", "origin", "HEAD:main");
  const mainDir = path.join(root, "main");
  fs.mkdirSync(path.join(mainDir, "apps/api"), { recursive: true });
  fs.writeFileSync(path.join(mainDir, "apps/api/.env.local"), "LOCAL=1\n");
  const calls = [];
  const pnpm = (args, cwd) => {
    calls.push(args.join(" "));
    return 0;
  };
  return { root, origin, repo, mainDir, calls, pnpm };
}

test("branchOf: task/<id in lower case>; a bad id is refused", () => {
  assert.equal(branchOf("EKRAN-02"), "task/ekran-02");
  assert.throws(() => branchOf("../x"), /iş kimliği geçersiz/);
});

test("new job: task/<id> from origin/main, install then the libs, local env copied", (t) => {
  const w = world(t);
  const r = prepare("BL-1", { cwd: w.repo, mainDir: w.mainDir, pnpm: w.pnpm });
  assert.equal(r.code, 0, r.message);
  assert.equal(git(w.repo, "branch", "--show-current"), "task/bl-1");
  assert.equal(git(w.repo, "rev-parse", "HEAD"), git(w.repo, "rev-parse", "origin/main"));
  assert.throws(() => git(w.repo, "rev-parse", "--abbrev-ref", "task/bl-1@{upstream}"), "a new branch has no upstream");
  assert.deepEqual(w.calls, ["install --frozen-lockfile", "--filter @newfork/shared --filter @newfork/ui build"]);
  assert.equal(fs.readFileSync(path.join(w.repo, "apps/api/.env.local"), "utf8"), "LOCAL=1\n");
  assert.match(r.message, /origin\/main/);
});

test("continuing job: an existing origin/task/<id> is checked out with its commits", (t) => {
  const w = world(t);
  git(w.repo, "checkout", "-q", "-b", "task/bl-2");
  fs.writeFileSync(path.join(w.repo, "a.txt"), "a\n");
  git(w.repo, "add", "a.txt");
  git(w.repo, "commit", "-q", "-m", "a");
  git(w.repo, "push", "-q", "origin", "task/bl-2");
  const tip = git(w.repo, "rev-parse", "HEAD");
  const other = path.join(w.root, "other");
  execFileSync("git", ["clone", "-q", w.origin, other], { stdio: "ignore" });
  const r = prepare("BL-2", { cwd: other, mainDir: w.mainDir, pnpm: w.pnpm });
  assert.equal(r.code, 0, r.message);
  assert.equal(git(other, "rev-parse", "HEAD"), tip);
  assert.match(r.message, /devam/);
});

test("a dirty worktree stops before anything; a red install names the step", (t) => {
  const w = world(t);
  fs.writeFileSync(path.join(w.repo, "dirty.txt"), "x");
  const dirty = prepare("BL-3", { cwd: w.repo, mainDir: w.mainDir, pnpm: w.pnpm });
  assert.equal(dirty.code, 1);
  assert.match(dirty.message, /temiz değil/);
  assert.deepEqual(w.calls, []);
  fs.rmSync(path.join(w.repo, "dirty.txt"));
  const red = prepare("BL-3", { cwd: w.repo, mainDir: w.mainDir, pnpm: () => 1 });
  assert.equal(red.code, 1);
  assert.match(red.message, /pnpm install --frozen-lockfile kırmızı/);
});

test("continuing job: an existing local task/<id> not checked out anywhere is switched to", (t) => {
  const w = world(t);
  git(w.repo, "checkout", "-q", "-b", "task/bl-4");
  fs.writeFileSync(path.join(w.repo, "b.txt"), "b\n");
  git(w.repo, "add", "b.txt");
  git(w.repo, "commit", "-q", "-m", "b");
  const tip = git(w.repo, "rev-parse", "HEAD");
  git(w.repo, "checkout", "-q", "main");
  const r = prepare("BL-4", { cwd: w.repo, mainDir: w.mainDir, pnpm: w.pnpm });
  assert.equal(r.code, 0, r.message);
  assert.equal(git(w.repo, "branch", "--show-current"), "task/bl-4");
  assert.equal(git(w.repo, "rev-parse", "HEAD"), tip);
  assert.match(r.message, /yerel task\/bl-4 \(devam\)/);
});

test("task/<id> held by another worktree: refused without switching, names that worktree", (t) => {
  const w = world(t);
  git(w.repo, "branch", "task/bl-5");
  const held = path.join(w.root, "agent-old");
  git(w.repo, "worktree", "add", "-q", held, "task/bl-5");
  const r = prepare("BL-5", { cwd: w.repo, mainDir: w.mainDir, pnpm: w.pnpm });
  assert.equal(r.code, 1);
  assert.equal(r.branch, "task/bl-5");
  assert.match(r.message, /task\/bl-5 başka worktree'de açık: .*agent-old/);
  assert.equal(git(w.repo, "branch", "--show-current"), "main");
  assert.deepEqual(w.calls, []);
});

test("a failing git step returns code 1 with git's text instead of throwing", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "newfork-wt-nogit-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const calls = [];
  const r = prepare("BL-6", { cwd: dir, mainDir: dir, pnpm: (a) => (calls.push(a), 0) });
  assert.equal(r.code, 1);
  assert.match(r.message, /git status --porcelain kırmızı: .*not a git repository/i);
  assert.deepEqual(calls, []);
});
