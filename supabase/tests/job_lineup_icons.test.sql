begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

-- A job's Lineup icons (AVATAR-IKON 2.1). Every job is born with the drawings
-- the archive suggests for its name, whoever opens it: a service, the owner's
-- setup (General Manager, Assistant Manager, Owner) or a browser insert. A job
-- opened with an explicit empty list stays empty; renaming a job keeps its
-- list; the list changes only through the job services, never from a browser
-- update. Example: the owner opens "Bartender" with no icons and it gets the
-- bar drawings; renamed "Head Bartender" it keeps them.
-- The five job-writing services ask the authorization core: settings.jobs.write
-- for job details, and for assignments alone the employee.save gate
-- update_job_assignments_service asks ("may they change anyone's jobs at all").

select tests.world('li');
select tests.world('lo');
select tests.person('li', 'mona', 'manager', array['K'], array['cook']);
select tests.person('li', 'eda', 'employee', array['K'], array['cook']);

-- The SQLSTATE and hint a statement is refused with, or 'allowed'.
create function pg_temp.refusal(statement text) returns text
language plpgsql as $$
declare state text; hint text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
  return state || coalesce(' ' || nullif(hint, ''), '');
end;
$$;
create function pg_temp.browser_refusal(actor uuid, statement text) returns text
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
create function pg_temp.icons(job uuid) returns text[] language sql as $$
  select j.lineup_icons from public.jobs j where j.id = job
$$;
create function pg_temp.revision(employee uuid) returns integer language sql as $$
  select e.revision from public.employee_profiles e where e.id = employee
$$;

-- Three archive drawings to choose from, and 25 for one too many.
create temporary table pick as
select array_agg(key order by no) filter (where no_rank <= 3) as three,
       array_agg(key order by no) filter (where no_rank <= 25) as twenty_five
from (select key, no, row_number() over (order by no) as no_rank from app_private.lineup_art) a;

-- The column: a list, never missing, with no default (an omitted list is the trigger's to suggest).
select col_not_null('public', 'jobs', 'lineup_icons', 'every job has a Lineup icon list');
select col_hasnt_default('public', 'jobs', 'lineup_icons', 'the list has no default: an omitted one is suggested');
select col_type_is('public', 'jobs', 'lineup_icons', 'text[]', 'the list is text keys');
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
     and pg_get_userbyid(p.proowner) = 'postgres'
   from pg_proc p where p.oid = 'app_private.jobs_lineup_icons()'::regprocedure),
  'the suggestion trigger runs as its owner with an empty search path');

-- born_with_suggestion
select ok(cardinality(app_private.suggest_lineup_art('Bartender')) > 0, 'the archive has drawings for a Bartender');
select tests.remember('li:job:bartender', (public.create_job_with_assignments_service(
  tests.user('li:owner'), tests.id('li'),
  '{"name": "Bartender", "color": "#4478A8", "department_id": null}', '[]') -> 'job' ->> 'id')::uuid);
select is(pg_temp.icons(tests.id('li:job:bartender')), app_private.suggest_lineup_art('Bartender'),
  'a job opened without icons is born with the suggestion for its name');
select is(
  (public.read_settings_jobs_service(tests.user('li:owner'), tests.id('li')) -> 'jobs')
    @> jsonb_build_array(jsonb_build_object('name', 'Bartender', 'lineup_icons', to_jsonb(app_private.suggest_lineup_art('Bartender')))),
  true, 'and Settings > Jobs reads it back');

-- born_with_suggestion_everywhere
select is(
  array(select j.name from public.jobs j
        where j.workspace_id = tests.id('li') and j.lineup_icons is distinct from app_private.suggest_lineup_art(j.name)
        order by 1),
  '{}'::text[],
  'setup''s General Manager, Assistant Manager and Owner, and Kitchen''s Cook and Server, are born with their suggestion');
select is(
  (select count(*)::integer from public.jobs j
   where j.workspace_id = tests.id('li') and j.name in ('General Manager', 'Assistant Manager', 'Owner', 'Cook', 'Server')),
  5, 'all five are there');
select is(pg_temp.browser_refusal(tests.user('li:owner'), format(
  $$insert into public.jobs (workspace_id, name, color) values (%L, 'Dishwasher', '#123456')$$, tests.id('li'))),
  'allowed', 'the owner''s browser opens a job directly (Settings > Jobs, PostgREST)');
