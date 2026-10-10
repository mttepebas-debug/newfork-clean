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
    "e2e/karantina.txt", // S-106: only the coordinator quarantines a test
    "e2e\\karantina.txt",
  ])
    assert.equal(isRecordFile(f), true, f);
  for (const f of ["docs/archive/2026-10-08-v1/DERSLER.md", "docs/plan/ekranlar/02-requests/uygulama/RAPOR.md", "apps/web/src/DURUM.md.ts", "e2e/karantina.mjs", "e2e/flows/karantina.txt.ts"])
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

// ---- final security review (WORKFLOW-V2): main-push forms, gh, a backup-less override, record paths ----

test("--branches counts like --all; @ is the current branch; heads/main and a wildcard refspec count as main", () => {
  const onTask = cloneRepo("repo-at-task");
  git(onTask, "checkout", "-q", "-b", "task/x"); // HEAD is not main, so only the push's own words say main
  for (const cmd of [
    "git push --branches origin",
    "git push origin --branches",
    "git push origin HEAD:heads/main",
    "git push origin 'refs/heads/*:refs/heads/*'",
    "git push origin task/*",
  ])
    assert.equal(evaluate(bash(cmd, { cwd: onTask })).block, true, cmd);
  assert.equal(auditLines().at(-1).event, "push-main-blocked");
  for (const cmd of ["git push origin @", "git push origin HEAD:@"]) assert.equal(evaluate(bash(cmd)).block, true, cmd); // repo is on main
  for (const cmd of ["git push origin @", "git push origin HEAD:@", "git push origin @:task/x", "git push origin HEAD:heads/task/x"])
    assert.equal(evaluate(bash(cmd, { cwd: onTask })).block, false, cmd);
});

test("git's --git-dir, --work-tree and --namespace values are skipped, in both spellings", () => {
  for (const cmd of [
    "git --git-dir .git push origin HEAD:main",
    "git --git-dir=.git push origin HEAD:main",
    "git --work-tree . push origin HEAD:main",
    "git --work-tree=. push origin HEAD:main",
    "git --namespace x push origin HEAD:main",
    "git --namespace=x push origin HEAD:main",
    "git -C . --git-dir .git -c k=v push origin HEAD:main",
  ])
    assert.equal(evaluate(bash(cmd)).block, true, cmd);
  assert.equal(evaluate(bash("git --git-dir .git push origin HEAD:task/x")).block, false);
});

test("gh pr merge and a gh api call on refs/heads/main are refused like a push to main; NF_OVERRIDE passes with a backup", () => {
  for (const cmd of [
    "gh pr merge 12 --squash",
    "gh pr merge --merge --delete-branch",
    "gh api -X PATCH repos/o/r/git/refs/heads/main -f sha=abc -F force=true",
    "gh api repos/o/r/git/refs -f ref=refs/heads/main -f sha=abc",
    "gh.exe api -X PATCH repos/o/r/git/refs/heads/main -f sha=abc",
  ]) {
    const r = evaluate(bash(cmd));
    assert.equal(r.block, true, cmd);
    assert.match(r.message, /yalnız tren gider/);
    assert.equal(auditLines().at(-1).event, "push-main-blocked");
  }
  for (const cmd of ["gh pr view 12", "gh pr create --fill", "gh api repos/o/r/pulls", "gh api repos/o/r/git/refs/heads/main-old", "gh run list"])
    assert.equal(evaluate(bash(cmd)).block, false, cmd);
  const r = evaluate(bash('NF_OVERRIDE="Mert istedi" gh pr merge 12 --squash'));
  assert.equal(r.block, false);
  const e = auditLines().at(-1);
  assert.equal(e.event, "push-main-override");
  assert.equal(e.reason, "Mert istedi");
  assert.equal(git(repo, "rev-parse", e.backup), git(repo, "rev-parse", "origin/main"));
});

test("NF_OVERRIDE without a backup of origin/main is refused, not let through", () => {
  const lonely = path.join(root, "no-origin");
  execFileSync("git", ["init", "-q", "-b", "main", lonely]);
  const r = evaluate(bash('NF_OVERRIDE="acil" git push origin HEAD:main', { cwd: lonely }));
  assert.equal(r.block, true);
  assert.match(r.message, /yedek alınamadı/);
  assert.equal(auditLines().at(-1).event, "push-main-override-no-backup");
});

test("when the guard itself breaks, an overridden push to main is refused; other commands still pass", () => {
  fs.mkdirSync(path.join(process.env.NEWFORK_INBOX_DIR, "audit.log"), { recursive: true }); // every audit() now throws
  const r = evaluate(bash('NF_OVERRIDE="acil" git push origin HEAD:main'));
  assert.equal(r.block, true);
  assert.match(r.message, /guard hata verdi/);
  git(repo, "branch", "doomed-2");
  assert.equal(evaluate(bash("git branch -D doomed-2")).block, false); // its audit throws too, but it is no main push
});

