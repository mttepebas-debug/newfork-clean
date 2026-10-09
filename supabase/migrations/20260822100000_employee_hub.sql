alter table public.schedule_shift_change_requests
  add column participant_response text not null default 'not_required'
  check (participant_response in ('not_required','pending','accepted','declined'));

create function public.employee_hub_actor_service(actor_user_id uuid, target_workspace_id uuid)
returns public.employee_profiles
language plpgsql stable security definer set search_path = '' as $$
declare employee public.employee_profiles%rowtype;
begin
  if not exists (
    select 1 from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
  ) then
    raise exception 'active employee membership required' using errcode = '42501';
  end if;
  select * into employee from public.employee_profiles profile
  where profile.workspace_id = target_workspace_id
    and profile.user_id = actor_user_id
    and profile.archived_at is null;
  if employee.id is null then
    raise exception 'employee profile required' using errcode = '42501';
  end if;
  return employee;
end; $$;

create function public.get_employee_hub_service(
  actor_user_id uuid, target_workspace_id uuid, target_from date, target_to date
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
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
        'scheduled_date',shift.scheduled_date,'start_time',to_char(shift.start_time,'HH24:MI'),
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
        'scheduled_date',shift.scheduled_date,'start_time',to_char(shift.start_time,'HH24:MI'),
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
        'scheduled_date',shift.scheduled_date,'start_time',to_char(shift.start_time,'HH24:MI'),
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
          'id',request.id,'shift_id',null,'kind','time_off','status',request.status::text,
          'title','Time off · '||to_char(min(segment.segment_date),'Mon DD')||case when min(segment.segment_date)<>max(segment.segment_date) then '–'||to_char(max(segment.segment_date),'Mon DD') else '' end,
          'detail',coalesce(nullif(request.reason,''),'No note'),'revision',request.revision,'created_at',request.created_at,
          'can_cancel',request.status='pending','can_respond',false
        ) request_row
        from public.schedule_time_off_requests request
        join public.schedule_time_off_segments segment on segment.request_id=request.id
        where request.workspace_id=target_workspace_id and request.employee_id=employee.id
        group by request.id
        union all
        select jsonb_build_object(
          'id',request.id,'shift_id',request.offered_shift_id,
          'kind',case request.request_type when 'direct_swap' then 'swap' when 'release_pickup' then case when request.expected_offered_employee_id is null then 'pickup' else 'release' end else 'release' end,
          'status',case when request.participant_response='pending' then 'awaiting teammate' else request.status::text end,
          'title',case request.request_type when 'direct_swap' then 'Shift swap' else case when request.expected_offered_employee_id is null then 'Open shift pickup' else 'Shift release' end end,
          'detail',to_char(shift.scheduled_date,'Mon DD')||' · '||to_char(shift.start_time,'HH24:MI')||'–'||to_char(shift.end_time,'HH24:MI'),
          'revision',request.revision,'created_at',request.created_at,
          'can_cancel',request.created_by=actor_user_id and request.status='pending_manager_approval',
          'can_respond',request.request_type='direct_swap' and request.participant_response='pending'
            and exists(select 1 from public.schedule_shift_change_participants participant where participant.request_id=request.id and participant.employee_id=employee.id and participant.participant_role='receiver')
        ) request_row
        from public.schedule_shift_change_requests request
        join public.schedule_published_shifts shift on shift.id=request.offered_shift_id
        where request.workspace_id=target_workspace_id and exists(
          select 1 from public.schedule_shift_change_participants participant
          where participant.request_id=request.id and participant.employee_id=employee.id)
      ) requests
    ),'[]'::jsonb),
    'availability', (
      select jsonb_build_object('timezone',version.timezone,'days',version.recurring_rules)
      from public.employee_schedule_availability_versions version
      where version.employee_id=employee.id and version.effective_at<=now()
      order by version.version_number desc limit 1
    ),
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
    ),'[]'::jsonb),
    'lineup', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',(entry->>'id')::uuid,'lineup_date',snapshot.lineup_date,'location_name',location.name,
        'employee_name',coalesce(nullif(entry->>'employee_name',''),'Open row'),'job_name',nullif(entry->>'job_name',''),
        'start_time',nullif(entry->>'start_time',''),'end_time',nullif(entry->>'end_time',''),
        'station',coalesce(entry->>'station',''),'section_name',nullif(entry->>'section_name',''),
        'call_off',coalesce((entry->>'call_off')::boolean,false)
      ) order by snapshot.lineup_date,location.sort_order,coalesce((entry->>'display_order')::integer,0))
      from public.schedule_lineup_snapshots snapshot
      join public.locations location on location.id=snapshot.location_id
      cross join lateral jsonb_array_elements(snapshot.content->'entries') entry
      where snapshot.workspace_id=target_workspace_id and snapshot.lineup_date between target_from and target_to
        and snapshot.version_number=(select max(latest.version_number) from public.schedule_lineup_snapshots latest where latest.workspace_id=snapshot.workspace_id and latest.location_id=snapshot.location_id and latest.lineup_date=snapshot.lineup_date)
        and exists(select 1 from public.employee_location_assignments assignment where assignment.employee_id=employee.id and assignment.location_id=snapshot.location_id and assignment.ended_at is null)
    ),'[]'::jsonb)
  ) into result;
  return result;
