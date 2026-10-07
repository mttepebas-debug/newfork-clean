#!/usr/bin/env node
// COORD-CTRL + OTOMASYON-3: PreToolUse guard (CLAUDE.md §4.2, §4.8, §6).
// Bash/PowerShell:
// - A push to main needs a live main.lock (scripts/lock.mjs). Without one it is
//   refused, unless the push itself is prefixed with NF_OVERRIDE="<reason>": then
//   origin/main is first saved as refs/nf-backup/main/<stamp> and the bypass is logged.
// - One heavy run at a time: a gate test/build, test:db or e2e needs this session's
//   heavy.lock and no CI run in progress; a push that starts CI must not overlap another
//   session's heavy.lock. NF_OVERRIDE in front of the command passes and is logged.
// - Deleting a branch or removing a worktree is allowed, but the tip is saved
//   under refs/nf-backup/... first.
// Edit/Write, and a worker session's git commit: the record files of CLAUDE.md §4.8 are
// written only by the coordinator and by Mert's own sessions. `guard.mjs records-allow`
// is the logged way out for one session.
// Heavy-run and record problems warn until ENFORCE_FROM and are refused after it (ILKELER P16).
// Every decision lands in <inbox>/audit.log (one JSON object per line, secrets masked).
// Fail-closed only for a push to main: if evaluate() itself breaks, that push
// is refused (NF_OVERRIDE still passes). Everything else fails open.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { status as lockStatus } from "./lock.mjs";
import { INBOX_DIR, isCoordinator, slug } from "./inbox.mjs";

// The first week only warns; rollback = move this day forward.
const ENFORCE_DAY = "2026-10-14";
export const ENFORCE_FROM = Date.parse(`${ENFORCE_DAY}T00:00:00+03:00`);

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

