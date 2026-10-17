-- BILDIRIM-U4b (KARARLAR S-123, S-126 (5), S-127; docs/plan/research/BILDIRIM-URETICILER.md §2.1 #6, §2.5 #28-33): role,
-- access and ownership write their own notices into the new core (part 4, the people slice's second half).
--   * role changed: the person, once (required: by email too); never who changed it;
--   * access ended (access removed, employment ended, archived): the person, no longer a member
--     (to_former_members), once per go; by email, the one way that still reaches them (S-126 (5)); a
--     "no location left" card on them closes, as the decision was made;
--   * access restored: the person, and at each of their locations its managers who may publish there; a
--     location with none, its admins and owner (place_deciders);
--   * no location left: who may end their employment (employee.terminate over the person); the card closes
--     when they work somewhere again (a trigger on the assignment);
--   * shifts left without anyone, by an employment ended or a location taken away: per location, its managers
--     who may publish there, else its admins and owner; the count and the place; the card lists that
--     location's shifts only and closes once every one of them has somebody, or is no longer in the location's
--     current schedule (published again, or removed by a closed day);
--   * ownership transfer: the asked admin, then the other side at each answer (declined, accepted,
--     cancelled); the asked card closes on the answer or the cancel. The recipients are the transfer's own
--     two people, the parties to it, not holders of a right (S-127 does not apply).
--   * onboarding's final approval (live since 20261017120000) goes to the person's managers who may review it,
--     else the admins and owner, as plan §2.5 row 23 says; a changed legal name stays owner and admins only.
-- Every notice's work (who to tell, the cards it closes, the notice) runs guarded: a failure is logged and the
-- people work stands.

-- Managers first (plan §1, §6.2) at one place: of who may do this there (or over the person, with no place),
-- the manager-class ones; where there are none (none at all, or each one blocked, suspended or without the
-- right), all of them: its admins and owner. No action of the workspace's stands in for "admins and owner":
-- the place's own holders, split by class, are the rule.
create function app_private.place_deciders(target_workspace uuid, target_action text, target_place uuid,
  target_person uuid default null)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  with holders as (
    select unnest(app_private.notify_holders(target_workspace, target_action,
      case when target_place is null then null else array[target_place] end, target_person)) who
  ), managers as (
    -- The class as the core holds it (actor_state), not read from roles here.
    select h.who from holders h where (app_private.actor(h.who, target_workspace)).class = 'manager'
  )
  select coalesce(array_agg(x.who order by x.who), '{}') from (
    select who from managers
    union all
    select who from holders where not exists (select 1 from managers)
  ) x
$$;

revoke all on function app_private.place_deciders(uuid, text, uuid, uuid) from public;

-- Who may act on an onboarding sent in, now (20261017120000, final approval narrowed): a changed legal name
-- waiting, its owner and admins (onboarding.legal_name); a final approval when its case asks for one, the
-- person's managers who may review it, else the admins and owner.
create or replace function app_private.onboarding_reviewers(target_case public.employee_onboarding_cases)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct who order by who), '{}') from (
    select unnest(app_private.notify_holders(target_case.workspace_id, 'onboarding.legal_name', null, target_case.employee_id)) who
    where exists (select 1 from public.employee_onboarding_requirements r
                  where r.case_id = target_case.id and r.kind = 'profile' and r.requires_review
                    and r.status <> 'completed'::public.employee_onboarding_requirement_status)
    union
    select unnest(app_private.place_deciders(target_case.workspace_id, 'onboarding.review', null, target_case.employee_id))
    where target_case.final_approval_required
  ) reviewers
$$;

-- The workspace's name and a person's account name, for titles.
create function app_private.workspace_name(target_workspace uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select w.name from public.workspaces w where w.id = target_workspace
$$;

revoke all on function app_private.workspace_name(uuid) from public;

create function app_private.account_name(target_user uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select nullif(btrim(p.display_name), '') from public.user_profiles p where p.user_id = target_user), 'Somebody')
$$;

revoke all on function app_private.account_name(uuid) from public;

-- Access ended for one person, guarded: they hear it (a former member, by email too); a "no location left"
-- card on them closes, the decision made.
create function app_private.access_tell_ended(target_workspace uuid, target_employee uuid, target_person uuid,
  target_membership uuid, actor uuid)
returns integer
language plpgsql
set search_path = ''
as $$
begin
  perform app_private.notification_resolve(target_workspace, 'employee_no_location', target_employee, 'closed', actor);
  if target_person is null then
    return 0;
  end if;
  return app_private.people_tell('people.access_ended', target_workspace, array[target_person],
    'access_ended:' || coalesce(target_membership, target_employee)::text || ':' || txid_current()::text,
    'Your access to ' || app_private.workspace_name(target_workspace) || ' ended', null,
    '/account/workspaces', actor, 'workspace_membership', target_membership, '{}'::jsonb);
