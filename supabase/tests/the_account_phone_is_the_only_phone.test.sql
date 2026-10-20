begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- BL-335 / KK-7. The account holds a person's phone; every live employee record
-- of theirs carries a copy that follows it. Ali works in two workspaces, has an
-- archived record in a third and a suspended membership in a fourth. Bea works
-- beside him. Mia manages them.

select tests.world('ph');
select tests.person('ph', 'ali', 'employee');
select tests.person('ph', 'bea', 'employee');
select tests.person('ph', 'mia', 'manager');

create temporary table ph on commit drop as
select
  tests.user('ph:ali') as ali,
  tests.user('ph:bea') as bea,
  tests.user('ph:mia') as mia,
  tests.user('ph:owner') as owner,
  tests.id('ph') as workspace,
  tests.id('ph:ali') as ali_here,
  tests.id('ph:bea') as bea_here,
  tests.id('ph:mia') as mia_here,
  (select e.id from public.employee_profiles e
   where e.workspace_id = tests.id('ph') and e.user_id = tests.user('ph:owner')) as owner_here;

-- Three more workspaces with a record of Ali's each, written straight to the
-- tables with a number that is not his account's.
insert into public.workspaces (id, name, created_by)
select w.id, w.name, (select owner from ph)
from (values
  ('33500000-0000-4000-8000-000000000001'::uuid, 'Second job'),
  ('33500000-0000-4000-8000-000000000002'::uuid, 'Old job'),
  ('33500000-0000-4000-8000-000000000003'::uuid, 'Paused job')
) as w(id, name);
select public.initialize_workspace_roles(id)
from public.workspaces where id::text like '33500000-%';

insert into public.employee_profiles (id, workspace_id, user_id, employee_code, first_name, last_name, created_by, archived_at)
select r.id, r.workspace_id, (select ali from ph), r.code, 'Ali', 'Person', (select owner from ph), r.archived_at
from (values
  ('33510000-0000-4000-8000-000000000001'::uuid, '33500000-0000-4000-8000-000000000001'::uuid, 'E-3351', null::timestamptz),
  ('33510000-0000-4000-8000-000000000002'::uuid, '33500000-0000-4000-8000-000000000002'::uuid, 'E-3352', now()),
  ('33510000-0000-4000-8000-000000000003'::uuid, '33500000-0000-4000-8000-000000000003'::uuid, 'E-3353', null)
) as r(id, workspace_id, code, archived_at);

