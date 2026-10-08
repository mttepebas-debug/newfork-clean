#!/usr/bin/env node
// OTOMASYON-4: picking up where a session stopped, across Claude accounts.
// Mert runs two Claude accounts on one PC, one at a time. The desktop app lists sessions per
// account, but transcripts, the inbox and the locks are shared on disk. So every session keeps a
// small "where I am" record (written from the inbox heartbeat hook), and a session in the other
// account can list the unfinished ones, take one over and adopt its lock.
//
//   node scripts/devir.mjs liste [--saat N]               unfinished sessions of the last N hours (24)
//   node scripts/devir.mjs devret <eski-oturum> [<yeni>]  mark a session as handed over (guard then stops it)
//   node scripts/devir.mjs kilit-al <db|main|heavy> "<oturum/iş>"   adopt a handed-over or silent session's lock
//   node scripts/devir.mjs hook start                     SessionStart: one line when the other account left work
//
// Records: <inbox>/durum/<session>.json. Account labels (optional): <inbox>/hesaplar.json
// { "<organizationUuid>": "Hesap 1", ... }. Overridable for tests: NEWFORK_INBOX_DIR,
// NEWFORK_LOCK_DIR, NEWFORK_CLAUDE_JSON. Hooks never break a session: failures are swallowed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { INBOX_DIR, slug } from "./inbox.mjs";
import { status as lockStatus } from "./lock.mjs";

const LOCK_DIR = process.env.NEWFORK_LOCK_DIR ?? "C:/Users/TheWe/Documents/Codex/.newfork-locks";
const CLAUDE_JSON = process.env.NEWFORK_CLAUDE_JSON ?? path.join(os.homedir(), ".claude.json");
const LOCKS = ["db", "main", "heavy"];
const TAIL_BYTES = 2 * 1024 * 1024; // transcripts reach 50 MB; the last messages sit at the end
const HEAD_BYTES = 256 * 1024; // the account line comes with the first attachments
const SILENT_MIN = 30; // a lock holder without a heartbeat this long may lose its lock
const FINISHED = /^\s*(TREN-HAZIR|BİTTİ|BITTI|KAPANDI|TEMİZLENDİ|TEMIZLENDI)\b/i;

const inbox = (...p) => path.join(INBOX_DIR, ...p);
const durumFile = (sid) => inbox("durum", `${slug(sid)}.json`);

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

// Same line format as guard.mjs's audit log (guard imports this file, so no import back).
function audit(entry) {
  fs.mkdirSync(INBOX_DIR, { recursive: true });
  fs.appendFileSync(inbox("audit.log"), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

function git(cwd, args) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim();
  } catch {
    return "";
  }
}

// ---- reading a transcript ----

function readSlice(file, fromEnd, bytes) {
  try {
    const fd = fs.openSync(file, "r");
    try {
      const size = fs.fstatSync(fd).size;
      const len = Math.min(size, bytes);
      const start = fromEnd ? size - len : 0;
      const buf = Buffer.allocUnsafe(len);
      const text = buf.subarray(0, fs.readSync(fd, buf, 0, len, start)).toString("utf8");
      const lines = text.split("\n");
      if (fromEnd && start > 0) lines.shift(); // the first line is cut
      if (!fromEnd && len < size) lines.pop();
      return lines;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [];
  }
}

const parse = (l) => {
  try {
    return JSON.parse(l);
  } catch {
    return null;
  }
};

// Mert's own text: no tool results, no skill bodies, no injected reminders, no wrapper tags.
function userText(o) {
  if (o?.type !== "user" || o.isMeta) return "";
  const c = o.message?.content;
  return (typeof c === "string" ? c : Array.isArray(c) ? c.filter((b) => b?.type === "text").map((b) => b.text).join("\n") : "")
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<\/?[A-Za-z][\w-]*(\s[^>]*)?>/g, "")
    .trim();
}

function assistantText(o) {
  if (o?.type !== "assistant") return "";
  const c = o.message?.content;
  return (Array.isArray(c) ? c.filter((b) => b?.type === "text").map((b) => b.text).join("\n") : "").trim();
}

const orgOf = (o) => (o?.attachment?.type === "credential_org" ? o.attachment.organizationUuid ?? null : null);

