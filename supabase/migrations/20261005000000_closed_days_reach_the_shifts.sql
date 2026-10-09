-- FB-6.7 C (the adding half): a "Closed day" reaches the shifts already on it,
-- past important dates are locked like past Schedule weeks, and an
-- announcement that ran out or could not go out says so. Rules: KARARLAR
-- "Duyurular ve önemli tarihler" K11-K18; KK-97, KK-98.
--
--   K11 nobody writes a day before the Schedule's editable week
--       (schedule_current_week_start_service), the owner included. A date
--       wholly before it is read-only; a change to one that began before it
--       leaves the days already gone as their own record and changes what is
--       ahead: a one-time date keeps its past days, a yearly one keeps each
--       past year as a one-time record of that year.
--   KK-97 the Schedule's closed days are every published closed day, the past
--       ones too (a past one can no longer change, K11).
--   K12 an announcement past its end leaves every inbox once; whoever manages
--       it sees it as "expired".
--   KK-98 a scheduled announcement the release could not publish keeps the
--       error and reads as "publish_failed" until it is saved again.
--   K13 saving a closed day (or republishing one) over published shifts needs
--       the list the screen showed (preview_important_date_closure_service's
--       fingerprint); every listed shift drops to an open shift unless kept.
--   K14 whoever lost a shift hears it once: the closing and the removal.
--   K15 a closed day taken away or moved hands nothing back; the answer says
--       how many shifts it opened stay open.
--   K16 a draft's own shifts on a newly closed day drop to open quietly.
--   K17 "Closed location" gains "confirm once": the first cell asks, and the
--       answer holds for the rest of that editing session (the screen keeps it
--       per session; the server asks for the same per-shift acceptance it
--       always did). 'warn' goes in the removing half (20261005010000).
--   K18 a published shift says when the unavailable mark against it came after
--       publishing.

-- 1. What a record now holds ---------------------------------------------------------------

alter table public.announcements add column release_error text;
-- Who acknowledged an earlier content of it: their acknowledgement was reset
-- by a content change (K4), so the list can say "changed since you
-- acknowledged".
alter table public.announcements add column acknowledged_before uuid[] not null default '{}';

-- Which published shifts a closed day opened (K13), so taking it away can say
-- how many stay open (K15).
create table public.important_date_shift_releases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  important_date_id uuid not null,
  published_shift_id uuid not null,
  source_shift_id uuid not null,
  before_assignment jsonb not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (important_date_id, workspace_id) references public.important_dates (id, workspace_id) on delete cascade
);
create index important_date_shift_releases_date_idx on public.important_date_shift_releases (important_date_id);
alter table public.important_date_shift_releases enable row level security;
revoke all on public.important_date_shift_releases from anon, authenticated;

-- 2. The days a closed day closes ------------------------------------------------------------

-- One rule for the Schedule's view and the services: one row per live location
-- and day; a yearly date in every year from its first to two years ahead; none
-- for any other type. No locations closes every live location (KK-86).
-- Security invoker: the API reads the view as service_role, which reads a
-- location's id, workspace and archived_at.
create function app_private.closure_days(w uuid, kind public.important_date_type, starts date, ends date,
  recurrence public.important_date_recurrence, location_ids uuid[])
returns table (location_id uuid, closed_date date)
language sql
stable
set search_path = ''
as $$
  select location.id, day::date
  from public.locations location
  cross join lateral generate_series(0, case when recurrence = 'annual'
    then greatest(extract(year from current_date)::integer + 2 - extract(year from starts)::integer, 0) else 0 end) as years(n)
  cross join lateral generate_series(starts + make_interval(years => years.n), ends + make_interval(years => years.n),
    interval '1 day') as days(day)
  where kind = 'closed_day' and location.workspace_id = w and location.archived_at is null
    and (cardinality(location_ids) = 0 or location.id = any (location_ids))
$$;
revoke all on function app_private.closure_days(uuid, public.important_date_type, date, date, public.important_date_recurrence, uuid[])
  from public, anon, authenticated;
grant execute on function app_private.closure_days(uuid, public.important_date_type, date, date, public.important_date_recurrence, uuid[])
  to service_role;

-- KK-97: no lower bound any more. Every reader names its workspace (the
-- Schedule read, the conflict engine, the API), so only that workspace's
-- closed days are walked.
create or replace view public.schedule_closures
with (security_invoker = true)
as
select
  md5(date_row.id::text || ':' || day.location_id::text || ':' || day.closed_date::text)::uuid as id,
  date_row.workspace_id,
  day.location_id,
  day.closed_date,
  date_row.title,
  true as is_all_day,
  date_row.created_by,
  date_row.created_at,
  '{}'::uuid[] as shift_type_ids,
  null::date as end_date,
  date_row.id as important_date_id
from public.important_dates date_row
cross join lateral app_private.closure_days(date_row.workspace_id, date_row.type, date_row.starts_on, date_row.ends_on,
  date_row.recurrence, date_row.location_ids) as day
where date_row.type = 'closed_day' and date_row.status = 'published' and date_row.archived_at is null;

-- 3. K11: the past stays as it was ----------------------------------------------------------------

