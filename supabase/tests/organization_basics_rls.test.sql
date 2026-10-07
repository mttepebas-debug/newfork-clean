begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-org@example.test', '', '{}', '{}', now(), now()),
  ('11000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-org@example.test', '', '{}', '{}', now(), now()),
  ('11000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager-org@example.test', '', '{}', '{}', now(), now()),
  ('11000000-0000-4000-8000-000000000004', '00000000-0000-0000-8000-000000000000', 'authenticated', 'authenticated', 'scoped-org@example.test', '', '{}', '{}', now(), now()),
  ('11000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider-org@example.test', '', '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values
  ('21000000-0000-4000-8000-000000000001', 'Organization One', '11000000-0000-4000-8000-000000000001'),
  ('21000000-0000-4000-8000-000000000002', 'Organization Two', '11000000-0000-4000-8000-000000000001');

insert into public.workspace_memberships (id, workspace_id, user_id, role, all_locations)
values
  ('31000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'owner', true),
  ('31000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002', 'admin', true),
  ('31000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000003', 'manager', true),
  ('31000000-0000-4000-8000-000000000004', '21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000004', 'employee', false),
  ('31000000-0000-4000-8000-000000000005', '21000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000001', 'owner', true);

insert into public.locations (short_name, id, workspace_id, name, street_address, city, region, postal_code, timezone)
values
  ('T00025','41000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Downtown', '1 Main St', 'Los Angeles', 'CA', '90001', 'America/Los_Angeles'),
  ('T00026','41000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', 'Uptown', '2 Main St', 'Los Angeles', 'CA', '90002', 'America/Los_Angeles'),
  ('T00027','41000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000002', 'Other Tenant', '3 Main St', 'Seattle', 'WA', '98101', 'America/Los_Angeles');

insert into public.departments (id, workspace_id, name)
values
  ('51000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Kitchen'),
  ('51000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000001', 'Service'),
  ('51000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', 'Other Department');

insert into public.jobs (id, workspace_id, department_id, name)
values ('61000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'Line Cook');

insert into public.shift_labels (id, workspace_id, name)
values ('71000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Training');

select tests.works_at('31000000-0000-4000-8000-000000000004', '41000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select is((select count(*)::integer from public.locations), 3, 'owner sees locations in both memberships');
select is((select count(*)::integer from public.departments), 3, 'owner sees departments in both memberships');
select is((select count(*)::integer from public.jobs), 1, 'owner sees organization jobs');
select lives_ok($$update public.workspaces set name = 'Organization One Renamed' where id = '21000000-0000-4000-8000-000000000001'$$, 'owner can update organization identity');
select is((select count(*)::integer from public.audit_events where action = 'workspace.identity_updated'), 1, 'organization identity change is audited');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$insert into public.locations (short_name, workspace_id, name, street_address, city, region, postal_code, timezone)
    values ('T00028','21000000-0000-4000-8000-000000000001', 'Westside', '4 Main St', 'Los Angeles', 'CA', '90003', 'America/Los_Angeles')$$,
  'admin can create a location'
);
select lives_ok(
  $$insert into public.locations (short_name, workspace_id, name, street_address, city, region, postal_code, timezone)
    values ('T00029','21000000-0000-4000-8000-000000000001', 'Patio', '', '', '', '', 'America/Los_Angeles')$$,
  'admin can create a location without address details'
);
select is((select count(*)::integer from public.audit_events where action = 'location.created'), 2, 'location creation is audited');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$insert into public.departments (workspace_id, name) values ('21000000-0000-4000-8000-000000000001', 'Unauthorized')$$,
  '42501',
  'new row violates row-level security policy for table "departments"',
  'manager cannot create a department'
);

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000004', true);
select is((select count(*)::integer from public.locations), 1, 'location-scoped employee sees only assigned location');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000005', true);
select is((select count(*)::integer from public.locations), 0, 'outsider sees no locations');
select is((select count(*)::integer from public.departments), 0, 'outsider sees no departments');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$insert into public.jobs (workspace_id, department_id, name)
    values ('21000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000002', 'Cross Tenant Job')$$,
  '23503',
  null,
  'job cannot reference a department from another tenant'
);
select throws_ok(
  $$update public.departments set archived_at = now() where id = '51000000-0000-4000-8000-000000000001'$$,
  '23514',
  'archive active jobs before archiving their department',
  'department with active jobs cannot be archived'
);
select lives_ok(
  $$update public.jobs set archived_at = now() where id = '61000000-0000-4000-8000-000000000001';
    update public.departments set archived_at = now() where id = '51000000-0000-4000-8000-000000000001'$$,
  'department can be archived after its jobs'
);

-- A catalog row stays in its workspace (GUVENLIK-A GA-1): even the owner of
-- both organizations cannot move a row from one to the other.
select throws_ok(
  $$update public.shift_labels set workspace_id = '21000000-0000-4000-8000-000000000002' where id = '71000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'a shift label cannot move to another workspace, even for the owner of both'
);
select throws_ok(
  $$update public.departments set workspace_id = '21000000-0000-4000-8000-000000000001' where id = '51000000-0000-4000-8000-000000000002'$$,
  '42501',
  null,
  'an empty department cannot move to another workspace'
);
select throws_ok(
  $$update public.shift_labels set id = '71000000-0000-4000-8000-000000000002' where id = '71000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'a catalog row keeps its id'
);

-- One more row of each kind for the forms below, added here so the counts above
-- stay as they were.
reset role;
insert into public.departments (id, workspace_id, name)
values ('51000000-0000-4000-8000-000000000004', '21000000-0000-4000-8000-000000000001', 'Bar');
insert into public.jobs (id, workspace_id, department_id, name)
values ('61000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000003', 'Server');
insert into public.shift_types (id, workspace_id, name, default_start_time, default_end_time)
values ('81000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Lunch', '11:00', '15:00');
set local role authenticated;
select lives_ok(
  $$update public.shift_labels set name = 'On call', color = '#54736A', archived_at = now(), updated_at = now()
      where id = '71000000-0000-4000-8000-000000000001';
    update public.locations set name = 'Downtown LA', short_name = 'DTLA', street_address = '10 Main St', city = 'Los Angeles',
      region = 'CA', postal_code = '90001', country_code = 'US', timezone = 'America/Los_Angeles', phone = '+12135550100', updated_at = now()
      where id = '41000000-0000-4000-8000-000000000001';
    update public.departments set name = 'Front of house', color = '#54736A', updated_at = now()
      where id = '51000000-0000-4000-8000-000000000003';
    update public.jobs set name = 'Bartender', color = '#54736A', department_id = '51000000-0000-4000-8000-000000000004', updated_at = now()
      where id = '61000000-0000-4000-8000-000000000002';
    update public.shift_types set name = 'Long lunch', color = '#54736A', default_start_time = '10:30', default_end_time = '15:30', updated_at = now()
      where id = '81000000-0000-4000-8000-000000000001'$$,
  'the Settings forms still rename, edit and archive catalog rows'
);

select * from finish();
rollback;
