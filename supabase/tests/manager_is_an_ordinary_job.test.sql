begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- DAVET-ERISIM: a role change is an access change (the single-role service is gone). An employee role
-- takes the employee slot and empties the management one; a management role goes beside the employee
-- slot held, a manager managing where they work.
create function pg_temp.change_role(actor uuid, w uuid, emp uuid, next_role uuid) returns jsonb language sql as $$
  select public.change_employee_access_service(actor, w, emp,
    case when r.access_class = 'employee' then r.id else m.employee_role_id end,
    case when r.access_class <> 'employee' then r.id end,
    case when r.access_class = 'manager' then array(select a.location_id from public.employee_location_assignments a
      where a.employee_id = emp and a.ended_at is null) else '{}'::uuid[] end,
    null, null)
  from public.workspace_roles r, public.employee_profiles e
  join public.workspace_memberships m on m.workspace_id = e.workspace_id and m.user_id = e.user_id
  where r.id = next_role and e.id = emp
$$;
grant execute on function pg_temp.change_role(uuid, uuid, uuid, uuid) to public;

-- EMP-001 S2. Management's Manager job is a job like any other: it counts as
-- the person's job and can be their primary job. So the save rule has no
-- Management case left: somebody who is not the owner, not Remote and not
-- excluded from Schedule needs a location, a primary location, a job and a
-- primary job, whatever department the job sits under. (BL-218 .3b, "only
-- Management jobs saves with no primary", is undone.)
-- Example: Ayse is given Manager in Settings > Jobs and loses Cook. Saved from
-- the Employees drawer at Kadikoy with Manager as her primary job, she is kept;
-- with no primary job she is refused.
-- A workspace role is not a job: making somebody a manager, or inviting them as
-- one, gives them no job.

select tests.world('mp');
-- Read by label, not tests.id, so the file runs (red) before setup makes Manager.
-- ROL-CIFT: setup's Management job is General Manager now (design §4.13); 'manager' names it.
create function pg_temp.job(key text) returns uuid language sql as $$
  select i.id from tests.ids i where i.label = 'mp:job:' || case key when 'manager' then 'general manager' else key end
$$;

-- The SQLSTATE and hint a statement is refused with, or 'allowed'.
create function pg_temp.refusal(statement text) returns text
language plpgsql as $$
declare
  state text;
  hint text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
  return state || coalesce(' ' || nullif(hint, ''), '');
end;
$$;
-- Ayse's record saved from the drawer by the owner.
create function pg_temp.save(locs text[], primary_loc text, jobs text[], primary_job text,
  remote boolean default false, excluded boolean default false) returns text
language sql as $$
  select pg_temp.refusal(format(
    'select public.save_employee_service(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %s)',
    tests.user('mp:owner'), tests.id('mp'), e.id, e.first_name, e.middle_name, e.last_name, e.preferred_name,
    e.invitation_email, e.start_date, e.internal_note,
    array(select tests.id('mp:' || l) from unnest(locs) l), case when primary_loc is null then null else tests.id('mp:' || primary_loc) end,
    array(select pg_temp.job(j) from unnest(jobs) j), pg_temp.job(primary_job),
    remote, excluded, e.revision
  ))
  from public.employee_profiles e where e.id = tests.id('mp:ayse')
$$;
-- What somebody works now: job names (* = stored primary) @ location names.
create function pg_temp.works(person text) returns text language sql as $$
  select coalesce((select string_agg(j.name || case when a.is_primary then '*' else '' end, ',' order by j.name)
      from public.employee_job_assignments a join public.jobs j on j.id = a.job_id
      where a.employee_id = tests.id('mp:' || person) and a.ended_at is null), '-')
    || '@' ||
    coalesce((select string_agg(l.name, ',' order by l.name)
      from public.employee_location_assignments a join public.locations l on l.id = a.location_id
      where a.employee_id = tests.id('mp:' || person) and a.ended_at is null), '-')
$$;

select tests.person('mp', 'ayse', 'employee', array['K'], array['cook']);

-- 1. Only Manager: it is her job and her primary job ----------------------------------

select is(pg_temp.save(array['K'], 'K', array['manager'], 'manager'), 'allowed',
  'only Manager, at Kadikoy, Manager primary: the drawer saves her');
select is(pg_temp.works('ayse'), 'General Manager*@Kadikoy', 'and Manager is her stored primary job');
select is(pg_temp.save(array['K'], 'K', array['manager'], null), '22023 employee.primary_job_required',
  'with no primary job she is refused: a job under Management is not primary by itself');
select is(pg_temp.save(array[]::text[], null, array['manager'], 'manager'), '22023 employee.location_required',
  'with no location she is refused');
select is(pg_temp.save(array['K'], null, array['manager'], 'manager'), '22023 employee.location_required',
  'nor without a primary location');
select is(pg_temp.save(array['K'], 'K', array[]::text[], null), '22023 employee.job_required',
  'with no job at all she is refused');

-- 2. Any of her jobs can be the primary one -------------------------------------------

select is(pg_temp.save(array['K'], 'K', array['manager', 'server'], null), '22023 employee.primary_job_required',
  'Manager and Server with no primary job: refused');
select is(pg_temp.save(array['K'], 'K', array['manager', 'server'], 'server'), 'allowed',
  'Manager and Server with Server primary: saved');
select is(pg_temp.works('ayse'), 'General Manager,Server*@Kadikoy', 'Server is her stored primary');
select is(pg_temp.save(array['K'], 'K', array['manager', 'server'], 'manager') || ' ' || pg_temp.works('ayse'),
  'allowed General Manager*,Server@Kadikoy', 'and Manager can be, in its place');

-- 3. Remote and "Exclude from schedule" keep their exemption ---------------------------

select is(pg_temp.save(array[]::text[], null, array['manager'], null, true), 'allowed',
  'Remote with only Manager saves with no location and no primary job');
select is(pg_temp.save(array[]::text[], null, array['manager'], null, false, true), 'allowed',
  'so does somebody excluded from Schedule');

-- 4. Add employee follows the same rule --------------------------------------------------

create function pg_temp.add(first_name text, primary_job uuid) returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.create_employee_command_service(%L, %L, %L, %L::jsonb, null)',
    tests.user('mp:owner'), tests.id('mp'), gen_random_uuid(),
    jsonb_build_object(
      'first_name', first_name, 'middle_name', '', 'last_name', 'Person', 'preferred_name', '',
      'invitation_email', '', 'start_date', '', 'internal_note', '',
      'location_ids', jsonb_build_array(tests.id('mp:K')), 'primary_location_id', tests.id('mp:K'),
      'job_ids', jsonb_build_array(pg_temp.job('manager')), 'primary_job_id', primary_job,
      'is_remote', false, 'is_excluded_from_schedule', false, 'expected_revision', null)
  ))
