-- ROL-CIFT slice 4.1 (design §4.8, KARARLAR S-167, S-168): one helper closes somebody's employee side,
-- the way a termination does; a new service changes the two access slots, with the impact shown first.

-- What closing somebody's employee side would do, counted and changed in nothing.
create function app_private.employee_side_impact(w uuid, emp uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'shifts_opened', (
      select count(*)::integer
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication
        on publication.id = shift.publication_id and publication.workspace_id = shift.workspace_id
       and publication.location_id = shift.location_id and publication.status = 'current'
      join public.locations location on location.id = shift.location_id and location.workspace_id = shift.workspace_id
      where shift.workspace_id = w and shift.employee_id = emp
        and (shift.scheduled_date + shift.start_time) at time zone location.timezone >= now()),
    'requests_closed', (
      select count(*)::integer from public.shift_exchange_cases c
      where c.workspace_id = w and c.owner_id = emp and c.status = 'open'),
    'applications_closed', (
      select count(*)::integer
      from public.shift_exchange_applications a
      join public.shift_exchange_cases c on c.id = a.case_id and c.workspace_id = a.workspace_id
      where a.workspace_id = w and a.employee_id = emp and a.status in ('invited', 'pending_manager')
        and c.status = 'open' and c.owner_id <> emp),
    'time_off_withdrawn', (
      select count(*)::integer from public.schedule_time_off_requests r
      where r.workspace_id = w and r.employee_id = emp and r.status = 'pending'),
    'availability_deleted',
      exists (select 1 from public.employee_weekly_preferences p where p.workspace_id = w and p.employee_id = emp)
      or exists (select 1 from public.manager_weekly_reminders m where m.workspace_id = w and m.employee_id = emp))
$$;

