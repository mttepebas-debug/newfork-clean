begin;
create extension if not exists pgtap with schema extensions;
select plan(118);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('16000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee-owner@example.test', '', '{}', '{}', now(), now()),
  ('16000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee-manager@example.test', '', '{}', '{}', now(), now()),
  ('16000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee-outsider@example.test', '', '{}', '{}', now(), now()),
  ('16000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'linked-owner@example.test', '', '{}', '{}', now(), now()),
  ('16000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'new-employee@example.test', '', '{}', '{}', now(), now()),
  ('16000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'generic-accept@example.test', '', '{}', '{}', now(), now()),
  ('16000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'generic-decline@example.test', '', '{}', '{}', now(), now()),
  ('16000000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-invite@example.test', '', '{}', '{}', now(), now()),
  ('16000000-0000-4000-8000-000000000009', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'expired-invite@example.test', '', '{}', '{}', now(), now()),
  ('16000000-0000-4000-8000-000000000010', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'archive-linked@example.test', '', '{}', '{}', now(), now());
-- These accounts have confirmed their address; accepting an invitation asks for it (SEC-003).
update auth.users set email_confirmed_at = now() where id::text like '16000000-%' and email_confirmed_at is null;

insert into public.workspaces (id, name, created_by)
values
  ('26000000-0000-4000-8000-000000000001', 'Employee Workspace', '16000000-0000-4000-8000-000000000001'),
  ('26000000-0000-4000-8000-000000000002', 'Other Employee Workspace', '16000000-0000-4000-8000-000000000003');

insert into public.workspace_memberships (id, workspace_id, user_id, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
  ('36000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000001', 'owner', true),
  ('36000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000002', 'manager', false),
  ('36000000-0000-4000-8000-000000000003', '26000000-0000-4000-8000-000000000002', '16000000-0000-4000-8000-000000000003', 'owner', true),
  ('36000000-0000-4000-8000-000000000004', '26000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000004', 'owner', true)) as legacy(id, workspace_id, user_id, role, all_locations);

insert into public.locations (short_name, id, workspace_id, name, street_address, city, region, postal_code, timezone)
values
  ('T00012','46000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', 'Downtown', '1 Main St', 'Los Angeles', 'CA', '90001', 'America/Los_Angeles'),
  ('T00013','46000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000001', 'Uptown', '2 Main St', 'Los Angeles', 'CA', '90002', 'America/Los_Angeles');
insert into public.departments (id, workspace_id, name) values ('56000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', 'Service');
insert into public.jobs (id, workspace_id, department_id, name)
values ('66000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000001', 'Server');

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
select ok(public.workspace_has_permission('26000000-0000-4000-8000-000000000001', 'employees.read'), 'owner receives employee read');
select ok(public.workspace_has_permission('26000000-0000-4000-8000-000000000001', 'employee_access.manage'), 'owner receives employee access management');
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000002', true);
select ok(public.workspace_has_permission('26000000-0000-4000-8000-000000000001', 'employees.read'), 'manager receives employee read');
select ok(public.workspace_has_permission('26000000-0000-4000-8000-000000000001', 'employees.manage'), 'manager receives employee management');
-- A manager could already add, edit and invite; taking somebody off the roster
-- came with that in bl051_roles_permissions. It stays a narrow power: only over
-- plain employees, only inside their own locations, never themselves, and they
-- cannot give the access back afterwards — that needs employee_access.manage,
-- which is admin and owner only.
select ok(public.workspace_has_permission('26000000-0000-4000-8000-000000000001', 'employees.archive'), 'manager receives archive with the rest of employee management');

set local role service_role;
create temporary table employee_ids (label text primary key, id uuid not null);
grant select on employee_ids to service_role;
select lives_ok(
  $$insert into employee_ids values ('downtown', public.save_employee_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001', null, 'Ada', '', 'Lovelace', 'Ada', 'ada@example.test',
    '2026-08-20', 'Opening team', array['46000000-0000-4000-8000-000000000001']::uuid[],
    '46000000-0000-4000-8000-000000000001', array['66000000-0000-4000-8000-000000000001']::uuid[],
    '66000000-0000-4000-8000-000000000001', false, false, null
  ))$$,
  'owner creates an employee transactionally'
);
set local role postgres;
select is((select employee_code from public.employee_profiles where id = (select id from employee_ids where label = 'downtown')), 'E-0001', 'employee code is server generated');
-- Mona manages Downtown because she works there: a manager's locations are
-- their assignments (stage 4b), so her employee record comes before anything
-- she does as a manager.
insert into public.employee_profiles (
  id, workspace_id, user_id, employee_code, first_name, last_name, preferred_name,
  invitation_email, created_by
) values (
  '76000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000002',
  'E-0099', 'Mona', 'Manager', '',
  'employee-manager@example.test',
  '16000000-0000-4000-8000-000000000001'
);
insert into public.employee_location_assignments (
  workspace_id, employee_id, location_id, is_primary, created_by
) values (
  '26000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000001',
  '46000000-0000-4000-8000-000000000001',
  true,
  '16000000-0000-4000-8000-000000000001'
);
insert into public.employee_job_assignments (
  workspace_id, employee_id, job_id, is_primary, created_by
) values (
  '26000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000001',
  '66000000-0000-4000-8000-000000000001',
  true,
  '16000000-0000-4000-8000-000000000001'
);
-- Still dropped here, for a better reason than before. It used to be a check
-- constraint holding the column at the empty string because nothing had decided
-- who may set one. Now save_employee_service never writes it: a new record starts
-- empty and a later save keeps what is stored. A preferred name belongs to the
-- person whose name it is, and reaches the record through
-- request_employee_preferred_name_service and whatever answer the workspace has
-- chosen to give it.
select is(
  (select preferred_name from public.employee_profiles
   where id = (select id from employee_ids where label = 'downtown')),
  '',
  'a manager editing the record does not set somebody elses preferred name'
);
insert into public.employee_private_profiles (
  employee_id,
  workspace_id,
  legal_first_name,
  legal_last_name,
  phone,
  date_of_birth,
  emergency_contact_name,
  emergency_contact_relationship,
  emergency_contact_phone,
  emergency_contact_email,
  street_address,
  city,
  region,
  postal_code,
  country_code,
  share_phone_with_teammates,
  share_email_with_teammates
) values (
  (select id from employee_ids where label = 'downtown'),
  '26000000-0000-4000-8000-000000000001',
  'Ada',
  'Lovelace',
  '+13105559999',
  '1990-02-14',
  'Jamie Kim',
  'Sibling',
  '+13105550001',
  'jamie@example.test',
  '100 Main Street',
  'Los Angeles',
  'CA',
  '90012',
  'US',
  true,
  true
);
set local role service_role;
select is(
  (public.get_employee_detail_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001',
    (select id from employee_ids where label = 'downtown')
  )->'private_contact'->>'phone'),
  '+13105559999',
  'owner sees employee private contact in the drawer detail projection'
);
select is(
  (public.get_employee_detail_service(
    '16000000-0000-4000-8000-000000000002',
    '26000000-0000-4000-8000-000000000001',
    (select id from employee_ids where label = 'downtown')
  )->'private_contact'->>'emergency_contact_name'),
  null,
  'a manager sees the roster but not the private contact on it'
);
select is(
  concat_ws('|',
    public.get_employee_detail_service(
      '16000000-0000-4000-8000-000000000001',
      '26000000-0000-4000-8000-000000000001',
      (select id from employee_ids where label = 'downtown')
    )->'private_contact'->>'street_address',
    public.get_employee_detail_service(
      '16000000-0000-4000-8000-000000000001',
      '26000000-0000-4000-8000-000000000001',
      (select id from employee_ids where label = 'downtown')
    )->'private_contact'->>'city',
    public.get_employee_detail_service(
      '16000000-0000-4000-8000-000000000001',
      '26000000-0000-4000-8000-000000000001',
      (select id from employee_ids where label = 'downtown')
    )->'private_contact'->>'region',
    public.get_employee_detail_service(
      '16000000-0000-4000-8000-000000000001',
      '26000000-0000-4000-8000-000000000001',
      (select id from employee_ids where label = 'downtown')
    )->'private_contact'->>'postal_code',
    public.get_employee_detail_service(
      '16000000-0000-4000-8000-000000000001',
      '26000000-0000-4000-8000-000000000001',
      (select id from employee_ids where label = 'downtown')
    )->'private_contact'->>'country_code'
  ),
  '100 Main Street|Los Angeles|CA|90012|US',
  'owner sees onboarding address fields in the drawer detail projection'
);
select isnt(
  has_function_privilege('authenticated', 'public.get_member_avatar_service(uuid, uuid, uuid)', 'execute'),
  true,
  'authenticated users cannot execute the avatar lookup service function directly'
);
select isnt(
  has_function_privilege('authenticated', 'public.remove_member_photo_service(uuid, uuid, uuid)', 'execute'),
  true,
  'authenticated users cannot execute the photo removal service function directly'
);
-- Downtown has no account yet, so no avatar: the record reads no photo and has none to remove
-- (the avatar itself is member_avatars.test.sql's, AVATAR-IKON).
set local role service_role;
select is(
  public.get_member_avatar_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001',
    (select id from employee_ids where label = 'downtown')
  ),
  null,
  'owner reads no photo for somebody without an avatar through the service boundary'
);
select throws_ok(
  format($$select public.remove_member_photo_service(%L, %L, %L)$$,
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001',
    (select id from employee_ids where label = 'downtown')),
  'PT409',
  null,
  'there is no photo to remove'
);
set local role postgres;
select is(
  (
    select count(*)::integer
    from public.employee_events
    where employee_id = (select id from employee_ids where label = 'downtown')
      and action = 'employee.avatar_removed'
  ),
  0,
  'a removal that removed nothing is not in the record''s history'
);
set local role service_role;
select lives_ok(
  $$insert into employee_ids values ('uptown', public.save_employee_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001', null, 'Grace','', 'Hopper', '', '',
    null, '', array['46000000-0000-4000-8000-000000000002']::uuid[],
    '46000000-0000-4000-8000-000000000002', array['66000000-0000-4000-8000-000000000001']::uuid[],
    '66000000-0000-4000-8000-000000000001', false, false, null
  ))$$,
  'owner creates an employee outside manager scope'
);
select is((select count(*)::integer from public.list_employees_service('16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', false, '', 'all', 100, 0)), 3, 'owner lists every active employee, Mona the manager included');
select is((select count(*)::integer from public.list_employees_service('16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', false, 'Uptown', 'all', 100, 0)), 1, 'owner can search employees by primary location');
select is((select count(*)::integer from public.list_employees_service('16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', false, 'Server', 'all', 100, 0)), 3, 'owner can search employees by primary job');

set local role postgres;
create temporary table directory_role_ids (label text primary key, id uuid not null);
insert into directory_role_ids (label, id)
select system_key::text, id
from public.workspace_roles
where workspace_id = '26000000-0000-4000-8000-000000000001'
  and system_key is not null;
grant select on directory_role_ids to service_role;
set local role service_role;
select is((select count(*)::integer from public.list_employees_service('16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', false, '', 'all', 100, 0)), 3, 'owner lists linked manager employee profile');
select is((select count(*)::integer from public.list_employees_service('16000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000001', false, '', 'all', 100, 0)), 2, 'a location-scoped manager lists everyone at their location, a peer manager included (M2, KK-8)');
select is(
  (public.get_employee_detail_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000001'
  )->>'account_email'),
  'employee-manager@example.test',
  'owner sees linked account email in the drawer detail projection'
);
select is(
  public.get_employee_detail_service(
    '16000000-0000-4000-8000-000000000002',
    '26000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000001'
  ) #>> '{allowed,save}',
  'false',
  'a location-scoped manager opens a peer manager''s drawer read-only (KK-8)'
);
select throws_ok(
  $$select public.save_employee_service(
    '16000000-0000-4000-8000-000000000002',
    '26000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000001',
    'Mona','', 'Manager', '', 'employee-manager@example.test', null, '',
    array['46000000-0000-4000-8000-000000000001']::uuid[], '46000000-0000-4000-8000-000000000001',
    array['66000000-0000-4000-8000-000000000001']::uuid[], '66000000-0000-4000-8000-000000000001', false, false, 1
  )$$,
  '42501', 'Not allowed', 'manager cannot edit a linked manager employee drawer'
);
select lives_ok(
  $$select public.update_employee_membership_role_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000001',
    (select id from directory_role_ids where label = 'admin')
  )$$,
  'owner can promote a linked non-owner member to admin'
);
set local role postgres;
select is(
  (select coalesce((select r.access_class::text from public.workspace_roles r where r.id = role_id), 'employee') from public.workspace_memberships where user_id = '16000000-0000-4000-8000-000000000002' and workspace_id = '26000000-0000-4000-8000-000000000001'),
  'admin',
  'role update applies immediately to the workspace membership'
);
set local role service_role;
select throws_ok(
  $$select public.update_employee_membership_role_service(
    '16000000-0000-4000-8000-000000000002',
    '26000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000001',
    (select id from directory_role_ids where label = 'admin')
  )$$,
  '42501', 'Not allowed', 'admin cannot assign admin access'
);
select throws_ok(
  $$select public.update_employee_membership_role_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000001',
    (select id from directory_role_ids where label = 'owner')
  )$$,
  '42501', 'Not allowed', 'owner access cannot be assigned through drawer role change'
);
select throws_ok(
  $$select public.update_employee_membership_role_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001',
    (select id from employee_ids where label = 'downtown'),
    (select id from directory_role_ids where label = 'employee')
  )$$,
  '22023', 'employee has no linked workspace account', 'unlinked employee role is managed by invitation instead of role change'
);
set local role postgres;
select set_config('request.jwt.claim.sub', '', true);
update public.workspace_memberships
set role_id = (select id from directory_role_ids where label = 'manager')
where workspace_id = '26000000-0000-4000-8000-000000000001'
  and user_id = '16000000-0000-4000-8000-000000000002';
