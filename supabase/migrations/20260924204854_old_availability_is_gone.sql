-- FOUNDATION-B 5.3c: the old availability system is gone.
--
-- Since 5.3a the Schedule, Edit mode, Employee Hub -> Schedule and the time off
-- impact list read the weekly marks and the manager's private reminders; the
-- setting lives in conflict_rules.availability (5.3b). What only served the old
-- dated versions goes: its eight tables, the old check and its helpers, the old
-- request/approval flow (its API already answered 410), the publication lock
-- written on every publish, "custom work" classification, the old settings
-- columns, the schedule.availability.override permission and the
-- availability.review_required notification. availability.status_changed stays:
-- the weekly "Check your availability" notice uses it.
--
-- Readers that stay lose their old branches; the Schedule read models no longer
-- carry the employees' old "availability" field, onboarding no longer carries
-- its always-empty "availability", the default hours review stops reading the
-- old per-shift override reason, and the shared check stops
-- sending the two empty fields the old system filled (pending requests, shift
-- type restrictions). Saving scheduling settings audits every change itself;
-- the trigger that audited writes from the browser goes (the browser cannot
-- write them since stage 1). Hosted had no old-flow rows beyond seeds and
-- publication locks (2026-09-24).

-- 1. Readers that stay --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.role_default_permissions(role_class public.workspace_role)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(array_agg(key order by key), '{}'::text[]) from public.permissions where
 role_class in ('owner', 'admin')
 or (role_class = 'manager' and key in (
 'workspace.read','schedule.read','schedule.manage','schedule.publish','schedule.templates.read','schedule.templates.manage','schedule.export',
 'schedule.time_off_requests.read','schedule.time_off_requests.manage','schedule.shift_change_requests.read','schedule.shift_change_requests.manage',
 'availability.read','availability.manage','employees.read','employees.manage','employees.archive','employee_onboarding.review','announcements.read','announcements.manage','important_dates.read','important_dates.manage',
 'notifications.read','notifications.read_own','notifications.preferences.write_own'))
 or (role_class = 'employee' and employee_eligible);
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
        'end_time',to_char(shift.end_time,'HH24:MI'),'note',shift.note,'employee_id',shift.employee_id,
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
  from public.schedule_time_off_events ev where ev.request_id=request.id and ev.workspace_id=target_workspace_id and ev.action in('approved','partially_approved','denied','returned_to_pending','revoked')),'[]'), 'status',request.status::text,
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
        'job_names',coalesce((select jsonb_agg(job.name order by job.sort_order,job.name) from public.employee_job_assignments assignment join public.jobs job on job.id=assignment.job_id where assignment.employee_id=teammate.id and assignment.ended_at is null),'[]'::jsonb),
        'location_names',coalesce((select jsonb_agg(location.name order by location.sort_order,location.name) from public.employee_location_assignments assignment join public.locations location on location.id=assignment.location_id where assignment.employee_id=teammate.id and assignment.ended_at is null),'[]'::jsonb)
      ) order by teammate.last_name,teammate.first_name)
      from public.employee_profiles teammate
      where teammate.workspace_id=target_workspace_id and teammate.archived_at is null and teammate.id<>employee.id
        and exists(select 1 from public.employee_location_assignments mine join public.employee_location_assignments theirs on theirs.location_id=mine.location_id and theirs.ended_at is null where mine.employee_id=employee.id and mine.ended_at is null and theirs.employee_id=teammate.id)
    ),'[]'::jsonb)
  ) into result;
  return result;
end; $function$;

