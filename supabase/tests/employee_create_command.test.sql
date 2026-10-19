begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

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

create temporary table create_fixture (employee jsonb, employee_role uuid, owner_role uuid, result jsonb);
insert into create_fixture
select '{"first_name":"Ada","middle_name":"Byron","last_name":"Lovelace","preferred_name":"","invitation_email":"create-remote@example.test","start_date":"","internal_note":"","location_ids":[],"primary_location_id":null,"job_ids":[],"primary_job_id":null,"is_remote":true,"is_excluded_from_schedule":false,"expected_revision":null}'::jsonb,
  (select id from public.workspace_roles where workspace_id = '29000000-0000-4000-8000-000000000001' and system_key = 'employee'),
  (select id from public.workspace_roles where workspace_id = '29000000-0000-4000-8000-000000000001' and system_key = 'owner'), null;
grant all on create_fixture to service_role;
set local role service_role;
select lives_ok($$update create_fixture set result = public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000001', employee, employee_role)$$, 'remote create and invitation need no assignments');
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
  '39000000-0000-4000-8000-000000000001', employee, employee_role) from create_fixture),
  (select result from create_fixture), 'same command returns same employee invitation and token');
select throws_ok($$select public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000001', employee || '{"last_name":"Changed"}', employee_role) from create_fixture$$,
  'PT409', 'idempotency key belongs to different employee details', 'changed payload cannot reuse command');
select throws_ok($$select public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000003', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000001', employee, employee_role) from create_fixture$$,
  '42501', 'Not allowed', 'outsider cannot create or replay');
select throws_ok($$select public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000002', employee, owner_role) from create_fixture$$,
  '42501', 'Not allowed', 'invalid invite role rolls back the create');
select throws_ok($$select public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000003', employee || '{"is_remote":false}', null) from create_fixture$$,
  '22023', 'employee requires a location and job unless remote or excluded from schedule', 'normal mode still requires assignments');
set local role postgres;
select is((select count(*)::integer from public.employee_profiles where workspace_id = '29000000-0000-4000-8000-000000000001'), 1, 'retries and rejected invitation leave exactly one employee');
select is((select count(*)::integer from public.employee_invitations where workspace_id = '29000000-0000-4000-8000-000000000001'), 1, 'exactly one invitation');
select is((select count(*)::integer from public.employee_location_assignments where workspace_id = '29000000-0000-4000-8000-000000000001'), 0, 'no manufactured locations');
select is((select role_id from public.employee_invitations where id = (select (result->>'invitation_id')::uuid from create_fixture)), (select employee_role from create_fixture), 'chosen role stored');
set local role service_role;
select lives_ok($$select public.mark_employee_invitation_delivery_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  (result->>'invitation_id')::uuid, 'failed', 'Test delivery failure') from create_fixture$$, 'delivery failure is recoverable');
select is((select public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000001', employee, employee_role)->>'delivery_status' from create_fixture), 'failed', 'retry finds delivery status without recreating');
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
  'remote employee accepts invitation without a location');
set local role postgres;
select is((select count(*)::integer from public.employee_invitation_delivery_secrets where invitation_id = (select (result->>'invitation_id')::uuid from create_fixture)), 0, 'acceptance removes the recoverable delivery token');
set local role service_role;
select lives_ok($$select public.initialize_employee_onboarding_service('19000000-0000-4000-8000-000000000002')$$,
  'remote employee initializes onboarding without a location');
select lives_ok($$select public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000004', employee || '{"is_remote":false,"is_excluded_from_schedule":true,"invitation_email":""}', null) from create_fixture$$,
  'excluded employee saves without email or assignments');
set local role postgres;
select is((select coalesce(role_id, employee_role_id) from public.workspace_memberships where user_id = '19000000-0000-4000-8000-000000000002'), (select employee_role from create_fixture), 'accepted role matches selection');
select ok(not has_table_privilege('authenticated', 'public.employee_create_commands', 'select'), 'recovery token state is not client readable');
select ok(not has_function_privilege('authenticated', 'public.create_employee_command_service(uuid,uuid,uuid,jsonb,uuid)', 'execute'), 'client cannot spoof a service actor');
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
create temporary table role_results (label text, result jsonb);
grant all on role_results to service_role;
create temporary table invite_role_ids as select id, system_key from public.workspace_roles where workspace_id = '29000000-0000-4000-8000-000000000001';
grant select on invite_role_ids to service_role;
set local role service_role;
select lives_ok($$insert into role_results select 'manager', public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000005', employee || '{"invitation_email":"create-manager-invite@example.test"}',
  (select id from invite_role_ids where system_key = 'manager')) from create_fixture$$,
  'manager role invitation supports zero locations');
select lives_ok($$insert into role_results select 'custom', public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000006', employee || '{"invitation_email":"create-custom@example.test"}',
  '59000000-0000-4000-8000-000000000001') from create_fixture$$, 'custom role invitation supports zero locations');
select lives_ok($$insert into role_results select 'admin', public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000007', employee || '{"invitation_email":"create-admin@example.test"}',
  (select id from invite_role_ids where system_key = 'admin')) from create_fixture$$,
  'owner can invite admin without employee locations');
set local role postgres;
select is((select all_locations from public.employee_invitations where id = (select (result->>'invitation_id')::uuid from role_results where label='manager')), false, 'manager does not gain all locations');
select is((select all_locations from public.employee_invitations where id = (select (result->>'invitation_id')::uuid from role_results where label='custom')), false, 'custom manager does not gain all locations');
select is((select all_locations from public.employee_invitations where id = (select (result->>'invitation_id')::uuid from role_results where label='admin')), true, 'admin uses existing role-wide access contract');
set local role service_role;
select lives_ok($$select public.accept_employee_invitation_service('19000000-0000-4000-8000-000000000005', encode(extensions.digest(result->>'token', 'sha256'), 'hex')) from role_results where label='manager'$$, 'manager accepts empty location scope');
set local role postgres;
select is((select count(*)::integer from public.membership_managed_locations x join public.workspace_memberships m on m.id = x.membership_id
  where m.user_id='19000000-0000-4000-8000-000000000005'), 0, 'acceptance preserves empty managed scope');
set local role service_role;
-- A record with no location is in nobody's reach but admin and owner (M2), so
-- a manager does not open one (FB-6.2.4, review D6).
select throws_ok($$select public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000004', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000008', employee || '{"invitation_email":"create-manager-own@example.test"}', null) from create_fixture$$,
  '42501', null, 'a manager does not create a record with no location');
select throws_ok($$select public.create_employee_command_service(
  '19000000-0000-4000-8000-000000000004', '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000009', employee, '59000000-0000-4000-8000-000000000001') from create_fixture$$,
  '42501', 'Not allowed', 'a manager who works nowhere creates nobody, whatever the role (M2)');
set local role postgres;
select ok(app_private.authz_reason('19000000-0000-4000-8000-000000000004', '29000000-0000-4000-8000-000000000001', 'employee.read',
  target_person => (select (result->>'id')::uuid from role_results where label='custom')) is not null,
  'creator exception does not expose another managers remote draft');
select * from finish();
rollback;
