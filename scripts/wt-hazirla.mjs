#!/usr/bin/env node
// WORKFLOW-V2 (spec §5.3): a worker agent's first command, in its own worktree (Agent tool, isolation: worktree).
//   node scripts/wt-hazirla.mjs <İŞ-ID>
// task/<id> from origin/main, or the existing task/<id> (local, or on origin when a job continues), then
// pnpm install, the shared and ui builds, and the local .env files copied from the main folder (never hosted keys).
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const MAIN_DIR = process.env.NEWFORK_MAIN_DIR ?? "C:/Users/TheWe/Documents/Codex/newfork-clean";
const ENV_FILES = ["apps/api/.env.local", "apps/web/.env.local"];
const git = (cwd, args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const has = (cwd, ref) => spawnSync("git", ["-C", cwd, "rev-parse", "--verify", "-q", ref]).status === 0;
const realPnpm = (args, cwd) =>
  spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, { cwd, stdio: "inherit", shell: process.platform === "win32" }).status ?? 1;

export function branchOf(id) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(String(id ?? ""))) throw new Error(`iş kimliği geçersiz: "${id}" (ör. BL-987, EKRAN-02)`);
  return `task/${String(id).toLowerCase()}`;
}

export function prepare(id, { cwd, mainDir = MAIN_DIR, pnpm = realPnpm }) {
  const branch = branchOf(id);
  if (git(cwd, ["status", "--porcelain"])) return { code: 1, message: `worktree temiz değil: ${cwd}` };
  git(cwd, ["fetch", "-q", "origin"]);
  let from;
  if (has(cwd, `refs/heads/${branch}`)) {
    git(cwd, ["switch", "-q", branch]);
    from = `yerel ${branch} (devam)`;
  } else if (has(cwd, `refs/remotes/origin/${branch}`)) {
    git(cwd, ["switch", "-q", "-c", branch, "--track", `origin/${branch}`]);
    from = `origin/${branch} (devam)`;
  } else {
    git(cwd, ["switch", "-q", "-c", branch, "origin/main"]);
    from = "origin/main";
  }
  for (const args of [["install", "--frozen-lockfile"], ["--filter", "@newfork/shared", "--filter", "@newfork/ui", "build"]]) {
    const st = pnpm(args, cwd);
    if (st !== 0) return { code: 1, branch, message: `pnpm ${args.join(" ")} kırmızı (çıkış ${st})` };
  }
  const copied = [];
  for (const rel of ENV_FILES) {
    const src = path.join(mainDir, rel);
    const dst = path.join(cwd, rel);
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      copied.push(rel);
    }
  }
  const sha = git(cwd, ["rev-parse", "--short", "HEAD"]);
  return { code: 0, branch, message: `hazır: ${branch} @${sha} (${from}); env: ${copied.join(", ") || "kopyalanacak yok"}` };
}

function main([id]) {
  let r;
  try {
    r = prepare(id, { cwd: process.cwd() });
  } catch (err) {
    r = { code: 1, message: String(err?.message ?? err) };
  }
  console.log(r.message);
  process.exitCode = r.code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
