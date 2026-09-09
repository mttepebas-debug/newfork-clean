-- Requested periods are immutable. Decisions may change status, never the hours
-- the employee asked for. Old rows retain an explicit legacy-location basis.
alter table public.schedule_time_off_requests add column period_version integer not null default 1 check(period_version in(1,2));
alter table public.schedule_time_off_segments
 add column time_timezone text,
 add column starts_at timestamptz,
 add column ends_at timestamptz,
 add column ends_next_day boolean not null default false,
 add column fold_choices jsonb not null default '{}'::jsonb check(jsonb_typeof(fold_choices)='object'),
 add constraint time_off_period_snapshot_complete check(
  (time_timezone is null and starts_at is null and ends_at is null) or
  (time_timezone is not null and starts_at is not null and ends_at is not null and ends_at>starts_at));
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.schedule_time_off_segments'::regclass
  and contype='c' and pg_get_constraintdef(oid) like '%start_time%' loop
  execute format('alter table public.schedule_time_off_segments drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.schedule_time_off_segments add constraint time_off_period_clocks check(
 (start_time is null and end_time is null and not ends_next_day) or
 (start_time is not null and end_time is not null and (start_time<>end_time or ends_next_day)));

create table public.time_off_commands(
 workspace_id uuid not null references public.workspaces(id),
 actor_user_id uuid not null references auth.users(id),
 operation_id uuid not null,
 input jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(workspace_id,actor_user_id,operation_id));
alter table public.time_off_commands enable row level security;
revoke all on public.time_off_commands from public,anon,authenticated,service_role;

create function public.time_off_resolve_clock(wall timestamp,zone_name text,fold_choice text default null)
returns timestamptz language plpgsql stable set search_path='' as $$
declare candidates timestamptz[];
begin
 if not exists(select 1 from pg_timezone_names where name=zone_name) then raise exception 'Choose a valid time zone' using errcode='22023'; end if;
 if fold_choice is not null and fold_choice not in('earlier','later') then raise exception 'Choose the first or second occurrence of the repeated time' using errcode='22023'; end if;
 select array_agg(distinct instant order by instant) into candidates from (
  select (wall at time zone 'UTC')-make_interval(secs=>public.availability_utc_offset((wall at time zone zone_name)+probe,zone_name)) instant
   from unnest(array[interval '-2 days',interval '-1 day',interval '0',interval '1 day',interval '2 days']) probe
 ) attempts where instant at time zone zone_name=wall;
 if coalesce(cardinality(candidates),0)=0 then raise exception 'These hours do not exist on this date in the selected time zone' using errcode='22023'; end if;
 if cardinality(candidates)>1 and fold_choice is null then raise exception 'This clock repeats on this date. Choose its first or second occurrence' using errcode='22023'; end if;
 return candidates[case when fold_choice='later' then cardinality(candidates) else 1 end];
end $$;

create function public.time_off_resolve_period(period jsonb,zone_name text)
returns jsonb language plpgsql stable set search_path='' as $$
declare day date; start_clock time; end_clock time; next_day boolean;
 local_start timestamp; local_end timestamp; span tstzrange; mask tstzmultirange; begin_at timestamptz; finish_at timestamptz;
