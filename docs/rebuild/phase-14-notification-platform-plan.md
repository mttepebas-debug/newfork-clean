# Phase 14 Notification Platform — Implementation Plan

**Created:** 2026-09-02
**Input:** Phase 14 audit/research and draft specification
**Plan status:** In progress; Plans 14-00 through 14-06 implemented locally
**Cost architecture:** approved — no mandatory paid notification-orchestration dependency
**Strategy:** repair current correctness first, build a provider-independent in-app vertical slice, then connect the existing Resend capability through an adapter

## Outcome

Deliver an enterprise-grade notification foundation without extending the current synchronous producer-specific pattern. The plan preserves the existing inbox while incrementally replacing producers with versioned outbox events and an auditable resolver.

## Locked dependency policy

- Newfork owns the catalog, audience rules, policy resolver, outbox, inbox, delivery ledger, retry/DLQ, audit, retention, and worker runtime.
- No baseline code path imports or requires Knock, Novu, Courier, OneSignal, or another notification-orchestration SaaS.
- In-app delivery is the minimum reliable product and works without external provider credentials.
- `NotificationChannelAdapter` is the only boundary through which external providers enter the system.
- The first email adapter may reuse the existing Resend integration. Missing Resend configuration disables email safely and does not block event capture or in-app delivery.
- CI and local development use fake adapters and must pass without paid accounts or network access.
- Push is a later adapter. SMS, Slack, Teams, WhatsApp, and other paid/licensed channels remain blocked behind a separate approval.

## Cost gates

| Gate                            | Default                              | Approval required to change                                      |
| ------------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| Notification orchestration SaaS | Disabled/not installed               | Product + architecture + security + annual TCO review            |
| In-app notifications            | Enabled on existing stack            | No new vendor budget                                             |
| Email                           | Disabled when Resend is unconfigured | Existing credential plus usage-budget approval for production    |
| Push                            | Deferred                             | Mobile/web product approval; FCM/APNs adapter review             |
| SMS                             | Out of scope                         | Consent/legal review plus per-message budget                     |
| Slack/Teams                     | Out of scope                         | Enterprise integration demand plus licensing/security review     |
| Provider migration              | Adapter-controlled                   | Parity, replay, idempotency, data residency, and exit-plan proof |

## Wave map

| Wave | Plans        | Dependency | Outcome                                                              |
| ---- | ------------ | ---------- | -------------------------------------------------------------------- |
| 0    | 14-00        | None       | Close current schedule publish authorization/atomicity release risks |
| 1    | 14-01, 14-02 | Wave 0     | Lock catalog/policy contracts and create durable core schema         |
| 2    | 14-03, 14-04 | Wave 1     | Outbox relay, resolver, inbox projection, and migrated producers     |
| 3    | 14-05, 14-06 | Wave 2     | Organization and user settings plus inbox/sidebar hardening          |
| 4    | 14-07, 14-08 | Wave 2     | Optional Resend adapter and operations/observability                 |
| 5    | 14-09        | Waves 3–4  | Push/endpoints, quiet hours, digest, escalation, enterprise adapters |
| 6    | 14-10        | All        | Security, load, hosted migration, browser, and release proof         |

## Implementation evidence — 2026-09-02

| Plan  | Local status | Evidence boundary                                                                                                   |
| ----- | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| 14-00 | Implemented  | Actor-bound final migration; API/UI false-failure contract; focused SQL and application tests green                 |
| 14-01 | Implemented  | Eight-type catalog, accepted precedence ADR, producer inventory, SQL seed parity, dependency guard                  |
| 14-02 | Implemented  | Core schema applied forward locally; 35/35 core pgTAP and 100/100 focused DB tests green; public-schema lint clean  |
| 14-03 | Implemented  | Atomic Schedule outbox slice; lease/heartbeat/crash recovery; idempotent event, policy, recipient, and inbox stages |
| 14-04 | Implemented  | Full fail-closed resolver; durable allow/deny snapshots; all eight current types and producers on `outbox_v1`       |
| 14-05 | Implemented  | Organization settings UI/API/RPC; read/write split; scoped/versioned audit; safe preview; 103 notification pgTAP   |
| 14-06 | Implemented  | User preferences UI/API/RPC; own-member access; compound inbox cursor bridge; safe links; sidebar realtime/storage convergence |

