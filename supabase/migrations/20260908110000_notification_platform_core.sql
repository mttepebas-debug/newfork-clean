create table public.notification_catalog (
  type_key text not null,
  schema_version integer not null check (schema_version > 0),
  category text not null check (category in (
    'security', 'schedule', 'requests', 'time_tracking',
    'payroll', 'people', 'communications', 'system'
  )),
  severity text not null check (severity in ('info', 'success', 'warning', 'action_required')),
  sensitivity text not null check (sensitivity in ('internal', 'confidential', 'restricted')),
  supported_channels text[] not null check (
    cardinality(supported_channels) > 0
    and supported_channels <@ array['in_app', 'email', 'push']::text[]
  ),
  default_cadence text not null check (default_cadence in ('immediate', 'daily_digest', 'weekly_digest')),
  audience_contract text not null,
  action_route_contract jsonb not null check (
    jsonb_typeof(action_route_contract) = 'object'
    and action_route_contract->>'route' ~ '^/app(/|$)'
    and jsonb_typeof(action_route_contract->'allowed_query_keys') = 'array'
  ),
  dedupe_policy jsonb not null check (jsonb_typeof(dedupe_policy) = 'object'),
  retention_class text not null check (retention_class in ('standard_90d', 'sensitive_30d', 'regulated_1y')),
  template_key text not null,
  lifecycle text not null check (lifecycle in ('defined', 'active', 'retired')),
  mandatory_in_app boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (type_key, schema_version),
  check (type_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  check (not mandatory_in_app or category in ('security', 'system'))
);

insert into public.notification_catalog (
  type_key, schema_version, category, severity, sensitivity,
  supported_channels, default_cadence, audience_contract,
  action_route_contract, dedupe_policy, retention_class, template_key,
  lifecycle, mandatory_in_app
)
values
  (
    'communications.announcement.available', 1, 'communications', 'info', 'internal',
    array['in_app'], 'immediate', 'announcement_targeted_members',
    '{"route":"/app/announcements","allowed_query_keys":[]}',
    '{"strategy":"new_revision","scope":"subject_recipient","key_fields":["announcement_id","revision","recipient_user_id"]}',
    'standard_90d', 'communications.announcement.available.v1', 'defined', false
  ),
  (
    'requests.time_off.submitted', 1, 'requests', 'action_required', 'confidential',
    array['in_app'], 'immediate', 'schedule_request_reviewers',
    '{"route":"/app/schedule/requests","allowed_query_keys":[]}',
    '{"strategy":"keep_first","scope":"event_recipient","key_fields":["event_id","recipient_user_id"]}',
    'sensitive_30d', 'requests.time_off.submitted.v1', 'defined', false
  ),
  (
    'requests.time_off.status_changed', 1, 'requests', 'info', 'confidential',
    array['in_app'], 'immediate', 'time_off_requester',
    '{"route":"/app/employee-hub/my-availability","allowed_query_keys":[]}',
    '{"strategy":"keep_first","scope":"event_recipient","key_fields":["event_id","recipient_user_id"]}',
    'sensitive_30d', 'requests.time_off.status_changed.v1', 'defined', false
  ),
  (
    'requests.shift_change.submitted', 1, 'requests', 'action_required', 'confidential',
    array['in_app'], 'immediate', 'schedule_request_reviewers',
    '{"route":"/app/schedule/requests","allowed_query_keys":[]}',
    '{"strategy":"keep_first","scope":"event_recipient","key_fields":["event_id","recipient_user_id"]}',
    'sensitive_30d', 'requests.shift_change.submitted.v1', 'defined', false
  ),
  (
    'requests.shift_change.status_changed', 1, 'requests', 'info', 'confidential',
    array['in_app'], 'immediate', 'shift_change_participants',
    '{"route":"/app/employee-hub/shift-hub","allowed_query_keys":[]}',
    '{"strategy":"keep_first","scope":"event_recipient","key_fields":["event_id","recipient_user_id"]}',
    'sensitive_30d', 'requests.shift_change.status_changed.v1', 'defined', false
  ),
  (
    'time_tracking.correction.submitted', 1, 'time_tracking', 'action_required', 'restricted',
    array['in_app'], 'immediate', 'time_correction_reviewers',
    '{"route":"/app/time-entries","allowed_query_keys":[]}',
    '{"strategy":"keep_first","scope":"subject_recipient","key_fields":["correction_id","recipient_user_id","submitted"]}',
    'regulated_1y', 'time_tracking.correction.submitted.v1', 'defined', false
  ),
  (
    'time_tracking.correction.decided', 1, 'time_tracking', 'info', 'restricted',
    array['in_app'], 'immediate', 'time_correction_requester',
    '{"route":"/app/employee-hub","allowed_query_keys":["tab"]}',
    '{"strategy":"keep_first","scope":"subject_recipient","key_fields":["correction_id","recipient_user_id","decision"]}',
    'regulated_1y', 'time_tracking.correction.decided.v1', 'defined', false
  ),
  (
    'schedule.published', 1, 'schedule', 'info', 'confidential',
    array['in_app'], 'immediate', 'published_shift_assignees',
    '{"route":"/app/employee-hub","allowed_query_keys":["tab"]}',
    '{"strategy":"refresh","scope":"subject_recipient","key_fields":["week_start","publication_id","recipient_user_id"]}',
    'standard_90d', 'schedule.published.v1', 'defined', false
  );

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid not null,
  type_key text not null,
  schema_version integer not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  subject_type text not null check (char_length(btrim(subject_type)) between 1 and 80),
  subject_id text not null check (char_length(btrim(subject_id)) between 1 and 160),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null,
  available_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'leased', 'processed', 'retry', 'dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 2000),
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (workspace_id, event_id),
  foreign key (type_key, schema_version)
    references public.notification_catalog(type_key, schema_version) on delete restrict,
  check (
    (status = 'leased' and lease_owner is not null and lease_expires_at is not null)
    or (status <> 'leased')
  )
);
create index notification_outbox_available_idx
  on public.notification_outbox (available_at, created_at, id)
  where status in ('pending', 'retry');
