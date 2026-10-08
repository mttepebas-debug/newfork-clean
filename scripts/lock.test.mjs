#!/usr/bin/env node
// TEAM-001: red/green coverage for lock.mjs's atomicity, ownership, and
// legacy-lock-compatibility rules. Runs against a throwaway temp directory
// (NEWFORK_LOCK_DIR) -- never the real .newfork-locks folder.
// Run: node --test scripts/lock.test.mjs
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "newfork-lock-test-"));
process.env.NEWFORK_LOCK_DIR = tmpDir;

const { take, release, status, longMainLine } = await import("./lock.mjs");

const dbLock = path.join(tmpDir, "db.lock");
const mainLock = path.join(tmpDir, "main.lock");
const heavyLock = path.join(tmpDir, "heavy.lock");

beforeEach(() => {
  for (const f of [dbLock, mainLock, heavyLock]) fs.rmSync(f, { force: true });
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("take is atomic: a second take on a held lock fails", () => {
  const first = take("db", "nf-test/atomic-check, verify atomic take");
  assert.equal(first.ok, true);

  const second = take("db", "nf-db/other-session, migration");
  assert.equal(second.ok, false);
  assert.match(second.message, /nf-test\/atomic-check/);
});

test("release refuses when the caller isn't the owner", () => {
  take("db", "nf-test/release-guard, verify release guard");

  const result = release("db", "nf-db/release-guard");
  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(dbLock), true);
});

test("release succeeds for the actual owner and clears the lock", () => {
  take("db", "nf-test/release-ok, verify release success");

  const result = release("db", "nf-test/release-ok");
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(dbLock), false);

  const afterRelease = status().find((l) => l.name === "db");
  assert.equal(afterRelease.free, true);
});

test("take rejects an identity with no role/session slash", () => {
  const result = take("db", "nf-test, purpose only, no slash");
  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(dbLock), false);
});

test("take rejects an empty/whitespace-only identity", () => {
  const result = take("db", "   , purpose");
  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(dbLock), false);
});

test("a hand-created plain-text lock is read and honored", () => {
  fs.writeFileSync(dbLock, "nf-db/manual, migration deneme, 2026-09-26T10:00:00.000Z");

  const blocked = take("db", "nf-test/other, x");
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /nf-db\/manual/);

  const wrongRelease = release("db", "nf-test/other");
  assert.equal(wrongRelease.ok, false);

  const rightRelease = release("db", "nf-db/manual");
  assert.equal(rightRelease.ok, true);
  assert.equal(fs.existsSync(dbLock), false);
});

test("release refuses an empty/unreadable owner instead of deleting", () => {
  fs.writeFileSync(dbLock, "");

  const result = release("db", "nf-test/anything");
  assert.equal(result.ok, false);
  assert.match(result.message, /koordinatöre sor/);
  assert.equal(fs.existsSync(dbLock), true);
});

test("non-object JSON content (null, a bare number) doesn't crash status/release", () => {
  fs.writeFileSync(dbLock, "null");
  assert.doesNotThrow(() => status());
  assert.doesNotThrow(() => release("db", "nf-test/anything"));

  fs.writeFileSync(dbLock, "123");
  assert.doesNotThrow(() => status());
  assert.doesNotThrow(() => release("db", "nf-test/anything"));
});

test("a lock older than 2h is reported stale but never auto-deleted", () => {
  const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  fs.writeFileSync(
    dbLock,
    JSON.stringify({ identity: "nf-db/old-session", purpose: "long migration", startedAt: old, pid: 1 }),
  );

  const entry = status().find((l) => l.name === "db");
  assert.equal(entry.free, false);
  assert.equal(entry.stale, true);
  assert.equal(fs.existsSync(dbLock), true); // status never deletes
});

test("the same role with a different session is a different identity", () => {
  take("db", "nf-test/session-a, first slice");

  const result = release("db", "nf-test/session-b");
  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(dbLock), true);
});

