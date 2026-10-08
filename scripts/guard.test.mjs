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

const { evaluate, isRecordFile, inWorkerTree, segments } = await import("./guard.mjs");

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

test("push to main from a session is refused and logged", () => {
  const r = evaluate(bash("git push --dry-run origin HEAD:main"));
  assert.equal(r.block, true);
  assert.match(r.message, /yalnız tren gider/);
  assert.equal(auditLines().at(-1).event, "push-main-blocked");
});

test("push to main is refused even with a lock: only the train goes to main", () => {
  fs.mkdirSync(process.env.NEWFORK_LOCK_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.NEWFORK_LOCK_DIR, "main.lock"), JSON.stringify({ identity: "koordinator/eski", pid: process.pid }));
  const r = evaluate(bash("git push origin HEAD:main"));
  assert.equal(r.block, true);
  assert.match(r.message, /yalnız tren gider/);
  assert.equal(auditLines().at(-1).event, "push-main-blocked");
});

test("push to a task or a train branch passes", () => {
  assert.equal(evaluate(bash("git push origin HEAD:task/x")).block, false);
  assert.equal(evaluate(bash("git push origin HEAD:train/20261008T1000Z")).block, false);
});

test("push to a task branch or a commit message mentioning push is not the guard's business", () => {
  assert.equal(evaluate(bash("git push -u origin task/x")).block, false);
  assert.equal(evaluate(bash('git commit -m "push main later"')).block, false);
  assert.deepEqual(auditLines(), []);
});

test("bare `git push` on main counts as a push to main", () => {
  assert.equal(git(repo, "branch", "--show-current"), "main");
  assert.equal(evaluate(bash("git push")).block, true);
});

test("a push whose refspec is built by $( ) or a backtick goes where the current branch points", () => {
  const forms = ['git push -u origin "$(git branch --show-current)"', "git push origin `git branch --show-current`"];
  const onMain = cloneRepo("repo-subst-main");
  assert.equal(git(onMain, "branch", "--show-current"), "main");
  for (const cmd of forms) assert.equal(evaluate(bash(cmd, { cwd: onMain })).block, true, cmd);
  assert.equal(auditLines().at(-1).event, "push-main-blocked");
  const onTask = cloneRepo("repo-subst-task");
  git(onTask, "checkout", "-q", "-b", "task/x");
  for (const cmd of forms) assert.equal(evaluate(bash(cmd, { cwd: onTask })).block, false, cmd);
});

test("NF_OVERRIDE passes, backs up origin/main and logs the reason", () => {
  const r = evaluate(bash('NF_OVERRIDE="lock tool down" git push origin HEAD:main'));
  assert.equal(r.block, false);
  const e = auditLines().at(-1);
  assert.equal(e.event, "push-main-override");
  assert.equal(e.reason, "lock tool down");
  assert.equal(git(repo, "rev-parse", e.backup), git(repo, "rev-parse", "origin/main"));
});

test("NF_OVERRIDE only counts in front of the push, never inside a commit message", () => {
  const r = evaluate(bash('git commit -m "explain NF_OVERRIDE=x" && git push origin HEAD:main'));
  assert.equal(r.block, true);
  assert.equal(auditLines().at(-1).event, "push-main-blocked");
});

test("PowerShell $env:NF_OVERRIDE right before the push is an override", () => {
  const r = evaluate(bash("$env:NF_OVERRIDE='ps reason'; git push origin HEAD:main", { tool_name: "PowerShell" }));
  assert.equal(r.block, false);
  assert.equal(auditLines().at(-1).reason, "ps reason");
});

test("push forms that used to slip past are caught", () => {
  for (const cmd of ["git -c k=v push origin HEAD:main", "(git push origin HEAD:main)", "git push --mirror", "git push --repo=origin HEAD:main"]) {
    assert.equal(evaluate(bash(cmd)).block, true, cmd);
  }
});

