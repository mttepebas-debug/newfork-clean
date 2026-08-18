# Phase 11A Time Capture Foundation

Status: implemented and locally verified on 2026-08-17. Phase 11B employee capture was later
approved and completed as a separate slice.

## Preserved

- Existing workspace, role, employee, location, audit, and service-role RPC architecture.
- Existing manager location scopes and current employee location assignments as independent
  authorization checks.
- Existing Schedule data remains untouched and is not converted into worked time.
- Old Newfork remained read-only and supplied no time, kiosk, payroll, or compliance code.

## Changed And Improved

- Added eight narrow Time permissions with owner, admin, manager, and employee defaults.
- Added shared Zod contracts for capture events, capture/review states, exact timestamps,
  sessions, amendments, idempotency keys, and amendment revision guards.
- Added `time_sessions` as the mutable projection while keeping raw `time_events` and
  `time_amendments` append-only.
- Added a one-active-session-per-employee database boundary.
- Added service-only RPCs for event capture and manager amendments. Browser roles cannot
  call the RPCs or query the tables directly.
- Capture revalidates active membership, permission, manager location scope, employee
  location assignment, event order, source, current state, and idempotency payload.
- Clock-out fails while a break is open instead of inventing an implicit break end.
- Amendments require a reason and expected revision, preserve raw timestamps, and advance
  the effective projection. An approved session would be reopened by an amendment.
- Capture and amendment actions create workspace audit events without storing coordinates,
  images, payroll values, or compliance conclusions.

## Deliberately Left Behind

- No API route, web route, navigation item, status UI, clock button, history view, or manager
  Time Entries page.
- No correction requests or review windows; their states remain future contract boundaries.
- No schedule-to-time conversion, rounding, automatic deductions, earnings, labor cost,
  payroll, overtime, break rules, or compliance classifications.
- No kiosk, shared device, GPS, geofence, photo, biometric, QR, device fingerprint, offline
  event queue, native application, or external provider.
- No legacy Newfork time-entry schema, migration, permission, endpoint, UI, or test behavior.

## Research-Derived Ideas Implemented After Approval

- Preserve exact captured timestamps separately from amended effective timestamps.
- Treat schedule as context rather than evidence of work performed.
- Minimize employee monitoring data and require a new privacy/security approval before any
  higher-friction verification signal.
- Reject false offline success and idempotently replay only an identical accepted payload.

## Verification

- Prettier: passed for the repository's tracked source and documentation patterns.
- Root lint: 4 of 4 packages passed.
- Root typecheck: 6 of 6 tasks passed.
- Root unit tests: 92 passed across shared, API, UI, and web packages.
- Root production build: 4 of 4 package builds passed; no bundle-size advisory returned.
- Clean local Supabase reset: all 18 migrations plus seed applied successfully.
- Focused Time pgTAP: 41 assertions passed.
- Full database suite: 17 files and 461 assertions passed.

The database suite covers direct browser-role denial, service RPC denial to browser roles,
tenant and location isolation, default permissions, idempotent replay, payload conflicts,
event ordering, explicit break completion, exact raw timestamps, immutable events and
amendments, stale revisions, manager-only amendments, audit events, and absence of location
and photo columns.

## Remaining Risks And Open Decisions

- No hosted migration, production RLS, deployment, observability, load, or recovery proof was
  performed.
- Service RPCs are not reachable through the application until a separately reviewed API
  layer sets actor, source, and idempotency inputs from trusted request context.
- Retention periods remain undefined and require deployment/jurisdiction review.
- `needs_attention`, correction requests, review windows, and approval invalidation need
  their later approved implementation slices.
- Offline capture and kiosk remain separate threat-model and product decisions.

## Phase Decision

Phase 11A is complete locally. Phase 11B was separately approved and completed without adding
manager Time Entries, corrections, kiosk, payroll, or compliance. Phase 11C remains separately
gated.
