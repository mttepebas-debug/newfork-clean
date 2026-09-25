# Onboarding, Multi-Tenant Access, and Lifecycle Plan

Status: authoritative planning artifact for the current decision workshop.
Implementation has not started from this document. Billing and trial are planned
but explicitly excluded from the onboarding implementation pass.

Evidence boundary:

- Reference app inspected at `C:\Users\TheWe\newfork`.
- Target app inspected at `C:\Users\TheWe\Documents\Codex\newfork-clean`.
- The target worktree is dirty and contains unrelated work. Implementation must
  preserve that work and begin with a fresh diff and process audit.
- No browser, database reset, hosted smoke, or release verification was run for
  this planning document.
- Customer-facing language uses `organization`; existing code and schema may
  continue to use `workspace` until a deliberate rename phase.

Decision labels:

- **Locked**: accepted product behavior.
- **TBD**: intentionally unresolved and not an implementation assumption.
- **Deferred**: acknowledged future capability outside V1.
- **Existing behavior to verify**: preserve if confirmed; do not rewrite merely
  because it appears in this plan.

## Executive Decision

Newfork will use one global account identity with organization-scoped employee
records, memberships, roles, onboarding cases, schedules, documents, tasks, and
billing state. The same account may belong to many organizations and may have a
different role in each. No organization may infer or access another
organization's data, including indirect signals such as cross-organization
schedule conflicts.

The end-to-end lifecycle is:

1. Global account signup or sign-in.
2. Intent resolution: accept an invitation, start a business organization, or
   wait for an invitation.
3. Four-step owner onboarding for a new organization.
4. Post-onboarding helper checklist and 14-day trial activation.
5. Employee record creation, optional invitation, invitation acceptance, and
   tenant-specific employee onboarding.
6. Automatic activation or configured final approval.
7. Active organization access with strict role and location enforcement.
8. Suspend, revoke, archive, rehire, ownership transfer, organization closure,
   and global account deletion as separate lifecycle operations.

The reference app supplies useful interaction patterns, but it is not a source
of truth for policy. This document supersedes earlier proposals for V1 SSN
collection, mandatory home address, configurable built-in onboarding fields,
three-step owner setup, and a single organization context shared across browser
tabs.

## Reference App Audit

### Patterns To Preserve

- Organization-name-first owner setup.
- Multiple locations plus department/job draft editing.
- Owner wizard draft persistence across Back, Next, refresh, and resume.
- Assignment-aware employee creation and invitation payloads.
- Email-bound invitation acceptance with account mismatch handling.
- Server-derived employee onboarding progress and first-actionable-step routing.
- A restricted pending shell that does not expose normal application data.
- Re-entry into document correction flows after rejection or expiration.
- Post-onboarding setup guidance that sends users to real product pages.

### Patterns To Replace Or Tighten

- Do not treat an empty membership response as an instruction to create a random
  organization. Resolve signup intent and invitations first.
- Do not combine employee creation, account invitation, onboarding, membership
  activation, and employment status into one operation or status field.
- Do not reuse the reference app's older active/awaiting-approval semantics.
- Do not let client step pointers determine onboarding completion.
- Do not collect SSN, tax, payroll, or I-9 data in V1.
- Do not collect mandatory home address without an active product requirement.
- Do not allow finish-later to unlock normal employee application access.
- Do not send team invitations before owner onboarding commits successfully.

### Current Target Gaps And Risks

- The current target owner wizard is simpler than the four-step target flow and
  needs a contract audit before any rewrite.
- Billing and trial are not an active target surface. They remain planning-only.
- Existing settings spread document, acknowledgement, scheduling, kiosk, and
  organization concerns across separate modules. Preserve those ownership
  boundaries unless the implementation plan explicitly changes them.
- The current foundation migration already prevents removal or demotion of the
  last active owner. Ownership transfer must build on, not bypass, that invariant.
- `audit_events.workspace_id` currently cascades on workspace deletion. The
  required minimal deletion tombstone therefore cannot rely on the current
  tenant-owned audit row surviving deletion.
- `user_workspace_preferences.active_workspace_id` currently cascades on
  workspace deletion. Default organization cleanup must remain deterministic.

## Domain Model And State Boundaries

### Global Account

**Locked**

- One authentication identity and one current login email.
- Email comparison is case-insensitive. Provider-specific dot and `+tag`
  transformations are not treated as equivalent.
- One optional global phone in V1. It is user-owned but not SMS verified.
- No global canonical legal name shared across employers.
- Account profile lists organization-specific verified legal names read-only,
  labeled by organization.
- Global account deletion and organization deletion are separate operations.

### Organization-Owned Records

**Locked**

- Employee roster record, legal name, birthday, emergency contact, job,
  location, role, availability, documents, acknowledgements, onboarding case,
  schedule, and todos are tenant-owned.
- An employee may exist without a global account, email, invitation, or
  onboarding case.
- Employee creation is workforce setup. Invitation is application access setup.
- Invitation acceptance links a global account to exactly one employee record in
  that organization.
- The same global account cannot link to two employee records in one organization.
- Duplicate employee names are allowed with a non-blocking duplicate warning.

### Independent State Machines

**Locked**

- Invitation: `Pending`, `Accepted`, `Declined`, `Revoked`, `Expired`.
- Delivery: `Queued`, `Sent`, `Delivered`, `Bounced`, `Complained`.
- Onboarding: `Not started`, `In progress`, `Pending review`, `Completed`,
  `Canceled`.
