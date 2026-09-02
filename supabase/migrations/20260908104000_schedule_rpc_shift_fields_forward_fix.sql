-- Forward-only repair for fields that were previously added by editing applied migrations.
-- Keep wrapper functions and their grants intact; only replace their existing base implementations.

create or replace function public.get_schedule_read_model_service_label_base(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
        'default_start_time', case when shift_type.default_start_time is null then null else to_char(shift_type.default_start_time, 'HH24:MI') end,
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
        'start_time', to_char(shift.start_time, 'HH24:MI'),
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
$$;

create or replace function public.get_schedule_edit_session_service_base(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
        'start_time', to_char(shift.start_time, 'HH24:MI'),
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
$$;

create or replace function public.mutate_schedule_edit_shift_service_base(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid,
  expected_session_revision integer,
  operation text,
  target_shift_id uuid,
  expected_shift_revision integer default null,
  shift_payload jsonb default null,
  request_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    target_location_id := (shift_payload->>'location_id')::uuid;
    target_employee_id := nullif(shift_payload->>'employee_id', '')::uuid;
    target_job_id := (shift_payload->>'job_id')::uuid;
    target_shift_type_id := nullif(shift_payload->>'shift_type_id', '')::uuid;
    target_scheduled_date := (shift_payload->>'scheduled_date')::date;
    target_start_time := (shift_payload->>'start_time')::time;
    target_end_time := (shift_payload->>'end_time')::time;
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
    insert into public.schedule_edit_session_shifts (
      id, workspace_id, session_id, location_id, employee_id, job_id,
      shift_type_id, scheduled_date, start_time, end_time, unpaid_break_minutes, hide_time_on_badge, note, idempotency_key
    ) values (
      coalesce(target_shift_id, gen_random_uuid()), target_workspace_id, target_session_id,
      target_location_id, target_employee_id, target_job_id, target_shift_type_id,
      target_scheduled_date, target_start_time, target_end_time, target_unpaid_break_minutes, target_hide_time_on_badge, target_note,
      request_idempotency_key
    );
  elsif operation = 'update' then
    update public.schedule_edit_session_shifts shift
    set location_id = target_location_id, employee_id = target_employee_id,
      job_id = target_job_id, shift_type_id = target_shift_type_id,
      scheduled_date = target_scheduled_date, start_time = target_start_time,
      end_time = target_end_time, unpaid_break_minutes = target_unpaid_break_minutes, hide_time_on_badge = target_hide_time_on_badge, note = target_note,
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
$$;

create or replace function public.save_schedule_edit_session_service_base(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid,
  expected_session_revision integer,
  target_name text,
  target_draft_id uuid default null,
  expected_draft_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  insert into public.schedule_draft_shifts (
    id, workspace_id, draft_id, location_id, employee_id, job_id,
    shift_type_id, scheduled_date, start_time, end_time, unpaid_break_minutes, hide_time_on_badge, note, revision
  )
  select shift.id, shift.workspace_id, saved_draft.id, shift.location_id,
    shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date,
    shift.start_time, shift.end_time, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.revision
  from public.schedule_edit_session_shifts shift
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
$$;

create or replace function public.create_schedule_template_service_label_base(actor_user_id uuid,target_workspace_id uuid,target_draft_id uuid,target_name text,strip_assignments boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.schedule_drafts%rowtype; new_template public.schedule_templates%rowtype;
begin
 if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.manage') then raise exception 'schedule template access denied' using errcode='42501'; end if;
 select * into d from public.schedule_drafts where id=target_draft_id and workspace_id=target_workspace_id and archived_at is null;
 if d.id is null then raise exception 'schedule draft not found' using errcode='P0002'; end if;
 if not exists(select 1 from public.schedule_draft_shifts where draft_id=d.id) then raise exception 'schedule template source is empty' using errcode='22023'; end if;
 if exists(select 1 from public.schedule_draft_shifts s where s.draft_id=d.id and not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.templates.manage',s.location_id)) then raise exception 'schedule template scope denied' using errcode='42501'; end if;
 insert into public.schedule_templates(workspace_id,name,created_by,updated_by) values(target_workspace_id,btrim(target_name),actor_user_id,actor_user_id) returning * into new_template;
 insert into public.schedule_template_shifts(workspace_id,template_id,location_id,employee_id,job_id,shift_type_id,day_offset,start_time,end_time,hide_time_on_badge,note)
 select s.workspace_id,new_template.id,s.location_id,case when strip_assignments then null else s.employee_id end,s.job_id,s.shift_type_id,(s.scheduled_date-d.week_start),s.start_time,s.end_time,s.hide_time_on_badge,s.note
 from public.schedule_draft_shifts s where s.draft_id=d.id;
 insert into public.schedule_template_events(workspace_id,template_id,template_name,action,actor_user_id,detail)
 values(target_workspace_id,new_template.id,new_template.name,'created',actor_user_id,jsonb_build_object('source_draft_id',d.id,'strip_assignments',strip_assignments));
 return public.get_schedule_template_service(actor_user_id,target_workspace_id,new_template.id);
exception when unique_violation then raise exception 'schedule template name conflict' using errcode='23505'; end; $$;
