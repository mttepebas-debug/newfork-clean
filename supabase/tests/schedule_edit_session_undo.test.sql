begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- EKRAN-01 DB-1c (S2, KK-171): Undo takes the last step back on the server
-- too, in one piece. A step is one write call from the screen: a move, a
-- paste, a template, Auto-fill. Whatever it touched goes back to how it was,
-- or nothing changes. The edit keeps its last 25 steps and says how many
-- (undo_depth). Only the edit's own holder undoes it; nobody else's edit
-- moves. A saved step is not undone (the save closes the edit).
-- Ayşe and Zeynep manage Kadıköy (K); Can manages Kadıköy and Beşiktaş (B).
-- Ali and Emre cook at Kadıköy.

select tests.world('ud');
-- The owner works here too (ROL-CIFT: the employee side needs the employee slot).
select tests.employee_slot('ud', 'owner');
select tests.person('ud', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('ud', 'zeynep', 'manager', array['K'], array['cook']);
select tests.person('ud', 'can', 'manager', array['K', 'B'], array['cook']);
select tests.person('ud', 'ali', 'employee', array['K'], array['cook']);
select tests.person('ud', 'emre', 'employee', array['K'], array['cook']);
select tests.publish_week('ud', 2, '[
  {"label": "p1", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "17:00"},
  {"label": "p2", "person": "emre", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "17:00"}
]');
select tests.publish_week('ud', 6, '[
  {"label": "p6k", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "17:00"},
  {"label": "p6b", "loc": "B", "job": "cook", "day": 1, "start": "09:00", "end": "17:00"}
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
create function pg_temp.refusal_hint(statement text) returns text language plpgsql as $$
declare code text; reason text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint;
  return code || ' ' || coalesce(reason, '');
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
create function pg_temp.depth(actor text, session uuid) returns integer language sql as $$
  select (public.get_schedule_edit_session_service(tests.user('ud:' || actor), tests.id('ud'), session) ->> 'undo_depth')::integer
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
create function pg_temp.undo(actor text, session uuid) returns jsonb language sql as $$
  select public.undo_schedule_edit_session_step_service(tests.user('ud:' || actor), tests.id('ud'), session,
    pg_temp.rev(session))
$$;
-- What the edit holds, comparable before and after: every row but its revision and clock.
create function pg_temp.state(session uuid) returns jsonb language sql as $$
  select coalesce(jsonb_agg(to_jsonb(s) - 'revision' - 'updated_at' order by s.id), '[]'::jsonb)
  from public.schedule_edit_session_shifts s where s.session_id = session
$$;
create function pg_temp.row_of(session uuid, shift uuid) returns public.schedule_edit_session_shifts language sql as $$
  select s from public.schedule_edit_session_shifts s where s.session_id = session and s.id = shift
$$;
create temp table ud_before (v jsonb);
create temp table ud_rev (v integer);

-- 1. Ayşe drags Ali's Tuesday to Wednesday and presses Undo (KARARLAR Schedule) --

select tests.remember('ud:e1', pg_temp.open('ayse', 1, 'blank'));
select is(pg_temp.depth('ayse', tests.id('ud:e1')), 0, 'a new edit has nothing to undo');
select is(pg_temp.refusal_hint(format('select pg_temp.undo(%L, %L)', 'ayse', tests.id('ud:e1'))),
  'PT409 schedule.nothing_to_undo', 'and Undo says so');
select tests.remember('ud:e1:tue', pg_temp.add('ayse', tests.id('ud:e1'), pg_temp.shift('ali', 1, 1)));
insert into ud_before select pg_temp.state(tests.id('ud:e1'));
insert into ud_rev select pg_temp.rev(tests.id('ud:e1'));
select is((pg_temp.change('ayse', tests.id('ud:e1'), tests.id('ud:e1:tue'),
  jsonb_build_object('scheduled_date', tests.week(1) + 2)) ->> 'undo_depth')::integer, 2,
  'every step''s answer says how many steps Undo can take back');
create temp table ud_answer as select pg_temp.undo('ayse', tests.id('ud:e1')) v;
select is((pg_temp.row_of(tests.id('ud:e1'), tests.id('ud:e1:tue'))).scheduled_date, tests.week(1) + 1,
  'Undo puts Ali''s shift back on Tuesday on the server');
select is(pg_temp.state(tests.id('ud:e1')), (select v from ud_before), 'the edit is exactly as before the move');
select is((select (v ->> 'revision')::integer from ud_answer), pg_temp.rev(tests.id('ud:e1')),
  'the answer is the edit as the screen reloads it');
select is((select (v ->> 'undo_depth')::integer from ud_answer), 1, 'one step is left: adding the shift');
select cmp_ok(pg_temp.rev(tests.id('ud:e1')), '>', (select v from ud_rev) + 1, 'the edit''s revision moves on, never back');
-- The next step after Undo is not "session revision stale" (W-1b Done when 2).
select lives_ok($$select pg_temp.change('ayse', tests.id('ud:e1'), tests.id('ud:e1:tue'), '{"start_time": "10:00"}'::jsonb)$$,
  'the next step after Undo goes through');

-- 2. A paste of three shifts is one step (a template, Auto-fill: one call, one step)

truncate ud_before; insert into ud_before select pg_temp.state(tests.id('ud:e1'));
select pg_temp.paste('ayse', tests.id('ud:e1'), jsonb_build_array(
  pg_temp.shift('ali', 1, 3), pg_temp.shift('emre', 1, 3), pg_temp.shift(null, 1, 4)));
select is((select count(*)::integer from public.schedule_edit_session_shifts where session_id = tests.id('ud:e1')), 4,
  'the paste wrote three shifts');
select is(pg_temp.depth('ayse', tests.id('ud:e1')), 3, 'as one step');
select pg_temp.undo('ayse', tests.id('ud:e1'));
select is(pg_temp.state(tests.id('ud:e1')), (select v from ud_before), 'one Undo takes the whole paste back');

-- 3. Steps go back one at a time, newest first -------------------------------------

create temp table ud_steps (step integer primary key, state jsonb);
insert into ud_steps select 1, pg_temp.state(tests.id('ud:e1'));
select tests.remember('ud:e1:fri', pg_temp.add('ayse', tests.id('ud:e1'), pg_temp.shift('emre', 1, 4)));
insert into ud_steps select 2, pg_temp.state(tests.id('ud:e1'));
select pg_temp.change('ayse', tests.id('ud:e1'), tests.id('ud:e1:fri'), jsonb_build_object('employee_id', tests.id('ud:ali')));
insert into ud_steps select 3, pg_temp.state(tests.id('ud:e1'));
select pg_temp.remove('ayse', tests.id('ud:e1'), tests.id('ud:e1:tue'));
select pg_temp.undo('ayse', tests.id('ud:e1'));
select is(pg_temp.state(tests.id('ud:e1')), (select state from ud_steps where step = 3), 'the delete is undone: Tuesday is back');
select is((pg_temp.row_of(tests.id('ud:e1'), tests.id('ud:e1:tue'))).id, tests.id('ud:e1:tue'), 'with its own id');
select pg_temp.undo('ayse', tests.id('ud:e1'));
select is(pg_temp.state(tests.id('ud:e1')), (select state from ud_steps where step = 2), 'then Friday is Emre''s again');
select pg_temp.undo('ayse', tests.id('ud:e1'));
select is(pg_temp.state(tests.id('ud:e1')), (select state from ud_steps where step = 1), 'then Friday is gone');

-- 4. A published shift goes back to "published", not to a pending change ---------

select tests.remember('ud:e2', pg_temp.open('ayse', 2, 'published'));
select tests.remember('ud:e2:p1', (select source_shift_id from public.schedule_published_shifts where id = tests.id('ud:shift:p1')));
select tests.remember('ud:e2:p2', (select source_shift_id from public.schedule_published_shifts where id = tests.id('ud:shift:p2')));
select is(pg_temp.depth('ayse', tests.id('ud:e2')), 0, 'opening a published week is not a step');
truncate ud_before; insert into ud_before select pg_temp.state(tests.id('ud:e2'));
select pg_temp.change('ayse', tests.id('ud:e2'), tests.id('ud:e2:p1'), '{"start_time": "11:00"}'::jsonb);
select is((pg_temp.row_of(tests.id('ud:e2'), tests.id('ud:e2:p1'))).pending_op_type, 'update', 'the change is pending');
select pg_temp.undo('ayse', tests.id('ud:e2'));
select is((pg_temp.row_of(tests.id('ud:e2'), tests.id('ud:e2:p1'))).pending_op_type, null,
  'after Undo the shift is published again, not a pending change');
select is((pg_temp.row_of(tests.id('ud:e2'), tests.id('ud:e2:p1'))).locked, true, 'and locked as it was');
select is(pg_temp.state(tests.id('ud:e2')), (select v from ud_before), 'the edit is as it was opened');

select pg_temp.remove('ayse', tests.id('ud:e2'), tests.id('ud:e2:p2'));
select is((pg_temp.row_of(tests.id('ud:e2'), tests.id('ud:e2:p2'))).pending_op_type, 'delete', 'Emre''s Wednesday is marked to go');
select pg_temp.undo('ayse', tests.id('ud:e2'));
select is(pg_temp.state(tests.id('ud:e2')), (select v from ud_before), 'Undo takes the mark back');

-- 5. All or nothing ------------------------------------------------------------------

-- Ayşe deletes Ali's and Emre's evenings in one step; then Ali's Tuesday evening
-- is approved time off. Undo cannot put Ali back, so it puts nobody back.
select tests.remember('ud:e3', pg_temp.open('ayse', 3, 'blank'));
select tests.remember('ud:e3:ali', pg_temp.add('ayse', tests.id('ud:e3'), pg_temp.shift('ali', 3, 1)));
select tests.remember('ud:e3:emre', pg_temp.add('ayse', tests.id('ud:e3'), pg_temp.shift('emre', 3, 1)));
-- Before that she gave Emre a Thursday and moved it to Friday.
select tests.remember('ud:e3:thu', pg_temp.add('ayse', tests.id('ud:e3'), pg_temp.shift('emre', 3, 4)));
select pg_temp.change('ayse', tests.id('ud:e3'), tests.id('ud:e3:thu'), jsonb_build_object('scheduled_date', tests.week(3) + 5));
select public.bulk_delete_schedule_edit_shifts_service(tests.user('ud:ayse'), tests.id('ud'),
  array[tests.id('ud:e3:ali'), tests.id('ud:e3:emre')]);
select tests.approved_leave(tests.id('ud'), tests.id('ud:ali'), tests.user('ud:ali'), tests.id('ud:K'), tests.week(3) + 1, '17:00', '23:00');
truncate ud_before; insert into ud_before select pg_temp.state(tests.id('ud:e3'));
truncate ud_rev; insert into ud_rev select pg_temp.rev(tests.id('ud:e3'));
-- BL-998: a step that can no longer come back leaves the history and says
-- why, so Undo never sticks on it and the steps before it stay in reach.
create temp table ud_refused as select pg_temp.undo('ayse', tests.id('ud:e3')) v;
select is((select v -> 'undo_refused' ->> 'reason' from ud_refused), 'availability',
  'Undo that would put Ali on his time off is refused, and says why');
select is(pg_temp.state(tests.id('ud:e3')), (select v from ud_before), 'and Emre''s evening is not back either');
select is(pg_temp.depth('ayse', tests.id('ud:e3')), 4, 'the refused step leaves the history');
select is((select (v ->> 'undo_depth')::integer from ud_refused), 4, 'and the answer says so');
select is((select (v ->> 'revision')::integer from ud_refused), pg_temp.rev(tests.id('ud:e3')),
  'the answer carries the edit''s revision, which moved with its history');
select ok(pg_temp.rev(tests.id('ud:e3')) > (select v from ud_rev), 'so another screen on this edit reloads');
create temp table ud_next as select pg_temp.undo('ayse', tests.id('ud:e3')) v;
select is((select v -> 'undo_refused' from ud_next), null, 'the next Undo takes back the step before it');
select is((pg_temp.row_of(tests.id('ud:e3'), tests.id('ud:e3:thu'))).scheduled_date, tests.week(3) + 4,
  'Emre''s shift is back on Thursday');
select ok(not exists (select 1 from public.schedule_edit_session_shifts s where s.session_id = tests.id('ud:e3')
    and s.id in (tests.id('ud:e3:ali'), tests.id('ud:e3:emre'))),
  'and the refused deletion still stands');
select is(pg_temp.depth('ayse', tests.id('ud:e3')), 3, 'three steps are left');

-- 5b. A warning acceptance the edit lost (BL-999) ---------------------------------

-- Two hours of rest between shifts is the rule; Ayşe gives Ali a 09:00 and,
-- accepting the short rest, an 18:00 the same day; then she moves the 18:00 to
-- 19:30 (enough rest: the acceptance goes) and presses Undo.
update public.workspace_scheduling_settings set minimum_rest_minutes = 120 where workspace_id = tests.id('ud');
select tests.remember('ud:e5', pg_temp.open('ayse', 5, 'blank'));
select pg_temp.add('ayse', tests.id('ud:e5'),
  pg_temp.shift('ali', 5, 1) || '{"start_time": "09:00", "end_time": "17:00"}');
select tests.remember('ud:e5:eve', gen_random_uuid());
select public.mutate_schedule_edit_shift_service(tests.user('ud:ayse'), tests.id('ud'), tests.id('ud:e5'),
  pg_temp.rev(tests.id('ud:e5')), 'create', tests.id('ud:e5:eve'), null,
  pg_temp.shift('ali', 5, 1) || jsonb_build_object('availability_assessment_fingerprint',
    public.assess_weekly_shift_availability(tests.id('ud'), tests.id('ud:ali'),
      pg_temp.shift('ali', 5, 1) || jsonb_build_object('_exclude_shift_id', tests.id('ud:e5:eve'),
        'session_id', tests.id('ud:e5'))) ->> 'fingerprint'),
  gen_random_uuid());
select pg_temp.change('ayse', tests.id('ud:e5'), tests.id('ud:e5:eve'), '{"start_time": "19:30"}');
truncate ud_before; insert into ud_before select pg_temp.state(tests.id('ud:e5'));
create temp table ud_lost as select pg_temp.undo('ayse', tests.id('ud:e5')) v;
select is((select v -> 'undo_refused' ->> 'reason' from ud_lost), 'conflict_acceptance',
  'Undo back to the short rest needs a new acceptance, and says so instead of sticking');
select is(pg_temp.state(tests.id('ud:e5')), (select v from ud_before), 'Ali keeps his 19:30');
select is(pg_temp.depth('ayse', tests.id('ud:e5')), 2, 'and the steps before it stay in reach');

-- 6. Only the holder; nobody else's edit moves --------------------------------------

select tests.remember('ud:e4', pg_temp.open('can', 4, 'blank', array['B']));
select pg_temp.add('can', tests.id('ud:e4'), pg_temp.shift(null, 4, 1, 'B'));
create temp table ud_can as select pg_temp.state(tests.id('ud:e4')) state, pg_temp.rev(tests.id('ud:e4')) rev,
  pg_temp.depth('can', tests.id('ud:e4')) depth;
select pg_temp.add('ayse', tests.id('ud:e1'), pg_temp.shift('ali', 1, 5));
select pg_temp.undo('ayse', tests.id('ud:e1'));
select is((select state from ud_can), pg_temp.state(tests.id('ud:e4')), 'Ayşe''s Undo leaves Can''s edit alone');
select is((select rev from ud_can), pg_temp.rev(tests.id('ud:e4')), 'its revision too');
select is((select depth from ud_can), pg_temp.depth('can', tests.id('ud:e4')), 'and its Undo history');

select pg_temp.add('ayse', tests.id('ud:e1'), pg_temp.shift('ali', 1, 6));
select is(pg_temp.refusal(format('select pg_temp.undo(%L, %L)', 'zeynep', tests.id('ud:e1'))),
  'P0002 edit session not found', 'Zeynep cannot undo Ayşe''s step');
select is(pg_temp.refusal(format('select pg_temp.undo(%L, %L)', 'ali', tests.id('ud:e1'))),
  'P0002 edit session not found', 'nor can Ali');
select is(pg_temp.refusal(format('select public.undo_schedule_edit_session_step_service(%L, %L, %L, %s)',
  tests.user('ud:ayse'), tests.id('ud'), tests.id('ud:e1'), pg_temp.rev(tests.id('ud:e1')) - 1)),
  'PT409 session revision stale', 'a screen behind the edit is told to reload');
-- BL-958: the screen knows it by the key in the hint, not by the sentence.
select is(pg_temp.refusal_hint(format('select public.undo_schedule_edit_session_step_service(%L, %L, %L, %s)',
  tests.user('ud:ayse'), tests.id('ud'), tests.id('ud:e1'), pg_temp.rev(tests.id('ud:e1')) - 1)),
  'PT409 schedule.edit_session_stale', 'and the refusal carries the stale key');
select is(pg_temp.refusal(format('select pg_temp.undo(%L, %L)', 'ayse', tests.id('ud:e1'))), 'allowed', 'Ayşe can');

-- Can no longer works at Beşiktaş: his edit there is not his to undo.
truncate ud_can; insert into ud_can select pg_temp.state(tests.id('ud:e4')), pg_temp.rev(tests.id('ud:e4')),
  pg_temp.depth('can', tests.id('ud:e4'));
select tests.stops_working_at((select m.id from public.workspace_memberships m
  where m.workspace_id = tests.id('ud') and m.user_id = tests.user('ud:can')), tests.id('ud:B'));
select is(pg_temp.refusal_hint(format('select pg_temp.undo(%L, %L)', 'can', tests.id('ud:e4'))),
  '42501 authz.out_of_scope', 'Can, gone from Beşiktaş, cannot undo his step there');
select is((select state from ud_can), pg_temp.state(tests.id('ud:e4')), 'the shift stays');
select is((select rev from ud_can), pg_temp.rev(tests.id('ud:e4')), 'the revision too');
select is((select count(*)::integer from app_private.schedule_edit_undo_steps where session_id = tests.id('ud:e4')),
  (select depth from ud_can), 'and the history');
select tests.works_at((select m.id from public.workspace_memberships m
  where m.workspace_id = tests.id('ud') and m.user_id = tests.user('ud:can')), tests.id('ud:B'));

-- An edit of another workspace is not found from this one.
select tests.world('ux');
-- The owner works here too (ROL-CIFT: the employee side needs the employee slot).
select tests.employee_slot('ux', 'owner');
select tests.remember('ux:e1', (public.acquire_schedule_edit_session_service(tests.user('ux:owner'), tests.id('ux'),
  tests.week(1), 'blank', null) -> 'session' ->> 'id')::uuid);
select is(pg_temp.refusal(format('select public.undo_schedule_edit_session_step_service(%L, %L, %L, %s)',
  tests.user('ux:owner'), tests.id('ud'), tests.id('ux:e1'), pg_temp.rev(tests.id('ux:e1')))),
  'P0002 edit session not found', 'another workspace''s edit is not found');

-- 7. What the edit did not do itself is not a step ------------------------------------

-- Can opens the published week 6 at Beşiktaş, adds a shift, then widens the edit
-- to Kadıköy: Kadıköy's published shifts arrive, but they are not a step of his.
select tests.remember('ud:e6', pg_temp.open('can', 6, 'published', array['B']));
select pg_temp.add('can', tests.id('ud:e6'), pg_temp.shift(null, 6, 2, 'B'));
select pg_temp.open('can', 6, 'published', array['K']);
select is((select count(*)::integer from public.schedule_edit_session_shifts where session_id = tests.id('ud:e6')), 3,
  'Kadıköy''s shift arrived');
select is(pg_temp.depth('can', tests.id('ud:e6')), 1, 'the reload keeps his step, and adds none');
select pg_temp.undo('can', tests.id('ud:e6'));
select is((select count(*)::integer from public.schedule_edit_session_shifts where session_id = tests.id('ud:e6')), 2,
  'Undo takes back only his shift');

-- A swap rewrites Ayşe's open edit: Undo does not take it back, nor cross it.
select tests.remember('ud:e7', pg_temp.open('ayse', 7, 'blank'));
select tests.remember('ud:e7:ali', pg_temp.add('ayse', tests.id('ud:e7'), pg_temp.shift('ali', 7, 1)));
select public.shift_exchange_rebase_drafts(tests.id('ud'), to_jsonb(pg_temp.row_of(tests.id('ud:e7'), tests.id('ud:e7:ali'))),
  tests.id('ud:emre'));
select is((pg_temp.row_of(tests.id('ud:e7'), tests.id('ud:e7:ali'))).employee_id, tests.id('ud:emre'), 'the swap gave the shift to Emre');
select is(pg_temp.depth('ayse', tests.id('ud:e7')), 0, 'the edit''s history is gone');
select is(pg_temp.refusal_hint(format('select pg_temp.undo(%L, %L)', 'ayse', tests.id('ud:e7'))),
  'PT409 schedule.nothing_to_undo', 'Undo has nothing to take back');

-- A saved edit is closed: nothing of it is undone, and its history is gone.
select pg_temp.add('ayse', tests.id('ud:e3'), pg_temp.shift('emre', 3, 2));
select public.save_schedule_edit_session_service(tests.user('ud:ayse'), tests.id('ud'), tests.id('ud:e3'),
  pg_temp.rev(tests.id('ud:e3')), 'Week 3 plan');
select is(pg_temp.refusal(format('select pg_temp.undo(%L, %L)', 'ayse', tests.id('ud:e3'))),
  'PT409 edit session closed', 'Undo after Save draft is refused');
-- EKRAN-01 B3: a closed edit is told apart from a lapsed lock, so the screen
-- does not pick the edit back up (and close the person's other tab) for it.
select is(pg_temp.refusal_hint(format('select pg_temp.undo(%L, %L)', 'ayse', tests.id('ud:e3'))),
  'PT409 schedule.edit_session_closed', 'and it carries the closed key');
select is(pg_temp.refusal_hint(format('select public.heartbeat_schedule_edit_session_service(%L, %L, %L)',
  tests.user('ud:ayse'), tests.id('ud'), tests.id('ud:e3'))),
  'PT409 schedule.edit_session_closed', 'a heartbeat on the saved edit is told it is closed');
select is((select count(*)::integer from app_private.schedule_edit_undo_steps where session_id = tests.id('ud:e3')), 0,
  'the closed edit keeps no Undo history');

-- 8. The last 25 steps --------------------------------------------------------------

select tests.remember('ud:e8', pg_temp.open('ayse', 8, 'blank'));
-- One statement per step, as the screen sends them.
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 1));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 2));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 3));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 4));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 5));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 6));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 0));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 1));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 2));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 3));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 4));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 5));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 6));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 0));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 1));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 2));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 3));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 4));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 5));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 6));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 0));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 1));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 2));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 3));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 4));
select pg_temp.add('ayse', tests.id('ud:e8'), pg_temp.shift(null, 8, 5));
select is(pg_temp.depth('ayse', tests.id('ud:e8')), 25, 'after 26 steps Undo can take back 25');
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select pg_temp.undo('ayse', tests.id('ud:e8'));
select is((select count(*)::integer from public.schedule_edit_session_shifts where session_id = tests.id('ud:e8')), 1,
  'the first step stays');