- Membership access: `Pending`, `Active`, `Suspended`, `Revoked`.
- Employee lifecycle: preserve and verify the existing `Active / Archived`
  behavior.
- UI labels may project a combined state, but persistence and authorization must
  not collapse these state machines into one field.

## Signup, Intent Resolution, And Routing

### Entry Intents

**Locked**

- `Start free trial`: create or reuse a global account, then start owner setup.
- Invitation link: create or reuse a global account, then process that invitation
  only. It must never create an owner organization or trial implicitly.
- Generic signup: create a global account, then resolve invitations and business
  intent after email verification.
- Account creation by itself does not create an organization, membership, or
  trial.

### Active Invitation Detection

**Locked**

- Search for invitations only after the account email is verified.
- A direct invitation link routes to that invitation.
- Generic signup or website entry with an active invitation shows `Active
  invitation found` before routing elsewhere.
- The intent screen offers `Join an invited organization` and `Start my own
  organization`.
- Choosing business setup leaves invitations pending; it does not decline them.
- Choosing invitation processing opens the invitation list and accept/decline
  actions.
- Existing users with active organizations are not blocked from their work by a
  new invitation. Pending invitations remain visible in the switcher.
- A user may accept one invitation and begin onboarding while other invitations
  remain pending.

Safe invitation preview contains organization name, target role, location, and
expiration date. It does not contain inviter identity, employee lists, or other
organization data.

### Accept And Decline

**Locked**

- Acceptance requires a valid, unexpired, single-use token and an exact verified
  email match.
- Existing matching account links; otherwise the invitation path creates an
  account first.
- Wrong-account UI shows only a masked target email and a switch-account action.
- Acceptance is atomic and rechecks expiration, revocation, duplicate links, and
  membership state at commit time.
- Decline requires an explicit second confirmation stating that it cannot be
  undone.
- Decline invalidates that token permanently but preserves the employee record.
- Rejoining after decline requires a new invitation.
- The organization sees `Declined`; the user is not required to provide a reason.
- The invitation sender receives in-app and email notification of decline.

### Zero-Organization Acquisition

**Locked**

- A verified account with no active or pending organization sees an acquisition
  state, not a dead-end `organization not found` error.
- Primary action: `Create your business organization`.
- Secondary action: `I'm waiting for another invitation`.
- The waiting view provides `Check for invitations` and rechecks on login and
  page focus without continuous polling.
- The waiting view may later start business setup.
- Normal organization switcher views do not promote organization creation.
- Any verified global user may create a business organization from the website,
  regardless of roles in existing organizations.
- An authenticated user reuses the same global account rather than creating a
  second account.

## Multi-Tenant Isolation

### Authorization

**Locked, P0 security requirement**

- Frontend filtering is never an authorization boundary.
- Every organization read and mutation validates current membership, status,
  role/permission, location scope, and resource ownership on the server.
- Database RLS independently enforces organization scope.
- Cross-tenant foreign relationships are prevented with organization-aware
  constraints or equivalent structural guarantees.
- A resource ID from another tenant returns a generic `404`, not a response that
  confirms the resource exists. The attempt is security-audited.
- Self-service onboarding derives tenant and employee identity from the account,
  invitation, membership, and onboarding case; it never trusts a client-supplied
  employee ID.

### Storage, Cache, And Async Work

**Locked**

- Employee documents use private storage and short-lived authorized access URLs.
- Cache keys, local drafts, realtime channels, optimistic state, and background
  requests are organization-keyed.
- Switching organizations cancels or isolates old tenant requests and state.
- Emails, exports, notifications, and jobs carry immutable organization IDs and
  revalidate resources when executing.
- Export scope follows role scope. Export files are private, requester-only, and
  expire after 24 hours.
- Cross-organization schedules never produce employer-visible ghost shifts,
  conflicts, availability, or busy signals.

### Support Access

**Locked**

- Platform support has no default tenant-data access.
- Owner-approved support access is reasoned, time-limited, and fully audited.
- Security/legal `break-glass` access is restricted, time-limited, reasoned,
  audited, and disclosed to the owner unless legally prohibited.

### Audit Visibility

**Locked**

- Owner/admin see organization audit history.
- Manager sees own and location-scoped operational audit events.
- Employee has no organization audit-log access.
- Organization users, including owner, cannot edit or selectively delete audit
  events.
- Exact audit retention remains **TBD**.

## Organization Switching

### Login Routing

**Locked**

- Default organization is opt-in and only an active membership may be selected.
- One active organization routes directly there even when pending invitations
  exist.
- Multiple active organizations with no valid default route to the switcher.
- A valid active default may bypass the switcher on a later login.
- Pending and suspended organizations appear with role and status but cannot
  enter the normal application.
- Pending selection routes to onboarding/status. Suspended selection routes to a
  limited status screen without sensitive internal reasons.
- Invalid, suspended, revoked, or terminated defaults are cleared and are not
  automatically restored after reactivation.

### Switch Behavior

**Locked**

- Manual switch lands on a safe destination page, never an equivalent stale
  resource route.
- Deep links into another organization require membership validation and an
  explicit switch confirmation, then land on the safe organization home.
- Switch navigation replaces browser history so Back does not reopen stale
  tenant content.
- Different browser tabs may intentionally use different organizations.
- Tenant context is encoded in the URL/tab context, not one browser-global
  active-organization variable.
- Each tab independently scopes cache, drafts, realtime, and requests. Global
  logout closes all tabs.
- Organization switcher placement in the current app is **TBD**.

