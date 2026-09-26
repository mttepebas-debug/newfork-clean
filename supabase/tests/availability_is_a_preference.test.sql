begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

-- BL-186 (user decision 2026-09-26): an availability mark is a preference,
-- never a block. The employee's own mark and a manager's private reminder
-- behave the same: a warning on the shift, never a refusal, on every path
-- that writes a shift. Publish lists the warnings and the publisher
-- acknowledges the new or changed ones; that acknowledgment is recorded in
-- the publisher's name. Approved time off still blocks everywhere.

select tests.world('ap');
select tests.person('ap', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('ap', 'can', 'manager', array['K'], array['cook']);
select tests.person('ap', 'ali', 'employee', array['K'], array['cook']);
select tests.person('ap', 'emre', 'employee', array['K'], array['cook']);

-- days are weekdays as dow (0 = Sunday); shifts count days from Monday.
create function pg_temp.evenings(days integer[]) returns jsonb language sql as $$
  select jsonb_set(p, '{days}', (select jsonb_agg(case when (d ->> 'day')::integer = any(days)
      then d || '{"range": {"start": "18:00", "end": "22:00"}}' else d end order by (d ->> 'day')::integer)
    from jsonb_array_elements(p -> 'days') d))
  from (select public.empty_weekly_preference('time_range') p) x
$$;
-- Ali marked every evening 18:00-22:00 and Ayşe noted the same evenings as a
-- private reminder; Can, a manager who also works shifts, marked Saturday.
insert into public.employee_weekly_preferences (workspace_id, employee_id, preference, revision, updated_by)
values (tests.id('ap'), tests.id('ap:ali'), pg_temp.evenings(array[0, 1, 2, 3, 4, 5, 6]), 1, tests.user('ap:ali')),
       (tests.id('ap'), tests.id('ap:can'), pg_temp.evenings(array[6]), 1, tests.user('ap:can'));
insert into public.manager_weekly_reminders (workspace_id, employee_id, preference, enabled, revision, updated_by)
values (tests.id('ap'), tests.id('ap:ali'), pg_temp.evenings(array[0, 1, 2, 3, 4, 5, 6]), true, 1, tests.user('ap:ayse'));

create function pg_temp.shift(person text, n integer, day integer, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('location_id', tests.id('ap:K'), 'employee_id', tests.id('ap:' || person),
    'job_id', tests.id('ap:job:cook'), 'scheduled_date', tests.week(n) + day, 'time_basis', 'explicit',
    'start_time', '18:00', 'end_time', '22:00', 'time_timezone', 'Europe/Istanbul', 'note', '') || extra
$$;
create function pg_temp.rev(session uuid) returns integer language sql as $$
  select revision from public.schedule_edit_sessions where id = session
$$;
create function pg_temp.session(n integer) returns uuid language sql as $$
  select tests.remember('ap:session:' || n, (public.acquire_schedule_edit_session_service(
    tests.user('ap:owner'), tests.id('ap'), tests.week(n), 'blank', null) -> 'session' ->> 'id')::uuid)
$$;
create function pg_temp.write(n integer, shift jsonb) returns jsonb language sql as $$
  select public.mutate_schedule_edit_shift_service(tests.user('ap:owner'), tests.id('ap'), tests.id('ap:session:' || n),
    pg_temp.rev(tests.id('ap:session:' || n)), 'create', gen_random_uuid(), null, shift, gen_random_uuid())
$$;
create function pg_temp.batch(n integer, shifts jsonb) returns jsonb language sql as $$
  select public.create_schedule_shifts_batch_service(tests.user('ap:owner'), tests.id('ap'), tests.id('ap:session:' || n),
    pg_temp.rev(tests.id('ap:session:' || n)), shifts, gen_random_uuid())
$$;
create function pg_temp.insert_edit(n integer, shift jsonb) returns void language sql as $$
  insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, employee_id, job_id,
    scheduled_date, start_time, end_time, time_basis, time_timezone)
  values (gen_random_uuid(), tests.id('ap'), tests.id('ap:session:' || n), (shift ->> 'location_id')::uuid,
    (shift ->> 'employee_id')::uuid, (shift ->> 'job_id')::uuid, (shift ->> 'scheduled_date')::date,
    (shift ->> 'start_time')::time, (shift ->> 'end_time')::time, 'explicit', 'Europe/Istanbul')
$$;
create function pg_temp.insert_draft(draft uuid, shift jsonb) returns uuid language sql as $$
  insert into public.schedule_draft_shifts (id, workspace_id, draft_id, location_id, employee_id, job_id,
    scheduled_date, start_time, end_time, time_basis, time_timezone)
  values (gen_random_uuid(), tests.id('ap'), draft, (shift ->> 'location_id')::uuid,
    (shift ->> 'employee_id')::uuid, (shift ->> 'job_id')::uuid, (shift ->> 'scheduled_date')::date,
    (shift ->> 'start_time')::time, (shift ->> 'end_time')::time, 'explicit', 'Europe/Istanbul')
  returning id
$$;
create function pg_temp.insert_published(publication uuid, shift jsonb) returns void language sql as $$
  insert into public.schedule_published_shifts (id, source_shift_id, workspace_id, location_id, publication_id, employee_id, job_id,
    scheduled_date, start_time, end_time, time_basis, time_timezone)
  values (gen_random_uuid(), gen_random_uuid(), tests.id('ap'), (shift ->> 'location_id')::uuid, publication,
    (shift ->> 'employee_id')::uuid, (shift ->> 'job_id')::uuid, (shift ->> 'scheduled_date')::date,
    (shift ->> 'start_time')::time, (shift ->> 'end_time')::time, 'explicit', 'Europe/Istanbul')
$$;
create function pg_temp.save(n integer) returns uuid language sql as $$
  select tests.remember('ap:draft:' || n, (public.save_schedule_edit_session_service(tests.user('ap:owner'), tests.id('ap'),
    tests.id('ap:session:' || n), pg_temp.rev(tests.id('ap:session:' || n)), 'evenings', null, null) ->> 'id')::uuid)
$$;
create function pg_temp.preview(actor text, draft uuid) returns jsonb language sql as $$
  select public.preview_schedule_publication_service(tests.user('ap:' || actor), tests.id('ap'), draft, array[tests.id('ap:K')], null, true)
$$;
create function pg_temp.publish(actor text, draft uuid, preview jsonb, decisions jsonb) returns jsonb language sql as $$
  select public.publish_schedule_draft_service(tests.user('ap:' || actor), tests.id('ap'), draft, array[tests.id('ap:K')], null, true,
    (select d.revision from public.schedule_drafts d where d.id = draft), preview ->> 'fingerprint', decisions)
$$;
create function pg_temp.acknowledge(preview jsonb) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('finding_id', f ->> 'id')), '[]')
  from jsonb_array_elements(preview -> 'findings') f where f ->> 'code' = 'availability'
