-- FOUNDATION-B stage 4a: one authorization core.
--
-- Every "may this person do this here" question gets its answer in one place,
-- written as data:
--   app_private.authz_actions      what each action needs: permission, owner only,
--                                  rank, and what it reaches (its scope class)
--   app_private.authz_scope_rules  how far a manager reaches, per scope model
--   app_private.authz_settings     which scope model is in force: M2, "the person
--                                  is shared, the shift is local" (user decision
--                                  2026-09-23, docs/plan/REUSE.md)
-- and a handful of functions:
--   app_private.actor(actor, w)          who the person is in the workspace, resolved once
--   app_private.authz_reason(...)        null when allowed, otherwise the reason key
--   app_private.authorize(...)           raises 42501 'Not allowed', hint authz.<reason>,
--                                        detail <action>; the first statement of an entry point
--   app_private.scope_set(actor, w, act) the locations the action reaches; never null
--   app_private.rls_can(...)             the same answer for the signed-in browser user
--
-- The order of the refusals: not_member, workspace_closed, not_active,
-- document_blocked, owner_only, missing_permission, rank, out_of_scope. A blank
-- location (null) never means everywhere; an empty set ('{}') is the whole
-- organization and only an organization-wide reach passes it. An unknown target
-- and one out of reach get the same answer, so a refusal does not tell whether
-- the row exists.
--
-- Entry points move onto the core domain by domain in stage 6. The
-- authorization matrix checks the core against expected() in every cell it
-- probes; actions it does not probe yet are provisional until their slice adds
-- matrix rows, before any service calls them.

-- 1. Which permissions an employee-class role can hold ------------------------------
-- The list was copied into role defaults, role saving and the permission check.

alter table public.permissions
  add column employee_eligible boolean not null default false;
comment on column public.permissions.employee_eligible is
  'An employee-class role may hold this permission (personal access only).';
update public.permissions set employee_eligible = true
where key in (
  'workspace.read', 'schedule.read', 'announcements.read', 'notifications.read',
  'notifications.read_own', 'notifications.preferences.write_own',
  'time.capture.own', 'time.read.own', 'time.correction.request.own'
);

-- Admins edit Settings -> Roles by default (D2, user decision 2026-09-23); they
-- still cannot grant what they do not hold, and never the admin or owner role
-- (save_workspace_role_service, app_private.can_edit_role).
create or replace function app_private.role_default_permissions(role_class public.workspace_role)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
 select coalesce(array_agg(key order by key), '{}'::text[]) from public.permissions where
 role_class in ('owner', 'admin')
 or (role_class = 'manager' and key in (
 'workspace.read','schedule.read','schedule.manage','schedule.availability.override','schedule.publish','schedule.templates.read','schedule.templates.manage','schedule.export',
 'schedule.lineup.read','schedule.lineup.manage','schedule.lineup.share','schedule.time_off_requests.read','schedule.time_off_requests.manage','schedule.shift_change_requests.read','schedule.shift_change_requests.manage',
 'availability.read','availability.manage','employees.read','employees.manage','employees.archive','employee_onboarding.review','announcements.read','announcements.manage','important_dates.read','important_dates.manage',
 'notifications.read','notifications.read_own','notifications.preferences.write_own',
 'time.capture.own','time.read.own','time.correction.request.own','time.read.location','time.amend.location','time.correction.review.location','time.review.approve.location',
 'time.export.preview.location','time.export.create.location','time.export.read.location','time.export.audit.read','kiosk.device.enroll.location','kiosk.device.read.location','kiosk.device.revoke.location','kiosk.pin.reset.location','kiosk.audit.read.location'))
 or (role_class = 'employee' and employee_eligible);
$$;

insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
select role.workspace_id, role.id, 'roles.manage'
from public.workspace_roles role
where role.system_key = 'admin'
on conflict do nothing;