## Roles And Access

### Built-In Roles

**Locked**

- Exactly one role per organization membership: owner, admin, manager, employee.
- Exactly one primary owner in V1. An active organization can never be ownerless.
- Owner has organization-wide access plus protected owner actions.
- Admin has organization-wide management except billing, ownership transfer, and
  organization deletion.
- Manager is fail-closed and sees no employee or schedule data without assigned
  locations.
- Manager may hold multiple location scopes.
- Employee accesses only own profile, onboarding, availability, schedule, and
  requests. Employee cannot see the Employees navigation item or page.

Protected owner-only capabilities cannot be granted to custom roles:

- Billing and payment-method management.
- Ownership transfer.
- Organization deletion.

Custom-role permission and hierarchy design is **TBD** and deferred. MFA
requirements for privileged roles are also **TBD**.

### Employee Directory And Drawer

**Locked**

- Owner/admin list and open all organization employee drawers.
- Admin may edit manager and employee records. Owner and peer-admin controlled
  fields are read-only to admin.
- Manager lists employees in assigned locations but opens/edits drawers only for
  employee-role users in scope.
- Owner may edit own job, location, and `Exclude from schedule`, but cannot
  change own owner role in the drawer.
- Admin and manager may open their own drawer but cannot edit organization-owned
  fields on themselves.
- Employees edit user-owned contact/profile fields through self-service, not the
  Employees drawer.
- Owner manages all lower roles; admin manages manager/employee; manager manages
  employee only. No user changes a peer or higher role.
- Role or scope reduction takes effect immediately in open sessions and caches.

### Organization Structure And Settings

**Locked**

- Only owner/admin create, rename, or archive locations, departments, and jobs.
- A department cannot be archived while it has active jobs.
- Location/job archive requires resolving active assignments and future shifts;
  history keeps the old label.
- Jobs are organization-wide, belong to a department, and are independent of
  locations.
- Owner/admin manage document requirement rules.
- Manager may review scoped employee documents but cannot alter document rules.
- Owner/admin manage organization-wide scheduling preferences.
- Manager may view but not change organization-wide scheduling preferences.
- Owner/admin manage all kiosk locations. Manager manages kiosks only in assigned
  locations. Employee has no kiosk administration access.

### Manager Location Operations

**Locked**

- Manager cannot expand own location scope.
- Manager may remove an employee from the manager's own location but cannot
  archive the organization-wide employee record.
- Removing the final normal location creates an owner/admin decision task.
- Owner/admin must assign another location or archive the employee.
- If `Remote` or `Exclude from schedule` is already enabled, manager may remove
  the final scoped location without owner/admin approval.
- A zero-location remote/excluded employee is visible only to owner/admin.
- Future shifts affected by location removal require an explicit choice:
  `Unassigned`, cancel shifts, or cancel the removal operation.
- Published-shift changes notify the employee; draft-shift changes do not.

Normally an active employee requires at least one location and one job. If
`Remote` or `Exclude from schedule` is enabled, both requirements are waived.
Turning both flags off requires valid location and job assignments before save.
Existing Schedule add/edit behavior remains an **existing behavior to verify**;
the onboarding project must not redesign it.

### Shared Employees Inside One Organization

**Locked**

- A manager may see complete shift details for a scoped employee's shifts in
  another location of the same organization.
- In the manager's current location grid, that shift appears as a distinct,
  read-only, non-interactive ghost badge with source location and lock treatment.
- A ghost shift is a hard overlap conflict and prevents another overlapping
  assignment.
- This behavior never crosses organization boundaries.

## Owner Onboarding

### Four-Step Wizard

**Locked**

1. `Organization basics`: organization name only.
2. `Locations`: one or more locations. Location name is required; full address
   is optional.
3. `Departments & jobs`: one or more departments and jobs. At least one
   department and one job belonging to it are required.
4. `Add your team`: visible and optional. Supports multiple manual employee rows
   and optional invitations.

Organization names are not globally unique. Immutable, non-sequential
organization IDs are authoritative; names and slugs are never authorization
keys.

### Team Draft Rules

**Locked**

- Employee first and last name are required.
- Normal employee requires location and job.
- Remote/excluded employee may omit location and job.
- Email is required only when invitation after setup is selected.
- Invitation role is required when invitation is selected.
- Invalid optional rows are not silently skipped; owner must correct or remove
  them before Finish.
- Bulk import is **deferred**. V1 uses manual rows and later Employees-page entry.
- Invitation means application access, not new-hire status.

### Commit, Trial, And Invitation Dispatch

**Locked**

- No real invitation or email is created before owner onboarding finishes.
- Team rows store only draft invite intent during the wizard.
- Finish atomically commits organization setup, locations, departments, jobs,
  employees, owner readiness, and trial activation.
- Successful server-side Finish starts the 14-day trial even if the browser does
  not render the dashboard afterward.
- Invitations enter the outbox only after organization setup and trial activation
  commit successfully.
- Email delivery failure never rolls back employee or organization creation.
- Finish is idempotent across double-click, refresh, timeout, and retry.

### Owner Employee Record

**Locked**

- Organization creation automatically creates an employee record linked to the
  owner account.
- It initially uses the first created location and job.
- Owner/admin may later change it or enable `Exclude from schedule`.
- Exclusion affects planning visibility only; it does not alter owner role,
  application access, or historical shifts.

### Draft Lifecycle

**Locked**

- Only one incomplete organization onboarding draft per user. Re-entering Start
  Trial resumes it.
