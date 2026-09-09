# Newfork Onboarding ve Multi-Tenant Shell Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Workers may use focused subagents, MCP/tools, local skills, and read-only reference-app analysis when the current task benefits from it. Workers may ask the user concise product questions only when a decision blocks safe implementation.

**Goal:** Newfork'te multi-tenant onboarding, organization switching, role-scoped app shell, invitation, employee onboarding, lifecycle, documents/todo/conflict ve ownership/closure davranışlarını güvenli ve test edilebilir bir uygulama omurgasına dönüştürmek.

**Architecture:** The system separates global account identity from organization-scoped membership, employee record, onboarding case, documents, todos, schedules, settings and billing/trial state. Tenant context is explicit per route/tab/request/cache key; frontend navigation is a UX filter only, while API, DB constraints and RLS remain the authorization boundary. The implementation proceeds through enforceable contracts first, then shell/routing foundations, then owner/employee onboarding and lifecycle features.

**Tech Stack:** TypeScript, React, React Router, TanStack Query, Fastify API, Supabase/Postgres/RLS/storage, Zod schemas, Vitest, Playwright/browser smoke where UI behavior matters.

---

## Kaynaklar

- `docs/rebuild/onboarding-reference-audit-spec-inventory-roadmap-2026-09-04.md`
- `docs/rebuild/onboarding-subagent-audit-synthesis-2026-09-05.md`
- Read-only reference app: `C:\Users\TheWe\newfork`
- Target app: `C:\Users\TheWe\Documents\Codex\newfork-clean`

## Execution Rules

- Bu plan implementasyon başlamadan önce authoritative yol haritasıdır.
- Her task öncesi `git status --short` alınır; unrelated WIP korunur.
- Eski ref app yalnız read-only referans olarak kullanılabilir.
- Schedule add/edit mevcut davranışı korunur; sadece açıkça onaylı validation/ghost/conflict ekleri yapılır.
- Billing/trial V1 onboarding implementation içine tam ürün olarak alınmaz; sadece minimum internal entitlement contract gerekiyorsa eklenir.
- SSN, payroll, tax, I-9, mandatory home address, bulk import, SMS verification, custom role UI ve detailed Todo UX bu planın V1 implementation kapsamı dışındadır.
- Her phase sonunda focused API/web tests koşulur; release-ready iddiası için ayrıca hosted smoke gerekir.

## Agent Execution Prompt

Use this prompt when starting an implementation worker:

```text
You are implementing the Newfork onboarding and multi-tenant app-shell roadmap.

Read first:
- docs/rebuild/onboarding-master-implementation-plan-2026-09-05.md
- docs/rebuild/onboarding-reference-audit-spec-inventory-roadmap-2026-09-04.md
- docs/rebuild/onboarding-subagent-audit-synthesis-2026-09-05.md

Stay goal-oriented. Implement only the current task or phase assigned by the orchestrator. Preserve unrelated dirty work. Before editing, inspect current files and tests. If you need context, you may:
- launch focused subagents,
- use MCP/tools/skills available in the environment,
- inspect C:\Users\TheWe\newfork read-only as reference,
- ask the user one concise blocking product question.

Do not invent policy where the plan marks a blocker. Do not implement full billing, payroll, tax, I-9, SSN, SMS verification, custom role UI, or bulk import. Do not redesign Schedule add/edit.

Every implementation must include:
- route/API/DB authorization checks where relevant,
- tenant-isolation negative tests,
- role/scope tests,
- cache/session invalidation behavior,
- focused UI tests or browser proof for shell/routing behavior.

Finish with changed files, tests run, unresolved decisions, and the next safest task.
```

## Implementation Principles

1. **Contract before screens.** Önce state machine, permission matrix, projection allowlist ve tenant-binding contract yazılır; UI bunlara göre bağlanır.
2. **Frontend filter is not security.** Sidebar'da buton gizlemek yeterli değildir; route, API, RLS ve mutation guard aynı sonucu vermelidir.
3. **Tenant context is explicit.** Default organization sadece initial landing tercihi olabilir; request'i authorize veya repair edemez.
4. **Independent lifecycle state.** Invitation, delivery, onboarding, membership, employee lifecycle, document review, photo review, owner transfer, closure ve account deletion tek status alanına sıkıştırılmaz.
5. **Small execution batches.** Her faz kendi migration/schema/API/UI/test paketine bölünür; large rewrite yapılmaz.

## Required File Ownership Map

### Routing ve Shell

- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/auth/AuthContext.tsx`
- Modify: `apps/web/src/auth/ProtectedRoute.tsx`
- Modify: `apps/web/src/auth/PermissionRoute.tsx`
- Modify: `apps/web/src/auth/routeDestinations.ts`
- Modify: `apps/web/src/shell/AppShell.tsx`
- Create or modify: `apps/web/src/shell/OrganizationSwitcherPage.tsx`
- Create or modify: `apps/web/src/shell/PendingOrganizationStatusPage.tsx`
- Create or modify: `apps/web/src/shell/SuspendedOrganizationStatusPage.tsx`
- Tests: `apps/web/src/auth/*.test.tsx`, `apps/web/src/shell/*.test.tsx`, `apps/web/src/App.test.tsx`

### Account, Signup Intent, Workspaces

- Modify: `apps/web/src/account/WorkspacesPage.tsx`
- Modify: `apps/web/src/views/SignInPage.tsx`
- Create or modify: signup intent pages if absent.
- Modify: `apps/web/src/lib/supabase.ts`
- Modify: `apps/api/src/account/*`
- Modify: `apps/api/src/auth/*`
- Modify: `packages/shared/src/index.ts`
- Tests: account/workspace route and service tests, route destination tests.

### Owner Onboarding

- Modify: `apps/web/src/views/OwnerOnboardingPage.tsx`
- Create or split focused owner onboarding step modules if the current file is too large.
- Modify: `apps/api/src/account/workspace-account-routes.ts`
- Modify: `apps/api/src/account/workspace-account-service.ts`
- Modify: owner onboarding migrations/functions.
- Tests: owner onboarding page tests, API service tests, DB transaction/idempotency tests.

### Employee, Invitation, Employee Onboarding

- Modify: `apps/web/src/employees/EmployeesPage.tsx`
- Modify: employee drawer modules.
- Modify: `apps/web/src/employees/AcceptInvitationPage.tsx`
- Modify: `apps/web/src/employees/EmployeeOnboardingPage.tsx`
- Modify: `apps/web/src/views/EmployeeHubPage.tsx`
- Modify: `apps/api/src/employees/*`
- Modify: invitation/onboarding DB functions and schemas.
- Tests: employee drawer, invite accept, onboarding, employee hub, API/DB lifecycle tests.

### Roles, Access, Location Scope

- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/settings/RolesSettingsPage.tsx`
- Modify: employee access management API/services.
- Modify: location-scope enforcement in API and RLS.
- Tests: role permission, manager scope, last-owner, role-reduction, two-tenant negative tests.

### Documents, Acknowledgements, Todo, Schedule Conflicts

- Modify: `apps/web/src/settings/DocumentsSettingsPage.tsx`
- Modify: `apps/web/src/settings/SignatureTemplatesSettingsPage.tsx`
- Modify: document/onboarding services.
- Create: Todo domain modules only for source-linked compliance/system tasks in V1.
- Modify: Schedule validation layer only; do not redesign Schedule add/edit.
- Tests: document requirement matrix, evidence/versioning, todo dedupe, schedule conflict preservation.

### Ownership, Closure, Account Deletion

- Create or modify: organization lifecycle API/service modules.
- Modify: account deletion/removal surfaces.
- Modify: DB functions for owner transfer, closure, tombstone, purge jobs.
- Tests: transfer locks, closure scheduling/cancel/immediate, ownerless prevention, global account deletion eligibility.

## Phase 0: Contract Addendum ve Blocker Decisions

**Goal:** Prose kararları implement edilebilir contract'lara çevirmek ve coding öncesi bloklayıcı kararları kapatmak.

**Must answer before Phase 1:**

- Owner model: V1 exactly one active owner-role membership mi, yoksa multiple owners plus one primary owner mı?
- Manager authority: manager full membership suspend/revoke/invite-revoke yapabilir mi, yoksa sadece scoped employee-role operation ve escalation mı?
- Trial dependency: owner Finish minimal `trial_entitlement` yaratacak mı, yoksa invitation dispatch trial'dan bağımsız mı?
- Organization switcher route/placement: separate `/organization-switcher` mi, yoksa `/account/workspaces` mı entry gate olacak?
- Employee landing: activated employee için minimum `/app/employee-hub` contract şimdi kilitlenecek mi?
- Other-location schedule visibility: manager aynı organization içi başka location shift'ini full detail mi, ghost-only mı görecek?
- Optional document schedule impact: optional document hard conflict yaratabilir mi?

**Recommended decisions unless user overrides:**

- V1: exactly one active owner-role membership per active organization.
- Manager cannot revoke invitations, revoke membership, suspend full organization access, change role, or affect manager/admin/owner records. Manager can operate only scoped employee-role records and can escalate broader issues.
- Owner Finish creates a minimal internal trial entitlement record, but no full billing UI/provider integration.
- Add separate `/organization-switcher` as app-entry switcher; keep `/account/workspaces` as account management.
- Lock temporary `/app/employee-hub` as employee landing while final employee UX remains designable.
- Manager same-org out-of-current-location shifts are ghost-only in the grid unless the employee drawer/schedule management route is explicitly scoped.
- Optional document can create tracking or soft warning only; hard conflict requires required document.

**Deliverables:**

- [x] Create `docs/rebuild/onboarding-implementation-contract-addendum-2026-09-05.md`.
- [x] Add tenant context contract: URL/tab organization, request header/body agreement, default preference, mismatch behavior, cache keys, realtime channels, export/storage/audit rules.
- [x] Add projection allowlists for active switcher, pending onboarding, suspended, invitation preview, no-org acquisition and draft owner setup.
- [x] Add lifecycle transition tables for invitation, delivery, onboarding, membership, employee, legal-name correction, phone confirmation, photo, document review, owner transfer, closure, soft lock and account deletion.
- [x] Add role/access matrix: actor role x target access class x operation x location scope.
- [x] Add document/acknowledgement evidence and schedule conflict matrix.
- [x] Add route/shell decision table.
- [x] Review against both source reports and remove contradictions.

**Validation:**

- [x] No unresolved decision remains for Phase 1 or Phase 2 prerequisites.
- [x] Every P0 subagent finding maps to a contract section.
- [x] Any unresolved item is explicitly marked as deferred and not needed for the next phase.

## Phase 1: Tenant Foundation, State Machines, and Security Baseline

**Goal:** Make tenant isolation and lifecycle states enforceable before UI expansion.

**Tasks:**

- [x] Re-audit current schemas, migrations and API services for `workspace_id` / organization ownership.
- [x] Introduce or verify organization-aware composite constraints for employee, membership, location scope, schedule, documents, onboarding, todo, notification and audit-owned rows.
- [x] Ensure every API read/mutation validates organization membership, active status, role/permission, location scope and resource ownership.
- [x] Implement generic 404 response behavior for foreign tenant resource IDs.
- [x] Split tenant-visible operational audit from restricted security audit where foreign-ID attempts could leak facts.
- [x] Define private storage URL issue/revocation rules for documents and profile photos.
- [x] Add async execution-time revalidation for outbox, reminders, exports, storage URLs and delayed jobs.
- [x] Add same-user two-organization tests with different roles and stale/default org mismatch cases.

**Progress 2026-09-05:**

- Added shared workspace summary status mapping for active, pending and suspended membership projections.
- Added focused API guard helper for path workspace mismatch and active membership/permission checks; wired employee directory and owner onboarding save route.
- Added DB trigger migration enforcing that `user_workspace_preferences.active_workspace_id` must point to the same user's active membership, including a same-account two-workspace/different-role SQL test.
- Added account workspace RPC projection for active, invited, pending activation and suspended memberships so switcher/status surfaces can receive non-active organizations without normal app entry.
- Added frontend tenant query cache clearing before and after organization switch selection.
- Updated active workspace resolver so multiple active organizations without an explicit active preference do not resolve a random workspace; workspace-required frontend routes redirect to the switcher when authenticated but no workspace context exists.
- Extended generic foreign-tenant 404 behavior through shared workspace authorization helpers and wired employee directory, owner onboarding, settings, notification settings, communications, employee hub, kiosk management and time entries route boundaries. Permission-denied cases remain 403, while path workspace mismatch, inactive membership and missing active context return generic `Workspace not found`.
- Added service-only `app_private.security_audit_events` and writer RPC for restricted security events; raw foreign resource IDs are hashed and not exposed through tenant-visible `audit_events`.
- Added execution-time revalidation for scheduled exports and notification outbox processing. Exports re-check workspace lifecycle, actor membership, `schedule.export` permission and location scope before rendering/sending. Outbox processing skips closed/non-interactive workspaces before event/recipient/inbox projection and records a restricted operational cancellation audit.
- Added private employee storage contract: `employee-onboarding` and `employee-profile-photos` buckets are private, document signed URLs use a 5-minute TTL, document object paths are workspace/employee/requirement scoped with UUID filenames, direct authenticated storage policies remain closed, and confirm/download DB functions revalidate membership, tenant scope and workspace lifecycle.
- Added generic Schedule workspace-path mismatch pre-handler so `/v1/workspaces/:workspaceId/schedule...` foreign-tenant paths return `Workspace not found` before service execution, without changing Schedule add/edit service behavior.
- Added lifecycle revalidation to document-expiry workspace todo sync so global delayed compliance sync does not create todos for closed/non-interactive workspaces and resolves stale system-generated expiry todos.
- Added explicit tab workspace context resolver and frontend session-tab selection. `X-Newfork-Workspace-Id` is validated by `/v1/context`, workspace-path authorization and legacy Schedule/Lineup/Requests aliases. Switcher/account workspace opens set only tab-local context, not account-wide default preference.
- Added focus/visibility context revalidation in `AuthProvider`; if workspace, role, status, permission or location-scope fingerprint changes, tenant-scoped React Query caches are cancelled and removed.
- Added composite tenant FK migrations for onboarding cases/requirements/acknowledgements/documents/availability/events plus tenant-owned notifications, schedule edit/publication/shift references, time sessions/amendments/review snapshots and export snapshots. Metadata tests now assert there are no remaining single-column FKs between public workspace-owned child and parent tables, except direct `workspaces` ownership.
- Re-audited API route surfaces after explicit tab context. Workspace-scoped domain routes use shared membership/permission guards; public/account/invitation/self-onboarding/kiosk-device/internal-cron routes remain intentionally scoped by their own identity boundary. Fixed employee invitation prepare/revoke so foreign workspace paths return generic `Workspace not found` instead of an auth/permission-shaped response.
- Added restricted security audit emission for denied explicit workspace context resolution. Valid sessions that attempt an unresolved explicit workspace now call the private audit RPC with the raw workspace id only as a hashable sink input; absence of a default active workspace does not produce a false-positive security audit.
- Verification 2026-09-05: `supabase db reset --local` completed through `20260908170000_tenant_owned_composite_foreign_keys.sql`; 6 focused DB suites passed 123 tests, API typecheck passed, Web typecheck passed, API focused app test passed 68 tests, and Web focused shell/context tests passed 72 tests.
- Additional verification 2026-09-05: API auth resolver + app focused tests passed 70 tests; restricted security audit pgtap passed 9 tests.
- Still open: Profile photo review/upload UI remains deferred beyond this storage foundation.

**Acceptance Criteria:**

- [x] Same email/account can be owner in org A and employee in org B without route/API/cache bleed.
- [x] Foreign tenant resource IDs return generic not-found and produce only restricted security audit.
- [x] Route/tab/header/body org mismatch deterministically fails or requires explicit switch.
- [x] Role/scope reduction invalidates current session permissions and cached tenant data.

**Recommended Tests:**

- `pnpm --filter @newfork/shared test`
- `pnpm --filter @newfork/api test`
- `pnpm --filter @newfork/web test src/auth src/shell`
- Supabase SQL tests for RLS and cross-tenant negative cases.

## Phase 2: App Shell, Organization Switcher, and Role-Scoped Routing

**Goal:** Establish the shell skeleton before feature-heavy onboarding pages.

**Current evidence:**

- Current app already has `/app`, `/account`, `/onboarding`, `/welcome`, `/app/employee-hub`.
- Current `appLandingPath` sends employees to `/app/employee-hub` and management roles to `/app/workspace` or `/app/schedule`.
- Current `AppShell` filters sidebar links by role/permission.
- Ref app adds stronger shell-level organization selection, pending shell and account-mode separation.

**Tasks:**

- [x] Add or formalize `/organization-switcher` as the deterministic app-entry decision surface.
- [x] Update app entry routing so login does not randomly land in an organization.
- [x] Preserve rule: one active org routes directly; multiple active orgs with no valid default route to switcher; valid active default may bypass switcher.
- [x] Show pending/suspended organizations in switcher using projection allowlists; disable normal app entry for them.
- [x] Manual switch lands on safe role home and replaces history.
- [x] Pending selection routes to onboarding/status; suspended selection routes to limited status screen.
- [x] Add shell slot for organization switcher placement while keeping final visual placement behind the Phase 0 decision.
- [x] Split visible nav groups into management and employee sections.
- [x] Make employee management routes inaccessible both in sidebar and direct URL for employee role.
- [x] Keep `/account/*` global and reachable without active organization.

**Route Contract:**

- Owner/admin/manager landing: `/app/workspace` unless lacking workspace permission, then `/app/schedule`.
- Employee landing: `/app/employee-hub`.
- Management routes: `/app/workspace`, `/app/schedule`, `/app/schedule/lineup`, `/app/schedule/requests`, `/app/time-entries`, `/app/important-dates`, `/app/employees`, `/app/settings/*`.
- Employee routes: `/app/employee-hub`, `/app/employee-hub/schedule`, `/app/employee-hub/time-tracking`, `/app/employee-hub/shift-hub`, `/app/employee-hub/my-team`, `/app/employee-hub/my-availability`, `/app/employee-hub/lineup`.
- Account routes: `/account/profile`, `/account/preferences`, `/account/preferences/notifications`, `/account/workspaces`.

**Acceptance Criteria:**

- [x] Employee cannot see Employees nav and direct `/app/employees` redirects to employee landing.
- [x] Manager/admin/owner land in management shell.
- [x] Pending org never enters normal app shell data surfaces.
- [x] Two browser tabs can use different organizations without overwriting each other's tenant context.
- [x] Switching organization clears/cancels old tenant state and lands on safe home.

**Progress 2026-09-05:**

- Verified role-scoped shell behavior with focused `AppShellNotificationBadge` and `App` route tests: employee navigation omits Employees, employee-only users are redirected away from management routes, and management roles keep the management shell.
- Implemented tab-local organization selection backed by `sessionStorage`, explicit `X-Newfork-Workspace-Id` API context resolution and Schedule/Lineup/Requests legacy alias header validation. Verified with focused API, web and pgtap tests.
- Added a non-committal `data-organization-switcher-slot="tbd"` shell slot around the current organization context label. This preserves the visual placement TBD decision while giving later implementation a stable shell anchor. Verified with focused AppShell test.

## Phase 3: Signup Intent, Invitations, and No-Org Acquisition

**Goal:** Make account creation and invitation handling deterministic.

**Tasks:**

- [x] Add post-verification intent resolver.
- [x] Detect active invitations for verified email on generic signup/login.
- [x] Show `Active invitation found` screen before routing to org creation when invitations exist.
- [x] Let user choose `Join invited organization` or `Start my own organization`; choosing business setup leaves invitations pending.
- [x] Invitation link processes only that invitation and never creates owner org implicitly.
- [x] Exact verified email match required for accept.
- [x] Wrong account flow shows masked email and switch-account action only.
- [x] Decline requires second confirmation and cannot be undone.
- [x] Revoke/reissue preserves employee record.
- [x] Delivery failure updates delivery state only; it does not revoke invite or rollback employee.
- [x] No active/pending org acquisition state offers `Create your business organization` and `I'm waiting for another invitation`.

**Progress 2026-09-05:**

- Added `/invitations/pending` review surface before no-context organization switch, with no employee/person-name projection.
- Added `/v1/invitations/pending`, `/v1/invitations/:invitationId/accept` and `/v1/invitations/:invitationId/decline`.
- Added DB functions for email-matched pending invitation discovery, id-based accept without token, and irreversible invitee decline.
- Added invitation delivery state tracking so send failures mark the pending invitation as failed without revoking the invitation or rolling back the employee record.
- Surfaced delivery failure state in the employee drawer while keeping the pending invitation visible for revoke/reissue.
- Verification: `supabase db reset --local`, 8 focused DB suites passed 200 tests, API typecheck passed, API invitation/auth/app tests passed 72 tests, Web typecheck passed, and focused EmployeeDrawer/AppShell tests passed 15 tests.
- Added wrong-account invite-link handling: if an authenticated account does not match the invited email, the accept action is hidden and the page shows only the masked invited email plus a switch-account action.
- Verification: focused `AcceptInvitationPage` test passed for the wrong-account switch flow.
- Added dedicated `/no-organization` acquisition state for accounts with no pending invitations and no organization memberships, without promoting business setup in the organization switcher.
- Verification: focused `PendingInvitationsPage`, `NoOrganizationPage` and `AcceptInvitationPage` tests passed 8 tests.
- Added explicit token-link duplicate-membership guard so same-account/same-organization second links fail before employee linking, matching the pending-invitation accept path.
- Added DB lifecycle proof for revoked invitation rejection, accepted token single-use, duplicate same-org link rollback and expired invitation non-linking.
- Verification: `supabase db reset --local`, 8 focused DB suites passed 211 tests, API typecheck passed, Web typecheck passed, API focused tests passed 72 tests, and Phase 3 frontend focused tests passed 23 tests.
- Phase 3 checklist is closed for the current V1 scope.

**Acceptance Criteria:**

- [x] Invitee who signs up before opening link is redirected to pending invitation choice.
- [x] Potential customer with invite can still start own business without declining invite.
- [x] Existing active user is not blocked by new invitation.
- [x] Same email already linked in same organization blocks second link without auto-merge.
- [x] Invite accept is atomic against expiry/revoke/duplicate-link races.

## Phase 4: Owner Onboarding and Minimal Trial Entitlement

**Goal:** Implement four-step owner setup without leaking unfinished draft organizations into normal tenant surfaces.

**Tasks:**

- [x] Owner onboarding step 1: organization name only.
- [x] Step 2: one or more locations; name, country and timezone are required, address details are optional in V1 and stored as empty strings when omitted.
- [x] Step 3: one or more departments and jobs; at least one department and one job required.
- [x] Step 4: optional team; supports repeated manual employee saves and optional invite-after-Finish intent.
- [x] Decide whether location address should become nullable before relaxing the Step 2 form. Decision: do not introduce true nullable location address columns in V1; relax address details to optional empty-string fields to avoid broad location type churn.
- [x] Remote or `Exclude from schedule` waives employee row location/job requirement.
- [x] Invalid optional rows must be corrected, removed or explicitly discarded before Finish.
- [x] One incomplete draft organization per user; create retries resume the existing incomplete owner draft.
- [x] Owner onboarding save/continue/finish operations use revision checks; field-level background autosave remains deferred.
- [x] `Reset / Start over` clears wizard data before Finish without external invite cleanup.
- [x] Finish is transactional and idempotent: organization setup, locations, departments, jobs, employees, owner readiness and minimal trial entitlement.
- [x] No invitation/outbox item is created before successful Finish.
- [x] Finish is blocked unless at least one active location, department and job exists.
- [x] After Finish, invitation outbox is created exactly once.
- [x] Owner employee record is created and protected from ordinary lifecycle operations.

**Acceptance Criteria:**

- [x] Double-click/retry/timeout creates one org setup and one invite set.
- [x] Browser crash after server commit does not prevent trial entitlement or invite dispatch.
- [x] Draft organization cannot be selected as the default organization and cannot enter normal app/API tenant surfaces.
- [x] Draft organization cannot appear in export/job/notification surfaces.
- [x] Owner can finish without adding employees.
- [x] Bulk import is not implemented; post-onboarding Employees flow continues manual entry.

**Progress 2026-09-05:**

- Implemented the four-step owner onboarding shell in `OwnerOnboardingPage`: organization name, locations, departments/jobs and optional team.
- Extended shared/API/DB onboarding step contracts from max step 3 to max step 4.
- Changed optional team invites to queue in the page and call invitation preparation only after successful owner Finish.
- Added client and DB finish guards so owner onboarding cannot complete without at least one active location, department and job.
- Updated owner workspace creation to reuse the user's existing incomplete owner draft instead of creating duplicate draft organizations.
- Verification: `@newfork/web` typecheck, `@newfork/api` typecheck, `@newfork/shared` tests, focused owner onboarding web tests, account owner-onboarding API route tests and `workspace_rls` DB tests pass locally.
- Added owner onboarding `Start over` endpoint and UI. It only applies before Finish, clears draft locations, departments, jobs and unlinked employee rows, returns the wizard to step 1 and records an audit event.
- Added Step 4 draft guard so partially-entered optional employee rows must be added or explicitly cleared before Finish; owner can still finish with no employees when the foundation exists.
- Verification: `supabase db reset --local`, 9 focused DB suites passed 266 tests, API typecheck passed, Web typecheck passed, API focused tests passed 86 tests, and Phase 3-4 frontend focused tests passed 33 tests.
- Added idempotent owner employee record creation during owner onboarding completion. The generated owner profile is linked to the owner membership, excluded from scheduling by default, guarded from ordinary employee save/archive lifecycle paths, and backfilled for already-completed owner onboarding rows.
- Verification: clean local `supabase db reset --local`, focused `workspace_rls` passed 87 tests and focused `employee_directory_rls` passed 98 tests.
- Added DB-level completion idempotency for owner onboarding. A retry of `mark_complete=true` after completion is now a no-op and does not duplicate completion audit; attempts to reopen completed owner onboarding through the save endpoint are rejected.
- Verification: clean local `supabase db reset --local` and focused `workspace_rls` DB test passed 70 tests.
- Replaced client-memory invite dispatch with server-owned `owner_onboarding_invitation_intents`. Step 4 now persists explicit invite-after-Finish intent separately from `invitation_email`, and the owner onboarding Finish route dispatches queued invites exactly once after completion while keeping delivery failure separate from onboarding completion.
- Verification: clean local `supabase db reset --local`, focused `workspace_rls` DB test passed 76 tests, API focused account route/service tests passed 23 tests, OwnerOnboardingPage focused test passed 10 tests, and API/Web typecheck passed.
- Added internal `workspace_entitlements` with cardless 14-day trial creation inside owner onboarding Finish. Repeated Finish does not duplicate or reset the trial, immediate organization closure cancels the entitlement, and ownership transfer moves the billing owner while requiring a new payment method later.
- Verification: clean local `supabase db reset --local` and focused `workspace_rls` DB test passed 81 tests.
- Added an incomplete-workspace default/app-entry guard. Draft owner organizations no longer become the active account default, `user_workspace_preferences` rejects incomplete onboarding targets, normal API authorization rejects incomplete onboarding unless a route explicitly opts in, and protected app routes send incomplete owners back to `/onboarding`.
- Verification: clean local `supabase db reset --local`, focused `workspace_rls` passed 88 tests, focused `employee_directory_rls` passed 98 tests, API auth resolver tests passed 3 tests, ProtectedRoute tests passed 3 tests, and API/Web typecheck passed.
- Added job-surface guards for incomplete owner workspaces. Background notification/todo paths and scheduled export cron candidate listing require completed onboarding, stale scheduled export execution revalidates onboarding before exporting, while explicit owner-onboarding context resolution remains available for the draft wizard.
- Verification: clean local `supabase db reset --local`, focused `workspace_rls` passed 91 tests, focused `employee_directory_rls` passed 98 tests, Schedule service tests passed 9 tests, API auth resolver tests passed 3 tests, ProtectedRoute tests passed 3 tests, and API/Web typecheck passed.
- Added `workspace_onboarding.revision`, exposed onboarding revision through active/explicit workspace context, and routed owner onboarding save/continue/finish calls through an `expectedRevision` contract. Stale owner onboarding writes now fail with a revision conflict; repeated completion remains idempotent. Step 1 now writes organization name through the owner-onboarding RPC instead of the normal settings route.
- Verification: clean local `supabase db reset --local`, focused `workspace_rls` passed 93 tests, shared tests passed 56 tests, account owner onboarding API route/service tests passed 25 tests, OwnerOnboardingPage tests passed 10 tests, and API/Web typecheck passed.

## Phase 5: Helper Checklist and Product Tour Shell

**Goal:** Give owner/admin guided next steps after onboarding without blocking owner Finish.

**Tasks:**

- [x] Implement minimal post-Finish checklist shell.
- [x] Progress is user-specific per organization for owner/admin in the current local shell.
- [x] Demotion hides checklist; re-promotion restores prior progress.
- [x] Checklist can be closed and reopened from Settings.
- [x] Items navigate to real pages and mark the visit complete.
- [x] Persist checklist progress server-side per user and organization.
- [x] Employees, Kiosk, Documents, Schedule settings, First schedule view and Billing are visit tasks.
- [x] `Set scheduling preferences` is required for checklist completion only.
- [x] `Week starts on` and `12h / 24h` default to no explicit selection for checklist confirmation; Settings cannot save that checklist step until user picks both.
- [x] Checklist item completion must not falsely imply the underlying setup is finished.

**Acceptance Criteria:**

- [x] Owner onboarding completion is not blocked by employees, kiosk, documents, payroll or billing.
- [x] Checklist teaches where setup lives by routing to the actual page.
- [x] Required scheduling preference confirmation can be completed only after both values are selected.

**Progress 2026-09-05:**

- Added a Workspace dashboard setup checklist visible to owner/admin only.
- Added visit tasks for app tour, scheduling preferences, Employees, Kiosk, Documents and first Schedule view; route clicks mark visit progress without claiming real setup completion.
- Employee Hub and Employees invitation data fetchers now use the shared API bearer helper and tab workspace header, so development identities and explicit tenant context behave consistently across route-shell smoke paths.
- Added server-side owner setup checklist progress storage keyed by user and organization, with service-role RPCs, workspace-scoped API routes and frontend query/mutation wiring; the previous local shell persistence path is removed.
- Added checklist mode to Scheduling Settings so `Week starts on` and `Time format` are blank until explicitly selected before Save.
- Verification: focused `WorkspacePage` and `SchedulingSettingsPage` tests plus `@newfork/web` typecheck pass locally.
- Added focused checklist tests proving demotion hides the checklist, re-promotion restores the same user/workspace visit progress, and checklist wording remains visit-based rather than claiming setup completion.
- Verification: focused `WorkspacePage` tests passed 6 tests and `@newfork/web` typecheck passed.
- Verification: focused `workspace_rls` DB test covers empty progress, persisted item completion, invalid item denial and outsider denial; focused API route/service tests cover setup checklist reads and mutations; focused `WorkspacePage` tests, web/api/shared typechecks pass locally.
- Added General Settings controls to hide or show the Workspace setup checklist using the server-side checklist progress record. Closed checklists no longer render on the Workspace dashboard while their prior visit progress remains reopenable.
- Verification: focused `WorkspacePage` and `GeneralSettingsPage` tests passed 9 tests; `@newfork/web` typecheck passes locally.
- Browser smoke: owner development identity can see the Workspace checklist, hide it from General Settings, observe it removed from Workspace, reopen it from General Settings and see it return.
- Added Billing as a provider-deferred optional checklist visit that routes to account workspace management instead of introducing full billing UI.
- Verification: focused `WorkspacePage`, shared schema and communications service tests passed; clean local `supabase db reset --local`, focused `workspace_rls` DB test passed 82 tests, and API/Web/Shared typecheck passed.

## Phase 6: Employee Onboarding and Activation

**Goal:** Let invited users bind accounts to organization-specific employee records and become active only after required verification is complete.

**Tasks:**

- [x] Invitation acceptance creates pending membership and tenant-specific onboarding case.
- [x] Employee onboarding steps: legal/contact profile, optional availability, documents/policies, review & submit.
- [x] Legal name is organization-scoped; employer provisional name is confirmed by employee.
- [x] If employee changes legal name during onboarding, owner/admin approval is required before activation.
- [x] No preferred name/nickname in V1.
- [x] Global phone is optional at signup/account; employee onboarding requires confirmed phone value.
- [x] If global phone exists, it wins over employer provisional phone; user confirms it.
- [x] If absent, employee enters/confirms phone and it becomes global.
- [x] Owner/admin/scoped manager see phone read-only; coworker sharing toggle controls only coworker visibility.
- [x] Birthday is optional full date and organization-specific.
- [x] Emergency contact is required: name, relationship, phone; email optional.
- [x] No home address, payroll, tax or I-9 in V1.
- [x] SSN is completely deferred from V1 employee onboarding.
- [x] Availability optional; skip means fully available all seven days until changed.
- [x] Availability requirement is not required and does not block activation.
- [x] Documents and acknowledgements follow requirement snapshot.
- [x] Onboarding can be reset/start-over according to lifecycle matrix.
- [x] Final approval defaults off and auto-activates when no blocking review remains.
- [x] Final approval setting can be enabled; when on, approver cannot be submitter.
- [x] Activation invalidates auth/session/cache immediately.

**Acceptance Criteria:**

- [x] Pending user cannot access normal app until activation.
- [x] Admin/manager invitees also complete onboarding before privileged access.
- [x] Rejected step preserves progress and returns user to correction.
- [x] Role stays fixed during pending onboarding and does not grant privileges until activation; role changes start after activation.
- [x] Employee can leave pending onboarding with warning; active employees cannot self-leave.

**Progress 2026-09-05:**

- Removed the employee onboarding identity/SSN screen from the frontend flow and sent any legacy SSN requirement route to review instead of a dead identity page.
- Added a DB migration that supersedes existing active SSN requirements and prevents new employee onboarding cases from generating SSN requirements.
- Updated onboarding initialization so availability is created as optional and non-blocking while profile, required documents and required acknowledgements remain blocking where configured.
- Updated the employee onboarding RLS test contract from five requirements to four and verified SSN is absent while availability is optional and can be skipped before submit.
- Simplified the V1 employee profile form and schema: no preferred name field, no home address fields, optional full-date birthday, required phone and emergency contact remain.
- Removed preferred name from the employee drawer UI and enforced an empty preferred-name value through the employee save service plus DB constraint.
- Added a DB migration that keeps legacy private-profile columns but allows V1 onboarding to save without home address, country code or birthday.
- Added optional account-level phone storage and Profile UI support without SMS verification.
- Enforced phone precedence on the server: an existing global account phone wins, otherwise the onboarding phone is written back to the global account profile and the employee private profile.
- Made invitation acceptance initialize a tenant-specific employee onboarding case in the DB for both token-link and generic-signup/id acceptance flows.
- Kept no-context normal app access behind the pending invitation review surface and routed accepted pending members without open invites to `/welcome`.
- Verification: clean local Supabase reset, focused `employee_onboarding_rls` DB test, focused `EmployeeOnboardingPage` web test and `@newfork/web` typecheck pass locally.
- Additional verification: focused `employee_directory_rls` DB test proves accepted invitations create pending memberships and onboarding cases.
- Additional verification: focused `PendingInvitationsPage` and `ProtectedRoute` tests prove pending users do not enter normal app routes and accepted pending users are recovered into employee onboarding.
- Additional verification: focused `EmployeeDrawer` test and `employee_directory_rls` DB test prove the V1 preferred-name path stays hidden/empty.
- Added a private-contact projection to employee drawer details for owner/admin/scoped manager views, with phone, optional birthday, emergency contact and coworker-sharing status rendered read-only.
- Removed stale SSN status copy from the manager onboarding review panel.
- Additional verification: focused `EmployeeDrawer` test, shared schema test, web typecheck and `employee_directory_rls` DB test prove the private-contact drawer projection and UI contract.
- Updated employee onboarding projection so the profile step is prefilled from the employer-provided employee legal first/last name until the employee saves a private profile.
- Additional verification: focused `employee_onboarding_rls` DB test and `EmployeeOnboardingPage` test prove provisional legal name prefill.
- Added legal-name review gating: employee changes from the employer-provided provisional name now set the profile requirement to `awaiting_review`, managers cannot approve it, and owner/admin approval publishes the accepted legal name to the employee display source.
- Verification: clean local `supabase db reset --local`, focused `employee_onboarding_rls` DB test, focused `EmployeeDrawer` and `EmployeeOnboardingPage` tests, shared tests and web typecheck pass locally.
- Note: Supabase pgTAP test files should run sequentially; a parallel run produced a pgTAP enable collision, while both focused DB tests passed when run individually.
- Added employee self-service `Start over` flow for onboarding: API route, service RPC, DB reset of private profile/document/acknowledgement/availability answers, requirement status reset and frontend confirmation action.
- Verification: focused `employee_onboarding_rls` DB test, `apps/api/src/app.test.ts`, `EmployeeOnboardingPage` test, API typecheck and web typecheck pass locally.
- Added V1 emergency contact relationship and optional emergency email across shared schema, employee onboarding form, private profile persistence and authorized drawer read-only projection.
- Verification: focused `employee_onboarding_rls` and `employee_directory_rls` DB tests, focused `EmployeeOnboardingPage` and `EmployeeDrawer` tests, shared tests and API/web typecheck pass locally.
- Added default-off employee onboarding auto-activation on submit: if every required activation-blocking requirement is completed, the pending membership is activated and the onboarding case is approved atomically.
- Verification: clean local `supabase db reset --local` and focused `employee_onboarding_rls` DB test pass locally for default-off auto-activation.
- Completed final approval gating: workspaces can require explicit activation after submit; pending submitters cannot activate themselves; owner/admin activation uses the same atomic membership/case transition; default-off cases auto-activate after the final reviewed blocker is accepted.
- Verification: focused `employee_onboarding_rls` DB test now covers final-approval-on waiting, owner activation and review-acceptance auto-activation.
- Wired employee onboarding activation recovery in the frontend: an approved onboarding refetch clears tenant-scoped query state, removes the stale self-onboarding query, refreshes auth/workspace context and routes to employee hub.
- Fixed the review submit surface so `Submit for review` is a real form submit instead of an inert button.
- Verification: focused `EmployeeOnboardingPage` test proves submit-triggered activation refresh, with `@newfork/web` typecheck passing locally.
- Locked requirement snapshot immutability: document and acknowledgement requirements are created only when the onboarding case has no existing requirements, so later required config/version changes do not mutate an in-progress case.
- Verification: focused `employee_onboarding_rls` DB test proves late document and acknowledgement sources stay excluded from an existing onboarding snapshot.
- Added DB proof that an admin-role invitee remains `pending_activation` after accepting the invite and receives no privileged directory access until onboarding activation.
- Verification: focused `employee_directory_rls` DB test covers privileged invitee pending-access isolation.
- Added pending self-leave for employee onboarding: a warned employee can cancel pending onboarding, membership is suspended, audit/onboarding events are written, and active employees are rejected.
- Added rejected profile correction visibility on the employee onboarding profile step, while preserving prior progress and first-actionable routing.
- Locked pending-role behavior with DB coverage: accepted admin-role invitees remain without privileged access and drawer role changes require an active membership.
- Verification: focused `employee_onboarding_rls` + `employee_directory_rls` DB tests passed 151 tests; `@newfork/api` typecheck passed; focused `app.test.ts` passed 69 tests; `@newfork/web` typecheck passed; focused `EmployeeOnboardingPage` test passed 7 tests.
- Fixed employee onboarding first-load initialization through PostgREST by redefining `get_employee_onboarding_service(uuid)` as `volatile`; the function intentionally initializes missing cases and cannot be treated as read-only.
- Verification: focused `employee_onboarding_rls` DB test passes 72 tests, full DB suite passes 38 files / 1067 tests, full API suite passes 29 files / 249 tests, focused auth/workspace/sign-in web tests pass 16 tests, full web suite passes 157 files / 764 tests, and API/web typechecks pass locally.
- Browser smoke: local owner signup can create a draft organization, finish onboarding, dispatch the queued invite into the development-only invitation mailbox, invited employee can create an account, accept the invite without seeing a person name, and `/welcome` now opens the employee onboarding shell instead of the prior `read-only transaction` error.
- Completed the local browser smoke through employee activation: profile completion, submit, server-derived activation, context refresh and employee-only `/app/employee-hub` shell all work without exposing management navigation.
- Fixed activated location-scoped employee context loading by granting `service_role` read access to `membership_location_scopes`; the API resolver needs this server-side projection for `all_locations=false` memberships after onboarding activation.
- Verification: full DB suite passes 38 files / 1069 tests, full API suite passes 29 files / 255 tests, full shared suite passes 4 files / 65 tests, full web suite passes 157 files / 764 tests, API/web/shared typechecks pass, and browser smoke reaches Employee Hub after activation.

## Phase 7: Roles, Drawer Access, Location Scope, Archive/Rehire

**Goal:** Enforce role hierarchy and location-scoped management exactly as decided.

**Tasks:**

- [x] Implement actor-role x target-role x operation matrix.
- [x] Owner edits all lower roles and protected owner actions.
- [x] Admin edits manager/employee records; cannot edit owner/peer-admin controlled fields.
- [x] Manager sees only assigned-location employee-class records in Employees list.
- [x] Manager opens/edits drawers only for employee-class or unlinked employee records in assigned locations.
- [x] Employee role cannot access Employees page or menu.
- [x] Role/scope changes take effect immediately in open sessions.
- [x] Manager cannot expand own scope.
- [x] Manager cannot change roles.
- [x] Manager cannot organization-wide suspend/revoke membership; use only the scoped operation or escalation path selected in the Phase 0 contract.
- [x] Owner cannot demote self in drawer; ownership transfer is separate.
- [x] Active organization cannot have zero owners.
- [x] Archive removes org from switcher, ends live access to global email/phone, preserves history.
- [x] Rehire reuses archived record and starts new invite/onboarding verification.
- [x] Remote/excluded employee can have zero location/job; otherwise active employee needs at least one location and one job.

**Acceptance Criteria:**

- [x] Employee direct URL to management area fails closed.
- [x] Manager cannot see out-of-scope employees in list.
- [x] Manager cannot alter manager/admin/owner records.
- [x] Last owner cannot be archived, suspended, revoked, unlinked, deleted or account-removed through ordinary flows. Direct delete, direct suspend, role-id demotion, employee drawer archive and active-access account deletion paths are covered; membership unlink is schema-blocked and no separate revoke/unlink endpoint is in V1 scope.
- [x] Rehire does not create duplicate employee record.

**Progress 2026-09-05:**

- Tightened `can_access_employee` so manager access requires both assigned-location scope and an employee-class or unlinked employee record; linked manager/admin/owner records are no longer visible or editable through the manager drawer path.
- Verification: focused `employee_directory_rls` DB test covers owner visibility, manager list filtering, denied manager drawer detail and denied manager edit for a linked manager employee profile; focused `employee_onboarding_rls` still passes after the migration.
- Added employee-level `remote` and `exclude from schedule` flags to shared schemas, drawer state, API save payloads and DB save functions. Scheduled employees still require at least one location and one job unless one of those flags is enabled.
- Projected `is_excluded_from_schedule` into the schedule read model so the existing schedule conflict logic receives the DB-backed exclusion flag without changing Schedule add/edit UI.
- Verification: shared tests, API/web typechecks, employee drawer/API focused tests, `supabase db reset --local`, `employee_directory_rls`, `employee_onboarding_rls` and `schedule_read_model_rls` all pass for this slice.
- Added a DB/API/drawer path for linked employee role changes. Owner can assign owner-dışı roles, admin cannot assign admin/owner access, unlinked employee role remains invitation-owned and owner access stays behind separate ownership transfer.
- Verification: `employee_directory_rls` covers owner promotion to admin, immediate membership role update, admin denied admin assignment, owner-role assignment denial, unlinked employee denial and owner archive denial through the drawer lifecycle; API route and EmployeeDrawer focused tests cover the new endpoint/UI path.
- Split employee read access from employee write access with `can_manage_employee_record`, so owner/admin can keep broad drawer visibility while ordinary drawer saves are limited to allowed lower-role targets.
- Added DB coverage that admin can edit employee-class records but cannot edit peer-admin records; pending onboarding role changes still require active membership, and role update already refreshes auth plus tenant-scoped drawer/list/reference queries in the UI.
- Verification: clean local `supabase db reset --local`; focused `employee_directory_rls` + `employee_onboarding_rls` DB tests passed 154 tests.
- Added assignment-specific location write guard: scoped managers can edit scoped employee records but cannot move them into locations outside their own assigned location scope. All-location managers remain intentionally broader.
- Verification: focused `employee_directory_rls` DB test passed 84 tests.
- Added switcher projection filtering for archived linked employees: employee archive keeps membership/history, suspends live workspace access and removes that organization from the archived user's account workspace list while preserving non-archive suspended projections.
- Verification: clean local `supabase db reset --local`, focused `employee_directory_rls` passed 89 tests and focused `workspace_rls` passed 82 tests.
- Added rehire restore semantics: restoring an archived linked employee no longer silently restores access; it detaches the employee record for a fresh invite, keeps the suspended membership hidden from the switcher, reuses that membership on invitation acceptance, and resets old onboarding progress before the new pending activation flow.
- Verification: clean local `supabase db reset --local`, focused `employee_directory_rls` passed 98 tests, focused `workspace_rls` passed 82 tests, focused `EmployeeDrawer` test passed 8 tests, and `@newfork/web` typecheck passed.

## Phase 8: Documents, Acknowledgements, Todo, and Schedule Conflict Validation

**Goal:** Add compliance readiness without redesigning Schedule.

**Tasks:**

- [x] Document requirement config supports required/optional, manual review, expiration required, expiration impact.
- [x] Optional document never blocks activation.
- [x] Required document with manual review blocks activation until approved.
- [x] Owner/admin manage document rules.
- [x] Manager reviews only employee-role scoped documents.
- [x] Acknowledgement evidence stores requirement version, content hash, accepted timestamp and actor/account/employee IDs.
- [x] Requirement snapshots are immutable for in-progress onboarding.
- [x] Expiration impact changes require preview and effective policy version.
- [x] Implement automatic source-linked compliance todos with dedupe keys.
- [x] Manual Todo can be minimal; detailed Todo UX remains separate.
- [x] Tracking-only expiration creates notification/todo only.
- [x] Soft conflict shows fast `Cancel` or `Schedule anyway`; no written reason. Existing add/edit soft conflicts now continue with one click and no written reason, and DB preview classifies expired `warn` documents as soft and overrideable; document-specific review/draft-preservation work remains tracked under the separate review-drawer item.
- [x] Hard conflict blocks new assignment/edit/republish; no override. DB preview classifies expired `block` documents as hard/non-overrideable, edit-session assigned create/update now rolls back with `employee document hard conflict`, and publish overloads roll back with `schedule has hard document blockers`.
- [x] Pending uploaded document during conflict offers `Review document`, opens Employee drawer Documents tab, preserves schedule draft, recalculates after approve/reject. DB preview exposes `review_action = review_document` and pending document id; shared/web recovery parsers accept document-expiry conflict payloads with stable labels/keys; API publish recovery converts scoped hard-document blockers into `schedule_conflicts`; Publish dialog renders `Review document`; SchedulePage opens the Employee drawer Documents tab and document accept/reject success triggers a scoped publish preview refresh without clearing the publish state. Browser proof: local fixture `Document hard conflict publish draft` hit the hard document conflict, `Review document` opened Alex Kim's Documents tab, accepting `Schedule certificate` changed the requirement to completed, preserved the same draft and Main Dining-only scope, cleared the conflict, and allowed the dialog to continue to Pre-flight.

**Acceptance Criteria:**

- [x] Existing Schedule add/edit UX still works. Local focused proof: `ShiftQuickEditor`, `drawerMachine`, `draftSaveFlow`, `ScheduleConflictSheet`, `ScheduleConflictNotice` and `PublishScheduleDialog` tests pass; the latest Schedule touch is limited to removing written soft-conflict reasons from the existing conflict sheet.
- [x] Soft conflict override is one-click and auto-audited. `ShiftQuickEditor` add/edit soft conflicts submit a fixed audit marker with no manual reason, and `mutate_schedule_edit_shift_service` writes `schedule.soft_conflict_overridden`.
- [x] Hard conflict cannot be bypassed.
- [x] Schedule draft is preserved across document review drawer flow. Focused Publish dialog and Employee drawer tests prove the document-review callback does not clear conflict/publish state and document accept/reject success triggers repreview; browser proof confirms the selected draft, selected location scope and dialog flow remain usable after review.
- [x] System compliance todos cannot be manually completed and close only when source resolves.

**Progress 2026-09-05:**

- Added document type expiration schedule impact config (`track_only`, `warn`, `block`) across shared schemas, settings UI, API RPC arguments and DB persistence.
- Enforced that optional documents cannot become hard schedule conflicts; disabling expiry normalizes schedule impact back to tracking-only.
- Verification: shared schema tests, API/web typechecks, document type API route test, `supabase db reset --local`, `document_types_rls` and `employee_onboarding_rls` pass for this slice.
- Added service-side employee scope enforcement for onboarding review and private document download paths, so a custom document-review manager can access only scoped employee-role records and cannot open/download manager-role targets.
- Verification: `employee_onboarding_rls` covers scoped manager document download, manager-role review denial and manager-role document download denial.
- Added a service-only `workspace_todos` table and automatic document-expiry todo sync with source-key dedupe. Workspace dashboard now includes a `Todos` widget, with legacy 6-widget layouts normalized by appending the new widget.
- Verification: `communication_operations` covers todo creation from a tracking-only expiring document, dashboard projection, dedupe, and source-resolution close; `WorkspacePage` focused test covers todo rendering.
- Strengthened acknowledgement evidence coverage for template version, digest, authenticated actor and membership, and carried forward immutable in-progress requirement snapshot coverage.
- Verification: `employee_onboarding_rls` now covers acknowledgement evidence payload and existing late document/acknowledgement exclusion for active onboarding cases.
- Added document-expiry policy versioning plus a Schedule-independent document conflict preview RPC. The preview fingerprint includes document policy version, so stale Schedule conflict decisions can fail closed once the UI/mutation path is wired.
- Added `people.employee_document.expiring` to the notification catalog and connected expiring-document todo sync to source-linked outbox enqueue for owner/admin/manager recipients who can access that employee record.
- Verification: `schedule_publication` covers tracking-only no-conflict, `warn` soft/overrideable conflict, `block` hard/non-overrideable conflict and pending replacement document review affordance metadata; `communication_operations` covers source-linked notification enqueue dedupe; `notification_platform_core` and shared catalog tests pass with the new type.
- Added minimal manual Workspace Todo create/resolve service RPCs, API routes and dashboard widget controls; employee-role users are blocked, manager employee tags are scoped, and system-generated compliance todos still resolve only from their source.
- Verification: `communication_operations` covers manual todo create/resolve and system-todo manual resolve denial; API app/service tests cover route/RPC forwarding; WorkspacePage tests cover manual create/resolve UI.
- Strengthened Schedule-independent document conflict preview with a same-account cross-tenant denial proof: an actor who is only `employee` in the requested tenant cannot preview conflict metadata for another tenant's draft.
- Verification: focused `schedule_publication` now passes 36 tests, including the cross-tenant document-conflict signal denial.

**Progress 2026-09-06:**

- Revalidated the existing Schedule add/edit/draft/conflict component surface without changing Schedule source. Focused `@newfork/web` tests passed for `ShiftQuickEditor`, `drawerMachine`, `draftSaveFlow`, `ScheduleConflictSheet`, `ScheduleConflictNotice` and `PublishScheduleDialog` with 54 tests.

## Phase 9: Ownership Transfer, Organization Closure, Soft Lock, Account Deletion

**Goal:** Prevent ownerless organizations and make destructive operations explicit and irreversible where required.

**Tasks:**

- [x] Ownership transfer target must be active, onboarding-complete admin with verified email.
- [x] Current owner strong reauthenticates and initiates transfer.
- [x] Target strong reauthenticates and accepts/rejects.
- [x] Pending transfer locks competing transfer, owner role write, owner lifecycle write, organization closure, account deletion/removal and internal billing-owner mutations. External billing-provider mutations remain Phase 10/future provider scope.
- [x] Acceptance atomically promotes target and demotes prior owner; current-tab authorization cache invalidates.
- [x] Prior owner's payment method detach obligation is recorded after transfer without implementing the future billing provider. V1 records `billing.payment_method.detach_required_after_owner_transfer`, moves the internal billing owner and requires a new payment method before renewal; historical invoice/payment instrument handling remains in the future billing provider plan.
- [x] Owner-only organization closure supports scheduled end-of-period and immediate deletion.
- [x] Scheduled deletion keeps access until paid/trial end and can be canceled.
- [x] Immediate deletion requires strong reauth, typed org name, explicit no-refund/data-loss warning and is unrecoverable by user/support.
- [x] Immediate deletion tombstones the workspace, suspends memberships, revokes pending invitations and clears active workspace preferences synchronously.
- [x] Immediate deletion closes tenant sessions, kiosk/API access, jobs, cache, realtime and storage authorization synchronously.
- [x] Purge is idempotent in background with minimal external tombstone. API cron worker now processes due service-only purge jobs and records idempotent tombstone completion; destructive physical cascade deletion remains a separate retention-map decision.
- [x] System retention purge is separate from owner deletion.
- [x] Global account deletion is allowed only when no active organization access remains.
- [x] Account deletion disables account immediately and allows 14-day restore. API service now applies a Supabase auth ban, revokes refresh sessions globally after a successful deletion request and lifts the ban after restore; purge remains tracked separately.

**Acceptance Criteria:**

- [x] Owners cannot demote themselves outside transfer.
- [x] Organization cannot become ownerless.
- [x] Immediate closure is not recoverable and no post-delete export exists. DB proof covers deleted workspaces being absent from account projections and unable to re-enter/cancel closure lifecycle; API proof covers scheduled export candidate revalidation and cron skip without rendering or delivery after deletion.
- [x] Scheduled closure can be canceled before effective time.
- [x] Global accounts of other users remain after organization closure, with no organization access.

**Progress 2026-09-05:**

- Added workspace lifecycle state (`active`, `closure_scheduled`, `deleted`) and closure request audit rows.
- Added owner-only service RPCs for scheduled closure, cancellation and immediate closure. Scheduled closure remains visible and interactive until its effective time; immediate closure is user-unrecoverable by tombstoning the workspace rather than physically cascading data deletion inside the request transaction.
- Tightened workspace membership, permission, location and employee access helpers so deleted workspaces and expired scheduled closures cannot resolve as active tenant context.
- Added account API endpoints and Workspaces UI actions for `Close later`, `Cancel close` and typed-name `Close now`.
- Added ownership transfer table, service RPCs, account API endpoints, pending transfer projection, client helpers and Workspaces shell actions for initiation and target accept/reject.
- Added account deletion request lifecycle with no-active-organization eligibility, 14-day restore RPC, account API endpoints and Profile destructive action that signs the user out after the request.
- Added immediate-closure runtime revocation: active schedule edit sessions expire, kiosk devices/action sessions/enrollment codes are revoked or expired, employee kiosk credentials are deactivated, pending notification outbox jobs are suppressed, and revocation counts are audited. Realtime/storage access remains denied through the workspace lifecycle and membership access helpers after tombstone.
- Added API unit proof that scheduled export candidates are rejected for deleted workspaces before export delivery can run.
- Added account deletion auth lifecycle side effects in the API service: successful deletion requests ban the Supabase auth user for a long duration and globally revoke sessions; successful restore lifts the ban.
- Fixed ownership-transfer expired-cancel schema drift by adding the `cancelled_by` column used by the response RPC; `supabase db lint --local --level warning` no longer reports the previous missing-column error.
- Added an explicit pending ownership-transfer guard to global account deletion, covering both the initiating owner and the target admin before the broader active-organization-access guard.
- Added service-only workspace retention purge jobs and minimal tombstones. Immediate closure enqueues purge separately; system completion is idempotent and audited without making owner deletion user-restorable.
- Added an internal workspace-retention cron worker and route. The worker reads due service-only purge jobs, calls the existing tombstone completion RPC, reports idempotent completions and per-job failures, and stays behind the same cron-secret boundary as other internal jobs.
- Verification: clean local `supabase db reset --local`, focused `workspace_rls`, `employee_directory_rls`, `employee_onboarding_rls`, `document_types_rls` and `communication_operations` DB tests pass; latest closure regression set also passes `workspace_rls`, `employee_private_storage_contract`, `schedule_edit_sessions`, `kiosk_security_foundation`, `kiosk_online_capture`, `kiosk_manager_controls` and `notification_platform_core` with 224 DB tests. Shared schema tests, API route test, web typecheck and focused Workspaces page test pass.

**Progress 2026-09-06:**

- Added a pending ownership-transfer membership lock. While a transfer is pending, the previous owner and target admin membership cannot be role-changed, suspended, deleted or rebound through ordinary membership updates; the transfer acceptance RPC remains the only bypass.
- Added DB proof that pending transfer blocks direct target role change, target suspension, participant rebinding and drawer archive access suspension before ownership acceptance can act on stale assumptions.
- Added an internal entitlement guard so pending ownership transfer blocks direct billing-owner/payment-method-required/provider-id mutations, while the transfer acceptance RPC can still atomically move the internal billing owner through its `app.owner_transfer` bypass.
- Verification: focused `workspace_rls` local pgTAP passes 113 tests, full local pgTAP DB suite passes 38 files / 1071 tests and local Supabase advisors report no issues after the internal billing-owner lock.
- Added direct last-owner invariant proof for role-id demotion and membership unlink attempts.
- Verification: clean local `supabase db reset --local`; focused `workspace_rls` passes 105 tests; focused `employee_directory_rls` and `employee_onboarding_rls` pass 169 DB tests; focused account route/service API tests pass 25 tests; API and shared typechecks pass.

## Phase 10: Billing and Trial Specification Only

**Goal:** Keep billing decisions ready without smuggling full billing implementation into onboarding.

**Tasks:**

- [x] Define minimum internal `trial_entitlement` contract if Phase 4 depends on trial start.
- [x] Document cardless 14-day trial start on successful owner Finish.
- [x] Define soft-lock route/mutation allowlist for trial expiry/payment failure.
- [x] Define billing owner/payment instrument behavior after ownership transfer.
- [x] Define system retention notices, export window, restore behavior and purge actor semantics.
- [x] Leave provider, pricing, packages, seat definition, refunds/disputes and webhook reconciliation for billing plan.

**Acceptance Criteria:**

- [x] Owner onboarding can finish and send invites without full billing provider integration.
- [x] Trial expiry/read-only lock behavior is specified but not overbuilt.
- [x] Billing implementation has its own future plan.

**Progress 2026-09-05:**

- Added `docs/rebuild/onboarding-billing-trial-spec-v1-2026-09-05.md` to lock the internal entitlement contract, cardless 14-day trial rule, soft-lock allowlist, ownership-transfer billing obligation and provider-deferred boundary.
- Implemented only the internal entitlement slice required by Phase 4: no Stripe/customer portal/pricing/seat/refund/webhook behavior was added.

## Phase 11: Full Verification Matrix

**Goal:** Prove role, tenant, lifecycle and shell contracts across unit/API/DB/browser layers.

**Tasks:**

- [x] Shared schema tests for every state and projection. Account workspace lifecycle, closure-scheduled active and non-active access, deleted-row rejection, active-context user/workspace mismatch rejection, pending ownership transfer complete/partial projections, incomplete pending ownership transfer metadata suppression for missing id/role/expires fields, fail-closed non-active membership `isActive` coercion, non-active transfer metadata suppression even with closure-scheduled lifecycle signals, stale all-location scope trimming, malformed workspace row rejection, optional location address input, communication app-local action URL enforcement, notification settings catalog action-route enforcement, employee onboarding action-path exact-root/subpath allowlisting and document-expiry schedule conflict result parsing are covered. Verification: full shared suite passes 4 files / 68 tests.
- [x] API tests for every transition action, guard and idempotency path. Account workspace, active-workspace selection deriving workspace from path, closure, closure cancellation deriving workspace from path, ownership transfer, account deletion, account-deletion restore deriving account from bearer token, owner-onboarding invitation-intent mismatch, owner-onboarding reset mismatch, owner-onboarding completion dispatch mismatch, employee invitation prepare/revoke path-context mismatch, employee invitation prepare/revoke/accept/pending actions deriving actor/workspace/employee/invitation identity from context, token and path, employee management permission route wiring, employee directory route mismatch guards across list, detail, create, update, role, archive and termination endpoints, employee directory write routes ignoring spoofed body actor/workspace/path resource fields, self employee-onboarding write routes deriving account identity from bearer token and requirement identity from path, manager employee-onboarding review/download route mismatch guards across read, availability, request and document download endpoints, manager employee-onboarding review/download successful routes deriving actor/workspace/employee/requirement from context and path, employee hub route mismatch guards across read, availability, request and own time-tracking endpoints, employee hub write routes ignoring spoofed body actor/workspace/idempotency fields, manager time entry route mismatch guards across read, manual entry, amendment, correction and review endpoints, manager time entry write routes ignoring spoofed body actor/workspace/path resource/idempotency fields, kiosk manager route mismatch guards across enrollment, management, device, PIN and revocation endpoints, kiosk manager writes ignoring spoofed body actor/workspace/resource fields, communication route path/context mismatch guards across read, write, transition, notification action, dashboard, todo and checklist endpoints, communication write routes ignoring spoofed body actor/workspace fields, notification settings route path/context mismatch guards across organization policy and personal preference endpoints, notification settings write routes ignoring spoofed body actor/workspace fields, settings route mismatch guards across scheduling settings, role, document-type and signature policy/template endpoint families, settings write routes ignoring spoofed body actor/workspace/path resource fields, signature settings write routes deriving actor/workspace/path resources from context, path and URL, Schedule reference explicit-context mismatch guards, Line-up v1 route mismatch guards, Schedule Requests v1 route mismatch guards, production denial of development-only reauth bypass, development invitation mailbox guard, account lifecycle and owner-onboarding service RPC forwarding, service-role scoped location resolution, malformed explicit context header rejection, runtime context schema validation, cross-account resolver row rejection, explicit acknowledgement enforcement before closure/account deletion service calls, hard-document-blocker recovery no-week-scope fallback, empty scoped document-conflict recovery fallback and document-conflict recovery HTTP serialization are covered. Verification: full API suite passes 32 files / 281 tests.
- [x] RLS tests for same user in two orgs with different roles.
- [x] Web route tests for employee/manager/admin/owner shell and direct URL behavior.
- [x] Browser smoke for owner signup -> Finish -> invite -> accept -> employee onboarding -> activation.
- [x] Browser smoke for multi-org switch, default org, pending/suspended cards and safe landing.
- [x] Browser smoke for document conflict review without Schedule draft loss. Local browser proof: publishing `Document hard conflict publish draft` for Main Dining only produced the hard `Schedule certificate` document conflict; `Review document` opened the Employee drawer Documents tab; accepting the pending document kept the publish dialog open on the same draft and Main Dining-only scope, cleared the conflict, and allowed continuation to Pre-flight.
- [x] Negative tests for foreign resource IDs, stale cache, stale default, header/body mismatch, storage URL after scope loss and notification/todo bleed. Private employee document path resolution is denied after immediate workspace closure; same-account cross-organization notification reads, mutation and unread-count bleed are denied; same-account public audit rows do not leak from an employee-scope workspace; same-account availability rules stay workspace-scoped; same-account employee role in another tenant cannot read manager Schedule read-model data or preview document-conflict metadata; Schedule reference routes fail closed when explicit workspace context resolves another tenant; Line-up v1 routes fail closed on path/context mismatch before read, section, entry, brief or share services are called; Schedule Requests v1 routes fail closed on path/context mismatch before read, viewed, time-off decision or shift-change decision services are called; employee-scope internal billing entitlement rows/counts do not leak; incomplete pending ownership transfer metadata is suppressed before switcher projection; non-active account workspace rows suppress active access and pending ownership transfer metadata even when closure lifecycle metadata is present; account lifecycle writes derive active workspace selection, closure cancellation and account deletion restore identity/resources from path or bearer token instead of spoofable body fields; owner-onboarding invitation-intent writes fail closed on path/context mismatch; owner-onboarding completion fails closed before save, intent listing or invitation dispatch when path/context mismatches; employee invitation prepare/revoke fails closed on path/context mismatch before the invitation service is called; employee invitation prepare/revoke/accept/pending actions derive actor/workspace/employee/invitation identity from context, token and path instead of spoofable body fields; employee directory routes fail closed on path/context mismatch before list, detail, save, role, archive or termination services are called; employee directory write routes derive actor/workspace/path resources from context, path and URL instead of spoofable body fields; self employee-onboarding write routes derive account identity from bearer token and requirement identity from path instead of spoofable body fields; manager employee-onboarding review and document-download routes fail closed on path/context mismatch before review or storage URL services are called; manager employee-onboarding review and document-download successful routes derive actor/workspace/employee/requirement from context and path instead of spoofable body fields; employee hub routes fail closed on path/context mismatch before read model, availability writes, time-off/shift/request actions or own time-tracking reads/writes are called; employee hub write routes derive actor/workspace and time idempotency keys from context, path and headers instead of spoofable body fields; manager time entry routes fail closed on path/context mismatch before read, manual entry, amendment, correction decision or review approval services are called; manager time entry write routes derive actor/workspace/path resources and idempotency keys from context, path and headers instead of spoofable body fields; kiosk manager routes fail closed on path/context mismatch before enrollment, management, label update, re-enrollment, revoke or PIN reset services are called; kiosk manager writes derive actor/workspace/path resources from context and URL instead of spoofable body fields; communication routes fail closed on path/context mismatch before announcements, notification reads/actions, dashboard reads/layout writes, workspace todo create/resolve, setup-checklist reads/writes or announcement transitions are called; communication write routes derive actor/workspace from context instead of spoofable body fields; notification settings routes fail closed on path/context mismatch before organization policy reads/writes/resets/tests or personal preference reads/writes are called; notification settings write routes derive actor/workspace from context instead of spoofable body fields; settings routes fail closed on path/context mismatch before scheduling settings reads/writes, organization entity reorders, shift type/label reorders, role create/update/delete, document type create/update/archive/reorder or signature policy/template writes/transitions are called; settings write routes derive actor/workspace/path resources from context, path and URL instead of spoofable body fields; signature settings write routes derive actor/workspace/path resources from context, path and URL instead of spoofable body fields; authorization helpers fail closed when resolver and route workspace diverge; scoped workspace context fails closed instead of widening access when location scopes cannot be resolved; malformed explicit context headers are rejected before tenant resolution; malformed resolved context is rejected before exposure; resolver rows for another account are rejected without exposing tenant context; communication announcement, notification and notification-settings catalog projections reject unsafe action URLs before UI consumption; employee onboarding action paths reject root lookalikes such as `/welcomebackdoor` and `/app/employee-hubx`; sign-in destination routing rejects external destinations and does not treat `/invite/accept` lookalikes as employee invitation signup; public SECURITY DEFINER functions are not executable by anon/public/authenticated roles; real-session loss of workspace context clears tenant-scoped React Query cache while preserving account-level cache; settings/admin query prefixes are included in tenant cache eviction while account/invitation prefixes remain global. Final verification: full API, web, shared, local DB pgTAP, typecheck, lint and Supabase advisors passed after the document-conflict browser proof and migration-order repair.
- [x] Accessibility/keyboard checks for switcher, shell nav, onboarding wizard, destructive closure dialogs and document review drawer. Switcher and account workspace action buttons expose organization-specific accessible names; switcher exposes organization choices as a named list and reports loading with `aria-busy`; shell nav/collapsed rail labels and active child-route `aria-current` behavior are covered by focused web tests; owner onboarding exposes semantic progressbar state and supports form-submit keyboard flow for workspace identity; ownership transfer, organization closure and account deletion panels are named regions with explicit acknowledgement gates and `aria-describedby` impact copy; accept and reject ownership-transfer responses require password reauthentication; Employee drawer document review actions are labeled by requirement, the active Documents section is exposed with `aria-current`, and the selected document opens through the authorized download path.

**Acceptance Criteria:**

- [x] No P0 acceptance criterion is verified by frontend-only tests.
- [x] Local proof is clearly separated from hosted proof.
- [x] Every skipped/deferred area is listed with reason and owner.

**Progress 2026-09-05:**

- Added focused `PermissionRoute` direct-URL guard tests for employee denial and manager allowance.
- Refreshed local shell/navigation proof: `routeDestinations`, `ProtectedRoute`, `PermissionRoute`, `OrganizationSwitcherPage` and `AppShellNotificationBadge` tests pass.
- Added negative owner invariant proof: `workspace_rls` rejects direct last-owner suspend and `employee_directory_rls` rejects owner archive through the drawer lifecycle.
- Browser smoke partial: in-app browser proves owner/manager shell menu order and employee direct `/app/employees` redirect to `/app/employee-hub`; Employee Hub now reaches the API with development bearer tokens, but the local seed/dev identity lacks a linked employee profile, so the dashboard content remains a fixture gap rather than a route guard failure.
- Added DB negative proof that private employee document path resolution works for an authorized owner while the workspace is active and fails after immediate workspace closure removes interactive access.
- Verification: focused account route test passes with 14 API tests, API typecheck passes, and shared private storage contract test passes.
- Verification: focused `workspace_rls` and `employee_directory_rls` DB tests passed 152 tests after owner invariant and setup-checklist regressions; focused `WorkspacePage` tests passed 6 tests; focused API app/communication-service tests passed 74 tests; web, API and shared typechecks pass locally.
- Verification: focused `WorkspacePage` and `GeneralSettingsPage` tests passed 9 tests after checklist close/reopen UI wiring; web typecheck passes locally.
- Verification: clean local `supabase db reset --local` plus focused `workspace_rls` passed 70 tests after owner onboarding completion idempotency.
- Browser smoke: owner development identity verified server-backed setup checklist hide/show round-trip between `/app/settings/general` and `/app/workspace`.
- Fixed local seed/dev identity mismatch by marking the seeded development workspace onboarding as complete; direct API manual Todo create/resolve now passes against the development owner token, and browser smoke verifies Workspace Todos add/resolve plus the current owner shell order.
- Fixed development account profile/preference saves so fallback identity updates stay local instead of hitting Supabase RLS without a real session; focused AuthContext/Profile tests, web typecheck and browser Preferences save smoke pass.
- Added API auth helper negative coverage that fails closed when the route workspace and resolved tenant context diverge; focused `workspace-context` tests and API typecheck pass.
- Hardened `/v1/context` explicit tab workspace resolution so a mismatched resolver response is rejected instead of becoming accepted tenant context; focused app/auth tests passed 78 tests and API typecheck passes.
- Added route-level Workspace Todo tenant isolation coverage: create/resolve actions return generic not found and never call the service when the resolved workspace differs from the path workspace; focused app test now passes 75 tests.
- Added shared Workspace Todo/dashboard schema coverage for app-local action URLs, manual input normalization and Todo widget projections; shared tests now pass 58 tests after removing a duplicate pending-invitation projection test, and shared typecheck passes.
- Aligned development bearer context with explicit tab workspace headers so dev-only multi-workspace smoke can exercise safe switcher navigation without weakening production resolver checks; focused app test and API typecheck pass.
- Regression verification: focused API app/auth tests pass 79 tests, focused web Auth/Profile/Workspace tests pass 11 tests, and shared tests pass 58 tests after the Phase 11 tenant/dev-smoke hardening batch.
- Runtime smoke: local API `/v1/context` now returns a matching development context for an explicit `X-Newfork-Workspace-Id` instead of forcing the default development workspace.
- Hardened reference-style Schedule reads so an explicit `X-Newfork-Workspace-Id` fails closed if the resolver returns another tenant; this prevents default/stale tenant context from satisfying an explicit-tab request.
- Verification: full `@newfork/api` test suite passes 238 tests, full `@newfork/web` test suite passes 758 tests, full `@newfork/shared` test suite passes 60 tests, API/web/shared typechecks pass, focused Employee drawer test passes 11 tests, and focused `schedule_publication` DB test passes 36 tests after this hardening batch.
- Added local multi-organization seed fixtures for the real owner account: one active owner organization, one active employee organization with a linked employee profile, one pending membership and one suspended membership.
- Fixed the switcher copy so pending/suspended organizations are described as limited status surfaces instead of future wiring.
- Added direct API helper coverage that even if a malformed resolver returns pending or suspended membership state, normal workspace route authorization fails closed with `workspace_not_found`.
- Tightened retention purge-job tenant ownership by replacing the single-column `closure_request_id` FK with a composite `(closure_request_id, workspace_id)` FK to `workspace_closure_requests`.
- Browser smoke: real `owner@newfork.test` login lands on default Meyhouse owner workspace; organization switcher lists active, pending and suspended memberships; active Employee Demo opens `/app/employee-hub` with employee-only navigation and loaded hub content; pending and suspended organizations open only their limited status pages.
- Verification: clean local `supabase db reset --local`; focused web Auth/Switcher tests pass 6 tests; focused API app/auth tests pass 79 tests plus focused auth helper passes 5 tests; shared tests pass 58 tests; web/API/shared typechecks pass; DB `workspace_rls`, `explicit_workspace_context`, `employee_hub`, `onboarding_composite_tenant_constraints` and `tenant_owned_composite_foreign_keys` suites pass.
- Re-verified the global phone/coworker-sharing split: onboarding uses the global account phone as the confirmed phone, drawer contact details remain read-only to management roles, coworker sharing stays a separate employee-controlled visibility toggle, and schemas reject deferred SSN/preferred-name fields.
- Verification: focused EmployeeOnboardingPage/EmployeeDrawer tests pass 15 tests, shared tests pass 58 tests, and `employee_onboarding_rls` passes 71 DB tests.
- Closed the remaining V1 SSN API exposure by returning `410 Gone` from `/v1/me/onboarding/ssn`; the route no longer validates, rate-limits or calls an SSN service boundary. The unused web onboarding SSN data helper was removed.
- Removed the orphan API SSN encryption/KMS runtime dependency, so employee onboarding no longer requires AWS KMS configuration while SSN is deferred from V1.
- Verification: focused API app test passes 77 tests, API typecheck passes, and Web typecheck passes after disabling the SSN onboarding endpoint and removing the runtime KMS dependency.
- Re-verified employee onboarding activation as server-derived: DB submit/review paths perform the membership/case transition atomically, pending submitters cannot activate themselves, and the frontend only reacts by clearing tenant queries and refreshing workspace context.
- Verification: `employee_onboarding_rls` passes 71 DB tests and focused EmployeeOnboardingPage tests pass 7 tests for the activation refresh path.
- Re-verified V1 legal-name ownership: global account profile keeps only account display metadata, while legal first/last name remains tied to the organization-scoped employee/private profile; provisional employer names prefill onboarding, employee changes require owner/admin review, and manager approval is denied.
- Verification: `employee_onboarding_rls` covers provisional legal-name prefill, review gating and approval publication; focused EmployeeOnboardingPage tests cover the prefill/correction UI.
- Re-verified invitation dispatch and delivery separation: owner onboarding stores invite-after-Finish intent rows that are not dispatchable before completion, exposes queued intents once after completion, records dispatched/failed results separately, and employee records remain present for revoke/reissue or retry flows.
- Verification: `workspace_rls` covers owner onboarding invitation intent gating/dispatch recording; `employee_directory_rls` passes 98 DB tests covering delivery failure without revocation, revoke/reissue, duplicate-link rollback and expired invite non-linking.
- Re-verified manager scope as both location-scoped and target-role scoped: managers see/edit only eligible employee-class or unlinked employee records in assigned locations, cannot open linked manager/admin/owner targets and cannot move employees into out-of-scope locations.
- Verification: `employee_directory_rls` passes 98 DB tests covering manager list filtering, drawer denial, peer/upper-role edit denial and scoped location write denial.
- Added same-account cross-organization notification bleed proof. A user with memberships in two organizations can read each notification only in that organization, cannot mutate the second organization's inbox item through the first organization context, and the second organization's unread count does not inflate the first organization's count.
- Verification: `communication_operations` passes 42 DB tests after the same-account cross-org notification negative cases.
- Added API route proof that owner onboarding invitation-intent writes fail closed when the resolved workspace context does not match the path workspace.
- Verification: focused account workspace route tests pass 19 tests and API typecheck passes.
- Added shared account workspace projection proof for closure-scheduled rows, deleted-row rejection and pending ownership transfer metadata.
- Verification: focused shared package tests pass 59 tests and shared typecheck passes.
- Added API auth helper proof that permission, any-permission and membership-only authorization paths all reject a resolver response for a different workspace.
- Verification: focused `workspace-context` API test passes 6 tests and API typecheck passes.
- Tightened organization switcher accessibility so each open/status action has an organization-specific accessible name while keeping the visible button copy compact.
- Verification: focused `OrganizationSwitcherPage` and `AppShellNotificationBadge` web tests pass 11 tests and web typecheck passes.
- Tightened account Workspaces accessibility so open/closure/transfer row actions have organization-specific accessible names and destructive transfer/closure panels expose named regions.
- Verification: focused `WorkspacesPage` web test passes 7 tests and web typecheck passes.
- Tightened owner onboarding progress accessibility by exposing the four-step wizard indicator as a semantic progressbar.
- Verification: focused `OwnerOnboardingPage` web test passes 10 tests and web typecheck passes.
- Added backend route proof that employee-class accounts are denied before the management employee directory service is called.
- Verification: focused `employee-directory-routes` API test passes 6 tests and API typecheck passes.
- Audited the checked P0 acceptance criteria against the verification ledger; each checked P0 item has DB, API or shared contract proof, not frontend-only evidence. The global cross-organization leak matrix and Schedule conflict add/edit preservation remain open.
- Added DB proof that the same account cannot see public audit event rows or counts for a workspace where the account is only an employee.
- Verification: focused `workspace_rls` DB test passes 107 tests.
- Added DB proof that the same account can have separate Employee Hub availability version streams in two workspaces without inheriting restrictions across organizations.
- Verification: focused `employee_hub` DB test passes 26 tests.
- Added DB proof that internal workspace entitlement rows and billing counts are visible only through owner/admin-manageable workspaces, not employee-scope memberships on the same account.
- Verification: focused `workspace_rls` DB test passes 109 tests.
- Re-verified deleted-workspace scheduled export protection: service revalidation rejects deleted workspaces and cron skips delivery/rendering when revalidation fails at execution time.
- Verification: focused `schedule-service` and `schedule-export-cron` API tests pass 15 tests and API typecheck passes.
- Added API-side workspace retention executor proof: `/internal/cron/workspace-retention` requires the cron secret, invokes the retention worker, and the worker forwards due jobs to `mark_workspace_retention_purge_completed_service` with executor metadata while preserving idempotent and failed job counts.
- Verification: focused `workspace-retention-worker` and `app` API tests pass 78 tests; API typecheck passes; focused `workspace_rls` DB test still passes 109 tests.
- Added direct DB proof that immediate deletion is not user/support recoverable through ordinary lifecycle RPCs: deleted workspaces cannot cancel closure, cannot re-enter the closure lifecycle and do not appear in the account workspace projection.
- Verification: focused `workspace_rls` DB test passes 112 tests.
- Added shared schema proof for account-context mismatch rejection and partial pending ownership-transfer projection suppression.
- Verification: shared package tests pass 60 tests and shared typecheck passes.
- Added DB proof that a same-account user who is manager in one tenant but employee in another tenant cannot read the manager Schedule read-model for the employee-scope tenant.
- Verification: focused `schedule_read_model_rls` DB test passes 16 tests.
- Regression verification: clean local `supabase db reset --local`; focused DB suites `workspace_rls`, `employee_hub` and `communication_operations` pass 177 tests; focused API suites pass 46 tests; shared tests pass 60 tests; focused web shell/onboarding/account suites pass 28 tests; API, web and shared typechecks pass.
- Browser smoke update: existing local dev stack on web `5555` and API `5556` serves `/health`, `/v1/context` and the app shell. Owner development identity lands on `/app/workspace` with management navigation and setup checklist; employee development identity lands on `/app/employee-hub` with only Employee Hub, Shift Hub, My Availability, Announcements and Notifications visible; manager development identity lands on `/app/workspace` with management navigation. Browser console errors: none observed.
- Full DB verification found and repaired two rollout regressions: the later employee drawer write guard had overwritten stale employee-code counter resync, and the public SECURITY DEFINER execute surface had reopened through later migrations. The repair migration restores generated employee-code recovery, registers document-expiry notification production in reconciliation, and revokes direct execute from anon/public/authenticated roles.
- Verification: full `supabase test db` passes 38 files and 1066 DB tests after the repair batch.
- Added API recent-session guards for immediate organization closure and ownership-transfer initiate/respond routes. Scheduled closure remains available without this guard because it is cancellable before the effective date.
- Verification: focused `workspace-account-routes` API test passes 24 tests, full API suite passes 245 tests, and API typecheck passes after the reauth guard. Stale, malformed and future-issued tokens are denied before irreversible actions reach the service boundary; development bearer reauth bypass is denied when `NODE_ENV=production`.
- Added a development-only invitation mailbox so local E2E can retrieve owner-onboarding and employee-drawer invitation links without changing production invitation responses. The mailbox is not registered when `NODE_ENV=production`, requires a development owner/admin/manager bearer token, and returns masked email metadata without employee names or full email addresses. Route coverage proves both direct employee invitation preparation and owner-onboarding Finish dispatch capture links in the mailbox.
- Verification: focused `app.test.ts` passes 80 tests, full API suite passes 29 files and 248 tests, and API typecheck passes after the development invitation mailbox guard.
- Runtime smoke: local API `/v1/development/invitations` returns `401` without a development bearer token and `[]` with `Bearer development-owner-token` before any local invitation is prepared.
- Added a normal `/sign-in` business-account creation entry point so potential customers without active invitations can create an account, flow through pending-invitation/no-organization routing, and reach the business organization creation path instead of dead-ending. Invite-link visitors still default to employee account creation.
- Verification: focused `SignInPage` web test passes 2 tests, full web suite passes 157 files and 762 tests, and web typecheck passes after the sign-up entry point change.
- Added Workspaces UI password reauthentication before immediate organization closure and ownership-transfer initiate/respond actions. The sensitive action only proceeds after Supabase returns a fresh email/password session, so the subsequent API request carries a recently issued token.
- Verification: focused `WorkspacesPage` web test passes 9 tests, full web suite passes 760 tests, and web typecheck passes after the reauth UX. The focused test also proves a failed reauthentication does not call immediate organization closure and proves reject transfer uses the same password-reauthenticated response path.
- Browser smoke update: local Workspaces page renders owner-only destructive actions; immediate close exposes organization-name confirmation, account password and acknowledgement before enabling submit; ownership transfer exposes target admin id, account password and irreversible acknowledgement before enabling submit.
- Hardened shared account workspace projection so malformed rows cannot mark invited, pending-activation or suspended memberships as active switcher targets.
- Hardened shared account workspace projection so malformed invited, pending-activation or suspended memberships cannot carry pending ownership-transfer metadata into switcher/status surfaces.
- Tightened destructive Workspaces action accessibility so ownership transfer, closure and transfer-response regions are programmatically described by their irreversible/billing/reauthentication impact copy.
- Verification: focused `WorkspacesPage` web test passes 10 tests, full web suite passes 157 files and 764 tests, and web typecheck passes after the `aria-describedby` wiring.
- Enforced destructive acknowledgement at the API boundary so workspace closure and account deletion requests with `acknowledged: false` are rejected before service calls.
- Verification: focused `workspace-account-routes` API test passes 26 tests, full API suite passes 29 files and 257 tests, and API typecheck passes after the acknowledgement guard.
- Tightened Profile account deletion accessibility so the destructive panel is a named region described by the 14-day restore/no-active-organization impact copy.
- Verification: focused `ProfilePage` web test passes 2 tests, full web suite passes 157 files and 764 tests, and web typecheck passes after the account deletion region wiring.
- Added AuthContext stale-cache regression proof: when a real signed-in session loses workspace context, tenant-scoped React Query entries are removed while account-level cache remains available.
- Verification: focused `AuthContext` web test passes 5 tests, full web suite passes 157 files and 765 tests, and web typecheck passes after the stale-cache regression.
- Extended tenant cache eviction to cover settings/admin query prefixes: document types, organization jobs, locations, important dates, kiosk management, notification settings, shift labels, shift types, signature settings and owner setup checklist.
- Verification: focused `tenant-query-cache` and `AuthContext` web tests pass 7 tests, full web suite passes 157 files and 765 tests, and web typecheck passes after the query-prefix inventory fix.
- Added communication route mismatch proof: announcements, notifications and Workspace Todo endpoints return generic `Workspace not found` and do not call the service when the resolved context belongs to another workspace.
- Verification: focused `communication-routes` API test passes, full API suite passes 30 files and 258 tests, and API typecheck passes after the communication route guard coverage.
- Verification: focused shared `index.test.ts` passes 45 tests, shared typecheck passes, and focused Workspaces/Switcher web tests pass 11 tests after the fail-closed projection hardening.
- Regression verification: full `@newfork/api` suite passes 29 files and 248 tests, full `@newfork/web` suite passes 157 files and 762 tests, full `@newfork/shared` suite passes 4 files and 60 tests, and `git diff --check` reports no whitespace errors beyond existing CRLF warnings.

**Verification Ledger 2026-09-06:**

Local proof completed:

- Local Supabase reset applies all migrations and seed data cleanly on the current checkout.
- DB proof covers workspace switching/defaults, pending/suspended safe surfaces, owner onboarding completion idempotency, invitation intent dispatch separation, owner invariant, ownership transfer races, employee onboarding activation, employee drawer role/location scope, private storage closure denial, immediate deletion non-recovery, composite tenant FKs, public audit isolation, workspace-scoped availability, internal entitlement isolation, notification/todo tenant scoping and same-account cross-org notification counts.
- API proof covers workspace context mismatch, account closure/transfer/deletion routes, owner onboarding route guards, invitation dispatch failure separation and cron-secret-gated retention execution.
- Web proof covers route/shell permission guards, organization switcher pending/suspended cards, employee-only navigation, owner setup checklist, generic business sign-up entry, employee onboarding V1 fields and SSN route removal.
- Browser smoke proof is local-only: current owner login, switcher, role-scoped management shell, employee-only shell, employee organization landing, pending status page and suspended status page.

Cross-organization leak coverage:

| Signal | Current local proof | Remaining gap |
| --- | --- | --- |
| Tenant context/default switch | DB, API and browser smoke cover default/switcher/pending/suspended behavior. | Hosted parity. |
| Employee directory and private profile | DB and API cover role/location scope and employee-role management denial. | Full browser walkthrough. |
| Documents and private storage | DB covers authorized path resolution and denial after closure. | Schedule conflict review drawer browser flow. |
| Notifications and Todos | DB/API cover tenant-owned notification/todo reads, mutation guards and unread-count isolation. | Provider delivery/bounce behavior. |
| Availability | DB covers separate same-account availability version streams per workspace. | Schedule conflict UI no-touch boundary. |
| Audit events | DB covers restricted security audit privacy and public audit employee-scope invisibility. | Hosted log/audit retention ops. |
| Billing/trial | DB covers internal entitlement owner/admin visibility and employee-scope non-leak. | Real billing provider integration is Phase 10/future scope. |
| Schedule data/conflicts | API/DB cover export revalidation, private-storage closure denial, same-account read-model role isolation and preview classification. | Add/edit conflict UI and mutation enforcement remain explicitly open. |
| Retention purge | DB covers service-only purge jobs and idempotent tombstones; API covers cron-secret-gated due-job execution. | Destructive physical cascade deletion map and hosted ops runbook. |

Hosted/release proof not yet completed:

- Hosted Supabase/Vercel deployment verification, production env parity and release-readiness proof remain separate from local proof.
- Real email delivery, bounce processing and provider webhook behavior remain outside current local tests.
- Real billing provider, payment method detachment and hosted invoice history remain Phase 10/future billing scope.

Deferred or intentionally open:

- Schedule conflict UI/enforcement: owner/admin/manager conflict preview exists at DB level, but Schedule add/edit UI is explicitly no-touch until the user approves that surface.
- External auth-provider reauth variants: V1 email/password reauth is implemented for irreversible ownership/deletion actions; OAuth/MFA-specific reauth UX remains a future provider integration decision.
- Physical retention purge scheduling: service-only job/tombstone contract and API cron worker exist; external scheduler/ops wiring remains deferred.
- Location address true-nullable storage: not used in V1. Owner onboarding Step 2 now treats address details as optional empty-string fields while keeping location name, country and timezone required.
- SSN, payroll, tax and I-9: fully deferred from V1.
- Bulk employee import: future feature; V1 keeps manual employee entry/invite flows.
- Full browser smoke owner signup -> Finish -> invite -> accept -> employee onboarding -> activation is complete locally through employee-only `/app/employee-hub`.
- Accessibility/keyboard audit is locally covered for the switcher, shell nav, onboarding wizard, destructive closure dialogs and Employee drawer document-review controls; the Schedule draft-preserving document-conflict browser flow remains separately open under the Schedule no-touch boundary.

**Blocked/Deferred Audit 2026-09-06:**

- Location address nullable is resolved for V1: no true nullable DB type change; empty address details are allowed so Step 2 can stay short without broad location type churn.
- Schedule conflict UI and mutation enforcement remain blocked by the explicit Schedule add/edit no-touch boundary.
- Document conflict review browser smoke remains blocked by the same Schedule no-touch boundary because the proof must preserve an active Schedule draft while opening the Employee drawer.
- Full owner-signup-to-employee-activation browser smoke is now complete locally through activated employee `/app/employee-hub`; hosted/release smoke remains separate.
- Added API regression proof that explicit workspace context loads scoped membership location IDs through the service client, matching the service-role grant required for activated employee/manager workspace context projection; the same test file now proves scope resolution errors do not widen access. Focused `workspace-context` test passes 8 tests.
- Verification: full `@newfork/api` suite passes 29 files / 251 tests, and API typecheck passes after the scoped-location resolver regression.
- Collapsed `membership_location_scopes` RLS policy shape so authenticated SELECT now has one permissive policy while admin INSERT/UPDATE/DELETE behavior remains covered by separate policies; focused `explicit_workspace_context` pgtap passes 8 tests, full DB suite passes 38 files / 1069 tests and local `supabase db advisors --local --type all --level warn` reports no issues.
- Added shared schema regression coverage for stale all-location scope trimming, malformed active/account workspace rows and employee onboarding action-path allowlisting; focused shared `index.test.ts` passes 50 tests, full shared suite passes 4 files / 65 tests and shared typecheck passes.
- Added API regression coverage that malformed explicit `X-Newfork-Workspace-Id` headers are rejected before tenant resolution; focused `app.test.ts` passes 81 tests, full API suite passes 29 files / 253 tests and API typecheck passes.
- Hardened `/v1/context` to validate the resolved context against the shared runtime schema before exposing it; malformed resolved contexts now return `Invalid session or membership`. Focused `app.test.ts` passes 82 tests, full API suite passes 29 files / 253 tests and API typecheck passes.
- Added organization switcher accessibility semantics with a named organization list, list items and `aria-busy` on the page region; focused `OrganizationSwitcherPage` test passes 4 tests, full web suite passes 157 files / 764 tests and web typecheck passes.
- Added resolver-level cross-account row rejection coverage: explicit mismatches record restricted security audit, default mismatches return null without explicit-context audit. Focused `workspace-context` test passes 10 tests, full API suite passes 29 files / 255 tests and API typecheck passes.
- Real billing-provider payment-method detachment remains future billing-provider scope; V1 records the internal detach-required contract and locks internal billing-owner mutations during pending transfer.
- Added communication action URL hardening so announcement input, announcement projections, notification projections and Workspace Todo projections all share the same app-local `/app` URL contract. Unsafe RPC projection links are rejected at the shared/API service boundary before UI consumption.
- Added web data-boundary proof that unsafe announcement and notification action URLs returned by the API are rejected by `communications-data` before page components can render or navigate them.
- Verification: focused shared `index.test.ts` passes 52 tests, full shared suite passes 4 files / 67 tests, focused `communication-service` API test passes 7 tests, full API suite passes 30 files / 260 tests, focused `communications-data` web test passes 2 tests, and API/shared/web typechecks pass after the communication action URL hardening.
- Expanded communication route mismatch coverage across announcement save/publish/cancel, notification action, workspace dashboard/layout, todo create/resolve and setup-checklist read/write paths. Each route returns generic `Workspace not found` and avoids calling its service method when the resolved active context belongs to another workspace.
- Verification: focused `communication-routes` API test passes and API typecheck passes after the route mismatch matrix expansion.
- Added a frontend `safeAppActionUrl` helper and wired notification, announcement and Workspace dashboard preview links to the same `/app`-only navigation rule, preventing app-prefix lookalikes from becoming component-level links even if a mocked or unchecked payload reaches a page.
- Verification: focused `action-url`, `communications-data`, `CommunicationPages` and `WorkspacePage` web tests pass 16 tests, full web suite passes 159 files / 769 tests, and web typecheck passes after the frontend action-link guard alignment.
- Expanded notification settings route mismatch coverage across organization policy read/write/reset/test and personal preference read/write paths. Each route returns generic `Workspace not found` and avoids calling its service method when the resolved active context belongs to another workspace.
- Verification: focused `notification-settings-routes` API test passes 9 tests and API typecheck passes after the notification settings mismatch matrix expansion.
- Expanded organization settings, roles, document types and signature settings route mismatch coverage across scheduling settings read/write, ordering, role create/update/delete, document type create/update/archive/reorder and signature retention/template save/approve/publish/archive paths. Each route returns generic `Workspace not found` and avoids calling its service method when the resolved active context belongs to another workspace.
- Verification: focused settings route API suites pass 5 files / 28 tests, full API suite passes 30 files / 260 tests, and API typecheck passes after the settings mismatch matrix expansion.
- Added employee hub route mismatch coverage across hub read, availability save, time-off submit, shift request submit, request action, own time-tracking read, time capture and own correction request paths. Each route returns generic `Workspace not found` and avoids calling its service method when the resolved active context belongs to another workspace.
- Verification: focused `employee-hub-routes` API test passes, full API suite passes 31 files / 261 tests, and API typecheck passes after the Employee Hub mismatch matrix expansion.
- Added manager time entries route mismatch coverage across time read, manual entry, amendment, correction decision and review-window approval paths. Each route returns generic `Workspace not found` and avoids calling its service method when the resolved active context belongs to another workspace.
- Verification: focused `time-entries-routes` API test passes, full API suite passes 32 files / 262 tests, and API typecheck passes after the Time Entries mismatch matrix expansion.
- Expanded kiosk manager route mismatch coverage across enrollment, management, label update, re-enrollment, revoke and PIN reset paths. Each route returns generic `Workspace not found` and avoids calling its service method when the resolved active context belongs to another workspace.
- Verification: focused `kiosk-routes` API test passes 11 tests, full API suite passes 32 files / 262 tests, and API typecheck passes after the Kiosk mismatch matrix expansion.
- Expanded employee directory route mismatch coverage across list, detail, create, update, role, archive and termination paths. Each route returns generic `Workspace not found` and avoids calling its service method when the resolved active context belongs to another workspace.
- Verification: focused `employee-directory-routes` API test passes 7 tests, full API suite passes 32 files / 262 tests and API typecheck passes after the employee directory mismatch matrix expansion.
- Tightened employee invitation prepare/revoke path-context mismatch tests so cross-workspace requests return generic `Workspace not found` and do not call the invitation service.
- Verification: focused `app.test.ts` passes 82 tests, full API suite passes 32 files / 262 tests and API typecheck passes after the invitation prepare/revoke service-boundary assertion.
- Fixed manager employee-onboarding review and document-download routes to return generic `Workspace not found` instead of permission-shaped errors when the resolved active workspace differs from the path workspace. The routes now avoid calling review or storage URL services on path/context mismatch.
- Verification: focused `app.test.ts` passes 83 tests, full API suite passes 32 files / 263 tests and API typecheck passes after the manager onboarding review/download mismatch guard fix.
- Added owner-onboarding completion mismatch coverage so a path/context mismatch prevents save, invitation-intent listing, invitation dispatch and dispatch marking even when the request sets `complete: true`.
- Verification: focused `workspace-account-routes` API test passes 27 tests, full API suite passes 32 files / 264 tests and API typecheck passes after the owner-onboarding completion dispatch mismatch coverage.
- Hardened employee onboarding `first_actionable_path` schema from broad `startsWith` checks to exact root/subpath/query/hash allowlisting for `/welcome` and `/app/employee-hub`, rejecting root lookalikes.
- Verification: focused shared `index.test.ts` passes 52 tests, full shared suite passes 4 files / 67 tests, and shared/API/web typechecks pass after the employee onboarding action-path hardening.
- Hardened notification settings catalog `action_route` from broad `/app` prefix matching to the shared app-local action URL schema, rejecting external URLs, protocol-relative URLs and `/application` lookalikes.
- Verification: focused `notification-settings.test.ts` passes 6 tests, full shared suite passes 4 files / 68 tests, and shared/API/web typechecks pass after the notification settings action-route hardening.
- Hardened sign-in destination handling so invite account-creation mode only triggers for the exact `/invite/accept` route and external/protocol-relative sign-in destinations fall back to `/app`.
- Verification: focused `SignInPage` web test passes 4 tests, full web suite passes 159 files / 771 tests, and web typecheck passes after the sign-in destination hardening.
- Hardened Line-up and Schedule Requests v1 routes so a resolved active workspace that differs from the path workspace returns generic `Workspace not found` and does not call schedule-adjacent services.
- Verification: focused `app.test.ts` passes 85 tests, full API suite passes 32 files / 266 tests and API typecheck passes after the Line-up/Schedule Requests route mismatch hardening.
- Relaxed owner onboarding location address details for V1: shared location schemas accept blank street/city/region/postal fields, the Step 2 Add location button only requires location name, country and timezone, and the DB constraint now accepts empty address details without changing RLS.
- Verification: focused shared `index.test.ts` passes 52 tests, full shared suite passes 4 files / 68 tests, focused `OwnerOnboardingPage` web test passes 11 tests, full web suite passes 159 files / 772 tests, full API suite passes 32 files / 266 tests, web/shared/API typechecks pass, full local pgTAP DB suite passes 38 files / 1070 tests and local Supabase advisors report no issues after the optional location address change.
- Added owner onboarding keyboard-path coverage by submitting the workspace identity form directly, proving the first wizard step is not mouse-click-only.
- Verification: focused `OwnerOnboardingPage` web test passes 12 tests and web typecheck passes after the keyboard-path coverage.
- Added AppShell navigation accessibility coverage proving an active Schedule child route exposes `aria-current="page"` on the child link while the parent Schedule link remains inactive.
- Verification: focused `AppShellNotificationBadge` web test passes 8 tests and web typecheck passes after the shell active-route accessibility coverage.
- Expanded shared account-workspace projection coverage so incomplete pending ownership transfer metadata is suppressed when any required transfer id, role or expiry field is missing.
- Verification: focused shared `index.test.ts` passes 52 tests and shared typecheck passes after the incomplete-transfer projection coverage.
- Revalidated account workspace route and service coverage, including owner onboarding save/reset/invitation/finish paths, closure, ownership transfer and account deletion service forwarding.
- Verification: focused `workspace-account-routes` and `workspace-account-service` API tests pass 36 tests.
- Checked the current repo for browser smoke infrastructure. Root/app/package scripts do not declare Playwright/e2e/smoke commands, and no `playwright.config` or `*.spec.ts(x)` files are present, so browser smoke items remain open until a browser verification harness or a manual runtime scenario is added.
- Added Employee drawer section accessibility state so the active document-review section exposes `aria-current="page"` in the rail.
- Verification: focused `EmployeeDrawer` web test passes 11 tests, web typecheck passes, and the combined accessibility/keyboard set for `OrganizationSwitcherPage`, `AppShellNotificationBadge`, `OwnerOnboardingPage`, `WorkspacesPage`, `ProfilePage` and `EmployeeDrawer` passes 47 tests.
- Added API regression coverage that communication write routes ignore spoofed actor/workspace fields in request bodies and pass the authorized context actor to announcement save, workspace layout save, manual todo create and owner setup checklist mutations.
- Verification: focused `communication-routes` API test passes 2 tests, API typecheck passes, and the full `@newfork/api` suite passes 32 files / 267 tests after the body-spoof coverage.
- Added API regression coverage that notification settings write routes ignore spoofed actor/workspace fields in request bodies and pass the authorized context actor to organization policy save/reset/test-preview and personal notification preference mutations.
- Verification: focused `notification-settings-routes` API test passes 10 tests and API typecheck passes after the notification settings body-spoof coverage.
- Expanded Kiosk manager-route provenance coverage so enrollment, PIN reset and device label mutations ignore spoofed actor/workspace/resource fields in request bodies and keep deriving actor/workspace/resources from auth context and path parameters.
- Verification: focused `kiosk-routes` API test passes 11 tests and API typecheck passes after the Kiosk body-spoof coverage.
- Added Employee Hub successful-write API regression coverage so availability, time-off, shift request, request-action and own time-tracking mutations ignore spoofed body actor/workspace/idempotency fields and derive actor/workspace/idempotency from auth context, URL path and headers.
- Verification: focused `employee-hub-routes` API test passes 2 tests, API typecheck passes, and the full `@newfork/api` suite passes 32 files / 269 tests after the Employee Hub body-spoof coverage.
- Added Time Entries successful-write API regression coverage so manual entry, amendment, correction decision and review-window approval mutations ignore spoofed body actor/workspace/path resource/idempotency fields and derive actor/workspace/resources/idempotency from auth context, URL path and headers.
- Verification: focused `time-entries-routes` API test passes 2 tests, API typecheck passes, and the full `@newfork/api` suite passes 32 files / 270 tests after the Time Entries body-spoof coverage.
- Added Settings successful-write API regression coverage so scheduling settings, organization entity reorder, shift type reorder, shift label reorder, role save/update/delete and document type save/archive/reorder ignore spoofed body actor/workspace/path resource fields.
- Verification: focused organization-settings, roles and document-types API route tests pass 18 tests, API typecheck passes, and the full `@newfork/api` suite passes 32 files / 273 tests after the Settings body-spoof coverage.
- Added Employee Directory successful-write API regression coverage so employee create/update, linked role update, archive and termination mutations ignore spoofed body actor/workspace/path employee fields and keep deriving actor/workspace/employee resources from auth context and URL path.
- Verification: focused `employee-directory-routes` API test passes 8 tests, API typecheck passes, and the full `@newfork/api` suite passes 32 files / 274 tests after the Employee Directory body-spoof coverage.
- Added manager Employee Onboarding review/download API regression coverage so review mutation bodies cannot spoof actor/workspace/employee identity and document download derives actor/workspace/employee/requirement identity from context and path.
- Verification: focused `app.test.ts` passes 86 tests, API typecheck passes, and the full `@newfork/api` suite passes 32 files / 275 tests after manager onboarding review/download provenance coverage.
- Added self Employee Onboarding API regression coverage so profile, availability, document upload/confirm, acknowledgement, submit, reset and leave mutations ignore spoofed body account/workspace/employee/requirement fields and derive identity from bearer token plus path parameters.
- Verification: focused `app.test.ts` passes 87 tests, API typecheck passes, and the full `@newfork/api` suite passes 32 files / 276 tests after self-onboarding provenance coverage.
- Expanded Invitation API regression coverage so prepare/revoke derive actor/workspace/employee from authorized context and URL path, token acceptance derives account identity from bearer token, and pending invitation accept/decline derive invitation identity from URL path instead of spoofable request bodies.
- Verification: focused `app.test.ts` passes 87 tests, API typecheck passes, and the full `@newfork/api` suite passes 32 files / 276 tests after invitation provenance coverage.
- Added Signature Settings successful-write API regression coverage so retention policy save/update/approve/archive and acknowledgement template save/update/publish/archive ignore spoofed body actor/workspace/path resource fields.
- Verification: focused `signature-settings-routes` API test passes 5 tests, API typecheck passes, and the full `@newfork/api` suite passes 32 files / 277 tests after signature settings provenance coverage.
- Added Account/Workspace lifecycle API regression coverage so active-workspace selection, scheduled-closure cancellation and account-deletion restore ignore spoofed body actor/workspace fields and derive identity/resources from bearer token plus URL path.
- Verification: focused `workspace-account-routes` API test passes 28 tests, API typecheck passes, and the full `@newfork/api` suite passes 32 files / 278 tests after account lifecycle provenance coverage.
- Re-ran full web and shared verification on the current checkout after the latest provenance coverage. The earlier isolated `PublishScheduleDialog` uncertainty did not reproduce in this run.
- Verification: full `@newfork/web` suite passes 159 files / 773 tests and full `@newfork/shared` suite passes 4 files / 68 tests.
- Expanded shared account-workspace projection coverage so invited, pending-activation and suspended memberships remain non-active switcher targets even when a `closure_scheduled` lifecycle signal is present, and they still suppress pending ownership-transfer metadata.
- Verification: focused shared `index.test.ts` passes 52 tests, shared typecheck passes, and the full `@newfork/shared` suite passes 4 files / 68 tests after the non-active lifecycle projection coverage.
- Verification: root `pnpm typecheck` passes across `@newfork/api`, `@newfork/web`, `@newfork/shared`, `@newfork/ui` and `@newfork/scheduling-shared` after the latest Phase 11 provenance and projection checks.
- Verification: root `pnpm test` passes through Turbo across `@newfork/api`, `@newfork/web`, `@newfork/shared`, `@newfork/ui` and `@newfork/scheduling-shared`; package outputs include API 32 files / 278 tests, web 159 files / 773 tests, shared 4 files / 68 tests, scheduling-shared 4 files / 68 tests and UI 1 file / 1 test.
- Verification: direct non-cached package checks also pass for `@newfork/scheduling-shared` (4 files / 68 tests plus typecheck) and `@newfork/ui` (1 file / 1 test plus typecheck).
- Verification: full local Supabase pgTAP DB suite passes 38 files / 1075 tests with `supabase test db --local` on Supabase CLI 2.109.0 after the Schedule hard document enforcement slice.
- Verification: local Supabase advisors pass with no warn-level security or performance issues using `supabase db advisors --local --type all --level warn`.
- Verification: root `pnpm build` passes through Turbo for API, web, shared and UI packages; the web production Vite build completes successfully.
- Verification: root `pnpm lint` passes after a mechanical unused-binding cleanup in `apps/web/src/views/SchedulePage.tsx`; the Schedule editor setter flow remains unchanged. Focused Schedule regression also passes 7 files / 112 tests for App routing, ShiftQuickEditor, drawer machine, draft save flow, conflict notice/sheet and publish dialog coverage.
- Added DB hard-enforcement for expired blocking employee documents across Schedule edit-session assignment and publish paths without touching Schedule UI add/edit components.
- Verification: focused local pgTAP passes `schedule_edit_sessions.test.sql` and `schedule_publication.test.sql` together, 2 files / 60 tests.
- Added one-click/no-written-reason soft conflict handling for the existing Schedule quick editor and a service-role RPC audit wrapper for successful soft-conflict overrides.
- Verification: focused `ShiftQuickEditor` and `ScheduleConflictSheet` tests pass 2 files / 18 tests, focused Schedule regression passes 7 files / 112 tests, web typecheck passes, root lint passes, focused `schedule_edit_sessions.test.sql` passes 24 tests, full local Supabase pgTAP passes 38 files / 1077 tests, and local Supabase advisors report no warn-level issues after the soft-conflict audit slice.
- Added shared and web recovery parsing support for document-expiry schedule conflict payloads carrying `review_action`, `requirement_id`, `pending_document_id`, severity and overrideability, plus stable publish-conflict labels/keys for the future review-document UI action.
- Verification: focused web publish recovery/dialog tests pass 3 files / 75 tests, focused shared schema tests pass 52 tests, web and shared typecheck pass, and root lint passes after the document-conflict parser slice.
- Added the first document-review publish conflict affordance: document conflicts can render a `Review document` action, SchedulePage opens the existing Employee drawer on the Documents tab, and the Publish dialog keeps its conflict state while the drawer action fires.
- Verification: focused `PublishScheduleDialog` and `schedulePublishRecovery` tests pass 2 files / 18 tests after the review-document action; web/shared typecheck and root lint pass.
- Added scoped API-to-UI transport for hard document publish blockers: publish calls that hit `schedule has hard document blockers` now recover through a publish-scope overload of `list_schedule_draft_document_conflicts_service` and return web-consumable `schedule_conflicts` payloads without widening location/department scope.
- Verification: focused API `schedule-service` and `app` tests pass 2 files / 97 tests; focused web publish conflict tests pass 2 files / 18 tests; API/web typechecks pass; root lint passes; new local migration applies; focused `schedule_publication` pgTAP passes 41 tests; full local Supabase pgTAP passes 38 files / 1080 tests; local Supabase advisors report no warn-level issues.
- Added document-review recalculation wiring: Employee drawer reports document accept/reject success to SchedulePage, and PublishScheduleDialog re-runs the current publish preview scope when that signal changes so the user can continue from the same publish dialog after reviewing a pending document.
- Verification: focused web `EmployeeDrawer`, `PublishScheduleDialog` and `schedulePublishRecovery` tests pass 3 files / 29 tests; web typecheck and root lint pass after the recalculation wiring.
- Added hard-document-blocker negative API proof that recovery is not attempted without `week_start`, and that an empty scoped recovery preview does not publish, widen scope or broadcast a Schedule invalidation.
- Verification: focused API `schedule-service` test passes 1 file / 12 tests after the no-week-scope and empty-scoped-preview guards.
- Fixed the web onboarding review client to use the shared API request path, so local development bearer tokens and tab-scoped workspace headers are applied consistently when the Employee drawer loads manager review data.
- Fixed Schedule top-action dismissal so clicks inside the Employee drawer do not close an open publish dialog during document-conflict review.
- Verification: focused web `App`, `lib/supabase`, `EmployeeDrawer`, `PublishScheduleDialog` and `schedulePublishRecovery` tests pass 5 files / 91 tests; focused API `app` and `schedule-service` tests pass 2 files / 99 tests; root `pnpm typecheck` and `pnpm lint` pass.
- Browser proof: local in-app browser reproduced the hard document conflict, opened the drawer from `Review document`, displayed `Schedule certificate` as `Awaiting Review`, accepted it, preserved `Document hard conflict publish draft` and the Main Dining-only scope, cleared the conflict, and continued to Pre-flight.
- Full verification closeout: full `@newfork/web` suite passes 159 files / 776 tests; full `@newfork/api` suite passes 32 files / 281 tests; full `@newfork/shared` suite passes 4 files / 68 tests; root `pnpm typecheck` and `pnpm lint` pass.
- Database closeout: repaired the ownership-transfer entitlement trigger migration order so `supabase db reset --local` succeeds from a clean database; full local pgTAP passes 38 files / 1080 tests; `supabase db advisors --local --type all --level warn` reports no issues.
- Final root closeout: `pnpm test` passes all 7 Turbo test tasks across API, web, shared, scheduling-shared and UI; `pnpm build` passes all 4 Turbo build tasks with fresh API and web builds.

## P0 Acceptance Checklist

- [x] No cross-organization data, count, conflict, notification, audit, document, todo, availability, billing or schedule signal leaks.
- [x] Pending/suspended users never enter normal tenant app surfaces.
- [x] Employee users cannot see or directly open management navigation/pages.
- [x] Manager data and actions are location-scoped and target-role scoped.
- [x] Owner invariant cannot be bypassed by drawer edit, archive, suspend, revoke, account deletion, closure race or transfer race.
- [x] Owner onboarding Finish is atomic and idempotent.
- [x] Invitation dispatch occurs only after successful Finish.
- [x] Invitation delivery state never controls employee record existence.
- [x] Employee onboarding activation is server-derived.
- [x] Legal name is organization-scoped; no global canonical legal name in V1.
- [x] Global phone behavior and coworker sharing are separate.
- [x] SSN, payroll, tax, I-9 and home address are absent from V1.
- [x] Documents use private authorized access.
- [x] Schedule conflict extensions preserve current add/edit behavior. Focused Schedule add/edit/conflict regression passes, and the latest conflict-extension work is limited to hard DB enforcement, publish recovery transport, document-review affordance/repreview wiring and one-click soft-conflict acknowledgement.

## Recommended Execution Order

1. Phase 0 addendum and blocker decisions.
2. Phase 2 app shell placeholders and role-scoped routes, because it gives a visible skeleton with low product risk.
3. Phase 1 tenant/security foundation, before any sensitive workflow writes more state.
4. Phase 3 signup/invite intent.
5. Phase 4 owner onboarding.
6. Phase 5 checklist shell.
7. Phase 6 employee onboarding.
8. Phase 7 roles/lifecycle.
9. Phase 8 documents/todo/conflicts.
10. Phase 9 ownership/closure/account deletion.
11. Phase 10 billing spec.
12. Phase 11 verification closeout.

This order intentionally allows an early app-shell skeleton while still forcing security contracts before complex workflows.

## First Implementation Slice Proposal

**Objective:** App shell mantığını oturtmak, ama product workflow'u tamamlamaya kalkmamak.

**Scope:**

- Add route-level placeholders for role-scoped employee and management homes.
- Add deterministic route destination tests.
- Add sidebar visibility tests for employee vs manager/admin/owner.
- Add placeholder organization switcher route after the Phase 0 route decision selects that path.
- Do not alter Schedule add/edit internals.
- Do not alter billing or onboarding transaction code.

**Files likely touched:**

- `apps/web/src/App.tsx`
- `apps/web/src/auth/routeDestinations.ts`
- `apps/web/src/auth/routeDestinations.test.ts`
- `apps/web/src/auth/PermissionRoute.tsx`
- `apps/web/src/shell/AppShell.tsx`
- `apps/web/src/shell/AppShell*.test.tsx`
- `apps/web/src/views/EmployeeHubPage.tsx` or new focused placeholder children.

**User decision before this slice:**

- Use separate `/organization-switcher` for app-entry selection, or keep `/account/workspaces` as the temporary switcher?

## Deferred Register

- Full billing provider integration.
- Payroll, tax, I-9 and SSN.
- Bulk employee import.
- SMS verification and phone-based recovery.
- Custom role UI and hierarchy builder.
- Full Todo comments/recurrence/filtering UX.
- Final employee landing product design beyond minimum route.
- Final organization switcher visual placement if not approved in Phase 0.

