create or replace function public.get_notification_settings_service(
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
  can_write boolean;
  catalog_rows jsonb;
  policy_rows jsonb;
  role_rows jsonb;
  location_rows jsonb;
  audit_rows jsonb;
begin
  if not (
    public.service_actor_has_permission(actor_user_id, target_workspace_id, 'notifications.settings.read')
    or public.service_actor_has_permission(actor_user_id, target_workspace_id, 'notifications.settings.write')
  ) then
    raise exception 'notification settings read access required' using errcode = '42501';
  end if;

  can_write := public.service_actor_has_permission(
    actor_user_id,
    target_workspace_id,
    'notifications.settings.write'
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'type_key', entry.type_key,
    'schema_version', entry.schema_version,
    'category', entry.category,
    'severity', entry.severity,
    'sensitivity', entry.sensitivity,
    'supported_channels', to_jsonb(entry.supported_channels),
    'default_cadence', entry.default_cadence,
    'action_route', entry.action_route_contract->>'route',
    'mandatory_in_app', entry.mandatory_in_app,
    'policy', jsonb_build_object(
      'id', policy.id,
      'scope', jsonb_build_object('kind', 'global', 'id', null, 'name', 'Organization'),
      'enabled', coalesce(policy.enabled, true),
      'allowed_channels', coalesce(to_jsonb(policy.allowed_channels), to_jsonb(entry.supported_channels)),
      'cadence', coalesce(policy.cadence, entry.default_cadence),
      'version', policy.version,
      'updated_by', policy.updated_by,
      'updated_at', policy.updated_at,
      'source', case when policy.id is null then 'catalog_default' else 'organization_policy' end
    )
  ) order by entry.category, entry.type_key), '[]'::jsonb)
  into catalog_rows
  from public.notification_catalog entry
  left join public.notification_org_policies policy
    on policy.workspace_id = target_workspace_id
   and policy.type_key = entry.type_key
   and policy.schema_version = entry.schema_version
   and policy.role_id is null
   and policy.location_id is null
  where entry.lifecycle = 'active';

  select coalesce(jsonb_agg(jsonb_build_object(
    'type_key', policy.type_key,
    'schema_version', policy.schema_version,
    'id', policy.id,
    'scope', jsonb_build_object(
      'kind', case
        when policy.role_id is not null then 'role'
        when policy.location_id is not null then 'location'
        else 'global'
      end,
      'id', coalesce(policy.role_id, policy.location_id),
      'name', coalesce(role_row.name, location.name, 'Organization')
    ),
    'enabled', policy.enabled,
    'allowed_channels', to_jsonb(policy.allowed_channels),
    'cadence', policy.cadence,
    'version', policy.version,
    'updated_by', policy.updated_by,
    'updated_at', policy.updated_at,
    'source', 'organization_policy'
  ) order by policy.type_key, coalesce(role_row.name, location.name, 'Organization')), '[]'::jsonb)
  into policy_rows
  from public.notification_org_policies policy
  left join public.workspace_roles role_row
    on role_row.id = policy.role_id and role_row.workspace_id = policy.workspace_id
  left join public.locations location
    on location.id = policy.location_id and location.workspace_id = policy.workspace_id
  where policy.workspace_id = target_workspace_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', role_row.id, 'name', role_row.name)
    order by role_row.sort_order, role_row.name), '[]'::jsonb)
  into role_rows
  from public.workspace_roles role_row
  where role_row.workspace_id = target_workspace_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', location.id, 'name', location.name)
    order by location.sort_order, location.name), '[]'::jsonb)
  into location_rows
  from public.locations location
  where location.workspace_id = target_workspace_id
    and location.archived_at is null;

  select coalesce(jsonb_agg(to_jsonb(audit_item) order by audit_item.occurred_at desc, audit_item.id desc), '[]'::jsonb)
  into audit_rows
  from (
    select
      log.id,
      log.action,
      log.target_type,
      log.target_id,
      log.actor_user_id,
      log.reason,
      case when jsonb_typeof(log.metadata->'before_version') = 'number'
        then (log.metadata->>'before_version')::integer else null end as before_version,
      case when jsonb_typeof(log.metadata->'after_version') = 'number'
        then (log.metadata->>'after_version')::integer else null end as after_version,
      log.occurred_at
    from public.notification_audit_log log
    where log.workspace_id = target_workspace_id
      and log.action in ('notification.policy.saved', 'notification.policy.reset')
    order by log.occurred_at desc, log.id desc
    limit 50
  ) audit_item;

  return jsonb_build_object(
    'workspace_id', target_workspace_id,
    'can_write', can_write,
    'catalog', catalog_rows,
    'policies', policy_rows,
    'roles', role_rows,
    'locations', location_rows,
    'audit', audit_rows
  );
