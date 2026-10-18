-- BILDIRIM-DAGITICI (Mert 2026-10-17, plan page "Bildirim teslim planı"): one dispatcher for every channel.
--   * one cron job, every 5 seconds, calls the API's dispatcher only while a delivery is due and no run holds
--     the dispatch lease (begin/end_notification_dispatch_service): one run at a time, so the quota count and
--     the providers' rate limits hold; the per-channel minute jobs go;
--   * fair claims: both channels' claims take due rows from one ordered list (app_private.fair_due): required
--     first, then round-robin across workspaces, then oldest. A workspace's big announcement no longer holds
--     back everybody else's notices;
--   * the quota keeper (app_private.notification_quotas) replaces the email channel's daily_cap: a channel's
--     notices get its plan's daily and monthly limit minus what is kept back for invitations, password resets
--     and exports. With no room, non-required rows wait for the next UTC day or month; required rows still go.
--     Email starts at Resend Free (100 a day, 30 kept; 3,000 a month, 900 kept). At Pro the row is updated;
--   * alerts (notification_dispatch_alerts_service): a quota at 80% and full, by day and by month, and a due
--     delivery waiting over 2 minutes are handed to the API until it says it told Mert (Sentry), then once
--     per period (raise_notification_alerts_service): an alert whose send failed comes back;
--   * a heartbeat every 5 minutes, whatever is due: the API asks for the alerts and checks in with Sentry's
--     cron monitor, so a dispatcher that cannot run at all (a wrong secret, a deploy gap, an outage) is
--     still heard of: a missed check-in is Sentry's own alert;
--   * pg_cron keeps a row per run; at one run every 5 seconds the history is trimmed daily to 2 days.
-- Only the dispatcher (service_role) calls the services; no person and no browser.

-- The channels a worker sends today. SMS rows are never queued (no route sends SMS); if one were, it would not
-- wake the dispatcher every 5 seconds for ever. No search_path of its own (it names no object), so the
-- planner folds it into the query.
create function app_private.dispatched_channels()
returns text[]
language sql
immutable
as $$ select array['email', 'push'] $$;

revoke all on function app_private.dispatched_channels() from public, anon, authenticated;

-- A delivery is due when its time came and it waits, or when its run's lease ran out. No search_path of its
-- own (it names no object): the planner inlines it, so the cron guard and fair_due use the partial indexes
-- notification_deliveries_due and notification_deliveries_leased instead of reading every delivery.
create function app_private.delivery_due(status text, next_attempt_at timestamptz, lease_expires_at timestamptz)
returns boolean
language sql
stable
as $$
  select (status in ('queued', 'failed') and next_attempt_at <= now())
      or (status = 'sending' and lease_expires_at < now())
$$;

revoke all on function app_private.delivery_due(text, timestamptz, timestamptz) from public, anon, authenticated;

-- Up to target_size due deliveries of a channel, in the order they are taken: required notices first, then
-- each workspace's oldest in turn, then age. Not locked: the claim locks them, skipping what another took.
create function app_private.fair_due(target_channel text, target_size integer)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce((array_agg(x.id order by x.required desc, x.turn, x.created_at, x.id))[1:target_size], '{}')
  from (
    select d.id, d.created_at, (t.level = 'required') required,
      row_number() over (partition by n.workspace_id, (t.level = 'required') order by d.created_at, d.id) turn
    from public.notification_deliveries d
    join public.person_notifications n on n.id = d.notification_id
    join public.notification_types t on t.key = n.type_key
    where d.channel = target_channel
      and app_private.delivery_due(d.status, d.next_attempt_at, d.lease_expires_at)
  ) x
  -- No workspace's turn past one batch can make it into one.
  where x.turn <= target_size
$$;

revoke all on function app_private.fair_due(text, integer) from public, anon, authenticated;

-- The quota keeper ------------------------------------------------------------------------------------------

