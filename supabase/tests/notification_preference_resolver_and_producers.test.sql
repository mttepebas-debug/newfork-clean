begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select has_table('public', 'notification_recipient_decisions', 'recipient allow and deny decisions are durable');
-- Rules, not a count: the catalog grows with every producer (BL-373).
select is(array(select c.type_key from public.notification_catalog c where c.lifecycle = 'defined' order by 1), '{}'::text[],
  'no catalog type is left defined and never switched on');
select is(array(select c.type_key from public.notification_catalog c where c.lifecycle = 'active' and not exists (
    select 1 from public.notification_template_versions t
    where t.type_key = c.type_key and t.schema_version = c.schema_version and t.channel = 'in_app' and t.status = 'published')
  order by 1), '{}'::text[], 'every active type has a published in-app template');
select is(array(select c.type_key from public.notification_catalog c where c.lifecycle = 'active' and not exists (
    select 1 from public.notification_producer_registry r where r.type_key = c.type_key and r.schema_version = c.schema_version)
  order by 1), '{}'::text[], 'every active type has a producer registration');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('e1700000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'resolver-owner@example.test', '', '{}', '{}', now(), now()),
  ('e1700000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'resolver-employee@example.test', '', '{}', '{}', now(), now()),
  ('e1700000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'resolver-other-owner@example.test', '', '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values
  ('e1710000-0000-4000-8000-000000000001', 'Resolver Workspace', 'e1700000-0000-4000-8000-000000000001'),
  ('e1710000-0000-4000-8000-000000000002', 'Other Workspace', 'e1700000-0000-4000-8000-000000000003');

insert into public.workspace_memberships (id, workspace_id, user_id, role, status, all_locations)
values
  ('e1720000-0000-4000-8000-000000000001', 'e1710000-0000-4000-8000-000000000001', 'e1700000-0000-4000-8000-000000000001', 'owner', 'active', true),
  ('e1720000-0000-4000-8000-000000000002', 'e1710000-0000-4000-8000-000000000001', 'e1700000-0000-4000-8000-000000000002', 'employee', 'active', false),
  ('e1720000-0000-4000-8000-000000000003', 'e1710000-0000-4000-8000-000000000002', 'e1700000-0000-4000-8000-000000000003', 'owner', 'active', true);

insert into public.locations (short_name,
  id, workspace_id, name, street_address, city, region, postal_code, country_code, timezone
)
values
  ('T00020','e1730000-0000-4000-8000-000000000001', 'e1710000-0000-4000-8000-000000000001', 'Scoped', '1 Main St', 'Los Angeles', 'CA', '90001', 'US', 'America/Los_Angeles'),
  ('T00021','e1730000-0000-4000-8000-000000000002', 'e1710000-0000-4000-8000-000000000001', 'Not Scoped', '2 Main St', 'Los Angeles', 'CA', '90002', 'US', 'America/Los_Angeles'),
  ('T00022','e1730000-0000-4000-8000-000000000003', 'e1710000-0000-4000-8000-000000000002', 'Other', '3 Main St', 'Los Angeles', 'CA', '90003', 'US', 'America/Los_Angeles');

insert into public.employee_profiles (
  id, workspace_id, user_id, employee_code, first_name, last_name, created_by
)
values (
  'e1740000-0000-4000-8000-000000000001', 'e1710000-0000-4000-8000-000000000001',
  'e1700000-0000-4000-8000-000000000002', 'E-1701', 'Resolver', 'Employee',
  'e1700000-0000-4000-8000-000000000001'
);
select tests.works_at('e1720000-0000-4000-8000-000000000002', 'e1730000-0000-4000-8000-000000000001');


select is(
  public.resolve_notification_policy_v1_service(
    'e1710000-0000-4000-8000-000000000001', 'e1700000-0000-4000-8000-000000000002',
    'schedule.published', 'in_app', null, 'e1730000-0000-4000-8000-000000000001', '{}'
  )->>'decision',
  'allow',
  'baseline active member in an allowed location is eligible'
);
select is(
  public.resolve_notification_policy_v1_service(
    'e1710000-0000-4000-8000-000000000001', 'e1700000-0000-4000-8000-000000000002',
    'schedule.published', 'in_app', null, 'e1730000-0000-4000-8000-000000000002', '{}'
  )->>'decision',
  'deny',
  'location scope fails closed'
);
select is(
  public.resolve_notification_policy_v1_service(
    'e1710000-0000-4000-8000-000000000001', 'e1700000-0000-4000-8000-000000000002',
    'schedule.published', 'in_app', null, 'e1730000-0000-4000-8000-000000000003', '{}'
  )->>'decision',
  'deny',
  'a location from another workspace fails closed'
);
select is(
  public.resolve_notification_policy_v1_service(
    'e1710000-0000-4000-8000-000000000001', 'e1700000-0000-4000-8000-000000000002',
    'schedule.published', 'in_app',
    (select id from public.workspace_roles where workspace_id = 'e1710000-0000-4000-8000-000000000001' and system_key = 'manager'),
    'e1730000-0000-4000-8000-000000000001', '{}'
  )->>'decision',
  'deny',
  'a mismatched role context fails closed'
);

insert into public.notification_user_preferences (
  workspace_id, user_id, preference_scope, scope_key, channel_preferences
)
values (
  'e1710000-0000-4000-8000-000000000001', 'e1700000-0000-4000-8000-000000000002',
  'type', 'schedule.published', '{"in_app":"disabled"}'
);
select is(
  public.resolve_notification_policy_v1_service(
    'e1710000-0000-4000-8000-000000000001', 'e1700000-0000-4000-8000-000000000002',
    'schedule.published', 'in_app', null, 'e1730000-0000-4000-8000-000000000001', '{}'
  )->>'decision',
  'deny',
  'a user type preference can narrow an optional in-app notification'
);
update public.notification_user_preferences set channel_preferences = '{"in_app":"enabled"}', version = version + 1
where workspace_id = 'e1710000-0000-4000-8000-000000000001' and user_id = 'e1700000-0000-4000-8000-000000000002';
insert into public.notification_org_policies (
  workspace_id, type_key, schema_version, role_id, enabled, updated_by
)
values (
  'e1710000-0000-4000-8000-000000000001', 'schedule.published', 1,
  (select id from public.workspace_roles where workspace_id = 'e1710000-0000-4000-8000-000000000001' and system_key = 'employee'),
  false, 'e1700000-0000-4000-8000-000000000001'
);
select is(
  public.resolve_notification_policy_v1_service(
    'e1710000-0000-4000-8000-000000000001', 'e1700000-0000-4000-8000-000000000002',
    'schedule.published', 'in_app', null, 'e1730000-0000-4000-8000-000000000001', '{}'
  )->>'decision',
  'deny',
  'an organization role deny wins over a user enable'
);

update public.employee_profiles
set archived_at = now(), archived_by = 'e1700000-0000-4000-8000-000000000001'
where id = 'e1740000-0000-4000-8000-000000000001';
select is(
  public.resolve_notification_policy_v1_service(
    'e1710000-0000-4000-8000-000000000001', 'e1700000-0000-4000-8000-000000000002',
    'schedule.published', 'in_app', null, 'e1730000-0000-4000-8000-000000000001', '{}'
  )->>'decision',
  'deny',
  'an archived or terminated employee fails closed'
);
select is(
  public.resolve_notification_policy_v1_service(
    'e1710000-0000-4000-8000-000000000001', 'e1700000-0000-4000-8000-000000000001',
    'schedule.published', 'email', null, null, '{}'
  )->>'decision',
  'deny',
  'an unsupported external channel fails closed before delivery'
);
update public.employee_profiles set archived_at = null, archived_by = null
where id = 'e1740000-0000-4000-8000-000000000001';

-- The time-off request trigger that fed this platform is gone (BILDIRIM-04); its producer is checked no more.

insert into public.notification_outbox (
  id, workspace_id, event_id, type_key, schema_version, actor_user_id,
  subject_type, subject_id, payload, occurred_at, status, lease_owner, lease_expires_at
)
values (
  'e1770000-0000-4000-8000-000000000001', 'e1710000-0000-4000-8000-000000000001',
  'e1780000-0000-4000-8000-000000000001', 'schedule.published', 1,
  'e1700000-0000-4000-8000-000000000001', 'schedule_week', '2035-03-01',
  '{"week_start":"2035-03-01","location_ids":["e1730000-0000-4000-8000-000000000002"],"recipient_employee_ids":["e1740000-0000-4000-8000-000000000001"],"audience_contract":"published_shift_assignees"}',
  now(), 'leased', 'resolver-worker', now() + interval '1 minute'
);
select is(public.process_notification_outbox_service('resolver-worker', 'e1770000-0000-4000-8000-000000000001')->>'status', 'processed', 'a fully denied audience still processes deterministically');
select is((select decision from public.notification_recipient_decisions where event_id = 'e1780000-0000-4000-8000-000000000001'), 'deny', 'the excluded candidate decision is retained for audit');
select is((select count(*)::integer from public.notification_recipients where event_id = 'e1780000-0000-4000-8000-000000000001'), 0, 'a denied location candidate cannot leak into recipient projections');

select public.enqueue_notification_outbox_service(
  'e1710000-0000-4000-8000-000000000001', 'e1780000-0000-4000-8000-000000000002',
  'schedule.published', 1, 'e1700000-0000-4000-8000-000000000001', 'schedule_week', '2035-03-08',
  '{"week_start":"2035-03-08","recipient_employee_ids":[]}', now()
);
select public.enqueue_notification_outbox_service(
  'e1710000-0000-4000-8000-000000000001', 'e1780000-0000-4000-8000-000000000002',
  'schedule.published', 1, 'e1700000-0000-4000-8000-000000000001', 'schedule_week', '2035-03-08',
  '{"week_start":"2035-03-08","recipient_employee_ids":[]}', now()
);
select is((select count(*)::integer from public.notification_outbox where event_id = 'e1780000-0000-4000-8000-000000000002'), 1, 'outbox enqueue replay keeps one logical event');

delete from public.notification_producer_registry where type_key = 'requests.time_off.submitted';
select is(public.reconcile_notification_platform_service()->>'status', 'drift_detected', 'reconciliation detects an active catalog type without a producer');

select * from finish();
rollback;