The full local database reset, linked migration push, authenticated hosted smoke,
load benchmark, and hosted browser/visual verification remain release gates. No
linked project was changed by the 14-00 through 14-06 implementation.

## Plan 14-00 — P0 schedule notification correctness

**Files to read first**

- `supabase/migrations/20260901150346_fix_schedule_publish_notification_permission.sql`
- `supabase/migrations/20260907113000_schedule_publish_notifications.sql`
- `apps/api/src/schedule/schedule-service.ts`
- `apps/api/src/schedule/schedule-routes.ts`
- `apps/api/src/schedule/schedule-department-scoped-publish-migration.test.ts`
- `apps/api/src/schedule/schedule-service.test.ts`

**Actions**

1. Add a forward migration with a timestamp strictly after `20260907113000` that restores explicit `actor_user_id`/workspace/publication/location validation and preserves `service_role`-only execution.
2. Add a final-migration-state test that asserts the final function body calls `schedule_actor_can_publish_service` and does not authorize with unbound `auth.uid()` state.
3. Add service-role execution tests for owner/admin/scoped-manager success and null/spoofed/cross-tenant/out-of-location rejection.
4. Stop throwing “publish failed” after a successful durable publish. As an interim patch, return publication success with a structured notification warning; the Wave 2 outbox removes the split permanently.
5. Add an API test for “publish committed, notification enqueue unavailable” so the response cannot imply rollback.

**Acceptance**

- Final migrated function is actor-bound and service-role executable.
- Cross-tenant and scoped-location negative tests pass.
- A post-publish notification failure cannot cause a false failed-publication contract.
- Existing Schedule tests remain green.

## Plan 14-01 — Catalog, precedence ADR, and event inventory

**Files to read first**

- `packages/shared/src/communications.ts`
- `supabase/migrations/20260823100000_communication_operations.sql`
- `docs/rebuild/phase-14-notification-platform-spec.md`
- Reference only: `C:\Users\TheWe\newfork\packages\shared\src\notifications\catalog.ts`
- Reference only: `C:\Users\TheWe\newfork\apps\api\src\features\notifications\producer-wiring.test.ts`

**Actions**

1. Add a shared `notificationCatalog` with the exact fields defined by R3 and eight event classes.
2. Create a catalog ADR that locks precedence, mandatory-in-app boundaries, commercial-message exclusion, and Action Center separation.
3. Inventory all current producers and map each to a stable `type_key`, schema version, audience contract, deep-link contract, sensitivity, retention class, and dedupe strategy.
4. Mark types `defined` until producer, template, route, and tests exist; only `active` types appear in organization/user settings.
5. Add CI tests for unique keys, allowed action routes, catalog/seed parity, and active producer/template coverage.
6. Add a dependency guard test that fails if a notification-orchestration SaaS SDK is imported into the baseline runtime without an approved ADR.

**Acceptance**

- Every current producer appears in the inventory.
- No duplicate type keys or undefined categories/channels exist.
- CI fails on an active type without producer, template, or safe action route.
- Core notification packages contain no mandatory orchestration SaaS SDK dependency.
- Product approval checklist decisions are either approved or explicitly recorded as assumptions.

## Plan 14-02 — Core schema, tenancy, and immutable history

**Files to read first**

- `supabase/migrations/20260823100000_communication_operations.sql`
- `supabase/tests/communication_operations.test.sql`
- `packages/shared/src/communications.ts`
- Existing role/permission migrations and tests.

**Actions**

1. Add `notification_outbox`, `notification_events`, `notification_recipients`, `notification_inbox_items`, `notification_org_policies`, `notification_user_preferences`, `notification_endpoints`, `notification_consents`, `notification_delivery_attempts`, `notification_template_versions`, and `notification_audit_log`.
2. Add tenant-scoped foreign keys, partial indexes for inbox/unread/worker leases, and unique keys from the spec.
3. Add distinct read/write/test/audit/replay permissions and default role grants.
4. Revoke direct browser writes to platform tables; expose own-user and admin operations through security-definer RPCs or the API service layer with actor binding.
5. Add compound cursor types and functions.
6. Define coexistence/backfill from current `notifications`; do not destructively migrate history until parity checks pass.

**Acceptance**

- pgTAP negative tests prove tenant, user, role, and location isolation.
- Duplicate idempotency keys are rejected deterministically.
- Compound cursor traversal has no gap/duplicate with identical timestamps.
- Old inbox reads continue during coexistence.
- Migration rollback/forward instructions are documented; linked push is not attempted until local reset/apply tests pass.

