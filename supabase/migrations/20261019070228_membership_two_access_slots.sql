-- ROL-CIFT 1.1: a membership holds two access slots (KARARLAR S-164 ... S-169; design
-- docs/superpowers/specs/2026-10-18-rol-cift-design.md §3, §4.2, §4.13, §5.1).
--
--   role_id           the management slot: a manager, admin or owner class role, or empty
--   employee_role_id  the employee slot: an employee class role, or empty
--   at least one of the two is filled.
--
-- What a manager manages ("Manages") leaves the employee's location assignments ("Works at") for
-- membership_managed_locations; the Management jobs of a management access live in
-- membership_management_jobs. role (the class name copied next to role_id) and all_locations go, with
-- the two triggers that kept them.
--
-- Today's people move in the same step (design §5.1). Riskli canlı migration: it drops columns and
-- rewrites membership triggers; the main session applies it live after a backup, ONAY and Mert's "evet".
--
-- ponytail: the core (app_private.actor, 1.2), the test world (1.4) and every service that still names
-- workspace_memberships.role are rewritten in the next tasks of the same slice; between them the branch
-- is knowingly red.

-- The two tables --------------------------------------------------------------------------------------

create table public.membership_managed_locations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  membership_id uuid not null,
  location_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint membership_managed_locations_once unique (membership_id, location_id),
  constraint membership_managed_locations_membership_fkey foreign key (membership_id, workspace_id)
    references public.workspace_memberships(id, workspace_id) on delete cascade,
  constraint membership_managed_locations_location_fkey foreign key (location_id, workspace_id)
    references public.locations(id, workspace_id) on delete restrict
);
create index membership_managed_locations_location_idx
  on public.membership_managed_locations (workspace_id, location_id);
comment on table public.membership_managed_locations is
  'Manages: the locations a manager class management access manages. Admins and owners manage every live location and have no rows (ROL-CIFT, design §4.2).';

create table public.membership_management_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  membership_id uuid not null,
  job_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint membership_management_jobs_once unique (membership_id, job_id),
  constraint membership_management_jobs_membership_fkey foreign key (membership_id, workspace_id)
    references public.workspace_memberships(id, workspace_id) on delete cascade,
  constraint membership_management_jobs_job_fkey foreign key (job_id, workspace_id)
    references public.jobs(id, workspace_id) on delete restrict
);
create index membership_management_jobs_job_idx
  on public.membership_management_jobs (workspace_id, job_id);
comment on table public.membership_management_jobs is
  'The Management department jobs of a management access (General Manager, Owner ...): the position document rules read (ROL-CIFT, design §4.13).';

-- Row level security on, nothing granted to the browser: the services read and write both tables.
-- Plandan sapma (deviation from the plan): the plan read both through an rls_can('employee.read')
-- policy; here the browser does not read them at all, only the services do (no grant, no policy).
alter table public.membership_managed_locations enable row level security;
alter table public.membership_management_jobs enable row level security;
revoke all on table public.membership_managed_locations from public, anon, authenticated;
revoke all on table public.membership_management_jobs from public, anon, authenticated;

-- The rules the rows keep -----------------------------------------------------------------------------

