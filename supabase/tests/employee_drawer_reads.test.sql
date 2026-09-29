begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- FB-6.2 .7b (KK-35 S1 a, S2 a): what the Employees drawer and list read from
-- the server, so the screen does not work it out itself.
-- 1. The locations a manager only manages (KK-29), as the drawer's editor and
--    the list's "Manages" label show them; only the ones the reader reaches.
-- 2. Per location they work at, whether the reader may take them off it
--    (employee.remove_from_location).
-- 3. allowed answers set_managed_locations, invite and onboarding_review.
-- Example: Selin works at Kadikoy and only manages Besiktas and Cihangir. Ayse
-- manages Besiktas only: she sees that Selin manages Besiktas, never Cihangir.

select tests.world('d');
-- A third location, as the owner adds it in Settings > Locations.
select tests.as_browser(tests.user('d:owner'), format(
  $sql$insert into public.locations (id, workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
       values (%L, %L, 'Cihangir', 'CHG', '3 Siraselviler Cd', 'Istanbul', 'Istanbul', '34433', 'Europe/Istanbul')$sql$,
  tests.remember('d:C', gen_random_uuid()), tests.id('d')));
select tests.person('d', 'selin', 'manager', array['K'], array['cook']);
select tests.manages('d', 'selin', 'B');
select tests.manages('d', 'selin', 'C');
select tests.person('d', 'ayse', 'manager', array['B'], array['cook']);
select tests.person('d', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('d', 'emre', 'employee', array['K', 'B'], array['cook']);
-- Invited, not accepted yet: no account on the record and no private profile.
select tests.person('d', 'pia', 'employee', array['B'], array['cook'], 'pending');
select tests.person('d', 'ola', 'employee', array['B'], array['cook'], 'pending');
update public.employee_profiles set archived_at = now() where id = tests.id('d:ola');
select tests.world('dx');

create function pg_temp.detail(reader text, person text) returns jsonb language sql as $$
  select public.get_employee_detail_service(tests.user('d:' || reader), tests.id('d'), tests.id('d:' || person))
$$;
create function pg_temp.managed(answer jsonb) returns text[] language sql as $$
  select coalesce(array_agg(x ->> 'name' order by x ->> 'name'), '{}')
  from jsonb_array_elements(answer -> 'managed_locations') x
$$;
create function pg_temp.removable(answer jsonb) returns text[] language sql as $$
  select coalesce(array_agg((x ->> 'name') || '=' || (x ->> 'removable') order by x ->> 'name'), '{}')
  from jsonb_array_elements(answer -> 'locations') x
$$;
create function pg_temp.may(answer jsonb, keys text[]) returns boolean[] language sql as $$
  select array_agg((answer -> 'allowed' ->> k)::boolean order by ordinality)
  from unnest(keys) with ordinality k
$$;
create function pg_temp.listed_manages(reader text, person text) returns text[] language sql as $$
  select e.managed_location_names
  from public.list_employees_service(tests.user('d:' || reader), tests.id('d'), false, '', 'all', 200, 0) e
  where e.id = tests.id('d:' || person)
$$;

-- 1. Where somebody only manages ------------------------------------------------------

select is(pg_temp.managed(pg_temp.detail('owner', 'selin')), array['Besiktas', 'Cihangir'],
  'the owner reads every location Selin only manages, not Kadikoy where she works');
select is(
  (select array_agg(x ->> 'id' order by x ->> 'name') from jsonb_array_elements(pg_temp.detail('owner', 'selin') -> 'managed_locations') x),
  array[tests.id('d:B')::text, tests.id('d:C')::text],
  'each managed location comes with its id');
select is(pg_temp.managed(pg_temp.detail('ayse', 'selin')), array['Besiktas'],
  'a manager of Besiktas reads that Selin manages Besiktas, not the location out of their reach');
select is(pg_temp.managed(pg_temp.detail('selin', 'selin')), array['Besiktas', 'Cihangir'],
  'Selin reads every location she manages on her own record');
select is(pg_temp.detail('owner', 'emre') -> 'managed_locations', '[]'::jsonb,
  'somebody who manages nowhere reads an empty list');

select is(pg_temp.listed_manages('owner', 'selin'), array['Besiktas', 'Cihangir'],
  'the list names the locations Selin only manages, for the Manages label');
select is(pg_temp.listed_manages('ayse', 'selin'), array['Besiktas'],
  'a manager''s list names only the managed locations they reach');
select is(pg_temp.listed_manages('owner', 'emre'), '{}'::text[],
  'the list names nothing for somebody who manages nowhere');

-- 2. Whether they may be taken off a location -------------------------------------

select is(pg_temp.removable(pg_temp.detail('ayse', 'emre')), array['Besiktas=true', 'Kadikoy=false'],
  'a manager may take Emre off the location they manage, not off the other one');
select is(pg_temp.removable(pg_temp.detail('owner', 'emre')), array['Besiktas=true', 'Kadikoy=true'],
  'the owner may take Emre off either location');
select is(pg_temp.removable(pg_temp.detail('ayse', 'selin')), array['Kadikoy=false'],
  'a manager may not take a fellow manager off a location');
select is(pg_temp.removable(pg_temp.detail('zeynep', 'selin')), array['Kadikoy=true'],
  'an admin may take a manager off a location');

-- 3. allowed: managing, inviting, reviewing onboarding ---------------------------------

select is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.detail('owner', 'selin') -> 'allowed') k),
  array['archive', 'change_role', 'invite', 'make_admin', 'onboarding_review', 'remove_access',
    'save', 'set_managed_locations', 'terminate'],
  'allowed answers the drawer''s nine record actions');
