begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('16100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee-counter-owner@example.test', '', '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values ('26100000-0000-4000-8000-000000000001', 'Employee Counter Workspace', '16100000-0000-4000-8000-000000000001');

insert into public.workspace_memberships (id, workspace_id, user_id, role, all_locations)
values ('36100000-0000-4000-8000-000000000001', '26100000-0000-4000-8000-000000000001', '16100000-0000-4000-8000-000000000001', 'owner', true);

insert into public.locations (id, workspace_id, name, street_address, city, region, postal_code, timezone)
values ('46100000-0000-4000-8000-000000000001', '26100000-0000-4000-8000-000000000001', 'Counter Location', '1 Counter St', 'Los Angeles', 'CA', '90001', 'America/Los_Angeles');

insert into public.departments (id, workspace_id, name)
values ('56100000-0000-4000-8000-000000000001', '26100000-0000-4000-8000-000000000001', 'Counter Department');

insert into public.jobs (id, workspace_id, department_id, name)
values ('66100000-0000-4000-8000-000000000001', '26100000-0000-4000-8000-000000000001', '56100000-0000-4000-8000-000000000001', 'Counter Job');

set local role authenticated;
select set_config('request.jwt.claim.sub', '16100000-0000-4000-8000-000000000001', true);

create temporary table employee_ids (label text primary key, id uuid not null);

insert into employee_ids values ('first', public.save_employee(
  '26100000-0000-4000-8000-000000000001', null, 'First', 'Employee', '', '',
  null, '', array['46100000-0000-4000-8000-000000000001']::uuid[],
  '46100000-0000-4000-8000-000000000001', array['66100000-0000-4000-8000-000000000001']::uuid[],
  '66100000-0000-4000-8000-000000000001', null
));
select is((select employee_code from public.employee_profiles where id = (select id from employee_ids where label = 'first')), 'E-0001', 'first employee receives initial generated code');

insert into employee_ids values ('second', public.save_employee(
  '26100000-0000-4000-8000-000000000001', null, 'Second', 'Employee', '', '',
  null, '', array['46100000-0000-4000-8000-000000000001']::uuid[],
  '46100000-0000-4000-8000-000000000001', array['66100000-0000-4000-8000-000000000001']::uuid[],
  '66100000-0000-4000-8000-000000000001', null
));
select is((select employee_code from public.employee_profiles where id = (select id from employee_ids where label = 'second')), 'E-0002', 'second employee receives next generated code');

set local role postgres;
update public.workspace_employee_counters
set next_value = 1
where workspace_id = '26100000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '16100000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$insert into employee_ids values ('third', public.save_employee(
    '26100000-0000-4000-8000-000000000001', null, 'Third', 'Employee', '', '',
    null, '', array['46100000-0000-4000-8000-000000000001']::uuid[],
    '46100000-0000-4000-8000-000000000001', array['66100000-0000-4000-8000-000000000001']::uuid[],
    '66100000-0000-4000-8000-000000000001', null
  ))$$,
  'employee creation survives a stale employee code counter'
);
select is((select employee_code from public.employee_profiles where id = (select id from employee_ids where label = 'third')), 'E-0003', 'stale counter is advanced beyond existing employee codes');

select * from finish();
rollback;
