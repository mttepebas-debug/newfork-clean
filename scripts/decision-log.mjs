#!/usr/bin/env node
// KARAR-001: Mert's decision log (CLAUDE.md §2.6, docs/plan/KARARLAR.md).
// Every AskUserQuestion answer is appended to decisions.jsonl in the git-free ops
// folder (OPS_DIR), so recommendation accuracy is measured and free-text answers become
// written rules instead of living only in a transcript.
//   hook pre   PreToolUse AskUserQuestion: a recommended option must be labelled exactly
//              "(Önerilen)" and its description must carry a "Dayanak:" line; otherwise
//              the question goes back to Claude (deny + reason) and never reaches Mert
//   hook post  PostToolUse AskUserQuestion: log each question + answer; an answer outside
//              the options (or with notes) reminds Claude to write it down as a rule
//   stats [weeks]            recommendation acceptance per week (default last 8)
//   backfill [projectsDir]   import past answers from Claude Code transcripts (idempotent)
// Hooks never break a session: any internal error lets the question through. Fail-open is
// deliberate here -- this is a format check, not an access rule.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { OPS_DIR as INBOX_DIR } from "./ops.mjs";

export const LOG = path.join(INBOX_DIR, "decisions.jsonl");
const LABEL = "(Önerilen)";
const REC_ANY = /\([^)]*?(önerilen|onerilen|öneri|oneri|tavsiye|recommended)[^)]*\)/iu;
// "(not recommended)", "(önerilmez)" warn against an option; they are not a recommendation.
const NEG = /\([^)]*?(not\s+recommended|önerilmez|önerilmeyen|tavsiye\s+edilmez)[^)]*\)/giu;
const DAYANAK = /dayanak\s*:[ \t]*(\S[^\n]*)/iu;
// Claude Code's own value when Mert skips a question; not text he typed.
const NO_CHOICE = /^\[no preference\]$/i;

