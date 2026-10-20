begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values ('19000000-0000-4000-8000-000000000001', 'create-owner@example.test', '{}', '{}'),
       ('19000000-0000-4000-8000-000000000002', 'create-remote@example.test', '{}', '{}'),
       ('19000000-0000-4000-8000-000000000003', 'create-outsider@example.test', '{}', '{}');
-- These accounts have confirmed their address; accepting an invitation asks for it (SEC-003).
update auth.users set email_confirmed_at = now() where id::text like '19000000-%' and email_confirmed_at is null;
insert into public.workspaces (id, name, created_by)
values ('29000000-0000-4000-8000-000000000001', 'Create command test', '19000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships (workspace_id, user_id, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values ('29000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000001', 'owner', true)) as legacy(workspace_id, user_id, role, all_locations);

-- Where Ada works: Remote still needs a location and a job (DAVET-ERISIM, Mert 2026-10-20).
insert into public.locations (id, workspace_id, name, short_name, street_address, city, region, postal_code, country_code, timezone)
values ('89000000-0000-4000-8000-000000000002', '29000000-0000-4000-8000-000000000001', 'East', 'EST9', '2 Road', 'City', 'CA',
  '90012', 'US', 'America/Los_Angeles');
insert into public.departments (id, workspace_id, name)
values ('99000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001', 'Kitchen');
insert into public.jobs (id, workspace_id, department_id, name, color)
values ('a9000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000001', 'Cook', '#123456');

-- DAVET-ERISIM: the invitation names its two accesses; employee_access holds the Employee role in the
-- employee slot, owner_access the Owner role in the management slot (which never takes it).
create temporary table create_fixture (employee jsonb, employee_role uuid, owner_role uuid, result jsonb,
  employee_access jsonb, owner_access jsonb);
insert into create_fixture (employee, employee_role, owner_role, result)
select '{"first_name":"Ada","middle_name":"Byron","last_name":"Lovelace","preferred_name":"","invitation_email":"create-remote@example.test","start_date":"","internal_note":"","location_ids":["89000000-0000-4000-8000-000000000002"],"primary_location_id":"89000000-0000-4000-8000-000000000002","job_ids":["a9000000-0000-4000-8000-000000000001"],"primary_job_id":"a9000000-0000-4000-8000-000000000001","is_remote":true,"is_excluded_from_schedule":false,"expected_revision":null}'::jsonb,
  (select id from public.workspace_roles where workspace_id = '29000000-0000-4000-8000-000000000001' and system_key = 'employee'),
  (select id from public.workspace_roles where workspace_id = '29000000-0000-4000-8000-000000000001' and system_key = 'owner'), null;
update create_fixture set employee_access = jsonb_build_object('employee_role_id', employee_role),
  owner_access = jsonb_build_object('management_role_id', owner_role);
grant all on create_fixture to service_role;
set local role service_role;
select lives_ok($$update create_fixture set result = public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000001', employee, employee_access)$$, 'a remote create and its invitation');
-- The command path passed a positional argument list written before a middle
-- name existed, so this was dropped on the way in and nothing noticed. The
-- record itself is read as postgres; service_role cannot select the table.
set local role postgres;
select is(
  (select profile.first_name || ' ' || profile.middle_name || ' ' || profile.last_name
   from public.employee_profiles profile
   where profile.id = (select (result->>'id')::uuid from create_fixture)),
  'Ada Byron Lovelace',
  'a middle name survives the create command'
);
set local role service_role;
select is((select result->>'delivery_status' from create_fixture), 'pending', 'delivery starts pending');
select is((select length(result->>'token') from create_fixture), 64, 'service receives recoverable invitation token');
select is((select public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000001', employee, employee_access) from create_fixture),
  (select result from create_fixture), 'same command returns same employee invitation and token');
select throws_ok($$select public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000001', employee || '{"last_name":"Changed"}', employee_access) from create_fixture$$,
  'PT409', 'idempotency key belongs to different employee details', 'changed payload cannot reuse command');
select throws_ok($$select public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000003', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000001', employee, employee_access) from create_fixture$$,
  '42501', 'Not allowed', 'outsider cannot create or replay');
select throws_ok($$select public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000002', employee, owner_access) from create_fixture$$,
  '22023', 'the management slot holds a manager or admin class role', 'invalid invite role rolls back the create');
select throws_ok($$select public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000003', employee || '{"location_ids":[],"primary_location_id":null}', null) from create_fixture$$,
  '22023', 'employee requires a location and a job', 'Remote no longer creates somebody with no location');
set local role postgres;
select is((select count(*)::integer from public.employee_profiles where workspace_id = '29000000-0000-4000-8000-000000000001'), 1, 'retries and rejected invitation leave exactly one employee');
select is((select count(*)::integer from public.employee_invitations where workspace_id = '29000000-0000-4000-8000-000000000001'), 1, 'exactly one invitation');
select is((select count(*)::integer from public.employee_location_assignments where workspace_id = '29000000-0000-4000-8000-000000000001'), 1, 'no manufactured locations: only the one Ada was given');
select is((select role_id from public.employee_invitations where id = (select (result->>'invitation_id')::uuid from create_fixture)), (select employee_role from create_fixture), 'chosen role stored');
set local role service_role;
select lives_ok($$select public.mark_employee_invitation_delivery_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  (result->>'invitation_id')::uuid, 'failed', 'Test delivery failure') from create_fixture$$, 'delivery failure is recoverable');
select is((select public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000001', employee, employee_access)->>'delivery_status' from create_fixture), 'failed', 'retry finds delivery status without recreating');
set local role postgres;
select ok(not has_table_privilege('authenticated', 'public.employee_invitation_delivery_secrets', 'select'), 'delivery retry token state is not client readable');
select ok(not has_function_privilege('authenticated', 'public.store_employee_invitation_delivery_secret_service(uuid,uuid,uuid,text)', 'execute'), 'client cannot store a delivery retry token');
select ok(not has_function_privilege('authenticated', 'public.load_employee_invitation_retry_service(uuid,uuid,uuid)', 'execute'), 'client cannot recover a delivery retry token');
set local role service_role;
select throws_ok($$select public.store_employee_invitation_delivery_secret_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  (result->>'invitation_id')::uuid, repeat('x', 64)) from create_fixture$$,
  '22023', 'invitation token does not match', 'delivery retry rejects a mismatched token');
select lives_ok($$select public.store_employee_invitation_delivery_secret_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  (result->>'invitation_id')::uuid, result->>'token') from create_fixture$$,
  'service stores the original invitation token for delivery retry');
select is((select public.load_employee_invitation_retry_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  (result->>'id')::uuid)->>'token' from create_fixture),
  (select result->>'token' from create_fixture), 'delivery retry recovers the same invitation token');
