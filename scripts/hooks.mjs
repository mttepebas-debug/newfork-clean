#!/usr/bin/env node
// WORKFLOW-V2 (spec §5.5, §8.2): the coordinator session's two hooks, wired in .claude/settings.json.
//   agent-report   SubagentStop: the agent's last message -> docs/plan/gunluk/<day>/<HHMM>-<job>-<agent>-<id8>.md,
//                  so no report is lost to a missed notification or a compacted context.
//   session-start  SessionStart (startup, resume, clear, compact): the top of DURUM.md back into the context.
// Both read the hook JSON on stdin, write under CLAUDE_PROJECT_DIR and never fail the session (exit 0).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const pad = (n) => String(n).padStart(2, "0");
export const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d) => `${pad(d.getHours())}${pad(d.getMinutes())}`;
const safe = (s, n) => String(s ?? "").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, n);

// "İŞ: EKRAN-02 | DURUM: HAZIR | …" (spec §5.4) -> "EKRAN-02"
export const jobOf = (text) => String(text ?? "").match(/^\s*[İI][ŞS]\s*:\s*([^\s|]+)/mu)?.[1] ?? null;

// The last text an agent wrote, from its transcript (one JSON object per line).
function lastText(file) {
  let lines;
  try {
    lines = fs.readFileSync(file, "utf8").split("\n");
  } catch {
    return "";
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    let o;
    try {
      o = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (o?.type !== "assistant") continue;
    const c = o.message?.content;
    const text = typeof c === "string" ? c : Array.isArray(c) ? c.filter((p) => p?.type === "text").map((p) => p.text).join("\n") : "";
    if (text.trim()) return text;
  }
  return "";
}

export function agentReport(input, { projectDir, now = new Date() }) {
  const text = String(input.last_assistant_message ?? "").trim() || lastText(input.agent_transcript_path).trim();
  const job = safe(jobOf(text) ?? "is-yok", 40) || "is-yok";
  const agent = safe(input.agent_type ?? "ajan", 24) || "ajan";
  const id = safe(input.agent_id ?? "", 8);
  const dir = path.join(projectDir, "docs", "plan", "gunluk", day(now));
  fs.mkdirSync(dir, { recursive: true });
  const stem = path.join(dir, [hhmm(now), job, agent, id].filter(Boolean).join("-"));
  let file = `${stem}.md`;
  for (let k = 2; fs.existsSync(file); k++) file = `${stem}-${k}.md`;
  fs.writeFileSync(file, `<!-- ajan: ${input.agent_type ?? "?"} · id: ${input.agent_id ?? "?"} · ${now.toISOString()} -->\n${text || "(son mesaj boş)"}\n`);
  return file;
}

const MAX = 6000;
export function sessionStart(input, { projectDir }) {
  let durum;
  try {
    durum = fs.readFileSync(path.join(projectDir, "DURUM.md"), "utf8");
  } catch {
    return null;
  }
  const head = durum.length > MAX ? `${durum.slice(0, MAX)}\n… (devamı DURUM.md'de)` : durum;
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: `Koordinatörün panosu, DURUM.md (${input.source ?? "?"}). Koordinatörsen işe buradan devam et; değilsen yalnız bilgi içindir.\n\n${head}`,
    },
  };
}

async function main([cmd]) {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let input = {};
  try {
    input = JSON.parse(raw || "{}");
  } catch {}
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    if (cmd === "agent-report") agentReport(input, { projectDir });
    else if (cmd === "session-start") {
      const out = sessionStart(input, { projectDir });
      if (out) process.stdout.write(JSON.stringify(out));
    } else process.stderr.write("usage: node scripts/hooks.mjs agent-report|session-start   (hook JSON on stdin)\n");
  } catch (err) {
    process.stderr.write(`hooks.mjs ${cmd}: ${err?.message ?? err}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