CREATE OR REPLACE FUNCTION public.bulk_delete_schedule_edit_shifts_service(actor_user_id uuid, target_workspace_id uuid, target_shift_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_session public.schedule_edit_sessions%rowtype;
  requested_count integer;
  matched_count integer;
  changed_count integer;
begin
 perform public.availability_lock_workspace(target_workspace_id);
  select count(distinct id) into requested_count
  from unnest(coalesce(target_shift_ids, array[]::uuid[])) as input(id);
  if requested_count < 1 or requested_count > 100 then
    raise exception 'valid shift ids required' using errcode = '22023';
  end if;

  select session.* into target_session
  from public.schedule_edit_sessions session
  where session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id
    and session.status = 'active'
    and session.expires_at > now()
    and exists (
      select 1
      from public.schedule_edit_session_shifts shift
      where shift.session_id = session.id
        and shift.id = any(target_shift_ids)
    )
  order by session.last_heartbeat desc
  limit 1
  for update;

  if target_session.id is null then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;

  select count(distinct shift.id) into matched_count
  from public.schedule_edit_session_shifts shift
  where shift.session_id = target_session.id
    and shift.id = any(target_shift_ids)
    and public.schedule_actor_can_manage_service(
      actor_user_id,
      target_workspace_id,
      shift.location_id
    );

  if matched_count <> requested_count then
    raise exception 'shift revision stale' using errcode = '40001';
  end if;

  update public.schedule_availability_overrides set revoked_at=now() where workspace_id=target_workspace_id and shift_id=any(target_shift_ids) and revoked_at is null;
   with draft_deletes as (
    delete from public.schedule_edit_session_shifts shift
    where shift.session_id = target_session.id
      and shift.id = any(target_shift_ids)
      and shift.source_published_shift_id is null
      and not shift.locked
    returning shift.id
  ), live_marks as (
    update public.schedule_edit_session_shifts shift
    set pending_op_type = 'delete',
        locked = true,
        revision = revision + 1,
        updated_at = now()
    where shift.session_id = target_session.id
      and shift.id = any(target_shift_ids)
      and (shift.source_published_shift_id is not null or shift.locked)
      and shift.pending_op_type is distinct from 'delete'
    returning shift.id
  )
  select count(*) into changed_count
  from (
    select id from draft_deletes
    union all
    select id from live_marks
  ) changed;

  update public.schedule_edit_sessions
  set revision = revision + 1,
      dirty = true,
      last_heartbeat = now(),
      expires_at = now() + interval '4 minutes'
  where id = target_session.id;

  return jsonb_build_object(
    'deleted_count', changed_count,
    'session', public.get_schedule_edit_session_service(
      actor_user_id,
      target_workspace_id,
      target_session.id
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_schedule_assignment_availability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s jsonb:=to_jsonb(new); prior jsonb; a jsonb; evidence jsonb; logical_id uuid; hydrated boolean:=false;
begin
 perform public.availability_lock_workspace(new.workspace_id);
 logical_id:=coalesce(s->>'source_shift_id',s->>'id')::uuid;
 s:=s||jsonb_build_object('id',logical_id);
 
 if tg_op='UPDATE' and new.employee_id is null and old.employee_id is not null then
  update public.schedule_availability_overrides set revoked_at=now() where workspace_id=new.workspace_id and shift_id=logical_id and revoked_at is null;
 end if;
 if tg_op='UPDATE' and public.schedule_availability_identity(s)=public.schedule_availability_identity(to_jsonb(old)) then
  if tg_table_name='schedule_published_shifts' then new.availability_snapshot:=old.availability_snapshot; end if;
  return new;
 end if;
 prior:=public.schedule_availability_prior_publication(new.workspace_id,s,case when tg_table_name='schedule_published_shifts' and tg_op='INSERT' then (s->>'publication_id')::uuid end);
 if prior is not null then
  if tg_table_name='schedule_published_shifts' then
   new.availability_snapshot:=coalesce(nullif(prior->'availability_snapshot','null'),jsonb_build_object(
    'status','legacy_published','original_published_shift_id',prior->>'id','original_publication_id',prior->>'publication_id',
    'message','This existing responsibility predates availability snapshots. Historical availability is not reconstructed.'));
  end if;
  return new;
 end if;
 if tg_table_name<>'schedule_published_shifts' and tg_op='INSERT' then
  -- Acquiring/recovering a draft must remain possible when its old assessment
  -- has become stale. The assignment is retained for repair, not certified.
  select exists(select 1 from public.schedule_draft_shifts x where x.workspace_id=new.workspace_id and x.id=logical_id and public.schedule_availability_identity(to_jsonb(x))=public.schedule_availability_identity(s))
    or exists(select 1 from public.schedule_edit_session_shifts x where x.workspace_id=new.workspace_id and x.id=logical_id and public.schedule_availability_identity(to_jsonb(x))=public.schedule_availability_identity(s)) into hydrated;
  if hydrated then return new; end if;
 end if;
 if new.employee_id is null then
  if tg_table_name='schedule_published_shifts' then new.availability_snapshot:=jsonb_build_object('status','unassigned'); end if;
  return new;
 end if;

 if tg_table_name='schedule_published_shifts' and nullif(current_setting('newfork.schedule_publish_scope',true),'') is not null
  and (current_setting('newfork.schedule_publish_scope',true)::jsonb->>'workspace_id')::uuid=new.workspace_id
  and exists(select 1 from public.schedule_location_publications p where p.id=(s->>'publication_id')::uuid
   and p.source_draft_id=(current_setting('newfork.schedule_publish_scope',true)::jsonb->>'draft_id')::uuid) then
  s:=s||current_setting('newfork.schedule_publish_scope',true)::jsonb;
 end if;
 if nullif(current_setting('newfork.shift_exchange_scope',true),'') is not null
  and (current_setting('newfork.shift_exchange_scope',true)::jsonb->>'workspace_id')::uuid=new.workspace_id
  and current_setting('newfork.shift_exchange_scope',true)::jsonb->'shift_ids' ? logical_id::text then
  s:=s||jsonb_build_object('_exclude_shift_ids',current_setting('newfork.shift_exchange_scope',true)::jsonb->'shift_ids');
 end if;
 a:=public.assess_weekly_shift_availability(new.workspace_id,new.employee_id,s);
 evidence:=public.schedule_availability_override(new.workspace_id,s,a);
 if tg_table_name='schedule_published_shifts' and evidence is null then
  select to_jsonb(o) into evidence from public.schedule_publication_overrides o where o.workspace_id=new.workspace_id
   and o.publication_id=new.publication_id and o.finding_code in ('availability','schedule_conflict') and o.finding_id=a->>'fingerprint'
   and logical_id=any(o.source_shift_ids) and o.employee_id=new.employee_id and o.location_id=new.location_id
   and public.schedule_actor_can_publish_service(o.actor_user_id,new.workspace_id,new.location_id) limit 1;
 end if;
 if a->>'operation'='blocked' or (tg_table_name='schedule_published_shifts' and a->>'operation'='verification_required') then
  raise exception 'Resolve availability, shift hours or approved time off before this assignment' using errcode='23514',detail=a::text;
 end if;
 if a->>'operation'='warning_requires_override' and evidence is null then
  raise exception 'A current availability acceptance is required' using errcode='23514',detail=a::text;
 end if;
 if tg_table_name='schedule_published_shifts' then
  new.availability_snapshot:=jsonb_build_object('status','assessed','captured_at',now(),'assessment',a,'override',evidence);
 elsif tg_op='UPDATE' then
  update public.schedule_availability_overrides set revoked_at=now() where workspace_id=new.workspace_id and shift_id=logical_id
   and revoked_at is null and assessment_fingerprint<>a->>'fingerprint';
 end if;
 return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.revoke_removed_assignment_availability_override()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform public.availability_lock_workspace(old.workspace_id);
 -- Save/acquire/discard copies can delete a row while its identical assignment
 -- still exists in the other store. Keep only evidence valid for retained work.
 update public.schedule_availability_overrides o set revoked_at=now()
 where o.workspace_id=old.workspace_id and o.shift_id=old.id and o.revoked_at is null
  and not exists(select 1 from public.schedule_edit_session_shifts s where s.workspace_id=o.workspace_id and s.id=o.shift_id
    and case when s.employee_id is not null then public.assess_weekly_shift_availability(s.workspace_id,s.employee_id,to_jsonb(s))->>'fingerprint'=o.assessment_fingerprint else false end)
  and not exists(select 1 from public.schedule_draft_shifts s where s.workspace_id=o.workspace_id and s.id=o.shift_id
    and case when s.employee_id is not null then public.assess_weekly_shift_availability(s.workspace_id,s.employee_id,to_jsonb(s))->>'fingerprint'=o.assessment_fingerprint else false end);

  return old;
end; $function$;

CREATE OR REPLACE FUNCTION public.list_schedule_weekly_shifts_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date, target_location_ids uuid[] DEFAULT NULL::uuid[], target_draft_id uuid DEFAULT NULL::uuid, include_live_context boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result jsonb;
begin
  if not exists (
    select 1
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    join public.workspace_role_permissions permission
      on permission.role_id = role.id and permission.workspace_id = role.workspace_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
      and role.access_class in ('owner', 'admin', 'manager')
      and permission.permission_key = 'schedule.read'
  ) then
    raise exception 'manager schedule read access required' using errcode = '42501';
  end if;

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

  with actor_membership as (
    select membership.id, membership.all_locations
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
    limit 1
  ), requested_locations as (
    select unnest(coalesce(target_location_ids, array[]::uuid[])) as id
  ), allowed_locations as (
    select location.id
    from public.locations location
    cross join actor_membership membership
    where location.workspace_id = target_workspace_id
      and location.archived_at is null
      and (
        coalesce(array_length(target_location_ids, 1), 0) = 0
        or location.id in (select id from requested_locations)
      )
      and (
        membership.all_locations
        or exists (
          select 1
          from public.membership_location_scopes scope
          where scope.membership_id = membership.id
            and scope.workspace_id = target_workspace_id
            and scope.location_id = location.id
        )
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
$function$;

CREATE OR REPLACE FUNCTION public.preview_schedule_publication_before_availability_review_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_location_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_draft public.schedule_drafts%rowtype;
  normalized_locations uuid[];
  location_payload jsonb;
  finding_payload jsonb;
  unsigned_payload jsonb;
  preview_fingerprint text;
  hard_count integer;
  soft_count integer;
begin
  select * into target_draft
  from public.schedule_drafts draft
  where draft.id = target_draft_id
    and draft.workspace_id = target_workspace_id
    and draft.archived_at is null;
  if target_draft.id is null then
    raise exception 'schedule draft not found' using errcode = 'P0002';
  end if;
  if target_draft.week_start < public.schedule_current_week_start_service(target_workspace_id) then
    return jsonb_build_object(
      'status', 'past_week_closed', 'workspace_id', target_workspace_id,
      'week_start', target_draft.week_start, 'draft_id', target_draft.id,
      'draft_revision', target_draft.revision, 'fingerprint', repeat('0', 64),
      'locations', '[]'::jsonb, 'findings', '[]'::jsonb
    );
  end if;

  select array_agg(distinct location_id order by location_id)
  into normalized_locations
  from unnest(target_location_ids) location_id;
  if coalesce(cardinality(normalized_locations), 0) = 0 then
    raise exception 'at least one publication location required' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(normalized_locations) location_id
    where not exists (
      select 1 from public.locations location
      where location.id = location_id and location.workspace_id = target_workspace_id
        and location.archived_at is null
    ) or not public.schedule_actor_can_publish_service(
      actor_user_id, target_workspace_id, location_id
    )
  ) then
    raise exception 'schedule publication scope denied' using errcode = '42501';
  end if;
  -- A draft publishes only the locations it covers; anything else would be
  -- replaced with nothing.
  if not normalized_locations <@ target_draft.location_ids then
    raise exception 'publication location is not in this draft' using errcode = '22023';
  end if;

  with selected_locations as (
    select location.id, location.name
    from public.locations location
    where location.id = any(normalized_locations)
  ), active as (
    select publication.*
    from public.schedule_location_publications publication
    where publication.workspace_id = target_workspace_id
      and publication.week_start = target_draft.week_start
      and publication.location_id = any(normalized_locations)
      and publication.status = 'current'
  ), current_shift as (
    select shift.*
    from public.schedule_published_shifts shift
    join active publication on publication.id = shift.publication_id
  ), next_shift as (
    select shift.*
    from public.schedule_draft_shifts shift
    where shift.draft_id = target_draft.id
      and shift.location_id = any(normalized_locations)
  ), comparison as (
    select location.id as location_id, location.name as location_name,
      publication.id as active_publication_id,
      publication.version_number as active_version,
      (select count(*) from current_shift shift where shift.location_id = location.id)::integer as current_shift_count,
      (select count(*) from next_shift shift where shift.location_id = location.id)::integer as next_shift_count,
      (select count(*) from next_shift next_row where next_row.location_id = location.id and not exists (
        select 1 from current_shift current_row where current_row.location_id = location.id and current_row.source_shift_id = next_row.id
      ))::integer as added,
      (select count(*) from current_shift current_row where current_row.location_id = location.id and not exists (
        select 1 from next_shift next_row where next_row.location_id = location.id and next_row.id = current_row.source_shift_id
      ))::integer as removed,
      (select count(*) from next_shift next_row join current_shift current_row
        on current_row.location_id = next_row.location_id and current_row.source_shift_id = next_row.id
        where next_row.location_id = location.id and (
          current_row.employee_id is distinct from next_row.employee_id
          or current_row.job_id is distinct from next_row.job_id
          or current_row.shift_type_id is distinct from next_row.shift_type_id
          or current_row.scheduled_date is distinct from next_row.scheduled_date
          or current_row.start_time is distinct from next_row.start_time
          or current_row.end_time is distinct from next_row.end_time
          or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
        ))::integer as updated,
      (select count(*) from next_shift next_row join current_shift current_row
        on current_row.location_id = next_row.location_id and current_row.source_shift_id = next_row.id
        where next_row.location_id = location.id and not (
          current_row.employee_id is distinct from next_row.employee_id
          or current_row.job_id is distinct from next_row.job_id
          or current_row.shift_type_id is distinct from next_row.shift_type_id
          or current_row.scheduled_date is distinct from next_row.scheduled_date
          or current_row.start_time is distinct from next_row.start_time
          or current_row.end_time is distinct from next_row.end_time
          or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
        ))::integer as unchanged,
      coalesce((
        select array_agg(distinct affected.employee_id order by affected.employee_id)
        from (
          select next_row.employee_id
          from next_shift next_row
          where next_row.location_id = location.id
            and next_row.employee_id is not null
            and not exists (
              select 1 from current_shift current_row
              where current_row.location_id = location.id
                and current_row.source_shift_id = next_row.id
            )
          union
          select next_row.employee_id
          from next_shift next_row
          join current_shift current_row
            on current_row.location_id = next_row.location_id
           and current_row.source_shift_id = next_row.id
          where next_row.location_id = location.id
            and next_row.employee_id is not null
            and (
              current_row.employee_id is distinct from next_row.employee_id
              or current_row.job_id is distinct from next_row.job_id
              or current_row.shift_type_id is distinct from next_row.shift_type_id
              or current_row.scheduled_date is distinct from next_row.scheduled_date
              or current_row.start_time is distinct from next_row.start_time
              or current_row.end_time is distinct from next_row.end_time
              or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
            )
          union
          select current_row.employee_id
          from current_shift current_row
          where current_row.location_id = location.id
            and current_row.employee_id is not null
            and not exists (
              select 1 from next_shift next_row
              where next_row.location_id = location.id
                and next_row.id = current_row.source_shift_id
            )
        ) affected
      ), '{}'::uuid[]) as affected_employee_ids
    from selected_locations location
    left join active publication on publication.location_id = location.id
  )
  select jsonb_agg(to_jsonb(comparison) order by location_name, location_id)
  into location_payload from comparison;

  with next_shift as (
    select shift.*,
      coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' ' || employee.last_name as employee_name,
      location.name as location_name,
      tsrange(
        shift.scheduled_date::timestamp + shift.start_time,
        shift.scheduled_date::timestamp + shift.end_time
          + case when shift.end_time <= shift.start_time then interval '1 day' else interval '0' end,
        '[)'
      ) as occupied
    from public.schedule_draft_shifts shift
    join public.locations location on location.id = shift.location_id
    left join public.employee_profiles employee on employee.id = shift.employee_id
    where shift.draft_id = target_draft.id and shift.location_id = any(normalized_locations)
  ), raw_findings as (
    select
      'overlap'::text as code, case when first.time_basis='explicit' and second.time_basis='explicit' then 'hard' else 'soft' end::text as severity, (first.time_basis='type_default' or second.time_basis='type_default') as overrideable,
      first.location_id, first.employee_id, first.scheduled_date,
      array[first.id, second.id]::uuid[] as shift_ids,
      first.employee_name || case when first.time_basis='type_default' or second.time_basis='type_default' then ' has overlapping reference hours on ' else ' has overlapping shifts on ' end || first.scheduled_date::text || '.' as message
    from next_shift first
    join next_shift second on second.employee_id = first.employee_id and second.id > first.id
      and first.employee_id is not null and first.time_basis in ('explicit','type_default') and second.time_basis in ('explicit','type_default') and first.occupied && second.occupied
    union all
    select
      'closed_location', 'soft', true, shift.location_id, shift.employee_id,
      shift.scheduled_date, array[shift.id]::uuid[],
      shift.location_name || ' is closed on ' || shift.scheduled_date::text || '.'
    from next_shift shift
    where exists (
      select 1 from public.schedule_closures closure
      where closure.location_id = shift.location_id
        and closure.closed_date = shift.scheduled_date and closure.is_all_day
    )
  ), findings as (
    select encode(extensions.digest(convert_to(
      code || '|' || coalesce(employee_id::text, '') || '|' || scheduled_date::text || '|' || array_to_string(shift_ids, ','),
      'UTF8'), 'sha256'), 'hex') as id, *
    from raw_findings
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'code', code, 'severity', severity, 'overrideable', overrideable,
    'message', message, 'location_id', location_id, 'employee_id', employee_id,
    'scheduled_date', scheduled_date, 'shift_ids', to_jsonb(shift_ids)
  ) order by severity, code, scheduled_date, id), '[]'::jsonb),
  count(*) filter (where severity = 'hard')::integer,
  count(*) filter (where severity = 'soft')::integer
  into finding_payload, hard_count, soft_count
  from findings;

  unsigned_payload := jsonb_build_object(
    'workspace_id', target_workspace_id,
    'week_start', target_draft.week_start,
    'draft_id', target_draft.id,
    'draft_revision', target_draft.revision,
    'locations', coalesce(location_payload, '[]'::jsonb),
    'findings', finding_payload
  );
  preview_fingerprint := encode(extensions.digest(convert_to(unsigned_payload::text, 'UTF8'), 'sha256'), 'hex');
  return unsigned_payload || jsonb_build_object(
    'status', case when hard_count > 0 then 'hard_blocked'
      when soft_count > 0 then 'override_required' else 'publish_ready' end,
    'fingerprint', preview_fingerprint
  );
end;
$function$

;
CREATE OR REPLACE FUNCTION public.preview_schedule_publication_before_availability_review_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_location_ids uuid[], target_department_ids uuid[], include_no_department boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_draft public.schedule_drafts%rowtype;
  normalized_locations uuid[];
  normalized_departments uuid[];
  effective_include_no_department boolean := coalesce(include_no_department, true);
  location_payload jsonb;
  finding_payload jsonb;
  unsigned_payload jsonb;
  preview_fingerprint text;
  hard_count integer;
  soft_count integer;
begin
  select * into target_draft
  from public.schedule_drafts draft
  where draft.id = target_draft_id
    and draft.workspace_id = target_workspace_id
    and draft.archived_at is null;
  if target_draft.id is null then
    raise exception 'schedule draft not found' using errcode = 'P0002';
  end if;
  if target_draft.week_start < public.schedule_current_week_start_service(target_workspace_id) then
    return jsonb_build_object(
      'status', 'past_week_closed', 'workspace_id', target_workspace_id,
      'week_start', target_draft.week_start, 'draft_id', target_draft.id,
      'draft_revision', target_draft.revision, 'fingerprint', repeat('0', 64),
      'locations', '[]'::jsonb, 'findings', '[]'::jsonb
    );
  end if;

  select array_agg(distinct location_id order by location_id)
  into normalized_locations
  from unnest(target_location_ids) location_id;
  if coalesce(cardinality(normalized_locations), 0) = 0 then
    raise exception 'at least one publication location required' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(normalized_locations) location_id
    where not exists (
      select 1 from public.locations location
      where location.id = location_id and location.workspace_id = target_workspace_id
        and location.archived_at is null
    ) or not public.schedule_actor_can_publish_service(
      actor_user_id, target_workspace_id, location_id
    )
  ) then
    raise exception 'schedule publication scope denied' using errcode = '42501';
  end if;
  -- A draft publishes only the locations it covers; anything else would be
  -- replaced with nothing.
  if not normalized_locations <@ target_draft.location_ids then
    raise exception 'publication location is not in this draft' using errcode = '22023';
  end if;

  if target_department_ids is not null then
    select coalesce(array_agg(distinct department.id order by department.id), '{}'::uuid[])
    into normalized_departments
    from public.departments department
    join unnest(target_department_ids) requested(id) on requested.id = department.id
    where department.workspace_id = target_workspace_id
      and department.archived_at is null;

    if cardinality(normalized_departments) = 0
      and not effective_include_no_department then
      raise exception 'invalid department publication scope' using errcode = '22023';
    end if;
  end if;

  with selected_locations as (
    select location.id, location.name
    from public.locations location
    where location.id = any(normalized_locations)
  ), active as (
    select publication.*
    from public.schedule_location_publications publication
    where publication.workspace_id = target_workspace_id
      and publication.week_start = target_draft.week_start
      and publication.location_id = any(normalized_locations)
      and publication.status = 'current'
  ), current_shift as (
    select shift.*
    from public.schedule_published_shifts shift
    join active publication on publication.id = shift.publication_id
    where public.schedule_shift_in_department_scope_service(
      shift.job_id, normalized_departments, effective_include_no_department
    )
  ), next_shift as (
    select shift.*
    from public.schedule_draft_shifts shift
    where shift.draft_id = target_draft.id
      and shift.location_id = any(normalized_locations)
      and public.schedule_shift_in_department_scope_service(
        shift.job_id, normalized_departments, effective_include_no_department
      )
  ), comparison as (
    select location.id as location_id, location.name as location_name,
      publication.id as active_publication_id,
      publication.version_number as active_version,
      (select count(*) from current_shift shift where shift.location_id = location.id)::integer as current_shift_count,
      (select count(*) from next_shift shift where shift.location_id = location.id)::integer as next_shift_count,
      (select count(*) from next_shift next_row where next_row.location_id = location.id and not exists (
        select 1 from current_shift current_row where current_row.location_id = location.id and current_row.source_shift_id = next_row.id
      ))::integer as added,
      (select count(*) from current_shift current_row where current_row.location_id = location.id and not exists (
        select 1 from next_shift next_row where next_row.location_id = location.id and next_row.id = current_row.source_shift_id
      ))::integer as removed,
      (select count(*) from next_shift next_row join current_shift current_row
        on current_row.location_id = next_row.location_id and current_row.source_shift_id = next_row.id
        where next_row.location_id = location.id and (
          current_row.employee_id is distinct from next_row.employee_id
          or current_row.job_id is distinct from next_row.job_id
          or current_row.shift_type_id is distinct from next_row.shift_type_id
          or current_row.scheduled_date is distinct from next_row.scheduled_date
          or current_row.start_time is distinct from next_row.start_time
          or current_row.end_time is distinct from next_row.end_time
          or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
        ))::integer as updated,
      (select count(*) from next_shift next_row join current_shift current_row
        on current_row.location_id = next_row.location_id and current_row.source_shift_id = next_row.id
        where next_row.location_id = location.id and not (
          current_row.employee_id is distinct from next_row.employee_id
          or current_row.job_id is distinct from next_row.job_id
          or current_row.shift_type_id is distinct from next_row.shift_type_id
          or current_row.scheduled_date is distinct from next_row.scheduled_date
          or current_row.start_time is distinct from next_row.start_time
          or current_row.end_time is distinct from next_row.end_time
          or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
        ))::integer as unchanged,
      coalesce((
        select array_agg(distinct affected.employee_id order by affected.employee_id)
        from (
          select next_row.employee_id
          from next_shift next_row
          where next_row.location_id = location.id
            and next_row.employee_id is not null
            and not exists (
              select 1 from current_shift current_row
              where current_row.location_id = location.id
                and current_row.source_shift_id = next_row.id
            )
          union
          select next_row.employee_id
          from next_shift next_row
          join current_shift current_row
            on current_row.location_id = next_row.location_id
           and current_row.source_shift_id = next_row.id
          where next_row.location_id = location.id
            and next_row.employee_id is not null
            and (
              current_row.employee_id is distinct from next_row.employee_id
              or current_row.job_id is distinct from next_row.job_id
              or current_row.shift_type_id is distinct from next_row.shift_type_id
              or current_row.scheduled_date is distinct from next_row.scheduled_date
              or current_row.start_time is distinct from next_row.start_time
              or current_row.end_time is distinct from next_row.end_time
              or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
            )
          union
          select current_row.employee_id
          from current_shift current_row
          where current_row.location_id = location.id
            and current_row.employee_id is not null
            and not exists (
              select 1 from next_shift next_row
              where next_row.location_id = location.id
                and next_row.id = current_row.source_shift_id
            )
        ) affected
      ), '{}'::uuid[]) as affected_employee_ids
    from selected_locations location
    left join active publication on publication.location_id = location.id
  )
  select jsonb_agg(to_jsonb(comparison) order by location_name, location_id)
  into location_payload from comparison;

  with next_shift as (
    select shift.*,
      coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' ' || employee.last_name as employee_name,
      location.name as location_name,
      tsrange(
        shift.scheduled_date::timestamp + shift.start_time,
        shift.scheduled_date::timestamp + shift.end_time
          + case when shift.end_time <= shift.start_time then interval '1 day' else interval '0' end,
        '[)'
      ) as occupied
    from public.schedule_draft_shifts shift
    join public.locations location on location.id = shift.location_id
    left join public.employee_profiles employee on employee.id = shift.employee_id
    where shift.draft_id = target_draft.id
      and shift.location_id = any(normalized_locations)
      and public.schedule_shift_in_department_scope_service(
        shift.job_id, normalized_departments, effective_include_no_department
      )
  ), raw_findings as (
    select
      'overlap'::text as code, case when first.time_basis='explicit' and second.time_basis='explicit' then 'hard' else 'soft' end::text as severity, (first.time_basis='type_default' or second.time_basis='type_default') as overrideable,
      first.location_id, first.employee_id, first.scheduled_date,
      array[first.id, second.id]::uuid[] as shift_ids,
      first.employee_name || case when first.time_basis='type_default' or second.time_basis='type_default' then ' has overlapping reference hours on ' else ' has overlapping shifts on ' end || first.scheduled_date::text || '.' as message
    from next_shift first
    join next_shift second on second.employee_id = first.employee_id and second.id > first.id
      and first.employee_id is not null and first.time_basis in ('explicit','type_default') and second.time_basis in ('explicit','type_default') and first.occupied && second.occupied
    union all
    select
      'closed_location', 'soft', true, shift.location_id, shift.employee_id,
      shift.scheduled_date, array[shift.id]::uuid[],
      shift.location_name || ' is closed on ' || shift.scheduled_date::text || '.'
    from next_shift shift
    where exists (
      select 1 from public.schedule_closures closure
      where closure.location_id = shift.location_id
        and closure.closed_date = shift.scheduled_date and closure.is_all_day
    )
  ), findings as (
    select encode(extensions.digest(convert_to(
      code || '|' || coalesce(employee_id::text, '') || '|' || scheduled_date::text || '|' || array_to_string(shift_ids, ','),
      'UTF8'), 'sha256'), 'hex') as id, *
    from raw_findings
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'code', code, 'severity', severity, 'overrideable', overrideable,
    'message', message, 'location_id', location_id, 'employee_id', employee_id,
    'scheduled_date', scheduled_date, 'shift_ids', to_jsonb(shift_ids)
  ) order by severity, code, scheduled_date, id), '[]'::jsonb),
  count(*) filter (where severity = 'hard')::integer,
  count(*) filter (where severity = 'soft')::integer
  into finding_payload, hard_count, soft_count
  from findings;

  unsigned_payload := jsonb_build_object(
    'workspace_id', target_workspace_id,
    'week_start', target_draft.week_start,
    'draft_id', target_draft.id,
    'draft_revision', target_draft.revision,
    'locations', coalesce(location_payload, '[]'::jsonb),
    'findings', finding_payload
  );
  preview_fingerprint := encode(extensions.digest(convert_to(unsigned_payload::text, 'UTF8'), 'sha256'), 'hex');
  return unsigned_payload || jsonb_build_object(
    'status', case when hard_count > 0 then 'hard_blocked'
      when soft_count > 0 then 'override_required' else 'publish_ready' end,
    'fingerprint', preview_fingerprint
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_scheduling_settings_service(actor_user_id uuid, target_workspace_id uuid, settings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare previous public.workspace_scheduling_settings; proposed public.workspace_scheduling_settings; saved public.workspace_scheduling_settings;
 conflict_keys text[]:=array['conflict_rules','conflict_rules_revision','minimum_travel_minutes','minimum_rest_minutes'];
begin
 if jsonb_typeof(settings) is distinct from 'object' then raise exception 'Valid settings required' using errcode='22023'; end if;
 if settings ?| conflict_keys and not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.conflict_rules.manage') then
  raise exception 'Conflict settings access denied' using errcode='42501';
 end if;
 if settings-conflict_keys<>'{}'::jsonb and not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'settings.schedule_rules.manage') then
  raise exception 'Scheduling settings access denied' using errcode='42501';
 end if;
 if settings='{}'::jsonb then raise exception 'Settings are required' using errcode='22023'; end if;
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
  minimum_rest_minutes=proposed.minimum_rest_minutes,conflict_rules=proposed.conflict_rules,updated_at=now()
 where workspace_id=target_workspace_id returning * into saved;
 if (to_jsonb(previous)-'updated_at') is distinct from (to_jsonb(saved)-'updated_at') then
  insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata)
  values(target_workspace_id,actor_user_id,'scheduling.settings_updated','scheduling_settings',target_workspace_id::text,
   jsonb_build_object('before',to_jsonb(previous),'after',to_jsonb(saved)));
 end if;
 return to_jsonb(saved);
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_schedule_conflict_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.conflict_rules:=jsonb_build_object('document_required','confirm','document_conditional_grace','warn','document_conditional_overdue','confirm')
   ||case when tg_op='UPDATE' then old.conflict_rules else '{}'::jsonb end||new.conflict_rules;
 
 if tg_op='UPDATE' and auth.uid() is not null and (new.conflict_rules,new.minimum_travel_minutes,new.minimum_rest_minutes)
   is distinct from (old.conflict_rules,old.minimum_travel_minutes,old.minimum_rest_minutes)
   and not public.workspace_has_permission(new.workspace_id,'schedule.conflict_rules.manage') then
   raise exception 'Conflict settings access denied' using errcode='42501';
  end if;
 if tg_op='UPDATE' then
  new.conflict_rules_revision:=old.conflict_rules_revision+case when (new.conflict_rules,new.minimum_travel_minutes,new.minimum_rest_minutes)
   is distinct from (old.conflict_rules,old.minimum_travel_minutes,old.minimum_rest_minutes) then 1 else 0 end;
 end if;
 if exists(select 1 from jsonb_each(new.conflict_rules) rule where jsonb_typeof(rule.value)<>'string') then
  raise exception 'Conflict rules must contain valid actions' using errcode='22023';
 end if;
 return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.version_weekly_preference_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if (new.availability_input_mode,new.availability_onboarding_required)
  is distinct from (old.availability_input_mode,old.availability_onboarding_required) then
  if auth.uid() is not null then raise exception 'Use Availability settings to save these changes' using errcode='42501'; end if;
  new.availability_preferences_revision:=old.availability_preferences_revision+1;
 else new.availability_preferences_revision:=old.availability_preferences_revision; end if;
 return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.weekly_preference_settings_read_service(actor uuid, w uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare settings public.workspace_scheduling_settings%rowtype; can_edit boolean; missing jsonb;
begin
 if not exists(select 1 from public.workspace_memberships where workspace_id=w and user_id=actor and status in ('active','pending_activation')) then
  raise exception 'Organization membership required' using errcode='42501'; end if;
 select public.service_actor_has_permission(actor,w,'settings.schedule_rules.manage') into can_edit;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 if not found then raise exception 'Availability settings not found' using errcode='P0002'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by sort_order,name,id),'[]') into missing
  from public.shift_types where workspace_id=w and archived_at is null and deleted_at is null
   and (default_start_time is null or default_end_time is null or default_start_time=default_end_time or default_start_time='24:00'::time);
 return jsonb_build_object('settings',jsonb_build_object('input_mode',settings.availability_input_mode,
  'onboarding_required',settings.availability_onboarding_required,'revision',settings.availability_preferences_revision),
  'can_edit',can_edit,'missing_shift_types',missing);
