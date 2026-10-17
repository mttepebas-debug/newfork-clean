-- BILDIRIM-15 (KARARLAR S-138, S-123, S-126 (5); plan slice 8): phone alerts (web push). Every minute, when a
-- push is due, pg_cron calls the API's push worker (/api/internal/cron/notification-push, the dispatcher and
-- Vault secrets of the other cron routes). The worker claims due push deliveries here, sends each to the
-- person's devices with web-push and says, device by device, how each answered.
--   * a device is the person's, never a workspace's (notification_push_subscriptions). A person saves and
--     removes their own (save_ / delete_notification_push_subscription_service, account.self); a browser
--     someone else signs in on moves to them, so one person's alerts never reach the next one's screen; ten
--     at most, the one used longest ago goes. The push service's address is one of four (Google, Mozilla,
--     Apple, Microsoft): our server posts to it, so nothing else is taken (app_private.push_endpoint_ok);
--   * the claim (claim_notification_push_service): required first, then oldest; FOR UPDATE SKIP LOCKED; a
--     claimed row is 'sending' under a two-minute lease and counts a try. Each row is asked again first:
--     before launch, its lease used up, stale (24 hours), no longer a member (push never goes to a former
--     member, not even "your access ended": S-126 (5)), the route says no. It carries the alert, how long
--     the push service may hold it (what is left of the 24 hours), its urgency, a topic (the push service
--     keeps one of two with the same) and the devices that have not taken it yet;
--   * the lock screen: an alert shows the notice's title and the workspace's name; the notice's body only
--     where the product writes it itself from dates, hours and counts: a type from one producer, named by
--     the record it is about (app_private.push_shows_body). Never a person's own words (a time off reason,
--     a note) nor an announcement's (a closed day's shift change). A title is cut at 120 characters, a body
--     at 140;
--   * finishing (finish_notification_push_service), device by device: accepted is recorded and never sent
--     again (notification_push_sends); gone removes the device; a retry waits 1, 2, 4, 8 minutes, or what
--     the push service asked, and goes only to the devices still waiting; the fifth try is the last; too
--     large is dead at once; no device reached is dead. What the run had no time for is given back untried
--     (release_notification_push_service);
--   * fallback: an important or required notice that reached no device goes by email, unless the person or
--     the owner turned that email off or the address is suppressed; an optional one never does. The email
--     worker sends it though a device is still there (claim_notification_emails_service: a fallback is
--     stopped by the owner, the person, a suppressed or missing address, never by "off by default");
--   * launch (as S-130 (4)): the channel opens when this migration is applied; push queued before is skipped.
-- Only the worker (service_role) claims, finishes and gives back; the person's two through the API.

-- The lock screen ------------------------------------------------------------------------------------------

