---
name: time-off-voting
description: FB-6.3 time off by location votes — what the red tests pin, the builder split, the locationless traps and the owner document exemption
metadata:
  type: project
---

- FB-6.3.1/.2 on `task/fb-6.3` (2026-10-01): `d26807ed` = additions migration `20261003030000` (alone, may go live + main first); `22655dee` = red tests (`time_off_voting`, `time_off_deadlines`, matrix, coverage, catalog) + `tests.leave`. The test commit reaches main only with .3/.4: matrix/coverage/catalog are ci-green files.
- The red tests are the contract: `submit_time_off_service(actor, w, periods, reason, expected_timezone, operation_id)`, `decide_time_off_service(actor, w, rid, verdict, note, expected_impact)` → `{status, final, alone, remaining, revision, request_id}`, `revoke_time_off_service(actor, w, rid, expected_revision, reason)`, `request_time_off_cancellation_service(actor, w, parent, expected_revision, periods, reason, operation_id)`, `app_private.time_off_impact(w, rid)` → `{fingerprint, locations: {loc: {fingerprint, shifts}}}`, `app_private.time_off_state(w, rid)` → `{fallback, locations[{id, approved_by}], votes[{voter, verdict, stale}]}`, `app_private.time_off_sweep()`, read row `progress{remaining, fallback, can_vote, can_decide_alone, my_vote, my_approval_finalizes, locations}`, setting key `time_off_lead_hours` in `update_scheduling_settings_service`, fallback notice `audience_contract = 'time_off_fallback_deciders'`.
- `tests.time_off` (old service, location) is used by 9 ci-green files; `tests.leave` files the new way. Merge them only when the old services go (.7).
- Locationless traps: `time_off_period_span` and `time_off_request_periods` INNER JOIN `locations` on `r.location_id` (empty for a new request); `guard_time_off_requested_period` resolves the zone from the request's location; `notify_schedule_request_event_service` raises when the location is null and compares `actor_user_id` with `<>` (null for system events).
- Rewriting the notify trigger removes `membership_location_scopes`/`all_locations`: lower the `authz_catalog` own-scope ceiling 41 → 40 in the same commit.
- User decision 2026-10-01: the owner is always exempt from document deadlines and restrictions — submits, records and votes on own time off; `owner_time_off_needs_no_documents` must stay green. `time_off.request_own` is `restricted_ok = false`, so the owner needs an explicit path past `document_blocked`.
- Fingerprint by shift content (location, job, date, times), not id: `tests.publish_week` republishes through a blank session, so ids change on an unchanged republish.
- GateGuard refuses the first Write of every new file and the first Edit of every existing file once, even after facts are stated: write a one-line stub first, then the content.

**Why:** handover after FB-6.3 (a), 2026-10-01; the .3/.4 session starts from these.
**How to apply:** read before FB-6.3.3/.4. See [[rollback-trial-runner]], [[new-notification-type]], [[sql-traps-core-translation]].
