begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- BILDIRIM-14 (KARARLAR S-130, S-123, S-126 (5); plan slice 7): the email channel. The API's cron worker
-- claims due email deliveries, sends each through Resend and says how it went; Resend's webhook says what
-- happened after.
--   (a) the claim: required first, then oldest; a claimed row is leased and not claimed again until its
--       lease runs out; it carries the address, the notice and a stable idempotency key;
--   (b) the claim asks again: the person turned that topic's email off, the owner turned the type off, the
--       address is suppressed, the person is no longer a member: the row is skipped, never sent. "Your access
--       ended" still goes to a former member; an account notice has no workspace;
--   (c) launch (S-130 (4)): a delivery queued before the channel opened is skipped, never sent; a notice
--       older than 24 hours is stale, whatever its level;
--   (d) the daily cap of the free plan holds back important and optional mail, never required;
--   (e) finishing: sent keeps Resend's id; a retry waits 1, 2, 4, 8 minutes; after five tries, or on a
--       refusal, it is dead; a row not tried is given back;
--   (f) Resend's word: delivered, a permanent bounce or a complaint suppresses the address, a temporary
--       bounce changes nothing, the same event twice changes nothing more, an unknown email is ignored;
--   (g) only the worker may call these, and the cron calls it every minute;
--   (h) review (BILDIRIM-14 ONAY @6457b4db): the cap leaves 30 of Resend's free 100 to invitations, resets
--       and exports; a row whose lease ran out five times is dead; a link with a control character is
--       refused; one rule says who still receives a notice; the run gives back what it did not try in one
--       call; a failure never undoes a delivered email; opening the channel skips only queued email.

select tests.world('ne');
select tests.person('ne', 'ali', 'employee', array['K'], array['cook']);
select tests.person('ne', 'bea', 'employee', array['K'], array['cook']);
select tests.person('ne', 'can', 'employee', array['K'], array['cook']);
select tests.person('ne', 'dee', 'employee', array['K'], array['cook']);
-- Eve's address is never suppressed: the review fixes in (h) use her.
select tests.person('ne', 'eve', 'employee', array['K'], array['cook']);

create function pg_temp.u(person text) returns uuid language sql as $$
  select tests.user('ne:' || person)
$$;
create function pg_temp.address(person text) returns text language sql stable as $$
  select lower(u.email) from auth.users u where u.id = pg_temp.u(person)
$$;
-- A notice of this type to the person, and its email delivery.
create function pg_temp.notice(kind text, person text, key text, w uuid default tests.id('ne')) returns uuid language plpgsql as $$
begin
  perform app_private.notify(kind, w, array[pg_temp.u(person)], key, 'Title ' || key, 'Body ' || key, '/app', null);
  return (select d.id from public.notification_deliveries d join public.person_notifications n on n.id = d.notification_id
          where n.user_id = pg_temp.u(person) and n.event_key = key and d.channel = 'email');
end $$;
create temp table claim_log (run integer, item jsonb);
create function pg_temp.claim(run integer, size integer default 50) returns integer language plpgsql as $$
declare got jsonb := public.claim_notification_emails_service(size);
begin
  insert into claim_log select run, x from jsonb_array_elements(got) x;
  return jsonb_array_length(got);
end $$;
create function pg_temp.claimed(run integer) returns text[] language sql stable as $$
  select coalesce(array_agg(n.event_key order by c.ord), '{}')
  from (select (item ->> 'delivery_id')::uuid id, row_number() over () ord from claim_log where claim_log.run = claimed.run) c
  join public.notification_deliveries d on d.id = c.id join public.person_notifications n on n.id = d.notification_id
$$;
create function pg_temp.state(key text) returns text language sql stable as $$
  select d.status || coalesce(' ' || d.last_error, '') from public.notification_deliveries d
  join public.person_notifications n on n.id = d.notification_id where n.event_key = key and d.channel = 'email'
$$;
create function pg_temp.delivery(key text) returns uuid language sql stable as $$
  select d.id from public.notification_deliveries d join public.person_notifications n on n.id = d.notification_id
  where n.event_key = key and d.channel = 'email'
$$;

-- (a) The claim ---------------------------------------------------------------------------------------------

select is((select daily_cap from app_private.notification_email_channel), 70,
  '(h) the free plan''s cap for notices is 70 a day: 30 of Resend''s 100 stay for invitations, resets and exports');