create index notification_outbox_lease_expiry_idx
  on public.notification_outbox (lease_expires_at)
  where status = 'leased';

create table public.notification_events (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type_key text not null,
  schema_version integer not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  subject_type text not null check (char_length(btrim(subject_type)) between 1 and 80),
  subject_id text not null check (char_length(btrim(subject_id)) between 1 and 160),
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  sensitivity text not null check (sensitivity in ('internal', 'confidential', 'restricted')),
  occurred_at timestamptz not null,
  supersedes_event_id uuid,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (type_key, schema_version)
    references public.notification_catalog(type_key, schema_version) on delete restrict,
  foreign key (supersedes_event_id, workspace_id)
    references public.notification_events(id, workspace_id) on delete restrict,
  check (supersedes_event_id is null or supersedes_event_id <> id),
  check (cancelled_at is null or cancelled_at >= occurred_at)
);
create index notification_events_workspace_occurred_idx
  on public.notification_events (workspace_id, occurred_at desc, id desc);
create index notification_events_subject_idx
  on public.notification_events (workspace_id, subject_type, subject_id, occurred_at desc);

create table public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid not null,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  recipient_employee_id uuid,
  location_id uuid,
  audience_reason jsonb not null check (jsonb_typeof(audience_reason) = 'object'),
  policy_snapshot jsonb not null check (jsonb_typeof(policy_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (workspace_id, event_id, recipient_user_id),
  foreign key (event_id, workspace_id)
    references public.notification_events(id, workspace_id) on delete restrict,
  foreign key (recipient_employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete restrict,
  foreign key (location_id, workspace_id)
    references public.locations(id, workspace_id) on delete restrict
);
create index notification_recipients_user_idx
  on public.notification_recipients (workspace_id, recipient_user_id, created_at desc);
create index notification_recipients_event_idx
  on public.notification_recipients (workspace_id, event_id);

create table public.notification_inbox_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recipient_projection_id uuid not null,
  legacy_notification_id uuid references public.notifications(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null default '' check (char_length(body) <= 5000),
  safe_preview text not null default '' check (char_length(safe_preview) <= 240),
  action_url text check (action_url is null or (char_length(action_url) <= 500 and action_url ~ '^/app(/|$)')),
  group_key text check (group_key is null or char_length(group_key) <= 160),
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  visibility_state text not null default 'visible' check (visibility_state in ('visible', 'superseded', 'cancelled')),
  unique (id, workspace_id),
  unique (recipient_projection_id),
  unique (legacy_notification_id),
  foreign key (recipient_projection_id, workspace_id)
    references public.notification_recipients(id, workspace_id) on delete restrict,
  check (read_at is null or seen_at is not null),
  check (dismissed_at is null or seen_at is not null)
);
create index notification_inbox_items_page_idx
  on public.notification_inbox_items (workspace_id, created_at desc, id desc)
  where dismissed_at is null and visibility_state = 'visible';
create index notification_inbox_items_unread_idx
  on public.notification_inbox_items (workspace_id, created_at desc, id desc)
  where read_at is null and dismissed_at is null and visibility_state = 'visible';

create table public.notification_org_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type_key text not null,
  schema_version integer not null default 1,
  role_id uuid,
  location_id uuid,
  enabled boolean not null default true,
  allowed_channels text[] not null default array['in_app']::text[] check (
    allowed_channels <@ array['in_app', 'email', 'push']::text[]
  ),
  channel_defaults jsonb not null default '{}'::jsonb check (jsonb_typeof(channel_defaults) = 'object'),
  cadence text not null default 'immediate' check (cadence in ('immediate', 'daily_digest', 'weekly_digest')),
  quiet_hours_policy jsonb check (quiet_hours_policy is null or jsonb_typeof(quiet_hours_policy) = 'object'),
  mandatory_in_app boolean not null default false,
  version integer not null default 1 check (version > 0),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique nulls not distinct (workspace_id, type_key, role_id, location_id),
  foreign key (type_key, schema_version)
    references public.notification_catalog(type_key, schema_version) on delete restrict,
  foreign key (role_id, workspace_id)
    references public.workspace_roles(id, workspace_id) on delete cascade,
  foreign key (location_id, workspace_id)
    references public.locations(id, workspace_id) on delete cascade,
  check (role_id is null or location_id is null),
  check (not mandatory_in_app or 'in_app' = any(allowed_channels))
);
create index notification_org_policies_workspace_idx
  on public.notification_org_policies (workspace_id, type_key);

create table public.notification_user_preferences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  preference_scope text not null check (preference_scope in ('category', 'type')),
  scope_key text not null check (char_length(btrim(scope_key)) between 1 and 160),
  channel_preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(channel_preferences) = 'object'),
  cadence text check (cadence is null or cadence in ('immediate', 'daily_digest', 'weekly_digest')),
  timezone text check (timezone is null or char_length(timezone) between 1 and 80),
  quiet_hours jsonb check (quiet_hours is null or jsonb_typeof(quiet_hours) = 'object'),
  safe_preview_enabled boolean not null default true,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (workspace_id, user_id, preference_scope, scope_key)
);
create index notification_user_preferences_user_idx
  on public.notification_user_preferences (user_id, workspace_id);

