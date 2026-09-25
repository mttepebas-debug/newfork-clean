# Phase 7 Employee Hub

Status: implementation and local acceptance completed on 2026-08-17. Phase 8 was
subsequently approved and completed locally.

## Preserved

- Employee-only landing at `/app/employee-hub` with next shift and open actions.
- Personal published Schedule with location, job, date, and time context.
- Shift Hub open-shift pickup, release, swap, teammate response, manager approval, request status, and cancellation workflows.
- My Team visibility for employees who share an active location assignment.
- Versioned recurring availability, time-off request status, partial-manager-review compatibility, and employee cancellation.
- Employee Line-up consumption from the latest immutable shared snapshot for assigned locations.
- Exact-port shell and mini-calendar behavior, with employee calendar navigation redirected to Employee Hub Schedule.

## Changed And Improved

- Every Employee Hub RPC derives the employee profile from authenticated actor and workspace context. No employee-owned route accepts a client-supplied employee id.
- Employees see only their own shifts and requests; team visibility is fail-closed to shared active locations.
- Direct swaps require the receiving employee's explicit acceptance before manager approval can succeed.
- Availability changes append a new employee-sourced version and do not rewrite onboarding history.
- Time-off requests persist explicit immutable date segments and reject overlaps at the database boundary.
- Employee-only memberships land on Employee Hub and no longer receive the manager Schedule navigation item.
- Desktop and mobile use the same quiet operational surface with horizontally scrollable route tabs and no document-level mobile overflow.

## Intentionally Omitted

- Time tracking, clock-in/out, breaks, time entries, payroll, labor cost, overtime, tips, jurisdiction, compliance, kiosk, and Device Hub behavior.
- Announcements, notification inbox, email, SMS, WhatsApp, realtime delivery, and workspace dashboard widgets. Those remain Phase 8.
- Private teammate contact details, SSN, onboarding documents, acknowledgement evidence, manager notes, and broad employee-directory data.
- Employee editing of published shifts or Line-up data. Employee Line-up is shared-snapshot read-only.
- Automatic manager approval or bypass of teammate swap consent.

## Research-Derived Ideas

- Two-stage swap consent separates teammate acceptance from manager operational approval.
- Immutable availability versions preserve auditability while allowing future effective-date policy.
- Shared Line-up snapshots prevent employees from seeing unpublished manager edits.
- Request-level shift identifiers let the UI disable duplicate release or pickup actions while the database remains the final duplicate guard.

## Verification

- Clean local Supabase reset applied all migrations through `20260822100000_employee_hub.sql`.
- Focused Employee Hub pgTAP: 23 assertions passed.
- Full database suite: 15 files and 397 assertions passed after the final reset.
- API tests: 33 passed, including authenticated actor forwarding, input validation, and revision-guarded request actions.
- Web tests: 12 passed, including landing focus, open-shift pickup, and explicit time-off date segments.
- Root lint and typecheck passed.
- Production build passed with the existing advisory for a main JavaScript chunk above 500 kB.
- Authenticated local UAT verified employee routing, own published shifts, versioned availability, open-shift pickup, and a two-segment time-off request through the real API and database.
- Desktop dark and mobile dark layouts were inspected at the default viewport and 390 by 844. Mobile document width remained exactly 390 px with no console errors.

## Unverified

- No hosted deployment, hosted migration, hosted authenticated smoke, notification consumer, email delivery, or realtime delivery was performed.
- Browser automation could not populate native date inputs in the in-app browser; the same time-off mutation was verified through an authenticated local API request and database query, while the date form itself is covered by the component test.

## Approval Gate

Phase 8 was subsequently approved and completed. Phase 9 remains a separate approval
gate.
