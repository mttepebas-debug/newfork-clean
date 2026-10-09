# Phase 14 Notification Platform — Audit and Enterprise Research

**Date:** 2026-09-02
**Scope:** `newfork-clean` current notification inbox, left navigation, organization settings, user preferences, reference application comparison, and enterprise notification architecture
**Method:** six-agent static audit plus focused tests and official-source market research
**Code-change boundary:** product code was not modified

## Executive conclusion

`newfork-clean` has a credible in-app notification inbox, but it does not yet have a notification platform. The current implementation can persist and display three categories of notification, mark them read or dismissed, and expose an unread badge in the left navigation. It does not have organization notification policy, user notification preferences, a typed event catalog, external delivery channels, a transactional outbox, delivery attempts, retry/DLQ operations, retention, or end-to-end observability.

The safest target is a hybrid architecture:

- Keep event taxonomy, audience authorization, policy resolution, in-app records, consent evidence, audit history, and retention rules inside Newfork.
- Use providers only as transports: SES/Resend for email, FCM/APNs for push, and a later provider for SMS.
- Put a transactional outbox between business mutations and notification fan-out.
- Treat the in-app inbox as the canonical user-visible record; email, push, SMS, Slack, and Teams are attention channels.
- Keep the historical inbox separate from actionable work queues such as approvals and “Needs attention.”

Before platform work begins, one current migration regression should be treated as P0: the final definition of `create_schedule_publish_notifications_service` appears to overwrite the actor-aware permission repair with an `auth.uid()`-based check that is incompatible with the service-role call path.

## Evidence boundary

### Verified in this run

- Current branch/worktree and dirty-tree state.
- Static UI → client → API → RPC → database tracing in `newfork-clean`.
- Final migration ordering and the schedule notification function bodies.
- The reference application at `C:\Users\TheWe\newfork` as a read-only working-tree snapshot.
- Seven notification-focused codebase map documents in `.planning/codebase/`.
- Focused web/API/shared tests run by audit agents.
- Current official product and infrastructure documentation cited below.

### Not verified in this run

- Hosted Supabase migration parity or final hosted function bodies.
- Authenticated browser behavior and visual quality.
- Real Resend/SES, FCM/APNs, SMS, Slack, or Teams delivery.
- Cron/worker ownership, throughput, delivery latency, failover, or load behavior.
- Legal applicability to a particular customer or jurisdiction.

## Workspace safety snapshot

- Active checkout: `codex/phase-1-foundation` at `e9efeeab7fc91a35271cab22cd99f3c21b3e4fe5`.
- The worktree already contains a large set of unrelated Schedule, employee, settings, and infrastructure changes.
- Multiple Node/API/Vite processes belong to this worktree. None were stopped or restarted.
- The reference checkout is also dirty, including notification files; it is evidence of a live snapshot, not a clean committed baseline.

## Current `newfork-clean` architecture

```text
Left sidebar badge / Notifications page / Workspace cards
                         |
                         v
TanStack Query + communications-data.ts + shared Zod contracts
                         |
                         v
Fastify communication routes + workspace capability checks
                         |
                         v
Supabase service-role RPCs
                         |
                         v
Postgres notifications table and domain-specific producers
```

Key evidence:

- Sidebar destination and unread badge query: `apps/web/src/shell/AppShell.tsx:87-90`, `apps/web/src/shell/AppShell.tsx:113-118`, `apps/web/src/shell/AppShell.tsx:231-240`.
- Permission-gated route: `apps/web/src/App.tsx:313-318`.
- Inbox/filter/action UI: `apps/web/src/views/NotificationsPage.tsx:18-263`.
- Browser data boundary: `apps/web/src/communications/communications-data.ts:99-132`.
- API read/action boundary: `apps/api/src/communications/communication-routes.ts:145-209`.
- Service-role RPC adapter: `apps/api/src/communications/communication-service.ts:115-133`.
- Shared categories and schemas: `packages/shared/src/communications.ts:95-126`.
- Database table, read/action RPCs, and producers: `supabase/migrations/20260823100000_communication_operations.sql:119-394`.

## Surface audit

| Surface                | Current state                                                                                                                          | Audit result                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Left navigation        | Normal `Notifications` link, unread count polling every 60 seconds, permission `notifications.read`                                    | Functional, but badge freshness is polling-only and personal inbox access is coupled to a role permission                         |
| Full inbox             | Three categories (`announcement`, `request`, `schedule`), unread filter, day grouping, mark read/unread/all, dismiss, timestamp cursor | Useful foundation; missing event catalog, compound cursor, seen state, grouping contract, realtime, and per-row mutation feedback |
| Organization settings  | No notification item in `SettingsLayout`; no organization policy schema/API/UI                                                         | Missing                                                                                                                           |
| User preferences       | `/account/preferences` controls theme only                                                                                             | Missing                                                                                                                           |
| Action center          | Workspace dashboard embeds recent announcements/notifications                                                                          | Must remain conceptually separate from outstanding approval/task queues                                                           |
| External delivery      | No general email, push, SMS, Slack, or Teams path                                                                                      | Missing                                                                                                                           |
| Reliability operations | No transactional outbox, delivery attempts, retry policy, DLQ, replay, or reconciliation                                               | Missing                                                                                                                           |
| Governance             | No consent ledger, policy version, template version, retention, or notification audit trail                                            | Missing                                                                                                                           |

