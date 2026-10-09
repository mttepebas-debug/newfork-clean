create or replace function public.apply_schedule_template_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid,
  expected_session_revision integer,
  target_template_id uuid,
  apply_mode text,
  department_keys text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

    insert into public.schedule_edit_session_shifts(
      id,
      workspace_id,
      session_id,
      location_id,
      employee_id,
      job_id,
      shift_type_id,
      scheduled_date,
      start_time,
      end_time,
      hide_time_on_badge,
      label_ids,
      label_names,
      note
    )
    values(
      gen_random_uuid(),
      target_workspace_id,
      target_session.id,
      source.location_id,
      chosen_employee,
      source.job_id,
      source.shift_type_id,
      target_date,
      source.start_time,
      source.end_time,
      source.hide_time_on_badge,
      coalesce(source.label_ids, '{}'::uuid[]),
      coalesce(source.label_names, '{}'::text[]),
      source.note
    );
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
$$;

revoke all on function public.apply_schedule_template_service(uuid, uuid, uuid, integer, uuid, text, text[])
from public, anon, authenticated;
grant execute on function public.apply_schedule_template_service(uuid, uuid, uuid, integer, uuid, text, text[])
to service_role;
