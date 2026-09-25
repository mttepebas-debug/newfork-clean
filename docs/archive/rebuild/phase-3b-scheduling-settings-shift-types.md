# Phase 3B: Scheduling Settings And Shift Types

## Delivered

- Workspace week-start and schedule publication deadline settings.
- Schedule conflict policy with warn and block modes.
- Availability enforcement with soft and hard modes.
- Shift type create, edit, archive, restore, color, default times, and manual ordering.
- Derived overnight state when a shift type ends on the following day.
- Tenant RLS, owner/admin writes, manager denial, cross-tenant isolation, and audit events.

## Preserved

- Week-relative schedule behavior remains driven by workspace settings.
- Conflict and availability policy remain explicit runtime controls.
- Shift types remain reusable schedule references with stable IDs.

## Changed And Improved

- Scheduling rules use a compact new settings form rather than the legacy layout.
- Conflict checks cannot be disabled completely; organizations choose warn or block.
- Shift type names are unique per active workspace catalog.
- Start and end times must be paired and cannot be equal.

## Intentionally Omitted

- Hour credit and hour-computation fields.
- Trainee-period configuration.
- Payroll, labor, overtime, break, kiosk, and compliance settings.
- Employee availability self-service controls, which belong with the employee domain.

## Research-Derived Decisions

- New workspaces receive scheduling defaults automatically at the database boundary.
- Reordering requires the complete active shift-type set and runs transactionally.
- Overnight state is derived by Postgres instead of trusting browser input.

## Verification

- Local migration reset completed from a blank database.
- pgTAP: 46 tests passed across three RLS suites.
- Root typecheck, lint, unit/component tests, and production build passed.
- Authenticated browser smoke passed for scheduling save, shift-type CRUD, reorder, archive, and restore.
- Desktop and 390 x 844 responsive visual checks passed in dark theme.
