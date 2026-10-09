---
name: checklist-e2e-shared-world-counts
description: e2e specs share one world per run (workers 1, files alphabetical); a DB count in an assertion must be scoped to the spec's own week/rows or earlier specs make it fail
metadata:
  type: feedback
---

All e2e specs run against one `tests.world(run)` built by `e2e/global-setup.ts`, one worker, files in alphabetical order. Each spec takes its own week (1 shift-hub-swap, 3 multi-location, 4 availability-warning, 5 BL-198). Nothing is cleaned between specs.

**Why:** BL-198 e2e (d65ed01c, 2026-09-27) asserted "no new version" with `count(distinct version_number)` over all weeks at Kadikoy. availability-warning (week 4) republishes Kadikoy and runs earlier, so the count is 2 in a full run even when the rule works. The author only ran the spec alone.

**How to apply:** for any DB assertion in an e2e spec, check its `where` is scoped to the spec's own week, labels or ids, or compares a before/after value taken inside the spec. Ask for the green proof from a full `pnpm.cmd e2e` run, not one spec alone. SQL setup via psql runs as postgres: fine when it calls `*_service(actor, …)` (rule checked, grants not), wrong when it inserts into tables. Related: [[feedback-trial-sources-and-drift]].