test("take rejects an identity whose role or session half is empty (BL-196)", () => {
  for (const arg of ["nf-db/, migration", "/fb61-11, migration", "nf-db/ , migration", "/, x"]) {
    const result = take("db", arg);
    assert.equal(result.ok, false, `accepted "${arg}"`);
    assert.equal(fs.existsSync(dbLock), false);
  }
});

test("heavy.lock takes, reports and releases like the others (OTOMASYON-3)", () => {
  assert.equal(take("heavy", "nf-test/gate, tam kapı").ok, true);
  assert.equal(take("heavy", "nf-db/other, e2e").ok, false);
  const held = status().find((l) => l.name === "heavy");
  assert.equal(held.identity, "nf-test/gate");
  assert.equal(release("heavy", "nf-test/gate").ok, true);
  assert.equal(status().find((l) => l.name === "heavy").free, true);
});

test("a lock records the Claude session and folder that took it, so the guard can tell whose it is", () => {
  const prev = process.env.CLAUDE_CODE_SESSION_ID;
  process.env.CLAUDE_CODE_SESSION_ID = "sess-123";
  try {
    take("heavy", "nf-test/owner, e2e");
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_CODE_SESSION_ID;
    else process.env.CLAUDE_CODE_SESSION_ID = prev;
  }
  const held = status().find((l) => l.name === "heavy");
  assert.equal(held.session, "sess-123");
  assert.equal(held.cwd, process.cwd());
});

test("an unknown lock name is refused and the message lists the three names", () => {
  assert.throws(() => take("ci", "nf-test/x, y"), /db\|main\|heavy/);
});

test("a plain-text lock's age comes from the file mtime and turns stale after 2h (BL-196)", () => {
  fs.writeFileSync(dbLock, "nf-db/manual, migration deneme");
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
  fs.utimesSync(dbLock, threeHoursAgo, threeHoursAgo);

  const old = status().find((l) => l.name === "db");
  assert.equal(old.identity, "nf-db/manual");
  assert.equal(old.ageMinutes, 180);
  assert.equal(old.stale, true);

  const fresh = new Date(Date.now() - 30 * 60 * 1000);
  fs.utimesSync(dbLock, fresh, fresh);
  const recent = status().find((l) => l.name === "db");
  assert.equal(recent.ageMinutes, 30);
  assert.equal(recent.stale, false);
  assert.equal(fs.existsSync(dbLock), true);
});

// TREN-ARACI: main.lock is held only for the push moment (CLAUDE.md §6); past 30 minutes it is an alarm.
const minutesAgo = (min) => new Date(Date.now() - min * 60000).toISOString();
const holdMain = (min, extra = {}) =>
  fs.writeFileSync(mainLock, JSON.stringify({ identity: "koordinator/tren-x", purpose: "push", startedAt: minutesAgo(min), pid: 1, ...extra }));

test("main.lock held past 30 minutes gets its own UZUN line, 29 minutes does not (TREN-ARACI)", () => {
  holdMain(29);
  assert.equal(longMainLine(), null);
  holdMain(31);
  assert.equal(longMainLine(), "UZUN: main.lock 31 dk, sahibi koordinator/tren-x (push)");
});

test("a free main.lock, or another lock held long, gives no UZUN line (TREN-ARACI)", () => {
  assert.equal(longMainLine(), null);
  fs.writeFileSync(dbLock, JSON.stringify({ identity: "nf-db/x", purpose: "", startedAt: minutesAgo(90), pid: 1 }));
  assert.equal(longMainLine(), null);
});

test("lock.mjs status prints the UZUN line after the lock lines (TREN-ARACI)", () => {
  holdMain(45, { purpose: "" });
  const r = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), "lock.mjs"), "status"], {
    encoding: "utf8",
    env: { ...process.env, NEWFORK_LOCK_DIR: tmpDir },
  });
  const lines = r.stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, 4);
  assert.match(lines[1], /^main\.lock: koordinator\/tren-x, 45 dk$/);
  assert.equal(lines[3], "UZUN: main.lock 45 dk, sahibi koordinator/tren-x");
});
