create or replace function public.leave_employee_onboarding_service(
  target_user_id uuid,
  expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_case public.employee_onboarding_cases%rowtype;
  target_membership public.workspace_memberships%rowtype;
begin
  if target_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  join public.employee_profiles employee
    on employee.id = onboarding.employee_id
   and employee.workspace_id = onboarding.workspace_id
  where employee.user_id = target_user_id
  order by onboarding.updated_at desc
  limit 1
  for update of onboarding;

  if target_case.id is null then
    raise exception 'onboarding unavailable' using errcode = 'P0002';
  end if;
  if target_case.revision <> expected_revision then
    raise exception 'onboarding changed; refresh required' using errcode = '40001';
  end if;

  select membership.* into target_membership
  from public.workspace_memberships membership
  where membership.id = target_case.membership_id
    and membership.workspace_id = target_case.workspace_id
    and membership.user_id = target_user_id
  for update;

  if target_membership.id is null then
    raise exception 'workspace membership unavailable' using errcode = 'P0002';
  end if;
  if target_membership.status = 'active'::public.membership_status then
    raise exception 'active employees cannot leave onboarding' using errcode = '23514';
  end if;
  if target_membership.status <> 'pending_activation'::public.membership_status then
    raise exception 'pending onboarding membership required' using errcode = '23514';
  end if;
  if target_case.status = 'approved'::public.employee_onboarding_case_status then
    raise exception 'approved onboarding cannot be cancelled' using errcode = '22023';
  end if;

  perform set_config('app.workspace_closure', 'on', true);

  update public.workspace_memberships
  set status = 'suspended'::public.membership_status,
      updated_at = now()
  where id = target_membership.id
    and workspace_id = target_case.workspace_id;

  update public.employee_onboarding_cases
  set status = 'cancelled'::public.employee_onboarding_case_status,
      revision = revision + 1,
      updated_at = now()
  where id = target_case.id
  returning * into target_case;

  insert into public.onboarding_events (
    workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id
  ) values (
    target_case.workspace_id, target_case.employee_id, target_case.id, target_user_id,
    'onboarding.left', 'onboarding_case', target_case.id::text
  );

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_case.workspace_id, target_user_id, 'employee_onboarding.left',
    'workspace_membership', target_membership.id::text,
    jsonb_build_object('employee_id', target_case.employee_id, 'case_id', target_case.id)
  );

  return jsonb_build_object(
    'status', 'left',
    'workspace_id', target_case.workspace_id,
    'employee_id', target_case.employee_id,
    'membership_id', target_membership.id,
    'revision', target_case.revision
  );
end;
$$;

revoke all on function public.leave_employee_onboarding_service(uuid, integer)
from public, anon, authenticated;
grant execute on function public.leave_employee_onboarding_service(uuid, integer)
to service_role;