$$;
select is(pg_temp.add('Bora', null), '22023 employee.primary_job_required',
  'Add employee with only Manager and no primary job is refused');
select is(pg_temp.add('Bora', pg_temp.job('manager')), 'allowed',
  'with Manager as the primary job the record is created');

-- 5. The rule sits in the database ------------------------------------------------------

-- Another workspace's job is no job here: saving with it, as the primary job
-- too, is refused as a made-up job is, so the answer says nothing about it.
select tests.world('mq');
create function pg_temp.save_job(job uuid) returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.save_employee_service(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, false, false, %s)',
    tests.user('mp:owner'), tests.id('mp'), e.id, e.first_name, e.middle_name, e.last_name, e.preferred_name,
    e.invitation_email, e.start_date, e.internal_note,
    array[tests.id('mp:K')], tests.id('mp:K'), array[job], job, e.revision
  ))
  from public.employee_profiles e where e.id = tests.id('mp:ayse')
$$;
select is(
  pg_temp.save_job((select j.id from public.jobs j join public.departments d on d.id = j.department_id
    where j.workspace_id = tests.id('mq') and d.system_key = 'management' and j.system_key is null and j.name = 'General Manager')),
  pg_temp.save_job(gen_random_uuid()),
  'another workspace''s Manager job is refused like a made-up job');
select isnt(pg_temp.save_job(gen_random_uuid()), 'allowed', 'and a made-up job is refused');

select matches(pg_temp.refusal(format(
  'select tests.as_browser(%L, %L)', tests.user('mp:owner'),
  format('insert into public.employee_location_assignments (workspace_id, employee_id, location_id, created_by) values (%L, %L, %L, %L)',
    tests.id('mp'), tests.id('mp:ayse'), tests.id('mp:K'), tests.user('mp:owner')))),
  '^42501', 'the browser cannot write an assignment around the save');

-- 6. A workspace role gives no job ------------------------------------------------------

-- Cem cooks; Access > Workspace role makes him a manager.
select tests.person('mp', 'cem', 'employee', array['K'], array['cook']);
select pg_temp.change_role(
  tests.user('mp:owner'), tests.id('mp'), tests.id('mp:cem'),
  (select r.id from public.workspace_roles r where r.workspace_id = tests.id('mp') and r.system_key = 'manager'));
select is(
  (select coalesce((select r.access_class::text from public.workspace_roles r where r.id = m.role_id), 'employee') from public.workspace_memberships m
   where m.workspace_id = tests.id('mp') and m.user_id = tests.user('mp:cem')) || ' ' || pg_temp.works('cem'),
  'manager Cook*@Kadikoy',
  'made a manager, Cem keeps his jobs as they were: Manager is not given to him');
-- Derya is invited as a manager and accepts.
select tests.person('mp', 'derya', 'manager', array['K'], array['server']);
select is(
  (select coalesce((select r.access_class::text from public.workspace_roles r where r.id = m.role_id), 'employee') from public.workspace_memberships m
   where m.workspace_id = tests.id('mp') and m.user_id = tests.user('mp:derya')) || ' ' || pg_temp.works('derya'),
  'manager Server*@Kadikoy',
  'invited as a manager, Derya has the job she was given and no other');

select * from finish();
rollback;