-- The channel opened an hour ago (in the product, when this migration was applied).
update app_private.notification_email_channel set opened_at = now() - interval '1 hour';
-- The queue is the whole database's: email waiting from other work on a shared database is set aside, and
-- what it sent today leaves today's count, so the claims and the cap below see only this test's rows.
update public.notification_deliveries set status = 'skipped', last_error = 'test_isolation', lease_expires_at = null
where channel = 'email' and status in ('queued', 'sending', 'failed');
update public.notification_deliveries set sent_at = sent_at - interval '2 days'
where channel = 'email' and sent_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';

select pg_temp.notice('time_off.decided', 'ali', 'e:ali:1');
select pg_temp.notice('time_off.decided', 'bea', 'e:bea:1');
select pg_temp.notice('people.role_changed', 'can', 'e:can:1');
-- Oldest first among the same level: Ali's is made the older.
update public.notification_deliveries set created_at = now() - interval '2 minutes' where id = pg_temp.delivery('e:ali:1');
select is(pg_temp.claim(1), 3, '(a) three are due');
select is(pg_temp.claimed(1), array['e:can:1', 'e:ali:1', 'e:bea:1'], '(a) required first, then oldest');
select is((select item - 'delivery_id' from claim_log where run = 1 and item ->> 'delivery_id' = pg_temp.delivery('e:ali:1')::text),
  jsonb_build_object('to', pg_temp.address('ali'), 'subject', 'Title e:ali:1', 'title', 'Title e:ali:1', 'body', 'Body e:ali:1',
    'url', '/app', 'workspace_name', (select w.name from public.workspaces w where w.id = tests.id('ne')), 'level', 'important',
    'topic', 'Time off', 'idempotency_key', 'notification-delivery/' || pg_temp.delivery('e:ali:1')::text),
  '(a) it carries the address, the notice, its workspace and a stable idempotency key');
select is(pg_temp.state('e:ali:1'), 'sending', '(a) a claimed row is being sent');
select ok((select d.lease_expires_at > now() and d.attempts = 1 from public.notification_deliveries d where d.id = pg_temp.delivery('e:ali:1')),
  '(a) under a lease, as its first try');
select is(pg_temp.claim(2), 0, '(a) a leased row is not claimed again');
update public.notification_deliveries set lease_expires_at = now() - interval '1 second' where id = pg_temp.delivery('e:bea:1');
select is(pg_temp.claim(3), 1, '(a) its lease ran out: claimed again');
select is((select (item ->> 'idempotency_key') from claim_log where run = 3),
  'notification-delivery/' || pg_temp.delivery('e:bea:1')::text, '(a) with the same key, so Resend never sends it twice');
select is((select d.attempts from public.notification_deliveries d where d.id = pg_temp.delivery('e:bea:1')), smallint '2',
  '(a) as its second try');

-- (b) The claim asks again ----------------------------------------------------------------------------------

select pg_temp.notice('time_off.decided', 'ali', 'e:ali:off');
insert into public.notification_preferences (workspace_id, user_id, topic_key, channel, enabled)
values (tests.id('ne'), pg_temp.u('ali'), 'time_off', 'email', false);
select pg_temp.notice('people.joined', 'bea', 'e:bea:optional');
select is(pg_temp.delivery('e:bea:optional'), null, '(b) an optional type has no email unless the person asked for it');
insert into public.notification_preferences (workspace_id, user_id, topic_key, channel, enabled)
values (tests.id('ne'), pg_temp.u('bea'), 'team', 'email', true);
select pg_temp.notice('people.joined', 'bea', 'e:bea:joined');
insert into public.notification_workspace_muted_types (workspace_id, type_key, level) values (tests.id('ne'), 'people.joined', 'optional');
select pg_temp.notice('time_off.decided', 'can', 'e:can:suppressed');
insert into public.notification_email_suppressions (email, reason) values (pg_temp.address('can'), 'manual');
select pg_temp.notice('time_off.decided', 'dee', 'e:dee:gone');
select pg_temp.notice('people.access_ended', 'dee', 'e:dee:ended');
update public.workspace_memberships set status = 'removed' where workspace_id = tests.id('ne') and user_id = pg_temp.u('dee');
select pg_temp.notice('account.password_changed', 'bea', 'e:bea:account', null);
select pg_temp.claim(4);
select is(array[pg_temp.state('e:ali:off'), pg_temp.state('e:bea:joined'), pg_temp.state('e:can:suppressed'), pg_temp.state('e:dee:gone')],
  array['skipped person_off', 'skipped owner_off', 'skipped suppressed', 'skipped not_member'],
  '(b) email turned off, type turned off, address suppressed, no longer a member: skipped, never sent');
