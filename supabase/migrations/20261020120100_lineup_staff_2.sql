-- LINEUP-EDIT L3a, part 2 of 2 (KARARLAR S-178 madde 6-7; the design's candidates(), yapim/masaustu/desk.js): who a
-- manager may add to a department of a draft lineup (Add Staff) or put in a person's place (Replace), in four groups
-- by a score: Best fit (no shift today, assigned to the position), Available (assigned, free for these hours),
-- Consider (free, not assigned to it), Unavailable (approved time off, or working somewhere else at those hours:
-- added with "Add anyway"). Someone already on this lineup, or here at another shift for half these hours or more,
-- is not offered. Another location's shift says only where, which shift and its hours, as the Schedule's ghost
-- shift does. Who may: lineup.share at the location.

-- payload: location_id, service_date, shift_type_id (null: the location's other shifts), and department_id (Add
-- Staff; null: the positions with no department) or row: source_shift_id or row_id (Replace).
create function public.get_lineup_candidates_service(actor_user_id uuid, target_workspace_id uuid, payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $_$
declare
  place public.locations;
  day date;
  type_id uuid;
  edit jsonb := payload -> 'row';
  department uuid;
  read jsonb;
  target jsonb;
  win_from timestamptz;
  win_to timestamptz;
  win_minutes numeric;
  result jsonb;
  uuid_shape constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if jsonb_typeof(payload) is distinct from 'object'
     or payload ->> 'location_id' is null or (payload ->> 'location_id') !~* uuid_shape
     or payload ->> 'service_date' is null or (payload ->> 'service_date') !~ '^\d{4}-\d{2}-\d{2}$'
     or (payload ->> 'shift_type_id' is not null and (payload ->> 'shift_type_id') !~* uuid_shape)
     or (payload ? 'row') = (payload ? 'department_id')
     or (payload ? 'row' and (jsonb_typeof(edit) is distinct from 'object'
         or ((edit ->> 'source_shift_id') is null) = ((edit ->> 'row_id') is null)
         or coalesce(edit ->> 'source_shift_id', edit ->> 'row_id') !~* uuid_shape))
     or (payload ->> 'department_id' is not null and (payload ->> 'department_id') !~* uuid_shape) then
    raise exception 'Choose a department or a person' using errcode = '22023', hint = 'lineup.invalid_command';
  end if;
  -- The core first: a stranger learns nothing.
  perform app_private.authorize(actor_user_id, target_workspace_id, 'lineup.share',
    target_locations => array[(payload ->> 'location_id')::uuid]);

  select * into place from public.locations l
  where l.id = (payload ->> 'location_id')::uuid and l.workspace_id = target_workspace_id;
  day := (payload ->> 'service_date')::date;
  type_id := (payload ->> 'shift_type_id')::uuid;
  department := (payload ->> 'department_id')::uuid;
  if type_id is not null and not exists (
    select 1 from public.shift_types t where t.id = type_id and t.workspace_id = target_workspace_id and t.deleted_at is null
  ) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'lineup.share';
  end if;

  -- The whole day, every location's lineups: who works where, and when.
  read := app_private.lineup_day(target_workspace_id, day, array(
    select l.id from public.locations l
    where l.workspace_id = target_workspace_id and l.archived_at is null and l.deleted_at is null));

  if payload ? 'row' then
    select r into target
    from jsonb_array_elements(read -> 'locations') l, jsonb_array_elements(l -> 'lineups') x, jsonb_array_elements(x -> 'rows') r
    where (l ->> 'id')::uuid = place.id and (x ->> 'shift_type_id')::uuid is not distinct from type_id
      and (r ->> 'employee_id') is not null
      and ((edit ? 'source_shift_id' and r ->> 'source_shift_id' = edit ->> 'source_shift_id')
        or (edit ? 'row_id' and r ->> 'id' = edit ->> 'row_id' and (r -> 'lineup_only')::boolean));
    if target is null then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'lineup.share';
    end if;
    if target ->> 'called_off_at' is not null or target ->> 'replaced_by_row_id' is not null then
      raise exception 'This person isn''t on the lineup now' using errcode = '22023', hint = 'lineup.row_out';
    end if;
    win_from := (day + (target ->> 'start_time')::time) at time zone place.timezone;
    win_to := (day + (target ->> 'end_time')::time
      + case when (target -> 'crosses_midnight')::boolean then interval '1 day' else interval '0' end) at time zone place.timezone;
  else
    -- The department's hours on this lineup (its first in to its last out), else the shift type's.
    select min((day + (r ->> 'start_time')::time) at time zone place.timezone),
      max((day + (r ->> 'end_time')::time
        + case when (r -> 'crosses_midnight')::boolean then interval '1 day' else interval '0' end) at time zone place.timezone)
    into win_from, win_to
    from jsonb_array_elements(read -> 'locations') l, jsonb_array_elements(l -> 'lineups') x, jsonb_array_elements(x -> 'rows') r
    where (l ->> 'id')::uuid = place.id and (x ->> 'shift_type_id')::uuid is not distinct from type_id
      and r ->> 'employee_id' is not null and r ->> 'called_off_at' is null and r ->> 'replaced_by_row_id' is null
      and (r ->> 'department_id')::uuid is not distinct from department;
    if win_from is null then
      select (day + t.default_start_time) at time zone place.timezone,
        (day + t.default_end_time + case when t.default_end_time <= t.default_start_time then interval '1 day' else interval '0' end)
          at time zone place.timezone
      into win_from, win_to
      from public.shift_types t where t.id = type_id and t.workspace_id = target_workspace_id
        and t.default_start_time is not null and t.default_end_time is not null;
    end if;
  end if;
  -- No hours to measure by: the whole day there.
  if win_from is null then
    win_from := day::timestamp at time zone place.timezone;
    win_to := (day + 1)::timestamp at time zone place.timezone;
  end if;
  win_minutes := extract(epoch from win_to - win_from) / 60;

  with shifts as (
    -- Everyone's shift that day, wherever, but this lineup's: who is on it is not offered.
    select (r ->> 'employee_id')::uuid as employee_id, (l ->> 'id')::uuid as location_id, l ->> 'name' as location_name,
      coalesce(x ->> 'shift_type_name', 'No shift type') as shift_name, r ->> 'start_time' as start_time,
      r ->> 'end_time' as end_time,
      (day + (r ->> 'start_time')::time) at time zone (l ->> 'timezone') as from_at,
      (day + (r ->> 'end_time')::time
        + case when (r -> 'crosses_midnight')::boolean then interval '1 day' else interval '0' end) at time zone (l ->> 'timezone')
        as to_at
    from jsonb_array_elements(read -> 'locations') l, jsonb_array_elements(l -> 'lineups') x, jsonb_array_elements(x -> 'rows') r
    where r ->> 'employee_id' is not null and r ->> 'called_off_at' is null and r ->> 'replaced_by_row_id' is null
      and not ((l ->> 'id')::uuid = place.id and (x ->> 'shift_type_id')::uuid is not distinct from type_id)
  ), measured as (
    select s.*, greatest(0, extract(epoch from least(s.to_at, win_to) - greatest(s.from_at, win_from)) / 60) as overlap
    from shifts s
  ), on_lineup as (
    select (r ->> 'employee_id')::uuid as employee_id
    from jsonb_array_elements(read -> 'locations') l, jsonb_array_elements(l -> 'lineups') x, jsonb_array_elements(x -> 'rows') r
    where (l ->> 'id')::uuid = place.id and (x ->> 'shift_type_id')::uuid is not distinct from type_id
      and r ->> 'employee_id' is not null
  ), people as (
    select e.id, coalesce(nullif(e.preferred_name, ''), e.first_name) || ' ' || e.last_name as name,
      array(select a.job_id from public.employee_job_assignments a join public.jobs j on j.id = a.job_id
            where a.workspace_id = target_workspace_id and a.employee_id = e.id and a.ended_at is null and j.archived_at is null
            order by a.is_primary desc, j.name) as job_ids
    from public.employee_profiles e
    where e.workspace_id = target_workspace_id
      and app_private.lineup_staff_eligible(target_workspace_id, place.id, e.id)
      and not exists (select 1 from on_lineup o where o.employee_id = e.id)
  ), fitted as (
    select p.*,
      array(select j.id from unnest(p.job_ids) as k (id) join public.jobs j on j.id = k.id
            where case when target is not null then j.id = (target ->> 'job_id')::uuid
                       else j.department_id is not distinct from department end) as fits,
      exists (select 1 from public.schedule_time_off_segments s
              join public.schedule_time_off_requests q on q.id = s.request_id and q.workspace_id = s.workspace_id
              where s.workspace_id = target_workspace_id and q.employee_id = p.id and q.request_type = 'time_off'
                and s.status = 'approved' and s.starts_at < win_to and s.ends_at > win_from) as off,
      away.location_name as away_location, away.shift_name as away_shift, away.start_time as away_start,
      away.end_time as away_end, away.overlap as away_overlap,
      here.shift_name as here_shift, here.start_time as here_start, here.end_time as here_end, here.overlap as here_overlap,
      first.location_id as first_location_id, first.location_name as first_location, first.shift_name as first_shift,
      first.start_time as first_start, first.end_time as first_end
    from people p
    -- The most of these hours somewhere else, the most here, and the day's first shift.
    left join lateral (select m.* from measured m where m.employee_id = p.id and m.location_id <> place.id and m.overlap > 0
                       order by m.overlap desc limit 1) away on true
    left join lateral (select m.* from measured m where m.employee_id = p.id and m.location_id = place.id and m.overlap > 0
                       order by m.overlap desc limit 1) here on true
    left join lateral (select m.* from measured m where m.employee_id = p.id order by m.from_at limit 1) first on true
  ), scored as (
    select f.*, cardinality(f.fits) > 0 as match,
      case
        when f.off then 10 + case when cardinality(f.fits) > 0 then 5 else 0 end
        when f.away_overlap is not null then (case when f.away_overlap < win_minutes then 40 else 25 end)
          + case when cardinality(f.fits) > 0 then 5 else 0 end
        when f.here_overlap is not null then 30
        when f.first_start is not null then case when f.first_location_id = place.id then 65 else 70 end
        else 100
      end as score
    from fitted f
    -- Here at another shift for half these hours or more: not free for this one.
    where f.off or f.away_overlap is not null or f.here_overlap is null or f.here_overlap < win_minutes / 2
  )
  select jsonb_build_object(
    'window', jsonb_build_object('start_time', to_char(win_from at time zone place.timezone, 'HH24:MI'),
      'end_time', to_char(win_to at time zone place.timezone, 'HH24:MI')),
    'job_id', target -> 'job_id',
    'candidates', coalesce(jsonb_agg(jsonb_build_object(
      'employee_id', s.id,
      'name', s.name,
      'job_ids', to_jsonb(s.job_ids),
      -- The position the person would take: the row's on Replace, else her first in the department.
      'job_id', case when target is not null then target -> 'job_id' else to_jsonb(s.fits[1]) end,
      'group', case when s.off or s.away_overlap is not null then 'unavailable' when not s.match then 'consider'
                    when s.score = 100 then 'best_fit' else 'available' end,
      'score', s.score,
      'why', case
        when s.off then jsonb_build_object('reason', 'time_off')
        when s.away_overlap is not null then jsonb_build_object('reason', 'elsewhere', 'location_name', s.away_location,
          'shift_name', s.away_shift, 'start_time', s.away_start, 'end_time', s.away_end,
          'partial', s.away_overlap < win_minutes)
        when s.here_overlap is not null then jsonb_build_object('reason', 'overlap_here', 'shift_name', s.here_shift,
          'start_time', s.here_start, 'end_time', s.here_end, 'overlap_minutes', round(s.here_overlap))
        when s.first_start is not null then jsonb_build_object('reason', 'other_shift',
          'location_name', case when s.first_location_id = place.id then null else s.first_location end,
          'shift_name', s.first_shift, 'start_time', s.first_start, 'end_time', s.first_end)
        else jsonb_build_object('reason', 'no_shift')
      end
    ) order by s.score desc, s.name, s.id), '[]'::jsonb))
  into result
  from scored s;
  return result;
end;
$_$;

revoke all on function public.get_lineup_candidates_service(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.get_lineup_candidates_service(uuid, uuid, jsonb) to service_role;