-- A date wholly before the line: read-only.
create function app_private.important_date_is_past(item public.important_dates, line date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select item.recurrence = 'none' and item.ends_on < line
$$;

create function app_private.important_date_refuse_past()
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Past important dates are read-only.' using errcode = 'P0001', hint = 'important_date.past';
end;
$$;

-- Leaves a date's days before the line as records of their own, as they are,
-- and returns the date itself moved to start on or after the line. A one-time
-- date keeps its past days as one record; a yearly one keeps each year whose
-- day began before the line as a one-time record of that year.
-- ponytail: a many-day yearly date edited during one of its own runs keeps
-- that run whole with the old record; split it per day if that ever matters.
create function app_private.important_date_keep_past(item public.important_dates, line date)
returns public.important_dates
language plpgsql
security definer
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
    insert into public.important_dates (workspace_id, title, type, starts_on, ends_on, recurrence, note,
      affects_scheduling, location_ids, location_id, created_by, updated_by, status, archived_at, created_at, content_revision)
    values (item.workspace_id, item.title, item.type, item.starts_on, line - 1, 'none', item.note,
      item.affects_scheduling, item.location_ids, item.location_id, item.created_by, item.updated_by, item.status,
      item.archived_at, item.created_at, item.content_revision);
    update public.important_dates set starts_on = line where id = item.id returning * into kept;
    return kept;
  end if;
  ahead := (select min(k) from generate_series(0, extract(year from line)::integer - extract(year from item.starts_on)::integer + 1) k
            where (item.starts_on + make_interval(years => k))::date >= line);
  if ahead = 0 then
    return item;
  end if;
  for n in 0 .. ahead - 1 loop
    insert into public.important_dates (workspace_id, title, type, starts_on, ends_on, recurrence, note,
      affects_scheduling, location_ids, location_id, created_by, updated_by, status, archived_at, created_at, content_revision)
    values (item.workspace_id, item.title, item.type, (item.starts_on + make_interval(years => n))::date,
      (item.ends_on + make_interval(years => n))::date, 'none', item.note,
      item.affects_scheduling, item.location_ids, item.location_id, item.created_by, item.updated_by, item.status,
      item.archived_at, item.created_at, item.content_revision);
  end loop;
  update public.important_dates
  set starts_on = (item.starts_on + make_interval(years => ahead))::date,
      ends_on = (item.ends_on + make_interval(years => ahead))::date
  where id = item.id returning * into kept;
  return kept;
end;
$$;

-- 4. K13-K16: a closed day and the shifts on it -----------------------------------------------------

-- The published shifts a version of a date would newly close: assigned, in a
-- current publication, not started yet, on a day from the Schedule's editable
-- week on (K11) that this version closes and the stored one (published) did
-- not. "days" are the newly closed days, for the
-- drafts (K16). The fingerprint changes with any listed shift, its person or
-- its hours, so a save on a stale list is refused (K13).
create function app_private.important_date_closure_impact(w uuid, stored public.important_dates, kind text,
  starts date, ends date, recurrence text, location_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with newly as (
    select day.location_id, day.closed_date
    from app_private.closure_days(w, kind::public.important_date_type, starts, ends,
      recurrence::public.important_date_recurrence, coalesce(location_ids, '{}')) day
    where day.closed_date >= public.schedule_current_week_start_service(w)
    except
    select day.location_id, day.closed_date
    from app_private.closure_days(w, stored.type, stored.starts_on, stored.ends_on, stored.recurrence,
      coalesce(stored.location_ids, '{}')) day
    where stored.id is not null and stored.status = 'published' and stored.archived_at is null
  ), shifts as (
    select public.shift_exchange_shift(w, shift.id) || jsonb_build_object('employee_user_id', person.user_id) as x
    from newly
    join public.schedule_published_shifts shift
      on shift.workspace_id = w and shift.location_id = newly.location_id and shift.scheduled_date = newly.closed_date
    join public.schedule_location_publications publication on publication.id = shift.publication_id and publication.status = 'current'
    join public.locations location on location.id = shift.location_id
    left join public.employee_profiles person on person.id = shift.employee_id and person.workspace_id = w
    where shift.employee_id is not null
      and lower(app_private.shift_time_range(shift.scheduled_date, shift.start_time, shift.end_time,
            coalesce(shift.time_timezone, location.timezone))) > now()
  )
  select jsonb_build_object(
    'fingerprint', md5(coalesce((select string_agg(concat_ws('|', x ->> 'id', x ->> 'employee_id', x ->> 'starts_at', x ->> 'ends_at'),
      ',' order by x ->> 'id') from shifts), '')),
    'shifts', coalesce((select jsonb_agg(x order by x ->> 'starts_at', x ->> 'location_name', x ->> 'id') from shifts), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object('location_id', location_id, 'closed_date', closed_date)) from newly), '[]'::jsonb),
    -- K16: a saved draft's own shifts on those days (a copy of a published
    -- shift follows that shift instead).
    'draft_shift_ids', coalesce((
      select jsonb_agg(draft_shift.id)
      from newly
      join public.schedule_draft_shifts draft_shift
        on draft_shift.workspace_id = w and draft_shift.location_id = newly.location_id
       and draft_shift.scheduled_date = newly.closed_date and draft_shift.employee_id is not null
      join public.schedule_drafts draft on draft.id = draft_shift.draft_id and draft.archived_at is null
      where not exists (
        select 1 from public.schedule_published_shifts published
        join public.schedule_location_publications publication
          on publication.id = published.publication_id and publication.status = 'current'
        where published.workspace_id = w and coalesce(published.source_shift_id, published.id) = draft_shift.id)), '[]'::jsonb))
$$;

