# Phase 11D Corrections And Review

Status: implemented and locally verified on 2026-08-17. This completes the approved Phase 11
time-capture sequence. The Phase 12 kiosk product definition was subsequently approved and
completed; no kiosk implementation is approved by this status.

## Preserved

- Existing authenticated employee and manager shells, workspace permissions, location scopes,
  append-only raw events, manager amendment history, and personal notification inbox.
- Raw timestamps remain unchanged when an employee correction is accepted.
- Schedule remains optional comparison context and never becomes worked time.
- Old Newfork remained read-only and supplied no correction, payroll, kiosk, or compliance code.

## Changed And Improved

- Added employee correction requests for complete personal sessions with requested start/end,
  reason, base revision, UUID idempotency, and one-pending-request-per-session protection.
- Added a location-scoped manager correction queue embedded in Time Entries. Managers compare raw,
  current effective, and requested values before accepting or rejecting with a reason.
- Accept creates an append-only amendment and advances the effective projection atomically. Reject
  records a decision without changing the session.
- Both decisions are revision guarded. A manager action against a changed session returns a stale
  conflict and requires a fresh comparison.
- Added in-app notifications to authorized location reviewers when a request is submitted and to
  the employee when it is accepted or rejected.
- Added exact-set review windows. Approval requires one location, a bounded date range, and a
  complete map of currently reviewable session revisions; pending corrections and already approved
  sessions are excluded.
- Approved sessions visibly show `Approved`. A later amendment retains history and changes the
  review state to `Reopened`.
- Employee and manager date-time inputs use the work location's IANA timezone rather than the
  device timezone.

## Deliberately Left Behind

- No bulk time edits, automatic correction decisions, auto-approval, schedule conversion, or
  manager mutation of active sessions.
- No payroll readiness, rounding, automatic deduction, wages, overtime, break policy, compliance
  classification, legal conclusion, or export.
- No kiosk, shared device, geolocation, biometric, native app, or offline mutation queue.
- No email, SMS, push provider, external workflow, or hosted deployment.

## Research-Derived Ideas Implemented After Approval

- Correction content is immutable after submission; the decision is a constrained state transition
  rather than a rewrite of the employee request.
- Review approval compares the whole eligible session set, not only each submitted revision, so a
  newly added or removed record makes the window stale.
- Correction review and review-window approval use separate permissions and independently recheck
  location scope on the server.
- Notifications contain the operational decision and link back to the app without exposing raw
  event payloads.

## Verification

- Prettier: repository check passed.
- Root lint: 4 of 4 packages passed.
- Root typecheck: 6 of 6 tasks passed.
- Root unit tests: 110 passed across shared, API, UI, and web packages.
- Root production build: 4 of 4 package builds passed. The Time Entries lazy chunk is 19.86 kB
  (5.75 kB gzip) and Employee Hub is 23.65 kB (7.09 kB gzip), with no bundle-size advisory.
- Clean local Supabase reset: all 22 migrations plus seed applied successfully.
- Focused corrections/review pgTAP: 32 assertions passed.
- Full database suite: 20 files and 535 assertions passed.
- Focused API route file: 41 tests passed; the API package has 47 passing tests.
- Focused Employee Hub and Time Entries web files: 11 tests passed; the web package has 33 passing
  tests.
- Authenticated browser UAT passed with separate seeded employee and owner accounts: clock-in/out,
  employee request, reviewer notification, manager acceptance, amendment projection, employee
  decision notification, accepted personal history, and exact-set review approval all persisted.
- Desktop and 390 x 844 mobile inspection found one H1, no horizontal overflow, visible
  raw/effective/review states, and no browser warnings or errors.
- Implementation verification found and corrected one unsupported PostgreSQL JSON helper during
  the first migration reset and one stale-set test fixture invalidated by the final approved-session
  exclusion. Neither failed run was treated as passing evidence.

Visual evidence:

- [Desktop](phase-11d-correction-review-desktop.png)
- [390 px mobile](phase-11d-correction-review-mobile.png)

## Remaining Risks And Open Decisions

- No hosted migration, deployment, production authentication, production RLS, observability,
  load, recovery, email/push delivery, or cross-device browser proof was performed.
- Browser UAT covered one employee, one owner, and one location. Automated tests cover role,
  tenant, location, direct-table denial, idempotency, immutability, stale revisions, and review-set
  boundaries.
- Review windows are operational approvals, not payroll or legal certifications. Retention periods
  and jurisdiction-specific record rules remain undefined.
- Ambiguous repeated wall-clock times during a DST fallback still require a future product decision
  if the offset choice must be shown explicitly.

## Phase Decision

Phase 11D and the approved Phase 11 sequence are complete locally. The separately approved Phase 12
kiosk product definition is complete, but kiosk implementation, payroll, compliance, offline
capture, external notifications, and any later product domain remain separate decisions and require
a new user-approved product checkpoint.
