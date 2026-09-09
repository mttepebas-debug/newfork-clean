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

    insert into public.user_workspace_preferences (user_id, active_workspace_id)
    values (actor_id, existing_workspace_id)
    on conflict (user_id) do update
      set active_workspace_id = excluded.active_workspace_id, updated_at = now();

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