end;
$$;

create or replace function public.save_notification_policy_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_type_key text,
  target_schema_version integer,
  target_scope_kind text,
  target_scope_id uuid,
  target_expected_version integer,
  target_enabled boolean,
  target_allowed_channels text[],
  target_cadence text,
  target_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  catalog_row public.notification_catalog%rowtype;
  membership_row public.workspace_memberships%rowtype;
  existing public.notification_org_policies%rowtype;
  saved public.notification_org_policies%rowtype;
  scoped_role_id uuid;
  scoped_location_id uuid;
  scope_name text;
begin
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'notifications.settings.write') then
    raise exception 'notification settings write access required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(target_reason, ''))) not between 3 and 500 then
    raise exception 'notification policy reason required' using errcode = '22023';
  end if;

  select * into catalog_row
  from public.notification_catalog entry
  where entry.type_key = target_type_key
    and entry.schema_version = target_schema_version
    and entry.lifecycle = 'active';
  if catalog_row.type_key is null then
    raise exception 'active notification type not found' using errcode = 'P0002';
  end if;
  if cardinality(coalesce(target_allowed_channels, '{}'::text[])) = 0
    or not target_allowed_channels <@ catalog_row.supported_channels then
    raise exception 'notification channel is not supported' using errcode = '22023';
  end if;
  if target_cadence not in ('immediate', 'daily_digest', 'weekly_digest') then
    raise exception 'notification cadence is invalid' using errcode = '22023';
  end if;
  if catalog_row.mandatory_in_app and (
    not target_enabled or not ('in_app' = any(target_allowed_channels))
  ) then
    raise exception 'mandatory in-app notification cannot be disabled' using errcode = '22023';
  end if;

  select * into membership_row
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active';

  if target_scope_kind = 'global' then
    if target_scope_id is not null or not membership_row.all_locations then
      raise exception 'organization-wide notification scope required' using errcode = '42501';
    end if;
    scope_name := 'Organization';
  elsif target_scope_kind = 'role' then
    if target_scope_id is null or not membership_row.all_locations then
      raise exception 'organization-wide notification scope required' using errcode = '42501';
    end if;
    select role_row.id, role_row.name into scoped_role_id, scope_name
    from public.workspace_roles role_row
    where role_row.workspace_id = target_workspace_id and role_row.id = target_scope_id;
    if scoped_role_id is null then
      raise exception 'notification role scope not found' using errcode = '42501';
    end if;
  elsif target_scope_kind = 'location' then
    if target_scope_id is null then
      raise exception 'notification location scope not found' using errcode = '42501';
    end if;
    select location.id, location.name into scoped_location_id, scope_name
    from public.locations location
    where location.workspace_id = target_workspace_id
      and location.id = target_scope_id
      and location.archived_at is null;
    if scoped_location_id is null then
      raise exception 'notification location scope not found' using errcode = '42501';
    end if;
    if not membership_row.all_locations and not exists (
      select 1 from public.membership_location_scopes scope
      where scope.workspace_id = target_workspace_id
        and scope.membership_id = membership_row.id
        and scope.location_id = scoped_location_id
    ) then
      raise exception 'notification location scope access denied' using errcode = '42501';
    end if;
  else
    raise exception 'notification policy scope is invalid' using errcode = '22023';
  end if;

  select * into existing
  from public.notification_org_policies policy
  where policy.workspace_id = target_workspace_id
    and policy.type_key = target_type_key
    and policy.role_id is not distinct from scoped_role_id
    and policy.location_id is not distinct from scoped_location_id
  for update;

  if (existing.id is null and target_expected_version is not null)
    or (existing.id is not null and target_expected_version is null)
    or (existing.id is not null and existing.version <> target_expected_version) then
    raise exception 'notification policy stale version' using errcode = '40001';
  end if;

  if existing.id is null then
    insert into public.notification_org_policies (
      workspace_id, type_key, schema_version, role_id, location_id,
      enabled, allowed_channels, cadence, mandatory_in_app, updated_by
    ) values (
      target_workspace_id, target_type_key, target_schema_version,
      scoped_role_id, scoped_location_id, target_enabled,
      target_allowed_channels, target_cadence, catalog_row.mandatory_in_app,
      actor_user_id
    ) returning * into saved;
  else
    update public.notification_org_policies policy
    set enabled = target_enabled,
        allowed_channels = target_allowed_channels,
        cadence = target_cadence,
        mandatory_in_app = catalog_row.mandatory_in_app,
        version = policy.version + 1,
        updated_by = actor_user_id,
        updated_at = now()
    where policy.id = existing.id
    returning * into saved;
  end if;

  insert into public.notification_audit_log (
    workspace_id, actor_user_id, action, target_type, target_id, reason, metadata
  ) values (
    target_workspace_id, actor_user_id, 'notification.policy.saved',
    'notification_org_policy', saved.id::text, btrim(target_reason),
    jsonb_build_object(
      'type_key', target_type_key,
      'scope_kind', target_scope_kind,
      'scope_id', target_scope_id,
      'before_version', existing.version,
      'after_version', saved.version,
      'before', case when existing.id is null then null else to_jsonb(existing) end,
      'after', to_jsonb(saved)
    )
  );

  return jsonb_build_object(
    'status', 'saved',
    'policy', jsonb_build_object(
      'id', saved.id,
      'scope', jsonb_build_object(
        'kind', target_scope_kind,
        'id', target_scope_id,
        'name', scope_name
      ),
      'enabled', saved.enabled,
      'allowed_channels', to_jsonb(saved.allowed_channels),
      'cadence', saved.cadence,
      'version', saved.version,
      'updated_by', saved.updated_by,
      'updated_at', saved.updated_at,
      'source', 'organization_policy'
    )
  );
