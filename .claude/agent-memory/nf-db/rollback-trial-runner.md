---
name: rollback-trial-runner
description: How to run pgTAP files with an unapplied migration in one rolled-back transaction on the shared local DB, and the traps (one of them applied a migration for real)
metadata:
  type: reference
---

Before nf-guvenlik approves, a migration is only tried inside a transaction that rolls back. Keep the loop in a script file (scratchpad), never inline:

```bash
{
  echo "set client_min_messages = warning;"
  echo "begin;"        # QUOTED. Bare `echo begin;` prints "begin" with no semicolon:
                       # psql joins it to the next line and the migration autocommits for real.
  echo "create extension if not exists pgtap with schema extensions;"
  cat "$migration"; echo
  cat "$testfile"      # pgTAP files end with rollback;
} | docker exec -i supabase_db_newfork-clean psql -U postgres -d postgres -q -At > out 2>&1
```
List files (`ci-green.txt`) have CRLF: read them with `tr -d '\r' < list`.

Before a batch: run ONE file first, then prove nothing stayed, e.g. `select key from app_private.authz_actions where key = '<new action>'` returns no row, the migration's version is not in `supabase_migrations.schema_migrations`, a dropped function still exists. Count `^not ok` without `# TODO`, `ERROR:` and "Looks like you planned".

- pgtap is NOT installed permanently in the local DB; `supabase test db` installs it. A test without its own `create extension` (e.g. location_short_names) fails with "function plan(integer) does not exist" unless the prelude creates it.
- The worktree guard refuses shell lines with `$(...)`, `<(...)` or docker fed by a complex pipe: keep loops in a script and pass a list file.
- Whole suite (116 files) takes ~3.5 min; hold db.lock while it runs.
- The TS twin dump (`dump:authz-matrix`) reads `app_private.authz_actions` from the live DB: with an unapplied migration, run a scratch copy of `packages/shared/scripts/dump-authorization-matrix.ts` that puts the migration after its `begin;` (the script's template already has the semicolon).

- No `psql` on the host: always `docker exec -i supabase_db_newfork-clean psql ...`; add `-X -v ON_ERROR_STOP=1` so a failing migration stops instead of running the test half-applied.
- Alternative to the prelude above: strip the test file's own first `begin;` (`sed '1{/^begin;/d}'`); its trailing `rollback;` undoes the migration too.
- Seed changes never reach the shared DB, but the local DB already holds the seed rows. To measure a seed edit, put only the new seed block after the migration in the same transaction and compare seed-dependent files with and without it (BL-080: 22 files, 1 changed). A full reload of the seed is only seen in CI or after `db reset`.
- Another nf-db agent may hold db.lock: wait with a background `until [ ! -f .../db.lock ]; do sleep 5; done`, never delete it.
- Output cut by `head -N` hides matrix lines: count `^not ok` without `# TODO` on the full output file, not on a truncated summary.
- Trap in the core: `app_private.authz_check` returns early for `scope_class = 'own'` before the `owner_only` check, so an "owner only, own record" rule cannot be an `own` action. Use an `org` + `owner_only` action (BL-080 used `workspace.setup`) and resolve the record from the actor instead of taking a target id.
- The shared DB can carry another branch's migration applied for real before it reaches main (2026-09-26: BL-080's owner-legal-name migration turned 6 ci-green files red). Before blaming your migration, run the red files again with no migration: identical counts = not yours.
- Grid budget numbers (fixture `schedule_grid_read_budget`, best warm read): after FB-6.1.5 owner ~18-20 ms, one-location manager ~12-14 ms; after the .4 fold (one read function, scope_set once) owner ~16 ms, manager ~11.5 ms; BL-158 (2026-09-26) owner ~15 ms, manager ~11 ms. The same test swings to 50-60 ms on a busy machine: interleave runs with and without before calling it a regression. A timing script: the budget file's setup lines (up to the line before `create temp table mina_model`; `sed -n '4,64p'` since BL-158) plus `select who, min(ms) filter (where n > 3) from wb_run group by who`.
- A change to `supabase/test-support/builder.sql` is seed: the shared DB keeps the old `tests.*` function. In a trial, cut the changed function out of builder.sql (`awk '/^create or replace function tests.add_shift/{p=1} p{print} p&&/^\$\$;/{exit}'`) and put it after the migration in the same transaction.
- 2026-09-26 another agent ran e2e under this role's db.lock and deleted/re-wrote the lock file mid-run; the coordinator voided the run. Record start/end times of every trial run and `cat db.lock` after it; if told the lock was breached, release, retake with fresh content and rerun everything that ran inside the window.
- One transaction has one `now()`: an expired lease or "the edit was opened before the swap" (`c.updated_at > sess.created_at`) needs a hand UPDATE of `expires_at` / `created_at` into the past, marked `ponytail:` in the test.
- A trial file that prints nothing counts as "0 not ok": also check every `.out` has a `1..N` plan line and `ok` lines (`grep -L '^ok' *.out` must list nothing).
- The worktree guard also refuses a command that sets a shell variable and then runs bash/docker with it, and a heredoc that writes a script: write scripts and list files with the Write tool, call them with literal paths.

