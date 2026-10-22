-- Time off rebuild D5 (KARARLAR S-239 (1), (6)): whoever may answer a person's time off enters approved time
-- off for them. It is a record, not a request: a row of kind 'leave', approved at once, entered (created_by)
-- and answered (decided_by) by the same person, now.
--
-- Who: app_private.time_off_decider_why, as for an answer: a manager of one of the person's live locations
-- who may decide there, an admin or the owner; nobody for themselves, the owner neither; a manager past a
-- document deadline drops out in the core. Only for somebody with employee access
-- (app_private.has_employee_access; S-166, S-239 (8)).
-- When: from today at the person's primary location (all day today is allowed; a shift that has started
-- stays), at most 31 days, in that location's zone, as asking does.
-- Not over approved time off (time_off.overlap), nor over a request still waiting (time_off.pending_overlap:
-- answer that first). Both read app_private.leave_spans, the old tables included.
-- Its effect is an approval's: effective is the whole range and the published shifts it covers that have not
-- started go to open shifts (app_private.time_off_open_shifts), on the print the form read (time_off.changed
-- otherwise). The workspace's availability lock comes first, then the person's.
-- Notices (subject 'time_off', type time_off.decided, outcome 'approved', entered true): the employee hears
-- it was added for them; the others who may answer hear of it.
--
-- New: enter_time_off_service, enter_time_off_impact_service (what it would open, before it is sent),
-- time_off_entry_people_service (whom this person may enter time off for), and two helpers. The view says
-- who added time off somebody else entered (added_by_name).

-- One request as the employee's screen reads it: as in D4, and who added time off that was entered for the
-- person by somebody else (null when they asked for it themselves).
create or replace function app_private.time_off_request_view(r public.time_off_requests)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'kind', r.kind,
    'cancels_id', r.cancels_id,
    'kind_of_leave', r.kind_of_leave,
    'status', case when r.status = 'pending' and r.kind = 'leave' and r.starts_at <= now() then 'expired'
      when r.status = 'pending' and r.kind = 'cancel' and r.ends_at <= now() then 'expired'
      else r.status end,
    'starts_at', r.starts_at,
    'ends_at', r.ends_at,
    'all_day', r.all_day,
    'time_timezone', r.time_timezone,
    'start_date', (r.starts_at at time zone r.time_timezone)::date,
    'end_date', case when r.all_day or (r.ends_at at time zone r.time_timezone)::time = '00:00'
      then (r.ends_at at time zone r.time_timezone)::date - 1 else (r.ends_at at time zone r.time_timezone)::date end,
    'start_time', case when r.all_day then null else to_char(r.starts_at at time zone r.time_timezone, 'HH24:MI') end,
    'end_time', case when r.all_day then null
      when (r.ends_at at time zone r.time_timezone)::time = '00:00' then '24:00'
      else to_char(r.ends_at at time zone r.time_timezone, 'HH24:MI') end,
    'note', r.note,
    'revision', r.revision,
    'created_at', r.created_at,
    'added_by_name', case when r.kind = 'leave' and r.created_by is distinct from
      (select e.user_id from public.employee_profiles e where e.id = r.employee_id and e.workspace_id = r.workspace_id)
      then app_private.account_name(r.created_by) end,
    'decided_at', r.decided_at,
    'decided_by_name', case when r.decided_by is null then null else app_private.account_name(r.decided_by) end,
    'decision_note', r.decision_note,
    'ended_at', r.ended_at,
    'ended_by_name', case when r.ended_by is null then null else app_private.account_name(r.ended_by) end,
    'ended_note', r.ended_note,
    'used_until', case when r.kind = 'leave' and r.status in ('cancelled', 'revoked') and not isempty(r.effective)
      then upper(r.effective) end,
    'cancellation', (
      select jsonb_build_object(
        'id', c.id,
        'status', case when c.status = 'pending' and c.ends_at <= now() then 'expired' else c.status end,
        'note', c.note,
        'revision', c.revision,
        'created_at', c.created_at,
        'decided_at', c.decided_at,
        'decided_by_name', case when c.decided_by is null then null else app_private.account_name(c.decided_by) end,
        'decision_note', c.decision_note)
      from public.time_off_requests c
      where r.kind = 'leave' and c.cancels_id = r.id and c.workspace_id = r.workspace_id and c.kind = 'cancel'
        and c.status <> 'withdrawn'
      order by c.status = 'pending' desc, c.created_at desc, c.id desc
      limit 1))
