# Phase 12 Kiosk Product Definition

Status: approved design phase completed on 2026-08-17. Phase 12A device and security foundation was
subsequently approved, implemented, and locally verified. Phase 12B online capture was also
separately approved, implemented, and locally verified. Later Phase 12 implementation slices remain
separately gated.

## Purpose

Define a shared workplace device that lets an employee record the same raw time events established
in Phase 11 without signing the device into a personal Organizer account. The kiosk is an optional
capture surface over the Time domain, not a new timesheet, payroll, compliance, attendance-proof,
or device-management domain.

The canonical distinction is:

- device enrollment identifies an organization-controlled capture endpoint,
- employee kiosk verification identifies who is asserting an action,
- a short action session authorizes only the currently valid time action,
- the Time domain remains authoritative for event ordering and session state,
- location binding is operational context, not proof of physical presence.

The legacy kiosk, Device Hub, routes, settings, pairing behavior, browser storage, tables,
migrations, and device assumptions are deliberately excluded. The old application remains
read-only reference material and was not inspected for this design.

## Product Position

Kiosk is an optional module after core Time, not a requirement for the base product. Packaging and
paid-tier placement remain undecided until customer-demand, support-cost, and managed-device
research exists.

The first implementation should be a responsive, installable web application that is online-only.
It may request a screen wake lock as a best-effort convenience, but browser fullscreen, PWA
installation, and wake lock are not security controls. A customer that needs users prevented from
leaving the kiosk requires a separately supported managed-device deployment.

## Actors And Jobs

### Workspace Owner Or Authorized Manager

- Create a short-lived, one-time enrollment code for one workspace and one location.
- Name the device, inspect its status and last contact, and revoke or replace its credential.
- Reset an employee's kiosk PIN without learning the existing value.
- See enrollment, revocation, failed-verification, lockout, and accepted-action audit history within
  their authorized scope.
- Never leave their ordinary manager session active on the shared device.

### Employee

- Find their minimal identity card among active employees assigned to the enrolled location.
- Verify with a personal kiosk PIN that is distinct from their Organizer password.
- See exactly the action allowed by their current Time state and its selected location.
- Receive confirmation only after the server accepts the event, then return automatically to the
  neutral employee chooser.
- Use kiosk capture without being required to own or activate an Organizer user account.

### Enrolled Device

- Identify itself with an opaque, revocable credential bound to one workspace and one location.
- Receive only the employee directory fields and current-state data needed for capture.
- Never gain manager, schedule, correction, history, payroll, or direct database authority.
- Stop capture immediately when revoked, expired, offline, or unable to refresh server state.

## Identity And Principal Model

Device identity and employee identity are separate principals. A device credential proves only
that a previously enrolled endpoint is presenting the token. It does not prove which employee is
present, that the endpoint remains physically at its labeled location, or that the operating system
is locked down.

Kiosk must support active employees who do not have an Organizer authentication user. The Time
event provenance model therefore cannot invent an `actor_user_id` or silently attribute a kiosk
action to the manager who enrolled the device. A future implementation must represent:

- the employee whose time state changes,
- the enrolled device that submitted the request,
- the kiosk-verification principal and method,
- the source `kiosk`,
- the server receipt time and request idempotency key.

This is an explicit extension of Phase 11 provenance and must preserve existing authenticated
employee and manager actor history.

## Enrollment Contract

1. An authorized manager starts enrollment from their authenticated Organizer session, selects one
   location, gives the device a recognizable label, and receives a cryptographically random,
   short-lived code.
2. The code expires after 10 minutes, is single-use, and is stored only as a non-reversible verifier
   on the server.
3. The shared device exchanges the code for a high-entropy opaque device credential. The server
   stores only a hash of that credential and its workspace, location, status, creation actor,
   timestamps, and rotation history.
4. The browser receives the credential through a secure, HTTP-only, same-site cookie where the
   final deployment topology permits it. The credential must not appear in a URL or ordinary
   application logs.
5. Enrollment closes any manager session on that browser origin before the neutral kiosk is shown.
6. Re-enrollment rotates the credential. Revocation and workspace or location deactivation deny
   the next request without waiting for a client refresh.