## Plan 14-03 — Transactional outbox and worker runtime

**Local implementation evidence — 2026-09-02:** complete for the Schedule
walking slice. Migrations `20260908112000` through `20260908115000` add atomic
enqueue, bounded `SKIP LOCKED` leasing, heartbeat/lease recovery, a versioned
in-app policy decision, idempotent v2 plus legacy-coexistence inbox projections,
and dead-letter handling. The API worker is exposed only through
`/internal/cron/notification-outbox` with the existing cron-secret boundary. No
provider call runs on the publish request path.

**Files to read first**

- `apps/api/src/schedule/schedule-service.ts`
- All current notification-producing SQL migrations from the event inventory.
- Existing job/cron patterns in `apps/api/src`.
- `apps/api/src/server.ts` and process ownership/deployment docs.

**Actions**

1. Add an outbox write helper callable inside domain RPC transactions.
2. Build a lease-based relay with `FOR UPDATE SKIP LOCKED`, bounded batch size, lease expiry, heartbeat, and crash recovery.
3. Separate audience expansion, preference resolution, inbox projection, and channel enqueue into idempotent stages.
4. Persist event, recipient, and decision snapshots before channel enqueue.
5. Add correlation IDs and structured, PII-minimized logs.
6. Migrate schedule publish first as the walking vertical slice.

**Acceptance**

- A successful schedule publish and its outbox event commit atomically.
- Worker crash/restart completes the event without duplicate inbox rows.
- Poison events stop after the configured bound and become operationally visible.
- API publish latency does not include provider calls.

## Plan 14-04 — Preference resolver and producer migration

**Local implementation evidence — 2026-09-02:** complete for every producer in
the current repository inventory. Migrations `20260908120000` through
`20260908126000` add the generic channel resolver, durable inclusion/exclusion
decisions, generic recipient/inbox projection, request/announcement/time-
correction outbox producers, producer registry, reconciliation, Schedule
compatibility, and announcement cancellation/supersession. All eight catalog types are active with published in-app
templates. Payroll and people remain catalog categories, but the current codebase
has no payroll-readiness or people/onboarding notification producer to migrate;
new events in those domains must enter through the registry/parity gate rather
than a direct inbox insert.

**Files to read first**

- Catalog and schema artifacts from Plans 14-01/14-02.
- Current request, announcement, time-correction, and schedule producers.
- Reference only: `C:\Users\TheWe\newfork\apps\api\src\features\notifications\notify.ts` and `recipients.ts`.

**Actions**

1. Implement `PreferenceResolver.resolve({workspaceId,userId,typeKey,channel,roleId,locationId,eventContext})` returning decision, cadence, and reason chain.
2. Implement role/location audience adapters per event type; snapshot inclusion/exclusion reasons.
3. Apply inactive, terminated, archived, membership, and location rules fail-closed.
4. Migrate announcements, schedule requests, time corrections, payroll readiness, and people/onboarding producers in small batches.
5. Add reconciliation that detects active catalog types with no producer and committed domain events with no outbox record where a deterministic check is possible.

**Acceptance**

- Table-driven precedence matrix passes.
- Multi-workspace and cross-location recipients never leak.
- Each migrated domain mutation produces exactly one event under retries.
- Old producer path is disabled only after per-domain parity proof.

## Plan 14-05 — Organization notification settings

**Files to read first**

- `apps/web/src/settings/SettingsLayout.tsx`
- `apps/web/src/App.tsx`
- Existing settings data modules and permission route patterns.
- `packages/shared/src/communications.ts`
- Reference only: `C:\Users\TheWe\newfork\apps\web\src\features\settings\NotificationSettingsPage.tsx`.

**Actions**

1. Add `/app/settings/notifications` and a left-rail item guarded separately by read and write permissions.
2. Add type/category/search filters and rows for enabled, allowed channels, defaults/cadence, roles/locations, and mandatory/locked state.
3. Display only `active` catalog types; show sensitivity, tier, channel capability, and policy source.
4. Implement optimistic writes with version conflict, rollback, accessible success/error announcements, reset by type/category/all, and audit history.
5. Add safe test-send with allow-listed recipients, rate limiting, and non-production redirect.

**Acceptance**

