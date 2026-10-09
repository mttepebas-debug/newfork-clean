-- Generated with the CLI, then ordered after the existing forward migrations.
-- Display flags never select an assessment interval.
alter table public.shift_types add column default_revision integer not null default 1 check(default_revision>0);
create table public.shift_type_time_versions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  shift_type_id uuid not null,
  revision integer not null check(revision>0),
  start_time time, end_time time,
  created_at timestamptz not null default now(),
  primary key(workspace_id,shift_type_id,revision),
  foreign key(shift_type_id,workspace_id) references public.shift_types(id,workspace_id) on delete cascade,
  check((start_time is null)=(end_time is null)),check(start_time<>end_time)
);
alter table public.shift_type_time_versions enable row level security;
revoke all on public.shift_type_time_versions from public,anon,authenticated;
grant select on public.shift_type_time_versions to service_role;
insert into public.shift_type_time_versions(workspace_id,shift_type_id,revision,start_time,end_time)
select workspace_id,id,default_revision,default_start_time,default_end_time from public.shift_types;

create function public.version_shift_type_times() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then new.default_revision:=1;
  elsif (new.default_start_time,new.default_end_time) is distinct from (old.default_start_time,old.default_end_time) then
    new.default_revision:=old.default_revision+1;
  else new.default_revision:=old.default_revision; end if;
  return new;
end; $$;
create function public.record_shift_type_times() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.shift_type_time_versions(workspace_id,shift_type_id,revision,start_time,end_time)
  values(new.workspace_id,new.id,new.default_revision,new.default_start_time,new.default_end_time) on conflict do nothing;
  return new;
end; $$;
revoke all on function public.version_shift_type_times(),public.record_shift_type_times() from public,anon,authenticated;
create trigger shift_type_time_revision before insert or update on public.shift_types for each row execute function public.version_shift_type_times();
create trigger shift_type_time_history after insert or update on public.shift_types for each row execute function public.record_shift_type_times();

do $$ declare tbl text; begin
  foreach tbl in array array['schedule_edit_session_shifts','schedule_draft_shifts','schedule_template_shifts','schedule_published_shifts'] loop
    execute format('alter table public.%I add column time_basis text not null default ''legacy_unverified'' check(time_basis in (''explicit'',''type_default'',''unresolved'',''legacy_unverified'')), add column time_snapshot jsonb, add column time_timezone text, alter column start_time drop not null, alter column end_time drop not null',tbl);
    -- Visible historical times were represented as planned clock times. Hidden records
    -- remain unverified; current defaults are never fabricated as historical evidence.
    execute format('update public.%I s set time_basis=case when not coalesce(s.hide_time_on_badge,false) then ''explicit'' else ''legacy_unverified'' end,time_timezone=l.timezone from public.locations l where l.id=s.location_id',tbl);
    execute format('alter table public.%I alter column time_basis drop default',tbl);
    execute format('alter table public.%I add constraint %I check ((time_basis=''unresolved'' and start_time is null and end_time is null and shift_type_id is not null) or (time_basis<>''unresolved'' and start_time is not null and end_time is not null and start_time<>end_time))',tbl,tbl||'_time_source_range');
  end loop;
end $$;

