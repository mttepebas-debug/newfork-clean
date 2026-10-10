-- EKRAN-08: an important date gives each of its locations its own day (Open,
-- Short hours or Closed), and the shifts it reaches are removed, opened or kept
-- one by one. Rules: KARARLAR "Important Dates çekmecesi A (Stacked)" (1)-(9)
-- and Mert's decisions of 2026-10-10 (this thread's cards):
--
--   types   a date is a Holiday or an Event; "Closed day" and "Blackout" go.
--           Closing moves to the location rows: location_days holds
--           {"<location id>": {"status": "closed"} | {"status": "short",
--           "opens": "10:00", "closes": "15:00"}}; a location left out is open.
--   all day a date is all day (the default) or runs from start_time on its
--           first day to end_time on its last. A closed location is closed for
--           that span; short hours are the location's own.
--   shifts  a published, assigned shift the change newly reaches is listed;
--           on a closed day it defaults to Remove, with short hours to Remove
--           when it lies wholly outside them and to Keep when it only runs
--           over (B12). Remove deletes it, Open shift drops its person (K13's
--           old way), Keep leaves it. Whoever lost one hears it once (K14).
--   drafts  a draft's own shifts that would default to Remove drop to open
--           quietly (K16).
--   K17     writing onto a closed span or outside short hours meets the
--           "Closed location" rule (Mert, 2026-10-10: short hours too).
--   flag    "Flag this date inside scheduling" goes: every published date is
--           on the Schedule (the approved drawer has no such switch).

-- 1. The table ------------------------------------------------------------------

alter table public.important_dates
  add column all_day boolean not null default true,
  add column start_time time,
  add column end_time time,
  add column location_days jsonb not null default '{}'::jsonb;

-- Live data is all test data (Mert, 2026-10-10): a closed day becomes a holiday
-- closed at each of its locations, a blackout an event.
update public.important_dates date_row
set location_days = coalesce((
      select jsonb_object_agg(location.id::text, jsonb_build_object('status', 'closed'))
      from public.locations location
      where location.workspace_id = date_row.workspace_id
        and (cardinality(date_row.location_ids) = 0 or location.id = any (date_row.location_ids))
        and (cardinality(date_row.location_ids) > 0 or location.archived_at is null)), '{}'::jsonb)
where date_row.type = 'closed_day';

drop view public.schedule_closures;
drop function app_private.important_date_stay_open(public.important_dates);
drop function app_private.closure_days(uuid, public.important_date_type, date, date, public.important_date_recurrence, uuid[]);
drop function app_private.important_date_closure_impact(uuid, public.important_dates, text, date, date, text, uuid[]);
drop function app_private.important_date_close_shifts(uuid, public.important_dates, jsonb, uuid[]);
drop function public.save_important_date_service(uuid, uuid, uuid, text, text, date, date, text, text, boolean, uuid[], integer, uuid[], text);
drop function public.preview_important_date_closure_service(uuid, uuid, uuid, text, date, date, text, uuid[]);
drop function public.set_important_date_state_service(uuid, uuid, uuid, text, uuid[], text);

alter table public.important_dates drop constraint important_dates_check1;
alter table public.important_dates drop column affects_scheduling;

alter type public.important_date_type rename to important_date_type_retired;
create type public.important_date_type as enum ('holiday', 'event');
alter table public.important_dates alter column type drop default;
alter table public.important_dates alter column type type public.important_date_type
  using (case type::text when 'closed_day' then 'holiday' when 'blackout' then 'event' else type::text end)::public.important_date_type;
alter table public.important_dates alter column type set default 'event';
drop type public.important_date_type_retired;

alter table public.important_dates
  add constraint important_dates_time_span check (
    (all_day and start_time is null and end_time is null)
    or (not all_day and start_time is not null and end_time is not null
        and (ends_on > starts_on or end_time > start_time))),
  add constraint important_dates_location_days_object check (jsonb_typeof(location_days) = 'object');

-- What a shift lost to a date became: opened (its person dropped) or removed.
alter table public.important_date_shift_releases
  add column outcome text not null default 'opened' check (outcome in ('opened', 'removed'));

-- 2. Days and spans --------------------------------------------------------------

-- Every (location, day) a date changes, with what it does there: 'closed'
-- (window null: the whole day; otherwise closed from window_start to
-- window_end, '24:00' the day's end) or 'short' (open only from window_start
-- to window_end). A yearly date repeats from its first year to two years
-- ahead, 29 Feb falling on 28 Feb. Only live locations of the date's reach.
create function app_private.important_date_days(item public.important_dates)
returns table (location_id uuid, on_date date, kind text, window_start time, window_end time)
language sql stable
set search_path = ''
as $$
  select location.id, span.on_day, entry.value ->> 'status',
    case when entry.value ->> 'status' = 'short' then (entry.value ->> 'opens')::time
         when span.whole then null else span.from_time end,
    case when entry.value ->> 'status' = 'short' then (entry.value ->> 'closes')::time
         when span.whole then null else span.until_time end
  from public.locations location
  join lateral jsonb_each(item.location_days) entry on entry.key = location.id::text
  cross join lateral generate_series(0, case when item.recurrence = 'annual'
    then greatest(extract(year from current_date)::integer + 2 - extract(year from item.starts_on)::integer, 0) else 0 end) as years(n)
  cross join lateral (
    select (item.starts_on + make_interval(years => years.n))::date first_day,
           (item.ends_on + make_interval(years => years.n))::date last_day) bounds
  cross join lateral generate_series(bounds.first_day, bounds.last_day, interval '1 day') as days(at)
  cross join lateral (
    select days.at::date as on_day,
      case when item.all_day or days.at::date > bounds.first_day then time '00:00' else item.start_time end as from_time,
      case when item.all_day or days.at::date < bounds.last_day then time '24:00' else item.end_time end as until_time) cut
  cross join lateral (
    select cut.on_day, cut.from_time, cut.until_time,
      cut.from_time = time '00:00' and cut.until_time = time '24:00' as whole) span
  where location.workspace_id = item.workspace_id and location.archived_at is null
    and (cardinality(item.location_ids) = 0 or location.id = any (item.location_ids))
    and entry.value ->> 'status' in ('closed', 'short')
$$;

revoke all on function app_private.important_date_days(public.important_dates) from public, anon, authenticated;
grant execute on function app_private.important_date_days(public.important_dates) to service_role;

-- Whether a day's change reaches a shift running from starts to ends (ends at
-- or before starts: past midnight). Closed: any overlap with the closed span.
-- Short hours: any part outside them.
create function app_private.closure_covers(kind text, window_start time, window_end time, starts time, ends time)
returns boolean
language sql immutable
set search_path = ''
as $$
  select case
    when kind = 'closed' and window_start is null then true
    when starts is null or ends is null then false
    when kind = 'closed' then
      m.s < extract(epoch from window_end) / 60 and extract(epoch from window_start) / 60 < m.e
    when kind = 'short' then
      m.s < extract(epoch from window_start) / 60 or m.e > extract(epoch from window_end) / 60
    else false end
  from (select extract(epoch from starts) / 60 s,
               extract(epoch from ends) / 60 + case when ends <= starts then 1440 else 0 end e) m
$$;

revoke all on function app_private.closure_covers(text, time, time, time, time) from public, anon, authenticated;
grant execute on function app_private.closure_covers(text, time, time, time, time) to service_role;

-- The Schedule's closures: every published date's changed days, the past ones
-- too (KK-97). is_all_day: closed the whole day.
create view public.schedule_closures with (security_invoker = true) as
select md5(date_row.id::text || ':' || day.location_id::text || ':' || day.on_date::text)::uuid as id,
  date_row.workspace_id, day.location_id, day.on_date as closed_date, date_row.title,
  day.kind = 'closed' and day.window_start is null as is_all_day,
  day.kind, day.window_start, day.window_end,
  date_row.created_by, date_row.created_at, date_row.id as important_date_id
from public.important_dates date_row
cross join lateral app_private.important_date_days(date_row) day
where date_row.status = 'published' and date_row.archived_at is null
  and date_row.location_days <> '{}'::jsonb;

revoke all on public.schedule_closures from public, anon, authenticated;
grant select on public.schedule_closures to service_role;

-- 3. What a change reaches -------------------------------------------------------

-- The published, assigned shifts ahead that `proposed` reaches and `stored`
-- (the date as published now, if it is) did not, each with its reason and
-- default choice; and the draft and unsaved edit shifts that drop quietly
-- (K16). The fingerprint is what the screen must have shown.
create function app_private.important_date_closure_impact(w uuid, stored public.important_dates, proposed public.important_dates)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with new_days as (
    select * from app_private.important_date_days(proposed) day
    where day.on_date >= public.schedule_current_week_start_service(w)
  ), old_days as (
    select * from app_private.important_date_days(stored) day
    where stored.id is not null and stored.status = 'published' and stored.archived_at is null
  ), reached as (
    select shift.id, shift.location_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.employee_id,
      -- Closed wins over short hours; wholly outside short hours is removed (B12).
      bool_or(day.kind = 'closed') as closed,
      bool_or(day.kind = 'short' and app_private.closure_covers('closed', day.window_start, day.window_end,
        shift.start_time, shift.end_time) is false) as wholly_outside,
      min(day.window_start) filter (where day.kind = 'short') as opens,
      max(day.window_end) filter (where day.kind = 'short') as closes
    from new_days day
    join public.schedule_published_shifts shift
      on shift.workspace_id = w and shift.location_id = day.location_id and shift.scheduled_date = day.on_date
    join public.schedule_location_publications publication on publication.id = shift.publication_id and publication.status = 'current'
    join public.locations location on location.id = shift.location_id
    where shift.employee_id is not null
      and app_private.closure_covers(day.kind, day.window_start, day.window_end, shift.start_time, shift.end_time)
      and lower(app_private.shift_time_range(shift.scheduled_date, shift.start_time, shift.end_time,
            coalesce(shift.time_timezone, location.timezone))) > now()
      and not exists (
        select 1 from old_days old
        where old.location_id = shift.location_id and old.on_date = shift.scheduled_date
          and app_private.closure_covers(old.kind, old.window_start, old.window_end, shift.start_time, shift.end_time))
    group by shift.id, shift.location_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.employee_id
  ), shifts as (
    select public.shift_exchange_shift(w, reached.id) || jsonb_build_object(
        'employee_user_id', person.user_id,
        'reason', case when reached.closed then 'closed' else 'short_hours' end,
        'opens', case when not reached.closed then to_char(reached.opens, 'HH24:MI') end,
        'closes', case when not reached.closed then to_char(reached.closes, 'HH24:MI') end,
        'default_choice', case when reached.closed or reached.wholly_outside then 'remove' else 'keep' end) as x
    from reached
    left join public.employee_profiles person on person.id = reached.employee_id and person.workspace_id = w
  ), dropping_days as (
    -- K16 follows the default: what would be removed drops to open in a draft.
    select day.* from new_days day
    where not exists (
      select 1 from old_days old
      where old.location_id = day.location_id and old.on_date = day.on_date
        and old.kind = day.kind and old.window_start is not distinct from day.window_start
        and old.window_end is not distinct from day.window_end)
  )
  select jsonb_build_object(
    'fingerprint', md5(coalesce((select string_agg(concat_ws('|', x ->> 'id', x ->> 'employee_id', x ->> 'starts_at',
      x ->> 'ends_at', x ->> 'default_choice'), ',' order by x ->> 'id') from shifts), '')),
    'shifts', coalesce((select jsonb_agg(x order by x ->> 'starts_at', x ->> 'location_name', x ->> 'id') from shifts), '[]'::jsonb),
    -- A copy of a published shift follows that shift instead; one id for a
    -- shift that is in both a draft and an open edit.
    'draft_shift_ids', coalesce((
      select jsonb_agg(distinct dropping.id) from (
        select draft_shift.id
        from dropping_days day
        join public.schedule_draft_shifts draft_shift
          on draft_shift.workspace_id = w and draft_shift.location_id = day.location_id
         and draft_shift.scheduled_date = day.on_date and draft_shift.employee_id is not null
        join public.schedule_drafts draft on draft.id = draft_shift.draft_id and draft.archived_at is null
        where ((day.kind = 'closed' and app_private.closure_covers('closed', day.window_start, day.window_end,
                  draft_shift.start_time, draft_shift.end_time))
            or (day.kind = 'short' and not app_private.closure_covers('closed', day.window_start, day.window_end,
                  draft_shift.start_time, draft_shift.end_time)))
          and not exists (
          select 1 from public.schedule_published_shifts published
          join public.schedule_location_publications publication
            on publication.id = published.publication_id and publication.status = 'current'
          where published.workspace_id = w and coalesce(published.source_shift_id, published.id) = draft_shift.id)
        union
        select edit_shift.id
        from dropping_days day
        join public.schedule_edit_session_shifts edit_shift
          on edit_shift.workspace_id = w and edit_shift.location_id = day.location_id
         and edit_shift.scheduled_date = day.on_date and edit_shift.employee_id is not null
         and edit_shift.source_published_shift_id is null and edit_shift.pending_op_type is distinct from 'delete'
        join public.schedule_edit_sessions edit on edit.id = edit_shift.session_id and edit.status = 'active'
        where ((day.kind = 'closed' and app_private.closure_covers('closed', day.window_start, day.window_end,
                  edit_shift.start_time, edit_shift.end_time))
            or (day.kind = 'short' and not app_private.closure_covers('closed', day.window_start, day.window_end,
                  edit_shift.start_time, edit_shift.end_time)))
          and not exists (
            select 1 from public.schedule_published_shifts published
            join public.schedule_location_publications publication
              on publication.id = published.publication_id and publication.status = 'current'
            where published.workspace_id = w and coalesce(published.source_shift_id, published.id) = edit_shift.id)
      ) dropping), '[]'::jsonb))
$$;

revoke all on function app_private.important_date_closure_impact(uuid, public.important_dates, public.important_dates) from public, anon, authenticated;
grant execute on function app_private.important_date_closure_impact(uuid, public.important_dates, public.important_dates) to service_role;

