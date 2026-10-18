begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- BL-158: a manager tags a shift "On call" on the Schedule screen, saves and
-- publishes. The tag stays with the shift wherever the shift is copied: into
-- the published week, into the next publication, into an edit opened from the
-- published week or from a draft, into a recovered draft, and into an edit a
-- shift swap recovery brings the shift back to. The employee sees it on their
-- week and another location's manager on the ghost card.

select tests.world('lb');
-- The owner works here too (ROL-CIFT: the employee side needs the employee slot).
select tests.employee_slot('lb', 'owner');
select tests.person('lb', 'ada', 'employee', array['K'], array['cook']);
select tests.person('lb', 'bob', 'employee', array['K'], array['cook']);
select tests.person('lb', 'mia', 'manager', array['K'], array['cook']);
select tests.as_browser(tests.user('lb:owner'), format(
  $sql$insert into public.shift_labels (id, workspace_id, name) values (%L, %L, 'On call')$sql$,
  tests.remember('lb:label:on-call', gen_random_uuid()), tests.id('lb')));
select tests.settle();

-- Save and publish: open editing, add the tagged shift, save, preview, publish.
select tests.remember('lb:draft', tests.publish_week('lb', 1, jsonb_build_array(
  jsonb_build_object('label', 'ada-tue', 'person', 'ada', 'loc', 'K', 'job', 'cook', 'day', 1, 'start', '09:00', 'end', '15:00',
    'label_ids', jsonb_build_array(tests.id('lb:label:on-call')), 'label_names', jsonb_build_array('On call')),
  jsonb_build_object('label', 'bob-wed', 'person', 'bob', 'loc', 'K', 'job', 'cook', 'day', 2, 'start', '09:00', 'end', '15:00'))));

create temp table lb_draft as
select label_ids, label_names from public.schedule_draft_shifts
where draft_id = tests.id('lb:draft') and employee_id = tests.id('lb:ada');

-- The published week of Kadikoy as it stands now, and Ada's shift in it.
create function pg_temp.ada_published() returns public.schedule_published_shifts language sql as $$
  select shift from public.schedule_published_shifts shift
  join public.schedule_location_publications publication on publication.id = shift.publication_id
  where publication.location_id = tests.id('lb:K') and publication.status = 'current'
    and shift.employee_id = tests.id('lb:ada')
$$;
create function pg_temp.tags(ids uuid[], names text[]) returns text[] language sql as $$
  select array[ids::text, names::text]
$$;
create function pg_temp.on_call() returns text[] language sql as $$
  select pg_temp.tags(label_ids, label_names) from lb_draft
$$;

select is((select label_names from lb_draft), array['On call'], 'the saved draft shift is on call');
select is((select label_ids from public.schedule_published_shifts where id = tests.id('lb:shift:ada-tue')),
  (select label_ids from lb_draft), 'the published shift carries the draft shift''s label ids');
select is((select label_names from public.schedule_published_shifts where id = tests.id('lb:shift:ada-tue')),
  (select label_names from lb_draft), 'the published shift carries the draft shift''s label names');

-- A publish of the shifts with no department leaves the Kitchen shifts as they
-- were published: the new publication carries them over, tags included.
create temp table lb_scope as
select public.preview_schedule_publication_service(tests.user('lb:owner'), tests.id('lb'), tests.id('lb:draft'),
  array[tests.id('lb:K')], '{}'::uuid[], true) as preview;
select public.publish_schedule_draft_service(tests.user('lb:owner'), tests.id('lb'), tests.id('lb:draft'),
  array[tests.id('lb:K')], '{}'::uuid[], true,
  (select revision from public.schedule_drafts where id = tests.id('lb:draft')),
  (select preview ->> 'fingerprint' from lb_scope), '[]'::jsonb);
select tests.settle();

select isnt((pg_temp.ada_published()).id, tests.id('lb:shift:ada-tue'), 'Ada''s shift was carried into the new publication');
select is(pg_temp.tags((pg_temp.ada_published()).label_ids, (pg_temp.ada_published()).label_names), pg_temp.on_call(),
  'the carried shift is still on call');

-- The owner opens the published week with Edit, moves Bob's end to 16:00,
-- saves and publishes again. Ada's shift was never touched: it stays on call.
create temp table lb_edit (session uuid, draft uuid);
insert into lb_edit (session) select (public.acquire_schedule_edit_session_service(
  tests.user('lb:owner'), tests.id('lb'), tests.week(1), 'published', null, array[tests.id('lb:K')]) -> 'session' ->> 'id')::uuid;
select tests.settle();

select is((select pg_temp.tags(shift.label_ids, shift.label_names) from public.schedule_edit_session_shifts shift, lb_edit
  where shift.session_id = lb_edit.session and shift.employee_id = tests.id('lb:ada')), pg_temp.on_call(),
  'an edit opened from the published week shows Ada''s shift on call');

create function pg_temp.move_bob(actor uuid, session uuid, new_end text) returns void language plpgsql as $$
declare shift public.schedule_edit_session_shifts; payload jsonb;
begin
  select * into shift from public.schedule_edit_session_shifts s
  where s.session_id = move_bob.session and s.employee_id = tests.id('lb:bob');
  payload := to_jsonb(shift) || jsonb_build_object('end_time', new_end);
  perform public.mutate_schedule_edit_shift_service(actor, tests.id('lb'), session,
    (select e.revision from public.schedule_edit_sessions e where e.id = move_bob.session), 'update', shift.id, shift.revision,
    payload || jsonb_build_object('availability_assessment_fingerprint',
      public.assess_schedule_shift_service(actor, tests.id('lb'), payload, shift.id, session) ->> 'fingerprint'),
    gen_random_uuid());
  perform tests.settle();
