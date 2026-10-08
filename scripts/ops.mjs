#!/usr/bin/env node
// WORKFLOW-V2: what several scripts share. OPS_DIR is the git-free folder that keeps audit.log and
// decisions.jsonl (formerly the inbox's INBOX_DIR; NEWFORK_INBOX_DIR overrides it, tests only).
// ciState() asks GitHub Actions through `gh`; NEWFORK_CI_STATE=idle|running|unknown forces it (tests only).
import { execFileSync } from "node:child_process";

export const OPS_DIR = process.env.NEWFORK_INBOX_DIR ?? "C:/Users/TheWe/Documents/Codex/.newfork-inbox";

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