- The scratchpad directory is shared by every subagent of the same coordinator session: another agent overwrote `trial.sh` and `one.txt` mid-task (2026-09-26). Keep scripts and outputs in a per-task subfolder (`scratchpad/<task>/`).
- Take db.lock atomically with `( set -o noclobber; echo ... > db.lock )` inside a script, then grep your own name back; two agents were waiting on the same lock that day.

- 2026-09-26 a reviewer's runner let a test file's own trailing `rollback;` close the outer transaction and what followed committed for real (6 workspaces leaked at 20:43 UTC). Safe shape: one psql session per file, migration inserted right after the file's own first `begin;` line, `ON_ERROR_STOP=1`, and compare workspace/auth.users/tests.ids counts before and after.
- A prelude that runs `set constraints all immediate` must end with `set constraints all deferred;`, or deferred dependency triggers (e.g. `enforce_role_permission_dependencies`) fire mid-test and fake a red.
- Permanent cleanup deletes on the shared DB (COMMIT) were refused by the permission classifier for this role (2026-09-26): prepare the script, rolled-back trial and JSONL backup, then hand the COMMIT back. The capture-trigger backup script lives in `artifacts/koordinator/db-cleanup-2026-09-26-b/cleanup-script.sql`.

- A reusable per-file runner (FB-6.1.9, 2026-09-27): write it with the Write tool into `scratchpad/<task>/trial.sh`; per file `awk 'NR==1 && /^begin;/ {print; <cat migration>; next} {print}'` piped to one `psql -X -v ON_ERROR_STOP=1`, then count `^not ok` minus TODO, `ERROR:`, `^1\.\.`, and print workspaces/auth.users/authz_actions counts before and after. `lock.mjs take` wants the owner as `rol/oturum` (e.g. `nf-db/fb61-9-settings-db`).

- BL-475 (2026-09-30): an UPDATE on `jobs` queues the deferred `document_assignment_changed` trigger, and a later `ALTER TABLE jobs` in the same migration fails "pending trigger events". Fire it first: `set constraints public.document_assignment_changed immediate;` ... ALTER ... `set constraints public.document_assignment_changed deferred;` (every trigger of that name is initially deferred).
- Postgres regex has no `\b` (it is backspace): use `\y` or `strpos(lower(prosrc), 'x') > 0` when grepping `pg_proc.prosrc`.
- `sed -i` in this Git Bash rewrites CRLF files (ci-green.txt) as LF: append to the list with `printf '...\r\n' >>` only.
- A test fixture that picks a department with `limit 1` and no ORDER BY follows whichever index the planner takes; dropping an index flipped `owner_employee_record` onto Management. Pick by name.

- Red-before for fixes already written (FB-6.7 fix round): export the older commit's migrations with one plain `git show <sha>:<path> > artifacts/...` per call (the worktree guard refuses combined git lines), run the new test file against them; a signature the old code lacked gets a tiny shim in the red prelude that ignores the new argument. Runner with base/fix0/now/mut modes: `artifacts/nf-db/fb67fix/trial.sh` (gitignored, in that worktree).
- A temp helper called after `set local role service_role` needs `grant execute on function pg_temp.f(...) to service_role` (or public).
- A rule that reads "today" (P09 closures from this week on, a past date tells nobody) turns fixed future dates in tests into time bombs: write `current_date + n`.
- `bl052_document_notifications` errors on the shared DB ("more than one row returned by a subquery") with no migration at all (2026-10-02): not a branch's fault.

**Why:** 2026-09-25 the unquoted `echo begin;` from this note applied the FB-6.1 .2 migration to the shared DB for 8 minutes during review (undone).

Related: [[core-call-cost]], [[sql-traps-core-translation]].