-- Closes what somebody leaves open on the employee side, so nothing waits half done in a manager's
-- Needs decision list (design §4.8). 'access_dropped': the employee access is given up, so their future
-- shifts open too (the availability goes with the slot, availability_follows_role). 'terminated': the
-- termination opened the shifts itself, with its own record. 'access_removed': the record and its
-- shifts stay, as Remove access says.
create function app_private.close_employee_side(w uuid, emp uuid, actor uuid, reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  impact jsonb;
  opened uuid[];
  closed record;
  why text := case reason
    when 'terminated' then 'This person no longer works here.'
    when 'access_removed' then 'This person no longer has access to the workspace.'
    else 'This person no longer works shifts here.' end;
begin
  if reason is null or reason not in ('access_dropped', 'terminated', 'access_removed') then
    raise exception 'unknown reason to close the employee side' using errcode = '22023';
  end if;
  perform public.availability_lock_workspace(w);
  impact := app_private.employee_side_impact(w, emp);

  if reason = 'access_dropped' then
    with released as (
      update public.schedule_published_shifts shift
      set employee_id = null
      from public.schedule_location_publications publication, public.locations location
      where publication.id = shift.publication_id and publication.workspace_id = shift.workspace_id
        and publication.location_id = shift.location_id and publication.status = 'current'
        and location.id = shift.location_id and location.workspace_id = shift.workspace_id
        and shift.workspace_id = w and shift.employee_id = emp
        and (shift.scheduled_date + shift.start_time) at time zone location.timezone >= now()
      returning shift.id)
    select coalesce(array_agg(id), '{}') into opened from released;
    perform app_private.schedule_tell_unassigned(w, opened, actor);
  else
    impact := impact || jsonb_build_object('shifts_opened', 0, 'availability_deleted', false);
  end if;

  -- Their own requests: a swap, a cover, a release.
  for closed in
    update public.shift_exchange_cases c
    set status = 'cancelled', revision = c.revision + 1, updated_at = now()
    where c.workspace_id = w and c.owner_id = emp and c.status = 'open'
    returning c.id
  loop
    update public.shift_exchange_applications
    set status = 'closed_case_cancelled', updated_at = now()
    where case_id = closed.id and status in ('invited', 'pending_manager');
    delete from public.shift_exchange_votes where case_id = closed.id;
    perform public.shift_exchange_emit(actor, w, closed.id, null, 'case_closed',
      why || ' This request was closed. The owner keeps this shift.');
  end loop;

  -- What they answered on somebody else's request; a request made to them alone closes with it.
  for closed in
    update public.shift_exchange_applications a
    set status = 'closed_case_cancelled', updated_at = now()
    from public.shift_exchange_cases c
    where c.id = a.case_id and c.workspace_id = a.workspace_id and c.status = 'open'
      and a.workspace_id = w and a.employee_id = emp and a.status in ('invited', 'pending_manager')
    returning a.id, a.case_id, c.audience
  loop
    delete from public.shift_exchange_votes where case_id = closed.case_id and application_id = closed.id;
    update public.shift_exchange_cases
    set status = case when closed.audience = 'direct' then 'cancelled' else status end,
        revision = revision + 1, updated_at = now()
    where id = closed.case_id;
    perform public.shift_exchange_emit(actor, w, closed.case_id, closed.id, 'application_closed',
      why || ' Their answer was closed. No assignment changed.');
  end loop;

  -- Their time off waiting for a decision is withdrawn (design §4.8).
  for closed in
    update public.schedule_time_off_requests r
    set status = 'revoked', revision = r.revision + 1, updated_at = now()
    where r.workspace_id = w and r.employee_id = emp and r.status = 'pending'
    returning r.id
  loop
    insert into public.schedule_time_off_events (workspace_id, request_id, action, actor_user_id, note)
    values (w, closed.id, 'revoked', actor, why);
    perform app_private.time_off_tell(w, closed.id, 'withdrawn', actor);
  end loop;

  return impact;
end;
$$;

-- Who may change somebody's access, and the membership it changes (design §4.7, §4.8). Unknown and
-- out of reach answer alike; the owner alone gives themselves the employee access (S-165).
create function app_private.access_change_target(actor uuid, w uuid, emp uuid, next_employee_role uuid,
  next_management_role uuid) returns public.workspace_memberships
language plpgsql security definer set search_path = '' as $$
declare
  me app_private.actor_state := app_private.actor(actor, w);
  record public.employee_profiles;
  member public.workspace_memberships;
  own_record boolean;
begin
  select * into record from public.employee_profiles p where p.id = emp and p.workspace_id = w;
  own_record := record.user_id is not null and record.user_id = actor;
  -- One rank above the person's highest access (design §4.8); the owner and an admin keep their own
  -- record, the core says (employee.save), and of the two only the owner has nobody above.
  if own_record and me.class = 'owner' then
    perform app_private.authorize(actor, w, 'employee.save', target_person => emp);
  else
    perform app_private.authorize(actor, w, 'employee.change_role', target_person => emp);
  end if;

  if record.archived_at is not null then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;
  if record.user_id is null then
    raise exception 'employee has no linked workspace account' using errcode = '22023';
  end if;
  select m.* into member from public.workspace_memberships m
  where m.workspace_id = w and m.user_id = record.user_id and m.status = 'active'
  for update;
  if member.id is null then
    raise exception 'active workspace membership not found' using errcode = 'P0002';
  end if;

  if next_employee_role is null and next_management_role is null then
    raise exception 'choose an employee access, a management access or both'
      using errcode = '22023', hint = 'access.role_required';
  end if;
  -- Which slot a role fits is the membership's own rule (membership_access_slots_hold).

  if own_record and me.class = 'owner' then
    -- The owner's own record: the employee access alone; the owner stays the owner.
    if next_management_role is distinct from member.role_id then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.rank', detail = 'employee.change_role';
    end if;
    return member;
  end if;
  -- Whatever is given is below the one who gives it, asked the way any role grant is; the owner
  -- access only comes by a transfer.
  if next_employee_role is not null and next_employee_role is distinct from member.employee_role_id then
    perform app_private.authorize_role_grant(actor, w, next_employee_role, target_person => emp);
  end if;
  if next_management_role is not null and next_management_role is distinct from member.role_id then
    perform app_private.authorize_role_grant(actor, w, next_management_role, target_person => emp);
  end if;
  return member;
end;
$$;

create function app_private.access_change_impact(w uuid, member public.workspace_memberships, emp uuid,
  next_employee_role uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when member.employee_role_id is not null and next_employee_role is null
    then app_private.employee_side_impact(w, emp)
    else jsonb_build_object('shifts_opened', 0, 'requests_closed', 0, 'applications_closed', 0,
      'time_off_withdrawn', 0, 'availability_deleted', false) end
$$;

create function public.preview_employee_access_change_service(actor_user_id uuid, target_workspace_id uuid,
  target_employee_id uuid, next_employee_role_id uuid, next_management_role_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  member public.workspace_memberships := app_private.access_change_target(actor_user_id, target_workspace_id,
    target_employee_id, next_employee_role_id, next_management_role_id);
begin
  return app_private.access_change_impact(target_workspace_id, member, target_employee_id, next_employee_role_id);
end;
$$;

create function public.change_employee_access_service(actor_user_id uuid, target_workspace_id uuid,
  target_employee_id uuid, next_employee_role_id uuid, next_management_role_id uuid,
  managed_location_ids uuid[], management_job_ids uuid[], expected_impact jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  member public.workspace_memberships;
  management_class text;
  impact jsonb;
  places uuid[] := coalesce(managed_location_ids, '{}');
  jobs uuid[] := coalesce(management_job_ids, '{}');
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

revoke all on function app_private.employee_side_impact(uuid, uuid) from public;
revoke all on function app_private.close_employee_side(uuid, uuid, uuid, text) from public;
revoke all on function app_private.access_change_target(uuid, uuid, uuid, uuid, uuid) from public;
revoke all on function app_private.access_change_impact(uuid, public.workspace_memberships, uuid, uuid) from public;
revoke all on function public.preview_employee_access_change_service(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.change_employee_access_service(uuid, uuid, uuid, uuid, uuid, uuid[], uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.preview_employee_access_change_service(uuid, uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.change_employee_access_service(uuid, uuid, uuid, uuid, uuid, uuid[], uuid[], jsonb) to service_role;
