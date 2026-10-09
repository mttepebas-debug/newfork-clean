# BL-063 Toast Inventory and Standard

Date: 2026-09-11
Scope: short-lived in-app toast notifications only. Notification inbox, producer catalog, outbox/relay, Resend delivery, and email templates are out of scope.

## Standard

- Visual direction: B tinted. Toasts use a lightly tinted severity surface, stronger icon badge, clear close button, and compact title/description copy.
- Placement and stacking: bottom-center, three visible toasts.
- Durations: success 4s, info 6s, warning 10s, error 14s, action 12s.
- Dedupe: callers can pass `dedupeKey`; otherwise the facade dedupes the same type, title, and description for two seconds.
- Copy shape: title is the short result or blocker; description carries the reason, next action, or affected object.

## Producers Reviewed

| Surface | Producers | BL-063 action |
|---|---|---|
| Shared UI | `packages/ui/src/lib/use-toast.ts`, `packages/ui/src/components/Toaster.tsx` | Centralized durations, dismissible behavior, stacking limit, and dedupe behavior. |
| Schedule page | Draft delete, edit save failure, copy/paste, undo/restore, paste blocked, preset unavailable, publish/unpublish, template save/rename/delete/apply | Standardized title/description copy and added dedupe keys for repeated schedule events. |
| Schedule hooks | Cascade notice, drop review warnings/errors, drag controller blocked drops | Standardized repeated warning/error/info toasts and added dedupe keys. |
| Schedule dialogs/editors | Publish availability refresh, quick editor validation/availability warnings | Standardized validation and warning copy without changing scheduling decisions. |
| Line Up | `LineupEditor`, `LineupQueue` availability warnings | Standardized warning copy and dedupe keys. |
| Schedule templates page | Rename/delete success and delete error | Standardized title/description copy and dedupe keys. |
| Invite/EmployeeDrawer | EmployeeDrawer invite/retry/revoke, AcceptInvitationPage, PendingInvitationsPage | No new toast added. These flows currently use inline persistent status/error states; delivery/Resend behavior was not refactored. |

## Validation Boundary

Focused local tests should cover the shared toast facade, affected Schedule toast tests, Line Up warning tests, and EmployeeDrawer invite tests. Browser UAT should confirm visual style, close button, stacking limit, dedupe, and that invite flows still rely on their existing inline feedback.
