begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- BL-443, BL-444 (EMP-001): the preferred-name setting and one's own emergency
-- contact are decided by the authorization core, so the API needs no gate of
-- its own in front of them. Reading the setting is for whoever reads employees,
-- writing it for whoever manages the workspace's settings, and the emergency
-- contact is written on one's own record only: somebody else's record and one
-- that does not exist get the same answer.
-- The matrix probes the three cell by cell; these are the rules it cannot reach.

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
create function pg_temp.sets(actor text, approval text) returns text language sql as $$
  select pg_temp.refusal(format('select public.set_employee_name_settings_service(%L, %L, %L)',
    tests.user(actor), tests.id('n'), approval))
$$;
-- The setting as the actor reads it, or how they were refused.
create function pg_temp.reads(actor text) returns text language plpgsql as $$
declare
  code text;
  reason text;
begin
  return public.get_employee_name_settings_service(tests.user(actor), tests.id('n'));
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint;
  return code || ' ' || coalesce(reason, '');
end;
$$;
create function pg_temp.contact(actor text, record uuid) returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.save_own_employment_contact_service(%L, %L, %L, ''Deniz'', ''Sibling'', ''4155550100'')',
    tests.user(actor), tests.id('n'), record))
$$;

-- 1. The core knows the two new actions ------------------------------------------------

select is(
  (select row(a.scope_class, a.effect, a.permission_key, a.restricted_ok)::text
   from app_private.authz_actions a where a.key = 'settings.people.read'),
  '(org,read,employees.read,f)', 'reading the people settings is about the workspace, for whoever reads employees');
select is(
  (select row(a.scope_class, a.effect, a.permission_key, a.restricted_ok)::text
   from app_private.authz_actions a where a.key = 'employee.save_own_contact'),
  '(own,write,,t)', 'one''s own emergency contact is one''s own, onboarding included');
select is(
  (select count(*)::integer from pg_proc p
   where p.oid in ('public.get_employee_name_settings_service(uuid,uuid)'::regprocedure,
                   'public.set_employee_name_settings_service(uuid,uuid,text)'::regprocedure,
                   'public.save_own_employment_contact_service(uuid,uuid,uuid,text,text,text,text,text)'::regprocedure)
     and (p.prosrc ~ 'service_actor_has_permission' or p.prosrc !~ 'app_private\.authorize\(')),
  0, 'the three ask the core, not a permission alone or a rule of their own');

-- 2. Writing the setting -----------------------------------------------------------------

select is(pg_temp.sets('n:owner', 'manager'), 'allowed', 'the owner chooses who answers a preferred name');
select is(pg_temp.sets('n:zeynep', 'auto'), 'allowed', 'so does an admin');
select is(pg_temp.sets('n:ayse', 'manager'), '42501 authz.missing_permission', 'a manager does not');
select is(pg_temp.sets('n:ali', 'manager'), '42501 authz.missing_permission', 'nor an employee');
select is(pg_temp.sets('t:owner', 'manager'), '42501 authz.not_member', 'nor the owner of another workspace');
select is(pg_temp.sets('n:owner', 'sometimes'), '22023 settings.preferred_name.invalid',
  'a value that is neither answer is refused as before');
select is(
  (select s.preferred_name_approval from public.employee_name_settings s where s.workspace_id = tests.id('n')),
  'auto', 'a refused write leaves the setting as it was');

-- 3. Reading the setting -----------------------------------------------------------------

select is(pg_temp.reads('n:owner'), 'auto', 'the owner reads it');
select is(pg_temp.reads('n:zeynep'), 'auto', 'an admin reads it');
select is(pg_temp.reads('n:ayse'), 'auto', 'a manager reads it: the Employees drawer needs it');
select is(pg_temp.reads('n:nur'), 'auto', 'a manager with no location too: it is about the workspace');
select is(pg_temp.reads('n:ali'), '42501 authz.missing_permission', 'an employee does not');
select is(pg_temp.reads('t:owner'), '42501 authz.not_member', 'nor the owner of another workspace');

-- 4. One's own emergency contact ---------------------------------------------------------

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
