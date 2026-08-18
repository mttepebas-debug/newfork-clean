create extension if not exists pgcrypto with schema extensions;

create type public.workspace_role as enum ('owner', 'admin', 'manager', 'employee');
create type public.membership_status as enum ('active', 'invited', 'suspended');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null,
  status public.membership_status not null default 'active',
  all_locations boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id),
  unique (id, workspace_id)
);

create index workspace_memberships_user_active_idx
  on public.workspace_memberships (user_id, workspace_id)
  where status = 'active';

-- Location rows belong to Phase 3. This table stores opaque future location IDs
-- without defining the location domain early.
create table public.membership_location_scopes (
  membership_id uuid not null,
  workspace_id uuid not null,
  location_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (membership_id, location_id),
  foreign key (membership_id, workspace_id)
    references public.workspace_memberships(id, workspace_id) on delete cascade
);

create index membership_location_scopes_workspace_idx
  on public.membership_location_scopes (workspace_id, location_id);

create table public.user_workspace_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  action text not null check (char_length(btrim(action)) between 1 and 120),
  target_type text not null check (char_length(btrim(target_type)) between 1 and 80),
  target_id text not null check (char_length(btrim(target_id)) between 1 and 160),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index audit_events_workspace_time_idx
  on public.audit_events (workspace_id, occurred_at desc);

create function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

create function public.workspace_role_for(target_workspace_id uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select membership.role
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = (select auth.uid())
    and membership.status = 'active'
  limit 1;
$$;

create function public.can_manage_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.workspace_role_for(target_workspace_id) in ('owner', 'admin'),
    false
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.workspace_role_for(uuid) from public, anon;
revoke all on function public.can_manage_workspace(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.workspace_role_for(uuid) to authenticated;
grant execute on function public.can_manage_workspace(uuid) to authenticated;

create function public.enforce_membership_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.workspace_role;
  bootstrap_allowed boolean;
begin
  if actor_id is null then return new; end if;

  if tg_op = 'INSERT' then
    select exists (
      select 1
      from public.workspaces workspace
      where workspace.id = new.workspace_id
        and workspace.created_by = actor_id
        and new.user_id = actor_id
        and new.role = 'owner'
        and not exists (
          select 1 from public.workspace_memberships existing
          where existing.workspace_id = new.workspace_id
        )
    ) into bootstrap_allowed;
    if bootstrap_allowed then return new; end if;
  end if;

  actor_role := public.workspace_role_for(new.workspace_id);
  if actor_role = 'owner' then return new; end if;
  if actor_role = 'admin' and new.role in ('manager', 'employee') then
    if tg_op = 'INSERT' or old.role in ('manager', 'employee') then return new; end if;
  end if;

  raise exception 'membership role change is not permitted' using errcode = '42501';
end;
$$;

create function public.prevent_last_workspace_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'owner' or old.status <> 'active' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.role = 'owner' and new.status = 'active' then return new; end if;

  if not exists (
    select 1
    from public.workspace_memberships other
    where other.workspace_id = old.workspace_id
      and other.id <> old.id
      and other.role = 'owner'
      and other.status = 'active'
  ) then
    raise exception 'workspace must retain an active owner' using errcode = '23514';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger enforce_membership_role_change_trigger
before insert or update on public.workspace_memberships
for each row execute function public.enforce_membership_role_change();

create trigger prevent_last_workspace_owner_removal_trigger
before update or delete on public.workspace_memberships
for each row execute function public.prevent_last_workspace_owner_removal();

alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.membership_location_scopes enable row level security;
alter table public.user_workspace_preferences enable row level security;
alter table public.audit_events enable row level security;

create policy workspaces_select_member
on public.workspaces for select to authenticated
using ((select public.is_workspace_member(id)));

create policy workspaces_insert_creator
on public.workspaces for insert to authenticated
with check (created_by = (select auth.uid()));

create policy workspaces_update_manager
on public.workspaces for update to authenticated
using ((select public.can_manage_workspace(id)))
with check ((select public.can_manage_workspace(id)));

create policy memberships_select_workspace
on public.workspace_memberships for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_workspace_member(workspace_id)));

create policy memberships_insert_bootstrap_or_manager
on public.workspace_memberships for insert to authenticated
with check (
  (
    user_id = (select auth.uid())
    and role = 'owner'
    and exists (
      select 1 from public.workspaces workspace
      where workspace.id = workspace_id
        and workspace.created_by = (select auth.uid())
    )
    and not exists (
      select 1 from public.workspace_memberships existing
      where existing.workspace_id = workspace_id
    )
  )
  or (select public.can_manage_workspace(workspace_id))
);

create policy memberships_update_manager
on public.workspace_memberships for update to authenticated
using ((select public.can_manage_workspace(workspace_id)))
with check ((select public.can_manage_workspace(workspace_id)));

create policy memberships_delete_manager
on public.workspace_memberships for delete to authenticated
using ((select public.can_manage_workspace(workspace_id)));

create policy location_scopes_select_member
on public.membership_location_scopes for select to authenticated
using (
  (select public.is_workspace_member(workspace_id))
  and (
    membership_id in (
      select membership.id from public.workspace_memberships membership
      where membership.user_id = (select auth.uid())
    )
    or (select public.can_manage_workspace(workspace_id))
  )
);

create policy location_scopes_manage_admin
on public.membership_location_scopes for all to authenticated
using ((select public.can_manage_workspace(workspace_id)))
with check ((select public.can_manage_workspace(workspace_id)));

create policy preferences_select_own
on public.user_workspace_preferences for select to authenticated
using (user_id = (select auth.uid()));

create policy preferences_insert_own_membership
on public.user_workspace_preferences for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select public.is_workspace_member(active_workspace_id))
);

create policy preferences_update_own_membership
on public.user_workspace_preferences for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (select public.is_workspace_member(active_workspace_id))
);

create policy audit_select_admin
on public.audit_events for select to authenticated
using ((select public.workspace_role_for(workspace_id)) in ('owner', 'admin'));

create policy audit_insert_member
on public.audit_events for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and (select public.is_workspace_member(workspace_id))
);

revoke all on public.workspaces from anon;
revoke all on public.workspace_memberships from anon;
revoke all on public.membership_location_scopes from anon;
revoke all on public.user_workspace_preferences from anon;
revoke all on public.audit_events from anon;
grant select, insert, update on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_memberships to authenticated;
grant select, insert, update, delete on public.membership_location_scopes to authenticated;
grant select, insert, update on public.user_workspace_preferences to authenticated;
grant select, insert on public.audit_events to authenticated;

create function public.resolve_active_workspace()
returns table (
  user_id uuid,
  workspace_id uuid,
  workspace_name text,
  membership_id uuid,
  workspace_role public.workspace_role,
  all_locations boolean
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
    membership.all_locations
  from public.workspace_memberships membership
  join public.workspaces workspace on workspace.id = membership.workspace_id
  left join public.user_workspace_preferences preference
    on preference.user_id = membership.user_id
  where membership.user_id = (select auth.uid())
    and membership.status = 'active'
  order by (workspace.id = preference.active_workspace_id) desc, membership.created_at asc
  limit 1;
$$;

revoke all on function public.resolve_active_workspace() from public, anon;
grant execute on function public.resolve_active_workspace() to authenticated;
