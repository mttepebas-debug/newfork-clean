begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- BILDIRIM-DAGITICI (Mert 2026-10-17, plan page "Bildirim teslim planı"): one dispatcher for every channel.
--   (a) fair claims: required first, then each workspace's oldest in turn, then age; one batch at most;
--   (b) the quota keeper: a channel's notices get its plan's limit minus what is kept back; with no room,
--       non-required rows wait for the next day or month, required ones still go; a channel without a quota
--       has no limit;
--   (c) one run at a time: the lease is taken once, freed only by its own run, and taken again once it ran out;
--   (d) alerts: a quota at 80% and full, by day and month, and a delivery due for over 2 minutes, handed over
--       until the API says it told them, then once
--       per period; full silences 80% in the same period;
--   (e) only the dispatcher may call these; one cron job every 5 seconds, only while something is due and the
--       lease is free, reading the partial indexes; a heartbeat every 5 minutes; the per-channel jobs are gone;
--       pg_cron's history is trimmed daily.

select tests.world('da');
select tests.world('db');
select tests.person('da', 'ana', 'employee', array['K'], array['cook']);
select tests.person('db', 'bob', 'employee', array['K'], array['cook']);

create function pg_temp.u(who text) returns uuid language sql as $$ select tests.user(who) $$;
-- A notice of this type to the person, and its email delivery.
create function pg_temp.notice(kind text, who text, key text) returns uuid language plpgsql as $$
begin
  perform app_private.notify(kind, tests.id(split_part(who, ':', 1)), array[pg_temp.u(who)], key, 'Title ' || key,
    'Body ' || key, '/app', null);
  return (select d.id from public.notification_deliveries d join public.person_notifications n on n.id = d.notification_id
          where n.user_id = pg_temp.u(who) and n.event_key = key and d.channel = 'email');
end $$;
create function pg_temp.key(delivery uuid) returns text language sql stable as $$
  select n.event_key from public.notification_deliveries d join public.person_notifications n on n.id = d.notification_id
  where d.id = delivery
$$;
create function pg_temp.keys(ids uuid[]) returns text[] language sql stable as $$
  select coalesce(array_agg(pg_temp.key(x.id) order by x.ord), '{}') from unnest(ids) with ordinality x(id, ord)
$$;
create function pg_temp.claimed(got jsonb) returns text[] language sql stable as $$
  select coalesce(array_agg(pg_temp.key((x.item ->> 'delivery_id')::uuid) order by x.ord), '{}')
  from jsonb_array_elements(got) with ordinality x(item, ord)
$$;

-- The queue is the whole database's: what waits from other work on a shared database is set aside, and what it
-- sent this month leaves this month's count, so the claims, the quota and the alerts see only this test's rows.
update app_private.notification_email_channel set opened_at = now() - interval '1 hour';
update public.notification_deliveries set status = 'skipped', last_error = 'test_isolation', lease_expires_at = null
where status in ('queued', 'sending', 'failed');
update public.notification_deliveries set sent_at = sent_at - interval '2 months' where sent_at >= now() - interval '1 month';
update app_private.notification_quotas set daily_limit = null, monthly_limit = null where channel = 'email';
delete from app_private.notification_alerts;

-- (a) Fair claims -------------------------------------------------------------------------------------------

select pg_temp.notice('time_off.decided', 'da:ana', 'a1');
select pg_temp.notice('time_off.decided', 'da:ana', 'a2');
select pg_temp.notice('time_off.decided', 'da:ana', 'a3');
select pg_temp.notice('time_off.decided', 'db:bob', 'b1');
select pg_temp.notice('people.role_changed', 'da:ana', 'a-required');
-- Queued in this order, a moment apart.
update public.notification_deliveries d set created_at = now() - make_interval(secs => 60 - x.ord)
from (select n.event_key, row_number() over (order by n.event_key = 'a-required', n.event_key) ord
      from public.person_notifications n where n.event_key in ('a1', 'a2', 'a3', 'b1', 'a-required')) x,
     public.person_notifications n
where n.id = d.notification_id and n.event_key = x.event_key and d.channel = 'email';

select is(pg_temp.keys(app_private.fair_due('email', 10)), array['a-required', 'a1', 'b1', 'a2', 'a3'],
  '(a) required first, then each workspace''s oldest in turn: one workspace''s three notices do not hold back the other''s');
