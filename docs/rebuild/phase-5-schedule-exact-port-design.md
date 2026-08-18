# Phase 5 Schedule exact-port design

Status: Phase 5A through 5D are implemented and locally verified. Old-runtime visual
parity remains unverified; Phase 6 requires separate approval.

## Objective

Replace the current Schedule foundation placeholder at `/app/schedule` with the
approved `EXACT_PORT` manager scheduling experience. Old Newfork is the behavioral
and visual source of truth for this route only. The old implementation may be read,
measured, and tested, but its monolithic component structure and legacy domain
coupling are not architecture requirements.

## Evidence boundary

Verified in the clean project:

- The exact-port app shell and mini-calendar already navigate Schedule through URL
  date and day/week state.
- Canonical locations, jobs, shift types, scheduling settings, employees,
  assignments, roles, and employee onboarding availability foundations exist.
- The current Schedule route is a static grid placeholder with no persistence.

Static old-source evidence:

- The old Schedule page orchestrates filters, daily/weekly navigation, named drafts,
  edit sessions and locks, grid interactions, conflict display, publish/unpublish,
  templates, auto-fill review, and export.
- The old page and grid are large orchestration surfaces. Their behavior is evidence;
  their file boundaries are not a template for the clean implementation.

Old runtime parity screenshots and interaction recordings have not yet been captured.
They are required before visual parity can be declared.

## Protected behavior contract

The following behavior and visual interaction model must remain equivalent:

- URL-backed week and day navigation, Today behavior, and mini-calendar integration.
- Weekly and daily grid modes.
- Location, shift-type, job/department, and employee filters, including reset and
  active-filter behavior.
- Separate and unified multi-location views, employee grouping/sorting, sticky
  headers, unassigned rows, shift badges, totals, and employee context.
- Shift create, edit, move, copy, delete, multi-select, keyboard dismissal, context
  menus, and drag/drop behavior where present in the reference route.
- Named draft selection, blank draft creation, overwrite/save-as behavior, and the
  distinction between draft and published schedule state.
- Edit-session acquisition, heartbeat, timeout, release, stale-write rejection, and
  lock conflict/takeover behavior.
- Closed-week/read-only behavior.
- Soft warnings that require an explicit reviewed override and hard blockers that
  cannot be overridden.
- Publish preflight, diff/review, scoped publication, publish completion, and
  unpublish/restore behavior.
- Schedule templates, auto-fill review if it remains reachable in the reference
  route, and schedule-only export compatibility.
- Permission and location-scope visibility.

The implementation must not silently simplify any protected interaction. If static
source and observed runtime behavior disagree, observed runtime wins and the
discrepancy is documented.

## Clean architecture

The clean implementation will preserve behavior through explicit boundaries:

- Shared schemas define schedule references, shifts, drafts, publication state,
  conflicts, lock leases, templates, and export requests.
- PostgreSQL owns tenant/location authorization, revision checks, lock arbitration,
  draft mutation, publication transactions, and append-only schedule events.
- Fastify exposes authenticated workspace-scoped orchestration endpoints and does
  not trust client-computed permissions, conflicts, publication state, or totals.
- TanStack Query owns server state. URL parameters own shareable period/filter state.
  Short-lived pointer, selection, drawer, and menu state remains local UI state.
- React grid components receive normalized view models. The route component does not
  become a second copy of the old 6,000-line orchestrator.

No new state library, drag/drop library, hosted service, or background-job provider
is approved by this document. A dependency is added only if the parity fixture proves
that native pointer/keyboard behavior cannot meet the contract, followed by a separate
approval request.

## Data invariants

- Every shift belongs to one workspace and location and references a canonical
  employee, job, and optional shift type valid for that workspace.
- Shift time ranges use the location timezone contract and correctly represent
  overnight shifts without converting business dates in the browser.
- Draft identity and publication identity are separate. Publishing is transactional
  and never mutates a draft into an ambiguous mixed state.
- Mutations carry an expected revision or lock lease. Stale or unauthorized writes
  fail closed.
