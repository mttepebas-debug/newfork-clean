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

**Why:** 2026-09-25 the unquoted `echo begin;` from this note applied the FB-6.1 .2 migration to the shared DB for 8 minutes during review (undone).

Related: [[core-call-cost]], [[sql-traps-core-translation]].
