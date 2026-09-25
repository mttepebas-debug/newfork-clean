# Phase 11 Time Capture Product Definition

Status: approved design phase completed on 2026-08-17. Phase 11A domain/security foundation,
Phase 11B employee capture, and Phase 11C manager Time Entries were subsequently approved,
implemented, and locally verified. Phase 11D corrections and review was also separately approved,
implemented, and locally verified.
Later implementation slices remain separately gated.

## Purpose

Define Time Entries and Employee Time Tracking together from first principles. The product
must record what actually happened at work, let employees understand and challenge that
record, and give authorized managers a reliable review workflow without importing payroll,
compliance, kiosk, or legacy Newfork assumptions.

The canonical distinction is:

- a schedule is a plan,
- a captured time event is a claim about what happened,
- a work session is the current reconstruction of those events,
- a correction is an auditable proposal to change that reconstruction,
- an approval is a review decision, not proof of legal or payroll correctness.

Scheduled time never silently becomes worked time. A schedule may be shown as context and
linked by identifier, but differences must remain visible.

## Users And Jobs

### Employee

- Start and end their own work session from authenticated mobile or desktop web.
- See the current state immediately, including the exact captured time and work location.
- See their own historical sessions, amendments, review decisions, and correction requests.
- Request a correction without needing permission to report an error.
- Receive a clear result and reason when a correction is accepted or rejected.

### Manager

- See active and completed sessions only for assigned locations and employees.
- Identify missing, overlapping, unusually long, or otherwise incomplete sessions.
- Create a manual session or propose an amendment with a required reason.
- Review employee correction requests without rewriting the original record.
- Approve a review window only when its sessions have no unresolved blocking issue.

### Owner And Admin

- Have organization-wide visibility and the same explicit amendment rules.
- Configure operational capture settings that do not make legal conclusions.
- Inspect actor, timestamp, reason, source, and decision history.
- Reopen a reviewed window through an explicit audited action.

## Product Model

### Time Event

An append-only fact submitted by an employee or authorized manager:

- `clock_in`
- `break_start`
- `break_end`
- `clock_out`

Each event carries a server identifier, workspace and employee scope, selected work
location, occurred-at timestamp, server-received timestamp, actor, source, and idempotency
key. An event is never overwritten or hard-deleted through normal product operations.

Phase 11 does not decide whether a break is paid, required, late, short, waived, or legally
compliant. A break event records only the operational fact asserted by the actor.

### Work Session

A work session is a projection of time events for one employee at one location. Its capture
state is separate from review:

- `open`: clocked in and not on a break,
- `on_break`: an open break follows the clock-in,
- `complete`: a valid clock-out closes the session,
- `needs_attention`: events are missing, conflicting, overlapping, or otherwise cannot form
  one unambiguous session.

The session exposes raw elapsed duration. Phase 11 adopts no rounding rule and no automatic
deduction. If a later policy transforms duration, raw timestamps and raw duration must remain
available and the transformation must be independently versioned and explained.

### Amendment

An amendment supersedes one or more projected values while preserving the source events. It
contains proposed before/after values, actor, reason, creation time, and provenance:

- an employee amendment begins as a correction request,
- an authorized manager amendment may apply immediately but remains visible to the employee,
- every amendment creates an audit event,
- a later amendment references the version it supersedes,
- stale-version changes fail instead of silently winning.

Employees cannot be prevented from submitting a correction because a review window is
approved or closed. Applying a post-approval amendment invalidates the affected approval and
requires re-review.

### Correction Request

Correction state is independent of session and review state:

- `pending`
- `accepted`
- `rejected`
- `withdrawn`

A request identifies the affected session, requested values, employee explanation, and
decision history. Rejection requires a manager-visible and employee-visible reason. Acceptance
creates an amendment; it does not mutate the original events.

### Review Window

A review window is an operational grouping, initially a workspace-local date range. It is not
a pay period and does not calculate wages. Review state is:

- `open`
- `ready_for_review`
- `approved`
- `reopened`

