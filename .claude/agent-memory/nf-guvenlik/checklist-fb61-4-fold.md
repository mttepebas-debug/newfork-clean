---
name: checklist-fb61-4-fold
description: What to check when FB-6.1 .4 folds the Schedule read chain: the ghost set's "allowed location" must move to scope_set with the grid, deleted_at included
metadata:
  type: project
---

FB-6.1.5 (`44dcf12`, reviewed 2026-09-26) added `ghost_shifts` to `get_schedule_read_model_service_label_base`. Which location counts as the actor's comes from the old `allowed_locations` CTE (`membership_location_scopes` / `all_locations`, `archived_at` only), not from `app_private.scope_set` (manages = works, `deleted_at` excluded).

**Why:** if .4 moves the grid to `scope_set` but leaves the ghost CTE on the old scope, the grid and the ghosts draw different lines: a location could be neither a row nor a ghost, or both.

**How to apply:** in the .4 fold diff, check that the ghost CTE's `not exists (allowed)` and `visible_employees` both read the same `scope_set(actor, w, 'schedule.read')` array as the grid. Probe: a manager with a scope row but no assignment, and an archived-but-not-deleted location. The ghost still carries only where and when (8 keys), and export stays filtered (`snapshot.ts` `locationById`, API `allowedGhosts`). Related: [[checklist-empty-array-traps]], [[checklist-api-gate-core-actions]].
