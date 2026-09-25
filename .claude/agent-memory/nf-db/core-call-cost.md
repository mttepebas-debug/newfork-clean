---
name: core-call-cost
description: One app_private.authz_reason/scope_set call costs ~0.33 ms (actor() ~0.30 ms) vs ~0.04 ms for the old Schedule helper; per-row core calls in loops show up in reads
metadata:
  type: project
---

Measured 2026-09-25 on the local DB (500-call loops, manager actor): scope_set 0.36 ms, authz_reason 0.33 ms, app_private.actor 0.30 ms, old schedule_actor_can_manage_service 0.04 ms.

**Why:** actor() runs ~7 queries every call; nothing caches it inside a transaction.

**How to apply:** compute scope_set once into a variable (plpgsql) or an initplan `any ((select app_private.scope_set(...))::uuid[])` (SQL) and filter rows against it. Per-row authz_reason is only acceptable when the row count is small. Known cost after FB-6.1 .2: `schedule_availability_read_projection` asks per shift, so opening a draft's shifts (`list_schedule_weekly_shifts_service`, 60 shifts) went 13.6 -> 36.7 ms; the grid read model (`get_schedule_read_model_service`) was unaffected (12.7 -> 13.0 ms). See [[rollback-trial-runner]].
