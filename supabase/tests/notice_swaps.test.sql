begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- Every person's shift change card is their own (KARARLAR S-247 (3), Mert 2026-10-23; notification panel
-- slice 2). A card that asks for something stays in the list when the request moves on: it stops waiting
-- and says what happened and who did it. Reading one's own card never marks anyone else's.
--   (a) A decider has one open card per request: a reminder or the last call replaces the decider's open
--       "needs your approval" card and the reminder before it ('superseded'); the new one stays open.
--   (b) "Extra shift available": a teammate who asks for the shift has their own card closed as 'applied'
--       by them; when the shift goes to someone, the cards of teammates who never asked close as 'taken',
--       never 'approved'. The decider's card closes as 'approved'.
--   (c) "No one could cover your shift" stays open for the owner: it is the owner's next step.

select tests.world('sw');
select tests.person('sw', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('sw', 'maria', 'employee', array['K'], array['cook']);
select tests.person('sw', 'ali', 'employee', array['K'], array['cook']);
select tests.person('sw', 'emre', 'employee', array['K'], array['cook']);
select tests.person('sw', 'can', 'employee', array['K'], array['cook']);
select tests.publish_week('sw', 1, '[
  {"label": "maria-mon", "person": "maria", "loc": "K", "job": "cook", "day": 0, "start": "16:00", "end": "22:00"},
  {"label": "maria-tue", "person": "maria", "loc": "K", "job": "cook", "day": 1, "start": "16:00", "end": "22:00"},
  {"label": "maria-wed", "person": "maria", "loc": "K", "job": "cook", "day": 2, "start": "16:00", "end": "22:00"},
  {"label": "maria-thu", "person": "maria", "loc": "K", "job": "cook", "day": 3, "start": "16:00", "end": "22:00"}
]');

create temp table who as
select label, tests.user(label) uid
from unnest(array['sw:owner', 'sw:ayse', 'sw:maria', 'sw:ali', 'sw:emre', 'sw:can']) label;
grant select on who to public;

create function pg_temp.command(person text, command jsonb) returns jsonb language sql as $$
  select public.shift_exchanges_command_service(tests.user(person), tests.id('sw'), command, gen_random_uuid())
$$;
create function pg_temp.rev(cid uuid) returns integer language sql stable as $$
  select revision from public.shift_exchange_cases where id = cid
$$;
create function pg_temp.app(cid uuid, person text) returns uuid language sql stable as $$
  select a.id from public.shift_exchange_applications a where a.case_id = cid and a.employee_id = tests.id(person)
  order by a.created_at desc limit 1
$$;
-- Maria releases her shift to the pool: the case is remembered as 'sw:case:<shift>'.
create function pg_temp.release(label text) returns uuid language sql as $$
  select tests.remember('sw:case:' || label, (pg_temp.command('sw:maria', jsonb_build_object(
    'action', 'create', 'kind', 'cover', 'shift_id', tests.id('sw:shift:' || label))) ->> 'case_id')::uuid)
$$;
-- Maria asks one teammate by name to cover.
create function pg_temp.ask(label text, teammate text) returns uuid language sql as $$
  select tests.remember('sw:case:' || label, (pg_temp.command('sw:maria', jsonb_build_object(
    'action', 'create', 'kind', 'cover', 'shift_id', tests.id('sw:shift:' || label), 'employee_id', tests.id(teammate))) ->> 'case_id')::uuid)
$$;
create function pg_temp.apply(person text, cid uuid) returns jsonb language sql as $$
  select pg_temp.command(person, jsonb_build_object('action', 'apply', 'case_id', cid,
    'shift_id', (select offered_source_id from public.shift_exchange_cases where id = cid)))
$$;
create function pg_temp.answer(person text, cid uuid, verb text) returns jsonb language sql as $$
  select pg_temp.command(person, jsonb_build_object('action', verb, 'case_id', cid, 'application_id', pg_temp.app(cid, person),
    'expected_revision', pg_temp.rev(cid)))
$$;
create function pg_temp.approve(cid uuid, person text) returns jsonb language sql as $$
  select pg_temp.command('sw:ayse', jsonb_build_object('action', 'approve', 'case_id', cid, 'application_id', pg_temp.app(cid, person),
    'expected_revision', pg_temp.rev(cid),
    'fingerprint', public.shift_exchange_preview(tests.user('sw:ayse'), tests.id('sw'), cid, pg_temp.app(cid, person)) ->> 'fingerprint'))
$$;
-- A person's cards of one type on a request, as '<event>: <state>[ by <who>]', state 'open' or the resolution.
create function pg_temp.cards(type_key text, cid uuid, person text) returns text[] language sql stable as $$
  select coalesce(array_agg(substr(n.event_key, length('case:' || cid::text || ':') + 1) || ': ' || coalesce(n.resolution, 'open')
      || coalesce(' by ' || (select w.label from who w where w.uid = n.resolved_by), '')
      || case when (n.resolved_at is null) <> (n.resolution is null) then ' (resolved_at disagrees)' else '' end
    order by n.event_key collate "C"), '{}')
  from public.person_notifications n
  where n.type_key = 'shift_changes.' || cards.type_key and n.subject_type = 'shift_exchange_case' and n.subject_id = cid
    and n.user_id = tests.user(person)
$$;
-- The one card of that type, as '<state>[ by <who>]'.
create function pg_temp.card(type_key text, cid uuid, person text) returns text language sql stable as $$
  select coalesce(n.resolution, 'open') || coalesce(' by ' || (select w.label from who w where w.uid = n.resolved_by), '')
    || case when (n.resolved_at is null) <> (n.resolution is null) then ' (resolved_at disagrees)' else '' end
  from public.person_notifications n
  where n.type_key = 'shift_changes.' || card.type_key and n.subject_type = 'shift_exchange_case' and n.subject_id = cid
    and n.user_id = tests.user(person)
$$;
-- A decider's open approval cards on a request (Ayse is also in the pool: her "Extra shift available" card
-- is not one of them).
create function pg_temp.open_cards(cid uuid, person text) returns text[] language sql stable as $$
  select coalesce(array_agg(replace(n.type_key, 'shift_changes.', '') || ' ' || substr(n.event_key, length('case:' || cid::text || ':') + 1)
    order by n.type_key collate "C", n.event_key collate "C"), '{}')
  from public.person_notifications n
  where n.subject_type = 'shift_exchange_case' and n.subject_id = cid and n.user_id = tests.user(person) and n.resolved_at is null
    and n.type_key in ('shift_changes.approval_needed', 'shift_changes.approval_reminder')
