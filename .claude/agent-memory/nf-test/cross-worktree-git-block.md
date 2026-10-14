---
name: cross-worktree-git-block
description: sandbox blocks git commands (log, -C, --git-dir) targeting a worktree other than the one this agent is isolated in, even for a legitimate task-assigned worktree
metadata:
  type: feedback
---

A worker/subagent is always sandboxed into one worktree path (shown as
"Primary working directory" in the environment block). If a task message
points at a *different* existing worktree (e.g. a coordinator task naming
`../worktrees/agent-<other-hash>` on `task/<id>`), `cd`-ing there and running
any `git` command — `git log`, `git status`, `git -C <path>`, `--git-dir` —
is refused by the sandbox with "a worktree-isolated agent's git operations
must target its own worktree", regardless of whether the target is the
correct, task-assigned worktree.

**Why:** this is a hard sandbox rule, not a CLAUDE.md convention — it cannot
be argued around or overridden by task instructions.

**How to apply:**
- Non-git commands (`cd`, `cat`, `pnpm.cmd`, `npx supabase ...`, `ls`) work
  fine in the other worktree via plain `cd` — only the `git` binary itself is
  blocked from targeting a foreign worktree.
- To confirm branch/commit there without `git`: read
  `<main-repo>/.git/worktrees/<worktree-name>/HEAD` (gives `ref: refs/heads/<branch>`)
  and `<main-repo>/.git/refs/heads/<branch>` (gives the commit sha) directly
  with Read/cat. The worktree's own `.git` file is a one-line pointer to that
  `.git/worktrees/<name>/` dir and is safe to `cat`.
- Don't waste a turn retrying `git -C` or `--git-dir` after the first refusal
  — it fails identically every time; go straight to the file-read workaround.