One device belongs to exactly one workspace and one location in the first release. Moving it is a
revoke-and-enroll operation so location history remains unambiguous.

## Employee Verification Contract

- Each eligible employee has a six-digit kiosk PIN generated or changed through an authenticated
  personal flow or manager-assisted reset. It is not reused as an Organizer password.
- The server stores a unique salt and a slow password hash such as Argon2id. Plaintext PINs are
  never retained, returned, logged, or shown to managers.
- Verification is rate-limited by workspace, device, and employee, with a device-wide abuse limit
  to constrain employee enumeration. Repeated failure applies increasing server-enforced cooldowns.
- Responses and timing are normalized enough that an invalid employee, invalid PIN, inactive
  employee, and temporarily locked principal do not expose distinct public explanations.
- A successful verification creates a server-side action session with a 60-second absolute
  lifetime. It is valid for that employee, device, workspace, location, and current Time-state
  revision only.
- The action session ends after one accepted action, explicit cancel, timeout, state conflict,
  revocation, navigation away from the action screen, or loss of kiosk eligibility.
- Returning to the chooser clears employee data from UI state and prevents cached private
  responses from being recovered through ordinary back navigation.

A six-digit PIN is a usability compromise for a physically shared, narrow-purpose device. It is
not suitable for manager access or broad employee-account authentication. Rate limits, short
sessions, limited authority, audit, and manager reset are mandatory compensating controls.

## Employee Chooser And Privacy

The neutral kiosk may show only active employees currently assigned to the enrolled location. Each
entry contains the minimum identity needed to distinguish coworkers: preferred or display name and,
only when collisions require it, a non-sensitive workplace discriminator approved in the product
design. It does not show email, phone, schedule, role permissions, clock state, history, pay data,
or whether a PIN exists before verification.

Search and pagination must not widen the location scope. The API returns a bounded list and a
generic empty state. Directory access and failed verification are auditable, but raw PIN values and
unnecessary query text are not logged.

The initial kiosk will not collect or require:

- GPS, geofencing, Wi-Fi, Bluetooth, or background location,
- camera images, facial recognition, fingerprints, voiceprints, or other biometrics,
- QR badges, NFC cards, wearables, or device fingerprinting,
- continuous screenshots, audio, or employee behavior telemetry.

Any later presence-verification mechanism requires a separate privacy and security proposal,
accessible fallback, retention schedule, jurisdiction review, and user approval.

## Capture Workflow

1. The neutral screen shows the enrolled location and lets the employee select their identity.
2. The employee enters their kiosk PIN. A successful response opens the short action session but
   does not expose personal history.
3. The server resolves fresh Time state and the UI presents only the state-valid action:
   `clock_in`, `break_start`, `break_end`, or `clock_out`.
4. Clock-out while a break is open keeps the Phase 11 explicit choice: end break and clock out, or
   return. It never manufactures an invisible break end.
5. The mutation includes a fresh idempotency key and expected Time-state revision. The Time domain
   applies its existing event-ordering and tenant boundaries.
6. The kiosk confirms the authoritative server timestamp only after acceptance, displays it briefly,
   invalidates the employee action session, and returns to the neutral chooser.

Double taps, retries, stale state, and concurrent personal-device actions must be idempotent or
return a safe conflict. A conflict clears the action session and requires fresh verification; the
kiosk must not guess the employee's intended resulting state.

Break events remain raw operational assertions. Kiosk introduces no paid-break, meal-period,
automatic-deduction, overtime, attendance, payroll, or legal interpretation.

## Offline Decision

Offline capture is deferred. The kiosk must show a clear unavailable state when it cannot obtain a
fresh server decision. It must not queue a clock event, accept a PIN locally, trust the device clock,
or display a success that the server has not committed.

A later offline proposal must separately resolve encrypted local storage, employee verifier
exposure, device revocation horizon, trusted time, monotonic event ordering, replay, duplicate
submission, stolen-device recovery, queue visibility, server reconciliation, conflict ownership,
and operating-system attestation. Service-worker caching of the application shell does not approve
offline mutation.

