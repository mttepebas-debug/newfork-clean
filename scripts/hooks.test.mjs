#!/usr/bin/env node
// WORKFLOW-V2: scripts/hooks.mjs in throwaway folders. Run: node --test scripts/hooks.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { agentReport, sessionStart, jobOf } from "./hooks.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "newfork-hooks-"));
const at = new Date(2026, 9, 8, 9, 5); // local 2026-10-08 09:05
const rel = (dir, file) => path.relative(dir, file).replaceAll("\\", "/");

test("jobOf reads the job id from the contract's first line", () => {
  assert.equal(jobOf("İŞ: EKRAN-02 | DURUM: HAZIR | DAL: task/ekran-02@abc"), "EKRAN-02");
  assert.equal(jobOf("Özet\nİŞ: BL-987 | DURUM: SORU"), "BL-987");
  assert.equal(jobOf("hiç sözleşme yok"), null);
});

test("agent-report: the last message lands in docs/plan/gunluk/<day>/<HHMM>-<job>-<agent>-<id8>.md", () => {
  const dir = tmp();
  const file = agentReport(
    { agent_id: "a1b2c3d4e5", agent_type: "nf-isci", last_assistant_message: "İŞ: BL-1 | DURUM: HAZIR\nbitti" },
    { projectDir: dir, now: at },
  );
  assert.equal(rel(dir, file), "docs/plan/gunluk/2026-10-08/0905-BL-1-nf-isci-a1b2c3d4.md");
  assert.match(fs.readFileSync(file, "utf8"), /ajan: nf-isci[\s\S]*İŞ: BL-1 \| DURUM: HAZIR\nbitti/);
});

test("agent-report: the same minute twice keeps both files", () => {
  const dir = tmp();
  const input = { agent_id: "a1", agent_type: "nf-okur", last_assistant_message: "İŞ: BL-1 | DURUM: HAZIR" };
  const one = agentReport(input, { projectDir: dir, now: at });
  const two = agentReport(input, { projectDir: dir, now: at });
  assert.notEqual(one, two);
  assert.equal(fs.readdirSync(path.dirname(one)).length, 2);
});

test("agent-report: no last message falls back to the agent's transcript, then to a placeholder", () => {
  const dir = tmp();
  const tr = path.join(dir, "agent.jsonl");
  fs.writeFileSync(
    tr,
    [
      JSON.stringify({ type: "user", message: { content: "x" } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "İŞ: BL-2 | DURUM: TAKILDI" }] } }),
      "{broken",
    ].join("\n"),
  );
  const f1 = agentReport({ agent_type: "nf-isci", agent_transcript_path: tr }, { projectDir: dir, now: at });
  assert.match(fs.readFileSync(f1, "utf8"), /İŞ: BL-2/);
  const f2 = agentReport({ agent_type: "nf-okur" }, { projectDir: dir, now: at });
  assert.match(fs.readFileSync(f2, "utf8"), /\(son mesaj boş\)/);
  assert.match(path.basename(f2), /^0905-is-yok-nf-okur/);
});

test("session-start: the top of DURUM.md goes back into context; no DURUM.md, no output", () => {
  const dir = tmp();
  assert.equal(sessionStart({ source: "compact" }, { projectDir: dir }), null);
  fs.writeFileSync(path.join(dir, "DURUM.md"), `# Durum — 2026-10-08 10:00\n🟢 iyi\n## Koşuyor\n- BL-1\n${"x\n".repeat(5000)}`);
  const out = sessionStart({ source: "compact" }, { projectDir: dir });
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(out.hookSpecificOutput.additionalContext, /DURUM\.md \(compact\)[\s\S]*## Koşuyor\n- BL-1/);
  assert.ok(out.hookSpecificOutput.additionalContext.length <= 6500);
});

test("the CLI never fails the session: broken stdin still exits 0", () => {
  const script = fileURLToPath(new URL("./hooks.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [script, "agent-report"], { input: "{not json", encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: tmp() } });
  assert.equal(r.status, 0);
});
