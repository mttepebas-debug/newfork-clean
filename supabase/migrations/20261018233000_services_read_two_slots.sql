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
-- assignments, as a manager's reach did before (manages_follow_works). Both go when those slices land.
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
  if member.id is null or not exists (
    select 1 from public.workspace_roles r where r.id = member.role_id and r.access_class = 'manager'
  ) then
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
      and exists (select 1 from public.workspace_roles owner_check where owner_check.id = membership.role_id and owner_check.access_class = 'owner')
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
      and exists (select 1 from public.workspace_roles owner_check where owner_check.id = membership.role_id and owner_check.access_class = 'owner')
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
      and exists (select 1 from public.workspace_roles owner_check where owner_check.id = membership.role_id and owner_check.access_class = 'owner')
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
        and exists (select 1 from public.workspace_roles owner_check where owner_check.id = membership.role_id and owner_check.access_class = 'owner')
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
      and exists (select 1 from public.workspace_roles owner_check where owner_check.id = membership.role_id and owner_check.access_class = 'owner')
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
   and exists (select 1 from public.workspace_roles owner_check where owner_check.id = membership.role_id and owner_check.access_class = 'owner')
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

CREATE OR REPLACE FUNCTION "public"."cancel_workspace_closure_service"("actor_user_id" "uuid", "target_workspace_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  workspace_row public.workspaces%rowtype;
  actor_role public.workspace_role;
  request_id uuid;
  effective_at timestamptz;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501', hint = 'actor.required';
  end if;
  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  select * into workspace_row
  from public.workspaces
  where id = target_workspace_id
  for update;

  if workspace_row.id is null or workspace_row.lifecycle_status = 'deleted' then
    raise exception 'workspace not found' using errcode = '02000', hint = 'workspace.not_found';
  end if;

  select coalesce(role.access_class, 'employee'::public.workspace_role) into actor_role
  from public.workspace_memberships membership
  left join public.workspace_roles role
    on role.id = membership.role_id
   and role.workspace_id = membership.workspace_id
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active'
  limit 1;

  if actor_role is distinct from 'owner'::public.workspace_role then
    raise exception 'workspace owner access required' using errcode = '42501', hint = 'workspace.owner_required';
  end if;

  if workspace_row.lifecycle_status <> 'closure_scheduled' then
    raise exception 'workspace closure is not scheduled' using errcode = '23514', hint = 'workspace.closure.not_scheduled';
  end if;

  update public.workspace_closure_requests r
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = actor_user_id,
      updated_at = now()
  where r.workspace_id = target_workspace_id
    and r.status = 'scheduled'
  returning r.id, r.effective_at into request_id, effective_at;

  update public.workspaces
  set lifecycle_status = 'active',
      closure_scheduled_at = null,
      closure_effective_at = null,
      closed_at = null,
      closed_by = null,
      updated_at = now()
  where id = target_workspace_id;

  insert into public.audit_events (
    workspace_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    target_workspace_id,
    actor_user_id,
    'workspace.closure.cancelled',
    'workspace',
    target_workspace_id::text,
    jsonb_build_object('closure_request_id', request_id)
  );

  perform app_private.notify_workspace_closing(target_workspace_id, actor_user_id, request_id, effective_at, true);

  return jsonb_build_object(
    'status', 'cancelled',
    'workspace_id', target_workspace_id,
    'closure_request_id', request_id
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."initiate_workspace_ownership_transfer_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  workspace_row public.workspaces%rowtype;
  actor_membership public.workspace_memberships%rowtype;
  target_membership public.workspace_memberships%rowtype;
  target_access public.workspace_role;
  target_email_verified boolean;
  target_onboarding_blocked boolean;
  transfer_id uuid;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.transfer_ownership');

  if actor_user_id is null or target_user_id is null then
    raise exception 'valid actor and target required' using errcode = '42501', hint = 'actor.required';
  end if;
  if actor_user_id = target_user_id then
    raise exception 'ownership transfer target must be another account' using errcode = '23514', hint = 'transfer.target_is_self';
  end if;

  select * into workspace_row
  from public.workspaces
  where id = target_workspace_id
  for update;

  if workspace_row.id is null or workspace_row.lifecycle_status <> 'active' then
    raise exception 'workspace not found' using errcode = '02000', hint = 'workspace.not_found';
  end if;

  select membership.* into actor_membership
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active'
  limit 1;

  if exists (
    select 1
    from public.workspace_ownership_transfers transfer
    where transfer.workspace_id = target_workspace_id
      and transfer.status = 'pending'
  ) then
    raise exception 'pending ownership transfer already exists' using errcode = '23505', hint = 'transfer.already_pending';
  end if;

  select membership.* into target_membership
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = target_user_id
    and membership.status = 'active'
  limit 1
  for update;

  select coalesce(role.access_class, 'employee'::public.workspace_role) into target_access
  from public.workspace_memberships membership
  left join public.workspace_roles role
    on role.id = membership.role_id
   and role.workspace_id = membership.workspace_id
  where membership.workspace_id = target_workspace_id
    and membership.user_id = target_user_id
    and membership.status = 'active'
  limit 1;

  if target_membership.id is null or target_access is distinct from 'admin'::public.workspace_role then
    raise exception 'ownership transfer target must be an active admin' using errcode = '23514', hint = 'transfer.target_not_admin';
  end if;

  select exists (
    select 1
    from auth.users target_user
    where target_user.id = target_user_id
      and target_user.email_confirmed_at is not null
  ) into target_email_verified;
  if not target_email_verified then
    raise exception 'ownership transfer target must have a verified email' using errcode = '23514', hint = 'transfer.target_email_unverified';
  end if;

  select exists (
    select 1
    from public.employee_onboarding_cases onboarding
    where onboarding.workspace_id = target_workspace_id
      and onboarding.membership_id = target_membership.id
      and onboarding.status <> 'approved'
  ) into target_onboarding_blocked;
  if target_onboarding_blocked then
    raise exception 'ownership transfer target must have completed onboarding' using errcode = '23514', hint = 'transfer.target_onboarding_incomplete';
  end if;

  -- The owner's legal name is required (BL-080), so ownership only goes to
  -- somebody whose legal name is already on file here.
  if not exists (
    select 1
    from public.employee_profiles employee
    join public.employee_private_profiles private_profile
      on private_profile.employee_id = employee.id
    where employee.workspace_id = target_workspace_id
      and employee.user_id = target_user_id
      and employee.archived_at is null
  ) then
    raise exception 'the new owner has no legal name on file yet' using errcode = '23514', hint = 'transfer.target_legal_name_missing';
  end if;

  insert into public.workspace_ownership_transfers (
    workspace_id,
    initiated_by,
    target_user_id,
    previous_owner_membership_id,
    target_membership_id
  )
  values (
    target_workspace_id,
    actor_user_id,
    target_user_id,
    actor_membership.id,
    target_membership.id
  )
  returning id into transfer_id;

  insert into public.audit_events (
    workspace_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    target_workspace_id,
    actor_user_id,
    'workspace.ownership_transfer.initiated',
    'workspace_ownership_transfer',
    transfer_id::text,
    jsonb_build_object('target_user_id', target_user_id)
  );

  -- The admin it names is asked (ownership_tell).
  perform app_private.ownership_tell((select t from public.workspace_ownership_transfers t where t.id = transfer_id),
    'initiated', actor_user_id);

  return jsonb_build_object(
    'status', 'pending',
    'transfer_id', transfer_id,
    'workspace_id', target_workspace_id,
    'target_user_id', target_user_id
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."request_workspace_closure_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "closure_mode" "text", "typed_workspace_name" "text" DEFAULT NULL::"text", "acknowledged" boolean DEFAULT false, "target_effective_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  workspace_row public.workspaces%rowtype;
  actor_role public.workspace_role;
  request_id uuid;
  effective_at timestamptz;
  revocation jsonb;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501', hint = 'actor.required';
  end if;
  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  if not acknowledged then
    raise exception 'workspace closure requires explicit acknowledgement' using errcode = '23514', hint = 'workspace.closure.acknowledgement_required';
  end if;
  if closure_mode not in ('scheduled_end_period', 'immediate') then
    raise exception 'valid workspace closure mode required' using errcode = '22023', hint = 'workspace.closure.mode_invalid';
  end if;

  select * into workspace_row
  from public.workspaces
  where id = target_workspace_id
  for update;

  if workspace_row.id is null or workspace_row.lifecycle_status = 'deleted' then
    raise exception 'workspace not found' using errcode = '02000', hint = 'workspace.not_found';
  end if;

  select coalesce(role.access_class, 'employee'::public.workspace_role) into actor_role
  from public.workspace_memberships membership
  left join public.workspace_roles role
    on role.id = membership.role_id
   and role.workspace_id = membership.workspace_id
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active'
  limit 1;

  if actor_role is distinct from 'owner'::public.workspace_role then
    raise exception 'workspace owner access required' using errcode = '42501', hint = 'workspace.owner_required';
  end if;

  if closure_mode = 'immediate' then
    if typed_workspace_name is distinct from workspace_row.name then
      raise exception 'workspace name confirmation does not match' using errcode = '23514', hint = 'workspace.closure.name_mismatch';
    end if;

    update public.workspace_closure_requests
    set status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = actor_user_id,
        updated_at = now()
    where workspace_id = target_workspace_id
      and status = 'scheduled';

    insert into public.workspace_closure_requests (
      workspace_id,
      requested_by,
      mode,
      status,
      typed_workspace_name,
      effective_at,
      completed_at,
      metadata
    )
    values (
      target_workspace_id,
      actor_user_id,
      'immediate',
      'completed',
      typed_workspace_name,
      now(),
      now(),
      jsonb_build_object('unrecoverable_by_user', true)
    )
    returning id into request_id;

    revocation := app_private.finish_workspace_closure(
      target_workspace_id, actor_user_id, request_id, now(), 'immediate'
    );

    return jsonb_build_object(
      'status', 'deleted',
      'workspace_id', target_workspace_id,
      'closure_request_id', request_id,
      'runtime_revocation', revocation
    );
  end if;

  effective_at := coalesce(target_effective_at, now() + app_private.default_closure_period());
  if effective_at <= now() then
    raise exception 'scheduled workspace closure requires a future effective time'
      using errcode = '23514', hint = 'workspace.closure.effective_at_past';
  end if;

  update public.workspace_closure_requests
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = actor_user_id,
      updated_at = now()
  where workspace_id = target_workspace_id
    and status = 'scheduled';

  insert into public.workspace_closure_requests (
    workspace_id,
    requested_by,
    mode,
    status,
    effective_at
  )
  values (
    target_workspace_id,
    actor_user_id,
    'scheduled_end_period',
    'scheduled',
    effective_at
  )
  returning id into request_id;

  update public.workspaces
  set lifecycle_status = 'closure_scheduled',
      closure_scheduled_at = now(),
      closure_effective_at = effective_at,
      closed_at = null,
      closed_by = null,
      updated_at = now()
  where id = target_workspace_id;

  insert into public.audit_events (
    workspace_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    target_workspace_id,
    actor_user_id,
    'workspace.closure.scheduled',
    'workspace',
    target_workspace_id::text,
    jsonb_build_object('closure_request_id', request_id, 'effective_at', effective_at)
  );

  perform app_private.notify_workspace_closing(target_workspace_id, actor_user_id, request_id, effective_at, false);

  return jsonb_build_object(
    'status', 'scheduled',
    'workspace_id', target_workspace_id,
    'closure_request_id', request_id,
    'effective_at', effective_at
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."cancel_workspace_ownership_transfer_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "transfer_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare transfer_row public.workspace_ownership_transfers%rowtype;
begin
  -- Same workspace -> transfer lock order as initiate/accept, to serialize races.
  perform 1 from public.workspaces where id = target_workspace_id for update;
  if actor_user_id is null or not exists (
    select 1 from public.workspace_memberships m
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    where m.workspace_id = target_workspace_id and m.user_id = actor_user_id
      and m.status = 'active' and r.access_class = 'owner'
  ) then raise exception 'workspace owner access required' using errcode = '42501', hint = 'workspace.owner_required'; end if;
  select * into transfer_row from public.workspace_ownership_transfers t
    where t.id = transfer_id and t.workspace_id = target_workspace_id for update;
  if transfer_row.id is null or transfer_row.status <> 'pending' then
    raise exception 'pending ownership transfer not found' using errcode = '02000', hint = 'transfer.not_found';
  end if;
  if transfer_row.initiated_by <> actor_user_id then
    raise exception 'ownership transfer initiator access required' using errcode = '42501', hint = 'transfer.initiator_required';
  end if;
  update public.workspace_ownership_transfers set status = 'cancelled', cancelled_at = now(),
    cancelled_by = actor_user_id, updated_at = now() where id = transfer_row.id;
  insert into public.audit_events(workspace_id, actor_user_id, action, target_type, target_id)
    values(target_workspace_id, actor_user_id, 'workspace.ownership_transfer.cancelled', 'workspace_ownership_transfer', transfer_row.id::text);
  perform app_private.ownership_tell(transfer_row, 'cancelled', actor_user_id);
  return jsonb_build_object('status', 'cancelled', 'transfer_id', transfer_row.id, 'workspace_id', target_workspace_id);
end; $$;

CREATE OR REPLACE FUNCTION "public"."create_owner_workspace_service"("actor_user_id" "uuid", "workspace_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;
  -- Serialize create attempts for one account, preserving incomplete-draft reuse.
  perform 1 from auth.users where id = actor_user_id for update;
  if not found then raise exception 'authentication required' using errcode = '42501'; end if;
  -- Same email match and expiry filter as list_pending_employee_invitations_for_account_service.
  if not exists (
    select 1 from public.workspace_memberships m
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    where m.user_id = actor_user_id and m.status = 'active'
      and r.access_class = 'owner'
  ) and exists (
    select 1
    from public.employee_invitations invitation
    join auth.users user_row on user_row.id = actor_user_id
    where invitation.email = lower(user_row.email)
      and invitation.status = 'pending'
      and invitation.expires_at > now()
      and not exists (
        select 1 from public.workspace_memberships membership
        where membership.workspace_id = invitation.workspace_id
          and membership.user_id = actor_user_id
      )
  ) then
    raise exception 'pending invitation must be resolved first' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.workspace_memberships m
    where m.user_id = actor_user_id and m.status = 'active'
      and app_private.workspace_allows_interactive_access(m.workspace_id)
  ) and not exists (
    select 1 from public.workspace_memberships m
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    where m.user_id = actor_user_id and m.status = 'active'
      and r.access_class = 'owner'
      and app_private.workspace_allows_interactive_access(m.workspace_id)
  ) then
    raise exception 'workspace owner access required' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  return public.create_owner_workspace(workspace_name);
end; $$;

CREATE OR REPLACE FUNCTION "public"."search_workspace_ownership_candidates_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "search_text" "text") RETURNS TABLE("userId" "uuid", "name" "text", "email" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if actor_user_id is null or not app_private.workspace_allows_interactive_access(target_workspace_id)
    or not exists (
      select 1 from public.workspace_memberships m
      left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
      where m.workspace_id = target_workspace_id and m.user_id = actor_user_id
        and m.status = 'active' and r.access_class = 'owner'
    ) then raise exception 'workspace owner access required' using errcode = '42501', hint = 'workspace.owner_required'; end if;
  if search_text is null or char_length(btrim(search_text)) not between 2 and 80 then
    raise exception 'search must contain 2 to 80 characters' using errcode = '22023', hint = 'search.length_invalid';
  end if;
  return query
    select m.user_id, coalesce(nullif(concat_ws(' ', coalesce(nullif(e.preferred_name, ''), e.first_name), e.last_name), ''), p.display_name, u.email)::text, u.email::text
    from public.workspace_memberships m
    join auth.users u on u.id = m.user_id and u.email_confirmed_at is not null
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    left join public.employee_profiles e on e.workspace_id = m.workspace_id and e.user_id = m.user_id and e.archived_at is null
    left join public.user_profiles p on p.user_id = m.user_id
    where m.workspace_id = target_workspace_id and m.status = 'active'
      and m.user_id <> actor_user_id and r.access_class = 'admin'
      -- Active legacy memberships without an onboarding case are already complete.
      and not exists (select 1 from public.employee_onboarding_cases c
        where c.workspace_id = target_workspace_id and c.membership_id = m.id and c.status <> 'approved')
      -- A legal name on file, or the transfer would be refused (BL-080).
      and exists (select 1 from public.employee_private_profiles private_profile
        where private_profile.employee_id = e.id)
      -- Literal substring matching: '%' and '_' cannot enumerate the directory.
      and position(lower(btrim(search_text)) in lower(concat_ws(' ', e.first_name, e.last_name, e.preferred_name, p.display_name, u.email))) > 0
    order by 2, m.user_id limit 10;
end; $$;

CREATE OR REPLACE FUNCTION "public"."respond_workspace_ownership_transfer_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "transfer_id" "uuid", "transfer_action" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  transfer_row public.workspace_ownership_transfers%rowtype;
  owner_role_id uuid;
  admin_role_id uuid;
  owed public.employee_onboarding_requirements%rowtype;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501', hint = 'actor.required';
  end if;
  if transfer_action not in ('accept', 'reject') then
    raise exception 'valid ownership transfer action required' using errcode = '22023', hint = 'transfer.action_invalid';
  end if;

  perform 1 from public.workspaces where id = target_workspace_id for update;

  select * into transfer_row
  from public.workspace_ownership_transfers transfer
  where transfer.id = transfer_id
    and transfer.workspace_id = target_workspace_id
  for update;

  if transfer_row.id is null or transfer_row.status <> 'pending' then
    raise exception 'pending ownership transfer not found' using errcode = '02000', hint = 'transfer.not_found';
  end if;
  if transfer_row.target_user_id <> actor_user_id then
    raise exception 'ownership transfer target access required' using errcode = '42501', hint = 'transfer.target_required';
  end if;
  if transfer_row.expires_at <= now() then
    update public.workspace_ownership_transfers
    set status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = actor_user_id,
        updated_at = now()
    where id = transfer_row.id;
    raise exception 'ownership transfer has expired' using errcode = '23514', hint = 'transfer.expired';
  end if;

  if transfer_action = 'reject' then
    update public.workspace_ownership_transfers
    set status = 'rejected',
        rejected_at = now(),
        updated_at = now()
    where id = transfer_row.id;

    insert into public.audit_events (
      workspace_id,
      actor_user_id,
      action,
      target_type,
      target_id
    )
    values (
      target_workspace_id,
      actor_user_id,
      'workspace.ownership_transfer.rejected',
      'workspace_ownership_transfer',
      transfer_id::text
    );

    perform app_private.ownership_tell(transfer_row, 'declined', actor_user_id);
    return jsonb_build_object(
      'status', 'rejected',
      'transfer_id', transfer_id,
      'workspace_id', target_workspace_id
    );
  end if;

  if not app_private.workspace_allows_interactive_access(target_workspace_id) or not exists (
    select 1 from public.workspace_memberships m
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    join auth.users u on u.id = m.user_id and u.email_confirmed_at is not null
    where m.id = transfer_row.target_membership_id and m.workspace_id = target_workspace_id
      and m.user_id = actor_user_id and m.status = 'active' and r.access_class = 'admin'
      and not exists (select 1 from public.employee_onboarding_cases c
        where c.membership_id = m.id and c.workspace_id = m.workspace_id and c.status <> 'approved')
      -- The owner works the Owner job on their own record (BL-252), so only
      -- somebody with a live record here takes ownership.
      and exists (select 1 from public.employee_profiles employee
        where employee.workspace_id = m.workspace_id and employee.user_id = m.user_id
          and employee.archived_at is null)
  ) or not exists (
    select 1 from public.workspace_memberships m
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    where m.id = transfer_row.previous_owner_membership_id and m.workspace_id = target_workspace_id
      and m.user_id = transfer_row.initiated_by and m.status = 'active' and r.access_class = 'owner'
  ) then raise exception 'ownership transfer participants are no longer eligible' using errcode = '42501', hint = 'transfer.participants_ineligible'; end if;

  select id into owner_role_id
  from public.workspace_roles
  where workspace_id = target_workspace_id
    and system_key = 'owner';

  select id into admin_role_id
  from public.workspace_roles
  where workspace_id = target_workspace_id
    and system_key = 'admin';

  if owner_role_id is null or admin_role_id is null then
    raise exception 'system owner and admin roles are required' using errcode = 'P0002', hint = 'workspace.roles_missing';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  perform set_config('app.owner_transfer', 'on', true);

  update public.workspace_memberships
  set role_id = owner_role_id,
      updated_at = now()
  where id = transfer_row.target_membership_id
    and workspace_id = target_workspace_id
    and status = 'active';

  update public.workspace_memberships
  set role_id = admin_role_id,
      updated_at = now()
  where id = transfer_row.previous_owner_membership_id
    and workspace_id = target_workspace_id
    and status = 'active';

  -- The Owner job moves with ownership (BL-218): off the old owner's record,
  -- onto the new owner's, with every location, in this transaction.
  update public.employee_job_assignments assignment
  set ended_at = now(), is_primary = false
  from public.jobs job
  where job.id = assignment.job_id
    and job.workspace_id = target_workspace_id
    and job.system_key = 'owner'
    and assignment.ended_at is null
    and not app_private.employee_record_is_workspace_owner(target_workspace_id, assignment.employee_id);
  perform app_private.open_owner_record_to_everything(target_workspace_id, employee.id, actor_user_id)
  from public.employee_profiles employee
  where employee.workspace_id = target_workspace_id
    and employee.user_id = actor_user_id
    and employee.archived_at is null;

  -- The new owner is asked for no document from now on, like any owner
  -- (BL-246): what they still owed is excused the way a document reaching an
  -- owner later is, and the document block lifts with it. Each excuse is
  -- recorded like any exemption, as the old owner's are when taken back.
  for owed in
  update public.employee_onboarding_requirements requirement
  set (owner_excused, lifecycle_exempt, required, blocks_activation, deadline_at, lifecycle_close_reason,
       paused_remaining_seconds, document_suspended_at, lifecycle_closed_at) = (
        select excused.owner_excused, excused.lifecycle_exempt, excused.required, excused.blocks_activation,
          excused.deadline_at, excused.lifecycle_close_reason,
          excused.paused_remaining_seconds, excused.document_suspended_at, excused.lifecycle_closed_at
        from app_private.owner_document_excused(requirement) excused
      ),
      lifecycle_revision = requirement.lifecycle_revision + 1,
      updated_at = now()
  from public.employee_profiles employee
  where employee.id = requirement.employee_id
    and employee.workspace_id = target_workspace_id
    and employee.user_id = actor_user_id
    and requirement.workspace_id = target_workspace_id
    and requirement.kind in ('document', 'acknowledgement')
    and not requirement.lifecycle_exempt
    and requirement.lifecycle_retired_at is null
  returning requirement.*
  loop
    perform app_private.document_audit(owed, actor_user_id, 'document.exempted',
      jsonb_build_object('reason', 'Now the owner', 'revision', owed.lifecycle_revision));
  end loop;

  -- The old owner, now an admin, is asked for the documents everyone is
  -- (BL-252): the excuses they had for being the owner are taken back as a
  -- reviewer removes one. A document that is down keeps its excuse until it is
  -- put back up (set_document_publication_service).
  for owed in
    select r.* from public.employee_onboarding_requirements r
    join public.employee_profiles employee on employee.id = r.employee_id
    where r.workspace_id = target_workspace_id
      and employee.workspace_id = target_workspace_id
      and employee.user_id = transfer_row.initiated_by
      and r.kind in ('document', 'acknowledgement')
      and r.owner_excused
      and r.lifecycle_retired_at is null
    for update of r
  loop
    begin
      perform app_private.set_document_exemption(owed, actor_user_id, false, 'No longer the owner', owed.lifecycle_revision);
    exception when sqlstate 'PT409' then
      null;
    end;
  end loop;

  update public.workspace_ownership_transfers
  set status = 'accepted',
      accepted_at = now(),
      updated_at = now()
  where id = transfer_row.id;

  insert into public.audit_events (
    workspace_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    target_workspace_id,
    actor_user_id,
    'workspace.ownership_transfer.accepted',
    'workspace_ownership_transfer',
    transfer_id::text,
    jsonb_build_object(
      'previous_owner_membership_id', transfer_row.previous_owner_membership_id,
      'target_membership_id', transfer_row.target_membership_id
    )
  );

  insert into public.audit_events (
    workspace_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    target_workspace_id,
    actor_user_id,
    'billing.payment_method.detach_required_after_owner_transfer',
    'workspace',
    target_workspace_id::text,
    jsonb_build_object('previous_owner_user_id', transfer_row.initiated_by)
  );

  perform app_private.ownership_tell(transfer_row, 'accepted', actor_user_id);
  return jsonb_build_object(
    'status', 'accepted',
    'transfer_id', transfer_id,
    'workspace_id', target_workspace_id
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."list_my_workspace_identities_service"("actor_user_id" "uuid") RETURNS TABLE("workspace_id" "uuid", "workspace_name" "text", "workspace_role" "public"."workspace_role", "employee_name" "text", "employee_code" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    workspace.id,
    workspace.name,
    coalesce((select slot.access_class from public.workspace_roles slot where slot.id = membership.role_id), 'employee'::public.workspace_role),
    nullif(btrim(coalesce(employee.first_name, '') || ' ' || coalesce(employee.last_name, '')), ''),
    employee.employee_code
  from public.workspace_memberships membership
  join public.workspaces workspace on workspace.id = membership.workspace_id
  left join public.employee_profiles employee
    on employee.workspace_id = membership.workspace_id
   and employee.user_id = membership.user_id
   and employee.archived_at is null
  where membership.user_id = actor_user_id
    and membership.status in (
      'active'::public.membership_status,
      'pending_activation'::public.membership_status
    )
    and workspace.lifecycle_status <> 'deleted'::public.workspace_lifecycle_status
  order by workspace.name;
$$;

CREATE OR REPLACE FUNCTION "public"."list_my_workspaces"() RETURNS TABLE("workspace_id" "uuid", "workspace_name" "text", "workspace_role" "public"."workspace_role", "membership_status" "public"."membership_status", "is_active" boolean, "onboarding_status" "public"."onboarding_status", "onboarding_current_step" smallint, "workspace_lifecycle_status" "public"."workspace_lifecycle_status", "closure_effective_at" timestamp with time zone, "last_used_at" timestamp with time zone, "access_removed" boolean, "pending_ownership_transfer_id" "uuid", "pending_ownership_transfer_role" "text", "pending_ownership_transfer_expires_at" timestamp with time zone, "other_member_count" integer, "pending_invitation_count" integer, "default_closure_effective_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    workspace.id,
    workspace.name,
    coalesce((select slot.access_class from public.workspace_roles slot where slot.id = membership.role_id), 'employee'::public.workspace_role),
    membership.status,
    coalesce(workspace.id = preference.active_workspace_id, false)
      and membership.status = 'active'
      and (
        workspace.lifecycle_status = 'active'
        or (
          workspace.lifecycle_status = 'closure_scheduled'
          and workspace.closure_effective_at > now()
        )
      ),
    coalesce(onboarding.status, 'complete'::public.onboarding_status),
    coalesce(onboarding.current_step, 2::smallint),
    workspace.lifecycle_status,
    workspace.closure_effective_at,
    membership.last_used_at,
    exists (
      select 1
      from public.employee_access_snapshots snapshot
      where snapshot.membership_id = membership.id
        and snapshot.restored_at is null
    ),
    transfer.id,
    case
      when transfer.id is null then null
      when transfer.target_user_id = (select auth.uid()) then 'target'
      else 'initiator'
    end,
    transfer.expires_at,
    -- Everybody else who would lose access, and everybody who has been asked
    -- and not answered. The reader is not counted: they know about themselves,
    -- and what the closing screen has to say is what it costs other people.
    (
      select count(*)
      from public.workspace_memberships other
      where other.workspace_id = workspace.id
        and other.user_id <> membership.user_id
        and other.status in ('active', 'pending_activation')
        and not exists (
          select 1
          from public.employee_profiles employee
          where employee.workspace_id = other.workspace_id
            and employee.user_id = other.user_id
            and employee.archived_at is not null
        )
    )::integer,
    (
      select count(*)
      from public.employee_invitations invitation
      where invitation.workspace_id = workspace.id
        and invitation.status = 'pending'
        and invitation.expires_at > now()
    )::integer,
    -- What a scheduled closure would land on if nobody names a date, so the
    -- panel can say it before anybody commits to anything.
    now() + app_private.default_closure_period()
  from public.workspace_memberships membership
  join public.workspaces workspace on workspace.id = membership.workspace_id
  left join public.user_workspace_preferences preference on preference.user_id = membership.user_id
  left join public.workspace_onboarding onboarding on onboarding.workspace_id = workspace.id
  left join lateral (
    select pending_transfer.id,
           pending_transfer.target_user_id,
           pending_transfer.expires_at
    from public.workspace_ownership_transfers pending_transfer
    where pending_transfer.workspace_id = workspace.id
      and pending_transfer.status = 'pending'
      -- Keep expired requests visible to their sender so they can be cancelled.
      and (pending_transfer.expires_at > now() or pending_transfer.initiated_by = membership.user_id)
      and (
        pending_transfer.initiated_by = membership.user_id
        or pending_transfer.target_user_id = membership.user_id
      )
    order by pending_transfer.created_at desc
    limit 1
  ) transfer on true
  where membership.user_id = (select auth.uid())
    and not exists (
      select 1
      from public.employee_profiles employee
      where employee.workspace_id = membership.workspace_id
        and employee.user_id = membership.user_id
        and employee.archived_at is not null
    )
  order by
    (membership.status = 'active') desc,
    (coalesce(workspace.id = preference.active_workspace_id, false) and membership.status = 'active') desc,
    workspace.name asc;
$$;

CREATE OR REPLACE FUNCTION "public"."resolve_workspace_context_service"("actor_user_id" "uuid", "target_workspace_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("user_id" "uuid", "workspace_id" "uuid", "workspace_name" "text", "workspace_logo_storage_path" "text", "workspace_logo_file_name" "text", "workspace_logo_updated_at" timestamp with time zone, "schedule_logo_scale" numeric, "schedule_logo_offset_x" numeric, "schedule_logo_offset_y" numeric, "membership_id" "uuid", "workspace_role" "public"."workspace_role", "membership_role_id" "uuid", "membership_role_name" "text", "permission_keys" "text"[], "all_locations" boolean, "onboarding_status" "public"."onboarding_status", "onboarding_current_step" smallint, "onboarding_revision" integer, "actions" "text"[], "location_ids" "uuid"[], "document_restricted" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  chosen uuid := target_workspace_id;
  state app_private.actor_state;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  if chosen is null then
    select membership.workspace_id into chosen
    from public.workspace_memberships membership
    left join public.user_workspace_preferences preference on preference.user_id = membership.user_id
    where membership.user_id = actor_user_id
      and membership.status = 'active'
      and (
        membership.workspace_id = preference.active_workspace_id
        or (
          select count(*) from public.workspace_memberships other
          where other.user_id = actor_user_id and other.status = 'active'
        ) = 1
      )
    order by (membership.workspace_id = preference.active_workspace_id) desc nulls last, membership.created_at
    limit 1;
    if chosen is null then
      return;
    end if;
  else
    perform set_config('app.allow_incomplete_workspace_context', 'on', true);
  end if;

  state := app_private.actor(actor_user_id, chosen);

  return query
  select
    membership.user_id,
    workspace.id,
    workspace.name,
    workspace.logo_storage_path,
    workspace.logo_file_name,
    workspace.logo_updated_at,
    workspace.schedule_logo_scale,
    workspace.schedule_logo_offset_x,
    workspace.schedule_logo_offset_y,
    membership.id,
    role.access_class,
    role.id,
    role.name,
    coalesce(
      array_agg(grant_row.permission_key order by permission.sort_order)
        filter (where grant_row.permission_key is not null),
      '{}'::text[]
    ),
    role.access_class in ('owner', 'admin'),
    onboarding.status,
    onboarding.current_step,
    onboarding.revision,
    app_private.actor_actions(state),
    case when role.access_class in ('owner', 'admin') then '{}'::uuid[]
         when role.access_class = 'manager' then state.manages else state.works end,
    state.document_blocked
  from public.workspace_memberships membership
  join public.workspaces workspace
    on workspace.id = membership.workspace_id
  -- The role a screen shows: the management slot's, else the employee slot's (ROL-CIFT 1.4; the
  -- membership's two slots reach the API in 1.5).
  join public.workspace_roles role
    on role.id = coalesce(membership.role_id, membership.employee_role_id)
   and role.workspace_id = membership.workspace_id
  left join public.workspace_role_permissions grant_row
    on grant_row.role_id = role.id
  left join public.permissions permission
    on permission.key = grant_row.permission_key
  join public.workspace_onboarding onboarding
    on onboarding.workspace_id = workspace.id
  where membership.user_id = actor_user_id
    and membership.workspace_id = chosen
    and membership.status = 'active'
    -- ponytail: the workspace they last chose is not checked for being open,
    -- as before; its actions are empty when it is closed (the core refuses).
    and (target_workspace_id is null or app_private.workspace_allows_interactive_access(workspace.id))
  group by
    membership.user_id,
    workspace.id,
    workspace.name,
    workspace.logo_storage_path,
    workspace.logo_file_name,
    workspace.logo_updated_at,
    workspace.schedule_logo_scale,
    workspace.schedule_logo_offset_x,
    workspace.schedule_logo_offset_y,
    membership.id,
    role.access_class,
    role.id,
    role.name,
    onboarding.status,
    onboarding.current_step,
    onboarding.revision;
end;
$$;

CREATE OR REPLACE FUNCTION "app_private"."announcement_respondents"("item" "public"."announcements") RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(array_agg(who order by who), '{}')
  from unnest(app_private.announcement_recipients(item)) who
  where item.ask_ack and item.status = 'published'
    and app_private.authz_rank(coalesce((
      select role.access_class from public.workspace_memberships membership
      join public.workspace_roles role on role.id = coalesce(membership.role_id, membership.employee_role_id) and role.workspace_id = membership.workspace_id
      where membership.workspace_id = item.workspace_id and membership.user_id = who), 'employee'))
    < app_private.authz_rank(coalesce((
      select role.access_class from public.workspace_memberships membership
      join public.workspace_roles role on role.id = coalesce(membership.role_id, membership.employee_role_id) and role.workspace_id = membership.workspace_id
      where membership.workspace_id = item.workspace_id and membership.user_id = coalesce(item.published_by, item.created_by)),
      'owner'))
$$;

CREATE OR REPLACE FUNCTION "app_private"."communication_reason"("state" "app_private"."actor_state", "w" "uuid", "kind" "text", "stored" "uuid"[], "author" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  live uuid[] := app_private.live_locations(w, stored);
  writer uuid := (
    select membership.user_id from public.workspace_memberships membership
    where membership.workspace_id = w and membership.user_id = author and membership.status = 'active'
  );
  -- The role the author last had here, whether they are still here or not.
  last_role public.workspace_role := (
    select role.access_class from public.workspace_memberships membership
    join public.workspace_roles role on role.id = coalesce(membership.role_id, membership.employee_role_id) and role.workspace_id = membership.workspace_id
    where membership.workspace_id = w and membership.user_id = author
  );
  narrow app_private.authz_actions;
  wide app_private.authz_actions;
  reason text;
begin
  select * into strict narrow from app_private.authz_actions a where a.key = kind || '.write';
  select * into strict wide from app_private.authz_actions a where a.key = kind || '.write_wide';
  -- An admin or owner who has left protects the record harder, not softer:
  -- only an admin or the owner changes it (Mert, 2026-10-02, O1; fail
  -- closed). So does a record that no longer says who wrote it (a deleted
  -- account). A manager who has left ranks as the manager they were ("En
  -- nihayetinde o da müdürdü.", Mert, 2026-10-02): the K3 rule goes on.
  if writer is null and (last_role is null or last_role in ('owner', 'admin')) then
    reason := app_private.authz_check(state, wide, null, null, null);
    return case when reason = 'out_of_scope' then 'rank' else reason end;
  end if;
  writer := author;
  if cardinality(stored) > 0 and cardinality(live) = 1 then
    return app_private.authz_check(state, narrow, live, null, writer);
  end if;
  return app_private.authz_check(state, wide, null, null, writer);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_account_deletion_blockers_service"("actor_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with blocker_rows as (
    select
      'active_membership'::text as kind,
      membership.workspace_id,
      workspace.name as workspace_name,
      role.name as role_name,
      (role.system_key = 'owner') as is_owner,
      null::uuid as transfer_id,
      null::text as transfer_direction
    from public.workspace_memberships membership
    join public.workspaces workspace on workspace.id = membership.workspace_id
    join public.workspace_roles role on role.id = coalesce(membership.role_id, membership.employee_role_id)
    where membership.user_id = actor_user_id
      and membership.status = 'active'
      and (
        workspace.lifecycle_status = 'active'
        or (
          workspace.lifecycle_status = 'closure_scheduled'
          and workspace.closure_effective_at > now()
        )
      )

    union all

    select
      'pending_ownership_transfer'::text,
      transfer.workspace_id,
      workspace.name,
      null::text,
      false,
      transfer.id,
      case
        when transfer.initiated_by = actor_user_id then 'outgoing'
        else 'incoming'
      end
    from public.workspace_ownership_transfers transfer
    join public.workspaces workspace on workspace.id = transfer.workspace_id
    where transfer.status = 'pending'
      and (
        transfer.initiated_by = actor_user_id
        or transfer.target_user_id = actor_user_id
      )
  )
  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'kind', kind,
        'workspace_id', workspace_id,
        'workspace_name', workspace_name,
        'role_name', role_name,
        'is_owner', is_owner,
        'transfer_id', transfer_id,
        'transfer_direction', transfer_direction
      ))
      order by workspace_name, kind, transfer_id
    ),
    '[]'::jsonb
  )
  from blocker_rows;
$$;

CREATE OR REPLACE FUNCTION "public"."get_employee_detail_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_employee_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me app_private.actor_state;
  reads_private boolean;
  reads_access boolean;
  removal app_private.authz_actions;
  invite_rule app_private.authz_actions;
  answer jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.read', target_person => target_employee_id);
  me := app_private.actor(actor_user_id, target_workspace_id);
  -- The owner holds every permission.
  reads_private := me.class = 'owner' or 'employees.private.read' = any (me.permissions);
  reads_access := me.class = 'owner' or 'employee_access.read' = any (me.permissions);
  select * into removal from app_private.authz_actions action where action.key = 'employee.remove_from_location';
  if not found then
    raise exception 'core action employee.remove_from_location is missing' using errcode = '22023';
  end if;
  select * into invite_rule from app_private.authz_actions action where action.key = 'employee.invite';
  if not found then
    raise exception 'core action employee.invite is missing' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'id', employee.id,
    'workspace_id', employee.workspace_id,
    'employee_code', employee.employee_code,
    'first_name', employee.first_name,
    'last_name', employee.last_name,
    'preferred_name', employee.preferred_name,
    'display_name', concat_ws(' ', employee.first_name, employee.last_name),
    'invitation_email', employee.invitation_email,
    'account_email', account_user.email,
    'start_date', employee.start_date,
    'primary_location_id', primary_location.location_id,
    'primary_location_name', location.name,
    'location_count', (
      select count(*)
      from public.employee_location_assignments assignment
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ),
    'primary_job_id', primary_job.job_id,
    'primary_job_name', job.name,
    'job_count', (
      select count(*)
      from public.employee_job_assignments assignment
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ),
    'role_id', role.id,
    'role_name', role.name,
    'display_status', case
      when employee.archived_at is not null then 'archived'
      when membership.status = 'active' then 'active'
      when membership.status = 'pending_activation' then 'onboarding'
      when invitation.status = 'pending' and invitation.expires_at > now() then 'invited'
      else 'not_invited'
    end,
    'archived_at', employee.archived_at,
    'revision', employee.revision,
    'user_id', employee.user_id,
    'internal_note', employee.internal_note,
    'is_remote', employee.is_remote,
    'is_excluded_from_schedule', employee.is_excluded_from_schedule,
    -- Whether this is the workspace owner's record: the drawer asks here, not
    -- the role's name (BL-421).
    'is_workspace_owner', app_private.employee_record_is_workspace_owner(employee.workspace_id, employee.id),
    -- null only when the reader may not read it. Somebody with nothing on file
    -- yet reads as an empty profile: no names, nothing given, the defaults the
    -- shared employeeDetailSchema needs (7b QA finding 1, shape agreed with
    -- nf-backend).
    'private_contact', case
      when not reads_private then null
      else jsonb_strip_nulls(jsonb_build_object(
        'legal_first_name', private_profile.legal_first_name,
        'legal_last_name', private_profile.legal_last_name,
        'preferred_name', private_profile.preferred_name
      )) || jsonb_build_object(
        'phone', private_profile.phone,
        'street_address', private_profile.street_address,
        'city', private_profile.city,
        'region', private_profile.region,
        'postal_code', private_profile.postal_code,
        'country_code', private_profile.country_code,
        'date_of_birth', private_profile.date_of_birth,
        'emergency_contact_name', private_profile.emergency_contact_name,
        'emergency_contact_relationship', private_profile.emergency_contact_relationship,
        'emergency_contact_phone', private_profile.emergency_contact_phone,
        'emergency_contact_email', coalesce(private_profile.emergency_contact_email, ''),
        'share_phone_with_teammates', coalesce(private_profile.share_phone_with_teammates, false),
        'share_email_with_teammates', coalesce(private_profile.share_email_with_teammates, false)
      )
    end,
    'locations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', assignment.location_id,
          'name', assigned_location.name,
          'primary', assignment.is_primary,
          'archived', assigned_location.archived_at is not null,
          -- May the reader take them off this location.
          'removable', app_private.authz_check(me, removal, array[assignment.location_id], employee.id, null) is null
        )
        order by assignment.is_primary desc, assigned_location.name
      )
      from public.employee_location_assignments assignment
      join public.locations assigned_location on assigned_location.id = assignment.location_id
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', assignment.job_id,
          'name', assigned_job.name,
          'primary', assignment.is_primary,
          'archived', assigned_job.archived_at is not null
        )
        order by assignment.is_primary desc, lower(assigned_job.name), assigned_job.id
      )
      from public.employee_job_assignments assignment
      join public.jobs assigned_job on assigned_job.id = assignment.job_id
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ), '[]'::jsonb),
    'invitation', case
      -- Who reads access reads it; so does whoever its buttons answer to
      -- (employee.invite, a role they may give; BL-1069).
      when invitation.id is null or not (reads_access
        or (app_private.authz_check(me, invite_rule, null, employee.id, null) is null
          and app_private.can_invite_with_role(actor_user_id, target_workspace_id, invitation.role_id))) then null
      else jsonb_build_object(
        'id', invitation.id,
        'email', invitation.email,
        'role_id', invitation.role_id,
        'status', invitation.status,
        'expires_at', invitation.expires_at,
        'sent_at', invitation.sent_at,
        'delivery_status', invitation.delivery_status,
        'delivery_attempted_at', invitation.delivery_attempted_at,
        'delivery_failed_at', invitation.delivery_failed_at,
        'delivery_error', invitation.delivery_error,
        'role_name', invitation_role.name,
        'invited_by_name', coalesce(
          nullif(btrim(inviter_profile.display_name), ''),
          inviter_user.email
        )
      )
    end,
    'onboarding', jsonb_build_object(
      'status', case
        when membership.status = 'pending_activation' then 'in_progress'
        when invitation.status = 'pending' then 'invited'
        else 'not_requested'
      end,
      'required_documents', (
        select count(*)
        from public.document_types document_type
        where document_type.workspace_id = employee.workspace_id
          and document_type.required_at_onboarding
          and document_type.archived_at is null
      ),
      'completed_documents', 0
    ),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', event.id,
          'action', event.action,
          'occurred_at', event.occurred_at,
          'actor_user_id', event.actor_user_id,
          'summary', event.summary
        )
        order by event.occurred_at desc
      )
      from (
        select *
        from public.employee_events
        where employee_id = employee.id
        order by occurred_at desc
        limit 50
      ) event
    ), '[]'::jsonb),
    -- What the reader may do to this record, by the same rules the actions ask.
    'allowed', (
      select jsonb_object_agg(replace(replace(action.key, 'employee.', ''), '.', '_'),
        app_private.authz_check(me, action, null, employee.id, null) is null
        -- Only a live record with no account on it is invitable, as
        -- prepare_employee_invitation_service says (7b QA finding 2).
        and (action.key <> 'employee.invite'
          or (employee.user_id is null and employee.archived_at is null)))
      from app_private.authz_actions action
      where action.key in ('employee.save', 'employee.terminate', 'employee.archive',
        'employee.remove_access', 'employee.change_role', 'employee.make_admin',
        'employee.invite', 'onboarding.review')
    )
  ) into answer
  from public.employee_profiles employee
  left join public.employee_private_profiles private_profile
    on private_profile.employee_id = employee.id
  left join auth.users account_user
    on account_user.id = employee.user_id
  left join public.employee_location_assignments primary_location
    on primary_location.employee_id = employee.id
    and primary_location.ended_at is null
    and primary_location.is_primary
  left join public.locations location on location.id = primary_location.location_id
  left join public.employee_job_assignments primary_job
    on primary_job.employee_id = employee.id
    and primary_job.ended_at is null
    and primary_job.is_primary
  left join public.jobs job on job.id = primary_job.job_id
  left join public.workspace_memberships membership
    on membership.workspace_id = employee.workspace_id
    and membership.user_id = employee.user_id
  left join public.workspace_roles role on role.id = coalesce(membership.role_id, membership.employee_role_id)
  left join lateral (
    select *
    from public.employee_invitations candidate
    where candidate.employee_id = employee.id
    order by candidate.created_at desc
    limit 1
  ) invitation on true
  left join public.workspace_roles invitation_role
    on invitation_role.id = invitation.role_id
  left join public.user_profiles inviter_profile
    on inviter_profile.user_id = invitation.created_by
  left join auth.users inviter_user
    on inviter_user.id = invitation.created_by
  where employee.id = target_employee_id
    and employee.workspace_id = target_workspace_id;

  return answer;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."list_employees_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "include_archived" boolean DEFAULT false, "search_text" "text" DEFAULT ''::"text", "status_filter" "text" DEFAULT 'all'::"text", "page_limit" integer DEFAULT 100, "page_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "workspace_id" "uuid", "employee_code" "text", "first_name" "text", "last_name" "text", "preferred_name" "text", "display_name" "text", "invitation_email" "text", "start_date" "date", "locations" "jsonb", "primary_job_id" "uuid", "primary_job_name" "text", "job_count" bigint, "role_name" "text", "display_status" "text", "archived_at" timestamp with time zone, "revision" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  rule_row app_private.authz_actions;
  reason text;
