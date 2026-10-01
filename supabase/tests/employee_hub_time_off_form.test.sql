begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- FB-6.3 (KARARLAR "İzin", rule 16): the time-off form in Employee Hub has no
-- location. Its hours are fixed in the time zone of the person's primary
-- location (none for somebody with no location: the device's), and it warns
-- before sending when the request falls inside the decision lead time. The
-- hub read gives both, by the rule the send itself uses.

select tests.world('th');
-- Ali's primary location is Besiktas, which keeps Chicago time here.
select tests.person('th', 'ali', 'employee', array['B', 'K'], array['cook']);
select tests.person('th', 'lale', 'employee', null, null);
update public.locations set timezone = 'America/Chicago' where id = tests.id('th:B');
update public.workspace_scheduling_settings set time_off_lead_hours = 36 where workspace_id = tests.id('th');

create function pg_temp.hub(who text) returns jsonb language sql as $$
  select public.get_employee_hub_service(tests.user('th:' || who), tests.id('th'), tests.week(1), tests.week(1) + 6)
$$;

select is(pg_temp.hub('ali') ->> 'time_off_timezone', 'America/Chicago', 'the form fixes hours in the primary location''s time zone');
select is(
  (public.submit_time_off_service(tests.user('th:ali'), tests.id('th'),
     jsonb_build_array(jsonb_build_object('segment_date', tests.week(1) + 2)), 'hub zone',
     pg_temp.hub('ali') ->> 'time_off_timezone', gen_random_uuid()) ->> 'status'),
  'pending', 'and sending with that time zone is accepted');
select ok(pg_temp.hub('lale') ? 'time_off_timezone' and pg_temp.hub('lale') -> 'time_off_timezone' = 'null'::jsonb,
  'somebody with no location gets none: the device decides');
select is((pg_temp.hub('ali') -> 'settings' ->> 'time_off_lead_hours')::integer, 36, 'the form knows the decision lead time');

select * from finish();
rollback;
