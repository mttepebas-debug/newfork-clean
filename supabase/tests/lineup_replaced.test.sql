begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- LINEUP-EDIT L1 (KARARLAR S-178; Mert 2026-10-19): a lineup row can be replaced by another row of the same lineup
-- (the person put in his place); the day's read says by which, and a lineup counts only who is on it: a called
-- off or replaced person is not one of its People, nor of Read's "with the app". Nothing here writes for a
-- manager yet (LINEUP-EDIT L2); the rows are set as the fixture.

select tests.world('r');
select tests.world('rx');
select tests.person('r', 'mia', 'manager', array['K'], array['cook']);
select tests.person('r', 'eli', 'employee', array['K'], array['cook']);
select tests.person('r', 'ana', 'employee', array['K'], array['cook']);
select tests.person('r', 'zed', 'employee', array['K'], array['cook']);
select tests.person('rx', 'xan', 'manager', array['K'], array['cook']);

insert into public.shift_types (id, workspace_id, name, color, default_start_time, default_end_time)
values (tests.remember('r:type:lunch', gen_random_uuid()), tests.id('r'), 'Lunch', '#1F9D74', '09:00', '15:00'),
  (tests.remember('r:type:dinner', gen_random_uuid()), tests.id('r'), 'Dinner', '#5873AD', '16:00', '22:00');

select tests.publish_week('r', 0, jsonb_build_array(
  jsonb_build_object('label', 'eli-mon', 'person', 'eli', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '09:00', 'end', '15:00'),
  jsonb_build_object('label', 'ana-mon', 'person', 'ana', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '10:00', 'end', '15:00')
));
-- ponytail: the test editor has no shift type field; the published rows get theirs here.
update public.schedule_published_shifts set shift_type_id = tests.id('r:type:lunch')
where id in (tests.id('r:shift:eli-mon'), tests.id('r:shift:ana-mon'));

insert into public.daily_lineups (id, workspace_id, location_id, service_date, shift_type_id)
values (tests.remember('r:lineup:lunch', gen_random_uuid()), tests.id('r'), tests.id('r:K'), tests.week(0), tests.id('r:type:lunch')),
  (tests.remember('r:lineup:dinner', gen_random_uuid()), tests.id('r'), tests.id('r:K'), tests.week(0), tests.id('r:type:dinner'));
-- Zed is put on the lineup in Eli's place; Ana is called off.
insert into public.daily_lineup_rows (id, workspace_id, lineup_id, location_id, service_date, employee_id, job_id, starts, ends)
values (tests.remember('r:row:zed', gen_random_uuid()), tests.id('r'), tests.id('r:lineup:lunch'), tests.id('r:K'), tests.week(0),
  tests.id('r:zed'), tests.id('r:job:cook'), '09:00', '15:00');
insert into public.daily_lineup_rows (id, workspace_id, lineup_id, location_id, service_date, source_shift_id, replaced_by_row_id)
select tests.remember('r:row:eli', gen_random_uuid()), tests.id('r'), tests.id('r:lineup:lunch'), tests.id('r:K'), tests.week(0),
  p.source_shift_id, tests.id('r:row:zed')
from public.schedule_published_shifts p where p.id = tests.id('r:shift:eli-mon');
insert into public.daily_lineup_rows (workspace_id, lineup_id, location_id, service_date, source_shift_id, called_off_at, called_off_by)
select tests.id('r'), tests.id('r:lineup:lunch'), tests.id('r:K'), tests.week(0), p.source_shift_id, now(), tests.user('r:mia')
from public.schedule_published_shifts p where p.id = tests.id('r:shift:ana-mon');

create temporary table lunch as
select x as lineup from jsonb_array_elements(
  public.get_lineup_day_service(tests.user('r:mia'), tests.id('r'), tests.week(0)) -> 'locations') l,
  jsonb_array_elements(l -> 'lineups') x
where x ->> 'shift_type_id' = tests.id('r:type:lunch')::text;

