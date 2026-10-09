begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- AVAIL-002 (KARARLAR "Müsaitlik", M7-M12, Mert 2026-10-04): availability is
-- always a warning and never a conflict. The employee's own mark asks at every
-- write (the web's "Scheduling rule" box) and never refuses a write on any
-- path: one shift, a batch, default hours, the edit session, the draft, a
-- template, the published week, a cover. Publish lists the marks for a last
-- look and asks no acknowledgment (M9). A manager's private note is only a
-- reminder (M12): a separate "note" reason, never an availability warning,
-- never in Auto-fill or Publish. "Changed after publishing" counts a mark that
-- came after the shift was first published, never approved time off (M11).
-- Approved time off still blocks everywhere.

select tests.world('ap');
select tests.person('ap', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('ap', 'can', 'manager', array['K'], array['cook']);
select tests.person('ap', 'ali', 'employee', array['K'], array['cook']);
select tests.person('ap', 'emre', 'employee', array['K'], array['cook']);
select tests.person('ap', 'veli', 'employee', array['K'], array['cook']);

-- days are weekdays as dow (0 = Sunday); shifts count days from Monday.
create function pg_temp.evenings(days integer[]) returns jsonb language sql as $$
  select jsonb_set(p, '{days}', (select jsonb_agg(case when (d ->> 'day')::integer = any(days)
      then d || '{"ranges": [{"start": "18:00", "end": "22:00"}]}' else d end order by (d ->> 'day')::integer)
    from jsonb_array_elements(p -> 'days') d))
  from (select public.empty_weekly_preference('time_range') p) x
$$;
-- Ali marked every evening 18:00-22:00 and Ayşe noted the same evenings as a
-- private reminder; Can, a manager who also works shifts, keeps no week (M13).
-- Veli marked nothing; Ayşe's note says he is busy every evening.
insert into public.employee_weekly_preferences (workspace_id, employee_id, preference, revision, updated_by)
values (tests.id('ap'), tests.id('ap:ali'), pg_temp.evenings(array[0, 1, 2, 3, 4, 5, 6]), 1, tests.user('ap:ali'));
insert into public.manager_weekly_reminders (workspace_id, employee_id, preference, enabled, revision, updated_by)
values (tests.id('ap'), tests.id('ap:ali'), pg_temp.evenings(array[0, 1, 2, 3, 4, 5, 6]), true, 1, tests.user('ap:ayse')),
       (tests.id('ap'), tests.id('ap:veli'), pg_temp.evenings(array[0, 1, 2, 3, 4, 5, 6]), true, 1, tests.user('ap:ayse'));

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
create function pg_temp.findings(preview jsonb, person text) returns jsonb language sql as $$
  select coalesce(jsonb_agg(f order by f ->> 'scheduled_date'), '[]') from jsonb_array_elements(preview -> 'findings') f
  where f ->> 'code' = 'availability' and f ->> 'employee_id' = tests.id('ap:' || person)::text
$$;
-- The Schedule grid's card for a published shift of week n.
create function pg_temp.card(n integer, shift uuid) returns jsonb language sql as $$
  select x from jsonb_array_elements(public.get_schedule_read_model_service(tests.user('ap:owner'), tests.id('ap'), tests.week(n)) -> 'shifts') x
  where x ->> 'id' = shift::text
$$;
create function pg_temp.current_draft(n integer) returns uuid language sql as $$
  select source_draft_id from public.schedule_location_publications
  where workspace_id = tests.id('ap') and week_start = tests.week(n) and status = 'current'
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
select is((select v ->> 'conflict_severity' from ap where k = 'assess'), 'allow', 'his mark is no conflict');
select ok((select (v ->> 'has_availability_conflict')::boolean and v ->> 'availability_fingerprint' ~ '^[a-f0-9]{64}$' from ap where k = 'assess'),
  'and names the availability warning with its own fingerprint');
select is((select jsonb_agg((r ->> 'code') || ':' || (r ->> 'severity') order by r ->> 'code') from ap, jsonb_array_elements(v -> 'reasons') r
  where k = 'assess' and r ->> 'code' in ('availability', 'note')), '["availability:warn", "note:warn"]'::jsonb,
  'his own mark is a warning; the manager''s reminder comes back as a separate note');
select is((select count(*)::integer from ap, jsonb_array_elements(v -> 'reasons') r
  where k = 'assess' and r ->> 'code' = 'availability' and r ? 'source'), 0, 'no availability reason comes from the note');

-- The note alone: Veli marked nothing, Ayşe's note covers his evening.
insert into ap select 'note', public.assess_schedule_shift_service(tests.user('ap:owner'), tests.id('ap'),
  pg_temp.shift('veli', 1, 1), null, tests.id('ap:session:1'));
select is((select jsonb_build_object('operation', v ->> 'operation', 'severity', v ->> 'conflict_severity',
    'warns', v -> 'has_availability_conflict', 'fingerprint', v -> 'availability_fingerprint') from ap where k = 'note'),
  '{"operation": "allowed", "severity": "allow", "warns": false, "fingerprint": null}'::jsonb,
  'a note alone is no availability warning and no conflict');
select is((select jsonb_agg(r ->> 'code' order by r ->> 'code') from ap, jsonb_array_elements(v -> 'reasons') r where k = 'note'),
  '["note"]'::jsonb, 'it comes back as the note, to be shown while writing');
select is((select v -> 'unavailable_intervals' from ap where k = 'note'), '[]'::jsonb, 'and the note marks no hour unavailable');
-- A shift lead whose role cannot read the note does not get it.
select tests.role('ap', 'shift lead', 'manager', array(
  select rp.permission_key from public.workspace_role_permissions rp join public.workspace_roles r on r.id = rp.role_id
  where r.workspace_id = tests.id('ap') and r.system_key = 'manager' and rp.permission_key not like 'availability.%'));
select tests.person('ap', 'nil', 'shift lead', array['K'], array['cook']);
select is((select count(*)::integer from jsonb_array_elements(public.assess_schedule_shift_service(tests.user('ap:nil'), tests.id('ap'),
  pg_temp.shift('veli', 1, 1)) -> 'reasons') r where r ->> 'code' = 'note'), 0, 'a reader without the note does not see it');

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
select pg_temp.insert_draft(tests.id('ap:draft:1'), pg_temp.shift('veli', 1, 5));

-- 6. Publish lists the marks and asks nothing (M9).
insert into ap select 'preview', pg_temp.preview('ayse', tests.id('ap:draft:1'));
select is((select v ->> 'status' from ap where k = 'preview'), 'publish_ready', 'Publish asks for no acknowledgment');
select is((select jsonb_agg(distinct jsonb_build_object('tier', f -> 'tier', 'severity', f -> 'severity', 'overrideable', f -> 'overrideable'))
  from ap, jsonb_array_elements(v -> 'findings') f where k = 'preview' and f ->> 'code' = 'availability'),
  '[{"tier": "note", "severity": "soft", "overrideable": false}]'::jsonb, 'every availability finding is a note for a last look');
select is((select count(*)::integer from ap, jsonb_array_elements(v -> 'findings') f where k = 'preview' and f ->> 'code' = 'availability'
  and (f ? 'availability_state' or f ? 'warning_policy' or f ? 'acknowledged_by_name' or f ? 'acknowledged_at')), 0,
  'with no acceptance state and nobody''s acknowledgment');
select is((select jsonb_array_length(pg_temp.findings(v, 'ali')) from ap where k = 'preview'), 5, 'each of Ali''s five evenings is listed');
select is((select jsonb_array_length(pg_temp.findings(v, 'can')) from ap where k = 'preview'), 0, 'nothing of Can''s, a manager with no week');
select is((select jsonb_array_length(pg_temp.findings(v, 'veli')) from ap where k = 'preview'), 0, 'the note never reaches Publish');
select is((select pg_temp.findings(v, 'ali') -> 0 ->> 'message' from ap where k = 'preview'), 'Ali Person shows as unavailable for this shift.',
  'the line says where Ali stands, not what changed');
select lives_ok($$select pg_temp.publish('ayse', tests.id('ap:draft:1'), v, '[]') from ap where k = 'preview'$$,
  'Ayşe publishes without acknowledging anything');
select is((select count(*)::integer from public.schedule_publication_overrides o
  where o.workspace_id = tests.id('ap') and o.finding_code = 'availability'), 0, 'nothing is recorded as an acknowledgment');
select is((select count(*)::integer from public.schedule_published_shifts p join public.schedule_location_publications l on l.id = p.publication_id
  where l.status = 'current' and p.employee_id = tests.id('ap:ali') and p.scheduled_date between tests.week(1) and tests.week(1) + 6), 5,
  'Ali''s five evenings are published');
select is((select count(*)::integer from public.schedule_published_shifts p join public.schedule_location_publications l on l.id = p.publication_id
  where l.status = 'current' and p.employee_id = tests.id('ap:ali') and p.scheduled_date between tests.week(1) and tests.week(1) + 6
    and (pg_temp.card(1, p.id) ->> 'availability_changed_after_publish')::boolean), 0,
  'a mark made before publishing is not "changed after publishing"');
select lives_ok($$select pg_temp.insert_published((select id from public.schedule_location_publications
  where workspace_id = tests.id('ap') and week_start = tests.week(1) and status = 'current'), pg_temp.shift('ali', 1, 6))$$,
  'a direct write into the published week of Sunday evening');

-- 7. Nothing changed, or a shift changed: still nothing to acknowledge.
update ap set v = pg_temp.preview('ayse', tests.id('ap:draft:1')) where k = 'preview';
select is((select v ->> 'status' from ap where k = 'preview'), 'publish_ready', 'an unchanged week asks nothing');
update public.schedule_draft_shifts set end_time = '21:00'
where draft_id = tests.id('ap:draft:1') and employee_id = tests.id('ap:ali') and scheduled_date = tests.week(1);
update ap set v = pg_temp.preview('ayse', tests.id('ap:draft:1')) where k = 'preview';
select is((select v ->> 'status' from ap where k = 'preview'), 'publish_ready', 'a shift whose hours changed asks nothing either');

-- 8. A mark made after publishing: listed, never asked, "changed after publishing" (M11).
select tests.publish_week('ap', 3, '[{"label": "emre_tue", "loc": "K", "person": "emre", "job": "cook", "day": 1, "start": "18:00", "end": "22:00"},
  {"label": "emre_thu", "loc": "K", "person": "emre", "job": "cook", "day": 3, "start": "09:00", "end": "13:00"}]');
select is((pg_temp.card(3, tests.id('ap:shift:emre_tue')) ->> 'availability_changed_after_publish')::boolean, false, 'nothing changed yet');
insert into public.employee_weekly_preferences (workspace_id, employee_id, preference, revision, updated_by)
values (tests.id('ap'), tests.id('ap:emre'), pg_temp.evenings(array[2]), 1, tests.user('ap:emre'));
insert into ap select 'late', pg_temp.preview('owner', pg_temp.current_draft(3));
select is((select v ->> 'status' from ap where k = 'late'), 'publish_ready', 'the published week asks nothing once Emre marked his evening');
select is((select pg_temp.findings(v, 'emre') -> 0 ->> 'tier' from ap where k = 'late'), 'note', 'it lists his evening');
select ok(pg_temp.card(3, tests.id('ap:shift:emre_tue')) -> 'warning_codes' ? 'availability', 'the Schedule grid shows it on his published shift');
select is((pg_temp.card(3, tests.id('ap:shift:emre_tue')) ->> 'availability_changed_after_publish')::boolean, true,
  'and says it changed after publishing');
-- Edit mode reads the edit, not the published week (VAR-UYG-DB): the same
-- flag comes from each shift's published counterpart; a new shift has none.
insert into ap select 'edit3', public.acquire_schedule_edit_session_service(tests.user('ap:owner'), tests.id('ap'),
  tests.week(3), 'published', null) -> 'session';
create function pg_temp.edit_card(day integer) returns jsonb language sql as $$
  select x from ap, jsonb_array_elements(public.get_schedule_edit_session_service(tests.user('ap:owner'), tests.id('ap'),
    (ap.v ->> 'id')::uuid) -> 'shifts') x
  where ap.k = 'edit3' and x ->> 'employee_id' = tests.id('ap:emre')::text and (x ->> 'scheduled_date')::date = tests.week(3) + day
$$;
select is((pg_temp.edit_card(1) ->> 'availability_changed_after_publish')::boolean, true,
  'in Edit mode Emre''s Tuesday also says it changed after publishing');
select is((pg_temp.edit_card(3) ->> 'availability_changed_after_publish')::boolean, false,
  'his Thursday does not');
select tests.add_shift(tests.user('ap:owner'), 'ap', (select (v ->> 'id')::uuid from ap where k = 'edit3'), 3,
  '{"loc": "K", "person": "emre", "job": "cook", "day": 4, "start": "18:00", "end": "22:00"}');
select is((pg_temp.edit_card(4) ->> 'availability_changed_after_publish')::boolean, false,
  'a shift added in the edit was never published: false');
-- KK-171: given to Ali in the edit, Emre's Tuesday no longer says "changed
-- after publishing" -- that was Emre's mark, and Ali is on the card now.
-- ponytail: reassigned directly; the flag only reads the edit as it stands.
update public.schedule_edit_session_shifts set employee_id = tests.id('ap:ali')
where session_id = (select (v ->> 'id')::uuid from ap where k = 'edit3')
  and employee_id = tests.id('ap:emre') and scheduled_date = tests.week(3) + 1;
select is((select (x ->> 'availability_changed_after_publish')::boolean from ap,
    jsonb_array_elements(public.get_schedule_edit_session_service(tests.user('ap:owner'), tests.id('ap'), (ap.v ->> 'id')::uuid) -> 'shifts') x
  where ap.k = 'edit3' and x ->> 'employee_id' = tests.id('ap:ali')::text and (x ->> 'scheduled_date')::date = tests.week(3) + 1),
  false, 'given to Ali in the edit, the Tuesday no longer says it changed after publishing');
select public.discard_schedule_edit_session_service(tests.user('ap:owner'), tests.id('ap'), (v ->> 'id')::uuid)
from ap where k = 'edit3';
-- Approved time off is not a change of availability.
select tests.approved_leave(tests.id('ap'), tests.id('ap:emre'), tests.user('ap:emre'), tests.id('ap:K'), tests.week(3) + 3, '08:00', '14:00');
select is((pg_temp.card(3, tests.id('ap:shift:emre_thu')) ->> 'availability_changed_after_publish')::boolean, false,
  'approved time off over a published shift does not say "changed after publishing"');
-- Unpublishing and publishing again keeps what the first publish saw.
select public.unpublish_schedule_service(tests.user('ap:owner'), tests.id('ap'), tests.week(3), array[tests.id('ap:K')],
  public.preview_schedule_unpublication_service(tests.user('ap:owner'), tests.id('ap'), tests.week(3), array[tests.id('ap:K')]) ->> 'fingerprint');
insert into ap select 'draft3', to_jsonb((select source_draft_id from public.schedule_location_publications
  where workspace_id = tests.id('ap') and week_start = tests.week(3) order by version_number desc limit 1));
delete from public.schedule_draft_shifts where draft_id = (select (v #>> '{}')::uuid from ap where k = 'draft3')
  and employee_id = tests.id('ap:emre') and scheduled_date = tests.week(3) + 3;
insert into ap select 'repub', pg_temp.preview('owner', (v #>> '{}')::uuid) from ap where k = 'draft3';
select lives_ok($$select pg_temp.publish('owner', (d.v #>> '{}')::uuid, p.v, '[]') from ap d, ap p where d.k = 'draft3' and p.k = 'repub'$$,
  'the week is unpublished and published again');
select is((select (pg_temp.card(3, p.id) ->> 'availability_changed_after_publish')::boolean
  from public.schedule_published_shifts p join public.schedule_location_publications l on l.id = p.publication_id
  where l.status = 'current' and p.employee_id = tests.id('ap:emre') and p.scheduled_date = tests.week(3) + 1), true,
  'it still says changed after publishing');
-- Moved within the marked evening after the first publish: still the first publish that counts.
update public.schedule_draft_shifts set start_time = '19:00' where draft_id = (select (v #>> '{}')::uuid from ap where k = 'draft3')
  and employee_id = tests.id('ap:emre') and scheduled_date = tests.week(3) + 1;
update ap set v = pg_temp.preview('owner', (select (v #>> '{}')::uuid from ap where k = 'draft3')) where k = 'repub';
select lives_ok($$select pg_temp.publish('owner', (d.v #>> '{}')::uuid, p.v, '[]') from ap d, ap p where d.k = 'draft3' and p.k = 'repub'$$,
  'the shift moves to 19:00 and goes out again');
select is((select (pg_temp.card(3, p.id) ->> 'availability_changed_after_publish')::boolean
  from public.schedule_published_shifts p join public.schedule_location_publications l on l.id = p.publication_id
  where l.status = 'current' and p.employee_id = tests.id('ap:emre') and p.scheduled_date = tests.week(3) + 1), true,
  'still changed after publishing: the first publish did not see the mark');

-- 9. Cover: Ali takes Emre's shift in his own marked evening.
select tests.publish_week('ap', 5, '[{"label": "emre_tue5", "loc": "K", "person": "emre", "job": "cook", "day": 1, "start": "18:00", "end": "22:00"}]');
insert into ap select 'cover', public.shift_exchanges_command_service(tests.user('ap:emre'), tests.id('ap'),
  jsonb_build_object('action', 'create', 'kind', 'cover', 'shift_id', tests.id('ap:shift:emre_tue5')), gen_random_uuid());
insert into ap select 'apply', public.shift_exchanges_command_service(tests.user('ap:ali'), tests.id('ap'),
  jsonb_build_object('action', 'apply', 'shift_id', tests.id('ap:shift:emre_tue5'), 'case_id', v ->> 'case_id',
    'availability_fingerprint', public.weekly_exchange_employee_warning(tests.id('ap'), tests.id('ap:ali'),
      public.shift_exchange_shift(tests.id('ap'), tests.id('ap:shift:emre_tue5'))) ->> 'fingerprint'), gen_random_uuid())
from ap where k = 'cover';
insert into ap select 'exchange', public.shift_exchange_preview(tests.user('ap:owner'), tests.id('ap'), (c.v ->> 'case_id')::uuid,
  (select id from public.shift_exchange_applications where case_id = (c.v ->> 'case_id')::uuid))
from ap c where c.k = 'cover';
select is((select v ->> 'allowed' from ap where k = 'exchange'), 'true', 'the manager''s review allows it');
select lives_ok($$select public.shift_exchanges_command_service(tests.user('ap:owner'), tests.id('ap'), jsonb_build_object('action', 'approve',
  'case_id', c.v ->> 'case_id', 'application_id', (select id from public.shift_exchange_applications where case_id = (c.v ->> 'case_id')::uuid),
  'expected_revision', a.v ->> 'revision', 'fingerprint', e.v ->> 'fingerprint'), gen_random_uuid())
  from ap c, ap a, ap e where c.k = 'cover' and a.k = 'apply' and e.k = 'exchange'$$, 'and approving the cover goes through');
select is((select employee_id from public.schedule_published_shifts where id = tests.id('ap:shift:emre_tue5')), tests.id('ap:ali'),
  'Ali now holds the shift');
select is((select count(*)::integer from public.schedule_availability_overrides where workspace_id = tests.id('ap')), 0,
  'nothing on any path asked for an availability acceptance');

-- 10. Auto-fill does not pick someone who marked the hours; the note does not count (D3, M12).
select pg_temp.session(4);
select pg_temp.write(4, pg_temp.shift('ali', 4, 1, '{"employee_id": null}'));
insert into ap select 'fill', public.preview_schedule_auto_fill_service(tests.user('ap:owner'), tests.id('ap'), tests.id('ap:session:4'));
select ok((select not (p -> 'candidates' @> jsonb_build_array(jsonb_build_object('employee_id', tests.id('ap:ali'))))
  and not (p -> 'candidates' @> jsonb_build_array(jsonb_build_object('employee_id', tests.id('ap:emre'))))
  from ap, jsonb_array_elements(v -> 'proposals') p where k = 'fill'), 'auto-fill leaves out Ali and Emre on Tuesday evening');
select ok((select p -> 'candidates' @> jsonb_build_array(jsonb_build_object('employee_id', tests.id('ap:veli')))
  from ap, jsonb_array_elements(v -> 'proposals') p where k = 'fill'), 'and proposes Veli, whose note is only a reminder');

-- 11. Approved time off still blocks every path (FB-6.1.6).
create function pg_temp.leave(n integer, day integer, from_time time, to_time time) returns void language sql as $$
  select tests.approved_leave(tests.id('ap'), tests.id('ap:ali'), tests.user('ap:ali'), tests.id('ap:K'), tests.week(n) + day, from_time, to_time)
$$;
select pg_temp.session(6);
select pg_temp.write(6, pg_temp.shift('emre', 6, 0));
select pg_temp.leave(6, 2, '17:00', '23:00');
select throws_ok($$select pg_temp.write(6, pg_temp.shift('ali', 6, 2))$$, '23514', null, 'leave: one shift at a time is refused');
select throws_ok($$select pg_temp.batch(6, jsonb_build_array(pg_temp.shift('ali', 6, 2)))$$, '23514', null, 'leave: a batch is refused');
select throws_ok($$select pg_temp.insert_edit(6, pg_temp.shift('ali', 6, 2))$$, '23514', null, 'leave: a direct edit-session write is refused');
select pg_temp.save(6);
select throws_ok($$select pg_temp.insert_draft(tests.id('ap:draft:6'), pg_temp.shift('ali', 6, 2))$$, '23514', null, 'leave: a direct draft write is refused');
select pg_temp.insert_draft(tests.id('ap:draft:6'), pg_temp.shift('ali', 6, 3));
select pg_temp.leave(6, 3, '17:00', '23:00');
insert into ap select 'leave_preview', pg_temp.preview('owner', tests.id('ap:draft:6'));
select is((select v ->> 'status' from ap where k = 'leave_preview'), 'hard_blocked', 'leave: Publish is blocked');
select throws_ok($$select pg_temp.publish('owner', tests.id('ap:draft:6'), v, '[]') from ap where k = 'leave_preview'$$,
  '23514', null, 'leave: and it does not publish');
select tests.publish_week('ap', 7, '[{"label": "emre_wed", "loc": "K", "person": "emre", "job": "cook", "day": 2, "start": "18:00", "end": "22:00"}]');
select pg_temp.leave(7, 3, '08:00', '13:00');
select throws_ok($$select pg_temp.insert_published((select id from public.schedule_location_publications
  where workspace_id = tests.id('ap') and week_start = tests.week(7) and status = 'current'), pg_temp.shift('ali', 7, 3) || '{"start_time": "09:00", "end_time": "12:00"}')$$,
  '23514', null, 'leave: a direct write into the published week is refused');
insert into ap select 'cover7', public.shift_exchanges_command_service(tests.user('ap:emre'), tests.id('ap'),
  jsonb_build_object('action', 'create', 'kind', 'cover', 'shift_id', tests.id('ap:shift:emre_wed')), gen_random_uuid());
select public.shift_exchanges_command_service(tests.user('ap:ali'), tests.id('ap'),
  jsonb_build_object('action', 'apply', 'shift_id', tests.id('ap:shift:emre_wed'), 'case_id', v ->> 'case_id',
    'availability_fingerprint', public.weekly_exchange_employee_warning(tests.id('ap'), tests.id('ap:ali'),
      public.shift_exchange_shift(tests.id('ap'), tests.id('ap:shift:emre_wed'))) ->> 'fingerprint'), gen_random_uuid())
from ap where k = 'cover7';
select pg_temp.leave(7, 2, '17:00', '23:00');
select throws_ok($$select public.record_weekly_exchange_acceptance(tests.id('ap'), (v ->> 'case_id')::uuid,
  (select id from public.shift_exchange_applications where case_id = (v ->> 'case_id')::uuid)) from ap where k = 'cover7'$$,
  '23514', null, 'leave: taking a cover over one''s approved leave is refused');

-- 12. Settings has no availability rule (M8).
select is((select count(*)::integer from public.workspace_scheduling_settings where conflict_rules ? 'availability'), 0,
  'no workspace keeps an availability conflict rule');
select throws_ok($$update public.workspace_scheduling_settings set conflict_rules = conflict_rules || '{"availability": "block"}'
  where workspace_id = tests.id('ap')$$, '23514', null, 'the database refuses one');
select throws_ok($$select public.update_scheduling_settings_service(tests.user('ap:owner'), tests.id('ap'), jsonb_build_object(
  'conflict_rules', s.conflict_rules || '{"availability": "warn"}', 'conflict_rules_revision', s.conflict_rules_revision))
  from public.workspace_scheduling_settings s where s.workspace_id = tests.id('ap')$$, '22023', null, 'saving Conflict handling with one is refused');

-- 13. The publish decision has no availability acknowledgment left (M9).
select is((select count(*)::integer from pg_proc where proname = 'weekly_publication_decisions'
  and pronamespace = 'public'::regnamespace and (strpos(prosrc, 'Acknowledge the availability') > 0 or strpos(prosrc, 'Availability warning acknowledged') > 0)),
  0, 'the publish decision never asks for or records an availability acknowledgment');
select is((select count(*)::integer from pg_proc where proname = 'weekly_schedule_publication_preflight'
  and pronamespace = 'public'::regnamespace and strpos(prosrc, 'acknowledged_by') > 0), 0, 'Publish names nobody as having acknowledged a mark');
select is((select count(*)::integer from pg_proc where pronamespace = 'public'::regnamespace
  and (strpos(prosrc, 'Resolve availability') > 0 or strpos(prosrc, 'availability acceptance') > 0)), 0,
  'no refusal tells the manager to resolve or accept availability');

-- 14. A rest conflict on a shift that also falls on Ayşe's note: Publish names
-- the rest conflict and never the note (M12).
select pg_temp.session(8);
select pg_temp.write(8, pg_temp.shift('veli', 8, 0));
select pg_temp.write(8, pg_temp.shift('veli', 8, 1, '{"start_time": "06:00", "end_time": "08:00"}'));
select pg_temp.save(8);
update public.workspace_scheduling_settings set minimum_rest_minutes = 600 where workspace_id = tests.id('ap');
insert into ap select 'rest', pg_temp.preview('ayse', tests.id('ap:draft:8'));
select ok((select count(*) > 0 from ap, jsonb_array_elements(v -> 'findings') f where k = 'rest' and f ->> 'code' = 'schedule_conflict'
  and f ->> 'employee_id' = tests.id('ap:veli')::text), 'Publish lists Veli''s short rest');
select is((select count(*)::integer from ap, jsonb_array_elements(v -> 'findings') f where k = 'rest'
  and f ->> 'message' like '%manager noted%'), 0, 'and its line says nothing of the note');
update public.workspace_scheduling_settings set minimum_rest_minutes = 0 where workspace_id = tests.id('ap');

-- 15. The default hours review shows the note only to whoever may read it.
select tests.remember('ap:session:9', (public.acquire_schedule_edit_session_service(
  tests.user('ap:nil'), tests.id('ap'), tests.week(9), 'blank', null) -> 'session' ->> 'id')::uuid);
insert into public.shift_types (id, workspace_id, name, default_start_time, default_end_time)
values (tests.remember('ap:type:dusk', gen_random_uuid()), tests.id('ap'), 'Dusk', '10:00', '14:00');
select tests.remember('ap:dusk', (x ->> 'id')::uuid) from jsonb_array_elements(public.mutate_schedule_edit_shift_service(tests.user('ap:nil'), tests.id('ap'),
  tests.id('ap:session:9'), pg_temp.rev(tests.id('ap:session:9')), 'create', gen_random_uuid(), null,
  (pg_temp.shift('veli', 9, 2) - 'start_time' - 'end_time') || jsonb_build_object('time_basis', 'type_default', 'shift_type_id', tests.id('ap:type:dusk')),
  gen_random_uuid()) -> 'shifts') x
where x ->> 'employee_id' = tests.id('ap:veli')::text;
update public.shift_types set default_start_time = '18:00', default_end_time = '22:00' where id = tests.id('ap:type:dusk');
insert into ap select 'dusk', public.preview_schedule_default_hours_service(tests.user('ap:nil'), tests.id('ap'), tests.id('ap:session:9'),
  jsonb_build_object('expected_session_revision', pg_temp.rev(tests.id('ap:session:9')), 'starts_on', tests.week(9), 'ends_on', tests.week(9) + 6,
  'shift_ids', jsonb_build_array(tests.id('ap:dusk')), 'overrides', '[]'::jsonb));
select is((select (s ->> 'will_change')::boolean from ap, jsonb_array_elements(v -> 'shifts') s where k = 'dusk'), true,
  'the review moves Veli into the noted evening');
select is((select count(*)::integer from ap, jsonb_array_elements(v -> 'shifts') s, jsonb_array_elements(s -> 'after_assessment' -> 'reasons') r
  where k = 'dusk' and r ->> 'code' = 'note'), 0, 'a shift lead who cannot read the note does not get it there either');

-- 10. VAR-UYG-DB review: Emre's Tuesday at Kadikoy moves to Besiktas on Friday
-- and only Besiktas is published, so the shift sits in both current
-- publications. The draft still opens in Edit mode, with one answer per shift.
select tests.world('dp');
select tests.person('dp', 'emre', 'employee', array['K', 'B'], array['cook']);
insert into ap select 'dp:draft', to_jsonb(tests.publish_week('dp', 3,
  '[{"label": "x", "loc": "K", "person": "emre", "job": "cook", "day": 1, "start": "18:00", "end": "22:00"},
    {"label": "y", "loc": "B", "person": "emre", "job": "cook", "day": 2, "start": "10:00", "end": "14:00"}]'));
create function pg_temp.dp_move() returns void language plpgsql as $$
declare
  d uuid := (select (v #>> '{}')::uuid from ap where k = 'dp:draft');
  x uuid := (select source_shift_id from public.schedule_published_shifts where id = tests.id('dp:shift:x'));
  sid uuid;
  payload jsonb;
  preview jsonb;
begin
  sid := (public.acquire_schedule_edit_session_service(tests.user('dp:owner'), tests.id('dp'), tests.week(3), 'draft', d)
    -> 'session' ->> 'id')::uuid;
  payload := jsonb_build_object('location_id', tests.id('dp:B'), 'employee_id', tests.id('dp:emre'), 'job_id', tests.id('dp:job:cook'),
    'scheduled_date', tests.week(3) + 4, 'time_basis', 'explicit', 'start_time', '08:00', 'end_time', '12:00',
    'time_timezone', 'Europe/Istanbul', 'note', '', 'hide_time_on_badge', false, 'label_ids', '[]'::jsonb, 'label_names', '[]'::jsonb);
  payload := payload || jsonb_build_object('availability_assessment_fingerprint',
    public.assess_schedule_shift_service(tests.user('dp:owner'), tests.id('dp'), payload, x, sid) ->> 'fingerprint');
  perform public.mutate_schedule_edit_shift_service(tests.user('dp:owner'), tests.id('dp'), sid,
    (select revision from public.schedule_edit_sessions where id = sid), 'update', x,
    (select revision from public.schedule_edit_session_shifts where session_id = sid and id = x), payload, gen_random_uuid());
  perform public.save_schedule_edit_session_service(tests.user('dp:owner'), tests.id('dp'), sid,
    (select revision from public.schedule_edit_sessions where id = sid), 'moved', d, (select revision from public.schedule_drafts where id = d));
  preview := public.preview_schedule_publication_service(tests.user('dp:owner'), tests.id('dp'), d, array[tests.id('dp:B')], null, true);
  perform public.publish_schedule_draft_service(tests.user('dp:owner'), tests.id('dp'), d, array[tests.id('dp:B')], null, true,
    (select revision from public.schedule_drafts where id = d), preview ->> 'fingerprint', '[]'::jsonb);
end;
$$;
select pg_temp.dp_move();
select is((select count(*)::integer from public.schedule_published_shifts p
  join public.schedule_location_publications l on l.id = p.publication_id and l.status = 'current'
  where p.source_shift_id = (select source_shift_id from public.schedule_published_shifts where id = tests.id('dp:shift:x'))),
  2, 'the moved shift is in both current publications');
select lives_ok($$select public.acquire_schedule_edit_session_service(tests.user('dp:owner'), tests.id('dp'), tests.week(3), 'draft',
  (select (v #>> '{}')::uuid from ap where k = 'dp:draft'))$$,
  'the draft still opens in Edit mode');

select * from finish();
rollback;
