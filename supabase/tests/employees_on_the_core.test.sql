begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- The Employees slice on the authorization core (FB-6.2): the rules the
-- authorization matrix cannot probe cell by cell.

select tests.world('m');
select tests.person('m', 'emre', 'employee', array['K'], array['cook']);

-- S1: a manager removes somebody from their own location (FB-6.2.2).
select tests.person('m', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('m', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('m', 'ali', 'employee', array['K', 'B'], array['cook']);
select tests.publish_week('m', 1, '[
  {"label": "ali-k", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"},
  {"label": "ali-b", "person": "ali", "loc": "B", "job": "cook", "day": 3, "start": "09:00", "end": "15:00"}
]');

create function pg_temp.works_at(person text) returns text[] language sql as $$
  select coalesce(array_agg(case a.location_id when tests.id('m:K') then 'K' when tests.id('m:B') then 'B' end
    || case when a.is_primary then '*' else '' end order by a.is_primary desc), '{}')
  from public.employee_location_assignments a where a.employee_id = tests.id('m:' || person) and a.ended_at is null
$$;

select lives_ok(
  format('select public.remove_employee_from_location_service(%L, %L, %L, %L)',
    tests.user('m:ayse'), tests.id('m'), tests.id('m:ali'), tests.id('m:K')),
  'a manager removes an employee from their own location'
);
select is(pg_temp.works_at('ali'), array['B*'], 'the other location stays and becomes the primary one');
select is(
  (select array_agg(s.employee_id is null order by s.location_id = tests.id('m:K') desc)
   from public.schedule_published_shifts s where s.id in (tests.id('m:shift:ali-k'), tests.id('m:shift:ali-b'))),
  array[true, false],
  'the future shift at that location is left open; the other location''s shift stays'
);

select lives_ok(
  format('select public.remove_employee_from_location_service(%L, %L, %L, %L)',
    tests.user('m:ayse'), tests.id('m'), tests.id('m:emre'), tests.id('m:K')),
  'a manager removes an employee from their only location'
);
select is(pg_temp.works_at('emre'), '{}'::text[], 'the record stays, with no location');
select is(
  (select jsonb_array_length(e.locations) from public.list_employees_service(tests.user('m:owner'), tests.id('m'), false, 'Emre', 'all', 10, 0) e),
  0,
  'the owner still lists the record, with no location'
);
select throws_ok(
  format($$select public.save_employee_service(%L, %L, e.id, e.first_name, e.middle_name, e.last_name, e.preferred_name,
      e.invitation_email, e.start_date, e.internal_note, '{}', null,
      array(select j.job_id from public.employee_job_assignments j where j.employee_id = e.id and j.ended_at is null),
      (select j.job_id from public.employee_job_assignments j where j.employee_id = e.id and j.ended_at is null and j.is_primary),
      false, false, e.revision) from public.employee_profiles e where e.id = %L$$,
    tests.user('m:owner'), tests.id('m'), tests.id('m:emre')),
  '22023', null,
  'saved from the drawer, the record still needs a location (S1, user''s condition)'
);
select throws_ok(
  format('select public.remove_employee_from_location_service(%L, %L, %L, %L)',
    tests.user('m:ayse'), tests.id('m'), tests.id('m:emre'), tests.id('m:K')),
  '42501', null,
  'nobody is removed from a location they do not work at'
);

-- EMP-001: a manager manages the locations they are assigned to, and nothing
-- else. One who manages Besiktas without taking shifts is assigned there and
-- excluded from the Schedule.
select tests.person('m', 'selin', 'manager', array['B'], array['cook']);
select tests.excluded('m', 'selin');
select is(app_private.scope_set(tests.user('m:selin'), tests.id('m'), 'schedule.edit'), array[tests.id('m:B')],
  'a manager reaches the location they are assigned to, excluded from the Schedule or not');
select is(app_private.scope_set(tests.user('m:ayse'), tests.id('m'), 'schedule.edit'), array[tests.id('m:K')],
  'and no other location');

-- An employee's membership never reaches every location (FB-6.2, Done when 5). ROL-CIFT: only a
-- management slot reaches further than where somebody works; an employee has no Manages.
select is(
  (select count(*)::integer from public.workspace_memberships m
   join public.membership_managed_locations x on x.membership_id = m.id
   where m.workspace_id = tests.id('m') and m.role_id is null),
  0, 'no employee membership reaches every location'
);
select throws_ok(
  format('insert into public.membership_managed_locations (workspace_id, membership_id, location_id) select %L, m.id, %L from public.workspace_memberships m where m.workspace_id = %L and m.user_id = %L',
    tests.id('m'), tests.id('m:B'), tests.id('m'), tests.user('m:emre')),
  '23514', null, 'an employee membership given another location stays at its own'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'managed_location_needs_manager'),
  'the rule is a check on the table'
);

-- FB-6.2.3: reading and listing ask the core. A manager sees everyone who
-- works at their locations, the owner and their peers included (M2, KK-8).
select tests.person('m', 'veli', 'employee', array['B'], array['cook']);
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

select ok(
  exists (select 1 from public.list_employees_service(tests.user('m:ayse'), tests.id('m'), false, '', 'all', 200, 0) e
          where e.id = tests.id('m:owner')),
  'a manager lists the owner who works at their location'
);
select is(
  public.get_employee_detail_service(tests.user('m:ayse'), tests.id('m'), tests.id('m:owner')) #>> '{allowed,save}',
  'false', 'the owner''s record opens read-only for a manager: the rank rule says so'
);
select is(
  public.get_employee_detail_service(tests.user('m:owner'), tests.id('m'), tests.id('m:ali')) #>> '{allowed,save}',
  'true', 'the owner may save an employee''s record'
);
select is(
  pg_temp.refusal(format('select public.get_employee_detail_service(%L, %L, %L)', tests.user('m:ayse'), tests.id('m'), tests.id('m:veli'))),
  '42501 authz.out_of_scope', 'somebody out of reach is refused as out of scope'
);
select is(
  pg_temp.refusal(format('select public.get_employee_detail_service(%L, %L, %L)', tests.user('m:ayse'), tests.id('m'), gen_random_uuid())),
  '42501 authz.out_of_scope', 'somebody unknown gets the same answer'
);
select is(
  pg_temp.refusal(format('select public.get_member_avatar_service(%L, %L, %L)', tests.user('m:ayse'), tests.id('m'), tests.id('m:veli'))),
  '42501 authz.out_of_scope', 'a photo is read by the same rule'
);
select is(
  pg_temp.refusal(format('select * from public.list_employees_service(%L, %L)', tests.user('m:ali'), tests.id('m'))),
  '42501 authz.missing_permission', 'an employee does not list the team'
);
select is(
  pg_temp.refusal(format('select * from public.list_employees_service(%L, %L)', gen_random_uuid(), tests.id('m'))),
  '42501 authz.not_member', 'somebody who is not a member does not list anyone'
);
select is(
  tests.as_browser(tests.user('m:ali'), format('select 1 from public.workspace_memberships where workspace_id = %L', tests.id('m'))),
  1, 'from the browser an employee reads their own membership row only'
);
select ok(
  to_regprocedure('public.get_employee_detail(uuid, uuid)') is null
  and to_regprocedure('public.list_employees(uuid, boolean, text, text, integer, integer)') is null,
  'the two browser-era read bridges are gone'
);

-- FB-6.2.4: writing asks the core. A refusal says why, and somebody unknown
-- gets the same answer as somebody out of reach (review D5).
select tests.person('m', 'kaan', 'admin', array['B'], array['server']);
select tests.person('m', 'ece', 'employee', array['K'], array['cook']);
select tests.role('m', 'line cook', 'employee', array(
  select rp.permission_key from public.workspace_role_permissions rp
  join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('m') and r.system_key = 'employee'));
create function pg_temp.save_as(actor text, person text, locs text[]) returns text language sql as $$
  select pg_temp.refusal(format($f$select public.save_employee_service(%L, %L, e.id, e.first_name, e.middle_name,
      e.last_name, e.preferred_name, e.invitation_email, e.start_date, e.internal_note, %L::uuid[], %L::uuid,
      array(select j.job_id from public.employee_job_assignments j where j.employee_id = e.id and j.ended_at is null),
      (select j.job_id from public.employee_job_assignments j where j.employee_id = e.id and j.ended_at is null and j.is_primary),
      false, false, e.revision) from public.employee_profiles e where e.id = %L$f$,
    tests.user(case actor when 'olcay' then 'm:owner' else 'm:' || actor end), tests.id('m'),
    array(select tests.id('m:' || l) from unnest(locs) l), tests.id('m:' || locs[1]),
    coalesce((select i.id from tests.ids i where i.label = 'm:' || person), gen_random_uuid())))
$$;
select is(pg_temp.save_as('zeynep', 'kaan', array['B']), '42501 authz.rank',
  'an admin does not save another admin''s record (KK-24)');
select is(pg_temp.save_as('zeynep', 'zeynep', array['K']), 'allowed', 'an admin saves their own record');
select is(pg_temp.save_as('ayse', 'veli', array['B']), '42501 authz.out_of_scope',
  'a manager does not save a record out of reach');
select is(
  pg_temp.refusal(format($$select public.save_employee_service(%L, %L, %L, 'Nobody', '', 'Person', '', '', null, '',
      %L::uuid[], %L, %L::uuid[], %L, false, false, 1)$$,
    tests.user('m:ayse'), tests.id('m'), gen_random_uuid(), array[tests.id('m:K')], tests.id('m:K'),
    array[tests.id('m:job:cook')], tests.id('m:job:cook'))),
  '42501 authz.out_of_scope', 'somebody unknown gets the same answer');
select is(pg_temp.save_as('ayse', 'ece', array['K', 'B']), '42501 authz.out_of_scope',
  'a manager does not add a location they do not manage');
select is(pg_temp.save_as('selin', 'veli', array['B']), 'allowed',
  'a manager excluded from the Schedule saves a record at the location they are assigned to');

-- A manager moves somebody between employee roles at their own locations
-- (6A), and gives nobody a role at or above their own.
-- DAVET-ERISIM: a role change is an access change. An employee role takes the
-- employee slot and empties the management one; a management role goes beside
-- the employee slot they hold, a manager managing where they work.
create function pg_temp.role_change(actor text, person text, role_key text) returns text language sql as $$
  select format('select public.change_employee_access_service(%L, %L, %L, %L, %L, %L::uuid[], null, null)',
    tests.user(case actor when 'olcay' then 'm:owner' else 'm:' || actor end), tests.id('m'), tests.id('m:' || person),
    case when r.access_class = 'employee' then r.id else (select m.employee_role_id from public.workspace_memberships m
      where m.workspace_id = tests.id('m') and m.user_id = tests.user('m:' || person)) end,
    case when r.access_class <> 'employee' then r.id end,
    case when r.access_class = 'manager' then array(select a.location_id from public.employee_location_assignments a
      where a.employee_id = tests.id('m:' || person) and a.ended_at is null) else '{}'::uuid[] end)
  from public.workspace_roles r
  where r.workspace_id = tests.id('m') and (r.system_key::text = role_key or r.name = role_key)
$$;
create function pg_temp.role_as(actor text, person text, role_key text) returns text language sql as $$
  select pg_temp.refusal(pg_temp.role_change(actor, person, role_key))
$$;
select is(pg_temp.role_as('ayse', 'ece', 'line cook'), 'allowed', 'a manager moves an employee to another employee role');
select is(pg_temp.role_as('ayse', 'ece', 'manager'), '42501 authz.rank', 'a manager does not make anybody a manager');
select is(pg_temp.role_as('zeynep', 'kaan', 'manager'), '42501 authz.rank', 'an admin does not change another admin''s role');
select is(pg_temp.role_as('zeynep', 'ece', 'admin'), '42501 authz.owner_only', 'only the owner makes an admin');

-- BL-270: taking another admin's access away is the owner's.
select is(
  pg_temp.refusal(format('select public.remove_employee_access_service(%L, %L, %L)',
    tests.user('m:zeynep'), tests.id('m'), tests.id('m:kaan'))),
  '42501 authz.rank', 'an admin does not take another admin''s access away');

-- Ending employment of somebody with no location left (S1): nothing to match
-- the worksite time zone against, so any valid one is taken.
select lives_ok(
  format($$select public.terminate_employee_service(%L, %L, %L, localtimestamp, 'Europe/Istanbul', 'no location left', gen_random_uuid())$$,
    tests.user('m:owner'), tests.id('m'), tests.id('m:emre')),
  'the owner ends the employment of somebody with no location left');

-- Ending employment opens the published shifts the person has not started yet (BL-768; moved here
-- from the termination notice test when the notice went, BILDIRIM-04): Oya's shifts at both locations.
select tests.person('m', 'oya', 'employee', array['K', 'B'], array['cook']);
select tests.publish_week('m', 2, '[
  {"label": "oya-k", "person": "oya", "loc": "K", "job": "cook", "day": 0, "start": "10:00", "end": "16:00"},
  {"label": "oya-b", "person": "oya", "loc": "B", "job": "cook", "day": 2, "start": "09:00", "end": "13:00"}
]');
select lives_ok(
  format($$select public.terminate_employee_service(%L, %L, %L, localtimestamp, 'Europe/Istanbul', 'Employment ended', gen_random_uuid())$$,
    tests.user('m:owner'), tests.id('m'), tests.id('m:oya')),
  'the owner ends Oya''s employment');
select is((select array_agg(s.employee_id is null) from public.schedule_published_shifts s
  where s.id in (tests.id('m:shift:oya-k'), tests.id('m:shift:oya-b'))), array[true, true],
  'her Kadikoy shift and her Besiktas shift are open');

-- A role change is written to the audit log with the two slots before and
-- after; a role holds no location of its own (EMP-001), so the only places it
-- names are the ones a manager is given to manage (DAVET-ERISIM), with the
-- Management jobs and what the change did.
select is(pg_temp.role_as('olcay', 'selin', 'employee'), 'allowed', 'the owner makes a manager an employee');
select is(
  (select array(select k from jsonb_object_keys(a.metadata) k order by k)
   from public.audit_events a
   where a.workspace_id = tests.id('m') and a.action = 'membership.access_changed'
     and a.metadata ->> 'employee_id' = tests.id('m:selin')::text),
  array['employee_id', 'from_employee_role_id', 'from_management_role_id', 'impact', 'managed_location_ids',
    'management_job_ids', 'to_employee_role_id', 'to_management_role_id'],
  'the audit log names the two slots, Manages, the Management jobs and the impact, and nothing else');

select ok(
  to_regprocedure('public.save_employee(uuid, uuid, text, text, text, text, text, date, text, uuid[], uuid, uuid[], uuid, boolean, boolean, integer)') is null
  and to_regprocedure('public.set_employee_archived(uuid, uuid, boolean, boolean)') is null
  and to_regprocedure('public.terminate_employee(uuid, uuid, timestamp, text, text, uuid)') is null,
  'the browser-era write bridges are gone'
);

-- The writers work as the API calls them: as service_role, where the
-- membership guard is not the database owner's console (BL-270). Values are
-- looked up here; service_role reads no table.
create function pg_temp.as_api(statement text) returns text language plpgsql as $$
declare
  code text;
  reason text;
begin
  set local role service_role;
  execute statement;
  reset role;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint;
  return code || ' ' || coalesce(reason, '');
end;
$$;
select tests.person('m', 'oya', 'employee', array['K'], array['cook'], 'onboarding');
select is(pg_temp.as_api(format($$select public.save_employee_onboarding_profile_service(%L, jsonb_build_object(
      'legal_first_name', 'Oya', 'legal_last_name', 'Person', 'phone', '4155550123', 'emergency_contact_name', 'Contact',
      'emergency_contact_relationship', 'Friend', 'emergency_contact_phone', '+14155550100'), %s, %L)$$,
    tests.user('m:oya'), (select c.revision from public.employee_onboarding_cases c where c.employee_id = tests.id('m:oya')), tests.id('m'))),
  'allowed', 'as the API: an invited employee fills in their profile');
select is(pg_temp.as_api(format('select public.submit_employee_onboarding_service(%L, %s, %L)',
    tests.user('m:oya'), (select c.revision from public.employee_onboarding_cases c where c.employee_id = tests.id('m:oya')), tests.id('m'))),
  'allowed', 'as the API: and finishes onboarding');
select is(
  (select m.status::text from public.workspace_memberships m where m.workspace_id = tests.id('m') and m.user_id = tests.user('m:oya')),
  'active', 'finishing onboarding opened the account');
select is(pg_temp.as_api(pg_temp.role_change('olcay', 'ece', 'manager')),
  'allowed', 'as the API: the owner changes a role');
select is(pg_temp.as_api(format('select public.set_employee_archived_service(%L, %L, %L, true, false)',
    tests.user('m:owner'), tests.id('m'), tests.id('m:ece'))),
  'allowed', 'as the API: the owner archives a record');
select is(pg_temp.as_api(format('select public.set_employee_archived_service(%L, %L, %L, false, true)',
    tests.user('m:owner'), tests.id('m'), tests.id('m:ece'))),
  'allowed', 'as the API: and brings it back with its access');
select is(
  (select m.status::text || ' ' || coalesce((select r.access_class::text from public.workspace_roles r where r.id = m.role_id), 'employee') from public.workspace_memberships m
   where m.workspace_id = tests.id('m') and m.user_id = tests.user('m:ece')),
  'active manager', 'the restored account has its role back');

-- BL-270: a membership change nobody asked the core for is refused, even with
-- nobody signed in. The database owner's own console is not a caller (it could
-- switch the trigger off); an application caller is.
create function tests.sneak_role_change(member uuid, new_role uuid) returns void language sql security definer set search_path = '' as $$
  update public.workspace_memberships set role_id = new_role where id = member
$$;
grant execute on function tests.sneak_role_change(uuid, uuid) to service_role;
select is(
  pg_temp.as_api(format('select tests.sneak_role_change(%L, %L)',
    (select m.id from public.workspace_memberships m where m.workspace_id = tests.id('m') and m.user_id = tests.user('m:ali')),
    (select r.id from public.workspace_roles r where r.workspace_id = tests.id('m') and r.system_key = 'admin'))),
  '42501 authz.missing_permission', 'a membership change nobody asked the core for is refused');

-- nf-guvenlik Y1 (T5b .4): giving access back hands out the snapshot's role,
-- so it asks what handing out that role asks, of the membership it reopens.
-- An account a rehire restore detached is nobody's to reopen: the scenario
-- that made an admin out of another admin's hand.
select is(pg_temp.as_api(format('select public.set_employee_archived_service(%L, %L, %L, true, false)',
    tests.user('m:owner'), tests.id('m'), tests.id('m:kaan'))), 'allowed', 'as the API: the owner archives an admin');
select is(pg_temp.as_api(format('select public.set_employee_archived_service(%L, %L, %L, false, false)',
    tests.user('m:owner'), tests.id('m'), tests.id('m:kaan'))), 'allowed', 'and brings the record back without its account');
select is(pg_temp.as_api(format('select public.set_employee_archived_service(%L, %L, %L, true, false)',
    tests.user('m:zeynep'), tests.id('m'), tests.id('m:kaan'))), 'allowed', 'another admin archives the unlinked record');
select is(pg_temp.as_api(format('select public.set_employee_archived_service(%L, %L, %L, false, true)',
    tests.user('m:zeynep'), tests.id('m'), tests.id('m:kaan'))), '22023 ',
  'but cannot reopen an account the record is no longer linked to');
select is(
  (select m.status::text || ' ' || coalesce((select r.access_class::text from public.workspace_roles r where r.id = m.role_id), 'employee') from public.workspace_memberships m
   where m.workspace_id = tests.id('m') and m.user_id = tests.user('m:kaan')),
  'suspended admin', 'the admin''s account stays closed');

-- nf-guvenlik O1: the two flags let through only what their flows write.
select is(
  pg_temp.as_api(format($$select set_config('app.employee_invitation_accept', 'on', true), tests.sneak_role_change(%L, %L)$$,
    (select m.id from public.workspace_memberships m where m.workspace_id = tests.id('m') and m.user_id = tests.user('m:ali')),
    (select r.id from public.workspace_roles r where r.workspace_id = tests.id('m') and r.system_key = 'admin'))),
  '42501 authz.missing_permission', 'accepting an invitation does not change somebody''s role');
select set_config('app.employee_invitation_accept', '', true);
insert into public.workspace_ownership_transfers (workspace_id, initiated_by, target_user_id, previous_owner_membership_id, target_membership_id, status, expires_at)
select tests.id('m'), tests.user('m:owner'), tests.user('m:zeynep'),
  (select m.id from public.workspace_memberships m where m.workspace_id = tests.id('m') and m.user_id = tests.user('m:owner')),
  (select m.id from public.workspace_memberships m where m.workspace_id = tests.id('m') and m.user_id = tests.user('m:zeynep')),
  'pending', now() + interval '1 day';
select is(
  pg_temp.as_api(format($$select set_config('app.owner_transfer', 'on', true), tests.sneak_role_change(%L, %L)$$,
    (select m.id from public.workspace_memberships m where m.workspace_id = tests.id('m') and m.user_id = tests.user('m:zeynep')),
    (select r.id from public.workspace_roles r where r.workspace_id = tests.id('m') and r.system_key = 'manager'))),
  '42501 authz.missing_permission', 'a pending transfer lets its rows become owner and admin, nothing else');
select set_config('app.owner_transfer', '', true);

select * from finish();
rollback;
