# Phase 12B Kiosk Online Capture

Status: implemented and locally verified on 2026-08-17. Phase 12C was subsequently approved and
completed as a separate slice.

## Delivered

- Added a lazy, public `/kiosk` route outside the authenticated application shell.
- Added one-time device enrollment UI, a location-scoped neutral employee chooser, name search,
  generic six-digit PIN verification, fresh Time-state resolution, state-valid clock and break
  actions, authoritative server-time confirmation, automatic identity clearing, and an explicit
  offline unavailable state.
- Added device-cookie directory and action APIs. Private responses remain `no-store`; device and
  60-second action credentials remain HTTP-only and are never returned in response bodies.
- Added transactional action-session consumption with expected revision checks, one request
  idempotency key, accepted-result replay, stale-state rejection, explicit cancel, and action-cookie
  clearing.
- Added the `kiosk` Time source and explicit employee, device, and action-session provenance. Kiosk
  records do not invent an authenticated `actor_user_id`.
- Added explicit `end_break_and_clock_out`; it appends both `break_end` and `clock_out` raw events in
  one transaction instead of hiding a break transition.

## Preserved

- Phase 11 remains authoritative for open, on-break, and complete session states, raw event order,
  one-active-session rules, append-only history, and optimistic revisions.
- Existing web, mobile-web, and manager capture continue using authenticated user provenance.
- The old Newfork application remained read-only and supplied no kiosk implementation or UI.

## Changed Or Improved

- Time session and event principals now support either an authenticated user or a constrained kiosk
  employee/device principal through database checks and foreign keys.
- A successful enrollment closes any local Supabase user session before the neutral chooser is
  shown on that browser origin.
- The directory returns only display identity for active employees assigned to the enrolled
  location. It omits contact data, schedules, clock state, history, permissions, and PIN state.
- Clock-out during an open break requires the employee to choose between ending the break or ending
  the break and clocking out.

## Intentionally Omitted

- Phase 12C manager device list, label editing, last-contact display, revoke controls, PIN reset UI,
  and kiosk audit UI.
- Offline PIN verification, queued mutations, optimistic success, GPS, biometrics, badges, camera,
  native applications, managed-device escape prevention, and deployment packaging.
- Payroll, attendance, labor-rule, paid-break, overtime, or compliance interpretation.

## Verification Evidence

- Clean local database reset applied 25 migrations plus seed data.
- The full database suite passed 22 files and 604 pgTAP assertions, including 22 Phase 12B
  assertions for scope, minimization, provenance, replay, stale revision, and combined break/clock
  output.
- Focused kiosk API tests passed 8 cases; focused kiosk UI tests passed 3 workflows.
- Root formatting, lint, typecheck, unit tests, and production build were run after implementation.
- Browser UAT covered the enrolled chooser, PIN, action, accepted confirmation, and responsive
  tablet/mobile layouts against the local API and database.

These are local implementation and runtime proofs. They are not hosted deployment, managed-device,
cross-browser, production cookie-topology, or real hardware evidence.

## Phase Decision

Phase 12B is complete locally. Phase 12C manager controls were subsequently approved and completed
as a separate slice. Phase 12D deployment research, offline capture, packaging, payroll, and
compliance require a separate user decision.