end; $function$;

CREATE OR REPLACE FUNCTION public.weekly_preferences_read_service(actor uuid, w uuid, emp uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare employee public.employee_profiles%rowtype; settings public.workspace_scheduling_settings%rowtype;
 own_record boolean; can_manage boolean; can_view_manager boolean; employee_record jsonb; manager_record jsonb; types jsonb; selected_ids uuid[];
begin
 select * into employee from public.employee_profiles e where e.workspace_id=w and (e.id=emp or (emp is null and e.user_id=actor)) and e.archived_at is null;
 if employee.id is null then raise exception 'Employee not found' using errcode='42501'; end if;
 own_record:=employee.user_id=actor and exists(select 1 from public.workspace_memberships m where m.workspace_id=w and m.user_id=actor and m.status in ('active','pending_activation'));
 can_manage:=public.weekly_preference_manager_scope(actor,w,employee.id,'availability.manage');
 can_view_manager:=can_manage or public.weekly_preference_manager_scope(actor,w,employee.id,'availability.read');
 if not coalesce(own_record,false) and not can_view_manager then raise exception 'Employee access required' using errcode='42501'; end if;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 if settings.workspace_id is null then raise exception 'Scheduling settings unavailable' using errcode='P0002'; end if;
 select jsonb_build_object('revision',p.revision,'submitted',true,'updated_at',p.updated_at,'preference',p.preference) into employee_record
  from public.employee_weekly_preferences p where p.workspace_id=w and p.employee_id=employee.id;
 employee_record:=coalesce(employee_record,jsonb_build_object('revision',0,'submitted',false,'updated_at',null,'preference',public.empty_weekly_preference(settings.availability_input_mode)));
 if can_view_manager then
  select jsonb_build_object('revision',p.revision,'submitted',true,'updated_at',p.updated_at,'preference',p.preference,'enabled',p.enabled,'notes',to_jsonb(p.notes)) into manager_record
   from public.manager_weekly_reminders p where p.workspace_id=w and p.employee_id=employee.id;
  manager_record:=coalesce(manager_record,jsonb_build_object('revision',0,'submitted',false,'updated_at',null,'preference',public.empty_weekly_preference(settings.availability_input_mode),'enabled',true,'notes',jsonb_build_array('','','','','','','')));
 end if;
 -- Include fallback names only for records this actor can read. Reminder-only
 -- selections must not be inferred from the employee's catalog response.
 select coalesce(array_agg(distinct id::uuid),'{}') into selected_ids
 from jsonb_array_elements((employee_record->'preference'->'days')||coalesce(manager_record->'preference'->'days','[]')) day
 cross join lateral jsonb_array_elements_text(day->'shift_type_ids') id;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'start_time',to_char(start_time,'HH24:MI'),'end_time',to_char(end_time,'HH24:MI'),
  'archived',archived,'selectable',selectable) order by sort_order,name,id),'[]') into types from (
  select t.id,t.name,t.default_start_time start_time,t.default_end_time end_time,false archived,
   (t.default_start_time is not null and t.default_end_time is not null and t.default_start_time<>t.default_end_time) selectable,t.sort_order
  from public.shift_types t where t.workspace_id=w and t.archived_at is null and t.deleted_at is null
  union all
  select d.shift_type_id,d.name,d.start_time,d.end_time,true,false,2147483647 from public.weekly_preference_type_defaults d
  where d.workspace_id=w and d.shift_type_id=any(selected_ids) and not exists(select 1 from public.shift_types t where t.workspace_id=w and t.id=d.shift_type_id and t.archived_at is null and t.deleted_at is null)
 ) catalog;
 return jsonb_build_object('employee_id',employee.id,'employee_name',concat_ws(' ',coalesce(nullif(employee.preferred_name,''),employee.first_name),employee.last_name),
  'can_edit_employee',coalesce(own_record,false),'can_manage',can_manage,
  'settings',jsonb_build_object('input_mode',settings.availability_input_mode,
   'onboarding_required',settings.availability_onboarding_required,'revision',settings.availability_preferences_revision),
  'employee',employee_record,'manager',manager_record,'shift_types',types,'time_format',settings.time_format);
