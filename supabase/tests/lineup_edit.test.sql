begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- LINEUP-EDIT L2a (KARARLAR S-178 and its addenda; Mert 2026-10-19): a manager changes a lineup's row (position,
-- label, In and Out, section) and its notes, in the lineup only: the Schedule never changes. Only a draft that
-- has not started changes: a published lineup is taken back with Edit first; a started shift and a day that is
-- over are locked, on the server (BL-1148). "Started" is the web's rule (lineupCardState): the day is over, or
-- today the first person on it is in. And the four findings of L1's review: Read's count, who may acknowledge,
-- the employee's read, and a Replaced loop.

select tests.world('e');
select tests.world('ex');
select tests.person('e', 'mia', 'manager', array['K'], array['cook']);
select tests.person('e', 'bo', 'manager', array['B'], array['cook']);
select tests.person('e', 'eli', 'employee', array['K'], array['cook']);
select tests.person('e', 'ana', 'employee', array['K'], array['cook']);
select tests.person('e', 'zed', 'employee', array['K'], array['cook']);
select tests.person('ex', 'xan', 'manager', array['K'], array['cook']);

insert into public.shift_types (id, workspace_id, name, color, default_start_time, default_end_time)
values (tests.remember('e:type:lunch', gen_random_uuid()), tests.id('e'), 'Lunch', '#1F9D74', '09:00', '15:00');
insert into public.shift_labels (id, workspace_id, name)
values (tests.remember('e:label:lead', gen_random_uuid()), tests.id('e'), 'Lead');
insert into public.location_sections (id, workspace_id, location_id, name, sort_order)
values (tests.remember('e:section:patio', gen_random_uuid()), tests.id('e'), tests.id('e:K'), 'Patio', 1),
  (tests.remember('e:section:bar', gen_random_uuid()), tests.id('e'), tests.id('e:B'), 'Bar', 1);

select tests.publish_week('e', 0, jsonb_build_array(
  jsonb_build_object('label', 'eli-mon', 'person', 'eli', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '09:00', 'end', '15:00'),
  jsonb_build_object('label', 'ana-mon', 'person', 'ana', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '10:00', 'end', '15:00'),
  -- An open shift before anyone: nobody's, it starts nothing (the web reads people only).
  jsonb_build_object('label', 'open-mon', 'loc', 'K', 'job', 'cook', 'day', 0, 'start', '08:00', 'end', '15:00')
));
-- ponytail: the test editor has no shift type field; the published rows get theirs here.
update public.schedule_published_shifts set shift_type_id = tests.id('e:type:lunch')
where id in (tests.id('e:shift:eli-mon'), tests.id('e:shift:ana-mon'), tests.id('e:shift:open-mon'));

create temporary table fixture (key text primary key, value uuid);
insert into fixture values
  ('ws', tests.id('e')), ('K', tests.id('e:K')), ('B', tests.id('e:B')), ('type', tests.id('e:type:lunch')),
  ('owner', tests.user('e:owner')), ('mia', tests.user('e:mia')), ('bo', tests.user('e:bo')), ('eli', tests.user('e:eli')),
  ('ana', tests.user('e:ana')), ('xan', tests.user('ex:xan')),
  ('eli_source', (select source_shift_id from public.schedule_published_shifts where id = tests.id('e:shift:eli-mon'))),
  ('ana_source', (select source_shift_id from public.schedule_published_shifts where id = tests.id('e:shift:ana-mon')));

-- An edit as the API sends it: one row of the Lunch lineup at Kadikoy, Monday.
create function pg_temp.edit(actor uuid, body jsonb, command uuid default gen_random_uuid())
returns jsonb
language sql
as $$
  select public.lineup_edit_service(actor, tests.id('e'), command,
    jsonb_build_object('location_id', tests.id('e:K'), 'service_date', tests.week(0), 'shift_type_id', tests.id('e:type:lunch')) || body)
$$;
create function pg_temp.lunch_row(source uuid)
returns jsonb
language sql
as $$
  select r from jsonb_array_elements(
      public.get_lineup_day_service(tests.user('e:owner'), tests.id('e'), tests.week(0)) -> 'locations') l,
    jsonb_array_elements(l -> 'lineups') x, jsonb_array_elements(x -> 'rows') r
  where r ->> 'source_shift_id' = source::text
$$;
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

