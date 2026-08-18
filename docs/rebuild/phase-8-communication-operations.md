# Phase 8 Communication and Operations

Status: implementation and local acceptance completed on 2026-08-17. Phase 9 was
subsequently approved and completed locally.

## Preserved

- Owner, admin, and manager users land on the operational Workspace; employee-only users
  continue to land on Employee Hub.
- Existing schedule, request, location, role, and membership records remain authoritative.
  Workspace counts and communication targeting read those records instead of duplicating
  them into a task model.
- The exact-port shell, mini-calendar, role-aware navigation, and account routes remain in
  place.

## Changed And Improved

- Workspace provides current schedule/request counts, active announcements, personal
  notifications, quick actions, and a database-synced fixed widget layout.
- Announcements support draft, scheduled, published, and cancelled states with role and
  location targeting, revision guards, server-derived control flags, and audit events.
- Publishing resolves recipients on the server and creates durable personal notification
  rows. Read, unread, dismiss, category filtering, cursor pagination, and unread badges are
  per user.
- Browser roles cannot read communication tables or invoke service RPCs directly. The API
  forwards the authenticated actor id and each RPC revalidates active membership,
  permission, and location scope.
- `list_my_workspaces()` now returns `false` rather than `null` when an active member has
  not selected a preferred workspace, preserving the boolean API contract for invited or
  newly activated users.
- Communication pages are lazy-loaded and use React Query for shared request deduplication
  and cache invalidation.

## Intentionally Omitted

- Standalone tasks, to-dos, assignments, due dates, and task automation.
- Email, SMS, WhatsApp, push, webhook, realtime, and presence delivery.
- Inline approval actions inside notifications.
- Payroll, labor, kiosk, time-entry, tip, overtime, jurisdiction, and compliance categories.
- Old Newfork visual, endpoint, or schema parity beyond the approved exact-port surfaces.

## Research-Derived Ideas

- A fixed widget catalog keeps personalization useful without turning stored preferences
  into arbitrary component execution.
- Server-side audience resolution makes publication deterministic and prevents clients
  from supplying recipient user ids.
- Durable personal inbox rows decouple announcement publication from future delivery
  channels while preserving independent read state.
- A local React best-practices review reinforced route-level code splitting, unconditional
  hooks, shared query caching, and memoized list derivation.

## Verification

- Clean local Supabase reset applied all migrations through
  `20260823100000_communication_operations.sql`.
- Focused communication pgTAP: 23 assertions passed.
- Full database suite: 16 files and 420 assertions passed after the final migration fix.
- Shared, API, web, and UI tests: 78 passed in total.
- Root lint, typecheck, Prettier check, and production build passed.
- Production build keeps the existing 620.96 kB main JavaScript chunk advisory; Workspace,
  Notifications, and Announcements are separate lazy chunks between 6.04 and 9.59 kB.
- Authenticated local desktop UAT verified owner Workspace routing and layout persistence,
  targeted announcement draft/publication, employee announcement visibility, unread badge,
  notification inbox, and personal read state through the real API and database.
- Workspace, Announcements, and Notifications were visually inspected at 390 by 844. Each
  retained a 390 px document width, no visible element overflow, and no console errors.

## Unverified

- No hosted deployment, hosted migration, hosted authenticated smoke, external delivery
  provider, realtime subscription, or production observability verification was performed.
- Scheduled announcements are covered by database/API contracts and automated tests but
  were not held open until a future wall-clock publish time during browser UAT.

## Approval Gate

Phase 9 was subsequently approved and completed. Phase 10 remains a separate approval
gate.
