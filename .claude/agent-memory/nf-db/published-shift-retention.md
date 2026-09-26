---
name: published-shift-retention
description: Where an unchanged published shift still keeps what was accepted (non-availability conflicts only since BL-186) and which callers of schedule_availability_prior_publication remain
metadata:
  type: project
---

"Retention" = a draft/session shift whose `schedule_availability_identity` matches a shift in the latest publication of its location-week (`schedule_availability_prior_publication`, any status, so it survives an unpublish) keeps what was accepted instead of being judged again.

Since BL-186 (migration `20260926220000`) availability is never retained: every read (grid read model, edit session, shift list projection, publish preview) shows today's marks. FB-6.1.7's availability retention in the preview is gone, and so are `weekly_published_availability_visible` and `manager_weekly_reminders.last_disabled_at`.

Callers of `schedule_availability_prior_publication` that remain, all for non-availability conflicts (BL-174 territory):
- `guard_schedule_assignment_availability`: early return for an unchanged published identity (skips every reason, leave included); copies `availability_snapshot` on a published re-insert.
- `assess_weekly_schedule_assignment_service`: retained shift answers `allowed`, keeping only availability reasons.
- `schedule_availability_read_projection`: operation/acceptance from the snapshot, availability fields from today.
- `weekly_schedule_publication_preflight`: `accepted` state for a `schedule_conflict` accepted at the prior publication.

**Why:** FB-6.1.7 then BL-186, 2026-09-26.
**How to apply:** a change to retention has to be made in all four places; availability tests live in `availability_is_a_preference`. See [[availability-is-a-preference]], [[leave-rules-in-code]].