set local role postgres;
select is((select resend_count from public.employee_invitations where id = (select (result->>'invitation_id')::uuid from create_fixture)), 1, 'delivery retry increments the attempt counter');
set local role service_role;
select lives_ok($$select public.accept_employee_invitation_service(
  '19000000-0000-4000-8000-000000000002', encode(extensions.digest(result->>'token', 'sha256'), 'hex')) from create_fixture$$,
  'remote employee accepts the invitation');
set local role postgres;
select is((select count(*)::integer from public.employee_invitation_delivery_secrets where invitation_id = (select (result->>'invitation_id')::uuid from create_fixture)), 0, 'acceptance removes the recoverable delivery token');
set local role service_role;
select lives_ok($$select public.initialize_employee_onboarding_service('19000000-0000-4000-8000-000000000002')$$,
  'remote employee initializes onboarding');
select lives_ok($$select public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000004', employee || '{"is_remote":false,"is_excluded_from_schedule":true,"invitation_email":""}', null) from create_fixture$$,
  'excluded employee saves without an email');
select throws_ok($$select public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-0000000000f5', employee || '{"is_remote":false,"is_excluded_from_schedule":true,"invitation_email":"","job_ids":[],"primary_job_id":null}', null) from create_fixture$$,
  '22023', 'employee requires a location and a job', 'nor without a job: Exclude from schedule no longer lifts it');
set local role postgres;
-- ROL-CIFT: an Employee role chosen at the invitation lands in the employee slot, and nothing in the
-- management slot.
select is((select (role_id, employee_role_id)::text from public.workspace_memberships where user_id = '19000000-0000-4000-8000-000000000002'),
  (select (null::uuid, employee_role)::text from create_fixture), 'accepted role matches selection: the employee slot');
select ok(not has_table_privilege('authenticated', 'public.employee_create_commands', 'select'), 'recovery token state is not client readable');
select ok(not has_function_privilege('authenticated', 'public.create_employee_command_service(uuid,uuid,uuid,jsonb,jsonb)', 'execute'), 'client cannot spoof a service actor');
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values ('19000000-0000-4000-8000-000000000004', 'create-manager-actor@example.test', '{}', '{}'),
       ('19000000-0000-4000-8000-000000000005', 'create-manager-invite@example.test', '{}', '{}');
-- These accounts have confirmed their address; accepting an invitation asks for it (SEC-003).
update auth.users set email_confirmed_at = now() where id::text like '19000000-%' and email_confirmed_at is null;
insert into public.workspace_memberships (workspace_id, user_id, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values ('29000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000004', 'manager', false)) as legacy(workspace_id, user_id, role, all_locations);
insert into public.workspace_roles (id, workspace_id, name, access_class)
values ('59000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001', 'Custom Lead', 'manager');
-- A location the invited managers manage without working there (DAVET-ERISIM: Manages is the invitation's).
insert into public.locations (id, workspace_id, name, short_name, street_address, city, region, postal_code, country_code, timezone)
values ('89000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001', 'West', 'WST9', '1 Road', 'City', 'CA',
  '90012', 'US', 'America/Los_Angeles');
create temporary table role_results (label text, result jsonb);
grant all on role_results to service_role;
create temporary table invite_role_ids as select id, system_key from public.workspace_roles where workspace_id = '29000000-0000-4000-8000-000000000001';
grant select on invite_role_ids to service_role;
set local role service_role;
select throws_ok($$select public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000010', employee || '{"invitation_email":"create-manager-nowhere@example.test"}',
  jsonb_build_object('management_role_id', (select id from invite_role_ids where system_key = 'manager'))) from create_fixture$$,
  '22023', 'a manager needs a location to manage', 'a manager invitation names somewhere to manage');
