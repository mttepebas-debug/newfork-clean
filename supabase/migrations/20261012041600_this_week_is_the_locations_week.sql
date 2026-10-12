-- BL-238: "this week" on the Schedule is the week the places are in, by their
-- own clock. schedule_current_week_start_service read the database's date,
-- which is UTC: every Sunday from 17:00 in Los Angeles (16:00 in winter) the
-- server was already on Monday, so the week a Los Angeles manager was planning
-- read as past and "Past schedule weeks are read-only." refused the edit, the
-- save and the publish, and the important dates of that week locked early.
--
-- KARARLAR S-01: the line is the location's time zone (locations.timezone),
-- never the manager's; the lock is per location, and a week that reaches
-- several places is past only once every one of them has left it. One helper
-- draws the line for a set of places (the westernmost one's week); each caller
-- names the places of its work:
--   opening an edit        the places it opens on: it opens while any of them
--                          is still in the week (checked after the core has
--                          said which places those are)
--   saving an edit         the edit's places for the week; each shift also at
--                          its own place: a place that has left the week keeps
--                          its published and source-draft shifts untouched,
--                          anything new, changed or removed there is refused
--   publish / unpublish    each place asked for, at its own line
--   an important date      its own places; a save that moves it keeps the past
--                          of its old places and starts at its new places'
--                          line; a closed day's impact, each day at its place
--   Settings > Important dates "locked_before"  the whole workspace
-- No place named, or none of this workspace's, is every live location of the
-- workspace; a workspace with no location left falls back to the UTC date.
--
-- The callers change on the definitions the database holds
-- (pg_get_functiondef): each anchor must be found exactly as often as
-- expected, or nothing changes. The Schedule refusal keys (BL-1044) stay.

create function app_private.schedule_week_start_at(w uuid, places uuid[], instant timestamptz)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select case settings.week_start_day
    when 'sunday' then local.today - extract(dow from local.today)::integer
    else local.today - (extract(isodow from local.today)::integer - 1)
  end
  from public.workspace_scheduling_settings settings
  cross join lateral (
    -- The westernmost place's date: the week is not past while any place is still in it.
    select coalesce(
      (select min((instant at time zone location.timezone)::date) from public.locations location
       where location.workspace_id = w and location.id = any(places)),
      (select min((instant at time zone location.timezone)::date) from public.locations location
       where location.workspace_id = w and app_private.location_is_live(location)),
      (instant at time zone 'UTC')::date) as today
  ) local
  where settings.workspace_id = w;
$$;
revoke all on function app_private.schedule_week_start_at(uuid, uuid[], timestamptz) from public;

drop function public.schedule_current_week_start_service(uuid);
create function public.schedule_current_week_start_service(target_workspace_id uuid, target_location_ids uuid[] default null)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.schedule_week_start_at(target_workspace_id, target_location_ids, now());
$$;
revoke all on function public.schedule_current_week_start_service(uuid, uuid[]) from public;
grant all on function public.schedule_current_week_start_service(uuid, uuid[]) to service_role;

create or replace function pg_temp.patch(fn regprocedure, edits text[]) returns void language plpgsql as $patch$
declare
  definition text := pg_get_functiondef(fn);
  i integer;
  found integer;
begin
  -- [anchor, replacement, expected count] triples.
  for i in 1 .. array_length(edits, 1) by 3 loop
    found := (length(definition) - length(replace(definition, edits[i], ''))) / length(edits[i]);
    if found <> edits[i + 2]::integer then
      raise exception 'this week is the locations'' week: % no longer reads as this expects (anchor %, found % times)', fn, (i + 2) / 3, found;
    end if;
    definition := replace(definition, edits[i], edits[i + 1]);
  end loop;
  execute definition;
end
$patch$;

-- Opening an edit: the line moves below the core's answer, to the places the
-- edit opens on. Somebody with no place to edit hears that first.
select pg_temp.patch('public.acquire_schedule_edit_session_service(uuid,uuid,date,public.schedule_edit_source,uuid,uuid[])', array[
$a$  current_week_start := public.schedule_current_week_start_service(target_workspace_id);
  if current_week_start is not null and target_week_start < current_week_start then
    raise exception '%', jsonb_build_object(
      'status', 'past_edit_blocked',
      'past_edits', jsonb_build_array(jsonb_build_object(
        'op_type', 'update',
        'shift_id', null,
        'scheduled_date', to_char(target_week_start, 'YYYY-MM-DD'),
        'location_name', 'Schedule week',
        'employee_name', null,
        'reason', 'past_week',
        'severity', 'blocked'
      )),
      'past_edit_messages', jsonb_build_array(
        'Past schedule weeks are read-only.'
      ),
      'current_week_start', current_week_start
    )::text using errcode = 'P0001';
  end if;

  perform public.availability_lock_workspace(target_workspace_id);
$a$,
$a$  perform public.availability_lock_workspace(target_workspace_id);
$a$, '1',
$a$    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => array[null]::uuid[]);
  end if;
$a$,
$a$    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => array[null]::uuid[]);
  end if;

  -- A past week never opens; "this week" is the one these places are in (S-01).
  current_week_start := public.schedule_current_week_start_service(target_workspace_id, effective);
  if current_week_start is not null and target_week_start < current_week_start then
    raise exception '%', jsonb_build_object(
      'status', 'past_edit_blocked',
      'past_edits', jsonb_build_array(jsonb_build_object(
        'op_type', 'update',
        'shift_id', null,
        'scheduled_date', to_char(target_week_start, 'YYYY-MM-DD'),
        'location_name', 'Schedule week',
        'employee_name', null,
        'reason', 'past_week',
        'severity', 'blocked'
      )),
      'past_edit_messages', jsonb_build_array(
        'Past schedule weeks are read-only.'
      ),
      'current_week_start', current_week_start
    )::text using errcode = 'P0001';
  end if;
$a$, '1'
]);