insert into public.workspace_memberships (workspace_id, user_id, status, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(legacy.role_id::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(legacy.role_id::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (select m.workspace_id, (select ali from ph), 'employee'::public.workspace_role,
  (select id from public.workspace_roles where workspace_id = m.workspace_id and system_key = 'employee'),
  m.status::public.membership_status, m.employee_id
from (values
  ('33500000-0000-4000-8000-000000000001'::uuid, 'active', '33510000-0000-4000-8000-000000000001'::uuid),
  ('33500000-0000-4000-8000-000000000002'::uuid, 'active', '33510000-0000-4000-8000-000000000002'::uuid),
  ('33500000-0000-4000-8000-000000000003'::uuid, 'suspended', '33510000-0000-4000-8000-000000000003'::uuid)
) as m(workspace_id, status, employee_id)) as legacy(workspace_id, user_id, role, role_id, status, employee_id);

insert into public.employee_private_profiles (employee_id, workspace_id, legal_first_name, legal_last_name, phone)
select e.id, e.workspace_id, 'Ali', 'Person', '+13105550000'
from public.employee_profiles e where e.id::text like '33510000-%';

create function pg_temp.phone_of(target_employee_id uuid) returns text
language sql as $$
  select phone from public.employee_private_profiles where employee_id = target_employee_id
$$;

-- Onboarding (tests.person) typed Ali's own number into an empty account.
select is(
  (select phone_e164 from public.user_profiles where user_id = (select ali from ph)),
  tests.phone('ph:ali'),
  'onboarding writes the number to an empty account, in E.164'
);
select is(pg_temp.phone_of((select ali_here from ph)), tests.phone('ph:ali'),
  'and the record it opened carries the account''s number');

-- (a) Ali changes his number the way Account > Profile does it.
select is(
  tests.as_browser((select ali from ph), format(
    'update public.user_profiles set phone_e164 = %L where user_id = %L', '+13125550199', (select ali from ph))),
  1,
  'Ali can change his own account phone'
);
select is(pg_temp.phone_of((select ali_here from ph)), '+13125550199',
  'his record in the first workspace follows');
select is(pg_temp.phone_of('33510000-0000-4000-8000-000000000001'), '+13125550199',
  'and so does his record in the second workspace');

-- (b) What does not follow.
select is(pg_temp.phone_of('33510000-0000-4000-8000-000000000002'), '+13105550000',
  'an archived record keeps the number it had');
select is(pg_temp.phone_of('33510000-0000-4000-8000-000000000003'), '+13105550000',
  'a record behind a suspended membership keeps the number it had');
select is(pg_temp.phone_of((select bea_here from ph)), tests.phone('ph:bea'),
  'somebody else''s record is not touched');

-- (c) The manager's side. First what her own session can do, so the refusals
-- below are refusals and not a broken session.
select is(
  tests.as_browser((select mia from ph), format(
    'update public.user_profiles set phone_e164 = %L where user_id = %L', '+13125550111', (select mia from ph))),
  1,
  'Mia can change her own account phone'
);
select is(pg_temp.phone_of((select mia_here from ph)), '+13125550111',
  'and her own record follows it');
select is(
  tests.as_browser((select mia from ph), format(
    'update public.user_profiles set phone_e164 = %L where user_id = %L', '+19175550000', (select ali from ph))),
  0,
  'Mia cannot change Ali''s account phone'
);
select throws_ok(
  format($$select tests.as_browser(%L, %L)$$,
    (select mia from ph),
    format('update public.employee_private_profiles set phone = %L where employee_id = %L',
      '+19175550000', (select ali_here from ph))),
  '42501',
  null,
  'Mia cannot write the phone on Ali''s record'
);
select is(pg_temp.phone_of((select ali_here from ph)), '+13125550199',
  'Ali''s record still carries his own number');

-- Clearing the account clears the copies.
select is(
  tests.as_browser((select ali from ph), format(
    'update public.user_profiles set phone_e164 = null where user_id = %L', (select ali from ph))),
  1,
  'Ali can clear his account phone'
);
select is(
  (select count(*)::integer from public.employee_private_profiles
   where employee_id in ((select ali_here from ph), '33510000-0000-4000-8000-000000000001') and phone is null),
  2,
  'and both live records are cleared with it'
);

-- The contact form takes a personal phone only into an empty account. The
-- owner's account has none yet.
select throws_ok(
  format($$select public.save_own_employment_contact_service(%L, %L, %L, 'Morgan', 'Spouse', '+13105550101', '', 'call me maybe')$$,
    (select owner from ph), (select workspace from ph), (select owner_here from ph)),
  '22023',
  'that phone number cannot be dialled',
  'a number that cannot be put in E.164 is refused'
);
select public.save_own_employment_contact_service(
  (select owner from ph), (select workspace from ph), (select owner_here from ph),
  'Morgan', 'Spouse', '+13105550101', '', '(312) 555-0177'
);
select is(
  (select phone_e164 from public.user_profiles where user_id = (select owner from ph)),
  '+13125550177',
  'an empty account takes the personal phone, in E.164'
);
select is(pg_temp.phone_of((select owner_here from ph)), '+13125550177',
  'and the owner''s record copies it from the account');

select public.save_own_employment_contact_service(
  (select owner from ph), (select workspace from ph), (select owner_here from ph),
  'Morgan', 'Spouse', '+13105550101', '', '3125550999'
);
select is(
  (select phone_e164 from public.user_profiles where user_id = (select owner from ph)),
  '+13125550177',
  'an account that has a phone keeps it; the form does not replace it'
);
select is(pg_temp.phone_of((select owner_here from ph)), '+13125550177',
  'and neither does the record');

select * from finish();
rollback;
