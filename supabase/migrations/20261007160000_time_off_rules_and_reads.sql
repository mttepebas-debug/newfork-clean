-- Time-off rules of Requests and what its list reads (EKRAN-02 A3).
--   K-S2   a manager missing a document reads Requests (time off and shift
--          changes) and decides nothing: authz_actions.documents_ok.
--   K-S3   Time off has no "View" level: reading comes with deciding.
--   R2-13  one decision tells each person once.
--   R2-45  the employee hears how it was decided.
--   R2-23  a shortening tells everybody who approved the leave; after the
--          system's approval, the managers who could decide it.
--   R2-53  ...and no longer says the person is back on the schedule (BL-396).
--   R2-42  the list says which closed request the employee withdrew.
--   R2-52  ...and which hours the system gave back (BL-364).
--   BL-507 a request the deadline job cannot close leaves a record.
--   BL-506 the deadline job's pass bound is a parameter (tests close one at a time).
--   BL-411 who may not act here at all hears so before a request is looked up.
--   R2-55  a malformed period id is a bad request (22023), not a server error.

-- K-S2 ---------------------------------------------------------------------------
alter table app_private.authz_actions
  add column documents_ok boolean not null default false;
comment on column app_private.authz_actions.documents_ok is
  'A missing document does not close it; unfinished onboarding still does (restricted_ok opens both). Requests are read, not decided (EKRAN-02 K-S2).';
update app_private.authz_actions set documents_ok = true where key in ('requests.read', 'exchange.read');

