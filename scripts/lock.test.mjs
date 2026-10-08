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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "newfork-lock-test-"));
process.env.NEWFORK_LOCK_DIR = tmpDir;

const { take, release, status, run, isDead, clearDead } = await import("./lock.mjs");

const dbLock = path.join(tmpDir, "db.lock");
const mainLock = path.join(tmpDir, "main.lock");
const heavyLock = path.join(tmpDir, "heavy.lock");

beforeEach(() => {
  for (const f of [dbLock, mainLock, heavyLock]) fs.rmSync(f, { force: true });
  for (const d of ["queue-db", "dead"]) fs.rmSync(path.join(tmpDir, d), { recursive: true, force: true });
  delete process.env.NEWFORK_CI_STATE;
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

test("a lock records the Claude session and folder that took it, so the guard can tell whose it is", () => {
  const prev = process.env.CLAUDE_CODE_SESSION_ID;
  process.env.CLAUDE_CODE_SESSION_ID = "sess-123";
  try {
    take("db", "nf-test/owner, e2e");
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_CODE_SESSION_ID;
    else process.env.CLAUDE_CODE_SESSION_ID = prev;
  }
  const held = status().find((l) => l.name === "db");
  assert.equal(held.session, "sess-123");
  assert.equal(held.cwd, process.cwd());
});

test("only db is a lock now: main and heavy are refused by name", () => {
  assert.throws(() => take("main", "koordinator/x, push"), /unknown lock "main" \(expected db\)/);
  assert.throws(() => take("heavy", "oturum/x, gate"), /unknown lock "heavy" \(expected db\)/);
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

const node = `"${process.execPath}"`;
const marker = path.join(tmpDir, "marker.mjs");
fs.writeFileSync(
  marker,
  'import fs from "node:fs";\nconst [file, tag, ms, code] = process.argv.slice(2);\nfs.appendFileSync(file, tag + "+");\nawait new Promise((r) => setTimeout(r, Number(ms)));\nfs.appendFileSync(file, tag + "-");\nprocess.exit(Number(code ?? 0));\n',
);
const quiet = { say: () => {}, pollMs: 20 };
const queueFiles = () => {
  try {
    return fs.readdirSync(path.join(tmpDir, "queue-db"));
  } catch {
    return [];
  }
};

test("run: holds db only while the command runs, returns its exit code, lets go after a failure too", async () => {
  const out = path.join(tmpDir, "one.txt");
  const code = await run("db", `${node} "${marker}" "${out}" a 10 7`, { ...quiet, as: "t" });
  assert.equal(code, 7);
  assert.equal(fs.readFileSync(out, "utf8"), "a+a-");
  assert.equal(status()[0].free, true);
  assert.deepEqual(queueFiles(), []);
});

test("run: two commands never overlap and go in arrival order", async () => {
  const out = path.join(tmpDir, "two.txt");
  const a = run("db", `${node} "${marker}" "${out}" a 300`, { ...quiet, as: "a" });
  await new Promise((r) => setTimeout(r, 30));
  const b = run("db", `${node} "${marker}" "${out}" b 10`, { ...quiet, as: "b" });
  assert.deepEqual(await Promise.all([a, b]), [0, 0]);
  assert.equal(fs.readFileSync(out, "utf8"), "a+a-b+b-");
});

test("run: a dead holder (taken before this boot) is moved to dead/ and the waiter goes on", async () => {
  fs.writeFileSync(dbLock, JSON.stringify({ identity: "oturum/eski", purpose: "test:db", startedAt: "2000-01-01T00:00:00Z", pid: process.pid }));
  const lines = [];
  const code = await run("db", `${node} -e "process.exit(0)"`, { pollMs: 20, as: "yeni", say: (l) => lines.push(l) });
  assert.equal(code, 0);
  assert.match(lines.join("\n"), /ölü sahibinden temizlendi: oturum\/eski/);
  assert.equal(fs.readdirSync(path.join(tmpDir, "dead")).length, 1);
});

test("run: a dead waiter's ticket ahead in the queue is dropped, not waited for", async () => {
  fs.mkdirSync(path.join(tmpDir, "queue-db"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "queue-db", "000000000000001-1-dead.json"),
    JSON.stringify({ identity: "run/eski-1", command: "x", pid: 1, startedAt: "2000-01-01T00:00:00Z" }),
  );
  const code = await run("db", `${node} -e "process.exit(0)"`, { ...quiet, as: "sonraki" });
  assert.equal(code, 0);
  assert.deepEqual(queueFiles(), []);
});

test("isDead: gone process or taken before boot is dead; a live one and a hand-written one are not", () => {
  const now = new Date().toISOString();
  assert.equal(isDead({ pid: 999999, startedAt: now }, { alive: () => false }), true);
  assert.equal(isDead({ pid: process.pid, startedAt: "2000-01-01T00:00:00Z" }), true);
  assert.equal(isDead({ pid: process.pid, startedAt: now }), false);
  assert.equal(isDead({ identity: "elle/yazilmis" }), false);
  assert.equal(clearDead("db"), null);
});

test("run: a live holder makes it wait; --max-wait gives up with 3 and leaves no ticket", async () => {
  take("db", "oturum/canli, test:db");
  const code = await run("db", `${node} -e "process.exit(0)"`, { ...quiet, as: "bekleyen", maxWaitMin: 0.002 });
  assert.equal(code, 3);
  assert.equal(status()[0].identity, "oturum/canli");
  assert.deepEqual(queueFiles(), []);
});

test("run --e2e: waits while CI runs, goes once it is idle", async () => {
  process.env.NEWFORK_CI_STATE = "running";
  setTimeout(() => (process.env.NEWFORK_CI_STATE = "idle"), 150);
  const t0 = Date.now();
  const code = await run("db", `${node} -e "process.exit(0)"`, { ...quiet, as: "e2e", e2e: true, ciPollMs: 20 });
  assert.equal(code, 0);
  assert.ok(Date.now() - t0 >= 150);
});

test("status: over 30 minutes is long, taken before boot is dead, waiting tickets are listed", () => {
  const old = new Date(Date.now() - 31 * 60000).toISOString();
  fs.writeFileSync(dbLock, JSON.stringify({ identity: "run/uzun-1", purpose: "x", startedAt: old, pid: process.pid }));
  fs.mkdirSync(path.join(tmpDir, "queue-db"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "queue-db", "000000000000009-9-w.json"),
    JSON.stringify({ identity: "run/bekleyen-9", command: "pnpm.cmd test:db", pid: process.pid, startedAt: new Date().toISOString() }),
  );
  const s = status()[0];
  assert.equal(s.long, true);
  assert.equal(s.dead, false);
  assert.deepEqual(s.queue, [{ identity: "run/bekleyen-9", command: "pnpm.cmd test:db", dead: false }]);
  fs.writeFileSync(dbLock, JSON.stringify({ identity: "run/eski-1", purpose: "x", startedAt: "2000-01-01T00:00:00Z", pid: process.pid }));
  assert.equal(status()[0].dead, true);
});