- Read-only users can view but not mutate.
- Write users can mutate only their workspace and authorized locations.
- Push/email cannot be enabled for unsupported types.
- Every policy change has actor, before/after version, time, and reason.
- Keyboard, screen-reader, loading, empty, error, conflict, and rollback tests pass.

**Local implementation status — 2026-09-02:** Implemented. The organization
settings route and left rail expose active catalog policy across organization,
role, and location scopes. API and service-role RPCs enforce independent read,
write, and test-send capabilities; scoped writes are actor-bound and
version-guarded; type/category/all resets and every policy mutation record an
audit reason plus before/after version. Safe test-send is deliberately
`preview_only`, redirects to the authenticated actor, and is durably limited to
five previews per minute. External delivery remains Plan 14-07.

**Customer-facing refinement — 2026-09-02:** Implemented without a schema
migration or paid vendor. The organization settings UI now presents active
notification types as business rules such as "Published schedules" and
"Time-off requests to review" instead of raw `type_key` strings. Category,
severity, channel, lock-reason, and audience copy are sourced from the shared
display layer while save/reset/test payloads continue to use stable catalog
keys for API/audit correctness. Browser smoke with the local owner development
identity verified `/app/settings/notifications` renders `Notification Rules`,
keeps the settings nav on a single active `Notifications` item, and does not
surface raw catalog keys in default body copy.

## Plan 14-06 — User preferences, inbox, and sidebar

**Files to read first**

- `apps/web/src/account/PreferencesPage.tsx`
- `apps/web/src/shell/AppShell.tsx`
- `apps/web/src/views/NotificationsPage.tsx`
- `apps/web/src/communications/communications-data.ts`
- `apps/web/src/views/CommunicationPages.test.tsx`
- Reference only: `C:\Users\TheWe\newfork\apps\web\src\features\notifications\NotificationBell.tsx` and `useNotificationPreferences.ts`.

**Actions**

1. Add `/account/preferences/notifications` with active-workspace context and multi-workspace selector.
2. Add category/type × channel preferences, cadence, timezone/quiet hours, and safe-preview controls.
3. Render organization-controlled choices disabled with the resolver reason; never silently discard a user change.
4. Add explicit patch semantics, optimistic cache composition, version conflict, and rollback.
5. Upgrade inbox to compound cursor, seen/read/dismiss, per-row mutation state, stable grouping, and safe deep-link validation.
6. Add realtime invalidation for badge/inbox with periodic reconciliation and cross-tab convergence.

**Acceptance**

- Rapid toggles persist the final intended state without stale overwrite.
- User cannot change another user/workspace or enable a denied channel.
- Timestamp-collision and cross-tab badge tests pass.
- Inbox/read states remain separate from delivery preferences.
- No role permission is required beyond active membership for own inbox/preferences if the product checklist approves that rule.

**Local implementation status — 2026-09-02:** Implemented. User notification
preferences now have an account route, dedicated API/data contracts, active
membership authorization, explicit batch patch semantics, duplicate-scope
validation, version conflict handling, organization lock reasons, and audit
records. The inbox bridge now uses opaque compound cursors, supports seen/read
state filters, protects action links to `/app`, and keeps the sidebar badge fresh
through Supabase realtime when available plus storage/custom-event convergence
and the existing poll reconciliation.

**Validation update — 2026-09-02:** Local API/Vite smoke returned 200 on
`/health`, `/account/preferences/notifications`, and `/app/notifications`.
Rendered browser QA on `http://127.0.0.1:5555` verified the account notification
preferences page, active workspace selector, eight catalog rows, organization
lock reasons, `/app/notifications` category filters, and Schedule filter
selection without console errors or framework overlay. A follow-up visual pass
tightened the user preference row layout into three columns with short visible
Save buttons while preserving accessible action names. Local DB pgTAP passed for
the Phase 14 notification package, `supabase db lint --local` found no schema
errors, and `@newfork/web` plus `@newfork/api` production builds passed. Linked
Supabase dry-run is non-mutating and reports pending Phase 14 migrations; remote
has not been changed.

**Customer-facing refinement — 2026-09-02:** Implemented without changing the
notification storage, cursor, or mutation contracts. A shared presentation layer
now maps active catalog categories/types/channels/severities/lock reasons to
customer-facing labels and descriptions. `/account/preferences/notifications`
groups controls by understandable work areas, shows disabled organization-locked
delivery channels with plain-language reasons, and hides raw `type_key` values
from default copy. `/app/notifications` now shows friendly category and severity
metadata such as "Announcements · Update" while retaining stable raw keys only
inside internal payloads and tests.

