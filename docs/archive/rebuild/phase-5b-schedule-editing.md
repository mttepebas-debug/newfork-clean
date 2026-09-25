# Phase 5B Schedule editing

Status: implemented and locally verified on 2026-08-17. Phase 5C has not started.

## Delivered

- Week-level edit leases with holder identity, heartbeat, four-minute expiry,
  stale-session recovery drafts, and holder-only mutation.
- Isolated working snapshots sourced from the published week, a blank week, or a
  named draft. Phase 5B never writes published shifts.
- Revision-checked create, update, move, delete, copy/paste, multi-select delete,
  named save, Save As, explicit overwrite, and discard flows.
- Manager-scope validation for locations, employees, jobs, shift types, week dates,
  idempotent creates, and direct-table RLS denial.
- A responsive editor with source selection, shift form, drag/drop, keyboard edit
  and copy paths, dirty-close protection, heartbeat, and a three-minute idle warning
  followed by a 15-second close window.

## Preserved

- Editing starts from blank, published, or saved-draft content.
- One manager edits a week at a time while other managers receive holder and expiry
  information.
- Save, Save As/explicit overwrite, and Discard remain separate decisions.
- Shift editing includes employee/open assignment, location, date, job, shift type,
  start/end time, overnight derivation, note, and existing warning presentation.

## Changed and improved

- Full working snapshots replace the old pending-operation replay machinery. This
  makes save/discard atomic and removes client-side operation-collapse rules.
- PostgreSQL owns authorization, scope, revision, expiry, and reference invariants;
  Fastify is the authenticated service boundary and the browser sends no direct
  table writes.
- Bulk delete intentionally uses sequential revision-checked mutations. It preserves
  partial progress visibility and avoids a second mutation contract in this slice.
- Expired takeover is the normal acquire operation retried after server-declared
  expiry. Recovery occurs transactionally before the new lease is granted; there is
  no separate destructive takeover command.
- API errors currently expose stable domain messages and HTTP status classes rather
  than a second machine-code field. Adding codes can be done without changing the
  database contract if a non-browser client requires them.

## Intentionally omitted

- Publish, unpublish, blocker overrides, and save-and-publish remain Phase 5C.
- Templates, auto-fill, and export remain Phase 5D.
- Payroll, labor, overtime, time entry, tips, and compliance fields were not added.
- The old client implementation was not copied, and no new state, grid, or drag/drop
  dependency was introduced.

## Research-derived ideas

- The full-snapshot session model is derived from the clean architecture and the old
  behavior inventory, not from the old persistence implementation.
- Native drag/drop is paired with the shift editor's employee/location/date controls,
  so moving a shift is not drag-only.

## Verification

- Clean migration replay applies the four edit tables and service-only RPC boundary.
- Full pgTAP: 10 files and 238 tests pass, including 20 edit-session tests for RLS,
  acquisition conflict, mutation revisions, validation, save isolation, discard,
  and employee/non-holder denial.
- Root typecheck, lint, unit tests, and production build pass. API tests cover acquire,
  idempotency headers, revision forwarding, employee denial, and stale-write mapping.
- Real owner API smoke acquired a published copy with 7 shifts, created an eighth,
  saved revision 1 of a named draft, and confirmed the published read still had 7.
- Browser UAT opened published content, created a shift, saved a named draft, reopened
  it with the additional 8 hours, and returned to a 7-shift published view.
- At the measured narrow viewport, the document remained contained and the wide grid
  scrolled internally. No modal remained open after the flow.

## Evidence boundary

The old application evidence is static source evidence only. The clean local runtime,
database, API, and browser path are verified, but old/new runtime interaction and
geometry parity remain unverified. Two independently authenticated browser sessions
were not exercised; the concurrent-manager result is proven at PostgreSQL and API
contract levels.

## Approval gate

Stop after Phase 5B. Phase 5C publishing and blocker decisions require separate user
approval.
