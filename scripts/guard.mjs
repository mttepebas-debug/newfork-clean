#!/usr/bin/env node
// PreToolUse guard for Bash, PowerShell, Edit and Write.
// - The main checkout is Mert's: while it is on branch main, no Edit/Write lands on a file there that git
//   tracks or would track; git-ignored files (CLAUDE.local.md, .env.local, artifacts/) stay writable.
// - Deleting a branch or removing a worktree is allowed; the tip is saved under refs/nf-backup/... first.
// - Commands the settings deny list refuses are logged when tried.
// Every decision lands in <OPS_DIR>/audit.log (one JSON object per line, secrets masked).
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { MAIN_DIR, OPS_DIR, redact } from "./ops.mjs";
export { ciState, runningRuns, redact } from "./ops.mjs";

const AUDIT = () => path.join(OPS_DIR, "audit.log");
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

const SEP = /(&&|\|\||[;|\n])/;
const ENV = /^(?:[A-Za-z_]\w*=(?:"[^"]*"|'[^']*'|\S*)\s+)+/;
export function chain(cmd, shell = "bash", depth = 0) {
  const out = [];
  let sep = null;
  // a quote or $( left open: read it the old way, which splits more and so checks more
  for (const part of scanPieces(cmd, shell) ?? dropBodies(cmd).split(SEP)) {
    if (/^(&&|\|\||[;|\n])$/.test(part)) {
      sep = sep && sep !== "&&" ? sep : part;
      continue;
    }
    const seg = part.trim().replace(/^\$?\(+\s*/, "").replace(/\s*\)+$/, "");
    if (!seg) continue;
    const inner = depth < 3 ? wrapped(seg, shell) : null;
    const links = inner ? chain(inner.script, inner.shell, depth + 1) : [];
    if (links.length) {
      // `NF_OVERRIDE="…" bash -c "…"` sets the variable for every command of the script
      const env = seg.match(ENV)?.[0] ?? "";
      out.push(...links.map((l, k) => ({ seg: env + l.seg, sep: k ? l.sep : sep })));
    } else out.push({ seg, sep });
    sep = null;
  }
  return out;
}
export const segments = (cmd, shell) => chain(cmd, shell).map((c) => c.seg);

// `bash -c "<script>"`, `sh -c '…'`, `pwsh [-NoProfile …] -Command "…"`, `cmd /c "…"`: the script and
// the shell that runs it. Its outer quotes belong to the calling shell and are taken off with its rules.
const WRAPPER =
  /^(?:[A-Za-z_]\w*=(?:"[^"]*"|'[^']*'|\S*)\s+)*(?:&\s*)?["']?(?:\S*[\\/])?(bash|sh|zsh|dash|pwsh|powershell|cmd)(?:\.exe)?["']?(?=\s)/i;
// The flag that takes the script: bash -c / -lc / -ec, pwsh -Command or any prefix of it (-c, -com),
// cmd /c. Other options in front (`-NoProfile`, `-ExecutionPolicy Bypass`, `-o pipefail`) are skipped.
const SCRIPT_FLAG = { bash: /^-[a-z]*c$/, pwsh: /^-c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?$/i, cmd: /^\/c$/i };
function wrapped(seg, outer) {
  const m = seg.match(WRAPPER);
  if (!m) return null;
  const kind = /^(pwsh|powershell)$/i.test(m[1]) ? "pwsh" : /^cmd$/i.test(m[1]) ? "cmd" : "bash";
  let rest = seg.slice(m[0].length);
  for (let k = 0; ; k++) {
    const w = rest.match(/^\s+(\S+)/);
    if (!w || k > 6) return null;
    rest = rest.slice(w[0].length);
    if (SCRIPT_FLAG[kind].test(w[1])) break;
    if (/^-(f|file)$/i.test(w[1])) return null; // a script file, not a command line
  }
  let script = rest.trim();
  const q = script[0];
  if (q === "'" || q === '"') {
    let s = "";
    for (let i = 1; i < script.length; i++) {
      const c = script[i];
      // Bash "…" drops the backslash only before $ ` " \ and a newline; PowerShell "…" drops every backtick
      if (q === '"' && outer === "pwsh" && c === "`" && i + 1 < script.length) s += script[++i];
      else if (q === '"' && outer !== "pwsh" && c === "\\" && /[$`"\\\n]/.test(script[i + 1] ?? "")) s += script[++i];
      else if (c === q && outer === "pwsh" && script[i + 1] === q) s += script[++i];
      else if (c === q) break;
      else s += c;
    }
    script = s;
  }
  return { script, shell: kind === "pwsh" ? "pwsh" : "bash" };
}

// One pass over the command (BL-964): the pieces between top-level separators, with the separators between
// them (the shape of String.split(SEP)), or null when a quote or a $( is still open at the end.
// Quotes keep their text; heredoc and here-string bodies are dropped. Inside "…" a $( … ) is code
// again (its quotes and heredocs are read) but stays part of the piece, as before.
// ponytail: a `#` comment inside "$( … )" can swallow its `)`; the scan then ends with $( open and
// falls back to the old split (bash would read that command the same broken way).
function scanPieces(cmd, shell) {
  const pwsh = shell === "pwsh";
  const esc = pwsh ? "`" : "\\";
  const parts = [];
  const stack = [{ mode: "code", top: true, depth: 0 }]; // modes: code, sq '…', dq "…", ansi $'…'
  const heredocs = [];
  let cur = "";
  let i = 0;
  let escaped = -1; // the last index taken by an escape in code: `\$'…'` is a plain $ and a plain '…'
  const cut = (op) => {
    parts.push(cur, op);
    cur = "";
  };
  // the index of the newline ending the last pending heredoc's terminator line, or -1 if one has none
  const pastBodies = (from) => {
    let at = from;
    for (const { dash, tag } of heredocs.splice(0)) {
      let found = -1;
      for (let p = at + 1; p <= cmd.length; ) {
        const e = cmd.indexOf("\n", p);
        const end = e < 0 ? cmd.length : e;
        const line = cmd.slice(p, end);
        if ((dash ? line.replace(/^\t+/, "") : line).trimEnd() === tag) {
          found = end;
          break;
        }
        if (e < 0) break;
        p = e + 1;
      }
      if (found < 0) return -1;
      at = found;
    }
    return at;
  };
  while (i < cmd.length) {
    const c = cmd[i];
    const two = cmd.slice(i, i + 2);
    const ctx = stack.at(-1);
    if (ctx.mode === "sq") {
      if (c === "'" && pwsh && cmd[i + 1] === "'") {
        cur += "''";
        i += 2;
        continue;
      }
      if (c === "'") stack.pop();
      cur += c;
      i++;
      continue;
    }
    if (ctx.mode === "ansi" || ctx.mode === "dq") {
      const escape = ctx.mode === "ansi" ? "\\" : esc;
      if (c === escape && i + 1 < cmd.length) {
        cur += two;
        i += 2;
        continue;
      }
      const close = ctx.mode === "ansi" ? "'" : '"';
      if (c === close && pwsh && cmd[i + 1] === close) {
        cur += two;
        i += 2;
        continue;
      }
      if (c === close) stack.pop();
      else if (ctx.mode === "dq" && two === "$(") {
        stack.push({ mode: "code", top: false, depth: 0 });
        cur += two;
        i += 2;
        continue;
      }
      cur += c;
      i++;
      continue;
    }
    // code
    if (c === esc && i + 1 < cmd.length) {
      const nl = cmd.slice(i + 1, i + 3).match(/^\r?\n/);
      if (nl) i += 1 + nl[0].length; // a line continuation joins the next line
      else {
        cur += two;
        escaped = i + 1;
        i += 2;
      }
      continue;
    }
    const here = c === "@" && cmd.slice(i, i + 64).match(/^@(['"])[ \t]*\r?\n/);
    if (here) {
      const close = cmd.indexOf(`\n${here[1]}@`, i);
      if (close >= 0) {
        cur += `@${here[1]}${here[1]}@`; // the body is text; `'@ | Set-Content x` goes on as code
        i = close + 3;
        continue;
      }
    }
    const doc =
      two === "<<" && cmd[i + 2] !== "<" && cmd[i - 1] !== "<" &&
      cmd.slice(i, i + 256).match(/^<<(-?)[ \t]*(?:(['"])([A-Za-z_]\w*)\2|\\?([A-Za-z_]\w*))/);
    if (doc) {
      heredocs.push({ dash: doc[1] === "-", tag: doc[3] ?? doc[4] });
      cur += doc[0];
      i += doc[0].length;
      continue;
    }
    if (c === "#" && (i === 0 || /[\s;|&(]/.test(cmd[i - 1]))) {
      const e = cmd.indexOf("\n", i); // a comment runs to the end of its line
      i = e < 0 ? cmd.length : e;
      continue;
    }
    if (pwsh && two === "<#") {
      const e = cmd.indexOf("#>", i + 2);
      i = e < 0 ? cmd.length : e + 2;
      continue;
    }
    if (c === "'") stack.push({ mode: !pwsh && cmd[i - 1] === "$" && escaped !== i - 1 ? "ansi" : "sq" });
    else if (c === '"') stack.push({ mode: "dq" });
    else if (c === "\n") {
      const past = heredocs.length ? pastBodies(i) : i;
      if (ctx.top) cut("\n");
      else cur += "\n";
      i = past < 0 ? i + 1 : past + 1;
      continue;
    } else if (!ctx.top) {
      if (c === "(") ctx.depth++;
      else if (c === ")" && ctx.depth-- === 0) stack.pop();
    } else if (two === "&&" || two === "||") {
      cut(two);
      i += 2;
      continue;
    } else if (c === ";" || c === "|") {
      cut(c);
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (stack.length > 1) return null;
  parts.push(cur);
  return parts;
}

// Heredoc (`<<'EOF'`, `<<-EOF`) and PowerShell here-string (`@'` … `'@`) bodies are text, not
// commands: a report line or a commit body starting with "pnpm.cmd test" runs nothing. A body
// without its terminator is kept, so a stray "<<x" inside quotes never hides what follows.
// Since BL-964 only the fallback for a command whose quoting scanPieces() cannot read.
export function dropBodies(cmd) {
  const out = [];
  let close = null;
  let held = [];
  for (const line of cmd.split("\n")) {
    if (close) {
      const rest = close(line);
      if (rest === null) {
        held.push(line);
        continue;
      }
      close = null;
      held = [];
      if (rest.trim()) out.push(rest); // `'@ | Set-Content x` goes on as a command
      continue;
    }
    out.push(line);
    const here = line.match(/(?<!<)<<(-?)\s*(['"]?)([A-Za-z_]\w*)\2/);
    const ps = line.match(/@(['"])\s*$/);
    if (here) {
      const [, dash, , tag] = here;
      close = (l) => ((dash ? l.replace(/^\t+/, "") : l).trimEnd() === tag ? "" : null);
    } else if (ps) {
      close = (l) => (l.startsWith(`${ps[1]}@`) ? l.slice(2) : null);
    }
  }
  return [...out, ...held].join("\n");
}
const words = (seg) => (seg.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((w) => w.replace(/^["']|["']$/g, ""));

// `cd <dir> && …` moves the rest of the command: the hook's cwd is only where the session started
// (a session opened from a card starts in .claude/worktrees/<x> and works in ../newfork-wt/<id>).
const CD = /^(cd|pushd|chdir|set-location|sl)$/i;
export function folders(segs, cwd) {
  let dir = cwd;
  return segs.map((seg) => {
    const w = words(seg);
    const arg = CD.test(w[0] ?? "") ? w.slice(1).find((a) => !a.startsWith("-")) : null;
    // Git Bash spells C:\x as /c/x
    if (arg) dir = path.resolve(dir, process.platform === "win32" ? arg.replace(/^\/([a-z])(\/|$)/i, "$1:/") : arg);
    return dir;
  });
}

// Arguments after the git subcommand, and the -C directory if one was given.
// Global options that take the next word as their value: -c key=value, --git-dir, --work-tree, --namespace
// (the `--opt=value` spelling is one word and needs no skipping).
const GIT_VALUE = new Set(["-c", "--git-dir", "--work-tree", "--namespace", "--attr-source", "--config-env", "--exec-path", "--super-prefix"]);
function gitCall(seg, sub) {
  const w = words(seg);
  const g = w.findIndex((x) => /(^|[\\/])git(\.exe)?$/.test(x));
  if (g < 0) return null;
  let cwd = null;
  let i = g + 1;
  while (i < w.length && w[i].startsWith("-")) {
    if (w[i] === "-C") cwd = w[++i];
    else if (GIT_VALUE.has(w[i])) i++;
    i++;
  }
  if (w[i] !== sub) return null;
  return { cwd, args: w.slice(i + 1) };
}

export function audit(entry) {
  fs.mkdirSync(OPS_DIR, { recursive: true });
  const line = { at: new Date().toISOString(), ...entry };
  if (line.command) line.command = redact(line.command);
  fs.appendFileSync(AUDIT(), `${JSON.stringify(line)}\n`);
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

// The main checkout (MAIN_DIR) is Mert's (CLAUDE.md §3.B.1). An edit there is refused when that folder is the
// repo's primary worktree, on branch main, and the file is not git-ignored. Its linked worktrees
// (.claude/worktrees/*) and a nested repo are other folders. When git cannot answer, the edit passes and is
// logged: a broken check must not stop every session.
const MAIN_REFUSAL = "Reddedildi: ana klasör (main) Mert'indir; işi kendi worktree'nde yap (CLAUDE.md §3.B.1).";
const winCase = (p) => (process.platform === "win32" ? p.toLowerCase() : p);
const inside = (dir, file) => {
  const rel = path.relative(winCase(path.resolve(dir)), winCase(path.resolve(file)));
  return !rel.startsWith("..") && !path.isAbsolute(rel);
};
// "blocked" | "error: <why>" | null (not the main checkout's tracked side)
function mainCheckoutEdit(file) {
  if (!MAIN_DIR || !file || !inside(MAIN_DIR, file)) return null;
  let dir = path.dirname(path.resolve(file));
  while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  try {
    const [gitDir, commonDir, top] = git(dir, ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir", "--show-toplevel"]).split(/\r?\n/);
    if (winCase(path.resolve(gitDir)) !== winCase(path.resolve(commonDir))) return null; // a linked worktree
    if (winCase(path.resolve(top)) !== winCase(path.resolve(MAIN_DIR))) return null; // a nested repo
    if (git(dir, ["branch", "--show-current"]) !== "main") return null;
    const r = spawnSync("git", ["-C", top, "check-ignore", "-q", "--", path.resolve(file)], { encoding: "utf8", timeout: 5000 });
    if (r.status === 0) return null;
    if (r.status === 1) return "blocked";
    return `error: git check-ignore ${String(r.stderr || r.error?.message || r.status).trim()}`;
  } catch (err) {
    return `error: ${String(err?.stderr || err?.message || err).trim().split("\n")[0]}`;
  }
}

const EDIT_TOOLS = /^(Edit|Write|MultiEdit|NotebookEdit)$/;
function evaluateEdit(input) {
  const file = String(input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? "");
  const main = mainCheckoutEdit(file);
  if (main) {
    const entry = { session_id: input.session_id ?? "", agent_id: input.agent_id ?? null, cwd: input.cwd ?? "", tool: input.tool_name, file };
    if (main === "blocked") {
      audit({ ...entry, event: "main-edit-blocked" });
      return { block: true, message: MAIN_REFUSAL };
    }
    audit({ ...entry, event: "main-edit-check-error", error: main.slice("error: ".length) });
  }
  return { block: false };
}

// Returns { block, message? }; performs backups and writes the audit log.
export function evaluate(input) {
  if (EDIT_TOOLS.test(input.tool_name ?? "")) return evaluateEdit(input);
  const cmd = input.tool_input?.command ?? "";
  const cwd = input.cwd ?? process.cwd();
  const base = { session_id: input.session_id ?? "", agent_id: input.agent_id ?? null, cwd, tool: input.tool_name ?? "", command: cmd };
  try {
    for (const re of DENIED) if (re.test(cmd)) audit({ ...base, event: "deny-pattern", pattern: String(re) });
    const segs = chain(cmd, input.tool_name === "PowerShell" ? "pwsh" : "bash").map((l) => l.seg);
    const dirs = folders(segs, cwd);
    for (let i = 0; i < segs.length; i++) for (const entry of backupBranches(segs[i], dirs[i], base)) audit(entry);
  } catch (err) {
    try {
      audit({ ...base, event: "guard-error", error: String(err?.message ?? err) });
    } catch {}
  }
  return { block: false };
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let input = {};
  try {
    input = JSON.parse(raw || "{}");
  } catch {}
  const tool = input.tool_name ?? "";
  if (!/^(Bash|PowerShell)$/.test(tool) && !EDIT_TOOLS.test(tool)) return;
  const r = evaluate(input);
  if (r.block) {
    process.stderr.write(r.message);
    process.exitCode = 2; // PreToolUse: exit 2 = refuse, stderr goes back to the model
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
