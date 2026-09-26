begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- BL-164: a shift's tags come from Settings > Shift labels. A manager who
-- skips the browser and sends a made-up tag name, a tag id nobody made, another
-- workspace's tag or an archived tag gets nothing onto the week: the name
-- shown is the catalog's, the others are refused. A tag archived after a shift
-- got it stays on that shift as it was.
-- BL-167: a swapped shift the swap review brings into an open edit (Schedule,
-- editing, after an approved swap) comes in with its note, "hide time" and tags.

select tests.world('lc');
select tests.world('lx');
select tests.person('lc', 'ada', 'employee', array['K'], array['cook']);
select tests.person('lc', 'bob', 'employee', array['K'], array['cook']);
select tests.person('lc', 'max', 'manager', array['K'], array['cook']);
select tests.shift_label('lc', 'On call');
select tests.shift_label('lc', 'Standby');
select tests.shift_label('lx', 'On call');

-- BL-167. Week 1 goes out with Ada's Tuesday: a note, the time hidden on the
-- badge and the "On call" tag.
select tests.publish_week('lc', 1, jsonb_build_array(
  jsonb_build_object('label', 'ada-tue', 'person', 'ada', 'loc', 'K', 'job', 'cook', 'day', 1, 'start', '09:00', 'end', '15:00',
    'note', 'Bring the keys', 'hide_time_on_badge', true,
    'label_ids', jsonb_build_array(tests.id('lc:label:on call')), 'label_names', jsonb_build_array('On call'))));
select is((select row(note, hide_time_on_badge)::text from public.schedule_published_shifts where id = tests.id('lc:shift:ada-tue')),
  row('Bring the keys', true)::text, 'the published shift carries its note and hidden time');

-- The owner starts a blank edit of the week with one shift of Bob's.
create temp table lc_owner as
select (public.acquire_schedule_edit_session_service(tests.user('lc:owner'), tests.id('lc'), tests.week(1), 'blank', null,
  array[tests.id('lc:K')]) -> 'session' ->> 'id')::uuid as session;
select tests.settle();
select tests.add_shift(tests.user('lc:owner'), 'lc', session, 1,
  '{"person": "bob", "loc": "K", "job": "cook", "day": 4, "start": "09:00", "end": "15:00"}') from lc_owner;
select tests.settle();
-- ponytail: the edit was opened before the swap; in one transaction both carry the same now().
update public.schedule_edit_sessions set created_at = now() - interval '1 minute' where id = (select session from lc_owner);

-- Bob covers Ada's Tuesday; the owner approves, then takes the swap review.
create temp table lc_case as
select tests.cover_case('lc', 'ada-tue', 'ada', 'bob') as opened;
select public.shift_exchanges_command_service(tests.user('lc:owner'), tests.id('lc'), jsonb_build_object(
  'action', 'approve', 'case_id', opened, 'application_id', tests.id('lc:application:ada-tue'),
  'expected_revision', (select c.revision from public.shift_exchange_cases c where c.id = opened),
  'fingerprint', public.shift_exchange_preview(tests.user('lc:owner'), tests.id('lc'), opened,
    tests.id('lc:application:ada-tue')) ->> 'fingerprint'), gen_random_uuid())
from lc_case;
select tests.settle();
select public.shift_exchange_schedule_recovery_service(tests.user('lc:owner'), tests.id('lc'), session,
  public.shift_exchange_schedule_recovery_service(tests.user('lc:owner'), tests.id('lc'), session) ->> 'fingerprint',
  gen_random_uuid())
from lc_owner;
select tests.settle();

select is((select row(shift.note, shift.hide_time_on_badge, shift.label_ids, shift.label_names)::text
    from public.schedule_edit_session_shifts shift, lc_owner
    where shift.session_id = lc_owner.session and shift.employee_id = tests.id('lc:bob') and shift.scheduled_date = tests.week(1) + 1),
  (select row(p.note, p.hide_time_on_badge, p.label_ids, p.label_names)::text
    from public.schedule_published_shifts p
    join public.schedule_location_publications publication on publication.id = p.publication_id
    where publication.status = 'current' and p.employee_id = tests.id('lc:bob') and p.scheduled_date = tests.week(1) + 1),
  'the swapped shift comes into the edit with its note, hidden time and tag');

-- BL-164. Max, manager of Kadikoy, skips the browser on week 2.
create temp table lc_max as
select (public.acquire_schedule_edit_session_service(tests.user('lc:max'), tests.id('lc'), tests.week(2), 'blank', null,
  array[tests.id('lc:K')]) -> 'session' ->> 'id')::uuid as session;