-- 1. "Started", the web's rule, on the location's clock.
select is(
  app_private.lineup_started(tests.id('e'), tests.id('e:K'), tests.week(0), tests.id('e:type:lunch'),
    (tests.week(0) + time '08:59') at time zone (select timezone from public.locations where id = tests.id('e:K'))),
  false, 'a minute before the first person is in, the lineup has not started (the 8:00 open shift is nobody''s)'
);
select is(
  app_private.lineup_started(tests.id('e'), tests.id('e:K'), tests.week(0), tests.id('e:type:lunch'),
    (tests.week(0) + time '09:00') at time zone (select timezone from public.locations where id = tests.id('e:K'))),
  true, 'when the first person is in, it has started'
);
select is(
  app_private.lineup_started(tests.id('e'), tests.id('e:K'), tests.week(0), tests.id('e:type:lunch'),
    (tests.week(0) - 1 + time '23:00') at time zone (select timezone from public.locations where id = tests.id('e:K'))),
  false, 'the day before, it has not started'
);
select is(
  app_private.lineup_started(tests.id('e'), tests.id('e:K'), tests.week(0), tests.id('e:type:lunch'),
    (tests.week(0) + 1 + time '00:01') at time zone (select timezone from public.locations where id = tests.id('e:K'))),
  true, 'once the day is over, it has started'
);
select ok(
  (select p.prosrc ~ 'app_private\.lineup_started\(' from pg_proc p where p.oid = 'public.lineup_edit_service(uuid, uuid, uuid, jsonb)'::regprocedure),
  'the edit service locks with the same rule (one place)'
);

-- 2. A row's hours, position, label and section change in the lineup only.
select lives_ok(
  format($$select pg_temp.edit(%L, jsonb_build_object('action', 'set_row', 'row',
    jsonb_build_object('source_shift_id', %L, 'starts', '09:30', 'ends', '15:00')))$$,
    tests.user('e:mia'), (select value from fixture where key = 'eli_source')),
  'the location''s manager changes a person''s In'
);
select is(
  (select row(r ->> 'start_time', r ->> 'schedule_start_time', r -> 'changed')::text from pg_temp.lunch_row((select value from fixture where key = 'eli_source')) r),
  row('09:30', '09:00', '["start_time"]'::jsonb)::text,
  'the day reads the new In next to the Schedule''s, and says what changed'
);
select is(
  (select to_char(start_time, 'HH24:MI') from public.schedule_published_shifts where id = tests.id('e:shift:eli-mon')),
  '09:00', 'the Schedule keeps its In'
);
select is(
  (select count(*)::integer from public.daily_lineups where workspace_id = tests.id('e') and service_date = tests.week(0)),
  1, 'the first edit opens the lineup, a draft'
);
select lives_ok(
  format($$select pg_temp.edit(%L, jsonb_build_object('action', 'set_row', 'row',
    jsonb_build_object('source_shift_id', %L, 'label_ids', jsonb_build_array(%L), 'section_id', %L)))$$,
    tests.user('e:mia'), (select value from fixture where key = 'eli_source'), tests.id('e:label:lead'), tests.id('e:section:patio')),
  'a label and a section'
);
select is(
  (select row(r -> 'label_names', r ->> 'section_name', r ->> 'start_time')::text from pg_temp.lunch_row((select value from fixture where key = 'eli_source')) r),
  row('["Lead"]'::jsonb, 'Patio', '09:30')::text,
  'the label and section show, and the earlier change stays: only the fields sent change'
);
select lives_ok(
  format($$select pg_temp.edit(%L, jsonb_build_object('action', 'set_row', 'row',
    jsonb_build_object('source_shift_id', %L, 'starts', null, 'ends', null)))$$,
    tests.user('e:mia'), (select value from fixture where key = 'eli_source')),
  'In and Out back to the Schedule''s'
);
select is(
  (select row(r ->> 'start_time', r -> 'changed')::text from pg_temp.lunch_row((select value from fixture where key = 'eli_source')) r),
  row('09:00', '["labels"]'::jsonb)::text, 'the Schedule''s hours again; the label still says it changed'
);