// "İ" does not case-fold under /iu, so labels are lower-cased the Turkish way first.
const isRec = (label) => REC_ANY.test(String(label ?? "").toLocaleLowerCase("tr").replace(NEG, ""));
const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n)}…` : String(s));

function append(rows) {
  if (!rows.length) return;
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  let lead = "";
  try {
    const text = fs.readFileSync(LOG, "utf8");
    if (text && !text.endsWith("\n")) lead = "\n"; // never glue a row onto a torn last line
  } catch {}
  fs.appendFileSync(LOG, lead + rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

// One unreadable line (a BOM from Notepad, a torn write) drops that line only, never the log:
// an empty read would make backfill append every past answer a second time.
export function readLog() {
  let raw;
  try {
    raw = fs.readFileSync(LOG, "utf8");
  } catch {
    return [];
  }
  return raw
    .replace(/^﻿/, "")
    .split("\n")
    .filter((l) => l.trim())
    .flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    });
}

export function checkQuestions(questions) {
  const problems = [];
  for (const q of questions ?? []) {
    const name = `"${clip(q.header || q.question || "?", 60)}"`;
    const recs = (q.options ?? []).filter((o) => isRec(o.label));
    if (recs.length > 1 && !q.multiSelect) problems.push(`${name}: tek seçimli soruda birden fazla önerilen seçenek var`);
    for (const o of recs) {
      if (!o.label.includes(LABEL)) problems.push(`${name}: etiket "${o.label}"; tek biçim "${LABEL}"`);
      if (!DAYANAK.test(o.description ?? "")) problems.push(`${name}: önerilen seçeneğin açıklamasında "Dayanak:" satırı yok`);
    }
  }
  return problems;
}

// Single-select: exact label match. Multi-select arrives as an array or a comma-joined
// string; it counts as options-only when nothing but separators is left after removing
// the selected labels.
export function classify(q, rawAnswer) {
  const labels = (q.options ?? []).map((o) => String(o.label ?? "").trim());
  const rec = labels.find(isRec) ?? null;
  if (rawAnswer == null || rawAnswer === "") return { rec, answer: null, kind: "unanswered" };
  const answer = Array.isArray(rawAnswer) ? rawAnswer.map(String).join(", ") : String(rawAnswer).trim();
  if (NO_CHOICE.test(answer)) return { rec, answer, kind: "unanswered" };
  if (q.multiSelect) {
    let rest = answer;
    for (const l of [...labels].sort((a, b) => b.length - a.length)) if (l) rest = rest.split(l).join("");
    return { rec, answer, kind: rest.replace(/[\s,]/g, "") ? "free_text" : "multi" };
  }
  if (answer === rec) return { rec, answer, kind: "picked_rec" };
  if (labels.includes(answer)) return { rec, answer, kind: rec ? "picked_other" : "no_rec" };
  return { rec, answer, kind: "free_text" };
}

// Fallback for a plain-text tool result: `"<question>"="<answer>", ...`
export function parseResultText(text) {
  const out = {};
  for (const m of String(text ?? "").matchAll(/"([^"]+)"="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

function toRows(questions, answers, annotations, meta) {
  return (questions ?? []).map((q) => {
    const { rec, answer, kind } = classify(q, answers?.[q.question]);
    const recOpt = (q.options ?? []).find((o) => isRec(o.label));
    const notes = annotations?.[q.question]?.notes ?? null;
    return {
      ...meta,
      type: "answer",
      header: q.header ?? null,
      question: q.question,
      multiSelect: !!q.multiSelect,
      options: (q.options ?? []).map((o) => o.label),
      rec,
      dayanak: recOpt ? (DAYANAK.exec(recOpt.description ?? "")?.[1]?.trim() ?? null) : null,
      answer,
      notes,
      kind,
    };
  });
}

export function record(input, now = new Date()) {
  const t = input.tool_response;
  const res = t && typeof t === "object" ? t : {};
  const questions = res.questions ?? input.tool_input?.questions ?? [];
  const answers = res.answers ?? input.tool_input?.answers ?? (typeof t === "string" ? parseResultText(t) : {});
  const annotations = res.annotations ?? input.tool_input?.annotations ?? {};
  const rows = toRows(questions, answers, annotations, {
    ts: now.toISOString(),
    source: "hook",
    session_id: input.session_id ?? null,
    cwd: input.cwd ?? null,
    tool_use_id: input.tool_use_id ?? null,
  });
  append(rows);
  return rows;
}

export function reminder(rows) {
  const loose = rows.filter((r) => r.kind === "free_text" || r.notes);
  const missed = rows.filter((r) => r.kind === "picked_other" && !r.notes);
  const out = [];
  if (loose.length) {
    out.push("KARAR-001 karar günlüğü: Mert seçenek dışı cevap verdi ya da not ekledi.");
    for (const r of loose)
      out.push(`- Soru: ${clip(r.question, 200)}\n  Cevap: ${clip(r.answer ?? "", 600)}${r.notes ? `\n  Not: ${clip(r.notes, 400)}` : ""}`);
    out.push(
      "Bu oturumda kurala çevir: docs/plan/KARARLAR.md'ye (tarih, kaynak \"Mert\", neden, reddedilen seçenek). Yalnız bu işe özelse ya da TBD ise raporda öyle söyle.",
    );
  }
  for (const r of missed)
    out.push(
      `KARAR-001: önerin tutmadı. Soru: ${clip(r.question, 160)} → Mert "${clip(r.answer, 120)}" seçti ` +
        `(önerin "${clip(r.rec, 80)}", dayanak: ${r.dayanak ?? "yok"}). Dayanak yanlış ya da eksikse KARARLAR.md'de düzelt.`,
    );
  return out.join("\n");
}

export function runHook(kind, input, now = new Date()) {
  try {
    if (input.tool_name !== "AskUserQuestion") return "";
    if (kind === "pre") {
      const problems = checkQuestions(input.tool_input?.questions);
      if (!problems.length) return "";
      try {
        append([{ ts: now.toISOString(), type: "blocked", session_id: input.session_id ?? null, problems }]);
      } catch {} // a log that cannot be written must not let the bad question through
      const reason =
        `Soru Mert'e gitmedi (KARAR-001, CLAUDE.md §2.6 / §6):\n- ${problems.join("\n- ")}\n` +
        `Düzeltip yeniden sor. Önerilen seçeneğin etiketi tam "${LABEL}"; açıklamasının sonunda tek satır: ` +
        `"Dayanak: <KARARLAR madde kimliği / Mert'in <tarih> kararı>" ya da "Dayanak: yok — yeni karar".`;
      return JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
      });
    }
    if (kind === "post") {
      const msg = reminder(record(input, now));
      return msg ? JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: msg } }) : "";
    }
  } catch {}
  return "";
}

