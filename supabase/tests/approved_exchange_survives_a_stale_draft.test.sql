begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- BL-198: an approved shift change is never undone by publishing a draft that
-- missed it. Ali's Tuesday and Deniz's Wednesday shifts at Kadikoy are
-- published; they swap and Ayse approves. A draft that still gives Tuesday to
-- somebody other than Deniz (the old owner, or anybody else), or that leaves
-- out a shift the swap moved, is a blocker in the pre-flight check and the
-- publish refuses it. Once a publication carries the swap, later changes are
-- ordinary edits again.

select tests.world('sd');
select tests.person('sd', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('sd', 'ali', 'employee', array['K'], array['cook']);
select tests.person('sd', 'deniz', 'employee', array['K'], array['cook']);
select tests.person('sd', 'emre', 'employee', array['K'], array['cook']);
select tests.remember('sd:draft:first', tests.publish_week('sd', 1, '[
  {"label": "ali-tue", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"label": "deniz-wed", "person": "deniz", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}
]'));
-- ponytail: one transaction has one now(); the first publication moves an
-- hour back so the swap below is approved after it, as it would be for real.
update public.schedule_location_publications set published_at = published_at - interval '1 hour'
where workspace_id = tests.id('sd');

create temporary table sd (key text primary key, value jsonb);
create function pg_temp.command(person text, command jsonb) returns jsonb language sql as $$
  select public.shift_exchanges_command_service(tests.user('sd:' || person), tests.id('sd'), command, gen_random_uuid())
$$;
create function pg_temp.case_id() returns uuid language sql as $$
  select (value ->> 'case_id')::uuid from sd where key = 'created'
$$;
create function pg_temp.application_id() returns uuid language sql as $$
  select a.id from public.shift_exchange_applications a where a.case_id = pg_temp.case_id()
$$;
create function pg_temp.revision() returns integer language sql as $$
  select c.revision from public.shift_exchange_cases c where c.id = pg_temp.case_id()
$$;
-- The draft row behind a published shift of the first publication.
create function pg_temp.draft_row(label text) returns uuid language sql as $$
  select source_shift_id from public.schedule_published_shifts where id = tests.id('sd:shift:' || label)
$$;
create function pg_temp.preview(draft uuid) returns jsonb language sql as $$
  select public.preview_schedule_publication_service(tests.user('sd:ayse'), tests.id('sd'), draft, array[tests.id('sd:K')], null, true)
$$;
create function pg_temp.publish(draft uuid) returns jsonb language sql as $$
  select public.publish_schedule_draft_service(tests.user('sd:ayse'), tests.id('sd'), draft, array[tests.id('sd:K')], null, true,
    (select d.revision from public.schedule_drafts d where d.id = draft), pg_temp.preview(draft) ->> 'fingerprint', '[]'::jsonb)
$$;
create function pg_temp.undone(preview jsonb) returns jsonb language sql as $$
  select coalesce(jsonb_agg(f order by f ->> 'scheduled_date'), '[]') from jsonb_array_elements(preview -> 'findings') f
  where f ->> 'code' = 'shift_exchange_undone'
$$;
create function pg_temp.tuesday_holder() returns uuid language sql as $$
  select s.employee_id from public.schedule_published_shifts s
  join public.schedule_location_publications p on p.id = s.publication_id and p.status = 'current'
  where s.workspace_id = tests.id('sd') and s.scheduled_date = tests.week(1) + 1
$$;

-- Ali and Deniz swap; Ayse approves.
insert into sd values ('created', pg_temp.command('ali', jsonb_build_object(
  'action', 'create', 'kind', 'swap',
  'shift_id', tests.id('sd:shift:ali-tue'), 'requested_shift_id', tests.id('sd:shift:deniz-wed'))));
select tests.settle();
select pg_temp.command('deniz', jsonb_build_object('action', 'accept', 'case_id', pg_temp.case_id(),
  'application_id', pg_temp.application_id(), 'expected_revision', pg_temp.revision()));
select tests.settle();
select pg_temp.command('ayse', jsonb_build_object('action', 'approve', 'case_id', pg_temp.case_id(),
  'application_id', pg_temp.application_id(), 'expected_revision', pg_temp.revision(),
  'fingerprint', public.shift_exchange_preview(tests.user('sd:ayse'), tests.id('sd'), pg_temp.case_id(), pg_temp.application_id()) ->> 'fingerprint'));
select tests.settle();
select is(pg_temp.tuesday_holder(), tests.id('sd:deniz'), 'the approved swap gives Tuesday to Deniz');

-- 1. The draft the swap reached has nothing to say about it.
select is(pg_temp.undone(pg_temp.preview(tests.id('sd:draft:first'))), '[]'::jsonb,
  'a draft that carries the swap has no swap blocker');

-- 2. The same draft saved again from a screen that missed the swap, with
-- Tuesday given to Emre.
update public.schedule_draft_shifts set employee_id = tests.id('sd:emre') where id = pg_temp.draft_row('ali-tue');
insert into sd select 'stale', pg_temp.preview(tests.id('sd:draft:first'));
select is(jsonb_array_length(pg_temp.undone(value)), 1, 'a stale draft giving the swapped shift to a third person is one finding')
from sd where key = 'stale';
select is(value ->> 'status', 'hard_blocked', 'and it blocks the publish') from sd where key = 'stale';
select is(
  (select jsonb_build_object('severity', f ->> 'severity', 'overrideable', f -> 'overrideable', 'tier', f ->> 'tier',
    'from', f ->> 'from_employee_id', 'to', f ->> 'to_employee_id', 'draft_employee', f ->> 'draft_employee_id',
    'date', f ->> 'scheduled_date', 'start', f ->> 'start_time', 'end', f ->> 'end_time', 'kind', f ->> 'exchange_kind')
   from sd, jsonb_array_elements(pg_temp.undone(value)) f where key = 'stale'),
  jsonb_build_object('severity', 'hard', 'overrideable', false, 'tier', 'blocker',
    'from', tests.id('sd:ali'), 'to', tests.id('sd:deniz'), 'draft_employee', tests.id('sd:emre'),
    'date', tests.week(1) + 1, 'start', '09:00:00', 'end', '15:00:00', 'kind', 'swap'),
  'the finding says who had the shift, who has it now, who the draft gives it to, and when');
select throws_ok($$select pg_temp.publish(tests.id('sd:draft:first'))$$, '23514', 'schedule has hard publication blockers',
  'publishing the stale draft is refused');

-- 3. A new draft written after the swap from what Ayse remembered: Ali on
-- Tuesday, nothing on Wednesday. Both swapped shifts would be undone.
select tests.remember('sd:session:fresh', (public.acquire_schedule_edit_session_service(
  tests.user('sd:ayse'), tests.id('sd'), tests.week(1), 'blank', null) -> 'session' ->> 'id')::uuid);
select tests.add_shift(tests.user('sd:ayse'), 'sd', tests.id('sd:session:fresh'), 1,
  '{"person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}');
select tests.remember('sd:draft:fresh', (public.save_schedule_edit_session_service(tests.user('sd:ayse'), tests.id('sd'),
  tests.id('sd:session:fresh'), (select revision from public.schedule_edit_sessions where id = tests.id('sd:session:fresh')),
  'from memory', null, null) ->> 'id')::uuid);
select is(
  (select jsonb_agg(f ->> 'draft_employee_id' order by f ->> 'scheduled_date') from jsonb_array_elements(pg_temp.undone(pg_temp.preview(tests.id('sd:draft:fresh')))) f),
  jsonb_build_array(tests.id('sd:ali'), null),
  'a draft made after the swap is judged too: Tuesday back to Ali, and Wednesday left out'
);
select throws_ok($$select pg_temp.publish(tests.id('sd:draft:fresh'))$$, '23514', 'schedule has hard publication blockers',
  'publishing it is refused');
select is(pg_temp.tuesday_holder(), tests.id('sd:deniz'), 'Deniz still has Tuesday');

-- 4. Ayse takes the swap into the first draft and publishes it.
update public.schedule_draft_shifts set employee_id = tests.id('sd:deniz') where id = pg_temp.draft_row('ali-tue');
select lives_ok($$select pg_temp.publish(tests.id('sd:draft:first'))$$, 'a draft that keeps the swap publishes');
select is(pg_temp.tuesday_holder(), tests.id('sd:deniz'), 'and Deniz keeps Tuesday');

-- 5. The swap is now in a publication: giving Tuesday to Emre is an ordinary change.
update public.schedule_draft_shifts set employee_id = tests.id('sd:emre') where id = pg_temp.draft_row('ali-tue');
select is(pg_temp.undone(pg_temp.preview(tests.id('sd:draft:first'))), '[]'::jsonb,
  'after a publication carried the swap, a later change is no swap blocker');

select * from finish();
rollback;
