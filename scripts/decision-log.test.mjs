#!/usr/bin/env node
// KARAR-001: coverage for the AskUserQuestion decision log (decision-log.mjs).
// Runs against a throwaway inbox folder -- never the real .newfork-inbox.
// Run: node --test scripts/decision-log.test.mjs
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "newfork-decision-test-"));
process.env.NEWFORK_INBOX_DIR = path.join(root, "inbox");
const { runHook, readLog, stats, backfill, classify } = await import("./decision-log.mjs");

beforeEach(() => fs.rmSync(process.env.NEWFORK_INBOX_DIR, { recursive: true, force: true }));
after(() => fs.rmSync(root, { recursive: true, force: true }));

const Q = "Ayşe'nin Salı vardiyası varken exclude işaretlenirse ne olsun?";
const question = (recDescription, recLabel = "Vardiya kalır (Önerilen)") => ({
  question: Q,
  header: "Exclude",
  multiSelect: false,
  options: [
    { label: recLabel, description: recDescription },
    { label: "Vardiya düşer", description: "Taslaktan silinir." },
  ],
});
const ask = (questions, extra = {}) => ({ tool_name: "AskUserQuestion", session_id: "s-1", tool_input: { questions }, ...extra });
const decision = (out) => JSON.parse(out).hookSpecificOutput;

test("recommended option without a Dayanak line goes back to Claude", () => {
  const out = decision(runHook("pre", ask([question("Yayınlanmış vardiya korunur.")])));
  assert.equal(out.permissionDecision, "deny");
  assert.match(out.permissionDecisionReason, /Dayanak:/);
  assert.equal(readLog()[0].type, "blocked");
});

test("recommended option with a Dayanak line reaches Mert", () => {
  assert.equal(runHook("pre", ask([question("Yayınlanmış vardiya korunur.\nDayanak: ILKELER P09")])), "");
  assert.equal(runHook("pre", ask([question("Dayanak: yok — yeni karar")])), "");
});

test("a variant recommendation label goes back to Claude", () => {
  for (const label of ["Vardiya kalır (Öneri)", "Vardiya kalır (Recommended)", "Vardiya kalır (B, Önerilen)"]) {
    const out = decision(runHook("pre", ask([question("Dayanak: ILKELER P09", label)])));
    assert.equal(out.permissionDecision, "deny", label);
    assert.match(out.permissionDecisionReason, /tek biçim/);
  }
});

test("a warning label is not a recommendation; an empty Dayanak line is not a basis", () => {
  const warned = {
    question: Q,
    header: "Uyarı",
    multiSelect: false,
    options: [
      { label: "Vardiya kalır (Önerilen)", description: "Dayanak: ILKELER P09" },
      { label: "Force push (not recommended)", description: "" },
      { label: "Hepsini sil (önerilmez)", description: "" },
    ],
  };
  assert.equal(runHook("pre", ask([warned])), "");
  assert.equal(decision(runHook("pre", ask([question("Dayanak:\nYayınlanmış vardiya korunur.")]))).permissionDecision, "deny");
  assert.equal(decision(runHook("pre", ask([question("x", "Vardiya kalır (ÖNERİLEN)")]))).permissionDecision, "deny");
});

test("a skipped question ([No preference]) is not free text", () => {
  const q = question("Dayanak: ILKELER P09");
  assert.equal(runHook("post", ask([q], { tool_response: { questions: [q], answers: { [Q]: "[No preference]" } } })), "");
  assert.equal(readLog()[0].kind, "unanswered");
  assert.equal(stats(readLog()).total.free, 0);
});

test("one unreadable log line drops only that line and backfill does not duplicate", () => {
  const q = question("Dayanak: ILKELER P09");
  runHook("post", ask([q], { tool_use_id: "t9", tool_response: { questions: [q], answers: { [Q]: "Vardiya düşer" } } }));
  const log = path.join(process.env.NEWFORK_INBOX_DIR, "decisions.jsonl");
  fs.writeFileSync(log, "﻿" + fs.readFileSync(log, "utf8") + '{"torn":');
  assert.equal(readLog().length, 1);
  runHook("post", ask([q], { tool_use_id: "t10", tool_response: { questions: [q], answers: { [Q]: "Vardiya düşer" } } }));
  assert.equal(readLog().length, 2);
});

test("a question without a recommendation and other tools pass untouched", () => {
  const plain = { question: Q, header: "x", multiSelect: false, options: [{ label: "A", description: "" }, { label: "B", description: "" }] };
  assert.equal(runHook("pre", ask([plain])), "");
  assert.equal(runHook("pre", { tool_name: "Bash", tool_input: { command: "ls" } }), "");
});

