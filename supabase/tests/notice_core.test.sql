begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- Notification panel, slice 2, core (KARARLAR S-247 (3), Mert 2026-10-23): every person's notification is their
-- own. A request that closes updates every card it put in a list: the card stops waiting, says what happened and
-- who did it, and stays. Read state is per person.
--   1. a time off request (notification_resolve): Ayse answers it; her own card is read, Emre's is closed but
--      unread, and his list says Ayse Person closed it;
--   2. a shift change (shift_exchange_resolve): Emre approves; his card is read, Ayse's closed but unread, and
--      no other card the approval closed is read;
--   3. a card read before it closed keeps its time; closed by nobody, nobody's card is read and no name is
--      shown; closed by someone with no profile in the workspace, no name is shown;
--   4. a card a newer reminder replaced ('superseded', 'reminded_again') is in no list and no count, and kept;
--   5. reading or opening one's list tells one's other tabs and phones once, and not when nothing changed.
--
-- World nk: Kadikoy (K) and Besiktas (B).
--   ayse, emre - managers at K         selin - manager at B
--   ali, can   - employees at K        gizem - an account with no profile in nk

select tests.world('nk');
select tests.person('nk', 'ayse', 'manager', array['K'], array['general manager']);
select tests.person('nk', 'emre', 'manager', array['K'], array['general manager']);
select tests.person('nk', 'selin', 'manager', array['B'], array['general manager']);
select tests.person('nk', 'ali', 'employee', array['K'], array['cook']);
select tests.person('nk', 'can', 'employee', array['K'], array['cook']);
select tests.new_user('nk:gizem', 'Gizem Outsider');
select tests.settle();
select tests.publish_week('nk', 1, '[
  {"label": "ali-mon", "person": "ali", "loc": "K", "job": "cook", "day": 0, "start": "16:00", "end": "22:00"}
]');

create temp table fixture (key text primary key, value uuid);
create function pg_temp.f(label text) returns uuid language sql stable as $$
  select f.value from fixture f where f.key = label
$$;
-- Who got a card of this type about this subject, by label, sorted.
create function pg_temp.told(type_key text, subject uuid) returns text[] language sql stable as $$
  select coalesce(array_agg(i.label order by i.label), '{}')
  from public.person_notifications n
  join tests.ids i on i.id = n.user_id and i.label like 'nk:%:user'
  where n.type_key = told.type_key and n.subject_id = told.subject
$$;
-- One person's card as it stands: what closed it, who, and whether its owner read and saw it.
create function pg_temp.card(type_key text, subject uuid, person text) returns text language sql stable as $$
  select concat_ws(' ', coalesce(n.resolution, 'open'),
    'by ' || coalesce((select i.label from tests.ids i where i.id = n.resolved_by and i.label like '%:user'), '-'),
    case when n.read_at is null then 'unread' when n.read_at = now() then 'read now' else 'read before' end,
    case when n.seen_at is null then 'unseen' when n.seen_at = now() then 'seen now' else 'seen before' end)
  from public.person_notifications n
  where n.type_key = card.type_key and n.subject_id = card.subject and n.user_id = tests.user(card.person)
$$;
-- The same card in the person's list, as the panel reads it.
create function pg_temp.item(person text, type_key text, subject uuid) returns jsonb language sql as $$
  select jsonb_build_object(
    'resolution', i -> 'resolution',
    'resolved_by', (select l.label from tests.ids l where l.id = (i ->> 'resolved_by')::uuid and l.label like '%:user'),
    'resolved_by_name', case when i ? 'resolved_by_name' then i -> 'resolved_by_name' else '"(missing)"'::jsonb end,
    'read', i -> 'read_at' <> 'null'::jsonb)
  from jsonb_array_elements(public.get_notification_feed_service(tests.user(item.person), tests.id('nk'), 'all', null, null, 100)
    -> 'items') i
  where i ->> 'type' = item.type_key and i ->> 'subject_id' = item.subject::text
$$;
-- The list's titles and counts, for one filter.
create function pg_temp.list(person text, filter text) returns jsonb language sql as $$
  select jsonb_build_object(
    'titles', (select coalesce(jsonb_agg(i ->> 'title' order by i ->> 'title'), '[]'::jsonb) from jsonb_array_elements(f -> 'items') i),
    'unseen_count', f -> 'unseen_count', 'unread_count', f -> 'unread_count', 'needs_action_count', f -> 'needs_action_count')
  from (select public.get_notification_feed_service(tests.user(list.person), tests.id('nk'), list.filter, null, null, 100) f) x
