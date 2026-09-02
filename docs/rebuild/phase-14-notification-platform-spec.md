# Phase 14 Notification Platform — Draft Specification

**Created:** 2026-09-02
**Status:** Draft for product approval
**Requirements:** 14
**Ambiguity score:** 0.13 using research-selected defaults; decisions marked “Product approval” remain provisional

## Goal

Replace the current in-app-only, producer-specific notification behavior with a tenant-safe notification platform that reliably records business events, resolves organization and user policy, maintains a canonical in-app inbox, and delivers eligible messages through auditable channel workers without blocking the originating business transaction.

## Background

The current system has a three-category notification table, a permission-gated inbox, an unread sidebar badge, and several domain producers. Organization notification settings and user notification preferences do not exist. Schedule publication can commit before a separate notification RPC fails. External delivery, retries, DLQ, consent evidence, retention, templates, and delivery observability are absent.

The legacy/reference application contains useful catalog, policy, inbox, outbox, and preference patterns, but it also contains authorization mismatches and delivery-design debt. This specification selects patterns; it does not authorize wholesale porting.

## Product decisions

### Information architecture

- `/app/notifications` remains the canonical full inbox.
- The primary left navigation retains a Notifications destination and unread badge. Realtime invalidation is added with a periodic reconciliation poll.
- `/app/settings/notifications` becomes the organization notification policy surface.
- `/account/preferences/notifications` becomes the user preference surface for the active workspace, with a visible workspace selector when the user belongs to more than one workspace.
- Actionable approvals/tasks remain in Action Center/Needs Attention; the notification inbox links to them but does not become their workflow state store.

### Policy precedence

The effective decision is evaluated independently for every recipient, notification type, and channel:

1. Missing/invalid endpoint, revoked consent, provider suppression, or legal prohibition denies external delivery.
2. Catalog channel capability denies channels the event type does not support.
3. Organization `allowed_channels` is a hard maximum; users cannot enable a disallowed channel.
4. A narrowly cataloged `mandatory_in_app` event may create an in-app record despite a user opt-out. It does not override external-channel consent or endpoint restrictions.
5. Location/role policy narrows organization policy when present; any explicit deny wins.
6. User explicit preference applies within the remaining allowed choices.
7. Organization default applies when the user has no explicit choice.
8. Catalog default applies when neither organization nor user set a value.

The resolver returns `eligible`, `effective_cadence`, and a machine-readable `reason_chain`. The UI shows locked controls with “Managed by your organization” and exposes why a channel is unavailable.

### Event classes

- `security`: authentication, account, and access protection.
- `schedule`: publish, change, unpublish, deadline, and conflict outcomes.
- `requests`: time off, shift changes, availability, corrections, and approvals.
- `time_tracking`: missed punch, correction, review window, and kiosk/device issues.
- `payroll`: pay-period readiness, blocking exceptions, export completion/failure.
- `people`: invitation, onboarding, document, acknowledgement, and employment status.
- `communications`: announcements and direct organization messages.
- `system`: integration, billing, data export, maintenance, and operational incidents.

Marketing/commercial messages are not part of Phase 14 delivery. If introduced later, they require a separate consent and unsubscribe domain.

## Requirements

### R1 — Final migration-state authorization

- **Current:** `20260907113000_schedule_publish_notifications.sql` replaces the actor-aware function from `20260901150346_fix_schedule_publish_notification_permission.sql` with a session-identity permission check.
- **Target:** the final migrated function validates the supplied actor, workspace, week, each publication, and each publication location; only `service_role` can execute the service function.
- **Acceptance:** final-schema tests prove authorized owner/admin/scoped-manager success and reject null actor, spoofed actor, foreign workspace/publication, and out-of-scope location through the same service-role path used by the API.

### R2 — Transactional event capture

- **Current:** schedule publish and notification creation are separate RPCs.
- **Target:** every covered domain mutation writes one versioned `notification_outbox` event in the same database transaction as the business state change.
- **Acceptance:** fault injection after transaction commit but before relay execution leaves the business mutation successful and exactly one replayable outbox event present.

### R3 — Typed notification catalog

- **Current:** category/title/body/source strings are embedded across SQL producers.
- **Target:** a shared catalog defines stable `type_key`, category, schema version, severity, sensitivity, supported channels, default cadence, audience contract, action route contract, dedupe policy, retention class, template key, and lifecycle (`defined|active|retired`).
- **Acceptance:** CI fails when an active type has no producer, template, action-route validation, or seed/catalog parity.