- Draft auto-saves each step and resumes across refresh, logout, and device.
- Optimistic revision checks prevent an older tab from overwriting newer edits.
- `Reset / Start over` is available only before Finish/trial. It retains global
  account, draft organization ID, and owner link while clearing wizard data.
- Because invitations are not sent before Finish, reset has no external invites
  to revoke.
- Draft cancellation permanently deletes draft organization/setup data while
  preserving the global account and other memberships.
- Inactive drafts expire 90 days after last activity following reminders.
- After Finish, reset disappears; changes occur in Settings and Employees.

## Post-Onboarding Helper Checklist

**Locked**

- The checklist is the guided product tour; no separate mandatory tour exists.
- Owner and admin each receive independent user-specific progress.
- It may be closed and reopened from Settings.
- Demotion hides it; later re-promotion restores the user's prior progress.
- Optional visit tasks navigate to the real page and mark that visit complete;
  they must not falsely claim that setup itself is complete.
- Optional tasks include Employees, kiosk settings, document settings, schedule
  settings, first schedule view, billing, and other post-onboarding setup.
- Employee entry, kiosk, payroll, and documents do not block owner onboarding.

`Set scheduling preferences` is required for checklist completion only:

- `Week starts on` and `12h / 24h` initially have no explicit user selection.
- The Settings page cannot save until both are selected.
- Schedule remains usable through existing fallback behavior before selection.
- A later admin must visit and confirm existing organization values for that
  admin's personal checklist completion.
- Personal time-format override is **TBD**.

## Employee Identity And Profile

### Legal Name

**Locked**

- No preferred name or nickname in V1.
- Employer-entered first/last name is provisional organization data.
- Employee confirms it during that organization's onboarding.
- Legal name is organization-scoped and displayed throughout that organization,
  including Schedule.
- Organizations do not compare, synchronize, reveal, or overwrite each other's
  legal names.
- If employee changes the provisional name, activation waits for owner/admin
  approval.
- Rejection preserves the invitation and pending case, provides a reason, and
  permits correction/resubmission.
- After confirmation, employee cannot directly change legal name. Owner/admin
  may make an audited correction with employee notification. Manager cannot.

### Global Phone And Coworker Sharing

**Locked V1 model**

- No SMS verification exists anywhere in V1.
- Website signup does not request phone.
- Global phone is optional in Account/Profile until employee onboarding requires
  confirmation.
- Phone cannot be used for login, MFA, or account recovery in V1.
- Employer may enter a provisional phone before account linking.
- If global phone exists, it wins over a different provisional phone.
- If global phone is absent, employee confirms/corrects the provisional number
  or enters one; the confirmed value becomes global.
- Employee onboarding requires a phone value but only records user confirmation,
  not technical verification.
- Only the user changes global phone through Account/Profile.
- Owner/admin see it read-only. Manager sees it read-only for scoped employees.
- The user is explicitly informed of this role visibility during onboarding.
- A global phone change updates every authorized organization view.
- Active employee memberships prevent deleting the phone without replacement.
- Different employer-specific phone numbers and verified recovery phone are
  **deferred**.

One organization-specific `Share my contact information with coworkers` toggle
defaults off. When enabled, employees sharing at least one location may see:

- Login email.
- Global phone.
- Birthday month and day.
- Approved organization profile photo.

The toggle never shares full birthday, emergency contact, or documents. Location
changes and toggle changes immediately recompute authorization and clear stale
client caches. The employee-facing surface for this shared profile is **TBD**.

### Birthday, Emergency Contact, Address, And SSN

**Locked**

- Birthday is optional but captures the full date and is organization-specific.
- Owner/admin and scoped manager see full birthday in the employee drawer.
- Coworkers see only month/day and only through the contact-sharing toggle.
- Emergency contact is organization-specific and required: name, relationship,
  and phone required; email optional. No SMS verification.
- Home address is removed from V1 employee onboarding.
- SSN, payroll, tax, and I-9 data are removed from V1 entirely.

### Profile Photo

**Locked**

- Optional and organization-specific; global avatar does not replace it.
- Upload never blocks employee activation.
- Owner/admin approval is required before display. Manager cannot approve or
  revoke profile photos.
- A replacement remains pending while the last approved image continues to show.
- Owner/admin may revoke at any time with reason, audit, and employee notice.
- JPEG, PNG, and WebP only; 5 MB maximum; metadata stripping and security scan
  before review.

## Employee Onboarding

### Steps

**Locked**

1. `Confirm your identity`: organization and provisional legal-name review.
2. `Personal details`: global phone confirmation, optional organization
   birthday, and required emergency contact. No home address or SSN.
3. `Employment details`: read-only role, job, location, start date, and remote /
   excluded state.
4. `Availability`: optional. Skip means fully available for all seven days until
   the employee changes it.
5. `Documents & policies`: configured document uploads and acknowledgements.
6. `Review & submit`: missing requirements, reviews, and final submission.

### Behavior

**Locked**

- Every invitation acceptance creates or links a pending membership and a
  tenant-specific onboarding case.
- Admin/manager invitees complete the same required onboarding before privileged
  access opens.
- Normal application access stays closed until activation.
- Progress auto-saves server-side and resumes per organization across devices.
- Revision checks prevent concurrent-device stale overwrites.
- Onboarding can be exited to organization selection without losing progress.
- Pending organization cards show progress and next action without exposing
  sensitive requirement details.
