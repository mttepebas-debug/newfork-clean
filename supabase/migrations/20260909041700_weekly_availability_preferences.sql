-- Created with the CLI; ordered after the existing future-dated catalog chain.
-- Additive foundation only. Existing scheduling consumers are not switched here.
create function public.weekly_preference_valid(preference jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare rule jsonb; mode text; seen integer[]:='{}'; weekday integer; ids uuid[];
begin
 if jsonb_typeof(preference) is distinct from 'object' then return false; end if;
 mode:=preference->>'input_mode';
 if mode is null or mode not in ('shift_type','time_range') or jsonb_typeof(preference->'days') is distinct from 'array'
  or jsonb_array_length(preference->'days')<>7 then return false; end if;
 for rule in select value from jsonb_array_elements(preference->'days') loop
  if jsonb_typeof(rule) is distinct from 'object' or jsonb_typeof(rule->'day') is distinct from 'number'
   or (rule->>'day') !~ '^[0-6]$' or jsonb_typeof(rule->'all_day') is distinct from 'boolean'
   or jsonb_typeof(rule->'shift_type_ids') is distinct from 'array' or not rule ? 'range' then return false; end if;
  weekday:=(rule->>'day')::integer;
  if weekday=any(seen) then return false; end if;
  seen:=array_append(seen,weekday);
  if jsonb_array_length(rule->'shift_type_ids')>64 or exists(select 1 from jsonb_array_elements(rule->'shift_type_ids') x where jsonb_typeof(x)<>'string') then return false; end if;
  select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(rule->'shift_type_ids');
  if cardinality(ids)<>(select count(distinct id) from unnest(ids) id) then return false; end if;
  if (rule->>'all_day')::boolean and (cardinality(ids)>0 or rule->'range'<>'null'::jsonb) then return false; end if;
  if mode='time_range' and cardinality(ids)>0 then return false; end if;
  if mode='shift_type' and rule->'range'<>'null'::jsonb then return false; end if;
  if rule->'range'<>'null'::jsonb then
   if jsonb_typeof(rule->'range') is distinct from 'object'
    or jsonb_typeof(rule->'range'->'start') is distinct from 'string' or jsonb_typeof(rule->'range'->'end') is distinct from 'string'
    or (rule->'range'->>'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or (rule->'range'->>'end') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
    or (rule->'range'->>'end')<=(rule->'range'->>'start') then return false; end if;
  end if;
 end loop;
 return true;
exception when invalid_text_representation or invalid_parameter_value then return false;
end; $$;
revoke all on function public.weekly_preference_valid(jsonb) from public,anon,authenticated,service_role;

create function public.empty_weekly_preference(mode text) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('input_mode',mode,'days',jsonb_agg(jsonb_build_object('day',day,'all_day',false,'shift_type_ids','[]'::jsonb,'range',null) order by day))
 from generate_series(0,6) day;
$$;
revoke all on function public.empty_weekly_preference(text) from public,anon,authenticated,service_role;

alter table public.workspace_scheduling_settings
 add column availability_input_mode text not null default 'time_range' check(availability_input_mode in ('time_range','shift_type')),
 add column availability_warning_policy text not null default 'warn' check(availability_warning_policy in ('warn','confirm')),
 add column availability_onboarding_required boolean not null default false,
 add column availability_preferences_revision integer not null default 0 check(availability_preferences_revision>=0);

create table public.employee_weekly_preferences(
 workspace_id uuid not null,
 employee_id uuid not null,
 preference jsonb not null check(public.weekly_preference_valid(preference)),
 revision integer not null check(revision>0),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(workspace_id,employee_id),
 foreign key(workspace_id,employee_id) references public.employee_profiles(workspace_id,id) on delete cascade
);
create table public.manager_weekly_reminders(
 workspace_id uuid not null,
 employee_id uuid not null,
 preference jsonb not null check(public.weekly_preference_valid(preference)),
 enabled boolean not null default true,
 notes text[] not null default array['','','','','','',''] check(array_length(notes,1)=7 and array_position(notes,null) is null and array_lower(notes,1)=1),
 revision integer not null check(revision>0),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(workspace_id,employee_id),
 foreign key(workspace_id,employee_id) references public.employee_profiles(workspace_id,id) on delete cascade
);
alter table public.employee_weekly_preferences enable row level security;
alter table public.manager_weekly_reminders enable row level security;
revoke all on table public.employee_weekly_preferences,public.manager_weekly_reminders from public,anon,authenticated,service_role;

-- Keep the last valid default even after logical or physical catalog deletion.
create table public.weekly_preference_type_defaults(
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 shift_type_id uuid not null,
 name text not null,
 start_time time not null,
 end_time time not null,
 primary key(workspace_id,shift_type_id),
 check(start_time<>end_time)
);
alter table public.weekly_preference_type_defaults enable row level security;
revoke all on table public.weekly_preference_type_defaults from public,anon,authenticated,service_role;
insert into public.weekly_preference_type_defaults(workspace_id,shift_type_id,name,start_time,end_time)
 select workspace_id,id,name,default_start_time,default_end_time from public.shift_types
 where default_start_time is not null and default_end_time is not null and default_start_time<>default_end_time;

create function public.capture_weekly_preference_type_defaults() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_value public.shift_types%rowtype;
begin
 if tg_op='DELETE' then
  if old.archived_at is not null or old.deleted_at is not null then return old; end if;
  row_value:=old;
 elsif new.archived_at is null and new.deleted_at is null then row_value:=new;
 elsif tg_op='UPDATE' and old.archived_at is null and old.deleted_at is null then row_value:=old;
 else return new; end if;
 if row_value.default_start_time is not null and row_value.default_end_time is not null and row_value.default_start_time<>row_value.default_end_time then
  insert into public.weekly_preference_type_defaults(workspace_id,shift_type_id,name,start_time,end_time)
   values(row_value.workspace_id,row_value.id,row_value.name,row_value.default_start_time,row_value.default_end_time)
   on conflict(workspace_id,shift_type_id) do update set name=excluded.name,start_time=excluded.start_time,end_time=excluded.end_time;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
revoke all on function public.capture_weekly_preference_type_defaults() from public,anon,authenticated,service_role;
create trigger weekly_preference_type_defaults after insert or update or delete on public.shift_types
 for each row execute function public.capture_weekly_preference_type_defaults();

create function public.weekly_preference_manager_scope(actor uuid,w uuid,emp uuid,capability text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.employee_profiles e where e.workspace_id=w and e.id=emp and (
  exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=emp and a.ended_at is null
   and public.schedule_actor_has_capability_service(actor,w,capability,a.location_id))
  or exists(select 1 from public.workspace_memberships m where m.workspace_id=w and m.user_id=actor and m.all_locations
   and public.schedule_actor_has_capability_service(actor,w,capability,null))
 ));
$$;
revoke all on function public.weekly_preference_manager_scope(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;

create function public.weekly_preference_intersections(w uuid,preference jsonb,target_span tstzrange,zone_name text) returns tstzmultirange
language plpgsql stable security definer set search_path='' as $$
declare result tstzmultirange:='{}'; piece record; local_day date; last_day date; rule jsonb; type_id uuid;
 clocks jsonb; clock jsonb; start_clock time; end_clock time; candidate tstzrange; local_start timestamp; local_end timestamp;
begin
 if not public.weekly_preference_valid(preference) then raise exception 'Invalid weekly preferences' using errcode='22023'; end if;
 if zone_name is null or not exists(select 1 from pg_timezone_names where name=zone_name) then raise exception 'Valid location timezone required' using errcode='22023'; end if;
 if target_span is null or isempty(target_span) then return result; end if;
 for piece in select * from public.availability_offset_segments(target_span,zone_name) loop
  local_day:=((lower(piece.utc_span) at time zone 'UTC')+make_interval(secs=>piece.offset_seconds))::date-1;
  last_day:=((upper(piece.utc_span) at time zone 'UTC')+make_interval(secs=>piece.offset_seconds))::date;
  while local_day<=last_day loop
   select value into rule from jsonb_array_elements(preference->'days') where (value->>'day')::integer=extract(dow from local_day)::integer;
   clocks:='[]';
   if (rule->>'all_day')::boolean then clocks:='[{"start":"00:00","end":"24:00"}]';
   elsif preference->>'input_mode'='time_range' and rule->'range'<>'null'::jsonb then clocks:=jsonb_build_array(rule->'range');
   elsif preference->>'input_mode'='shift_type' then
    for type_id in select value::uuid from jsonb_array_elements_text(rule->'shift_type_ids') loop
     select case when t.id is not null and t.archived_at is null and t.deleted_at is null then t.default_start_time else d.start_time end,
      case when t.id is not null and t.archived_at is null and t.deleted_at is null then t.default_end_time else d.end_time end
      into start_clock,end_clock
     from (select type_id id) selected left join public.shift_types t on t.workspace_id=w and t.id=selected.id
      left join public.weekly_preference_type_defaults d on d.workspace_id=w and d.shift_type_id=selected.id;
     if start_clock is null or end_clock is null or start_clock=end_clock then raise exception 'Selected shift type has no valid default hours' using errcode='22023'; end if;
     clocks:=clocks||jsonb_build_array(jsonb_build_object('start',start_clock,'end',end_clock));
    end loop;
   end if;
   for clock in select value from jsonb_array_elements(clocks) loop
    start_clock:=(clock->>'start')::time; end_clock:=(clock->>'end')::time;
    local_start:=local_day+start_clock;
    local_end:=local_day+end_clock+case when end_clock<start_clock then interval '1 day' else interval '0' end;
    candidate:=tstzrange((local_start at time zone 'UTC')-make_interval(secs=>piece.offset_seconds),
     (local_end at time zone 'UTC')-make_interval(secs=>piece.offset_seconds),'[)');
    if candidate && piece.utc_span then result:=result+tstzmultirange(candidate*piece.utc_span); end if;
   end loop;
   local_day:=local_day+1;
  end loop;
 end loop;
 return result;
end; $$;
revoke all on function public.weekly_preference_intersections(uuid,jsonb,tstzrange,text) from public,anon,authenticated,service_role;

create function public.weekly_preference_capacity(w uuid,emp uuid,target_span tstzrange,zone_name text,proposed jsonb default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare employee_week jsonb; manager_week jsonb; employee_ranges tstzmultirange:='{}'; manager_ranges tstzmultirange:='{}';
begin
 if not exists(select 1 from public.employee_profiles where workspace_id=w and id=emp) then raise exception 'Employee not found' using errcode='42501'; end if;
 if target_span is null or isempty(target_span) then raise exception 'A valid assignment span is required' using errcode='22023'; end if;
 select preference into employee_week from public.employee_weekly_preferences where workspace_id=w and employee_id=emp;
 employee_week:=coalesce(proposed,employee_week,public.empty_weekly_preference('time_range'));
 employee_ranges:=public.weekly_preference_intersections(w,employee_week,target_span,zone_name);
 select preference into manager_week from public.manager_weekly_reminders where workspace_id=w and employee_id=emp and enabled;
 if manager_week is not null then manager_ranges:=public.weekly_preference_intersections(w,manager_week,target_span,zone_name); end if;
 return jsonb_build_object('employee_intervals',public.availability_ranges_json(employee_ranges),
  'manager_intervals',public.availability_ranges_json(manager_ranges),
  'unavailable_intervals',public.availability_ranges_json(employee_ranges+manager_ranges),
  'available_intervals',public.availability_ranges_json(tstzmultirange(target_span)-(employee_ranges+manager_ranges)));
end; $$;
revoke all on function public.weekly_preference_capacity(uuid,uuid,tstzrange,text,jsonb) from public,anon,authenticated,service_role;

create function public.weekly_preferences_read_service(actor uuid,w uuid,emp uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare employee public.employee_profiles%rowtype; settings public.workspace_scheduling_settings%rowtype;
 own_record boolean; can_manage boolean; can_view_manager boolean; employee_record jsonb; manager_record jsonb; types jsonb; selected_ids uuid[];
begin
 select * into employee from public.employee_profiles e where e.workspace_id=w and (e.id=emp or (emp is null and e.user_id=actor)) and e.archived_at is null;
 if employee.id is null then raise exception 'Employee not found' using errcode='42501'; end if;
 own_record:=employee.user_id=actor and exists(select 1 from public.workspace_memberships m where m.workspace_id=w and m.user_id=actor and m.status in ('active','pending_activation'));
 can_manage:=public.weekly_preference_manager_scope(actor,w,employee.id,'employees.manage');
 can_view_manager:=can_manage or public.weekly_preference_manager_scope(actor,w,employee.id,'employees.read');
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
  'settings',jsonb_build_object('input_mode',settings.availability_input_mode,'warning_policy',settings.availability_warning_policy,
   'onboarding_required',settings.availability_onboarding_required,'revision',settings.availability_preferences_revision),
  'employee',employee_record,'manager',manager_record,'shift_types',types,'time_format',settings.time_format);
end; $$;
revoke all on function public.weekly_preferences_read_service(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.weekly_preferences_read_service(uuid,uuid,uuid) to service_role;