end; $$;

create function public.save_employee_hub_availability_service(
  actor_user_id uuid, target_workspace_id uuid, availability_timezone text, availability_days jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare employee public.employee_profiles%rowtype; next_version integer;
begin
  employee:=public.employee_hub_actor_service(actor_user_id,target_workspace_id);
  if char_length(btrim(availability_timezone)) not between 1 and 80
    or jsonb_typeof(availability_days)<>'array' or jsonb_array_length(availability_days)<>7
    or (select count(distinct (day->>'day')::integer) from jsonb_array_elements(availability_days) day)<>7 then
    raise exception 'complete weekly availability required' using errcode='22023';
  end if;
  select coalesce(max(version_number),0)+1 into next_version from public.employee_schedule_availability_versions where employee_id=employee.id;
  insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by)
  values(target_workspace_id,employee.id,next_version,btrim(availability_timezone),availability_days,'employee',actor_user_id);
  return jsonb_build_object('status','saved','revision',next_version);
end; $$;

create function public.submit_employee_time_off_service(
  actor_user_id uuid, target_workspace_id uuid, target_location_id uuid, target_reason text, target_dates date[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare employee public.employee_profiles%rowtype; request_id uuid;
begin
  employee:=public.employee_hub_actor_service(actor_user_id,target_workspace_id);
  if cardinality(target_dates) not between 1 and 31 or exists(select 1 from unnest(target_dates) date_value where date_value<current_date) then raise exception 'valid future time off dates required' using errcode='22023'; end if;
  if not exists(select 1 from public.employee_location_assignments where employee_id=employee.id and location_id=target_location_id and ended_at is null) then raise exception 'employee location access denied' using errcode='42501'; end if;
  if exists(select 1 from public.schedule_time_off_requests request join public.schedule_time_off_segments segment on segment.request_id=request.id where request.employee_id=employee.id and request.status in('pending','approved','partially_approved') and segment.segment_date=any(target_dates)) then raise exception 'overlapping time off request exists' using errcode='23514'; end if;
  insert into public.schedule_time_off_requests(workspace_id,employee_id,location_id,reason,created_by) values(target_workspace_id,employee.id,target_location_id,btrim(coalesce(target_reason,'')),actor_user_id) returning id into request_id;
  insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date) select target_workspace_id,request_id,date_value from (select distinct unnest(target_dates) date_value) dates;
  insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id) values(target_workspace_id,request_id,'submitted',actor_user_id);
  return jsonb_build_object('status','pending','request_id',request_id,'revision',1);
end; $$;

