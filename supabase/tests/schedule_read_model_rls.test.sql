begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- BL-160: a "no" carries its own reason; checking only the message ('Not
-- allowed' is the same string for every authz.* hint) would still pass if
-- the wrong reason came back, "another tenant" answering document_blocked.
create function pg_temp.said(statement text) returns text
language plpgsql as $$
declare code text; reason text; what text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint, what = pg_exception_detail;
  return concat_ws(' ', code, nullif(reason, ''), nullif(what, ''));
end;
$$;
-- The file switches role further down (authenticated, service_role); a temp
-- function's default execute grant does not reach past the connecting role.
grant execute on function pg_temp.said(text) to public;

-- A day of this week (Monday + n). The fixture lives in the week still being
-- planned: a closed day no longer reaches a locked past week (ILKELER P09).
create function pg_temp.wk(n integer) returns date language sql stable as $$
  select current_date - (extract(isodow from current_date)::integer - 1) + n
$$;
grant execute on function pg_temp.wk(integer) to public;

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

insert into public.workspace_memberships (id, workspace_id, user_id, status, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
  ('33000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'owner', 'active', true),
  ('33000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002', 'manager', 'active', false),
  ('33000000-0000-4000-8000-000000000003', '32000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000003', 'employee', 'active', true),
  ('33000000-0000-4000-8000-000000000004', '32000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000004', 'owner', 'active', true),
  ('33000000-0000-4000-8000-000000000005', '32000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000002', 'employee', 'active', true)) as legacy(id, workspace_id, user_id, role, status, all_locations);

insert into public.locations (short_name,
  id, workspace_id, name, street_address, city, region, postal_code, country_code, timezone, sort_order
) values
  ('T00035','34000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'Visible Room', '1 Main St', 'Los Angeles', 'CA', '90001', 'US', 'America/Los_Angeles', 0),
  ('T00036','34000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', 'Hidden Room', '2 Main St', 'Los Angeles', 'CA', '90001', 'US', 'America/Los_Angeles', 10);

select tests.works_at('33000000-0000-4000-8000-000000000002', '34000000-0000-4000-8000-000000000001');

insert into public.departments (id, workspace_id, name, color)
values ('35000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'Dining', '#3C7A68');
insert into public.jobs (id, workspace_id, department_id, name, color)
values ('36000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '35000000-0000-4000-8000-000000000001', 'Server', '#4478A8');
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

select tests.closed_day('32000000-0000-4000-8000-000000000001', array['34000000-0000-4000-8000-000000000001']::uuid[], pg_temp.wk(1)::date, pg_temp.wk(1)::date, '31000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001'::uuid);

insert into public.schedule_location_publications (
  id, workspace_id, location_id, week_start, version_number, status, published_by
) values
  ('43000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '34000000-0000-4000-8000-000000000001', pg_temp.wk(0), 1, 'current', '31000000-0000-4000-8000-000000000001'),
  ('43000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', '34000000-0000-4000-8000-000000000002', pg_temp.wk(0), 1, 'current', '31000000-0000-4000-8000-000000000001');
-- The closed-day shift used to belong to the employee who is excluded from
-- the schedule. Neither can be assigned any more -- somebody excluded from
-- the schedule holds no shifts -- so it is an open shift instead. The
-- closure warning still has something to warn about, and the exclusion flag
-- is still checked on the employee, who never needed a shift for that.
insert into public.schedule_published_shifts (
  id, workspace_id, location_id, publication_id, employee_id, job_id,
  shift_type_id, scheduled_date, start_time, end_time, source_shift_id
) values
  ('44000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', '34000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', null, '36000000-0000-4000-8000-000000000001', '37000000-0000-4000-8000-000000000001', pg_temp.wk(1), '15:00', '23:00', '45000000-0000-4000-8000-000000000001'),
  ('44000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', '34000000-0000-4000-8000-000000000002', '43000000-0000-4000-8000-000000000002', '38000000-0000-4000-8000-000000000002', '36000000-0000-4000-8000-000000000001', '37000000-0000-4000-8000-000000000001', pg_temp.wk(2), '15:00', '23:00', '45000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000002', true);
select throws_ok($$select * from public.schedule_location_publications$$, '42501', null, 'authenticated clients cannot read publication history directly');
select throws_ok($$select * from public.schedule_published_shifts$$, '42501', null, 'authenticated clients cannot read published shifts directly');
select throws_ok($$select * from public.employee_weekly_preferences$$, '42501', null, 'authenticated clients cannot read availability marks directly');
select throws_ok($$select * from public.manager_weekly_reminders$$, '42501', null, 'nor a manager''s private availability notes');
select throws_ok($$select * from public.schedule_closures$$, '42501', null, 'authenticated clients cannot read closures directly');

set local role service_role;
select lives_ok(
  $$select public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', pg_temp.wk(2))$$,
  'owner reads the schedule model'
);
select is((public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', pg_temp.wk(2))->>'week_start'), pg_temp.wk(0)::text, 'target date resolves workspace week start');
select is(jsonb_array_length(public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', pg_temp.wk(2))->'locations'), 2, 'owner receives both locations');
select is(jsonb_array_length(public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', pg_temp.wk(2))->'employees'), 2, 'owner receives every assigned employee; the Visible Room manager, who only manages, is not on the grid (ROL-CIFT 2.1)');
select is((
  select employee->>'is_excluded_from_schedule'
  from jsonb_array_elements(public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', pg_temp.wk(2))->'employees') employee
  where employee->>'id' = '38000000-0000-4000-8000-000000000001'
), 'true', 'schedule read model projects employee schedule exclusion flag');
select is(jsonb_array_length(public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', pg_temp.wk(2))->'shifts'), 2, 'owner receives both published shifts');
select is(jsonb_array_length(public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', pg_temp.wk(2))->'locations'), 1, 'scoped manager receives one location');
select is(jsonb_array_length(public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', pg_temp.wk(2))->'shifts'), 1, 'scoped manager receives one location shift');
select ok((public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', pg_temp.wk(2))->'shifts'->0->'warning_codes') ? 'closed_location', 'read model projects closure warning');
select throws_ok(
  $$select public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000003', '32000000-0000-4000-8000-000000000001', pg_temp.wk(2))$$,
  '42501', 'Not allowed', 'employee access class cannot read manager Schedule'
);
select is(pg_temp.said($$select public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000003', '32000000-0000-4000-8000-000000000001', pg_temp.wk(2))$$),
  '42501 authz.missing_permission schedule.read', 'employee access class is refused for missing permission, not some other reason');
select throws_ok(
  $$select public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000004', '32000000-0000-4000-8000-000000000001', pg_temp.wk(2))$$,
  '42501', 'Not allowed', 'cross-tenant Schedule read is denied'
);
select is(pg_temp.said($$select public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000004', '32000000-0000-4000-8000-000000000001', pg_temp.wk(2))$$),
  '42501 authz.not_member schedule.read', 'a true outsider is refused as not a member, not some other reason');
select throws_ok(
  $$select public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000002', pg_temp.wk(2))$$,
  '42501', 'Not allowed', 'same account employee role in another tenant cannot read manager Schedule'
);
select is(pg_temp.said($$select public.get_schedule_read_model_service('31000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000002', pg_temp.wk(2))$$),
  '42501 authz.missing_permission schedule.read', 'the same account is a member there too, just without the permission, not some other reason');

select * from finish();
rollback;
