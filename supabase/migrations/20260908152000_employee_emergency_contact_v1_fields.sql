alter table public.employee_private_profiles
  add column if not exists emergency_contact_relationship text not null default 'Emergency contact',
  add column if not exists emergency_contact_email text not null default '';

alter table public.employee_private_profiles
  drop constraint if exists employee_private_profiles_emergency_relationship_check,
  drop constraint if exists employee_private_profiles_emergency_email_check;

alter table public.employee_private_profiles
  add constraint employee_private_profiles_emergency_relationship_check
    check (char_length(btrim(emergency_contact_relationship)) between 1 and 80),
  add constraint employee_private_profiles_emergency_email_check
    check (
      emergency_contact_email = ''
      or emergency_contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    );

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
  emergency_email text := btrim(coalesce(profile_payload->>'emergency_contact_email', ''));
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
    or coalesce(profile_payload->>'emergency_contact_relationship', '') = ''
    or coalesce(profile_payload->>'emergency_contact_phone', '') = ''
    or (emergency_email <> '' and emergency_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
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
    emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
    emergency_contact_email, share_phone_with_teammates, share_email_with_teammates
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
    btrim(profile_payload->>'emergency_contact_name'),
    btrim(profile_payload->>'emergency_contact_relationship'),
    btrim(profile_payload->>'emergency_contact_phone'),
    emergency_email,
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
    emergency_contact_relationship = excluded.emergency_contact_relationship,
    emergency_contact_phone = excluded.emergency_contact_phone,
    emergency_contact_email = excluded.emergency_contact_email,
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

create or replace function public.get_employee_detail(target_workspace_id uuid, target_employee_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when employee.id is null then null else jsonb_build_object(
    'id', employee.id, 'workspace_id', employee.workspace_id,
    'employee_code', employee.employee_code, 'first_name', employee.first_name,
    'last_name', employee.last_name, 'preferred_name', employee.preferred_name,
    'display_name', concat_ws(' ', employee.first_name, employee.last_name),
    'invitation_email', employee.invitation_email, 'start_date', employee.start_date,
    'primary_location_id', primary_location.location_id, 'primary_location_name', location.name,
    'location_count', (select count(*) from public.employee_location_assignments a where a.employee_id = employee.id and a.ended_at is null),
    'primary_job_id', primary_job.job_id, 'primary_job_name', job.name,
    'job_count', (select count(*) from public.employee_job_assignments a where a.employee_id = employee.id and a.ended_at is null),
    'role_name', role.name,
    'display_status', case when employee.archived_at is not null then 'archived' when membership.status = 'active' then 'active' when membership.status = 'pending_activation' then 'onboarding' when invitation.status = 'pending' and invitation.expires_at > now() then 'invited' else 'not_invited' end,
    'archived_at', employee.archived_at, 'revision', employee.revision,
    'user_id', employee.user_id, 'internal_note', employee.internal_note,
    'private_contact', case when private_profile.employee_id is null then null else jsonb_build_object(
      'phone', private_profile.phone,
      'date_of_birth', private_profile.date_of_birth,
      'emergency_contact_name', private_profile.emergency_contact_name,
      'emergency_contact_relationship', private_profile.emergency_contact_relationship,
      'emergency_contact_phone', private_profile.emergency_contact_phone,
      'emergency_contact_email', private_profile.emergency_contact_email,
      'share_phone_with_teammates', private_profile.share_phone_with_teammates,
      'share_email_with_teammates', private_profile.share_email_with_teammates
    ) end,
    'locations', coalesce((select jsonb_agg(jsonb_build_object('id', a.location_id, 'name', l.name, 'primary', a.is_primary, 'archived', l.archived_at is not null) order by a.is_primary desc, l.name) from public.employee_location_assignments a join public.locations l on l.id = a.location_id where a.employee_id = employee.id and a.ended_at is null), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('id', a.job_id, 'name', j.name, 'primary', a.is_primary, 'archived', j.archived_at is not null) order by a.is_primary desc, j.name) from public.employee_job_assignments a join public.jobs j on j.id = a.job_id where a.employee_id = employee.id and a.ended_at is null), '[]'::jsonb),
    'invitation', case when invitation.id is null then null else jsonb_build_object('id', invitation.id, 'email', invitation.email, 'role_id', invitation.role_id, 'status', invitation.status, 'expires_at', invitation.expires_at, 'sent_at', invitation.sent_at) end,
    'onboarding', jsonb_build_object('status', case when membership.status = 'pending_activation' then 'in_progress' when invitation.status = 'pending' then 'invited' else 'not_requested' end, 'required_documents', (select count(*) from public.document_types d where d.workspace_id = employee.workspace_id and d.required_at_onboarding and d.archived_at is null), 'completed_documents', 0),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', event.id, 'action', event.action, 'occurred_at', event.occurred_at, 'actor_user_id', event.actor_user_id, 'summary', event.summary) order by event.occurred_at desc) from (select * from public.employee_events where employee_id = employee.id order by occurred_at desc limit 50) event), '[]'::jsonb)
  ) end
  from public.employee_profiles employee
  left join public.employee_private_profiles private_profile on private_profile.employee_id = employee.id
  left join public.employee_location_assignments primary_location on primary_location.employee_id = employee.id and primary_location.ended_at is null and primary_location.is_primary
  left join public.locations location on location.id = primary_location.location_id
  left join public.employee_job_assignments primary_job on primary_job.employee_id = employee.id and primary_job.ended_at is null and primary_job.is_primary
  left join public.jobs job on job.id = primary_job.job_id
  left join public.workspace_memberships membership on membership.workspace_id = employee.workspace_id and membership.user_id = employee.user_id
  left join public.workspace_roles role on role.id = membership.role_id
  left join lateral (select * from public.employee_invitations i where i.employee_id = employee.id order by i.created_at desc limit 1) invitation on true
  where employee.id = target_employee_id and employee.workspace_id = target_workspace_id
    and public.workspace_has_permission(target_workspace_id, 'employees.read')
    and public.can_access_employee(target_workspace_id, employee.id);
$$;
