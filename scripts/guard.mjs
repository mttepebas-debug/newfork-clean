#!/usr/bin/env node
// WORKFLOW-V2 (spec §7.2, §10): PreToolUse guard for Bash, PowerShell, Edit and Write.
// - A push to main is refused: only scripts/train.mjs sends main (its own process, not seen here), and
//   only a train CI passed. `gh pr merge` and a `gh api` write to a merge, contents or git/refs endpoint (or a
//   graphql merge/ref mutation) count as a push to main.
//   Emergency: NF_OVERRIDE="<reason>" in front of the push saves origin/main as refs/nf-backup/main/<stamp>
//   first and is logged; when that backup cannot be taken the push is refused.
// ponytail: a client-side guard reads words, not what git will run: `git -c alias.p=push p ...`, `eval`,
//   `iex`, `node -e "...execSync('git push ...')"` stay invisible. Server-side protection of main is the real fix.
// - A worker agent (a hook input with agent_id, or a folder under .claude/worktrees/agent-*) never writes
//   a record file (DURUM, KARARLAR, SORULAR, BACKLOG, EKRAN-PLANI, the daily log), by edit or by commit,
//   and never pushes to the coordinator's branch coord/kayit.
// - Deleting a branch or removing a worktree is allowed; the tip is saved under refs/nf-backup/... first.
// - Commands the settings deny list refuses are logged when tried.
// Every decision lands in <OPS_DIR>/audit.log (one JSON object per line, secrets masked).
// Fail-closed only for a push to main: if evaluate() itself breaks, that push is refused.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { OPS_DIR, redact } from "./ops.mjs";
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

// The override counts only as an assignment in front of the guarded command itself:
// bash `NF_OVERRIDE="why" git push …`, or PowerShell `$env:NF_OVERRIDE='why'; … git push …`
// (an earlier segment: PowerShell keeps the variable for the rest of the command, a
// `Set-Location` in between included). Text anywhere else (a commit message) does not count.
const REASON = String.raw`\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))`;
const PS_OVERRIDE = new RegExp(`^\\$env:NF_OVERRIDE${REASON}\\s*$`, "i");
export function overrideReason(segs, i) {
  const pick = (m) => (m ? (m[1] ?? m[2] ?? m[3] ?? "").trim() || "(gerekçe yok)" : null);
  const own = pick(segs[i].match(new RegExp(`^NF_OVERRIDE${REASON}\\s`)));
  if (own) return own;
  for (let j = i - 1; j >= 0; j--) {
    const ps = pick(segs[j].match(PS_OVERRIDE));
    if (ps) return ps;
  }
  return null;
}

// Split on && || ; | newline, but only in the command's own code (BL-964): not inside quotes, a
// heredoc body, a here-string or a `#` comment, and not at a line continuation. Bash and PowerShell
// differ in their escape character (\ vs `) and in how a quote escapes itself. A command wrapped in
// another shell (`bash -c "…"`, `pwsh -Command "…"`, `cmd /c "…"`) is read as that shell's commands.
// ponytail: a lone `&` (background) is not a separator; `pwsh -EncodedCommand` is not decoded.
// Each segment carries the operator in front of it; an empty segment between two
// operators keeps the weaker one (anything but && breaks a chain).
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

