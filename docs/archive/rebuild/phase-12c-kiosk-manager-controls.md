# Phase 12C Kiosk Manager Controls

Status: implemented and locally verified on 2026-08-17. Phase 12D research was subsequently
approved and completed without approving deployment implementation.

## Delivered

- Added an authenticated `/app/settings/kiosk` workspace settings route with permission-aware
  device, PIN access, and activity views.
- Added location-scoped device inventory with label, status, and last-contact visibility.
- Added one-time enrollment creation, device rename, immediate revoke, and replacement
  re-enrollment. Replacement transactionally revokes the prior device and its open employee action
  sessions before issuing a new one-time code for the same location.
- Added location-scoped employee PIN reset without exposing existing PINs, hashes, email addresses,
  device credentials, or enrollment-code hashes.
- Added operational kiosk activity backed by security audit events for manager actions.
- Added an explicit deployment boundary: browser mode is a convenient shared capture surface, while
  operating-system lockdown, remote administration, and enforced app allowlisting require managed
  devices.

## Preserved

- Phase 12A remains authoritative for device credentials, enrollment, revocation, PIN hashing,
  throttling, authorization, and audit storage.
- Phase 12B remains authoritative for neutral employee capture, short action sessions, online-only
  behavior, Time state transitions, and raw-event provenance.
- Every manager capability remains workspace- and location-scoped. Read, enroll, revoke, PIN reset,
  and audit permissions are evaluated independently.
- The old Newfork application remained read-only and supplied no manager UI or implementation.

## Changed Or Improved

- Settings navigation now admits kiosk-only manager roles and exposes only views their effective
  permissions allow.
- Replacement is a distinct security operation rather than a label change or silent credential
  rotation. The old device stops immediately and the replacement code is shown only once.
- Inventory, employee PIN eligibility, and audit data are returned as separate minimized scopes so
  one permission does not accidentally disclose another view.

## Intentionally Omitted

- Native applications, PWA installation work, wake locks, operating-system kiosk mode, MDM
  integration, remote wipe, and device procurement or support.
- Offline authentication or capture, queued mutations, optimistic offline success, and conflict
  reconciliation.
- Packaging, entitlement, billing, payroll, attendance, labor-rule, or compliance interpretation.
- Phase 12D customer and deployment research.

## Verification Evidence

- Clean local database reset applied 26 migrations plus seed data.
- The full database suite passed 23 files and 629 pgTAP assertions, including 25 focused manager
  control assertions.
- Focused kiosk API tests passed 10 cases; focused manager UI tests passed 3 workflows.
- Root formatting, lint, typecheck, 129 unit and component tests, and production build passed after
  the final implementation pass.
- Authenticated desktop browser UAT covered enrollment, real device pairing, inventory and last
  contact, rename, PIN reset, audit visibility, replacement, revoked-device behavior, dialog focus,
  Escape close and focus return, and a clean error/warning console.
- Responsive CSS and component behavior are automated but a mobile browser viewport was not
  visually verified in this pass because the connected browser did not apply its viewport override.

These are local implementation and runtime proofs. They are not hosted deployment, managed-device,
cross-browser, production cookie-topology, or real hardware evidence.

## Phase Decision

Phase 12C is complete locally. Phase 12D research was subsequently completed as a separate,
non-implementation slice. Native or managed-device work, offline capture, packaging implementation,
payroll, and compliance require a separate user decision.
