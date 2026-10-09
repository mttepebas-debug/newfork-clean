begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('e1900000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preferences-owner@example.test', '', '{}', '{}', now(), now()),
  ('e1900000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preferences-employee@example.test', '', '{}', '{}', now(), now()),
  ('e1900000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preferences-other@example.test', '', '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values ('e1910000-0000-4000-8000-000000000001', 'Preference Workspace', 'e1900000-0000-4000-8000-000000000001');

insert into public.workspace_memberships (id, workspace_id, user_id, role, status, all_locations)
values
  ('e1920000-0000-4000-8000-000000000001', 'e1910000-0000-4000-8000-000000000001', 'e1900000-0000-4000-8000-000000000001', 'owner', 'active', true),
  ('e1920000-0000-4000-8000-000000000002', 'e1910000-0000-4000-8000-000000000001', 'e1900000-0000-4000-8000-000000000002', 'employee', 'active', true),
  ('e1920000-0000-4000-8000-000000000003', 'e1910000-0000-4000-8000-000000000001', 'e1900000-0000-4000-8000-000000000003', 'employee', 'suspended', true);

select is(
  public.get_notification_user_preferences_service(
    'e1900000-0000-4000-8000-000000000002',
    'e1910000-0000-4000-8000-000000000001'
  )->>'workspace_id',
  'e1910000-0000-4000-8000-000000000001',
  'active members can read their own workspace notification preferences'
);

select ok(
  jsonb_array_length(public.get_notification_user_preferences_service(
    'e1900000-0000-4000-8000-000000000002',
    'e1910000-0000-4000-8000-000000000001'
  )->'catalog') >= 8,
  'preference response includes active catalog entries'
);

select is(
  public.save_notification_user_preferences_service(
    'e1900000-0000-4000-8000-000000000002',
    'e1910000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'preference_scope', 'category',
      'scope_key', 'schedule',
      'channel_preferences', jsonb_build_object('in_app', 'disabled'),
      'cadence', 'daily_digest',
      'timezone', 'America/Los_Angeles',
      'quiet_hours', jsonb_build_object('enabled', true, 'start', '22:00', 'end', '07:00'),
      'safe_preview_enabled', true,
      'expected_version', null
    ))
  )->>'status',
  'saved',
  'explicit preference patch saves the signed-in user preference'
);

select is(
  public.resolve_notification_policy_v1_service(
    'e1910000-0000-4000-8000-000000000001',
    'e1900000-0000-4000-8000-000000000002',
    'schedule.published',
    'in_app',
    null,
    null,
    '{}'
  )->>'decision',
  'deny',
  'category preference narrows optional in-app delivery'
);

select is(
  (
    select metadata->'after'->>'preference_scope'
    from public.notification_audit_log
    where workspace_id = 'e1910000-0000-4000-8000-000000000001'
      and actor_user_id = 'e1900000-0000-4000-8000-000000000002'
      and action = 'notification.preference.saved'
    order by occurred_at desc
    limit 1
  ),
  'category',
  'user preference changes are audited'
);

insert into public.notification_org_policies (
  workspace_id, type_key, schema_version, enabled, allowed_channels, updated_by
)
values (
  'e1910000-0000-4000-8000-000000000001', 'schedule.published', 1, false,
  array['in_app']::text[], 'e1900000-0000-4000-8000-000000000001'
);

select throws_ok(
  $$select public.save_notification_user_preferences_service(
    'e1900000-0000-4000-8000-000000000002',
    'e1910000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'preference_scope', 'type',
      'scope_key', 'schedule.published',
      'channel_preferences', jsonb_build_object('in_app', 'enabled'),
      'cadence', null,
      'timezone', 'America/Los_Angeles',
      'quiet_hours', null,
      'safe_preview_enabled', true,
      'expected_version', null
    ))
  )$$,
  '42501',
  'notification channel managed by organization',
  'users cannot enable an organization-denied channel'
);

select throws_ok(
  $$select public.save_notification_user_preferences_service(
    'e1900000-0000-4000-8000-000000000002',
    'e1910000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'preference_scope', 'category',
      'scope_key', 'schedule',
      'channel_preferences', jsonb_build_object('in_app', 'disabled'),
      'cadence', null,
      'timezone', 'America/Los_Angeles',
      'quiet_hours', null,
      'safe_preview_enabled', true,
      'expected_version', 999
    ))
  )$$,
  'PT409',
  'stale notification preference version',
  'stale preference versions are rejected'
);

select throws_ok(
  $$select public.get_notification_user_preferences_service(
    'e1900000-0000-4000-8000-000000000003',
    'e1910000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  'notification preference access required',
  'suspended members cannot read notification preferences'
);

select * from finish();
rollback;