$$;
-- Cards on a request that show read or seen although their own person did not close them.
create function pg_temp.marked(cid uuid) returns text[] language sql stable as $$
  select coalesce(array_agg(w.label || ' ' || replace(n.type_key, 'shift_changes.', '') order by w.label collate "C", n.type_key collate "C"), '{}')
  from public.person_notifications n join who w on w.uid = n.user_id
  where n.subject_type = 'shift_exchange_case' and n.subject_id = cid
    and (n.read_at is not null or n.seen_at is not null) and n.resolved_by is distinct from n.user_id
$$;
create function pg_temp.reminders() returns integer language sql as $$
  select app_private.shift_exchange_remind(100000)
$$;
grant execute on all functions in schema pg_temp to public;

-- (b) Extra shift available --------------------------------------------------------------------------------

select pg_temp.release('maria-mon');
select tests.settle();
select is(array[pg_temp.card('open_shift_available', tests.id('sw:case:maria-mon'), 'sw:ali'),
                pg_temp.card('open_shift_available', tests.id('sw:case:maria-mon'), 'sw:emre'),
                pg_temp.card('open_shift_available', tests.id('sw:case:maria-mon'), 'sw:can')],
  array['open', 'open', 'open'], '(b) Maria releases Monday: Ali, Emre and Can each have an open "Extra shift available" card');

-- Emre reads his own card.
select public.mark_notifications_read_service(tests.user('sw:emre'), tests.id('sw'), array(
  select n.id from public.person_notifications n where n.subject_id = tests.id('sw:case:maria-mon') and n.user_id = tests.user('sw:emre')));
select is(pg_temp.marked(tests.id('sw:case:maria-mon')), array['sw:emre open_shift_available'],
  '(b) Emre reading his card marks only his: Ali''s and Can''s stay unread and unseen');

select pg_temp.apply('sw:ali', tests.id('sw:case:maria-mon'));
select is(pg_temp.card('open_shift_available', tests.id('sw:case:maria-mon'), 'sw:ali'), 'applied by sw:ali',
  '(b) Ali asks for it: his own card stops waiting and says he applied');
