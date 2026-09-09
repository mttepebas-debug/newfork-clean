create or replace function public.reset_employee_onboarding_service(
  target_user_id uuid,
  expected_revision integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_case public.employee_onboarding_cases%rowtype;
begin
  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  join public.employee_profiles employee on employee.id = onboarding.employee_id
  where employee.user_id = target_user_id
  for update of onboarding;

  if target_case.id is null then
    raise exception 'onboarding unavailable' using errcode = 'P0002';
  end if;
  if target_case.revision <> expected_revision then
    raise exception 'onboarding changed; refresh required' using errcode = '40001';
  end if;
  if target_case.status = 'approved'::public.employee_onboarding_case_status then
    raise exception 'approved onboarding cannot be reset' using errcode = '22023';
  end if;

  delete from public.employee_private_profiles
  where employee_id = target_case.employee_id;
  delete from public.employee_availability_versions
  where case_id = target_case.id;
  delete from public.employee_documents
  where requirement_id in (
    select id from public.employee_onboarding_requirements
    where case_id = target_case.id
  );
  delete from public.employee_acknowledgement_envelopes
  where case_id = target_case.id;

  update public.employee_onboarding_requirements set
    status = 'not_started'::public.employee_onboarding_requirement_status,
    rejection_reason = null,
    completed_at = null,
    reviewed_by = null,
    reviewed_at = null,
    requires_review = case
      when kind = 'profile'::public.employee_onboarding_requirement_kind then false
      else requires_review
    end,
    updated_at = now()
  where case_id = target_case.id
    and status <> 'superseded'::public.employee_onboarding_requirement_status;

  update public.employee_onboarding_cases set
    status = 'in_progress'::public.employee_onboarding_case_status,
    submitted_at = null,
    approved_at = null,
    approved_by = null,
    revision = revision + 1,
    updated_at = now()
  where id = target_case.id
  returning revision into expected_revision;

  insert into public.onboarding_events (
    workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id
  ) values (
    target_case.workspace_id, target_case.employee_id, target_case.id, target_user_id,
    'onboarding.reset', 'onboarding_case', target_case.id::text
  );

  return expected_revision;
end;
$$;

revoke all on function public.reset_employee_onboarding_service(uuid, integer) from public, anon, authenticated;
grant execute on function public.reset_employee_onboarding_service(uuid, integer) to service_role;
