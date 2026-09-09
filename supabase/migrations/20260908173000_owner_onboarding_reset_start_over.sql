create or replace function public.reset_owner_onboarding_service(
  actor_user_id uuid,
  target_workspace_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.workspace_role;
  onboarding_status public.onboarding_status;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  select membership.role
  into actor_role
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active';

  if actor_role <> 'owner' then
    raise exception 'owner access required' using errcode = '42501';
  end if;

  select onboarding.status
  into onboarding_status
  from public.workspace_onboarding onboarding
  where onboarding.workspace_id = target_workspace_id
  for update;

  if onboarding_status is null then
    raise exception 'workspace onboarding was not found' using errcode = 'P0002';
  end if;
  if onboarding_status = 'complete'::public.onboarding_status then
    raise exception 'completed owner onboarding cannot be reset' using errcode = '22023';
  end if;

  delete from public.employee_profiles
  where workspace_id = target_workspace_id
    and user_id is null;

  delete from public.jobs
  where workspace_id = target_workspace_id;

  delete from public.departments
  where workspace_id = target_workspace_id;

  delete from public.locations
  where workspace_id = target_workspace_id;

  update public.workspace_onboarding
  set status = 'incomplete'::public.onboarding_status,
      current_step = 1,
      completed_at = null,
      updated_by = actor_user_id,
      updated_at = now()
  where workspace_id = target_workspace_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id
  ) values (
    target_workspace_id,
    actor_user_id,
    'workspace.onboarding_reset',
    'workspace',
    target_workspace_id::text
  );
end;
$$;

revoke all on function public.reset_owner_onboarding_service(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.reset_owner_onboarding_service(uuid, uuid)
to service_role;