select pg_temp.patch('public.save_schedule_edit_session_service(uuid,uuid,uuid,integer,text,uuid,integer,boolean)', array[
  'current_week_start := public.schedule_current_week_start_service(target_workspace_id);',
  'current_week_start := public.schedule_current_week_start_service(target_workspace_id, target_session.location_ids);', '1',
$a$    end if;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'op_type', shift.pending_op_type,
$a$,
$a$    end if;
  else
    -- S-01: the lock is per location. A place that has left the week keeps
    -- what it has: its published shifts and the shifts of the draft this edit
    -- came from may ride along untouched; anything new, changed, moved away or
    -- removed there is refused, by name, and the other places still save.
    select coalesce(jsonb_agg(finding.x order by finding.scheduled_date, finding.start_time, finding.id), '[]'::jsonb)
    into blocked_findings
    from (
      select shift.id, shift.scheduled_date, shift.start_time, jsonb_build_object(
        'op_type', coalesce(shift.pending_op_type, case when kept.id is null then 'create' else 'update' end),
        'shift_id', shift.id,
        'scheduled_date', to_char(shift.scheduled_date, 'YYYY-MM-DD'),
        'location_name', coalesce(location.name, 'Unknown location'),
        'employee_name', coalesce(
          nullif(trim(concat_ws(' ', nullif(employee.preferred_name, ''), employee.last_name)), ''),
          nullif(trim(concat_ws(' ', employee.first_name, employee.last_name)), '')
        ),
        'reason', 'past_week',
        'severity', 'blocked'
      ) as x
      from public.schedule_edit_session_shifts shift
      left join public.schedule_draft_shifts kept
        on kept.draft_id = target_session.source_draft_id
       and kept.id = shift.id
      -- The place that has left the week: where the shift came from (its
      -- source draft row, or any current publication of the week holding it,
      -- by either id a published copy keeps), else where it is now. A shift
      -- moved out of a closed place changes that place too.
      left join lateral (
        select place.id
        from (
          select 1 as n, kept.location_id as id
          union all
          select 1, published.location_id
          from public.schedule_published_shifts published
          join public.schedule_location_publications publication
            on publication.id = published.publication_id
           and publication.status = 'current'
           and publication.week_start = target_session.week_start
          where published.workspace_id = target_workspace_id
            and shift.source_published_shift_id in (published.source_shift_id, published.id)
          union all
          select 2, shift.location_id
        ) place
        where place.id is not null
          and target_session.week_start
            < public.schedule_current_week_start_service(target_workspace_id, array[place.id])
        order by place.n, place.id
        limit 1
      ) closed on true
      left join public.locations location
        on location.id = closed.id
       and location.workspace_id = shift.workspace_id
      left join public.employee_profiles employee
        on employee.id = shift.employee_id
       and employee.workspace_id = shift.workspace_id
      where shift.session_id = target_session_id
        and shift.workspace_id = target_workspace_id
        and (shift.pending_op_type is not null
          or (shift.source_published_shift_id is null and (kept.id is null or kept.revision <> shift.revision)))
        and shift.location_id = any(reach)
        and closed.id is not null
      union all
      -- A shift of the source draft taken out of the edit at such a place.
      select kept.id, kept.scheduled_date, kept.start_time, jsonb_build_object(
        'op_type', 'delete',
        'shift_id', kept.id,
        'scheduled_date', to_char(kept.scheduled_date, 'YYYY-MM-DD'),
        'location_name', coalesce(location.name, 'Unknown location'),
        'employee_name', coalesce(
          nullif(trim(concat_ws(' ', nullif(employee.preferred_name, ''), employee.last_name)), ''),
          nullif(trim(concat_ws(' ', employee.first_name, employee.last_name)), '')
        ),
        'reason', 'past_week',
        'severity', 'blocked'
      )
      from public.schedule_draft_shifts kept
      left join public.locations location
        on location.id = kept.location_id
       and location.workspace_id = kept.workspace_id
      left join public.employee_profiles employee
        on employee.id = kept.employee_id
       and employee.workspace_id = kept.workspace_id
      where kept.draft_id = target_session.source_draft_id
        and kept.workspace_id = target_workspace_id
        and kept.location_id = any(target_session.location_ids)
        and kept.location_id = any(reach)
        and target_session.week_start
          < public.schedule_current_week_start_service(target_workspace_id, array[kept.location_id])
        and not exists (
          select 1 from public.schedule_edit_session_shifts shift
          where shift.session_id = target_session_id and shift.id = kept.id)
    ) finding;

    select coalesce(jsonb_agg(jsonb_build_object(
      'op_type', shift.pending_op_type,
$a$, '1'
]);

select pg_temp.patch('public.preview_schedule_publication_service(uuid,uuid,uuid,uuid[],uuid[],boolean)', array[
  'if target_draft.week_start < public.schedule_current_week_start_service(target_workspace_id) then',
  '-- S-01: each place publishes up to its own line.
  if exists (select 1 from unnest(target_location_ids) place
             where target_draft.week_start < public.schedule_current_week_start_service(target_workspace_id, array[place])) then', '1'
]);

select pg_temp.patch('public.preview_schedule_unpublication_service(uuid,uuid,date,uuid[])', array[
  'case when target_week_start < public.schedule_current_week_start_service(target_workspace_id)',
  'case when exists (select 1 from unnest(target_location_ids) place
      where target_week_start < public.schedule_current_week_start_service(target_workspace_id, array[place]))', '1'
]);

-- Important dates (K11): each date is past by its own places' week; the page's
-- locked_before stays the workspace's line.
select pg_temp.patch('public.read_settings_important_dates_service(uuid,uuid)', array[
  'app_private.important_date_is_past(date_row, line)',
  'app_private.important_date_is_past(date_row, own.since)', '6',
$a$            date_row.location_ids, date_row.created_by) is null allowed) control
$a$,
$a$            date_row.location_ids, date_row.created_by) is null allowed) control
        cross join lateral (
          select public.schedule_current_week_start_service(target_workspace_id, date_row.location_ids) as since) own
