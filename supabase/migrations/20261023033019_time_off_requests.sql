-- Time off rebuild D2 (KARARLAR S-239, S-242): an employee asks for time off and takes back a request that
-- waits. Nothing here decides one (D3).
--
-- public.time_off_requests is the new system's one table, in its full shape for every slice: a request
-- (kind 'leave') or a request to cancel approved time off (kind 'cancel', D4) is one range in the time zone
-- of the person's primary location. `effective` is the time off as it is now, and the only column a reader
-- of time off looks at: empty until a decision, what is left of it after a cancellation or a revoke.
-- Row level security is on with no policy and no grant: only the SECURITY DEFINER services below reach it.
-- Overlap is kept out by a lock per person and a check, not a constraint (no btree_gist), and nothing on
-- the table takes the workspace lock (BL-791): asking touches no shift.
--
-- app_private.leave_spans reads the new table beside the old ones: approved (or what is left after a
-- cancellation or a revoke) as `effective`, a request waiting for an answer as the hours asked while it has
-- not started. Its segment_id is the request's id: a request is one range, and the assessment's leave
-- evidence (segment_id, request_id, request_revision) still names one piece per range.
--
-- ask_time_off_service, withdraw_time_off_service and my_time_off_service are the employee's three doors
-- (time_off.request_own; the list is employee_hub.read). close_employee_side withdraws what waits in the
-- new table too, and employee_side_impact counts it.

create table public.time_off_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  employee_id uuid not null,
  kind text not null default 'leave',
  cancels_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null,
  time_timezone text not null,
  kind_of_leave text not null,
  note text,
  status text not null default 'pending',
  effective tstzmultirange not null default '{}',
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  decision_note text,
  ended_by uuid references auth.users (id),
  ended_at timestamptz,
  ended_note text,
  created_by uuid not null references auth.users (id),
  reminded_at timestamptz,
  revision integer not null default 1,
  client_key uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_off_requests_id_workspace_id_key unique (id, workspace_id),
  constraint time_off_requests_employee_fkey foreign key (employee_id, workspace_id)
    references public.employee_profiles (id, workspace_id),
  constraint time_off_requests_cancels_fkey foreign key (cancels_id, workspace_id)
    references public.time_off_requests (id, workspace_id),
  constraint time_off_requests_kind_check check (kind in ('leave', 'cancel')),
  constraint time_off_requests_cancels_check check ((kind = 'cancel') = (cancels_id is not null)),
  constraint time_off_requests_kind_of_leave_check check (kind_of_leave in ('vacation', 'sick', 'personal', 'other')),
  constraint time_off_requests_status_check
    check (status in ('pending', 'approved', 'declined', 'withdrawn', 'expired', 'cancelled', 'revoked')),
  constraint time_off_requests_order_check check (ends_at > starts_at),
  -- 31 days, and the hour a clock change can add to 31 whole local days.
  constraint time_off_requests_length_check check (ends_at - starts_at <= interval '31 days 1 hour'),
  constraint time_off_requests_effective_status_check
    check (isempty(effective) or (kind = 'leave' and status in ('approved', 'cancelled', 'revoked'))),
  constraint time_off_requests_effective_inside_check
    check (effective <@ tstzmultirange(tstzrange(starts_at, ends_at, '[)'))),
  constraint time_off_requests_note_check check (char_length(note) <= 1000),
  constraint time_off_requests_decision_note_check check (char_length(decision_note) <= 1000),
  constraint time_off_requests_ended_note_check check (char_length(ended_note) <= 1000)
);

create index time_off_requests_person on public.time_off_requests (workspace_id, employee_id, starts_at);
create index time_off_requests_waiting on public.time_off_requests (workspace_id, starts_at) where status = 'pending';
create index time_off_requests_cancels on public.time_off_requests (cancels_id) where cancels_id is not null;

alter table public.time_off_requests enable row level security;
revoke all on table public.time_off_requests from anon, authenticated;

-- One request as the employee's screen reads it. A request still waiting when its start passed reads as
-- expired (the sweep that writes it comes in D6). Local dates and clocks are in the zone it was asked in:
-- All day gives its first and last day; hours that end at midnight read as 24:00 on their last day.
create function app_private.time_off_request_view(r public.time_off_requests)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'kind', r.kind,
    'kind_of_leave', r.kind_of_leave,
    'status', case when r.status = 'pending' and r.starts_at <= now() then 'expired' else r.status end,
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
    'decided_at', r.decided_at,
    'decided_by_name', case when r.decided_by is null then null else app_private.account_name(r.decided_by) end,
    'decision_note', r.decision_note,
    'ended_at', r.ended_at,
    'ended_note', r.ended_note)
