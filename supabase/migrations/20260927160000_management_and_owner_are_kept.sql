-- BL-218 .2: every workspace keeps a Management department with an Owner job
-- under it. Nobody deletes or archives either; both can be renamed. The Owner
-- job is the owner's alone and moves with ownership. The owner is put on the
-- Owner job and on every location (and kept there), and on no other job by
-- itself. A job under Management is primary by its department, so its
-- assignment never carries is_primary; one other job may. A person excluded
-- from Schedule gets no new shift, but keeps the shifts already published
-- with them.

-- 1. The owner no longer gets every job ------------------------------------------------

drop trigger jobs_reach_the_owner on public.jobs;
drop trigger jobs_reach_the_owner_on_restore on public.jobs;

-- 2. Which catalog rows are the system's ------------------------------------------------

alter table public.departments
  add column system_key text check (system_key in ('management'));
alter table public.jobs
  add column system_key text check (system_key in ('owner'));
create unique index departments_system_key_idx
  on public.departments (workspace_id, system_key) where system_key is not null;
create unique index jobs_system_key_idx
  on public.jobs (workspace_id, system_key) where system_key is not null;

create function app_private.is_management_job(target_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.jobs job
    join public.departments department on department.id = job.department_id
    where job.id = target_job_id and department.system_key = 'management'
  );
$$;