-- Carries out the screen's choices (shift id -> remove | open | keep; a shift
-- left out takes its default). Returns {opened: [...], removed: [...]}.
create function app_private.important_date_close_shifts(actor uuid, item public.important_dates, impact jsonb, choices jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  s jsonb;
  listed jsonb := coalesce(impact -> 'shifts', '[]'::jsonb);
  opened jsonb;
  removed jsonb;
  drafts uuid[] := array(select value::uuid from jsonb_array_elements_text(impact -> 'draft_shift_ids'));
  places uuid[];
  other record;
begin
  choices := coalesce(choices, '{}'::jsonb);
  if jsonb_typeof(choices) <> 'object'
     or exists (select 1 from jsonb_each_text(choices) c where c.value not in ('remove', 'open', 'keep'))
     or exists (select 1 from jsonb_object_keys(choices) k
                where not exists (select 1 from jsonb_array_elements(listed) x where x ->> 'id' = k)) then
    raise exception 'Review the shifts on this date again.' using errcode = 'PT409', hint = 'important_date.closure_changed';
  end if;
  opened := coalesce((select jsonb_agg(x) from jsonb_array_elements(listed) x
                      where coalesce(choices ->> (x ->> 'id'), x ->> 'default_choice') = 'open'), '[]'::jsonb);
  removed := coalesce((select jsonb_agg(x) from jsonb_array_elements(listed) x
                       where coalesce(choices ->> (x ->> 'id'), x ->> 'default_choice') = 'remove'), '[]'::jsonb);
  places := array(
    select distinct (x ->> 'location_id')::uuid from jsonb_array_elements(opened || removed) x
    union select draft_shift.location_id from public.schedule_draft_shifts draft_shift where draft_shift.id = any (drafts)
    union select edit_shift.location_id from public.schedule_edit_session_shifts edit_shift
          where edit_shift.workspace_id = item.workspace_id and edit_shift.id = any (drafts));
  if cardinality(places) = 0 then
    return jsonb_build_object('opened', '[]'::jsonb, 'removed', '[]'::jsonb);
  end if;
  perform app_private.authorize(actor, item.workspace_id, 'schedule.edit', target_locations => places);

  for s in select x from jsonb_array_elements(opened) x loop
    insert into public.important_date_shift_releases (workspace_id, important_date_id, published_shift_id, source_shift_id,
      before_assignment, actor_user_id, outcome)
    values (item.workspace_id, item.id, (s ->> 'id')::uuid, (s ->> 'source_id')::uuid, s, actor, 'opened');
    update public.schedule_published_shifts set employee_id = null
    where workspace_id = item.workspace_id and id = (s ->> 'id')::uuid and employee_id = (s ->> 'employee_id')::uuid;
    if not found then
      raise exception 'A shift on this date changed. Review the shifts again.'
        using errcode = 'PT409', hint = 'important_date.closure_changed';
    end if;
  end loop;

  for s in select x from jsonb_array_elements(removed) x loop
    -- A shift another record still points at (offboarding, time off) can only be opened or kept.
    if exists (select 1 from public.employee_offboarding_followups f where f.workspace_id = item.workspace_id and f.shift_id = (s ->> 'id')::uuid)
       or exists (select 1 from public.employee_offboarding_shift_actions a where a.workspace_id = item.workspace_id and a.shift_id = (s ->> 'id')::uuid)
       or exists (select 1 from public.time_off_assignment_releases r where r.workspace_id = item.workspace_id and r.published_shift_id = (s ->> 'id')::uuid) then
      raise exception 'A shift on this date is tied to another record. Choose Open shift or Keep for it.'
        using errcode = 'PT409', hint = 'important_date.shift_tied';
    end if;
    insert into public.important_date_shift_releases (workspace_id, important_date_id, published_shift_id, source_shift_id,
      before_assignment, actor_user_id, outcome)
    values (item.workspace_id, item.id, (s ->> 'id')::uuid, (s ->> 'source_id')::uuid, s, actor, 'removed');
    delete from public.schedule_published_shifts
    where workspace_id = item.workspace_id and id = (s ->> 'id')::uuid and employee_id = (s ->> 'employee_id')::uuid;
    if not found then
      raise exception 'A shift on this date changed. Review the shifts again.'
        using errcode = 'PT409', hint = 'important_date.closure_changed';
    end if;
    -- Its copies in a draft and an open edit go with it, or the next publish would bring it back.
    with gone as (
      delete from public.schedule_draft_shifts d
      where d.workspace_id = item.workspace_id and d.id in ((s ->> 'source_id')::uuid, (s ->> 'id')::uuid)
        and public.shift_exchange_edit_matches(to_jsonb(d), s)
      returning d.draft_id
    )
    update public.schedule_drafts set revision = revision + 1, updated_at = now() where id in (select draft_id from gone);
    with gone as (
      delete from public.schedule_edit_session_shifts d
      where d.workspace_id = item.workspace_id
        and (d.id in ((s ->> 'source_id')::uuid, (s ->> 'id')::uuid) or d.source_published_shift_id = (s ->> 'id')::uuid)
        and public.shift_exchange_edit_matches(to_jsonb(d), s) and d.pending_op_type is null
      returning d.session_id
    )
    update public.schedule_edit_sessions set revision = revision + 1 where id in (select session_id from gone);
  end loop;

  with dropped as (
    update public.schedule_draft_shifts draft_shift
    set employee_id = null, revision = draft_shift.revision + 1, updated_at = now()
    where draft_shift.id = any (drafts) and draft_shift.employee_id is not null
    returning draft_shift.draft_id
  )
  update public.schedule_drafts set revision = revision + 1, updated_at = now()
  where id in (select draft_id from dropped);

  -- BL-545: the same shift in an open edit drops too; the edit's revision moves
  -- so the open screen reloads it (as shift_exchange_rebase_drafts does).
  with dropped_edit as (
    update public.schedule_edit_session_shifts edit_shift
    set employee_id = null, revision = edit_shift.revision + 1, updated_at = now()
    where edit_shift.workspace_id = item.workspace_id and edit_shift.id = any (drafts)
      and edit_shift.employee_id is not null and edit_shift.source_published_shift_id is null
      and edit_shift.pending_op_type is distinct from 'delete'
      and exists (select 1 from public.schedule_edit_sessions edit where edit.id = edit_shift.session_id and edit.status = 'active')
    returning edit_shift.session_id
  )
  update public.schedule_edit_sessions set revision = revision + 1
  where id in (select session_id from dropped_edit);
  -- DB-1c: Undo does not take the date back.
  perform app_private.schedule_edit_undo_barrier();

  if jsonb_array_length(opened) > 0 then
    perform public.shift_exchange_reconcile_batch(actor, item.workspace_id,
      (select jsonb_agg(x || jsonb_build_object('new_employee_id', null)) from jsonb_array_elements(opened) x));
  end if;
  if jsonb_array_length(opened || removed) > 0 then
    -- ponytail: the same steps approved time off takes (time_off_release_shifts).
    for other in
      select c.id from public.shift_exchange_cases c
      where c.workspace_id = item.workspace_id and c.status = 'open'
        and exists (select 1 from jsonb_array_elements(opened || removed) x
                    where (x ->> 'source_id')::uuid in (c.offered_source_id, c.requested_source_id))
    loop
      update public.shift_exchange_cases set status = 'invalidated', revision = revision + 1, updated_at = now() where id = other.id;
      update public.shift_exchange_applications set status = 'invalidated', updated_at = now()
      where case_id = other.id and status in ('invited', 'pending_manager');
      perform public.shift_exchange_emit(actor, item.workspace_id, other.id, null, 'invalidated',
        'An involved assignment was changed by an important date. Review the current schedule.');
    end loop;
    perform realtime.send(jsonb_build_object('workspace_id', item.workspace_id, 'important_date_id', item.id),
      'changed', 'shift-exchanges:' || item.workspace_id::text, true);
  end if;
  return jsonb_build_object('opened', opened, 'removed', removed);
end;
$$;

revoke all on function app_private.important_date_close_shifts(uuid, public.important_dates, jsonb, jsonb) from public, anon, authenticated;

-- K15: of the shifts a date opened, how many are still open and ahead.
create function app_private.important_date_stay_open(item public.important_dates)
returns integer
language sql stable security definer
set search_path = ''
as $$
  select count(distinct shift.id)::integer
  from public.important_date_shift_releases released
  join public.schedule_published_shifts shift
    on shift.workspace_id = released.workspace_id and coalesce(shift.source_shift_id, shift.id) = released.source_shift_id
  join public.schedule_location_publications publication on publication.id = shift.publication_id and publication.status = 'current'
  join public.locations location on location.id = shift.location_id
  where released.important_date_id = item.id and released.workspace_id = item.workspace_id
    and released.outcome = 'opened' and shift.employee_id is null
    and lower(app_private.shift_time_range(shift.scheduled_date, shift.start_time, shift.end_time,
          coalesce(shift.time_timezone, location.timezone))) > now()
    and not exists (
      select 1 from app_private.important_date_days(item) day
      where item.status = 'published' and item.archived_at is null
        and day.location_id = shift.location_id and day.on_date = shift.scheduled_date
        and app_private.closure_covers(day.kind, day.window_start, day.window_end, shift.start_time, shift.end_time))
$$;

revoke all on function app_private.important_date_stay_open(public.important_dates) from public, anon, authenticated;

-- K14: who lost a shift hears it once, with why: closed, or short hours.
create or replace function app_private.important_date_tell_removed(item public.important_dates, opened jsonb)
returns uuid[]
language plpgsql security definer
set search_path = ''
as $$
declare
  fmt text := case when (select s.time_format from public.workspace_scheduling_settings s
                         where s.workspace_id = item.workspace_id) = '24h' then 'HH24:MI' else 'FMHH12:MI AM' end;
  person record;
  event_id uuid;
  told uuid[] := '{}';
begin
  for person in
    select (x ->> 'employee_user_id')::uuid who,
      (array_agg(x ->> 'location_name' order by x ->> 'starts_at'))[1] first_place,
      (array_agg(x ->> 'reason' order by x ->> 'starts_at'))[1] first_reason,
      min((x ->> 'scheduled_date')::date) first_day,
      array_agg(to_char((x ->> 'scheduled_date')::date, 'Dy, Mon FMDD') || ', '
        || to_char((x ->> 'start_time')::time, fmt) || '–' || to_char((x ->> 'end_time')::time, fmt)
        || ' (' || (x ->> 'location_name') || ')' order by x ->> 'starts_at') lines
    from jsonb_array_elements(opened) x
    where x ->> 'employee_user_id' is not null and (x ->> 'employee_user_id')::uuid is distinct from item.created_by
    group by 1
  loop
    perform app_private.communication_withdraw(item.workspace_id, 'schedule.important_date.available',
      'important_date', item.id::text, 'superseded', array[person.who]);
    event_id := gen_random_uuid();
    perform public.enqueue_notification_outbox_service(
      item.workspace_id, event_id, 'schedule.important_date.available', 1, item.updated_by,
      'important_date', item.id::text,
      jsonb_build_object(
        'correlation_id', event_id,
        'important_date_id', item.id,
        'content_revision', item.content_revision,
        'location_ids', to_jsonb(item.location_ids),
        'recipient_user_ids', jsonb_build_array(person.who),
        'audience_contract', 'important_date_targeted_members',
        'category', 'schedule',
        'title', left(person.first_place
          || case when person.first_reason = 'short_hours' then ' has short hours on ' else ' is closed on ' end
          || to_char(person.first_day, 'Mon FMDD') || ' — your shift was removed', 160),
        'body', left(array_to_string(person.lines, '; '), 2000),
        'safe_preview', 'An important date removed your shift.',
        'action_url', '/app/schedule?date=' || person.first_day::text,
        'group_key', 'important_date:' || item.id::text,
        'visible_at', now()),
      now());
    told := told || person.who;
  end loop;
  return told;
end;
$$;

-- 4. Snapshots and the past ------------------------------------------------------

create or replace function app_private.important_date_snapshot(item public.important_dates)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object('title', item.title, 'type', item.type, 'starts_on', item.starts_on, 'ends_on', item.ends_on,
    'recurrence', item.recurrence, 'note', item.note, 'all_day', item.all_day,
    'start_time', to_char(item.start_time, 'HH24:MI'), 'end_time', to_char(item.end_time, 'HH24:MI'),
    'location_ids', to_jsonb(item.location_ids), 'location_days', item.location_days,
    'status', item.status, 'archived_at', item.archived_at)
$$;

create or replace function app_private.important_date_keep_past(item public.important_dates, line date)
returns public.important_dates
language plpgsql security definer
set search_path = ''
as $$
declare
  kept public.important_dates := item;
  ahead integer;
  n integer;
begin
  if item.recurrence = 'none' then
    if item.starts_on >= line then
      return item;
    end if;
    -- The past part ends the day before the line: a timed end no longer applies.
    insert into public.important_dates (workspace_id, title, type, starts_on, ends_on, recurrence, note,
      all_day, start_time, end_time, location_days,
      location_ids, location_id, created_by, updated_by, status, archived_at, created_at, content_revision)
    values (item.workspace_id, item.title, item.type, item.starts_on, line - 1, 'none', item.note,
      item.all_day, item.start_time, case when not item.all_day then time '24:00' end, item.location_days,
      item.location_ids, item.location_id, item.created_by, item.updated_by, item.status,
      item.archived_at, item.created_at, item.content_revision);
    update public.important_dates
    set starts_on = line,
        start_time = case when not item.all_day then time '00:00' end
    where id = item.id returning * into kept;
    return kept;
  end if;
  ahead := (select min(k) from generate_series(0, extract(year from line)::integer - extract(year from item.starts_on)::integer + 1) k
            where (item.starts_on + make_interval(years => k))::date >= line);
  if ahead = 0 then
    return item;
  end if;
  for n in 0 .. ahead - 1 loop
    insert into public.important_dates (workspace_id, title, type, starts_on, ends_on, recurrence, note,
      all_day, start_time, end_time, location_days,
      location_ids, location_id, created_by, updated_by, status, archived_at, created_at, content_revision)
    values (item.workspace_id, item.title, item.type, (item.starts_on + make_interval(years => n))::date,
      (item.ends_on + make_interval(years => n))::date, 'none', item.note,
      item.all_day, item.start_time, item.end_time, item.location_days,
      item.location_ids, item.location_id, item.created_by, item.updated_by, item.status,
      item.archived_at, item.created_at, item.content_revision);
  end loop;
  update public.important_dates
  set starts_on = (item.starts_on + make_interval(years => ahead))::date,
      ends_on = (item.ends_on + make_interval(years => ahead))::date
  where id = item.id returning * into kept;
  return kept;
end;
$$;

-- 5. The doors -------------------------------------------------------------------

-- A date's per-location days, checked: each key a location of its reach (a
-- live one, or one it already had), each value closed or short hours with
-- opens before closes. Returned with keys in a stable order.
create function app_private.important_date_location_days(w uuid, location_ids uuid[], days jsonb, kept jsonb)
returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  entry record;
begin
  days := coalesce(days, '{}'::jsonb);
  if jsonb_typeof(days) <> 'object' then
    raise exception 'valid location days required' using errcode = '22023';
  end if;
  for entry in select key, value from jsonb_each(days) loop
    if entry.key !~ '^[0-9a-f-]{36}$'
       or (cardinality(location_ids) > 0 and not entry.key::uuid = any (location_ids))
       or not exists (select 1 from public.locations location where location.id = entry.key::uuid and location.workspace_id = w
                      and (location.archived_at is null or coalesce(kept, '{}'::jsonb) ? entry.key))
       or jsonb_typeof(entry.value) <> 'object'
       or entry.value ->> 'status' not in ('closed', 'short')
       or (entry.value ->> 'status' = 'closed' and (entry.value - 'status') <> '{}'::jsonb)
       or (entry.value ->> 'status' = 'short' and (
            (entry.value - array['status', 'opens', 'closes']) <> '{}'::jsonb
            or coalesce(entry.value ->> 'opens', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            or coalesce(entry.value ->> 'closes', '') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
            or (entry.value ->> 'opens')::time >= (entry.value ->> 'closes')::time)) then
      raise exception 'valid location days required' using errcode = '22023';
    end if;
  end loop;
  return days;
end;
$$;

revoke all on function app_private.important_date_location_days(uuid, uuid[], jsonb, jsonb) from public, anon, authenticated;

create function public.save_important_date_service(
  actor_user_id uuid, target_workspace_id uuid, target_important_date_id uuid, target_title text, target_type text,
  target_starts_on date, target_ends_on date, target_recurrence text, target_note text, target_location_ids uuid[],
  target_expected_revision integer, target_all_day boolean, target_start_time time, target_end_time time,
  target_location_days jsonb, target_shift_choices jsonb default '{}'::jsonb, target_expected_fingerprint text default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  item public.important_dates;
  before public.important_dates;
  proposed public.important_dates;
  line date := public.schedule_current_week_start_service(target_workspace_id);
  content_changed boolean := true;
  untouched boolean := false;
  was public.important_dates;
  ahead integer;
  impact jsonb;
  outcome jsonb := jsonb_build_object('opened', '[]'::jsonb, 'removed', '[]'::jsonb);
  removed uuid[] := '{}';
  reached uuid[];
  told uuid[];
  dropped uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.important_dates.read');
  target_location_ids := array(select distinct id from unnest(coalesce(target_location_ids, '{}')) id order by id);
  if target_important_date_id is null then
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'important_date', target_location_ids, actor_user_id);
  else
    select * into before from public.important_dates
    where id = target_important_date_id and workspace_id = target_workspace_id for update;
    if before.id is null or not app_private.important_date_visible(actor_user_id, before) then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'important_date.write';
    end if;
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'important_date', before.location_ids, before.created_by, before.location_ids);
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'important_date', target_location_ids, before.created_by, before.location_ids);
    if before.archived_at is not null then
      raise exception 'Restore this date before you edit it' using errcode = 'PT409';
    end if;
    if before.revision is distinct from target_expected_revision then
      raise exception 'This date changed. Reload and try again.' using errcode = 'PT409';
    end if;
    -- The same as an announcement's (KK-86).
    if cardinality(target_location_ids) = 0
       and cardinality(before.location_ids) > cardinality(app_private.live_locations(target_workspace_id, before.location_ids)) then
      raise exception 'Choose at least one location' using errcode = '22023';
    end if;
  end if;

  if cardinality(target_location_ids) > 100 then
    raise exception 'too many locations' using errcode = '22023';
  end if;
  target_all_day := coalesce(target_all_day, true);
  if char_length(btrim(coalesce(target_title, ''))) not between 1 and 120 or char_length(coalesce(target_note, '')) > 500
     or target_type not in ('holiday', 'event') or target_recurrence not in ('none', 'annual')
     or target_starts_on is null or target_ends_on is null or target_ends_on < target_starts_on
     or (target_all_day and (target_start_time is not null or target_end_time is not null))
     or (not target_all_day and (target_start_time is null or target_end_time is null
         or (target_ends_on = target_starts_on and target_end_time <= target_start_time))) then
    raise exception 'valid important date required' using errcode = '22023';
  end if;
  target_location_days := app_private.important_date_location_days(target_workspace_id, target_location_ids,
    target_location_days, before.location_days);

  -- K11. A save that changes nothing touches nothing.
  if before.id is not null then
    untouched := (before.title, before.type::text, before.starts_on, before.ends_on, before.recurrence::text, before.note,
      before.all_day, before.start_time, before.end_time, before.location_days, before.location_ids)
      is not distinct from (btrim(target_title), target_type, target_starts_on, target_ends_on, target_recurrence,
      coalesce(target_note, ''), target_all_day, target_start_time, target_end_time, target_location_days, target_location_ids);
    if not untouched and app_private.important_date_is_past(before, line) then
      perform app_private.important_date_refuse_past();
    end if;
  end if;
  if not untouched then
    if target_recurrence = 'annual' and target_starts_on < line then
      -- A yearly date given a past year starts with its next day from the line on.
      ahead := (select min(k) from generate_series(1, extract(year from line)::integer - extract(year from target_starts_on)::integer + 1) k
                where (target_starts_on + make_interval(years => k))::date >= line);
      target_ends_on := (target_ends_on + make_interval(years => ahead))::date;
      target_starts_on := (target_starts_on + make_interval(years => ahead))::date;
    elsif target_starts_on < line then
      -- The past days of a date that began before the line stay its own; its
      -- unchanged start is not a change.
      if before.id is null or before.recurrence <> 'none' or target_starts_on <> before.starts_on or target_ends_on < line then
        perform app_private.important_date_refuse_past();
      end if;
      target_starts_on := line;
      if not target_all_day then
        target_start_time := time '00:00';
      end if;
    end if;
  end if;

  -- What a published date would newly reach.
  if before.id is null or before.status = 'published' then
    proposed := before;
    proposed.workspace_id := target_workspace_id;
    proposed.starts_on := target_starts_on;
    proposed.ends_on := target_ends_on;
    proposed.recurrence := target_recurrence::public.important_date_recurrence;
    proposed.all_day := target_all_day;
    proposed.start_time := target_start_time;
    proposed.end_time := target_end_time;
    proposed.location_ids := target_location_ids;
    proposed.location_days := target_location_days;
    impact := app_private.important_date_closure_impact(target_workspace_id, before, proposed);
    if jsonb_array_length(impact -> 'shifts') > 0
       and target_expected_fingerprint is distinct from impact ->> 'fingerprint' then
      raise exception 'Review the shifts on this date again.' using errcode = 'PT409', hint = 'important_date.closure_changed';
    end if;
  end if;

  if before.id is not null and not untouched then
    -- The history keeps the version as it was, not the part left ahead.
    was := before;
    before := app_private.important_date_keep_past(before, line);
  end if;

  if target_important_date_id is null then
    insert into public.important_dates (workspace_id, title, type, starts_on, ends_on, recurrence, note,
      all_day, start_time, end_time, location_days, location_ids, location_id, created_by, updated_by)
    values (target_workspace_id, btrim(target_title), target_type::public.important_date_type, target_starts_on,
      target_ends_on, target_recurrence::public.important_date_recurrence, coalesce(target_note, ''),
      target_all_day, target_start_time, target_end_time, target_location_days, target_location_ids,
      case when cardinality(target_location_ids) = 1 then target_location_ids[1] end, actor_user_id, actor_user_id)
    returning * into item;
  else
    content_changed := (before.title, before.type::text, before.starts_on, before.ends_on, before.recurrence::text,
      before.note, before.all_day, before.start_time, before.end_time, before.location_days)
      is distinct from (btrim(target_title), target_type, target_starts_on, target_ends_on, target_recurrence,
      coalesce(target_note, ''), target_all_day, target_start_time, target_end_time, target_location_days);
    update public.important_dates
    set title = btrim(target_title), type = target_type::public.important_date_type, starts_on = target_starts_on,
        ends_on = target_ends_on, recurrence = target_recurrence::public.important_date_recurrence,
        note = coalesce(target_note, ''), all_day = target_all_day, start_time = target_start_time,
        end_time = target_end_time, location_days = target_location_days,
        location_ids = target_location_ids,
        location_id = case when cardinality(target_location_ids) = 1 then target_location_ids[1] end,
        content_revision = content_revision + case when content_changed then 1 else 0 end,
        revision = revision + 1, updated_by = actor_user_id, updated_at = now()
    where id = before.id
    returning * into item;
  end if;

  if impact is not null then
    outcome := app_private.important_date_close_shifts(actor_user_id, item, impact, target_shift_choices);
  end if;

  if item.status = 'published' then
    -- Everybody it is for, and those told now: not where it is already over.
    reached := app_private.important_date_recipients(item);
    told := app_private.important_date_notified(item);
    if content_changed and before.id is not null then
      perform app_private.communication_withdraw(target_workspace_id, 'schedule.important_date.available',
        'important_date', item.id::text, 'superseded');
    end if;
    -- K14: who lost a shift hears it in its own notice, not in the common one.
    removed := app_private.important_date_tell_removed(item, (outcome -> 'opened') || (outcome -> 'removed'));
    if content_changed then
      perform app_private.important_date_deliver(item, array(select who from unnest(told) who where not who = any (removed)));
    else
      -- Those it no longer reaches lose it (BL-534); the new people are told.
      dropped := array(select who from unnest(item.delivered_to) who where not who = any (reached) and not who = any (removed));
      if cardinality(dropped) > 0 then
        perform app_private.communication_withdraw(target_workspace_id, 'schedule.important_date.available',
          'important_date', item.id::text, 'cancelled', dropped);
      end if;
      perform app_private.important_date_deliver(item,
        array(select who from unnest(told) who where not who = any (item.delivered_to) and not who = any (removed)));
      told := array(select distinct who from unnest(told || array(
        select who from unnest(item.delivered_to) who where who = any (reached))) who);
    end if;
    update public.important_dates set delivered_to = array(select distinct who from unnest(told || removed) who)
    where id = item.id returning * into item;
  end if;

  insert into public.important_date_changes (workspace_id, important_date_id, actor_user_id, action, before, after)
  values (target_workspace_id, item.id, actor_user_id,
    case when before.id is null then 'created' else 'updated' end,
    case when before.id is null then null else app_private.important_date_snapshot(coalesce(was, before)) end,
    app_private.important_date_snapshot(item));
  return jsonb_build_object('important_date_id', item.id, 'status', item.status, 'revision', item.revision,
    'recipient_count', cardinality(item.delivered_to),
    'shifts_opened', jsonb_array_length(outcome -> 'opened'),
    'shifts_removed', jsonb_array_length(outcome -> 'removed'),
    'draft_shifts_opened', coalesce(jsonb_array_length(impact -> 'draft_shift_ids'), 0),
    'shifts_stay_open', case when before.id is null then 0 else app_private.important_date_stay_open(item) end);