-- 3. What a row refuses: another location's section, a time that isn't one, In equal to Out, a stranger row.
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'set_row', 'row',
    jsonb_build_object('source_shift_id', %L, 'section_id', %L)))$$,
    tests.user('e:mia'), (select value from fixture where key = 'eli_source'), tests.id('e:section:bar'))),
  '22023:lineup.invalid_section', 'a section of another location is refused'
);
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'set_row', 'row',
    jsonb_build_object('source_shift_id', %L, 'starts', '9:3x', 'ends', '15:00')))$$,
    tests.user('e:mia'), (select value from fixture where key = 'eli_source'))),
  '22023:lineup.invalid_hours', 'a time that isn''t one is refused'
);
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'set_row', 'row',
    jsonb_build_object('source_shift_id', %L, 'starts', '15:00', 'ends', '15:00')))$$,
    tests.user('e:mia'), (select value from fixture where key = 'eli_source'))),
  '22023:lineup.invalid_hours', 'In equal to Out is refused'
);
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'set_row', 'row',
    jsonb_build_object('source_shift_id', %L, 'starts', '10:00', 'ends', '15:00')))$$,
    tests.user('e:mia'), gen_random_uuid())),
  '42501:authz.out_of_scope', 'a row that is not on this lineup is out of reach'
);

-- Positions and labels: this workspace's and in use only (another workspace's, or archived, are refused).
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'set_row', 'row',
    jsonb_build_object('source_shift_id', %L, 'job_id', %L)))$$,
    tests.user('e:mia'), (select value from fixture where key = 'eli_source'), tests.id('ex:job:cook'))),
  '22023:lineup.invalid_job', 'another workspace''s position is refused'
);
update public.jobs set archived_at = now() where id = tests.id('e:job:server');
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'set_row', 'row',
    jsonb_build_object('source_shift_id', %L, 'job_id', %L)))$$,
    tests.user('e:mia'), (select value from fixture where key = 'eli_source'), tests.id('e:job:server'))),
  '22023:lineup.invalid_job', 'an archived position is refused'
);
insert into public.shift_labels (id, workspace_id, name)
values (tests.remember('ex:label:lead', gen_random_uuid()), tests.id('ex'), 'Lead'),
  (tests.remember('e:label:old', gen_random_uuid()), tests.id('e'), 'Old');
update public.shift_labels set archived_at = now() where id = tests.id('e:label:old');
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'set_row', 'row',
    jsonb_build_object('source_shift_id', %L, 'label_ids', jsonb_build_array(%L))))$$,
    tests.user('e:mia'), (select value from fixture where key = 'eli_source'), tests.id('ex:label:lead'))),
  '22023:lineup.invalid_label', 'another workspace''s label is refused'
);
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'set_row', 'row',
    jsonb_build_object('source_shift_id', %L, 'label_ids', jsonb_build_array(%L))))$$,
    tests.user('e:mia'), (select value from fixture where key = 'eli_source'), tests.id('e:label:old'))),
  '22023:lineup.invalid_label', 'an archived label is refused'
);

-- 4. Notes.
select lives_ok(
  format($$select pg_temp.edit(%L, jsonb_build_object('action', 'set_notes', 'notes',
    jsonb_build_object('specials', 'Halibut, $34', 'n86', 'Burrata', 'shift_notes', 'Party of 22 at 1 PM')))$$, tests.user('e:mia')),
  'the notes are written'
);
select is(
  (select x -> 'notes' from jsonb_array_elements(
     public.get_lineup_day_service(tests.user('e:owner'), tests.id('e'), tests.week(0)) -> 'locations') l,
     jsonb_array_elements(l -> 'lineups') x where l ->> 'id' = tests.id('e:K')::text),
  '{"specials": "Halibut, $34", "n86": "Burrata", "shift_notes": "Party of 22 at 1 PM"}'::jsonb, 'and read with the day'
);
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'set_notes', 'notes',
    jsonb_build_object('specials', repeat('x', 501))))$$, tests.user('e:mia'))),
  '22023:lineup.note_too_long', 'a note over its length is refused'
);

-- 5. The same command again answers the same; the id with another payload is refused.
create temporary table once (command uuid);
insert into once values (gen_random_uuid());
select is(
  pg_temp.edit(tests.user('e:mia'), jsonb_build_object('action', 'set_notes', 'notes', jsonb_build_object('n86', 'Oysters')),
    (select command from once)),
  pg_temp.edit(tests.user('e:mia'), jsonb_build_object('action', 'set_notes', 'notes', jsonb_build_object('n86', 'Oysters')),
    (select command from once)),
  'a command sent again gets the same answer'
);
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'set_notes', 'notes',
    jsonb_build_object('n86', 'Mussels')), %L)$$, tests.user('e:mia'), (select command from once))),
  '22023:lineup.command_reused', 'the same id for another edit is refused'
);

