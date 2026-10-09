create or replace function public.resolve_notification_in_app_policy_v1_service(
  target_workspace_id uuid,
  target_user_id uuid,
  target_type_key text,
  target_category text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  catalog public.notification_catalog%rowtype;
  global_policy public.notification_org_policies%rowtype;
  type_preference public.notification_user_preferences%rowtype;
  category_preference public.notification_user_preferences%rowtype;
  preference_value text;
  eligible boolean;
begin
  select * into catalog
  from public.notification_catalog entry
  where entry.type_key = target_type_key
    and entry.schema_version = 1
    and entry.lifecycle = 'active';
  if catalog.type_key is null then
    raise exception 'notification catalog type is not active' using errcode = '23514';
  end if;

  select * into global_policy
  from public.notification_org_policies policy
  where policy.workspace_id = target_workspace_id
    and policy.type_key = target_type_key
    and policy.role_id is null
    and policy.location_id is null;
  select * into type_preference
  from public.notification_user_preferences preference
  where preference.workspace_id = target_workspace_id
    and preference.user_id = target_user_id
    and preference.preference_scope = 'type'
    and preference.scope_key = target_type_key;
  select * into category_preference
  from public.notification_user_preferences preference
  where preference.workspace_id = target_workspace_id
    and preference.user_id = target_user_id
    and preference.preference_scope = 'category'
    and preference.scope_key = target_category;

  preference_value := coalesce(
    type_preference.channel_preferences->>'in_app',
    category_preference.channel_preferences->>'in_app',
    'enabled'
  );
  eligible := 'in_app' = any(catalog.supported_channels)
    and coalesce(global_policy.enabled, true)
    and (global_policy.allowed_channels is null or 'in_app' = any(global_policy.allowed_channels))
    and (catalog.mandatory_in_app or preference_value <> 'disabled');

  return jsonb_build_object(
    'catalog', jsonb_build_object('type_key', catalog.type_key, 'schema_version', catalog.schema_version),
    'organization_policy_version', global_policy.version,
    'user_type_preference_version', type_preference.version,
    'user_category_preference_version', category_preference.version,
    'channels', jsonb_build_object(
      'in_app', jsonb_build_object(
        'eligible', eligible,
        'cadence', coalesce(type_preference.cadence, category_preference.cadence, global_policy.cadence, catalog.default_cadence),
        'reason_chain', jsonb_build_array(
          'catalog_supported',
          case when global_policy.id is null then 'organization_default' else 'organization_policy' end,
          case
            when catalog.mandatory_in_app then 'mandatory_in_app'
            when type_preference.id is not null then 'user_type_preference'
            when category_preference.id is not null then 'user_category_preference'
            else 'user_default'
          end
        )
      )
    )
  );
end;
$$;

create or replace function public.project_schedule_notification_recipients_service(
  target_outbox_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox public.notification_outbox%rowtype;
  inserted_count integer;
begin
  select * into outbox from public.notification_outbox item where item.id = target_outbox_id;
  if outbox.id is null then
    raise exception 'notification outbox item not found' using errcode = 'P0002';
  end if;
  if outbox.type_key <> 'schedule.published' or outbox.schema_version <> 1 then
    raise exception 'unsupported notification audience contract' using errcode = '0A000';
  end if;
  if jsonb_typeof(outbox.payload->'recipient_employee_ids') is distinct from 'array' then
    raise exception 'schedule notification recipients are required' using errcode = '22023';
  end if;

  with requested as (
    select distinct value::uuid employee_id
    from jsonb_array_elements_text(outbox.payload->'recipient_employee_ids') value
  ), eligible as (
    select employee.id employee_id, employee.user_id, policy.snapshot policy_snapshot
    from requested
    join public.employee_profiles employee
      on employee.id = requested.employee_id
     and employee.workspace_id = outbox.workspace_id
     and employee.user_id is not null
     and employee.archived_at is null
    join public.workspace_memberships membership
      on membership.workspace_id = outbox.workspace_id
     and membership.user_id = employee.user_id
     and membership.status = 'active'
    cross join lateral (
      select public.resolve_notification_in_app_policy_v1_service(
        outbox.workspace_id, employee.user_id, outbox.type_key, 'schedule'
      ) snapshot
    ) policy
  )
  insert into public.notification_recipients (
    workspace_id, event_id, recipient_user_id, recipient_employee_id,
    audience_reason, policy_snapshot
  )
  select
    outbox.workspace_id, outbox.event_id, eligible.user_id, eligible.employee_id,
    jsonb_build_object('contract', 'published_shift_assignees', 'source', 'producer_recipient_snapshot'),
    eligible.policy_snapshot
  from eligible
  where (eligible.policy_snapshot->'channels'->'in_app'->>'eligible')::boolean
  on conflict (workspace_id, event_id, recipient_user_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.resolve_notification_in_app_policy_v1_service(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.project_schedule_notification_recipients_service(uuid) from public, anon, authenticated;
