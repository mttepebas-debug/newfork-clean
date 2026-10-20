-- DAVET-ERISIM part 2 (Mert 2026-10-20 ~01:30 PT, confirmed ~14:30 PT against KARARLAR S-208): two rules.
-- 1. Remote and Exclude from schedule never lift the rule that somebody works at a location (one of them
--    primary) and a job (one of them primary). Records saved before keep what they hold; the next save asks.
--    The workspace owner's own record stays as it was: the owner works anywhere.
-- 2. A new workspace's setup files the founder with the Owner job as their primary job, the first location as
--    their primary location, and Exclude from schedule ticked. Only a setup finishing does this, and only for an
--    owner record with no primary yet: workspaces already set up are not touched.
-- Bodies copied from supabase/schema.sql (origin/main 332a86cc7) are changed only where marked "DAVET-ERISIM".

-- The Owner job can be the owner's primary job now (setup makes it so); nobody else holds it.
CREATE OR REPLACE FUNCTION "app_private"."keep_job_assignment_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.ended_at is not null then
    -- The owner keeps the Owner job (S1 a); a change of ownership moves the
    -- membership first, so the old owner's assignment ends as anyone's.
    if tg_op = 'UPDATE' and old.ended_at is null
       and exists (select 1 from public.jobs job where job.id = new.job_id and job.system_key = 'owner')
       and app_private.employee_record_is_workspace_owner(new.workspace_id, new.employee_id) then
      raise exception 'The owner keeps the Owner job'
        using errcode = '23514', hint = 'employee.owner_job';
    end if;
    return new;
  end if;
  if exists (select 1 from public.jobs job where job.id = new.job_id and job.system_key = 'owner')
     and not app_private.employee_record_is_workspace_owner(new.workspace_id, new.employee_id) then
    raise exception 'Only the workspace owner works the Owner job'
      using errcode = '42501', hint = 'authz.owner_only';
  end if;
  -- DAVET-ERISIM: every job can be its holder's primary job, the Owner job too (EMP-001 S2 widened).
  return new;
end;
$$;

-- Remote and Exclude from schedule no longer lift the location and job rule.
CREATE OR REPLACE FUNCTION "public"."save_employee_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_employee_id" "uuid", "employee_first_name" "text", "employee_middle_name" "text", "employee_last_name" "text", "employee_preferred_name" "text", "employee_invitation_email" "text", "employee_start_date" "date", "employee_internal_note" "text", "location_ids" "uuid"[], "primary_location_id" "uuid", "job_ids" "uuid"[], "primary_job_id" "uuid", "employee_is_remote" boolean, "employee_is_excluded_from_schedule" boolean, "expected_revision" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  saved_id uuid := target_employee_id;
  reachable uuid[];
  kept uuid[];
  current_revision integer;
  next_code bigint;
