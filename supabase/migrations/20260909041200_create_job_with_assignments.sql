-- Read assignable employees before a new job exists. All candidates start
-- unassigned; the eventual create command applies staged selections atomically.
create or replace function public.read_new_job_assignments_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  search_text text default '',
  location_filter uuid default null,
  assignment_filter text default 'all',
  page_number integer default 0,
  targets_only boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  if not public.workspace_has_permission(target_workspace_id, 'employees.read') then
    raise exception 'employee read access required' using errcode = '42501';
  end if;
  if assignment_filter not in ('all', 'assigned', 'unassigned') or page_number < 0 then
    raise exception 'Valid filters required' using errcode = '22023';
  end if;

  with candidates as materialized (
    select * from app_private.job_assignment_candidates(target_workspace_id, null::uuid)
  ), filtered as materialized (
    select * from candidates c
    where (coalesce(btrim(search_text), '') = ''
      or strpos(lower(c.display_name || ' ' || c.employee_code), lower(btrim(search_text))) > 0)
      and (location_filter is null or location_filter = any(c.location_ids))
      and (assignment_filter = 'all' or c.assigned = (assignment_filter = 'assigned'))
  ), paged as (
    select * from filtered where not targets_only or can_manage
    order by lower(display_name), employee_id
    limit case when targets_only then null else 50 end
    offset case when targets_only then 0 else page_number * 50 end
  )
  select case when targets_only then
    coalesce((select jsonb_agg(jsonb_build_object(
      'employee_id', employee_id, 'assigned', assigned, 'revision', revision
    ) order by lower(display_name), employee_id) from paged), '[]'::jsonb)
  else jsonb_build_object(
    'employees', coalesce((select jsonb_agg(to_jsonb(p) - 'location_ids' order by lower(display_name), employee_id) from paged p), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'manageable_total', (select count(*) from filtered where can_manage),
    'assigned_count', 0,
    'locations', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) order by lower(l.name), l.id)
      from public.locations l where l.workspace_id = target_workspace_id and l.archived_at is null
      and exists(select 1 from candidates c where l.id = any(c.location_ids))), '[]'::jsonb)
  ) end into result;

  return result;
end;
$$;

-- Create a job and apply staged employee assignments in one transaction.
create or replace function public.create_job_with_assignments_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  job_input jsonb,
  assignment_changes jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.jobs;
  department public.departments;
  selected_department_id uuid;
  next_order integer;
  result jsonb := '{"changed_count":0,"unchanged_count":0}'::jsonb;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  if not public.can_manage_workspace(target_workspace_id) then
    raise exception 'workspace management access required' using errcode = '42501';
  end if;
  if jsonb_typeof(job_input) is distinct from 'object'
    or jsonb_typeof(job_input->'name') is distinct from 'string'
    or char_length(btrim(job_input->>'name')) not between 1 and 100
    or jsonb_typeof(job_input->'color') is distinct from 'string'
    or (job_input->>'color') !~ '^#[0-9a-fA-F]{6}$'
    or not (job_input ? 'department_id')
    or jsonb_typeof(job_input->'department_id') not in ('string', 'null') then
    raise exception 'Valid job name, color and department required' using errcode = '22023';
  end if;
  if jsonb_typeof(assignment_changes) is distinct from 'array'
    or jsonb_array_length(assignment_changes) > 10000 then
    raise exception 'Choose at most 10000 employees' using errcode = '22023';
  end if;

  selected_department_id := (job_input->>'department_id')::uuid;
  if selected_department_id is not null then
    select * into department from public.departments d
      where d.id = selected_department_id and d.workspace_id = target_workspace_id for share;
    if department.id is null or department.archived_at is not null or department.deleted_at is not null then
      raise exception 'Choose an active department in this workspace' using errcode = '22023';
    end if;
  end if;

  perform 1 from public.workspaces where id = target_workspace_id for update;
  select coalesce(max(sort_order), -1) + 1 into next_order
    from public.jobs where workspace_id = target_workspace_id;

  begin
    insert into public.jobs(workspace_id, department_id, name, color, sort_order)
    values(
      target_workspace_id,
      selected_department_id,
      btrim(job_input->>'name'),
      job_input->>'color',
      next_order
    )
    returning * into target;
  exception when unique_violation then
    raise exception 'This job name already exists. Choose a unique name.' using errcode = '23505';
  end;

  if jsonb_array_length(assignment_changes) > 0 then
    result := public.update_job_assignments_service(
      actor_user_id, target_workspace_id, target.id, assignment_changes
    );
  end if;

  return result || jsonb_build_object('job', to_jsonb(target));
end;
$$;

revoke all on function public.read_new_job_assignments_service(uuid, uuid, text, uuid, text, integer, boolean)
  from public, anon, authenticated;
revoke all on function public.create_job_with_assignments_service(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.read_new_job_assignments_service(uuid, uuid, text, uuid, text, integer, boolean)
  to service_role;
grant execute on function public.create_job_with_assignments_service(uuid, uuid, jsonb, jsonb)
  to service_role;