-- Management and Owner, made once per workspace.
create function app_private.ensure_management_and_owner(target_workspace_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.departments (workspace_id, name, system_key)
  values (target_workspace_id, 'Management', 'management')
  on conflict (workspace_id, system_key) where system_key is not null do nothing;
  insert into public.jobs (workspace_id, name, department_id, system_key)
  select target_workspace_id, 'Owner', department.id, 'owner'
  from public.departments department
  where department.workspace_id = target_workspace_id and department.system_key = 'management'
  on conflict (workspace_id, system_key) where system_key is not null do nothing;
$$;

-- 3. Management and Owner are kept -----------------------------------------------------

-- The browser writes departments and jobs directly (Settings), so the rule sits
-- on the tables. Renaming, recolouring and reordering stay open.
create function app_private.keep_system_catalog_records()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.system_key is not null and current_user not in ('postgres', 'service_role') then
      raise exception 'Management and Owner are made by setup'
        using errcode = '23514', hint = 'catalog.system_record';
    end if;
    return new;
  end if;
  if new.system_key is distinct from old.system_key then
    raise exception 'A catalog record cannot become or stop being Management or Owner'
      using errcode = '23514', hint = 'catalog.system_record';
  end if;
  if old.system_key is not null
     and (new.archived_at is not null or new.deleted_at is not null) then
    raise exception 'Management and Owner are kept; rename them instead'
      using errcode = '23514', hint = 'catalog.system_record';
  end if;
  -- The Owner job stays under Management (S2 a): elsewhere it could be marked
  -- primary and leave the Management group.
  if tg_table_name = 'jobs' then
    if old.system_key = 'owner' and new.department_id is distinct from old.department_id then
      raise exception 'The Owner job stays under Management'
        using errcode = '23514', hint = 'catalog.system_record';
    end if;
  end if;
  return new;
end;
$$;

-- A job that moves under Management is primary by its department from now on.
create function app_private.management_jobs_are_primary_by_department()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app_private.is_management_job(new.id) then
    update public.employee_job_assignments
    set is_primary = false
    where job_id = new.id and ended_at is null and is_primary;
  end if;
  return null;
end;
$$;

create trigger a_system_records_are_kept
  before insert or update on public.departments
  for each row execute function app_private.keep_system_catalog_records();
create trigger a_system_records_are_kept
  before insert or update on public.jobs
  for each row execute function app_private.keep_system_catalog_records();
create trigger jobs_under_management_are_primary
  after update of department_id on public.jobs
  for each row when (new.department_id is distinct from old.department_id)
  execute function app_private.management_jobs_are_primary_by_department();

-- 4. Owner job, Management primary, the owner's locations ------------------------------

create function app_private.keep_job_assignment_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
  if new.is_primary and app_private.is_management_job(new.job_id) then
    raise exception 'A Management job is primary by its department and is not marked primary'
      using errcode = '23514', hint = 'employee.management_primary';
  end if;
  return new;
end;
$$;

create trigger a_owner_job_and_management_primary
  before insert or update on public.employee_job_assignments
  for each row execute function app_private.keep_job_assignment_rules();

-- A location the owner works at is only left when it is archived or deleted.
create function app_private.keep_owner_at_every_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.ended_at is null and new.ended_at is not null
     and app_private.employee_record_is_workspace_owner(new.workspace_id, new.employee_id)
     and exists (select 1 from public.locations location
                 where location.id = new.location_id and location.archived_at is null) then
    raise exception 'The owner works at every location'
      using errcode = '23514', hint = 'employee.owner_locations';
  end if;
  return new;
end;
$$;

create trigger a_owner_stays_at_every_location
  before update on public.employee_location_assignments
  for each row execute function app_private.keep_owner_at_every_location();

-- 5. Functions that change with it ------------------------------------------------------

CREATE OR REPLACE FUNCTION app_private.open_owner_record_to_everything(target_workspace_id uuid, owner_employee_id uuid, actor_user_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Every location, and of the jobs only Owner (BL-218): the owner works any
  -- other job once somebody assigns it, like everyone else.
  select target_workspace_id, owner_employee_id, job.id, actor_user_id
  from public.jobs job
  where job.workspace_id = target_workspace_id
    and job.system_key = 'owner'
    and not exists (
      select 1
      from public.employee_job_assignments assignment
      where assignment.employee_id = owner_employee_id
        and assignment.job_id = job.id
        and assignment.ended_at is null
    );
$function$
;

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
      and department.system_key is null
  ) then
    raise exception 'at least one department of your own is required to complete owner onboarding' using errcode = '23514';
  end if;

  if mark_complete and not exists (
    select 1
    from public.jobs job
    where job.workspace_id = target_workspace_id
      and job.archived_at is null
      and job.system_key is null
  ) then
    raise exception 'at least one job of your own is required to complete owner onboarding' using errcode = '23514';
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

  -- Management and Owner exist from the first save, so the setup steps and
  -- Settings show them; they do not count as the owner's own department and job.
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
$function$
;

CREATE OR REPLACE FUNCTION public.respond_workspace_ownership_transfer_service(actor_user_id uuid, target_workspace_id uuid, transfer_id uuid, transfer_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  transfer_row public.workspace_ownership_transfers%rowtype;
  owner_role_id uuid;
  admin_role_id uuid;
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
      and m.user_id = actor_user_id and m.status = 'active' and coalesce(r.access_class, m.role) = 'admin'
      and not exists (select 1 from public.employee_onboarding_cases c
        where c.membership_id = m.id and c.workspace_id = m.workspace_id and c.status <> 'approved')
  ) or not exists (
    select 1 from public.workspace_memberships m
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    where m.id = transfer_row.previous_owner_membership_id and m.workspace_id = target_workspace_id
      and m.user_id = transfer_row.initiated_by and m.status = 'active' and coalesce(r.access_class, m.role) = 'owner'
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
      role = 'owner',
      all_locations = true,
      updated_at = now()
  where id = transfer_row.target_membership_id
    and workspace_id = target_workspace_id
    and status = 'active';

  update public.workspace_memberships
  set role_id = admin_role_id,
      role = 'admin',
      all_locations = true,
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

  return jsonb_build_object(
    'status', 'accepted',
    'transfer_id', transfer_id,
    'workspace_id', target_workspace_id
  );
end;
$function$
;

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
  editing_owner_record boolean := exists (
    select 1
    from public.employee_profiles employee
    join public.workspace_memberships membership
      on membership.workspace_id = employee.workspace_id
     and membership.user_id = employee.user_id
    where employee.id = target_employee_id
      and employee.workspace_id = target_workspace_id
      and membership.role = 'owner'::public.workspace_role
      and membership.status = 'active'::public.membership_status
  );
begin
  if actor_id is null or not public.workspace_has_permission(target_workspace_id, 'employees.manage') then
    raise exception 'employee management access required' using errcode = '42501';
  end if;
  if char_length(btrim(employee_first_name)) not between 1 and 80 or char_length(btrim(employee_last_name)) not between 1 and 80 then
    raise exception 'employee first and last name are required' using errcode = '22023';
  end if;
  -- The owner works every location and every job, so singling one out as
  -- primary says nothing. Requiring it would block the record from saving at
  -- all.
  if not assignment_optional and not editing_owner_record and (
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
      and (
        public.can_manage_employee_record(target_workspace_id, id)
        -- An owner may edit their own record, because can_manage_employee_record
        -- deliberately excludes owners and would otherwise leave one record in
        -- the workspace nobody could touch. Only theirs: a manager's record can
        -- already be edited by an admin or an owner, and an employment record
        -- carries which locations and jobs somebody is assigned to.
        or (
          user_id = actor_id
          and app_private.employee_record_is_workspace_owner(
            target_workspace_id, id
          )
        )
      ) for update;
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

  -- Only what changed is written (BL-218): a kept assignment keeps its row, so
  -- the rules on the assignment tables (the owner stays at every location, the
  -- Owner job stays the owner's) judge a real removal, not every save. The
  -- primary flag is cleared before it is set, one row at a time for the index.
  update public.employee_location_assignments set ended_at = now(), is_primary = false
  where employee_id = saved_id and ended_at is null
    and not location_id = any(coalesce(location_ids, '{}'::uuid[]));
  update public.employee_location_assignments set is_primary = false
  where employee_id = saved_id and ended_at is null and is_primary
    and location_id is distinct from primary_location_id;
  insert into public.employee_location_assignments (workspace_id, employee_id, location_id, is_primary, created_by)
  select distinct target_workspace_id, saved_id, selected.location_id, false, actor_id
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
  select distinct target_workspace_id, saved_id, selected.job_id, false, actor_id
  from unnest(coalesce(job_ids, '{}'::uuid[])) selected(job_id)
  where not exists (select 1 from public.employee_job_assignments existing
    where existing.employee_id = saved_id and existing.job_id = selected.job_id and existing.ended_at is null);
  update public.employee_job_assignments set is_primary = true
  where employee_id = saved_id and ended_at is null and not is_primary and job_id = primary_job_id;
  return saved_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_job_assignments_service(actor_user_id uuid, target_workspace_id uuid, target_job_id uuid, assignment_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item jsonb; employee public.employee_profiles; target public.jobs; existing public.employee_job_assignments;
  actual boolean; desired boolean; changed integer:=0; unchanged integer:=0; replacement uuid;
begin
  if actor_user_id is null then raise exception 'valid actor required' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub',actor_user_id::text,true);
  if not public.workspace_has_permission(target_workspace_id,'employees.manage')
    or not public.workspace_has_permission(target_workspace_id,'employees.read') then
    raise exception 'employee management access required' using errcode='42501'; end if;
  select * into target from public.jobs where id=target_job_id and workspace_id=target_workspace_id for update;
  if target.id is null then raise exception 'Job not found' using errcode='P0002'; end if;
  if target.deleted_at is not null then raise exception 'This job was deleted and is no longer available' using errcode='P0002'; end if;
  if target.archived_at is not null then raise exception 'Restore this job before changing assignments' using errcode='22023'; end if;
  if jsonb_typeof(assignment_changes) is distinct from 'array' then
    raise exception 'Valid assignment changes required' using errcode='22023'; end if;
  if jsonb_array_length(assignment_changes) not between 1 and 10000 then
    raise exception 'Choose between 1 and 10000 employees' using errcode='22023'; end if;
  if (select count(*)<>count(distinct value->>'employee_id') from jsonb_array_elements(assignment_changes)) then
    raise exception 'An employee may only appear once in a batch' using errcode='22023'; end if;
  -- Lock and validate the entire batch before applying any change.
  for item in select value from jsonb_array_elements(assignment_changes) order by value->>'employee_id' loop
    if jsonb_typeof(item->'employee_id') is distinct from 'string'
      or jsonb_typeof(item->'assigned') is distinct from 'boolean'
      or jsonb_typeof(item->'expected_revision') is distinct from 'number'
      or (item->>'expected_revision') !~ '^[1-9][0-9]*$' then
      raise exception 'Valid employee assignment required' using errcode='22023'; end if;
    select * into employee from public.employee_profiles e
    where e.id=(item->>'employee_id')::uuid and e.workspace_id=target_workspace_id for update;
    if employee.id is null or not public.can_access_employee(target_workspace_id,employee.id)
      or not public.can_manage_employee_record(target_workspace_id,employee.id) then
      raise exception 'Employee management access denied' using errcode='42501'; end if;
    if employee.archived_at is not null then raise exception 'An employee was archived. Reload the employee list.' using errcode='PT409'; end if;
    select exists(select 1 from public.employee_job_assignments a where a.employee_id=employee.id
      and a.job_id=target_job_id and a.ended_at is null) into actual;
    if actual<>(item->>'assigned')::boolean and employee.revision<>(item->>'expected_revision')::integer then
      raise exception 'Employee % changed. Reload employees and review your pending changes.',employee.employee_code using errcode='PT409';
    end if;
  end loop;
  for item in select value from jsonb_array_elements(assignment_changes) order by value->>'employee_id' loop
    select * into existing from public.employee_job_assignments a where a.employee_id=(item->>'employee_id')::uuid
      and a.job_id=target_job_id and a.ended_at is null;
    desired:=(item->>'assigned')::boolean;
    if (existing.id is not null)=desired then unchanged:=unchanged+1; continue; end if;
    if desired then
      insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
      values(target_workspace_id,(item->>'employee_id')::uuid,target_job_id,
        not app_private.is_management_job(target_job_id)
        and not exists(select 1 from public.employee_job_assignments a where a.employee_id=(item->>'employee_id')::uuid
          and a.ended_at is null and a.is_primary),actor_user_id);
    else
      update public.employee_job_assignments set ended_at=now() where id=existing.id;
      if existing.is_primary then
        select a.id into replacement from public.employee_job_assignments a join public.jobs j on j.id=a.job_id
        where a.employee_id=existing.employee_id and a.ended_at is null and not app_private.is_management_job(a.job_id)
        order by (j.archived_at is not null),j.sort_order,lower(j.name),j.id limit 1;
        if replacement is not null then update public.employee_job_assignments set is_primary=true where id=replacement; end if;
      end if;
    end if;
    update public.employee_profiles set revision=revision+1,updated_at=now()
    where id=(item->>'employee_id')::uuid and workspace_id=target_workspace_id;
    insert into public.employee_events(workspace_id,employee_id,actor_user_id,action,summary)
    values(target_workspace_id,(item->>'employee_id')::uuid,actor_user_id,
      case when desired then 'job.assigned' else 'job.unassigned' end,
      case when desired then 'Assigned to ' else 'Removed from ' end||target.name);
    changed:=changed+1;
  end loop;
  return jsonb_build_object('changed_count',changed,'unchanged_count',unchanged);
end; $function$
;

CREATE OR REPLACE FUNCTION public.delete_job_with_assignments_service(actor_user_id uuid, target_workspace_id uuid, target_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target public.jobs; e public.employee_profiles; a public.employee_job_assignments; replacement uuid; removed integer:=0;
begin
  if actor_user_id is null then raise exception 'valid actor required' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub',actor_user_id::text,true);
  if not public.workspace_has_permission(target_workspace_id, 'settings.jobs.manage') or not public.workspace_has_permission(target_workspace_id,'employees.manage')
    or not public.workspace_has_permission(target_workspace_id,'employees.read') then raise exception 'Job and employee management access required' using errcode='42501'; end if;
  select * into target from public.jobs where id=target_job_id and workspace_id=target_workspace_id for update;
  if not found then raise exception 'Job not found' using errcode='P0002'; end if;
  if target.deleted_at is not null then return jsonb_build_object('removed_count',0); end if;
  if target.system_key is not null then
    raise exception 'Management and Owner are kept; rename them instead' using errcode='23514', hint='catalog.system_record'; end if;
  for e in select employee.* from public.employee_profiles employee
    where employee.workspace_id=target_workspace_id and exists(select 1 from public.employee_job_assignments assignment
      where assignment.employee_id=employee.id and assignment.job_id=target_job_id and assignment.ended_at is null)
    order by employee.id for update loop
    if not public.can_access_employee(target_workspace_id,e.id) or not public.can_manage_employee_record(target_workspace_id,e.id) then
      raise exception 'This job is assigned to an employee you cannot manage. Ask an authorized administrator to delete it.' using errcode='42501'; end if;
  end loop;
  for a in select * from public.employee_job_assignments where workspace_id=target_workspace_id and job_id=target_job_id and ended_at is null order by employee_id loop
    update public.employee_job_assignments set ended_at=now() where id=a.id;
    if a.is_primary then
      select other.id into replacement from public.employee_job_assignments other join public.jobs j on j.id=other.job_id
        where other.employee_id=a.employee_id and other.ended_at is null and not app_private.is_management_job(other.job_id)
        order by (j.archived_at is not null),j.sort_order,lower(j.name),j.id limit 1;
      if replacement is not null then update public.employee_job_assignments set is_primary=true where id=replacement; end if;
    end if;
    update public.employee_profiles set revision=revision+1,updated_at=now() where id=a.employee_id;
    insert into public.employee_events(workspace_id,employee_id,actor_user_id,action,summary)
      values(target_workspace_id,a.employee_id,actor_user_id,'job.unassigned','Removed from deleted job '||target.name);
    removed:=removed+1;
  end loop;
  update public.jobs set deleted_at=now(),archived_at=coalesce(archived_at,now()),updated_at=now() where id=target_job_id;
  return jsonb_build_object('removed_count',removed);
end; $function$
;

CREATE OR REPLACE FUNCTION public.delete_catalog_entity_service(actor_user_id uuid, target_workspace_id uuid, entity_kind text, target_entity_id uuid, department_jobs text DEFAULT 'keep'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tbl text; target record; e public.employee_profiles; assignment public.employee_location_assignments;
  job record; replacement uuid; affected integer:=0;
begin
  if actor_user_id is null then raise exception 'Valid actor required' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub',actor_user_id::text,true);
  if not public.workspace_has_permission(target_workspace_id, case entity_kind when 'locations' then 'settings.locations.manage' when 'departments' then 'settings.jobs.manage' else 'settings.shift_catalog.manage' end) then
    raise exception 'Workspace management access required' using errcode='42501'; end if;
  tbl:=case entity_kind when 'locations' then 'locations' when 'departments' then 'departments'
    when 'shift-types' then 'shift_types' when 'shift-labels' then 'shift_labels' end;
  if tbl is null or department_jobs not in ('keep','delete') or department_jobs is null then
    raise exception 'Valid catalog deletion required' using errcode='22023'; end if;
  -- Shares creation's catalog lock; relation triggers serialize stale writes too.
  perform 1 from public.workspaces where id=target_workspace_id for update;
  execute format('select id,name,deleted_at from public.%I where id=$1 and workspace_id=$2 for update',tbl)
    into target using target_entity_id,target_workspace_id;
  if target.id is null then raise exception 'Catalog item not found' using errcode='P0002'; end if;
  if target.deleted_at is not null then return jsonb_build_object('removed_count',0); end if;
  if entity_kind='departments' and exists(select 1 from public.departments
    where id=target_entity_id and system_key is not null) then
    raise exception 'Management and Owner are kept; rename them instead' using errcode='23514', hint='catalog.system_record'; end if;
  if entity_kind='departments' then
    for job in select id from public.jobs where workspace_id=target_workspace_id and department_id=target_entity_id
      and deleted_at is null order by id for update loop
      if department_jobs='delete' then
        perform public.delete_job_with_assignments_service(actor_user_id,target_workspace_id,job.id);
      else
        update public.jobs set department_id=null,updated_at=now() where id=job.id;
      end if;
      affected:=affected+1;
    end loop;
  elsif entity_kind='locations' then
    if not public.can_access_location(target_workspace_id,target_entity_id) then
      raise exception 'Location access required' using errcode='42501'; end if;
    for e in select employee.* from public.employee_profiles employee
      where employee.workspace_id=target_workspace_id and exists(select 1 from public.employee_location_assignments a
        where a.employee_id=employee.id and a.location_id=target_entity_id and a.ended_at is null)
      order by employee.id for update loop
      if not public.workspace_has_permission(target_workspace_id,'employees.manage')
        or not public.workspace_has_permission(target_workspace_id,'employees.read')
        or not public.can_access_employee(target_workspace_id,e.id)
        or not public.can_manage_employee_record(target_workspace_id,e.id) then
        raise exception 'This location has employees you cannot manage. Ask an authorized administrator to delete it.' using errcode='42501'; end if;
    end loop;
    -- Archived first: the owner is kept at every live location, and this one is
    -- going (BL-218).
    update public.locations set archived_at=coalesce(archived_at,now()) where id=target_entity_id;
    for assignment in select * from public.employee_location_assignments
      where workspace_id=target_workspace_id and location_id=target_entity_id and ended_at is null order by employee_id loop
      update public.employee_location_assignments set ended_at=now() where id=assignment.id;
      if assignment.is_primary then
        select a.id into replacement from public.employee_location_assignments a join public.locations l on l.id=a.location_id
          where a.employee_id=assignment.employee_id and a.ended_at is null
          order by (l.archived_at is not null),l.sort_order,lower(l.name),l.id limit 1;
        if replacement is not null then update public.employee_location_assignments set is_primary=true where id=replacement; end if;
      end if;
      update public.employee_profiles set revision=revision+1,updated_at=now() where id=assignment.employee_id;
      insert into public.employee_events(workspace_id,employee_id,actor_user_id,action,summary)
        values(target_workspace_id,assignment.employee_id,actor_user_id,'location.unassigned','Removed from deleted location '||target.name);
      affected:=affected+1;
    end loop;
  end if;
  execute format('update public.%I set deleted_at=now(),archived_at=coalesce(archived_at,now()),updated_at=now() where id=$1',tbl)
    using target_entity_id;
  return jsonb_build_object('removed_count',affected);
end; $function$
;

CREATE OR REPLACE FUNCTION public.assess_weekly_shift_availability(w uuid, emp uuid, shift jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare loc uuid:=(shift->>'location_id')::uuid; day date:=coalesce(shift->>'scheduled_date',shift->>'date')::date;
 zone_name text; preference_zone text; basis text:=coalesce(shift->>'time_basis','explicit'); start_clock time; end_clock time;
 local_start timestamp; local_end timestamp; start_at timestamptz; end_at timestamptz; span tstzrange; day_span tstzrange;
 capacity jsonb; remaining tstzmultirange; unavailable tstzmultirange:='{}'; leave_ranges tstzmultirange:='{}';
 leave_evidence jsonb:='[]'; reasons jsonb:='[]'; settings public.workspace_scheduling_settings%rowtype;
 leave_row record; leave_span tstzrange; coverage text; operation text; fingerprint_payload jsonb;
 conflict_severity text; rule_severity text; rule jsonb; annotated jsonb:='[]'; availability_fingerprint text;
 neighbor record; neighbor_span tstzrange; gap_minutes numeric; schedule_week date; schedule_locations uuid[];
 edit_id uuid:=nullif(shift->>'session_id','')::uuid; context_draft_id uuid:=nullif(shift->>'draft_id','')::uuid;
 exclude_id uuid:=coalesce(nullif(shift->>'_exclude_shift_id',''),shift->>'source_shift_id',shift->>'id')::uuid;
 -- BL-092: shifts this person gives up in the same operation (the other side
 -- of a swap) are not theirs any more when this one becomes theirs.
 given_up uuid[]:=array(select value::uuid from jsonb_array_elements_text(
  case when jsonb_typeof(shift->'_exclude_shift_ids')='array' then shift->'_exclude_shift_ids' else '[]'::jsonb end)
  where value is not null);
 missing_time boolean; invalid_clock boolean:=false; ambiguous_clock boolean:=false;
begin
 select l.timezone,coalesce(nullif(shift->>'time_timezone',''),nullif(shift->'time_snapshot'->>'timezone',''),l.timezone)
  into preference_zone,zone_name from public.locations l where l.workspace_id=w and l.id=loc;
 if day is null or not isfinite(day) or zone_name is null or preference_zone is null
  or not app_private.timezone_name_valid(zone_name)
  or not app_private.timezone_name_valid(preference_zone) then
  raise exception 'A valid location, date and timezone are required for availability assessment' using errcode='22023'; end if;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 if settings.workspace_id is null then raise exception 'Scheduling settings unavailable' using errcode='P0002'; end if;
 if basis not in ('explicit','type_default') then
  raise exception 'Unknown shift time source' using errcode='22023'; end if;
 if basis='type_default' then
  start_clock:=nullif(shift->'time_snapshot'->>'start_time','')::time;
  end_clock:=nullif(shift->'time_snapshot'->>'end_time','')::time;
  if (start_clock,end_clock) is distinct from (nullif(shift->>'start_time','')::time,nullif(shift->>'end_time','')::time) then
   raise exception 'Saved reference hours and their snapshot must agree' using errcode='22023'; end if;
 elsif basis='explicit' then
  start_clock:=nullif(shift->>'start_time','')::time; end_clock:=nullif(shift->>'end_time','')::time;
 end if;
 invalid_clock:=start_clock is not null and start_clock=end_clock;
 missing_time:=start_clock is null or end_clock is null or start_clock=end_clock;
 day_span:=tstzrange(day::timestamp at time zone zone_name,(day+1)::timestamp at time zone zone_name,'[)');
 if not missing_time then
  local_start:=day+start_clock;
  local_end:=day+end_clock+case when end_clock<start_clock then interval '1 day' else interval '0' end;
  start_at:=local_start at time zone zone_name; end_at:=local_end at time zone zone_name;
  invalid_clock:=(start_at at time zone zone_name)<>local_start or (end_at at time zone zone_name)<>local_end or end_at<=start_at;
  if not invalid_clock then
   span:=tstzrange(start_at,end_at,'[)');
   ambiguous_clock:=exists(select 1 from (values(start_at,local_start),(end_at,local_end)) endpoint(instant,wall)
    cross join (values(interval '-1 day'),(interval '1 day')) probe(delta)
    cross join lateral (select (endpoint.wall at time zone 'UTC')-make_interval(secs=>public.availability_utc_offset(endpoint.instant+probe.delta,zone_name)) alternate) alt
    where alt.alternate<>endpoint.instant and (alt.alternate at time zone zone_name)=endpoint.wall);
  end if;
 end if;
 -- Assignment snapshots locate the actual instants; recurring rules are always
 -- interpreted in the target location's current local timezone.
 capacity:=case when emp is null then jsonb_build_object('unavailable_intervals','[]'::jsonb,'employee_intervals','[]'::jsonb,'manager_intervals','[]'::jsonb)
  else public.weekly_preference_capacity(w,emp,coalesce(span,day_span),preference_zone) end;
 select coalesce(range_agg(tstzrange((x->>'start_at')::timestamptz,(x->>'end_at')::timestamptz,'[)')),'{}') into unavailable
  from jsonb_array_elements(capacity->'unavailable_intervals') x;
 for leave_row in select seg.id,seg.request_id,req.revision,approved_piece.span
  from public.schedule_time_off_segments seg
  join public.schedule_time_off_requests req on req.id=seg.request_id and req.workspace_id=seg.workspace_id
  cross join lateral unnest(public.time_off_effective_ranges(seg.id)) approved_piece(span)
  where req.workspace_id=w and req.employee_id=emp and req.request_type='time_off'
   and req.status in('approved','partially_approved') and seg.status='approved'
   and seg.segment_date between day-3 and day+3 order by seg.id,lower(approved_piece.span) loop
  leave_span:=leave_row.span*coalesce(span,day_span);
  if not isempty(leave_span) then
   leave_ranges:=leave_ranges+tstzmultirange(leave_span);
   leave_evidence:=leave_evidence||jsonb_build_array(jsonb_build_object('segment_id',leave_row.id,'request_id',leave_row.request_id,
    'request_revision',leave_row.revision,'intervals',public.availability_ranges_json(tstzmultirange(leave_span))));
  end if;
 end loop;
 remaining:=tstzmultirange(coalesce(span,day_span))-(unavailable+leave_ranges);
 coverage:=case when span is null then 'unknown' when isempty(remaining) then 'none' when remaining @> span then 'full' else 'partial' end;
 if not isempty(leave_ranges) then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','approved_time_off',
  'message','Approved time off overlaps this assignment. Resolve the leave or assignment before assigning.',
  'intervals',public.availability_ranges_json(leave_ranges),'definite',span is not null or leave_ranges @> day_span)); end if;
 -- The employee's own marks and a manager's private reminder are both only a
 -- warning (BL-186, user decision 2026-09-26).
 if span is not null and jsonb_array_length(capacity->'employee_intervals')>0 then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','availability',
  'message','The assignment overlaps unavailable hours.','intervals',capacity->'employee_intervals','definite',true)); end if;
 if span is not null and jsonb_array_length(capacity->'manager_intervals')>0 then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','availability',
  'source','reminder','message','The assignment overlaps hours a manager noted as unavailable.','intervals',capacity->'manager_intervals','definite',true)); end if;
 if missing_time then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','time_source_unresolved',
  'message','Confirm shift hours before assigning or publishing.','definite',false)); end if;
 if invalid_clock then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','invalid_local_time',
  'message','These hours do not exist on this date in the selected timezone. Choose valid hours.','definite',true)); end if;
 -- Required schedule references are hard constraints. Availability-only callers
 -- without a job descriptor retain their existing contract.
 if shift ? 'job_id' then
  if not exists(select 1 from public.locations where workspace_id=w and id=loc and archived_at is null)
   or not exists(select 1 from public.jobs where workspace_id=w and id=(shift->>'job_id')::uuid and archived_at is null)
   or (nullif(shift->>'shift_type_id','') is not null and not exists(select 1 from public.shift_types where workspace_id=w and id=(shift->>'shift_type_id')::uuid and archived_at is null)) then
   reasons:=reasons||jsonb_build_array(jsonb_build_object('code','invalid_reference','message','A location, job or shift type is no longer available.','definite',true));
  end if;
  if emp is not null then
   -- Excluded from Schedule keeps a person out of new shifts only (BL-218): a
   -- shift already published with them stays theirs through edits and republishing.
   if not exists(select 1 from public.employee_profiles where workspace_id=w and id=emp and archived_at is null and (start_date is null or start_date<=day)
     and (not is_excluded_from_schedule or exists(select 1 from public.schedule_published_shifts published
       where published.workspace_id=w and published.employee_id=emp
         and published.source_shift_id=coalesce(nullif(shift->>'source_shift_id',''),shift->>'id')::uuid))) then
    reasons:=reasons||jsonb_build_array(jsonb_build_object('code','employee_inactive','message','Employee is not active in Schedule.','definite',true));
   end if;
   if not exists(select 1 from public.employee_location_assignments where workspace_id=w and employee_id=emp and location_id=loc and ended_at is null)
    or not exists(select 1 from public.employee_job_assignments where workspace_id=w and employee_id=emp and job_id=(shift->>'job_id')::uuid and ended_at is null) then
    reasons:=reasons||jsonb_build_array(jsonb_build_object('code','assignment_missing','message','Employee needs an active location and job assignment.','definite',true));
   end if;
  end if;
  if exists(select 1 from public.schedule_closures c where c.workspace_id=w and c.location_id=loc
   and day between c.closed_date and coalesce(c.end_date,c.closed_date)
   and (c.is_all_day or (shift->>'shift_type_id')::uuid=any(c.shift_type_ids))) then
   reasons:=reasons||jsonb_build_array(jsonb_build_object('code','closed_location','message','Location or shift type is closed on this date.','definite',true));
  end if;
 end if;
 -- The edit session replaces its week; a saved draft replaces its week. Other
 -- current publications remain relevant across locations and week boundaries.
 select week_start,location_ids into schedule_week,schedule_locations from public.schedule_edit_sessions where workspace_id=w and id=edit_id;
 if schedule_week is null then select week_start,location_ids into schedule_week,schedule_locations from public.schedule_drafts where workspace_id=w and id=context_draft_id; end if;
 if span is not null and emp is not null and shift ? 'job_id' then
  for neighbor in
   select s.id,s.location_id,s.scheduled_date,s.start_time,s.end_time,s.time_basis,coalesce(s.time_timezone,l.timezone) zone
    from public.schedule_edit_session_shifts s join public.locations l on l.id=s.location_id and l.workspace_id=w
    where s.workspace_id=w and s.session_id=edit_id and s.employee_id=emp and s.pending_op_type is distinct from 'delete'
     and s.id is distinct from exclude_id and not s.id=any(given_up) and s.scheduled_date between day-2 and day+2
     and (not (shift ? '_publish_locations') or (s.location_id in (select value::uuid from jsonb_array_elements_text(shift->'_publish_locations'))
      and public.schedule_shift_in_department_scope_service(s.job_id,
       case when jsonb_typeof(shift->'_publish_departments')='array' then array(select value::uuid from jsonb_array_elements_text(shift->'_publish_departments')) end,
       coalesce((shift->>'_publish_no_department')::boolean,true))))
   union all
   select s.id,s.location_id,s.scheduled_date,s.start_time,s.end_time,s.time_basis,coalesce(s.time_timezone,l.timezone)
    from public.schedule_draft_shifts s join public.locations l on l.id=s.location_id and l.workspace_id=w
    where edit_id is null and s.workspace_id=w and s.draft_id=context_draft_id and s.employee_id=emp
     and s.id is distinct from exclude_id and not s.id=any(given_up) and s.scheduled_date between day-2 and day+2
     and (not (shift ? '_publish_locations') or (s.location_id in (select value::uuid from jsonb_array_elements_text(shift->'_publish_locations'))
      and public.schedule_shift_in_department_scope_service(s.job_id,
       case when jsonb_typeof(shift->'_publish_departments')='array' then array(select value::uuid from jsonb_array_elements_text(shift->'_publish_departments')) end,
       coalesce((shift->>'_publish_no_department')::boolean,true))))
   union all
   select s.id,s.location_id,s.scheduled_date,s.start_time,s.end_time,s.time_basis,coalesce(s.time_timezone,l.timezone)
    from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current'
    join public.locations l on l.id=s.location_id and l.workspace_id=w
    where s.workspace_id=w and s.employee_id=emp and (shift ? '_publish_locations' or (s.id is distinct from exclude_id and s.source_shift_id is distinct from exclude_id
     and not s.id=any(given_up) and not coalesce(s.source_shift_id,s.id)=any(given_up)))
     and s.scheduled_date between day-2 and day+2
     and (schedule_week is null or s.scheduled_date not between schedule_week and schedule_week+6
      or not s.location_id = any(coalesce(schedule_locations, '{}'))
      or (shift ? '_publish_locations' and not (s.location_id in (select value::uuid from jsonb_array_elements_text(shift->'_publish_locations'))
       and public.schedule_shift_in_department_scope_service(s.job_id,
        case when jsonb_typeof(shift->'_publish_departments')='array' then array(select value::uuid from jsonb_array_elements_text(shift->'_publish_departments')) end,
        coalesce((shift->>'_publish_no_department')::boolean,true)))))
   order by 1
  loop
   neighbor_span:=app_private.shift_time_range(neighbor.scheduled_date,neighbor.start_time,neighbor.end_time,neighbor.zone);
   if span && neighbor_span then
    reasons:=reasons||jsonb_build_array(jsonb_build_object('code','time_overlap','message','Employee already has an overlapping shift.','definite',true,
     'intervals',public.availability_ranges_json(tstzmultirange(span*neighbor_span))));
   else
    gap_minutes:=extract(epoch from greatest(lower(span)-upper(neighbor_span),lower(neighbor_span)-upper(span)))/60;
    if neighbor.location_id<>loc and gap_minutes<settings.minimum_travel_minutes then
     reasons:=reasons||jsonb_build_array(jsonb_build_object('code','minimum_travel','message','There is not enough travel time between locations.','definite',true));
    end if;
    if gap_minutes<settings.minimum_rest_minutes then
     reasons:=reasons||jsonb_build_array(jsonb_build_object('code','minimum_rest','message','There is not enough rest time between shifts.','definite',true));
    end if;
   end if;
  end loop;
 end if;
 reasons:=reasons||app_private.document_shift_reasons(w,emp,day,coalesce(start_at,lower(day_span))); conflict_severity:='allow';
 for rule in select value from jsonb_array_elements(reasons) loop
  rule_severity:=case rule->>'code'
   when 'availability' then 'warn'
   when 'approved_time_off' then settings.conflict_rules->>'approved_time_off'
   when 'closed_location' then settings.conflict_rules->>'closed_location'
   when 'minimum_travel' then settings.conflict_rules->>'minimum_travel'
   when 'minimum_rest' then settings.conflict_rules->>'minimum_rest' when 'document_required' then settings.conflict_rules->>'document_required' when 'document_conditional_grace' then settings.conflict_rules->>'document_conditional_grace' when 'document_conditional_overdue' then settings.conflict_rules->>'document_conditional_overdue'
   when 'time_source_unresolved' then 'confirm'
   else 'block' end;
  if rule->>'code'<>'availability' and array_position(array['allow','warn','confirm','block'],rule_severity)>array_position(array['allow','warn','confirm','block'],conflict_severity) then conflict_severity:=rule_severity; end if;
  if rule_severity<>'allow' then annotated:=annotated||jsonb_build_array(rule||jsonb_build_object('severity',rule_severity)); end if;
 end loop;
 reasons:=annotated;
 operation:=case conflict_severity when 'block' then 'blocked' when 'allow' then 'allowed' else 'warning_requires_override' end;
 -- Revision counters, manager notes and unrelated weekdays/settings are not
 -- conflict identity. The adapters use warning_policy to decide warn/confirm.
 -- Availability is not a conflict: it has its own fingerprint below, which
 -- changes with the person, the shift, its hours or the overlapping marks.
 if span is not null and not isempty(unavailable) then
  availability_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('workspace_id',w,'employee_id',emp,
   'assignment',coalesce(shift->>'source_shift_id',shift->>'id'),'location_id',loc,'date',day,
   'intervals',public.availability_ranges_json(tstzmultirange(span)),
   'employee_intervals',capacity->'employee_intervals','manager_intervals',capacity->'manager_intervals')::text,'UTF8'),'sha256'),'hex');
 end if;
 fingerprint_payload:=jsonb_build_object('workspace_id',w,'employee_id',emp,
  'assignment',jsonb_build_object('id',coalesce(shift->>'source_shift_id',shift->>'id'),'location_id',loc,'date',day),
  'intervals',public.availability_ranges_json(case when span is null then '{}'::tstzmultirange else tstzmultirange(span) end),
  'leave',public.availability_ranges_json(leave_ranges),
  'warning_policy',case when conflict_severity='confirm' then 'confirm' else 'warn' end,'operation',operation,
  'conflict_rules',settings.conflict_rules,'minimum_travel_minutes',settings.minimum_travel_minutes,'minimum_rest_minutes',settings.minimum_rest_minutes,
  'reasons',(select coalesce(jsonb_agg(r),'[]') from jsonb_array_elements(reasons) r where r->>'code'<>'availability'));
 return jsonb_build_object('coverage',coverage,'operation',operation,'time_basis',basis,'timezone',zone_name,'preference_timezone',preference_zone,
  'assessment_scope',case when span is null then 'calendar_day' else 'shift_interval' end,
  'intervals',public.availability_ranges_json(case when span is null then '{}'::tstzmultirange else tstzmultirange(span) end),
  'available_intervals',case when span is null then '[]'::jsonb else public.availability_ranges_json(remaining) end,
  'unavailable_intervals',public.availability_ranges_json(unavailable+leave_ranges),
  'unknown_intervals',case when span is null then public.availability_ranges_json(tstzmultirange(day_span)) else '[]'::jsonb end,
  'employee_intervals',capacity->'employee_intervals','manager_intervals',capacity->'manager_intervals',
  'has_availability_conflict',span is not null and not isempty(unavailable),'availability_fingerprint',availability_fingerprint,'conflict_severity',conflict_severity,
  'warning_policy',case when conflict_severity='confirm' then 'confirm' else 'warn' end,
  'leave',leave_evidence,'reasons',reasons,
  'policy_revision',settings.availability_preferences_revision,
  'fold_resolution',case when ambiguous_clock then 'post_transition_offset' else null end,
  'assessment_minutes',case when span is null then null else extract(epoch from upper(span)-lower(span))/60 end,
  'fingerprint',encode(extensions.digest(convert_to(fingerprint_payload::text,'UTF8'),'sha256'),'hex'));