select tests.settle();
create function pg_temp.max_adds(day integer, label_ids jsonb, label_names jsonb) returns uuid language sql as $$
  select tests.add_shift(tests.user('lc:max'), 'lc', (select session from lc_max), 2, jsonb_build_object(
    'person', 'ada', 'loc', 'K', 'job', 'cook', 'day', day, 'start', '09:00', 'end', '12:00',
    'label_ids', label_ids, 'label_names', label_names))
$$;
create function pg_temp.max_tags(shift_id uuid) returns text language sql as $$
  select row(shift.label_ids, shift.label_names)::text from public.schedule_edit_session_shifts shift where shift.id = shift_id
$$;

select is(pg_temp.max_tags(pg_temp.max_adds(0, jsonb_build_array(tests.id('lc:label:on call')), '["Free pizza"]')),
  row(array[tests.id('lc:label:on call')], array['On call'])::text,
  'a made-up tag name is not written: the shift shows the catalog''s name');
select throws_ok(format('select pg_temp.max_adds(1, %L, ''["On call"]'')', jsonb_build_array(gen_random_uuid())),
  '23503', 'invalid shift reference', 'a tag id nobody made is refused');
select throws_ok(format('select pg_temp.max_adds(4, %L, ''["On call"]'')', jsonb_build_array(tests.id('lx:label:on call'))),
  '23503', 'invalid shift reference', 'another workspace''s tag is refused');

-- A Standby shift, then the owner renames Standby to Backup and archives it.
select tests.remember('lc:standby-shift', pg_temp.max_adds(2, jsonb_build_array(tests.id('lc:label:standby')), '["Standby"]'));
select tests.as_browser(tests.user('lc:owner'), format(
  $sql$update public.shift_labels set name = 'Backup', archived_at = now() where id = %L$sql$, tests.id('lc:label:standby')));

select throws_ok(format('select pg_temp.max_adds(3, %L, ''["Backup"]'')', jsonb_build_array(tests.id('lc:label:standby'))),
  '23503', 'invalid shift reference', 'an archived tag is refused on a new shift');

-- Max moves the Standby shift's end; the browser sends the tags back as they were.
create function pg_temp.max_moves(shift_id uuid) returns void language plpgsql as $$
declare shift public.schedule_edit_session_shifts; payload jsonb; session uuid := (select s.session from lc_max s);
begin
  select * into shift from public.schedule_edit_session_shifts s where s.id = shift_id;
  payload := to_jsonb(shift) || jsonb_build_object('end_time', '13:00');
  perform public.mutate_schedule_edit_shift_service(tests.user('lc:max'), tests.id('lc'), session,
    (select e.revision from public.schedule_edit_sessions e where e.id = session), 'update', shift.id, shift.revision,
    payload || jsonb_build_object('availability_assessment_fingerprint',
      public.assess_schedule_shift_service(tests.user('lc:max'), tests.id('lc'), payload, shift.id, session) ->> 'fingerprint'),
    gen_random_uuid());
end $$;
select pg_temp.max_moves(tests.id('lc:standby-shift'));
select is(pg_temp.max_tags(tests.id('lc:standby-shift')),
  row(array[tests.id('lc:label:standby')], array['Standby'])::text,
  'a tag archived after the shift got it stays on that shift as it was');

-- Max saves; the owner publishes the week. The made-up name never reaches it.
create temp table lc_week2 as
select (public.save_schedule_edit_session_service(tests.user('lc:max'), tests.id('lc'), session,
  (select e.revision from public.schedule_edit_sessions e where e.id = lc_max.session), 'Week 2') ->> 'id')::uuid as draft
from lc_max;
select tests.settle();
create temp table lc_week2_preview as
select public.preview_schedule_publication_service(tests.user('lc:owner'), tests.id('lc'), draft,
  array[tests.id('lc:K')], null, true) as preview from lc_week2;
select public.publish_schedule_draft_service(tests.user('lc:owner'), tests.id('lc'), draft, array[tests.id('lc:K')], null, true,
  (select revision from public.schedule_drafts d where d.id = lc_week2.draft), (select preview ->> 'fingerprint' from lc_week2_preview), '[]'::jsonb)
from lc_week2;
select tests.settle();
select is((select array_agg(distinct name order by name) from public.schedule_published_shifts shift
  join public.schedule_location_publications publication on publication.id = shift.publication_id,
  unnest(shift.label_names) name
  where publication.status = 'current' and publication.location_id = tests.id('lc:K')
    and shift.scheduled_date between tests.week(2) and tests.week(2) + 6),
  array['On call', 'Standby'], 'the published week carries only catalog names');

select * from finish();
rollback;