## Browser And Managed-Device Boundary

The browser implementation can provide a focused full-screen layout, PWA installation guidance,
connection status, and best-effort screen wake lock. It cannot guarantee that a user stays in the
application. Wake lock may be denied or released by the browser or operating system and must be
reacquired or allowed to fail without changing security state.

True single-purpose lockdown is a deployment capability. On managed Android, lock task mode can
restrict a dedicated device to allowlisted applications through an enterprise device-policy
controller; ordinary screen pinning is not equivalent because a user can exit it. Native wrappers,
mobile-device management, Android policy controllers, Apple managed-device support, and customer
device administration are outside the web MVP and need their own support and security contract.

## Threat Model

| Threat                                       | Required design response                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Coworker learns or guesses a PIN             | Slow salted hash, normalized errors, layered rate limits, cooldown, reset, and audit                             |
| Employee clocks for a coworker               | Personal PIN plus audit and narrow action authority; acknowledge that kiosk alone cannot prove physical identity |
| Stolen device credential crosses scope       | Opaque hashed credential bound to one workspace/location; fresh server checks and immediate revocation           |
| Pairing code is observed or replayed         | High entropy, 10-minute expiry, single use, hashed verifier, and attempt limits                                  |
| Manager session remains on shared device     | Enrollment terminates manager state before kiosk mode and uses a distinct credential                             |
| Previous employee state leaks                | One-action session, server timeout, cache restrictions, UI reset, and no personal history                        |
| Employee list enables broad enumeration      | Active location-only minimal directory, bounded responses, generic failures, and audit                           |
| Double tap or retry creates two events       | Idempotency key and server uniqueness boundary                                                                   |
| Personal device changes state concurrently   | Expected revision check; clear action session and re-verify after conflict                                       |
| Device clock or offline queue falsifies time | Online-only server acceptance; no offline mutation or local success                                              |
| Browser fullscreen is mistaken for lockdown  | Explicit browser boundary; managed-device deployment is separate                                                 |
| Revoked employee or device keeps operating   | Fresh server-side eligibility and revocation checks on verification and action                                   |
| Location label is treated as presence proof  | Product copy, API semantics, and audit distinguish configured location from verified presence                    |

## Authorization Contract

Future permissions should remain narrow and independently assignable:

- `kiosk.device.enroll.location`
- `kiosk.device.read.location`
- `kiosk.device.revoke.location`
- `kiosk.pin.reset.location`
- `kiosk.audit.read.location`

The device credential is not a user permission and cannot call ordinary manager or employee APIs.
Kiosk endpoints resolve active workspace, location, device, employee, and Time eligibility on every
request. Browser database roles receive no direct table access. Service-mediated database actions
must carry the explicit device and employee principals.

## Research Basis

- Android's official dedicated-device guidance says lock task mode can restrict a fully managed
  device to allowlisted applications, while screen pinning can be exited by the user. This supports
  treating real lockdown as managed-device deployment rather than a browser feature:
  <https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode?hl=en>.
- The W3C Screen Wake Lock specification allows the user agent to deny or release a lock and keeps
  the user in control. This supports using wake lock only as a recoverable display convenience:
  <https://www.w3.org/TR/screen-wake-lock/>.
- OWASP's Authentication Cheat Sheet recommends generic authentication errors and login
  throttling against brute-force attacks. This supports normalized PIN failures and layered
  server-side attempt limits:
  <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>.
- OWASP's Session Management Cheat Sheet requires server-side idle and absolute expiration,
  invalidation, secure cookie handling, and restrictive caching for authenticated content. This
  supports a short server-side action session and explicit shared-device cleanup:
  <https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html>.
- NIST SP 800-171 Rev. 3 includes identifying and authenticating devices before connection and
  reauthentication after defined conditions. It is guidance for protecting controlled unclassified
  information, not a requirement asserted for this product; the general principles support separate
  device identity and bounded reauthentication:
  <https://nvlpubs.nist.gov/nistpubs/SpecialPublications/800-171r3/NIST.SP.800-171r3.html>.