$$;
create function pg_temp.findings(preview jsonb, person text) returns jsonb language sql as $$
  select coalesce(jsonb_agg(f order by f ->> 'scheduled_date'), '[]') from jsonb_array_elements(preview -> 'findings') f
  where f ->> 'code' = 'availability' and f ->> 'employee_id' = tests.id('ap:' || person)::text
$$;
create temp table ap (k text primary key, v jsonb);

-- 1. Edit session, one shift at a time: Ali on Monday evening, no acceptance sent.
select pg_temp.session(1);
select lives_ok($$insert into ap select 'wrote', pg_temp.write(1, pg_temp.shift('ali', 1, 0))$$,
  'a manager writes Ali into his marked evening without any acceptance');
select ok((select x -> 'warning_codes' ? 'availability' from ap, jsonb_array_elements(v -> 'shifts') x
  where k = 'wrote' and x ->> 'employee_id' = tests.id('ap:ali')::text),
  'the answer carries the availability warning on that shift');
insert into ap select 'assess', public.assess_schedule_shift_service(tests.user('ap:owner'), tests.id('ap'),
  pg_temp.shift('ali', 1, 1), null, tests.id('ap:session:1'));
select is((select v ->> 'operation' from ap where k = 'assess'), 'allowed', 'the check before writing allows it');
select ok((select (v ->> 'has_availability_conflict')::boolean and v ->> 'availability_fingerprint' ~ '^[a-f0-9]{64}$' from ap where k = 'assess'),
  'and names the availability warning with its own fingerprint');