$$;

revoke all on function app_private.time_off_request_view(public.time_off_requests) from public;

create or replace function app_private.leave_spans(target_workspace uuid, target_people uuid[], target_window tstzrange)
returns table (employee_id uuid, request_id uuid, segment_id uuid, revision integer, span tstzrange, pending boolean, zone text)
language sql
stable
strict
set search_path = ''
as $$
  select req.employee_id, req.id, seg.id, req.revision, piece.span, req.status = 'pending', seg.time_timezone
  from public.schedule_time_off_requests req
  join public.schedule_time_off_segments seg on seg.request_id = req.id and seg.workspace_id = req.workspace_id
  -- What time_off_effective_ranges says, without its three calls where nothing was given back: a
  -- pending request's hours are the hours asked; an approved period nothing cancels is all there.
  cross join lateral unnest(case
    when req.status = 'pending' then tstzmultirange(tstzrange(seg.starts_at, seg.ends_at, '[)'))
    when seg.status <> 'approved' then '{}'::tstzmultirange
    when not exists (select 1 from public.time_off_cancellation_periods cp where cp.parent_segment_id = seg.id)
      then tstzmultirange(tstzrange(seg.starts_at, seg.ends_at, '[)'))
    else public.time_off_effective_ranges(seg.id) end) piece(span)
  where req.workspace_id = leave_spans.target_workspace
    and req.employee_id = any (leave_spans.target_people)
    and req.request_type = 'time_off'
    and req.status in ('approved', 'pending')
    -- A period is at most a day long (time_off_resolve_period) and its date is
    -- local: three days either side finds every one that can touch the window.
    and (lower_inf(leave_spans.target_window)
      or seg.segment_date >= (lower(leave_spans.target_window) at time zone 'UTC')::date - 3)
    and (upper_inf(leave_spans.target_window)
      or seg.segment_date <= (upper(leave_spans.target_window) at time zone 'UTC')::date + 3)
    and tstzrange(seg.starts_at, seg.ends_at, '[)') && leave_spans.target_window
    and piece.span && leave_spans.target_window
  union all
  -- The new table (D2): what is approved, or left of it, is `effective`; one request is one range, so
  -- its id is also the piece's.
  select r.employee_id, r.id, r.id, r.revision, piece.span, false, r.time_timezone
  from public.time_off_requests r
  cross join lateral unnest(r.effective) piece(span)
  where r.workspace_id = leave_spans.target_workspace
    and r.employee_id = any (leave_spans.target_people)
    and r.kind = 'leave'
    and not isempty(r.effective)
    and (upper_inf(leave_spans.target_window) or r.starts_at < upper(leave_spans.target_window))
    and piece.span && leave_spans.target_window
  union all
  -- A request waiting for an answer, as the hours asked, until it starts: then it has expired.
  select r.employee_id, r.id, r.id, r.revision, tstzrange(r.starts_at, r.ends_at, '[)'), true, r.time_timezone
  from public.time_off_requests r
  where r.workspace_id = leave_spans.target_workspace
    and r.employee_id = any (leave_spans.target_people)
    and r.kind = 'leave'
    and r.status = 'pending'
    and r.starts_at > now()
    and (upper_inf(leave_spans.target_window) or r.starts_at < upper(leave_spans.target_window))
    and tstzrange(r.starts_at, r.ends_at, '[)') && leave_spans.target_window;
$$;

revoke all on function app_private.leave_spans(uuid, uuid[], tstzrange) from public;

