begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Sending an invitation again (BL-767, BL-922; KARARLAR Employees S2, S-86 K7).
-- Send reminder: the same link again, the expiry unchanged, whether or not the
-- first email went out. Resend: a new invitation; the old email's link says a
-- newer one was sent instead of "withdrawn".

select tests.world('r');
select tests.person('r', 'ali', 'employee', array['K'], array['cook'], 'pending');
select tests.person('r', 'eda', 'employee', array['K'], array['cook'], 'pending');

create function pg_temp.owner() returns uuid language sql as $$ select tests.user('r:owner') $$;
create function pg_temp.first_token(person text) returns text language sql as $$
  select c.invitation_token from public.employee_create_commands c
  where c.invitation_id = tests.id('r:' || person || ':invitation')
$$;
create function pg_temp.preview(token text) returns text language sql as $$
  select public.preview_employee_invitation_service(encode(extensions.digest(token, 'sha256'), 'hex')) ->> 'state'
$$;
create function pg_temp.reminder(person text) returns jsonb language sql as $$
  select public.load_employee_invitation_retry_service(pg_temp.owner(), tests.id('r'), tests.id('r:' || person))
$$;
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare
  code text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics code = returned_sqlstate;
  return code;
end;
$$;

-- What the API does after preparing an invitation: keep its token, send it,
-- mark it sent.
select public.store_employee_invitation_delivery_secret_service(
  pg_temp.owner(), tests.id('r'), tests.id('r:ali:invitation'), pg_temp.first_token('ali'));
select public.mark_employee_invitation_delivery_service(
  pg_temp.owner(), tests.id('r'), tests.id('r:ali:invitation'), 'sent');
create temp table ali_before as
  select i.expires_at, i.token_hash from public.employee_invitations i where i.id = tests.id('r:ali:invitation');

-- Send reminder on an invitation whose email went out (BL-767: it was refused
-- with "failed invitation not found" every time).
create temp table first_reminder as select pg_temp.reminder('ali') as answer;
select is((select answer ->> 'id' from first_reminder), tests.id('r:ali:invitation')::text,
  'a reminder answers the invitation whose email went out');
select is((select answer ->> 'token' from first_reminder), pg_temp.first_token('ali'),
  'with the same link');
select is((select (answer ->> 'expires_at')::timestamptz from first_reminder), (select expires_at from ali_before),
  'and the same expiry');
select is((select (answer ->> 'reminder')::boolean from first_reminder), true,
  'it says it is a reminder, so the email says so');
select is((select (answer ->> 'attempt')::integer from first_reminder), 1, 'and numbers its email');
select is((select (pg_temp.reminder('ali') ->> 'attempt')::integer), 2,
  'the next reminder gets the next number, so the provider does not drop it as a duplicate');
select ok(
  (select i.status = 'pending' and i.expires_at = b.expires_at and i.token_hash = b.token_hash
   from public.employee_invitations i, ali_before b where i.id = tests.id('r:ali:invitation')),
  'reminders leave the invitation waiting, its expiry and its link as they were'
);
select is(
  (select count(*)::integer from public.employee_events e
   where e.employee_id = tests.id('r:ali') and e.action = 'employee.invitation_reminder_started'),
  2, 'each reminder is in the person''s history as a reminder'
);
select is(pg_temp.preview(pg_temp.first_token('ali')), 'valid', 'the link still opens the invitation');

-- A first email that failed is sent again as it was, not as a reminder.
select public.mark_employee_invitation_delivery_service(
  pg_temp.owner(), tests.id('r'), tests.id('r:ali:invitation'), 'failed', 'bounced');
select is((select (pg_temp.reminder('ali') ->> 'reminder')::boolean), false,
  'a failed first email is retried, not reminded');
select is(
  (select count(*)::integer from public.employee_events e
   where e.employee_id = tests.id('r:ali') and e.action = 'employee.invitation_delivery_retry_started'),
  1, 'and its history says retry'
);

-- An invitation past its expiry is not reminded: Resend opens a new one.
update public.employee_invitations set expires_at = now() - interval '1 minute'
where id = tests.id('r:ali:invitation');
select is(pg_temp.refusal(format('select public.load_employee_invitation_retry_service(%L, %L, %L)',
    pg_temp.owner(), tests.id('r'), tests.id('r:ali'))),
  '22023', 'an expired invitation is not reminded');
update public.employee_invitations set expires_at = (select expires_at from ali_before)
where id = tests.id('r:ali:invitation');

-- Resend (BL-922): the old email's link says a newer invitation went out.
select public.prepare_employee_invitation_service(
  pg_temp.owner(), tests.id('r'), tests.id('r:ali'),
  (select i.email from public.employee_invitations i where i.id = tests.id('r:ali:invitation')),
  (select r.id from public.workspace_roles r where r.workspace_id = tests.id('r') and r.system_key = 'employee'), null, '{}'::uuid[],
  encode(extensions.digest('ali-second-link', 'sha256'), 'hex'),
  now() + interval '7 days');
select is((select i.status::text from public.employee_invitations i where i.id = tests.id('r:ali:invitation')),
  'revoked', 'Resend takes the old invitation back');
select is(pg_temp.preview(pg_temp.first_token('ali')), 'replaced',
  'and its link says a newer invitation was sent, not that it was withdrawn');
select is(pg_temp.preview('ali-second-link'), 'valid', 'the newer link opens the invitation');

-- Taking the newer one back as well leaves nothing newer to point to.
select public.revoke_employee_invitation_service(pg_temp.owner(), tests.id('r'), tests.id('r:ali'));
select is(pg_temp.preview(pg_temp.first_token('ali')), 'revoked',
  'with no invitation waiting, the old link says withdrawn');
select is(pg_temp.preview('ali-second-link'), 'revoked', 'and so does the newer one');
select is(pg_temp.refusal(format('select public.load_employee_invitation_retry_service(%L, %L, %L)',
    pg_temp.owner(), tests.id('r'), tests.id('r:ali'))),
  'P0002', 'nobody is reminded when no invitation waits');

-- A newer invitation to another address is not this person's newer email.
select public.prepare_employee_invitation_service(
  pg_temp.owner(), tests.id('r'), tests.id('r:eda'), 'eda.elsewhere@world.test',
  (select r.id from public.workspace_roles r where r.workspace_id = tests.id('r') and r.system_key = 'employee'), null, '{}'::uuid[],
  encode(extensions.digest('eda-second-link', 'sha256'), 'hex'),
  now() + interval '7 days');
select is(pg_temp.preview(pg_temp.first_token('eda')), 'revoked',
  'an old link whose newer invitation went to another address says withdrawn');
select is(pg_temp.preview('eda-second-link'), 'valid', 'the new address''s link opens');

select * from finish();
rollback;
