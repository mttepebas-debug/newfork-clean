#!/usr/bin/env node
// WORKFLOW-V2: coverage for the guard (guard.mjs).
// Runs against throwaway temp folders and a temp git repo -- never the real .newfork-locks / .newfork-inbox.
// Run: node --test scripts/guard.test.mjs
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "newfork-coord-test-"));
process.env.NEWFORK_LOCK_DIR = path.join(root, "locks");
process.env.NEWFORK_INBOX_DIR = path.join(root, "inbox");
// the main checkout the guard protects (CLAUDE.md §3.B.1): a throwaway clone, never the real newfork-clean
process.env.NEWFORK_MAIN_DIR = path.join(root, "newfork-clean");

const { evaluate, segments } = await import("./guard.mjs");

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
const origin = path.join(root, "origin.git");
const repo = path.join(root, "repo");
execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
execFileSync("git", ["clone", "-q", origin, repo], { stdio: "ignore" });
git(repo, "checkout", "-q", "-B", "main");
git(repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init");
git(repo, "push", "-q", "origin", "HEAD:main");

const auditLines = () => {
  try {
    return fs
      .readFileSync(path.join(process.env.NEWFORK_INBOX_DIR, "audit.log"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};
const bash = (command, extra = {}) => ({ tool_name: "Bash", session_id: "s-test", cwd: repo, tool_input: { command }, ...extra });

beforeEach(() => {
  fs.rmSync(process.env.NEWFORK_LOCK_DIR, { recursive: true, force: true });
  fs.rmSync(process.env.NEWFORK_INBOX_DIR, { recursive: true, force: true });
  process.env.NEWFORK_CI_STATE = "idle"; // never ask the real `gh` from a test
});

const cloneRepo = (name) => {
  const dir = path.join(root, name);
  execFileSync("git", ["clone", "-q", origin, dir], { stdio: "ignore" });
  return dir;
};

after(() => fs.rmSync(root, { recursive: true, force: true }));

// The probe of the parser tests: a command the guard refuses when it is read as a command.
const PUSH = "git push origin HEAD:main";

test("audit log masks passwords and tokens", () => {
  evaluate(bash("supabase db push --db-url postgres://u:S3cret@db:5432/x"));
  const e = auditLines().at(-1);
  assert.equal(e.event, "deny-pattern");
  assert.doesNotMatch(e.command, /S3cret/);
});

test("branch -D keeps the tip under refs/nf-backup/branch", () => {
  git(repo, "branch", "doomed");
  const tip = git(repo, "rev-parse", "doomed");
  assert.equal(evaluate(bash("git branch -D doomed")).block, false);
  const e = auditLines().at(-1);
  assert.equal(e.event, "branch-delete");
  assert.match(e.backup, /^refs\/nf-backup\/branch\/doomed\//);
  assert.equal(git(repo, "rev-parse", e.backup), tip);
});


test("heredoc and here-string bodies are text, not commands; what follows the terminator still counts", () => {
  for (const cmd of [
    `git commit -q -F - <<'EOF'\nfeat: x\n\n${PUSH}\nEOF`,
    `cat > rapor.md <<'EOF'\nKomutlar:\n${PUSH}\n  EOF-not-yet\nEOF`,
    `git commit -m "$(cat <<EOF\n${PUSH}\nEOF\n)"`,
    `cat <<-EOF > x.md\n\t${PUSH}\n\tEOF`,
    `@'\n${PUSH}\n'@ | Set-Content rapor.md`,
    `@"\n${PUSH}\n"@ | Out-File r.md`,
  ]) {
    assert.equal(evaluate(bash(cmd)).block, false, cmd);
  }
  assert.equal(segments(`cat > x.md <<'EOF'\nnot a command\nEOF\n${PUSH}`).at(-1), PUSH); // what follows the terminator is a command
  assert.equal(evaluate(bash("cat > x.md <<'EOF'\ngit push origin HEAD:main\nEOF")).block, false);
});

// ---- BL-964: a separator counts only outside quotes, heredoc bodies and here-strings ----------------
const ps = (command, extra = {}) => bash(command, { tool_name: "PowerShell", ...extra });
const quiet = (input) => assert.equal(evaluate(input).block, false, input.tool_input.command);
// An escaped quote (\" in bash, `" in PowerShell, \' in $'…') keeps the string open, so the scanner reads
// one command. gitCall's word split does not know escapes and still sees the push inside it, so the guard
// refuses (the safe side); these cases check the scanner itself.
const oneCommand = (cmd, shell) => assert.deepEqual(segments(cmd, shell), [cmd], cmd);

test("ciState reads gh's list: any run not completed means CI is running", async () => {
  const { runningRuns } = await import("./guard.mjs");
  const json = (rows) => JSON.stringify(rows.map((status) => ({ status, name: "CI", headBranch: "main" })));
  assert.deepEqual(runningRuns(json(["completed", "completed"])), []);
  assert.equal(runningRuns(json(["completed", "in_progress"])).length, 1);
  assert.equal(runningRuns(json(["queued", "waiting", "COMPLETED"])).length, 2);
  assert.throws(() => runningRuns("not json"));
});

// ---- final security review (WORKFLOW-V2): main-push forms, gh, a backup-less override, record paths ----

// ---- the main checkout is Mert's : no Edit/Write on a tracked or new file there ---------------

const mainDir = process.env.NEWFORK_MAIN_DIR;
execFileSync("git", ["clone", "-q", origin, mainDir], { stdio: "ignore" });
git(mainDir, "checkout", "-q", "-B", "main");
fs.writeFileSync(path.join(mainDir, ".gitignore"), "artifacts/\n.claude/worktrees/\n.env.local\n");
fs.writeFileSync(path.join(mainDir, "README.md"), "x\n");
git(mainDir, "add", ".gitignore", "README.md");
git(mainDir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "files");
fs.appendFileSync(path.join(mainDir, ".git", "info", "exclude"), "CLAUDE.local.md\n");
const sideTree = path.join(root, "newfork-wt", "x");
git(mainDir, "worktree", "add", "-q", "-b", "task/x", sideTree);
const agentTree = path.join(mainDir, ".claude", "worktrees", "agent-m1");
git(mainDir, "worktree", "add", "-q", "-b", "task/agent-m1", agentTree);
const edit = (file, extra = {}) => evaluate({ tool_name: "Edit", session_id: "s", cwd: mainDir, tool_input: { file_path: file }, ...extra });
const MAIN_REFUSAL = /ana klasör \(main\) Mert'indir/;


test("main checkout: Edit or Write on a tracked or a new file is refused and logged", () => {
  for (const [tool, file] of [
    ["Edit", path.join(mainDir, "README.md")],
    ["Write", path.join(mainDir, "apps", "web", "src", "new.ts")],
    ["MultiEdit", path.join(mainDir, ".gitignore").replaceAll("\\", "/")],
    ["NotebookEdit", path.join(mainDir, "x.ipynb")],
  ]) {
    const key = tool === "NotebookEdit" ? "notebook_path" : "file_path";
    const r = evaluate({ tool_name: tool, session_id: "s", cwd: mainDir, tool_input: { [key]: file } });
    assert.equal(r.block, true, file);
    assert.match(r.message, MAIN_REFUSAL);
    assert.equal(auditLines().at(-1).event, "main-edit-blocked");
  }
});

test("main checkout: git-ignored files (CLAUDE.local.md, .env.local, artifacts/) stay writable", () => {
  for (const file of ["CLAUDE.local.md", ".env.local", "artifacts/run/shot.png"]) assert.equal(edit(path.join(mainDir, file)).block, false, file);
});

test("main checkout: a ../newfork-wt worktree and an agent worktree under .claude/worktrees are not the main folder", () => {
  assert.equal(edit(path.join(sideTree, "README.md"), { cwd: sideTree }).block, false);
  assert.equal(edit(path.join(agentTree, "README.md"), { cwd: agentTree, agent_id: "m1" }).block, false);
  // no record-file rule since 2026-10-20: an agent may write any file in its own tree
  assert.equal(edit(path.join(agentTree, "docs", "plan", "KARARLAR.md"), { cwd: agentTree, agent_id: "m1" }).block, false);
});

test("main checkout: off branch main the rule does not apply; a folder git cannot read is allowed and logged", () => {
  git(mainDir, "switch", "-q", "-c", "mert-deneme");
  try {
    assert.equal(edit(path.join(mainDir, "README.md")).block, false);
  } finally {
    git(mainDir, "switch", "-q", "main");
  }
  const broken = path.join(mainDir, "broken");
  fs.mkdirSync(broken, { recursive: true });
  fs.writeFileSync(path.join(broken, ".git"), "gitdir: ./nowhere\n");
  assert.equal(edit(path.join(broken, "a.ts")).block, false);
  assert.equal(auditLines().at(-1).event, "main-edit-check-error");
  fs.rmSync(broken, { recursive: true, force: true });
});

test("outside the main checkout an edit asks git nothing and logs nothing", () => {
  assert.equal(edit(path.join(root, "elsewhere", "notes.md")).block, false);
  assert.deepEqual(auditLines(), []);
});

test("push to main passes: a session sends its own work (no train since 2026-10-20)", () => {
  for (const cmd of ["git push origin HEAD:main", "git push", "gh pr merge 3", "git push origin task/x:main"]) {
    assert.equal(evaluate(bash(cmd)).block, false, cmd);
  }
});

test("guard CLI exits 2 with the reason on stderr", () => {
  const r = spawnSync(process.execPath, [path.join(import.meta.dirname, "guard.mjs")], {
    input: JSON.stringify({ tool_name: "Write", session_id: "s", cwd: mainDir, tool_input: { file_path: path.join(mainDir, "x.txt") } }),
    encoding: "utf8",
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /ana klasör/);
});
