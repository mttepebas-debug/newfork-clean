begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- EKRAN-01 DB-1c (S2, KK-171): Undo takes the last step back on the server
-- too, in one piece. A move, a paste, a template, Auto-fill: whatever the step
-- touched goes back to how it was, or nothing changes. Only the edit's own
-- holder undoes it; nobody else's edit moves. A saved step is not undone (the
-- save closes the edit).
-- Ayşe and Zeynep manage Kadıköy (K); Can manages Kadıköy and Beşiktaş (B).
-- Ali and Emre cook at Kadıköy.

select tests.world('ud');
select tests.person('ud', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('ud', 'zeynep', 'manager', array['K'], array['cook']);
select tests.person('ud', 'can', 'manager', array['K', 'B'], array['cook']);
select tests.person('ud', 'ali', 'employee', array['K'], array['cook']);
select tests.person('ud', 'emre', 'employee', array['K'], array['cook']);
select tests.publish_week('ud', 2, '[
  {"label": "p1", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "17:00"},
  {"label": "p2", "person": "emre", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "17:00"}
]');

create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare code text; reason text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = message_text;
  return code || ' ' || reason;
end;
$$;
create function pg_temp.open(actor text, n integer, source text, locs text[] default null) returns uuid language sql as $$
  select (public.acquire_schedule_edit_session_service(tests.user('ud:' || actor), tests.id('ud'), tests.week(n),
    source::public.schedule_edit_source, null,
    case when locs is not null then array(select tests.id('ud:' || l) from unnest(locs) l) end) -> 'session' ->> 'id')::uuid
$$;
create function pg_temp.rev(session uuid) returns integer language sql as $$
  select revision from public.schedule_edit_sessions where id = session
$$;
create function pg_temp.shift(person text, n integer, day integer, loc text default 'K') returns jsonb language sql as $$
  select jsonb_build_object('location_id', tests.id('ud:' || loc),
    'employee_id', case when person is not null then tests.id('ud:' || person) end,
    'job_id', tests.id('ud:job:cook'), 'scheduled_date', tests.week(n) + day, 'time_basis', 'explicit',
    'start_time', '18:00', 'end_time', '22:00', 'time_timezone', 'Europe/Istanbul', 'note', '')
$$;
create function pg_temp.add(actor text, session uuid, shift jsonb) returns uuid language plpgsql as $$
declare id uuid := gen_random_uuid();
begin
  perform public.mutate_schedule_edit_shift_service(tests.user('ud:' || actor), tests.id('ud'), session,
    pg_temp.rev(session), 'create', id, null, shift, gen_random_uuid());
  return id;
end;
$$;
-- What the screen sends when a card is dragged or edited: the row with a change.
create function pg_temp.change(actor text, session uuid, shift uuid, patch jsonb) returns jsonb language sql as $$
  select public.mutate_schedule_edit_shift_service(tests.user('ud:' || actor), tests.id('ud'), session,
    pg_temp.rev(session), 'update', shift, s.revision, to_jsonb(s) || patch, null)
  from public.schedule_edit_session_shifts s where s.session_id = session and s.id = shift
$$;
create function pg_temp.remove(actor text, session uuid, shift uuid) returns jsonb language sql as $$
  select public.mutate_schedule_edit_shift_service(tests.user('ud:' || actor), tests.id('ud'), session,
    pg_temp.rev(session), 'delete', shift, s.revision, null, null)
  from public.schedule_edit_session_shifts s where s.session_id = session and s.id = shift
$$;
create function pg_temp.paste(actor text, session uuid, shifts jsonb) returns jsonb language sql as $$
  select public.create_schedule_shifts_batch_service(tests.user('ud:' || actor), tests.id('ud'), session,
    pg_temp.rev(session), shifts, gen_random_uuid())
$$;
create function pg_temp.undo(actor text, session uuid, back_to integer) returns jsonb language sql as $$
  select public.undo_schedule_edit_session_service(tests.user('ud:' || actor), tests.id('ud'), session,
    pg_temp.rev(session), back_to)
$$;
-- What the edit holds, comparable before and after: every row but its revision and clock.
create function pg_temp.state(session uuid) returns jsonb language sql as $$
  select coalesce(jsonb_agg(to_jsonb(s) - 'revision' - 'updated_at' order by s.id), '[]'::jsonb)
  from public.schedule_edit_session_shifts s where s.session_id = session
$$;
create function pg_temp.row_of(session uuid, shift uuid) returns public.schedule_edit_session_shifts language sql as $$
  select s from public.schedule_edit_session_shifts s where s.session_id = session and s.id = shift
$$;

-- 1. Ayşe drags Ali's Tuesday to Wednesday and presses Undo (KARARLAR Schedule) --

select tests.remember('ud:e1', pg_temp.open('ayse', 1, 'blank'));
select tests.remember('ud:e1:tue', pg_temp.add('ayse', tests.id('ud:e1'), pg_temp.shift('ali', 1, 1)));
create temp table ud_before as select pg_temp.state(tests.id('ud:e1')) v;
create temp table ud_mark as select pg_temp.rev(tests.id('ud:e1')) v;
select pg_temp.change('ayse', tests.id('ud:e1'), tests.id('ud:e1:tue'),
  jsonb_build_object('scheduled_date', tests.week(1) + 2));
select is((pg_temp.row_of(tests.id('ud:e1'), tests.id('ud:e1:tue'))).scheduled_date, tests.week(1) + 2,
  'the move is on the server');
create temp table ud_answer as select pg_temp.undo('ayse', tests.id('ud:e1'), (select v from ud_mark)) v;
select is((pg_temp.row_of(tests.id('ud:e1'), tests.id('ud:e1:tue'))).scheduled_date, tests.week(1) + 1,
  'Undo puts Ali''s shift back on Tuesday on the server');
select is(pg_temp.state(tests.id('ud:e1')), (select v from ud_before), 'the edit is exactly as before the move');
select is((select (v ->> 'revision')::integer from ud_answer), pg_temp.rev(tests.id('ud:e1')),
  'the answer is the edit as the screen reloads it');
select cmp_ok(pg_temp.rev(tests.id('ud:e1')), '>', (select v from ud_mark) + 1, 'the edit''s revision moves on, never back');
-- The next step after Undo is not "session revision stale" (W-1b Done when 2).
select lives_ok($$select pg_temp.change('ayse', tests.id('ud:e1'), tests.id('ud:e1:tue'), '{"start_time": "10:00"}'::jsonb)$$,
  'the next step after Undo goes through');

-- 2. A paste of three shifts is one Undo (a template, Auto-fill, a paste: one step) -

truncate ud_mark; insert into ud_mark select pg_temp.rev(tests.id('ud:e1'));
truncate ud_before; insert into ud_before select pg_temp.state(tests.id('ud:e1'));
select pg_temp.paste('ayse', tests.id('ud:e1'), jsonb_build_array(
  pg_temp.shift('ali', 1, 3), pg_temp.shift('emre', 1, 3), pg_temp.shift(null, 1, 4)));
select is((select count(*)::integer from public.schedule_edit_session_shifts where session_id = tests.id('ud:e1')), 4,
  'the paste wrote three shifts, one revision each');
select pg_temp.undo('ayse', tests.id('ud:e1'), (select v from ud_mark));
select is(pg_temp.state(tests.id('ud:e1')), (select v from ud_before), 'one Undo takes the whole paste back');

-- 3. Steps go back one at a time, newest first -------------------------------------

create temp table ud_steps (step integer primary key, mark integer, state jsonb);
insert into ud_steps select 1, pg_temp.rev(tests.id('ud:e1')), pg_temp.state(tests.id('ud:e1'));
select tests.remember('ud:e1:fri', pg_temp.add('ayse', tests.id('ud:e1'), pg_temp.shift('emre', 1, 4)));
insert into ud_steps select 2, pg_temp.rev(tests.id('ud:e1')), pg_temp.state(tests.id('ud:e1'));
select pg_temp.change('ayse', tests.id('ud:e1'), tests.id('ud:e1:fri'), jsonb_build_object('employee_id', tests.id('ud:ali')));
insert into ud_steps select 3, pg_temp.rev(tests.id('ud:e1')), pg_temp.state(tests.id('ud:e1'));
select pg_temp.remove('ayse', tests.id('ud:e1'), tests.id('ud:e1:tue'));
select pg_temp.undo('ayse', tests.id('ud:e1'), (select mark from ud_steps where step = 3));
select is(pg_temp.state(tests.id('ud:e1')), (select state from ud_steps where step = 3), 'the delete is undone: Tuesday is back');
select is((pg_temp.row_of(tests.id('ud:e1'), tests.id('ud:e1:tue'))).id, tests.id('ud:e1:tue'), 'with its own id');
select pg_temp.undo('ayse', tests.id('ud:e1'), (select mark from ud_steps where step = 2));
select is(pg_temp.state(tests.id('ud:e1')), (select state from ud_steps where step = 2), 'then Friday is Emre''s again');
select pg_temp.undo('ayse', tests.id('ud:e1'), (select mark from ud_steps where step = 1));
select is(pg_temp.state(tests.id('ud:e1')), (select state from ud_steps where step = 1), 'then Friday is gone');
select is(pg_temp.refusal(format('select pg_temp.undo(%L, %L, %s)', 'ayse', tests.id('ud:e1'), pg_temp.rev(tests.id('ud:e1')))),
  '22023 undo unavailable', 'nothing is left to undo at the current revision');

-- 4. A published shift goes back to "published", not to a pending change ---------

select tests.remember('ud:e2', pg_temp.open('ayse', 2, 'published'));
select tests.remember('ud:e2:p1', (select source_shift_id from public.schedule_published_shifts where id = tests.id('ud:shift:p1')));
select tests.remember('ud:e2:p2', (select source_shift_id from public.schedule_published_shifts where id = tests.id('ud:shift:p2')));
truncate ud_before; insert into ud_before select pg_temp.state(tests.id('ud:e2'));
truncate ud_mark; insert into ud_mark select pg_temp.rev(tests.id('ud:e2'));
select pg_temp.change('ayse', tests.id('ud:e2'), tests.id('ud:e2:p1'), '{"start_time": "11:00"}'::jsonb);
select is((pg_temp.row_of(tests.id('ud:e2'), tests.id('ud:e2:p1'))).pending_op_type, 'update', 'the change is pending');
select pg_temp.undo('ayse', tests.id('ud:e2'), (select v from ud_mark));
select is((pg_temp.row_of(tests.id('ud:e2'), tests.id('ud:e2:p1'))).pending_op_type, null,
  'after Undo the shift is published again, not a pending change');
select is((pg_temp.row_of(tests.id('ud:e2'), tests.id('ud:e2:p1'))).locked, true, 'and locked as it was');
select is(pg_temp.state(tests.id('ud:e2')), (select v from ud_before), 'the edit is as it was opened');

truncate ud_mark; insert into ud_mark select pg_temp.rev(tests.id('ud:e2'));
select pg_temp.remove('ayse', tests.id('ud:e2'), tests.id('ud:e2:p2'));
select is((pg_temp.row_of(tests.id('ud:e2'), tests.id('ud:e2:p2'))).pending_op_type, 'delete', 'Emre''s Wednesday is marked to go');
select pg_temp.undo('ayse', tests.id('ud:e2'), (select v from ud_mark));
select is(pg_temp.state(tests.id('ud:e2')), (select v from ud_before), 'Undo takes the mark back');

-- 5. All or nothing ------------------------------------------------------------------

-- Ayşe deletes Ali's and Emre's evenings in one step; then Ali's Tuesday evening
-- is approved time off. Undo cannot put Ali back, so it puts nobody back.
select tests.remember('ud:e3', pg_temp.open('ayse', 3, 'blank'));
select tests.remember('ud:e3:ali', pg_temp.add('ayse', tests.id('ud:e3'), pg_temp.shift('ali', 3, 1)));
select tests.remember('ud:e3:emre', pg_temp.add('ayse', tests.id('ud:e3'), pg_temp.shift('emre', 3, 1)));
truncate ud_mark; insert into ud_mark select pg_temp.rev(tests.id('ud:e3'));
select public.bulk_delete_schedule_edit_shifts_service(tests.user('ud:ayse'), tests.id('ud'),
  array[tests.id('ud:e3:ali'), tests.id('ud:e3:emre')]);
select tests.approved_leave(tests.id('ud'), tests.id('ud:ali'), tests.user('ud:ali'), tests.id('ud:K'), tests.week(3) + 1, '17:00', '23:00');
truncate ud_before; insert into ud_before select pg_temp.state(tests.id('ud:e3'));
create temp table ud_rev as select pg_temp.rev(tests.id('ud:e3')) v;
select throws_ok(format('select pg_temp.undo(%L, %L, %s)', 'ayse', tests.id('ud:e3'), (select v from ud_mark)),
  '23514', null, 'Undo that would put Ali on his time off is refused');
select is(pg_temp.state(tests.id('ud:e3')), (select v from ud_before), 'and Emre''s evening is not back either');
select is(pg_temp.rev(tests.id('ud:e3')), (select v from ud_rev), 'nothing of the edit moved');

-- 6. Only the holder; nobody else's edit moves --------------------------------------

select tests.remember('ud:e4', pg_temp.open('can', 4, 'blank', array['B']));
select pg_temp.add('can', tests.id('ud:e4'), pg_temp.shift(null, 4, 1, 'B'));
create temp table ud_can as select pg_temp.state(tests.id('ud:e4')) state, pg_temp.rev(tests.id('ud:e4')) rev,
  (select count(*) from app_private.schedule_edit_undo_steps where session_id = tests.id('ud:e4')) steps;
truncate ud_mark; insert into ud_mark select pg_temp.rev(tests.id('ud:e1'));
select pg_temp.add('ayse', tests.id('ud:e1'), pg_temp.shift('ali', 1, 5));
select pg_temp.undo('ayse', tests.id('ud:e1'), (select v from ud_mark));
select is((select state from ud_can), pg_temp.state(tests.id('ud:e4')), 'Ayşe''s Undo leaves Can''s edit alone');
select is((select rev from ud_can), pg_temp.rev(tests.id('ud:e4')), 'its revision too');
select is((select steps from ud_can), (select count(*) from app_private.schedule_edit_undo_steps where session_id = tests.id('ud:e4')),
  'and its Undo history');

truncate ud_mark; insert into ud_mark select pg_temp.rev(tests.id('ud:e1'));
select pg_temp.add('ayse', tests.id('ud:e1'), pg_temp.shift('ali', 1, 6));
select is(pg_temp.refusal(format('select pg_temp.undo(%L, %L, %s)', 'zeynep', tests.id('ud:e1'), (select v from ud_mark))),
  'P0002 edit session not found', 'Zeynep cannot undo Ayşe''s step');
select is(pg_temp.refusal(format('select pg_temp.undo(%L, %L, %s)', 'ali', tests.id('ud:e1'), (select v from ud_mark))),
  'P0002 edit session not found', 'nor can Ali');
select is(pg_temp.refusal(format('select public.undo_schedule_edit_session_service(%L, %L, %L, %s, %s)',
  tests.user('ud:ayse'), tests.id('ud'), tests.id('ud:e1'), pg_temp.rev(tests.id('ud:e1')) - 1, (select v from ud_mark))),
  '40001 session revision stale', 'a screen behind the edit is told to reload');
select is(pg_temp.refusal(format('select pg_temp.undo(%L, %L, %s)', 'ayse', tests.id('ud:e1'), (select v from ud_mark))),
  'allowed', 'Ayşe can');

-- 7. What the edit did not do itself cannot be undone across ------------------------

-- Can widens his edit to Kadıköy: the shifts that arrive are not a step of his.
truncate ud_mark; insert into ud_mark select pg_temp.rev(tests.id('ud:e4'));
select pg_temp.open('can', 4, 'blank', array['K']);
select is(pg_temp.refusal(format('select pg_temp.undo(%L, %L, %s)', 'can', tests.id('ud:e4'), (select v from ud_mark) - 1)),
  '22023 undo unavailable', 'Undo stops where the edit was picked up again');
select tests.remember('ud:e4:k', pg_temp.add('can', tests.id('ud:e4'), pg_temp.shift(null, 4, 2)));
select lives_ok(format('select pg_temp.undo(%L, %L, %s)', 'can', tests.id('ud:e4'), (select v from ud_mark)),
  'the step after it is undone as usual');
select is((select count(*)::integer from public.schedule_edit_session_shifts where session_id = tests.id('ud:e4')), 1,
  'and only that step');

-- A saved edit is closed: nothing of it is undone, and its history is gone.
truncate ud_mark; insert into ud_mark select pg_temp.rev(tests.id('ud:e3'));
select pg_temp.add('ayse', tests.id('ud:e3'), pg_temp.shift('emre', 3, 2));
select public.save_schedule_edit_session_service(tests.user('ud:ayse'), tests.id('ud'), tests.id('ud:e3'),
  pg_temp.rev(tests.id('ud:e3')), 'Week 3 plan');
select is(pg_temp.refusal(format('select pg_temp.undo(%L, %L, %s)', 'ayse', tests.id('ud:e3'), (select v from ud_mark))),
  '40001 edit lease expired', 'Undo after Save draft is refused');
select is((select count(*)::integer from app_private.schedule_edit_undo_steps where session_id = tests.id('ud:e3')), 0,
  'the closed edit keeps no Undo history');

-- 8. Nobody in the browser reads or calls it -----------------------------------------

select is(has_function_privilege('authenticated',
  'public.undo_schedule_edit_session_service(uuid, uuid, uuid, integer, integer)', 'execute'), false, 'the browser cannot call Undo');
select is(has_table_privilege('authenticated', 'app_private.schedule_edit_undo_steps', 'select'), false,
  'nor read the history');

-- 9. Every writer of an open edit's shifts is a step Undo takes back, or a line
-- Undo stops at. A new writer fails here until somebody says which it is.
select set_eq($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app_private')
    and p.prosrc ~* '(insert into|update|delete from)\s+public\.schedule_edit_session_shifts'
$$, array[
  -- the holder's steps: Undo takes them back
  'mutate_schedule_edit_shift_service', 'bulk_delete_schedule_edit_shifts_service', 'apply_schedule_auto_fill_service',
  'apply_schedule_template_service', 'add_schedule_pending_op_service', 'remove_schedule_pending_op_service',
  'shift_exchange_schedule_recovery_service',
  -- not a step: Undo stops here (undo_floor_revision)
  'acquire_schedule_edit_session_service', 'shift_exchange_rebase_drafts', 'important_date_close_shifts',
  -- the edit closes: its history goes
  'save_schedule_edit_session_service', 'discard_schedule_edit_session_service',
  -- Undo itself
  'undo_schedule_edit_session_service'
], 'every writer of an open edit''s shifts is a step or a line for Undo');
select is((select count(*)::integer from pg_proc where proname in
    ('acquire_schedule_edit_session_service', 'shift_exchange_rebase_drafts', 'important_date_close_shifts')
    and prosrc like '%undo_floor_revision%'), 3, 'and each line sets where Undo stops');

select * from finish();
rollback;