create function public.normalize_schedule_time_source(w uuid,payload jsonb,previous jsonb default null,preserve_saved_timezone boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare basis text; snap jsonb; tz text; source_type uuid; source_revision integer; ver public.shift_type_time_versions%rowtype;
begin
  select timezone into tz from public.locations where id=(payload->>'location_id')::uuid and workspace_id=w;
  if tz is null then raise exception 'invalid shift location' using errcode='23503'; end if;
  if previous is not null and payload->>'location_id'=previous->>'location_id' then
    tz:=coalesce(nullif(previous->>'time_timezone',''),tz);
  elsif preserve_saved_timezone then
    tz:=coalesce(nullif(payload->>'time_timezone',''),tz);
  end if;
  if not exists(select 1 from pg_timezone_names where name=tz) then
    raise exception 'Invalid shift timezone' using errcode='22023';
  end if;
  basis:=payload->>'time_basis';
  if basis is null and previous is not null then
    if previous->>'time_basis'='type_default' and
      (nullif(payload->>'start_time','')::time,nullif(payload->>'end_time','')::time) is distinct from
      (nullif(previous->>'start_time','')::time,nullif(previous->>'end_time','')::time) then
      raise exception 'Refresh the schedule before changing reference hours' using errcode='40001';
    end if;
    basis:=previous->>'time_basis'; snap:=previous->'time_snapshot';
  else snap:=payload->'time_snapshot'; end if;
  basis:=coalesce(basis,case when coalesce((payload->>'hide_time_on_badge')::boolean,false) then 'legacy_unverified' else 'explicit' end);
  if basis not in ('explicit','type_default','unresolved','legacy_unverified') then raise exception 'invalid shift time source' using errcode='22023'; end if;
  if basis='type_default' then
    if snap is null or snap='null'::jsonb then
      source_type:=(payload->>'shift_type_id')::uuid;
      select default_revision into source_revision from public.shift_types where id=source_type and workspace_id=w;
    else
      source_type:=(snap->>'shift_type_id')::uuid; source_revision:=(snap->>'default_revision')::integer;
    end if;
    select * into ver from public.shift_type_time_versions where workspace_id=w and shift_type_id=source_type and revision=source_revision;
    if ver.shift_type_id is null or ver.start_time is null or ver.end_time is null then
      raise exception 'This shift type has no reference hours. Enter hours or save an unresolved named draft.' using errcode='23514';
    end if;
    if snap is not null and snap<>'null'::jsonb and
      ((snap->>'start_time')::time,(snap->>'end_time')::time) is distinct from (ver.start_time,ver.end_time) then
      raise exception 'Shift default hours changed; refresh the reference before saving' using errcode='40001';
    end if;
    if previous is not null and payload->>'location_id'=previous->>'location_id' then
      tz:=coalesce(nullif(previous->>'time_timezone',''),tz);
    end if;
    snap:=jsonb_build_object('shift_type_id',source_type,'default_revision',source_revision,
      'start_time',to_char(ver.start_time,'HH24:MI'),'end_time',to_char(ver.end_time,'HH24:MI'),'timezone',tz);
    payload:=payload||jsonb_build_object('start_time',to_char(ver.start_time,'HH24:MI'),'end_time',to_char(ver.end_time,'HH24:MI'));
  elsif basis='unresolved' then
    if nullif(payload->>'shift_type_id','') is null then raise exception 'Choose a named shift or enter its hours' using errcode='22023'; end if;
    payload:=payload||jsonb_build_object('start_time',null,'end_time',null,'hide_time_on_badge',true); snap:=null;
  else
    if nullif(payload->>'start_time','') is null or nullif(payload->>'end_time','') is null
      or (payload->>'start_time')::time=(payload->>'end_time')::time then raise exception 'Valid shift start and end times required' using errcode='22023'; end if;
    snap:=null;
    if previous is not null and payload->>'location_id'=previous->>'location_id' then tz:=coalesce(nullif(previous->>'time_timezone',''),tz); end if;
  end if;
  return payload||jsonb_build_object('time_basis',basis,'time_snapshot',snap,'time_timezone',tz);
end; $$;
revoke all on function public.normalize_schedule_time_source(uuid,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.normalize_schedule_time_source(uuid,jsonb,jsonb,boolean) to service_role;

create function public.check_schedule_time_source() returns trigger language plpgsql security definer set search_path='' as $$
declare normalized jsonb;
begin
  if new.time_basis is null then
    new.time_basis:=case when coalesce(new.hide_time_on_badge,false) then 'legacy_unverified' else 'explicit' end;
  end if;
  if tg_table_name='schedule_published_shifts' then
   if new.employee_id is not null and new.time_basis in ('unresolved','legacy_unverified') and not exists (
      select 1 from public.schedule_published_shifts s where s.workspace_id=new.workspace_id
        and s.source_shift_id=new.source_shift_id and s.time_basis='legacy_unverified'
        and (s.employee_id,s.location_id,s.job_id,s.shift_type_id,s.scheduled_date,s.start_time,s.end_time)
          is not distinct from (new.employee_id,new.location_id,new.job_id,new.shift_type_id,new.scheduled_date,new.start_time,new.end_time)
    ) then
    raise exception 'Confirm shift hours before publishing an assignment' using errcode='23514';
   end if;
  end if;
  if new.time_basis='legacy_unverified' then return new; end if;
  normalized:=public.normalize_schedule_time_source(new.workspace_id,to_jsonb(new),case when tg_op='UPDATE' then to_jsonb(old) else null end,true);
  if (new.start_time,new.end_time) is distinct from
    (nullif(normalized->>'start_time','')::time,nullif(normalized->>'end_time','')::time) then
    raise exception 'The shift interval does not match its saved time source' using errcode='23514';
  end if;
  new.time_snapshot:=normalized->'time_snapshot'; new.time_timezone:=normalized->>'time_timezone';
  if new.time_basis='unresolved' then new.hide_time_on_badge:=true; end if;
  return new;
end; $$;
revoke all on function public.check_schedule_time_source() from public,anon,authenticated;
do $$ declare tbl text; begin
  foreach tbl in array array['schedule_edit_session_shifts','schedule_draft_shifts','schedule_template_shifts','schedule_published_shifts'] loop
    execute format('create trigger check_time_source before insert or update on public.%I for each row execute function public.check_schedule_time_source()',tbl);
  end loop;
end $$;

-- Replaced functions below preserve every existing authorization and wrapper contract.
-- Only explicit time-source propagation is added to their storage/read operations.






-- BEGIN propagated functions

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
        'availability', (select availability.recurring_rules
          from public.employee_schedule_availability_versions availability
          where availability.employee_id = employee.id
            and availability.effective_at <= now()
          order by availability.version_number desc limit 1)
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
          case when shift.employee_id is not null and exists (
            select 1
            from public.employee_schedule_availability_versions version,
              lateral jsonb_array_elements(version.recurring_rules) rule
            where version.employee_id = shift.employee_id
              and version.version_number = (
                select max(latest.version_number)
                from public.employee_schedule_availability_versions latest
                where latest.employee_id = shift.employee_id
              )
              and (rule->>'day')::integer = extract(dow from shift.scheduled_date)::integer
              and rule->>'mode' = 'unavailable'
          ) then 'availability' end,
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

CREATE OR REPLACE FUNCTION public.add_schedule_pending_op_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, target_op_type text, target_shift_id uuid DEFAULT NULL::uuid, target_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_session public.schedule_edit_sessions%rowtype;
  existing_shift public.schedule_edit_session_shifts%rowtype;
  created_id uuid := gen_random_uuid();
  next_location_id uuid;
  next_employee_id uuid;
  next_job_id uuid;
  next_shift_type_id uuid;
  next_scheduled_date date;
  next_start_time time;
  next_end_time time;
  next_unpaid_break_minutes integer;
  next_note text;
begin
  if target_op_type not in ('create', 'update', 'delete') then
    raise exception 'invalid pending op type' using errcode='22023';
  end if;

  select * into target_session
    from public.schedule_edit_sessions session
   where session.id = target_session_id
     and session.workspace_id = target_workspace_id
   for update;

  if target_session.id is null or target_session.holder_user_id <> actor_user_id then
    raise exception 'edit session not found' using errcode='P0002';
  end if;
  if target_session.status <> 'active' or target_session.expires_at <= now() then
    raise exception 'edit lease expired' using errcode='40001';
  end if;

  if target_op_type in ('update', 'delete') then
    select * into existing_shift
      from public.schedule_edit_session_shifts shift
     where shift.session_id = target_session_id
       and shift.id = target_shift_id
     for update;
    if existing_shift.id is null then
      raise exception 'shift not found' using errcode='P0002';
    end if;
  end if;

  next_location_id := coalesce(
    nullif(target_payload->>'location_id', '')::uuid,
    existing_shift.location_id
  );
  if not public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, next_location_id) then
    raise exception 'schedule pending-op scope denied' using errcode='42501';
  end if;

  if target_op_type in ('create','update') then
    target_payload:=public.normalize_schedule_time_source(target_workspace_id,case when target_payload ? 'time_basis' then coalesce(to_jsonb(existing_shift),'{}'::jsonb)||target_payload else (coalesce(to_jsonb(existing_shift),'{}'::jsonb)||target_payload)-'time_basis' end,case when existing_shift.id is not null then to_jsonb(existing_shift) else null end);
  end if;
  if target_op_type = 'create' then
    insert into public.schedule_edit_session_shifts(id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, note, pending_op_type, locked, hide_time_on_badge)
    values (created_id, target_workspace_id, target_session_id, next_location_id, nullif(target_payload->>'employee_id', '')::uuid, nullif(target_payload->>'job_id', '')::uuid, nullif(target_payload->>'shift_type_id', '')::uuid, (target_payload->>'scheduled_date')::date, nullif(target_payload->>'start_time','')::time, nullif(target_payload->>'end_time','')::time, target_payload->>'time_basis', target_payload->'time_snapshot', target_payload->>'time_timezone', coalesce((target_payload->>'unpaid_break_minutes')::integer, 0), coalesce(target_payload->>'note', ''), 'create', false, coalesce((target_payload->>'hide_time_on_badge')::boolean,false));
  else
    if target_op_type = 'delete' then
      update public.schedule_edit_session_shifts
         set pending_op_type = 'delete',
             locked = true,
             revision = revision + 1,
             updated_at = now()
       where session_id = target_session_id
         and id = existing_shift.id;
    else
      next_employee_id := coalesce(nullif(target_payload->>'employee_id', '')::uuid, existing_shift.employee_id);
      next_job_id := coalesce(nullif(target_payload->>'job_id', '')::uuid, existing_shift.job_id);
      next_shift_type_id := coalesce(nullif(target_payload->>'shift_type_id', '')::uuid, existing_shift.shift_type_id);
      next_scheduled_date := coalesce((target_payload->>'scheduled_date')::date, existing_shift.scheduled_date);
      next_start_time := nullif(target_payload->>'start_time','')::time;
      next_end_time := nullif(target_payload->>'end_time','')::time;
      next_unpaid_break_minutes := coalesce((target_payload->>'unpaid_break_minutes')::integer, existing_shift.unpaid_break_minutes, 0);
      next_note := coalesce(target_payload->>'note', existing_shift.note, '');

      update public.schedule_edit_session_shifts
         set location_id = next_location_id,
             employee_id = next_employee_id,
             job_id = next_job_id,
             shift_type_id = next_shift_type_id,
             scheduled_date = next_scheduled_date,
             start_time = next_start_time,
             end_time = next_end_time, time_basis=target_payload->>'time_basis', time_snapshot=target_payload->'time_snapshot', time_timezone=target_payload->>'time_timezone', hide_time_on_badge=coalesce((target_payload->>'hide_time_on_badge')::boolean,false),
             unpaid_break_minutes = next_unpaid_break_minutes,
             note = next_note,
             pending_op_type = 'update',
             locked = false,
             revision = revision + 1,
             updated_at = now()
       where session_id = target_session_id
         and id = existing_shift.id;
    end if;
    created_id := existing_shift.id;
  end if;

  update public.schedule_edit_sessions
     set revision = revision + 1,
         dirty = true,
         last_heartbeat = now(),
         expires_at = now() + interval '4 minutes'
   where id = target_session_id;

  return jsonb_build_object('status', 'ok', 'op_id', created_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_schedule_template_service_label_base(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, expected_session_revision integer, target_template_id uuid, apply_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_session public.schedule_edit_sessions%rowtype; template_row public.schedule_templates%rowtype; source record;
  applied_count integer:=0; converted_count integer:=0; chosen_employee uuid;
  target_date date; target_end_date date;
begin
  if apply_mode not in ('merge','overwrite') then raise exception 'invalid template apply mode' using errcode='22023'; end if;
  select * into target_session from public.schedule_edit_sessions s where s.id=target_session_id and s.workspace_id=target_workspace_id for update;
  if target_session.id is null or target_session.holder_user_id<>actor_user_id then raise exception 'edit session not found' using errcode='P0002'; end if;
  if target_session.status<>'active' or target_session.expires_at<=now() then raise exception 'edit lease expired' using errcode='40001'; end if;
  if target_session.revision<>expected_session_revision then raise exception 'session revision stale' using errcode='40001'; end if;
  select * into template_row from public.schedule_templates t where t.id=target_template_id and t.workspace_id=target_workspace_id;
  if template_row.id is null or not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.manage') then raise exception 'schedule template not found' using errcode='P0002'; end if;
  if exists(select 1 from public.schedule_template_shifts s left join public.locations l on l.id=s.location_id and l.workspace_id=s.workspace_id and l.archived_at is null
    left join public.jobs j on j.id=s.job_id and j.workspace_id=s.workspace_id and j.archived_at is null
    left join public.shift_types st on st.id=s.shift_type_id and st.workspace_id=s.workspace_id and st.archived_at is null
    where s.template_id=template_row.id and (l.id is null or j.id is null or (s.shift_type_id is not null and st.id is null)
      or not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.manage',s.location_id))) then
    raise exception 'schedule template references unavailable schedule definitions' using errcode='23503'; end if;
  if apply_mode='overwrite' then delete from public.schedule_edit_session_shifts where session_id=target_session.id; end if;
  for source in select * from public.schedule_template_shifts where template_id=template_row.id order by day_offset,start_time,id loop
    target_date:=target_session.week_start+source.day_offset; target_end_date:=target_date+case when source.end_time<=source.start_time then 1 else 0 end;
    chosen_employee:=source.employee_id;
    if chosen_employee is not null and (not exists(select 1 from public.employee_profiles e
      join public.employee_location_assignments la on la.employee_id=e.id and la.workspace_id=e.workspace_id and la.location_id=source.location_id and la.ended_at is null
      join public.employee_job_assignments ja on ja.employee_id=e.id and ja.workspace_id=e.workspace_id and ja.job_id=source.job_id and ja.ended_at is null
      where e.id=chosen_employee and e.workspace_id=target_workspace_id and e.archived_at is null)
      or exists(select 1 from public.schedule_edit_session_shifts x where x.session_id=target_session.id and x.employee_id=chosen_employee
        and tsrange(x.scheduled_date+x.start_time,x.scheduled_date+x.end_time+case when x.end_time<=x.start_time then interval '1 day' else interval '0' end,'[)')
         && tsrange(target_date+source.start_time,target_end_date+source.end_time,'[)'))) then
      chosen_employee:=null; converted_count:=converted_count+1;
    end if;
    insert into public.schedule_edit_session_shifts(id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, note)
    values(gen_random_uuid(), target_workspace_id, target_session.id, source.location_id, chosen_employee, source.job_id, source.shift_type_id, target_date, source.start_time, source.end_time, source.time_basis, source.time_snapshot, source.time_timezone, source.note);
    applied_count:=applied_count+1;
  end loop;
  update public.schedule_edit_sessions set revision=revision+1,dirty=true,last_heartbeat=now(),expires_at=now()+interval '4 minutes' where id=target_session.id;
  insert into public.schedule_template_events(workspace_id,template_id,template_name,action,actor_user_id,session_id,detail)
  values(target_workspace_id,template_row.id,template_row.name,'applied',actor_user_id,target_session.id,jsonb_build_object('mode',apply_mode,'applied_shift_count',applied_count,'converted_open_count',converted_count));
  return jsonb_build_object('status','applied','mode',apply_mode,'applied_shift_count',applied_count,'converted_open_count',converted_count,
    'session',public.get_schedule_edit_session_service(actor_user_id,target_workspace_id,target_session.id));
end; $function$;

CREATE OR REPLACE FUNCTION public.schedule_pending_op_payload_json(target_shift schedule_edit_session_shifts)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_strip_nulls(jsonb_build_object(
    'scheduled_date', target_shift.scheduled_date,
    'time_basis',target_shift.time_basis,'time_snapshot',target_shift.time_snapshot,'time_timezone',target_shift.time_timezone,'start_time', to_char(target_shift.start_time, 'HH24:MI'),
    'end_time', to_char(target_shift.end_time, 'HH24:MI'),
    'unpaid_break_minutes', coalesce(target_shift.unpaid_break_minutes, 0),
    'location_id', target_shift.location_id,
    'employee_id', target_shift.employee_id,
    'job_id', target_shift.job_id,
    'shift_type_id', target_shift.shift_type_id,
    'source_published_shift_id', target_shift.source_published_shift_id,
    'label_ids', to_jsonb(coalesce(target_shift.label_ids, '{}'::uuid[])),
    'label_names', to_jsonb(coalesce(target_shift.label_names, '{}'::text[])),
    'note', target_shift.note
  ));
$function$;

CREATE OR REPLACE FUNCTION public.apply_schedule_template_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, expected_session_revision integer, target_template_id uuid, apply_mode text, department_keys text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_session public.schedule_edit_sessions%rowtype;
  template_row public.schedule_templates%rowtype;
  source record;
  applied_count integer := 0;
  converted_count integer := 0;
  chosen_employee uuid;
  target_date date;
  target_end_date date;
  selected_department_ids uuid[] := '{}'::uuid[];
  include_no_department boolean := false;
begin
  if department_keys is null then
    return public.apply_schedule_template_service(
      actor_user_id,
      target_workspace_id,
      target_session_id,
      expected_session_revision,
      target_template_id,
      apply_mode
    );
  end if;

  if apply_mode not in ('merge', 'overwrite') then
    raise exception 'invalid template apply mode' using errcode = '22023';
  end if;

  if cardinality(department_keys) = 0 then
    raise exception 'select at least one department' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(department_keys) as key(value)
    where key.value <> '__no_department__'
      and key.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'invalid department key' using errcode = '22023';
  end if;

  select coalesce(array_agg(key.value::uuid), '{}'::uuid[])
    into selected_department_ids
  from unnest(department_keys) as key(value)
  where key.value <> '__no_department__';

  include_no_department := '__no_department__' = any(department_keys);

  if exists (
    select 1
    from unnest(selected_department_ids) as selected_department(id)
    left join public.departments department
      on department.id = selected_department.id
     and department.workspace_id = target_workspace_id
     and department.archived_at is null
    where department.id is null
  ) then
    raise exception 'schedule template department not found' using errcode = 'P0002';
  end if;

  select *
    into target_session
  from public.schedule_edit_sessions session
  where session.id = target_session_id
    and session.workspace_id = target_workspace_id
  for update;

  if target_session.id is null or target_session.holder_user_id <> actor_user_id then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;

  if target_session.status <> 'active' or target_session.expires_at <= now() then
    raise exception 'edit lease expired' using errcode = '40001';
  end if;

  if target_session.revision <> expected_session_revision then
    raise exception 'session revision stale' using errcode = '40001';
  end if;

  select *
    into template_row
  from public.schedule_templates template
  where template.id = target_template_id
    and template.workspace_id = target_workspace_id;

  if template_row.id is null or not public.schedule_actor_has_capability_service(
    actor_user_id,
    target_workspace_id,
    'schedule.templates.manage'
  ) then
    raise exception 'schedule template not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.schedule_template_shifts template_shift
    left join public.locations location
      on location.id = template_shift.location_id
     and location.workspace_id = template_shift.workspace_id
     and location.archived_at is null
    left join public.jobs job
      on job.id = template_shift.job_id
     and job.workspace_id = template_shift.workspace_id
     and job.archived_at is null
    left join public.shift_types shift_type
      on shift_type.id = template_shift.shift_type_id
     and shift_type.workspace_id = template_shift.workspace_id
     and shift_type.archived_at is null
    where template_shift.template_id = template_row.id
      and (
        location.id is null
        or job.id is null
        or (template_shift.shift_type_id is not null and shift_type.id is null)
        or not public.schedule_actor_has_capability_service(
          actor_user_id,
          target_workspace_id,
          'schedule.templates.manage',
          template_shift.location_id
        )
      )
  ) then
    raise exception 'schedule template references unavailable schedule definitions' using errcode = '23503';
  end if;

  if apply_mode = 'overwrite' then
    delete from public.schedule_edit_session_shifts session_shift
    using public.jobs job
    where session_shift.session_id = target_session.id
      and session_shift.workspace_id = target_workspace_id
      and job.id = session_shift.job_id
      and job.workspace_id = session_shift.workspace_id
      and (
        job.department_id = any(selected_department_ids)
        or (job.department_id is null and include_no_department)
      );
  end if;

  for source in
    select template_shift.*
    from public.schedule_template_shifts template_shift
    join public.jobs job
      on job.id = template_shift.job_id
     and job.workspace_id = template_shift.workspace_id
    where template_shift.template_id = template_row.id
      and template_shift.workspace_id = target_workspace_id
      and (
        job.department_id = any(selected_department_ids)
        or (job.department_id is null and include_no_department)
      )
    order by template_shift.day_offset, template_shift.start_time, template_shift.id
  loop
    target_date := target_session.week_start + source.day_offset;
    target_end_date := target_date + case when source.end_time <= source.start_time then 1 else 0 end;
    chosen_employee := source.employee_id;

    if chosen_employee is not null and (
      not exists (
        select 1
        from public.employee_profiles employee
        join public.employee_location_assignments location_assignment
          on location_assignment.employee_id = employee.id
         and location_assignment.workspace_id = employee.workspace_id
         and location_assignment.location_id = source.location_id
         and location_assignment.ended_at is null
        join public.employee_job_assignments job_assignment
          on job_assignment.employee_id = employee.id
         and job_assignment.workspace_id = employee.workspace_id
         and job_assignment.job_id = source.job_id
         and job_assignment.ended_at is null
        where employee.id = chosen_employee
          and employee.workspace_id = target_workspace_id
          and employee.archived_at is null
      )
      or exists (
        select 1
        from public.schedule_edit_session_shifts existing_shift
        where existing_shift.session_id = target_session.id
          and existing_shift.employee_id = chosen_employee
          and tsrange(
            existing_shift.scheduled_date + existing_shift.start_time,
            existing_shift.scheduled_date + existing_shift.end_time + case
              when existing_shift.end_time <= existing_shift.start_time then interval '1 day'
              else interval '0'
            end,
            '[)'
          ) && tsrange(target_date + source.start_time, target_end_date + source.end_time, '[)')
      )
    ) then
      chosen_employee := null;
      converted_count := converted_count + 1;
    end if;

    insert into public.schedule_edit_session_shifts(id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, hide_time_on_badge, label_ids, label_names, note)
    values(gen_random_uuid(), target_workspace_id, target_session.id, source.location_id, chosen_employee, source.job_id, source.shift_type_id, target_date, source.start_time, source.end_time, source.time_basis, source.time_snapshot, source.time_timezone, source.hide_time_on_badge, coalesce(source.label_ids, '{}'::uuid[]), coalesce(source.label_names, '{}'::text[]), source.note);
    applied_count := applied_count + 1;
  end loop;

  update public.schedule_edit_sessions
     set revision = revision + 1,
         dirty = true,
         last_heartbeat = now(),
         expires_at = now() + interval '4 minutes'
   where id = target_session.id;

  insert into public.schedule_template_events(
    workspace_id,
    template_id,
    template_name,
    action,
    actor_user_id,
    session_id,
    detail
  )
  values(
    target_workspace_id,
    template_row.id,
    template_row.name,
    'applied',
    actor_user_id,
    target_session.id,
    jsonb_build_object(
      'mode', apply_mode,
      'department_keys', to_jsonb(department_keys),
      'applied_shift_count', applied_count,
      'converted_open_count', converted_count
    )
  );

  return jsonb_build_object(
    'status', 'applied',
    'mode', apply_mode,
    'applied_shift_count', applied_count,
    'converted_open_count', converted_count,
    'session', public.get_schedule_edit_session_service(
      actor_user_id,
      target_workspace_id,
      target_session.id
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.acquire_schedule_edit_session_service_past_week_base(actor_user_id uuid, target_workspace_id uuid, target_week_start date, requested_source schedule_edit_source, requested_draft_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  existing_session public.schedule_edit_sessions%rowtype;
  source_draft public.schedule_drafts%rowtype;
  new_session_id uuid;
  recovery_draft_id uuid;
  holder_label text;
begin
  if not public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id) then
    raise exception 'schedule manage access denied' using errcode = '42501';
  end if;

  select * into existing_session
  from public.schedule_edit_sessions session
  where session.workspace_id = target_workspace_id
    and session.week_start = target_week_start and session.status = 'active'
  for update;

  if existing_session.id is not null then
    if existing_session.holder_user_id = actor_user_id then
      return jsonb_build_object(
        'status', 'resumed',
        'session', public.get_schedule_edit_session_service(
          actor_user_id, target_workspace_id, existing_session.id
        )
      );
    end if;
    if existing_session.expires_at > now() then
      select profile.display_name into holder_label
      from public.user_profiles profile where profile.user_id = existing_session.holder_user_id;
      return jsonb_build_object(
        'status', 'conflict',
        'session_id', existing_session.id,
        'holder_name', coalesce(holder_label, 'Another manager'),
        'last_heartbeat', existing_session.last_heartbeat,
        'expires_at', existing_session.expires_at
      );
    end if;

    if existing_session.dirty then
      insert into public.schedule_drafts (
        workspace_id, week_start, name, created_by, updated_by
      ) values (
        target_workspace_id, target_week_start,
        'Recovered edit ' || to_char(now(), 'YYYY-MM-DD HH24:MI'),
        existing_session.holder_user_id, existing_session.holder_user_id
      ) returning id into recovery_draft_id;
      insert into public.schedule_draft_shifts (id, workspace_id, draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision)
      select id, workspace_id, recovery_draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision from public.schedule_edit_session_shifts
      where session_id = existing_session.id;
    end if;
    update public.schedule_edit_sessions
    set status = case
        when recovery_draft_id is null then 'expired'::public.schedule_edit_session_status
        else 'recovered'::public.schedule_edit_session_status
      end,
      recovered_draft_id = recovery_draft_id, closed_at = now()
    where id = existing_session.id;
  end if;

  if requested_source = 'draft' then
    select * into source_draft
    from public.schedule_drafts draft
    where draft.id = requested_draft_id and draft.workspace_id = target_workspace_id
      and draft.week_start = target_week_start and draft.archived_at is null;
    if source_draft.id is null then
      raise exception 'draft not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.schedule_edit_sessions (
    workspace_id, week_start, source_kind, source_draft_id, source_revision,
    holder_user_id
  ) values (
    target_workspace_id, target_week_start, requested_source,
    case when requested_source = 'draft' then source_draft.id else null end,
    case when requested_source = 'draft' then source_draft.revision else 0 end,
    actor_user_id
  ) returning id into new_session_id;

  if requested_source = 'published' then
    insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note)
    select shift.source_shift_id, shift.workspace_id, new_session_id, shift.location_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note from public.schedule_published_shifts shift
    join public.schedule_location_publications publication on publication.id = shift.publication_id
    where shift.workspace_id = target_workspace_id
      and publication.week_start = target_week_start and publication.status = 'current'
      and public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, shift.location_id);
  elsif requested_source = 'draft' then
    insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision)
    select shift.id, shift.workspace_id, new_session_id, shift.location_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.revision from public.schedule_draft_shifts shift
    where shift.draft_id = source_draft.id
      and public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, shift.location_id);
  end if;

  return jsonb_build_object(
    'status', case when recovery_draft_id is null then 'acquired' else 'acquired_after_recovery' end,
    'session', public.get_schedule_edit_session_service(
      actor_user_id, target_workspace_id, new_session_id
    ),
    'recovered_draft_id', recovery_draft_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_schedule_edit_session_service_base(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_session public.schedule_edit_sessions%rowtype;
  result jsonb;
begin
  select * into target_session
  from public.schedule_edit_sessions session
  where session.id = target_session_id
    and session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id;
  if target_session.id is null then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'id', target_session.id,
    'workspace_id', target_session.workspace_id,
    'week_start', target_session.week_start,
    'source_kind', target_session.source_kind,
    'source_draft_id', target_session.source_draft_id,
    'source_revision', target_session.source_revision,
    'holder_user_id', target_session.holder_user_id,
    'holder_name', coalesce((
      select profile.display_name from public.user_profiles profile
      where profile.user_id = target_session.holder_user_id
    ), 'Manager'),
    'revision', target_session.revision,
    'dirty', target_session.dirty,
    'last_heartbeat', target_session.last_heartbeat,
    'expires_at', target_session.expires_at,
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
        'revision', shift.revision,
        'warning_codes', to_jsonb(array_remove(array[
          case when exists (
            select 1 from public.schedule_closures closure
            where closure.location_id = shift.location_id
              and closure.closed_date = shift.scheduled_date and closure.is_all_day
          ) then 'closed_location' end,
          case when shift.employee_id is not null and exists (
            select 1 from public.employee_schedule_availability_versions version,
              lateral jsonb_array_elements(version.recurring_rules) rule
            where version.employee_id = shift.employee_id
              and version.version_number = (
                select max(latest.version_number)
                from public.employee_schedule_availability_versions latest
                where latest.employee_id = shift.employee_id
              )
              and (rule->>'day')::integer = extract(dow from shift.scheduled_date)::integer
              and rule->>'mode' = 'unavailable'
          ) then 'availability' end,
          case when shift.employee_id is not null and exists (
            select 1 from public.schedule_edit_session_shifts other
            where other.session_id = target_session.id
              and other.employee_id = shift.employee_id
              and other.scheduled_date = shift.scheduled_date
              and other.id <> shift.id
              and not shift.crosses_midnight and not other.crosses_midnight
              and shift.start_time < other.end_time and shift.end_time > other.start_time
          ) then 'overlap' end
        ]::text[], null))
      ) order by shift.scheduled_date, shift.start_time, shift.id)
      from public.schedule_edit_session_shifts shift
      where shift.session_id = target_session.id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mutate_schedule_edit_shift_service_base(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, expected_session_revision integer, operation text, target_shift_id uuid, expected_shift_revision integer DEFAULT NULL::integer, shift_payload jsonb DEFAULT NULL::jsonb, request_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_session public.schedule_edit_sessions%rowtype;
  target_location_id uuid;
  target_employee_id uuid;
  target_job_id uuid;
  target_shift_type_id uuid;
  target_scheduled_date date;
  target_start_time time;
  target_end_time time;
  target_unpaid_break_minutes integer;
  target_hide_time_on_badge boolean;
  target_note text;
begin
  select * into target_session from public.schedule_edit_sessions session
  where session.id = target_session_id and session.workspace_id = target_workspace_id
  for update;
  if target_session.id is null or target_session.holder_user_id <> actor_user_id then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;
  if target_session.status <> 'active' or target_session.expires_at <= now() then
    raise exception 'edit lease expired' using errcode = '40001';
  end if;
  if target_session.revision <> expected_session_revision then
    raise exception 'session revision stale' using errcode = '40001';
  end if;
  if operation not in ('create', 'update', 'delete') then
    raise exception 'invalid shift operation' using errcode = '22023';
  end if;

  if operation in ('create', 'update') then
    shift_payload := public.normalize_schedule_time_source(target_workspace_id,shift_payload,(select to_jsonb(s) from public.schedule_edit_session_shifts s where s.session_id=target_session_id and s.id=target_shift_id));
    target_location_id := (shift_payload->>'location_id')::uuid;
    target_employee_id := nullif(shift_payload->>'employee_id', '')::uuid;
    target_job_id := (shift_payload->>'job_id')::uuid;
    target_shift_type_id := nullif(shift_payload->>'shift_type_id', '')::uuid;
    target_scheduled_date := (shift_payload->>'scheduled_date')::date;
    target_start_time := nullif(shift_payload->>'start_time','')::time;
    target_end_time := nullif(shift_payload->>'end_time','')::time;
    target_unpaid_break_minutes := coalesce((shift_payload->>'unpaid_break_minutes')::integer, 0);
    target_hide_time_on_badge := coalesce((shift_payload->>'hide_time_on_badge')::boolean, false);
    target_note := coalesce(shift_payload->>'note', '');
    if target_start_time = target_end_time or char_length(target_note) > 500
      or target_unpaid_break_minutes not in (0, 15, 30, 45, 60)
      or target_scheduled_date not between target_session.week_start and target_session.week_start + 6 then
      raise exception 'invalid shift values' using errcode = '22023';
    end if;
    if not public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, target_location_id) then
      raise exception 'location scope denied' using errcode = '42501';
    end if;
    if not exists (select 1 from public.jobs job where job.id = target_job_id and job.workspace_id = target_workspace_id and job.archived_at is null)
      or not exists (select 1 from public.locations location where location.id = target_location_id and location.workspace_id = target_workspace_id and location.archived_at is null)
      or (target_shift_type_id is not null and not exists (select 1 from public.shift_types shift_type where shift_type.id = target_shift_type_id and shift_type.workspace_id = target_workspace_id and shift_type.archived_at is null))
      or (target_employee_id is not null and not exists (
        select 1 from public.employee_profiles employee
        join public.employee_location_assignments location_assignment
          on location_assignment.employee_id = employee.id and location_assignment.location_id = target_location_id and location_assignment.ended_at is null
        join public.employee_job_assignments job_assignment
          on job_assignment.employee_id = employee.id and job_assignment.job_id = target_job_id and job_assignment.ended_at is null
        where employee.id = target_employee_id and employee.workspace_id = target_workspace_id and employee.archived_at is null
      )) then
      raise exception 'invalid shift reference' using errcode = '23503';
    end if;
  end if;

  if operation = 'create' then
    if request_idempotency_key is not null and exists (
      select 1 from public.schedule_edit_session_shifts shift
      where shift.session_id = target_session_id and shift.idempotency_key = request_idempotency_key
    ) then
      return public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
    end if;
    insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, idempotency_key) values (coalesce(target_shift_id, gen_random_uuid()), target_workspace_id, target_session_id, target_location_id, target_employee_id, target_job_id, target_shift_type_id, target_scheduled_date, target_start_time, target_end_time, shift_payload->>'time_basis', shift_payload->'time_snapshot', shift_payload->>'time_timezone', target_unpaid_break_minutes, target_hide_time_on_badge, target_note, request_idempotency_key);
  elsif operation = 'update' then
    update public.schedule_edit_session_shifts shift
    set location_id = target_location_id, employee_id = target_employee_id,
      job_id = target_job_id, shift_type_id = target_shift_type_id,
      scheduled_date = target_scheduled_date, start_time = target_start_time,
      end_time = target_end_time, time_basis=shift_payload->>'time_basis', time_snapshot=shift_payload->'time_snapshot', time_timezone=shift_payload->>'time_timezone', unpaid_break_minutes = target_unpaid_break_minutes, hide_time_on_badge = target_hide_time_on_badge, note = target_note,
      revision = revision + 1, updated_at = now()
    where shift.session_id = target_session_id and shift.id = target_shift_id
      and shift.revision = expected_shift_revision
      and public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, shift.location_id);
    if not found then
      raise exception 'shift revision stale' using errcode = '40001';
    end if;
  else
    delete from public.schedule_edit_session_shifts shift
    where shift.session_id = target_session_id and shift.id = target_shift_id
      and shift.revision = expected_shift_revision
      and public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, shift.location_id);
    if not found then
      raise exception 'shift revision stale' using errcode = '40001';
    end if;
  end if;

  update public.schedule_edit_sessions
  set revision = revision + 1, dirty = true,
    last_heartbeat = now(), expires_at = now() + interval '4 minutes'
  where id = target_session_id;
  return public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_schedule_edit_session_service_base(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, expected_session_revision integer, target_name text, target_draft_id uuid DEFAULT NULL::uuid, expected_draft_revision integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_session public.schedule_edit_sessions%rowtype;
  saved_draft public.schedule_drafts%rowtype;
begin
  select * into target_session from public.schedule_edit_sessions session
  where session.id = target_session_id and session.workspace_id = target_workspace_id
  for update;
  if target_session.id is null or target_session.holder_user_id <> actor_user_id then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;
  if target_session.status <> 'active' or target_session.expires_at <= now() then
    raise exception 'edit lease expired' using errcode = '40001';
  end if;
  if target_session.revision <> expected_session_revision then
    raise exception 'session revision stale' using errcode = '40001';
  end if;
  if char_length(btrim(target_name)) not between 1 and 80 then
    raise exception 'invalid draft name' using errcode = '22023';
  end if;

  if target_draft_id is null then
    insert into public.schedule_drafts (
      workspace_id, week_start, name, created_by, updated_by
    ) values (
      target_workspace_id, target_session.week_start, btrim(target_name),
      actor_user_id, actor_user_id
    ) returning * into saved_draft;
  else
    update public.schedule_drafts draft
    set name = btrim(target_name), revision = revision + 1,
      updated_by = actor_user_id, updated_at = now()
    where draft.id = target_draft_id and draft.workspace_id = target_workspace_id
      and draft.week_start = target_session.week_start and draft.archived_at is null
      and draft.revision = expected_draft_revision
    returning * into saved_draft;
    if saved_draft.id is null then
      raise exception 'draft revision stale' using errcode = '40001';
    end if;
  end if;

  delete from public.schedule_draft_shifts shift
  where shift.draft_id = saved_draft.id
    and public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, shift.location_id);
  insert into public.schedule_draft_shifts (id, workspace_id, draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision)
  select shift.id, shift.workspace_id, saved_draft.id, shift.location_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.revision from public.schedule_edit_session_shifts shift
  where shift.session_id = target_session_id;

  delete from public.schedule_edit_session_shifts where session_id = target_session_id;
  update public.schedule_edit_sessions
  set status = 'saved', dirty = false, closed_at = now(), expires_at = now()
  where id = target_session_id;

  return jsonb_build_object(
    'id', saved_draft.id, 'workspace_id', saved_draft.workspace_id,
    'week_start', saved_draft.week_start, 'name', saved_draft.name,
    'revision', saved_draft.revision, 'created_by', saved_draft.created_by,
    'updated_by', saved_draft.updated_by, 'created_at', saved_draft.created_at,
    'updated_at', saved_draft.updated_at
  );