begin
 if jsonb_typeof(period) is distinct from 'object' or coalesce(period->>'segment_date','') !~ '^\d{4}-\d{2}-\d{2}$'
  or not exists(select 1 from pg_timezone_names where name=zone_name) then raise exception 'Choose a valid date and time zone' using errcode='22023'; end if;
 day:=(period->>'segment_date')::date;
 if period ? 'ends_next_day' and jsonb_typeof(period->'ends_next_day') is distinct from 'boolean' then raise exception 'Choose whether the period ends the next day' using errcode='22023'; end if;
 next_day:=coalesce((period->>'ends_next_day')::boolean,false);
 if (period->>'start_time' is null)<>(period->>'end_time' is null) then raise exception 'Enter both a start and an end time' using errcode='22023'; end if;
 if period->>'start_time' is null then
  if next_day then raise exception 'A full-day period already covers its calendar day' using errcode='22023'; end if;
  mask:=public.availability_calendar_mask(tstzrange((day-2)::timestamp at time zone 'UTC',(day+3)::timestamp at time zone 'UTC','[)'),zone_name,day,day);
  if isempty(mask) then raise exception 'This calendar day does not exist in the selected time zone' using errcode='22023'; end if;
  span:=range_merge(mask); begin_at:=lower(span); finish_at:=upper(span);
 else
  if period->>'start_time' !~ '^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$'
   or period->>'end_time' !~ '^(([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?|24:00(:00)?)$' then raise exception 'Enter valid clock hours' using errcode='22023'; end if;
  start_clock:=(period->>'start_time')::time; end_clock:=(period->>'end_time')::time;
  local_start:=day+start_clock; local_end:=day+end_clock+case when next_day then interval '1 day' else interval '0' end;
  if local_end<=local_start or local_end-local_start>interval '1 day' then raise exception 'Each period must end after its start and cover no more than one day' using errcode='22023'; end if;
  begin_at:=public.time_off_resolve_clock(local_start,zone_name,period->>'start_fold');
  finish_at:=public.time_off_resolve_clock(local_end,zone_name,period->>'end_fold');
  if finish_at<=begin_at then raise exception 'The resolved end must follow the start' using errcode='22023'; end if;
 end if;
 return jsonb_build_object('segment_date',day,'start_time',start_clock,'end_time',end_clock,'ends_next_day',next_day,
  'time_timezone',zone_name,'starts_at',begin_at,'ends_at',finish_at,
  'fold_choices',jsonb_strip_nulls(jsonb_build_object('start_fold',period->>'start_fold','end_fold',period->>'end_fold')));
end $$;

create function public.time_off_period_span(segment_id uuid) returns tstzrange language sql stable security definer set search_path='' as $$
 select case when s.starts_at is not null then tstzrange(s.starts_at,s.ends_at,'[)')
  when s.start_time is null then tstzrange(s.segment_date::timestamp at time zone l.timezone,(s.segment_date+1)::timestamp at time zone l.timezone,'[)')
  else tstzrange((s.segment_date+s.start_time) at time zone l.timezone,
   (s.segment_date+s.end_time+case when s.end_time<=s.start_time then interval '1 day' else interval '0' end) at time zone l.timezone,'[)') end
 from public.schedule_time_off_segments s join public.schedule_time_off_requests r on r.id=s.request_id and r.workspace_id=s.workspace_id
 join public.locations l on l.id=r.location_id and l.workspace_id=r.workspace_id where s.id=segment_id;
$$;