end;
$$;

revoke all on function public.save_important_date_service(uuid, uuid, uuid, text, text, date, date, text, text, uuid[], integer,
  boolean, time, time, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.save_important_date_service(uuid, uuid, uuid, text, text, date, date, text, text, uuid[], integer,
  boolean, time, time, jsonb, jsonb, text) to service_role;

-- The list the Shifts tab shows for a date not yet saved: the shifts it would
-- newly reach at the locations the reader schedules, how many more it reaches
-- elsewhere, and how many draft shifts drop quietly.
create function public.preview_important_date_closure_service(
  actor_user_id uuid, target_workspace_id uuid, target_important_date_id uuid, target_starts_on date, target_ends_on date,
  target_recurrence text, target_location_ids uuid[], target_all_day boolean, target_start_time time, target_end_time time,
  target_location_days jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  stored public.important_dates;
  proposed public.important_dates;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.important_dates.read');
  target_location_ids := array(select distinct id from unnest(coalesce(target_location_ids, '{}')) id order by id);
  if target_important_date_id is null then
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'important_date', target_location_ids, actor_user_id);
  else
    select * into stored from public.important_dates
    where id = target_important_date_id and workspace_id = target_workspace_id;
    if stored.id is null or not app_private.important_date_visible(actor_user_id, stored) then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'important_date.write';
    end if;
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'important_date', stored.location_ids, stored.created_by, stored.location_ids);
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'important_date', target_location_ids, stored.created_by, stored.location_ids);
  end if;
  target_all_day := coalesce(target_all_day, true);
  if target_recurrence not in ('none', 'annual')
     or target_starts_on is null or target_ends_on is null or target_ends_on < target_starts_on
     or (target_all_day and (target_start_time is not null or target_end_time is not null))
     or (not target_all_day and (target_start_time is null or target_end_time is null
         or (target_ends_on = target_starts_on and target_end_time <= target_start_time))) then
    raise exception 'valid important date required' using errcode = '22023';
  end if;
  proposed := stored;
  proposed.workspace_id := target_workspace_id;
  proposed.starts_on := target_starts_on;
  proposed.ends_on := target_ends_on;
  proposed.recurrence := target_recurrence::public.important_date_recurrence;
  proposed.all_day := target_all_day;
  proposed.start_time := target_start_time;
  proposed.end_time := target_end_time;
  proposed.location_ids := target_location_ids;
  proposed.location_days := app_private.important_date_location_days(target_workspace_id, target_location_ids,
    target_location_days, stored.location_days);
  return (
    select jsonb_build_object(
      'fingerprint', impact ->> 'fingerprint',
      'shifts', coalesce((select jsonb_agg(x order by ord) from jsonb_array_elements(impact -> 'shifts') with ordinality listed(x, ord)
                          where (x ->> 'location_id')::uuid = any (reach)), '[]'::jsonb),
      'hidden_shift_count', (select count(*) from jsonb_array_elements(impact -> 'shifts') x
                             where not (x ->> 'location_id')::uuid = any (reach)),
      'draft_shift_count', jsonb_array_length(impact -> 'draft_shift_ids'))
    from app_private.important_date_closure_impact(target_workspace_id, stored, proposed) impact,
      lateral (select app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.read') reach) scope);
end;
$$;

revoke all on function public.preview_important_date_closure_service(uuid, uuid, uuid, date, date, text, uuid[], boolean, time, time, jsonb)
  from public, anon, authenticated;
grant execute on function public.preview_important_date_closure_service(uuid, uuid, uuid, date, date, text, uuid[], boolean, time, time, jsonb)
  to service_role;

create function public.set_important_date_state_service(
  actor_user_id uuid, target_workspace_id uuid, target_important_date_id uuid, target_action text,
  target_shift_choices jsonb default '{}'::jsonb, target_expected_fingerprint text default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  item public.important_dates;
  before public.important_dates;
  line date := public.schedule_current_week_start_service(target_workspace_id);
  was public.important_dates;
  impact jsonb;
  outcome jsonb := jsonb_build_object('opened', '[]'::jsonb, 'removed', '[]'::jsonb);
  removed uuid[] := '{}';
  reached uuid[];
  opened_notice uuid[];
  told uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.important_dates.read');
  select * into before from public.important_dates
  where id = target_important_date_id and workspace_id = target_workspace_id for update;
  if before.id is null or not app_private.important_date_visible(actor_user_id, before) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'important_date.write';
  end if;
  perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'important_date', before.location_ids, before.created_by, before.location_ids);
  if target_action not in ('unpublish', 'republish', 'archive', 'restore') then
    raise exception 'valid important date action required' using errcode = '22023';
  end if;
  if app_private.important_date_is_past(before, line) then
    perform app_private.important_date_refuse_past();
  end if;
  if (target_action = 'unpublish' and (before.archived_at is not null or before.status <> 'published'))
     or (target_action = 'republish' and (before.archived_at is not null or before.status <> 'unpublished'))
     or (target_action = 'archive' and before.archived_at is not null)
     or (target_action = 'restore' and before.archived_at is null) then
    raise exception 'This date changed. Reload and try again.' using errcode = 'PT409';
  end if;

  if target_action = 'republish' then
    impact := app_private.important_date_closure_impact(target_workspace_id, null::public.important_dates, before);
    if jsonb_array_length(impact -> 'shifts') > 0
       and target_expected_fingerprint is distinct from impact ->> 'fingerprint' then
      raise exception 'Review the shifts on this date again.' using errcode = 'PT409', hint = 'important_date.closure_changed';
    end if;
  end if;

  was := before;
  before := app_private.important_date_keep_past(before, line);
  if target_action in ('unpublish', 'archive') then
    perform app_private.communication_withdraw(target_workspace_id, 'schedule.important_date.available',
      'important_date', before.id::text, 'cancelled');
  end if;
  update public.important_dates
  set status = case when target_action in ('unpublish', 'restore') then 'unpublished'
                    when target_action = 'republish' then 'published' else status end,
      archived_at = case target_action when 'archive' then now() when 'restore' then null else archived_at end,
      revision = revision + 1, updated_by = actor_user_id, updated_at = now()
  where id = before.id
  returning * into item;

  if target_action = 'republish' then
    outcome := app_private.important_date_close_shifts(actor_user_id, item, impact, target_shift_choices);
    removed := app_private.important_date_tell_removed(item, (outcome -> 'opened') || (outcome -> 'removed'));
    reached := app_private.important_date_recipients(item);
    -- Who opened the current content already is not told again (K7).
    opened_notice := array(
      select who from unnest(reached) who
      where exists (
        select 1 from public.notification_outbox outbox
        join public.notification_recipients recipient
          on recipient.workspace_id = outbox.workspace_id and recipient.event_id = outbox.event_id
        join public.notification_inbox_items inbox on inbox.recipient_projection_id = recipient.id
        where outbox.workspace_id = item.workspace_id and outbox.type_key = 'schedule.important_date.available'
          and outbox.subject_type = 'important_date' and outbox.subject_id = item.id::text
          and outbox.payload ->> 'content_revision' = item.content_revision::text
          and recipient.recipient_user_id = who and inbox.read_at is not null));
    told := array(select who from unnest(app_private.important_date_notified(item)) who
                  where not who = any (opened_notice) and not who = any (removed));
    perform app_private.important_date_deliver(item, told);
    update public.important_dates set delivered_to = array(select distinct who from unnest(told || opened_notice || removed) who)
    where id = item.id returning * into item;
  end if;

  insert into public.important_date_changes (workspace_id, important_date_id, actor_user_id, action, before, after)
  values (target_workspace_id, item.id, actor_user_id,
    case target_action when 'unpublish' then 'unpublished' when 'republish' then 'republished'
      when 'archive' then 'archived' else 'restored' end,
    app_private.important_date_snapshot(was), app_private.important_date_snapshot(item));
  return jsonb_build_object('important_date_id', item.id, 'status', item.status, 'revision', item.revision,
    'archived_at', item.archived_at,
    'shifts_opened', jsonb_array_length(outcome -> 'opened'),
    'shifts_removed', jsonb_array_length(outcome -> 'removed'),
    'draft_shifts_opened', coalesce(jsonb_array_length(impact -> 'draft_shift_ids'), 0),
    'shifts_stay_open', app_private.important_date_stay_open(item));
end;
$$;

revoke all on function public.set_important_date_state_service(uuid, uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.set_important_date_state_service(uuid, uuid, uuid, text, jsonb, text) to service_role;

-- 6. The Schedule reads short hours and closed spans --------------------------------
-- Each closure check asks whether the day's change reaches the shift itself
-- (K17 with short hours, Mert 2026-10-10); the closures lists carry the span.

CREATE OR REPLACE FUNCTION "public"."get_employee_schedule_board_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  actor public.employee_profiles%rowtype;
  settings public.workspace_scheduling_settings%rowtype;
  resolved_week_start date;
  result jsonb;
begin
  actor := public.employee_hub_actor_service(actor_user_id, target_workspace_id);

  select * into settings
  from public.workspace_scheduling_settings
  where workspace_id = target_workspace_id;
  if settings.workspace_id is null then
    raise exception 'scheduling settings are unavailable' using errcode = 'P0002';
  end if;

  resolved_week_start := case settings.week_start_day
    when 'sunday' then target_date - extract(dow from target_date)::integer
    else target_date - (extract(isodow from target_date)::integer - 1)
  end;

  with allowed_locations as (
    select location.*
    from public.locations location
    where location.workspace_id = target_workspace_id
      and location.archived_at is null
      and exists (
        select 1
        from public.employee_location_assignments assignment
        where assignment.employee_id = actor.id
          and assignment.location_id = location.id
          and assignment.ended_at is null
      )
  ), current_publications as (
    select publication.*
    from public.schedule_location_publications publication
    join allowed_locations location on location.id = publication.location_id
    where publication.week_start = resolved_week_start
      and publication.status = 'current'
  ), visible_employees as (
    select distinct employee.*
    from public.employee_profiles employee
    where employee.workspace_id = target_workspace_id
      and employee.archived_at is null
      and exists (
        select 1
        from public.employee_location_assignments assignment
        join allowed_locations location on location.id = assignment.location_id
        where assignment.employee_id = employee.id and assignment.ended_at is null
      )
  ), current_shifts as (
    select shift.*
    from public.schedule_published_shifts shift
    join current_publications publication on publication.id = shift.publication_id
    where shift.scheduled_date between resolved_week_start and resolved_week_start + 6
  ), own_availability as materialized (
    -- The employee's own marks; the manager's private reminder never reaches here.
    select * from app_private.schedule_week_availability(
      target_workspace_id, resolved_week_start, array[actor.id],
      (select coalesce(array_agg(location.id), '{}') from allowed_locations location), false)
  )
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'week_start', resolved_week_start,
    'week_start_day', settings.week_start_day,
    'settings', jsonb_build_object(
      'time_format', coalesce(settings.time_format, '12h')
    ),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', location.id,
        'name', location.name,
        'timezone', location.timezone,
        'sort_order', location.sort_order,
        'publication_status', case when publication.id is null then 'unpublished' else 'published' end,
        'published_at', publication.published_at
      ) order by location.sort_order, location.name)
      from allowed_locations location
      left join current_publications publication on publication.location_id = location.id
    ), '[]'::jsonb),
    'shift_types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', shift_type.id, 'name', shift_type.name, 'color', shift_type.color,
        'sort_order', shift_type.sort_order,
        'default_revision', shift_type.default_revision,
        'default_start_time', case when shift_type.default_start_time is null then null else to_char(shift_type.default_start_time, 'HH24:MI') end,
        'default_end_time', case when shift_type.default_end_time is null then null else to_char(shift_type.default_end_time, 'HH24:MI') end
      ) order by shift_type.sort_order, shift_type.name)
      from public.shift_types shift_type
      where shift_type.workspace_id = target_workspace_id and shift_type.archived_at is null
    ), '[]'::jsonb),
    'shift_labels', '[]'::jsonb,
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', employee.id,
        'employee_code', employee.employee_code,
        'display_name', coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' ' || employee.last_name,
        'location_ids', coalesce((select jsonb_agg(assignment.location_id order by assignment.location_id)
          from public.employee_location_assignments assignment
          join allowed_locations location on location.id = assignment.location_id
          where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
        'job_ids', coalesce((select jsonb_agg(assignment.job_id order by assignment.job_id)
          from public.employee_job_assignments assignment
          where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
        'primary_job_id', app_private.stored_primary_job(employee.id)
      ) || case when employee.id = actor.id then jsonb_build_object('weekly_availability', coalesce((
          select jsonb_agg(own.projection order by own.location_id)
          from own_availability own
          where exists (select 1 from public.employee_location_assignments assignment
            where assignment.employee_id = actor.id and assignment.location_id = own.location_id
              and assignment.ended_at is null)), '[]'::jsonb))
        else '{}'::jsonb end
      order by employee.last_name, employee.first_name, employee.id)
      from visible_employees employee
    ), '[]'::jsonb),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', shift.id,
        'location_id', shift.location_id,
        'employee_id', shift.employee_id,
        'job_id', shift.job_id,
        'shift_type_id', shift.shift_type_id,
        'scheduled_date', shift.scheduled_date,
        'time_basis', shift.time_basis,
        'time_snapshot', shift.time_snapshot,
        'time_timezone', shift.time_timezone,
        'start_time', to_char(shift.start_time, 'HH24:MI'),
        'end_time', to_char(shift.end_time, 'HH24:MI'),
        'crosses_midnight', shift.crosses_midnight,
        'unpaid_break_minutes', coalesce(shift.unpaid_break_minutes, 0),
        'hide_time_on_badge', coalesce(shift.hide_time_on_badge, false),
        'note', case when shift.employee_id is null or shift.employee_id = actor.id then shift.note else '' end,
        'label_ids', to_jsonb(coalesce(shift.label_ids, '{}'::uuid[])),
        'label_names', to_jsonb(coalesce(shift.label_names, '{}'::text[])),
        'warning_codes', to_jsonb(array_remove(array[
          case when exists (
            select 1 from public.schedule_closures closure
            where closure.location_id = shift.location_id
              and closure.closed_date = shift.scheduled_date and app_private.closure_covers(closure.kind, closure.window_start, closure.window_end, shift.start_time, shift.end_time)
          ) then 'closed_location' end,
          -- Only a conflict with the employee's own marks, as accepted at publishing.
          case when shift.employee_id = actor.id
            and coalesce((shift.availability_snapshot -> 'assessment' ->> 'has_availability_conflict')::boolean, false)
            and jsonb_array_length(coalesce(shift.availability_snapshot -> 'assessment' -> 'employee_intervals', '[]'::jsonb)) > 0
          then 'availability' end,
          case when shift.employee_id is not null and exists (
            select 1 from current_shifts other
            where other.employee_id = shift.employee_id
              and other.scheduled_date = shift.scheduled_date
              and other.id <> shift.id
              and not shift.crosses_midnight and not other.crosses_midnight
              and shift.start_time < other.end_time and shift.end_time > other.start_time
          ) then 'overlap' end
        ]::text[], null))
      ) order by shift.scheduled_date, shift.start_time, shift.id)
      from current_shifts shift
    ), '[]'::jsonb),
    'closures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', closure.id, 'location_id', closure.location_id,
        'closed_date', closure.closed_date, 'title', closure.title,
        'is_all_day', closure.is_all_day, 'kind', closure.kind,
        'window_start', to_char(closure.window_start, 'HH24:MI'), 'window_end', to_char(closure.window_end, 'HH24:MI')
      ) order by closure.closed_date, closure.title)
      from public.schedule_closures closure
      join allowed_locations location on location.id = closure.location_id
      where closure.closed_date between resolved_week_start and resolved_week_start + 6
    ), '[]'::jsonb),
    'important_dates', '[]'::jsonb
  ) || app_private.schedule_departments_and_jobs(target_workspace_id)
    || app_private.schedule_referenced_catalog(target_workspace_id,
      array(select shift.job_id from current_shifts shift),
      array(select shift.shift_type_id from current_shifts shift))
  into result;

  return result;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_schedule_edit_session_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_session_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_session public.schedule_edit_sessions%rowtype;
  result jsonb;
