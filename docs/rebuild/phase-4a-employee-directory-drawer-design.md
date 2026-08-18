# Phase 4A employee directory and drawer design

Status: proposed for implementation approval. This document authorizes no code,
schema, email, or runtime changes.

## Scope decision

Phase 4A delivers the manager-facing employee foundation:

- active and archived employee directory routes,
- employee record creation and editing,
- the exact-port Employee Drawer shell,
- location and job assignments,
- invitation and workspace-access state,
- archive and restore with explicit access handling,
- a manager-visible onboarding summary,
- append-only employee lifecycle history.

The employee self-service onboarding journey defined in Phase 2B is Phase 4B. Phase
4A may create and resend an invitation and show the resulting state, but it does not
implement private-profile entry, SSN collection, document upload, acknowledgement
execution, availability submission, manager review, or activation approval.

## Evidence boundary

The handoff documents are the product contract. The old application was inspected
read-only to recover the exact drawer shell and useful directory behavior; it is not
the default architecture or data model. Static source evidence does not establish
runtime parity.

## Routes and URL contract

- `/app/employees` is the canonical active directory.
- `/app/employees/archive` is the canonical archived directory.
- `?employeeId=<uuid>&section=<key>` opens an existing employee in the drawer.
- `?mode=create&section=profile` opens the create flow.
- Section keys are `profile`, `employment`, `availability`, `documents`, `access`,
  and `history`.
- Closing the drawer removes only drawer-owned query parameters.
- Invalid or unauthorized employee IDs produce a non-disclosing not-found state and
  clear the drawer without changing the directory route.

`/app/employees/org-chart` is not implemented in Phase 4A. It remains a reserved
handoff route until a separate scope decision.

## Directory contract

The directory is a quiet, dense operational table rather than a copy of the legacy
cockpit.

### Default surface

- Search by display name and employee code. Authorized users may also match the
  invitation email, but email is not a default table column.
- A compact status control provides `Active`, `Invited`, `Needs attention`, and
  `Archived`. `Archived` navigates to the archive route.
- Default columns are employee, employment status, primary location, primary job,
  access role, onboarding status, and start date.
- Secondary locations and jobs are summarized and available in the drawer.
- Clicking a row opens Profile. Clicking an assignment cell deep-links to Employment.
- Sorting is server-backed and deterministic, with employee name and ID as tie-breakers.
- Pagination is server-backed. Filters, search, sort, and page are URL-backed so a
  useful directory view can be refreshed or shared.
- Empty, loading, error, no-results, and permission-denied states are distinct.

The list endpoint returns only directory fields. It never returns date of birth,
address, emergency contact, SSN metadata, document objects, acknowledgement evidence,
or private phone data.

### Derived display states

The server derives one display state from canonical rows:

- `not_invited`: active employee record with no live invitation or membership,
- `invited`: live invitation or invited membership,
- `onboarding`: accepted account with an unfinished onboarding case,
- `needs_attention`: submitted/changes-requested onboarding or a blocked prerequisite,
- `active`: active membership and no outstanding activation gate,
- `archived`: employee record has `archived_at`.

The client cannot write this composite state directly.

## Exact-port Employee Drawer shell

The following shell behavior is an EXACT_PORT requirement:

- right-side sheet opening and dismissal feel,
- full viewport width on small screens and `880px` maximum width from `sm` upward,
- fixed `236px` summary/navigation rail on desktop,
- existing compact typography hierarchy,
- section order: Profile, Employment, Availability, Documents, Access, History,
- grouped rail structure: person, paperwork, account,
- fixed section header above independently scrolling content,
- fixed footer with lifecycle action on the left and Cancel / Invite / Save or Next
  actions on the right,
- visible unsaved-change indicator,
- Escape and outside-click dismissal, while dialogs opened from the drawer remain
  independently dismissible without collapsing the drawer,
- direct rail navigation and the deliberate scroll-edge transition between adjacent
  sections,
- archived records open read-only except for authorized restore actions.

The rail collapses to an accessible compact section selector below the desktop
breakpoint; the drawer remains full-width and does not retain a 236px rail that would
crush the content. This is the responsive interpretation of the exact shell.

Shell visual and interaction parity will be proven with side-by-side screenshots,
dimension assertions, keyboard tests, and scroll-transition tests against the
read-only reference. Content parity is explicitly not required.

## Drawer content contract

### Profile

- Manager-entered display/preferred name and initial invitation email.
- Server-generated immutable employee code.
- Clear ownership labels when a field becomes employee-owned after account linking.
- Linked-account email and private contact fields are read-only or absent for managers.

### Employment