begin
  select * into rule_row from app_private.authz_actions action where action.key = 'employee.list';
  if not found then
    raise exception 'core action employee.list is missing' using errcode = '22023';
  end if;
  -- May they list anybody at all; who, is answered row by row.
  reason := app_private.authz_check(me, rule_row, null, null, null);
  if reason is not null and reason <> 'out_of_scope' then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || reason, detail = 'employee.list';
  end if;

  return query
  with directory as (
    select employee.id, employee.workspace_id, employee.employee_code,
      employee.first_name, employee.last_name, employee.preferred_name,
      concat_ws(' ', coalesce(nullif(employee.preferred_name, ''), employee.first_name), employee.last_name) as display_name,
      employee.invitation_email, employee.start_date,
      -- Every location they work at, the primary first, then A to Z (BL-436).
      coalesce((
        select jsonb_agg(jsonb_build_object('id', place.id, 'name', place.name, 'primary', assignment.is_primary)
          order by assignment.is_primary desc, lower(place.name), place.id)
        from public.employee_location_assignments assignment
        join public.locations place on place.id = assignment.location_id
        where assignment.employee_id = employee.id and assignment.ended_at is null
      ), '[]'::jsonb) as locations,
      primary_job.job_id as primary_job_id, app_private.listed_job_name(employee.id) as primary_job_name,
      (select count(*) from public.employee_job_assignments a where a.employee_id = employee.id and a.ended_at is null) as job_count,
      role.name as role_name,
      case
        when employee.archived_at is not null then 'archived'
        when membership.status = 'active' then 'active'
        when onboarding.status in ('submitted', 'changes_requested') then 'needs_attention'
        when membership.status = 'pending_activation' then 'onboarding'
        when invitation.status = 'pending' and invitation.expires_at > now() then 'invited'
        else 'not_invited'
      end as display_status,
      employee.archived_at, employee.revision
    from public.employee_profiles employee
    left join public.employee_job_assignments primary_job on primary_job.employee_id = employee.id and primary_job.ended_at is null and primary_job.is_primary
    left join public.workspace_memberships membership on membership.workspace_id = employee.workspace_id and membership.user_id = employee.user_id
    left join public.workspace_roles role on role.id = coalesce(membership.role_id, membership.employee_role_id)
    left join public.employee_onboarding_cases onboarding on onboarding.employee_id = employee.id
    left join lateral (
      select candidate.status, candidate.expires_at
      from public.employee_invitations candidate
      where candidate.employee_id = employee.id
      order by candidate.created_at desc limit 1
    ) invitation on true
    where employee.workspace_id = target_workspace_id
      and (include_archived = (employee.archived_at is not null))
      and app_private.authz_check(me, rule_row, null, employee.id, null) is null
  )
  select * from directory
  where (
      btrim(search_text) = ''
      or concat_ws(
        ' ',
        directory.first_name,
        directory.last_name,
        directory.preferred_name,
        directory.employee_code,
        directory.invitation_email,
        (select string_agg(place ->> 'name', ' ') from jsonb_array_elements(directory.locations) place),
        directory.primary_job_name
      ) ilike '%' || btrim(search_text) || '%'
    )
    and (status_filter = 'all' or directory.display_status = status_filter)
  order by lower(directory.display_name), directory.id
  limit least(greatest(page_limit, 1), 200)
  offset greatest(page_offset, 0);