## Critical and high-priority findings

### P0 — final schedule publish notification authorization regresses an earlier repair

The September 1 migration validates the supplied `actor_user_id` against each publication/location through `schedule_actor_can_publish_service`:

- `supabase/migrations/20260901150346_fix_schedule_publish_notification_permission.sql:30-53`

The later September 7 migration replaces the entire function and checks `workspace_has_permission(target_workspace_id, 'schedule.publish')`, which resolves the database session identity instead of binding authorization to the function argument:

- `supabase/migrations/20260907113000_schedule_publish_notifications.sql:246-265`

The API calls this RPC with a service-role client and passes the actor only as an argument:

- `apps/api/src/schedule/schedule-service.ts:792-801`

**Impact:** the final migrated schema can reject a legitimate schedule publish notification after the schedule has already committed. It also creates a future confused-deputy risk if session identity and supplied actor diverge.

**Required response:** add a forward migration after `20260907113000`, restore explicit actor/location authorization, and add a final-schema service-role regression test with cross-tenant and scoped-location negatives.

### P0 — schedule publication and notification creation are not atomic

The schedule publication RPC returns success first, realtime invalidation is broadcast second, and notification creation is a separate RPC third (`apps/api/src/schedule/schedule-service.ts:761-812`). A failure in the last step is thrown after durable publication.

**Impact:** the client can see a failed publish response even though the schedule is already published, while employees remain unnotified. Manual retry is ambiguous.

**Required response:** write the publication event/outbox row in the same database transaction as publication. Fan-out and external delivery must be asynchronous and idempotent.

### P1 — timestamp-only cursor can skip records

The database orders by `(created_at desc, id)` but returns only a timestamp cursor and filters the next page with `created_at < cursor` (`supabase/migrations/20260823100000_communication_operations.sql:300-310`).

**Impact:** when more notifications share the boundary timestamp than fit on one page, some are never returned.

**Required response:** use an opaque compound `(created_at,id)` cursor and the same total ordering in the keyset predicate.

### P1 — read state is the only “preference” model

`read_at` and `dismissed_at` describe interaction with already-created rows; they cannot express organization defaults, user opt-outs, mandatory alerts, channel allowance, quiet hours, digest cadence, or consent. `user_preferences` and `/account/preferences` currently cover appearance only.

**Impact:** adding toggles directly to the existing table or UI would mix global appearance with workspace-scoped delivery policy and make precedence unauditable.

### P1 — notification history is mutable/destructive

Announcement edit/publish/cancel paths delete notification rows before rebuilding or removing them (`supabase/migrations/20260823100000_communication_operations.sql:251-295`). Schedule republish resets `created_at`, `read_at`, and `dismissed_at` (`supabase/migrations/20260907113000_schedule_publish_notifications.sql:319-323`).

**Impact:** personal evidence of what a user received and acknowledged can disappear or become unread again.

**Required response:** keep immutable event/recipient history and project visibility/cancellation state separately.

### P1 — delivery reliability and observability are absent

There is no shared event registry, outbox relay, retry taxonomy, attempt ledger, DLQ, replay operation, provider receipt, correlation ID, delivery SLO, or retention job. Current producers mix triggers, RPC inserts, and API-side post-commit calls.

**Impact:** missing notifications cannot be distinguished from suppressed, failed, delayed, or delivered notifications.

### P1 — sensitive content has no channel classification

Notification title/body are durable plaintext. Time-correction reasons can be copied into notification content. Future lock-screen/email delivery would expand exposure without a sensitivity or redaction contract.

**Required response:** catalog every event with sensitivity, safe-preview, retention, and permitted-channel metadata.

### P2 — sidebar polling does unnecessary repeated work

Each eligible app shell polls every 60 seconds and the RPC calculates an exact unread count (`apps/web/src/shell/AppShell.tsx:113-118`; `supabase/migrations/20260823100000_communication_operations.sql:308-310`).

**Required response:** use event-driven invalidation plus periodic reconciliation and either a counter projection or a capped count contract.

## Reference application audit

