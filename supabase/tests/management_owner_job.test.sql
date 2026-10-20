begin;
create extension if not exists pgtap with schema extensions;
select plan(56);

-- BL-218. Setup gives every workspace two protected catalog records: the
-- Management department and, under it, the Owner job. Nobody deletes or
-- archives them; they can be renamed. The Owner job belongs to the owner
-- alone and moves with ownership. The owner is put on the Owner job and on
-- every location (now and later), and on no other job by itself. EMP-001:
-- setup also makes General Manager and Assistant Manager under Management (ROL-CIFT, design §4.13),
-- ordinary jobs; setup's
-- "at least one department and one job" means a department of the owner's own
-- and a job outside Management; every job can be primary but Owner.

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

-- A workspace's Management department and Owner job. Read through to_jsonb so
-- the file runs (red) before the column exists.
create function pg_temp.management(w text) returns uuid language sql as $$
  select d.id from public.departments d
  where d.workspace_id = tests.id(w) and to_jsonb(d) ->> 'system_key' = 'management'
$$;
create function pg_temp.owner_job(w text) returns uuid language sql as $$
  select j.id from public.jobs j
  where j.workspace_id = tests.id(w) and to_jsonb(j) ->> 'system_key' = 'owner'
$$;
create function pg_temp.jobs_of(employee uuid) returns uuid[] language sql as $$
  select coalesce(array_agg(a.job_id order by a.job_id), '{}')
  from public.employee_job_assignments a
  where a.employee_id = employee and a.ended_at is null
$$;
create function pg_temp.locations_of(employee uuid) returns uuid[] language sql as $$
  select coalesce(array_agg(a.location_id order by a.location_id), '{}')
  from public.employee_location_assignments a
  where a.employee_id = employee and a.ended_at is null
$$;
-- The General Manager job setup made (a test world names it; elsewhere it is found by
-- its name), and the names of the jobs under Management.
create function pg_temp.manager_job(w text) returns uuid language sql as $$
  select coalesce(
    (select i.id from tests.ids i where i.label = w || ':job:general manager'),
    (select j.id from public.jobs j
     where j.workspace_id = tests.id(w) and j.department_id = pg_temp.management(w)
       and to_jsonb(j) ->> 'system_key' is null and j.name = 'General Manager' and j.deleted_at is null))
$$;
create function pg_temp.management_jobs(w text) returns text[] language sql as $$
  select coalesce(array_agg(j.name || case when to_jsonb(j) ->> 'system_key' is null then '' else '=' || j.system_key end order by j.name), '{}')
  from public.jobs j
  where j.workspace_id = tests.id(w) and j.department_id = pg_temp.management(w) and j.deleted_at is null
$$;
-- Saving a record the way the drawer does, with its locations and jobs replaced;
-- the primary job is the one named, or the stored one when none is.
create function pg_temp.save_record(actor uuid, w text, employee uuid, locs uuid[], jobs uuid[], primary_job uuid default null) returns text
language sql as $$
  select pg_temp.refusal(format(
    'select public.save_employee_service(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %s)',
    actor, tests.id(w), e.id, e.first_name, e.middle_name, e.last_name, e.preferred_name,
    e.invitation_email, e.start_date, e.internal_note,
    locs, locs[1], jobs,
    coalesce(primary_job, (select a.job_id from public.employee_job_assignments a
     where a.employee_id = e.id and a.ended_at is null and a.is_primary and a.job_id = any(jobs))),
    e.is_remote, e.is_excluded_from_schedule, e.revision
  ))
  from public.employee_profiles e where e.id = employee
$$;

-- 1. Setup makes Management and Owner -------------------------------------------------

select tests.new_user('fr:owner', 'Fresh Owner');
select tests.remember('fr', public.create_owner_workspace_service(tests.user('fr:owner'), 'Fresh Co'));
select public.update_owner_onboarding_service(
  tests.user('fr:owner'), tests.id('fr'), 'Fresh Co', 2::smallint, false,
  (select revision from public.workspace_onboarding where workspace_id = tests.id('fr')),
  'Fresh', null, 'Owner'
);

