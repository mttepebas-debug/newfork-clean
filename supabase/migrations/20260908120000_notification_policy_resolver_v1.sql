create table public.notification_recipient_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid not null,
  candidate_user_id uuid not null references auth.users(id) on delete restrict,
  candidate_employee_id uuid,
  location_id uuid,
  channel text not null check (channel in ('in_app', 'email', 'push')),
  decision text not null check (decision in ('allow', 'deny')),
  cadence text not null check (cadence in ('immediate', 'daily_digest', 'weekly_digest')),
  reason_chain jsonb not null check (jsonb_typeof(reason_chain) = 'array'),
  policy_snapshot jsonb not null check (jsonb_typeof(policy_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (workspace_id, event_id, candidate_user_id, channel),
  foreign key (event_id, workspace_id)
    references public.notification_events(id, workspace_id) on delete restrict,
  foreign key (candidate_employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete restrict,
  foreign key (location_id, workspace_id)
    references public.locations(id, workspace_id) on delete restrict
);

create index notification_recipient_decisions_event_idx
  on public.notification_recipient_decisions (workspace_id, event_id, decision);
create index notification_recipient_decisions_user_idx
  on public.notification_recipient_decisions (workspace_id, candidate_user_id, created_at desc);

alter table public.notification_recipient_decisions enable row level security;
revoke all on table public.notification_recipient_decisions from public, anon, authenticated;
grant select, insert, update, delete on table public.notification_recipient_decisions to service_role;

create or replace function public.resolve_notification_policy_v1_service(
  target_workspace_id uuid,
  target_user_id uuid,
  target_type_key text,
  target_channel text,
  target_role_id uuid default null,
  target_location_id uuid default null,
  target_event_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  catalog public.notification_catalog%rowtype;
  membership public.workspace_memberships%rowtype;
  global_policy public.notification_org_policies%rowtype;
  role_policy public.notification_org_policies%rowtype;
  type_preference public.notification_user_preferences%rowtype;
  category_preference public.notification_user_preferences%rowtype;
  context_location_ids uuid[] := '{}'::uuid[];
  location_policy_versions jsonb := '[]'::jsonb;
  location_policy_denied boolean := false;
  location_policy_cadence text;
  preference_value text;
  consent_state text;
  eligible boolean := true;
  cadence text := 'immediate';
  reasons jsonb := '[]'::jsonb;
begin
  if target_channel not in ('in_app', 'email', 'push') then
    raise exception 'unsupported notification channel' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(target_event_context, '{}'::jsonb)) <> 'object' then
    raise exception 'notification event context must be an object' using errcode = '22023';
  end if;

  select * into catalog
  from public.notification_catalog entry
  where entry.type_key = target_type_key
    and entry.schema_version = 1
    and entry.lifecycle = 'active';

  if catalog.type_key is null then
    return jsonb_build_object(
      'decision', 'deny', 'eligible', false, 'cadence', 'immediate',
      'reason_chain', jsonb_build_array('catalog_inactive'),
      'versions', jsonb_build_object('schema_version', 1),
      'channels', jsonb_build_object(target_channel, jsonb_build_object(
        'eligible', false, 'cadence', 'immediate',
        'reason_chain', jsonb_build_array('catalog_inactive')
      ))
    );
  end if;
  reasons := reasons || jsonb_build_array('catalog_active');
  cadence := catalog.default_cadence;

  select * into membership
  from public.workspace_memberships member
  where member.workspace_id = target_workspace_id
    and member.user_id = target_user_id;
  if membership.id is null or membership.status <> 'active' then
    eligible := false;
    reasons := reasons || jsonb_build_array('membership_inactive');
  else
    reasons := reasons || jsonb_build_array('membership_active');
  end if;

  if membership.id is not null
    and target_role_id is not null
    and membership.role_id <> target_role_id then
    eligible := false;
    reasons := reasons || jsonb_build_array('role_context_mismatch');
  end if;

  if exists (
    select 1 from public.employee_profiles employee
    where employee.workspace_id = target_workspace_id
      and employee.user_id = target_user_id
      and employee.archived_at is not null
  ) then
    eligible := false;
    reasons := reasons || jsonb_build_array('employee_archived');
  end if;

  if target_location_id is not null then
    context_location_ids := array[target_location_id];
  elsif jsonb_typeof(target_event_context->'location_ids') = 'array' then
    select coalesce(array_agg(distinct value::uuid), '{}'::uuid[])
    into context_location_ids
    from jsonb_array_elements_text(target_event_context->'location_ids') item(value);
  elsif nullif(target_event_context->>'location_id', '') is not null then
    context_location_ids := array[(target_event_context->>'location_id')::uuid];
  end if;

  if cardinality(context_location_ids) > 0 then
    if exists (
      select 1 from unnest(context_location_ids) context_location(location_id)
      where not exists (
        select 1 from public.locations location
        where location.id = context_location.location_id
          and location.workspace_id = target_workspace_id
      )
    ) then
      eligible := false;
      reasons := reasons || jsonb_build_array('location_context_mismatch');
    elsif membership.id is null or (
      not membership.all_locations
      and not exists (
        select 1 from public.membership_location_scopes scope
        where scope.workspace_id = target_workspace_id
          and scope.membership_id = membership.id
          and scope.location_id = any(context_location_ids)
      )
    ) then
      eligible := false;
      reasons := reasons || jsonb_build_array('location_scope_denied');
    else
      reasons := reasons || jsonb_build_array('location_scope_allowed');
    end if;
  end if;

  select * into global_policy
  from public.notification_org_policies policy
  where policy.workspace_id = target_workspace_id
    and policy.type_key = target_type_key
    and policy.role_id is null
    and policy.location_id is null;

  if membership.role_id is not null then
    select * into role_policy
    from public.notification_org_policies policy
    where policy.workspace_id = target_workspace_id
      and policy.type_key = target_type_key
      and policy.role_id = membership.role_id
      and policy.location_id is null;
  end if;

  if cardinality(context_location_ids) > 0 then
    select
      coalesce(bool_or(not policy.enabled or not (target_channel = any(policy.allowed_channels))), false),
      coalesce(jsonb_agg(jsonb_build_object('location_id', policy.location_id, 'version', policy.version) order by policy.location_id), '[]'::jsonb),
      case
        when bool_or(policy.cadence = 'weekly_digest') then 'weekly_digest'
        when bool_or(policy.cadence = 'daily_digest') then 'daily_digest'
        else null
      end
    into location_policy_denied, location_policy_versions, location_policy_cadence
    from public.notification_org_policies policy
    where policy.workspace_id = target_workspace_id
      and policy.type_key = target_type_key
      and policy.location_id = any(context_location_ids)
      and policy.role_id is null;
  end if;

  if not (target_channel = any(catalog.supported_channels)) then
    eligible := false;
    reasons := reasons || jsonb_build_array('catalog_channel_unsupported');
  else
    reasons := reasons || jsonb_build_array('catalog_channel_supported');
  end if;

  if global_policy.id is not null then
    reasons := reasons || jsonb_build_array('organization_policy_v' || global_policy.version::text);
    cadence := global_policy.cadence;
    if not global_policy.enabled or not (target_channel = any(global_policy.allowed_channels)) then
      eligible := false;
      reasons := reasons || jsonb_build_array('organization_policy_denied');
    end if;
  else
    reasons := reasons || jsonb_build_array('organization_default');
  end if;

  if role_policy.id is not null then
    reasons := reasons || jsonb_build_array('role_policy_v' || role_policy.version::text);
    cadence := role_policy.cadence;
    if not role_policy.enabled or not (target_channel = any(role_policy.allowed_channels)) then
      eligible := false;
      reasons := reasons || jsonb_build_array('role_policy_denied');
    end if;
  end if;

  if jsonb_array_length(location_policy_versions) > 0 then
    reasons := reasons || jsonb_build_array('location_policy');
    cadence := coalesce(location_policy_cadence, cadence);
    if location_policy_denied then
      eligible := false;
      reasons := reasons || jsonb_build_array('location_policy_denied');
    end if;
  end if;

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
    and preference.scope_key = catalog.category;

  preference_value := coalesce(
    type_preference.channel_preferences->>target_channel,
    category_preference.channel_preferences->>target_channel,
    role_policy.channel_defaults->>target_channel,
    global_policy.channel_defaults->>target_channel,
    'enabled'
  );
  cadence := coalesce(type_preference.cadence, category_preference.cadence, cadence);

  if target_channel = 'in_app' and catalog.mandatory_in_app then
    reasons := reasons || jsonb_build_array('mandatory_in_app');
  elsif preference_value = 'disabled' then
    eligible := false;
    reasons := reasons || jsonb_build_array(
      case
        when type_preference.id is not null then 'user_type_preference_disabled'
        when category_preference.id is not null then 'user_category_preference_disabled'
        else 'organization_channel_default_disabled'
      end
    );
  elsif type_preference.id is not null then
    reasons := reasons || jsonb_build_array('user_type_preference');
  elsif category_preference.id is not null then
    reasons := reasons || jsonb_build_array('user_category_preference');
  else
    reasons := reasons || jsonb_build_array('user_default');
  end if;

  if target_channel in ('email', 'push') and eligible then
    select consent.consent_state into consent_state
    from public.notification_consents consent
    where consent.workspace_id = target_workspace_id
      and consent.user_id = target_user_id
      and consent.channel = target_channel
    order by consent.recorded_at desc, consent.id desc
    limit 1;
    if consent_state not in ('granted', 'not_required') or consent_state is null then
      eligible := false;
      reasons := reasons || jsonb_build_array('consent_missing_or_withdrawn');
    elsif not exists (
      select 1 from public.notification_endpoints endpoint
      where endpoint.workspace_id = target_workspace_id
        and endpoint.user_id = target_user_id
        and endpoint.channel = target_channel
        and endpoint.status = 'active'
    ) then
      eligible := false;
      reasons := reasons || jsonb_build_array('endpoint_unavailable_or_suppressed');
    else
      reasons := reasons || jsonb_build_array('consent_and_endpoint_active');
    end if;
  end if;

  reasons := reasons || jsonb_build_array(case when eligible then 'allow' else 'deny' end);
  return jsonb_build_object(
    'decision', case when eligible then 'allow' else 'deny' end,
    'eligible', eligible,
    'cadence', cadence,
    'reason_chain', reasons,
    'versions', jsonb_build_object(
      'catalog_schema_version', catalog.schema_version,
      'organization_policy_version', global_policy.version,
      'role_policy_version', role_policy.version,
      'location_policy_versions', location_policy_versions,
      'user_type_preference_version', type_preference.version,
      'user_category_preference_version', category_preference.version
    ),
    'channels', jsonb_build_object(target_channel, jsonb_build_object(
      'eligible', eligible,
      'cadence', cadence,
      'reason_chain', reasons
    ))
  );
end;
$$;

create or replace function public.resolve_notification_in_app_policy_v1_service(
  target_workspace_id uuid,
  target_user_id uuid,
  target_type_key text,
  target_category text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.resolve_notification_policy_v1_service(
    target_workspace_id, target_user_id, target_type_key, 'in_app', null, null,
    jsonb_build_object('legacy_category', target_category)
  );
$$;

create or replace function public.project_notification_recipients_service(target_outbox_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox public.notification_outbox%rowtype;
  inserted_count integer;
  single_location_id uuid;
begin
  select * into outbox from public.notification_outbox item where item.id = target_outbox_id;
  if outbox.id is null then
    raise exception 'notification outbox item not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(outbox.payload->'recipient_employee_ids') is distinct from 'array'
    and jsonb_typeof(outbox.payload->'recipient_user_ids') is distinct from 'array' then
    raise exception 'notification recipients are required' using errcode = '22023';
  end if;
  if nullif(outbox.payload->>'location_id', '') is not null then
    single_location_id := (outbox.payload->>'location_id')::uuid;
  elsif jsonb_typeof(outbox.payload->'location_ids') = 'array'
    and jsonb_array_length(outbox.payload->'location_ids') = 1 then
    single_location_id := (outbox.payload->'location_ids'->>0)::uuid;
  end if;

  with requested_employees as (
    select distinct value::uuid employee_id
    from jsonb_array_elements_text(coalesce(outbox.payload->'recipient_employee_ids', '[]'::jsonb)) item(value)
  ), requested_users as (
    select distinct value::uuid user_id
    from jsonb_array_elements_text(coalesce(outbox.payload->'recipient_user_ids', '[]'::jsonb)) item(value)
  ), candidates as (
    select employee.user_id, employee.id employee_id
    from requested_employees requested
    join public.employee_profiles employee
      on employee.id = requested.employee_id
     and employee.workspace_id = outbox.workspace_id
     and employee.user_id is not null
    union
    select requested.user_id, employee.id
    from requested_users requested
    left join public.employee_profiles employee
      on employee.workspace_id = outbox.workspace_id
     and employee.user_id = requested.user_id
  ), resolved as (
    select candidate.user_id, candidate.employee_id,
      public.resolve_notification_policy_v1_service(
        outbox.workspace_id, candidate.user_id, outbox.type_key, 'in_app', null,
        single_location_id,
        jsonb_build_object(
          'location_ids', coalesce(outbox.payload->'location_ids',
            case when single_location_id is null then '[]'::jsonb else jsonb_build_array(single_location_id) end),
          'audience_contract', outbox.payload->>'audience_contract'
        )
      ) snapshot
    from candidates candidate
  )
  insert into public.notification_recipient_decisions (
    workspace_id, event_id, candidate_user_id, candidate_employee_id,
    location_id, channel, decision, cadence, reason_chain, policy_snapshot
  )
  select outbox.workspace_id, outbox.event_id, resolved.user_id, resolved.employee_id,
    single_location_id, 'in_app', resolved.snapshot->>'decision',
    resolved.snapshot->>'cadence', resolved.snapshot->'reason_chain', resolved.snapshot
  from resolved
  on conflict (workspace_id, event_id, candidate_user_id, channel) do nothing;

  insert into public.notification_recipients (
    workspace_id, event_id, recipient_user_id, recipient_employee_id,
    location_id, audience_reason, policy_snapshot
  )
  select decision.workspace_id, decision.event_id, decision.candidate_user_id,
    decision.candidate_employee_id, decision.location_id,
    jsonb_build_object(
      'contract', coalesce(outbox.payload->>'audience_contract', 'producer_recipient_snapshot'),
      'source', 'producer_recipient_snapshot'
    ), decision.policy_snapshot
  from public.notification_recipient_decisions decision
  where decision.workspace_id = outbox.workspace_id
    and decision.event_id = outbox.event_id
    and decision.channel = 'in_app'
    and decision.decision = 'allow'
  on conflict (workspace_id, event_id, recipient_user_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.project_schedule_notification_recipients_service(target_outbox_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare outbox public.notification_outbox%rowtype;
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
  return public.project_notification_recipients_service(target_outbox_id);
end;
$$;

create or replace function public.project_notification_inbox_service(target_outbox_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox public.notification_outbox%rowtype;
  catalog public.notification_catalog%rowtype;
  affected_count integer;
  inbox_title text;
  inbox_body text;
  inbox_preview text;
  inbox_action_url text;
  inbox_group_key text;
  visible_at timestamptz;
  legacy_category public.notification_category;
begin
  select * into outbox from public.notification_outbox item where item.id = target_outbox_id;
  if outbox.id is null then
    raise exception 'notification outbox item not found' using errcode = 'P0002';
  end if;
  select * into catalog from public.notification_catalog entry
  where entry.type_key = outbox.type_key and entry.schema_version = outbox.schema_version;

  inbox_title := coalesce(nullif(outbox.payload->>'title', ''),
    case outbox.type_key when 'schedule.published' then 'New schedule published' else 'New notification' end);
  inbox_body := coalesce(outbox.payload->>'body',
    case outbox.type_key when 'schedule.published' then format('Your schedule for the week of %s is available.', outbox.payload->>'week_start') else '' end);
  inbox_preview := coalesce(outbox.payload->>'safe_preview', left(inbox_body, 240));
  inbox_action_url := coalesce(nullif(outbox.payload->>'action_url', ''), catalog.action_route_contract->>'route');
  if inbox_action_url !~ '^/app(/|$)' then
    inbox_action_url := catalog.action_route_contract->>'route';
  end if;
  inbox_group_key := coalesce(nullif(outbox.payload->>'group_key', ''), catalog.category || ':' || outbox.subject_id);
  visible_at := coalesce(nullif(outbox.payload->>'visible_at', '')::timestamptz, outbox.occurred_at);
  legacy_category := case catalog.category when 'communications' then 'announcement'::public.notification_category when 'schedule' then 'schedule'::public.notification_category else 'request'::public.notification_category end;

  with legacy_items as (
    insert into public.notifications (
      workspace_id, recipient_user_id, category, title, body, action_url,
      source_type, source_id, event_key, created_at
    )
    select recipient.workspace_id, recipient.recipient_user_id, legacy_category,
      inbox_title, inbox_body, inbox_action_url, 'notification_event', outbox.event_id,
      'in_app', visible_at
    from public.notification_recipients recipient
    where recipient.workspace_id = outbox.workspace_id and recipient.event_id = outbox.event_id
    on conflict (recipient_user_id, source_type, source_id, event_key) do update
      set title = excluded.title, body = excluded.body, action_url = excluded.action_url
    returning id, recipient_user_id
  )
  insert into public.notification_inbox_items (
    workspace_id, recipient_projection_id, legacy_notification_id,
    title, body, safe_preview, action_url, group_key, created_at
  )
  select recipient.workspace_id, recipient.id, legacy.id, inbox_title, inbox_body,
    inbox_preview, inbox_action_url, inbox_group_key, visible_at
  from public.notification_recipients recipient
  join legacy_items legacy on legacy.recipient_user_id = recipient.recipient_user_id
  where recipient.workspace_id = outbox.workspace_id and recipient.event_id = outbox.event_id
  on conflict (recipient_projection_id) do update
    set legacy_notification_id = excluded.legacy_notification_id
  where public.notification_inbox_items.legacy_notification_id is null;

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

create or replace function public.process_notification_outbox_service(
  target_worker_id text,
  target_outbox_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox public.notification_outbox%rowtype;
  recipient_count integer;
  inbox_count integer;
begin
  select * into outbox from public.notification_outbox item where item.id = target_outbox_id for update;
  if outbox.id is null then raise exception 'notification outbox item not found' using errcode = 'P0002'; end if;
  if outbox.status <> 'leased' or outbox.lease_owner <> btrim(target_worker_id) or outbox.lease_expires_at <= now() then
    raise exception 'active notification lease required' using errcode = '42501';
  end if;

  perform public.project_notification_event_service(outbox.id);
  recipient_count := public.project_notification_recipients_service(outbox.id);
  inbox_count := public.project_notification_inbox_service(outbox.id);

  update public.notification_outbox
  set status = 'processed', lease_owner = null, lease_expires_at = null, last_error = null
  where id = outbox.id;

  insert into public.notification_audit_log (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    outbox.workspace_id, null, 'notification.outbox.processed', 'notification_event',
    outbox.event_id::text,
    jsonb_build_object(
      'correlation_id', outbox.payload->>'correlation_id',
      'recipient_projections_created', recipient_count,
      'inbox_items_created', inbox_count,
      'worker_id', left(btrim(target_worker_id), 120)
    )
  );

  return jsonb_build_object(
    'status', 'processed', 'outbox_id', outbox.id, 'event_id', outbox.event_id,
    'recipient_projections_created', recipient_count, 'inbox_items_created', inbox_count
  );
end;
$$;

revoke all on function public.resolve_notification_policy_v1_service(uuid, uuid, text, text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.resolve_notification_in_app_policy_v1_service(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.project_notification_recipients_service(uuid) from public, anon, authenticated;
revoke all on function public.project_schedule_notification_recipients_service(uuid) from public, anon, authenticated;
revoke all on function public.project_notification_inbox_service(uuid) from public, anon, authenticated;
revoke all on function public.process_notification_outbox_service(text, uuid) from public, anon, authenticated;
grant execute on function public.process_notification_outbox_service(text, uuid) to service_role;