// ponytail: shell-ish split on && || ; | newline; quoting inside a segment is not parsed, and a
// command wrapped in another shell (`bash -c "git push …"`, `pwsh -Command "…"`) is not seen.
// Each segment carries the operator in front of it; an empty segment between two
// operators keeps the weaker one (anything but && breaks a chain).
const SEP = /(&&|\|\||[;|\n])/;
export function chain(cmd) {
  const out = [];
  let sep = null;
  for (const part of dropBodies(cmd).split(SEP)) {
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

// Heredoc (`<<'EOF'`, `<<-EOF`) and PowerShell here-string (`@'` … `'@`) bodies are text, not
// commands: a report line or a commit body starting with "pnpm.cmd test" runs nothing. A body
// without its terminator is kept, so a stray "<<x" inside quotes never hides what follows.
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

// BL-500: `node scripts/lock.mjs take main "…" && … && git push …` takes the lock only
// when the command runs, after this hook. Joined by && alone, the guarded step runs only if
// the take succeeded, so the chain counts as holding the lock. Same for heavy.lock.
const takesLock = (seg, name) => {
  const w = words(seg);
  const n = w.findIndex((x) => /(^|[\\/])node(\.exe)?$/.test(x));
  return n >= 0 && /(^|[\\/])lock\.mjs$/.test(w[n + 1] ?? "") && w[n + 2] === "take" && w[n + 3] === name;
};
export function takesLockBefore(links, i, name) {
  for (let j = i; j > 0; j--) {
    if (links[j].sep !== "&&") return false;
    if (takesLock(links[j - 1].seg, name)) return true;
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

// Files a pushed source changes against origin/main (what that refspec brings).
const aheadFiles = (dir, src = "HEAD") =>
  src ? tryGit(dir, ["diff", "--name-only", `origin/main...${src}`]).split("\n").filter(Boolean) : [];

// Where a push goes: its directory and, per refspec, what it sends (src), where (dst; "*" for
// --all/--mirror) and the files that brings. BL-760: `git push origin task/x:main` sends task/x
// whatever HEAD is. src is null for a delete (`:main`), which brings no content.
function pushCall(seg, cwd) {
  const call = gitCall(seg, "push");
  if (!call) return null;
  const dir = call.cwd ? path.resolve(cwd, call.cwd) : cwd;
  const withAhead = (refs) => ({ dir, refs: refs.map((r) => ({ ...r, ahead: aheadFiles(dir, r.src) })) });
  // ponytail: --all/--mirror send every branch; HEAD stands in for them, as before
  if (call.args.some((a) => a === "--all" || a === "--mirror")) return withAhead([{ src: "HEAD", dst: "*" }]);
  const plain = call.args.filter((a) => !a.startsWith("-"));
  // --repo=<remote> names the remote as an option, so every plain arg is a refspec
  const refspecs = call.args.some((a) => a.startsWith("--repo")) ? plain : plain.slice(1);
  const current = () => tryGit(dir, ["branch", "--show-current"]);
  if (!refspecs.length) return withAhead([{ src: "HEAD", dst: current() }]);
  return withAhead(
    refspecs.map((spec) => {
      const s = spec.replace(/^\+/, "");
      const [src, dst] = s.includes(":") ? s.split(":") : [s, s === "HEAD" ? current() : s];
      return { src: src || null, dst: dst.replace(/^refs\/heads\//, "") };
    }),
  );
}
const toMain = (r) => r.dst === "main" || r.dst === "*";

// ci.yml runs on pushes to main and task/**, unless only docs/** and *.md changed.
const DOCS_ONLY = /^docs\/|\.md$/;
const startsCI = (push) =>
  push.refs.some((r) => (r.dst === "*" || r.dst === "main" || r.dst.startsWith("task/")) && r.ahead.some((f) => !DOCS_ONLY.test(f)));

// e2e before a push (CLAUDE.md §6, Mert 2026-10-01 "warning mode", ILKELER P16):
// e2e/e2e-pass-reporter.mjs appends a line here after a local run that passed on
// a clean tree. A push to main that changes screen, API or e2e code and has no
// such run on the same content gets a warning and an audit line; never a block.
const E2E_PASS = () => path.join(INBOX_DIR, "e2e-pass.jsonl");
const E2E_CODE = /^(apps\/web\/src|apps\/api\/src|packages\/(shared|ui)\/src|e2e)\//;
const sameContent = (dir, sha, src) => {
  try {
    git(dir, ["diff", "--quiet", sha, src, "--", "apps", "packages", "e2e", "supabase"]);
    return true;
  } catch {
    return false;
  }
};
export function e2eGap(dir, src = "HEAD", ahead = aheadFiles(dir, src)) {
  const files = ahead.filter((f) => E2E_CODE.test(f) && !/\.test\.tsx?$/.test(f));
  if (!files.length) return [];
  let shas = [];
  try {
    shas = fs.readFileSync(E2E_PASS(), "utf8").trim().split("\n").slice(-30).map((l) => JSON.parse(l).sha);
  } catch {}
  return shas.some((sha) => sameContent(dir, sha, src)) ? [] : files;
}

// ---- heavy runs (CLAUDE.md §4.2: CI, e2e, test:db and the gate run one at a time) ----

const GATE = new Set(["lint", "typecheck", "test", "build"]);
// A lone lint or typecheck takes seconds (root typecheck 24 s cold, 2026-10-07); a gate of more
// than two steps always holds test or build, so those two carry the rule.
const HEAVY = new Set(["test", "build", "test:db", "e2e"]);
const FOCUSED = /^(--filter|-F|-C|--dir)(=|$)/;
const prog = (x) => path.basename(String(x ?? "")).toLowerCase().replace(/\.(cmd|exe|ps1)$/, "");

// The gate step, "test:db" or "e2e" a segment runs, else null. A filtered run is focused, not heavy.
// ponytail: a bare `pnpm test` started inside apps/web runs that package only; it still counts.
export function runStep(seg) {
  // drop `VAR=value ` prefixes first: a quoted value may hold spaces (NF_OVERRIDE="two words")
  let w = words(seg.replace(/^(?:&\s*)?(?:[A-Za-z_]\w*=(?:"[^"]*"|'[^']*'|\S*)\s+)+/, ""));
  if (w[0] === "&") w = w.slice(1);
  if (["npx", "pnpx"].includes(prog(w[0]))) w = w.slice(1);
  else if (prog(w[0]) === "pnpm" && ["exec", "dlx"].includes(w[1])) w = w.slice(2);
  while (w.length && w[0].startsWith("-")) w = w.slice(1);
  const p = prog(w[0]);
  const args = w.slice(1);
  if (p === "supabase") return args[0] === "test" && args[1] === "db" ? "test:db" : null;
  // what `pnpm test:db` runs (PARALEL-1); --load-only reloads origin/main's builder and runs no test
  if (p === "node" && /(^|[\\/])test-db\.mjs$/.test(args[0] ?? "")) return args.includes("--load-only") ? null : "test:db";
  if (p === "playwright") return args[0] === "test" ? "e2e" : null;
  if ((p !== "pnpm" && p !== "turbo") || args.some((a) => FOCUSED.test(a))) return null;
  const script = args.find((a) => !a.startsWith("-") && a !== "run");
  if (p === "pnpm" && (script === "test:db" || script === "e2e")) return script;
  return GATE.has(script) ? script : null;
}

const samePath = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
function heavyLock(input, dir) {
  const l = lockStatus().find((x) => x.name === "heavy");
  if (l.free) return { free: true };
  // lock.mjs records CLAUDE_CODE_SESSION_ID, the same id the hook gets; a terminal has only cwd
  const mine = l.session ? l.session === input.session_id : samePath(l.cwd, dir);
  const info = `${l.identity}, ${l.ageMinutes ?? "?"} dk${l.stale ? ", bayat: 2 saatten eski, koordinatöre sor" : ""}`;
  return { free: false, mine, info };
}

// GitHub Actions runs not yet completed (queued counts: the single runner is the user's PC).
export const runningRuns = (ghJson) => JSON.parse(ghJson).filter((r) => String(r.status).toLowerCase() !== "completed");
export function ciState(cwd) {
  const forced = process.env.NEWFORK_CI_STATE; // tests only: idle | running | unknown
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

function heavyRun(input, links, i, dir, base, flag) {
  const segs = links.map((l) => l.seg);
  const step = runStep(segs[i]);
  const reason = overrideReason(segs, i);
  if (reason) {
    audit({ ...base, event: "heavy-override", step, reason });
    return null;
  }
  const problems = [];
  const lock = heavyLock(input, dir);
  if (!lock.mine && !takesLockBefore(links, i, "heavy"))
    problems.push(lock.free ? "heavy.lock alınmamış" : `heavy.lock başka oturumda (${lock.info})`);
  const ci = ciState(dir);
  if (ci.state === "unknown") audit({ ...base, event: "heavy-ci-unknown", step });
  if (ci.state === "running")
    problems.push(`CI koşuyor${ci.runs.length ? ` (${ci.runs.map((r) => `${r.name} / ${r.headBranch}: ${r.status}`).join("; ")})` : ""}`);
  if (!problems.length) {
    audit({ ...base, event: "heavy-ok", step });
    return null;
  }
  const take =
    step === "e2e" || step === "test:db"
      ? `önce db.lock, sonra heavy.lock: node scripts/lock.mjs take db "<oturum/iş>, <amaç>" && node scripts/lock.mjs take heavy "<oturum/iş>, <amaç>"`
      : `node scripts/lock.mjs take heavy "<oturum/iş>, <amaç>"`;
  return flag(
    "heavy",
    `ağır koşu (${step}): ${problems.join("; ")}. Aynı anda tek ağır koşu (CLAUDE.md §4.2). ` +
      `Kilit: ${take}${ci.state === "running" ? "; CI bitene kadar bekle (gh run list --limit 3)" : ""}. ` +
      `Bilinçli aşmak için ağır komutun başına NF_OVERRIDE="<gerekçe>" koy; kayda düşer.`,
    { step, problems },
  );
}

function heavyPush(input, links, i, dir, base, flag) {
  if (takesLockBefore(links, i, "heavy")) return null;
  const lock = heavyLock(input, dir);
  if (lock.free || lock.mine) return null;
  const reason = overrideReason(links.map((l) => l.seg), i);
  if (reason) {
    audit({ ...base, event: "heavy-override", step: "push", reason });
    return null;
  }
  return flag(
    "heavy",
    `bu push CI'ı başlatır ama heavy.lock başka oturumda (${lock.info}); aynı anda tek ağır koşu (CLAUDE.md §4.2). ` +
      `Kilit bırakılınca gönder. Bilinçli aşmak için push komutunun başına NF_OVERRIDE="<gerekçe>" koy; kayda düşer.`,
    { step: "push", lock: lock.info },
  );
}

// ---- record files (CLAUDE.md §4.8: written by the coordinator and Mert's own sessions) ----

const RECORDS = /(^|\/)docs\/plan\/(BACKLOG|KARARLAR|KOORDINATOR-KARARLARI|DERSLER|SABAH-SORULAR|HANDOFF|EKRAN-PLANI)\.md$/i;
export const isRecordFile = (f) => RECORDS.test(String(f ?? "").replaceAll("\\", "/"));
const ALLOW = (sid) => path.join(INBOX_DIR, "records-allow", `${slug(sid)}.json`);

// A user message's own text: no tool results, no injected reminders, no wrapper tags.
const userText = (o) => {
  if (o?.type !== "user" || o.isMeta) return "";
  const c = o.message?.content;
  return (typeof c === "string" ? c : Array.isArray(c) ? c.filter((b) => b?.type === "text").map((b) => b.text).join("\n") : "")
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<\/?[A-Za-z][\w-]*(\s[^>]*)?>/g, "");
};

// KK-188: the coordinator's task message starts with "Görev: <İŞ-ID>", so a worker session is one
// whose first real user message starts with it (a card, or the message a cleared pool session
// gets). The old "Rol:" header counts during the warning week only. true = worker, false = not
// (Mert's own session), null = no readable first message.
// ponytail: a worker whose first message lacks the line passes as Mert's session.
const HEAD_BYTES = 4 * 1024 * 1024; // the first user message sits after a few hook attachments
export function workerSession(transcriptPath, now = Date.now()) {
  let head;
  try {
    const fd = fs.openSync(transcriptPath, "r");
    try {
      const buf = Buffer.allocUnsafe(Math.min(fs.fstatSync(fd).size, HEAD_BYTES));
      head = buf.subarray(0, fs.readSync(fd, buf, 0, buf.length, 0)).toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
  // plain line start: "# Görev: …" is a prompt Mert pasted, not the coordinator's task message
  const marker = now < ENFORCE_FROM ? /^(Görev|Rol)\s*:/i : /^Görev\s*:/i;
  for (const line of head.split("\n")) {
    if (!line.includes('"type":"user"')) continue;
    let first = "";
    try {
      first = userText(JSON.parse(line)).split("\n").map((l) => l.trim()).find(Boolean) ?? "";
    } catch {}
    if (first) return marker.test(first);
  }
  return null;
}

export function recordsAllow(sessionId, reason) {
  if (!sessionId) return { ok: false, message: "oturum kimliği yok (CLAUDE_CODE_SESSION_ID); izin yazılmadı" };
  const why = String(reason ?? "").trim() || "(gerekçe yok)";
  fs.mkdirSync(path.dirname(ALLOW(sessionId)), { recursive: true });
  fs.writeFileSync(ALLOW(sessionId), JSON.stringify({ session_id: sessionId, reason: why, at: new Date().toISOString() }));
  audit({ session_id: sessionId, cwd: process.cwd(), event: "records-allow", reason: why });
  return { ok: true, message: `kayıt dosyası izni bu oturum için yazıldı (${why}); audit.log'a düştü` };
}

function records(input, files, base, flag, now) {
  if (isCoordinator(input.session_id)) return null;
  const names = files.map((f) => path.basename(String(f).replaceAll("\\", "/")));
  const worker = workerSession(input.transcript_path, now);
  if (worker === null) {
    audit({ ...base, event: "records-unknown", files: names });
    return null;
  }
  if (!worker) return null;
  if (fs.existsSync(ALLOW(input.session_id))) {
    audit({ ...base, event: "records-allowed", files: names });
    return null;
  }
  return flag(
    "records",
    `kayıt dosyası (${names.join(", ")}): bu dosyalara yalnız koordinatör ve Mert'in açtığı oturum yazar (CLAUDE.md §4.8). ` +
      `Raporunu görev dosyasına (docs/plan/tasks/<ID>.md) ya da ekran klasörüne (ekranlar/<no>-<ekran>/uygulama/) yaz; ` +
      `kayda geçecek bilgiyi raporla koordinatöre bildir. Mert bu oturumda açıkça istediyse: ` +
      `node scripts/guard.mjs records-allow "<gerekçe>" (kayda düşer).`,
    { files: names },
  );
}

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

// A problem is a warning until ENFORCE_FROM and a refusal after it; both are logged.
function flagger(base, now, warns) {
  return (kind, text, extra = {}) => {
    const block = now >= ENFORCE_FROM;
    audit({ ...base, event: `${kind}-${block ? "block" : "warn"}`, ...extra });
    if (block) return { block: true, message: `Reddedildi: ${text}` };
    warns.push(`Uyarı (${ENFORCE_DAY}'ten sonra engel): ${text}`);
    return null;
  };
}
const done = (warns) => ({ block: false, warn: warns.length ? warns.join("\n") : null });

const EDIT_TOOLS = /^(Edit|Write|MultiEdit|NotebookEdit)$/;
function evaluateEdit(input, now) {
  const file = String(input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? "");
  if (!isRecordFile(file)) return done([]);
  const base = { session_id: input.session_id ?? "", cwd: input.cwd ?? process.cwd(), tool: input.tool_name, file };
  const warns = [];
  try {
    return records(input, [file], base, flagger(base, now, warns), now) ?? done(warns);
  } catch (err) {
    try {
      audit({ ...base, event: "guard-error", error: String(err?.message ?? err), blocked: false });
    } catch {}
    return done([]);
  }
}

// Returns { block, message } or { block: false, warn }; performs backups and writes the audit log.
export function evaluate(input, now = Date.now()) {
  if (EDIT_TOOLS.test(input.tool_name ?? "")) return evaluateEdit(input, now);
  const cmd = input.tool_input?.command ?? "";
  const cwd = input.cwd ?? process.cwd();
  const base = { session_id: input.session_id ?? "", cwd, tool: input.tool_name ?? "", command: cmd };
  let segs = [];
  const warns = [];
  const flag = flagger(base, now, warns);
  try {
    for (const re of DENIED) if (re.test(cmd)) audit({ ...base, event: "deny-pattern", pattern: String(re) });

    const links = chain(cmd);
    segs = links.map((l) => l.seg);
    const dirs = folders(segs, cwd);
    const heavyAt = segs.findIndex((s) => HEAVY.has(runStep(s)));
    if (heavyAt >= 0) {
      const r = heavyRun(input, links, heavyAt, dirs[heavyAt], base, flag);
      if (r) return r;
    }
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      for (const entry of backupBranches(seg, dirs[i], base)) audit(entry);

      const recs = commitRecords(seg, dirs[i]);
      if (recs.length) {
        const r = records(input, recs, base, flag, now);
        if (r) return r;
      }

      const push = pushCall(seg, dirs[i]);
      if (!push) continue;
      if (startsCI(push)) {
        const r = heavyPush(input, links, i, push.dir, base, flag);
        if (r) return r;
      }
      const mainRefs = push.refs.filter(toMain);
      if (!mainRefs.length) continue;
      const gap = [...new Set(mainRefs.flatMap((r) => e2eGap(push.dir, r.src, r.ahead)))];
      if (gap.length) {
        audit({ ...base, event: "push-main-e2e-missing", files: gap.slice(0, 10) });
        warns.push(
          `Uyarı: bu push ekran/API/e2e kodu değiştiriyor (${gap.length} dosya, ör. ${gap[0]}) ama aynı içerikte ` +
            `geçen yerel e2e koşusu yok (CLAUDE.md §6). Commit'ten sonra etkilenen e2e'yi db.lock ile koştur. Push engellenmedi.`,
        );
      }
      if (takesLockBefore(links, i, "main")) {
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
        const b = backupMain(push.dir);
        audit({ ...base, event: "push-main-override", reason, lock: lockInfo, backup: b.ref, sha: b.sha, fetched: b.fetched });
        continue;
      }
      audit({ ...base, event: "push-main-blocked", lock: lockInfo });
      return {
        block: true,
        message:
          `main'e gönderim reddedildi: main.lock ${lock.free ? "alınmamış" : `bayat (${lockInfo})`}. ` +
          `Önce: node scripts/lock.mjs take main "<oturum/iş>, <amaç>" (CLAUDE.md §6). ` +
          `Bilinçli aşmak için push komutunun başına NF_OVERRIDE="<gerekçe>" koy; origin/main yedeklenir ve kayda düşer.`,
      };
    }
    return done(warns);
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
  const [, , cmd, ...rest] = process.argv;
  if (cmd === "records-allow") {
    const r = recordsAllow(process.env.CLAUDE_CODE_SESSION_ID, rest.join(" "));
    console.log(r.message);
    if (!r.ok) process.exitCode = 1;
    return;
  }
  if (cmd) {
    console.error('usage: node scripts/guard.mjs records-allow "<gerekçe>"   (kanca olarak argümansız koşar)');
    process.exitCode = 1;
    return;
  }
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
