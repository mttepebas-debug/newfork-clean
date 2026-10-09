begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Answering a preferred name on the authorization core (FB-6.2.6, BL-099,
-- KK-17): a request goes one rank up, nobody answers their own, the owner's
-- own passes by itself, and a request of another workspace is nobody's here.
-- The matrix probes answering and listing cell by cell; these are the rules
-- it cannot reach.

select tests.world('m');
select tests.world('t');
select tests.person('m', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('m', 'emre', 'employee', array['K'], array['cook']);
select tests.person('m', 'veli', 'employee', array['B'], array['cook']);
select tests.person('t', 'tarik', 'employee', array['K'], array['cook']);
select public.set_employee_name_settings_service(tests.user('m:owner'), tests.id('m'), 'manager');
select public.set_employee_name_settings_service(tests.user('t:owner'), tests.id('t'), 'manager');

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

create function pg_temp.ask(w text, person text, wanted text) returns text language sql as $$
  select public.request_employee_preferred_name_service(
    tests.user(w || ':' || person), tests.id(w), tests.id(w || ':' || person), wanted)
$$;
create function pg_temp.request_of(w text, person text) returns uuid language sql as $$
  select r.id from public.employee_preferred_name_requests r
  where r.employee_id = tests.id(w || ':' || person) order by r.requested_at desc limit 1
$$;
create function pg_temp.answer(actor text, request uuid) returns text language sql as $$
  select pg_temp.refusal(format('select public.decide_employee_preferred_name_service(%L, %L, %L, true)',
    tests.user(actor), tests.id('m'), request))
$$;

-- KK-17: nobody ranks above the owner, so the owner's own request does not wait.
select is(pg_temp.ask('m', 'owner', 'Olly'), 'published', 'the owner''s own preferred name passes by itself');
select is((select preferred_name from public.employee_profiles where id = tests.id('m:owner')), 'Olly',
  'and the record shows it');
select is(pg_temp.ask('m', 'emre', 'Em'), 'waiting', 'an employee''s request waits for an answer');
select is(pg_temp.ask('m', 'ayse', 'Ays'), 'waiting', 'so does a manager''s');
select is(pg_temp.ask('m', 'veli', 'Vel'), 'waiting', 'and one at another location');
select is(pg_temp.ask('t', 'tarik', 'Tar'), 'waiting', 'and one in another workspace');

-- Listing shows what the actor may answer.
select is(
  array(select r.requested_name from public.list_pending_preferred_names_service(tests.user('m:ayse'), tests.id('m')) r order by 1),
  array['Em'], 'a manager lists the requests of employees at their location only, never their own');
select is(
  array(select r.requested_name from public.list_pending_preferred_names_service(tests.user('m:owner'), tests.id('m')) r order by 1),
  array['Ays', 'Em', 'Vel'], 'the owner lists every request of the workspace');
select is(
  pg_temp.refusal(format('select * from public.list_pending_preferred_names_service(%L, %L)', tests.user('m:emre'), tests.id('m'))),
  '42501 authz.missing_permission', 'an employee lists nothing');

-- Answering: a rank up, never one's own, never another workspace's.
select is(pg_temp.answer('m:ayse', pg_temp.request_of('m', 'ayse')), '42501 authz.rank', 'a manager does not answer their own request');
select is(pg_temp.answer('m:ayse', pg_temp.request_of('m', 'veli')), '42501 authz.out_of_scope', 'nor one at another location');
select is(pg_temp.answer('m:ayse', pg_temp.request_of('t', 'tarik')), '42501 authz.out_of_scope', 'nor another workspace''s');
select is(pg_temp.answer('m:ayse', gen_random_uuid()), '42501 authz.out_of_scope', 'an unknown request gets the same answer');
select is(pg_temp.answer('m:ayse', pg_temp.request_of('m', 'emre')), 'allowed', 'a manager answers an employee at their location');
select is(pg_temp.answer('m:ayse', pg_temp.request_of('m', 'emre')), 'P0002 employee.preferred_name.not_pending',
  'an answered request is answered once');
select is(pg_temp.answer('m:owner', pg_temp.request_of('m', 'ayse')), 'allowed', 'the owner answers the manager''s');

select is(
  (select count(*)::integer from pg_proc p
   where p.oid in ('public.decide_employee_preferred_name_service(uuid,uuid,uuid,boolean)'::regprocedure,
                   'public.list_pending_preferred_names_service(uuid,uuid)'::regprocedure)
     and p.prosrc ~ 'service_actor_has_permission'),
  0, 'answering and listing ask the core, not a permission alone'
);

select * from finish();
rollback;
