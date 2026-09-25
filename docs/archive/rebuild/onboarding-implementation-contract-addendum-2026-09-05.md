# Onboarding Implementation Contract Addendum

Status: Phase 0 implementation contract. This document converts the master plan
and subagent audit findings into enforceable implementation rules. It is the
required gate before Phase 1 tenant foundations and Phase 2 app-shell work.

Sources:

- `docs/archive/rebuild/onboarding-master-implementation-plan-2026-09-05.md`
- `docs/archive/rebuild/onboarding-reference-audit-spec-inventory-roadmap-2026-09-04.md`
- `docs/archive/rebuild/onboarding-subagent-audit-synthesis-2026-09-05.md`
- Reference app read-only path: `C:\Users\TheWe\newfork`

## Phase 0 Decisions

These decisions are locked for implementation unless the user explicitly changes
them before the affected phase starts.

| Topic | Decision | Reason |
| --- | --- | --- |
| Owner model | V1 has exactly one active owner-role membership per active organization. | This is easier to enforce than multiple owners plus primary owner and prevents ambiguous billing/deletion authority. |
| Owner employee record | The active owner-linked employee record is protected from ordinary archive, suspend, revoke, unlink, delete, self-leave and account-removal flows. | Ownersiz organization cannot exist; all ordinary flows must preserve that invariant. |
| Manager authority | Manager cannot revoke invitations, revoke membership, suspend full organization access, change roles, edit manager/admin/owner records, or affect out-of-scope employees. | Manager is location-scoped and must not create organization-wide access effects. |
| Manager escalation | Manager may perform only scoped employee-role operations. Broader issues become owner/admin tasks. | Keeps manager UX useful without weakening tenant or owner invariants. |
| Trial dependency | Owner Finish creates a minimal internal `trial_entitlement` record and then enqueues invitations. Full billing provider integration remains out of scope. | Finish/trial/invite sequence needs an internal contract without waiting for billing implementation. |
| Organization switcher route | Use `/organization-switcher` as deterministic app-entry switcher. Keep `/account/workspaces` as account management. | Switcher is a routing decision, not just account settings. |
| Switcher visual placement | App-shell visual placement remains a slot-level implementation; final exact placement can be adjusted later without changing route contract. | Earlier discussion left placement open, but route behavior must be implementable now. |
| Employee landing | Use `/app/employee-hub` as activated employee landing. Final employee home UX can evolve inside that route. | Employee users need a deterministic non-management landing before final design. |
| Same-org other-location shift visibility | In schedule grid, manager sees other-location shifts as read-only ghost conflict badges. Employee drawer access remains governed by location/role scope. | Prevents accidental editability and keeps the existing Schedule add/edit surface intact. |
| Optional document schedule impact | Optional document can create `tracking_only` or `soft_conflict`; `hard_conflict` requires a required document. | Optional cannot mean activation-optional but schedule-hard-blocking. |
| App tour | The helper checklist is the product tour. Required visit tasks may exist in the checklist; there is no separate blocking tour surface. | Matches the later decision that checklist visits teach where features live. |

## Tenant Context Contract

### Canonical Organization Source

| Surface | Canonical source | Mismatch behavior |
| --- | --- | --- |
| App route | Route/tab organization context selected through `/organization-switcher` or direct safe switch. | If missing and multiple active orgs exist, route to `/organization-switcher`. |
| API request | Server-resolved authenticated user plus explicit organization identifier for organization-scoped endpoints. | Header/body/path org mismatch fails with generic 404 or 403 according to endpoint class; server never repairs silently. |
| Default organization | User preference used only for initial app-entry routing. | Invalid, pending, suspended, revoked or inaccessible default is cleared and cannot authorize requests. |
| Query/cache key | Includes organization ID for all tenant data. | Missing org ID disables query. Org switch cancels or invalidates old tenant queries. |
| Realtime channel | Includes organization ID and role/scope-safe channel name. | Scope loss unsubscribes old channels immediately. |
| Local drafts | Include user ID, organization ID, route/domain and draft ID. | Switching org hides old drafts; cross-org restore is impossible. |
| Storage URLs | Issued per organization/resource/requester with short TTL. | Role/scope loss, suspend, revoke, archive or closure prevents new URLs and invalidates cached access where possible. |
| Export jobs | Carry immutable organization ID, requester ID and scope snapshot. | Execution revalidates membership, scope, organization lifecycle and resource ownership. |

