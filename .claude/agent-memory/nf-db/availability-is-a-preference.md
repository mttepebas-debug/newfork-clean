---
name: availability-is-a-preference
description: BL-186 data contract - availability reasons never gate, availability_fingerprint, the publish availability finding and where its acknowledgment is looked up
metadata:
  type: project
---

Since BL-186 (`20260926220000_availability_is_a_preference.sql`):
- `assess_weekly_shift_availability`: availability reasons (own mark and `source=reminder`) are annotated `severity:'warn'` but never raise `conflict_severity`/`operation`; they are left out of the gating `fingerprint`. `has_availability_conflict` + `availability_fingerprint` (sha of person, logical shift id, location, date, span, employee/manager intervals) name the warning. `conflict_rules.availability` no longer exists (CHECK, default, `update_scheduling_settings_service` 22023).
- Publish preview: per shift a `schedule_conflict` finding (only if operation <> allowed) and a separate `availability` finding (id = availability_fingerprint, soft, `warning_policy:'confirm'`, state `new`/`accepted`, `acknowledged_by_user_id/_name/_at` when accepted). Acknowledgment lookup is by `finding_id` across ALL publications of the workspace, so S2 "unchanged warning asks once" works across drafts/unpublish.
- `weekly_publication_decisions` is the one place deciding what is recorded (BL-190); publish inserts only findings that got a decision; an `accepted` availability finding is not re-recorded (the first acknowledger stays).
- Testing a soft-acceptance path (PT409 stale fingerprint, override rows) now needs a non-availability conflict: a `schedule_closures` row (closed_location = confirm) works when the payload has `job_id`.

**Why:** user decision 2026-09-26 (S1 A, S2 A, S3 A).
**How to apply:** never reintroduce availability into operation; new gating rules must keep the availability split in the preflight. See [[published-shift-retention]].
