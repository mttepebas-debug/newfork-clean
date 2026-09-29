-- G5 (BL-283, BL-162, BL-279 (3), KK-11): password checks and account emails
-- are counted in the database, per account, not per server instance.
--
-- Before: the API proved a password by signing in to Supabase Auth from its
-- own server. Every user's check left from one address and drew on one
-- bucket (30 per 5 minutes): one person typing wrong passwords blocked
-- everyone's password-gated actions, and a stolen session could guess about
-- 8,600 passwords a day. The "Forgot password?" limit lived in each server
-- instance's memory. Anyone who knew an email could resend its account
-- recovery link without limit, and each resend replaced the valid link.
--
-- After:
-- * verify_account_password_service checks the password against the stored
--   hash, here, without Auth's shared bucket. Five wrong passwords in fifteen
--   minutes lock that one account's password checks until the oldest of them
--   is fifteen minutes old; a right password clears the count.
-- * claim_password_reset_send_service answers whether a reset email may go:
--   one per email address every fifteen minutes (a quiet "no": the link
--   already sent stays valid), ten per caller address an hour (429).
-- * prepare_account_deletion_recovery_resend_service sends at most one new
--   recovery link per fifteen minutes; inside that window the valid link is
--   left alone. claim_account_recovery_resend_service gives one caller ten
--   resend requests an hour.
--
-- Example: someone who knows Ayse's email asks for her reset link ten times
-- in a minute. One email goes out; the link in it keeps working.

create table app_private.account_throttle_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('password_failure', 'password_reset_email', 'password_reset_address', 'recovery_resend_address')),
  -- A user id for password failures; a sha256 hex digest of the email or the
  -- caller address otherwise, so neither is stored.
  key_digest text not null,
  at timestamptz not null default now()
);
create index account_throttle_events_lookup
  on app_private.account_throttle_events (kind, key_digest, at desc);
create index account_throttle_events_age on app_private.account_throttle_events (at);
revoke all on table app_private.account_throttle_events from public, anon, authenticated, service_role;

create function public.verify_account_password_service(
  target_user_id uuid,
  candidate_password text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  window_start timestamptz := now() - interval '15 minutes';
  failures integer;
  oldest timestamptz;
  stored text;
begin
  -- One check at a time per account, so parallel guesses cannot all slip
  -- under the limit.
  perform pg_advisory_xact_lock(hashtextextended('password_failure:' || target_user_id::text, 0));
  delete from app_private.account_throttle_events e where e.at < now() - interval '1 day';

  select count(*), min(e.at) into failures, oldest
  from app_private.account_throttle_events e
  where e.kind = 'password_failure'
    and e.key_digest = target_user_id::text
    and e.at > window_start;
  if failures >= 5 then
    return jsonb_build_object(
      'result', 'locked',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (oldest + interval '15 minutes' - now()))))::integer
    );
  end if;

  select u.encrypted_password into stored from auth.users u where u.id = target_user_id;
  if coalesce(stored, '') <> ''
    and extensions.crypt(coalesce(candidate_password, ''), stored) = stored then
    delete from app_private.account_throttle_events e
    where e.kind = 'password_failure' and e.key_digest = target_user_id::text;
    return jsonb_build_object('result', 'ok');
  end if;

  insert into app_private.account_throttle_events (kind, key_digest)
  values ('password_failure', target_user_id::text);
  return jsonb_build_object('result', 'incorrect');
end;
$$;
revoke all on function public.verify_account_password_service(uuid, text) from public, anon, authenticated;
grant execute on function public.verify_account_password_service(uuid, text) to service_role;

create function public.claim_password_reset_send_service(
  email_digest text,
  address_digest text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if email_digest !~ '^[a-f0-9]{64}$' or address_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'valid digests required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('password_reset:' || email_digest, 0));
  delete from app_private.account_throttle_events e where e.at < now() - interval '1 day';

  if (select count(*) from app_private.account_throttle_events e
      where e.kind = 'password_reset_address' and e.key_digest = address_digest
        and e.at > now() - interval '1 hour') >= 10 then
    return 'address_limited';
  end if;
  insert into app_private.account_throttle_events (kind, key_digest)
  values ('password_reset_address', address_digest);

  if exists (select 1 from app_private.account_throttle_events e
      where e.kind = 'password_reset_email' and e.key_digest = email_digest
        and e.at > now() - interval '15 minutes') then
    return 'quiet';
  end if;
  insert into app_private.account_throttle_events (kind, key_digest)
  values ('password_reset_email', email_digest);
  return 'send';
end;
$$;
revoke all on function public.claim_password_reset_send_service(text, text) from public, anon, authenticated;
grant execute on function public.claim_password_reset_send_service(text, text) to service_role;

create function public.claim_account_recovery_resend_service(address_digest text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if address_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'valid digest required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('recovery_resend:' || address_digest, 0));
  delete from app_private.account_throttle_events e where e.at < now() - interval '1 day';
  if (select count(*) from app_private.account_throttle_events e
      where e.kind = 'recovery_resend_address' and e.key_digest = address_digest
        and e.at > now() - interval '1 hour') >= 10 then
    return false;
  end if;
  insert into app_private.account_throttle_events (kind, key_digest)
  values ('recovery_resend_address', address_digest);
  return true;
end;
$$;
revoke all on function public.claim_account_recovery_resend_service(text) from public, anon, authenticated;
grant execute on function public.claim_account_recovery_resend_service(text) to service_role;

create or replace function public.prepare_account_deletion_recovery_resend_service(account_email text, recovery_token_digest text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  target_request public.account_deletion_requests%rowtype;
  normalized_email text := lower(btrim(coalesce(account_email, '')));
begin
  if recovery_token_digest is null
    or recovery_token_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'valid recovery token digest required' using errcode = '22023';
  end if;

  select request.* into target_request
  from public.account_deletion_requests request
  join auth.users auth_user on auth_user.id = request.user_id
  where request.status = 'pending'
    and request.restore_until > now()
    and lower(btrim(auth_user.email)) = normalized_email
  order by request.requested_at desc
  limit 1
  for update of request;

  if target_request.id is null then
    return null;
  end if;

  -- KK-11: at most one new link per fifteen minutes; the link already in the
  -- inbox stays valid until then.
  if target_request.recovery_token_rotated_at > now() - interval '15 minutes' then
    return null;
  end if;

  update public.account_deletion_requests
  set recovery_token_digest = prepare_account_deletion_recovery_resend_service.recovery_token_digest,
      recovery_token_rotated_at = now(),
      updated_at = now()
  where id = target_request.id;

  return jsonb_build_object(
    'request_id', target_request.id,
    'user_id', target_request.user_id,
    'email', normalized_email,
    'restore_until', target_request.restore_until
  );
end;
$function$;
