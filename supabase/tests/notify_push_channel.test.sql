begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- BILDIRIM-15 (KARARLAR S-138, S-123, S-126 (5); plan slice 8): phone alerts (web push). A device is the
-- person's, never a workspace's; the API's cron worker claims due push deliveries, sends each to the person's
-- devices and says how each device answered.
--   (a) devices: a person saves and removes their own; a shared device moves to who signed in last; ten at
--       most; the push service's address is one of four hosts, https, no port, no user, nothing that only
--       looks like them;
--   (b) the claim: required first, then oldest; leased; it carries the alert (title, body, link, tag), how
--       long the push service may hold it, its urgency, a topic and the person's devices;
--   (c) the claim asks again: push turned off by the person or the owner, no longer a member (push never
--       goes to a former member, not even "your access ended": S-126 (5)), no device left;
--   (d) launch and freshness: a push queued before the channel opened is skipped; a notice older than 24
--       hours is stale; the push service holds it only for what is left of the 24 hours;
--   (e) finishing, device by device: accepted is never sent again; gone removes the device; a retry waits;
--       nothing reached means dead; the fifth try is the last;
--   (f) fallback: an important or required notice that reached no device goes by email, unless the person
--       or the owner turned email off; an optional one never does;
--   (g) the lock screen: only bodies the product writes itself are shown, never a person's own words;
--   (h) only the worker may claim, finish or give back; the device table and the sent record are closed to
--       the browser; the cron calls the worker only when a push is due.

select tests.world('np');
select tests.person('np', 'ali', 'employee', array['K'], array['cook']);
select tests.person('np', 'bea', 'employee', array['K'], array['cook']);
select tests.person('np', 'can', 'employee', array['K'], array['cook']);
select tests.person('np', 'dee', 'employee', array['K'], array['cook']);
select tests.person('np', 'eve', 'employee', array['K'], array['cook']);

create function pg_temp.u(person text) returns uuid language sql as $$
  select tests.user('np:' || person)
$$;
create function pg_temp.endpoint(name text) returns text language sql immutable as $$
  select 'https://fcm.googleapis.com/fcm/send/' || name
$$;
-- A device the person saves, with keys of the browser's shape (65 and 16 bytes, base64url).
create function pg_temp.device(person text, name text) returns jsonb language sql as $$
  select public.save_notification_push_subscription_service(pg_temp.u(person), pg_temp.endpoint(name),
    'B' || repeat('p', 86), repeat('a', 22), 'Chrome on Windows')
$$;
create function pg_temp.devices(person text) returns integer language sql stable as $$
  select count(*)::integer from public.notification_push_subscriptions s where s.user_id = pg_temp.u(person) and s.revoked_at is null
$$;
create function pg_temp.sub(name text) returns uuid language sql stable as $$
  select s.id from public.notification_push_subscriptions s where s.endpoint = pg_temp.endpoint(name)
$$;
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare state text; hint text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
  return state || ' ' || coalesce(hint, '');
end $$;
create function pg_temp.save(endpoint text) returns text language sql as $$
  select pg_temp.refusal(format('select public.save_notification_push_subscription_service(%L, %L, %L, %L, null)',
    pg_temp.u('eve'), endpoint, 'B' || repeat('p', 86), repeat('a', 22)))
$$;
-- A notice of this type to the person, and its push delivery.
create function pg_temp.notice(kind text, person text, key text, body text default null, w uuid default tests.id('np'),
  subject text default null)
returns uuid language plpgsql as $$
begin
  perform app_private.notify(kind, w, array[pg_temp.u(person)], key, 'Title ' || key, coalesce(body, 'Body ' || key), '/app/requests', null,
    subject, case when subject is null then null else gen_random_uuid() end, '{}'::jsonb);
  return pg_temp.delivery(key);
end $$;
create function pg_temp.delivery(key text, which text default 'push') returns uuid language sql stable as $$
  select d.id from public.notification_deliveries d join public.person_notifications n on n.id = d.notification_id
  where n.event_key = key and d.channel = which
$$;
create function pg_temp.state(key text, which text default 'push') returns text language sql stable as $$
  select d.status || coalesce(' ' || d.last_error, '') from public.notification_deliveries d where d.id = pg_temp.delivery(key, which)