select is(pg_temp.may(pg_temp.detail('owner', 'selin'), array['set_managed_locations', 'onboarding_review']),
  array[true, true], 'the owner may set where Selin manages and review her onboarding');
select is(pg_temp.may(pg_temp.detail('zeynep', 'selin'), array['set_managed_locations']),
  array[true], 'an admin may set where a manager manages');
select is(pg_temp.may(pg_temp.detail('ayse', 'selin'), array['set_managed_locations', 'invite', 'onboarding_review']),
  array[false, false, false], 'a manager may do none of the three to a fellow manager');
select is(pg_temp.may(pg_temp.detail('owner', 'emre'), array['set_managed_locations']),
  array[false], 'nobody sets managed locations for somebody who is not a manager');
-- Invite answers as the command does (prepare_employee_invitation_service):
-- only a live record with no account on it is invitable (7b QA finding 2).
select is(pg_temp.may(pg_temp.detail('owner', 'pia'), array['invite']),
  array[true], 'the owner may invite somebody who has no account yet');
select is(pg_temp.may(pg_temp.detail('ayse', 'pia'), array['invite']),
  array[true], 'a manager may invite an employee at their location who has no account yet');
select is(pg_temp.may(pg_temp.detail('owner', 'selin'), array['invite']),
  array[false], 'nobody invites somebody whose account is already linked');
select is(pg_temp.may(pg_temp.detail('ayse', 'emre'), array['invite']),
  array[false], 'a manager does not invite an employee who already has an account');
select is(pg_temp.may(pg_temp.detail('owner', 'ola'), array['invite']),
  array[false], 'nobody invites an archived record');

-- 4. private_contact: "may read, nothing on file" and "may not read" differ ------
-- (7b QA finding 1). The owner reads private data; a manager does not by default.

select is(jsonb_typeof(pg_temp.detail('owner', 'emre') -> 'private_contact'), 'object',
  'the owner reads Emre''s private profile, which is on file');
select is(pg_temp.detail('owner', 'emre') -> 'private_contact' ->> 'phone', '+14155550123',
  'with what he gave in onboarding');
select is(pg_temp.detail('owner', 'pia') -> 'private_contact',
  jsonb_build_object(
    'preferred_name', '', 'phone', null, 'street_address', null, 'city', null, 'region', null,
    'postal_code', null, 'country_code', null, 'date_of_birth', null,
    'emergency_contact_name', null, 'emergency_contact_relationship', null,
    'emergency_contact_phone', null, 'emergency_contact_email', '',
    'share_phone_with_teammates', false, 'share_email_with_teammates', false),
  'the owner reads an empty private profile for Pia, who has none on file yet: no legal name, nothing given');
