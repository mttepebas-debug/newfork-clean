create type public.onboarding_status as enum ('incomplete', 'complete');
create type public.theme_preference as enum ('system', 'light', 'dark');

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme public.theme_preference not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_onboarding (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  status public.onboarding_status not null default 'incomplete',
  current_step smallint not null default 1 check (current_step between 1 and 2),
  completed_at timestamptz,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  check (
    (status = 'complete' and completed_at is not null)
    or (status = 'incomplete' and completed_at is null)
  )
);

alter table public.user_profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.workspace_onboarding enable row level security;

create policy profiles_manage_own
on public.user_profiles for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy user_preferences_manage_own
on public.user_preferences for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy workspace_onboarding_select_member
on public.workspace_onboarding for select to authenticated
using ((select public.is_workspace_member(workspace_id)));

create policy workspace_onboarding_update_owner
on public.workspace_onboarding for update to authenticated
using ((select public.workspace_role_for(workspace_id)) = 'owner')
with check ((select public.workspace_role_for(workspace_id)) = 'owner');

revoke all on public.user_profiles from anon;
revoke all on public.user_preferences from anon;
revoke all on public.workspace_onboarding from anon;
grant select, insert, update on public.user_profiles to authenticated;
grant select, insert, update on public.user_preferences to authenticated;
grant select, update on public.workspace_onboarding to authenticated;

create function public.create_owner_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  created_workspace_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if char_length(btrim(workspace_name)) not between 1 and 120 then
    raise exception 'workspace name must be between 1 and 120 characters' using errcode = '22023';
  end if;

  insert into public.workspaces (name, created_by)
  values (btrim(workspace_name), actor_id)
  returning id into created_workspace_id;

  insert into public.workspace_memberships (workspace_id, user_id, role)
  values (created_workspace_id, actor_id, 'owner');

  insert into public.workspace_onboarding (workspace_id, updated_by)
  values (created_workspace_id, actor_id);

  insert into public.user_workspace_preferences (user_id, active_workspace_id)
  values (actor_id, created_workspace_id)
  on conflict (user_id) do update
    set active_workspace_id = excluded.active_workspace_id, updated_at = now();

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id
  ) values (
    created_workspace_id, actor_id, 'workspace.created', 'workspace', created_workspace_id::text
  );

  return created_workspace_id;
end;
$$;

create function public.set_active_workspace(target_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'active workspace is not available' using errcode = '42501';
  end if;

  insert into public.user_workspace_preferences (user_id, active_workspace_id)
  values (actor_id, target_workspace_id)
  on conflict (user_id) do update
    set active_workspace_id = excluded.active_workspace_id, updated_at = now();
end;
$$;

create function public.update_owner_onboarding(
  target_workspace_id uuid,
  workspace_name text,
  next_step smallint,
  mark_complete boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null or public.workspace_role_for(target_workspace_id) <> 'owner' then
    raise exception 'owner access required' using errcode = '42501';
  end if;
  if char_length(btrim(workspace_name)) not between 1 and 120 then
    raise exception 'workspace name must be between 1 and 120 characters' using errcode = '22023';
  end if;
  if next_step not between 1 and 2 then
    raise exception 'invalid onboarding step' using errcode = '22023';
  end if;

  update public.workspaces
  set name = btrim(workspace_name), updated_at = now()
  where id = target_workspace_id;

  update public.workspace_onboarding
  set
    status = case
      when mark_complete then 'complete'::public.onboarding_status
      else 'incomplete'::public.onboarding_status
    end,
    current_step = next_step,
    completed_at = case when mark_complete then now() else null end,
    updated_by = actor_id,
    updated_at = now()
  where workspace_id = target_workspace_id;

  if not found then
    raise exception 'workspace onboarding was not found' using errcode = 'P0002';
  end if;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id,
    actor_id,
    case when mark_complete then 'workspace.onboarding_completed' else 'workspace.onboarding_saved' end,
    'workspace',
    target_workspace_id::text,
    jsonb_build_object('step', next_step)
  );
end;
$$;

create function public.list_my_workspaces()
returns table (
  workspace_id uuid,
  workspace_name text,
  workspace_role public.workspace_role,
  is_active boolean,
  onboarding_status public.onboarding_status,
  onboarding_current_step smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    workspace.id,
    workspace.name,
    membership.role,
    workspace.id = preference.active_workspace_id,
    coalesce(onboarding.status, 'complete'::public.onboarding_status),
    coalesce(onboarding.current_step, 2::smallint)
  from public.workspace_memberships membership
  join public.workspaces workspace on workspace.id = membership.workspace_id
  left join public.user_workspace_preferences preference on preference.user_id = membership.user_id
  left join public.workspace_onboarding onboarding on onboarding.workspace_id = workspace.id
  where membership.user_id = (select auth.uid())
    and membership.status = 'active'
  order by (workspace.id = preference.active_workspace_id) desc, workspace.name asc;
$$;

drop function public.resolve_active_workspace();
create function public.resolve_active_workspace()
returns table (
  user_id uuid,
  workspace_id uuid,
  workspace_name text,
  membership_id uuid,
  workspace_role public.workspace_role,
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
    membership.all_locations,
    coalesce(onboarding.status, 'complete'::public.onboarding_status),
    coalesce(onboarding.current_step, 2::smallint)
  from public.workspace_memberships membership
  join public.workspaces workspace on workspace.id = membership.workspace_id
  left join public.user_workspace_preferences preference on preference.user_id = membership.user_id
  left join public.workspace_onboarding onboarding on onboarding.workspace_id = workspace.id
  where membership.user_id = (select auth.uid())
    and membership.status = 'active'
  order by (workspace.id = preference.active_workspace_id) desc, membership.created_at asc
  limit 1;
$$;

revoke all on function public.create_owner_workspace(text) from public, anon;
revoke all on function public.set_active_workspace(uuid) from public, anon;
revoke all on function public.update_owner_onboarding(uuid, text, smallint, boolean) from public, anon;
revoke all on function public.list_my_workspaces() from public, anon;
revoke all on function public.resolve_active_workspace() from public, anon;
grant execute on function public.create_owner_workspace(text) to authenticated;
grant execute on function public.set_active_workspace(uuid) to authenticated;
grant execute on function public.update_owner_onboarding(uuid, text, smallint, boolean) to authenticated;
grant execute on function public.list_my_workspaces() to authenticated;
grant execute on function public.resolve_active_workspace() to authenticated;