**Release-gate update — 2026-09-02:** Local package-level gates passed after
the customer-facing refinement. `@newfork/shared` notification/catalog tests and
typecheck passed; `@newfork/api` full test suite, typecheck, lint, standard
build, and Vercel bundle build passed; `@newfork/web` full Vitest suite passed
with 135 files and 632 tests, plus typecheck, lint, and production build. The
full web suite initially exposed load-sensitive timeouts in public trust and
the authenticated-shell App smoke; isolated reruns passed, and the tests now use
targeted longer waits for existing lazy route/auth-shell behavior without
changing production code.

## Plan 14-07 — Email transport and templates

**Files to read first**

- Existing Resend invitation integration in `apps/api/src/employees/invitation-service.ts`.
- Template/version schema from Plan 14-02.
- Provider environment and deployment configuration.
- Official SES/Resend delivery and webhook documentation selected at implementation time.

**Actions**

1. Define a provider-neutral `NotificationChannelAdapter` interface and a deterministic fake adapter for local/CI verification.
2. Implement a Resend adapter by extracting/reusing the existing invitation-delivery capability without making Resend imports or credentials part of the core event/inbox path.
3. Render versioned templates from semantic payloads with locale fallback and safe variable allow-lists.
4. Process accepted, delivered, bounce, complaint, and suppression feedback distinctly.
5. Retry only transient failures with bounded exponential backoff/jitter; route exhausted attempts to DLQ.
6. Add global/environment/tenant kill switches and non-production redirect.
7. Make provider credentials and webhook verification tenant-safe and secret-managed.
8. Make `EMAIL_NOTIFICATION_PROVIDER=disabled|fake|resend` explicit; `disabled` is the safe default outside approved production configuration.

**Acceptance**

- Provider HTTP never occurs inside a business transaction.
- In-app event capture, preference resolution, and inbox projection pass when `EMAIL_NOTIFICATION_PROVIDER=disabled` and no provider credentials exist.
- Local/CI suites use `EMAIL_NOTIFICATION_PROVIDER=fake` and perform no external network calls.
- Duplicate worker execution creates at most one logical successful send.
- Bounce/complaint suppresses future eligible external sends without suppressing required in-app records.
- Locale/safe-preview/template rollback tests pass.
- Non-production real-recipient test fails closed.

## Plan 14-08 — Operations, audit, retention, and SLOs

**Files to read first**

- Platform tables/workers from prior plans.
- Existing audit event conventions.
- Existing observability and health endpoints.

**Actions**

1. Add delivery audit queries and an operations UI for filters, reason chain, attempts, provider IDs, DLQ, and replay.
2. Add metrics for queue age, stage latency, retry, DLQ, duplicate, suppression, bounce/complaint, stale endpoint, and engagement.
3. Add alert thresholds and synthetic canary events.
4. Implement bounded retention/purge for inbox content, attempts, endpoints, consent proof, and audit metadata, with legal-hold exclusions.
5. Add export of policy/preference/consent/delivery evidence with sensitive payload redaction.

**Acceptance**

- A correlation ID traces an event from outbox through recipient decision and delivery without PII logs.
- Operators can distinguish suppressed, queued, provider accepted, delivered/confirmed, failed, and engaged.
- Replay is permissioned, audited, idempotent, and rate-limited.
- Retention tests preserve required evidence while removing eligible content.

## Plan 14-09 — Push, digest, quiet hours, and escalation

**Files to read first**

- Completed channel adapter and preference resolver.
- Official FCM/APNs documentation current at implementation time.
- Mobile/web endpoint and consent requirements.

**Actions**

1. Add endpoint registration/rotation/revocation and invalid-token suppression.
2. Implement FCM/APNs adapter with TTL, collapse policy, sensitive-preview rules, and provider/device feedback.
3. Implement timezone/DST-aware quiet hours and digest grouping by `(workspace,user,category,window)`.
4. Implement action-aware escalation that cancels delayed messages when the underlying task is completed.
5. Add Slack/Teams only through the adapter boundary after product approval; SMS remains blocked until explicit consent/compliance design.

**Acceptance**

