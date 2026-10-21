begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Open shifts reach the pool when the manager offers them (Mert, 2026-10-20; replaces the
-- "only a release reaches the pool" part of S-151 (3)). Publishing asks once about the open
-- shifts the publish brings (new, or changed since the last publish): offer them to eligible
-- employees, keep them as open shifts only managers see, or delete them. Eligible is the
-- release rule: at the location, doing the job. An employee asks; a manager approves; it closes
-- 4 hours before the shift. Open shifts published before the rule stay where they are. No
-- notice goes to the pool (the notification program has not started).

select tests.world('os');
select tests.person('os', 'rachel', 'manager', array['K'], array['cook']);
select tests.person('os', 'ali', 'employee', array['K'], array['cook']);
select tests.person('os', 'jake', 'employee', array['K'], array['cook']);
select tests.person('os', 'ece', 'employee', array['K'], array['server']);
select tests.person('os', 'berk', 'employee', array['B'], array['cook']);

-- Published before the rule: an open Saturday, with nobody asked.
select tests.remember('os:draft:1', tests.publish_week('os', 1, '[
  {"label": "ali-mon", "person": "ali", "loc": "K", "job": "cook", "day": 0, "start": "09:00", "end": "15:00"},
  {"label": "old-open", "loc": "K", "job": "cook", "day": 5, "start": "09:00", "end": "15:00"}
]'));

create temporary table os (key text primary key, value jsonb);
create function pg_temp.command(who text, command jsonb) returns jsonb language sql as $$
  select public.shift_exchanges_command_service(tests.user('os:' || who), tests.id('os'), command, gen_random_uuid())
$$;
-- A week Rachel writes at Kadikoy: from what is published, or blank, plus these shifts.
create function pg_temp.draft(n integer, source text, shifts jsonb) returns uuid language plpgsql as $$
declare session uuid; shift jsonb;
begin
  session := (public.acquire_schedule_edit_session_service(tests.user('os:rachel'), tests.id('os'), tests.week(n),
    source::public.schedule_edit_source, null) -> 'session' ->> 'id')::uuid;
  for shift in select value from jsonb_array_elements(shifts) loop
    perform tests.add_shift(tests.user('os:rachel'), 'os', session, n, shift);
  end loop;
  return (public.save_schedule_edit_session_service(tests.user('os:rachel'), tests.id('os'), session,
    (select e.revision from public.schedule_edit_sessions e where e.id = session), 'week ' || n || ' ' || source || ' ' || substr(gen_random_uuid()::text, 1, 8), null, null) ->> 'id')::uuid;
end; $$;
create function pg_temp.preview(draft uuid) returns jsonb language sql as $$
  select public.preview_schedule_publication_service(tests.user('os:rachel'), tests.id('os'), draft, array[tests.id('os:K')], null, true)
$$;
create function pg_temp.publish(draft uuid, choice text) returns jsonb language sql as $$
  select public.publish_schedule_draft_service(tests.user('os:rachel'), tests.id('os'), draft, array[tests.id('os:K')], null, true,
    (select d.revision from public.schedule_drafts d where d.id = draft), pg_temp.preview(draft) ->> 'fingerprint', '[]'::jsonb,
    open_shift_choice => choice)
$$;
-- The published shift at Kadikoy on that day of week n.
create function pg_temp.shift(n integer, day integer) returns jsonb language sql as $$
  select public.shift_exchange_shift(tests.id('os'), (select p.id from public.schedule_published_shifts p
    join public.schedule_location_publications pub on pub.id = p.publication_id and pub.status = 'current'
    where p.workspace_id = tests.id('os') and p.location_id = tests.id('os:K') and p.scheduled_date = tests.week(n) + day))
$$;
create function pg_temp.open_case(n integer, day integer) returns public.shift_exchange_cases language sql as $$
  select c.* from public.shift_exchange_cases c where c.workspace_id = tests.id('os') and c.status = 'open'
    and c.offered_source_id = (pg_temp.shift(n, day) ->> 'source_id')::uuid
$$;
-- Shift Hub -> Available Shifts as the person reads it.
create function pg_temp.offered(who text, n integer, day integer) returns boolean language sql as $$
  select exists(select 1 from jsonb_array_elements(public.shift_exchanges_read_service(tests.user('os:' || who), tests.id('os'), false,
    tests.week(n), tests.week(n) + 6) -> 'opportunities') o where o -> 'shift' ->> 'source_id' = pg_temp.shift(n, day) ->> 'source_id')
$$;
grant execute on all functions in schema pg_temp to public;

-- 1. An open shift published before the rule is nobody's pick ------------------------------------
select ok((pg_temp.open_case(1, 5)).id is null, 'the open Saturday published before the rule has no request');
select ok(not pg_temp.offered('jake', 1, 5), 'and Jake does not find it in Available Shifts');
select is(public.get_employee_hub_service(tests.user('os:jake'), tests.id('os'), tests.week(1), tests.week(1) + 6) -> 'open_shifts',
  '[]'::jsonb, 'nor does any open shift reach Jake through the Employee Hub read');

-- 2. Republishing asks only about the open shift it brings -----------------------------------------
select tests.remember('os:draft:1b', pg_temp.draft(1, 'published', '[
  {"loc": "K", "job": "cook", "day": 3, "start": "16:00", "end": "22:00"}
]'));
insert into os select 'preview:1b', pg_temp.preview(tests.id('os:draft:1b'));
select is((select jsonb_agg(x ->> 'scheduled_date' order by x ->> 'scheduled_date') from os, jsonb_array_elements(value -> 'open_shifts') x
  where key = 'preview:1b'), jsonb_build_array((tests.week(1) + 3)::text),
  'the publish asks about the new open Thursday, not the Saturday already published');
select is((select jsonb_build_object('start', x ->> 'start_time', 'end', x ->> 'end_time', 'job', x ->> 'job_name', 'location', x ->> 'location_id')
  from os, jsonb_array_elements(value -> 'open_shifts') x where key = 'preview:1b'),
  jsonb_build_object('start', '16:00', 'end', '22:00', 'job', 'Cook', 'location', tests.id('os:K')),
  'and says when it is, the job, and where');

-- Rachel offers it.
select lives_ok($$ select pg_temp.publish(tests.id('os:draft:1b'), 'offer') $$, 'Rachel publishes and offers the open shift');
select tests.settle();
select is((select jsonb_build_object('owner', c.owner_id, 'kind', c.kind, 'audience', c.audience, 'publication', c.open_shift_publication_id,
  'closes', c.expires_at = (pg_temp.shift(1, 3) ->> 'starts_at')::timestamptz - interval '4 hours') from pg_temp.open_case(1, 3) c),
  jsonb_build_object('owner', null, 'kind', 'cover', 'audience', 'eligible_pool', 'publication',
    (select p.id from public.schedule_location_publications p where p.location_id = tests.id('os:K') and p.week_start = tests.week(1) and p.status = 'current'),
    'closes', true),
  'the offer is a request nobody owns, open to the pool, made by this publish, closing 4 hours before the shift');
select ok((pg_temp.open_case(1, 5)).id is null, 'the Saturday published before stays out of the pool');
select ok(pg_temp.offered('jake', 1, 3), 'Jake (Kadikoy, cook) finds the open Thursday in Available Shifts');
select ok(pg_temp.offered('ali', 1, 3), 'so does Ali');
select ok(not pg_temp.offered('ece', 1, 3), 'Ece, a server, does not');
select ok(not pg_temp.offered('berk', 1, 3), 'Berk, a cook at Besiktas, does not');
select is((select count(*)::integer from public.person_notifications n where n.workspace_id = tests.id('os')
  and n.type_key = 'shift_changes.open_shift_available'), 0, 'nobody is told: the pool waits in Shift Hub');
select throws_ok($$ insert into public.shift_exchange_cases(workspace_id, kind, offered_source_id, offered_snapshot, consent_fingerprint,
  expires_at, created_by) values (tests.id('os'), 'cover', tests.id('os:shift:old-open'), '{}', '', now() + interval '1 day',
  tests.user('os:owner')) $$, '23514', null, 'a request nobody owns is only one a publish offered');
select throws_ok(format($$ insert into public.shift_exchange_cases(workspace_id, kind, audience, offered_source_id, offered_snapshot,
  consent_fingerprint, expires_at, created_by, open_shift_publication_id) values (%L, 'cover', 'direct', %L, '{}', '', now() + interval '1 day',
  %L, %L) $$, tests.id('os'), tests.id('os:shift:old-open'), tests.user('os:owner'), (select open_shift_publication_id from pg_temp.open_case(1, 3))),
  '23514', null, 'and it goes to the pool, never to one person');

-- 3. Jake asks; Rachel approves; the shift is his ---------------------------------------------------
select lives_ok($$ select pg_temp.command('jake', jsonb_build_object('action', 'apply', 'shift_id', (pg_temp.shift(1, 3) ->> 'id')::uuid,
  'case_id', (pg_temp.open_case(1, 3)).id)) $$, 'Jake asks for the open Thursday');
select tests.settle();
select ok((select n.body like '% wants the open shift %' from public.person_notifications n where n.workspace_id = tests.id('os')
  and n.type_key = 'shift_changes.approval_needed' and n.user_id = tests.user('os:rachel')),
  'Rachel is asked to approve: Jake wants the open shift');
insert into os select 'case:1', to_jsonb(c) from pg_temp.open_case(1, 3) c;
-- Who may not take it reaches it no other way (nf-guvenlik, 2026-10-20).
select throws_ok(format($$ select pg_temp.command('ece', jsonb_build_object('action', 'apply', 'shift_id', %L, 'case_id', %L)) $$,
  pg_temp.shift(1, 3) ->> 'id', (pg_temp.open_case(1, 3)).id), 'P0001', 'You are not eligible for the full shift', 'Ece cannot ask for it');
select throws_ok(format($$ select pg_temp.command('berk', jsonb_build_object('action', 'apply', 'shift_id', %L, 'case_id', %L)) $$,
  pg_temp.shift(1, 3) ->> 'id', (pg_temp.open_case(1, 3)).id), 'P0001', 'You are not eligible for the full shift', 'nor can Berk');
select throws_ok(format($$ select pg_temp.command('ece', jsonb_build_object('action', 'pass', 'shift_id', %L, 'case_id', %L)) $$,
  pg_temp.shift(1, 3) ->> 'id', (pg_temp.open_case(1, 3)).id), '42501', null, 'Ece cannot pass on a card she is not shown');
select throws_ok(format($$ select pg_temp.command('ece', jsonb_build_object('action', 'close', 'case_id', %L, 'expected_revision', %s)) $$,
  (pg_temp.open_case(1, 3)).id, (pg_temp.open_case(1, 3)).revision), '42501', null, 'Ece cannot close it');
select throws_ok(format($$ select pg_temp.command('jake', jsonb_build_object('action', 'close', 'case_id', %L, 'expected_revision', %s)) $$,
  (pg_temp.open_case(1, 3)).id, (pg_temp.open_case(1, 3)).revision), '42501', null, 'nor can Jake, who asked for it');
select ok(public.shift_exchanges_read_service(tests.user('os:ece'), tests.id('os'), false, tests.week(1), tests.week(1) + 6,
  (pg_temp.open_case(1, 3)).id)::text not like '%' || (pg_temp.open_case(1, 3)).id::text || '%',
  'a link straight to the offer shows Ece nothing of it');
select ok(not has_function_privilege('authenticated', 'public.publish_schedule_draft_service(uuid,uuid,uuid,uuid[],uuid[],boolean,integer,text,jsonb,text)', 'execute')
  and not has_function_privilege('anon', 'public.publish_schedule_draft_service(uuid,uuid,uuid,uuid[],uuid[],boolean,integer,text,jsonb,text)', 'execute')
  and has_function_privilege('service_role', 'public.publish_schedule_draft_service(uuid,uuid,uuid,uuid[],uuid[],boolean,integer,text,jsonb,text)', 'execute'),
  'only the API publishes');
select ok(not has_function_privilege('authenticated', 'app_private.schedule_publication_open_shifts(jsonb)', 'execute'),
  'and the browser cannot list a publish''s open shifts');
insert into os select 'application:1', to_jsonb(a) from public.shift_exchange_applications a, os
  where os.key = 'case:1' and a.case_id = (os.value ->> 'id')::uuid and a.employee_id = tests.id('os:jake');
select lives_ok($$ select pg_temp.command('rachel', jsonb_build_object('action', 'approve',
  'case_id', (select value ->> 'id' from os where key = 'case:1'), 'application_id', (select value ->> 'id' from os where key = 'application:1'),
  'expected_revision', (select revision from public.shift_exchange_cases where id = (select (value ->> 'id')::uuid from os where key = 'case:1')),
  'fingerprint', public.shift_exchange_preview(tests.user('os:rachel'), tests.id('os'), (select (value ->> 'id')::uuid from os where key = 'case:1'),
    (select (value ->> 'id')::uuid from os where key = 'application:1')) ->> 'fingerprint')) $$, 'Rachel approves');
select is(pg_temp.shift(1, 3) ->> 'employee_id', tests.id('os:jake')::text, 'the Thursday is Jake''s now');
select is((select status from public.shift_exchange_cases where id = (select (value ->> 'id')::uuid from os where key = 'case:1')), 'completed',
  'and the offer is done');

-- 4. Keep: the open shift stays the manager's ---------------------------------------------------------
select tests.remember('os:draft:2', pg_temp.draft(2, 'blank', '[
  {"person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}
]'));
select lives_ok($$ select pg_temp.publish(tests.id('os:draft:2'), 'keep') $$, 'Rachel publishes week 2 and keeps its open shift');
select tests.settle();
select ok((pg_temp.open_case(2, 2)).id is null, 'a kept open shift has no request');
select ok(not pg_temp.offered('jake', 2, 2), 'Jake does not find it');
select throws_ok($$ select pg_temp.command('jake', jsonb_build_object('action', 'apply', 'shift_id', (pg_temp.shift(2, 2) ->> 'id')::uuid)) $$,
  'P0001', 'This shift has not been released', 'nor can he ask for it');
select is(public.get_employee_hub_service(tests.user('os:jake'), tests.id('os'), tests.week(2), tests.week(2) + 6) -> 'open_shifts',
  '[]'::jsonb, 'nor read it through the Employee Hub');
select ok(pg_temp.shift(2, 2) is not null and pg_temp.shift(2, 2) ->> 'employee_id' is null, 'the open shift is published, open');

-- 5. Delete: the open shift does not go out -------------------------------------------------------------
select tests.remember('os:draft:3', pg_temp.draft(3, 'blank', '[
  {"person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"},
  {"loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}
]'));
-- Another tab edits the same draft and moves the open shift: that change stays the edit's.
select tests.remember('os:session:3', (public.acquire_schedule_edit_session_service(tests.user('os:owner'), tests.id('os'), tests.week(3),
  'draft', tests.id('os:draft:3')) -> 'session' ->> 'id')::uuid);
update public.schedule_edit_session_shifts set start_time = '10:00' where session_id = tests.id('os:session:3') and employee_id is null;
select lives_ok($$ select pg_temp.publish(tests.id('os:draft:3'), 'delete') $$, 'Rachel publishes week 3 and deletes its open shift');
select is((select count(*)::integer from public.schedule_edit_session_shifts where session_id = tests.id('os:session:3') and employee_id is null),
  1, 'the open shift moved in the other edit stays there');
select ok(pg_temp.shift(3, 2) is null, 'the open shift is not published');
select ok(not exists(select 1 from public.schedule_draft_shifts d where d.draft_id = tests.id('os:draft:3') and d.employee_id is null),
  'nor left in the draft');
select is(pg_temp.shift(3, 1) ->> 'employee_id', tests.id('os:ali')::text, 'Ali''s Tuesday is published');
select is((select d.revision = p.source_draft_revision from public.schedule_drafts d join public.schedule_location_publications p
  on p.source_draft_id = d.id and p.status = 'current' where d.id = tests.id('os:draft:3')), true,
  'the publication carries the draft as it is after the delete');

-- 6. A publish that names no choice keeps them (as before) --------------------------------------------
select tests.remember('os:draft:4', pg_temp.draft(4, 'blank', '[
  {"loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"},
  {"loc": "K", "job": "cook", "day": 3, "start": "09:00", "end": "15:00"}
]'));
select lives_ok($$ select pg_temp.publish(tests.id('os:draft:4'), null) $$, 'a publish without a choice');
select ok((pg_temp.open_case(4, 2)).id is null and (pg_temp.open_case(4, 3)).id is null, 'offers nothing');

-- 7. An open shift asked about again: offered, then kept, the request closes --------------------------------
select tests.remember('os:draft:4b', pg_temp.draft(4, 'published', '[]'));
update public.schedule_draft_shifts set note = 'Patio' where draft_id = tests.id('os:draft:4b') and scheduled_date = tests.week(4) + 2;
select lives_ok($$ select pg_temp.publish(tests.id('os:draft:4b'), 'offer') $$, 'Rachel changes the open Wednesday and offers it');
select tests.settle();
select ok((pg_temp.open_case(4, 2)).id is not null and (pg_temp.open_case(4, 3)).id is null, 'only the changed Wednesday is offered');
select lives_ok($$ select pg_temp.command('jake', jsonb_build_object('action', 'apply', 'shift_id', (pg_temp.shift(4, 2) ->> 'id')::uuid,
  'case_id', (pg_temp.open_case(4, 2)).id)) $$, 'Jake asks for it');
select tests.settle();
select tests.remember('os:draft:4c', pg_temp.draft(4, 'published', '[]'));
update public.schedule_draft_shifts set note = 'Bar' where draft_id = tests.id('os:draft:4c') and scheduled_date = tests.week(4) + 2;
select lives_ok($$ select pg_temp.publish(tests.id('os:draft:4c'), 'keep') $$, 'Rachel changes it again and keeps it');
select tests.settle();
select ok((pg_temp.open_case(4, 2)).id is null, 'the offer is closed');
select ok(not pg_temp.offered('jake', 4, 2), 'and the shift left Available Shifts');
select ok(exists(select 1 from public.person_notifications n where n.workspace_id = tests.id('os') and n.user_id = tests.user('os:jake')
  and n.type_key = 'shift_changes.closed' and n.title = 'A manager closed the request for the open shift'),
  'Jake hears that a manager closed the request for the open shift');

-- 8. A manager closes an offer in Requests -------------------------------------------------------------
select tests.remember('os:draft:5', pg_temp.draft(5, 'blank', '[
  {"loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}
]'));
select pg_temp.publish(tests.id('os:draft:5'), 'offer');
select tests.settle();
select pg_temp.command('ali', jsonb_build_object('action', 'apply', 'shift_id', (pg_temp.shift(5, 2) ->> 'id')::uuid, 'case_id', (pg_temp.open_case(5, 2)).id));
select tests.settle();
select lives_ok($$ select pg_temp.command('rachel', jsonb_build_object('action', 'close', 'case_id', (pg_temp.open_case(5, 2)).id,
  'expected_revision', (pg_temp.open_case(5, 2)).revision)) $$, 'Rachel closes the offer');
select ok(exists(select 1 from public.person_notifications n where n.workspace_id = tests.id('os') and n.user_id = tests.user('os:ali')
  and n.type_key = 'shift_changes.closed' and n.title = 'A manager closed the request for the open shift'),
  'Ali hears it');

-- 9. A published shift made open is asked about on the next publish (Mert, 2026-10-20 evening:
-- "Make open shift" in the shift window, or the card dragged to the Unassigned row) -------------
select tests.remember('os:draft:6', pg_temp.draft(6, 'blank', '[
  {"person": "ali", "loc": "K", "job": "cook", "day": 2, "start": "09:00", "end": "15:00"}
]'));
select pg_temp.publish(tests.id('os:draft:6'), null);
select tests.remember('os:draft:6b', pg_temp.draft(6, 'published', '[]'));
update public.schedule_draft_shifts set employee_id = null where draft_id = tests.id('os:draft:6b') and scheduled_date = tests.week(6) + 2;
select is((select jsonb_agg(x ->> 'scheduled_date') from jsonb_array_elements(pg_temp.preview(tests.id('os:draft:6b')) -> 'open_shifts') x),
  jsonb_build_array((tests.week(6) + 2)::text), 'Ali''s Wednesday made open is asked about');
select lives_ok($$ select pg_temp.publish(tests.id('os:draft:6b'), 'offer') $$, 'Rachel offers it');
select tests.settle();
select ok(pg_temp.shift(6, 2) ->> 'employee_id' is null and (pg_temp.open_case(6, 2)).id is not null, 'it is published open and offered');
select ok(pg_temp.offered('jake', 6, 2), 'Jake finds it in Available Shifts');
select ok(not pg_temp.offered('berk', 6, 2), 'Berk at Besiktas does not');
select tests.remember('os:draft:6c', pg_temp.draft(6, 'published', '[]'));
update public.schedule_draft_shifts set note = 'Grill' where draft_id = tests.id('os:draft:6c') and scheduled_date = tests.week(6) + 2;
select pg_temp.publish(tests.id('os:draft:6c'), null);
select ok((pg_temp.open_case(6, 2)).id is not null, 'a publish without a choice leaves the offer as it is');

select * from finish();
rollback;
