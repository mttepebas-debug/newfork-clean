begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- FOUNDATION-B 5.3: the Schedule grid reads a week with availability from the
-- weekly marks within 50 ms: 30 people at two locations, most with marks, some
-- with a manager's reminder, a published week of shifts. The best of five warm
-- reads counts, so a busy machine does not fail it by chance.
--
-- FB-6.1 .5 (T3): the people who work at both locations have their Wednesday
-- shift at Besiktas, so Mina, who manages Kadikoy only, reads them as ghosts.
-- Her read is measured too: the ghosts are asked of her grid, not the owner's.

select tests.world('wb');
select tests.person('wb', 'p' || n, 'employee',
  case n % 3 when 0 then array['K', 'B'] when 1 then array['K'] else array['B'] end, array['cook'])
from generate_series(1, 30) n;
select tests.person('wb', 'mina', 'manager', array['K'], array['cook']);

create function pg_temp.mark(preference jsonb, day integer, change jsonb) returns jsonb language sql as $$
  select jsonb_set(preference, array['days', day::text], (preference -> 'days' -> day) || change)
$$;
insert into public.employee_weekly_preferences (workspace_id, employee_id, preference, revision, updated_by)
select tests.id('wb'), tests.id('wb:p' || n),
  pg_temp.mark(pg_temp.mark(pg_temp.mark(public.empty_weekly_preference('time_range'),
    1, '{"range": {"start": "18:00", "end": "22:00"}}'), 3, '{"all_day": true}'), 0, '{"range": {"start": "06:00", "end": "08:00"}}'),
  1, tests.user('wb:p' || n)
from generate_series(1, 30) n where n % 5 <> 0;
insert into public.manager_weekly_reminders (workspace_id, employee_id, preference, enabled, revision, updated_by)
select tests.id('wb'), tests.id('wb:p' || n),
  pg_temp.mark(public.empty_weekly_preference('time_range'), 5, '{"range": {"start": "09:00", "end": "12:00"}}'),
  true, 1, tests.user('wb:owner')
from generate_series(1, 30) n where n % 2 = 0;

select tests.publish_week('wb', 1, (
  select jsonb_agg(jsonb_build_object('label', 'p' || n || '-' || d, 'person', 'p' || n,
    'loc', case when n % 3 = 2 or (n % 3 = 0 and d = 3) then 'B' else 'K' end, 'job', 'cook', 'day', d, 'start', '09:00', 'end', '15:00'))
  from generate_series(1, 30) n cross join (values (1), (3)) days(d)
));

create temp table wb_run (who text, n integer, ms numeric, marked integer, model jsonb);
do $$
declare started timestamptz; model jsonb; who text;
begin
  foreach who in array array['owner', 'mina'] loop
    for i in 1..7 loop
      started := clock_timestamp();
      model := public.get_schedule_read_model_service(tests.user('wb:' || who), tests.id('wb'), tests.week(1));
      insert into wb_run values (who, i, extract(epoch from clock_timestamp() - started) * 1000,
        (select count(*) from jsonb_array_elements(model -> 'employees') e, jsonb_array_elements(e -> 'weekly_availability') p
         where jsonb_array_length(p -> 'unavailable_intervals') > 0), model);
    end loop;
  end loop;
end $$;
create temp table mina_model as select model from wb_run where who = 'mina' and n = 1;

select cmp_ok((select min(marked) from wb_run where who = 'owner'), '>=', 24, 'the grid draws the marked weeks');
select cmp_ok((select min(ms) from wb_run where who = 'owner' and n > 2), '<', 50::numeric,
  'the grid reads a week with availability within 50 ms');
select cmp_ok((select min(ms) from wb_run where who = 'mina' and n > 2), '<', 50::numeric,
  'a manager of one location reads the week with its ghosts within 50 ms');

select is((select array(select l ->> 'id' from jsonb_array_elements(model -> 'locations') l) from mina_model),
  array[tests.id('wb:K')::text], 'Mina''s grid has Kadikoy only: Besiktas gets no row');
select is((select count(*)::integer from mina_model, jsonb_array_elements(model -> 'shifts') s
  where (s ->> 'location_id')::uuid <> tests.id('wb:K')), 0, 'no Besiktas shift reaches Mina as a shift');
select is(
  (select array_agg(g ->> 'employee_id' order by g ->> 'employee_id') from mina_model, jsonb_array_elements(model -> 'ghost_shifts') g
   where (g ->> 'location_id')::uuid = tests.id('wb:B') and g ->> 'location_name' = (select name from public.locations where id = tests.id('wb:B'))
     and g ->> 'start_time' = '09:00' and g ->> 'end_time' = '15:00' and (g ->> 'scheduled_date')::date = tests.week(1) + 3),
  (select array_agg(tests.id('wb:p' || n)::text order by tests.id('wb:p' || n)::text) from generate_series(1, 30) n where n % 3 = 0),
  'Mina sees each Wednesday Besiktas shift of the people who work at both locations as a ghost');
select is(
  (select array(select distinct k from mina_model, jsonb_array_elements(model -> 'ghost_shifts') g, jsonb_object_keys(g) k order by 1)),
  array['crosses_midnight', 'employee_id', 'end_time', 'id', 'location_id', 'location_name', 'scheduled_date', 'start_time'],
  'a ghost says where and when only');
select is((select model -> 'ghost_shifts' from wb_run where who = 'owner' and n = 1), '[]'::jsonb,
  'the owner reaches every location, so nothing is a ghost');

select * from finish();
rollback;
