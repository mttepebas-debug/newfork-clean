begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- BL-197 (user decision 2026-09-26): applying a template writes its shifts
-- without a label archived since, and says which labels were left off.
-- "Standard week" has two Kadikoy shifts tagged Standby, one also Opener.
-- Standby is archived in Settings > Shift labels; applying the template
-- writes both shifts, Opener stays, Standby does not, and the answer says
-- "Standby" was left off 2 shifts.

select tests.world('al');
select tests.shift_label('al', 'Standby');
select tests.shift_label('al', 'Opener');

-- ponytail: stored as it is; a template is saved from a whole edit.
insert into public.schedule_templates (workspace_id, name, created_by, updated_by)
values (tests.id('al'), 'Standard week', tests.user('al:owner'), tests.user('al:owner'));
select tests.remember('al:template', (select id from public.schedule_templates where workspace_id = tests.id('al')));
insert into public.schedule_template_shifts (workspace_id, template_id, location_id, job_id, day_offset, start_time, end_time,
  time_basis, time_timezone, label_ids, label_names)
values
  (tests.id('al'), tests.id('al:template'), tests.id('al:K'), tests.id('al:job:cook'), 1, '09:00', '15:00', 'explicit', 'Europe/Istanbul',
   array[tests.id('al:label:standby'), tests.id('al:label:opener')], array['Standby', 'Opener']),
  (tests.id('al'), tests.id('al:template'), tests.id('al:K'), tests.id('al:job:cook'), 2, '09:00', '15:00', 'explicit', 'Europe/Istanbul',
   array[tests.id('al:label:standby')], array['Standby']);
update public.shift_labels set archived_at = now() where id = tests.id('al:label:standby');

create function pg_temp.apply(week integer) returns jsonb language sql as $$
  select public.apply_schedule_template_service(tests.user('al:owner'), tests.id('al'), s.id, s.revision, tests.id('al:template'), 'merge')
  from public.schedule_edit_sessions s where s.id = tests.id('al:session:' || week)
$$;
select tests.remember('al:session:1', (public.acquire_schedule_edit_session_service(
  tests.user('al:owner'), tests.id('al'), tests.week(1), 'blank', null) -> 'session' ->> 'id')::uuid);
create temporary table al_result as select pg_temp.apply(1) as answer;

select is((select (answer ->> 'applied_shift_count')::integer from al_result), 2, 'both shifts are written');
select is(
  array(select array_to_string(s.label_names, ',') from public.schedule_edit_session_shifts s
        where s.session_id = tests.id('al:session:1') order by s.scheduled_date),
  array['Opener', ''], 'Opener stays; the archived Standby is on neither shift');
select is(
  (select count(*)::integer from public.schedule_edit_session_shifts s
   where s.session_id = tests.id('al:session:1') and tests.id('al:label:standby') = any (s.label_ids)),
  0, 'no shift carries the archived label''s id either');
select is((select answer -> 'skipped' from al_result),
  '[{"kind": "archived_label", "name": "Standby", "shift_count": 2}]'::jsonb,
  'the answer says Standby was left off 2 shifts');

-- A template whose labels are all active says nothing was left off.
update public.shift_labels set archived_at = null where id = tests.id('al:label:standby');
select tests.remember('al:session:2', (public.acquire_schedule_edit_session_service(
  tests.user('al:owner'), tests.id('al'), tests.week(2), 'blank', null) -> 'session' ->> 'id')::uuid);
create temporary table al_again as select pg_temp.apply(2) as answer;
select is((select answer -> 'skipped' from al_again), '[]'::jsonb, 'with every label active nothing is left off');
select is(
  (select count(*)::integer from public.schedule_edit_session_shifts s
   where s.session_id = tests.id('al:session:2') and tests.id('al:label:standby') = any (s.label_ids)),
  2, 'and Standby is written on both shifts');

select * from finish();
rollback;
