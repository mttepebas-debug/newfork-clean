begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- A preferred name was storable in name only: the column existed and a check
-- constraint held it at the empty string. A workspace now chooses between
-- answering these itself and letting them through, and this is both answers.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('1c000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preferred-owner@example.test', '', '{}', '{}', now(), now()),
  ('1c000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'preferred-staff@example.test', '', '{}', '{}', now(), now());

insert into public.user_profiles (user_id, display_name)
values
  ('1c000000-0000-4000-8000-000000000001', 'Robin Vance'),
  ('1c000000-0000-4000-8000-000000000002', 'Alexander Okonkwo');

create temporary table preferred_target on commit drop as
select public.create_owner_workspace_service(
  '1c000000-0000-4000-8000-000000000001',
  'Preferred Name Co'
) as workspace_id;

insert into public.employee_profiles (id, workspace_id, user_id, employee_code, first_name, last_name, created_by)
values (
  '1d000000-0000-4000-8000-000000000001',
  (select workspace_id from preferred_target),
  '1c000000-0000-4000-8000-000000000002',
  'E-8001', 'Alexander', 'Okonkwo',
  '1c000000-0000-4000-8000-000000000001'
);

insert into public.workspace_memberships (workspace_id, user_id, role, role_id, status, employee_id)
select
  (select workspace_id from preferred_target),
  '1c000000-0000-4000-8000-000000000002',
  'employee'::public.workspace_role,
  (select id from public.workspace_roles
   where workspace_id = (select workspace_id from preferred_target)
     and system_key = 'employee'),
  'active'::public.membership_status,
  '1d000000-0000-4000-8000-000000000001';

-- A workspace that has never said anything lets them through.
select is(
  public.get_employee_name_settings_service(
    '1c000000-0000-4000-8000-000000000001',
    (select workspace_id from preferred_target)
  ),
  'auto',
  'a workspace that has not chosen lets a preferred name through'
);

select is(
  public.request_employee_preferred_name_service(
    '1c000000-0000-4000-8000-000000000002',
    (select workspace_id from preferred_target),
    '1d000000-0000-4000-8000-000000000001',
    'Alex'
  ),
  'published',
  'and on that setting the name is theirs straight away'
);

select is(
  (select preferred_name from public.employee_profiles
   where id = '1d000000-0000-4000-8000-000000000001'),
  'Alex',
  'which the record shows, where the check constraint used to forbid it'
);

-- Telling the workspace is the point of the auto setting: the name changes
-- without asking, but not without saying.
select is(
  (select count(*)::integer from public.notification_outbox
   where workspace_id = (select workspace_id from preferred_target)
     and type_key = 'people.preferred_name.published'),
  1,
  'and the workspace is told even though nobody had to answer'
);

-- Now the workspace decides to answer them itself.
select public.set_employee_name_settings_service(
  '1c000000-0000-4000-8000-000000000001',
  (select workspace_id from preferred_target),
  'manager'
);

select is(
  public.request_employee_preferred_name_service(
    '1c000000-0000-4000-8000-000000000002',
    (select workspace_id from preferred_target),
    '1d000000-0000-4000-8000-000000000001',
    'Xander'
  ),
  'waiting',
  'on the other setting the same request waits instead'
);

select is(
  (select preferred_name from public.employee_profiles
   where id = '1d000000-0000-4000-8000-000000000001'),
  'Alex',
  'and nothing about the record changes while it waits'
);

select is(
  (select requested_name from public.list_pending_preferred_names_service(
    '1c000000-0000-4000-8000-000000000001',
    (select workspace_id from preferred_target)
  )),
  'Xander',
  'the workspace can see what it has been asked'
);

-- Refused: the name disappears and the person is not told, because being told
-- would make a refusal a conversation the workspace did not choose to have.
select public.decide_employee_preferred_name_service(
  '1c000000-0000-4000-8000-000000000001',
  (select workspace_id from preferred_target),
  (select request_id from public.list_pending_preferred_names_service(
    '1c000000-0000-4000-8000-000000000001',
    (select workspace_id from preferred_target)
  )),
  false
);

select is(
  (select preferred_name from public.employee_profiles
   where id = '1d000000-0000-4000-8000-000000000001'),
  'Alex',
  'a refusal leaves the name that was already there'
);

select is(
  (select count(*)::integer from public.list_pending_preferred_names_service(
    '1c000000-0000-4000-8000-000000000001',
    (select workspace_id from preferred_target)
  )),
  0,
  'and nothing is left waiting'
);

-- Approved: it takes effect.
select public.request_employee_preferred_name_service(
  '1c000000-0000-4000-8000-000000000002',
  (select workspace_id from preferred_target),
  '1d000000-0000-4000-8000-000000000001',
  'Sasha'
);
select public.decide_employee_preferred_name_service(
  '1c000000-0000-4000-8000-000000000001',
  (select workspace_id from preferred_target),
  (select request_id from public.list_pending_preferred_names_service(
    '1c000000-0000-4000-8000-000000000001',
    (select workspace_id from preferred_target)
  )),
  true
);

select is(
  (select preferred_name from public.employee_profiles
   where id = '1d000000-0000-4000-8000-000000000001'),
  'Sasha',
  'an approval is what puts the asked-for name on the record'
);

-- Whose name it is does not depend on who is senior.
select throws_ok(
  $$select public.request_employee_preferred_name_service(
    '1c000000-0000-4000-8000-000000000001',
    (select workspace_id from preferred_target),
    '1d000000-0000-4000-8000-000000000001',
    'Whatever'
  )$$,
  '42501',
  'this record belongs to somebody else',
  'and nobody asks for somebody else''s preferred name, owner included'
);

select * from finish();
rollback;