exception
  when unique_violation then
    raise exception 'draft name conflict' using errcode = '23505';
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_schedule_template_service_label_base(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_name text, strip_assignments boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.schedule_drafts%rowtype; new_template public.schedule_templates%rowtype;
begin
 if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.manage') then raise exception 'schedule template access denied' using errcode='42501'; end if;
 select * into d from public.schedule_drafts where id=target_draft_id and workspace_id=target_workspace_id and archived_at is null;
 if d.id is null then raise exception 'schedule draft not found' using errcode='P0002'; end if;
 if not exists(select 1 from public.schedule_draft_shifts where draft_id=d.id) then raise exception 'schedule template source is empty' using errcode='22023'; end if;
 if exists(select 1 from public.schedule_draft_shifts s where s.draft_id=d.id and not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.manage',s.location_id)) then raise exception 'schedule template scope denied' using errcode='42501'; end if;
 insert into public.schedule_templates(workspace_id,name,created_by,updated_by) values(target_workspace_id,btrim(target_name),actor_user_id,actor_user_id) returning * into new_template;
 insert into public.schedule_template_shifts(workspace_id, template_id, location_id, employee_id, job_id, shift_type_id, day_offset, start_time, end_time, time_basis, time_snapshot, time_timezone, hide_time_on_badge, note)
 select s.workspace_id, new_template.id, s.location_id, case when strip_assignments then null else s.employee_id end, s.job_id, s.shift_type_id, (s.scheduled_date-d.week_start), s.start_time, s.end_time, s.time_basis, s.time_snapshot, s.time_timezone, s.hide_time_on_badge, s.note from public.schedule_draft_shifts s where s.draft_id=d.id;
 insert into public.schedule_template_events(workspace_id,template_id,template_name,action,actor_user_id,detail)
 values(target_workspace_id,new_template.id,new_template.name,'created',actor_user_id,jsonb_build_object('source_draft_id',d.id,'strip_assignments',strip_assignments));
 return public.get_schedule_template_service(actor_user_id,target_workspace_id,new_template.id);
exception when unique_violation then raise exception 'schedule template name conflict' using errcode='23505'; end; $function$;

CREATE OR REPLACE FUNCTION public.publish_schedule_draft_service_document_conflict_base(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_location_ids uuid[], target_department_ids uuid[], include_no_department boolean, expected_draft_revision integer, expected_fingerprint text, override_decisions jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_draft public.schedule_drafts%rowtype;
  preview jsonb;
  location_item jsonb;
  finding jsonb;
  decision jsonb;
  new_publication_id uuid;
  previous_publication_id uuid;
  publication_ids uuid[] := '{}'::uuid[];
  normalized_locations uuid[];
  normalized_departments uuid[];
  effective_include_no_department boolean := coalesce(include_no_department, true);
  total_shift_count integer := 0;
  published_at timestamptz := now();
begin
  select * into target_draft from public.schedule_drafts draft
  where draft.id = target_draft_id and draft.workspace_id = target_workspace_id
    and draft.archived_at is null for update;
  if target_draft.id is null then raise exception 'schedule draft not found' using errcode = 'P0002'; end if;
  if target_draft.revision <> expected_draft_revision then
    raise exception 'stale publication preview' using errcode = '40001';
  end if;
  select array_agg(distinct location_id order by location_id) into normalized_locations
  from unnest(target_location_ids) location_id;

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

  perform 1 from public.schedule_location_publications publication
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_draft.week_start
    and publication.location_id = any(normalized_locations) for update;

  preview := public.preview_schedule_publication_service(
    actor_user_id,
    target_workspace_id,
    target_draft_id,
    normalized_locations,
    normalized_departments,
    effective_include_no_department
  );
  if preview->>'status' = 'past_week_closed' then
    raise exception 'past schedule week is closed' using errcode = '42501';
  end if;
  if preview->>'fingerprint' <> expected_fingerprint then
    raise exception 'stale publication preview' using errcode = '40001';
  end if;
  if preview->>'status' = 'hard_blocked' then
    raise exception 'schedule has hard publication blockers' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(override_decisions, '[]'::jsonb)) <> 'array' then
    raise exception 'publication overrides must be an array' using errcode = '22023';
  end if;
  for finding in select value from jsonb_array_elements(preview->'findings')
  loop
    if finding->>'severity' <> 'soft' then continue; end if;
    select value into decision from jsonb_array_elements(override_decisions)
    where value->>'finding_id' = finding->>'id' limit 1;
    if decision is null or char_length(btrim(coalesce(decision->>'reason', ''))) not between 10 and 500 then
      raise exception 'publication override reason required' using errcode = '22023';
    end if;
  end loop;

  for location_item in select value from jsonb_array_elements(preview->'locations')
  loop
    previous_publication_id := nullif(location_item->>'active_publication_id', '')::uuid;
    new_publication_id := gen_random_uuid();
    if previous_publication_id is not null then
      update public.schedule_location_publications
      set status = 'superseded'
      where id = previous_publication_id and status = 'current';
      if not found then raise exception 'stale publication preview' using errcode = '40001'; end if;
    end if;
    insert into public.schedule_location_publications (
      id, workspace_id, location_id, week_start, version_number, status,
      published_by, published_at, source_draft_id, source_draft_revision,
      content_fingerprint, department_ids, include_no_department
    ) values (
      new_publication_id, target_workspace_id, (location_item->>'location_id')::uuid,
      target_draft.week_start,
      coalesce((select max(version_number) + 1 from public.schedule_location_publications
        where location_id = (location_item->>'location_id')::uuid and week_start = target_draft.week_start), 1),
      'current', actor_user_id, published_at, target_draft.id, target_draft.revision,
      expected_fingerprint, normalized_departments, effective_include_no_department
    );
    if previous_publication_id is not null then
      update public.schedule_location_publications
      set superseded_by = new_publication_id
      where id = previous_publication_id;

      insert into public.schedule_published_shifts (workspace_id, location_id, publication_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, source_shift_id)
      select shift.workspace_id, shift.location_id, new_publication_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.source_shift_id from public.schedule_published_shifts shift
      where shift.publication_id = previous_publication_id
        and not public.schedule_shift_in_department_scope_service(
          shift.job_id, normalized_departments, effective_include_no_department
        );
    end if;

    insert into public.schedule_published_shifts (workspace_id, location_id, publication_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, source_shift_id)
    select shift.workspace_id, shift.location_id, new_publication_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.id from public.schedule_draft_shifts shift
    where shift.draft_id = target_draft.id
      and shift.location_id = (location_item->>'location_id')::uuid
      and public.schedule_shift_in_department_scope_service(
        shift.job_id, normalized_departments, effective_include_no_department
      );
    publication_ids := array_append(publication_ids, new_publication_id);

    for finding in select value from jsonb_array_elements(preview->'findings')
    loop
      if finding->>'severity' <> 'soft'
        or finding->>'location_id' <> location_item->>'location_id' then continue; end if;
      select value into decision from jsonb_array_elements(override_decisions)
      where value->>'finding_id' = finding->>'id' limit 1;
      insert into public.schedule_publication_overrides (
        workspace_id, publication_id, source_draft_id, source_draft_revision,
        finding_id, finding_code, employee_id, location_id, scheduled_date,
        source_shift_ids, reason, actor_user_id
      ) values (
        target_workspace_id, new_publication_id, target_draft.id, target_draft.revision,
        finding->>'id', finding->>'code', nullif(finding->>'employee_id', '')::uuid,
        (finding->>'location_id')::uuid, (finding->>'scheduled_date')::date,
        array(select jsonb_array_elements_text(finding->'shift_ids')::uuid),
        btrim(decision->>'reason'), actor_user_id
      );
    end loop;
  end loop;

  select count(*)::integer into total_shift_count
  from public.schedule_published_shifts shift where shift.publication_id = any(publication_ids);
  insert into public.schedule_publication_events (
    workspace_id, week_start, action, actor_user_id, location_ids,
    source_draft_id, source_draft_revision, publication_ids,
    preflight_fingerprint, diff_summary
  ) values (
    target_workspace_id, target_draft.week_start, 'published', actor_user_id,
    normalized_locations, target_draft.id, target_draft.revision, publication_ids,
    expected_fingerprint,
    jsonb_build_object(
      'locations', preview->'locations',
      'department_ids', to_jsonb(normalized_departments),
      'include_no_department', effective_include_no_department
    )
  );
  return jsonb_build_object(
    'status', 'published', 'workspace_id', target_workspace_id,
    'week_start', target_draft.week_start, 'draft_id', target_draft.id,
    'draft_revision', target_draft.revision, 'location_ids', to_jsonb(normalized_locations),
    'publication_ids', to_jsonb(publication_ids), 'published_shift_count', total_shift_count,
    'published_at', published_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.publish_schedule_draft_service_label_base(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_location_ids uuid[], expected_draft_revision integer, expected_fingerprint text, override_decisions jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_draft public.schedule_drafts%rowtype;
  preview jsonb;
  location_item jsonb;
  finding jsonb;
  decision jsonb;
  publication_id uuid;
  previous_publication_id uuid;
  publication_ids uuid[] := '{}'::uuid[];
  normalized_locations uuid[];
  total_shift_count integer := 0;
  published_at timestamptz := now();
begin
  select * into target_draft from public.schedule_drafts draft
  where draft.id = target_draft_id and draft.workspace_id = target_workspace_id
    and draft.archived_at is null for update;
  if target_draft.id is null then raise exception 'schedule draft not found' using errcode = 'P0002'; end if;
  if target_draft.revision <> expected_draft_revision then
    raise exception 'stale publication preview' using errcode = '40001';
  end if;
  select array_agg(distinct location_id order by location_id) into normalized_locations
  from unnest(target_location_ids) location_id;
  perform 1 from public.schedule_location_publications publication
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_draft.week_start
    and publication.location_id = any(normalized_locations) for update;

  preview := public.preview_schedule_publication_service(
    actor_user_id, target_workspace_id, target_draft_id, normalized_locations
  );
  if preview->>'status' = 'past_week_closed' then
    raise exception 'past schedule week is closed' using errcode = '42501';
  end if;
  if preview->>'fingerprint' <> expected_fingerprint then
    raise exception 'stale publication preview' using errcode = '40001';
  end if;
  if preview->>'status' = 'hard_blocked' then
    raise exception 'schedule has hard publication blockers' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(override_decisions, '[]'::jsonb)) <> 'array' then
    raise exception 'publication overrides must be an array' using errcode = '22023';
  end if;
  for finding in select value from jsonb_array_elements(preview->'findings')
  loop
    if finding->>'severity' <> 'soft' then continue; end if;
    select value into decision from jsonb_array_elements(override_decisions)
    where value->>'finding_id' = finding->>'id' limit 1;
    if decision is null or char_length(btrim(coalesce(decision->>'reason', ''))) not between 10 and 500 then
      raise exception 'publication override reason required' using errcode = '22023';
    end if;
  end loop;

  for location_item in select value from jsonb_array_elements(preview->'locations')
  loop
    previous_publication_id := nullif(location_item->>'active_publication_id', '')::uuid;
    publication_id := gen_random_uuid();
    if previous_publication_id is not null then
      update public.schedule_location_publications
      set status = 'superseded'
      where id = previous_publication_id and status = 'current';
      if not found then raise exception 'stale publication preview' using errcode = '40001'; end if;
    end if;
    insert into public.schedule_location_publications (
      id, workspace_id, location_id, week_start, version_number, status,
      published_by, published_at, source_draft_id, source_draft_revision, content_fingerprint
    ) values (
      publication_id, target_workspace_id, (location_item->>'location_id')::uuid,
      target_draft.week_start,
      coalesce((select max(version_number) + 1 from public.schedule_location_publications
        where location_id = (location_item->>'location_id')::uuid and week_start = target_draft.week_start), 1),
      'current', actor_user_id, published_at, target_draft.id, target_draft.revision,
      expected_fingerprint
    );
    if previous_publication_id is not null then
      update public.schedule_location_publications
      set superseded_by = publication_id
      where id = previous_publication_id;
    end if;
    insert into public.schedule_published_shifts (workspace_id, location_id, publication_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, source_shift_id)
    select shift.workspace_id, shift.location_id, publication_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.id from public.schedule_draft_shifts shift
    where shift.draft_id = target_draft.id
      and shift.location_id = (location_item->>'location_id')::uuid;
    get diagnostics total_shift_count = row_count;
    publication_ids := array_append(publication_ids, publication_id);

    for finding in select value from jsonb_array_elements(preview->'findings')
    loop
      if finding->>'severity' <> 'soft'
        or finding->>'location_id' <> location_item->>'location_id' then continue; end if;
      select value into decision from jsonb_array_elements(override_decisions)
      where value->>'finding_id' = finding->>'id' limit 1;
      insert into public.schedule_publication_overrides (
        workspace_id, publication_id, source_draft_id, source_draft_revision,
        finding_id, finding_code, employee_id, location_id, scheduled_date,
        source_shift_ids, reason, actor_user_id
      ) values (
        target_workspace_id, publication_id, target_draft.id, target_draft.revision,
        finding->>'id', finding->>'code', nullif(finding->>'employee_id', '')::uuid,
        (finding->>'location_id')::uuid, (finding->>'scheduled_date')::date,
        array(select jsonb_array_elements_text(finding->'shift_ids')::uuid),
        btrim(decision->>'reason'), actor_user_id
      );
    end loop;
  end loop;

  select count(*)::integer into total_shift_count
  from public.schedule_published_shifts shift where shift.publication_id = any(publication_ids);
  insert into public.schedule_publication_events (
    workspace_id, week_start, action, actor_user_id, location_ids,
    source_draft_id, source_draft_revision, publication_ids,
    preflight_fingerprint, diff_summary
  ) values (
    target_workspace_id, target_draft.week_start, 'published', actor_user_id,
    normalized_locations, target_draft.id, target_draft.revision, publication_ids,
    expected_fingerprint, jsonb_build_object('locations', preview->'locations')
  );
  return jsonb_build_object(
    'status', 'published', 'workspace_id', target_workspace_id,
    'week_start', target_draft.week_start, 'draft_id', target_draft.id,
    'draft_revision', target_draft.revision, 'location_ids', to_jsonb(normalized_locations),
    'publication_ids', to_jsonb(publication_ids), 'published_shift_count', total_shift_count,
    'published_at', published_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.lineup_assign_segment(actor uuid, w uuid, source_id uuid, emp uuid, target jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old public.schedule_published_shifts%rowtype; pub public.schedule_location_publications%rowtype; saved public.schedule_published_shifts%rowtype;
  src_loc public.locations%rowtype; dest public.locations%rowtype; ln public.schedule_lineups%rowtype;
  d date:=(target->>'date')::date; original tstzrange; part tstzrange; cut tstzrange; residual tstzrange; remaining tstzmultirange; gaps tstzmultirange; travel integer:=coalesce((target->>'travel_minutes')::integer,0);
  new_id uuid; source_line public.schedule_lineup_entries%rowtype;
begin
  select * into dest from public.locations where id=(target->>'location_id')::uuid and workspace_id=w;
  select * into pub from public.schedule_location_publications where workspace_id=w and location_id=dest.id and status='current' and d between week_start and week_start+6 for update;
  if pub.id is null then raise exception 'Publish the destination Schedule week before assigning staff'; end if;
  if source_id is not null then
    select * into old from public.schedule_published_shifts where id=source_id and workspace_id=w for update;
    select * into src_loc from public.locations where id=old.location_id;
    select * into source_line from public.schedule_lineup_entries where source_shift_id=old.id and workspace_id=w;
    original:=public.lineup_shift_range(old.scheduled_date,old.start_time,old.end_time,src_loc.timezone);
    part:=public.lineup_shift_range(d,(target->>'start_time')::time,(target->>'end_time')::time,dest.timezone);
    cut:=tstzrange(lower(part)-make_interval(mins=>travel),upper(part)+make_interval(mins=>travel),'[)');
    remaining:=tstzmultirange(original)-tstzmultirange(cut);
    gaps:=tstzmultirange(original)-remaining-tstzmultirange(part);
    for residual in select unnest(gaps) loop
      insert into public.schedule_published_shifts(workspace_id, location_id, publication_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, note, source_shift_id)
      values(w, old.location_id, public.lineup_day_publication(w,old.location_id,(lower(residual) at time zone src_loc.timezone)::date), null, old.job_id, old.shift_type_id, (lower(residual) at time zone src_loc.timezone)::date, (lower(residual) at time zone src_loc.timezone)::time, (upper(residual) at time zone src_loc.timezone)::time, 'explicit', null, src_loc.timezone, 'Coverage needed during travel', gen_random_uuid()) returning id into new_id;
      perform public.lineup_copy_segment_placement(actor,w,to_jsonb(source_line),new_id,residual);
    end loop;
    for residual in select unnest(remaining) loop
      insert into public.schedule_published_shifts(workspace_id, location_id, publication_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, note, source_shift_id)
      values(w, old.location_id, public.lineup_day_publication(w,old.location_id,(lower(residual) at time zone src_loc.timezone)::date), old.employee_id, old.job_id, old.shift_type_id, (lower(residual) at time zone src_loc.timezone)::date, (lower(residual) at time zone src_loc.timezone)::time, (upper(residual) at time zone src_loc.timezone)::time, 'explicit', null, src_loc.timezone, old.note, gen_random_uuid()) returning id into new_id;
      perform public.lineup_copy_segment_placement(actor,w,to_jsonb(source_line),new_id,residual);
    end loop;
    if old.location_id<>dest.id then
      insert into public.schedule_published_shifts(workspace_id, location_id, publication_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, note, source_shift_id)
      values(w, old.location_id, public.lineup_day_publication(w,old.location_id,(lower(part) at time zone src_loc.timezone)::date), null, old.job_id, old.shift_type_id, (lower(part) at time zone src_loc.timezone)::date, (lower(part) at time zone src_loc.timezone)::time, (upper(part) at time zone src_loc.timezone)::time, 'explicit', null, src_loc.timezone, 'Coverage needed after location transfer', gen_random_uuid()) returning id into new_id;
      perform public.lineup_copy_segment_placement(actor,w,to_jsonb(source_line),new_id,part);
    end if;
    update public.schedule_published_shifts set employee_id=emp,publication_id=pub.id,location_id=dest.id,job_id=(target->>'job_id')::uuid,shift_type_id=(target->>'shift_type_id')::uuid,scheduled_date=d,start_time=(target->>'start_time')::time,end_time=(target->>'end_time')::time,time_basis='explicit',time_snapshot=null,time_timezone=dest.timezone where id=old.id returning * into saved;
  else
    insert into public.schedule_published_shifts(workspace_id, location_id, publication_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, source_shift_id)
    values(w, dest.id, pub.id, emp, (target->>'job_id')::uuid, (target->>'shift_type_id')::uuid, d, (target->>'start_time')::time, (target->>'end_time')::time, 'explicit', null, dest.timezone, gen_random_uuid()) returning * into saved;
  end if;
  insert into public.schedule_lineups(workspace_id,location_id,lineup_date,created_by,updated_by) values(w,dest.id,d,actor,actor)
  on conflict(workspace_id,location_id,lineup_date) do update set revision=public.schedule_lineups.revision+1,updated_by=actor,updated_at=now() returning * into ln;
  if source_line.id is not null then
    update public.schedule_lineup_entries set lineup_id=ln.id,location_id=dest.id,employee_id=emp,job_id=saved.job_id,shift_type_id=saved.shift_type_id,start_time=saved.start_time,end_time=saved.end_time,section_id=(target->>'section_id')::uuid,station=coalesce(target->>'station',''),placement_segments=coalesce(target->'placement_segments','[]'::jsonb),call_off=false,hidden=false,revision=revision+1,updated_by=actor,updated_at=now() where id=source_line.id;
  else
    insert into public.schedule_lineup_entries(workspace_id,lineup_id,location_id,source_shift_id,employee_id,job_id,shift_type_id,start_time,end_time,section_id,station,created_by,updated_by)
    values(w,ln.id,dest.id,saved.id,emp,saved.job_id,saved.shift_type_id,saved.start_time,saved.end_time,(target->>'section_id')::uuid,coalesce(target->>'station',''),actor,actor);
  end if;
  return saved.id;
end; $function$;

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
end; $function$;

CREATE OR REPLACE FUNCTION public.get_schedule_template_service(actor_user_id uuid, target_workspace_id uuid, target_template_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 select jsonb_build_object('template',jsonb_build_object('id',t.id,'workspace_id',t.workspace_id,'name',t.name,'revision',t.revision,
   'shift_count',(select count(*) from public.schedule_template_shifts s where s.template_id=t.id),
   'open_slot_count',(select count(*) from public.schedule_template_shifts s where s.template_id=t.id and s.employee_id is null),
   'created_by_name',coalesce(u.display_name,'Manager'),'updated_at',t.updated_at),
   'shifts',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'location_id',s.location_id,'employee_id',s.employee_id,'job_id',s.job_id,
     'shift_type_id',s.shift_type_id,'day_offset',s.day_offset,'time_basis',s.time_basis,'time_snapshot',s.time_snapshot,'time_timezone',s.time_timezone,'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'),
     'crosses_midnight',s.crosses_midnight,'hide_time_on_badge',coalesce(s.hide_time_on_badge,false),'label_ids',to_jsonb(coalesce(s.label_ids,'{}'::uuid[])),
     'label_names',to_jsonb(coalesce(s.label_names,'{}'::text[])),'note',s.note) order by s.day_offset,s.start_time,s.id) from public.schedule_template_shifts s where s.template_id=t.id),'[]'::jsonb))
 into result from public.schedule_templates t join public.user_profiles u on u.user_id=t.created_by
 where t.id=target_template_id and t.workspace_id=target_workspace_id
 and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.manage')
 and not exists(select 1 from public.schedule_template_shifts s where s.template_id=t.id and not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.manage',s.location_id));
 if result is null then raise exception 'schedule template not found' using errcode='P0002'; end if; return result;
end; $function$;

CREATE OR REPLACE FUNCTION public.shift_exchange_shift(w uuid, source uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('id',s.id,'source_id',coalesce(s.source_shift_id,s.id),'location_id',s.location_id,'location_name',l.name,'timezone',coalesce(s.time_timezone,l.timezone),
 'requires_employee_access',true,'job_id',s.job_id,'job_name',coalesce(j.name,'Unassigned position'),'shift_type_id',s.shift_type_id,
 'unpaid_break_minutes',s.unpaid_break_minutes,'scheduled_date',s.scheduled_date,'date',s.scheduled_date,'time_basis',s.time_basis,'time_snapshot',s.time_snapshot,'time_timezone',s.time_timezone,'start_time',s.start_time,'end_time',s.end_time,
 'starts_at',lower(public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,coalesce(s.time_timezone,l.timezone))),
 'ends_at',upper(public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,coalesce(s.time_timezone,l.timezone))),
 'employee_id',s.employee_id,'employee_name',case when e.id is not null then coalesce(nullif(e.preferred_name,''),concat_ws(' ',e.first_name,e.last_name)) end)
 from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current'
 join public.locations l on l.id=s.location_id left join public.jobs j on j.id=s.job_id left join public.employee_profiles e on e.id=s.employee_id
 where s.workspace_id=w and (s.id=source or coalesce(s.source_shift_id,s.id)=source) order by s.created_at desc limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.shift_exchange_terms(s jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('time_basis',s->'time_basis','time_snapshot',s->'time_snapshot','time_timezone',s->'time_timezone','source',s->'source_id','owner',s->'employee_id','location',s->'location_id','job',s->'job_id','service',s->'shift_type_id','date',s->'date','start',s->'start_time','end',s->'end_time','unpaid_break_minutes',coalesce(s->'unpaid_break_minutes','0'::jsonb));
$function$;

CREATE OR REPLACE FUNCTION public.preview_schedule_publication_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_location_ids uuid[])
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
    select 'time_source_unresolved'::text as code, 'hard'::text as severity, false as overrideable,
      shift.location_id,shift.employee_id,shift.scheduled_date,array[shift.id]::uuid[] as shift_ids,
      'Confirm shift hours before publishing this assignment.'::text as message
    from next_shift shift where shift.employee_id is not null
      and shift.time_basis in ('unresolved','legacy_unverified') and not exists (
        select 1 from public.schedule_published_shifts s
        where s.workspace_id=shift.workspace_id and s.source_shift_id=shift.id and s.time_basis='legacy_unverified'
          and (s.employee_id,s.location_id,s.job_id,s.shift_type_id,s.scheduled_date,s.start_time,s.end_time)
            is not distinct from (shift.employee_id,shift.location_id,shift.job_id,shift.shift_type_id,shift.scheduled_date,shift.start_time,shift.end_time)
      )
    union all
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
      'availability', 'soft', true, shift.location_id, shift.employee_id,
      shift.scheduled_date, array[shift.id]::uuid[],
      shift.employee_name || ' is unavailable on ' || shift.scheduled_date::text || '.'
    from next_shift shift
    where shift.employee_id is not null and exists (
      select 1
      from public.employee_schedule_availability_versions version,
        lateral jsonb_array_elements(version.recurring_rules) rule
      where version.employee_id = shift.employee_id
        and version.version_number = (
          select max(latest.version_number)
          from public.employee_schedule_availability_versions latest
          where latest.employee_id = shift.employee_id
        )
        and (rule->>'day')::integer = extract(dow from shift.scheduled_date)::integer
        and rule->>'mode' = 'unavailable'
    )
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

CREATE OR REPLACE FUNCTION public.preview_schedule_publication_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_location_ids uuid[], target_department_ids uuid[], include_no_department boolean)
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
    select 'time_source_unresolved'::text as code, 'hard'::text as severity, false as overrideable,
      shift.location_id,shift.employee_id,shift.scheduled_date,array[shift.id]::uuid[] as shift_ids,
      'Confirm shift hours before publishing this assignment.'::text as message
    from next_shift shift where shift.employee_id is not null
      and shift.time_basis in ('unresolved','legacy_unverified') and not exists (
        select 1 from public.schedule_published_shifts s
        where s.workspace_id=shift.workspace_id and s.source_shift_id=shift.id and s.time_basis='legacy_unverified'
          and (s.employee_id,s.location_id,s.job_id,s.shift_type_id,s.scheduled_date,s.start_time,s.end_time)
            is not distinct from (shift.employee_id,shift.location_id,shift.job_id,shift.shift_type_id,shift.scheduled_date,shift.start_time,shift.end_time)
      )
    union all
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
      'availability', 'soft', true, shift.location_id, shift.employee_id,
      shift.scheduled_date, array[shift.id]::uuid[],
      shift.employee_name || ' is unavailable on ' || shift.scheduled_date::text || '.'
    from next_shift shift
    where shift.employee_id is not null and exists (
      select 1
      from public.employee_schedule_availability_versions version,
        lateral jsonb_array_elements(version.recurring_rules) rule
      where version.employee_id = shift.employee_id
        and version.version_number = (
          select max(latest.version_number)
          from public.employee_schedule_availability_versions latest
          where latest.employee_id = shift.employee_id
        )
        and (rule->>'day')::integer = extract(dow from shift.scheduled_date)::integer
        and rule->>'mode' = 'unavailable'
    )
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

