begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Notification panel, slice 2b (KARARLAR S-251, Mert 2026-10-23): a person can mark their own read notices
-- unread again (on a phone, a swipe on a read row says "Unread").
--   1. one's own read notice turns unread and keeps the time it was first seen; an unread one stays as it is;
--      a notice about one's account (no workspace) turns unread too;
--   2. never somebody else's: not a teammate's in the same workspace, not a stranger's in another workspace,
--      nor one's own in another workspace;
--   3. the unread count it answers with is the list's (a card a newer reminder replaced is not counted);
--   4. it tells one's other tabs and phones once, naming the workspace only, and not when nothing changed;
--   5. it asks for rows by id (none named: 22023), and a stranger is refused (42501, authz.not_member);
--   6. only the API (service role) may call it; it runs as its owner with an empty search path.
--
-- World nu: ali, emre - employees at Kadikoy. World nv: xena - an employee there.

select tests.world('nu');
select tests.world('nv');
select tests.person('nu', 'ali', 'employee', array['K'], array['cook']);
select tests.person('nu', 'emre', 'employee', array['K'], array['cook']);
select tests.person('nv', 'xena', 'employee', array['K'], array['cook']);
select tests.settle();

-- One person's notice, by its event key.
create function pg_temp.n(k text, who text) returns uuid language sql stable as $$
  select x.id from public.person_notifications x where x.event_key = k and x.user_id = tests.user(who)
$$;
-- Whether its owner read it and saw it, and when.
create function pg_temp.state(k text, who text) returns text language sql stable as $$
  select concat_ws(' ',
    case when x.read_at is null then 'unread' when x.read_at = now() then 'read now' else 'read before' end,
    case when x.seen_at is null then 'unseen' when x.seen_at = now() then 'seen now' else 'seen before' end)
  from public.person_notifications x where x.event_key = k and x.user_id = tests.user(who)
$$;
-- The live signals a person's list got so far; with a workspace, only those that name it and nothing else.
create function pg_temp.signals(who text, w uuid default null) returns integer language sql stable as $$
  select count(*)::integer from realtime.messages m
  where m.topic = 'notifications:' || tests.user(who) and m.event = 'changed'
    and (w is null or m.payload - 'id' = jsonb_build_object('workspace_id', w))
$$;
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare h text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics h = pg_exception_hint;
  return sqlstate || ' ' || coalesce(nullif(h, ''), '(no hint)');
end $$;

-- Ali and Emre hear of week 1; Ali changed his password; a time off card of Ali's was replaced by a newer one.
select app_private.notify('schedule.published', tests.id('nu'), array[tests.user('nu:ali'), tests.user('nu:emre')],
  'nu:published:1', 'Your schedule for week 1 is out');
select app_private.notify('account.password_changed', null, array[tests.user('nu:ali')], 'nu:password:1',
  'Your password was changed', target_actor => tests.user('nu:ali'));
select app_private.notify('time_off.requested', tests.id('nu'), array[tests.user('nu:ali')], 'nu:replaced:1',
  'Time off request from Emre Person', target_subject_type => 'time_off',
  target_subject_id => '00000000-0000-0000-0000-0000000000b1');
select app_private.notification_resolve(tests.id('nu'), 'time_off', '00000000-0000-0000-0000-0000000000b1', 'superseded', null);
select app_private.notify('schedule.published', tests.id('nv'), array[tests.user('nv:xena')], 'nv:published:1',
  'Your schedule for week 1 is out');
-- Each reads all of theirs.
select public.mark_notifications_read_service(tests.user('nu:ali'), tests.id('nu'));
select public.mark_notifications_read_service(tests.user('nu:emre'), tests.id('nu'));
select public.mark_notifications_read_service(tests.user('nv:xena'), tests.id('nv'));
-- ponytail: the clock is moved by hand (now() is fixed in the test transaction).
update public.person_notifications set read_at = now() - interval '1 hour', seen_at = now() - interval '1 hour'
where user_id in (tests.user('nu:ali'), tests.user('nu:emre'), tests.user('nv:xena')) and read_at is not null;
-- Then week 2 is out for Ali: unread, unseen.
select app_private.notify('schedule.published', tests.id('nu'), array[tests.user('nu:ali')], 'nu:published:2',
  'Your schedule for week 2 is out');
-- ponytail: written by hand. It stands for Ali's own notice in another workspace of his, read an hour ago.
insert into public.person_notifications (workspace_id, user_id, type_key, event_key, title, read_at, seen_at, expires_at)
values (tests.id('nv'), tests.user('nu:ali'), 'schedule.published', 'nv:published:ali', 'Your schedule elsewhere is out',
  now() - interval '1 hour', now() - interval '1 hour', now() + interval '90 days');

select is(
  array[pg_temp.state('nu:published:1', 'nu:ali'), pg_temp.state('nu:password:1', 'nu:ali'),
        pg_temp.state('nu:published:2', 'nu:ali'), pg_temp.state('nu:published:1', 'nu:emre')],
  array['read before seen before', 'read before seen before', 'unread unseen', 'read before seen before'],
  'Ali read week 1 and his password notice an hour ago, week 2 is new; Emre read his week 1');

-- 1-3. Ali marks rows unread: his own and others' ----------------------------------------------------------