$$;
create temp table claim_log (run integer, item jsonb);
create function pg_temp.claim(run integer, size integer default 50) returns integer language plpgsql as $$
declare got jsonb := public.claim_notification_push_service(size);
begin
  insert into claim_log select run, x from jsonb_array_elements(got) x;
  return jsonb_array_length(got);
end $$;
create function pg_temp.claimed(run integer) returns text[] language sql stable as $$
  select coalesce(array_agg(n.event_key order by c.ord), '{}')
  from (select (item ->> 'delivery_id')::uuid id, row_number() over () ord from claim_log where claim_log.run = claimed.run) c
  join public.notification_deliveries d on d.id = c.id join public.person_notifications n on n.id = d.notification_id
$$;
create function pg_temp.item(run integer, key text) returns jsonb language sql stable as $$
  select item from claim_log where claim_log.run = item.run and item ->> 'delivery_id' = pg_temp.delivery(key)::text
$$;
create function pg_temp.finish(key text, results jsonb) returns text language sql as $$
  select public.finish_notification_push_service(pg_temp.delivery(key), results)
$$;
create function pg_temp.answer(name text, outcome text, code text default null, retry_after integer default null) returns jsonb
language sql stable as $$
  select jsonb_build_object('subscription_id', pg_temp.sub(name), 'outcome', outcome, 'code', code, 'retry_after', retry_after)
$$;

-- The queue is the whole database's: push waiting from other work on a shared database is set aside.
update public.notification_deliveries set status = 'skipped', last_error = 'test_isolation', lease_expires_at = null
where channel in ('push', 'email') and status in ('queued', 'sending', 'failed');
update public.notification_deliveries set sent_at = sent_at - interval '2 days'
where channel = 'email' and sent_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
update app_private.notification_email_channel set opened_at = now() - interval '1 hour';
update app_private.notification_quotas set daily_limit = null, monthly_limit = null where channel = 'email';

-- (a) Devices -----------------------------------------------------------------------------------------------

select is(pg_temp.device('ali', 'ali-1'), '{"devices": 1}'::jsonb, '(a) Ali saves this phone: one device');
select is(pg_temp.device('ali', 'ali-1'), '{"devices": 1}'::jsonb, '(a) saved again, still one: the address is the key');
select is((select s.device_label from public.notification_push_subscriptions s where s.id = pg_temp.sub('ali-1')), 'Chrome on Windows',
  '(a) with the name the browser gave it');
select is(pg_temp.device('bea', 'ali-1'), '{"devices": 1}'::jsonb, '(a) Bea signs in on the same browser and turns it on');
select is(array[pg_temp.devices('ali'), pg_temp.devices('bea')], array[0, 1],
  '(a) the device is Bea''s now: Ali''s alerts never reach Bea''s screen');
select is(public.delete_notification_push_subscription_service(pg_temp.u('ali'), pg_temp.endpoint('ali-1')), '{"devices": 0}'::jsonb,
  '(a) Ali cannot remove what is not hers: the same answer as an unknown device');
select is(pg_temp.devices('bea'), 1, '(a) and Bea''s device stays');
select is(public.delete_notification_push_subscription_service(pg_temp.u('bea'), pg_temp.endpoint('ali-1')), '{"devices": 0}'::jsonb,
  '(a) Bea turns it off');
select is((select s.revoked_reason from public.notification_push_subscriptions s where s.id = pg_temp.sub('ali-1')), 'person',
  '(a) removed by the person');
select is(pg_temp.device('bea', 'ali-1'), '{"devices": 1}'::jsonb, '(a) and turns it on again');

select pg_temp.device('can', 'can-' || n) from generate_series(1, 10) n;
update public.notification_push_subscriptions set last_used_at = now() - interval '3 days' where id = pg_temp.sub('can-4');
update public.notification_push_subscriptions set last_used_at = now() - interval '1 day'
where user_id = pg_temp.u('can') and id <> pg_temp.sub('can-4');
select is(pg_temp.device('can', 'can-11'), '{"devices": 10}'::jsonb, '(a) an eleventh device: still ten');
select is((select s.revoked_reason from public.notification_push_subscriptions s where s.id = pg_temp.sub('can-4')), 'expired',
  '(a) the one used longest ago goes');

select is(pg_temp.refusal(format('select public.save_notification_push_subscription_service(null, %L, %L, %L, null)',
    pg_temp.endpoint('nobody'), 'B' || repeat('p', 86), repeat('a', 22))),
  '42501 authz.not_member', '(a) nobody signed in saves nothing');