select is(pg_temp.card('open_shift_available', tests.id('sw:case:maria-mon'), 'sw:emre'), 'open',
  '(b) Emre''s card still waits');
select is(pg_temp.card('open_shift_available', tests.id('sw:case:maria-mon'), 'sw:can'), 'open',
  '(b) Can''s card still waits');
select is(pg_temp.card('approval_needed', tests.id('sw:case:maria-mon'), 'sw:ayse'), 'open',
  '(b) Ayse is asked to decide');

select pg_temp.apply('sw:emre', tests.id('sw:case:maria-mon'));
select is(pg_temp.card('open_shift_available', tests.id('sw:case:maria-mon'), 'sw:emre'), 'applied by sw:emre',
  '(b) Emre asks too: his card says he applied');
select is(pg_temp.card('open_shift_available', tests.id('sw:case:maria-mon'), 'sw:can'), 'open',
  '(b) Can, who has not asked, still has an open card');
select is(pg_temp.open_cards(tests.id('sw:case:maria-mon'), 'sw:ayse'),
  array['approval_needed approval:' || pg_temp.app(tests.id('sw:case:maria-mon'), 'sw:ali')::text],
  '(b) Ayse still has one open card for the request');

select pg_temp.approve(tests.id('sw:case:maria-mon'), 'sw:ali');
select is(pg_temp.card('open_shift_available', tests.id('sw:case:maria-mon'), 'sw:can'), 'taken by sw:ayse',
  '(b) Ali gets the shift: Can''s card says it was taken');
select is(pg_temp.card('open_shift_available', tests.id('sw:case:maria-mon'), 'sw:ali'), 'applied by sw:ali',
  '(b) Ali''s own card keeps what he did');
select is(pg_temp.card('open_shift_available', tests.id('sw:case:maria-mon'), 'sw:emre'), 'applied by sw:emre',
  '(b) Emre''s own card keeps what he did');
select is((select count(*)::integer from public.person_notifications n where n.subject_id = tests.id('sw:case:maria-mon')
  and n.type_key = 'shift_changes.open_shift_available' and (n.resolution is distinct from 'applied' and n.resolution is distinct from 'taken')), 0,
  '(b) no "Extra shift available" card on the request is left waiting or says approved');
select is(pg_temp.card('approval_needed', tests.id('sw:case:maria-mon'), 'sw:ayse'), 'approved by sw:ayse',
  '(b) Ayse''s card closes as approved, by her');
select is((select count(*)::integer from public.person_notifications n where n.subject_id = tests.id('sw:case:maria-mon')
  and n.type_key = 'shift_changes.open_shift_available' and n.user_id in (select uid from who where label in ('sw:ali', 'sw:emre', 'sw:can'))), 3,
  '(b) no card was deleted');
select is(pg_temp.marked(tests.id('sw:case:maria-mon')), '{}'::text[],
  '(b) nobody''s card is read or seen because of someone else');

-- (a) One open card per decider ------------------------------------------------------------------------------

select pg_temp.release('maria-tue');
select pg_temp.apply('sw:ali', tests.id('sw:case:maria-tue'));
select tests.remember('sw:app:ali-tue', pg_temp.app(tests.id('sw:case:maria-tue'), 'sw:ali'));
select is(pg_temp.open_cards(tests.id('sw:case:maria-tue'), 'sw:ayse'),
  array['approval_needed approval:' || tests.id('sw:app:ali-tue')::text], '(a) Ali asks for Tuesday: Ayse has one open card');

-- ponytail: the request has waited 13 hours.
update public.shift_exchange_events set created_at = now() - interval '13 hours' where case_id = tests.id('sw:case:maria-tue');
select pg_temp.reminders();
select is(pg_temp.cards('approval_reminder', tests.id('sw:case:maria-tue'), 'sw:ayse'), array['reminder:1: open'],
  '(a) after 12 hours Ayse is reminded');
select is(pg_temp.card('approval_needed', tests.id('sw:case:maria-tue'), 'sw:ayse'), 'superseded',
  '(a) the reminder replaces her "needs your approval" card');
select is(pg_temp.open_cards(tests.id('sw:case:maria-tue'), 'sw:ayse'), array['approval_reminder reminder:1'],
  '(a) Ayse has one open card: the reminder');

