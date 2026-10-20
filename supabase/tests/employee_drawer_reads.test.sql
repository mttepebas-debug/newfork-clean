begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- FB-6.2 .7b (KK-35 S1 a), EMP-001: what the Employees drawer and list read
-- from the server, so the screen does not work it out itself.
-- 1. The shape of the detail and of a list row, key by key (EMP-001: a
--    manager manages where they are assigned, so neither names more).
-- 2. Per location they work at, whether the reader may take them off it
--    (employee.remove_from_location).
-- 3. allowed answers invite and onboarding_review with the record actions.
-- Example: Selin manages Kadikoy and Besiktas, where she is assigned; Ayse
-- manages Besiktas.

select tests.world('d');
select tests.person('d', 'selin', 'manager', array['K', 'B'], array['cook']);
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
create function pg_temp.removable(answer jsonb) returns text[] language sql as $$
  select coalesce(array_agg((x ->> 'name') || '=' || (x ->> 'removable') order by x ->> 'name'), '{}')
  from jsonb_array_elements(answer -> 'locations') x
$$;
create function pg_temp.may(answer jsonb, keys text[]) returns boolean[] language sql as $$
  select array_agg((answer -> 'allowed' ->> k)::boolean order by ordinality)
  from unnest(keys) with ordinality k
$$;
-- 1. The answer's shape, key by key -----------------------------------------------------
-- A manager manages where they are assigned (EMP-001): neither read names
-- any other kind of location for a person.

select is(
  array(select k from jsonb_object_keys(pg_temp.detail('owner', 'selin')) k order by k),
  -- DAVET-ERISIM: the two slots by role and Manages (employee_role_id, management_role_id, managed_location_ids).
  array['access', 'account_email', 'allowed', 'archived_at', 'display_name', 'display_status', 'employee_code',
    'employee_role_id', 'events', 'first_name', 'id', 'internal_note', 'invitation', 'invitation_email',
    'is_excluded_from_schedule', 'is_remote', 'is_workspace_owner', 'job_count', 'jobs', 'last_name', 'location_count',
    'locations', 'managed_location_ids', 'management_role_id', 'onboarding', 'preferred_name', 'primary_job_id', 'primary_job_name',
    'primary_location_id', 'primary_location_name', 'private_contact', 'revision', 'role_id',
    'role_name', 'start_date', 'user_id', 'workspace_id'],
  'the detail answers exactly these keys');
-- EMP-001 / BL-421: the drawer asks the server whose record is the owner's,
-- not the role's name.
select is(
  array[pg_temp.detail('owner', 'owner') -> 'is_workspace_owner',
    pg_temp.detail('owner', 'zeynep') -> 'is_workspace_owner',
    pg_temp.detail('ayse', 'emre') -> 'is_workspace_owner'],
  array['true', 'false', 'false']::jsonb[],
  'only the owner''s record says it is the owner''s: not an admin''s, not an employee''s');
select is(
  (select array(select k from jsonb_object_keys(to_jsonb(e)) k order by k)
   from public.list_employees_service(tests.user('d:owner'), tests.id('d'), false, '', 'all', 200, 0) e
   where e.id = tests.id('d:selin')),
  array['archived_at', 'display_name', 'display_status', 'employee_access', 'employee_code', 'first_name', 'id',
    'invitation_email', 'job_count', 'last_name', 'locations', 'management_access', 'preferred_name',
    'primary_job_id', 'primary_job_name',
    'revision', 'start_date', 'workspace_id'],
  'a list row carries exactly these columns');
-- KARARLAR S-179: a list row names the two access slots apart, not a role, so the Access column
-- says which app the person reaches: Management + Employee, Management, Employee or No access.
select tests.person('d', 'mona', 'manager', array['K'], array['cook']);
select tests.no_employee_slot('d', 'mona');
select is(
  (select array_agg(e.first_name || '=' || e.management_access || '/' || e.employee_access order by e.first_name)
   from public.list_employees_service(tests.user('d:owner'), tests.id('d'), false, '', 'all', 200, 0) e
   where e.id in (tests.id('d:selin'), tests.id('d:mona'), tests.id('d:emre'), tests.id('d:pia'))),
  array['Emre=false/true', 'Mona=true/false', 'Pia=false/false', 'Selin=true/true'],
  'Selin manages and works, Mona only manages, Emre only works, Pia has no account yet');

-- 2. Whether they may be taken off a location -------------------------------------

select is(pg_temp.removable(pg_temp.detail('ayse', 'emre')), array['Besiktas=true', 'Kadikoy=false'],
  'a manager may take Emre off the location they manage, not off the other one');
select is(pg_temp.removable(pg_temp.detail('owner', 'emre')), array['Besiktas=true', 'Kadikoy=true'],
  'the owner may take Emre off either location');
select is(pg_temp.removable(pg_temp.detail('ayse', 'selin')), array['Besiktas=false', 'Kadikoy=false'],
  'a manager may not take a fellow manager off a location');
select is(pg_temp.removable(pg_temp.detail('zeynep', 'selin')), array['Besiktas=true', 'Kadikoy=true'],
  'an admin may take a manager off a location');

-- 3. allowed: inviting, reviewing onboarding ---------------------------------------------

select is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.detail('owner', 'selin') -> 'allowed') k),
  array['archive', 'change_role', 'invite', 'make_admin', 'onboarding_review', 'remove_access',
    'save', 'terminate'],
  'allowed answers the drawer''s eight record actions');
select is(pg_temp.may(pg_temp.detail('owner', 'selin'), array['onboarding_review']),
  array[true], 'the owner may review Selin''s onboarding');
select is(pg_temp.may(pg_temp.detail('ayse', 'selin'), array['invite', 'onboarding_review']),
  array[false, false], 'a manager may do neither to a fellow manager');
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
select is(pg_temp.detail('owner', 'emre') -> 'private_contact' ->> 'phone', tests.phone('d:emre'),
  'with what he gave in onboarding');
select is(pg_temp.detail('owner', 'pia') -> 'private_contact',
  jsonb_build_object(
    'phone', null, 'street_address', null, 'city', null, 'region', null,
    'postal_code', null, 'country_code', null, 'date_of_birth', null,
    'emergency_contact_name', null, 'emergency_contact_relationship', null,
    'emergency_contact_phone', null, 'emergency_contact_email', '',
    'share_phone_with_teammates', false, 'share_email_with_teammates', false),
  'the owner reads an empty private profile for Pia, who has none on file yet: no names, nothing given');
select is(pg_temp.detail('ayse', 'emre') -> 'private_contact', 'null'::jsonb,
  'a manager without private read reads null, though Emre''s profile is on file');
select is(pg_temp.detail('ayse', 'pia') -> 'private_contact', 'null'::jsonb,
  'and null for Pia too: "may not read" is one answer whatever is on file');
select is(pg_temp.may(pg_temp.detail('selin', 'selin'), array['invite', 'onboarding_review']),
  array[false, false], 'a manager may do neither to their own record');

-- Another workspace reads nothing of this -------------------------------------------

select throws_ok(
  format('select public.get_employee_detail_service(%L, %L, %L)', tests.user('dx:owner'), tests.id('d'), tests.id('d:selin')),
  '42501', null, 'the owner of another workspace reads nothing of Selin');
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
    array['operations', 'pending_requests', 'open_shifts', 'announcements', 'todos', 'quick_actions'],
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
