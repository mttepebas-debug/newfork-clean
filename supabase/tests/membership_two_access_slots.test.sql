begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- ROL-CIFT 1.1 (KARARLAR S-164 ... S-169; design §3, §4.2, §4.13, §5.1): a membership holds two
-- access slots. role_id is the management slot (a manager, admin or owner class role), employee_role_id
-- the employee slot (an employee class role); at least one is filled. What a manager manages and the
-- Management jobs of a management access live in two tables of their own.
--
-- ponytail: the people here are inserted by hand, as the database owner. Until the core and the test
-- world read the two slots (1.2, 1.4) the product's own entry points cannot make a member, and the
-- conversion of today's people (design §5.1) is proved by a rolled-back trial over the old world.

-- The shape ------------------------------------------------------------------------------------------
select hasnt_column('public', 'workspace_memberships', 'role', 'a membership has no single role any more');
select hasnt_column('public', 'workspace_memberships', 'all_locations', 'nor an all-locations flag: admins and owners reach every location by class');
select has_column('public', 'workspace_memberships', 'employee_role_id', 'a membership has an employee slot');
select col_is_null('public', 'workspace_memberships', 'role_id', 'the management slot may be empty');
select has_table('public', 'membership_managed_locations', 'what a manager manages has a table of its own');
select has_table('public', 'membership_management_jobs', 'the Management jobs of a management access have a table of their own');
select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
   where c.oid in ('public.membership_managed_locations'::regclass, 'public.membership_management_jobs'::regclass)),
  'both new tables keep row level security on'
);
select is(
  (select count(*)::int from pg_class c
   where c.oid in ('public.membership_managed_locations'::regclass, 'public.membership_management_jobs'::regclass)
     and (has_table_privilege('authenticated', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'INSERT')
       or has_table_privilege('anon', c.oid, 'SELECT'))),
  0,
  'the browser reaches neither table: reads and writes go through the services'
);
select hasnt_trigger('public', 'workspace_memberships', 'a_sync_membership_role_reference_trigger', 'nothing copies a role name next to the role any more');
select hasnt_trigger('public', 'workspace_memberships', 'b_enforce_role_location_scope', 'nothing sets all_locations any more');

-- A world by hand: owner Olcay, Kadikoy, Management (Manager, General Manager), Kitchen (Cook) -----
insert into auth.users (id, email, created_at) values
  ('c1100000-0000-4000-8000-000000000001', 'slots-owner@example.test', now()),
  ('c1100000-0000-4000-8000-000000000002', 'slots-mona@example.test', now()),
  ('c1100000-0000-4000-8000-000000000003', 'slots-dora@example.test', now()),
  ('c1100000-0000-4000-8000-000000000004', 'slots-ece@example.test', now()),
  ('c1100000-0000-4000-8000-000000000005', 'slots-ada@example.test', now()),
  ('c1100000-0000-4000-8000-000000000006', 'slots-nil@example.test', now());