set local role service_role;
select throws_ok(
  $$select public.save_employee_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001', null,
    'No','', 'Assignment', '', '', null, '',
    '{}'::uuid[], null, '{}'::uuid[], null, false, false, null
  )$$,
  '22023', 'employee requires a location and job unless remote or excluded from schedule', 'non-remote scheduled employee requires location and job'
);
select lives_ok(
  $$insert into employee_ids values ('excluded', public.save_employee_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001', null,
    'Excluded','', 'Worker', '', '', null, '',
    '{}'::uuid[], null, '{}'::uuid[], null, false, true, null
  ))$$,
  'excluded employee can be saved without location or job'
);
select lives_ok(
  $$insert into employee_ids values ('remote', public.save_employee_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001', null,
    'Remote','', 'Worker', '', '', null, '',
    '{}'::uuid[], null, '{}'::uuid[], null, true, false, null
  ))$$,
  'remote employee can be saved without location or job'
);
select lives_ok(
  $$select public.save_employee_service(
    '16000000-0000-4000-8000-000000000002',
    '26000000-0000-4000-8000-000000000001', (select id from employee_ids where label = 'downtown'),
    'Ada','', 'Lovelace', 'Ada', 'ada@example.test', '2026-08-20', 'Updated note',
    array['46000000-0000-4000-8000-000000000001']::uuid[], '46000000-0000-4000-8000-000000000001',
    array['66000000-0000-4000-8000-000000000001']::uuid[], '66000000-0000-4000-8000-000000000001', false, false, 1
  )$$,
  'manager edits an employee inside location scope'
);
select throws_ok(
  $$select public.save_employee_service(
    '16000000-0000-4000-8000-000000000002',
    '26000000-0000-4000-8000-000000000001', (select id from employee_ids where label = 'downtown'),
    'Ada','', 'Lovelace', '', 'ada@example.test', '2026-08-20', 'Invalid scope move',
    array['46000000-0000-4000-8000-000000000002']::uuid[], '46000000-0000-4000-8000-000000000002',
    array['66000000-0000-4000-8000-000000000001']::uuid[], '66000000-0000-4000-8000-000000000001', false, false, 2
  )$$,
  '42501', 'Not allowed', 'manager cannot move an employee outside assigned location scope'
);
set local role postgres;
select is((select revision from public.employee_profiles where id = (select id from employee_ids where label = 'downtown')), 2, 'employee update increments revision');
set local role service_role;
select throws_ok(
  $$select public.save_employee_service(
    '16000000-0000-4000-8000-000000000002',
    '26000000-0000-4000-8000-000000000001', (select id from employee_ids where label = 'downtown'),
    'Ada','', 'Lovelace', 'Ada', 'ada@example.test', null, '',
    array['46000000-0000-4000-8000-000000000001']::uuid[], '46000000-0000-4000-8000-000000000001',
    array['66000000-0000-4000-8000-000000000001']::uuid[], '66000000-0000-4000-8000-000000000001', false, false, 1
  )$$,
  'PT409', 'employee revision conflict', 'stale employee update fails closed'
);
-- BL-958: the conflict answers PT409, never the 40001 PostgREST retries forever,
-- and names itself so the screen can tell it from other refusals.
set local role postgres;
create function pg_temp.refusal_of(statement text) returns text language plpgsql as $f$
declare state text; why text;
begin
  execute statement;
  return 'ok';