- Employee may permanently leave during pending onboarding after warning. This
  removes membership/case access, deletes employee-submitted drafts, preserves
  employer roster data, and requires a new invitation to return.
- Active employees do not receive a self-service Leave Organization action.

### Changes During Onboarding

**Locked**

- Pending unaccepted invitation email or role changes require revoke/reissue.
- After acceptance, pending role may change without a new invitation; new role
  permissions remain closed until activation and the user is notified.
- Job/location changes require employee reconfirmation of Employment Details.
- Employer legal-name edits invalidate prior employee name confirmation.
- Global phone changes invalidate prior onboarding phone confirmation.
- Document/acknowledgement requirements are snapshotted at case start.
- Later requirement versions apply to new cases. Existing employees receive a
  separate future compliance task/campaign rather than silent case mutation.

### Activation

**Locked**

- Final approval defaults off. All blockers complete means automatic activation.
- Organization may turn final approval on.
- Owner/admin or scoped manager may approve when final approval is enabled.
- Rejection requires a reason and target step; membership remains pending.
- Required document plus required manual review blocks activation until approval.
- Optional documents never block activation.
- Pending profile-photo review never blocks activation.
- Membership/role activation invalidates authorization caches immediately.

### Reminder Policy

**Locked**

- Unaccepted invitation reminders on days 3 and 6; invitation expires day 7.
- Reminders reuse the same invitation and never extend token lifetime.
- Accepted onboarding does not auto-expire.
- Pending-onboarding reminders on days 1, 3, and 7, then weekly for four weeks.
- After email reminders stop, pending status and manager todo remain.

## Invitations

**Locked**

- Invitation tokens are high-entropy, single-use, stored only in non-plaintext
  form, and invalid after acceptance, decline, revoke, or expiry.
- One active/pending invitation per normalized email per organization.
- Same email may have concurrent invitations from different organizations.
- Resend cooldown is 60 seconds and maximum five sends per employee per 24 hours.
- Resend invalidates the old token and starts a new seven-day lifetime.
- Delivery status comes from provider webhooks. Delivered does not mean opened.
- No open-pixel tracking.
- Bounce/rejection does not delete the employee record.
- Owner/admin and scoped manager may resend or revoke.
- Wrong email is corrected by revoke, employee record preservation, and new
  invitation.
- Invite acceptance/decline audit includes invitation, organization, user, and
  timestamp. IP/device metadata belongs only in restricted security logs.
- OAuth accounts match only on provider-verified exact email. Relay or different
  emails do not auto-link.
- Changing global email does not migrate old-address pending invitations;
  revoke/reissue is required. Existing active memberships remain intact.
- Archiving an employee revokes pending invitation and reminders.

## Documents, Compliance, And Schedule Conflicts

### Requirement Configuration

**Locked**

Owner/admin configure each document independently:

- Required or optional.
- Manual review required or not.
- Expiration date required or not.
- Expiration impact: `Tracking only`, `Soft conflict`, or `Hard conflict`.
- Default reminders: 30, 7, and 1 day before expiration plus expiration day.
  Owner/admin may customize timing.

Required/manual-review/expiration settings remain independent. In-progress
onboarding snapshots keep their requirement version, while an explicit change to
expiration impact applies to current employees and future shifts after an impact
preview shows affected employee/shift counts.

### Visibility And Review

**Locked**

- Owner/admin view and review all organization employee documents.
- Manager views, downloads, approves, or rejects documents only for
  employee-role users in assigned locations.
- Manager cannot process manager/admin/owner documents or edit requirement rules.
- Rejection requires a correction reason and notifies the employee.
- Required renewal with manual review remains conflicted until approval.

### Expiration Tasks And Conflicts

**Locked**

- Expiration creates an automatic tenant-scoped todo assigned to the employee and
  visible to authorized managers.
- Renewal plus required approval closes the compliance todo automatically.
- `Tracking only`: notification and todo, no schedule restriction.
- `Soft conflict`: `Cancel` or `Schedule anyway`; no written reason. Override is
  audited automatically with actor, shift, and time.
- `Hard conflict`: blocks new assignment and blocks editing/republishing an
  affected shift. No override.
- Existing published shifts are never silently deleted when a document expires.
  Future affected shifts are flagged and generate manager todo work.
- If a conflict has an uploaded pending document, `Review document` opens the
  employee drawer directly on Documents without losing the schedule draft.
- Approve recalculates conflict and returns the user to the preserved shift work.
- Reject preserves the schedule draft and leaves the conflict open.
- If no document is uploaded, `Request document` notifies the employee and
  updates the existing todo without creating a duplicate.

This is a validation extension to the existing Schedule add/edit flow, not a
redesign of that flow.

## Todo List

**Locked product direction; detailed UX remains future design work**

- Todo is a general organization feature, not a compliance-only list.
- Owner/admin create and assign tasks organization-wide.
- Manager creates and assigns tasks only to scoped employees.
- Employee views and updates tasks assigned to self.
- Manual tasks may tag/assign one or more employees.
- Application notifications may expose `Add to Todo`.
- Compliance expiration todos are created automatically.
- System compliance tasks cannot be manually completed; source resolution closes
  them.
- Manual tasks may be completed by the assignee.
- Archiving an employee cancels open compliance tasks and moves manual tasks to
  `Unassigned` for owner/admin reassignment.

Detailed status workflow, list placement, filtering, recurrence, comments, and
task UI are **TBD** for a separate Todo design session.

## Employment And Access Lifecycle

### Access Operations

**Locked**