end; $function$;

CREATE OR REPLACE FUNCTION public.weekly_preference_settings_save_service(actor uuid, w uuid, command jsonb, request_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare model jsonb; prior jsonb; stored public.weekly_preference_commands%rowtype;
 envelope jsonb:=jsonb_build_object('kind','settings','value',command); event uuid:=gen_random_uuid(); recipients uuid[];
begin
 perform public.availability_lock_workspace(w);
 model:=public.weekly_preference_settings_read_service(actor,w);
 if not (model->>'can_edit')::boolean then raise exception 'Schedule rules edit access required' using errcode='42501'; end if;
 if request_key is null then raise exception 'A save key is required' using errcode='22023'; end if;
 select * into stored from public.weekly_preference_commands q where q.workspace_id=w and q.actor_user_id=actor and q.request_key=weekly_preference_settings_save_service.request_key;
 if found then
  if stored.command<>envelope then raise exception 'Idempotency key was used for another save' using errcode='22023'; end if;
  return model;
 end if;
 if jsonb_typeof(command) is distinct from 'object' or command->>'input_mode' is null or command->>'input_mode' not in ('time_range','shift_type')
  or jsonb_typeof(command->'onboarding_required') is distinct from 'boolean'
  or jsonb_typeof(command->'expected_revision') is distinct from 'number' or (command->>'expected_revision') !~ '^[0-9]+$' then
  raise exception 'Choose valid availability settings' using errcode='22023'; end if;
 perform 1 from public.workspace_scheduling_settings where workspace_id=w for update;
 model:=public.weekly_preference_settings_read_service(actor,w); prior:=model->'settings';
 if (command->>'expected_revision')::integer is distinct from (prior->>'revision')::integer then
  raise exception 'Availability settings changed. Reload the latest settings before saving.' using errcode='40001'; end if;
 if command->>'input_mode'='shift_type' and jsonb_array_length(model->'missing_shift_types')>0 then
  raise exception 'Complete default hours for all active shift types before using shift type availability' using errcode='22023',detail=(model->'missing_shift_types')::text; end if;
 if (command-'expected_revision') is distinct from (prior-'revision') then
  update public.workspace_scheduling_settings set availability_input_mode=command->>'input_mode',
   availability_onboarding_required=(command->>'onboarding_required')::boolean,updated_at=now() where workspace_id=w;
  model:=public.weekly_preference_settings_read_service(actor,w);
  insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata)
   values(w,actor,'availability.settings_updated','scheduling_settings',w::text,jsonb_build_object('before',prior,'after',model->'settings'));
  if prior->>'input_mode' is distinct from command->>'input_mode' then
   -- Read who is told before converting: afterwards every week is in the new mode.
   select coalesce(array_agg(distinct e.user_id),'{}') into recipients from public.employee_weekly_preferences p
    join public.employee_profiles e on e.id=p.employee_id and e.workspace_id=p.workspace_id
    join public.workspace_memberships m on m.workspace_id=e.workspace_id and m.user_id=e.user_id and m.status in ('active','pending_activation')
    where p.workspace_id=w and e.archived_at is null and p.preference->>'input_mode'<>command->>'input_mode';
   with history as (
    insert into public.weekly_preference_events(workspace_id,employee_id,source,actor_user_id,before_record,after_record)
    select w,p.employee_id,'employee',actor,jsonb_build_object('revision',p.revision,'preference',p.preference),
     jsonb_build_object('revision',p.revision+1,'preference',public.weekly_preference_convert(w,p.preference,command->>'input_mode'))
    from public.employee_weekly_preferences p where p.workspace_id=w and p.preference->>'input_mode'<>command->>'input_mode'
    returning employee_id,after_record)
   update public.employee_weekly_preferences p set preference=h.after_record->'preference',revision=p.revision+1,updated_by=actor,updated_at=now()
    from history h where p.workspace_id=w and p.employee_id=h.employee_id;
   with history as (
    insert into public.weekly_preference_events(workspace_id,employee_id,source,actor_user_id,before_record,after_record)
    select w,p.employee_id,'manager',actor,jsonb_build_object('revision',p.revision,'preference',p.preference),
     jsonb_build_object('revision',p.revision+1,'preference',public.weekly_preference_convert(w,p.preference,command->>'input_mode'))
    from public.manager_weekly_reminders p where p.workspace_id=w and p.preference->>'input_mode'<>command->>'input_mode'
    returning employee_id,after_record)
   update public.manager_weekly_reminders p set preference=h.after_record->'preference',revision=p.revision+1,updated_by=actor,updated_at=now()
    from history h where p.workspace_id=w and p.employee_id=h.employee_id;
   perform public.enqueue_notification_outbox_service(w,event,'availability.status_changed',1,actor,'availability_settings',w::text,
    jsonb_build_object('recipient_user_ids',to_jsonb(recipients),'audience_contract','availability_scoped_recipients','category','request',
     'title','Check your availability','body','Your organization changed how availability is entered. Your saved week was converted; check that it is still right.',
     'safe_preview','Availability entry settings changed.','action_url','/app/employee-hub/my-availability',
     'input_mode',command->>'input_mode','group_key','availability-settings:'||w::text),now());
  end if;
 end if;
 insert into public.weekly_preference_commands(workspace_id,actor_user_id,request_key,command,result) values(w,actor,request_key,envelope,'{}');
 return model;