select is(array[
    pg_temp.save('http://fcm.googleapis.com/fcm/send/x'),
    pg_temp.save('https://fcm.googleapis.com.evil.com/fcm/send/x'),
    pg_temp.save('https://fcm.googleapis.com@evil.com/fcm/send/x'),
    pg_temp.save('https://user@fcm.googleapis.com/fcm/send/x'),
    pg_temp.save('https://user:pw@fcm.googleapis.com/fcm/send/x'),
    pg_temp.save('https://fcm.googleapis.com:443/fcm/send/x'),
    pg_temp.save('https://142.250.80.10/fcm/send/x'),
    pg_temp.save('https://[2607:f8b0::200a]/fcm/send/x'),
    pg_temp.save('https://evilpush.apple.com/x'),
    pg_temp.save('https://web.push.apple.com.evil.com/x'),
    pg_temp.save('https://push.apple.com/x'),
    pg_temp.save('https://updates.push.services.mozilla.com.evil.com/wpush/v2/x'),
    pg_temp.save('https://push.services.mozilla.com/wpush/v2/x'),
    pg_temp.save('https://FCM.googleapis.com/fcm/send/x'),
    pg_temp.save('https://fcm.googleapis.com/'),
    pg_temp.save('https://fcm.googleapis.com'),
    pg_temp.save('https://fcm.googleapis.com/fcm/send/x y'),
    pg_temp.save('https://fcm.googleapis.com/fcm/send/x' || chr(10)),
    pg_temp.save('https://fcm.googleapis.com\@evil.com/x'),
    pg_temp.save('https://example.com/fcm.googleapis.com/x'),
    pg_temp.save('https://' || repeat('a', 2000) || '.notify.windows.com/x')],
  array_fill('22023 notifications.push_endpoint'::text, array[21]),
  '(a) only the four push services: no http, lookalike, user, port, IP, other case, empty path or space');
select is(array[
    pg_temp.save('https://fcm.googleapis.com/fcm/send/abc:APA91b-x_y'),
    pg_temp.save('https://updates.push.services.mozilla.com/wpush/v2/gAAAAA-x_y'),
    pg_temp.save('https://web.push.apple.com/QGuQyavXutnMH_x'),
    pg_temp.save('https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB%2bx')],
  array_fill('allowed'::text, array[4]),
  '(a) Chrome''s, Firefox''s, Safari''s and Edge''s are taken');
select is(pg_temp.refusal($$insert into public.notification_push_subscriptions (user_id, endpoint, p256dh, auth_secret)
    values (pg_temp.u('eve'), 'https://fcm.googleapis.com.evil.com/x', 'B' || repeat('p', 86), repeat('a', 22))$$),
  '23514 ', '(a) and the table refuses a lookalike itself');
select is(array[
    pg_temp.refusal(format('select public.save_notification_push_subscription_service(%L, %L, %L, %L, null)',
      pg_temp.u('eve'), pg_temp.endpoint('keys'), 'short', repeat('a', 22))),
    pg_temp.refusal(format('select public.save_notification_push_subscription_service(%L, %L, %L, %L, null)',
      pg_temp.u('eve'), pg_temp.endpoint('keys'), 'B' || repeat('p', 86), repeat('a', 21) || '=')),
    pg_temp.refusal(format('select public.save_notification_push_subscription_service(%L, %L, %L, %L, %L)',
      pg_temp.u('eve'), pg_temp.endpoint('keys'), 'B' || repeat('p', 86), repeat('a', 22), 'Phone' || chr(10)))],
  array['22023 notifications.push_keys', '22023 notifications.push_keys', '22023 notifications.push_label'],
  '(a) keys of the browser''s shape, and a name without control characters');
select is((public.get_notification_preferences_service(pg_temp.u('can'), tests.id('np')) -> 'channels' -> 'push' ->> 'devices')::integer, 10,
  '(a) the person''s choices count their devices');

-- (b) The claim ---------------------------------------------------------------------------------------------

-- The channel opened an hour ago (in the product, when this migration was applied).
update app_private.notification_push_channel set opened_at = now() - interval '1 hour';
select pg_temp.device('ali', 'ali-2');
select pg_temp.device('ali', 'ali-3');
select pg_temp.device('dee', 'dee-1');
select pg_temp.device('eve', 'eve-1');