- Global sign-out-all-sessions: only account user or platform security support.
- Suspend organization access: reversible, account link retained.
- Revoke organization access: permanent unlink; new invitation required.
- Archive/termination: separate employment action; organization history remains.
- Owner/admin suspend or revoke non-owner memberships.
- Manager may temporarily suspend scoped employee-role users but cannot revoke.
- Every suspend/revoke requires reason, audit, and notification after access is
  closed.
- Current-organization revoke/suspend immediately clears tenant data and routes
  the affected tab to organization selection/status without affecting other
  organizations.

Re-linking a revoked employee preserves organization schedule/employment history
but does not inherit old onboarding verification. A new account re-verifies legal
name and required data. Old account-uploaded documents are not automatically
exposed to the new account; owner/admin retain historical review access and the
new account re-uploads or re-authorizes current requirements.

### Archive And Rehire

**Locked**

- Archived is the existing former-employee surface; do not add a duplicate
  `Former employees` area.
- Archive closes organization access and removes the organization from switcher,
  while history remains.
- Rehire starts from the existing Archived record, opens a new employment period,
  and uses a new invitation/onboarding verification as required.
- Do not create a duplicate employee record for rehire.
- Organization live access to global email/phone ends on archive. It returns only
  after a new authorized account link.

## Ownership, Organization Closure, And Account Deletion

### Ownership Transfer

**Locked**

- Owner cannot demote or replace own owner role directly.
- Transfer target must be active, onboarding-complete admin with verified email.
- Current owner strong-reauthenticates and initiates a 24-hour request.
- Target strong-reauthenticates and accepts or rejects.
- Current owner retains rights and may cancel before acceptance.
- Target suspension, removal, role change, or verified-email change cancels the
  request.
- Acceptance atomically promotes target, demotes prior owner, and invalidates
  authorization state.
- Prior owner defaults to admin but may request a lower role or leave as part of
  the transfer; target sees that outcome before accepting.
- Accepted transfer cannot be undone. New owner may later initiate another
  transfer.
- Organization deletion and transfer cannot be pending simultaneously.
- Prior owner's payment method is detached immediately after transfer. Historical
  invoices remain. New owner adds a new card before renewal or normal payment
  failure/grace applies.

### Organization Closure

**Locked**

- Only owner may schedule, cancel, or execute organization deletion.
- End-of-period deletion keeps access through paid/trial end and may be canceled
  before the effective time.
- Immediate deletion requires strong reauthentication, typed organization name,
  explicit no-refund/data-loss warning, and is not user/support recoverable.
- Immediate means access and product recovery end synchronously; physical purge
  completes idempotently in the background.
- All memberships, invitations, tenant sessions, kiosk/API access, jobs, cache,
  realtime, and storage authorization close immediately.
- Global accounts and other organizations remain.
- Optional pre-delete export never blocks deletion. No post-delete export.
- Scheduled deletion and cancellation notify all organization users.
- Outstanding invoices do not block closure; billing dispute/debt records remain
  separately.
- Minimal external tombstone only: internal organization ID, deletion time,
  actor ID, billing reference, and purge result. No organization name or tenant
  content.
- Backups expire under normal retention and cannot restore a deleted organization.
  Exact backup retention is **TBD** after infrastructure/legal review.

### Global Account Removal And Deletion

**Locked**

- Active employee cannot self-leave an organization.
- Global account can be directly deleted only when no active or suspended
  memberships, pending onboarding cases, or unresolved invitations remain.
- Pending invitations are accepted/declined; pending onboarding may be left by
  the user.
- Active/suspended non-owner membership uses `Request account removal` to
  owner/admin.
- Request creates notification/todo; organization removes the membership while
  preserving its employee record and history.
- Unresolved request may escalate to platform support after seven days.
- Owner must transfer or close every owned organization first.
- Multiple owned organizations are resolved individually; scheduled closures
  delay final account deletion until the latest effective date.
- Account deletion disables the account immediately and allows 14-day restore.
- After 14 days, login email, phone, avatar, and personal preferences are purged.
- Organization employee records remain unlinked. Only minimal anonymous security
  tombstone survives.
- New invitation during deletion grace does not restore the account automatically.
  User explicitly restores, signs in, and then processes it.
- Because V1 phone is unverified, lost-email account recovery relies on platform
  support. Organization roles can never initiate or perform global email change.

## Billing And Trial Plan Only

**Locked policy, explicitly not implemented in the onboarding pass**

- Cardless 14-day trial.
- Trial starts on successful owner-onboarding Finish.
- All standard paid features are available during trial; enterprise/custom
  contract capabilities are excluded.
- No artificial employee/location/schedule trial caps.
- Trial entitlement attaches to the billing customer/business identity, not
  mutable organization name or owner. Delete/recreate does not mint a new trial.
- Adding a card during trial preserves remaining days; first charge occurs at
  trial end unless owner explicitly chooses immediate paid conversion.
- Trial expiry without payment retains the organization in read-only soft lock.
- Owner retains billing, export, and read-only data access. Admin retains export
  and read-only access but cannot manage billing. Employees retain
  already-published schedule visibility. Writes/invites/publish are disabled.
- Trial-expired organization is retained 90 days with reminders, then enters
  irreversible deletion.
- Paid payment failure receives seven days normal-access grace, then the same
  read-only lock for 90 days.
- Payment during retention restores data, roles, and memberships without owner
  re-onboarding. Expired invitations are not automatically resent.
- Subscription cancellation and organization deletion are distinct. Canceling
  subscription never silently deletes tenant data.
