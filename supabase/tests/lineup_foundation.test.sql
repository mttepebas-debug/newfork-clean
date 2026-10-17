begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- Lineup, stage 1 (Line-up PLAN §5, §6, §7; KARARLAR "Lineup"): the tables a
-- lineup keeps beside the Schedule and the day's read. A lineup is the day's
-- live Schedule per location and shift type; what the manager changes there
-- (section, order, call off, hours, notes) stays in the lineup and never
-- changes the Schedule. Reading asks the core with lineup.read (the
-- schedule.read permission, by location); nobody reads the tables directly.

select tests.world('l');
select tests.world('lx');
select tests.person('l', 'mia', 'manager', array['K'], array['cook']);
select tests.person('l', 'eli', 'employee', array['K'], array['cook']);
select tests.person('l', 'bo', 'employee', array['B'], array['server']);
select tests.person('lx', 'xan', 'manager', array['K'], array['cook']);

insert into public.shift_types (id, workspace_id, name, color, default_start_time, default_end_time)
values (tests.remember('l:type:lunch', gen_random_uuid()), tests.id('l'), 'Lunch', '#1F9D74', '09:00', '15:00');

select tests.publish_week('l', 0, jsonb_build_array(
  jsonb_build_object('label', 'eli-mon', 'person', 'eli', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '09:00', 'end', '15:00'),
  jsonb_build_object('label', 'open-mon', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '10:00', 'end', '15:00'),
  jsonb_build_object('label', 'bo-mon', 'person', 'bo', 'loc', 'B', 'job', 'server', 'day', 0, 'start', '16:00', 'end', '22:00')
));
-- ponytail: the test editor has no shift type field; the published rows get theirs here.
update public.schedule_published_shifts set shift_type_id = tests.id('l:type:lunch')
where id in (tests.id('l:shift:eli-mon'), tests.id('l:shift:open-mon'));

create temporary table day_read as
select public.get_lineup_day_service(tests.user('l:owner'), tests.id('l'), tests.week(0)) as body;

-- 1. The tables: row level security on, nothing granted to the browser.
select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
   where c.oid = any (array['public.location_sections', 'public.daily_lineups', 'public.daily_lineup_rows',
     'public.daily_lineup_versions', 'public.daily_lineup_acknowledgements']::regclass[])),
  'every lineup table has row level security'
);
select is(
  (select count(*)::integer from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated')
     and g.table_name in ('location_sections', 'daily_lineups', 'daily_lineup_rows', 'daily_lineup_versions',
       'daily_lineup_acknowledgements')),
  0, 'the browser holds no right on a lineup table'
);
select is(
  (select row(a.scope_class, a.effect, a.permission_key)::text from app_private.authz_actions a where a.key = 'lineup.read'),
  row('place', 'read', 'schedule.read')::text,
  'lineup.read is a place read behind the schedule.read permission'
);

-- 2. The owner reads both locations; the day's shifts by shift type.
select is(
  (select array_agg(l ->> 'name' order by l ->> 'name') from day_read, jsonb_array_elements(body -> 'locations') l),
  array['Besiktas', 'Kadikoy'], 'the owner reads every location'
);
select is(
  (select jsonb_agg(x ->> 'shift_type_name' order by x ->> 'shift_type_name')
   from day_read, jsonb_array_elements(body -> 'locations') l, jsonb_array_elements(l -> 'lineups') x
   where l ->> 'id' = tests.id('l:K')::text),
  '["Lunch"]'::jsonb, 'Kadikoy has the Lunch lineup'
);
select is(
  (select jsonb_agg(r ->> 'name' order by r ->> 'start_time', r ->> 'name')
   from day_read, jsonb_array_elements(body -> 'locations') l, jsonb_array_elements(l -> 'lineups') x,
     jsonb_array_elements(x -> 'rows') r
   where l ->> 'id' = tests.id('l:K')::text),
  (select jsonb_build_array(e.first_name || ' ' || e.last_name, null) from public.employee_profiles e where e.id = tests.id('l:eli')),
  'the Lunch lineup has Eli and the open shift, by start'
);
select is(
  (select x ->> 'shift_type_id' from day_read, jsonb_array_elements(body -> 'locations') l, jsonb_array_elements(l -> 'lineups') x
   where l ->> 'id' = tests.id('l:B')::text),
  null, 'a shift with no shift type is in the location''s other shifts lineup'
);
select is(
  (select x ->> 'status' from day_read, jsonb_array_elements(body -> 'locations') l, jsonb_array_elements(l -> 'lineups') x
   where l ->> 'id' = tests.id('l:K')::text),
  'draft', 'a lineup nobody shared is a draft'
);
select ok(
  (select bool_and((r -> 'lineup_only')::boolean = false and r ->> 'section_id' is null and r ->> 'called_off_at' is null)
   from day_read, jsonb_array_elements(body -> 'locations') l, jsonb_array_elements(l -> 'lineups') x,
     jsonb_array_elements(x -> 'rows') r),
  'with nothing changed, every row is the Schedule as it is'
);
select is(
  (select r ->> 'start_time' from day_read, jsonb_array_elements(body -> 'locations') l, jsonb_array_elements(l -> 'lineups') x,
     jsonb_array_elements(x -> 'rows') r
   where r ->> 'shift_id' = tests.id('l:shift:eli-mon')::text),
  '09:00', 'times are HH:MM'
);