$$;
-- The live signals a person's list got so far.
create function pg_temp.signals(person text) returns integer language sql stable as $$
  select count(*)::integer from realtime.messages m
  where m.topic = 'notifications:' || tests.user(signals.person) and m.event = 'changed'
$$;

-- 1. A time off request: Ayse answers it ------------------------------------------------------------------

insert into fixture values ('time off', (public.ask_time_off_service(tests.user('nk:ali'), tests.id('nk'), 'vacation',
  tests.week(0) + 1, tests.week(0) + 1, true, null, null, 'Family visit', 'Europe/Istanbul', gen_random_uuid()) ->> 'id')::uuid);
select tests.settle();
select is(pg_temp.told('time_off.requested', pg_temp.f('time off')), array['nk:ayse:user', 'nk:emre:user'],
  '1. Ali asks for a day off: both of Kadikoy''s managers get the same card');
-- Emre opens his list and sees it; ponytail: the clock is moved by hand (now() is fixed in the test transaction).
select public.mark_notifications_seen_service(tests.user('nk:emre'), tests.id('nk'));
update public.person_notifications set seen_at = now() - interval '1 hour'
where user_id = tests.user('nk:emre') and subject_id = pg_temp.f('time off');

select is(public.answer_time_off_service(tests.user('nk:ayse'), tests.id('nk'), pg_temp.f('time off'), 'approve', null,
    (select r.revision from public.time_off_requests r where r.id = pg_temp.f('time off')),
    app_private.time_off_shifts_print(app_private.time_off_shifts_at_stake(
      (select r from public.time_off_requests r where r.id = pg_temp.f('time off'))))) ->> 'status',
  'approved', '1. Ayse approves it');
select is(pg_temp.card('time_off.requested', pg_temp.f('time off'), 'nk:ayse'), 'approved by nk:ayse:user read now seen now',
  '1. Ayse did it: her own card is closed and read');
select is(pg_temp.card('time_off.requested', pg_temp.f('time off'), 'nk:emre'), 'approved by nk:ayse:user unread seen before',
  '1. Emre''s card is closed as approved by Ayse, still unread, seen when he saw it');
select is(pg_temp.item('nk:emre', 'time_off.requested', pg_temp.f('time off')),
  '{"resolution": "approved", "resolved_by": "nk:ayse:user", "resolved_by_name": "Ayse Person", "read": false}'::jsonb,
  '1. Emre''s list shows it approved by Ayse Person, unread');
select is(pg_temp.item('nk:ayse', 'time_off.requested', pg_temp.f('time off')),
  '{"resolution": "approved", "resolved_by": "nk:ayse:user", "resolved_by_name": "Ayse Person", "read": true}'::jsonb,
  '1. Ayse''s list shows her own, read');

-- 2. A shift change: Emre approves it -----------------------------------------------------------------------

insert into fixture values ('cover', (public.shift_exchanges_command_service(tests.user('nk:ali'), tests.id('nk'),
  jsonb_build_object('action', 'create', 'kind', 'cover', 'shift_id', tests.id('nk:shift:ali-mon')), gen_random_uuid()) ->> 'case_id')::uuid);
select tests.settle();
select public.shift_exchanges_command_service(tests.user('nk:can'), tests.id('nk'),
  jsonb_build_object('action', 'apply', 'case_id', pg_temp.f('cover'), 'shift_id', tests.id('nk:shift:ali-mon')), gen_random_uuid());
select tests.settle();
select is(pg_temp.told('shift_changes.approval_needed', pg_temp.f('cover')), array['nk:ayse:user', 'nk:emre:user'],
  '2. Can asks for Ali''s Monday: both managers get the same card');
insert into fixture select 'can asks', a.id from public.shift_exchange_applications a
where a.case_id = pg_temp.f('cover') and a.employee_id = tests.id('nk:can');
select public.shift_exchanges_command_service(tests.user('nk:emre'), tests.id('nk'), jsonb_build_object(
  'action', 'approve', 'case_id', pg_temp.f('cover'), 'application_id', pg_temp.f('can asks'),
  'expected_revision', (select c.revision from public.shift_exchange_cases c where c.id = pg_temp.f('cover')),
  'fingerprint', public.shift_exchange_preview(tests.user('nk:emre'), tests.id('nk'), pg_temp.f('cover'), pg_temp.f('can asks'))
    ->> 'fingerprint'), gen_random_uuid());
