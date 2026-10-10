// Vercel builds only main (2026-10-09: ~120 backup branch pushes used up the free plan's daily
// deployments, and main 8151ba9d was not deployed). Vercel reads git.deploymentEnabled with
// minimatch patterns; a branch deploys when no rule matches it or when any matching rule is true.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

function deploys(branch) {
  const rules = config.git?.deploymentEnabled;
  if (typeof rules === "boolean") return rules;
  if (!rules) return true;
  const matching = Object.entries(rules).filter(([pattern]) => path.matchesGlob(branch, pattern));
  return matching.length === 0 || matching.some(([, enabled]) => enabled === true);
}

test("vercel: main deploys", () => {
  assert.equal(deploys("main"), true);
});

test("vercel: no other branch deploys, flat or nested", () => {
  for (const branch of [
    "train/20261009T1054Z",
    "task/ekran-02-kurtarma",
    "backup/oturum-ozetleri",
    "backup/uncommitted/task/bl-990-w2",
    "archive/ekran-01-undo",
    "claude/project-thread-jcgonw",
    "coord/kayit",
    "coord/kayit2",
    "ghost-color-mockups",
    "worktree-agent-a3704c99d8da9a816",
  ]) {
    assert.equal(deploys(branch), false, branch);
  }
});
