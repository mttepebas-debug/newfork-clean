create or replace function public.save_employee(
  target_workspace_id uuid, target_employee_id uuid, employee_first_name text,
  employee_last_name text, employee_preferred_name text, employee_invitation_email text,
  employee_start_date date, employee_internal_note text, location_ids uuid[],
  primary_location_id uuid, job_ids uuid[], primary_job_id uuid, expected_revision integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  saved_id uuid := target_employee_id;
  current_revision integer;
  next_code bigint;
begin
  if actor_id is null or not public.workspace_has_permission(target_workspace_id, 'employees.manage') then
    raise exception 'employee management access required' using errcode = '42501';
  end if;
  if char_length(btrim(employee_first_name)) not between 1 and 80 or char_length(btrim(employee_last_name)) not between 1 and 80 then
    raise exception 'employee first and last name are required' using errcode = '22023';
  end if;
  if primary_location_id is not null and not primary_location_id = any(coalesce(location_ids, '{}')) then
    raise exception 'primary location must be assigned' using errcode = '22023';
  end if;
  if primary_job_id is not null and not primary_job_id = any(coalesce(job_ids, '{}')) then
    raise exception 'primary job must be assigned' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(location_ids, '{}')) selected(location_id) left join public.locations l on l.id = selected.location_id and l.workspace_id = target_workspace_id and l.archived_at is null where l.id is null or not public.can_access_location(target_workspace_id, selected.location_id)) then
    raise exception 'invalid or inaccessible employee location' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(job_ids, '{}')) selected(job_id) left join public.jobs j on j.id = selected.job_id and j.workspace_id = target_workspace_id and j.archived_at is null where j.id is null) then
    raise exception 'invalid employee job' using errcode = '22023';
  end if;

  if saved_id is null then
    insert into public.workspace_employee_counters (workspace_id, next_value)
    values (target_workspace_id, 1)
    on conflict (workspace_id) do nothing;

    update public.workspace_employee_counters counter
    set next_value = greatest(
      counter.next_value,
      coalesce((
        select max(substring(employee.employee_code from 3)::bigint) + 1
        from public.employee_profiles employee
        where employee.workspace_id = target_workspace_id
          and employee.employee_code ~ '^E-[0-9]{4,}$'
      ), 1)
    ) + 1
    where counter.workspace_id = target_workspace_id
    returning counter.next_value - 1 into next_code;

    insert into public.employee_profiles (workspace_id, employee_code, first_name, last_name, preferred_name, invitation_email, start_date, internal_note, created_by)
    values (target_workspace_id, 'E-' || lpad(next_code::text, 4, '0'), btrim(employee_first_name), btrim(employee_last_name), btrim(coalesce(employee_preferred_name, '')), nullif(lower(btrim(employee_invitation_email)), ''), employee_start_date, btrim(coalesce(employee_internal_note, '')), actor_id)
    returning id into saved_id;
    insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
    values (target_workspace_id, saved_id, actor_id, 'employee.created', 'Employee record created');
  else
    select revision into current_revision from public.employee_profiles
    where id = saved_id and workspace_id = target_workspace_id and archived_at is null
      and public.can_access_employee(target_workspace_id, id) for update;
    if current_revision is null then raise exception 'employee not found' using errcode = 'P0002'; end if;
    if expected_revision is null or expected_revision <> current_revision then raise exception 'employee revision conflict' using errcode = '40001'; end if;
    update public.employee_profiles set first_name = btrim(employee_first_name), last_name = btrim(employee_last_name),
      preferred_name = btrim(coalesce(employee_preferred_name, '')), invitation_email = nullif(lower(btrim(employee_invitation_email)), ''),
      start_date = employee_start_date, internal_note = btrim(coalesce(employee_internal_note, '')),
      revision = revision + 1, updated_at = now() where id = saved_id;
    insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
    values (target_workspace_id, saved_id, actor_id, 'employee.updated', 'Employee profile and assignments updated');
  end if;

  update public.employee_location_assignments set ended_at = now() where employee_id = saved_id and ended_at is null;
  insert into public.employee_location_assignments (workspace_id, employee_id, location_id, is_primary, created_by)
  select target_workspace_id, saved_id, selected.location_id, selected.location_id = primary_location_id, actor_id from unnest(coalesce(location_ids, '{}')) selected(location_id);
  update public.employee_job_assignments set ended_at = now() where employee_id = saved_id and ended_at is null;
  insert into public.employee_job_assignments (workspace_id, employee_id, job_id, is_primary, created_by)
  select target_workspace_id, saved_id, selected.job_id, selected.job_id = primary_job_id, actor_id from unnest(coalesce(job_ids, '{}')) selected(job_id);
  return saved_id;
end;
$$;

revoke all on function public.save_employee(uuid, uuid, text, text, text, text, date, text, uuid[], uuid, uuid[], uuid, integer) from public, anon;
grant execute on function public.save_employee(uuid, uuid, text, text, text, text, date, text, uuid[], uuid, uuid[], uuid, integer) to authenticated;