select is((select jsonb_agg(r ->> 'severity' order by r ->> 'source' nulls first) from ap, jsonb_array_elements(v -> 'reasons') r
  where k = 'assess' and r ->> 'code' = 'availability'), '["warn", "warn"]'::jsonb,
  'his own mark and the manager''s reminder are both only warnings');

-- 2. Paste / drag-and-drop go through the batch command.
select lives_ok($$select pg_temp.batch(1, jsonb_build_array(pg_temp.shift('ali', 1, 1)))$$, 'a batch writes Ali on Tuesday evening');

-- 3. Default hours review moves a shift into the marked hours.
insert into public.shift_types (id, workspace_id, name, default_start_time, default_end_time)
values (tests.remember('ap:type:late', gen_random_uuid()), tests.id('ap'), 'Late', '10:00', '14:00');
select tests.remember('ap:wed', (x ->> 'id')::uuid) from jsonb_array_elements(pg_temp.write(1,
  (pg_temp.shift('ali', 1, 2) - 'start_time' - 'end_time') || jsonb_build_object('time_basis', 'type_default', 'shift_type_id', tests.id('ap:type:late'))) -> 'shifts') x
where x ->> 'employee_id' = tests.id('ap:ali')::text and (x ->> 'scheduled_date')::date = tests.week(1) + 2;
update public.shift_types set default_start_time = '18:00', default_end_time = '22:00' where id = tests.id('ap:type:late');
insert into ap select 'hours', jsonb_build_object('expected_session_revision', pg_temp.rev(tests.id('ap:session:1')),
  'starts_on', tests.week(1), 'ends_on', tests.week(1) + 6, 'shift_ids', jsonb_build_array(tests.id('ap:wed')), 'overrides', '[]'::jsonb);
update ap set v = v || jsonb_build_object('review', public.preview_schedule_default_hours_service(tests.user('ap:owner'), tests.id('ap'),
  tests.id('ap:session:1'), v)) where k = 'hours';
select is((select (v -> 'review' ->> 'blocked_count')::integer from ap where k = 'hours'), 0, 'the review blocks nothing for availability');
select lives_ok($$select public.apply_schedule_default_hours_service(tests.user('ap:owner'), tests.id('ap'), tests.id('ap:session:1'),
  (v - 'review') || jsonb_build_object('fingerprint', v -> 'review' ->> 'fingerprint', 'idempotency_key', gen_random_uuid())) from ap where k = 'hours'$$,
  'and applies without an availability confirmation');
select is((select start_time from public.schedule_edit_session_shifts where id = tests.id('ap:wed')), '18:00'::time,
  'the shift now runs in the marked evening');

-- 4. A direct write into the edit session.
select lives_ok($$select pg_temp.insert_edit(1, pg_temp.shift('ali', 1, 3))$$, 'a direct edit-session write of Thursday evening');

-- 5. Saving the session, a template, then direct draft writes.
select lives_ok($$select pg_temp.save(1)$$, 'the session saves to a draft');
select is((select count(*)::integer from public.schedule_draft_shifts where draft_id = tests.id('ap:draft:1') and employee_id = tests.id('ap:ali')),
  4, 'with his four evenings');
insert into ap select 'template', public.create_schedule_template_service(tests.user('ap:owner'), tests.id('ap'), tests.id('ap:draft:1'), 'Evenings', false);
select pg_temp.session(2);
select lives_ok($$select public.apply_schedule_template_service(tests.user('ap:owner'), tests.id('ap'), tests.id('ap:session:2'),
  pg_temp.rev(tests.id('ap:session:2')), (v -> 'template' ->> 'id')::uuid, 'overwrite') from ap where k = 'template'$$,
  'a template made from it writes Ali into his marked evenings of another week');