create table public.notification_endpoints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email', 'push')),
  provider text not null check (char_length(btrim(provider)) between 1 and 80),
  endpoint_hash text not null check (endpoint_hash ~ '^[a-f0-9]{64}$'),
  endpoint_ciphertext bytea not null,
  status text not null default 'active' check (status in ('active', 'invalid', 'suppressed', 'revoked')),
  suppression_reason text,
  last_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (workspace_id, user_id, channel, endpoint_hash)
);
create index notification_endpoints_active_idx
  on public.notification_endpoints (workspace_id, user_id, channel)
  where status = 'active';

create table public.notification_consents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  channel text not null check (channel in ('email', 'push')),
  consent_state text not null check (consent_state in ('granted', 'withdrawn', 'not_required')),
  source text not null check (char_length(btrim(source)) between 1 and 80),
  proof jsonb not null default '{}'::jsonb check (jsonb_typeof(proof) = 'object'),
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create index notification_consents_latest_idx
  on public.notification_consents (workspace_id, user_id, channel, recorded_at desc, id desc);

create table public.notification_template_versions (
  id uuid primary key default gen_random_uuid(),
  type_key text not null,
  schema_version integer not null,
  channel text not null check (channel in ('in_app', 'email', 'push')),
  locale text not null default 'en' check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  template_version integer not null check (template_version > 0),
  template_key text not null,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (id),
  unique (type_key, schema_version, channel, locale, template_version),
  foreign key (type_key, schema_version)
    references public.notification_catalog(type_key, schema_version) on delete restrict,
  check ((status = 'published') = (published_at is not null))
);
create index notification_template_versions_lookup_idx
  on public.notification_template_versions (type_key, schema_version, channel, locale, template_version desc);