select is(pg_temp.keys(app_private.fair_due('email', 3)), array['a-required', 'a1', 'b1'], '(a) one batch at most');
select is(pg_temp.keys(app_private.fair_due('push', 10)), '{}'::text[], '(a) a channel''s list has only its own rows');
select is(pg_temp.claimed(public.claim_notification_emails_service(3)), array['a-required', 'a1', 'b1'],
  '(a) the email claim takes them in that order');
select is(pg_temp.keys(app_private.fair_due('email', 10)), array['a2', 'a3'], '(a) what is claimed is no longer due');
select ok((select bool_and(p.prosrc ~ 'fair_due\(' and p.prosrc ~ 'channel_room\(') from pg_proc p
           where p.proname in ('claim_notification_emails_service', 'claim_notification_push_service')),
  '(a) both channels'' claims take the fair list and ask the quota keeper');

-- (b) The quota keeper --------------------------------------------------------------------------------------

select is((select q.room::text || ' ' || coalesce(q.opens_at::text, '-') from app_private.channel_room('push') q), null,
  '(b) push has no provider quota: no limit');
select public.finish_notification_email_service(d.id, 'sent', 're_' || pg_temp.key(d.id), null)
from public.notification_deliveries d where d.channel = 'email' and d.status = 'sending'
  and pg_temp.key(d.id) in ('a-required', 'a1', 'b1');
