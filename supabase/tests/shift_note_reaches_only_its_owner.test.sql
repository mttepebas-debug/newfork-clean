begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- BL-199 (user, S1 (a), S-A (a), S-B (a)): a shift's note reaches the person
-- working the shift and the managers, nobody else. Ali and Deniz both work at
-- Kadikoy; Ayse manages it. On the screens an employee reads (the team
-- schedule and Employee Hub) Ali sees the note on his own shift, not the one on
-- Deniz's, and no open shift at all (Mert, 2026-10-20: an open shift reaches
-- an employee only offered, in Shift Hub); the rule is the
-- same for Ayse there. Ayse reads every note on the Schedule.

-- What one statement answers: its jsonb, or null when refused.
create function pg_temp.answer(statement text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  execute statement into r;
  return r;
exception when others then
  return null;
end;
$$;
-- The SQLSTATE a statement is refused with, or 'allowed'.
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return 'allowed';
exception when others then
  return sqlstate;
end;
$$;
-- Every note anywhere in an answer.
create function pg_temp.notes(answer jsonb) returns text[] language sql as $$
  select coalesce(array_agg(n #>> '{}' order by n #>> '{}'), '{}')
  from jsonb_path_query(coalesce(answer, '{}'::jsonb), 'strict $.**.note') n
  where n #>> '{}' <> ''
$$;

select tests.world('sn');
select tests.person('sn', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('sn', 'ali', 'employee', array['K'], array['cook']);
select tests.person('sn', 'deniz', 'employee', array['K'], array['cook']);
select tests.publish_week('sn', 1, '[
  {"label": "ali-tue", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00", "note": "Ali: bring the catering list"},
  {"label": "deniz-wed", "person": "deniz", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00", "note": "Deniz: leaves at 3 for the doctor"},
  {"label": "open-thu", "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "15:00", "note": "Open: the new oven arrives"}
]');

create function pg_temp.board(person text) returns jsonb language sql as $$
  select pg_temp.answer(format('select public.get_employee_schedule_board_service(%L, %L, %L)',
    tests.user('sn:' || person), tests.id('sn'), tests.week(1) + 1))
$$;
create function pg_temp.hub(person text) returns jsonb language sql as $$
  select pg_temp.answer(format('select public.get_employee_hub_service(%L, %L, %L, %L)',
    tests.user('sn:' || person), tests.id('sn'), tests.week(1), tests.week(1) + 6))
$$;
-- Deniz's Wednesday is in the answer's list, with an empty note, and his note
-- is nowhere in the answer. The shift has to be there first: a refused or
-- empty answer has no note in it either, and must not pass for one that hides it.
create function pg_temp.shows_deniz_without_note(answer jsonb, list text) returns boolean language sql as $$
  select coalesce(jsonb_path_exists(answer, format('$.%s[*] ? (@.id == $id && @.note == "")', list)::jsonpath,
      jsonb_build_object('id', tests.id('sn:shift:deniz-wed'))), false)
    and not 'Deniz: leaves at 3 for the doctor' = any (pg_temp.notes(answer))
$$;

-- 1. The team schedule (Employee Hub > Schedule) ------------------------------------------

select ok('Ali: bring the catering list' = any (pg_temp.notes(pg_temp.board('ali'))),
  'Ali''s team schedule carries the note on his own shift');
select ok(pg_temp.shows_deniz_without_note(pg_temp.board('ali'), 'shifts'),
  'but not the note on Deniz''s shift');
select ok(jsonb_path_exists(pg_temp.board('ali'),
    '$.shifts[*] ? (@.employee_id == $who && @.note == "")', jsonb_build_object('who', tests.id('sn:deniz'))),
  'Deniz''s shift is still there, with an empty note');
select ok(jsonb_array_length(pg_temp.board('ali') -> 'shifts') = 2
    and not jsonb_path_exists(pg_temp.board('ali'), '$.shifts[*] ? (@.id == $id)', jsonb_build_object('id', tests.id('sn:shift:open-thu')))
    and not 'Open: the new oven arrives' = any (pg_temp.notes(pg_temp.board('ali'))),
  'the open shift is not on Ali''s team schedule, nor its note');
select ok(pg_temp.shows_deniz_without_note(pg_temp.board('ayse'), 'shifts'),
  'Ayse''s team schedule does not carry Deniz''s note either');

-- 2. Employee Hub ----------------------------------------------------------------------

select ok('Ali: bring the catering list' = any (pg_temp.notes(pg_temp.hub('ali'))),
  'Ali''s Employee Hub carries the note on his own shift');
select ok(pg_temp.shows_deniz_without_note(pg_temp.hub('ali'), 'team_shifts'),
  'but not the note on Deniz''s shift among the team''s shifts');
select ok(jsonb_path_exists(pg_temp.hub('ali'),
    '$.team_shifts[*] ? (@.employee_id == $who && @.note == "")', jsonb_build_object('who', tests.id('sn:deniz'))),
  'Deniz''s shift is still there, with an empty note');
select ok(pg_temp.hub('ali') -> 'open_shifts' = '[]'::jsonb and not 'Open: the new oven arrives' = any (pg_temp.notes(pg_temp.hub('ali'))),
  'nor in his Employee Hub');
select ok(pg_temp.shows_deniz_without_note(pg_temp.hub('ayse'), 'team_shifts'),
  'Ayse''s Employee Hub does not carry Deniz''s note either');

-- 3. The Schedule: the manager reads every note, an employee reads none -----------------

select is(pg_temp.notes(pg_temp.answer(format('select public.get_schedule_read_model_service(%L, %L, %L)',
    tests.user('sn:ayse'), tests.id('sn'), tests.week(1) + 1))),
  array['Ali: bring the catering list', 'Deniz: leaves at 3 for the doctor', 'Open: the new oven arrives'],
  'Ayse reads every note on the Schedule');
select is(pg_temp.refusal(format('select public.get_schedule_read_model_service(%L, %L, %L)',
    tests.user('sn:ali'), tests.id('sn'), tests.week(1) + 1)), '42501',
  'Ali cannot read the Schedule''s read model');
select is(pg_temp.refusal(format('select public.list_schedule_weekly_shifts_service(%L, %L, %L, %L, null, true)',
    tests.user('sn:ali'), tests.id('sn'), tests.week(1), array[tests.id('sn:K')])), '42501',
  'nor the week''s shift list');
select is(pg_temp.refusal(format('select public.preview_schedule_export_service(%L, %L, %L, %L, null, %L)',
    tests.user('sn:ali'), tests.id('sn'), tests.week(1), 'published', array[tests.id('sn:K')])), '42501',
  'nor the schedule export');

-- 4. Shift exchanges carry no note ------------------------------------------------------
-- The swap request and the shifts one could swap with are both built by
-- shift_exchange_shift, which carries no note.

create function pg_temp.names_deniz_shift(answer jsonb) returns boolean language sql as $$
  select coalesce(answer::text like '%' || tests.id('sn:shift:deniz-wed') || '%', false)
$$;


-- Ali asks to swap his Tuesday for Deniz's Wednesday.
select public.shift_exchanges_command_service(tests.user('sn:ali'), tests.id('sn'), jsonb_build_object(
  'action', 'create', 'kind', 'swap',
  'shift_id', tests.id('sn:shift:ali-tue'), 'requested_shift_id', tests.id('sn:shift:deniz-wed')), gen_random_uuid());
select tests.settle();
select ok(pg_temp.names_deniz_shift(pg_temp.answer(format('select public.shift_exchanges_read_service(%L, %L, false, %L, %L, null)',
      tests.user('sn:ali'), tests.id('sn'), tests.week(1), tests.week(1) + 6)))
    and pg_temp.notes(pg_temp.answer(format('select public.shift_exchanges_read_service(%L, %L, false, %L, %L, null)',
      tests.user('sn:ali'), tests.id('sn'), tests.week(1), tests.week(1) + 6))) = '{}'::text[],
  'Ali''s swap request shows Deniz''s shift without its note');

select * from finish();
rollback;
