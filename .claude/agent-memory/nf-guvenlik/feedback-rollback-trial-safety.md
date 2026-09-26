---
name: feedback-rollback-trial-safety
description: Rolled-back migration trial on the shared local DB silently becomes permanent (missing "begin;" semicolon, or several test files in one session); one psql session per test file, migration spliced after its own begin
metadata:
  type: feedback
---

Two ways a "rolled-back" trial on the shared local DB has turned permanent:

1. `echo begin` without the semicolon inside the quotes: psql joins it with the next line into a syntax error and the migration runs in autocommit, applied for good without a schema_migrations row. (2026-09-25, FB-6.1 .2: `20260925173926` live for ~8 minutes; restored from pre-trial `pg_get_functiondef` dumps.)
2. Several test files concatenated into ONE psql session under an outer `begin` with savepoints, stripping only lines that are exactly `begin;` / `rollback;`. Some files end in `select * from finish();rollback;` on one line (bl052_document_conflicts): that inline rollback ends the outer transaction (migration rolled back) and every later file runs in autocommit, committing its fixtures. (2026-09-26, BL-186 review: 6 fixture workspaces, ~20 auth users, `tests.ids` labels dr/wr, and rows INSIDE the Meyhouse workspace, including 2 locations "Default review UTC"/"Test Wing", 5 shift types, drafts, publications, time off and 2 notification_outbox rows, committed at 20:43 UTC; 11 pgTAP files then failed locally on duplicate keys. The user chose a targeted cleanup, done by nf-db.)

**Why:** the shared DB is everyone's test bed and holds the user's Meyhouse demo data; tests with fixed UUIDs cannot run twice once their fixture leaks, so one bad trial turns other sessions' test:db red and shows junk in the user's app.

**How to apply:** one psql process per test file, built as `head -1 test` (its `begin;`) + migration + `tail -n +2 test`, run with `-v ON_ERROR_STOP=1` (an error ends the session and the open transaction dies with it). Before looping: check each file's first line is `begin;` and its only `rollback;` is the last statement; run ONE file first and compare workspaces / auth.users / tests.ids counts and a migration marker (a dropped function) before and after. Never `ON_ERROR_STOP 0` with an outer transaction. Dump replaced functions first (the way back). Related: [[checklist-api-gate-core-actions]].