select pg_temp.apply('sw:emre', tests.id('sw:case:maria-tue'));
select is(pg_temp.open_cards(tests.id('sw:case:maria-tue'), 'sw:ayse'), array['approval_reminder reminder:1'],
  '(a) Emre asks too: Ayse still has one open card');

update public.shift_exchange_events set created_at = now() - interval '25 hours' where case_id = tests.id('sw:case:maria-tue');
select pg_temp.reminders();
select is(pg_temp.cards('approval_reminder', tests.id('sw:case:maria-tue'), 'sw:ayse'),
  array['reminder:1: superseded', 'reminder:2: open'], '(a) 12 hours later the next reminder replaces the first');
select is(pg_temp.open_cards(tests.id('sw:case:maria-tue'), 'sw:ayse'), array['approval_reminder reminder:2'],
  '(a) one open card');

-- ponytail: the request closes in 3 hours.
update public.shift_exchange_cases set expires_at = now() + interval '3 hours' where id = tests.id('sw:case:maria-tue');
select pg_temp.reminders();
select is(pg_temp.cards('approval_reminder', tests.id('sw:case:maria-tue'), 'sw:ayse'),
  array['last_call: open', 'reminder:1: superseded', 'reminder:2: superseded'], '(a) the last call replaces the reminders');
select is(pg_temp.open_cards(tests.id('sw:case:maria-tue'), 'sw:ayse'), array['approval_reminder last_call'],
  '(a) one open card: the last call');
select is(pg_temp.card('approval_needed', tests.id('sw:case:maria-tue'), 'sw:ayse'), 'superseded',
  '(a) the first card still says it was replaced');

select pg_temp.approve(tests.id('sw:case:maria-tue'), 'sw:ali');
select is(pg_temp.cards('approval_reminder', tests.id('sw:case:maria-tue'), 'sw:ayse'),
  array['last_call: approved by sw:ayse', 'reminder:1: superseded', 'reminder:2: superseded'],
  '(a) Ayse approves: the last call closes as approved; the replaced ones keep what happened to them');
select is(pg_temp.card('approval_needed', tests.id('sw:case:maria-tue'), 'sw:ayse'), 'superseded',
  '(a) and so does her first card');
select is(pg_temp.open_cards(tests.id('sw:case:maria-tue'), 'sw:ayse'), '{}'::text[], '(a) nothing waits for Ayse');
select is((select count(*)::integer from public.person_notifications n where n.subject_id = tests.id('sw:case:maria-tue')
  and n.user_id = tests.user('sw:ayse') and n.type_key in ('shift_changes.approval_needed', 'shift_changes.approval_reminder')), 4,
  '(a) no card was deleted');
select is(pg_temp.marked(tests.id('sw:case:maria-tue')), '{}'::text[],
  '(a) a replaced card is not marked read');

-- (c) No one could cover your shift ---------------------------------------------------------------------------

select pg_temp.ask('maria-wed', 'sw:ali');
select pg_temp.answer('sw:ali', tests.id('sw:case:maria-wed'), 'decline');
select is(pg_temp.card('cover_unfilled', tests.id('sw:case:maria-wed'), 'sw:maria'), 'open',
  '(c) Ali can''t cover Wednesday: Maria''s "No one could cover your shift" card stays open');
select is(pg_temp.card('cover_asked', tests.id('sw:case:maria-wed'), 'sw:ali'), 'declined by sw:ali',
  '(c) Ali''s own card says he declined');
select is(pg_temp.marked(tests.id('sw:case:maria-wed')), '{}'::text[], '(c) Maria''s card is unread');

select pg_temp.ask('maria-thu', 'sw:emre');
select pg_temp.answer('sw:emre', tests.id('sw:case:maria-thu'), 'accept');
select pg_temp.answer('sw:emre', tests.id('sw:case:maria-thu'), 'withdraw');
select is(pg_temp.card('cover_unfilled', tests.id('sw:case:maria-thu'), 'sw:maria'), 'open',
  '(c) Emre accepts Thursday, then withdraws: Maria''s card stays open');
select is(pg_temp.card('approval_needed', tests.id('sw:case:maria-thu'), 'sw:ayse'), 'withdrawn by sw:emre',
  '(c) Ayse''s card says Emre withdrew');
select is(pg_temp.card('cover_asked', tests.id('sw:case:maria-thu'), 'sw:emre'), 'accepted by sw:emre',
  '(c) Emre''s own card keeps his answer');

select * from finish();
rollback;
