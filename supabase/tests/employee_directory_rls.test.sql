begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('16000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee-owner@example.test', '', '{}', '{}', now(), now()),
  ('16000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee-manager@example.test', '', '{}', '{}', now(), now()),
  ('16000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee-outsider@example.test', '', '{}', '{}', now(), now()),
  ('16000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'linked-owner@example.test', '', '{}', '{}', now(), now()),
  ('16000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'new-employee@example.test', '', '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values
  ('26000000-0000-4000-8000-000000000001', 'Employee Workspace', '16000000-0000-4000-8000-000000000001'),
  ('26000000-0000-4000-8000-000000000002', 'Other Employee Workspace', '16000000-0000-4000-8000-000000000003');

insert into public.workspace_memberships (id, workspace_id, user_id, role, all_locations)
values
  ('36000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000001', 'owner', true),
  ('36000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000002', 'manager', false),
  ('36000000-0000-4000-8000-000000000003', '26000000-0000-4000-8000-000000000002', '16000000-0000-4000-8000-000000000003', 'owner', true),
  ('36000000-0000-4000-8000-000000000004', '26000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000004', 'owner', true);

insert into public.locations (id, workspace_id, name, street_address, city, region, postal_code, timezone)
values
  ('46000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', 'Downtown', '1 Main St', 'Los Angeles', 'CA', '90001', 'America/Los_Angeles'),
  ('46000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000001', 'Uptown', '2 Main St', 'Los Angeles', 'CA', '90002', 'America/Los_Angeles');
insert into public.departments (id, workspace_id, name) values ('56000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', 'Service');
insert into public.jobs (id, workspace_id, department_id, name)
values ('66000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000001', 'Server');
insert into public.membership_location_scopes (membership_id, workspace_id, location_id)
values ('36000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000001', '46000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
select ok(public.workspace_has_permission('26000000-0000-4000-8000-000000000001', 'employees.read'), 'owner receives employee read');
select ok(public.workspace_has_permission('26000000-0000-4000-8000-000000000001', 'employee_access.manage'), 'owner receives employee access management');
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000002', true);
select ok(public.workspace_has_permission('26000000-0000-4000-8000-000000000001', 'employees.read'), 'manager receives employee read');
select ok(public.workspace_has_permission('26000000-0000-4000-8000-000000000001', 'employees.manage'), 'manager receives employee management');
select isnt(public.workspace_has_permission('26000000-0000-4000-8000-000000000001', 'employees.archive'), true, 'manager does not receive archive by default');

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
create temporary table employee_ids (label text primary key, id uuid not null);
grant select on employee_ids to service_role;
select lives_ok(
  $$insert into employee_ids values ('downtown', public.save_employee(
    '26000000-0000-4000-8000-000000000001', null, 'Ada', 'Lovelace', 'Ada', 'ada@example.test',
    '2026-08-20', 'Opening team', array['46000000-0000-4000-8000-000000000001']::uuid[],
    '46000000-0000-4000-8000-000000000001', array['66000000-0000-4000-8000-000000000001']::uuid[],
    '66000000-0000-4000-8000-000000000001', null
  ))$$,
  'owner creates an employee transactionally'
);
select is((select employee_code from public.employee_profiles where id = (select id from employee_ids where label = 'downtown')), 'E-0001', 'employee code is server generated');
select lives_ok(
  $$insert into employee_ids values ('uptown', public.save_employee(
    '26000000-0000-4000-8000-000000000001', null, 'Grace', 'Hopper', '', '',
    null, '', array['46000000-0000-4000-8000-000000000002']::uuid[],
    '46000000-0000-4000-8000-000000000002', array['66000000-0000-4000-8000-000000000001']::uuid[],
    '66000000-0000-4000-8000-000000000001', null
  ))$$,
  'owner creates an employee outside manager scope'
);
select is((select count(*)::integer from public.list_employees('26000000-0000-4000-8000-000000000001', false, '', 'all', 100, 0)), 2, 'owner lists both active employees');

select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.list_employees('26000000-0000-4000-8000-000000000001', false, '', 'all', 100, 0)), 1, 'location-scoped manager lists only assigned employee');
select lives_ok(
  $$select public.save_employee(
    '26000000-0000-4000-8000-000000000001', (select id from employee_ids where label = 'downtown'),
    'Ada', 'Lovelace', 'Ada', 'ada@example.test', '2026-08-20', 'Updated note',
    array['46000000-0000-4000-8000-000000000001']::uuid[], '46000000-0000-4000-8000-000000000001',
    array['66000000-0000-4000-8000-000000000001']::uuid[], '66000000-0000-4000-8000-000000000001', 1
  )$$,
  'manager edits an employee inside location scope'
);
select is((select revision from public.employee_profiles where id = (select id from employee_ids where label = 'downtown')), 2, 'employee update increments revision');
select throws_ok(
  $$select public.save_employee(
    '26000000-0000-4000-8000-000000000001', (select id from employee_ids where label = 'downtown'),
    'Ada', 'Lovelace', 'Ada', 'ada@example.test', null, '',
    array['46000000-0000-4000-8000-000000000001']::uuid[], '46000000-0000-4000-8000-000000000001',
    array['66000000-0000-4000-8000-000000000001']::uuid[], '66000000-0000-4000-8000-000000000001', 1
  )$$,
  '40001', 'employee revision conflict', 'stale employee update fails closed'
);
select throws_ok(
  $$select public.set_employee_archived('26000000-0000-4000-8000-000000000001', (select id from employee_ids where label = 'downtown'), true, false)$$,
  '42501', 'employee archive access required', 'manager cannot archive by default'
);

select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000003', true);
select is((select count(*)::integer from public.list_employees('26000000-0000-4000-8000-000000000001', false, '', 'all', 100, 0)), 0, 'other tenant cannot list employees');

select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.set_employee_archived('26000000-0000-4000-8000-000000000001', (select id from employee_ids where label = 'uptown'), true, false)$$, 'owner archives an unlinked employee');
select is((select count(*)::integer from public.list_employees('26000000-0000-4000-8000-000000000001', true, '', 'all', 100, 0)), 1, 'archived directory contains archived employee');
select lives_ok($$select public.set_employee_archived('26000000-0000-4000-8000-000000000001', (select id from employee_ids where label = 'uptown'), false, false)$$, 'owner restores employee record without access side effect');
select is((select count(*)::integer from public.list_employees('26000000-0000-4000-8000-000000000001', false, '', 'all', 100, 0)), 2, 'active directory contains restored employee');