select is(
  (select j.lineup_icons from public.jobs j where j.workspace_id = tests.id('li') and j.name = 'Dishwasher'),
  app_private.suggest_lineup_art('Dishwasher'), 'that job is born with its suggestion too');
select lives_ok(format(
  $$select public.update_department_with_jobs_service(%L, %L, %L, '{"name": "Kitchen", "color": "#3C7A68"}',
    '[{"name": "Barback", "color": "#123456"}]')$$,
  tests.user('li:owner'), tests.id('li'), tests.id('li:kitchen')),
  'the owner adds a job while saving Kitchen');
select is(
  (select j.lineup_icons from public.jobs j where j.workspace_id = tests.id('li') and j.name = 'Barback'),
  app_private.suggest_lineup_art('Barback'), 'that job is born with its suggestion too');

-- explicit_empty_kept
select tests.remember('li:job:runner', (public.create_job_with_assignments_service(
  tests.user('li:owner'), tests.id('li'),
  '{"name": "Food Runner", "color": "#4478A8", "department_id": null, "lineup_icons": []}', '[]') -> 'job' ->> 'id')::uuid);
select is(pg_temp.icons(tests.id('li:job:runner')), '{}'::text[], 'a job opened with no icons on purpose stays empty');
select is(pg_temp.browser_refusal(tests.user('li:owner'), format(
  $$insert into public.jobs (workspace_id, name, color, lineup_icons) values (%L, 'Host', '#123456', '{}')$$, tests.id('li'))),
  'allowed', 'a browser insert with an empty list');
select is((select j.lineup_icons from public.jobs j where j.workspace_id = tests.id('li') and j.name = 'Host'),
  '{}'::text[], 'stays empty too');
select tests.remember('li:job:chosen', (public.create_job_with_assignments_service(
  tests.user('li:owner'), tests.id('li'),
  jsonb_build_object('name', 'Sommelier', 'color', '#4478A8', 'department_id', null, 'lineup_icons', to_jsonb((select three from pick))),
  '[]') -> 'job' ->> 'id')::uuid);
select is(pg_temp.icons(tests.id('li:job:chosen')), (select three from pick), 'a job opened with chosen icons keeps them, in order');

-- rename_keeps_icons
select lives_ok(format(
  $$select public.update_job_details_and_assignments_service(%L, %L, %L,
    jsonb_build_object('name', 'Head Bartender', 'color', '#4478A8', 'department_id', null, 'lineup_icons', to_jsonb(%L::text[])),
    jsonb_build_object('name', 'Bartender', 'color', '#4478A8', 'department_id', null, 'lineup_icons', to_jsonb(%L::text[])))$$,
  tests.user('li:owner'), tests.id('li'), tests.id('li:job:bartender'),
  app_private.suggest_lineup_art('Bartender'), app_private.suggest_lineup_art('Bartender')),
  'the owner renames Bartender to Head Bartender');
select is(pg_temp.icons(tests.id('li:job:bartender')), app_private.suggest_lineup_art('Bartender'),
  'the renamed job keeps its icons');
select is(pg_temp.browser_refusal(tests.user('li:owner'), format(
  $$update public.jobs set name = 'Bar Lead', updated_at = now() where id = %L$$, tests.id('li:job:bartender'))),
  'allowed', 'the owner''s browser renames it again');
select is(pg_temp.icons(tests.id('li:job:bartender')), app_private.suggest_lineup_art('Bartender'),
  'and it still keeps its icons');
select lives_ok(format(
  $$select public.update_job_details_and_assignments_service(%L, %L, %L,
    jsonb_build_object('name', 'Bar Lead', 'color', '#4478A8', 'department_id', null, 'lineup_icons', to_jsonb(%L::text[])),
    jsonb_build_object('name', 'Bar Lead', 'color', '#4478A8', 'department_id', null, 'lineup_icons', to_jsonb(%L::text[])))$$,
  tests.user('li:owner'), tests.id('li'), tests.id('li:job:bartender'),
  (select three from pick), app_private.suggest_lineup_art('Bartender')),
  'the owner saves three icons with the job''s details');
select is(pg_temp.icons(tests.id('li:job:bartender')), (select three from pick), 'the job holds the three');