- Expired/obsolete push is discarded according to catalog policy.
- Critical bypass is narrow, reason-coded, and never bypasses consent/endpoint hard stops.
- DST boundary, digest grouping, escalation cancellation, and stale-token tests pass.
- Provider accepted is not reported as device delivered.
- No push, SMS, Slack, or Teams package is installed before its approval gate passes.

## Plan 14-10 — Release verification

**Read first**

- All Phase 14 plans and summaries.
- Migration parity/runbook documents.
- Security policy, environment ownership, and release tracker.

**Actions**

1. Run fresh root format, typecheck, lint, unit/integration, shared contract, pgTAP, and migration reset/apply gates without relying on cache-only evidence.
2. Verify linked migration parity and inspect the hosted final function/table/permission state before push.
3. Run authenticated browser UAT for sidebar badge, inbox, organization policy, user preferences, test-send, conflict/rollback, accessibility, and cross-workspace isolation.
4. Run real-stack worker/provider sandbox tests for retry, DLQ, replay, bounce, suppression, non-production redirect, and correlation traces.
5. Run fan-out/load/chaos tests for the approved recipient and latency targets.
6. Produce a release evidence report separating static, focused-test, local DB, runtime, hosted, provider, browser, accessibility, and load evidence.

**Acceptance**

- No P0/P1 finding remains open without an explicit release waiver.
- Hosted final migration state matches reviewed local state.
- All acceptance criteria in the spec have named current evidence.
- Delivery/provider and authenticated browser proof are current, not historical.
- Rollback, kill switch, DLQ replay, and incident ownership are documented and exercised.

## Threat model gates

Every execution plan must cover:

- Cross-tenant event/policy/preference/inbox/endpoint access.
- Confused deputy and supplied-actor spoofing in service-role RPCs.
- SSRF/open redirect through action URLs or provider webhooks.
- Template injection and sensitive variable leakage.
- Replay/duplicate send abuse and notification flooding.
- Unauthorized test-send, broadcast, DLQ replay, or audit export.
- Endpoint token theft, webhook forgery, and secret exposure.
- Consent override and suppression bypass.
- Retention deletion that destroys required evidence.

High-severity threats block execution completion.

## Verification matrix

| Evidence class   | Minimum proof                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Static           | Catalog/producer/template/action parity, permission surface, final function-body assertions |
| Focused unit     | Resolver matrix, idempotency, cursor, template, retry classification                        |
| Local DB         | Migration reset/apply, pgTAP tenancy/RLS/RPC, outbox crash recovery                         |
| API runtime      | Authenticated publish, policy, preference, inbox, audit, replay                             |
| Browser          | Desktop/mobile layout, keyboard/screen reader, optimistic rollback, cross-tab badge         |
| Provider sandbox | Accepted/delivered/bounce/complaint/invalid token, retry/DLQ/replay                         |
| Hosted           | Linked parity, final grants/functions/tables, worker/cron ownership                         |
| Load/chaos       | Approved fan-out target, queue latency, worker crash, provider timeout/rate limit           |

## Artifacts this phase produces

- Notification catalog and catalog validation tests.
- Policy precedence ADR.
- Core notification migrations and RLS/RPC tests.
- `PreferenceResolver` and audience adapters.
- Outbox relay and channel-worker runtime.
- Organization notification settings route/page/data contracts.
- User notification preferences route/page/data contracts.
- Hardened inbox and sidebar invalidation.
- Email adapter, templates, feedback handlers, retries, DLQ, replay.
- Operations/audit/retention/metrics surfaces.
- Optional push adapter and endpoint lifecycle.
- Release evidence and runbooks.

## Execution constraints

- Preserve the current dirty worktree and isolate implementation by ownership or a dedicated branch/worktree.
- Do not edit or stop another process/worktree owner’s runtime.
- Use forward migrations only; never rewrite applied migration history.
- Do not copy reference-app files wholesale.
- Do not treat green focused tests, Turbo cache replay, health 200, or dry-run alone as release proof.
- Do not enable external delivery until kill switch, non-production redirect, consent/suppression, idempotency, and audit controls are working.
- Do not add a paid orchestration SDK or contract without the cost-gate ADR and an exit/data-export plan.

## Recommended first execution slice

Start with Plan 14-00 only. After the migration regression and false-failure contract are closed, run a product checkpoint on the six provisional decisions in the spec. Then execute Plans 14-01 through 14-04 as the reliable in-app vertical slice before opening organization/user settings or any external channel.
