begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Reviewing somebody's onboarding (Employees > a person > Onboarding: accept or
-- reject a step, activate) asks the authorization core whether the actor may
-- review that person (FB-6.2 .6, coordinator decision (a) 2026-09-30): the
-- owner, an admin, or a manager where the person works; nobody else, and
-- every refusal says why. The old "may I manage this record" helper goes.

select tests.world('m');
select tests.person('m', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('m', 'kaan', 'admin', array['B'], array['server']);
select tests.person('m', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('m', 'deniz', 'manager', array['K'], array['cook']);
select tests.person('m', 'mehmet', 'manager', array['B'], array['cook']);
-- Manages Besiktas without taking shifts: assigned there and excluded from the
-- Schedule (EMP-001).
select tests.person('m', 'selin', 'manager', array['B'], array['cook']);
select tests.excluded('m', 'selin');
-- A manager who accepted but has not finished their own onboarding.
select tests.person('m', 'nur', 'manager', array['K'], array['cook'], 'onboarding');
select tests.person('m', 'emre', 'employee', array['K'], array['cook']);
select tests.person('m', 'veli', 'employee', array['B'], array['cook']);
select tests.world('x');
select tests.person('x', 'xena', 'employee', array['K'], array['cook']);

-- Opens the review of the person's onboarding with an action the service does
-- not know: whoever passes the gate hears 22023, whoever does not hears 42501
-- and why. Nothing is written either way.
create function pg_temp.review(actor text, person uuid) returns text language plpgsql as $$
declare
  code text;
  reason text;
begin
  perform public.review_employee_onboarding_before_availability_service(
    tests.user('m:' || actor), tests.id('m'), person, 'look', null, null,
    coalesce((select c.revision from public.employee_onboarding_cases c where c.employee_id = person), 1), false);
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint;
  return case when code = '22023' then 'passes' else code || ' ' || coalesce(reason, '') end;
end;
$$;

select is(pg_temp.review('owner', tests.id('m:emre')), 'passes', 'the owner reviews an employee''s onboarding');
select is(pg_temp.review('owner', tests.id('m:zeynep')), 'passes', 'and an admin''s');
select is(pg_temp.review('zeynep', tests.id('m:ayse')), 'passes', 'an admin reviews a manager''s');
select is(pg_temp.review('ayse', tests.id('m:emre')), 'passes',
  'a manager reviews an employee at their location');
select is(pg_temp.review('selin', tests.id('m:veli')), 'passes',
  'and so does a manager who is excluded from the Schedule, at the location they are assigned to');

select is(pg_temp.review('ayse', tests.id('m:veli')), '42501 authz.out_of_scope',
  'not somebody at another location');
select is(pg_temp.review('ayse', tests.id('x:xena')), '42501 authz.out_of_scope',
  'not somebody in another workspace');
select is(pg_temp.review('ayse', gen_random_uuid()), '42501 authz.out_of_scope',
  'an unknown person gets the answer somebody out of reach gets');
select is(pg_temp.review('emre', tests.id('m:veli')), '42501 authz.missing_permission',
  'an employee reviews nobody');
select is(pg_temp.review('emre', tests.id('m:emre')), '42501 authz.missing_permission',
  'not even their own');

select is(pg_temp.review('ayse', tests.id('m:deniz')), '42501 authz.rank',
  'a manager does not review another manager at their location');
select is(pg_temp.review('ayse', tests.id('m:owner')), '42501 authz.rank', 'nor the owner');
select is(pg_temp.review('zeynep', tests.id('m:kaan')), '42501 authz.rank',
  'an admin does not review another admin (KK-24)');
select is(pg_temp.review('owner', tests.id('m:owner')), '42501 authz.rank',
  'nobody reviews their own onboarding');
select is(pg_temp.review('nur', tests.id('m:emre')), '42501 authz.not_active',
  'a manager still finishing their own onboarding reviews nobody');

select is(
  (select count(*)::integer from pg_proc p
   where p.oid = 'public.review_employee_onboarding_before_availability_service(uuid,uuid,uuid,text,uuid,text,integer,boolean)'::regprocedure
     and p.prosrc ~ 'app_private\.authorize\(' and p.prosrc !~ 'request\.jwt\.claim'
     and p.prosrc !~ 'can_manage_employee_record'),
  1, 'the review asks the core and pretends to be nobody'
);
select is(to_regprocedure('public.can_manage_employee_record(uuid,uuid)'), null,
  'the old "may I manage this record" helper is gone');

select * from finish();
rollback;
