#!/usr/bin/env node
// TREN-ARACI (KARARLAR OPS-08, CLAUDE.md §5 tren): only the coordinator's train goes to main.
// Each step is its own command with its own exit code; long output goes to a log file, the screen gets a summary.
// State: <train>/artifacts/train/state.json; logs: <train>/artifacts/train/<stamp>/<step>.log (artifacts/ is ignored).
//   plan <branch[@sha]…>   order, blockers, warnings and a dry run of build; changes nothing but `git fetch`
//   build <branch[@sha]…>  train/<stamp> from origin/main in the train folder; exit 2 = a branch was left out
//   ci                     pushes train/<stamp> and waits for its GitHub Actions run: the full check, once (WORKFLOW-V2)
//   push                   origin main fast-forwarded to the train, only when ci was green for that very sha
//   apply-local            the train's new migrations into the shared local database, holding db for this step only (none: no lock)
//   run <branch[@sha]…>    build → ci → push → apply-local; coord/kayit2 rides along when main lacks its commits
// One train at a time on this PC: run holds train.lock from build to the end of apply-local, and build, ci, push and
// apply-local run alone hold it for their own step. A second train waits in the lock's queue and then builds
// on the main the first one moved, so no green CI is lost to "main ilerledi" (TREN-KILIDI).
// The push runs inside this script, so scripts/guard.mjs never sees it; the same rules (fast-forward only, a green
// CI) hold here and land in the guard's audit.log. NF_OVERRIDE="<reason>" in front of a step passes a lock or CI
// check (origin/main saved first; never a non-fast-forward push) and is logged.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { acquire, release, status as lockStatus, clearDead } from "./lock.mjs";
import { audit, backupMain, isRecordFile } from "./guard.mjs";
import { fingerprint, headerHash } from "./schema-snapshot.mjs";
import { container, nonTransactional } from "./test-db.mjs";
import { pcPath, NOT_ON_PC, NOT_ON_PC_EXIT } from "./ops.mjs";

const TRAIN_DIR = pcPath(process.env.NEWFORK_TRAIN_DIR, "newfork-wt/train"); // null off Mert's PC
const BASE = "origin/main";
const MIGRATIONS = "supabase/migrations";
const SCHEMA = "supabase/schema.sql";