begin
  select * into target_session
  from public.schedule_edit_sessions session
  where session.id = target_session_id
    and session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id;
  if target_session.id is null then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;
  -- The edit's locations are still the person's to edit (B-3).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => target_session.location_ids);

  with counterpart as materialized (
    select published.source_shift_id as edit_shift_id, published.employee_id, published.location_id,
      published.scheduled_date, published.start_time, published.end_time, published.time_timezone,
      published.availability_snapshot
    from public.schedule_location_publications publication
    join public.schedule_published_shifts published on published.publication_id = publication.id
    where publication.workspace_id = target_workspace_id and publication.status = 'current'
      and publication.week_start = target_session.week_start
      and publication.location_id = any (target_session.location_ids)
  ), week_availability as materialized (
    select * from app_private.schedule_week_availability(
      target_workspace_id, target_session.week_start,
      array(select s.employee_id from public.schedule_edit_session_shifts s
            where s.session_id = target_session.id and s.employee_id is not null
            union select c.employee_id from counterpart c where c.employee_id is not null),
      array(select s.location_id from public.schedule_edit_session_shifts s
            where s.session_id = target_session.id
            union select c.location_id from counterpart c))
  )
  select jsonb_build_object(
    'id', target_session.id,
    'workspace_id', target_session.workspace_id,
    'week_start', target_session.week_start,
    'source_kind', target_session.source_kind,
    'source_draft_id', target_session.source_draft_id,
    'source_revision', target_session.source_revision,
    'holder_user_id', target_session.holder_user_id,
    'holder_name', coalesce((
      select profile.display_name from public.user_profiles profile
      where profile.user_id = target_session.holder_user_id
    ), 'Manager'),
    'revision', target_session.revision,
    'dirty', target_session.dirty,
    -- DB-1c: how many steps Undo can take back.
    'undo_depth', (select count(*) from (select distinct step.step_at, step.step_xact
      from app_private.schedule_edit_undo_steps step where step.session_id = target_session.id) undo)::integer,
    'last_heartbeat', target_session.last_heartbeat,
    'expires_at', target_session.expires_at,
    'location_ids', to_jsonb(target_session.location_ids),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', shift.id,
        'location_id', shift.location_id,
        'employee_id', shift.employee_id,
        'job_id', shift.job_id,
        'shift_type_id', shift.shift_type_id,
        'scheduled_date', shift.scheduled_date,
        'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time', to_char(shift.start_time, 'HH24:MI'),
        'end_time', to_char(shift.end_time, 'HH24:MI'),
        'crosses_midnight', shift.crosses_midnight,
        'unpaid_break_minutes', coalesce(shift.unpaid_break_minutes, 0),
        'hide_time_on_badge', coalesce(shift.hide_time_on_badge, false),
        'note', shift.note,
        'revision', shift.revision,
        'source_published_shift_id', shift.source_published_shift_id,
        'pending_op_type', shift.pending_op_type,
        'locked', shift.locked,
        'label_ids', to_jsonb(coalesce(shift.label_ids, '{}'::uuid[])),
        'label_names', to_jsonb(coalesce(shift.label_names, '{}'::text[])),
        -- K18, M11 in Edit mode (VAR-UYG-DB): read from the shift's published
        -- counterpart by the published week's own rule; a shift never
        -- published has none and says false.
        'availability_changed_after_publish', coalesce((
          -- KK-171: only while the edit keeps the published person on the card.
          select c.employee_id is not null and c.employee_id = shift.employee_id
            and exists (select 1 from week_availability week
              where week.employee_id = c.employee_id and week.location_id = c.location_id
                and week.unavailable && app_private.shift_time_range(c.scheduled_date, c.start_time, c.end_time, c.time_timezone))
            and not coalesce((c.availability_snapshot -> 'first' ->> 'has_own_mark')::boolean, true)
          from counterpart c where c.edit_shift_id = shift.id
          -- A shift moved to another location and published only there sits in
          -- two current publications; the one at its location today speaks.
          order by (c.location_id = shift.location_id) desc limit 1), false),
        'warning_codes', to_jsonb(array_remove(array[
          case when exists (
            select 1 from public.schedule_closures closure
            where closure.location_id = shift.location_id
              and closure.closed_date = shift.scheduled_date and app_private.closure_covers(closure.kind, closure.window_start, closure.window_end, shift.start_time, shift.end_time)
          ) then 'closed_location' end,
          -- Today's marks and approved leave, published or not (BL-186).
          case when shift.employee_id is not null and exists (select 1 from week_availability week
            where week.employee_id = shift.employee_id and week.location_id = shift.location_id
              and (week.unavailable + week.leave) && app_private.shift_time_range(shift.scheduled_date, shift.start_time, shift.end_time, shift.time_timezone)
          ) then 'availability' end,
          case when shift.employee_id is not null and exists (
            select 1 from public.schedule_edit_session_shifts other
            where other.session_id = target_session.id
              and other.employee_id = shift.employee_id
              and other.scheduled_date = shift.scheduled_date
              and other.id <> shift.id
              and not shift.crosses_midnight and not other.crosses_midnight
              and shift.start_time < other.end_time and shift.end_time > other.start_time
          ) then 'overlap' end
        ]::text[], null))
      ) order by shift.scheduled_date, shift.start_time, shift.id)
      from public.schedule_edit_session_shifts shift
      where shift.session_id = target_session.id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_schedule_read_model_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  settings public.workspace_scheduling_settings%rowtype;
  resolved_week_start date;
  -- ponytail: one mode today, live shifts elsewhere as ghosts. B4's
  -- published-plan preview (FB-6.1b) is a second way to fill ghost_shifts,
  -- not a second read.
  reach uuid[] := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.read');
  result jsonb;