- Start date, internal manager note, active/archived state.
- Multiple location and job assignments with exactly one primary location and one
  primary job when assignments exist.
- Archived locations or jobs remain visible on historical assignments but cannot be
  selected for new assignments.

### Availability

- Phase 4A shows a truthful summary state: not requested, not submitted, submitted,
  or unavailable because the employee has no linked account.
- Editing and employee submission belong to Phase 4B.

### Documents

- Phase 4A shows requirement counts derived from active document-type configuration:
  not issued, pending, needs review, and complete.
- It does not expose files or implement uploads, review, or expiry handling.

### Access

- Invitation state, resend/revoke actions, selected workspace role, and location scope.
- No time-clock PIN, payroll access, pay classification, work authorization, or
  compliance controls.
- A linked account's identity email is not silently replaced by editing an employee
  record.

### History

- Append-only lifecycle events for create, edit, assignment changes, invitation
  actions, archive, restore, membership suspension, and access restoration.
- Events show actor, time, action, and non-sensitive summary. They never contain raw
  invitation tokens or private onboarding payloads.

## Data ownership

Phase 4A introduces only the rows required by this slice:

- `employee_profiles`: workspace-owned employee identity, nullable linked `user_id`,
  display fields, server-generated employee code, start date, internal note, revision,
  and archive metadata.
- `employee_location_assignments`: workspace, employee, location, primary flag, and
  active interval.
- `employee_job_assignments`: workspace, employee, job, primary flag, and active
  interval.
- `employee_invitations`: employee, intended email, role and location scope snapshot,
  token hash, expiry, status, attempt metadata, and acceptance metadata.
- `employee_access_snapshots`: immutable pre-suspension role and location-scope
  snapshot used only to offer an explicit restore choice.
- `employee_events`: append-only, non-sensitive lifecycle audit.

Every business row carries `workspace_id` and uses tenant-consistent composite foreign
keys. Raw invitation tokens are returned once by the server for delivery and are never
stored. The existing `membership_status` enum gains `pending_activation`; invitation
acceptance creates this restricted membership and never grants normal active access.
Phase 4B extends this foundation with the private profile, onboarding case,
snapshotted requirements, sensitive identifier, employee documents, acknowledgement
evidence, and availability versions already defined by approved contracts.

An employee record and a workspace membership are separate. `employee_profiles.user_id`
is nullable until invitation acceptance and unique per workspace when present. An
accepted invitation binds the authenticated user, employee, and existing or new
`pending_activation` membership transactionally; it never creates a duplicate employee
or active membership silently.

## Permissions

Phase 4A adds four grantable permissions:

- `employees.read`: view directory-safe fields and authorized drawer summaries.
- `employees.manage`: create/edit employee records and assignments; requires
  `employees.read`.
- `employees.archive`: archive/restore employee records; requires `employees.read`.
- `employee_access.manage`: invite, resend, revoke, assign role/scope, suspend, or
  restore workspace access; requires `employees.read` and `roles.read`.

Built-in defaults:

| Role     | Read | Manage | Archive | Access |
| -------- | ---- | ------ | ------- | ------ |
| Owner    | Yes  | Yes    | Yes     | Yes    |
| Admin    | Yes  | Yes    | Yes     | Yes    |
| Manager  | Yes  | Yes    | No      | No     |
| Employee | No   | No     | No      | No     |

Custom manager/employee access-class roles may receive the grantable permissions while
respecting dependencies. Owner-only invariants remain protected regardless of grants.
Employee Hub and My Team receive separate self/team-scoped authorities in later phases;
they do not reuse broad directory access.

## Mutation and service boundary

Tenant-isolated reads and ordinary record/assignment mutations use RLS plus
transactional security-definer RPCs with expected revisions. Fastify owns invitation
token issuance, resend/revoke/acceptance, email delivery, rate limits, and other
secret-bearing orchestration.

Required manager-facing operations:

- list active or archived employees with server filters/sort/pagination,
- load one permission-trimmed drawer detail,
- create/update an employee and assignments transactionally,
- archive or restore an employee,
- create, resend, or revoke an invitation,
- suspend or explicitly restore linked workspace access.

All retryable mutations require an idempotency key or expected revision. Conflict,
already-accepted, expired, revoked, duplicate-email, archived-match, and stale-revision
responses are explicit and do not overwrite newer state.

## Archive and restore

- Archive never hard-deletes an employee or historical assignments/events.
- Archiving a linked employee requires `employees.archive`. Suspending their workspace
  access additionally requires `employee_access.manage`; the confirmation describes
  both effects separately.
