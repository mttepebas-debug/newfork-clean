#!/usr/bin/env node
// PROJECT-GECIS (Mert, 2026-10-09): the lock, the train and the ops folder live on Mert's Windows PC only.
// On any other machine (a cloud thread, Linux) the C:/ defaults would land inside the repo as a "C:" folder,
// so lock.mjs and train.mjs refuse and OPS_DIR goes to the temp folder. NEWFORK_PLATFORM stands in for
// process.platform (tests only); the real lock, train and ops folders are never touched.
// Run: node --test scripts/pc-only.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

const boxes = [];
after(() => boxes.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

// A throwaway git repo as the working folder, and an env without the test-only folder overrides.
function sandbox(platform) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "nf-pc-only-"));
  boxes.push(cwd);
  execFileSync("git", ["init", "-q"], { cwd });
  const env = { ...process.env, NEWFORK_PLATFORM: platform };
  for (const k of ["NEWFORK_LOCK_DIR", "NEWFORK_TRAIN_DIR", "NEWFORK_INBOX_DIR"]) delete env[k];
  return { cwd, env };
}
const node = (args, { cwd, env }) => spawnSync(process.execPath, args, { cwd, env, encoding: "utf8" });

for (const [script, args] of [
  ["lock.mjs", ["run", "db", "--", "echo", "x"]],
  ["lock.mjs", ["status"]],
]) {
  test(`${script} ${args[0]}: off Mert's PC it refuses with exit 3 and opens no C: folder`, () => {
    const box = sandbox("linux");
    const r = node([path.join(DIR, script), ...args], box);
    assert.equal(r.status, 3, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /Remote Control/);
    assert.equal(fs.existsSync(path.join(box.cwd, "C:")), false);
  });
}

test("ops.mjs: OPS_DIR is under the temp folder off Mert's PC, the Codex folder on it", () => {
  const read = (platform) =>
    node(["--input-type=module", "-e", `import { OPS_DIR } from ${JSON.stringify(pathToFileURL(path.join(DIR, "ops.mjs")).href)}; console.log(OPS_DIR)`], sandbox(platform)).stdout.trim();
  assert.equal(read("linux"), path.join(os.tmpdir(), "newfork-ops"));
  assert.equal(read("win32"), "C:/Users/TheWe/Documents/Codex/.newfork-inbox");
});