- Immediate paid organization deletion has no automatic refund and warns owner.

Pricing metric, seat definition, packages, and entitlement implementation remain
**TBD** for the dedicated billing plan.

## Notifications

**Locked**

- Invitation, account contact changes, access suspension/revocation, role change,
  ownership transfer, and organization deletion notifications cannot be muted.
- Operational email channels such as schedule, onboarding, todo, and document
  reminders may be configured, but in-app state and required todos remain.
- In-app notification center shows only the current organization.
- Switcher may show per-organization unread counts.
- Global account security notifications appear in a separate account-level area.

## Edge-Case Validation Matrix

The implementation plan and tests must cover at least:

| Scenario | Required result |
| --- | --- |
| Invitee signs up before opening invitation link | Verified email discovers pending invitation; no duplicate account/org |
| Potential customer has an invitation | Intent screen offers join or start own business; neither is automatic |
| Multiple invitations | Independent tenant-scoped decisions; one acceptance does not affect others |
| Invitation expires/revokes while page is open | Atomic accept fails without membership creation |
| Wrong account opens invite | Masked target email; no organization data leak |
| Same email already linked in organization | Block second link; no auto-merge |
| Delivery bounces | Employee remains; delivery state updates independently |
| Owner Finish retries | One organization, one employee set, one invite set |
| Owner resets draft | No external invitation exists; wizard data clears safely |
| Owner closes browser after Finish commit | Trial remains started and invites dispatch once |
| Two owner/employee onboarding tabs | Stale revision cannot overwrite newer data |
| Job/location changes during employee onboarding | Employment review becomes incomplete again |
| Legal name changes during onboarding | Prior confirmation invalidated; approval path applies |
| Role changes during pending onboarding | User notified; no privileges until activation |
| Photo pending review | Activation proceeds with prior/default avatar |
| Document expires after shifts publish | Shifts remain; conflict/task policy applies |
| Hard conflict employee is dragged/edited | Save/publish blocked without losing schedule draft |
| Soft conflict override | One-click continue; automatic audit, no required text |
| Employee spans same-org locations | Other-location shift shown as read-only ghost and blocks overlap |
| Employee spans different organizations | No employer-visible cross-org signal of any kind |
| Manager loses scope/role | Access and cache disappear immediately |
| Remote/excluded employee loses final location | Valid zero-location record; owner/admin visibility only |
| Last normal location removed | Owner/admin resolution or explicit remote/excluded state required |
| Employee archived with invite/task | Invite revoked; compliance tasks canceled; history preserved |
| Rehire | Existing archived employee reused; new employment period and invite |
| Default organization becomes invalid | Default clears and does not silently return |
| Different tabs use different organizations | Independent tenant context; global logout closes both |
| Cross-tenant resource ID supplied | Generic 404 plus restricted audit event |
| Owner transfer races deletion | Only one lifecycle transaction may proceed |
| Global deletion has active memberships | Removal workflow blocks direct deletion |
| Invitation arrives during deletion grace | Explicit restore required; no automatic reactivation |

## Implementation Inventory

### Reference App Inputs

- Owner route/shell: `apps/web/src/routes/onboarding.tsx`,
  `apps/web/src/features/onboarding/SetupWizard.tsx`.
- Owner steps: `StepRestaurantLocations.tsx`, `StepDepartmentsJobs.tsx`,
  `StepTeam.tsx`.
- Owner API/contracts: `packages/shared/src/schemas/onboarding.ts`, onboarding
  route and service.
- Employee flow: `EmployeeOnboardingPage.tsx`, `onboardingSteps.ts`, step files,
  and employee self-service route/service.
- Mine tests for bootstrap retries, mounted draft state, transaction commits,
  assignment-aware invites, first-actionable-step routing, and correction loops.

### Target App Touchpoints To Re-Audit Before Planning Code

- Routing/guards: `apps/web/src/App.tsx`, `apps/web/src/auth/ProtectedRoute.tsx`,
  `apps/web/src/auth/PermissionRoute.tsx`.
- Account/switching: `apps/web/src/account/WorkspacesPage.tsx`, profile and
  preferences modules, auth context, active workspace context.
- Owner onboarding: `apps/web/src/views/OwnerOnboardingPage.tsx`.
- Employees: Employees page/drawer, invitation acceptance, employee onboarding,
  onboarding data, and onboarding cohort filters.
- Settings: organization, roles, documents, signatures/acknowledgements, kiosk,
  scheduling preferences, and future billing.
- Schedule: existing add/edit validation, ghost badge rendering, conflict
  projection, unassigned shift handling, and draft preservation.
- API: account/workspace context, employees/onboarding/invitations, settings,
  schedule validation, notifications/outbox, exports, and future todos.
- Database: workspaces, memberships, location scopes, employees, invitations,
  onboarding cases/requirements, documents, acknowledgements, availability,
  preferences, audit events, notifications, and future todos/billing.

### Required Contract Work

- Explicit signup-intent and post-verification routing projection.
- Organization list projection with role, status, default, onboarding progress,
  and unread count without tenant-content leakage.
- Organization/tab context contract that does not depend on one browser-global
  active organization.
- Independent invitation, delivery, onboarding, membership, and employee states.
- Four-step owner draft plus revision/idempotency keys and transactional Finish.
- Invitation outbox created only after successful Finish/trial activation.
- Server-derived employee onboarding projection and requirement snapshot.
- Global phone plus per-organization coworker-sharing grant.
- Document requirement/expiration policy and schedule conflict projection.
- General todo domain with source-linked system tasks and manual tasks.
- Ownership transfer, organization deletion, account removal, and deletion
  tombstone contracts.
