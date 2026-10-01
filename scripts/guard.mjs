#!/usr/bin/env node
// COORD-CTRL: PreToolUse guard for Bash/PowerShell (CLAUDE.md §6, §7).
// - A push to main needs a live main.lock (scripts/lock.mjs). Without one it is
//   refused, unless the push itself is prefixed with NF_OVERRIDE="<reason>": then
//   origin/main is first saved as refs/nf-backup/main/<stamp> and the bypass is logged.
// - Deleting a branch or removing a worktree is allowed, but the tip is saved
//   under refs/nf-backup/... first.
// - Every decision lands in <inbox>/audit.log (one JSON object per line, secrets masked).
// Fail-closed only for a push to main: if evaluate() itself breaks, that push
// is refused (NF_OVERRIDE still passes). Everything else fails open.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { status as lockStatus } from "./lock.mjs";
import { INBOX_DIR } from "./inbox.mjs";

const AUDIT = () => path.join(INBOX_DIR, "audit.log");
// Commands already refused by .claude/settings.json deny rules; attempts are logged.
const DENIED = [
  /\bgit\b[^;&|\n]*\bpush\b[^;&|\n]*(--force|\s-f\b|\s\+\S)/,
  /\bgit\b[^;&|\n]*\breset\s+--hard/,
  /\bgit\s+(-C\s+\S+\s+)?clean\b/,
  /supabase\s+db\s+(reset|push)/,
  /--no-verify/,
];

function git(cwd, args, timeout = 5000) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout }).trim();
}
const tryGit = (cwd, args, timeout) => {
  try {
    return git(cwd, args, timeout);
  } catch {
    return "";
  }
};
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

// Passwords and tokens never reach the audit log.
export const redact = (s) =>
  s
    .replace(/(\/\/[^:\s/@]+:)[^@\s]+@/g, "$1***@")
    .replace(/(--password[=\s]+|PGPASSWORD=|Bearer\s+|(?:api[_-]?key|token|secret)[=:]\s*)\S+/gi, "$1***");

// The override counts only as an assignment in front of the push itself:
// bash `NF_OVERRIDE="why" git push …`, or PowerShell `$env:NF_OVERRIDE='why'; git push …`
// (the segment right before the push). Text anywhere else (a commit message) does not count.
const REASON = String.raw`\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))`;
export function overrideReason(segs, i) {
  const pick = (m) => (m ? (m[1] ?? m[2] ?? m[3] ?? "").trim() || "(gerekçe yok)" : null);
  return (
    pick(segs[i].match(new RegExp(`^NF_OVERRIDE${REASON}\\s`))) ??
    (i > 0 ? pick(segs[i - 1].match(new RegExp(`^\\$env:NF_OVERRIDE${REASON}\\s*$`, "i"))) : null)
  );
}

