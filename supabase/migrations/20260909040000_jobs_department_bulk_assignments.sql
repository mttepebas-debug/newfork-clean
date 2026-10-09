-- Narrow catalog/assignment commands. Only the trusted API may provide an actor.
alter table public.jobs add column if not exists deleted_at timestamptz;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.jobs'::regclass and conname='jobs_deleted_remain_archived') then
    alter table public.jobs add constraint jobs_deleted_remain_archived check(deleted_at is null or archived_at is not null);
  end if;
end; $$;
create or replace function app_private.guard_job_deletion_state()
returns trigger language plpgsql set search_path='' as $$
begin
  if current_user not in ('postgres','service_role') then
    if (tg_op='INSERT' and new.deleted_at is not null) or
      (tg_op='UPDATE' and (old.deleted_at is not null or new.deleted_at is distinct from old.deleted_at)) then
      raise exception 'Deleted jobs cannot be edited or restored. Use the authorized job deletion command.' using errcode='42501';
    end if;
  end if;
  return new;
end; $$;
revoke all on function app_private.guard_job_deletion_state() from public,anon,authenticated,service_role;
drop trigger if exists jobs_deletion_state_guard on public.jobs;
create trigger jobs_deletion_state_guard before insert or update on public.jobs
  for each row execute function app_private.guard_job_deletion_state();
create or replace function app_private.guard_assignment_deleted_job()
returns trigger language plpgsql security definer set search_path='' as $$
declare deleted timestamptz;
begin
  if new.ended_at is null then
    -- The lock serializes this check with deletion, including employee-save commands
    -- that validated the job before they waited for deletion to finish.
    select j.deleted_at into deleted from public.jobs j where j.id=new.job_id for key share;
    if deleted is not null then raise exception 'This job was deleted. Reload jobs before assigning it.' using errcode='PT409'; end if;
  end if;
  return new;
end; $$;
revoke all on function app_private.guard_assignment_deleted_job() from public,anon,authenticated,service_role;
drop trigger if exists employee_assignment_deleted_job_guard on public.employee_job_assignments;
create trigger employee_assignment_deleted_job_guard before insert or update on public.employee_job_assignments
  for each row execute function app_private.guard_assignment_deleted_job();
create index if not exists employee_job_current_job_idx
  on public.employee_job_assignments(workspace_id, job_id, employee_id)
  where ended_at is null;

create or replace function public.create_department_with_jobs_service(
  actor_user_id uuid, target_workspace_id uuid, department_input jsonb, jobs_input jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare dep public.departments; item jsonb; result_jobs jsonb; next_order integer;
begin
  if actor_user_id is null then raise exception 'valid actor required' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  if not public.can_manage_workspace(target_workspace_id) then
    raise exception 'workspace management access required' using errcode='42501';
  end if;
  if jsonb_typeof(department_input) is distinct from 'object'
    or jsonb_typeof(department_input->'name') is distinct from 'string'
    or jsonb_typeof(department_input->'color') is distinct from 'string'
    or jsonb_typeof(jobs_input) is distinct from 'array' then
    raise exception 'Valid department and jobs required' using errcode='22023';
  end if;
  if jsonb_array_length(jobs_input)>500 then raise exception 'Too many jobs' using errcode='22023'; end if;
  -- Serialize organization creation order without modifying existing definitions.
  perform 1 from public.workspaces where id=target_workspace_id for update;
  insert into public.departments(workspace_id,name,color,sort_order)
  values(target_workspace_id,btrim(department_input->>'name'),department_input->>'color',
    (select coalesce(max(sort_order),-1)+1 from public.departments where workspace_id=target_workspace_id))
  returning * into dep;
  select coalesce(max(sort_order),-1)+1 into next_order from public.jobs where workspace_id=target_workspace_id;
  for item in select value from jsonb_array_elements(jobs_input) loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'name') is distinct from 'string'
      or jsonb_typeof(item->'color') is distinct from 'string' then
      raise exception 'Valid job name and color required' using errcode='22023';
    end if;
    insert into public.jobs(workspace_id,department_id,name,color,sort_order)
    values(target_workspace_id,dep.id,btrim(item->>'name'),item->>'color',next_order);
    next_order:=next_order+1;
  end loop;
  select coalesce(jsonb_agg(to_jsonb(j) order by sort_order,id),'[]') into result_jobs
  from public.jobs j where j.workspace_id=target_workspace_id and j.department_id=dep.id;
  return jsonb_build_object('department',to_jsonb(dep),'jobs',result_jobs);
