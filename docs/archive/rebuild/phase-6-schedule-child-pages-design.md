# Phase 6 Schedule child pages design

Status: Phase 6A and Phase 6B implementation and local acceptance completed on 2026-08-17.
Phase 7 was subsequently approved and completed locally; see `phase-7-employee-hub.md`.

## Scope and sequence

Phase 6 is split into two independently verified vertical slices:

1. **Phase 6A: Line-up** at `/app/schedule/lineup`.
2. **Phase 6B: Schedule Requests** at `/app/schedule/requests`.

Phase 6 does not include Employee Hub Schedule, employee request creation, Shift Hub,
My Availability, or employee Line-up. Those remain Phase 7. Notification-center delivery
remains Phase 8.

The old app is static behavioral evidence only. Its component hierarchy, styling, routes,
database tables, and service implementation will not be copied.

## Shared navigation direction

- Schedule gains a compact child-page control: **Schedule**, **Line-up**, and **Requests**.
- The existing exact-port Schedule grid remains visually and behaviorally unchanged.
- Line-up and Requests use the same date/location context where that context is meaningful,
  but each route owns its query parameters and loading/error state.
- The shell remains dense and work-focused. There is no marketing hero, floating page card,
  or nested-card composition.
- Desktop prioritizes scanning and repeated action. Mobile uses a single-column flow with
  drawers/dialogs for detail and actions.

## Phase 6A: Line-up behavior contract

### Preserved behavior

- Daily navigation, Today, location filters, and service/shift-type filters.
- Published Schedule is the canonical source. Line-up edits are an overlay and never mutate
  published shifts.
- Each visible location contains service groups such as lunch and dinner, then configurable
  station sections and employee rows.
- Employee rows retain employee, position, start/end time, labels, station, and stable order.
- Add staff supports search and position filtering and groups candidates into **Off today**,
  **Working elsewhere**, and **Already scheduled here**.
- Candidate rows show location/job eligibility and schedule-conflict context before selection.
- Managers can add a blank row, assign or replace staff, remove a manual row, hide a
  schedule-backed row from the Line-up, reorder rows, and move rows between stations.
- Locations and service/station groups can collapse independently.
- Service briefs preserve 86/out-of-stock, specials, and pre-shift notes.
- Called-off rows are an operational Line-up annotation below active rows and are excluded
  from shared snapshots. They do not create attendance, time-entry, or payroll records.
- Share preview is grouped by location, service, station, and position. Sharing creates an
  immutable versioned snapshot with a diff against the prior version.

### Modern UI direction

- A compact date bar sits above full-width location bands.
- Each location header shows service status, active/shared version, staff/open-row counts,
  collapse control, and Share/Re-share actions.
- Station sections use restrained bordered tables rather than decorative cards. Row controls
  appear on selection or hover and remain keyboard reachable.
- Add staff opens a right-side drawer on desktop and a full-height sheet on mobile. Candidate
  groups remain visible while search and position filters are applied.
- Drag previews show the exact destination station and row. Keyboard Move up/down and Move
  to station commands provide the same result without drag input.
- Share preview is a clean printable surface. Image-copy and external app-specific share
  buttons are not baseline requirements; browser print/download can be proposed later.

### Concurrency and persistence

- Reads are scoped by workspace, selected date, allowed locations, and service filters.
- Line-up rows and briefs use revision checks. A stale write refreshes the affected location
  and preserves the manager's attempted values for retry.
- Reorder and cross-station move are atomic and use stable fractional/order keys or a single
  server-side resequence operation.
- Published schedule changes are visible on refresh without deleting valid manual overlay
  rows. Removed source shifts become explicit orphaned-row review items.
- Share snapshots contain schedule-domain fields only.

### Permissions

- `schedule.lineup.read`: view manager Line-up.
- `schedule.lineup.manage`: edit rows, order, stations, and briefs; requires Line-up read and
  Schedule read.