const git = (cwd, args, opts = {}) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...opts }).trim();
const tryGit = (cwd, args) => {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
};
const listed = (out) => (out ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
const short = (sha) => sha.slice(0, 8);
const version = (file) => file.split("_")[0];
const isAncestor = (repo, a, b) => spawnSync("git", ["-C", repo, "merge-base", "--is-ancestor", a, b]).status === 0;
const tailOf = (text, n) => listed(text).slice(-n);

// 2026-10-08T09:16:30Z -> 20261008T0916Z (the first train's own naming)
const stampOf = (date) => {
  const iso = date.toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}Z`;
};

// ---- branches and migrations ----

// "task/x" is origin's branch (else the local one); "task/x@<sha>" pins the commit a TREN-HAZIR named.
function resolve(repo, arg) {
  const at = arg.lastIndexOf("@");
  const name = at > 0 ? arg.slice(0, at) : arg;
  const tipRef = [`refs/remotes/origin/${name}`, `refs/heads/${name}`].find((r) => tryGit(repo, ["rev-parse", "--verify", "-q", r]));
  const tip = tipRef ? git(repo, ["rev-parse", tipRef]) : null;
  if (at <= 0) return tip ? { name, ref: tip, moved: null } : null;
  const sha = tryGit(repo, ["rev-parse", "--verify", "-q", `${arg.slice(at + 1)}^{commit}`]);
  return sha ? { name, ref: sha, moved: tip && tip !== sha ? tip : null } : null;
}

const sqlFiles = (out) => listed(out).filter((f) => f.endsWith(".sql")).map((f) => path.posix.basename(f)).sort();
const mainMigrations = (repo, ref) => sqlFiles(git(repo, ["ls-tree", "--name-only", ref, `${MIGRATIONS}/`]));
// Added files only, renames as delete + add: a renamed migration is a new one (supabase/CLAUDE.md "Canlı").
const addedMigrations = (repo, range) => sqlFiles(git(repo, ["diff", "--name-only", "--no-renames", "--diff-filter=A", ...range, "--", `${MIGRATIONS}/`]));
const MIGRATION_NAME = /^\d{14}_[\w-]+\.sql$/; // supabase/CLAUDE.md: YYYYMMDDHHMMSS_<ad>.sql

// What a branch's own commits (those main lacks) do to supabase/migrations: files it adds, and migrations already
// on main it edits or deletes. Counted from those commits, not from the merge base, so a migration a train already
// carried is not counted again on a branch that was not rebased since.
function migrationChanges(repo, commits, onMain) {
  const seen = new Map(); // file -> statuses in commit order
  for (const c of commits)
    for (const line of listed(git(repo, ["diff-tree", "--no-commit-id", "--name-status", "-r", "--no-renames", `${c}^`, c, "--", `${MIGRATIONS}/`]))) {
      const [status, file] = line.split("\t");
      if (file.endsWith(".sql")) seen.set(path.posix.basename(file), [...(seen.get(path.posix.basename(file)) ?? []), status[0]]);
    }
  const main = new Set(onMain);
  const added = [];
  const edited = [];
  const deleted = [];
  for (const [file, statuses] of seen) {
    const gone = statuses.at(-1) === "D";
    if (main.has(file)) (gone ? deleted : edited).push(file);
    else if (!gone) added.push(file);
  }
  return { added: added.sort(), edited: edited.sort(), deleted: deleted.sort() };
}

// Commits whose change main does not have yet, oldest first (`git cherry` matches rebased copies by patch).
const ahead = (repo, ref) => listed(git(repo, ["cherry", BASE, ref])).filter((l) => l.startsWith("+ ")).map((l) => l.slice(2));

const COORD_BRANCH = "coord/kayit2"; // the coordinator's records (spec §7.3)

// coord/kayit2 is never rebased (no force push), so after a train carries its commits `git cherry` still sees them,
// and when main changed a line next to one before that train landed, the patch differs and it calls the commit new:
// replayed, it clashes and the whole records branch is left out (TREN-KAYIT-ATLA). A train's copy keeps the
// author, the author date and the message (copyCommit), so a commit with such a copy on main has landed whatever
// main did to those lines since (a later edit or a revert is main's word, not a reason to replay it). Content
// matching was weighed and left: a line a commit adds may already sit on main, and a line it adds may have been
// edited on main since, so it would both skip records that never landed and replay ones that did.
// Only for coord/kayit2: a task branch's commits are replayed as before. Returns { commits, landed: [[c, copy]] }.
function pendingCommits(repo, b) {
  const commits = ahead(repo, b.ref);
  if (b.name !== COORD_BRANCH || !commits.length) return { commits, landed: [] };
  // the copy's message ends in one more newline (commit-tree is fed `%B`), so trailing whitespace is not compared
  const key = ([name, email, date, message]) => [name, email, date, message.trimEnd()].join("\0");
  const copies = new Map();
  const log = execFileSync("git", ["-C", repo, "log", "-z", "--format=%H%x00%an%x00%ae%x00%aI%x00%B", BASE, `^${b.ref}`], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  }).split("\0");
  for (let i = 0; i + 4 < log.length; i += 5) copies.set(key(log.slice(i + 1, i + 5)), log[i].replace(/^\n/, ""));
  const landed = [];
  const left = [];
  for (const c of commits) {
    const [, ...fields] = execFileSync("git", ["-C", repo, "log", "-1", "-z", "--format=%H%x00%an%x00%ae%x00%aI%x00%B", c], { encoding: "utf8" }).split("\0");
    const copy = copies.get(key(fields.slice(0, 4)));
    if (copy) landed.push([c, copy]);
    else left.push(c);
  }
  return { commits: left, landed };
}
// Record files (guard.mjs isRecordFile) a branch's own commits change; only coord/kayit2 may carry them (spec §10).
function recordFiles(repo, commits) {
  const files = new Set();
  for (const c of commits)
    for (const f of listed(git(repo, ["-c", "core.quotePath=false", "diff-tree", "--no-commit-id", "--name-only", "-r", "--no-renames", `${c}^`, c])))
      if (isRecordFile(f)) files.add(f);
  return [...files].sort();
}

// ---- building commits in memory: nothing is checked out until the whole train is known ----

// `tree` with `file` taken from `commit` (the train's own schema.sql when only it clashed).
function withFile(repo, tree, commit, file) {
  const index = path.join(os.tmpdir(), `nf-train-${process.pid}-${Date.now()}.index`);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    git(repo, ["read-tree", tree], { env });
    const entry = tryGit(repo, ["ls-tree", commit, "--", file]); // "<mode> blob <sha>\t<file>"
    if (entry) {
      const [mode, , sha] = entry.split(/\s+/);
      git(repo, ["update-index", "--add", "--cacheinfo", `${mode},${sha},${file}`], { env });
    } else git(repo, ["update-index", "--force-remove", "--", file], { env });
    return git(repo, ["write-tree"], { env });
  } finally {
    fs.rmSync(index, { force: true });
  }
}

// A copy of `commit` with `tree` on top of `parent`: author, date and message kept.
function copyCommit(repo, commit, tree, parent) {
  const [name, email, date] = git(repo, ["log", "-1", "--format=%an%x00%ae%x00%aI", commit]).split("\0");
  const message = execFileSync("git", ["-C", repo, "log", "-1", "--format=%B", commit], { encoding: "utf8" });
  return git(repo, ["commit-tree", tree, "-p", parent, "-F", "-"], {
    input: message,
    env: { ...process.env, GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date },
  });
}

// Each branch's commits replayed onto the train so far; a branch with any clash other than schema.sql is left
// out whole and the train goes on from where it was before that branch.
function simulate(repo, base, branches) {
  let head = base;
  let schemaClash = false;
  const results = [];
  for (const b of branches) {
    let tip = head;
    let clash = false;
    let conflict = null;
    for (const c of b.commits) {
      const parent = git(repo, ["rev-parse", `${c}^`]);
      const r = spawnSync("git", ["-C", repo, "merge-tree", "--write-tree", "--name-only", "-z", "--no-messages", `--merge-base=${parent}`, tip, c], {
        encoding: "utf8",
      });
      if (r.status !== 0 && r.status !== 1) throw new Error(`git merge-tree ${short(c)}: ${(r.stderr ?? "").trim()}`);
      const [tree, ...rest] = r.stdout.split("\0");
      let next = tree;
      if (r.status === 1) {
        const files = [...new Set(rest.filter(Boolean))];
        if (files.length !== 1 || files[0] !== SCHEMA) {
          conflict = files;
          break;
        }
        next = withFile(repo, tree, tip, SCHEMA);
        clash = true;
      }
      if (next !== git(repo, ["rev-parse", `${tip}^{tree}`])) tip = copyCommit(repo, c, next, tip);
    }
    if (conflict) results.push({ ...b, skipped: true, files: conflict });
    else {
      head = tip;
      schemaClash ||= clash;
      results.push({ ...b, skipped: false, schemaClash: clash });
    }
  }
  return { head, schemaClash, results };
}

// ---- state, logs, locks, audit ----

const stateFile = (trainDir) => path.join(trainDir, "artifacts", "train", "state.json");
function readState(ctx) {
  try {
    return JSON.parse(fs.readFileSync(stateFile(ctx.trainDir), "utf8"));
  } catch {
    return null;
  }
}
function writeState(ctx, state) {
  fs.mkdirSync(path.dirname(stateFile(ctx.trainDir)), { recursive: true });
  fs.writeFileSync(stateFile(ctx.trainDir), `${JSON.stringify(state, null, 2)}\n`);
}
const NO_STATE = { code: 1, lines: ["tren durumu yok: önce `node scripts/train.mjs build <dal…>`"] };

// An empty log for this step of this train.
function logFile(ctx, stamp, step) {
  const file = path.join(ctx.trainDir, "artifacts", "train", stamp, `${step.replace(/[^\w.-]/g, "-")}.log`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "");
  return file;
}

const auditBase = (ctx, step) => ({
  session_id: process.env.CLAUDE_CODE_SESSION_ID ?? "",
  cwd: ctx.repo,
  tool: "train",
  command: `node scripts/train.mjs ${step}`,
});

// A check that failed: passes with NF_OVERRIDE (logged as train-override), else stops (train-blocked).
// `beforeOverride` runs only when the check is passed and adds its result to the log entry (the main backup).
function pass(ctx, s, step, blocker, lines, beforeOverride = () => ({})) {
  const entry = { ...auditBase(ctx, step), step, blocker, train: s.branch };
  if (ctx.override) {
    const extra = beforeOverride();
    audit({ ...entry, event: "train-override", reason: ctx.override, ...extra });
    lines.push(`AŞILDI (NF_OVERRIDE): ${blocker}${extra.backup ? `; origin/main önce ${extra.backup} olarak yedeklendi` : ""}`);
    return true;
  }
  audit({ ...entry, event: "train-blocked" });
  lines.push(`DUR: ${blocker}`);
  return false;
}
// A check NF_OVERRIDE never passes.
function refuse(ctx, s, step, blocker, lines, extra = {}) {
  audit({ ...auditBase(ctx, step), step, blocker, train: s.branch, event: "train-blocked", ...extra });
  lines.push(`DUR: ${blocker}`);
  return false;
}

const lockOf = (name) => lockStatus().find((l) => l.name === name);
// The train's own lock: its identity and this very process (a second train process with the same stamp
// holds a lock under the same identity, and it is not ours to use or let go).
const mine = (s, name) => {
  const l = lockOf(name);
  return !l.free && l.identity === s.identity && l.pid === process.pid;
};
// The train holds `name` (already, or takes it now). A dead holder is cleared first, also one under the train's
// own identity left by an earlier train process. A live one is waited for in the lock's queue, in arrival order
// (spec §7.4), up to ctx.lockWaitMin; past that it is a check NF_OVERRIDE can pass. With NF_OVERRIDE the train
// does not wait: it tries once, then takes the override path. Waiting lines go only to the screen, as they come.
function hold(ctx, s, name, step, lines, beforeOverride) {
  const cleared = clearDead(name);
  if (cleared) lines.push(cleared);
  if (mine(s, name)) return true;
  // waiting lines go to the screen as they come, not again in the final print
  const say = (l) => console.log(l);
  const got = acquire(name, `${s.identity}, tren ${step}`, { maxWaitMin: ctx.override ? 0 : (ctx.lockWaitMin ?? 30), sleep: ctx.sleep, say });
  if (got.ok) return true;
  // what kept it: the holder, or a ticket ahead in the queue (ours is gone by now)
  const l = lockOf(name);
  const ahead = l.queue?.[0];
  const why = !l.free
    ? l.identity === s.identity
      ? `${name}.lock aynı kimlikte başka süreçte: ${l.identity} (pid ${l.pid ?? "?"})`
      : `${name}.lock başka kimlikte: ${l.identity ?? "?"}${l.purpose ? ` (${l.purpose})` : ""}`
    : ahead
      ? `${name}.lock sırasında önde: ${ahead.identity ?? "?"}${ahead.command ? ` (${ahead.command})` : ""}`
      : null;
  const blocker = ctx.override ? (why ?? got.message) : why ? `${got.message}: ${why}` : got.message;
  return pass(ctx, s, step, blocker, lines, beforeOverride);
}
const letGo = (s, name) => {
  if (mine(s, name)) release(name, s.identity);
};

// From build to push the train folder, its state.json and main's tip belong to the running train, so this PC
// runs one train at a time. train.lock is held by this process under its own identity (one per process: a
// train's steps inside run reuse it). A live holder is waited for in arrival order up to ctx.trainWaitMin
// (default 150: longer than a healthy train can hold it -- build, 5 min for the run to show, 90 of CI, 30 for db); a dead one (its process gone) is cleared first. Past the wait it is a
// check NF_OVERRIDE can pass; with NF_OVERRIDE the train tries once and then runs without the lock, logged.
const TRAIN_LOCK = "train";
let trainHeld = null;
const trainIdentity = () => `tren/${(process.env.CLAUDE_CODE_SESSION_ID || "elle").slice(0, 8)}-${process.pid}`;
function withTrain(ctx, step, purpose, fn) {
  if (trainHeld) return fn();
  const lines = [];
  const cleared = clearDead(TRAIN_LOCK);
  if (cleared) lines.push(cleared);
  const holder = lockOf(TRAIN_LOCK);
  if (!holder.free) console.log(`train.lock başka trende: ${holder.identity}${holder.purpose ? ` (${holder.purpose})` : ""}; sırada bekleniyor`);
  const identity = trainIdentity();
  const say = (l) => console.log(l);
  const got = acquire(TRAIN_LOCK, `${identity}, ${purpose}`, { maxWaitMin: ctx.override ? 0 : (ctx.trainWaitMin ?? 150), sleep: ctx.sleep, say });
  if (!got.ok) {
    const l = lockOf(TRAIN_LOCK);
    const ahead = l.queue?.[0];
    const why = !l.free
      ? `train.lock başka trende: ${l.identity ?? "?"}${l.purpose ? ` (${l.purpose})` : ""}`
      : ahead
        ? `train.lock sırasında önde: ${ahead.identity ?? "?"}${ahead.command ? ` (${ahead.command})` : ""}`
        : null;
    const blocker = why ? `${why}; ${got.message}` : got.message;
    if (!pass(ctx, { branch: null }, step, blocker, lines)) return { code: 1, lines, failedStep: "train-lock" };
    const r = fn();
    return { ...r, lines: [...lines, ...r.lines] };
  }
  trainHeld = identity;
  try {
    const r = fn();
    return { ...r, lines: [...lines, ...r.lines] };
  } finally {
    release(TRAIN_LOCK, identity);
    trainHeld = null;
  }
}

// ---- steps ----

export function plan(ctx, args) {
  const { repo } = ctx;
  tryGit(repo, ["fetch", "-q", "origin"]);
  const base = git(repo, ["rev-parse", BASE]);
  const onMain = mainMigrations(repo, base);
  const lastMain = onMain.at(-1) ?? "";
  const lines = [`tren planı: origin/main @${short(base)}, son göç ${lastMain || "-"}`];
  const blockers = [];
  const warnings = [];
  const branches = [];
  for (const arg of args) {
    const b = resolve(repo, arg);
    if (!b) {
      blockers.push(`${arg} bulunamadı`);
      continue;
    }
    const { commits, landed } = pendingCommits(repo, b);
    for (const [c, copy] of landed) lines.push(`${b.name}: zaten main'de (kopyası main'de): ${short(c)} = main @${short(copy)}`);
    if (!commits.length) {
      lines.push(`${b.name}: zaten main'de`);
      continue;
    }
    // `git cherry` leaves merges out; a merge on the branch would be dropped without a word
    const merges = listed(git(repo, ["rev-list", "--merges", `${BASE}..${b.ref}`]));
    if (merges.length) blockers.push(`${b.name}: birleştirme commit'i var (${short(merges[0])}); dalı rebase et`);
    if (b.moved) warnings.push(`${b.name}: dal @${short(b.moved)}'a ilerlemiş; tren @${short(b.ref)}'yı alıyor`);
    // a worker never writes a record file (CLAUDE.md §6); NF_OVERRIDE passes it, logged
    if (b.name !== COORD_BRANCH)
      for (const f of recordFiles(repo, commits)) {
        const said = [];
        const blocker = `${b.name}: kayıt dosyasına dokunuyor: ${f}; kayıtları yalnız koordinatör yazar (CLAUDE.md §6)`;
        if (pass(ctx, { branch: null }, "plan", blocker, said)) lines.push(...said);
        else blockers.push(blocker);
      }
    const changes = migrationChanges(repo, commits, onMain);
    for (const f of changes.added.filter((f) => !MIGRATION_NAME.test(f))) blockers.push(`${b.name}: göç adı geçersiz: ${f} (YYYYMMDDHHMMSS_<ad>.sql)`);
    for (const f of changes.edited) blockers.push(`${b.name}: main'deki göç değişiyor: ${f} (uygulanmış göç değişmez; düzeltme yeni göçle)`);
    for (const f of changes.deleted) warnings.push(`${b.name}: main'deki göç siliniyor: ${f} (canlı numarasına yeniden adlandırma mı? kontrol et)`);
    branches.push({ ...b, commits, migrations: changes.added });
  }
  const owner = new Map(onMain.map((f) => [version(f), "main"]));
  for (const b of branches)
    for (const f of b.migrations) {
      const v = version(f);
      if (owner.has(v)) blockers.push(`${v} iki kez: ${owner.get(v)} ve ${b.name}`);
      else owner.set(v, b.name);
      if (lastMain && v < version(lastMain)) warnings.push(`${b.name}: ${f} sırasız: canlıya bu sırayla mı girdi? kontrol et`);
    }
  const ordered = [
    ...branches.filter((b) => !b.migrations.length),
    ...branches.filter((b) => b.migrations.length).sort((a, b) => (a.migrations[0] < b.migrations[0] ? -1 : 1)),
  ];
  let sim = null;
  if (!blockers.length && ordered.length) {
    sim = simulate(repo, base, ordered);
    sim.results.forEach((r, i) => {
      const what = r.skipped
        ? `ATLANIR, çakışma: ${r.files.join(", ")}`
        : `girer${r.schemaClash ? " (schema.sql yeniden üretilecek)" : ""}${r.migrations.length ? `, göç: ${r.migrations.join(", ")}` : ""}`;
      lines.push(`  ${i + 1}. ${r.name}: ${what}, ${r.commits.length} commit`);
    });
  }
  for (const w of warnings) lines.push(`UYARI: ${w}`);
  for (const b of blockers) lines.push(`ENGEL: ${b}`);
  const code = blockers.length ? 1 : sim?.results.some((r) => r.skipped) ? 2 : 0;
  return { code, lines, base, order: ordered.map((b) => b.name), sim };
}

