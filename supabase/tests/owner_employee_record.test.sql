begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('14000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-record@example.test', '', '{}', '{}', now(), now());

insert into public.user_profiles (user_id, display_name)
values ('14000000-0000-4000-8000-000000000001', 'Mert Ali Tepebas');

create temporary table owner_record_target on commit drop as
select public.create_owner_workspace_service(
  '14000000-0000-4000-8000-000000000001',
  'Owner Record Co'
) as workspace_id;

-- The record used to arrive only when setup finished, so the team list did not
-- contain the one person who was certainly on the team.
select is(
  (select count(*)::integer from public.employee_profiles
   where workspace_id = (select workspace_id from owner_record_target)),
  0,
  'creating the workspace alone files nobody'
);

select public.update_owner_onboarding_service(
  '14000000-0000-4000-8000-000000000001',
  (select workspace_id from owner_record_target),
  'Owner Record Co', 2::smallint, false,
  (select revision from public.workspace_onboarding
   where workspace_id = (select workspace_id from owner_record_target)),
  null, null
);

select is(
  (select count(*)::integer from public.employee_profiles
   where workspace_id = (select workspace_id from owner_record_target)),
  1,
  'the first saved step files the owner'
);

-- The last word is the family name; everything before it is the given name.
select is(
  (select first_name || ' / ' || last_name from public.employee_profiles
   where workspace_id = (select workspace_id from owner_record_target)),
  'Mert Ali / Tepebas',
  'a middle name stays with the given name instead of moving to the family name'
);
select is(
  (select internal_note from public.employee_profiles
   where workspace_id = (select workspace_id from owner_record_target)),
  '',
  'the system writes nothing into a manager note'
);
-- On the schedule like everyone else; hiding is a choice made in the row, not
-- a question the wizard asks.
select ok(
  not (select is_excluded_from_schedule from public.employee_profiles
       where workspace_id = (select workspace_id from owner_record_target)),
  'the owner arrives on the schedule like any other employee'
);
select is(
  (select first_name || ' ' || last_name from public.employee_profiles
   where workspace_id = (select workspace_id from owner_record_target)),
  'Mert Ali Tepebas',
  'the name typed at sign-up is the name the workspace files them under'
);

-- What the employees tab says is what the workspace decided to call this
-- person. Finishing setup is not a reason to argue with it.
update public.employee_profiles
set first_name = 'Mert', last_name = 'Tepebas'
where workspace_id = (select workspace_id from owner_record_target);

insert into public.locations (workspace_id, name, street_address, city, region, postal_code, timezone, short_name)
values ((select workspace_id from owner_record_target), 'Main', '1 St', 'Austin', 'TX', '78701', 'America/Chicago', 'MN');
insert into public.departments (workspace_id, name)
values ((select workspace_id from owner_record_target), 'Kitchen');
insert into public.jobs (workspace_id, name, department_id)
values (
  (select workspace_id from owner_record_target),
  'Server',
  (select id from public.departments where workspace_id = (select workspace_id from owner_record_target) limit 1)
);

select public.update_owner_onboarding_service(
  '14000000-0000-4000-8000-000000000001',
  (select workspace_id from owner_record_target),
  'Owner Record Co', 4::smallint, true,
  (select revision from public.workspace_onboarding
   where workspace_id = (select workspace_id from owner_record_target)),
  null, null
);

select is(
  (select first_name || ' / ' || last_name from public.employee_profiles
   where workspace_id = (select workspace_id from owner_record_target)),
  'Mert / Tepebas',
  'finishing setup leaves a corrected name alone'
);
select is(
  (select count(*)::integer from public.employee_events
   where workspace_id = (select workspace_id from owner_record_target)
     and action = 'employee.owner_identity_synced'),
  0,
  'no repair is logged, because none happens'
);
select is(
  (select lifecycle_status::text from public.workspaces
   where id = (select workspace_id from owner_record_target)),
  'active',
  'the workspace is open once its setup is done'
);

-- Every location and every job, the way a manager adding somebody by hand
-- would leave it.
select is(
  (select count(*)::integer from public.employee_location_assignments
   where workspace_id = (select workspace_id from owner_record_target)
     and ended_at is null),
  1,
  'the owner can work at every location the setup created'
);
select is(
  (select count(*)::integer from public.employee_job_assignments
   where workspace_id = (select workspace_id from owner_record_target)
     and ended_at is null),
  1,
  'the owner can work every job the setup created'
);

-- A place added after setup has to reach the owner too; before this the record
-- was opened once and never again.
insert into public.locations (workspace_id, name, street_address, city, region, postal_code, timezone, short_name)
values ((select workspace_id from owner_record_target), 'Second Site', '2 St', 'Austin', 'TX', '78702', 'America/Chicago', 'SEC');
insert into public.jobs (workspace_id, name, department_id)
values (
  (select workspace_id from owner_record_target),
  'Host',
  (select id from public.departments where workspace_id = (select workspace_id from owner_record_target) limit 1)
);

select is(
  (select count(*)::integer from public.employee_location_assignments
   where workspace_id = (select workspace_id from owner_record_target)
     and ended_at is null),
  2,
  'a location added after setup reaches the owner on its own'
);
select is(
  (select count(*)::integer from public.employee_job_assignments
   where workspace_id = (select workspace_id from owner_record_target)
     and ended_at is null),
  2,
  'a job added after setup reaches the owner on its own'
);

select * from finish();
rollback;
