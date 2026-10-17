-- BILDIRIM-14 (KARARLAR S-130, S-123, S-126 (5); plan slice 7): the email channel. Every minute pg_cron
-- calls the API's email worker (/api/internal/cron/notification-email, the dispatcher and Vault secrets of
-- the other cron routes). The worker claims due email deliveries here, sends each through Resend with the
-- delivery's own idempotency key, and says how each went; Resend's webhook says what happened after.
--   * the claim (claim_notification_emails_service): required first, then oldest; FOR UPDATE SKIP LOCKED;
--     a claimed row is 'sending' under a two-minute lease and counts a try; a row whose lease ran out is
--     claimed again with the same key, so Resend never sends it twice. Each row is asked again first: the
--     person turned that topic's email off, the owner turned the type off, the address is suppressed or
--     gone (notification_route), the person is no longer a member ("your access ended" excepted): the row
--     is 'skipped' with the reason, never sent. The address is read now and handed to the worker only;
--   * launch (S-130 (4)): the channel opens when this migration is applied; email queued before that is
--     'skipped' (before_launch), never sent;
--   * freshness: a notice older than 24 hours is not emailed, whatever its level ('dead', stale);
--   * the free plan's daily cap (100): important and optional mail waits for the next day at the cap;
--     required mail still goes. Going Pro is one update: daily_cap = null;
--   * finishing (finish_notification_email_service): sent keeps Resend's id; a retry waits 1, 2, 4, 8
--     minutes and the fifth try is the last; a refusal is dead at once; a row the run had no time for is
--     given back untried. An error is a short code, never Resend's words;
--   * Resend's word (apply_notification_email_event_service): delivered; a permanent bounce, a complaint
--     or Resend's own suppression suppresses the address; a temporary bounce changes nothing; a failure
--     is dead; an email we never sent is ignored; the same event twice changes nothing more.
-- Only the worker (service_role) calls the three; no person and no browser.

alter table public.notification_deliveries drop constraint notification_deliveries_status_check;
alter table public.notification_deliveries add constraint notification_deliveries_status_check
  check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'dead', 'bounced', 'complained', 'suppressed', 'skipped'));

-- When email opened, and the plan's daily cap. One row.
create table app_private.notification_email_channel (
  only_row boolean primary key default true check (only_row),
  opened_at timestamptz not null default now(),
  daily_cap integer default 100 check (daily_cap is null or daily_cap > 0)
);
insert into app_private.notification_email_channel default values;
revoke all on table app_private.notification_email_channel from public, anon, authenticated;

-- Launch: what queued before it never goes.
update public.notification_deliveries set status = 'skipped', last_error = 'before_launch', lease_expires_at = null, updated_at = now()
where channel = 'email' and status in ('queued', 'sending', 'failed');

-- Resend's id is how its webhook names an email.
create index notification_deliveries_provider_message on public.notification_deliveries (provider_message_id)
where provider_message_id is not null;

create function public.claim_notification_emails_service(target_batch_size integer)
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
  member boolean;
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
    select d.id, d.created_at queued_at, n.id notice, n.workspace_id, n.user_id, n.type_key, n.title, n.body, n.url,
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
    if row.noticed_at < now() - interval '24 hours' then
      update public.notification_deliveries set status = 'dead', last_error = 'stale', lease_expires_at = null,
        updated_at = now() where id = row.id;
      continue;
    end if;
    member := row.workspace_id is null or exists (
      select 1 from public.workspace_memberships m
      where m.workspace_id = row.workspace_id and m.user_id = row.user_id
        and (m.status in ('active', 'pending_activation') or (row.to_former_members and m.status in ('suspended', 'removed'))));
    if not member then
      update public.notification_deliveries set status = 'skipped', last_error = 'not_member', lease_expires_at = null,
        updated_at = now() where id = row.id;
      continue;
    end if;
    select r.sends, r.reason into route from app_private.notification_route(row.type_key, row.workspace_id, row.user_id) r
    where r.channel = 'email';
    if not coalesce(route.sends, false) then
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