-- 3. Who may read: the manager only her location; nobody else. The refusal names the core's reason.
create function pg_temp.refusal(statement text)
returns text
language plpgsql
as $$
declare
  state text;
  why text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate, why = pg_exception_hint;
  return state || ':' || coalesce(why, '');
end;
$$;
select is(
  (select array_agg(l ->> 'name') from jsonb_array_elements(
     public.get_lineup_day_service(tests.user('l:mia'), tests.id('l'), tests.week(0)) -> 'locations') l),
  array['Kadikoy'], 'a manager reads only the locations she manages'
);
select throws_ok(
  format('select public.get_lineup_day_service(%L, %L, %L, array[%L]::uuid[])',
    tests.user('l:mia'), tests.id('l'), tests.week(0), tests.id('l:B')),
  '42501', null, 'a manager asking for a location she does not manage is refused'
);
select throws_ok(
  format('select public.get_lineup_day_service(%L, %L, %L)', tests.user('l:eli'), tests.id('l'), tests.week(0)),
  '42501', null, 'an employee does not read the managers'' lineup'
);
select throws_ok(
  format('select public.get_lineup_day_service(%L, %L, %L)', tests.user('lx:xan'), tests.id('l'), tests.week(0)),
  '42501', null, 'a manager of another workspace is refused'
);
select throws_ok(
  format('select public.get_lineup_day_service(%L, %L, %L, array[%L]::uuid[])',
    tests.user('l:owner'), tests.id('l'), tests.week(0), gen_random_uuid()),
  '42501', null, 'an unknown location is refused like one out of reach'
);
select is(
  pg_temp.refusal(format('select public.get_lineup_day_service(%L, %L, %L, array[%L]::uuid[])',
    tests.user('l:mia'), tests.id('l'), tests.week(0), gen_random_uuid())),
  pg_temp.refusal(format('select public.get_lineup_day_service(%L, %L, %L, array[%L]::uuid[])',
    tests.user('l:mia'), tests.id('l'), tests.week(0), tests.id('l:B'))),
  'an unknown location and one out of reach get the very same answer'
);
select is(
  pg_temp.refusal(format('select public.get_lineup_day_service(%L, %L, %L, array[%L]::uuid[])',
    tests.user('l:mia'), tests.id('l'), tests.week(0), tests.id('l:B'))),
  '42501:authz.out_of_scope', 'out of reach says authz.out_of_scope'
);
select is(
  pg_temp.refusal(format('select public.get_lineup_day_service(%L, %L, %L)', tests.user('lx:xan'), tests.id('l'), tests.week(0))),
  '42501:authz.not_member', 'another workspace''s manager is not a member here'
);
select is(
  pg_temp.refusal(format('select public.get_lineup_day_service(%L, %L, %L)', tests.user('l:eli'), tests.id('l'), tests.week(0))),
  '42501:authz.' || app_private.authz_reason(tests.user('l:eli'), tests.id('l'), 'lineup.read'),
  'an employee''s refusal is the core''s own reason'
);

-- 4. What the lineup keeps: a section, an order, a call off, the hours, a person only in the lineup.
insert into public.location_sections (id, workspace_id, location_id, name, sort_order)
values (tests.remember('l:section:patio', gen_random_uuid()), tests.id('l'), tests.id('l:K'), 'Patio', 1);
insert into public.daily_lineups (id, workspace_id, location_id, service_date, shift_type_id, specials, n86, shift_notes)
values (tests.remember('l:lineup:lunch', gen_random_uuid()), tests.id('l'), tests.id('l:K'), tests.week(0),
  tests.id('l:type:lunch'), 'Halibut, $34', 'Burrata', 'Private party at 1 PM');
insert into public.daily_lineup_rows (workspace_id, lineup_id, location_id, service_date, source_shift_id, section_id, sort_order,
  starts, ends, called_off_at, called_off_by)
select tests.id('l'), tests.id('l:lineup:lunch'), tests.id('l:K'), tests.week(0), p.source_shift_id, tests.id('l:section:patio'), 1,
  '09:30', '15:00', null, null
