create table public.permissions (
  key text primary key,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  category text not null check (char_length(btrim(category)) between 1 and 80),
  description text not null check (char_length(btrim(description)) between 1 and 240),
  custom_grantable boolean not null default true,
  sort_order integer not null default 0
);

insert into public.permissions (key, label, category, description, custom_grantable, sort_order)
values
  ('workspace.read', 'View workspace', 'Workspace', 'Open the workspace and view organization information.', true, 10),
  ('workspace.manage', 'Manage workspace', 'Workspace', 'Change organization and scheduling settings.', false, 20),
  ('schedule.read', 'View schedules', 'Schedule', 'View schedules for accessible locations.', true, 30),
  ('schedule.manage', 'Manage schedules', 'Schedule', 'Create, edit, and publish schedules for accessible locations.', true, 40),
  ('roles.read', 'View roles', 'Roles', 'View the workspace role catalog and permission grants.', true, 50),
  ('roles.manage', 'Manage roles', 'Roles', 'Create, edit, and delete custom roles.', false, 60);

create table public.workspace_roles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 64),
  description text not null default '' check (char_length(description) <= 240),
  system_key public.workspace_role,
  access_class public.workspace_role not null,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  check (system_key is null or system_key = access_class),
  check (system_key is not null or access_class in ('manager', 'employee'))
);

create unique index workspace_roles_system_key_unique
  on public.workspace_roles (workspace_id, system_key)
  where system_key is not null;

create unique index workspace_roles_name_unique
  on public.workspace_roles (workspace_id, lower(btrim(name)));

create table public.workspace_role_permissions (
  workspace_id uuid not null,
  role_id uuid not null,
  permission_key text not null references public.permissions(key) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_key),
  foreign key (role_id, workspace_id)
    references public.workspace_roles(id, workspace_id) on delete cascade
);

create index workspace_role_permissions_workspace_idx
  on public.workspace_role_permissions (workspace_id, permission_key);

