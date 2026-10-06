# Notification Platform Core Migration Runbook

## Scope

Migration `20260908110000_notification_platform_core.sql` adds the Phase 14 v2
catalog, outbox, event, recipient, inbox, policy, preference, endpoint, consent,
template, delivery, and audit stores. It does not replace or delete the legacy
`public.notifications` table or its RPCs.

Migrations `20260908112000` through `20260908115000` activate the first walking
slice: Schedule publication atomically writes an outbox event, and a service-role
worker projects the event, policy decision, recipient, and in-app inbox item.

## Forward procedure

1. Confirm the target migration history includes
   `20260908105000_restore_schedule_publish_notification_actor_binding.sql` and
   `20260908106000_employee_termination_offboarding_p0.sql`.
2. Run a local reset in a disposable database, then the complete pgTAP suite.
3. Verify `supabase db lint --local --level error --schema public` is clean.
4. Confirm the eight TypeScript catalog rows match `public.notification_catalog`
   by type key, schema version, lifecycle, template key, and route contract.
5. Apply to a non-production linked project only after the local evidence is
   recorded. No external delivery provider is enabled by this migration.

## Worker operation

- Invoke `POST /internal/cron/notification-outbox` with `Authorization: Bearer
$CRON_SECRET` (or `x-cron-secret`) on a short recurring cadence.
- Safe defaults are batch size `25`, lease `60` seconds, maximum `5` attempts,
  and retry base delay `15` seconds. Override with
  `NOTIFICATION_OUTBOX_BATCH_SIZE`, `NOTIFICATION_OUTBOX_LEASE_SECONDS`,
  `NOTIFICATION_OUTBOX_MAX_ATTEMPTS`, and
  `NOTIFICATION_OUTBOX_RETRY_BASE_SECONDS`.
- `NOTIFICATION_WORKER_ID` should identify the deployment/process. If absent, the
  API generates a process-local identifier.
- Multiple workers are safe: leasing uses bounded `FOR UPDATE SKIP LOCKED`.
  Expired leases are reclaimable; recipient and inbox projection keys prevent
  duplicates after crash/restart.
- A poison item becomes `dead_letter` at the attempt bound and retains a bounded
  operational error. Replay tooling remains Plan 14-08; until then, inspect and
  remediate dead letters through service-role operational access only.
- This slice makes no network/provider calls and introduces no paid dependency.

## Coexistence and backfill

- Existing application routes keep reading and mutating `public.notifications`,
  except Schedule publish, which now writes the v2 outbox while legacy inbox reads
  remain available during parity rollout. The worker creates an idempotent legacy
  visibility bridge and records its ID on `notification_inbox_items`; this bridge
  is removed only when Plan 14-06 moves all reads and state actions to v2.
- V2 reads use `get_notification_inbox_v2_service`; no production route is moved
  until Plan 14-04 proves producer and inbox parity.
- `notification_inbox_items.legacy_notification_id` provides a one-to-one bridge
  for a later idempotent backfill. This migration intentionally performs no
  content backfill because legacy rows lack stable type keys and schema versions.
- Backfill must map through the approved producer inventory, create one event and
  recipient projection per logical legacy row, and set `legacy_notification_id`.
  Unknown source contracts remain on the legacy path for manual classification.
- Legacy deletion is prohibited until parity counts, read/dismiss state, and
  deep links are verified per workspace.

## Rollback

The safe rollback is application-level: keep all reads and writes on the legacy
path and stop v2 workers. Do not drop v2 tables after any outbox/event/audit data
has been written. Before first production write only, a database rollback may
drop v2 functions and tables in reverse dependency order, remove the eight new
permission definitions/grants, and leave `public.notifications` untouched.

After first production write, remediation is forward-only through a new
migration. Preserve notification events, recipient policy snapshots, consent
evidence, and audit rows.
