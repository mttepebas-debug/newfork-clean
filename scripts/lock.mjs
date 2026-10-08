#!/usr/bin/env node
// WORKFLOW-V2 (spec §7.4): one lock, db -- the shared local database (migration tries, pgTAP, a local
// e2e, the train's apply-local). Only a command holds it:
//   node scripts/lock.mjs run db [--e2e] [--as <name>] [--max-wait <min>] -- <command…>
// waits its turn in arrival order (a ticket in queue-db/), runs the command (cmd.exe on Windows) and
// lets go when it ends, success or not. --e2e also waits while a GitHub Actions run is going: two e2e
// runs on the one PC time each other out. A holder whose process is gone, or that took the lock before
// this machine last started, is dead: the first waiter moves it to dead/ and goes on. A hand-written
// lock (no pid) is never cleared. take()/release() stay for scripts/train.mjs, which also holds the
// lock inside one command. The lock file only ever appears fully formed (scratch file + fs.linkSync),
// so EEXIST = held. Directory is overridable via NEWFORK_LOCK_DIR (tests only; never the real folder).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ciState } from "./ops.mjs";

const LOCK_DIR = process.env.NEWFORK_LOCK_DIR ?? "C:/Users/TheWe/Documents/Codex/.newfork-locks";
const LONG_MIN = 30; // spec §2: no lock is held longer than this; status flags it
const STALE_MS = 2 * 60 * 60 * 1000; // flagged in status, never deleted by age alone
const LOCKS = ["db"];

function lockPath(name) {
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

// A dead holder's lock goes to dead/ (kept for the record). Only the first waiter in the queue and the
// train call this, so two processes rarely race for it; a lost race is a rename that fails, not a harm.
export function clearDead(name, opts) {
  const file = lockPath(name);
  if (!fs.existsSync(file)) return null;
  const held = readLock(file);
  if (!isDead(held, opts)) return null;
  const dir = path.join(LOCK_DIR, "dead");
  fs.mkdirSync(dir, { recursive: true });
  const to = path.join(dir, `${name}.${Date.now()}.lock`);
  try {
    fs.renameSync(file, to);
  } catch {
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
      long: age != null && age > LONG_MIN,
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

export async function run(name, command, { as, e2e = false, maxWaitMin = 60, pollMs = 2000, ciPollMs = 30000, say = (l) => console.log(l), exec = spawnCommand, deadOpts } = {}) {
  lockPath(name);
  const who = String(as ?? path.basename(process.cwd())).replace(/[^\w.-]+/g, "-").slice(0, 40) || "x";
  const identity = `run/${who}-${process.pid}`;
  fs.mkdirSync(queueDir(name), { recursive: true });
  const ticket = `${String(Date.now()).padStart(15, "0")}-${process.pid}-${Math.random().toString(36).slice(2, 8)}.json`;
  const ticketFile = path.join(queueDir(name), ticket);
  fs.writeFileSync(ticketFile, JSON.stringify({ identity, command, pid: process.pid, startedAt: new Date().toISOString() }));
  const started = Date.now();
  let lastSay = 0;
  let lastCi = -Infinity;
  let ciBusy = false;
  try {
    for (;;) {
      for (const f of tickets(name)) {
        const t = readTicket(name, f);
        if (f !== ticket && t && isDead(t, deadOpts)) fs.rmSync(path.join(queueDir(name), f), { force: true });
      }
      const queue = tickets(name);
      if (queue[0] === ticket) {
        const cleared = clearDead(name, deadOpts);
        if (cleared) say(cleared);
        if (e2e && Date.now() - lastCi >= ciPollMs) {
          ciBusy = ciState(process.cwd()).state === "running";
          lastCi = Date.now();
        }
        if (!(e2e && ciBusy) && take(name, `${identity}, ${command}`).ok) break;
      }
      if (Date.now() - started > maxWaitMin * 60000) {
        say(`${name}.lock için ${maxWaitMin} dk beklendi; komut koşmadı: ${command}`);
        return 3;
      }
      if (Date.now() - lastSay >= 60000) {
        const held = status(deadOpts).find((l) => l.name === name);
        say(
          `bekliyor: sırada ${queue.indexOf(ticket) + 1}/${queue.length}` +
            `${held.free ? "" : `; kilit ${held.identity} elinde (${held.ageMinutes ?? "?"} dk)`}${e2e && ciBusy ? "; CI koşuyor" : ""}`,
        );
        lastSay = Date.now();
      }
      await sleep(pollMs);
    }
  } finally {
    fs.rmSync(ticketFile, { force: true });
  }
  say(`${name}.lock alındı (${identity}): ${command}`);
  try {
    return await exec(command);
  } finally {
    release(name, identity);
    say(`${name}.lock bırakıldı (${identity})`);
  }
}

function printStatus() {
  for (const l of status()) {
    if (l.free) console.log(`${l.name}.lock: boş`);
    else
      console.log(
        `${l.name}.lock: ${l.identity}, ${l.ageMinutes ?? "?"} dk${l.pid ? `, pid ${l.pid}` : ""}` +
          `${l.long ? " — UZUN (30 dk'yı geçti)" : ""}${l.dead ? " — ÖLÜ: sıradaki bekleyen temizler" : ""}` +
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

async function main(argv) {
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
      process.exitCode = await run(rest[0], command, { e2e: opts.includes("--e2e"), as: val("--as"), maxWaitMin: Number(val("--max-wait") ?? 60) });
      return;
    }
  }
  console.error(USAGE);
  process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
