begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Notification panel, slice 2, people (KARARLAR S-247 (3)): when a request closes, every card it opened is
-- updated for whoever got it, with the outcome and who closed it; nothing is deleted; read state stays each
-- person's own.
--   (a) leaving onboarding closes the cards that onboarding opened: the reviewers' "ready for review" and
--       the person's own "needs a change", as Withdrawn by the person who left; a card already closed keeps
--       its outcome; somebody else's onboarding and another workspace keep theirs open;
--   (b) an ownership transfer nobody answered in time closes its "asked" card as Expired, by nobody, when
--       either side next lists their workspaces; answering it late still refuses and changes nothing; a
--       cancel afterwards leaves the card Expired; a transfer still in time, or one of another workspace,
--       stays open;
--   (c) the work outlives its notices: with the card closer down, leaving and listing still work.

select tests.world('lp');
select tests.world('lq');
select tests.person('lp', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('lp', 'ali', 'employee', array['K'], array['cook'], 'onboarding');
select tests.person('lp', 'emre', 'employee', array['K'], array['cook'], 'onboarding');
select tests.person('lp', 'pia', 'employee', array['K'], array['cook'], 'onboarding');
select tests.person('lp', 'can', 'employee', array['K'], array['cook'], 'onboarding');
select tests.person('lq', 'lena', 'admin', array['K'], array['server']);
select tests.person('lq', 'lia', 'employee', array['K'], array['cook'], 'onboarding');

create temp table who as select label, tests.user(label) uid
from unnest(array['lp:owner', 'lp:zeynep', 'lp:ali', 'lp:emre', 'lp:pia', 'lp:can', 'lq:owner', 'lq:lena', 'lq:lia']) label;

-- Every card about one subject, one line each: whose, what, its state (who closed it), read, seen.
create function pg_temp.cards(subject uuid) returns text[] language sql stable as $$
  select coalesce(array_agg(w.label || ' ' || replace(n.type_key, 'people.', '') || ' '
      || coalesce(n.resolution || ' by ' || coalesce(b.label, 'nobody'), 'open')
      || case when n.read_at is null then ' unread' else ' read' end
      || case when n.seen_at is null then ' unseen' else ' seen' end
    order by w.label collate "C", n.type_key collate "C"), '{}')
  from public.person_notifications n
  join who w on w.uid = n.user_id
  left join who b on b.uid = n.resolved_by
  where n.subject_id = subject
$$;
create function pg_temp.case_of(person text) returns public.employee_onboarding_cases language sql stable as $$
  select c from public.employee_onboarding_cases c where c.employee_id = tests.id(person)
$$;
-- The person sends their onboarding in with a legal name other than the invited one: it waits for review.
create function pg_temp.sends(person text, legal_first text) returns integer language plpgsql as $$
begin
  perform public.save_employee_onboarding_profile_service(tests.user(person), jsonb_build_object(
      'legal_first_name', legal_first, 'legal_last_name', 'Person', 'phone', tests.phone(person),
      'emergency_contact_name', 'Contact', 'emergency_contact_relationship', 'Friend', 'emergency_contact_phone', '+14155550100'),
    (pg_temp.case_of(person)).revision, (pg_temp.case_of(person)).workspace_id);
  return public.submit_employee_onboarding_service(tests.user(person), (pg_temp.case_of(person)).revision,
    (pg_temp.case_of(person)).workspace_id);
end $$;
create function pg_temp.leaves(person text) returns jsonb language sql as $$
  select public.leave_employee_onboarding_service(tests.user(person), (pg_temp.case_of(person)).revision,
    (pg_temp.case_of(person)).workspace_id)
$$;
-- Somebody opens their workspaces (Account > Workspaces). The service sets the request's user for the rest of
-- the transaction; it is put back so later calls are not read as that person.
create function pg_temp.lists(person text) returns integer language plpgsql as $$
declare
  before text := current_setting('request.jwt.claim.sub', true);
  listed integer;
begin
  select count(*)::integer into listed from public.list_my_workspaces_service(tests.user(person));
  perform set_config('request.jwt.claim.sub', coalesce(before, ''), true);
  return listed;
end $$;
create function pg_temp.offer(w text, target text) returns uuid language sql as $$
  select (public.initiate_workspace_ownership_transfer_service(tests.user(w || ':owner'), tests.id(w), tests.user(w || ':' || target))
    ->> 'transfer_id')::uuid
$$;

-- (a) Leaving onboarding ------------------------------------------------------------------------------------

select pg_temp.sends('lp:ali', 'Alican');
select pg_temp.sends('lp:emre', 'Emrah');
select pg_temp.sends('lp:pia', 'Pina');
select pg_temp.sends('lq:lia', 'Liana');
-- Emre is asked for a change: the reviewers' cards close as Changes requested, his own opens.
select public.review_employee_onboarding_service(tests.user('lp:owner'), tests.id('lp'), tests.id('lp:emre'), 'reject_requirement',
  (select r.id from public.employee_onboarding_requirements r where r.case_id = (pg_temp.case_of('lp:emre')).id and r.kind = 'profile'),
  'Use the name on your ID', (pg_temp.case_of('lp:emre')).revision, true);
-- ponytail: the owner opened his card on Ali and Zeynep only saw hers in the list (as the panel marks them).
update public.person_notifications set read_at = now(), seen_at = now()
where subject_id = (pg_temp.case_of('lp:ali')).id and user_id = tests.user('lp:owner');
update public.person_notifications set seen_at = now()
where subject_id = (pg_temp.case_of('lp:ali')).id and user_id = tests.user('lp:zeynep');

select is(pg_temp.cards((pg_temp.case_of('lp:ali')).id),
  array['lp:owner onboarding_review_needed open read seen', 'lp:zeynep onboarding_review_needed open unread seen'],
  '(a) Ali''s changed legal name waits for the owner (who read it) and Zeynep (who only saw it)');

select is(pg_temp.leaves('lp:ali') ->> 'status', 'left', '(a) Ali leaves his onboarding');
select is(pg_temp.cards((pg_temp.case_of('lp:ali')).id),
  array['lp:owner onboarding_review_needed withdrawn by lp:ali read seen',
        'lp:zeynep onboarding_review_needed withdrawn by lp:ali unread seen'],
  '(a) both reviewers'' cards read Withdrawn by Ali; the owner''s stays read, Zeynep''s stays unread');
select is((select count(*)::integer from public.person_notifications n
           where n.subject_id = (pg_temp.case_of('lp:ali')).id and n.resolved_at = now()), 2,
  '(a) closed now, not deleted');

select is(pg_temp.leaves('lp:emre') ->> 'status', 'left', '(a) Emre, asked for a change, leaves instead');
-- His own card's read state is the card closer's (the person who closed it reads it); not asserted here.
select is((select n.resolution || ' by ' || w.label from public.person_notifications n join who w on w.uid = n.resolved_by
           where n.type_key = 'people.onboarding_change_requested' and n.user_id = tests.user('lp:emre')),
  'withdrawn by lp:emre', '(a) his own "needs a change" card reads Withdrawn, closed by him');
select is((select array_agg(w.label || ' ' || n.resolution || ' by ' || b.label order by w.label collate "C")
           from public.person_notifications n join who w on w.uid = n.user_id join who b on b.uid = n.resolved_by
           where n.type_key = 'people.onboarding_review_needed' and n.subject_id = (pg_temp.case_of('lp:emre')).id),
  array['lp:owner changes_requested by lp:owner', 'lp:zeynep changes_requested by lp:owner'],
  '(a) the reviewers'' cards closed before keep their outcome: Changes requested by the owner');

select is(pg_temp.cards((pg_temp.case_of('lp:pia')).id),
  array['lp:owner onboarding_review_needed open unread unseen', 'lp:zeynep onboarding_review_needed open unread unseen'],
  '(a) Pia, still onboarding, keeps her reviewers'' cards open');
select is(pg_temp.cards((pg_temp.case_of('lq:lia')).id),
  array['lq:lena onboarding_review_needed open unread unseen', 'lq:owner onboarding_review_needed open unread unseen'],
  '(a) another workspace''s cards (its owner''s and its admin Lena''s) stay as they were');

-- (b) An ownership transfer nobody answered in time ---------------------------------------------------------

create temp table offers (step text, id uuid);
insert into offers select 'late', pg_temp.offer('lp', 'zeynep');
select is(pg_temp.cards((select id from offers where step = 'late')),
  array['lp:zeynep ownership_transfer_requested open unread unseen'], '(b) the owner asks Zeynep to become the owner');
-- ponytail: a week passes; the transfer's deadline is moved into the past by hand. Zeynep saw the card.
update public.workspace_ownership_transfers set expires_at = now() - interval '1 minute' where id = (select id from offers where step = 'late');
update public.person_notifications set seen_at = now() where subject_id = (select id from offers where step = 'late');

select throws_ok(format('select public.respond_workspace_ownership_transfer_service(%L, %L, %L, %L)',
    tests.user('lp:zeynep'), tests.id('lp'), (select id from offers where step = 'late'), 'accept'),
  '23514', 'ownership transfer has expired', '(b) Zeynep answers too late: refused');
select is(pg_temp.cards((select id from offers where step = 'late')),
  array['lp:zeynep ownership_transfer_requested open unread seen'], '(b) the refusal changes nothing, her card too');

select cmp_ok(pg_temp.lists('lp:zeynep'), '>=', 1, '(b) Zeynep opens her workspaces');
select is(pg_temp.cards((select id from offers where step = 'late')),
  array['lp:zeynep ownership_transfer_requested expired by nobody unread seen'],
  '(b) her card reads Expired, closed by nobody; still unread, still seen');
select is((select t.status::text from public.workspace_ownership_transfers t where t.id = (select id from offers where step = 'late')),
  'pending', '(b) the transfer itself is left for its sender to cancel');

select public.cancel_workspace_ownership_transfer_service(tests.user('lp:owner'), tests.id('lp'), (select id from offers where step = 'late'));
select is(pg_temp.cards((select id from offers where step = 'late')),
  array['lp:zeynep ownership_transfer_answered open unread unseen',
        'lp:zeynep ownership_transfer_requested expired by nobody unread seen'],
  '(b) the owner cancels it afterwards: Zeynep hears it, and her asked card still reads Expired');

-- Asked again and late again: this time the owner, who sent it, opens his workspaces first.
insert into offers select 'sender', pg_temp.offer('lp', 'zeynep');
update public.workspace_ownership_transfers set expires_at = now() - interval '1 minute' where id = (select id from offers where step = 'sender');
-- Lena's transfer in another workspace is late too.
insert into offers select 'elsewhere', pg_temp.offer('lq', 'lena');
update public.workspace_ownership_transfers set expires_at = now() - interval '1 minute' where id = (select id from offers where step = 'elsewhere');
select pg_temp.lists('lp:owner');
select is(pg_temp.cards((select id from offers where step = 'sender')),
  array['lp:zeynep ownership_transfer_requested expired by nobody unread unseen'],
  '(b) the sender lists his workspaces: Zeynep''s card reads Expired; her read state is hers, untouched');
select is(pg_temp.cards((select id from offers where step = 'elsewhere')),
  array['lq:lena ownership_transfer_requested open unread unseen'],
  '(b) another workspace''s late transfer is not closed by people who are not part of it');
select pg_temp.lists('lq:lena');
select is(pg_temp.cards((select id from offers where step = 'elsewhere')),
  array['lq:lena ownership_transfer_requested expired by nobody unread unseen'], '(b) its own side closes it');
select public.cancel_workspace_ownership_transfer_service(tests.user('lp:owner'), tests.id('lp'), (select id from offers where step = 'sender'));

-- A transfer still in time stays open whoever lists.
insert into offers select 'in_time', pg_temp.offer('lp', 'zeynep');
select pg_temp.lists('lp:zeynep');
select pg_temp.lists('lp:owner');
select is(pg_temp.cards((select id from offers where step = 'in_time')),
  array['lp:zeynep ownership_transfer_requested open unread unseen'], '(b) a transfer still in time stays open');
select public.cancel_workspace_ownership_transfer_service(tests.user('lp:owner'), tests.id('lp'), (select id from offers where step = 'in_time'));

-- (c) The work outlives its notices -------------------------------------------------------------------------

create temp table saved_closer as
select pg_get_functiondef('app_private.notification_resolve(uuid, text, uuid, text, uuid)'::regprocedure) def;
create or replace function app_private.notification_resolve(target_workspace uuid, target_subject_type text, target_subject_id uuid,
  target_resolution text, target_resolved_by uuid)
returns integer language plpgsql set search_path = '' as $$ begin raise exception 'closing is down'; end $$;
insert into offers select 'down', pg_temp.offer('lp', 'zeynep');
update public.workspace_ownership_transfers set expires_at = now() - interval '1 minute' where id = (select id from offers where step = 'down');
select is(pg_temp.leaves('lp:can') ->> 'status', 'left', '(c) with the card closer down, Can still leaves his onboarding');
select cmp_ok(pg_temp.lists('lp:zeynep'), '>=', 1, '(c) and Zeynep''s workspaces still list');
do $$ begin execute (select def from saved_closer); end $$;

select * from finish();
rollback;