end;
$$;

CREATE OR REPLACE FUNCTION "app_private"."can_edit_role"("actor" "uuid", "w" "uuid", "rid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
 select exists(select 1 from public.workspace_memberships m join public.workspace_roles ar on ar.id=coalesce(m.role_id, m.employee_role_id)
 left join public.workspace_roles target on target.id=rid and target.workspace_id=w
 where m.user_id=actor and m.workspace_id=w and m.status='active' and coalesce(m.role_id, m.employee_role_id) is distinct from rid
 and app_private.authz_reason(actor,w,'settings.roles.write') is null
 and (rid is null or (target.id is not null and target.access_class<>'owner'))
 and (ar.access_class='owner' or (ar.access_class='admin' and (rid is null or target.access_class in ('manager','employee')))));
$$;

CREATE OR REPLACE FUNCTION "public"."read_role_workspace_service"("actor_user_id" "uuid", "target_workspace_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.roles.read');
  return jsonb_build_object(
    'permissions', (select jsonb_agg(p order by p.sort_order) from public.permissions p),
    'roles', coalesce((
      select jsonb_agg(to_jsonb(r) || jsonb_build_object(
        'permission_keys', coalesce((select jsonb_agg(g.permission_key order by g.permission_key)
          from public.workspace_role_permissions g where g.role_id = r.id), '[]'::jsonb),
        'member_count', (select count(*) from public.workspace_memberships m where r.id in (m.role_id, m.employee_role_id) and m.status = 'active'),
        'pending_invite_count', (select count(*) from public.employee_invitations i
          where i.role_id = r.id and i.status = 'pending' and i.expires_at > now()),
        'blocking_member_count', (select count(*) from public.workspace_memberships m where r.id in (m.role_id, m.employee_role_id))
          + (select count(*) from public.employee_access_snapshots snap where snap.role_id = r.id),
        'blocking_invite_count', (select count(*) from public.employee_invitations i where i.role_id = r.id),
        'editable', app_private.can_edit_role(actor_user_id, target_workspace_id, r.id),
        'deletable', r.system_key is null and app_private.can_edit_role(actor_user_id, target_workspace_id, r.id)
          and not exists (select 1 from public.workspace_memberships m where r.id in (m.role_id, m.employee_role_id))
          and not exists (select 1 from public.employee_invitations i where i.role_id = r.id)
          and not exists (select 1 from public.employee_access_snapshots snap where snap.role_id = r.id)
      ) order by r.sort_order, r.name)
      from public.workspace_roles r
      where r.workspace_id = target_workspace_id
    ), '[]'::jsonb)
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."set_employee_archived_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_employee_id" "uuid", "should_archive" boolean, "restore_access" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  employee_user_id uuid;
  member public.workspace_memberships%rowtype;
  reopened public.workspace_memberships%rowtype;
  snapshot public.employee_access_snapshots%rowtype;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.archive', target_person => target_employee_id);

  select user_id into employee_user_id
  from public.employee_profiles
  where id = target_employee_id and workspace_id = target_workspace_id
  for update;

  if not should_archive and restore_access then
    select * into snapshot
    from public.employee_access_snapshots
    where employee_id = target_employee_id and restored_at is null
    order by captured_at desc
    limit 1
    for update;
    if snapshot.id is null then
      raise exception 'restorable access snapshot not found' using errcode = 'P0002';
    end if;
    select * into reopened
    from public.workspace_memberships
    where id = snapshot.membership_id and workspace_id = target_workspace_id;
    -- Only the account still linked to the record is reopened: once a rehire
    -- restore detached it, reopening would hand its role to an account no
    -- record stands for (nf-guvenlik Y1).
    if employee_user_id is null or reopened.user_id is distinct from employee_user_id then
      raise exception 'employee has no linked workspace account' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.workspace_roles
      where id = snapshot.role_id and workspace_id = target_workspace_id
    ) then
      raise exception 'snapshotted role is no longer available' using errcode = '22023';
    end if;
    -- Giving the account back is the twin of taking it away, and hands out the
    -- role it had: both asked of the membership it reopens.
    perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.remove_access',
      target_user => reopened.user_id);
    perform app_private.authorize_role_grant(actor_user_id, target_workspace_id, snapshot.role_id,
      target_user => reopened.user_id);
  end if;

  select * into member
  from public.workspace_memberships
  where workspace_id = target_workspace_id and user_id = employee_user_id;

  if should_archive and member.id is not null and member.status in ('active', 'pending_activation') then
    insert into public.employee_access_snapshots (workspace_id, employee_id, membership_id, role_id, captured_by)
    values (target_workspace_id, target_employee_id, member.id, coalesce(member.role_id, member.employee_role_id), actor_user_id);

    update public.workspace_memberships
    set status = 'suspended'::public.membership_status, updated_at = now()
    where id = member.id;
  end if;

  update public.employee_profiles
  set archived_at = case when should_archive then now() else null end,
      archived_by = case when should_archive then actor_user_id else null end,
      user_id = case
        when not should_archive and not restore_access and employee_user_id is not null then null
        else user_id
      end,
      revision = revision + 1,
      updated_at = now()
  where id = target_employee_id;

  if not should_archive and restore_access then
    perform set_config('app.membership_change', snapshot.membership_id::text, true);
    update public.workspace_memberships
    set status = 'active'::public.membership_status, updated_at = now()
    where id = snapshot.membership_id;
    perform app_private.place_single_role(snapshot.membership_id, snapshot.role_id);

    update public.employee_access_snapshots set restored_at = now() where id = snapshot.id;
  end if;

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (
    target_workspace_id,
    target_employee_id,
    actor_user_id,
    case when should_archive then 'employee.archived' else 'employee.restored' end,
    case
      when should_archive then 'Employee archived and linked access suspended'
      when restore_access then 'Employee record and access restored'
      else 'Employee record restored for rehire'
    end
  );

  -- Archived with access: the person hears it ended. Restored with access: the person and who may publish
  -- where they work (access_tell_ended, access_tell_restored).
  if should_archive and member.id is not null and member.status in ('active', 'pending_activation') then
    perform app_private.access_tell_ended(target_workspace_id, target_employee_id, employee_user_id, member.id, actor_user_id);
  elsif should_archive then
    perform app_private.access_tell_ended(target_workspace_id, target_employee_id, null, null, actor_user_id);
  elsif not should_archive and restore_access then
    perform app_private.access_tell_restored(target_workspace_id, target_employee_id, reopened.user_id, actor_user_id);
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."terminate_employee_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_employee_id" "uuid", "effective_local" timestamp without time zone, "worksite_timezone" "text", "termination_reason" "text", "target_idempotency_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  employee public.employee_profiles%rowtype;
  member public.workspace_memberships%rowtype;
  existing_termination public.employee_terminations%rowtype;
  v_termination_id uuid;
  resolved_effective_at timestamptz;
  released_count integer := 0;
  response jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.terminate', target_person => target_employee_id);
  perform public.availability_lock_workspace(target_workspace_id);
  if effective_local is null or target_idempotency_key is null then
    raise exception 'effective time and idempotency key are required' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(termination_reason, ''))) not between 3 and 240 then
    raise exception 'termination reason must be between 3 and 240 characters' using errcode = '22023';
  end if;
  if not app_private.timezone_name_valid(worksite_timezone) then
    raise exception 'invalid worksite timezone' using errcode = '22023';
  end if;

  resolved_effective_at := effective_local at time zone worksite_timezone;
  if resolved_effective_at > now() + interval '5 minutes' then
    raise exception 'future termination requires a scheduled offboarding workflow' using errcode = '22023';
  end if;

  select candidate.* into existing_termination
  from public.employee_terminations candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.actor_user_id = terminate_employee_service.actor_user_id
    and candidate.idempotency_key = target_idempotency_key
  for update;
  if found then
    if existing_termination.employee_id <> target_employee_id
      or existing_termination.effective_at <> resolved_effective_at
      or existing_termination.worksite_timezone <> worksite_timezone
      or existing_termination.reason <> btrim(termination_reason) then
      raise exception 'idempotency key payload conflict' using errcode = '23505';
    end if;
    return existing_termination.result || jsonb_build_object('idempotent_replay', true);
  end if;

  select candidate.* into employee
  from public.employee_profiles candidate
  where candidate.id = target_employee_id
    and candidate.workspace_id = target_workspace_id
    and candidate.archived_at is null
  for update;
  if not found then
    raise exception 'active employee not found' using errcode = 'P0002';
  end if;
  -- The time zone is one of the places they work; somebody with no location
  -- left (S1) has nothing to match, and any valid one is taken.
  if exists (
      select 1 from public.employee_location_assignments assignment
      where assignment.employee_id = target_employee_id and assignment.ended_at is null
    )
    and not exists (
      select 1
      from public.employee_location_assignments assignment
      join public.locations location
        on location.id = assignment.location_id
       and location.workspace_id = assignment.workspace_id
      where assignment.workspace_id = target_workspace_id
        and assignment.employee_id = target_employee_id
        and assignment.ended_at is null
        and location.timezone = worksite_timezone
    ) then
    raise exception 'worksite timezone must match an active employee location' using errcode = '22023';
  end if;

  select candidate.* into member
  from public.workspace_memberships candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.user_id = employee.user_id
  for update;

  insert into public.employee_terminations (
    workspace_id, employee_id, actor_user_id, effective_at, worksite_timezone,
    reason, idempotency_key
  ) values (
    target_workspace_id, target_employee_id, actor_user_id, resolved_effective_at,
    worksite_timezone, btrim(termination_reason), target_idempotency_key
  ) returning id into v_termination_id;

  if member.id is not null and member.status in ('active', 'pending_activation') then
    insert into public.employee_access_snapshots (workspace_id, employee_id, membership_id, role_id, captured_by)
    values (target_workspace_id, target_employee_id, member.id, coalesce(member.role_id, member.employee_role_id), actor_user_id);
    update public.workspace_memberships
    set status = 'suspended', updated_at = now()
    where id = member.id;
  end if;

  update public.employee_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where workspace_id = target_workspace_id
    and employee_id = target_employee_id
    and status = 'pending';

  insert into public.employee_offboarding_shift_actions (
    workspace_id, termination_id, shift_id, location_id,
    previous_employee_id, shift_start_at
  )
  select shift.workspace_id, v_termination_id, shift.id, shift.location_id,
    shift.employee_id,
    (shift.scheduled_date + shift.start_time) at time zone location.timezone
  from public.schedule_published_shifts shift
  join public.schedule_location_publications publication
    on publication.id = shift.publication_id
   and publication.workspace_id = shift.workspace_id
   and publication.location_id = shift.location_id
   and publication.status = 'current'
  join public.locations location
    on location.id = shift.location_id
   and location.workspace_id = shift.workspace_id
  where shift.workspace_id = target_workspace_id
    and shift.employee_id = target_employee_id
    and (shift.scheduled_date + shift.start_time) at time zone location.timezone >= greatest(resolved_effective_at, now());

  get diagnostics released_count = row_count;

  update public.schedule_published_shifts shift
  set employee_id = null
  from public.employee_offboarding_shift_actions action
  where action.termination_id = v_termination_id
    and action.shift_id = shift.id
    and action.workspace_id = shift.workspace_id;

  update public.employee_profiles
  set archived_at = resolved_effective_at, archived_by = actor_user_id,
    revision = revision + 1, updated_at = now()
  where id = target_employee_id;

  insert into public.employee_events (
    workspace_id, employee_id, actor_user_id, action, summary, occurred_at
  ) values (
    target_workspace_id, target_employee_id, actor_user_id, 'employee.terminated',
    format('Employee terminated; %s published shift(s) released', released_count),
    resolved_effective_at
  );

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata, occurred_at
  ) values (
    target_workspace_id, actor_user_id, 'employee.terminated', 'employee', target_employee_id::text,
    jsonb_build_object(
      'termination_id', v_termination_id,
      'effective_at', resolved_effective_at,
      'worksite_timezone', worksite_timezone,
      'released_shift_count', released_count
    ),
    resolved_effective_at
  );

  -- The person hears their access ended, when they had any; the shifts left without anyone are told per
  -- location (access_tell_ended, schedule_tell_unassigned).
  if member.id is not null and member.status in ('active', 'pending_activation') then
    perform app_private.access_tell_ended(target_workspace_id, target_employee_id, employee.user_id, member.id, actor_user_id);
  else
    perform app_private.access_tell_ended(target_workspace_id, target_employee_id, null, null, actor_user_id);
  end if;
  perform app_private.schedule_tell_unassigned(target_workspace_id,
    array(select action.shift_id from public.employee_offboarding_shift_actions action
          where action.termination_id = v_termination_id), actor_user_id);

  response := jsonb_build_object(
    'termination_id', v_termination_id,
    'effective_at', resolved_effective_at,
    'worksite_timezone', worksite_timezone,
    'released_shift_count', released_count,
    'idempotent_replay', false
  );
  update public.employee_terminations
  set released_shift_count = released_count, result = response
  where id = v_termination_id;
  return response;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."update_employee_membership_role_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_employee_id" "uuid", "target_role_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_employee public.employee_profiles%rowtype;
  target_membership public.workspace_memberships%rowtype;
  existing_role public.workspace_roles%rowtype;
  next_role public.workspace_roles%rowtype;