from public.schedule_published_shifts p where p.id = tests.id('l:shift:eli-mon');
insert into public.daily_lineup_rows (workspace_id, lineup_id, location_id, service_date, source_shift_id, called_off_at, called_off_by)
select tests.id('l'), tests.id('l:lineup:lunch'), tests.id('l:K'), tests.week(0), p.source_shift_id, now(), tests.user('l:mia')
from public.schedule_published_shifts p where p.id = tests.id('l:shift:open-mon');
insert into public.daily_lineup_rows (workspace_id, lineup_id, location_id, service_date, employee_id, job_id, starts, ends, sort_order)
values (tests.id('l'), tests.id('l:lineup:lunch'), tests.id('l:K'), tests.week(0), tests.id('l:mia'), tests.id('l:job:cook'), '11:00', '15:00', 2);

create temporary table kept as
select x as lineup from jsonb_array_elements(
  public.get_lineup_day_service(tests.user('l:mia'), tests.id('l'), tests.week(0)) -> 'locations') l,
  jsonb_array_elements(l -> 'lineups') x;

select is(
  (select lineup -> 'notes' from kept),
  '{"specials": "Halibut, $34", "n86": "Burrata", "shift_notes": "Private party at 1 PM"}'::jsonb,
  'the lineup''s notes are read with it'
);
select is(
  (select r ->> 'section_name' from kept, jsonb_array_elements(lineup -> 'rows') r
   where r ->> 'shift_id' = tests.id('l:shift:eli-mon')::text),
  'Patio', 'a row''s section'
);
select is(
  (select row(r ->> 'start_time', r ->> 'schedule_start_time', r -> 'changed')::text
   from kept, jsonb_array_elements(lineup -> 'rows') r
   where r ->> 'shift_id' = tests.id('l:shift:eli-mon')::text),
  row('09:30', '09:00', '["start_time"]'::jsonb)::text,
  'hours changed in the lineup show next to the Schedule''s, and say what changed'
);
select is(
  (select (r ->> 'called_off_at') is not null from kept, jsonb_array_elements(lineup -> 'rows') r
   where r ->> 'shift_id' = tests.id('l:shift:open-mon')::text),
  true, 'a call off is the lineup''s, the shift stays'
);
select is(
  (select count(*)::integer from public.schedule_published_shifts p where p.id = tests.id('l:shift:open-mon')),
  1, 'the Schedule still has the called off shift'
);
select is(
  (select row(r -> 'lineup_only', r ->> 'employee_id', r ->> 'shift_id')::text
   from kept, jsonb_array_elements(lineup -> 'rows') r where (r -> 'lineup_only')::boolean),
  row('true'::jsonb, tests.id('l:mia')::text, null::text)::text,
  'a person added in the lineup only has no shift behind her'
);
select is(
  (select jsonb_agg(r ->> 'sort_order' order by (r ->> 'sort_order')::integer nulls last) from kept, jsonb_array_elements(lineup -> 'rows') r),
  '["1", "2", null]'::jsonb, 'rows keep the order the lineup gave them'
);
select is(
  (select jsonb_agg(s ->> 'name') from jsonb_array_elements(
     public.get_lineup_day_service(tests.user('l:mia'), tests.id('l'), tests.week(0)) -> 'sections') s),
  '["Patio"]'::jsonb, 'the location''s sections come with the day'
);

-- 5. Shared: a version, acknowledgements.
insert into public.daily_lineup_versions (id, workspace_id, lineup_id, version, shared_by, ask_ack, snapshot)
values (tests.remember('l:version:1', gen_random_uuid()), tests.id('l'), tests.id('l:lineup:lunch'), 1,
  tests.user('l:mia'), true, '{}'::jsonb);
update public.daily_lineups set latest_version = 1 where id = tests.id('l:lineup:lunch');
insert into public.daily_lineup_acknowledgements (workspace_id, version_id, employee_id)
values (tests.id('l'), tests.id('l:version:1'), tests.id('l:eli'));
select is(
  (select row(x ->> 'status', x ->> 'version', x -> 'acknowledged')::text from jsonb_array_elements(
     public.get_lineup_day_service(tests.user('l:mia'), tests.id('l'), tests.week(0)) -> 'locations') l,
     jsonb_array_elements(l -> 'lineups') x),
  row('shared', '1', '1'::jsonb)::text, 'a shared lineup says its version and how many acknowledged'
);