### R4 — Immutable event and recipient projection

- **Current:** announcement republish/cancel deletes rows and schedule republish resets personal read/dismiss state.
- **Target:** `notification_events` and `notification_recipients` are append-only business/delivery evidence; cancellation, supersession, and visibility are projected fields/events rather than destructive history rewrites.
- **Acceptance:** republish/cancel tests preserve the original recipient/read evidence and add a new revision/cancellation state without duplicate external sends.

### R5 — Deterministic preference resolver

- **Current:** no organization/user delivery preference model exists.
- **Target:** one `PreferenceResolver` implements the precedence above and stores a decision snapshot containing rule source/version and reason codes for each channel.
- **Acceptance:** a table-driven test matrix covers catalog defaults, organization allow/deny/default, role/location narrowing, user override, mandatory in-app, consent withdrawal, invalid endpoint, multi-workspace, and inactive/terminated recipient cases.

### R6 — Organization notification settings

- **Current:** Organization Settings has no notification destination.
- **Target:** `/app/settings/notifications` lets authorized admins search/filter catalog types; set enabled state, allowed channels, defaults/cadence, target roles/locations, quiet-hour policy, and mandatory/locked behavior within catalog constraints; view change history; reset to catalog defaults; and send a safe test notification.
- **Acceptance:** read-only and write permissions are tested separately; every save is optimistic with rollback, version-conflict handling, audit actor/reason, and no cross-tenant access.

### R7 — User notification preferences

- **Current:** account preferences controls appearance only.
- **Target:** `/account/preferences/notifications` exposes active-workspace category/type × channel preferences, digest cadence, timezone/quiet hours, safe-preview preference, and locked organization-controlled states.
- **Acceptance:** rapid toggle sequences cannot lose updates; duplicate categories are rejected; patch semantics are explicit; user changes cannot enable organization-denied channels; preferences are isolated per workspace.

### R8 — Canonical inbox and left-nav freshness

- **Current:** unread badge polls every 60 seconds; inbox cursor is timestamp-only.
- **Target:** the inbox supports seen/read/unread/dismiss, compound cursor pagination, category/severity/read filters, grouping, deep links, and per-row mutation state; the badge receives realtime invalidation plus a reconciliation poll.
- **Acceptance:** timestamp-collision pagination returns every row exactly once; badge and inbox converge after cross-tab/domain events; keyboard and screen-reader tests cover filters/actions/status announcements.

### R9 — Delivery workers and idempotency

- **Current:** there are no general channel workers or attempt records.
- **Target:** relay, audience projection, and channel workers use stable correlation/idempotency keys. Unique recipient projection is `(workspace_id,event_id,recipient_user_id)` and unique channel delivery is `(recipient_projection_id,channel,logical_send_version)`.
- **Acceptance:** duplicate, reordered, concurrent, and replayed events produce one logical inbox item and at most one successful external send per logical version.

### R10 — Retry, DLQ, replay, and endpoint suppression

- **Current:** no retry/DLQ/replay framework exists.
- **Target:** transient 429/5xx/network failures use bounded exponential backoff with jitter; permanent 4xx, hard bounce, complaint, invalid token, and withdrawn consent are not retried; exhausted deliveries enter a DLQ with permissioned replay.
- **Acceptance:** deterministic worker tests cover transient recovery, permanent failure, TTL expiry, stale-token cleanup, DLQ replay, and replay idempotency.

### R11 — Templates, localization, and safe previews

- **Current:** notification text is embedded in producers and may include sensitive free-form content.
- **Target:** channel-specific versioned templates share a semantic payload; locale fallback is `user locale → organization locale → en`; sensitive types use cataloged safe previews and redaction; published versions can be previewed and rolled back.
- **Acceptance:** snapshot tests cover every active type/channel/locale fallback, reject undeclared variables, and prove HR/payroll/security lock-screen previews contain no sensitive body fields.

### R12 — Audit, retention, and consent evidence

- **Current:** notification rows have no platform retention or preference/consent audit history.
- **Target:** policy, preference, consent, template, test-send, DLQ replay, and high-risk broadcast actions are append-only audited. Content, delivery attempts, consent proof, and audit metadata have separate retention schedules and legal-hold behavior.
- **Acceptance:** purge tests remove eligible content in bounded batches without deleting required consent/audit evidence; tenant deletion and user deletion behavior are specified and verified.

