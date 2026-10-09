create or replace function public.get_notification_user_preferences_service(
  actor_user_id uuid,
  target_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  actor_role_id uuid;
begin
  select membership.role_id into actor_role_id
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active';

  if actor_role_id is null then
    raise exception 'notification preference access required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'can_write', true,
    'workspaces', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', workspace.id,
        'name', workspace.name,
        'role', member.role,
        'isActive', workspace.id = target_workspace_id,
        'onboarding', jsonb_build_object(
          'status', coalesce(onboarding.status, 'complete'::public.onboarding_status),
          'currentStep', coalesce(onboarding.current_step, 2)
        )
      ) order by workspace.name, workspace.id)
      from public.workspace_memberships member
      join public.workspaces workspace
        on workspace.id = member.workspace_id
      left join public.workspace_onboarding onboarding
        on onboarding.workspace_id = workspace.id
      where member.user_id = actor_user_id
        and member.status = 'active'
    ), '[]'::jsonb),
    'catalog', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type_key', catalog.type_key,
        'schema_version', catalog.schema_version,
        'category', catalog.category,
        'severity', catalog.severity,
        'sensitivity', catalog.sensitivity,
        'supported_channels', to_jsonb(catalog.supported_channels),
        'default_cadence', catalog.default_cadence,
        'mandatory_in_app', catalog.mandatory_in_app,
        'channel_controls', (
          select jsonb_agg(jsonb_build_object(
            'channel', channel.value,
            'locked', public.notification_user_channel_lock_reason_service(
              actor_user_id,
              target_workspace_id,
              catalog.type_key,
              channel.value
            ) <> 'available',
            'reason_code', public.notification_user_channel_lock_reason_service(
              actor_user_id,
              target_workspace_id,
              catalog.type_key,
              channel.value
            )
          ) order by channel.ordinality)
          from unnest(array['in_app', 'email', 'push']::text[])
            with ordinality as channel(value, ordinality)
        )
      ) order by catalog.category, catalog.type_key)
      from public.notification_catalog catalog
      where catalog.lifecycle = 'active'
    ), '[]'::jsonb),
    'preferences', coalesce((
      select jsonb_agg(public.notification_user_preference_to_json(preference)
        order by preference.preference_scope, preference.scope_key)
      from public.notification_user_preferences preference
      where preference.workspace_id = target_workspace_id
        and preference.user_id = actor_user_id
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.notification_user_preference_to_json(
  preference public.notification_user_preferences
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', preference.id,
    'preference_scope', preference.preference_scope,
    'scope_key', preference.scope_key,
    'channel_preferences', preference.channel_preferences,
    'cadence', preference.cadence,
    'timezone', preference.timezone,
    'quiet_hours', preference.quiet_hours,
    'safe_preview_enabled', preference.safe_preview_enabled,
    'version', preference.version,
    'updated_at', preference.updated_at
  );
$$;

create or replace function public.notification_user_channel_lock_reason_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_type_key text,
  target_channel text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  catalog public.notification_catalog%rowtype;
  actor_role_id uuid;
  global_policy public.notification_org_policies%rowtype;
  role_policy public.notification_org_policies%rowtype;
begin
  if target_channel not in ('in_app', 'email', 'push') then
    return 'channel_unknown';
  end if;

  select * into catalog
  from public.notification_catalog entry
  where entry.type_key = target_type_key
    and entry.lifecycle = 'active'
  order by entry.schema_version desc
  limit 1;
  if catalog.type_key is null then
    return 'catalog_type_inactive';
  end if;
  if not (target_channel = any(catalog.supported_channels)) then
    return 'catalog_channel_unsupported';
  end if;

  select membership.role_id into actor_role_id
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active';
  if actor_role_id is null then
    return 'workspace_membership_required';
  end if;

  select * into global_policy
  from public.notification_org_policies policy
  where policy.workspace_id = target_workspace_id
    and policy.type_key = target_type_key
    and policy.role_id is null
    and policy.location_id is null
  order by policy.version desc
  limit 1;
  if global_policy.id is not null and
    (not global_policy.enabled or not (target_channel = any(global_policy.allowed_channels))) then
    return 'organization_policy_denied';
  end if;

  select * into role_policy
  from public.notification_org_policies policy
  where policy.workspace_id = target_workspace_id
    and policy.type_key = target_type_key
    and policy.role_id = actor_role_id
    and policy.location_id is null
  order by policy.version desc
  limit 1;
  if role_policy.id is not null and
    (not role_policy.enabled or not (target_channel = any(role_policy.allowed_channels))) then
    return 'role_policy_denied';
  end if;

  return 'available';
end;
$$;

create or replace function public.save_notification_user_preferences_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_updates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  update_row jsonb;
  requested_preference_scope text;
  requested_scope_key text;
  requested_channel_preferences jsonb;
  requested_cadence text;
  requested_timezone text;
  requested_quiet_hours jsonb;
  requested_safe_preview boolean;
  expected_version integer;
  existing public.notification_user_preferences%rowtype;
  saved public.notification_user_preferences%rowtype;
  saved_rows jsonb := '[]'::jsonb;
  seen_keys text[] := array[]::text[];
  changed_channel text;
  changed_value text;
  lock_reason text;
  audit_before jsonb;
begin
  if not public.notification_actor_is_active_member_service(actor_user_id, target_workspace_id) then
    raise exception 'notification preference access required' using errcode = '42501';
  end if;
  if jsonb_typeof(target_updates) <> 'array'
    or jsonb_array_length(target_updates) = 0
    or jsonb_array_length(target_updates) > 50 then
    raise exception 'valid notification preference patch required' using errcode = '22023';
  end if;

  for update_row in select * from jsonb_array_elements(target_updates)
  loop
    requested_preference_scope := update_row->>'preference_scope';
    requested_scope_key := btrim(coalesce(update_row->>'scope_key', ''));
    requested_channel_preferences := coalesce(update_row->'channel_preferences', '{}'::jsonb);
    requested_cadence := nullif(update_row->>'cadence', '');
    requested_timezone := nullif(update_row->>'timezone', '');
    requested_quiet_hours := case
      when update_row ? 'quiet_hours' and update_row->'quiet_hours' <> 'null'::jsonb
      then update_row->'quiet_hours'
      else null
    end;
    requested_safe_preview := coalesce((update_row->>'safe_preview_enabled')::boolean, true);
    expected_version := case
      when update_row ? 'expected_version' and update_row->'expected_version' <> 'null'::jsonb
      then (update_row->>'expected_version')::integer
      else null
    end;

    if array[requested_preference_scope || ':' || requested_scope_key] && seen_keys then
      raise exception 'duplicate notification preference scope' using errcode = '22023';
    end if;
    seen_keys := seen_keys || (requested_preference_scope || ':' || requested_scope_key);

    if requested_preference_scope not in ('category', 'type')
      or requested_scope_key = ''
      or jsonb_typeof(requested_channel_preferences) <> 'object'
      or requested_channel_preferences - array['in_app', 'email', 'push']::text[] <> '{}'::jsonb
      or exists (
        select 1
        from jsonb_each_text(requested_channel_preferences) entry
        where entry.value not in ('enabled', 'disabled', 'inherit')
      )
      or (requested_cadence is not null and requested_cadence not in ('immediate', 'daily_digest', 'weekly_digest'))
      or (requested_timezone is not null and char_length(requested_timezone) > 80)
      or (requested_quiet_hours is not null and (
        jsonb_typeof(requested_quiet_hours) <> 'object'
        or not (requested_quiet_hours ? 'enabled')
        or not (requested_quiet_hours ? 'start')
        or not (requested_quiet_hours ? 'end')
      )) then
      raise exception 'valid notification preference required' using errcode = '22023';
    end if;

    if requested_preference_scope = 'category' and not exists (
      select 1 from public.notification_catalog catalog
      where catalog.lifecycle = 'active'
        and catalog.category = requested_scope_key
    ) then
      raise exception 'notification preference scope not found' using errcode = 'P0002';
    end if;
    if requested_preference_scope = 'type' and not exists (
      select 1 from public.notification_catalog catalog
      where catalog.lifecycle = 'active'
        and catalog.type_key = requested_scope_key
    ) then
      raise exception 'notification preference scope not found' using errcode = 'P0002';
    end if;

    for changed_channel, changed_value in
      select entry.key, entry.value from jsonb_each_text(requested_channel_preferences) entry
    loop
      if changed_value = 'enabled' then
        if requested_preference_scope = 'type' then
          lock_reason := public.notification_user_channel_lock_reason_service(
            actor_user_id,
            target_workspace_id,
            requested_scope_key,
            changed_channel
          );
          if lock_reason <> 'available' then
            raise exception 'notification channel managed by organization' using errcode = '42501';
          end if;
        elsif exists (
          select 1
          from public.notification_catalog catalog
          where catalog.lifecycle = 'active'
            and catalog.category = requested_scope_key
            and public.notification_user_channel_lock_reason_service(
              actor_user_id,
              target_workspace_id,
              catalog.type_key,
              changed_channel
            ) <> 'available'
        ) then
          raise exception 'notification channel managed by organization' using errcode = '42501';
        end if;
      end if;
    end loop;

    select * into existing
    from public.notification_user_preferences preference
    where preference.workspace_id = target_workspace_id
      and preference.user_id = actor_user_id
      and preference.preference_scope = requested_preference_scope
      and preference.scope_key = requested_scope_key
    for update;
    audit_before := case
      when existing.id is null then null
      else public.notification_user_preference_to_json(existing)
    end;

    if existing.id is not null then
      if expected_version is null or existing.version <> expected_version then
        raise exception 'stale notification preference version' using errcode = '40001';
      end if;
      update public.notification_user_preferences
      set channel_preferences = requested_channel_preferences,
          cadence = requested_cadence,
          timezone = requested_timezone,
          quiet_hours = requested_quiet_hours,
          safe_preview_enabled = requested_safe_preview,
          version = public.notification_user_preferences.version + 1,
          updated_at = now()
      where id = existing.id
      returning * into saved;
    else
      if expected_version is not null then
        raise exception 'notification preference not found' using errcode = 'P0002';
      end if;
      insert into public.notification_user_preferences (
        workspace_id, user_id, preference_scope, scope_key,
        channel_preferences, cadence, timezone, quiet_hours, safe_preview_enabled
      ) values (
        target_workspace_id, actor_user_id, requested_preference_scope, requested_scope_key,
        requested_channel_preferences, requested_cadence, requested_timezone,
        requested_quiet_hours, requested_safe_preview
      )
      returning * into saved;
    end if;

    insert into public.notification_audit_log (
      workspace_id, actor_user_id, action, target_type, target_id, reason, metadata
    ) values (
      target_workspace_id,
      actor_user_id,
      'notification.preference.saved',
      'notification_user_preference',
      saved.id::text,
      null,
      jsonb_build_object(
        'before', audit_before,
        'after', public.notification_user_preference_to_json(saved)
      )
    );

    saved_rows := saved_rows || jsonb_build_array(public.notification_user_preference_to_json(saved));
  end loop;

  return jsonb_build_object('status', 'saved', 'preferences', saved_rows);
end;
$$;

drop function if exists public.get_notification_inbox_v2_service(
  uuid,
  uuid,
  text,
  text,
  text,
  timestamptz,
  uuid,
  integer
);

create function public.get_notification_inbox_v2_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_category text,
  target_severity text,
  target_read_state text,
  target_cursor_created_at timestamptz,
  target_cursor_id uuid,
  target_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  effective_limit integer := greatest(1, least(coalesce(target_limit, 30), 50));
begin
  if not public.notification_actor_is_active_member_service(actor_user_id, target_workspace_id) then
    raise exception 'notification inbox access required' using errcode = '42501';
  end if;
  if (target_cursor_created_at is null) <> (target_cursor_id is null) then
    raise exception 'complete notification cursor required' using errcode = '22023';
  end if;
  if target_category is not null and target_category not in (
    'security', 'schedule', 'requests', 'time_tracking',
    'payroll', 'people', 'communications', 'system',
    'announcement', 'request'
  ) then
    raise exception 'valid notification category required' using errcode = '22023';
  end if;
  if target_severity is not null and target_severity not in ('info', 'success', 'warning', 'action_required') then
    raise exception 'valid notification severity required' using errcode = '22023';
  end if;
  if target_read_state is not null and target_read_state not in ('all', 'seen', 'unseen', 'read', 'unread') then
    raise exception 'valid notification read state required' using errcode = '22023';
  end if;

  with candidate as (
    select
      item.id,
      item.workspace_id,
      catalog.category,
      event.type_key,
      event.schema_version,
      catalog.severity,
      item.title,
      item.body,
      item.safe_preview,
      item.action_url,
      item.group_key,
      'notification_event'::text as source_type,
      event.id as source_id,
      item.created_at,
      item.seen_at,
      item.read_at,
      item.dismissed_at,
      item.visibility_state
    from public.notification_inbox_items item
    join public.notification_recipients recipient
      on recipient.id = item.recipient_projection_id
     and recipient.workspace_id = item.workspace_id
    join public.notification_events event
      on event.id = recipient.event_id
     and event.workspace_id = recipient.workspace_id
    join public.notification_catalog catalog
      on catalog.type_key = event.type_key
     and catalog.schema_version = event.schema_version
    where item.workspace_id = target_workspace_id
      and recipient.recipient_user_id = get_notification_inbox_v2_service.actor_user_id
      and item.dismissed_at is null
      and item.visibility_state = 'visible'
      and (
        target_category is null
        or catalog.category = target_category
        or (target_category = 'announcement' and catalog.category = 'communications')
        or (target_category = 'request' and catalog.category in ('requests', 'time_tracking'))
      )
      and (target_severity is null or catalog.severity = target_severity)
      and (
        target_read_state is null
        or target_read_state = 'all'
        or (target_read_state = 'seen' and item.seen_at is not null)
        or (target_read_state = 'unseen' and item.seen_at is null)
        or (target_read_state = 'read' and item.read_at is not null)
        or (target_read_state = 'unread' and item.read_at is null)
      )
      and (
        target_cursor_created_at is null
        or (item.created_at, item.id) < (target_cursor_created_at, target_cursor_id)
      )
    order by item.created_at desc, item.id desc
    limit effective_limit + 1
  ), page as (
    select * from candidate
    order by created_at desc, id desc
    limit effective_limit
  )
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'unread_count', (
      select count(*)
      from public.notification_inbox_items unread_item
      join public.notification_recipients unread_recipient
        on unread_recipient.id = unread_item.recipient_projection_id
       and unread_recipient.workspace_id = unread_item.workspace_id
      where unread_item.workspace_id = target_workspace_id
        and unread_recipient.recipient_user_id = get_notification_inbox_v2_service.actor_user_id
        and unread_item.read_at is null
        and unread_item.dismissed_at is null
        and unread_item.visibility_state = 'visible'
    ),
    'next_cursor', case
      when (select count(*) from candidate) > effective_limit then (
        select jsonb_build_object('created_at', created_at, 'id', id)
        from page
        order by created_at asc, id asc
        limit 1
      )
      else null
    end,
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page_row.id,
        'workspace_id', page_row.workspace_id,
        'category', page_row.category,
        'type_key', page_row.type_key,
        'severity', page_row.severity,
        'safe_preview', page_row.safe_preview,
        'title', page_row.title,
        'body', page_row.body,
        'action_url', page_row.action_url,
        'group_key', page_row.group_key,
        'source_type', page_row.source_type,
        'source_id', page_row.source_id,
        'created_at', page_row.created_at,
        'seen_at', page_row.seen_at,
        'read_at', page_row.read_at,
        'visibility_state', page_row.visibility_state
      ) order by page_row.created_at desc, page_row.id desc)
      from page page_row
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.act_on_notification_inbox_item_v2_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_item_id uuid,
  target_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if not public.notification_actor_is_active_member_service(actor_user_id, target_workspace_id) then
    raise exception 'notification inbox access required' using errcode = '42501';
  end if;

  if target_action = 'read_all' then
    update public.notification_inbox_items item
    set seen_at = coalesce(item.seen_at, now()),
        read_at = coalesce(item.read_at, now())
    from public.notification_recipients recipient
    where item.workspace_id = target_workspace_id
      and recipient.id = item.recipient_projection_id
      and recipient.workspace_id = item.workspace_id
      and recipient.recipient_user_id = actor_user_id
      and item.dismissed_at is null
      and item.visibility_state = 'visible';
  elsif target_item_id is null then
    raise exception 'notification inbox item required' using errcode = '22023';
  elsif target_action = 'seen' then
    update public.notification_inbox_items item
    set seen_at = coalesce(item.seen_at, now())
    from public.notification_recipients recipient
    where item.id = target_item_id
      and item.workspace_id = target_workspace_id
      and recipient.id = item.recipient_projection_id
      and recipient.workspace_id = item.workspace_id
      and recipient.recipient_user_id = actor_user_id
      and item.dismissed_at is null;
  elsif target_action = 'read' then
    update public.notification_inbox_items item
    set seen_at = coalesce(item.seen_at, now()),
        read_at = coalesce(item.read_at, now())
    from public.notification_recipients recipient
    where item.id = target_item_id
      and item.workspace_id = target_workspace_id
      and recipient.id = item.recipient_projection_id
      and recipient.workspace_id = item.workspace_id
      and recipient.recipient_user_id = actor_user_id
      and item.dismissed_at is null;
  elsif target_action = 'unread' then
    update public.notification_inbox_items item
    set seen_at = coalesce(item.seen_at, now()),
        read_at = null
    from public.notification_recipients recipient
    where item.id = target_item_id
      and item.workspace_id = target_workspace_id
      and recipient.id = item.recipient_projection_id
      and recipient.workspace_id = item.workspace_id
      and recipient.recipient_user_id = actor_user_id
      and item.dismissed_at is null;
  elsif target_action = 'dismiss' then
    update public.notification_inbox_items item
    set seen_at = coalesce(item.seen_at, now()),
        dismissed_at = now()
    from public.notification_recipients recipient
    where item.id = target_item_id
      and item.workspace_id = target_workspace_id
      and recipient.id = item.recipient_projection_id
      and recipient.workspace_id = item.workspace_id
      and recipient.recipient_user_id = actor_user_id
      and item.dismissed_at is null;
  else
    raise exception 'unsupported notification action' using errcode = '22023';
  end if;

  get diagnostics affected = row_count;
  if target_action <> 'read_all' and affected = 0 then
    raise exception 'notification inbox item not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('status', 'saved', 'affected', affected);
end;
$$;

revoke all on function public.notification_user_preference_to_json(public.notification_user_preferences)
  from public, anon, authenticated;
revoke all on function public.notification_user_channel_lock_reason_service(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.get_notification_user_preferences_service(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.save_notification_user_preferences_service(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.get_notification_inbox_v2_service(uuid, uuid, text, text, text, timestamptz, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.act_on_notification_inbox_item_v2_service(uuid, uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.get_notification_user_preferences_service(uuid, uuid)
  to service_role;
grant execute on function public.save_notification_user_preferences_service(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.get_notification_inbox_v2_service(uuid, uuid, text, text, text, timestamptz, uuid, integer)
  to service_role;
grant execute on function public.act_on_notification_inbox_item_v2_service(uuid, uuid, uuid, text)
  to service_role;
