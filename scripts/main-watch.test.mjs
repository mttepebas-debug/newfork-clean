#!/usr/bin/env node
// WORKFLOW-V2 (D3): scripts/main-watch.mjs. The pure check on made-up shas, then the CLI on a throwaway repo
// with a local bare origin and a temp audit.log: never the real .newfork-inbox or GitHub.
// Run: node --test scripts/main-watch.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { foreignCommits, readTrainPushes, pickSince } from "./main-watch.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "main-watch.mjs");

// A linear history a <- b <- c <- d <- e; "x is ancestor-or-equal of y" when x comes no later than y.
const order = ["a", "b", "c", "d", "e"];
const isAncestor = (x, y) => order.includes(x) && order.includes(y) && order.indexOf(x) <= order.indexOf(y);
const c = (sha) => ({ sha, subject: `s-${sha}` });

test("foreignCommits: every commit a train push brought is clean", () => {
  const revList = [c("e"), c("d"), c("c"), c("b")];
  const trainPushes = [
    { before: "a", after: "c" },
    { before: "c", after: "e" },
  ];
  assert.deepEqual(foreignCommits({ revList, trainPushes, isAncestor }), []);
});

test("foreignCommits: a commit after the last train push is foreign", () => {
  const revList = [c("e"), c("d"), c("c"), c("b")];
  const trainPushes = [{ before: "a", after: "c" }];
  assert.deepEqual(foreignCommits({ revList, trainPushes, isAncestor }), [c("e"), c("d")]);
});

test("foreignCommits: a direct commit a later train built on top of is still foreign", () => {
  // b..c came by train; d was pushed straight to main; the next train started from d and brought e
  const revList = [c("e"), c("d"), c("c"), c("b")];
  const trainPushes = [
    { before: "a", after: "c" },
    { before: "d", after: "e" },
  ];
  assert.deepEqual(foreignCommits({ revList, trainPushes, isAncestor }), [c("d")]);
});

test("foreignCommits: no train push means every commit is foreign", () => {
  assert.deepEqual(foreignCommits({ revList: [c("b")], trainPushes: [], isAncestor }), [c("b")]);
});

test("readTrainPushes: only train-push lines, in log order; failed pushes and bad lines are skipped", () => {
  const text = [
    JSON.stringify({ event: "train-push", before: "a", after: "c" }),
    "not json",
    JSON.stringify({ event: "train-push-failed", before: "c", after: "z" }),
    JSON.stringify({ event: "guard", command: "git status" }),
    JSON.stringify({ event: "train-push", before: "c", after: "e" }),
    "",
  ].join("\n");
  assert.deepEqual(readTrainPushes(text), [
    { before: "a", after: "c" },
    { before: "c", after: "e" },
  ]);
});

test("pickSince: the oldest train push's before, or --since; pushes from the one that starts at it", () => {
  const pushes = [
    { before: "a", after: "c" },
    { before: "c", after: "e" },
  ];
  assert.deepEqual(pickSince(pushes, null), { since: "a", pushes });
  assert.deepEqual(pickSince(pushes, "c"), { since: "c", pushes: [pushes[1]] });
  assert.deepEqual(pickSince(pushes, "zzz"), { since: "zzz", pushes }); // unknown to the log: every push counts
  assert.deepEqual(pickSince([], null), { since: null, pushes: [] });
});

// --- CLI on a temp repo ---

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();

function world() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "newfork-main-watch-"));
  const origin = path.join(root, "origin.git");
  const repo = path.join(root, "repo");
  const inbox = path.join(root, "inbox");
  fs.mkdirSync(inbox);
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  execFileSync("git", ["clone", "-q", origin, repo], { stdio: "ignore" });
  git(repo, "config", "user.email", "t@test");
  git(repo, "config", "user.name", "T");
  git(repo, "checkout", "-q", "-B", "main");
  const commit = (subject) => {
    fs.appendFileSync(path.join(repo, "f.txt"), `${subject}\n`);
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", subject);
    return git(repo, "rev-parse", "HEAD");
  };
  const pushMain = () => git(repo, "push", "-q", "origin", "HEAD:refs/heads/main");
  const log = (entries) =>
    fs.writeFileSync(path.join(inbox, "audit.log"), entries.map((e) => JSON.stringify({ at: "2026-10-08T10:00:00Z", ...e })).join("\n") + "\n");
  // a train push as train.mjs records it: origin/main before, the train tip after
  const trainPush = (subjects) => {
    const before = git(repo, "rev-parse", "HEAD");
    for (const s of subjects) commit(s);
    pushMain();
    return { event: "train-push", before, after: git(repo, "rev-parse", "HEAD"), branch: "koordinator/tren-x" };
  };
  const run = (...args) => {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: repo, encoding: "utf8", env: { ...process.env, NEWFORK_INBOX_DIR: inbox } });
    return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
  };
  const base = commit("base");
  pushMain();
  return { repo, base, commit, pushMain, log, trainPush, run };
}

test("CLI: only train pushes on main → 'main temiz', exit 0", () => {
  const w = world();
  const p1 = w.trainPush(["feat: one", "feat: two"]);
  const p2 = w.trainPush(["fix: three"]);
  w.log([p1, { event: "guard", command: "git status" }, p2]);
  const r = w.run();
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /^main temiz/m);
});

test("CLI: a commit pushed straight to main → one 🔴 line with sha and subject, exit 1", () => {
  const w = world();
  const p1 = w.trainPush(["feat: one"]);
  const sha = w.commit("hotfix: elle");
  w.pushMain();
  w.log([p1]);
  const r = w.run();
  assert.equal(r.code, 1, r.out + r.err);
  assert.deepEqual(r.out.split("\n"), [`🔴 trenden geçmemiş commit: ${sha.slice(0, 8)} hotfix: elle`]);
});

test("CLI: a direct commit a later train built on is still caught; a failed push does not cover it", () => {
  const w = world();
  const p1 = w.trainPush(["feat: one"]);
  const sha = w.commit("direct: elle");
  w.pushMain();
  const failed = { event: "train-push-failed", before: p1.after, after: sha };
  const p2 = w.trainPush(["feat: two"]);
  w.log([p1, failed, p2]);
  const r = w.run();
  assert.equal(r.code, 1, r.out + r.err);
  assert.deepEqual(r.out.split("\n"), [`🔴 trenden geçmemiş commit: ${sha.slice(0, 8)} direct: elle`]);
});

test("CLI: --since <sha> starts after a commit Mert already knows of", () => {
  const w = world();
  const p1 = w.trainPush(["feat: one"]);
  w.commit("direct: bilinen");
  w.pushMain();
  const known = git(w.repo, "rev-parse", "HEAD");
  const p2 = w.trainPush(["feat: two"]);
  w.log([p1, p2]);
  assert.equal(w.run().code, 1);
  const r = w.run("--since", known);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /^main temiz/m);
});

test("CLI: no train push in audit.log and no --since → says so, exit 2", () => {
  const w = world();
  w.log([{ event: "guard", command: "git status" }]);
  const r = w.run();
  assert.equal(r.code, 2);
  assert.match(r.out + r.err, /train-push yok/);
});

test("CLI: no audit.log at all → exit 2, not a crash", () => {
  const w = world();
  const r = w.run();
  assert.equal(r.code, 2);
  assert.match(r.out + r.err, /train-push yok/);
});