begin
  -- Nowhere to read: the core says why. A workspace with no live location
  -- reads as empty to whoever would reach it, rather than refusing the owner.
  if cardinality(reach) = 0
     and (app_private.authz_reason(actor_user_id, target_workspace_id, 'schedule.read') is distinct from 'out_of_scope'
          or exists (select 1 from public.locations l where l.workspace_id = target_workspace_id and l.deleted_at is null)) then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.read');
  end if;

  select * into settings
  from public.workspace_scheduling_settings
  where workspace_id = target_workspace_id;
  if settings.workspace_id is null then
    raise exception 'scheduling settings are unavailable' using errcode = 'P0002';
  end if;

  resolved_week_start := case settings.week_start_day
    when 'sunday' then target_date - extract(dow from target_date)::integer
    else target_date - (extract(isodow from target_date)::integer - 1)
  end;

  with allowed_locations as (
    select location.*
    from public.locations location
    where location.workspace_id = target_workspace_id
      and location.archived_at is null
      and location.id = any(reach)
  ), current_publications as (
    select publication.*
    from public.schedule_location_publications publication
    join allowed_locations location on location.id = publication.location_id
    where publication.week_start = resolved_week_start
      and publication.status = 'current'
  ), visible_employees as (
    select distinct employee.*
    from public.employee_profiles employee
    where employee.workspace_id = target_workspace_id
      and employee.archived_at is null
      and exists (
        select 1
        from public.employee_location_assignments assignment
        join allowed_locations location on location.id = assignment.location_id
        where assignment.employee_id = employee.id and assignment.ended_at is null
      )
  ), current_shifts as (
    select shift.*
    from public.schedule_published_shifts shift
    join current_publications publication on publication.id = shift.publication_id
    where shift.scheduled_date between resolved_week_start and resolved_week_start + 6
  ), ghost_shifts as (
    -- A shift somebody on this grid works at a location the actor does not
    -- reach: what the shift card says, not its note (REUSE B1, FB-6.1 T3).
    select shift.id, shift.employee_id, shift.location_id, location.name as location_name,
      shift.scheduled_date, shift.start_time, shift.end_time, shift.crosses_midnight,
      shift.job_id, job.name as job_name, shift.shift_type_id, shift_type.name as shift_type_name,
      shift.label_ids, shift.label_names
    from visible_employees employee
    join public.schedule_published_shifts shift
      on shift.employee_id = employee.id
     and shift.scheduled_date between resolved_week_start and resolved_week_start + 6
    join public.schedule_location_publications publication
      on publication.id = shift.publication_id and publication.status = 'current'
     and publication.week_start = resolved_week_start
    join public.locations location
      on location.id = shift.location_id and location.workspace_id = target_workspace_id
     and location.archived_at is null and location.deleted_at is null
    -- Names travel with the ghost, named as the grid names a real shift: the
    -- job and type, archived ones too (G8b, K8), null once deleted; the labels
    -- as the shift recorded them.
    left join public.jobs job
      on job.id = shift.job_id and job.workspace_id = target_workspace_id
     and job.deleted_at is null
    left join public.shift_types shift_type
      on shift_type.id = shift.shift_type_id and shift_type.workspace_id = target_workspace_id
     and shift_type.deleted_at is null
    where not exists (select 1 from allowed_locations allowed where allowed.id = shift.location_id)
  ), week_availability as materialized (
    select * from app_private.schedule_week_availability(
      target_workspace_id, resolved_week_start,
      (select coalesce(array_agg(employee.id), '{}') from visible_employees employee),
      (select coalesce(array_agg(location.id), '{}') from allowed_locations location))
  ), readable_notes as materialized (
    -- The note's words, by weekday from Sunday, for whoever the core lets read
    -- the note; nobody else gets them.
    -- Who last wrote it and when, named as the grid names a person (AVAIL-002).
    -- ponytail: a workspace-wide input-mode conversion also stamps the admin
    -- who changed the setting; keep the writer there if that ever misleads.
    select reminder.employee_id, to_jsonb(reminder.notes) as words,
      coalesce(nullif(author.preferred_name, ''), author.first_name) || ' ' || author.last_name as author,
      reminder.updated_at as edited_at
    from public.manager_weekly_reminders reminder
    left join public.employee_profiles author
      on author.workspace_id = reminder.workspace_id and author.user_id = reminder.updated_by
    where reminder.workspace_id = target_workspace_id and reminder.enabled
      and reminder.employee_id = any(array(select employee.id from visible_employees employee))
      and app_private.authz_reason(actor_user_id, target_workspace_id, 'availability.note_read',
        target_person => reminder.employee_id) is null
  )
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'week_start', resolved_week_start,
    'week_start_day', settings.week_start_day,
    'settings', jsonb_build_object(
      'time_format', coalesce(settings.time_format, '12h'),
      'conflict_rules', settings.conflict_rules,
      'minimum_travel_minutes', settings.minimum_travel_minutes,
      'minimum_rest_minutes', settings.minimum_rest_minutes
    ),
    'shift_labels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', label.id, 'name', label.name, 'color', label.color, 'sort_order', label.sort_order
      ) order by label.sort_order, label.name)
      from public.shift_labels label
      where label.workspace_id = target_workspace_id and label.archived_at is null
    ), '[]'::jsonb),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', location.id,
        'name', location.name,
        'timezone', location.timezone,
        'sort_order', location.sort_order,
        'publication_status', case when publication.id is null then 'unpublished' else 'published' end,
        'published_at', publication.published_at
      ) order by location.sort_order, location.name)
      from allowed_locations location
      left join current_publications publication on publication.location_id = location.id
    ), '[]'::jsonb),
    'shift_types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', shift_type.id, 'name', shift_type.name, 'color', shift_type.color,
        'sort_order', shift_type.sort_order,
        'default_revision',shift_type.default_revision,'default_start_time', case when shift_type.default_start_time is null then null else to_char(shift_type.default_start_time, 'HH24:MI') end,
        'default_end_time', case when shift_type.default_end_time is null then null else to_char(shift_type.default_end_time, 'HH24:MI') end
      ) order by shift_type.sort_order, shift_type.name)
      from public.shift_types shift_type
      where shift_type.workspace_id = target_workspace_id and shift_type.archived_at is null
    ), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', employee.id,
        'employee_code', employee.employee_code,
        'display_name', coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' ' || employee.last_name,
        'is_excluded_from_schedule', coalesce(employee.is_excluded_from_schedule, false),
        'location_ids', coalesce((select jsonb_agg(assignment.location_id order by assignment.location_id)
          from public.employee_location_assignments assignment
          join allowed_locations location on location.id = assignment.location_id
          where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
        'job_ids', coalesce((select jsonb_agg(assignment.job_id order by assignment.job_id)
          from public.employee_job_assignments assignment
          where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
        'primary_job_id', app_private.stored_primary_job(employee.id),
        -- The note's words and hours only for whoever may read the note (M12).
        'weekly_availability', coalesce((select jsonb_agg((week.projection - 'note_intervals')
            || jsonb_build_object('manager_notes', note.words,
              'note_author', note.author, 'note_edited_at', note.edited_at,
              'note_intervals', case when note.employee_id is null then '[]'::jsonb else week.projection -> 'note_intervals' end)
            order by week.location_id)
          from week_availability week
          left join readable_notes note on note.employee_id = employee.id
          where week.employee_id = employee.id
            and exists (select 1 from public.employee_location_assignments assignment
              where assignment.employee_id = employee.id and assignment.location_id = week.location_id
                and assignment.ended_at is null)), '[]'::jsonb)
      ) order by employee.last_name, employee.first_name, employee.id)
      from visible_employees employee
    ), '[]'::jsonb),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', shift.id,
        'location_id', shift.location_id,
        'employee_id', shift.employee_id,
        'job_id', shift.job_id,
        'shift_type_id', shift.shift_type_id,
        'scheduled_date', shift.scheduled_date,
        'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time', to_char(shift.start_time, 'HH24:MI'),
        'end_time', to_char(shift.end_time, 'HH24:MI'),
        'crosses_midnight', shift.crosses_midnight,
        'unpaid_break_minutes', coalesce(shift.unpaid_break_minutes, 0),
        'hide_time_on_badge', coalesce(shift.hide_time_on_badge, false),
        'note', shift.note,
        'label_ids', to_jsonb(coalesce(shift.label_ids, '{}'::uuid[])),
        'label_names', to_jsonb(coalesce(shift.label_names, '{}'::text[])),
        -- K18, M11: the employee's own mark came after the shift was first
        -- published; approved time off is no change of availability.
        'availability_changed_after_publish', mark.own_mark
          and not coalesce((shift.availability_snapshot -> 'first' ->> 'has_own_mark')::boolean, true),
        'warning_codes', to_jsonb(array_remove(array[
          case when exists (
            select 1 from public.schedule_closures closure
            where closure.workspace_id = target_workspace_id and closure.location_id = shift.location_id
              and closure.closed_date = shift.scheduled_date and app_private.closure_covers(closure.kind, closure.window_start, closure.window_end, shift.start_time, shift.end_time)
          ) then 'closed_location' end,
          -- Today's marks and approved leave: a mark made after publishing shows
          -- here too (BL-186).
          case when mark.unavailable then 'availability' end,
          case when shift.employee_id is not null and exists (
            select 1 from current_shifts other
            where other.employee_id = shift.employee_id
              and other.scheduled_date = shift.scheduled_date
              and other.id <> shift.id
              and not shift.crosses_midnight and not other.crosses_midnight
              and shift.start_time < other.end_time and shift.end_time > other.start_time
          ) then 'overlap' end
        ]::text[], null))
      ) order by shift.scheduled_date, shift.start_time, shift.id)
      from current_shifts shift
      cross join lateral (
        select shift.employee_id is not null and exists (select 1 from week_availability week
          where week.employee_id = shift.employee_id and week.location_id = shift.location_id
            and (week.unavailable + week.leave) && app_private.shift_time_range(shift.scheduled_date, shift.start_time, shift.end_time, shift.time_timezone)
        ) as unavailable,
        shift.employee_id is not null and exists (select 1 from week_availability week
          where week.employee_id = shift.employee_id and week.location_id = shift.location_id
            and week.unavailable && app_private.shift_time_range(shift.scheduled_date, shift.start_time, shift.end_time, shift.time_timezone)
        ) as own_mark
      ) mark
    ), '[]'::jsonb),
    'ghost_shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ghost.id,
        'employee_id', ghost.employee_id,
        'location_id', ghost.location_id,
        'location_name', ghost.location_name,
        'scheduled_date', ghost.scheduled_date,
        'start_time', to_char(ghost.start_time, 'HH24:MI'),
        'end_time', to_char(ghost.end_time, 'HH24:MI'),
        'crosses_midnight', ghost.crosses_midnight,
        'job_id', ghost.job_id,
        'job_name', ghost.job_name,
        'shift_type_id', ghost.shift_type_id,
        'shift_type_name', ghost.shift_type_name,
        'label_ids', to_jsonb(ghost.label_ids),
        'label_names', to_jsonb(ghost.label_names)
      ) order by ghost.scheduled_date, ghost.start_time, ghost.id)
      from ghost_shifts ghost
    ), '[]'::jsonb),
    'closures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', closure.id, 'location_id', closure.location_id,
        'closed_date', closure.closed_date, 'title', closure.title,
        'is_all_day', closure.is_all_day, 'kind', closure.kind,
        'window_start', to_char(closure.window_start, 'HH24:MI'), 'window_end', to_char(closure.window_end, 'HH24:MI')
      ) order by closure.closed_date, closure.title)
      from public.schedule_closures closure
      join allowed_locations location on location.id = closure.location_id
      where closure.workspace_id = target_workspace_id
        and closure.closed_date between resolved_week_start and resolved_week_start + 6
    ), '[]'::jsonb),
    -- Published dates that touch the week, one row per reachable location;
    -- a date for no location is everyone's (B-7). An annual date repeats from
    -- its first year to two years ahead, 29 Feb falling on 28 Feb.
    'important_dates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'location_id', place.id, 'title', d.title, 'type', d.type,
        'starts_on', d.starts_on, 'ends_on', d.ends_on, 'recurrence', d.recurrence
      ) order by d.starts_on, d.title, place.id)
      from public.important_dates d
      cross join lateral (
        select coalesce(nullif(d.location_ids, '{}'), array_remove(array[d.location_id], null)) ids
      ) named
      cross join lateral (
        select location.id from allowed_locations location where location.id = any (named.ids)
        union all select null::uuid where cardinality(named.ids) = 0
      ) place
      where d.workspace_id = target_workspace_id and d.archived_at is null
        and d.status = 'published'
        and case when d.recurrence = 'annual' then exists (
          select 1 from generate_series(resolved_week_start, resolved_week_start + 6, interval '1 day') day(at)
          cross join lateral (values (extract(year from day.at)::integer - 1), (extract(year from day.at)::integer)) y(year)
          cross join lateral (select y.year - extract(year from d.starts_on)::integer k) shift
          where shift.k >= 0
            and y.year <= greatest(extract(year from current_date)::integer + 2, extract(year from d.starts_on)::integer)
            and day.at::date between d.starts_on + make_interval(years => shift.k) and d.ends_on + make_interval(years => shift.k))
        else d.starts_on <= resolved_week_start + 6 and resolved_week_start <= d.ends_on end
    ), '[]'::jsonb)
  ) || app_private.schedule_departments_and_jobs(target_workspace_id)
    || app_private.schedule_referenced_catalog(target_workspace_id,
      array(select shift.job_id from current_shifts shift union select ghost.job_id from ghost_shifts ghost),
      array(select shift.shift_type_id from current_shifts shift
            union select ghost.shift_type_id from ghost_shifts ghost))
  into result;

  return result;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."list_schedule_weekly_shifts_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_week_start" "date", "target_location_ids" "uuid"[] DEFAULT NULL::"uuid"[], "target_draft_id" "uuid" DEFAULT NULL::"uuid", "include_live_context" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  result jsonb;
  reason text;
  reachable uuid[];