-- expected_record_includes_icons: the drawer was opened before somebody changed the icons.
select is(pg_temp.refusal(format(
  $$select public.update_job_details_and_assignments_service(%L, %L, %L,
    jsonb_build_object('name', 'Bar Lead', 'color', '#4478A8', 'department_id', null, 'lineup_icons', '[]'::jsonb),
    jsonb_build_object('name', 'Bar Lead', 'color', '#4478A8', 'department_id', null, 'lineup_icons', to_jsonb(%L::text[])))$$,
  tests.user('li:owner'), tests.id('li'), tests.id('li:job:bartender'), app_private.suggest_lineup_art('Bartender'))),
  'PT409 job.changed', 'saving over icons somebody changed meanwhile is refused as changed');
select is(pg_temp.icons(tests.id('li:job:bartender')), (select three from pick), 'and the icons stay as they were');

-- invalid_key_refused
select is(pg_temp.refusal(format(
  $$select public.create_job_with_assignments_service(%L, %L,
    '{"name": "Barista", "color": "#4478A8", "department_id": null, "lineup_icons": ["no-such-drawing"]}', '[]')$$,
  tests.user('li:owner'), tests.id('li'))),
  '22023 job.lineup_icons_invalid', 'a key the archive does not have is refused');
select is(pg_temp.refusal(format(
  $$select public.create_job_with_assignments_service(%L, %L,
    jsonb_build_object('name', 'Barista', 'color', '#4478A8', 'department_id', null,
      'lineup_icons', jsonb_build_array(%L, %L)), '[]')$$,
  tests.user('li:owner'), tests.id('li'), (select three[1] from pick), (select three[1] from pick))),
  '22023 job.lineup_icons_invalid', 'a key twice is refused');
select is(pg_temp.refusal(format(
  $$select public.create_job_with_assignments_service(%L, %L,
    jsonb_build_object('name', 'Barista', 'color', '#4478A8', 'department_id', null, 'lineup_icons', to_jsonb(%L::text[])), '[]')$$,
  tests.user('li:owner'), tests.id('li'), (select twenty_five from pick))),
  '22023 job.lineup_icons_invalid', 'more than 24 icons are refused');
select is(pg_temp.refusal(format(
  $$select public.create_job_with_assignments_service(%L, %L,
    '{"name": "Barista", "color": "#4478A8", "department_id": null, "lineup_icons": "bar"}', '[]')$$,
  tests.user('li:owner'), tests.id('li'))),
  '22023 job.lineup_icons_invalid', 'icons that are not a list are refused');
select is(pg_temp.refusal(format(
  $$select public.update_job_details_and_assignments_service(%L, %L, %L,
    jsonb_build_object('name', 'Bar Lead', 'color', '#4478A8', 'department_id', null, 'lineup_icons', '["no-such-drawing"]'::jsonb),
    jsonb_build_object('name', 'Bar Lead', 'color', '#4478A8', 'department_id', null, 'lineup_icons', to_jsonb(%L::text[])))$$,
  tests.user('li:owner'), tests.id('li'), tests.id('li:job:bartender'), (select three from pick))),
  '22023 job.lineup_icons_invalid', 'saving an unknown key with the details is refused');
select is(pg_temp.browser_refusal(tests.user('li:owner'), format(
  $$insert into public.jobs (workspace_id, name, color, lineup_icons) values (%L, 'Busser', '#123456', '{no-such-drawing}')$$,
  tests.id('li'))),
  '22023 job.lineup_icons_invalid', 'a browser insert with an unknown key is refused');

-- browser_cannot_update_icons
select ok(not has_column_privilege('authenticated', 'public.jobs', 'lineup_icons', 'UPDATE'),
  'the browser role may not update the icon list');
select matches(pg_temp.browser_refusal(tests.user('li:owner'), format(
  $$update public.jobs set lineup_icons = '{}' where id = %L$$, tests.id('li:job:bartender'))),
  '^42501', 'even the owner''s browser cannot change a job''s icons directly');
select is(pg_temp.icons(tests.id('li:job:bartender')), (select three from pick), 'they stay as they were');

-- read_returns_icons
select is(
  (select count(*)::integer from jsonb_array_elements(
     public.read_settings_jobs_service(tests.user('li:owner'), tests.id('li')) -> 'jobs') j
   where (j -> 'lineup_icons') is distinct from
     (select to_jsonb(job.lineup_icons) from public.jobs job where job.id = (j ->> 'id')::uuid)),
  0, 'Settings > Jobs reads every job with its icons');

