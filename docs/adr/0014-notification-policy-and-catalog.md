# ADR 0014 — Notification policy and catalog boundaries

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decision owners:** Product and engineering
- **Scope:** Phase 14 notification platform

## Context

Newfork currently writes producer-specific rows directly to `public.notifications`.
The inbox works, but there is no governed type catalog, organization policy, user
preference model, delivery ledger, or consistent decision explanation. The
reference application demonstrates useful patterns, but its catalog and producer
state are not authoritative for this rebuild.

## Decision

### Catalog ownership and lifecycle

`packages/shared/src/notification-catalog.ts` is the source of truth for stable
type keys and the R3 contract. A type moves through `defined`, `active`, and
`retired`:

- `defined` means its contract is reviewable but it must not appear in settings.
- `active` requires an outbox producer, versioned template, safe action route, and
  parity tests.
- `retired` remains resolvable for historical evidence but cannot accept new
  events.

The eight event classes are security, schedule, requests, time tracking, payroll,
people, communications, and system. Marketing/commercial messaging is excluded;
it requires a separate consent and unsubscribe domain.

### Effective policy precedence

The resolver evaluates every recipient, type, and channel independently. The
first applicable hard stop wins:

1. Legal prohibition, revoked consent, provider suppression, or invalid endpoint
   denies external delivery.
2. Catalog capability denies an unsupported channel.
3. Organization `allowed_channels` is a hard maximum.
4. Cataloged `mandatory_in_app` can override only an in-app user opt-out.
5. Role/location policy narrows organization policy; an explicit deny wins.
6. User preference applies within the choices still allowed.
7. Organization default applies when no user preference exists.
8. Catalog default applies when neither organization nor user supplied a value.

Every decision must retain a machine-readable reason chain and the policy/catalog
versions used. Users cannot enable an organization-denied channel. Mandatory
delivery never overrides external-channel consent.

### Product boundaries

- Any active workspace member may access their own inbox and own workspace-scoped
  preferences; no separate `notifications.read` permission is required for this
  personal access path.
- Only cataloged security/system types may become `mandatory_in_app`, after a
  dedicated review. None of the initial eight types is mandatory.
- In-app is the baseline channel. Email is the first optional external adapter;
  push follows only after the core path is stable.
- `/app/notifications` is the canonical inbox. Action Center/Needs Attention owns
  task state and approvals; notifications may deep-link to it but never duplicate
  its workflow state.
- User preferences are workspace-scoped. A multi-workspace user chooses the
  workspace explicitly.
- Initial fanout is designed and load-tested for 5,000 recipients per event.
- The performance budgets in the Phase 14 specification are accepted.

### Dependency boundary

The baseline has no mandatory paid orchestration dependency. Newfork owns the
catalog, resolver, outbox, inbox, audit, retry/DLQ, and worker runtime on the
existing Postgres/Supabase stack. Knock, Novu, Courier, OneSignal, or equivalent
SDKs require a superseding ADR with product, security, compliance, and budget
approval. Optional provider usage is isolated behind channel adapters; disabled
and deterministic fake adapters remain supported.

## Consequences

- Existing direct `public.notifications` producers remain operational during the
  migration, but their catalog entries stay `defined` until converted to outbox
  producers.
- Organization and user settings cannot ship ahead of producer/template parity.
- Adding an external provider changes operating cost, not the core notification
  data model.
- Catalog history and delivery evidence must survive retirement and replay.
