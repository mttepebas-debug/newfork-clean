begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- EKRAN-01 DB-1a: an open Schedule edit is asked of the authorization core
-- for its locations, and a draft somebody cannot reach answers like one that
-- does not exist.
-- Ayşe manages Kadıköy (K) and Beşiktaş (B), Zeynep Kadıköy, Can Beşiktaş.
-- "Plan A" is Ayşe's Kadıköy-only draft for week 1.

select tests.world('es');
select tests.person('es', 'ayse', 'manager', array['K', 'B'], array['cook']);
select tests.person('es', 'zeynep', 'manager', array['K'], array['cook']);
select tests.person('es', 'can', 'manager', array['B'], array['cook']);

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
create function pg_temp.open(actor text, n integer, source text, draft uuid, locs text[]) returns jsonb language sql as $$
  select public.acquire_schedule_edit_session_service(tests.user('es:' || actor), tests.id('es'), tests.week(n),
    source::public.schedule_edit_source, draft, array(select tests.id('es:' || l) from unnest(locs) l))
$$;
create function pg_temp.open_refusal(actor text, n integer, draft uuid) returns text language sql as $$
  select pg_temp.refusal(format('select public.acquire_schedule_edit_session_service(%L, %L, %L, ''draft'', %L)',
    tests.user('es:' || actor), tests.id('es'), tests.week(n), draft))
$$;
create function pg_temp.save(actor text, session uuid, name text, draft uuid) returns text language sql as $$
  select pg_temp.refusal(format('select public.save_schedule_edit_session_service(%L, %L, %L, %s, %L, %L, %s)',
    tests.user('es:' || actor), tests.id('es'), session,
    (select s.revision from public.schedule_edit_sessions s where s.id = session), name, draft,
    coalesce((select d.revision::text from public.schedule_drafts d where d.id = draft), '1')))
$$;
create function pg_temp.draft_state(draft uuid) returns text language sql as $$
  select d.name || ' r' || d.revision || ' ' || cardinality(d.location_ids) from public.schedule_drafts d where d.id = draft
$$;

-- Plan A: Ayşe opens week 1 at Kadıköy, writes an open shift, saves.
select tests.remember('es:edit:a1', (pg_temp.open('ayse', 1, 'blank', null, array['K']) -> 'session' ->> 'id')::uuid);
select tests.add_shift(tests.user('es:ayse'), 'es', tests.id('es:edit:a1'), 1,
  '{"loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "17:00"}');
select pg_temp.save('ayse', tests.id('es:edit:a1'), 'Plan A', null);
select tests.remember('es:plan_a', (select d.id from public.schedule_drafts d
  where d.workspace_id = tests.id('es') and d.name = 'Plan A'));
select is(pg_temp.draft_state(tests.id('es:plan_a')), 'Plan A r1 1', 'Plan A is a Kadıköy draft');

-- 1. Save writes only into a draft the person may write (B-1) ----------------------

select tests.remember('es:edit:c1', (pg_temp.open('can', 1, 'blank', null, array['B']) -> 'session' ->> 'id')::uuid);
select is(pg_temp.save('can', tests.id('es:edit:c1'), 'Taken', tests.id('es:plan_a')), '42501 authz.out_of_scope',
  'Can (Beşiktaş) cannot save his edit into the Kadıköy draft');
select is(pg_temp.draft_state(tests.id('es:plan_a')), 'Plan A r1 1', 'and Plan A keeps its name, revision and locations');
select is(pg_temp.save('can', tests.id('es:edit:c1'), 'Taken', gen_random_uuid()), '42501 authz.out_of_scope',
  'a draft that does not exist answers the same');
select is(pg_temp.save('can', tests.id('es:edit:c1'), 'Can week 1', null), 'allowed',
  'Can still saves his edit as his own draft');

-- 2. Opening a draft: out of reach answers like unknown (B-9) ---------------------

select tests.remember('es:edit:a2', (pg_temp.open('ayse', 1, 'draft', tests.id('es:plan_a'), array['K', 'B']) -> 'session' ->> 'id')::uuid);
select is(pg_temp.open_refusal('can', 1, tests.id('es:plan_a')), '42501 authz.out_of_scope',
  'Can cannot open the Kadıköy draft, and learns nothing of who edits it');
select is(pg_temp.open_refusal('can', 1, gen_random_uuid()), '42501 authz.out_of_scope',
  'an unknown draft answers the same');
select is(pg_temp.open('zeynep', 1, 'draft', tests.id('es:plan_a'), array['K']) ->> 'status', 'conflict',
  'Zeynep (Kadıköy) is told Ayşe is editing Plan A');

-- 3. Reading a draft's week: out of reach answers like unknown (BL-412) -----------

select is(pg_temp.refusal(format('select public.list_schedule_weekly_shifts_service(%L, %L, %L, null, %L)',
  tests.user('es:can'), tests.id('es'), tests.week(1), tests.id('es:plan_a'))), '42501 authz.out_of_scope',
  'Can cannot read the Kadıköy draft''s week');