select is((select count(*)::integer from public.schedule_edit_session_shifts where session_id = tests.id('ap:session:2') and employee_id = tests.id('ap:ali')),
  4, 'all four of his evenings are there');
select lives_ok($$select pg_temp.insert_draft(tests.id('ap:draft:1'), pg_temp.shift('ali', 1, 4))$$, 'a direct draft write of Friday evening');
select pg_temp.insert_draft(tests.id('ap:draft:1'), pg_temp.shift('can', 1, 5));

-- 6. Publish: the warnings are listed, the publisher acknowledges them.
insert into ap select 'preview', pg_temp.preview('ayse', tests.id('ap:draft:1'));
select is((select v ->> 'status' from ap where k = 'preview'), 'override_required', 'Publish asks for an acknowledgment, it does not block');
select is((select count(*)::integer from ap, jsonb_array_elements(v -> 'findings') f where k = 'preview' and f ->> 'severity' = 'hard'), 0,
  'no availability finding is hard');
select is((select jsonb_agg(f ->> 'availability_state') from ap, jsonb_array_elements(pg_temp.findings(v, 'ali')) f where k = 'preview'),
  '["new", "new", "new", "new", "new"]'::jsonb, 'each of Ali''s five evenings is a new availability warning');
select is((select pg_temp.findings(v, 'ali') -> 0 ->> 'message' from ap where k = 'preview'), 'Ali Person shows as unavailable for this shift.',
  'the warning says where Ali stands, not what changed');
select throws_ok($$select pg_temp.publish('ayse', tests.id('ap:draft:1'), v, '[]') from ap where k = 'preview'$$, '22023', null,
  'unacknowledged warnings stop the publish');
select lives_ok($$select pg_temp.publish('ayse', tests.id('ap:draft:1'), v, pg_temp.acknowledge(v)) from ap where k = 'preview'$$,
  'Ayşe acknowledges them and the week goes out');
select is((select array_agg(distinct o.actor_user_id) from public.schedule_publication_overrides o
  where o.workspace_id = tests.id('ap') and o.finding_code = 'availability'), array[tests.user('ap:ayse')],
  'every acknowledgment is recorded in Ayşe''s name');
select ok(exists(select 1 from public.schedule_publication_overrides o where o.workspace_id = tests.id('ap')
  and o.finding_code = 'availability' and o.employee_id = tests.id('ap:can') and o.created_at is not null),
  'Can''s warning too: Ayşe acknowledges a fellow manager''s mark, with the time');
select is((select count(*)::integer from public.schedule_published_shifts p join public.schedule_location_publications l on l.id = p.publication_id
  where l.status = 'current' and p.employee_id = tests.id('ap:ali') and p.scheduled_date between tests.week(1) and tests.week(1) + 6), 5,
  'Ali''s five evenings are published');
select lives_ok($$select pg_temp.insert_published((select id from public.schedule_location_publications
  where workspace_id = tests.id('ap') and week_start = tests.week(1) and status = 'current'), pg_temp.shift('ali', 1, 6))$$,
  'a direct write into the published week of Sunday evening');

-- 7. Nothing changed: the earlier acknowledgment stands. A changed shift asks again.
update ap set v = pg_temp.preview('ayse', tests.id('ap:draft:1')) where k = 'preview';
select is((select v ->> 'status' from ap where k = 'preview'), 'publish_ready', 'an unchanged week asks nothing again');
select is((select jsonb_agg(distinct jsonb_build_object('state', f ->> 'availability_state', 'by', f ->> 'acknowledged_by_name'))
  from ap, jsonb_array_elements(v -> 'findings') f where k = 'preview' and f ->> 'code' = 'availability' and f ? 'acknowledged_at'),
  '[{"by": "Ayse Person", "state": "accepted"}]'::jsonb, 'each warning shows who acknowledged it');