CREATE OR REPLACE FUNCTION public.preview_schedule_export_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date, source_type text, source_draft_id uuid, target_location_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare normalized uuid[]; source_revision integer; rows jsonb; locations jsonb; unsigned jsonb; workspace_name text;
begin
  if source_type not in ('published','draft') then raise exception 'invalid schedule export source' using errcode='22023'; end if;
  select array_agg(distinct id order by id) into normalized from unnest(target_location_ids) id;
  if coalesce(cardinality(normalized),0)=0 then raise exception 'schedule export location required' using errcode='22023'; end if;
  if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.export')
    or exists(select 1 from unnest(normalized) id where not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.export',id)) then
    raise exception 'schedule export scope denied' using errcode='42501';
  end if;
  if source_type='draft' then
    select revision into source_revision from public.schedule_drafts d where d.id=source_draft_id and d.workspace_id=target_workspace_id and d.week_start=target_week_start and d.archived_at is null;
    if source_revision is null then raise exception 'schedule export draft not found' using errcode='P0002'; end if;
  elsif source_draft_id is not null then raise exception 'published export cannot specify draft' using errcode='22023'; end if;
  select name into workspace_name from public.workspaces where id=target_workspace_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by l.sort_order,l.id),'[]'::jsonb) into locations
  from public.locations l where l.workspace_id=target_workspace_id and l.id=any(normalized);
  if jsonb_array_length(locations)<>cardinality(normalized) then raise exception 'schedule export location not found' using errcode='P0002'; end if;
  if source_type='draft' then
    select coalesce(jsonb_agg(jsonb_build_object('shift_id',s.id,'scheduled_date',s.scheduled_date,'location_name',l.name,
      'employee_name',case when s.employee_id is null then null else coalesce(nullif(e.preferred_name,''),e.first_name||' '||e.last_name) end,'job_name',j.name,'shift_type_name',st.name,
      'label_names',to_jsonb(coalesce(s.label_names,'{}'::text[])),
      'time_basis',s.time_basis,'time_snapshot',s.time_snapshot,'time_timezone',s.time_timezone,'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'),'crosses_midnight',s.crosses_midnight,'note',s.note,
      'scheduled_minutes',case when s.time_basis in ('unresolved','legacy_unverified') then 0 else greatest(0,(case when s.end_time<=s.start_time then 1440 else 0 end+extract(epoch from(s.end_time-s.start_time))/60)::integer-coalesce(s.unpaid_break_minutes,0)) end)
      order by s.scheduled_date,l.sort_order,s.start_time,s.id),'[]'::jsonb) into rows
    from public.schedule_draft_shifts s join public.locations l on l.id=s.location_id join public.jobs j on j.id=s.job_id
    left join public.employee_profiles e on e.id=s.employee_id left join public.shift_types st on st.id=s.shift_type_id
    where s.draft_id=source_draft_id and s.location_id=any(normalized);
  else
    select coalesce(jsonb_agg(jsonb_build_object('shift_id',s.id,'scheduled_date',s.scheduled_date,'location_name',l.name,
      'employee_name',case when s.employee_id is null then null else coalesce(nullif(e.preferred_name,''),e.first_name||' '||e.last_name) end,'job_name',j.name,'shift_type_name',st.name,
      'label_names',to_jsonb(coalesce(s.label_names,'{}'::text[])),
      'time_basis',s.time_basis,'time_snapshot',s.time_snapshot,'time_timezone',s.time_timezone,'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'),'crosses_midnight',s.crosses_midnight,'note',s.note,
      'scheduled_minutes',case when s.time_basis in ('unresolved','legacy_unverified') then 0 else greatest(0,(case when s.end_time<=s.start_time then 1440 else 0 end+extract(epoch from(s.end_time-s.start_time))/60)::integer-coalesce(s.unpaid_break_minutes,0)) end)
      order by s.scheduled_date,l.sort_order,s.start_time,s.id),'[]'::jsonb) into rows
    from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current' and p.week_start=target_week_start
    join public.locations l on l.id=s.location_id join public.jobs j on j.id=s.job_id left join public.employee_profiles e on e.id=s.employee_id left join public.shift_types st on st.id=s.shift_type_id
    where s.workspace_id=target_workspace_id and s.location_id=any(normalized);
  end if;
  unsigned:=jsonb_build_object('workspace_id',target_workspace_id,'workspace_name',workspace_name,'week_start',target_week_start,
    'source',case when source_type='draft' then jsonb_build_object('type','draft','draft_id',source_draft_id) else jsonb_build_object('type','published') end,
    'source_revision',source_revision,'locations',locations,'rows',rows,'summary',jsonb_build_object('shift_count',jsonb_array_length(rows),
      'employee_count',(select count(distinct x->>'employee_name') from jsonb_array_elements(rows) x where x->>'employee_name' is not null),
      'scheduled_minutes',(select coalesce(sum((x->>'scheduled_minutes')::integer),0) from jsonb_array_elements(rows) x)));
  return unsigned||jsonb_build_object('status','export_ready','fingerprint',encode(extensions.digest(convert_to(unsigned::text,'UTF8'),'sha256'),'hex'));