-- Whose body may show: each pair is one producer, which writes the body from dates, hours and counts
-- (schedule_publish_tell, the onboarding case's completion, the time off decision reminder). The same type
-- from another producer (a closed day's announcement changes a shift too) shows only its title.
create function app_private.push_shows_body(target_type text, target_subject text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (target_type, target_subject) in (
    ('schedule.published', 'schedule_publication'), ('schedule.shift_added', 'schedule_publication'),
    ('schedule.shift_changed', 'schedule_publication'), ('schedule.shift_removed', 'schedule_publication'),
    ('people.onboarding_completed', 'onboarding_case'), ('time_off.decision_reminder', 'time_off_request'))
$$;

revoke all on function app_private.push_shows_body(text, text) from public;

-- Devices ---------------------------------------------------------------------------------------------------

-- The four push services, https on their own port, no user, nothing after the host but a path.
create function app_private.push_endpoint_ok(target text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select target is not null and char_length(target) <= 2000
    and target ~ ('^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com'
                  || '|([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+push\.apple\.com'
                  || '|([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+notify\.windows\.com)/[^[:space:][:cntrl:]\\#]+$')
$$;

revoke all on function app_private.push_endpoint_ok(text) from public;

delete from public.notification_push_subscriptions
where not app_private.push_endpoint_ok(endpoint) or p256dh !~ '^[A-Za-z0-9_-]{87}$' or auth_secret !~ '^[A-Za-z0-9_-]{22}$';
alter table public.notification_push_subscriptions drop constraint notification_push_subscriptions_endpoint_check;
alter table public.notification_push_subscriptions add constraint notification_push_subscriptions_endpoint_check
  check (app_private.push_endpoint_ok(endpoint));
-- A P-256 public key (65 bytes) and an auth secret (16 bytes), base64url as the browser gives them.
alter table public.notification_push_subscriptions drop constraint notification_push_subscriptions_p256dh_check;
alter table public.notification_push_subscriptions add constraint notification_push_subscriptions_p256dh_check
  check (p256dh ~ '^[A-Za-z0-9_-]{87}$');
alter table public.notification_push_subscriptions drop constraint notification_push_subscriptions_auth_secret_check;
alter table public.notification_push_subscriptions add constraint notification_push_subscriptions_auth_secret_check
  check (auth_secret ~ '^[A-Za-z0-9_-]{22}$');
alter table public.notification_push_subscriptions add constraint notification_push_subscriptions_label_check
  check (device_label is null or (char_length(device_label) between 1 and 120 and device_label !~ '[[:cntrl:]]'));
alter table public.notification_push_subscriptions drop constraint notification_push_subscriptions_device_label_check;

-- The device that took an alert: it never gets it again.
create table public.notification_push_sends (
  delivery_id uuid not null references public.notification_deliveries(id) on delete cascade,
  subscription_id uuid not null references public.notification_push_subscriptions(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  primary key (delivery_id, subscription_id)
);
create index notification_push_sends_subscription on public.notification_push_sends (subscription_id);
alter table public.notification_push_sends enable row level security;
revoke all on public.notification_push_sends from anon, authenticated;

create function public.save_notification_push_subscription_service(actor_user_id uuid, target_endpoint text, target_p256dh text,
  target_auth text, target_label text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  label text := nullif(btrim(coalesce(target_label, '')), '');
  saved uuid;
begin
  perform app_private.authorize(actor_user_id, null, 'account.self', null, null, actor_user_id);
  if not app_private.push_endpoint_ok(target_endpoint) then
    raise exception 'a push service''s address is required' using errcode = '22023', hint = 'notifications.push_endpoint';
  end if;
  if target_p256dh is null or target_p256dh !~ '^[A-Za-z0-9_-]{87}$' or target_auth is null or target_auth !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'the browser''s keys are required' using errcode = '22023', hint = 'notifications.push_keys';
  end if;
  if label is not null and (char_length(label) > 120 or label ~ '[[:cntrl:]]') then
    raise exception 'a device name is up to 120 characters' using errcode = '22023', hint = 'notifications.push_label';
  end if;

  insert into public.notification_push_subscriptions (user_id, endpoint, p256dh, auth_secret, device_label, last_used_at)
  values (actor_user_id, target_endpoint, target_p256dh, target_auth, label, now())
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth_secret = excluded.auth_secret,
    device_label = excluded.device_label, last_used_at = now(), revoked_at = null, revoked_reason = null
  returning id into saved;

  -- Ten at most: the one used longest ago goes.
  update public.notification_push_subscriptions s set revoked_at = now(), revoked_reason = 'expired'
  where s.id in (
    select x.id from public.notification_push_subscriptions x
    where x.user_id = actor_user_id and x.revoked_at is null and x.id <> saved
    order by coalesce(x.last_used_at, x.created_at) desc, x.id
    offset 9);

  return jsonb_build_object('devices', (select count(*) from public.notification_push_subscriptions s
                                        where s.user_id = actor_user_id and s.revoked_at is null));
end;
$$;

-- Removes one's own device; somebody else's, or none, gets the same answer.
create function public.delete_notification_push_subscription_service(actor_user_id uuid, target_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.authorize(actor_user_id, null, 'account.self', null, null, actor_user_id);
  update public.notification_push_subscriptions s set revoked_at = now(), revoked_reason = 'person'
  where s.endpoint = target_endpoint and s.user_id = actor_user_id and s.revoked_at is null;
  return jsonb_build_object('devices', (select count(*) from public.notification_push_subscriptions s
                                        where s.user_id = actor_user_id and s.revoked_at is null));
end;
$$;

-- Launch ----------------------------------------------------------------------------------------------------

create table app_private.notification_push_channel (
  only_row boolean primary key default true check (only_row),
  opened_at timestamptz not null default now()
);
revoke all on table app_private.notification_push_channel from public, anon, authenticated;

-- The channel opens now, and push still waiting never goes (sent push and email stay as they are).
create function app_private.push_channel_open()
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into app_private.notification_push_channel (opened_at) values (now())
  on conflict (only_row) do update set opened_at = excluded.opened_at;
  update public.notification_deliveries set status = 'skipped', last_error = 'before_launch', lease_expires_at = null,
    updated_at = now()
  where channel = 'push' and status in ('queued', 'sending', 'failed');
end;
$$;

revoke all on function app_private.push_channel_open() from public, anon, authenticated;

select app_private.push_channel_open();

-- Fallback --------------------------------------------------------------------------------------------------

-- A push that reached no device: an important or required notice goes by email, unless the person or the
-- owner turned that email off or the address is suppressed. One email per notice at most.
create function app_private.push_fallback_email(target_notice uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  notice record;
  email record;
begin
  select n.id, n.workspace_id, n.user_id, n.type_key, t.level into notice
  from public.person_notifications n join public.notification_types t on t.key = n.type_key where n.id = target_notice;
  if notice.id is null or notice.level not in ('required', 'important') then
    return;
  end if;
  select r.sends, r.reason into email from app_private.notification_route(notice.type_key, notice.workspace_id, notice.user_id) r
  where r.channel = 'email';
  if coalesce(email.sends, false) or email.reason = 'default_off' then
    insert into public.notification_deliveries (notification_id, channel, reason)
    values (notice.id, 'email', case when email.sends then email.reason else 'push_fallback' end)
    on conflict (notification_id, channel) do nothing;
  end if;
end;
$$;

revoke all on function app_private.push_fallback_email(uuid) from public, anon, authenticated;

-- The email worker sends a push fallback (BILDIRIM-14's claim, one rule more) ----------------------------------

create or replace function public.claim_notification_emails_service(target_batch_size integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  channel app_private.notification_email_channel;
  sent_today integer;
  row record;
  route record;
  given jsonb := '[]'::jsonb;
  tomorrow timestamptz := (date_trunc('day', now() at time zone 'UTC') + interval '1 day') at time zone 'UTC';
begin
  if target_batch_size is null or target_batch_size < 1 or target_batch_size > 100 then
    raise exception 'a batch is 1 to 100' using errcode = '22023', hint = 'notifications.batch_size';
  end if;
  select * into channel from app_private.notification_email_channel;
  if not found then
    return given;
  end if;
  select count(*)::integer into sent_today from public.notification_deliveries d
  where d.channel = 'email' and d.sent_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';

  for row in
    select d.id, d.status, d.attempts, d.reason, d.created_at queued_at, n.id notice, n.workspace_id, n.user_id, n.type_key, n.title, n.body, n.url,
      n.created_at noticed_at, t.level, t.to_former_members, p.name topic
    from public.notification_deliveries d
    join public.person_notifications n on n.id = d.notification_id
    join public.notification_types t on t.key = n.type_key
    join public.notification_topics p on p.key = t.topic_key
    where d.channel = 'email'
      and ((d.status in ('queued', 'failed') and d.next_attempt_at <= now())
           or (d.status = 'sending' and d.lease_expires_at < now()))
    order by (t.level = 'required') desc, d.created_at, d.id
    limit target_batch_size
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
    if row.level <> 'required' and channel.daily_cap is not null and sent_today >= channel.daily_cap then
      update public.notification_deliveries set status = 'queued', next_attempt_at = tomorrow, lease_expires_at = null,
        updated_at = now() where id = row.id;
      continue;
    end if;
    update public.notification_deliveries set status = 'sending', attempts = attempts + 1,
      lease_expires_at = now() + interval '2 minutes', updated_at = now() where id = row.id;
    sent_today := sent_today + 1;
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

-- The worker ------------------------------------------------------------------------------------------------

create function public.claim_notification_push_service(target_batch_size integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  channel app_private.notification_push_channel;
  row record;
  route record;
  targets jsonb;
  workspace_name text;
  given jsonb := '[]'::jsonb;
begin
  if target_batch_size is null or target_batch_size < 1 or target_batch_size > 100 then
    raise exception 'a batch is 1 to 100' using errcode = '22023', hint = 'notifications.batch_size';
  end if;
  select * into channel from app_private.notification_push_channel;
  if not found then
    return given;
  end if;

  for row in
    select d.id, d.status, d.attempts, d.created_at queued_at, n.id notice, n.workspace_id, n.user_id, n.type_key, n.title, n.body,
      n.url, n.subject_type, n.created_at noticed_at, t.level
    from public.notification_deliveries d
    join public.person_notifications n on n.id = d.notification_id
    join public.notification_types t on t.key = n.type_key
    where d.channel = 'push'
      and ((d.status in ('queued', 'failed') and d.next_attempt_at <= now())
           or (d.status = 'sending' and d.lease_expires_at < now()))
    order by (t.level = 'required') desc, d.created_at, d.id
    limit target_batch_size
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

-- [{subscription_id, outcome: accepted|gone|refused|retry|too_large, code, retry_after (seconds)}]
create function public.finish_notification_push_service(target_delivery uuid, target_results jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_row public.notification_deliveries;
  owner_user uuid;
  answer jsonb;
  waits boolean := false;
  too_large boolean := false;
  wait_for integer := 0;
  retry_code text;
  next_status text;
begin
  if jsonb_typeof(target_results) is distinct from 'array' or jsonb_array_length(target_results) > 10 then
    raise exception 'answers are a list of up to ten' using errcode = '22023', hint = 'notifications.push_results';
  end if;
  for answer in select value from jsonb_array_elements(target_results) loop
    if jsonb_typeof(answer) is distinct from 'object' or jsonb_typeof(answer -> 'subscription_id') is distinct from 'string'
       or (answer ->> 'subscription_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (case coalesce(jsonb_typeof(answer -> 'retry_after'), 'null')
             when 'null' then false
             when 'number' then (answer ->> 'retry_after')::numeric not between 0 and 86400
             else true end) then
      raise exception 'answers are a list of up to ten' using errcode = '22023', hint = 'notifications.push_results';
    end if;
    if coalesce(answer ->> 'outcome', '') not in ('accepted', 'gone', 'refused', 'retry', 'too_large') then
      raise exception 'an outcome is accepted, gone, refused, retry or too_large' using errcode = '22023', hint = 'notifications.outcome';
    end if;
    if answer ->> 'code' is not null and answer ->> 'code' !~ '^[a-z0-9_]{1,40}$' then
      raise exception 'an error is a short code' using errcode = '22023', hint = 'notifications.error_code';
    end if;
  end loop;

  select * into found_row from public.notification_deliveries d where d.id = target_delivery and d.channel = 'push' for update;
  if not found then
    return null;
  end if;
  -- Only a row being sent is finished: a late answer never undoes what came after it.
  if found_row.status <> 'sending' then
    return found_row.status;
  end if;
  select n.user_id into owner_user from public.person_notifications n where n.id = found_row.notification_id;

  for answer in
    select a.value from jsonb_array_elements(target_results) a
    join public.notification_push_subscriptions s on s.id = (a.value ->> 'subscription_id')::uuid and s.user_id = owner_user
  loop
    case answer ->> 'outcome'
      when 'accepted' then
        insert into public.notification_push_sends (delivery_id, subscription_id) values (found_row.id, (answer ->> 'subscription_id')::uuid)
        on conflict do nothing;
        update public.notification_push_subscriptions set last_used_at = now() where id = (answer ->> 'subscription_id')::uuid;
      when 'gone' then
        update public.notification_push_subscriptions set revoked_at = now(), revoked_reason = 'gone'
        where id = (answer ->> 'subscription_id')::uuid and revoked_at is null;
      when 'retry' then
        waits := true;
        retry_code := coalesce(retry_code, answer ->> 'code');
        wait_for := greatest(wait_for, coalesce((answer ->> 'retry_after')::numeric, 0)::integer);
      when 'too_large' then
        too_large := true;
      else
        null;
    end case;
  end loop;

  if too_large then
    next_status := 'dead';
    update public.notification_deliveries set status = 'dead', last_error = 'payload_too_large', lease_expires_at = null,
      updated_at = now() where id = found_row.id;
  elsif waits and found_row.attempts < 5 then
    next_status := 'failed';
    update public.notification_deliveries set status = 'failed', last_error = coalesce(retry_code, 'retry'), lease_expires_at = null,
      next_attempt_at = now() + greatest(make_interval(mins => (2 ^ (found_row.attempts - 1))::integer),
                                         make_interval(secs => least(wait_for, 3600))),
      updated_at = now() where id = found_row.id;
  elsif exists (select 1 from public.notification_push_sends s where s.delivery_id = found_row.id) then
    next_status := 'sent';
    update public.notification_deliveries set status = 'sent', sent_at = now(), last_error = null, lease_expires_at = null,
      updated_at = now() where id = found_row.id;
  else
    next_status := 'dead';
    update public.notification_deliveries set status = 'dead',
      last_error = case when waits then 'retries_exhausted' else 'no_device_reached' end, lease_expires_at = null,
      updated_at = now() where id = found_row.id;
  end if;
  if next_status = 'dead' and not exists (select 1 from public.notification_push_sends s where s.delivery_id = found_row.id) then
    perform app_private.push_fallback_email(found_row.notification_id);
  end if;
  return next_status;
end;
$$;

-- What the run had no time for goes back untried, in one call: the try it never made is not counted.
create function public.release_notification_push_service(target_deliveries uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  given integer;
begin
  update public.notification_deliveries d set
    status = case when d.attempts > 1 then 'failed' else 'queued' end,
    attempts = greatest(d.attempts - 1, 0),
    next_attempt_at = now(),
    lease_expires_at = null,
    updated_at = now()
  where d.id = any (coalesce(target_deliveries, '{}'::uuid[])) and d.channel = 'push' and d.status = 'sending';
  get diagnostics given = row_count;
  return given;
end;
$$;

revoke all on function public.save_notification_push_subscription_service(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.delete_notification_push_subscription_service(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_notification_push_service(integer) from public, anon, authenticated;
revoke all on function public.finish_notification_push_service(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.release_notification_push_service(uuid[]) from public, anon, authenticated;
grant execute on function public.save_notification_push_subscription_service(uuid, text, text, text, text) to service_role;
grant execute on function public.delete_notification_push_subscription_service(uuid, text) to service_role;
grant execute on function public.claim_notification_push_service(integer) to service_role;
grant execute on function public.finish_notification_push_service(uuid, jsonb) to service_role;
grant execute on function public.release_notification_push_service(uuid[]) to service_role;

-- Every minute, only when a push is due, through the dispatcher of the other cron routes; a database without
-- its Vault secrets (local, CI) stays quiet.
select cron.unschedule(jobid) from cron.job where jobname = 'notification-push';
select cron.schedule('notification-push', '* * * * *',
  $$select app_private.dispatch_cron_endpoint('/api/internal/cron/notification-push')
    where exists (select 1 from public.notification_deliveries d
                  where d.channel = 'push'
                    and ((d.status in ('queued', 'failed') and d.next_attempt_at <= now())
                         or (d.status = 'sending' and d.lease_expires_at < now())));$$);
