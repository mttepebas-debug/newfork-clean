-- JOIN-012: asking the owner in a checkbox whether they work shifts was the
-- wrong shape of question. Everyone else in a workspace has an employee record
-- with every location and every job open to them, and hides from the schedule
-- by ticking Exclude in their own row. The owner now arrives the same way, and
-- the question the wizard asked is deleted rather than answered.
--
-- The name typed at sign-up is the person's legal name, so it fills the legal
-- name as well as the record the team sees.
create or replace function app_private.ensure_owner_employee_profile(
  target_workspace_id uuid,
  owner_user_id uuid,
  owner_first_name text default null,
  owner_last_name text default null
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
$function$;

drop function if exists app_private.ensure_owner_employee_profile(uuid, uuid, text, text, boolean);
revoke all on function app_private.ensure_owner_employee_profile(uuid, uuid, text, text) from public, anon, authenticated;

-- Every location and every job, the way a manager adding somebody by hand would
-- leave it. Setup is where they first exist, so this runs as each step saves
-- and again at the end, picking up whatever was added since.
create or replace function app_private.open_owner_record_to_everything(
  target_workspace_id uuid,
  owner_employee_id uuid,
  actor_user_id uuid
)
returns void
language sql
security definer
set search_path to ''
as $function$
  with opened_locations as (
    insert into public.employee_location_assignments (
      workspace_id, employee_id, location_id, created_by
    )
    select target_workspace_id, owner_employee_id, location.id, actor_user_id
    from public.locations location
    where location.workspace_id = target_workspace_id
      and location.archived_at is null
      and not exists (
        select 1
        from public.employee_location_assignments assignment
        where assignment.employee_id = owner_employee_id
          and assignment.location_id = location.id
          and assignment.ended_at is null
      )
    returning 1
  )
  insert into public.employee_job_assignments (
    workspace_id, employee_id, job_id, created_by
  )
  select target_workspace_id, owner_employee_id, job.id, actor_user_id
  from public.jobs job
  where job.workspace_id = target_workspace_id
    and job.archived_at is null
    and not exists (
      select 1
      from public.employee_job_assignments assignment
      where assignment.employee_id = owner_employee_id
        and assignment.job_id = job.id
        and assignment.ended_at is null
    );
$function$;

revoke all on function app_private.open_owner_record_to_everything(uuid, uuid, uuid) from public, anon, authenticated;

-- The wizard no longer asks, so the helper no longer takes an answer, and the
-- owner's record is opened to every location and job as setup creates them.
drop function if exists app_private.apply_owner_onboarding_update(uuid, uuid, text, smallint, boolean, integer, text, text, boolean);

CREATE OR REPLACE FUNCTION app_private.apply_owner_onboarding_update(actor_user_id uuid, target_workspace_id uuid, workspace_name text, next_step smallint, mark_complete boolean DEFAULT false, expected_revision integer DEFAULT NULL::integer, owner_first_name text DEFAULT NULL::text, owner_last_name text DEFAULT NULL::text)
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

drop function if exists public.update_owner_onboarding_service(uuid, uuid, text, smallint, boolean, integer, text, text, boolean);
create function public.update_owner_onboarding_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  workspace_name text,
  next_step smallint,
  mark_complete boolean,
  expected_revision integer,
  owner_first_name text default null,
  owner_last_name text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform app_private.apply_owner_onboarding_update(
    actor_user_id, target_workspace_id, workspace_name, next_step,
    mark_complete, expected_revision, owner_first_name, owner_last_name
  );
end;
$function$;

revoke all on function public.update_owner_onboarding_service(uuid, uuid, text, smallint, boolean, integer, text, text) from public, anon, authenticated;
grant execute on function public.update_owner_onboarding_service(uuid, uuid, text, smallint, boolean, integer, text, text) to service_role;
