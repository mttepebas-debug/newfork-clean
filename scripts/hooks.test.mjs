#!/usr/bin/env node
// WORKFLOW-V2: scripts/hooks.mjs in throwaway folders. Run: node --test scripts/hooks.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { agentReport, sessionStart, jobOf } from "./hooks.mjs";
import { redact } from "./ops.mjs";

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

test("agent-report: tokens and passwords in the message are masked in the daily-log file", () => {
  const dir = tmp();
  const secret = [
    "İŞ: BL-7 | DURUM: HAZIR",
    "token=ghp_abcdef1234567890",
    "PGPASSWORD=hunter2 psql",
    "postgres://postgres:S3cretPw@127.0.0.1:54322/postgres",
    "password: p4ssw0rd",
    "Authorization: Bearer eyJhbGciOi.payload.sig",
  ].join("\n");
  const file = agentReport({ agent_id: "a7", agent_type: "nf-isci", last_assistant_message: secret }, { projectDir: dir, now: at });
  const body = fs.readFileSync(file, "utf8");
  for (const leak of ["ghp_abcdef1234567890", "hunter2", "S3cretPw", "p4ssw0rd", "eyJhbGciOi"]) assert.doesNotMatch(body, new RegExp(leak), leak);
  assert.match(body, /İŞ: BL-7 \| DURUM: HAZIR/);
  assert.match(body, /token=\*\*\*/);
});

test("redact: KEY=value and JSON keys ending in KEY/TOKEN/SECRET/PASSWORD/PWD, known key prefixes and JWTs; prose stays", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlLXZhbHVl";
  const masked = {
    "STRIPE_SECRET_KEY=sk_live_51AbCdEfGhIjKlMn": "sk_live_51AbCdEfGhIjKlMn",
    [`SUPABASE_SERVICE_ROLE_KEY=${jwt}`]: jwt,
    'export RESEND_API_KEY="re_live_value_123"': "re_live_value_123",
    "DB_PWD=hunter22": "hunter22",
    "github_token=abc123def": "abc123def",
    '{"password": "pa ss w0rd", "user": "ada"}': "pa ss w0rd",
    '{"apiKey":"k-123-456"}': "k-123-456",
    '"SERVICE_ROLE_KEY" : "srk-value"': "srk-value",
    "anahtar ghp_abcdefghijklmnopqrstuvwxyz0123456789 burada": "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    "gho_abcdefghijklmnop0123": "gho_abcdefghijklmnop0123",
    "github_pat_11ABCDEFG0123456789_abcdefghij": "github_pat_11ABCDEFG0123456789_abcdefghij",
    "sbp_0123456789abcdef0123456789abcdef01234567": "sbp_0123456789abcdef0123456789abcdef01234567",
    "rk_live_abcdef123456": "rk_live_abcdef123456",
    "whsec_abcdef123456": "whsec_abcdef123456",
    "Resend: re_AbCdEfGh_IjKlMnOpQrStUvWx": "re_AbCdEfGh_IjKlMnOpQrStUvWx",
    [`jwt ${jwt} bitti`]: jwt,
  };
  for (const [line, value] of Object.entries(masked)) {
    const out = redact(line);
    assert.ok(!out.includes(value), `${line} -> ${out}`);
    assert.match(out, /\*\*\*/, line);
  }
  for (const prose of [
    "token budget is 200k",
    "the key point: tests first",
    "secret sauce",
    "password reset flow",
    "re_render the list",
    "keyboard=true",
    "Monkey: banana",
    "eyJ alone. not.a.jwt",
  ])
    assert.equal(redact(prose), prose);
  assert.equal(redact("token=ghp_x"), "token=***");
});

// The hooks are wired in the shared .claude/settings.json, so every session runs them; only the coordinator's
// checkout (branch coord/kayit) writes the daily log or gets DURUM.md back. NEWFORK_INBOX_DIR points the
// fallback folder (<OPS_DIR>/gunluk-yedek) at a temp dir, never the real .newfork-inbox.
function checkout(branch, { durum = true } = {}) {
  const dir = tmp();
  execFileSync("git", ["init", "-q", "-b", branch, dir]);
  execFileSync("git", ["-C", dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init"]);
  if (durum) fs.writeFileSync(path.join(dir, "DURUM.md"), "# Durum\n🟢 iyi\n");
  return dir;
}
const cli = (cmd, dir, input, ops = tmp()) =>
  spawnSync(process.execPath, [fileURLToPath(new URL("./hooks.mjs", import.meta.url)), cmd], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, NEWFORK_INBOX_DIR: ops },
  });
const report = { agent_id: "a1", agent_type: "nf-isci", last_assistant_message: "İŞ: BL-8 | DURUM: HAZIR" };

test("CLI: only the coordinator's checkout (coord/kayit) writes the agent report and gets DURUM.md back", () => {
  const coord = checkout("coord/kayit");
  const ops = tmp();
  const a = cli("agent-report", coord, report, ops);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(fs.readdirSync(path.join(coord, "docs/plan/gunluk")).length, 1);
  assert.equal(fs.existsSync(path.join(ops, "gunluk-yedek")), false);
  const s = cli("session-start", coord, { source: "startup" });
  assert.equal(s.status, 0, s.stderr);
  assert.match(JSON.parse(s.stdout).hookSpecificOutput.additionalContext, /# Durum/);

  const other = checkout("main", { durum: false });
  const b = cli("agent-report", other, report, ops);
  assert.equal(b.status, 0, b.stderr);
  assert.equal(fs.existsSync(path.join(other, "docs")), false);
  assert.equal(fs.existsSync(path.join(ops, "gunluk-yedek")), false);
  const t = cli("session-start", other, { source: "startup" });
  assert.equal(t.status, 0, t.stderr);
  assert.equal(t.stdout, "");
});

test("CLI: a checkout off coord/kayit that has DURUM.md (detached HEAD, a rebase) keeps the report in <OPS_DIR>/gunluk-yedek", () => {
  const coord = checkout("coord/kayit");
  execFileSync("git", ["-C", coord, "checkout", "-q", "--detach"]);
  const ops = tmp();
  const r = cli("agent-report", coord, { ...report, last_assistant_message: "İŞ: BL-8 | DURUM: HAZIR\ntoken=ghp_abcdef1234567890" }, ops);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(path.join(coord, "docs")), false); // the coordinator's tree is mid-rebase: not written to
  const days = fs.readdirSync(path.join(ops, "gunluk-yedek"));
  assert.equal(days.length, 1);
  const files = fs.readdirSync(path.join(ops, "gunluk-yedek", days[0]));
  assert.equal(files.length, 1);
  assert.match(files[0], /^\d{4}-BL-8-nf-isci-a1\.md$/);
  const body = fs.readFileSync(path.join(ops, "gunluk-yedek", days[0], files[0]), "utf8");
  assert.match(body, /İŞ: BL-8/);
  assert.doesNotMatch(body, /ghp_abcdef/);
});

test("the CLI never fails the session: broken stdin still exits 0", () => {
  assert.equal(cli("agent-report", tmp(), "{not json").status, 0);
});