-- K13 and K16: opens the listed shifts but the kept ones, and quietly opens a
-- draft's own shifts on the newly closed days (a draft's copy of a published
-- shift follows that shift). Returns the opened shifts. Asks the core for
-- schedule.edit where it changes the schedule.
create function app_private.important_date_close_shifts(actor uuid, item public.important_dates, impact jsonb, keep uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s jsonb;
  opened jsonb := coalesce((select jsonb_agg(x) from jsonb_array_elements(impact -> 'shifts') x
                            where not (x ->> 'id')::uuid = any (coalesce(keep, '{}'))), '[]'::jsonb);
  drafts uuid[] := array(select value::uuid from jsonb_array_elements_text(impact -> 'draft_shift_ids'));
  places uuid[];
  other record;
begin
  places := array(
    select distinct (x ->> 'location_id')::uuid from jsonb_array_elements(opened) x
    union select draft_shift.location_id from public.schedule_draft_shifts draft_shift where draft_shift.id = any (drafts));
  if cardinality(places) = 0 then
    return '[]'::jsonb;
  end if;
  perform app_private.authorize(actor, item.workspace_id, 'schedule.edit', target_locations => places);

  for s in select x from jsonb_array_elements(opened) x loop
    insert into public.important_date_shift_releases (workspace_id, important_date_id, published_shift_id, source_shift_id,
      before_assignment, actor_user_id)
    values (item.workspace_id, item.id, (s ->> 'id')::uuid, (s ->> 'source_id')::uuid, s, actor);
    update public.schedule_published_shifts set employee_id = null
    where workspace_id = item.workspace_id and id = (s ->> 'id')::uuid and employee_id = (s ->> 'employee_id')::uuid;
    if not found then
      raise exception 'A shift on this closed day changed. Review the shifts again.'
        using errcode = '40001', hint = 'important_date.closure_changed';
    end if;
  end loop;

  with dropped as (
    update public.schedule_draft_shifts draft_shift
    set employee_id = null, revision = draft_shift.revision + 1, updated_at = now()
    where draft_shift.id = any (drafts)
    returning draft_shift.draft_id
  )
  update public.schedule_drafts set revision = revision + 1, updated_at = now()
  where id in (select draft_id from dropped);

  if jsonb_array_length(opened) > 0 then
    perform public.shift_exchange_reconcile_batch(actor, item.workspace_id,
      (select jsonb_agg(x || jsonb_build_object('new_employee_id', null)) from jsonb_array_elements(opened) x));
    -- ponytail: the same steps approved time off takes (time_off_release_shifts).
    for other in
      select c.id from public.shift_exchange_cases c
      where c.workspace_id = item.workspace_id and c.status = 'open'
        and exists (select 1 from jsonb_array_elements(opened) x
                    where (x ->> 'source_id')::uuid in (c.offered_source_id, c.requested_source_id))
    loop
      update public.shift_exchange_cases set status = 'invalidated', revision = revision + 1, updated_at = now() where id = other.id;
      update public.shift_exchange_applications set status = 'invalidated', updated_at = now()
      where case_id = other.id and status in ('invited', 'pending_manager');
      perform public.shift_exchange_emit(actor, item.workspace_id, other.id, null, 'invalidated',
        'An involved assignment was opened by a closed day. Review the current schedule.');
    end loop;
    perform realtime.send(jsonb_build_object('workspace_id', item.workspace_id, 'important_date_id', item.id),
      'changed', 'shift-exchanges:' || item.workspace_id::text, true);
  end if;
  return opened;
end;
$$;

-- K14: whoever lost a shift hears it once, the closing and the removal
-- together ("Kadikoy is closed on Oct 24 — your shift was removed"), in place
-- of any notice of this date they had. Never its author (KK-89). Returns who
-- was told.
create function app_private.important_date_tell_removed(item public.important_dates, opened jsonb)
returns uuid[]
language plpgsql
security definer
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
        'title', left(person.first_place || ' is closed on ' || to_char(person.first_day, 'Mon FMDD') || ' — your shift was removed', 160),
        'body', left(array_to_string(person.lines, '; '), 2000),
        'safe_preview', 'A closed day removed your shift.',
        'action_url', '/app/schedule?date=' || person.first_day::text,
        'group_key', 'important_date:' || item.id::text,
        'visible_at', now()),
      now());
    told := told || person.who;
  end loop;
  return told;
end;
$$;

-- K15: the shifts this date opened that are still open, ahead, and no longer
-- on one of its closed days.
create function app_private.important_date_stay_open(item public.important_dates)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct shift.id)::integer
  from public.important_date_shift_releases released
  join public.schedule_published_shifts shift
    on shift.workspace_id = released.workspace_id and coalesce(shift.source_shift_id, shift.id) = released.source_shift_id
  join public.schedule_location_publications publication on publication.id = shift.publication_id and publication.status = 'current'
  join public.locations location on location.id = shift.location_id
  where released.important_date_id = item.id and released.workspace_id = item.workspace_id and shift.employee_id is null
    and lower(app_private.shift_time_range(shift.scheduled_date, shift.start_time, shift.end_time,
          coalesce(shift.time_timezone, location.timezone))) > now()
    and not exists (
      select 1 from app_private.closure_days(item.workspace_id, item.type, item.starts_on, item.ends_on, item.recurrence, item.location_ids) day
      where item.status = 'published' and item.archived_at is null
        and day.location_id = shift.location_id and day.closed_date = shift.scheduled_date)
$$;

