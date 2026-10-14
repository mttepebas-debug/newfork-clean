---
name: exchange-survives-publish
description: BL-198 rule - where "a publish must not undo an approved shift change" lives, how 'after the last publish' is measured, and the one-transaction test trap
metadata:
  type: project
---

- One rule: `public.shift_exchange_draft_undoes(w, draft, locations, departments, include_no_department)` (migration `20260927114500`). A completed case whose shift is in the CURRENT publication and whose `c.updated_at > pub.published_at` must have a draft row that `shift_exchange_edit_matches` the published row; otherwise a hard `shift_exchange_undone` finding. The preflight appends it; publish refuses via `hard_blocked` → 23514. `shift_exchange_assert_draft` is retired (it only looked at drafts created before the approval: the BL-198 hole).
- The save-side twin `shift_exchange_assert_session` still exists (edit session save, PT409); not touched by BL-198.
- An exchange edits published rows IN PLACE (same publication), so "after the last publish" = case time vs the current publication's `published_at`. Both are transaction-start `now()`; ponytail comment in the function names the lock-wait window.
- Test trap: one pgTAP transaction has one `now()`, so the swap never reads as "after" the publication. Move the publication's `published_at` back (`approved_exchange_survives_a_stale_draft`, `shift_exchanges_v1` AT27 publication insert).
- `weekly_exchange_changed_terms.test.sql` errors locally ("Resolve availability, shift hours or approved time off before this assignment") with or without BL-198 and is not in ci-green.

**Why:** BL-198, 2026-09-27.
**How to apply:** a new publish path or exchange kind goes through this function; do not add a second guard. See [[published-shift-retention]], [[rollback-trial-runner]].
