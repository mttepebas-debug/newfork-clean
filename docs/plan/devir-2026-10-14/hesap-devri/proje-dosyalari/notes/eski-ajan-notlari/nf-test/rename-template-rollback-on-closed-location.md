---
name: rename-template-rollback-on-closed-location
description: rename_schedule_template_service can pass authorize() then still 404 and roll back, because it re-fetches with a stricter read rule than delete uses
metadata:
  type: project
---

`public.rename_schedule_template_service` and `public.delete_schedule_template_service`
(`supabase/migrations/20260926150000_one_function_per_schedule_job.sql:114-160`)
compute the SAME `target_locations` for `app_private.authorize(..., 'schedule.templates', ...)`:
the template's shift locations, minus any now-closed (`deleted_at is not null`)
ones (Q-B). For a template spanning two locations where only one is closed,
a manager of the remaining open location passes this check for BOTH actions.

But `rename_...` ends by calling `public.get_schedule_template_service(actor,
workspace, template_id)` to return the updated row — and THAT function checks
`org_wide or (cardinality(ids)>0 and ids <@ template_scope)` using the
template's FULL (unfiltered, closed-included) location set. A manager who
only reaches the still-open location fails that subset check, the function
raises `schedule template not found` (P0002), and because this happens
inside the same top-level RPC call/transaction, the rename's own UPDATE is
rolled back with it. `delete_...` has no such re-fetch (it just returns a
literal `jsonb_build_object('status','deleted',...)`), so it commits cleanly.

**Why:** verified 2026-09-26 (FB-6.1.4 screenshot task) end to end via the
real HTTP API (`PATCH`/`DELETE /schedule/templates/:id`) as a manager of one
of a template's two locations, the other closed: PATCH → 404 "schedule
template not found", DELETE → 204. Confirmed by reading the live function
bodies (`pg_get_functiondef`) — not just the migration file — since another
session was mid rollback-trial on today's migrations at the same time.

**How to apply:** this makes rename LOOK refused (404) when the authorization
rule actually allowed it and a write briefly happened before rollback. It's a
real inconsistency between the two entry points, not intended per the K-2/Q-B
rule text (which describes rename and delete as symmetric) — worth flagging
to nf-db as a bug (`get_schedule_template_service`'s subset check should
exclude closed locations the same way rename/delete's own authorize() call
does, or rename should build its return value without the stricter re-fetch).
