begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

select is(
  (select lifecycle from public.notification_catalog where type_key = 'schedule.published' and schema_version = 1),
  'active',
  'schedule published is activated for the first outbox producer'
);
select is(
  (select status from public.notification_template_versions where type_key = 'schedule.published' and schema_version = 1 and channel = 'in_app' and locale = 'en' and template_version = 1),
  'published',
  'the schedule in-app template is published'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('e1600000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'relay-owner@example.test', '', '{}', '{}', now(), now()),
  ('e1600000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'relay-member@example.test', '', '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values ('e1610000-0000-4000-8000-000000000001', 'Notification Relay Workspace', 'e1600000-0000-4000-8000-000000000001');

insert into public.workspace_memberships (id, workspace_id, user_id, role, status, all_locations)
values
  ('e1620000-0000-4000-8000-000000000001', 'e1610000-0000-4000-8000-000000000001', 'e1600000-0000-4000-8000-000000000001', 'owner', 'active', true),
  ('e1620000-0000-4000-8000-000000000002', 'e1610000-0000-4000-8000-000000000001', 'e1600000-0000-4000-8000-000000000002', 'employee', 'active', true);

insert into public.employee_profiles (
  id, workspace_id, user_id, employee_code, first_name, last_name, created_by
)
values (
  'e1630000-0000-4000-8000-000000000001',
  'e1610000-0000-4000-8000-000000000001',
  'e1600000-0000-4000-8000-000000000002',
  'E-1601', 'Relay', 'Member', 'e1600000-0000-4000-8000-000000000001'
);

set local role authenticated;
select throws_ok(
  $$select * from public.lease_notification_outbox_service('browser-worker', 1, 30)$$,
  '42501',
  null,
  'browser roles cannot lease notification work'
);
reset role;

insert into public.notification_outbox (
  id, workspace_id, event_id, type_key, schema_version, actor_user_id,
  subject_type, subject_id, payload, occurred_at, available_at, created_at
)
values
  (
    'e1640000-0000-4000-8000-000000000001',
    'e1610000-0000-4000-8000-000000000001',
    'e1650000-0000-4000-8000-000000000001',
    'schedule.published', 1, 'e1600000-0000-4000-8000-000000000001',
    'schedule_week', '2035-02-05',
    '{"correlation_id":"e1650000-0000-4000-8000-000000000001","week_start":"2035-02-05","recipient_employee_ids":["e1630000-0000-4000-8000-000000000001"]}',
    '2035-02-01 12:00:00+00', '2025-02-01 12:00:00+00', '2025-02-01 12:00:00+00'
  ),
  (
    'e1640000-0000-4000-8000-000000000002',
    'e1610000-0000-4000-8000-000000000001',
    'e1650000-0000-4000-8000-000000000002',
    'schedule.published', 1, 'e1600000-0000-4000-8000-000000000001',
    'schedule_week', '2035-02-12',
    '{"correlation_id":"e1650000-0000-4000-8000-000000000002","week_start":"2035-02-12","recipient_employee_ids":["e1630000-0000-4000-8000-000000000001"]}',
    '2035-02-02 12:00:00+00', '2025-02-02 12:00:00+00', '2025-02-02 12:00:00+00'
  ),
  (
    'e1640000-0000-4000-8000-000000000003',
    'e1610000-0000-4000-8000-000000000001',
    'e1650000-0000-4000-8000-000000000003',
    'schedule.published', 1, 'e1600000-0000-4000-8000-000000000001',
    'schedule_week', '2035-02-19',
    '{"correlation_id":"e1650000-0000-4000-8000-000000000003","week_start":"2035-02-19"}',
    '2035-02-03 12:00:00+00', '2025-02-03 12:00:00+00', '2025-02-03 12:00:00+00'
  );

select is(
  (select count(*)::integer from public.lease_notification_outbox_service('worker-a', 1, 30)),
  1,
  'the relay respects its batch bound'
);
select is(
  (select lease_owner from public.notification_outbox where id = 'e1640000-0000-4000-8000-000000000001'),
  'worker-a',
  'the oldest available item is leased to the caller'
);
select ok(
  public.heartbeat_notification_outbox_service('worker-a', 'e1640000-0000-4000-8000-000000000001', 60),
  'the lease owner can heartbeat active work'
);
select is(
  public.process_notification_outbox_service('worker-a', 'e1640000-0000-4000-8000-000000000001')->>'status',
  'processed',
  'a valid leased event is processed'
);
select is(
  (select count(*)::integer from public.notification_events where id = 'e1650000-0000-4000-8000-000000000001'),
  1,
  'processing persists the immutable event once'
);
select is(
  (select count(*)::integer from public.notification_recipients where event_id = 'e1650000-0000-4000-8000-000000000001'),
  1,
  'processing persists the recipient decision snapshot'
);
select cmp_ok(
  (select jsonb_array_length(policy_snapshot->'channels'->'in_app'->'reason_chain') from public.notification_recipients where event_id = 'e1650000-0000-4000-8000-000000000001'),
  '>=',
  6,
  'the resolver snapshots the complete versioned in-app reason chain'
);
select is(
  (select count(*)::integer from public.notification_inbox_items item join public.notification_recipients recipient on recipient.id = item.recipient_projection_id where recipient.event_id = 'e1650000-0000-4000-8000-000000000001'),
  1,
  'processing projects one inbox item'
);
select is(
  (select count(*)::integer from public.notifications where source_type = 'notification_event' and source_id = 'e1650000-0000-4000-8000-000000000001'),
  1,
  'coexistence projects the event into the currently visible legacy inbox'
);
select ok(
  (select legacy_notification_id is not null from public.notification_inbox_items item join public.notification_recipients recipient on recipient.id = item.recipient_projection_id where recipient.event_id = 'e1650000-0000-4000-8000-000000000001'),
  'the v2 inbox row is linked to its legacy coexistence row'
);

select is(
  (select count(*)::integer from public.lease_notification_outbox_service('worker-a', 1, 5)),
  1,
  'a second item can be leased before a simulated crash'
);
update public.notification_outbox
set lease_expires_at = now() - interval '1 second'
where id = 'e1640000-0000-4000-8000-000000000002';
select is(
  (select count(*)::integer from public.lease_notification_outbox_service('worker-b', 1, 30)),
  1,
  'an expired lease is recovered by another worker'
);
select is(
  (select attempt_count from public.notification_outbox where id = 'e1640000-0000-4000-8000-000000000002'),
  2,
  'crash recovery advances the durable attempt count'
);
select is(
  public.process_notification_outbox_service('worker-b', 'e1640000-0000-4000-8000-000000000002')->>'status',
  'processed',
  'the recovered item completes successfully'
);
select is(
  public.project_schedule_notification_recipients_service('e1640000-0000-4000-8000-000000000002'),
  0,
  'replaying the audience stage is idempotent'
);
select is(
  public.project_notification_inbox_service('e1640000-0000-4000-8000-000000000002'),
  0,
  'replaying the inbox stage is idempotent'
);
select is(
  (select count(*)::integer from public.notification_inbox_items item join public.notification_recipients recipient on recipient.id = item.recipient_projection_id where recipient.event_id = 'e1650000-0000-4000-8000-000000000002'),
  1,
  'crash recovery creates no duplicate inbox rows'
);

select is(
  (select count(*)::integer from public.lease_notification_outbox_service('worker-c', 1, 30)),
  1,
  'the poison item is leased'
);
select throws_ok(
  $$select public.process_notification_outbox_service('worker-c', 'e1640000-0000-4000-8000-000000000003')$$,
  '22023',
  'schedule notification recipients are required',
  'invalid audience payloads fail deterministically'
);
select is(
  public.fail_notification_outbox_service('worker-c', 'e1640000-0000-4000-8000-000000000003', 'invalid audience payload', 1, 5)->>'status',
  'dead_letter',
  'a poison event stops at the configured attempt bound'
);
select is(
  (select last_error from public.notification_outbox where id = 'e1640000-0000-4000-8000-000000000003'),
  'invalid audience payload',
  'the dead letter retains a bounded operational error'
);

insert into public.notification_outbox (
  id, workspace_id, event_id, type_key, schema_version, actor_user_id,
  subject_type, subject_id, payload, occurred_at, available_at, created_at
)
values (
  'e1640000-0000-4000-8000-000000000004',
  'e1610000-0000-4000-8000-000000000001',
  'e1650000-0000-4000-8000-000000000004',
  'schedule.published', 1, 'e1600000-0000-4000-8000-000000000001',
  'schedule_week', '2035-02-26',
  '{"correlation_id":"e1650000-0000-4000-8000-000000000004","week_start":"2035-02-26","recipient_employee_ids":["e1630000-0000-4000-8000-000000000001"]}',
  '2035-02-04 12:00:00+00', '2025-02-04 12:00:00+00', '2025-02-04 12:00:00+00'
);
select is(
  (select count(*)::integer from public.lease_notification_outbox_service('worker-d', 1, 30)),
  1,
  'a due item can be leased before workspace closure revalidation'
);
update public.workspaces
set lifecycle_status = 'deleted',
    closed_at = now(),
    closed_by = 'e1600000-0000-4000-8000-000000000001'
where id = 'e1610000-0000-4000-8000-000000000001';
select is(
  public.process_notification_outbox_service('worker-d', 'e1640000-0000-4000-8000-000000000004')->>'status',
  'skipped',
  'closed workspaces do not project notification outbox work'
);
select is(
  (select count(*)::integer from public.notification_events where id = 'e1650000-0000-4000-8000-000000000004'),
  0,
  'closed workspace processing creates no notification event'
);
select is(
  (select count(*)::integer from public.notification_audit_log where action = 'notification.outbox.cancelled_workspace' and target_id = 'e1650000-0000-4000-8000-000000000004'),
  1,
  'closed workspace notification cancellation is audited separately'
);

select * from finish();
rollback;