select pg_temp.notice('time_off.decided', 'ali', 'p:ali:1');
select pg_temp.notice('time_off.decided', 'bea', 'p:bea:1');
select pg_temp.notice('people.role_changed', 'ali', 'p:ali:required');
update public.notification_deliveries set created_at = now() - interval '2 minutes' where id = pg_temp.delivery('p:ali:1');
select is(pg_temp.claim(1), 3, '(b) three are due');
select is(pg_temp.claimed(1), array['p:ali:required', 'p:ali:1', 'p:bea:1'], '(b) required first, then oldest');
select is(pg_temp.item(1, 'p:ali:1') - 'delivery_id' - 'ttl' - 'targets',
  jsonb_build_object('urgency', 'high',
    'topic', left(replace((select n.id from public.person_notifications n where n.event_key = 'p:ali:1')::text, '-', ''), 32),
    'payload', jsonb_build_object('title', 'Title p:ali:1', 'body', (select w.name from public.workspaces w where w.id = tests.id('np')),
      'url', '/app/requests', 'tag', (select n.id from public.person_notifications n where n.event_key = 'p:ali:1')::text)),
  '(b) the alert: its title, the workspace''s name, its link and a tag; urgent, under one topic');
select is((select array_agg(t ->> 'endpoint' order by t ->> 'endpoint') from jsonb_array_elements(pg_temp.item(1, 'p:ali:1') -> 'targets') t),
  array[pg_temp.endpoint('ali-2'), pg_temp.endpoint('ali-3')], '(b) to both of Ali''s devices');
select is((select array(select jsonb_object_keys(t) order by 1) from jsonb_array_elements(pg_temp.item(1, 'p:ali:1') -> 'targets') t limit 1),
  array['auth', 'endpoint', 'p256dh', 'subscription_id'], '(b) each with its keys');
select ok((pg_temp.item(1, 'p:ali:1') ->> 'ttl')::integer between 86000 and 86400, '(b) the push service may hold it for the day');
select is(pg_temp.state('p:ali:1'), 'sending', '(b) a claimed row is being sent');
select ok((select d.lease_expires_at > now() and d.attempts = 1 from public.notification_deliveries d where d.id = pg_temp.delivery('p:ali:1')),
  '(b) under a lease, as its first try');
select is(pg_temp.claim(2), 0, '(b) a leased row is not claimed again');
update public.notification_deliveries set lease_expires_at = now() - interval '1 second' where id = pg_temp.delivery('p:bea:1');
select is(pg_temp.claim(3), 1, '(b) its lease ran out: claimed again');
select is((select d.attempts from public.notification_deliveries d where d.id = pg_temp.delivery('p:bea:1')), smallint '2',
  '(b) as its second try');
select is(pg_temp.claim(4), 0, '(b) nothing else is due');

-- (c) The claim asks again ----------------------------------------------------------------------------------

select pg_temp.notice('time_off.decided', 'ali', 'p:ali:off');
select pg_temp.notice('time_off.decided', 'dee', 'p:dee:gone');
select pg_temp.notice('people.access_ended', 'dee', 'p:dee:ended');
insert into public.notification_preferences (workspace_id, user_id, topic_key, channel, enabled)
values (tests.id('np'), pg_temp.u('ali'), 'time_off', 'push', false);
update public.workspace_memberships set status = 'removed' where workspace_id = tests.id('np') and user_id = pg_temp.u('dee');
select is(pg_temp.claim(5), 0, '(c) nothing goes');
select is(array[pg_temp.state('p:ali:off'), pg_temp.state('p:dee:gone'), pg_temp.state('p:dee:ended')],
  array['skipped person_off', 'skipped not_member', 'skipped not_member'],
  '(c) push turned off by the person, no longer a member: skipped, "your access ended" too (S-126 (5))');
delete from public.notification_preferences where user_id = pg_temp.u('ali') and channel = 'push';
select pg_temp.notice('time_off.decided', 'eve', 'p:eve:owner');
insert into public.notification_workspace_settings (workspace_id, push_enabled) values (tests.id('np'), false)
on conflict (workspace_id) do update set push_enabled = false;
select is(pg_temp.claim(51), 0, '(c) the owner turned phone alerts off');
select is(pg_temp.state('p:eve:owner'), 'skipped owner_off', '(c) skipped, never sent');
update public.notification_workspace_settings set push_enabled = true where workspace_id = tests.id('np');

