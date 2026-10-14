---
name: feedback-trial-sources-and-drift
description: Before a rollback trial, check the named worktree is at the reviewed sha (else git archive the sha); when files go red, rerun them without the migration to separate shared-DB drift from the change
metadata:
  type: feedback
---

1. The worktree a task names can sit on another branch. Check it with `git -C <wt> rev-parse --short HEAD` before feeding its `supabase/tests`. If it is not at the reviewed sha, take the sources with `git archive <sha> supabase/tests packages/shared/src | tar -x -C <scratch>`. The TS twin test reads `../../../supabase/tests/authorization_matrix.test.sql`, so extract that file into the same root.
2. The shared local DB carries other sessions' permanent migrations (`select version, name from supabase_migrations.schema_migrations order by 1 desc`). A red file in the green list is not the change's fault until the same files run red WITHOUT the migration: diff the `not ok` names of the two runs.

**Why:** BL-139 review (2026-09-26): the named worktree was on `fb61-5` (plan 70 instead of 78). Four files had 19 red tests and two stopped halfway, all from BL-080's `20260925180000` that nf-test had applied at 03:51. Identical failures without BL-139.

**How to apply:** every rollback trial. Related: [[feedback-rollback-trial-safety]].
