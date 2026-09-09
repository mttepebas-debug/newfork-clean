alter table public.employee_private_profiles
  alter column street_address drop not null,
  alter column city drop not null,
  alter column region drop not null,
  alter column postal_code drop not null,
  alter column country_code drop not null,
  alter column date_of_birth drop not null;

create or replace function public.save_employee_onboarding_profile_service(
  target_user_id uuid,
  profile_payload jsonb,
  expected_revision integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_case public.employee_onboarding_cases%rowtype;
  normalized_country_code text := nullif(upper(btrim(coalesce(profile_payload->>'country_code', ''))), '');
  normalized_birth_date text := nullif(btrim(coalesce(profile_payload->>'date_of_birth', '')), '');
begin
  select onboarding.* into target_case from public.employee_onboarding_cases onboarding
  join public.employee_profiles employee on employee.id = onboarding.employee_id
  where employee.user_id = target_user_id for update of onboarding;
  if target_case.id is null then raise exception 'onboarding unavailable' using errcode = 'P0002'; end if;
  if target_case.revision <> expected_revision then raise exception 'onboarding changed; refresh required' using errcode = '40001'; end if;
  if target_case.status in ('submitted', 'approved', 'cancelled') then raise exception 'onboarding cannot be edited' using errcode = '22023'; end if;
  if coalesce(profile_payload->>'legal_first_name', '') = ''
    or coalesce(profile_payload->>'legal_last_name', '') = ''
    or coalesce(profile_payload->>'phone', '') = ''
    or coalesce(profile_payload->>'emergency_contact_name', '') = ''
    or coalesce(profile_payload->>'emergency_contact_phone', '') = ''
    or (normalized_country_code is not null and normalized_country_code !~ '^[A-Z]{2}$')
    or (normalized_birth_date is not null and normalized_birth_date !~ '^\d{4}-\d{2}-\d{2}$') then
    raise exception 'complete private profile required' using errcode = '22023';
  end if;
  insert into public.employee_private_profiles (
    employee_id, workspace_id, legal_first_name, legal_last_name, preferred_name,
    phone, street_address, city, region, postal_code, country_code, date_of_birth,
    emergency_contact_name, emergency_contact_phone,
    share_phone_with_teammates, share_email_with_teammates
  ) values (
    target_case.employee_id, target_case.workspace_id,
    btrim(profile_payload->>'legal_first_name'), btrim(profile_payload->>'legal_last_name'),
    '', btrim(profile_payload->>'phone'),
    nullif(btrim(coalesce(profile_payload->>'street_address', '')), ''),
    nullif(btrim(coalesce(profile_payload->>'city', '')), ''),
    nullif(btrim(coalesce(profile_payload->>'region', '')), ''),
    nullif(btrim(coalesce(profile_payload->>'postal_code', '')), ''),
    normalized_country_code,
    normalized_birth_date::date,
    btrim(profile_payload->>'emergency_contact_name'), btrim(profile_payload->>'emergency_contact_phone'),
    coalesce((profile_payload->>'share_phone_with_teammates')::boolean, false),
    coalesce((profile_payload->>'share_email_with_teammates')::boolean, false)
  ) on conflict (employee_id) do update set
    legal_first_name = excluded.legal_first_name,
    legal_last_name = excluded.legal_last_name,
    preferred_name = '',
    phone = excluded.phone,
    street_address = excluded.street_address,
    city = excluded.city,
    region = excluded.region,
    postal_code = excluded.postal_code,
    country_code = excluded.country_code,
    date_of_birth = excluded.date_of_birth,
    emergency_contact_name = excluded.emergency_contact_name,
    emergency_contact_phone = excluded.emergency_contact_phone,
    share_phone_with_teammates = excluded.share_phone_with_teammates,
    share_email_with_teammates = excluded.share_email_with_teammates,
    updated_at = now();
  update public.employee_onboarding_requirements set status = 'completed', rejection_reason = null,
    completed_at = now(), updated_at = now()
  where case_id = target_case.id and kind = 'profile';
  update public.employee_onboarding_cases set status = 'in_progress', revision = revision + 1,
    updated_at = now() where id = target_case.id returning revision into expected_revision;
  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id)
  values (target_case.workspace_id, target_case.employee_id, target_case.id, target_user_id,
    'onboarding.profile_saved', 'onboarding_case', target_case.id::text);
  return expected_revision;
end;
$$;
