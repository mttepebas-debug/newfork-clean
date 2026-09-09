create or replace function public.update_employee_membership_role_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  target_role_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_membership public.workspace_memberships%rowtype;
  actor_role public.workspace_roles%rowtype;
  target_employee public.employee_profiles%rowtype;
  target_membership public.workspace_memberships%rowtype;
  existing_role public.workspace_roles%rowtype;
  next_role public.workspace_roles%rowtype;
begin
  if actor_user_id is null then
    raise exception 'employee access management required' using errcode = '42501';
  end if;
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_access.manage') then
    raise exception 'employee access management required' using errcode = '42501';
  end if;

  select membership.* into actor_membership
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active';
  if actor_membership.id is null then
    raise exception 'employee access management required' using errcode = '42501';
  end if;

  select role.* into actor_role
  from public.workspace_roles role
  where role.id = actor_membership.role_id
    and role.workspace_id = target_workspace_id;
  if actor_role.access_class not in ('owner', 'admin') then
    raise exception 'employee access management required' using errcode = '42501';
  end if;

  select employee.* into target_employee
  from public.employee_profiles employee
  where employee.id = target_employee_id
    and employee.workspace_id = target_workspace_id
    and employee.archived_at is null
  for update;
  if target_employee.id is null then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;
  if target_employee.user_id is null then
    raise exception 'employee has no linked workspace account' using errcode = '22023';
  end if;

  select membership.* into target_membership
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = target_employee.user_id
    and membership.status = 'active'
  for update;
  if target_membership.id is null then
    raise exception 'active workspace membership not found' using errcode = 'P0002';
  end if;

  select role.* into existing_role
  from public.workspace_roles role
  where role.id = target_membership.role_id
    and role.workspace_id = target_workspace_id;
  if existing_role.access_class = 'owner' then
    raise exception 'ownership transfer is required to change owner access' using errcode = '42501';
  end if;

  select role.* into next_role
  from public.workspace_roles role
  where role.id = target_role_id
    and role.workspace_id = target_workspace_id;
  if next_role.id is null then
    raise exception 'target role not found' using errcode = 'P0002';
  end if;
  if next_role.access_class = 'owner' then
    raise exception 'owner role cannot be assigned by role change' using errcode = '42501';
  end if;
  if actor_role.access_class = 'admin' and next_role.access_class = 'admin' then
    raise exception 'admin role assignment requires owner access' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  update public.workspace_memberships
  set role_id = next_role.id,
      all_locations = case
        when next_role.access_class in ('owner', 'admin', 'employee') then true
        else all_locations
      end,
      updated_at = now()
  where id = target_membership.id
    and workspace_id = target_workspace_id;

  update public.employee_profiles
  set revision = revision + 1,
      updated_at = now()
  where id = target_employee.id
    and workspace_id = target_workspace_id;

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (
    target_workspace_id,
    target_employee.id,
    actor_user_id,
    'employee.role_changed',
    'Workspace access role changed'
  );

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id,
    actor_user_id,
    'membership.role_changed',
    'workspace_membership',
    target_membership.id::text,
    jsonb_build_object(
      'employee_id', target_employee.id,
      'from_role_id', existing_role.id,
      'from_access_class', existing_role.access_class,
      'to_role_id', next_role.id,
      'to_access_class', next_role.access_class
    )
  );

  return jsonb_build_object(
    'membership_id', target_membership.id,
    'role_id', next_role.id,
    'role_name', next_role.name,
    'access_class', next_role.access_class
  );
end;
$$;

revoke all on function public.update_employee_membership_role_service(uuid, uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.update_employee_membership_role_service(uuid, uuid, uuid, uuid)
to service_role;