### Request Rules

- Client may pass organization ID for explicitness, but server derives authority
  from authenticated user and current membership.
- Organization name and slug are never authorization keys.
- Resource IDs are scoped by organization-aware joins or constraints.
- Cross-tenant resource access returns a generic not-found response unless the
  endpoint is an account-level organization list projection.
- Batch and pagination endpoints must not leak foreign item counts, ordering
  gaps or per-item existence facts.

## Projection Allowlists

| State | Allowed fields | Forbidden fields |
| --- | --- | --- |
| Active switcher item | Organization ID, organization name, status `active`, role label, default marker, safe unread aggregate if explicitly tenant-safe. | Employee names, schedule details, document names, todo details, audit details. |
| Pending onboarding card | Organization ID, organization name, status `pending`, target role, coarse progress state, next onboarding action. | Employee names other than current user, document detail, schedule signal, todo count, notification count, suspension reason. |
| Suspended card | Organization ID, organization name, status `suspended`, generic access message, support/contact action if allowed. | Internal reason text, audit detail, employee roster, schedule, documents, todos, notification count. |
| Invitation preview | Organization name, target role, location name if included in invitation, expiration date, masked target email. | Inviter identity, employee roster, schedules, document requirements, audit details, internal notes. |
| No-org acquisition | Account email, no active organization state, actions to create business or wait/check invitations. | Any guessed organization data or stale default org data. |
| Draft owner setup | Draft organization ID, draft organization name, setup progress, resume/reset/cancel actions. | Normal app links, switcher promotion, export eligibility, notifications, tenant operational data. |
| Account profile org legal names | Organization name and that organization's verified legal name for the account holder. | Other employees' identities, hidden tenant data, SSN/tax/payroll data. |

## Role and Access Matrix

| Actor | Target | Allowed | Denied |
| --- | --- | --- | --- |
| Owner | Any non-owner member/employee | Edit organization-owned fields, role, scope, invite, revoke, suspend, archive, rehire, review documents/photos, approve onboarding. | Direct self-demotion outside transfer, deleting last owner invariant, editing another organization's data. |
| Owner | Self | Edit own employee job/location/exclude-from-schedule through allowed owner-safe flow. | Change own owner role in drawer, archive/suspend/revoke/unlink/delete self while sole active owner. |
| Admin | Manager/employee | Edit organization-owned employee fields, invite, revoke, suspend, archive, rehire, review scoped/all docs depending org-wide permission, approve onboarding. | Billing management, ownership transfer, organization deletion, owner record protected fields, peer-admin controlled fields unless explicitly granted later. |
| Admin | Owner/peer admin | View according to permissions. | Role reduction, owner lifecycle operations, peer-admin protected fields. |
| Manager | Employee-role user in assigned location | View list/drawer, edit scoped operational employee fields, review scoped employee documents if granted, approve scoped onboarding if final approval enabled and not self. | Change roles, revoke invite, revoke membership, suspend full org access, archive org-wide record, edit out-of-scope users, process manager/admin/owner documents. |
| Manager | Employee-role user with no shared assigned location | None except ghost conflict projection where schedule requires it. | List, drawer, edit, documents, contact info, todos unless assigned by authorized actor. |
| Manager | Manager/admin/owner | No drawer edit authority. | Role, scope, access, document approval, lifecycle operations. |
| Employee | Self | Employee self-service onboarding, own profile/contact fields, own availability, own schedule/actions, own assigned todos. | Employees page/drawer, management settings, other employee data outside explicit coworker-sharing surface. |
| Platform support | Tenant data | No default access. Owner-approved or break-glass access only. | Silent tenant browsing. |

## Route and Shell Contract