$$;

-- The notices of a request (subject 'time_off'): as in D4, and time off entered for the person ('entered'):
-- the employee hears it was added for them, the others who may answer hear of it. Nobody is asked anything,
-- so no card waits for an answer.
create or replace function app_private.time_off_request_tell(r public.time_off_requests, what text, actor uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  person public.employee_profiles%rowtype;
  name text;
  days text := app_private.time_off_days_label(r);
  card_url text := '/app/schedule/requests?type=time_off&request=' || r.id::text;
  mine_url text := '/app/employee-hub/my-availability?section=time-off';
  asked uuid[];
  opened integer;
  sent integer := 0;
begin
  select * into person from public.employee_profiles e where e.id = r.employee_id and e.workspace_id = r.workspace_id;
  name := btrim(coalesce(nullif(btrim(person.preferred_name), ''), person.first_name) || ' ' || person.last_name);
  if what = 'requested' or (r.kind = 'leave' and what in ('approved', 'revoked', 'entered')) then
    asked := app_private.notify_deciders(r.workspace_id, 'time_off.decide', array(
      select a.location_id
      from public.employee_location_assignments a
      join public.locations l on l.id = a.location_id and l.workspace_id = a.workspace_id
      where a.workspace_id = r.workspace_id and a.employee_id = r.employee_id and a.ended_at is null
        and app_private.location_is_live(l)
      order by a.location_id), r.employee_id, 'time_off.decide_alone');
  end if;

  if r.kind = 'cancel' then
    if what = 'requested' then
      sent := app_private.notify('time_off.requested', r.workspace_id, asked,
        'time_off:' || r.id::text || ':requested', name || ' asks to cancel time off',
        days || coalesce(' · ' || left(r.note, 900), ''), card_url, actor, 'time_off', r.id,
        jsonb_build_object('request_id', r.id, 'kind', 'cancel', 'cancels_id', r.cancels_id, 'kind_of_leave', r.kind_of_leave));
      return sent;
    end if;
    if what in ('approved', 'declined') then
      sent := app_private.notify('time_off.decided', r.workspace_id, array[person.user_id],
        'time_off:' || r.id::text || ':' || what,
        case what when 'approved' then 'Your time off ' || days || ' is cancelled'
          else 'Your request to cancel time off ' || days || ' is declined' end,
        r.decision_note, mine_url, actor, 'time_off', r.id,
        jsonb_build_object('request_id', r.id, 'kind', 'cancel', 'cancels_id', r.cancels_id, 'outcome', what));
    end if;
    perform app_private.notification_resolve(r.workspace_id, 'time_off', r.id, what, actor);
    return sent;
  end if;

  if what = 'requested' then
    return app_private.notify('time_off.requested', r.workspace_id, asked,
      'time_off:' || r.id::text || ':requested', 'Time off request from ' || name,
      days || coalesce(' · ' || left(r.note, 900), ''), card_url, actor, 'time_off', r.id,
      jsonb_build_object('request_id', r.id, 'kind_of_leave', r.kind_of_leave));
  end if;

  -- Entered for the person (D5): approved at once; nobody was asked, so no card closes.
  if what = 'entered' then
    opened := (select count(*)::integer from public.time_off_request_releases x
               where x.workspace_id = r.workspace_id and x.request_id = r.id);
    sent := app_private.notify('time_off.decided', r.workspace_id, array[person.user_id],
      'time_off:' || r.id::text || ':entered', 'Time off ' || days || ' was added for you',
      r.note, mine_url, actor, 'time_off', r.id,
      jsonb_build_object('request_id', r.id, 'outcome', 'approved', 'entered', true, 'shifts_opened', opened));
    sent := sent + app_private.notify('time_off.decided', r.workspace_id,
      array(select u from unnest(asked) u where u is distinct from actor and u is distinct from person.user_id),
      'time_off:' || r.id::text || ':entered', name || '''s time off ' || days || ' was added',
      case when opened = 1 then '1 shift went to open shifts.' when opened > 1 then opened || ' shifts went to open shifts.' end,
      card_url, actor, 'time_off', r.id,
      jsonb_build_object('request_id', r.id, 'outcome', 'approved', 'entered', true, 'shifts_opened', opened));
    return sent;
  end if;

  if what in ('approved', 'declined') then
    opened := (select count(*)::integer from public.time_off_request_releases x
               where x.workspace_id = r.workspace_id and x.request_id = r.id);
    sent := app_private.notify('time_off.decided', r.workspace_id, array[person.user_id],
      'time_off:' || r.id::text || ':' || what,
      'Your time off ' || days || case what when 'approved' then ' is approved' else ' is declined' end,
      r.decision_note, mine_url, actor, 'time_off', r.id,
      jsonb_build_object('request_id', r.id, 'outcome', what, 'shifts_opened', opened));
    if what = 'approved' then
      sent := sent + app_private.notify('time_off.decided', r.workspace_id,
        array(select u from unnest(asked) u where u is distinct from actor and u is distinct from person.user_id),
        'time_off:' || r.id::text || ':approved', name || '''s time off ' || days || ' is approved',
        case when opened = 1 then '1 shift went to open shifts.' when opened > 1 then opened || ' shifts went to open shifts.' end,
        card_url, actor, 'time_off', r.id,
        jsonb_build_object('request_id', r.id, 'outcome', what, 'shifts_opened', opened));
    end if;
  end if;

  if what = 'revoked' then
    sent := app_private.notify('time_off.decided', r.workspace_id, array[person.user_id],
      'time_off:' || r.id::text || ':revoked', 'Your time off ' || days || ' was revoked',
      r.ended_note, mine_url, actor, 'time_off', r.id,
      jsonb_build_object('request_id', r.id, 'outcome', what));
    sent := sent + app_private.notify('time_off.decided', r.workspace_id,
      array(select u from unnest(asked) u where u is distinct from actor and u is distinct from person.user_id),
      'time_off:' || r.id::text || ':revoked', name || '''s time off ' || days || ' was revoked',
      r.ended_note, card_url, actor, 'time_off', r.id,
      jsonb_build_object('request_id', r.id, 'outcome', what));
  end if;
  perform app_private.notification_resolve(r.workspace_id, 'time_off', r.id, what, actor);
  return sent;
end;
$$;

-- Whom `state` may enter time off for: somebody of the workspace, not archived, who may answer for them
-- (time_off_decider_why) and has employee access. Raises the refusal; gives back the person's zone.
create function app_private.time_off_entry_person(state app_private.actor_state, person uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  why text := app_private.time_off_decider_why(state, null);
  account uuid;
  zone_name text;
begin
  if why is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || why, detail = 'time_off.decide';
  end if;
  select e.user_id into account from public.employee_profiles e
  where e.id = person and e.workspace_id = state.workspace_id and e.archived_at is null;
  if not found then
    raise exception 'Person not found' using errcode = 'P0002', hint = 'time_off.not_found';
  end if;
  why := app_private.time_off_decider_why(state, person);
  if why is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || why, detail = 'time_off.decide';
  end if;
  if account is not null and not app_private.has_employee_access(state.workspace_id, account) then
    raise exception 'Time off is only for people who work shifts' using errcode = '22023', hint = 'time_off.no_employee_access';
  end if;
  zone_name := app_private.time_off_timezone(state.workspace_id, person);
  if zone_name is null then
    raise exception 'This person needs a location before they can have time off' using errcode = '55000', hint = 'time_off.no_location';
  end if;
  return zone_name;
end;
$$;

revoke all on function app_private.time_off_entry_person(app_private.actor_state, uuid) from public;

-- The range time off entered for somebody covers, in their zone: All day from the first day's midnight to
-- the midnight after the last; with hours, from the first day's clock to the last day's (24:00 is the next
-- midnight). From today there on: a day that passed, or hours that ended, are refused. At most 31 days.
create function app_private.time_off_entry_range(zone_name text, first_day date, last_day date, from_clock time, to_clock time)
returns tstzrange
language plpgsql
stable
set search_path = ''
as $$
declare
  begins timestamptz;
  ends timestamptz;
begin
  if first_day is null or last_day is null or (from_clock is null) <> (to_clock is null) or from_clock = '24:00' then
    raise exception 'Choose the days, and both hours unless it is all day' using errcode = '22023', hint = 'time_off.invalid';
  end if;
  if last_day < first_day then
    raise exception 'The last day is before the first day' using errcode = '22023', hint = 'time_off.order';
  end if;
  if from_clock is null then
    if last_day - first_day + 1 > 31 then
      raise exception 'Enter 31 days or fewer at a time' using errcode = '22023', hint = 'time_off.too_long';
    end if;
    begins := first_day::timestamp at time zone zone_name;
    ends := (last_day + 1)::timestamp at time zone zone_name;
  else
    if last_day + to_clock <= first_day + from_clock then
      raise exception 'The end is before the start' using errcode = '22023', hint = 'time_off.order';
    end if;
    if (last_day + to_clock) - (first_day + from_clock) > interval '31 days' then
      raise exception 'Enter 31 days or fewer at a time' using errcode = '22023', hint = 'time_off.too_long';
    end if;
    begin
      -- A clock the zone repeats is its first time; one it skips does not exist.
      begins := public.time_off_resolve_clock(first_day + from_clock, zone_name, 'earlier');
      ends := public.time_off_resolve_clock(last_day + to_clock, zone_name, 'earlier');
    exception when sqlstate '22023' then
      raise exception 'These hours do not exist on this date in this time zone'
        using errcode = '22023', hint = 'time_off.no_such_time';
    end;
  end if;
  if first_day < (now() at time zone zone_name)::date or ends <= now() then
    raise exception 'That time has passed. Time off can start today at the earliest'
      using errcode = '22023', hint = 'time_off.past';
  end if;
  return tstzrange(begins, ends, '[)');
end;
$$;

revoke all on function app_private.time_off_entry_range(text, date, date, time, time) from public;

-- What `at_stake` (the shifts that would open) looks like to `state`: the print, the count, the locations whose
-- schedule they read with their shifts, and a count of the others.
create function app_private.time_off_impact_view(state app_private.actor_state, at_stake jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with read_rule as (select a from app_private.authz_actions a where a.key = 'schedule.read'),
  seen as (
    select x, app_private.authz_check(time_off_impact_view.state, (select a from read_rule),
      array[(x ->> 'location_id')::uuid], null, null) is null as readable
    from jsonb_array_elements(time_off_impact_view.at_stake) x
  )
  select jsonb_build_object(
    'fingerprint', app_private.time_off_shifts_print(time_off_impact_view.at_stake),
    'shift_count', jsonb_array_length(time_off_impact_view.at_stake),
    'hidden_shift_count', (select count(*)::integer from seen where not seen.readable),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('location_id', place.location_id, 'location_name', place.location_name,
        'shifts', place.shifts) order by place.location_name, place.location_id)
      from (
        select (s.x ->> 'location_id')::uuid as location_id, min(s.x ->> 'location_name') as location_name,
          jsonb_agg(jsonb_build_object(
            'id', s.x ->> 'id',
            'scheduled_date', s.x ->> 'scheduled_date',
            'start_time', to_char((s.x ->> 'start_time')::time, 'HH24:MI'),
            'end_time', to_char((s.x ->> 'end_time')::time, 'HH24:MI'),
            'job_name', s.x ->> 'job_name',
            'starts_at', s.x ->> 'starts_at',
            'ends_at', s.x ->> 'ends_at',
            'timezone', s.x ->> 'timezone') order by s.x ->> 'starts_at', s.x ->> 'id') as shifts
        from seen s
        where s.readable
        group by (s.x ->> 'location_id')::uuid
      ) place), '[]'::jsonb))
$$;

revoke all on function app_private.time_off_impact_view(app_private.actor_state, jsonb) from public;

-- Requests → Time off's "Add time off": the people this person may enter time off for, by name, each with
-- where they work, their zone and today there.
create function public.time_off_entry_people_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  why text := app_private.time_off_decider_why(me, null);
begin
  if why is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || why, detail = 'time_off.decide';
  end if;
  return jsonb_build_object('people', coalesce((
    select jsonb_agg(jsonb_build_object(
      'employee_id', p.id,
      'name', p.name,
      'location_names', p.location_names,
      'time_zone', p.zone_name,
      'today', (now() at time zone p.zone_name)::date) order by lower(p.name), p.id)
    from (
      select e.id, btrim(coalesce(nullif(btrim(e.preferred_name), ''), e.first_name) || ' ' || e.last_name) as name,
        app_private.time_off_timezone(target_workspace_id, e.id) as zone_name,
        coalesce((
          select jsonb_agg(l.name order by a.is_primary desc, a.assigned_at)
          from public.employee_location_assignments a
          join public.locations l on l.id = a.location_id and l.workspace_id = a.workspace_id
          where a.workspace_id = target_workspace_id and a.employee_id = e.id and a.ended_at is null
            and app_private.location_is_live(l)), '[]'::jsonb) as location_names
      from public.employee_profiles e
      where e.workspace_id = target_workspace_id and e.archived_at is null
        and (e.user_id is null or app_private.has_employee_access(target_workspace_id, e.user_id))
        and app_private.time_off_decider_why(me, e.id) is null
    ) p
    where p.zone_name is not null), '[]'::jsonb));
end;
$$;

revoke all on function public.time_off_entry_people_service(uuid, uuid) from public;
grant execute on function public.time_off_entry_people_service(uuid, uuid) to service_role;

-- What entering time off for `target_employee_id` would open, before it is sent: as an answer's impact, and
-- the zone, and whether it falls on time off already approved or on a request waiting for an answer.
-- No hours is All day.
create function public.enter_time_off_impact_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid,
  first_day date, last_day date, from_clock time default null, to_clock time default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  zone_name text := app_private.time_off_entry_person(me, target_employee_id);
  span tstzrange := app_private.time_off_entry_range(zone_name, first_day, last_day, from_clock, to_clock);
  sketch public.time_off_requests;
begin
  sketch.workspace_id := target_workspace_id;
  sketch.employee_id := target_employee_id;
  sketch.starts_at := lower(span);
  sketch.ends_at := upper(span);
  return app_private.time_off_impact_view(me, app_private.time_off_shifts_at_stake(sketch)) || jsonb_build_object(
    'time_zone', zone_name,
    'overlap', (select case when bool_or(s.pending) then 'pending' when count(*) > 0 then 'approved' end
                from app_private.leave_spans(target_workspace_id, array[target_employee_id], span) s));
end;
$$;

revoke all on function public.enter_time_off_impact_service(uuid, uuid, uuid, date, date, time, time) from public;
grant execute on function public.enter_time_off_impact_service(uuid, uuid, uuid, date, date, time, time) to service_role;

-- Enters approved time off for somebody, on the print of the shifts it opens that the form read. The same
-- request key gives back the same time off; used for other time off, it is refused.
create function public.enter_time_off_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid,
  entered_kind text, first_day date, last_day date, entered_all_day boolean, from_clock time, to_clock time,
  entered_note text, expected_timezone text, expected_impact text, request_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me app_private.actor_state;
  zone_name text;
  prior public.time_off_requests;
  shown jsonb;
  note_text text := nullif(btrim(coalesce(entered_note, '')), '');
  span tstzrange;
  name text;
  created public.time_off_requests;
begin
  perform public.availability_lock_workspace(target_workspace_id);
  me := app_private.actor(actor_user_id, target_workspace_id);
  zone_name := app_private.time_off_entry_person(me, target_employee_id);
  if request_key is null then
    raise exception 'A request key is required' using errcode = '22023', hint = 'time_off.invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('time_off_person:' || target_employee_id::text, 0));

  select * into prior from public.time_off_requests r where r.client_key = request_key;
  if found then
    shown := app_private.time_off_request_view(prior);
    if prior.workspace_id is distinct from target_workspace_id or prior.employee_id is distinct from target_employee_id
       or prior.kind <> 'leave' or prior.created_by is distinct from actor_user_id
       or prior.kind_of_leave is distinct from entered_kind or prior.all_day is distinct from entered_all_day
       or prior.note is distinct from note_text
       or shown ->> 'start_date' is distinct from first_day::text or shown ->> 'end_date' is distinct from last_day::text
       or shown ->> 'start_time' is distinct from (case when entered_all_day then null else to_char(from_clock, 'HH24:MI') end)
       or shown ->> 'end_time' is distinct from (case when entered_all_day then null else to_char(to_clock, 'HH24:MI') end) then
      raise exception 'This request key was used for other time off' using errcode = 'PT409', hint = 'time_off.key_reused';
    end if;
    return app_private.time_off_decider_view(prior);
  end if;

  if entered_kind is null or entered_kind not in ('vacation', 'sick', 'personal', 'other') or entered_all_day is null
     or (not entered_all_day and (from_clock is null or to_clock is null))
     or char_length(note_text) > 1000 then
    raise exception 'Choose a type, the days, and the hours unless it is all day; a note is at most 1000 characters'
      using errcode = '22023', hint = 'time_off.invalid';
  end if;
  span := app_private.time_off_entry_range(zone_name, first_day, last_day,
    case when entered_all_day then null else from_clock end, case when entered_all_day then null else to_clock end);
  if expected_timezone is distinct from zone_name then
    raise exception 'The time zone of this person''s location changed. Check the hours again'
      using errcode = 'PT409', hint = 'time_off.timezone_changed';
  end if;

  if exists (select 1 from app_private.leave_spans(target_workspace_id, array[target_employee_id], span) s where s.pending) then
    select btrim(coalesce(nullif(btrim(e.preferred_name), ''), e.first_name) || ' ' || e.last_name) into name
    from public.employee_profiles e where e.id = target_employee_id;
    raise exception '% has a request waiting for these days. Answer it first.', name
      using errcode = 'PT409', hint = 'time_off.pending_overlap';
  end if;
  if exists (select 1 from app_private.leave_spans(target_workspace_id, array[target_employee_id], span)) then
    raise exception 'This person already has time off in these hours' using errcode = 'PT409', hint = 'time_off.overlap';
  end if;

  created.workspace_id := target_workspace_id;
  created.employee_id := target_employee_id;
  created.starts_at := lower(span);
  created.ends_at := upper(span);
  if expected_impact is distinct from app_private.time_off_shifts_print(app_private.time_off_shifts_at_stake(created)) then
    raise exception 'The shifts this time off opens changed. Review them again' using errcode = 'PT409', hint = 'time_off.changed';
  end if;

  insert into public.time_off_requests (workspace_id, employee_id, starts_at, ends_at, all_day, time_timezone,
    kind_of_leave, note, status, effective, decided_by, decided_at, created_by, client_key)
  values (target_workspace_id, target_employee_id, lower(span), upper(span), entered_all_day, zone_name, entered_kind,
    note_text, 'approved', tstzmultirange(span), actor_user_id, now(), actor_user_id, request_key)
  returning * into created;
  perform app_private.time_off_open_shifts(created, actor_user_id);
  perform app_private.time_off_request_tell(created, 'entered', actor_user_id);
  return app_private.time_off_decider_view(created);
end;
$$;

revoke all on function public.enter_time_off_service(uuid, uuid, uuid, text, date, date, boolean, time, time, text, text, text, uuid) from public;
grant execute on function public.enter_time_off_service(uuid, uuid, uuid, text, date, date, boolean, time, time, text, text, text, uuid) to service_role;