-- No device left once it is due: the important one goes by email instead (announcements email only when asked).
select pg_temp.notice('announcements.published', 'eve', 'p:eve:nodevice');
select is(pg_temp.delivery('p:eve:nodevice', 'email'), null, '(c) an announcement is not emailed while a device takes it');
update public.notification_push_subscriptions set revoked_at = now(), revoked_reason = 'gone' where user_id = pg_temp.u('eve');
select is(pg_temp.claim(6), 0, '(c) Eve''s device is gone before the run');
select is(pg_temp.state('p:eve:nodevice'), 'skipped no_device', '(c) skipped: no device');
select is((select d.status || ' ' || d.reason from public.notification_deliveries d where d.id = pg_temp.delivery('p:eve:nodevice', 'email')),
  'queued push_fallback', '(f) and it goes by email instead');

-- (d) Launch and freshness ----------------------------------------------------------------------------------

select pg_temp.notice('time_off.decided', 'ali', 'p:ali:early');
update public.notification_deliveries set created_at = (select opened_at from app_private.notification_push_channel) - interval '1 minute'
where id = pg_temp.delivery('p:ali:early');
select pg_temp.notice('people.role_changed', 'ali', 'p:ali:stale');
update public.person_notifications set created_at = now() - interval '25 hours' where event_key = 'p:ali:stale';
select pg_temp.notice('time_off.decided', 'ali', 'p:ali:old');
update public.person_notifications set created_at = now() - interval '20 hours' where event_key = 'p:ali:old';
select is(pg_temp.claim(7), 1, '(d) one of three goes');
select is(pg_temp.state('p:ali:early'), 'skipped before_launch', '(d) queued before the channel opened: skipped, never sent');
select is(pg_temp.state('p:ali:stale'), 'dead stale', '(d) a required notice a day old is stale: not sent');
select ok((pg_temp.item(7, 'p:ali:old') ->> 'ttl')::integer between 14000 and 14400,
  '(d) twenty hours old: the push service holds it for the four hours left');

-- (e) Finishing, device by device ---------------------------------------------------------------------------

select is(pg_temp.finish('p:ali:1', jsonb_build_array(pg_temp.answer('ali-2', 'accepted'), pg_temp.answer('ali-3', 'retry', 'http_503'))),
  'failed', '(e) one device took it, one asked to wait: tried again later');
select ok((select d.next_attempt_at between now() + interval '55 seconds' and now() + interval '65 seconds' and d.last_error = 'http_503'
           from public.notification_deliveries d where d.id = pg_temp.delivery('p:ali:1')), '(e) in a minute');
select ok((select s.last_used_at > now() - interval '1 minute' from public.notification_push_subscriptions s where s.id = pg_temp.sub('ali-2')),
  '(e) the device that took it was used now');
update public.notification_deliveries set next_attempt_at = now() where id = pg_temp.delivery('p:ali:1');
select pg_temp.claim(8);
select is((select array_agg(t ->> 'endpoint') from jsonb_array_elements(pg_temp.item(8, 'p:ali:1') -> 'targets') t),
  array[pg_temp.endpoint('ali-3')], '(e) the next try goes only to the device that did not take it: never twice');
select is(pg_temp.finish('p:ali:1', jsonb_build_array(pg_temp.answer('ali-3', 'retry', 'http_429', 300))), 'failed',
  '(e) busy again, with a wait');
select ok((select d.next_attempt_at between now() + interval '295 seconds' and now() + interval '305 seconds'
           from public.notification_deliveries d where d.id = pg_temp.delivery('p:ali:1')), '(e) the push service''s wait is kept');
update public.notification_deliveries set next_attempt_at = now() where id = pg_temp.delivery('p:ali:1');
select pg_temp.claim(9);
select is(pg_temp.finish('p:ali:1', jsonb_build_array(pg_temp.answer('ali-3', 'gone', 'http_410'))), 'sent',
  '(e) the other device is gone: sent, one device took it');
select is((select s.revoked_reason from public.notification_push_subscriptions s where s.id = pg_temp.sub('ali-3')), 'gone',
  '(e) and the gone one is removed');
select is(pg_temp.finish('p:ali:1', jsonb_build_array(pg_temp.answer('ali-2', 'accepted'))), 'sent',
  '(e) a late answer changes nothing');

