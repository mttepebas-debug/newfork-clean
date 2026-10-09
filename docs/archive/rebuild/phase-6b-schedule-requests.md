# Phase 6B Schedule Requests

Status: implementation and local acceptance completed on 2026-08-17. Phase 7 was
subsequently approved and completed locally.

## Preserved behavior

- `/app/schedule/requests` is a Schedule child page with separate Time off and Shift
  changes tabs and pending counts.
- Time off retains Needs review and Closed queues, status-aware manager review, location and
  search filters, cursor history, deep-linked request focus, and audited viewed state.
- Managers can approve, deny, partially approve immutable date segments, return a closed
  request to pending, and revoke approved time off.
- Shift changes retain release/pickup, direct coverage, and direct swap request types with
  typed participants, source/target published shifts, current ownership, conflict results,
  and chronological activity.
- Hard conflicts block approval. Soft conflicts require a manager reason before approval.
- Stale or already-resolved transitions return a conflict response; the UI refreshes the
  queue and reports that current state replaced the attempted decision.

## Changed or improved behavior

- `schedule.time_off_requests.read/manage` and
  `schedule.shift_change_requests.read/manage` are four independent capabilities. Their
  dependency rules require Schedule read and matching request read access.
- Request, segment, participant, and append-only event tables deny direct authenticated
  access. Service RPCs recheck workspace, capability, and location scope.
- Time off decisions and their audit/domain events commit in one transaction. Partial
  approval requires exactly one decision for every pending segment.
- Shift approval locks the request and referenced published shifts, revalidates ownership
  and conflicts, changes shift ownership only through the dedicated RPC, and records the
  decision event in that transaction.
- Desktop uses a dense master-detail workbench. Mobile keeps the list available until the
  manager selects a request, then opens a full-height review surface with a stable action bar.
- Confirmation dialogs handle destructive and state-reversing actions. Conflict overrides
  make the manager note requirement visible before submission.

## Intentionally omitted

- Employee request creation, cancellation, employee Schedule/Shift Hub, and employee request
  acknowledgement. Those remain Phase 7.
- Notification inbox and email, SMS, WhatsApp, or realtime delivery. Phase 6B records domain
  events only; Phase 8 may consume them.
- Clock state, attendance, time entries, breaks, labor cost, payroll, tips, overtime,
  jurisdiction, and compliance request types.
- Legacy cron workers, automatic manager impersonation of employee request creation, and old
  application component or database reuse.

## Research-derived decisions

- Static old-app source and inventory established the two queues, manager action set,
  conflict visibility, stale refresh, request history, and notification intent. Its page
  composition, hooks, schemas, route implementation, and persistence model were not copied.
- The clean implementation treats request decisions as schedule-domain transitions. Time off
  never creates attendance or payroll records, and shift ownership changes only after current
  publication state is revalidated.

## Verification evidence

- Clean `supabase db reset --local` replay passed through
  `20260821100000_schedule_requests.sql` after final migration edits.
- Focused Schedule Requests pgTAP passed 31 assertions. Full pgTAP passed 14 files and 374
  assertions, including RLS denial, role defaults, location scope, viewed audit, segment
  lifecycle, stale revisions, soft-conflict reason enforcement, atomic ownership change, and
  decision events.
- Root Prettier check, lint, typecheck, tests, and production build passed after the final
  changes. Unit/component totals are shared 25, API 30, web 9, and UI 1.
- Authenticated local owner UAT at 1440px completed partial time-off approval and a reasoned
  soft-conflict shift approval through the real API and database. Database reads confirmed
  revision 2 outcomes and the published shift owner change.
- Browser UAT at 390x844 in light and dark themes verified list-to-detail behavior, a visible
  close control, the fixed decision bar, and body/root widths of exactly 390px. Desktop and
  mobile runs produced no console or page errors.
- Evidence images:
  `phase-6b-requests-desktop-time-off.png`, `phase-6b-requests-desktop-shift.png`,
  `phase-6b-requests-mobile-light.png`, and `phase-6b-requests-mobile-dark.png`.
- The production build retains Vite's advisory warning for the approximately 603 kB main
  chunk.

## Unverified

- Verification is local only. No hosted deployment, hosted migration, notification consumer,
  or hosted authenticated smoke was performed.

Phase 6B is locally complete. Phase 7 later received explicit approval and is recorded in
`phase-7-employee-hub.md`. Phase 8 requires separate approval.
