begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- BILDIRIM-U3 (KARARLAR S-123, S-95, S-126; docs/plan/research/BILDIRIM-URETICILER.md §2.1): Schedule writes its own
-- notices into the new core.
--   (a) a first publish tells everyone with a shift that week, once;
--   (b) a republish tells only the people whose shifts changed, one notice each however much changed;
--       whose shift went to someone else or was opened is told too, and the publish dialog counts them
--       (the preview's affected people, the one rule);
--   (c) a republish that changes nothing tells nobody;
--   (d) the publisher's own shift tells the publisher nothing;
--   (e) taking a week back tells who had shifts in it, once, and says their requests closed;
--   (f) a closed day that removes shifts tells each person once, and the notice stays when the closed
--       day is taken back (BL-883);
--   (g) a scheduled email that stops after three failures tells the rule's owner, once;
--   (h) many recipients are written in one statement (app_private.notify_rows).

select tests.world('nu');
select tests.world('nx');
select tests.person('nu', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('nu', 'ali', 'employee', array['K'], array['cook']);
select tests.person('nu', 'deniz', 'employee', array['K'], array['cook']);
select tests.person('nu', 'emre', 'employee', array['K'], array['cook']);
select tests.person('nx', 'xena', 'employee', array['K'], array['cook']);

create temp table who as
select label, tests.user(label) uid
from unnest(array['nu:owner', 'nu:ayse', 'nu:ali', 'nu:deniz', 'nu:emre', 'nx:owner', 'nx:xena']) label;
-- Who has a notice of this type, one label per notice.
create function pg_temp.told(type_key text) returns text[] language sql stable as $$
  select coalesce(array_agg(w.label order by w.label collate "C"), '{}')
  from public.person_notifications n join who w on w.uid = n.user_id where n.type_key = told.type_key
$$;
create function pg_temp.schedule_notices(person text) returns integer language sql stable as $$
  select count(*)::integer from public.person_notifications n
  where n.user_id = tests.user('nu:' || person) and n.type_key like 'schedule.%'
$$;
-- now() is fixed inside the test's transaction: a notice is found by its type, not its time.
create function pg_temp.latest(person text, type_key text) returns public.person_notifications language sql stable as $$
  select n from public.person_notifications n where n.user_id = tests.user('nu:' || person) and n.type_key = latest.type_key
  order by n.created_at desc, n.id desc limit 1
$$;

create function pg_temp.session(n integer) returns uuid language sql as $$
  select (public.acquire_schedule_edit_session_service(tests.user('nu:owner'), tests.id('nu'), tests.week(n),
    'published'::public.schedule_edit_source, null) -> 'session' ->> 'id')::uuid
$$;
create function pg_temp.revision(session uuid) returns integer language sql as $$
  select e.revision from public.schedule_edit_sessions e where e.id = session
$$;
create function pg_temp.working(session uuid, person text, day integer) returns uuid language sql as $$
  select s.id from public.schedule_edit_session_shifts s join public.schedule_edit_sessions e on e.id = s.session_id
  where s.session_id = session and s.employee_id = tests.id('nu:' || person) and s.scheduled_date = e.week_start + day
$$;
create function pg_temp.rewrite(session uuid, shift uuid, changes jsonb) returns void language plpgsql as $$
declare
  s public.schedule_edit_session_shifts;
  payload jsonb;
begin
  select * into s from public.schedule_edit_session_shifts where id = shift and session_id = session;
  payload := jsonb_build_object(
    'location_id', s.location_id, 'employee_id', s.employee_id, 'job_id', s.job_id,
    'shift_type_id', s.shift_type_id, 'scheduled_date', s.scheduled_date,
    'start_time', to_char(s.start_time, 'HH24:MI'), 'end_time', to_char(s.end_time, 'HH24:MI'),
    'time_basis', s.time_basis, 'time_snapshot', s.time_snapshot, 'time_timezone', s.time_timezone,
    'unpaid_break_minutes', s.unpaid_break_minutes, 'hide_time_on_badge', s.hide_time_on_badge,
    'label_ids', to_jsonb(s.label_ids), 'label_names', to_jsonb(s.label_names), 'note', s.note
  ) || changes;
  perform public.mutate_schedule_edit_shift_service(
    tests.user('nu:owner'), tests.id('nu'), session, pg_temp.revision(session), 'update', shift, s.revision,
    payload || jsonb_build_object('availability_assessment_fingerprint',
      public.assess_schedule_shift_service(tests.user('nu:owner'), tests.id('nu'), payload, shift, session) ->> 'fingerprint'),
    gen_random_uuid());
end;
$$;
create function pg_temp.save(session uuid) returns uuid language sql as $$
  select (public.save_schedule_edit_session_service(tests.user('nu:owner'), tests.id('nu'), session,
    pg_temp.revision(session), 'week ' || substr(gen_random_uuid()::text, 1, 8), null, null) ->> 'id')::uuid
$$;
create function pg_temp.preview(draft uuid) returns jsonb language sql as $$
  select public.preview_schedule_publication_service(tests.user('nu:owner'), tests.id('nu'), draft, array[tests.id('nu:K')], null, true)
$$;
create function pg_temp.publish(draft uuid) returns jsonb language sql as $$
  select public.publish_schedule_draft_service(tests.user('nu:owner'), tests.id('nu'), draft, array[tests.id('nu:K')],
    null, true, (select d.revision from public.schedule_drafts d where d.id = draft), pg_temp.preview(draft) ->> 'fingerprint', '[]'::jsonb)
$$;

-- (a) A first publish -------------------------------------------------------------------------------

select tests.publish_week('nu', 1, '[
  {"label": "ali-tue", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "deniz-wed", "person": "deniz", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}
]');
select is(pg_temp.told('schedule.published'), array['nu:ali', 'nu:deniz'],
  '(a) the first publish tells Ali and Deniz, who have shifts; not Emre, the managers or another workspace');
select ok((pg_temp.latest('ali', 'schedule.published')).title like 'Your schedule for % is out', '(a) saying the week is out');
select is((pg_temp.latest('ali', 'schedule.published')).url, '/app/employee-hub/schedule?view=day&date=' || tests.week(1)::text, '(a) and opening it');
select is(pg_temp.schedule_notices('ali') + pg_temp.schedule_notices('deniz'), 2, '(a) one notice each');

-- (b) A republish -----------------------------------------------------------------------------------

create temp table week_one as select pg_temp.session(1) session;
-- Ali's Tuesday moves an hour, Deniz's Wednesday goes to Emre, and Ali gets a Thursday.
select pg_temp.rewrite((select session from week_one), pg_temp.working((select session from week_one), 'ali', 1),
  '{"start_time": "10:00", "end_time": "16:00"}');
select pg_temp.rewrite((select session from week_one), pg_temp.working((select session from week_one), 'deniz', 2),
  jsonb_build_object('employee_id', tests.id('nu:emre')));
select tests.add_shift(tests.user('nu:owner'), 'nu', (select session from week_one), 1,
  '{"person": "ali", "loc": "K", "job": "cook", "day": 3, "start": "11:00", "end": "16:00"}');
create temp table draft_one as select pg_temp.save((select session from week_one)) draft;
select is((select pg_temp.preview(draft) -> 'locations' -> 0 -> 'affected_employee_ids' from draft_one),
  (select jsonb_agg(x order by x) from unnest(array[tests.id('nu:ali'), tests.id('nu:deniz'), tests.id('nu:emre')]) x),
  '(b) the preview counts Ali, Emre and Deniz, whose shift went to Emre: the publish dialog says three people');
select pg_temp.publish(draft) from draft_one;
select is(pg_temp.told('schedule.shift_changed'), array['nu:ali'], '(b) Ali, whose shift moved and who got another, is told once');
select ok((pg_temp.latest('ali', 'schedule.shift_changed')).title like 'Your schedule for % changed' and (pg_temp.latest('ali', 'schedule.shift_changed')).body = '1 shift changed, 1 new.',
  '(b) one notice that says both');
select is(pg_temp.told('schedule.shift_removed'), array['nu:deniz'], '(b) Deniz, whose shift went to Emre, is told');
select ok((pg_temp.latest('deniz', 'schedule.shift_removed')).title like 'Your % shift was removed', '(b) that it is no longer hers');
select is(pg_temp.told('schedule.shift_added'), array['nu:emre'], '(b) Emre, who got it, is told');
select ok((pg_temp.latest('emre', 'schedule.shift_added')).title like 'New shift: %', '(b) that it is new');
select is(pg_temp.schedule_notices('ali') + pg_temp.schedule_notices('deniz') + pg_temp.schedule_notices('emre'), 5,
  '(b) one notice per person for this publish');
select is((select count(*)::integer from public.person_notifications n join who w on w.uid = n.user_id
           where w.label in ('nu:owner', 'nu:ayse', 'nx:owner', 'nx:xena')), 0, '(b) the managers and another workspace: nothing');

-- (c) Nothing changed -------------------------------------------------------------------------------

select pg_temp.publish(pg_temp.save(pg_temp.session(1)));
select is(pg_temp.schedule_notices('ali') + pg_temp.schedule_notices('deniz') + pg_temp.schedule_notices('emre'), 5,
  '(c) a republish that changes nothing tells nobody');

-- An open shift: Emre's Wednesday is opened.
create temp table week_one_again as select pg_temp.session(1) session;
select pg_temp.rewrite((select session from week_one_again), pg_temp.working((select session from week_one_again), 'emre', 2),
  '{"employee_id": null}');
select pg_temp.publish(pg_temp.save((select session from week_one_again)));
select is(pg_temp.told('schedule.shift_removed'), array['nu:deniz', 'nu:emre'], '(c) Emre, whose shift was opened, is told');

-- (d) The publisher's own shift ---------------------------------------------------------------------

select tests.publish_week_as(tests.user('nu:ayse'), 'nu', 2, '[
  {"label": "ayse-mon", "person": "ayse", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "15:00"},
  {"label": "ali-mon2", "person": "ali", "loc": "K", "job": "cook", "day": 0, "start": "15:00", "end": "21:00"}
]');
select is(pg_temp.told('schedule.published'), array['nu:ali', 'nu:ali', 'nu:deniz'],
  '(d) Ayse publishes a week she works in: Ali is told, Ayse is not');

-- (e) Taken back ------------------------------------------------------------------------------------

select tests.remember('nu:shift:ali-tue-now', (select p.id from public.schedule_published_shifts p
  join public.schedule_location_publications publication on publication.id = p.publication_id and publication.status = 'current'
  where p.employee_id = tests.id('nu:ali') and p.scheduled_date = tests.week(1) + 1));
select tests.cover_case('nu', 'ali-tue-now', 'ali', 'deniz');
select public.unpublish_schedule_service(tests.user('nu:owner'), tests.id('nu'), tests.week(1), array[tests.id('nu:K')],
  public.preview_schedule_unpublication_service(tests.user('nu:owner'), tests.id('nu'), tests.week(1), array[tests.id('nu:K')]) ->> 'fingerprint');
select is(pg_temp.told('schedule.unpublished'), array['nu:ali'],
  '(e) taking week one back tells Ali, who had shifts in it, once; not Emre, whose shift was opened');
select ok((pg_temp.latest('ali', 'schedule.unpublished')).title like 'Your schedule for % was taken back'
          and (pg_temp.latest('ali', 'schedule.unpublished')).body like '%requests for those shifts were closed%',
  '(e) and that his request for that week closed, in the same notice');

-- (f) A closed day ----------------------------------------------------------------------------------

select tests.publish_week('nu', 3, '[
  {"label": "ali-mon3", "person": "ali", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "13:00"},
  {"label": "ali-mon3b", "person": "ali", "loc": "K", "job": "cook", "day": 0, "start": "14:00", "end": "17:00"},
  {"label": "emre-mon3", "person": "emre", "loc": "K", "job": "cook", "day": 0, "start": "13:00", "end": "17:00"}
]');
create function pg_temp.closing_payload() returns jsonb language sql as $$
  select jsonb_build_object('title', 'Thanksgiving', 'body', '', 'category', 'holiday', 'starts_on', tests.week(3),
    'ends_on', tests.week(3), 'on_schedule', true, 'on_important_dates', true,
    'locations', jsonb_build_array(jsonb_build_object('location_id', tests.id('nu:K'), 'day', 'closed')),
    'people', '[]'::jsonb, 'choices', '{}'::jsonb)
$$;
create temp table closing as select public.save_announcement_service(tests.user('nu:owner'), tests.id('nu'), null, null,
  pg_temp.closing_payload() || jsonb_build_object('fingerprint', public.preview_announcement_service(tests.user('nu:owner'), tests.id('nu'),
    null, pg_temp.closing_payload() || '{"intent": "publish"}') ->> 'fingerprint'), 'publish') result;
select is(pg_temp.told('schedule.closed_day_removed_shift'), array['nu:ali', 'nu:emre'],
  '(f) the closed day tells Ali and Emre, whose shifts it removed, once each: Ali''s two shifts are one notice');
select ok((pg_temp.latest('ali', 'schedule.closed_day_removed_shift')).title like '% is closed. Your shifts were removed.', '(f) saying the day is closed');
select public.set_announcement_state_service(tests.user('nu:owner'), tests.id('nu'), (select (result ->> 'announcement_id')::uuid from closing),
  (select a.revision from public.announcements a where a.id = (select (result ->> 'announcement_id')::uuid from closing)), 'unpublish');
select is(pg_temp.told('schedule.closed_day_removed_shift'), array['nu:ali', 'nu:emre'], '(f) taking the closed day back keeps the notices');

-- (g) A scheduled email stops -----------------------------------------------------------------------

select public.create_schedule_export_preset_service(tests.user('nu:ayse'), tests.id('nu'), 'Weekly', '{}'::jsonb);
-- ponytail: stored as it is; there is no builder helper for scheduled exports.
insert into public.scheduled_schedule_exports
  (workspace_id, preset_id, name, recipients, location_ids, day_of_week, send_hour, created_by, updated_by)
values (tests.id('nu'), (select p.id from public.schedule_export_presets p where p.workspace_id = tests.id('nu')),
  'Kitchen week', '["books@example.test"]'::jsonb, array[tests.id('nu:K')], 1, 9, tests.user('nu:ayse'), tests.user('nu:owner'));
create function pg_temp.fail_a_week() returns void language sql as $$
  update public.scheduled_schedule_exports set last_failed_at = last_failed_at - interval '7 days' where workspace_id = tests.id('nu');
  select public.record_schedule_export_schedule_failure_service(tests.id('nu'),
    (select s.id from public.scheduled_schedule_exports s where s.workspace_id = tests.id('nu')), 'Not delivered');
$$;
select pg_temp.fail_a_week();
select pg_temp.fail_a_week();
select is(pg_temp.told('schedule.export_email_stopped'), '{}'::text[], '(g) two failed weeks: nothing yet');
select pg_temp.fail_a_week();
select is(pg_temp.told('schedule.export_email_stopped'), array['nu:ayse'], '(g) the third stops it and tells Ayse, who set it up');
select pg_temp.fail_a_week();
select is(pg_temp.told('schedule.export_email_stopped'), array['nu:ayse'], '(g) once');

-- (h) One statement for many ------------------------------------------------------------------------

select is(app_private.notify_rows(tests.id('nu'), tests.user('nu:owner'), jsonb_build_array(
    jsonb_build_object('type', 'schedule.published', 'user_id', tests.user('nu:ayse'), 'event_key', 'h:1', 'title', 'A'),
    jsonb_build_object('type', 'schedule.published', 'user_id', tests.user('nu:ayse'), 'event_key', 'h:1', 'title', 'A again'),
    jsonb_build_object('type', 'schedule.shift_added', 'user_id', tests.user('nu:deniz'), 'event_key', 'h:1', 'title', 'B'),
    jsonb_build_object('type', 'schedule.published', 'user_id', tests.user('nu:owner'), 'event_key', 'h:1', 'title', 'C'),
    jsonb_build_object('type', 'schedule.published', 'user_id', tests.user('nx:xena'), 'event_key', 'h:1', 'title', 'D'))),
  2, '(h) rows of different types in one call: one per person and event, never the actor, members only');
select throws_ok($$select app_private.notify_rows(tests.id('nu'), null,
    jsonb_build_array(jsonb_build_object('type', 'schedule.published', 'user_id', tests.user('nu:ayse'), 'event_key', 'h:2', 'title', ' ')))$$,
  '22023', 'a title is required', '(h) the same refusals as one notice');

select * from finish();
rollback;