const weekOf = (ts) => {
  const d = new Date(ts);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

// Acceptance = single-select questions that carried a recommendation and got an answer.
export function stats(rows, weeks = 8) {
  const byWeek = new Map();
  const bucket = (ts) => {
    const k = weekOf(ts);
    if (!byWeek.has(k)) byWeek.set(k, { rec: 0, other: 0, free: 0, blocked: 0 });
    return byWeek.get(k);
  };
  for (const r of rows) {
    if (!r.ts) continue;
    if (r.type === "blocked") {
      bucket(r.ts).blocked++;
      continue;
    }
    if (r.type !== "answer" || r.multiSelect || !r.rec) continue;
    const key = { picked_rec: "rec", picked_other: "other", free_text: "free" }[r.kind];
    if (key) bucket(r.ts)[key]++;
  }
  const all = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b));
  const pct = (w) => {
    const n = w.rec + w.other + w.free;
    return n ? Math.round((1000 * w.rec) / n) / 10 : null;
  };
  const total = { rec: 0, other: 0, free: 0, blocked: 0 };
  for (const [, w] of all) for (const k of Object.keys(total)) total[k] += w[k];
  return { weeks: all.slice(-weeks).map(([week, w]) => ({ week, ...w, pct: pct(w) })), total: { ...total, pct: pct(total) } };
}

export function backfill(projectsDir) {
  const seen = new Set(readLog().map((r) => `${r.tool_use_id}|${r.question}`));
  const rows = [];
  for (const d of fs.readdirSync(projectsDir).filter((n) => /newfork/i.test(n))) {
    const folder = path.join(projectsDir, d);
    if (!fs.statSync(folder).isDirectory()) continue;
    for (const f of fs.readdirSync(folder).filter((n) => n.endsWith(".jsonl"))) {
      const uses = new Map();
      const results = new Map();
      for (const line of fs.readFileSync(path.join(folder, f), "utf8").split("\n")) {
        let o;
        try {
          o = JSON.parse(line);
        } catch {
          continue;
        }
        const content = o.message?.content;
        if (!Array.isArray(content)) continue;
        for (const b of content) {
          if (b?.type === "tool_use" && b.name === "AskUserQuestion" && !uses.has(b.id))
            uses.set(b.id, { ts: o.timestamp, session_id: o.sessionId ?? null, cwd: o.cwd ?? null, input: b.input ?? {} });
          if (b?.type === "tool_result") {
            const text = Array.isArray(b.content) ? b.content.map((x) => x?.text ?? "").join(" ") : b.content;
            results.set(b.tool_use_id, { tur: o.toolUseResult, text });
          }
        }
      }
      for (const [id, u] of uses) {
        const r = results.get(id);
        if (!r) continue;
        const tur = r.tur && typeof r.tur === "object" ? r.tur : {};
        const questions = tur.questions ?? u.input.questions;
        const answers = tur.answers ?? parseResultText(r.text);
        const meta = { ts: u.ts ?? null, source: "backfill", session_id: u.session_id, cwd: u.cwd, tool_use_id: id };
        for (const row of toRows(questions, answers, tur.annotations, meta)) {
          const key = `${id}|${row.question}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push(row);
        }
      }
    }
  }
  rows.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  append(rows);
  return rows.length;
}

async function readAll(stream) {
  let raw = "";
  for await (const chunk of stream) raw += chunk;
  return raw;
}

async function main() {
  const [, , cmd, ...args] = process.argv;
  if (cmd === "hook") {
    let input = {};
    try {
      input = JSON.parse((await readAll(process.stdin)) || "{}");
    } catch {}
    process.stdout.write(runHook(args[0], input));
    return;
  }
  if (cmd === "stats") {
    const s = stats(readLog(), Number(args[0]) || 8);
    console.log("hafta (pazartesi)  önerilen  başka  serbest  kabul%  geri dönen soru");
    for (const w of s.weeks)
      console.log(
        `${w.week}        ${String(w.rec).padStart(8)}  ${String(w.other).padStart(5)}  ${String(w.free).padStart(7)}  ${String(w.pct ?? "-").padStart(6)}  ${String(w.blocked).padStart(6)}`,
      );
    const t = s.total;
    console.log(
      `toplam (bütün haftalar): ${t.rec}/${t.rec + t.other + t.free} önerilen seçildi (%${t.pct ?? "-"}), ${t.other} başka, ${t.free} serbest; ` +
        `${t.blocked} soru biçim yüzünden geri döndü`,
    );
    return;
  }
  if (cmd === "backfill") {
    const n = backfill(args[0] ?? "C:/Users/TheWe/.claude/projects");
    console.log(`${n} yeni satır eklendi -> ${LOG}`);
    return;
  }
  console.error("usage: node scripts/decision-log.mjs hook <pre|post> | stats [hafta] | backfill [projectsDir]");
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