exception when others then
  get stacked diagnostics state = returned_sqlstate, why = pg_exception_hint;
  return state || ' ' || coalesce(why, '');
end;
$f$;
select is(pg_temp.refusal_of($q$select public.save_employee_service(
    '16000000-0000-4000-8000-000000000002',
    '26000000-0000-4000-8000-000000000001', (select id from employee_ids where label = 'downtown'),
    'Ada','', 'Lovelace', 'Ada', 'ada@example.test', null, '',
    array['46000000-0000-4000-8000-000000000001']::uuid[], '46000000-0000-4000-8000-000000000001',
    array['66000000-0000-4000-8000-000000000001']::uuid[], '66000000-0000-4000-8000-000000000001', false, false, 1
  )$q$), 'PT409 employee.revision_conflict',
  'BL-958: a stale employee save answers PT409 with the reason employee.revision_conflict');
set local role service_role;
select throws_ok(
  $$select public.set_employee_archived_service('16000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000001', (select id from employee_ids where label = 'downtown'), true, false)$$,
  '42501', 'Not allowed', 'a manager does not archive: ending employment and archiving are admin and owner (KARARLAR)'
);
-- Put it back: the rest of the suite works on this same record, and the point
-- above was the capability rather than the state it leaves behind.
set local role postgres;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
set local role service_role;
select public.set_employee_archived_service('16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', (select id from employee_ids where label = 'downtown'), false, false);
set local role postgres;
insert into public.employee_profiles (
  id, workspace_id, user_id, employee_code, first_name, last_name, preferred_name,
  invitation_email, created_by
) values (
  '76000000-0000-4000-8000-000000000004',
  '26000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000004',
  'E-0200', 'Linked', 'Owner', '',
  'linked-owner@example.test',
  '16000000-0000-4000-8000-000000000001'
);
insert into public.employee_location_assignments (
  workspace_id, employee_id, location_id, is_primary, created_by
) values (
  '26000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000004',
  '46000000-0000-4000-8000-000000000001',
  true,
  '16000000-0000-4000-8000-000000000001'
);
set local role service_role;
select throws_ok(
  $$select public.set_employee_archived_service('16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000004', true, false)$$,
  '42501', 'Not allowed', 'an owner cannot reach another owner''s record to archive it'
);
set local role postgres;
delete from public.employee_location_assignments where employee_id = '76000000-0000-4000-8000-000000000004';
delete from public.employee_profiles where id = '76000000-0000-4000-8000-000000000004';
set local role service_role;

