-- BL-080. The owner's legal name was asked for nowhere. Employees give theirs
-- during onboarding; the owner never runs onboarding, and the account area
-- filled the gap by copying the record's name into the legal name the first
-- time an emergency contact was saved -- a guess, written where documents and
-- signatures will read it.
--
-- User decisions 2026-09-25:
--   1. The owner gives it at the first step of setup. The three name fields
--      there are the legal name too; the account and the record keep taking
--      their name from the same answers.
--   2. The owner can change it later, in Account > Profile. The old name, the
--      new name, who changed it and when go to the audit log. Employees keep
--      the onboarding review they have.
--   3. It is required, it cannot be empty, and it is never copied from the
--      account name.

-- 1. A private record can hold a legal name before it holds anything else ------------
--
-- The first step of setup knows the owner's legal name and nothing else, so the
-- row has to exist without an emergency contact. The contact becomes all or
-- nothing instead of always: its name and phone arrive together or not at all,
-- and a record with nobody on it has no relationship to show either. Onboarding
-- still asks every employee for one; that is the form's rule and it stays in
-- save_employee_onboarding_profile_service. The relationship loses its
-- "Emergency contact" default, which would otherwise put a relationship on a
-- record with nobody on it.
alter table public.employee_private_profiles
  alter column emergency_contact_name drop not null,
  alter column emergency_contact_phone drop not null,
  alter column emergency_contact_relationship drop not null,
  alter column emergency_contact_relationship drop default,
  add constraint employee_private_profiles_emergency_contact_whole check (
    (emergency_contact_name is null) = (emergency_contact_phone is null)
    and (emergency_contact_name is not null or emergency_contact_relationship is null)
  );

-- 2. One writer for the owner's legal name --------------------------------------------
--
-- Setup's first step and the account area both land here. Validation is the
-- column's, said in words the screen can show.
create function app_private.write_owner_legal_name(
  target_workspace_id uuid,
  target_employee_id uuid,
  first_name text,
  middle_name text,
  last_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned_first text := btrim(coalesce(first_name, ''));
  cleaned_middle text := btrim(coalesce(middle_name, ''));
  cleaned_last text := btrim(coalesce(last_name, ''));
begin
  if cleaned_first = '' or cleaned_last = '' then
    raise exception 'a legal name needs a first and a last name' using errcode = '22023';
  end if;
  if char_length(cleaned_first) > 80 or char_length(cleaned_middle) > 80
    or char_length(cleaned_last) > 80 then
    raise exception 'each part of a legal name fits in 80 characters' using errcode = '22023';
  end if;

  insert into public.employee_private_profiles (
    employee_id, workspace_id, legal_first_name, legal_middle_name, legal_last_name
  ) values (
    target_employee_id, target_workspace_id, cleaned_first, cleaned_middle, cleaned_last
  )
  on conflict (employee_id) do update set
    legal_first_name = excluded.legal_first_name,
    legal_middle_name = excluded.legal_middle_name,
    legal_last_name = excluded.legal_last_name,
    updated_at = now();
end;
$$;

revoke all on function app_private.write_owner_legal_name(uuid, uuid, text, text, text)
  from public, anon, authenticated;

-- 3. Setup's first step writes it, and no step passes without it ----------------------
--
-- The rule lives in the one function that moves setup forward: every save
-- leaves the owner with a legal name on file, or is refused. The first save is
-- the one that files the owner, so an owner who is past the first step -- or
-- finished -- always has one. A later step sends no names and keeps what is on
-- file; the first step sends them again when the owner goes back to it, and
-- the correction is the legal name.
create or replace function app_private.apply_owner_onboarding_update(
  actor_user_id uuid,
  target_workspace_id uuid,
  workspace_name text,
  next_step smallint,
  mark_complete boolean default false,
  expected_revision integer default null,
  owner_first_name text default null,
  owner_middle_name text default null,
  owner_last_name text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  owner_employee_id uuid;
  current_status public.onboarding_status;
  current_revision integer;
  completed_timestamp timestamptz;
  names_given boolean := coalesce(btrim(owner_first_name), '') <> ''
    or coalesce(btrim(owner_middle_name), '') <> ''
    or coalesce(btrim(owner_last_name), '') <> '';
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

  if names_given then
    perform app_private.write_owner_legal_name(
      target_workspace_id, owner_employee_id,
      owner_first_name, owner_middle_name, owner_last_name
    );
  end if;
  if not exists (
    select 1 from public.employee_private_profiles private_profile
    where private_profile.employee_id = owner_employee_id
  ) then
    raise exception 'the owner''s legal name is required' using errcode = '23514';
  end if;

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
$function$;

-- 4. The owner changes it later, and the change is on record ---------------------------
--
-- Owner only, and only their own record: there is no target person to pass,
-- the record is the caller's in the workspace named. The rule is
-- workspace.setup's -- owner only, the whole organization -- so the core
-- answers with that action rather than a second key with the same row.
create function public.save_owner_legal_name_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  legal_first_name text,
  legal_middle_name text,
  legal_last_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  own_employee_id uuid;
  previous_name jsonb;
  next_name jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.setup');

  select employee.id into own_employee_id
  from public.employee_profiles employee
  where employee.workspace_id = target_workspace_id
    and employee.user_id = actor_user_id
    and employee.archived_at is null;
  if own_employee_id is null then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'first_name', private_profile.legal_first_name,
    'middle_name', private_profile.legal_middle_name,
    'last_name', private_profile.legal_last_name
  ) into previous_name
  from public.employee_private_profiles private_profile
  where private_profile.employee_id = own_employee_id
  for update;

  perform app_private.write_owner_legal_name(
    target_workspace_id, own_employee_id,
    legal_first_name, legal_middle_name, legal_last_name
  );

  select jsonb_build_object(
    'first_name', private_profile.legal_first_name,
    'middle_name', private_profile.legal_middle_name,
    'last_name', private_profile.legal_last_name
  ) into next_name
  from public.employee_private_profiles private_profile
  where private_profile.employee_id = own_employee_id;

  -- A save that changes nothing is not a change.
  if previous_name is not distinct from next_name then
    return;
  end if;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id,
    actor_user_id,
    'employee.legal_name_changed',
    'employee',
    own_employee_id::text,
    jsonb_build_object('previous', previous_name, 'next', next_name)
  );
