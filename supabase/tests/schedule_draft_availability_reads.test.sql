begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- FOUNDATION-B 5.3c: the draft conflict list (Publish -> review) and the weekly
-- shift list behind Export read the weekly marks through the shared check,
-- the same as the Schedule grid. Moved from availability_read_model_consistency,
-- which described the dated versions that are gone.

select tests.world('dr');
select tests.person('dr', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('dr', 'mehmet', 'manager', array['B'], array['cook']);
select tests.person('dr', 'ali', 'employee', array['K', 'B'], array['cook']);

insert into public.shift_types (id, workspace_id, name, color, default_start_time, default_end_time)
values (gen_random_uuid(), tests.id('dr'), 'Lunch', '#123456', '12:00', '16:00');

-- Monday lunch at Kadikoy on the type's hours, Wednesday morning at Besiktas.
create temp table dr as select
  (public.acquire_schedule_edit_session_service(tests.user('dr:owner'), tests.id('dr'), tests.week(1), 'blank', null) -> 'session' ->> 'id')::uuid session,
  gen_random_uuid() shift,
  public.normalize_schedule_time_source(tests.id('dr'), jsonb_build_object(
    'location_id', tests.id('dr:K'), 'employee_id', tests.id('dr:ali'), 'job_id', tests.id('dr:job:cook'),
    'shift_type_id', (select id from public.shift_types where workspace_id = tests.id('dr') and name = 'Lunch'),
    'scheduled_date', tests.week(1), 'time_basis', 'type_default', 'note', '')) payload,
  null::uuid draft, null::jsonb before_mark, null::jsonb preview;
select public.mutate_schedule_edit_shift_service(tests.user('dr:owner'), tests.id('dr'), session, 1, 'create', shift, null, payload, gen_random_uuid()) from dr;
select tests.add_shift(tests.user('dr:owner'), 'dr', session, 1, '{"person": "ali", "loc": "B", "job": "cook", "day": 2, "start": "09:00", "end": "12:00"}') from dr;
update dr set draft = (public.save_schedule_edit_session_service(tests.user('dr:owner'), tests.id('dr'), session,
  (select e.revision from public.schedule_edit_sessions e where e.id = session), 'draft reads', null, null) ->> 'id')::uuid;

create function pg_temp.conflicts(actor text default 'owner') returns jsonb language sql as $$
  select public.list_schedule_draft_availability_conflicts_service(tests.user('dr:' || actor), tests.id('dr'), draft, tests.week(1)) from dr
$$;
-- Export's weekly list at Kadikoy, from the draft or from what is published.
create function pg_temp.lunch(from_draft boolean default true) returns jsonb language sql as $$
  select public.list_schedule_weekly_shifts_service(tests.user('dr:owner'), tests.id('dr'), tests.week(1), array[tests.id('dr:K')],
    case when from_draft then draft end, false) -> 'shifts' -> 0 from dr
$$;

select is(jsonb_array_length(pg_temp.conflicts() -> 'conflicts'), 0, 'a draft on free hours has no availability conflict');
select is(pg_temp.lunch() ->> 'time_basis', 'type_default', 'the weekly list keeps the shift type''s hours as the source');
select is(pg_temp.lunch() -> 'availability_assessment' ->> 'coverage', 'full', 'and checks them against the marks');
update dr set before_mark = pg_temp.conflicts();

-- Ali marks Monday 13:00-15:00 after the draft was saved.
insert into public.employee_weekly_preferences (workspace_id, employee_id, preference, revision, updated_by)
values (tests.id('dr'), tests.id('dr:ali'),
  jsonb_set(public.empty_weekly_preference('time_range'), '{days,1,range}', '{"start": "13:00", "end": "15:00"}'),
  1, tests.user('dr:ali'));
-- BL-186: a mark is a preference, a warning on the shift and never a conflict.
select is(jsonb_array_length(pg_temp.conflicts() -> 'conflicts'), 0, 'a mark added after the draft is not a conflict');
select ok((pg_temp.lunch() -> 'availability_assessment' ->> 'has_availability_conflict')::boolean, 'the weekly list shows it as a warning');
select is(pg_temp.lunch() -> 'availability_assessment' -> 'unavailable_intervals',
  (select public.assess_weekly_shift_availability(tests.id('dr'), tests.id('dr:ali'), payload || jsonb_build_object('id', shift)) -> 'unavailable_intervals' from dr),
  'with the same unavailable hours as the shared check');
select isnt(pg_temp.conflicts() ->> 'fingerprint', (select before_mark ->> 'fingerprint' from dr), 'a new mark changes the list''s fingerprint');
select is(pg_temp.lunch() -> 'warning_codes', '["availability"]'::jsonb, 'the weekly list agrees with the conflict list');
select ok(not (pg_temp.lunch() -> 'availability_assessment' ?| array['sources', 'leave', 'pending']), 'and keeps leave and sources to itself');

-- Kadikoy's manager sees Kadikoy's warning; Besiktas's manager sees none of it.
select ok((select bool_or((x -> 'availability_assessment' ->> 'has_availability_conflict')::boolean) from dr,
  jsonb_array_elements(public.list_schedule_weekly_shifts_service(tests.user('dr:ayse'), tests.id('dr'), tests.week(1), null, draft, false) -> 'shifts') x),
  'the Kadikoy manager sees the warning on the Kadikoy shift');
select ok((select not bool_or(coalesce((x -> 'availability_assessment' ->> 'has_availability_conflict')::boolean, false)) from dr,
  jsonb_array_elements(public.list_schedule_weekly_shifts_service(tests.user('dr:mehmet'), tests.id('dr'), tests.week(1), null, draft, false) -> 'shifts') x),
  'the Besiktas manager does not');
select is((select jsonb_array_length(public.list_schedule_weekly_shifts_service(tests.user('dr:ayse'), tests.id('dr'), tests.week(1), null, draft, false) -> 'shifts') from dr),
  1, 'the weekly list shows a manager only their locations');
set local role authenticated;
select throws_ok($$select public.schedule_availability_enrich_read(null, null, '{}')$$, '42501', null, 'the browser cannot call the enrichment helper');
reset role;

-- Published with the warning acknowledged; the grid keeps reading today's marks.
update dr set preview = public.preview_schedule_publication_service(tests.user('dr:owner'), tests.id('dr'), draft, array[tests.id('dr:K'), tests.id('dr:B')], null, true);
select lives_ok($$select public.publish_schedule_draft_service(tests.user('dr:owner'), tests.id('dr'), r.draft, array[tests.id('dr:K'), tests.id('dr:B')], null, true,
  d.revision, r.preview ->> 'fingerprint',
  (select coalesce(jsonb_agg(jsonb_build_object('finding_id', f ->> 'id')), '[]') from jsonb_array_elements(r.preview -> 'findings') f where f ->> 'severity' = 'soft'))
  from dr r join public.schedule_drafts d on d.id = r.draft$$, 'the manager acknowledges the warning and publishes');
select is(pg_temp.lunch(false) -> 'availability_assessment' ->> 'operation', 'allowed', 'the published shift is allowed');
select is(pg_temp.lunch(false) ->> 'availability_responsibility_retained', 'true', 'and keeps its published responsibility');
select is(pg_temp.lunch(false) -> 'warning_codes', '["availability"]'::jsonb, 'it shows today''s mark as a warning, as the grid does');
select is(jsonb_array_length(pg_temp.conflicts() -> 'conflicts'), 0, 'the draft lists no conflict');
delete from public.employee_weekly_preferences where employee_id = tests.id('dr:ali');
select is(pg_temp.lunch(false) -> 'warning_codes', '[]'::jsonb, 'once Ali clears the mark the published shift shows no warning');

select * from finish();
rollback;
