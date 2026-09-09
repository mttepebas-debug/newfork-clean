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
  employee public.employee_profiles%rowtype;
  normalized_country_code text := nullif(upper(btrim(coalesce(profile_payload->>'country_code', ''))), '');
  normalized_birth_date text := nullif(btrim(coalesce(profile_payload->>'date_of_birth', '')), '');
  submitted_phone text := nullif(btrim(coalesce(profile_payload->>'phone', '')), '');
  account_phone text;
  confirmed_phone text;
  legal_name_changed boolean;
  next_requirement_status public.employee_onboarding_requirement_status;
begin
  select phone into account_phone
  from public.user_profiles
  where user_id = target_user_id;
  confirmed_phone := coalesce(nullif(btrim(coalesce(account_phone, '')), ''), submitted_phone);

  select onboarding.* into target_case from public.employee_onboarding_cases onboarding
  join public.employee_profiles candidate on candidate.id = onboarding.employee_id
  where candidate.user_id = target_user_id for update of onboarding;
  if target_case.id is null then raise exception 'onboarding unavailable' using errcode = 'P0002'; end if;
  if target_case.revision <> expected_revision then raise exception 'onboarding changed; refresh required' using errcode = '40001'; end if;
  if target_case.status in ('submitted', 'approved', 'cancelled') then raise exception 'onboarding cannot be edited' using errcode = '22023'; end if;

  select * into employee
  from public.employee_profiles
  where id = target_case.employee_id
  for update;

  if coalesce(profile_payload->>'legal_first_name', '') = ''
    or coalesce(profile_payload->>'legal_last_name', '') = ''
    or confirmed_phone is null
    or coalesce(profile_payload->>'emergency_contact_name', '') = ''
    or coalesce(profile_payload->>'emergency_contact_phone', '') = ''
    or (normalized_country_code is not null and normalized_country_code !~ '^[A-Z]{2}$')
    or (normalized_birth_date is not null and normalized_birth_date !~ '^\d{4}-\d{2}-\d{2}$') then
    raise exception 'complete private profile required' using errcode = '22023';
  end if;

  legal_name_changed :=
    lower(btrim(profile_payload->>'legal_first_name')) is distinct from lower(btrim(employee.first_name))
    or lower(btrim(profile_payload->>'legal_last_name')) is distinct from lower(btrim(employee.last_name));
  next_requirement_status := case
    when legal_name_changed then 'awaiting_review'::public.employee_onboarding_requirement_status
    else 'completed'::public.employee_onboarding_requirement_status
  end;

  insert into public.user_profiles (user_id, display_name, phone)
  select
    target_user_id,
    coalesce(
      nullif(btrim(user_record.raw_user_meta_data->>'display_name'), ''),
      nullif(btrim(split_part(user_record.email, '@', 1)), ''),
      'Account owner'
    ),
    confirmed_phone
  from auth.users user_record
  where user_record.id = target_user_id
  on conflict (user_id) do update set
    phone = coalesce(public.user_profiles.phone, excluded.phone),
    updated_at = case
      when public.user_profiles.phone is null then now()
      else public.user_profiles.updated_at
    end;

  insert into public.employee_private_profiles (
    employee_id, workspace_id, legal_first_name, legal_last_name, preferred_name,
    phone, street_address, city, region, postal_code, country_code, date_of_birth,
    emergency_contact_name, emergency_contact_phone,
    share_phone_with_teammates, share_email_with_teammates
  ) values (
    target_case.employee_id, target_case.workspace_id,
    btrim(profile_payload->>'legal_first_name'), btrim(profile_payload->>'legal_last_name'),
    '', confirmed_phone,
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

  update public.employee_onboarding_requirements set
    status = next_requirement_status,
    requires_review = legal_name_changed,
    rejection_reason = null,
    reviewed_by = null,
    reviewed_at = null,
    completed_at = case when legal_name_changed then null else now() end,
    updated_at = now()
  where case_id = target_case.id and kind = 'profile'::public.employee_onboarding_requirement_kind;

  update public.employee_onboarding_cases set status = 'in_progress'::public.employee_onboarding_case_status, revision = revision + 1,
    updated_at = now() where id = target_case.id returning revision into expected_revision;
  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_case.workspace_id, target_case.employee_id, target_case.id, target_user_id,
    'onboarding.profile_saved', 'onboarding_case', target_case.id::text,
    jsonb_build_object('legal_name_review_required', legal_name_changed));
  return expected_revision;
end;
$$;

create or replace function public.review_employee_onboarding_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  review_action text,
  target_requirement_id uuid,
  review_reason text,
  expected_revision integer,
  production_ready boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_case public.employee_onboarding_cases%rowtype;
  requirement public.employee_onboarding_requirements%rowtype;
  private_profile public.employee_private_profiles%rowtype;
  actor_system_key text;
