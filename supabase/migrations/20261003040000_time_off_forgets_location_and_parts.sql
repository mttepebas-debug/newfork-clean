-- FB-6.3.7: time off belongs to the person and its locations vote on it
-- (20261003031000). What served the old path goes: the location on the
-- request, the "viewed" mark, partial decisions and their pieces, the old
-- submit, decide and preview services with the owner's shortcut through them,
-- the period version (every period carries its own time-zone snapshot), and
-- the owner-only "shifts opened" notice (schedule.time_off.shifts_opened
-- tells every location's managers). There is no live data: every time-off row
-- goes, none of them was made by today's rules.
-- BL-496: departments and jobs carry no position; they go by name.

-- TRUNCATE skips the row triggers that keep periods and history unchangeable.
truncate public.time_off_decision_pieces, public.time_off_cancellation_periods, public.time_off_cancellation_links,
  public.time_off_assignment_releases, public.time_off_votes, public.time_off_required_locations,
  public.schedule_time_off_events, public.schedule_time_off_segments, public.schedule_time_off_requests,
  public.time_off_commands;

drop function public.decide_time_off_with_assignments_service(uuid, uuid, uuid, integer, text, text, jsonb, uuid, text, jsonb);
drop function public.preview_time_off_assignment_decision_service(uuid, uuid, uuid, integer, text, jsonb);
drop function public.resolve_schedule_time_off_request_service(uuid, uuid, uuid, integer, text, text, jsonb);
drop function public.resolve_time_off_period_decision_service(uuid, uuid, uuid, integer, text, text, jsonb, uuid);
drop function public.apply_time_off_period_decision(uuid, uuid, uuid, integer, text, text, jsonb);
drop function public.apply_time_off_cancellation_decision(uuid, uuid, uuid, integer, text, text, jsonb);
drop function public.submit_employee_time_off_service(uuid, uuid, uuid, text, date[]);
drop function public.submit_employee_time_off_periods_service(uuid, uuid, uuid, text, jsonb, uuid, text);
drop function public.mark_schedule_time_off_viewed_service(uuid, uuid, uuid);
drop function public.submit_employee_time_off_cancellation_service(uuid, uuid, uuid, integer, text, jsonb, uuid);
drop function app_private.authorize_time_off_decision(uuid, uuid, uuid, uuid, text);
drop function app_private.authorize_time_off_request(uuid, uuid, uuid, text, boolean);
drop function public.time_off_proposed_approved_ranges(uuid, uuid, text, jsonb);
drop function public.notify_owner_time_off_open_shifts(uuid, uuid, uuid, integer);
drop function app_private.record_owner_time_off(uuid, uuid, uuid);
drop table public.time_off_decision_pieces;
drop function public.guard_time_off_decision_piece();

delete from public.notification_recipient_decisions where (event_id, workspace_id) in
  (select id, workspace_id from public.notification_events where type_key = 'schedule.owner_time_off.shifts_opened');
delete from public.notification_recipients where (event_id, workspace_id) in
  (select id, workspace_id from public.notification_events where type_key = 'schedule.owner_time_off.shifts_opened');
delete from public.notification_events where type_key = 'schedule.owner_time_off.shifts_opened';
delete from public.notification_outbox where type_key = 'schedule.owner_time_off.shifts_opened';
delete from public.account_notification_items where type_key = 'schedule.owner_time_off.shifts_opened';
delete from public.notification_org_policies where type_key = 'schedule.owner_time_off.shifts_opened';
delete from public.notification_producer_registry where type_key = 'schedule.owner_time_off.shifts_opened';
delete from public.notification_template_versions where type_key = 'schedule.owner_time_off.shifts_opened';
delete from public.notification_catalog where type_key = 'schedule.owner_time_off.shifts_opened';

alter table public.schedule_time_off_requests drop column location_id, drop column viewed_at, drop column period_version;
alter table public.schedule_time_off_segments
  drop constraint time_off_period_snapshot_complete,
  alter column time_timezone set not null, alter column starts_at set not null, alter column ends_at set not null,
  add constraint time_off_period_order check (starts_at < ends_at);
alter table public.schedule_time_off_events
  drop constraint schedule_time_off_events_action_check,
  add constraint schedule_time_off_events_action_check check (action in ('submitted', 'approved', 'denied', 'revoked', 'expired'));

-- No partly approved request: the status type is built again without it.
drop index public.schedule_time_off_requests_open_deadline_idx;
alter table public.schedule_time_off_requests alter column status drop default;
alter type public.time_off_request_status rename to time_off_request_status_retired;
create type public.time_off_request_status as enum ('pending', 'approved', 'denied', 'revoked');
alter table public.schedule_time_off_requests
  alter column status type public.time_off_request_status using status::text::public.time_off_request_status,
  alter column status set default 'pending';
drop type public.time_off_request_status_retired;
create index schedule_time_off_requests_open_deadline_idx on public.schedule_time_off_requests (decide_by)
  where status = 'pending' and decide_by is not null;

alter table public.departments drop constraint departments_sort_order_unused, drop column sort_order;
alter table public.jobs drop constraint jobs_sort_order_unused, drop column sort_order;

-- The readers below lose the location, the partial decision and the legacy
-- time zone; the rest of each body is unchanged.
CREATE OR REPLACE FUNCTION public.time_off_period_span(segment_id uuid)
 RETURNS tstzrange
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select tstzrange(s.starts_at, s.ends_at, '[)') from public.schedule_time_off_segments s where s.id = segment_id;
$function$
;

CREATE OR REPLACE FUNCTION public.time_off_decided_ranges(segment_id uuid)
 RETURNS tstzmultirange
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case when r.status='pending' then tstzmultirange(public.time_off_period_span(s.id))
  when r.status <> 'approved' or s.status<>'approved' then '{}'::tstzmultirange
  else tstzmultirange(public.time_off_period_span(s.id)) end
 from public.schedule_time_off_segments s join public.schedule_time_off_requests r on r.id=s.request_id and r.workspace_id=s.workspace_id where s.id=segment_id;
$function$
;

CREATE OR REPLACE FUNCTION public.time_off_cancelled_ranges(segment_id uuid)
 RETURNS tstzmultirange
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(range_agg(span),'{}') from public.time_off_cancellation_periods cp
 join public.schedule_time_off_requests r on r.id=cp.request_id and r.workspace_id=cp.workspace_id
 cross join lateral unnest(public.time_off_decided_ranges(cp.segment_id)) pieces(span)
 where cp.parent_segment_id=time_off_cancelled_ranges.segment_id and r.status = 'approved';
$function$
;

CREATE OR REPLACE FUNCTION public.time_off_request_periods(request_id uuid, w uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'segment_date', s.segment_date, 'start_time', s.start_time, 'end_time', s.end_time, 'status', s.status,
  'effective_intervals', case when r.status = 'approved' then public.availability_ranges_json(public.time_off_effective_ranges(s.id)) else '[]'::jsonb end,
  'cancelled_intervals', public.availability_ranges_json(public.time_off_cancelled_ranges(s.id)),
  'ends_next_day', s.ends_next_day, 'time_timezone', s.time_timezone, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
  'fold_choices', s.fold_choices)
  order by s.segment_date, s.start_time, s.id), '[]')
 from public.schedule_time_off_segments s
 join public.schedule_time_off_requests r on r.id = s.request_id and r.workspace_id = s.workspace_id
 where s.request_id = time_off_request_periods.request_id and s.workspace_id = w;
$function$
;

