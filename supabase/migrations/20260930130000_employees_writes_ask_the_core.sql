-- FB-6.2.4: writing to Employees asks the authorization core.
--
-- 1. Saving, archiving, ending employment, taking access away, changing a role
--    and removing a photo each ask app_private.authorize() first, with the
--    person as the target. The browser-era bodies (save_employee,
--    set_employee_archived, terminate_employee) and the location helper only
--    saving used go; the service functions are the only entry points.
--    Closes: an admin saves their own record; an admin does not save, remove
--    access from or change the role of another admin (KK-24, BL-270); a
--    manager moves somebody between employee roles at their locations (6A); a
--    manager who only manages a location saves the records there; somebody
--    with no location left can have their employment ended (S1).
-- 2. The membership guard (BL-270) no longer lets a change through because
--    nobody is signed in. An application caller changes a role, restores
--    access, activates an account or adds a membership only through a service
--    that asked the core and says so for that row (app.membership_change), or
--    through the three flows that already say so (joining by invitation,
--    ownership transfer, the owner's first membership). Taking access away
--    (suspending) grants nothing and passes. The database owner working
--    directly (migrations, seed, test fixtures) is not an application caller;
--    it could switch the trigger off anyway.
-- 3. "Yalnız yönetir": the admin's command to set the locations a manager
--    manages without working there (employee.set_managed_locations). Only a
--    manager's membership holds such rows (review D2: a foreign key on the
--    role), and a manager whose role falls below manager loses them in the
--    same step; the role service writes which ones to the audit log (S3).

-- 3a. Only a manager manages without working there ----------------------------------

alter table public.workspace_memberships
  add constraint workspace_memberships_id_workspace_id_role_key unique (id, workspace_id, role);

alter table public.membership_managed_locations
  add column role public.workspace_role not null default 'manager' check (role = 'manager'),
  add constraint membership_managed_locations_manager_fkey
    foreign key (membership_id, workspace_id, role)
    references public.workspace_memberships (id, workspace_id, role);

create function app_private.managed_locations_follow_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.membership_managed_locations where membership_id = old.id;
  return new;
end;
$$;

-- Fires after a_sync_membership_role_reference_trigger has set the role from
-- role_id (triggers run in name order), so a change of role_id alone counts.
create trigger managed_locations_follow_role
  before update on public.workspace_memberships
  for each row
  when (old.role = 'manager' and new.role is distinct from 'manager')
  execute function app_private.managed_locations_follow_role();

insert into app_private.authz_actions
  (key, scope_class, effect, permission_key, owner_only, restricted_ok, self_ok, no_self, rank_below)
values
  ('employee.set_managed_locations', 'person', 'cross', 'employees.manage', false, false, false, true, true);

create function public.set_employee_managed_locations_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  location_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  member public.workspace_memberships%rowtype;
  wanted uuid[] := array(select distinct place from unnest(coalesce(location_ids, '{}'::uuid[])) place order by place);
  held uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.set_managed_locations',
    target_person => target_employee_id);

  select membership.* into member
  from public.employee_profiles employee
  join public.workspace_memberships membership
    on membership.workspace_id = employee.workspace_id and membership.user_id = employee.user_id
  where employee.id = target_employee_id and employee.workspace_id = target_workspace_id
  for update of membership;
  if member.id is null or (app_private.actor(member.user_id, target_workspace_id)).class <> 'manager' then
    raise exception 'Only a manager manages a location without working there'
      using errcode = '22023', hint = 'employee.not_a_manager';
  end if;

  select coalesce(array_agg(managed.location_id order by managed.location_id), '{}') into held
  from public.membership_managed_locations managed
  where managed.membership_id = member.id;

  -- A location added is a live one of this workspace; anything else is out of
  -- reach, as an unknown id is.
  if exists (
    select 1 from unnest(wanted) place
    where not place = any (held)
      and not exists (
        select 1 from public.locations location
        where location.id = place and location.workspace_id = target_workspace_id
          and location.deleted_at is null and location.archived_at is null)
  ) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope',
      detail = 'employee.set_managed_locations';
  end if;

  delete from public.membership_managed_locations
  where membership_id = member.id and not location_id = any (wanted);
  insert into public.membership_managed_locations (workspace_id, membership_id, location_id, added_by)
  select target_workspace_id, member.id, place, actor_user_id
  from unnest(wanted) place
  where not place = any (held);

  if wanted is distinct from held then
    insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
    values (target_workspace_id, actor_user_id, 'employee.managed_locations_changed', 'employee',
      target_employee_id::text, jsonb_build_object(
        'added', to_jsonb(array(select unnest(wanted) except select unnest(held))),
        'removed', to_jsonb(array(select unnest(held) except select unnest(wanted)))));
  end if;

  return jsonb_build_object('employee_id', target_employee_id, 'location_ids', to_jsonb(wanted));