end; $function$;

CREATE OR REPLACE FUNCTION public.preview_schedule_auto_fill_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_session public.schedule_edit_sessions%rowtype; open_shift record; candidate_payload jsonb; recommended uuid;
  proposals jsonb:='[]'::jsonb; unfilled jsonb:='[]'::jsonb; unsigned jsonb;
begin
  select * into target_session from public.schedule_edit_sessions s where s.id=target_session_id and s.workspace_id=target_workspace_id;
  if target_session.id is null or target_session.holder_user_id<>actor_user_id or not public.schedule_actor_can_manage_service(actor_user_id,target_workspace_id) then raise exception 'edit session not found' using errcode='P0002'; end if;
  if target_session.status<>'active' or target_session.expires_at<=now() then raise exception 'edit lease expired' using errcode='40001'; end if;
  for open_shift in select s.*,l.name location_name,j.name job_name from public.schedule_edit_session_shifts s
    join public.locations l on l.id=s.location_id join public.jobs j on j.id=s.job_id
    where s.session_id=target_session.id and s.employee_id is null order by s.scheduled_date,s.start_time,s.id loop
    if open_shift.time_basis in ('unresolved','legacy_unverified') then
      unfilled:=unfilled||jsonb_build_array(jsonb_build_object('shift_id',open_shift.id,'reason','Confirm shift hours before auto-fill'));
      continue;
    end if;
    with eligible as (
      select e.id employee_id,coalesce(nullif(e.preferred_name,''),e.first_name||' '||e.last_name) employee_name,ja.is_primary,
        coalesce((select sum(case when x.end_time<=x.start_time then 1440 else 0 end + extract(epoch from (x.end_time-x.start_time))/60)::integer
          from public.schedule_edit_session_shifts x where x.session_id=target_session.id and x.employee_id=e.id),0) scheduled_minutes
      from public.employee_profiles e
      join public.employee_location_assignments la on la.employee_id=e.id and la.workspace_id=e.workspace_id and la.location_id=open_shift.location_id and la.ended_at is null
      join public.employee_job_assignments ja on ja.employee_id=e.id and ja.workspace_id=e.workspace_id and ja.job_id=open_shift.job_id and ja.ended_at is null
      where e.workspace_id=target_workspace_id and e.archived_at is null
      and not exists(select 1 from public.schedule_edit_session_shifts x where x.session_id=target_session.id and x.employee_id=e.id
        and tsrange(x.scheduled_date+x.start_time,x.scheduled_date+x.end_time+case when x.end_time<=x.start_time then interval '1 day' else interval '0' end,'[)')
          && tsrange(open_shift.scheduled_date+open_shift.start_time,open_shift.scheduled_date+open_shift.end_time+case when open_shift.end_time<=open_shift.start_time then interval '1 day' else interval '0' end,'[)'))
      and not exists(select 1 from public.employee_schedule_availability_versions av,lateral jsonb_array_elements(av.recurring_rules) rule
        where av.employee_id=e.id and av.version_number=(select max(v.version_number) from public.employee_schedule_availability_versions v where v.employee_id=e.id)
        and (rule->>'day')::integer=extract(dow from open_shift.scheduled_date)::integer
        and (rule->>'mode'='unavailable' or (rule->>'mode'='windows' and not exists(select 1 from jsonb_array_elements(rule->'windows') w where (w->>'start')::time<=open_shift.start_time and (w->>'end')::time>=open_shift.end_time))))
      and not exists(select 1 from jsonb_array_elements(proposals) p where (p->>'recommended_employee_id')::uuid=e.id
        and tsrange((p->>'scheduled_date')::date+(p->>'start_time')::time,(p->>'scheduled_date')::date+(p->>'end_time')::time+case when (p->>'end_time')::time<=(p->>'start_time')::time then interval '1 day' else interval '0' end,'[)')
          && tsrange(open_shift.scheduled_date+open_shift.start_time,open_shift.scheduled_date+open_shift.end_time+case when open_shift.end_time<=open_shift.start_time then interval '1 day' else interval '0' end,'[)'))
    ), ranked as (select *,min(scheduled_minutes) over() min_minutes from eligible)
    select coalesce(jsonb_agg(jsonb_build_object('employee_id',employee_id,'employee_name',employee_name,'scheduled_minutes',scheduled_minutes,
      'primary_job',is_primary,'reasons',to_jsonb(array_remove(array[case when scheduled_minutes=min_minutes then 'Fewest scheduled hours' end,case when is_primary then 'Primary job' end,'Available']::text[],null)))
      order by scheduled_minutes,is_primary desc,employee_id),'[]'::jsonb) into candidate_payload from ranked;
    if jsonb_array_length(candidate_payload)=0 then unfilled:=unfilled||jsonb_build_array(jsonb_build_object('shift_id',open_shift.id,'reason','No eligible employee'));
    else
      recommended:=(candidate_payload->0->>'employee_id')::uuid;
      proposals:=proposals||jsonb_build_array(jsonb_build_object('shift_id',open_shift.id,'location_name',open_shift.location_name,'job_name',open_shift.job_name,
        'scheduled_date',open_shift.scheduled_date,'time_basis',open_shift.time_basis,'time_snapshot',open_shift.time_snapshot,'time_timezone',open_shift.time_timezone,'start_time',to_char(open_shift.start_time,'HH24:MI'),'end_time',to_char(open_shift.end_time,'HH24:MI'),
        'recommended_employee_id',recommended,'candidates',candidate_payload));
    end if;
  end loop;
  unsigned:=jsonb_build_object('workspace_id',target_workspace_id,'session_id',target_session.id,'session_revision',target_session.revision,'proposals',proposals,'unfilled',unfilled);
  return unsigned||jsonb_build_object('status','review_ready','fingerprint',encode(extensions.digest(convert_to(unsigned::text,'UTF8'),'sha256'),'hex'));
