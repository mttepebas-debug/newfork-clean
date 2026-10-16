-- BILDIRIM-U2 (KARARLAR S-123, S-95, P07; docs/plan/research/BILDIRIM-URETICILER.md §2.3): time off writes its
-- own notices into the new core (part 4, second slice).
--   * a request (and a cancellation of approved time off) reaches who decides it: the location's manager;
--     an admin and the owner only where no manager can (P07). The owner's own asks nobody;
--   * a decision tells the person who asked once, with the outcome; it closes every decider's card;
--   * withdrawing closes the cards and writes nothing new;
--   * twelve hours before the deadline the managers who have not decided are reminded once; where no
--     manager can decide, an admin and the owner are told once (one key per request: the core keeps it
--     to one; the columns that did this went with the old system);
--   * shortening tells the person and whoever approved it; revoking tells the person.
-- Two helpers find recipients through the core (authz_reason), never by a role's name; later slices use
-- them too. "Approved · 2 shifts open" on a card: the count rides on the person's decision notice; the
-- core's resolve carries no data.

-- Who holds an action (at these places, over this person), among the workspace's active members.
create function app_private.notify_holders(target_workspace uuid, target_action text, target_places uuid[] default null,
  target_person uuid default null)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(m.user_id order by m.user_id), '{}')
  from public.workspace_memberships m
  where m.workspace_id = target_workspace and m.status = 'active'
    and app_private.authz_reason(m.user_id, target_workspace, target_action, target_places, target_person) is null;
$$;

-- Who decides, place by place (P07): who holds the action at a place but not the wide one (a manager);
-- where nobody does, or with no place at all, who holds the wide action (an admin and the owner).
create function app_private.notify_deciders(target_workspace uuid, target_action text, target_places uuid[],
  target_person uuid, target_wide_action text)
returns uuid[]
language plpgsql
stable
set search_path = ''
as $$
declare
  wide uuid[] := app_private.notify_holders(target_workspace, target_wide_action, null, target_person);
  found uuid[] := '{}';
  here uuid[];
  place uuid;
  short boolean := coalesce(cardinality(target_places), 0) = 0;
begin
  foreach place in array coalesce(target_places, '{}'::uuid[]) loop
    here := array(select u from unnest(app_private.notify_holders(target_workspace, target_action, array[place], target_person)) u
                  where u <> all (wide));
    if cardinality(here) = 0 then
      short := true;
    end if;
    found := found || here;
  end loop;
  if short then
    found := found || wide;
  end if;
  return array(select distinct u from unnest(found) u order by u);
end;
$$;

revoke all on function app_private.notify_holders(uuid, text, uuid[], uuid) from public;
revoke all on function app_private.notify_deciders(uuid, text, uuid[], uuid, text) from public;