select is(pg_temp.refusal_hint(format('select pg_temp.undo(%L, %L)', 'ayse', tests.id('ud:e8'))),
  'PT409 schedule.nothing_to_undo', 'and nothing is left to undo');

-- Restoring approved assignments (Schedule, editing, after an approved swap) is
-- not a step either: Undo would put the shift back on the person who gave it
-- away, and the save would refuse it again.
select tests.publish_week('ud', 9, '[
  {"label": "u9", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "17:00"}
]');
select tests.remember('ud:e9', pg_temp.open('owner', 9, 'blank', array['K']));
select pg_temp.add('owner', tests.id('ud:e9'), pg_temp.shift(null, 9, 4));
-- ponytail: the edit was opened before the swap; in one transaction both carry the same now().
update public.schedule_edit_sessions set created_at = now() - interval '1 minute' where id = tests.id('ud:e9');
create temp table ud_case as select tests.cover_case('ud', 'u9', 'ali', 'emre') as opened;
select public.shift_exchanges_command_service(tests.user('ud:owner'), tests.id('ud'), jsonb_build_object(
  'action', 'approve', 'case_id', opened, 'application_id', tests.id('ud:application:u9'),
  'expected_revision', (select c.revision from public.shift_exchange_cases c where c.id = opened),
  'fingerprint', public.shift_exchange_preview(tests.user('ud:owner'), tests.id('ud'), opened,
    tests.id('ud:application:u9')) ->> 'fingerprint'), gen_random_uuid())