Approval records the reviewer, timestamp, session versions, and unresolved-warning snapshot.
It is blocked by open sessions, `needs_attention` sessions, pending corrections, or stale
session versions. Warnings and blockers must be separately classified and visible.

## Core Workflows

### Employee Capture

1. The employee selects an authorized location when more than one is available.
2. The UI presents exactly one valid primary action for the current state.
3. The server accepts the event idempotently and returns its authoritative timestamp and new
   state.
4. The UI confirms only after server acceptance; a timeout or offline state never displays a
   false success.
5. The employee can inspect the resulting event and report an error.

Clock-out with an open break requires an explicit choice to end the break and clock out or to
return. It must not invent an invisible break end.

### Manager Entry And Repair

1. The manager selects an employee, location, date, and explicit start/end values.
2. The product previews conflicts and schedule context without treating the schedule as truth.
3. The manager supplies a reason and confirms the amendment or manual session.
4. The employee can see the resulting record and its provenance.

Bulk actions may change review state, but bulk time edits are outside the first implementation
slice.

### Correction Review

1. The employee sees current values and enters the requested replacement values plus a reason.
2. The manager compares schedule context, raw events, current projection, and the request.
3. Accept creates an amendment; reject records a reason; both notify the employee in-app.
4. An action against a stale session version is rejected and reloaded for comparison.

## Authorization Contract

New permissions must be narrow and independently assignable:

- `time.capture.own`
- `time.read.own`
- `time.correction.request.own`
- `time.read.location`
- `time.amend.location`
- `time.correction.review.location`
- `time.review.approve.location`
- `time.audit.read`

Every API read and mutation resolves a fresh active membership. Location permissions are
intersected with current manager assignments. Acting on another employee is always a manager
operation even when the actor is also an employee. Browser database roles receive no direct
table access; server operations carry the authenticated actor and workspace explicitly.

## Privacy And Verification Decisions

The first implementation slice will support authenticated mobile and desktop web with the same
domain contract. It will not collect or require:

- continuous or background location,
- precise GPS coordinates or geofencing,
- photos or facial recognition,
- fingerprints, voiceprints, or other biometrics,
- wearable or health data,
- QR codes,
- persistent device fingerprints,
- employee-owned device enrollment.

The selected business location is operational data, not proof that the person was physically
present. Source type and ordinary security telemetry may be retained under separate security
retention rules; they must not be presented as conclusive attendance evidence.

This minimizes surveillance, accessibility, discrimination, consent, breach, and device-support
risk while preserving a usable capture flow. Any later verification mechanism needs a separate
product proposal, privacy impact assessment, accessible alternative, retention schedule, threat
model, jurisdiction review, and user approval.

## Offline Decision

Offline capture is deferred. The initial client shows the current connection state, retains typed
correction text locally only long enough to retry, and never queues an unseen clock action as if
it were accepted.

A future offline design must resolve device-clock trust, event ordering, replay, duplicate
submission, shared-device exposure, revocation, local encryption, conflict UX, and server
attestation before implementation.

## Threat Model

| Threat                                          | Required design response                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| Employee acts for another employee              | Authenticated individual sessions; no employee selector in own capture           |
| Manager exceeds location authority              | Server-side workspace, permission, and location intersection on every action     |
| Double tap or network retry duplicates an event | Client idempotency key with a server uniqueness boundary                         |
| Client clock is manipulated                     | Store occurred-at and server-received timestamps; flag material drift for review |
| Original time is concealed by an edit           | Append-only events and versioned amendments; no ordinary hard delete             |
| Approved records change silently                | Optimistic version checks and automatic approval invalidation                    |
| Schedule is used to suppress actual work        | Schedule is context only; capture and corrections remain independent             |
| Sensitive monitoring data expands unnoticed     | Deny by default; data inventory and separate approval for new signals            |
| Cross-tenant or cross-location disclosure       | Service-mediated access plus database tenant tests and negative API tests        |
| Export is mistaken for payroll correctness      | No payroll totals, wage calculations, provider mapping, or compliance claim      |

## Research Basis

