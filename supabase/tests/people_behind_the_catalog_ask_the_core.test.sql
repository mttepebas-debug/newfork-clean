begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- The last callers of the old person helpers ask the authorization core
-- (FB-6.2 .6, P1): job assignments, catalog deletion, the dashboard's to-dos.
-- The rule each one follows is the Employees rule: whoever may read a record
-- sees it, whoever may save it changes its jobs; a location goes with
-- whoever may write locations (BL-187).

select tests.world('m');
select tests.person('m', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('m', 'kaan', 'admin', array['B'], array['server']);
select tests.person('m', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('m', 'mehmet', 'manager', array['B'], array['cook']);
-- Manages Besiktas without working there (KARARLAR "yalnız yönetir", KK-29).
select tests.person('m', 'selin', 'manager', null, null);
select tests.manages('m', 'selin', 'B');
select tests.person('m', 'emre', 'employee', array['K'], array['cook']);
select tests.person('m', 'veli', 'employee', array['B'], array['cook']);
select tests.world('x');
select tests.person('x', 'xena', 'employee', array['K'], array['cook']);

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

-- Putting somebody on a job, as Settings > Jobs > Assign does.
create function pg_temp.assign(actor text, person uuid) returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.update_job_assignments_service(%L, %L, %L, %L)',
    tests.user('m:' || actor), tests.id('m'), tests.id('m:job:server'),
    jsonb_build_array(jsonb_build_object('employee_id', person, 'assigned', true,
      'expected_revision', coalesce((select e.revision from public.employee_profiles e where e.id = person), 1)))))
$$;

-- Who the Assign drawer lists, and whom it lets the actor change.
create function pg_temp.listed(actor text, person text) returns text language sql as $$
  select coalesce((
    select case when (c ->> 'can_manage')::boolean then 'manages' else 'reads' end
    from jsonb_array_elements(public.read_job_assignments_service(
      tests.user('m:' || actor), tests.id('m'), tests.id('m:job:server'), '', null, 'all', 0, false) -> 'employees') c
    where (c ->> 'employee_id')::uuid = tests.id('m:' || person)), 'hidden')
$$;

-- 1. Job assignments ---------------------------------------------------------------

select is(pg_temp.assign('ayse', tests.id('m:emre')), 'allowed',
  'a manager puts an employee at their location on a job');
select is(pg_temp.assign('selin', tests.id('m:veli')), 'allowed',
  'a manager who only manages Besiktas puts somebody there on a job');
select is(pg_temp.assign('ayse', tests.id('m:veli')), '42501 authz.out_of_scope',
  'not somebody at another location');
select is(pg_temp.assign('ayse', tests.id('m:owner')), '42501 authz.rank',
  'not the owner who works at their location');
select is(pg_temp.assign('zeynep', tests.id('m:kaan')), '42501 authz.rank',
  'an admin does not change another admin''s jobs (KK-24)');
select is(pg_temp.assign('ayse', gen_random_uuid()), '42501 authz.out_of_scope',
  'an unknown person gets the answer somebody out of reach gets');
select is(pg_temp.assign('ayse', tests.id('x:xena')), '42501 authz.out_of_scope',
  'and so does somebody in another workspace');
select is(pg_temp.assign('emre', tests.id('m:emre')), '42501 authz.missing_permission',
  'an employee assigns nobody');

select is(pg_temp.listed('ayse', 'owner'), 'reads',
  'the Assign drawer lists the owner at the manager''s location, read-only (M2, KK-8)');
select is(pg_temp.listed('ayse', 'zeynep'), 'reads', 'and the admin there, read-only');
select is(pg_temp.listed('ayse', 'veli'), 'hidden', 'nobody from another location');
select is(pg_temp.listed('mehmet', 'selin'), 'reads',
  'a manager who only manages Besiktas is there for Besiktas''s other manager (KK-29)');
select is(pg_temp.listed('owner', 'zeynep'), 'manages', 'the owner changes an admin''s jobs');
select is(pg_temp.listed('zeynep', 'kaan'), 'reads', 'an admin reads another admin''s');
select is(
  (select (c ->> 'employee_count')::integer
   from jsonb_array_elements(public.organization_job_counts_service(tests.user('m:ayse'), tests.id('m')) -> 'jobs') c
   where (c ->> 'id')::uuid = tests.id('m:job:server')),
  2, 'Settings > Jobs counts the people the manager may read: the admin and the employee at Kadikoy'
);
select is(
  pg_temp.refusal(format('select public.organization_job_counts_service(%L, %L)', tests.user('m:emre'), tests.id('m'))),
  '42501 authz.missing_permission', 'an employee reads no job counts'
);

-- 2. Deleting a job or a location ------------------------------------------------------

select is(
  pg_temp.refusal(format('select public.delete_job_with_assignments_service(%L, %L, %L)',
    tests.user('m:ayse'), tests.id('m'), tests.id('m:job:server'))),
  '42501 authz.missing_permission', 'a manager deletes no job'
);
select is(
  pg_temp.refusal(format('select public.delete_catalog_entity_service(%L, %L, %L, %L)',
    tests.user('m:ayse'), tests.id('m'), 'locations', tests.id('m:K'))),
  '42501 authz.missing_permission', 'a manager deletes no location (BL-187: not theirs to delete)'
);
select is(
  pg_temp.refusal(format('select public.delete_catalog_entity_service(%L, %L, %L, %L)',
    tests.user('m:zeynep'), tests.id('m'), 'locations', tests.id('m:B'))),
  'allowed', 'an admin deletes a location, whoever works there (BL-187)'
);
select is(
  pg_temp.refusal(format('select public.delete_catalog_entity_service(%L, %L, %L, %L)',
    tests.user('m:owner'), tests.id('m'), 'locations', tests.id('m:K'))),
  'allowed', 'the owner deletes a location they work at themselves (BL-187)'
);

select * from finish();
rollback;