select is(array(select x from unnest(pg_temp.claimed(4)) x order by 1), array['e:bea:account', 'e:dee:ended'],
  '(b) "your access ended" still goes to Dee, who is gone; Bea''s account notice goes too');
select is((select item -> 'workspace_name' from claim_log where run = 4 and item ->> 'delivery_id' = pg_temp.delivery('e:bea:account')::text),
  'null'::jsonb, '(b) an account notice names no workspace');

-- (c) Launch and freshness ----------------------------------------------------------------------------------

delete from public.notification_preferences where user_id = pg_temp.u('ali');
select pg_temp.notice('time_off.decided', 'ali', 'e:ali:early');
update public.notification_deliveries set created_at = (select opened_at from app_private.notification_email_channel) - interval '1 minute'
where id = pg_temp.delivery('e:ali:early');
select pg_temp.notice('people.role_changed', 'bea', 'e:bea:stale');
update public.person_notifications set created_at = now() - interval '25 hours' where event_key = 'e:bea:stale';
select is(pg_temp.claim(5), 0, '(c) nothing to send');
select is(pg_temp.state('e:ali:early'), 'skipped before_launch', '(c) queued before the channel opened: skipped, never sent');
select is(pg_temp.state('e:bea:stale'), 'dead stale', '(c) a required notice a day old is stale: not sent');

-- (d) The daily cap -----------------------------------------------------------------------------------------