create function public.initialize_workspace_roles(target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_role_id uuid;
  admin_role_id uuid;
  manager_role_id uuid;
  employee_role_id uuid;
begin
  insert into public.workspace_roles (
    workspace_id, name, description, system_key, access_class, sort_order
  )
  values
    (target_workspace_id, 'Owner', 'Full workspace authority and ownership protection.', 'owner', 'owner', 0),
    (target_workspace_id, 'Admin', 'Workspace administration without ownership transfer.', 'admin', 'admin', 10),
    (target_workspace_id, 'Manager', 'Schedule operations for assigned locations.', 'manager', 'manager', 20),
    (target_workspace_id, 'Employee', 'Personal workspace and published schedule access.', 'employee', 'employee', 30)
  on conflict do nothing;

  select id into owner_role_id from public.workspace_roles
    where workspace_id = target_workspace_id and system_key = 'owner';
  select id into admin_role_id from public.workspace_roles
    where workspace_id = target_workspace_id and system_key = 'admin';
  select id into manager_role_id from public.workspace_roles
    where workspace_id = target_workspace_id and system_key = 'manager';
  select id into employee_role_id from public.workspace_roles
    where workspace_id = target_workspace_id and system_key = 'employee';

  insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
  select target_workspace_id, owner_role_id, key from public.permissions
  on conflict do nothing;

  insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
  select target_workspace_id, admin_role_id, key from public.permissions
  on conflict do nothing;

  insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
  values
    (target_workspace_id, manager_role_id, 'workspace.read'),
    (target_workspace_id, manager_role_id, 'schedule.read'),
    (target_workspace_id, manager_role_id, 'schedule.manage'),
    (target_workspace_id, employee_role_id, 'workspace.read'),
    (target_workspace_id, employee_role_id, 'schedule.read')
  on conflict do nothing;
end;
$$;

create function public.initialize_workspace_roles_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.initialize_workspace_roles(new.id);
  return new;
end;
$$;

create trigger initialize_workspace_roles_trigger
after insert on public.workspaces
for each row execute function public.initialize_workspace_roles_after_insert();

select public.initialize_workspace_roles(id) from public.workspaces;

alter table public.workspace_memberships add column role_id uuid;

update public.workspace_memberships membership
set role_id = role.id
from public.workspace_roles role
where role.workspace_id = membership.workspace_id
  and role.system_key = membership.role;

alter table public.workspace_memberships alter column role_id set not null;
alter table public.workspace_memberships
  add constraint workspace_memberships_role_fk
  foreign key (role_id, workspace_id)
  references public.workspace_roles(id, workspace_id) on delete restrict;

create index workspace_memberships_role_idx
  on public.workspace_memberships (workspace_id, role_id)
  where status = 'active';

create function public.sync_membership_role_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_role public.workspace_roles;
begin
  if new.role_id is null then
    select candidate.* into resolved_role
    from public.workspace_roles candidate
    where candidate.workspace_id = new.workspace_id
      and candidate.system_key = new.role;
  else
    select candidate.* into resolved_role
    from public.workspace_roles candidate
    where candidate.workspace_id = new.workspace_id
      and candidate.id = new.role_id;
  end if;

  if resolved_role.id is null then
    raise exception 'membership role must belong to the workspace' using errcode = '23503';
  end if;

  new.role_id := resolved_role.id;
  new.role := resolved_role.access_class;
  return new;
end;
$$;

create trigger a_sync_membership_role_reference_trigger
before insert or update of workspace_id, role, role_id on public.workspace_memberships
for each row execute function public.sync_membership_role_reference();

create function public.workspace_has_permission(
  target_workspace_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    join public.workspace_role_permissions grant_row
      on grant_row.workspace_id = membership.workspace_id
     and grant_row.role_id = membership.role_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and grant_row.permission_key = target_permission
  );
$$;

create or replace function public.can_manage_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.workspace_has_permission(target_workspace_id, 'workspace.manage');
$$;

alter table public.permissions enable row level security;
alter table public.workspace_roles enable row level security;
alter table public.workspace_role_permissions enable row level security;

create policy permissions_select_authenticated
on public.permissions for select to authenticated
using (true);

create policy workspace_roles_select_authorized
on public.workspace_roles for select to authenticated
using ((select public.workspace_has_permission(workspace_id, 'roles.read')));

create policy workspace_role_permissions_select_authorized
on public.workspace_role_permissions for select to authenticated
using ((select public.workspace_has_permission(workspace_id, 'roles.read')));

revoke all on public.permissions from anon, authenticated;
revoke all on public.workspace_roles from anon, authenticated;
revoke all on public.workspace_role_permissions from anon, authenticated;
grant select on public.permissions to authenticated;
grant select on public.workspace_roles to authenticated;
grant select on public.workspace_role_permissions to authenticated;

create function public.save_workspace_role(
  target_workspace_id uuid,
  target_role_id uuid,
  role_name text,
  role_description text,
  role_access_class public.workspace_role,
  permission_keys text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  saved_role_id uuid;
  normalized_permissions text[];
  unknown_count integer;
begin
  if actor_id is null
    or not public.workspace_has_permission(target_workspace_id, 'roles.manage') then
    raise exception 'role management access required' using errcode = '42501';
  end if;
  if char_length(btrim(role_name)) not between 1 and 64 then
    raise exception 'role name must be between 1 and 64 characters' using errcode = '22023';
  end if;
  if char_length(coalesce(role_description, '')) > 240 then
    raise exception 'role description must be 240 characters or fewer' using errcode = '22023';
  end if;
  if role_access_class not in ('manager', 'employee') then
    raise exception 'custom roles must use manager or employee access class' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct key order by key), '{}'::text[])
  into normalized_permissions
  from unnest(coalesce(permission_keys, '{}'::text[])) key;

  select count(*) into unknown_count
  from unnest(normalized_permissions) requested(key)
  left join public.permissions permission on permission.key = requested.key
  where permission.key is null or not permission.custom_grantable;

  if unknown_count > 0 then
    raise exception 'permission set contains unknown or protected permissions' using errcode = '22023';
  end if;
  if not ('workspace.read' = any(normalized_permissions)) then
    raise exception 'custom roles require workspace.read' using errcode = '22023';
  end if;
  if 'schedule.manage' = any(normalized_permissions)
    and not ('schedule.read' = any(normalized_permissions)) then
    raise exception 'schedule.manage requires schedule.read' using errcode = '22023';
  end if;

  if target_role_id is null then
    insert into public.workspace_roles (
      workspace_id, name, description, access_class, sort_order, created_by
    )
    values (
      target_workspace_id,
      btrim(role_name),
      btrim(coalesce(role_description, '')),
      role_access_class,
      100,
      actor_id
    )
    returning id into saved_role_id;
  else
    update public.workspace_roles
    set name = btrim(role_name),
        description = btrim(coalesce(role_description, '')),
        access_class = role_access_class,
        updated_at = now()
    where id = target_role_id
      and workspace_id = target_workspace_id
      and system_key is null
    returning id into saved_role_id;

    if saved_role_id is null then
      raise exception 'custom role not found' using errcode = 'P0002';
    end if;

    update public.workspace_memberships
    set role = role_access_class,
        updated_at = now()
    where workspace_id = target_workspace_id
      and role_id = saved_role_id;
  end if;

  delete from public.workspace_role_permissions where role_id = saved_role_id;
  insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
  select target_workspace_id, saved_role_id, key
  from unnest(normalized_permissions) key;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id,
    actor_id,
    case when target_role_id is null then 'role.created' else 'role.updated' end,
    'workspace_role',
    saved_role_id::text,
    jsonb_build_object('name', btrim(role_name), 'permissions', normalized_permissions)
  );

  return saved_role_id;
