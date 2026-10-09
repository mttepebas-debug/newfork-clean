-- A physical calendar projection, using the same approved capacity and leave
-- resolvers as Schedule. Read-only; pending proposals never become capacity.
create function public.availability_calendar_read_service(actor uuid,w uuid,employee_id uuid,starts_on date,zone_name text,day_count integer default 7)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare emp uuid; revision integer; day date; day_span tstzrange; capacity public.availability_capacity_result;
 leave_ranges tstzmultirange; days jsonb:='[]';
begin
 select e.id into emp from public.employee_profiles e where e.workspace_id=w and e.archived_at is null
  and case when employee_id is null then e.user_id=actor else e.id=employee_id end;
 if emp is null or not public.availability_actor_scope(actor,w,emp,false) then raise exception 'Availability access denied' using errcode='42501'; end if;
 if starts_on is null or not isfinite(starts_on) or starts_on<'1900-01-01'::date or starts_on>'2199-12-01'::date
  or day_count is null or day_count<1 or day_count>31 or not exists(select 1 from pg_timezone_names where name=zone_name) then
  raise exception 'Choose a valid date, time zone and up to 31 calendar days' using errcode='22023'; end if;
 select coalesce(max(version_number),0) into revision from public.employee_schedule_availability_versions v where v.workspace_id=w and v.employee_id=emp;
 for offset_day in 0..day_count-1 loop
  day:=starts_on+offset_day;
  day_span:=tstzrange(day::timestamp at time zone zone_name,(day+1)::timestamp at time zone zone_name,'[)');
  capacity:=public.availability_capacity_for_span(w,emp,day_span);
  select coalesce(range_agg(p.span*day_span),'{}') into leave_ranges
   from public.schedule_time_off_segments s join public.schedule_time_off_requests r on r.id=s.request_id and r.workspace_id=s.workspace_id
   cross join lateral unnest(public.time_off_effective_ranges(s.id)) p(span)
   where r.workspace_id=w and r.employee_id=emp and r.request_type='time_off' and r.status in('approved','partially_approved')
    and s.status='approved' and s.segment_date between day-3 and day+3 and p.span && day_span;
  days:=days||jsonb_build_array(jsonb_build_object('date',day,'starts_at',lower(day_span),'ends_at',upper(day_span),
   'available',public.availability_ranges_json(capacity.available),'unavailable',public.availability_ranges_json(capacity.unavailable),
   'unknown',public.availability_ranges_json(capacity.unknown),'approved_leave',public.availability_ranges_json(leave_ranges),
   'planning_available',public.availability_ranges_json(capacity.available-leave_ranges),
   'shift_type_rules',public.availability_shift_type_rules(w,emp,day_span),'sources',capacity.sources));
 end loop;
 return jsonb_build_object('employee_id',emp,'revision',revision,'timezone',zone_name,'starts_on',starts_on,'ends_on',starts_on+day_count-1,'days',days);
end $$;
revoke all on function public.availability_calendar_read_service(uuid,uuid,uuid,date,text,integer) from public,anon,authenticated;
grant execute on function public.availability_calendar_read_service(uuid,uuid,uuid,date,text,integer) to service_role;

-- Existing consumers receive the current seven physical calendar days. Keep
-- the original service private, including when called from onboarding.
do $calendar$ begin
 execute replace(pg_get_functiondef('public.availability_read_service(uuid,uuid,uuid)'::regprocedure),'availability_read_service','availability_read_before_calendar_service');
end $calendar$;
revoke all on function public.availability_read_before_calendar_service(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create or replace function public.availability_read_service(actor uuid,w uuid,employee_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; zone_name text;
begin
 result:=public.availability_read_before_calendar_service(actor,w,employee_id);
 zone_name:=coalesce(result->'current'->>'timezone',result->'latest'->>'timezone','UTC');
 return result||jsonb_build_object('calendar',public.availability_calendar_read_service(actor,w,(result->>'employee_id')::uuid,(now() at time zone zone_name)::date,zone_name,7));
end $$;
revoke all on function public.availability_read_service(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.availability_read_service(uuid,uuid,uuid) to service_role;