end;
$$;

create or replace function public.reset_notification_policies_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_kind text,
  target_value text,
  target_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership_row public.workspace_memberships%rowtype;
  policy_row public.notification_org_policies%rowtype;
  affected_count integer := 0;
begin
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'notifications.settings.write') then
    raise exception 'notification settings write access required' using errcode = '42501';
  end if;
  select * into membership_row
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active';
  if membership_row.id is null or not membership_row.all_locations then
    raise exception 'organization-wide notification scope required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(target_reason, ''))) not between 3 and 500 then
    raise exception 'notification policy reason required' using errcode = '22023';
  end if;
  if target_kind not in ('type', 'category', 'all')
    or (target_kind in ('type', 'category') and nullif(btrim(coalesce(target_value, '')), '') is null)
    or (target_kind = 'all' and target_value is not null) then
    raise exception 'notification reset target is invalid' using errcode = '22023';
  end if;

  for policy_row in
    select policy.*
    from public.notification_org_policies policy
    join public.notification_catalog entry
      on entry.type_key = policy.type_key and entry.schema_version = policy.schema_version
    where policy.workspace_id = target_workspace_id
      and (
        target_kind = 'all'
        or (target_kind = 'type' and policy.type_key = target_value)
        or (target_kind = 'category' and entry.category = target_value)
      )
    for update of policy
  loop
    delete from public.notification_org_policies where id = policy_row.id;
    affected_count := affected_count + 1;
    insert into public.notification_audit_log (
      workspace_id, actor_user_id, action, target_type, target_id, reason, metadata
    ) values (
      target_workspace_id, actor_user_id, 'notification.policy.reset',
      'notification_org_policy', policy_row.id::text, btrim(target_reason),
      jsonb_build_object(
        'type_key', policy_row.type_key,
        'scope_kind', case
          when policy_row.role_id is not null then 'role'
          when policy_row.location_id is not null then 'location'
          else 'global'
        end,
        'before_version', policy_row.version,
        'after_version', null,
        'before', to_jsonb(policy_row)
      )
    );
  end loop;

  return jsonb_build_object('status', 'reset', 'affected', affected_count);
