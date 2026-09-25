---
name: rollback-trial-runner
description: How to run pgTAP files with an unapplied migration in one rolled-back transaction on the shared local DB, and the traps met doing it
metadata:
  type: reference
---

Before nf-guvenlik approves, a migration is only tried inside a transaction that rolls back. Per file:
`{ echo "set client_min_messages = warning;"; echo begin; echo "create extension if not exists pgtap with schema extensions;"; cat <migration>; cat <test>; } | docker exec -i supabase_db_newfork-clean psql -U postgres -d postgres -q -At`
(tests end with `rollback;`). Count `^not ok` without `# TODO`, `ERROR:` and "Looks like you planned".

- pgtap is NOT installed permanently in the local DB; `supabase test db` installs it. A test without its own `create extension` (e.g. location_short_names) fails with "function plan(integer) does not exist" unless the prelude creates it.
- The worktree guard refuses shell lines with `$(...)`, `<(...)` or docker fed by a complex pipe: keep the loop in a script file under the scratchpad and pass a list file (`--list supabase/tests/ci-green.txt`).
- Whole suite (116 files) takes ~3.5 min; hold db.lock while it runs.
- The TS twin dump (`dump:authz-matrix`) reads `app_private.authz_actions` from the live DB: with an unapplied migration, run a scratch copy of `packages/shared/scripts/dump-authorization-matrix.ts` that puts the migration after its `begin;`.

Related: [[core-call-cost]], [[sql-traps-core-translation]].
