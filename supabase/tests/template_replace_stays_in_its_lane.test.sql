begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- EKRAN-01 DB-3 (KARARLAR Schedule, Mert 2026-10-05; D-O4, B-4, D-O2, D-O1).
-- Replace ("overwrite") clears only the template's own locations and
-- departments, never a shift that has started, and in a published week only
-- stages the published shift for removal. Before the second click the server
-- says how many shifts would go ("24 shifts will be removed."). A template
-- keeps each shift's unpaid break. A shift added to a published week is not a
-- copy of a published one.
--
-- Kadikoy (K) and Besiktas (B); Kitchen (Cook) and Bar (Bartender).
-- "Kadikoy kitchen" holds one Kadikoy Cook shift, Wednesday 09:00-17:00,
-- 30 minutes unpaid break.

select tests.world('tr');
select tests.remember('tr:job:bartender', (public.create_department_with_jobs_service(
  tests.user('tr:owner'), tests.id('tr'),
  '{"name": "Bar", "color": "#4478A8"}'::jsonb, '[{"name": "Bartender", "color": "#D39A36"}]'::jsonb
) -> 'jobs' -> 0 ->> 'id')::uuid);

-- ponytail: stored as it is, like template_apply_leaves_archived_labels.
insert into public.schedule_templates (workspace_id, name, created_by, updated_by)
values (tests.id('tr'), 'Kadikoy kitchen', tests.user('tr:owner'), tests.user('tr:owner'));
select tests.remember('tr:template', (select id from public.schedule_templates where workspace_id = tests.id('tr')));
insert into public.schedule_template_shifts (workspace_id, template_id, location_id, job_id, day_offset, start_time, end_time,
  time_basis, time_timezone)
values (tests.id('tr'), tests.id('tr:template'), tests.id('tr:K'), tests.id('tr:job:cook'), 2, '09:00', '17:00',
  'explicit', 'Europe/Istanbul');
-- A separate statement so the rest of the file still reads before the column exists.
update public.schedule_template_shifts set unpaid_break_minutes = 30 where template_id = tests.id('tr:template');

create function pg_temp.session(n integer, source text) returns uuid language sql as $$
  select (public.acquire_schedule_edit_session_service(tests.user('tr:owner'), tests.id('tr'), tests.week(n),
    source::public.schedule_edit_source, null) -> 'session' ->> 'id')::uuid
$$;
create function pg_temp.rev(session uuid) returns integer language sql as $$
  select revision from public.schedule_edit_sessions where id = session
$$;
create function pg_temp.replace(session uuid) returns jsonb language sql as $$
  select public.apply_schedule_template_service(tests.user('tr:owner'), tests.id('tr'), session, pg_temp.rev(session),
    tests.id('tr:template'), 'overwrite')
$$;
create function pg_temp.at(session uuid, n integer, loc text, job text, day integer) returns integer language sql as $$
  select count(*)::integer from public.schedule_edit_session_shifts s
  where s.session_id = session and s.location_id = tests.id('tr:' || loc) and s.job_id = tests.id('tr:job:' || job)
    and s.scheduled_date = tests.week(n) + day
$$;

-- 1. A draft week: Kadikoy Cook Monday goes; Kadikoy Bar and Besiktas stay -------------

select tests.remember('tr:s1', pg_temp.session(1, 'blank'));
select tests.add_shift(tests.user('tr:owner'), 'tr', tests.id('tr:s1'), 1,
  '{"loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "17:00"}');
select tests.add_shift(tests.user('tr:owner'), 'tr', tests.id('tr:s1'), 1,
  '{"loc": "K", "job": "bartender", "day": 0, "start": "09:00", "end": "17:00"}');
select tests.add_shift(tests.user('tr:owner'), 'tr', tests.id('tr:s1'), 1,
  '{"loc": "B", "job": "cook", "day": 0, "start": "09:00", "end": "17:00"}');
-- ponytail: no product path puts a shift that has already started into a
-- future week; Replace only reads the clock, so one is placed yesterday.
insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, job_id, scheduled_date,
  start_time, end_time, time_basis, time_timezone)