select is(pg_temp.refusal(format('select public.list_schedule_weekly_shifts_service(%L, %L, %L, null, %L)',
  tests.user('es:can'), tests.id('es'), tests.week(1), gen_random_uuid())), '42501 authz.out_of_scope',
  'an unknown draft answers the same');
select is(pg_temp.refusal(format('select public.list_schedule_weekly_shifts_service(%L, %L, %L, null, %L)',
  tests.user('es:zeynep'), tests.id('es'), tests.week(1), tests.id('es:plan_a'))), 'allowed',
  'Zeynep reads it');

-- 4. Refusals say why (B-9, BL-159) ------------------------------------------------

-- Ayşe's week 2 edit holds only Beşiktaş; a Kadıköy shift is outside it.
select tests.remember('es:edit:a3', (pg_temp.open('ayse', 2, 'blank', null, array['B']) -> 'session' ->> 'id')::uuid);
select is(pg_temp.refusal(format('select tests.add_shift(%L, %L, %L, 2, %L::jsonb)', tests.user('es:ayse'), 'es',
  tests.id('es:edit:a3'), '{"loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "17:00"}')),
  '42501 authz.out_of_scope', 'a shift outside the edit''s locations is refused with a reason');
select is(pg_temp.refusal(format('select public.create_schedule_shifts_batch_service(%L, %L, %L, 1, %L::jsonb, %L)',
  tests.user('es:can'), tests.id('es'), tests.id('es:edit:a2'),
  jsonb_build_array(jsonb_build_object('location_id', tests.id('es:B'))), gen_random_uuid())),
  '42501 authz.out_of_scope', 'adding shifts to somebody else''s edit is refused with a reason');
select is(
  (select count(*)::integer from pg_proc p, regexp_matches(p.prosrc, 'raise\s[^;]*;', 'gi') m
   where p.proname in ('acquire_schedule_edit_session_service', 'save_schedule_edit_session_service',
     'heartbeat_schedule_edit_session_service', 'get_schedule_edit_session_service',
     'create_schedule_shifts_batch_service', 'unpublish_schedule_service', 'publish_schedule_draft_service',
     'keep_session_shift_in_session_locations', 'list_schedule_weekly_shifts_service')
     and m[1] ~ '42501' and m[1] !~* 'hint'),
  0, 'the Schedule edit says no only with a reason');

-- 5. Ayşe stops working at Kadıköy (B-3) ------------------------------------------

-- Her week 3 edit holds both locations; it is left open.
select tests.remember('es:edit:a4', (pg_temp.open('ayse', 3, 'blank', null, array['K', 'B']) -> 'session' ->> 'id')::uuid);
select tests.add_shift(tests.user('es:ayse'), 'es', tests.id('es:edit:a4'), 3,
  '{"loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "17:00"}');
select tests.stops_working_at((select m.id from public.workspace_memberships m
  where m.workspace_id = tests.id('es') and m.user_id = tests.user('es:ayse')), tests.id('es:K'));

select is(pg_temp.refusal(format('select public.heartbeat_schedule_edit_session_service(%L, %L, %L)',
  tests.user('es:ayse'), tests.id('es'), tests.id('es:edit:a2'))), '42501 authz.out_of_scope',
  'her open Plan A edit keeps no lease');
select is(pg_temp.refusal(format('select public.get_schedule_edit_session_service(%L, %L, %L)',
  tests.user('es:ayse'), tests.id('es'), tests.id('es:edit:a2'))), '42501 authz.out_of_scope',
  'and reads nothing of Kadıköy');
select is(pg_temp.save('ayse', tests.id('es:edit:a2'), 'Plan A', tests.id('es:plan_a')), '42501 authz.out_of_scope',
  'and saves nothing');
select is(pg_temp.draft_state(tests.id('es:plan_a')), 'Plan A r1 1', 'Plan A is as it was');
select is(pg_temp.open('zeynep', 1, 'draft', tests.id('es:plan_a'), array['K']) ->> 'status', 'acquired',
  'Zeynep opens Plan A at once: Ayşe''s edit no longer holds it');
select is((select s.status::text from public.schedule_edit_sessions s where s.id = tests.id('es:edit:a2')), 'expired',
  'Ayşe''s Plan A edit is closed (nothing unsaved in it)');

select is((select array(select jsonb_array_elements_text(r -> 'session' -> 'location_ids'))::uuid[]
  from pg_temp.open('ayse', 3, 'blank', null, array['B']) r), array[tests.id('es:B')],
  'when Ayşe opens week 3 again she edits Beşiktaş only');
select isnt((select s.status::text from public.schedule_edit_sessions s where s.id = tests.id('es:edit:a4')), 'active',
  'her old week 3 edit is closed');
select is((select count(*)::integer from public.schedule_draft_shifts ds
  join public.schedule_edit_sessions s on s.recovered_draft_id = ds.draft_id
  where s.id = tests.id('es:edit:a4') and ds.location_id = tests.id('es:K')), 1,
  'and its unsaved Kadıköy shift waits in a recovery draft');

select * from finish();
rollback;