select tests.settle();
select is(pg_temp.card('shift_changes.approval_needed', pg_temp.f('cover'), 'nk:emre'), 'approved by nk:emre:user read now seen now',
  '2. Emre did it: his own card is closed and read');
select is(pg_temp.card('shift_changes.approval_needed', pg_temp.f('cover'), 'nk:ayse'), 'approved by nk:emre:user unread unseen',
  '2. Ayse''s card is closed as approved by Emre, unread and unseen');
select is(
  (select jsonb_build_object('closed', count(*) > 0, 'read_or_seen', count(*) filter (where n.read_at is not null or n.seen_at is not null))
   from public.person_notifications n
   where n.subject_type = 'shift_exchange_case' and n.subject_id = pg_temp.f('cover') and n.resolved_at is not null
     and n.user_id <> tests.user('nk:emre')),
  '{"closed": true, "read_or_seen": 0}'::jsonb,
  '2. no other card the approval closed is read or seen for its owner');
select is(pg_temp.item('nk:ayse', 'shift_changes.approval_needed', pg_temp.f('cover')),
  '{"resolution": "approved", "resolved_by": "nk:emre:user", "resolved_by_name": "Emre Person", "read": false}'::jsonb,
  '2. Ayse''s list shows it approved by Emre Person, unread');

-- 3. Read before, closed by nobody, closed by an outsider --------------------------------------------------

insert into fixture values ('read before', gen_random_uuid()), ('swept', gen_random_uuid()), ('outsider', gen_random_uuid());
select app_private.notify('time_off.requested', tests.id('nk'), array[tests.user('nk:ayse'), tests.user('nk:emre')],
  'time_off:' || pg_temp.f(k) || ':requested', 'Time off request from Can Person',
  target_subject_type => 'time_off', target_subject_id => pg_temp.f(k))
from unnest(array['read before', 'swept', 'outsider']) k;
select public.mark_notifications_read_service(tests.user('nk:ayse'), tests.id('nk'), array(
  select n.id from public.person_notifications n where n.user_id = tests.user('nk:ayse') and n.subject_id = pg_temp.f('read before')));
-- ponytail: the clock is moved by hand.
update public.person_notifications set read_at = now() - interval '1 hour', seen_at = now() - interval '1 hour'
where user_id = tests.user('nk:ayse') and subject_id = pg_temp.f('read before');
select is(app_private.notification_resolve(tests.id('nk'), 'time_off', pg_temp.f('read before'), 'declined', tests.user('nk:ayse')),
  2, '3. Ayse declines a request whose card she read an hour ago');
select is(pg_temp.card('time_off.requested', pg_temp.f('read before'), 'nk:ayse'), 'declined by nk:ayse:user read before seen before',
  '3. her card keeps the time she read it');
select is(app_private.notification_resolve(tests.id('nk'), 'time_off', pg_temp.f('swept'), 'expired', null),
  2, '3. a request nobody answered expires');
select is(
  array[pg_temp.card('time_off.requested', pg_temp.f('swept'), 'nk:ayse'), pg_temp.card('time_off.requested', pg_temp.f('swept'), 'nk:emre')],
  array['expired by - unread unseen', 'expired by - unread unseen'],
  '3. closed by nobody: nobody''s card is read');
select is(pg_temp.item('nk:ayse', 'time_off.requested', pg_temp.f('swept')),
  '{"resolution": "expired", "resolved_by": null, "resolved_by_name": null, "read": false}'::jsonb,
  '3. and the list names nobody');
select app_private.notification_resolve(tests.id('nk'), 'time_off', pg_temp.f('outsider'), 'closed', tests.user('nk:gizem'));
select is(pg_temp.item('nk:emre', 'time_off.requested', pg_temp.f('outsider')),
  '{"resolution": "closed", "resolved_by": "nk:gizem:user", "resolved_by_name": null, "read": false}'::jsonb,
  '3. closed by someone with no profile in this workspace: no name, not their account''s');

-- 4. A card a newer reminder replaced ------------------------------------------------------------------------

select is(pg_temp.list('nk:selin', 'all'),
  '{"titles": [], "unseen_count": 0, "unread_count": 0, "needs_action_count": 0}'::jsonb, '4. Selin''s list starts empty');
