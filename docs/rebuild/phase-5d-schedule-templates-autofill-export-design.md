# Phase 5D Schedule templates, auto-fill, and export design

Status: implemented and locally verified on 2026-08-17. Phase 6 requires separate approval.

## Objective

Complete the remaining manager Schedule utilities without importing payroll, labor,
time-entry, overtime, tips, compliance, notification, or background-delivery domains.
The slice adds reusable weekly templates, reviewed open-shift auto-fill, and
deterministic schedule-only export.

## Static reference findings

- A manager can save the visible saved draft as a named template, optionally removing
  employee assignments so the pattern remains reusable.
- Templates expose name, shift count, open-slot count, creator, updated time, rename,
  delete, and application to an editable week.
- Template application offers merge and overwrite. It enters edit mode first and never
  publishes as a side effect. The old client skips employee conflicts and unavailable
  locations while applying individual mutations.
- Auto-fill is reachable for a saved draft, proposes employees only for open shifts,
  explains ranking, permits per-shift employee replacement or rejection, and reports
  assignments rejected by server revalidation.
- Export supports a published or named-draft source, current location/filter scope,
  a preview summary, reusable output presets, CSV download, and printable layouts.
- The old export implementation also contains scheduled delivery, render-worker PDF,
  XLSX, labels, localization, logos, and legacy options. Those are evidence, not an
  approved dependency or infrastructure contract for the clean product.

These are static-source findings. Old runtime geometry and download files remain
unverified.

## Product decisions

- Add `schedule.templates.manage` and `schedule.export`. Owner, Admin, and Manager
  receive both by default. Template management requires `schedule.read` and
  `schedule.manage`; export requires `schedule.read`.
- Templates are created only from a named saved draft. Dirty session content must be
  saved first. A template stores day offsets and schedule references, never a week.
- Template names are unique per workspace, case-insensitively. Rename and delete are
  explicit audited manager actions.
- Applying a template requires an active edit lease and expected session revision.
  `merge` retains existing session shifts; `overwrite` replaces the session snapshot.
  Application is one transaction. Inactive locations/jobs/shift types fail closed;
  unavailable employee assignments become open slots and are reported.
- Auto-fill operates on the active edit-session snapshot, not a published schedule or
  a detached draft. It considers active employees assigned to both location and job,
  recurring availability, existing overlap, primary job, and current scheduled minutes.
- Auto-fill is deterministic: fewest scheduled minutes, primary job, then stable
  employee ID tie-break. Unavailable or overlapping employees are never proposed.
  Preview returns all eligible candidates so the manager can replace or reject each
  recommendation. Apply revalidates the current session revision and selected pairs.
- Export sources are `published` or a named `draft`. PostgreSQL resolves tenant and
  location scope and emits canonical schedule rows; Fastify renders the files.
- Phase 5D exports deterministic CSV plus printable HTML labelled `Print / Save as PDF`.
  The browser print dialog provides PDF saving without a render worker. Output contains
  date, location, employee/open slot, job, shift type, scheduled start/end, overnight
  marker, and optional schedule note and scheduled-hour total only.
- Export presets store format, layout, time format, note/unassigned/totals visibility,
  and delimiter. Current week, source, and location scope are never frozen into a preset.

## Deliberately omitted

- XLSX generation. The clean repository has no spreadsheet writer; adding one requires
  the separate dependency approval required by the Phase 5 architecture contract.
- Scheduled/email export delivery, render workers, logos, localization, employee codes,
  labels, important dates, and department-partial template application.
- Auto-fill optimization using labor cost, overtime, compliance, seniority, payroll,
  time entries, or AI/LLM services.
- Any automatic publication after template or auto-fill application.

## Verification gate

- Permission grants/dependencies plus employee, cross-tenant, and manager location
  denials.
- Template create/list/rename/delete, assignment stripping, merge/overwrite, stale
  revision, invalid reference, and deterministic round-trip tests.
- Auto-fill candidate eligibility, unavailable/overlap exclusion, deterministic
  ranking, rejection/custom selection, and stale apply tests.
- Export published/draft source parity, scoped row filtering, deterministic CSV fixture,
  safe HTML escaping, preset CRUD, and forbidden-domain field absence.
- Clean database replay, full pgTAP, root gates, API smoke, CSV artifact inspection,
  and desktop/mobile browser UAT.

## Approval boundary

Approval covers Phase 5D only. Phase 6 Lineup and Requests, employee-facing Schedule,
notifications, external services, and new dependencies remain separate decisions.