values (tests.remember('tr:started', gen_random_uuid()), tests.id('tr'), tests.id('tr:s1'), tests.id('tr:K'),
  tests.id('tr:job:cook'), current_date - 1, '09:00', '17:00', 'explicit', 'Europe/Istanbul');

create temporary table tr_before as select pg_temp.rev(tests.id('tr:s1')) as revision;
select is(
  public.preview_schedule_template_apply_service(tests.user('tr:owner'), tests.id('tr'), tests.id('tr:s1'),
    tests.id('tr:template')) -> 'removed_shift_count',
  '1'::jsonb,
  'before the second click the server says one shift will be removed');
select is(pg_temp.rev(tests.id('tr:s1')), (select revision from tr_before), 'the preview writes nothing');

select pg_temp.replace(tests.id('tr:s1'));

select is(pg_temp.at(tests.id('tr:s1'), 1, 'K', 'cook', 0), 0, 'the Kadikoy Cook shift is replaced');
select is(pg_temp.at(tests.id('tr:s1'), 1, 'B', 'cook', 0), 1, 'Besiktas is not in the template: its shift stays');
select is(pg_temp.at(tests.id('tr:s1'), 1, 'K', 'bartender', 0), 1, 'Bar is not in the template: the Kadikoy Bar shift stays');
select ok(exists (select 1 from public.schedule_edit_session_shifts where id = tests.id('tr:started')),
  'a shift that has already started is not touched');
select is(pg_temp.at(tests.id('tr:s1'), 1, 'K', 'cook', 2), 1, 'the template''s Wednesday shift is written');

-- 2. The unpaid break travels: saved into a template and applied back -----------------

select is(
  (select unpaid_break_minutes from public.schedule_edit_session_shifts s
   where s.session_id = tests.id('tr:s1') and s.scheduled_date = tests.week(1) + 2),
  30, 'applying a template keeps its 30-minute break');

update public.schedule_edit_session_shifts set unpaid_break_minutes = 45
where session_id = tests.id('tr:s1') and location_id = tests.id('tr:B');
delete from public.schedule_edit_session_shifts where id = tests.id('tr:started');
select tests.remember('tr:draft', (public.save_schedule_edit_session_service(tests.user('tr:owner'), tests.id('tr'),
  tests.id('tr:s1'), pg_temp.rev(tests.id('tr:s1')), 'Break week', null, null) ->> 'id')::uuid);
select public.create_schedule_template_service(tests.user('tr:owner'), tests.id('tr'), tests.id('tr:draft'), 'Break week', false);
select is(
  (select t.unpaid_break_minutes from public.schedule_template_shifts t
   join public.schedule_templates template on template.id = t.template_id and template.name = 'Break week'
   where t.location_id = tests.id('tr:B')),
  45, 'saving a template keeps each shift''s break');

-- 3. A published week: the published copy is staged, a new shift is not a copy --------

select tests.publish_week('tr', 3, '[{"label": "kcook", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "17:00"}]');
select tests.remember('tr:s3', pg_temp.session(3, 'published'));
select tests.remember('tr:new', tests.add_shift(tests.user('tr:owner'), 'tr', tests.id('tr:s3'), 3,
  '{"loc": "K", "job": "cook", "day": 4, "start": "09:00", "end": "17:00"}'));

select ok(
  (select source_published_shift_id is null and not locked from public.schedule_edit_session_shifts
   where id = tests.id('tr:new')),
  'a shift added to a published week is not a copy of a published shift (no "Live" mark)');

select pg_temp.replace(tests.id('tr:s3'));

select is(
  (select pending_op_type from public.schedule_edit_session_shifts s
   where s.session_id = tests.id('tr:s3') and s.source_published_shift_id is not null and s.scheduled_date = tests.week(3)),
  'delete', 'the published Monday shift is staged for removal, not deleted');
select ok(not exists (select 1 from public.schedule_edit_session_shifts where id = tests.id('tr:new')),
  'the new Friday shift was only a draft: it goes');
