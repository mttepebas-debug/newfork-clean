begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- YH-AUTHZ: the managers' Home (KARARLAR S-210) reads within its budget for the
-- first customer's size: four locations, about a hundred people, a published
-- week from today, thirty requests for time off waiting on an answer and some
-- people working without a required document (S-206).
--
-- As in schedule_grid_read_budget, the best warm read counts (three throwaway
-- warm-up reads, then up to 57 more, spaced out once 15 are spent), so other
-- work on the PC only ever adds delay and the fastest read converges on the
-- true cost. Measured 2026-10-20 on the shared local database, best warm read:
-- the owner 51-66 ms quiet and 99 ms with other sessions' tests running, a
-- manager of one location 28-43 ms. About half the owner's read is the
-- per-request authorization of the thirty requests (~1.1 ms each, before the
-- limit of 50); the rest is the four locations' week. The budget, 200 ms,
-- is three times the quiet measure: it catches a read that grows with the
-- data (a per-row check, a lost index), not the PC's load (187 ms was seen
-- with other sessions' e2e running). CI runs it in the db-budget job, alone (BL-562).

select tests.world('hb');
-- Two more locations, in US zones: the Home reads each location's own today.
select tests.as_browser(tests.user('hb:owner'), format(
  $sql$insert into public.locations (id, workspace_id, name, short_name, street_address, city, region, postal_code, timezone)
       values (%L, %L, 'Castro', 'CST', '3 Castro St', 'San Francisco', 'CA', '94114', 'America/Los_Angeles'),
              (%L, %L, 'Dumbo', 'DMB', '4 Water St', 'Brooklyn', 'NY', '11201', 'America/New_York')$sql$,
  tests.remember('hb:C', gen_random_uuid()), tests.id('hb'),
  tests.remember('hb:D', gen_random_uuid()), tests.id('hb')));

-- A manager at each location, on the floor in a Management job.
select tests.person('hb', 'm' || l, 'manager', array[l], array['general manager'])
from unnest(array['K', 'B', 'C', 'D']) l;
-- 96 people; every fifth works at a second location too.
select tests.person('hb', 'p' || n, 'employee',
  case when n % 5 = 0 then array[(array['K', 'B', 'C', 'D'])[n % 4 + 1], (array['K', 'B', 'C', 'D'])[(n + 1) % 4 + 1]]
       else array[(array['K', 'B', 'C', 'D'])[n % 4 + 1]] end,
  case n % 2 when 0 then array['cook'] else array['server'] end)
from generate_series(1, 96) n;

-- Each location publishes the week from its own today.
insert into public.schedule_location_publications (id, workspace_id, location_id, week_start, version_number, status, published_by)
select tests.remember('hb:pub:' || x.l, gen_random_uuid()), tests.id('hb'), tests.id('hb:' || x.l),
  (now() at time zone loc.timezone)::date, 1, 'current', tests.user('hb:owner')
from unnest(array['K', 'B', 'C', 'D']) x(l) join public.locations loc on loc.id = tests.id('hb:' || x.l);
-- The rows go straight in: this test reads them; the save and publish path is
-- not its subject, and a hundred people's week through it would be the run.
set local session_replication_role = replica;
-- Everybody works six days of the seven at their first location, the manager too.
insert into public.schedule_published_shifts (workspace_id, location_id, publication_id, employee_id, job_id,
  scheduled_date, start_time, end_time, time_basis, time_timezone, source_shift_id)
select tests.id('hb'), a.location_id, tests.id('hb:pub:' || x.l), e.id, j.job_id,
  (now() at time zone loc.timezone)::date + d, time '09:00', time '17:00', 'explicit', loc.timezone, gen_random_uuid()
from public.employee_profiles e
join public.employee_location_assignments a on a.employee_id = e.id and a.ended_at is null and a.is_primary
join public.employee_job_assignments j on j.employee_id = e.id and j.ended_at is null and j.is_primary
join public.locations loc on loc.id = a.location_id
join (values ('K'), ('B'), ('C'), ('D')) x(l) on tests.id('hb:' || x.l) = a.location_id
cross join generate_series(0, 6) d
where e.workspace_id = tests.id('hb') and e.id <> tests.id('hb:owner')
  and d <> (abs(hashtext(e.id::text)) % 7);