from ud_case;
select tests.settle();
create temp table ud_restored as select public.shift_exchange_schedule_recovery_service(tests.user('ud:owner'), tests.id('ud'),
  tests.id('ud:e9'), public.shift_exchange_schedule_recovery_service(tests.user('ud:owner'), tests.id('ud'), tests.id('ud:e9'))
  ->> 'fingerprint', gen_random_uuid()) as v;
select is((select count(*)::integer from public.schedule_edit_session_shifts
    where session_id = tests.id('ud:e9') and employee_id = tests.id('ud:emre') and scheduled_date = tests.week(9) + 1), 1,
  'the approved swap is in the edit: Emre has the Tuesday');
select is((select (v ->> 'undo_depth')::integer from ud_restored), 0, 'after restoring it Undo has nothing to take back');
select is(pg_temp.refusal_hint(format('select pg_temp.undo(%L, %L)', 'owner', tests.id('ud:e9'))),
  'PT409 schedule.nothing_to_undo', 'and Undo says so');

-- 8b. Widening a full history keeps it whole (EKRAN-01 #12, BL-762) ------------------
-- Can's edit of the published week 11 at Beşiktaş holds 25 steps. Opening
-- Kadıköy too brings its published shift into the edit; that is not a step,
-- and it does not push his oldest step out either.
select tests.publish_week('ud', 11, '[
  {"label": "p11k", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "17:00"},
  {"label": "p11b", "loc": "B", "job": "cook", "day": 1, "start": "09:00", "end": "17:00"}
]');
select tests.remember('ud:e11', pg_temp.open('can', 11, 'published', array['B']));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 1, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 2, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 3, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 4, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 5, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 6, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 0, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 1, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 2, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 3, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 4, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 5, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 6, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 0, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 1, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 2, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 3, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 4, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 5, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 6, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 0, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 1, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 2, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 3, 'B'));
select pg_temp.add('can', tests.id('ud:e11'), pg_temp.shift(null, 11, 4, 'B'));
select is(pg_temp.depth('can', tests.id('ud:e11')), 25, 'Can''s edit holds 25 steps');
select pg_temp.open('can', 11, 'published', array['K']);
select is((select count(*)::integer from public.schedule_edit_session_shifts
    where session_id = tests.id('ud:e11') and location_id = tests.id('ud:K')), 1,
  'opening Kadıköy brings its published shift into the edit');