end; $function$
;

CREATE OR REPLACE FUNCTION public.apply_schedule_template_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, expected_session_revision integer, target_template_id uuid, apply_mode text, department_keys text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_session public.schedule_edit_sessions%rowtype;
  template_row public.schedule_templates%rowtype;
  source record;
  applied_count integer := 0;
  converted_count integer := 0;
  chosen_employee uuid;
  target_date date;
  target_end_date date;
  selected_department_ids uuid[] := '{}'::uuid[];
  include_no_department boolean := false;
  template_scope uuid[];
  live_locations uuid[];
  kept_ids uuid[];
  kept_names text[];
  left_off text[] := '{}'::text[];
  skipped jsonb;
begin
 perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.templates',
   target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.templates'));
 template_scope := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.templates');
 perform public.availability_lock_workspace(target_workspace_id);
  if apply_mode not in ('merge', 'overwrite') then
    raise exception 'invalid template apply mode' using errcode = '22023';
  end if;

  -- No department list: the whole template, as the six-argument twin did.
  if department_keys is not null then
    if cardinality(department_keys) = 0 then
      raise exception 'select at least one department' using errcode = '22023';
    end if;

    if exists (
      select 1
      from unnest(department_keys) as key(value)
      where key.value <> '__no_department__'
        and key.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
      raise exception 'invalid department key' using errcode = '22023';
    end if;

    select coalesce(array_agg(key.value::uuid), '{}'::uuid[])
      into selected_department_ids
    from unnest(department_keys) as key(value)
    where key.value <> '__no_department__';

    include_no_department := '__no_department__' = any(department_keys);
  end if;

  if exists (
    select 1
    from unnest(selected_department_ids) as selected_department(id)
    left join public.departments department
      on department.id = selected_department.id
     and department.workspace_id = target_workspace_id
     and department.archived_at is null
    where department.id is null
  ) then
    raise exception 'schedule template department not found' using errcode = 'P0002';
  end if;

  select *
    into target_session
  from public.schedule_edit_sessions session
  where session.id = target_session_id
    and session.workspace_id = target_workspace_id
  for update;

  if target_session.id is null or target_session.holder_user_id <> actor_user_id then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;

  if target_session.status <> 'active' or target_session.expires_at <= now() then
    raise exception 'edit lease expired' using errcode = '40001';
  end if;

  if target_session.revision <> expected_session_revision then
    raise exception 'session revision stale' using errcode = '40001';
  end if;

  select *
    into template_row
  from public.schedule_templates template
  where template.id = target_template_id
    and template.workspace_id = target_workspace_id;

  if template_row.id is null then
    raise exception 'schedule template not found' using errcode = 'P0002';
  end if;
  -- Shifts at a deleted location are neither checked nor written (Q-C).
  live_locations := public.live_location_ids(target_workspace_id, array(
    select distinct s.location_id from public.schedule_template_shifts s where s.template_id = template_row.id));

  if exists (
    select 1
    from public.schedule_template_shifts template_shift
    left join public.locations location
      on location.id = template_shift.location_id
     and location.workspace_id = template_shift.workspace_id
     and location.archived_at is null
    left join public.jobs job
      on job.id = template_shift.job_id
     and job.workspace_id = template_shift.workspace_id
     and job.archived_at is null
    left join public.shift_types shift_type
      on shift_type.id = template_shift.shift_type_id
     and shift_type.workspace_id = template_shift.workspace_id
     and shift_type.archived_at is null
    where template_shift.template_id = template_row.id
      and template_shift.location_id = any (live_locations)
      and (
        location.id is null
        or job.id is null
        or (template_shift.shift_type_id is not null and shift_type.id is null)
        or not template_shift.location_id = any (template_scope)
      )
  ) then
    raise exception 'schedule template references unavailable schedule definitions' using errcode = '23503';
  end if;

  if apply_mode = 'overwrite' then
    delete from public.schedule_edit_session_shifts session_shift
    using public.jobs job
    where session_shift.session_id = target_session.id
      and session_shift.workspace_id = target_workspace_id
      and job.id = session_shift.job_id
      and job.workspace_id = session_shift.workspace_id
      and (
        department_keys is null
        or job.department_id = any(selected_department_ids)
        or (job.department_id is null and include_no_department)
      );
  end if;

  for source in
    select template_shift.*
    from public.schedule_template_shifts template_shift
    join public.jobs job
      on job.id = template_shift.job_id
     and job.workspace_id = template_shift.workspace_id
    where template_shift.template_id = template_row.id
      and template_shift.workspace_id = target_workspace_id
      and template_shift.location_id = any (live_locations)
      and (
        department_keys is null
        or job.department_id = any(selected_department_ids)
        or (job.department_id is null and include_no_department)
      )
    order by template_shift.day_offset, template_shift.start_time, template_shift.id
  loop
    target_date := target_session.week_start + source.day_offset;
    target_end_date := target_date + case when source.end_time <= source.start_time then 1 else 0 end;
    chosen_employee := source.employee_id;

    if chosen_employee is not null and (
      not exists (
        select 1
        from public.employee_profiles employee
        join public.employee_location_assignments location_assignment
          on location_assignment.employee_id = employee.id
         and location_assignment.workspace_id = employee.workspace_id
         and location_assignment.location_id = source.location_id
         and location_assignment.ended_at is null
        join public.employee_job_assignments job_assignment
          on job_assignment.employee_id = employee.id
         and job_assignment.workspace_id = employee.workspace_id
         and job_assignment.job_id = source.job_id
         and job_assignment.ended_at is null
        where employee.id = chosen_employee
          and employee.workspace_id = target_workspace_id
          and employee.archived_at is null
          -- Excluded from Schedule: the template's shift comes in open (BL-218).
          and not employee.is_excluded_from_schedule
      )
      or exists (
        select 1
        from public.schedule_edit_session_shifts existing_shift
        where existing_shift.session_id = target_session.id
          and existing_shift.employee_id = chosen_employee
          and tsrange(
            existing_shift.scheduled_date + existing_shift.start_time,
            existing_shift.scheduled_date + existing_shift.end_time + case
              when existing_shift.end_time <= existing_shift.start_time then interval '1 day'
              else interval '0'
            end,
            '[)'
          ) && tsrange(target_date + source.start_time, target_end_date + source.end_time, '[)')
      )
    ) then
      chosen_employee := null;
      converted_count := converted_count + 1;
    end if;

    -- Only labels still active in Settings > Shift labels, named as there
    -- (BL-164); the rest are left off and counted (BL-197).
    select coalesce(array_agg(label.id order by tag.ord), '{}'::uuid[]), coalesce(array_agg(label.name order by tag.ord), '{}'::text[])
      into kept_ids, kept_names
    from unnest(coalesce(source.label_ids, '{}'::uuid[])) with ordinality as tag(id, ord)
    join public.shift_labels label
      on label.id = tag.id and label.workspace_id = target_workspace_id and label.archived_at is null;
    left_off := left_off || array(
      select coalesce(nullif(tag.name, ''), 'Unnamed label')
      from unnest(coalesce(source.label_ids, '{}'::uuid[]), coalesce(source.label_names, '{}'::text[])) as tag(id, name)
      where tag.id is not null and not tag.id = any (kept_ids));

    insert into public.schedule_edit_session_shifts(id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, hide_time_on_badge, label_ids, label_names, note)
    values(gen_random_uuid(), target_workspace_id, target_session.id, source.location_id, chosen_employee, source.job_id, source.shift_type_id, target_date, source.start_time, source.end_time, source.time_basis, source.time_snapshot, source.time_timezone, source.hide_time_on_badge, kept_ids, kept_names, source.note);
    applied_count := applied_count + 1;
  end loop;

  -- What was not applied, one entry per kind and name; BL-197 fills archived labels.
  select coalesce(jsonb_agg(jsonb_build_object('kind', 'archived_label', 'name', x.name, 'shift_count', x.n) order by x.name), '[]'::jsonb)
    into skipped
  from (select name, count(*)::integer n from unnest(left_off) name group by name) x;

  update public.schedule_edit_sessions
     set revision = revision + 1,
         dirty = true,
         last_heartbeat = now(),
         expires_at = now() + interval '4 minutes'
   where id = target_session.id;

  insert into public.schedule_template_events(
    workspace_id,
    template_id,
    template_name,
    action,
    actor_user_id,
    session_id,
    detail
  )
  values(
    target_workspace_id,
    template_row.id,
    template_row.name,
    'applied',
    actor_user_id,
    target_session.id,
    jsonb_build_object(
      'mode', apply_mode,
      'department_keys', to_jsonb(department_keys),
      'applied_shift_count', applied_count,
      'converted_open_count', converted_count,
      'skipped', skipped
    )
  );

  return jsonb_build_object(
    'status', 'applied',
    'mode', apply_mode,
    'applied_shift_count', applied_count,
    'converted_open_count', converted_count,
    'skipped', skipped,
    'session', public.get_schedule_edit_session_service(
      actor_user_id,
      target_workspace_id,
      target_session.id
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.read_settings_jobs_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.jobs.read');
  return jsonb_build_object(
    'departments', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.sort_order, d.name, d.id), '[]'::jsonb)
      from (
        select department.id, department.workspace_id, department.name, department.color,
          department.sort_order, department.archived_at, department.system_key
        from public.departments department
        where department.workspace_id = target_workspace_id and department.deleted_at is null
      ) d),
    'jobs', (
      select coalesce(jsonb_agg(to_jsonb(j) order by j.sort_order, j.name, j.id), '[]'::jsonb)
      from (
        select job.id, job.workspace_id, job.department_id, job.name, job.color, job.sort_order, job.archived_at,
          job.system_key
        from public.jobs job
        where job.workspace_id = target_workspace_id and job.deleted_at is null
      ) j)
  );
end;
$function$
;

-- 6. Every workspace has them, and every owner works the Owner job ---------------------

select app_private.ensure_management_and_owner(workspace.id) from public.workspaces workspace;
select app_private.open_owner_record_to_everything(employee.workspace_id, employee.id, employee.user_id)
from public.employee_profiles employee
where employee.archived_at is null
  and app_private.employee_record_is_workspace_owner(employee.workspace_id, employee.id);
