alter table public.employee_private_profiles
  add column if not exists avatar_object_path text;

alter table public.employee_private_profiles
  drop constraint if exists employee_private_profiles_avatar_path_check,
  add constraint employee_private_profiles_avatar_path_check check (
    avatar_object_path is null
    or avatar_object_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  );

comment on column public.employee_private_profiles.avatar_object_path is
  'Workspace-scoped avatar path inside the private employee-profile-photos bucket: workspace_id/employee_id/object_uuid.ext.';

create function public.get_employee_avatar_path_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  avatar_path text;
begin
  if not app_private.workspace_allows_interactive_access(target_workspace_id)
    or not public.service_actor_has_permission(
      actor_user_id,
      target_workspace_id,
      'employees.read'
    )
    or not public.service_actor_can_access_employee(
      actor_user_id,
      target_workspace_id,
      target_employee_id
    ) then
    raise exception 'employee avatar unavailable' using errcode = 'P0002';
  end if;

  select private_profile.avatar_object_path into avatar_path
  from public.employee_private_profiles private_profile
  where private_profile.workspace_id = target_workspace_id
    and private_profile.employee_id = target_employee_id;

  return avatar_path;
end;
$$;

create function public.remove_employee_avatar_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  avatar_path text;
begin
  if not public.service_actor_has_permission(
    actor_user_id,
    target_workspace_id,
    'employee_access.manage'
  ) then
    raise exception 'employee access management required' using errcode = '42501';
  end if;
  if not public.service_actor_can_access_employee(
    actor_user_id,
    target_workspace_id,
    target_employee_id
  ) then
    raise exception 'employee avatar unavailable' using errcode = 'P0002';
  end if;

  select private_profile.avatar_object_path into avatar_path
  from public.employee_private_profiles private_profile
  where private_profile.workspace_id = target_workspace_id
    and private_profile.employee_id = target_employee_id
  for update;

  if avatar_path is null then
    return null;
  end if;

  update public.employee_private_profiles
  set avatar_object_path = null,
      updated_at = now()
  where workspace_id = target_workspace_id
    and employee_id = target_employee_id;

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
    'employee.avatar_removed',
    'Workspace profile photo removed'
  );

  return avatar_path;
end;
$$;

revoke all on function public.get_employee_avatar_path_service(uuid, uuid, uuid)
from public, anon, authenticated;
revoke all on function public.remove_employee_avatar_service(uuid, uuid, uuid)
from public, anon, authenticated;

grant execute on function public.get_employee_avatar_path_service(uuid, uuid, uuid)
to service_role;
grant execute on function public.remove_employee_avatar_service(uuid, uuid, uuid)
to service_role;

notify pgrst, 'reload schema';