insert into public.workspaces (id, name, created_by)
values ('c1100000-0000-4000-8000-000000000101', 'Two Slots', 'c1100000-0000-4000-8000-000000000001');
-- ponytail: locations, departments and jobs go in with triggers off. Their triggers still read the
-- dropped membership role (open_owner_records_to_new_entity and others, rewritten in 1.2 ... 1.4); the
-- rows here are complete without them. Triggers are back on before the first membership.
set local session_replication_role = replica;
insert into public.locations (id, workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
values ('c1100000-0000-4000-8000-000000000201', 'c1100000-0000-4000-8000-000000000101', 'Kadikoy', 'KDK',
        '1 Moda Cd', 'Istanbul', 'Istanbul', '34710', 'Europe/Istanbul');
insert into public.departments (id, workspace_id, name, system_key) values
  ('c1100000-0000-4000-8000-000000000301', 'c1100000-0000-4000-8000-000000000101', 'Management', 'management'),
  ('c1100000-0000-4000-8000-000000000302', 'c1100000-0000-4000-8000-000000000101', 'Kitchen', null);
insert into public.jobs (id, workspace_id, department_id, name, system_key) values
  ('c1100000-0000-4000-8000-000000000401', 'c1100000-0000-4000-8000-000000000101', 'c1100000-0000-4000-8000-000000000301', 'Owner', 'owner'),
  ('c1100000-0000-4000-8000-000000000402', 'c1100000-0000-4000-8000-000000000101', 'c1100000-0000-4000-8000-000000000301', 'General Manager', null),
  ('c1100000-0000-4000-8000-000000000403', 'c1100000-0000-4000-8000-000000000101', 'c1100000-0000-4000-8000-000000000302', 'Cook', null);

set local session_replication_role = origin;

create temporary table slot_role (key text primary key, id uuid not null);
insert into slot_role
select r.system_key::text, r.id from public.workspace_roles r
where r.workspace_id = 'c1100000-0000-4000-8000-000000000101' and r.system_key is not null;

-- Olcay owns it; Mona manages only; Dora manages and works; Ece only works; Ada is an admin.
insert into public.workspace_memberships (id, workspace_id, user_id, role_id, employee_role_id, status) values
  ('c1100000-0000-4000-8000-000000000501', 'c1100000-0000-4000-8000-000000000101', 'c1100000-0000-4000-8000-000000000001',
   (select id from slot_role where key = 'owner'), null, 'active'),
  ('c1100000-0000-4000-8000-000000000502', 'c1100000-0000-4000-8000-000000000101', 'c1100000-0000-4000-8000-000000000002',
   (select id from slot_role where key = 'manager'), null, 'active'),
  ('c1100000-0000-4000-8000-000000000503', 'c1100000-0000-4000-8000-000000000101', 'c1100000-0000-4000-8000-000000000003',
   (select id from slot_role where key = 'manager'), (select id from slot_role where key = 'employee'), 'active'),
  ('c1100000-0000-4000-8000-000000000504', 'c1100000-0000-4000-8000-000000000101', 'c1100000-0000-4000-8000-000000000004',
   null, (select id from slot_role where key = 'employee'), 'active'),
  ('c1100000-0000-4000-8000-000000000505', 'c1100000-0000-4000-8000-000000000101', 'c1100000-0000-4000-8000-000000000005',
   (select id from slot_role where key = 'admin'), null, 'active');

-- The slots ------------------------------------------------------------------------------------------
select throws_ok(
  $q$insert into public.workspace_memberships (workspace_id, user_id, role_id, employee_role_id, status)
     values ('c1100000-0000-4000-8000-000000000101', 'c1100000-0000-4000-8000-000000000006', null, null, 'active')$q$,
  '23514', 'new row for relation "workspace_memberships" violates check constraint "workspace_memberships_holds_an_access"',
  'a membership with both slots empty is refused'
);
select throws_ok(
  $q$insert into public.workspace_memberships (workspace_id, user_id, role_id, employee_role_id, status)
     values ('c1100000-0000-4000-8000-000000000101', 'c1100000-0000-4000-8000-000000000006', null,
             (select id from slot_role where key = 'manager'), 'active')$q$,
  '23514', 'the employee slot holds an employee class role',
  'a manager class role in the employee slot is refused'
);
select throws_ok(
  $q$insert into public.workspace_memberships (workspace_id, user_id, role_id, employee_role_id, status)
     values ('c1100000-0000-4000-8000-000000000101', 'c1100000-0000-4000-8000-000000000006',
             (select id from slot_role where key = 'employee'), null, 'active')$q$,
  '23514', 'the management slot holds a manager, admin or owner class role',
  'an employee class role in the management slot is refused'
);
select throws_ok(
  $q$update public.workspace_roles set access_class = 'manager'
     where id = (select id from slot_role where key = 'employee')$q$,
  '23514', 'a role somebody holds keeps its class',
  'a role somebody holds keeps its class, so no slot ends up with the wrong kind of role'
);

-- Manages --------------------------------------------------------------------------------------------
select lives_ok(
  $q$insert into public.membership_managed_locations (workspace_id, membership_id, location_id, created_by)
     values ('c1100000-0000-4000-8000-000000000101', 'c1100000-0000-4000-8000-000000000502',
             'c1100000-0000-4000-8000-000000000201', 'c1100000-0000-4000-8000-000000000001')$q$,
  'Mona, a manager, manages Kadikoy'
);
select throws_ok(
  $q$insert into public.membership_managed_locations (workspace_id, membership_id, location_id, created_by)
     values ('c1100000-0000-4000-8000-000000000101', 'c1100000-0000-4000-8000-000000000505',
             'c1100000-0000-4000-8000-000000000201', 'c1100000-0000-4000-8000-000000000001')$q$,
  '23514', 'only a manager has Manages; admins and owners manage every location',
  'an admin gets no Manages row'
);
select throws_ok(
  $q$insert into public.membership_managed_locations (workspace_id, membership_id, location_id, created_by)
     values ('c1100000-0000-4000-8000-000000000101', 'c1100000-0000-4000-8000-000000000504',
             'c1100000-0000-4000-8000-000000000201', 'c1100000-0000-4000-8000-000000000001')$q$,
  '23514', 'only a manager has Manages; admins and owners manage every location',
  'nor does somebody who only works here'
);
select throws_ok(
  $q$insert into public.membership_managed_locations (workspace_id, membership_id, location_id, created_by)
     values ('c1100000-0000-4000-8000-000000000101', 'c1100000-0000-4000-8000-000000000502',
             'c1100000-0000-4000-8000-000000000201', 'c1100000-0000-4000-8000-000000000001')$q$,
  '23505', null,
  'a location is managed once per membership'
);

-- Management jobs ------------------------------------------------------------------------------------
select lives_ok(
  $q$insert into public.membership_management_jobs (workspace_id, membership_id, job_id, created_by)
     values ('c1100000-0000-4000-8000-000000000101', 'c1100000-0000-4000-8000-000000000502',
             'c1100000-0000-4000-8000-000000000402', 'c1100000-0000-4000-8000-000000000001')$q$,
  'Mona holds General Manager on the management side'
);
select throws_ok(
  $q$insert into public.membership_management_jobs (workspace_id, membership_id, job_id, created_by)
     values ('c1100000-0000-4000-8000-000000000101', 'c1100000-0000-4000-8000-000000000503',
             'c1100000-0000-4000-8000-000000000403', 'c1100000-0000-4000-8000-000000000001')$q$,
  '23514', 'a management job is a job of the Management department',
  'Cook, a Kitchen job, is no management job'
);
select throws_ok(
  $q$insert into public.membership_management_jobs (workspace_id, membership_id, job_id, created_by)
     values ('c1100000-0000-4000-8000-000000000101', 'c1100000-0000-4000-8000-000000000504',
             'c1100000-0000-4000-8000-000000000402', 'c1100000-0000-4000-8000-000000000001')$q$,
  '23514', 'a management job needs a management access',
  'Ece, who only works here, holds no management job'
);
select throws_ok(
  $q$insert into public.membership_management_jobs (workspace_id, membership_id, job_id, created_by)
     values ('c1100000-0000-4000-8000-000000000101', 'c1100000-0000-4000-8000-000000000503',
             'c1100000-0000-4000-8000-000000000401', 'c1100000-0000-4000-8000-000000000001')$q$,
  '23514', 'the Owner job belongs to the owner',
  'a manager does not hold the Owner job'
);

-- The rows follow the management slot ----------------------------------------------------------------
update public.workspace_memberships set role_id = (select id from slot_role where key = 'admin')
where id = 'c1100000-0000-4000-8000-000000000502';
select is(
  (select count(*)::int from public.membership_managed_locations where membership_id = 'c1100000-0000-4000-8000-000000000502'),
  0,
  'Mona made an admin manages every location, so her Manages rows go'
);
select is(
  (select count(*)::int from public.membership_management_jobs where membership_id = 'c1100000-0000-4000-8000-000000000502'),
  1,
  'and she keeps her General Manager job'
);
update public.workspace_memberships
set role_id = null, employee_role_id = (select id from slot_role where key = 'employee')
where id = 'c1100000-0000-4000-8000-000000000502';
select is(
  (select count(*)::int from public.membership_management_jobs where membership_id = 'c1100000-0000-4000-8000-000000000502'),
  0,
  'giving up the management access drops its Management job (design §4.13)'
);

select * from finish();
rollback;