select throws_ok($$select * from public.list_employees_service('16000000-0000-4000-8000-000000000003', '26000000-0000-4000-8000-000000000001', false, '', 'all', 100, 0)$$, '42501', null, 'other tenant cannot list employees');

select lives_ok($$select public.set_employee_archived_service('16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', (select id from employee_ids where label = 'uptown'), true, false)$$, 'owner archives an unlinked employee');
select is((select count(*)::integer from public.list_employees_service('16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', true, '', 'all', 100, 0)), 1, 'archived directory contains archived employee');
select lives_ok($$select public.set_employee_archived_service('16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', (select id from employee_ids where label = 'uptown'), false, false)$$, 'owner restores employee record without access side effect');
select is((select count(*)::integer from public.list_employees_service('16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', false, '', 'all', 100, 0)), 5, 'active directory contains restored, linked manager, remote and excluded profiles');

set local role service_role;
-- A manager invites an employee where they work (FB-6.2.5, BL-242).
select lives_ok(
  $$select public.prepare_employee_invitation_service(
    '16000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000001',
    (select id from employee_ids where label = 'downtown'), 'ada@example.test', null, repeat('a', 64), now() + interval '7 days'
  )$$,
  'a manager prepares an invitation for an employee at their location'
);
select lives_ok(
  $$select public.update_employee_membership_role_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000001',
    (select id from directory_role_ids where label = 'admin')
  )$$,
  'owner can promote the scoped manager fixture back to admin for admin write checks'
);
select lives_ok(
  $$select public.save_employee_service(
    '16000000-0000-4000-8000-000000000002',
    '26000000-0000-4000-8000-000000000001', (select id from employee_ids where label = 'excluded'),
    'Excluded','', 'Worker', '', '', null, 'Admin edited employee',
    '{}'::uuid[], null, '{}'::uuid[], null, false, true, 1
  )$$,
  'admin edits an employee-class record'
);
select lives_ok(
  $$select public.save_employee_service(
    '16000000-0000-4000-8000-000000000002',
    '26000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000001',
    'Mona','', 'Manager', '', 'employee-manager@example.test', null, '',
    array['46000000-0000-4000-8000-000000000001']::uuid[], '46000000-0000-4000-8000-000000000001',
    array['66000000-0000-4000-8000-000000000001']::uuid[], '66000000-0000-4000-8000-000000000001', false, false, 3
  )$$,
  'an admin saves their own record (user decision 2026-09-24; the manager fixture is an admin here)'
);
select lives_ok(
  $$select public.prepare_employee_invitation_service(
    '16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001',
    (select id from employee_ids where label = 'downtown'), 'ada@example.test', null, repeat('b', 64), now() + interval '7 days'
  )$$,
  'owner prepares a hashed invitation through service boundary'
);
set local role postgres;
select is((select count(*)::integer from public.employee_invitations where workspace_id = '26000000-0000-4000-8000-000000000001' and status = 'pending'), 1, 'one pending invitation is retained');
select is((select token_hash from public.employee_invitations where workspace_id = '26000000-0000-4000-8000-000000000001' and status = 'pending'), repeat('b', 64), 'only invitation hash is stored');
select is((select delivery_status from public.employee_invitations where workspace_id = '26000000-0000-4000-8000-000000000001' and status = 'pending'), 'pending', 'prepared invitation starts with pending delivery state');
create temporary table invitation_ids (label text primary key, id uuid not null);
insert into invitation_ids (label, id)
select 'delivery-failure', id
from public.employee_invitations
where token_hash = repeat('b', 64);
grant select on invitation_ids to service_role;
set local role service_role;
select lives_ok(
  $$select public.mark_employee_invitation_delivery_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001',
    (select id from invitation_ids where label = 'delivery-failure'),
    'failed',
    'smtp provider unavailable'
  )$$,
  'owner marks invitation delivery failure without revoking'
);
set local role postgres;
select is((select status::text from public.employee_invitations where token_hash = repeat('b', 64)), 'pending', 'delivery failure leaves invitation pending');
select is((select delivery_status from public.employee_invitations where token_hash = repeat('b', 64)), 'failed', 'delivery failure is tracked separately');
set local role service_role;
select lives_ok(
  $$select public.revoke_employee_invitation_service(
    '16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001',
    (select id from employee_ids where label = 'downtown')
  )$$,
  'owner revokes pending invitation'
);
set local role postgres;
select is((select status::text from public.employee_invitations where token_hash = repeat('b', 64)), 'revoked', 'revocation state is persisted');
set local role service_role;
select throws_ok(
  $$select public.accept_employee_invitation_service('16000000-0000-4000-8000-000000000001', repeat('b', 64))$$,
  'P0002', 'active invitation not found', 'revoked invitation cannot be accepted'
);