- Organization-aware composite constraints and two-tenant authorization tests.

## Roadmap

### Phase 0 - Approve This Contract

- Resolve only listed TBDs needed by the first implementation phase.
- Audit current target behavior against each `existing behavior to verify` item.
- Convert this document into implementation-sized acceptance tests.
- No feature code in this phase.

### Phase 1 - Tenant And State Foundations

- Lock entity ownership and independent state machines.
- Add organization-aware constraints, RLS tests, resource-not-found behavior,
  private-storage authorization, audit/tombstone strategy, and async job scoping.
- Prove same user/different roles across two organizations.

### Phase 2 - Account Intent, Invitations, And Organization Routing

- Implement signup intent resolution, active invitation discovery, accept/decline,
  no-org acquisition, invitation lifecycle/delivery split, and tab-scoped tenant
  routing.
- Add switcher status/default rules and safe switch/deep-link behavior.

### Phase 3 - Owner Onboarding

- Build the four typed steps with multiple locations/departments/jobs/employees.
- Add one draft per user, autosave, revision control, reset/cancel, 90-day expiry,
  final validation, idempotent Finish, and post-commit invite outbox.
- Preserve current Schedule behavior and existing Settings ownership boundaries.

### Phase 4 - Employee Onboarding And Activation

- Build legal-name confirmation, global phone confirmation, optional birthday,
  emergency contact, employment review, availability, documents/policies, and
  final review.
- Add correction/reconfirmation loops, cross-device resume, leave-pending flow,
  final approval setting, reminders, and immediate activation invalidation.

### Phase 5 - Roles, Location Scope, And Access Lifecycle

- Implement the locked route/drawer/settings matrix.
- Add manager fail-closed scope, location-removal decisions, remote/excluded
  exceptions, suspend/revoke/archive/rehire, and account-removal requests.
- Prove active-session permission reduction.

### Phase 6 - Documents, Todo, And Compliance Conflicts

- Add document expiration configuration, reminders, manager review, automatic
  compliance tasks, general Todo foundations, and tracking/soft/hard conflict
  behavior.
- Integrate conflict review drawer without losing Schedule drafts.
- Keep detailed general Todo UX as its own approved sub-plan.

### Phase 7 - Helper Checklist

- Add user-specific owner/admin checklist, visit-based optional tasks, Settings
  re-entry, role hide/restore, and required scheduling-preference confirmation.

### Phase 8 - Ownership And Deletion Lifecycles

- Add two-party transfer, card detachment boundary, scheduled/immediate closure,
  purge orchestration, minimal tombstone, account removal escalation, 14-day
  global-account deletion grace, and restore.

### Phase 9 - Billing And Trial Specification Only

- Finalize provider, pricing metric, packages, entitlements, billing UI, webhook
  and reconciliation design, trial abuse controls, grace/retention automation,
  refunds/disputes, and ownership-transfer billing behavior.
- Do not implement billing in the onboarding delivery plan.

### Phase 10 - Verification

- Shared/API/web contract tests for every state transition and role.
- Two-organization RLS/API suites with one user holding different roles.
- Owner signup -> Finish -> invite -> employee onboarding -> activation smoke.
- Pending/suspended/revoked/default/switch/multi-tab browser coverage.
- Document review/expiry/task/conflict browser coverage without Schedule draft
  loss.
- Organization transfer/deletion/account deletion failure and race tests.
- Desktop/mobile accessibility and visual checks.
- Hosted verification remains separate: email provider webhooks, private storage,
  backup retention, support access, observability, and billing are not proven by
  local tests.

## Non-Negotiable Acceptance Criteria

- No authorization decision uses a role or resource from another organization.
- No frontend-only tenant filter is treated as security.
- No cross-organization schedule, availability, notification, document, todo,
  billing, or onboarding signal is exposed.
- Pending/suspended users never enter normal tenant surfaces.
- Owner onboarding Finish is atomic and idempotent; invitations send afterward.
- An active organization always has exactly one primary owner in V1.
- Employee, invitation, onboarding, membership, and employment states remain
  independent.
- Requirement snapshots do not mutate silently during onboarding.
- Role/scope reduction is effective immediately across requests and caches.
- Private documents never use public URLs and are never logged in ordinary
  payloads/errors.
- Existing Schedule add/edit behavior is preserved except for explicitly approved
  ghost-shift and compliance-conflict extensions.
- SSN, payroll, tax, I-9, and mandatory home address remain outside V1.
- Billing/trial code is not smuggled into the onboarding implementation phase.

## Deferred And TBD Register

### TBD

- Organization switcher placement in the existing app.
- Custom-role hierarchy and permission construction model.
- Mandatory MFA policy for owner/admin/manager.
- Employee landing pages and coworker shared-profile surface.
- Personal override of organization time format.
- Audit retention and backup retention periods.
- Todo detailed UX/status/comments/recurrence model.
- Billing pricing metric, seat definition, packages, and provider implementation.
- Exact support identity-proofing procedure for lost-email recovery/removal.

### Deferred

- Employee bulk import planning and implementation.
- SSN/global identity vault, payroll, tax, and I-9.
- Employer-specific work phone numbers and SMS verification/recovery.
- Cross-organization personal schedule-conflict view visible only to the user.
- Custom roles implementation.
- Existing-employee compliance campaign UX beyond generated tasks.