-- K13: what a closed day would land on, for the screen to list before saving.
-- Whoever may save the date may look (K1-K3); the list shows the shifts at the
-- locations they read the Schedule of, the rest only as a count. The
-- fingerprint covers them all, and dropping any needs schedule.edit there.
create function public.preview_important_date_closure_service(actor_user_id uuid, target_workspace_id uuid,
  target_important_date_id uuid, target_type text, target_starts_on date, target_ends_on date, target_recurrence text,
  target_location_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  stored public.important_dates;
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
  if target_type not in ('holiday', 'event', 'blackout', 'closed_day') or target_recurrence not in ('none', 'annual')
     or target_starts_on is null or target_ends_on is null or target_ends_on < target_starts_on then
    raise exception 'valid important date required' using errcode = '22023';
  end if;
  return (
    select jsonb_build_object(
      'fingerprint', impact ->> 'fingerprint',
      'shifts', coalesce((select jsonb_agg(x order by ord) from jsonb_array_elements(impact -> 'shifts') with ordinality listed(x, ord)
                          where (x ->> 'location_id')::uuid = any (reach)), '[]'::jsonb),
      'hidden_shift_count', (select count(*) from jsonb_array_elements(impact -> 'shifts') x
                             where not (x ->> 'location_id')::uuid = any (reach)),
      'draft_shift_count', jsonb_array_length(impact -> 'draft_shift_ids'))
    from app_private.important_date_closure_impact(target_workspace_id, stored, target_type, target_starts_on,
      target_ends_on, target_recurrence, target_location_ids) impact,
      lateral (select app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.read') reach) scope);
end;
$$;
revoke all on function public.preview_important_date_closure_service(uuid, uuid, uuid, text, date, date, text, uuid[]) from public, anon, authenticated;
grant execute on function public.preview_important_date_closure_service(uuid, uuid, uuid, text, date, date, text, uuid[]) to service_role;

-- 5. Saving and changing an important date ---------------------------------------------------------

drop function public.save_important_date_service(uuid, uuid, uuid, text, text, date, date, text, text, boolean, uuid[], integer);

-- Adds an important date, or changes one (K1-K4), never before the line (K11).
-- A closed day over published shifts needs the listed shifts' fingerprint and
-- opens them but the kept ones (K13-K16).
create function public.save_important_date_service(actor_user_id uuid, target_workspace_id uuid,
  target_important_date_id uuid, target_title text, target_type text, target_starts_on date, target_ends_on date,
  target_recurrence text, target_note text, target_affects_scheduling boolean, target_location_ids uuid[],
  target_expected_revision integer, target_keep_shift_ids uuid[] default '{}', target_expected_fingerprint text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.important_dates;
  before public.important_dates;
  line date := public.schedule_current_week_start_service(target_workspace_id);
  content_changed boolean := true;
  untouched boolean := false;
  was public.important_dates;
  ahead integer;
  impact jsonb;
  opened jsonb := '[]';
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
      raise exception 'Restore this date before you edit it' using errcode = '40001';
    end if;
    if before.revision is distinct from target_expected_revision then
      raise exception 'This date changed. Reload and try again.' using errcode = '40001';
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
  if char_length(btrim(coalesce(target_title, ''))) not between 1 and 120 or char_length(coalesce(target_note, '')) > 500
     or target_type not in ('holiday', 'event', 'blackout', 'closed_day') or target_recurrence not in ('none', 'annual')
     or target_starts_on is null or target_ends_on is null or target_ends_on < target_starts_on then
    raise exception 'valid important date required' using errcode = '22023';
  end if;
  if target_type = 'closed_day' then
    target_affects_scheduling := true;
  end if;

  -- K11. A save that changes nothing touches nothing.
  if before.id is not null then
    untouched := (before.title, before.type::text, before.starts_on, before.ends_on, before.recurrence::text, before.note,
      before.affects_scheduling, before.location_ids)
      is not distinct from (btrim(target_title), target_type, target_starts_on, target_ends_on, target_recurrence,
      coalesce(target_note, ''), coalesce(target_affects_scheduling, true), target_location_ids);
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
    end if;
  end if;

  -- K13: what a published closed day would newly land on.
  if before.id is null or before.status = 'published' then
    impact := app_private.important_date_closure_impact(target_workspace_id, before, target_type, target_starts_on,
      target_ends_on, target_recurrence, target_location_ids);
    if jsonb_array_length(impact -> 'shifts') > 0
       and target_expected_fingerprint is distinct from impact ->> 'fingerprint' then
      raise exception 'Review the shifts on this closed day again.' using errcode = '40001', hint = 'important_date.closure_changed';
    end if;
  end if;

  if before.id is not null and not untouched then
    -- The history keeps the version as it was, not the part left ahead.
    was := before;
    before := app_private.important_date_keep_past(before, line);
  end if;

  if target_important_date_id is null then
    insert into public.important_dates (workspace_id, title, type, starts_on, ends_on, recurrence, note,
      affects_scheduling, location_ids, location_id, created_by, updated_by)
    values (target_workspace_id, btrim(target_title), target_type::public.important_date_type, target_starts_on,
      target_ends_on, target_recurrence::public.important_date_recurrence, coalesce(target_note, ''),
      coalesce(target_affects_scheduling, true), target_location_ids,
      case when cardinality(target_location_ids) = 1 then target_location_ids[1] end, actor_user_id, actor_user_id)
    returning * into item;
  else
    content_changed := (before.title, before.type::text, before.starts_on, before.ends_on, before.recurrence::text,
      before.note, before.affects_scheduling)
      is distinct from (btrim(target_title), target_type, target_starts_on, target_ends_on, target_recurrence,
      coalesce(target_note, ''), coalesce(target_affects_scheduling, true));
    update public.important_dates
    set title = btrim(target_title), type = target_type::public.important_date_type, starts_on = target_starts_on,
        ends_on = target_ends_on, recurrence = target_recurrence::public.important_date_recurrence,
        note = coalesce(target_note, ''), affects_scheduling = coalesce(target_affects_scheduling, true),
        location_ids = target_location_ids,
        location_id = case when cardinality(target_location_ids) = 1 then target_location_ids[1] end,
        content_revision = content_revision + case when content_changed then 1 else 0 end,
        revision = revision + 1, updated_by = actor_user_id, updated_at = now()
    where id = before.id
    returning * into item;
  end if;

  if impact is not null then
    opened := app_private.important_date_close_shifts(actor_user_id, item, impact, target_keep_shift_ids);
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
    removed := app_private.important_date_tell_removed(item, opened);
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
    'shifts_opened', jsonb_array_length(opened),
    'draft_shifts_opened', coalesce(jsonb_array_length(impact -> 'draft_shift_ids'), 0),
    'shifts_stay_open', case when before.id is null then 0 else app_private.important_date_stay_open(item) end);
end;
$$;

drop function public.set_important_date_state_service(uuid, uuid, uuid, text);

-- Unpublish, republish, archive, restore an important date (Mert, 2026-10-02),
-- never one wholly before the line, and only what is ahead of it (K11).
-- Republishing a closed day over published shifts works like saving one
-- (K13); unpublishing or archiving one says how many shifts stay open (K15).
create function public.set_important_date_state_service(actor_user_id uuid, target_workspace_id uuid,
  target_important_date_id uuid, target_action text, target_keep_shift_ids uuid[] default '{}',
  target_expected_fingerprint text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.important_dates;
  before public.important_dates;
  line date := public.schedule_current_week_start_service(target_workspace_id);
  was public.important_dates;
  impact jsonb;
  opened jsonb := '[]';
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
    raise exception 'This date changed. Reload and try again.' using errcode = '40001';
  end if;

  if target_action = 'republish' then
    impact := app_private.important_date_closure_impact(target_workspace_id, before, before.type::text, before.starts_on,
      before.ends_on, before.recurrence::text, before.location_ids);
    if jsonb_array_length(impact -> 'shifts') > 0
       and target_expected_fingerprint is distinct from impact ->> 'fingerprint' then
      raise exception 'Review the shifts on this closed day again.' using errcode = '40001', hint = 'important_date.closure_changed';
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
    opened := app_private.important_date_close_shifts(actor_user_id, item, impact, target_keep_shift_ids);
    removed := app_private.important_date_tell_removed(item, opened);
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
    'shifts_opened', jsonb_array_length(opened),
    'draft_shifts_opened', coalesce(jsonb_array_length(impact -> 'draft_shift_ids'), 0),
    'shifts_stay_open', app_private.important_date_stay_open(item));
end;
$$;

revoke all on function public.save_important_date_service(uuid, uuid, uuid, text, text, date, date, text, text, boolean, uuid[], integer, uuid[], text)
  from public, anon, authenticated;
revoke all on function public.set_important_date_state_service(uuid, uuid, uuid, text, uuid[], text) from public, anon, authenticated;
grant execute on function public.save_important_date_service(uuid, uuid, uuid, text, text, date, date, text, text, boolean, uuid[], integer, uuid[], text)
  to service_role;
grant execute on function public.set_important_date_state_service(uuid, uuid, uuid, text, uuid[], text) to service_role;

-- Settings > Important dates: the dates this person may see (K6), what they may
-- do to each (K1-K3), and nothing to a date wholly in the past (K11).
create or replace function public.read_settings_important_dates_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
          date_row.note, date_row.affects_scheduling, date_row.archived_at, date_row.status, date_row.revision,
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

-- 6. Announcements: run out (K12), could not go out (KK-98) ------------------------------------------

-- Publishes what is due, and takes back what ran out: an announcement past its
-- end leaves every inbox once (K12). A row that fails keeps its error and is
-- set aside, not retried in everybody's way (KK-98).
create or replace function app_private.announcement_release(w uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.announcements;
  released integer := 0;
begin
  for item in
    select * from public.announcements announcement
    where (w is null or announcement.workspace_id = w)
      and announcement.status = 'scheduled' and announcement.archived_at is null
      and announcement.publish_at <= now() and announcement.release_failed_at is null
    for update skip locked
  loop
    begin
      if item.expires_at is not null and item.expires_at <= now() then
        -- Its time ran out before it went out: it does not (P25).
        update public.announcements set status = 'unpublished', revision = revision + 1 where id = item.id;
      else
        update public.announcements
        set status = 'published', published_at = item.publish_at, revision = revision + 1,
            delivered_to = app_private.announcement_recipients(item)
        where id = item.id
        returning * into item;
        perform app_private.announcement_deliver(item, item.delivered_to);
        released := released + 1;
      end if;
    exception when others then
      -- One broken row must not hold up every workspace's, nor the read that
      -- called this (O2). The error stays with it (KK-98).
      update public.announcements set release_failed_at = now(), release_error = left(sqlstate || ': ' || sqlerrm, 2000)
      where id = item.id;
    end;
  end loop;

  for item in
    select * from public.announcements announcement
    where (w is null or announcement.workspace_id = w)
      and announcement.status = 'published' and announcement.archived_at is null
      and announcement.expires_at <= now() and cardinality(announcement.delivered_to) > 0
    for update skip locked
  loop
    begin
      perform app_private.communication_withdraw(item.workspace_id, 'communications.announcement.available',
        'announcement', item.id::text, 'cancelled');
      update public.announcements set delivered_to = '{}' where id = item.id;
    exception when others then
      -- The next minute tries again.
      raise warning 'announcement % did not leave the inboxes: %', item.id, sqlerrm;
    end;
  end loop;
  return released;
end;
$$;

-- Saves a draft, or changes one in any state but archived (K4). Past its end
-- an announcement reaches nobody (K12); a save clears a failed release (KK-98).
create or replace function public.save_announcement_audience_service(actor_user_id uuid, target_workspace_id uuid, target_announcement_id uuid, target_expected_revision integer, target_title text, target_body text, target_category text, target_audience_roles text[], target_location_ids uuid[], target_publish_at timestamp with time zone, target_expires_at timestamp with time zone, target_action_url text, target_department_ids uuid[], target_job_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.announcements;
  before public.announcements;
  stored uuid[];
  content_changed boolean := false;
  reached uuid[];
  dropped uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'announcement.read');
  target_location_ids := array(select distinct id from unnest(coalesce(target_location_ids, '{}')) id order by id);
  if target_announcement_id is null then
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'announcement', target_location_ids, actor_user_id);
  else
    perform app_private.announcement_release(target_workspace_id);
    select * into before from public.announcements
    where id = target_announcement_id and workspace_id = target_workspace_id for update;
    if before.id is null or not app_private.announcement_visible(actor_user_id, before) then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.write';
    end if;
    stored := app_private.announcement_places(before.id);
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'announcement', stored, before.created_by, stored);
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'announcement', target_location_ids, before.created_by, stored);
    -- A record kept at an archived location never becomes the whole workspace
    -- by losing its locations (KK-86); the owner may still widen a live one (K1).
    if cardinality(target_location_ids) = 0
       and cardinality(stored) > cardinality(app_private.live_locations(target_workspace_id, stored)) then
      raise exception 'Choose at least one location' using errcode = '22023';
    end if;
  end if;

  target_department_ids := coalesce(target_department_ids, '{}');
  target_job_ids := coalesce(target_job_ids, '{}');
  if coalesce(cardinality(target_audience_roles), 0) = 0 then
    target_audience_roles := array['owner', 'admin', 'manager', 'employee'];
  end if;
  if cardinality(target_department_ids) > 100 or cardinality(target_job_ids) > 100 or cardinality(target_location_ids) > 100 then
    raise exception 'too many audience filters' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(target_department_ids) selected(id) where not exists (
       select 1 from public.departments d where d.id = selected.id and d.workspace_id = target_workspace_id and d.archived_at is null))
  or exists (select 1 from unnest(target_job_ids) selected(id) where not exists (
       select 1 from public.jobs j where j.id = selected.id and j.workspace_id = target_workspace_id and j.archived_at is null)) then
    raise exception 'active workspace department and job required' using errcode = '22023';
  end if;
  if char_length(btrim(target_title)) not between 1 and 120 or char_length(btrim(target_body)) not between 1 and 5000
     or target_category not in ('general', 'operations', 'schedule') then
    raise exception 'valid announcement content required' using errcode = '22023';
  end if;
  if cardinality(target_audience_roles) not between 1 and 4
     or exists (select 1 from unnest(target_audience_roles) role_name where role_name not in ('owner', 'admin', 'manager', 'employee')) then
    raise exception 'valid announcement audience required' using errcode = '22023';
  end if;
  if target_action_url is not null and (char_length(target_action_url) > 500 or target_action_url !~ '^/app(/|$)') then
    raise exception 'valid app action required' using errcode = '22023';
  end if;
  if target_expires_at is not null and target_publish_at is not null and target_expires_at <= target_publish_at then
    raise exception 'expiry must follow publication' using errcode = '22023';
  end if;

  if target_announcement_id is null then
    insert into public.announcements (workspace_id, title, body, category, audience_roles, publish_at, expires_at,
      action_url, department_ids, job_ids, created_by, updated_by)
    values (target_workspace_id, btrim(target_title), btrim(target_body), target_category::public.announcement_category,
      array(select distinct role_name::public.workspace_role from unnest(target_audience_roles) role_name),
      target_publish_at, target_expires_at, target_action_url,
      array(select distinct unnest(target_department_ids)), array(select distinct unnest(target_job_ids)),
      actor_user_id, actor_user_id)
    returning * into item;
  else
    if before.revision is distinct from target_expected_revision then
      raise exception 'stale announcement revision' using errcode = '40001';
    end if;
    if before.archived_at is not null then
      raise exception 'announcement can no longer be edited' using errcode = '40001';
    end if;
    content_changed := (before.title, before.body, before.category::text, before.action_url)
      is distinct from (btrim(target_title), btrim(target_body), target_category, target_action_url);
    update public.announcements
    set title = btrim(target_title), body = btrim(target_body), category = target_category::public.announcement_category,
        audience_roles = array(select distinct role_name::public.workspace_role from unnest(target_audience_roles) role_name),
        publish_at = target_publish_at, expires_at = target_expires_at, action_url = target_action_url,
        department_ids = array(select distinct unnest(target_department_ids)),
        job_ids = array(select distinct unnest(target_job_ids)),
        content_revision = content_revision + case when content_changed then 1 else 0 end,
        -- A scheduled one with its time taken away waits as a draft (P10).
        status = case when status = 'scheduled' and target_publish_at is null then 'draft' else status end,
        release_failed_at = null, release_error = null,
        revision = revision + 1, updated_by = actor_user_id, updated_at = now()
    where id = before.id
    returning * into item;
  end if;

  delete from public.announcement_locations where announcement_id = item.id;
  insert into public.announcement_locations (workspace_id, announcement_id, location_id)
  select target_workspace_id, item.id, id from unnest(target_location_ids) id;

  if content_changed then
    update public.announcements
    set acknowledged_before = array(select distinct who from unnest(acknowledged_before || array(
      select a.user_id from public.announcement_acknowledgements a where a.announcement_id = item.id)) who)
    where id = item.id returning * into item;
    delete from public.announcement_acknowledgements where announcement_id = item.id;
  end if;
  if item.status = 'published' then
    -- Past its end it reaches nobody (K12).
    reached := case when item.expires_at <= now() then '{}'::uuid[] else app_private.announcement_recipients(item) end;
    if content_changed then
      perform app_private.communication_withdraw(target_workspace_id, 'communications.announcement.available',
        'announcement', item.id::text, 'superseded');
      perform app_private.announcement_deliver(item, reached);
    else
      -- Those it no longer reaches lose it (BL-534); the new people are told.
      dropped := array(select who from unnest(item.delivered_to) who where not who = any (reached));
      if cardinality(dropped) > 0 then
        perform app_private.communication_withdraw(target_workspace_id, 'communications.announcement.available',
          'announcement', item.id::text, 'cancelled', dropped);
      end if;
      perform app_private.announcement_deliver(item,
        array(select who from unnest(reached) who where not who = any (item.delivered_to)));
    end if;
    update public.announcements set delivered_to = reached where id = item.id returning * into item;
  elsif content_changed then
    update public.announcements set delivered_to = '{}' where id = item.id returning * into item;
  end if;

  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_workspace_id, actor_user_id,
    case when target_announcement_id is null then 'announcement.created' else 'announcement.updated' end,
    'announcement', item.id::text, jsonb_build_object('content_changed', content_changed));
  return jsonb_build_object('status', item.status, 'announcement_id', item.id, 'revision', item.revision,
    'recipient_count', cardinality(item.delivered_to));
