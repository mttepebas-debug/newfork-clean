#!/usr/bin/env node
// OTOMASYON-4: a session's "where I am" record, the takeover list, handoff, the opening hint
// and lock adoption. Runs against throwaway temp folders (NEWFORK_INBOX_DIR, NEWFORK_LOCK_DIR,
// NEWFORK_CLAUDE_JSON) -- never the real inbox, locks or ~/.claude.json.
// Run: node --test scripts/devir.test.mjs
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "newfork-devir-test-"));
const inbox = path.join(root, "inbox");
const locks = path.join(root, "locks");
const claudeJson = path.join(root, "claude.json");
const transcripts = path.join(root, "projects");
process.env.NEWFORK_INBOX_DIR = inbox;
process.env.NEWFORK_LOCK_DIR = locks;
process.env.NEWFORK_CLAUDE_JSON = claudeJson;

const { writeDurum, readDurum, listDevir, handoff, handedOff, startHint, adoptLock } = await import("./devir.mjs");
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "devir.mjs");

const ORG_1 = "47e49a74-1392-4f0b-bce3-8d8c2b452f9d";
const ORG_2 = "7704ff37-cb68-445e-b986-cc5e1dfecbcf";
const MIN = 60_000;

const line = (o) => JSON.stringify(o);
const user = (text) => line({ type: "user", message: { role: "user", content: text } });
const toolResult = (text) => line({ type: "user", message: { role: "user", content: [{ type: "tool_result", content: text }] } });
const meta = (text) => line({ type: "user", isMeta: true, message: { role: "user", content: text } });
const assistant = (text) => line({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] } });
const title = (t, sid) => line({ type: "custom-title", customTitle: t, sessionId: sid });
const org = (uuid) => line({ type: "attachment", attachment: { type: "credential_org", organizationUuid: uuid } });

function transcript(sid, lines) {
  fs.mkdirSync(transcripts, { recursive: true });
  const p = path.join(transcripts, `${sid}.jsonl`);
  fs.writeFileSync(p, `${lines.join("\n")}\n`);
  return p;
}
const loginAs = (orgUuid) =>
  fs.writeFileSync(claudeJson, JSON.stringify({ oauthAccount: { organizationUuid: orgUuid, emailAddress: "x@example.com", accountUuid: "secret-ish" } }));