-- A role's kind (manager, admin, owner or employee), for the slot rules below: which slot a role fits,
-- not what anybody may do.
create function app_private.role_class(target_role uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select r.access_class from public.workspace_roles r where r.id = target_role;
$$;
revoke all on function app_private.role_class(uuid) from public, anon, authenticated;

-- Each slot holds its kind of role.
create function app_private.membership_access_slots_hold()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role_id is not null and (
    not exists (select 1 from public.workspace_roles r where r.id = new.role_id and r.workspace_id = new.workspace_id)
    or app_private.role_class(new.role_id) = 'employee'
  ) then
    raise exception 'the management slot holds a manager, admin or owner class role'
      using errcode = '23514', hint = 'membership.management_slot';
  end if;
  if new.employee_role_id is not null and (
    not exists (select 1 from public.workspace_roles r where r.id = new.employee_role_id and r.workspace_id = new.workspace_id)
    or app_private.role_class(new.employee_role_id) is distinct from 'employee'
  ) then
    raise exception 'the employee slot holds an employee class role'
      using errcode = '23514', hint = 'membership.employee_slot';
  end if;
  return new;
end;
$$;
revoke all on function app_private.membership_access_slots_hold() from public, anon, authenticated;

-- The management slot's rows follow it: a manager made admin manages everything, and a management
-- access given up takes its Management jobs with it (design §4.13). The Owner job stays with the owner.
create function app_private.membership_slot_rows_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  slot_class public.workspace_role := (select r.access_class from public.workspace_roles r where r.id = new.role_id);
begin
  if slot_class is distinct from 'manager' then
    delete from public.membership_managed_locations where membership_id = new.id;
  end if;
  if slot_class is null then
    delete from public.membership_management_jobs where membership_id = new.id;
  elsif slot_class <> 'owner' then
    delete from public.membership_management_jobs mj
    using public.jobs j
    where mj.membership_id = new.id and j.id = mj.job_id and j.system_key = 'owner';
  end if;
  return null;
end;
$$;
revoke all on function app_private.membership_slot_rows_follow() from public, anon, authenticated;

-- Manages belongs to a manager class management access only.
create function app_private.managed_location_needs_manager()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select app_private.role_class(m.role_id) from public.workspace_memberships m
      where m.id = new.membership_id and m.workspace_id = new.workspace_id) is distinct from 'manager' then
    raise exception 'only a manager has Manages; admins and owners manage every location'
      using errcode = '23514', hint = 'membership.manages_needs_manager';
  end if;
  return new;
end;
$$;
revoke all on function app_private.managed_location_needs_manager() from public, anon, authenticated;

-- A management job is a Management department job, held by a management access; the Owner job only by
-- the owner.
create function app_private.management_job_holds()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  slot_class public.workspace_role;
  job public.jobs;
begin
  select r.access_class into slot_class
  from public.workspace_memberships m
  join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
  where m.id = new.membership_id and m.workspace_id = new.workspace_id;
  if slot_class is null then
    raise exception 'a management job needs a management access'
      using errcode = '23514', hint = 'membership.management_job_needs_access';
  end if;
  select j.* into job from public.jobs j where j.id = new.job_id and j.workspace_id = new.workspace_id;
  if not exists (
    select 1 from public.departments d
    where d.id = job.department_id and d.workspace_id = new.workspace_id and d.system_key = 'management'
  ) then
    raise exception 'a management job is a job of the Management department'
      using errcode = '23514', hint = 'membership.management_job_department';
  end if;
  if job.archived_at is not null or job.deleted_at is not null then
    raise exception 'an archived or deleted job is no management job'
      using errcode = '23514', hint = 'membership.management_job_archived';
  end if;
  if job.system_key = 'owner' and slot_class <> 'owner' then
    raise exception 'the Owner job belongs to the owner'
      using errcode = '23514', hint = 'membership.owner_job';
  end if;
  return new;
end;
$$;
revoke all on function app_private.management_job_holds() from public, anon, authenticated;

-- The old composite foreign key kept a held role's class and the membership's role together. A role
-- somebody holds now simply keeps its class (the Roles screen never changes it).
create function app_private.held_role_keeps_its_class()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.access_class is distinct from old.access_class and exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = old.workspace_id and old.id in (m.role_id, m.employee_role_id)
  ) then
    raise exception 'a role somebody holds keeps its class'
      using errcode = '23514', hint = 'role.held_class';
  end if;
  return new;
end;
$$;
revoke all on function app_private.held_role_keeps_its_class() from public, anon, authenticated;

-- The membership triggers that named role read the slots ------------------------------------------------