// A file leaves the list once main has its name, under any number: it may ship renamed to its live ledger number
// (supabase/CLAUDE.md "Canlı"), and then apply-local's "behind main" check names the old number in the ledger.
function stray(repo, base, previous) {
  if (!previous) return [];
  const named = (f) => f.replace(/^\d+_/, "");
  const onMain = new Set(mainMigrations(repo, base).map(named));
  const left = [...(previous.strayInSharedDb ?? []), ...(previous.pushed ? [] : (previous.applied ?? []))];
  return [...new Set(left)].filter((f) => !onMain.has(named(f))).sort();
}

export const build = (ctx, args) => withTrain(ctx, "build", `build ${args.join(" ")}`, () => buildStep(ctx, args));
function buildStep(ctx, args) {
  const { repo, trainDir } = ctx;
  const p = plan(ctx, args);
  const lines = [...p.lines];
  if (p.code === 1) return { code: 1, lines: [...lines, "build yapılmadı: önce engeller"] };
  if (!p.sim) return { code: 1, lines: [...lines, "trene girecek dal yok"] };
  const treeOf = (c) => git(repo, ["rev-parse", `${c}^{tree}`]);
  if (treeOf(p.sim.head) === treeOf(p.base)) return { code: 1, lines: [...lines, "trene girecek değişiklik yok"] };
  let stamp = stampOf(ctx.now());
  for (let k = 0; tryGit(repo, ["rev-parse", "--verify", "-q", `refs/heads/train/${stamp}`]); k++) stamp = `${stampOf(ctx.now())}${"bcdefghij"[k]}`;
  const branch = `train/${stamp}`;
  const previous = readState(ctx);
  if (fs.existsSync(trainDir)) {
    const common = (dir) => path.resolve(git(dir, ["rev-parse", "--path-format=absolute", "--git-common-dir"])).toLowerCase();
    if (tryGit(trainDir, ["rev-parse", "--git-dir"]) === null || common(trainDir) !== common(repo))
      return { code: 1, lines: [...lines, `tren klasörü bu deponun worktree'si değil: ${trainDir}`] };
    if (git(trainDir, ["status", "--porcelain"])) return { code: 1, lines: [...lines, `tren klasörü temiz değil: ${trainDir}; elle bak, silme`] };
    git(trainDir, ["switch", "-q", "-c", branch, p.sim.head]);
  } else git(repo, ["worktree", "add", "-q", "-b", branch, trainDir, p.sim.head]);

  let head = p.sim.head;
  let code = p.sim.results.some((r) => r.skipped) ? 2 : 0;
  const schema = fs.readFileSync(path.join(trainDir, SCHEMA), "utf8");
  if (p.sim.schemaClash || headerHash(schema) !== fingerprint(path.join(trainDir, MIGRATIONS)).hash) {
    const log = logFile(ctx, stamp, "db-schema");
    const st = ctx.exec.dbSchema(trainDir, log);
    if (st !== 0) {
      lines.push(`db:schema kırmızı (çıkış ${st}), log: ${log}`);
      code = 1;
    } else if (git(trainDir, ["status", "--porcelain", "--", SCHEMA])) {
      git(trainDir, ["add", "--", SCHEMA]);
      git(trainDir, ["commit", "-q", "-m", `chore(db): schema snapshot for ${branch} (TREN)`]);
      head = git(trainDir, ["rev-parse", "HEAD"]);
      lines.push("schema.sql yeniden üretildi ve commit'lendi");
    }
  }
  const state = {
    stamp,
    branch,
    identity: `koordinator/tren-${stamp}`,
    base: p.base,
    head,
    included: p.sim.results.filter((r) => !r.skipped).map((r) => ({ name: r.name, ref: r.ref, commits: r.commits, migrations: r.migrations })),
    skipped: p.sim.results.filter((r) => r.skipped).map((r) => ({ name: r.name, files: r.files })),
    newMigrations: addedMigrations(repo, [p.base, head]),
    applied: [],
    // what earlier trains applied to the shared database and main still lacks, carried until main has it
    strayInSharedDb: stray(repo, p.base, previous),
    ci: null,
    pushed: null,
  };
  writeState(ctx, state);
  if (state.strayInSharedDb.length) lines.push(`UYARI: ortak DB'de main'de olmayan göç: ${state.strayInSharedDb.join(", ")} (önceki tren main'e girmedi)`);
  lines.push(`tren: ${branch} @${short(head)}, ${state.included.length} dal, klasör ${trainDir}`);
  for (const s of state.skipped) lines.push(`atlandı: ${s.name} (${s.files.join(", ")}); dal rebase edilip sonraki trene`);
  return { code, lines, state };
}

