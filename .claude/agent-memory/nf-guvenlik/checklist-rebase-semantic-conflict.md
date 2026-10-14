---
name: checklist-rebase-semantic-conflict
description: A rebase with only textual conflicts in ci-green or MEMORY can still turn tests red; rerun the moved branch's own pgTAP on a DB that has the newly merged migrations
metadata:
  type: feedback
---

A "§6.3 short look" after a rebase is not finished when range-diff shows only ci-green/MEMORY context and no migration overlaps. Run the rebased branch's own new test files once, rolled back, on a DB where everything that entered main in between is already applied.

**Why:** merge-bl231 (56876f89, 2026-09-28). The rebase was textually clean and no function was redefined twice. But BL-218, now in the base, adds a system "Owner" job to every tests.world. BL-231's `employee_references_ask_the_core` asserted the exact job list {Cook,Old,Server}, so two cells went red and would have broken main CI.

**How to apply:**
1. Check that the local DB has the base's migrations (schema_migrations).
2. `git archive <rebased sha>` the tests plus the branch's own migration.
3. Run the branch's new files and any files asserting exact lists (names, counts, keys) in one rolled-back pass.

Pay extra attention when the base gained rows every world gets: system catalog records, default roles, seeded settings. Related: [[feedback-trial-sources-and-drift]], [[checklist-protected-record-all-columns]].
