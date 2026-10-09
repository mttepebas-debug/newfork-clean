-- FOUNDATION-B stage 4c: one call tells the API who is asking.
--
-- The API learned who was asking in three or four round trips: the workspace
-- context (through a JWT bridge and a browser-era function when no workspace
-- was named), the member's location rows, and document access. One service
-- call now answers all of it, and adds the actions the person may take
-- somewhere in the workspace, from the authorization core. The API gates on
-- that list; the database still decides every individual target.

-- The actions a person may take somewhere in the workspace. An action is on the
-- list when some target exists that the core would allow: the whole
-- organization, one of the locations they manage, or any location of the
-- workspace (for a reach that is not limited to their own).
-- ponytail: up to three core checks per action; a single reach lookup per
-- action if this ever shows in the request time.
create function app_private.actor_actions(state app_private.actor_state)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  some_location uuid;
begin
  select location.id into some_location
  from public.locations location
  where location.workspace_id = state.workspace_id and location.deleted_at is null
  order by location.id
  limit 1;

  return coalesce((
    select array_agg(action.key order by action.key)
    from app_private.authz_actions action
    where case
      when action.scope_class in ('account', 'own', 'org') then
        app_private.authz_check(state, action, null, null, null) is null
      else
        app_private.authz_check(state, action, '{}'::uuid[], null, null) is null
        or (cardinality(state.manages) > 0
            and app_private.authz_check(state, action, state.manages[1:1], null, null) is null)
        or (some_location is not null
            and app_private.authz_check(state, action, array[some_location], null, null) is null)
    end
  ), '{}');
end;
$$;

drop function public.resolve_workspace_context_service(uuid, uuid);
drop function public.resolve_active_workspace_service(uuid);
drop function public.resolve_active_workspace();

-- Who is asking, in the workspace they named or, when they named none, the one
-- they last chose (their only one if they have just one). The named workspace
-- must be open to them; a draft counts, so an owner can finish setting it up.
create function public.resolve_workspace_context_service(actor_user_id uuid, target_workspace_id uuid default null)
returns table (
  user_id uuid,
  workspace_id uuid,
  workspace_name text,
  workspace_logo_storage_path text,
  workspace_logo_file_name text,
  workspace_logo_updated_at timestamptz,
  schedule_logo_scale numeric,
  schedule_logo_offset_x numeric,
  schedule_logo_offset_y numeric,
  membership_id uuid,
  workspace_role public.workspace_role,
  membership_role_id uuid,
  membership_role_name text,
  permission_keys text[],
  all_locations boolean,
  onboarding_status public.onboarding_status,
  onboarding_current_step smallint,
  onboarding_revision integer,
  actions text[],
  location_ids uuid[],
  document_restricted boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  chosen uuid := target_workspace_id;
  state app_private.actor_state;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  if chosen is null then
    select membership.workspace_id into chosen
    from public.workspace_memberships membership
    left join public.user_workspace_preferences preference on preference.user_id = membership.user_id
    where membership.user_id = actor_user_id
      and membership.status = 'active'
      and (
        membership.workspace_id = preference.active_workspace_id
        or (
          select count(*) from public.workspace_memberships other
          where other.user_id = actor_user_id and other.status = 'active'
        ) = 1
      )
    order by (membership.workspace_id = preference.active_workspace_id) desc nulls last, membership.created_at
    limit 1;
    if chosen is null then
      return;
    end if;
  else
    perform set_config('app.allow_incomplete_workspace_context', 'on', true);
  end if;

  state := app_private.actor(actor_user_id, chosen);

  return query
  select
    membership.user_id,
    workspace.id,
    workspace.name,
    workspace.logo_storage_path,
    workspace.logo_file_name,
    workspace.logo_updated_at,
    workspace.schedule_logo_scale,
    workspace.schedule_logo_offset_x,
    workspace.schedule_logo_offset_y,
    membership.id,
    role.access_class,
    membership.role_id,
    role.name,
    coalesce(
      array_agg(grant_row.permission_key order by permission.sort_order)
        filter (where grant_row.permission_key is not null),
      '{}'::text[]
    ),
    membership.all_locations,
    coalesce(onboarding.status, 'complete'::public.onboarding_status),
    coalesce(onboarding.current_step, 2::smallint),
    coalesce(onboarding.revision, 1),
    app_private.actor_actions(state),
    case when membership.all_locations then '{}'::uuid[] else state.works end,
    state.document_blocked
  from public.workspace_memberships membership
  join public.workspaces workspace
    on workspace.id = membership.workspace_id
  join public.workspace_roles role
    on role.id = membership.role_id
   and role.workspace_id = membership.workspace_id
  left join public.workspace_role_permissions grant_row
    on grant_row.role_id = role.id
  left join public.permissions permission
    on permission.key = grant_row.permission_key
  left join public.workspace_onboarding onboarding
    on onboarding.workspace_id = workspace.id
  where membership.user_id = actor_user_id
    and membership.workspace_id = chosen
    and membership.status = 'active'
    -- ponytail: the workspace they last chose is not checked for being open,
    -- as before; its actions are empty when it is closed (the core refuses).
    and (target_workspace_id is null or app_private.workspace_allows_interactive_access(workspace.id))
  group by
    membership.user_id,
    workspace.id,
    workspace.name,
    workspace.logo_storage_path,
    workspace.logo_file_name,
    workspace.logo_updated_at,
    workspace.schedule_logo_scale,
    workspace.schedule_logo_offset_x,
    workspace.schedule_logo_offset_y,
    membership.id,
    role.access_class,
    membership.role_id,
    role.name,
    membership.all_locations,
    onboarding.status,
    onboarding.current_step,
    onboarding.revision;
end;
$$;

revoke all on function public.resolve_workspace_context_service(uuid, uuid) from public, anon, authenticated;
grant execute on function public.resolve_workspace_context_service(uuid, uuid) to service_role;