end; $function$;

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
 conflict_severity text; rule_severity text; rule jsonb; annotated jsonb:='[]';
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
   and req.status in('approved','partially_approved') and seg.status='approved'
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
 -- The employee's own marks follow the workspace setting; a manager's private
 -- reminder is always soft, whatever the setting (user decision 2026-09-24).
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
   if not exists(select 1 from public.employee_profiles where workspace_id=w and id=emp and archived_at is null and not is_excluded_from_schedule and (start_date is null or start_date<=day)) then
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
   when 'availability' then case when rule->>'source'='reminder' then 'confirm' else settings.conflict_rules->>'availability' end
   when 'approved_time_off' then settings.conflict_rules->>'approved_time_off'
   when 'closed_location' then settings.conflict_rules->>'closed_location'
   when 'minimum_travel' then settings.conflict_rules->>'minimum_travel'
   when 'minimum_rest' then settings.conflict_rules->>'minimum_rest' when 'document_required' then settings.conflict_rules->>'document_required' when 'document_conditional_grace' then settings.conflict_rules->>'document_conditional_grace' when 'document_conditional_overdue' then settings.conflict_rules->>'document_conditional_overdue'
   when 'time_source_unresolved' then 'confirm'
   else 'block' end;
  if array_position(array['allow','warn','confirm','block'],rule_severity)>array_position(array['allow','warn','confirm','block'],conflict_severity) then conflict_severity:=rule_severity; end if;
  if rule_severity<>'allow' then annotated:=annotated||jsonb_build_array(rule||jsonb_build_object('severity',rule_severity)); end if;
 end loop;
 reasons:=annotated;
 operation:=case conflict_severity when 'block' then 'blocked' when 'allow' then 'allowed' else 'warning_requires_override' end;
 -- Revision counters, manager notes and unrelated weekdays/settings are not
 -- conflict identity. The adapters use warning_policy to decide warn/confirm.
 fingerprint_payload:=jsonb_build_object('workspace_id',w,'employee_id',emp,
  'assignment',jsonb_build_object('id',coalesce(shift->>'source_shift_id',shift->>'id'),'location_id',loc,'date',day),
  'intervals',public.availability_ranges_json(case when span is null then '{}'::tstzmultirange else tstzmultirange(span) end),
  'unavailable',public.availability_ranges_json(unavailable),'leave',public.availability_ranges_json(leave_ranges),
  'warning_policy',case when conflict_severity='confirm' then 'confirm' else 'warn' end,'operation',operation,
  'conflict_rules',settings.conflict_rules,'minimum_travel_minutes',settings.minimum_travel_minutes,'minimum_rest_minutes',settings.minimum_rest_minutes,'reasons',reasons);
 return jsonb_build_object('coverage',coverage,'operation',operation,'time_basis',basis,'timezone',zone_name,'preference_timezone',preference_zone,
  'assessment_scope',case when span is null then 'calendar_day' else 'shift_interval' end,
  'intervals',public.availability_ranges_json(case when span is null then '{}'::tstzmultirange else tstzmultirange(span) end),
  'available_intervals',case when span is null then '[]'::jsonb else public.availability_ranges_json(remaining) end,
  'unavailable_intervals',public.availability_ranges_json(unavailable+leave_ranges),
  'unknown_intervals',case when span is null then public.availability_ranges_json(tstzmultirange(day_span)) else '[]'::jsonb end,
  'employee_intervals',capacity->'employee_intervals','manager_intervals',capacity->'manager_intervals',
  'has_availability_conflict',span is not null and not isempty(unavailable),'conflict_severity',conflict_severity,
  'warning_policy',case when conflict_severity='confirm' then 'confirm' else 'warn' end,
  'leave',leave_evidence,'reasons',reasons,
  'policy_revision',settings.availability_preferences_revision,
  'fold_resolution',case when ambiguous_clock then 'post_transition_offset' else null end,
  'assessment_minutes',case when span is null then null else extract(epoch from upper(span)-lower(span))/60 end,
  'fingerprint',encode(extensions.digest(convert_to(fingerprint_payload::text,'UTF8'),'sha256'),'hex'));
end; $function$;