begin
  perform app_private.authorize_role_grant(actor_user_id, target_workspace_id, target_role_id,
    target_person => target_employee_id);
  select role.* into next_role
  from public.workspace_roles role
  where role.id = target_role_id and role.workspace_id = target_workspace_id;

  select employee.* into target_employee
  from public.employee_profiles employee
  where employee.id = target_employee_id
    and employee.workspace_id = target_workspace_id
    and employee.archived_at is null
  for update;
  if target_employee.id is null then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;
  if target_employee.user_id is null then
    raise exception 'employee has no linked workspace account' using errcode = '22023';
  end if;

  select membership.* into target_membership
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = target_employee.user_id
    and membership.status = 'active'
  for update;
  if target_membership.id is null then
    raise exception 'active workspace membership not found' using errcode = 'P0002';
  end if;

  select role.* into existing_role
  from public.workspace_roles role
  where role.id = coalesce(target_membership.role_id, target_membership.employee_role_id) and role.workspace_id = target_workspace_id;

  perform set_config('app.membership_change', target_membership.id::text, true);
  perform app_private.place_single_role(target_membership.id, next_role.id);

  -- K4: nobody without a location becomes a manager, unless Remote.
  perform app_private.keep_manager_at_a_location(target_workspace_id, target_employee.id);

  update public.employee_profiles
  set revision = revision + 1, updated_at = now()
  where id = target_employee.id and workspace_id = target_workspace_id;

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (target_workspace_id, target_employee.id, actor_user_id, 'employee.role_changed', 'Workspace access role changed');

  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    target_workspace_id,
    actor_user_id,
    'membership.role_changed',
    'workspace_membership',
    target_membership.id::text,
    jsonb_build_object(
      'employee_id', target_employee.id,
      'from_role_id', existing_role.id,
      'from_access_class', existing_role.access_class,
      'to_role_id', next_role.id,
      'to_access_class', next_role.access_class
    )
  );

  -- The person hears their new role, when it is a new one (guarded).
  if existing_role.id is distinct from next_role.id then
    perform app_private.people_tell('people.role_changed', target_workspace_id, array[target_employee.user_id],
      'role:' || target_membership.id::text || ':' || txid_current()::text,
      'Your role is now ' || next_role.name, null, '/app', actor_user_id, 'workspace_membership', target_membership.id,
      jsonb_build_object('role_id', next_role.id));
  end if;

  return jsonb_build_object(
    'membership_id', target_membership.id,
    'role_id', next_role.id,
    'role_name', next_role.name,
    'access_class', next_role.access_class
  );