create function public.guard_time_off_requested_period() returns trigger language plpgsql security definer set search_path='' as $$
declare parent public.schedule_time_off_requests%rowtype; zone_name text; resolved jsonb;
begin
 select * into parent from public.schedule_time_off_requests where id=coalesce(new.request_id,old.request_id);
 if tg_op in('UPDATE','DELETE') and (old.starts_at is not null or parent.period_version=2) then
  if tg_op='DELETE' or (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then
   raise exception 'Requested time-off periods are immutable; submit a new request to change the hours' using errcode='55000'; end if;
 end if;
 if tg_op='INSERT' and (parent.period_version=2 or new.time_timezone is not null) then
  if parent.status<>'pending' then raise exception 'Requested periods can only be added to a pending request' using errcode='55000'; end if;
  select timezone into zone_name from public.locations where id=parent.location_id and workspace_id=parent.workspace_id;
  resolved:=public.time_off_resolve_period(jsonb_build_object('segment_date',new.segment_date,'start_time',new.start_time,'end_time',new.end_time,
   'ends_next_day',new.ends_next_day)||new.fold_choices,zone_name);
  if (new.time_timezone,new.starts_at,new.ends_at) is distinct from
   (resolved->>'time_timezone',(resolved->>'starts_at')::timestamptz,(resolved->>'ends_at')::timestamptz) then
   raise exception 'Requested time-off clock and time-zone snapshot must agree' using errcode='22023'; end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger b_time_off_requested_period before insert or update or delete on public.schedule_time_off_segments
 for each row execute function public.guard_time_off_requested_period();
create function public.guard_time_off_request_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if old.period_version=2 and (new.id,new.workspace_id,new.employee_id,new.location_id,new.request_type,new.reason,new.created_by,new.created_at,new.period_version)
  is distinct from (old.id,old.workspace_id,old.employee_id,old.location_id,old.request_type,old.reason,old.created_by,old.created_at,old.period_version) then
  raise exception 'The original time-off request is immutable' using errcode='55000'; end if;
 return new;
end $$;
create trigger b_time_off_request_identity before update on public.schedule_time_off_requests for each row execute function public.guard_time_off_request_identity();

create function public.submit_employee_time_off_periods_service(actor_user_id uuid,target_workspace_id uuid,target_location_id uuid,
 target_reason text,target_periods jsonb,target_operation_id uuid,target_expected_timezone text) returns jsonb language plpgsql security definer set search_path='' as $$
declare employee public.employee_profiles%rowtype; zone_name text; command jsonb; prior public.time_off_commands%rowtype;
 period jsonb; resolved jsonb; periods jsonb:='[]'; span tstzrange; covered tstzmultirange:='{}'; request_id uuid; result jsonb;
begin
 perform public.availability_lock_workspace(target_workspace_id);
 employee:=public.employee_hub_actor_service(actor_user_id,target_workspace_id);
 if target_operation_id is null then raise exception 'A request key is required' using errcode='22023'; end if;
 command:=jsonb_build_object('location_id',target_location_id,'reason',btrim(coalesce(target_reason,'')),'periods',target_periods,'expected_timezone',target_expected_timezone);
 select * into prior from public.time_off_commands c where c.workspace_id=target_workspace_id and c.actor_user_id=submit_employee_time_off_periods_service.actor_user_id and c.operation_id=target_operation_id;
 if found then
  if prior.input<>command then raise exception 'This request key was used for different time-off hours' using errcode='40001'; end if;
  return prior.result;
 end if;
 if jsonb_typeof(target_periods) is distinct from 'array' then raise exception 'Enter the requested time-off periods' using errcode='22023'; end if;
 if jsonb_array_length(target_periods) not between 1 and 124 or char_length(btrim(coalesce(target_reason,'')))>1000 then raise exception 'Enter between 1 and 124 periods and a note of at most 1000 characters' using errcode='22023'; end if;
 select l.timezone into zone_name from public.locations l where l.id=target_location_id and l.workspace_id=target_workspace_id and l.archived_at is null
  and exists(select 1 from public.employee_location_assignments a where a.workspace_id=target_workspace_id and a.employee_id=employee.id and a.location_id=l.id and a.ended_at is null);
 if zone_name is null then raise exception 'employee location access denied' using errcode='42501'; end if;
 if target_expected_timezone is distinct from zone_name then raise exception 'The location time zone changed. Review the requested hours in the current time zone before submitting' using errcode='40001'; end if;
 for period in select value from jsonb_array_elements(target_periods) loop
  resolved:=public.time_off_resolve_period(period,zone_name);
  if (resolved->>'segment_date')::date<(now() at time zone zone_name)::date then raise exception 'Choose today or a future date in the location time zone' using errcode='22023'; end if;
  span:=tstzrange((resolved->>'starts_at')::timestamptz,(resolved->>'ends_at')::timestamptz,'[)');
  if covered && span then raise exception 'Requested time-off periods must not overlap or repeat' using errcode='22023'; end if;
  covered:=covered+tstzmultirange(span); periods:=periods||jsonb_build_array(resolved);
 end loop;
 if (select count(distinct p->>'segment_date') from jsonb_array_elements(periods) p)>31 then raise exception 'Request at most 31 calendar dates at a time' using errcode='22023'; end if;
 if exists(select 1 from public.schedule_time_off_requests r join public.schedule_time_off_segments s on s.request_id=r.id and s.workspace_id=r.workspace_id
  where r.workspace_id=target_workspace_id and r.employee_id=employee.id and r.request_type='time_off'
   and r.status in('pending','approved','partially_approved') and s.status in('pending','approved') and covered && public.time_off_period_span(s.id)) then
  raise exception 'overlapping time off request exists' using errcode='23514'; end if;
 insert into public.schedule_time_off_requests(workspace_id,employee_id,location_id,reason,created_by,period_version)
  values(target_workspace_id,employee.id,target_location_id,btrim(coalesce(target_reason,'')),actor_user_id,2) returning id into request_id;
 insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date,start_time,end_time,time_timezone,starts_at,ends_at,ends_next_day,fold_choices)
  select target_workspace_id,request_id,(p->>'segment_date')::date,(p->>'start_time')::time,(p->>'end_time')::time,p->>'time_timezone',
   (p->>'starts_at')::timestamptz,(p->>'ends_at')::timestamptz,(p->>'ends_next_day')::boolean,p->'fold_choices' from jsonb_array_elements(periods) p;
 insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,metadata)
  values(target_workspace_id,request_id,'submitted',actor_user_id,jsonb_build_object('periods',periods,'operation_id',target_operation_id));
 result:=jsonb_build_object('status','pending','request_id',request_id,'revision',1);
 insert into public.time_off_commands(workspace_id,actor_user_id,operation_id,input,result) values(target_workspace_id,actor_user_id,target_operation_id,command,result);
 return result;