select is(pg_temp.detail('ayse', 'emre') -> 'private_contact', 'null'::jsonb,
  'a manager without private read reads null, though Emre''s profile is on file');
select is(pg_temp.detail('ayse', 'pia') -> 'private_contact', 'null'::jsonb,
  'and null for Pia too: "may not read" is one answer whatever is on file');
select is(pg_temp.may(pg_temp.detail('selin', 'selin'), array['set_managed_locations', 'invite', 'onboarding_review']),
  array[false, false, false], 'a manager may do none of the three to their own record');

-- Another workspace reads nothing of this -------------------------------------------

select throws_ok(
  format('select public.get_employee_detail_service(%L, %L, %L)', tests.user('dx:owner'), tests.id('d'), tests.id('d:selin')),
  '42501', null, 'the owner of another workspace reads nothing of Selin');
select is(
  (select count(*)::integer from public.list_employees_service(tests.user('dx:owner'), tests.id('dx'), false, '', 'all', 200, 0) e
   where cardinality(e.managed_location_names) > 0),
  0, 'another workspace''s list names no managed location of this one');

-- Saving the Workspace home layout asks the same gate as the home itself
-- (KK-36 (a), workspace.todos): an employee, who cannot open the home, does
-- not save its layout either.
create function pg_temp.saves_layout(person text) returns text
language plpgsql as $$
declare
  state text;
  hint text;
begin
  perform public.save_workspace_layout_service(tests.user(person), tests.id('d'),
    array['operations', 'pending_requests', 'open_shifts', 'announcements', 'todos', 'notifications', 'quick_actions'],
    array['announcements']);
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
  return state || coalesce(' ' || nullif(hint, ''), '');
end;
$$;
select is(
  array[pg_temp.saves_layout('d:owner'), pg_temp.saves_layout('d:zeynep'), pg_temp.saves_layout('d:ayse')],
  array['allowed', 'allowed', 'allowed'], 'the owner, an admin and a manager save their Workspace home layout');
select is(pg_temp.saves_layout('d:emre'), '42501 authz.missing_permission',
  'an employee does not save a Workspace home layout, and the refusal says why');
select is(pg_temp.saves_layout('dx:owner'), '42501 authz.not_member',
  'the owner of another workspace saves no layout here');

-- A deleted location is gone from both (last: it is not brought back).
update public.locations set archived_at = now(), deleted_at = now() where id = tests.id('d:C');
select is(pg_temp.managed(pg_temp.detail('owner', 'selin')), array['Besiktas'],
  'a deleted location is no longer read as managed');
select is(pg_temp.listed_manages('owner', 'selin'), array['Besiktas'],
  'nor listed as managed');

-- "Only a manager manages where they do not work" is written once: the drawer's
-- answer and the command ask the same helper (nf-guvenlik D4).
select is(
  array(select p.proname::text from pg_proc p
    where p.proname in ('get_employee_detail_service', 'set_employee_managed_locations_service')
      and pg_get_functiondef(p.oid) ~ 'app_private\.manages_without_working\('
    order by p.proname),
  array['get_employee_detail_service', 'set_employee_managed_locations_service'],
  'the drawer and the command ask one helper whether somebody may manage without working there');
select throws_ok(
  format('select public.set_employee_managed_locations_service(%L, %L, %L, %L)',
    tests.user('d:owner'), tests.id('d'), tests.id('d:emre'), array[tests.id('d:C')]),
  '22023', null, 'the command refuses an employee, as the drawer''s answer says');

-- A core action that is not there fails loudly; it never reads as allowed
-- (nf-guvenlik D5, CLAUDE.md §9 fail-open). Last: the rows are not brought back.
delete from app_private.authz_actions where key = 'employee.remove_from_location';
select throws_ok(
  format('select public.get_employee_detail_service(%L, %L, %L)', tests.user('d:owner'), tests.id('d'), tests.id('d:emre')),
  '22023', null, 'without the removal action the drawer is refused, not read as removable');
delete from app_private.authz_actions where key = 'employee.list';
select throws_ok(
  format('select * from public.list_employees_service(%L, %L)', tests.user('d:owner'), tests.id('d')),
  '22023', null, 'without the list action the list is refused');

select * from finish();
rollback;
