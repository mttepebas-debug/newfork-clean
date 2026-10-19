-- ROL-CIFT 1.4: the services that still named the dropped membership role read the two slots, so the
-- product (and the test world built through it) can make members again (KARARLAR S-164 ... S-169;
-- design §5.1).
--
-- Until the invitation (slice 6) and the access change (slice 4) name both slots, the flows that hand
-- somebody one role place it the way the move placed today's people (design §5.1), in one helper:
--   employee class role  -> the employee slot
--   management role      -> the management slot, plus the employee slot when the person works a job
--                           outside Management; a manager manages where they work; Management jobs
--                           from their jobs, else Manager / General Manager / the Owner job.
-- And until the drawer writes Manages (slice 6.3), a manager's Manages follows their location
-- assignments, as a manager's reach did before (manages_follow_works). Both are deleted in slices 4 and 6
-- (dilim 4 ve 6'da silinir: place_single_role with 4.1 and 6.1, manages_follow_works with 6.3) and join
-- retired_objects_stay_gone there.
--
-- Where a screen shows one role (employees list, detail, account, roles in use) it shows the management
-- slot's, else the employee slot's.
--
-- Riskli canlı migration (CREATE OR REPLACE of services, invitation acceptance, ownership transfer):
-- goes live with the rest of slice 1.

-- A manager's Manages = the live locations they work at (ponytail: slice 6.3 drops this).
create function app_private.manages_follow_works(target_membership uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member public.workspace_memberships;
  profile_id uuid;
begin
  select * into member from public.workspace_memberships m where m.id = target_membership;
  if member.id is null or app_private.role_class(member.role_id) is distinct from 'manager' then
    return;
  end if;
  select p.id into profile_id from public.employee_profiles p
  where p.workspace_id = member.workspace_id and p.user_id = member.user_id and p.archived_at is null;

  delete from public.membership_managed_locations managed
  where managed.membership_id = member.id
    and not exists (
      select 1 from public.employee_location_assignments a
      where a.employee_id = profile_id and a.location_id = managed.location_id and a.ended_at is null);
  insert into public.membership_managed_locations (workspace_id, membership_id, location_id)
  select member.workspace_id, member.id, a.location_id
  from public.employee_location_assignments a
  join public.locations l on l.id = a.location_id and app_private.location_is_live(l)
  where a.employee_id = profile_id and a.ended_at is null
  on conflict (membership_id, location_id) do nothing;
end;
$$;
revoke all on function app_private.manages_follow_works(uuid) from public, anon, authenticated;

create function app_private.manages_follow_works_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data public.employee_location_assignments := coalesce(new, old);
begin
  perform app_private.manages_follow_works(m.id)
  from public.employee_profiles p
  join public.workspace_memberships m on m.workspace_id = p.workspace_id and m.user_id = p.user_id
  where p.id = row_data.employee_id;
  return null;
end;
$$;
revoke all on function app_private.manages_follow_works_trigger() from public, anon, authenticated;

create trigger manages_follow_works
  after insert or delete or update of location_id, ended_at on public.employee_location_assignments
  for each row execute function app_private.manages_follow_works_trigger();

-- And when somebody becomes a manager, they manage where they already work.
create function app_private.manages_follow_works_for_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.manages_follow_works(new.id);
  return null;
end;
$$;
revoke all on function app_private.manages_follow_works_for_member() from public, anon, authenticated;

create trigger manages_follow_works_for_member
  after insert or update of role_id on public.workspace_memberships
  for each row execute function app_private.manages_follow_works_for_member();

-- One role handed over by today's flows, placed in the two slots (design §5.1).
create function app_private.place_single_role(target_membership uuid, chosen_role uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member public.workspace_memberships;
  chosen_class public.workspace_role;
  profile_id uuid;
  works boolean;
  asked text := current_setting('app.membership_change', true);
begin
  select * into member from public.workspace_memberships m where m.id = target_membership;
  select r.access_class into chosen_class from public.workspace_roles r
  where r.id = chosen_role and r.workspace_id = member.workspace_id;
  if member.id is null or chosen_class is null then
    raise exception 'role must belong to the workspace' using errcode = '23503';
  end if;
  -- Nobody becomes the owner this way (an invitation reopening a suspended account, a role change, a
  -- restored access): only an ownership transfer makes an owner, as the membership guard says.
  if chosen_class = 'owner' and member.role_id is distinct from chosen_role then
    raise exception 'membership change is not permitted' using errcode = '42501', hint = 'authz.missing_permission';
  end if;
  select p.id into profile_id from public.employee_profiles p
  where p.workspace_id = member.workspace_id and p.user_id = member.user_id and p.archived_at is null;
  works := chosen_class = 'employee' or exists (
    select 1 from public.employee_job_assignments a
    join public.jobs j on j.id = a.job_id and j.deleted_at is null
    left join public.departments d on d.id = j.department_id
    where a.employee_id = profile_id and a.ended_at is null and d.system_key is distinct from 'management');

  perform set_config('app.membership_change', member.id::text, true);
  update public.workspace_memberships
  set role_id = case when chosen_class = 'employee' then null else chosen_role end,
      employee_role_id = case
        when chosen_class = 'employee' then chosen_role
        when works then coalesce(member.employee_role_id, (
          select r.id from public.workspace_roles r where r.workspace_id = member.workspace_id and r.system_key = 'employee'))
      end,
      updated_at = now()
  where id = member.id;

  perform app_private.manages_follow_works(member.id);

  if chosen_class <> 'employee' then
    insert into public.membership_management_jobs (workspace_id, membership_id, job_id)
    select member.workspace_id, member.id, a.job_id
    from public.employee_job_assignments a
    join public.jobs j on j.id = a.job_id and j.archived_at is null and j.deleted_at is null
    join public.departments d on d.id = j.department_id and d.system_key = 'management'
    where a.employee_id = profile_id and a.ended_at is null
      and (j.system_key is null or chosen_class = 'owner')
    on conflict (membership_id, job_id) do nothing;
    if not exists (select 1 from public.membership_management_jobs x where x.membership_id = member.id) then
      insert into public.membership_management_jobs (workspace_id, membership_id, job_id)
      select member.workspace_id, member.id, j.id
      from public.jobs j
      join public.departments d on d.id = j.department_id and d.system_key = 'management'
      where j.workspace_id = member.workspace_id and j.archived_at is null and j.deleted_at is null
        and (j.system_key is null or chosen_class = 'owner')
      order by case
        when chosen_class = 'owner' and j.system_key = 'owner' then 0
        when lower(j.name) = 'manager' then 1
        when lower(j.name) = 'general manager' then 2
        else 3 end, lower(j.name)
      limit 1;
    end if;
  end if;
  perform set_config('app.membership_change', coalesce(asked, ''), true);
end;
$$;
revoke all on function app_private.place_single_role(uuid, uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION "app_private"."apply_owner_onboarding_update"("actor_user_id" "uuid", "target_workspace_id" "uuid", "workspace_name" "text", "next_step" smallint, "mark_complete" boolean DEFAULT false, "expected_revision" integer DEFAULT NULL::integer, "owner_first_name" "text" DEFAULT NULL::"text", "owner_middle_name" "text" DEFAULT NULL::"text", "owner_last_name" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
      and app_private.role_class(membership.role_id) = 'owner'
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
    raise exception 'owner onboarding revision conflict' using errcode = 'PT409', hint = 'workspace.onboarding_changed';
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
      and department.system_key is null
  ) then
    raise exception 'at least one department of your own is required to complete owner onboarding' using errcode = '23514';
  end if;

  if mark_complete and not exists (
    select 1
    from public.jobs job
    left join public.departments department on department.id = job.department_id
    where job.workspace_id = target_workspace_id
      and job.archived_at is null
      and department.system_key is distinct from 'management'
  ) then
    raise exception 'at least one job outside Management is required to complete owner onboarding' using errcode = '23514';
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

  -- No names sent and none on file: the first step has not been answered.
  if not names_given and not exists (
    select 1
    from public.employee_profiles employee
    join public.employee_private_profiles private_profile
      on private_profile.employee_id = employee.id
    where employee.workspace_id = target_workspace_id
      and employee.user_id = actor_user_id
      and employee.archived_at is null
  ) then
    raise exception 'the owner''s legal name is required' using errcode = '23514';
  end if;

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

  -- Management, Owner and Manager exist from the first save, so the setup steps
  -- and Settings show them; nothing under Management counts as the owner's own
  -- department and job (K2).
  perform app_private.ensure_management_and_owner(target_workspace_id);

  -- Locations come into existence during setup, so this runs on every save and
  -- picks up whatever was added since the last one.
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
$$;

CREATE OR REPLACE FUNCTION "app_private"."ensure_owner_employee_profile"("target_workspace_id" "uuid", "owner_user_id" "uuid", "owner_first_name" "text" DEFAULT NULL::"text", "owner_middle_name" "text" DEFAULT NULL::"text", "owner_last_name" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  existing_employee_id uuid;
  next_code bigint;
  owner_email text;
  given_name text := btrim(coalesce(owner_first_name, ''));
  family_name text := btrim(coalesce(owner_last_name, ''));
begin
  if not exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = owner_user_id
      and app_private.role_class(membership.role_id) = 'owner'
      and membership.status = 'active'::public.membership_status
  ) then
    raise exception 'active owner membership required' using errcode = '42501';
  end if;

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

  if given_name = '' or family_name = '' then
    raise exception 'a legal name needs a first and a last name' using errcode = '22023';
  end if;

  select lower(auth_user.email) into owner_email
  from auth.users auth_user
  where auth_user.id = owner_user_id;

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
    -- Too long is refused with the legal name's own words right after this.
    left(given_name, 80),
    left(btrim(coalesce(owner_middle_name, '')), 80),
    left(family_name, 80),
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
$_$;

CREATE OR REPLACE FUNCTION "app_private"."open_owner_records_to_new_entity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  owner_record record;
begin
  -- An archived location or job is not somewhere anybody works.
  if new.archived_at is not null then
    return new;
  end if;

  for owner_record in
    select employee.id as employee_id, employee.user_id
    from public.employee_profiles employee
    join public.workspace_memberships membership
      on membership.workspace_id = employee.workspace_id
     and membership.user_id = employee.user_id
    where employee.workspace_id = new.workspace_id
      and employee.archived_at is null
      and app_private.role_class(membership.role_id) = 'owner'
      and membership.status = 'active'::public.membership_status
  loop
    perform app_private.open_owner_record_to_everything(
      new.workspace_id,
      owner_record.employee_id,
      owner_record.user_id
    );
  end loop;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."prevent_owner_employee_archive"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.archived_at is not null
    and old.archived_at is distinct from new.archived_at
    and old.user_id is not null
    and exists (
      select 1
      from public.workspace_memberships membership
      where membership.workspace_id = old.workspace_id
        and membership.user_id = old.user_id
        and app_private.role_class(membership.role_id) = 'owner'
    ) then
    raise exception 'owner employee record cannot be archived through ordinary lifecycle'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."set_active_workspace_when_owner_onboarding_completes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.status <> 'complete'::public.onboarding_status then
    return new;
  end if;

  if not exists (
    select 1
    from public.workspace_memberships membership
    join public.workspaces workspace
      on workspace.id = membership.workspace_id
    where membership.workspace_id = new.workspace_id
      and membership.user_id = new.updated_by
      and app_private.role_class(membership.role_id) = 'owner'
      and membership.status = 'active'::public.membership_status
      and workspace.lifecycle_status = 'active'::public.workspace_lifecycle_status
  ) then
    return new;
  end if;

  insert into public.user_workspace_preferences (user_id, active_workspace_id, updated_at)
  values (new.updated_by, new.workspace_id, now())
  on conflict (user_id) do update
    set active_workspace_id = excluded.active_workspace_id,
        updated_at = excluded.updated_at;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."create_owner_workspace"("workspace_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  actor_id uuid := (select auth.uid());
  existing_workspace_id uuid;
  created_workspace_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if char_length(btrim(workspace_name)) not between 1 and 120 then
    raise exception 'workspace name must be between 1 and 120 characters' using errcode = '22023';
  end if;

  select workspace.id
  into existing_workspace_id
  from public.workspaces workspace
  join public.workspace_memberships membership
    on membership.workspace_id = workspace.id
   and membership.user_id = actor_id
   and app_private.role_class(membership.role_id) = 'owner'
   and membership.status = 'active'::public.membership_status
  join public.workspace_onboarding onboarding
    on onboarding.workspace_id = workspace.id
   and onboarding.status = 'incomplete'::public.onboarding_status
  order by workspace.created_at desc
  limit 1;

  if existing_workspace_id is not null then
    update public.workspaces
    set name = btrim(workspace_name), updated_at = now()
    where id = existing_workspace_id;

    insert into public.audit_events (
      workspace_id, actor_user_id, action, target_type, target_id
    ) values (
      existing_workspace_id, actor_id, 'workspace.draft_resumed', 'workspace', existing_workspace_id::text
    );

    return existing_workspace_id;
  end if;

  insert into public.workspaces (name, created_by)
  values (btrim(workspace_name), actor_id)
  returning id into created_workspace_id;

  insert into public.workspace_memberships (workspace_id, user_id, role_id)
  select created_workspace_id, actor_id, r.id from public.workspace_roles r
  where r.workspace_id = created_workspace_id and r.system_key = 'owner';

  insert into public.workspace_onboarding (workspace_id, updated_by)
  values (created_workspace_id, actor_id);

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id
  ) values (
    created_workspace_id, actor_id, 'workspace.created', 'workspace', created_workspace_id::text
  );

  return created_workspace_id;
end;
$$;
