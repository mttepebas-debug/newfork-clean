#!/usr/bin/env node
// TREN-ARACI (KARARLAR OPS-08, CLAUDE.md §6 "Gönderim adımları (tren)"): only the coordinator's train goes to main.
// Each step is its own command with its own exit code; long output goes to a log file, the screen gets a summary.
// State: <train>/artifacts/train/state.json; logs: <train>/artifacts/train/<stamp>/<step>.log (artifacts/ is ignored).
//   plan <branch[@sha]…>   order, blockers, warnings and a dry run of build; changes nothing but `git fetch`
//   build <branch[@sha]…>  train/<stamp> from origin/main in the train folder; exit 2 = a branch was left out
//   apply-local            the train's new migrations into the shared local database; db.lock stays for the gate
//   gate [--e2e <spec…>]   install, lint, typecheck, test, build, test:db, e2e; db.lock goes, heavy.lock stays if green
//   push                   main.lock for the push moment, origin main fast-forwarded to the train, locks let go
// The push runs inside this script, so scripts/guard.mjs never sees it: the same rules (main.lock, heavy.lock, CI,
// fast-forward only) hold here and land in the guard's audit.log. NF_OVERRIDE="<reason>" in front of a step passes a
// lock, CI or gate check (never a non-fast-forward push) and is logged. The train folder is NEWFORK_TRAIN_DIR (tests).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { take, release, status as lockStatus } from "./lock.mjs";
import { audit, ciState } from "./guard.mjs";
import { fingerprint, headerHash } from "./schema-snapshot.mjs";
import { container, nonTransactional } from "./test-db.mjs";

const TRAIN_DIR = process.env.NEWFORK_TRAIN_DIR ?? "C:/Users/TheWe/Documents/Codex/newfork-wt/train";
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

// Commits whose change main does not have yet, oldest first (`git cherry` matches rebased copies by patch).
const ahead = (repo, ref) => listed(git(repo, ["cherry", BASE, ref])).filter((l) => l.startsWith("+ ")).map((l) => l.slice(2));

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
function pass(ctx, s, step, blocker, lines) {
  const entry = { ...auditBase(ctx, step), step, blocker, train: s.branch };
  if (ctx.override) {
    audit({ ...entry, event: "train-override", reason: ctx.override });
    lines.push(`AŞILDI (NF_OVERRIDE): ${blocker}`);
    return true;
  }
  audit({ ...entry, event: "train-blocked" });
  lines.push(`DUR: ${blocker}`);
  return false;
}

const lockOf = (name) => lockStatus().find((l) => l.name === name);
// The train holds `name` (already, or takes it now); another identity's lock is a check NF_OVERRIDE can pass.
function hold(ctx, s, name, step, lines) {
  const before = lockOf(name);
  if (!before.free && before.identity === s.identity) return true;
  if (before.free && take(name, `${s.identity}, tren ${step}`).ok) return true;
  const l = lockOf(name);
  return pass(ctx, s, step, `${name}.lock başka kimlikte: ${l.identity ?? "?"}${l.purpose ? ` (${l.purpose})` : ""}`, lines);
}
const letGo = (s, name) => {
  const l = lockOf(name);
  if (!l.free && l.identity === s.identity) release(name, s.identity);
};

