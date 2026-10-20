begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

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
  'Mert', 'Ali', 'Tepebas'
);

select is(
  (select count(*)::integer from public.employee_profiles
   where workspace_id = (select workspace_id from owner_record_target)),
  1,
  'the first saved step files the owner'
);

-- The first step asks for the three parts; the record takes them as typed.
select is(
  (select first_name || ' / ' || middle_name || ' / ' || last_name from public.employee_profiles
   where workspace_id = (select workspace_id from owner_record_target)),
  'Mert / Ali / Tepebas',
  'the record is filed under the three parts the first step asked for'
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
-- The same answers are the owner's legal name (BL-080).
select is(
  (select private_profile.legal_first_name || ' / ' || private_profile.legal_middle_name
     || ' / ' || private_profile.legal_last_name
   from public.employee_private_profiles private_profile
   join public.employee_profiles employee on employee.id = private_profile.employee_id
   where employee.workspace_id = (select workspace_id from owner_record_target)),
  'Mert / Ali / Tepebas',
  'the same answers are the owner''s legal name'
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
  (select id from public.departments where workspace_id = (select workspace_id from owner_record_target) and name = 'Kitchen')
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

-- Every location, and of the jobs only Owner (BL-218): the jobs setup added are
-- assigned by hand, like everybody else's.
select is(
  (select count(*)::integer from public.employee_location_assignments
   where workspace_id = (select workspace_id from owner_record_target)
     and ended_at is null),
  1,
  'the owner can work at every location the setup created'
);
select is(
  (select string_agg(job.system_key, ',') from public.employee_job_assignments assignment
   join public.jobs job on job.id = assignment.job_id
   where assignment.workspace_id = (select workspace_id from owner_record_target)
     and assignment.ended_at is null),
  'owner',
  'the owner works the Owner job, not the job the setup created'
);

-- A place added after setup has to reach the owner too; before this the record
-- was opened once and never again.
insert into public.locations (workspace_id, name, street_address, city, region, postal_code, timezone, short_name)
values ((select workspace_id from owner_record_target), 'Second Site', '2 St', 'Austin', 'TX', '78702', 'America/Chicago', 'SEC');
insert into public.jobs (workspace_id, name, department_id)
values (
  (select workspace_id from owner_record_target),
  'Host',
  (select id from public.departments where workspace_id = (select workspace_id from owner_record_target) and name = 'Kitchen')
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
  1,
  'a job added after setup is not put on the owner'
);

-- Everyone but the owner gives an emergency contact during onboarding, and the
-- owner never runs onboarding. They enter it by hand, and only for themselves.
create temporary table owner_employee on commit drop as
select id from public.employee_profiles
where workspace_id = (select workspace_id from owner_record_target)
  and user_id = '14000000-0000-4000-8000-000000000001';

select ok(
  (select emergency_contact_name is null and phone is null
   from public.employee_private_profiles
   where employee_id = (select id from owner_employee limit 1)),
  'nothing is invented for the owner before they enter anything'
);

select public.save_own_employment_contact_service(
  '14000000-0000-4000-8000-000000000001',
  (select workspace_id from owner_record_target),
  (select id from owner_employee limit 1),
  'Morgan Tepebas', 'Spouse', '+13105550101', ''
);

select is(
  (select emergency_contact_name || ' / ' || emergency_contact_phone
   from public.employee_private_profiles
   where employee_id = (select id from owner_employee limit 1)),
  'Morgan Tepebas / +13105550101',
  'the owner can record an emergency contact by hand'
);
select ok(
  (select phone is null from public.employee_private_profiles
   where employee_id = (select id from owner_employee limit 1)),
  'a personal phone is not invented to satisfy the row'
);

-- Your own number is your account's (BL-335 / KK-7). The owner's account has
-- none yet, so the personal phone fills it and the record copies it.
select public.save_own_employment_contact_service(
  '14000000-0000-4000-8000-000000000001',
  (select workspace_id from owner_record_target),
  (select id from owner_employee limit 1),
  'Morgan Tepebas', 'Spouse', '+13105550101', '', '3105550102'
);
select is(
  (select phone from public.employee_private_profiles
   where employee_id = (select id from owner_employee limit 1)),
  '+13105550102',
  'a personal phone reaches the record through the empty account it fills'
);
select throws_ok(
  $$select public.save_own_employment_contact_service(
    '14000000-0000-4000-8000-000000000001',
    (select workspace_id from owner_record_target),
    (select id from owner_employee limit 1),
    'Morgan Tepebas', 'Spouse', '+13105550101', '', '311'
  )$$,
  '22023',
  'a personal phone number is too short to reach anybody',
  'and half a number is refused where it can be read'
);
-- The legal name has its own review during onboarding; this surface must not
-- be a way around it. Moving the record's own first name and saving again is
-- the way to see whether it follows.
update public.employee_profiles set first_name = 'Renamed'
where id = (select id from owner_employee limit 1);
select public.save_own_employment_contact_service(
  '14000000-0000-4000-8000-000000000001',
  (select workspace_id from owner_record_target),
  (select id from owner_employee limit 1),
  'Morgan Tepebas', 'Spouse', '+13105550101', '', '3105550102'
);
select isnt(
  (select legal_first_name from public.employee_private_profiles
   where employee_id = (select id from owner_employee limit 1)),
  'Renamed',
  'the legal name on file is left where onboarding and its review put it'
);

-- Somebody else's record is not theirs to write, owner or not.
insert into public.employee_profiles (id, workspace_id, employee_code, first_name, last_name, created_by)
values ('17000000-0000-4000-8000-000000000009', (select workspace_id from owner_record_target), 'E-7001', 'Someone', 'Else', '14000000-0000-4000-8000-000000000001');

select throws_ok(
  $$select public.save_own_employment_contact_service(
    '14000000-0000-4000-8000-000000000001',
    (select workspace_id from owner_record_target),
    '17000000-0000-4000-8000-000000000009',
    'Morgan', 'Spouse', '+13105550101', ''
  )$$,
  '42501',
  'Not allowed',
  'an owner cannot write an emergency contact onto somebody else'
);

-- The documents a workspace asks for are the owner's own request. They still
-- reach the owner's record, so the Documents tab shows what is asked of
-- everyone -- but they arrive excused, however long after setup they appear.

-- Setup finishes, so the workspace is open and "everyone on staff" means
-- something.
select public.update_owner_onboarding_service(
  '14000000-0000-4000-8000-000000000001',
  (select workspace_id from owner_record_target),
  'Owner Record Co', 4::smallint, true,
  (select revision from public.workspace_onboarding
   where workspace_id = (select workspace_id from owner_record_target)),
  null, null
);

-- Somebody else on staff, so the comparison is between two real records.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('14000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff-record@example.test', '', '{}', '{}', now(), now());

update public.employee_profiles
set user_id = '14000000-0000-4000-8000-000000000002'
where id = '17000000-0000-4000-8000-000000000009';

insert into public.workspace_memberships (workspace_id, user_id, status, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(legacy.role_id::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(legacy.role_id::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (select
  (select workspace_id from owner_record_target),
  '14000000-0000-4000-8000-000000000002',
  'employee'::public.workspace_role,
  (select id from public.workspace_roles
   where workspace_id = (select workspace_id from owner_record_target)
     and system_key = 'employee'),
  'active'::public.membership_status) as legacy(workspace_id, user_id, role, role_id, status);

-- Added long after setup, required of everyone on staff.
insert into public.document_types (
  id, workspace_id, title, description, required_at_onboarding, requires_review,
  created_by, publication_status, published_at, lifecycle_settings
)
values (
  '18000000-0000-4000-8000-000000000001',
  (select workspace_id from owner_record_target),
  'Food handler card', '', true, true,
  '14000000-0000-4000-8000-000000000001', 'published', now(),
  jsonb_build_object(
    'mode', 'required',
    'target', jsonb_build_object(
      'operator', 'and', 'location_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'job_ids', '[]'::jsonb, 'employee_ids', '[]'::jsonb
    ),
    'assignment_scope', 'all_active', 'period_days', null,
    'suspend_on_overdue', false, 'extra_fields', '[]'::jsonb
  )
);

select app_private.document_reconcile_employee(
  (select workspace_id from owner_record_target),
  (select id from owner_employee limit 1)
);
select app_private.document_reconcile_employee(
  (select workspace_id from owner_record_target),
  '17000000-0000-4000-8000-000000000009'
);

select is(
  (select count(*)::integer from public.employee_onboarding_requirements
   where employee_id = (select id from owner_employee limit 1) and kind = 'document'),
  1,
  'a document asked of everyone still reaches the owner''s record'
);
select is(
  (select app_private.document_obligation_state(requirement, now())
   from public.employee_onboarding_requirements requirement
   where requirement.employee_id = (select id from owner_employee limit 1)
     and requirement.kind = 'document'),
  'exempt',
  'it arrives excused rather than missing'
);
select ok(
  not (select app_private.document_activation_blocked(requirement)
       from public.employee_onboarding_requirements requirement
       where requirement.employee_id = (select id from owner_employee limit 1)
         and requirement.kind = 'document'),
  'a document marked required never holds the owner up'
);
-- The exemption is about the owner, not about the document.
select ok(
  (select required and not lifecycle_exempt
   from public.employee_onboarding_requirements
   where employee_id = '17000000-0000-4000-8000-000000000009' and kind = 'document'),
  'everybody else is still asked for the same document'
);
select throws_ok(
  $$select public.set_employee_document_exemption_service(
    '14000000-0000-4000-8000-000000000001',
    (select workspace_id from owner_record_target),
    (select id from public.employee_onboarding_requirements
     where employee_id = (select id from owner_employee limit 1) and kind = 'document'),
    (select lifecycle_revision from public.employee_onboarding_requirements
     where employee_id = (select id from owner_employee limit 1) and kind = 'document'),
    false, 'because I said so'
  )$$,
  '42501',
  'Not allowed',
  'the excuse is not a decision a reviewer can take back: nobody decides on their own document'
);

select * from finish();
rollback;
