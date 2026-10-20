-- DAVET-ERISIM (Tur 4 B, Mert 2026-10-20 ~05:25 AM PT "tur 4 B ONAY"; ROL-CIFT 6.1 and 6.3): an invitation
-- carries the two accesses apart, the employee app and the management app with its role and the locations a
-- manager manages, and accepting it writes both. Until it is accepted, its access changes without a new link.
-- Manages stops following Works at (the two manages_follow_works triggers go).
-- Part 1 of 2: it only adds and replaces. The one-role calls the API made until now keep working, as wrappers of
-- the new ones, until 20261020130100_invitation_two_accesses_retire.sql drops them and the one-role road (the
-- role service and PATCH /role, place_single_role, manages_follow_works) once no code calls them.
-- Bodies copied from supabase/schema.sql (origin/main 7c6316663) are changed only where marked "DAVET-ERISIM".

-- 1. The invitation names both accesses. role_id stays as the higher of the two, computed: what every rank check
-- and every reader of "the invitation's role" asks (can_invite_with_role, the notices, the lists).
alter table public.employee_invitations
  add column employee_role_id uuid,
  add column management_role_id uuid,
  add column managed_location_ids uuid[] not null default '{}';

-- A management invitation gave the employee access too when one of the person's jobs is outside Management, and
-- a manager managed where they work (place_single_role): the invitations already out keep exactly that.
update public.employee_invitations invitation
set employee_role_id = case
      when role.access_class = 'employee' then invitation.role_id
      when exists (
        select 1 from public.employee_job_assignments a
        join public.jobs j on j.id = a.job_id and j.deleted_at is null
        left join public.departments d on d.id = j.department_id
        where a.employee_id = invitation.employee_id and a.ended_at is null
          and d.system_key is distinct from 'management')
      then (select r.id from public.workspace_roles r
            where r.workspace_id = invitation.workspace_id and r.system_key = 'employee')
    end,
    management_role_id = case when role.access_class <> 'employee' then invitation.role_id end,
    managed_location_ids = case when role.access_class = 'manager' then (
      select coalesce(array_agg(a.location_id order by a.location_id), '{}')
      from public.employee_location_assignments a
      join public.locations l on l.id = a.location_id and app_private.location_is_live(l)
      where a.employee_id = invitation.employee_id and a.ended_at is null) else '{}' end
from public.workspace_roles role
where role.id = invitation.role_id;

alter table public.employee_invitations drop constraint employee_invitations_role_id_workspace_id_fkey;
alter table public.employee_invitations
  drop column role_id,
  drop column all_locations,
  drop column location_ids;
alter table public.employee_invitations
  add column role_id uuid generated always as (coalesce(management_role_id, employee_role_id)) stored,
  add constraint employee_invitations_employee_role_fkey foreign key (employee_role_id, workspace_id)
    references public.workspace_roles (id, workspace_id) on delete restrict,
  add constraint employee_invitations_management_role_fkey foreign key (management_role_id, workspace_id)
    references public.workspace_roles (id, workspace_id) on delete restrict,
  add constraint employee_invitations_holds_an_access
    check (employee_role_id is not null or management_role_id is not null);
comment on column public.employee_invitations.role_id is
  'The higher of the two accesses (the management role when there is one): what rank checks read. Computed.';
comment on column public.employee_invitations.managed_location_ids is
  'Where an invited manager will manage (Manages). Empty for every other access.';

-- 2. The Management jobs a management access holds (KARARLAR S-168). The drawer does not pick them: they are the
-- person's own jobs of the Management department in Employment, else the ones they hold now, else the
-- workspace's first one (the order place_single_role used).
create function app_private.management_jobs_for(w uuid, emp uuid, member uuid)
returns uuid[]
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    nullif(array(
      select a.job_id from public.employee_job_assignments a
      join public.jobs j on j.id = a.job_id and j.workspace_id = w
      join public.departments d on d.id = j.department_id and d.system_key = 'management'
      where a.employee_id = emp and a.ended_at is null
        and j.system_key is null and j.archived_at is null and j.deleted_at is null
      order by a.job_id), '{}'),
    nullif(array(
      select held.job_id from public.membership_management_jobs held
      join public.jobs j on j.id = held.job_id and j.workspace_id = w
      where held.membership_id = member
        and j.system_key is null and j.archived_at is null and j.deleted_at is null
      order by held.job_id), '{}'),
    array(
      select j.id from public.jobs j
      join public.departments d on d.id = j.department_id and d.system_key = 'management'
      where j.workspace_id = w and j.system_key is null and j.archived_at is null and j.deleted_at is null
      order by case when lower(j.name) = 'manager' then 1 when lower(j.name) = 'general manager' then 2 else 3 end,
        lower(j.name)
      limit 1))