update public.schedule_draft_shifts set end_time = '21:00'
where draft_id = tests.id('ap:draft:1') and employee_id = tests.id('ap:ali') and scheduled_date = tests.week(1);
update ap set v = pg_temp.preview('ayse', tests.id('ap:draft:1')) where k = 'preview';
select is((select jsonb_agg(f ->> 'availability_state') from ap, jsonb_array_elements(pg_temp.findings(v, 'ali')) f where k = 'preview'),
  '["new", "accepted", "accepted", "accepted", "accepted"]'::jsonb, 'a shift whose hours changed asks again, the rest do not');

-- 8. A mark made after publishing (BL-184) is a new warning at the next publish.
select tests.publish_week('ap', 3, '[{"label": "emre_tue", "loc": "K", "person": "emre", "job": "cook", "day": 1, "start": "18:00", "end": "22:00"}]');
insert into public.employee_weekly_preferences (workspace_id, employee_id, preference, revision, updated_by)
values (tests.id('ap'), tests.id('ap:emre'), pg_temp.evenings(array[2]), 1, tests.user('ap:emre'));
insert into ap select 'late', pg_temp.preview('owner', (select source_draft_id from public.schedule_location_publications
  where workspace_id = tests.id('ap') and week_start = tests.week(3) and status = 'current'));
select is((select v ->> 'status' from ap where k = 'late'), 'override_required', 'the published week asks again once Emre marked his evening');
select is((select pg_temp.findings(v, 'emre') -> 0 ->> 'availability_state' from ap where k = 'late'), 'new', 'as a new warning');
select ok((select x -> 'warning_codes' ? 'availability' from jsonb_array_elements(public.get_schedule_read_model_service(
  tests.user('ap:owner'), tests.id('ap'), tests.week(3)) -> 'shifts') x where x ->> 'id' = tests.id('ap:shift:emre_tue')::text),
  'and the Schedule grid shows it on his published shift');

-- 9. Cover: Ali takes Emre's shift in his own marked evening.
insert into ap select 'cover', public.shift_exchanges_command_service(tests.user('ap:emre'), tests.id('ap'),
  jsonb_build_object('action', 'create', 'kind', 'cover', 'shift_id', tests.id('ap:shift:emre_tue')), gen_random_uuid());
insert into ap select 'apply', public.shift_exchanges_command_service(tests.user('ap:ali'), tests.id('ap'),
  jsonb_build_object('action', 'apply', 'shift_id', tests.id('ap:shift:emre_tue'), 'case_id', v ->> 'case_id',
    'availability_fingerprint', public.weekly_exchange_employee_warning(tests.id('ap'), tests.id('ap:ali'),
      public.shift_exchange_shift(tests.id('ap'), tests.id('ap:shift:emre_tue'))) ->> 'fingerprint'), gen_random_uuid())
from ap where k = 'cover';
insert into ap select 'exchange', public.shift_exchange_preview(tests.user('ap:owner'), tests.id('ap'), (c.v ->> 'case_id')::uuid,
  (select id from public.shift_exchange_applications where case_id = (c.v ->> 'case_id')::uuid))
from ap c where c.k = 'cover';
select is((select v ->> 'allowed' from ap where k = 'exchange'), 'true', 'the manager''s review allows it');
select lives_ok($$select public.shift_exchanges_command_service(tests.user('ap:owner'), tests.id('ap'), jsonb_build_object('action', 'approve',
  'case_id', c.v ->> 'case_id', 'application_id', (select id from public.shift_exchange_applications where case_id = (c.v ->> 'case_id')::uuid),
  'expected_revision', a.v ->> 'revision', 'fingerprint', e.v ->> 'fingerprint'), gen_random_uuid())
  from ap c, ap a, ap e where c.k = 'cover' and a.k = 'apply' and e.k = 'exchange'$$, 'and approving the cover goes through');
select is((select employee_id from public.schedule_published_shifts where id = tests.id('ap:shift:emre_tue')), tests.id('ap:ali'),
  'Ali now holds the shift');
select is((select count(*)::integer from public.schedule_availability_overrides where workspace_id = tests.id('ap')), 0,
  'nothing on any path asked for an availability acceptance');