end;
$$;

-- The announcement list. A run-out one reads "expired" to whoever manages where
-- it was (K12); one the release could not publish reads "publish_failed" (KK-98).
create or replace function public.get_announcements_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  writable uuid[];
  wide boolean;
  reader app_private.actor_state;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'announcement.read');
  perform app_private.announcement_release(target_workspace_id);
  reader := app_private.actor(actor_user_id, target_workspace_id);
  writable := app_private.scope_set(actor_user_id, target_workspace_id, 'announcement.write');
  wide := app_private.authz_reason(actor_user_id, target_workspace_id, 'announcement.write_wide') is null;
  return jsonb_build_object(
    'workspace_id', target_workspace_id,
    'can_manage', wide or cardinality(writable) > 0,
    'can_target_workspace', wide,
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('id', location.id, 'name', location.name) order by location.sort_order, location.name)
      from public.locations location
      where location.workspace_id = target_workspace_id and app_private.location_is_live(location)
        and location.id = any (writable)), '[]'::jsonb),
    'departments', case when wide or cardinality(writable) > 0 then coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by lower(d.name), d.id)
      from public.departments d where d.workspace_id = target_workspace_id and d.archived_at is null), '[]'::jsonb)
      else '[]'::jsonb end,
    'jobs', case when wide or cardinality(writable) > 0 then coalesce((
      select jsonb_agg(jsonb_build_object('id', j.id, 'name', j.name, 'department_id', j.department_id) order by lower(j.name), j.id)
      from public.jobs j where j.workspace_id = target_workspace_id and j.archived_at is null), '[]'::jsonb)
      else '[]'::jsonb end,
    'announcements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id, 'workspace_id', item.workspace_id, 'title', item.title, 'body', item.body,
        'category', item.category, 'status', item.status, 'audience_roles', item.audience_roles,
        -- What the list shows: run out (K12), or could not go out (KK-98).
        'display_status', case when item.status = 'published' and item.expires_at <= now() then 'expired'
          when item.status = 'scheduled' and item.release_failed_at is not null then 'publish_failed'
          else item.status::text end,
        'publish_error_code', case when item.release_failed_at is null then null
          when item.release_error like '42501%' then 'not_allowed' else 'failed' end,
        -- Every location it is kept at, archived ones too, so an edit keeps them;
        -- live_location_ids are where it reaches (KK-86).
        'location_ids', coalesce(targets.ids, '{}'::uuid[]), 'location_names', coalesce(targets.names, '{}'::text[]),
        'live_location_ids', app_private.live_locations(target_workspace_id, coalesce(targets.ids, '{}'::uuid[])),
        'department_ids', item.department_ids, 'job_ids', item.job_ids, 'archived_at', item.archived_at,
        'department_names', coalesce((select jsonb_agg(d.name order by lower(d.name), d.id) from public.departments d
          where d.workspace_id = target_workspace_id and d.id = any (item.department_ids)), '[]'::jsonb),
        'job_names', coalesce((select jsonb_agg(j.name order by lower(j.name), j.id) from public.jobs j
          where j.workspace_id = target_workspace_id and j.id = any (item.job_ids)), '[]'::jsonb),
        'publish_at', item.publish_at, 'published_at', item.published_at, 'expires_at', item.expires_at,
        'action_url', item.action_url, 'author_name', coalesce(author.display_name, 'Workspace member'),
        'author_user_id', item.created_by,
        'revision', item.revision, 'content_revision', item.content_revision,
        'created_at', item.created_at, 'updated_at', item.updated_at,
        'read_at', null,
        'acknowledged_at', acknowledgement.acknowledged_at,
        'acknowledged_count', (select count(*) from public.announcement_acknowledgements a where a.announcement_id = item.id),
        -- Everybody it is out to now ("18 of 24 acknowledged"), for whoever may
        -- change it; none once it is not out.
        'recipient_count', case when control.allowed and item.status = 'published' and item.archived_at is null
          and (item.expires_at is null or item.expires_at > now()) then cardinality(item.delivered_to) end,
        'publish_failed_at', item.release_failed_at,
        -- The reader acknowledged an earlier content and not this one (K4).
        'content_changed_since_acknowledged', acknowledgement.acknowledged_at is null
          and actor_user_id = any (item.acknowledged_before),
        'can_edit', control.allowed and item.archived_at is null,
        'can_publish', control.allowed and item.archived_at is null and item.status in ('draft', 'scheduled', 'unpublished'),
        'can_unpublish', control.allowed and item.archived_at is null and item.status in ('scheduled', 'published'),
        'can_archive', control.allowed and item.archived_at is null,
        'can_restore', control.allowed and item.archived_at is not null
      ) order by coalesce(item.publish_at, item.created_at) desc, item.id)
      from public.announcements item
      left join public.user_profiles author on author.user_id = item.created_by
      left join lateral (
        select array_agg(location.id order by location.sort_order, location.name) ids,
               array_agg(location.name order by location.sort_order, location.name) names
        from public.announcement_locations target
        join public.locations location on location.id = target.location_id
        where target.announcement_id = item.id) targets on true
      left join public.announcement_acknowledgements acknowledgement
        on acknowledgement.announcement_id = item.id and acknowledgement.user_id = actor_user_id
      cross join lateral (select app_private.announcement_places(item.id) places) kept
      cross join lateral (
        select app_private.communication_reason(reader, target_workspace_id, 'announcement',
          kept.places, item.created_by) is null allowed) control
      -- announcement_visible, with the reader's state read once for the list.
      where item.workspace_id = target_workspace_id
        and (control.allowed or app_private.announcement_out_to(reader, item, kept.places)
          -- K12: one that ran out stays in the list of whoever manages where it was.
          or (item.status = 'published' and item.archived_at is null and item.expires_at <= now()
              and coalesce(reader.status = 'active', false)
              and (reader.manages && app_private.live_locations(target_workspace_id, kept.places)
                   or (cardinality(kept.places) = 0 and cardinality(reader.manages) > 0))))), '[]'::jsonb)
  );