-- 6. Who may: the location's manager (above) and the owner; not another location's manager, an employee or a stranger.
select lives_ok(
  format($$select pg_temp.edit(%L, jsonb_build_object('action', 'set_notes', 'notes', jsonb_build_object('n86', '')))$$,
    tests.user('e:owner')),
  'the owner edits'
);
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'set_notes', 'notes', jsonb_build_object('n86', '')))$$,
    tests.user('e:bo'))),
  '42501:authz.out_of_scope', 'another location''s manager is out of scope'
);
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'set_notes', 'notes', jsonb_build_object('n86', '')))$$,
    tests.user('e:eli'))),
  '42501:authz.' || app_private.authz_reason(tests.user('e:eli'), tests.id('e'), 'lineup.share'), 'an employee gets the core''s reason'
);
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'set_notes', 'notes', jsonb_build_object('n86', '')))$$,
    tests.user('ex:xan'))),
  '42501:authz.not_member', 'another workspace''s manager is not a member here'
);
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'shout'))$$, tests.user('e:mia'))),
  '22023:lineup.invalid_command', 'an unknown action is refused'
);

-- 7. The lock: a published lineup changes only after Edit takes it back; a day that is over never.
select public.lineup_command_service(tests.user('e:mia'), tests.id('e'), gen_random_uuid(), 'share', jsonb_build_object(
  'lineups', jsonb_build_array(jsonb_build_object('location_id', tests.id('e:K'), 'service_date', tests.week(0),
    'shift_type_id', tests.id('e:type:lunch'))), 'ask_ack', true));
select is(
  pg_temp.refusal(format($$select pg_temp.edit(%L, jsonb_build_object('action', 'set_notes', 'notes', jsonb_build_object('n86', 'x')))$$,
    tests.user('e:mia'))),
  '22023:lineup.live', 'a published lineup is locked'
);
select public.lineup_command_service(tests.user('e:mia'), tests.id('e'), gen_random_uuid(), 'unpublish', jsonb_build_object(
  'lineups', jsonb_build_array(jsonb_build_object('location_id', tests.id('e:K'), 'service_date', tests.week(0),
    'shift_type_id', tests.id('e:type:lunch')))));
select lives_ok(
  format($$select pg_temp.edit(%L, jsonb_build_object('action', 'set_notes', 'notes', jsonb_build_object('n86', 'x')))$$,
    tests.user('e:mia')),
  'taken back with Edit, it changes again'
);
select is(
  pg_temp.refusal(format($$select public.lineup_edit_service(%L, %L, gen_random_uuid(), jsonb_build_object(
      'action', 'set_notes', 'location_id', %L, 'service_date', current_date - 2, 'shift_type_id', %L,
      'notes', jsonb_build_object('n86', 'x')))$$,
    tests.user('e:mia'), tests.id('e'), tests.id('e:K'), tests.id('e:type:lunch'))),
  '22023:lineup.past_day', 'a day that is over is locked'
);

select tests.closed_day(tests.id('e'), array[tests.id('e:K')], tests.week(0) + 3, tests.week(0) + 3, tests.user('e:owner'),
  null, 'Deep clean');
select is(
  pg_temp.refusal(format($$select public.lineup_edit_service(%L, %L, gen_random_uuid(), jsonb_build_object(
      'action', 'set_notes', 'location_id', %L, 'service_date', %L, 'shift_type_id', %L,
      'notes', jsonb_build_object('n86', 'x')))$$,
    tests.user('e:mia'), tests.id('e'), tests.id('e:K'), tests.week(0) + 3, tests.id('e:type:lunch'))),
  '22023:lineup.closed_day', 'a closed day is locked'
);

-- 8. L1's findings. Zed takes Ana's place; Eli and Ana acknowledged the version staff saw.
insert into public.daily_lineup_rows (id, workspace_id, lineup_id, location_id, service_date, employee_id, job_id, starts, ends)
select tests.remember('e:row:zed', gen_random_uuid()), tests.id('e'), d.id, tests.id('e:K'), tests.week(0),
  tests.id('e:zed'), tests.id('e:job:cook'), '10:00', '15:00'
from public.daily_lineups d where d.workspace_id = tests.id('e') and d.service_date = tests.week(0);
insert into public.daily_lineup_rows (id, workspace_id, lineup_id, location_id, service_date, source_shift_id, replaced_by_row_id)
select tests.remember('e:row:ana', gen_random_uuid()), tests.id('e'), d.id, tests.id('e:K'), tests.week(0),
  (select value from fixture where key = 'ana_source'), tests.id('e:row:zed')