select is(pg_temp.depth('can', tests.id('ud:e11')), 25, 'and Undo can still take back all 25 of his steps');
-- Undo takes back his last Beşiktaş shift, not the Kadıköy one opening brought in.
select pg_temp.undo('can', tests.id('ud:e11'));
select is((select count(*)::integer from public.schedule_edit_session_shifts
    where session_id = tests.id('ud:e11') and location_id = tests.id('ud:K')), 1,
  'his next Undo leaves the Kadıköy shift where it is');
select is((select count(*)::integer from public.schedule_edit_session_shifts
    where session_id = tests.id('ud:e11') and location_id = tests.id('ud:B')), 25,
  'and takes back one of his 25 Beşiktaş shifts');

-- 8c. The step written last goes back first (EKRAN-01 #12, BL-762) -------------------
-- Two of Ayşe's tabs send at once; the later one began a moment earlier but
-- waited for the edit and wrote last. Undo takes back the step that was
-- written last, whatever the clock said when its request began.
select tests.remember('ud:e12', pg_temp.open('ayse', 12, 'blank'));
select tests.remember('ud:e12:first', pg_temp.add('ayse', tests.id('ud:e12'), pg_temp.shift(null, 12, 1)));
select tests.remember('ud:e12:last', pg_temp.add('ayse', tests.id('ud:e12'), pg_temp.shift(null, 12, 2)));
-- ponytail: one test transaction cannot race two requests; the last step's
-- start is moved before the first one's, as the waiting request's was.
update app_private.schedule_edit_undo_steps set step_at = step_at - interval '1 minute'
where session_id = tests.id('ud:e12') and shift_id = tests.id('ud:e12:last');
select pg_temp.undo('ayse', tests.id('ud:e12'));
select is((select count(*)::integer from public.schedule_edit_session_shifts
    where session_id = tests.id('ud:e12') and id = tests.id('ud:e12:last')), 0,
  'Undo takes back the shift written last');
select is((select count(*)::integer from public.schedule_edit_session_shifts
    where session_id = tests.id('ud:e12') and id = tests.id('ud:e12:first')), 1,
  'and leaves the one written before it');

-- 9. Nobody in the browser reads or calls it -----------------------------------------

select is(has_function_privilege('authenticated',
  'public.undo_schedule_edit_session_step_service(uuid, uuid, uuid, integer)', 'execute'), false, 'the browser cannot call Undo');
select is(has_table_privilege('authenticated', 'app_private.schedule_edit_undo_steps', 'select'), false,
  'nor read the history');

-- 10. Every writer of an open edit's shifts is a step Undo takes back, or not a
-- step and says so. A new writer fails here until somebody says which it is.
select set_eq($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app_private')
    and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+public\.schedule_edit_session_shifts'
$$, array[
  -- the holder's steps: Undo takes them back
  'mutate_schedule_edit_shift_service', 'bulk_delete_schedule_edit_shifts_service', 'apply_schedule_auto_fill_service',
  'apply_schedule_template_service', 'add_schedule_pending_op_service', 'remove_schedule_pending_op_service',
  -- not a step: the shifts an edit opens with; a swap, its restore or a closed day (schedule_edit_undo_barrier)
  'acquire_schedule_edit_session_service', 'shift_exchange_rebase_drafts', 'shift_exchange_schedule_recovery_service',
  'announcement_apply', 'announcement_bring_back',
  -- not a step either: an open shift the publisher deleted on publishing (open shifts in the pool, 2026-10-20)
  'publish_schedule_draft_service',
  -- the edit closes: its history goes
  'save_schedule_edit_session_service', 'discard_schedule_edit_session_service',
  -- Undo itself
  'undo_schedule_edit_session_step_service'
], 'every writer of an open edit''s shifts is a step or says it is not');
-- Opening records nothing while it brings shifts in (EKRAN-01 #12); the others
-- clear the history after they write.
select is((select count(*)::integer from pg_proc where
    (proname = 'acquire_schedule_edit_session_service'
      and prosrc like '%set_config(''app.schedule_edit_widening'', ''on'', true)%'
      and prosrc like '%set_config(''app.schedule_edit_widening'', '''', true)%')
    or (proname in ('shift_exchange_rebase_drafts', 'shift_exchange_schedule_recovery_service', 'announcement_apply',
                    'announcement_bring_back')
      and prosrc like '%schedule_edit_undo_barrier()%')),
  5, 'and each one that is not a step clears itself out of the history');

-- EKRAN-01 B3: an edit whose lock ran out while it stayed open (a laptop that
-- slept) is a lapsed lease, which the screen may pick back up.
select is((select status::text from public.schedule_edit_sessions where id = tests.id('ud:e1')),
  'active', 'Ayşe''s first edit is still open');
update public.schedule_edit_sessions set expires_at = now() - interval '1 minute' where id = tests.id('ud:e1');
select is(pg_temp.refusal_hint(format('select pg_temp.undo(%L, %L)', 'ayse', tests.id('ud:e1'))),
  'PT409 schedule.edit_lease_expired', 'once its lock runs out, Undo reads as a lapsed lease');
select is(pg_temp.refusal_hint(format('select public.heartbeat_schedule_edit_session_service(%L, %L, %L)',
  tests.user('ud:ayse'), tests.id('ud'), tests.id('ud:e1'))),
  'PT409 schedule.edit_lease_expired', 'and so does its heartbeat');

-- 11. Every refusal names its rule (BL-998, S4b review) --------------------------------

-- Ayşe gives Emre a Monday and moves it to Tuesday. Before she presses Undo,
-- Emre's required document lapses for Monday: putting him back there is
-- refused for the document. (The check is stood in for here, rolled back
-- with the rest; the assessment does not read it, only Undo's own check does.)
select tests.remember('ud:e14', pg_temp.open('ayse', 14, 'blank'));
select tests.remember('ud:e14:mon', pg_temp.add('ayse', tests.id('ud:e14'), pg_temp.shift('emre', 14, 0)));
select pg_temp.change('ayse', tests.id('ud:e14'), tests.id('ud:e14:mon'), jsonb_build_object('scheduled_date', tests.week(14) + 1));
create or replace function public.employee_has_hard_document_schedule_conflict_service(
    target_workspace_id uuid, target_employee_id uuid, target_scheduled_date date) returns boolean
  language sql stable security definer set search_path to '' as $doc$
    select target_employee_id = tests.id('ud:emre') and target_scheduled_date = tests.week(14)
  $doc$;
create temp table ud_doc as select pg_temp.undo('ayse', tests.id('ud:e14')) v;
select is((select v -> 'undo_refused' ->> 'reason' from ud_doc), 'document',
  'a step that would put Emre on a day his document lapsed is refused for the document');
select is((pg_temp.row_of(tests.id('ud:e14'), tests.id('ud:e14:mon'))).scheduled_date, tests.week(14) + 1,
  'and Emre stays on Tuesday');
select is(pg_temp.depth('ayse', tests.id('ud:e14')), 1, 'the step left the history');

-- Any other rule that says no to the row coming back is named as a rule.
select tests.remember('ud:e14:wed', pg_temp.add('ayse', tests.id('ud:e14'), pg_temp.shift('emre', 14, 2)));
select pg_temp.change('ayse', tests.id('ud:e14'), tests.id('ud:e14:wed'), jsonb_build_object('scheduled_date', tests.week(14) + 3));
create function pg_temp.refuse_wednesday() returns trigger language plpgsql as $$
begin
  if new.id = tests.id('ud:e14:wed') and new.scheduled_date = tests.week(14) + 2 then
    raise exception 'a rule of this test' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger ud_refuse_wednesday before update on public.schedule_edit_session_shifts
  for each row execute function pg_temp.refuse_wednesday();
create temp table ud_rule as select pg_temp.undo('ayse', tests.id('ud:e14')) v;
select is((select v -> 'undo_refused' ->> 'reason' from ud_rule), 'rule', 'any other rule is named as a rule');
select is((pg_temp.row_of(tests.id('ud:e14'), tests.id('ud:e14:wed'))).scheduled_date, tests.week(14) + 3,
  'and Emre''s Thursday stands');
drop trigger ud_refuse_wednesday on public.schedule_edit_session_shifts;

select * from finish();
rollback;
