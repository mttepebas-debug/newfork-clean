begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- G5 (BL-283, BL-162, BL-279 (3), KK-11). Ayse's password is checked in the
-- database, per account: five wrong guesses lock only her checks for fifteen
-- minutes. A reset email goes at most once per fifteen minutes per address,
-- ten per caller an hour. A recovery link is replaced at most once per
-- fifteen minutes, so the valid one in the inbox keeps working.

select tests.new_user('pw:ayse', 'Ayse Person');
select tests.new_user('pw:can', 'Can Person');
update auth.users
set encrypted_password = extensions.crypt('Correct horse 1', extensions.gen_salt('bf'))
where id in (tests.user('pw:ayse'), tests.user('pw:can'));

create function pg_temp.check(label text, candidate text) returns jsonb language sql as $$
  select public.verify_account_password_service(tests.user(label), candidate)
$$;

select is(pg_temp.check('pw:ayse', 'Correct horse 1')->>'result', 'ok', 'the right password is ok');
select is(
  array(select pg_temp.check('pw:ayse', 'guess ' || n)->>'result' from generate_series(1, 5) n),
  array['incorrect', 'incorrect', 'incorrect', 'incorrect', 'incorrect'],
  'five wrong guesses are each incorrect');
select is(pg_temp.check('pw:ayse', 'Correct horse 1')->>'result', 'locked', 'then even the right password is locked out');
select ok((pg_temp.check('pw:ayse', 'x')->>'retry_after_seconds')::integer between 1 and 900, 'and the answer says when to try again');
select is(pg_temp.check('pw:can', 'Correct horse 1')->>'result', 'ok', 'another account is not locked by Ayse''s guesses');

update app_private.account_throttle_events set at = at - interval '16 minutes'
where kind = 'password_failure' and key_digest = tests.user('pw:ayse')::text;
select is(pg_temp.check('pw:ayse', 'Correct horse 1')->>'result', 'ok', 'fifteen minutes later the right password works');
select is(
  (select count(*)::integer from app_private.account_throttle_events
   where kind = 'password_failure' and key_digest = tests.user('pw:ayse')::text),
  0, 'and the count starts over');

create function pg_temp.claim(email text, address text) returns text language sql as $$
  select public.claim_password_reset_send_service(
    encode(extensions.digest(email, 'sha256'), 'hex'), encode(extensions.digest(address, 'sha256'), 'hex'))
$$;
select is(pg_temp.claim('ayse@example.test', '203.0.113.7'), 'send', 'the first reset email goes');
select is(pg_temp.claim('ayse@example.test', '203.0.113.8'), 'quiet', 'a second one within fifteen minutes does not');
select is(
  array(select pg_temp.claim('person' || n || '@example.test', '198.51.100.1') from generate_series(1, 11) n),
  array['send','send','send','send','send','send','send','send','send','send','address_limited'],
  'one caller gets ten an hour, then is refused');

-- A pending deletion for Can, whose link was sent just now.
insert into public.account_deletion_requests (user_id, typed_email, acknowledged, recovery_token_digest, recovery_token_rotated_at)
values (tests.user('pw:can'), (select email from auth.users where id = tests.user('pw:can')), true, repeat('a', 64), now());
create function pg_temp.resend() returns jsonb language sql as $$
  select public.prepare_account_deletion_recovery_resend_service(
    (select email from auth.users where id = tests.user('pw:can')), repeat('b', 64))
$$;
select is(pg_temp.resend(), null, 'a resend within fifteen minutes sends nothing');
select is(
  (select recovery_token_digest from public.account_deletion_requests where user_id = tests.user('pw:can')),
  repeat('a', 64), 'and the link in the inbox stays valid');
update public.account_deletion_requests set recovery_token_rotated_at = now() - interval '16 minutes'
where user_id = tests.user('pw:can');
select is(pg_temp.resend()->>'user_id', tests.user('pw:can')::text, 'after fifteen minutes a new link goes');
select is(
  (select recovery_token_digest from public.account_deletion_requests where user_id = tests.user('pw:can')),
  repeat('b', 64), 'and it replaces the old one');

-- G5 review: one caller may ask for recovery resends ten times an hour.
select is(
  array(select public.claim_account_recovery_resend_service(encode(extensions.digest('198.51.100.9', 'sha256'), 'hex'))
        from generate_series(1, 11)),
  array[true, true, true, true, true, true, true, true, true, true, false],
  'one caller gets ten recovery resends an hour, then is refused');

select * from finish();
rollback;