set local role service_role;
select lives_ok(
  $$select public.prepare_employee_invitation_service(
    '16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001',
    (select id from employee_ids where label = 'downtown'), 'new-employee@example.test', null, repeat('c', 64), now() + interval '7 days'
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
set local role postgres;
select is((select status::text from public.workspace_memberships where user_id = '16000000-0000-4000-8000-000000000005'), 'pending_activation', 'accepted invitation creates pending activation membership');
select is((select count(*)::integer from public.employee_onboarding_cases where employee_id = (select id from employee_ids where label = 'downtown')), 1, 'accepted token invitation creates employee onboarding case');
select is((select status::text from public.employee_invitations where token_hash = repeat('c', 64)), 'accepted', 'accepted invitation is single-use state');
set local role service_role;
select throws_ok(
  $$select public.accept_employee_invitation_service('16000000-0000-4000-8000-000000000005', repeat('c', 64))$$,
  'P0002', 'active invitation not found', 'accepted token invitation cannot be reused'
);
select lives_ok(
  $$insert into employee_ids values ('duplicate-existing-member', public.save_employee_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001', null, 'Duplicate','', 'Member', '', 'new-employee@example.test',
    null, '', array['46000000-0000-4000-8000-000000000001']::uuid[],
    '46000000-0000-4000-8000-000000000001', array['66000000-0000-4000-8000-000000000001']::uuid[],
    '66000000-0000-4000-8000-000000000001', false, false, null
  ))$$,
  'owner creates a second employee record for an already linked account edge case'
);
select lives_ok(
  $$select public.prepare_employee_invitation_service(
    '16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001',
    (select id from employee_ids where label = 'duplicate-existing-member'), 'new-employee@example.test', null, repeat('0', 64), now() + interval '7 days'
  )$$,
  'owner prepares a duplicate same-organization invite'
);
select throws_ok(
  $$select public.accept_employee_invitation_service('16000000-0000-4000-8000-000000000005', repeat('0', 64))$$,
  '23505', 'workspace membership already exists', 'same account cannot link twice in the same organization'
);
set local role postgres;
select is((select user_id from public.employee_profiles where id = (select id from employee_ids where label = 'duplicate-existing-member')), null, 'duplicate membership attempt leaves employee record unlinked');
select is((select status::text from public.employee_invitations where token_hash = repeat('0', 64)), 'pending', 'duplicate membership attempt leaves invitation pending for revoke or reissue');
set local role service_role;
select lives_ok(
  $$insert into employee_ids values ('expired-invite', public.save_employee_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001', null, 'Expired','', 'Invite', '', 'expired-invite@example.test',
    null, '', array['46000000-0000-4000-8000-000000000001']::uuid[],
    '46000000-0000-4000-8000-000000000001', array['66000000-0000-4000-8000-000000000001']::uuid[],
    '66000000-0000-4000-8000-000000000001', false, false, null
  ))$$,
  'owner creates an employee for expired invitation edge case'
);
select lives_ok(
  $$select public.prepare_employee_invitation_service(
    '16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001',
    (select id from employee_ids where label = 'expired-invite'), 'expired-invite@example.test', null, repeat('1', 64), now() + interval '7 days'
  )$$,
  'owner prepares an invitation that later expires'
);
set local role postgres;
update public.employee_invitations set expires_at = now() - interval '1 minute' where token_hash = repeat('1', 64);
set local role service_role;
select throws_ok(
  $$select public.accept_employee_invitation_service('16000000-0000-4000-8000-000000000009', repeat('1', 64))$$,
  'P0002', 'active invitation not found', 'expired invitation cannot be accepted'
);
set local role postgres;
select is((select user_id from public.employee_profiles where id = (select id from employee_ids where label = 'expired-invite')), null, 'expired invitation attempt leaves employee record unlinked');

