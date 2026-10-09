-- JOIN-014: a name here is a first name, an optional middle name and a last
-- name, because that is the shape a payroll or an ID document expects. The
-- record and the legal record each gain the middle part.
--
-- The preferred name stops being forced empty in the employment record. It is
-- asked in employee onboarding and left optional; the owner wizard does not ask
-- for it, because the owner is naming a workspace, not introducing themselves
-- to one.
alter table public.employee_profiles
  add column if not exists middle_name text not null default '';
alter table public.employee_profiles
  drop constraint if exists employee_profiles_middle_name_check;
alter table public.employee_profiles
  add constraint employee_profiles_middle_name_check
  check (char_length(middle_name) <= 80);

alter table public.employee_private_profiles
  add column if not exists legal_middle_name text not null default '';
alter table public.employee_private_profiles
  drop constraint if exists employee_private_profiles_legal_middle_name_check;
alter table public.employee_private_profiles
  add constraint employee_private_profiles_legal_middle_name_check
  check (char_length(legal_middle_name) <= 80);

comment on column public.employee_profiles.middle_name is
  'Optional. Empty string when the person has none or has not given one.';
comment on column public.employee_private_profiles.legal_middle_name is
  'Optional middle name as it appears on the person''s ID.';

-- The helper carries the middle part through.
drop function if exists app_private.ensure_owner_employee_profile(uuid, uuid, text, text);
CREATE OR REPLACE FUNCTION app_private.ensure_owner_employee_profile(target_workspace_id uuid, owner_user_id uuid, owner_first_name text DEFAULT NULL::text, owner_middle_name text DEFAULT NULL::text, owner_last_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  existing_employee_id uuid;
  next_code bigint;
  owner_email text;
  raw_name text;
  seeded_first text;
  seeded_last text;
begin
  if not exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = owner_user_id
      and membership.role = 'owner'::public.workspace_role
      and membership.status = 'active'::public.membership_status
  ) then
    raise exception 'active owner membership required' using errcode = '42501';
  end if;

  -- A freshly signed-up owner has their name in the signup metadata before a
  -- profile row exists, so the metadata is still read.
  select
    lower(auth_user.email),
    btrim(coalesce(
      nullif(profile.display_name, ''),
      nullif(auth_user.raw_user_meta_data->>'display_name', ''),
      nullif(auth_user.raw_user_meta_data->>'full_name', ''),
      ''
    ))
  into owner_email, raw_name
  from auth.users auth_user
  left join public.user_profiles profile on profile.user_id = auth_user.id
  where auth_user.id = owner_user_id;

  select employee.id
  into existing_employee_id
  from public.employee_profiles employee
  where employee.workspace_id = target_workspace_id
    and employee.user_id = owner_user_id
    and employee.archived_at is null
  order by employee.created_at
  limit 1
  for update;

  -- Whatever the employees tab says is what the workspace decided to call this
  -- person. Setup finishing again is not a reason to argue with it, and the
  -- owner hides from the schedule there like anyone else.
  if existing_employee_id is not null then
    return existing_employee_id;
  end if;

  -- The last word is the family name; everything before it is the given name,
  -- which is the reading that survives a middle name.
  seeded_first := btrim(coalesce(
    nullif(btrim(owner_first_name), ''),
    nullif(btrim(substring(raw_name from '^(.*)\s\S+$')), ''),
    nullif(raw_name, ''),
    nullif(split_part(owner_email, '@', 1), ''),
    'Owner'
  ));
  seeded_last := btrim(coalesce(
    nullif(btrim(owner_last_name), ''),
    nullif(btrim(substring(raw_name from '\s(\S+)$')), ''),
    -- A name with no family name in it still has to fill a required column.
    '-'
  ));

  select coalesce(max(substring(employee.employee_code from 3)::bigint), 0) + 1
  into next_code
  from public.employee_profiles employee
  where employee.workspace_id = target_workspace_id
    and employee.employee_code ~ '^E-[0-9]+$';

  insert into public.workspace_employee_counters (workspace_id, next_value)
  values (target_workspace_id, next_code + 1)
  on conflict (workspace_id) do update
  set next_value = greatest(
    public.workspace_employee_counters.next_value + 1,
    excluded.next_value
  )
  returning next_value - 1 into next_code;

  insert into public.employee_profiles (
    workspace_id, user_id, employee_code, first_name, middle_name, last_name,
    preferred_name, invitation_email, internal_note, is_remote,
    is_excluded_from_schedule, created_by
  ) values (
    target_workspace_id,
    owner_user_id,
    'E-' || lpad(next_code::text, 4, '0'),
    left(seeded_first, 80),
    left(btrim(coalesce(owner_middle_name, '')), 80),
    left(seeded_last, 80),
    '',
    owner_email,
    -- An internal note is a manager's sentence about a person. Nothing the
    -- system has to say belongs in it.
    '',
    false,
    -- On the schedule like everyone else. Exclude is a choice made in the row.
    false,
    owner_user_id
  )
  returning id into existing_employee_id;

  -- The name typed at sign-up is this person's legal name, and it is what the
  -- record above now holds. The private profile is not seeded from it: that
  -- table requires a full emergency contact and address, and inventing those to
  -- satisfy a constraint would put made-up data where real data belongs. The
  -- owner fills it in the same place an employee does.

  insert into public.employee_events (
    workspace_id, employee_id, actor_user_id, action, summary
  ) values (
    target_workspace_id,
    existing_employee_id,
    owner_user_id,
    'employee.owner_record_created',
    'Owner employee record created when setup began'
  );

  return existing_employee_id;
