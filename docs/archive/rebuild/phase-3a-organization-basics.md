# Phase 3A: Organization Basics

## Delivered

- Organization display-name management with stable workspace identity.
- Location create, edit, archive, and restore with address and IANA time zone.
- Department and job create, edit, archive, and restore with colors and assignment.
- Owner/admin Settings access and tenant-aware database policies.
- Location-scope filtering, cross-tenant foreign keys, and automatic audit events.

## Preserved

- The existing workspace tenant identifier and membership model.
- The exact-port application sidebar and calendar behavior.
- The existing owner/admin `workspace.manage` permission boundary.

## Changed And Improved

- Settings uses a new responsive organization rail rather than copying the legacy UI.
- Records are archived instead of deleted so future schedule and employee references remain stable.
- A department cannot be archived while it still owns active jobs.
- Organization rename updates the active shell without changing tenant identity.

## Intentionally Omitted

- Scheduling settings and shift types.
- Roles and custom permissions.
- Document types and Support.
- Payroll, pay entities, labor, compliance, kiosk, and device management.

## Research-Derived Decisions

- Tenant isolation is enforced in Postgres RLS as well as route visibility.
- Location reads honor membership location scope even though Settings writes remain owner/admin only.
- Tenant IDs are included in relationship foreign keys to prevent cross-tenant references.

## Verification

- Local migration reset completed from a blank database.
- pgTAP: 29 tests passed across workspace and organization RLS suites.
- Root typecheck, lint, unit/component tests, and production build passed.
- Authenticated browser smoke passed for rename, location creation, department/job creation, persisted reordering, and archive guard.
- Desktop and 390 x 844 responsive visual checks passed in dark theme.