- The U.S. Department of Labor says employers may choose a timekeeping method, but records must
  be complete and accurate; when actual time differs from a fixed schedule, actual hours must be
  recorded. This supports the schedule-versus-work boundary and employee correction path:
  <https://www.dol.gov/agencies/whd/fact-sheets/21-flsa-recordkeeping>.
- DOL Field Assistance Bulletin 2024-1 warns that automated scheduling, timekeeping, location,
  and break systems may undercount work and that employers remain responsible for all hours
  worked. This supports explicit exception handling and the rejection of silent automation:
  <https://www.dol.gov/sites/dolgov/files/WHD/fab/fab2024_1.pdf>.
- The FTC recommends collecting only information needed for a legitimate purpose, limiting
  access, defining retention, and verifying privacy/security claims. This supports the initial
  exclusion of precise location, images, biometrics, and persistent device identity:
  <https://www.ftc.gov/business-guidance/resources/start-security-guide-business>.
- The NIST Privacy Framework treats privacy as an enterprise risk-management activity across
  identifying, governing, controlling, communicating, and protecting data processing. This
  supports a separate privacy impact review before adding surveillance signals:
  <https://www.nist.gov/privacy-framework/privacy-framework>.
- EEOC guidance identifies employment-law and confidentiality risks when workplace technology
  collects biometric, health, disability-related, or location information. This supports excluding
  wearables and biometrics rather than treating them as routine clock verification:
  <https://www.eeoc.gov/sites/default/files/2024-12/Wearables_Fact_Sheet_V10_%28002%29_508FINAL.pdf>.

These sources inform product risk decisions. This document is not legal advice, does not certify
FLSA or state-law compliance, and does not define overtime, break, wage, retention, payroll, or
jurisdiction rules. Those require a separately approved high-risk compliance phase.

## Deliberately Left Behind

- Every legacy Time Entries, Employee Time Tracking, kiosk, labor-segment, correction, break,
  payroll-handoff, pay-entity, and compliance implementation.
- Automatic schedule-to-timesheet conversion.
- Rounding, automatic break deduction, overtime, wages, tips, earnings, labor cost, and payroll.
- Kiosk, shared-device enrollment, device hub, pairing codes, and public clock routes.
- Background jobs that close sessions or manufacture missing events.
- Legal labels such as compliant, violation, owed, approved for payroll, or payroll ready.

## Proposed Implementation Sequence

Implementation requires a new approval and should be split into independently verifiable slices:

1. **Phase 11A - Domain and security foundation:** shared contracts, append-only event and
   amendment storage, tenant/location authorization, idempotency, audit, and database tests.
2. **Phase 11B - Employee capture:** authenticated mobile/desktop clock flow, current status,
   own history, accessibility, and failure-state browser proof.
3. **Phase 11C - Manager Time Entries:** location-scoped session list, attention states, manual
   entry/amendment, and audit inspection.
4. **Phase 11D - Corrections and review:** employee requests, manager decisions, review windows,
   stale-version handling, and in-app notifications.

Kiosk and payroll-ready reporting remain separate future design phases.

## Acceptance Contract For A Future Implementation

- Unit tests prove event-to-session projection and independent capture/review/correction states.
- Database tests prove cross-tenant and cross-location denial, append-only history, idempotency,
  stale-version rejection, and approval invalidation.
- API tests prove permission boundaries, actor provenance, validation, and safe error responses.
- Web tests prove state-specific actions, exact timestamp visibility, corrections, and no false
  success while offline or timed out.
- Authenticated browser UAT covers employee and manager roles on desktop and 390 px mobile,
  including keyboard and screen-reader semantics.
- Security review covers replay, tampering, enumeration, audit access, and sensitive telemetry.
- No completion claim may rely on generated UI, static source presence, HTTP 200, or manager-only
  happy-path evidence.

## Phase Decision

Phase 11 product definition and the separately approved Phase 11A, 11B, 11C, and 11D slices are
complete. No external service, SDK, plugin, mobile-native application, hosted infrastructure,
legal rule, data-retention period, kiosk, payroll, or compliance domain is approved. Any later
domain requires a new product checkpoint.