-- 6. A shift the Schedule moves to another day leaves the old day's lineup changes behind: the new
-- day shows it as the Schedule has it, and that day's lineup may change it again.
update public.schedule_published_shifts set scheduled_date = tests.week(0) + 1 where id = tests.id('l:shift:eli-mon');
select is(
  (select row(x ->> 'shift_type_name', r ->> 'section_id', r ->> 'start_time', r -> 'changed')::text
   from jsonb_array_elements(public.get_lineup_day_service(tests.user('l:mia'), tests.id('l'), tests.week(0) + 1) -> 'locations') l,
     jsonb_array_elements(l -> 'lineups') x, jsonb_array_elements(x -> 'rows') r
   where r ->> 'shift_id' = tests.id('l:shift:eli-mon')::text),
  row('Lunch', null::text, '09:00', '[]'::jsonb)::text,
  'a shift moved to another day comes without the old day''s lineup changes'
);
insert into public.daily_lineups (id, workspace_id, location_id, service_date, shift_type_id)
values (tests.remember('l:lineup:tue', gen_random_uuid()), tests.id('l'), tests.id('l:K'), tests.week(0) + 1, tests.id('l:type:lunch'));
select lives_ok(
  format($$insert into public.daily_lineup_rows (workspace_id, lineup_id, location_id, service_date, source_shift_id, sort_order)
           select %L, %L, %L, %L, p.source_shift_id, 1 from public.schedule_published_shifts p where p.id = %L$$,
    tests.id('l'), tests.id('l:lineup:tue'), tests.id('l:K'), tests.week(0) + 1, tests.id('l:shift:eli-mon')),
  'the new day''s lineup may change the moved shift although the old day''s row is still there'
);

-- 7. A closed day: the location has no lineup, only what closed it.
select tests.closed_day(tests.id('l'), array[tests.id('l:B')], tests.week(0), tests.week(0), tests.user('l:owner'),
  null, 'Kitchen deep clean');
select is(
  (select row(l -> 'closed' ->> 'title', jsonb_array_length(l -> 'lineups'))::text from jsonb_array_elements(
     public.get_lineup_day_service(tests.user('l:owner'), tests.id('l'), tests.week(0)) -> 'locations') l
   where l ->> 'id' = tests.id('l:B')::text),
  row('Kitchen deep clean', 0)::text, 'a closed day shows what closed it and no lineup'
);

-- 8. What the tables refuse.
select throws_ok(
  format($$insert into public.daily_lineups (workspace_id, location_id, service_date, shift_type_id) values (%L, %L, %L, %L)$$,
    tests.id('l'), tests.id('l:K'), tests.week(0), tests.id('l:type:lunch')),
  '23505', null, 'one lineup per location, day and shift type'
);
select throws_ok(
  format($$insert into public.daily_lineups (workspace_id, location_id, service_date) values (%L, %L, %L)$$,
    tests.id('l'), tests.id('lx:K'), tests.week(0)),
  '23503', null, 'a lineup cannot point at another workspace''s location'
);
select throws_ok(
  format($$insert into public.daily_lineup_rows (workspace_id, lineup_id, location_id, service_date, job_id, starts, ends)
           values (%L, %L, %L, %L, %L, '11:00', '15:00')$$,
    tests.id('l'), tests.id('l:lineup:lunch'), tests.id('l:K'), tests.week(0), tests.id('l:job:cook')),
  '23514', null, 'a row is a Schedule shift or a person added in the lineup, not neither'
);
select throws_ok(
  format($$insert into public.daily_lineup_rows (workspace_id, lineup_id, location_id, service_date, source_shift_id, section_id)
           values (%L, %L, %L, %L, %L, %L)$$,
    tests.id('l'), tests.id('l:lineup:lunch'), tests.id('l:B'), tests.week(0), gen_random_uuid(), tests.id('l:section:patio')),
  '23503', null, 'a row stays at its lineup''s location and takes only that location''s sections'
);
select throws_ok(
  format($$insert into public.location_sections (workspace_id, location_id, name) values (%L, %L, 'patio')$$,
    tests.id('l'), tests.id('l:K')),
  '23505', null, 'a location has one section of a name'
);
select throws_ok(
  format($$insert into public.daily_lineup_rows (workspace_id, lineup_id, location_id, service_date, source_shift_id, called_off_at)
           values (%L, %L, %L, %L, %L, now())$$,
    tests.id('l'), tests.id('l:lineup:lunch'), tests.id('l:K'), tests.week(0), gen_random_uuid()),
  '23514', null, 'a call off says who called it off'
);

-- 9. The read stays inside the Schedule grid's budget (50 ms on the fixture), measured as the best of five.
create function pg_temp.best_read_ms(actor uuid, workspace uuid, on_day date)
returns numeric
language plpgsql
as $$
declare
  started timestamptz;
  best numeric := 1e9;
begin
  for i in 1..5 loop
    started := clock_timestamp();
    perform public.get_lineup_day_service(actor, workspace, on_day);
    best := least(best, extract(epoch from clock_timestamp() - started) * 1000);
  end loop;
  return best;
end;
$$;
select cmp_ok(
  pg_temp.best_read_ms(tests.user('l:owner'), tests.id('l'), tests.week(0)),
  '<', 50::numeric, 'the day''s read takes under 50 ms'
);

select * from finish();
rollback;