select lives_ok(
  $$insert into employee_ids values ('generic-accept', public.save_employee_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001', null, 'Generic','', 'Accept', '', 'generic-accept@example.test',
    null, '', array['46000000-0000-4000-8000-000000000001']::uuid[],
    '46000000-0000-4000-8000-000000000001', array['66000000-0000-4000-8000-000000000001']::uuid[],
    '66000000-0000-4000-8000-000000000001', false, false, null
  ))$$,
  'owner creates a generic-signup accept employee'
);
select lives_ok(
  $$select public.prepare_employee_invitation_service(
    '16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001',
    (select id from employee_ids where label = 'generic-accept'), 'generic-accept@example.test', null, repeat('d', 64), now() + interval '7 days'
  )$$,
  'owner prepares invitation discoverable from generic signup'
);
select is((select count(*)::integer from public.list_pending_employee_invitations_for_account_service('16000000-0000-4000-8000-000000000006')), 1, 'generic signup finds matching pending invitation');
select ok(
  not exists (
    select 1
    from public.list_pending_employee_invitations_for_account_service('16000000-0000-4000-8000-000000000006') pending
    where row_to_json(pending)::text like '%Generic%'
  ),
  'generic pending invitation projection omits employee name'
);
select lives_ok(
  $$select public.accept_employee_invitation_by_id_service(
    '16000000-0000-4000-8000-000000000006',
    (select id from public.employee_invitations where token_hash = repeat('d', 64))
  )$$,
  'matching account accepts a pending invitation by id without the token'
);
select is((select count(*)::integer from public.employee_onboarding_cases where employee_id = (select id from employee_ids where label = 'generic-accept')), 1, 'accepted generic-signup invitation creates employee onboarding case');
select lives_ok(
  $$insert into employee_ids values ('generic-decline', public.save_employee_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001', null, 'Generic','', 'Decline', '', 'generic-decline@example.test',
    null, '', array['46000000-0000-4000-8000-000000000001']::uuid[],
    '46000000-0000-4000-8000-000000000001', array['66000000-0000-4000-8000-000000000001']::uuid[],
    '66000000-0000-4000-8000-000000000001', false, false, null
  ))$$,
  'owner creates a generic-signup decline employee'
);
select lives_ok(
  $$select public.prepare_employee_invitation_service(
    '16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001',
    (select id from employee_ids where label = 'generic-decline'), 'generic-decline@example.test', null, repeat('e', 64), now() + interval '7 days'
  )$$,
  'owner prepares invitation for decline'
);
select lives_ok(
  $$select public.decline_employee_invitation_service(
    '16000000-0000-4000-8000-000000000007',
    (select id from public.employee_invitations where token_hash = repeat('e', 64))
  )$$,
  'matching account declines a pending invitation by id'
);
select is((select status::text from public.employee_invitations where token_hash = repeat('e', 64)), 'declined', 'declined invitation is no longer pending');