| Route | Scope | Access |
| --- | --- | --- |
| `/account/*` | Global account | Authenticated users, no active organization required. |
| `/organization-switcher` | Account-level organization entry | Authenticated users after email/session readiness. Shows only allowlisted projections. |
| `/onboarding` | Owner setup | Owner draft or active owner/admin setup eligibility only. |
| `/welcome/*` | Employee onboarding | Authenticated invitee with pending onboarding case. Normal app chrome not required. |
| `/app` | Active organization app shell | Active membership only. Redirects by role/permission. |
| `/app/workspace` | Management home | Owner/admin/manager with workspace permission. |
| `/app/schedule*` | Management schedule | Owner/admin/manager with schedule permission, plus explicitly allowed employee hub redirects only. |
| `/app/employees*` | Employee management | Owner/admin, and manager only within scoped employee-list rules. Employee role denied and menu hidden. |
| `/app/settings/*` | Organization settings | Permission-gated sections; employee role denied from organization settings. |
| `/app/employee-hub*` | Employee product home | Employee role and any active member with explicit self-service permission if needed. Management roles may preview only if intentionally allowed later. |

Landing rules:

- No session: sign-in.
- Session not ready: loading.
- Verified account with active invitation and no active org: invitation intent screen.
- Verified account with no active/pending org: no-org acquisition.
- One active org: safe role landing.
- Multiple active orgs with valid default: safe role landing for default org.
- Multiple active orgs without valid default: `/organization-switcher`.
- Pending org selected: pending onboarding/status surface.
- Suspended org selected: suspended status surface.
- Manual switch: safe role landing with history replace and tenant cache isolation.

## Lifecycle Transition Tables

### Invitation

| Action | Actor | From | To | Guards | Side effects |
| --- | --- | --- | --- | --- | --- |
| Create invite intent in owner wizard | Owner/admin during draft | None | Draft intent | Owner onboarding not finished. | No email, no token, no outbox. |
| Enqueue after Finish | System after transaction | Draft intent | Pending | Owner Finish committed, employee exists, role/scope valid. | Token hash stored, delivery queued, audit event. |
| Accept | Target account | Pending | Accepted | Token valid, not expired/revoked/declined, exact verified email, no duplicate linked employee in org. | Pending membership and onboarding case created/linked, token consumed. |
| Decline | Target account | Pending | Declined | Second confirmation. | Token permanently invalid, employee record preserved, org notified. |
| Revoke | Owner/admin | Pending | Revoked | Actor has org-wide authority. Manager revoke denied in V1. | Token invalid, delivery reminders stopped, employee record preserved. |
| Reissue wrong email | Owner/admin | Pending/Revoked/Expired/Declined | Pending new token | Employee record exists, new normalized email not active pending in same org. | Old token invalid, new token hash/outbox, audit reason. |
| Expire | System | Pending | Expired | Seven-day lifetime elapsed. | Reminders stop, employee record preserved. |
| Resend delivery | Owner/admin | Pending | Pending | Cooldown and 24h cap pass. | New delivery attempt for current valid token unless reissue is explicitly chosen. |

### Delivery

| Action | Actor | From | To | Guards | Side effects |
| --- | --- | --- | --- | --- | --- |
| Queue | System | None | Queued | Invitation/token exists. | Outbox row created. |
| Provider accepted | Provider/webhook | Queued/Sent | Sent | Provider event matches organization and message ID. | Delivery timestamp. |
| Delivered | Provider/webhook | Sent | Delivered | Event verified. | Delivery status only; does not mean opened. |
| Bounce/complaint | Provider/webhook | Queued/Sent/Delivered | Bounced/Complained | Event verified. | Notification/todo to authorized managers; invitation and employee remain. |

### Employee Onboarding

| Action | Actor | From | To | Guards | Side effects |
| --- | --- | --- | --- | --- | --- |
| Start case | System after invite accept | Not started | In progress | Pending membership linked to employee. | Snapshot requirements, first actionable step. |
| Autosave step | Employee | In progress/Pending review | Same | Revision matches, case belongs to account/org. | Save draft, audit significant changes. |
| Submit | Employee | In progress | Pending review or Completed | Required fields complete, required docs uploaded, required acknowledgements accepted. | If final approval off and no manual review blockers, activate. |
| Legal name changed | Employee | In progress | Pending review | Provisional name differs. | Owner/admin approval task; no activation until approved. |
| Reject step | Owner/admin/scoped manager where allowed | Pending review | In progress | Reviewer not submitter, target scope valid. | Reason, target step, employee notice. |
| Approve/final approve | Owner/admin/scoped manager where allowed | Pending review | Completed | Reviewer not submitter, all blockers clear. | Membership active, auth/cache invalidation. |
| Reset/start over | Employee or authorized admin | In progress/Pending review | In progress | Case not completed. | Clears submitted draft for selected scope; preserves invitation/account link. |
| Leave pending | Employee | In progress/Pending review | Canceled | Warning confirmed. | Membership/case access removed, employee-submitted drafts deleted, employer roster preserved. |