end;
$function$

;

drop function if exists app_private.apply_owner_onboarding_update(uuid, uuid, text, smallint, boolean, integer, text, text);
CREATE OR REPLACE FUNCTION app_private.apply_owner_onboarding_update(actor_user_id uuid, target_workspace_id uuid, workspace_name text, next_step smallint, mark_complete boolean DEFAULT false, expected_revision integer DEFAULT NULL::integer, owner_first_name text DEFAULT NULL::text, owner_middle_name text DEFAULT NULL::text, owner_last_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  owner_employee_id uuid;
  current_status public.onboarding_status;
  current_revision integer;
  completed_timestamp timestamptz;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.role = 'owner'
      and membership.status = 'active'
  ) then
    raise exception 'owner access required' using errcode = '42501';
  end if;
  if char_length(btrim(workspace_name)) not between 1 and 120 then
    raise exception 'workspace name must be between 1 and 120 characters' using errcode = '22023';
  end if;
  if next_step not between 1 and 4 then
    raise exception 'invalid onboarding step' using errcode = '22023';
  end if;

  select onboarding.status, onboarding.revision
  into current_status, current_revision
  from public.workspace_onboarding onboarding
  where onboarding.workspace_id = target_workspace_id
  for update;

  if current_status is null then
    raise exception 'workspace onboarding was not found' using errcode = 'P0002';
  end if;

  if current_status = 'complete'::public.onboarding_status then
    if mark_complete then
      return;
    end if;
    raise exception 'completed owner onboarding cannot be changed' using errcode = '22023';
  end if;

  if expected_revision is not null and current_revision <> expected_revision then
    raise exception 'owner onboarding revision conflict' using errcode = '40001';
  end if;

  if mark_complete and not exists (
    select 1
    from public.locations location
    where location.workspace_id = target_workspace_id
      and location.archived_at is null
  ) then
    raise exception 'at least one active location is required to complete owner onboarding' using errcode = '23514';
  end if;

  if mark_complete and not exists (
    select 1
    from public.departments department
    where department.workspace_id = target_workspace_id
      and department.archived_at is null
  ) then
    raise exception 'at least one active department is required to complete owner onboarding' using errcode = '23514';
  end if;

  if mark_complete and not exists (
    select 1
    from public.jobs job
    where job.workspace_id = target_workspace_id
      and job.archived_at is null
  ) then
    raise exception 'at least one active job is required to complete owner onboarding' using errcode = '23514';
  end if;

  completed_timestamp := now();

  update public.workspaces
  set name = btrim(workspace_name), updated_at = completed_timestamp
  where id = target_workspace_id;

  update public.workspace_onboarding
  set
    status = case
      when mark_complete then 'complete'::public.onboarding_status
      else 'incomplete'::public.onboarding_status
    end,
    current_step = next_step,
    completed_at = case when mark_complete then completed_timestamp else null end,
    revision = revision + 1,
    updated_by = actor_user_id,
    updated_at = completed_timestamp
  where workspace_id = target_workspace_id;

  -- The owner is a member from the first step, so their record exists from the
  -- first step too. Waiting for completion meant the team list did not contain
  -- the one person who was certainly on the team.
  owner_employee_id := app_private.ensure_owner_employee_profile(
    target_workspace_id,
    actor_user_id,
    owner_first_name,
    owner_middle_name,
    owner_last_name
  );
  -- Locations and jobs come into existence during setup, so this runs on every
  -- save and picks up whatever was added since the last one.
  perform app_private.open_owner_record_to_everything(
    target_workspace_id,
    owner_employee_id,
    actor_user_id
  );

  if mark_complete then

    insert into public.workspace_entitlements (
      workspace_id,
      status,
      trial_started_at,
      trial_ends_at,
      current_period_started_at,
      current_period_ends_at,
      billing_owner_user_id,
      provider,
      created_at,
      updated_at
    ) values (
      target_workspace_id,
      'trialing'::public.workspace_entitlement_status,
      completed_timestamp,
      completed_timestamp + interval '14 days',
      completed_timestamp,
      completed_timestamp + interval '14 days',
      actor_user_id,
      'internal'::public.workspace_entitlement_provider,
      completed_timestamp,
      completed_timestamp
    )
    on conflict (workspace_id) do nothing;
  end if;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id,
    actor_user_id,
    case when mark_complete then 'workspace.onboarding_completed' else 'workspace.onboarding_saved' end,
    'workspace',
    target_workspace_id::text,
    jsonb_build_object(
      'step', next_step,
      'previous_revision', current_revision,
      'revision', current_revision + 1
    )
  );