create temp table heard (who text primary key, n integer, named integer);
insert into heard values
  ('nu:ali', pg_temp.signals('nu:ali'), pg_temp.signals('nu:ali', tests.id('nu'))),
  ('nu:emre', pg_temp.signals('nu:emre'), null), ('nv:xena', pg_temp.signals('nv:xena'), null);
create temp table answer (j jsonb);
insert into answer select public.mark_notifications_unread_service(tests.user('nu:ali'), tests.id('nu'), array[
  pg_temp.n('nu:published:1', 'nu:ali'), pg_temp.n('nu:password:1', 'nu:ali'), pg_temp.n('nu:published:2', 'nu:ali'),
  pg_temp.n('nu:replaced:1', 'nu:ali'), pg_temp.n('nu:published:1', 'nu:emre'), pg_temp.n('nv:published:1', 'nv:xena'),
  pg_temp.n('nv:published:ali', 'nu:ali')]);

select is((select j from answer), '{"updated": 3, "unread_count": 3}'::jsonb,
  '1. three of Ali''s own read rows here turn unread; three are unread now, as his list counts');
select is(pg_temp.state('nu:published:1', 'nu:ali'), 'unread seen before',
  '1. his week 1 is unread again, and keeps the time he first saw it');
select is(pg_temp.state('nu:password:1', 'nu:ali'), 'unread seen before',
  '1. a notice about his account, in no workspace, turns unread too');
select is(pg_temp.state('nu:published:2', 'nu:ali'), 'unread unseen', '1. week 2, still unread, stays as it was');
select is(pg_temp.state('nu:published:1', 'nu:emre'), 'read before seen before',
  '2. Emre''s week 1, in the same workspace, is not Ali''s to mark: still read');
select is(pg_temp.state('nv:published:1', 'nv:xena'), 'read before seen before',
  '2. Xena''s, in another workspace, is not either');
select is(pg_temp.state('nv:published:ali', 'nu:ali'), 'read before seen before',
  '2. nor is Ali''s own notice in another workspace, from this one');
select is(
  (select jsonb_build_object('answer', a.j -> 'unread_count', 'list', f -> 'unread_count',
     'unread', (select jsonb_agg(i ->> 'title' order by i ->> 'title') from jsonb_array_elements(u -> 'items') i))
   from answer a,
     lateral (select public.get_notification_feed_service(tests.user('nu:ali'), tests.id('nu')) f) x,
     lateral (select public.get_notification_feed_service(tests.user('nu:ali'), tests.id('nu'), 'unread') u) y),
  '{"answer": 3, "list": 3,
    "unread": ["Your password was changed", "Your schedule for week 1 is out", "Your schedule for week 2 is out"]}'::jsonb,
  '3. the count it answers is the list''s, and the replaced card is in neither');

-- 4. The signal to one's other tabs and phones --------------------------------------------------------------

select is(
  array[pg_temp.signals('nu:ali') - h.n, pg_temp.signals('nu:ali', tests.id('nu')) - h.named],
  array[1, 1], '4. Ali''s other tabs and phones hear it once, and the signal names the workspace only')
from heard h where h.who = 'nu:ali';
select is(
  array(select pg_temp.signals(h.who) - h.n from heard h where h.who <> 'nu:ali' order by h.who),
  array[0, 0], '4. nobody else hears a thing');
select is((public.mark_notifications_unread_service(tests.user('nu:ali'), tests.id('nu'), array[
    pg_temp.n('nu:published:1', 'nu:ali'), pg_temp.n('nu:password:1', 'nu:ali')]) -> 'updated')::integer,
  0, '4. marking them unread again changes nothing');
select is(pg_temp.signals('nu:ali') - (select n from heard where who = 'nu:ali'), 1, '4. and sends nothing');

-- 5. What it asks for, and who is refused ---------------------------------------------------------------------

select is(pg_temp.refusal(format('select public.mark_notifications_unread_service(%L, %L, null)',
    tests.user('nu:ali'), tests.id('nu'))),
  '22023 notifications.ids_required', '5. no rows named is refused, never read as "all of them"');
select is(pg_temp.refusal(format('select public.mark_notifications_unread_service(%L, %L, %L::uuid[])',
    tests.user('nu:ali'), tests.id('nu'), '{}')),
  '22023 notifications.ids_required', '5. nor an empty list');
select is(pg_temp.refusal(format('select public.mark_notifications_unread_service(%L, %L, array[%L]::uuid[])',
    tests.user('nv:xena'), tests.id('nu'), pg_temp.n('nv:published:1', 'nv:xena'))),
  '42501 authz.not_member', '5. Xena is not in World nu: refused as not a member');

-- 6. Who may call it -------------------------------------------------------------------------------------------

select is(
  (select jsonb_build_object('definer', p.prosecdef, 'empty_search_path', p.proconfig = array['search_path=""'],
     'anon', has_function_privilege('anon', p.oid, 'execute'),
     'authenticated', has_function_privilege('authenticated', p.oid, 'execute'),
     'service_role', has_function_privilege('service_role', p.oid, 'execute'))
   from pg_proc p where p.oid = to_regprocedure('public.mark_notifications_unread_service(uuid, uuid, uuid[])')),
  '{"definer": true, "empty_search_path": true, "anon": false, "authenticated": false, "service_role": true}'::jsonb,
  '6. only the service role may call it; it runs as its owner with an empty search path');

select * from finish();
rollback;