### Membership and Employee Lifecycle

| Action | Actor | From | To | Guards | Side effects |
| --- | --- | --- | --- | --- | --- |
| Activate membership | System/reviewer | Pending | Active | Onboarding complete and approvals clear. | Role permissions open, switcher active, cache invalidation. |
| Suspend access | Owner/admin | Active | Suspended | Target is not sole owner. | Access closed, switcher suspended card, audit/notice. |
| Revoke access | Owner/admin | Active/Suspended/Pending | Revoked | Target is not sole owner. | Permanent unlink, new invite required, cache/session closed. |
| Archive employee | Owner/admin | Active employment | Archived | Target not active owner; future impacts resolved. | Access closes, pending invites revoked, compliance todos canceled, history preserved. |
| Rehire | Owner/admin | Archived | Active employment pending access | Same employee record reused. | New employment period, new invite/onboarding as required. |
| Role change | Owner/admin according matrix | Active/Pending | Same status with new role | Actor can manage target role; not last owner violation. | Permissions invalidated immediately, user notified. |
| Scope change | Owner/admin or manager scoped removal | Active/Pending | Same status | Actor scope valid; final location rules pass. | Cache invalidation, affected shifts handled by chosen policy. |

### Ownership Transfer

| Action | Actor | From | To | Guards | Side effects |
| --- | --- | --- | --- | --- | --- |
| Initiate | Current owner | None | Transfer pending | Strong reauth, target active onboarding-complete admin with verified email. | Lock owner lifecycle/closure/billing-owner mutations. |
| Cancel | Current owner | Transfer pending | None | Before target acceptance. | Locks released, notice. |
| Reject | Target admin | Transfer pending | None | Strong reauth. | Locks released, notice. |
| Accept | Target admin | Transfer pending | Completed | Strong reauth, target still eligible, org not closing. | Target becomes sole owner, prior owner demoted as selected, prior payment method detached, auth/cache invalidated. |

### Organization Closure and Retention

| Action | Actor | From | To | Guards | Side effects |
| --- | --- | --- | --- | --- | --- |
| Schedule end-of-period closure | Owner | Active/trial/paid | Closure scheduled | Strong reauth, no transfer pending. | Access continues until trial/paid end, users notified, cancel allowed. |
| Cancel scheduled closure | Owner | Closure scheduled | Active/trial/paid | Before effective time. | Users notified, deletion canceled. |
| Immediate closure | Owner | Active/trial/paid/soft-locked | Purge started | Strong reauth, typed org name, explicit irreversible warning, no transfer pending. | Access closes synchronously, subscription/trial canceled, no recovery/export after deletion starts. |
| System retention purge | System | Retention elapsed | Purge started | Retention notices sent, restore window elapsed. | System actor, separate tombstone, idempotent background purge. |
| Purge complete | System | Purge started | Purged | Idempotent deletion completed. | Minimal tombstone only. |

### Global Account Deletion

| Action | Actor | From | To | Guards | Side effects |
| --- | --- | --- | --- | --- | --- |
| Request direct deletion | Account user | Active account | Deletion grace | No active/suspended memberships, no pending onboarding, no unresolved invitations, no owned orgs. | Login disabled, 14-day restore window. |
| Restore | Account user | Deletion grace | Active account | Within 14 days. | Account restored; invitations processed manually. |
| Final purge | System | Deletion grace elapsed | Purged | 14 days elapsed. | Email, phone, avatar, preferences purged; org employee records remain unlinked. |
| Request org removal | Account user | Active/suspended non-owner membership | Removal requested | Direct account deletion blocked by active membership. | Owner/admin todo/notification, escalation after seven days. |

## Document, Acknowledgement, Todo, and Conflict Matrix

### Document Requirement

