begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- BILDIRIM-SMS (KARARLAR S-123): text messages are ready but closed; no provider is connected.
--   (a) closed, no way sends a text: every type's route, the queue, a person's choices, the workspace's
--       settings; consent, the owner's switch and the person's choice do not open it;
--   (b) one gate: every function that speaks of text messages asks app_private.sms_channel_open, so
--       opening it (here, only inside this rolled-back test) opens every way at once;
--   (c) the STOP list is kept by phone number, closed or not: STOP ends the number's consent in every
--       workspace, a consent given after it does not send, START lifts it, HELP changes nothing;
--   (d) the browser reaches neither the list nor the gate.

select tests.world('sg');
select tests.world('sg2');
select tests.person('sg', 'ali', 'employee', array['K'], array['cook']);
select tests.person('sg', 'emre', 'employee', array['K'], array['cook']);

create temp table who as
select label, tests.user(label) as uid
from unnest(array['sg:owner', 'sg:ali', 'sg:emre', 'sg2:owner']) label;
grant select on who to public;
create function pg_temp.u(person text) returns uuid language sql stable as $$ select uid from who where label = person $$;
grant execute on function pg_temp.u(text) to public;

create function pg_temp.why(type_key text, w uuid, person text) returns text language sql as $$
  select r.reason from app_private.notification_route(type_key, w, pg_temp.u(person)) r where r.channel = 'sms'
$$;
-- Every type's text message route for one person: how many would send, and the reasons given.
create function pg_temp.texts(w uuid, person text) returns integer language sql as $$
  select count(*)::integer from public.notification_types t
  cross join lateral app_private.notification_route(t.key, w, pg_temp.u(person)) r
  where r.channel = 'sms' and r.sends
$$;
create function pg_temp.hint(sql text) returns text language plpgsql as $$
begin
  execute sql;
  return 'allowed';
exception when others then
  declare h text; begin get stacked diagnostics h = pg_exception_hint; return h; end;
end;
$$;

-- Ali consents, the owner turned text messages on, and Ali chose them for his schedule: everything
-- but the gate is open. (Written straight to the tables: no screen takes a consent yet.)
insert into public.notification_sms_consents (workspace_id, user_id, phone_e164, consent_text, consent_source)
values (tests.id('sg'), pg_temp.u('sg:ali'), '+14155550123', 'Text me about my shifts.', 'account_settings'),
       (tests.id('sg2'), pg_temp.u('sg:ali'), '+14155550123', 'Text me about my shifts.', 'onboarding');
insert into public.notification_workspace_settings (workspace_id, email_enabled, push_enabled, sms_enabled, updated_by)
values (tests.id('sg'), true, true, true, pg_temp.u('sg:owner')),
       (tests.id('sg2'), true, true, true, pg_temp.u('sg2:owner'));
insert into public.notification_preferences (workspace_id, user_id, topic_key, channel, enabled)
select tests.id('sg'), pg_temp.u('sg:ali'), t.topic_key, 'sms', true
from public.notification_types t where t.key = 'schedule.published';

-- (a) Closed ------------------------------------------------------------------------------------------------

select is(app_private.sms_channel_open(), false, '(a) the gate is closed');
select is(pg_temp.texts(tests.id('sg'), 'sg:ali'), 0, '(a) no type sends Ali a text, consent and choices notwithstanding');
select is((select array_agg(distinct r.reason) from public.notification_types t
           cross join lateral app_private.notification_route(t.key, tests.id('sg'), pg_temp.u('sg:ali')) r
           where r.channel = 'sms'),
  array['not_available'], '(a) every one says the channel is not available, required ones too');

select app_private.notify('schedule.published', tests.id('sg'), array[pg_temp.u('sg:ali')], 'sg:published:1', 'Out');
select is((select count(*)::integer from public.notification_deliveries d
           join public.person_notifications n on n.id = d.notification_id
           where n.workspace_id = tests.id('sg') and d.channel = 'sms'), 0, '(a) a producer queues no text');
select is(pg_temp.hint(format(
  $$insert into public.notification_deliveries (notification_id, channel, reason)
    select n.id, 'sms', 'required' from public.person_notifications n where n.workspace_id = %L$$, tests.id('sg'))),
  'notifications.sms_unavailable', '(a) nor can any other way put a text on the queue');