update app_private.notification_email_channel set daily_cap = 1;
-- One sent today already (Can's role change, finished below).
select public.finish_notification_email_service(pg_temp.delivery('e:can:1'), 'sent', 're_can_1', null);
delete from public.notification_email_suppressions where email = pg_temp.address('can');
select pg_temp.notice('time_off.decided', 'can', 'e:can:capped');
select pg_temp.notice('people.role_changed', 'ali', 'e:ali:required');
select pg_temp.claim(6);
select is(pg_temp.claimed(6), array['e:ali:required'], '(d) at the cap, required mail still goes');
select ok((select d.status = 'queued' and d.next_attempt_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' + interval '1 day'
           from public.notification_deliveries d where d.id = pg_temp.delivery('e:can:capped')),
  '(d) an important one waits for tomorrow');
update app_private.notification_email_channel set daily_cap = null;

-- (e) Finishing ---------------------------------------------------------------------------------------------

select is(public.finish_notification_email_service(pg_temp.delivery('e:ali:1'), 'sent', 're_ali_1', null), 'sent', '(e) sent');
select is((select d.provider_message_id || ' ' || (d.sent_at is not null)::text || ' ' || (d.lease_expires_at is null)::text
           from public.notification_deliveries d where d.id = pg_temp.delivery('e:ali:1')), 're_ali_1 true true', '(e) with Resend''s id');
select is(public.finish_notification_email_service(pg_temp.delivery('e:ali:1'), 'retry', null, 'http_500'), 'sent',
  '(e) a row no longer being sent does not change');
select is(public.finish_notification_email_service(pg_temp.delivery('e:bea:1'), 'retry', null, 'http_429'), 'failed', '(e) a retry');
select ok((select d.next_attempt_at between now() + interval '119 seconds' and now() + interval '121 seconds' and d.last_error = 'http_429'
           from public.notification_deliveries d where d.id = pg_temp.delivery('e:bea:1')), '(e) after its second try it waits 2 minutes');
-- One row tried again and again: how long it waits after each try, and the fifth is its last.
select pg_temp.notice('time_off.decided', 'bea', 'e:bea:wait');
create temp table waits (tries integer, outcome text, wait_minutes integer);
do $$
declare tries integer; outcome text;
begin
  for tries in 1..5 loop
    update public.notification_deliveries set status = 'sending', attempts = tries, lease_expires_at = now() + interval '2 minutes'
    where id = pg_temp.delivery('e:bea:wait');
    outcome := public.finish_notification_email_service(pg_temp.delivery('e:bea:wait'), 'retry', null, 'timeout');
    insert into waits select tries, outcome, round(extract(epoch from d.next_attempt_at - now()) / 60)::integer
    from public.notification_deliveries d where d.id = pg_temp.delivery('e:bea:wait');
  end loop;
end $$;
select is(array(select tries || ' ' || outcome || case when outcome = 'failed' then ' ' || wait_minutes else '' end from waits order by tries),
  array['1 failed 1', '2 failed 2', '3 failed 4', '4 failed 8', '5 dead'], '(e) it waits 1, 2, 4, 8 minutes; the fifth try is its last');
select is(public.finish_notification_email_service(pg_temp.delivery('e:dee:ended'), 'dead', null, 'http_422'), 'dead',
  '(e) a refusal is dead at once');
select pg_temp.notice('time_off.decided', 'bea', 'e:bea:given');
select pg_temp.claim(7);
select is(public.release_notification_emails_service(array[pg_temp.delivery('e:bea:given')]), 1,
  '(e) a row the run had no time for is given back');
select is(pg_temp.state('e:bea:given'), 'queued', '(e) it waits again');
select is((select d.attempts from public.notification_deliveries d where d.id = pg_temp.delivery('e:bea:given')), smallint '0',
  '(e) and the try it never made is not counted');
select throws_ok($$select public.finish_notification_email_service(gen_random_uuid(), 'maybe', null, null)$$, '22023', null,
  '(e) an outcome it does not know is refused');
select throws_ok($$select public.finish_notification_email_service(gen_random_uuid(), 'retry', null, 'Resend said: ali@x.test')$$, '22023', null,
  '(e) an error is a short code, never Resend''s words');

-- (f) Resend's word -----------------------------------------------------------------------------------------

select is(public.apply_notification_email_event_service('email.delivered', 're_ali_1', pg_temp.address('ali'), null), 'delivered',
  '(f) delivered');
select is(public.apply_notification_email_event_service('email.delivered', 're_ali_1', pg_temp.address('ali'), null), 'delivered',
  '(f) the same event twice changes nothing more');
select public.finish_notification_email_service(pg_temp.delivery('e:bea:account'), 'sent', 're_bea_account', null);
select is(public.apply_notification_email_event_service('email.bounced', 're_bea_account', pg_temp.address('bea'), 'Transient'), 'ignored',
  '(f) a temporary bounce changes nothing');
select is(pg_temp.state('e:bea:account'), 'sent', '(f) still sent');
select is(public.apply_notification_email_event_service('email.bounced', 're_bea_account', upper(pg_temp.address('bea')), 'Permanent'),
  'bounced', '(f) a permanent bounce');
select is((select reason from public.notification_email_suppressions where email = pg_temp.address('bea') and cleared_at is null), 'bounce',
  '(f) suppresses the address');
select pg_temp.notice('time_off.decided', 'bea', 'e:bea:after');
select is(pg_temp.delivery('e:bea:after'), null, '(f) and her next notice queues no email');
select is(public.apply_notification_email_event_service('email.complained', 're_can_1', pg_temp.address('can'), null), 'complained',
  '(f) a complaint');
select is((select reason from public.notification_email_suppressions where email = pg_temp.address('can')), 'complaint',
  '(f) suppresses the address');
select is(public.apply_notification_email_event_service('email.delivered', 're_unknown', 'nobody@world.test', null), 'ignored',
  '(f) an email we never sent is ignored');
select is(public.apply_notification_email_event_service('email.bounced', 're_ali_1', pg_temp.address('ali'), 'Permanent'), 'bounced',
  '(f) a delivered email that bounces later is bounced');

-- (h) Review fixes -------------------------------------------------------------------------------------------

-- A row whose lease ran out on its fifth try is not tried a sixth time.
select pg_temp.notice('time_off.decided', 'eve', 'e:can:lease');
update public.notification_deliveries set status = 'sending', attempts = 5, lease_expires_at = now() - interval '1 second'
where id = pg_temp.delivery('e:can:lease');
select pg_temp.claim(8);
select is(pg_temp.state('e:can:lease'), 'dead lease_exhausted', '(h) a lease that ran out on the fifth try is the last');
-- A link with a control character is refused by the table and by the core.
select throws_ok(format($$update public.person_notifications set url = %L where event_key = 'e:can:lease'$$, E'/app
x'), '23514', null,
  '(h) the table refuses a link with a line break');
select throws_ok(format($$select app_private.notify('time_off.decided', %L::uuid, array[%L::uuid], 'e:bad:url', 'T', null, %L)$$,
  tests.id('ne'), pg_temp.u('eve'), E'/app	x'), '22023', null, '(h) and so does the core, with its own refusal');
-- One rule says who still receives a notice.
select is(array[app_private.membership_receives(tests.id('ne'), pg_temp.u('ali'), false),
                app_private.membership_receives(tests.id('ne'), pg_temp.u('dee'), false),
                app_private.membership_receives(tests.id('ne'), pg_temp.u('dee'), true),
                app_private.membership_receives(null, pg_temp.u('dee'), false),
                app_private.membership_receives(tests.id('ne'), gen_random_uuid(), true)],
  array[true, false, true, true, false],
  '(h) a member receives; a removed one only what goes to former members; an account notice always; a stranger never');
-- What the run had no time for goes back in one call, untried.
select pg_temp.notice('time_off.decided', 'eve', 'e:can:back1');
select pg_temp.notice('time_off.decided', 'eve', 'e:can:back2');
select pg_temp.claim(9);
select is(public.release_notification_emails_service(array[pg_temp.delivery('e:can:back1'), pg_temp.delivery('e:can:back2'), gen_random_uuid()]), 2,
  '(h) two given back at once; an unknown one is not counted');
select is(array[pg_temp.state('e:can:back1'), pg_temp.state('e:can:back2')], array['queued', 'queued'], '(h) both wait again');
select is((select sum(d.attempts)::integer from public.notification_deliveries d
           where d.id in (pg_temp.delivery('e:can:back1'), pg_temp.delivery('e:can:back2'))), 0, '(h) with no try counted');
-- A failure reported after delivery never undoes it.
select public.finish_notification_email_service(pg_temp.delivery('e:bea:1'), 'retry', null, 'timeout');
update public.notification_deliveries set status = 'delivered', provider_message_id = 're_bea_1' where id = pg_temp.delivery('e:bea:1');
select is(public.apply_notification_email_event_service('email.failed', 're_bea_1', pg_temp.address('bea'), null), 'delivered',
  '(h) email.failed after delivered changes nothing');
-- Opening the channel skips only email still waiting: not a sent one, not a push.
select pg_temp.notice('people.role_changed', 'eve', 'e:open:queued');
select pg_temp.notice('people.role_changed', 'eve', 'e:open:sending');
select pg_temp.notice('people.role_changed', 'eve', 'e:open:failed');
select pg_temp.notice('people.role_changed', 'eve', 'e:open:sent');
update public.notification_deliveries set status = 'sending', lease_expires_at = now() + interval '2 minutes' where id = pg_temp.delivery('e:open:sending');
update public.notification_deliveries set status = 'failed' where id = pg_temp.delivery('e:open:failed');
update public.notification_deliveries set status = 'sent', sent_at = now() where id = pg_temp.delivery('e:open:sent');
insert into public.notification_deliveries (notification_id, channel, reason)
select n.id, 'push', 'required' from public.person_notifications n where n.event_key = 'e:open:queued';
select app_private.email_channel_open();
select is(array[pg_temp.state('e:open:queued'), pg_temp.state('e:open:sending'), pg_temp.state('e:open:failed'), pg_temp.state('e:open:sent')],
  array['skipped before_launch', 'skipped before_launch', 'skipped before_launch', 'sent'],
  '(h) opening the channel skips the email still queued, being sent or waiting to retry; a sent one stays');
select is((select d.status from public.notification_deliveries d join public.person_notifications n on n.id = d.notification_id
           where n.event_key = 'e:open:queued' and d.channel = 'push'), 'queued', '(h) a push is not email: it stays');
select is((select opened_at from app_private.notification_email_channel), now(), '(h) and the channel opens now');

-- (g) Only the worker ---------------------------------------------------------------------------------------

select is(
  array(select p.oid::regprocedure::text || ' ' || r.role || ' ' || has_function_privilege(r.role, p.oid, 'execute')::text
        from pg_proc p cross join unnest(array['anon', 'authenticated', 'service_role']) r(role)
        where p.pronamespace = 'public'::regnamespace
          and p.proname in ('claim_notification_emails_service', 'finish_notification_email_service', 'apply_notification_email_event_service',
            'release_notification_emails_service')
        order by 1),
  array['apply_notification_email_event_service(text,text,text,text) anon false',
        'apply_notification_email_event_service(text,text,text,text) authenticated false',
        'apply_notification_email_event_service(text,text,text,text) service_role true',
        'claim_notification_emails_service(integer) anon false',
        'claim_notification_emails_service(integer) authenticated false',
        'claim_notification_emails_service(integer) service_role true',
        'finish_notification_email_service(uuid,text,text,text) anon false',
        'finish_notification_email_service(uuid,text,text,text) authenticated false',
        'finish_notification_email_service(uuid,text,text,text) service_role true',
        'release_notification_emails_service(uuid[]) anon false',
        'release_notification_emails_service(uuid[]) authenticated false',
        'release_notification_emails_service(uuid[]) service_role true'],
  '(g) only the worker may claim, finish or apply');
select is((select schedule || ' ' || command from cron.job where jobname = 'notification-email'),
  '* * * * * select app_private.dispatch_cron_endpoint(''/api/internal/cron/notification-email'');', '(g) the cron calls it every minute');

select * from finish();
rollback;