// ponytail: shell-ish split on && || ; | newline; quoting inside a segment is not parsed, and a
// push wrapped in another shell (`bash -c "git push …"`, `pwsh -Command "…"`) is not seen.
// Each segment carries the operator in front of it; an empty segment between two
// operators keeps the weaker one (anything but && breaks a chain).
const SEP = /(&&|\|\||[;|\n])/;
export function chain(cmd) {
  const out = [];
  let sep = null;
  for (const part of cmd.split(SEP)) {
    if (/^(&&|\|\||[;|\n])$/.test(part)) {
      sep = sep && sep !== "&&" ? sep : part;
      continue;
    }
    const seg = part.trim().replace(/^\$?\(+\s*/, "").replace(/\s*\)+$/, "");
    if (!seg) continue;
    out.push({ seg, sep });
    sep = null;
  }
  return out;
}
export const segments = (cmd) => chain(cmd).map((c) => c.seg);
const words = (seg) => (seg.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((w) => w.replace(/^["']|["']$/g, ""));

// BL-500: `node scripts/lock.mjs take main "…" && … && git push …` takes the lock only
// when the command runs, after this hook. Joined by && alone, the push runs only if
// the take succeeded, so the chain counts as holding the lock.
const takesMain = (seg) => {
  const w = words(seg);
  const n = w.findIndex((x) => /(^|[\\/])node(\.exe)?$/.test(x));
  return n >= 0 && /(^|[\\/])lock\.mjs$/.test(w[n + 1] ?? "") && w[n + 2] === "take" && w[n + 3] === "main";
};
export function takesMainBefore(links, i) {
  for (let j = i; j > 0; j--) {
    if (links[j].sep !== "&&") return false;
    if (takesMain(links[j - 1].seg)) return true;
  }
  return false;
}

// Arguments after the git subcommand, and the -C directory if one was given.
function gitCall(seg, sub) {
  const w = words(seg);
  const g = w.findIndex((x) => /(^|[\\/])git(\.exe)?$/.test(x));
  if (g < 0) return null;
  let cwd = null;
  let i = g + 1;
  while (i < w.length && w[i].startsWith("-")) {
    if (w[i] === "-C") cwd = w[++i];
    else if (w[i] === "-c") i++; // -c key=value takes a value
    i++;
  }
  if (w[i] !== sub) return null;
  return { cwd, args: w.slice(i + 1) };
}

export function pushesMain(seg, cwd) {
  const call = gitCall(seg, "push");
  if (!call) return false;
  const dir = call.cwd ? path.resolve(cwd, call.cwd) : cwd;
  if (call.args.some((a) => a === "--all" || a === "--mirror")) return true;
  const plain = call.args.filter((a) => !a.startsWith("-"));
  // --repo=<remote> names the remote as an option, so every plain arg is a refspec
  const refspecs = call.args.some((a) => a.startsWith("--repo")) ? plain : plain.slice(1);
  const current = () => tryGit(dir, ["branch", "--show-current"]);
  if (!refspecs.length) return current() === "main";
  return refspecs.some((spec) => {
    const s = spec.replace(/^\+/, "");
    const dst = s.includes(":") ? s.split(":")[1] : s === "HEAD" ? current() : s;
    return dst === "main" || dst === "refs/heads/main";
  });
}

// e2e before a push (CLAUDE.md §6, Mert 2026-10-01 "warning mode", ILKELER P16):
// e2e/e2e-pass-reporter.mjs appends a line here after a local run that passed on
// a clean tree. A push to main that changes screen, API or e2e code and has no
// such run on the same content gets a warning and an audit line; never a block.
const E2E_PASS = () => path.join(INBOX_DIR, "e2e-pass.jsonl");
const E2E_CODE = /^(apps\/web\/src|apps\/api\/src|packages\/(shared|ui)\/src|e2e)\//;
const sameContent = (dir, sha) => {
  try {
    git(dir, ["diff", "--quiet", sha, "HEAD", "--", "apps", "packages", "e2e", "supabase"]);
    return true;
  } catch {
    return false;
  }
};
export function e2eGap(dir) {
  const files = tryGit(dir, ["diff", "--name-only", "origin/main...HEAD"])
    .split("\n")
    .filter((f) => E2E_CODE.test(f) && !/\.test\.tsx?$/.test(f));
  if (!files.length) return [];
  let shas = [];
  try {
    shas = fs.readFileSync(E2E_PASS(), "utf8").trim().split("\n").slice(-30).map((l) => JSON.parse(l).sha);
  } catch {}
  return shas.some((sha) => sameContent(dir, sha)) ? [] : files;
}

function audit(entry) {
  fs.mkdirSync(INBOX_DIR, { recursive: true });
  const line = { at: new Date().toISOString(), ...entry };
  if (line.command) line.command = redact(line.command);
  fs.appendFileSync(AUDIT(), `${JSON.stringify(line)}\n`);
}

function backupMain(cwd) {
  let fetched = true;
  try {
    git(cwd, ["fetch", "-q", "origin", "main"], 30000);
  } catch {
    fetched = false;
  }
  const sha = git(cwd, ["rev-parse", "origin/main"]);
  const ref = `refs/nf-backup/main/${stamp()}`;
  git(cwd, ["update-ref", ref, sha]);
  return { ref, sha, fetched };
}

function backupBranches(seg, cwd, base) {
  const out = [];
  const br = gitCall(seg, "branch");
  if (br && br.args.some((a) => /^(-D|-d|--delete)$/.test(a))) {
    const dir = br.cwd ? path.resolve(cwd, br.cwd) : cwd;
    for (const name of br.args.filter((a) => !a.startsWith("-"))) {
      const sha = tryGit(dir, ["rev-parse", "--verify", `refs/heads/${name}`]);
      if (!sha) continue;
      const ref = `refs/nf-backup/branch/${name}/${stamp()}`;
      git(dir, ["update-ref", ref, sha]);
      out.push({ ...base, event: "branch-delete", branchName: name, sha, backup: ref });
    }
  }
  const wt = gitCall(seg, "worktree");
  if (wt && wt.args[0] === "remove") {
    const dir = wt.cwd ? path.resolve(cwd, wt.cwd) : cwd;
    const target = wt.args.slice(1).find((a) => !a.startsWith("-"));
    if (target) {
      const wdir = path.resolve(dir, target);
      const sha = tryGit(wdir, ["rev-parse", "HEAD"]);
      const name = tryGit(wdir, ["branch", "--show-current"]) || path.basename(wdir);
      if (sha) {
        const ref = `refs/nf-backup/worktree/${name}/${stamp()}`;
        git(dir, ["update-ref", ref, sha]);
        out.push({ ...base, event: "worktree-remove", worktree: wdir, branchName: name, sha, backup: ref });
      }
    }
  }
  return out;
}

// Returns { block, message }; performs backups and writes the audit log.
export function evaluate(input) {
  const cmd = input.tool_input?.command ?? "";
  const cwd = input.cwd ?? process.cwd();
  const base = { session_id: input.session_id ?? "", cwd, tool: input.tool_name ?? "", command: cmd };
  let segs = [];
  let warn = null;
  try {
    for (const re of DENIED) if (re.test(cmd)) audit({ ...base, event: "deny-pattern", pattern: String(re) });

    const links = chain(cmd);
    segs = links.map((l) => l.seg);
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      for (const entry of backupBranches(seg, cwd, base)) audit(entry);

      if (!pushesMain(seg, cwd)) continue;
      const pushDir = gitCall(seg, "push")?.cwd ? path.resolve(cwd, gitCall(seg, "push").cwd) : cwd;
      const gap = e2eGap(pushDir);
      if (gap.length) {
        audit({ ...base, event: "push-main-e2e-missing", files: gap.slice(0, 10) });
        warn =
          `Uyarı: bu push ekran/API/e2e kodu değiştiriyor (${gap.length} dosya, ör. ${gap[0]}) ama aynı içerikte ` +
          `geçen yerel e2e koşusu yok (CLAUDE.md §6). Commit'ten sonra etkilenen e2e'yi db.lock ile koştur. Push engellenmedi.`;
      }
      if (takesMainBefore(links, i)) {
        audit({ ...base, event: "push-main-take-chained" });
        continue;
      }
      const lock = lockStatus().find((l) => l.name === "main");
      const lockInfo = lock.free ? "boş" : `${lock.identity}, ${lock.ageMinutes ?? "?"} dk${lock.stale ? " (stale)" : ""}`;
      if (!lock.free && !lock.stale) {
        audit({ ...base, event: "push-main-locked", lock: lockInfo });
        continue;
      }
      const reason = overrideReason(segs, i);
      if (reason) {
        const b = backupMain(cwd);
        audit({ ...base, event: "push-main-override", reason, lock: lockInfo, backup: b.ref, sha: b.sha, fetched: b.fetched });
        continue;
      }
      audit({ ...base, event: "push-main-blocked", lock: lockInfo });
      return {
        block: true,
        message:
          `main'e gönderim reddedildi: main.lock ${lock.free ? "alınmamış" : `bayat (${lockInfo})`}. ` +
          `Önce: node scripts/lock.mjs take main "<rol/oturum>, <amaç>" (CLAUDE.md §6). ` +
          `Bilinçli aşmak için push komutunun başına NF_OVERRIDE="<gerekçe>" koy; origin/main yedeklenir ve kayda düşer.`,
      };
    }
    return { block: false, warn };
  } catch (err) {
    const overridden = segs.some((_, i) => overrideReason(segs, i));
    const risky = /\bpush\b/.test(cmd) && /\bmain\b/.test(cmd) && !overridden;
    try {
      audit({ ...base, event: "guard-error", error: String(err?.message ?? err), blocked: risky });
    } catch {}
    return risky
      ? { block: true, message: `guard hata verdi, main'e gönderim güvenlik için reddedildi: ${err?.message ?? err}. NF_OVERRIDE ile aşılabilir.` }
      : { block: false };
  }
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let input = {};
  try {
    input = JSON.parse(raw || "{}");
  } catch {}
  if (!/^(Bash|PowerShell)$/.test(input.tool_name ?? "")) return;
  const r = evaluate(input);
  if (r.block) {
    process.stderr.write(r.message);
    process.exitCode = 2; // PreToolUse: exit 2 = refuse, stderr goes back to the model
  } else if (r.warn) {
    process.stdout.write(
      JSON.stringify({
        systemMessage: r.warn,
        hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: r.warn },
      }),
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
