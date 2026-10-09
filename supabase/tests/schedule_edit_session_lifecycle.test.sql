begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- EKRAN-01 DB-1b: an edit that ends keeps its work. Inactivity, a lease that
-- ran out, another draft opened over it or a draft deleted under it: the
-- unsaved shifts wait in a draft named "Auto-save · <person> · <date time>"
-- (KARARLAR Schedule "Hareketsizlik", KK-162). Each manager sees only their
-- own unsaved changes (D-Y5).
-- Ayşe and Zeynep manage Kadıköy (K); Can manages Kadıköy and Beşiktaş.

select tests.world('el');
select tests.person('el', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('el', 'zeynep', 'manager', array['K'], array['cook']);
select tests.person('el', 'can', 'manager', array['K', 'B'], array['cook']);
select tests.publish_week('el', 4, '[
  {"label": "p1", "person": "ayse", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "17:00"}
]');

create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare code text; reason text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate, reason = pg_exception_hint;
  return code || ' ' || coalesce(reason, '');
end;
$$;
create function pg_temp.open(actor text, n integer, source text, draft uuid, locs text[] default null) returns jsonb language sql as $$
  select public.acquire_schedule_edit_session_service(tests.user('el:' || actor), tests.id('el'), tests.week(n),
    source::public.schedule_edit_source, draft, case when locs is not null then array(select tests.id('el:' || l) from unnest(locs) l) end)
$$;
create function pg_temp.sid(result jsonb) returns uuid language sql as $$ select (result -> 'session' ->> 'id')::uuid $$;
create function pg_temp.add(actor text, session uuid, n integer, loc text, day integer) returns uuid language sql as $$
  select tests.add_shift(tests.user('el:' || actor), 'el', session, n,
    jsonb_build_object('loc', loc, 'job', 'cook', 'day', day, 'start', '09:00', 'end', '13:00'))
$$;
-- Saves into the draft the edit was opened from, or as a new draft.
create function pg_temp.save(actor text, session uuid, name text) returns uuid language sql as $$
  select (public.save_schedule_edit_session_service(tests.user('el:' || actor), tests.id('el'), session,
    s.revision, name, s.source_draft_id, (select d.revision from public.schedule_drafts d where d.id = s.source_draft_id)) ->> 'id')::uuid
  from public.schedule_edit_sessions s where s.id = session
$$;
create function pg_temp.autosave(actor text, session uuid) returns jsonb language sql as $$
  select public.autosave_schedule_edit_session_service(tests.user('el:' || actor), tests.id('el'), session)
$$;
create function pg_temp.status(session uuid) returns text language sql as $$
  select s.status::text from public.schedule_edit_sessions s where s.id = session
$$;
create function pg_temp.expire(session uuid) returns void language sql as $$
  update public.schedule_edit_sessions set expires_at = now() - interval '1 minute' where id = session
$$;

-- 1. "Keep editing?" ran out: the work goes to an Auto-save draft (S1) -------------

select tests.remember('el:edit:1', pg_temp.sid(pg_temp.open('ayse', 1, 'blank', null)));
select pg_temp.add('ayse', tests.id('el:edit:1'), 1, 'K', 1);
select pg_temp.add('ayse', tests.id('el:edit:1'), 1, 'K', 2);
create temp table el_saved as select pg_temp.autosave('ayse', tests.id('el:edit:1')) result;
select is((select result ->> 'status' from el_saved), 'saved', 'Ayşe''s idle edit is auto-saved');
select matches((select d.name from public.schedule_drafts d where d.id = (select (result ->> 'draft_id')::uuid from el_saved)),
  '^Auto-save · Ayse Person · [A-Z][a-z]{2} [0-9]{1,2}, [0-9]{1,2}:[0-9]{2} (AM|PM)$',
  'the draft is named Auto-save, her name, the date and time');
select is((select result ->> 'draft_name' from el_saved),
  (select d.name from public.schedule_drafts d where d.id = (select (result ->> 'draft_id')::uuid from el_saved)),
  'the answer names the draft for the screen');
select is((select count(*)::integer from public.schedule_draft_shifts ds where ds.draft_id = (select (result ->> 'draft_id')::uuid from el_saved)),
  2, 'both unsaved shifts are in it');
select is((select count(*)::integer from public.schedule_edit_session_shifts s where s.session_id = tests.id('el:edit:1')),
  2, 'and nothing of the edit is deleted');
select is(pg_temp.status(tests.id('el:edit:1')), 'recovered', 'the edit is closed');
select is(pg_temp.open('ayse', 1, 'blank', null) ->> 'status', 'acquired', 'the lock is let go: opening again starts a new edit');

select tests.remember('el:edit:1b', pg_temp.sid(pg_temp.open('ayse', 2, 'blank', null)));
select is(pg_temp.autosave('ayse', tests.id('el:edit:1b')) ->> 'status', 'nothing_to_save',
  'an edit with nothing unsaved just closes');
select is(pg_temp.status(tests.id('el:edit:1b')), 'expired', 'and leaves no draft');
select is(pg_temp.refusal(format('select public.autosave_schedule_edit_session_service(%L, %L, %L)',
  tests.user('el:zeynep'), tests.id('el'), tests.id('el:edit:1'))), 'P0002 ', 'nobody auto-saves somebody else''s edit');

-- A second auto-save in the same minute of the same week gets its own name.
select tests.remember('el:edit:1c', pg_temp.sid(pg_temp.open('ayse', 1, 'blank', null)));
select pg_temp.add('ayse', tests.id('el:edit:1c'), 1, 'K', 3);
select is(pg_temp.autosave('ayse', tests.id('el:edit:1c')) ->> 'draft_name',
  (select result ->> 'draft_name' from el_saved) || ' (2)', 'a second auto-save that minute is named "(2)"');
-- On a 24-hour workspace the time reads that way.
update public.workspace_scheduling_settings set time_format = '24h' where workspace_id = tests.id('el');
select tests.remember('el:edit:1d', pg_temp.sid(pg_temp.open('ayse', 2, 'blank', null)));
select pg_temp.add('ayse', tests.id('el:edit:1d'), 2, 'K', 3);
select matches(pg_temp.autosave('ayse', tests.id('el:edit:1d')) ->> 'draft_name',
  '^Auto-save · Ayse Person · [A-Z][a-z]{2} [0-9]{1,2}, [0-9]{2}:[0-9]{2}$', 'on a 24-hour workspace the time is 24-hour');
update public.workspace_scheduling_settings set time_format = '12h' where workspace_id = tests.id('el');

-- 2. Somebody else's lease ran out: same name (D-O9, KK-162) ----------------------

select tests.remember('el:edit:2', pg_temp.sid(pg_temp.open('zeynep', 3, 'blank', null)));
select pg_temp.add('zeynep', tests.id('el:edit:2'), 3, 'K', 1);
select tests.remember('el:plan_a', pg_temp.save('zeynep', tests.id('el:edit:2'), 'Plan A'));
select tests.remember('el:edit:3', pg_temp.sid(pg_temp.open('ayse', 3, 'draft', tests.id('el:plan_a'))));
select pg_temp.add('ayse', tests.id('el:edit:3'), 3, 'K', 2);
select pg_temp.expire(tests.id('el:edit:3'));
create temp table el_taken as select pg_temp.open('zeynep', 3, 'draft', tests.id('el:plan_a')) result;
select is((select result ->> 'status' from el_taken), 'acquired_after_recovery', 'Zeynep opens Plan A after Ayşe''s lease ran out');
select matches((select result ->> 'recovered_draft_name' from el_taken), '^Auto-save · Ayse Person · ',
  'Ayşe''s unsaved work is an Auto-save draft with her name, and the answer says so');
select is((select count(*)::integer from public.schedule_draft_shifts ds where ds.draft_id = (select (result ->> 'recovered_draft_id')::uuid from el_taken)),
  2, 'with Plan A''s shift and the one she added');

-- 3. Opening another draft does not silently resume the old edit (D-O9) -----------

select tests.remember('el:edit:4', pg_temp.sid(pg_temp.open('can', 5, 'blank', null, array['K'])));
select pg_temp.add('can', tests.id('el:edit:4'), 5, 'K', 1);
select tests.remember('el:plan_b', pg_temp.save('can', tests.id('el:edit:4'), 'Plan B'));
select tests.remember('el:edit:5', pg_temp.sid(pg_temp.open('can', 5, 'blank', null, array['K'])));
select tests.remember('el:plan_c', pg_temp.save('can', tests.id('el:edit:5'), 'Plan C'));
select tests.remember('el:edit:6', pg_temp.sid(pg_temp.open('can', 5, 'draft', tests.id('el:plan_b'))));
select pg_temp.add('can', tests.id('el:edit:6'), 5, 'K', 3);
select is(pg_temp.open('can', 5, 'draft', tests.id('el:plan_b')) ->> 'status', 'resumed',
  'Can opening Plan B again picks his edit back up');
create temp table el_other as select pg_temp.open('can', 5, 'draft', tests.id('el:plan_c')) result;
select is((select result -> 'session' ->> 'source_draft_id' from el_other), tests.id('el:plan_c')::text,
  'asking for Plan C opens Plan C, not his Plan B edit');
select is((select result ->> 'status' from el_other), 'acquired_after_recovery', 'and says his old edit was put aside');
select matches((select result ->> 'recovered_draft_name' from el_other), '^Auto-save · Can Person · ',
  'his unsaved Plan B work is in his Auto-save draft');
select is(pg_temp.status(tests.id('el:edit:6')), 'recovered', 'the Plan B edit is closed');

-- Zeynep now edits Plan B; Can, with unsaved Plan C work, asks for Plan B.
select pg_temp.add('can', pg_temp.sid((select result from el_other)), 5, 'K', 4);
select pg_temp.open('zeynep', 5, 'draft', tests.id('el:plan_b'));
select is(pg_temp.open('can', 5, 'draft', tests.id('el:plan_b')) ->> 'status', 'conflict', 'Can is told Zeynep edits Plan B');
select is(pg_temp.status(pg_temp.sid((select result from el_other))), 'active', 'and his Plan C edit stays open, untouched');
-- Zeynep adds to Plan B unsaved and her lease runs out; Can asks again.
select tests.remember('el:edit:z', (select s.id from public.schedule_edit_sessions s
  where s.source_draft_id = tests.id('el:plan_b') and s.status = 'active'));
select pg_temp.add('zeynep', tests.id('el:edit:z'), 5, 'K', 5);
select pg_temp.expire(tests.id('el:edit:z'));
create temp table el_both as select pg_temp.open('can', 5, 'draft', tests.id('el:plan_b')) result;
select is((select result -> 'session' ->> 'source_draft_id' from el_both), tests.id('el:plan_b')::text,
  'Can opens Plan B when both his and Zeynep''s unsaved work are put aside');
select matches((select result ->> 'recovered_draft_name' from el_both), '^Auto-save · Zeynep Person · ',
  'the answer names Zeynep''s Auto-save draft');
select is(pg_temp.status(pg_temp.sid((select result from el_other))), 'recovered', 'and his Plan C edit is closed into his own');

-- 4. Each manager sees only their own unsaved changes (D-Y5) -----------------------

-- Ayşe takes the published Tuesday shift off, unsaved; the owner edits the same week.
select tests.remember('el:edit:7', pg_temp.sid(pg_temp.open('ayse', 4, 'published', null)));
select public.mutate_schedule_edit_shift_service(tests.user('el:ayse'), tests.id('el'), s.id, s.revision, 'delete',
  sh.id, sh.revision, '{}'::jsonb, gen_random_uuid())
from public.schedule_edit_sessions s join public.schedule_edit_session_shifts sh on sh.session_id = s.id
where s.id = tests.id('el:edit:7');
select tests.remember('el:edit:8', pg_temp.sid(pg_temp.open('owner', 4, 'published', null)));
select is(jsonb_array_length(public.list_schedule_pending_ops_service(tests.user('el:owner'), tests.id('el'), tests.week(4)) -> 'pending_ops'),
  0, 'the owner''s grid gets none of Ayşe''s unsaved changes');
select is(jsonb_array_length(public.list_schedule_pending_ops_service(tests.user('el:ayse'), tests.id('el'), tests.week(4)) -> 'pending_ops'),
  1, 'Ayşe''s gets hers');
create temp table el_off as select pg_temp.autosave('ayse', tests.id('el:edit:7')) result;
select is((select count(*)::integer from public.schedule_draft_shifts ds where ds.draft_id = (select (result ->> 'draft_id')::uuid from el_off)),
  0, 'the Tuesday shift she took off does not come back in her Auto-save draft');

-- 5. A draft being edited is not deleted under the editor (D-O6) ------------------

select tests.remember('el:edit:9', pg_temp.sid(pg_temp.open('ayse', 6, 'blank', null)));
select pg_temp.add('ayse', tests.id('el:edit:9'), 6, 'K', 1);
select tests.remember('el:plan_d', pg_temp.save('ayse', tests.id('el:edit:9'), 'Plan D'));
select tests.remember('el:edit:10', pg_temp.sid(pg_temp.open('ayse', 6, 'draft', tests.id('el:plan_d'))));
select pg_temp.add('ayse', tests.id('el:edit:10'), 6, 'K', 2);
select is(pg_temp.refusal(format('select public.delete_schedule_draft_service(%L, %L, %L)',
  tests.user('el:zeynep'), tests.id('el'), tests.id('el:plan_d'))), 'PT409 schedule.draft_being_edited',
  'Zeynep cannot delete Plan D while Ayşe edits it');
select is(pg_temp.save('ayse', tests.id('el:edit:10'), 'Plan D'), tests.id('el:plan_d'), 'and Ayşe''s save still lands in Plan D');

select tests.remember('el:edit:11', pg_temp.sid(pg_temp.open('ayse', 6, 'draft', tests.id('el:plan_d'))));
select pg_temp.add('ayse', tests.id('el:edit:11'), 6, 'K', 3);
select pg_temp.expire(tests.id('el:edit:11'));
select is(pg_temp.refusal(format('select public.delete_schedule_draft_service(%L, %L, %L)',
  tests.user('el:zeynep'), tests.id('el'), tests.id('el:plan_d'))), 'allowed',
  'once her lease ran out Zeynep deletes Plan D');
select is(pg_temp.status(tests.id('el:edit:11')), 'recovered', 'and Ayşe''s unsaved work goes to an Auto-save draft first');

-- 6. An editor who lost the location changes nothing more (B-3 follow-up) ---------

select tests.remember('el:edit:12', pg_temp.sid(pg_temp.open('can', 7, 'published', null, array['K', 'B'])));
select pg_temp.add('can', tests.id('el:edit:12'), 7, 'B', 1);
select tests.stops_working_at((select m.id from public.workspace_memberships m
  where m.workspace_id = tests.id('el') and m.user_id = tests.user('el:can')), tests.id('el:K'));
select is(pg_temp.refusal(format('select public.add_schedule_pending_op_service(%L, %L, %L, ''create'', null, %L::jsonb)',
  tests.user('el:can'), tests.id('el'), tests.id('el:edit:12'),
  jsonb_build_object('location_id', tests.id('el:B'), 'job_id', tests.id('el:job:cook'), 'scheduled_date', tests.week(7) + 2,
    'start_time', '09:00', 'end_time', '13:00'))), '42501 authz.out_of_scope',
  'Can, off Kadıköy, adds nothing to his Kadıköy and Beşiktaş edit');
select is(pg_temp.refusal(format('select public.discard_schedule_edit_session_service(%L, %L, %L)',
  tests.user('el:can'), tests.id('el'), tests.id('el:edit:12'))), '42501 authz.out_of_scope',
  'and does not throw away its Kadıköy work');

-- 7. A draft's archived location no longer counts (BL-224, KARARLAR Q-B/Q-C) -------

select tests.remember('el:edit:13', pg_temp.sid(pg_temp.open('owner', 8, 'blank', null, array['K', 'B'])));
select pg_temp.add('owner', tests.id('el:edit:13'), 8, 'K', 1);
select pg_temp.add('owner', tests.id('el:edit:13'), 8, 'B', 1);
select tests.remember('el:plan_e', pg_temp.save('owner', tests.id('el:edit:13'), 'Plan E'));
select is(pg_temp.refusal(format('select public.delete_schedule_draft_service(%L, %L, %L)',
  tests.user('el:zeynep'), tests.id('el'), tests.id('el:plan_e'))), '42501 authz.out_of_scope',
  'Zeynep (Kadıköy) cannot delete the Kadıköy and Beşiktaş draft');
update public.locations set archived_at = now() where id = tests.id('el:B');
select is(pg_temp.refusal(format('select public.delete_schedule_draft_service(%L, %L, %L)',
  tests.user('el:zeynep'), tests.id('el'), tests.id('el:plan_e'))), 'allowed',
  'once Beşiktaş is archived, she can');

select * from finish();
rollback;