The reference application is `C:\Users\TheWe\newfork`. The sidebar/app shell is an approved exact-port reference, but notification data models, migrations, endpoints, and assumptions are not automatically authoritative.

### Useful reference patterns

| Capability                                 | Reference implementation                                                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Typed event catalog                        | `packages/shared/src/notifications/types.ts:7`, `packages/shared/src/notifications/catalog.ts:13`, `catalog.ts:2163`                           |
| Central recipient fan-out                  | `apps/api/src/features/notifications/notify.ts:356`                                                                                            |
| Role/location-aware recipients             | `apps/api/src/features/notifications/recipients.ts:50-146`                                                                                     |
| Bell + badge + realtime/poll fallback      | `apps/web/src/features/notifications/NotificationBell.tsx:74-332`                                                                              |
| Full inbox with keyset pagination/grouping | `apps/web/src/features/notifications/NotificationsPage.tsx:47-255`                                                                             |
| Organization type policy                   | `apps/web/src/features/settings/NotificationSettingsPage.tsx:235-491`                                                                          |
| Workspace/category user preferences        | `apps/web/src/features/notifications/useNotificationPreferences.ts:1-103`                                                                      |
| Seen/read/dismiss separation               | `apps/api/src/features/notifications/inbox.service.ts:148-235`                                                                                 |
| Email/push outboxes and retention          | `supabase/migrations/20260704090000_notifications_v2_foundation.sql:226-326`, `supabase/migrations/20260716090000_employee_mobile_v1.sql:8-60` |
| Producer/catalog drift tests               | `apps/api/src/features/notifications/producer-wiring.test.ts:114-190`                                                                          |

### Reference capabilities versus successor

| Area                | Reference app                                                       | `newfork-clean`     |
| ------------------- | ------------------------------------------------------------------- | ------------------- |
| Catalog             | 133 typed types in current dirty snapshot; active/defined lifecycle | No central catalog  |
| Categories          | Eight                                                               | Three               |
| Organization policy | Type × enabled × in-app/email × roles                               | None                |
| User preference     | Workspace × category × in-app/email/push                            | None                |
| Inbox state         | Seen/read/unread/dismiss                                            | Read/unread/dismiss |
| Realtime            | Supabase broadcast plus poll fallback                               | Poll only           |
| Email/push          | Durable outboxes and dispatchers                                    | None                |
| Retention           | Inbox/email cleanup                                                 | None                |
| Drift guard         | Catalog seed and producer coverage tests                            | None                |

### Do not copy these reference defects

- Web route/menu permission checks do not match notification-specific API permissions.
- Organization policy does not govern push even though user push and Expo delivery exist.
- Notification creation is generally best-effort after domain commit.
- Provider HTTP is performed inside database transaction contexts.
- Push outbox cleanup is missing.
- `z.coerce.boolean()` can interpret the string `"false"` as truthy.
- User preference payload does not reject duplicate categories or require a complete/patch-explicit contract.
- Billing recipient targeting can include users whose preference UI hides billing.
- Refresh-style dedupe can re-surface inbox state without re-sending external channels.
- A stale design spec still claims push is absent even though current code contains it.

Focused reference verification passed 122/122 tests across API, web, shared catalog/schema, and templates. This is focused static evidence only; it is not browser, real DB, provider, hosted, or load proof.

## Enterprise patterns and official-source research

### What mature products converge on

1. **Two control planes:** tenant administrators define allowed channels/defaults; users personalize within those bounds.
2. **Specificity with hard stops:** user-specific choices normally beat defaults, while consent, unavailable endpoints, organization-denied channels, and narrowly defined critical policies remain hard constraints.
3. **In-app canonical record:** external channels attract attention; the inbox preserves state and deep links.
4. **Actionable work is separate:** approvals/tasks are not merely informational notifications.
5. **Delivery is asynchronous:** transactional outbox, idempotent consumers, bounded retries, DLQ, replay, and provider feedback.
6. **Enterprise operations matter:** non-production redirects, test sends, quiet hours, digests, rate caps, audit logs, retention, localization, and per-tenant analytics.

### Product comparison

