-- ROL-CIFT 1.5: the workspace context names the membership's two access slots, so the API and the
-- web read access (employee, management) instead of one role. The rest of the row is as before: the
-- role a screen shows (the management slot's, else the employee slot's), its permissions, the location
-- scope.
--
-- Riskli canlı migration (a service's return shape changes: drop and create): goes live with the rest
-- of slice 1.

drop function public.resolve_workspace_context_service(uuid, uuid);

CREATE FUNCTION "public"."resolve_workspace_context_service"("actor_user_id" "uuid", "target_workspace_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("user_id" "uuid", "workspace_id" "uuid", "workspace_name" "text", "workspace_logo_storage_path" "text", "workspace_logo_file_name" "text", "workspace_logo_updated_at" timestamp with time zone, "schedule_logo_scale" numeric, "schedule_logo_offset_x" numeric, "schedule_logo_offset_y" numeric, "membership_id" "uuid", "management_access" "public"."workspace_role", "employee_access" boolean, "membership_role_id" "uuid", "membership_role_name" "text", "permission_keys" "text"[], "all_locations" boolean, "onboarding_status" "public"."onboarding_status", "onboarding_current_step" smallint, "onboarding_revision" integer, "actions" "text"[], "location_ids" "uuid"[], "document_restricted" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    -- The two slots (ROL-CIFT 1.5): the management slot's class, or none; whether the employee slot is held.
    (select management.access_class from public.workspace_roles management where management.id = membership.role_id),
    membership.employee_role_id is not null,
    role.id,
    role.name,
    coalesce(
      array_agg(grant_row.permission_key order by permission.sort_order)
        filter (where grant_row.permission_key is not null),
      '{}'::text[]
    ),
    role.access_class in ('owner', 'admin'),
    onboarding.status,
    onboarding.current_step,
    onboarding.revision,
    app_private.actor_actions(state),
    case when role.access_class in ('owner', 'admin') then '{}'::uuid[]
         when role.access_class = 'manager' then state.manages else state.works end,
    state.document_blocked
  from public.workspace_memberships membership
  join public.workspaces workspace
    on workspace.id = membership.workspace_id
  -- The role a screen shows: the management slot's, else the employee slot's (ROL-CIFT 1.4; the
  -- membership's two slots reach the API in 1.5).
  join public.workspace_roles role
    on role.id = coalesce(membership.role_id, membership.employee_role_id)
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
    membership.role_id,
    membership.employee_role_id,
    role.access_class,
    role.id,
    role.name,
    onboarding.status,
    onboarding.current_step,
    onboarding.revision;
end;
$$;

revoke all on function public.resolve_workspace_context_service(uuid, uuid) from public, anon, authenticated;
grant execute on function public.resolve_workspace_context_service(uuid, uuid) to service_role;
