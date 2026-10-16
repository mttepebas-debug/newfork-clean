begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- BILDIRIM-U1 (KARARLAR S-123, S-95; docs/plan/research/BILDIRIM-URETICILER.md §2.8): the account and the
-- workspace write their own notices into the new core.
--   (a) a password change tells the person once, even with the other sessions signed out in the same go;
--       it says they were signed out only when they were (the API says which, in the audit row);
--   (b) signing out everywhere else, on its own, tells the person;
--   (c) a sign-in email change tells the person when it is asked for and when it is cancelled; a cancel
--       with nothing pending tells nobody;
--   (d) a scheduled closing tells every member but the owner who scheduled it, once; cancelling it too;
--       nobody outside the workspace, nobody whose access ended.
-- Each check: the right person, one notice, nobody else.

select tests.world('na');
select tests.world('nb');
select tests.person('na', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('na', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('na', 'ali', 'employee', array['K'], array['cook']);
select tests.person('na', 'aydan', 'employee', array['K'], array['cook'], 'onboarding');
select tests.person('na', 'pelin', 'employee', array['K'], array['cook'], 'pending');
select tests.person('na', 'sami', 'employee', array['K'], array['cook'], 'suspended');
select tests.person('na', 'remzi', 'employee', array['K'], array['cook'], 'removed');
select tests.person('nb', 'xena', 'employee', array['K'], array['cook']);

create function pg_temp.notices(type_key text) returns text[] language sql stable as $$
  select coalesce(array_agg(l.label order by l.label collate "C"), '{}')
  from public.person_notifications n
  join (select label, tests.user(label) uid
        from unnest(array['na:owner', 'na:zeynep', 'na:ayse', 'na:ali', 'na:aydan', 'na:pelin', 'na:sami', 'na:remzi',
                          'nb:owner', 'nb:xena']) label) l on l.uid = n.user_id
  where n.type_key = notices.type_key
$$;

-- (a) ---------------------------------------------------------------------------------------------

select public.record_account_security_event_service(tests.user('na:ali'), 'account.password_changed', '{"others_signed_out": true}');
select public.record_account_security_event_service(tests.user('na:ali'), 'account.sessions_revoked', '{"with_password_change": true}');
select is(pg_temp.notices('account.password_changed'), array['na:ali'],
  '(a) a password change tells the person whose password it is, nobody else');
select is(pg_temp.notices('account.signed_out_elsewhere'), '{}'::text[],
  '(a) the sessions signed out with it are not a second notice');
select is((select count(*)::integer from public.person_notifications where user_id = tests.user('na:ali')), 1,
  '(a) one notice in all');
select ok((select workspace_id is null and title = 'Your password was changed' and url = '/account/security'
                  and body = 'Your other devices were signed out. If this wasn''t you, reset your password now.'
           from public.person_notifications where type_key = 'account.password_changed'),
  '(a) it belongs to the account, not a workspace, opens Security and says the other devices were signed out');
select is((select count(*)::integer from public.notification_deliveries d
           join public.person_notifications n on n.id = d.notification_id
           where n.type_key = 'account.password_changed' and d.channel = 'email'), 1,
  '(a) it goes by email too: it is required');

-- (b) ---------------------------------------------------------------------------------------------

-- Signing the others out failed: the notice does not say they were.
select public.record_account_security_event_service(tests.user('na:zeynep'), 'account.password_changed', '{"others_signed_out": false}');
select is((select body from public.person_notifications
           where type_key = 'account.password_changed' and user_id = tests.user('na:zeynep')),
  'If this wasn''t you, reset your password now.', '(a) a password change whose sign-out failed does not claim it');
select throws_ok($$select public.record_account_security_event_service(tests.user('na:zeynep'), 'account.password_changed', '{"with_password_change": true}')$$,
  '22023', 'unsupported account security event details', '(a) each event says only its own detail');

select public.record_account_security_event_service(tests.user('na:ali'), 'account.sessions_revoked', '{"with_password_change": false}');
select is(pg_temp.notices('account.signed_out_elsewhere'), array['na:ali'],
  '(b) signing out everywhere else on its own tells the person');
select is((select count(*)::integer from public.person_notifications where type_key = 'account.signed_out_elsewhere'), 1,
  '(b) once');

-- (c) ---------------------------------------------------------------------------------------------

select public.cancel_account_email_change_service(tests.user('na:ayse'));
select is(pg_temp.notices('account.sign_in_email_changed'), '{}'::text[],
  '(c) a cancel with no change pending tells nobody');
select public.record_account_security_event_service(tests.user('na:ayse'), 'account.email_change_requested');
update auth.users set email_change = 'ayse.new@example.test' where id = tests.user('na:ayse');
select public.cancel_account_email_change_service(tests.user('na:ayse'));
select is(pg_temp.notices('account.sign_in_email_changed'), array['na:ayse', 'na:ayse'],
  '(c) the person hears when a change is asked for and when it is cancelled, nobody else');
select is(
  array(select title from public.person_notifications where type_key = 'account.sign_in_email_changed' order by title),
  array['A sign-in email change was asked for', 'Your sign-in email change was cancelled'],
  '(c) each says which');

-- (d) ---------------------------------------------------------------------------------------------

create temp table closing as
select public.request_workspace_closure_service(tests.user('na:owner'), tests.id('na'), 'scheduled_end_period', null, true) j;
select is(pg_temp.notices('workspace.closure_scheduled'), array['na:ali', 'na:aydan', 'na:ayse', 'na:zeynep'],
  '(d) a scheduled closing tells every member, not the owner who scheduled it, nor those whose access ended, nor another workspace');
select is((select count(*)::integer from public.person_notifications where user_id = tests.user('na:pelin')), 0,
  '(d) nor Pelin, invited and not joined');
select is((select count(*)::integer from public.person_notifications
           where type_key = 'workspace.closure_scheduled' and user_id = tests.user('na:ali')), 1,
  '(d) one notice each');
select ok((select title = 'World na is closing' and url = '/account/workspaces' and workspace_id = tests.id('na')
                  and data ->> 'closure_request_id' = (select j ->> 'closure_request_id' from closing)
           from public.person_notifications
           where type_key = 'workspace.closure_scheduled' and user_id = tests.user('na:ali')),
  '(d) it names the workspace and opens Workspaces');
select public.cancel_workspace_closure_service(tests.user('na:owner'), tests.id('na'));
select is(pg_temp.notices('workspace.closure_scheduled'),
  array['na:ali', 'na:ali', 'na:aydan', 'na:aydan', 'na:ayse', 'na:ayse', 'na:zeynep', 'na:zeynep'],
  '(d) cancelling it tells the same people once more');
select is(
  array(select distinct title from public.person_notifications where type_key = 'workspace.closure_scheduled' order by title),
  array['World na is closing', 'World na is no longer closing'],
  '(d) the second says it is off');

select * from finish();
rollback;
