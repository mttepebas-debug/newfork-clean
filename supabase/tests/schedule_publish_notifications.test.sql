begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('55000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'publish-admin@example.test', '', '{}', '{}', now(), now()),
  ('55000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'publish-scoped-manager@example.test', '', '{}', '{}', now(), now()),
  ('55000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'publish-recipient-one@example.test', '', '{}', '{}', now(), now()),
  ('55000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'publish-recipient-two@example.test', '', '{}', '{}', now(), now());

insert into public.user_profiles (user_id, display_name) values
  ('55000000-0000-4000-8000-000000000001', 'Publish Admin'),
  ('55000000-0000-4000-8000-000000000002', 'Publish Scoped Manager'),
  ('55000000-0000-4000-8000-000000000003', 'Publish Recipient One'),
  ('55000000-0000-4000-8000-000000000004', 'Publish Recipient Two');

insert into public.workspace_memberships (
  id, workspace_id, user_id, role, status, all_locations
) values
  ('56000000-0000-4000-8000-000000000001', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '55000000-0000-4000-8000-000000000001', 'admin', 'active', true),
  ('56000000-0000-4000-8000-000000000002', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '55000000-0000-4000-8000-000000000002', 'manager', 'active', false);

insert into public.membership_location_scopes (membership_id, workspace_id, location_id)
values ('56000000-0000-4000-8000-000000000002', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '11000000-0000-4000-8000-000000000001');

update public.employee_profiles
set user_id = '55000000-0000-4000-8000-000000000003'
where id = '15000000-0000-4000-8000-000000000001';

update public.employee_profiles
set user_id = '55000000-0000-4000-8000-000000000004'
where id = '15000000-0000-4000-8000-000000000003';

insert into public.schedule_location_publications (
  id, workspace_id, location_id, week_start, version_number, status,
  published_by, published_at
) values
  ('59000000-0000-4000-8000-000000000001', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '11000000-0000-4000-8000-000000000001', '2035-01-01', 1, 'current', 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', now()),
  ('59000000-0000-4000-8000-000000000002', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '11000000-0000-4000-8000-000000000002', '2035-01-01', 1, 'current', 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5', now());

insert into public.schedule_published_shifts (
  id, workspace_id, location_id, publication_id, employee_id, job_id,
  shift_type_id, scheduled_date, start_time, end_time, note, source_shift_id
) values
  ('59100000-0000-4000-8000-000000000001', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '11000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000001', '2035-01-01', '09:00', '17:00', '', '59200000-0000-4000-8000-000000000001'),
  ('59100000-0000-4000-8000-000000000002', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '11000000-0000-4000-8000-000000000002', '59000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000003', '13000000-0000-4000-8000-000000000003', '14000000-0000-4000-8000-000000000001', '2035-01-01', '09:00', '17:00', '', '59200000-0000-4000-8000-000000000002');

set local role service_role;

select ok(
  has_function_privilege(
    'service_role',
    'public.create_schedule_publish_notifications_service(uuid,uuid,date,uuid[],uuid[])',
    'execute'
  ),
  'service role can execute schedule publish notification creation'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_schedule_publish_notifications_service(uuid,uuid,date,uuid[],uuid[])',
    'execute'
  ),
  'authenticated clients cannot execute schedule publish notification creation'
);

select is(
  public.create_schedule_publish_notifications_service(
    'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    '2035-01-01',
    array['59000000-0000-4000-8000-000000000001'::uuid],
    array['15000000-0000-4000-8000-000000000001'::uuid]
  )->>'status',
  'notified',
  'owner can create notifications for an authorized publication'
);
select is(
  public.create_schedule_publish_notifications_service(
    '55000000-0000-4000-8000-000000000001',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    '2035-01-01',
    array['59000000-0000-4000-8000-000000000002'::uuid],
    array['15000000-0000-4000-8000-000000000003'::uuid]
  )->>'status',
  'notified',
  'admin can create notifications for an authorized publication'
);
select is(
  public.create_schedule_publish_notifications_service(
    '55000000-0000-4000-8000-000000000002',
    '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',
    '2035-01-01',
    array['59000000-0000-4000-8000-000000000001'::uuid],
    array['15000000-0000-4000-8000-000000000001'::uuid]
  )->>'status',
  'notified',
  'scoped manager can create notifications for an assigned location'
);

select throws_ok(
  $$select public.create_schedule_publish_notifications_service(null, '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '2035-01-01', array['59000000-0000-4000-8000-000000000001'::uuid], null)$$,
  '42501',
  'schedule publish access required',
  'null actor is rejected'
);
select throws_ok(
  $$select public.create_schedule_publish_notifications_service('55000000-0000-4000-8000-000000000099', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '2035-01-01', array['59000000-0000-4000-8000-000000000001'::uuid], null)$$,
  '42501',
  'schedule publish access required',
  'spoofed actor is rejected'
);
select throws_ok(
  $$select public.create_schedule_publish_notifications_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5', '57000000-0000-4000-8000-000000000001', '2035-01-01', array['59000000-0000-4000-8000-000000000001'::uuid], null)$$,
  '42501',
  'schedule publish access required',
  'cross-tenant publication is rejected'
);
select throws_ok(
  $$select public.create_schedule_publish_notifications_service('55000000-0000-4000-8000-000000000002', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '2035-01-01', array['59000000-0000-4000-8000-000000000002'::uuid], null)$$,
  '42501',
  'schedule publish access required',
  'scoped manager cannot create notifications outside assigned locations'
);
select throws_ok(
  $$select public.create_schedule_publish_notifications_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5', '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd', '2035-01-01', array['58000000-0000-4000-8000-000000000001'::uuid], null)$$,
  '42501',
  'schedule publish access required',
  'unknown publication is rejected'
);

select * from finish();
rollback;
