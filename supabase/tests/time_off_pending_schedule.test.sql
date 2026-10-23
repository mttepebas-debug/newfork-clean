begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Time off rebuild D3b (KARARLAR S-239 (9)): time off waiting for an answer is only a warning on the
-- Schedule. The week's availability carries its hours apart, as pending_leave_intervals, beside the
-- approved leave_intervals; it is neither a block nor a conflict, so a shift is written over it and the
-- week publishes with a note. The grid hands those hours only to who may answer the request (and the
-- person themself): a manager whose role does not decide time off sees none. The publish note says which
-- table the request is in (time_off_source), so the web never opens a new request in the old drawer.
--
-- World tw: Kadikoy (K), Istanbul.
--   mk - manager at K                fl - manager at K whose role does not decide time off
--   ali, bea, cem - employees at K

select tests.world('tw');
select tests.person('tw', 'mk', 'manager', array['K'], array['cook']);
select tests.role('tw', 'floor lead', 'manager', array(
  select rp.permission_key
  from public.workspace_role_permissions rp
  join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('tw') and r.system_key = 'manager'
    and rp.permission_key <> 'schedule.time_off_requests.manage'
    and rp.permission_key not in (select d.permission_key from app_private.role_permission_dependencies d
      where d.required_key = 'schedule.time_off_requests.manage')
));
select tests.person('tw', 'fl', 'floor lead', array['K'], array['cook']);
select tests.person('tw', 'ali', 'employee', array['K'], array['cook']);
select tests.person('tw', 'bea', 'employee', array['K'], array['cook']);
select tests.person('tw', 'cem', 'employee', array['K'], array['cook']);
select tests.settle();

create temporary table fixture (key text primary key, value uuid);
-- Ali asks for Wednesday of week 1 off, all day; Cem for Thursday 09:00-13:00. Both in the new table.
insert into fixture values
  ('ali', (public.ask_time_off_service(tests.user('tw:ali'), tests.id('tw'), 'vacation', tests.week(1) + 2, tests.week(1) + 2,
    true, null, null, 'Trip', 'Europe/Istanbul', gen_random_uuid()) ->> 'id')::uuid),
  ('cem', (public.ask_time_off_service(tests.user('tw:cem'), tests.id('tw'), 'personal', tests.week(1) + 3, tests.week(1) + 3,
    false, '09:00', '13:00', null, 'Europe/Istanbul', gen_random_uuid()) ->> 'id')::uuid);
-- Bea asks through tests.leave, Wednesday too: the old way until D8, the new table since.
insert into fixture values ('bea', tests.leave('tw', 'bea', 1));

create function pg_temp.week(person text) returns table (leave tstzmultirange, projection jsonb) language sql as $$
  select a.leave, a.projection
  from app_private.schedule_week_availability(tests.id('tw'), tests.week(1), array[tests.id('tw:' || person)], array[tests.id('tw:K')]) a
$$;
create function pg_temp.spans(intervals jsonb) returns tstzrange[] language sql as $$
  select coalesce(array_agg(tstzrange((i ->> 'start_at')::timestamptz, (i ->> 'end_at')::timestamptz, '[)') order by i ->> 'start_at'), '{}')
  from jsonb_array_elements(intervals) i
$$;
create function pg_temp.local(day date, clock text) returns timestamptz language sql as $$
  select (day + clock::time) at time zone 'Europe/Istanbul'
$$;
create function pg_temp.grid_week(who text, person text) returns jsonb language sql as $$
  select w
  from jsonb_array_elements(public.get_schedule_read_model_service(tests.user('tw:' || who), tests.id('tw'), tests.week(1)) -> 'employees') e,
    jsonb_array_elements(e -> 'weekly_availability') w
  where e ->> 'id' = tests.id('tw:' || person)::text
$$;

-- 1. The week's availability ---------------------------------------------------

select is((select pg_temp.spans(projection -> 'pending_leave_intervals') from pg_temp.week('ali')),
  array[tstzrange(pg_temp.local(tests.week(1) + 2, '00:00'), pg_temp.local(tests.week(1) + 3, '00:00'), '[)')],
  'Ali''s waiting Wednesday is in pending_leave_intervals, midnight to midnight in Kadikoy');
select is((select projection -> 'leave_intervals' from pg_temp.week('ali')), '[]'::jsonb,
  'and not in leave_intervals: nothing is approved');
select ok((select isempty(leave) from pg_temp.week('ali')), 'nor in the leave the assessment blocks on');
select is((select pg_temp.spans(projection -> 'pending_leave_intervals') from pg_temp.week('cem')),
  array[tstzrange(pg_temp.local(tests.week(1) + 3, '09:00'), pg_temp.local(tests.week(1) + 3, '13:00'), '[)')],
  'Cem''s hours are his hours');
select is((select jsonb_array_length(projection -> 'pending_leave_intervals') from pg_temp.week('bea')), 1,
  'Bea''s waiting Wednesday is there too');
select is((select projection -> 'pending_leave_intervals' from pg_temp.week('mk')), '[]'::jsonb,
  'somebody who asked nothing has an empty list');
select is((select projection ->> 'status' from pg_temp.week('ali')), 'ready', 'and the week stays ready');

-- 2. The grid: only who may answer --------------------------------------------

select is(pg_temp.spans(pg_temp.grid_week('mk', 'ali') -> 'pending_leave_intervals'),
  array[tstzrange(pg_temp.local(tests.week(1) + 2, '00:00'), pg_temp.local(tests.week(1) + 3, '00:00'), '[)')],
  'the Kadikoy manager, who may answer it, reads Ali''s waiting hours in the grid');