### R13 — Observability and delivery SLOs

- **Current:** no end-to-end correlation or delivery-stage metrics exist.
- **Target:** metrics distinguish accepted, projected, suppressed, queued, provider accepted, delivered/confirmed, opened/clicked, and actioned states; dashboards show queue age, p95 latency, retry/DLQ, duplicate, suppression, bounce/complaint, and stale-endpoint rates per type/channel/tenant.
- **Acceptance:** synthetic events can be traced end-to-end by correlation ID without PII in logs; alerts fire for queue-age, failure-rate, and DLQ thresholds.

### R14 — Non-production safety and enterprise controls

- **Current:** there is no general external-delivery kill switch or redirect policy.
- **Target:** non-production defaults to external delivery disabled or redirected to allow-listed sinks; organization admins have test-send; platform operators have kill switch, replay, and audit export; high-risk broadcasts require approval.
- **Acceptance:** an automated environment-safety test proves sandbox/preview cannot deliver to a real customer endpoint unless an explicit time-bounded override is active and audited.

## Data contracts

### `notification_outbox`

Required fields: `id`, `workspace_id`, `event_id`, `type_key`, `schema_version`, `actor_user_id`, `subject_type`, `subject_id`, `payload`, `occurred_at`, `available_at`, `status`, `attempt_count`, `lease_owner`, `lease_expires_at`, `last_error`, `created_at`.

### `notification_events`

Required fields: `id`, `workspace_id`, `type_key`, `schema_version`, `actor_user_id`, `subject_type`, `subject_id`, `payload_digest`, `sensitivity`, `occurred_at`, `supersedes_event_id`, `cancelled_at`, `created_at`.

### `notification_recipients`

Required fields: `id`, `workspace_id`, `event_id`, `recipient_user_id`, `recipient_employee_id`, `location_id`, `audience_reason`, `policy_snapshot`, `created_at`.

### `notification_inbox_items`

Required fields: `id`, `workspace_id`, `recipient_projection_id`, `title`, `body`, `safe_preview`, `action_url`, `group_key`, `created_at`, `seen_at`, `read_at`, `dismissed_at`, `visibility_state`.

### `notification_org_policies`

Required fields: `workspace_id`, `type_key`, optional `role_id`/`location_id`, `enabled`, `allowed_channels`, channel defaults/cadence, quiet-hours policy, `mandatory_in_app`, `version`, `updated_by`, `updated_at`.

### `notification_user_preferences`

Required fields: `workspace_id`, `user_id`, `preference_scope`, `scope_key`, per-channel state/cadence, timezone, quiet hours, safe-preview choice, `version`, `updated_at`.

### `notification_delivery_attempts`

Required fields: `id`, `workspace_id`, `recipient_projection_id`, `channel`, `logical_send_version`, `provider`, `provider_message_id`, `template_version_id`, `status`, `attempt_number`, `next_attempt_at`, `error_class`, `error_code`, `accepted_at`, `delivered_at`, `engaged_at`, `created_at`.

## API surface

Proposed workspace endpoints:

- `GET /v1/workspaces/:workspaceId/notifications`
- `POST /v1/workspaces/:workspaceId/notifications/actions`
- `GET /v1/workspaces/:workspaceId/notification-catalog`
- `GET /v1/workspaces/:workspaceId/notification-policies`
- `PUT /v1/workspaces/:workspaceId/notification-policies/:typeKey`
- `POST /v1/workspaces/:workspaceId/notification-policies/reset`
- `POST /v1/workspaces/:workspaceId/notification-test-sends`
- `GET /v1/workspaces/:workspaceId/me/notification-preferences`
- `PATCH /v1/workspaces/:workspaceId/me/notification-preferences`
- `GET /v1/workspaces/:workspaceId/notification-deliveries`
- `POST /v1/workspaces/:workspaceId/notification-deliveries/:deliveryId/replay`

All list endpoints use opaque compound cursors. All writes use version/ETag-style conflict checks and idempotency keys where repetition is possible.

## Permissions

- `notifications.read_own`
- `notifications.preferences.write_own`
- `notifications.settings.read`
- `notifications.settings.write`
- `notifications.test_send`
- `notifications.delivery_audit.read`
- `notifications.dlq.replay`
- `notifications.broadcast.approve`

