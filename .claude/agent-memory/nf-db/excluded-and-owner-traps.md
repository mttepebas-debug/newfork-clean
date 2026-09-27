---
name: excluded-and-owner-traps
description: What today's DB already does for an excluded person and the owner record (measured 2026-09-27, BL-218 .1), so a rule is not built twice
metadata:
  type: reference
---

- Excluded from Schedule (`employee_profiles.is_excluded_from_schedule`): the availability assessment already calls the person "Employee is not active in Schedule" (`weekly_assignment_candidate_base`). So a new shift by hand (`mutate_schedule_edit_shift_service` via `tests.add_shift`) and a pending op already fail 23514. The same check makes `publish_schedule_draft_service` hard-block ("schedule has hard publication blockers", preview code `schedule_conflict`) a week whose carried shift belongs to an excluded person, and `apply_schedule_template_service` refuses the whole apply ("Resolve availability ... before this assignment") instead of leaving that shift open. Tests: `excluded_person_leaves_new_drafts.test.sql`.
- Nobody can delete a location the owner works at today ("This location has employees you cannot manage"): BL-187, FB-6.2 .6. Cells that need it are `todo`.
- `save_employee_service` with `primary_job_id = null` crashes 23502 (`employee_job_assignments.is_primary` not null): the owner's auto-assigned jobs carry `is_primary = false`, so saving the owner's record without choosing a primary fails.
- `update_job_assignments_service` makes a new assignment primary when the person has none; `open_owner_record_to_everything` never sets primary.
- Edit sessions: source `blank` = new draft (empty), `published` copies current published shifts (id = `source_shift_id`), `draft` copies a saved draft. Saving two sessions of one week with the same name fails "draft name conflict".
- Read a column that does not exist yet through `to_jsonb(row) ->> 'col'` so a red pgTAP file fails cell by cell instead of erroring out.

Related: [[rollback-trial-runner]].
