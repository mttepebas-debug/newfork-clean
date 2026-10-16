#!/usr/bin/env node
// WORKFLOW-V2 (spec §7.4): two locks. db -- the shared local database (migration tries, pgTAP, a local
// e2e, the train's apply-local). train -- one train at a time on this PC, from build to the end of apply-local (TREN-KILIDI):
// a second train waits its turn and builds on the main the first one moved. Only a command holds either:
//   node scripts/lock.mjs run db [--e2e] [--as <name>] [--max-wait <min>] -- <command…>
// waits its turn in arrival order (a ticket in queue-db/), runs the command (cmd.exe on Windows) and
// lets go when it ends, success or not. --e2e also waits while a GitHub Actions run is going: two e2e
// runs on the one PC time each other out. A holder whose process is gone, or that took the lock before
// this machine last started, is dead: the first waiter moves it to dead/ and goes on. A hand-written
// lock (no pid) is never cleared. scripts/train.mjs holds the lock inside its own step through acquire(),
// which waits in the same queue, synchronously. The lock file only ever appears fully formed (scratch
// file + fs.linkSync), so EEXIST = held. Directory is overridable via NEWFORK_LOCK_DIR (tests only; never the real folder).
// Ctrl+C stops the command and lets go. A force-killed lock.mjs (Task Manager, taskkill /f) cannot:
// its command may keep running while the next waiter clears the dead lock and starts -- the two then
// overlap. Stop such a command with Ctrl+C rather than killing lock.mjs (no process-tree tracking).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ciState, pcPath, NOT_ON_PC, NOT_ON_PC_EXIT } from "./ops.mjs";

// null off Mert's PC: there is no shared local database to lock (main() refuses, lockPath() throws).
const LOCK_DIR = pcPath(process.env.NEWFORK_LOCK_DIR, ".newfork-locks");
// spec §2: no db hold is longer than this; a train holds train.lock through a whole CI run. status flags it
const LONG_MIN = { db: 30, train: 150 };
const STALE_MS = 2 * 60 * 60 * 1000; // flagged in status, never deleted by age alone
const LOCKS = ["db", "train"];

function lockPath(name) {
  if (!LOCK_DIR) throw new Error(NOT_ON_PC);
  if (!LOCKS.includes(name)) throw new Error(`unknown lock "${name}" (expected ${LOCKS.join("|")})`);
  return path.join(LOCK_DIR, `${name}.lock`);
}
const queueDir = (name) => path.join(LOCK_DIR, `queue-${name}`);

// Identity is "who/what" (e.g. "run/ekran-02-4412", "koordinator/tren-20261008T1000Z"),
// the first comma-separated field of take()'s and release()'s argument.
function splitIdentity(arg) {
  const [identity, ...rest] = arg.split(",");
  return { identity: identity.trim(), purpose: rest.join(",").trim() };
}

// A hand-written lock is plain text; ours is a JSON object. Anything else is read the plain-text way.
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
      pid: Number.isInteger(parsed.pid) ? parsed.pid : undefined,
      session: typeof parsed.session === "string" ? parsed.session : undefined,
      cwd: typeof parsed.cwd === "string" ? parsed.cwd : undefined,
    };
  }
  const { identity, purpose } = splitIdentity(raw);
  return { identity, purpose, startedAt: undefined };
}

// JSON locks carry their own startedAt; a plain-text lock's age comes from the file's mtime.
function ageMinutes(file, startedAt) {
  const t = Date.parse(startedAt ?? "");
  if (!Number.isNaN(t)) return Math.round((Date.now() - t) / 60000);
  try {
    return Math.round((Date.now() - fs.statSync(file).mtimeMs) / 60000);
  } catch {
    return null;
  }
}

export const bootTime = () => Date.now() - os.uptime() * 1000;
export function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM"; // exists, owned by someone else
  }
}
// Dead = its process is gone, or it was taken before this machine started (a reboot reuses pids).
// No pid (a hand-written lock): never called dead.
export function isDead(entry, { alive = pidAlive, boot = bootTime() } = {}) {
  if (!Number.isInteger(entry?.pid)) return false;
  const t = Date.parse(entry.startedAt ?? "");
  if (!Number.isNaN(t) && t < boot) return true;
  return !alive(entry.pid);
}

