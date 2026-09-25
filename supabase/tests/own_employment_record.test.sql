begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- The owner got a way to enter an emergency contact because onboarding never
-- asks them for one. Everybody else was asked once, while joining, and then had
-- no way back to it. The function that served the owner serves everyone now,
-- and these are the two halves of that: an ordinary employee can write their
-- own record, and nobody can write somebody else's.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('1a000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'own-record-owner@example.test', '', '{}', '{}', now(), now()),
  ('1a000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'own-record-staff@example.test', '', '{}', '{}', now(), now());

insert into public.user_profiles (user_id, display_name)
values
  ('1a000000-0000-4000-8000-000000000001', 'Robin Vance'),
  ('1a000000-0000-4000-8000-000000000002', 'Sam Okafor');

create temporary table own_record_target on commit drop as
select public.create_owner_workspace_service(
  '1a000000-0000-4000-8000-000000000001',
  'Own Record Co'
) as workspace_id;

insert into public.employee_profiles (id, workspace_id, user_id, employee_code, first_name, last_name, created_by)
values (
  '1b000000-0000-4000-8000-000000000001',
  (select workspace_id from own_record_target),
  '1a000000-0000-4000-8000-000000000002',
  'E-9001', 'Sam', 'Okafor',
  '1a000000-0000-4000-8000-000000000001'
);

insert into public.workspace_memberships (workspace_id, user_id, role, role_id, status, employee_id)
select
  (select workspace_id from own_record_target),
  '1a000000-0000-4000-8000-000000000002',
  'employee'::public.workspace_role,
  (select id from public.workspace_roles
   where workspace_id = (select workspace_id from own_record_target)
     and system_key = 'employee'),
  'active'::public.membership_status,
  '1b000000-0000-4000-8000-000000000001';

-- What onboarding left: the legal name the employee gave and the contact they
-- named then. The account area corrects the contact; the legal name is
-- onboarding's and its review's (BL-080).
insert into public.employee_private_profiles (
  employee_id, workspace_id, legal_first_name, legal_last_name,
  emergency_contact_name, emergency_contact_relationship, emergency_contact_phone
) values (
  '1b000000-0000-4000-8000-000000000001',
  (select workspace_id from own_record_target),
  'Samuel', 'Okafor', 'Old Contact', 'Friend', '4155550100'
);

select public.save_own_employment_contact_service(
  '1a000000-0000-4000-8000-000000000002',
  (select workspace_id from own_record_target),
  '1b000000-0000-4000-8000-000000000001',
  'Ada Okafor', 'Sister', '4155550144', '', '4155550143'
);

select is(
  (select legal_first_name || ' ' || legal_last_name
   from public.employee_private_profiles
   where employee_id = '1b000000-0000-4000-8000-000000000001'),
  'Samuel Okafor',
  'correcting a contact leaves the legal name onboarding filed, not the record''s name'
);

select is(
  (select emergency_contact_name || ' / ' || emergency_contact_phone || ' / ' || phone
   from public.employee_private_profiles
   where employee_id = '1b000000-0000-4000-8000-000000000001'),
  'Ada Okafor / 4155550144 / 4155550143',
  'an employee who does not own anything can still correct their own record'
);

-- The owner check that used to stand here is gone. The check that replaced it
-- binds the owner too: whether a record may be written is about whose it is,
-- not about what you are in the workspace.
select throws_ok(
  $$select public.save_own_employment_contact_service(
    '1a000000-0000-4000-8000-000000000001',
    (select workspace_id from own_record_target),
    '1b000000-0000-4000-8000-000000000001',
    'Ada Okafor', 'Sister', '4155550144', ''
  )$$,
  '42501',
  'this record belongs to somebody else',
  'and the owner cannot write it on their behalf'
);

select throws_ok(
  $$select public.save_own_employment_contact_service(
    '1a000000-0000-4000-8000-000000000002',
    (select workspace_id from own_record_target),
    '1b000000-0000-4000-8000-000000000001',
    '', 'Sister', '4155550144', ''
  )$$,
  '22023',
  'an emergency contact needs a name and a phone number',
  'and will not take half a contact'
);

-- The record is per workspace, so the reading side says which workspace each
-- one belongs to and shows only the caller's.
select is(
  (select workspace_name || ': ' || emergency_contact_name
   from public.list_own_employment_records_service(
     '1a000000-0000-4000-8000-000000000002'
   )),
  'Own Record Co: Ada Okafor',
  'and reads back naming the workspace it belongs to'
);

select is(
  (select count(*)::integer
   from public.list_own_employment_records_service(
     '1a000000-0000-4000-8000-000000000002'
   )
   where employee_id <> '1b000000-0000-4000-8000-000000000001'),
  0,
  'and never carries a record belonging to somebody else'
);

select * from finish();
rollback;