Personal inbox/preferences require active workspace membership and own-user scope; they are not granted only through a manager/admin role permission. Organization policy and operations permissions remain explicit RBAC grants.

## Performance and reliability constraints

- Domain mutation p95 overhead for outbox insertion: proposed budget ≤ 50 ms excluding the business mutation itself.
- API event acceptance path must not wait for provider HTTP.
- Initial target: project in-app records for 5,000 recipients within 30 seconds p95 under documented test hardware.
- Badge count and first inbox page: p95 ≤ 300 ms at 100,000 retained items per tenant under the agreed benchmark.
- Queue leases are crash-safe and replayable; no provider call occurs while holding a long-running business database transaction.
- Provider `accepted` is never labeled `delivered` without a provider/device confirmation signal.

## Boundaries

### In scope

- P0 schedule publish authorization and atomicity repair.
- Typed catalog and event schema versioning.
- Transactional outbox and idempotent in-app projection.
- Organization policy and user preference stores/resolver.
- Organization and user notification settings UI.
- Inbox/sidebar correctness and realtime invalidation.
- Email delivery, provider feedback, retry/DLQ/replay.
- Template versioning, localization, safe previews.
- Audit, retention, consent/suppression, metrics, and non-production safety.
- Push architecture and endpoint model; production push may be a later execution wave.

### Out of scope

- Marketing campaigns and promotional messaging — require a separate commercial-consent product.
- Replacing Action Center/task workflow state with notification rows — these are different domains.
- AI-generated notification copy — unnecessary for reliable delivery and increases safety/approval scope.
- WhatsApp and voice calls — no approved use case or consent model.
- A wholesale port of the legacy notification implementation — known defects and data-model assumptions must not be inherited.
- Legal certification — counsel must validate jurisdiction/customer-specific requirements.

## Acceptance criteria

- [ ] Final migration-state tests close the schedule publish authorization regression.
- [ ] Covered domain mutations atomically create one replayable outbox event.
- [ ] Catalog/producer/template/action-route parity gates pass for every active type.
- [ ] Organization policy and user preference conflicts resolve deterministically with an auditable reason chain.
- [ ] Personal inbox/preferences are own-user, tenant-isolated, and available to active members.
- [ ] Compound cursor traversal has no duplicates or gaps under timestamp collisions.
- [ ] Duplicate/reordered/replayed events do not create duplicate logical deliveries.
- [ ] Transient failures retry; permanent failures suppress; exhausted failures reach a replayable DLQ.
- [ ] Sensitive previews, locale fallback, retention, and non-production redirect tests pass.
- [ ] Delivery dashboards distinguish accepted, delivered/confirmed, and engaged states.

## Ambiguity report

| Dimension           |    Score | Minimum | Status               | Notes                                                            |
| ------------------- | -------: | ------: | -------------------- | ---------------------------------------------------------------- |
| Goal clarity        |     0.93 |    0.75 | Met                  | Target capability and reliability boundary are explicit          |
| Boundary clarity    |     0.91 |    0.70 | Met                  | Action Center, marketing, AI copy, and legacy port are excluded  |
| Constraint clarity  |     0.76 |    0.65 | Met                  | Initial scale/SLO budgets are proposed and must be benchmarked   |
| Acceptance criteria |     0.86 |    0.70 | Met                  | Requirements have current/target/pass-fail evidence              |
| **Ambiguity**       | **0.13** |  ≤ 0.20 | **Met for drafting** | Product approval is still required for provisional choices below |

## Product approval checklist

- [ ] Confirm personal inbox access should be active-membership/own-user rather than role-permission-gated.
- [ ] Confirm mandatory behavior is limited to in-app for cataloged security/system events.
- [ ] Confirm initial external channel is email; push follows after the core pipeline.
- [ ] Confirm user preferences are workspace-specific with a multi-workspace selector.
- [ ] Confirm proposed performance targets or replace them with approved budgets.
- [ ] Confirm 5,000-recipient initial fan-out target.

## Drafting log

This draft used an auto-selected research baseline rather than a live product interview. Choices follow the current code audit, the approved reference boundary, Workday-style tenant routing, Slack-style user quiet hours, and Knock/Novu-style explicit precedence. Items in the Product approval checklist are not locked until approved.