begin
  -- A new record is asked where it will work (a manager only where they
  -- manage, never nowhere); an existing one, whose it is.
  if target_employee_id is null then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.create',
      coalesce(location_ids, '{}'::uuid[]));
  else
    perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.save',
      target_person => target_employee_id);
  end if;

  -- An assignment at a location that is not live (archived) is left as it is,
  -- sent or not: that location counts nowhere, and the assignment is back when
  -- the archive is undone (G8a, KK-13). Only live locations are added, kept or
  -- taken away here; the primary mark still follows primary_location_id.
  kept := coalesce((
    select array_agg(existing.location_id)
    from public.employee_location_assignments existing
    join public.locations location on location.id = existing.location_id
    where existing.employee_id = target_employee_id and existing.ended_at is null
      and not app_private.location_is_live(location)
  ), '{}');

  if char_length(btrim(employee_first_name)) not between 1 and 80 or char_length(btrim(employee_last_name)) not between 1 and 80 then
    raise exception 'employee first and last name are required' using errcode = '22023';
  end if;
  -- DAVET-ERISIM: everybody needs a location, a primary location, a job and a primary job, Remote and
  -- excluded from Schedule too; any job can be the primary one, under Management too (EMP-001 S2). The owner's
  -- record needs none of it: the owner may work anywhere.
  if not app_private.employee_record_is_workspace_owner(target_workspace_id, target_employee_id) then
    if cardinality(coalesce(location_ids, '{}'::uuid[]) || kept) = 0 or primary_location_id is null then
      raise exception 'employee requires a location and a job'
        using errcode = '22023', hint = 'employee.location_required';
    end if;
    if cardinality(coalesce(job_ids, '{}'::uuid[])) = 0 then
      raise exception 'employee requires a location and a job'
        using errcode = '22023', hint = 'employee.job_required';
    end if;
    if primary_job_id is null then
      raise exception 'employee requires a primary job'
        using errcode = '22023', hint = 'employee.primary_job_required';
    end if;
  end if;
  if primary_location_id is not null and not primary_location_id = any(coalesce(location_ids, '{}'::uuid[]) || kept) then
    raise exception 'primary location must be assigned' using errcode = '22023';
  end if;
  if primary_job_id is not null and not primary_job_id = any(coalesce(job_ids, '{}'::uuid[])) then
    raise exception 'primary job must be assigned' using errcode = '22023';
  end if;

  -- A location added or taken away is one the actor reaches; an unknown or
  -- archived one reads the same.
  reachable := app_private.scope_set(actor_user_id, target_workspace_id, 'employee.save');
  if exists (
      select 1 from unnest(coalesce(location_ids, '{}'::uuid[])) selected(location_id)
      left join public.locations location
        on location.id = selected.location_id and location.workspace_id = target_workspace_id and location.archived_at is null
      where not selected.location_id = any (kept)
        and (location.id is null
         or (not selected.location_id = any (reachable) and not exists (
           select 1 from public.employee_location_assignments existing
           where existing.employee_id = target_employee_id and existing.location_id = selected.location_id
             and existing.ended_at is null)))
    )
    or exists (
      select 1 from public.employee_location_assignments existing
      where existing.employee_id = target_employee_id and existing.ended_at is null
        and not existing.location_id = any (coalesce(location_ids, '{}'::uuid[]) || kept)
        and not existing.location_id = any (reachable)
    ) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'employee.save';
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
      '',
      nullif(lower(btrim(employee_invitation_email)), ''),
      employee_start_date, btrim(coalesce(employee_internal_note, '')),
      coalesce(employee_is_remote, false),
      coalesce(employee_is_excluded_from_schedule, false),
      actor_user_id
    )
    returning id into saved_id;
    insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
    values (target_workspace_id, saved_id, actor_user_id, 'employee.created', 'Employee record created');
  else
    select revision into current_revision from public.employee_profiles
    where id = saved_id and workspace_id = target_workspace_id and archived_at is null
    for update;
    if current_revision is null then raise exception 'employee not found' using errcode = 'P0002'; end if;
    if expected_revision is null or expected_revision <> current_revision then raise exception 'employee revision conflict' using errcode = 'PT409', hint = 'employee.revision_conflict'; end if;
    -- The preferred name is not the drawer's: it changes by request and answer.
    update public.employee_profiles set
      first_name = btrim(employee_first_name),
      middle_name = left(btrim(coalesce(employee_middle_name, '')), 80),
      last_name = btrim(employee_last_name),
      invitation_email = nullif(lower(btrim(employee_invitation_email)), ''),
      start_date = employee_start_date,
      internal_note = btrim(coalesce(employee_internal_note, '')),
      is_remote = coalesce(employee_is_remote, false),
      is_excluded_from_schedule = coalesce(employee_is_excluded_from_schedule, false),
      revision = revision + 1,
      updated_at = now()
    where id = saved_id;
    insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
    values (target_workspace_id, saved_id, actor_user_id, 'employee.updated', 'Employee profile and assignments updated');
  end if;

  -- Only what changed is written (BL-218): a kept assignment keeps its row, so
  -- the rules on the assignment tables (the owner stays at every location, the
  -- Owner job stays the owner's) judge a real removal, not every save. The
  -- primary flag is cleared before it is set, one row at a time for the index.
  update public.employee_location_assignments set ended_at = now(), is_primary = false
  where employee_id = saved_id and ended_at is null
    and not location_id = any(coalesce(location_ids, '{}'::uuid[]) || kept);
  update public.employee_location_assignments set is_primary = false
  where employee_id = saved_id and ended_at is null and is_primary
    and location_id is distinct from primary_location_id;
  insert into public.employee_location_assignments (workspace_id, employee_id, location_id, is_primary, created_by)
  select distinct target_workspace_id, saved_id, selected.location_id, false, actor_user_id
  from unnest(coalesce(location_ids, '{}'::uuid[])) selected(location_id)
  where not exists (select 1 from public.employee_location_assignments existing
    where existing.employee_id = saved_id and existing.location_id = selected.location_id and existing.ended_at is null);
  update public.employee_location_assignments set is_primary = true
  where employee_id = saved_id and ended_at is null and not is_primary and location_id = primary_location_id;

  update public.employee_job_assignments set ended_at = now(), is_primary = false
  where employee_id = saved_id and ended_at is null
    and not job_id = any(coalesce(job_ids, '{}'::uuid[]));
  update public.employee_job_assignments set is_primary = false
  where employee_id = saved_id and ended_at is null and is_primary
    and job_id is distinct from primary_job_id;
  insert into public.employee_job_assignments (workspace_id, employee_id, job_id, is_primary, created_by)
  select distinct target_workspace_id, saved_id, selected.job_id, false, actor_user_id
  from unnest(coalesce(job_ids, '{}'::uuid[])) selected(job_id)
  where not exists (select 1 from public.employee_job_assignments existing
    where existing.employee_id = saved_id and existing.job_id = selected.job_id and existing.ended_at is null);
  update public.employee_job_assignments set is_primary = true
  where employee_id = saved_id and ended_at is null and not is_primary and job_id = primary_job_id;

  -- K4: excluded from the Schedule needs no location, except a manager, who
  -- manages only where they are assigned.
  perform app_private.keep_manager_at_a_location(target_workspace_id, saved_id);
  return saved_id;
end;
$_$;

-- A setup finishing files the founder: Owner job primary, first location primary, kept off the Schedule.
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
    -- DAVET-ERISIM: the founder's record as a new workspace starts (Mert 2026-10-20): the Owner job is their
    -- primary job, the first location their primary location, and they stay off the Schedule until they
    -- choose otherwise. Only a record with no primary yet: a setup finishing again changes nothing.
    if not exists (
      select 1 from public.employee_job_assignments a
      where a.employee_id = owner_employee_id and a.ended_at is null and a.is_primary
    ) and not exists (
      select 1 from public.employee_location_assignments a
      where a.employee_id = owner_employee_id and a.ended_at is null and a.is_primary
    ) then
      update public.employee_job_assignments a
      set is_primary = true
      from public.jobs j
      where a.employee_id = owner_employee_id and a.ended_at is null
        and j.id = a.job_id and j.workspace_id = target_workspace_id and j.system_key = 'owner';
      update public.employee_location_assignments a
      set is_primary = true
      where a.id = (
        select first.id from public.employee_location_assignments first
        join public.locations l on l.id = first.location_id
        where first.employee_id = owner_employee_id and first.ended_at is null
        order by l.created_at, l.name, l.id
        limit 1);
      update public.employee_profiles
      set is_excluded_from_schedule = true, revision = revision + 1, updated_at = now()
      where id = owner_employee_id and workspace_id = target_workspace_id;
    end if;

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

-- An invitation goes to somebody who works at a location, Remote or excluded from Schedule too.
CREATE OR REPLACE FUNCTION "public"."prepare_employee_invitation_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_employee_id" "uuid", "employee_email" "text", "target_employee_role_id" "uuid", "target_management_role_id" "uuid", "target_managed_location_ids" "uuid"[], "invitation_token_hash" "text", "invitation_expires_at" timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  invitation_id uuid;
  places uuid[] := array(select distinct p from unnest(coalesce(target_managed_location_ids, '{}')) p order by p);
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.invite', target_person => target_employee_id);
  if employee_email <> lower(btrim(employee_email)) or employee_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'valid normalized invitation email required' using errcode = '22023';
  end if;
  if invitation_token_hash !~ '^[0-9a-f]{64}$' or invitation_expires_at <= now() then
    raise exception 'valid invitation token and expiry required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.employee_profiles employee
    where employee.id = target_employee_id
      and employee.workspace_id = target_workspace_id
      and employee.archived_at is null
      and employee.user_id is null
  ) then
    raise exception 'invitable employee not found' using errcode = 'P0002';
  end if;

  perform app_private.invitation_access_check(actor_user_id, target_workspace_id,
    target_employee_role_id, target_management_role_id, places);

  -- DAVET-ERISIM: Remote and Exclude from schedule no longer lift it.
  if not exists (
    select 1 from public.employee_location_assignments
    where employee_id = target_employee_id and ended_at is null
  ) then
    raise exception 'employee requires a location before invitation' using errcode = '22023';
  end if;

  -- Inviting again takes back what was waiting: only an invitation the actor
  -- could take back themselves (nf-guvenlik O-2).
  if exists (
    select 1 from public.employee_invitations pending
    where pending.employee_id = target_employee_id and pending.status = 'pending'
      and not app_private.can_invite_with_role(actor_user_id, target_workspace_id, pending.role_id)
  ) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.rank', detail = 'employee.invite';
  end if;
  update public.employee_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where employee_id = target_employee_id and status = 'pending';
  insert into public.employee_invitations (
    workspace_id, employee_id, email, employee_role_id, management_role_id, managed_location_ids,
    token_hash, expires_at, created_by, delivery_status
  ) values (
    target_workspace_id, target_employee_id, employee_email, target_employee_role_id, target_management_role_id,
    places, invitation_token_hash, invitation_expires_at, actor_user_id, 'pending'
  ) returning id into invitation_id;
  update public.employee_profiles
  set invitation_email = employee_email, revision = revision + 1, updated_at = now()
  where id = target_employee_id;
  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (target_workspace_id, target_employee_id, actor_user_id, 'employee.invited', 'Employee invitation prepared');
  return invitation_id;
end;
$_$;

