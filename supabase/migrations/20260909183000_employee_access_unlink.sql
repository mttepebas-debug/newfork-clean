create function public.remove_employee_access_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee public.employee_profiles%rowtype;
  membership public.workspace_memberships%rowtype;
begin
  if not public.service_actor_has_permission(
    actor_user_id,
    target_workspace_id,
    'employee_access.manage'
  ) then
    raise exception 'employee access management required' using errcode = '42501';
  end if;

  select * into employee
  from public.employee_profiles
  where id = target_employee_id
    and workspace_id = target_workspace_id
    and archived_at is null
  for update;
  if employee.id is null then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;
  if employee.user_id is null then
    return;
  end if;
  if employee.user_id = actor_user_id then
    raise exception 'self access removal is not permitted' using errcode = '42501';
  end if;
  if not public.service_actor_can_access_employee(
    actor_user_id,
    target_workspace_id,
    target_employee_id
  ) then
    raise exception 'employee access denied' using errcode = '42501';
  end if;

  select * into membership
  from public.workspace_memberships
  where workspace_id = target_workspace_id
    and user_id = employee.user_id
  for update;
  if membership.id is null then
    raise exception 'linked workspace membership not found' using errcode = 'P0002';
  end if;
  if membership.role = 'owner'::public.workspace_role then
    raise exception 'owner access cannot be removed here' using errcode = '42501';
  end if;

  update public.workspace_memberships
  set status = 'suspended'::public.membership_status,
      updated_at = now()
  where id = membership.id;

  update public.employee_profiles
  set user_id = null,
      revision = revision + 1,
      updated_at = now()
  where id = employee.id;

  update public.employee_invitations
  set status = 'revoked'::public.employee_invitation_status,
      revoked_at = now(),
      updated_at = now()
  where employee_id = employee.id
    and status = 'pending'::public.employee_invitation_status;

  update public.employee_onboarding_cases
  set status = 'cancelled'::public.employee_onboarding_case_status,
      submitted_at = null,
      approved_at = null,
      approved_by = null,
      revision = revision + 1,
      updated_at = now()
  where employee_id = employee.id
    and status <> 'cancelled'::public.employee_onboarding_case_status;

  insert into public.employee_events (
    workspace_id,
    employee_id,
    actor_user_id,
    action,
    summary
  ) values (
    target_workspace_id,
    target_employee_id,
    actor_user_id,
    'employee.access_removed',
    'Workspace access removed and employee account unlinked'
  );
end;
$$;

revoke all on function public.remove_employee_access_service(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.remove_employee_access_service(uuid, uuid, uuid)
to service_role;

notify pgrst, 'reload schema';
