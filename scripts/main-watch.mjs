#!/usr/bin/env node
// WORKFLOW-V2 (D3, Mert 2026-10-08): the free main alarm. Main takes commits only from the train
// (scripts/train.mjs push, which records `train-push` with `before` and `after` in <OPS_DIR>/audit.log).
// The coordinator runs this every turn: each first-parent commit of <since>..origin/main must be one a train
// push brought, i.e. an ancestor-or-equal of that push's `after` and not of its `before`. The `before` half
// catches a commit pushed straight to main that a later train then built on top of.
// <since> = the oldest train push's `before`, or --since <sha> (a commit Mert already knows of).
// Run: node scripts/main-watch.mjs [--since <sha>]
//   exit 0 "main temiz" · exit 1 one "🔴 trenden geçmemiş commit: <sha> <subject>" line per commit
//   exit 2 nothing to measure from (no train push in audit.log and no --since)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { OPS_DIR } from "./ops.mjs";

// Pure: the commits of revList ({sha, subject}) no train push brought. isAncestor(x, y) is ancestor-or-equal.
export function foreignCommits({ revList, trainPushes, isAncestor }) {
  return revList.filter((c) => !trainPushes.some((p) => isAncestor(c.sha, p.after) && !(p.before && isAncestor(c.sha, p.before))));
}

// The train-push events of audit.log text, in log order (failed pushes and unreadable lines skipped).
export function readTrainPushes(text) {
  const out = [];
  for (const line of String(text).split("\n")) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e?.event === "train-push" && e.after) out.push({ before: e.before, after: e.after });
  }
  return out;
}

// <since> and the pushes recorded at or after it: with --since, from the first push that starts at it (all of
// them when the log never names it); without, the oldest push's before and every push.
export function pickSince(pushes, given) {
  if (given) {
    const i = pushes.findIndex((p) => p.before === given);
    return { since: given, pushes: i >= 0 ? pushes.slice(i) : pushes };
  }
  return { since: pushes[0]?.before ?? null, pushes };
}

const git = (cwd, args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function main(argv) {
  const cwd = process.cwd();
  const i = argv.indexOf("--since");
  const given = i >= 0 ? argv[i + 1] : null;
  if (i >= 0 && !given) {
    console.error("kullanım: node scripts/main-watch.mjs [--since <sha>]");
    return 2;
  }
  try {
    git(cwd, ["fetch", "-q", "origin"]);
  } catch {
    console.error("uyarı: git fetch başarısız; yerel origin/main ile bakıldı");
  }
  let text = "";
  try {
    text = fs.readFileSync(path.join(OPS_DIR, "audit.log"), "utf8");
  } catch {
    // no log yet: same as no train push
  }
  const { since, pushes } = pickSince(readTrainPushes(text), given);
  if (!since) {
    console.log(`main izlenemiyor: ${path.join(OPS_DIR, "audit.log")} içinde train-push yok; başlangıç için --since <sha> ver`);
    return 2;
  }
  let raw;
  try {
    raw = git(cwd, ["rev-list", "--first-parent", "--format=%H %s", "--no-commit-header", `${since}..origin/main`]);
  } catch (e) {
    console.log(`main izlenemiyor: ${since.slice(0, 8)}..origin/main okunamadı (${String(e.stderr ?? e.message).trim().split("\n")[0]})`);
    return 2;
  }
  const revList = raw
    .split("\n")
    .filter(Boolean)
    .map((l) => ({ sha: l.slice(0, 40), subject: l.slice(41) }));
  // x is ancestor-or-equal of y, for x inside since..main: x is in since..y (one rev-list per y, cached)
  const reach = new Map();
  const isAncestor = (x, y) => {
    if (x === y) return true;
    if (!reach.has(y)) {
      let set = new Set();
      try {
        set = new Set(git(cwd, ["rev-list", `${since}..${y}`]).split("\n").filter(Boolean));
      } catch {
        // a sha this clone does not have covers nothing
      }
      reach.set(y, set);
    }
    return reach.get(y).has(x);
  };
  const foreign = foreignCommits({ revList, trainPushes: pushes, isAncestor });
  if (!foreign.length) {
    console.log(`main temiz (${since.slice(0, 8)}..origin/main: ${revList.length} commit, ${pushes.length} tren gönderimi)`);
    return 0;
  }
  for (const c of foreign) console.log(`🔴 trenden geçmemiş commit: ${c.sha.slice(0, 8)} ${c.subject}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