export function take(name, arg) {
  const { identity, purpose } = splitIdentity(arg);
  const [who, what] = identity.split("/").map((part) => part.trim());
  if (!who || !what) {
    return { ok: false, message: `kimlik "${identity}" geçersiz: "kim/iş" biçiminde olmalı (ör. "run/ekran-02-4412")` };
  }
  fs.mkdirSync(LOCK_DIR, { recursive: true });
  const file = lockPath(name);
  const entry = {
    identity,
    purpose,
    startedAt: new Date().toISOString(),
    pid: process.pid,
    session: process.env.CLAUDE_CODE_SESSION_ID || undefined,
    cwd: process.cwd(),
  };
  const tmp = path.join(LOCK_DIR, `.${name}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(entry, null, 2));
  try {
    fs.linkSync(tmp, file); // atomic: the entry appears only once fully written
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    if (err.code !== "EEXIST") throw err;
    const held = readLock(file);
    const age = ageMinutes(file, held.startedAt);
    return { ok: false, message: `${name}.lock zaten "${held.identity || "?"}" elinde${age != null ? ` (${age} dk önce alınmış)` : ""}` };
  }
  fs.rmSync(tmp, { force: true });
  return { ok: true, message: `${name}.lock alındı: ${identity}` };
}

export function release(name, arg) {
  const file = lockPath(name);
  if (!fs.existsSync(file)) return { ok: false, message: `${name}.lock zaten yok` };
  const held = readLock(file);
  if (!held.identity) return { ok: false, message: `${name}.lock sahibi boş ya da okunamıyor; silinmedi, koordinatöre sor` };
  const { identity } = splitIdentity(arg);
  if (held.identity !== identity) return { ok: false, message: `${name}.lock sahibi "${held.identity}", bırakmak isteyen "${identity}" değil; silinmedi` };
  fs.rmSync(file);
  return { ok: true, message: `${name}.lock bırakıldı: ${identity}` };
}

// A dead holder's lock goes to dead/ (kept for the record). The first waiter in the queue and the train
// both call this, so two clearers can race: between our read and our rename another one may move the
// dead lock and take() a fresh, live one. So the rename goes to a unique path and the moved file is read
// back; if it is not the dead entry we checked, it is linked back as the lock (EEXIST: someone took a
// new one meanwhile -- the copy then stays in dead/) and nothing counts as cleared.
// opts.beforeMove is a test seam that runs between the check and the rename.
export function clearDead(name, opts = {}) {
  const file = lockPath(name);
  if (!fs.existsSync(file)) return null;
  let held;
  try {
    held = readLock(file);
  } catch {
    return null; // gone between the check and the read
  }
  if (!isDead(held, opts)) return null;
  opts.beforeMove?.();
  const dir = path.join(LOCK_DIR, "dead");
  fs.mkdirSync(dir, { recursive: true });
  const to = path.join(dir, `${name}.${Date.now()}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.lock`);
  try {
    fs.renameSync(file, to);
  } catch {
    return null;
  }
  let moved = null;
  try {
    moved = readLock(to);
  } catch {}
  if (!moved || moved.pid !== held.pid || moved.startedAt !== held.startedAt || moved.identity !== held.identity) {
    try {
      fs.linkSync(to, file);
      fs.rmSync(to, { force: true });
    } catch {
      // EEXIST: a newer lock is already in place; keep the moved copy in dead/ for the record
    }
    return null;
  }
  return `${name}.lock ölü sahibinden temizlendi: ${held.identity} (pid ${held.pid}) → ${to}`;
}

const tickets = (name) => {
  try {
    return fs.readdirSync(queueDir(name)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }
};
const readTicket = (name, f) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(queueDir(name), f), "utf8"));
  } catch {
    return null;
  }
};

// A ticket that does not parse (an older writer killed mid-write, a hand edit) would block the queue
// forever if first; once it is older than this it is dropped.
const UNREADABLE_TICKET_MS = 10000;
function unreadableTooLong(name, f) {
  try {
    return Date.now() - fs.statSync(path.join(queueDir(name), f)).mtimeMs > UNREADABLE_TICKET_MS;
  } catch {
    return false;
  }
}

export function status(opts) {
  return LOCKS.map((name) => {
    const file = lockPath(name);
    const queue = tickets(name)
      .map((f) => readTicket(name, f))
      .filter(Boolean)
      .map((t) => ({ identity: t.identity, command: t.command, dead: isDead(t, opts) }));
    if (!fs.existsSync(file)) return { name, free: true, queue };
    const held = readLock(file);
    const age = ageMinutes(file, held.startedAt);
    return {
      name,
      free: false,
      identity: held.identity || "?",
      purpose: held.purpose,
      pid: held.pid,
      session: held.session,
      cwd: held.cwd,
      ageMinutes: age,
      long: age != null && age > LONG_MIN[name],
      stale: age != null && age * 60000 > STALE_MS,
      dead: isDead(held, opts),
      queue,
    };
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The command in a shell (cmd.exe on Windows, so pnpm.cmd starts); Ctrl+C stops it and still lets go.
function spawnCommand(command) {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, stdio: "inherit" });
    const stop = () => child.kill();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    child.on("error", (err) => {
      console.error(String(err));
      resolve(1);
    });
    child.on("exit", (code, signal) => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

// ---- the queue: run() and acquire() wait in the same line of tickets ----

// A ticket in queue-<name>/, written under a name tickets() skips and renamed, so a reader never sees half a one.
function enqueue(name, identity, command) {
  fs.mkdirSync(queueDir(name), { recursive: true });
  const ticket = `${String(Date.now()).padStart(15, "0")}-${process.pid}-${Math.random().toString(36).slice(2, 8)}.json`;
  const file = path.join(queueDir(name), ticket);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify({ identity, command, pid: process.pid, startedAt: new Date().toISOString() }));
  fs.renameSync(`${file}.tmp`, file);
  return { ticket, file };
}

// One look at the line: dead or long-unreadable tickets of others go; when `ticket` is first, a dead holder
// is cleared and, if `ready()`, take() is tried. Returns { taken, queue }.
function turn(name, ticket, arg, { deadOpts, say, ready = () => true }) {
  for (const f of tickets(name)) {
    if (f === ticket) continue;
    const t = readTicket(name, f);
    if (t ? isDead(t, deadOpts) : unreadableTooLong(name, f)) fs.rmSync(path.join(queueDir(name), f), { force: true });
  }
  const queue = tickets(name);
  if (queue[0] === ticket) {
    const cleared = clearDead(name, deadOpts);
    if (cleared) say(cleared);
    if (ready() && take(name, arg).ok) return { taken: true, queue };
  }
  return { taken: false, queue };
}

function waiting(name, ticket, queue, deadOpts, extra = "") {
  const held = status(deadOpts).find((l) => l.name === name);
  return `bekliyor: sırada ${queue.indexOf(ticket) + 1}/${queue.length}${held.free ? "" : `; kilit ${held.identity} elinde (${held.ageMinutes ?? "?"} dk)`}${extra}`;
}

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(0, ms));

// The synchronous turn-taking for scripts/train.mjs, which holds db inside its own step: the same queue as
// run(), in arrival order. `arg` is take()'s "who/what, purpose". { ok: false } after maxWaitMin, ticket gone.
export function acquire(name, arg, { maxWaitMin = 30, pollMs = 2000, deadOpts, sleep = sleepSync, say = () => {} } = {}) {
  lockPath(name);
  const { identity, purpose } = splitIdentity(arg);
  const [who, what] = identity.split("/").map((part) => part.trim());
  if (!who || !what) return { ok: false, message: `kimlik "${identity}" geçersiz: "kim/iş" biçiminde olmalı` };
  const { ticket, file } = enqueue(name, identity, purpose);
  const deadline = Date.now() + maxWaitMin * 60000;
  let lastSay = Date.now();
  try {
    for (;;) {
      const { taken, queue } = turn(name, ticket, arg, { deadOpts, say });
      if (taken) return { ok: true, message: `${name}.lock alındı: ${identity}` };
      if (Date.now() >= deadline) return { ok: false, message: `${name}.lock için ${maxWaitMin} dk beklendi; alınamadı` };
      if (Date.now() - lastSay >= 60000) {
        say(waiting(name, ticket, queue, deadOpts));
        lastSay = Date.now();
      }
      sleep(Math.min(pollMs, deadline - Date.now() + 1));
    }
  } finally {
    fs.rmSync(file, { force: true });
  }
}

export async function run(name, command, { as, e2e = false, maxWaitMin = 60, pollMs = 2000, ciPollMs = 30000, say = (l) => console.log(l), exec = spawnCommand, deadOpts } = {}) {
  lockPath(name);
  const who = String(as ?? path.basename(process.cwd())).replace(/[^\w.-]+/g, "-").slice(0, 40) || "x";
  const identity = `run/${who}-${process.pid}`;
  const { ticket, file } = enqueue(name, identity, command);
  const started = Date.now();
  let lastSay = 0;
  let lastCi = -Infinity;
  let ciBusy = false;
  const ready = () => {
    if (!e2e) return true;
    if (Date.now() - lastCi >= ciPollMs) {
      ciBusy = ciState(process.cwd()).state === "running";
      lastCi = Date.now();
    }
    return !ciBusy;
  };
  try {
    for (;;) {
      const { taken, queue } = turn(name, ticket, `${identity}, ${command}`, { deadOpts, say, ready });
      if (taken) break;
      if (Date.now() - started > maxWaitMin * 60000) {
        say(`${name}.lock için ${maxWaitMin} dk beklendi; komut koşmadı: ${command}`);
        return 3;
      }
      if (Date.now() - lastSay >= 60000) {
        say(waiting(name, ticket, queue, deadOpts, e2e && ciBusy ? "; CI koşuyor" : ""));
        lastSay = Date.now();
      }
      await sleep(pollMs);
    }
  } finally {
    fs.rmSync(file, { force: true });
  }
  say(`${name}.lock alındı (${identity}): ${command}`);
  try {
    return await exec(command);
  } finally {
    const r = release(name, identity);
    say(r.ok ? `${name}.lock bırakıldı (${identity})` : r.message);
  }
}

function printStatus() {
  for (const l of status()) {
    if (l.free) console.log(`${l.name}.lock: boş`);
    else
      console.log(
        `${l.name}.lock: ${l.identity}, ${l.ageMinutes ?? "?"} dk${l.pid ? `, pid ${l.pid}` : ""}` +
          `${l.long ? ` — UZUN (${LONG_MIN[l.name]} dk'yı geçti)` : ""}${l.dead ? " — ÖLÜ: sıradaki bekleyen temizler" : ""}` +
          `${l.stale && !l.pid ? " — elle yazılmış, 2 saatten eski; koordinatöre sor" : ""}`,
      );
    if (l.queue.length) console.log(`  sıra (${l.queue.length}): ${l.queue.map((t) => `${t.identity}${t.dead ? " (ölü)" : ""}: ${t.command}`).join(" · ")}`);
  }
}

const USAGE = [
  "usage: node scripts/lock.mjs run db [--e2e] [--as <ad>] [--max-wait <dk>] -- <komut…>",
  "       node scripts/lock.mjs status",
  "  Tırnak isteyen komutu tek argüman ver: -- 'psql -c \"select 1\"'",
].join("\n");

// --max-wait <min>: a finite positive number, else the default 60 (NaN would mean "wait forever").
export function parseMaxWait(v) {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) && n > 0 ? n : 60;
}

async function main(argv) {
  if (!LOCK_DIR) {
    console.error(NOT_ON_PC);
    process.exitCode = NOT_ON_PC_EXIT;
    return;
  }
  const [cmd, ...rest] = argv;
  if (cmd === "status") return printStatus();
  if (cmd === "run") {
    const sep = rest.indexOf("--");
    const opts = rest.slice(1, sep < 0 ? rest.length : sep);
    const command = sep < 0 ? "" : rest.slice(sep + 1).join(" ");
    const val = (flag) => {
      const i = opts.indexOf(flag);
      return i >= 0 ? opts[i + 1] : undefined;
    };
    if (rest[0] && command) {
      process.exitCode = await run(rest[0], command, { e2e: opts.includes("--e2e"), as: val("--as"), maxWaitMin: parseMaxWait(val("--max-wait")) });
      return;
    }
  }
  console.error(USAGE);
  process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
