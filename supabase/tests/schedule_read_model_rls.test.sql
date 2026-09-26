begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('31000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'schedule-owner@example.test', '', '{}', '{}', now(), now()),
  ('31000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'schedule-manager@example.test', '', '{}', '{}', now(), now()),
  ('31000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'schedule-employee@example.test', '', '{}', '{}', now(), now()),
  ('31000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'schedule-outsider@example.test', '', '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values
  ('32000000-0000-4000-8000-000000000001', 'Schedule Workspace', '31000000-0000-4000-8000-000000000001'),
  ('32000000-0000-4000-8000-000000000002', 'Outside Workspace', '31000000-0000-4000-8000-000000000004');

insert into public.workspace_memberships (id, workspace_id, user_id, role, status, all_locations)
values
  ('33000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'owner', 'active', true),
  ('33000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002', 'manager', 'active', false),
  ('33000000-0000-4000-8000-000000000003', '32000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000003', 'employee', 'active', true),
  ('33000000-0000-4000-8000-000000000004', '32000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000004', 'owner', 'active', true),
  ('33000000-0000-4000-8000-000000000005', '32000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000002', 'employee', 'active', true);

insert into public.locations (short_name,
  id, workspace_id, name, street_address, city, region, postal_code, country_code, timezone, sort_order
) values
  ('T00035','34000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'Visible Room', '1 Main St', 'Los Angeles', 'CA', '90001', 'US', 'America/Los_Angeles', 0),
  ('T00036','34000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', 'Hidden Room', '2 Main St', 'Los Angeles', 'CA', '90001', 'US', 'America/Los_Angeles', 10);

select tests.works_at('33000000-0000-4000-8000-000000000002', '34000000-0000-4000-8000-000000000001');

insert into public.departments (id, workspace_id, name, color, sort_order)
values ('35000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'Dining', '#3C7A68', 0);
insert into public.jobs (id, workspace_id, department_id, name, color, sort_order)
values ('36000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '35000000-0000-4000-8000-000000000001', 'Server', '#4478A8', 0);
insert into public.shift_types (id, workspace_id, name, color, default_start_time, default_end_time, sort_order)
values ('37000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'Dinner', '#5279A6', '15:00', '23:00', 0);

insert into public.employee_profiles (
  id, workspace_id, employee_code, first_name, last_name, preferred_name, is_excluded_from_schedule, created_by
) values
  ('38000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'E-1001', 'Visible', 'Employee', '', true, '31000000-0000-4000-8000-000000000001'),
  ('38000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', 'E-1002', 'Hidden', 'Employee', '', false, '31000000-0000-4000-8000-000000000001');
insert into public.employee_location_assignments (id, workspace_id, employee_id, location_id, is_primary, created_by)
values
  ('39000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '38000000-0000-4000-8000-000000000001', '34000000-0000-4000-8000-000000000001', true, '31000000-0000-4000-8000-000000000001'),
  ('39000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', '38000000-0000-4000-8000-000000000002', '34000000-0000-4000-8000-000000000002', true, '31000000-0000-4000-8000-000000000001');
insert into public.employee_job_assignments (id, workspace_id, employee_id, job_id, is_primary, created_by)
values
  ('40000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '38000000-0000-4000-8000-000000000001', '36000000-0000-4000-8000-000000000001', true, '31000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', '38000000-0000-4000-8000-000000000002', '36000000-0000-4000-8000-000000000001', true, '31000000-0000-4000-8000-000000000001');

insert into public.schedule_closures (id, workspace_id, location_id, closed_date, title, is_all_day, created_by)
values ('42000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '34000000-0000-4000-8000-000000000001', '2026-08-18', 'Closed fixture', true, '31000000-0000-4000-8000-000000000001');

insert into public.schedule_location_publications (
  id, workspace_id, location_id, week_start, version_number, status, published_by
) values
  ('43000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '34000000-0000-4000-8000-000000000001', '2026-08-17', 1, 'current', '31000000-0000-4000-8000-000000000001'),
  ('43000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', '34000000-0000-4000-8000-000000000002', '2026-08-17', 1, 'current', '31000000-0000-4000-8000-000000000001');
-- The closed-day shift used to belong to the employee who is excluded from
-- the schedule. Neither can be assigned any more -- somebody excluded from
-- the schedule holds no shifts -- so it is an open shift instead. The
-- closure warning still has something to warn about, and the exclusion flag
-- is still checked on the employee, who never needed a shift for that.
insert into public.schedule_published_shifts (
  id, workspace_id, location_id, publication_id, employee_id, job_id,
  shift_type_id, scheduled_date, start_time, end_time, source_shift_id
) values
  ('44000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '34000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', null, '36000000-0000-4000-8000-000000000001', '37000000-0000-4000-8000-000000000001', '2026-08-18', '15:00', '23:00', '45000000-0000-4000-8000-000000000001'),
  ('44000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', '34000000-0000-4000-8000-000000000002', '43000000-0000-4000-8000-000000000002', '38000000-0000-4000-8000-000000000002', '36000000-0000-4000-8000-000000000001', '37000000-0000-4000-8000-000000000001', '2026-08-19', '15:00', '23:00', '45000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000002', true);
select throws_ok($$select * from public.schedule_location_publications$$, '42501', null, 'authenticated clients cannot read publication history directly');
select throws_ok($$select * from public.schedule_published_shifts$$, '42501', null, 'authenticated clients cannot read published shifts directly');
select throws_ok($$select * from public.employee_weekly_preferences$$, '42501', null, 'authenticated clients cannot read availability marks directly');
select throws_ok($$select * from public.manager_weekly_reminders$$, '42501', null, 'nor a manager''s private availability notes');
select throws_ok($$select * from public.schedule_closures$$, '42501', null, 'authenticated clients cannot read closures directly');

set local role service_role;
select lives_ok(
  $$select public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '2026-08-19')$$,
  'owner reads the schedule model'
);
select is((public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '2026-08-19')->>'week_start'), '2026-08-17', 'target date resolves workspace week start');
select is(jsonb_array_length(public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '2026-08-19')->'locations'), 2, 'owner receives both locations');
select is(jsonb_array_length(public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '2026-08-19')->'employees'), 3, 'owner receives every assigned employee, the Visible Room manager included');
select is((
  select employee->>'is_excluded_from_schedule'
  from jsonb_array_elements(public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '2026-08-19')->'employees') employee
  where employee->>'id' = '38000000-0000-4000-8000-000000000001'
), 'true', 'schedule read model projects employee schedule exclusion flag');
select is(jsonb_array_length(public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '2026-08-19')->'shifts'), 2, 'owner receives both published shifts');
select is(jsonb_array_length(public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', '2026-08-19')->'locations'), 1, 'scoped manager receives one location');
select is(jsonb_array_length(public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', '2026-08-19')->'shifts'), 1, 'scoped manager receives one location shift');
select ok((public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', '2026-08-19')->'shifts'->0->'warning_codes') ? 'closed_location', 'read model projects closure warning');
select throws_ok(
  $$select public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000003', '32000000-0000-4000-8000-000000000001', '2026-08-19')$$,
  '42501', 'Not allowed', 'employee access class cannot read manager Schedule'
);
select throws_ok(
  $$select public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000004', '32000000-0000-4000-8000-000000000001', '2026-08-19')$$,
  '42501', 'Not allowed', 'cross-tenant Schedule read is denied'
);
select throws_ok(
  $$select public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000002', '2026-08-19')$$,
  '42501', 'Not allowed', 'same account employee role in another tenant cannot read manager Schedule'
);

select * from finish();
rollback;