end;
$$;

-- 7. K17: "Closed location" in three steps; K18 ----------------------------------------------------

alter table public.workspace_scheduling_settings drop constraint scheduling_conflict_rules_valid;
alter table public.workspace_scheduling_settings add constraint scheduling_conflict_rules_valid check (
  jsonb_typeof(conflict_rules) = 'object'
  and conflict_rules ?& array['approved_time_off', 'closed_location', 'minimum_travel', 'minimum_rest', 'document_required',
    'document_conditional_grace', 'document_conditional_overdue']
  and conflict_rules - array['approved_time_off', 'closed_location', 'minimum_travel', 'minimum_rest', 'document_required',
    'document_conditional_grace', 'document_conditional_overdue'] = '{}'::jsonb
  and conflict_rules ->> 'approved_time_off' = 'block'
  -- 'warn' goes in the removing half (20261005010000).
  and conflict_rules ->> 'closed_location' = any (array['warn', 'confirm', 'confirm_once', 'block'])
  and conflict_rules ->> 'minimum_travel' = any (array['warn', 'confirm', 'block'])
  and conflict_rules ->> 'minimum_rest' = any (array['warn', 'confirm', 'block'])
  and conflict_rules ->> 'document_required' = any (array['warn', 'confirm', 'block'])
  and conflict_rules ->> 'document_conditional_grace' = any (array['warn', 'confirm', 'block'])
  and conflict_rules ->> 'document_conditional_overdue' = any (array['confirm', 'block'])
  and array_position(array['warn', 'confirm', 'block'], conflict_rules ->> 'document_conditional_overdue')
      >= array_position(array['warn', 'confirm', 'block'], conflict_rules ->> 'document_conditional_grace'));
