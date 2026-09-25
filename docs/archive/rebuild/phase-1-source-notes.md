# Phase 1 source notes

Evidence boundary: these notes come from static, read-only inspection of
`C:\Users\TheWe\newfork`. They are not runtime or visual parity proof.

## Exact-port source map

- App shell and left navigation: `apps/web/src/routes/dashboard.tsx`. The shell uses a
  fixed-height viewport, a 64px collapsed rail, an expanded sidebar, permission-filtered
  navigation, and a footer area.
- Sidebar calendar controller: `apps/web/src/components/DashboardSidebarCalendar.tsx`.
  It has a collapsed icon state, an expanded date control, current-period jump behavior,
  and lazy marker queries while the panel is open.
- Calendar frame: `apps/web/src/components/ScheduleMiniCalendar.tsx`, wrapping the shared
  schedule mini calendar at 264px width.
- Schedule vertical slice: `apps/web/src/features/schedule/SchedulePage.tsx` and
  `apps/web/src/features/schedule/components/ScheduleGrid.tsx`.
- Employee drawer shell: `apps/web/src/features/employees/EmployeeDrawer.tsx`.

## Phase 1 decision

This phase ports only the app-shell interaction contract needed to host authenticated
routes. The complete calendar data behavior, Schedule vertical slice, and Employee Drawer
remain deferred until their approved implementation phases and require screenshot-based
parity proof.

No payroll, compliance, time-entry, kiosk, pay-entity, labor-law, overtime, break, or
jurisdiction implementation was imported.