end $$;

-- Compatibility dates use the same snapshot and physical-overlap writer.
create or replace function public.submit_employee_time_off_service(actor_user_id uuid,target_workspace_id uuid,target_location_id uuid,target_reason text,target_dates date[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare periods jsonb; zone_name text;
begin
 if coalesce(cardinality(target_dates),0) not between 1 and 31 or array_position(target_dates,null) is not null then raise exception 'valid future time off dates required' using errcode='22023'; end if;
 select jsonb_agg(jsonb_build_object('segment_date',requested_day) order by requested_day) into periods from (select distinct unnest(target_dates) as requested_day) dates;
 perform public.availability_lock_workspace(target_workspace_id);
 select timezone into zone_name from public.locations where id=target_location_id and workspace_id=target_workspace_id;
 return public.submit_employee_time_off_periods_service(actor_user_id,target_workspace_id,target_location_id,target_reason,periods,gen_random_uuid(),zone_name);
end $$;

create function public.time_off_request_periods(request_id uuid,w uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'segment_date',s.segment_date,'start_time',s.start_time,'end_time',s.end_time,'status',s.status,
  'ends_next_day',case when s.starts_at is null then coalesce(s.end_time<s.start_time,false) else s.ends_next_day end,
  'time_timezone',coalesce(s.time_timezone,l.timezone),'starts_at',lower(public.time_off_period_span(s.id)),'ends_at',upper(public.time_off_period_span(s.id)),
  'time_source',case when s.starts_at is null then 'legacy_location' else 'snapshot' end,'fold_choices',s.fold_choices)
  order by s.segment_date,s.start_time,s.id),'[]')
 from public.schedule_time_off_segments s join public.schedule_time_off_requests r on r.id=s.request_id and r.workspace_id=s.workspace_id
 join public.locations l on l.id=r.location_id and l.workspace_id=r.workspace_id where s.request_id=time_off_request_periods.request_id and s.workspace_id=w;
$$;