from public.daily_lineups d where d.workspace_id = tests.id('e') and d.service_date = tests.week(0);
select public.lineup_command_service(tests.user('e:mia'), tests.id('e'), gen_random_uuid(), 'share', jsonb_build_object(
  'lineups', jsonb_build_array(jsonb_build_object('location_id', tests.id('e:K'), 'service_date', tests.week(0),
    'shift_type_id', tests.id('e:type:lunch'))), 'ask_ack', true));
-- ponytail: an acknowledgement Ana made before she was replaced (the gate below refuses a new one).
insert into public.daily_lineup_acknowledgements (workspace_id, version_id, employee_id)
select tests.id('e'), v.id, e.id
from public.daily_lineup_versions v join public.daily_lineups d on d.id = v.lineup_id and v.version = d.latest_version,
  public.employee_profiles e
where d.workspace_id = tests.id('e') and d.service_date = tests.week(0) and e.id in (tests.id('e:eli'), tests.id('e:ana'));
select is(
  (select row((x ->> 'acknowledged')::integer, (x ->> 'with_app')::integer)::text from jsonb_array_elements(
     public.get_lineup_day_service(tests.user('e:owner'), tests.id('e'), tests.week(0)) -> 'locations') l,
     jsonb_array_elements(l -> 'lineups') x where l ->> 'id' = tests.id('e:K')::text),
  row(1, 2)::text, 'Read counts only who is on the lineup, above and below: Eli of Eli and Zed'
);
select is(
  pg_temp.refusal(format($$select public.acknowledge_lineup_service(%L, %L, %L)$$, tests.user('e:ana'), tests.id('e'),
    (select v.id from public.daily_lineup_versions v join public.daily_lineups d on d.id = v.lineup_id and v.version = d.latest_version
     where d.workspace_id = tests.id('e') and d.service_date = tests.week(0)))),
  '42501:authz.out_of_scope', 'a replaced person does not acknowledge the lineup'
);
select is(
  (select row(m -> 'replaced', jsonb_array_length(x -> 'team'))::text
   from jsonb_array_elements(public.get_my_lineups_service(tests.user('e:ana'), tests.id('e'), tests.week(0)) -> 'lineups') x,
     jsonb_array_elements(x -> 'mine') m),
  row('true'::jsonb, 2)::text, 'Ana''s own lineup says she was replaced; its team is Eli and Zed, not her'
);
select ok(
  (select bool_and(not (t ? 'changed') and not (t ? 'schedule_start_time'))
   from jsonb_array_elements(public.get_my_lineups_service(tests.user('e:eli'), tests.id('e'), tests.week(0)) -> 'lineups') x,
     jsonb_array_elements(x -> 'team') t),
  'an employee''s team carries no manager marks'
);
select is(
  (select r.called_off_at from public.daily_lineup_rows r where r.id = tests.id('e:row:ana')),
  null, '(fixture) Ana is replaced, not called off'
);
-- A Replaced loop: Zed in Ana's place, then Ana in Zed's.
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
select is(
  pg_temp.refused_by(format('update public.daily_lineup_rows set replaced_by_row_id = %L where id = %L',
    tests.id('e:row:ana'), tests.id('e:row:zed'))),
  '23514 daily_lineup_rows_replaced_by_loop', 'two rows never replace each other'
);

-- 9. A started shift, through the service: today at Kadikoy, Zed is on the Lunch lineup from midnight (a person
-- added in the lineup; the Schedule isn't touched).
create temporary table today_k as
select (now() at time zone (select timezone from public.locations where id = tests.id('e:K')))::date as day;
insert into public.daily_lineups (id, workspace_id, location_id, service_date, shift_type_id)
values (tests.remember('e:lineup:today', gen_random_uuid()), tests.id('e'), tests.id('e:K'), (select day from today_k),
  tests.id('e:type:lunch'));
insert into public.daily_lineup_rows (workspace_id, lineup_id, location_id, service_date, employee_id, job_id, starts, ends)
values (tests.id('e'), tests.id('e:lineup:today'), tests.id('e:K'), (select day from today_k), tests.id('e:zed'),
  tests.id('e:job:cook'), '00:00', '23:59');
select is(
  pg_temp.refusal(format($$select public.lineup_edit_service(%L, %L, gen_random_uuid(), jsonb_build_object(
      'action', 'set_notes', 'location_id', %L, 'service_date', %L, 'shift_type_id', %L,
      'notes', jsonb_build_object('n86', 'x')))$$,
    tests.user('e:mia'), tests.id('e'), tests.id('e:K'), (select day from today_k), tests.id('e:type:lunch'))),
  '22023:lineup.started', 'a shift whose first person is in is locked, through the service'
);

select * from finish();
rollback;