end; $function$;

CREATE OR REPLACE FUNCTION public.shift_exchange_preview(actor uuid, w uuid, cid uuid, aid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.shift_exchange_cases%rowtype; a public.shift_exchange_applications%rowtype;
 s jsonb; t jsonb; r jsonb; g jsonb; problems text[]:='{}'; loc uuid; scoped boolean:=false; missing boolean:=false; fp text;
begin
 select * into c from public.shift_exchange_cases where workspace_id=w and id=cid;
 if c.id is null then raise exception 'Request not found' using errcode='P0002'; end if;
 s:=public.shift_exchange_shift(w,c.offered_source_id); t:=public.shift_exchange_shift(w,c.requested_source_id);
 for loc in select distinct x from unnest(array[(c.offered_snapshot->>'location_id')::uuid,(c.requested_snapshot->>'location_id')::uuid]) x where x is not null loop
  scoped:=scoped or public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',loc);
 end loop;
 if not scoped then raise exception 'Manager scope required' using errcode='42501'; end if;
 select * into a from public.shift_exchange_applications where workspace_id=w and case_id=cid and id=aid;
 if a.id is null then raise exception 'Application not found' using errcode='P0002'; end if;
 if c.status<>'open' or a.status<>'pending_manager' then problems:=array_append(problems,'This request is no longer ready for approval'); end if;
 if s->>'time_basis' in ('unresolved','legacy_unverified') or t->>'time_basis' in ('unresolved','legacy_unverified') then problems:=array_append(problems,'Confirm shift hours before approving this exchange'); end if;
 if s is null or (c.kind='swap' and t is null) then problems:=array_append(problems,'The published shift changed or was unpublished'); end if;
 fp:=public.shift_exchange_fingerprint(w,s,t);
 if fp is distinct from c.consent_fingerprint or fp is distinct from a.consent_fingerprint then problems:=array_append(problems,'Shift conditions changed. New employee consent is required'); end if;
 if c.expires_at<=now() or (s->>'starts_at')::timestamptz<=now() or (t->>'starts_at')::timestamptz<=now() then problems:=array_append(problems,'This shift has already started'); end if;
 if exists(select 1 from public.employee_profiles where workspace_id=w and user_id=actor and id in(c.owner_id,a.employee_id)) then problems:=array_append(problems,'A separate manager must approve your own exchange'); end if;
 if s is not null then r:=public.lineup_candidate_check(w,a.employee_id,s,array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null)); end if;
 if r is null then r:='{"status":"ineligible","reasons":["Published shift unavailable"]}'; end if;
 if r->>'status'<>'eligible' then problems:=array_append(problems,'The receiving employee is not eligible for the full shift'); end if;
 if c.kind='swap' and t is not null then
  g:=public.lineup_candidate_check(w,c.owner_id,t,array[(s->>'id')::uuid,(t->>'id')::uuid]::uuid[]);
  if g->>'status'<>'eligible' then problems:=array_append(problems,'The other employee is not eligible for the exchanged shift'); end if;
 end if;
 for loc in select distinct x from unnest(array[(s->>'location_id')::uuid,(t->>'location_id')::uuid]) x where x is not null loop
  if not public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',loc)
   and not exists(select 1 from public.shift_exchange_votes v where v.case_id=cid and v.application_id=aid and v.location_id=loc and v.fingerprint=fp
   and public.schedule_actor_has_capability_service(v.actor_user_id,w,'schedule.shift_change_requests.manage',loc)
   and not exists(select 1 from public.employee_profiles e where e.workspace_id=w and e.user_id=v.actor_user_id and e.id in(c.owner_id,a.employee_id))) then missing:=true; end if;
 end loop;
 return jsonb_build_object('allowed',cardinality(problems)=0,'fingerprint',fp,'reasons',to_jsonb(problems),'receiver',r,'giver',g,'requires_other_manager',missing,
 'other_applications',(select count(*) from public.shift_exchange_applications where case_id=cid and id<>aid and status in('invited','pending_manager')));