CREATE OR REPLACE FUNCTION public.get_employee_onboarding_service(target_user_id uuid, target_workspace_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_case public.employee_onboarding_cases%rowtype;
  employee public.employee_profiles%rowtype;
  membership public.workspace_memberships%rowtype;
  profile jsonb;
  requirements jsonb;
  completed_count integer;
  total_count integer;
  first_path text;
begin
  perform public.initialize_employee_onboarding_service(target_user_id, target_workspace_id);
  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  where onboarding.id = app_private.employee_onboarding_case_id(target_user_id, target_workspace_id);
  if target_case.id is null then
    raise exception 'employee onboarding is unavailable' using errcode = 'P0002';
  end if;
  select * into employee from public.employee_profiles where id = target_case.employee_id;
  select * into membership from public.workspace_memberships where id = target_case.membership_id;

  select to_jsonb(private_profile) - 'created_at' - 'updated_at' - 'employee_id' - 'workspace_id'
  into profile from public.employee_private_profiles private_profile
  where private_profile.employee_id = employee.id;
  profile := coalesce(
    profile,
    jsonb_build_object(
      'legal_first_name', employee.first_name,
      'legal_last_name', employee.last_name
    )
  );


  select coalesce(jsonb_agg(jsonb_build_object(
    'id', requirement.id,
    'kind', requirement.kind,
    'title', requirement.title,
    'description', requirement.description,
    'status', requirement.status,
    'required', requirement.required,'document_mode',requirement.lifecycle_settings->>'mode', 'conditional_reason',requirement.conditional_reason,
    'blocks_activation', requirement.blocks_activation,
    'requires_review', requirement.requires_review,
    'sort_order', requirement.sort_order,
    'source_id', requirement.source_id,
    'accepted_formats', coalesce(requirement.source_snapshot->'accepted_formats', '[]'::jsonb),
    'content_text', requirement.source_snapshot->>'content_text',
    'content_digest', requirement.source_snapshot->>'content_digest',
    'intent_statement', requirement.source_snapshot->>'intent_statement',
    'rejection_reason', requirement.rejection_reason
  ) order by requirement.sort_order, requirement.id), '[]'::jsonb),
  count(*) filter (where requirement.required or (requirement.kind='document' and requirement.lifecycle_settings->>'mode'='conditional')),
  count(*) filter (where (requirement.required and requirement.status in ('completed', 'awaiting_review')) or (requirement.kind='document' and requirement.lifecycle_settings->>'mode'='conditional' and not app_private.document_initial_action_missing(requirement)))
  into requirements, total_count, completed_count
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id and requirement.status <> 'superseded' and requirement.lifecycle_retired_at is null and (requirement.kind<>'document' or (not requirement.lifecycle_exempt and requirement.lifecycle_closed_at is null));

  select case requirement.kind
    when 'profile' then '/welcome/profile'
    when 'ssn' then '/welcome/review'
    when 'document' then '/welcome/documents/' || requirement.id
    when 'acknowledgement' then '/welcome/acknowledgements/' || requirement.id
    when 'availability' then '/welcome/availability'
  end into first_path
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id
    and (requirement.required or app_private.document_initial_action_missing(requirement))
    and requirement.status in ('not_started', 'in_progress', 'rejected', 'manual_follow_up')
  order by case when requirement.status = 'rejected' then 0 else 1 end,
    requirement.sort_order, requirement.id
  limit 1;
  first_path := coalesce(first_path,
    case when target_case.status = 'approved' then '/app/employee-hub' else '/welcome/review' end);

  return jsonb_build_object(
    'case_id', target_case.id,
    'workspace_id', target_case.workspace_id,
    'workspace_name', (select name from public.workspaces where id = target_case.workspace_id),
    'employee_id', employee.id,
    'employee_name', concat_ws(' ', employee.first_name, employee.last_name),
    'membership_id', membership.id,
    'membership_status', membership.status,
    'case_status', target_case.status,
    'revision', target_case.revision,
    'progress_completed', completed_count,
    'progress_total', total_count,
    'first_actionable_path', first_path,
    'ssn_status', jsonb_build_object(
      'present', false,
      'last_four', null
    ),
    'profile', profile,
    'assignments', jsonb_build_object(
      'locations', coalesce((select jsonb_agg(location.name order by assignment.is_primary desc, location.name)
        from public.employee_location_assignments assignment join public.locations location on location.id = assignment.location_id
        where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
      'jobs', coalesce((select jsonb_agg(job.name order by assignment.is_primary desc, job.name)
        from public.employee_job_assignments assignment join public.jobs job on job.id = assignment.job_id
        where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb)
    ),
    'requirements', requirements
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.preview_schedule_default_hours_service(actor uuid, w uuid, sid uuid, command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare session public.schedule_edit_sessions%rowtype; shift record; proposed jsonb; before_a jsonb; after_a jsonb;
 rows jsonb:='[]'; evidence jsonb:='[]'; row_value jsonb; peers jsonb; before_count integer; after_count integer; unknown_count integer;
 original_span tstzrange; proposed_span tstzrange; reason text; can_override boolean; fingerprint text;
 ids uuid[]; starts date; ends date; changed integer:=0; blocked integer:=0;
begin
 if jsonb_typeof(command) is distinct from 'object' or jsonb_typeof(command->'shift_ids') is distinct from 'array'
  or jsonb_array_length(command->'shift_ids') not between 1 and 200 then raise exception 'Choose 1 to 200 shifts to review' using errcode='22023'; end if;
 select array_agg(value::uuid order by value::uuid) into ids from jsonb_array_elements_text(command->'shift_ids');
 if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Choose each shift once' using errcode='22023'; end if;
 select * into session from public.schedule_edit_sessions where workspace_id=w and id=sid;
 if session.id is null or session.holder_user_id is distinct from actor then raise exception 'Edit session not found' using errcode='42501'; end if;
 if session.status<>'active' or session.expires_at<=now() or session.revision is distinct from (command->>'expected_session_revision')::integer then
  raise exception 'Schedule editing changed; reopen the review' using errcode='40001'; end if;
 starts:=(command->>'starts_on')::date; ends:=(command->>'ends_on')::date;
 if starts is null or ends is null or starts<session.week_start or ends>session.week_start+6 or ends<starts then
  raise exception 'Choose dates within this schedule week' using errcode='22023'; end if;
 if (select count(*) from public.schedule_edit_session_shifts s where s.workspace_id=w and s.session_id=sid and s.id=any(ids)
  and s.scheduled_date between starts and ends and coalesce(s.pending_op_type,'')<>'delete')<>cardinality(ids) then
  raise exception 'Selected shifts changed or are outside these dates' using errcode='40001'; end if;
 if exists(select 1 from public.schedule_edit_session_shifts s where s.workspace_id=w and s.session_id=sid and s.id=any(ids)
  and not public.schedule_actor_can_manage_service(actor,w,s.location_id)) then raise exception 'Schedule location access denied' using errcode='42501'; end if;
 for shift in select s.*,to_jsonb(s) payload,t.default_revision,t.default_start_time,t.default_end_time,t.archived_at type_archived,
  t.name type_name,l.name location_name,l.archived_at location_archived,j.archived_at job_archived,
  coalesce(nullif(concat_ws(' ',coalesce(nullif(e.preferred_name,''),e.first_name),e.last_name),''),'Open shift') employee_name,
  l.timezone location_timezone from public.schedule_edit_session_shifts s
  join public.locations l on l.id=s.location_id and l.workspace_id=w
  join public.jobs j on j.id=s.job_id and j.workspace_id=w
  left join public.shift_types t on t.id=s.shift_type_id and t.workspace_id=w
  left join public.employee_profiles e on e.id=s.employee_id and e.workspace_id=w
  where s.workspace_id=w and s.session_id=sid and s.id=any(ids) order by s.scheduled_date,s.location_id,s.id loop
  reason:=null; proposed:=null; before_a:=null; after_a:=null; can_override:=false;
  original_span:=app_private.shift_time_range(shift.scheduled_date,shift.start_time,shift.end_time,coalesce(shift.time_timezone,shift.location_timezone));
  if shift.time_basis<>'type_default' then reason:='Only saved shift-type reference hours are included; explicit and unconfirmed hours stay unchanged';
  elsif shift.type_archived is not null or shift.default_revision is null then reason:='This shift type is archived or unavailable';
  elsif shift.default_start_time is null or shift.default_end_time is null then reason:='This shift type has no current default hours';
  elsif lower(original_span)<=now() then reason:='This shift has already started';
  elsif shift.time_snapshot->>'default_revision'=shift.default_revision::text and shift.time_snapshot->>'shift_type_id'=shift.shift_type_id::text then reason:='Already uses the current defaults';
  end if;
  if reason is null then
   proposed:=public.normalize_schedule_time_source(w,shift.payload||jsonb_build_object('time_snapshot',null),shift.payload);
   proposed_span:=app_private.shift_time_range(shift.scheduled_date,(proposed->>'start_time')::time,(proposed->>'end_time')::time,proposed->>'time_timezone');
   if lower(proposed_span)<=now() then reason:='The proposed start time is already in the past'; proposed:=null; end if;
  end if;
  if proposed is not null then
   changed:=changed+1;
   can_override:=public.schedule_actor_can_manage_service(actor,w,shift.location_id);
   if shift.employee_id is not null then
    before_a:=public.availability_impact_assessment(public.assess_weekly_shift_availability(w,shift.employee_id,shift.payload))||jsonb_build_object('can_override',can_override);
    
    after_a:=public.assess_weekly_shift_availability(w,shift.employee_id,proposed);
    after_a:=public.availability_impact_assessment(after_a)||jsonb_build_object('can_override',can_override,
     'warning_policy',after_a->'warning_policy','has_availability_conflict',after_a->'has_availability_conflict',
     'override_recorded',public.schedule_availability_override(w,proposed,after_a) is not null);
 
   end if;
   if after_a->>'operation' in('blocked','verification_required') then reason:='Resolve availability or approved leave before applying these hours';
   
   elsif shift.location_archived is not null or shift.job_archived is not null then reason:='The location or job is archived';
   elsif shift.employee_id is not null and public.employee_has_hard_document_schedule_conflict_service(w,shift.employee_id,shift.scheduled_date) then reason:='Employee document requirements block this assignment';
   end if;
   if after_a->>'operation'='warning_requires_override' and reason is null then
    proposed:=proposed||jsonb_build_object('availability_assessment_fingerprint',public.assess_weekly_shift_availability(w,shift.employee_id,(proposed-'id'-'source_shift_id')||jsonb_build_object('_exclude_shift_id',shift.id,'session_id',sid))->>'fingerprint'); end if;
   if reason is not null then blocked:=blocked+1; end if;
  end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('shift_id',shift.id,'shift_revision',shift.revision,'scheduled_date',shift.scheduled_date,
   'location_id',shift.location_id,'location_name',shift.location_name,'shift_type_name',coalesce(shift.type_name,'Unnamed shift'),'employee_name',shift.employee_name,
   'before',shift.payload,'after',proposed,'before_assessment',before_a,'after_assessment',after_a,'reason',reason,'will_change',proposed is not null,'can_apply',proposed is not null and reason is null,
   'current_default_revision',shift.default_revision));
 end loop;
 -- Compare the complete proposed selection together, including overnight and
 -- cross-location commitments. Hidden peer identities never leave this helper.
 select coalesce(jsonb_agg(payload order by source,id),'[]') into peers from (
  select 'edit' source,s.id,to_jsonb(s) payload from public.schedule_edit_session_shifts s
   where s.workspace_id=w and s.session_id=sid and coalesce(s.pending_op_type,'')<>'delete'
  union all
  select 'published',p.id,to_jsonb(p)||jsonb_build_object('id',coalesce(p.source_shift_id,p.id)) from public.schedule_published_shifts p
   join public.schedule_location_publications pub on pub.id=p.publication_id and pub.workspace_id=w and pub.status='current'
   where p.workspace_id=w and p.scheduled_date between starts-2 and ends+2 and p.employee_id is not null
    and not exists(select 1 from public.schedule_edit_session_shifts s where s.workspace_id=w and s.session_id=sid and s.id=coalesce(p.source_shift_id,p.id))
 ) candidates;
 for row_value in select value from jsonb_array_elements(rows) loop
  before_count:=0; after_count:=0; unknown_count:=0;
  if row_value->'after'<>'null'::jsonb and row_value->'before'->>'employee_id' is not null then
   select count(*) filter(where peer->>'time_basis' in('explicit','type_default') and peer->>'start_time' is not null and peer->>'end_time' is not null and peer->>'time_timezone' is not null and app_private.shift_time_range((peer->>'scheduled_date')::date,(peer->>'start_time')::time,(peer->>'end_time')::time,peer->>'time_timezone') &&
    app_private.shift_time_range((row_value->>'scheduled_date')::date,(row_value->'before'->>'start_time')::time,(row_value->'before'->>'end_time')::time,row_value->'before'->>'time_timezone')),
    count(*) filter(where peer->>'time_basis' in('explicit','type_default') and peer->>'start_time' is not null and peer->>'end_time' is not null and peer->>'time_timezone' is not null and app_private.shift_time_range((coalesce(nullif(r->'after','null'),peer)->>'scheduled_date')::date,(coalesce(nullif(r->'after','null'),peer)->>'start_time')::time,(coalesce(nullif(r->'after','null'),peer)->>'end_time')::time,coalesce(nullif(r->'after','null'),peer)->>'time_timezone') &&
    app_private.shift_time_range((row_value->>'scheduled_date')::date,(row_value->'after'->>'start_time')::time,(row_value->'after'->>'end_time')::time,row_value->'after'->>'time_timezone'))
    into before_count,after_count
   from jsonb_array_elements(peers) peer left join lateral(select value r from jsonb_array_elements(rows) where value->>'shift_id'=peer->>'id') replacement on true
   where peer->>'employee_id'=row_value->'before'->>'employee_id' and peer->>'id'<>row_value->>'shift_id';
   select count(*) into unknown_count from jsonb_array_elements(peers) peer
    where peer->>'employee_id'=row_value->'before'->>'employee_id' and peer->>'id'<>row_value->>'shift_id'
     and (peer->>'scheduled_date')::date between (row_value->>'scheduled_date')::date-2 and (row_value->>'scheduled_date')::date+2
     and (coalesce(peer->>'time_basis','') not in('explicit','type_default') or peer->>'start_time' is null or peer->>'end_time' is null or peer->>'time_timezone' is null);
  end if;
  evidence:=evidence||jsonb_build_array(row_value||jsonb_build_object('before_overlap_count',before_count,'after_overlap_count',after_count,'unconfirmed_peer_count',unknown_count));
 end loop;
 fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('workspace',w,'actor',actor,'session',sid,'revision',session.revision,'command',command-'fingerprint'-'idempotency_key'-'acknowledge_reference_overlaps'-'confirm_availability','rows',evidence,'peers',peers)::text,'UTF8'),'sha256'),'hex');
 return jsonb_build_object('session_id',sid,'session_revision',session.revision,'starts_on',starts,'ends_on',ends,'fingerprint',fingerprint,'changed_count',changed,'blocked_count',blocked,'shifts',evidence);
end $function$;

CREATE OR REPLACE FUNCTION public.get_schedule_read_model_service_label_base(actor_user_id uuid, target_workspace_id uuid, target_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  settings public.workspace_scheduling_settings%rowtype;
  resolved_week_start date;
  result jsonb;
begin
  if not exists (
    select 1
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    join public.workspace_role_permissions permission
      on permission.role_id = role.id and permission.workspace_id = role.workspace_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
      and role.access_class in ('owner', 'admin', 'manager')
      and permission.permission_key = 'schedule.read'
  ) then
    raise exception 'manager schedule read access required' using errcode = '42501';
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

  with actor_membership as (
    select membership.id, membership.all_locations
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
    limit 1
  ), allowed_locations as (
    select location.*
    from public.locations location
    cross join actor_membership membership
    where location.workspace_id = target_workspace_id
      and location.archived_at is null
      and (
        membership.all_locations
        or exists (
          select 1 from public.membership_location_scopes scope
          where scope.membership_id = membership.id
            and scope.workspace_id = target_workspace_id
            and scope.location_id = location.id
        )
      )
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
  ), week_availability as materialized (
    select * from app_private.schedule_week_availability(
      target_workspace_id, resolved_week_start,
      (select coalesce(array_agg(employee.id), '{}') from visible_employees employee),
      (select coalesce(array_agg(location.id), '{}') from allowed_locations location))
  )
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'week_start', resolved_week_start,
    'week_start_day', settings.week_start_day,
    'settings', jsonb_build_object(
      'time_format', coalesce(settings.time_format, '12h')
    ),
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
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', department.id, 'name', department.name, 'color', department.color,
        'sort_order', department.sort_order
      ) order by department.sort_order, department.name)
      from public.departments department
      where department.workspace_id = target_workspace_id and department.archived_at is null
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', job.id, 'name', job.name, 'color', job.color,
        'sort_order', job.sort_order, 'department_id', job.department_id
      ) order by job.sort_order, job.name)
      from public.jobs job
      where job.workspace_id = target_workspace_id and job.archived_at is null
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
        'location_ids', coalesce((select jsonb_agg(assignment.location_id order by assignment.location_id)
          from public.employee_location_assignments assignment
          join allowed_locations location on location.id = assignment.location_id
          where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
        'job_ids', coalesce((select jsonb_agg(assignment.job_id order by assignment.job_id)
          from public.employee_job_assignments assignment
          where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
        'primary_job_id', (select assignment.job_id
          from public.employee_job_assignments assignment
          where assignment.employee_id = employee.id and assignment.ended_at is null
          order by assignment.is_primary desc, assignment.job_id
          limit 1),
        'weekly_availability', coalesce((select jsonb_agg(week.projection order by week.location_id)
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
        'warning_codes', to_jsonb(array_remove(array[
          case when exists (
            select 1 from public.schedule_closures closure
            where closure.location_id = shift.location_id
              and closure.closed_date = shift.scheduled_date and closure.is_all_day
          ) then 'closed_location' end,
          -- A published shift keeps what was accepted when it was published.
          case when shift.employee_id is not null
            and public.weekly_published_availability_visible(target_workspace_id, shift.employee_id, shift.availability_snapshot)
          then 'availability' end,
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
    ), '[]'::jsonb),
    'closures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', closure.id, 'location_id', closure.location_id,
        'closed_date', closure.closed_date, 'title', closure.title,
        'is_all_day', closure.is_all_day
      ) order by closure.closed_date, closure.title)
      from public.schedule_closures closure
      join allowed_locations location on location.id = closure.location_id
      where closure.closed_date between resolved_week_start and resolved_week_start + 6
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_employee_schedule_board_service(actor_user_id uuid, target_workspace_id uuid, target_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor public.employee_profiles%rowtype;
  settings public.workspace_scheduling_settings%rowtype;
  resolved_week_start date;
  result jsonb;
begin
  actor := public.employee_hub_actor_service(actor_user_id, target_workspace_id);

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
      and exists (
        select 1
        from public.employee_location_assignments assignment
        where assignment.employee_id = actor.id
          and assignment.location_id = location.id
          and assignment.ended_at is null
      )
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
  ), own_availability as materialized (
    -- The employee's own marks; the manager's private reminder never reaches here.
    select * from app_private.schedule_week_availability(
      target_workspace_id, resolved_week_start, array[actor.id],
      (select coalesce(array_agg(location.id), '{}') from allowed_locations location), false)
  )
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'week_start', resolved_week_start,
    'week_start_day', settings.week_start_day,
    'settings', jsonb_build_object(
      'time_format', coalesce(settings.time_format, '12h')
    ),
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
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', department.id, 'name', department.name, 'color', department.color,
        'sort_order', department.sort_order
      ) order by department.sort_order, department.name)
      from public.departments department
      where department.workspace_id = target_workspace_id and department.archived_at is null
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', job.id, 'name', job.name, 'color', job.color,
        'sort_order', job.sort_order, 'department_id', job.department_id
      ) order by job.sort_order, job.name)
      from public.jobs job
      where job.workspace_id = target_workspace_id and job.archived_at is null
    ), '[]'::jsonb),
    'shift_types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', shift_type.id, 'name', shift_type.name, 'color', shift_type.color,
        'sort_order', shift_type.sort_order,
        'default_revision', shift_type.default_revision,
        'default_start_time', case when shift_type.default_start_time is null then null else to_char(shift_type.default_start_time, 'HH24:MI') end,
        'default_end_time', case when shift_type.default_end_time is null then null else to_char(shift_type.default_end_time, 'HH24:MI') end
      ) order by shift_type.sort_order, shift_type.name)
      from public.shift_types shift_type
      where shift_type.workspace_id = target_workspace_id and shift_type.archived_at is null
    ), '[]'::jsonb),
    'shift_labels', '[]'::jsonb,
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', employee.id,
        'employee_code', employee.employee_code,
        'display_name', coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' ' || employee.last_name,
        'location_ids', coalesce((select jsonb_agg(assignment.location_id order by assignment.location_id)
          from public.employee_location_assignments assignment
          join allowed_locations location on location.id = assignment.location_id
          where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
        'job_ids', coalesce((select jsonb_agg(assignment.job_id order by assignment.job_id)
          from public.employee_job_assignments assignment
          where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
        'primary_job_id', (select assignment.job_id
          from public.employee_job_assignments assignment
          where assignment.employee_id = employee.id and assignment.ended_at is null
          order by assignment.is_primary desc, assignment.job_id
          limit 1)
      ) || case when employee.id = actor.id then jsonb_build_object('weekly_availability', coalesce((
          select jsonb_agg(own.projection order by own.location_id)
          from own_availability own
          where exists (select 1 from public.employee_location_assignments assignment
            where assignment.employee_id = actor.id and assignment.location_id = own.location_id
              and assignment.ended_at is null)), '[]'::jsonb))
        else '{}'::jsonb end
      order by employee.last_name, employee.first_name, employee.id)
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
        'time_basis', shift.time_basis,
        'time_snapshot', shift.time_snapshot,
        'time_timezone', shift.time_timezone,
        'start_time', to_char(shift.start_time, 'HH24:MI'),
        'end_time', to_char(shift.end_time, 'HH24:MI'),
        'crosses_midnight', shift.crosses_midnight,
        'unpaid_break_minutes', coalesce(shift.unpaid_break_minutes, 0),
        'hide_time_on_badge', coalesce(shift.hide_time_on_badge, false),
        'note', shift.note,
        'label_ids', to_jsonb(coalesce(shift.label_ids, '{}'::uuid[])),
        'label_names', to_jsonb(coalesce(shift.label_names, '{}'::text[])),
        'warning_codes', to_jsonb(array_remove(array[
          case when exists (
            select 1 from public.schedule_closures closure
            where closure.location_id = shift.location_id
              and closure.closed_date = shift.scheduled_date and closure.is_all_day
          ) then 'closed_location' end,
          -- Only a conflict with the employee's own marks, as accepted at publishing.
          case when shift.employee_id = actor.id
            and coalesce((shift.availability_snapshot -> 'assessment' ->> 'has_availability_conflict')::boolean, false)
            and jsonb_array_length(coalesce(shift.availability_snapshot -> 'assessment' -> 'employee_intervals', '[]'::jsonb)) > 0
          then 'availability' end,
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
    ), '[]'::jsonb),
    'closures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', closure.id, 'location_id', closure.location_id,
        'closed_date', closure.closed_date, 'title', closure.title,
        'is_all_day', closure.is_all_day
      ) order by closure.closed_date, closure.title)
      from public.schedule_closures closure
      join allowed_locations location on location.id = closure.location_id
      where closure.closed_date between resolved_week_start and resolved_week_start + 6
    ), '[]'::jsonb),
    'important_dates', '[]'::jsonb
  ) into result;

  return result;
