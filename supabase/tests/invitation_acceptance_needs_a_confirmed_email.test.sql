begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- SEC-003 #9 (BL-274, user S2 (a)): an invitation is accepted only by an
-- account whose email address is confirmed, through the emailed link (token)
-- and from Account > Workspaces (id) alike. Somebody who signs up with Ali's
-- address without reaching Ali's inbox cannot take Ali's place in the team.

-- What one statement answers: 'allowed', or the refusal as '<sqlstate> <hint>'.
create function pg_temp.refusal(statement text) returns text
language plpgsql as $$
declare
  state text;
  hint text;
begin
  execute statement;
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate, hint = pg_exception_hint;
  return state || coalesce(' ' || nullif(hint, ''), '');
end;
$$;

select tests.world('iv');

-- An employee record with an invitation to the person's address; the token is
-- the one the email carries.
create temporary table invited (person text primary key, invitation_id uuid, token text);
create function pg_temp.invite(person text) returns void language plpgsql as $$
declare
  user_id uuid := tests.new_user('iv:' || person, initcap(person) || ' Person');
  created jsonb;
begin
  created := public.create_employee_command_service(
    tests.user('iv:owner'), tests.id('iv'), gen_random_uuid(),
    jsonb_build_object(
      'first_name', initcap(person), 'middle_name', '', 'last_name', 'Person', 'preferred_name', '',
      'invitation_email', (select u.email from auth.users u where u.id = user_id),
      'start_date', '', 'internal_note', '',
      'location_ids', jsonb_build_array(tests.id('iv:K')), 'primary_location_id', tests.id('iv:K'),
      'job_ids', jsonb_build_array(tests.id('iv:job:cook')), 'primary_job_id', tests.id('iv:job:cook'),
      'is_remote', false, 'is_excluded_from_schedule', false, 'expected_revision', null),
    (select r.id from public.workspace_roles r where r.workspace_id = tests.id('iv') and r.system_key = 'employee'));
  insert into invited values (person, (created ->> 'invitation_id')::uuid, created ->> 'token');
end;
$$;
create function pg_temp.by_token(person text, holder text default null) returns text language sql as $$
  select pg_temp.refusal(format('select public.accept_employee_invitation_service(%L, %L)',
    tests.user('iv:' || coalesce(holder, person)),
    encode(extensions.digest((select token from invited where invited.person = by_token.person), 'sha256'), 'hex')))
$$;
create function pg_temp.by_id(person text, holder text default null) returns text language sql as $$
  select pg_temp.refusal(format('select public.accept_employee_invitation_by_id_service(%L, %L)',
    tests.user('iv:' || coalesce(holder, person)), (select invitation_id from invited where invited.person = by_id.person)))
$$;
create function pg_temp.member(person text) returns boolean language sql as $$
  select exists (select 1 from public.workspace_memberships m
    where m.workspace_id = tests.id('iv') and m.user_id = tests.user('iv:' || person))
$$;

create function pg_temp.listed(person text) returns integer language sql as $$
  select count(*)::integer from public.list_pending_employee_invitations_for_account_service(tests.user('iv:' || person))
$$;
create function pg_temp.counted(person text) returns integer language sql as $$
  select workspaces from public.count_account_attention_service(tests.user('iv:' || person))
$$;
create function pg_temp.decline(person text) returns text language sql as $$
  select pg_temp.refusal(format('select public.decline_employee_invitation_service(%L, %L)',
    tests.user('iv:' || person), (select invitation_id from invited where invited.person = decline.person)))
$$;

select pg_temp.invite('ali');
select pg_temp.invite('bora');
select pg_temp.invite('cem');
-- Ali's and Cem's accounts were opened with their addresses, but nobody has
-- confirmed them.
update auth.users set email_confirmed_at = null where id in (tests.user('iv:ali'), tests.user('iv:cem'));

-- An unconfirmed account does not see the invitation, count it, or decline it.
select is(pg_temp.listed('ali'), 0, 'an unconfirmed account sees no invitation in Account > Workspaces');
select is(pg_temp.counted('ali'), 0, 'nor counts it among what waits for them');
select is(pg_temp.decline('cem'), '42501 authz.not_active', 'nor can decline it');
select is((select status::text from public.employee_invitations where id = (select invitation_id from invited where person = 'cem')),
  'pending', 'so the invitation stays open for the real owner of the address');

select is(pg_temp.by_token('ali'), '42501 authz.not_active',
  'an unconfirmed account cannot accept through the emailed link');
select is(pg_temp.by_id('ali'), '42501 authz.not_active',
  'nor from Account > Workspaces');
select ok(not pg_temp.member('ali'), 'and joins nothing by trying');

-- Somebody else's invitation stays somebody else's, confirmed or not.
select is(pg_temp.by_id('ali', 'bora'), '42501',
  'a confirmed account cannot accept an invitation to another address');

-- Once the address is confirmed, both ways work.
update auth.users set email_confirmed_at = now() where id in (tests.user('iv:ali'), tests.user('iv:cem'));
select is(pg_temp.listed('ali'), 1, 'a confirmed account sees the invitation');
select is(pg_temp.counted('ali'), 1, 'and counts it');
select is(pg_temp.decline('cem'), 'allowed', 'and can decline one');
select is(pg_temp.by_id('ali'), 'allowed', 'a confirmed account accepts from Account > Workspaces');
select is(pg_temp.by_token('bora'), 'allowed', 'and through the emailed link');
select ok(pg_temp.member('ali') and pg_temp.member('bora'), 'both joined');

select * from finish();
rollback;