insert into public.notification_template_versions (
  type_key, schema_version, channel, locale, template_version, template_key,
  content, status
)
select
  catalog.type_key,
  catalog.schema_version,
  'in_app',
  'en',
  1,
  catalog.template_key,
  jsonb_build_object('title', catalog.template_key, 'body', ''),
  'draft'
from public.notification_catalog catalog;

create table public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recipient_projection_id uuid not null,
  channel text not null check (channel in ('email', 'push')),
  logical_send_version integer not null default 1 check (logical_send_version > 0),
  provider text not null check (char_length(btrim(provider)) between 1 and 80),
  provider_message_id text,
  template_version_id uuid not null references public.notification_template_versions(id) on delete restrict,
  status text not null default 'queued' check (status in (
    'queued', 'attempting', 'provider_accepted', 'delivered', 'engaged',
    'retry', 'permanent_failure', 'suppressed', 'dead_letter'
  )),
  attempt_number integer not null default 0 check (attempt_number >= 0),
  next_attempt_at timestamptz,
  error_class text,
  error_code text,
  accepted_at timestamptz,
  delivered_at timestamptz,
  engaged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (recipient_projection_id, channel, logical_send_version),
  foreign key (recipient_projection_id, workspace_id)
    references public.notification_recipients(id, workspace_id) on delete restrict,
  check (delivered_at is null or accepted_at is not null),
  check (engaged_at is null or delivered_at is not null)
);
create index notification_delivery_attempts_queue_idx
  on public.notification_delivery_attempts (next_attempt_at, created_at, id)
  where status in ('queued', 'retry');
create index notification_delivery_attempts_audit_idx
  on public.notification_delivery_attempts (workspace_id, created_at desc, id desc);

create table public.notification_audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(btrim(action)) between 1 and 120),
  target_type text not null check (char_length(btrim(target_type)) between 1 and 80),
  target_id text not null check (char_length(btrim(target_id)) between 1 and 160),
  reason text check (reason is null or char_length(reason) <= 500),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create index notification_audit_log_workspace_idx
  on public.notification_audit_log (workspace_id, occurred_at desc, id desc);

alter table public.notification_catalog enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.notification_inbox_items enable row level security;
alter table public.notification_org_policies enable row level security;
alter table public.notification_user_preferences enable row level security;
alter table public.notification_endpoints enable row level security;
alter table public.notification_consents enable row level security;
alter table public.notification_template_versions enable row level security;
alter table public.notification_delivery_attempts enable row level security;
alter table public.notification_audit_log enable row level security;