insert into fixture values ('replaced', gen_random_uuid()), ('waiting', gen_random_uuid()), ('case', gen_random_uuid());
-- A time off card that a newer one replaced.
select app_private.notify('time_off.requested', tests.id('nk'), array[tests.user('nk:selin')],
  'time_off:' || pg_temp.f('replaced') || ':requested', 'Time off request from Ali Person',
  target_subject_type => 'time_off', target_subject_id => pg_temp.f('replaced'));
select app_private.notification_resolve(tests.id('nk'), 'time_off', pg_temp.f('replaced'), 'superseded', null);
-- A shift change reminder, reminded again: the first closes as 'reminded_again', the second waits.
select app_private.notify('shift_changes.approval_reminder', tests.id('nk'), array[tests.user('nk:selin')],
  'shift_exchange:' || pg_temp.f('case') || ':remind:1', 'Shift change still needs your approval',
  target_subject_type => 'shift_exchange_case', target_subject_id => pg_temp.f('case'));
select app_private.shift_exchange_resolve(tests.id('nk'), pg_temp.f('case'), array['shift_changes.approval_reminder'],
  'reminded_again', null, array[tests.user('nk:selin')]);
select app_private.notify('shift_changes.approval_reminder', tests.id('nk'), array[tests.user('nk:selin')],
  'shift_exchange:' || pg_temp.f('case') || ':remind:2', 'Shift change closes in 4 hours: approve or decline',
  target_subject_type => 'shift_exchange_case', target_subject_id => pg_temp.f('case'));
-- And one that waits.
select app_private.notify('time_off.requested', tests.id('nk'), array[tests.user('nk:selin')],
  'time_off:' || pg_temp.f('waiting') || ':requested', 'Time off request from Can Person',
  target_subject_type => 'time_off', target_subject_id => pg_temp.f('waiting'));
select is(
  jsonb_build_object('all', pg_temp.list('nk:selin', 'all'), 'unread', pg_temp.list('nk:selin', 'unread') -> 'titles',
    'needs_action', pg_temp.list('nk:selin', 'needs_action') -> 'titles'),
  '{"all": {"titles": ["Shift change closes in 4 hours: approve or decline", "Time off request from Can Person"],
            "unseen_count": 2, "unread_count": 2, "needs_action_count": 2},
    "unread": ["Shift change closes in 4 hours: approve or decline", "Time off request from Can Person"],
    "needs_action": ["Shift change closes in 4 hours: approve or decline", "Time off request from Can Person"]}'::jsonb,
  '4. the replaced cards are in no list and no count; the new reminder and the waiting request are');
select is(
  (select array_agg(coalesce(n.resolution, 'open') order by n.title) from public.person_notifications n where n.user_id = tests.user('nk:selin')),
  array['open', 'reminded_again', 'superseded', 'open'],
  '4. they are kept, only out of sight');

-- 5. The signal to one's other tabs and phones ---------------------------------------------------------------

create temp table heard (step text primary key, n integer);
insert into heard values ('before', pg_temp.signals('nk:selin'));
select is(public.mark_notifications_read_service(tests.user('nk:selin'), tests.id('nk'), array(
    select n.id from public.person_notifications n where n.user_id = tests.user('nk:selin') and n.subject_id = pg_temp.f('waiting'))),
  '{"updated": 1, "unread_count": 1}'::jsonb,
  '5. Selin reads the waiting request: one left unread, as her list counts');
select is(pg_temp.signals('nk:selin') - (select n from heard where step = 'before'), 1, '5. her other tabs and phones hear it once');
select is((public.mark_notifications_read_service(tests.user('nk:selin'), tests.id('nk'), array(
    select n.id from public.person_notifications n where n.user_id = tests.user('nk:selin') and n.subject_id = pg_temp.f('waiting')))
  -> 'updated')::integer, 0, '5. reading it again changes nothing');
select is(pg_temp.signals('nk:selin') - (select n from heard where step = 'before'), 1, '5. and sends nothing');
select public.mark_notifications_seen_service(tests.user('nk:selin'), tests.id('nk'));
select public.mark_notifications_seen_service(tests.user('nk:selin'), tests.id('nk'));
select is(pg_temp.signals('nk:selin') - (select n from heard where step = 'before'), 2,
  '5. opening her list sends one more; opening it again with nothing new sends none');
select is(
  (select array_agg(distinct m.payload - 'id') from realtime.messages m
   where m.topic = 'notifications:' || tests.user('nk:selin') and m.event = 'changed'),
  array[jsonb_build_object('workspace_id', tests.id('nk'))],
  '5. every signal names the workspace only, never what a notice says');

select * from finish();
rollback;
