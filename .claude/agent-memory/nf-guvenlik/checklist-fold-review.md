---
name: checklist-fold-review
description: Reviewing a _base/overload chain fold: prove bodies identical, check guards run in a GREEN file, before/after probe with tests.world; traps (tests.week is future-anchored, labels never reach published shifts)
metadata:
  type: feedback
---
Before approving a chain fold: (1) dump old defs (pg_get_functiondef) and `diff -w` old inner body vs new body; (2) for each guard of the riskiest path, find the test that raises it AND check the file is in ci-green: schedule_publication.test.sql (the only file with stale-fingerprint, override-reason, hard/document blockers) is red at fixture setup, so the suite proves nothing about them; (3) run one probe script with a tests.world twice (with and without the migration, each rolled back) and compare cell by cell.
Traps: tests.week(n) is anchored far in the future (2028), so tests.week(-2) is NOT a past week; use schedule_current_week_start_service(w) - 14.
**Why:** FB-6.1 .4 review (2026-09-26): the suite was green but the publish guards ran nowhere; the first past-week probe was invalid because of tests.week.
**How to apply:** every FB-6.x fold (6.2–6.8). See [[feedback-rollback-trial-safety]], [[checklist-empty-array-traps]].