-- 10. Auto-fill does not pick someone who shows as unavailable (S3 A).
select pg_temp.session(4);
select pg_temp.write(4, pg_temp.shift('ali', 4, 1, '{"employee_id": null}'));
insert into ap select 'fill', public.preview_schedule_auto_fill_service(tests.user('ap:owner'), tests.id('ap'), tests.id('ap:session:4'));
select ok((select not (p -> 'candidates' @> jsonb_build_array(jsonb_build_object('employee_id', tests.id('ap:ali'))))
  and not (p -> 'candidates' @> jsonb_build_array(jsonb_build_object('employee_id', tests.id('ap:emre'))))
  from ap, jsonb_array_elements(v -> 'proposals') p where k = 'fill'), 'auto-fill leaves out Ali and Emre on Tuesday evening');
select ok((select p -> 'candidates' @> jsonb_build_array(jsonb_build_object('employee_id', tests.id('ap:ayse')))
  from ap, jsonb_array_elements(v -> 'proposals') p where k = 'fill'), 'and proposes someone who is free');

-- 11. Approved time off still blocks every path (FB-6.1.6).
create function pg_temp.leave(n integer, day integer, from_time time, to_time time) returns void language sql as $$
  with request as (
    insert into public.schedule_time_off_requests (id, workspace_id, employee_id, location_id, status, created_by)
    values (gen_random_uuid(), tests.id('ap'), tests.id('ap:ali'), tests.id('ap:K'), 'approved', tests.user('ap:ali')) returning id)
  insert into public.schedule_time_off_segments (workspace_id, request_id, segment_date, start_time, end_time, status)
  select tests.id('ap'), id, tests.week(n) + day, from_time, to_time, 'approved' from request
$$;
select pg_temp.session(5);
select pg_temp.write(5, pg_temp.shift('emre', 5, 0));
select pg_temp.leave(5, 2, '17:00', '23:00');
select throws_ok($$select pg_temp.write(5, pg_temp.shift('ali', 5, 2))$$, '23514', null, 'leave: one shift at a time is refused');
select throws_ok($$select pg_temp.batch(5, jsonb_build_array(pg_temp.shift('ali', 5, 2)))$$, '23514', null, 'leave: a batch is refused');
select throws_ok($$select pg_temp.insert_edit(5, pg_temp.shift('ali', 5, 2))$$, '23514', null, 'leave: a direct edit-session write is refused');
select pg_temp.save(5);
select throws_ok($$select pg_temp.insert_draft(tests.id('ap:draft:5'), pg_temp.shift('ali', 5, 2))$$, '23514', null, 'leave: a direct draft write is refused');
select pg_temp.insert_draft(tests.id('ap:draft:5'), pg_temp.shift('ali', 5, 3));
select pg_temp.leave(5, 3, '17:00', '23:00');
insert into ap select 'leave_preview', pg_temp.preview('owner', tests.id('ap:draft:5'));
select is((select v ->> 'status' from ap where k = 'leave_preview'), 'hard_blocked', 'leave: Publish is blocked');
select throws_ok($$select pg_temp.publish('owner', tests.id('ap:draft:5'), v, pg_temp.acknowledge(v)) from ap where k = 'leave_preview'$$,
  '23514', null, 'leave: and acknowledging does not publish it');
select tests.publish_week('ap', 6, '[{"label": "emre_wed", "loc": "K", "person": "emre", "job": "cook", "day": 2, "start": "18:00", "end": "22:00"}]');
select pg_temp.leave(6, 3, '08:00', '13:00');
select throws_ok($$select pg_temp.insert_published((select id from public.schedule_location_publications
  where workspace_id = tests.id('ap') and week_start = tests.week(6) and status = 'current'), pg_temp.shift('ali', 6, 3) || '{"start_time": "09:00", "end_time": "12:00"}')$$,
  '23514', null, 'leave: a direct write into the published week is refused');
insert into ap select 'cover6', public.shift_exchanges_command_service(tests.user('ap:emre'), tests.id('ap'),
  jsonb_build_object('action', 'create', 'kind', 'cover', 'shift_id', tests.id('ap:shift:emre_wed')), gen_random_uuid());