revoke all on table
  public.notification_catalog,
  public.notification_outbox,
  public.notification_events,
  public.notification_recipients,
  public.notification_inbox_items,
  public.notification_org_policies,
  public.notification_user_preferences,
  public.notification_endpoints,
  public.notification_consents,
  public.notification_template_versions,
  public.notification_delivery_attempts,
  public.notification_audit_log
from public, anon, authenticated;

grant select on table public.notification_catalog to service_role;
grant select, insert, update on table public.notification_outbox to service_role;
grant select, insert, update on table public.notification_events to service_role;
grant select, insert on table public.notification_recipients to service_role;
grant select, insert, update on table public.notification_inbox_items to service_role;
grant select, insert, update, delete on table public.notification_org_policies to service_role;
grant select, insert, update, delete on table public.notification_user_preferences to service_role;
grant select, insert, update, delete on table public.notification_endpoints to service_role;
grant select, insert on table public.notification_consents to service_role;
grant select, insert, update on table public.notification_template_versions to service_role;
grant select, insert, update on table public.notification_delivery_attempts to service_role;
grant select, insert on table public.notification_audit_log to service_role;

insert into public.permissions (key, label, category, description, custom_grantable, sort_order)
values
  ('notifications.read_own', 'Read own notifications', 'Notifications', 'Read and act on the signed-in member own workspace inbox.', false, 420),
  ('notifications.preferences.write_own', 'Manage own notification preferences', 'Notifications', 'Manage the signed-in member own workspace notification preferences.', false, 430),
  ('notifications.settings.read', 'View notification settings', 'Notifications', 'View organization notification policy.', true, 440),
  ('notifications.settings.write', 'Manage notification settings', 'Notifications', 'Change organization notification policy.', false, 450),
  ('notifications.test_send', 'Send test notifications', 'Notifications', 'Send a bounded test notification through approved channels.', false, 460),
  ('notifications.delivery_audit.read', 'View notification delivery audit', 'Notifications', 'Inspect delivery attempts and suppression outcomes.', false, 470),
  ('notifications.dlq.replay', 'Replay failed notifications', 'Notifications', 'Replay dead-lettered notification delivery work.', false, 480),
  ('notifications.broadcast.approve', 'Approve notification broadcasts', 'Notifications', 'Approve high-risk organization-wide notification broadcasts.', false, 490)
on conflict (key) do update set
  label = excluded.label,
  category = excluded.category,
  description = excluded.description,
  custom_grantable = excluded.custom_grantable,
  sort_order = excluded.sort_order;

insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
select role.workspace_id, role.id, permission.key
from public.workspace_roles role
cross join (
  values
    ('notifications.settings.read'),
    ('notifications.settings.write'),
    ('notifications.test_send'),
    ('notifications.delivery_audit.read'),
    ('notifications.dlq.replay'),
    ('notifications.broadcast.approve')
) permission(key)
where role.system_key in ('owner', 'admin')
on conflict do nothing;