CREATE OR REPLACE FUNCTION public.time_off_cancellation_context(w uuid, rid uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('parent_request_id',(select parent_request_id from public.time_off_cancellation_links where request_id=rid),
  'parent_revision',(select parent_revision from public.time_off_cancellation_links where request_id=rid),
  'pending_request_id',(select cl.request_id from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id=cl.request_id where cl.parent_request_id=rid and cr.status='pending' limit 1),
  'has_completed_cancellation',exists(select 1 from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id=cl.request_id where cl.parent_request_id=rid and cr.status = 'approved'),
  'can_request',r.request_type='time_off' and r.status = 'approved' and
   not exists(select 1 from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id=cl.request_id where cl.parent_request_id=rid and cr.status='pending') and
   exists(select 1 from public.schedule_time_off_segments s cross join lateral unnest(public.time_off_effective_ranges(s.id)) p(span) where s.request_id=rid and upper(span)>now()))
 from public.schedule_time_off_requests r where r.id=rid and r.workspace_id=w;
$function$
;

CREATE OR REPLACE FUNCTION app_private.time_off_live_locations(w uuid, rid uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(array_agg(listed.place order by listed.place), '{}')
  from (select x.location_id place from public.time_off_required_locations x where x.request_id = rid and x.workspace_id = w) listed
  join public.schedule_time_off_requests r on r.id = rid and r.workspace_id = w
  join public.locations l on l.id = listed.place and l.workspace_id = w
  where app_private.location_is_live(l)
    and exists (select 1 from public.employee_location_assignments a
                where a.workspace_id = w and a.employee_id = r.employee_id and a.location_id = listed.place and a.ended_at is null)
    and app_private.time_off_location_staffed(w, r.employee_id, listed.place);
$function$
;

CREATE OR REPLACE FUNCTION app_private.time_off_display_status(w uuid, rid uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when r.status = 'pending' then 'Pending'
    when r.status = 'denied' and exists (select 1 from public.schedule_time_off_events e where e.request_id = r.id and e.action = 'expired') then 'Not decided in time'
    when r.status = 'denied' then 'Denied'
    when r.status = 'revoked' and last_revoke.actor_user_id is not distinct from person.user_id then 'Withdrawn'
    when r.status = 'revoked' then 'Revoked'
    when last_revoke.metadata ? 'taken_until' then 'Revoked · taken until ' || to_char(
      (last_revoke.metadata ->> 'taken_until')::timestamptz at time zone coalesce(zone.name, 'UTC'),
      case when setting.time_format = '24h' then 'Mon FMDD, HH24:MI' else 'Mon FMDD, FMHH12:MI AM' end)
    else 'Approved' end
  from public.schedule_time_off_requests r
  join public.employee_profiles person on person.id = r.employee_id and person.workspace_id = r.workspace_id
  left join public.workspace_scheduling_settings setting on setting.workspace_id = r.workspace_id
  left join lateral (select s.time_timezone name from public.schedule_time_off_segments s
                     where s.request_id = r.id order by s.starts_at limit 1) zone on true
  left join lateral (select e.actor_user_id, e.metadata from public.schedule_time_off_events e
                     where e.request_id = r.id and e.action = 'revoked' order by e.created_at desc, e.id desc limit 1) last_revoke on true
  where r.id = rid and r.workspace_id = w;
$function$
;

CREATE OR REPLACE FUNCTION app_private.time_off_finalize(w uuid, rid uuid, verdict text, actor uuid, note text, alone boolean, expired boolean DEFAULT false)
 RETURNS schedule_time_off_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    raise exception 'This request is already closed' using errcode = '40001';
  end if;
  if verdict = 'approve' and r.request_type = 'time_off_cancellation' then
    select p.* into parent from public.time_off_cancellation_links cl
    join public.schedule_time_off_requests p on p.id = cl.parent_request_id and p.workspace_id = cl.workspace_id
    where cl.request_id = rid and cl.workspace_id = w for update of p;
    if parent.status <> 'approved' then
      raise exception 'The time off this cancellation is about has changed; refresh' using errcode = '40001';
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
$function$
;

CREATE OR REPLACE FUNCTION public.guard_time_off_request_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if (new.id, new.workspace_id, new.employee_id, new.request_type, new.reason, new.created_by)
  is distinct from (old.id, old.workspace_id, old.employee_id, old.request_type, old.reason, old.created_by) then
  raise exception 'The original time-off request is immutable' using errcode = '55000'; end if;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_time_off_requested_period()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare parent public.schedule_time_off_requests%rowtype; resolved jsonb;
begin
 select * into parent from public.schedule_time_off_requests where id = coalesce(new.request_id, old.request_id);
 if tg_op in ('UPDATE', 'DELETE') then
  if tg_op = 'DELETE' or (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
   raise exception 'Requested time-off periods are immutable; submit a new request to change the hours' using errcode = '55000'; end if;
 end if;
 if tg_op = 'INSERT' then
  if parent.status <> 'pending' then raise exception 'Requested periods can only be added to a pending request' using errcode = '55000'; end if;
  if parent.request_type = 'time_off_cancellation' then
   if not exists (select 1 from public.time_off_cancellation_links cl
    join public.schedule_time_off_segments original on original.request_id = cl.parent_request_id and original.workspace_id = cl.workspace_id
    where cl.request_id = parent.id and cl.workspace_id = parent.workspace_id and original.time_timezone = new.time_timezone
     and public.time_off_effective_ranges(original.id) @> tstzrange(new.starts_at, new.ends_at, '[)'))
    or (new.segment_date, new.start_time, new.end_time, new.ends_next_day) is distinct from
     ((new.starts_at at time zone new.time_timezone)::date, (new.starts_at at time zone new.time_timezone)::time,
      (new.ends_at at time zone new.time_timezone)::time, (new.ends_at at time zone new.time_timezone)::date > (new.starts_at at time zone new.time_timezone)::date)
    then raise exception 'Cancellation hours must match approved leave in its original time zone' using errcode = '22023'; end if;
   return new;
  end if;
  resolved := public.time_off_resolve_period(jsonb_build_object('segment_date', new.segment_date, 'start_time', new.start_time, 'end_time', new.end_time,
   'ends_next_day', new.ends_next_day) || new.fold_choices, new.time_timezone);
  if (new.time_timezone, new.starts_at, new.ends_at) is distinct from
   (resolved ->> 'time_timezone', (resolved ->> 'starts_at')::timestamptz, (resolved ->> 'ends_at')::timestamptz) then
   raise exception 'Requested time-off clock and time-zone snapshot must agree' using errcode = '22023'; end if;
 end if;
 return case when tg_op = 'DELETE' then old else new end;
end $function$
;

CREATE OR REPLACE FUNCTION public.request_time_off_cancellation_service(actor uuid, w uuid, parent_id uuid, expected_revision integer, periods jsonb, reason text, operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    if prior.input <> command then raise exception 'This request key was used for a different cancellation' using errcode = '40001'; end if;
    return prior.result;
  end if;
  if expected_revision is null or parent.revision <> expected_revision or parent.request_type <> 'time_off' or parent.status <> 'approved' then
    raise exception 'stale approved leave; refresh before requesting cancellation' using errcode = '40001'; end if;
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
  -- Sent straight to an admin and the owner (nobody can vote somewhere): that was their one notice.
  update public.schedule_time_off_requests set fallback_notified_at = now()
  where id = rid and exists (select 1 from (select app_private.time_off_state(w, rid) s) x
    where (x.s ->> 'fallback')::boolean or (x.s ->> 'unattended')::integer > 0);
  if public.time_off_is_the_owners_own(actor, w, rid) then
    perform app_private.time_off_finalize(w, rid, 'approve', actor, '', true);
  end if;
  select jsonb_build_object('status', r.status, 'request_id', r.id, 'revision', r.revision, 'decide_by', r.decide_by) into result
  from public.schedule_time_off_requests r where r.id = rid;
  insert into public.time_off_commands(workspace_id, actor_user_id, operation_id, input, result)
  values (w, actor, request_time_off_cancellation_service.operation_id, command, result);
  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.revoke_time_off_service(actor uuid, w uuid, rid uuid, expected_revision integer, reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  select * into r from public.schedule_time_off_requests where id = rid and workspace_id = w and request_type = 'time_off' for update;
  if r.id is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.revoke';
  end if;
  perform app_private.time_off_authorize(actor, w, 'time_off.revoke', r.employee_id);
  if said = '' or char_length(said) > 1000 then raise exception 'Say why the time off is revoked (at most 1000 characters)' using errcode = '22023'; end if;
  if expected_revision is null or r.revision <> expected_revision or r.status <> 'approved' then
    raise exception 'This time off changed; refresh before revoking it' using errcode = '40001'; end if;

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
  end loop;
  return jsonb_build_object('status', r.status, 'request_id', r.id, 'revision', r.revision);
end;
$function$
;

CREATE OR REPLACE FUNCTION app_private.shorten_time_off(actor uuid, w uuid, emp uuid, cut tstzmultirange, note text, source jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  end if;
  insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata)
   values(w,parent.id,next_status::text,actor,said,jsonb_build_object('revision',parent.revision,'cancellation_request_id',rid,
    'cancelled_intervals',public.availability_ranges_json(given),'shortened',true,'source',source));
  perform public.notify_time_off_shortened(actor,w,parent.id,given,zone_name,source);
  result:=result||jsonb_build_array(jsonb_build_object('request_id',parent.id,'revision',parent.revision,'status',parent.status,
   'cancellation_request_id',rid,'intervals',public.availability_ranges_json(given)));
 end loop;
 return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.shorten_time_off_service(actor uuid, w uuid, rid uuid, expected_revision integer, periods jsonb, note text, operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare parent public.schedule_time_off_requests%rowtype; prior public.time_off_commands%rowtype; command jsonb; result jsonb;
 p jsonb; a timestamptz; b timestamptz; span tstzrange; cut tstzmultirange:='{}';
begin
 perform public.availability_lock_workspace(w);
 select * into parent from public.schedule_time_off_requests where id=rid and workspace_id=w and request_type='time_off' for update;
 if parent.id is null then raise exception 'Not allowed' using errcode='42501', hint='authz.out_of_scope', detail='time_off.revoke'; end if;
 perform app_private.time_off_authorize(actor,w,'time_off.revoke',parent.employee_id);
 if operation_id is null then raise exception 'A request key is required' using errcode='22023'; end if;
 command:=jsonb_build_object('kind','shorten','request_id',rid,'expected_revision',expected_revision,'periods',periods,'note',btrim(coalesce(note,'')));
 select * into prior from public.time_off_commands c where c.workspace_id=w and c.actor_user_id=actor and c.operation_id=shorten_time_off_service.operation_id;
 if found then
  if prior.input<>command then raise exception 'This request key was used for a different change' using errcode='40001'; end if;
  return prior.result;
 end if;
 if expected_revision is null or parent.revision<>expected_revision or parent.status <> 'approved' then
  raise exception 'stale approved leave; refresh before shortening it' using errcode='40001'; end if;
 if jsonb_typeof(periods) is distinct from 'array' or jsonb_array_length(periods) not between 1 and 124 then
  raise exception 'Choose up to 124 periods of approved hours' using errcode='22023'; end if;
 if char_length(btrim(coalesce(note,'')))>1000 then raise exception 'The note can be at most 1000 characters' using errcode='22023'; end if;
 for p in select value from jsonb_array_elements(periods) loop
  if coalesce(p->>'starts_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or coalesce(p->>'ends_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
   raise exception 'Each period needs exact start and end instants' using errcode='22023'; end if;
  a:=(p->>'starts_at')::timestamptz; b:=(p->>'ends_at')::timestamptz;
  if not isfinite(a) or not isfinite(b) or a>=b or a<=now() then raise exception 'Only future approved hours can be given back' using errcode='22023'; end if;
  span:=tstzrange(a,b,'[)');
  if cut && span or not exists(select 1 from public.schedule_time_off_segments s where s.id=(p->>'segment_id')::uuid and s.workspace_id=w
   and s.request_id=parent.id and public.time_off_effective_ranges(s.id) @> span) then
   raise exception 'Choose approved hours of this time off, without overlap' using errcode='22023'; end if;
  cut:=cut+tstzmultirange(span);
 end loop;
 perform app_private.shorten_time_off(actor,w,parent.employee_id,cut,coalesce(nullif(btrim(coalesce(note,'')),''),'Shortened by a manager.'),
  jsonb_build_object('source','manager','request_id',rid));
 select jsonb_build_object('status',r.status,'request_id',r.id,'revision',r.revision) into result
  from public.schedule_time_off_requests r where r.id=rid;
 insert into public.time_off_commands(workspace_id,actor_user_id,operation_id,input,result) values(w,actor,operation_id,command,result);
 return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_time_off_shortened(actor uuid, w uuid, parent_id uuid, cut tstzmultirange, zone_name text, source jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare fmt text; employee_user uuid; employee_name text; lines text; deciders uuid[];
 by_manager boolean:=coalesce(source->>'source','')='manager';
begin
 fmt := case when (select s.time_format from public.workspace_scheduling_settings s where s.workspace_id = w) = '24h'
  then 'HH24:MI' else 'FMHH12:MI AM' end;
 select e.user_id, coalesce(nullif(e.preferred_name, ''), e.first_name) into employee_user, employee_name
  from public.schedule_time_off_requests r join public.employee_profiles e on e.id = r.employee_id and e.workspace_id = r.workspace_id
  where r.id = parent_id and r.workspace_id = w;
 -- "Wed, Oct 1, 10:00 AM–2:00 PM", in the leave's own time zone.
 select string_agg(to_char(lower(p) at time zone zone_name, 'Dy, Mon FMDD') || ', ' || to_char(lower(p) at time zone zone_name, fmt)
   || '–' || to_char(upper(p) at time zone zone_name, fmt), '; ' order by lower(p))
  into lines from unnest(cut) p;
 -- Whoever approved the leave (its decisions), but not the one shortening it
 -- and not the employee: the owner's own leave is approved by themselves.
 select coalesce(array_agg(distinct ev.actor_user_id order by ev.actor_user_id), '{}') into deciders
  from public.schedule_time_off_events ev
  join public.workspace_memberships m on m.workspace_id = w and m.user_id = ev.actor_user_id and m.status = 'active'
  where ev.workspace_id = w and ev.request_id = parent_id and ev.action = 'approved'
   and ev.metadata ? 'segments' and ev.actor_user_id <> actor and ev.actor_user_id is distinct from employee_user;
 if cardinality(deciders) > 0 then
  perform public.enqueue_notification_outbox_service(w, gen_random_uuid(), 'requests.time_off.shortened', 1, actor,
   'schedule_time_off_requests', parent_id::text,
   jsonb_build_object('request_id', parent_id, 'recipient_user_ids', to_jsonb(deciders),
    'audience_contract', 'time_off_deciders', 'category', 'requests',
    'title', left(coalesce(employee_name, 'An employee') || '''s time off was shortened', 160),
    'body', left(lines || case when by_manager then ' is back on the schedule.' else ' — they took a shift in these hours.' end, 500),
    'safe_preview', 'Approved time off was shortened.',
    'action_url', '/app/schedule/requests?tab=time-off&request=' || parent_id::text,
    'group_key', 'schedule_time_off_requests:' || parent_id::text),
   now());
 end if;
 -- The employee agreed in Shift Hub themselves; a manager's shortening is news to them.
 if by_manager and employee_user is not null and employee_user <> actor
  and exists (select 1 from public.workspace_memberships m where m.workspace_id = w and m.user_id = employee_user and m.status = 'active') then
  perform public.enqueue_notification_outbox_service(w, gen_random_uuid(), 'requests.time_off.shortened', 1, actor,
   'schedule_time_off_requests', parent_id::text,
   jsonb_build_object('request_id', parent_id, 'recipient_user_ids', jsonb_build_array(employee_user),
    'audience_contract', 'time_off_requester', 'category', 'requests',
    'title', 'Your time off was shortened',
    'body', left(lines || ' is no longer time off. Your manager can put you on the schedule then.', 500),
    'safe_preview', 'Approved time off was shortened.',
    'action_url', '/app/employee-hub/my-availability#request-' || parent_id::text,
    'group_key', 'schedule_time_off_requests:' || parent_id::text),
   now());
 end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_schedule_request_event_service()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.schedule_time_off_requests%rowtype;
  requester uuid;
  recipients uuid[];
  is_cancel boolean;
  title text;
  body text;
  preview text;
  url text;
begin
  select * into r from public.schedule_time_off_requests where id = new.request_id and workspace_id = new.workspace_id;
  if r.id is null then
    return new;
  end if;
  -- BL-182/BL-127: a shortening tells its own people (requests.time_off.shortened).
  if public.time_off_event_is_shortening(new.workspace_id, new.request_id, new.metadata) then
    return new;
  end if;
  is_cancel := r.request_type = 'time_off_cancellation';
  select e.user_id into requester from public.employee_profiles e where e.id = r.employee_id and e.workspace_id = r.workspace_id;

  if new.action = 'submitted' then
    -- The owner's own time off is recorded without review (BL-183).
    if public.time_off_is_the_owners_own(new.actor_user_id, new.workspace_id, new.request_id) then
      return new;
    end if;
    select coalesce(array_agg(u order by u), '{}') into recipients
    from unnest(app_private.time_off_deciders(new.workspace_id, r.id)) u where u is distinct from new.actor_user_id;
    perform public.enqueue_notification_outbox_service(new.workspace_id, new.id, 'requests.time_off.submitted', 1, new.actor_user_id,
      tg_table_name, new.request_id::text,
      jsonb_build_object('correlation_id', new.id, 'request_id', new.request_id, 'request_event_id', new.id, 'request_action', new.action,
        'recipient_user_ids', to_jsonb(recipients), 'audience_contract', 'schedule_request_reviewers', 'category', 'request',
        'title', case when is_cancel then 'Leave cancellation requested' else 'New time-off request' end,
        'body', case when is_cancel then 'Review the proposed cancellation. Approved leave stays in effect until accepted.'
          else 'A time-off request needs your decision.' end,
        'safe_preview', case when is_cancel then 'A leave cancellation needs review.' else 'A schedule request needs review.' end,
        'action_url', '/app/schedule/requests?tab=time-off&request=' || new.request_id::text,
        'group_key', tg_table_name || ':' || new.request_id::text),
      new.created_at);
    return new;
  end if;

  -- The person who asked, unless they did it themselves.
  title := case when is_cancel then 'Leave cancellation updated' else 'Time-off request updated' end;
  body := case
    when new.action = 'expired' then 'Your request was not decided in time and was declined.'
    when is_cancel and new.action = 'denied' then 'Your cancellation was declined. The approved leave remains in effect.'
    when is_cancel and new.action = 'revoked' then 'Your cancellation request was closed. Review the original leave for its current status.'
    when is_cancel then 'Your leave cancellation was reviewed. Shifts opened earlier stay open.'
    else 'Your time-off request status changed.' end;
  preview := case when is_cancel then 'A leave cancellation was updated.' else 'A schedule request was updated.' end;
  url := case when is_cancel then '/app/employee-hub/my-availability#request-' || new.request_id::text else '/app/employee-hub/my-availability' end;
  perform public.enqueue_notification_outbox_service(new.workspace_id, new.id, 'requests.time_off.status_changed', 1, new.actor_user_id,
    tg_table_name, new.request_id::text,
    jsonb_build_object('correlation_id', new.id, 'request_id', new.request_id, 'request_event_id', new.id, 'request_action', new.action,
      'recipient_user_ids', to_jsonb(case when requester is not null and requester is distinct from new.actor_user_id then array[requester] else '{}'::uuid[] end),
      'audience_contract', 'time_off_requester', 'category', 'request',
      'title', title, 'body', body, 'safe_preview', preview, 'action_url', url,
      'group_key', tg_table_name || ':' || new.request_id::text),
    new.created_at);

  -- The managers who could have decided it, but not who closed it; never for
  -- the owner's own time off.
  -- No actor (the system's own decline) is never the owner's own.
  if new.action in ('approved', 'denied', 'revoked', 'expired')
     and not coalesce(public.time_off_is_the_owners_own(new.actor_user_id, new.workspace_id, new.request_id), false) then
    select coalesce(array_agg(u order by u), '{}') into recipients
    from unnest(app_private.time_off_deciders(new.workspace_id, r.id, false)) u where u is distinct from new.actor_user_id;
    if cardinality(recipients) > 0 then
      perform public.enqueue_notification_outbox_service(new.workspace_id, gen_random_uuid(), 'requests.time_off.decided', 1, new.actor_user_id,
        tg_table_name, new.request_id::text,
        jsonb_build_object('correlation_id', new.id, 'request_id', new.request_id, 'request_event_id', new.id, 'request_action', new.action,
          'recipient_user_ids', to_jsonb(recipients), 'audience_contract', 'time_off_deciders', 'category', 'request',
          'title', case new.action when 'approved' then 'Time off approved' when 'denied' then 'Time off declined'
            when 'expired' then 'Time off not decided in time' else 'Time off withdrawn or revoked' end,
          'body', case when is_cancel then 'A leave cancellation you could decide was closed.' else 'A time-off request you could decide was closed.' end,
          'safe_preview', 'A time-off request was closed.',
          'action_url', '/app/schedule/requests?tab=time-off&request=' || new.request_id::text,
          'group_key', tg_table_name || ':' || new.request_id::text),
        new.created_at);
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reconcile_notification_platform_service()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  active_without_producer jsonb;
  active_without_template jsonb;
  missing_domain_events jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'type_key', catalog.type_key,
    'schema_version', catalog.schema_version,
    'reason', 'active_catalog_without_outbox_producer'
  ) order by catalog.type_key), '[]'::jsonb)
  into active_without_producer
  from public.notification_catalog catalog
  where catalog.lifecycle = 'active'
    and not exists (
      select 1 from public.notification_producer_registry registry
      where registry.type_key = catalog.type_key
        and registry.schema_version = catalog.schema_version
        and registry.integration_contract = case when catalog.notification_scope='account' then 'account_audit_v1' else 'outbox_v1' end
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'type_key', catalog.type_key,
    'schema_version', catalog.schema_version,
    'reason', 'active_catalog_without_published_in_app_template'
  ) order by catalog.type_key), '[]'::jsonb)
  into active_without_template
  from public.notification_catalog catalog
  where catalog.lifecycle = 'active'
    and 'in_app' = any(catalog.supported_channels)
    and not exists (
      select 1 from public.notification_template_versions template
      where template.type_key = catalog.type_key
        and template.schema_version = catalog.schema_version
        and template.channel = 'in_app'
        and template.status = 'published'
    );

  with request_events as (
    select event.workspace_id, event.id event_id,
      case when event.action = 'submitted' then 'requests.time_off.submitted'
        else 'requests.time_off.status_changed' end type_key,
      event.created_at occurred_at
    from public.schedule_time_off_events event
    -- The owner's own request was recorded approved by its requester in the
    -- same moment (submit_time_off_service); that fact is kept on the events,
    -- so the check does not depend on who owns the workspace today (BL-220).
    where not (event.action = 'submitted' and exists (
        select 1 from public.schedule_time_off_events decided
        where decided.workspace_id = event.workspace_id and decided.request_id = event.request_id
          and decided.action = 'approved'
          and decided.actor_user_id = event.actor_user_id and decided.created_at = event.created_at))
      -- A shortening tells its own people (requests.time_off.shortened, BL-182).
      and not public.time_off_event_is_shortening(event.workspace_id, event.request_id, event.metadata)
  ), missing_requests as (
    select request.workspace_id, request.event_id, request.type_key, request.occurred_at,
      'deterministic_request_event_without_outbox' reason
    from request_events request
    join public.notification_producer_registry registry
      on registry.type_key = request.type_key and registry.schema_version = 1
    where request.occurred_at >= registry.activated_at
      and not exists (
        select 1 from public.notification_outbox outbox
        where outbox.workspace_id = request.workspace_id and outbox.event_id = request.event_id
      )
  ), missing_announcements as (
    select announcement.workspace_id, null::uuid event_id,
      'communications.announcement.available' type_key,
      announcement.updated_at occurred_at,
      'published_announcement_without_outbox' reason
    from public.announcements announcement
    join public.notification_producer_registry registry
      on registry.type_key = 'communications.announcement.available' and registry.schema_version = 1
    where announcement.status in ('published', 'scheduled')
      and announcement.updated_at >= registry.activated_at
      and not exists (
        select 1 from public.notification_outbox outbox
        where outbox.workspace_id = announcement.workspace_id
          and outbox.type_key = 'communications.announcement.available'
          and outbox.subject_id = announcement.id::text
          and outbox.payload->>'announcement_revision' = announcement.revision::text
      )
  ), all_missing as (
    select * from missing_requests
    union all select * from missing_announcements
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'workspace_id', missing.workspace_id,
    'event_id', missing.event_id,
    'type_key', missing.type_key,
    'occurred_at', missing.occurred_at,
    'reason', missing.reason
  ) order by missing.occurred_at, missing.type_key), '[]'::jsonb)
  into missing_domain_events
  from all_missing missing;

  return jsonb_build_object(
    'status', case
      when jsonb_array_length(active_without_producer) = 0
        and jsonb_array_length(active_without_template) = 0
        and jsonb_array_length(missing_domain_events) = 0
      then 'healthy' else 'drift_detected' end,
    'active_catalog_without_producer', active_without_producer,
    'active_catalog_without_template', active_without_template,
    'deterministic_domain_events_without_outbox', missing_domain_events,
    'dead_letter_count', (select count(*) from public.notification_outbox where status = 'dead_letter'),
    'checked_at', now()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_schedule_requests_service(actor_user_id uuid, target_workspace_id uuid, target_time_off_queue text DEFAULT 'needs_review'::text, target_location_id uuid DEFAULT NULL::uuid, target_search text DEFAULT ''::text, target_time_off_cursor timestamp with time zone DEFAULT NULL::timestamp with time zone, target_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare can_time_off boolean; can_shift boolean; time_rows jsonb; locations jsonb;
 time_count integer; time_cursor timestamptz; time_scope uuid[]; shift_scope uuid[]; reached uuid[];
begin
 if target_time_off_queue not in ('needs_review', 'closed') or target_limit not between 1 and 100 then raise exception 'invalid schedule request query' using errcode = '22023'; end if;
 time_scope := app_private.scope_set(actor_user_id, target_workspace_id, 'requests.read');
 shift_scope := app_private.scope_set(actor_user_id, target_workspace_id, 'exchange.read');
 -- The people whose time off the actor reads.
 -- ponytail: one core call per person of the workspace; ask per page if workspaces grow past a few hundred people.
 reached := coalesce((select array_agg(e.id) from public.employee_profiles e where e.workspace_id = target_workspace_id
   and app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', e.id) is null), '{}');
 can_time_off := cardinality(reached) > 0;
 can_shift := cardinality(shift_scope) > 0;
 -- Neither list anywhere: say why not.
 if not can_time_off and not can_shift then
  perform app_private.authorize(actor_user_id, target_workspace_id, 'requests.read', target_locations => time_scope);
 end if;
 if target_location_id is not null then
  if can_time_off and app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', null, target_location_id) is not null then
   raise exception 'Not allowed' using errcode = '42501', detail = 'requests.read',
     hint = 'authz.' || app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', null, target_location_id);
  end if;
  if can_shift then perform app_private.authorize(actor_user_id, target_workspace_id, 'exchange.read', array[target_location_id]); end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) order by l.name), '[]') into locations
 from public.locations l where l.workspace_id = target_workspace_id and l.archived_at is null and (l.id = any (time_scope) or l.id = any (shift_scope));
 select count(*) into time_count from public.schedule_time_off_requests r
 where can_time_off and r.workspace_id = target_workspace_id and r.status = 'pending' and r.employee_id = any (reached);
 with filtered as (
  select r.* from public.schedule_time_off_requests r join public.employee_profiles e on e.id = r.employee_id
  where can_time_off and r.workspace_id = target_workspace_id and r.employee_id = any (reached)
   and (target_location_id is null
        or exists (select 1 from public.time_off_required_locations x where x.request_id = r.id and x.location_id = target_location_id))
   and ((target_time_off_queue = 'needs_review' and r.status = 'pending') or (target_time_off_queue = 'closed' and r.status <> 'pending'))
   and (target_time_off_cursor is null or r.created_at < target_time_off_cursor)
   and (btrim(target_search) = '' or concat_ws(' ', e.first_name, e.last_name, e.preferred_name, r.reason) ilike '%' || btrim(target_search) || '%')
  order by r.created_at desc, r.id limit target_limit + 1
 ), page as (select * from filtered limit target_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'employee_id', r.employee_id,
   'employee_name', concat_ws(' ', coalesce(nullif(e.preferred_name, ''), e.first_name), e.last_name),
   'request_type', r.request_type, 'reason', r.reason,
   'cancellation', public.time_off_cancellation_context(target_workspace_id, r.id), 'status', r.status,
   'start_date', (select min(s.segment_date) from public.schedule_time_off_segments s where s.request_id = r.id),
   'end_date', (select max(s.segment_date) from public.schedule_time_off_segments s where s.request_id = r.id),
   'revision', r.revision, 'created_at', r.created_at, 'decide_by', r.decide_by,
   'conflict_count', public.time_off_request_assignment_count(target_workspace_id, r.id),
   'segments', public.time_off_request_periods(r.id, target_workspace_id),
   'progress', case when r.status = 'pending' then app_private.time_off_progress(get_schedule_requests_service.actor_user_id, target_workspace_id, r.id) end,
   'events', coalesce((select jsonb_agg(jsonb_build_object('id', ev.id, 'action', ev.action,
       'actor_name', case when ev.actor_user_id is null then 'System' else coalesce(nullif(up.display_name, ''), 'Team member') end,
       'note', ev.note, 'created_at', ev.created_at,
       'released_assignments', public.time_off_event_released_assignments(get_schedule_requests_service.actor_user_id, target_workspace_id, ev.id)) order by ev.created_at)
     from public.schedule_time_off_events ev left join public.user_profiles up on up.user_id = ev.actor_user_id where ev.request_id = r.id), '[]'))
   order by r.created_at desc), '[]') into time_rows
 from page r join public.employee_profiles e on e.id = r.employee_id;
 with filtered as (
  select r.created_at from public.schedule_time_off_requests r join public.employee_profiles e on e.id = r.employee_id
  where can_time_off and r.workspace_id = target_workspace_id and r.employee_id = any (reached)
   and (target_location_id is null
        or exists (select 1 from public.time_off_required_locations x where x.request_id = r.id and x.location_id = target_location_id))
   and ((target_time_off_queue = 'needs_review' and r.status = 'pending') or (target_time_off_queue = 'closed' and r.status <> 'pending'))
   and (target_time_off_cursor is null or r.created_at < target_time_off_cursor)
   and (btrim(target_search) = '' or concat_ws(' ', e.first_name, e.last_name, e.preferred_name, r.reason) ilike '%' || btrim(target_search) || '%')
  order by r.created_at desc, r.id limit target_limit + 1
 ) select case when count(*) > target_limit then min(created_at) else null end into time_cursor from filtered;
 return jsonb_build_object('workspace_id', target_workspace_id,
   'time_format', (select time_format from public.workspace_scheduling_settings where workspace_id = target_workspace_id),
   'locations', locations, 'time_off_pending_count', time_count, 'time_off_next_cursor', time_cursor, 'time_off_requests', time_rows);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_dashboard_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  read_rule app_private.authz_actions;
  schedule_places uuid[];
  result jsonb;
begin
  -- Workspace home is the to-do list's page: one gate (KK-32, KK-34).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.todos');
  select * into read_rule from app_private.authz_actions r where r.key = 'employee.read';
  schedule_places := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.read');

  perform public.sync_expiring_document_todos_service(target_workspace_id);

  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'display_name', coalesce(profile.display_name, 'Manager'),
    'metrics', jsonb_build_object(
      'today_shift_count', (select count(*) from public.schedule_published_shifts shift join public.schedule_location_publications publication on publication.id = shift.publication_id and publication.status = 'current' where shift.workspace_id = target_workspace_id and shift.scheduled_date = current_date and shift.location_id = any(schedule_places)),
      'today_open_shift_count', (select count(*) from public.schedule_published_shifts shift join public.schedule_location_publications publication on publication.id = shift.publication_id and publication.status = 'current' where shift.workspace_id = target_workspace_id and shift.scheduled_date = current_date and shift.employee_id is null and shift.location_id = any(schedule_places)),
      'pending_time_off_count', (select count(*) from public.schedule_time_off_requests request where request.workspace_id = target_workspace_id and request.status = 'pending'
        and app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', request.employee_id) is null),
      'unread_notification_count', (select count(*) from public.notifications notification where notification.workspace_id = target_workspace_id and notification.recipient_user_id = actor_user_id and notification.dismissed_at is null and notification.read_at is null and notification.created_at <= now())
    ),
    'announcements', coalesce((select jsonb_agg(item.value) from (select value from jsonb_array_elements((public.get_announcements_service(actor_user_id, target_workspace_id)->'announcements')) value where value->>'status' in ('published', 'scheduled') and (value->>'publish_at')::timestamptz <= now() limit 5) item), '[]'::jsonb),
    'notifications', coalesce(public.get_notifications_service(actor_user_id, target_workspace_id, null, false, null, 5)->'notifications', '[]'::jsonb),
    'todos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', todo.id,
        'workspace_id', todo.workspace_id,
        'title', todo.title,
        'body', todo.body,
        'severity', todo.severity,
        'status', todo.status,
        'system_generated', todo.system_generated,
        'source_type', todo.source_type,
        'source_id', todo.source_id,
        'source_key', todo.source_key,
        'employee_id', todo.employee_id,
        'due_at', todo.due_at,
        'action_url', todo.action_url,
        'created_at', todo.created_at
      ) order by todo.due_at nulls last, todo.created_at, todo.id)
      from (
        select todo.*
        from public.workspace_todos todo
        where todo.workspace_id = target_workspace_id
          and todo.status = 'open'::public.workspace_todo_status
          and (
            todo.employee_id is null
            or app_private.authz_check(me, read_rule, null, todo.employee_id, null) is null
          )
        order by todo.due_at nulls last, todo.created_at, todo.id
        limit 5
      ) todo
    ), '[]'::jsonb),
    'layout', jsonb_build_object(
      'widget_order', public.normalize_workspace_widget_order(preference.widget_order),
      'hidden_widget_ids', array(
        select distinct value
        from unnest(coalesce(preference.hidden_widget_ids, '{}'::text[])) value
        where value = any(array[
          'operations',
          'pending_requests',
          'open_shifts',
          'announcements',
          'todos',
          'notifications',
          'quick_actions'
        ])
      )
    )
  ) into result
  from public.user_profiles profile
  left join public.workspace_layout_preferences preference
    on preference.workspace_id = target_workspace_id
   and preference.user_id = actor_user_id
  where profile.user_id = actor_user_id;

  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION app_private.schedule_week_availability(target_workspace_id uuid, target_week_start date, target_employee_ids uuid[], target_location_ids uuid[], with_reminders boolean DEFAULT true)
 RETURNS TABLE(employee_id uuid, location_id uuid, unavailable tstzmultirange, leave tstzmultirange, projection jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with location_zone as (
  select l.id, l.name, l.timezone, app_private.timezone_name_valid(l.timezone) as zone_ok
  from public.locations l
  where l.workspace_id = target_workspace_id and l.id = any(target_location_ids)
), zone as (
  select distinct z.timezone as zone_name from location_zone z where z.zone_ok
), piece as (
  -- Two four-day pieces, as the offset helper is bounded to eight physical
  -- days and a fall-back week is eight days and an hour.
  select z.zone_name,
    tstzrange((target_week_start + o.offset_days)::timestamp at time zone z.zone_name,
              (target_week_start + o.offset_days + 4)::timestamp at time zone z.zone_name, '[)') as span
  from zone z cross join (values (0), (4)) o(offset_days)
), segment as (
  select p.zone_name, s.utc_span, s.offset_seconds
  from piece p cross join lateral public.availability_offset_segments(p.span, p.zone_name) s
), mark as (
  select e.employee_id, false as reminder, e.preference, public.weekly_preference_valid(e.preference) as valid
  from public.employee_weekly_preferences e
  where e.workspace_id = target_workspace_id and e.employee_id = any(target_employee_ids)
  union all
  select m.employee_id, true, m.preference, public.weekly_preference_valid(m.preference)
  from public.manager_weekly_reminders m
  where with_reminders and m.workspace_id = target_workspace_id and m.employee_id = any(target_employee_ids) and m.enabled
), mark_day as (
  select m.employee_id, m.reminder, m.valid, m.preference ->> 'input_mode' as input_mode, d.value as rule
  from mark m cross join lateral jsonb_array_elements(case when m.valid then m.preference -> 'days' else '[]'::jsonb end) d
), clock as (
  select md.employee_id, md.reminder, (md.rule ->> 'day')::integer as dow,
    time '00:00' as start_clock, time '24:00' as end_clock, true as ok
  from mark_day md
  where coalesce((md.rule ->> 'all_day')::boolean, false)
  union all
  select md.employee_id, md.reminder, (md.rule ->> 'day')::integer,
    (md.rule -> 'range' ->> 'start')::time, (md.rule -> 'range' ->> 'end')::time, true
  from mark_day md
  where not coalesce((md.rule ->> 'all_day')::boolean, false) and md.input_mode = 'time_range'
    and md.rule -> 'range' <> 'null'::jsonb
  union all
  select md.employee_id, md.reminder, (md.rule ->> 'day')::integer, hours.start_clock, hours.end_clock,
    hours.start_clock is not null and hours.end_clock is not null and hours.start_clock <> hours.end_clock
  from mark_day md
  cross join lateral jsonb_array_elements_text(md.rule -> 'shift_type_ids') selected(type_id)
  cross join lateral (
    select case when t.id is not null and t.archived_at is null and t.deleted_at is null then t.default_start_time else d.start_time end as start_clock,
           case when t.id is not null and t.archived_at is null and t.deleted_at is null then t.default_end_time else d.end_time end as end_clock
    from (select selected.type_id::uuid as id) chosen
    left join public.shift_types t on t.workspace_id = target_workspace_id and t.id = chosen.id
    left join public.weekly_preference_type_defaults d on d.workspace_id = target_workspace_id and d.shift_type_id = chosen.id
  ) hours
  where not coalesce((md.rule ->> 'all_day')::boolean, false) and md.input_mode = 'shift_type'
), broken as (
  -- A mark that cannot be read (invalid, or a shift type without hours) makes
  -- the employee's week unknown rather than partly drawn.
  select m.employee_id from mark m where not m.valid
  union
  select c.employee_id from clock c where not c.ok
), local_day as (
  select s.zone_name, s.utc_span, s.offset_seconds, day::date as local_date
  from segment s
  cross join lateral generate_series(
    (((lower(s.utc_span) at time zone 'UTC') + make_interval(secs => s.offset_seconds))::date - 1)::timestamp,
    (((upper(s.utc_span) at time zone 'UTC') + make_interval(secs => s.offset_seconds))::date)::timestamp,
    interval '1 day') day
), unavailable_piece as (
  select c.employee_id, c.reminder, ld.zone_name,
    tstzrange(((ld.local_date + c.start_clock) at time zone 'UTC') - make_interval(secs => ld.offset_seconds),
              ((ld.local_date + c.end_clock + case when c.end_clock < c.start_clock then interval '1 day' else interval '0' end) at time zone 'UTC')
                - make_interval(secs => ld.offset_seconds), '[)') * ld.utc_span as span
  from local_day ld
  join clock c on c.dow = extract(dow from ld.local_date)::integer and c.ok
), unavailable as (
  select u.employee_id, u.zone_name, range_agg(u.span) as spans,
    range_agg(u.span) filter (where not u.reminder) as own_spans
  from unavailable_piece u
  where not isempty(u.span)
  group by u.employee_id, u.zone_name
), leave_target as (
  select z.zone_name,
    tstzrange(target_week_start::timestamp at time zone z.zone_name, (target_week_start + 8)::timestamp at time zone z.zone_name, '[)') as span
  from zone z
), leave as (
  select req.employee_id, lt.zone_name, range_agg(piece.span * lt.span) as spans
  from leave_target lt
  join public.schedule_time_off_requests req
    on req.workspace_id = target_workspace_id and req.employee_id = any(target_employee_ids)
   and req.request_type = 'time_off' and req.status = 'approved'
  join public.schedule_time_off_segments seg
    on seg.request_id = req.id and seg.workspace_id = req.workspace_id and seg.status = 'approved'
   and seg.segment_date between target_week_start - 4 and target_week_start + 12
  cross join lateral unnest(public.time_off_effective_ranges(seg.id)) piece(span)
  where piece.span && lt.span
  group by req.employee_id, lt.zone_name
), clock_segments as (
  select s.zone_name,
    jsonb_agg(jsonb_build_object('start_at', lower(s.utc_span), 'end_at', upper(s.utc_span), 'offset_seconds', s.offset_seconds)
      order by lower(s.utc_span)) as segments
  from segment s
  group by s.zone_name
), day_span as (
  select z.zone_name, target_week_start + i as work_date,
    tstzrange((target_week_start + i)::timestamp at time zone z.zone_name, (target_week_start + i + 1)::timestamp at time zone z.zone_name, '[)') as span
  from zone z cross join generate_series(0, 6) i
), employee_zone as (
  -- Everything but the location's own name is the same for every location in
  -- a time zone, so it is built once per employee and zone.
  select e.employee_id, z.zone_name,
    coalesce(u.spans, '{}'::tstzmultirange) as unavailable,
    coalesce(lv.spans, '{}'::tstzmultirange) as leave,
    jsonb_build_object(
      'status', 'ready',
      'unavailable_intervals', public.availability_ranges_json(coalesce(u.spans, '{}'::tstzmultirange)),
      -- The employee's own marks alone: what is left over came from a manager's
      -- reminder, which is always soft.
      'employee_intervals', public.availability_ranges_json(coalesce(u.own_spans, '{}'::tstzmultirange)),
      'leave_intervals', public.availability_ranges_json(coalesce(lv.spans, '{}'::tstzmultirange)),
      'clock_segments', cs.segments,
      'days', (select jsonb_agg(jsonb_build_object(
                 'date', ds.work_date,
                 'has_unavailable', coalesce(u.spans, '{}'::tstzmultirange) && ds.span,
                 'all_day', coalesce(u.spans, '{}'::tstzmultirange) @> ds.span) order by ds.work_date)
               from day_span ds where ds.zone_name = z.zone_name)) as body
  from unnest(target_employee_ids) e(employee_id)
  cross join zone z
  left join unavailable u on u.employee_id = e.employee_id and u.zone_name = z.zone_name
  left join leave lv on lv.employee_id = e.employee_id and lv.zone_name = z.zone_name
  left join clock_segments cs on cs.zone_name = z.zone_name
  where not exists (select 1 from broken b where b.employee_id = e.employee_id)
)
select e.employee_id, lz.id, ez.unavailable, ez.leave,
  jsonb_build_object('location_id', lz.id, 'location_name', lz.name, 'timezone', lz.timezone, 'week_start', target_week_start)
  || coalesce(ez.body, jsonb_build_object('status', 'unknown', 'unavailable_intervals', '[]'::jsonb, 'employee_intervals', '[]'::jsonb, 'leave_intervals', '[]'::jsonb,
       'clock_segments', '[]'::jsonb, 'days', '[]'::jsonb))
from unnest(target_employee_ids) e(employee_id)
cross join location_zone lz
left join employee_zone ez on ez.employee_id = e.employee_id and ez.zone_name = lz.timezone and lz.zone_ok;
$function$
;

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
   when 'closed_location' then settings.conflict_rules->>'closed_location'
   when 'minimum_travel' then settings.conflict_rules->>'minimum_travel'
   when 'minimum_rest' then settings.conflict_rules->>'minimum_rest' when 'document_required' then settings.conflict_rules->>'document_required' when 'document_conditional_grace' then settings.conflict_rules->>'document_conditional_grace' when 'document_conditional_overdue' then settings.conflict_rules->>'document_conditional_overdue'
   when 'time_source_unresolved' then 'confirm'
   else 'block' end;
  if rule->>'code'<>'availability' and array_position(array['allow','warn','confirm','block'],rule_severity)>array_position(array['allow','warn','confirm','block'],conflict_severity) then conflict_severity:=rule_severity; end if;
  if rule_severity<>'allow' then annotated:=annotated||jsonb_build_array(rule||jsonb_build_object('severity',rule_severity)); end if;
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
end; $function$
;

CREATE OR REPLACE FUNCTION app_private.schedule_departments_and_jobs(target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', department.id, 'name', department.name, 'color', department.color,
        'system_key', department.system_key
      ) order by lower(department.name), department.id)
      from public.departments department
      where department.workspace_id = target_workspace_id and department.archived_at is null
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', job.id, 'name', job.name, 'color', job.color,
        'department_id', job.department_id, 'system_key', job.system_key
      ) order by lower(job.name), job.id)
      from public.jobs job
      where job.workspace_id = target_workspace_id and job.archived_at is null
    ), '[]'::jsonb)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.read_settings_jobs_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.jobs.read');
  return jsonb_build_object(
    'departments', (
      select coalesce(jsonb_agg(to_jsonb(d) order by lower(d.name), d.id), '[]'::jsonb)
      from (
        select department.id, department.workspace_id, department.name, department.color,
          department.archived_at, department.system_key
        from public.departments department
        where department.workspace_id = target_workspace_id and department.deleted_at is null
      ) d),
    'jobs', (
      select coalesce(jsonb_agg(to_jsonb(j) order by lower(j.name), j.id), '[]'::jsonb)
      from (
        select job.id, job.workspace_id, job.department_id, job.name, job.color, job.archived_at,
          job.system_key
        from public.jobs job
        where job.workspace_id = target_workspace_id and job.deleted_at is null
      ) j)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_time_off_service(actor uuid, w uuid, periods jsonb, reason text, expected_timezone text, operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    if prior.input <> command then raise exception 'This request key was used for different time-off hours' using errcode = '40001'; end if;
    return prior.result;
  end if;
  if jsonb_typeof(periods) is distinct from 'array' then raise exception 'Enter the requested time-off periods' using errcode = '22023'; end if;
  if jsonb_array_length(periods) not between 1 and 31 or char_length(btrim(coalesce(reason, ''))) > 1000 then
    raise exception 'Enter between 1 and 31 days and a note of at most 1000 characters' using errcode = '22023'; end if;

  zone_name := app_private.time_off_timezone(w, employee.id);
  if zone_name is null then
    zone_name := expected_timezone;
  elsif expected_timezone is distinct from zone_name then
    raise exception 'The time zone of your location changed. Review the hours in the current time zone before sending' using errcode = '40001';
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
  -- Sent straight to an admin and the owner (nobody can vote somewhere): that was their one notice.
  update public.schedule_time_off_requests set fallback_notified_at = now()
  where id = rid and exists (select 1 from (select app_private.time_off_state(w, rid) s) x
    where (x.s ->> 'fallback')::boolean or (x.s ->> 'unattended')::integer > 0);
  -- The owner's own time off is recorded approved (K12, BL-221).
  if public.time_off_is_the_owners_own(actor, w, rid) then
    perform app_private.time_off_finalize(w, rid, 'approve', actor, '', true);
  end if;
  select jsonb_build_object('status', r.status, 'request_id', r.id, 'revision', r.revision, 'decide_by', r.decide_by) into result
  from public.schedule_time_off_requests r where r.id = rid;
  insert into public.time_off_commands(workspace_id, actor_user_id, operation_id, input, result)
  values (w, actor, submit_time_off_service.operation_id, command, result);
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_employee_hub_service(actor_user_id uuid, target_workspace_id uuid, target_from date, target_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare employee public.employee_profiles%rowtype; result jsonb;
begin
  if target_to < target_from or target_to > target_from + 62 then
    raise exception 'employee hub date range is invalid' using errcode = '22023';
  end if;
  employee := public.employee_hub_actor_service(actor_user_id, target_workspace_id);

  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'employee', jsonb_build_object(
      'id', employee.id,
      'display_name', concat_ws(' ', coalesce(nullif(employee.preferred_name,''),employee.first_name), employee.last_name)
    ),
    'time_off_timezone', app_private.time_off_timezone(target_workspace_id, employee.id),
    'settings', jsonb_build_object('time_off_lead_hours', coalesce((select s.time_off_lead_hours from public.workspace_scheduling_settings s where s.workspace_id = target_workspace_id), 24)),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('id',location.id,'name',location.name) order by location.sort_order,location.name)
      from public.employee_location_assignments assignment
      join public.locations location on location.id=assignment.location_id and location.archived_at is null
      where assignment.employee_id=employee.id and assignment.ended_at is null
    ),'[]'::jsonb),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',shift.id,'location_id',shift.location_id,'location_name',location.name,'job_name',job.name,
        'scheduled_date',shift.scheduled_date,'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time',to_char(shift.start_time,'HH24:MI'),
        'end_time',to_char(shift.end_time,'HH24:MI'),'note',shift.note,'employee_id',shift.employee_id
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      where shift.workspace_id=target_workspace_id and shift.employee_id=employee.id
        and shift.scheduled_date between target_from and target_to
    ),'[]'::jsonb),
    'open_shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',shift.id,'location_id',shift.location_id,'location_name',location.name,'job_name',job.name,
        'scheduled_date',shift.scheduled_date,'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time',to_char(shift.start_time,'HH24:MI'),
        'end_time',to_char(shift.end_time,'HH24:MI'),'note',shift.note,'employee_id',null
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      where shift.workspace_id=target_workspace_id and shift.employee_id is null
        and shift.scheduled_date between target_from and target_to
        and exists(select 1 from public.employee_location_assignments assignment
          where assignment.employee_id=employee.id and assignment.location_id=shift.location_id and assignment.ended_at is null)
    ),'[]'::jsonb),
    'team_shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',shift.id,'location_id',shift.location_id,'location_name',location.name,'job_name',job.name,
        'scheduled_date',shift.scheduled_date,'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time',to_char(shift.start_time,'HH24:MI'),
        'end_time',to_char(shift.end_time,'HH24:MI'),'note','','employee_id',shift.employee_id,
        'employee_name',concat_ws(' ',coalesce(nullif(teammate.preferred_name,''),teammate.first_name),teammate.last_name)
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      join public.employee_profiles teammate on teammate.id=shift.employee_id
      where shift.workspace_id=target_workspace_id and shift.employee_id<>employee.id
        and shift.scheduled_date between target_from and target_to
        and exists(select 1 from public.employee_location_assignments assignment
          where assignment.employee_id=employee.id and assignment.location_id=shift.location_id and assignment.ended_at is null)
    ),'[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(request_row order by request_row->>'created_at' desc) from (
        select jsonb_build_object(
          'id',request.id,'kind','time_off','request_type',request.request_type,'cancellation',public.time_off_cancellation_context(target_workspace_id,request.id),'periods',public.time_off_request_periods(request.id,target_workspace_id), 'decision_events',coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'action',ev.action,'note',ev.note,'created_at',ev.created_at,'revision',ev.metadata->'revision','released_assignments',public.time_off_event_released_assignments(get_employee_hub_service.actor_user_id,target_workspace_id,ev.id)) order by ev.created_at,ev.id)
  from public.schedule_time_off_events ev where ev.request_id=request.id and ev.workspace_id=target_workspace_id and ev.action in('approved','denied','revoked','expired')),'[]'), 'status',request.status::text,'display_status',app_private.time_off_display_status(target_workspace_id,request.id),'decide_by',request.decide_by,
          'title',case when request.request_type='time_off_cancellation' then 'Cancel approved leave · ' else 'Time off · ' end||to_char(min(segment.segment_date),'Mon DD')||case when min(segment.segment_date)<>max(segment.segment_date) then '–'||to_char(max(segment.segment_date),'Mon DD') else '' end,
          'detail',coalesce(nullif(request.reason,''),'No note'),'revision',request.revision,'created_at',request.created_at,
          'can_cancel',request.status='pending'
        ) request_row
        from public.schedule_time_off_requests request
        join public.schedule_time_off_segments segment on segment.request_id=request.id
        where request.workspace_id=target_workspace_id and request.employee_id=employee.id
        group by request.id
      ) requests
    ),'[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',teammate.id,
        'display_name',concat_ws(' ',coalesce(nullif(teammate.preferred_name,''),teammate.first_name),teammate.last_name),
        'job_names',coalesce((select jsonb_agg(job.name order by lower(job.name),job.id) from public.employee_job_assignments assignment join public.jobs job on job.id=assignment.job_id where assignment.employee_id=teammate.id and assignment.ended_at is null),'[]'::jsonb),
        'location_names',coalesce((select jsonb_agg(location.name order by location.sort_order,location.name) from public.employee_location_assignments assignment join public.locations location on location.id=assignment.location_id where assignment.employee_id=teammate.id and assignment.ended_at is null),'[]'::jsonb)
      ) order by teammate.last_name,teammate.first_name)
      from public.employee_profiles teammate
      where teammate.workspace_id=target_workspace_id and teammate.archived_at is null and teammate.id<>employee.id
        and exists(select 1 from public.employee_location_assignments mine join public.employee_location_assignments theirs on theirs.location_id=mine.location_id and theirs.ended_at is null where mine.employee_id=employee.id and mine.ended_at is null and theirs.employee_id=teammate.id)
    ),'[]'::jsonb)
  ) into result;
  return result;
end; $function$;
