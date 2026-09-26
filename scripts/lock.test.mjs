#!/usr/bin/env node
// TEAM-001: red/green coverage for lock.mjs's atomicity and ownership
// checks. Runs against a throwaway temp directory (NEWFORK_LOCK_DIR) --
// never the real .newfork-locks folder.
// Run: node --test scripts/lock.test.mjs
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "newfork-lock-test-"));
process.env.NEWFORK_LOCK_DIR = tmpDir;

const { take, release, status } = await import("./lock.mjs");

beforeEach(() => {
  for (const f of ["db.lock", "main.lock"]) {
    fs.rmSync(path.join(tmpDir, f), { force: true });
  }
});

test("take is atomic: a second take on a held lock fails", () => {
  const first = take("db", "nf-test, verify atomic take");
  assert.equal(first.ok, true);

  const second = take("db", "nf-db, migration");
  assert.equal(second.ok, false);
  assert.match(second.message, /nf-test/);
});

test("release refuses when the caller isn't the owner", () => {
  take("db", "nf-test, verify release guard");

  const result = release("db", "nf-db");
  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(path.join(tmpDir, "db.lock")), true);
});

test("release succeeds for the actual owner and clears the lock", () => {
  take("db", "nf-test, verify release success");

  const result = release("db", "nf-test");
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(tmpDir, "db.lock")), false);

  const after = status().find((l) => l.name === "db");
  assert.equal(after.free, true);
});
