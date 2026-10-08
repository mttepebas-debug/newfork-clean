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
function world() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "newfork-wt-"));
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

test("new job: task/<id> from origin/main, install then the libs, local env copied", () => {
  const w = world();
  const r = prepare("BL-1", { cwd: w.repo, mainDir: w.mainDir, pnpm: w.pnpm });
  assert.equal(r.code, 0, r.message);
  assert.equal(git(w.repo, "branch", "--show-current"), "task/bl-1");
  assert.equal(git(w.repo, "rev-parse", "HEAD"), git(w.repo, "rev-parse", "origin/main"));
  assert.deepEqual(w.calls, ["install --frozen-lockfile", "--filter @newfork/shared --filter @newfork/ui build"]);
  assert.equal(fs.readFileSync(path.join(w.repo, "apps/api/.env.local"), "utf8"), "LOCAL=1\n");
  assert.match(r.message, /origin\/main/);
});

test("continuing job: an existing origin/task/<id> is checked out with its commits", () => {
  const w = world();
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

test("a dirty worktree stops before anything; a red install names the step", () => {
  const w = world();
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