const label = (sid, fields) => {
  fs.mkdirSync(path.join(inbox, "label"), { recursive: true });
  fs.writeFileSync(path.join(inbox, "label", `${sid}.json`), JSON.stringify({ session_id: sid, ...fields }));
};
const heartbeatAt = (sid, at) => {
  fs.mkdirSync(path.join(inbox, "status"), { recursive: true });
  fs.writeFileSync(path.join(inbox, "status", `${sid}.json`), JSON.stringify({ session_id: sid, state: "idle", at: new Date(at).toISOString() }));
};
const lockFile = (name, fields) => {
  fs.mkdirSync(locks, { recursive: true });
  fs.writeFileSync(path.join(locks, `${name}.lock`), JSON.stringify(fields));
};
const auditLines = () =>
  fs.existsSync(path.join(inbox, "audit.log"))
    ? fs.readFileSync(path.join(inbox, "audit.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l))
    : [];
// A session that stopped mid-work in the given account.
function session(sid, { orgUuid = ORG_1, ago = 5, say = "working on it", task, state } = {}) {
  const tp = transcript(sid, [org(orgUuid), title(`Title ${sid}`, sid), user(`do ${sid}`), assistant(say)]);
  if (task) label(sid, { task, state, cwd: root });
  writeDurum({ session_id: sid, transcript_path: tp, cwd: root }, { now: Date.now() - ago * MIN });
  return tp;
}

beforeEach(() => {
  for (const d of [inbox, locks, transcripts]) fs.rmSync(d, { recursive: true, force: true });
  fs.rmSync(claudeJson, { force: true });
});

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

// ---- the record ----

test("the record carries title, account, Claude's last words and Mert's last real message", () => {
  const tp = transcript("s1", [
    org(ORG_2),
    title("Old title", "s1"),
    user("first request"),
    assistant("first answer"),
    title("Schedule grid fix", "s1"),
    user("keep the password MAVI-KEDI-42 in mind"),
    toolResult("tool output that is not Mert"),
    meta("skill body that is not Mert"),
    user("<system-reminder>injected</system-reminder>"),
    assistant("Tamam."),
  ]);
  const rec = writeDurum({ session_id: "s1", transcript_path: tp, cwd: root });
  assert.equal(rec.title, "Schedule grid fix");
  assert.equal(rec.org, ORG_2);
  assert.equal(rec.lastAssistant, "Tamam.");
  assert.equal(rec.lastUser, "keep the password MAVI-KEDI-42 in mind");
  assert.deepEqual(readDurum("s1").lastUser, rec.lastUser);
});

test("the record keeps only its own fields, nothing from the login file", () => {
  loginAs(ORG_1);
  const tp = transcript("s1", [user("hi"), assistant("hello")]);
  const rec = writeDurum({ session_id: "s1", transcript_path: tp, cwd: root });
  const keys = Object.keys(rec).sort();
  assert.deepEqual(keys, [
    "at", "branch", "cwd", "dirty", "handedOff", "head", "lastAssistant", "lastUser", "locks", "org", "session_id", "state", "task", "title",
  ]);
  assert.ok(!JSON.stringify(rec).includes("secret-ish"));
  assert.ok(!JSON.stringify(rec).includes("x@example.com"));
});

test("long messages are cut: Claude's to 1500 characters, Mert's to 500", () => {
  const tp = transcript("s1", [user("u".repeat(900)), assistant("a".repeat(4000))]);
  const rec = writeDurum({ session_id: "s1", transcript_path: tp, cwd: root });
  assert.equal(rec.lastAssistant.length, 1500);
  assert.equal(rec.lastUser.length, 500);
});

test("only the transcript's tail is read, and the last message is still found", () => {
  const filler = Array.from({ length: 200 }, (_, i) => assistant(`old ${i} ${"x".repeat(500)}`));
  const tp = transcript("s1", [org(ORG_1), title("Early title", "s1"), ...filler, user("latest ask"), assistant("latest answer")]);
  const rec = writeDurum({ session_id: "s1", transcript_path: tp, cwd: root }, { tailBytes: 8 * 1024 });
  assert.equal(rec.lastAssistant, "latest answer");
  assert.equal(rec.lastUser, "latest ask");
});

test("title and account found once are kept when the tail no longer shows them", () => {
  const tp = transcript("s1", [org(ORG_2), title("Kept title", "s1"), user("a"), assistant("b")]);
  writeDurum({ session_id: "s1", transcript_path: tp, cwd: root });
  const filler = Array.from({ length: 200 }, (_, i) => assistant(`more ${i} ${"x".repeat(500)}`));
  fs.appendFileSync(tp, `${filler.join("\n")}\n${assistant("newest")}\n`);
  const rec = writeDurum({ session_id: "s1", transcript_path: tp, cwd: root }, { tailBytes: 8 * 1024 });
  assert.equal(rec.title, "Kept title");
  assert.equal(rec.org, ORG_2);
  assert.equal(rec.lastAssistant, "newest");
});

test("the record takes the work folder, task and state from the session's label and names its locks", () => {
  const tp = transcript("s1", [user("a"), assistant("b")]);
  label("s1", { task: "EKRAN-01", state: "SURUYOR: grid", cwd: root });
  lockFile("db", { identity: "oturum/ekran-01", session: "s1", startedAt: new Date().toISOString() });
  lockFile("main", { identity: "other/x", session: "s2", startedAt: new Date().toISOString() });
  const rec = writeDurum({ session_id: "s1", transcript_path: tp, cwd: "C:/elsewhere" });
  assert.equal(rec.task, "EKRAN-01");
  assert.equal(rec.state, "SURUYOR: grid");
  assert.equal(rec.cwd, root);
  assert.deepEqual(rec.locks, ["db"]);
});

test("a later write keeps the handoff mark", () => {
  const tp = session("s1");
  handoff("s1", "s9");
  const rec = writeDurum({ session_id: "s1", transcript_path: tp, cwd: root });
  assert.equal(rec.handedOff.to, "s9");
});

// ---- the takeover list ----

test("the list shows unfinished sessions of the last hours, newest first", () => {
  session("old", { ago: 30 * 60 });
  session("done", { task: "X", state: "TREN-HAZIR task/x @abc" });
  session("cleaned", { task: "Y", state: "TEMIZLENDI: dallar silindi" });
  session("given", {});
  handoff("given", "s9");
  session("a", { ago: 20 });
  session("b", { ago: 2 });
  assert.deepEqual(
    listDevir({ hours: 24 }).map((r) => r.session_id),
    ["b", "a"],
  );
});

// ---- handoff ----

test("handoff marks the old session and writes the audit log, even without an earlier record", () => {
  const r = handoff("never-recorded", "s9");
  assert.equal(r.ok, true);
  assert.equal(handedOff("never-recorded").to, "s9");
  assert.equal(handedOff("someone-else"), null);
  assert.ok(auditLines().some((l) => l.event === "handoff" && l.from === "never-recorded" && l.to === "s9"));
});

// ---- the opening hint ----

test("no hint when every unfinished session is in the account that is logged in", () => {
  loginAs(ORG_1);
  session("a", { orgUuid: ORG_1 });
  assert.equal(startHint({ session_id: "new" }), null);
});

test("the hint names the other account's unfinished sessions and the list command", () => {
  loginAs(ORG_1);
  session("a", { orgUuid: ORG_2, task: "EKRAN-01", state: "SURUYOR" });
  session("b", { orgUuid: ORG_2 });
  session("c", { orgUuid: ORG_1 });
  const hint = startHint({ session_id: "new" });
  assert.match(hint, /2 yarım oturum/);
  assert.match(hint, /EKRAN-01/);
  assert.match(hint, /node scripts\/devir\.mjs liste/);
  assert.ok(!hint.includes("Title c"));
});

test("no hint when the logged-in account can't be read", () => {
  session("a", { orgUuid: ORG_2 });
  assert.equal(startHint({ session_id: "new" }), null);
});

// ---- lock adoption ----

test("a lock whose holder is alive and not handed off is not adopted", () => {
  lockFile("db", { identity: "oturum/ekran-01", session: "s1", startedAt: new Date().toISOString() });
  heartbeatAt("s1", Date.now() - 2 * MIN);
  const r = adoptLock("db", "yeni/ekran-01", { session: "s9" });
  assert.equal(r.ok, false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(locks, "db.lock"), "utf8")).identity, "oturum/ekran-01");
});