-- authorize_refusal_shape: who may open, change and assign.
select matches(pg_temp.refusal(format(
  $$select public.create_job_with_assignments_service(%L, %L, '{"name": "Barista", "color": "#4478A8", "department_id": null}', '[]')$$,
  tests.user('li:eda'), tests.id('li'))),
  '^42501 authz\.', 'an employee cannot open a job: 42501 with the core''s reason');
select is(pg_temp.refusal(format(
  $$select public.create_job_with_assignments_service(%L, %L, '{"name": "Barista", "color": "#4478A8", "department_id": null}', '[]')$$,
  tests.user('lo:owner'), tests.id('li'))),
  '42501 authz.not_member', 'another workspace''s owner is not a member here');
select matches(pg_temp.refusal(format(
  $$select public.create_department_with_jobs_service(%L, %L, '{"name": "Bar", "color": "#123456"}', '[]')$$,
  tests.user('li:mona'), tests.id('li'))),
  '^42501 authz\.', 'a manager without Settings > Jobs cannot open a department');
select matches(pg_temp.refusal(format(
  $$select public.create_department_jobs_service(%L, %L, %L, '[{"name": "Barista", "color": "#123456"}]')$$,
  tests.user('li:mona'), tests.id('li'), tests.id('li:kitchen'))),
  '^42501 authz\.', 'nor add jobs to one');
select matches(pg_temp.refusal(format(
  $$select public.update_department_with_jobs_service(%L, %L, %L, '{"name": "Kitchen", "color": "#3C7A68"}', '[]')$$,
  tests.user('li:mona'), tests.id('li'), tests.id('li:kitchen'))),
  '^42501 authz\.', 'nor save one');

-- A manager with employees.manage but not Settings > Jobs still assigns people to a job...
select is(pg_temp.refusal(format(
  $$select public.update_job_details_and_assignments_service(%L, %L, %L, null, null,
    jsonb_build_array(jsonb_build_object('employee_id', %L, 'assigned', true, 'expected_revision', %s)))$$,
  tests.user('li:mona'), tests.id('li'), tests.id('li:job:server'), tests.id('li:eda'), pg_temp.revision(tests.id('li:eda')))),
  'allowed', 'a manager assigns Eda to Server');
select ok(exists (select 1 from public.employee_job_assignments a
  where a.employee_id = tests.id('li:eda') and a.job_id = tests.id('li:job:server') and a.ended_at is null),
  'Eda holds Server');
-- ...but not with the job's details in the same call.
select matches(pg_temp.refusal(format(
  $$select public.update_job_details_and_assignments_service(%L, %L, %L,
    jsonb_build_object('name', 'Server', 'color', '#4478A8', 'department_id', %L, 'lineup_icons', '[]'::jsonb),
    jsonb_build_object('name', 'Server', 'color', '#4478A8', 'department_id', %L, 'lineup_icons', to_jsonb(%L::text[])),
    jsonb_build_array(jsonb_build_object('employee_id', %L, 'assigned', false, 'expected_revision', %s)))$$,
  tests.user('li:mona'), tests.id('li'), tests.id('li:job:server'), tests.id('li:kitchen'), tests.id('li:kitchen'),
  pg_temp.icons(tests.id('li:job:server')), tests.id('li:eda'), pg_temp.revision(tests.id('li:eda')))),
  '^42501 authz\.', 'the manager cannot change the job''s details, assignments or not');
-- Somebody without employees.manage assigns nobody.
select matches(pg_temp.refusal(format(
  $$select public.update_job_details_and_assignments_service(%L, %L, %L, null, null,
    jsonb_build_array(jsonb_build_object('employee_id', %L, 'assigned', false, 'expected_revision', %s)))$$,
  tests.user('li:eda'), tests.id('li'), tests.id('li:job:server'), tests.id('li:eda'), pg_temp.revision(tests.id('li:eda')))),
  '^42501 authz\.', 'an employee cannot change who holds a job');

-- None of the five pretends to be the caller any more; each asks the core.
select is(
  array(select p.proname::text from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and p.proname in ('create_department_jobs_service', 'create_department_with_jobs_service',
            'create_job_with_assignments_service', 'update_department_with_jobs_service',
            'update_job_details_and_assignments_service')
          and (p.prosrc ~ 'request\.jwt\.claim' or p.prosrc ~ 'workspace_has_permission'
            or p.prosrc !~ 'app_private\.authorize\(')
        order by 1),
  '{}'::text[], 'the five job-writing services ask app_private.authorize(), not the JWT bridge');

select * from finish();
rollback;
