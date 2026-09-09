# Phase 14 Notification Producer Inventory

**Snapshot:** 2026-09-02  
**Authority:** current final migration state in `newfork-clean`; the legacy app is reference-only

All eight current logical producers write a versioned event through the
transactional `outbox_v1` boundary and are `active`. Historical direct insert
statements remain in old migration text and renamed rollback/coexistence function
bodies, but no current public producer entry point leaves those rows in the
legacy inbox. The worker creates the durable event/decision/inbox projections and
then mirrors allowed in-app rows into the legacy coexistence table.

| Producer                    | Stable `type_key`                       | Audience contract                                                   | Action contract                     | Sensitivity / retention | Current source                                                                                          |
| --------------------------- | --------------------------------------- | ------------------------------------------------------------------- | ----------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Announcement publish        | `communications.announcement.available` | Target roles plus location visibility; active, non-archived members | `/app/announcements`                | Internal / 90 days      | `publish_announcement_service` in `20260908122000_notification_announcement_producer_v1.sql`            |
| Time-off submitted          | `requests.time_off.submitted`           | Location-scoped members with time-off read permission               | `/app/schedule/requests`            | Confidential / 30 days  | `notify_schedule_request_event_service` in `20260908121000_notification_request_producers_v1.sql`       |
| Time-off status changed     | `requests.time_off.status_changed`      | Requesting employee, excluding the actor                            | `/app/employee-hub/my-availability` | Confidential / 30 days  | `notify_schedule_request_event_service` in `20260908121000_notification_request_producers_v1.sql`       |
| Shift-change submitted      | `requests.shift_change.submitted`       | Location-scoped members with shift-change read permission           | `/app/schedule/requests`            | Confidential / 30 days  | `notify_schedule_request_event_service` in `20260908121000_notification_request_producers_v1.sql`       |
| Shift-change status changed | `requests.shift_change.status_changed`  | Active participants, excluding the actor                            | `/app/employee-hub/shift-hub`       | Confidential / 30 days  | `notify_schedule_request_event_service` in `20260908121000_notification_request_producers_v1.sql`       |
| Time correction submitted   | `time_tracking.correction.submitted`    | Location-scoped correction reviewers                                | `/app/time-entries`                 | Restricted / 1 year     | `request_own_time_correction_service` in `20260908123000_notification_time_correction_producers_v1.sql` |
| Time correction decided     | `time_tracking.correction.decided`      | Requesting employee                                                 | `/app/employee-hub?tab=time`        | Restricted / 1 year     | `decide_time_correction_service` in `20260908123000_notification_time_correction_producers_v1.sql`      |
| Schedule published          | `schedule.published`                    | Active, non-archived shift assignees in the published scope         | `/app/employee-hub?tab=schedule`    | Confidential / 90 days  | `publish_schedule_draft_service` in `20260908112000_notification_outbox_relay.sql`                      |

All rows use schema version 1. Request event IDs are the immutable domain-event
IDs. Announcement event IDs are deterministic for
`workspace + announcement + revision`. Time-correction IDs are deterministic
from a domain-scoped idempotency-key fingerprint. Schedule publish uses the event
ID returned by its atomic publish overload. Recipient projection and the legacy
bridge are idempotent on event/recipient identity.

## Reconciliation and guardrails

- `notification_producer_registry` declares the eight `outbox_v1` producers.
- `reconcile_notification_platform_service()` detects active catalog types
  without a producer or published in-app template.
- The same reconciliation detects deterministic request/time-correction events,
  and current announcement revisions, that are missing an outbox row after their
  producer activation time.
- `notification_recipient_decisions` records both allowed and denied candidates,
  including the versioned resolver snapshot and reason chain.
- `20260908126000_notification_announcement_lifecycle_sync.sql` cancels or
  supersedes prior announcement projections and removes their legacy mirror.
- The shared catalog test preserves historical direct-insert counts, validates
  every current producer source, and requires active sources to reference the
  outbox boundary.
- The current codebase has no payroll-readiness or people/onboarding notification
  producer. Those event classes are reserved catalog categories, not silently
  claimed as migrated functionality.

## Activation checklist

A future type may change from `defined` to `active` only when all are true:

- the business mutation writes exactly one versioned outbox event atomically;
- recipient projection implements the named audience contract;
- every enabled channel has a versioned template and safe-preview policy;
- the route is an internal allow-listed route with explicit query keys;
- idempotency, tenant/location isolation, and replay tests pass;
- registry/catalog/template parity passes and any old direct producer is disabled.