These sources inform the security architecture. They do not certify a kiosk deployment, prove
employee presence, establish employment-law compliance, or replace a threat model for the final
hosting and device topology.

## Deliberately Left Behind

- Every legacy kiosk route, Device Hub, pairing implementation, setting, table, migration, test,
  storage convention, and native-device assumption.
- Payroll, wages, tips, labor cost, overtime, rounding, automatic deductions, break policy,
  attendance points, compliance labels, and legal conclusions.
- Employee schedules, historical timecards, corrections, manager actions, or workspace navigation
  on the shared device.
- GPS, biometrics, photos, badge readers, QR codes, device fingerprinting, and continuous tracking.
- Offline clock actions, background synchronization, trusted local time, and false optimistic
  success.
- Native applications, mobile-device management, operating-system lockdown, remote wipe, and
  customer device procurement or support.
- A packaging, entitlement, billing, or paid-tier decision.

## Proposed Implementation Sequence

Each slice requires separate approval before implementation:

1. **Phase 12A - Device and security foundation:** device principal model, one-time enrollment,
   credential rotation and revocation, PIN hashing and reset, rate limits, audits, tenant/location
   authorization, and negative database/API tests.
2. **Phase 12B - Online capture:** neutral employee chooser, short action session, Time-state
   integration, raw clock and break actions, conflict/idempotency handling, responsive kiosk UI,
   and browser proof.
3. **Phase 12C - Manager device controls:** scoped device list, label and last-contact visibility,
   revoke/re-enroll flow, operational security events, and deployment guidance that clearly
   separates browser convenience from managed-device lockdown.
4. **Phase 12D - Deferred deployment research:** customer demand, packaging, Android managed-device
   support, Apple managed-device constraints, accessibility hardware, and offline feasibility. This
   research does not automatically approve native or offline implementation.

## Acceptance Contract For A Future Implementation

- Unit tests prove enrollment and action-session state machines, expiry, revocation, idempotency,
  stale-state conflict, and automatic employee-session clearing.
- Database tests prove cross-tenant and cross-location denial, hashed credential storage, one-time
  pairing, revoked-device denial, employee eligibility, direct-table denial, and append-only Time
  provenance.
- API tests prove normalized PIN errors, layered throttling, server-side timeouts, credential
  rotation, generic inactive states, and no manager API authority for a device token.
- Web tests prove one valid action per Time state, no private data before verification, no retained
  employee state after action/timeout/cancel, and no false offline or timeout success.
- Authenticated browser UAT covers enrollment, employee capture, break actions, concurrent-state
  conflict, PIN failure/cooldown, revocation, and manager audit inspection.
- Visual and accessibility inspection covers landscape and portrait shared-tablet targets plus
  keyboard operation, large touch targets, visible focus, screen-reader names, reduced motion, no
  horizontal overflow, and no UI overlap.
- Security review covers credential theft, PIN guessing, enumeration, replay, fixation, cache and
  back-navigation leakage, rate-limit bypass, kiosk escape assumptions, and log redaction.
- Completion requires clean reset, focused and full automated gates, and actual browser workflows;
  generated UI, static source presence, HTTP 200, PWA installation, or fullscreen alone is not proof.

## Decisions Fixed For Phase 12A Planning

- Employees without Organizer user accounts are supported through a distinct kiosk principal.
- The initial PIN is six digits, manager-resettable, slow-hashed, throttled, and never manager-
  readable.
- The first capture surface is online-only responsive web/PWA.
- Raw break start and end actions are included; break policy and legal interpretation are not.
- Each device is bound to exactly one workspace and one location.
- Kiosk remains optional after core Time; packaging is deferred.

## Phase Decision

Phase 12 product definition, the separately approved Phase 12A, Phase 12B, and Phase 12C slices,
and Phase 12D deployment research are complete locally. Managed-device integration, offline
capture, packaging implementation, payroll, and compliance remain unapproved. The next permissible
step is a separate user decision on customer discovery or an Android-managed-web-app lab plan.