end;
$$;

create function public.delete_workspace_role(
  target_workspace_id uuid,
  target_role_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_name text;
begin
  if actor_id is null
    or not public.workspace_has_permission(target_workspace_id, 'roles.manage') then
    raise exception 'role management access required' using errcode = '42501';
  end if;

  select name into target_name
  from public.workspace_roles
  where id = target_role_id
    and workspace_id = target_workspace_id
    and system_key is null;

  if target_name is null then
    raise exception 'custom role not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.workspace_memberships
    where workspace_id = target_workspace_id and role_id = target_role_id
  ) then
    raise exception 'role is assigned to members' using errcode = '23503';
  end if;

  delete from public.workspace_roles where id = target_role_id;
  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id,
    actor_id,
    'role.deleted',
    'workspace_role',
    target_role_id::text,
    jsonb_build_object('name', target_name)
  );
end;
$$;

drop function public.resolve_active_workspace();
create function public.resolve_active_workspace()
returns table (
  user_id uuid,
  workspace_id uuid,
  workspace_name text,
  membership_id uuid,
  workspace_role public.workspace_role,
  membership_role_id uuid,
  membership_role_name text,
  permission_keys text[],
  all_locations boolean,
  onboarding_status public.onboarding_status,
  onboarding_current_step smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    membership.user_id,
    workspace.id,
    workspace.name,
    membership.id,
    membership.role,
    role.id,
    role.name,
    coalesce(
      array_agg(grant_row.permission_key order by permission.sort_order)
        filter (where grant_row.permission_key is not null),
      '{}'::text[]
    ),
    membership.all_locations,
    coalesce(onboarding.status, 'complete'::public.onboarding_status),
    coalesce(onboarding.current_step, 2::smallint)
  from public.workspace_memberships membership
  join public.workspaces workspace on workspace.id = membership.workspace_id
  join public.workspace_roles role on role.id = membership.role_id
  left join public.workspace_role_permissions grant_row on grant_row.role_id = role.id
  left join public.permissions permission on permission.key = grant_row.permission_key
  left join public.user_workspace_preferences preference on preference.user_id = membership.user_id
  left join public.workspace_onboarding onboarding on onboarding.workspace_id = workspace.id
  where membership.user_id = (select auth.uid())
    and membership.status = 'active'
  group by membership.id, workspace.id, role.id, preference.active_workspace_id,
    onboarding.status, onboarding.current_step
  order by (workspace.id = preference.active_workspace_id) desc, membership.created_at asc
  limit 1;
$$;

revoke all on function public.initialize_workspace_roles(uuid) from public, anon, authenticated;
revoke all on function public.workspace_has_permission(uuid, text) from public, anon;
revoke all on function public.save_workspace_role(uuid, uuid, text, text, public.workspace_role, text[]) from public, anon;
revoke all on function public.delete_workspace_role(uuid, uuid) from public, anon;
revoke all on function public.resolve_active_workspace() from public, anon;
grant execute on function public.workspace_has_permission(uuid, text) to authenticated;
grant execute on function public.save_workspace_role(uuid, uuid, text, text, public.workspace_role, text[]) to authenticated;
grant execute on function public.delete_workspace_role(uuid, uuid) to authenticated;
grant execute on function public.resolve_active_workspace() to authenticated;
