begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

select has_table('public', 'notification_catalog', 'notification catalog exists');
select has_table('public', 'notification_outbox', 'notification outbox exists');
select has_table('public', 'notification_events', 'notification events exist');
select has_table('public', 'notification_recipients', 'notification recipients exist');
select has_table('public', 'notification_inbox_items', 'notification inbox items exist');
select has_table('public', 'notification_org_policies', 'organization policies exist');
select has_table('public', 'notification_user_preferences', 'user preferences exist');
select has_table('public', 'notification_endpoints', 'notification endpoints exist');
select has_table('public', 'notification_consents', 'notification consents exist');
select has_table('public', 'notification_delivery_attempts', 'delivery attempts exist');
select has_table('public', 'notification_template_versions', 'template versions exist');
select has_table('public', 'notification_audit_log', 'notification audit log exists');

select is(
  (select count(*)::integer from public.notification_catalog),
  9,
  'the approved catalog seed contains nine types'
);

select is(
  (
    select count(*)::integer
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'notification_catalog', 'notification_outbox', 'notification_events',
        'notification_recipients', 'notification_inbox_items',
        'notification_org_policies', 'notification_user_preferences',
        'notification_endpoints', 'notification_consents',
        'notification_delivery_attempts', 'notification_template_versions',
        'notification_audit_log'
      )
      and relation.relrowsecurity
  ),
  12,
  'RLS is enabled on every notification platform table'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('e1400000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'notification-owner@example.test', '', '{}', '{}', now(), now()),
  ('e1400000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'notification-member@example.test', '', '{}', '{}', now(), now()),
  ('e1400000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'notification-other-member@example.test', '', '{}', '{}', now(), now()),
  ('e1400000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'notification-outsider@example.test', '', '{}', '{}', now(), now()),
  ('e1400000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'notification-second-owner@example.test', '', '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values
  ('e1410000-0000-4000-8000-000000000001', 'Notification Workspace One', 'e1400000-0000-4000-8000-000000000001'),
  ('e1410000-0000-4000-8000-000000000002', 'Notification Workspace Two', 'e1400000-0000-4000-8000-000000000005');

insert into public.workspace_memberships (id, workspace_id, user_id, role, status, all_locations)
values
  ('e1420000-0000-4000-8000-000000000001', 'e1410000-0000-4000-8000-000000000001', 'e1400000-0000-4000-8000-000000000001', 'owner', 'active', true),
  ('e1420000-0000-4000-8000-000000000002', 'e1410000-0000-4000-8000-000000000001', 'e1400000-0000-4000-8000-000000000002', 'employee', 'active', true),
  ('e1420000-0000-4000-8000-000000000003', 'e1410000-0000-4000-8000-000000000001', 'e1400000-0000-4000-8000-000000000003', 'employee', 'active', true),
  ('e1420000-0000-4000-8000-000000000005', 'e1410000-0000-4000-8000-000000000002', 'e1400000-0000-4000-8000-000000000005', 'owner', 'active', true);

insert into public.locations (short_name,
  id, workspace_id, name, street_address, city, region, postal_code,
  country_code, timezone
)
values
  ('T00018','e1430000-0000-4000-8000-000000000001', 'e1410000-0000-4000-8000-000000000001', 'One', '1 First St', 'Los Angeles', 'CA', '90001', 'US', 'America/Los_Angeles'),
  ('T00019','e1430000-0000-4000-8000-000000000002', 'e1410000-0000-4000-8000-000000000002', 'Two', '2 Second St', 'Los Angeles', 'CA', '90002', 'US', 'America/Los_Angeles');

select is(
  (
    select count(*)::integer
    from public.workspace_role_permissions permission
    join public.workspace_roles role on role.id = permission.role_id
    where role.workspace_id = 'e1410000-0000-4000-8000-000000000001'
      and role.system_key in ('owner', 'admin')
      and permission.permission_key in (
        'notifications.settings.read', 'notifications.settings.write',
        'notifications.test_send', 'notifications.delivery_audit.read',
        'notifications.dlq.replay', 'notifications.broadcast.approve'
      )
  ),
  12,
  'owner and admin receive organization notification operations permissions'
);

set local role authenticated;
select throws_ok(
  $$select * from public.notification_inbox_items$$,
  '42501',
  null,
  'browser roles cannot read notification platform tables directly'
);
select throws_ok(
  $$select public.get_notification_inbox_v2_service('e1400000-0000-4000-8000-000000000002', 'e1410000-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'browser roles cannot invoke service notification RPCs directly'
);
reset role;

select lives_ok(
  $$insert into public.notification_outbox (
    id, workspace_id, event_id, type_key, schema_version, actor_user_id,
    subject_type, subject_id, payload, occurred_at
  ) values (
    'e1440000-0000-4000-8000-000000000001',
    'e1410000-0000-4000-8000-000000000001',
    'e1450000-0000-4000-8000-000000000001',
    'schedule.published', 1, 'e1400000-0000-4000-8000-000000000001',
    'schedule_week', '2035-01-01', '{}', '2035-01-01 12:00:00+00'
  )$$,
  'a valid outbox event is accepted'
);
select throws_ok(
  $$insert into public.notification_outbox (
    workspace_id, event_id, type_key, schema_version, actor_user_id,
    subject_type, subject_id, payload, occurred_at
  ) values (
    'e1410000-0000-4000-8000-000000000001',
    'e1450000-0000-4000-8000-000000000001',
    'schedule.published', 1, 'e1400000-0000-4000-8000-000000000001',
    'schedule_week', '2035-01-01', '{}', '2035-01-01 12:00:00+00'
  )$$,
  '23505',
  null,
  'duplicate workspace event idempotency keys are rejected'
);

select throws_ok(
  $$insert into public.notification_org_policies (
    workspace_id, type_key, schema_version, location_id, updated_by
  ) values (
    'e1410000-0000-4000-8000-000000000001', 'schedule.published', 1,
    'e1430000-0000-4000-8000-000000000002',
    'e1400000-0000-4000-8000-000000000001'
  )$$,
  '23503',
  null,
  'organization policies cannot reference another workspace location'
);

insert into public.notification_events (
  id, workspace_id, type_key, schema_version, actor_user_id,
  subject_type, subject_id, payload_digest, sensitivity, occurred_at
)
values
  ('e1450000-0000-4000-8000-000000000001', 'e1410000-0000-4000-8000-000000000001', 'schedule.published', 1, 'e1400000-0000-4000-8000-000000000001', 'schedule_week', '2035-01-01-a', repeat('a', 64), 'confidential', '2035-01-01 12:00:00+00'),
  ('e1450000-0000-4000-8000-000000000002', 'e1410000-0000-4000-8000-000000000001', 'schedule.published', 1, 'e1400000-0000-4000-8000-000000000001', 'schedule_week', '2035-01-01-b', repeat('b', 64), 'confidential', '2035-01-01 12:00:00+00'),
  ('e1450000-0000-4000-8000-000000000003', 'e1410000-0000-4000-8000-000000000001', 'schedule.published', 1, 'e1400000-0000-4000-8000-000000000001', 'schedule_week', '2035-01-01-c', repeat('c', 64), 'confidential', '2035-01-01 12:00:00+00');

insert into public.notification_recipients (
  id, workspace_id, event_id, recipient_user_id, location_id,
  audience_reason, policy_snapshot
)
values
  ('e1460000-0000-4000-8000-000000000001', 'e1410000-0000-4000-8000-000000000001', 'e1450000-0000-4000-8000-000000000001', 'e1400000-0000-4000-8000-000000000002', 'e1430000-0000-4000-8000-000000000001', '{"contract":"published_shift_assignees"}', '{"in_app":{"eligible":true}}'),
  ('e1460000-0000-4000-8000-000000000002', 'e1410000-0000-4000-8000-000000000001', 'e1450000-0000-4000-8000-000000000002', 'e1400000-0000-4000-8000-000000000002', 'e1430000-0000-4000-8000-000000000001', '{"contract":"published_shift_assignees"}', '{"in_app":{"eligible":true}}'),
  ('e1460000-0000-4000-8000-000000000003', 'e1410000-0000-4000-8000-000000000001', 'e1450000-0000-4000-8000-000000000003', 'e1400000-0000-4000-8000-000000000002', 'e1430000-0000-4000-8000-000000000001', '{"contract":"published_shift_assignees"}', '{"in_app":{"eligible":true}}');

select throws_ok(
  $$insert into public.notification_recipients (
    workspace_id, event_id, recipient_user_id, location_id,
    audience_reason, policy_snapshot
  ) values (
    'e1410000-0000-4000-8000-000000000002',
    'e1450000-0000-4000-8000-000000000001',
    'e1400000-0000-4000-8000-000000000005',
    'e1430000-0000-4000-8000-000000000002', '{}', '{}'
  )$$,
  '23503',
  null,
  'recipient projections cannot bind an event from another workspace'
);

insert into public.notification_inbox_items (
  id, workspace_id, recipient_projection_id, title, body, safe_preview,
  action_url, created_at
)
values
  ('e1470000-0000-4000-8000-000000000001', 'e1410000-0000-4000-8000-000000000001', 'e1460000-0000-4000-8000-000000000001', 'Schedule one', 'Body', 'Schedule updated', '/app/employee-hub?tab=schedule', '2035-01-01 12:00:00+00'),
  ('e1470000-0000-4000-8000-000000000002', 'e1410000-0000-4000-8000-000000000001', 'e1460000-0000-4000-8000-000000000002', 'Schedule two', 'Body', 'Schedule updated', '/app/employee-hub?tab=schedule', '2035-01-01 12:00:00+00'),
  ('e1470000-0000-4000-8000-000000000003', 'e1410000-0000-4000-8000-000000000001', 'e1460000-0000-4000-8000-000000000003', 'Schedule three', 'Body', 'Schedule updated', '/app/employee-hub?tab=schedule', '2035-01-01 12:00:00+00');

create temp table notification_page_state (
  first_page jsonb,
  second_page jsonb
);
insert into notification_page_state (first_page)
values (
  public.get_notification_inbox_v2_service(
    'e1400000-0000-4000-8000-000000000002',
    'e1410000-0000-4000-8000-000000000001',
    null, null, 2
  )
);
update notification_page_state
set second_page = public.get_notification_inbox_v2_service(
  'e1400000-0000-4000-8000-000000000002',
  'e1410000-0000-4000-8000-000000000001',
  (first_page->'next_cursor'->>'created_at')::timestamptz,
  (first_page->'next_cursor'->>'id')::uuid,
  2
);

select is(
  (select jsonb_array_length(first_page->'items') from notification_page_state),
  2,
  'first compound-cursor page respects the requested size'
);
select ok(
  (select first_page->'next_cursor' is not null from notification_page_state),
  'first page returns a complete compound cursor'
);
select is(
  (select jsonb_array_length(second_page->'items') from notification_page_state),
  1,
  'second compound-cursor page returns the remaining timestamp-collision row'
);
select is(
  (
    select count(distinct item->>'id')::integer
    from notification_page_state state,
    lateral jsonb_array_elements((state.first_page->'items') || (state.second_page->'items')) item
  ),
  3,
  'compound cursor traversal has no duplicate or missing row'
);
select throws_ok(
  $$select public.get_notification_inbox_v2_service(
    'e1400000-0000-4000-8000-000000000002',
    'e1410000-0000-4000-8000-000000000001',
    '2035-01-01 12:00:00+00', null, 2
  )$$,
  '22023',
  'complete notification cursor required',
  'partial compound cursors are rejected'
);
select throws_ok(
  $$select public.get_notification_inbox_v2_service(
    'e1400000-0000-4000-8000-000000000004',
    'e1410000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  'notification inbox access required',
  'outsiders cannot read a workspace inbox'
);
select throws_ok(
  $$select public.act_on_notification_inbox_item_v2_service(
    'e1400000-0000-4000-8000-000000000003',
    'e1410000-0000-4000-8000-000000000001',
    'e1470000-0000-4000-8000-000000000001', 'read'
  )$$,
  'P0002',
  'notification inbox item not found',
  'another active member cannot mutate a user inbox item'
);
select is(
  (
    public.act_on_notification_inbox_item_v2_service(
      'e1400000-0000-4000-8000-000000000002',
      'e1410000-0000-4000-8000-000000000001',
      'e1470000-0000-4000-8000-000000000001', 'read'
    )->>'affected'
  )::integer,
  1,
  'the recipient can mark their own item read'
);
select is(
  (
    public.get_notification_inbox_v2_service(
      'e1400000-0000-4000-8000-000000000002',
      'e1410000-0000-4000-8000-000000000001'
    )->>'unread_count'
  )::integer,
  2,
  'own-user read state is reflected in the unread count'
);


insert into public.notifications (
  workspace_id, recipient_user_id, category, title, body,
  action_url, source_type, source_id, event_key
)
values (
  'e1410000-0000-4000-8000-000000000001',
  'e1400000-0000-4000-8000-000000000002',
  'schedule', 'Legacy schedule', 'Legacy path remains available.',
  '/app/employee-hub?tab=schedule', 'legacy_test',
  'e1480000-0000-4000-8000-000000000001', 'default'
);
select is(
  (
    public.get_notifications_service(
      'e1400000-0000-4000-8000-000000000002',
      'e1410000-0000-4000-8000-000000000001'
    )->>'unread_count'
  )::integer,
  1,
  'the legacy inbox continues to operate during coexistence'
);

select * from finish();
rollback;