-- The owner is the management slot's owner class role.
create or replace function public.prevent_last_workspace_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_state public.workspace_lifecycle_status;
  transfer_bypass boolean := coalesce(current_setting('app.owner_transfer', true), '') = 'on';
  owner_role uuid := (select r.id from public.workspace_roles r where r.workspace_id = old.workspace_id and r.access_class = 'owner');
begin
  if old.role_id is distinct from owner_role or old.status <> 'active' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select lifecycle_status into workspace_state
  from public.workspaces
  where id = old.workspace_id;

  if workspace_state = 'deleted' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' and new.role_id = owner_role and new.status = 'active' then
    return new;
  end if;

  if not exists (
    select 1
    from public.workspace_memberships other
    where other.workspace_id = old.workspace_id
      and other.id <> old.id
      and other.role_id = owner_role
      and other.status = 'active'
  ) then
    raise exception 'workspace must retain an active owner' using errcode = '23514';
  end if;

  if not transfer_bypass then
    raise exception 'owner role can only be changed through ownership transfer'
      using errcode = '23514';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.sync_workspace_entitlement_billing_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_role uuid := (select r.id from public.workspace_roles r where r.workspace_id = new.workspace_id and r.access_class = 'owner');
begin
  if new.role_id = owner_role
     and new.status = 'active'::public.membership_status
     and (
       old.role_id is distinct from new.role_id
       or old.status is distinct from new.status
     ) then
    update public.workspace_entitlements
    set billing_owner_user_id = new.user_id,
        payment_method_required_at = case
          when billing_owner_user_id is distinct from new.user_id then now()
          else payment_method_required_at
        end,
        updated_at = now()
    where workspace_id = new.workspace_id
      and billing_owner_user_id is distinct from new.user_id;
  end if;
  return new;
end;
$$;

-- A change to either slot is a role change. The class compared is the membership's highest: its
-- management slot's, else its employee slot's.
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
  new_class := (select role.access_class from public.workspace_roles role
                where role.id = coalesce(new.role_id, new.employee_role_id));
  if tg_op = 'UPDATE' then
    old_class := (select role.access_class from public.workspace_roles role
                  where role.id = coalesce(old.role_id, old.employee_role_id));
  end if;

  -- Taking access away grants nothing; neither does a change that leaves both
  -- slots, the account and the status as they were.
  if tg_op = 'UPDATE'
     and new.workspace_id = old.workspace_id
     and new.user_id is not distinct from old.user_id
     and new.role_id is not distinct from old.role_id
     and new.employee_role_id is not distinct from old.employee_role_id
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
  -- staying active, for the account the transfer names (nf-guvenlik O1). The
  -- employee slot does not move with it.
  if tg_op = 'UPDATE' and coalesce(current_setting('app.owner_transfer', true), '') = 'on'
     and new.workspace_id = old.workspace_id and new.user_id = old.user_id
     and new.employee_role_id is not distinct from old.employee_role_id
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