select is(
  (select name from public.departments where id = pg_temp.management('fr')),
  'Management',
  'the first saved step of setup has a Management department'
);
select is(
  (select name || '|' || (department_id = pg_temp.management('fr'))::text
   from public.jobs where id = pg_temp.owner_job('fr')),
  'Owner|true',
  'and an Owner job under it'
);
select is(pg_temp.management_jobs('fr'), array['Assistant Manager', 'General Manager', 'Owner=owner'],
  'and General Manager and Assistant Manager next to it, ordinary jobs with no system key');
select is(
  (select count(*)::integer from public.departments d
   where d.workspace_id = tests.id('fr') and to_jsonb(d) ->> 'system_key' is not null),
  1,
  'saving setup again does not make a second Management'
);

-- 2. Setup asks for a department of the owner's own and a job outside Management ------
-- K2: nothing under Management counts, neither the jobs setup made there nor
-- a job the owner adds there.

select tests.as_browser(tests.user('fr:owner'), format(
  $sql$insert into public.locations (workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
       values (%L, 'Main', 'MN', '1 Main St', 'Austin', 'TX', '78701', 'America/Chicago')$sql$,
  tests.id('fr')
));
create function pg_temp.finish_setup() returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.update_owner_onboarding_service(%L, %L, %L, 4::smallint, true, %s, %L, null, %L)',
    tests.user('fr:owner'), tests.id('fr'), 'Fresh Co',
    (select revision from public.workspace_onboarding where workspace_id = tests.id('fr')),
    'Fresh', 'Owner'
  ))
$$;

select is(pg_temp.finish_setup(), '23514',
  'Management with Owner, General Manager and Assistant Manager alone does not finish setup');
insert into public.departments (id, workspace_id, name)
values (tests.remember('fr:kitchen', gen_random_uuid()), tests.id('fr'), 'Kitchen');
insert into public.jobs (workspace_id, name, department_id)
values (tests.id('fr'), 'Supervisor', pg_temp.management('fr'));
select is(pg_temp.finish_setup(), '23514',
  'nor does a department of the owner''s own while every job sits under Management');

-- The owner deletes General Manager in the Jobs step; a later save does not bring it back.
select is(
  pg_temp.refusal(format(
    'select public.delete_job_with_assignments_service(%L, %L, %L)',
    tests.user('fr:owner'), tests.id('fr'), pg_temp.manager_job('fr')
  )),
  'allowed',
  'the owner deletes General Manager like any job'
);
select is(
  pg_temp.refusal(format(
    'select public.update_owner_onboarding_service(%L, %L, %L, 3::smallint, false, %s, %L, null, %L)',
    tests.user('fr:owner'), tests.id('fr'), 'Fresh Co',
    (select revision from public.workspace_onboarding where workspace_id = tests.id('fr')),
    'Fresh', 'Owner'
  )),
  'allowed',
  'setup is saved again'
);
select is(pg_temp.management_jobs('fr'), array['Assistant Manager', 'Owner=owner', 'Supervisor'],
  'and that save does not bring General Manager back');

insert into public.jobs (workspace_id, name, department_id)
values (tests.id('fr'), 'Cook', tests.id('fr:kitchen'));
select is(pg_temp.finish_setup(), 'allowed',
  'a job outside Management finishes it');
select is(pg_temp.management_jobs('fr'), array['Assistant Manager', 'Owner=owner', 'Supervisor'],
  'and General Manager is still gone once setup is finished');

-- 3. The owner is on the Owner job and every location, and nothing else ---------------

select tests.world('mo');

