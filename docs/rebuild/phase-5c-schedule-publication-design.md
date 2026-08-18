# Phase 5C Schedule publication design

Status: implemented and locally verified on 2026-08-17. Phase 5D requires separate approval.

## Objective

Complete the protected manager Schedule publication workflow without importing the
old payroll, labor, overtime, time-entry, jurisdiction, or compliance machinery.
Managers with publish authority must be able to review a named draft, select scoped
locations, resolve blockers, record explicit soft overrides, publish atomically, and
unpublish without deleting publication history.

Phase 5C does not add templates, auto-fill, exports, employee notifications, Lineup,
Requests, or employee-facing Schedule. Those remain later decisions.

## Static reference findings

The old Schedule source establishes these protected behaviors:

- Publish starts from a saved draft, not an unsaved editor state.
- The manager selects locations, reviews per-location added/updated/removed counts,
  completes preflight, and confirms publication.
- A preview carries the active publication identity and content fingerprint. Publish
  rejects a stale preview when live or draft content changes.
- Double booking is non-overrideable. Availability and closed-day findings are shown
  before publish and require an explicit manager decision.
- Publication is location scoped. Unselected locations retain their live version.
- Unpublish is separately confirmed and location scoped. Historical publication rows
  remain available even after employee visibility ends.
- Past weeks are closed to publish and unpublish.

This is static source evidence. The old runtime wizard geometry, focus order, exact
copy, and timing have not been captured and remain unverified.

## Product decisions

- Add `schedule.publish`. Owner and Admin receive it globally. Manager receives it by
  default but remains limited to assigned locations. Custom roles may receive it only
  with both `schedule.read` and `schedule.manage`.
- Only a named, saved draft can publish. Dirty edit-session content must be saved first.
- Scope is location-only in the clean product. Department-scoped partial publication
  is not carried over because it can create a visually live location containing a
  hidden mixed draft/live state.
- Publishing an empty selected location is valid and explicitly shows zero live shifts.
- Current and future weeks may publish or unpublish. A week before the workspace's
  current week start is closed. No payroll period, worked-shift, time-entry, or
  jurisdiction rule participates in that decision.
- The clean preflight taxonomy is deliberately narrow:
  - `overlap`: hard blocker, never overrideable.
  - `availability`: soft blocker, overrideable with a reason.
  - `closed_location`: soft blocker, overrideable with a reason.
- Every soft finding requires its own 10-500 character reason. The finding ID, actor,
  reason, draft revision, scope, and resulting publication are audited.
- Pre-existing findings are still displayed and require review when the selected
  location is republished. The clean contract does not silently grandfather them.
- No notification recipient step or delivery side effect is added in Phase 5C. A
  future notification phase can consume publication events without changing the
  transaction.

## Persistence model

### Existing publication tables

`schedule_location_publications` remains the immutable per-location version header.
Phase 5C adds source draft ID/revision, content fingerprint, and supersession metadata.
Its existing partial unique index continues to allow one `current` version per
location/week.

`schedule_published_shifts` remains the immutable snapshot belonging to one publication
version. Publishing creates a new snapshot; it never updates a previous version's rows.

### `schedule_publication_overrides`

- Workspace, publication, source draft/revision, finding ID/code, employee/location/date
  context, affected source shift IDs, reason, actor, and timestamp.
- Append-only and service-readable. Direct authenticated access is denied.
- A foreign key binds every override to the publication produced by the same commit.

### `schedule_publication_events`

- Append-only `published` and `unpublished` events.
- Workspace, week, actor, selected location IDs, source draft/revision when applicable,
  previous/new publication IDs, preflight fingerprint, diff counts, and timestamp.
- Contains workflow identifiers only; no employee private data or forbidden domains.

## Transaction invariants

- Preview and commit resolve actor permission and location scope in PostgreSQL.
- Preview returns draft revision, active publication versions, per-location diff, all
  findings, and a tamper-evident fingerprint over those canonical inputs.
- Commit locks the draft and selected location/week publication keys, recomputes the
  same plan and findings, and rejects any stale fingerprint, revision, or active version.
- Any hard finding aborts the complete selected scope. Every soft finding must have a
  matching current finding ID and valid reason.
- Commit marks selected current versions `superseded`, inserts one new current version
  per selected location, copies the selected draft snapshot, records overrides/events,
  and returns the new read model in one transaction.
- Unselected locations are untouched. A failure in any selected location rolls back all
  selected locations.
- Unpublish locks selected current versions, marks them `unpublished`, records one event,
  and preserves their shift snapshots. Republish creates a new version.
- Direct table writes and hard-blocker bypass remain denied even to authenticated users.

## API contract

- `POST /v1/workspaces/:workspaceId/schedule/publication-preview`
- `POST /v1/workspaces/:workspaceId/schedule/publications`
- `POST /v1/workspaces/:workspaceId/schedule/unpublish-preview`
- `POST /v1/workspaces/:workspaceId/schedule/unpublications`
- `GET /v1/workspaces/:workspaceId/schedule/publication-history?week_start=...`

Preview input contains draft ID and selected location IDs. Publish additionally carries
expected draft revision, expected active publication versions, preflight fingerprint,
and per-finding override decisions. Responses use stable status codes such as
`publish_ready`, `hard_blocked`, `override_required`, `stale_preview`, `past_week_closed`,
`scope_denied`, `published`, and `unpublished`.

## UI contract

- A saved draft exposes `Publish`; unsaved editor state exposes `Save draft` only.
- Step 1 selects eligible locations and shows live state plus added/updated/removed and
  resulting shift counts.
- Step 2 shows hard blockers first, then soft findings with required reason inputs, and
  an explicit final scope summary.
- Hard blockers disable confirmation and deep-link to the affected grid shifts.
- Stale preview returns to the scope review with a clear refresh notice; it never retries
  publication automatically.
- Success closes the draft editor, refreshes the published grid, and identifies the
  locations that went live.
- Published view exposes `Unpublish`. Its confirmation lists only currently live,
  actor-scoped locations and states that visibility ends while history is retained.
- Past weeks show a closed/read-only state with no active publish or unpublish command.
- Keyboard focus, Escape dismissal, internal scrolling, and mobile containment follow
  the existing Schedule modal conventions.

## Verification gate

Phase 5C is complete only with evidence for:

- Owner/Admin/global and Manager/scoped grants; Employee, cross-tenant, custom-role,
  and out-of-scope denials.
- Preview diff correctness for first publish, republish, removal, and empty location.
- Hard overlap rejection through UI, API, and direct RPC.
- Availability and closure override reason validation and append-only audit records.
- Stale draft revision, active publication version, and fingerprint rejection.
- Atomic multi-location publish and rollback on one invalid selected location.
- Partial-location republish preserving unselected current versions.
- Location-scoped unpublish, immutable history, and republish version increment.
- Past-week publish/unpublish denial without payroll or time-entry dependencies.
- Clean database replay, full pgTAP, root gates, API smoke, and desktop/mobile browser UAT.
- No payroll, labor, overtime, time-entry, tips, compliance, notification, template, or
  export fields/routes introduced.

Old/new runtime comparison remains required before complete exact-port parity can be
claimed.

## Approval gate

Approval authorizes Phase 5C implementation only. It does not authorize Phase 5D
templates/export, notifications, external services, or new dependencies.
