---
name: new-notification-type
description: What a new notification type needs in the DB (catalog, producer registry, published template, reconcile) and how to test it end to end; learned in BL-183
metadata:
  type: reference
---

- A new type_key needs, in one migration: a `notification_catalog` row (outbox has an FK on type_key+schema_version), a `notification_producer_registry` row (integration_contract `outbox_v1` for workspace scope) and a published `notification_template_versions` row (channel in_app). Without the last two `reconcile_notification_platform_service()` lists it under `active_catalog_without_producer` / `_without_template`.
- The TS twin `packages/shared/src/notification-catalog.ts` only mirrors the first seed migrations (its test reads named files); a DB-only type does not break it (precedent: people.preferred_name.*). `notification-display.ts` has no entry, so the list falls back to the category.
- Producer: `public.enqueue_notification_outbox_service(w, event_id, type_key, 1, actor, subject_type, subject_id, payload, occurred_at)`; payload carries `recipient_user_ids`, title (≤160), body (≤2000), safe_preview, action_url (route must match the catalog's `action_route_contract` and its allowed_query_keys), group_key.
- Reconcile also expects one outbox row per time-off event (submitted/decided) via `notify_schedule_request_event_service`; suppressing a notice there must be mirrored in reconcile's `request_events` or it reports drift.
- End-to-end in pgTAP: set the row `status='leased', lease_owner=..., lease_expires_at=now()+interval '1 minute'`, then `process_notification_outbox_service(worker, id)`; the notice lands in `public.notifications`.
- Recipients by the core (no inline scope): active members with `(app_private.actor(u,w)).class = 'manager'` and `authz_reason(u, w, '<action>', array[location]) is null`.
- Trap: `tests.time_off` picks the person's latest request by `created_at`; two requests in one transaction share `now()`, so it can remember the first. Find the second by its `schedule_time_off_segments.segment_date`.

**Why:** BL-183, 2026-09-27.
**How to apply:** any new notice or audience. See [[rollback-trial-runner]].
