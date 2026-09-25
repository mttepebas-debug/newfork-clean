# Phase 11C Manager Time Entries

Status: implemented and locally verified on 2026-08-17. Phase 11D Corrections and Review was
subsequently approved, implemented, and locally verified.

## Preserved

- Existing authenticated shell, workspace membership, role permissions, and location scopes.
- Append-only raw capture events and revision-guarded amendment history from Phase 11A.
- Schedule remains context only; no scheduled shift becomes worked time.
- Old Newfork remained read-only and supplied no time-entry, kiosk, payroll, or compliance code.

## Changed And Improved

- Added a location-scoped manager read model for a maximum 42-day range, with employee,
  location, and attention filtering.
- Added server-derived attention states for active sessions, active breaks, review attention,
  overlaps, and amended records. Overlaps are surfaced without rewriting either session.
- Added an atomic manual-session service that records a complete session, manager clock-in and
  clock-out events, a required reason, actor provenance, and audit history under one UUID
  idempotency key.
- Added revision-guarded manager amendments with raw/effective comparison and append-only history.
- Added authenticated manager API routes requiring `time.read.location` or
  `time.amend.location`; actor identity is always taken from the authenticated context.
- Added a responsive Time Entries workspace with summary metrics, filters, scan-friendly records,
  manual-entry and amendment dialogs, and event/provenance inspection.
- Date-time inputs are interpreted in the selected work location's IANA timezone, independent of
  the manager device timezone. Invalid local DST times are not submitted.
- Mutation success is never optimistic. An identical retry retains its key; changing the payload
  creates a new key.

## Deliberately Left Behind

- No employee correction request, manager correction decision, review window, approval workflow,
  bulk edit, or notification.
- No mutation of active sessions from the manager list and no schedule-to-time conversion.
- No rounding, automatic deduction, wages, overtime, payroll, compliance, or export.
- No kiosk, shared device, geolocation, biometric, native app, or offline queue.

## Research-Derived Ideas Implemented After Approval

- Manual entry reasons live in separate append-only provenance rather than being folded into raw
  capture events.
- The server owns actor provenance and deterministic child-event identifiers for idempotent manual
  creation.
- Raw timestamps remain visible after an amendment; the UI does not replace history with the
  effective projection.
- Attention is an operational signal, not a legal or payroll-readiness classification.

## Verification

- Prettier: repository check passed.
- Root lint: 4 of 4 packages passed.
- Root typecheck: 6 of 6 tasks passed.
- Root unit tests: 104 passed across shared, API, UI, and web packages.
- Root production build: 4 of 4 package builds passed; the Time Entries lazy chunk is 14.79 kB
  (4.80 kB gzip), with no bundle-size advisory.
- Clean local Supabase reset: all 21 migrations plus seed applied successfully.
- Focused manager Time Entries pgTAP: 26 assertions passed.
- Full database suite: 19 files and 503 assertions passed after the clean reset.
- Focused API route file: 38 tests passed; the API package has 44 passing tests.
- Focused Time Entries web tests: 3 passed; the web package has 30 passing tests.
- Authenticated browser UAT passed with the seeded owner account. Manual creation persisted after
  reload; amendments retained raw timestamps and showed revised effective time and audit history.
- Desktop and 390 x 844 mobile inspection found one H1, named controls, no horizontal page or
  record-list overflow, and no browser warnings or errors.
- UAT exposed and led to fixes for deterministic child identifiers that were not UUID-standard
  compliant and datetime-local input changes that were not retained across rerenders.
- The first full database run after UAT failed count-based assertions because UAT records remained
  in the local database. This was not treated as a pass: the database was reset, all migrations
  and seed were reapplied, and the full 503-assertion suite then passed.

Visual evidence:

- [Desktop](phase-11c-time-entries-desktop.png)
- [390 px mobile](phase-11c-time-entries-mobile.png)

## Remaining Risks And Open Decisions

- No hosted migration, deployment, production authentication, production RLS, observability,
  load, recovery, or cross-device browser proof was performed.
- Browser UAT covered one owner, one employee, and one location. Automated database and API tests
  cover tenant, actor, permission, location, idempotency, append-only, and stale-revision bounds.
- Ambiguous repeated wall-clock times during a DST fallback resolve to one valid instant; a future
  product decision may require displaying the offset choice explicitly.
- Retention periods and jurisdiction-specific record rules remain undefined.

## Phase Decision

Phase 11C is complete locally. Its next checkpoint was handled separately in Phase 11D; this
report does not approve kiosk, payroll, compliance, or automatic schedule conversion.
