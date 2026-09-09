create or replace function app_private.workspace_allows_interactive_access(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspaces workspace
    left join public.workspace_onboarding onboarding
      on onboarding.workspace_id = workspace.id
    where workspace.id = target_workspace_id
      and (
        coalesce(onboarding.status, 'complete'::public.onboarding_status) = 'complete'::public.onboarding_status
        or current_setting('app.allow_incomplete_workspace_context', true) = 'on'
      )
      and (
        workspace.lifecycle_status = 'active'
        or (
          workspace.lifecycle_status = 'closure_scheduled'
          and workspace.closure_effective_at > now()
        )
      )
  );
$$;

create or replace function public.resolve_workspace_context_service(
  actor_user_id uuid,
  target_workspace_id uuid default null
)
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
  onboarding_current_step smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  if target_workspace_id is null then
    perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
    return query select * from public.resolve_active_workspace();
    return;
  end if;

  perform set_config('app.allow_incomplete_workspace_context', 'on', true);

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
    coalesce(onboarding.current_step, 2::smallint)
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
    and membership.workspace_id = target_workspace_id
    and membership.status = 'active'
    and app_private.workspace_allows_interactive_access(workspace.id)
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
    onboarding.current_step
  limit 1;
end;
$$;

create or replace function public.list_schedule_export_cron_candidates_service(
  target_now timestamptz default now()
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'schedules',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'workspace_id', s.workspace_id,
          'workspace_name', w.name,
          'created_by', s.created_by,
          'preset_id', s.preset_id,
          'preset_name', p.name,
          'settings', p.settings,
          'name', s.name,
          'recipients', s.recipients,
          'location_ids', to_jsonb(s.location_ids),
          'day_of_week', s.day_of_week,
          'send_hour', s.send_hour,
          'timezone', s.timezone,
          'last_sent_at', s.last_sent_at,
          'consecutive_failures', s.consecutive_failures
        )
        order by s.workspace_id, s.send_hour, s.id
      ),
      '[]'::jsonb
    )
  )
  from public.scheduled_schedule_exports s
  join public.schedule_export_presets p
    on p.id = s.preset_id
   and p.workspace_id = s.workspace_id
  join public.workspaces w
    on w.id = s.workspace_id
  where s.enabled
    and s.auto_disabled_at is null
    and cardinality(s.location_ids) > 0
    and app_private.workspace_allows_interactive_access(s.workspace_id)
    and (
      s.last_sent_at is null
      or s.last_sent_at <= target_now - interval '20 hours'
    );
$$;

revoke all on function app_private.workspace_allows_interactive_access(uuid)
from public, anon, authenticated;
grant execute on function app_private.workspace_allows_interactive_access(uuid)
to authenticated, service_role;

revoke all on function public.resolve_workspace_context_service(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.resolve_workspace_context_service(uuid, uuid)
to service_role;

revoke all on function public.list_schedule_export_cron_candidates_service(timestamptz)
from public, anon, authenticated;
grant execute on function public.list_schedule_export_cron_candidates_service(timestamptz)
to service_role;