-- 1. The read says who replaced whom; a row nobody replaced says null.
select is(
  (select r ->> 'replaced_by_row_id' from lunch, jsonb_array_elements(lineup -> 'rows') r
   where r ->> 'shift_id' = tests.id('r:shift:eli-mon')::text),
  tests.id('r:row:zed')::text, 'a replaced row names the row that replaced it'
);
select ok(
  (select bool_and(r ? 'replaced_by_row_id' and (r ->> 'replaced_by_row_id') is null)
   from lunch, jsonb_array_elements(lineup -> 'rows') r
   where r ->> 'shift_id' is distinct from tests.id('r:shift:eli-mon')::text),
  'every other row carries the field, empty'
);

-- 2. Only who is on the lineup counts: Eli (replaced) and Ana (called off) are not among its People.
select is(
  (select row((lineup ->> 'people')::integer, (lineup ->> 'with_app')::integer)::text from lunch),
  row(1, 1)::text, 'People and "with the app" count only who is on the lineup (Zed)'
);
select is(
  (select jsonb_array_length(lineup -> 'rows') from lunch),
  3, 'the replaced and the called off person are still read, for their own groups'
);

-- 3. What the table refuses: a row of another lineup, the row itself.
create function pg_temp.refused_by(statement text)
returns text
language plpgsql
as $$
declare
  state text;
  key text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate, key = constraint_name;
  return state || ' ' || coalesce(key, '');
end;
$$;
insert into public.daily_lineup_rows (id, workspace_id, lineup_id, location_id, service_date, employee_id, job_id, starts, ends)
values (tests.remember('r:row:dinner', gen_random_uuid()), tests.id('r'), tests.id('r:lineup:dinner'), tests.id('r:K'), tests.week(0),
  tests.id('r:zed'), tests.id('r:job:cook'), '16:00', '22:00');
select is(
  pg_temp.refused_by(format('update public.daily_lineup_rows set replaced_by_row_id = %L where id = %L',
    tests.id('r:row:dinner'), tests.id('r:row:eli'))),
  '23503 daily_lineup_rows_replaced_by_fkey', 'a row is replaced only by a row of its own lineup'
);
select is(
  pg_temp.refused_by(format('update public.daily_lineup_rows set replaced_by_row_id = id where id = %L', tests.id('r:row:eli'))),
  '23514 daily_lineup_rows_replaced_by_other', 'a row does not replace itself'
);
-- Another workspace's row: refused by the same key (the workspace is part of it).
insert into public.daily_lineups (id, workspace_id, location_id, service_date)
values (tests.remember('rx:lineup', gen_random_uuid()), tests.id('rx'), tests.id('rx:K'), tests.week(0));
insert into public.daily_lineup_rows (id, workspace_id, lineup_id, location_id, service_date, employee_id, job_id, starts, ends)
values (tests.remember('rx:row', gen_random_uuid()), tests.id('rx'), tests.id('rx:lineup'), tests.id('rx:K'), tests.week(0),
  tests.id('rx:xan'), tests.id('rx:job:cook'), '09:00', '15:00');
select is(
  pg_temp.refused_by(format('update public.daily_lineup_rows set replaced_by_row_id = %L where id = %L',
    tests.id('rx:row'), tests.id('r:row:eli'))),
  '23503 daily_lineup_rows_replaced_by_fkey', 'a row is never replaced by another workspace''s row'
);

-- 4. The row that replaced someone goes: the replaced one is just a row again, on the lineup.
delete from public.daily_lineup_rows where id = tests.id('r:row:zed');
select is(
  (select replaced_by_row_id from public.daily_lineup_rows where id = tests.id('r:row:eli')),
  null, 'when the replacing row goes, the link goes, the row stays'
);
select is(
  (select (x ->> 'people')::integer from jsonb_array_elements(
     public.get_lineup_day_service(tests.user('r:mia'), tests.id('r'), tests.week(0)) -> 'locations') l,
     jsonb_array_elements(l -> 'lineups') x
   where x ->> 'shift_type_id' = tests.id('r:type:lunch')::text),
  1, 'Eli counts again; Ana, called off, still does not'
);

select * from finish();
rollback;
