begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('e2100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'settings-owner@example.test', '', '{}', '{}', now(), now()),
  ('e2100000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'settings-employee@example.test', '', '{}', '{}', now(), now()),
  ('e2100000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'settings-other@example.test', '', '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values
  ('e2110000-0000-4000-8000-000000000001', 'Settings Workspace', 'e2100000-0000-4000-8000-000000000001'),
  ('e2110000-0000-4000-8000-000000000002', 'Other Workspace', 'e2100000-0000-4000-8000-000000000003');

insert into public.workspace_memberships (id, workspace_id, user_id, role, status, all_locations)
values
  ('e2120000-0000-4000-8000-000000000001', 'e2110000-0000-4000-8000-000000000001', 'e2100000-0000-4000-8000-000000000001', 'owner', 'active', true),
  ('e2120000-0000-4000-8000-000000000002', 'e2110000-0000-4000-8000-000000000001', 'e2100000-0000-4000-8000-000000000002', 'employee', 'active', false),
  ('e2120000-0000-4000-8000-000000000003', 'e2110000-0000-4000-8000-000000000002', 'e2100000-0000-4000-8000-000000000003', 'owner', 'active', true);

insert into public.locations (short_name,
  id, workspace_id, name, street_address, city, region, postal_code, country_code, timezone
)
values
  ('T00023','e2130000-0000-4000-8000-000000000001', 'e2110000-0000-4000-8000-000000000001', 'Main', '1 Main St', 'Los Angeles', 'CA', '90001', 'US', 'America/Los_Angeles'),
  ('T00024','e2130000-0000-4000-8000-000000000002', 'e2110000-0000-4000-8000-000000000002', 'Other', '2 Main St', 'Los Angeles', 'CA', '90002', 'US', 'America/Los_Angeles');

select has_function('public', 'get_notification_settings_service', array['uuid', 'uuid'], 'settings read RPC exists');
select has_function('public', 'save_notification_policy_service', array['uuid', 'uuid', 'text', 'integer', 'text', 'uuid', 'integer', 'boolean', 'text[]', 'text', 'text'], 'policy save RPC exists');
select has_function('public', 'reset_notification_policies_service', array['uuid', 'uuid', 'text', 'text', 'text'], 'policy reset RPC exists');
select has_function('public', 'preview_notification_policy_service', array['uuid', 'uuid', 'text', 'text', 'uuid'], 'safe preview RPC exists');

select is(
  public.get_notification_settings_service(
    'e2100000-0000-4000-8000-000000000001',
    'e2110000-0000-4000-8000-000000000001'
  )->>'can_write',
  'true',
  'a settings writer receives write capability'
);
select is(
  jsonb_array_length(public.get_notification_settings_service(
    'e2100000-0000-4000-8000-000000000001',
    'e2110000-0000-4000-8000-000000000001'
  )->'catalog'),
  9,
  'only the nine active catalog types are returned'
);
select throws_ok(
  $$select public.get_notification_settings_service('e2100000-0000-4000-8000-000000000002', 'e2110000-0000-4000-8000-000000000001')$$,
  '42501',
  'notification settings read access required',
  'an employee without settings permission cannot read organization policy'
);

select is(
  public.save_notification_policy_service(
    'e2100000-0000-4000-8000-000000000001', 'e2110000-0000-4000-8000-000000000001',
    'schedule.published', 1, 'global', null, null, false, array['in_app'], 'immediate',
    'Pause schedule publication notices'
  )->>'status',
  'saved',
  'a writer can create a versioned global policy'
);
select is(
  (select version from public.notification_org_policies
   where workspace_id = 'e2110000-0000-4000-8000-000000000001'
     and type_key = 'schedule.published' and role_id is null and location_id is null),
  1,
  'the first policy version is one'
);
select is(
  (select metadata->>'after_version' from public.notification_audit_log
   where workspace_id = 'e2110000-0000-4000-8000-000000000001'
     and action = 'notification.policy.saved' order by occurred_at desc limit 1),
  '1',
  'policy audit records the resulting version'
);
select throws_ok(
  $$select public.save_notification_policy_service(
    'e2100000-0000-4000-8000-000000000001', 'e2110000-0000-4000-8000-000000000001',
    'schedule.published', 1, 'global', null, 9, true, array['in_app'], 'immediate', 'Stale update attempt'
  )$$,
  '40001',
  'notification policy stale version',
  'a stale optimistic version is rejected'
);
select throws_ok(
  $$select public.save_notification_policy_service(
    'e2100000-0000-4000-8000-000000000001', 'e2110000-0000-4000-8000-000000000001',
    'schedule.published', 1, 'global', null, 1, true, array['email'], 'immediate', 'Try unsupported email'
  )$$,
  '22023',
  'notification channel is not supported',
  'unsupported channels fail before persistence'
);
select throws_ok(
  $$select public.save_notification_policy_service(
    'e2100000-0000-4000-8000-000000000001', 'e2110000-0000-4000-8000-000000000001',
    'schedule.published', 1, 'location', 'e2130000-0000-4000-8000-000000000002', null, true, array['in_app'], 'immediate', 'Try foreign location'
  )$$,
  '42501',
  'notification location scope not found',
  'a cross-workspace location scope is rejected'
);
select is(
  public.preview_notification_policy_service(
    'e2100000-0000-4000-8000-000000000001', 'e2110000-0000-4000-8000-000000000001',
    'schedule.published', 'in_app', null
  )->>'redirected_to_user_id',
  'e2100000-0000-4000-8000-000000000001',
  'safe preview is redirected to the current actor'
);
select throws_ok(
  $$select public.preview_notification_policy_service(
    'e2100000-0000-4000-8000-000000000001', 'e2110000-0000-4000-8000-000000000001',
    'schedule.published', 'in_app', 'e2100000-0000-4000-8000-000000000002'
  )$$,
  '42501',
  'notification preview recipient must be current actor',
  'safe preview cannot target another employee'
);

do $$
begin
  perform public.preview_notification_policy_service('e2100000-0000-4000-8000-000000000001', 'e2110000-0000-4000-8000-000000000001', 'schedule.published', 'in_app', null);
  perform public.preview_notification_policy_service('e2100000-0000-4000-8000-000000000001', 'e2110000-0000-4000-8000-000000000001', 'schedule.published', 'in_app', null);
  perform public.preview_notification_policy_service('e2100000-0000-4000-8000-000000000001', 'e2110000-0000-4000-8000-000000000001', 'schedule.published', 'in_app', null);
  perform public.preview_notification_policy_service('e2100000-0000-4000-8000-000000000001', 'e2110000-0000-4000-8000-000000000001', 'schedule.published', 'in_app', null);
end;
$$;
select throws_ok(
  $$select public.preview_notification_policy_service(
    'e2100000-0000-4000-8000-000000000001', 'e2110000-0000-4000-8000-000000000001',
    'schedule.published', 'in_app', null
  )$$,
  '54000',
  'notification preview rate limit exceeded',
  'safe preview is durably rate limited'
);

select is(
  public.reset_notification_policies_service(
    'e2100000-0000-4000-8000-000000000001', 'e2110000-0000-4000-8000-000000000001',
    'type', 'schedule.published', 'Restore schedule defaults'
  )->>'affected',
  '1',
  'a writer can reset one notification type'
);

select * from finish();
rollback;