end;
$function$;

-- 2. Triggers on tables that stay ---------------------------------------------------------
drop trigger availability_publication_lock on public.schedule_location_publications;
drop trigger availability_policy_revision on public.workspace_scheduling_settings;
drop trigger scheduling_settings_audit_trigger on public.workspace_scheduling_settings;

-- 3. The permission and the notification type --------------------------------------------
delete from app_private.role_permission_dependencies
where permission_key = 'schedule.availability.override' or required_key = 'schedule.availability.override';
delete from public.workspace_role_permissions where permission_key = 'schedule.availability.override';
delete from public.permissions where key = 'schedule.availability.override';
delete from public.notification_producer_registry where source_function = 'availability_notify';
delete from public.notification_template_versions where type_key = 'availability.review_required';
delete from public.notification_catalog where type_key = 'availability.review_required';

-- 4. Functions that take or return an old row or type, then the tables with their
-- own triggers, then every other old function, the columns and the types.
drop function public.availability_activate(r availability_requests, actor uuid);
drop function public.availability_capacity_for_span(w uuid, emp uuid, target_span tstzrange, proposed jsonb);
drop function public.availability_emit(r availability_requests, actor uuid, action_name text);
drop function public.availability_notify(r availability_requests, actor uuid, event uuid, action_name text);
drop function public.availability_pattern_capacity_for_span(w uuid, emp uuid, target_span tstzrange, proposed jsonb);
drop function public.availability_pending_publication(w uuid, loc uuid, week date);
drop function public.availability_version_at_instant(emp uuid, instant timestamp with time zone);
drop function public.availability_version_for_calendar(emp uuid, day date);

