begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- The job a person is listed under (the stored primary; failing that the Owner job, then the first
-- job A to Z) is one rule in one place (CLAUDE.md 3.A.4, AVAIL-GUN): the Employees list and
-- Availability's team read both ask app_private.listed_job_name, neither keeps its own copy.

select has_function('app_private', 'listed_job_name', array['uuid'], 'the listed job has one helper');

select ok(
  (select p.proconfig @> array['search_path=""'] from pg_proc p
   where p.oid = 'app_private.listed_job_name(uuid)'::regprocedure),
  'the helper runs with an empty search_path'
);

select ok(
  not has_function_privilege('anon', 'app_private.listed_job_name(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'app_private.listed_job_name(uuid)', 'EXECUTE'),
  'the browser cannot call the helper'
);

select ok(
  (select not p.prosecdef from pg_proc p where p.oid = 'app_private.listed_job_name(uuid)'::regprocedure),
  'the helper is not security definer: it reads with its caller''s rights'
);

select ok(
  (select p.prosrc ~ 'app_private\.listed_job_name\(' from pg_proc p
   where p.oid = 'public.list_employees_service(uuid, uuid, boolean, text, text, integer, integer)'::regprocedure),
  'the Employees list asks the helper'
);

select ok(
  (select p.prosrc ~ 'app_private\.listed_job_name\(' from pg_proc p
   where p.oid = 'public.weekly_team_read_service(uuid, uuid)'::regprocedure),
  'Availability''s team read asks the helper'
);

select is(
  array(
    select p.oid::regprocedure::text from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
      and p.prosrc ~* 'system_key\s*=\s*''owner''\s*,\s*false\s*\)\s*desc'
      and p.oid <> 'app_private.listed_job_name(uuid)'::regprocedure
    order by 1
  ),
  '{}'::text[],
  'no other function keeps a copy of the listed job rule'
);

select * from finish();
rollback;
