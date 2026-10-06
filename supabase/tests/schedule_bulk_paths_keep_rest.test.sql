begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- BL-191 (EKRAN-01 DB-4, measurement): do template apply and auto-fill check
-- the new shifts they give one person against each other? Measured 2026-10-06:
--   overlap  template turns the second overlapping shift into an open one;
--            auto-fill refuses the second assignment ("no longer eligible").
--   rest     neither checks it, but the write trigger does: the whole apply
--            stops with 23514 "A current conflict acceptance is required" and
--            nothing is written. The rule never breaks; the person applying
--            gets a raw error and no week. Auto-fill even proposes the pair.
-- Locks what holds today; the 23514 cells change when the follow-up decides
-- what a bulk path does with a rest conflict.

select tests.world('br');
select tests.person('br', 'deniz', 'employee', array['K'], array['cook']);

create function pg_temp.template(shifts text) returns uuid language plpgsql as $$
declare t uuid := gen_random_uuid();
begin
  insert into public.schedule_templates (id, workspace_id, name, created_by, updated_by)
  values (t, tests.id('br'), 'bulk ' || substr(t::text, 1, 8), tests.user('br:owner'), tests.user('br:owner'));
  insert into public.schedule_template_shifts (workspace_id, template_id, location_id, employee_id, job_id, day_offset,
    start_time, end_time, time_basis, time_timezone)
  select tests.id('br'), t, tests.id('br:K'), tests.id('br:deniz'), tests.id('br:job:cook'), (v ->> 0)::integer,
    (v ->> 1)::time, (v ->> 2)::time, 'explicit', 'Europe/Istanbul'
  from jsonb_array_elements(shifts::jsonb) v;
  return t;
end $$;
create function pg_temp.session(n integer) returns uuid language sql as $$
  select (public.acquire_schedule_edit_session_service(tests.user('br:owner'), tests.id('br'), tests.week(n), 'blank', null)
    -> 'session' ->> 'id')::uuid
$$;
create function pg_temp.apply(session uuid, template uuid) returns jsonb language sql as $$
  select public.apply_schedule_template_service(tests.user('br:owner'), tests.id('br'), session,
    (select revision from public.schedule_edit_sessions where id = session), template, 'merge', null)
$$;
create function pg_temp.deniz(session uuid) returns integer language sql as $$
  select count(*)::integer from public.schedule_edit_session_shifts
  where session_id = session and employee_id = tests.id('br:deniz')
$$;

-- 1. Overlap: Wednesday 09-15 and 13-19 ------------------------------------------

select tests.remember('br:s1', pg_temp.session(1));
select lives_ok(format('select pg_temp.apply(%L, %L)', tests.id('br:s1'),
  pg_temp.template('[[2, "09:00", "15:00"], [2, "13:00", "19:00"]]')), 'a template with two overlapping shifts applies');
select is(pg_temp.deniz(tests.id('br:s1')), 1, 'Deniz holds one of them');
select is((select count(*)::integer from public.schedule_edit_session_shifts where session_id = tests.id('br:s1') and employee_id is null),
  1, 'the other comes in open');

-- 2. Rest: ten hours between shifts; Monday 16-23 and Tuesday 05-10 leave six -------

update public.workspace_scheduling_settings set minimum_rest_minutes = 600 where workspace_id = tests.id('br');

select tests.remember('br:s2', pg_temp.session(2));
select throws_ok(format('select pg_temp.apply(%L, %L)', tests.id('br:s2'),
  pg_temp.template('[[0, "16:00", "23:00"], [1, "05:00", "10:00"]]')), '23514', 'A current conflict acceptance is required',
  'a template whose two shifts break the rest rule stops at the write');
select is(pg_temp.deniz(tests.id('br:s2')), 0, 'nothing of it is written');

-- 3. Auto-fill on the same pair, open --------------------------------------------

select tests.remember('br:s3', pg_temp.session(3));
select tests.add_shift(tests.user('br:owner'), 'br', tests.id('br:s3'), 3, '{"loc": "K", "job": "cook", "day": 0, "start": "16:00", "end": "23:00"}');
select tests.add_shift(tests.user('br:owner'), 'br', tests.id('br:s3'), 3, '{"loc": "K", "job": "cook", "day": 1, "start": "05:00", "end": "10:00"}');
create temp table br_preview as
  select public.preview_schedule_auto_fill_service(tests.user('br:owner'), tests.id('br'), tests.id('br:s3')) p;

select is((select count(*)::integer from br_preview, jsonb_array_elements(p -> 'proposals') x, jsonb_array_elements(x -> 'candidates') c
  where c ->> 'employee_id' = tests.id('br:deniz')::text), 2, 'auto-fill proposes Deniz for both');
select throws_ok(format($$select public.apply_schedule_auto_fill_service(tests.user('br:owner'), tests.id('br'), %L,
    (select revision from public.schedule_edit_sessions where id = %L), %L, %L)$$,
  tests.id('br:s3'), tests.id('br:s3'), (select p ->> 'fingerprint' from br_preview),
  (select jsonb_agg(jsonb_build_object('shift_id', x ->> 'shift_id', 'employee_id', tests.id('br:deniz'))) from br_preview, jsonb_array_elements(p -> 'proposals') x)),
  '23514', 'A current conflict acceptance is required', 'taking both stops at the write');
select is(pg_temp.deniz(tests.id('br:s3')), 0, 'neither is assigned');

select * from finish();
rollback;