CREATE OR REPLACE FUNCTION app_private.authz_check(state app_private.actor_state, rule_row app_private.authz_actions, target_locations uuid[], target_person uuid, target_user uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_workspace uuid;
  person uuid := target_person;
  whose uuid;
  target_access public.workspace_role;
  target_is_self boolean;
  places uuid[];
  reach text;
begin
  if state.user_id is null then
    return 'not_member';
  end if;
  if rule_row.scope_class = 'account' then
    -- An account action is about one's own account.
    if target_user is not null and target_user is distinct from state.user_id then
      return 'out_of_scope';
    end if;
    return null;
  end if;
  if state.membership_id is null then
    return 'not_member';
  end if;
  if not state.workspace_open then
    return 'workspace_closed';
  end if;

  if person is not null then
    select profile.workspace_id, profile.user_id into target_workspace, whose
    from public.employee_profiles profile
    where profile.id = person;
    if target_workspace is distinct from state.workspace_id then
      return 'out_of_scope';
    end if;
  end if;
  if target_user is not null then
    if person is not null and whose is distinct from target_user then
      return 'out_of_scope';
    end if;
    whose := target_user;
    if person is null then
      select profile.id into person
      from public.employee_profiles profile
      where profile.workspace_id = state.workspace_id
        and profile.user_id = target_user
        and profile.archived_at is null;
      if person is null and not exists (
        select 1 from public.workspace_memberships membership
        where membership.workspace_id = state.workspace_id and membership.user_id = target_user
      ) then
        return 'out_of_scope';
      end if;
    end if;
  end if;
  target_is_self := coalesce(whose = state.user_id, false);

  -- Their own row is theirs to read in any state.
  if rule_row.self_ok and target_is_self then
    return null;
  end if;

  if state.status = 'pending_activation' then
    if not rule_row.restricted_ok then
      return 'not_active';
    end if;
  elsif state.status <> 'active' then
    return 'not_active';
  elsif state.document_blocked and not (rule_row.restricted_ok or rule_row.documents_ok) then
    return 'document_blocked';
  end if;

  if rule_row.scope_class = 'own' then
    -- One's own availability is an employee's (M13): a manager, an admin or
    -- the owner has no own record of that kind.
    if rule_row.employee_target and state.class <> 'employee' then
      return 'rank';
    end if;
    if (person is null and whose is null) or target_is_self then
      return null;
    end if;
    return 'out_of_scope';
  end if;

  if rule_row.owner_only and state.class <> 'owner' then
    return 'owner_only';
  end if;
  -- The owner holds every permission.
  if state.class <> 'owner'
     and rule_row.permission_key is not null
     and not rule_row.permission_key = any (state.permissions) then
    return 'missing_permission';
  end if;
  if state.class = 'employee' then
    return 'missing_permission';
  end if;

  if rule_row.no_self and target_is_self then
    return 'rank';
  end if;
  -- A manager's own record goes one level up; owners and admins keep theirs
  -- (user decision 2026-09-24, 2A).
  if rule_row.rank_below and target_is_self and state.class not in ('owner', 'admin') then
    return 'rank';
  end if;
  if rule_row.rank_below and (person is not null or whose is not null) and not target_is_self then
    select role.access_class into target_access
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    where membership.workspace_id = state.workspace_id and membership.user_id = whose;
    -- ponytail: somebody without a membership yet ranks as an employee; use the
    -- invitation's role if a manager ever invites into a higher one.
    if app_private.authz_rank(coalesce(target_access, 'employee')) >= app_private.authz_rank(state.class)
       and not (rule_row.owner_target_ok and target_access = 'owner') then
      return 'rank';
    end if;
  end if;

  -- Some actions are about employees only: never a manager, an admin or the
  -- owner, whoever asks, themselves included (the Manager note, 2026-09-26).
  if rule_row.employee_target and (person is not null or whose is not null)
     and not app_private.ranks_as_employee(state.workspace_id, whose) then
    return 'rank';
  end if;

  -- A record whose author outranks the actor today is not theirs to change;
  -- a peer's is (FB-6.7 K2, KK-87).
  if rule_row.outranked_no and whose is not null and not target_is_self then
    select role.access_class into target_access
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    where membership.workspace_id = state.workspace_id and membership.user_id = whose;
    if app_private.authz_rank(coalesce(target_access, 'employee')) > app_private.authz_rank(state.class) then
      return 'rank';
    end if;
  end if;

  if state.class in ('owner', 'admin') then
    reach := 'org';
  else
    select rule.manager_rule into reach
    from app_private.authz_scope_rules rule
    join app_private.authz_settings setting on setting.scope_model = rule.model
    where rule.scope_class = rule_row.scope_class and rule.effect = rule_row.effect;
    reach := coalesce(reach, 'none');
  end if;

  if rule_row.scope_class = 'org' then
    if reach = 'none' then
      return 'out_of_scope';
    end if;
    return null;
  end if;

  if target_locations is not null then
    places := target_locations;
    if array_position(places, null) is not null then
      return 'out_of_scope';
    end if;
    if rule_row.scope_class = 'place' and cardinality(places) <> 1 then
      return 'out_of_scope';
    end if;
    if exists (
      select 1 from unnest(places) place
      where not exists (
        select 1 from public.locations location
        where location.id = place and location.workspace_id = state.workspace_id and app_private.location_is_live(location)
      )
    ) then
      return 'out_of_scope';
    end if;
  elsif rule_row.scope_class = 'person' and (person is not null or whose is not null) then
    -- Where the person is assigned; somebody with no employee record works nowhere.
    places := coalesce((
      select array_agg(distinct assignment.location_id)
      from public.employee_location_assignments assignment
      join public.locations location on location.id = assignment.location_id
      where assignment.employee_id = person and assignment.ended_at is null
        and app_private.location_is_live(location)
    ), '{}');
  else
    return 'out_of_scope';
  end if;

  if reach = 'org' then
    return null;
  end if;
  if reach = 'none' or cardinality(places) = 0 then
    return 'out_of_scope';
  end if;
  if reach = 'any' and places && state.manages then
    return null;
  end if;
  if reach = 'all' and places <@ state.manages then
    return null;
  end if;
  return 'out_of_scope';
end;
$function$;

-- K-S3 ---------------------------------------------------------------------------
-- A role that only viewed time off loses it; none can be given it again.
delete from public.workspace_role_permissions g
where g.permission_key = 'schedule.time_off_requests.read'
  and not exists (select 1 from public.workspace_role_permissions m
                  where m.role_id = g.role_id and m.permission_key = 'schedule.time_off_requests.manage');
insert into app_private.role_permission_dependencies (permission_key, required_key)
values ('schedule.time_off_requests.read', 'schedule.time_off_requests.manage');
update app_private.authz_actions set permission_key = 'schedule.time_off_requests.manage' where key = 'requests.read';

-- R2-13: who hears which shifts an approval opened ---------------------------------
create function app_private.time_off_opened_shifts_told(actor uuid, w uuid, rid uuid, decision integer)
returns table (user_id uuid, location_name text, scheduled_date date, start_time time, end_time time)
language sql
stable
security definer
set search_path to ''
as $$
  with opened as (
   select p.location_id, l.name location_name, p.scheduled_date, p.start_time, p.end_time
   from public.time_off_assignment_releases rel
   join public.schedule_published_shifts p on p.id = rel.published_shift_id and p.workspace_id = w
   join public.locations l on l.id = p.location_id and l.workspace_id = w
   where rel.workspace_id = w and rel.request_id = rid and rel.decision_revision = decision
  ), managers as (
   select m.user_id from public.workspace_memberships m
   where m.workspace_id = w and m.status = 'active' and m.user_id is distinct from actor
    -- A manager: deciding alone is not theirs anywhere (the core, no role reading).
    and app_private.authz_reason(m.user_id, w, 'time_off.decide_alone') is not null
  )
  select mg.user_id, o.location_name, o.scheduled_date, o.start_time, o.end_time
  from managers mg join opened o
   on app_private.authz_reason(mg.user_id, w, 'schedule.edit', array[o.location_id]) is null;
$$;
revoke all on function app_private.time_off_opened_shifts_told(uuid, uuid, uuid, integer) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.time_off_notify_shifts_opened(actor uuid, w uuid, rid uuid, decision integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare fmt text; person_name text; g record;
begin
 fmt := case when (select s.time_format from public.workspace_scheduling_settings s where s.workspace_id = w) = '24h'
  then 'HH24:MI' else 'FMHH12:MI AM' end;
 select coalesce(nullif(e.preferred_name, ''), e.first_name) into person_name
  from public.schedule_time_off_requests r join public.employee_profiles e on e.id = r.employee_id and e.workspace_id = r.workspace_id
  where r.id = rid and r.workspace_id = w;
 for g in
  with told as (
   select * from app_private.time_off_opened_shifts_told(actor, w, rid, decision)
  ), per_person as (
   select t.user_id, count(*)::integer n, min(t.scheduled_date) first_day,
    array_agg(to_char(t.scheduled_date, 'Dy, Mon FMDD') || ', ' || to_char(t.start_time, fmt) || '–' || to_char(t.end_time, fmt)
     || ' (' || t.location_name || ')' order by t.scheduled_date, t.start_time, t.location_name) shift_lines
   from told t group by t.user_id
  ), worded as (
   select p.*, array_to_string(p.shift_lines[1:3], '; ')
     || case when cardinality(p.shift_lines) > 3 then '; +' || (cardinality(p.shift_lines) - 3) || ' more' else '' end lines
   from per_person p
  )
  select n, first_day, lines, array_agg(user_id order by user_id) recipients
  from worded group by n, first_day, lines
 loop
  perform public.enqueue_notification_outbox_service(w, gen_random_uuid(), 'schedule.time_off.shifts_opened', 1, actor,
   'schedule_time_off_requests', rid::text,
   jsonb_build_object('request_id', rid, 'recipient_user_ids', to_jsonb(g.recipients),
    'audience_contract', 'time_off_location_managers', 'category', 'schedule',
    'title', left(coalesce(person_name, 'A teammate') || ' is off — ' || g.n || case when g.n = 1 then ' shift is open' else ' shifts are open' end, 160),
    'body', g.lines,
    'safe_preview', 'Approved time off left shifts open.',
    'action_url', '/app/schedule?date=' || g.first_day::text,
    'group_key', 'schedule_time_off_requests:' || rid::text),
   now());
 end loop;
end;
$function$;

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
  -- One decision tells each person once (R2-13): approving a cancellation
  -- also writes on the leave it shortens, and revoking or giving back the leave
  -- closes a cancellation waiting on it; the decision's own notice says it.
  if new.metadata ? 'cancelled_intervals' or (new.action = 'revoked' and new.metadata ? 'parent_request_id') then
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
  -- The notice says how it was decided (R2-45).
  title := case
    when is_cancel then case new.action when 'approved' then 'Leave cancellation approved' when 'denied' then 'Leave cancellation declined'
      when 'expired' then 'Leave cancellation not decided in time' else 'Leave cancellation closed' end
    else case new.action when 'approved' then 'Time off approved' when 'denied' then 'Time off declined'
      when 'expired' then 'Time off not decided in time'
      when 'revoked' then case when new.actor_user_id is not distinct from requester then 'Time off withdrawn' else 'Time off revoked' end
      else 'Time-off request updated' end end;
  body := case
    when new.action = 'expired' then 'Your request was not decided in time and was declined.'
    when is_cancel and new.action = 'approved' then 'Your leave cancellation was approved. Shifts opened earlier stay open.'
    when is_cancel and new.action = 'denied' then 'Your cancellation was declined. The approved leave remains in effect.'
    when is_cancel and new.action = 'revoked' then 'Your cancellation request was closed. Review the original leave for its current status.'
    when is_cancel then 'Your leave cancellation was reviewed. Shifts opened earlier stay open.'
    when new.action = 'approved' then 'Your time-off request was approved.'
    when new.action = 'denied' then 'Your time-off request was declined.'
    when new.action = 'revoked' then 'Your approved time off was revoked.'
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
    -- Who heard which shifts the approval opened has heard of it (R2-13).
    if new.action = 'approved' and not is_cancel then
      recipients := array(select u from unnest(recipients) u where u not in (
        select t.user_id from app_private.time_off_opened_shifts_told(new.actor_user_id, new.workspace_id, r.id, (new.metadata ->> 'revision')::integer) t));
    end if;
    if cardinality(recipients) > 0 then
      perform public.enqueue_notification_outbox_service(new.workspace_id, gen_random_uuid(), 'requests.time_off.decided', 1, new.actor_user_id,
        tg_table_name, new.request_id::text,
        jsonb_build_object('correlation_id', new.id, 'request_id', new.request_id, 'request_event_id', new.id, 'request_action', new.action,
          'recipient_user_ids', to_jsonb(recipients), 'audience_contract', 'time_off_deciders', 'category', 'request',
          'title', title,
          'body', case when is_cancel then 'A leave cancellation you could decide was closed.' else 'A time-off request you could decide was closed.' end,
          'safe_preview', 'A time-off request was closed.',
          'action_url', '/app/schedule/requests?tab=time-off&request=' || new.request_id::text,
          'group_key', tg_table_name || ':' || new.request_id::text),
        new.created_at);
    end if;
  end if;
  return new;
end;
$function$;

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
 -- Whoever approved the leave: its last approval and every vote for it (R2-23);
 -- approved by the system, the managers who could decide it. Not the one
 -- shortening it and not the employee: the owner's own leave is approved by themselves.
 select coalesce(array_agg(distinct x.u order by x.u), '{}') into deciders
  from (select ev.actor_user_id u from public.schedule_time_off_events ev
        where ev.workspace_id = w and ev.request_id = parent_id and ev.action = 'approved' and ev.metadata ? 'segments'
        union all
        select v.voter_user_id from public.time_off_votes v
        where v.workspace_id = w and v.request_id = parent_id and v.verdict = 'approve'
        union all
        select d from unnest(app_private.time_off_deciders(w, parent_id, false)) d
        where exists (select 1 from public.schedule_time_off_events ev where ev.workspace_id = w and ev.request_id = parent_id
                      and ev.action = 'approved' and ev.metadata ? 'segments' and ev.actor_user_id is null)) x
  join public.workspace_memberships m on m.workspace_id = w and m.user_id = x.u and m.status = 'active'
  where x.u <> actor and x.u is distinct from employee_user;
 if cardinality(deciders) > 0 then
  perform public.enqueue_notification_outbox_service(w, gen_random_uuid(), 'requests.time_off.shortened', 1, actor,
   'schedule_time_off_requests', parent_id::text,
   jsonb_build_object('request_id', parent_id, 'recipient_user_ids', to_jsonb(deciders),
    'audience_contract', 'time_off_deciders', 'category', 'requests',
    'title', left(coalesce(employee_name, 'An employee') || '''s time off was shortened', 160),
    'body', left(lines || case when by_manager then ' is no longer time off.' else ' — they took a shift in these hours.' end, 500),
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
$function$;

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
 -- ponytail: the queue past the cursor is read whole to find the page edge; bound it by the edge's send time if one queue grows past tens of thousands of requests.
 with filtered as (
  select r.* from public.schedule_time_off_requests r join public.employee_profiles e on e.id = r.employee_id
  where can_time_off and r.workspace_id = target_workspace_id and r.employee_id = any (reached)
   and (target_location_id is null
        or exists (select 1 from public.time_off_required_locations x where x.request_id = r.id and x.location_id = target_location_id))
   and ((target_time_off_queue = 'needs_review' and r.status = 'pending') or (target_time_off_queue = 'closed' and r.status <> 'pending'))
   and (target_time_off_cursor is null or r.created_at < target_time_off_cursor)
   and (btrim(target_search) = '' or concat_ws(' ', e.first_name, e.last_name, e.preferred_name, r.reason) ilike '%' || btrim(target_search) || '%')
 ), edge as (
  -- The send time of the page's last row.
  select f.created_at from filtered f order by f.created_at desc, f.id offset target_limit - 1 limit 1
 ), page as (
  -- A page takes every request sent at its edge's time, so "Older" starts right after it.
  select f.* from filtered f where not exists (select 1 from edge) or f.created_at >= (select edge.created_at from edge)
 )
 select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'employee_id', r.employee_id,
   'employee_name', concat_ws(' ', coalesce(nullif(e.preferred_name, ''), e.first_name), e.last_name),
   'request_type', r.request_type, 'reason', r.reason,
   'cancellation', public.time_off_cancellation_context(target_workspace_id, r.id), 'status', r.status,
   'start_date', (select min(s.segment_date) from public.schedule_time_off_segments s where s.request_id = r.id),
   'end_date', (select max(s.segment_date) from public.schedule_time_off_segments s where s.request_id = r.id),
   'revision', r.revision, 'created_at', r.created_at, 'decide_by', r.decide_by,
   -- Withdrawn by the employee (R2-42); hours the system gave back (R2-52).
   'withdrawn', app_private.time_off_display_status(target_workspace_id, r.id) = 'Withdrawn',
   'shortened', public.time_off_event_is_shortening(target_workspace_id, r.id, '{}'),
   'conflict_count', public.time_off_request_assignment_count(target_workspace_id, r.id),
   'segments', public.time_off_request_periods(r.id, target_workspace_id),
   'progress', case when r.status = 'pending' then app_private.time_off_progress(get_schedule_requests_service.actor_user_id, target_workspace_id, r.id) end,
   'events', coalesce((select jsonb_agg(jsonb_build_object('id', ev.id, 'action', ev.action,
       'actor_name', case when ev.actor_user_id is null then 'System' else coalesce(nullif(up.display_name, ''), 'Team member') end,
       'note', ev.note, 'created_at', ev.created_at,
       'released_assignments', public.time_off_event_released_assignments(get_schedule_requests_service.actor_user_id, target_workspace_id, ev.id)) order by ev.created_at)
     from public.schedule_time_off_events ev left join public.user_profiles up on up.user_id = ev.actor_user_id where ev.request_id = r.id), '[]'))
   order by r.created_at desc, r.id), '[]'),
   -- "Older" only while something was sent before the edge.
   (select edge.created_at from edge where exists (select 1 from filtered f where f.created_at < edge.created_at))
 into time_rows, time_cursor
 from page r join public.employee_profiles e on e.id = r.employee_id;
 return jsonb_build_object('workspace_id', target_workspace_id,
   'time_format', (select time_format from public.workspace_scheduling_settings where workspace_id = target_workspace_id),
   'locations', locations, 'time_off_pending_count', time_count, 'time_off_next_cursor', time_cursor, 'time_off_requests', time_rows);
end;
$function$;

-- BL-507, BL-506: the deadline job ------------------------------------------------
create table app_private.time_off_sweep_failures (
  request_id uuid primary key references public.schedule_time_off_requests(id) on delete cascade,
  workspace_id uuid not null,
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  attempts integer not null default 1,
  sqlstate text not null,
  message text not null
);
comment on table app_private.time_off_sweep_failures is
  'A request the time-off deadline job could not close or remind, kept so it is seen and not only logged (BL-507).';
alter table app_private.time_off_sweep_failures enable row level security;
revoke all on app_private.time_off_sweep_failures from public, anon, authenticated, service_role;

drop function app_private.time_off_sweep();

CREATE OR REPLACE FUNCTION app_private.time_off_sweep(pass_limit integer DEFAULT 500)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  st jsonb;
  v jsonb;
  waiting uuid[];
  alone uuid[];
  fallback_due boolean;
  reminder_due boolean;
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

    fallback_due := ((st ->> 'fallback')::boolean or (st ->> 'unattended')::integer > 0) and r.fallback_notified_at is null
      and exists (select 1 from public.time_off_required_locations x where x.request_id = r.id);
    -- Twelve hours before the deadline, once; not for one sent inside them.
    reminder_due := r.reminded_at is null and r.decide_by - interval '12 hours' <= now()
      and r.created_at < r.decide_by - interval '12 hours';
    alone := app_private.time_off_alone_deciders(r.workspace_id, r.employee_id);

    -- Only an admin or the owner can decide it now: tell them once. When the
    -- reminder is due in the same pass, this one line carries it for them.
    if fallback_due then
      perform app_private.time_off_notice(r.workspace_id, r.id, 'requests.time_off.reminder',
        alone, 'time_off_fallback_deciders', 'Time off waits for an admin',
        case when reminder_due then 'No manager can decide this now. Decide before the deadline or it is declined.'
             else 'No manager can decide this now.' end);
      update public.schedule_time_off_requests set fallback_notified_at = now() where id = r.id;
      done := done + 1;
    end if;

    if reminder_due then
      st := app_private.time_off_state(r.workspace_id, r.id);
      if (st ->> 'fallback')::boolean then
        waiting := alone;
      else
        select coalesce(array_agg(distinct u order by u), '{}') into waiting
        from jsonb_array_elements(st -> 'locations') x,
             unnest(app_private.time_off_location_voters(r.workspace_id, r.employee_id, (x ->> 'id')::uuid)) u
        where x -> 'approved_by' = 'null'::jsonb;
        -- A location nobody can vote at now: an admin and the owner, who can decide it.
        if (st ->> 'unattended')::integer > 0 then
          waiting := array(select distinct u from unnest(waiting || alone) u order by u);
        end if;
      end if;
      -- An admin and the owner already have it in the line above.
      if fallback_due then
        waiting := array(select u from unnest(waiting) u where u <> all (alone) order by u);
      end if;
      perform app_private.time_off_notice(r.workspace_id, r.id, 'requests.time_off.reminder', waiting, 'time_off_deciders',
        'Time off waits for your decision', 'Decide before the deadline or it is declined.');
      update public.schedule_time_off_requests set reminded_at = now() where id = r.id;
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
  return done;
end;
$function$;

revoke all on function app_private.time_off_sweep(integer) from public, anon, authenticated, service_role;

-- BL-411, R2-55 -------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.decide_time_off_service(actor uuid, w uuid, rid uuid, verdict text, note text, expected_impact text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.schedule_time_off_requests%rowtype;
  alone_why text;
  mine uuid[];
  pictured jsonb;
  state jsonb;
  settled public.schedule_time_off_requests%rowtype;
begin
  perform public.availability_lock_workspace(w);
  -- Who may not decide here at all hears so before the request is looked up (BL-411).
  if app_private.time_off_reason(actor, w, 'time_off.decide') is distinct from 'out_of_scope' then
    perform app_private.time_off_authorize(actor, w, 'time_off.decide');
  end if;
  select * into r from public.schedule_time_off_requests where id = rid and workspace_id = w for update;
  if r.id is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.decide';
  end if;
  alone_why := app_private.time_off_reason(actor, w, 'time_off.decide_alone', r.employee_id);
  if alone_why is not null then
    if alone_why not in ('rank', 'out_of_scope') then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || alone_why, detail = 'time_off.decide';
    end if;
    select coalesce(array_agg(place order by place), '{}') into mine
    from unnest(app_private.time_off_live_locations(w, rid)) place
    where app_private.time_off_reason(actor, w, 'time_off.decide', r.employee_id, place) is null;
    if cardinality(mine) = 0 then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || alone_why, detail = 'time_off.decide';
    end if;
  end if;
  if verdict is null or verdict not in ('approve', 'deny') then raise exception 'Choose approve or deny' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(note, ''))) > 1000 then raise exception 'The note can be at most 1000 characters' using errcode = '22023'; end if;
  if r.status <> 'pending' then raise exception 'This request is already closed' using errcode = '40001'; end if;
  if r.decide_by is not null and r.decide_by <= now() then raise exception 'This request was not decided in time' using errcode = '40001'; end if;
  pictured := app_private.time_off_impact(w, rid);
  if expected_impact is distinct from pictured ->> 'fingerprint' then
    raise exception 'The shifts this time off affects have changed. Review them again' using errcode = '40001';
  end if;

  if alone_why is null then
    settled := app_private.time_off_finalize(w, rid, verdict, actor, btrim(coalesce(note, '')), true);
    return jsonb_build_object('status', settled.status, 'final', true, 'alone', true, 'remaining', 0,
      'revision', settled.revision, 'request_id', rid);
  end if;

  insert into public.time_off_votes(request_id, workspace_id, voter_user_id, verdict, note, impact)
  values (rid, w, actor, verdict, btrim(coalesce(note, '')),
    (select jsonb_object_agg(place, coalesce(pictured -> 'locations' -> place::text ->> 'fingerprint', app_private.time_off_shifts_fingerprint('[]')))
     from unnest(mine) place))
  on conflict (request_id, voter_user_id) do update
  set verdict = excluded.verdict, note = excluded.note, impact = excluded.impact, updated_at = now();

  if verdict = 'deny' then
    settled := app_private.time_off_finalize(w, rid, 'deny', actor, btrim(coalesce(note, '')), false);
    return jsonb_build_object('status', settled.status, 'final', true, 'alone', false, 'remaining', 0,
      'revision', settled.revision, 'request_id', rid);
  end if;
  state := app_private.time_off_state(w, rid);
  if (state ->> 'remaining')::integer = 0 and not (state ->> 'fallback')::boolean then
    settled := app_private.time_off_finalize(w, rid, 'approve', actor, btrim(coalesce(note, '')), false);
    return jsonb_build_object('status', settled.status, 'final', true, 'alone', false, 'remaining', 0,
      'revision', settled.revision, 'request_id', rid);
  end if;
  update public.schedule_time_off_requests set revision = revision + 1, updated_at = now() where id = rid returning * into r;
  return jsonb_build_object('status', r.status, 'final', false, 'alone', false, 'remaining', (state ->> 'remaining')::integer,
    'revision', r.revision, 'request_id', rid);
end;
$function$;

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
$function$;

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
 -- Who may not shorten time off here at all hears so before the request is looked up (BL-411).
 if app_private.time_off_reason(actor, w, 'time_off.revoke') is distinct from 'out_of_scope' then
   perform app_private.time_off_authorize(actor, w, 'time_off.revoke');
 end if;
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
  -- A malformed id is a bad request, not a server error (R2-55).
  if coalesce(p->>'segment_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   raise exception 'Choose approved hours of this time off, without overlap' using errcode='22023'; end if;
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
$function$;

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
$function$;