-- Enrich only rows already authorized by the existing read services.
do $time_off_read$
declare body text; anchor text;
begin
 body:=pg_get_functiondef('public.get_employee_hub_service(uuid,uuid,date,date)'::regprocedure);
 anchor:='''id'',request.id,''shift_id'',null,''kind'',''time_off'',';
 if position(anchor in body)=0 then raise exception 'Employee time-off projection changed'; end if;
 execute replace(body,anchor,anchor||'''periods'',public.time_off_request_periods(request.id,target_workspace_id),');
 body:=pg_get_functiondef('public.get_schedule_requests_service(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,integer)'::regprocedure);
 anchor:='''segments'',coalesce((select jsonb_agg(jsonb_build_object(''id'',s.id,''segment_date'',s.segment_date,''start_time'',s.start_time,''end_time'',s.end_time,''status'',s.status) order by s.segment_date,s.start_time) from public.schedule_time_off_segments s where s.request_id=r.id),''[]'')';
 if position(anchor in body)=0 then raise exception 'Manager time-off projection changed'; end if;
 execute replace(body,anchor,'''segments'',public.time_off_request_periods(r.id,target_workspace_id)');
 body:=pg_get_functiondef('public.employee_request_action_service(uuid,uuid,uuid,text,text,integer)'::regprocedure);
 anchor:='employee:=public.employee_hub_actor_service(actor_user_id,target_workspace_id);';
 if position(anchor in body)=0 then raise exception 'Employee request lock entry changed'; end if;
 execute replace(body,anchor,'perform public.availability_lock_workspace(target_workspace_id);'||chr(10)||anchor);
end $time_off_read$;

do $time_off_assessment$
declare body text; old_fragment text; begin_pos integer; end_pos integer;
begin
 body:=pg_get_functiondef('public.assess_shift_availability(uuid,uuid,jsonb)'::regprocedure);
 begin_pos:=position(' for leave_row in select seg.*' in body);
 end_pos:=position(' select coalesce(jsonb_agg(jsonb_build_object(''request_id'',r.id' in body);
 if begin_pos=0 or end_pos<=begin_pos then raise exception 'Canonical approved-leave assessment changed'; end if;
 old_fragment:=substring(body from begin_pos for end_pos-begin_pos);
 execute replace(body,old_fragment,$assessment$
 for leave_row in select seg.*,req.revision request_revision,req.status request_status,req_loc.timezone location_timezone
  from public.schedule_time_off_segments seg join public.schedule_time_off_requests req on req.id=seg.request_id and req.workspace_id=seg.workspace_id
  join public.locations req_loc on req_loc.id=req.location_id and req_loc.workspace_id=w
  where req.workspace_id=w and req.employee_id=emp and req.request_type='time_off' and req.status in('approved','partially_approved') and seg.status='approved'
   and seg.segment_date between day-3 and day+3 order by seg.id loop
  leave_zone:=coalesce(leave_row.time_timezone,leave_row.location_timezone);
  leave_span:=public.time_off_period_span(leave_row.id);
  if leave_span && coalesce(span,day_span) then
   leave_ranges:=leave_ranges+tstzmultirange(leave_span*coalesce(span,day_span));
   leave_evidence:=leave_evidence||jsonb_build_array(jsonb_build_object('segment_id',leave_row.id,'request_id',leave_row.request_id,'request_revision',leave_row.request_revision,
    'timezone',leave_zone,'timezone_source',case when leave_row.starts_at is null then 'legacy_location' else 'snapshot' end,
    'intervals',public.availability_ranges_json(tstzmultirange(leave_span*coalesce(span,day_span)))));
  end if;
 end loop;
$assessment$);
end $time_off_assessment$;

revoke all on function public.time_off_resolve_clock(timestamp,text,text),public.time_off_resolve_period(jsonb,text),
 public.time_off_period_span(uuid),public.guard_time_off_requested_period(),public.guard_time_off_request_identity(),
 public.time_off_request_periods(uuid,uuid),public.submit_employee_time_off_periods_service(uuid,uuid,uuid,text,jsonb,uuid,text)
 from public,anon,authenticated,service_role;
grant execute on function public.submit_employee_time_off_periods_service(uuid,uuid,uuid,text,jsonb,uuid,text) to service_role;
