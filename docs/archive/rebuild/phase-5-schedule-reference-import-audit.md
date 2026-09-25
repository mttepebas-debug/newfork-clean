# Phase 5 Schedule Reference Import Audit

Date: 2026-08-18
Status: reference map verified; implementation decision required before literal import

## User Intent

The requested target is an identical import of the reference app Schedule surface into the clean app, including:

- `/app/schedule` and `/app/schedule/export` using `features/schedule/SchedulePage`.
- `/app/schedule/lineup` using `LineupPage`.
- `/app/schedule/templates` using `ScheduleTemplatesPage`.
- `/app/schedule/requests` using `features/schedule-requests/ShiftSwapsPage`.
- The full frontend Schedule orchestration, grid, top bar, quick editor, drag/drop, clipboard, draft/publish, templates, export, auto-fill, conflict/recovery, logo, filter, and UI store graph.
- The schedule API client boundary.
- The backend schedule route/service graph.
- `packages/scheduling-shared`.
- Required shared schemas and permissions.

## Verified Reference Files

The reference app has the expected Schedule frontend graph under:

- `C:\Users\TheWe\newfork\apps\web\src\features\schedule\SchedulePage.tsx`
- `C:\Users\TheWe\newfork\apps\web\src\features\schedule\components\ScheduleGrid.tsx`
- `C:\Users\TheWe\newfork\apps\web\src\features\schedule\components\ScheduleTopBar.tsx`
- `C:\Users\TheWe\newfork\apps\web\src\features\schedule\api.ts`
- `C:\Users\TheWe\newfork\apps\web\src\features\schedule\store\scheduleUiStore.ts`
- `C:\Users\TheWe\newfork\apps\web\src\features\schedule\hooks\*`
- `C:\Users\TheWe\newfork\apps\web\src\features\schedule\lib\*`

The reference app has the expected backend graph under:

- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\reference.route.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\reference.service.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\shifts.route.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\drafts.route.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\drafts.service.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\edit-lock.route.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\edit-lock.service.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\edit-session.route.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\edit-session.service.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\pending-ops.route.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\pending-ops.service.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\publish.route.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\publish.service.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\publication-status.route.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\publication-status.service.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\templates.route.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\templates.service.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\auto-fill.route.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\auto-fill.service.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\export.route.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\export.service.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\export-schedules.route.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\export-schedules.service.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\export-schedules-cron.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\lineups.route.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\lineups.service.ts`
- `C:\Users\TheWe\newfork\apps\api\src\features\schedule\shift-exchanges.*`

The reference app has the expected shared package:

- `C:\Users\TheWe\newfork\packages\scheduling-shared\src\conflicts.ts`
- `C:\Users\TheWe\newfork\packages\scheduling-shared\src\minutes.ts`
- `C:\Users\TheWe\newfork\packages\scheduling-shared\src\format.ts`
- `C:\Users\TheWe\newfork\packages\scheduling-shared\src\auto-fill.ts`
- `C:\Users\TheWe\newfork\packages\scheduling-shared\src\types.ts`
- `C:\Users\TheWe\newfork\packages\scheduling-shared\src\index.ts`

## Clean App Gap

The clean app does not currently have the same module topology:

- No `apps/web/src/features/schedule/*` tree.
- No `apps/api/src/features/schedule/*` tree.
- No `packages/scheduling-shared` package.
- Current clean Schedule code is concentrated in `apps/web/src/views/SchedulePage.tsx`.
- Current clean Schedule API/data boundary is `apps/web/src/schedule/schedule-data.ts`.
- Current clean backend Schedule code is under `apps/api/src/schedule/*`.

This means a literal identical import is a structural replacement, not a small continuation of the existing Phase 5 implementation.

## Exact Import Blocker

The reference Schedule graph is not isolated to Schedule-only product behavior. It includes old-domain couplings that Phase 5 previously excluded from the clean rebuild:

- `pay_entity_id` in the frontend Schedule API and backend reference/publish/lineup services.
- `unpaid_break_minutes` in shift API payloads, editor UI, grid totals, export, publish, and pending ops.
- `time_entries` joins in publish, publication status, lineups, and week-guard logic.
- `labor_pay_period_locks` in schedule week guard logic.
- UI copy for assignments blocked by labor rules.
- Export and lineup services that depend on payroll/time-entry/pay-entity semantics.

These couplings conflict with the Phase 5 clean boundary that deliberately excluded time clock, breaks, time entries, labor, overtime, payroll, tips, compliance, and jurisdiction behavior.

## Implementation Options

### Option A: Identical Schedule UX, Clean-Domain Port

Port the reference Schedule user experience and Schedule-domain behavior while adapting or removing old-domain couplings:

- Keep the exact Schedule UI surfaces, interactions, DnD, clipboard, draft/publish flow, templates, export surface, auto-fill, dialogs, filters, logo, and grid behavior.
- Introduce `packages/scheduling-shared` as a clean package.
- Rebuild the API route/service structure under the clean app's current Supabase/Postgres architecture.
- Exclude pay-entity, payroll-consumed-week, time-entry lock, unpaid-break, labor-rule, overtime, compliance, and jurisdiction behavior unless those domains are separately approved.

This preserves the clean rebuild boundary and gets closest to identical Schedule product behavior without reintroducing retired domains.

### Option B: Literal Reference Import

Copy the reference graph as-is, including old-domain dependencies:

- Frontend `features/schedule` module topology.
- Backend `features/schedule` route/service topology.
- `packages/scheduling-shared`.
- Shared schemas for shifts, shift types, labels, exports, lineups, settings, shift exchanges, auto-fill, publish preflight, availability, closed days, important dates, locations, and employees.
- Schedule, lineup, employee, and export permissions.
- Payroll/time-entry/pay-entity/labor-lock couplings required by the reference implementation.

This is closest to the phrase "identical", but it reverses prior clean-boundary decisions and materially expands the product surface.

## Recommended Import Order

If Option A is approved:

1. Add `packages/scheduling-shared` adapted to the clean workspace package naming and test setup.
2. Add clean shared Schedule schemas and permissions.
3. Expand clean DB migrations for drafts, pending ops, publications, templates, export presets, auto-fill, lineup, and shift-exchange primitives that are approved for the clean domain.
4. Build backend route/service parity under the clean API architecture.
5. Replace the current concentrated clean Schedule frontend with the reference-style `features/schedule` module graph.
6. Wire router entries and permission gates.
7. Re-run focused unit/API/db tests.
8. Run old/new runtime visual and interaction parity against the same fixture.

If Option B is approved, the first step is to import the full dependency graph and then resolve compile/runtime failures from package naming, Prisma/database architecture, permissions, and old-domain tables.

## Verification So Far

- Reference graph was checked by direct file inventory.
- Old-domain coupling was checked with source search for `pay_entity`, `time_entries`, `unpaid_break`, `labor`, `payroll`, `compliance`, and `jurisdiction`.
- Existing clean Phase 5 local tests were previously run successfully:
  - `pnpm.cmd --filter @newfork/web test -- src/App.test.tsx`
  - `pnpm.cmd --filter @newfork/api test -- src/app.test.ts`
  - `pnpm.cmd --filter @newfork/shared test`
  - Focused Schedule pgTAP suite: 104 tests passed.

## Not Verified

- No source import has been performed from the reference app into the clean app in this audit.
- No old/new runtime visual parity proof has been completed for the full reference Schedule graph.
- No hosted deployment or hosted database proof has been performed.
