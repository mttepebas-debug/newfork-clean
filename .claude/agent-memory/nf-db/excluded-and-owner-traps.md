---
name: excluded-and-owner-traps
description: Excluded person and owner record: what the DB does before and after BL-218, and the traps met writing .2 (2026-09-27)
metadata:
  type: reference
---

- Excluded from Schedule (`employee_profiles.is_excluded_from_schedule`): the availability assessment already calls the person "Employee is not active in Schedule" (`weekly_assignment_candidate_base`). So a new shift by hand (`mutate_schedule_edit_shift_service` via `tests.add_shift`) and a pending op already fail 23514. The same check makes `publish_schedule_draft_service` hard-block ("schedule has hard publication blockers", preview code `schedule_conflict`) a week whose carried shift belongs to an excluded person, and `apply_schedule_template_service` refuses the whole apply ("Resolve availability ... before this assignment") instead of leaving that shift open. Tests: `excluded_person_leaves_new_drafts.test.sql`.
- Nobody can delete a location the owner works at today ("This location has employees you cannot manage"): BL-187, FB-6.2 .6. Cells that need it are `todo`.
- Before BL-218 `save_employee` ended every assignment and re-inserted them on each save (and crashed 23502 with no primary job). Since BL-218 it writes only the difference, so row-level rules on the assignment tables (owner stays at every live location, Owner job only on the owner, Management job never `is_primary`) see real removals only. A new rule of that kind must not assume end-all-reinsert.
- `update_job_assignments_service` makes a new assignment primary when the person has none; `open_owner_record_to_everything` never sets primary.
- Edit sessions: source `blank` = new draft (empty), `published` copies current published shifts (id = `source_shift_id`), `draft` copies a saved draft. Saving two sessions of one week with the same name fails "draft name conflict".
- Read a column that does not exist yet through `to_jsonb(row) ->> 'col'` so a red pgTAP file fails cell by cell instead of erroring out.

Related: [[rollback-trial-runner]].
- A redefinition copied from `pg_get_functiondef` must be checked against the live body right before commit: `artifacts/nf-db/bl218/difflive.sh` diffs each redefined function (live vs migration) so only the task's hunks show (BL-197/BL-188 bodies were at risk).
- Local reds that are not yours (measured 2026-09-27 18:37, no migration): schedule_edit_sessions 6, schedule_publication 2, schedule_requests 2, schedule_templates_autofill_export 1, shift_exchanges_v1 5, time_off_published_assignment_disposition ERROR. Compare counts with and without your migration before blaming it.
- `delete_catalog_entity_service` has no 'jobs' kind; jobs are deleted only by `delete_job_with_assignments_service`.
- The last migration file that names a function is not always its live body: some were patched in place later (e.g. `snapshot_document_lifecycle_requirement` gained acknowledgement handling in 20260916011654 without a `create function` line a grep finds). Take the base from `pg_get_functiondef` on the shared DB, not from the file (BL-252, 2026-09-28).
- Owner and documents (BL-246/252): an owner's documents are excused by `app_private.owner_document_excused` and marked `owner_excused`; any exemption is given or taken back through `app_private.set_document_exemption` (the reviewer's service, a transfer and a republish all call it). Taking one back re-derives `required`/`blocks_activation` via `app_private.document_requirement_asked`. Test world: `suspend_on_overdue` needs a `period_days`.
- In this Git Bash, `python3` is the Store stub and hangs; edit files with the Edit/Write tools or sed.