create function public.finish_notification_email_service(target_delivery uuid, target_outcome text, target_provider_id text,
  target_error text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_row public.notification_deliveries;
begin
  if target_outcome is null or target_outcome not in ('sent', 'retry', 'dead', 'released') then
    raise exception 'an outcome is sent, retry, dead or released' using errcode = '22023', hint = 'notifications.outcome';
  end if;
  if target_error is not null and target_error !~ '^[a-z0-9_]{1,40}$' then
    raise exception 'an error is a short code' using errcode = '22023', hint = 'notifications.error_code';
  end if;
  if target_provider_id is not null and char_length(target_provider_id) not between 1 and 200 then
    raise exception 'a provider id is 1 to 200 characters' using errcode = '22023', hint = 'notifications.provider_id';
  end if;
  select * into found_row from public.notification_deliveries d where d.id = target_delivery and d.channel = 'email' for update;
  if not found then
    return null;
  end if;
  -- Only a row being sent is finished: a late answer never undoes what came after it.
  if found_row.status <> 'sending' then
    return found_row.status;
  end if;
  update public.notification_deliveries d set
    status = case target_outcome
      when 'sent' then 'sent'
      when 'dead' then 'dead'
      when 'released' then case when d.attempts > 1 then 'failed' else 'queued' end
      else case when d.attempts >= 5 then 'dead' else 'failed' end end,
    attempts = case when target_outcome = 'released' then greatest(d.attempts - 1, 0) else d.attempts end,
    next_attempt_at = case when target_outcome = 'retry' and d.attempts < 5
      then now() + make_interval(mins => (2 ^ (d.attempts - 1))::integer) else now() end,
    provider_message_id = case when target_outcome = 'sent' then target_provider_id else d.provider_message_id end,
    sent_at = case when target_outcome = 'sent' then now() else d.sent_at end,
    last_error = case when target_outcome = 'sent' then null when target_outcome = 'released' then d.last_error else target_error end,
    lease_expires_at = null,
    updated_at = now()
  where d.id = target_delivery
  returning d.status into found_row.status;
  return found_row.status;
end;
$$;

create function public.apply_notification_email_event_service(target_type text, target_provider_id text, target_email text,
  target_bounce_type text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_row public.notification_deliveries;
  address text := lower(btrim(coalesce(target_email, '')));
  next_status text;
  suppress text;
begin
  select * into found_row from public.notification_deliveries d
  where d.provider_message_id = target_provider_id and d.channel = 'email' for update;
  if not found then
    return 'ignored';
  end if;
  case target_type
    when 'email.delivered' then
      if found_row.status <> 'sent' then
        return found_row.status;
      end if;
      next_status := 'delivered';
    when 'email.bounced' then
      if coalesce(target_bounce_type, '') <> 'Permanent' then
        return 'ignored';
      end if;
      next_status := 'bounced';
      suppress := 'bounce';
    when 'email.complained' then
      next_status := 'complained';
      suppress := 'complaint';
    when 'email.suppressed' then
      next_status := 'suppressed';
      suppress := 'bounce';
    when 'email.failed' then
      next_status := 'dead';
    else
      return 'ignored';
  end case;
  update public.notification_deliveries set status = next_status,
    delivered_at = case when next_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
    last_error = case when next_status = 'dead' then 'provider_failed' else last_error end,
    updated_at = now()
  where id = found_row.id;
  if suppress is not null and address ~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    insert into public.notification_email_suppressions (email, reason) values (address, suppress)
    on conflict (email) do update set reason = excluded.reason, suppressed_at = now(), cleared_at = null;
  end if;
  return next_status;
end;
$$;

revoke all on function public.claim_notification_emails_service(integer) from public, anon, authenticated;
revoke all on function public.finish_notification_email_service(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.apply_notification_email_event_service(text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_notification_emails_service(integer) to service_role;
grant execute on function public.finish_notification_email_service(uuid, text, text, text) to service_role;
grant execute on function public.apply_notification_email_event_service(text, text, text, text) to service_role;

-- Every minute, through the dispatcher of the other cron routes; a database without its Vault secrets
-- (local, CI) stays quiet.
select cron.unschedule(jobid) from cron.job where jobname = 'notification-email';
select cron.schedule('notification-email', '* * * * *',
  $$select app_private.dispatch_cron_endpoint('/api/internal/cron/notification-email');$$);