$a$, '1'
]);

-- A save reads the date's old places to say it is past and to keep what is
-- past there; the version it writes starts from its new places' line.
select pg_temp.patch('public.save_important_date_service(uuid,uuid,uuid,text,text,date,date,text,text,boolean,uuid[],integer,uuid[],text)', array[
  'line date := public.schedule_current_week_start_service(target_workspace_id);',
  'line date;
  before_line date;', '1',
$a$  -- K11. A save that changes nothing touches nothing.
$a$,
$a$  -- S-01: each version by its own places; an empty list is the whole workspace.
  line := public.schedule_current_week_start_service(target_workspace_id, target_location_ids);
  before_line := public.schedule_current_week_start_service(target_workspace_id, before.location_ids);

  -- K11. A save that changes nothing touches nothing.
$a$, '1',
  'if not untouched and app_private.important_date_is_past(before, line) then',
  'if not untouched and app_private.important_date_is_past(before, before_line) then', '1',
  'before := app_private.important_date_keep_past(before, line);',
  'before := app_private.important_date_keep_past(before, before_line);', '1'
]);

select pg_temp.patch('public.set_important_date_state_service(uuid,uuid,uuid,text,uuid[],text)', array[
  'line date := public.schedule_current_week_start_service(target_workspace_id);',
  'line date;', '1',
$a$  if app_private.important_date_is_past(before, line) then
$a$,
$a$  line := public.schedule_current_week_start_service(target_workspace_id, before.location_ids);
  if app_private.important_date_is_past(before, line) then
$a$, '1'
]);

-- A closed day newly lands on shifts from its own place's week on.
select pg_temp.patch('app_private.important_date_closure_impact(uuid,public.important_dates,text,date,date,text,uuid[])', array[
  'where day.closed_date >= public.schedule_current_week_start_service(w)',
  'where day.closed_date >= public.schedule_current_week_start_service(w, array[day.location_id])', '1'
]);