function readTail(transcriptPath, bytes) {
  const out = { title: null, org: null, assistant: null, user: null };
  if (!transcriptPath) return out;
  const lines = readSlice(transcriptPath, true, bytes);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (out.title && out.org && out.assistant && out.user) break;
    const l = lines[i];
    if (!l) continue;
    if (!out.title && l.includes('"custom-title"')) out.title = parse(l)?.customTitle ?? null;
    else if (!out.org && l.includes('"credential_org"')) out.org = orgOf(parse(l));
    else if (!out.assistant && l.includes('"type":"assistant"')) out.assistant = assistantText(parse(l)) || null;
    else if (!out.user && l.includes('"type":"user"')) out.user = userText(parse(l)) || null;
  }
  return out;
}

function headOrg(transcriptPath) {
  if (!transcriptPath) return null;
  for (const l of readSlice(transcriptPath, false, HEAD_BYTES)) {
    if (l.includes('"credential_org"')) return orgOf(parse(l));
  }
  return null;
}

// ---- the record ----

export function readDurum(sessionId) {
  return sessionId ? readJson(durumFile(sessionId)) : null;
}

export function writeDurum(input, { now = Date.now(), tailBytes = TAIL_BYTES } = {}) {
  const sid = input?.session_id;
  if (!sid) return null;
  const prev = readDurum(sid) ?? {};
  const tail = readTail(input.transcript_path, tailBytes);
  const label = readJson(inbox("label", `${slug(sid)}.json`), {}) ?? {};
  const cwd = label.cwd ?? input.cwd ?? process.cwd();
  const head = git(cwd, ["rev-parse", "--short", "HEAD"]);
  const dirty = git(cwd, ["status", "--porcelain"]);
  const rec = {
    session_id: sid,
    title: tail.title ?? prev.title ?? null,
    org: tail.org ?? prev.org ?? headOrg(input.transcript_path),
    cwd,
    task: label.task ?? null,
    state: label.state ?? null,
    branch: git(cwd, ["branch", "--show-current"]) || (head ? "(detached)" : ""),
    head,
    dirty: dirty ? dirty.split("\n").length : 0,
    locks: lockStatus().filter((l) => !l.free && l.session === sid).map((l) => l.name),
    lastAssistant: (tail.assistant ?? prev.lastAssistant ?? "").slice(0, 1500),
    lastUser: (tail.user ?? prev.lastUser ?? "").slice(0, 500),
    at: new Date(now).toISOString(),
    handedOff: prev.handedOff ?? null,
  };
  writeAtomic(durumFile(sid), JSON.stringify(rec, null, 2));
  return rec;
}

// ---- the takeover list ----