$$;
revoke all on function app_private.management_jobs_for(uuid, uuid, uuid) from public, anon, authenticated;

-- 3. What an invitation may carry, asked of whoever sends it or changes it: at least one access, each in its own
-- slot, each below the sender (can_invite_with_role), and a manager's Manages among the workspace's open
-- locations. A manager has somewhere to manage (K4), so the old Works at check for an invited manager goes.
create function app_private.invitation_access_check(
  actor uuid, w uuid, next_employee_role uuid, next_management_role uuid, places uuid[])
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  management_class public.workspace_role;
begin
  if next_employee_role is null and next_management_role is null then
    raise exception 'choose an employee access, a management access or both'
      using errcode = '22023', hint = 'access.role_required';
  end if;
  if next_employee_role is not null and (
    not exists (select 1 from public.workspace_roles r where r.id = next_employee_role and r.workspace_id = w)
    or app_private.role_class(next_employee_role) is distinct from 'employee'
  ) then
    raise exception 'the employee slot holds an employee class role'
      using errcode = '22023', hint = 'membership.employee_slot';
  end if;
  if next_management_role is not null then
    select r.access_class into management_class from public.workspace_roles r
    where r.id = next_management_role and r.workspace_id = w;
    if management_class is null or management_class not in ('manager', 'admin') then
      raise exception 'the management slot holds a manager or admin class role'
        using errcode = '22023', hint = 'membership.management_slot';
    end if;
  end if;
  if (next_employee_role is not null and not app_private.can_invite_with_role(actor, w, next_employee_role))
     or (next_management_role is not null and not app_private.can_invite_with_role(actor, w, next_management_role)) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.rank', detail = 'employee.invite';
  end if;
  if management_class = 'manager' then
    if cardinality(coalesce(places, '{}')) = 0 then
      raise exception 'a manager needs a location to manage'
        using errcode = '22023', hint = 'access.manages_required';
    end if;
    if exists (select 1 from unnest(places) given(id) where not exists (
        select 1 from public.locations l
        where l.id = given.id and l.workspace_id = w and app_private.location_is_live(l))) then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'employee.invite';
    end if;
  elsif cardinality(coalesce(places, '{}')) > 0 then
    raise exception 'only a manager manages chosen locations'
      using errcode = '22023', hint = 'access.manages_only_for_manager';
  end if;
end;
$$;
revoke all on function app_private.invitation_access_check(uuid, uuid, uuid, uuid, uuid[]) from public, anon, authenticated;