end; $function$;

CREATE OR REPLACE FUNCTION public.shift_exchanges_command_service(actor uuid, w uuid, command jsonb, idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp public.employee_profiles%rowtype; c public.shift_exchange_cases%rowtype; a public.shift_exchange_applications%rowtype;
 old_cmd public.shift_exchange_commands%rowtype; s jsonb; t jsonb; checked jsonb; result jsonb; fp text;
 action text:=command->>'action'; cid uuid:=(command->>'case_id')::uuid; aid uuid:=(command->>'application_id')::uuid;
 candidate uuid; loc uuid; other record; expires timestamptz; owns boolean; manager boolean;
begin
 if idempotency_key is null then raise exception 'Idempotency key required'; end if;
 if not exists(select 1 from public.workspace_memberships where workspace_id=w and user_id=actor and status='active') then raise exception 'Active workspace access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(w::text,921));
 select * into old_cmd from public.shift_exchange_commands q where q.workspace_id=w and q.actor_user_id=actor and q.idempotency_key=shift_exchanges_command_service.idempotency_key;
 if old_cmd.idempotency_key is not null then
  if old_cmd.command<>command then raise exception 'Idempotency key was used for another action' using errcode='22023'; end if;
  return old_cmd.result;
 end if;
 if not coalesce((select shift_exchanges_enabled from public.workspaces where id=w),false) then raise exception 'Shift changes are temporarily read-only' using errcode='55000'; end if;
 select * into emp from public.employee_profiles where workspace_id=w and user_id=actor and archived_at is null;
 if action in('create','apply') then
  if emp.id is null then raise exception 'Employee profile required' using errcode='42501'; end if;
  s:=public.shift_exchange_shift(w,(command->>'shift_id')::uuid);
  if s is null or s->>'time_basis' in ('unresolved','legacy_unverified') or (s->>'starts_at')::timestamptz<=now() then raise exception 'Choose an upcoming published shift' using errcode='PT409'; end if;
  if exists(select 1 from public.schedule_shift_change_requests r join public.schedule_published_shifts p on p.id in(r.offered_shift_id,r.requested_shift_id) where r.workspace_id=w and r.status='pending_manager_approval' and coalesce(p.source_shift_id,p.id)=(s->>'source_id')::uuid) then raise exception 'An existing request must be resolved before offering this shift'; end if;
  if action='create' then
   if (s->>'employee_id')::uuid is distinct from emp.id then raise exception 'Only the current owner can offer this shift' using errcode='42501'; end if;
   if command->>'kind' not in('cover','swap') then raise exception 'Invalid exchange kind'; end if;
   if command->>'kind'='swap' then
    t:=public.shift_exchange_shift(w,(command->>'requested_shift_id')::uuid);
    if t is null or t->>'time_basis' in ('unresolved','legacy_unverified') or t->>'employee_id' is null or t->>'employee_id'=emp.id::text or (t->>'starts_at')::timestamptz<=now() then raise exception 'Choose an upcoming teammate shift'; end if;
    candidate:=(t->>'employee_id')::uuid;
    if public.lineup_candidate_check(w,emp.id,t,array[(s->>'id')::uuid,(t->>'id')::uuid])->>'status'<>'eligible' then raise exception 'You are not eligible for the teammate shift'; end if;
   else candidate:=(command->>'employee_id')::uuid; end if;
   if candidate=emp.id then raise exception 'Choose a different teammate'; end if;
   if candidate is not null and public.lineup_candidate_check(w,candidate,s,array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null))->>'status'<>'eligible' then raise exception 'This teammate is not eligible for the full shift'; end if;
   for other in select x.id,public.shift_exchange_live_status(w,x.id) live_status from public.shift_exchange_cases x
    where x.workspace_id=w and x.status='open' and x.offered_source_id=(s->>'source_id')::uuid loop
    if other.live_status<>'open' then
     update public.shift_exchange_cases set status=other.live_status,revision=revision+1,updated_at=now() where id=other.id;
     update public.shift_exchange_applications set status=other.live_status,updated_at=now() where case_id=other.id and status in('invited','pending_manager');
     delete from public.shift_exchange_votes where case_id=other.id;
     perform public.shift_exchange_emit(actor,w,other.id,null,other.live_status,'This offer ended because the shift changed or started. Review the current schedule before making a new request.');
    end if;
   end loop;
   fp:=public.shift_exchange_fingerprint(w,s,t);
   expires:=least((s->>'starts_at')::timestamptz,(t->>'starts_at')::timestamptz);
   insert into public.shift_exchange_cases(workspace_id,kind,audience,offered_source_id,requested_source_id,owner_id,offered_snapshot,requested_snapshot,consent_fingerprint,expires_at,private_note,created_by)
   values(w,command->>'kind',case when candidate is null then 'eligible_pool' else 'direct' end,(s->>'source_id')::uuid,(t->>'source_id')::uuid,emp.id,s,t,fp,expires,coalesce(command->>'note',''),actor) returning * into c;
   cid:=c.id;
   if candidate is not null then
    insert into public.shift_exchange_applications(workspace_id,case_id,employee_id,status,consent_fingerprint) values(w,cid,candidate,'invited',fp) returning id into aid;
   end if;
   perform public.shift_exchange_emit(actor,w,cid,aid,case when candidate is null then 'cover_opened' else 'peer_invited' end,'Cover or swap requested. The current owner remains responsible until manager approval.');
  else
   if (s->>'employee_id')::uuid=emp.id then raise exception 'You already own this shift'; end if;
   select * into c from public.shift_exchange_cases where workspace_id=w and offered_source_id=(s->>'source_id')::uuid and status='open' for update;
   if c.id is null then
    if s->>'employee_id' is not null then raise exception 'This shift has not been offered for cover'; end if;
    fp:=public.shift_exchange_fingerprint(w,s,null);
    insert into public.shift_exchange_cases(workspace_id,kind,offered_source_id,offered_snapshot,consent_fingerprint,expires_at,created_by)
    values(w,'open_pickup',(s->>'source_id')::uuid,s,fp,(s->>'starts_at')::timestamptz,actor) returning * into c;
   end if;
   if c.audience<>'eligible_pool' or c.kind='swap' or (cid is not null and cid<>c.id) then raise exception 'This offer is not available' using errcode='42501'; end if;
   if public.shift_exchange_fingerprint(w,s,null)<>c.consent_fingerprint then raise exception 'Shift conditions changed. The owner must renew this offer' using errcode='PT409'; end if;
   if public.lineup_candidate_check(w,emp.id,s)->>'status'<>'eligible' then raise exception 'You are not eligible for the full shift'; end if;
   cid:=c.id;
   if exists(select 1 from public.shift_exchange_applications where case_id=cid and employee_id=emp.id and status='pending_manager') then raise exception 'You already have an active application'; end if;
   insert into public.shift_exchange_applications(workspace_id,case_id,employee_id,status,consent_fingerprint) values(w,cid,emp.id,'pending_manager',c.consent_fingerprint) returning id into aid;
   update public.shift_exchange_cases set revision=revision+1,updated_at=now() where id=cid returning * into c;
   perform public.shift_exchange_emit(actor,w,cid,aid,'application_submitted','A teammate requested this shift. The current owner remains responsible.');
  end if;
 else
  select * into c from public.shift_exchange_cases where id=cid and workspace_id=w for update;
  if c.id is null then raise exception 'Request not found' using errcode='P0002'; end if;
  s:=public.shift_exchange_shift(w,c.offered_source_id); t:=public.shift_exchange_shift(w,c.requested_source_id);
  owns:=c.owner_id=emp.id;
  manager:=public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',(c.offered_snapshot->>'location_id')::uuid)
   or (c.kind='swap' and public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',(c.requested_snapshot->>'location_id')::uuid));
  if not coalesce(owns,false) and not coalesce(manager,false) and not exists(select 1 from public.shift_exchange_applications where case_id=cid and employee_id=emp.id) then raise exception 'Request access denied' using errcode='42501'; end if;
  if c.status<>'open' or c.revision is distinct from (command->>'expected_revision')::integer then raise exception 'This request changed. Review the latest details' using errcode='PT409'; end if;
  if c.expires_at<=now() then
   update public.shift_exchange_cases set status='expired',revision=revision+1,updated_at=now() where id=cid returning * into c;
   update public.shift_exchange_applications set status='expired',updated_at=now() where case_id=cid and status in('invited','pending_manager');
   perform public.shift_exchange_emit(actor,w,cid,null,'expired','The shift has started. The current owner remains responsible.');
  elsif public.shift_exchange_live_status(w,cid)='invalidated' then
   update public.shift_exchange_cases set status='invalidated',revision=revision+1,updated_at=now() where id=cid returning * into c;
   update public.shift_exchange_applications set status='invalidated',updated_at=now() where case_id=cid and status in('invited','pending_manager');
   delete from public.shift_exchange_votes where case_id=cid;
   perform public.shift_exchange_emit(actor,w,cid,null,'invalidated','Shift details changed. This offer ended without a transfer. Start a new request from the current schedule.');
  elsif action='close' then
   if not coalesce(owns,false) and not coalesce(manager,false) then raise exception 'Only the owner or a manager can close this search' using errcode='42501'; end if;
   if coalesce(length(trim(command->>'reason')),0)=0 then raise exception 'Choose a reason for closing this search'; end if;
   update public.shift_exchange_cases set status='cancelled',revision=revision+1,updated_at=now() where id=cid returning * into c;
   update public.shift_exchange_applications set status='closed_case_cancelled',reason=command->>'reason',updated_at=now() where case_id=cid and status in('invited','pending_manager');
   perform public.shift_exchange_emit(actor,w,cid,null,'case_closed',command->>'reason',coalesce(command->>'private_note',''));
  else
   select * into a from public.shift_exchange_applications where id=aid and case_id=cid and workspace_id=w for update;
   if a.id is null or a.status not in('invited','pending_manager') then raise exception 'This application is no longer active' using errcode='PT409'; end if;
   if action in('accept','decline','withdraw') then
    if a.employee_id is distinct from emp.id then raise exception 'Only the invited employee can respond' using errcode='42501'; end if;
    if action in('accept','decline') and a.status<>'invited' then raise exception 'This invitation already has a response'; end if;
    if action='accept' then
     if public.shift_exchange_fingerprint(w,s,t) is distinct from c.consent_fingerprint then raise exception 'Shift conditions changed. Ask for a new offer' using errcode='PT409'; end if;
     if public.lineup_candidate_check(w,emp.id,s,array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null))->>'status'<>'eligible'
      or (c.kind='swap' and public.lineup_candidate_check(w,c.owner_id,t,array[(s->>'id')::uuid,(t->>'id')::uuid])->>'status'<>'eligible') then raise exception 'Both employees must be eligible for the full exchange'; end if;
    end if;
    update public.shift_exchange_applications set status=case action when 'accept' then 'pending_manager' when 'decline' then 'declined_by_employee' else 'withdrawn' end,updated_at=now() where id=aid;
    delete from public.shift_exchange_votes where case_id=cid and application_id=aid;
    if c.audience='direct' and action in('decline','withdraw') then update public.shift_exchange_cases set status='cancelled' where id=cid; end if;
    perform public.shift_exchange_emit(actor,w,cid,aid,case action when 'accept' then 'peer_accepted' when 'decline' then 'peer_declined' else 'application_withdrawn' end,
     case action when 'accept' then 'Accepted. Awaiting manager approval; the original owner remains responsible.' when 'decline' then 'The teammate declined. No assignment changed.' else case when c.audience='direct' then 'The employee withdrew consent. This request ended without a transfer.' else 'The application was withdrawn. Other candidates remain available.' end end);
   elsif action in('reject','approve') then
    if not coalesce(manager,false) then raise exception 'Manager scope required' using errcode='42501'; end if;
    if action='reject' then
     if coalesce(length(trim(command->>'reason')),0)=0 then raise exception 'Provide a reason visible to this employee'; end if;
     update public.shift_exchange_applications set status='rejected_by_manager',reason=command->>'reason',updated_at=now() where id=aid;
     delete from public.shift_exchange_votes where case_id=cid and application_id=aid;
     if c.audience='direct' then update public.shift_exchange_cases set status='cancelled' where id=cid; end if;
     perform public.shift_exchange_emit(actor,w,cid,aid,'application_rejected',command->>'reason',coalesce(command->>'private_note',''));
    else
     checked:=public.shift_exchange_preview(actor,w,cid,aid);
     if not (checked->>'allowed')::boolean then raise exception '%',checked->'reasons' using errcode='PT409'; end if;
     if command->>'fingerprint' is distinct from checked->>'fingerprint' then raise exception 'This approval preview changed. Review the latest details' using errcode='PT409'; end if;
     fp:=checked->>'fingerprint';
     for loc in select distinct x from unnest(array[(s->>'location_id')::uuid,(t->>'location_id')::uuid]) x where x is not null loop
      if public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',loc) then
       insert into public.shift_exchange_votes(case_id,workspace_id,application_id,location_id,actor_user_id,fingerprint) values(cid,w,aid,loc,actor,fp)
       on conflict(case_id,location_id) do update set application_id=excluded.application_id,actor_user_id=excluded.actor_user_id,fingerprint=excluded.fingerprint,created_at=now();
      end if;
     end loop;
     if (checked->>'requires_other_manager')::boolean then
      perform public.shift_exchange_emit(actor,w,cid,aid,'scope_approved','One location approved. Awaiting the other manager; assignments are unchanged.');
     else
      perform 1 from public.schedule_published_shifts where id in((s->>'id')::uuid,(t->>'id')::uuid) order by id for update;
      -- Recheck after row locks as external Schedule writers may predate the shared workspace lock.
      checked:=public.shift_exchange_preview(actor,w,cid,aid);
      if not (checked->>'allowed')::boolean or checked->>'fingerprint'<>fp then raise exception 'Schedule changed during approval' using errcode='PT409'; end if;
      update public.schedule_published_shifts set employee_id=a.employee_id where id=(s->>'id')::uuid;
      if c.kind='swap' then update public.schedule_published_shifts set employee_id=c.owner_id where id=(t->>'id')::uuid; end if;
      perform public.shift_exchange_reconcile(actor,w,s,a.employee_id);
      if c.kind='swap' then perform public.shift_exchange_reconcile(actor,w,t,c.owner_id); end if;
      update public.shift_exchange_applications set status='approved',updated_at=now() where id=aid;
      for other in select id from public.shift_exchange_applications where case_id=cid and id<>aid and status in('invited','pending_manager') loop
       update public.shift_exchange_applications set status='closed_other_selected',updated_at=now() where id=other.id;
       perform public.shift_exchange_emit(actor,w,cid,other.id,'other_selected','Another teammate was selected. Your schedule has not changed.');
      end loop;
      update public.shift_exchange_cases set status='completed' where id=cid;
      perform public.shift_exchange_emit(actor,w,cid,aid,'transfer_completed','Manager approved the transfer. The receiving employee is now responsible; the previous owner is released.',coalesce(command->>'private_note',''));
      for other in select x.id from public.shift_exchange_cases x where x.workspace_id=w and x.status='open' and x.id<>cid
       and (x.offered_source_id in(c.offered_source_id,c.requested_source_id) or x.requested_source_id in(c.offered_source_id,c.requested_source_id)) loop
       update public.shift_exchange_cases set status='invalidated',revision=revision+1,updated_at=now() where id=other.id;
       update public.shift_exchange_applications set status='invalidated',updated_at=now() where case_id=other.id and status in('invited','pending_manager');
       perform public.shift_exchange_emit(actor,w,other.id,null,'invalidated','An involved shift changed owner. Start a new request using the current schedule.');
      end loop;
     end if;
    end if;
   else raise exception 'Unknown exchange action'; end if;
   update public.shift_exchange_cases set revision=revision+1,updated_at=now() where id=cid returning * into c;
  end if;
 end if;
 perform realtime.send(jsonb_build_object('workspace_id',w,'case_id',cid,'revision',c.revision),'changed','shift-exchanges:'||w::text,false);
 result:=jsonb_build_object('case_id',cid,'status',c.status,'revision',c.revision);
 insert into public.shift_exchange_commands(workspace_id,actor_user_id,idempotency_key,command,result) values(w,actor,idempotency_key,command,result);
 return result;
end; $function$;