select throws_ok($$select public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000011', employee || '{"invitation_email":"create-admin-manages@example.test"}',
  jsonb_build_object('management_role_id', (select id from invite_role_ids where system_key = 'admin'),
    'managed_location_ids', jsonb_build_array('89000000-0000-4000-8000-000000000001'))) from create_fixture$$,
  '22023', 'only a manager manages chosen locations', 'an admin invitation names no location to manage');
select lives_ok($$insert into role_results select 'manager', public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000005', employee || '{"invitation_email":"create-manager-invite@example.test"}',
  jsonb_build_object('management_role_id', (select id from invite_role_ids where system_key = 'manager'),
    'managed_location_ids', jsonb_build_array('89000000-0000-4000-8000-000000000001'))) from create_fixture$$,
  'manager role invitation supports zero work locations: it names where they manage');
select lives_ok($$insert into role_results select 'custom', public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000006', employee || '{"invitation_email":"create-custom@example.test"}',
  jsonb_build_object('management_role_id', '59000000-0000-4000-8000-000000000001',
    'managed_location_ids', jsonb_build_array('89000000-0000-4000-8000-000000000001'))) from create_fixture$$,
  'custom role invitation supports zero work locations');
select lives_ok($$insert into role_results select 'admin', public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000007', employee || '{"invitation_email":"create-admin@example.test"}',
  jsonb_build_object('management_role_id', (select id from invite_role_ids where system_key = 'admin'))) from create_fixture$$,
  'owner can invite admin without employee locations');
set local role postgres;
select is((select managed_location_ids from public.employee_invitations where id = (select (result->>'invitation_id')::uuid from role_results where label='manager')),
  array['89000000-0000-4000-8000-000000000001']::uuid[], 'a manager manages the location named, not all locations');
select is((select managed_location_ids from public.employee_invitations where id = (select (result->>'invitation_id')::uuid from role_results where label='custom')),
  array['89000000-0000-4000-8000-000000000001']::uuid[], 'a custom manager too');
select is((select (managed_location_ids, management_role_id)::text from public.employee_invitations where id = (select (result->>'invitation_id')::uuid from role_results where label='admin')),
  (select ('{}'::uuid[], id)::text from invite_role_ids where system_key = 'admin'), 'an admin reaches every location by the role, naming none');
set local role service_role;
select lives_ok($$select public.accept_employee_invitation_service('19000000-0000-4000-8000-000000000005', encode(extensions.digest(result->>'token', 'sha256'), 'hex')) from role_results where label='manager'$$, 'manager accepts with no work location');
set local role postgres;
select is((select array_agg(x.location_id) from public.membership_managed_locations x join public.workspace_memberships m on m.id = x.membership_id
  where m.user_id='19000000-0000-4000-8000-000000000005'), array['89000000-0000-4000-8000-000000000001']::uuid[],
  'acceptance writes Manages as the invitation named it');
-- A management role chosen at the invitation lands in the management slot (ROL-CIFT).
select is((select role_id from public.workspace_memberships where user_id='19000000-0000-4000-8000-000000000005'),
  (select id from invite_role_ids where system_key = 'manager'), 'the Manager role lands in the management slot');
select is((select employee_role_id from public.workspace_memberships where user_id='19000000-0000-4000-8000-000000000005'),
  null, 'and, with no job outside Management, the employee slot stays empty');
set local role service_role;
-- A record with no location is in nobody's reach but admin and owner (M2), so
-- a manager does not open one (FB-6.2.4, review D6).
select throws_ok($$select public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000004', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000008', employee || '{"invitation_email":"create-manager-own@example.test"}', null) from create_fixture$$,
  '42501', null, 'a manager does not create a record with no location');
select throws_ok($$select public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000004', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000009', employee, jsonb_build_object('management_role_id', '59000000-0000-4000-8000-000000000001',
    'managed_location_ids', jsonb_build_array('89000000-0000-4000-8000-000000000001'))) from create_fixture$$,
  '42501', 'Not allowed', 'a manager who works nowhere creates nobody, whatever the role (M2)');
set local role postgres;
select ok(app_private.authz_reason('19000000-0000-4000-8000-000000000004', '29000000-0000-4000-8000-000000000001', 'employee.read',
  target_person => (select (result->>'id')::uuid from role_results where label='custom')) is not null,
  'creator exception does not expose another managers remote draft');
select * from finish();
rollback;
