begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- BL-326 (EKRAN-01 DB-4): a draft publishes only the locations it covers.
-- Ayse manages Kadikoy only, so her draft covers Kadikoy; the owner asking it
-- to publish Besiktas too would replace Besiktas's week with nothing, so both
-- the preview and the publish refuse it. Locks a rule that already holds (39855536).

select tests.world('pd');
select tests.person('pd', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('pd', 'ali', 'employee', array['K', 'B'], array['cook']);

create temp table pd_state (session uuid, draft uuid);
insert into pd_state (session) select (public.acquire_schedule_edit_session_service(tests.user('pd:ayse'), tests.id('pd'),
  tests.week(1), 'blank', null) -> 'session' ->> 'id')::uuid;
select tests.add_shift(tests.user('pd:ayse'), 'pd', (select session from pd_state), 1,
  '{"person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "13:00"}'::jsonb);
update pd_state set draft = (public.save_schedule_edit_session_service(tests.user('pd:ayse'), tests.id('pd'), session,
  (select e.revision from public.schedule_edit_sessions e where e.id = session), 'kadikoy only', null, null) ->> 'id')::uuid;

select is((select d.location_ids from public.schedule_drafts d join pd_state on d.id = pd_state.draft),
  array[tests.id('pd:K')], 'the draft covers Kadikoy only');

select throws_ok($$select public.preview_schedule_publication_service(tests.user('pd:owner'), tests.id('pd'),
    (select draft from pd_state), array[tests.id('pd:K'), tests.id('pd:B')], null, true)$$,
  '22023', 'publication location is not in this draft', 'the preview refuses Besiktas, which the draft does not cover');

select throws_ok($$select public.publish_schedule_draft_service(tests.user('pd:owner'), tests.id('pd'),
    (select draft from pd_state), array[tests.id('pd:B')], null, true,
    (select d.revision from public.schedule_drafts d join pd_state on d.id = pd_state.draft), repeat('0', 64), '[]'::jsonb)$$,
  '22023', 'publication location is not in this draft', 'the publish refuses it too');

select lives_ok($$select public.preview_schedule_publication_service(tests.user('pd:owner'), tests.id('pd'),
    (select draft from pd_state), array[tests.id('pd:K')], null, true)$$, 'Kadikoy previews as usual');

select * from finish();
rollback;