begin
  -- May they read any week at all; which locations, the core answers.
  reason := app_private.authz_check(app_private.actor(actor_user_id, target_workspace_id),
    (select r from app_private.authz_actions r where r.key = 'schedule.read'), null, null, null);
  if reason is not null and reason <> 'out_of_scope' then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || reason, detail = 'schedule.read';
  end if;
  reachable := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.read');

  if target_draft_id is not null and not exists (
    select 1
    from public.schedule_drafts draft
    where draft.id = target_draft_id
      and draft.workspace_id = target_workspace_id
      and draft.week_start = target_week_start
      and draft.archived_at is null
      and draft.location_ids && reachable
  ) then
    -- A draft touching none of the person's locations is not there for them (BL-412).
    raise exception 'Not allowed' using errcode = '42501', detail = 'schedule.read', hint = 'authz.out_of_scope';
  end if;

  with requested_locations as (
    select unnest(coalesce(target_location_ids, array[]::uuid[])) as id
  ), allowed_locations as (
    select location.id
    from public.locations location
    where location.workspace_id = target_workspace_id
      and location.archived_at is null
      and location.id = any(reachable)
      and (
        coalesce(array_length(target_location_ids, 1), 0) = 0
        or location.id in (select id from requested_locations)
      )
  ), current_publications as (
    select publication.*
    from public.schedule_location_publications publication
    join allowed_locations location on location.id = publication.location_id
    where publication.workspace_id = target_workspace_id
      and publication.week_start = target_week_start
      and publication.status = 'current'
  ), draft_shifts as (
    select
      shift.id,
      shift.workspace_id,
      shift.location_id,
      shift.employee_id,
      shift.job_id,
      shift.shift_type_id,
      shift.scheduled_date,
      shift.start_time,
      shift.end_time,
      shift.crosses_midnight,
      shift.unpaid_break_minutes,
      shift.note
    from public.schedule_draft_shifts shift
    join allowed_locations location on location.id = shift.location_id
    where target_draft_id is not null
      and shift.workspace_id = target_workspace_id
      and shift.draft_id = target_draft_id
      and shift.scheduled_date between target_week_start and target_week_start + 6
  ), published_shifts as (
    select
      shift.source_shift_id as id,
      shift.workspace_id,
      shift.location_id,
      shift.employee_id,
      shift.job_id,
      shift.shift_type_id,
      shift.scheduled_date,
      shift.start_time,
      shift.end_time,
      shift.crosses_midnight,
      shift.unpaid_break_minutes,
      shift.note
    from public.schedule_published_shifts shift
    join current_publications publication on publication.id = shift.publication_id
    where shift.workspace_id = target_workspace_id
      and shift.scheduled_date between target_week_start and target_week_start + 6
  ), selected_shifts as (
    select * from draft_shifts
    union all
    select * from published_shifts where target_draft_id is null
  ), ghost_context as (
    select published.*
    from published_shifts published
    where include_live_context
      and target_draft_id is not null
      and not exists (
        select 1 from draft_shifts draft where draft.id = published.id
      )
  ), selected_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', shift.id,
      'location_id', shift.location_id,
      'employee_id', shift.employee_id,
      'job_id', shift.job_id,
      'shift_type_id', shift.shift_type_id,
      'scheduled_date', shift.scheduled_date,
      'start_time', to_char(shift.start_time, 'HH24:MI'),
      'end_time', to_char(shift.end_time, 'HH24:MI'),
      'crosses_midnight', shift.crosses_midnight,
      'unpaid_break_minutes', coalesce(shift.unpaid_break_minutes, 0),
      'note', shift.note,
      'warning_codes', to_jsonb(array_remove(array[
        case when exists (
          select 1
          from public.schedule_closures closure
          where closure.location_id = shift.location_id
            and closure.closed_date = shift.scheduled_date
            and app_private.closure_covers(closure.kind, closure.window_start, closure.window_end, shift.start_time, shift.end_time)
        ) then 'closed_location' end,
        case when shift.employee_id is not null and exists (
          select 1
          from selected_shifts other
          where other.employee_id = shift.employee_id
            and other.scheduled_date = shift.scheduled_date
            and other.id <> shift.id
            and not shift.crosses_midnight and not other.crosses_midnight
            and shift.start_time < other.end_time and shift.end_time > other.start_time
        ) then 'overlap' end
      ]::text[], null))
    ) order by shift.scheduled_date, shift.start_time, shift.id), '[]'::jsonb) as payload
    from selected_shifts shift
  ), ghost_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', shift.id,
      'location_id', shift.location_id,
      'employee_id', shift.employee_id,
      'job_id', shift.job_id,
      'shift_type_id', shift.shift_type_id,
      'scheduled_date', shift.scheduled_date,
      'start_time', to_char(shift.start_time, 'HH24:MI'),
      'end_time', to_char(shift.end_time, 'HH24:MI'),
      'crosses_midnight', shift.crosses_midnight,
      'unpaid_break_minutes', coalesce(shift.unpaid_break_minutes, 0),
      'note', shift.note,
      'warning_codes', to_jsonb(array_remove(array[
        case when exists (
          select 1
          from public.schedule_closures closure
          where closure.location_id = shift.location_id
            and closure.closed_date = shift.scheduled_date
            and app_private.closure_covers(closure.kind, closure.window_start, closure.window_end, shift.start_time, shift.end_time)
        ) then 'closed_location' end
      ]::text[], null))
    ) order by shift.scheduled_date, shift.start_time, shift.id), '[]'::jsonb) as payload
    from ghost_context shift
  )
  select jsonb_build_object(
    'shifts', selected_json.payload,
    'ghost_shifts', ghost_json.payload
  )
  into result
  from selected_json, ghost_json;

  return public.schedule_availability_enrich_read(actor_user_id,target_workspace_id,result,target_draft_id);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."preview_schedule_publication_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_draft_id" "uuid", "target_location_ids" "uuid"[], "target_department_ids" "uuid"[] DEFAULT NULL::"uuid"[], "include_no_department" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  requested uuid;
  target_draft public.schedule_drafts%rowtype;
  normalized_locations uuid[];
  normalized_departments uuid[];
  effective_include_no_department boolean := coalesce(include_no_department, true);
  location_payload jsonb;
  finding_payload jsonb;
  unsigned_payload jsonb;
  preview_fingerprint text;
  hard_count integer;
  soft_count integer;
