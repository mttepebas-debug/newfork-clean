---
name: worktree-shell-traps
description: isolated-worktree Bash refuses compound git/cp commands; web test files are CRLF so scripted edits must match \r\n
metadata:
  type: reference
---

- In an isolated agent worktree, Bash refuses any command it cannot prove stays in the worktree
  (git mixed with `&&` chains, `(...) &`, `cd` + relative `../../..`, heredoc python + git). Split
  into single plain commands; run pnpm via the PowerShell tool; copy `.env.local` with absolute
  paths (`/c/Users/TheWe/Documents/Codex/newfork-clean/apps/{web,api}/.env.local`; root has none).
- `apps/web/src/**/*.test.tsx` and `packages/shared/src/index.test.ts` are CRLF. A scripted
  replace with `\n` literals finds nothing; normalise or match `\r\n`, and write back in CRLF.
