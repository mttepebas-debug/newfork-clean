begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- FB-6.3 (KARARLAR "İzin", FB-6.3 rule 13): a shift that meets time off still
-- waiting for a decision gets a note in the publish window. It never blocks
-- the publish and nobody has to confirm it. One note per person, day and
-- location, listing that day's shifts there. Approved time off stays a
-- blocker and gets no note; a denied request gets nothing.

select tests.world('tp');
select tests.person('tp', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('tp', 'ali', 'employee', array['K', 'B'], array['cook']);
select tests.person('tp', 'emre', 'employee', array['K'], array['cook']);

-- A week written on the Schedule screen and saved as a draft, not published.
create function pg_temp.draft(shifts jsonb) returns uuid language plpgsql as $$
declare
  owner_id uuid := tests.user('tp:owner');
  session uuid := (public.acquire_schedule_edit_session_service(owner_id, tests.id('tp'), tests.week(1), 'blank', null) -> 'session' ->> 'id')::uuid;
  shift jsonb;
begin
  for shift in select value from jsonb_array_elements(shifts) loop
    perform tests.remember('tp:draft:' || (shift ->> 'label'), tests.add_shift(owner_id, 'tp', session, 1, shift));
  end loop;
  return (public.save_schedule_edit_session_service(owner_id, tests.id('tp'), session,
    (select e.revision from public.schedule_edit_sessions e where e.id = session),
    'pending note ' || substr(gen_random_uuid()::text, 1, 8), null, null) ->> 'id')::uuid;
end $$;
create function pg_temp.preview(who text, locs text[]) returns jsonb language sql as $$
  select public.preview_schedule_publication_service(tests.user('tp:' || who), tests.id('tp'), tests.id('tp:draft'),
    array(select tests.id('tp:' || k) from unnest(locs) k), null, true)
$$;
create function pg_temp.notes(preview jsonb) returns setof jsonb language sql as $$
  select f from jsonb_array_elements(preview -> 'findings') f where f ->> 'code' = 'time_off_pending'
  order by f ->> 'scheduled_date', f ->> 'location_id'
$$;
-- The shifts a note lists, by draft label.
create function pg_temp.labels(note jsonb) returns text[] language sql as $$
  select coalesce(array_agg(split_part(r.label, ':', 3) order by r.label), '{}')
  from jsonb_array_elements_text(note -> 'shift_ids') s
  join tests.ids r on r.id = s::uuid and r.label like 'tp:draft:%'
$$;

-- Ali asks for Wednesday off (tests.week(1) + 2); nobody has decided yet.
select tests.remember('tp:ali:leave', tests.leave('tp', 'ali', 1));
select tests.remember('tp:draft', pg_temp.draft($$[
  {"label": "ali_wed_am", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "08:00", "end": "11:00"},
  {"label": "ali_wed_pm", "person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "11:00", "end": "14:00"},
  {"label": "ali_wed_b", "person": "ali", "loc": "B", "job": "cook", "day": 2, "start": "15:00", "end": "18:00"},
  {"label": "ali_thu", "person": "ali", "loc": "K", "job": "cook", "day": 3, "start": "08:00", "end": "11:00"},
  {"label": "emre_wed", "person": "emre", "loc": "K", "job": "cook", "day": 2, "start": "08:00", "end": "11:00"},
  {"label": "open_wed", "loc": "K", "job": "cook", "day": 2, "start": "08:00", "end": "11:00"}
]$$::jsonb));

-- 1. The note -----------------------------------------------------------------

create temp table owner_preview as select pg_temp.preview('owner', array['K', 'B']) p;

select is((select count(*)::integer from owner_preview, pg_temp.notes(p)), 2,
  'one note for Wednesday at Kadikoy and one at Besiktas: Thursday, Emre and the open shift have none');
select is((select pg_temp.labels(n) from owner_preview, pg_temp.notes(p) n where n ->> 'location_id' = tests.id('tp:K')::text),
  array['ali_wed_am', 'ali_wed_pm'], 'the Kadikoy note lists both of his Wednesday shifts there');
select is((select pg_temp.labels(n) from owner_preview, pg_temp.notes(p) n where n ->> 'location_id' = tests.id('tp:B')::text),
  array['ali_wed_b'], 'the Besiktas note lists the shift there');
select is(
  (select n - 'id' - 'shift_ids' from owner_preview, pg_temp.notes(p) n where n ->> 'location_id' = tests.id('tp:K')::text),
  jsonb_build_object('code', 'time_off_pending', 'severity', 'soft', 'overrideable', false, 'tier', 'note',
    'location_id', tests.id('tp:K'), 'location_name', (select l.name from public.locations l where l.id = tests.id('tp:K')),
    'employee_id', tests.id('tp:ali'), 'employee_name', 'Ali Person', 'scheduled_date', tests.week(1) + 2,
    'time_off_request_id', tests.id('tp:ali:leave'), 'time_off_source', 'legacy',
    'message', 'Ali Person has time off waiting for a decision on ' || to_char(tests.week(1) + 2, 'Mon FMDD')),
  'the note says who, where, when and which request, and that it is in the old table');
select ok((select bool_and(length(n ->> 'id') = 64) from owner_preview, pg_temp.notes(p) n), 'each note has a stable id');
select is((select p ->> 'status' from owner_preview), 'publish_ready', 'a note alone leaves the week ready to publish');

-- 2. Scope: Ayse publishes Kadikoy only ---------------------------------------

select is((select array_agg(n ->> 'location_id') from pg_temp.notes(pg_temp.preview('ayse', array['K'])) n),
  array[tests.id('tp:K')::text], 'a manager publishing Kadikoy sees the Kadikoy note only');

-- 3. Publishing: no confirmation asked, nothing recorded ----------------------

select is((select public.publish_schedule_draft_service(tests.user('tp:ayse'), tests.id('tp'), tests.id('tp:draft'),
    array[tests.id('tp:K')], null, true, (select d.revision from public.schedule_drafts d where d.id = tests.id('tp:draft')),
    pg_temp.preview('ayse', array['K']) ->> 'fingerprint', '[]'::jsonb) ->> 'status'),
  'published', 'the week publishes with the note and no decision');
select is((select count(*)::integer from public.schedule_publication_overrides o
  where o.workspace_id = tests.id('tp') and o.finding_code = 'time_off_pending'), 0,
  'a note leaves no confirmation record');
-- Only a note is passed over: a soft finding above that level that nobody can
-- override still asks to be reviewed.
select throws_ok($$select public.weekly_publication_decisions(jsonb_build_object('findings', jsonb_build_array(
    jsonb_build_object('id', 'not-a-note-0001', 'code', 'time_off_pending', 'severity', 'soft', 'overrideable', false, 'tier', 'risk'))),
  '[]'::jsonb)$$,
  '22023', 'Review the current schedule conflicts before publishing', 'a soft finding above a note is not passed over');
-- A finding nobody can override stays unpublishable even with a decision on it (BL-510).
select throws_ok($$select public.weekly_publication_decisions(jsonb_build_object('findings', jsonb_build_array(
    jsonb_build_object('id', 'not-a-note-0002', 'code', 'time_off_pending', 'severity', 'soft', 'overrideable', false, 'tier', 'risk'))),
  jsonb_build_array(jsonb_build_object('finding_id', 'not-a-note-0002')))$$,
  '22023', 'This schedule conflict cannot be overridden', 'a decision does not override what cannot be overridden');

-- 4. Decided requests ---------------------------------------------------------

select public.decide_time_off_service(tests.user('tp:owner'), tests.id('tp'), tests.id('tp:ali:leave'), 'approve', '',
  app_private.time_off_impact(tests.id('tp'), tests.id('tp:ali:leave')) ->> 'fingerprint');
create temp table approved_preview as select pg_temp.preview('owner', array['B']) p;
select is((select count(*)::integer from approved_preview, pg_temp.notes(p)), 0, 'approved time off has no note');
select is((select p ->> 'status' from approved_preview), 'hard_blocked', 'approved time off still blocks the publish');

select tests.remember('tp:emre:leave', tests.leave('tp', 'emre', 1));
select public.decide_time_off_service(tests.user('tp:owner'), tests.id('tp'), tests.id('tp:emre:leave'), 'deny', 'Busy week',
  app_private.time_off_impact(tests.id('tp'), tests.id('tp:emre:leave')) ->> 'fingerprint');
select is((select count(*)::integer from pg_temp.notes(pg_temp.preview('ayse', array['K'])) n
  where n ->> 'employee_id' = tests.id('tp:emre')::text), 0, 'a denied request has no note');

select * from finish();
rollback;
