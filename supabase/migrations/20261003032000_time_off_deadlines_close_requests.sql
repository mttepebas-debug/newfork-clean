-- FB-6.3.4: what each side reads, and the deadline job.
--
-- Rules (user decisions 2026-09-30, KARARLAR "İzin", "Süre"):
-- * Requests > Time off shows the time off of the people the actor reaches
--   (requests.read, person scope since 20261003031000): every request of a
--   person who works at one of a manager's locations, every request for an
--   admin or the owner. Those who decide see the progress: the fixed
--   locations, who approved and when, what is left, the deadline, whether
--   their approval would settle it, and the shifts it would open.
-- * Employee Hub shows the person only "Pending" until the request closes,
--   then the outcome (display_status), never who voted.
-- * A request must be decided by its start minus the workspace's lead time
--   (Settings > Scheduling, 0-720 hours, 24 by default; a change only touches
--   new requests). Every five minutes time-off-deadlines turns down what was
--   not decided in time ("Not decided in time", by the system), reminds the
--   managers who have not approved once, twelve hours before the deadline
--   (not for a request sent inside those twelve hours), lets go of votes
--   whose shifts changed and asks their managers once to look again, and
--   tells an admin and the owner once when only they can decide.

-- 1. What the deciders read ----------------------------------------------------

-- The shifts an approval would open, as the actor may see them: in full at
-- the locations whose schedule they read, as a count elsewhere (the shift is
-- local, M2). The fingerprint is the whole picture's.
create function app_private.time_off_impact_seen(actor uuid, w uuid, rid uuid)
returns jsonb
language sql
stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'fingerprint', impact ->> 'fingerprint',
    'locations', coalesce((select jsonb_object_agg(x.key, x.value) from jsonb_each(impact -> 'locations') x
      where app_private.time_off_reason(actor, w, 'schedule.read', null, x.key::uuid) is null), '{}'),
    'hidden_shift_count', (select coalesce(sum(jsonb_array_length(x.value -> 'shifts')), 0)::integer from jsonb_each(impact -> 'locations') x
      where app_private.time_off_reason(actor, w, 'schedule.read', null, x.key::uuid) is not null))
  from (select app_private.time_off_impact(w, rid) impact) seen;
$$;