exception when unique_violation then
  raise exception 'A department or job with that name already exists. Names must be unique in this organization.' using errcode='23505';
end; $$;

-- This private helper is shared by paging, totals and explicit bulk-target snapshots.
create or replace function public.create_department_jobs_service(
  actor_user_id uuid, target_workspace_id uuid, target_department_id uuid, jobs_input jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare dep public.departments; item jsonb; job public.jobs; result jsonb:='[]'; next_order integer;
begin
  if actor_user_id is null then raise exception 'valid actor required' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub',actor_user_id::text,true);
  if not public.can_manage_workspace(target_workspace_id) then
    raise exception 'workspace management access required' using errcode='42501'; end if;
  if jsonb_typeof(jobs_input) is distinct from 'array' then
    raise exception 'Jobs must be an array' using errcode='22023'; end if;
  if jsonb_array_length(jobs_input) not between 1 and 500 then
    raise exception 'Provide between 1 and 500 jobs' using errcode='22023'; end if;
  perform 1 from public.workspaces where id=target_workspace_id for update;
  select * into dep from public.departments where id=target_department_id and workspace_id=target_workspace_id for update;
  if not found then raise exception 'Department not found' using errcode='P0002'; end if;
  if dep.archived_at is not null then raise exception 'Restore the department before adding jobs' using errcode='22023'; end if;
  select coalesce(max(sort_order),-1)+1 into next_order from public.jobs where workspace_id=target_workspace_id;
  for item in select value from jsonb_array_elements(jobs_input) loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'name') is distinct from 'string'
      or jsonb_typeof(item->'color') is distinct from 'string' then
      raise exception 'Valid job name and color required' using errcode='22023'; end if;
    insert into public.jobs(workspace_id,department_id,name,color,sort_order)
      values(target_workspace_id,dep.id,btrim(item->>'name'),item->>'color',next_order) returning * into job;
    result:=result||jsonb_build_array(to_jsonb(job)); next_order:=next_order+1;
  end loop;
  return result;
exception when unique_violation then
  raise exception 'A job with that name already exists. Names must be unique in this organization.' using errcode='23505';