-- 4. Sending an invitation: the two accesses in place of the one role.
create function public.prepare_employee_invitation_service(
  actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, employee_email text,
  target_employee_role_id uuid, target_management_role_id uuid, target_managed_location_ids uuid[],
  invitation_token_hash text, invitation_expires_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path to ''
as $_$
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

  if not exists (
    select 1 from public.employee_location_assignments
    where employee_id = target_employee_id and ended_at is null
  ) and not exists (
    select 1 from public.employee_profiles where id = target_employee_id
      and workspace_id = target_workspace_id and (is_remote or is_excluded_from_schedule)
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
revoke all on function public.prepare_employee_invitation_service(uuid, uuid, uuid, text, uuid, uuid, uuid[], text, timestamptz) from public, anon, authenticated;
grant execute on function public.prepare_employee_invitation_service(uuid, uuid, uuid, text, uuid, uuid, uuid[], text, timestamptz) to service_role;

-- The one-role call, until part 2: the role in the slots it filled on acceptance (place_single_role): an
-- employee role in the employee slot; a management role in its own, with the employee slot when one of the
-- person's jobs is outside Management, and a manager managing where they work.
create or replace function public.prepare_employee_invitation_service(
  actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, employee_email text,
  target_role_id uuid, invitation_token_hash text, invitation_expires_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  invite_role public.workspace_roles;
  employee_role uuid;
begin
  select * into invite_role from public.workspace_roles r
  where r.workspace_id = target_workspace_id
    and (r.id = target_role_id or (target_role_id is null and r.system_key = 'employee'));
  if invite_role.id is null then
    raise exception 'invitation role is unavailable' using errcode = '22023';
  end if;
  if invite_role.access_class = 'employee' then
    employee_role := invite_role.id;
  elsif exists (
    select 1 from public.employee_job_assignments a
    join public.jobs j on j.id = a.job_id and j.deleted_at is null
    left join public.departments d on d.id = j.department_id
    where a.employee_id = target_employee_id and a.ended_at is null and d.system_key is distinct from 'management'
  ) then
    employee_role := (select r.id from public.workspace_roles r
                      where r.workspace_id = target_workspace_id and r.system_key = 'employee');
  end if;
  return public.prepare_employee_invitation_service(actor_user_id, target_workspace_id, target_employee_id,
    employee_email, employee_role,
    case when invite_role.access_class <> 'employee' then invite_role.id end,
    case when invite_role.access_class = 'manager' then array(
      select a.location_id from public.employee_location_assignments a
      join public.locations l on l.id = a.location_id and app_private.location_is_live(l)
      where a.employee_id = target_employee_id and a.ended_at is null) else '{}'::uuid[] end,
    invitation_token_hash, invitation_expires_at);
end;
$$;

-- 5. Until it is accepted, an invitation's access changes in place: the link that went out keeps working and
-- opens to the new access (Mert 2026-10-20 ~01:30). Whoever changes it could have sent both the old and the new.
create function public.update_employee_invitation_access_service(
  actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid,
  target_employee_role_id uuid, target_management_role_id uuid, target_managed_location_ids uuid[])
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  pending public.employee_invitations;
  places uuid[] := array(select distinct p from unnest(coalesce(target_managed_location_ids, '{}')) p order by p);
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.invite', target_person => target_employee_id);
  select * into pending from public.employee_invitations i
  where i.workspace_id = target_workspace_id and i.employee_id = target_employee_id and i.status = 'pending'
    and i.expires_at > now()
  for update;
  if pending.id is null then
    raise exception 'open invitation not found' using errcode = 'P0002';
  end if;
  if not app_private.can_invite_with_role(actor_user_id, target_workspace_id, pending.role_id) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.rank', detail = 'employee.invite';
  end if;
  perform app_private.invitation_access_check(actor_user_id, target_workspace_id,
    target_employee_role_id, target_management_role_id, places);

  update public.employee_invitations
  set employee_role_id = target_employee_role_id, management_role_id = target_management_role_id,
      managed_location_ids = places, updated_at = now()
  where id = pending.id;
  update public.employee_profiles
  set revision = revision + 1, updated_at = now()
  where id = target_employee_id and workspace_id = target_workspace_id;
  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (target_workspace_id, target_employee_id, actor_user_id, 'employee.invitation_access_changed',
    'Invitation access changed');
end;
$$;
revoke all on function public.update_employee_invitation_access_service(uuid, uuid, uuid, uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.update_employee_invitation_access_service(uuid, uuid, uuid, uuid, uuid, uuid[]) to service_role;

-- 6. Accepting writes both accesses, Manages and the Management jobs.
CREATE OR REPLACE FUNCTION "app_private"."accept_employee_invitation_for_user"("target_user_id" "uuid", "target_invitation_id" "uuid", "invitation_token_hash" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  invitation public.employee_invitations%rowtype;
  jobs uuid[];
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

  -- DAVET-ERISIM: the two accesses the invitation names, as they are; an account reopened takes them too.
  if membership.id is not null then
    update public.workspace_memberships
    set status = 'pending_activation'::public.membership_status,
        role_id = invitation.management_role_id,
        employee_role_id = invitation.employee_role_id,
        updated_at = now()
    where id = membership.id
    returning id into accepted_membership_id;
  else
    insert into public.workspace_memberships (
      workspace_id, user_id, role_id, employee_role_id, status
    ) values (
      invitation.workspace_id,
      target_user_id,
      invitation.management_role_id,
      invitation.employee_role_id,
      'pending_activation'::public.membership_status
    )
    returning id into accepted_membership_id;
  end if;
  -- DAVET-ERISIM: Manages is what the invitation says, among the locations still open; the Management jobs
  -- follow the person's own (management_jobs_for). Rows an account reopened still held are put right.
  delete from public.membership_managed_locations managed
  where managed.membership_id = accepted_membership_id
    and not managed.location_id = any (invitation.managed_location_ids);
  if app_private.role_class(invitation.management_role_id) = 'manager' then
    insert into public.membership_managed_locations (workspace_id, membership_id, location_id, created_by)
    select invitation.workspace_id, accepted_membership_id, l.id, invitation.created_by
    from public.locations l
    where l.workspace_id = invitation.workspace_id and l.id = any (invitation.managed_location_ids)
      and app_private.location_is_live(l)
    on conflict (membership_id, location_id) do nothing;
    if not exists (select 1 from public.membership_managed_locations m where m.membership_id = accepted_membership_id) then
      raise exception 'a manager needs a location to manage'
        using errcode = '22023', hint = 'access.manages_required';
    end if;
  end if;
  if invitation.management_role_id is not null then
    jobs := app_private.management_jobs_for(invitation.workspace_id, invitation.employee_id, accepted_membership_id);
    delete from public.membership_management_jobs held
    using public.jobs j
    where held.membership_id = accepted_membership_id and j.id = held.job_id and j.system_key is null
      and not held.job_id = any (jobs);
    insert into public.membership_management_jobs (workspace_id, membership_id, job_id, created_by)
    select invitation.workspace_id, accepted_membership_id, job, invitation.created_by from unnest(jobs) job
    on conflict (membership_id, job_id) do nothing;
  end if;

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
-- 7. Changing a joined person's access: the Management jobs, when none are named, are the ones
-- management_jobs_for gives (the drawer names none).
CREATE OR REPLACE FUNCTION "public"."change_employee_access_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_employee_id" "uuid", "next_employee_role_id" "uuid", "next_management_role_id" "uuid", "managed_location_ids" "uuid"[], "management_job_ids" "uuid"[], "expected_impact" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  member public.workspace_memberships;
  management_class text;
  impact jsonb;
  places uuid[] := coalesce(managed_location_ids, '{}');
  -- DAVET-ERISIM: null asks for the person's own (below).
  jobs uuid[] := management_job_ids;
begin
  perform public.availability_lock_workspace(target_workspace_id);
  member := app_private.access_change_target(actor_user_id, target_workspace_id, target_employee_id,
    next_employee_role_id, next_management_role_id);

  -- What the reader was shown is what happens (design §4.8).
  impact := app_private.access_change_impact(target_workspace_id, member, target_employee_id, next_employee_role_id);
  if impact is distinct from coalesce(expected_impact, jsonb_build_object('shifts_opened', 0,
      'requests_closed', 0, 'applications_closed', 0, 'time_off_withdrawn', 0, 'availability_deleted', false)) then
    raise exception 'What this change does has changed. Review it again.'
      using errcode = 'PT409', hint = 'access.impact_changed', detail = impact::text;
  end if;

  perform set_config('app.membership_change', member.id::text, true);
  update public.workspace_memberships
  set role_id = next_management_role_id, employee_role_id = next_employee_role_id, updated_at = now()
  where id = member.id;
  -- The kind of access they now hold, as the core reads it; a refusal below undoes the update.
  management_class := case when next_management_role_id is null then null
    else (app_private.actor(member.user_id, target_workspace_id)).class::text end;
  -- DAVET-ERISIM: a management access with no jobs named holds the person's own Management jobs.
  if jobs is null then
    jobs := case when management_class in ('manager', 'admin')
      then app_private.management_jobs_for(target_workspace_id, target_employee_id, member.id) else '{}' end;
  end if;

  -- Every management access holds a Management job (S-168); a manager manages a place (design §4.2).
  -- The owner's Owner job comes with ownership, so the owner's jobs and places are not asked.
  if management_class in ('manager', 'admin') then
    if cardinality(jobs) = 0 then
      raise exception 'a management access needs a Management job'
        using errcode = '22023', hint = 'access.management_job_required';
    end if;
    if exists (select 1 from unnest(jobs) given(id) where not exists (
        select 1 from public.jobs j join public.departments d on d.id = j.department_id
        where j.id = given.id and j.workspace_id = target_workspace_id and d.system_key = 'management'
          and j.system_key is null and j.archived_at is null and j.deleted_at is null)) then
      raise exception 'choose a Management job' using errcode = '22023', hint = 'access.management_job_invalid';
    end if;
  elsif management_class = 'owner' and cardinality(jobs) > 0 then
    raise exception 'the owner''s Owner job comes with ownership'
      using errcode = '22023', hint = 'access.management_job_invalid';
  elsif management_class is null and cardinality(jobs) > 0 then
    raise exception 'a Management job goes with a management access'
      using errcode = '22023', hint = 'access.management_job_invalid';
  end if;
  if management_class = 'manager' then
    if cardinality(places) = 0 then
      raise exception 'a manager needs a location to manage'
        using errcode = '22023', hint = 'access.manages_required';
    end if;
    if exists (select 1 from unnest(places) given(id) where not exists (
        select 1 from public.locations l
        where l.id = given.id and l.workspace_id = target_workspace_id and app_private.location_is_live(l))) then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'employee.change_role';
    end if;
  elsif cardinality(places) > 0 then
    raise exception 'only a manager manages chosen locations'
      using errcode = '22023', hint = 'access.manages_only_for_manager';
  end if;

  if member.employee_role_id is not null and next_employee_role_id is null then
    perform app_private.close_employee_side(target_workspace_id, target_employee_id, actor_user_id, 'access_dropped');
  end if;

  if management_class = 'manager' then
    delete from public.membership_managed_locations managed
    where managed.membership_id = member.id and not managed.location_id = any (places);
    insert into public.membership_managed_locations (workspace_id, membership_id, location_id, created_by)
    select target_workspace_id, member.id, place, actor_user_id from unnest(places) place
    on conflict (membership_id, location_id) do nothing;
  end if;
  if management_class in ('manager', 'admin') then
    delete from public.membership_management_jobs held
    where held.membership_id = member.id and not held.job_id = any (jobs);
    insert into public.membership_management_jobs (workspace_id, membership_id, job_id, created_by)
    select target_workspace_id, member.id, job, actor_user_id from unnest(jobs) job
    on conflict (membership_id, job_id) do nothing;
  end if;

  update public.employee_profiles
  set revision = revision + 1, updated_at = now()
  where id = target_employee_id and workspace_id = target_workspace_id;
  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (target_workspace_id, target_employee_id, actor_user_id, 'employee.access_changed', 'Workspace access changed');
  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_workspace_id, actor_user_id, 'membership.access_changed', 'workspace_membership', member.id::text,
    jsonb_build_object('employee_id', target_employee_id,
      'from_employee_role_id', member.employee_role_id, 'to_employee_role_id', next_employee_role_id,
      'from_management_role_id', member.role_id, 'to_management_role_id', next_management_role_id,
      'managed_location_ids', to_jsonb(places), 'management_job_ids', to_jsonb(jobs), 'impact', impact));

  if member.employee_role_id is distinct from next_employee_role_id
     or member.role_id is distinct from next_management_role_id then
    perform app_private.people_tell('people.role_changed', target_workspace_id, array[member.user_id],
      'role:' || member.id::text || ':' || txid_current()::text,
      'Your access changed', null, '/app', actor_user_id, 'workspace_membership', member.id,
      jsonb_build_object('employee_role_id', next_employee_role_id, 'management_role_id', next_management_role_id));
  end if;

  return jsonb_build_object('membership_id', member.id, 'employee_role_id', next_employee_role_id,
    'management_role_id', next_management_role_id, 'impact', impact);
end;
$$;
-- 8. Add employee and invite in one command: the invitation's two accesses in place of the one role.
-- invite_access: null (save only) or {employee_role_id, management_role_id, managed_location_ids}.
CREATE FUNCTION "public"."create_employee_command_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "command_id" "uuid", "employee_input" "jsonb", "invite_access" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  stored public.employee_create_commands%rowtype;
  invite public.employee_invitations%rowtype;
  fingerprint text;
  saved_id uuid;
  prepared_id uuid;
  secret_token text;
  -- DAVET-ERISIM: the two accesses of the invitation, when there is one.
  invite_employee_role uuid := nullif(invite_access ->> 'employee_role_id', '')::uuid;
  invite_management_role uuid := nullif(invite_access ->> 'management_role_id', '')::uuid;
  invite_places uuid[] := array(select jsonb_array_elements_text(coalesce(invite_access -> 'managed_location_ids', '[]'::jsonb)))::uuid[];
begin
  -- Asked where the record will work, retries included: a manager only where
  -- they manage, never nowhere.
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.create',
    array(select jsonb_array_elements_text(coalesce(employee_input -> 'location_ids', '[]'::jsonb)))::uuid[]);
  if command_id is null then
    raise exception 'command id required' using errcode = '22023';
  end if;
  fingerprint := encode(extensions.digest(jsonb_build_object('employee', employee_input, 'access', invite_access)::text, 'sha256'), 'hex');
  -- Serializes retries before creating anything, including concurrent requests.
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text || actor_user_id::text || command_id::text, 0));
  select * into stored from public.employee_create_commands c
    where c.workspace_id = target_workspace_id and c.actor_user_id = create_employee_command_service.actor_user_id
      and c.command_id = create_employee_command_service.command_id;
  if found then
    if stored.input_hash <> fingerprint then
      raise exception 'idempotency key belongs to different employee details' using errcode = 'PT409', hint = 'employee.create_request_reused';
    end if;
    -- A retry hands the token out again: only while the role is still theirs to give.
    if (invite_employee_role is not null
        and not app_private.can_invite_with_role(actor_user_id, target_workspace_id, invite_employee_role))
      or (invite_management_role is not null
        and not app_private.can_invite_with_role(actor_user_id, target_workspace_id, invite_management_role)) then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.rank', detail = 'employee.invite';
    end if;
  else
    if coalesce(employee_input->>'invitation_email', '') <> ''
      and (employee_input->>'invitation_email') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'valid invitation email required' using errcode = '22023';
    end if;
    saved_id := public.save_employee_service(
      actor_user_id, target_workspace_id, null,
      employee_input->>'first_name',
      coalesce(employee_input->>'middle_name', ''),
      employee_input->>'last_name', '',
      employee_input->>'invitation_email', nullif(employee_input->>'start_date', '')::date,
      employee_input->>'internal_note',
      array(select jsonb_array_elements_text(employee_input->'location_ids'))::uuid[],
      (employee_input->>'primary_location_id')::uuid,
      array(select jsonb_array_elements_text(employee_input->'job_ids'))::uuid[],
      (employee_input->>'primary_job_id')::uuid,
      coalesce((employee_input->>'is_remote')::boolean, false),
      coalesce((employee_input->>'is_excluded_from_schedule')::boolean, false), null
    );
    if invite_access is not null and jsonb_typeof(invite_access) = 'object' then
      secret_token := encode(extensions.gen_random_bytes(32), 'hex');
      prepared_id := public.prepare_employee_invitation_service(
        actor_user_id, target_workspace_id, saved_id, lower(btrim(employee_input->>'invitation_email')),
        invite_employee_role, invite_management_role, invite_places,
        encode(extensions.digest(secret_token, 'sha256'), 'hex'), now() + interval '7 days'
      );
    end if;
    insert into public.employee_create_commands
      (workspace_id, actor_user_id, command_id, input_hash, employee_id, invitation_id, invitation_token)
      values (target_workspace_id, actor_user_id, command_id, fingerprint, saved_id, prepared_id, secret_token)
      returning * into stored;
  end if;
  if stored.invitation_id is not null then
    select * into invite from public.employee_invitations where id = stored.invitation_id;
  end if;
  return jsonb_build_object(
    'id', stored.employee_id, 'invitation_id', stored.invitation_id,
    'token', case when invite.status = 'pending' and invite.expires_at > now() then stored.invitation_token else null end,
    'delivery_status', invite.delivery_status
  );
end;
$_$;
revoke all on function public.create_employee_command_service(uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_employee_command_service(uuid, uuid, uuid, jsonb, jsonb) to service_role;

-- The one-role call, until part 2: the same command, its invitation sent with the one role as before.
create or replace function public.create_employee_command_service(
  actor_user_id uuid, target_workspace_id uuid, command_id uuid, employee_input jsonb, invite_role_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  invite_role public.workspace_roles;
  works boolean;
begin
  if invite_role_id is null then
    return public.create_employee_command_service(actor_user_id, target_workspace_id, command_id, employee_input,
      null::jsonb);
  end if;
  select * into invite_role from public.workspace_roles r
  where r.workspace_id = target_workspace_id and r.id = invite_role_id;
  if invite_role.id is null then
    raise exception 'invitation role is unavailable' using errcode = '22023';
  end if;
  works := invite_role.access_class = 'employee' or exists (
    select 1 from public.jobs j left join public.departments d on d.id = j.department_id
    where j.workspace_id = target_workspace_id
      and j.id in (select jsonb_array_elements_text(coalesce(employee_input -> 'job_ids', '[]'::jsonb))::uuid)
      and d.system_key is distinct from 'management');
  return public.create_employee_command_service(actor_user_id, target_workspace_id, command_id, employee_input,
    jsonb_build_object(
      'employee_role_id', case
        when invite_role.access_class = 'employee' then invite_role.id
        when works then (select r.id from public.workspace_roles r
                         where r.workspace_id = target_workspace_id and r.system_key = 'employee') end,
      'management_role_id', case when invite_role.access_class <> 'employee' then invite_role.id end,
      'managed_location_ids', case when invite_role.access_class = 'manager'
        then coalesce(employee_input -> 'location_ids', '[]'::jsonb) else '[]'::jsonb end));
end;
$$;

-- 9. The drawer reads both accesses apart, Manages, and what an invitation still out carries.
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
  change_rule app_private.authz_actions;
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
  select * into change_rule from app_private.authz_actions action where action.key = 'employee.change_role';
  if not found then
    raise exception 'core action employee.change_role is missing' using errcode = '22023';
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
    -- ROL-CIFT 2.2: the record's two access slots (somebody with no account yet works); the drawer
    -- asks here, not the role's name.
    'access', jsonb_build_object(
      'employee', app_private.has_employee_access(employee.workspace_id, employee.user_id),
      'management', management_role.access_class),
    -- DAVET-ERISIM: the two slots by role, and where a manager manages, for who reads access or may change it.
    'employee_role_id', membership.employee_role_id,
    'management_role_id', membership.role_id,
    'managed_location_ids', case
      when membership.id is null or not (reads_access
        or app_private.authz_check(me, change_rule, null, employee.id, null) is null) then '[]'::jsonb
      else coalesce((select jsonb_agg(managed.location_id order by managed.location_id)
        from public.membership_managed_locations managed where managed.membership_id = membership.id), '[]'::jsonb)
    end,
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
        -- DAVET-ERISIM: the two accesses it carries.
        'employee_role_id', invitation.employee_role_id,
        'management_role_id', invitation.management_role_id,
        'managed_location_ids', to_jsonb(invitation.managed_location_ids),
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
  left join public.workspace_roles management_role on management_role.id = membership.role_id
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
-- 10. Restoring an archived person with their access: the account kept both slots while suspended, so it
-- opens again as it was (the role is no longer placed again).
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
-- 11. A role an invitation names in either slot is in use.
CREATE OR REPLACE FUNCTION "public"."delete_workspace_role_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_role_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare target public.workspace_roles;
begin
 perform pg_advisory_xact_lock(hashtextextended('roles:'||target_workspace_id::text,0));
 perform app_private.authorize(actor_user_id,target_workspace_id,'settings.roles.write');
 if not app_private.can_edit_role(actor_user_id,target_workspace_id,target_role_id) then raise exception 'role management access denied' using errcode='42501',hint=case when not exists(select 1 from public.workspace_roles r where r.id=target_role_id and r.workspace_id=target_workspace_id) then 'authz.out_of_scope' else 'authz.rank' end; end if;
 select * into target from public.workspace_roles where id=target_role_id and workspace_id=target_workspace_id for update;
 if target.system_key is not null then raise exception 'Built-in roles cannot be deleted' using errcode='42501'; end if;
 if exists(select 1 from public.workspace_memberships where role_id=target_role_id) or exists(select 1 from public.employee_invitations where target_role_id in (employee_role_id, management_role_id)) or exists(select 1 from public.employee_access_snapshots where role_id=target_role_id) then raise exception 'Role has member or invitation references. Resolve these dependencies before deleting.' using errcode='PT409',hint='role.in_use'; end if;
 delete from public.workspace_roles where id=target_role_id;
 insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata) values(target_workspace_id,actor_user_id,'role.deleted','workspace_role',target_role_id::text,jsonb_build_object('name',target.name));
end; $$;
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
          where r.id in (i.employee_role_id, i.management_role_id) and i.status = 'pending' and i.expires_at > now()),
        'blocking_member_count', (select count(*) from public.workspace_memberships m where r.id in (m.role_id, m.employee_role_id))
          + (select count(*) from public.employee_access_snapshots snap where snap.role_id = r.id),
        'blocking_invite_count', (select count(*) from public.employee_invitations i
          where r.id in (i.employee_role_id, i.management_role_id)),
        'editable', app_private.can_edit_role(actor_user_id, target_workspace_id, r.id),
        'deletable', r.system_key is null and app_private.can_edit_role(actor_user_id, target_workspace_id, r.id)
          and not exists (select 1 from public.workspace_memberships m where r.id in (m.role_id, m.employee_role_id))
          and not exists (select 1 from public.employee_invitations i where r.id in (i.employee_role_id, i.management_role_id))
          and not exists (select 1 from public.employee_access_snapshots snap where snap.role_id = r.id)
      ) order by r.sort_order, r.name)
      from public.workspace_roles r
      where r.workspace_id = target_workspace_id
    ), '[]'::jsonb)
  );