-- A workspace on "warn" takes the softest of the three steps now, before the
-- code that no longer knows "warn" is live (KARARLAR OPS-03).
update public.workspace_scheduling_settings
set conflict_rules = jsonb_set(conflict_rules, '{closed_location}', '"confirm_once"')
where conflict_rules ->> 'closed_location' = 'warn';

-- K17: a closed day's "confirm once" asks like "confirm" and says the answer
-- holds for the editing session (confirm_scope).
CREATE OR REPLACE FUNCTION public.assess_weekly_shift_availability(w uuid, emp uuid, shift jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 select coalesce(range_agg(tstzrange((x->>'start_at')::timestamptz,(x->>'end_at')::timestamptz,'[)')),'{}') into unavailable
  from jsonb_array_elements(capacity->'unavailable_intervals') x;
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
 -- The employee's own marks and a manager's private reminder are both only a
 -- warning (BL-186, user decision 2026-09-26).
 if span is not null and jsonb_array_length(capacity->'employee_intervals')>0 then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','availability',
  'message','The assignment overlaps unavailable hours.','intervals',capacity->'employee_intervals','definite',true)); end if;
 if span is not null and jsonb_array_length(capacity->'manager_intervals')>0 then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','availability',
  'source','reminder','message','The assignment overlaps hours a manager noted as unavailable.','intervals',capacity->'manager_intervals','definite',true)); end if;
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
  if exists(select 1 from public.schedule_closures c where c.workspace_id=w and c.location_id=loc
   and day between c.closed_date and coalesce(c.end_date,c.closed_date)
   and (c.is_all_day or (shift->>'shift_type_id')::uuid=any(c.shift_type_ids))) then
   reasons:=reasons||jsonb_build_array(jsonb_build_object('code','closed_location','message','Location or shift type is closed on this date.','definite',true));
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
   when 'approved_time_off' then settings.conflict_rules->>'approved_time_off'
   -- K17: "confirm once" asks like "confirm"; its answer holds for the editing session.
   when 'closed_location' then case settings.conflict_rules->>'closed_location' when 'confirm_once' then 'confirm' else settings.conflict_rules->>'closed_location' end
   when 'minimum_travel' then settings.conflict_rules->>'minimum_travel'
   when 'minimum_rest' then settings.conflict_rules->>'minimum_rest' when 'document_required' then settings.conflict_rules->>'document_required' when 'document_conditional_grace' then settings.conflict_rules->>'document_conditional_grace' when 'document_conditional_overdue' then settings.conflict_rules->>'document_conditional_overdue'
   when 'time_source_unresolved' then 'confirm'
   else 'block' end;
  if rule->>'code'<>'availability' and array_position(array['allow','warn','confirm','block'],rule_severity)>array_position(array['allow','warn','confirm','block'],conflict_severity) then conflict_severity:=rule_severity; end if;
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
   'employee_intervals',capacity->'employee_intervals','manager_intervals',capacity->'manager_intervals')::text,'UTF8'),'sha256'),'hex');
 end if;
 fingerprint_payload:=jsonb_build_object('workspace_id',w,'employee_id',emp,
  'assignment',jsonb_build_object('id',coalesce(shift->>'source_shift_id',shift->>'id'),'location_id',loc,'date',day),
  'intervals',public.availability_ranges_json(case when span is null then '{}'::tstzmultirange else tstzmultirange(span) end),
  'leave',public.availability_ranges_json(leave_ranges),
  'warning_policy',case when conflict_severity='confirm' then 'confirm' else 'warn' end,'operation',operation,
  'conflict_rules',settings.conflict_rules,'minimum_travel_minutes',settings.minimum_travel_minutes,'minimum_rest_minutes',settings.minimum_rest_minutes,
  'reasons',(select coalesce(jsonb_agg(r),'[]') from jsonb_array_elements(reasons) r where r->>'code'<>'availability'));
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
end; $function$;