// Where a push goes: its directory and, per refspec, what it sends (src) and where (dst; "*" for
// --all/--branches/--mirror and for any refspec with a wildcard). BL-760: `git push origin task/x:main`
// sends task/x whatever HEAD is. `@` is git's short name for HEAD, so a dst of `@` or `HEAD` is the current
// branch. src is null for a delete (`:main`).
function pushCall(seg, cwd) {
  const call = gitCall(seg, "push");
  if (!call) return null;
  const dir = call.cwd ? path.resolve(cwd, call.cwd) : cwd;
  // ponytail: --all/--mirror send every branch; HEAD stands in for them, as before
  if (call.args.some((a) => a === "--all" || a === "--branches" || a === "--mirror")) return { dir, refs: [{ src: "HEAD", dst: "*" }] };
  const plain = call.args.filter((a) => !a.startsWith("-"));
  // --repo=<remote> names the remote as an option, so every plain arg is a refspec
  const refspecs = call.args.some((a) => a.startsWith("--repo")) ? plain : plain.slice(1);
  const current = () => tryGit(dir, ["branch", "--show-current"]);
  if (!refspecs.length) return { dir, refs: [{ src: "HEAD", dst: current() }] };
  // a refspec built by $( … ) or `…` (`git push -u origin "$(git branch --show-current)"`) cannot be
  // read before it runs; it is resolved like a bare push, to the current branch
  if (refspecs.some((spec) => SUBST.test(spec))) return { dir, refs: [{ src: "HEAD", dst: current() }] };
  return {
    dir,
    refs: refspecs.map((spec) => {
      const s = spec.replace(/^\+/, "");
      // `:` alone is the matching refspec: every branch both sides have, main among them
      if (s.includes("*") || s === ":") return { src: s, dst: "*" };
      const [src, to] = s.includes(":") ? s.split(":") : [s, s];
      const dst = to === "HEAD" || to === "@" ? current() : to;
      return { src: src || null, dst: dst.replace(/^(refs\/)?heads\//, "") };
    }),
  };
}
const toMain = (r) => r.dst === "main" || r.dst === "*";

// Ways to reach main without a git push: `gh [-R x] pr merge …` (a PR lands on its base, main here), and a
// `gh api` write to a merge, contents or git/refs endpoint, or a graphql merge/ref mutation. A `gh api` call
// writes when -X/--method says so or when it sends fields (-f/-F/--field/--raw-field/--input imply POST).
// A GET passes: reading refs/heads/main is harmless (`git ls-remote origin main` reads it without the API).
const GH_WRITE_ENDPOINT = /(^|\/)(pulls\/[^/\s]+\/merge|merges|contents|git\/refs)(\/|$|\?)/;
const GH_MUTATION = /\b(mergePullRequest|updateRef|updateRefs|createCommitOnBranch|enablePullRequestAutoMerge)\b/;
function ghToMain(seg) {
  const w = words(seg);
  const g = w.findIndex((x) => /(^|[\\/])gh(\.exe)?$/i.test(x));
  if (g < 0) return false;
  let k = g + 1;
  while (k < w.length && w[k].startsWith("-")) k += w[k] === "-R" || w[k] === "--repo" ? 2 : 1; // gh's own -R/--repo <repo>
  if (w[k] === "pr" && w[k + 1] === "merge") return true;
  if (w[k] !== "api") return false;
  const args = w.slice(k + 1);
  let method = null;
  let fields = false;
  for (let j = 0; j < args.length; j++) {
    const a = args[j];
    const m = a.match(/^(?:-X|--method)(?:=?(.+))?$/i);
    if (m) method = (m[1] ?? args[++j] ?? "").toUpperCase();
    else if (/^(-f|-F|--field|--raw-field|--input)(=|$)/.test(a) || /^-[fF]\S/.test(a)) fields = true;
  }
  const writes = (method ?? (fields ? "POST" : "GET")) !== "GET";
  if (!writes) return false;
  if (args.includes("graphql")) return args.some((a) => GH_MUTATION.test(a));
  return args.some((a) => !a.startsWith("-") && GH_WRITE_ENDPOINT.test(a.replace(/^\/?repos\/[^/]+\/[^/]+/, "")));
}

// ---- record files (spec §6.1): the coordinator's; a worker agent never writes them ----
const RECORDS = /(^|\/)(DURUM\.md|docs\/plan\/(BACKLOG|KARARLAR|SORULAR|EKRAN-PLANI)\.md|docs\/plan\/gunluk\/.+)$/i;
// `docs/plan/./KARARLAR.md`, `docs/plan/x/../SORULAR.md`, backslashes: a path is normalized before it is read.
// Windows also opens `KARARLAR.md.`, `KARARLAR.md ` and `DURUM.md::$DATA` (an NTFS stream) as the file itself, so
// each name loses its stream suffix and its trailing dots and spaces first (a drive's `C:` is kept).
const winName = (seg) => (seg === "." || seg === ".." || /^[A-Za-z]:$/.test(seg) ? seg : seg.replace(/:.*$/, "").replace(/[. ]+$/, ""));
const posix = (f) => path.posix.normalize(String(f ?? "").replaceAll("\\", "/").split("/").map(winName).join("/"));
export const isRecordFile = (f) => RECORDS.test(posix(f));
// Worker agents run in <project>/.claude/worktrees/agent-*/ (Agent tool, isolation: worktree).
const AGENT_TREE = /\/\.claude\/worktrees\/agent-[^/]+\//i;
export const inWorkerTree = (p) => AGENT_TREE.test(`${posix(p)}/`);
const byWorker = (input, where) => Boolean(input.agent_id) || inWorkerTree(where);
const RECORD_REFUSAL =
  "Reddedildi: kayıt dosyasını (DURUM, KARARLAR, SORULAR, BACKLOG, EKRAN-PLANI, günlük) yalnız koordinatör yazar; bulduğunu son mesajına yaz (CLAUDE.md §6).";
// The coordinator's record branch (spec §7.3): a worker never pushes to it.
const COORD_BRANCH = "coord/kayit";
const COORD_REFUSAL = `Reddedildi: ${COORD_BRANCH} koordinatörün kayıt dalıdır, işçi oraya gönderemez; kendi task/<iş> dalına gönder (CLAUDE.md §6).`;

// A git commit's record files: the staged ones plus any named on the command line.
const COMMIT_VALUE = new Set(["-m", "-F", "-C", "-c", "-t", "--author", "--date", "--file", "--message", "--template", "--cleanup", "--fixup", "--squash", "--trailer", "--reuse-message", "--reedit-message"]);
function commitRecords(seg, cwd) {
  const call = gitCall(seg, "commit");
  if (!call) return [];
  const dir = call.cwd ? path.resolve(cwd, call.cwd) : cwd;
  const named = [];
  for (let k = 0; k < call.args.length; k++) {
    const a = call.args[k];
    if (a === "--") {
      named.push(...call.args.slice(k + 1));
      break;
    }
    if (COMMIT_VALUE.has(a)) k++;
    else if (!a.startsWith("-")) named.push(a);
  }
  const staged = tryGit(dir, ["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);
  return [...new Set([...staged, ...named])].filter(isRecordFile);
}

export function audit(entry) {
  fs.mkdirSync(OPS_DIR, { recursive: true });
  const line = { at: new Date().toISOString(), ...entry };
  if (line.command) line.command = redact(line.command);
  fs.appendFileSync(AUDIT(), `${JSON.stringify(line)}\n`);
}

export function backupMain(cwd) {
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

// Command substitution: $( … ) or a backtick.
const SUBST = /\$\(|`/;
const SUBST_PUSH_MAIN = /\bgit\b[^;&|\n]*\bpush\b[^;&|\n]*\bmain\b/;

const EDIT_TOOLS = /^(Edit|Write|MultiEdit|NotebookEdit)$/;
function evaluateEdit(input) {
  const file = String(input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? "");
  // the session's own folder decides, so a worker cannot reach the coordinator's file by absolute path
  if (!isRecordFile(file) || !(byWorker(input, input.cwd) || inWorkerTree(file))) return { block: false };
  audit({ session_id: input.session_id ?? "", agent_id: input.agent_id ?? null, cwd: input.cwd ?? "", tool: input.tool_name, file, event: "record-by-worker-blocked" });
  return { block: true, message: RECORD_REFUSAL };
}

// Returns { block, message? }; performs backups and writes the audit log.
export function evaluate(input) {
  if (EDIT_TOOLS.test(input.tool_name ?? "")) return evaluateEdit(input);
  const cmd = input.tool_input?.command ?? "";
  const cwd = input.cwd ?? process.cwd();
  const base = { session_id: input.session_id ?? "", agent_id: input.agent_id ?? null, cwd, tool: input.tool_name ?? "", command: cmd };
  let segs = [];
  try {
    for (const re of DENIED) if (re.test(cmd)) audit({ ...base, event: "deny-pattern", pattern: String(re) });
    const links = chain(cmd, input.tool_name === "PowerShell" ? "pwsh" : "bash");
    segs = links.map((l) => l.seg);
    const dirs = folders(segs, cwd);
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      for (const entry of backupBranches(seg, dirs[i], base)) audit(entry);
      const recs = byWorker(input, dirs[i]) ? commitRecords(seg, dirs[i]) : [];
      if (recs.length) {
        audit({ ...base, event: "record-by-worker-blocked", files: recs });
        return { block: true, message: RECORD_REFUSAL };
      }
      const push = pushCall(seg, dirs[i]);
      if (push && byWorker(input, dirs[i]) && push.refs.some((r) => r.dst === COORD_BRANCH)) {
        audit({ ...base, event: "coord-push-by-worker-blocked" });
        return { block: true, message: COORD_REFUSAL };
      }
      // fail-safe: a push inside $( … ) or `…` is not a word gitCall can see, so the text decides
      const hidden = SUBST.test(seg) && SUBST_PUSH_MAIN.test(seg);
      const gh = ghToMain(seg);
      if (!hidden && !gh && (!push || !push.refs.some(toMain))) continue;
      const reason = overrideReason(segs, i);
      if (reason) {
        // no backup, no override: an emergency push never lands on main unsaved
        let b;
        try {
          b = backupMain(push?.dir ?? dirs[i]);
        } catch (err) {
          const why = String(err?.message ?? err).split("\n")[0];
          audit({ ...base, event: "push-main-override-no-backup", reason, error: why });
          return { block: true, message: `main'e gönderim reddedildi: NF_OVERRIDE verildi ama origin/main yedek alınamadı (${why}); yedeksiz geçilmez.` };
        }
        audit({ ...base, event: "push-main-override", reason, backup: b.ref, sha: b.sha, fetched: b.fetched });
        continue;
      }
      audit({ ...base, event: "push-main-blocked" });
      return {
        block: true,
        message:
          "main'e gönderim reddedildi: main'e yalnız tren gider (`node scripts/train.mjs run <dal…>`, koordinatör; CLAUDE.md §5). " +
          'Acil durumda push komutunun başına NF_OVERRIDE="<gerekçe>" koy; origin/main önce yedeklenir ve kayda düşer.',
      };
    }
    return { block: false };
  } catch (err) {
    // NF_OVERRIDE counts for nothing here: its backup or its log line may be missing, so a main push is refused
    const risky = (/\bpush\b/.test(cmd) && /\bmain\b/.test(cmd)) || /\bgh(\.exe)?\s[^\n]*\b(pr\s+merge|api)\b/i.test(cmd);
    try {
      audit({ ...base, event: "guard-error", error: String(err?.message ?? err), blocked: risky });
    } catch {}
    return risky
      ? { block: true, message: `guard hata verdi, main'e gönderim güvenlik için reddedildi (NF_OVERRIDE ile de; yedek ve kayıt güvencesi yok): ${err?.message ?? err}` }
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
  const tool = input.tool_name ?? "";
  if (!/^(Bash|PowerShell)$/.test(tool) && !EDIT_TOOLS.test(tool)) return;
  const r = evaluate(input);
  if (r.block) {
    process.stderr.write(r.message);
    process.exitCode = 2; // PreToolUse: exit 2 = refuse, stderr goes back to the model
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
