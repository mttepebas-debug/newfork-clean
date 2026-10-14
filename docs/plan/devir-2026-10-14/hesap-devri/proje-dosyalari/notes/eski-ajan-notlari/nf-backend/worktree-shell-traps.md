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
- A `python - <<"PYEOF"` heredoc fails with `unexpected EOF while looking for matching` + a quote when its body holds an ODD number of apostrophes (one "manager's" in a comment is enough); nothing runs, so nothing is half-written. Keep the body free of apostrophes (double-quoted Python strings, `chr(39)`, `chr(10)` for a newline inside a TS string) or balance them with a comment. A script that edits several files collects every change first and writes at the end, so a failed assert leaves no file half-edited (EMP-001, 2026-09-30: a script that wrote file by file stopped after four of five).
- `EmployeeDrawer.test.tsx` does not clear its mocks between tests: a test that asserts `saveEmployee` was not called needs `vi.mocked(saveEmployee).mockClear()` in its own `beforeEach`.
- The drawer's tests (EMP-001 B4, 2026-09-30): the role select's options arrive after the record, so wait for the option (`within(select).getByRole("option", …)`) before `fireEvent.change`, or the value does not take. Sections switch with `fireEvent.change(getByLabelText("Employee section"), …)`. `useToast` is mocked through `vi.hoisted` + a partial `vi.mock("@newfork/ui")`. A task file's "no test expects X (grep 0)" is a claim: grep the test files yourself first (`EmployeeDrawer.create.test.tsx` had two "Discard" tests the task said were not there).
- A `[Fact-Forcing Gate]` hook refuses the first Bash call and the first Edit/Write of each file in a session: state the importers, the affected API and the instruction in one line, then send the same call again. In a parallel batch only the first call is refused; the others land.