-- The Schedule read: a published shift says when the mark against it came after
-- publishing (K18); closed days are walked for this workspace only (KK-97 keeps
-- them all).
CREATE OR REPLACE FUNCTION public.get_schedule_read_model_service(actor_user_id uuid, target_workspace_id uuid, target_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    select reminder.employee_id, to_jsonb(reminder.notes) as words
    from public.manager_weekly_reminders reminder
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
        'weekly_availability', coalesce((select jsonb_agg(week.projection || jsonb_build_object('manager_notes',
            (select note.words from readable_notes note where note.employee_id = employee.id))
            order by week.location_id)
          from week_availability week
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
        -- K18: the mark against it came after it was published.
        'availability_changed_after_publish', mark.unavailable
          and not coalesce((shift.availability_snapshot -> 'assessment' ->> 'has_availability_conflict')::boolean, false),
        'warning_codes', to_jsonb(array_remove(array[
          case when exists (
            select 1 from public.schedule_closures closure
            where closure.workspace_id = target_workspace_id and closure.location_id = shift.location_id
              and closure.closed_date = shift.scheduled_date and closure.is_all_day
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
        ) as unavailable
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
        'is_all_day', closure.is_all_day
      ) order by closure.closed_date, closure.title)
      from public.schedule_closures closure
      join allowed_locations location on location.id = closure.location_id
      where closure.workspace_id = target_workspace_id
        and closure.closed_date between resolved_week_start and resolved_week_start + 6
    ), '[]'::jsonb)
  ) || app_private.schedule_departments_and_jobs(target_workspace_id)
    || app_private.schedule_referenced_catalog(target_workspace_id,
      array(select shift.job_id from current_shifts shift union select ghost.job_id from ghost_shifts ghost),
      array(select shift.shift_type_id from current_shifts shift
            union select ghost.shift_type_id from ghost_shifts ghost))
  into result;

  return result;
end;
$function$;
