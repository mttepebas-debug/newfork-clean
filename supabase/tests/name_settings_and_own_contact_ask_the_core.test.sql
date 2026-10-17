begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- BL-443, BL-444 (EMP-001): one's own emergency contact is decided by the
-- authorization core, so the API needs no gate of its own in front of it: it is
-- written on one's own record only; somebody else's record and one that does
-- not exist get the same answer. The preferred-name setting that stood beside it
-- is gone (KARARLAR S-131: a preferred name always waits for its deciders), and
-- with it its two actions.
-- The matrix probes the contact cell by cell; these are the rules it cannot reach.

select tests.world('n');
select tests.world('t');
select tests.person('n', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('n', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('n', 'nur', 'manager', null, null);
select tests.person('n', 'ali', 'employee', array['K'], array['cook']);
select tests.person('n', 'sami', 'employee', array['K'], array['cook'], 'suspended');
select tests.person('n', 'aydan', 'employee', array['K'], array['cook'], 'onboarding');
select tests.person('t', 'tarik', 'employee', array['K'], array['cook']);

create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare
  code text;
  reason text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint;
  return code || ' ' || coalesce(reason, '');
end;
$$;
create function pg_temp.contact(actor text, record uuid) returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.save_own_employment_contact_service(%L, %L, %L, ''Deniz'', ''Sibling'', ''+14155550100'')',
    tests.user(actor), tests.id('n'), record))
$$;

-- 1. The core knows the action, and no longer the setting's two --------------------------

select is(
  (select count(*)::integer from app_private.authz_actions a where a.key in ('settings.people', 'settings.people.read')),
  0, 'S-131: the preferred-name setting''s two actions are gone with it');
select is(
  (select row(a.scope_class, a.effect, a.permission_key, a.restricted_ok)::text
   from app_private.authz_actions a where a.key = 'employee.save_own_contact'),
  '(own,write,,t)', 'one''s own emergency contact is one''s own, onboarding included');
select is(
  (select count(*)::integer from pg_proc p
   where p.oid = 'public.save_own_employment_contact_service(uuid,uuid,uuid,text,text,text,text,text)'::regprocedure
     and (p.prosrc ~ 'service_actor_has_permission' or p.prosrc !~ 'app_private\.authorize\(')),
  0, 'it asks the core, not a permission alone or a rule of its own');

-- 2. One's own emergency contact ---------------------------------------------------------

select is(pg_temp.contact('n:ali', tests.id('n:ali')), 'allowed', 'an employee saves their own emergency contact');
select is(
  (select p.emergency_contact_name from public.employee_private_profiles p where p.employee_id = tests.id('n:ali')),
  'Deniz', 'and the record holds it');
select is(pg_temp.contact('n:ayse', tests.id('n:ali')), '42501 authz.out_of_scope',
  'a manager does not write somebody else''s');
select is(pg_temp.contact('n:owner', tests.id('n:ali')), '42501 authz.out_of_scope',
  'nor the owner: it is about whose record it is');
-- BL-444: no answer tells a record that exists from one that does not.
select is(pg_temp.contact('n:ali', gen_random_uuid()), '42501 authz.out_of_scope',
  'a record that does not exist gets the same answer');
select is(pg_temp.contact('n:ali', tests.id('t:tarik')), '42501 authz.out_of_scope',
  'and so does another workspace''s');
select is(pg_temp.contact('t:tarik', tests.id('n:ali')), '42501 authz.not_member',
  'somebody who is not a member here is told only that');
select is(pg_temp.contact('n:sami', tests.id('n:sami')), '42501 authz.not_active',
  'somebody whose access was taken away no longer writes here');
-- Somebody still onboarding passes the core; with no legal name on file yet it
-- is the record's own rule that answers (owner_legal_name.test.sql).
select is(pg_temp.contact('n:aydan', tests.id('n:aydan')), '23514 ',
  'somebody who has not finished onboarding is let through to the record''s own rule');

select * from finish();
rollback;