test("gh api: a write method on merge, contents or git/refs is refused, graphql merge/ref mutations too; a GET passes", () => {
  for (const cmd of [
    "gh api -X PUT repos/o/r/pulls/12/merge",
    "gh api --method PUT repos/o/r/pulls/12/merge -f merge_method=squash",
    "gh api --method=POST repos/o/r/merges -f base=main -f head=task/x",
    "gh api repos/o/r/merges -f base=main -f head=task/x", // -f implies POST
    "gh api -XPUT repos/o/r/contents/README.md -f message=x -f content=eA==",
    "gh api repos/o/r/contents/a.md --input body.json",
    "gh api -X DELETE repos/o/r/git/refs/heads/task-x",
    "gh api repos/o/r/git/refs -F ref=refs/heads/x -F sha=abc",
    "gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: \"x\"}) { clientMutationId } }'",
    "gh api graphql -F query='mutation { updateRef(input: {}) { clientMutationId } }'",
    "gh api graphql --raw-field query='mutation { createCommitOnBranch(input: {}) { clientMutationId } }'",
    "gh -R o/r pr merge 12",
    "gh --repo o/r pr merge 12 --squash",
    "gh --repo=o/r pr merge 12",
  ]) {
    const r = evaluate(bash(cmd));
    assert.equal(r.block, true, cmd);
    assert.match(r.message, /yalnız tren gider/);
  }
  for (const cmd of [
    "gh api repos/o/r/git/refs/heads/main", // read-only; `git ls-remote origin main` reads it without the API
    "gh api -X GET repos/o/r/git/refs/heads/main",
    "gh api repos/o/r/contents/README.md",
    "gh api repos/o/r/pulls/12/merge", // GET: is it merged?
    "gh api graphql -f query='query { viewer { login } }'",
    "gh -R o/r pr view 12",
  ])
    assert.equal(evaluate(bash(cmd)).block, false, cmd);
});

test("`git push origin :` (the matching refspec) counts as every branch, main included", () => {
  const onTask = cloneRepo("repo-matching");
  git(onTask, "checkout", "-q", "-b", "task/x");
  for (const cmd of ["git push origin :", "git push origin task/x :", "git push origin +:"]) assert.equal(evaluate(bash(cmd, { cwd: onTask })).block, true, cmd);
  assert.equal(evaluate(bash("git push origin :task/old", { cwd: onTask })).block, false); // deleting a task branch
});

test("--attr-source takes a value; a record path hides behind no trailing dot, space or stream suffix", () => {
  const onTask = cloneRepo("repo-attr");
  git(onTask, "checkout", "-q", "-b", "task/x");
  assert.equal(evaluate(bash("git --attr-source HEAD push origin HEAD:main", { cwd: onTask })).block, true);
  for (const f of ["docs/plan/KARARLAR.md.", "docs/plan/KARARLAR.md . ", "DURUM.md::$DATA", "docs/plan/SORULAR.md:x:$DATA", "docs/plan./BACKLOG.md", "C:/c/coord/DURUM.md:Zone.Identifier"])
    assert.equal(isRecordFile(f), true, f);
  for (const f of ["docs/plan/KARARLAR.md.bak", "C:/c/coord/README.md"]) assert.equal(isRecordFile(f), false, f);
});

test("a worker cannot push to coord/kayit2, by any refspec; the coordinator can", () => {
  const coord = cloneRepo("repo-coord");
  git(coord, "checkout", "-q", "-b", "coord/kayit2");
  const worker = (cmd, cwd = repo) => evaluate(bash(cmd, { cwd, agent_id: "a5" }));
  for (const [cmd, cwd] of [
    ["git push origin HEAD:coord/kayit2", repo],
    ["git push origin task/x:refs/heads/coord/kayit2", repo],
    ["git push -f origin coord/kayit2", repo],
    ["git push", coord],
  ]) {
    const r = worker(cmd, cwd);
    assert.equal(r.block, true, cmd);
    assert.match(r.message, /coord\/kayit/);
    assert.equal(auditLines().at(-1).event, "coord-push-by-worker-blocked");
  }
  assert.equal(evaluate(bash("git push origin HEAD:coord/kayit2", { cwd: "C:/c/coord/.claude/worktrees/agent-a1" })).block, true); // an agent tree, no agent_id
  assert.equal(evaluate(bash("git push", { cwd: coord })).block, false);
  assert.equal(worker("git push origin HEAD:task/x").block, false);
});

test("a record path is normalized first: ./ and ../ do not hide it", () => {
  for (const f of ["docs/plan/./KARARLAR.md", "docs\\plan\\.\\SORULAR.md", "docs/plan/x/../BACKLOG.md", "./DURUM.md", "docs//plan/EKRAN-PLANI.md"])
    assert.equal(isRecordFile(f), true, f);
  const worker = { tool_name: "Write", session_id: "s", agent_id: "a3", cwd: repo, tool_input: { file_path: `${repo}/docs/plan/./KARARLAR.md` } };
  assert.equal(evaluate(worker).block, true);
});

