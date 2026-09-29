-- FB-6.2 .6: the "no" contract where the slice leaves it.
-- BL-155: the Schedule's week list asks the core which locations it covers
--   (scope_set, schedule.read), a location the actor only manages included.
-- BL-354: Employee Hub's door says why it refuses; an unknown time-off request
--   gets the very answer a request out of reach gets (42501 authz.out_of_scope),
--   asked before anything is locked.
-- Asking for a preferred name on a record that is not one's own is out of
--   scope, whether or not the record exists (employee.request_preferred_name).

create or replace function public.list_schedule_weekly_shifts_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date,
  target_location_ids uuid[] default null::uuid[], target_draft_id uuid default null::uuid, include_live_context boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
  ) then
    raise exception 'draft not found' using errcode = 'P0002';
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
            and closure.is_all_day
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
            and closure.is_all_day
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

create or replace function public.employee_hub_actor_service(actor_user_id uuid, target_workspace_id uuid)
returns public.employee_profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  employee public.employee_profiles%rowtype;
begin
  if me.membership_id is null then
    raise exception 'active employee membership required' using errcode = '42501', hint = 'authz.not_member';
  end if;
  if me.status <> 'active' then
    raise exception 'active employee membership required' using errcode = '42501', hint = 'authz.not_active';
  end if;
  if not me.workspace_open then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.workspace_closed';
  end if;
  select * into employee from public.employee_profiles profile
  where profile.workspace_id = target_workspace_id
    and profile.user_id = actor_user_id
    and profile.archived_at is null;
  -- A member with no employee record of their own has no hub here.
  if employee.id is null then
    raise exception 'employee profile required' using errcode = '42501', hint = 'authz.out_of_scope';
  end if;
  return employee;
end;
$$;

-- The time-off request a decision is about, asked before anything is locked:
-- somebody unknown and somebody out of reach get the same answer.
create function app_private.authorize_time_off_request(actor uuid, w uuid, rid uuid, verb text, only_time_off boolean default false)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requester uuid;
  place uuid;
begin
  select r.employee_id, r.location_id into requester, place
  from public.schedule_time_off_requests r
  where r.id = rid and r.workspace_id = w and (not only_time_off or r.request_type = 'time_off');
  if not found then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.decide';
  end if;
  perform app_private.authorize_time_off_decision(actor, w, requester, place, verb);