end;
$$;

CREATE OR REPLACE FUNCTION "app_private"."accept_employee_invitation_for_user"("target_user_id" "uuid", "target_invitation_id" "uuid", "invitation_token_hash" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  invitation public.employee_invitations%rowtype;
  employee_role public.workspace_roles%rowtype;
  normalized_user_email text;
  email_confirmed boolean;
  membership public.workspace_memberships%rowtype;
  accepted_membership_id uuid;
begin
  if target_invitation_id is null and invitation_token_hash is null then
    raise exception 'active invitation not found' using errcode = 'P0002';
  end if;

  select *
  into invitation
  from public.employee_invitations
  where status = 'pending'
    and (
      (target_invitation_id is not null and id = target_invitation_id)
      or (invitation_token_hash is not null and token_hash = invitation_token_hash)
    )
  for update;

  if invitation.id is null or invitation.expires_at <= now() then
    if invitation.id is not null then
      update public.employee_invitations
      set status = 'expired'::public.employee_invitation_status,
          updated_at = now()
      where id = invitation.id;
    end if;
    raise exception 'active invitation not found' using errcode = 'P0002';
  end if;

  select lower(email), email_confirmed_at is not null
  into normalized_user_email, email_confirmed
  from auth.users
  where id = target_user_id;

  if normalized_user_email is null or normalized_user_email <> invitation.email then
    raise exception 'invitation email does not match authenticated account' using errcode = '42501';
  end if;
  if not email_confirmed then
    raise exception 'the account email address is not confirmed' using errcode = '42501', hint = 'authz.not_active';
  end if;

  select *
  into employee_role
  from public.workspace_roles
  where id = invitation.role_id
    and workspace_id = invitation.workspace_id;

  if employee_role.id is null then
    raise exception 'invitation role is unavailable' using errcode = '22023';
  end if;

  select *
  into membership
  from public.workspace_memberships
  where workspace_id = invitation.workspace_id
    and user_id = target_user_id
  for update;

  if membership.id is not null
    and membership.status <> 'suspended'::public.membership_status then
    raise exception 'workspace membership already exists' using errcode = '23505';
  end if;

  update public.employee_profiles
  set user_id = target_user_id,
      revision = revision + 1,
      updated_at = now()
  where id = invitation.employee_id
    and workspace_id = invitation.workspace_id
    and user_id is null
    and archived_at is null;

  if not found then
    raise exception 'invitable employee is unavailable' using errcode = 'P0002';
  end if;

  perform set_config('app.employee_invitation_accept', 'on', true);

  if membership.id is not null then
    update public.workspace_memberships
    set status = 'pending_activation'::public.membership_status,
        updated_at = now()
    where id = membership.id
    returning id into accepted_membership_id;
  else
    insert into public.workspace_memberships (
      workspace_id, user_id, role_id, employee_role_id, status
    ) values (
      invitation.workspace_id,
      target_user_id,
      case when employee_role.access_class = 'employee' then null else invitation.role_id end,
      case when employee_role.access_class = 'employee' then invitation.role_id end,
      'pending_activation'::public.membership_status
    )
    returning id into accepted_membership_id;
  end if;
  perform app_private.place_single_role(accepted_membership_id, invitation.role_id);

  perform app_private.reset_employee_onboarding_for_rehire(
    invitation.workspace_id,
    invitation.employee_id,
    accepted_membership_id,
    target_user_id
  );

  update public.employee_invitations
  set status = 'accepted'::public.employee_invitation_status,
      accepted_at = now(),
      updated_at = now()
  where id = invitation.id;

  insert into public.employee_events (
    workspace_id, employee_id, actor_user_id, action, summary
  )
  values (
    invitation.workspace_id,
    invitation.employee_id,
    target_user_id,
    'employee.invitation_accepted',
    'Employee invitation accepted; activation pending'
  );

  perform app_private.initialize_employee_onboarding(target_user_id, invitation.workspace_id);
  -- Whoever sent it hears the person joined (people_tell_invitation, S-127).
  perform app_private.people_tell_invitation(invitation, 'joined', target_user_id);
  return invitation.workspace_id;
end;
$$;