-- Two open shifts a day at each location, one running past midnight.
insert into public.schedule_published_shifts (workspace_id, location_id, publication_id, employee_id, job_id,
  scheduled_date, start_time, end_time, time_basis, time_timezone, source_shift_id)
select tests.id('hb'), loc.id, tests.id('hb:pub:' || x.l), null, tests.id('hb:job:server'),
  (now() at time zone loc.timezone)::date + d, s.starts, s.ends, 'explicit', loc.timezone, gen_random_uuid()
from (values ('K'), ('B'), ('C'), ('D')) x(l)
join public.locations loc on loc.id = tests.id('hb:' || x.l)
cross join generate_series(0, 6) d
cross join (values (time '11:00', time '19:00'), (time '18:00', time '02:00')) s(starts, ends);
set local session_replication_role = origin;

-- A required food handler card that 24 of them, at every location, have not uploaded.
insert into public.document_types (id, workspace_id, title, description, required_at_onboarding, requires_review,
  accepted_formats, tracks_expiry, expiry_warning_days, expiry_schedule_impact, sort_order, created_by)
values (tests.remember('hb:doc:type', gen_random_uuid()), tests.id('hb'), 'Food handler card', 'Certificate',
  true, false, array['pdf'], false, 14, 'track_only', 90, tests.user('hb:owner'));
update public.document_types set publication_status = 'published' where id = tests.id('hb:doc:type');
insert into public.employee_onboarding_requirements (workspace_id, case_id, employee_id, kind, source_id, title,
  required, blocks_activation, requires_review, sort_order, status, lifecycle_settings)
select tests.id('hb'), c.id, c.employee_id, 'document', tests.id('hb:doc:type'), 'Food handler card',
  true, true, false, 90, 'not_started',
  '{"mode": "required", "target": {"operator": "and", "location_ids": [], "department_ids": [], "job_ids": [], "employee_ids": []},
    "assignment_scope": "future_onboarding", "period_days": null, "suspend_on_overdue": false, "extra_fields": []}'::jsonb
from public.employee_onboarding_cases c
where c.employee_id in (select tests.id('hb:p' || n) from generate_series(1, 96) n where n % 3 = 0 and n % 4 <> 0);

-- Thirty people ask for a day off in the weeks ahead. Days count from each location's
-- own today, not the server's: in Istanbul tomorrow starts at 21:00 UTC.
select public.submit_time_off_service(tests.user('hb:p' || n), tests.id('hb'),
  jsonb_build_array(jsonb_build_object('segment_date', (now() at time zone loc.timezone)::date + 10 + n % 14)), 'Probe', loc.timezone, gen_random_uuid())
from generate_series(1, 30) n
join public.employee_location_assignments a on a.employee_id = tests.id('hb:p' || n) and a.ended_at is null and a.is_primary
join public.locations loc on loc.id = a.location_id;
-- S-225: thirty more were off in the next two weeks, approved today: Updates and Coming up each read them.
create temp table hb_off as
select (public.submit_time_off_service(tests.user('hb:p' || n), tests.id('hb'),
  jsonb_build_array(jsonb_build_object('segment_date', (now() at time zone loc.timezone)::date + 1 + n % 13)), 'Probe', loc.timezone, gen_random_uuid()) ->> 'request_id')::uuid as id
from generate_series(31, 60) n
join public.employee_location_assignments a on a.employee_id = tests.id('hb:p' || n) and a.ended_at is null and a.is_primary
join public.locations loc on loc.id = a.location_id;
select public.decide_time_off_service(tests.user('hb:owner'), tests.id('hb'), hb_off.id, 'approve', '',
  app_private.time_off_impact(tests.id('hb'), hb_off.id) ->> 'fingerprint')