end;
$$;

create or replace function public.preview_notification_policy_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_type_key text,
  target_channel text,
  target_recipient_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  catalog_row public.notification_catalog%rowtype;
  decision jsonb;
  requested_actor_user_id uuid := actor_user_id;
begin
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'notifications.test_send') then
    raise exception 'notification test-send access required' using errcode = '42501';
  end if;
  if target_recipient_user_id is not null and target_recipient_user_id <> actor_user_id then
    raise exception 'notification preview recipient must be current actor' using errcode = '42501';
  end if;
  select * into catalog_row
  from public.notification_catalog entry
  where entry.type_key = target_type_key
    and entry.schema_version = 1
    and entry.lifecycle = 'active';
  if catalog_row.type_key is null then
    raise exception 'active notification type not found' using errcode = 'P0002';
  end if;
  if not (target_channel = any(catalog_row.supported_channels)) then
    raise exception 'notification channel is not supported' using errcode = '22023';
  end if;
  if (
    select count(*)
    from public.notification_audit_log log
    where log.workspace_id = target_workspace_id
      and log.actor_user_id = requested_actor_user_id
      and log.action = 'notification.policy.previewed'
      and log.occurred_at >= now() - interval '1 minute'
  ) >= 5 then
    raise exception 'notification preview rate limit exceeded' using errcode = '54000';
  end if;

  decision := public.resolve_notification_policy_v1_service(
    target_workspace_id,
    actor_user_id,
    target_type_key,
    target_channel,
    null,
    null,
    '{}'::jsonb
  );

  insert into public.notification_audit_log (
    workspace_id, actor_user_id, action, target_type, target_id, reason, metadata
  ) values (
    target_workspace_id, actor_user_id, 'notification.policy.previewed',
    'notification_catalog', target_type_key, 'Safe preview only',
    jsonb_build_object(
      'channel', target_channel,
      'redirected_to_user_id', actor_user_id,
      'decision', decision->>'decision',
      'delivery_mode', 'preview_only'
    )
  );

  return jsonb_build_object(
    'status', 'previewed',
    'delivery_mode', 'preview_only',
    'redirected_to_user_id', actor_user_id,
    'decision', decision->>'decision',
    'reason_code', coalesce(decision->'reason_chain'->>-1, 'policy_evaluated')
  );
end;
$$;

revoke all on function public.get_notification_settings_service(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_notification_policy_service(uuid, uuid, text, integer, text, uuid, integer, boolean, text[], text, text) from public, anon, authenticated;
revoke all on function public.reset_notification_policies_service(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.preview_notification_policy_service(uuid, uuid, text, text, uuid) from public, anon, authenticated;

grant execute on function public.get_notification_settings_service(uuid, uuid) to service_role;
grant execute on function public.save_notification_policy_service(uuid, uuid, text, integer, text, uuid, integer, boolean, text[], text, text) to service_role;
grant execute on function public.reset_notification_policies_service(uuid, uuid, text, text, text) to service_role;
grant execute on function public.preview_notification_policy_service(uuid, uuid, text, text, uuid) to service_role;
