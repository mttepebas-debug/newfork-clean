begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

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
-- People join a workspace once its owner has finished setting it up.
update public.workspaces set lifecycle_status = 'active' where id = (select workspace_id from preferred_target);

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
  'Not allowed',
  'and nobody asks for somebody else''s preferred name, owner included'
);

-- BL-099, BL-119: a request waits on the people the core lets decide this
-- person's preferred name (employee.decide_preferred_name: in scope, ranked
-- above them, not themselves); each of them finds it among the names waiting.
select tests.world('pn');
select tests.person('pn', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('pn', 'can', 'manager', array['B'], array['cook']);
select tests.person('pn', 'zeynep', 'admin', array['K'], array['cook']);
select tests.person('pn', 'ali', 'employee', array['K'], array['cook']);
select tests.person('pn', 'bob', 'employee', array['K'], array['cook']);
select tests.person('pn', 'deniz', 'employee', array['B'], array['cook']);
select public.set_employee_name_settings_service(tests.user('pn:owner'), tests.id('pn'), 'manager');

-- Who finds this person's request among the names waiting for them.
create function pg_temp.asked(person text) returns text[] language plpgsql as $$
declare who text; found text[] := '{}';
begin
  foreach who in array array['owner', 'ayse', 'can', 'zeynep', 'ali', 'bob', 'deniz'] loop
    begin
      if exists (select 1 from public.list_pending_preferred_names_service(tests.user('pn:' || who), tests.id('pn')) l
                 where l.employee_id = tests.id('pn:' || person)) then
        found := found || who;
      end if;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  return found;
end $$;
create function pg_temp.pending(target_employee uuid) returns uuid language sql as $$
  select r.id from public.employee_preferred_name_requests r where r.employee_id = target_employee and r.status = 'pending'
$$;
create function pg_temp.name_of(person text) returns text language sql as $$
  select preferred_name from public.employee_profiles where id = tests.id('pn:' || person)
$$;

-- Deniz works at Besiktas: Can, Besiktas's manager, is asked.
select public.request_employee_preferred_name_service(tests.user('pn:deniz'), tests.id('pn'), tests.id('pn:deniz'), 'Den');
select ok('can' = any (pg_temp.asked('deniz')), 'Besiktas''s manager is asked about a Besiktas person''s preferred name');

-- Ali works at Kadikoy.
select public.request_employee_preferred_name_service(tests.user('pn:ali'), tests.id('pn'), tests.id('pn:ali'), 'Al');
select is(pg_temp.asked('ali'), array['owner', 'ayse', 'zeynep'],
  'it asks the owner, Kadikoy''s manager and the admin: not Besiktas''s manager, not a coworker, not Ali');

-- Zeynep, the admin, was asked about Ali; about her own name she is not.
select public.request_employee_preferred_name_service(tests.user('pn:zeynep'), tests.id('pn'), tests.id('pn:zeynep'), 'Zee');
select is(pg_temp.asked('zeynep'), array['owner'],
  'an admin''s own request asks the owner only: not herself, not a manager ranked below her');

-- BL-342: an approval puts the name on the record; a refusal leaves it.
select public.decide_employee_preferred_name_service(tests.user('pn:ayse'), tests.id('pn'), pg_temp.pending(tests.id('pn:ali')), true);
select is(pg_temp.name_of('ali'), 'Al', 'Ayse approves Ali''s name: it is his');
select public.decide_employee_preferred_name_service(tests.user('pn:owner'), tests.id('pn'), pg_temp.pending(tests.id('pn:deniz')), false);
select isnt(pg_temp.name_of('deniz'), 'Den', 'a refused name is not Deniz''s');
-- Nobody ranks above the owner, so the owner's own request does not wait (KK-17).
select is(public.request_employee_preferred_name_service(tests.user('pn:owner'), tests.id('pn'), tests.id('pn:owner'), 'Olly'),
  'published', 'the owner''s own name does not wait for an answer');

-- On auto nobody answers: the name is theirs at once.
select public.set_employee_name_settings_service(tests.user('pn:owner'), tests.id('pn'), 'auto');
select is(public.request_employee_preferred_name_service(tests.user('pn:bob'), tests.id('pn'), tests.id('pn:bob'), 'Rob'),
  'published', 'on auto a name takes effect on its own');
select is(pg_temp.name_of('bob'), 'Rob', 'Bob now goes by Rob');

select * from finish();
rollback;
