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
  select * into outbox
  from public.notification_outbox item
  where item.id = target_outbox_id;
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
    select
      employee.id employee_id,
      employee.user_id,
      membership.role::text role_key,
      type_preference.version type_preference_version,
      category_preference.version category_preference_version,
      global_policy.version org_policy_version,
      coalesce(
        type_preference.channel_preferences->>'in_app',
        category_preference.channel_preferences->>'in_app',
        'enabled'
      ) <> 'disabled'
      and coalesce(global_policy.enabled, true)
      and (
        global_policy.allowed_channels is null
        or 'in_app' = any(global_policy.allowed_channels)
      ) in_app_enabled
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
    left join public.notification_org_policies global_policy
      on global_policy.workspace_id = outbox.workspace_id
     and global_policy.type_key = outbox.type_key
     and global_policy.role_id is null
     and global_policy.location_id is null
    left join public.notification_user_preferences type_preference
      on type_preference.workspace_id = outbox.workspace_id
     and type_preference.user_id = employee.user_id
     and type_preference.preference_scope = 'type'
     and type_preference.scope_key = outbox.type_key
    left join public.notification_user_preferences category_preference
      on category_preference.workspace_id = outbox.workspace_id
     and category_preference.user_id = employee.user_id
     and category_preference.preference_scope = 'category'
     and category_preference.scope_key = 'schedule'
  )
  insert into public.notification_recipients (
    workspace_id, event_id, recipient_user_id, recipient_employee_id,
    audience_reason, policy_snapshot
  )
  select
    outbox.workspace_id,
    outbox.event_id,
    eligible.user_id,
    eligible.employee_id,
    jsonb_build_object(
      'contract', 'published_shift_assignees',
      'source', 'producer_recipient_snapshot'
    ),
    jsonb_build_object(
      'catalog', jsonb_build_object('type_key', outbox.type_key, 'schema_version', outbox.schema_version),
      'organization_policy_version', eligible.org_policy_version,
      'user_type_preference_version', eligible.type_preference_version,
      'user_category_preference_version', eligible.category_preference_version,
      'channels', jsonb_build_object(
        'in_app', jsonb_build_object(
          'eligible', eligible.in_app_enabled,
          'cadence', 'immediate',
          'reason_chain', jsonb_build_array(
            'catalog_supported', 'organization_default', 'user_preference'
          )
        )
      )
    )
  from eligible
  where eligible.in_app_enabled
  on conflict (workspace_id, event_id, recipient_user_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.project_schedule_notification_recipients_service(uuid) from public, anon, authenticated;