from hb_off;
select tests.settle();

-- The world is what the budget is about.
select is((select count(*)::integer from public.employee_profiles e where e.workspace_id = tests.id('hb') and e.archived_at is null),
  101, 'a hundred people and the owner');
select is((select count(*)::integer from public.schedule_time_off_requests r
  where r.workspace_id = tests.id('hb') and r.status = 'pending' and r.request_type = 'time_off'), 30,
  'thirty requests for time off wait on an answer');
select cmp_ok((select count(*)::integer from public.schedule_published_shifts s where s.workspace_id = tests.id('hb')), '>=', 550,
  'a published week of shifts at four locations');

create temp table hb_run (who text, n integer, ms numeric, home jsonb);
do $$
declare started timestamptz; home jsonb; reader text;
begin
  foreach reader in array array['owner', 'mC'] loop
    for i in 1..60 loop
      exit when i > 15 and exists (select 1 from hb_run r where r.who = reader and r.n > 3 and r.ms < 200);
      if i > 15 then perform pg_sleep(0.05); end if;
      started := clock_timestamp();
      home := public.get_manager_home_service(tests.user('hb:' || reader), tests.id('hb'));
      insert into hb_run values (reader, i, extract(epoch from clock_timestamp() - started) * 1000, home);
    end loop;
  end loop;
end $$;

select diag(format('%s: best warm read %s ms, median %s ms over %s reads', who, round(min(ms) filter (where n > 3), 1),
  round((percentile_cont(0.5) within group (order by ms) filter (where n > 3))::numeric, 1), count(*)))
from hb_run group by who order by who;

-- What was read is the whole Home, not an empty answer.
select is((select jsonb_array_length(home -> 'locations') from hb_run where who = 'owner' and n = 1), 4,
  'the owner reads four locations');
select is((select jsonb_array_length(home -> 'updates') from hb_run where who = 'owner' and n = 1), 30,
  'the owner reads thirty decided requests in Updates');
select cmp_ok((select count(*)::integer from hb_run, jsonb_array_elements(home -> 'coming_up') c where who = 'owner' and n = 1 and c ->> 'kind' = 'time_off'), '>=', 20,
  'and the approved time off in Coming up');
select is((select jsonb_array_length(home -> 'time_off') from hb_run where who = 'owner' and n = 1), 30,
  'the owner reads the thirty requests');
select is((select sum(jsonb_array_length(l -> 'missing_documents'))::integer from hb_run, jsonb_array_elements(home -> 'locations') l
  where who = 'owner' and n = 1),
  (select count(*)::integer from public.employee_location_assignments a, generate_series(1, 96) n
   where n % 3 = 0 and n % 4 <> 0 and a.employee_id = tests.id('hb:p' || n) and a.ended_at is null),
  'the owner reads everybody working without the card, at each location they work at');
select cmp_ok((select sum(jsonb_array_length(l -> 'today_shifts'))::integer from hb_run, jsonb_array_elements(home -> 'locations') l
  where who = 'owner' and n = 1), '>=', 60, 'today''s shifts are read at every location');
select is((select array_agg(l ->> 'name') from hb_run, jsonb_array_elements(home -> 'locations') l where who = 'mC' and n = 1),
  array['Castro'], 'the manager of Castro reads Castro');
select cmp_ok((select jsonb_array_length(home -> 'time_off') from hb_run where who = 'mC' and n = 1), '<', 30,
  'and only the requests she answers');
select cmp_ok((select jsonb_array_length(home -> 'time_off') from hb_run where who = 'mC' and n = 1), '>', 0,
  'of which there are some: Castro''s people asked too');

-- The budget (above).
select cmp_ok((select min(ms) from hb_run where who = 'owner' and n > 3), '<', 200::numeric,
  'the owner''s Home reads four locations and thirty requests within 200 ms');
select cmp_ok((select min(ms) from hb_run where who = 'mC' and n > 3), '<', 200::numeric,
  'a manager of one location reads her Home within 200 ms');

select * from finish();
rollback;