-- "Oct 20", "Oct 20–22", "Oct 30–Nov 2": the request's days.
create function app_private.time_off_days_text(target_workspace uuid, target_request uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case when d.first_day = d.last_day then to_char(d.first_day, 'FMMon FMDD')
              when date_trunc('month', d.first_day) = date_trunc('month', d.last_day)
                then to_char(d.first_day, 'FMMon FMDD') || '–' || to_char(d.last_day, 'FMDD')
              else to_char(d.first_day, 'FMMon FMDD') || '–' || to_char(d.last_day, 'FMMon FMDD') end
  from (select min(s.segment_date) first_day, max(s.segment_date) last_day from public.schedule_time_off_segments s
        where s.workspace_id = target_workspace and s.request_id = target_request) d;
$$;

-- One entry point for a request's notices. what: requested; approved, declined, expired, revoked (the
-- person's outcome); withdrawn, closed (the cards close, nothing new).
create function app_private.time_off_tell(target_workspace uuid, target_request uuid, what text, target_actor uuid,
  target_note text default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  r public.schedule_time_off_requests%rowtype;
  person public.employee_profiles%rowtype;
  name text;
  days text;
  is_cancel boolean;
  card_url text := '/app/schedule/requests?tab=time-off&request=' || target_request::text;
  heading text;
  said text;
  sent integer := 0;
begin
  if what in ('withdrawn', 'closed') then
    perform app_private.notification_resolve(target_workspace, 'time_off_request', target_request, what, target_actor);
    return 0;
  end if;
  select * into r from public.schedule_time_off_requests q where q.id = target_request and q.workspace_id = target_workspace;
  select * into person from public.employee_profiles e where e.id = r.employee_id and e.workspace_id = target_workspace;
  name := btrim(coalesce(nullif(person.preferred_name, ''), person.first_name) || ' ' || person.last_name);
  days := app_private.time_off_days_text(target_workspace, target_request);
  is_cancel := r.request_type = 'time_off_cancellation';

  if what = 'requested' then
    -- The owner's own is recorded approved at once: nobody is asked.
    if r.status <> 'pending' then
      return 0;
    end if;
    return app_private.notify(
      'time_off.requested', target_workspace,
      app_private.notify_deciders(target_workspace, 'time_off.decide', app_private.time_off_live_locations(target_workspace, target_request),
                                  r.employee_id, 'time_off.decide_alone'),
      'time_off:' || target_request::text || ':requested',
      case when is_cancel then name || ' asked to cancel time off' else 'Time off request from ' || name end,
      days || coalesce(' · ' || left(nullif(btrim(r.reason), ''), 900), ''),
      card_url, target_actor, 'time_off_request', target_request,
      jsonb_build_object('request_id', target_request, 'request_type', r.request_type));
  end if;

  heading := case
    when is_cancel then 'Your time off cancellation for ' || days || case what when 'approved' then ' is approved'
      when 'declined' then ' is declined' else ' wasn''t decided in time' end
    else 'Your time off ' || days || case what when 'approved' then ' is approved' when 'declined' then ' is declined'
      when 'revoked' then ' was revoked' else ' wasn''t decided in time' end end;
  said := case
    when what = 'expired' then case when is_cancel then 'Nobody decided before the deadline. Your approved time off stays.'
      else 'Nobody decided before the deadline, so it was declined.' end
    when target_actor is not null and nullif(btrim(coalesce(target_note, '')), '') is not null then btrim(target_note)
    when is_cancel and what = 'approved' then 'Shifts opened earlier stay open.'
    when is_cancel then 'Your approved time off stays.'
    else null end;
  sent := app_private.notify(
    'time_off.decided', target_workspace, array[person.user_id],
    'time_off:' || target_request::text || ':' || what, heading, said, '/app/employee-hub/my-availability',
    target_actor, 'time_off_request', target_request,
    jsonb_build_object('request_id', target_request, 'outcome', what,
      'shifts_opened', (select count(*)::integer from public.time_off_assignment_releases x
                        where x.workspace_id = target_workspace and x.request_id = target_request and x.decision_revision = r.revision)));
  perform app_private.notification_resolve(target_workspace, 'time_off_request', target_request, what, target_actor);
  return sent;
end;
$$;

-- Twelve hours before the deadline, once: the managers who have not decided. Where no manager can decide
-- now, an admin and the owner are told once; a reminder due in the same pass does not tell them twice.
create function app_private.time_off_remind(target_workspace uuid, target_request uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  r public.schedule_time_off_requests%rowtype;
  person public.employee_profiles%rowtype;
  name text;
  zone text;
  st jsonb;
  fallback_key text := 'time_off:' || target_request::text || ':fallback';
  reminder_key text := 'time_off:' || target_request::text || ':reminder';
  fallback_due boolean;
  reminder_due boolean;
  alone uuid[];
  waiting uuid[];
  card_url text := '/app/schedule/requests?tab=time-off&request=' || target_request::text;
  sent integer := 0;
begin
  select * into r from public.schedule_time_off_requests q where q.id = target_request and q.workspace_id = target_workspace;
  if r.status <> 'pending' or r.decide_by is null or r.decide_by <= now() then
    return 0;
  end if;
  reminder_due := r.decide_by - interval '12 hours' <= now() and r.created_at < r.decide_by - interval '12 hours'
    and not exists (select 1 from public.person_notifications n where n.workspace_id = target_workspace
                    and n.type_key = 'time_off.decision_reminder' and n.event_key = reminder_key);
  fallback_due := not exists (select 1 from public.person_notifications n where n.workspace_id = target_workspace
                              and n.type_key = 'time_off.decision_reminder' and n.event_key = fallback_key)
    and exists (select 1 from public.time_off_required_locations x where x.request_id = target_request);
  if not (reminder_due or fallback_due) then
    return 0;
  end if;
  st := app_private.time_off_state(target_workspace, target_request);
  fallback_due := fallback_due and ((st ->> 'fallback')::boolean or (st ->> 'unattended')::integer > 0);
  if not (reminder_due or fallback_due) then
    return 0;
  end if;

  select * into person from public.employee_profiles e where e.id = r.employee_id and e.workspace_id = target_workspace;
  name := btrim(coalesce(nullif(person.preferred_name, ''), person.first_name) || ' ' || person.last_name);
  zone := coalesce(app_private.time_off_timezone(target_workspace, r.employee_id), 'UTC');
  alone := app_private.notify_holders(target_workspace, 'time_off.decide_alone', null, r.employee_id);

  if fallback_due then
    sent := sent + app_private.notify(
      'time_off.decision_reminder', target_workspace, alone, fallback_key,
      name || '''s time off waits for an admin',
      'No manager can decide it now. Decide by ' || to_char(r.decide_by at time zone zone, 'FMDy, FMMon FMDD')
        || ' or it is declined.',
      card_url, null, 'time_off_request', target_request, jsonb_build_object('request_id', target_request));
  end if;
  if reminder_due then
    waiting := app_private.notify_deciders(target_workspace, 'time_off.decide',
      array(select (x ->> 'id')::uuid from jsonb_array_elements(st -> 'locations') x where x -> 'approved_by' = 'null'::jsonb),
      r.employee_id, 'time_off.decide_alone');
    -- Who was told that only an admin can decide it, now or in an earlier pass, has it already.
    if fallback_due or exists (select 1 from public.person_notifications n where n.workspace_id = target_workspace
                               and n.type_key = 'time_off.decision_reminder' and n.event_key = fallback_key) then
      waiting := array(select u from unnest(waiting) u where u <> all (alone));
    end if;
    sent := sent + app_private.notify(
      'time_off.decision_reminder', target_workspace, waiting, reminder_key,
      'Decide by ' || to_char(r.decide_by at time zone zone, 'FMDy') || ': ' || name || '''s time off',
      'If nobody decides by then, it is declined.',
      card_url, null, 'time_off_request', target_request, jsonb_build_object('request_id', target_request));
  end if;
  return sent;
end;
$$;

-- Approved hours given back: the person, and whoever approved the time off (its last approval and every
-- vote for it; approved by the system, who could decide it). Never the one who shortened it.
create function app_private.time_off_tell_shortened(target_workspace uuid, target_parent uuid, target_cut uuid,
  target_actor uuid, given tstzmultirange, zone_name text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  r public.schedule_time_off_requests%rowtype;
  person public.employee_profiles%rowtype;
  name text;
  fmt text;
  lines text;
  approvers uuid[];
  key text := 'time_off:' || target_parent::text || ':shortened:' || target_cut::text;
  sent integer;
begin
  select * into r from public.schedule_time_off_requests q where q.id = target_parent and q.workspace_id = target_workspace;
  select * into person from public.employee_profiles e where e.id = r.employee_id and e.workspace_id = target_workspace;
  name := btrim(coalesce(nullif(person.preferred_name, ''), person.first_name) || ' ' || person.last_name);
  fmt := case when (select s.time_format from public.workspace_scheduling_settings s where s.workspace_id = target_workspace) = '24h'
    then 'HH24:MI' else 'FMHH12:MI AM' end;
  -- "Wed, Oct 1, 10:00 AM–2:00 PM", in the time off's own time zone.
  select string_agg(to_char(lower(p) at time zone zone_name, 'Dy, Mon FMDD') || ', ' || to_char(lower(p) at time zone zone_name, fmt)
    || '–' || to_char(upper(p) at time zone zone_name, fmt), '; ' order by lower(p))
  into lines from unnest(given) p;
  select coalesce(array_agg(distinct x.u), '{}') into approvers
  from (select ev.actor_user_id u from public.schedule_time_off_events ev
        where ev.workspace_id = target_workspace and ev.request_id = target_parent and ev.action = 'approved' and ev.metadata ? 'segments'
        union all
        select v.voter_user_id from public.time_off_votes v
        where v.workspace_id = target_workspace and v.request_id = target_parent and v.verdict = 'approve'
        union all
        select d from unnest(app_private.notify_deciders(target_workspace, 'time_off.decide',
                               app_private.time_off_live_locations(target_workspace, target_parent), r.employee_id, 'time_off.decide_alone')) d
        where exists (select 1 from public.schedule_time_off_events ev where ev.workspace_id = target_workspace
                      and ev.request_id = target_parent and ev.action = 'approved' and ev.metadata ? 'segments'
                      and ev.actor_user_id is null)) x
  where x.u is not null and x.u is distinct from person.user_id;

  sent := app_private.notify('time_off.shortened', target_workspace, array[person.user_id], key,
    'Your time off was shortened', left(lines || ' is no longer time off.', 1000), '/app/employee-hub/my-availability',
    target_actor, 'time_off_request', target_parent, jsonb_build_object('request_id', target_parent, 'cancellation_request_id', target_cut));
  return sent + app_private.notify('time_off.shortened', target_workspace, approvers, key,
    name || '''s time off was shortened', left(lines || ' is no longer time off.', 1000),
    '/app/schedule/requests?tab=time-off&request=' || target_parent::text,
    target_actor, 'time_off_request', target_parent, jsonb_build_object('request_id', target_parent, 'cancellation_request_id', target_cut));
end;
$$;

revoke all on function app_private.time_off_days_text(uuid, uuid) from public;
revoke all on function app_private.time_off_tell(uuid, uuid, text, uuid, text) from public;
revoke all on function app_private.time_off_remind(uuid, uuid) from public;
revoke all on function app_private.time_off_tell_shortened(uuid, uuid, uuid, uuid, tstzmultirange, text) from public;

-- The domain work calls them ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."submit_time_off_service"("actor" "uuid", "w" "uuid", "periods" "jsonb", "reason" "text", "expected_timezone" "text", "operation_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  employee public.employee_profiles%rowtype;
  zone_name text;
  command jsonb;
  prior public.time_off_commands%rowtype;
  period jsonb;
  resolved jsonb;
  asked jsonb := '[]';
  span tstzrange;
  covered tstzmultirange := '{}';
  rid uuid;
  result jsonb;
begin
  perform public.availability_lock_workspace(w);
  perform app_private.time_off_authorize(actor, w, 'time_off.request_own');
  select * into employee from public.employee_profiles e where e.workspace_id = w and e.user_id = actor and e.archived_at is null;
  if employee.id is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.request_own';
  end if;
  if operation_id is null then raise exception 'A request key is required' using errcode = '22023'; end if;
  command := jsonb_build_object('kind', 'request', 'periods', periods, 'reason', btrim(coalesce(reason, '')), 'expected_timezone', expected_timezone);
  select * into prior from public.time_off_commands c where c.workspace_id = w and c.actor_user_id = actor and c.operation_id = submit_time_off_service.operation_id;
  if found then
    if prior.input <> command then raise exception 'This request key was used for different time-off hours' using errcode = 'PT409', hint = 'time_off.request_reused'; end if;
    return prior.result;
  end if;
  if jsonb_typeof(periods) is distinct from 'array' then raise exception 'Enter the requested time-off periods' using errcode = '22023'; end if;
  if jsonb_array_length(periods) not between 1 and 31 or char_length(btrim(coalesce(reason, ''))) > 1000 then
    raise exception 'Enter between 1 and 31 days and a note of at most 1000 characters' using errcode = '22023'; end if;

  zone_name := app_private.time_off_timezone(w, employee.id);
  if zone_name is null then
    zone_name := expected_timezone;
  elsif expected_timezone is distinct from zone_name then
    raise exception 'The time zone of your location changed. Review the hours in the current time zone before sending' using errcode = 'PT409', hint = 'time_off.timezone_changed';
  end if;

  for period in select value from jsonb_array_elements(periods) loop
    resolved := public.time_off_resolve_period(period, zone_name);
    span := tstzrange((resolved ->> 'starts_at')::timestamptz, (resolved ->> 'ends_at')::timestamptz, '[)');
    if covered && span then raise exception 'Requested time-off periods must not overlap or repeat' using errcode = '22023'; end if;
    covered := covered + tstzmultirange(span);
    asked := asked || jsonb_build_array(resolved);
  end loop;
  if lower(range_merge(covered)) <= now() then
    raise exception 'Time off that has already started cannot be asked for here. Talk to your manager directly' using errcode = '22023';
  end if;
  if (select max((p ->> 'segment_date')::date) - min((p ->> 'segment_date')::date) + 1 <> count(distinct p ->> 'segment_date')
      from jsonb_array_elements(asked) p) then
    raise exception 'A request is one run of days in a row' using errcode = '22023';
  end if;
  if exists (select 1 from public.schedule_time_off_requests other
    join public.schedule_time_off_segments s on s.request_id = other.id and s.workspace_id = other.workspace_id
    where other.workspace_id = w and other.employee_id = employee.id and other.request_type = 'time_off'
      and other.status in ('pending', 'approved') and s.status in ('pending', 'approved')
      and covered && public.time_off_effective_ranges(s.id)) then
    raise exception 'overlapping time off request exists' using errcode = '23514';
  end if;

  insert into public.schedule_time_off_requests(workspace_id, employee_id, reason, created_by, decide_by)
  values (w, employee.id, btrim(coalesce(reason, '')), actor, app_private.time_off_decide_by(w, lower(range_merge(covered))))
  returning id into rid;
  insert into public.schedule_time_off_segments(workspace_id, request_id, segment_date, start_time, end_time, time_timezone, starts_at, ends_at, ends_next_day, fold_choices)
  select w, rid, (p ->> 'segment_date')::date, (p ->> 'start_time')::time, (p ->> 'end_time')::time, p ->> 'time_timezone',
    (p ->> 'starts_at')::timestamptz, (p ->> 'ends_at')::timestamptz, (p ->> 'ends_next_day')::boolean, p -> 'fold_choices'
  from jsonb_array_elements(asked) p;
  insert into public.time_off_required_locations(request_id, workspace_id, location_id)
  select rid, w, place from unnest(app_private.time_off_deciding_locations(w, employee.id)) place;
  insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, metadata)
  values (w, rid, 'submitted', actor, jsonb_build_object('periods', asked, 'operation_id', submit_time_off_service.operation_id));
  -- The owner's own time off is recorded approved (K12, BL-221).
  if public.time_off_is_the_owners_own(actor, w, rid) then
    perform app_private.time_off_finalize(w, rid, 'approve', actor, '', true);
  end if;
  perform app_private.time_off_tell(w, rid, 'requested', actor);
  select jsonb_build_object('status', r.status, 'request_id', r.id, 'revision', r.revision, 'decide_by', r.decide_by) into result
  from public.schedule_time_off_requests r where r.id = rid;
  insert into public.time_off_commands(workspace_id, actor_user_id, operation_id, input, result)
  values (w, actor, submit_time_off_service.operation_id, command, result);
  return result;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."request_time_off_cancellation_service"("actor" "uuid", "w" "uuid", "parent_id" "uuid", "expected_revision" integer, "periods" "jsonb", "reason" "text", "operation_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  employee public.employee_profiles%rowtype;
  parent public.schedule_time_off_requests%rowtype;
  original public.schedule_time_off_segments%rowtype;
  prior public.time_off_commands%rowtype;
  command jsonb;
  result jsonb;
  p jsonb;
  a timestamptz;
  b timestamptz;
  span tstzrange;
  covered tstzmultirange := '{}';
  rid uuid := gen_random_uuid();
  sid uuid;
begin
  perform public.availability_lock_workspace(w);
  perform app_private.time_off_authorize(actor, w, 'time_off.request_own');
  select r.* into parent from public.schedule_time_off_requests r
  join public.employee_profiles e on e.id = r.employee_id and e.workspace_id = r.workspace_id
  where r.id = parent_id and r.workspace_id = w and e.user_id = actor and e.archived_at is null
  for update of r;
  if parent.id is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.request_own';
  end if;
  if operation_id is null then raise exception 'A cancellation request key is required' using errcode = '22023'; end if;
  command := jsonb_build_object('kind', 'cancellation', 'parent', parent_id, 'revision', expected_revision, 'reason', btrim(coalesce(reason, '')), 'periods', periods);
  select * into prior from public.time_off_commands c where c.workspace_id = w and c.actor_user_id = actor and c.operation_id = request_time_off_cancellation_service.operation_id;
  if found then
    if prior.input <> command then raise exception 'This request key was used for a different cancellation' using errcode = 'PT409', hint = 'time_off.request_reused'; end if;
    return prior.result;
  end if;
  if expected_revision is null or parent.revision <> expected_revision or parent.request_type <> 'time_off' or parent.status <> 'approved' then
    raise exception 'stale approved leave; refresh before requesting cancellation' using errcode = 'PT409', hint = 'time_off.changed'; end if;
  if exists (select 1 from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id = cl.request_id
    where cl.parent_request_id = parent.id and cr.status = 'pending') then
    raise exception 'A cancellation request is already pending for this leave' using errcode = '23514'; end if;
  if jsonb_typeof(periods) is distinct from 'array' then raise exception 'Choose approved hours to cancel' using errcode = '22023'; end if;
  if jsonb_array_length(periods) not between 1 and 124 or char_length(btrim(coalesce(reason, ''))) > 1000 then
    raise exception 'Choose up to 124 periods and a note of at most 1000 characters' using errcode = '22023'; end if;

  insert into public.schedule_time_off_requests(id, workspace_id, employee_id, request_type, reason, created_by)
  values (rid, w, parent.employee_id, 'time_off_cancellation', btrim(coalesce(reason, '')), actor);
  insert into public.time_off_cancellation_links values (rid, w, parent.id, parent.revision);
  for p in select value from jsonb_array_elements(periods) loop
    -- A malformed id is a bad request, not a server error (R2-55).
    if coalesce(p ->> 'segment_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Choose an approved period from this leave' using errcode = '22023'; end if;
    select * into original from public.schedule_time_off_segments where id = (p ->> 'segment_id')::uuid and workspace_id = w and request_id = parent.id;
    if original.id is null then raise exception 'Choose an approved period from this leave' using errcode = '22023'; end if;
    if coalesce(p ->> 'starts_at', '') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or coalesce(p ->> 'ends_at', '') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
      raise exception 'Cancellation needs exact start and end instants' using errcode = '22023'; end if;
    a := (p ->> 'starts_at')::timestamptz; b := (p ->> 'ends_at')::timestamptz;
    if not isfinite(a) or not isfinite(b) or a >= b or a <= now() then raise exception 'Only future approved hours can be cancelled' using errcode = '22023'; end if;
    span := tstzrange(a, b, '[)');
    if not (public.time_off_effective_ranges(original.id) @> span) or covered && span then
      raise exception 'Cancellation must select approved hours without overlap' using errcode = '22023'; end if;
    covered := covered + tstzmultirange(span);
    sid := gen_random_uuid();
    insert into public.schedule_time_off_segments(id, workspace_id, request_id, segment_date, start_time, end_time, time_timezone, starts_at, ends_at, ends_next_day)
    values (sid, w, rid, (a at time zone original.time_timezone)::date, (a at time zone original.time_timezone)::time, (b at time zone original.time_timezone)::time,
      original.time_timezone, a, b, (b at time zone original.time_timezone)::date > (a at time zone original.time_timezone)::date);
    insert into public.time_off_cancellation_periods values (sid, w, rid, original.id, parent.id);
  end loop;
  update public.schedule_time_off_requests set decide_by = app_private.time_off_decide_by(w, lower(range_merge(covered))) where id = rid;
  insert into public.time_off_required_locations(request_id, workspace_id, location_id)
  select rid, w, place from unnest(app_private.time_off_deciding_locations(w, parent.employee_id)) place;
  insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
  values (w, rid, 'submitted', actor, btrim(coalesce(reason, '')),
    jsonb_build_object('parent_request_id', parent.id, 'parent_revision', parent.revision, 'operation_id', request_time_off_cancellation_service.operation_id));
  if public.time_off_is_the_owners_own(actor, w, rid) then
    perform app_private.time_off_finalize(w, rid, 'approve', actor, '', true);
  end if;
  perform app_private.time_off_tell(w, rid, 'requested', actor);
  select jsonb_build_object('status', r.status, 'request_id', r.id, 'revision', r.revision, 'decide_by', r.decide_by) into result
  from public.schedule_time_off_requests r where r.id = rid;
  insert into public.time_off_commands(workspace_id, actor_user_id, operation_id, input, result)
  values (w, actor, request_time_off_cancellation_service.operation_id, command, result);
  return result;
end;
$_$;

CREATE OR REPLACE FUNCTION "app_private"."time_off_finalize"("w" "uuid", "rid" "uuid", "verdict" "text", "actor" "uuid", "note" "text", "alone" boolean, "expired" boolean DEFAULT false) RETURNS "public"."schedule_time_off_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  r public.schedule_time_off_requests%rowtype;
  parent public.schedule_time_off_requests%rowtype;
  decided jsonb;
  released jsonb := '[]';
  given tstzmultirange;
  remaining tstzmultirange;
begin
  select * into r from public.schedule_time_off_requests where id = rid and workspace_id = w for update;
  -- Whoever got here first closed it (a withdrawal, a last vote, the job).
  if r.status <> 'pending' then
    raise exception 'This request is already closed' using errcode = 'PT409', hint = 'time_off.changed';
  end if;
  if verdict = 'approve' and r.request_type = 'time_off_cancellation' then
    select p.* into parent from public.time_off_cancellation_links cl
    join public.schedule_time_off_requests p on p.id = cl.parent_request_id and p.workspace_id = cl.workspace_id
    where cl.request_id = rid and cl.workspace_id = w for update of p;
    if parent.status <> 'approved' then
      raise exception 'The time off this cancellation is about has changed; refresh' using errcode = 'PT409', hint = 'time_off.changed';
    end if;
  end if;
  update public.schedule_time_off_segments
  set status = case verdict when 'approve' then 'approved' else 'denied' end::public.time_off_segment_status
  where request_id = rid and workspace_id = w;
  update public.schedule_time_off_requests
  set status = case verdict when 'approve' then 'approved' else 'denied' end::public.time_off_request_status,
      revision = revision + 1, updated_at = now()
  where id = rid returning * into r;
  select coalesce(jsonb_agg(jsonb_build_object('segment_id', s.id, 'status', s.status) order by s.starts_at, s.id), '[]') into decided
  from public.schedule_time_off_segments s where s.request_id = rid and s.workspace_id = w;
  if verdict = 'approve' and r.request_type = 'time_off' then
    -- The job settles it with no actor; the records name an approval that still counts.
    released := app_private.time_off_release_shifts(w, rid, actor, r.revision, case when actor is null then
      (select (x ->> 'approved_by')::uuid from jsonb_array_elements(app_private.time_off_state(w, rid) -> 'locations') x
       where x -> 'approved_by' <> 'null'::jsonb order by x ->> 'approved_at' desc limit 1) end);
  end if;
  insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
  values (w, rid, case when expired then 'expired' else r.status::text end, actor, coalesce(note, ''),
    jsonb_build_object('revision', r.revision, 'alone', alone, 'segments', decided, 'released_assignments', released));
  -- One decision, one notice to the person who asked; the deciders' cards close (S-95).
  perform app_private.time_off_tell(w, rid, case when expired then 'expired' when verdict = 'approve' then 'approved'
    else 'declined' end, actor, note);

  if verdict = 'approve' and r.request_type = 'time_off_cancellation' then
    select coalesce(range_agg(public.time_off_period_span(s.id)), '{}') into given
    from public.schedule_time_off_segments s where s.request_id = rid and s.workspace_id = w;
    select coalesce(range_agg(p.span), '{}') into remaining
    from public.schedule_time_off_segments s cross join lateral unnest(public.time_off_effective_ranges(s.id)) p(span)
    where s.request_id = parent.id and s.workspace_id = w;
    update public.schedule_time_off_requests
    set status = case when isempty(remaining) then 'revoked'::public.time_off_request_status else status end,
        revision = revision + 1, updated_at = now()
    where id = parent.id returning * into parent;
    insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
    values (w, parent.id, case when isempty(remaining) then 'revoked' else parent.status::text end, actor,
      'Cancellation approved. Shifts opened earlier stay open.',
      jsonb_build_object('revision', parent.revision, 'cancellation_request_id', rid, 'cancelled_intervals', public.availability_ranges_json(given)));
  end if;
  return r;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."employee_request_action_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_request_id" "uuid", "target_kind" "text", "target_action" "text", "target_expected_revision" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare employee public.employee_profiles%rowtype; time_request public.schedule_time_off_requests%rowtype;
begin
  perform public.availability_lock_workspace(target_workspace_id);
employee:=public.employee_hub_actor_service(actor_user_id,target_workspace_id);
  if target_kind='time_off' and target_action='cancel' then
    select * into time_request from public.schedule_time_off_requests where id=target_request_id and workspace_id=target_workspace_id and employee_id=employee.id for update;
    if time_request.id is null then raise exception 'time off request not found' using errcode='P0002'; end if;
    if time_request.revision<>target_expected_revision or time_request.status<>'pending' then raise exception 'stale time off request' using errcode = 'PT409', hint = 'time_off.changed'; end if;
    update public.schedule_time_off_requests set status='revoked',revision=revision+1,updated_at=now() where id=time_request.id returning * into time_request;
    insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note) values(target_workspace_id,time_request.id,'revoked',actor_user_id,'Cancelled by employee');
    perform app_private.time_off_tell(target_workspace_id, time_request.id, 'withdrawn', actor_user_id);
    return jsonb_build_object('status','cancelled','request_id',time_request.id,'revision',time_request.revision);
  end if;
  raise exception 'unsupported employee request action' using errcode='22023';
end; $$;


ALTER FUNCTION "public"."employee_request_action_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_request_id" "uuid", "target_kind" "text", "target_action" "text", "target_expected_revision" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."empty_weekly_preference"("mode" "text") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
 select jsonb_build_object('input_mode',mode,'days',jsonb_agg(jsonb_build_object('day',day,'all_day',false,'shift_type_ids','[]'::jsonb,'ranges','[]'::jsonb) order by day))
 from generate_series(0,6) day;
$$;

CREATE OR REPLACE FUNCTION "public"."revoke_time_off_service"("actor" "uuid", "w" "uuid", "rid" "uuid", "expected_revision" integer, "reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  r public.schedule_time_off_requests%rowtype;
  said text := btrim(coalesce(reason, ''));
  taken tstzmultirange;
  ahead tstzmultirange;
  cut_id uuid;
  sid uuid;
  seg record;
  other record;
begin
  perform public.availability_lock_workspace(w);
  -- Who may not revoke here at all hears so before the request is looked up (BL-411).
  if app_private.time_off_reason(actor, w, 'time_off.revoke') is distinct from 'out_of_scope' then
    perform app_private.time_off_authorize(actor, w, 'time_off.revoke');
  end if;
  select * into r from public.schedule_time_off_requests where id = rid and workspace_id = w and request_type = 'time_off' for update;
  if r.id is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.revoke';
  end if;
  perform app_private.time_off_authorize(actor, w, 'time_off.revoke', r.employee_id);
  if said = '' or char_length(said) > 1000 then raise exception 'Say why the time off is revoked (at most 1000 characters)' using errcode = '22023'; end if;
  if expected_revision is null or r.revision <> expected_revision or r.status <> 'approved' then
    raise exception 'This time off changed; refresh before revoking it' using errcode = 'PT409', hint = 'time_off.changed'; end if;

  select coalesce(range_agg(s.span), '{}') into taken
  from (select unnest(public.time_off_effective_ranges(x.id)) * tstzrange(null, now(), '[)') span
        from public.schedule_time_off_segments x where x.request_id = rid and x.workspace_id = w) s
  where not isempty(s.span);
  select coalesce(range_agg(s.span), '{}') into ahead
  from (select unnest(public.time_off_effective_ranges(x.id)) * tstzrange(now(), null, '[)') span
        from public.schedule_time_off_segments x where x.request_id = rid and x.workspace_id = w) s
  where not isempty(s.span);
  if isempty(ahead) then
    raise exception 'Nothing of this time off is left to revoke' using errcode = '22023';
  end if;

  if not isempty(taken) then
    -- Already under way: the hours from now on are given back by a
    -- cancellation the revoke settles itself; the time off stays approved.
    cut_id := gen_random_uuid();
    insert into public.schedule_time_off_requests(id, workspace_id, employee_id, request_type, reason, created_by)
    values (cut_id, w, r.employee_id, 'time_off_cancellation', said, actor);
    insert into public.time_off_cancellation_links values (cut_id, w, r.id, r.revision);
    for seg in select s.id, s.time_timezone, p.piece from public.schedule_time_off_segments s
      cross join lateral unnest(public.time_off_effective_ranges(s.id) * tstzmultirange(tstzrange(now(), null, '[)'))) p(piece)
      where s.request_id = rid and s.workspace_id = w order by lower(p.piece) loop
      sid := gen_random_uuid();
      insert into public.schedule_time_off_segments(id, workspace_id, request_id, segment_date, start_time, end_time, time_timezone, starts_at, ends_at, ends_next_day)
      values (sid, w, cut_id, (lower(seg.piece) at time zone seg.time_timezone)::date, (lower(seg.piece) at time zone seg.time_timezone)::time,
        (upper(seg.piece) at time zone seg.time_timezone)::time, seg.time_timezone, lower(seg.piece), upper(seg.piece),
        (upper(seg.piece) at time zone seg.time_timezone)::date > (lower(seg.piece) at time zone seg.time_timezone)::date);
      insert into public.time_off_cancellation_periods values (sid, w, cut_id, seg.id, r.id);
    end loop;
    insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
    values (w, cut_id, 'submitted', actor, said, jsonb_build_object('parent_request_id', r.id, 'parent_revision', r.revision, 'shortened', true, 'source', 'revoke'));
    update public.schedule_time_off_segments set status = 'approved' where request_id = cut_id and workspace_id = w;
    update public.schedule_time_off_requests set status = 'approved', revision = revision + 1, updated_at = now() where id = cut_id;
    insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
    values (w, cut_id, 'approved', actor, said, jsonb_build_object('shortened', true, 'source', 'revoke'));
  end if;

  update public.schedule_time_off_requests
  set status = case when isempty(taken) then 'revoked'::public.time_off_request_status else status end,
      revision = revision + 1, updated_at = now()
  where id = rid returning * into r;
  insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
  values (w, rid, 'revoked', actor, said,
    jsonb_build_object('revision', r.revision) || case when isempty(taken) then '{}'::jsonb
      else jsonb_build_object('taken_until', now(), 'cancellation_request_id', cut_id) end);

  for other in select cr.id from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id = cl.request_id
    where cl.parent_request_id = rid and cl.workspace_id = w and cr.status = 'pending' for update of cr loop
    update public.schedule_time_off_requests set status = 'revoked', revision = revision + 1, updated_at = now() where id = other.id;
    insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
    values (w, other.id, 'revoked', actor, 'Closed because the time off was revoked.', jsonb_build_object('parent_request_id', rid));
    perform app_private.time_off_tell(w, other.id, 'closed', actor);
  end loop;
  perform app_private.time_off_tell(w, rid, 'revoked', actor, said);
  return jsonb_build_object('status', r.status, 'request_id', r.id, 'revision', r.revision);
end;
$$;

CREATE OR REPLACE FUNCTION "app_private"."shorten_time_off"("actor" "uuid", "w" "uuid", "emp" "uuid", "cut" "tstzmultirange", "note" "text", "source" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare parent public.schedule_time_off_requests%rowtype; seg record; rid uuid; sid uuid; zone_name text;
 given tstzmultirange; remaining tstzmultirange; next_status public.time_off_request_status; said text; result jsonb:='[]';
begin
 perform public.availability_lock_workspace(w);
 if cut is null or isempty(cut) then return result; end if;
 if exists(select 1 from unnest(cut) x where lower(x)<=now() or not isfinite(lower(x)) or not isfinite(upper(x))) then
  raise exception 'Only future approved hours can be given back' using errcode='22023'; end if;
 said:=left(btrim(coalesce(note,'')),1000);
 for parent in select r.* from public.schedule_time_off_requests r
  where r.workspace_id=w and r.employee_id=emp and r.request_type='time_off' and r.status = 'approved'
   and exists(select 1 from public.schedule_time_off_segments s where s.request_id=r.id and s.workspace_id=w and public.time_off_effective_ranges(s.id) && cut)
  order by r.created_at, r.id for update loop
  rid:=gen_random_uuid(); given:='{}';
  insert into public.schedule_time_off_requests(id,workspace_id,employee_id,request_type,reason,created_by)
   values(rid,w,emp,'time_off_cancellation',said,actor);
  insert into public.time_off_cancellation_links values(rid,w,parent.id,parent.revision);
  for seg in select s.id,s.time_timezone,p.piece from public.schedule_time_off_segments s
   cross join lateral unnest(public.time_off_effective_ranges(s.id)*cut) p(piece)
   where s.request_id=parent.id and s.workspace_id=w order by lower(p.piece) loop
   zone_name:=seg.time_timezone; sid:=gen_random_uuid();
   insert into public.schedule_time_off_segments(id,workspace_id,request_id,segment_date,start_time,end_time,time_timezone,starts_at,ends_at,ends_next_day)
    values(sid,w,rid,(lower(seg.piece) at time zone zone_name)::date,(lower(seg.piece) at time zone zone_name)::time,(upper(seg.piece) at time zone zone_name)::time,
     zone_name,lower(seg.piece),upper(seg.piece),(upper(seg.piece) at time zone zone_name)::date>(lower(seg.piece) at time zone zone_name)::date);
   insert into public.time_off_cancellation_periods values(sid,w,rid,seg.id,parent.id);
   given:=given+tstzmultirange(seg.piece);
  end loop;
  insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata)
   values(w,rid,'submitted',actor,said,jsonb_build_object('parent_request_id',parent.id,'parent_revision',parent.revision,'shortened',true,'source',source));
  -- The hours given back are settled at once (a request with no location has no zone for the old decision path).
  update public.schedule_time_off_segments set status='approved' where request_id=rid and workspace_id=w;
  update public.schedule_time_off_requests set status='approved',revision=revision+1,updated_at=now() where id=rid;
  insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata)
   values(w,rid,'approved',actor,said,jsonb_build_object('revision',2,'shortened',true,'source',source));
  select coalesce(range_agg(p.span),'{}') into remaining from public.schedule_time_off_segments s
   cross join lateral unnest(public.time_off_effective_ranges(s.id)) p(span) where s.request_id=parent.id and s.workspace_id=w;
  next_status:=case when isempty(remaining) then 'revoked'::public.time_off_request_status else parent.status end;
  update public.schedule_time_off_requests set status=next_status,revision=revision+1,updated_at=now() where id=parent.id returning * into parent;
  -- Nothing of the time off is left: a cancellation waiting on it closes (as a revoke does).
  if next_status = 'revoked' then
   update public.schedule_time_off_requests cr set status='revoked',revision=cr.revision+1,updated_at=now()
   from public.time_off_cancellation_links cl
   where cl.request_id=cr.id and cl.parent_request_id=parent.id and cl.workspace_id=w and cr.status='pending' and cr.id<>rid;
   insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata)
   select w,cr.id,'revoked',actor,'Closed because the time off was given back in full.',jsonb_build_object('parent_request_id',parent.id)
   from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id=cl.request_id
   where cl.parent_request_id=parent.id and cl.workspace_id=w and cr.id<>rid and cr.status='revoked'
    and not exists(select 1 from public.schedule_time_off_events e where e.request_id=cr.id and e.action='revoked');
   perform app_private.time_off_tell(w,cl.request_id,'closed',actor) from public.time_off_cancellation_links cl
    where cl.parent_request_id=parent.id and cl.workspace_id=w and cl.request_id<>rid;
  end if;
  insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata)
   values(w,parent.id,next_status::text,actor,said,jsonb_build_object('revision',parent.revision,'cancellation_request_id',rid,
    'cancelled_intervals',public.availability_ranges_json(given),'shortened',true,'source',source));
   perform app_private.time_off_tell_shortened(w,parent.id,rid,actor,given,zone_name);
  result:=result||jsonb_build_array(jsonb_build_object('request_id',parent.id,'revision',parent.revision,'status',parent.status,
   'cancellation_request_id',rid,'intervals',public.availability_ranges_json(given)));
 end loop;
 return result;
end;
$$;

CREATE OR REPLACE FUNCTION "app_private"."time_off_sweep"("pass_limit" integer DEFAULT 500) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  r record;
  st jsonb;
  v jsonb;
  done integer := 0;
begin
  -- ponytail: every workspace lock is held to the end of the pass (BL-506), and
  -- the second loop always takes the earliest deadlines of every workspace, so
  -- request 501 waits behind 500 with nothing due. Fix both together: commit per
  -- request in a procedure and take loop two in a fair turn.
  -- Not decided in time: the system declines it.
  for r in select q.id, q.workspace_id from public.schedule_time_off_requests q
    where q.status = 'pending' and q.decide_by is not null and q.decide_by <= now()
    order by q.decide_by, q.id limit pass_limit loop
    -- Each request on its own: one that fails is rolled back alone and named,
    -- the rest of the pass and every other workspace go on.
    begin
      perform public.availability_lock_workspace(r.workspace_id);
      -- Read again under the lock: a withdrawal or a last vote may have closed it.
      if exists (select 1 from public.schedule_time_off_requests q where q.id = r.id and q.status = 'pending' and q.decide_by <= now()) then
        perform app_private.time_off_finalize(r.workspace_id, r.id, 'deny', null, 'Not decided in time', false, true);
        done := done + 1;
      end if;
    exception when others then
      insert into app_private.time_off_sweep_failures (request_id, workspace_id, sqlstate, message)
      values (r.id, r.workspace_id, sqlstate, sqlerrm)
      on conflict (request_id) do update set last_failed_at = now(), attempts = app_private.time_off_sweep_failures.attempts + 1,
        sqlstate = excluded.sqlstate, message = excluded.message;
      raise warning 'time-off-deadlines: request % of workspace % failed: % %', r.id, r.workspace_id, sqlstate, sqlerrm;
    end;
  end loop;

  for r in select q.* from public.schedule_time_off_requests q
    where q.status = 'pending' and q.decide_by > now()
    order by q.decide_by, q.id limit pass_limit loop
    begin
    perform public.availability_lock_workspace(r.workspace_id);
    -- Read again under the lock: a withdrawal or a last vote may have closed it.
    select q.* into r from public.schedule_time_off_requests q where q.id = r.id;
    if r.status <> 'pending' or r.decide_by <= now() then
      continue;
    end if;
    st := app_private.time_off_state(r.workspace_id, r.id);

    -- A vote on shifts that changed is let go; its manager looks again.
    for v in select x from jsonb_array_elements(st -> 'votes') x where (x ->> 'stale')::boolean loop
      delete from public.time_off_votes where request_id = r.id and voter_user_id = (v ->> 'voter')::uuid;
      done := done + 1;
    end loop;

    -- Every location still deciding has approved (another dropped out, KARARLAR
    -- "İzin" 2026-09-30): the request is settled, by the system.
    if (st ->> 'remaining')::integer = 0 and not (st ->> 'fallback')::boolean then
      perform app_private.time_off_finalize(r.workspace_id, r.id, 'approve', null, 'All deciding locations approved', false);
      done := done + 1;
      continue;
    end if;
    -- Twelve hours before the deadline, once (time_off_remind).
    done := done + app_private.time_off_remind(r.workspace_id, r.id);
    exception when others then
      insert into app_private.time_off_sweep_failures (request_id, workspace_id, sqlstate, message)
      values (r.id, r.workspace_id, sqlstate, sqlerrm)
      on conflict (request_id) do update set last_failed_at = now(), attempts = app_private.time_off_sweep_failures.attempts + 1,
        sqlstate = excluded.sqlstate, message = excluded.message;
      raise warning 'time-off-deadlines: request % of workspace % failed: % %', r.id, r.workspace_id, sqlstate, sqlerrm;
    end;
  end loop;
  return done;
end;
$$;