-- The employee asks. One range: All day from the first day's local midnight to the midnight after the
-- last day; with hours, from the first day's clock to the last day's (24:00 is the next midnight). The zone
-- is the primary location's; a form drawn in another zone is sent back. The same request key gives back
-- the same request; used for other hours, it is refused.
create function public.ask_time_off_service(
  actor_user_id uuid, target_workspace_id uuid, asked_kind text, first_day date, last_day date,
  asked_all_day boolean, from_clock time, to_clock time, asked_note text, expected_timezone text, request_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid;
  zone_name text;
  prior public.time_off_requests;
  shown jsonb;
  note_text text := nullif(btrim(coalesce(asked_note, '')), '');
  begins timestamptz;
  ends timestamptz;
  created public.time_off_requests;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'time_off.request_own');
  select e.id into person from public.employee_profiles e
  where e.workspace_id = target_workspace_id and e.user_id = actor_user_id and e.archived_at is null;
  if person is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.request_own';
  end if;
  if request_key is null then
    raise exception 'A request key is required' using errcode = '22023', hint = 'time_off.invalid';
  end if;
  -- One request at a time per person, so two cannot both pass the overlap check. Nothing else waits.
  perform pg_advisory_xact_lock(hashtextextended('time_off_person:' || person::text, 0));

  select * into prior from public.time_off_requests r where r.client_key = request_key;
  if found then
    shown := app_private.time_off_request_view(prior);
    if prior.employee_id is distinct from person or prior.kind <> 'leave'
       or prior.kind_of_leave is distinct from asked_kind or prior.all_day is distinct from asked_all_day
       or prior.note is distinct from note_text
       or shown ->> 'start_date' is distinct from first_day::text or shown ->> 'end_date' is distinct from last_day::text
       or shown ->> 'start_time' is distinct from (case when asked_all_day then null else to_char(from_clock, 'HH24:MI') end)
       or shown ->> 'end_time' is distinct from (case when asked_all_day then null else to_char(to_clock, 'HH24:MI') end) then
      raise exception 'This request key was used for other time off' using errcode = 'PT409', hint = 'time_off.key_reused';
    end if;
    return shown;
  end if;

  if asked_kind is null or asked_kind not in ('vacation', 'sick', 'personal', 'other')
     or first_day is null or last_day is null or asked_all_day is null
     or (not asked_all_day and (from_clock is null or to_clock is null or from_clock = '24:00'))
     or char_length(note_text) > 1000 then
    raise exception 'Choose a type, the days, and the hours unless it is all day; a note is at most 1000 characters'
      using errcode = '22023', hint = 'time_off.invalid';
  end if;
  if last_day < first_day then
    raise exception 'The last day is before the first day' using errcode = '22023', hint = 'time_off.order';
  end if;

  zone_name := app_private.time_off_timezone(target_workspace_id, person);
  if zone_name is null then
    raise exception 'You need a location before you can ask for time off' using errcode = '55000', hint = 'time_off.no_location';
  end if;
  if expected_timezone is distinct from zone_name then
    raise exception 'The time zone of your location changed. Check the hours again before sending'
      using errcode = 'PT409', hint = 'time_off.timezone_changed';
  end if;

  if asked_all_day then
    if last_day - first_day + 1 > 31 then
      raise exception 'Ask for 31 days or fewer at a time' using errcode = '22023', hint = 'time_off.too_long';
    end if;
    begins := first_day::timestamp at time zone zone_name;
    ends := (last_day + 1)::timestamp at time zone zone_name;
  else
    if last_day + to_clock <= first_day + from_clock then
      raise exception 'The end is before the start' using errcode = '22023', hint = 'time_off.order';
    end if;
    if (last_day + to_clock) - (first_day + from_clock) > interval '31 days' then
      raise exception 'Ask for 31 days or fewer at a time' using errcode = '22023', hint = 'time_off.too_long';
    end if;
    begin
      -- A clock the zone repeats is its first time; one it skips does not exist.
      begins := public.time_off_resolve_clock(first_day + from_clock, zone_name, 'earlier');
      ends := public.time_off_resolve_clock(last_day + to_clock, zone_name, 'earlier');
    exception when sqlstate '22023' then
      raise exception 'These hours do not exist on this date in your time zone'
        using errcode = '22023', hint = 'time_off.no_such_time';
    end;
  end if;
  if begins <= now() then
    raise exception 'That time has already started' using errcode = '22023', hint = 'time_off.started';
  end if;
  if exists (select 1 from app_private.leave_spans(target_workspace_id, array[person], tstzrange(begins, ends, '[)'))) then
    raise exception 'You already have time off or a request in these hours' using errcode = 'PT409', hint = 'time_off.overlap';
  end if;

  insert into public.time_off_requests (workspace_id, employee_id, starts_at, ends_at, all_day, time_timezone,
    kind_of_leave, note, created_by, client_key)
  values (target_workspace_id, person, begins, ends, asked_all_day, zone_name, asked_kind, note_text, actor_user_id, request_key)
  returning * into created;
  return app_private.time_off_request_view(created);
end;
$$;

revoke all on function public.ask_time_off_service(uuid, uuid, text, date, date, boolean, time, time, text, text, uuid) from public;
grant execute on function public.ask_time_off_service(uuid, uuid, text, date, date, boolean, time, time, text, text, uuid) to service_role;