function ciCheck(ctx, s, step, cwd, lines) {
  const ci = ciState(cwd);
  if (ci.state === "unknown") {
    audit({ ...auditBase(ctx, step), event: "train-ci-unknown", step, train: s.branch });
    lines.push("CI durumu okunamadı (gh); sürüyor");
  }
  if (ci.state !== "running") return true;
  const runs = ci.runs.map((r) => `${r.name} / ${r.headBranch}: ${r.status}`).join("; ");
  return pass(ctx, s, step, `CI koşuyor${runs ? ` (${runs})` : ""}`, lines);
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
    const commits = ahead(repo, b.ref);
    if (!commits.length) {
      lines.push(`${b.name}: zaten main'de`);
      continue;
    }
    // `git cherry` leaves merges out; a merge on the branch would be dropped without a word
    const merges = listed(git(repo, ["rev-list", "--merges", `${BASE}..${b.ref}`]));
    if (merges.length) blockers.push(`${b.name}: birleştirme commit'i var (${short(merges[0])}); dalı rebase et`);
    if (b.moved) warnings.push(`${b.name}: dal @${short(b.moved)}'a ilerlemiş; tren @${short(b.ref)}'yı alıyor`);
    branches.push({ ...b, commits, migrations: addedMigrations(repo, [`${BASE}...${b.ref}`]) });
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

export function build(ctx, args) {
  const { repo, trainDir } = ctx;
  const p = plan(ctx, args);
  const lines = [...p.lines];
  if (p.code === 1) return { code: 1, lines: [...lines, "build yapılmadı: önce engeller"] };
  if (!p.sim) return { code: 1, lines: [...lines, "trene girecek dal yok"] };
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
    gate: null,
    pushed: null,
  };
  writeState(ctx, state);
  if (previous?.applied?.length && !previous.pushed)
    lines.push(`UYARI: önceki tren (${previous.branch}) main'e girmedi; ortak DB'de main'de olmayan göç: ${previous.applied.join(", ")}`);
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

export function applyLocal(ctx) {
  const s = readState(ctx);
  if (!s) return NO_STATE;
  const lines = [];
  if (!hold(ctx, s, "db", "apply-local", lines)) return { code: 1, lines };
  const stop = (line) => {
    lines.push(line);
    letGo(s, "db");
    return { code: 1, lines };
  };
  const q = ctx.exec.psql("select version from supabase_migrations.schema_migrations order by 1;", { query: true });
  if (q.status !== 0) return stop(`ortak DB okunamadı: ${tailOf(q.stderr, 3).join(" | ")}`);
  const ledger = new Set(listed(q.stdout));
  const behind = mainMigrations(ctx.repo, s.base).map(version).filter((v) => !ledger.has(v));
  if (behind.length) return stop(`DUR: ortak DB main'in gerisinde: ${behind.slice(0, 5).join(", ")}${behind.length > 5 ? ` (+${behind.length - 5})` : ""}`);
  const now = [];
  let failed = false;
  for (const f of s.newMigrations) {
    if (ledger.has(version(f))) {
      lines.push(`${f}: ledger'da var, atlandı`);
      continue;
    }
    const sql = execFileSync("git", ["-C", ctx.repo, "show", `${s.head}:${MIGRATIONS}/${f}`], { encoding: "utf8" });
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
  if (s.applied.length) lines.push(`ortak DB'de main'de olmayan göç: ${s.applied.join(", ")} (tren main'e girene kadar)`);
  if (failed) return stop("ilk hatada durdu; kalan göçler uygulanmadı, uygulanan geri alınmaz (düzeltme yeni göçle)");
  lines.push("db.lock trende kaldı: sıradaki adım gate");
  return { code: 0, lines };
}

export function gate(ctx, { e2e = [] } = {}) {
  const s = readState(ctx);
  if (!s) return NO_STATE;
  const lines = [];
  const done = (code) => {
    letGo(s, "db");
    if (code !== 0) letGo(s, "heavy");
    return { code, lines };
  };
  if (!hold(ctx, s, "db", "gate", lines) || !hold(ctx, s, "heavy", "gate", lines) || !ciCheck(ctx, s, "gate", ctx.trainDir, lines)) return done(1);
  const steps = [
    ["install", ["install", "--frozen-lockfile"]],
    ["libs", ["--filter", "@newfork/shared", "--filter", "@newfork/ui", "build"]],
    ["lint", ["lint"]],
    ["typecheck", ["typecheck"]],
    ["test", ["test"]],
    ["build", ["build"]],
    ["test:db", ["test:db"]],
    ...(e2e.length ? [["e2e", ["e2e", ...e2e]]] : []),
  ];
  const head = git(ctx.trainDir, ["rev-parse", "HEAD"]);
  let failedStep = null;
  for (const [step, args] of steps) {
    const log = logFile(ctx, s.stamp, `gate-${step}`);
    const t0 = Date.now();
    const st = ctx.exec.pnpm(args, { cwd: ctx.trainDir, log });
    if (st !== 0) {
      failedStep = step;
      lines.push(`${step}: kırmızı (çıkış ${st}), log: ${log}`);
      lines.push(...tailOf(fs.readFileSync(log, "utf8"), 20).map((l) => `  | ${l}`));
      break;
    }
    lines.push(`${step}: yeşil (${Math.round((Date.now() - t0) / 1000)} sn)`);
  }
  if (!e2e.length) lines.push("e2e: liste verilmedi, koşmadı");
  s.gate = { ok: !failedStep, head, failedStep, at: new Date().toISOString() };
  writeState(ctx, s);
  lines.push(failedStep ? "kapı kırmızı: db.lock ve heavy.lock bırakıldı" : "kapı yeşil: db.lock bırakıldı, heavy.lock push'a kadar trende");
  return done(failedStep ? 1 : 0);
}

export function push(ctx) {
  const s = readState(ctx);
  if (!s) return NO_STATE;
  const { repo } = ctx;
  const lines = [];
  tryGit(repo, ["fetch", "-q", "origin"]);
  const tip = git(repo, ["rev-parse", `refs/heads/${s.branch}`]);
  if (!hold(ctx, s, "main", "push", lines)) return { code: 1, lines };
  try {
    const before = git(repo, ["rev-parse", BASE]);
    if (!isAncestor(repo, before, tip)) {
      audit({ ...auditBase(ctx, "push"), event: "train-blocked", step: "push", blocker: "not a fast-forward", before, after: tip, train: s.branch });
      lines.push(`DUR: main ilerledi, yeniden build (origin/main @${short(before)} trenin atası değil; force push yok)`);
      return { code: 1, lines };
    }
    if (!(s.gate?.ok && s.gate.head === tip) && !pass(ctx, s, "push", `kapı bu sha'da koşmadı (@${short(tip)})`, lines)) return { code: 1, lines };
    if (!hold(ctx, s, "heavy", "push", lines) || !ciCheck(ctx, s, "push", repo, lines)) return { code: 1, lines };
    const r = spawnSync("git", ["-C", repo, "push", "origin", `${tip}:refs/heads/main`], { encoding: "utf8" });
    if (r.status !== 0) {
      audit({ ...auditBase(ctx, "push"), event: "train-push-failed", before, after: tip, branch: s.branch });
      lines.push(`push reddedildi: ${tailOf(r.stderr, 3).join(" | ")}`);
      return { code: 1, lines };
    }
    audit({ ...auditBase(ctx, "push"), event: "train-push", before, after: tip, branch: s.branch });
    s.pushed = { at: new Date().toISOString(), before, after: tip };
    writeState(ctx, s);
    lines.push(`main: ${short(before)}..${short(tip)} (${s.branch}); CI: gh run list --branch main --limit 1`);
    return { code: 0, lines };
  } finally {
    letGo(s, "main");
    letGo(s, "heavy");
  }
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
});

const USAGE = [
  "usage: node scripts/train.mjs plan <dal[@sha]…>",
  "       node scripts/train.mjs build <dal[@sha]…>",
  "       node scripts/train.mjs apply-local",
  "       node scripts/train.mjs gate [--e2e <spec…>]",
  "       node scripts/train.mjs push",
  '       NF_OVERRIDE="<gerekçe>" önüne: kilit, CI ya da kapı kontrolünü aşar (audit.log); fast-forward olmayan push asla',
];

function main(argv) {
  const [cmd, ...rest] = argv;
  const repo = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const ctx = { repo, trainDir: TRAIN_DIR, exec: realExec(TRAIN_DIR), now: () => new Date(), override: process.env.NF_OVERRIDE?.trim() || null };
  const e2eAt = rest.indexOf("--e2e");
  const r =
    cmd === "plan" && rest.length
      ? plan(ctx, rest)
      : cmd === "build" && rest.length
        ? build(ctx, rest)
        : cmd === "apply-local"
          ? applyLocal(ctx)
          : cmd === "gate"
            ? gate(ctx, { e2e: e2eAt >= 0 ? rest.slice(e2eAt + 1) : [] })
            : cmd === "push"
              ? push(ctx)
              : { code: 1, lines: USAGE };
  for (const l of r.lines) console.log(l);
  process.exitCode = r.code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