const literal = (sql) => {
  let tag = "$nf_train$";
  for (let k = 1; sql.includes(tag); k++) tag = `$nf_train${k}$`;
  return `${tag}${sql}${tag}`;
};
// One transaction (psql -1): the migration and its ledger row together, as `apply_migration` records it.
// Not `supabase migration up --local`: the CLI runs a file statement by statement (live gets it as one query),
// applies every file the ledger lacks, and needs --include-all for out-of-order ones (TREN-ARACI.md).
const applySql = (file, sql) => {
  const name = file.replace(/^\d+_/, "").replace(/\.sql$/, "").replace(/'/g, "''");
  return (
    `set client_min_messages = warning;\n${sql}\n` +
    `insert into supabase_migrations.schema_migrations(version, name, statements) values ('${version(file)}', '${name}', array[${literal(sql)}]);\n`
  );
};

export const applyLocal = (ctx) => withTrain(ctx, "apply-local", "apply-local", () => applyLocalStep(ctx));
function applyLocalStep(ctx) {
  const s = readState(ctx);
  if (!s) return NO_STATE;
  const lines = [];
  // The train's migrations come from git (build's state), not from the shared DB: with none, the step has
  // nothing to write and nothing to check against, so it neither waits behind another session's db nor reads it.
  if (!s.newMigrations.length) {
    lines.push("uygulanacak göç yok; db.lock istenmedi");
    return { code: 0, lines };
  }
  if (!hold(ctx, s, "db", "apply-local", lines)) return { code: 1, lines };
  const stop = (line) => {
    lines.push(line);
    letGo(s, "db");
    return { code: 1, lines };
  };
  // version, md5(statements[1]) and the statement count: psql -1 and apply_migration store the file as one
  // statement, so its md5 is the file's; the CLI splits it, and then the content cannot be compared
  const q = ctx.exec.psql(
    "select version || ' ' || coalesce(md5(statements[1]), '-') || ' ' || coalesce(array_length(statements, 1), 0) from supabase_migrations.schema_migrations order by version;",
    { query: true },
  );
  if (q.status !== 0) return stop(`ortak DB okunamadı: ${tailOf(q.stderr, 3).join(" | ")}`);
  const ledger = new Map(listed(q.stdout).map((l) => l.split(" ")).map(([v, md5, n]) => [v, { md5, n: Number(n) }]));
  const behind = mainMigrations(ctx.repo, s.base).map(version).filter((v) => !ledger.has(v));
  if (behind.length) return stop(`DUR: ortak DB main'in gerisinde: ${behind.slice(0, 5).join(", ")}${behind.length > 5 ? ` (+${behind.length - 5})` : ""}`);
  const now = [];
  let failed = false;
  for (const f of s.newMigrations) {
    const sql = execFileSync("git", ["-C", ctx.repo, "show", `${s.head}:${MIGRATIONS}/${f}`], { encoding: "utf8" });
    const row = ledger.get(version(f));
    if (row && row.n !== 1) {
      lines.push(`UYARI: ${f} ledger'da ${row.n} deyim olarak var (CLI); içerik karşılaştırılamadı, atlandı`);
      continue;
    }
    if (row && row.md5 === createHash("md5").update(sql).digest("hex")) {
      lines.push(`${f}: ledger'da aynı içerikle var, atlandı`);
      continue;
    }
    if (row) {
      refuse(ctx, s, "apply-local", `${f} ortak DB'de başka içerikle uygulanmış (ledger md5 ${row.md5.slice(0, 8)}); uygulanmış göç değişmez, düzeltme yeni göçle`, lines);
      failed = true;
      break;
    }
    const outside = nonTransactional(sql);
    if (outside.length) {
      lines.push(`${f}: işlem içinde koşamayan deyim (${outside[0]}); elle uygula`);
      failed = true;
      break;
    }
    const r = ctx.exec.psql(applySql(f, sql));
    if (r.status !== 0) {
      lines.push(`${f}: KIRMIZI (çıkış ${r.status}): ${tailOf(r.stderr || r.stdout, 5).join(" | ")}`);
      failed = true;
      break;
    }
    now.push(f);
    lines.push(`${f}: uygulandı`);
  }
  s.applied = [...new Set([...s.applied, ...now])];
  writeState(ctx, s);
  if (now.length) audit({ ...auditBase(ctx, "apply-local"), event: "train-apply-local", applied: now, train: s.branch });
  // after the push main has them; before it (apply-local alone, or a train that stopped) the shared DB is ahead
  if (s.applied.length && !s.pushed) lines.push(`ortak DB'de main'de olmayan göç: ${s.applied.join(", ")} (tren main'e girene kadar)`);
  if (failed) return stop("ilk hatada durdu; kalan göçler uygulanmadı, uygulanan geri alınmaz (düzeltme yeni göçle)");
  const held = mine(s, "db");
  letGo(s, "db");
  lines.push(held ? "db.lock bırakıldı" : "db.lock trende değil (NF_OVERRIDE ile aşıldı)");
  return { code: 0, lines };
}

const DOCS_ONLY = /^docs\/|\.md$/; // ci.yml's paths-ignore: such a train starts no run

export const ci = (ctx, opts) => withTrain(ctx, "ci", "ci", () => ciStep(ctx, opts));
function ciStep(ctx, { timeoutMin = 90 } = {}) {
  const s = readState(ctx);
  if (!s) return NO_STATE;
  const lines = [];
  const tip = tryGit(ctx.repo, ["rev-parse", `refs/heads/${s.branch}`]);
  const head = git(ctx.trainDir, ["rev-parse", "HEAD"]);
  const dirty = listed(git(ctx.trainDir, ["status", "--porcelain"]));
  if (dirty.length) refuse(ctx, s, "ci", `tren klasörü temiz değil (${dirty.slice(0, 3).join("; ")}); commit'le ya da elle bak`, lines);
  else if (head !== tip) refuse(ctx, s, "ci", `tren klasörü ${s.branch} ucunda değil (@${short(head)})`, lines);
  if (lines.length) return { code: 1, lines };
  const at = () => ctx.now().toISOString();
  // --no-renames: a code file renamed into docs/ lists its old path too, so it is not docs-only
  const files = listed(git(ctx.repo, ["-c", "core.quotePath=false", "diff", "--name-only", "--no-renames", `${s.base}..${tip}`]));
  if (files.every((f) => DOCS_ONLY.test(f))) {
    s.ci = { ok: true, head: tip, run: null, conclusion: "docs-only", docsOnly: true, failedJobs: [], at: at() };
    writeState(ctx, s);
    lines.push("yalnız belge değişti: CI koşmaz, gerekmez");
    return { code: 0, lines };
  }
  const p = spawnSync("git", ["-C", ctx.repo, "push", "-q", "origin", `${tip}:refs/heads/${s.branch}`], { encoding: "utf8" });
  if (p.status !== 0) {
    lines.push(`${s.branch} push edilemedi: ${tailOf(p.stderr, 3).join(" | ")}`);
    return { code: 1, lines };
  }
  const log = logFile(ctx, s.stamp, "ci");
  const r = ctx.exec.ciWait({ branch: s.branch, sha: tip, log, timeoutMin });
  const ok = r.conclusion === "success";
  s.ci = { ok, head: tip, run: r.run, conclusion: r.conclusion, docsOnly: false, failedJobs: r.failedJobs ?? [], at: at() };
  writeState(ctx, s);
  audit({ ...auditBase(ctx, "ci"), event: ok ? "train-ci-green" : "train-ci-red", train: s.branch, run: r.run, conclusion: r.conclusion });
  if (ok) {
    lines.push(`CI yeşil: run ${r.run} (${s.branch} @${short(tip)})`);
    return { code: 0, lines };
  }
  lines.push(`CI ${r.conclusion}: run ${r.run ?? "-"}; düşen işler: ${s.ci.failedJobs.join(", ") || "-"}; log: ${log}`);
  if (r.run) lines.push(`ayrıntı: gh run view ${r.run} --log-failed`);
  return { code: 1, lines };
}

export const push = (ctx) => withTrain(ctx, "push", "push", () => pushStep(ctx));
function pushStep(ctx) {
  const s = readState(ctx);
  if (!s) return NO_STATE;
  const { repo } = ctx;
  const lines = [];
  tryGit(repo, ["fetch", "-q", "origin"]);
  const tip = git(repo, ["rev-parse", `refs/heads/${s.branch}`]);
  const before = git(repo, ["rev-parse", BASE]);
  if (!isAncestor(repo, before, tip)) {
    refuse(ctx, s, "push", `main ilerledi, yeniden build (origin/main @${short(before)} trenin atası değil; force push yok)`, lines, { before, after: tip });
    return { code: 1, lines };
  }
  // passing a missing green CI with NF_OVERRIDE first saves origin/main, as the guard does, and records which
  // CI it passed (run, conclusion, failed jobs; "yok" when none ran) so the audit shows what was overridden
  const backup = () => {
    const b = backupMain(repo);
    const c = s.ci
      ? { run: s.ci.run ?? null, conclusion: s.ci.conclusion ?? null, failedJobs: s.ci.failedJobs ?? [], head: s.ci.head ?? null }
      : { run: null, conclusion: "yok", failedJobs: [], head: null };
    return { backup: b.ref, sha: b.sha, fetched: b.fetched, ci: c };
  };
  if (!(s.ci?.ok && s.ci.head === tip) && !pass(ctx, s, "push", `CI bu sha'da yeşil değil (@${short(tip)})`, lines, backup)) return { code: 1, lines };
  const r = spawnSync("git", ["-C", repo, "push", "origin", `${tip}:refs/heads/main`], { encoding: "utf8" });
  if (r.status !== 0) {
    audit({ ...auditBase(ctx, "push"), event: "train-push-failed", before, after: tip, branch: s.branch });
    lines.push(`push reddedildi: ${tailOf(r.stderr, 3).join(" | ")}`);
    return { code: 1, lines };
  }
  audit({ ...auditBase(ctx, "push"), event: "train-push", before, after: tip, branch: s.branch });
  s.pushed = { at: new Date().toISOString(), before, after: tip };
  writeState(ctx, s);
  lines.push(`main: ${short(before)}..${short(tip)} (${s.branch})`);
  return { code: 0, lines };
}

function coordBranch(repo) {
  const b = resolve(repo, COORD_BRANCH); // origin's first, as build reads it
  return b && pendingCommits(repo, b).commits.length ? COORD_BRANCH : null;
}

export const run = (ctx, args) => withTrain(ctx, "run", `run ${args.join(" ") || COORD_BRANCH}`, () => runSteps(ctx, args));
function runSteps(ctx, args) {
  const names = [...args];
  tryGit(ctx.repo, ["fetch", "-q", "origin"]); // coord/kayit2 as origin has it now
  const coord = coordBranch(ctx.repo);
  if (coord && !names.some((n) => n.split("@")[0] === COORD_BRANCH)) names.push(coord);
  if (!names.length) return { code: 1, lines: ["trene girecek dal yok"] };
  const b = buildStep(ctx, names);
  const lines = [...b.lines];
  if (b.code === 1) return { code: 1, lines, failedStep: "build" };
  for (const [step, fn] of [["ci", ciStep], ["push", pushStep], ["apply-local", applyLocalStep]]) {
    const r = fn(ctx);
    lines.push(`— ${step}`, ...r.lines);
    if (r.code !== 0) return { code: 1, lines, failedStep: step };
  }
  return { code: b.code, lines };
}

// ---- command line ----

// Long output to the step's log file; the screen gets the summary.
function toLog(cmd, args, cwd, log, shell = false) {
  const fd = fs.openSync(log, "a");
  try {
    return spawnSync(cmd, args, { cwd, stdio: ["ignore", fd, fd], shell }).status ?? 1;
  } finally {
    fs.closeSync(fd);
  }
}

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const ghRun = (args, cwd) => spawnSync("gh", args, { cwd, encoding: "utf8", timeout: 60000 });
// The GitHub Actions ci.yml run of `sha` on `branch`: up to 5 minutes for it to show up, then until it completes
// or timeoutMin passes. Progress, and a failing gh's stderr, go to the log. `gh` and `sleep` are test seams.
export function ciWait({ cwd, branch, sha, log, timeoutMin, gh = ghRun, sleep = sleepSync }) {
  const note = (l) => fs.appendFileSync(log, `${new Date().toISOString()} ${l}\n`);
  const ghJson = (args) => {
    const r = gh(args, cwd);
    if (r.status !== 0) {
      note(`gh ${args.slice(0, 2).join(" ")} başarısız (çıkış ${r.status ?? "-"}): ${tailOf(r.stderr || String(r.error ?? ""), 5).join(" | ")}`);
      return null;
    }
    try {
      return JSON.parse(r.stdout);
    } catch {
      note(`gh ${args.slice(0, 2).join(" ")}: JSON okunamadı`);
      return null;
    }
  };
  let run = null;
  const seen = Date.now() + 5 * 60000;
  while (!run && Date.now() < seen) {
    const runs = ghJson(["run", "list", "--workflow", "ci.yml", "--branch", branch, "--limit", "5", "--json", "databaseId,headSha"]);
    run = (Array.isArray(runs) ? runs : []).find((r) => r.headSha === sha)?.databaseId ?? null;
    if (!run) sleep(10000);
  }
  if (!run) {
    note("koşu 5 dakikada görünmedi");
    return { conclusion: "no-run", run: null, failedJobs: [] };
  }
  note(`koşu ${run}`);
  const end = Date.now() + timeoutMin * 60000;
  while (Date.now() < end) {
    const v = ghJson(["run", "view", String(run), "--json", "status,conclusion,jobs"]);
    if (v) {
      note(`${v.status}${v.conclusion ? ` ${v.conclusion}` : ""}`);
      if (String(v.status).toLowerCase() === "completed")
        return {
          conclusion: v.conclusion || "unknown",
          run,
          failedJobs: (v.jobs ?? []).filter((j) => !["success", "skipped"].includes(String(j.conclusion))).map((j) => j.name),
        };
    }
    sleep(30000);
  }
  note("süre doldu");
  return { conclusion: "timeout", run, failedJobs: [] };
}

const realExec = (trainDir) => ({
  // supabase/CLAUDE.md: psql -X -v ON_ERROR_STOP=1 in the shared container; -1 = one transaction per migration
  psql(sql, { query = false } = {}) {
    const args = ["exec", "-i", container(trainDir), "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"];
    const r = spawnSync("docker", query ? [...args, "-At", "-c", sql] : [...args, "-1", "-f", "-"], { input: query ? "" : sql, encoding: "utf8" });
    return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr || String(r.error ?? "") };
  },
  // pnpm is a .cmd shim on Windows, which only a shell starts
  pnpm: (args, { cwd, log }) => (process.platform === "win32" ? toLog("pnpm.cmd", args, cwd, log, true) : toLog("pnpm", args, cwd, log)),
  dbSchema: (cwd, log) => toLog(process.execPath, ["scripts/schema-snapshot.mjs", "write"], cwd, log),
  ciWait: (o) => ciWait({ cwd: trainDir, ...o }),
});