-- The employee takes back a request still waiting for an answer, as they last read it.
create function public.withdraw_time_off_service(actor_user_id uuid, target_workspace_id uuid, target_request_id uuid,
  expected_revision integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_request public.time_off_requests;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'time_off.request_own');
  select * into found_request from public.time_off_requests r
  where r.id = target_request_id and r.workspace_id = target_workspace_id;
  if not found then
    raise exception 'Time off request not found' using errcode = 'P0002', hint = 'time_off.not_found';
  end if;
  perform app_private.authorize(actor_user_id, target_workspace_id, 'time_off.request_own', target_person => found_request.employee_id);
  perform pg_advisory_xact_lock(hashtextextended('time_off_person:' || found_request.employee_id::text, 0));
  select * into found_request from public.time_off_requests r where r.id = target_request_id for update;
  if found_request.revision is distinct from expected_revision then
    raise exception 'This request changed. Check it again' using errcode = 'PT409', hint = 'time_off.changed';
  end if;
  if found_request.kind <> 'leave' or found_request.status <> 'pending' or found_request.starts_at <= now() then
    raise exception 'Only a request waiting for an answer can be withdrawn' using errcode = 'PT409', hint = 'time_off.not_pending';
  end if;
  update public.time_off_requests
  set status = 'withdrawn', ended_by = actor_user_id, ended_at = now(), revision = revision + 1, updated_at = now()
  where id = found_request.id
  returning * into found_request;
  return app_private.time_off_request_view(found_request);
end;
$$;

revoke all on function public.withdraw_time_off_service(uuid, uuid, uuid, integer) from public;
grant execute on function public.withdraw_time_off_service(uuid, uuid, uuid, integer) to service_role;

-- The employee's own time off: their zone and today there, where an answer comes from (their live
-- locations, primary first), and their requests, newest first.
create function public.my_time_off_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  person uuid;
  zone_name text;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee_hub.read');
  select e.id into person from public.employee_profiles e
  where e.workspace_id = target_workspace_id and e.user_id = actor_user_id and e.archived_at is null;
  if person is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'employee_hub.read';
  end if;
  zone_name := app_private.time_off_timezone(target_workspace_id, person);
  return jsonb_build_object(
    'time_zone', zone_name,
    'today', case when zone_name is null then null else (now() at time zone zone_name)::date end,
    'location_names', coalesce((
      select jsonb_agg(l.name order by a.is_primary desc, a.assigned_at)
      from public.employee_location_assignments a
      join public.locations l on l.id = a.location_id and l.workspace_id = a.workspace_id
      where a.workspace_id = target_workspace_id and a.employee_id = person and a.ended_at is null
        and app_private.location_is_live(l)), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(app_private.time_off_request_view(r) order by r.starts_at desc, r.created_at desc)
      from (select * from public.time_off_requests q
            where q.workspace_id = target_workspace_id and q.employee_id = person
            order by q.starts_at desc limit 200) r), '[]'::jsonb));
end;
$$;

revoke all on function public.my_time_off_service(uuid, uuid) from public;
grant execute on function public.my_time_off_service(uuid, uuid) to service_role;