select is(
  (select array_agg(j.name order by j.name)
   from tests.ids i join public.jobs j on j.id = i.id
   where i.label in ('mo:job:owner', 'mo:job:general manager')
     and j.department_id = (select m.id from tests.ids m where m.label = 'mo:management')),
  array['General Manager', 'Owner'],
  'the test world carries Management with its Owner and General Manager jobs'
);
select is(
  pg_temp.jobs_of(tests.id('mo:owner')),
  array[pg_temp.owner_job('mo')],
  'after setup the owner works the Owner job only, not the jobs setup added'
);
select is(
  pg_temp.locations_of(tests.id('mo:owner')),
  (select array_agg(id order by id) from public.locations where workspace_id = tests.id('mo')),
  'and every location'
);

select tests.as_browser(tests.user('mo:owner'), format(
  $sql$insert into public.jobs (id, workspace_id, name, department_id) values (%L, %L, 'Barista', %L)$sql$,
  tests.remember('mo:job:barista', gen_random_uuid()), tests.id('mo'), tests.id('mo:kitchen')
));
select ok(
  not tests.id('mo:job:barista') = any (pg_temp.jobs_of(tests.id('mo:owner'))),
  'a job added later is not put on the owner'
);

select tests.as_browser(tests.user('mo:owner'), format(
  $sql$insert into public.locations (id, workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
       values (%L, %L, 'Uskudar', 'USK', '3 Iskele', 'Istanbul', 'Istanbul', '34664', 'Europe/Istanbul')$sql$,
  tests.remember('mo:U', gen_random_uuid()), tests.id('mo')
));
select ok(
  tests.id('mo:U') = any (pg_temp.locations_of(tests.id('mo:owner'))),
  'a location added later is put on the owner'
);

-- The rule sits on the table, so the drawer's save and every other writer meet it.
select is(
  pg_temp.refusal(format(
    'update public.employee_location_assignments set ended_at = now() where employee_id = %L and location_id = %L and ended_at is null',
    tests.id('mo:owner'), tests.id('mo:B')
  )),
  '23514 employee.owner_locations',
  'the owner cannot be taken off a location'
);
select ok(
  tests.id('mo:B') = any (pg_temp.locations_of(tests.id('mo:owner'))),
  'and the owner is still at that location'
);

-- Deleting a location is not removing the owner from it: the location goes, and
-- its assignment with it. Today nobody can delete a location the owner works at
-- ("employees you cannot manage"); that is BL-187, fixed in FB-6.2 .6.
select todo('BL-187: a location the owner works at cannot be deleted yet', 2);
select is(
  pg_temp.refusal(format(
    'select public.delete_catalog_entity_service(%L, %L, %L, %L)',
    tests.user('mo:owner'), tests.id('mo'), 'locations', tests.id('mo:U')
  )),
  'allowed',
  'a location the owner works at can still be deleted'
);
select ok(
  not tests.id('mo:U') = any (pg_temp.locations_of(tests.id('mo:owner'))),
  'and the owner''s assignment there ends with it'
);

select hasnt_trigger('public', 'jobs', 'jobs_reach_the_owner',
  'no trigger puts every new job on the owner');
select hasnt_trigger('public', 'jobs', 'jobs_reach_the_owner_on_restore',
  'nor every restored job');
select has_trigger('public', 'locations', 'locations_reach_the_owner',
  'new locations still reach the owner');
-- A rule that waits for commit lets a statement see a broken state first.
select is(
  array(
    select distinct t.tgname::text from pg_trigger t
    join pg_class c on c.oid = t.tgrelid and c.relnamespace = 'public'::regnamespace
    where not t.tgisinternal and t.tgdeferrable
      and c.relname in ('departments', 'jobs', 'employee_job_assignments', 'employee_location_assignments', 'locations')
    order by 1
  ),
  array['document_assignment_changed'],
  'none of the catalog or assignment rules is deferred'
);

-- 4. Management and Owner cannot be deleted or archived, and can be renamed ----------

select is(
  pg_temp.refusal(format(
    'select public.delete_catalog_entity_service(%L, %L, %L, %L, %L)',
    tests.user('mo:owner'), tests.id('mo'), 'departments', pg_temp.management('mo'), 'keep'
  )),
  '23514 catalog.system_record',
  'Management cannot be deleted from Settings'
);
select is(
  pg_temp.refusal(format(
    'select public.delete_job_with_assignments_service(%L, %L, %L)',
    tests.user('mo:owner'), tests.id('mo'), pg_temp.owner_job('mo')
  )),
  '23514 catalog.system_record',
  'the Owner job cannot be deleted from Settings'
);
select is(
  pg_temp.refusal(format(
    'select tests.as_browser(%L, %L)',
    tests.user('mo:owner'),
    format('update public.departments set archived_at = now() where id = %L', pg_temp.management('mo'))
  )),
  '23514 catalog.system_record',
  'the browser cannot archive Management'
);
select is(
  pg_temp.refusal(format(
    'select tests.as_browser(%L, %L)',
    tests.user('mo:owner'),
    format('update public.jobs set archived_at = now() where id = %L', pg_temp.owner_job('mo'))
  )),
  '23514 catalog.system_record',
  'nor the Owner job'
);
select isnt(
  pg_temp.refusal(format(
    'select tests.as_browser(%L, %L)',
    tests.user('mo:owner'),
    format('update public.jobs set deleted_at = now() where id = %L', pg_temp.owner_job('mo'))
  )),
  'allowed',
  'nor mark the Owner job deleted'
);
select ok(
  (select archived_at is null and deleted_at is null from public.jobs where id = pg_temp.owner_job('mo'))
  and (select archived_at is null and deleted_at is null from public.departments where id = pg_temp.management('mo')),
  'both are still live'
);

select is(
  tests.as_browser(tests.user('mo:owner'), format(
    'update public.departments set name = %L where id = %L', 'Leadership', pg_temp.management('mo')
  )) + tests.as_browser(tests.user('mo:owner'), format(
    'update public.jobs set name = %L where id = %L', 'Proprietor', pg_temp.owner_job('mo')
  )),
  2,
  'the owner renames both from the browser'
);
select is(
  (select d.name || '|' || j.name from public.departments d, public.jobs j
   where d.id = pg_temp.management('mo') and j.id = pg_temp.owner_job('mo')),
  'Leadership|Proprietor',
  'and the new names are kept'
);

-- The Owner job stays under Management (S2 a, 2026-09-27): moved elsewhere it
-- would leave the Management group the Schedule lists last.
select is(
  pg_temp.refusal(format(
    'select tests.as_browser(%L, %L)',
    tests.user('mo:owner'),
    format('update public.jobs set department_id = %L where id = %L', tests.id('mo:kitchen'), pg_temp.owner_job('mo'))
  )),
  '23514 catalog.system_record',
  'the Owner job cannot be moved out of Management'
);

-- 5. The Owner job is the owner's alone, and the owner keeps it ------------------------
-- S1 a (2026-09-27): only a change of ownership takes it off the owner.

select is(
  pg_temp.save_record(tests.user('mo:owner'), 'mo', tests.id('mo:owner'),
    pg_temp.locations_of(tests.id('mo:owner')),
    array(select j from unnest(pg_temp.jobs_of(tests.id('mo:owner'))) j where j <> pg_temp.owner_job('mo'))),
  '23514 employee.owner_job',
  'the owner cannot save their record without the Owner job'
);
select is(
  pg_temp.save_record(tests.user('mo:owner'), 'mo', tests.id('mo:owner'),
    pg_temp.locations_of(tests.id('mo:owner')), '{}'::uuid[]),
  '23514 employee.owner_job',
  'nor with no job at all'
);
select is(
  pg_temp.refusal(format(
    'update public.employee_job_assignments set ended_at = now() where employee_id = %L and job_id = %L and ended_at is null',
    tests.id('mo:owner'), pg_temp.owner_job('mo')
  )),
  '23514 employee.owner_job',
  'nor be taken off it by any other writer'
);
select ok(
  pg_temp.owner_job('mo') = any (pg_temp.jobs_of(tests.id('mo:owner'))),
  'the owner still works the Owner job'
);

select tests.person('mo', 'ada', 'admin', array['K'], array['cook']);

select matches(
  pg_temp.refusal(format(
    'select public.update_job_assignments_service(%L, %L, %L, %L::jsonb)',
    tests.user('mo:owner'), tests.id('mo'), pg_temp.owner_job('mo'),
    jsonb_build_array(jsonb_build_object(
      'employee_id', tests.id('mo:ada'), 'assigned', true,
      'expected_revision', (select revision from public.employee_profiles where id = tests.id('mo:ada'))
    ))
  )),
  '^42501 authz\.',
  'the Owner job cannot be given to somebody else from Settings > Jobs'
);
select matches(
  pg_temp.save_record(tests.user('mo:owner'), 'mo', tests.id('mo:ada'),
    array[tests.id('mo:K')], array[tests.id('mo:job:cook'), pg_temp.owner_job('mo')]),
  '^42501 authz\.',
  'nor from their drawer'
);
select matches(
  pg_temp.refusal(format(
    'insert into public.employee_job_assignments (workspace_id, employee_id, job_id, created_by) values (%L, %L, %L, %L)',
    tests.id('mo'), tests.id('mo:ada'), pg_temp.owner_job('mo'), tests.user('mo:owner')
  )),
  '^42501 authz\.',
  'nor by any other way into the table'
);

-- 6. Every job can be primary but Owner ------------------------------------------------
-- EMP-001 S2: a job under Management is a job like any other. Manager (made by
-- setup) and whatever the owner adds or moves there are marked primary,
-- renamed, archived and deleted; the first job somebody is given becomes their
-- primary, Manager included. Only the Owner job is never stored as primary.

select tests.as_browser(tests.user('mo:owner'), format(
  $sql$insert into public.jobs (id, workspace_id, name, department_id) values (%L, %L, 'Host', %L)$sql$,
  tests.remember('mo:job:host', gen_random_uuid()), tests.id('mo'), tests.id('mo:kitchen')
));
create function pg_temp.is_primary(person text, job uuid) returns boolean language sql as $$
  select a.is_primary from public.employee_job_assignments a
  where a.employee_id = tests.id('mo:' || person) and a.job_id = job and a.ended_at is null
$$;
-- A job given or taken away in Settings > Jobs.
create function pg_temp.assign(person text, job uuid, assigned boolean) returns text language sql as $$
  select pg_temp.refusal(format(
    'select public.update_job_assignments_service(%L, %L, %L, %L::jsonb)',
    tests.user('mo:owner'), tests.id('mo'), job,
    jsonb_build_array(jsonb_build_object(
      'employee_id', tests.id('mo:' || person), 'assigned', assigned,
      'expected_revision', (select revision from public.employee_profiles where id = tests.id('mo:' || person))
    ))
  ))
$$;

-- Bora cooks (primary); the drawer then makes Manager his primary job.
select tests.person('mo', 'bora', 'employee', array['K'], array['cook']);
select is(
  pg_temp.save_record(tests.user('mo:owner'), 'mo', tests.id('mo:bora'),
    array[tests.id('mo:K')], array[tests.id('mo:job:cook'), pg_temp.manager_job('mo')], pg_temp.manager_job('mo')),
  'allowed',
  'Manager is chosen as the primary job next to a job of another department'
);
select is(
  pg_temp.is_primary('bora', tests.id('mo:job:cook')) || '|' || pg_temp.is_primary('bora', pg_temp.manager_job('mo')),
  'false|true',
  'and Manager is his one stored primary'
);

-- Cemre has no job left, then gets Manager from Settings > Jobs.
select tests.person('mo', 'cemre', 'employee', array['K'], array['cook']);
update public.employee_job_assignments set ended_at = now(), is_primary = false
where employee_id = tests.id('mo:cemre') and ended_at is null;
select is(pg_temp.assign('cemre', pg_temp.manager_job('mo'), true), 'allowed',
  'Manager is given from Settings > Jobs');
select is(pg_temp.is_primary('cemre', pg_temp.manager_job('mo')), true,
  'and, as her first job, is stored as primary');

-- DAVET-ERISIM (Mert 2026-10-20): the Owner job is the owner's primary job; setup makes it so.
select is(pg_temp.is_primary('owner', pg_temp.owner_job('mo')), true,
  'setup made the Owner job the owner''s primary job');
-- The owner is given Cook in Settings > Jobs, then loses it.
select pg_temp.assign('owner', tests.id('mo:job:cook'), true);
select is(pg_temp.is_primary('owner', tests.id('mo:job:cook')), false,
  'Cook given, the owner''s primary stays the Owner job');
select pg_temp.assign('owner', tests.id('mo:job:cook'), false);
select is(pg_temp.is_primary('owner', pg_temp.owner_job('mo')), true,
  'and stays it when Cook is taken away again');

-- Deniz hosts (primary); Host then moves under Management and stays her primary.
select tests.person('mo', 'deniz', 'employee', array['K'], array['host']);
select tests.as_browser(tests.user('mo:owner'), format(
  'update public.jobs set department_id = %L where id = %L', pg_temp.management('mo'), tests.id('mo:job:host')
));
select is(pg_temp.is_primary('deniz', tests.id('mo:job:host')), true,
  'a job moved under Management keeps its primary mark');
select hasnt_trigger('public', 'jobs', 'jobs_under_management_are_primary',
  'no trigger clears the primary mark of a job under Management');

-- Manager is renamed, archived, restored and deleted like any job. ROL-CIFT 1.3: while it is not
-- anybody's one Management job; Ada, whose management job it is, holds Assistant Manager too.
insert into public.membership_management_jobs (workspace_id, membership_id, job_id)
select tests.id('mo'), m.id, tests.id('mo:job:assistant manager')
from public.workspace_memberships m where m.workspace_id = tests.id('mo') and m.user_id = tests.user('mo:ada');
select is(
  tests.as_browser(tests.user('mo:owner'), format(
    'update public.jobs set name = %L where id = %L', 'Shift lead', pg_temp.manager_job('mo'))),
  1, 'Manager is renamed from the browser');
select is(
  tests.as_browser(tests.user('mo:owner'), format(
    'update public.jobs set archived_at = now() where id = %L', pg_temp.manager_job('mo'))),
  1, 'archived');
select is(
  tests.as_browser(tests.user('mo:owner'), format(
    'update public.jobs set archived_at = null where id = %L', pg_temp.manager_job('mo'))),
  1, 'restored');
select is(
  pg_temp.refusal(format(
    'select public.delete_job_with_assignments_service(%L, %L, %L)',
    tests.user('mo:owner'), tests.id('mo'), pg_temp.manager_job('mo')
  )),
  'allowed',
  'and deleted'
);
select is(pg_temp.is_primary('bora', tests.id('mo:job:cook')), true,
  'whoever had it as their primary job gets their next job as primary');

-- 7. Ownership moves the Owner job -----------------------------------------------------

select public.initiate_workspace_ownership_transfer_service(
  tests.user('mo:owner'), tests.id('mo'), tests.user('mo:ada')
);
select public.respond_workspace_ownership_transfer_service(
  tests.user('mo:ada'), tests.id('mo'),
  (select id from public.workspace_ownership_transfers where workspace_id = tests.id('mo') and status = 'pending'),
  'accept'
);

select ok(
  pg_temp.owner_job('mo') = any (pg_temp.jobs_of(tests.id('mo:ada'))),
  'the new owner works the Owner job'
);
select ok(
  not pg_temp.owner_job('mo') = any (pg_temp.jobs_of(tests.id('mo:owner'))),
  'the old owner no longer does'
);

select * from finish();
rollback;
