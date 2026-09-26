#!/usr/bin/env node
// Atomic take/release/status for the shared locks in CLAUDE.md §7
// (db.lock / main.lock, C:/Users/TheWe/Documents/Codex/.newfork-locks).
// fs.openSync(path, "wx") does the exclusive create, so two concurrent
// `take` calls on the same lock can't both succeed -- no read-then-write
// race window. Directory is overridable via NEWFORK_LOCK_DIR (tests only;
// never point it at the real lock folder).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const LOCK_DIR =
  process.env.NEWFORK_LOCK_DIR ?? "C:/Users/TheWe/Documents/Codex/.newfork-locks";
const STALE_MS = 2 * 60 * 60 * 1000; // CLAUDE.md §7: flag as stale, never auto-delete
const LOCKS = ["db", "main"];

function lockPath(name) {
  if (!LOCKS.includes(name)) throw new Error(`unknown lock "${name}" (expected db|main)`);
  return path.join(LOCK_DIR, `${name}.lock`);
}

// A hand-created lock (`echo ... > db.lock`) is plain text; ours is JSON.
// Either way the first comma-separated field is the role/session -- that's
// all `release` needs to check ownership against.
function readLock(file) {
  const raw = fs.readFileSync(file, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    const [role, ...rest] = raw.split(",");
    return { role: role.trim(), purpose: rest.join(",").trim() };
  }
}

function ageMinutes(startedAt) {
  const t = Date.parse(startedAt ?? "");
  return Number.isNaN(t) ? null : Math.round((Date.now() - t) / 60000);
}

export function take(name, arg) {
  fs.mkdirSync(LOCK_DIR, { recursive: true });
  const file = lockPath(name);
  const [role, ...rest] = arg.split(",");
  const entry = {
    role: role.trim(),
    purpose: rest.join(",").trim(),
    startedAt: new Date().toISOString(),
    pid: process.pid,
  };
  let fd;
  try {
    fd = fs.openSync(file, "wx"); // exclusive create: fails if it exists
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
    const held = readLock(file);
    const age = ageMinutes(held.startedAt);
    return {
      ok: false,
      message: `${name}.lock zaten "${held.role}" elinde${age != null ? ` (${age} dk önce alınmış)` : ""}`,
    };
  }
  fs.writeSync(fd, JSON.stringify(entry, null, 2));
  fs.closeSync(fd);
  return { ok: true, message: `${name}.lock alındı: ${entry.role}` };
}

export function release(name, role) {
  const file = lockPath(name);
  if (!fs.existsSync(file)) return { ok: false, message: `${name}.lock zaten yok` };
  const held = readLock(file);
  if (held.role !== role.trim()) {
    return {
      ok: false,
      message: `${name}.lock sahibi "${held.role}", release isteyen "${role}" değil; silinmedi`,
    };
  }
  fs.rmSync(file);
  return { ok: true, message: `${name}.lock bırakıldı: ${role}` };
}

export function status() {
  return LOCKS.map((name) => {
    const file = lockPath(name);
    if (!fs.existsSync(file)) return { name, free: true };
    const held = readLock(file);
    const age = ageMinutes(held.startedAt);
    return {
      name,
      free: false,
      role: held.role,
      purpose: held.purpose,
      ageMinutes: age,
      stale: age != null && age * 60000 > STALE_MS,
    };
  });
}

function main() {
  const [, , cmd, name, arg] = process.argv;
  if (cmd === "status") {
    for (const lock of status()) {
      console.log(
        lock.free
          ? `${lock.name}.lock: boş`
          : `${lock.name}.lock: ${lock.role}, ${lock.ageMinutes ?? "?"} dk${lock.stale ? " (stale, silinmedi)" : ""}`,
      );
    }
    return;
  }
  const result =
    cmd === "take" && name && arg ? take(name, arg) : cmd === "release" && name && arg ? release(name, arg) : null;
  if (!result) {
    console.error(
      'usage: node scripts/lock.mjs take <db|main> "<rol/oturum, amaç>"\n' +
        '       node scripts/lock.mjs release <db|main> "<rol/oturum>"\n' +
        "       node scripts/lock.mjs status",
    );
    process.exitCode = 1;
    return;
  }
  console.log(result.message);
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