select ok(
  (select bool_and(source_published_shift_id is null and not locked) from public.schedule_edit_session_shifts s
   where s.session_id = tests.id('tr:s3') and s.scheduled_date = tests.week(3) + 2),
  'the template''s shift in a published week is not a published copy either');

-- 4. Who may ask ------------------------------------------------------------------------

select tests.person('tr', 'ali', 'employee', array['K'], array['cook']);
select throws_ok(
  format($$select public.preview_schedule_template_apply_service(%L, %L, %L, %L)$$,
    tests.user('tr:ali'), tests.id('tr'), tests.id('tr:s1'), tests.id('tr:template')),
  '42501', null, 'an employee cannot ask what a template would replace');

-- 5. Review round 1 -------------------------------------------------------------------

create function pg_temp.said(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;
create function pg_temp.preview_said(actor text, session uuid, template uuid, keys text default 'null') returns text
language sql as $$
  select pg_temp.said(format('select public.preview_schedule_template_apply_service(%L, %L, %L, %L, %s)',
    tests.user(actor), tests.id('tr'), session, template, keys))
$$;
create function pg_temp.apply_said(session uuid, template uuid, keys text) returns text language sql as $$
  select pg_temp.said(format('select public.apply_schedule_template_service(%L, %L, %L, %s, %L, %L, %s)',
    tests.user('tr:owner'), tests.id('tr'), session, pg_temp.rev(session), template, 'overwrite', keys))
$$;
create function pg_temp.removed(session uuid, template uuid, keys text[] default null) returns jsonb language sql as $$
  select public.preview_schedule_template_apply_service(tests.user('tr:owner'), tests.id('tr'), session, template, keys)
    -> 'removed_shift_count'
$$;

-- (a) Location and department as a pair. "Mixed" writes Kadikoy Cook and
-- Besiktas Bartender; Kadikoy Bar and Besiktas Kitchen stay (P09).
insert into public.schedule_templates (workspace_id, name, created_by, updated_by)
values (tests.id('tr'), 'Mixed', tests.user('tr:owner'), tests.user('tr:owner'));
select tests.remember('tr:mixed', (select id from public.schedule_templates where workspace_id = tests.id('tr') and name = 'Mixed'));
insert into public.schedule_template_shifts (workspace_id, template_id, location_id, job_id, day_offset, start_time, end_time,
  time_basis, time_timezone)
values (tests.id('tr'), tests.id('tr:mixed'), tests.id('tr:K'), tests.id('tr:job:cook'), 1, '09:00', '17:00', 'explicit', 'Europe/Istanbul'),
       (tests.id('tr'), tests.id('tr:mixed'), tests.id('tr:B'), tests.id('tr:job:bartender'), 1, '09:00', '17:00', 'explicit', 'Europe/Istanbul');
select tests.remember('tr:s5', pg_temp.session(5, 'blank'));
select tests.add_shift(tests.user('tr:owner'), 'tr', tests.id('tr:s5'), 5, x::jsonb) from unnest(array[
  '{"loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "17:00"}',
  '{"loc": "K", "job": "bartender", "day": 0, "start": "09:00", "end": "17:00"}',
  '{"loc": "B", "job": "cook", "day": 0, "start": "09:00", "end": "17:00"}',
  '{"loc": "B", "job": "bartender", "day": 0, "start": "09:00", "end": "17:00"}']) x;
select is(pg_temp.removed(tests.id('tr:s5'), tests.id('tr:mixed')), '2'::jsonb,
  'Replace takes only the template''s (location, department) pairs: 2 of 4');
select is(pg_temp.removed(tests.id('tr:s5'), tests.id('tr:template'),
  array[(select department_id::text from public.jobs where id = tests.id('tr:job:bartender'))]), '0'::jsonb,
  'picking Bar for a Kitchen-only template takes nothing away');
select pg_temp.replace(tests.id('tr:s5'));
select is((select count(*)::integer from public.schedule_edit_session_shifts s
  where s.session_id = tests.id('tr:s5') and s.scheduled_date = tests.week(5)), 3,
  'a Kadikoy Kitchen template takes only the Kadikoy Cook shift');

-- (b) Department keys: the preview and the apply give the same answer.
select is(pg_temp.preview_said('tr:owner', tests.id('tr:s5'), tests.id('tr:template'), $q$array['nope']$q$), '22023',
  'a bad key: 22023 in the preview');
select is(pg_temp.apply_said(tests.id('tr:s5'), tests.id('tr:template'), $q$array['nope']$q$), '22023',
  'and in the apply');
select is(pg_temp.preview_said('tr:owner', tests.id('tr:s5'), tests.id('tr:template'), $q$'{}'::text[]$q$), '22023',
  'no department picked: 22023 in the preview too');
select tests.remember('tr:s_empty', pg_temp.session(7, 'blank'));
select is(pg_temp.preview_said('tr:owner', tests.id('tr:s_empty'), tests.id('tr:template'), $q$array['nope']$q$), '22023',
  'review round 2: an empty edit still refuses a bad key in the preview');
select is(pg_temp.preview_said('tr:owner', tests.id('tr:s5'), tests.id('tr:template'), format('array[%L]', gen_random_uuid())),
  'P0002', 'an unknown department: P0002 in the preview, as in the apply');

-- (c) A shift under way this very hour, in the edited week, stays.
create temporary table tr_now as
-- An hour ago, but never before this week began: in the first hour of Monday in
-- Istanbul an hour ago is last week, which the edit lock calls past (CI, Sunday 21:20 UTC).
  select greatest((now() at time zone 'Europe/Istanbul') - interval '1 hour',
    date_trunc('week', now() at time zone 'Europe/Istanbul')) as started_at;
select tests.remember('tr:s_now', (public.acquire_schedule_edit_session_service(tests.user('tr:owner'), tests.id('tr'),
  (select date_trunc('week', started_at)::date from tr_now), 'blank', null) -> 'session' ->> 'id')::uuid);
-- ponytail: written directly; the screen adds a started shift only through the
-- past-edit flow, and Replace only reads the clock.
insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, job_id, scheduled_date,
  start_time, end_time, time_basis, time_timezone)