test("audit log masks passwords and tokens", () => {
  evaluate(bash("supabase db push --db-url postgres://u:S3cret@db:5432/x"));
  const e = auditLines().at(-1);
  assert.equal(e.event, "deny-pattern");
  assert.doesNotMatch(e.command, /S3cret/);
});

test("guard CLI exits 2 with the reason on stderr", () => {
  const r = spawnSync(process.execPath, [path.join(import.meta.dirname, "guard.mjs")], {
    input: JSON.stringify(bash("git push origin HEAD:main")),
    encoding: "utf8",
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /yalnız tren gider/);
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

// ---- record files: the coordinator's; a worker agent never writes them -----------------------

test("a worker agent cannot edit a record file; the coordinator can", () => {
  const worker = {
    tool_name: "Edit",
    session_id: "s",
    cwd: "C:/c/coord/.claude/worktrees/agent-a1",
    tool_input: { file_path: "C:\\c\\coord\\.claude\\worktrees\\agent-a1\\docs\\plan\\KARARLAR.md" },
  };
  assert.equal(evaluate(worker).block, true);
  assert.match(evaluate(worker).message, /yalnız koordinatör yazar/);
  assert.equal(evaluate({ ...worker, tool_input: { file_path: "C:/c/coord/.claude/worktrees/agent-a1/apps/web/src/x.ts" } }).block, false);
  const coord = { tool_name: "Write", session_id: "s", cwd: "C:/c/coord", tool_input: { file_path: "C:/c/coord/DURUM.md" } };
  assert.equal(evaluate(coord).block, false);
  assert.equal(evaluate({ ...coord, agent_id: "a1" }).block, true);
});

test("record files: DURUM, KARARLAR, SORULAR, BACKLOG, EKRAN-PLANI and the daily log; not the archive or a screen report", () => {
  for (const f of [
    "DURUM.md",
    "docs/plan/KARARLAR.md",
    "docs/plan/SORULAR.md",
    "docs/plan/BACKLOG.md",
    "docs/plan/EKRAN-PLANI.md",
    "docs/plan/gunluk/2026-10-08.md",
    "docs\\plan\\gunluk\\2026-10-08\\0930-X-nf-isci-ab.md",
  ])
    assert.equal(isRecordFile(f), true, f);
  for (const f of ["docs/archive/2026-10-08-v1/DERSLER.md", "docs/plan/ekranlar/02-requests/uygulama/RAPOR.md", "apps/web/src/DURUM.md.ts"])
    assert.equal(isRecordFile(f), false, f);
  assert.equal(inWorkerTree("C:\\c\\coord\\.claude\\worktrees\\agent-a1"), true);
  assert.equal(inWorkerTree("C:/c/coord/.claude/worktrees/workflow-v2"), false);
});

test("a worker's git commit carrying a record file is refused", () => {
  const dir = cloneRepo("worker-commit");
  fs.mkdirSync(path.join(dir, "docs/plan"), { recursive: true });
  fs.writeFileSync(path.join(dir, "docs/plan/KARARLAR.md"), "x");
  git(dir, "add", "docs/plan/KARARLAR.md");
  const r = evaluate({ ...bash('git commit -m "x"'), cwd: dir, agent_id: "a9" });
  assert.equal(r.block, true);
  const e = auditLines().at(-1);
  assert.equal(e.event, "record-by-worker-blocked");
  assert.deepEqual(e.files, ["docs/plan/KARARLAR.md"]);
  assert.equal(evaluate({ ...bash('git commit -m "x"'), cwd: dir }).block, false);
});

test("a worker's commit naming a record file on the command line is refused", () => {
  assert.equal(evaluate(bash("git commit -m x -- docs/plan/KARARLAR.md", { agent_id: "a9" })).block, true);
  assert.deepEqual(auditLines().at(-1).files, ["docs/plan/KARARLAR.md"]);
  assert.equal(evaluate(bash("git commit -m x -- docs/plan/tasks/X.md", { agent_id: "a9" })).block, false);
});

test("a worker in an agent tree cannot edit the coordinator's record file by absolute path, even without agent_id", () => {
  const r = evaluate({
    tool_name: "Edit",
    session_id: "s",
    cwd: "C:/c/coord/.claude/worktrees/agent-a1",
    tool_input: { file_path: "C:/c/coord/DURUM.md" },
  });
  assert.equal(r.block, true);
  assert.match(r.message, /yalnız koordinatör yazar/);
});

test("MultiEdit and NotebookEdit on a record file by a worker are refused", () => {
  const multi = { tool_name: "MultiEdit", session_id: "s", cwd: repo, agent_id: "a2", tool_input: { file_path: path.join(repo, "docs/plan/BACKLOG.md"), edits: [] } };
  assert.equal(evaluate(multi).block, true);
  const nb = { tool_name: "NotebookEdit", session_id: "s", cwd: repo, agent_id: "a2", tool_input: { notebook_path: path.join(repo, "docs/plan/gunluk/x.ipynb") } };
  assert.equal(evaluate(nb).block, true);
  assert.equal(evaluate({ ...nb, tool_input: { notebook_path: path.join(repo, "notebooks/x.ipynb") } }).block, false);
});

test("guard CLI refuses a worker's record edit: exit 2, the refusal on stderr", () => {
  const input = {
    tool_name: "Edit",
    session_id: "s",
    cwd: "C:/c/coord/.claude/worktrees/agent-a1",
    tool_input: { file_path: "C:/c/coord/.claude/worktrees/agent-a1/docs/plan/SORULAR.md", old_string: "a", new_string: "b" },
  };
  const r = spawnSync(process.execPath, [path.join(import.meta.dirname, "guard.mjs")], { input: JSON.stringify(input), encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /yalnız koordinatör yazar/);
});

test("a push hidden in command substitution is refused; NF_OVERRIDE still passes", () => {
  for (const cmd of ["echo $(git push origin HEAD:main)", "echo `git push origin HEAD:main`", "x=$(git push origin HEAD:main)"]) {
    const r = evaluate(bash(cmd));
    assert.equal(r.block, true, cmd);
    assert.match(r.message, /yalnız tren gider/);
    assert.equal(auditLines().at(-1).event, "push-main-blocked");
  }
  assert.equal(evaluate(bash("echo $(git log -1)")).block, false);
  assert.equal(evaluate(bash("x=$(git push origin HEAD:task/x)")).block, false);
  assert.equal(evaluate(bash('NF_OVERRIDE="acil" echo $(git push origin HEAD:main)')).block, false);
  const e = auditLines().at(-1);
  assert.equal(e.event, "push-main-override");
  assert.equal(git(repo, "rev-parse", e.backup), git(repo, "rev-parse", "origin/main"));
});

// ---- the command parser: heredocs, quotes, PowerShell, wrapped shells, continuations, cd ----------

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
  assert.equal(evaluate(bash(`cat > x.md <<'EOF'\nnot a command\nEOF\n${PUSH}`)).block, true);
  assert.equal(evaluate(bash("cat > x.md <<'EOF'\ngit push origin HEAD:main\nEOF")).block, false);
});

// ---- BL-964: a separator counts only outside quotes, heredoc bodies and here-strings ----------------
const ps = (command, extra = {}) => bash(command, { tool_name: "PowerShell", ...extra });
const quiet = (input) => assert.equal(evaluate(input).block, false, input.tool_input.command);
// An escaped quote (\" in bash, `" in PowerShell, \' in $'…') keeps the string open, so the scanner reads
// one command. gitCall's word split does not know escapes and still sees the push inside it, so the guard
// refuses (the safe side); these cases check the scanner itself.
const oneCommand = (cmd, shell) => assert.deepEqual(segments(cmd, shell), [cmd], cmd);

test("quoted text is not a command: && ; | and a newline inside quotes split nothing (BL-964)", () => {
  for (const cmd of [
    `node -e 's=s.replace("a.mjs","b.mjs && ${PUSH}");'`,
    `node -e "s=s.replace('a.mjs','b.mjs && ${PUSH}');"`,
    `git commit -m "fix: x; ${PUSH} passes"`,
    `git commit -m "first line\n${PUSH} is green"`,
    `git commit -m 'one | ${PUSH}'`,
    `echo done # && ${PUSH}`,
  ])
    quiet(bash(cmd));
  oneCommand(`echo $'it\\'s && ${PUSH}'`, "bash");
  oneCommand(`echo "say \\" && ${PUSH}"`, "bash");
});

test("PowerShell quoting: '' and `\" and \"\" escape, a backslash does not (BL-964)", () => {
  for (const cmd of [`Write-Output 'it''s && ${PUSH}'`, `Write-Output "x""; ${PUSH}"`, `Write-Output done # ; ${PUSH}`]) quiet(ps(cmd));
  oneCommand(`Write-Output "a\`" ; ${PUSH}"`, "pwsh");
  // in PowerShell C:\wt\ ends with a plain backslash, so the string closes and the second command runs
  assert.equal(evaluate(ps(`Set-Location "C:\\wt\\"; ${PUSH}`)).block, true);
});

test("heredoc and here-string bodies may hold quotes; what follows them still counts (BL-964)", () => {
  quiet(bash(`git commit -q -F - <<'EOF'\nfix: Mert's "quote" && ${PUSH}\nEOF`));
  quiet(bash(`git commit -m "$(cat <<'EOF'\nfix: it's done; ${PUSH}\nEOF\n)"`));
  quiet(ps(`@'\nMert's note; ${PUSH}\n'@ | Set-Content r.md`));
  quiet(ps(`@"\nsay "hi" && ${PUSH}\n"@ | Out-File r.md`));
  assert.equal(evaluate(bash(`cat > x.md <<'EOF'\nit's\nEOF\n${PUSH}`)).block, true);
  assert.equal(evaluate(ps(`@'\nit's\n'@ | Set-Content r.md; ${PUSH}`)).block, true);
});

test("real separators still split: after a closing quote, and an unclosed quote fails safe (BL-964)", () => {
  assert.equal(evaluate(bash(`git commit -m "a && b" && ${PUSH}`)).block, true);
  assert.equal(evaluate(bash(`echo 'x;y'; ${PUSH}`)).block, true);
  assert.equal(evaluate(ps(`Write-Output 'a;b'; ${PUSH}`)).block, true);
  assert.equal(evaluate(bash(`echo "never closed && ${PUSH}`)).block, true);
});

test("a command wrapped in another shell is read too: bash -c, sh -c, pwsh -Command, cmd /c (BL-964)", () => {
  // the old split caught these by accident (a separator inside the quotes); reading quotes must not lose them
  assert.equal(evaluate(bash('bash -c "cd x && git push --dry-run origin HEAD:main"')).block, true);
  assert.equal(evaluate(ps('bash -lc "cd x; git push --dry-run origin HEAD:main"')).block, true);
  assert.equal(evaluate(ps('cmd /c "cd x && git push --dry-run origin HEAD:main"')).block, true);
  assert.equal(evaluate(bash(`sh -c '${PUSH}'`)).block, true);
  assert.equal(evaluate(ps(`pwsh -NoProfile -Command "Set-Location x; ${PUSH}"`)).block, true);
  assert.equal(evaluate(ps(`powershell -exec bypass -c "Set-Location x; ${PUSH}"`)).block, true); // -exec is not -c
  assert.equal(evaluate(bash(`bash -o pipefail -c "cd x && ${PUSH}"`)).block, true);
  quiet(bash(`bash -c 'echo "${PUSH} && done"'`));
  quiet(ps(`pwsh -File scripts/x.ps1 -c '${PUSH}'`)); // -File runs a script file; what follows are its arguments
  assert.equal(evaluate(bash(`bash -c "echo \\"a && ${PUSH}\\""`)).block, false); // its own quotes count
});

test("scanner edges: block comments, CRLF, two heredocs, <<<, a ) inside quotes in $( ) (BL-964)", () => {
  quiet(ps(`<# ${PUSH}; git push #> git status`));
  quiet(bash(`git commit -q -F - <<'EOF'\r\nfix: x && ${PUSH}\r\nEOF\r\ngit log -1`));
  quiet(bash(`cat <<A <<B > x\n${PUSH}\nA\n${PUSH}\nB`));
  // one command for the scanner; the guard still refuses it (a push to main inside $( ) is the substitution fail-safe)
  oneCommand(`git commit -m "$(echo ')' ; echo "a && ${PUSH}")"`, "bash");
  assert.equal(evaluate(bash(`git commit -m "$(echo ')' ; echo "a && ${PUSH}")"`)).block, true);
  quiet(bash(`echo \\$'a\\' && echo "x; ${PUSH}"`)); // \$ is a plain $, so 'a\' is a plain '…' and closes
  assert.equal(evaluate(bash(`cat <<< 'x'\n${PUSH}`)).block, true); // a here-string word, not a heredoc
});

test("a line continuation joins one command: the push behind it still goes to main (BL-964)", () => {
  const work = cloneRepo("repo-964");
  git(work, "checkout", "-q", "-b", "feature"); // HEAD is not main, so only the refspec says main
  assert.equal(evaluate(bash("git push --dry-run \\\n  origin HEAD:main", { cwd: work })).block, true);
  assert.equal(evaluate(ps("git push --dry-run `\n  origin HEAD:main", { cwd: work })).block, true);
});

test("PowerShell keeps $env:NF_OVERRIDE for the whole command, so a cd in between does not lose it", () => {
  const run = (command) => evaluate(ps(command));
  assert.equal(run(`$env:NF_OVERRIDE='Mert istedi'; Set-Location '${repo}'; ${PUSH}`).block, false);
  assert.equal(auditLines().at(-1).reason, "Mert istedi");
  assert.equal(run(`Set-Location '${repo}'; ${PUSH}; $env:NF_OVERRIDE='geç'`).block, true);
});

test("`cd <worktree> && …` is followed: a session starts in one folder and works in another", () => {
  // a worker's commit: the record file is staged in the folder it moved to, not where it started
  const work = cloneRepo("repo-cd");
  fs.mkdirSync(path.join(work, "docs/plan"), { recursive: true });
  fs.writeFileSync(path.join(work, "docs/plan/KARARLAR.md"), "x");
  git(work, "add", "docs/plan/KARARLAR.md");
  const worker = (cmd) => evaluate(bash(cmd, { agent_id: "a-cd" }));
  assert.equal(worker('git commit -m "docs: x"').block, false); // repo has nothing staged
  assert.equal(worker(`cd "${work}" && git commit -m "docs: x"`).block, true);
  assert.equal(worker(`Set-Location '${work}'; git commit -m "docs: x"`).block, true);
  // a bare push goes where the branch of the folder it moved to points
  const feature = cloneRepo("repo-cd-feature");
  git(feature, "checkout", "-q", "-b", "feature");
  assert.equal(evaluate(bash("git push", { cwd: feature })).block, false);
  assert.equal(evaluate(bash(`cd ${repo.replaceAll("\\", "/")} && git push`, { cwd: feature })).block, true);
});

test("ciState reads gh's list: any run not completed means CI is running", async () => {
  const { runningRuns } = await import("./guard.mjs");
  const json = (rows) => JSON.stringify(rows.map((status) => ({ status, name: "CI", headBranch: "main" })));
  assert.deepEqual(runningRuns(json(["completed", "completed"])), []);
  assert.equal(runningRuns(json(["completed", "in_progress"])).length, 1);
  assert.equal(runningRuns(json(["queued", "waiting", "COMPLETED"])).length, 2);
  assert.throws(() => runningRuns("not json"));
});
