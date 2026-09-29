-- FB-6.2.2: where a manager reaches, and removing somebody from one location.
--
-- 1. A manager may manage a location without working there ("yalnız yönetir",
--    KARARLAR; FB-6.2 P2 (a), S2): public.membership_managed_locations. The
--    core counts it wherever a manager reaches (actor().manages) and wherever
--    a person is reached (authz_check's person places), so the other managers
--    of that location see them (M2). It is not an assignment: no Schedule row,
--    no shift, no candidate list reads it. The admin's command to add and
--    remove one, and dropping them when the role falls below manager (S3),
--    come with the role service in FB-6.2.4.
-- 2. The four older location helpers answer the same for a managed location.
-- 3. An employee's membership never reaches every location (Done when 5).
-- 4. employee.remove_from_location (S1): a manager takes an employee off a
--    location they manage; the record stays, with no location if it was the
--    only one, and the owner and admins are told. Ending employment stays
--    admin and owner only.

-- 1. Managed without working there ----------------------------------------------

create table public.membership_managed_locations (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  membership_id uuid not null,
  location_id uuid not null,
  added_by uuid not null references auth.users (id),
  added_at timestamptz not null default now(),
  primary key (membership_id, location_id),
  foreign key (membership_id, workspace_id)
    references public.workspace_memberships (id, workspace_id) on delete cascade,
  foreign key (location_id, workspace_id)
    references public.locations (id, workspace_id) on delete cascade
);
comment on table public.membership_managed_locations is
  'Locations a manager manages without working there (FB-6.2 S2). Read by the authorization core only; never an assignment.';
create index membership_managed_locations_location_idx
  on public.membership_managed_locations (workspace_id, location_id);
alter table public.membership_managed_locations enable row level security;
revoke all on table public.membership_managed_locations from public, anon, authenticated;

create or replace function app_private.actor(actor uuid, w uuid)
returns app_private.actor_state
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  state app_private.actor_state;
  held_role uuid;
begin
  state.user_id := actor;
  state.workspace_id := w;
  state.works := '{}';
  state.manages := '{}';
  state.permissions := '{}';

  select membership.id, membership.status, role.access_class, role.id
    into state.membership_id, state.status, state.class, held_role
  from public.workspace_memberships membership
  join public.workspace_roles role
    on role.id = membership.role_id and role.workspace_id = membership.workspace_id
  where membership.workspace_id = w and membership.user_id = actor;
  if state.membership_id is null then
    return state;
  end if;

  state.workspace_open := app_private.workspace_open_to_actor(w, actor);
  state.document_blocked := coalesce(app_private.document_actor_blocked(actor, w), false);

  select profile.id into state.employee_id
  from public.employee_profiles profile
  where profile.workspace_id = w and profile.user_id = actor and profile.archived_at is null;

  state.works := coalesce((
    select array_agg(distinct assignment.location_id order by assignment.location_id)
    from public.employee_location_assignments assignment
    where assignment.workspace_id = w
      and assignment.employee_id = state.employee_id
      and assignment.ended_at is null
  ), '{}');

  -- A manager manages where they work and where they only manage.
  state.manages := case
    when state.class in ('owner', 'admin') then coalesce((
      select array_agg(location.id order by location.id)
      from public.locations location
      where location.workspace_id = w and location.deleted_at is null
    ), '{}')
    when state.class = 'manager' then coalesce((
      select array_agg(place order by place)
      from (
        select unnest(state.works) as place
        union
        select managed.location_id
        from public.membership_managed_locations managed
        join public.locations location
          on location.id = managed.location_id and location.workspace_id = managed.workspace_id
        where managed.membership_id = state.membership_id and location.deleted_at is null
      ) reached
    ), '{}')
    else '{}'::uuid[]
  end;

  state.permissions := coalesce((
    select array_agg(grant_row.permission_key order by grant_row.permission_key)
    from public.workspace_role_permissions grant_row
    join public.permissions permission on permission.key = grant_row.permission_key
    where grant_row.workspace_id = w
      and grant_row.role_id = held_role
      and (state.class <> 'employee' or permission.employee_eligible)
  ), '{}');

  return state;
end;
$$;

create or replace function app_private.authz_check(
  state app_private.actor_state,
  rule_row app_private.authz_actions,
  target_locations uuid[],
  target_person uuid,
  target_user uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_workspace uuid;
  person uuid := target_person;
  whose uuid;
  target_access public.workspace_role;
  target_is_self boolean;
  places uuid[];
  reach text;
begin
  if state.user_id is null then
    return 'not_member';
  end if;
  if rule_row.scope_class = 'account' then
    -- An account action is about one's own account.
    if target_user is not null and target_user is distinct from state.user_id then
      return 'out_of_scope';
    end if;
    return null;
  end if;
  if state.membership_id is null then
    return 'not_member';
  end if;
  if not state.workspace_open then
    return 'workspace_closed';
  end if;

  if person is not null then
    select profile.workspace_id, profile.user_id into target_workspace, whose
    from public.employee_profiles profile
    where profile.id = person;
    if target_workspace is distinct from state.workspace_id then
      return 'out_of_scope';
    end if;
  end if;
  if target_user is not null then
    if person is not null and whose is distinct from target_user then
      return 'out_of_scope';
    end if;
    whose := target_user;
    if person is null then
      select profile.id into person
      from public.employee_profiles profile
      where profile.workspace_id = state.workspace_id
        and profile.user_id = target_user
        and profile.archived_at is null;
      if person is null and not exists (
        select 1 from public.workspace_memberships membership
        where membership.workspace_id = state.workspace_id and membership.user_id = target_user
      ) then
        return 'out_of_scope';
      end if;
    end if;
  end if;
  target_is_self := coalesce(whose = state.user_id, false);

  -- Their own row is theirs to read in any state.
  if rule_row.self_ok and target_is_self then
    return null;
  end if;

  if state.status = 'pending_activation' then
    if not rule_row.restricted_ok then
      return 'not_active';
    end if;
  elsif state.status <> 'active' then
    return 'not_active';
  elsif state.document_blocked and not rule_row.restricted_ok then
    return 'document_blocked';
  end if;

  if rule_row.scope_class = 'own' then
    if (person is null and whose is null) or target_is_self then
      return null;
    end if;
    return 'out_of_scope';
  end if;

  if rule_row.owner_only and state.class <> 'owner' then
    return 'owner_only';
  end if;
  -- The owner holds every permission.
  if state.class <> 'owner'
     and rule_row.permission_key is not null
     and not rule_row.permission_key = any (state.permissions) then
    return 'missing_permission';
  end if;
  if state.class = 'employee' then
    return 'missing_permission';
  end if;

  if rule_row.no_self and target_is_self then
    return 'rank';
  end if;
  -- A manager's own record goes one level up; owners and admins keep theirs
  -- (user decision 2026-09-24, 2A).
  if rule_row.rank_below and target_is_self and state.class not in ('owner', 'admin') then
    return 'rank';
  end if;
  if rule_row.rank_below and (person is not null or whose is not null) and not target_is_self then
    select role.access_class into target_access
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    where membership.workspace_id = state.workspace_id and membership.user_id = whose;
    -- ponytail: somebody without a membership yet ranks as an employee; use the
    -- invitation's role if a manager ever invites into a higher one.
    if app_private.authz_rank(coalesce(target_access, 'employee')) >= app_private.authz_rank(state.class) then
      return 'rank';
    end if;
  end if;

  -- Some actions are about employees only: never a manager, an admin or the
  -- owner, whoever asks, themselves included (the Manager note, 2026-09-26).
  if rule_row.employee_target and (person is not null or whose is not null)
     and not app_private.ranks_as_employee(state.workspace_id, whose) then
    return 'rank';
  end if;

  if state.class in ('owner', 'admin') then
    reach := 'org';
  else
    select rule.manager_rule into reach
    from app_private.authz_scope_rules rule
    join app_private.authz_settings setting on setting.scope_model = rule.model
    where rule.scope_class = rule_row.scope_class and rule.effect = rule_row.effect;
    reach := coalesce(reach, 'none');
  end if;

  if rule_row.scope_class = 'org' then
    if reach = 'none' then
      return 'out_of_scope';
    end if;
    return null;
  end if;

  if target_locations is not null then
    places := target_locations;
    if array_position(places, null) is not null then
      return 'out_of_scope';
    end if;
    if rule_row.scope_class = 'place' and cardinality(places) <> 1 then
      return 'out_of_scope';
    end if;
    if exists (
      select 1 from unnest(places) place
      where not exists (
        select 1 from public.locations location
        where location.id = place and location.workspace_id = state.workspace_id and location.deleted_at is null
      )
    ) then
      return 'out_of_scope';
    end if;
  elsif rule_row.scope_class = 'person' and (person is not null or whose is not null) then
    -- Where the person is: where they work and, for a manager, where they
    -- only manage; somebody with no employee record works nowhere.
    places := coalesce((
      select array_agg(distinct place)
      from (
        select assignment.location_id as place
        from public.employee_location_assignments assignment
        where assignment.employee_id = person and assignment.ended_at is null
        union all
        select managed.location_id
        from public.membership_managed_locations managed
        join public.workspace_memberships membership on membership.id = managed.membership_id
        where membership.workspace_id = state.workspace_id and membership.user_id = whose
      ) reached
    ), '{}');
  else
    return 'out_of_scope';
  end if;

  if reach = 'org' then
    return null;
  end if;
  if reach = 'none' or cardinality(places) = 0 then
    return 'out_of_scope';
  end if;
  if reach = 'any' and places && state.manages then
    return null;
  end if;
  if reach = 'all' and places <@ state.manages then
    return null;
  end if;
  return 'out_of_scope';
end;
$$;

-- 2. The older location helpers see a managed location too -------------------------

create or replace function public.schedule_actor_can_manage_service(actor_user_id uuid, target_workspace_id uuid, target_location_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    join public.workspace_role_permissions permission
      on permission.role_id = role.id and permission.workspace_id = role.workspace_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
      and role.access_class in ('owner', 'admin', 'manager')
      and permission.permission_key = 'schedule.manage'
      and (
        target_location_id is null
        or (membership.all_locations and exists (
          select 1 from public.locations location
          where location.id = target_location_id and location.workspace_id = target_workspace_id))
        or exists (
          select 1 from public.membership_location_scopes scope
          where scope.membership_id = membership.id
            and scope.workspace_id = target_workspace_id
            and scope.location_id = target_location_id
        )
        or exists (
          select 1 from public.membership_managed_locations managed
          where managed.membership_id = membership.id and managed.location_id = target_location_id
        )
      )
  );
$$;

create or replace function public.schedule_actor_can_publish_service(actor_user_id uuid, target_workspace_id uuid, target_location_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    join public.workspace_role_permissions permission
      on permission.role_id = role.id and permission.workspace_id = role.workspace_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
      and role.access_class in ('owner', 'admin', 'manager')
      and permission.permission_key = 'schedule.publish'
      and (
        target_location_id is null
        or (membership.all_locations and exists (
          select 1 from public.locations location
          where location.id = target_location_id and location.workspace_id = target_workspace_id))
        or exists (
          select 1 from public.membership_location_scopes scope
          where scope.membership_id = membership.id
            and scope.workspace_id = target_workspace_id
            and scope.location_id = target_location_id
        )
        or exists (
          select 1 from public.membership_managed_locations managed
          where managed.membership_id = membership.id and managed.location_id = target_location_id
        )
      )
  );
$$;

create or replace function public.schedule_actor_has_capability_service(actor_user_id uuid, target_workspace_id uuid, capability text, target_location_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
 select exists(select 1 from public.workspace_memberships m join public.workspace_roles r on r.id=m.role_id and r.workspace_id=m.workspace_id
 join public.workspace_role_permissions p on p.role_id=r.id and p.workspace_id=r.workspace_id
 where m.workspace_id=target_workspace_id and m.user_id=actor_user_id and m.status='active' and r.access_class in ('owner','admin','manager')
 and p.permission_key=capability and (target_location_id is null
   or (m.all_locations and exists(select 1 from public.locations l where l.id=target_location_id and l.workspace_id=target_workspace_id))
   or exists(select 1 from public.membership_location_scopes s where s.membership_id=m.id and s.workspace_id=target_workspace_id and s.location_id=target_location_id)
   or exists(select 1 from public.membership_managed_locations mm where mm.membership_id=m.id and mm.location_id=target_location_id)));
$$;

create or replace function public.communication_actor_has_capability_service(actor_user_id uuid, target_workspace_id uuid, capability text, target_location_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
 select exists(
  select 1 from public.workspace_memberships membership
  join public.workspace_roles role on role.id=membership.role_id and role.workspace_id=membership.workspace_id
  join public.workspace_role_permissions permission on permission.role_id=role.id and permission.workspace_id=role.workspace_id
  where membership.workspace_id=target_workspace_id and membership.user_id=actor_user_id and membership.status='active'
   and permission.permission_key=capability
   and (target_location_id is null
    or (membership.all_locations and exists(select 1 from public.locations location where location.id=target_location_id and location.workspace_id=target_workspace_id))
    or exists(select 1 from public.membership_location_scopes scope where scope.membership_id=membership.id and scope.workspace_id=target_workspace_id and scope.location_id=target_location_id)
    or exists(select 1 from public.membership_managed_locations managed where managed.membership_id=membership.id and managed.location_id=target_location_id))
 );
$$;

-- 3. An employee's membership reaches only where they work -------------------------

create or replace function app_private.enforce_role_location_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
 if new.role in ('owner','admin') then new.all_locations:=true;
 else new.all_locations:=false;
 end if;
 return new;
end; $$;

update public.workspace_memberships set all_locations = false
where role = 'employee' and all_locations;
-- The update queues the deferred document trigger; run it before the table changes.
set constraints public.document_assignment_changed immediate;

alter table public.workspace_memberships
  add constraint workspace_memberships_employee_not_all_locations
  check (role <> 'employee' or not all_locations);
set constraints public.document_assignment_changed deferred;

-- 4. Removing somebody from one location ---------------------------------------------

insert into app_private.authz_actions
  (key, scope_class, effect, permission_key, owner_only, restricted_ok, self_ok, no_self, rank_below)
values
  ('employee.remove_from_location', 'person', 'write', 'employees.manage', false, false, false, true, true);

insert into public.notification_catalog (
  type_key, schema_version, category, severity, sensitivity, supported_channels,
  default_cadence, audience_contract, action_route_contract, dedupe_policy,
  retention_class, template_key, lifecycle, mandatory_in_app, notification_scope
)
values (
  'people.employee.no_location', 1, 'people', 'action_required', 'confidential',
  '{in_app}', 'immediate', 'workspace_employee_access_managers',
  '{"route": "/app/employees", "allowed_query_keys": ["employeeId"]}',
  '{"scope": "event_recipient", "strategy": "keep_first", "key_fields": ["event_id", "recipient_user_id"]}',
  'sensitive_30d', 'people.employee.no_location.v1', 'active', false, 'workspace'
);

insert into public.notification_producer_registry (type_key, schema_version, producer_id, source_migration, source_function, integration_contract)
values ('people.employee.no_location', 1, 'employee-removed-from-location',
  '20260930120000_a_manager_manages_where_they_do_not_work.sql', 'remove_employee_from_location_service', 'outbox_v1');

insert into public.notification_template_versions (type_key, schema_version, channel, locale, template_version, template_key, content, status, published_at)
values ('people.employee.no_location', 1, 'in_app', 'en', 1, 'people.employee.no_location.v1',
  '{"title": "No location left", "body": "Somebody on your team has no location left. End their employment or give them a new location.", "action_url": "/app/employees", "safe_preview": "Somebody on your team has no location left."}',
  'published', now());

create function public.remove_employee_from_location_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  target_location_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment public.employee_location_assignments%rowtype;
  employee public.employee_profiles%rowtype;
  released uuid[];
  locations_left integer;
  told uuid[];
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

  -- No location left: whoever may end their employment or give them another
  -- location decides (the owner and admins; S1). The record stays.
  if locations_left = 0 then
    select coalesce(array_agg(member.user_id order by member.user_id), '{}') into told
    from public.workspace_memberships member
    where member.workspace_id = target_workspace_id
      and member.status = 'active'
      and member.user_id is distinct from actor_user_id
      and app_private.authz_reason(member.user_id, target_workspace_id, 'employee.terminate', null, target_employee_id) is null;
    if cardinality(told) > 0 then
      perform public.enqueue_notification_outbox_service(
        target_workspace_id,
        gen_random_uuid(),
        'people.employee.no_location',
        1,
        actor_user_id,
        'employee',
        target_employee_id::text,
        jsonb_build_object(
          'employee_id', target_employee_id,
          'recipient_user_ids', to_jsonb(told),
          'audience_contract', 'workspace_employee_access_managers',
          'category', 'people',
          'title', 'No location left',
          'body', left(concat_ws(' ', employee.first_name, employee.last_name)
            || ' has no location left. End their employment or give them a new location.', 2000),
          'safe_preview', 'Somebody on your team has no location left.',
          'action_url', '/app/employees?employeeId=' || target_employee_id::text,
          'group_key', 'employee:' || target_employee_id::text
        ),
        now()
      );
    end if;
  end if;

  return jsonb_build_object(
    'employee_id', target_employee_id,
    'location_id', target_location_id,
    'released_shift_count', cardinality(released),
    'locations_left', locations_left
  );
end;
$$;

revoke all on function public.remove_employee_from_location_service(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.remove_employee_from_location_service(uuid, uuid, uuid, uuid) to service_role;