select is(pg_temp.hint(format(
  $$update public.notification_deliveries d set channel = 'sms'
    from public.person_notifications n where n.id = d.notification_id and n.workspace_id = %L$$, tests.id('sg'))),
  'notifications.sms_unavailable', '(a) or turn a queued email into one');

select is(public.get_notification_preferences_service(pg_temp.u('sg:ali'), tests.id('sg')) -> 'channels' -> 'sms' -> 'available',
  'false'::jsonb, '(a) a person''s choices say text messages are not available');
select is(public.get_notification_workspace_settings_service(pg_temp.u('sg:owner'), tests.id('sg')) -> 'sms_available',
  'false'::jsonb, '(a) so do the workspace''s settings');
select is(pg_temp.hint(format($$select public.save_notification_preferences_service(%L, %L,
  '[{"topic": "my_schedule", "channel": "sms", "enabled": true}]')$$, pg_temp.u('sg:ali'), tests.id('sg'))),
  'notifications.sms_unavailable', '(a) a person cannot choose them');
select is(pg_temp.hint(format($$select public.save_notification_workspace_settings_service(%L, %L,
  '{"email_enabled": true, "push_enabled": true, "sms_enabled": true, "muted_types": []}')$$, pg_temp.u('sg:owner'), tests.id('sg'))),
  'notifications.sms_unavailable', '(a) nor an owner turn them on');

-- (b) One gate ----------------------------------------------------------------------------------------------

select is(
  array(select p.oid::regprocedure::text from pg_proc p
        where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
          and p.prosrc ~* '(\msms|text message)'
          and p.proname <> 'sms_channel_open'
          and p.prosrc !~ 'app_private\.sms_channel_open\(\)'
          -- STOP is the law's, kept whether the channel is open or not.
          and p.proname <> 'sms_inbound_keyword'
        order by 1),
  '{}'::text[], '(b) every function that speaks of text messages asks the one gate');
select is(
  array(select p.proname::text from pg_proc p
        where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
          and p.prosrc ~* '(sms_open|''sms_available'', *false|''sms'', *jsonb_build_object\(''available'', *false)'
        order by 1),
  '{}'::text[], '(b) no function keeps its own "not available"');

-- (c) The STOP list, kept while closed --------------------------------------------------------------------

select is(app_private.sms_inbound_keyword('+14155550123', ' Stop '), 'stopped', '(c) STOP, in any case and spacing, stops');
select is((select count(*)::integer from public.notification_sms_opt_outs where phone_e164 = '+14155550123'), 1,
  '(c) the number is on the STOP list');
select is((select array_agg(distinct revoked_via) from public.notification_sms_consents
           where phone_e164 = '+14155550123' and user_id = pg_temp.u('sg:ali')),
  array['stop'], '(c) and its consent ends in every workspace');
select is(app_private.sms_inbound_keyword('+14155550123', 'unsubscribe'), 'stopped', '(c) a second STOP word changes nothing');
select is((select count(*)::integer from public.notification_sms_opt_outs where phone_e164 = '+14155550123'), 1,
  '(c) still one row');
select is(
  array(select app_private.sms_inbound_keyword('+14155550999', k)
        from unnest(array['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT']) k),
  array['stopped', 'stopped', 'stopped', 'stopped', 'stopped', 'stopped', 'stopped', 'stopped'],
  '(c) every word the law names stops');
select is(app_private.sms_inbound_keyword('+14155550999', 'HELP'), 'help', '(c) HELP is answered, nothing else');
select is(app_private.sms_inbound_keyword('+14155550999', 'see you at 5'), 'ignored', '(c) any other text is ignored');
select is((select count(*)::integer from public.notification_sms_opt_outs where phone_e164 = '+14155550999'), 1,
  '(c) and the number stays stopped');
select is(pg_temp.hint($$select app_private.sms_inbound_keyword('4155550123', 'STOP')$$), 'notifications.invalid_phone',
  '(c) a number not in E.164 is refused');

