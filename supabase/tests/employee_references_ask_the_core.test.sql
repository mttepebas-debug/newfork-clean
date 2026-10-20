begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- BL-231. The Employees drawer (Employees > a person, or Add employee) reads
-- its pickers through one entry point: the locations the actor reaches (M2),
-- the jobs, and the roles the actor may invite with. The core decides who may
-- read it (employee.references.read); the invite list follows the invitation
-- rule: somebody who may not grant access reads an empty list, not a refusal.

select tests.world('r');
select tests.world('t');
select tests.person('r', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('r', 'zeynep', 'admin', array['K'], array['cook']);
select tests.person('r', 'emre', 'employee', array['K'], array['cook']);
select tests.person('r', 'nur', 'manager', null, null);
-- A manager-type role that may also grant access. Settings > Roles no longer
-- puts employee_access.manage or roles.read on a manager-type role (GUVENLIK-A
-- GA-2), so they are written straight into the table: the checks below prove
-- the core still keeps such a manager to employees.
select tests.role('r', 'lead', 'manager', array(
  select rp.permission_key
  from public.workspace_role_permissions rp
  join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('r') and r.system_key = 'manager'
) || array['employee_access.read']);
insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
select tests.id('r'), tests.id('r:role:lead'), k from unnest(array['employee_access.manage', 'roles.read']) k;
select tests.person('r', 'lale', 'lead', array['B'], array['cook']);

-- An archived and a deleted location and job.
insert into public.locations (id, workspace_id, name, short_name, street_address, city, region, postal_code, timezone, archived_at)
values (tests.remember('r:A', gen_random_uuid()), tests.id('r'), 'Arnavutkoy', 'ARN', '3 St', 'Istanbul', 'Istanbul', '34275', 'Europe/Istanbul', now()),
       (tests.remember('r:X', gen_random_uuid()), tests.id('r'), 'Xanthi', 'XAN', '4 St', 'Istanbul', 'Istanbul', '34276', 'Europe/Istanbul', now());
update public.locations set deleted_at = now() where id = tests.id('r:X');
insert into public.jobs (id, workspace_id, name, department_id, archived_at)
values (tests.remember('r:job:old', gen_random_uuid()), tests.id('r'), 'Old', tests.id('r:kitchen'), now()),
       (tests.remember('r:job:gone', gen_random_uuid()), tests.id('r'), 'Gone', tests.id('r:kitchen'), now());
update public.jobs set deleted_at = now() where id = tests.id('r:job:gone');

-- What one call answers: 'allowed', or the refusal as '<sqlstate> <hint>'.
create function pg_temp.answer(person text, w text) returns text
language plpgsql as $$
declare
  state text;
  hint text;
begin
  perform public.read_employee_references_service(tests.user(person), tests.id(w));
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
  return state || coalesce(' ' || nullif(hint, ''), '');
end;
$$;
create function pg_temp.read(person text) returns jsonb language sql as $$
  select public.read_employee_references_service(tests.user(person), tests.id('r'))
$$;
create function pg_temp.names(answer jsonb, part text) returns text[] language sql as $$
  select coalesce(array_agg(x ->> 'name' order by x ->> 'name'), '{}') from jsonb_array_elements(answer -> part) x
$$;
create function pg_temp.invite_classes(person text) returns text[] language sql as $$
  select coalesce(array_agg(x ->> 'access_class' order by x ->> 'access_class'), '{}')
  from jsonb_array_elements(pg_temp.read(person) -> 'invite_roles') x
$$;
create function pg_temp.keys(value jsonb) returns text[] language sql as $$
  select array_agg(k order by k) from jsonb_object_keys(value) k
$$;

-- 1. The answer's shape -----------------------------------------------------------------

select is(pg_temp.keys(pg_temp.read('r:owner')), array['departments', 'invite_roles', 'jobs', 'locations'],
  'one answer carries locations, departments, jobs and the roles to invite with');
select is(pg_temp.keys(pg_temp.read('r:owner') -> 'locations' -> 0), array['archived_at', 'id', 'name', 'timezone'],
  'a location carries what the pickers and Terminate show');
select is(pg_temp.keys(pg_temp.read('r:owner') -> 'jobs' -> 0), array['archived_at', 'department_id', 'id', 'name', 'system_key'],
  'a job carries what the Jobs picker shows, grouped by department (BL-218 .3a)');
select is(pg_temp.keys(pg_temp.read('r:owner') -> 'invite_roles' -> 0), array['access_class', 'id', 'name', 'system_key'],
  'a role carries what the invitation picker shows');

-- 2. What the owner reads ---------------------------------------------------------------

select is(pg_temp.names(pg_temp.read('r:owner'), 'locations'), array['Besiktas', 'Kadikoy'],
  'the owner reads every live location: neither the archived one (G8a, KK-13) nor the deleted one');
select is(pg_temp.names(pg_temp.read('r:owner'), 'jobs'), array['Assistant Manager', 'Cook', 'General Manager', 'Old', 'Owner', 'Server'],
  'and every job, the archived one included, the deleted one not');
select is(pg_temp.invite_classes('r:owner'), array['admin', 'employee', 'manager', 'manager'],
  'the owner invites with every role but owner');

-- 3. Who reads what -----------------------------------------------------------------------

select is(pg_temp.invite_classes('r:zeynep'), array['employee', 'manager', 'manager'],
  'an admin invites with manager and employee roles, not admin');
select is(pg_temp.names(pg_temp.read('r:ayse'), 'locations'), array['Kadikoy'],
  'a manager reads the locations they work at');
select is(pg_temp.names(pg_temp.read('r:ayse'), 'jobs'), array['Assistant Manager', 'Cook', 'General Manager', 'Old', 'Owner', 'Server'],
  'and every job');
-- A manager invites to their own location with employee roles only; granting
-- access is no longer asked (FB-6.2.5, BL-242).
select is(pg_temp.invite_classes('r:ayse'), array['employee'],
  'a manager invites with employee roles only');
select is(pg_temp.invite_classes('r:lale'), array['employee'],
  'so does a manager whose role may also grant access');
select is(pg_temp.names(pg_temp.read('r:lale'), 'locations'), array['Besiktas'],
  'and reads only Besiktas, where they work');

-- 4. Who is refused, by the core ---------------------------------------------------------

select is(pg_temp.answer('r:emre', 'r'), '42501 authz.missing_permission',
  'an employee does not read the drawer''s references');
select is(pg_temp.answer('r:nur', 'r'), '42501 authz.out_of_scope',
  'a manager who works nowhere is out of scope');
select is(pg_temp.answer('t:owner', 'r'), '42501 authz.not_member',
  'the owner of another workspace is not a member');
select is(pg_temp.answer('r:owner', 'r'), 'allowed', 'the owner reads them');

-- 5. The list is exactly what creating an employee accepts -----------------------------
-- For every role in the workspace, Add employee with an invitation either goes
-- through or is refused 42501; the drawer lists exactly the ones that go through.
-- DAVET-ERISIM: the invitation names the role in its own slot, a manager managing
-- the record's location; the owner's role fits no slot and is refused as such.

create function pg_temp.accepted_roles(person text) returns uuid[]
language plpgsql as $$
declare
  role record;
  hint text;
  accepted uuid[] := '{}';
  place uuid := (select (l ->> 'id')::uuid from jsonb_array_elements(pg_temp.read(person) -> 'locations') l
    where l ->> 'archived_at' is null limit 1);
begin
  for role in select r.id, r.access_class from public.workspace_roles r where r.workspace_id = tests.id('r') order by r.id loop
    begin
      perform public.create_employee_command_service(tests.user(person), tests.id('r'), gen_random_uuid(),
        jsonb_build_object(
          'first_name', 'Probe', 'middle_name', '', 'last_name', 'Person', 'preferred_name', '',
          'invitation_email', 'probe-' || gen_random_uuid() || '@example.test',
          'start_date', '', 'internal_note', '',
          'location_ids', jsonb_build_array(place), 'primary_location_id', place,
          'job_ids', jsonb_build_array(tests.id('r:job:cook')), 'primary_job_id', tests.id('r:job:cook'),
          'is_remote', false, 'is_excluded_from_schedule', false, 'expected_revision', null),
        jsonb_build_object(
          'employee_role_id', case when role.access_class = 'employee' then role.id end,
          'management_role_id', case when role.access_class <> 'employee' then role.id end,
          'managed_location_ids', case when role.access_class = 'manager' then jsonb_build_array(place) else '[]'::jsonb end));
      accepted := accepted || role.id;
    exception
      when sqlstate '42501' then
        null;
      when sqlstate '22023' then
        get stacked diagnostics hint = pg_exception_hint;
        if hint is distinct from 'membership.management_slot' or role.access_class <> 'owner' then
          raise;
        end if;
    end;
  end loop;
  return accepted;
end;
$$;
create function pg_temp.listed_roles(person text) returns uuid[] language sql as $$
  select coalesce(array_agg((x ->> 'id')::uuid order by (x ->> 'id')::uuid), '{}')
  from jsonb_array_elements(pg_temp.read(person) -> 'invite_roles') x
$$;

select is(pg_temp.listed_roles(p), pg_temp.accepted_roles(p),
  p || ': the drawer lists exactly the roles Add employee accepts')
from unnest(array['r:owner', 'r:zeynep', 'r:lale', 'r:ayse']) p;

select * from finish();
rollback;