select lives_ok(
  $$insert into employee_ids values ('admin-invite', public.save_employee_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001', null, 'Admin','', 'Invitee', '', 'admin-invite@example.test',
    null, '', array['46000000-0000-4000-8000-000000000001']::uuid[],
    '46000000-0000-4000-8000-000000000001', array['66000000-0000-4000-8000-000000000001']::uuid[],
    '66000000-0000-4000-8000-000000000001', false, false, null
  ))$$,
  'owner creates an admin-role invite employee'
);
select lives_ok(
  $$select public.prepare_employee_invitation_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001',
    (select id from employee_ids where label = 'admin-invite'),
    'admin-invite@example.test',
    (select id from public.workspace_roles where workspace_id = '26000000-0000-4000-8000-000000000001' and system_key = 'admin'),
    repeat('f', 64),
    now() + interval '7 days'
  )$$,
  'owner prepares admin-role invitation'
);
select lives_ok(
  $$select public.accept_employee_invitation_service('16000000-0000-4000-8000-000000000008', repeat('f', 64))$$,
  'admin-role invitee accepts invitation'
);
set local role postgres;
select is((select status::text from public.workspace_memberships where user_id = '16000000-0000-4000-8000-000000000008'), 'pending_activation', 'admin-role invitee remains pending until onboarding activation');
set local role service_role;
select throws_ok($$select * from public.list_employees_service('16000000-0000-4000-8000-000000000008', '26000000-0000-4000-8000-000000000001', false, '', 'all', 100, 0)$$, '42501', null, 'pending admin-role invitee has no privileged access before activation');
select throws_ok(
  $$select public.update_employee_membership_role_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001',
    (select id from employee_ids where label = 'admin-invite'),
    (select id from directory_role_ids where label = 'employee')
  )$$,
  'P0002', 'active workspace membership not found', 'pending onboarding role cannot be changed before activation'
);

set local role postgres;
delete from public.workspace_role_permissions
where role_id = (select id from public.workspace_roles where workspace_id = '26000000-0000-4000-8000-000000000001' and system_key = 'manager')
  and permission_key = 'employees.read';
select throws_ok(
  $$set constraints enforce_role_permission_dependencies_trigger immediate$$,
  '23514', 'permission set requires dependent read access', 'database enforces employee permission dependency'
);

set local role service_role;
select throws_ok(
  $$select public.save_employee_service('16000000-0000-4000-8000-000000000003', '26000000-0000-4000-8000-000000000001', null, 'Cross','', 'Tenant', '', '', null, '', '{}'::uuid[], null, '{}'::uuid[], null, false, false, null)$$,
  '42501', 'Not allowed', 'cross-tenant employee creation is denied'
);

set local role postgres;
select set_config('request.jwt.claim.sub', '', true);
insert into public.workspace_memberships (id, workspace_id, user_id, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(legacy.role_id::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(legacy.role_id::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values (
  '36000000-0000-4000-8000-000000000010',
  '26000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000010',
  'employee',
  (select id from directory_role_ids where label = 'employee'),
  false
)) as legacy(id, workspace_id, user_id, role, role_id, all_locations);
insert into public.employee_profiles (
  id, workspace_id, user_id, employee_code, first_name, last_name, preferred_name,
  invitation_email, created_by
) values (
  '76000000-0000-4000-8000-000000000010',
  '26000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000010',
  'E-0110', 'Archive', 'Linked', '',
  'archive-linked@example.test',
  '16000000-0000-4000-8000-000000000001'
);
insert into public.employee_location_assignments (
  workspace_id, employee_id, location_id, is_primary, created_by
) values (
  '26000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000010',
  '46000000-0000-4000-8000-000000000001',
  true,
  '16000000-0000-4000-8000-000000000001'
);
insert into public.employee_job_assignments (
  workspace_id, employee_id, job_id, is_primary, created_by
) values (
  '26000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000010',
  '66000000-0000-4000-8000-000000000001',
  true,
  '16000000-0000-4000-8000-000000000001'
);
insert into public.employee_private_profiles (
  employee_id,
  workspace_id,
  legal_first_name,
  legal_last_name,
  phone,
  date_of_birth,
  emergency_contact_name,
  emergency_contact_relationship,
  emergency_contact_phone,
  emergency_contact_email,
  share_phone_with_teammates,
  share_email_with_teammates
) values (
  '76000000-0000-4000-8000-000000000010',
  '26000000-0000-4000-8000-000000000001',
  'Archive',
  'Linked',
  '+13105550100',
  '1991-03-10',
  'Morgan Linked',
  'Friend',
  '+13105550101',
  'morgan@example.test',
  true,
  true
);
insert into public.employee_onboarding_cases (
  id, workspace_id, employee_id, membership_id, status, submitted_at, approved_at, approved_by
) values (
  '96000000-0000-4000-8000-000000000010',
  '26000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000010',
  '36000000-0000-4000-8000-000000000010',
  'approved',
  now() - interval '30 days',
  now() - interval '29 days',
  '16000000-0000-4000-8000-000000000001'
);
insert into public.employee_onboarding_requirements (
  id, workspace_id, case_id, employee_id, kind, title, description, required,
  blocks_activation, requires_review, sort_order, status, completed_at, source_snapshot
) values (
  '97000000-0000-4000-8000-000000000010',
  '26000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000010',
  '76000000-0000-4000-8000-000000000010',
  'profile',
  'Old profile',
  'Old completed profile requirement.',
  true,
  true,
  false,
  10,
  'completed',
  now() - interval '30 days',
  '{}'::jsonb
);
set local role service_role;
select is(
  (select count(*)::integer from public.list_my_workspaces_service('16000000-0000-4000-8000-000000000010')),
  1,
  'linked employee workspace is visible before archive'
);
select lives_ok(
  $$select public.set_employee_archived_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000010',
    true,
    false
  )$$,
  'owner archives linked employee access'
);
set local role postgres;
select is(
  (select status::text from public.workspace_memberships where id = '36000000-0000-4000-8000-000000000010'),
  'suspended',
  'linked employee archive suspends workspace membership'
);
set local role service_role;
select is(
  (select count(*)::integer from public.list_my_workspaces_service('16000000-0000-4000-8000-000000000010')),
  0,
  'archived linked employee workspace is removed from switcher projection'
);
select lives_ok(
  $$select public.set_employee_archived_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000010',
    false,
    false
  )$$,
  'owner restores archived employee record for rehire without restoring access'
);
set local role postgres;
select is((select user_id from public.employee_profiles where id = '76000000-0000-4000-8000-000000000010'), null, 'rehire restore detaches the previous linked account from the employee record');
set local role service_role;
-- It used to be hidden, and hiding it was the problem: somebody whose access
-- had been taken opened the app, found the workspace simply gone, and had
-- nothing to tell them whether it had closed, been put on hold, or stopped
-- being theirs. The list carries it now and says which of the three it was,
-- which is what JOIN-006 was for.
select is(
  (select count(*)::integer from public.list_my_workspaces_service('16000000-0000-4000-8000-000000000010')),
  1,
  'the old account still sees the workspace, so it can be told what happened to it'
);
select ok(
  (select access_removed from public.list_my_workspaces_service('16000000-0000-4000-8000-000000000010')),
  'and it says their access was taken rather than the workspace ending'
);
select lives_ok(
  $$select public.prepare_employee_invitation_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000010',
    'archive-linked@example.test',
    null,
    repeat('2', 64),
    now() + interval '7 days'
  )$$,
  'owner prepares a rehire invitation against the restored archived record'
);
select lives_ok(
  $$select public.accept_employee_invitation_service('16000000-0000-4000-8000-000000000010', repeat('2', 64))$$,
  'rehired employee accepts invitation with the same account'
);
set local role postgres;
select is((select count(*)::integer from public.workspace_memberships where workspace_id = '26000000-0000-4000-8000-000000000001' and user_id = '16000000-0000-4000-8000-000000000010'), 1, 'rehire reuses the existing workspace membership');
select is((select status::text from public.workspace_memberships where id = '36000000-0000-4000-8000-000000000010'), 'pending_activation', 'rehire acceptance returns the reused membership to pending activation');
select is((select status::text from public.employee_onboarding_cases where id = '96000000-0000-4000-8000-000000000010'), 'in_progress', 'rehire resets the existing onboarding case');
select is((select count(*)::integer from public.employee_onboarding_requirements where case_id = '96000000-0000-4000-8000-000000000010' and status = 'completed'), 0, 'rehire does not carry completed onboarding requirements forward');
select ok(not has_function_privilege('authenticated', 'public.remove_employee_access_service(uuid,uuid,uuid)', 'execute'), 'client cannot call access removal with a spoofed actor');
set local role service_role;
select throws_ok(
  $$select public.remove_employee_access_service(
    '16000000-0000-4000-8000-000000000002',
    '26000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000001'
  )$$,
  '42501', 'Not allowed', 'employee access removal cannot unlink the acting account'
);
select lives_ok(
  $$select public.remove_employee_access_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000010'
  )$$,
  'owner removes a linked employee account without archiving the employee'
);
set local role postgres;
select is((select status::text from public.workspace_memberships where id = '36000000-0000-4000-8000-000000000010'), 'suspended', 'access removal suspends the workspace membership');
select is((select user_id from public.employee_profiles where id = '76000000-0000-4000-8000-000000000010'), null, 'access removal detaches the account from the employee');
select is((select status::text from public.employee_onboarding_cases where id = '96000000-0000-4000-8000-000000000010'), 'cancelled', 'access removal cancels the linked onboarding case');
select is((select count(*)::integer from public.employee_events where employee_id = '76000000-0000-4000-8000-000000000010' and action = 'employee.access_removed'), 1, 'access removal is audited without deleting employee history');

