create function public.weekly_lineup_candidate_option(actor uuid,w uuid,emp uuid,target jsonb,excluded uuid[],need jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; loc uuid:=(target->>'location_id')::uuid; d date:=(target->>'date')::date;
 tz text; span tstzrange; calendar_day tstzrange; missing_location boolean; missing_job boolean;
 elsewhere boolean; here_jobs text[]; has_day_shift boolean; group_name text; labels text[]:='{}';
begin
 result:=public.lineup_candidate_option(actor,w,emp,target,excluded,need);
 if target->>'time_basis' in ('unresolved','legacy_unverified') or nullif(target->>'start_time','') is null
  or nullif(target->>'end_time','') is null or (target->>'start_time')::time=(target->>'end_time')::time then
  return result||jsonb_build_object('display_group','not_suitable','context_labels','[]'::jsonb);
 end if;
 select timezone into tz from public.locations where workspace_id=w and id=loc;
 span:=public.lineup_shift_range(d,(target->>'start_time')::time,(target->>'end_time')::time,
  coalesce(nullif(target->>'time_timezone',''),nullif(target->'time_snapshot'->>'timezone',''),tz));
 calendar_day:=tstzrange(d::timestamp at time zone tz,(d+1)::timestamp at time zone tz,'[)');
 missing_location:=not exists(select 1 from public.employee_location_assignments a
  where a.workspace_id=w and a.employee_id=emp and a.location_id=loc
   and a.assigned_at<=lower(span) and (a.ended_at is null or a.ended_at>=upper(span)));
 missing_job:=not exists(select 1 from public.employee_job_assignments a
  where a.workspace_id=w and a.employee_id=emp and a.job_id=(target->>'job_id')::uuid
   and a.assigned_at<=lower(span) and (a.ended_at is null or a.ended_at>=upper(span)));

 -- Display the published responsibility, including an excluded source being edited.
 -- Other locations expose only a busy flag, never their names or position details.
 select coalesce(bool_or(s.location_id<>loc and r && span),false),
  coalesce(array_agg(distinct j.name order by j.name) filter(where s.location_id=loc and r && span),'{}'),
  coalesce(bool_or(case when r is null
   then s.scheduled_date=d else r && calendar_day end),false)
 into elsewhere,here_jobs,has_day_shift
 from public.schedule_published_shifts s
 join public.schedule_location_publications p on p.id=s.publication_id and p.workspace_id=w and p.status='current'
 join public.locations l on l.id=s.location_id and l.workspace_id=w
 join public.jobs j on j.id=s.job_id and j.workspace_id=w
 cross join lateral (select case when s.start_time is not null and s.end_time is not null and s.start_time<>s.end_time
  and s.time_basis not in ('unresolved','legacy_unverified') then public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,
  coalesce(nullif(s.time_timezone,''),nullif(s.time_snapshot->>'timezone',''),l.timezone)) end r) hours
 where s.workspace_id=w and s.employee_id=emp and s.scheduled_date between d-2 and d+2;

 group_name:=case when missing_location then 'missing_location' when missing_job then 'missing_job'
  when elsewhere then 'working_elsewhere' when cardinality(here_jobs)>0 then 'working_here'
  when not has_day_shift then 'day_off'
  when result->>'status'<>'eligible' or coalesce((result->>'has_availability_conflict')::boolean,false) then 'not_suitable'
  else 'eligible' end;
 if missing_job and group_name<>'missing_job' then labels:=array_append(labels,'Not assigned to this job'); end if;
 if elsewhere and group_name<>'working_elsewhere' then labels:=array_append(labels,'Working somewhere else'); end if;
 if cardinality(here_jobs)>0 then labels:=array_append(labels,'Working here as '||array_to_string(here_jobs,', ')); end if;
 if not has_day_shift and group_name<>'day_off' then labels:=array_append(labels,'Day off'); end if;
 return result||jsonb_build_object('display_group',group_name,'context_labels',to_jsonb(labels));
end; $$;

do $candidate_groups$
declare body text; anchor text;
begin
 -- Reuse the already-computed assessment, even when an actual blocker wins.
 body:=pg_get_functiondef('public.weekly_lineup_manager_candidate(uuid,uuid,jsonb,uuid[],integer)'::regprocedure);
 anchor:='jsonb_build_object(''availability_warning'',case';
 if position(anchor in body)=0 then raise exception 'Manager candidate projection changed'; end if;
 execute replace(body,anchor,'jsonb_build_object(''has_availability_conflict'',coalesce((a->>''has_availability_conflict'')::boolean,false),''availability_warning'',case');

 body:=pg_get_functiondef('public.lineup_operations_service(uuid,uuid,text,jsonb)'::regprocedure);
 anchor:='public.lineup_candidate_option(actor,w,e.id,target,excluded,src)';
 if position(anchor in body)=0 then raise exception 'Candidate list query changed'; end if;
 execute replace(body,anchor,'public.weekly_lineup_candidate_option(actor,w,e.id,target,excluded,src)');
end; $candidate_groups$;

revoke all on function public.weekly_lineup_candidate_option(uuid,uuid,uuid,jsonb,uuid[],jsonb)
 from public,anon,authenticated,service_role;