end; $$;
revoke all on function public.create_department_jobs_service(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_department_jobs_service(uuid,uuid,uuid,jsonb) to service_role;

-- Shared visibility for paging, totals and explicit bulk-target snapshots.
create or replace function public.update_department_with_jobs_service(
  actor_user_id uuid,target_workspace_id uuid,target_department_id uuid,department_input jsonb,jobs_input jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare dep public.departments; added jsonb:='[]';
begin
  if actor_user_id is null then raise exception 'valid actor required' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub',actor_user_id::text,true);
  if not public.can_manage_workspace(target_workspace_id) then raise exception 'workspace management access required' using errcode='42501'; end if;
  if jsonb_typeof(department_input->'name') is distinct from 'string' or jsonb_typeof(department_input->'color') is distinct from 'string'
    or jsonb_typeof(jobs_input) is distinct from 'array' then raise exception 'Valid department and jobs required' using errcode='22023'; end if;
  perform 1 from public.workspaces where id=target_workspace_id for update;
  update public.departments set name=btrim(department_input->>'name'),color=department_input->>'color',updated_at=now()
    where id=target_department_id and workspace_id=target_workspace_id returning * into dep;
  if not found then raise exception 'Department not found' using errcode='P0002'; end if;
  if jsonb_array_length(jobs_input)>0 then
    added:=public.create_department_jobs_service(actor_user_id,target_workspace_id,target_department_id,jobs_input);
  end if;
  return jsonb_build_object('department',to_jsonb(dep),'jobs',added);
exception when unique_violation then raise exception 'A department or job with that name already exists.' using errcode='23505';
end; $$;
revoke all on function public.update_department_with_jobs_service(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.update_department_with_jobs_service(uuid,uuid,uuid,jsonb,jsonb) to service_role;

-- Shared visibility for paging, totals and explicit bulk-target snapshots.
create or replace function app_private.job_assignment_candidates(target_workspace_id uuid,target_job_id uuid)
returns table(employee_id uuid,display_name text,employee_code text,location_name text,
  location_ids uuid[],display_status text,assigned boolean,is_primary boolean,revision integer,
  can_manage boolean,disabled_reason text)
language sql stable set search_path='' as $$
  select e.id,concat_ws(' ',coalesce(nullif(e.preferred_name,''),e.first_name),e.last_name),e.employee_code,
    loc.name, coalesce(locs.ids,'{}'::uuid[]),
    case when m.status='active' then 'active'
      when oc.status in ('submitted','changes_requested') then 'needs_attention'
      when m.status='pending_activation' then 'onboarding'
      when invitation.status='pending' and invitation.expires_at>now() then 'invited'
      else 'not_invited' end,
    a.id is not null,coalesce(a.is_primary,false),e.revision,
    public.workspace_has_permission(target_workspace_id,'employees.manage')
      and public.can_manage_employee_record(target_workspace_id,e.id),
    case when public.workspace_has_permission(target_workspace_id,'employees.manage')
      and public.can_manage_employee_record(target_workspace_id,e.id) then null
      else 'Your role cannot change this employee''s assignments.' end
  from public.employee_profiles e
  left join public.employee_job_assignments a on a.workspace_id=e.workspace_id
    and a.employee_id=e.id and a.job_id=target_job_id and a.ended_at is null
  left join public.employee_location_assignments pl on pl.employee_id=e.id and pl.ended_at is null and pl.is_primary
  left join public.locations loc on loc.id=pl.location_id
  left join lateral (select array_agg(la.location_id) ids from public.employee_location_assignments la
    where la.employee_id=e.id and la.ended_at is null) locs on true
  left join public.workspace_memberships m on m.workspace_id=e.workspace_id and m.user_id=e.user_id
  left join public.employee_onboarding_cases oc on oc.employee_id=e.id and oc.workspace_id=e.workspace_id
  left join lateral (select i.status,i.expires_at from public.employee_invitations i
    where i.employee_id=e.id order by i.created_at desc,i.id limit 1) invitation on true
  where e.workspace_id=target_workspace_id and e.archived_at is null
    and public.workspace_has_permission(target_workspace_id,'employees.read')
    and public.can_access_employee(target_workspace_id,e.id);
$$;

create or replace function public.read_job_assignments_service(
  actor_user_id uuid,target_workspace_id uuid,target_job_id uuid,
  search_text text default '',location_filter uuid default null,assignment_filter text default 'all',
  page_number integer default 0,targets_only boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if actor_user_id is null then raise exception 'valid actor required' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub',actor_user_id::text,true);
  if not public.workspace_has_permission(target_workspace_id,'employees.read') then
    raise exception 'employee read access required' using errcode='42501'; end if;
  if not exists(select 1 from public.jobs where id=target_job_id and workspace_id=target_workspace_id and deleted_at is null) then
    raise exception 'Job not found' using errcode='P0002'; end if;
  if assignment_filter not in ('all','assigned','unassigned') or page_number<0 then
    raise exception 'Valid filters required' using errcode='22023'; end if;
  with candidates as materialized (
    select * from app_private.job_assignment_candidates(target_workspace_id,target_job_id)
  ), filtered as materialized (
    select * from candidates c
    where (coalesce(btrim(search_text),'')='' or strpos(lower(c.display_name||' '||c.employee_code),lower(btrim(search_text)))>0)
      and (location_filter is null or location_filter=any(c.location_ids))
      and (assignment_filter='all' or c.assigned=(assignment_filter='assigned'))
  ), paged as (
    select * from filtered where not targets_only or can_manage
    order by lower(display_name),employee_id
    limit case when targets_only then null else 50 end
    offset case when targets_only then 0 else page_number*50 end
  )
  select case when targets_only then
    coalesce((select jsonb_agg(jsonb_build_object('employee_id',employee_id,'assigned',assigned,'revision',revision)
      order by lower(display_name),employee_id) from paged),'[]'::jsonb)
  else jsonb_build_object(
    'employees',coalesce((select jsonb_agg(to_jsonb(p)-'location_ids' order by lower(display_name),employee_id) from paged p),'[]'::jsonb),
    'total',(select count(*) from filtered),
    'manageable_total',(select count(*) from filtered where can_manage),
    'assigned_count',(select count(*) from candidates where assigned),
    'locations',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by lower(l.name),l.id)
      from public.locations l where l.workspace_id=target_workspace_id and l.archived_at is null
      and exists(select 1 from candidates c where l.id=any(c.location_ids))),'[]'::jsonb)
  ) end into result;
  return result;
end; $$;

create or replace function public.organization_job_counts_service(actor_user_id uuid,target_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if actor_user_id is null then raise exception 'valid actor required' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub',actor_user_id::text,true);
  if not public.workspace_has_permission(target_workspace_id,'employees.read') then
    raise exception 'employee read access required' using errcode='42501'; end if;
  with memberships as materialized (
    select a.employee_id,a.job_id,j.department_id,j.archived_at
    from public.employee_job_assignments a
    join public.jobs j on j.id=a.job_id and j.workspace_id=a.workspace_id
    join public.employee_profiles e on e.id=a.employee_id and e.workspace_id=a.workspace_id
    where a.workspace_id=target_workspace_id and a.ended_at is null and e.archived_at is null
      and public.can_access_employee(target_workspace_id,e.id)
  )
  select jsonb_build_object(
    'jobs',coalesce((select jsonb_agg(to_jsonb(c)) from (
      select job_id as id,count(distinct employee_id) as employee_count from memberships group by job_id)c),'[]'),
    'departments',coalesce((select jsonb_agg(to_jsonb(c)) from (
      select department_id as id,count(distinct employee_id) as employee_count from memberships
      where department_id is not null group by department_id)c),'[]')
  ) into result;
  return result;
end; $$;

create or replace function public.update_job_assignments_service(
  actor_user_id uuid,target_workspace_id uuid,target_job_id uuid,assignment_changes jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; employee public.employee_profiles; target public.jobs; existing public.employee_job_assignments;
  actual boolean; desired boolean; changed integer:=0; unchanged integer:=0; replacement uuid;
begin
  if actor_user_id is null then raise exception 'valid actor required' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub',actor_user_id::text,true);
  if not public.workspace_has_permission(target_workspace_id,'employees.manage')
    or not public.workspace_has_permission(target_workspace_id,'employees.read') then
    raise exception 'employee management access required' using errcode='42501'; end if;
  select * into target from public.jobs where id=target_job_id and workspace_id=target_workspace_id for update;
  if target.id is null then raise exception 'Job not found' using errcode='P0002'; end if;
  if target.deleted_at is not null then raise exception 'This job was deleted and is no longer available' using errcode='P0002'; end if;
  if target.archived_at is not null then raise exception 'Restore this job before changing assignments' using errcode='22023'; end if;
  if jsonb_typeof(assignment_changes) is distinct from 'array' then
    raise exception 'Valid assignment changes required' using errcode='22023'; end if;
  if jsonb_array_length(assignment_changes) not between 1 and 10000 then
    raise exception 'Choose between 1 and 10000 employees' using errcode='22023'; end if;
  if (select count(*)<>count(distinct value->>'employee_id') from jsonb_array_elements(assignment_changes)) then
    raise exception 'An employee may only appear once in a batch' using errcode='22023'; end if;
  -- Lock and validate the entire batch before applying any change.
  for item in select value from jsonb_array_elements(assignment_changes) order by value->>'employee_id' loop
    if jsonb_typeof(item->'employee_id') is distinct from 'string'
      or jsonb_typeof(item->'assigned') is distinct from 'boolean'
      or jsonb_typeof(item->'expected_revision') is distinct from 'number'
      or (item->>'expected_revision') !~ '^[1-9][0-9]*$' then
      raise exception 'Valid employee assignment required' using errcode='22023'; end if;
    select * into employee from public.employee_profiles e
    where e.id=(item->>'employee_id')::uuid and e.workspace_id=target_workspace_id for update;
    if employee.id is null or not public.can_access_employee(target_workspace_id,employee.id)
      or not public.can_manage_employee_record(target_workspace_id,employee.id) then
      raise exception 'Employee management access denied' using errcode='42501'; end if;
    if employee.archived_at is not null then raise exception 'An employee was archived. Reload the employee list.' using errcode='PT409'; end if;
    select exists(select 1 from public.employee_job_assignments a where a.employee_id=employee.id
      and a.job_id=target_job_id and a.ended_at is null) into actual;
    if actual<>(item->>'assigned')::boolean and employee.revision<>(item->>'expected_revision')::integer then
      raise exception 'Employee % changed. Reload employees and review your pending changes.',employee.employee_code using errcode='PT409';
    end if;
  end loop;
  for item in select value from jsonb_array_elements(assignment_changes) order by value->>'employee_id' loop
    select * into existing from public.employee_job_assignments a where a.employee_id=(item->>'employee_id')::uuid
      and a.job_id=target_job_id and a.ended_at is null;
    desired:=(item->>'assigned')::boolean;
    if (existing.id is not null)=desired then unchanged:=unchanged+1; continue; end if;
    if desired then
      insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
      values(target_workspace_id,(item->>'employee_id')::uuid,target_job_id,
        not exists(select 1 from public.employee_job_assignments a where a.employee_id=(item->>'employee_id')::uuid
          and a.ended_at is null and a.is_primary),actor_user_id);
    else
      update public.employee_job_assignments set ended_at=now() where id=existing.id;
      if existing.is_primary then
        select a.id into replacement from public.employee_job_assignments a join public.jobs j on j.id=a.job_id
        where a.employee_id=existing.employee_id and a.ended_at is null
        order by (j.archived_at is not null),j.sort_order,lower(j.name),j.id limit 1;
        if replacement is not null then update public.employee_job_assignments set is_primary=true where id=replacement; end if;
      end if;
    end if;
    update public.employee_profiles set revision=revision+1,updated_at=now()
    where id=(item->>'employee_id')::uuid and workspace_id=target_workspace_id;
    insert into public.employee_events(workspace_id,employee_id,actor_user_id,action,summary)
    values(target_workspace_id,(item->>'employee_id')::uuid,actor_user_id,
      case when desired then 'job.assigned' else 'job.unassigned' end,
      case when desired then 'Assigned to ' else 'Removed from ' end||target.name);
    changed:=changed+1;
  end loop;
  return jsonb_build_object('changed_count',changed,'unchanged_count',unchanged);
end; $$;

revoke all on function app_private.job_assignment_candidates(uuid,uuid) from public,anon,authenticated,service_role;
-- Logical deletion preserves historical shifts and assignment intervals, while removing
-- the job from the editable catalog and every current employee assignment atomically.
create or replace function public.delete_job_with_assignments_service(
  actor_user_id uuid,target_workspace_id uuid,target_job_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.jobs; e public.employee_profiles; a public.employee_job_assignments; replacement uuid; removed integer:=0;
begin
  if actor_user_id is null then raise exception 'valid actor required' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub',actor_user_id::text,true);
  if not public.can_manage_workspace(target_workspace_id) or not public.workspace_has_permission(target_workspace_id,'employees.manage')
    or not public.workspace_has_permission(target_workspace_id,'employees.read') then raise exception 'Job and employee management access required' using errcode='42501'; end if;
  select * into target from public.jobs where id=target_job_id and workspace_id=target_workspace_id for update;
  if not found then raise exception 'Job not found' using errcode='P0002'; end if;
  if target.deleted_at is not null then return jsonb_build_object('removed_count',0); end if;
  for e in select employee.* from public.employee_profiles employee
    where employee.workspace_id=target_workspace_id and exists(select 1 from public.employee_job_assignments assignment
      where assignment.employee_id=employee.id and assignment.job_id=target_job_id and assignment.ended_at is null)
    order by employee.id for update loop
    if not public.can_access_employee(target_workspace_id,e.id) or not public.can_manage_employee_record(target_workspace_id,e.id) then
      raise exception 'This job is assigned to an employee you cannot manage. Ask an authorized administrator to delete it.' using errcode='42501'; end if;
  end loop;
  for a in select * from public.employee_job_assignments where workspace_id=target_workspace_id and job_id=target_job_id and ended_at is null order by employee_id loop
    update public.employee_job_assignments set ended_at=now() where id=a.id;
    if a.is_primary then
      select other.id into replacement from public.employee_job_assignments other join public.jobs j on j.id=other.job_id
        where other.employee_id=a.employee_id and other.ended_at is null
        order by (j.archived_at is not null),j.sort_order,lower(j.name),j.id limit 1;
      if replacement is not null then update public.employee_job_assignments set is_primary=true where id=replacement; end if;
    end if;
    update public.employee_profiles set revision=revision+1,updated_at=now() where id=a.employee_id;
    insert into public.employee_events(workspace_id,employee_id,actor_user_id,action,summary)
      values(target_workspace_id,a.employee_id,actor_user_id,'job.unassigned','Removed from deleted job '||target.name);
    removed:=removed+1;
  end loop;
  update public.jobs set deleted_at=now(),archived_at=coalesce(archived_at,now()),updated_at=now() where id=target_job_id;
  return jsonb_build_object('removed_count',removed);
end; $$;
revoke all on function public.delete_job_with_assignments_service(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_job_with_assignments_service(uuid,uuid,uuid) to service_role;

revoke all on function public.create_department_with_jobs_service(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.read_job_assignments_service(uuid,uuid,uuid,text,uuid,text,integer,boolean) from public,anon,authenticated;
revoke all on function public.organization_job_counts_service(uuid,uuid) from public,anon,authenticated;
revoke all on function public.update_job_assignments_service(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_department_with_jobs_service(uuid,uuid,jsonb,jsonb) to service_role;
grant execute on function public.read_job_assignments_service(uuid,uuid,uuid,text,uuid,text,integer,boolean) to service_role;
grant execute on function public.organization_job_counts_service(uuid,uuid) to service_role;
grant execute on function public.update_job_assignments_service(uuid,uuid,uuid,jsonb) to service_role;
