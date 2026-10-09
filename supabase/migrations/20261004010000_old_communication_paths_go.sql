-- FB-6.7 (part A, the removing half). Runs on hosted only after main has the
-- API and web that write important dates through the server (KARARLAR OPS-03:
-- what removes a grant or a function goes to main first).

-- 1. The old announcement helpers and the _legacy publish -------------------------------
-- Every announcement entry point asks the core now (20261004000000).
drop function public.publish_announcement_service_legacy_notifications(uuid, uuid, uuid, integer);
drop function public.cancel_announcement_service(uuid, uuid, uuid, integer);
drop function public.communication_actor_can_control_announcement_service(uuid, uuid, uuid);
drop function public.communication_actor_has_all_locations_service(uuid, uuid);
drop function public.communication_actor_has_capability_service(uuid, uuid, text, uuid);
drop function public.announcement_member_matches_jobs_service(uuid, uuid, uuid[], uuid[]);
drop function public.announcement_member_matches_locations_service(uuid, uuid, uuid);

-- 2. The browser no longer reads or writes important dates ------------------------------
-- Settings > Important dates and the Schedule read them through the API; the
-- service writes them and keeps their history (important_date_changes).
drop policy important_dates_insert_admin on public.important_dates;
drop policy important_dates_update_admin on public.important_dates;
drop policy important_dates_select_member on public.important_dates;
revoke all on public.important_dates from anon, authenticated;
drop function app_private.can_manage_important_date(uuid, uuid[]);
drop trigger important_dates_audit_trigger on public.important_dates;
drop function public.audit_important_date_change();
-- The service sets both location columns from the locations it was given.
drop trigger normalize_important_date_locations on public.important_dates;
drop function public.normalize_important_date_locations();

-- 3. BL-530: a "Closed day" important date is the closure ----------------------------------
-- Schedule's "Location is closed" came from schedule_closures, which no screen
-- ever filled, while Settings > Important dates' "Closed day" blocked nothing:
-- two systems for one thing (CLAUDE.md §9). The closures are now read from the
-- published closed days, one row per location and day, a yearly date in every
-- year from its first to two years ahead. A closed day at no location closes
-- every live location. The workspace's "closed location" conflict rule still
-- decides whether it warns or blocks. A closure for one shift type had no
-- screen and goes (ILKELER P23). Only the weeks still being planned are closed:
-- from this week's start (the Schedule's editable week,
-- schedule_current_week_start_service) on, so a date added, changed or archived
-- today never rewrites a locked past week (ILKELER P09).
-- ponytail: the view keeps the old table's name and columns, so the Schedule's
-- six readers and the API read it unchanged.
drop table public.schedule_closures;
create view public.schedule_closures
with (security_invoker = true)
as
select
  md5(date_row.id::text || ':' || location.id::text || ':' || day::date::text)::uuid as id,
  date_row.workspace_id,
  location.id as location_id,
  day::date as closed_date,
  date_row.title,
  true as is_all_day,
  date_row.created_by,
  date_row.created_at,
  '{}'::uuid[] as shift_type_ids,
  null::date as end_date
from public.important_dates date_row
join public.locations location
  on location.workspace_id = date_row.workspace_id
 -- An archived location counts nowhere (KK-86). Written on the column, not
 -- app_private.location_is_live(): the API reads this view as service_role.
 and location.archived_at is null
 and (cardinality(date_row.location_ids) = 0 or location.id = any (date_row.location_ids))
cross join lateral generate_series(
  0,
  case when date_row.recurrence = 'annual'
    then greatest(extract(year from current_date)::integer + 2 - extract(year from date_row.starts_on)::integer, 0)
    else 0 end
) as years(n)
cross join lateral (
  select public.schedule_current_week_start_service(date_row.workspace_id) as week_start
) as editable
cross join lateral generate_series(
  greatest(date_row.starts_on + make_interval(years => years.n), editable.week_start),
  date_row.ends_on + make_interval(years => years.n),
  interval '1 day'
) as days(day)
where date_row.type = 'closed_day' and date_row.status = 'published' and date_row.archived_at is null;
revoke all on public.schedule_closures from anon, authenticated;
grant select on public.schedule_closures to service_role;
-- The view runs as its reader; service_role reads a location's id and workspace
-- already, and now whether it is archived.
grant select (archived_at) on public.locations to service_role;