- Publication preflight and commit evaluate the same canonical inputs in one
  transaction boundary or through a tamper-evident preflight token.
- Hard blockers cannot be overridden. Soft overrides record category, actor, reason,
  source revision, and timestamp.
- Unpublish never destroys schedule history. Schedule events contain identifiers and
  workflow metadata, not private profile or forbidden payroll/compliance payloads.
- Archived employees, locations, jobs, and shift types remain legible in historical
  schedules but are unavailable for new assignments.

## Implementation slices

### Phase 5A: parity fixture and read-only grid

- Capture the old desktop route at agreed fixtures and viewport sizes.
- Freeze a synthetic parity fixture covering multiple locations, jobs, employees,
  unassigned shifts, overnight shifts, closures, availability, and publication state.
- Add the clean schedule read model, permission/location-scope tests, URL state,
  filters, day/week modes, grid shell, sticky behavior, totals, and empty/loading/error
  states.
- Do not expose editing controls until 5B is ready.

Checkpoint: visual geometry, filters, daily/weekly behavior, and role/location reads.

### Phase 5B: editing, drafts, and locks

- Add shift form/drawer, create/update/move/copy/delete, selection, context actions,
  and drag/drop parity.
- Add named drafts and edit-session lease lifecycle with heartbeat and stale-write
  handling.
- Cover concurrent editors and cross-location denial at the database and API layers.

Checkpoint: mutation parity, draft lifecycle, and two-session lock proof.

### Phase 5C: blockers and publication

- Implement the reference soft/hard conflict taxonomy without importing payroll,
  labor, overtime, jurisdiction, or compliance blockers.
- Add preflight review, explicit soft overrides, atomic scoped publish, publication
  status, unpublish, and closed-week behavior.
- Verify that hard blockers cannot be bypassed by direct API or RPC calls.

Checkpoint: blocker matrix and publish/unpublish parity.

### Phase 5D: templates and schedule export

- Add schedule template save/apply behavior and auto-fill review only where confirmed
  by the parity fixture.
- Add schedule-only export presets, preview, and download compatibility.
- Exports must not include time entries, payroll, labor cost, overtime, tips, or
  compliance data.

Checkpoint: template round-trip and deterministic export fixtures.

## Permissions

Phase 5 will split the existing broad schedule permission into grantable capabilities
while retaining dependency validation:

- `schedule.read`
- `schedule.manage`
- `schedule.publish`
- `schedule.templates.manage`
- `schedule.export`

Owner and Admin receive all. Manager defaults will be proposed from old behavior in
5A and must be confirmed before migration. Employee retains only the read behavior
required by the current shell; manager Schedule responses must never become an
employee self-service schedule API by accident.

## Deliberately excluded

- Line-up and Schedule Requests, which remain Phase 6.
- Employee Hub Schedule, Shift Hub, swaps, and employee-facing availability changes,
  which remain Phase 7.
- Time clock, breaks, time entries, labor costing, overtime, payroll, tips, pay
  classifications, work authorization, and compliance rules.
- Legacy cron exports, payroll handoffs, or notifications whose only purpose belongs
  to an excluded domain.
- Realtime collaboration until baseline lock and publication parity is proven. It may
  be proposed later as an optional enhancement, not silently added.

## Verification contract

Each slice requires:

- focused shared/API/web tests and database tenant/location negative tests,
- clean migration replay and the full pgTAP suite,
- root typecheck, lint, unit tests, and production build,
- desktop and mobile browser checks with horizontal-overflow and console inspection,
- old/new fixture comparison for protected visual and interaction behavior,
- explicit proof that forbidden legacy domain fields and routes were not introduced.

Phase 5 is complete only after all four slices pass. A green 5A read-only grid is not
publish, lock, blocker, template, export, or full exact-port proof.

## Approval gate

Approval of this document authorizes Phase 5A implementation only. Results and parity
evidence are reviewed before Phase 5B begins. No external service or new dependency is
authorized.