set local role postgres;
update public.employee_profiles set user_id = '16000000-0000-4000-8000-000000000001' where id = (select id from employee_ids where label = 'downtown');
set local role service_role;
select throws_ok(
  $$select public.set_employee_archived_service('16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', (select id from employee_ids where label = 'downtown'), true, false)$$,
  '42501', 'Not allowed', 'a linked user cannot reach their own record to archive it'
);
set local role postgres;
select is((select count(*)::integer from public.employee_events where employee_id = (select id from employee_ids where label = 'downtown') and action in ('employee.created', 'employee.updated', 'employee.invited', 'employee.invitation_revoked')), 6, 'employee lifecycle changes are audited without private payloads');

-- BL-098: saving the rest of the record keeps the preferred name the person was given.
update public.employee_profiles set preferred_name = 'Addie'
where id = (select id from employee_ids where label = 'downtown');
create temporary table bl098_revision as
  select revision from public.employee_profiles where id = (select id from employee_ids where label = 'downtown');
grant select on bl098_revision to service_role;
set local role service_role;
select lives_ok(
  $$select public.save_employee_service(
    '16000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001', (select id from employee_ids where label = 'downtown'),
    'Ada', '', 'Lovelace', '', 'ada@example.test', '2026-08-20', 'Opening team',
    array['46000000-0000-4000-8000-000000000001']::uuid[], '46000000-0000-4000-8000-000000000001',
    array['66000000-0000-4000-8000-000000000001']::uuid[], '66000000-0000-4000-8000-000000000001',
    false, false,
    (select revision from bl098_revision)
  )$$,
  'owner saves the employee record again'
);
set local role postgres;
select is(
  (select preferred_name from public.employee_profiles where id = (select id from employee_ids where label = 'downtown')),
  'Addie',
  'saving the employee record keeps the approved preferred name'
);

select * from finish();
rollback;