create function public.submit_employee_shift_request_service(
  actor_user_id uuid, target_workspace_id uuid, target_action text, target_shift_id uuid,
  target_requested_shift_id uuid default null, target_note text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare employee public.employee_profiles%rowtype; offered public.schedule_published_shifts%rowtype; requested public.schedule_published_shifts%rowtype; request_id uuid; receiver uuid; kind public.shift_change_request_type;
begin
  employee:=public.employee_hub_actor_service(actor_user_id,target_workspace_id);
  select shift.* into offered from public.schedule_published_shifts shift join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current' where shift.id=target_shift_id and shift.workspace_id=target_workspace_id for update;
  if offered.id is null then raise exception 'published shift not found' using errcode='P0002'; end if;
  if target_action='release' then
    if offered.employee_id<>employee.id then raise exception 'employee shift access denied' using errcode='42501'; end if; kind:='release_pickup'; receiver:=null;
  elsif target_action='pickup' then
    if offered.employee_id is not null then raise exception 'open shift is no longer available' using errcode='40001'; end if;
    if not exists(select 1 from public.employee_location_assignments where employee_id=employee.id and location_id=offered.location_id and ended_at is null) then raise exception 'employee location access denied' using errcode='42501'; end if; kind:='release_pickup'; receiver:=employee.id;
  elsif target_action='swap' then
    if offered.employee_id<>employee.id or target_requested_shift_id is null then raise exception 'employee shift access denied' using errcode='42501'; end if;
    select shift.* into requested from public.schedule_published_shifts shift join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current' where shift.id=target_requested_shift_id and shift.workspace_id=target_workspace_id and shift.employee_id is not null and shift.employee_id<>employee.id for update;
    if requested.id is null then raise exception 'requested shift not found' using errcode='P0002'; end if; kind:='direct_swap'; receiver:=requested.employee_id;
  else raise exception 'unsupported employee shift request' using errcode='22023'; end if;
  if exists(select 1 from public.schedule_shift_change_requests request where request.offered_shift_id=offered.id and request.status='pending_manager_approval') then raise exception 'active shift request already exists' using errcode='23514'; end if;
  insert into public.schedule_shift_change_requests(workspace_id,request_type,offered_shift_id,requested_shift_id,expected_offered_employee_id,expected_requested_employee_id,note,created_by,participant_response)
  values(target_workspace_id,kind,offered.id,requested.id,offered.employee_id,requested.employee_id,btrim(coalesce(target_note,'')),actor_user_id,case when target_action='swap' then 'pending' else 'not_required' end) returning id into request_id;
  insert into public.schedule_shift_change_participants(workspace_id,request_id,employee_id,participant_role) values(target_workspace_id,request_id,employee.id,'requester');
  if target_action in('release','swap') then insert into public.schedule_shift_change_participants(workspace_id,request_id,employee_id,participant_role) values(target_workspace_id,request_id,employee.id,'giver'); end if;
  if receiver is not null then insert into public.schedule_shift_change_participants(workspace_id,request_id,employee_id,participant_role) values(target_workspace_id,request_id,receiver,'receiver'); end if;
  insert into public.schedule_shift_change_events(workspace_id,request_id,action,actor_user_id) values(target_workspace_id,request_id,'submitted',actor_user_id);
  return jsonb_build_object('status',case when target_action='swap' then 'awaiting_teammate' else 'pending_manager_approval' end,'request_id',request_id,'revision',1);
end; $$;

create function public.employee_request_action_service(
  actor_user_id uuid, target_workspace_id uuid, target_request_id uuid, target_kind text,
  target_action text, target_expected_revision integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare employee public.employee_profiles%rowtype; time_request public.schedule_time_off_requests%rowtype; shift_request public.schedule_shift_change_requests%rowtype;
begin
  employee:=public.employee_hub_actor_service(actor_user_id,target_workspace_id);
  if target_kind='time_off' and target_action='cancel' then
    select * into time_request from public.schedule_time_off_requests where id=target_request_id and workspace_id=target_workspace_id and employee_id=employee.id for update;
    if time_request.id is null then raise exception 'time off request not found' using errcode='P0002'; end if;
    if time_request.revision<>target_expected_revision or time_request.status<>'pending' then raise exception 'stale time off request' using errcode='40001'; end if;
    update public.schedule_time_off_requests set status='revoked',revision=revision+1,updated_at=now() where id=time_request.id returning * into time_request;
    insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note) values(target_workspace_id,time_request.id,'revoked',actor_user_id,'Cancelled by employee');
    return jsonb_build_object('status','cancelled','request_id',time_request.id,'revision',time_request.revision);
  elsif target_kind='shift_change' then
    select * into shift_request from public.schedule_shift_change_requests where id=target_request_id and workspace_id=target_workspace_id for update;
    if shift_request.id is null or not exists(select 1 from public.schedule_shift_change_participants where request_id=shift_request.id and employee_id=employee.id) then raise exception 'shift request not found' using errcode='P0002'; end if;
    if shift_request.revision<>target_expected_revision or shift_request.status<>'pending_manager_approval' then raise exception 'stale shift request' using errcode='40001'; end if;
    if target_action='cancel' and shift_request.created_by=actor_user_id then
      update public.schedule_shift_change_requests set status='cancelled',revision=revision+1,updated_at=now() where id=shift_request.id returning * into shift_request;
      insert into public.schedule_shift_change_events(workspace_id,request_id,action,actor_user_id) values(target_workspace_id,shift_request.id,'cancelled',actor_user_id);
    elsif target_action in('accept','decline') and shift_request.request_type='direct_swap' and shift_request.participant_response='pending' and exists(select 1 from public.schedule_shift_change_participants where request_id=shift_request.id and employee_id=employee.id and participant_role='receiver') then
      update public.schedule_shift_change_requests set participant_response=case when target_action='accept' then 'accepted' else 'declined' end,status=case when target_action='decline' then 'cancelled'::public.shift_change_request_status else status end,revision=revision+1,updated_at=now() where id=shift_request.id returning * into shift_request;
      insert into public.schedule_shift_change_events(workspace_id,request_id,action,actor_user_id,note) values(target_workspace_id,shift_request.id,case when target_action='accept' then 'viewed' else 'cancelled' end,actor_user_id,case when target_action='accept' then 'Swap accepted by teammate' else 'Swap declined by teammate' end);
    else raise exception 'employee request transition is invalid' using errcode='40001'; end if;
    return jsonb_build_object('status',case when target_action='accept' then 'pending_manager_approval' else 'cancelled' end,'request_id',shift_request.id,'revision',shift_request.revision);
  end if;
  raise exception 'unsupported employee request action' using errcode='22023';
end; $$;

create or replace function public.get_shift_change_conflicts_service(target_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.schedule_shift_change_requests%rowtype; offered public.schedule_published_shifts%rowtype; requested public.schedule_published_shifts%rowtype; receiver_id uuid; result jsonb:='[]'::jsonb;
begin
 select * into r from public.schedule_shift_change_requests where id=target_request_id;
 select * into offered from public.schedule_published_shifts where id=r.offered_shift_id;
 if r.requested_shift_id is not null then select * into requested from public.schedule_published_shifts where id=r.requested_shift_id; end if;
 select employee_id into receiver_id from public.schedule_shift_change_participants where request_id=r.id and participant_role='receiver';
 if r.request_type='direct_swap' and r.participant_response<>'accepted' then result:=result||jsonb_build_array(jsonb_build_object('code','participant_acceptance','severity','hard','message','The receiving employee must accept the swap first.')); end if;
 if offered.id is null or not exists(select 1 from public.schedule_location_publications p where p.id=offered.publication_id and p.status='current') then result:=result||jsonb_build_array(jsonb_build_object('code','offered_shift_unavailable','severity','hard','message','The offered shift is no longer published.'));
 elsif offered.employee_id is distinct from r.expected_offered_employee_id then result:=result||jsonb_build_array(jsonb_build_object('code','offered_owner_changed','severity','hard','message','The offered shift owner changed.')); end if;
 if r.request_type='direct_swap' and (requested.id is null or requested.employee_id is distinct from r.expected_requested_employee_id) then result:=result||jsonb_build_array(jsonb_build_object('code','requested_owner_changed','severity','hard','message','The requested shift owner changed.')); end if;
 if receiver_id is null and (r.request_type in ('direct_coverage','direct_swap') or not exists(select 1 from public.schedule_shift_change_participants participant where participant.request_id=r.id and participant.participant_role='giver')) then result:=result||jsonb_build_array(jsonb_build_object('code','receiver_missing','severity','hard','message','A receiving employee is required.')); end if;
 if receiver_id is not null and exists(select 1 from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current' where s.workspace_id=r.workspace_id and s.employee_id=receiver_id and s.scheduled_date=offered.scheduled_date and s.id not in(r.offered_shift_id,coalesce(r.requested_shift_id,r.offered_shift_id)) and s.start_time<offered.end_time and s.end_time>offered.start_time) then result:=result||jsonb_build_array(jsonb_build_object('code','schedule_overlap','severity','hard','message','The receiving employee has an overlapping published shift.')); end if;
 if receiver_id is not null and exists(select 1 from public.schedule_time_off_requests tr join public.schedule_time_off_segments sg on sg.request_id=tr.id where tr.workspace_id=r.workspace_id and tr.employee_id=receiver_id and tr.status in('approved','partially_approved') and sg.status='approved' and sg.segment_date=offered.scheduled_date) then result:=result||jsonb_build_array(jsonb_build_object('code','approved_time_off','severity','hard','message','The receiving employee has approved time off.')); end if;
 if receiver_id is not null and not exists(select 1 from public.employee_location_assignments a where a.workspace_id=r.workspace_id and a.employee_id=receiver_id and a.location_id=offered.location_id and a.ended_at is null) then result:=result||jsonb_build_array(jsonb_build_object('code','location_assignment','severity','soft','message','The receiving employee is not assigned to this location.')); end if;
 return result;
end; $$;

revoke all on function public.employee_hub_actor_service(uuid,uuid), public.get_employee_hub_service(uuid,uuid,date,date), public.save_employee_hub_availability_service(uuid,uuid,text,jsonb), public.submit_employee_time_off_service(uuid,uuid,uuid,text,date[]), public.submit_employee_shift_request_service(uuid,uuid,text,uuid,uuid,text), public.employee_request_action_service(uuid,uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.employee_hub_actor_service(uuid,uuid), public.get_employee_hub_service(uuid,uuid,date,date), public.save_employee_hub_availability_service(uuid,uuid,text,jsonb), public.submit_employee_time_off_service(uuid,uuid,uuid,text,date[]), public.submit_employee_shift_request_service(uuid,uuid,text,uuid,uuid,text), public.employee_request_action_service(uuid,uuid,uuid,text,text,integer) to service_role;
