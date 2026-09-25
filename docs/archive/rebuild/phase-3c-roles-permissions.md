# Phase 3C: Roles And Permissions

## Delivered

- Workspace-scoped built-in roles for Owner, Admin, Manager, and Employee.
- Custom role create, edit, delete, access class, and permission grants.
- Database-resolved effective permissions in the active workspace context.
- One role reference per membership with automatic legacy role backfill.
- Role member counts, protected grants, dependent permission validation, and audit events.
- Responsive Roles & Permissions settings routes for directory, create, and detail states.

## Preserved

- Owner, admin, manager, and employee landing/authority classes.
- Existing owner-only ownership protections and last-owner invariant.
- Existing workspace and location scope on memberships.
- Exact-port application sidebar and calendar behavior.

## Changed And Improved

- Authorization facts now come from workspace role tables instead of only static client mappings.
- Built-in roles are immutable; custom roles cannot receive workspace or role management authority.
- Custom role permission dependencies are validated in shared schemas and Postgres.
- Settings policies continue to use `workspace.manage`, now resolved from the assigned role.
- The role UI is a compact new settings workspace rather than a copy of the legacy workbench.

## Intentionally Omitted

- Member invitation and role assignment UI, which belongs to Phase 4 Employees.
- Multiple simultaneous roles per membership.
- Department and job permission scopes.
- Built-in role overrides.
- Permissions for documents, announcements, payroll, time tracking, kiosk, labor, and compliance.

## Research-Derived Decisions

- The legacy role enum remains as a synchronized landing/authority class while `role_id` is the single effective role assignment.
- Role writes use narrow transactional RPCs with explicit permission checks, locked search paths, validation, and audit records.
- Only shipped product surfaces enter the permission catalog; future domains add permissions with their implementation.

## Verification

- Blank local Supabase reset applied the complete migration chain and seed successfully.
- Four pgTAP suites passed with 67 assertions, including custom-role effectiveness and cross-tenant negative cases.
- Root typecheck, lint, unit tests, and production build passed.
- Authenticated browser smoke covered built-in read-only state, custom role create/edit/delete, permission dependency behavior, and desktop/mobile layouts.
- The existing Vite warning for the approximately 573 kB main JavaScript chunk remains; the Roles page is separately lazy-loaded.
