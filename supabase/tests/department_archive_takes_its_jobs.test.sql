begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Settings > Jobs (Mert, 2026-10-13, Jobs decision 6). Archiving a department
-- takes its active jobs to the archive with it. Restoring the department
-- brings it back with no jobs; a job restored while its department is still
-- archived comes back under No department, otherwise under its department.
-- An archived department takes no active job.
-- Example: the owner archives Kitchen; Cook goes with it, Server (archived a
-- day earlier) keeps its own date. Cook restored alone lands under No
-- department; Kitchen restored comes back empty; Server restored then goes
-- back under Kitchen.

select tests.world('dj');
select tests.person('dj', 'emp', 'employee', array['K'], array['cook']);

-- The SQLSTATE and hint a browser statement is refused with, or 'allowed'.
create function pg_temp.refusal(actor uuid, statement text) returns text
language plpgsql as $$
declare state text; hint text;
begin
  perform tests.as_browser(actor, statement);
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
  return state || coalesce(' ' || nullif(hint, ''), '');
end;
$$;
create function pg_temp.job(label text) returns public.jobs language sql as $$
  select j from public.jobs j where j.id = tests.id('dj:job:' || label)
$$;
create function pg_temp.kitchen_archived_at() returns timestamptz language sql as $$
  select d.archived_at from public.departments d where d.id = tests.id('dj:kitchen')
$$;

-- Server was archived a day before the department.
select is(pg_temp.refusal(tests.user('dj:owner'), format(
  'update public.jobs set archived_at = now() where id = %L', tests.id('dj:job:server'))), 'allowed',
  'the owner archives Server');
update public.jobs set archived_at = now() - interval '1 day' where id = tests.id('dj:job:server');

-- Someone without Settings > Jobs archives nothing, and no job with it.
select is(tests.as_browser(tests.user('dj:emp'), format(
  'update public.departments set archived_at = now() where id = %L', tests.id('dj:kitchen'))), 0,
  'an employee cannot archive Kitchen');
select ok((pg_temp.job('cook')).archived_at is null, 'so Cook stays active');

select is(pg_temp.refusal(tests.user('dj:owner'), format(
  'update public.departments set archived_at = now(), updated_at = now() where id = %L', tests.id('dj:kitchen'))), 'allowed',
  'the owner archives Kitchen while Cook is still active');
select ok(pg_temp.kitchen_archived_at() is not null, 'Kitchen is archived');
select is((pg_temp.job('cook')).archived_at, pg_temp.kitchen_archived_at(), 'Cook goes to the archive with Kitchen, on the same date');
select is((pg_temp.job('cook')).department_id, tests.id('dj:kitchen'), 'Cook stays filed under Kitchen in the archive');
select is((pg_temp.job('server')).archived_at, now() - interval '1 day', 'Server, archived before, keeps its own date');
select ok(
  exists (select 1 from public.audit_events e
    where e.workspace_id = tests.id('dj') and e.target_id = tests.id('dj:job:cook')::text
      and e.action = 'job.archived' and e.actor_user_id = tests.user('dj:owner')),
  'Cook''s archive is in the audit trail like any other');

-- An archived department takes no active job.
select is(pg_temp.refusal(tests.user('dj:owner'), format(
  $$insert into public.jobs (workspace_id, department_id, name, color) values (%L, %L, 'Prep', '#D39A36')$$,
  tests.id('dj'), tests.id('dj:kitchen'))), '22023 department.archived',
  'a new job cannot go under archived Kitchen');

-- Cook restored alone, while Kitchen is archived, comes back under No department.
select is(pg_temp.refusal(tests.user('dj:owner'), format(
  'update public.jobs set archived_at = null, updated_at = now() where id = %L', tests.id('dj:job:cook'))), 'allowed',
  'the owner restores Cook');
select ok((pg_temp.job('cook')).archived_at is null and (pg_temp.job('cook')).department_id is null,
  'Cook is active again, under No department');
select is(pg_temp.refusal(tests.user('dj:owner'), format(
  'update public.jobs set department_id = %L, updated_at = now() where id = %L', tests.id('dj:kitchen'), tests.id('dj:job:cook'))),
  '22023 department.archived', 'an active job cannot move under archived Kitchen');

-- Kitchen restored comes back with no jobs; Server then goes back under it.
select is(pg_temp.refusal(tests.user('dj:owner'), format(
  'update public.departments set archived_at = null, updated_at = now() where id = %L', tests.id('dj:kitchen'))), 'allowed',
  'the owner restores Kitchen');
select ok((pg_temp.job('server')).archived_at is not null, 'Kitchen comes back with no jobs: Server stays archived');
select is(pg_temp.refusal(tests.user('dj:owner'), format(
  'update public.jobs set archived_at = null, updated_at = now() where id = %L', tests.id('dj:job:server'))), 'allowed',
  'the owner restores Server');
select is((pg_temp.job('server')).department_id, tests.id('dj:kitchen'), 'Server goes back under Kitchen, now active');

select * from finish();
rollback;
