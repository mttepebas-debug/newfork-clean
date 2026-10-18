-- CALISAN-HOME-GUNISIGI, data slice (Mert 2026-10-18, KARARLAR S-163): the
-- employee's Daylight Home reads three more facts it shows today without data.
--   1. Each of the person's own shifts says its shift type ("Brunch", "Dinner"):
--      the shift card's area when today's lineup names no section.
--   2. A document obligation says when its approved version expires and
--      whether that is soon: the rule the manager's to-do list uses (the type
--      tracks expiry, the date is within the type's expiry_warning_days), so
--      Home says "Your Food Handler card expires Nov 2" on the same day the
--      manager hears of it.
--   3. A teammate's shift says whether its job is in the Management department
--      (departments.system_key): Home's "Manager on the floor" is such a shift
--      at the same place and time, and nothing when there is none (Mert
--      2026-10-18; rol-cift design 4.13: the job decides, not the core).
-- Both functions are replaced whole from schema.sql; only the lines marked
-- above change. No new grant, no new service, no new read path.

CREATE OR REPLACE FUNCTION "public"."get_employee_hub_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_from" "date", "target_to" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
        'end_time',to_char(shift.end_time,'HH24:MI'),'note',shift.note,'employee_id',shift.employee_id,
        'shift_type_name',shift_type.name
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      left join public.shift_types shift_type on shift_type.id=shift.shift_type_id and shift_type.workspace_id=shift.workspace_id
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
        'employee_name',concat_ws(' ',coalesce(nullif(teammate.preferred_name,''),teammate.first_name),teammate.last_name),
        'is_management',coalesce((select department.system_key='management' from public.departments department
          where department.id=job.department_id and department.workspace_id=shift.workspace_id),false)
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
end; $$;

CREATE OR REPLACE FUNCTION "app_private"."document_obligation_json"("r" "public"."employee_onboarding_requirements") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
 select jsonb_build_object(
  'id',r.id,'workspace_id',r.workspace_id,'employee_id',r.employee_id,'employee_name',concat_ws(' ',e.first_name,e.last_name),
  'title',r.title,'source_id',r.source_id,'kind',r.kind,'mode',r.lifecycle_settings->>'mode',
  'publication_paused',r.publication_paused_at is not null,'status',case when r.publication_paused_at is not null and not r.lifecycle_exempt and r.lifecycle_closed_at is null then 'paused' when not r.lifecycle_exempt and r.lifecycle_closed_at is null and r.status<>'superseded'
    and exists(select 1 from public.employee_document_submissions s where s.id=r.submitted_document_id and s.state='pending_review')
    then 'pending_review' else app_private.document_obligation_state(r,now()) end,'revision',r.lifecycle_revision,'requires_review',r.requires_review,
  'deadline_at',r.deadline_at,'remaining_seconds',case when r.publication_paused_at is not null then null else coalesce(r.paused_remaining_seconds,case when r.deadline_at is not null then greatest(0,extract(epoch from r.deadline_at-now())) end) end,
  'rejection_reason',r.rejection_reason,'suspended',app_private.document_obligation_blocked(r,now()),
  'exemption_locked',app_private.employee_record_is_workspace_owner(r.workspace_id,r.employee_id),
  'submitted_id',r.submitted_document_id,'approved_id',r.approved_document_id,
  'location_ids',coalesce((select jsonb_agg(l.id order by l.name) from public.employee_location_assignments a join public.locations l on l.id=a.location_id and l.workspace_id=a.workspace_id where a.employee_id=r.employee_id and a.workspace_id=r.workspace_id and a.ended_at is null),'[]'),
  'location_names',coalesce((select jsonb_agg(l.name order by l.name) from public.employee_location_assignments a join public.locations l on l.id=a.location_id and l.workspace_id=a.workspace_id where a.employee_id=r.employee_id and a.workspace_id=r.workspace_id and a.ended_at is null),'[]'),
  'timezone',app_private.document_employee_timezone(r.workspace_id,r.employee_id),'settings',r.lifecycle_settings,
  'accepted_formats',coalesce(r.source_snapshot->'accepted_formats','[]'), 'tracks_expiry',coalesce((r.source_snapshot->>'tracks_expiry')::boolean,false),
  'expiry_date',(select s.expiry_date from public.employee_document_submissions s where s.id=r.approved_document_id and s.requirement_id=r.id),
  'expiring_soon',coalesce((select s.expiry_date<=current_date+t.expiry_warning_days
    from public.employee_document_submissions s
    join public.document_types t on t.id=r.source_id and t.workspace_id=r.workspace_id and t.tracks_expiry and t.archived_at is null
    where s.id=r.approved_document_id and s.requirement_id=r.id and s.expiry_date is not null),false))
 from public.employee_profiles e where e.id=r.employee_id and e.workspace_id=r.workspace_id;
$$;
