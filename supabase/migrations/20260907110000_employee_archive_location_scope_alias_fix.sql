create or replace function public.set_employee_archived(target_workspace_id uuid, target_employee_id uuid, should_archive boolean, restore_access boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  employee_user_id uuid;
  member public.workspace_memberships%rowtype;
  snapshot public.employee_access_snapshots%rowtype;
begin
  if actor_id is null or not public.workspace_has_permission(target_workspace_id, 'employees.archive') then
    raise exception 'employee archive access required' using errcode = '42501';
  end if;
  select user_id into employee_user_id from public.employee_profiles
  where id = target_employee_id and workspace_id = target_workspace_id and public.can_access_employee(target_workspace_id, id) for update;
  if not found then raise exception 'employee not found' using errcode = 'P0002'; end if;
  if employee_user_id = actor_id then raise exception 'self archive is not permitted' using errcode = '42501'; end if;
  select * into member from public.workspace_memberships where workspace_id = target_workspace_id and user_id = employee_user_id;

  if should_archive and member.id is not null and member.status in ('active', 'pending_activation') then
    if not public.workspace_has_permission(target_workspace_id, 'employee_access.manage') then
      raise exception 'linked employee archive requires access management' using errcode = '42501';
    end if;
    insert into public.employee_access_snapshots (workspace_id, employee_id, membership_id, role_id, all_locations, location_ids, captured_by)
    select target_workspace_id, target_employee_id, member.id, member.role_id, member.all_locations,
      coalesce(array_agg(scope.location_id) filter (where scope.location_id is not null), '{}'), actor_id
    from public.membership_location_scopes scope where scope.membership_id = member.id;
    update public.workspace_memberships set status = 'suspended', updated_at = now() where id = member.id;
  end if;

  update public.employee_profiles set archived_at = case when should_archive then now() else null end,
    archived_by = case when should_archive then actor_id else null end,
    revision = revision + 1, updated_at = now() where id = target_employee_id;

  if not should_archive and restore_access then
    if not public.workspace_has_permission(target_workspace_id, 'employee_access.manage') then
      raise exception 'access restoration permission required' using errcode = '42501';
    end if;
    select * into snapshot from public.employee_access_snapshots where employee_id = target_employee_id and restored_at is null order by captured_at desc limit 1 for update;
    if snapshot.id is null then raise exception 'restorable access snapshot not found' using errcode = 'P0002'; end if;
    if not exists (select 1 from public.workspace_roles where id = snapshot.role_id and workspace_id = target_workspace_id) then raise exception 'snapshotted role is no longer available' using errcode = '22023'; end if;
    update public.workspace_memberships set role_id = snapshot.role_id, all_locations = snapshot.all_locations, status = 'active', updated_at = now() where id = snapshot.membership_id;
    delete from public.membership_location_scopes where membership_id = snapshot.membership_id;
    insert into public.membership_location_scopes (membership_id, workspace_id, location_id)
    select snapshot.membership_id, target_workspace_id, restored_scope.location_id
    from unnest(snapshot.location_ids) as restored_scope(location_id)
    join public.locations location on location.id = restored_scope.location_id
      and location.workspace_id = target_workspace_id
      and location.archived_at is null;
    update public.employee_access_snapshots set restored_at = now() where id = snapshot.id;
  end if;
  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (target_workspace_id, target_employee_id, actor_id, case when should_archive then 'employee.archived' else 'employee.restored' end, case when should_archive then 'Employee archived and linked access suspended' else 'Employee record restored' end);
end;
$$;

revoke all on function public.set_employee_archived(uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.set_employee_archived(uuid, uuid, boolean, boolean) to authenticated;