test("a handed-off holder's lock moves to the new session and the audit log says so", () => {
  const started = new Date(Date.now() - 10 * MIN).toISOString();
  lockFile("db", { identity: "oturum/ekran-01", purpose: "test:db", session: "s1", startedAt: started });
  heartbeatAt("s1", Date.now() - 2 * MIN);
  handoff("s1", "s9");
  const r = adoptLock("db", "yeni/ekran-01", { session: "s9", cwd: root });
  assert.equal(r.ok, true);
  const held = JSON.parse(fs.readFileSync(path.join(locks, "db.lock"), "utf8"));
  assert.equal(held.identity, "yeni/ekran-01");
  assert.equal(held.session, "s9");
  assert.equal(held.purpose, "test:db");
  assert.equal(held.startedAt, started);
  assert.equal(held.adoptedFrom, "oturum/ekran-01");
  assert.ok(auditLines().some((l) => l.event === "lock-adopt" && l.lock === "db" && l.from === "oturum/ekran-01"));
});

test("a holder silent for more than 30 minutes loses its lock to the new session", () => {
  lockFile("heavy", { identity: "oturum/x", session: "s1", startedAt: new Date().toISOString() });
  heartbeatAt("s1", Date.now() - 45 * MIN);
  assert.equal(adoptLock("heavy", "yeni/x", { session: "s9" }).ok, true);
});

test("adoption refuses a free lock, an unknown lock and an identity without oturum/iş", () => {
  assert.equal(adoptLock("db", "yeni/x", { session: "s9" }).ok, false);
  assert.equal(adoptLock("nope", "yeni/x", { session: "s9" }).ok, false);
  lockFile("db", { identity: "oturum/x", session: "s1", startedAt: new Date().toISOString() });
  handoff("s1", "s9");
  assert.equal(adoptLock("db", "no-slash", { session: "s9" }).ok, false);
});

// ---- command line ----

const run = (args, input = "") =>
  spawnSync(process.execPath, [SCRIPT, ...args], { input, env: { ...process.env, CLAUDE_CODE_SESSION_ID: "s9" }, encoding: "utf8" });

test("the CLI lists, hands off and adopts", () => {
  session("a", { task: "EKRAN-01", state: "SURUYOR" });
  lockFile("db", { identity: "oturum/ekran-01", session: "a", startedAt: new Date().toISOString() });
  heartbeatAt("a", Date.now());
  assert.match(run(["liste"]).stdout, /EKRAN-01/);
  assert.equal(run(["devret", "a"]).status, 0);
  assert.equal(handedOff("a").to, "s9");
  assert.equal(run(["kilit-al", "db", "yeni/ekran-01"]).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(locks, "db.lock"), "utf8")).session, "s9");
});

test("the start hook prints context only when there is something to say, and never fails", () => {
  loginAs(ORG_1);
  const quiet = run(["hook", "start"], JSON.stringify({ session_id: "new", hook_event_name: "SessionStart" }));
  assert.equal(quiet.status, 0);
  assert.equal(quiet.stdout, "");
  session("a", { orgUuid: ORG_2, task: "EKRAN-01", state: "SURUYOR" });
  const loud = run(["hook", "start"], JSON.stringify({ session_id: "new", hook_event_name: "SessionStart" }));
  assert.equal(loud.status, 0);
  assert.match(JSON.parse(loud.stdout).hookSpecificOutput.additionalContext, /EKRAN-01/);
  assert.equal(run(["hook", "start"], "not json").status, 0);
});