drop table public.availability_draft_impact_reviews, public.availability_commands, public.availability_events,
  public.availability_publication_locks, public.availability_requests, public.employee_availability_versions,
  public.employee_schedule_availability_versions, public.schedule_service_classifications;

drop function public.assess_shift_availability(w uuid, emp uuid, shift jsonb);
drop function public.assess_shift_availability_context(w uuid, emp uuid, shift jsonb, service_independent boolean, proposed jsonb, resolved_request uuid);
drop function public.assess_shift_availability_core(w uuid, emp uuid, shift jsonb, service_independent boolean);
drop function public.audit_scheduling_settings_change();
drop function public.availability_actor_scope(actor uuid, w uuid, emp uuid, manage boolean);
drop function public.availability_calendar_comparison_service(actor uuid, w uuid, command jsonb);
drop function public.availability_calendar_context(actor uuid, w uuid, employee_id uuid, starts_on date, zone_name text, day_count integer, proposed jsonb);
drop function public.availability_calendar_read_service(actor uuid, w uuid, employee_id uuid, starts_on date, zone_name text, day_count integer);
drop function public.availability_change_narrows(w uuid, emp uuid, p jsonb);
drop function public.availability_command_service(actor uuid, w uuid, command jsonb, request_key uuid);
drop function public.availability_date_override_ranges(periods jsonb);
drop function public.availability_date_overrides_locked(w uuid, emp uuid, periods jsonb);
drop function public.availability_impact_comparison(a jsonb);
drop function public.availability_overlapping_temporary_versions(w uuid, emp uuid, p jsonb);
drop function public.availability_period_locked(w uuid, emp uuid, starts date, ends date);
drop function public.availability_proposal_applies(p jsonb, target_span tstzrange);
drop function public.availability_proposals_overlap(a jsonb, b jsonb);
drop function public.availability_publication_preflight(payload jsonb);
drop function public.availability_read_before_calendar_service(actor uuid, w uuid, employee_id uuid);
drop function public.availability_read_service(actor uuid, w uuid, employee_id uuid);
drop function public.availability_requests_read_service(actor uuid, w uuid, filters jsonb);
drop function public.availability_resolve_date_overrides(p jsonb);
drop function public.availability_rules_for_date(target_employee_id uuid, target_date date);
drop function public.availability_shift_type_rules(w uuid, emp uuid, target_span tstzrange, proposed jsonb);
drop function public.availability_validate_date_override_replacements(w uuid, emp uuid, p jsonb, ids jsonb);
drop function public.availability_week_capacity(days jsonb);
drop function public.capture_availability_publication_lock();
drop function public.employee_availability_context_service(actor_user_id uuid, target_workspace_id uuid);
drop function public.get_employee_hub_availability_v2_service(actor_user_id uuid, target_workspace_id uuid, target_from date, target_to date);
drop function public.get_schedule_read_model_availability_v2_service(actor_user_id uuid, target_workspace_id uuid, target_date date);
drop function public.guard_availability_draft_impact_review();
drop function public.guard_availability_request();
drop function public.guard_availability_write();
drop function public.guard_schedule_service_classification_history();
drop function public.preview_availability_draft_impact_service(actor uuid, w uuid, command jsonb);
drop function public.save_employee_availability_service(target_user_id uuid, availability_timezone text, availability_days jsonb, expected_revision integer);
drop function public.save_employee_availability_v2_service(actor_user_id uuid, target_workspace_id uuid, availability_timezone text, availability_days jsonb, starts_on date, ends_on date, expected_revision integer);
drop function public.save_employee_hub_availability_service(actor_user_id uuid, target_workspace_id uuid, availability_timezone text, availability_days jsonb);
drop function public.save_onboarding_availability_v2_service(target_user_id uuid, availability_timezone text, availability_days jsonb, expected_revision integer, starts_on date, ends_on date, availability_revision integer);
drop function public.save_onboarding_availability_v3_service(target_user_id uuid, availability_timezone text, availability_days jsonb, expected_revision integer, starts_on date, ends_on date, availability_revision integer, request_key uuid);
drop function public.schedule_assess_availability_preview(w uuid, emp uuid, s jsonb);
drop function public.schedule_availability_publication_preflight(payload jsonb, actor uuid, departments uuid[], include_no_department boolean);
drop function public.schedule_prepare_service_classification(actor uuid, w uuid, s jsonb, previous jsonb);
drop function public.schedule_service_classification(w uuid, emp uuid, s jsonb);
drop function public.sync_onboarding_availability();
drop function public.validate_availability_shift_types(w uuid, days jsonb);
drop function public.validate_availability_week(tz text, days jsonb);
drop function public.version_availability_policy();
drop function public.weekly_schedule_location_projection(w uuid, emp uuid, loc uuid, week_start date);

alter table public.workspace_scheduling_settings
  drop column conflict_policy,
  drop column availability_enforcement,
  drop column availability_ownership,
  drop column availability_approval,
  drop column availability_initial_review,
  drop column availability_notice_days,
  drop column availability_policy_revision,
  drop column availability_warning_policy;

drop type public.availability_capacity_result;
drop type public.schedule_conflict_policy;
drop type public.availability_enforcement;
