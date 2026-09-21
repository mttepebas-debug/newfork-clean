-- JOIN-008: the record a workspace keeps about the person who created it was
-- guessed, then overwritten, and it arrived late.
--
-- Guessed: the account's one free-text name was cut at the first space, so
-- "Mert Ali Tepebas" filed a last name of "Ali Tepebas", and an account with no
-- name at all became "Workspace Owner". Overwritten: every time setup finished,
-- the guess was written over whatever the employees tab had been corrected to,
-- and the correction was logged as a repair. Late: the record only appeared when
-- setup completed, although the owner is a member from step one.
--
-- It also arrived excluded from the schedule without anyone being asked, which
-- is wrong for the owner who works shifts alongside the team.
create or replace function app_private.ensure_owner_employee_profile(
  target_workspace_id uuid,
  owner_user_id uuid,
  owner_first_name text default null,
  owner_last_name text default null,
  owner_works_shifts boolean default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
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
  -- person. Setup finishing again is not a reason to argue with it.
  if existing_employee_id is not null then
    if owner_works_shifts is not null then
      update public.employee_profiles
      set is_excluded_from_schedule = not owner_works_shifts,
          revision = revision + 1,
          updated_at = now()
      where id = existing_employee_id
        and is_excluded_from_schedule is distinct from not owner_works_shifts;
    end if;
    return existing_employee_id;
  end if;

  -- Only the first record is seeded, and only from what the account actually
  -- said. The last word is the family name; everything before it is the given
  -- name, which is the reading that survives a middle name.
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
    workspace_id, user_id, employee_code, first_name, last_name, preferred_name,
    invitation_email, internal_note, is_remote, is_excluded_from_schedule, created_by
  ) values (
    target_workspace_id,
    owner_user_id,
    'E-' || lpad(next_code::text, 4, '0'),
    left(seeded_first, 80),
    left(seeded_last, 80),
    '',
    owner_email,
    -- An internal note is a manager's sentence about a person. Nothing the
    -- system has to say belongs in it.
    '',
    false,
    not coalesce(owner_works_shifts, false),
    owner_user_id
  )
  returning id into existing_employee_id;

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
$function$;

CREATE OR REPLACE FUNCTION app_private.apply_owner_onboarding_update(actor_user_id uuid, target_workspace_id uuid, workspace_name text, next_step smallint, mark_complete boolean DEFAULT false, expected_revision integer DEFAULT NULL::integer, owner_first_name text DEFAULT NULL::text, owner_last_name text DEFAULT NULL::text, owner_works_shifts boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
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
  perform app_private.ensure_owner_employee_profile(
    target_workspace_id,
    actor_user_id,
    owner_first_name,
    owner_last_name,
    owner_works_shifts
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

-- The service the API calls carries the three new answers through.
create or replace function public.update_owner_onboarding_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  workspace_name text,
  next_step smallint,
  mark_complete boolean,
  expected_revision integer,
  owner_first_name text default null,
  owner_last_name text default null,
  owner_works_shifts boolean default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform app_private.apply_owner_onboarding_update(
    actor_user_id,
    target_workspace_id,
    workspace_name,
    next_step,
    mark_complete,
    expected_revision,
    owner_first_name,
    owner_last_name,
    owner_works_shifts
  );
end;
$function$;

-- The six-argument form accepted exactly the names the new one does, so a call
-- naming those six could match either and PostgREST would refuse it. The new
-- one defaults the three additions, so it answers everything the old one did.
drop function if exists public.update_owner_onboarding_service(uuid, uuid, text, smallint, boolean, integer);

-- A definer-rights function that writes another account's setup is not for
-- anyone holding an anon key. It is reached through the API, as before.
revoke all on function public.update_owner_onboarding_service(uuid, uuid, text, smallint, boolean, integer, text, text, boolean) from public, anon, authenticated;
grant execute on function public.update_owner_onboarding_service(uuid, uuid, text, smallint, boolean, integer, text, text, boolean) to service_role;
revoke all on function app_private.ensure_owner_employee_profile(uuid, uuid, text, text, boolean) from public, anon, authenticated;

-- The two-argument form still carried the old guessing body, and a two-argument
-- call would have reached it.
drop function if exists app_private.ensure_owner_employee_profile(uuid, uuid);

-- Same for the helper it calls: the six-argument form is now shadowed by the
-- nine-argument one, and a six-argument call would be ambiguous.
drop function if exists app_private.apply_owner_onboarding_update(uuid, uuid, text, smallint, boolean, integer);