set local role service_role;
select throws_ok(
  $$select public.prepare_employee_invitation_service(
    '16000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000001',
    (select id from employee_ids where label = 'downtown'), 'ada@example.test', repeat('a', 64), now() + interval '7 days'
  )$$,
  '42501', 'employee access management required', 'manager cannot prepare invitations through service boundary'
);
select lives_ok(
  $$select public.prepare_employee_invitation_service(
    '16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001',
    (select id from employee_ids where label = 'downtown'), 'ada@example.test', repeat('b', 64), now() + interval '7 days'
  )$$,
  'owner prepares a hashed invitation through service boundary'
);
set local role postgres;
select is((select count(*)::integer from public.employee_invitations where status = 'pending'), 1, 'one pending invitation is retained');
select is((select token_hash from public.employee_invitations where status = 'pending'), repeat('b', 64), 'only invitation hash is stored');
set local role service_role;
select lives_ok(
  $$select public.revoke_employee_invitation_service(
    '16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001',
    (select id from employee_ids where label = 'downtown')
  )$$,
  'owner revokes pending invitation'
);
set local role postgres;
select is((select status::text from public.employee_invitations), 'revoked', 'revocation state is persisted');

select lives_ok(
  $$select public.prepare_employee_invitation_service(
    '16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001',
    (select id from employee_ids where label = 'downtown'), 'new-employee@example.test', repeat('c', 64), now() + interval '7 days'
  )$$,
  'owner prepares invitation for account acceptance'
);
select throws_ok(
  $$select public.accept_employee_invitation_service('16000000-0000-4000-8000-000000000004', repeat('c', 64))$$,
  '42501', 'invitation email does not match authenticated account', 'acceptance rejects a different account email'
);
select lives_ok(
  $$select public.accept_employee_invitation_service('16000000-0000-4000-8000-000000000005', repeat('c', 64))$$,
  'matching authenticated account accepts invitation'
);
select is((select status::text from public.workspace_memberships where user_id = '16000000-0000-4000-8000-000000000005'), 'pending_activation', 'accepted invitation creates pending activation membership');
select is((select status::text from public.employee_invitations where token_hash = repeat('c', 64)), 'accepted', 'accepted invitation is single-use state');

delete from public.workspace_role_permissions
where role_id = (select id from public.workspace_roles where workspace_id = '26000000-0000-4000-8000-000000000001' and system_key = 'manager')
  and permission_key = 'employees.read';
select throws_ok(
  $$set constraints enforce_role_permission_dependencies_trigger immediate$$,
  '23514', 'employee management requires employees.read', 'database enforces employee permission dependency'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.save_employee('26000000-0000-4000-8000-000000000001', null, 'Cross', 'Tenant', '', '', null, '', '{}'::uuid[], null, '{}'::uuid[], null, null)$$,
  '42501', 'employee management access required', 'cross-tenant employee creation is denied'
);

set local role postgres;
update public.employee_profiles set user_id = '16000000-0000-4000-8000-000000000001' where id = (select id from employee_ids where label = 'downtown');
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.set_employee_archived('26000000-0000-4000-8000-000000000001', (select id from employee_ids where label = 'downtown'), true, false)$$,
  '42501', 'self archive is not permitted', 'linked user cannot archive their own employee record'
);
select is((select count(*)::integer from public.employee_events where employee_id = (select id from employee_ids where label = 'downtown') and action in ('employee.created', 'employee.updated', 'employee.invited', 'employee.invitation_revoked')), 5, 'employee lifecycle changes are audited without private payloads');

select * from finish();
rollback;