-- Setup's catalog: Management with Owner, General Manager and Assistant Manager (design §4.13; it made
-- Manager before). Only a Management with no job of its own yet gets them (a new workspace, or one the
-- move below finds without any): an archived or deleted one does not come back (2026-10-02 "Manager
-- silinirse geri gelmez"); keeping the last one from being archived is ROL-CIFT 1.3. The one way the
-- catalog gets them: setup and the move below both call this.
create or replace function app_private.ensure_management_and_owner(target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  management uuid;
begin
  insert into public.departments (workspace_id, name, system_key)
  values (target_workspace_id, 'Management', 'management')
  on conflict (workspace_id, system_key) where system_key is not null do nothing;
  select d.id into management from public.departments d
  where d.workspace_id = target_workspace_id and d.system_key = 'management';

  if not exists (
    select 1 from public.jobs j
    where j.workspace_id = target_workspace_id and j.department_id = management
      and j.system_key is null
  ) then
    insert into public.jobs (workspace_id, name, department_id)
    values (target_workspace_id, 'General Manager', management),
           (target_workspace_id, 'Assistant Manager', management)
    on conflict (workspace_id, lower(name)) where archived_at is null do nothing;
  end if;

  insert into public.jobs (workspace_id, name, department_id, system_key)
  values (target_workspace_id, 'Owner', management, 'owner')
  on conflict (workspace_id, system_key) where system_key is not null do nothing;
end;
$$;
revoke all on function app_private.ensure_management_and_owner(uuid) from public, anon, authenticated;

-- The move: lock, check, convert and drop in one block --------------------------------------------------
-- The CLI runs a migration statement by statement; the lock and the checks hold only inside one block.

do $$
declare
  before_counts jsonb;
  after_counts jsonb;
  short_of_a_job uuid;
begin
  perform set_config('lock_timeout', '5s', true);
  lock table public.workspace_memberships, public.workspace_roles, public.employee_profiles,
    public.employee_job_assignments, public.employee_location_assignments in share row exclusive mode;

  before_counts := (
    select jsonb_build_object(
      'memberships', count(*),
      'employee', count(*) filter (where m.role = 'employee'),
      'management', count(*) filter (where m.role <> 'employee'),
      'manager', count(*) filter (where m.role = 'manager'))
    from public.workspace_memberships m);

  alter table public.workspace_memberships add column employee_role_id uuid;
  alter table public.workspace_memberships alter column role_id drop not null;
  drop trigger a_sync_membership_role_reference_trigger on public.workspace_memberships;
  drop trigger b_enforce_role_location_scope on public.workspace_memberships;

  -- Who works: an employee class role, or a management one with a live employee record and at least
  -- one job outside Management (design §5.1). Exclude from schedule stays on the record as it is.
  create temporary table rol_cift_people on commit drop as
  select m.id as membership_id, m.workspace_id, m.user_id, m.role::text as class, p.id as employee_id,
    m.role = 'employee' or exists (
      select 1 from public.employee_job_assignments a
      join public.jobs j on j.id = a.job_id and j.workspace_id = a.workspace_id
      left join public.departments d on d.id = j.department_id
      where a.workspace_id = m.workspace_id and a.employee_id = p.id and a.ended_at is null
        and j.deleted_at is null and d.system_key is distinct from 'management'
    ) as works
  from public.workspace_memberships m
  -- Only memberships whose workspace exists: the shared local database holds a few whose workspace row
  -- was removed with its foreign keys off (2026-09-26); the live one cannot.
  join public.workspaces workspace on workspace.id = m.workspace_id
  left join public.employee_profiles p
    on p.workspace_id = m.workspace_id and p.user_id = m.user_id and p.archived_at is null;

  -- Two statements, each setting only what moves: the management slot of a pending ownership transfer's
  -- two rows is not touched, so its guard stays quiet.
  update public.workspace_memberships m
  set employee_role_id = m.role_id, role_id = null
  where m.role = 'employee';
  update public.workspace_memberships m
  set employee_role_id = (select r.id from public.workspace_roles r
                          where r.workspace_id = m.workspace_id and r.system_key = 'employee')
  from rol_cift_people person
  where person.membership_id = m.id and m.role <> 'employee' and person.works;

  -- Manages = today's location assignments of a manager.
  insert into public.membership_managed_locations (workspace_id, membership_id, location_id, created_by)
  select person.workspace_id, person.membership_id, a.location_id, null
  from rol_cift_people person
  join public.employee_location_assignments a
    on a.workspace_id = person.workspace_id and a.employee_id = person.employee_id and a.ended_at is null
  join public.locations l on l.id = a.location_id and app_private.location_is_live(l)
  where person.class = 'manager'
  on conflict (membership_id, location_id) do nothing;

  -- The management side's jobs: today's Management jobs; without one, the workspace's Manager job, else
  -- General Manager (design §5.1); an owner without one gets the Owner job.
  insert into public.membership_management_jobs (workspace_id, membership_id, job_id, created_by)
  select person.workspace_id, person.membership_id, a.job_id, null
  from rol_cift_people person
  join public.employee_job_assignments a
    on a.workspace_id = person.workspace_id and a.employee_id = person.employee_id and a.ended_at is null
  join public.jobs j on j.id = a.job_id and j.workspace_id = a.workspace_id
    and j.archived_at is null and j.deleted_at is null
  join public.departments d on d.id = j.department_id and d.system_key = 'management'
  where person.class <> 'employee' and (j.system_key is distinct from 'owner' or person.class = 'owner')
  on conflict (membership_id, job_id) do nothing;

  -- Every management access holds a Management job (KARARLAR S-168, design §4.13). A workspace with
  -- nobody to take one from gets what setup makes, through setup's own function. A catalog record of the
  -- same name outside Management is left alone; the checks below then stop the move
  -- (artifacts/ROL-CIFT-1/canli-oncesi-sayim.sql measures that before the live run).
  for short_of_a_job in
    select distinct person.workspace_id from rol_cift_people person
    where person.class <> 'employee'
      and not exists (select 1 from public.membership_management_jobs mj where mj.membership_id = person.membership_id)
  loop
    perform app_private.ensure_management_and_owner(short_of_a_job);
  end loop;

  insert into public.membership_management_jobs (workspace_id, membership_id, job_id, created_by)
  select person.workspace_id, person.membership_id, fallback.id, null
  from rol_cift_people person
  cross join lateral (
    select j.id from public.jobs j
    join public.departments d on d.id = j.department_id and d.system_key = 'management'
    where j.workspace_id = person.workspace_id and j.archived_at is null
      and (j.system_key is distinct from 'owner' or person.class = 'owner')
    order by case
      when person.class = 'owner' and j.system_key = 'owner' then 0
      when lower(j.name) = 'manager' then 1
      when lower(j.name) = 'general manager' then 2
      else 3 end, lower(j.name)
    limit 1
  ) fallback
  where person.class <> 'employee'
    and not exists (select 1 from public.membership_management_jobs mj where mj.membership_id = person.membership_id);

  -- Somebody who only manages keeps no availability (design §5.1); today's trigger already removed it
  -- from every manager, so this finds nothing unless a row slipped past it.
  delete from public.manager_weekly_reminders r using rol_cift_people person
  where not person.works and r.workspace_id = person.workspace_id and r.employee_id = person.employee_id;
  delete from public.employee_weekly_preferences w using rol_cift_people person
  where not person.works and w.workspace_id = person.workspace_id and w.employee_id = person.employee_id;
  delete from public.weekly_preference_events e using rol_cift_people person
  where not person.works and e.workspace_id = person.workspace_id and e.employee_id = person.employee_id
    and e.source = 'employee';
  delete from public.weekly_preference_commands c using rol_cift_people person
  where not person.works and c.workspace_id = person.workspace_id
    and c.command ->> 'employee_id' = person.employee_id::text and c.command ->> 'source' = 'employee';

  -- The deferred document trigger queued by the update fires now, before the table changes shape.
  set constraints public.document_assignment_changed immediate;

  -- The new shape. Triggers that listed role list the slots instead.
  drop trigger availability_follows_role on public.workspace_memberships;
  drop trigger block_membership_change_when_ownership_transfer_pending_trigger on public.workspace_memberships;
  drop trigger sync_workspace_entitlement_billing_owner_trigger on public.workspace_memberships;
  alter table public.workspace_memberships drop constraint workspace_memberships_employee_not_all_locations;
  alter table public.workspace_memberships drop constraint workspace_memberships_role_fk;
  alter table public.workspace_memberships drop column role;
  alter table public.workspace_memberships drop column all_locations;
  alter table public.workspace_memberships
    add constraint workspace_memberships_role_fk foreign key (role_id, workspace_id)
      references public.workspace_roles(id, workspace_id) on delete restrict,
    add constraint workspace_memberships_employee_role_fk foreign key (employee_role_id, workspace_id)
      references public.workspace_roles(id, workspace_id) on delete restrict,
    add constraint workspace_memberships_holds_an_access check (role_id is not null or employee_role_id is not null);

  create trigger availability_follows_role
    after insert or update of role_id, employee_role_id on public.workspace_memberships
    for each row execute function app_private.availability_follows_role();
  create trigger block_membership_change_when_ownership_transfer_pending_trigger
    before delete or update of user_id, role_id, employee_role_id, status on public.workspace_memberships
    for each row execute function public.block_membership_change_when_ownership_transfer_pending();
  create trigger sync_workspace_entitlement_billing_owner_trigger
    after update of role_id, status on public.workspace_memberships
    for each row execute function public.sync_workspace_entitlement_billing_owner();
  create trigger membership_access_slots_hold
    before insert or update of workspace_id, role_id, employee_role_id on public.workspace_memberships
    for each row execute function app_private.membership_access_slots_hold();
  create trigger membership_slot_rows_follow
    after update of role_id on public.workspace_memberships
    for each row execute function app_private.membership_slot_rows_follow();
  create trigger managed_location_needs_manager
    before insert or update on public.membership_managed_locations
    for each row execute function app_private.managed_location_needs_manager();
  create trigger management_job_holds
    before insert or update on public.membership_management_jobs
    for each row execute function app_private.management_job_holds();
  create trigger held_role_keeps_its_class
    before update of access_class on public.workspace_roles
    for each row execute function app_private.held_role_keeps_its_class();

  drop function public.sync_membership_role_reference();
  drop function app_private.enforce_role_location_scope();

  create index workspace_memberships_employee_role_idx on public.workspace_memberships (workspace_id, employee_role_id)
    where status = 'active'::public.membership_status;

  -- The same people on the other side: every membership kept, each in the slot its class names.
  after_counts := (
    select jsonb_build_object(
      'memberships', count(*),
      'employee', count(*) filter (where m.role_id is null),
      'management', count(*) filter (where m.role_id is not null),
      'manager', count(*) filter (where r.access_class = 'manager'))
    from public.workspace_memberships m
    left join public.workspace_roles r on r.id = m.role_id);
  if after_counts is distinct from before_counts then
    raise exception 'ROL-CIFT 1.1: the move changed who holds what: before %, after %', before_counts, after_counts;
  end if;

  -- And each moved as §5.1 says; any miss stops the move.
  -- (1) Somebody who works keeps the employee slot.
  if exists (
    select 1 from rol_cift_people person
    join public.workspace_memberships m on m.id = person.membership_id
    where person.works and m.employee_role_id is null
  ) then
    raise exception 'ROL-CIFT 1.1: % people who work lost the employee slot', (
      select count(*) from rol_cift_people person
      join public.workspace_memberships m on m.id = person.membership_id
      where person.works and m.employee_role_id is null);
  end if;
  -- (2) A manager assigned to a live location manages it.
  if exists (
    select 1 from rol_cift_people person
    join public.employee_location_assignments a
      on a.workspace_id = person.workspace_id and a.employee_id = person.employee_id and a.ended_at is null
    join public.locations l on l.id = a.location_id and app_private.location_is_live(l)
    where person.class = 'manager'
      and not exists (select 1 from public.membership_managed_locations x
                      where x.membership_id = person.membership_id and x.location_id = a.location_id)
  ) then
    raise exception 'ROL-CIFT 1.1: a manager does not manage a live location they were assigned to';
  end if;
  -- (3) Every management access holds a Management job.
  if exists (
    select 1 from public.workspace_memberships m join public.workspaces w on w.id = m.workspace_id
    where m.role_id is not null
      and not exists (select 1 from public.membership_management_jobs x where x.membership_id = m.id)
  ) then
    raise exception 'ROL-CIFT 1.1: % management accesses have no Management job', (
      select count(*) from public.workspace_memberships m join public.workspaces w on w.id = m.workspace_id
      where m.role_id is not null
        and not exists (select 1 from public.membership_management_jobs x where x.membership_id = m.id));
  end if;
end;
$$;
