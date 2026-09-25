# Phase 5A Schedule read grid

Status: implemented and locally verified on 2026-08-17. Phase 5B is now
implemented separately; Phase 5A remains the published read boundary.

## Delivered

- A synthetic published-schedule fixture with two locations, three employees,
  unassigned and overnight shifts, a closure, availability conflict, overlap
  conflicts, and per-location publication state.
- A service-only PostgreSQL read-model RPC with manager-role, permission,
  workspace, and location-scope enforcement.
- An authenticated Fastify `GET /v1/workspaces/:workspaceId/schedule` endpoint.
- A read-only Schedule route with URL-backed date, day/week, filters, and
  separate/unified location state.
- A sticky, horizontally scrollable grid with employee totals, unassigned shifts,
  shift types, jobs, closures, publication state, and warning indicators.
- Shared Zod contracts for the complete Phase 5A response.

## Preserved

- Manager Schedule remains a day/week grid reached at `/app/schedule`.
- Today, previous, and next period navigation remains visible and URL-backed.
- Location, shift-type, job, and employee filters remain part of the primary
  Schedule toolbar.
- Separate and unified location presentation, sticky employee context, unassigned
  rows, hours totals, published state, and schedule warnings remain visible.
- Business dates and overnight markers are represented without browser timezone
  conversion of the scheduled date.

## Changed and improved

- The clean route reads a normalized server model instead of reproducing the old
  page and grid orchestrators.
- Direct authenticated table reads are denied. Tenant, role, permission, and
  location scope are resolved before the service-only read model is returned.
- Filter and mode state is shareable in URL parameters instead of hidden component
  state.
- The fixture is deterministic relative to its seeded week and includes explicit
  warning cases for focused parity work.

## Intentionally omitted

- Shift creation, editing, move/copy/delete, selection, context actions, and drag
  and drop are reserved for Phase 5B.
- Drafts, edit leases, heartbeat, takeover, and stale-write handling are reserved
  for Phase 5B.
- Publish preflight, overrides, publish/unpublish, and closed-week controls are
  reserved for Phase 5C.
- Templates, auto-fill review, and schedule export are reserved for Phase 5D.
- Line-up, requests, employee-facing scheduling, payroll, labor, overtime, time
  entry, tips, and compliance domains were not introduced.

## Research-derived ideas

- No external service, state library, grid library, or drag-and-drop dependency was
  required for Phase 5A.
- The read model isolates publication history from future drafts, allowing later
  mutation work to add revision and lease semantics without changing the read-only
  client contract unnecessarily.

## Verification

- Clean local database reset applied all migrations and the complete seed.
- Full pgTAP suite: 9 files and 218 tests passed, including 14 Phase 5A tests.
- Real local owner session API smoke returned 2 locations, 3 employees, 7 shifts,
  1 closure, 1 availability warning, 1 closed-location warning, and 2 overlap
  warnings. No payroll, compliance, or time-entry response fields were present.
- Browser checks passed for week/day, separate/unified, location filtering, internal
  grid scrolling, and document-width containment.
- At a measured 1600 px viewport the document width remained 1600 px and the grid
  scrolled internally. At a measured 433 px viewport the document width remained
  433 px, controls stayed inside the viewport, and no control text overflowed.
- Root typecheck, lint, unit tests, and production build passed. Vite reported the
  existing main-bundle size warning; the lazy Schedule chunk was 11.56 kB (4.05 kB
  gzip).

## Evidence boundary

The old Schedule source was used as static behavior evidence. A stable old runtime
fixture was not captured in this slice, so visual and interaction exact parity with
the old application is not runtime-proven. The clean implementation's local runtime
is verified, but this does not prove Phase 5B-5D behavior or complete Schedule parity.

## Approval gate

Stop after Phase 5A. Phase 5B requires a separate user decision after review of this
implementation and the unresolved old-runtime parity capture.
