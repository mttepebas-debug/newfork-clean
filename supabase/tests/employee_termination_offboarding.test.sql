begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('1a000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'termination-owner@example.test', '', '{}', '{}', now(), now()),
  ('1a000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'terminated-employee@example.test', '', '{}', '{}', now(), now()),
  ('1a000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'termination-outsider@example.test', '', '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values
  ('2a000000-0000-4000-8000-000000000001', 'Termination Workspace', '1a000000-0000-4000-8000-000000000001'),
  ('2a000000-0000-4000-8000-000000000002', 'Outside Workspace', '1a000000-0000-4000-8000-000000000003');

insert into public.workspace_memberships (id, workspace_id, user_id, role, all_locations)
values
  ('3a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001', 'owner', true),
  ('3a000000-0000-4000-8000-000000000002', '2a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000002', 'employee', false),
  ('3a000000-0000-4000-8000-000000000003', '2a000000-0000-4000-8000-000000000002', '1a000000-0000-4000-8000-000000000003', 'owner', true);

insert into public.locations (short_name,
  id, workspace_id, name, street_address, city, region, postal_code, timezone
) values
  ('T00014','4a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', 'Los Angeles', '1 Main St', 'Los Angeles', 'CA', '90001', 'America/Los_Angeles'),
  ('T00015','4a000000-0000-4000-8000-000000000002', '2a000000-0000-4000-8000-000000000001', 'New York', '2 Main St', 'New York', 'NY', '10001', 'America/New_York');

insert into public.departments (id, workspace_id, name)
values ('5a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', 'Service');
insert into public.jobs (id, workspace_id, department_id, name)
values ('6a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', 'Server');

insert into public.employee_profiles (
  id, workspace_id, user_id, employee_code, first_name, last_name, created_by
) values (
  '7a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001',
  '1a000000-0000-4000-8000-000000000002', 'E-9001', 'Taylor', 'Reed',
  '1a000000-0000-4000-8000-000000000001'
);
insert into public.employee_profiles (
  id, workspace_id, employee_code, first_name, last_name, created_by
) values (
  '7a000000-0000-4000-8000-000000000002', '2a000000-0000-4000-8000-000000000001',
  'E-9002', 'Keep', 'Open', '1a000000-0000-4000-8000-000000000001'
);
insert into public.employee_location_assignments (
  workspace_id, employee_id, location_id, is_primary, created_by
) values (
  '2a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000001',
  '4a000000-0000-4000-8000-000000000001', true, '1a000000-0000-4000-8000-000000000001'
);
insert into public.employee_location_assignments (
  workspace_id, employee_id, location_id, is_primary, created_by
) values (
  '2a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000002',
  '4a000000-0000-4000-8000-000000000001', true, '1a000000-0000-4000-8000-000000000001'
);
-- A shift is refused now unless the person holds an active assignment to its
-- job as well as its location. The fixture gave them the location only, which
-- was the whole of the rule when it was written.
insert into public.employee_job_assignments (
  workspace_id, employee_id, job_id, is_primary, created_by
) values
  ('2a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000001',
   '6a000000-0000-4000-8000-000000000001', true, '1a000000-0000-4000-8000-000000000001'),
  ('2a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000002',
   '6a000000-0000-4000-8000-000000000001', true, '1a000000-0000-4000-8000-000000000001');
select tests.works_at('3a000000-0000-4000-8000-000000000002', '4a000000-0000-4000-8000-000000000001');

insert into public.schedule_location_publications (
  id, workspace_id, location_id, week_start, version_number, published_by
) values (
  '8a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001',
  '4a000000-0000-4000-8000-000000000001', '2026-08-31', 1,
  '1a000000-0000-4000-8000-000000000001'
);
insert into public.schedule_published_shifts (
  id, workspace_id, location_id, publication_id, employee_id, job_id,
  scheduled_date, start_time, end_time, source_shift_id
) values
  ('9a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000001', '6a000000-0000-4000-8000-000000000001', '2026-09-01', '10:00', '11:00', '91000000-0000-4000-8000-000000000001'),
  ('9a000000-0000-4000-8000-000000000002', '2a000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000001', '6a000000-0000-4000-8000-000000000001', '2026-09-01', '14:00', '15:00', '91000000-0000-4000-8000-000000000002');
-- A week ahead, so it has not started whenever this runs (K1, BL-766).
insert into public.schedule_location_publications (
  id, workspace_id, location_id, week_start, version_number, published_by
) values (
  '8a000000-0000-4000-8000-000000000002', '2a000000-0000-4000-8000-000000000001',
  '4a000000-0000-4000-8000-000000000001', date_trunc('week', current_date + 7)::date, 1,
  '1a000000-0000-4000-8000-000000000001'
);
insert into public.schedule_published_shifts (
  id, workspace_id, location_id, publication_id, employee_id, job_id,
  scheduled_date, start_time, end_time, source_shift_id
) values
  ('9a000000-0000-4000-8000-000000000003', '2a000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000002', '7a000000-0000-4000-8000-000000000001', '6a000000-0000-4000-8000-000000000001', current_date + 7, '10:00', '11:00', '91000000-0000-4000-8000-000000000003');

-- Under way now: it started an hour ago, after the back-dated instant, and is
-- still being worked. It stays too (K1, BL-766).
insert into public.schedule_published_shifts (
  id, workspace_id, location_id, publication_id, employee_id, job_id,
  scheduled_date, start_time, end_time, source_shift_id
) select
  '9a000000-0000-4000-8000-000000000004', '2a000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000001', '6a000000-0000-4000-8000-000000000001',
  started::date, date_trunc('minute', started)::time, date_trunc('minute', started)::time + interval '3 hours', '91000000-0000-4000-8000-000000000004'
from (select (now() - interval '1 hour') at time zone 'America/Los_Angeles' as started) as clock;

set local role service_role;

select throws_ok(
  $$select public.terminate_employee_service(
    '1a000000-0000-4000-8000-000000000001',
    '2a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000001',
    '2026-09-01 12:00', 'Mars/Olympus_Mons', 'Employment ended',
    'ba000000-0000-4000-8000-000000000001'
  )$$,
  '22023', 'invalid worksite timezone',
  'a termination that cannot complete changes nothing'
);
set local role postgres;
select is((select archived_at from public.employee_profiles where id = '7a000000-0000-4000-8000-000000000001'), null, 'failed termination leaves employee active');
select is((select employee_id from public.schedule_published_shifts where id = '9a000000-0000-4000-8000-000000000003'), '7a000000-0000-4000-8000-000000000001'::uuid, 'failed termination leaves the upcoming shift assigned');

set local role service_role;
select lives_ok(
  $$select public.terminate_employee_service(
    '1a000000-0000-4000-8000-000000000001',
    '2a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000001',
    '2026-09-01 12:00', 'America/Los_Angeles', 'Employment ended',
    'ba000000-0000-4000-8000-000000000002'
  )$$,
  'owner terminates the employee atomically'
);
set local role postgres;
select is((select archived_at from public.employee_profiles where id = '7a000000-0000-4000-8000-000000000001'), '2026-09-01 19:00:00+00'::timestamptz, 'worksite-local effective time is stored as an instant');
select is((select status::text from public.workspace_memberships where id = '3a000000-0000-4000-8000-000000000002'), 'suspended', 'linked workspace access is suspended');
select is((select count(*)::integer from public.employee_access_snapshots where employee_id = '7a000000-0000-4000-8000-000000000001'), 1, 'access restoration snapshot is retained');
select is((select employee_id from public.schedule_published_shifts where id = '9a000000-0000-4000-8000-000000000001'), '7a000000-0000-4000-8000-000000000001'::uuid, 'same-day shift before effective instant stays assigned');
-- Back-dated to 1 September: the 14:00 shift that day was worked, and a
-- published shift never changes after the fact (K1, P09). Only what has not
-- started yet is released.
select is((select employee_id from public.schedule_published_shifts where id = '9a000000-0000-4000-8000-000000000002'), '7a000000-0000-4000-8000-000000000001'::uuid, 'a worked shift after a back-dated effective instant stays assigned');
select is((select employee_id from public.schedule_published_shifts where id = '9a000000-0000-4000-8000-000000000003'), null, 'a shift that has not started yet becomes open');
select is((select employee_id from public.schedule_published_shifts where id = '9a000000-0000-4000-8000-000000000004'), '7a000000-0000-4000-8000-000000000001'::uuid, 'a shift under way now stays assigned');
select is((select count(*)::integer from public.employee_offboarding_shift_actions where workspace_id='2a000000-0000-4000-8000-000000000001'), 1, 'released shift has durable audit detail');
select is((select count(*)::integer from public.employee_events where workspace_id = '2a000000-0000-4000-8000-000000000001' and action = 'employee.terminated'), 1, 'termination lifecycle event is recorded');
select is((select count(*)::integer from public.audit_events where workspace_id = '2a000000-0000-4000-8000-000000000001' and action = 'employee.terminated'), 1, 'termination audit event is recorded');

set local role service_role;
select lives_ok(
  $$select public.terminate_employee_service(
    '1a000000-0000-4000-8000-000000000001',
    '2a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000001',
    '2026-09-01 12:00', 'America/Los_Angeles', 'Employment ended',
    'ba000000-0000-4000-8000-000000000002'
  )$$,
  'same idempotency key replays safely'
);
set local role postgres;
select is((select count(*)::integer from public.employee_terminations where workspace_id = '2a000000-0000-4000-8000-000000000001'), 1, 'idempotent replay does not duplicate the termination');
-- The managers' notice for the released shift is termination_tells_location_managers (BL-768).

set local role service_role;
select throws_ok(
  $$select public.terminate_employee_service(
    '1a000000-0000-4000-8000-000000000001',
    '2a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000001',
    '2026-09-01 12:01', 'America/Los_Angeles', 'Employment ended',
    'ba000000-0000-4000-8000-000000000002'
  )$$,
  '23505', 'idempotency key payload conflict', 'idempotency key cannot be reused for another payload'
);

select lives_ok(
  $$select public.terminate_employee_service(
    '1a000000-0000-4000-8000-000000000001',
    '2a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000002',
    '2026-09-01 12:00', 'America/Los_Angeles', 'Position ended',
    'ba000000-0000-4000-8000-000000000003'
  )$$,
  'owner terminates a second employee'
);
set local role postgres;
select isnt((select archived_at from public.employee_profiles where id = '7a000000-0000-4000-8000-000000000002'), null, 'the second termination archives that employee');

set local role service_role;
select throws_ok(
  $$select public.terminate_employee_service(
    '1a000000-0000-4000-8000-000000000003',
    '2a000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-000000000002',
    '2026-09-01 12:00', 'America/Los_Angeles', 'Cross tenant attempt',
    'ba000000-0000-4000-8000-000000000004'
  )$$,
  '42501', 'Not allowed', 'cross-tenant termination is denied'
);

select * from finish();
rollback;