- `schedule.lineup.share`: create a share snapshot; requires Line-up read.

Owner and Admin receive all. Manager defaults receive all three. Employees receive none in
Phase 6; employee consumption is designed separately in Phase 7.

## Phase 6B: Schedule Requests behavior contract

### Preserved behavior

- Two primary tabs: **Time off** and **Shift changes**, each with a pending count.
- Time off has **Needs review** and **Closed** queues, status/location/type/search filters,
  cursor history, deep-linked request focus, and audited viewed state.
- Managers can approve, deny, partially approve real pending date segments, return an
  approved request to pending, and revoke when lifecycle rules permit.
- Shift changes unify release/pickup, direct coverage, and direct swap requests while keeping
  their request type visible.
- Shift-change review shows current shift ownership, participants, requested outcome,
  activity/history, and schedule conflicts.
- Hard conflicts block approval. Soft conflicts require a manager reason.
- Approve/reject actions are atomic, audited, location-scoped, and revision guarded.
- A stale or already-resolved transition refreshes the queue and displays a specific inline
  result instead of leaving optimistic state behind.
- Manager notification intent is recorded with the decision as a domain event. Phase 8 may
  deliver it; Phase 6 does not build a notification center or external delivery service.

### Modern UI direction

- Desktop uses a dense master-detail layout: queue/table on the left, sticky review panel on
  the right. Mobile uses a list and full-height review drawer.
- The route header contains tab counts, queue state, search, and compact filter menus.
- Time-off rows foreground employee, date range, segment count, request age, status, and
  conflict count.
- Shift-change rows foreground request type, giving/receiving employees, shift facts, and
  blocker severity. The detail panel uses a simple before/after assignment diagram.
- Decisions remain in the detail panel. Destructive or state-reversing actions require a
  confirmation surface; partial approval exposes one control per pending segment.
- History and audit events are chronological and visually secondary to the pending decision.

### Lifecycle and data boundaries

- Time-off requests consist of a request plus immutable date segments and append-only events.
- Shift-change requests consist of a request, typed participants, source/target published
  shift references, current revision, and append-only events.
- Manager approval revalidates publication state, employee assignment, location scope,
  availability, overlap, and approved time off in one transaction.
- Approval may update published shift ownership only through a dedicated audited transition;
  it never mutates draft or Line-up snapshot history.
- Phase 6B may seed requests for verification, but no manager-only endpoint will impersonate
  employee request creation.

### Permissions

- `schedule.time_off_requests.read` and `schedule.time_off_requests.manage`.
- `schedule.shift_change_requests.read` and `schedule.shift_change_requests.manage`.
- Each manage permission requires its matching read permission plus Schedule read.

Owner and Admin receive all. Manager defaults receive all four. Custom roles can grant Time
off and Shift changes independently.

## Intentionally omitted

- Clock status, clock-in/out, breaks, attendance, time entries, labor cost, overtime,
  payroll, tips, jurisdiction, and compliance logic.
- Employee request creation and employee Line-up acknowledgement UI before Phase 7.
- Notification inbox, email/SMS/WhatsApp delivery, scheduled pulses, and realtime messaging
  before the relevant later phase.
- Legacy cron workers, external image sharing, and old app styling.
- Department-partial Schedule mutation or any Line-up action that silently edits published
  Schedule.

## Verification contract

Each slice requires:

- shared schema and permission dependency tests,
- clean migration replay and tenant/location RLS negative tests,
- focused service transition and stale revision tests,
- API capability-denial and payload-forwarding tests,
- desktop and 390x844 browser UAT in light and dark themes,
- keyboard operation for every drag-only or row-only action,
- live authenticated smoke with post-smoke database reset,
- root format, typecheck, lint, test, and production build gates.

## Approval checkpoint

Phase 6A and Phase 6B were approved and reviewed as separate implementation slices. Phase 7
was later approved and completed. Phase 8 remains a separate approval gate.