select tests.remember('tr:running', gen_random_uuid()), tests.id('tr'), tests.id('tr:s_now'), tests.id('tr:K'),
  tests.id('tr:job:cook'), started_at::date, started_at::time, (started_at + interval '8 hours')::time,
  'explicit', 'Europe/Istanbul'
from tr_now;
select pg_temp.replace(tests.id('tr:s_now'));
select ok(exists (select 1 from public.schedule_edit_session_shifts where id = tests.id('tr:running')),
  'a shift under way in the edited week stays');

-- (d) Who else gets no answer.
select tests.world('tr2');
select is(pg_temp.said(format('select public.preview_schedule_template_apply_service(%L, %L, %L, %L)',
  tests.user('tr2:owner'), tests.id('tr'), tests.id('tr:s5'), tests.id('tr:template'))), '42501',
  'another workspace''s owner: 42501');
select tests.person('tr', 'zeynep', 'admin', array['K', 'B'], array['cook']);
select is(pg_temp.preview_said('tr:zeynep', tests.id('tr:s5'), tests.id('tr:template')), 'P0002',
  'someone else''s edit: P0002, as the apply says');
select tests.person('tr', 'can', 'manager', array['B'], array['cook']);
select tests.remember('tr:s_can', (public.acquire_schedule_edit_session_service(tests.user('tr:can'), tests.id('tr'),
  tests.week(6), 'blank', null) -> 'session' ->> 'id')::uuid);
select is(pg_temp.said(format('select public.preview_schedule_template_apply_service(%L, %L, %L, %L)',
  tests.user('tr:can'), tests.id('tr'), tests.id('tr:s_can'), tests.id('tr:template'))), '23503',
  'a Besiktas manager with a Kadikoy template: 23503, as the apply says');

select * from finish();
rollback;
