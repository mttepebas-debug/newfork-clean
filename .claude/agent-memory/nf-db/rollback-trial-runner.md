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

**Why:** 2026-09-25 the unquoted `echo begin;` from this note applied the FB-6.1 .2 migration to the shared DB for 8 minutes during review (undone).

Related: [[core-call-cost]], [[sql-traps-core-translation]].