begin
  -- Nothing named is nowhere to publish; the core says why.
  if cardinality(coalesce(target_location_ids, '{}'::uuid[])) = 0 then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => '{}'::uuid[]);
  end if;
  foreach requested in array target_location_ids loop
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => array[requested]);
  end loop;

  select * into target_draft
  from public.schedule_drafts draft
  where draft.id = target_draft_id
    and draft.workspace_id = target_workspace_id
    and draft.archived_at is null;
  if target_draft.id is null then
    raise exception 'schedule draft not found' using errcode = 'P0002';
  end if;
  if target_draft.week_start < public.schedule_current_week_start_service(target_workspace_id) then
    return app_private.schedule_publication_changes_since_start(public.weekly_schedule_publication_preflight(
      jsonb_build_object(
        'status', 'past_week_closed', 'workspace_id', target_workspace_id,
        'week_start', target_draft.week_start, 'draft_id', target_draft.id,
        'draft_revision', target_draft.revision, 'fingerprint', repeat('0', 64),
        'locations', '[]'::jsonb, 'findings', '[]'::jsonb
      ), actor_user_id, target_department_ids, include_no_department));
  end if;

  select array_agg(distinct location_id order by location_id)
  into normalized_locations
  from unnest(target_location_ids) location_id;
  -- A draft publishes only the locations it covers; anything else would be
  -- replaced with nothing.
  if not normalized_locations <@ target_draft.location_ids then
    raise exception 'publication location is not in this draft' using errcode = '22023';
  end if;

  if target_department_ids is not null then
    select coalesce(array_agg(distinct department.id order by department.id), '{}'::uuid[])
    into normalized_departments
    from public.departments department
    join unnest(target_department_ids) requested(id) on requested.id = department.id
    where department.workspace_id = target_workspace_id
      and department.archived_at is null;

    if cardinality(normalized_departments) = 0
      and not effective_include_no_department then
      raise exception 'invalid department publication scope' using errcode = '22023';
    end if;
  end if;

  with selected_locations as (
    select location.id, location.name
    from public.locations location
    where location.id = any(normalized_locations)
  ), active as (
    select publication.*
    from public.schedule_location_publications publication
    where publication.workspace_id = target_workspace_id
      and publication.week_start = target_draft.week_start
      and publication.location_id = any(normalized_locations)
      and publication.status = 'current'
  ), current_shift as (
    select shift.*
    from public.schedule_published_shifts shift
    join active publication on publication.id = shift.publication_id
    where public.schedule_shift_in_department_scope_service(
      shift.job_id, normalized_departments, effective_include_no_department
    )
  ), next_shift as (
    select shift.*
    from public.schedule_draft_shifts shift
    where shift.draft_id = target_draft.id
      and shift.location_id = any(normalized_locations)
      and public.schedule_shift_in_department_scope_service(
        shift.job_id, normalized_departments, effective_include_no_department
      )
  ), comparison as (
    select location.id as location_id, location.name as location_name,
      publication.id as active_publication_id,
      publication.version_number as active_version,
      (select count(*) from current_shift shift where shift.location_id = location.id)::integer as current_shift_count,
      (select count(*) from next_shift shift where shift.location_id = location.id)::integer as next_shift_count,
      (select count(*) from next_shift next_row where next_row.location_id = location.id and not exists (
        select 1 from current_shift current_row where current_row.location_id = location.id and current_row.source_shift_id = next_row.id
      ))::integer as added,
      (select count(*) from current_shift current_row where current_row.location_id = location.id and not exists (
        select 1 from next_shift next_row where next_row.location_id = location.id and next_row.id = current_row.source_shift_id
      ))::integer as removed,
      (select count(*) from next_shift next_row join current_shift current_row
        on current_row.location_id = next_row.location_id and current_row.source_shift_id = next_row.id
        where next_row.location_id = location.id and (
          current_row.employee_id is distinct from next_row.employee_id
          or current_row.job_id is distinct from next_row.job_id
          or current_row.shift_type_id is distinct from next_row.shift_type_id
          or current_row.scheduled_date is distinct from next_row.scheduled_date
          or current_row.start_time is distinct from next_row.start_time
          or current_row.end_time is distinct from next_row.end_time
          or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
        ))::integer as updated,
      (select count(*) from next_shift next_row join current_shift current_row
        on current_row.location_id = next_row.location_id and current_row.source_shift_id = next_row.id
        where next_row.location_id = location.id and not (
          current_row.employee_id is distinct from next_row.employee_id
          or current_row.job_id is distinct from next_row.job_id
          or current_row.shift_type_id is distinct from next_row.shift_type_id
          or current_row.scheduled_date is distinct from next_row.scheduled_date
          or current_row.start_time is distinct from next_row.start_time
          or current_row.end_time is distinct from next_row.end_time
          or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
        ))::integer as unchanged,
      coalesce((
        select array_agg(distinct affected.employee_id order by affected.employee_id)
        from (
          select next_row.employee_id
          from next_shift next_row
          where next_row.location_id = location.id
            and next_row.employee_id is not null
            and not exists (
              select 1 from current_shift current_row
              where current_row.location_id = location.id
                and current_row.source_shift_id = next_row.id
            )
          union
          select next_row.employee_id
          from next_shift next_row
          join current_shift current_row
            on current_row.location_id = next_row.location_id
           and current_row.source_shift_id = next_row.id
          where next_row.location_id = location.id
            and next_row.employee_id is not null
            and (
              current_row.employee_id is distinct from next_row.employee_id
              or current_row.job_id is distinct from next_row.job_id
              or current_row.shift_type_id is distinct from next_row.shift_type_id
              or current_row.scheduled_date is distinct from next_row.scheduled_date
              or current_row.start_time is distinct from next_row.start_time
              or current_row.end_time is distinct from next_row.end_time
              or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
            )
          union
          select current_row.employee_id
          from current_shift current_row
          where current_row.location_id = location.id
            and current_row.employee_id is not null
            and not exists (
              select 1 from next_shift next_row
              where next_row.location_id = location.id
                and next_row.id = current_row.source_shift_id
            )
        ) affected
      ), '{}'::uuid[]) as affected_employee_ids
    from selected_locations location
    left join active publication on publication.location_id = location.id
  )
  select jsonb_agg(to_jsonb(comparison) order by location_name, location_id)
  into location_payload from comparison;

  with next_shift as (
    select shift.*,
      coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' ' || employee.last_name as employee_name,
      location.name as location_name,
      tsrange(
        shift.scheduled_date::timestamp + shift.start_time,
        shift.scheduled_date::timestamp + shift.end_time
          + case when shift.end_time <= shift.start_time then interval '1 day' else interval '0' end,
        '[)'
      ) as occupied
    from public.schedule_draft_shifts shift
    join public.locations location on location.id = shift.location_id
    left join public.employee_profiles employee on employee.id = shift.employee_id
    where shift.draft_id = target_draft.id
      and shift.location_id = any(normalized_locations)
      and public.schedule_shift_in_department_scope_service(
        shift.job_id, normalized_departments, effective_include_no_department
      )
  ), raw_findings as (
    select
      'overlap'::text as code, case when first.time_basis='explicit' and second.time_basis='explicit' then 'hard' else 'soft' end::text as severity, (first.time_basis='type_default' or second.time_basis='type_default') as overrideable,
      first.location_id, first.employee_id, first.scheduled_date,
      array[first.id, second.id]::uuid[] as shift_ids,
      first.employee_name || case when first.time_basis='type_default' or second.time_basis='type_default' then ' has overlapping reference hours on ' else ' has overlapping shifts on ' end || first.scheduled_date::text || '.' as message
    from next_shift first
    join next_shift second on second.employee_id = first.employee_id and second.id > first.id
      and first.employee_id is not null and first.time_basis in ('explicit','type_default') and second.time_basis in ('explicit','type_default') and first.occupied && second.occupied
    union all
    select
      'closed_location', 'soft', true, shift.location_id, shift.employee_id,
      shift.scheduled_date, array[shift.id]::uuid[],
      shift.location_name || case when reach.closed then ' is closed on ' else ' has short hours on ' end
        || shift.scheduled_date::text || '.'
    from next_shift shift
    cross join lateral (
      select bool_or(closure.kind = 'closed') closed
      from public.schedule_closures closure
      where closure.location_id = shift.location_id
        and closure.closed_date = shift.scheduled_date
        and app_private.closure_covers(closure.kind, closure.window_start, closure.window_end, shift.start_time, shift.end_time)
    ) reach
    where reach.closed is not null
  ), findings as (
    select encode(extensions.digest(convert_to(
      code || '|' || coalesce(employee_id::text, '') || '|' || scheduled_date::text || '|' || array_to_string(shift_ids, ','),
      'UTF8'), 'sha256'), 'hex') as id, *
    from raw_findings
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'code', code, 'severity', severity, 'overrideable', overrideable,
    'message', message, 'location_id', location_id, 'employee_id', employee_id,
    'scheduled_date', scheduled_date, 'shift_ids', to_jsonb(shift_ids)
  ) order by severity, code, scheduled_date, id), '[]'::jsonb),
  count(*) filter (where severity = 'hard')::integer,
  count(*) filter (where severity = 'soft')::integer
  into finding_payload, hard_count, soft_count
  from findings;

  unsigned_payload := jsonb_build_object(
    'workspace_id', target_workspace_id,
    'week_start', target_draft.week_start,
    'draft_id', target_draft.id,
    'draft_revision', target_draft.revision,
    'locations', coalesce(location_payload, '[]'::jsonb),
    'findings', finding_payload
  );
  preview_fingerprint := encode(extensions.digest(convert_to(unsigned_payload::text, 'UTF8'), 'sha256'), 'hex');
  return app_private.schedule_publication_changes_since_start(public.weekly_schedule_publication_preflight(
    unsigned_payload || jsonb_build_object(
      'status', case when hard_count > 0 then 'hard_blocked'
        when soft_count > 0 then 'override_required' else 'publish_ready' end,
      'fingerprint', preview_fingerprint
    ), actor_user_id, target_department_ids, include_no_department));
end;
$$;

