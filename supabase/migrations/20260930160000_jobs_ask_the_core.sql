-- FB-6.2 .6 (P1): Settings > Jobs and catalog deletion ask the authorization
-- core instead of the old person helpers, and stop writing the JWT subject.
-- Whoever may read a record (employee.list, M2) sees it in the Assign drawer
-- and in the job counts; whoever may save it (employee.save, rank below)
-- changes its jobs. A location goes with whoever may write locations: its
-- people's assignments end with it, the owner's own included (BL-187).

-- May they list anybody at all; who, is answered row by row (as list_employees_service).
create function app_private.authorize_employee_list(actor uuid, w uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  reason text := app_private.authz_check(app_private.actor(actor, w),
    (select r from app_private.authz_actions r where r.key = 'employee.list'), null, null, null);
begin
  if reason is not null and reason <> 'out_of_scope' then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || reason, detail = 'employee.list';
  end if;
end;
$$;
revoke all on function app_private.authorize_employee_list(uuid, uuid) from public, anon, authenticated;

-- The Assign drawer's rows, for one actor: whom they see, whom they may change.
drop function app_private.job_assignment_candidates(uuid, uuid);
create function app_private.job_assignment_candidates(actor uuid, target_workspace_id uuid, target_job_id uuid)
returns table(employee_id uuid, display_name text, employee_code text, location_name text, location_ids uuid[],
  display_status text, assigned boolean, is_primary boolean, revision integer, can_manage boolean, disabled_reason text)
language sql
stable
set search_path = ''
as $$
  with me as (select app_private.actor(actor, target_workspace_id) as state),
  read_rule as (select r from app_private.authz_actions r where r.key = 'employee.list'),
  save_rule as (select r from app_private.authz_actions r where r.key = 'employee.save'),
  reached as (
    select e.*, app_private.authz_check((select state from me), (select r from save_rule), null, e.id, null) is null as may_save
    from public.employee_profiles e
    where e.workspace_id = target_workspace_id and e.archived_at is null
      and app_private.authz_check((select state from me), (select r from read_rule), null, e.id, null) is null
  )
  select e.id, concat_ws(' ', coalesce(nullif(e.preferred_name, ''), e.first_name), e.last_name), e.employee_code,
    loc.name, coalesce(locs.ids, '{}'::uuid[]),
    case when m.status = 'active' then 'active'
      when oc.status in ('submitted', 'changes_requested') then 'needs_attention'
      when m.status = 'pending_activation' then 'onboarding'
      when invitation.status = 'pending' and invitation.expires_at > now() then 'invited'
      else 'not_invited' end,
    a.id is not null, coalesce(a.is_primary, false), e.revision,
    e.may_save,
    case when e.may_save then null else 'Your role cannot change this employee''s assignments.' end
  from reached e
  left join public.employee_job_assignments a on a.workspace_id = e.workspace_id
    and a.employee_id = e.id and a.job_id = target_job_id and a.ended_at is null
  left join public.employee_location_assignments pl on pl.employee_id = e.id and pl.ended_at is null and pl.is_primary
  left join public.locations loc on loc.id = pl.location_id
  left join lateral (select array_agg(la.location_id) ids from public.employee_location_assignments la
    where la.employee_id = e.id and la.ended_at is null) locs on true
  left join public.workspace_memberships m on m.workspace_id = e.workspace_id and m.user_id = e.user_id
  left join public.employee_onboarding_cases oc on oc.employee_id = e.id and oc.workspace_id = e.workspace_id
  left join lateral (select i.status, i.expires_at from public.employee_invitations i
    where i.employee_id = e.id order by i.created_at desc, i.id limit 1) invitation on true;
$$;
revoke all on function app_private.job_assignment_candidates(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.read_job_assignments_service(actor_user_id uuid, target_workspace_id uuid, target_job_id uuid,
  search_text text default ''::text, location_filter uuid default null::uuid, assignment_filter text default 'all'::text,
  page_number integer default 0, targets_only boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform app_private.authorize_employee_list(actor_user_id, target_workspace_id);
  if not exists(select 1 from public.jobs where id=target_job_id and workspace_id=target_workspace_id and deleted_at is null) then
    raise exception 'Job not found' using errcode='P0002'; end if;
  if assignment_filter not in ('all','assigned','unassigned') or page_number<0 then
    raise exception 'Valid filters required' using errcode='22023'; end if;
  with candidates as materialized (
    select * from app_private.job_assignment_candidates(actor_user_id,target_workspace_id,target_job_id)
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

create or replace function public.read_new_job_assignments_service(actor_user_id uuid, target_workspace_id uuid,
  search_text text default ''::text, location_filter uuid default null::uuid, assignment_filter text default 'all'::text,
  page_number integer default 0, targets_only boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform app_private.authorize_employee_list(actor_user_id, target_workspace_id);
  if assignment_filter not in ('all', 'assigned', 'unassigned') or page_number < 0 then
    raise exception 'Valid filters required' using errcode = '22023';
  end if;

  with candidates as materialized (
    select * from app_private.job_assignment_candidates(actor_user_id, target_workspace_id, null::uuid)
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

create or replace function public.organization_job_counts_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  read_rule app_private.authz_actions;
begin
  perform app_private.authorize_employee_list(actor_user_id, target_workspace_id);
  select * into read_rule from app_private.authz_actions r where r.key = 'employee.list';
  with memberships as materialized (
    select a.employee_id,a.job_id,j.department_id,j.archived_at
    from public.employee_job_assignments a
    join public.jobs j on j.id=a.job_id and j.workspace_id=a.workspace_id
    join public.employee_profiles e on e.id=a.employee_id and e.workspace_id=a.workspace_id
    where a.workspace_id=target_workspace_id and a.ended_at is null and e.archived_at is null
      and app_private.authz_check(me, read_rule, null, e.id, null) is null
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

create or replace function public.update_job_assignments_service(actor_user_id uuid, target_workspace_id uuid, target_job_id uuid, assignment_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare item jsonb; employee public.employee_profiles; target public.jobs; existing public.employee_job_assignments;
  actual boolean; desired boolean; changed integer:=0; unchanged integer:=0; replacement uuid;
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  save_rule app_private.authz_actions; reason text;
begin
  select * into save_rule from app_private.authz_actions r where r.key = 'employee.save';
  -- May they change anybody's jobs at all; whose, is asked person by person.
  reason := app_private.authz_check(me, save_rule, null, null, null);
  if reason is not null and reason <> 'out_of_scope' then
    raise exception 'Not allowed' using errcode='42501', hint='authz.' || reason, detail='employee.save'; end if;
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
  -- Ask, lock and validate the entire batch before applying any change.
  for item in select value from jsonb_array_elements(assignment_changes) order by value->>'employee_id' loop
    if jsonb_typeof(item->'employee_id') is distinct from 'string'
      or jsonb_typeof(item->'assigned') is distinct from 'boolean'
      or jsonb_typeof(item->'expected_revision') is distinct from 'number'
      or (item->>'expected_revision') !~ '^[1-9][0-9]*$' then
      raise exception 'Valid employee assignment required' using errcode='22023'; end if;
    -- Somebody unknown gets the answer somebody out of reach gets.
    reason := app_private.authz_check(me, save_rule, null, (item->>'employee_id')::uuid, null);
    if reason is not null then
      raise exception 'Not allowed' using errcode='42501', hint='authz.' || reason, detail='employee.save'; end if;
    select * into employee from public.employee_profiles e
    where e.id=(item->>'employee_id')::uuid and e.workspace_id=target_workspace_id for update;
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
        not app_private.is_management_job(target_job_id)
        and not exists(select 1 from public.employee_job_assignments a where a.employee_id=(item->>'employee_id')::uuid
          and a.ended_at is null and a.is_primary),actor_user_id);
    else
      update public.employee_job_assignments set ended_at=now() where id=existing.id;
      if existing.is_primary then
        select a.id into replacement from public.employee_job_assignments a join public.jobs j on j.id=a.job_id
        where a.employee_id=existing.employee_id and a.ended_at is null and not app_private.is_management_job(a.job_id)
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

create or replace function public.delete_job_with_assignments_service(actor_user_id uuid, target_workspace_id uuid, target_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target public.jobs; a public.employee_job_assignments; replacement uuid; removed integer:=0;
  me app_private.actor_state; save_rule app_private.authz_actions; reason text;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.jobs.write');
  select * into target from public.jobs where id=target_job_id and workspace_id=target_workspace_id for update;
  if not found then raise exception 'Job not found' using errcode='P0002'; end if;
  if target.deleted_at is not null then return jsonb_build_object('removed_count',0); end if;
  if target.system_key is not null then
    raise exception 'Management and Owner are kept; rename them instead' using errcode='23514', hint='catalog.system_record'; end if;
  -- Taking a job off somebody changes their record: everyone on it must be
  -- somebody the actor may save.
  me := app_private.actor(actor_user_id, target_workspace_id);
  select * into save_rule from app_private.authz_actions r where r.key = 'employee.save';
  select min(app_private.authz_check(me, save_rule, null, employee.id, null)) into reason
  from public.employee_profiles employee
  where employee.workspace_id=target_workspace_id and exists(select 1 from public.employee_job_assignments assignment
    where assignment.employee_id=employee.id and assignment.job_id=target_job_id and assignment.ended_at is null);
  if reason is not null then
    raise exception 'This job is assigned to an employee you cannot manage. Ask an authorized administrator to delete it.'
      using errcode='42501', hint='authz.' || reason, detail='employee.save'; end if;
  perform 1 from public.employee_profiles employee
  where employee.workspace_id=target_workspace_id and exists(select 1 from public.employee_job_assignments assignment
    where assignment.employee_id=employee.id and assignment.job_id=target_job_id and assignment.ended_at is null)
  order by employee.id for update;
  for a in select * from public.employee_job_assignments where workspace_id=target_workspace_id and job_id=target_job_id and ended_at is null order by employee_id loop
    update public.employee_job_assignments set ended_at=now() where id=a.id;
    if a.is_primary then
      select other.id into replacement from public.employee_job_assignments other join public.jobs j on j.id=other.job_id
        where other.employee_id=a.employee_id and other.ended_at is null and not app_private.is_management_job(other.job_id)
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

create or replace function public.delete_catalog_entity_service(actor_user_id uuid, target_workspace_id uuid, entity_kind text, target_entity_id uuid, department_jobs text default 'keep'::text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare tbl text; target record; assignment public.employee_location_assignments;
  job record; replacement uuid; affected integer:=0; rule_row app_private.authz_actions; reason text;
begin
  tbl:=case entity_kind when 'locations' then 'locations' when 'departments' then 'departments'
    when 'shift-types' then 'shift_types' when 'shift-labels' then 'shift_labels' end;
  if tbl is null or department_jobs not in ('keep','delete') or department_jobs is null then
    raise exception 'Valid catalog deletion required' using errcode='22023'; end if;
  -- Locations are the organization's (settings.locations.write); departments
  -- and the shift catalog belong to Settings > Jobs (settings.jobs.write), the
  -- shift catalog under its own permission.
  -- ponytail: the shift catalog borrows settings.jobs.write's rule with its own
  -- permission; a settings.shift_catalog.write action comes with FB-6.8.
  select * into rule_row from app_private.authz_actions r
  where r.key = case entity_kind when 'locations' then 'settings.locations.write' else 'settings.jobs.write' end;
  if entity_kind in ('shift-types','shift-labels') then rule_row.permission_key := 'settings.shift_catalog.manage'; end if;
  reason := app_private.authz_check(app_private.actor(actor_user_id, target_workspace_id), rule_row, null, null, null);
  if reason is not null then
    raise exception 'Not allowed' using errcode='42501', hint='authz.' || reason, detail=rule_row.key; end if;
  -- Shares creation's catalog lock; relation triggers serialize stale writes too.
  perform 1 from public.workspaces where id=target_workspace_id for update;
  execute format('select id,name,deleted_at from public.%I where id=$1 and workspace_id=$2 for update',tbl)
    into target using target_entity_id,target_workspace_id;
  if target.id is null then raise exception 'Catalog item not found' using errcode='P0002'; end if;
  if target.deleted_at is not null then return jsonb_build_object('removed_count',0); end if;
  if entity_kind='departments' and exists(select 1 from public.departments
    where id=target_entity_id and system_key is not null) then
    raise exception 'Management and Owner are kept; rename them instead' using errcode='23514', hint='catalog.system_record'; end if;
  if entity_kind='departments' then
    for job in select id from public.jobs where workspace_id=target_workspace_id and department_id=target_entity_id
      and deleted_at is null order by id for update loop
      if department_jobs='delete' then
        perform public.delete_job_with_assignments_service(actor_user_id,target_workspace_id,job.id);
      else
        update public.jobs set department_id=null,updated_at=now() where id=job.id;
      end if;
      affected:=affected+1;
    end loop;
  elsif entity_kind='locations' then
    -- Whoever may delete a location ends everyone's assignment there with it,
    -- their own included (BL-187).
    perform 1 from public.employee_profiles employee
    where employee.workspace_id=target_workspace_id and exists(select 1 from public.employee_location_assignments a
      where a.employee_id=employee.id and a.location_id=target_entity_id and a.ended_at is null)
    order by employee.id for update;
    -- Archived first: the owner is kept at every live location, and this one is
    -- going (BL-218).
    update public.locations set archived_at=coalesce(archived_at,now()) where id=target_entity_id;
    for assignment in select * from public.employee_location_assignments
      where workspace_id=target_workspace_id and location_id=target_entity_id and ended_at is null order by employee_id loop
      update public.employee_location_assignments set ended_at=now() where id=assignment.id;
      if assignment.is_primary then
        select a.id into replacement from public.employee_location_assignments a join public.locations l on l.id=a.location_id
          where a.employee_id=assignment.employee_id and a.ended_at is null
          order by (l.archived_at is not null),l.sort_order,lower(l.name),l.id limit 1;
        if replacement is not null then update public.employee_location_assignments set is_primary=true where id=replacement; end if;
      end if;
      update public.employee_profiles set revision=revision+1,updated_at=now() where id=assignment.employee_id;
      insert into public.employee_events(workspace_id,employee_id,actor_user_id,action,summary)
        values(target_workspace_id,assignment.employee_id,actor_user_id,'location.unassigned','Removed from deleted location '||target.name);
      affected:=affected+1;
    end loop;
  end if;
  execute format('update public.%I set deleted_at=now(),archived_at=coalesce(archived_at,now()),updated_at=now() where id=$1',tbl)
    using target_entity_id;
  return jsonb_build_object('removed_count',affected);
end; $$;