exception when others then
  raise warning 'access_tell_ended: notices for % skipped: % (%)', target_employee, sqlerrm, sqlstate;
  return 0;
end;
$$;

revoke all on function app_private.access_tell_ended(uuid, uuid, uuid, uuid, uuid) from public;

-- Access restored, guarded: the person, and who may publish at each of their locations now.
create function app_private.access_tell_restored(target_workspace uuid, target_employee uuid, target_person uuid,
  actor uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  key text;
  managers uuid[];
  told integer;
begin
  key := 'restored:' || target_employee::text || ':' || txid_current()::text;
  told := app_private.people_tell('people.restored', target_workspace, array[target_person], key,
    'Your access is back', 'You can use ' || app_private.workspace_name(target_workspace) || ' again.',
    '/app', actor, 'employee', target_employee, '{}'::jsonb);
  -- Per live location of theirs, its deciders (place_deciders).
  managers := array(
    select distinct holder
    from public.employee_location_assignments a
    join public.locations l on l.id = a.location_id and l.workspace_id = a.workspace_id and l.archived_at is null
    cross join lateral unnest(app_private.place_deciders(target_workspace, 'schedule.publish', a.location_id)) holder
    where a.workspace_id = target_workspace and a.employee_id = target_employee and a.ended_at is null
      and holder is distinct from target_person);
  return told + app_private.people_tell('people.restored', target_workspace, managers, key,
    app_private.people_name(target_employee) || '''s access is back', null,
    '/app/employees?employeeId=' || target_employee::text, actor, 'employee', target_employee, '{}'::jsonb);
exception when others then
  raise warning 'access_tell_restored: notices for % skipped: % (%)', target_employee, sqlerrm, sqlstate;
  return 0;
end;
$$;

revoke all on function app_private.access_tell_restored(uuid, uuid, uuid, uuid) from public;

-- Somebody left without a location, guarded: who may end their employment decides.
create function app_private.access_tell_no_location(target_workspace uuid, target_employee uuid, actor uuid)
returns integer
language plpgsql
set search_path = ''
as $$
begin
  return app_private.people_tell('people.no_location', target_workspace,
    app_private.notify_holders(target_workspace, 'employee.terminate', null, target_employee),
    'no_location:' || target_employee::text || ':' || txid_current()::text,
    app_private.people_name(target_employee) || ' has no location', 'Give them a location, or end their employment.',
    '/app/employees?employeeId=' || target_employee::text, actor, 'employee_no_location', target_employee,
    jsonb_build_object('employee_id', target_employee));
exception when others then
  raise warning 'access_tell_no_location: notice for % skipped: % (%)', target_employee, sqlerrm, sqlstate;
  return 0;
end;
$$;

revoke all on function app_private.access_tell_no_location(uuid, uuid, uuid) from public;

-- Working somewhere again closes the "no location left" card, whichever path gave the location.
create function app_private.access_location_given()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform app_private.notification_resolve(new.workspace_id, 'employee_no_location', new.employee_id, 'closed', null);
  exception when others then
    raise warning 'access_location_given: card for % not closed: % (%)', new.employee_id, sqlerrm, sqlstate;
  end;
  return null;
end;
$$;

revoke all on function app_private.access_location_given() from public;

create trigger access_location_given
after insert on public.employee_location_assignments
for each row when (new.ended_at is null)
execute function app_private.access_location_given();

-- Shifts left without anyone, guarded: per location, who may publish there now; how many and where.
create function app_private.schedule_tell_unassigned(target_workspace uuid, shift_ids uuid[], actor uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  place record;
  told integer := 0;
  card uuid;
begin
  for place in
    select s.location_id, l.name, count(*)::integer shifts, array_agg(s.id order by s.id) ids
    from public.schedule_published_shifts s
    join public.locations l on l.id = s.location_id and l.workspace_id = s.workspace_id
    where s.workspace_id = target_workspace and s.id = any (coalesce(shift_ids, '{}'))
    group by s.location_id, l.name
  loop
    -- Each card is its own subject, so closing it touches no other card about the same place.
    card := gen_random_uuid();
    told := told + app_private.people_tell('schedule.shifts_unassigned', target_workspace,
      app_private.place_deciders(target_workspace, 'schedule.publish', place.location_id),
      'unassigned:' || card::text,
      place.shifts || case when place.shifts = 1 then ' shift at ' else ' shifts at ' end || place.name
        || case when place.shifts = 1 then ' has nobody' else ' have nobody' end,
      'Give them to somebody or leave them open.',
      '/app/schedule', actor, 'unassigned_shifts', card,
      jsonb_build_object('location_id', place.location_id, 'shift_ids', to_jsonb(place.ids)));
  end loop;
  return told;
exception when others then
  raise warning 'schedule_tell_unassigned: notices skipped: % (%)', sqlerrm, sqlstate;
  return 0;
end;
$$;

revoke all on function app_private.schedule_tell_unassigned(uuid, uuid[], uuid) from public;

-- An ownership transfer's step, guarded: asked tells the admin it names; an answer closes the asked card and
-- tells the other side.
create function app_private.ownership_tell(transfer public.workspace_ownership_transfers, event text, actor uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  place text;
begin
  place := app_private.workspace_name(transfer.workspace_id);
  if event = 'initiated' then
    return app_private.people_tell('people.ownership_transfer_requested', transfer.workspace_id, array[transfer.target_user_id],
      'ownership:' || transfer.id::text || ':initiated',
      app_private.account_name(transfer.initiated_by) || ' asked you to become the owner of ' || place, null,
      '/account/workspaces', actor, 'ownership_transfer', transfer.id, '{}'::jsonb);
  end if;
  perform app_private.notification_resolve(transfer.workspace_id, 'ownership_transfer', transfer.id, event, actor);
  return app_private.people_tell('people.ownership_transfer_answered', transfer.workspace_id,
    array[case when event = 'cancelled' then transfer.target_user_id else transfer.initiated_by end],
    'ownership:' || transfer.id::text || ':' || event,
    case event
      when 'declined' then app_private.account_name(transfer.target_user_id) || ' declined to become the owner of ' || place
      when 'accepted' then app_private.account_name(transfer.target_user_id) || ' is the owner of ' || place || ' now'
      else 'The ownership transfer of ' || place || ' was cancelled' end,
    null, '/account/workspaces', actor, 'ownership_transfer', transfer.id, jsonb_build_object('outcome', event));
exception when others then
  raise warning 'ownership_tell: % notice for % skipped: % (%)', event, transfer.id, sqlerrm, sqlstate;
  return 0;
end;
$$;

revoke all on function app_private.ownership_tell(public.workspace_ownership_transfers, text, uuid) from public;

-- An unassigned card closes once every shift it lists has somebody, or is no longer in its location's current
-- schedule (published again, superseded, or removed by a closed day). Only open cards of the workspace are
-- read, by the open-subject index (person_notifications_open_subject); shift_ids is tested on those few.
create function app_private.unassigned_cards_settle(target_workspace uuid, target_shift uuid default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  card record;
  closed integer := 0;
begin
  for card in
    select distinct n.subject_id, n.data -> 'shift_ids' shift_ids
    from public.person_notifications n
    where n.workspace_id = target_workspace and n.subject_type = 'unassigned_shifts' and n.resolved_at is null
      and n.subject_id is not null and n.type_key = 'schedule.shifts_unassigned'
      and (target_shift is null or n.data -> 'shift_ids' ? target_shift::text)
  loop
    if not exists (
      select 1 from jsonb_array_elements_text(card.shift_ids) x
      join public.schedule_published_shifts s on s.id = x::uuid
      join public.schedule_location_publications p on p.id = s.publication_id and p.status = 'current'
      where s.employee_id is null) then
      closed := closed + app_private.notification_resolve(target_workspace, 'unassigned_shifts', card.subject_id, 'closed', null);
    end if;
  end loop;
  return closed;
exception when others then
  raise warning 'unassigned_cards_settle: cards in % not settled: % (%)', target_workspace, sqlerrm, sqlstate;
  return 0;
end;
$$;

revoke all on function app_private.unassigned_cards_settle(uuid, uuid) from public;

-- The three writes that can settle a card: a published shift given to somebody, one removed outright (a
-- closed day), a location's schedule published again. Close-only and guarded; reads are untouched.
create function app_private.unassigned_shift_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform app_private.unassigned_cards_settle(old.workspace_id, old.id);
  else
    perform app_private.unassigned_cards_settle(new.workspace_id, new.id);
  end if;
  return null;
end;
$$;

revoke all on function app_private.unassigned_shift_changed() from public;

create trigger unassigned_shift_given
after update of employee_id on public.schedule_published_shifts
for each row when (new.employee_id is not null and old.employee_id is distinct from new.employee_id)
execute function app_private.unassigned_shift_changed();

create trigger unassigned_shift_removed
after delete on public.schedule_published_shifts
for each row execute function app_private.unassigned_shift_changed();

create function app_private.unassigned_publication_replaced()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.unassigned_cards_settle(new.workspace_id, null);
  return null;
end;
$$;

revoke all on function app_private.unassigned_publication_replaced() from public;

create trigger unassigned_publication_replaced
after update of status on public.schedule_location_publications
for each row when (old.status = 'current' and new.status <> 'current')
execute function app_private.unassigned_publication_replaced();

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
  where role.id = target_membership.role_id and role.workspace_id = target_workspace_id;

  perform set_config('app.membership_change', target_membership.id::text, true);
  update public.workspace_memberships
  set role_id = next_role.id, updated_at = now()
  where id = target_membership.id and workspace_id = target_workspace_id;

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

CREATE OR REPLACE FUNCTION "public"."remove_employee_access_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_employee_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  -- The person, no longer a member, hears it (access_tell_ended).
  perform app_private.access_tell_ended(target_workspace_id, employee.id, employee.user_id, membership.id, actor_user_id);
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

CREATE OR REPLACE FUNCTION "public"."remove_employee_from_location_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_employee_id" "uuid", "target_location_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  assignment public.employee_location_assignments%rowtype;
  employee public.employee_profiles%rowtype;
  released uuid[];
  locations_left integer;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.remove_from_location',
    array[target_location_id], target_employee_id);

  select * into assignment
  from public.employee_location_assignments candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.employee_id = target_employee_id
    and candidate.location_id = target_location_id
    and candidate.ended_at is null
  for update;
  -- Not working there is answered as a target out of reach: the refusal does
  -- not tell what the record holds.
  if assignment.id is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope',
      detail = 'employee.remove_from_location';
  end if;

  select * into employee from public.employee_profiles where id = target_employee_id for update;

  update public.employee_location_assignments set ended_at = now(), is_primary = false
  where id = assignment.id;
  -- Another location they still work at becomes the primary one.
  if assignment.is_primary then
    update public.employee_location_assignments set is_primary = true
    where id = (
      select other.id from public.employee_location_assignments other
      where other.employee_id = target_employee_id and other.ended_at is null
      order by other.assigned_at, other.id
      limit 1
    );
  end if;

  -- K4: a manager's last location is not taken; the record of anybody else
  -- stays, with no location if this was the only one.
  perform app_private.keep_manager_at_a_location(target_workspace_id, target_employee_id);

  -- Their published shifts there from now on are left open, as when
  -- employment ends; their shifts elsewhere stay.
  with open_up as (
    update public.schedule_published_shifts shift
    set employee_id = null
    from public.schedule_location_publications publication, public.locations location
    where publication.id = shift.publication_id
      and publication.workspace_id = shift.workspace_id
      and publication.location_id = shift.location_id
      and publication.status = 'current'
      and location.id = shift.location_id
      and location.workspace_id = shift.workspace_id
      and shift.workspace_id = target_workspace_id
      and shift.employee_id = target_employee_id
      and shift.location_id = target_location_id
      and (shift.scheduled_date + shift.start_time) at time zone location.timezone >= now()
    returning shift.id
  )
  select coalesce(array_agg(id), '{}') into released from open_up;

  update public.employee_profiles
  set revision = revision + 1, updated_at = now()
  where id = target_employee_id;

  select count(*) into locations_left
  from public.employee_location_assignments other
  where other.employee_id = target_employee_id and other.ended_at is null;

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary, occurred_at)
  values (target_workspace_id, target_employee_id, actor_user_id, 'employee.location_removed',
    format('Removed from a location; %s published shift(s) left open', cardinality(released)), now());

  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_workspace_id, actor_user_id, 'employee.location_removed', 'employee', target_employee_id::text,
    jsonb_build_object('location_id', target_location_id, 'released_shift_ids', to_jsonb(released),
      'locations_left', locations_left));

  -- The shifts left open are told; with no location left, whoever may end their employment or give them
  -- another location decides (the owner and admins; S1). The record stays.
  perform app_private.schedule_tell_unassigned(target_workspace_id, released, actor_user_id);
  if locations_left = 0 then
    perform app_private.access_tell_no_location(target_workspace_id, target_employee_id, actor_user_id);
  end if;
  return jsonb_build_object(
    'employee_id', target_employee_id,
    'location_id', target_location_id,
    'released_shift_count', cardinality(released),
    'locations_left', locations_left
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

  select coalesce(role.access_class, membership.role) into target_access
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
      and m.user_id = actor_user_id and m.status = 'active' and coalesce(r.access_class, m.role) = 'admin'
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
      and m.status = 'active' and coalesce(r.access_class, m.role) = 'owner'
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
