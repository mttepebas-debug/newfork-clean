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
  (select e.location_count from public.list_employees_service(tests.user('m:owner'), tests.id('m'), false, 'Emre', 'all', 10, 0) e),
  0::bigint,
  'the owner still lists the record, with no location'
);
select ok(
  exists (select 1 from public.notification_outbox o
    where o.workspace_id = tests.id('m') and o.type_key = 'people.employee.no_location'
      and o.payload -> 'recipient_user_ids' @> to_jsonb(array[tests.user('m:owner'), tests.user('m:zeynep')])
      and not o.payload -> 'recipient_user_ids' @> to_jsonb(array[tests.user('m:ayse')])),
  'the owner and the admin are told the record has no location left; the manager is not'
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

-- S2: a manager who only manages Besiktas reaches it everywhere the core asks,
-- and is never a row on its Schedule (FB-6.2.2).
select tests.person('m', 'selin', 'manager', null, null);
select tests.manages('m', 'selin', 'B');
select is(app_private.scope_set(tests.user('m:selin'), tests.id('m'), 'schedule.edit'), array[tests.id('m:B')],
  'a manager reaches the location they manage');
select ok(
  not exists (select 1 from jsonb_array_elements(
      public.get_schedule_read_model_service(tests.user('m:owner'), tests.id('m'), tests.week(1)) -> 'employees') e
    where (e ->> 'id')::uuid = tests.id('m:selin') and e::text like '%' || tests.id('m:B') || '%'),
  'managing Besiktas does not put them on Besiktas''s schedule'
);

-- An employee's membership never reaches every location (FB-6.2, Done when 5).
select is(
  (select count(*)::integer from public.workspace_memberships m
   where m.workspace_id = tests.id('m') and m.role = 'employee' and m.all_locations),
  0, 'no employee membership reaches every location'
);
update public.workspace_memberships set all_locations = true
where workspace_id = tests.id('m') and user_id = tests.user('m:emre');
select is(
  (select m.all_locations from public.workspace_memberships m where m.workspace_id = tests.id('m') and m.user_id = tests.user('m:emre')),
  false, 'an employee membership set to every location stays at its own'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'workspace_memberships_employee_not_all_locations'),
  'the rule is a check on the table'
);

-- BL-270: a membership row changed with nobody signed in used to pass the
-- role-change trigger untouched (it returned early when auth.uid() was null).
-- Last: while it passes, the change sticks.
select todo('BL-270: the membership trigger asks the core in FB-6.2.4', 1);
select throws_ok(
  format($$update public.workspace_memberships
    set role = 'admin', role_id = (select r.id from public.workspace_roles r where r.workspace_id = %L and r.system_key = 'admin')
    where workspace_id = %L and user_id = %L$$, tests.id('m'), tests.id('m'), tests.user('m:emre')),
  '42501', null,
  'a membership change with nobody signed in is refused'
);

select * from finish();
rollback;
