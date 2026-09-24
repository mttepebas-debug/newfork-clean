begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

-- FOUNDATION-B 5.3: the Schedule grid reads a week with availability from the
-- weekly marks within 50 ms: 30 people at two locations, most with marks, some
-- with a manager's reminder, a published week of shifts. The best of five warm
-- reads counts, so a busy machine does not fail it by chance.

select tests.world('wb');
select tests.person('wb', 'p' || n, 'employee',
  case n % 3 when 0 then array['K', 'B'] when 1 then array['K'] else array['B'] end, array['cook'])
from generate_series(1, 30) n;

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
    'loc', case n % 3 when 2 then 'B' else 'K' end, 'job', 'cook', 'day', d, 'start', '09:00', 'end', '15:00'))
  from generate_series(1, 30) n cross join (values (1), (3)) days(d)
));

create temp table wb_run (n integer, ms numeric, marked integer);
do $$
declare started timestamptz; model jsonb;
begin
  for i in 1..7 loop
    started := clock_timestamp();
    model := public.get_schedule_read_model_service(tests.user('wb:owner'), tests.id('wb'), tests.week(1));
    insert into wb_run values (i, extract(epoch from clock_timestamp() - started) * 1000,
      (select count(*) from jsonb_array_elements(model -> 'employees') e, jsonb_array_elements(e -> 'weekly_availability') p
       where jsonb_array_length(p -> 'unavailable_intervals') > 0));
  end loop;
end $$;

select cmp_ok((select min(marked) from wb_run), '>=', 24, 'the grid draws the marked weeks');
select cmp_ok((select min(ms) from wb_run where n > 2), '<', 50::numeric, 'the grid reads a week with availability within 50 ms');

select * from finish();
rollback;