-- Closing the employee side: what waits in the new table is withdrawn too, saying why.
CREATE OR REPLACE FUNCTION "app_private"."close_employee_side"("w" "uuid", "emp" "uuid", "actor" "uuid", "reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  impact jsonb;
  opened uuid[];
  closed record;
  why text := case reason
    when 'terminated' then 'This person no longer works here.'
    when 'access_removed' then 'This person no longer has access to the workspace.'
    else 'This person no longer works shifts here.' end;
begin
  if reason is null or reason not in ('access_dropped', 'terminated', 'access_removed') then
    raise exception 'unknown reason to close the employee side' using errcode = '22023';
  end if;
  perform public.availability_lock_workspace(w);
  impact := app_private.employee_side_impact(w, emp);

  if reason = 'access_dropped' then
    with released as (
      update public.schedule_published_shifts shift
      set employee_id = null
      from public.schedule_location_publications publication, public.locations location
      where publication.id = shift.publication_id and publication.workspace_id = shift.workspace_id
        and publication.location_id = shift.location_id and publication.status = 'current'
        and location.id = shift.location_id and location.workspace_id = shift.workspace_id
        and shift.workspace_id = w and shift.employee_id = emp
        and (shift.scheduled_date + shift.start_time) at time zone location.timezone >= now()
      returning shift.id)
    select coalesce(array_agg(id), '{}') into opened from released;
    perform app_private.schedule_tell_unassigned(w, opened, actor);
  else
    impact := impact || jsonb_build_object('shifts_opened', 0, 'availability_deleted', false);
  end if;

  -- Their own requests: a swap, a cover, a release.
  for closed in
    update public.shift_exchange_cases c
    set status = 'cancelled', revision = c.revision + 1, updated_at = now()
    where c.workspace_id = w and c.owner_id = emp and c.status = 'open'
    returning c.id
  loop
    update public.shift_exchange_applications
    set status = 'closed_case_cancelled', updated_at = now()
    where case_id = closed.id and status in ('invited', 'pending_manager');
    delete from public.shift_exchange_votes where case_id = closed.id;
    perform public.shift_exchange_emit(actor, w, closed.id, null, 'case_closed',
      why || case when reason = 'access_removed' then ' This request was closed. The owner keeps this shift.'
        else ' This request was closed. The shift is open for someone else to pick up.' end);
  end loop;

  -- What they answered on somebody else's request; a request made to them alone closes with it.
  for closed in
    update public.shift_exchange_applications a
    set status = 'closed_case_cancelled', updated_at = now()
    from public.shift_exchange_cases c
    where c.id = a.case_id and c.workspace_id = a.workspace_id and c.status = 'open'
      and a.workspace_id = w and a.employee_id = emp and a.status in ('invited', 'pending_manager')
    returning a.id, a.case_id, c.audience
  loop
    delete from public.shift_exchange_votes where case_id = closed.case_id and application_id = closed.id;
    update public.shift_exchange_cases
    set status = case when closed.audience = 'direct' then 'cancelled' else status end,
        revision = revision + 1, updated_at = now()
    where id = closed.case_id;
    perform public.shift_exchange_emit(actor, w, closed.case_id, closed.id, 'application_closed',
      why || ' Their answer was closed. No assignment changed.');
  end loop;

  -- Their time off waiting for a decision is withdrawn (design §4.8).
  for closed in
    update public.schedule_time_off_requests r
    set status = 'revoked', revision = r.revision + 1, updated_at = now()
    where r.workspace_id = w and r.employee_id = emp and r.status = 'pending'
    returning r.id
  loop
    insert into public.schedule_time_off_events (workspace_id, request_id, action, actor_user_id, note)
    values (w, closed.id, 'revoked', actor, why);
    perform app_private.time_off_tell(w, closed.id, 'withdrawn', actor);
  end loop;
  -- And in the new table (time off rebuild D2); its notices come with D3.
  update public.time_off_requests r
  set status = 'withdrawn', ended_by = actor, ended_at = now(), ended_note = why, revision = r.revision + 1, updated_at = now()
  where r.workspace_id = w and r.employee_id = emp and r.status = 'pending';

  return impact;
end;
$$;

CREATE OR REPLACE FUNCTION "app_private"."employee_side_impact"("w" "uuid", "emp" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'shifts_opened', (
      select count(*)::integer
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication
        on publication.id = shift.publication_id and publication.workspace_id = shift.workspace_id
       and publication.location_id = shift.location_id and publication.status = 'current'
      join public.locations location on location.id = shift.location_id and location.workspace_id = shift.workspace_id
      where shift.workspace_id = w and shift.employee_id = emp
        and (shift.scheduled_date + shift.start_time) at time zone location.timezone >= now()),
    'requests_closed', (
      select count(*)::integer from public.shift_exchange_cases c
      where c.workspace_id = w and c.owner_id = emp and c.status = 'open'),
    'applications_closed', (
      select count(*)::integer
      from public.shift_exchange_applications a
      join public.shift_exchange_cases c on c.id = a.case_id and c.workspace_id = a.workspace_id
      where a.workspace_id = w and a.employee_id = emp and a.status in ('invited', 'pending_manager')
        and c.status = 'open' and c.owner_id is distinct from emp),
    'time_off_withdrawn', (
      select count(*)::integer from public.schedule_time_off_requests r
      where r.workspace_id = w and r.employee_id = emp and r.status = 'pending')
      + (select count(*)::integer from public.time_off_requests r
         where r.workspace_id = w and r.employee_id = emp and r.status = 'pending'),
    'availability_deleted',
      exists (select 1 from public.employee_weekly_preferences p where p.workspace_id = w and p.employee_id = emp)
      or exists (select 1 from public.manager_weekly_reminders m where m.workspace_id = w and m.employee_id = emp))
$$;