begin
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_onboarding.review') then
    raise exception 'employee onboarding review required' using errcode = '42501';
  end if;
  select role.system_key into actor_system_key
  from public.workspace_memberships membership
  join public.workspace_roles role on role.id = membership.role_id
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active'
  order by membership.created_at
  limit 1;

  select * into target_case from public.employee_onboarding_cases
  where workspace_id = target_workspace_id and employee_id = target_employee_id for update;
  if target_case.id is null or target_case.revision <> expected_revision then raise exception 'onboarding changed; refresh required' using errcode = '40001'; end if;
  if review_action in ('accept_requirement', 'reject_requirement') then
    select * into requirement from public.employee_onboarding_requirements
    where id = target_requirement_id and case_id = target_case.id for update;
    if requirement.id is null or not requirement.requires_review then raise exception 'reviewable requirement unavailable' using errcode = 'P0002'; end if;
    if requirement.kind = 'document'::public.employee_onboarding_requirement_kind and not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_documents.review') then
      raise exception 'employee document review required' using errcode = '42501';
    end if;
    if requirement.kind = 'profile'::public.employee_onboarding_requirement_kind and actor_system_key not in ('owner', 'admin') then
      raise exception 'owner or admin approval required for legal name changes' using errcode = '42501';
    end if;
    if review_action = 'reject_requirement' and char_length(btrim(coalesce(review_reason, ''))) not between 1 and 500 then
      raise exception 'specific correction reason required' using errcode = '22023';
    end if;
    update public.employee_onboarding_requirements set
      status = case
        when review_action = 'accept_requirement' then 'completed'::public.employee_onboarding_requirement_status
        else 'rejected'::public.employee_onboarding_requirement_status
      end,
      rejection_reason = case when review_action = 'reject_requirement' then btrim(review_reason) else null end,
      reviewed_by = actor_user_id,
      reviewed_at = now(),
      completed_at = case when review_action = 'accept_requirement' then now() else null end,
      updated_at = now()
    where id = requirement.id;
    if requirement.kind = 'document'::public.employee_onboarding_requirement_kind then
      update public.employee_documents set
        review_status = case
          when review_action = 'accept_requirement' then 'accepted'::public.employee_document_review_status
          else 'rejected'::public.employee_document_review_status
        end,
        rejection_reason = case when review_action = 'reject_requirement' then btrim(review_reason) else null end,
        reviewed_by = actor_user_id, reviewed_at = now()
      where requirement_id = requirement.id and review_status = 'awaiting_review'::public.employee_document_review_status;
    end if;
    if requirement.kind = 'profile'::public.employee_onboarding_requirement_kind and review_action = 'accept_requirement' then
      select * into private_profile
      from public.employee_private_profiles
      where employee_id = target_employee_id;
      if private_profile.employee_id is null then
        raise exception 'private profile unavailable' using errcode = 'P0002';
      end if;
      update public.employee_profiles set
        first_name = private_profile.legal_first_name,
        last_name = private_profile.legal_last_name,
        revision = revision + 1,
        updated_at = now()
      where id = target_employee_id;
      insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
      values (target_workspace_id, target_employee_id, actor_user_id,
        'employee.legal_name_approved', 'Employee legal name change approved from onboarding');
    end if;
    if review_action = 'reject_requirement' then
      update public.employee_onboarding_cases set status = 'changes_requested'::public.employee_onboarding_case_status, revision = revision + 1,
        updated_at = now() where id = target_case.id returning revision into expected_revision;
    else
      update public.employee_onboarding_cases set revision = revision + 1, updated_at = now()
      where id = target_case.id returning revision into expected_revision;
    end if;
  elsif review_action = 'activate' then
    if target_case.status <> 'submitted'::public.employee_onboarding_case_status then raise exception 'submitted onboarding required' using errcode = '23514'; end if;
    if not production_ready then raise exception 'sensitive infrastructure readiness required' using errcode = '55000'; end if;
    if exists (select 1 from public.employee_onboarding_requirements
      where case_id = target_case.id and required and blocks_activation and status <> 'completed'::public.employee_onboarding_requirement_status) then
      raise exception 'activation-blocking requirements remain' using errcode = '23514';
    end if;
    update public.workspace_memberships set status = 'active', updated_at = now()
    where id = target_case.membership_id and status = 'pending_activation';
    if not found then raise exception 'pending membership unavailable' using errcode = '23514'; end if;
    update public.employee_onboarding_cases set status = 'approved'::public.employee_onboarding_case_status, approved_by = actor_user_id,
      approved_at = now(), revision = revision + 1, updated_at = now()
    where id = target_case.id returning revision into expected_revision;
    insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
    values (target_workspace_id, target_employee_id, actor_user_id,
      'employee.activated', 'Employee onboarding approved and workspace access activated');
  else
    raise exception 'unsupported onboarding review action' using errcode = '22023';
  end if;
  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_workspace_id, target_employee_id, target_case.id, actor_user_id,
    'onboarding.' || review_action, 'onboarding_case', target_case.id::text,
    jsonb_build_object('requirement_id', target_requirement_id, 'reason_present', nullif(btrim(coalesce(review_reason, '')), '') is not null));
  return expected_revision;
end;
$$;
