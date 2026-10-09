-- Remove catalog entries from future use while retaining historical foreign keys.
alter table public.locations add column deleted_at timestamptz;
alter table public.departments add column deleted_at timestamptz;
alter table public.shift_types add column deleted_at timestamptz;
alter table public.shift_labels add column deleted_at timestamptz;

create function app_private.guard_catalog_deletion_state()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and old.deleted_at is not null then
    raise exception 'This item was deleted. Reload the catalog.' using errcode='PT409';
  end if;
  if new.deleted_at is not null and current_user not in ('postgres','service_role') then
    raise exception 'Use the authorized catalog deletion command.' using errcode='42501';
  end if;
  if new.deleted_at is not null and new.archived_at is null then
    raise exception 'Deleted items must remain archived' using errcode='23514';
  end if;
  return new;
end; $$;
revoke all on function app_private.guard_catalog_deletion_state() from public,anon,authenticated,service_role;
do $$ declare t text; begin
  foreach t in array array['locations','departments','shift_types','shift_labels'] loop
    execute format('create trigger catalog_deletion_state_guard before insert or update on public.%I for each row execute function app_private.guard_catalog_deletion_state()',t);
  end loop;
end; $$;

create function app_private.guard_deleted_location_assignment()
returns trigger language plpgsql security definer set search_path='' as $$
declare removed timestamptz;
begin
  if new.ended_at is null then
    select deleted_at into removed from public.locations where id=new.location_id for key share;
    if removed is not null then raise exception 'This location was deleted. Reload locations.' using errcode='PT409'; end if;
  end if;
  return new;
end; $$;
revoke all on function app_private.guard_deleted_location_assignment() from public,anon,authenticated,service_role;
create trigger deleted_location_assignment_guard before insert or update on public.employee_location_assignments
for each row execute function app_private.guard_deleted_location_assignment();

create function app_private.guard_deleted_department_job()
returns trigger language plpgsql security definer set search_path='' as $$
declare removed timestamptz;
begin
  if new.department_id is not null then
    select deleted_at into removed from public.departments where id=new.department_id for key share;
    if removed is not null then raise exception 'This department was deleted. Reload departments.' using errcode='PT409'; end if;
  end if;
  return new;
end; $$;
revoke all on function app_private.guard_deleted_department_job() from public,anon,authenticated,service_role;
create trigger deleted_department_job_guard before insert or update of department_id on public.jobs
for each row execute function app_private.guard_deleted_department_job();

create function public.delete_catalog_entity_service(
  actor_user_id uuid, target_workspace_id uuid, entity_kind text, target_entity_id uuid,
  department_jobs text default 'keep'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare tbl text; target record; e public.employee_profiles; assignment public.employee_location_assignments;
  job record; replacement uuid; affected integer:=0;
begin
  if actor_user_id is null then raise exception 'Valid actor required' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub',actor_user_id::text,true);
  if not public.can_manage_workspace(target_workspace_id) then
    raise exception 'Workspace management access required' using errcode='42501'; end if;
  tbl:=case entity_kind when 'locations' then 'locations' when 'departments' then 'departments'
    when 'shift-types' then 'shift_types' when 'shift-labels' then 'shift_labels' end;
  if tbl is null or department_jobs not in ('keep','delete') or department_jobs is null then
    raise exception 'Valid catalog deletion required' using errcode='22023'; end if;
  -- Shares creation's catalog lock; relation triggers serialize stale writes too.
  perform 1 from public.workspaces where id=target_workspace_id for update;
  execute format('select id,name,deleted_at from public.%I where id=$1 and workspace_id=$2 for update',tbl)
    into target using target_entity_id,target_workspace_id;
  if target.id is null then raise exception 'Catalog item not found' using errcode='P0002'; end if;
  if target.deleted_at is not null then return jsonb_build_object('removed_count',0); end if;
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
    if not public.can_access_location(target_workspace_id,target_entity_id) then
      raise exception 'Location access required' using errcode='42501'; end if;
    for e in select employee.* from public.employee_profiles employee
      where employee.workspace_id=target_workspace_id and exists(select 1 from public.employee_location_assignments a
        where a.employee_id=employee.id and a.location_id=target_entity_id and a.ended_at is null)
      order by employee.id for update loop
      if not public.workspace_has_permission(target_workspace_id,'employees.manage')
        or not public.workspace_has_permission(target_workspace_id,'employees.read')
        or not public.can_access_employee(target_workspace_id,e.id)
        or not public.can_manage_employee_record(target_workspace_id,e.id) then
        raise exception 'This location has employees you cannot manage. Ask an authorized administrator to delete it.' using errcode='42501'; end if;
    end loop;
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
revoke all on function public.delete_catalog_entity_service(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.delete_catalog_entity_service(uuid,uuid,text,uuid,text) to service_role;
