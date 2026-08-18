# Phase 8 Communication and Operations Design

Status: approved, implemented, and locally verified on 2026-08-17. Phase 9 requires
separate user approval.

## Scope

Phase 8 adds four connected in-app surfaces:

- a manager Workspace landing dashboard,
- per-user Workspace widget visibility and ordering synced through the database,
- organization-wide or location-targeted announcements,
- a personal notification inbox with unread state and action links.

The Workspace is for owner, admin, and manager access classes. Employee-only users
continue to land in Employee Hub. Announcements and notifications are available to all
active workspace members within their role and location scope.

## Product decisions

- Announcements support draft, scheduled, published, and cancelled states.
- Announcement audience is the intersection of selected workspace roles and locations.
  No selected location means all locations available to the author.
- The server returns explicit `can_edit`, `can_publish`, and `can_cancel` flags.
- Publishing or scheduling creates personal notification rows for the resolved audience.
- Notification state is personal: unread, read, or dismissed. Dismissal does not delete
  the source announcement or another user's notification.
- Workspace widgets use a fixed reviewed catalog. Users may reorder or hide widgets but
  cannot inject arbitrary component names or payloads.
- Operational counts are computed from current schedule and request state. Phase 8 does
  not duplicate those domain records into a task system.

## Security contract

- Every business row carries `workspace_id` and is inaccessible directly to browser roles.
- API services call service-role-only RPCs with the authenticated actor user id and target
  workspace id.
- Every read and mutation resolves a fresh active membership.
- Announcement management requires `announcements.manage`; reads require
  `announcements.read`; notification reads and personal state changes require
  `notifications.read`.
- Location-scoped managers cannot target or inspect locations outside their membership
  scope. Recipients only receive announcements matching their active role and location
  scope.
- Mutations use expected revision checks where stale manager edits could overwrite newer
  state, and security-relevant publication/cancellation actions create audit events.

## Intentionally excluded

- standalone personal task or to-do CRUD,
- email, SMS, WhatsApp, push, or webhook delivery,
- realtime subscriptions and presence,
- inline approval actions inside notification rows,
- payroll, labor, kiosk, time-entry, or compliance notification categories,
- old Newfork UI, endpoint, or database parity where the handoff does not require it.

## Verification contract

- pgTAP covers cross-tenant denial, location targeting, role targeting, personal read
  state, revision guards, and widget preference validation.
- API tests cover authenticated actor forwarding, permission denial, and input validation.
- Web tests cover manager landing, announcement lifecycle controls, notification unread
  behavior, and preference persistence.
- Authenticated local UAT covers owner and employee views at desktop and mobile widths.

## Approval boundary

Approval covers this Phase 8 contract only. Phase 9 public/legal/future placeholders and
any standalone action/task product require separate user approval.
