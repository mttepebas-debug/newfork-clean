---
name: shift-time-guarantees
description: What the DB guarantees about a saved shift's hours and time zone, and the overlap rule that makes the default-hours "acknowledge overlap" flow collide with the core
metadata:
  type: reference
---

- `time_basis` is only `explicit` / `type_default` (CHECK on edit-session, draft, published, template shifts); start/end required by `*_time_source_range` CHECK. A test building `time_basis='unresolved'` fails in `normalize_schedule_time_source` with "invalid shift time source" (22023).
- `check_schedule_time_source` is a BEFORE INSERT/UPDATE row trigger on edit/draft/published shifts: it fills `time_snapshot` and `time_timezone` (location tz fallback). So raw test/seed inserts without a time zone still land with one; FB-6.1.8 made `time_timezone` NOT NULL on those three tables.
- `assess_weekly_shift_availability`: `time_overlap` (same employee, overlapping shift) has no setting, severity is always `block`; `assignment_missing` also blocks. Anything that expects an overlap to be "acknowledgeable" (default-hours review, 2026-09-09 design) is older than this and hits `blocked`.
- The default-hours review fingerprint includes both assessments, so a change after review (assignment ended, leave approved) surfaces as 40001 at apply, before any row is written.

Related: [[rollback-trial-runner]], [[published-shift-retention]].