end;
$$;
revoke all on function app_private.authorize_time_off_request(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;

create or replace function public.preview_time_off_assignment_decision_service(actor uuid, w uuid, rid uuid, expected_revision integer, action text, decisions jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare r public.schedule_time_off_requests%rowtype; approved tstzmultirange; affected jsonb; visible_shifts jsonb:='[]'; s jsonb; restricted integer:=0; fp text;
begin
 perform app_private.authorize_time_off_request(actor,w,rid,action);
 select * into r from public.schedule_time_off_requests where id=rid and workspace_id=w;
 if expected_revision is null or r.revision<>expected_revision or r.status<>'pending' then raise exception 'stale time off request' using errcode='40001'; end if;
 if action not in('approve','partial_approve') then raise exception 'Preview the approval decision before changing assignments' using errcode='22023'; end if;
 if r.request_type<>'time_off' then raise exception 'Cancellation does not change published assignments' using errcode='22023'; end if; approved:=public.time_off_proposed_approved_ranges(w,rid,action,decisions);
 affected:=public.time_off_assignment_impact(w,r.employee_id,approved);
 for s in select value from jsonb_array_elements(affected) loop
  if public.schedule_actor_can_publish_service(actor,w,(s->>'location_id')::uuid) then visible_shifts:=visible_shifts||jsonb_build_array(s);
  else restricted:=restricted+1; end if;
 end loop;
 fp:=encode(extensions.digest(convert_to(jsonb_build_object('request',rid,'revision',r.revision,'approved',public.availability_ranges_json(approved),'shifts',affected)::text,'UTF8'),'sha256'),'hex');
 return jsonb_build_object('request_id',rid,'revision',r.revision,'fingerprint',fp,'affected_shifts',visible_shifts,'restricted_count',restricted,
  'approved_intervals',public.availability_ranges_json(approved));
end $$;

create or replace function public.decide_time_off_with_assignments_service(actor uuid, w uuid, rid uuid, expected_revision integer, action text, note text,
  decisions jsonb, operation_id uuid, expected_impact text, dispositions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare r public.schedule_time_off_requests%rowtype; prior public.time_off_commands%rowtype; command jsonb; result jsonb; preview jsonb;
 affected jsonb:='[]'; s jsonb; changes jsonb:='[]'; other record; locked_id uuid;
begin
 perform app_private.authorize_time_off_request(actor,w,rid,action);
 perform public.availability_lock_workspace(w);
 select * into r from public.schedule_time_off_requests where id=rid and workspace_id=w for update;
 perform app_private.authorize_time_off_decision(actor,w,r.employee_id,r.location_id,action);
 if operation_id is null then raise exception 'A decision key is required' using errcode='22023'; end if;
 command:=jsonb_build_object('kind','assignment_decision','request_id',rid,'expected_revision',expected_revision,'action',action,'note',btrim(coalesce(note,'')),
  'decisions',decisions,'impact',expected_impact,'dispositions',dispositions);
 select * into prior from public.time_off_commands c where c.workspace_id=w and c.actor_user_id=actor and c.operation_id=decide_time_off_with_assignments_service.operation_id;
 if found then
  if prior.input->>'kind'='decision' and coalesce(dispositions,'[]'::jsonb)='[]'::jsonb and prior.input=jsonb_build_object('kind','decision','request_id',rid,
   'expected_revision',expected_revision,'action',action,'note',btrim(coalesce(note,'')),'decisions',decisions) then return prior.result; end if;
  if prior.input<>command then raise exception 'This decision key was used for a different decision' using errcode='40001'; end if;
  return prior.result;
 end if;
 if jsonb_typeof(dispositions) is distinct from 'array' then raise exception 'Review the published assignment decisions' using errcode='22023'; end if;

 if r.request_type='time_off_cancellation' then
  if expected_impact is not null or jsonb_array_length(dispositions)>0 then raise exception 'Cancellation cannot change published assignments' using errcode='22023'; end if;
  result:=public.apply_time_off_cancellation_decision(actor,w,rid,expected_revision,action,note,decisions);
  insert into public.time_off_commands(workspace_id,actor_user_id,operation_id,input,result) values(w,actor,operation_id,command,result);
  return result;
 end if;
 if action='return_to_pending' and exists(select 1 from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id=cl.request_id
  where cl.parent_request_id=rid and cr.status in('approved','partially_approved')) then raise exception 'Cancelled leave cannot be reopened; submit a new leave request' using errcode='22023'; end if;
 if action in('approve','partial_approve') then
  preview:=public.preview_time_off_assignment_decision_service(actor,w,rid,expected_revision,action,decisions);
  if (preview->>'restricted_count')::integer>0 then raise exception 'Published assignment scope denied; a manager with publishing access to every affected location must decide this request' using errcode='42501', hint='authz.out_of_scope'; end if;
  affected:=preview->'affected_shifts';
  -- Lock the concrete current snapshots and recompute after any older writer.
  for locked_id in select ps.id from public.schedule_published_shifts ps where ps.workspace_id=w and ps.id in(select (x->>'id')::uuid from jsonb_array_elements(affected) x) order by ps.id for update loop null; end loop;
  preview:=public.preview_time_off_assignment_decision_service(actor,w,rid,expected_revision,action,decisions);
  if (preview->>'restricted_count')::integer>0 then raise exception 'Published assignment scope denied' using errcode='42501', hint='authz.out_of_scope'; end if;
  affected:=preview->'affected_shifts';
  if (expected_impact is not null or jsonb_array_length(affected)>0) and expected_impact is distinct from preview->>'fingerprint' then
   raise exception 'Published assignment conflict: review the current affected shifts before approval' using errcode='40001'; end if;
  if jsonb_array_length(dispositions)<>jsonb_array_length(affected)
   or (select count(distinct (x->>'shift_id')::uuid) from jsonb_array_elements(dispositions) x)<>jsonb_array_length(dispositions)
   or exists(select 1 from jsonb_array_elements(dispositions) x where coalesce(x->>'action','')<>'release_entire_shift' or not exists(select 1 from jsonb_array_elements(affected) impacted where impacted->>'id'=((x->>'shift_id')::uuid)::text)) then
   raise exception 'Choose an explicit disposition for every affected published shift' using errcode='22023'; end if;
 elsif jsonb_array_length(dispositions)>0 then raise exception 'Only approval can change published assignments' using errcode='22023'; end if;
 result:=public.apply_time_off_period_decision(actor,w,rid,expected_revision,action,note,decisions);
 for other in select cr.id from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id=cl.request_id
  where cl.parent_request_id=rid and cr.status='pending' loop
  update public.schedule_time_off_requests set status='revoked',revision=revision+1,updated_at=now() where id=other.id;
  insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata)
   values(w,other.id,'revoked',actor,'Cancellation closed because the original leave changed. No shifts were reassigned.',jsonb_build_object('parent_request_id',rid));
 end loop;

 for s in select value from jsonb_array_elements(affected) loop
  insert into public.time_off_assignment_releases(workspace_id,request_id,decision_revision,published_shift_id,before_assignment,actor_user_id)
   values(w,rid,(result->>'revision')::integer,(s->>'id')::uuid,s,actor);
  update public.schedule_published_shifts set employee_id=null where workspace_id=w and id=(s->>'id')::uuid and employee_id=r.employee_id;
  if not found then raise exception 'Published assignment changed before release' using errcode='40001'; end if;
  changes:=changes||jsonb_build_array(s||jsonb_build_object('new_employee_id',null));
 end loop;
 if jsonb_array_length(changes)>0 then
  perform public.shift_exchange_reconcile_batch(actor,w,changes);
  for other in select c.id from public.shift_exchange_cases c where c.workspace_id=w and c.status='open'
   and exists(select 1 from jsonb_array_elements(changes) x where (x->>'source_id')::uuid in(c.offered_source_id,c.requested_source_id)) loop
   update public.shift_exchange_cases set status='invalidated',revision=revision+1,updated_at=now() where id=other.id;
   update public.shift_exchange_applications set status='invalidated',updated_at=now() where case_id=other.id and status in('invited','pending_manager');
   perform public.shift_exchange_emit(actor,w,other.id,null,'invalidated','An involved assignment was released with approved time off. Review the current schedule.');
  end loop;
  update public.schedule_time_off_events ev set metadata=ev.metadata||jsonb_build_object('released_assignments',changes)
   where ev.workspace_id=w and ev.request_id=rid and ev.metadata->>'revision'=result->>'revision' and ev.action in('approved','partially_approved');
  perform realtime.send(jsonb_build_object('workspace_id',w,'request_id',rid),'changed','shift-exchanges:'||w::text,true);
 end if;
 result:=result||jsonb_build_object('released_shift_count',jsonb_array_length(changes));
 insert into public.time_off_commands(workspace_id,actor_user_id,operation_id,input,result) values(w,actor,operation_id,command,result);
 return result;
end $$;

create or replace function public.shorten_time_off_service(actor uuid, w uuid, rid uuid, expected_revision integer, periods jsonb, note text, operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare parent public.schedule_time_off_requests%rowtype; prior public.time_off_commands%rowtype; command jsonb; result jsonb;
 p jsonb; a timestamptz; b timestamptz; span tstzrange; cut tstzmultirange:='{}';
begin
 perform app_private.authorize_time_off_request(actor,w,rid,'shorten',true);
 perform public.availability_lock_workspace(w);
 select * into parent from public.schedule_time_off_requests where id=rid and workspace_id=w and request_type='time_off' for update;
 perform app_private.authorize_time_off_decision(actor,w,parent.employee_id,parent.location_id,'shorten');
 if operation_id is null then raise exception 'A request key is required' using errcode='22023'; end if;
 command:=jsonb_build_object('kind','shorten','request_id',rid,'expected_revision',expected_revision,'periods',periods,'note',btrim(coalesce(note,'')));
 select * into prior from public.time_off_commands c where c.workspace_id=w and c.actor_user_id=actor and c.operation_id=shorten_time_off_service.operation_id;
 if found then
  if prior.input<>command then raise exception 'This request key was used for a different change' using errcode='40001'; end if;
  return prior.result;
 end if;
 if expected_revision is null or parent.revision<>expected_revision or parent.status not in('approved','partially_approved') then
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
$$;

create or replace function public.request_employee_preferred_name_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, preferred_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  employee_row public.employee_profiles%rowtype;
  approval text;
  cleaned text := btrim(coalesce(preferred_name, ''));
  request_id uuid;
  deciders uuid[];
  full_name text;
begin
  -- Only on one's own record; somebody else's and an unknown one get the same
  -- answer (authz.out_of_scope).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.request_preferred_name',
    target_person => target_employee_id);
  select * into employee_row
  from public.employee_profiles
  where id = target_employee_id
    and workspace_id = target_workspace_id
    and archived_at is null;

  if employee_row.id is null then
    raise exception 'employee not found'
      using errcode = 'P0002', hint = 'employee.not_found';
  end if;
  if char_length(cleaned) > 80 then
    raise exception 'a preferred name is at most 80 characters'
      using errcode = '22023', hint = 'employee.preferred_name.too_long';
  end if;

  -- Clearing it is always the person's own business; there is nothing for a
  -- manager to answer about a name that will not be shown.
  if cleaned = '' then
    update public.employee_preferred_name_requests
    set status = 'rejected', decided_by = actor_user_id, decided_at = now()
    where employee_id = target_employee_id and status = 'pending';
    update public.employee_profiles set preferred_name = '', updated_at = now()
    where id = target_employee_id;
    return 'cleared';
  end if;

  approval := coalesce(
    (select preferred_name_approval from public.employee_name_settings
     where workspace_id = target_workspace_id),
    'auto'
  );

  -- Asked and told: whoever the core lets decide this person's preferred name.
  -- ponytail: one core call per active member; a workspace is tens of people.
  select coalesce(array_agg(member.user_id order by member.user_id), '{}')
  into deciders
  from public.workspace_memberships member
  where member.workspace_id = target_workspace_id
    and member.status = 'active'
    and app_private.authz_reason(member.user_id, target_workspace_id,
      'employee.decide_preferred_name', null, target_employee_id) is null;

  -- Nobody ranks above the owner: with nobody to answer it, a request does
  -- not wait (KK-17).
  if cardinality(deciders) = 0 then
    approval := 'auto';
  end if;

  -- Whatever was waiting is replaced: the latest answer is the one asked for.
  update public.employee_preferred_name_requests
  set status = 'rejected', decided_by = actor_user_id, decided_at = now()
  where employee_id = target_employee_id and status = 'pending';

  insert into public.employee_preferred_name_requests (
    workspace_id, employee_id, requested_name, status, requested_by,
    decided_by, decided_at
  )
  values (
    target_workspace_id, target_employee_id, cleaned,
    case when approval = 'auto' then 'approved' else 'pending' end,
    actor_user_id,
    case when approval = 'auto' then actor_user_id end,
    case when approval = 'auto' then now() end
  )
  returning id into request_id;

  if approval = 'auto' then
    update public.employee_profiles
    set preferred_name = cleaned, updated_at = now()
    where id = target_employee_id;
  end if;

  if cardinality(deciders) > 0 then
    full_name := concat_ws(' ', employee_row.first_name, employee_row.last_name);
    perform public.enqueue_notification_outbox_service(
      target_workspace_id,
      gen_random_uuid(),
      case
        when approval = 'auto' then 'people.preferred_name.published'
        else 'people.preferred_name.review_required'
      end,
      1,
      actor_user_id,
      'employee',
      target_employee_id::text,
      jsonb_build_object(
        'employee_id', target_employee_id,
        'requested_name', cleaned,
        'request_id', request_id,
        'recipient_user_ids', to_jsonb(deciders),
        'audience_contract', 'workspace_employee_access_managers',
        'category', 'people',
        'title', case when approval = 'auto' then 'Preferred name changed' else 'Preferred name to review' end,
        'body', left(full_name || case when approval = 'auto'
          then ' now goes by "' || cleaned || '".'
          else ' asked to go by "' || cleaned || '".' end, 2000),
        'safe_preview', case when approval = 'auto'
          then 'A preferred name changed.' else 'A preferred name is waiting for review.' end,
        'action_url', '/app/employees?employeeId=' || target_employee_id::text,
        'group_key', 'employee:' || target_employee_id::text
      ),
      now()
    );
  end if;

  return case when approval = 'auto' then 'published' else 'waiting' end;
end;
$function$;
