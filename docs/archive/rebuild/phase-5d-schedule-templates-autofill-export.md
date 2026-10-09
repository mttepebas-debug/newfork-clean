# Phase 5D Schedule templates, auto-fill, and export

Status: implemented and locally verified on 2026-08-17. Phase 6 has not started.

## Preserved behavior

- Managers can create reusable Schedule templates from named drafts, optionally strip
  employee assignments, rename and delete templates, and apply a template to an active
  working copy using merge or overwrite mode.
- Auto-fill remains a reviewed manager action. It proposes eligible employees for open
  shifts, permits per-shift candidate changes or rejection, and revalidates every accepted
  assignment when applied.
- Schedule export supports published or named-draft sources, explicit location scope,
  weekly or daily layout, 12/24-hour time, open-shift, note, and scheduled-hours controls,
  plus reusable settings presets.
- Export output is deterministic CSV or printable HTML labelled `Print / Save as PDF`.

## Changed or improved behavior

- Templates are whole-week, named-draft snapshots rather than department-fragment
  mutations. Invalid preserved assignments become open slots during apply and are counted.
- Auto-fill selection is deterministic: eligible candidates are ordered by least scheduled
  minutes, primary-job preference, then stable employee ID. Preview fingerprints and
  session revisions prevent stale application.
- Export presets store settings only. They never retain schedule rows or employee data.
- Separate `schedule.templates.manage` and `schedule.export` capabilities are enforced in
  shared role validation, API routes, service RPCs, and database grants.
- Direct authenticated table access is denied; all mutations run through scoped service
  RPCs with RLS and audit events.

## Intentionally omitted

- Native XLSX files are omitted because no spreadsheet renderer dependency was approved.
- Scheduled/email exports, render workers, logos, localization, and custom payroll or labor
  columns are omitted.
- Department-partial template apply and unreviewed one-click auto-fill are omitted.
- Lineup, Requests, employee-facing Schedule, and notifications remain Phase 6 decisions.

## Research-derived decisions

- Static old-app archaeology confirmed strip-assignment templates, merge/overwrite apply,
  candidate replacement/rejection, and CSV/PDF/XLSX export concepts. Only schedule-domain
  behavior was retained; old implementation architecture was not copied.
- Printable HTML provides a dependency-free browser print/PDF path while preserving a
  deterministic server-rendered artifact.

## Verification evidence

- Clean `supabase db reset --local` replay passed through migration
  `20260819150000_schedule_templates_autofill_export.sql` before and after live UAT.
- Focused Phase 5D pgTAP: 42 assertions passed. Full pgTAP: 12 files and 308 assertions
  passed.
- Root `typecheck`, `lint`, `test`, and production `build` passed separately. Unit/component
  totals include shared 24, API 25, web 8, and UI 1 tests.
- Focused export tests cover UTF-8 BOM and CRLF CSV, delimiter/quote/newline escaping,
  open-shift filtering, HTML escaping, and daily print sections.
- Authenticated API smoke created a 7-shift open template, applied it to a blank session,
  proposed and applied 5 assignments with zero rejections, exported 7 rows, verified a
  64-character fingerprint and CSV content type, found zero payroll/wage/SSN/compliance
  fields, and exercised preset persistence.
- Browser UAT verified template management, published export preview, blank-session template
  apply, and auto-fill review in the local app. At 390x844, export and auto-fill dialogs had
  no horizontal overflow; desktop dark-theme screenshots were also inspected.
- The production build reports the existing Vite warning that the main application chunk is
  above 500 kB. The build succeeds; bundle optimization is not a Phase 5D blocker.

## Evidence boundary

- Old-app behavior was researched from static source only. The old runtime was not executed,
  so complete visual and behavioral parity with that runtime remains unverified.
- Verification is local. No hosted deployment, hosted database migration, or authenticated
  hosted smoke was performed.

Stop after Phase 5D. Phase 6 requires a separate user decision before design or implementation.