select is(pg_temp.finish('p:ali:required', jsonb_build_array(pg_temp.answer('ali-2', 'refused', 'http_403'),
    pg_temp.answer('ali-3', 'refused', 'http_400'))), 'dead',
  '(e) every device refused: dead');
select is(pg_temp.state('p:ali:required'), 'dead no_device_reached', '(e) no device reached');
select is((select d.reason from public.notification_deliveries d where d.id = pg_temp.delivery('p:ali:required', 'email')), 'required',
  '(f) a required notice already went by email: nothing more');

select pg_temp.device('bea', 'bea-2');
select is(pg_temp.finish('p:bea:1', jsonb_build_array(pg_temp.answer('ali-1', 'too_large', 'http_413'))), 'dead',
  '(e) too large for the push service: dead at once');
select is(pg_temp.state('p:bea:1'), 'dead payload_too_large', '(e) said so');

-- Somebody else's device in the answer is not taken.
select pg_temp.device('eve', 'eve-2');
select pg_temp.notice('time_off.decided', 'eve', 'p:eve:2');
select pg_temp.claim(10);
select is(pg_temp.finish('p:eve:2', jsonb_build_array(pg_temp.answer('ali-2', 'accepted'))), 'dead',
  '(e) an answer for another person''s device counts for nothing');

-- The fifth try is the last.
select pg_temp.notice('time_off.decided', 'bea', 'p:bea:five');
select pg_temp.claim(11);
update public.notification_deliveries set attempts = 5 where id = pg_temp.delivery('p:bea:five');
select is(pg_temp.finish('p:bea:five', jsonb_build_array(pg_temp.answer('ali-1', 'retry', 'timeout'), pg_temp.answer('bea-2', 'retry', 'network'))),
  'dead', '(e) the fifth try that still waits is dead');
select is(pg_temp.state('p:bea:five'), 'dead retries_exhausted', '(e) its tries are used up');

-- A lease that ran out on the fifth try is the last too.
select pg_temp.notice('time_off.decided', 'bea', 'p:bea:lease');
update public.notification_deliveries set status = 'sending', attempts = 5, lease_expires_at = now() - interval '1 second'
where id = pg_temp.delivery('p:bea:lease');
select is(pg_temp.claim(12), 0, '(e) its lease ran out five times: not tried again');
select is(pg_temp.state('p:bea:lease'), 'dead lease_exhausted', '(e) dead, the lease used up');

select is(array[
    pg_temp.refusal($$select pg_temp.finish('p:bea:1', '{}'::jsonb)$$),
    pg_temp.refusal($$select pg_temp.finish('p:bea:1', jsonb_build_array(pg_temp.answer('ali-1', 'sent')))$$),
    pg_temp.refusal($$select pg_temp.finish('p:bea:1', jsonb_build_array(pg_temp.answer('ali-1', 'retry', 'Rate limited!')))$$),
    pg_temp.refusal($$select pg_temp.finish('p:bea:1', jsonb_build_array(pg_temp.answer('ali-1', 'retry', 'http_429', -1)))$$)],
  array['22023 notifications.push_results', '22023 notifications.outcome', '22023 notifications.error_code',
        '22023 notifications.push_results'],
  '(e) answers are a list of known outcomes and short codes');

-- What the run had no time for goes back untried.
select pg_temp.notice('time_off.decided', 'bea', 'p:bea:back');
select pg_temp.claim(13);
select is(public.release_notification_push_service(array[pg_temp.delivery('p:bea:back')]), 1, '(e) given back');
select is((select d.status || ' ' || d.attempts from public.notification_deliveries d where d.id = pg_temp.delivery('p:bea:back')),
  'queued 0', '(e) the try it never made is not counted');

-- (f) Fallback ----------------------------------------------------------------------------------------------

-- An important announcement emails nobody by default; reaching no device, it does.
select pg_temp.device('eve', 'eve-3');
select pg_temp.notice('announcements.published', 'eve', 'p:eve:refused');
select pg_temp.claim(14);
select is(pg_temp.finish('p:eve:refused', jsonb_build_array(pg_temp.answer('eve-2', 'gone', 'http_404'),
    pg_temp.answer('eve-3', 'refused', 'http_403'))), 'dead', '(f) no device took it');
select is((select d.status || ' ' || d.reason from public.notification_deliveries d where d.id = pg_temp.delivery('p:eve:refused', 'email')),
  'queued push_fallback', '(f) so it goes by email');