end $$;
select pg_temp.move_bob(tests.user('lb:owner'), session, '16:00') from lb_edit;

update lb_edit set draft = (public.save_schedule_edit_session_service(tests.user('lb:owner'), tests.id('lb'), session,
  (select e.revision from public.schedule_edit_sessions e where e.id = lb_edit.session), 'Rework') ->> 'id')::uuid;
select tests.settle();
create temp table lb_rework as
select public.preview_schedule_publication_service(tests.user('lb:owner'), tests.id('lb'), draft,
  array[tests.id('lb:K')], null, true) as preview from lb_edit;
select public.publish_schedule_draft_service(tests.user('lb:owner'), tests.id('lb'), draft, array[tests.id('lb:K')], null, true,
  (select revision from public.schedule_drafts d where d.id = lb_edit.draft), (select preview ->> 'fingerprint' from lb_rework), '[]'::jsonb)
from lb_edit;
select tests.settle();

select is((select shift.end_time from public.schedule_published_shifts shift
  join public.schedule_location_publications publication on publication.id = shift.publication_id
  where publication.status = 'current' and publication.location_id = tests.id('lb:K') and shift.employee_id = tests.id('lb:bob')),
  '16:00'::time, 'the re-edited week went out: Bob ends at 16:00');
select is(pg_temp.tags((pg_temp.ada_published()).label_ids, (pg_temp.ada_published()).label_names), pg_temp.on_call(),
  'after the re-edit is saved and published, Ada''s shift is still on call');

-- The owner opens the saved draft with Edit, moves Bob again and walks away.
update lb_edit set session = (public.acquire_schedule_edit_session_service(
  tests.user('lb:owner'), tests.id('lb'), tests.week(1), 'draft', draft, array[tests.id('lb:K')]) -> 'session' ->> 'id')::uuid;
select tests.settle();
select is((select pg_temp.tags(shift.label_ids, shift.label_names) from public.schedule_edit_session_shifts shift, lb_edit
  where shift.session_id = lb_edit.session and shift.employee_id = tests.id('lb:ada')), pg_temp.on_call(),
  'an edit opened from a draft shows Ada''s shift on call');
select pg_temp.move_bob(tests.user('lb:owner'), session, '17:00') from lb_edit;

-- ponytail: the lease runs out by hand; a transaction cannot wait four minutes.
update public.schedule_edit_sessions set expires_at = now() - interval '1 minute'
where id = (select session from lb_edit);

-- Mia opens the same draft: the owner's unsaved edit becomes a recovered draft.
create temp table lb_recovered as
select (public.acquire_schedule_edit_session_service(
  tests.user('lb:mia'), tests.id('lb'), tests.week(1), 'draft', draft, array[tests.id('lb:K')]) ->> 'recovered_draft_id')::uuid as draft
from lb_edit;
select tests.settle();
select is((select pg_temp.tags(shift.label_ids, shift.label_names) from public.schedule_draft_shifts shift, lb_recovered
  where shift.draft_id = lb_recovered.draft and shift.employee_id = tests.id('lb:ada')), pg_temp.on_call(),
  'the recovered draft keeps Ada''s shift on call');

-- The owner starts a blank edit of the week with one shift of Bob's. Meanwhile
-- Ada's shift is covered by Bob and approved. The owner reviews the swap and
-- takes the published shift into the edit: it comes in on call.
create temp table lb_blank as
select (public.acquire_schedule_edit_session_service(
  tests.user('lb:owner'), tests.id('lb'), tests.week(1), 'blank', null, array[tests.id('lb:K')]) -> 'session' ->> 'id')::uuid as session;
select tests.settle();
select tests.add_shift(tests.user('lb:owner'), 'lb', session, 1,
  '{"person": "bob", "loc": "K", "job": "cook", "day": 4, "start": "09:00", "end": "15:00"}') from lb_blank;
select tests.settle();
-- ponytail: the edit was opened before the swap; in one transaction both carry the same now().
update public.schedule_edit_sessions set created_at = now() - interval '1 minute' where id = (select session from lb_blank);

select tests.remember('lb:shift:ada-now', (pg_temp.ada_published()).id);
select tests.cover_case('lb', 'ada-now', 'ada', 'bob');
select public.shift_exchanges_command_service(tests.user('lb:owner'), tests.id('lb'), jsonb_build_object(
  'action', 'approve', 'case_id', tests.id('lb:case:ada-now'), 'application_id', tests.id('lb:application:ada-now'),
  'expected_revision', (select c.revision from public.shift_exchange_cases c where c.id = tests.id('lb:case:ada-now')),
  'fingerprint', public.shift_exchange_preview(tests.user('lb:owner'), tests.id('lb'), tests.id('lb:case:ada-now'),
    tests.id('lb:application:ada-now')) ->> 'fingerprint'), gen_random_uuid());
select tests.settle();

select public.shift_exchange_schedule_recovery_service(tests.user('lb:owner'), tests.id('lb'), session,
  public.shift_exchange_schedule_recovery_service(tests.user('lb:owner'), tests.id('lb'), session) ->> 'fingerprint',
  gen_random_uuid())
from lb_blank;
select tests.settle();

select is((select count(*)::integer from public.schedule_edit_session_shifts shift, lb_blank
  where shift.session_id = lb_blank.session and shift.source_published_shift_id = tests.id('lb:shift:ada-now')), 1,
  'the swap review brings the covered shift into the blank edit');
select is((select pg_temp.tags(shift.label_ids, shift.label_names) from public.schedule_edit_session_shifts shift, lb_blank
  where shift.session_id = lb_blank.session and shift.source_published_shift_id = tests.id('lb:shift:ada-now')), pg_temp.on_call(),
  'the covered shift comes into the edit on call');

select * from finish();
rollback;
