# Phase 5B Schedule editing design

Status: approved and implemented locally on 2026-08-17. See
`phase-5b-schedule-editing.md` for delivered behavior and verification evidence.

## Objective

Add the approved Schedule editing vertical slice without weakening the read-only
publication model delivered in Phase 5A. Managers must be able to enter edit mode,
work from published, blank, or saved-draft content, modify shifts, save or discard
their work, and receive deterministic stale-session and concurrent-editor outcomes.

This phase does not publish schedules. Phase 5C remains the only publication path.

## Static reference findings

The old Schedule source shows that editing is one connected workflow:

- Edit mode begins from a blank week, a named draft, or a working copy of the
  published schedule.
- One manager holds a week-level edit lease. Other managers can continue viewing,
  retry after release, or encounter stale-session cleanup/takeover behavior.
- The client heartbeats the lease, warns after three minutes of inactivity, offers
  Save or Continue for 15 seconds, and attempts to preserve work before timeout.
- Shift create, edit, move, copy, paste, delete, restore, selection, context menus,
  and pointer drag all operate inside the active edit session.
- Save, Save As, explicit overwrite, and Discard are distinct actions. Duplicate
  names do not overwrite silently.
- Shift writes use stale-write protection and keep dirty edits visible when a
  server row changes or disappears.

This is static source evidence. Old runtime interaction timing and geometry remain
unverified until a stable reference runtime is captured.

## Product decisions

- Manager receives `schedule.manage` by default, subject to existing location
  scope. Owner and Admin receive it globally. Employee receives neither manager
  read nor manage access.
- The edit lease is week-level, matching the visible multi-location editing
  surface. A scoped manager can edit only shifts in assigned locations even while
  the lease covers the week.
- Editing published content creates an isolated working copy. Published rows are
  never mutated by Phase 5B.
- A blank session starts empty. A saved-draft session starts from that draft's
  current revision. A published session starts from the current publication
  snapshot.
- Save updates the active named draft only when its expected revision still
  matches. Save As creates a new unique name. Overwrite requires the explicit
  target draft and expected target revision.
- Closing a dirty editor requires Save or Discard. Navigation and browser unload
  attempt lease release but are not treated as save proof.
- Phase 5B displays availability, closure, and overlap warnings but does not add
  override or publish decisions. Those remain Phase 5C.

## Clean persistence model

### `schedule_drafts`

- Workspace, week start, normalized unique name, revision, creator/updater,
  timestamps, and archived timestamp.
- No publication status or live-shift ownership.
- Case-insensitive active-name uniqueness per workspace and week.

### `schedule_draft_shifts`

- Saved snapshot rows belonging to one draft.
- Stable shift identity plus location, employee, job, optional shift type,
  business date, times, overnight flag, note, and row revision.
- Referential and workspace consistency enforced in PostgreSQL.

### `schedule_edit_sessions`

- Opaque session ID, workspace, week, source kind and source ID/revision, holder,
  heartbeat, expiry, session revision, dirty flag, and terminal status.
- At most one active, non-expired session per workspace/week.
- Expired sessions cannot mutate. Acquisition/takeover serializes on the same
  workspace/week key.

### `schedule_edit_session_shifts`

- Full working snapshot copied when a session is acquired.
- Mutations update this snapshot and increment both row and session revisions.
- Save atomically validates lease, source/target revision, and scope before replacing
  the target draft snapshot. Discard removes the working snapshot and closes the
  session.

The full working snapshot replaces the old pending-operation replay design. It keeps
Save and Discard semantics while reducing create/update/delete collapse rules and
partial replay failure modes.

## Transaction invariants

- Every mutation requires actor ID, workspace ID, session ID, expected session
  revision, and expected row revision where applicable.
- The actor must hold an unexpired lease and `schedule.manage`; every affected
  location must be within actor scope.
- Mutation dates must stay inside the session week.
- Employee, job, shift type, and location references must belong to the workspace
  and be active or historically valid for the copied source row.
- Create requests use an idempotency key scoped to the edit session.
- Save and overwrite lock the session and target draft, reject stale revisions, and
  replace the target snapshot in one transaction.