-- Eve still has a device (it refused): the email is sent all the same, not skipped as "email is off by default".
select ok(pg_temp.delivery('p:eve:refused', 'email')::text in (
    select x ->> 'delivery_id' from jsonb_array_elements(public.claim_notification_emails_service(100)) x),
  '(f) and the email worker sends it, though a device is still there');
select is(pg_temp.state('p:eve:refused', 'email'), 'sending', '(f) it is being sent');
-- The person turned that email off: no fallback.
insert into public.notification_preferences (workspace_id, user_id, topic_key, channel, enabled)
select tests.id('np'), pg_temp.u('eve'), t.topic_key, 'email', false from public.notification_types t where t.key = 'announcements.published';
select pg_temp.device('eve', 'eve-4');
select pg_temp.notice('announcements.published', 'eve', 'p:eve:noemail');
select pg_temp.claim(15);
select pg_temp.finish('p:eve:noemail', jsonb_build_array(pg_temp.answer('eve-4', 'gone', 'http_410')));
select is(pg_temp.delivery('p:eve:noemail', 'email'), null, '(f) Eve turned that email off: none');
-- An optional one never falls back.
select pg_temp.device('eve', 'eve-5');
select pg_temp.notice('shift_changes.open_shift_available', 'eve', 'p:eve:optional');
select pg_temp.claim(16);
select pg_temp.finish('p:eve:optional', jsonb_build_array(pg_temp.answer('eve-5', 'gone', 'http_410')));
select is(pg_temp.delivery('p:eve:optional', 'email'), null, '(f) an optional notice never falls back to email');

-- (g) The lock screen ---------------------------------------------------------------------------------------

select pg_temp.device('bea', 'bea-3');
select pg_temp.notice('time_off.requested', 'bea', 'p:bea:reason', 'Nov 23 · Dentist appointment');
select pg_temp.notice('schedule.shift_changed', 'bea', 'p:bea:shift', 'Now 9:00 AM–3:00 PM.', subject => 'schedule_publication');
-- A closed day changes a shift too; its body is the announcement's own words.
select pg_temp.notice('schedule.shift_changed', 'bea', 'p:bea:closed', 'Thanksgiving: we close at noon', subject => 'announcement');
select pg_temp.claim(17);
select is(pg_temp.item(17, 'p:bea:reason') #>> '{payload,body}', (select w.name from public.workspaces w where w.id = tests.id('np')),
  '(g) a request''s reason never reaches the lock screen: only the workspace''s name');
select is(pg_temp.item(17, 'p:bea:shift') #>> '{payload,body}',
  (select w.name from public.workspaces w where w.id = tests.id('np')) || ' · Now 9:00 AM–3:00 PM.',
  '(g) a body the product writes itself is shown');
select is(pg_temp.item(17, 'p:bea:closed') #>> '{payload,body}', (select w.name from public.workspaces w where w.id = tests.id('np')),
  '(g) the same type from a closed day''s announcement: its words stay off the lock screen');
-- Time off rebuild D8: the old request's subject ('time_off_request') went with the old time off; the reminder is
-- about the new request ('time_off').
select is(
  array(select t.key || ' ' || x.subject from public.notification_types t
        cross join unnest(array['announcement', 'onboarding_case', 'schedule_publication', 'shift_exchange', 'time_off',
                                'document', 'employee', 'lineup', 'invitation', 'workspace']) x(subject)
        where app_private.push_shows_body(t.key, x.subject) order by 1),
  array['people.onboarding_completed onboarding_case', 'schedule.published schedule_publication',
        'schedule.shift_added schedule_publication', 'schedule.shift_changed schedule_publication',
        'schedule.shift_removed schedule_publication', 'time_off.decision_reminder time_off'],
  '(g) whose body may show: each of these producers writes it from dates, hours and counts');