test("a broken hook input lets the question through", () => {
  assert.equal(runHook("pre", ask(5)), "");
  assert.equal(runHook("pre", { tool_name: "AskUserQuestion", tool_input: { questions: [{ options: [null] }] } }), "");
  assert.equal(runHook("post", { tool_name: "AskUserQuestion", tool_response: { questions: 7 } }), "");
});

test("picking the recommendation is logged without a reminder", () => {
  const q = question("Dayanak: ILKELER P09");
  const out = runHook("post", ask([q], { tool_response: { questions: [q], answers: { [Q]: "Vardiya kalır (Önerilen)" } } }));
  assert.equal(out, "");
  const [row] = readLog();
  assert.equal(row.kind, "picked_rec");
  assert.equal(row.dayanak, "ILKELER P09");
});

test("a free-text answer is logged and Claude is told to write the rule", () => {
  const q = question("Dayanak: yok — yeni karar");
  const answer = "Published shiftler düşmez; yeni draft açılınca gizlenir.";
  const out = decision(runHook("post", ask([q], { tool_response: { questions: [q], answers: { [Q]: answer } } })));
  assert.equal(out.hookEventName, "PostToolUse");
  assert.match(out.additionalContext, /KARARLAR\.md/);
  assert.match(out.additionalContext, /Published shiftler düşmez/);
  assert.equal(readLog()[0].kind, "free_text");
});

test("a non-recommended option triggers a short miss note; answers may come from tool_input", () => {
  const q = question("Dayanak: ILKELER P09");
  const out = decision(runHook("post", ask([q], { tool_input: { questions: [q], answers: { [Q]: "Vardiya düşer" } } })));
  assert.match(out.additionalContext, /önerin tutmadı/);
  assert.equal(readLog()[0].kind, "picked_other");
});

test("multi-select answers split into options-only or free text", () => {
  const q = { question: "Neler değişsin?", multiSelect: true, options: [{ label: "A, kısa" }, { label: "B" }, { label: "C" }] };
  assert.equal(classify(q, ["A, kısa", "C"]).kind, "multi");
  assert.equal(classify(q, "A, kısa,B").kind, "multi");
  assert.equal(classify(q, "B, ayrıca D de olsun").kind, "free_text");
});

test("stats counts single-select recommended questions per week", () => {
  const rows = [
    { type: "answer", ts: "2026-09-29T10:00:00Z", rec: "A (Önerilen)", kind: "picked_rec" },
    { type: "answer", ts: "2026-09-30T10:00:00Z", rec: "A (Önerilen)", kind: "picked_other" },
    { type: "answer", ts: "2026-09-30T11:00:00Z", rec: "A (Önerilen)", kind: "free_text" },
    { type: "answer", ts: "2026-09-30T12:00:00Z", rec: "A (Önerilen)", kind: "multi", multiSelect: true },
    { type: "answer", ts: "2026-09-30T13:00:00Z", rec: null, kind: "no_rec" },
    { type: "blocked", ts: "2026-09-30T14:00:00Z" },
  ];
  const s = stats(rows);
  assert.deepEqual(s.weeks, [{ week: "2026-09-28", rec: 1, other: 1, free: 1, blocked: 1, pct: 33.3 }]);
});

test("backfill imports answered questions once", () => {
  const projects = path.join(root, "projects");
  const folder = path.join(projects, "C--x-newfork-clean");
  fs.mkdirSync(folder, { recursive: true });
  const q = question("Dayanak: ILKELER P09");
  const lines = [
    { timestamp: "2026-09-30T09:00:00Z", sessionId: "s-9", message: { content: [{ type: "tool_use", id: "t1", name: "AskUserQuestion", input: { questions: [q] } }] } },
    {
      timestamp: "2026-09-30T09:01:00Z",
      toolUseResult: { questions: [q], answers: { [Q]: "Vardiya düşer" } },
      message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "answered" }] },
    },
    { timestamp: "2026-09-30T09:02:00Z", message: { content: [{ type: "tool_use", id: "t2", name: "AskUserQuestion", input: { questions: [q] } }] } },
    { timestamp: "2026-09-30T09:03:00Z", message: { content: [{ type: "tool_result", tool_use_id: "t2", content: `User answered: "${Q}"="Vardiya kalır (Önerilen)".` }] } },
  ];
  fs.writeFileSync(path.join(folder, "a.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n"));
  fs.mkdirSync(path.join(projects, "other-project"));
  assert.equal(backfill(projects), 2);
  assert.equal(backfill(projects), 0);
  assert.deepEqual(readLog().map((r) => r.kind), ["picked_other", "picked_rec"]);
});