-- A consent given after STOP, as a future screen might take it.
insert into public.notification_sms_consents (workspace_id, user_id, phone_e164, consent_text, consent_source)
values (tests.id('sg'), pg_temp.u('sg:ali'), '+14155550123', 'Text me about my shifts.', 'account_settings');

-- (b) Opening the gate opens every way (only inside this test) -------------------------------------------

create or replace function app_private.sms_channel_open() returns boolean language sql stable as $$ select true $$;

select is(pg_temp.why('schedule.published', tests.id('sg'), 'sg:ali'), 'stopped',
  '(c) open, a stopped number still gets nothing, whatever consent came after');
select is(app_private.sms_inbound_keyword('+14155550123', 'START'), 'started', '(c) START lifts the stop');
select is((select count(*)::integer from public.notification_sms_opt_outs where phone_e164 = '+14155550123'), 0,
  '(c) the number leaves the list');
select is(pg_temp.why('schedule.published', tests.id('sg'), 'sg:ali'), 'person_on',
  '(b) open: Ali''s consent and choice send his schedule by text');
select is(pg_temp.why('account.password_changed', null, 'sg:ali'), 'no_consent',
  '(b) an account notice, in no workspace, has no consent to go on');
select is(pg_temp.why('schedule.published', tests.id('sg'), 'sg:emre'), 'no_consent', '(b) Emre gave no consent');
select is(pg_temp.why('schedule.published', tests.id('sg2'), 'sg:ali'), 'no_consent',
  '(b) the consent STOP ended stays ended in the other workspace');

select is(public.get_notification_preferences_service(pg_temp.u('sg:ali'), tests.id('sg')) -> 'channels' -> 'sms' -> 'available',
  'true'::jsonb, '(b) a person''s choices say text messages are available');
select is(public.get_notification_workspace_settings_service(pg_temp.u('sg:owner'), tests.id('sg')) -> 'sms_available',
  'true'::jsonb, '(b) so do the workspace''s settings');
select is(pg_temp.hint(format($$select public.save_notification_preferences_service(%L, %L,
  '[{"topic": "my_schedule", "channel": "sms", "enabled": false}]')$$, pg_temp.u('sg:ali'), tests.id('sg'))),
  'allowed', '(b) a person may choose them');
select is(pg_temp.why('schedule.published', tests.id('sg'), 'sg:ali'), 'person_off', '(b) and the choice holds');
select is(pg_temp.hint(format($$select public.save_notification_workspace_settings_service(%L, %L,
  '{"email_enabled": true, "push_enabled": true, "sms_enabled": false, "muted_types": []}')$$, pg_temp.u('sg:owner'), tests.id('sg'))),
  'allowed', '(b) an owner may turn them off');
select is(pg_temp.why('schedule.published', tests.id('sg'), 'sg:ali'), 'owner_off', '(b) and then they do not go');
select is(pg_temp.hint(format($$select public.save_notification_workspace_settings_service(%L, %L,
  '{"email_enabled": true, "push_enabled": true, "sms_enabled": true, "muted_types": []}')$$, pg_temp.u('sg:owner'), tests.id('sg'))),
  'allowed', '(b) and on again');
select is((select sms_enabled from public.notification_workspace_settings where workspace_id = tests.id('sg')), true,
  '(b) and it is kept');
select is(pg_temp.why('account.password_changed', tests.id('sg'), 'sg:ali'), 'required', '(b) a required notice texts whoever consented');
select is(pg_temp.hint(format(
  $$insert into public.notification_deliveries (notification_id, channel, reason)
    select n.id, 'sms', 'required' from public.person_notifications n where n.workspace_id = %L$$, tests.id('sg'))),
  'allowed', '(b) the queue takes a text');

-- (d) The browser ------------------------------------------------------------------------------------------

select is(
  (select c.relrowsecurity
          and not has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
          and not has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
   from pg_class c where c.oid = 'public.notification_sms_opt_outs'::regclass),
  true, '(d) the STOP list: row level security on, nothing granted to the browser');
select is(
  array(select f from unnest(array['app_private.sms_channel_open()', 'app_private.sms_inbound_keyword(text, text)']) f
        where has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')),
  '{}'::text[], '(d) nor may it call the gate or the STOP keeper');

select * from finish();
rollback;