end;
$$;

-- 12a. Setup's invitations go out to the employee app, as they did: the intents name its role, now that an
-- invitation names its access itself.
drop function public.list_owner_onboarding_invitation_intents_service(uuid, uuid);
create function public.list_owner_onboarding_invitation_intents_service(actor_user_id uuid, target_workspace_id uuid)
returns table (employee_id uuid, email text, employee_role_id uuid)
language plpgsql
security definer
set search_path to ''
as $$
declare
  onboarding_status public.onboarding_status;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.setup');

  select onboarding.status
  into onboarding_status
  from public.workspace_onboarding onboarding
  where onboarding.workspace_id = target_workspace_id;

  if onboarding_status is null then
    raise exception 'workspace onboarding was not found' using errcode = 'P0002';
  end if;
  if onboarding_status <> 'complete'::public.onboarding_status then
    raise exception 'owner onboarding must be complete' using errcode = '22023';
  end if;

  return query
  select intent.employee_id, intent.email,
    -- DAVET-ERISIM
    (select r.id from public.workspace_roles r where r.workspace_id = target_workspace_id and r.system_key = 'employee')
  from public.owner_onboarding_invitation_intents intent
  join public.employee_profiles employee
    on employee.workspace_id = intent.workspace_id
   and employee.id = intent.employee_id
  where intent.workspace_id = target_workspace_id
    and intent.dispatched_at is null
    and employee.archived_at is null
    and employee.user_id is null
    and not exists (
      select 1
      from public.employee_invitations invitation
      where invitation.workspace_id = intent.workspace_id
        and invitation.employee_id = intent.employee_id
        and invitation.status in ('pending', 'accepted')
    )
  order by intent.created_at, intent.employee_id;
end;
$$;
revoke all on function public.list_owner_onboarding_invitation_intents_service(uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_owner_onboarding_invitation_intents_service(uuid, uuid) to service_role;

-- 12. Manages no longer follows Works at (ROL-CIFT 6.3): the drawer and the invitation name it. The one-role
-- road still calls manages_follow_works itself until part 2.
drop trigger manages_follow_works on public.employee_location_assignments;
drop trigger manages_follow_works_for_member on public.workspace_memberships;
drop function app_private.manages_follow_works_trigger();
drop function app_private.manages_follow_works_for_member();