- Takeover first preserves a dirty stale session as a uniquely named recovery draft
  when possible, then closes the stale session and grants a new lease. A recovery
  failure blocks takeover rather than dropping work silently.
- Heartbeat extends only the holder's current active lease. Release never saves.
- Direct authenticated table writes remain denied; service-role RPCs are the only
  mutation boundary.

## API contract

- `GET /v1/workspaces/:workspaceId/schedule/drafts?week_start=...`
- `POST /v1/workspaces/:workspaceId/schedule/edit-sessions`
- `PATCH /v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId/heartbeat`
- `POST /v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId/takeover`
- `POST /v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId/save`
- `DELETE /v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId`
- `POST /v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId/shifts`
- `PATCH /v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId/shifts/:shiftId`
- `DELETE /v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId/shifts/:shiftId`
- `POST /v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId/shifts/bulk-delete`

The edit-session read model returns the same references as Phase 5A plus draft
metadata, lease state, session revision, and working shifts. API errors use stable
codes for `lease_conflict`, `lease_expired`, `session_revision_stale`,
`shift_revision_stale`, `draft_name_conflict`, `draft_revision_stale`, and
`location_scope_denied`.

## UI contract

- Add a clear Edit action to the published Schedule toolbar.
- Enter Edit presents Start blank and saved drafts with updater/time metadata.
- Edit mode has a persistent draft/session banner, Save, Save As, and Discard.
- Clicking an empty cell opens create; clicking a shift opens edit.
- The shift editor includes employee/open shift, location, date, job, shift type,
  start/end time, overnight state, and note.
- Shift context actions include Edit, Copy, and Delete. Empty-cell actions include
  Paste and eligible shift-type presets.
- Pointer drag moves a shift across eligible employee/location/date cells. A click
  and keyboard path remains available for the same move; drag is not the only path.
- Shift-click selection enables bulk delete. Escape dismisses one active interaction
  layer at a time before leaving edit mode.
- Stale row and vanished-row states preserve the user's form values and require an
  explicit reload/discard decision.
- Lease conflict identifies the holder and last activity, with View schedule and
  Try again actions. Takeover appears only after server-declared expiry.
- After three idle minutes, show the 15-second Save/Continue warning. If the client
  disappears, the next acquisition/takeover performs server-side recovery handling.

No publish, unpublish, Save and publish, hard-blocker override, template, auto-fill,
or export controls are added in this phase.

## Implementation order

1. Add shared draft, lease, edit-session, mutation, and stable-error schemas.
2. Add permissions and the four-table persistence model with service-only RPCs.
3. Add tenant, location, stale-revision, idempotency, save/discard, timeout, recovery,
   and two-session pgTAP coverage.
4. Add Fastify draft/session/shift routes and focused authorization tests.
5. Split the Schedule route into read model, edit-session controller, grid, shift
   editor, context menu, selection, and pointer-drag modules.
6. Add unit tests for reducer/state transitions, save naming, keyboard dismissal,
   copy/paste, drag/drop, and stale responses.
7. Run clean migration replay, full pgTAP, root gates, and two-browser-session UAT.

## Verification gate

Phase 5B is complete only with evidence for:

- owner/admin/manager grants and employee/cross-tenant/location denials,
- blank, published-copy, and named-draft acquisition,
- concurrent acquisition conflict, heartbeat, expiry, recovery, and takeover,
- create/edit/move/copy/paste/delete/bulk-delete behavior,
- Save, Save As, overwrite confirmation, duplicate-name denial, and Discard,
- stale session, stale shift, and stale draft rejection,
- reload recovery and dirty-close protection,
- desktop/mobile layout and keyboard-accessible alternatives,
- no mutation to Phase 5A published tables,
- no payroll, labor, overtime, time-entry, tips, or compliance fields.

Old/new runtime comparison remains required before complete exact-port parity can be
claimed.

## Approval gate

Approval authorizes Phase 5B implementation only. It does not authorize Phase 5C
publishing/blockers or Phase 5D templates/export. No new dependency or external
service is proposed.
