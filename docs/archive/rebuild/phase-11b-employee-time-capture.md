# Phase 11B Employee Time Capture

Status: implemented and locally verified on 2026-08-17. Phase 11C Manager Time Entries was
subsequently approved, implemented, and locally verified.

## Preserved

- Existing Employee Hub shell, authenticated account flow, workspace membership, permission,
  employee identity, and location assignment boundaries.
- Exact raw event timestamps and the append-only event/session foundation from Phase 11A.
- Schedule remains context only; no schedule data becomes worked time.
- Old Newfork remained read-only and supplied no time-entry, kiosk, payroll, or compliance code.

## Changed And Improved

- Added a service-only employee read model for current capture state, authorized locations, and
  personal completed-session history.
- Added an own-capture service wrapper that derives the employee from the authenticated actor and
  fixes the source to `web`; clients cannot submit `employee_id` or `source`.
- Added authenticated Employee Hub API routes for personal time reads and event capture. Every
  mutation requires a UUID `Idempotency-Key` header.
- Added a responsive Time Tracking view with server-authoritative states: not clocked in, clocked
  in, and on break.
- Added location selection before clock-in, state-specific actions, live connection status,
  elapsed duration, and expandable personal history with all raw event timestamps.
- Mutations never show optimistic success. A failed identical request retains its idempotency key
  for an explicit retry; a new action receives a new key.
- Added a reproducible local employee account linked to Alex Kim and Main Dining for role-accurate
  API and browser verification.

## Deliberately Left Behind

- No manager Time Entries list, employee selector, manual session, manager amendment, or manager
  audit UI.
- No correction requests, review windows, approval workflow, or in-app correction decisions.
- No schedule conversion, rounding, automatic deduction, payroll, wages, overtime, break policy,
  compliance classification, or export.
- No kiosk, shared device, GPS, geofence, photo, biometric, QR, device fingerprint, native app, or
  offline event queue.
- No automatic clock-out or implicit break end.

## Research-Derived Ideas Implemented After Approval

- The server owns employee identity and source provenance for self-service capture.
- A network timeout cannot produce a false success; accepted state is rendered only after the
  authoritative read model returns.
- Current state and personal history share one server projection so reloads cannot reconstruct a
  competing client state.
- Connection status is visible, but offline actions are disabled rather than silently queued.

## Verification

- Prettier: passed for repository source and documentation patterns.
- Root lint: 4 of 4 packages passed.
- Root typecheck: 6 of 6 tasks passed.
- Root unit tests: 97 passed across shared, API, UI, and web packages.
- Root production build: 4 of 4 package builds passed; no bundle-size advisory returned.
- Clean local Supabase reset: all 19 migrations plus seed applied successfully.
- Focused employee capture pgTAP: 16 assertions passed.
- Full database suite: 18 files and 477 assertions passed.
- Focused API route tests: 34 passed in `app.test.ts`; the API package has 40 passing tests.
- Focused Employee Hub web tests: 5 passed.
- Authenticated browser UAT passed with the real seeded employee account. Clock-in, break start,
  break end, and clock-out returned the expected controls and persisted across reloads. The
  completed session retained all four events in personal history.
- Desktop and 390 x 844 mobile inspection found one H1, named controls, no incoherent overlap, and
  no browser warnings or errors.

Visual evidence:

- [Desktop](phase-11b-time-tracking-desktop.png)
- [390 px mobile](phase-11b-time-tracking-mobile.png)

## Remaining Risks And Open Decisions

- No hosted migration, deployment, production authentication, production RLS, observability,
  load, recovery, or cross-device browser proof was performed.
- Offline capture remains deferred; connection loss requires the employee to retry after the
  server is reachable.
- Retention periods and jurisdiction-specific record rules remain undefined.
- The local browser proof exercised one employee and one assigned location. Automated negative
  tests cover actor, tenant, and permission boundaries, but hosted multi-location behavior remains
  unverified.
- Manager Time Entries, correction/review workflows, kiosk, payroll, and compliance remain
  separate decisions.

## Phase Decision

Phase 11B is complete locally. Its next checkpoint was handled separately in Phase 11C; this
report does not approve Phase 11D correction/review workflows, kiosk, payroll, or compliance.
