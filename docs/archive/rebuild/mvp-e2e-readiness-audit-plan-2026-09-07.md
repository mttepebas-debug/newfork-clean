# MVP E2E readiness audit — working plan

## Purpose and guardrail

This is a read-first MVP audit, not a rewrite plan. It compares the current
application with the owner-defined first-customer workflow and classifies every
capability as **ready**, **implemented but E2E evidence missing**, **insufficient
for MVP**, or **missing**. No local test, migration, or browser smoke is treated
as hosted/release proof.

Until this audit has a decision, new product features do not enter scope. A
confirmed gap becomes a small, independently accepted phase; an existing working
flow is preserved rather than rebuilt.

## MVP outcome

An employer can create and configure an organization, invite employees, publish
a schedule, run day-to-day staffing changes safely, and receive/act on employee
requests. Employees can securely join the correct workspace, complete required
onboarding, see the current schedule, make permitted requests, and see the final
decision and resulting schedule state.

## Actor flows to audit

| ID | End-to-end outcome | Required actors |
|---|---|---|
| F01 | Owner onboarding, location, department and job setup | Owner/admin |
| F02 | Employee creation, invitation, acceptance, secure workspace entry and onboarding activation | Owner/manager, employee |
| F03 | Required document collection, review and expiry attention | Manager, employee |
| F04 | Draft, validate and publish Schedule; employee sees the published result | Manager, employee |
| F05 | Employee availability and manager-entered availability affect planning as the selected soft/hard policy requires | Employee, manager |
| F06 | Employee submits time off; manager approves/rejects; both see the authoritative decision and Schedule effect | Employee, manager |
| F07 | Employee requests release, cover or swap; manager approves/rejects; responsibility and Schedule result are correct | Employee, manager |
| F08 | Daily Line Up follows the canonical published Schedule; manager handles absence/replacement and shares it; employee acknowledges it | Manager/admin/owner, employee |
| F09 | Important-date warning and closed-day blocking influence Schedule creation/publishing correctly | Manager/admin |
| F10 | Account, notification preferences/delivery/deep links and workspace switching preserve role and tenant isolation | All roles |
| F11 | Employee Hub lands securely and its Schedule, request and status surfaces stay coherent | Employee |

## Evidence standard per flow

For each flow, record independently:

1. UI route and role access;
2. API/service authorization and mutation contract;
3. database/RLS/state transition;
4. receiving actor's UI and final Schedule/Line Up state;
5. focused/local test and local browser evidence;
6. hosted/release evidence, if any.

The audit must name the exact broken transition rather than marking an entire
page ready because it renders.

## Phased audit order

### Phase A — baseline and identity

F01, F02, F10 and F11. Prove tenant context, invitation, activation, role gates,
workspace switch and employee landing before relying on any operational workflow.

### Phase B — canonical planning

F04, F05 and F09. Prove schedule draft/publish behavior, policy enforcement,
important dates and the employee-visible published outcome.

### Phase C — employee changes

F06 and F07. Prove employee request → manager decision → notification → final
Schedule responsibility, including rejection and cancellation/withdrawal paths.

### Phase D — operations and compliance evidence

F03 and F08. Prove document expiry signals and Line Up's relationship to
published Schedule, replacement selection, share and acknowledgement.

## Control rules

- One phase is audited, decided and closed before a new feature phase begins.
- New ideas become backlog entries; they do not alter an in-progress acceptance
  boundary.
- A flow can be called MVP-ready only when the full actor outcome is verified.
- Local proof, hosted proof and release approval remain separate columns.
- Current availability work is governed by its final handoff: first isolate its
  WIP/dependencies, then verify remaining E2E gates; do not expand it.

## Immediate next deliverable

Build the F01–F11 readiness matrix from current code, migrations, focused tests,
existing local browser evidence and the availability/Line Up/onboarding handoffs.
The first version is a read-only status map with exact evidence links and no code
changes.

## Initial readiness matrix — evidence triage

This is the first read-only pass over the current checkout and its existing
evidence. **Local-ready** never means hosted/release-ready. Entries marked
**partial** are not new-feature instructions; they identify the exact acceptance
link still needing proof.

| Flow | Initial verdict | Existing evidence | MVP gate still open |
|---|---|---|---|
| F01 configuration | Local-ready | Owner onboarding has locations, departments/jobs and idempotent Finish contracts; local reset, focused DB/API/web tests and owner browser smoke are recorded in `onboarding-master-implementation-plan-2026-09-05.md`. | Current dirty-tree regression and hosted account/onboarding smoke. |
| F02 invite and activation | Local-ready with E2E boundary | Pending invitation, wrong-account, expiry/revoke and employee activation contracts are covered; local owner-to-employee browser smoke and later activation evidence exist. | Real mail delivery and hosted acceptance; preserve invitation fixture safety. |
| F03 documents and expiry | Partial | Required-document snapshot, private storage, review, expiry policy and a local publish-conflict/review browser flow are recorded. | Expiry-to-attention/notification and employee-manager workflow needs one current actor E2E; hosted storage/delivery remains open. |
| F04 Schedule | Local-ready with release boundary | Role routes, publication paths, local Schedule proof and publication-focused tests exist. | Current whole-flow employee-visible published result and current migration-chain replay on the selected patch; hosted proof. |
| F05 availability | Implemented, not MVP-accepted yet | Availability final handoff records canonical assessment, policy/override, onboarding, manager and employee local flows, plus focused tests and local clean replay evidence. | P0 policy decisions, WIP isolation, current 206-migration replay, remaining employee/manager/Line Up concurrency and hosted proof. |
| F06 time off | Partial | Hourly/date requests, partial decisions, approved-leave disposition and cancellation were implemented with local DB/API/UI evidence. | Employee-visible final outcome across overnight/cancellation and its resulting published-assignment state; role/mobile and hosted proof. |
| F07 swap, release and cover | Local E2E strong; final MVP gate partial | Shift Exchange evidence records employee/manager API/browser flows, final Schedule effects, local notification deep links, eligibility and concurrency cases. | Remaining role/recovery/hosted variants and release acceptance, not a feature rewrite. |
| F08 Line Up | Local E2E partial | Schedule-linked daily board, candidate operations, share, view and acknowledgement have DB/component and local manager/employee browser proof. | Real-browser omitted-share recovery, broader replacement/race coverage and hosted notification/delivery proof. |
| F09 important dates | Implemented but E2E evidence missing | Settings page, shared Schedule coverage code/tests and important-date migration exist. | One owner/manager flow must prove warning behavior and closed-day add/edit/publish blocking, including employee-facing outcome. |
| F10 account, notifications and workspaces | Mixed: workspace local-ready; notification E2E partial | Workspace isolation/switcher and role-safe routing have local DB/API/web/browser evidence. Notification settings/catalog and several Shift Exchange inbox/deep-link flows exist. | Cross-feature notification delivery timing, retry/worker behavior and hosted provider proof; current Account→Workspace→event recipient E2E. |
| F11 Employee Hub | Local-ready with E2E boundary | Employee role landing, protected management-route denial and hub route/test/browser evidence are recorded; onboarding activation has later local proof. | One current connected pass covering schedule, availability, request status and workspace switch/back-refresh; hosted proof. |

## First audit decision

Do **not** start a blanket rebuild. The MVP appears to have substantial local
implementation already. The next narrow audit is Phase A (F01/F02/F10/F11),
because every later workflow depends on correct tenant, role, invitation and
employee-Hub context. Its output is a current actor-flow matrix, not code.