end;
$$;

revoke all on function public.set_employee_managed_locations_service(uuid, uuid, uuid, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.set_employee_managed_locations_service(uuid, uuid, uuid, uuid[]) to service_role;

-- 2. The membership guard ----------------------------------------------------------

create or replace function public.enforce_membership_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_class public.workspace_role;
  new_class public.workspace_role;
begin
  -- The database owner working directly (migrations, seed, test fixtures:
  -- signed in as postgres, with no role set or set back to it) is not an
  -- application caller: every API and browser call signs in as another user
  -- and runs as service_role or authenticated.
  -- ponytail: the console could disable this trigger anyway.
  if session_user = 'postgres' and current_setting('role') in ('none', 'postgres') then
    return new;
  end if;
  new_class := (select role.access_class from public.workspace_roles role where role.id = new.role_id);
  if tg_op = 'UPDATE' then
    old_class := (select role.access_class from public.workspace_roles role where role.id = old.role_id);
  end if;

  -- Taking access away grants nothing; neither does a change that leaves the
  -- role, the account and the status as they were.
  if tg_op = 'UPDATE'
     and new.workspace_id = old.workspace_id
     and new.user_id is not distinct from old.user_id
     and new.role_id = old.role_id
     and (new.status = old.status or new.status = 'suspended'::public.membership_status) then
    return new;
  end if;

  -- A service that asked the core for this row.
  if current_setting('app.membership_change', true) = new.id::text then
    return new;
  end if;

  -- Joining by invitation, checked by the accept flow: a new pending account,
  -- or a suspended one reopened pending, never the owner's (nf-guvenlik O1).
  if coalesce(current_setting('app.employee_invitation_accept', true), '') = 'on'
     and app_private.authz_rank(new_class) < app_private.authz_rank('owner')
     and new.status = 'pending_activation'::public.membership_status
     and (tg_op = 'INSERT'
          or (old.workspace_id = new.workspace_id and old.user_id = new.user_id
              and old.status = 'suspended'::public.membership_status)) then
    return new;
  end if;

  -- The accepted ownership transfer's two rows, validated and locked by the
  -- transfer service: the target admin becomes owner and the owner admin, both
  -- staying active, for the account the transfer names (nf-guvenlik O1).
  if tg_op = 'UPDATE' and coalesce(current_setting('app.owner_transfer', true), '') = 'on'
     and new.workspace_id = old.workspace_id and new.user_id = old.user_id
     and new.status = 'active'::public.membership_status and old.status = 'active'::public.membership_status
     and exists (
       select 1 from public.workspace_ownership_transfers transfer
       join public.workspace_memberships target
         on target.id = transfer.target_membership_id and target.workspace_id = transfer.workspace_id
       where transfer.workspace_id = new.workspace_id and transfer.status = 'pending'
         and transfer.expires_at > now()
         and target.user_id = transfer.target_user_id
         and ((transfer.target_membership_id = new.id and old_class = 'admin' and new_class = 'owner')
           or (transfer.previous_owner_membership_id = new.id and old_class = 'owner' and new_class = 'admin'))
     ) then
    return new;
  end if;

  -- The first membership of a workspace, its creator's.
  if tg_op = 'INSERT' and exists (
    select 1 from public.workspaces workspace
    where workspace.id = new.workspace_id and workspace.created_by = new.user_id
      and not exists (select 1 from public.workspace_memberships existing where existing.workspace_id = new.workspace_id)
  ) then
    return new;
  end if;

  raise exception 'membership change is not permitted' using errcode = '42501', hint = 'authz.missing_permission';
end;
$$;

-- Finishing onboarding opens the account: it says so for that row, instead of
-- hiding who asked.
create or replace function public.activate_employee_onboarding_case_service(target_case_id uuid, actor_user_id uuid, event_action text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_case public.employee_onboarding_cases%rowtype;
  next_revision integer;
begin
  select * into target_case
  from public.employee_onboarding_cases
  where id = target_case_id
  for update;

  if target_case.id is null then
    raise exception 'onboarding case unavailable' using errcode = 'P0002';
  end if;
  if exists(select 1 from public.employee_onboarding_requirements r where r.case_id=target_case.id and app_private.document_activation_blocked(r)) then raise exception 'Submit conditional documents or give an initial reason' using errcode='23514'; end if;
  if exists (
    select 1
    from public.employee_onboarding_requirements
    where case_id = target_case.id
      and (kind<>'document' or (publication_paused_at is null and not lifecycle_exempt and lifecycle_closed_at is null and status<>'superseded')) and required
      and blocks_activation
      and status <> 'completed'::public.employee_onboarding_requirement_status
  ) then
    raise exception 'activation-blocking requirements remain' using errcode = '23514';
  end if;

  perform set_config('app.membership_change', target_case.membership_id::text, true);
  update public.workspace_memberships
  set status = 'active', updated_at = now()
  where id = target_case.membership_id and status = 'pending_activation';
  if not found then
    raise exception 'pending membership unavailable' using errcode = '23514';
  end if;

  update public.employee_onboarding_cases
  set status = 'approved'::public.employee_onboarding_case_status,
      approved_by = actor_user_id,
      approved_at = now(),
      revision = revision + 1,
      updated_at = now()
  where id = target_case.id
  returning revision into next_revision;

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (
    target_case.workspace_id,
    target_case.employee_id,
    actor_user_id,
    event_action,
    'Employee onboarding approved and workspace access activated'
  );

  return next_revision;
end;
$$;

-- 1. The writes ------------------------------------------------------------------------

-- A restored account reaches where its role's class says (the membership's
-- location scope follows the role); the snapshot keeps the role only.
alter table public.employee_access_snapshots
  drop column all_locations,
  drop column location_ids;

drop function public.save_employee(uuid, uuid, text, text, text, text, text, date, text, uuid[], uuid, uuid[], uuid, boolean, boolean, integer);
drop function public.can_assign_employee_locations(uuid, uuid[]);

create or replace function public.save_employee_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  employee_first_name text,
  employee_middle_name text,
  employee_last_name text,
  employee_preferred_name text,
  employee_invitation_email text,
  employee_start_date date,
  employee_internal_note text,
  location_ids uuid[],
  primary_location_id uuid,
  job_ids uuid[],
  primary_job_id uuid,
  employee_is_remote boolean,
  employee_is_excluded_from_schedule boolean,
  expected_revision integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid := target_employee_id;
  reachable uuid[];
  current_revision integer;
  next_code bigint;
  assignment_optional boolean := coalesce(employee_is_remote, false) or coalesce(employee_is_excluded_from_schedule, false);
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

  if char_length(btrim(employee_first_name)) not between 1 and 80 or char_length(btrim(employee_last_name)) not between 1 and 80 then
    raise exception 'employee first and last name are required' using errcode = '22023';
  end if;
  -- Somebody not Remote nor excluded from Schedule needs a location, a primary
  -- location and a job, and a primary job only when a job sits outside
  -- Management: a Management job is primary by its department (BL-218 .3b).
  -- The owner's record needs none of it: the owner may work anywhere.
  if not assignment_optional and not app_private.employee_record_is_workspace_owner(target_workspace_id, target_employee_id) then
    if cardinality(coalesce(location_ids, '{}'::uuid[])) = 0 or primary_location_id is null then
      raise exception 'employee requires a location and job unless remote or excluded from schedule'
        using errcode = '22023', hint = 'employee.location_required';
    end if;
    if cardinality(coalesce(job_ids, '{}'::uuid[])) = 0 then
      raise exception 'employee requires a location and job unless remote or excluded from schedule'
        using errcode = '22023', hint = 'employee.job_required';
    end if;
    -- Only this workspace's Management counts: another workspace's job reads as
    -- unknown here, so the answer says nothing about it.
    if primary_job_id is null and exists (
      select 1 from unnest(job_ids) selected(job_id)
      where not exists (
        select 1 from public.jobs job
        join public.departments department on department.id = job.department_id
        where job.id = selected.job_id and job.workspace_id = target_workspace_id
          and department.system_key = 'management'
      )
    ) then
      raise exception 'employee requires a primary job outside Management'
        using errcode = '22023', hint = 'employee.primary_job_required';
    end if;
  end if;
  if primary_location_id is not null and not primary_location_id = any(coalesce(location_ids, '{}'::uuid[])) then
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
      where location.id is null
         or (not selected.location_id = any (reachable) and not exists (
           select 1 from public.employee_location_assignments existing
           where existing.employee_id = target_employee_id and existing.location_id = selected.location_id
             and existing.ended_at is null))
    )
    or exists (
      select 1 from public.employee_location_assignments existing
      where existing.employee_id = target_employee_id and existing.ended_at is null
        and not existing.location_id = any (coalesce(location_ids, '{}'::uuid[]))
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
    if expected_revision is null or expected_revision <> current_revision then raise exception 'employee revision conflict' using errcode = '40001'; end if;
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
    and not location_id = any(coalesce(location_ids, '{}'::uuid[]));
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
  return saved_id;
end;
$$;

-- Handing out a role: the role service, and giving access back, which hands
-- out the role the account had (nf-guvenlik Y1). An admin's role is the
-- owner's to give (and nobody's the owner's: that is a transfer); any other,
-- whoever may change this person's role; and nobody gives a role at or above
-- their own (a manager moves people between employee roles only, 6A).
create function app_private.authorize_role_grant(
  actor uuid,
  w uuid,
  next_role_id uuid,
  target_person uuid default null,
  target_user uuid default null
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  next_class public.workspace_role := (
    select role.access_class from public.workspace_roles role where role.id = next_role_id and role.workspace_id = w
  );
begin
  perform app_private.authorize(actor, w,
    case when app_private.authz_rank(next_class) >= app_private.authz_rank('admin')
      then 'employee.make_admin' else 'employee.change_role' end,
    target_person => target_person, target_user => target_user);
  if next_class is null then
    raise exception 'target role not found' using errcode = 'P0002';
  end if;
  if app_private.authz_rank(next_class) >= app_private.authz_rank((app_private.actor(actor, w)).class) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.rank', detail = 'employee.change_role';
  end if;
end;
$$;
revoke all on function app_private.authorize_role_grant(uuid, uuid, uuid, uuid, uuid) from public;

drop function public.set_employee_archived(uuid, uuid, boolean, boolean);

create or replace function public.set_employee_archived_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  should_archive boolean,
  restore_access boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
    values (target_workspace_id, target_employee_id, member.id, member.role_id, actor_user_id);

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
    set role_id = snapshot.role_id, status = 'active'::public.membership_status, updated_at = now()
    where id = snapshot.membership_id;

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
end;
$$;

drop function public.terminate_employee(uuid, uuid, timestamp without time zone, text, text, uuid);

create or replace function public.terminate_employee_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  effective_local timestamp without time zone,
  worksite_timezone text,
  termination_reason text,
  target_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    values (target_workspace_id, target_employee_id, member.id, member.role_id, actor_user_id);
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
    and (shift.scheduled_date + shift.start_time) at time zone location.timezone >= resolved_effective_at;

  get diagnostics released_count = row_count;

  update public.schedule_published_shifts shift
  set employee_id = null
  from public.employee_offboarding_shift_actions action
  where action.termination_id = v_termination_id
    and action.shift_id = shift.id
    and action.workspace_id = shift.workspace_id;

  insert into public.employee_offboarding_followups (
    workspace_id, termination_id, shift_id, location_id, kind, context
  )
  select action.workspace_id, action.termination_id, action.shift_id,
    action.location_id, kind.value,
    jsonb_build_object('shift_start_at', action.shift_start_at, 'employee_id', target_employee_id)
  from public.employee_offboarding_shift_actions action
  cross join (values ('coverage_alert'), ('compliance_review')) as kind(value)
  where action.termination_id = v_termination_id;

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

create or replace function public.remove_employee_access_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee public.employee_profiles%rowtype;
  membership public.workspace_memberships%rowtype;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.remove_access', target_person => target_employee_id);

  select * into employee
  from public.employee_profiles
  where id = target_employee_id and workspace_id = target_workspace_id and archived_at is null
  for update;
  if employee.id is null then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;
  if employee.user_id is null then
    return;
  end if;

  select * into membership
  from public.workspace_memberships
  where workspace_id = target_workspace_id and user_id = employee.user_id
  for update;
  if membership.id is null then
    raise exception 'linked workspace membership not found' using errcode = 'P0002';
  end if;

  update public.workspace_memberships
  set status = 'suspended'::public.membership_status, updated_at = now()
  where id = membership.id;

  update public.employee_profiles
  set user_id = null, revision = revision + 1, updated_at = now()
  where id = employee.id;

  update public.employee_invitations
  set status = 'revoked'::public.employee_invitation_status, revoked_at = now(), updated_at = now()
  where employee_id = employee.id and status = 'pending'::public.employee_invitation_status;

  update public.employee_onboarding_cases
  set status = 'cancelled'::public.employee_onboarding_case_status,
      submitted_at = null,
      approved_at = null,
      approved_by = null,
      revision = revision + 1,
      updated_at = now()
  where employee_id = employee.id
    and status <> 'cancelled'::public.employee_onboarding_case_status;

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (target_workspace_id, target_employee_id, actor_user_id, 'employee.access_removed',
    'Workspace access removed and employee account unlinked');
end;
$$;

create or replace function public.update_employee_membership_role_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  target_role_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_employee public.employee_profiles%rowtype;
  target_membership public.workspace_memberships%rowtype;
  existing_role public.workspace_roles%rowtype;
  next_role public.workspace_roles%rowtype;
  managed_before uuid[];
  managed_removed uuid[];
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
  where role.id = target_membership.role_id and role.workspace_id = target_workspace_id;

  select coalesce(array_agg(managed.location_id order by managed.location_id), '{}') into managed_before
  from public.membership_managed_locations managed
  where managed.membership_id = target_membership.id;

  perform set_config('app.membership_change', target_membership.id::text, true);
  update public.workspace_memberships
  set role_id = next_role.id, updated_at = now()
  where id = target_membership.id and workspace_id = target_workspace_id;

  -- A manager no longer: their managed locations went with the role (S3).
  managed_removed := array(
    select place from unnest(managed_before) place
    except
    select managed.location_id from public.membership_managed_locations managed
    where managed.membership_id = target_membership.id
  );

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
      'to_access_class', next_role.access_class,
      'managed_locations_removed', to_jsonb(managed_removed)
    )
  );

  return jsonb_build_object(
    'membership_id', target_membership.id,
    'role_id', next_role.id,
    'role_name', next_role.name,
    'access_class', next_role.access_class
  );
end;
$$;

create or replace function public.remove_employee_avatar_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  avatar_path text;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.save', target_person => target_employee_id);

  select private_profile.avatar_object_path into avatar_path
  from public.employee_private_profiles private_profile
  where private_profile.workspace_id = target_workspace_id
    and private_profile.employee_id = target_employee_id
  for update;

  if avatar_path is null then
    return null;
  end if;

  update public.employee_private_profiles
  set avatar_object_path = null, updated_at = now()
  where workspace_id = target_workspace_id and employee_id = target_employee_id;

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (target_workspace_id, target_employee_id, actor_user_id, 'employee.avatar_removed', 'Workspace profile photo removed');

  return avatar_path;
end;
$$;

-- 4. Browser write policies nobody can use ------------------------------------------
-- The browser has no update or delete grant on memberships; these two never
-- ran, and read like a second rule for who changes a membership.
drop policy memberships_update_manager on public.workspace_memberships;
drop policy memberships_delete_manager on public.workspace_memberships;