| Required | Manual review | Expiration impact | Activation | Scheduling |
| --- | --- | --- | --- | --- |
| No | No | Tracking only | Does not block. | Todo/notification only if configured/expired. |
| No | Yes | Tracking only | Does not block. | Pending/rejected optional review does not block schedule. |
| No | No/Yes | Soft conflict | Does not block. | Warning can be bypassed with `Schedule anyway`; automatic audit. |
| No | No/Yes | Hard conflict | Invalid V1 config. | UI/API reject config because hard conflict requires required document. |
| Yes | No | Tracking only | Blocks until uploaded/accepted as complete. | No schedule block after requirement complete unless expired policy says otherwise. |
| Yes | Yes | Tracking only | Blocks until upload approved. | No schedule block after approval unless expired policy says otherwise. |
| Yes | No/Yes | Soft conflict | Blocks onboarding as above. | Expired/rejected/currently invalid requirement warns; user can schedule anyway. |
| Yes | No/Yes | Hard conflict | Blocks onboarding as above. | Expired/rejected/currently invalid requirement blocks new/edit/republish assignment. |

### Evidence Rules

- Requirement snapshot stores requirement ID, version ID, required flag, manual
  review flag, expiration policy, impact policy and content/template version.
- Acknowledgement evidence stores displayed text hash, accepted timestamp,
  account ID, employee ID and organization ID.
- Upload evidence stores file hash, storage object ID, scanner state, uploader,
  timestamp and requirement version.
- Review evidence stores reviewer, decision, reason when rejected/revoked,
  timestamp and reviewer scope at decision time.
- Ordinary tenant-visible logs never include private document URLs or file
  contents.

### Todo Source Identity

System todos must include:

- `organization_id`
- `source_type`
- `source_id`
- `source_version`
- `subject_employee_id`
- `assignee_id` or `unassigned`
- lifecycle status
- dedupe key

Rules:

- System compliance todo is created automatically for expiration/rejection/request
  sources.
- The same open source cannot create duplicate active todos.
- System todo cannot be manually completed; source resolution closes it.
- Archive cancels compliance todos and moves manual todos to `Unassigned`.
- Manual todo detailed UX is separate, but source identity is required in V1.

## Soft Lock Allowlist

| Actor | Allowed in soft lock | Denied in soft lock |
| --- | --- | --- |
| Owner | Billing restore, export, read-only app views, organization closure, ownership transfer only if billing policy allows, account settings. | New invites, schedule publish, roster creation, kiosk enrollment, document rule changes, nonessential writes. |
| Admin | Export and read-only app views. | Billing management, new invites, schedule publish, roster/settings writes. |
| Manager | Read-only scoped schedule/employee views where product allows. | Schedule writes, roster writes, kiosk writes, document approvals unless explicitly allowed by future policy. |
| Employee | Already-published schedule visibility and own account settings. | Requests, availability writes, new onboarding writes after lock unless required for restore policy. |
| System | Retention notices, payment restore webhook, purge after retention. | Non-retention operational writes. |

## Verification Coverage Required Before Feature Closeout

- Same account in two organizations with different roles.
- Employee role cannot see menu or direct URL for Employees/settings management.
- Manager only sees assigned-location employee list and employee-role drawers.
- Cross-tenant resource IDs through path/header/body/query return generic failure.
- Pending/suspended switcher cards use allowlisted projection only.
- Default organization cannot authorize or repair stale tenant requests.
- Owner transfer cannot race organization closure or owner lifecycle writes.
- Immediate deletion closes access synchronously and cannot be recovered.
- Invitation accept/decline/revoke/reissue delivery states stay independent.
- Owner onboarding Finish is idempotent and sends invites only after commit.
- Employee onboarding activation is server-derived and reviewer cannot self-approve.
- Global phone sharing does not control owner/admin/scoped-manager visibility.
- Optional documents cannot hard-block scheduling.
- Schedule conflict drawer preserves current draft state.

## Phase 0 Completion

Phase 0 is complete when:

- This addendum is reviewed by the main agent against both source reports.
- The user accepts or overrides the Phase 0 decisions.
- The first implementation slice is selected.

Recommended first slice after acceptance:

1. Implement the route/shell skeleton with `/organization-switcher`, pending and
   suspended placeholder surfaces.
2. Add route destination and sidebar visibility tests.
3. Keep owner/employee onboarding business logic unchanged until the shell gate
   proves role-scoped routing.