| Product/pattern             | Official behavior                                                                                                                                                         | Newfork lesson                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Slack                       | Users choose desktop/mobile/email behavior, exceptions, schedules, badge/activity content; enterprise admins can set default DND while members may change it              | Separate organization defaults from user-owned preferences and make timezone/quiet hours first-class          |
| Microsoft Teams/Graph       | Activity feed supports OS surfaces, previews, deep links, localization, delegated/app permissions, and batch delivery                                                     | Every notification type needs a stable action target; provider acceptance is not proof of user delivery       |
| Salesforce                  | Admins configure delivery surfaces and custom notification types with permissions                                                                                         | Make notification types governed catalog entries, not ad hoc strings                                          |
| Workday                     | Tenant routing rules determine allowed channels/frequencies; users select among allowed options; in-app notifications can remain even when external channels are disabled | Closest workforce model: tenant governance + user preference + canonical bell/inbox + non-production redirect |
| Knock                       | Environment/tenant/user preference hierarchy, per-tenant sets, workflow debugging, hosted/custom preference centers, conflict evaluation                                  | Strong buy candidate for workflow/template UX, but Newfork must retain policy/audience/consent truth          |
| Novu                        | Workflow, global subscriber, and per-workflow preferences; critical workflows can remove user overrides                                                                   | Good self-host candidate; map its precedence carefully to Newfork’s legal/org/user semantics                  |
| AWS EventBridge/SNS/SQS/SES | Durable event routing, retry policy, DLQ, filtering, delivery/bounce/complaint events                                                                                     | Strong infrastructure substrate, but not a product preference engine or inbox                                 |
| FCM                         | Push transport with TTL/collapse/device feedback; accepted message ID is not device delivery                                                                              | Use only as transport; keep idempotency, policy, sensitive-preview, and action state in Newfork               |

Official sources:

- [Slack user notification preferences](https://slack.com/help/articles/201355156-Configure-your-Slack-notifications)
- [Slack default Do Not Disturb policy](https://slack.com/help/articles/214888418-Set-default-Do-Not-Disturb-hours)
- [Microsoft Teams activity feed notifications](https://learn.microsoft.com/en-us/graph/teams-send-activityfeednotifications)
- [Salesforce Notification Builder](https://help.salesforce.com/s/articleView?id=platform.notif_builder.htm&language=en_US)
- [Workday Notifications concept](https://doc.workday.com/admin-guide/en-us/manage-workday/tenant-configuration/notifications-and-alerts/wil1453160661174.html)
- [Workday tenant notification settings](https://doc.workday.com/admin-guide/en-us/manage-workday/tenant-configuration/tenant-setup/wil1451433814625.html)
- [Knock preference model](https://docs.knock.app/preferences/overview)
- [Novu preference precedence](https://docs.novu.co/platform/concepts/preferences)
- [AWS EventBridge retry and DLQ](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html)
- [FCM message lifespan and delivery semantics](https://firebase.google.com/docs/cloud-messaging/customize-messages/setting-message-lifespan)
- [FTC CAN-SPAM compliance guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
- [GDPR Article 5 principles](https://eur-lex.europa.eu/legal-content/EN/TXT/?toc=OJ%3AL%3A2016%3A119%3ATOC&uri=uriserv%3AOJ.L_.2016.119.01.0001.01.ENG)

## Build versus buy recommendation

**Recommendation: hybrid, with an adapter boundary.**

Keep inside Newfork:

- Stable event catalog and schema versions.
- Tenant/role/location audience authorization.
- Organization and user preference precedence.
- Consent and suppression source of truth.
- In-app inbox/action state.
- Idempotency keys, audit log, retention, and legal classification.

Buy or outsource:

- Email transport and bounce/complaint feedback.
- Push transport and device feedback.
- SMS transport after consent/compliance approval.
- Optionally, workflow/template orchestration after a controlled PoC.

Decision gate:

- Compare native + AWS transport, Knock, and Novu on the same five workflows: schedule publish/change, time-off submitted/decided, payroll ready, and security alert.
- Score tenant isolation, precedence correctness, latency, retry/replay, localization, audit export, data residency, lock-in, operational load, and annual TCO.
- Do not choose a vendor solely because it provides a preference UI; product authorization and audit semantics remain Newfork responsibilities.

## Recommended target architecture

```text
Domain transaction
  -> notification_outbox (same transaction)
  -> relay / audience expansion
  -> PreferenceResolver + immutable decision snapshot
  -> notification_inbox_items
  -> per-channel queues
  -> provider adapters
  -> delivery_attempts / receipts / suppression / DLQ
  -> metrics, audit, replay
```

Core tables:

- `notification_catalog`
- `notification_outbox`
- `notification_events`
- `notification_recipients`
- `notification_inbox_items`
- `notification_org_policies`
- `notification_user_preferences`
- `notification_endpoints`
- `notification_consents`
- `notification_delivery_attempts`
- `notification_template_versions`
- `notification_audit_log`

Every table is tenant-scoped where applicable. Every delivery decision stores the catalog version, effective policy sources, suppression reason, correlation ID, and template version.

## Research verdict

The reference app proves that Newfork’s product needs are real, but it should be mined selectively rather than ported. Workday is the closest enterprise product model; Knock is the strongest hosted workflow/preference comparison; Novu is the strongest self-host comparison; AWS/FCM are transport/runtime primitives, not a full product solution. The next implementation should begin with the P0 migration repair and a written precedence/catalog contract, not with notification toggles.
