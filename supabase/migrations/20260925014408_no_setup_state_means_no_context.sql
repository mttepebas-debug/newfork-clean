-- BL-116, FOUNDATION-B 5.5: a missing setup state is not "setup complete".
--
-- Every workspace gets its workspace_onboarding row when it is created
-- (create_owner_workspace). The context resolver used to read a missing row as
-- complete, step 2, revision 1, so a workspace without one opened as fully set
-- up. Now it resolves no context for it: the API answers as for a workspace the
-- person is not a member of, and the shared context schema no longer fills the
-- gap either.

CREATE OR REPLACE FUNCTION public.resolve_workspace_context_service(actor_user_id uuid, target_workspace_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(user_id uuid, workspace_id uuid, workspace_name text, workspace_logo_storage_path text, workspace_logo_file_name text, workspace_logo_updated_at timestamp with time zone, schedule_logo_scale numeric, schedule_logo_offset_x numeric, schedule_logo_offset_y numeric, membership_id uuid, workspace_role workspace_role, membership_role_id uuid, membership_role_name text, permission_keys text[], all_locations boolean, onboarding_status onboarding_status, onboarding_current_step smallint, onboarding_revision integer, actions text[], location_ids uuid[], document_restricted boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    onboarding.status,
    onboarding.current_step,
    onboarding.revision,
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
  join public.workspace_onboarding onboarding
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
$function$;
