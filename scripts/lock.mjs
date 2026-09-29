#!/usr/bin/env node
// Atomic take/release/status for the shared locks in CLAUDE.md §7
// (db.lock / main.lock, C:/Users/TheWe/Documents/Codex/.newfork-locks).
// take() writes the full entry to a scratch file first, then places it with
// fs.linkSync(tmp, file): the lock file only ever appears fully-formed
// (EEXIST = already held), so there's no window where a reader sees an
// empty file. Directory is overridable via NEWFORK_LOCK_DIR (tests only;
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

// Identity is "rol/oturum" (e.g. "nf-test/fb61-11"), the first
// comma-separated field of both `take`'s and `release`'s argument.
function splitIdentity(arg) {
  const [identity, ...rest] = arg.split(",");
  return { identity: identity.trim(), purpose: rest.join(",").trim() };
}

// A hand-created lock (`echo ... > db.lock`) is plain text; ours is JSON.
// Anything that isn't a JSON object (plain text, or JSON that parses to
// null/a number/an array) is read the plain-text way: split on the first
// comma to get the identity, same as a real plain-text lock would give.
function readLock(file) {
  const raw = fs.readFileSync(file, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    return {
      identity: typeof parsed.identity === "string" ? parsed.identity : "",
      purpose: typeof parsed.purpose === "string" ? parsed.purpose : "",
      startedAt: parsed.startedAt,
    };
  }
  const { identity, purpose } = splitIdentity(raw);
  return { identity, purpose, startedAt: undefined };
}

// JSON locks carry their own startedAt; a plain-text lock doesn't, so its
// age comes from the file's own mtime instead.
function ageMinutes(file, startedAt) {
  const t = Date.parse(startedAt ?? "");
  if (!Number.isNaN(t)) return Math.round((Date.now() - t) / 60000);
  try {
    return Math.round((Date.now() - fs.statSync(file).mtimeMs) / 60000);
  } catch {
    return null;
  }
}

export function take(name, arg) {
  const { identity, purpose } = splitIdentity(arg);
  const [role, session] = identity.split("/").map((part) => part.trim());
  if (!role || !session) {
    return {
      ok: false,
      message: `kimlik "${identity}" geçersiz: "rol/oturum" biçiminde olmalı (ör. "nf-test/fb61-11")`,
    };
  }
  fs.mkdirSync(LOCK_DIR, { recursive: true });
  const file = lockPath(name);
  const entry = { identity, purpose, startedAt: new Date().toISOString(), pid: process.pid };
  const tmp = path.join(LOCK_DIR, `.${name}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(entry, null, 2));
  try {
    fs.linkSync(tmp, file); // atomic: directory entry appears only once fully written
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    if (err.code !== "EEXIST") throw err;
    const held = readLock(file);
    const age = ageMinutes(file, held.startedAt);
    return {
      ok: false,
      message: `${name}.lock zaten "${held.identity || "?"}" elinde${age != null ? ` (${age} dk önce alınmış)` : ""}`,
    };
  }
  fs.rmSync(tmp, { force: true });
  return { ok: true, message: `${name}.lock alındı: ${identity}` };
}

export function release(name, arg) {
  const file = lockPath(name);
  if (!fs.existsSync(file)) return { ok: false, message: `${name}.lock zaten yok` };
  const held = readLock(file);
  if (!held.identity) {
    return { ok: false, message: `${name}.lock sahibi boş ya da okunamıyor; silinmedi, koordinatöre sor` };
  }
  const { identity } = splitIdentity(arg);
  if (held.identity !== identity) {
    return {
      ok: false,
      message: `${name}.lock sahibi "${held.identity}", release isteyen "${identity}" değil; silinmedi`,
    };
  }
  fs.rmSync(file);
  return { ok: true, message: `${name}.lock bırakıldı: ${identity}` };
}

export function status() {
  return LOCKS.map((name) => {
    const file = lockPath(name);
    if (!fs.existsSync(file)) return { name, free: true };
    const held = readLock(file);
    const age = ageMinutes(file, held.startedAt);
    return {
      name,
      free: false,
      identity: held.identity || "?",
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
          : `${lock.name}.lock: ${lock.identity}, ${lock.ageMinutes ?? "?"} dk${lock.stale ? " (stale, silinmedi)" : ""}`,
      );
    }
    return;
  }
  const result =
    cmd === "take" && name && arg ? take(name, arg) : cmd === "release" && name && arg ? release(name, arg) : null;
  if (!result) {
    console.error(
      'usage: node scripts/lock.mjs take <db|main> "<rol/oturum, amaç>"   (kimlik "rol/oturum" biçiminde, ör. "nf-test/fb61-11")\n' +
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
