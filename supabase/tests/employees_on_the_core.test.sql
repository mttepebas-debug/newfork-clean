begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- The Employees slice on the authorization core (FB-6.2): the rules the
-- authorization matrix cannot probe cell by cell.

select tests.world('m');
select tests.person('m', 'emre', 'employee', array['K'], array['cook']);

-- BL-270: a membership row changed with nobody signed in used to pass the
-- role-change trigger untouched (it returned early when auth.uid() was null).
select todo('BL-270: the membership trigger asks the core in FB-6.2.4', 1);
select throws_ok(
  format($$update public.workspace_memberships
    set role = 'admin', role_id = (select r.id from public.workspace_roles r where r.workspace_id = %L and r.system_key = 'admin')
    where workspace_id = %L and user_id = %L$$, tests.id('m'), tests.id('m'), tests.user('m:emre')),
  '42501', null,
  'a membership change with nobody signed in is refused'
);

select * from finish();
rollback;