-- The progress of a request as the actor sees it.
create function app_private.time_off_progress(actor uuid, w uuid, rid uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  r public.schedule_time_off_requests%rowtype;
  st jsonb;
  alone boolean;
  mine uuid[] := '{}';
  open_places uuid[];
  my_vote text;
begin
  select * into r from public.schedule_time_off_requests where id = rid and workspace_id = w;
  st := app_private.time_off_state(w, rid);
  alone := r.status = 'pending' and app_private.time_off_reason(actor, w, 'time_off.decide_alone', r.employee_id) is null;
  if r.status = 'pending' and not alone then
    select coalesce(array_agg((x ->> 'id')::uuid), '{}') into mine
    from jsonb_array_elements(st -> 'locations') x
    where app_private.time_off_reason(actor, w, 'time_off.decide', r.employee_id, (x ->> 'id')::uuid) is null;
  end if;
  select coalesce(array_agg((x ->> 'id')::uuid), '{}') into open_places
  from jsonb_array_elements(st -> 'locations') x where x -> 'approved_by' = 'null'::jsonb;
  select v ->> 'verdict' into my_vote from jsonb_array_elements(st -> 'votes') v
  where (v ->> 'voter')::uuid = actor and not (v ->> 'stale')::boolean;
  return jsonb_build_object(
    'remaining', st -> 'remaining',
    'fallback', st -> 'fallback',
    'decide_by', r.decide_by,
    'can_vote', cardinality(mine) > 0,
    'can_decide_alone', alone,
    'my_vote', my_vote,
    'my_approval_finalizes', alone or (cardinality(mine) > 0 and cardinality(open_places) > 0 and open_places <@ mine),
    'locations', coalesce((select jsonb_agg(x || jsonb_build_object('name', l.name,
        'approved_by_name', (select coalesce(nullif(up.display_name, ''), 'Team member') from public.user_profiles up where up.user_id = (x ->> 'approved_by')::uuid))
      order by l.name)
      from jsonb_array_elements(st -> 'locations') x join public.locations l on l.id = (x ->> 'id')::uuid), '[]'),
    'impact', case when alone or cardinality(mine) > 0 then app_private.time_off_impact_seen(actor, w, rid) end);
end;
$$;

-- What a request reads as for the person who asked: "Pending" until it
-- closes, then the outcome.
create function app_private.time_off_display_status(w uuid, rid uuid)
returns text
language sql
stable security definer
set search_path = ''
as $$
  select case
    when r.status = 'pending' then 'Pending'
    when r.status = 'denied' and exists (select 1 from public.schedule_time_off_events e where e.request_id = r.id and e.action = 'expired') then 'Not decided in time'
    when r.status = 'denied' then 'Denied'
    when r.status = 'revoked' and last_revoke.actor_user_id is not distinct from person.user_id then 'Withdrawn'
    when r.status = 'revoked' then 'Revoked'
    when last_revoke.metadata ? 'taken_until' then 'Revoked · taken until ' || to_char(
      (last_revoke.metadata ->> 'taken_until')::timestamptz at time zone coalesce(zone.name, 'UTC'),
      case when setting.time_format = '24h' then 'Mon FMDD, HH24:MI' else 'Mon FMDD, FMHH12:MI AM' end)
    when r.status = 'partially_approved' then 'Partly approved'
    else 'Approved' end
  from public.schedule_time_off_requests r
  join public.employee_profiles person on person.id = r.employee_id and person.workspace_id = r.workspace_id
  left join public.workspace_scheduling_settings setting on setting.workspace_id = r.workspace_id
  left join lateral (select s.time_timezone name from public.schedule_time_off_segments s
                     where s.request_id = r.id and s.time_timezone is not null order by s.starts_at limit 1) zone on true
  left join lateral (select e.actor_user_id, e.metadata from public.schedule_time_off_events e
                     where e.request_id = r.id and e.action = 'revoked' order by e.created_at desc, e.id desc limit 1) last_revoke on true
  where r.id = rid and r.workspace_id = w;
$$;

create or replace function public.get_schedule_requests_service(actor_user_id uuid, target_workspace_id uuid, target_time_off_queue text default 'needs_review',
  target_location_id uuid default null, target_search text default '', target_time_off_cursor timestamptz default null, target_limit integer default 50)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
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
   and (target_location_id is null or r.location_id = target_location_id
        or exists (select 1 from public.time_off_required_locations x where x.request_id = r.id and x.location_id = target_location_id))
   and ((target_time_off_queue = 'needs_review' and r.status = 'pending') or (target_time_off_queue = 'closed' and r.status <> 'pending'))
   and (target_time_off_cursor is null or r.created_at < target_time_off_cursor)
   and (btrim(target_search) = '' or concat_ws(' ', e.first_name, e.last_name, e.preferred_name, r.reason) ilike '%' || btrim(target_search) || '%')
  order by r.created_at desc, r.id limit target_limit + 1
 ), page as (select * from filtered limit target_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'employee_id', r.employee_id,
   'employee_name', concat_ws(' ', coalesce(nullif(e.preferred_name, ''), e.first_name), e.last_name),
   'location_id', r.location_id, 'location_name', l.name, 'request_type', r.request_type, 'reason', r.reason,
   'cancellation', public.time_off_cancellation_context(target_workspace_id, r.id), 'status', r.status,
   'start_date', (select min(s.segment_date) from public.schedule_time_off_segments s where s.request_id = r.id),
   'end_date', (select max(s.segment_date) from public.schedule_time_off_segments s where s.request_id = r.id),
   'revision', r.revision, 'viewed_at', r.viewed_at, 'created_at', r.created_at, 'decide_by', r.decide_by,
   'conflict_count', public.time_off_request_assignment_count(target_workspace_id, r.id),
   'segments', public.time_off_request_periods(r.id, target_workspace_id),
   'progress', case when r.status = 'pending' then app_private.time_off_progress(get_schedule_requests_service.actor_user_id, target_workspace_id, r.id) end,
   'events', coalesce((select jsonb_agg(jsonb_build_object('id', ev.id, 'action', ev.action,
       'actor_name', case when ev.actor_user_id is null then 'System' else coalesce(nullif(up.display_name, ''), 'Team member') end,
       'note', ev.note, 'created_at', ev.created_at,
       'released_assignments', public.time_off_event_released_assignments(get_schedule_requests_service.actor_user_id, target_workspace_id, ev.id)) order by ev.created_at)
     from public.schedule_time_off_events ev left join public.user_profiles up on up.user_id = ev.actor_user_id where ev.request_id = r.id), '[]'))
   order by r.created_at desc), '[]') into time_rows
 from page r join public.employee_profiles e on e.id = r.employee_id
 left join public.locations l on l.id = r.location_id;
 with filtered as (
  select r.created_at from public.schedule_time_off_requests r join public.employee_profiles e on e.id = r.employee_id
  where can_time_off and r.workspace_id = target_workspace_id and r.employee_id = any (reached)
   and (target_location_id is null or r.location_id = target_location_id
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
$$;

-- 2. The deadline job ----------------------------------------------------------

insert into public.notification_catalog (
  type_key, schema_version, category, severity, sensitivity, supported_channels,
  default_cadence, audience_contract, action_route_contract, dedupe_policy,
  retention_class, template_key, lifecycle, mandatory_in_app, notification_scope
) values
  ('requests.time_off.reminder', 1, 'requests', 'action_required', 'confidential', '{in_app}', 'immediate', 'time_off_deciders',
   '{"route": "/app/schedule/requests", "allowed_query_keys": ["tab", "request"]}',
   '{"scope": "event_recipient", "strategy": "keep_first", "key_fields": ["event_id", "recipient_user_id"]}',
   'sensitive_30d', 'requests.time_off.reminder.v1', 'active', false, 'workspace'),
  ('requests.time_off.review_again', 1, 'requests', 'action_required', 'confidential', '{in_app}', 'immediate', 'time_off_voter',
   '{"route": "/app/schedule/requests", "allowed_query_keys": ["tab", "request"]}',
   '{"scope": "event_recipient", "strategy": "keep_first", "key_fields": ["event_id", "recipient_user_id"]}',
   'sensitive_30d', 'requests.time_off.review_again.v1', 'active', false, 'workspace');
insert into public.notification_producer_registry (type_key, schema_version, producer_id, source_migration, source_function, integration_contract) values
  ('requests.time_off.reminder', 1, 'time-off-reminder', '20261003032000_time_off_deadlines_close_requests.sql', 'time_off_sweep', 'outbox_v1'),
  ('requests.time_off.review_again', 1, 'time-off-review-again', '20261003032000_time_off_deadlines_close_requests.sql', 'time_off_sweep', 'outbox_v1');
insert into public.notification_template_versions (type_key, schema_version, channel, locale, template_version, template_key, content, status, published_at) values
  ('requests.time_off.reminder', 1, 'in_app', 'en', 1, 'requests.time_off.reminder.v1',
   '{"title": "Time off waits for your decision", "body": "Decide before the deadline or it is declined.", "action_url": "/app/schedule/requests", "safe_preview": "A time-off request waits for a decision."}',
   'published', now()),
  ('requests.time_off.review_again', 1, 'in_app', 'en', 1, 'requests.time_off.review_again.v1',
   '{"title": "Look at this time off again", "body": "The shifts it affects changed, so your approval no longer counts.", "action_url": "/app/schedule/requests", "safe_preview": "A time-off request needs another look."}',
   'published', now());

create function app_private.time_off_notice(w uuid, rid uuid, type_key text, recipients uuid[], audience text, title text, body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if cardinality(recipients) = 0 then
    return;
  end if;
  perform public.enqueue_notification_outbox_service(w, gen_random_uuid(), type_key, 1, null,
    'schedule_time_off_requests', rid::text,
    jsonb_build_object('request_id', rid, 'recipient_user_ids', to_jsonb(recipients), 'audience_contract', audience,
      'category', 'request', 'title', title, 'body', body, 'safe_preview', 'A time-off request needs a decision.',
      'action_url', '/app/schedule/requests?tab=time-off&request=' || rid::text,
      'group_key', 'schedule_time_off_requests:' || rid::text),
    now());
end;
$$;

-- Every five minutes. One transaction, at most 500 requests per pass.
-- ponytail: one transaction per pass, at most 500 requests, each workspace's
-- lock held to the end of the pass; past that, a procedure that commits per
-- request (and loops until nothing is due) replaces it.
create function app_private.time_off_sweep()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  st jsonb;
  v jsonb;
  waiting uuid[];
  done integer := 0;
begin
  -- Not decided in time: the system declines it.
  for r in select q.id, q.workspace_id from public.schedule_time_off_requests q
    where q.status = 'pending' and q.decide_by is not null and q.decide_by <= now()
    order by q.decide_by, q.id limit 500 loop
    perform public.availability_lock_workspace(r.workspace_id);
    -- Read again under the lock: a withdrawal or a last vote may have closed it.
    if exists (select 1 from public.schedule_time_off_requests q where q.id = r.id and q.status = 'pending' and q.decide_by <= now()) then
      perform app_private.time_off_finalize(r.workspace_id, r.id, 'deny', null, 'Not decided in time', false, true);
      done := done + 1;
    end if;
  end loop;

  for r in select q.* from public.schedule_time_off_requests q
    where q.status = 'pending' and q.decide_by > now()
    order by q.decide_by, q.id limit 500 loop
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
      perform app_private.time_off_notice(r.workspace_id, r.id, 'requests.time_off.review_again', array[(v ->> 'voter')::uuid], 'time_off_voter',
        'Look at this time off again', 'The shifts it affects changed, so your approval no longer counts.');
      done := done + 1;
    end loop;

    -- Every location still deciding has approved (another dropped out, KARARLAR
    -- "İzin" 2026-09-30): the request is settled, by the system.
    if (st ->> 'remaining')::integer = 0 and not (st ->> 'fallback')::boolean then
      perform app_private.time_off_finalize(r.workspace_id, r.id, 'approve', null, 'All deciding locations approved', false);
      done := done + 1;
      continue;
    end if;

    -- Only an admin or the owner can decide it now: tell them once.
    if (st ->> 'fallback')::boolean and r.fallback_notified_at is null
       and exists (select 1 from public.time_off_required_locations x where x.request_id = r.id) then
      perform app_private.time_off_notice(r.workspace_id, r.id, 'requests.time_off.reminder',
        app_private.time_off_alone_deciders(r.workspace_id, r.employee_id), 'time_off_fallback_deciders',
        'Time off waits for an admin', 'No manager who may decide this request is left at its locations.');
      update public.schedule_time_off_requests set fallback_notified_at = now() where id = r.id;
      done := done + 1;
    end if;

    -- Twelve hours before the deadline, once; not for one sent inside them.
    if r.reminded_at is null and r.decide_by - interval '12 hours' <= now() and r.created_at < r.decide_by - interval '12 hours' then
      st := app_private.time_off_state(r.workspace_id, r.id);
      if (st ->> 'fallback')::boolean then
        waiting := app_private.time_off_alone_deciders(r.workspace_id, r.employee_id);
      else
        select coalesce(array_agg(distinct u order by u), '{}') into waiting
        from jsonb_array_elements(st -> 'locations') x,
             unnest(app_private.time_off_location_voters(r.workspace_id, r.employee_id, (x ->> 'id')::uuid)) u
        where x -> 'approved_by' = 'null'::jsonb;
      end if;
      perform app_private.time_off_notice(r.workspace_id, r.id, 'requests.time_off.reminder', waiting, 'time_off_deciders',
        'Time off waits for your decision', 'Decide before the deadline or it is declined.');
      update public.schedule_time_off_requests set reminded_at = now() where id = r.id;
      done := done + 1;
    end if;
  end loop;
  return done;
end;
$$;

select cron.schedule('time-off-deadlines', '*/5 * * * *', 'select app_private.time_off_sweep()');

revoke all on function
  app_private.time_off_impact_seen(uuid, uuid, uuid),
  app_private.time_off_progress(uuid, uuid, uuid),
  app_private.time_off_display_status(uuid, uuid),
  app_private.time_off_notice(uuid, uuid, text, uuid[], text, text, text),
  app_private.time_off_sweep()
from public, anon, authenticated, service_role;

-- 3. Employee Hub and Settings > Scheduling ------------------------------------

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
  from public.schedule_time_off_events ev where ev.request_id=request.id and ev.workspace_id=target_workspace_id and ev.action in('approved','partially_approved','denied','returned_to_pending','revoked','expired')),'[]'), 'status',request.status::text,'display_status',app_private.time_off_display_status(target_workspace_id,request.id),'decide_by',request.decide_by,
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


CREATE OR REPLACE FUNCTION public.update_scheduling_settings_service(actor_user_id uuid, target_workspace_id uuid, settings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare previous public.workspace_scheduling_settings; proposed public.workspace_scheduling_settings; saved public.workspace_scheduling_settings;
 conflict_keys text[]:=array['conflict_rules','conflict_rules_revision','minimum_travel_minutes','minimum_rest_minutes'];
 touches_conflicts boolean:=jsonb_typeof(settings)='object' and settings ?| conflict_keys;
begin
 perform app_private.authorize(actor_user_id, target_workspace_id,
   case when touches_conflicts then 'settings.conflict_rules.write' else 'settings.scheduling.write' end);
 if touches_conflicts then
  if settings-conflict_keys<>'{}'::jsonb then
   perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.scheduling.write');
  end if;
 end if;
 if jsonb_typeof(settings) is distinct from 'object' then raise exception 'Valid settings required' using errcode='22023'; end if;
 if settings='{}'::jsonb then raise exception 'Settings are required' using errcode='22023'; end if;
 -- BL-186: availability is a preference; there is no rule to set.
 if settings->'conflict_rules' ? 'availability' then
  raise exception 'Availability is a preference and has no conflict rule' using errcode='22023'; end if;
 if settings ? 'time_off_lead_hours' and (jsonb_typeof(settings->'time_off_lead_hours') is distinct from 'number'
  or (settings->>'time_off_lead_hours')::numeric not between 0 and 720 or (settings->>'time_off_lead_hours')::numeric % 1 <> 0) then
  raise exception 'The time-off decision lead time is 0 to 720 whole hours' using errcode='22023'; end if;
 perform public.availability_lock_workspace(target_workspace_id);
 perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));
 select * into previous from public.workspace_scheduling_settings where workspace_id=target_workspace_id for update;
 if not found then raise exception 'Scheduling settings not found'; end if;
 if settings ?| conflict_keys and (settings->>'conflict_rules_revision')::integer is distinct from previous.conflict_rules_revision then
  raise exception 'Conflict rules changed. Reload the current rules before saving.' using errcode='PT409';
 end if;
 -- Partial calls preserve every omitted field. Revision is stamped by trigger.
 select * into proposed from jsonb_populate_record(previous,settings);
 update public.workspace_scheduling_settings set
  week_start_day=proposed.week_start_day,schedule_deadline_day=proposed.schedule_deadline_day,
  time_format=proposed.time_format,minimum_travel_minutes=proposed.minimum_travel_minutes,
  minimum_rest_minutes=proposed.minimum_rest_minutes,conflict_rules=proposed.conflict_rules,time_off_lead_hours=proposed.time_off_lead_hours,updated_at=now()
 where workspace_id=target_workspace_id returning * into saved;
 if (to_jsonb(previous)-'updated_at') is distinct from (to_jsonb(saved)-'updated_at') then
  insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata)
  values(target_workspace_id,actor_user_id,'scheduling.settings_updated','scheduling_settings',target_workspace_id::text,
   jsonb_build_object('before',to_jsonb(previous),'after',to_jsonb(saved)));
 end if;
 return to_jsonb(saved);
end;
$function$;
