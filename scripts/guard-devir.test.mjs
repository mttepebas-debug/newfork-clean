#!/usr/bin/env node
// OTOMASYON-4: guard.mjs stops a session that was handed over to another one (account switch),
// so an old session that wakes up after its limit resets can't work the same folder twice.
// ILKELER P16: warning until guard's ENFORCE_DAY, refusal after. Throwaway temp folders only.
// Run: node --test scripts/guard-devir.test.mjs
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "newfork-guard-devir-test-"));
process.env.NEWFORK_LOCK_DIR = path.join(root, "locks");
process.env.NEWFORK_INBOX_DIR = path.join(root, "inbox");

const { evaluate, ENFORCE_FROM } = await import("./guard.mjs");
const { handoff } = await import("./devir.mjs");

const before = ENFORCE_FROM - 60_000;
const afterDay = ENFORCE_FROM + 60_000;
const bash = (session, command = "git status") => ({ tool_name: "Bash", session_id: session, cwd: root, tool_input: { command } });
const edit = (session) => ({ tool_name: "Edit", session_id: session, cwd: root, tool_input: { file_path: path.join(root, "a.txt") } });
const audit = () =>
  fs.existsSync(path.join(root, "inbox", "audit.log"))
    ? fs.readFileSync(path.join(root, "inbox", "audit.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l))
    : [];

beforeEach(() => {
  fs.rmSync(path.join(root, "inbox"), { recursive: true, force: true });
  fs.rmSync(path.join(root, "locks"), { recursive: true, force: true });
});

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test("a session that was not handed over is not touched", () => {
  const r = evaluate(bash("live"), before);
  assert.equal(r.block, false);
  assert.ok(!String(r.warn ?? "").includes("devredildi"));
});

test("a handed-over session gets a warning before the enforcement day, and it is logged", () => {
  handoff("old", "new");
  const r = evaluate(bash("old"), before);
  assert.equal(r.block, false);
  assert.match(r.warn, /devredildi/);
  assert.match(r.warn, /new/);
  assert.ok(audit().some((l) => l.event === "handoff-warn" && l.session_id === "old"));
});

test("a handed-over session is refused after the enforcement day, for commands and for edits", () => {
  handoff("old", "new");
  const cmd = evaluate(bash("old"), afterDay);
  assert.equal(cmd.block, true);
  assert.match(cmd.message, /devredildi/);
  const ed = evaluate(edit("old"), afterDay);
  assert.equal(ed.block, true);
  assert.ok(audit().some((l) => l.event === "handoff-block"));
});

test("NF_OVERRIDE lets a handed-over session's command through, logged", () => {
  handoff("old", "new");
  const r = evaluate(bash("old", 'NF_OVERRIDE="Mert asked to finish one step" git status'), afterDay);
  assert.equal(r.block, false);
  assert.ok(audit().some((l) => l.event === "handoff-override"));
});

test("the new session is not stopped by its predecessor's mark", () => {
  handoff("old", "new");
  assert.equal(evaluate(bash("new"), afterDay).block, false);
});
