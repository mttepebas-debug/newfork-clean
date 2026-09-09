-- One command for job metadata and its staged employee assignments. Existing
-- assignment validation, primary selection and event history stay authoritative.
create or replace function public.update_job_details_and_assignments_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_job_id uuid,
  job_input jsonb default null,
  expected_job jsonb default null,
  assignment_changes jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.jobs;
  department public.departments;
  desired jsonb;
  actual jsonb;
  selected_department_id uuid;
  result jsonb := '{"changed_count":0,"unchanged_count":0}'::jsonb;
begin
  if actor_user_id is null then
    raise exception 'Valid actor required' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  if job_input is not null then
    if not public.can_manage_workspace(target_workspace_id) then
      raise exception 'Workspace management access required' using errcode = '42501';
    end if;
  elsif not public.workspace_has_permission(target_workspace_id, 'employees.manage')
    or not public.workspace_has_permission(target_workspace_id, 'employees.read') then
    raise exception 'Employee management access required' using errcode = '42501';
  end if;
  if jsonb_typeof(assignment_changes) is distinct from 'array' then
    raise exception 'Valid assignment changes required' using errcode = '22023';
  end if;
  if jsonb_array_length(assignment_changes) > 10000
    or (job_input is null and jsonb_array_length(assignment_changes) = 0) then
    raise exception 'Choose at least one change and at most 10000 employees' using errcode = '22023';
  end if;
  if (job_input is null) <> (expected_job is null) then
    raise exception 'Job details require their original values' using errcode = '22023';
  end if;

  select * into target from public.jobs
    where id = target_job_id and workspace_id = target_workspace_id for update;
  if target.id is null or target.deleted_at is not null then
    raise exception 'This job is no longer available' using errcode = 'P0002';
  end if;

  if job_input is not null then
    if jsonb_typeof(job_input) is distinct from 'object'
      or jsonb_typeof(expected_job) is distinct from 'object'
      or jsonb_typeof(job_input->'name') is distinct from 'string'
      or char_length(btrim(job_input->>'name')) not between 1 and 100
      or jsonb_typeof(job_input->'color') is distinct from 'string'
      or (job_input->>'color') !~ '^#[0-9a-fA-F]{6}$'
      or not (job_input ? 'department_id')
      or jsonb_typeof(job_input->'department_id') not in ('string', 'null') then
      raise exception 'Valid job name, color and department required' using errcode = '22023';
    end if;
    selected_department_id := (job_input->>'department_id')::uuid;
    desired := jsonb_build_object(
      'name', btrim(job_input->>'name'), 'color', job_input->>'color', 'department_id', selected_department_id
    );
    actual := jsonb_build_object(
      'name', target.name, 'color', target.color, 'department_id', target.department_id
    );
    -- A successful request can be retried with the same original values.
    if desired is distinct from actual then
      if expected_job is distinct from actual then
        raise exception 'Job details changed. Reload the latest job and review your draft.' using errcode = 'PT409';
      end if;
      if selected_department_id is not null and selected_department_id is distinct from target.department_id then
        select * into department from public.departments d
          where d.id = selected_department_id and d.workspace_id = target_workspace_id for share;
        if department.id is null or department.archived_at is not null or department.deleted_at is not null then
          raise exception 'Choose an active department in this workspace' using errcode = '22023';
        end if;
      end if;
      begin
        update public.jobs set
          name = desired->>'name', color = desired->>'color',
          department_id = selected_department_id,
          updated_at = now()
          where id = target_job_id and workspace_id = target_workspace_id
          returning * into target;
      exception when unique_violation then
        raise exception 'This job name already exists. Choose a unique name.' using errcode = '23505';
      end;
    end if;
  end if;

  if jsonb_array_length(assignment_changes) > 0 then
    result := public.update_job_assignments_service(
      actor_user_id, target_workspace_id, target_job_id, assignment_changes
    );
  end if;
  return result || jsonb_build_object('job', to_jsonb(target));
end;
$$;

revoke all on function public.update_job_details_and_assignments_service(uuid,uuid,uuid,jsonb,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.update_job_details_and_assignments_service(uuid,uuid,uuid,jsonb,jsonb,jsonb)
  to service_role;
