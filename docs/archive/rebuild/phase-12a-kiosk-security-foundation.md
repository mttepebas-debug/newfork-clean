# Phase 12A Kiosk Security Foundation

Status: implemented and locally verified on 2026-08-17. Phase 12B online capture UI and Time-event
integration were subsequently approved and completed as a separate slice.

## Preserved

- Phase 11 remains the only source of truth for time-event ordering, work-session state,
  corrections, amendments, and review.
- Workspace memberships, custom roles, location scopes, and service-mediated database access remain
  the authorization foundation.
- Employees may exist without an Organizer authentication account. Kiosk employee identity is not
  fabricated as an `auth.users` actor or attributed to the enrolling manager.
- The old Newfork application remained read-only and supplied no kiosk route, Device Hub, pairing,
  PIN, storage, schema, or device-management implementation.

## Changed And Improved

- Added five independently grantable, location-scoped Kiosk permissions for device enrollment,
  device read, device revocation, PIN reset, and audit read. Owner, admin, and system manager roles
  receive them; employee roles do not.
- Added one-workspace, one-location device principals with opaque 256-bit credentials. Only SHA-256
  verifiers are stored, credentials can rotate atomically, and revocation is effective on the next
  request.
- Added 100-bit, human-grouped enrollment codes. The database stores only a verifier; codes expire
  after ten minutes, are consumed under a row lock, and cannot be replayed.
- Added six-digit employee kiosk PIN storage using Node's built-in `scrypt` with a unique 128-bit
  salt, fixed resource parameters, a 256-bit derived key, and constant-time comparison. Managers
  can reset but never read a PIN.
- Added location-assignment and active-employee checks before PIN reset and verification. An
  employee does not need a linked authentication user.
- Added layered server-side attempt limits: five recent failed or pending attempts per
  device/employee and twenty per device, with generic public failure responses.
- Added 60-second, hashed kiosk action tokens. They do not yet authorize a Time action; Phase 12B
  must consume them exactly once while rechecking device, employee, location, and Time revision.
- Pinned device and PIN credential versions into every verification attempt. A concurrent PIN reset,
  credential rotation, employee deactivation, location removal, or device revocation prevents an
  in-flight verification from creating action authority.
- Added append-only kiosk security events for enrollment, device lifecycle, PIN reset, verification,
  throttling, and revocation without logging raw PINs, enrollment codes, device credentials, or
  action tokens.
- Added HTTP-only, `SameSite=Strict`, path-scoped cookies, restrictive `no-store` responses, exact
  production-origin checks, and credential-enabled CORS for the separate local web/API origins.

## Deliberately Left Behind

- No kiosk employee chooser, capture screen, fullscreen layout, wake lock, PWA manifest, or browser
  workflow was added.
- No clock-in, break, clock-out, Time-event provenance extension, or action-token consumption exists
  yet.
- No manager device list, audit viewer, label editor, setup wizard, or settings navigation was
  added. Those remain Phase 12C product work.
- No offline mutation, service-worker queue, local PIN verification, device-clock trust, or false
  optimistic success exists.
- No GPS, photo, biometric, QR, NFC, badge, device fingerprint, native wrapper, MDM, or operating-
  system lockdown integration exists.
- No payroll, wages, tips, overtime, rounding, break policy, attendance, compliance, legal label,
  packaging, entitlement, or billing behavior was introduced.

## Research-Derived Ideas Implemented After Approval

- Device credentials and employee PINs authenticate different principals and have separate
  lifecycle, storage, and audit boundaries.
- Public enrollment and verification endpoints return normalized errors; manager endpoints retain
  actionable scoped authorization errors.
- Browser cookies carry raw device and action secrets, while API response bodies and database rows
  expose only public device metadata or secret verifiers.
- Verification is split into atomic begin and finish database operations. The begin operation locks
  the device while counting attempts; the finish operation compares the exact credential versions
  observed before the slow hash.
- PIN hashes accept only the fixed supported `scrypt` parameters, salt length, and derived-key
  length, preventing corrupted database values from requesting unbounded hash work.

## Verification

- Repository Prettier check passed.
- Root lint passed in 4 of 4 packages.
- Root typecheck passed in 6 of 6 tasks.
- Root unit tests passed: 119 tests across shared, API, UI, and web packages.
- Root production build passed in 4 of 4 packages. No kiosk web chunk exists because Phase 12A has
  no UI.
- Clean local Supabase reset applied all 23 migrations plus seed successfully.
- Focused Kiosk pgTAP passed 47 assertions.
- Full database suite passed 21 files and 582 assertions.
- Focused Kiosk API and cryptography tests passed 9 tests; the full API package passed 56 tests.
- A real local API and Supabase flow passed owner-authenticated enrollment (`201`), PIN reset
  (`200`), cookie-based code exchange (`201`), PIN verification (`200`), credential rotation
  (`200`), manager revocation (`204`), and verification denial after revocation (`401`). Device and
  action secrets were absent from response bodies, and the device cookie was HTTP-only.
- The first focused database run exposed a PostgreSQL enum-cast error and was not counted as passing
  evidence. A first live API attempt exposed a Postgres timestamp-offset/Zod mismatch, and an empty
  PowerShell JSON POST interrupted the first rotation proof. The enum cast and offset contract were
  corrected; the complete flow and all clean gates were rerun successfully.

## Security Boundaries

- Browser roles have no direct privileges on devices, enrollment verifiers, PIN hashes,
  verification attempts, action sessions, or kiosk security events.
- Kiosk RPCs are executable only by the API service role. Manager identity, workspace, location,
  and permission are rechecked inside security-definer functions.
- Device cookies are scoped to `/v1/kiosk`; they are not user permissions and cannot invoke manager
  or ordinary employee APIs.
- PIN verification does not prove physical presence or prevent consensual PIN sharing. No wording or
  data field represents the configured location as verified attendance.
- Rate limiting is database-backed and device-scoped, but distributed edge/IP protection remains a
  hosted-infrastructure concern.

## Remaining Risks And Open Decisions

- No hosted migration, production cookie topology, reverse proxy, TLS termination, load test,
  observability, recovery, or multi-instance rate-limit proof was performed.
- No browser UAT was required because Phase 12A adds no user-facing surface. Cookie behavior was
  proven through the real local HTTP API, not cross-browser automation.
- Device credentials are long-lived and revocable; automatic rotation cadence, recovery when a
  device loses its cookie, and administrator re-enrollment UX remain Phase 12C decisions.
- A manager with PIN-reset authority at one active employee location changes that employee's single
  kiosk PIN for every eligible location. This is deliberate for the first contract and should be
  reviewed during manager UX design.
- Security-event retention, alert thresholds, support access, and hosted log redaction policy remain
  undefined.

## Phase Decision

Phase 12A device and security foundation is complete locally. Its separately approved Phase 12B
consumer is documented in `phase-12b-kiosk-online-capture.md`. Phase 12C manager device controls and
Phase 12D deployment research remain unapproved.