select public.shift_exchanges_command_service(tests.user('ap:ali'), tests.id('ap'),
  jsonb_build_object('action', 'apply', 'shift_id', tests.id('ap:shift:emre_wed'), 'case_id', v ->> 'case_id',
    'availability_fingerprint', public.weekly_exchange_employee_warning(tests.id('ap'), tests.id('ap:ali'),
      public.shift_exchange_shift(tests.id('ap'), tests.id('ap:shift:emre_wed'))) ->> 'fingerprint'), gen_random_uuid())
from ap where k = 'cover6';
select pg_temp.leave(6, 2, '17:00', '23:00');
select throws_ok($$select public.record_weekly_exchange_acceptance(tests.id('ap'), (v ->> 'case_id')::uuid,
  (select id from public.shift_exchange_applications where case_id = (v ->> 'case_id')::uuid)) from ap where k = 'cover6'$$,
  '23514', null, 'leave: taking a cover over one''s approved leave is refused');
select pg_temp.session(7);
select tests.remember('ap:wed7', (x ->> 'id')::uuid) from jsonb_array_elements(pg_temp.write(7,
  (pg_temp.shift('ali', 7, 2) - 'start_time' - 'end_time') || jsonb_build_object('time_basis', 'type_default', 'shift_type_id', tests.id('ap:type:late'))) -> 'shifts') x
where x ->> 'employee_id' = tests.id('ap:ali')::text;
select pg_temp.leave(7, 2, '09:00', '12:00');
update public.shift_types set default_start_time = '09:00', default_end_time = '13:00' where id = tests.id('ap:type:late');
insert into ap select 'hours7', jsonb_build_object('expected_session_revision', pg_temp.rev(tests.id('ap:session:7')),
  'starts_on', tests.week(7), 'ends_on', tests.week(7) + 6, 'shift_ids', jsonb_build_array(tests.id('ap:wed7')), 'overrides', '[]'::jsonb);
update ap set v = v || jsonb_build_object('review', public.preview_schedule_default_hours_service(tests.user('ap:owner'), tests.id('ap'),
  tests.id('ap:session:7'), v)) where k = 'hours7';
select is((select (v -> 'review' ->> 'blocked_count')::integer from ap where k = 'hours7'), 1, 'leave: the default hours review blocks it');
select throws_ok($$select public.apply_schedule_default_hours_service(tests.user('ap:owner'), tests.id('ap'), tests.id('ap:session:7'),
  (v - 'review') || jsonb_build_object('fingerprint', v -> 'review' ->> 'fingerprint', 'idempotency_key', gen_random_uuid())) from ap where k = 'hours7'$$,
  '23514', null, 'leave: and applying it is refused');

-- 12. Settings has no availability rule any more.
select is((select count(*)::integer from public.workspace_scheduling_settings where conflict_rules ? 'availability'), 0,
  'no workspace keeps an availability conflict rule');
select throws_ok($$update public.workspace_scheduling_settings set conflict_rules = conflict_rules || '{"availability": "block"}'
  where workspace_id = tests.id('ap')$$, '23514', null, 'the database refuses one');
select throws_ok($$select public.update_scheduling_settings_service(tests.user('ap:owner'), tests.id('ap'), jsonb_build_object(
  'conflict_rules', s.conflict_rules || '{"availability": "warn"}', 'conflict_rules_revision', s.conflict_rules_revision))
  from public.workspace_scheduling_settings s where s.workspace_id = tests.id('ap')$$, '22023', null, 'saving Conflict handling with one is refused');
select lives_ok($$select public.update_scheduling_settings_service(tests.user('ap:owner'), tests.id('ap'), jsonb_build_object(
  'conflict_rules', s.conflict_rules || '{"minimum_rest": "block"}', 'conflict_rules_revision', s.conflict_rules_revision))
  from public.workspace_scheduling_settings s where s.workspace_id = tests.id('ap')$$, 'the other rules still save');

select * from finish();
rollback;
