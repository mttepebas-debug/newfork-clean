begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- BL-174 (EKRAN-01 DB-4): a shift already published keeps the conflict that
-- was accepted when it went out, but what nobody can set aside -- approved
-- time off, hours that cannot be read -- still stops it at the write, the
-- same as the publish preview says. Before this, finding the shift in the
-- last publish skipped every check, so a path writing straight to the
-- published table could put Ali on a day he has approved time off.

select tests.world('pr');
select tests.person('pr', 'ali', 'employee', array['K'], array['cook']);
select tests.person('pr', 'emre', 'employee', array['K'], array['cook']);

select tests.publish_week('pr', 1, $$[
  {"label": "ali_tue", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "13:00"},
  {"label": "ali_thu", "person": "ali", "loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "13:00"},
  {"label": "emre_tue", "person": "emre", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "13:00"},
  {"label": "open_tue", "loc": "K", "job": "cook", "day": 1, "start": "14:00", "end": "18:00"}
]$$::jsonb);

-- After the publish, Ali gets Tuesday off, approved.
select tests.approved_leave(tests.id('pr'), tests.id('pr:ali'), tests.user('pr:owner'), tests.id('pr:K'), tests.week(1) + 1);

-- The next version of Kadikoy's week, written straight to the table.
select tests.remember('pr:v2', gen_random_uuid());
insert into public.schedule_location_publications (id, workspace_id, location_id, week_start, version_number, status, published_by)
select tests.id('pr:v2'), workspace_id, location_id, week_start, version_number + 1, 'superseded', tests.user('pr:owner')
from public.schedule_location_publications where id = (
  select publication_id from public.schedule_published_shifts where id = tests.id('pr:shift:ali_tue'));
create function pg_temp.copy(label text) returns void language sql as $$
  insert into public.schedule_published_shifts (workspace_id, location_id, publication_id, employee_id, job_id,
    scheduled_date, start_time, end_time, note, source_shift_id, unpaid_break_minutes, hide_time_on_badge,
    label_ids, label_names, time_basis, time_snapshot, time_timezone)
  select workspace_id, location_id, tests.id('pr:v2'), employee_id, job_id, scheduled_date, start_time, end_time, note,
    source_shift_id, unpaid_break_minutes, hide_time_on_badge, label_ids, label_names, time_basis, time_snapshot, time_timezone
  from public.schedule_published_shifts where id = tests.id('pr:shift:' || label)
$$;

select throws_ok($$select pg_temp.copy('ali_tue')$$, '23514', 'Resolve shift hours or approved time off before this assignment',
  'Ali''s Tuesday shift cannot go out again over his approved time off');

select lives_ok($$select pg_temp.copy('ali_thu')$$, 'his Thursday shift, away from the time off, goes out again');
select lives_ok($$select pg_temp.copy('emre_tue')$$, 'Emre''s Tuesday shift goes out again');
select lives_ok($$select pg_temp.copy('open_tue')$$, 'the open shift goes out again');
select is(
  (select n.availability_snapshot from public.schedule_published_shifts n
   where n.publication_id = tests.id('pr:v2') and n.employee_id = tests.id('pr:emre')),
  (select o.availability_snapshot from public.schedule_published_shifts o where o.id = tests.id('pr:shift:emre_tue')),
  'a shift that goes out again keeps what was seen when it first went out');

-- Opening the published week to edit still works: the draft is where Ali's
-- Tuesday gets fixed.
select lives_ok($$select public.acquire_schedule_edit_session_service(tests.user('pr:owner'), tests.id('pr'), tests.week(1), 'published', null)$$,
  'the owner can still open the published week to edit');

select * from finish();
rollback;
