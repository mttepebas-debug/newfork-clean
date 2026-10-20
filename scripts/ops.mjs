#!/usr/bin/env node
// WORKFLOW-V2: what several scripts share. OPS_DIR is the git-free folder that keeps audit.log and
// decisions.jsonl (formerly the inbox's INBOX_DIR; NEWFORK_INBOX_DIR overrides it, tests only).
// ciState() asks GitHub Actions through `gh`; NEWFORK_CI_STATE=idle|running|unknown forces it (tests only).
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// PROJECT-GECIS (Mert, 2026-10-09): the shared local database, the CI runner, the lock and the train folder are
// on Mert's Windows PC only. Elsewhere (a cloud thread on Linux) a C:/ default is a relative path and would open
// a "C:" folder inside the repo, so PC-only tools refuse there. NEWFORK_PLATFORM stands in for process.platform
// (tests only).
export const ON_PC = (process.env.NEWFORK_PLATFORM ?? process.platform) === "win32";
const CODEX = "C:/Users/TheWe/Documents/Codex";
// The folder a PC-only tool uses: its test override, else the Codex folder on Mert's PC, else null.
export const pcPath = (override, rel) => override ?? (ON_PC ? `${CODEX}/${rel}` : null);
export const NOT_ON_PC_EXIT = 3;
export const NOT_ON_PC =
  "Bu makinede ortak yerel veritabanı, kilit ve tren klasörü yok (bulut thread'i). Kilit, test:db, e2e ve tren yalnız Mert'in bilgisayarında, Remote Control thread'inde koşar (CLAUDE.md §5).";

// The guard's audit.log goes to the temp folder off the PC: a cloud thread's log matters only to itself.
export const OPS_DIR = pcPath(process.env.NEWFORK_INBOX_DIR, ".newfork-inbox") ?? path.join(os.tmpdir(), "newfork-ops");

// Mert's main checkout (CLAUDE.md §3.B.1). NEWFORK_MAIN_DIR overrides it (tests only); null off Mert's PC.
export const MAIN_DIR = pcPath(process.env.NEWFORK_MAIN_DIR, "newfork-clean");


// Passwords and tokens never reach a log or a report file (the guard's audit.log, the daily log). Masked:
// - a URL's password (postgres://u:<pw>@…);
// - the value of a name ending in KEY, TOKEN, SECRET, PASSWORD or PWD (any case): NAME=value (env, shell, a
//   query string), "name": "value" (JSON); name: value only for an unmistakable name (password, x_token,
//   SERVICE_ROLE_KEY, api_key), so prose like "the key point: …" stays;
// - `--password <pw>` and `Bearer <token>`;
// - bare keys by their prefix: sk_live_, rk_live_, whsec_, ghp_, gho_, github_pat_, sbp_, re_ (Resend, 20+ chars
//   after it), and a three-part JWT (eyJ….….…).
const SECRET_NAME = String.raw`[A-Za-z0-9_.-]*(?:key|token|secret|password|pwd)`;
const JSON_SECRET = new RegExp(String.raw`("${SECRET_NAME}"\s*:\s*)"(?:[^"\\]|\\.)*"`, "gi");
const ENV_SECRET = new RegExp(String.raw`(\b${SECRET_NAME}\s*=\s*)("[^"]*"|'[^']*'|[^\s&;,]+)`, "gi");
const COLON_SECRET = /(\b(?:[\w.-]*[_-])?(?:token|secret|password|passwd|pwd)|\b[\w.-]*[_-](?:key|token)|\bapi_?key)(\s*:\s*)(?!\*\*\*)\S+/gi;
export const redact = (s) =>
  String(s)
    .replace(/(\/\/[^:\s/@]+:)[^@\s]+@/g, "$1***@")
    .replace(JSON_SECRET, '$1"***"')
    .replace(ENV_SECRET, "$1***")
    .replace(COLON_SECRET, "$1$2***")
    .replace(/(--password\s+|Bearer\s+)(?!\*\*\*)\S+/gi, "$1***")
    .replace(/\b(sk_live_|rk_live_|whsec_|ghp_|gho_|github_pat_|sbp_)[A-Za-z0-9_]+/g, "$1***")
    .replace(/\bre_[A-Za-z0-9_]{20,}/g, "re_***")
    .replace(/\beyJ[\w-]*\.[\w-]+\.[\w-]+/g, "eyJ***");

export const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "x";

// GitHub Actions runs not yet completed (queued counts: the single runner is the user's PC).
export const runningRuns = (ghJson) => JSON.parse(ghJson).filter((r) => String(r.status).toLowerCase() !== "completed");

export function ciState(cwd) {
  const forced = process.env.NEWFORK_CI_STATE;
  if (forced) return { state: forced, runs: [] };
  try {
    const out = execFileSync("gh", ["run", "list", "--limit", "5", "--json", "status,name,headBranch"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10000,
    });
    const runs = runningRuns(out);
    return { state: runs.length ? "running" : "idle", runs };
  } catch {
    return { state: "unknown", runs: [] };
  }
}