-- 33 a day with 30 kept back: room for 3 notices, 3 sent today.
update app_private.notification_quotas set daily_limit = 33 where channel = 'email';
select is((select q.room || ' ' || (q.opens_at = date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' + interval '1 day')::text
           from app_private.channel_room('email') q), '0 true', '(b) the day is full: room comes back tomorrow');
select pg_temp.notice('people.role_changed', 'db:bob', 'b-required');
select is(pg_temp.claimed(public.claim_notification_emails_service(10)), array['b-required'],
  '(b) with no room, required mail still goes');
select ok((select bool_and(d.status = 'queued'
                           and d.next_attempt_at = date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' + interval '1 day')
           from public.notification_deliveries d where d.channel = 'email' and pg_temp.key(d.id) in ('a2', 'a3')),
  '(b) the others wait for tomorrow');
-- The month: room for exactly what went this month (the required one included), so none is left.
update app_private.notification_quotas set daily_limit = null, monthly_limit = 900 + 4 where channel = 'email';
select public.finish_notification_email_service(x.delivery, 'sent', 're_b_required', null)
from (select d.id delivery from public.notification_deliveries d where d.channel = 'email' and pg_temp.key(d.id) = 'b-required') x;
select is((select q.room || ' ' || (q.opens_at = date_trunc('month', now() at time zone 'UTC') at time zone 'UTC' + interval '1 month')::text
           from app_private.channel_room('email') q), '0 true', '(b) the month is full: room comes back next month');
update app_private.notification_quotas set monthly_limit = 900 + 6 where channel = 'email';
select is((select q.room from app_private.channel_room('email') q), 2, '(b) the plan''s limit minus what is kept back and what went');

-- (c) One run at a time -------------------------------------------------------------------------------------

create temp table runs (name text primary key, id uuid);
insert into runs values ('first', public.begin_notification_dispatch_service(15));
select ok((select id is not null from runs where name = 'first'), '(c) a free lease is taken');
select is(public.begin_notification_dispatch_service(15), null, '(c) while it is held, no other run starts');
select public.end_notification_dispatch_service(gen_random_uuid());
select is(public.begin_notification_dispatch_service(15), null, '(c) another run''s end does not free it');
select public.end_notification_dispatch_service((select id from runs where name = 'first'));
insert into runs values ('second', public.begin_notification_dispatch_service(15));
select ok((select id is not null and id <> (select id from runs where name = 'first') from runs where name = 'second'),
  '(c) its own run frees it, and the next run takes it');
update app_private.notification_dispatch set held_until = now() - interval '1 second';
select ok(public.begin_notification_dispatch_service(15) is not null, '(c) a lease that ran out is taken again');
select public.end_notification_dispatch_service((select id from runs where name = 'second'));
select ok((select held_until > now() from app_private.notification_dispatch),
  '(c) a run whose lease ran out never frees the next run''s');
select throws_ok('select public.begin_notification_dispatch_service(0)', '22023', null, '(c) a lease is 1 to 60 seconds');
select throws_ok('select public.begin_notification_dispatch_service(61)', '22023', null, '(c) not more');

-- (d) Alerts ------------------------------------------------------------------------------------------------

-- 35 a day with 30 kept back: 5 for notices, 4 went today (80%).
update public.notification_deliveries set sent_at = now() - interval '2 months' where channel = 'email' and pg_temp.key(id) = 'b-required';
update app_private.notification_quotas set daily_limit = 35, monthly_limit = null where channel = 'email';
update public.notification_deliveries set status = 'sent', sent_at = now(), next_attempt_at = now()
where channel = 'email' and pg_temp.key(id) in ('a2');
select is((select jsonb_agg(x - 'period') from jsonb_array_elements(public.notification_dispatch_alerts_service()) x),
  '[{"kind": "quota_day_80", "channel": "email", "sent": 4, "limit": 5}]'::jsonb, '(d) 80% of the day''s room: handed over');
select is((select jsonb_agg(x ->> 'kind') from jsonb_array_elements(public.notification_dispatch_alerts_service()) x),
  '["quota_day_80"]'::jsonb, '(d) until the API says it told Mert: a send that failed comes back');
select is(public.raise_notification_alerts_service(public.notification_dispatch_alerts_service()), 1, '(d) told');
select is(public.notification_dispatch_alerts_service(), '[]'::jsonb, '(d) then once a day');
select is(public.raise_notification_alerts_service('[{"kind": "quota_day_80", "channel": "email", "period": "2026-10-17"}]'
  ::jsonb || jsonb_build_array(jsonb_build_object('kind', 'quota_day_80', 'channel', 'email',
  'period', to_char(now() at time zone 'UTC', 'YYYY-MM-DD')))), 1, '(d) telling it twice changes nothing');
update public.notification_deliveries set status = 'sent', sent_at = now() where channel = 'email' and pg_temp.key(id) = 'a3';
select is((select jsonb_agg(x ->> 'kind') from jsonb_array_elements(public.notification_dispatch_alerts_service()) x),
  '["quota_day_full"]'::jsonb, '(d) full: handed over once more');
select public.raise_notification_alerts_service(public.notification_dispatch_alerts_service());
select is(public.notification_dispatch_alerts_service(), '[]'::jsonb, '(d) and once');
delete from app_private.notification_alerts;
select is((select jsonb_agg(x ->> 'kind') from jsonb_array_elements(public.notification_dispatch_alerts_service()) x),
  '["quota_day_full"]'::jsonb, '(d) full first: no 80% with it in the same day');
update app_private.notification_quotas set daily_limit = null where channel = 'email';
-- A delivery due for three minutes.
select pg_temp.notice('time_off.decided', 'db:bob', 'b-late');
update public.notification_deliveries set next_attempt_at = now() - interval '3 minutes'
where channel = 'email' and pg_temp.key(id) = 'b-late';
select is((select jsonb_agg(x - 'period') from jsonb_array_elements(public.notification_dispatch_alerts_service()) x),
  '[{"kind": "late", "channel": "email", "due": 1, "waiting_seconds": 180}]'::jsonb,
  '(d) a delivery due for over 2 minutes: handed over, with how long and how many');
select public.raise_notification_alerts_service(public.notification_dispatch_alerts_service());
select is(public.notification_dispatch_alerts_service(), '[]'::jsonb, '(d) once per half hour');
update public.notification_deliveries set next_attempt_at = now() - interval '1 minute'
where channel = 'email' and pg_temp.key(id) = 'b-late';
delete from app_private.notification_alerts;
select is(public.notification_dispatch_alerts_service(), '[]'::jsonb, '(d) a minute is not late');
select throws_ok($$select public.raise_notification_alerts_service('{"kind": "late"}'::jsonb)$$, '22023', null,
  '(d) alerts are a list');
select throws_ok($$select public.raise_notification_alerts_service('[{"kind": "loud", "channel": "email", "period": "2026-10"}]'::jsonb)$$,
  '23514', null, '(d) of the kinds there are');

-- (e) Who may call, the schedule, and the plan ----------------------------------------------------------------

select is(array(select p.proname || ' ' || r.rolname || ' ' || has_function_privilege(r.rolname, p.oid, 'EXECUTE')::text
                from pg_proc p cross join (values ('anon'), ('authenticated'), ('service_role')) r(rolname)
                where p.pronamespace = 'public'::regnamespace
                  and p.proname in ('begin_notification_dispatch_service', 'end_notification_dispatch_service',
                                    'notification_dispatch_alerts_service', 'raise_notification_alerts_service')
                order by 1),
  array['begin_notification_dispatch_service anon false', 'begin_notification_dispatch_service authenticated false',
        'begin_notification_dispatch_service service_role true', 'end_notification_dispatch_service anon false',
        'end_notification_dispatch_service authenticated false', 'end_notification_dispatch_service service_role true',
        'notification_dispatch_alerts_service anon false', 'notification_dispatch_alerts_service authenticated false',
        'notification_dispatch_alerts_service service_role true', 'raise_notification_alerts_service anon false',
        'raise_notification_alerts_service authenticated false', 'raise_notification_alerts_service service_role true'],
  '(e) only the dispatcher may take the lease or read and raise the alerts');
select is(array(select c.relname::text from pg_class c
                where c.relnamespace = 'app_private'::regnamespace
                  and c.relname in ('notification_quotas', 'notification_dispatch', 'notification_alerts')
                  and c.relrowsecurity
                  and not has_table_privilege('anon', c.oid, 'SELECT') and not has_table_privilege('authenticated', c.oid, 'SELECT')
                order by 1),
  array['notification_alerts', 'notification_dispatch', 'notification_quotas'],
  '(e) its tables are nobody else''s: row level security on, nothing granted');
select is((select schedule from cron.job where jobname = 'notification-dispatch'), '5 seconds', '(e) one job, every 5 seconds');
select ok((select command ~ 'dispatch_cron_endpoint\(''/api/internal/cron/notification-dispatch''\)'
                  and command ~ 'held_until' and command ~ 'exists \(' and command ~ 'delivery_due'
           from cron.job where jobname = 'notification-dispatch'),
  '(e) it calls the dispatcher only while something is due and no run holds the lease');
select is((select schedule || ' ' || command from cron.job where jobname = 'notification-heartbeat'),
  '*/5 * * * * select app_private.dispatch_cron_endpoint(''/api/internal/cron/notification-heartbeat'');',
  '(e) a heartbeat every 5 minutes, whatever is due, so a dispatcher that cannot run is heard of');
select is((select count(*)::integer from cron.job where jobname in ('notification-email', 'notification-push')), 0,
  '(e) the per-channel jobs are gone');
select ok((select schedule = '17 4 * * *' and command ~ 'delete from cron.job_run_details' from cron.job
           where jobname = 'cron-history-trim'), '(e) pg_cron''s history is trimmed once a day');
select ok(to_regclass('public.notification_deliveries_sent') is not null
  and to_regclass('public.notification_deliveries_email_sent') is null, '(e) one sent index for every channel');
select hasnt_column('app_private', 'notification_email_channel', 'daily_cap', '(e) the email cap is the quota keeper''s now');

-- Every 5 seconds the guard asks whether anything is due: through the partial indexes, never by reading every
-- delivery. The planner inlines the due check only while it has no settings of its own.
create function pg_temp.plan(query text) returns text language plpgsql as $$
declare line text; lines text := '';
begin
  for line in execute 'explain (costs off) ' || query loop lines := lines || line || E'\n'; end loop;
  return lines;
end $$;
select ok((select p.proconfig is null and p.provolatile = 's'
           from pg_proc p where p.oid = 'app_private.delivery_due(text, timestamptz, timestamptz)'::regprocedure),
  '(e) the due check has no settings of its own');
set local enable_seqscan = off;
select ok(pg_temp.plan($$select 1 from public.notification_deliveries d
                         where d.channel = any (app_private.dispatched_channels())
                           and app_private.delivery_due(d.status, d.next_attempt_at, d.lease_expires_at)$$)
          !~ 'delivery_due',
  '(e) the guard''s due check is inlined, not called for every delivery');
select ok(pg_temp.plan($$select 1 from public.notification_deliveries d
                         where d.channel = any (app_private.dispatched_channels())
                           and app_private.delivery_due(d.status, d.next_attempt_at, d.lease_expires_at)$$)
          ~ 'notification_deliveries_due' ,
  '(e) and it can use the partial index of waiting deliveries');
reset enable_seqscan;

select * from finish();
rollback;