end;
$function$

;

drop function if exists public.update_owner_onboarding_service(uuid, uuid, text, smallint, boolean, integer, text, text);
create or replace function public.update_owner_onboarding_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  workspace_name text,
  next_step smallint,
  mark_complete boolean,
  expected_revision integer,
  owner_first_name text default null,
  owner_middle_name text default null,
  owner_last_name text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  perform app_private.apply_owner_onboarding_update(
    actor_user_id, target_workspace_id, workspace_name, next_step,
    mark_complete, expected_revision, owner_first_name, owner_middle_name,
    owner_last_name
  );
end;
$fn$;

revoke all on function public.update_owner_onboarding_service(uuid, uuid, text, smallint, boolean, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.update_owner_onboarding_service(uuid, uuid, text, smallint, boolean, integer, text, text, text) to service_role;
revoke all on function app_private.ensure_owner_employee_profile(uuid, uuid, text, text, text) from public, anon, authenticated;


-- Employee onboarding asks for the middle name and the preferred name, both
-- optional, and stops overwriting the preferred name with an empty string.
CREATE OR REPLACE FUNCTION public.save_employee_onboarding_profile_service(target_user_id uuid, profile_payload jsonb, expected_revision integer, target_workspace_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_case public.employee_onboarding_cases%rowtype;
  employee public.employee_profiles%rowtype;
  normalized_country_code text := nullif(upper(btrim(coalesce(profile_payload->>'country_code', ''))), '');
  normalized_birth_date text := nullif(btrim(coalesce(profile_payload->>'date_of_birth', '')), '');
  submitted_phone text := nullif(btrim(coalesce(profile_payload->>'phone', '')), '');
  emergency_email text := btrim(coalesce(profile_payload->>'emergency_contact_email', ''));
  confirmed_phone text;
  legal_name_changed boolean;
  next_requirement_status public.employee_onboarding_requirement_status;
begin
  -- Account phone is an initial UI suggestion, never a server-side override.
  confirmed_phone := submitted_phone;

  select onboarding.* into target_case from public.employee_onboarding_cases onboarding
  where onboarding.id = app_private.employee_onboarding_case_id(target_user_id, target_workspace_id)
  for update;
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

  insert into public.employee_private_profiles (
    employee_id, workspace_id, legal_first_name, legal_middle_name, legal_last_name, preferred_name,
    phone, street_address, city, region, postal_code, country_code, date_of_birth,
    emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
    emergency_contact_email, share_phone_with_teammates, share_email_with_teammates
  ) values (
    target_case.employee_id, target_case.workspace_id,
    btrim(profile_payload->>'legal_first_name'),
    left(btrim(coalesce(profile_payload->>'legal_middle_name', '')), 80),
    btrim(profile_payload->>'legal_last_name'),
    left(btrim(coalesce(profile_payload->>'preferred_name', '')), 80),
    confirmed_phone,
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
    legal_middle_name = excluded.legal_middle_name,
    legal_last_name = excluded.legal_last_name,
    -- It was forced empty while the field was closed. The person answers it
    -- now, and leaving it blank is a valid answer.
    preferred_name = excluded.preferred_name,
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
$function$

;

-- The drawer carries the middle name too, optional like everywhere else. The
-- argument is added to the fifteen-argument form, so the older thirteen stays
-- exactly as it was and no call becomes ambiguous.
drop function if exists public.save_employee(uuid, uuid, text, text, text, text, date, text, uuid[], uuid, uuid[], uuid, boolean, boolean, integer);
CREATE OR REPLACE FUNCTION public.save_employee(target_workspace_id uuid, target_employee_id uuid, employee_first_name text, employee_middle_name text, employee_last_name text, employee_preferred_name text, employee_invitation_email text, employee_start_date date, employee_internal_note text, location_ids uuid[], primary_location_id uuid, job_ids uuid[], primary_job_id uuid, employee_is_remote boolean, employee_is_excluded_from_schedule boolean, expected_revision integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  saved_id uuid := target_employee_id;
  current_revision integer;
  next_code bigint;
  assignment_optional boolean := coalesce(employee_is_remote, false) or coalesce(employee_is_excluded_from_schedule, false);
begin
  if actor_id is null or not public.workspace_has_permission(target_workspace_id, 'employees.manage') then
    raise exception 'employee management access required' using errcode = '42501';
  end if;
  if char_length(btrim(employee_first_name)) not between 1 and 80 or char_length(btrim(employee_last_name)) not between 1 and 80 then
    raise exception 'employee first and last name are required' using errcode = '22023';
  end if;
  if not assignment_optional and (
    cardinality(coalesce(location_ids, '{}'::uuid[])) = 0
    or primary_location_id is null
    or cardinality(coalesce(job_ids, '{}'::uuid[])) = 0
    or primary_job_id is null
  ) then
    raise exception 'employee requires a location and job unless remote or excluded from schedule' using errcode = '22023';
  end if;
  if primary_location_id is not null and not primary_location_id = any(coalesce(location_ids, '{}'::uuid[])) then
    raise exception 'primary location must be assigned' using errcode = '22023';
  end if;
  if primary_job_id is not null and not primary_job_id = any(coalesce(job_ids, '{}'::uuid[])) then
    raise exception 'primary job must be assigned' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(location_ids, '{}'::uuid[])) selected(location_id) left join public.locations l on l.id = selected.location_id and l.workspace_id = target_workspace_id and l.archived_at is null where l.id is null)
    or not public.can_assign_employee_locations(target_workspace_id, array(
      select selected.location_id from unnest(coalesce(location_ids, '{}'::uuid[])) selected(location_id)
      where not exists (select 1 from public.employee_location_assignments existing
        where existing.employee_id = target_employee_id and existing.workspace_id = target_workspace_id
          and existing.location_id = selected.location_id and existing.ended_at is null)
    )) then
    raise exception 'invalid or inaccessible employee location' using errcode = '42501';
  end if;
  if target_employee_id is not null and exists (
    select 1 from public.employee_location_assignments existing
    where existing.employee_id = target_employee_id and existing.workspace_id = target_workspace_id
      and existing.ended_at is null
      and not public.can_assign_employee_locations(target_workspace_id, array[existing.location_id])
      and not existing.location_id = any(coalesce(location_ids, '{}'::uuid[]))
  ) then
    raise exception 'cannot remove an employee location outside your scope' using errcode='42501';
  end if;
  if exists (select 1 from unnest(coalesce(job_ids, '{}'::uuid[])) selected(job_id) left join public.jobs j on j.id = selected.job_id and j.workspace_id = target_workspace_id and j.archived_at is null where j.id is null) then
    raise exception 'invalid employee job' using errcode = '22023';
  end if;

  if saved_id is null then
    insert into public.workspace_employee_counters (workspace_id, next_value)
    values (target_workspace_id, 1)
    on conflict (workspace_id) do nothing;

    update public.workspace_employee_counters counter
    set next_value = greatest(
      counter.next_value,
      coalesce((
        select max(substring(employee.employee_code from 3)::bigint) + 1
        from public.employee_profiles employee
        where employee.workspace_id = target_workspace_id
          and employee.employee_code ~ '^E-[0-9]{4,}$'
      ), 1)
    ) + 1
    where counter.workspace_id = target_workspace_id
    returning counter.next_value - 1 into next_code;

    insert into public.employee_profiles (
      workspace_id, employee_code, first_name, middle_name, last_name, preferred_name,
      invitation_email, start_date, internal_note, is_remote,
      is_excluded_from_schedule, created_by
    )
    values (
      target_workspace_id, 'E-' || lpad(next_code::text, 4, '0'),
      btrim(employee_first_name), left(btrim(coalesce(employee_middle_name, '')), 80), btrim(employee_last_name),
      btrim(coalesce(employee_preferred_name, '')),
      nullif(lower(btrim(employee_invitation_email)), ''),
      employee_start_date, btrim(coalesce(employee_internal_note, '')),
      coalesce(employee_is_remote, false),
      coalesce(employee_is_excluded_from_schedule, false),
      actor_id
    )
    returning id into saved_id;
    insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
    values (target_workspace_id, saved_id, actor_id, 'employee.created', 'Employee record created');
  else
    select revision into current_revision from public.employee_profiles
    where id = saved_id and workspace_id = target_workspace_id and archived_at is null
      and public.can_manage_employee_record(target_workspace_id, id) for update;
    if current_revision is null then raise exception 'employee not found' using errcode = 'P0002'; end if;
    if expected_revision is null or expected_revision <> current_revision then raise exception 'employee revision conflict' using errcode = '40001'; end if;
    update public.employee_profiles set
      first_name = btrim(employee_first_name),
      middle_name = left(btrim(coalesce(employee_middle_name, '')), 80),
      last_name = btrim(employee_last_name),
      preferred_name = btrim(coalesce(employee_preferred_name, '')),
      invitation_email = nullif(lower(btrim(employee_invitation_email)), ''),
      start_date = employee_start_date,
      internal_note = btrim(coalesce(employee_internal_note, '')),
      is_remote = coalesce(employee_is_remote, false),
      is_excluded_from_schedule = coalesce(employee_is_excluded_from_schedule, false),
      revision = revision + 1,
      updated_at = now()
    where id = saved_id;
    insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
    values (target_workspace_id, saved_id, actor_id, 'employee.updated', 'Employee profile and assignments updated');
  end if;

  update public.employee_location_assignments set ended_at = now() where employee_id = saved_id and ended_at is null;
  insert into public.employee_location_assignments (workspace_id, employee_id, location_id, is_primary, created_by)
  select target_workspace_id, saved_id, selected.location_id, selected.location_id = primary_location_id, actor_id from unnest(coalesce(location_ids, '{}'::uuid[])) selected(location_id);
  update public.employee_job_assignments set ended_at = now() where employee_id = saved_id and ended_at is null;
  insert into public.employee_job_assignments (workspace_id, employee_id, job_id, is_primary, created_by)
  select target_workspace_id, saved_id, selected.job_id, selected.job_id = primary_job_id, actor_id from unnest(coalesce(job_ids, '{}'::uuid[])) selected(job_id);
  return saved_id;
end;
$function$

;

-- The service wrapper repeats the argument list, so it learns the new one too.
drop function if exists public.save_employee_service(uuid, uuid, uuid, text, text, text, text, date, text, uuid[], uuid, uuid[], uuid, boolean, boolean, integer);
CREATE OR REPLACE FUNCTION public.save_employee_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, employee_first_name text, employee_middle_name text, employee_last_name text, employee_preferred_name text, employee_invitation_email text, employee_start_date date, employee_internal_note text, location_ids uuid[], primary_location_id uuid, job_ids uuid[], primary_job_id uuid, employee_is_remote boolean, employee_is_excluded_from_schedule boolean, expected_revision integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  return public.save_employee(
    target_workspace_id,
    target_employee_id,
    employee_first_name,
    employee_middle_name,
    employee_last_name,
    '',
    employee_invitation_email,
    employee_start_date,
    employee_internal_note,
    location_ids,
    primary_location_id,
    job_ids,
    primary_job_id,
    employee_is_remote,
    employee_is_excluded_from_schedule,
    expected_revision
  );
end;
$function$

;

revoke all on function public.save_employee_service(uuid, uuid, uuid, text, text, text, text, text, date, text, uuid[], uuid, uuid[], uuid, boolean, boolean, integer) from public, anon, authenticated;
grant execute on function public.save_employee_service(uuid, uuid, uuid, text, text, text, text, text, date, text, uuid[], uuid, uuid[], uuid, boolean, boolean, integer) to service_role;
