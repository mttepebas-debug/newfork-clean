---
name: published-shift-retention
description: Where an unchanged, already published shift keeps its availability acceptance (grid, trigger, publish preview) and the one trap that made Block re-judge it
metadata:
  type: project
---

"Retention" = a draft/session shift whose `schedule_availability_identity` matches a shift in the latest publication of its location-week (`schedule_availability_prior_publication`, any status, so it survives an unpublish) keeps the old availability snapshot instead of being judged again.

- Read side: `schedule_availability_read_projection` (grid/session) retains unconditionally.
- Write side: `guard_schedule_assignment_availability` returns early when a prior exists (no assessment at all, leave included); the publish preview is what still catches leave.
- Publish preview: `weekly_schedule_publication_preflight` retains only when every reason code is `availability`; since FB-6.1.7 (`20260926180000`) Block is included too. Before, a `conflict_severity <> 'block'` test made an unchanged published shift `hard_blocked` after a switch to Block (REUSE: "Sert'e geçmek ... yayınlanmış vardiyaları etkilemez").

**Why:** FB-6.1.7, 2026-09-26.
**How to apply:** a change to retention has to be made in all three places or the grid and the preview disagree; test in `availability_three_levels`. See [[leave-rules-in-code]].