create table app_private.notification_quotas (
  channel text primary key check (channel in ('email', 'push', 'sms')),
  daily_limit integer check (daily_limit is null or daily_limit > 0),
  monthly_limit integer check (monthly_limit is null or monthly_limit > 0),
  reserved_daily integer not null default 0 check (reserved_daily >= 0 and (daily_limit is null or reserved_daily < daily_limit)),
  reserved_monthly integer not null default 0
    check (reserved_monthly >= 0 and (monthly_limit is null or reserved_monthly < monthly_limit))
);
alter table app_private.notification_quotas enable row level security;
revoke all on table app_private.notification_quotas from public, anon, authenticated;

-- Resend Free (KARARLAR S-130): 100 a day and 3,000 a month, shared with invitations, password resets, account
-- security and schedule exports, which keep 30 a day and 900 a month. Push has no provider quota: no row.
insert into app_private.notification_quotas (channel, daily_limit, monthly_limit, reserved_daily, reserved_monthly)
values ('email', 100, 3000, 30, 900);

alter table app_private.notification_email_channel drop column daily_cap;

drop index public.notification_deliveries_email_sent;
create index notification_deliveries_sent on public.notification_deliveries (channel, sent_at) where sent_at is not null;

-- How many more of a channel's notices may go now (null: no limit), and when room comes back once none is left.
create function app_private.channel_room(target_channel text, out room integer, out opens_at timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
  quota app_private.notification_quotas;
  day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  sent_today integer;
  sent_month integer;
  day_room integer;
  month_room integer;
begin
  select * into quota from app_private.notification_quotas q where q.channel = target_channel;
  if not found or (quota.daily_limit is null and quota.monthly_limit is null) then
    return;
  end if;
  select count(*) filter (where d.sent_at >= day_start)::integer, count(*)::integer
    into sent_today, sent_month
  from public.notification_deliveries d
  where d.channel = target_channel and d.sent_at >= month_start;
  day_room := case when quota.daily_limit is null then null else quota.daily_limit - quota.reserved_daily - sent_today end;
  month_room := case when quota.monthly_limit is null then null else quota.monthly_limit - quota.reserved_monthly - sent_month end;
  room := greatest(0, least(coalesce(day_room, month_room), coalesce(month_room, day_room)));
  if room = 0 then
    opens_at := case when month_room is not null and month_room <= 0 then month_start + interval '1 month'
                     else day_start + interval '1 day' end;
  end if;
end;
$$;

revoke all on function app_private.channel_room(text) from public, anon, authenticated;

-- One run at a time -----------------------------------------------------------------------------------------

create table app_private.notification_dispatch (
  only_row boolean primary key default true check (only_row),
  run_id uuid,
  held_until timestamptz not null default '-infinity'
);
alter table app_private.notification_dispatch enable row level security;
revoke all on table app_private.notification_dispatch from public, anon, authenticated;
insert into app_private.notification_dispatch default values;

-- The run's id when the lease was free (or ran out), null when another run holds it.
create function public.begin_notification_dispatch_service(target_seconds integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  taken uuid;
begin
  if target_seconds is null or target_seconds < 1 or target_seconds > 60 then
    raise exception 'a lease is 1 to 60 seconds' using errcode = '22023', hint = 'notifications.lease_seconds';
  end if;
  update app_private.notification_dispatch set run_id = gen_random_uuid(),
    held_until = now() + make_interval(secs => target_seconds)
  where only_row and held_until < now()
  returning run_id into taken;
  return taken;
end;
$$;

-- Lets the lease go, only for the run holding it: a run whose lease ran out never frees the next run's.
create function public.end_notification_dispatch_service(target_run uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update app_private.notification_dispatch set run_id = null, held_until = '-infinity'
  where only_row and run_id = target_run;
$$;

-- Alerts ----------------------------------------------------------------------------------------------------

create table app_private.notification_alerts (
  kind text not null check (kind in ('quota_day_80', 'quota_day_full', 'quota_month_80', 'quota_month_full', 'late')),
  channel text not null check (channel in ('email', 'push', 'sms')),
  period text not null check (period ~ '^[0-9T:-]{7,16}$'),
  raised_at timestamptz not null default now(),
  primary key (kind, channel, period)
);
alter table app_private.notification_alerts enable row level security;
revoke all on table app_private.notification_alerts from public, anon, authenticated;

-- [{kind, channel, period, sent, limit} | {kind: late, channel, period, waiting_seconds, due}]: what is true
-- now and was not told yet this period. Nothing is written here: raise_notification_alerts_service writes
-- what the API told, so an alert whose send failed comes back on the next call.
create function public.notification_dispatch_alerts_service()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  quota app_private.notification_quotas;
  day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  day_key text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  month_key text := to_char(now() at time zone 'UTC', 'YYYY-MM');
  sent_today integer;
  sent_month integer;
  candidate record;
  late record;
  late_period text := to_char(date_bin('30 minutes', now(), timestamptz '2000-01-01') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI');
  full_now text[];
  raised jsonb := '[]'::jsonb;
begin
  for quota in select * from app_private.notification_quotas order by channel loop
    select count(*) filter (where d.sent_at >= day_start)::integer, count(*)::integer
      into sent_today, sent_month
    from public.notification_deliveries d
    where d.channel = quota.channel and d.sent_at >= month_start;
    full_now := '{}';
    for candidate in
      select * from (values
        (1, 'quota_day_full', day_key, sent_today, quota.daily_limit - quota.reserved_daily, 1.0),
        (2, 'quota_day_80', day_key, sent_today, quota.daily_limit - quota.reserved_daily, 0.8),
        (3, 'quota_month_full', month_key, sent_month, quota.monthly_limit - quota.reserved_monthly, 1.0),
        (4, 'quota_month_80', month_key, sent_month, quota.monthly_limit - quota.reserved_monthly, 0.8)
      ) v(place, kind, period, sent, cap, part)
      where v.cap is not null and v.sent >= ceil(v.cap * v.part)
      order by v.place
    loop
      -- Full says it all: no 80% alert with or after a full one in the same period.
      continue when candidate.part = 0.8 and (replace(candidate.kind, '_80', '_full') = any (full_now)
        or exists (select 1 from app_private.notification_alerts a
                   where a.kind = replace(candidate.kind, '_80', '_full') and a.channel = quota.channel
                     and a.period = candidate.period));
      if candidate.part = 1.0 then
        full_now := full_now || candidate.kind::text;
      end if;
      continue when exists (select 1 from app_private.notification_alerts a
        where a.kind = candidate.kind and a.channel = quota.channel and a.period = candidate.period);
      raised := raised || jsonb_build_array(jsonb_build_object('kind', candidate.kind, 'channel', quota.channel,
        'period', candidate.period, 'sent', candidate.sent, 'limit', candidate.cap));
    end loop;
  end loop;

  for late in
    select d.channel, count(*)::integer due,
      max(extract(epoch from now() - case when d.status = 'sending' then d.lease_expires_at else d.next_attempt_at end))::integer waited
    from public.notification_deliveries d
    where d.channel = any (app_private.dispatched_channels())
      and app_private.delivery_due(d.status, d.next_attempt_at, d.lease_expires_at)
    group by d.channel
    having max(now() - case when d.status = 'sending' then d.lease_expires_at else d.next_attempt_at end) > interval '2 minutes'
    order by d.channel
  loop
    -- Once per half hour while it lasts.
    continue when exists (select 1 from app_private.notification_alerts a
      where a.kind = 'late' and a.channel = late.channel and a.period = late_period);
    raised := raised || jsonb_build_array(jsonb_build_object('kind', 'late', 'channel', late.channel,
      'period', late_period, 'waiting_seconds', late.waited, 'due', late.due));
  end loop;
  return raised;
end;
$$;

-- The alerts the API told: none is handed over again in its period. Answers how many were new.
create function public.raise_notification_alerts_service(target_alerts jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  added integer;
begin
  if target_alerts is null or jsonb_typeof(target_alerts) <> 'array' or jsonb_array_length(target_alerts) > 50 then
    raise exception 'alerts are a list of at most 50' using errcode = '22023', hint = 'notifications.alerts';
  end if;
  insert into app_private.notification_alerts (kind, channel, period)
  select x ->> 'kind', x ->> 'channel', x ->> 'period' from jsonb_array_elements(target_alerts) x
  on conflict do nothing;
  get diagnostics added = row_count;
  delete from app_private.notification_alerts a where a.raised_at < now() - interval '90 days';
  return added;
end;
$$;

-- The claims ------------------------------------------------------------------------------------------------

create or replace function public.claim_notification_emails_service(target_batch_size integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  channel app_private.notification_email_channel;
  quota record;
  room integer;
  row record;
  route record;
  given jsonb := '[]'::jsonb;
  picked uuid[];
begin
  if target_batch_size is null or target_batch_size < 1 or target_batch_size > 100 then
    raise exception 'a batch is 1 to 100' using errcode = '22023', hint = 'notifications.batch_size';
  end if;
  select * into channel from app_private.notification_email_channel;
  if not found then
    return given;
  end if;
  select * into quota from app_private.channel_room('email');
  room := quota.room;
  picked := app_private.fair_due('email', target_batch_size);

  for row in
    select d.id, d.status, d.attempts, d.reason, d.created_at queued_at, n.id notice, n.workspace_id, n.user_id, n.type_key, n.title,
      n.body, n.url, n.created_at noticed_at, t.level, t.to_former_members, p.name topic
    from public.notification_deliveries d
    join public.person_notifications n on n.id = d.notification_id
    join public.notification_types t on t.key = n.type_key
    join public.notification_topics p on p.key = t.topic_key
    where d.id = any (picked)
      and app_private.delivery_due(d.status, d.next_attempt_at, d.lease_expires_at)
    order by array_position(picked, d.id)
    for update of d skip locked
  loop
    if row.queued_at < channel.opened_at then
      update public.notification_deliveries set status = 'skipped', last_error = 'before_launch', lease_expires_at = null,
        updated_at = now() where id = row.id;
      continue;
    end if;
    if row.status = 'sending' and row.attempts >= 5 then
      update public.notification_deliveries set status = 'dead', last_error = 'lease_exhausted', lease_expires_at = null,
        updated_at = now() where id = row.id;
      continue;
    end if;
    if row.noticed_at < now() - interval '24 hours' then
      update public.notification_deliveries set status = 'dead', last_error = 'stale', lease_expires_at = null,
        updated_at = now() where id = row.id;
      continue;
    end if;
    if not app_private.membership_receives(row.workspace_id, row.user_id, row.to_former_members) then
      update public.notification_deliveries set status = 'skipped', last_error = 'not_member', lease_expires_at = null,
        updated_at = now() where id = row.id;
      continue;
    end if;
    select r.sends, r.reason into route from app_private.notification_route(row.type_key, row.workspace_id, row.user_id) r
    where r.channel = 'email';
    -- A phone alert that reached no device comes by email though email is off by default for it, and
    -- though the person still has a device (BILDIRIM-15); the owner, the person or the address still stop it.
    if not coalesce(route.sends, false) and not (row.reason = 'push_fallback' and route.reason = 'default_off') then
      update public.notification_deliveries set status = 'skipped', last_error = coalesce(route.reason, 'no_route'),
        lease_expires_at = null, updated_at = now() where id = row.id;
      continue;
    end if;
    -- No room left in the plan: it waits until room comes back; required mail still goes, and counts.
    if row.level <> 'required' and room is not null and room <= 0 then
      update public.notification_deliveries set status = 'queued',
        next_attempt_at = coalesce((select q.opens_at from app_private.channel_room('email') q), now() + interval '1 hour'),
        lease_expires_at = null, updated_at = now() where id = row.id;
      continue;
    end if;
    update public.notification_deliveries set status = 'sending', attempts = attempts + 1,
      lease_expires_at = now() + interval '2 minutes', updated_at = now() where id = row.id;
    room := room - 1;
    given := given || jsonb_build_array(jsonb_build_object(
      'delivery_id', row.id,
      'to', (select lower(u.email) from auth.users u where u.id = row.user_id),
      'subject', row.title,
      'title', row.title,
      'body', row.body,
      'url', row.url,
      'workspace_name', (select w.name from public.workspaces w where w.id = row.workspace_id),
      'level', row.level,
      'topic', row.topic,
      'idempotency_key', 'notification-delivery/' || row.id::text));
  end loop;
  return given;
end;
$$;

create or replace function public.claim_notification_push_service(target_batch_size integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  channel app_private.notification_push_channel;
  quota record;
  room integer;
  row record;
  route record;
  targets jsonb;
  workspace_name text;
  given jsonb := '[]'::jsonb;
  picked uuid[];
begin
  if target_batch_size is null or target_batch_size < 1 or target_batch_size > 100 then
    raise exception 'a batch is 1 to 100' using errcode = '22023', hint = 'notifications.batch_size';
  end if;
  select * into channel from app_private.notification_push_channel;
  if not found then
    return given;
  end if;
  -- Push has no provider quota today (no row); a row added later holds here as it does for email.
  select * into quota from app_private.channel_room('push');
  room := quota.room;
  picked := app_private.fair_due('push', target_batch_size);

  for row in
    select d.id, d.status, d.attempts, d.created_at queued_at, n.id notice, n.workspace_id, n.user_id, n.type_key, n.title, n.body,
      n.url, n.subject_type, n.created_at noticed_at, t.level
    from public.notification_deliveries d
    join public.person_notifications n on n.id = d.notification_id
    join public.notification_types t on t.key = n.type_key
    where d.id = any (picked)
      and app_private.delivery_due(d.status, d.next_attempt_at, d.lease_expires_at)
    order by array_position(picked, d.id)
    for update of d skip locked
  loop
    if row.queued_at < channel.opened_at then
      update public.notification_deliveries set status = 'skipped', last_error = 'before_launch', lease_expires_at = null,
        updated_at = now() where id = row.id;
      continue;
    end if;
    if row.status = 'sending' and row.attempts >= 5 then
      if exists (select 1 from public.notification_push_sends s where s.delivery_id = row.id) then
        update public.notification_deliveries set status = 'sent', sent_at = coalesce(sent_at, now()), last_error = null,
          lease_expires_at = null, updated_at = now() where id = row.id;
      else
        update public.notification_deliveries set status = 'dead', last_error = 'lease_exhausted', lease_expires_at = null,
          updated_at = now() where id = row.id;
        perform app_private.push_fallback_email(row.notice);
      end if;
      continue;
    end if;
    if row.noticed_at < now() - interval '24 hours' then
      update public.notification_deliveries set status = 'dead', last_error = 'stale', lease_expires_at = null,
        updated_at = now() where id = row.id;
      continue;
    end if;
    -- Push never goes to a former member, not even what goes to former members (S-126 (5)).
    if not app_private.membership_receives(row.workspace_id, row.user_id, false) then
      update public.notification_deliveries set status = 'skipped', last_error = 'not_member', lease_expires_at = null,
        updated_at = now() where id = row.id;
      continue;
    end if;
    select r.sends, r.reason into route from app_private.notification_route(row.type_key, row.workspace_id, row.user_id) r
    where r.channel = 'push';
    if not coalesce(route.sends, false) then
      update public.notification_deliveries set status = 'skipped', last_error = coalesce(route.reason, 'no_route'),
        lease_expires_at = null, updated_at = now() where id = row.id;
      if route.reason = 'no_device' then
        perform app_private.push_fallback_email(row.notice);
      end if;
      continue;
    end if;
    if row.level <> 'required' and room is not null and room <= 0 then
      update public.notification_deliveries set status = 'queued',
        next_attempt_at = coalesce((select q.opens_at from app_private.channel_room('push') q), now() + interval '1 hour'),
        lease_expires_at = null, updated_at = now() where id = row.id;
      continue;
    end if;
    -- Ten at most, the most recently used first: two saves at once can leave one more for a moment.
    select coalesce(jsonb_agg(jsonb_build_object('subscription_id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh,
             'auth', s.auth_secret) order by s.used desc, s.id), '[]'::jsonb)
      into targets
    from (select x.*, coalesce(x.last_used_at, x.created_at) used from public.notification_push_subscriptions x
          where x.user_id = row.user_id and x.revoked_at is null
            and not exists (select 1 from public.notification_push_sends y where y.delivery_id = row.id and y.subscription_id = x.id)
          order by used desc, x.id
          limit 10) s;
    if jsonb_array_length(targets) = 0 then
      -- Every device left has taken it already.
      update public.notification_deliveries set status = 'sent', sent_at = coalesce(sent_at, now()), last_error = null,
        lease_expires_at = null, updated_at = now() where id = row.id;
      continue;
    end if;
    update public.notification_deliveries set status = 'sending', attempts = attempts + 1,
      lease_expires_at = now() + interval '2 minutes', updated_at = now() where id = row.id;
    room := room - 1;
    workspace_name := (select w.name from public.workspaces w where w.id = row.workspace_id);
    given := given || jsonb_build_array(jsonb_build_object(
      'delivery_id', row.id,
      'ttl', greatest(60, 86400 - extract(epoch from now() - row.noticed_at)::integer),
      'urgency', case when row.level = 'optional' then 'normal' else 'high' end,
      'topic', left(replace(row.notice::text, '-', ''), 32),
      'payload', jsonb_build_object(
        'title', case when char_length(row.title) > 120 then left(row.title, 119) || '…' else row.title end,
        'body', nullif(concat_ws(' · ', workspace_name,
          case when app_private.push_shows_body(row.type_key, row.subject_type) and row.body is not null then
            case when char_length(row.body) > 140 then left(row.body, 139) || '…' else row.body end end), ''),
        'url', coalesce(row.url, '/app'),
        'tag', row.notice::text),
      'targets', targets));
  end loop;
  return given;
end;
$$;

revoke all on function public.begin_notification_dispatch_service(integer) from public, anon, authenticated;
revoke all on function public.end_notification_dispatch_service(uuid) from public, anon, authenticated;
revoke all on function public.notification_dispatch_alerts_service() from public, anon, authenticated;
revoke all on function public.raise_notification_alerts_service(jsonb) from public, anon, authenticated;
grant execute on function public.begin_notification_dispatch_service(integer) to service_role;
grant execute on function public.end_notification_dispatch_service(uuid) to service_role;
grant execute on function public.notification_dispatch_alerts_service() to service_role;
grant execute on function public.raise_notification_alerts_service(jsonb) to service_role;

-- The schedule ----------------------------------------------------------------------------------------------

select cron.unschedule(jobid) from cron.job
where jobname in ('notification-email', 'notification-push', 'notification-dispatch', 'notification-heartbeat');
-- Every 5 seconds, only while something is due and no run holds the lease; a database without its Vault
-- secrets (local, CI) stays quiet.
select cron.schedule('notification-dispatch', '5 seconds',
  $$select app_private.dispatch_cron_endpoint('/api/internal/cron/notification-dispatch')
    where (select x.held_until from app_private.notification_dispatch x) < now()
      and exists (select 1 from public.notification_deliveries d
                  where d.channel = any (app_private.dispatched_channels())
                    and app_private.delivery_due(d.status, d.next_attempt_at, d.lease_expires_at));$$);

-- Every 5 minutes, whatever is due: the API asks for the alerts and checks in with Sentry's cron monitor
-- ("notification-delivery"). If this call stops arriving, Sentry tells Mert itself.
select cron.schedule('notification-heartbeat', '*/5 * * * *',
  $$select app_private.dispatch_cron_endpoint('/api/internal/cron/notification-heartbeat');$$);

select cron.unschedule(jobid) from cron.job where jobname = 'cron-history-trim';
select cron.schedule('cron-history-trim', '17 4 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '2 days';$$);