select is(jsonb_array_length(pg_temp.grid_week('mk', 'bea') -> 'pending_leave_intervals'), 1,
  'and Bea''s');
select is(pg_temp.grid_week('fl', 'ali') -> 'pending_leave_intervals', '[]'::jsonb,
  'a manager whose role does not decide time off reads none');
select is(pg_temp.grid_week('fl', 'ali') -> 'leave_intervals', '[]'::jsonb, 'and nothing approved either: there is none');
select is(pg_temp.grid_week('owner', 'cem') -> 'pending_leave_intervals' -> 0 ->> 'start_at' is not null, true,
  'the owner reads them');

-- 3. A shift over it: written, no conflict, published with a note ------------

create function pg_temp.draft(shifts jsonb) returns uuid language plpgsql as $$
declare
  owner_id uuid := tests.user('tw:owner');
  session uuid := (public.acquire_schedule_edit_session_service(owner_id, tests.id('tw'), tests.week(1), 'blank', null) -> 'session' ->> 'id')::uuid;
  shift jsonb;
begin
  for shift in select value from jsonb_array_elements(shifts) loop
    perform tests.remember('tw:draft:' || (shift ->> 'label'), tests.add_shift(owner_id, 'tw', session, 1, shift));
  end loop;
  return (public.save_schedule_edit_session_service(owner_id, tests.id('tw'), session,
    (select e.revision from public.schedule_edit_sessions e where e.id = session),
    'pending schedule ' || substr(gen_random_uuid()::text, 1, 8), null, null) ->> 'id')::uuid;
end $$;
select lives_ok($$select tests.remember('tw:draft', pg_temp.draft('[
  {"label": "ali_wed", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"},
  {"label": "bea_wed", "person": "bea", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"},
  {"label": "cem_thu_pm", "person": "cem", "loc": "K", "job": "cook", "day": 3, "start": "14:00", "end": "18:00"}
]'::jsonb))$$, 'shifts are written over time off waiting for an answer');
select is((select public.assess_weekly_shift_availability(tests.id('tw'), tests.id('tw:ali'), to_jsonb(d)) ->> 'operation'
  from public.schedule_draft_shifts d where d.id = tests.id('tw:draft:ali_wed')),
  'allowed', 'Ali''s Wednesday shift is no conflict');

create temporary table owner_preview as
select public.preview_schedule_publication_service(tests.user('tw:owner'), tests.id('tw'), tests.id('tw:draft'),
  array[tests.id('tw:K')], null, true) p;
create function pg_temp.note(person text) returns jsonb language sql as $$
  select f from owner_preview, jsonb_array_elements(p -> 'findings') f
  where f ->> 'code' = 'time_off_pending' and f ->> 'employee_id' = tests.id('tw:' || person)::text
$$;
select is((select p ->> 'status' from owner_preview), 'publish_ready', 'the week is ready to publish');
select is(pg_temp.note('ali') ->> 'time_off_request_id', (select value::text from fixture where key = 'ali'), 'Ali''s note names his request');
select is(pg_temp.note('ali') ->> 'time_off_source', 'current', 'and says it is in the new table');
-- time off rebuild D8: a note on a request in the old table ('legacy') went with the old time off.
select is(pg_temp.note('cem'), null, 'Cem''s afternoon shift misses his morning: no note');

-- S-243: the note is read only by who may answer the request, as on the grid. Fl publishes K but does not
-- decide time off: the same week, no note, and nothing held.
create temporary table fl_preview as
select public.preview_schedule_publication_service(tests.user('tw:fl'), tests.id('tw'), tests.id('tw:draft'),
  array[tests.id('tw:K')], null, true) p;
select is((select count(*)::integer from fl_preview, jsonb_array_elements(p -> 'findings') f where f ->> 'code' = 'time_off_pending'),
  0, 'a publisher who does not decide time off reads no waiting-time-off note (S-243)');
select is((select p ->> 'status' from fl_preview), 'publish_ready', 'and the week is ready to publish for them too');
select ok((select count(*) from owner_preview, jsonb_array_elements(p -> 'findings') f where f ->> 'code' = 'time_off_pending') = 2,
  'who decides reads both notes (Ali''s and Bea''s)');

-- 4. Answered ------------------------------------------------------------------

select public.answer_time_off_service(tests.user('tw:mk'), tests.id('tw'), (select value from fixture where key = 'ali'), 'approve', null,
  (select r.revision from public.time_off_requests r where r.id = (select value from fixture where key = 'ali')),
  app_private.time_off_shifts_print(app_private.time_off_shifts_at_stake(
    (select r from public.time_off_requests r where r.id = (select value from fixture where key = 'ali')))));
select is((select projection -> 'pending_leave_intervals' from pg_temp.week('ali')), '[]'::jsonb,
  'approved, it leaves pending_leave_intervals');
select is((select jsonb_array_length(projection -> 'leave_intervals') from pg_temp.week('ali')), 1, 'for leave_intervals');
select public.withdraw_time_off_service(tests.user('tw:cem'), tests.id('tw'), (select value from fixture where key = 'cem'),
  (select r.revision from public.time_off_requests r where r.id = (select value from fixture where key = 'cem')));
select is((select projection -> 'pending_leave_intervals' from pg_temp.week('cem')), '[]'::jsonb, 'withdrawn, it is gone');

select * from finish();
rollback;
