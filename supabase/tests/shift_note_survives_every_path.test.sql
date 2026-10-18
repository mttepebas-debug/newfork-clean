begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- BL-199: a manager's note on a shift ("Bring the catering order list") goes
-- wherever the shift goes. Saving the week, making a template of it and
-- applying that template, and publishing all carry the note along. An edit
-- whose payload leaves the note (or the break, "hide the time" or the labels)
-- out keeps it (BL-292, EKRAN-01 #11 and B7). Two decisions (user, 2026-09-28) are
-- locked too: S4 (a) a change to the note alone makes its owner an affected
-- employee at the next publish, who hears about it with everyone else;
-- S5 (a) after an approved swap or pickup the note stays with the shift, and
-- its new owner reads it.
--
-- Kadikoy (K): Ayse manages it, Ali and Deniz work there. The owner edits.

select tests.world('np');
select tests.person('np', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('np', 'ali', 'employee', array['K'], array['cook']);
select tests.person('np', 'deniz', 'employee', array['K'], array['cook']);

create function pg_temp.session(n integer, source text) returns uuid language sql as $$
  select (public.acquire_schedule_edit_session_service(tests.user('np:owner'), tests.id('np'), tests.week(n),
    source::public.schedule_edit_source, null) -> 'session' ->> 'id')::uuid
$$;
create function pg_temp.revision(session uuid) returns integer language sql as $$
  select e.revision from public.schedule_edit_sessions e where e.id = session
$$;
-- Saves one working shift again with its current values, the changes laid
-- over them and the keys in left_out missing from the payload altogether.
create function pg_temp.rewrite(session uuid, shift uuid, changes jsonb, left_out text[] default '{}')
returns void language plpgsql as $$
declare
  s public.schedule_edit_session_shifts;
  payload jsonb;
begin
  select * into s from public.schedule_edit_session_shifts where id = shift and session_id = session;
  payload := (jsonb_build_object(
    'location_id', s.location_id, 'employee_id', s.employee_id, 'job_id', s.job_id,
    'shift_type_id', s.shift_type_id, 'scheduled_date', s.scheduled_date,
    'start_time', to_char(s.start_time, 'HH24:MI'), 'end_time', to_char(s.end_time, 'HH24:MI'),
    'time_basis', s.time_basis, 'time_snapshot', s.time_snapshot, 'time_timezone', s.time_timezone,
    'unpaid_break_minutes', s.unpaid_break_minutes, 'hide_time_on_badge', s.hide_time_on_badge,
    'label_ids', to_jsonb(s.label_ids), 'label_names', to_jsonb(s.label_names), 'note', s.note
  ) || changes) - left_out;
  perform public.mutate_schedule_edit_shift_service(
    tests.user('np:owner'), tests.id('np'), session, pg_temp.revision(session), 'update', shift, s.revision,
    payload || jsonb_build_object('availability_assessment_fingerprint',
      public.assess_schedule_shift_service(tests.user('np:owner'), tests.id('np'), payload, shift, session) ->> 'fingerprint'),
    gen_random_uuid());
end;
$$;
create function pg_temp.save(session uuid, name text) returns uuid language sql as $$
  select (public.save_schedule_edit_session_service(tests.user('np:owner'), tests.id('np'), session,
    pg_temp.revision(session), name, null, null) ->> 'id')::uuid
$$;
create function pg_temp.preview(draft uuid) returns jsonb language sql as $$
  select public.preview_schedule_publication_service(tests.user('np:owner'), tests.id('np'), draft,
    array[tests.id('np:K')], null, true)
$$;
create function pg_temp.publish(draft uuid) returns jsonb language sql as $$
  select public.publish_schedule_draft_service(tests.user('np:owner'), tests.id('np'), draft, array[tests.id('np:K')],
    null, true, (select d.revision from public.schedule_drafts d where d.id = draft),
    pg_temp.preview(draft) ->> 'fingerprint', '[]'::jsonb)
$$;
-- The note on the current published shift of this person on this day.
create function pg_temp.published_note(person text, n integer, day integer) returns text language sql as $$
  select p.note from public.schedule_published_shifts p
  join public.schedule_location_publications publication on publication.id = p.publication_id and publication.status = 'current'
  where p.workspace_id = tests.id('np') and p.employee_id = tests.id('np:' || person) and p.scheduled_date = tests.week(n) + day
$$;
create function pg_temp.board(person text, n integer) returns jsonb language sql as $$
  select public.get_employee_schedule_board_service(tests.user('np:' || person), tests.id('np'), tests.week(n) + 1)
$$;
create function pg_temp.hub(person text, n integer) returns jsonb language sql as $$
  select public.get_employee_hub_service(tests.user('np:' || person), tests.id('np'), tests.week(n), tests.week(n) + 6)
$$;

-- 1. Save: the working shift's note reaches the saved draft --------------------------

select tests.remember('np:session:w1', pg_temp.session(1, 'blank'));
select tests.add_shift(tests.user('np:owner'), 'np', tests.id('np:session:w1'), 1,
  '{"person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00", "note": "Bring the catering order list"}');
select tests.add_shift(tests.user('np:owner'), 'np', tests.id('np:session:w1'), 1,
  '{"person": "deniz", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}');
select tests.remember('np:draft:w1', pg_temp.save(tests.id('np:session:w1'), 'Week one'));

select is(
  (select d.note from public.schedule_draft_shifts d where d.draft_id = tests.id('np:draft:w1') and d.employee_id = tests.id('np:ali')),
  'Bring the catering order list',
  'saving the week keeps the note on the draft shift');

-- 2. Templates: made from the week, applied to another --------------------------------

select public.create_schedule_template_service(tests.user('np:owner'), tests.id('np'), tests.id('np:draft:w1'), 'Weekday prep', true);
select tests.remember('np:template', (select t.id from public.schedule_templates t where t.workspace_id = tests.id('np') and t.name = 'Weekday prep'));

select is(
  (select array_agg(s.note order by s.day_offset) from public.schedule_template_shifts s where s.template_id = tests.id('np:template')),
  array['Bring the catering order list', ''],
  'a template made from the week keeps the note');

select tests.remember('np:session:w2', pg_temp.session(2, 'blank'));
select public.apply_schedule_template_service(tests.user('np:owner'), tests.id('np'), tests.id('np:session:w2'),
  pg_temp.revision(tests.id('np:session:w2')), tests.id('np:template'), 'merge');
select tests.remember('np:shift:w2-tue', (select s.id from public.schedule_edit_session_shifts s
  where s.session_id = tests.id('np:session:w2') and s.scheduled_date = tests.week(2) + 1));

select is(
  (select s.note from public.schedule_edit_session_shifts s where s.id = tests.id('np:shift:w2-tue')),
  'Bring the catering order list',
  'applying the template to another week keeps the note');

-- 3. Publish: the draft's note reaches the published shift ----------------------------

select pg_temp.publish(tests.id('np:draft:w1'));

select is(pg_temp.published_note('ali', 1, 1), 'Bring the catering order list',
  'publishing the week keeps the note on the published shift');

-- 4. BL-292: a payload without a note leaves the note alone ----------------------------
-- A new path that forgets the note cannot erase it; clearing it takes an empty
-- string on purpose.

select pg_temp.rewrite(tests.id('np:session:w2'), tests.id('np:shift:w2-tue'), '{}', array['note']);

select is(
  (select s.note from public.schedule_edit_session_shifts s where s.id = tests.id('np:shift:w2-tue')),
  'Bring the catering order list',
  'BL-292: an edit whose payload leaves the note out keeps it');

select pg_temp.rewrite(tests.id('np:session:w2'), tests.id('np:shift:w2-tue'), '{"note": ""}', array[]::text[]);

select is(
  (select s.note from public.schedule_edit_session_shifts s where s.id = tests.id('np:shift:w2-tue')),
  '',
  'BL-292: an empty note clears it');

-- EKRAN-01 #11: the unpaid break and "hide the time" stay put the same way.
select pg_temp.rewrite(tests.id('np:session:w2'), tests.id('np:shift:w2-tue'),
  '{"unpaid_break_minutes": 30, "hide_time_on_badge": true}');
select pg_temp.rewrite(tests.id('np:session:w2'), tests.id('np:shift:w2-tue'), '{}',
  array['unpaid_break_minutes', 'hide_time_on_badge']);

select is(
  (select s.unpaid_break_minutes from public.schedule_edit_session_shifts s where s.id = tests.id('np:shift:w2-tue')),
  30,
  'an edit whose payload leaves the break out keeps the 30-minute break');
select is(
  (select s.hide_time_on_badge from public.schedule_edit_session_shifts s where s.id = tests.id('np:shift:w2-tue')),
  true,
  'an edit whose payload leaves "hide the time" out keeps it on');

select pg_temp.rewrite(tests.id('np:session:w2'), tests.id('np:shift:w2-tue'),
  '{"unpaid_break_minutes": 0, "hide_time_on_badge": false}');

select is(
  (select s.unpaid_break_minutes from public.schedule_edit_session_shifts s where s.id = tests.id('np:shift:w2-tue')),
  0,
  'a break of 0 sent on purpose clears it');
select is(
  (select s.hide_time_on_badge from public.schedule_edit_session_shifts s where s.id = tests.id('np:shift:w2-tue')),
  false,
  '"hide the time" sent as false turns it off');

-- EKRAN-01 B7: the labels stay put the same way; an empty list clears them.
insert into public.shift_labels (id, workspace_id, name) values (tests.remember('np:label:catering', gen_random_uuid()), tests.id('np'), 'Catering');
select pg_temp.rewrite(tests.id('np:session:w2'), tests.id('np:shift:w2-tue'),
  jsonb_build_object('label_ids', jsonb_build_array(tests.id('np:label:catering'))));
select pg_temp.rewrite(tests.id('np:session:w2'), tests.id('np:shift:w2-tue'), '{}', array['label_ids', 'label_names']);

select is(
  (select s.label_names from public.schedule_edit_session_shifts s where s.id = tests.id('np:shift:w2-tue')),
  array['Catering'],
  'an edit whose payload leaves the labels out keeps the Catering label');

select pg_temp.rewrite(tests.id('np:session:w2'), tests.id('np:shift:w2-tue'), '{"label_ids": []}');

select is(
  (select s.label_names from public.schedule_edit_session_shifts s where s.id = tests.id('np:shift:w2-tue')),
  array[]::text[],
  'an empty label list sent on purpose clears them');

-- 5. S4 (a): a change to the note alone is a change for its owner ---------------------

select tests.remember('np:session:w1b', pg_temp.session(1, 'published'));
select pg_temp.rewrite(tests.id('np:session:w1b'),
  (select s.id from public.schedule_edit_session_shifts s where s.session_id = tests.id('np:session:w1b') and s.employee_id = tests.id('np:ali')),
  '{"note": "Bring the catering order list and the new menu"}');
select tests.remember('np:draft:w1b', pg_temp.save(tests.id('np:session:w1b'), 'Week one, new note'));

-- Deniz's shift is in the draft unchanged: only Ali's is affected.
select is(pg_temp.preview(tests.id('np:draft:w1b')) -> 'locations' -> 0 -> 'affected_employee_ids',
  jsonb_build_array(tests.id('np:ali')),
  'only the note changed: its owner, and nobody else, is the affected employee');

select pg_temp.publish(tests.id('np:draft:w1b'));
select is(pg_temp.published_note('ali', 1, 1), 'Bring the catering order list and the new menu',
  'publishing it, Ali''s published shift carries the new note');

-- 6. S5 (a): after an approved swap or pickup the note stays with the shift -----------

select tests.publish_week('np', 3, '[
  {"label": "ali-tue", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00", "note": "Count the till before close"},
  {"label": "deniz-wed", "person": "deniz", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00", "note": "Take the produce delivery"},
  {"label": "deniz-thu", "person": "deniz", "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "15:00", "note": "The new oven arrives at 10"}
]');

-- Manager approval, the way Schedule > Requests sends it.
-- (Not "case_id": a column of shift_exchange_applications by that name would
-- shadow it and match every request in the database.)
create function pg_temp.approve(target_case uuid) returns void language sql as $$
  select public.shift_exchanges_command_service(tests.user('np:ayse'), tests.id('np'), jsonb_build_object(
    'action', 'approve', 'case_id', c.id, 'application_id', a.id, 'expected_revision', c.revision,
    'fingerprint', public.shift_exchange_preview(tests.user('np:ayse'), tests.id('np'), c.id, a.id) ->> 'fingerprint'),
    gen_random_uuid())
  from public.shift_exchange_cases c join public.shift_exchange_applications a on a.case_id = c.id and a.status = 'pending_manager'
  where c.id = target_case
$$;

-- Ali swaps his Tuesday for Deniz's Wednesday; Deniz agrees; Ayse approves.
select tests.remember('np:case:swap', (public.shift_exchanges_command_service(tests.user('np:ali'), tests.id('np'), jsonb_build_object(
  'action', 'create', 'kind', 'swap',
  'shift_id', tests.id('np:shift:ali-tue'), 'requested_shift_id', tests.id('np:shift:deniz-wed')), gen_random_uuid()) ->> 'case_id')::uuid);
select public.shift_exchanges_command_service(tests.user('np:deniz'), tests.id('np'), jsonb_build_object(
  'action', 'accept', 'case_id', c.id, 'application_id', a.id, 'expected_revision', c.revision), gen_random_uuid())
from public.shift_exchange_cases c join public.shift_exchange_applications a on a.case_id = c.id
where c.id = tests.id('np:case:swap');
select pg_temp.approve(tests.id('np:case:swap'));
select tests.settle();

select is((select p.employee_id from public.schedule_published_shifts p where p.id = tests.id('np:shift:ali-tue')),
  tests.id('np:deniz'), 'the approved swap gave Ali''s Tuesday to Deniz');
select is((select p.note from public.schedule_published_shifts p where p.id = tests.id('np:shift:ali-tue')),
  'Count the till before close', 'the Tuesday keeps its note');
select ok(jsonb_path_exists(pg_temp.hub('deniz', 3), '$.shifts[*] ? (@.note == "Count the till before close")'),
  'Deniz, its new owner, reads it in Employee Hub');
-- nf-guvenlik D2: Ali, who gave the Tuesday away, now sees it as a teammate's
-- shift, and a teammate's shift carries no note (part 2, S1 (a)).
select ok(jsonb_path_exists(pg_temp.board('ali', 3), '$.shifts[*] ? (@.id == $id && @.note == "")',
    jsonb_build_object('id', tests.id('np:shift:ali-tue'))),
  'Ali, who swapped it away, sees the Tuesday on his team schedule without its note');
select ok(jsonb_path_exists(pg_temp.hub('ali', 3), '$.team_shifts[*] ? (@.id == $id && @.note == "")',
    jsonb_build_object('id', tests.id('np:shift:ali-tue'))),
  'and in Employee Hub without its note');

-- Deniz releases Thursday and Ali picks it up; Ayse approves.
select tests.cover_case('np', 'deniz-thu', 'deniz', 'ali');
select pg_temp.approve(tests.id('np:case:deniz-thu'));
select tests.settle();

select is((select p.employee_id from public.schedule_published_shifts p where p.id = tests.id('np:shift:deniz-thu')),
  tests.id('np:ali'), 'the approved pickup gave Deniz''s Thursday to Ali');
select is((select p.note from public.schedule_published_shifts p where p.id = tests.id('np:shift:deniz-thu')),
  'The new oven arrives at 10', 'the Thursday keeps its note');
select ok(jsonb_path_exists(pg_temp.hub('ali', 3), '$.shifts[*] ? (@.note == "The new oven arrives at 10")'),
  'Ali, its new owner, reads it in Employee Hub');

select * from finish();
rollback;
