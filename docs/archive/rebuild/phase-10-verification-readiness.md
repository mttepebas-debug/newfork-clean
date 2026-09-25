# Phase 10 Verification And Readiness

Status: local verification completed on 2026-08-17 with one exact-port exception and
hosted/deployment evidence still open. No post-Phase-10 domain is approved.

## Acceptance Matrix

| Area                             | Result             | Evidence boundary                                                                                                                                                                              |
| -------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routes and role visibility       | Pass               | Real local Supabase sessions for owner, admin, manager, and employee; route tests cover direct denial paths.                                                                                   |
| Tenant and database isolation    | Pass locally       | Clean local reset, RLS enabled on every public table, and 16 pgTAP files with 420 assertions. No hosted database claim.                                                                        |
| Forbidden legacy domains         | Pass               | Static source scan plus live local schema inspection found no executable payroll, time-entry, kiosk, labor-law, pay-entity, or compliance domain.                                              |
| Sidebar and calendar exact-port  | Pass structurally  | Desktop, collapsed, mobile, date navigation, view switching, and calendar expansion were exercised.                                                                                            |
| Employee Drawer shell exact-port | Pass structurally  | The 880 px desktop drawer, split layout, six-tab shell, actions, and responsive behavior match the approved reference contract.                                                                |
| Main Schedule exact-port         | Partial            | Core weekly grid, employee rows, unassigned row, controls, publication, export, and responsive containment work. Full visual and interaction parity against a live old runtime was not proved. |
| Accessibility sanity             | Pass locally       | Semantic snapshots, full accessibility tree, names, headings, duplicate IDs, keyboard-visible controls, and overflow were inspected. This is not a formal WCAG audit.                          |
| Responsive sanity                | Pass locally       | Desktop and 390 by 844 mobile checks covered Schedule, Employee Drawer, Employee Hub, and all public trust routes. Wide operational surfaces scroll inside their owning region.                |
| Performance sanity               | Pass with advisory | Local production build and loopback navigation are responsive. The main JavaScript chunk is 622.57 kB minified and 177.80 kB gzip, above Vite's 500 kB advisory.                               |
| Production readiness             | Unverified         | No hosted deployment, production KMS, storage, email, realtime, observability, authenticated hosted smoke, or production legal review was performed.                                           |

## Route And Role Evidence

- The application declares 42 route elements across 37 explicit path patterns.
- Owner exercised 20 authenticated routes with expected headings and no rendered alerts.
- Employee exercised 11 allowed routes. Direct access to Workspace, Schedule, Employees,
  and Settings redirected to Employee Hub.
- Manager exercised 11 allowed routes. Settings routes redirected to Workspace.
- Admin landed on Workspace, retained Settings visibility, and opened General Settings.
- Five public trust routes and both invitation aliases rendered without authentication.
- Production preview at `127.0.0.1:4174` used the built assets, authenticated the seeded
  owner against local Supabase, and loaded Workspace through the API.

The route audit found and fixed a policy gap: permission checks alone allowed an employee
with manager-shaped permissions to enter manager surfaces. `PermissionRoute` now supports
an explicit role allowlist, and Schedule and Workspace require owner, admin, or manager.

## Database And Scope Evidence

- `supabase:reset` applied every migration and the synthetic seed from a clean local state.
- All 420 pgTAP assertions passed across 16 files.
- The live local schema contained no forbidden relation or function and no public table
  without RLS.
- Temporary manager/admin UAT identities were removed by the final reset.
- Future time entries, employee tracking, kiosk, payroll, pay entity, and compliance remain
  documented blank-slate domains and were not implemented.

## Visual Evidence

- [Schedule desktop dark](phase-10-schedule-desktop.png)
- [Schedule desktop light](phase-10-schedule-desktop-light.png)
- [Schedule collapsed sidebar](phase-10-schedule-collapsed.png)
- [Employee Drawer](phase-10-employee-drawer.png)
- [Schedule mobile](phase-10-schedule-mobile.png)
- [Employee Hub mobile](phase-10-employee-hub-mobile.png)

The old application was used only through approved static source and reference screenshots.
It was not started or treated as a runtime dependency. Therefore the Schedule result is
structural and behavioral evidence, not a claim of pixel-identical or complete live parity.

## Quality Gates

- Root tests: 88 passed: shared 25, API 37, web 25, and UI 1.
- Database tests: 16 files and 420 assertions passed after the final clean reset.
- Root Prettier, lint, typecheck, and production build passed.
- The API health response reports `phase-10`.
- The final production build retains the 622.57 kB main-chunk advisory recorded above.

## Preserved

- The old app remains read-only optional reference material.
- Existing onboarding, account, employee, scheduling, communication, and public trust
  behavior remains in scope.
- Sidebar, calendar, main Schedule, and Employee Drawer shell retain their exact-port
  ownership boundary.

## Changed And Improved

- Added explicit role gates to protected manager surfaces and regression tests for employee
  direct navigation.
- Advanced shared and API health contracts to `phase-10`.
- Added repeatable route, role, schema, accessibility, responsive, performance, and visual
  acceptance evidence.

## Intentionally Omitted

- No forbidden legacy domain, billing, payment, marketing expansion, production provider,
  or blank-slate future domain was added.
- No visual rewrite was made to hide the remaining Schedule parity exception.
- No hosted or regulatory readiness claim is inferred from local green gates.

## Readiness Decision

The clean rebuild is locally functional and suitable as the base for a separately approved
next phase. Phase 10 is not a full production release certificate: strict Schedule visual
and live-old-runtime parity, hosted infrastructure proof, and formal accessibility/legal
reviews remain open. Any next phase requires explicit user approval.