end;
$$;

revoke all on function public.save_owner_legal_name_service(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.save_owner_legal_name_service(uuid, uuid, text, text, text)
  to service_role;

-- 5. The account area writes a contact, never a legal name -----------------------------
--
-- It used to open a missing private record with the record's name copied in as
-- the legal name. The record is now opened by the step that knows the legal
-- name -- onboarding for an employee, setup for the owner -- so here it only
-- has to exist.
create or replace function public.save_own_employment_contact_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  contact_name text,
  contact_relationship text,
  contact_phone text,
  contact_email text default ''::text,
  personal_phone text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_row public.employee_profiles%rowtype;
  private_row public.employee_private_profiles%rowtype;
  cleaned_personal_phone text := nullif(btrim(coalesce(personal_phone, '')), '');
  relationship text;
begin
  select * into employee_row
  from public.employee_profiles
  where id = target_employee_id
    and workspace_id = target_workspace_id
    and archived_at is null;

  if employee_row.id is null then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;

  -- The one rule: your own record, whoever you are here.
  if employee_row.user_id is distinct from actor_user_id then
    raise exception 'this record belongs to somebody else' using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(contact_name, ''))) < 1
    or char_length(btrim(coalesce(contact_phone, ''))) < 7 then
    raise exception 'an emergency contact needs a name and a phone number'
      using errcode = '22023';
  end if;
  -- The column allows nothing shorter, and a half-typed number here would be
  -- refused by the constraint with nowhere to read the refusal.
  if cleaned_personal_phone is not null
    and char_length(cleaned_personal_phone) < 7 then
    raise exception 'a personal phone number is too short to reach anybody'
      using errcode = '22023';
  end if;

  select * into private_row
  from public.employee_private_profiles
  where employee_id = employee_row.id
  for update;
  if private_row.employee_id is null then
    raise exception 'there is no legal name on file for this record yet'
      using errcode = '23514';
  end if;

  relationship := coalesce(
    nullif(btrim(coalesce(contact_relationship, '')), ''),
    private_row.emergency_contact_relationship
  );
  if relationship is null then
    raise exception 'an emergency contact needs a relationship' using errcode = '22023';
  end if;

  update public.employee_private_profiles
  set
    phone = coalesce(cleaned_personal_phone, phone),
    emergency_contact_name = btrim(contact_name),
    emergency_contact_relationship = relationship,
    emergency_contact_phone = btrim(contact_phone),
    emergency_contact_email = btrim(coalesce(contact_email, '')),
    updated_at = now()
  where employee_id = employee_row.id;
end;
$$;
