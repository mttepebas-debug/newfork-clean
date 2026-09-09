create or replace function public.enforce_active_workspace_preference_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.workspace_memberships membership
    join public.workspaces workspace
      on workspace.id = membership.workspace_id
    left join public.workspace_onboarding onboarding
      on onboarding.workspace_id = workspace.id
    where membership.user_id = new.user_id
      and membership.workspace_id = new.active_workspace_id
      and membership.status = 'active'::public.membership_status
      and workspace.lifecycle_status = 'active'::public.workspace_lifecycle_status
      and coalesce(onboarding.status, 'complete'::public.onboarding_status) = 'complete'::public.onboarding_status
  ) then
    raise exception 'active workspace preference requires active completed membership'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_active_workspace_preference_membership_trigger
on public.user_workspace_preferences;

create trigger enforce_active_workspace_preference_membership_trigger
before insert or update of user_id, active_workspace_id
on public.user_workspace_preferences
for each row
execute function public.enforce_active_workspace_preference_membership();

revoke all on function public.enforce_active_workspace_preference_membership()
from public, anon, authenticated;

create or replace function public.create_owner_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  existing_workspace_id uuid;
  created_workspace_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if char_length(btrim(workspace_name)) not between 1 and 120 then
    raise exception 'workspace name must be between 1 and 120 characters' using errcode = '22023';
  end if;

  select workspace.id
  into existing_workspace_id
  from public.workspaces workspace
  join public.workspace_memberships membership
    on membership.workspace_id = workspace.id
   and membership.user_id = actor_id
   and membership.role = 'owner'::public.workspace_role
   and membership.status = 'active'::public.membership_status
  join public.workspace_onboarding onboarding
    on onboarding.workspace_id = workspace.id
   and onboarding.status = 'incomplete'::public.onboarding_status
  order by workspace.created_at desc
  limit 1;

  if existing_workspace_id is not null then
    update public.workspaces
    set name = btrim(workspace_name), updated_at = now()
    where id = existing_workspace_id;

    insert into public.audit_events (
      workspace_id, actor_user_id, action, target_type, target_id
    ) values (
      existing_workspace_id, actor_id, 'workspace.draft_resumed', 'workspace', existing_workspace_id::text
    );

    return existing_workspace_id;
  end if;

  insert into public.workspaces (name, created_by)
  values (btrim(workspace_name), actor_id)
  returning id into created_workspace_id;

  insert into public.workspace_memberships (workspace_id, user_id, role)
  values (created_workspace_id, actor_id, 'owner');

  insert into public.workspace_onboarding (workspace_id, updated_by)
  values (created_workspace_id, actor_id);

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id
  ) values (
    created_workspace_id, actor_id, 'workspace.created', 'workspace', created_workspace_id::text
  );

  return created_workspace_id;
end;
$$;

revoke all on function public.create_owner_workspace(text)
from public, anon;
grant execute on function public.create_owner_workspace(text)
to authenticated;