const USAGE = [
  "usage: node scripts/train.mjs run <dal[@sha]…>   (build → ci → push → apply-local; coord/kayit2 kendiliğinden)",
  "       node scripts/train.mjs plan|build <dal[@sha]…>",
  "       node scripts/train.mjs ci|push|apply-local",
  "       bir PC'de tek tren: train kilidi tutulur; başka tren koşuyorsa sırada beklenir (en çok 150 dk), sonra güncel main üzerine kurulur",
  '       NF_OVERRIDE="<gerekçe>" önüne: kilit ya da CI kontrolünü aşar (origin/main önce yedeklenir, audit.log); fast-forward olmayan push asla',
  "       NF_OVERRIDE ile kilit sırası beklenmez: db kilidi bir kez denenir; alınamazsa apply-local kilitsiz koşar (audit.log'a yazılır)",
];

function main(argv) {
  if (!TRAIN_DIR) {
    console.error(NOT_ON_PC);
    process.exitCode = NOT_ON_PC_EXIT;
    return;
  }
  const [cmd, ...rest] = argv;
  const repo = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const ctx = { repo, trainDir: TRAIN_DIR, exec: realExec(TRAIN_DIR), now: () => new Date(), override: process.env.NF_OVERRIDE?.trim() || null };
  const r =
    cmd === "plan" && rest.length
      ? plan(ctx, rest)
      : cmd === "build" && rest.length
        ? build(ctx, rest)
        : cmd === "ci"
          ? ci(ctx)
          : cmd === "push"
            ? push(ctx)
            : cmd === "apply-local"
              ? applyLocal(ctx)
              : cmd === "run"
                ? run(ctx, rest)
                : { code: 1, lines: USAGE };
  for (const l of r.lines) console.log(l);
  process.exitCode = r.code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
