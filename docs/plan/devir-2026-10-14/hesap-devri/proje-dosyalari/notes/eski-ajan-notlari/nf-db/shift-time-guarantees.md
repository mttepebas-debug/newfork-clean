---
name: shift-time-guarantees
description: What the DB guarantees about a saved shift's hours and time zone, and where a same-person overlap is blocked (core assessment vs default-hours review)
metadata:
  type: reference
---

- `time_basis` is only `explicit` / `type_default` (CHECK on edit-session, draft, published, template shifts); start/end required by `*_time_source_range` CHECK. A test building `time_basis='unresolved'` fails in `normalize_schedule_time_source` with "invalid shift time source" (22023).
- `check_schedule_time_source` is a BEFORE INSERT/UPDATE row trigger on edit/draft/published shifts: it fills `time_snapshot` and `time_timezone` (location tz fallback). So raw test/seed inserts without a time zone still land with one; FB-6.1.8 made `time_timezone` NOT NULL on those three tables.
- `assess_weekly_shift_availability`: `time_overlap` (same employee, overlapping shift) has no setting, severity is always `block`; `assignment_missing` also blocks. User decision 2026-09-26 (FB-6.1.8, option A): an overlap is never acknowledgeable anywhere; the default-hours acknowledgment flag is gone.
- The core compares one proposed shift with the others at their CURRENT hours. Two shifts selected in one default-hours review whose NEW hours overlap only each other pass the core; `preview_schedule_default_hours_service` catches them in its peer loop (peer at its proposed hours) and blocks with reason `Overlaps <type> <h:mm AM–h:mm PM>` (workspace time_format). Any batch "change many shifts at once" path needs the same second look.
- The default-hours review fingerprint includes both assessments, so a change after review (assignment ended, leave approved) surfaces as 40001 at apply, before any row is written.

Related: [[rollback-trial-runner]], [[published-shift-retention]].