CREATE OR REPLACE FUNCTION "public"."assess_weekly_shift_availability"("w" "uuid", "emp" "uuid", "shift" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare loc uuid:=(shift->>'location_id')::uuid; day date:=coalesce(shift->>'scheduled_date',shift->>'date')::date;
 zone_name text; preference_zone text; basis text:=coalesce(shift->>'time_basis','explicit'); start_clock time; end_clock time;
 local_start timestamp; local_end timestamp; start_at timestamptz; end_at timestamptz; span tstzrange; day_span tstzrange;
 capacity jsonb; remaining tstzmultirange; unavailable tstzmultirange:='{}'; leave_ranges tstzmultirange:='{}';
 leave_evidence jsonb:='[]'; reasons jsonb:='[]'; settings public.workspace_scheduling_settings%rowtype;
 leave_row record; leave_span tstzrange; coverage text; operation text; fingerprint_payload jsonb;
 conflict_severity text; rule_severity text; rule jsonb; annotated jsonb:='[]'; availability_fingerprint text;
 neighbor record; neighbor_span tstzrange; gap_minutes numeric; schedule_week date; schedule_locations uuid[];
 edit_id uuid:=nullif(shift->>'session_id','')::uuid; context_draft_id uuid:=nullif(shift->>'draft_id','')::uuid;
 exclude_id uuid:=coalesce(nullif(shift->>'_exclude_shift_id',''),shift->>'source_shift_id',shift->>'id')::uuid;
 -- BL-092: shifts this person gives up in the same operation (the other side
 -- of a swap) are not theirs any more when this one becomes theirs.
 given_up uuid[]:=array(select value::uuid from jsonb_array_elements_text(
  case when jsonb_typeof(shift->'_exclude_shift_ids')='array' then shift->'_exclude_shift_ids' else '[]'::jsonb end)
  where value is not null);
 missing_time boolean; invalid_clock boolean:=false; ambiguous_clock boolean:=false;
begin
 select l.timezone,coalesce(nullif(shift->>'time_timezone',''),nullif(shift->'time_snapshot'->>'timezone',''),l.timezone)
  into preference_zone,zone_name from public.locations l where l.workspace_id=w and l.id=loc;
 if day is null or not isfinite(day) or zone_name is null or preference_zone is null
  or not app_private.timezone_name_valid(zone_name)
  or not app_private.timezone_name_valid(preference_zone) then
  raise exception 'A valid location, date and timezone are required for availability assessment' using errcode='22023'; end if;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 if settings.workspace_id is null then raise exception 'Scheduling settings unavailable' using errcode='P0002'; end if;
 if basis not in ('explicit','type_default') then
  raise exception 'Unknown shift time source' using errcode='22023'; end if;
 if basis='type_default' then
  start_clock:=nullif(shift->'time_snapshot'->>'start_time','')::time;
  end_clock:=nullif(shift->'time_snapshot'->>'end_time','')::time;
  if (start_clock,end_clock) is distinct from (nullif(shift->>'start_time','')::time,nullif(shift->>'end_time','')::time) then
   raise exception 'Saved reference hours and their snapshot must agree' using errcode='22023'; end if;
 elsif basis='explicit' then
  start_clock:=nullif(shift->>'start_time','')::time; end_clock:=nullif(shift->>'end_time','')::time;
 end if;
 invalid_clock:=start_clock is not null and start_clock=end_clock;
 missing_time:=start_clock is null or end_clock is null or start_clock=end_clock;
 day_span:=tstzrange(day::timestamp at time zone zone_name,(day+1)::timestamp at time zone zone_name,'[)');
 if not missing_time then
  local_start:=day+start_clock;
  local_end:=day+end_clock+case when end_clock<start_clock then interval '1 day' else interval '0' end;
  start_at:=local_start at time zone zone_name; end_at:=local_end at time zone zone_name;
  invalid_clock:=(start_at at time zone zone_name)<>local_start or (end_at at time zone zone_name)<>local_end or end_at<=start_at;
  if not invalid_clock then
   span:=tstzrange(start_at,end_at,'[)');
   ambiguous_clock:=exists(select 1 from (values(start_at,local_start),(end_at,local_end)) endpoint(instant,wall)
    cross join (values(interval '-1 day'),(interval '1 day')) probe(delta)
    cross join lateral (select (endpoint.wall at time zone 'UTC')-make_interval(secs=>public.availability_utc_offset(endpoint.instant+probe.delta,zone_name)) alternate) alt
    where alt.alternate<>endpoint.instant and (alt.alternate at time zone zone_name)=endpoint.wall);
  end if;
 end if;
 -- Assignment snapshots locate the actual instants; recurring rules are always
 -- interpreted in the target location's current local timezone.
 capacity:=case when emp is null then jsonb_build_object('unavailable_intervals','[]'::jsonb,'employee_intervals','[]'::jsonb,'manager_intervals','[]'::jsonb)
  else public.weekly_preference_capacity(w,emp,coalesce(span,day_span),preference_zone) end;
 -- Only the employee's own marks are unavailable hours; the note is not (M12).
 select coalesce(range_agg(tstzrange((x->>'start_at')::timestamptz,(x->>'end_at')::timestamptz,'[)')),'{}') into unavailable
  from jsonb_array_elements(capacity->'employee_intervals') x;
 for leave_row in select seg.id,seg.request_id,req.revision,approved_piece.span
  from public.schedule_time_off_segments seg
  join public.schedule_time_off_requests req on req.id=seg.request_id and req.workspace_id=seg.workspace_id
  cross join lateral unnest(public.time_off_effective_ranges(seg.id)) approved_piece(span)
  where req.workspace_id=w and req.employee_id=emp and req.request_type='time_off'
   and req.status = 'approved' and seg.status='approved'
   and seg.segment_date between day-3 and day+3 order by seg.id,lower(approved_piece.span) loop
  leave_span:=leave_row.span*coalesce(span,day_span);
  if not isempty(leave_span) then
   leave_ranges:=leave_ranges+tstzmultirange(leave_span);
   leave_evidence:=leave_evidence||jsonb_build_array(jsonb_build_object('segment_id',leave_row.id,'request_id',leave_row.request_id,
    'request_revision',leave_row.revision,'intervals',public.availability_ranges_json(tstzmultirange(leave_span))));
  end if;
 end loop;
 remaining:=tstzmultirange(coalesce(span,day_span))-(unavailable+leave_ranges);
 coverage:=case when span is null then 'unknown' when isempty(remaining) then 'none' when remaining @> span then 'full' else 'partial' end;
 if not isempty(leave_ranges) then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','approved_time_off',
  'message','Approved time off overlaps this assignment. Resolve the leave or assignment before assigning.',
  'intervals',public.availability_ranges_json(leave_ranges),'definite',span is not null or leave_ranges @> day_span)); end if;
 -- The employee's own mark is always only a warning (M8); a manager's note is
 -- a reminder shown while writing, nothing more (M12).
 if span is not null and jsonb_array_length(capacity->'employee_intervals')>0 then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','availability',
  'message','The assignment overlaps unavailable hours.','intervals',capacity->'employee_intervals','definite',true)); end if;
 if span is not null and jsonb_array_length(capacity->'manager_intervals')>0 then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','note',
  'message','The assignment overlaps hours a manager noted for this person.','intervals',capacity->'manager_intervals','definite',true)); end if;
 if missing_time then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','time_source_unresolved',
  'message','Confirm shift hours before assigning or publishing.','definite',false)); end if;
 if invalid_clock then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','invalid_local_time',
  'message','These hours do not exist on this date in the selected timezone. Choose valid hours.','definite',true)); end if;
 -- Required schedule references are hard constraints. Availability-only callers
 -- without a job descriptor retain their existing contract.
 if shift ? 'job_id' then
  if not exists(select 1 from public.locations where workspace_id=w and id=loc and archived_at is null)
   or not exists(select 1 from public.jobs where workspace_id=w and id=(shift->>'job_id')::uuid and archived_at is null)
   or (nullif(shift->>'shift_type_id','') is not null and not exists(select 1 from public.shift_types where workspace_id=w and id=(shift->>'shift_type_id')::uuid and archived_at is null)) then
   reasons:=reasons||jsonb_build_array(jsonb_build_object('code','invalid_reference','message','A location, job or shift type is no longer available.','definite',true));
  end if;
  if emp is not null then
   -- Excluded from Schedule keeps a person out of new shifts only (BL-218): a
   -- shift already published with them stays theirs through edits and republishing.
   if not exists(select 1 from public.employee_profiles where workspace_id=w and id=emp and archived_at is null and (start_date is null or start_date<=day)
     and (not is_excluded_from_schedule or exists(select 1 from public.schedule_published_shifts published
       where published.workspace_id=w and published.employee_id=emp
         and published.source_shift_id=coalesce(nullif(shift->>'source_shift_id',''),shift->>'id')::uuid))) then
    reasons:=reasons||jsonb_build_array(jsonb_build_object('code','employee_inactive','message','Employee is not active in Schedule.','definite',true));
   end if;
   if not exists(select 1 from public.employee_location_assignments where workspace_id=w and employee_id=emp and location_id=loc and ended_at is null)
    or not exists(select 1 from public.employee_job_assignments where workspace_id=w and employee_id=emp and job_id=(shift->>'job_id')::uuid and ended_at is null) then
    reasons:=reasons||jsonb_build_array(jsonb_build_object('code','assignment_missing','message','Employee needs an active location and job assignment.','definite',true));
   end if;
  end if;
  if exists(select 1 from public.schedule_closures c where c.workspace_id=w and c.location_id=loc and c.closed_date=day
   and app_private.closure_covers(c.kind,c.window_start,c.window_end,start_clock,end_clock)) then
   reasons:=reasons||jsonb_build_array(jsonb_build_object('code','closed_location','message','Location is closed or has short hours at this time.','definite',true));
  end if;
 end if;
 -- The edit session replaces its week; a saved draft replaces its week. Other
 -- current publications remain relevant across locations and week boundaries.
 select week_start,location_ids into schedule_week,schedule_locations from public.schedule_edit_sessions where workspace_id=w and id=edit_id;
 if schedule_week is null then select week_start,location_ids into schedule_week,schedule_locations from public.schedule_drafts where workspace_id=w and id=context_draft_id; end if;
 if span is not null and emp is not null and shift ? 'job_id' then
  for neighbor in
   select s.id,s.location_id,s.scheduled_date,s.start_time,s.end_time,s.time_basis,coalesce(s.time_timezone,l.timezone) zone
    from public.schedule_edit_session_shifts s join public.locations l on l.id=s.location_id and l.workspace_id=w
    where s.workspace_id=w and s.session_id=edit_id and s.employee_id=emp and s.pending_op_type is distinct from 'delete'
     and s.id is distinct from exclude_id and not s.id=any(given_up) and s.scheduled_date between day-2 and day+2
     and (not (shift ? '_publish_locations') or (s.location_id in (select value::uuid from jsonb_array_elements_text(shift->'_publish_locations'))
      and public.schedule_shift_in_department_scope_service(s.job_id,
       case when jsonb_typeof(shift->'_publish_departments')='array' then array(select value::uuid from jsonb_array_elements_text(shift->'_publish_departments')) end,
       coalesce((shift->>'_publish_no_department')::boolean,true))))
   union all
   select s.id,s.location_id,s.scheduled_date,s.start_time,s.end_time,s.time_basis,coalesce(s.time_timezone,l.timezone)
    from public.schedule_draft_shifts s join public.locations l on l.id=s.location_id and l.workspace_id=w
    where edit_id is null and s.workspace_id=w and s.draft_id=context_draft_id and s.employee_id=emp
     and s.id is distinct from exclude_id and not s.id=any(given_up) and s.scheduled_date between day-2 and day+2
     and (not (shift ? '_publish_locations') or (s.location_id in (select value::uuid from jsonb_array_elements_text(shift->'_publish_locations'))
      and public.schedule_shift_in_department_scope_service(s.job_id,
       case when jsonb_typeof(shift->'_publish_departments')='array' then array(select value::uuid from jsonb_array_elements_text(shift->'_publish_departments')) end,
       coalesce((shift->>'_publish_no_department')::boolean,true))))
   union all
   select s.id,s.location_id,s.scheduled_date,s.start_time,s.end_time,s.time_basis,coalesce(s.time_timezone,l.timezone)
    from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current'
    join public.locations l on l.id=s.location_id and l.workspace_id=w
    where s.workspace_id=w and s.employee_id=emp and (shift ? '_publish_locations' or (s.id is distinct from exclude_id and s.source_shift_id is distinct from exclude_id
     and not s.id=any(given_up) and not coalesce(s.source_shift_id,s.id)=any(given_up)))
     and s.scheduled_date between day-2 and day+2
     and (schedule_week is null or s.scheduled_date not between schedule_week and schedule_week+6
      or not s.location_id = any(coalesce(schedule_locations, '{}'))
      or (shift ? '_publish_locations' and not (s.location_id in (select value::uuid from jsonb_array_elements_text(shift->'_publish_locations'))
       and public.schedule_shift_in_department_scope_service(s.job_id,
        case when jsonb_typeof(shift->'_publish_departments')='array' then array(select value::uuid from jsonb_array_elements_text(shift->'_publish_departments')) end,
        coalesce((shift->>'_publish_no_department')::boolean,true)))))
   order by 1
  loop
   neighbor_span:=app_private.shift_time_range(neighbor.scheduled_date,neighbor.start_time,neighbor.end_time,neighbor.zone);
   if span && neighbor_span then
    reasons:=reasons||jsonb_build_array(jsonb_build_object('code','time_overlap','message','Employee already has an overlapping shift.','definite',true,
     'intervals',public.availability_ranges_json(tstzmultirange(span*neighbor_span))));
   else
    gap_minutes:=extract(epoch from greatest(lower(span)-upper(neighbor_span),lower(neighbor_span)-upper(span)))/60;
    if neighbor.location_id<>loc and gap_minutes<settings.minimum_travel_minutes then
     reasons:=reasons||jsonb_build_array(jsonb_build_object('code','minimum_travel','message','There is not enough travel time between locations.','definite',true));
    end if;
    if gap_minutes<settings.minimum_rest_minutes then
     reasons:=reasons||jsonb_build_array(jsonb_build_object('code','minimum_rest','message','There is not enough rest time between shifts.','definite',true));
    end if;
   end if;
  end loop;
 end if;
 reasons:=reasons||app_private.document_shift_reasons(w,emp,day,coalesce(start_at,lower(day_span))); conflict_severity:='allow';
 for rule in select value from jsonb_array_elements(reasons) loop
  rule_severity:=case rule->>'code'
   when 'availability' then 'warn'
   when 'note' then 'warn'
   when 'approved_time_off' then settings.conflict_rules->>'approved_time_off'
   -- K17: "confirm once" asks like "confirm"; its answer holds for the editing session.
   when 'closed_location' then case settings.conflict_rules->>'closed_location' when 'confirm_once' then 'confirm' else settings.conflict_rules->>'closed_location' end
   when 'minimum_travel' then case when shift ? '_shift_exchange' then 'allow' else settings.conflict_rules->>'minimum_travel' end
   when 'minimum_rest' then case when shift ? '_shift_exchange' then 'allow' else settings.conflict_rules->>'minimum_rest' end when 'document_required' then settings.conflict_rules->>'document_required' when 'document_conditional_grace' then settings.conflict_rules->>'document_conditional_grace' when 'document_conditional_overdue' then settings.conflict_rules->>'document_conditional_overdue'
   when 'time_source_unresolved' then 'confirm'
   else 'block' end;
  if rule->>'code' not in ('availability','note') and array_position(array['allow','warn','confirm','block'],rule_severity)>array_position(array['allow','warn','confirm','block'],conflict_severity) then conflict_severity:=rule_severity; end if;
  if rule_severity<>'allow' then annotated:=annotated||jsonb_build_array(rule||jsonb_build_object('severity',rule_severity)
   ||case when rule->>'code'='closed_location' and settings.conflict_rules->>'closed_location'='confirm_once'
    then jsonb_build_object('confirm_scope','edit_session') else '{}'::jsonb end); end if;
 end loop;
 reasons:=annotated;
 operation:=case conflict_severity when 'block' then 'blocked' when 'allow' then 'allowed' else 'warning_requires_override' end;
 -- Revision counters, manager notes and unrelated weekdays/settings are not
 -- conflict identity. The adapters use warning_policy to decide warn/confirm.
 -- Availability is not a conflict: it has its own fingerprint below, which
 -- changes with the person, the shift, its hours or the overlapping marks.
 if span is not null and not isempty(unavailable) then
  availability_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('workspace_id',w,'employee_id',emp,
   'assignment',coalesce(shift->>'source_shift_id',shift->>'id'),'location_id',loc,'date',day,
   'intervals',public.availability_ranges_json(tstzmultirange(span)),
   'employee_intervals',capacity->'employee_intervals')::text,'UTF8'),'sha256'),'hex');
 end if;
 fingerprint_payload:=jsonb_build_object('workspace_id',w,'employee_id',emp,
  'assignment',jsonb_build_object('id',coalesce(shift->>'source_shift_id',shift->>'id'),'location_id',loc,'date',day),
  'intervals',public.availability_ranges_json(case when span is null then '{}'::tstzmultirange else tstzmultirange(span) end),
  'leave',public.availability_ranges_json(leave_ranges),
  'warning_policy',case when conflict_severity='confirm' then 'confirm' else 'warn' end,'operation',operation,
  'conflict_rules',settings.conflict_rules,'minimum_travel_minutes',settings.minimum_travel_minutes,'minimum_rest_minutes',settings.minimum_rest_minutes,
  'reasons',(select coalesce(jsonb_agg(r),'[]') from jsonb_array_elements(reasons) r where r->>'code' not in ('availability','note')));
 return jsonb_build_object('coverage',coverage,'operation',operation,'time_basis',basis,'timezone',zone_name,'preference_timezone',preference_zone,
  'assessment_scope',case when span is null then 'calendar_day' else 'shift_interval' end,
  'intervals',public.availability_ranges_json(case when span is null then '{}'::tstzmultirange else tstzmultirange(span) end),
  'available_intervals',case when span is null then '[]'::jsonb else public.availability_ranges_json(remaining) end,
  'unavailable_intervals',public.availability_ranges_json(unavailable+leave_ranges),
  'unknown_intervals',case when span is null then public.availability_ranges_json(tstzmultirange(day_span)) else '[]'::jsonb end,
  'employee_intervals',capacity->'employee_intervals','manager_intervals',capacity->'manager_intervals',
  'has_availability_conflict',span is not null and not isempty(unavailable),'availability_fingerprint',availability_fingerprint,'conflict_severity',conflict_severity,
  'warning_policy',case when conflict_severity='confirm' then 'confirm' else 'warn' end,
  'leave',leave_evidence,'reasons',reasons,
  'policy_revision',settings.availability_preferences_revision,
  'fold_resolution',case when ambiguous_clock then 'post_transition_offset' else null end,
  'assessment_minutes',case when span is null then null else extract(epoch from upper(span)-lower(span))/60 end,
  'fingerprint',encode(extensions.digest(convert_to(fingerprint_payload::text,'UTF8'),'sha256'),'hex'));
end; $$;


ALTER FUNCTION "public"."assess_weekly_shift_availability"("w" "uuid", "emp" "uuid", "shift" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_organization_setting_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  actor_id uuid := (select auth.uid());
  row_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
  tenant_id uuid := case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end;
  archived boolean := case
    when tg_table_name = 'workspaces' then false
    else (case when tg_op = 'DELETE' then old.archived_at else new.archived_at end) is not null
  end;
  action_name text;
begin
  if actor_id is null then return case when tg_op = 'DELETE' then old else new end; end if;

  action_name := case
    when tg_table_name = 'workspaces' then 'workspace.identity_updated'
    when tg_op = 'INSERT' then left(tg_table_name, -1) || '.created'
    when archived then left(tg_table_name, -1) || '.archived'
    else left(tg_table_name, -1) || '.updated'
  end;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id
  ) values (
    tenant_id, actor_id, action_name, left(tg_table_name, -1), row_id::text
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."read_settings_important_dates_service"("actor_user_id" "uuid", "target_workspace_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  writable uuid[];
  wide boolean;
  reader app_private.actor_state;
  -- K11: nothing before the Schedule's editable week changes.
  line date := public.schedule_current_week_start_service(target_workspace_id);
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.important_dates.read');
  reader := app_private.actor(actor_user_id, target_workspace_id);
  writable := app_private.scope_set(actor_user_id, target_workspace_id, 'important_date.write');
  wide := app_private.authz_reason(actor_user_id, target_workspace_id, 'important_date.write_wide') is null;
  return jsonb_build_object(
    'can_manage', wide or cardinality(writable) > 0,
    'can_target_workspace', wide,
    'locked_before', line,
    'dates', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.starts_on, d.title, d.id), '[]'::jsonb)
      from (
        select date_row.id, date_row.workspace_id, date_row.location_id, date_row.location_ids,
          date_row.title, date_row.type, date_row.starts_on, date_row.ends_on, date_row.recurrence,
          date_row.note, date_row.all_day, to_char(date_row.start_time, 'HH24:MI') as start_time,
          to_char(date_row.end_time, 'HH24:MI') as end_time, date_row.location_days, date_row.archived_at, date_row.status, date_row.revision,
          date_row.created_by, coalesce(author.display_name, 'Workspace member') as author_name,
          date_row.updated_at,
          app_private.important_date_is_past(date_row, line) as is_past,
          (select location.name from public.locations location
           where location.id = date_row.location_id and location.workspace_id = date_row.workspace_id) as location_name,
          (select coalesce(jsonb_agg(coalesce(location.name, 'Archived location') order by location.sort_order nulls last, location.name, listed.n), '[]'::jsonb)
           from unnest(date_row.location_ids) with ordinality listed(id, n)
           left join public.locations location
             on location.id = listed.id and location.workspace_id = date_row.workspace_id
            and location.deleted_at is null) as location_names,
          control.allowed and not app_private.important_date_is_past(date_row, line) and date_row.archived_at is null as can_edit,
          control.allowed and not app_private.important_date_is_past(date_row, line) and date_row.archived_at is null and date_row.status = 'published' as can_unpublish,
          control.allowed and not app_private.important_date_is_past(date_row, line) and date_row.archived_at is null and date_row.status = 'unpublished' as can_republish,
          control.allowed and not app_private.important_date_is_past(date_row, line) and date_row.archived_at is null as can_archive,
          control.allowed and not app_private.important_date_is_past(date_row, line) and date_row.archived_at is not null as can_restore
        from public.important_dates date_row
        left join public.user_profiles author on author.user_id = date_row.created_by
        cross join lateral (
          select app_private.communication_reason(reader, target_workspace_id, 'important_date',
            date_row.location_ids, date_row.created_by) is null allowed) control
        -- important_date_visible, with the reader's state read once for the list.
        where date_row.workspace_id = target_workspace_id
          and (control.allowed or app_private.important_date_out_to(reader, date_row))
      ) d),
    'locations', app_private.settings_locations(target_workspace_id, writable)
  );
end;
$$;