- A caller without access authority may archive an unlinked record, but cannot archive
  a linked employee while leaving active access behind. The server rejects that unsafe
  partial operation.
- The current role and location scopes are snapshotted before suspension.
- Restore reactivates the employee record only. Restoring workspace access is a
  separate, explicit checked choice shown only to an authorized actor, with the role
  and scopes reviewed before commit.
- Restoring access never grants permissions broader than the actor may assign and never
  silently reuses a deleted/invalid custom role or archived location.
- A user cannot archive their own linked employee record, and the existing last-active-
  owner database protection remains authoritative.

## Privacy and security

- RLS denies cross-workspace reads and writes for every employee table.
- Location-scoped users can see and manage only employees with an active assignment in
  their authorized locations; mixed-scope updates are rejected transactionally.
- Directory and detail projections are separate to prevent accidental private-field
  expansion.
- Managers do not receive SSN values, SSN ciphertext, private profile payloads,
  document objects, or acknowledgement evidence through this slice.
- Employee identifiers come from authorized server context for self-service routes;
  client-supplied IDs are never trusted for employee-owned data.
- Invitation acceptance validates token hash, expiry, revocation, intended email, and
  authenticated identity in one transaction. Tokens are single-use and acceptance
  yields only `pending_activation` access.
- Audit payloads are allow-listed and exclude raw tokens and private onboarding data.

## Implementation sequence

1. Shared schemas and the four permissions with dependency enforcement and built-in
   grants.
2. Employee, assignment, invitation, access-snapshot, and event migrations with RLS,
   constraints, RPCs, and pgTAP coverage.
3. Fastify invitation lifecycle endpoints and delivery abstraction.
4. Active/archive directory routes with URL-backed table state.
5. Exact-port drawer shell and the six Phase 4A section surfaces.
6. Archive/restore and invitation end-to-end browser verification.
7. Exact-shell screenshot and interaction parity verification on desktop and mobile.

## Acceptance criteria

- Owner/admin can create an employee, assign multiple locations/jobs, choose primaries,
  and send or defer an invitation.
- Manager can read/manage operational records in assigned locations but cannot archive
  or manage access by default.
- Employee users cannot open the management directory.
- Active, invited, needs-attention, and archived filters are server-derived and stable
  across refresh/share.
- Directory responses contain no private onboarding fields.
- Drawer deep links, section links, dismissals, keyboard behavior, dirty-state warning,
  fixed footer, responsive behavior, and 880px/236px desktop dimensions pass tests.
- Invitation tokens are hashed, expiring, single-use, rate-limited, and idempotent.
- Accepted invitations create a self-scoped `pending_activation` membership; they do
  not expose normal workspace routes before Phase 4B approval.
- Cross-tenant and out-of-location employee access fails at the database boundary.
- Archive preserves history, safely suspends linked access, and blocks self/last-owner
  removal paths.
- Restore does not silently restore access or broaden role/location scope.
- Forbidden legacy domains and time-clock PIN surfaces are absent from schema, API,
  UI, tests, and user-facing copy.
- Root typecheck, lint, unit/integration tests, database tests, production build, and
  authenticated desktop/mobile browser smoke are reported separately.

## Product decisions

### Preserved

- Active and archived employee cohorts, search, sorting, assignments, invitation state,
  archive/restore, URL-deep-linked details, and the exact Employee Drawer shell.

### Changed and improved

- The directory becomes a focused server-backed table with privacy-minimal defaults.
- Employee lifecycle, invitation, onboarding, and workspace membership remain separate
  canonical states.
- Archive and access suspension are explicit, transactional, and auditable.
- Four coherent permissions replace the legacy per-section alias matrix.

### Intentionally omitted

- Org chart, bulk import, export, column personalization, bulk actions, messaging, and
  employee self-service onboarding in Phase 4A.
- Payroll, pay rates/classification, work authorization, compliance packets, time
  entry, kiosk, and time-clock PIN behavior from the old app.

### Research-derived

- Current workforce products expose employed/archived, invitation, and onboarding as
  separate filter dimensions and support resend plus archive/unarchive workflows. This
  supports keeping canonical states separate while presenting a derived directory
  status, without copying any vendor's UI or payroll coupling.

Research reference:

- Deputy People tab: https://help.deputy.com/hc/en-au/articles/9629874716943-Introduction-to-the-People-tab
- Deputy employee archive and invitation FAQ: https://help.deputy.com/hc/en-au/articles/4663058084879-People-FAQs

## Approval gate

Implementation begins only after explicit approval of this Phase 4A contract. Phase 4B
employee onboarding remains a separate discussion and approval gate.