export function listDevir({ hours = 24, now = Date.now() } = {}) {
  let files = [];
  try {
    files = fs.readdirSync(inbox("durum")).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return files
    .map((f) => readJson(inbox("durum", f)))
    .filter((r) => r?.session_id && !r.handedOff && !FINISHED.test(r.state ?? ""))
    .filter((r) => now - Date.parse(r.at) <= hours * 3_600_000)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

const accountLabel = (org) => (org ? readJson(inbox("hesaplar.json"), {})?.[org] ?? `hesap ${org.slice(0, 8)}` : "hesap ?");

function ago(at, now = Date.now()) {
  const min = Math.max(0, Math.round((now - Date.parse(at)) / 60_000));
  return min < 90 ? `${min} dk önce` : `${Math.round(min / 60)} sa önce`;
}

const oneLine = (s, n) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export function formatDevir(rows, now = Date.now()) {
  if (!rows.length) return "Yarım oturum yok.";
  return rows
    .map((r) =>
      [
        `${r.task || r.title || r.session_id.slice(0, 8)} · ${accountLabel(r.org)} · ${ago(r.at, now)} · ${r.branch || "dal yok"} · kirli:${r.dirty}` +
          (r.locks?.length ? ` · kilit: ${r.locks.join(", ")}` : ""),
        r.title && r.task ? `  oturum: ${r.title}` : null,
        `  klasör: ${r.cwd}`,
        r.state ? `  durum: ${oneLine(r.state, 160)}` : null,
        r.lastUser ? `  son istek: "${oneLine(r.lastUser, 160)}"` : null,
        r.lastAssistant ? `  son söz: "${oneLine(r.lastAssistant, 240)}"` : null,
        `  devral: /devral · eski sohbet: /resume ${r.session_id}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

// ---- handoff ----

export function handoff(from, to, now = Date.now()) {
  if (!from) return { ok: false, message: "eski oturum kimliği yok" };
  const rec = readDurum(from) ?? { session_id: from };
  rec.handedOff = { to: to ?? null, at: new Date(now).toISOString() };
  writeAtomic(durumFile(from), JSON.stringify(rec, null, 2));
  audit({ event: "handoff", from, to: to ?? null, session_id: to ?? "" });
  return { ok: true, message: `${from} devredildi${to ? ` → ${to}` : ""}; o oturum bir daha komut çalıştırırsa koruma uyarır` };
}

export function handedOff(sessionId) {
  return readDurum(sessionId)?.handedOff ?? null;
}

// ---- the opening hint ----

function currentOrg() {
  return readJson(CLAUDE_JSON)?.oauthAccount?.organizationUuid ?? null;
}

export function startHint(input, now = Date.now()) {
  const cur = currentOrg();
  if (!cur) return null;
  const rows = listDevir({ now }).filter((r) => r.session_id !== input?.session_id && r.org && r.org !== cur);
  if (!rows.length) return null;
  const names = rows
    .slice(0, 3)
    .map((r) => `${r.task || r.title || r.session_id.slice(0, 8)} (${[r.branch, ago(r.at, now)].filter(Boolean).join(", ")})`);
  return (
    `Öbür hesapta ${rows.length} yarım oturum var: ${names.join("; ")}${rows.length > 3 ? "; …" : ""}. ` +
    `Liste: node scripts/devir.mjs liste · devralmak için /devral.`
  );
}

// ---- lock adoption ----

function silentMinutes(sessionId, now) {
  const at = Date.parse(readJson(inbox("status", `${slug(sessionId)}.json`))?.at ?? "");
  return Number.isNaN(at) ? null : (now - at) / 60_000;
}

export function adoptLock(name, identity, { session = process.env.CLAUDE_CODE_SESSION_ID, cwd = process.cwd(), now = Date.now() } = {}) {
  if (!LOCKS.includes(name)) return { ok: false, message: `kilit "${name}" bilinmiyor: ${LOCKS.join(" | ")}` };
  if (!/^[^/\s,]+\/[^/\s,]+$/.test(String(identity ?? "").trim())) {
    return { ok: false, message: `kimlik "${identity}" geçersiz: "oturum/iş" biçiminde olmalı` };
  }
  const file = path.join(LOCK_DIR, `${name}.lock`);
  if (!fs.existsSync(file)) return { ok: false, message: `${name}.lock boş; devralacak kilit yok, take kullan` };
  const held = readJson(file);
  if (!held || typeof held !== "object" || Array.isArray(held) || !held.session) {
    return { ok: false, message: `${name}.lock bir oturuma bağlı değil; koordinatöre sor (CLAUDE.md §6)` };
  }
  const silent = silentMinutes(held.session, now);
  const reason = handedOff(held.session) ? "devredildi" : silent != null && silent > SILENT_MIN ? `${Math.round(silent)} dk sessiz` : null;
  if (!reason) {
    return {
      ok: false,
      message: `${name}.lock sahibi "${held.identity}" devredilmedi ve son ${SILENT_MIN} dakikada sesi var; devralınmadı`,
    };
  }
  const next = {
    ...held,
    identity: identity.trim(),
    session: session ?? null,
    cwd,
    adoptedFrom: held.identity,
    adoptedAt: new Date(now).toISOString(),
  };
  writeAtomic(file, JSON.stringify(next));
  audit({ event: "lock-adopt", lock: name, from: held.identity, to: next.identity, reason, session_id: session ?? "" });
  return { ok: true, message: `${name}.lock devralındı: ${held.identity} → ${next.identity} (${reason})` };
}

// ---- command line ----

async function readStdin() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "hook" && args[0] === "start") {
    try {
      const hint = startHint(JSON.parse((await readStdin()) || "{}"));
      if (hint) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: hint } }));
    } catch {}
    return;
  }
  let result;
  if (cmd === "liste") {
    const i = args.indexOf("--saat");
    const hours = i >= 0 ? Number(args[i + 1]) || 24 : 24;
    console.log(formatDevir(listDevir({ hours })));
    return;
  } else if (cmd === "devret" && args[0]) {
    result = handoff(args[0], args[1] ?? process.env.CLAUDE_CODE_SESSION_ID);
  } else if (cmd === "kilit-al" && args.length === 2) {
    result = adoptLock(args[0], args[1]);
  } else {
    result = {
      ok: false,
      message:
        "kullanım: devir.mjs liste [--saat N] | devret <eski-oturum> [<yeni>] | " +
        'kilit-al <db|main|heavy> "<oturum/iş>" | hook start',
    };
  }
  (result.ok ? console.log : console.error)(result.message);
  process.exitCode = result.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