create function public.notification_actor_is_active_member_service(
  actor_user_id uuid,
  target_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select actor_user_id is not null and exists (
    select 1
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
  );
$$;

create function public.get_notification_inbox_v2_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_cursor_created_at timestamptz default null,
  target_cursor_id uuid default null,
  target_limit integer default 30
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

  with candidate as (
    select
      item.id,
      item.workspace_id,
      recipient.event_id,
      event.type_key,
      event.schema_version,
      item.title,
      item.body,
      item.safe_preview,
      item.action_url,
      item.group_key,
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
    where item.workspace_id = target_workspace_id
      and recipient.recipient_user_id = get_notification_inbox_v2_service.actor_user_id
      and item.dismissed_at is null
      and item.visibility_state = 'visible'
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
    'items', coalesce((
      select jsonb_agg(to_jsonb(page_row) order by page_row.created_at desc, page_row.id desc)
      from page page_row
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create function public.act_on_notification_inbox_item_v2_service(
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

  if target_action = 'seen' then
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
    set seen_at = coalesce(item.seen_at, now()), read_at = null
    from public.notification_recipients recipient
    where item.id = target_item_id
      and item.workspace_id = target_workspace_id
      and recipient.id = item.recipient_projection_id
      and recipient.workspace_id = item.workspace_id
      and recipient.recipient_user_id = actor_user_id
      and item.dismissed_at is null;
  elsif target_action = 'dismiss' then
    update public.notification_inbox_items item
    set seen_at = coalesce(item.seen_at, now()), dismissed_at = now()
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
  if affected = 0 then
    raise exception 'notification inbox item not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('status', 'saved', 'affected', affected);
end;
$$;

create function public.save_notification_user_preference_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_preference_scope text,
  target_scope_key text,
  target_channel_preferences jsonb,
  target_cadence text,
  target_timezone text,
  target_quiet_hours jsonb,
  target_safe_preview_enabled boolean,
  target_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.notification_user_preferences%rowtype;
begin
  if not public.notification_actor_is_active_member_service(actor_user_id, target_workspace_id) then
    raise exception 'notification preference access required' using errcode = '42501';
  end if;
  if target_preference_scope not in ('category', 'type')
    or char_length(btrim(target_scope_key)) not between 1 and 160
    or jsonb_typeof(target_channel_preferences) <> 'object'
    or target_channel_preferences - array['in_app', 'email', 'push']::text[] <> '{}'::jsonb
    or (target_cadence is not null and target_cadence not in ('immediate', 'daily_digest', 'weekly_digest'))
    or (target_quiet_hours is not null and jsonb_typeof(target_quiet_hours) <> 'object') then
    raise exception 'valid notification preference required' using errcode = '22023';
  end if;

  select * into saved
  from public.notification_user_preferences preference
  where preference.workspace_id = target_workspace_id
    and preference.user_id = actor_user_id
    and preference.preference_scope = target_preference_scope
    and preference.scope_key = btrim(target_scope_key)
  for update;

  if found then
    if target_expected_version is null or saved.version <> target_expected_version then
      raise exception 'stale notification preference version' using errcode = '40001';
    end if;
    update public.notification_user_preferences
    set channel_preferences = target_channel_preferences,
        cadence = target_cadence,
        timezone = target_timezone,
        quiet_hours = target_quiet_hours,
        safe_preview_enabled = target_safe_preview_enabled,
        version = version + 1,
        updated_at = now()
    where id = saved.id
    returning * into saved;
  else
    if target_expected_version is not null then
      raise exception 'notification preference not found' using errcode = 'P0002';
    end if;
    insert into public.notification_user_preferences (
      workspace_id, user_id, preference_scope, scope_key,
      channel_preferences, cadence, timezone, quiet_hours,
      safe_preview_enabled
    ) values (
      target_workspace_id, actor_user_id, target_preference_scope,
      btrim(target_scope_key), target_channel_preferences, target_cadence,
      target_timezone, target_quiet_hours, target_safe_preview_enabled
    ) returning * into saved;
  end if;

  return jsonb_build_object(
    'status', 'saved',
    'preference_id', saved.id,
    'version', saved.version
  );
end;
$$;

revoke all on function public.notification_actor_is_active_member_service(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.get_notification_inbox_v2_service(uuid, uuid, timestamptz, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.act_on_notification_inbox_item_v2_service(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.save_notification_user_preference_service(uuid, uuid, text, text, jsonb, text, text, jsonb, boolean, integer)
  from public, anon, authenticated;

grant execute on function public.get_notification_inbox_v2_service(uuid, uuid, timestamptz, uuid, integer)
  to service_role;
grant execute on function public.act_on_notification_inbox_item_v2_service(uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.save_notification_user_preference_service(uuid, uuid, text, text, jsonb, text, text, jsonb, boolean, integer)
  to service_role;
