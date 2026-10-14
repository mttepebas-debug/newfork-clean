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
- Never put the db.lock acquire, the e2e run and the lock release in ONE parallel tool batch: a
  failed acquire does not stop the others, so e2e ran on nf-db's lock and `rm` deleted it
  (BL-137, 2026-09-26). Acquire alone, read the result, then run.
- A heredoc python edit script can be refused too (BL-186); the Edit tool handles CRLF files
  directly and is the cheapest route for multi-spot edits.
- `apps/web/src/**/*.test.tsx` and `packages/shared/src/index.test.ts` are CRLF. A scripted
  replace with `\n` literals finds nothing; normalise or match `\r\n`, and write back in CRLF.
- `pnpm.cmd --filter <pkg> exec vitest run <file>` prints `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "vitest" not found`
  whenever the test FAILS (non-zero exit); vitest did run. Read the `Tests` line, not that message.
  Web/api resolve `@newfork/shared` from its build: after a shared edit run `--filter @newfork/shared build`.
- A `node -e '...'` script whose body contains an apostrophe (e.g. "service's" in a comment) breaks bash quoting and bash then runs the leftover lines as commands (a bare `*` ran the first file name). Put edit scripts in a scratchpad `.cjs` file (Write tool) and run `node file.cjs <path>`; check `git status` after any quoting accident.