test("a worker cannot run scripts/train.mjs, any subcommand; the coordinator can", () => {
  const worker = (command, extra = { agent_id: "a7" }) => evaluate(bash(command, extra));
  for (const cmd of [
    "node scripts/train.mjs run task/a@abc",
    "node scripts/train.mjs push",
    'NF_OVERRIDE="acil" node scripts/train.mjs push',
    "node ./scripts/train.mjs apply-local",
    'node.exe "C:\\c\\coord\\scripts\\train.mjs" ci',
    "git status && node scripts/train.mjs status",
  ]) {
    const r = worker(cmd);
    assert.equal(r.block, true, cmd);
    assert.match(r.message, /train\.mjs/);
    assert.equal(auditLines().at(-1).event, "train-by-worker-blocked");
  }
  const ps = (command) => evaluate({ tool_name: "PowerShell", session_id: "s", cwd: repo, agent_id: "a7", tool_input: { command } });
  assert.equal(ps("node.exe C:\\c\\coord\\scripts\\train.mjs ci").block, true);
  assert.equal(ps("$env:NF_OVERRIDE='acil'; & node scripts/train.mjs push").block, true);
  // an agent tree without agent_id is a worker too
  assert.equal(evaluate(bash("node scripts/train.mjs push", { cwd: "C:/c/coord/.claude/worktrees/agent-a1" })).block, true);
  // reading or testing the script is not running it
  for (const cmd of ["cat scripts/train.mjs", "node --test scripts/train-steps.test.mjs", "git add scripts/train.mjs", "grep -n push scripts/train.mjs"])
    assert.equal(worker(cmd).block, false, cmd);
  assert.equal(evaluate(bash("node scripts/train.mjs run task/a@abc")).block, false); // the coordinator
});

test("a worker cannot write the audit log, by Edit/Write or by a shell redirection; reading passes", () => {
  const log = path.join(process.env.NEWFORK_INBOX_DIR, "audit.log");
  const edit = (tool, file, extra = { agent_id: "a8" }) => evaluate({ tool_name: tool, session_id: "s", cwd: repo, tool_input: { file_path: file }, ...extra });
  for (const tool of ["Edit", "Write"]) {
    const r = edit(tool, log);
    assert.equal(r.block, true, tool);
    assert.match(r.message, /audit\.log/);
    assert.equal(auditLines().at(-1).event, "audit-write-by-worker-blocked");
  }
  assert.equal(edit("Write", "C:/Users/x/Documents/Codex/.newfork-inbox/audit.log").block, true); // the real folder by name
  assert.equal(edit("Write", log, {}).block, false); // the coordinator's session (no agent_id, not an agent tree)
  const worker = (command) => evaluate(bash(command, { agent_id: "a8" }));
  for (const cmd of [
    `echo '{"event":"train-push"}' >> ${log}`,
    `printf x > "${log}"`,
    `echo x | tee -a ${log}`,
  ]) {
    const r = worker(cmd);
    assert.equal(r.block, true, cmd);
    assert.equal(auditLines().at(-1).event, "audit-write-by-worker-blocked");
  }
  const ps = evaluate({ tool_name: "PowerShell", session_id: "s", cwd: repo, agent_id: "a8", tool_input: { command: `Add-Content -Path '${log}' -Value x` } });
  assert.equal(ps.block, true);
  for (const cmd of [`cat ${log}`, `grep train-push ${log}`, `tail -5 ${log} > /tmp/x.txt`]) assert.equal(worker(cmd).block, false, cmd);
  assert.equal(evaluate(bash(`echo x >> ${log}`)).block, false); // the coordinator
});

test("a worker cannot edit e2e/karantina.txt (S-106); the coordinator can", () => {
  const file = `${repo}/e2e/karantina.txt`;
  const r = evaluate({ tool_name: "Edit", session_id: "s", agent_id: "a9", cwd: repo, tool_input: { file_path: file } });
  assert.equal(r.block, true);
  assert.equal(auditLines().at(-1).event, "record-by-worker-blocked");
  assert.equal(evaluate({ tool_name: "Edit", session_id: "s", cwd: repo, tool_input: { file_path: file } }).block, false);
});

test("a worker cannot cp, mv or sed -i onto the audit log; read-only grep, cat, tail and sed -n pass", () => {
  const log = path.join(process.env.NEWFORK_INBOX_DIR, "audit.log").replaceAll(path.sep, "/");
  const worker = (command) => evaluate(bash(command, { agent_id: "a10" }));
  for (const cmd of [`cp /tmp/fake.log ${log}`, `mv /tmp/fake.log ${log}`, `sed -i 's/train-override/x/' ${log}`, `sed --in-place -e d ${log}`]) {
    const r = worker(cmd);
    assert.equal(r.block, true, cmd);
    assert.equal(auditLines().at(-1).event, "audit-write-by-worker-blocked");
  }
  const ps = evaluate({ tool_name: "PowerShell", session_id: "s", cwd: repo, agent_id: "a10", tool_input: { command: `Copy-Item C:/tmp/fake.log ${log}` } });
  assert.equal(ps.block, true);
  for (const cmd of [`grep -c train-push ${log}`, `cat ${log}`, `tail -n 20 ${log}`, `sed -n 1,5p ${log}`, `grep -n push ${log} | head`]) assert.equal(worker(cmd).block, false, cmd);
});
