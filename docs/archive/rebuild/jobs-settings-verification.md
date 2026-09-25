# Jobs and organization settings verification

Date: 2026-09-08. Scope: local checkout and local Supabase only.

## Delivered

- All / Departments / Jobs catalog views, URL filters, distinct assignment counts, column sorting and canonical manual ordering.
- One Add menu in All; atomic department creation with multiple jobs; multiple jobs from an existing department and its editor.
- Compact shared forms, Enter-to-add, Escape discard, tab-change dismissal and requested removal of row selection rings.
- Paginated job employee drawer, persistent assignment drafts, revision conflict handling, atomic saves and confirmed job deletion. The bulk actions dropdown was removed following the later request.
- Deleting a job ends its employee assignments and preserves historical shifts. Employees may have no remaining job; scheduling groups them under Unassigned job. Normal employee drawer validation remains separate.
- Locations list and forms, Shift Label forms and Shift Type forms share the catalog typography, controls and responsive layout.
- Shift types and shift labels now live in one Scheduling Catalog page with top tabs; both legacy URLs open the matching tab and the Settings rail exposes one Shift catalog entry.
- Sidebar calendar removed; Schedule topbar calendar retained.

## Automated checks

| Check | Result |
| --- | --- |
| Jobs department/assignment database suite | 61 passed |
| Function execute privilege database suite | 3 passed |
| New jobs API and existing organization route suites | 18 passed |
| Jobs management, Shift Types, Shift Labels and settings alignment web suites | 22 passed |
| Schedule grid and employee sort suites | 17 passed |
| Authenticated shell and sidebar navigation integration cases | 2 passed; other 56 App cases not run |
| API and web typechecks | Passed |
| Focused settings ESLint and diff whitespace checks | Passed |

The two App integration cases require VITE_ALLOW_DEVELOPMENT_IDENTITY=true in the test process; local runtime configuration was not changed. The old Weekly view text assertion now checks the displayed date range.

Database coverage includes all-or-nothing validation, 125 employee targets, primary reassignment, removal of a final job, retry no-ops, stale revisions, authorization, direct deletion-state bypass prevention, preservation of location assignments and complete published shift records.

## Browser and independent review

- Jobs views and editors inspected at 1440px, 1024px and 390px; independent review included light/dark desktop and mobile drawer states.
- Locations inspected at desktop and 390px, including its new form. Shift Label and Shift Type forms checked at 390px. No horizontal overflow in checked states.
- Department names sorted ascending and descending on mobile; viewport and document width both 390px.
- Enter/Add department creation and existing-department multi-job flow exercised.
- A temporary 125-employee dataset verified all three pages and draft survival across page changes. A stale deleted target rejected save while retaining the draft. A fresh temporary job was then assigned successfully and deleted through the UI; database checks confirmed detachment.
- All temporary employees, jobs, department and related test history were cleaned up. Verification tabs were closed and viewport overrides reset.
- Independent visual and source reviews completed; reported contrast, Escape handling, deletion bypass and assignment locking issues were addressed. Final source review reported no remaining actionable finding.

## Release boundary

The new migration was applied and tested locally. No hosted database migration, deployment, full-repository test run or production verification was performed.

## Catalog deletion and visual follow-up (2026-09-08)

- Shift types, shift labels, locations, jobs and departments now share an inline Delete action in their existing editors. The first click reveals a compact confirmation; Keep or Escape cancels it without losing the edit draft. Confirmation locks competing saves and preserves API errors for retry.
- Department confirmation asks whether to move jobs to No department or delete them with their employee assignments. Location deletion removes current assignments and permits employees to have no location. Historical shifts and foreign keys remain intact.
- Shift catalog rows use the Jobs catalog structure, name/time sorting, search and row menus. Catalog tabs reuse Requests tab styling. Escape suppresses focus decoration without removing actual focus; the next keyboard interaction restores keyboard cues.
- Local migration `20260909041000_catalog_entity_deletion.sql` was applied and recorded in local migration history. Local security advisors reported no issues.
- Database: 95 passing checks across catalog deletion (31), existing jobs/department bulk assignments (61) and function privileges (3). This includes atomic rollback, stale writes, authorization, retry no-ops, primary location replacement and complete published-shift preservation.
- API: 14 focused jobs-management route checks passed. Web: 37 focused checks passed across Jobs management, Shift Types, Shift Labels, settings navigation, inline deletion and Escape focus behavior. API/web typechecks and focused web ESLint passed.
- Browser: all five editor deletion entry points inspected without confirming deletion of real data. Mobile department/location/label confirmations and the 1024px job drawer were checked. Catalog tab font, weight, color, border and padding were compared with Requests. Escape cancellation and absence of the return-focus ring were verified.
- This follow-up is local verification only; no hosted migration or deployment was performed.
