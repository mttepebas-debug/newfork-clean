begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- BL-158: a manager tags a shift "On call" on the Schedule screen, saves and
-- publishes. The published shift keeps the tag: the employee sees it on their
-- week and the other location's manager sees it on the ghost card. The week goes
-- out on the real path: open editing, add the tagged shift, save, preview, publish.

select tests.world('lb');
select tests.person('lb', 'ada', 'employee', array['K'], array['cook']);
select tests.as_browser(tests.user('lb:owner'), format(
  $sql$insert into public.shift_labels (id, workspace_id, name) values (%L, %L, 'On call')$sql$,
  tests.remember('lb:label:on-call', gen_random_uuid()), tests.id('lb')));

select tests.remember('lb:draft', tests.publish_week('lb', 1, jsonb_build_array(jsonb_build_object(
  'label', 'ada-tue', 'person', 'ada', 'loc', 'K', 'job', 'cook', 'day', 1, 'start', '09:00', 'end', '15:00',
  'label_ids', jsonb_build_array(tests.id('lb:label:on-call')), 'label_names', jsonb_build_array('On call')))));

create temp table lb_draft as
select label_ids, label_names from public.schedule_draft_shifts where draft_id = tests.id('lb:draft');

select is((select label_names from lb_draft), array['On call'], 'the saved draft shift is on call');
select is((select label_ids from public.schedule_published_shifts where id = tests.id('lb:shift:ada-tue')),
  (select label_ids from lb_draft), 'the published shift carries the draft shift''s label ids');
select is((select label_names from public.schedule_published_shifts where id = tests.id('lb:shift:ada-tue')),
  (select label_names from lb_draft), 'the published shift carries the draft shift''s label names');

-- A publish of the shifts with no department leaves the Kitchen shift as it was
-- published: the new publication carries it over, tag included.
create temp table lb_scope as
select public.preview_schedule_publication_service(tests.user('lb:owner'), tests.id('lb'), tests.id('lb:draft'),
  array[tests.id('lb:K')], '{}'::uuid[], true) as preview;
select public.publish_schedule_draft_service(tests.user('lb:owner'), tests.id('lb'), tests.id('lb:draft'),
  array[tests.id('lb:K')], '{}'::uuid[], true,
  (select revision from public.schedule_drafts where id = tests.id('lb:draft')),
  (select preview ->> 'fingerprint' from lb_scope), '[]'::jsonb);
select tests.settle();

create temp table lb_carried as
select shift.id, shift.label_ids, shift.label_names from public.schedule_published_shifts shift
join public.schedule_location_publications publication on publication.id = shift.publication_id
where publication.location_id = tests.id('lb:K') and publication.status = 'current'
  and shift.employee_id = tests.id('lb:ada');

select isnt((select id from lb_carried), tests.id('lb:shift:ada-tue'), 'the Kitchen shift was carried into the new publication');
select is((select array[label_ids::text, label_names::text] from lb_carried),
  (select array[label_ids::text, label_names::text] from lb_draft), 'the carried shift is still on call');

select * from finish();
rollback;