create or replace function public.service_actor_has_permission(actor_user_id uuid, target_workspace_id uuid, target_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
 select not app_private.document_actor_blocked(actor_user_id,target_workspace_id) and exists(select 1 from public.workspace_memberships m
 where m.user_id=actor_user_id and m.workspace_id=target_workspace_id and m.status='active'
 and (target_permission in ('workspace.read','notifications.read','notifications.read_own','notifications.preferences.write_own')
   or exists(select 1 from public.workspace_role_permissions g where g.role_id=m.role_id and g.workspace_id=m.workspace_id and g.permission_key=target_permission))
 and (m.role<>'employee' or exists(select 1 from public.permissions p where p.key=target_permission and p.employee_eligible)));
$$;

CREATE OR REPLACE FUNCTION public.save_workspace_role_service(actor_user_id uuid, target_workspace_id uuid, target_role_id uuid, role_name text, role_description text, role_access_class workspace_role, permission_keys text[], expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target public.workspace_roles; saved uuid; normalized text[]; actor_class public.workspace_role;
begin
 -- Serialize role editors, including concurrent actor-grant changes.
 perform pg_advisory_xact_lock(hashtextextended('roles:'||target_workspace_id::text,0));
 if not app_private.can_edit_role(actor_user_id,target_workspace_id,target_role_id) then raise exception 'role management access denied' using errcode='42501'; end if;
 select role into actor_class from public.workspace_memberships where user_id=actor_user_id and workspace_id=target_workspace_id and status='active';
 if target_role_id is not null then
  select * into target from public.workspace_roles where id=target_role_id and workspace_id=target_workspace_id for update;
  if expected_updated_at is null or expected_updated_at<>target.updated_at then raise exception 'Role changed since you opened it. Reload before saving.' using errcode='PT409'; end if;
  if role_access_class<>target.access_class then raise exception 'Existing role experience cannot change' using errcode='22023'; end if;
 elsif role_access_class not in ('manager','employee') then raise exception 'Custom roles require a manager or employee experience' using errcode='42501'; end if;
 if role_name is null or char_length(btrim(role_name)) not between 1 and 64 or char_length(coalesce(role_description,''))>240 then raise exception 'Valid role details required' using errcode='22023'; end if;
 select coalesce(array_agg(distinct key order by key),'{}'::text[]) into normalized from unnest(coalesce(permission_keys,'{}'::text[])) key;
 if not 'workspace.read'=any(normalized) then raise exception 'Basic account access required' using errcode='22023'; end if;
 if exists(select 1 from unnest(normalized) k left join public.permissions p on p.key=k where p.key is null) then raise exception 'Unknown permission' using errcode='22023'; end if;
 if role_access_class<>'admin' and exists(select 1 from public.permissions p where p.key=any(normalized) and not p.custom_grantable and not exists(select 1 from public.workspace_role_permissions old_grant where old_grant.role_id=target_role_id and old_grant.permission_key=p.key)) then raise exception 'Permission is not eligible for a lower role' using errcode='42501'; end if;
 if role_access_class<>'admin' and normalized && array['roles.manage','workspace.manage'] then raise exception 'Protected management access denied' using errcode='42501'; end if;
 if role_access_class='employee' and exists(select 1 from unnest(normalized) k where k not in (select p.key from public.permissions p where p.employee_eligible)) then raise exception 'Employee roles are limited to personal access' using errcode='42501'; end if;
 -- Admin delegation cannot manufacture permissions it does not itself hold.
 if actor_class='admin' and exists(select 1 from unnest(normalized) k where not public.service_actor_has_permission(actor_user_id,target_workspace_id,k)) then raise exception 'Cannot grant access beyond your own permissions' using errcode='42501'; end if;
 if exists(select 1 from app_private.role_permission_dependencies d where d.permission_key=any(normalized) and not d.required_key=any(normalized)) then raise exception 'Permission set requires dependent read access' using errcode='22023'; end if;
 if target_role_id is null then
  insert into public.workspace_roles(workspace_id,name,description,access_class,sort_order,created_by) values(target_workspace_id,btrim(role_name),btrim(coalesce(role_description,'')),role_access_class,100,actor_user_id) returning id into saved;
 else
  saved:=target_role_id;
  update public.workspace_roles set name=case when system_key is null then btrim(role_name) else name end,description=case when system_key is null then btrim(coalesce(role_description,'')) else description end,updated_at=clock_timestamp() where id=saved;
 end if;
 delete from public.workspace_role_permissions where role_id=saved;
 insert into public.workspace_role_permissions(workspace_id,role_id,permission_key) select target_workspace_id,saved,unnest(normalized);
 insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata) values(target_workspace_id,actor_user_id,case when target_role_id is null then 'role.created' else 'role.updated' end,'workspace_role',saved::text,jsonb_build_object('permissions',normalized));
 return saved;
end; $function$;

-- 2. The rules, as data -------------------------------------------------------------

create table app_private.authz_settings (
  singleton boolean primary key default true check (singleton),
  scope_model text not null default 'M2' check (scope_model in ('M1', 'M2', 'M3', 'M4'))
);
comment on table app_private.authz_settings is
  'The scope model in force. Changing the model is this one row (docs/plan/research/bl070-2026-09-23/G-kapsam-modeli.md, section 4).';
insert into app_private.authz_settings default values;

-- How far a manager reaches. Owners and admins reach the whole organization in
-- every model. org: anywhere in the workspace; any: at least one of the target's
-- locations is theirs; all: every target location is theirs; none: nowhere.
create table app_private.authz_scope_rules (
  model text not null check (model in ('M1', 'M2', 'M3', 'M4')),
  scope_class text not null check (scope_class in ('org', 'place', 'set', 'person')),
  effect text not null check (effect in ('read', 'write', 'cross')),
  manager_rule text not null check (manager_rule in ('org', 'any', 'all', 'none')),
  primary key (model, scope_class, effect)
);
comment on table app_private.authz_scope_rules is
  'Per scope model: how far a manager reaches for each kind of target (org, one place, a set of places, a person) and effect (read, write, cross: a person decision that affects their other locations).';
insert into app_private.authz_scope_rules (model, scope_class, effect, manager_rule) values
  -- M1: strict location scope; every decision about a person needs all of their locations.
  ('M1', 'org', 'read', 'org'), ('M1', 'org', 'write', 'none'),
  ('M1', 'place', 'read', 'all'), ('M1', 'place', 'write', 'all'),
  ('M1', 'set', 'read', 'all'), ('M1', 'set', 'write', 'all'),
  ('M1', 'person', 'read', 'any'), ('M1', 'person', 'write', 'all'), ('M1', 'person', 'cross', 'none'),
  -- M2: the person is shared, the shift is local.
  ('M2', 'org', 'read', 'org'), ('M2', 'org', 'write', 'none'),
  ('M2', 'place', 'read', 'all'), ('M2', 'place', 'write', 'all'),
  ('M2', 'set', 'read', 'all'), ('M2', 'set', 'write', 'all'),
  ('M2', 'person', 'read', 'any'), ('M2', 'person', 'write', 'any'), ('M2', 'person', 'cross', 'none'),
  -- M3: reads the whole organization, writes at its own locations.
  ('M3', 'org', 'read', 'org'), ('M3', 'org', 'write', 'none'),
  ('M3', 'place', 'read', 'org'), ('M3', 'place', 'write', 'all'),
  ('M3', 'set', 'read', 'org'), ('M3', 'set', 'write', 'all'),
  ('M3', 'person', 'read', 'org'), ('M3', 'person', 'write', 'any'), ('M3', 'person', 'cross', 'none'),
  -- M4: no location scope; a manager is an admin without the settings.
  ('M4', 'org', 'read', 'org'), ('M4', 'org', 'write', 'none'),
  ('M4', 'place', 'read', 'org'), ('M4', 'place', 'write', 'org'),
  ('M4', 'set', 'read', 'org'), ('M4', 'set', 'write', 'org'),
  ('M4', 'person', 'read', 'org'), ('M4', 'person', 'write', 'org'), ('M4', 'person', 'cross', 'org');

-- What each action needs. scope_class says what the target is:
--   account  a signed-in person, no workspace needed (own account, a new workspace)
--   own      an active member acting on their own things; a target person must be themselves
--   org      the organization itself (settings, owner-only acts); no location
--   place    exactly one location
--   set      one or more locations; '{}' is the whole organization
--   person   a person, reached through the locations they work at
create table app_private.authz_actions (
  key text primary key,
  scope_class text not null check (scope_class in ('account', 'own', 'org', 'place', 'set', 'person')),
  effect text not null default 'write' check (effect in ('read', 'write', 'cross')),
  permission_key text references public.permissions (key),
  owner_only boolean not null default false,
  restricted_ok boolean not null default false,  -- open to somebody still finishing onboarding or missing a required document
  self_ok boolean not null default false,        -- their own row, whatever the state of their membership
  no_self boolean not null default false,        -- nobody decides their own
  rank_below boolean not null default false,     -- the target person ranks below the actor
  check (effect <> 'cross' or scope_class = 'person')
);
comment on table app_private.authz_actions is
  'Every action app_private.authorize() answers for. The keys are the ones supabase/tests/authorization_coverage.test.sql ties each entry point to.';

insert into app_private.authz_actions
  (key, scope_class, effect, permission_key, owner_only, restricted_ok, self_ok, no_self, rank_below) values
  -- account
  ('account.self', 'account', 'write', null, false, false, false, false, false),
  ('workspace.create', 'account', 'write', null, false, false, false, false, false),
  -- own
  ('workspace.read', 'own', 'read', null, false, false, false, false, false),
  ('employee_hub.read', 'own', 'read', null, false, false, false, false, false),
  ('employee_hub.self', 'own', 'write', null, false, false, false, false, false),
  ('availability.own', 'own', 'write', null, false, false, false, false, false),
  ('time_off.request_own', 'own', 'write', null, false, false, false, false, false),
  ('notifications.read_own', 'own', 'read', null, false, true, false, false, false),
  ('onboarding.self', 'own', 'write', null, false, true, false, false, false),
  ('documents.self', 'own', 'write', null, false, true, false, false, false),
  ('employee.request_preferred_name', 'own', 'write', null, false, false, false, false, false),
  ('announcement.read', 'own', 'read', null, false, false, false, false, false),
  ('announcement.acknowledge', 'own', 'write', null, false, false, false, false, false),
  ('workspace.accept_ownership', 'own', 'write', null, false, false, false, false, false),
  ('exchange.offer_own', 'own', 'write', null, false, false, false, false, false),
  ('exchange.apply_own', 'own', 'write', null, false, false, false, false, false),
  -- org
  ('workspace.setup', 'org', 'write', null, true, false, false, false, false),
  ('workspace.close', 'org', 'write', null, true, false, false, false, false),
  ('workspace.transfer_ownership', 'org', 'write', null, true, false, false, false, false),
  ('workspace.todos', 'org', 'write', 'workspace.manage', false, false, false, false, false),
  ('audit.read', 'org', 'read', 'workspace.manage', false, false, false, false, false),
  ('settings.organization.write', 'org', 'write', 'settings.general.manage', false, false, false, false, false),
  ('settings.locations.write', 'org', 'write', 'settings.locations.manage', false, false, false, false, false),
  ('settings.jobs.write', 'org', 'write', 'settings.jobs.manage', false, false, false, false, false),
  ('settings.roles.write', 'org', 'write', 'roles.manage', false, false, false, false, false),
  ('settings.scheduling.write', 'org', 'write', 'settings.schedule_rules.manage', false, false, false, false, false),
  ('settings.availability.write', 'org', 'write', 'settings.schedule_rules.manage', false, false, false, false, false),
  ('settings.availability.read', 'org', 'read', null, false, false, false, false, false),
  ('settings.catalog.read', 'org', 'read', null, false, false, false, false, false),
  ('settings.documents.write', 'org', 'write', 'documents.manage', false, false, false, false, false),
  ('settings.notifications.read', 'org', 'read', 'notifications.settings.read', false, false, false, false, false),
  ('settings.notifications.write', 'org', 'write', 'notifications.settings.write', false, false, false, false, false),
  ('settings.people', 'org', 'write', 'settings.general.manage', false, false, false, false, false),
  -- place: one location
  ('schedule.read', 'place', 'read', 'schedule.read', false, false, false, false, false),
  ('schedule.publish', 'place', 'write', 'schedule.publish', false, false, false, false, false),
  ('time_off.decide', 'place', 'write', 'schedule.time_off_requests.manage', false, false, false, true, true),
  ('exchange.approve', 'place', 'write', 'schedule.shift_change_requests.manage', false, false, false, true, true),
  ('exchange.read', 'place', 'read', 'schedule.shift_change_requests.read', false, false, false, false, false),
  -- set: some locations, or '{}' for the whole organization
  ('schedule.edit', 'set', 'write', 'schedule.manage', false, false, false, false, false),
  ('schedule.export', 'set', 'write', 'schedule.export', false, false, false, false, false),
  ('schedule.templates', 'set', 'write', 'schedule.templates.manage', false, false, false, false, false),
  ('requests.read', 'set', 'read', 'schedule.time_off_requests.read', false, false, false, false, false),
  ('employee.create', 'set', 'write', 'employees.manage', false, false, false, false, false),
  ('announcement.write', 'set', 'write', 'announcements.manage', false, false, false, false, false),
  ('important_date.write', 'set', 'write', 'important_dates.manage', false, false, false, false, false),
  -- person
  ('employee.read', 'person', 'read', 'employees.read', false, false, false, false, false),
  ('employee.list', 'person', 'read', 'employees.read', false, false, false, false, false),
  ('membership.read', 'person', 'read', null, false, false, true, false, false),
  ('documents.read', 'person', 'read', 'employee_documents.read', false, false, false, false, false),
  ('availability.team_read', 'person', 'read', 'availability.read', false, false, false, false, false),
  ('employee.save', 'person', 'write', 'employees.manage', false, false, false, false, true),
  ('employee.invite', 'person', 'write', 'employees.manage', false, false, false, false, true),
  ('employee.change_role', 'person', 'write', 'employees.manage', false, false, false, true, true),
  ('employee.make_admin', 'person', 'write', null, true, false, false, true, true),
  ('employee.decide_preferred_name', 'person', 'write', 'employees.manage', false, false, false, true, true),
  ('documents.review', 'person', 'write', 'employee_documents.review', false, false, false, true, true),
  ('onboarding.review', 'person', 'write', 'employee_onboarding.review', false, false, false, true, true),
  ('employee.terminate', 'person', 'cross', 'employees.archive', false, false, false, true, true),
  ('employee.archive', 'person', 'cross', 'employees.archive', false, false, false, true, true),
  ('employee.remove_access', 'person', 'cross', 'employees.manage', false, false, false, true, true);

revoke all on table app_private.authz_settings, app_private.authz_scope_rules, app_private.authz_actions
  from public, anon, authenticated;

-- 3. The core ---------------------------------------------------------------------------

create type app_private.actor_state as (
  user_id uuid,
  workspace_id uuid,
  membership_id uuid,
  status public.membership_status,
  class public.workspace_role,
  workspace_open boolean,
  document_blocked boolean,
  employee_id uuid,
  works uuid[],        -- where they work: their active location assignments
  manages uuid[],      -- where they manage: every location for owner and admin, where they work for a manager
  permissions text[]
);

create function app_private.authz_rank(access public.workspace_role)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case access when 'owner' then 4 when 'admin' then 3 when 'manager' then 2 when 'employee' then 1 else 0 end
$$;

-- Who the person is in the workspace. A person with no membership row comes
-- back with membership_id null; every array is empty, never null.
create function app_private.actor(actor uuid, w uuid)
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

  state.manages := case
    when state.class in ('owner', 'admin') then coalesce((
      select array_agg(location.id order by location.id)
      from public.locations location
      where location.workspace_id = w and location.deleted_at is null
    ), '{}')
    when state.class = 'manager' then state.works
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

-- The decision, given who the person is. Null means allowed; otherwise one of
-- the eight reason keys. The target person is named by their employee record
-- (target_person) or by their account (target_user: rows keyed by account,
-- such as memberships, whose employee record may be unlinked).
create function app_private.authz_check(
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
    -- Where the person works; somebody with no employee record works nowhere.
    places := coalesce((
      select array_agg(distinct assignment.location_id)
      from public.employee_location_assignments assignment
      where assignment.employee_id = person and assignment.ended_at is null
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

create function app_private.authz_reason(
  actor uuid,
  w uuid,
  action text,
  target_locations uuid[] default null,
  target_person uuid default null,
  target_user uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rule_row app_private.authz_actions;
begin
  select * into rule_row from app_private.authz_actions a where a.key = action;
  if not found then
    raise exception 'Unknown action %', action using errcode = '22023';
  end if;
  return app_private.authz_check(app_private.actor(actor, w), rule_row, target_locations, target_person, target_user);
end;
$$;

create function app_private.authorize(
  actor uuid,
  w uuid,
  action text,
  target_locations uuid[] default null,
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
  reason text := app_private.authz_reason(actor, w, action, target_locations, target_person, target_user);
begin
  if reason is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || reason, detail = action;
  end if;
end;
$$;

-- The locations of the workspace this action reaches for the person: what a
-- read model filters by. Empty when the person may not do it anywhere.
create function app_private.scope_set(actor uuid, w uuid, action text)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rule_row app_private.authz_actions;
  state app_private.actor_state;
begin
  select * into rule_row from app_private.authz_actions a where a.key = action;
  if not found then
    raise exception 'Unknown action %', action using errcode = '22023';
  end if;
  state := app_private.actor(actor, w);
  return coalesce((
    select array_agg(location.id order by location.id)
    from public.locations location
    where location.workspace_id = w
      and location.deleted_at is null
      and app_private.authz_check(state, rule_row, array[location.id], null, null) is null
  ), '{}');
end;
$$;

-- The signed-in browser user's answer, for row level security. The only
-- function that reads auth.uid().
create function app_private.rls_can(
  w uuid,
  action text,
  target_locations uuid[] default null,
  target_person uuid default null,
  target_user uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.authz_reason((select auth.uid()), w, action, target_locations, target_person, target_user) is null
$$;

-- 4. Older location helpers: a location in another workspace is not in reach --------
-- Owners and admins answered yes for any location id, their own workspace's or
-- not. A blank location still reads as "anywhere": 56 callers pass null for
-- "anywhere" and move to scope_set() with their domain in stage 6.

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
   or exists(select 1 from public.membership_location_scopes s where s.membership_id=m.id and s.workspace_id=target_workspace_id and s.location_id=target_location_id)));
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
    or exists(select 1 from public.membership_location_scopes scope where scope.membership_id=membership.id and scope.workspace_id=target_workspace_id and scope.location_id=target_location_id))
 );
$$;

-- 5. The first entry point on the core: handing over ownership ------------------------
-- A non-owner used to get the target check (23514) before the owner-only
-- refusal; the refusal now comes first and the owner check below it is gone.

CREATE OR REPLACE FUNCTION public.initiate_workspace_ownership_transfer_service(actor_user_id uuid, target_workspace_id uuid, target_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  return jsonb_build_object(
    'status', 'pending',
    'transfer_id', transfer_id,
    'workspace_id', target_workspace_id,
    'target_user_id', target_user_id
  );
end;
$function$;
