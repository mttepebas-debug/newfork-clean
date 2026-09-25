# Phase 4A employee directory implementation

Status: implemented and locally verified.

## Delivered

- Active and archived employee directory routes with URL-backed search, status,
  sorting, pagination, and drawer state.
- The exact-port Employee Drawer shell: 880 px desktop width, 236 px section rail,
  six stable sections, direct section links, and a full-width mobile layout.
- Employee profile and assignment editing with revision checks, archive and restore,
  invitation lifecycle controls, access snapshots, and append-only history.
- Privacy-minimal list and detail RPCs with workspace, permission, and location-scope
  enforcement in PostgreSQL.
- Email-bound, hashed, expiring, single-use invitations. Acceptance creates a
  pending-activation membership and does not activate the employee automatically.
- A server-side invitation delivery boundary with Resend support in production and
  a local acceptance URL in development.

## Product boundary

Preserved from the approved exact-port contract:

- Drawer dimensions, section rail, section order, close behavior, and deep-link
  semantics.
- Separate active and archived directory surfaces.

Changed or improved:

- The directory is a dense operational table instead of the legacy cockpit.
- Employee access is split into explicit read, manage, archive, and access-management
  permissions.
- Sensitive data is excluded from directory payloads, and employee access is
  enforced by row-level security and location scope.
- Invitation tokens are never persisted in plaintext.

Intentionally omitted from Phase 4A:

- New-account creation and employee self-service onboarding.
- Private-profile and SSN collection, document upload, acknowledgement execution,
  availability submission, manager review, and activation approval.
- Org chart, import, export, and legacy payroll or compliance behavior.

## Verification record

- Root typecheck, lint, unit tests, and production build pass.
- PostgreSQL migrations reset cleanly and the complete pgTAP suite passes.
- Desktop and mobile browser checks confirm the drawer dimensions, responsive
  section selector, no viewport overflow, and light/dark presentation.

The browser smoke did not exercise authenticated employee CRUD with a real Supabase
session. A development fallback identity cannot call RLS-backed RPCs when Supabase is
configured; database tests cover those authorization paths. Production email delivery
also requires Resend environment configuration.

## Next approval gate

Phase 4B must be discussed and approved before implementing account creation,
self-service onboarding, private employee data, documents, acknowledgements,
availability, review, or activation.
