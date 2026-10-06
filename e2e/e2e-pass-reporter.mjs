// Records a local e2e run that passed, so scripts/guard.mjs can tell a push to
// main whether its screen/API code went through e2e (CLAUDE.md §6). Only a clean
// tree counts: uncommitted code is not what gets pushed, so commit, then run.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { INBOX_DIR } from "../scripts/inbox.mjs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

export default class E2ePassReporter {
  onEnd(result) {
    if (result.status !== "passed") return;
    try {
      if (git("status", "--porcelain", "--", "apps", "packages", "e2e", "supabase")) return;
      fs.mkdirSync(INBOX_DIR, { recursive: true });
      const line = { at: new Date().toISOString(), sha: git("rev-parse", "HEAD"), cwd: process.cwd() };
      fs.appendFileSync(path.join(INBOX_DIR, "e2e-pass.jsonl"), `${JSON.stringify(line)}\n`);
    } catch {
      // ponytail: a stamp that cannot be written only means the next push warns.
    }
  }
}