select pg_temp.notice('schedule.shift_changed', 'bea', 'p:bea:long', repeat('x', 300), subject => 'schedule_publication');
update public.person_notifications set title = repeat('T', 200) where event_key = 'p:bea:long';
select pg_temp.claim(18);
select is(array[char_length(pg_temp.item(18, 'p:bea:long') #>> '{payload,title}'),
                char_length(pg_temp.item(18, 'p:bea:long') #>> '{payload,body}')
                  - char_length((select w.name from public.workspaces w where w.id = tests.id('np')) || ' · ')],
  array[120, 140], '(g) a title is cut at 120 characters and a body at 140');

-- Ten devices at most get an alert, even if two browsers saved at once and left eleven.
select pg_temp.device('dee', 'dee-' || n) from generate_series(2, 10) n;
update public.workspace_memberships set status = 'active' where workspace_id = tests.id('np') and user_id = pg_temp.u('dee');
insert into public.notification_push_subscriptions (user_id, endpoint, p256dh, auth_secret)
values (pg_temp.u('dee'), pg_temp.endpoint('dee-11'), 'B' || repeat('p', 86), repeat('a', 22));
select is(pg_temp.devices('dee'), 11, '(e) two saves at once left Dee eleven devices');
select pg_temp.notice('time_off.decided', 'dee', 'p:dee:eleven');
select pg_temp.claim(19);
select is(jsonb_array_length(pg_temp.item(19, 'p:dee:eleven') -> 'targets'), 10, '(e) the alert goes to ten of them, and finishing takes it');
select is(pg_temp.finish('p:dee:eleven', (select jsonb_agg(jsonb_build_object('subscription_id', t ->> 'subscription_id', 'outcome', 'accepted'))
                                          from jsonb_array_elements(pg_temp.item(19, 'p:dee:eleven') -> 'targets') t)), 'sent',
  '(e) sent');

-- (h) Only the worker ---------------------------------------------------------------------------------------

select is(
  array(select p.oid::regprocedure::text || ' ' || r.role || ' ' || has_function_privilege(r.role, p.oid, 'execute')::text
        from pg_proc p cross join unnest(array['anon', 'authenticated', 'service_role']) r(role)
        where p.pronamespace = 'public'::regnamespace
          and p.proname in ('claim_notification_push_service', 'finish_notification_push_service', 'release_notification_push_service',
            'save_notification_push_subscription_service', 'delete_notification_push_subscription_service')
        order by 1),
  array['claim_notification_push_service(integer) anon false',
        'claim_notification_push_service(integer) authenticated false',
        'claim_notification_push_service(integer) service_role true',
        'delete_notification_push_subscription_service(uuid,text) anon false',
        'delete_notification_push_subscription_service(uuid,text) authenticated false',
        'delete_notification_push_subscription_service(uuid,text) service_role true',
        'finish_notification_push_service(uuid,jsonb) anon false',
        'finish_notification_push_service(uuid,jsonb) authenticated false',
        'finish_notification_push_service(uuid,jsonb) service_role true',
        'release_notification_push_service(uuid[]) anon false',
        'release_notification_push_service(uuid[]) authenticated false',
        'release_notification_push_service(uuid[]) service_role true',
        'save_notification_push_subscription_service(uuid,text,text,text,text) anon false',
        'save_notification_push_subscription_service(uuid,text,text,text,text) authenticated false',
        'save_notification_push_subscription_service(uuid,text,text,text,text) service_role true'],
  '(h) only the API''s server may call these');
select is(array(select c.relname::text from pg_class c
                where c.relnamespace = 'public'::regnamespace and c.relname in ('notification_push_sends', 'notification_push_subscriptions')
                  and c.relrowsecurity
                  and not has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
                  and not has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
                order by 1),
  array['notification_push_sends', 'notification_push_subscriptions'],
  '(h) the devices and the sent record: row level security on, nothing granted to the browser');
select is((select schedule from cron.job where jobname = 'notification-dispatch'), '5 seconds',
  '(h) the dispatcher of every channel looks every 5 seconds (BILDIRIM-DAGITICI)');
select ok((select command ~ 'dispatch_cron_endpoint\(''/api/internal/cron/notification-dispatch''\)' and command ~ 'exists \('
           from cron.job where jobname = 'notification-dispatch'),
  '(h) and calls it only when a delivery is due');

-- Opening the channel skips waiting push only, never a sent one or another channel's.
select pg_temp.device('ali', 'ali-4');
select pg_temp.notice('time_off.decided', 'ali', 'p:ali:open');
select app_private.push_channel_open();
select is(array[pg_temp.state('p:ali:open'), pg_temp.state('p:ali:1')], array['skipped before_launch', 'sent'],
  '(d) the channel opens: waiting push is skipped, sent push stays sent');
select is((select opened_at from app_private.notification_push_channel), now(), '(d) and the channel opens now');

select * from finish();
rollback;
