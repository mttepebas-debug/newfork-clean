begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- BILDIRIM-07 (KARARLAR S-91, S-92, S-95, S-123): the new notification system's core.
--   (a) the catalog: 63 types, three levels, default channels, retention;
--   (b) "will it go": required > owner turned it off > channel closed > the person's choice > default;
--       in-app is not in that order: every notice the owner did not turn off reaches the list;
--   (c) who gets one: members only, never the person who did it, one notice per event and person;
--   (d) the person's list and its services, refusals and another workspace;
--   (e) the person's choices and the workspace settings, who may change them;
--   (f) the browser reaches no table; the live channel carries a private signal only;
--   (g) retention: 90 days, account security a year.

select tests.world('nc');
select tests.world('other');
select tests.person('nc', 'zeynep', 'admin', array['K'], array['server']);
select tests.person('nc', 'ayse', 'manager', array['K'], array['cook']);
select tests.person('nc', 'ali', 'employee', array['K'], array['cook']);
select tests.person('nc', 'emre', 'employee', array['K'], array['cook']);
select tests.person('nc', 'aydan', 'employee', array['K'], array['cook'], 'onboarding');
select tests.person('nc', 'pelin', 'employee', array['K'], array['cook'], 'pending');
select tests.person('nc', 'sami', 'employee', array['K'], array['cook'], 'suspended');
select tests.person('nc', 'remzi', 'employee', array['K'], array['cook'], 'removed');
select tests.person('other', 'xena', 'employee', array['K'], array['cook']);

-- The ids the browser-role probes need: authenticated cannot read the tests schema.
create temp table who as
select label, tests.user(label) as uid
from unnest(array['nc:owner', 'nc:zeynep', 'nc:ayse', 'nc:ali', 'nc:emre', 'nc:aydan', 'nc:pelin', 'nc:sami',
                  'nc:remzi', 'other:owner', 'other:xena']) label;
grant select on who to public;
create function pg_temp.u(person text) returns uuid language sql stable as $$ select uid from who where label = person $$;
grant execute on function pg_temp.u(text) to public;

-- The channels a notice of this type would go out on for this person, in a fixed order.
create function pg_temp.goes(type_key text, w uuid, person text) returns text[] language sql as $$
  select array(select r.channel from app_private.notification_route(type_key, w, pg_temp.u(person)) r
               where r.sends order by array_position(array['in_app', 'email', 'push', 'sms'], r.channel))
$$;
create function pg_temp.why(type_key text, w uuid, person text, which text) returns text language sql as $$
  select r.reason from app_private.notification_route(type_key, w, pg_temp.u(person)) r where r.channel = which
$$;
-- A phone that can take a push notification, as the phone step will register one.
create function pg_temp.phone(person text) returns void language sql as $$
  insert into public.notification_push_subscriptions (user_id, endpoint, p256dh, auth_secret)
  values (pg_temp.u(person), 'https://fcm.googleapis.com/fcm/send/' || gen_random_uuid(), 'B' || repeat('p', 86), repeat('a', 22))
$$;

-- (a) The catalog --------------------------------------------------------------------------------------

-- 63: availability raises no notification (KARARLAR S-133, BILDIRIM-U7).
select is((select count(*)::integer from public.notification_types), 63, '(a) the catalog lists the 63 types of the plan');
select is(
  (select jsonb_object_agg(level, n) from (select level, count(*)::integer n from public.notification_types group by level) x),
  '{"required": 14, "important": 41, "optional": 8}'::jsonb,
  '(a) 14 required, 41 important, 8 optional');
select is(
  array(select key from public.notification_types where level = 'optional' order by key),
  array['people.invitation_cancelled', 'people.invitation_declined', 'people.joined',
        'schedule.shift_reminder', 'schedule.week_not_published', 'shift_changes.open_shift_available',
        'shift_changes.open_shift_kept', 'shift_changes.open_shift_taken'],
  '(a) the optional ones: open shifts, new members, and the two that come later');
select is((select count(*)::integer from public.notification_types where level = 'required' and not default_email), 0,
  '(a) every required type goes by email');
select is((select count(*)::integer from public.notification_types where default_sms), 0, '(a) no type goes by text message');
select is(
  array(select distinct retention_days::integer from public.notification_types where area = 'account'), array[365],
  '(a) account security is kept a year');
select is(
  array(select distinct retention_days::integer from public.notification_types where area <> 'account'), array[90],
  '(a) everything else 90 days');
select is(array(select key from public.notification_types where scope = 'account' order by key),
  array['account.new_sign_in', 'account.password_changed', 'account.sign_in_email_changed', 'account.signed_out_elsewhere'],
  '(a) the account''s own notices belong to no workspace');
select is((select count(*)::integer from public.notification_types t
           where not exists (select 1 from public.notification_topics p where p.key = t.topic_key)), 0,
  '(a) every type has a topic a person chooses by');

-- (b) Will it go -----------------------------------------------------------------------------------------

-- Ali has no phone yet: an important schedule notice goes in-app and by email; push waits for a device.
select is(pg_temp.goes('schedule.published', tests.id('nc'), 'nc:ali'), array['in_app', 'email'],
  '(b) by default an important notice goes in-app and by email');
select is(pg_temp.why('schedule.published', tests.id('nc'), 'nc:ali', 'push'), 'no_device',
  '(b) push needs a phone that takes it');
select is(pg_temp.why('schedule.published', tests.id('nc'), 'nc:ali', 'sms'), 'not_available',
  '(b) text messages are not available');
select pg_temp.phone('nc:ali');
select is(pg_temp.goes('schedule.published', tests.id('nc'), 'nc:ali'), array['in_app', 'email', 'push'],
  '(b) with a phone it goes there too');

-- The person's choice is a topic and a channel, not a type.
select public.save_notification_preferences_service(pg_temp.u('nc:ali'), tests.id('nc'),
  '[{"topic": "my_schedule", "channel": "email", "enabled": false}]');
select is(pg_temp.goes('schedule.published', tests.id('nc'), 'nc:ali'), array['in_app', 'push'],
  '(b) the person turns email off for My schedule');
select is(pg_temp.why('schedule.published', tests.id('nc'), 'nc:ali', 'email'), 'person_off', '(b) because of their choice');
select is(pg_temp.goes('schedule.shift_changed', tests.id('nc'), 'nc:ali'), array['in_app', 'push'],
  '(b) for every type of the topic');
select is(pg_temp.goes('time_off.decided', tests.id('nc'), 'nc:ali'), array['in_app', 'email', 'push'],
  '(b) and no other topic');

-- The owner turns push off for the workspace: above the person's choice.
select public.save_notification_workspace_settings_service(pg_temp.u('nc:owner'), tests.id('nc'),
  '{"email_enabled": true, "push_enabled": false, "sms_enabled": false, "muted_types": []}');
select is(pg_temp.goes('schedule.published', tests.id('nc'), 'nc:ali'), array['in_app'],
  '(b) the owner turns push off: only the list is left');
select is(pg_temp.why('schedule.published', tests.id('nc'), 'nc:ali', 'push'), 'owner_off', '(b) because the owner did');
-- A required notice goes anyway: nobody turns it off.
select is(pg_temp.goes('people.role_changed', tests.id('nc'), 'nc:ali'), array['in_app', 'email', 'push'],
  '(b) a required notice goes in-app, by email and to the phone whatever the owner and the person chose');
select is(pg_temp.why('people.role_changed', tests.id('nc'), 'nc:ali', 'email'), 'required', '(b) because it is required');
select public.save_notification_workspace_settings_service(pg_temp.u('nc:owner'), tests.id('nc'),
  '{"email_enabled": true, "push_enabled": true, "sms_enabled": false, "muted_types": []}');

-- An optional type: in-app and push by default, no email.
select is(pg_temp.goes('shift_changes.open_shift_available', tests.id('nc'), 'nc:ali'), array['in_app', 'push'],
  '(b) an optional notice goes in-app and to the phone by default');
select public.save_notification_preferences_service(pg_temp.u('nc:ali'), tests.id('nc'),
  '[{"topic": "open_shifts", "channel": "push", "enabled": false}]');
select is(pg_temp.goes('shift_changes.open_shift_available', tests.id('nc'), 'nc:ali'), array['in_app'],
  '(b) the person turns its phone channel off; it still reaches the list');
-- The owner turns the type off: nobody gets it, not even in the list, whatever they chose.
select public.save_notification_preferences_service(pg_temp.u('nc:ali'), tests.id('nc'),
  '[{"topic": "open_shifts", "channel": "push", "enabled": true}, {"topic": "open_shifts", "channel": "email", "enabled": true}]');
select public.save_notification_workspace_settings_service(pg_temp.u('nc:owner'), tests.id('nc'),
  '{"email_enabled": true, "push_enabled": true, "sms_enabled": false, "muted_types": ["shift_changes.open_shift_available"]}');
select is(pg_temp.goes('shift_changes.open_shift_available', tests.id('nc'), 'nc:ali'), '{}'::text[],
  '(b) the owner turns an optional type off: nobody gets it, even after turning it on for themselves');
select is(pg_temp.why('shift_changes.open_shift_available', tests.id('nc'), 'nc:ali', 'in_app'), 'owner_off',
  '(b) not even in the list');
select is(pg_temp.goes('shift_changes.open_shift_taken', tests.id('nc'), 'nc:ali'), array['in_app', 'email', 'push'],
  '(b) the other optional types of the topic still follow the person''s choice');

-- A closed channel: a bounced address gets no email, required or not.
insert into public.notification_email_suppressions (email, reason)
select lower(u.email), 'bounce' from auth.users u where u.id = pg_temp.u('nc:emre');
select is(pg_temp.goes('time_off.decided', tests.id('nc'), 'nc:emre'), array['in_app'],
  '(b) an address that bounced gets no email');
select is(pg_temp.why('time_off.decided', tests.id('nc'), 'nc:emre', 'email'), 'suppressed', '(b) it is suppressed');
select is(pg_temp.why('people.role_changed', tests.id('nc'), 'nc:emre', 'email'), 'suppressed',
  '(b) not even a required one: the address cannot take it');
update public.notification_email_suppressions set cleared_at = now()
where email = (select lower(u.email) from auth.users u where u.id = pg_temp.u('nc:emre'));
select is(pg_temp.goes('time_off.decided', tests.id('nc'), 'nc:emre'), array['in_app', 'email'],
  '(b) a cleared address gets email again');

-- Push chosen but no phone: an important notice falls back to email; an optional one does not.
select is(pg_temp.goes('shift_changes.swap_answered', tests.id('nc'), 'nc:emre'), array['in_app', 'email'],
  '(b) an important push-only notice goes by email when no phone takes it');
select is(pg_temp.why('shift_changes.swap_answered', tests.id('nc'), 'nc:emre', 'email'), 'push_fallback',
  '(b) as the fallback for push');
select is(pg_temp.goes('schedule.shift_reminder', tests.id('nc'), 'nc:emre'), array['in_app'],
  '(b) an optional push-only one stays in the list');
select public.save_notification_preferences_service(pg_temp.u('nc:emre'), tests.id('nc'),
  '[{"topic": "shift_changes", "channel": "email", "enabled": false}]');
select is(pg_temp.goes('shift_changes.swap_answered', tests.id('nc'), 'nc:emre'), array['in_app'],
  '(b) and never to someone who turned email off for that topic');

-- A revoked phone is no phone.
update public.notification_push_subscriptions set revoked_at = now(), revoked_reason = 'gone' where user_id = pg_temp.u('nc:ali');
select is(pg_temp.why('time_off.decided', tests.id('nc'), 'nc:ali', 'push'), 'no_device', '(b) a revoked phone takes nothing');
select pg_temp.phone('nc:ali');

-- (c) Who gets one ---------------------------------------------------------------------------------------

select is(
  app_private.notify('schedule.published', tests.id('nc'),
    array[pg_temp.u('nc:ali'), pg_temp.u('nc:emre'), pg_temp.u('nc:aydan'), pg_temp.u('nc:ayse'), pg_temp.u('nc:pelin'),
          pg_temp.u('nc:sami'), pg_temp.u('nc:remzi'), pg_temp.u('other:xena'), null],
    'schedule.published:week-1', 'Your schedule for Oct 19-25 is out',
    target_actor => pg_temp.u('nc:ayse'), target_url => '/app/schedule', target_subject_type => 'schedule_week'),
  3, '(c) a notice reaches three of the nine it names');
select is(
  array(select w.label from public.person_notifications n join who w on w.uid = n.user_id
        where n.workspace_id = tests.id('nc') and n.event_key = 'schedule.published:week-1' order by 1),
  array['nc:ali', 'nc:aydan', 'nc:emre'],
  '(c) active members and the one still onboarding; not the one who published, not the invited, suspended or removed, not another workspace');
select is(
  app_private.notify('schedule.published', tests.id('nc'), array[pg_temp.u('nc:ali'), pg_temp.u('nc:emre')],
    'schedule.published:week-1', 'Your schedule for Oct 19-25 is out (again)'),
  0, '(c) the same event twice is one notice per person (S-95)');
select is(
  (select jsonb_object_agg(w.label, x.channels) from (
     select n.user_id, jsonb_agg(d.channel order by d.channel) channels
     from public.person_notifications n join public.notification_deliveries d on d.notification_id = n.id
     where n.event_key = 'schedule.published:week-1' group by n.user_id) x join who w on w.uid = x.user_id),
  '{"nc:ali": ["push"], "nc:emre": ["email"], "nc:aydan": ["email"]}'::jsonb,
  '(c) each outside channel the rule allows waits in the queue: Ali turned email off and has a phone');
select is((select count(*)::integer from public.notification_deliveries d join public.person_notifications n on n.id = d.notification_id
           where n.event_key = 'schedule.published:week-1' and d.status = 'queued'), 3, '(c) queued, once each');

-- An optional type the owner turned off writes nothing at all.
select is(app_private.notify('shift_changes.open_shift_available', tests.id('nc'), array[pg_temp.u('nc:ali')], 'open:1', 'Extra shift'),
  0, '(c) a type the owner turned off writes no notice');
-- Only a required "your access ended" reaches a former member.
select is(app_private.notify('schedule.published', tests.id('nc'), array[pg_temp.u('nc:remzi')], 'schedule.published:week-2', 'Out'),
  0, '(c) a former member gets no schedule');
select is(app_private.notify('people.access_ended', tests.id('nc'), array[pg_temp.u('nc:remzi'), pg_temp.u('nc:pelin')],
    'access:remzi', 'Your access to World nc ended', target_actor => pg_temp.u('nc:owner')),
  1, '(c) the one whose access ended is told; someone never let in is not');
-- The account's own notices: no workspace, and they reach the person who did it.
select is(app_private.notify('account.password_changed', null, array[pg_temp.u('nc:ali')], 'password:1',
    'Your password was changed', target_actor => pg_temp.u('nc:ali')),
  1, '(c) an account notice reaches the person who changed their own password');
select is((select expires_at - created_at from public.person_notifications where event_key = 'password:1'), interval '365 days',
  '(c) kept a year');
select is((select expires_at - created_at from public.person_notifications where event_key = 'schedule.published:week-1' limit 1),
  interval '90 days', '(c) a schedule notice 90 days');
select throws_ok($$select app_private.notify('account.password_changed', tests.id('nc'), array[pg_temp.u('nc:ali')], 'p:2', 'x')$$,
  '22023', null, '(c) an account notice names no workspace');
select throws_ok($$select app_private.notify('schedule.published', null, array[pg_temp.u('nc:ali')], 'p:3', 'x')$$,
  '22023', null, '(c) a workspace notice names one');
select throws_ok($$select app_private.notify('schedule.published', tests.id('nc'), array[pg_temp.u('nc:ali')], 'p:4', 'x',
  target_url => 'https://elsewhere.test/')$$, '22023', null, '(c) a link stays inside the app');
select throws_ok($$select app_private.notify('no.such_type', tests.id('nc'), array[pg_temp.u('nc:ali')], 'p:5', 'x')$$,
  '22023', null, '(c) a type the catalog does not list');
select throws_ok($$select app_private.notify('schedule.published', tests.id('nc'), array[pg_temp.u('nc:ali')], 'p:6', '  ')$$,
  '22023', null, '(c) a notice says something');

-- A notice that asks for a decision closes for everybody when the first one decides.
select app_private.notify('time_off.requested', tests.id('nc'), array[pg_temp.u('nc:ayse'), pg_temp.u('nc:owner'), pg_temp.u('nc:zeynep')],
  'time_off.requested:r1', 'Time off request from Ali Person', target_actor => pg_temp.u('nc:ali'),
  target_subject_type => 'time_off_request', target_subject_id => '00000000-0000-0000-0000-0000000000a1');
select is(app_private.notification_resolve(tests.id('nc'), 'time_off_request', '00000000-0000-0000-0000-0000000000a1',
    'approved', pg_temp.u('nc:ayse')),
  3, '(c) the first decision closes every decider''s card');
select is(
  (select jsonb_agg(distinct jsonb_build_object('resolution', resolution, 'by', resolved_by = pg_temp.u('nc:ayse'), 'at', resolved_at is not null))
   from public.person_notifications where subject_id = '00000000-0000-0000-0000-0000000000a1'),
  '[{"at": true, "by": true, "resolution": "approved"}]'::jsonb, '(c) as "approved by" the one who decided');
select is(app_private.notification_resolve(tests.id('nc'), 'time_off_request', '00000000-0000-0000-0000-0000000000a1',
    'declined', pg_temp.u('nc:owner')),
  0, '(c) a closed card stays as it was decided');

-- (d) The person's list ----------------------------------------------------------------------------------

select is(
  (select jsonb_build_object('unseen', f -> 'unseen_count', 'unread', f -> 'unread_count',
     'types', (select jsonb_agg(i ->> 'type' order by i ->> 'type') from jsonb_array_elements(f -> 'items') i))
   from (select public.get_notification_feed_service(pg_temp.u('nc:ali'), tests.id('nc')) f) x),
  '{"unseen": 2, "unread": 2, "types": ["account.password_changed", "schedule.published"]}'::jsonb,
  '(d) Ali''s list: his schedule and his account notice');
select is(
  (select jsonb_agg(i ->> 'title') from jsonb_array_elements(public.get_notification_feed_service(pg_temp.u('nc:emre'), tests.id('nc')) -> 'items') i),
  '["Your schedule for Oct 19-25 is out"]'::jsonb, '(d) Emre sees his own only');
-- Hers holds only her own workspace's: Xena, whom she invited, joined (BILDIRIM-U4a).
select is(
  (select jsonb_agg(i ->> 'title') from jsonb_array_elements(public.get_notification_feed_service(pg_temp.u('other:owner'), tests.id('other')) -> 'items') i),
  '["Xena Person accepted your invitation"]'::jsonb,
  '(d) another workspace''s owner sees none of this one''s, only her own: Xena, whom she invited, joined');
select throws_ok($$select public.get_notification_feed_service(pg_temp.u('other:xena'), tests.id('nc'))$$,
  '42501', null, '(d) another workspace''s member is refused');
create function pg_temp.refusal(sql text) returns text language plpgsql as $$
begin
  execute sql;
  return 'allowed';
exception when insufficient_privilege then
  declare h text; begin get stacked diagnostics h = pg_exception_hint; return h; end;
end;
$$;
select is(pg_temp.refusal(format('select public.get_notification_feed_service(%L, %L)', pg_temp.u('other:xena'), tests.id('nc'))),
  'authz.not_member', '(d) as not a member (42501, authz.not_member)');
select is(pg_temp.refusal(format('select public.get_notification_feed_service(%L, %L)', pg_temp.u('nc:sami'), tests.id('nc'))),
  'authz.not_active', '(d) a suspended member reads no list');
select is((select jsonb_array_length(public.get_notification_feed_service(pg_temp.u('nc:aydan'), tests.id('nc')) -> 'items')), 1,
  '(d) someone still onboarding reads theirs');

select is((public.mark_notifications_seen_service(pg_temp.u('nc:ali'), tests.id('nc')) -> 'unseen_count')::integer, 0,
  '(d) opening the list clears the badge');
select is((public.get_notification_feed_service(pg_temp.u('nc:ali'), tests.id('nc')) -> 'unread_count')::integer, 2,
  '(d) and reads nothing');
select is(
  (public.mark_notifications_read_service(pg_temp.u('nc:ali'), tests.id('nc'),
     array[(select id from public.person_notifications where user_id = pg_temp.u('nc:ali') and event_key = 'schedule.published:week-1'),
           (select id from public.person_notifications where user_id = pg_temp.u('nc:emre') and event_key = 'schedule.published:week-1')])
   -> 'updated')::integer,
  1, '(d) clicking a row reads it; someone else''s row is not his to read');
select ok((select read_at is null from public.person_notifications where user_id = pg_temp.u('nc:emre') and event_key = 'schedule.published:week-1'),
  '(d) Emre''s stays unread');
select is((public.mark_notifications_read_service(pg_temp.u('nc:ali'), tests.id('nc')) -> 'unread_count')::integer, 0,
  '(d) "Mark all as read" reads the rest');
select is(
  (select jsonb_agg(i ->> 'type') from jsonb_array_elements(public.get_notification_feed_service(pg_temp.u('nc:ayse'), tests.id('nc'), 'needs_action') -> 'items') i),
  null, '(d) a decided card leaves "Needs action"');
select app_private.notify('time_off.requested', tests.id('nc'), array[pg_temp.u('nc:ayse')], 'time_off.requested:r2', 'Time off request from Emre Person',
  target_subject_type => 'time_off_request', target_subject_id => '00000000-0000-0000-0000-0000000000a2');
select is(
  (select jsonb_agg(i ->> 'title') from jsonb_array_elements(public.get_notification_feed_service(pg_temp.u('nc:ayse'), tests.id('nc'), 'needs_action') -> 'items') i),
  '["Time off request from Emre Person"]'::jsonb, '(d) an open one is in it');
select throws_ok($$select public.get_notification_feed_service(pg_temp.u('nc:ali'), tests.id('nc'), 'everything')$$,
  '22023', null, '(d) the list has three filters');

-- (e) Choices and workspace settings ---------------------------------------------------------------------

select is(
  (select array(select t ->> 'key' from jsonb_array_elements(public.get_notification_preferences_service(pg_temp.u('nc:ali'), tests.id('nc')) -> 'topics') t
                order by t ->> 'key')),
  array['announcements', 'documents', 'my_schedule', 'open_shifts', 'profile', 'shift_changes', 'time_off'],
  '(e) a person chooses by topic, only those they could receive (BILDIRIM-12: Ali decides nothing); account and workspace notices are not a choice');
select is(
  (select t -> 'email' from jsonb_array_elements(public.get_notification_preferences_service(pg_temp.u('nc:ali'), tests.id('nc')) -> 'topics') t
   where t ->> 'key' = 'my_schedule'),
  '{"choice": false, "default": true}'::jsonb, '(e) and reads back what he chose and what the default is');
select is(
  (select jsonb_build_object('email', c -> 'email' -> 'suppressed', 'push', c -> 'push' -> 'devices', 'sms', c -> 'sms' -> 'available')
   from (select public.get_notification_preferences_service(pg_temp.u('nc:ali'), tests.id('nc')) -> 'channels' c) x),
  '{"email": false, "push": 1, "sms": false}'::jsonb, '(e) with the state of each channel');
select throws_ok($$select public.save_notification_preferences_service(pg_temp.u('nc:ali'), tests.id('nc'),
  '[{"topic": "my_schedule", "channel": "in_app", "enabled": false}]')$$, '22023', null, '(e) nobody turns the list off');
select throws_ok($$select public.save_notification_preferences_service(pg_temp.u('nc:ali'), tests.id('nc'),
  '[{"topic": "account", "channel": "email", "enabled": false}]')$$, '22023', null, '(e) nor a required topic');
select throws_ok($$select public.save_notification_preferences_service(pg_temp.u('nc:ali'), tests.id('nc'),
  '[{"topic": "my_schedule", "channel": "sms", "enabled": true}]')$$, '22023', null, '(e) text messages are not available');
select throws_ok($$select public.save_notification_preferences_service(pg_temp.u('nc:ali'), tests.id('nc'),
  '[{"topic": "my_schedule", "channel": "email"}]')$$, '22023', null, '(e) a choice says on, off or back to the default');
create function pg_temp.answer(sql text) returns text language plpgsql as $$
declare state text; h text;
begin
  execute sql;
  return 'allowed';
exception when others then
  get stacked diagnostics state = returned_sqlstate, h = pg_exception_hint;
  return state || ' ' || coalesce(h, '');
end;
$$;
select is(pg_temp.answer(format($$select public.save_notification_preferences_service(%L, %L,
  '[{"topic": "my_schedule", "channel": "email"}]')$$, pg_temp.u('nc:ali'), tests.id('nc'))),
  '22023 notifications.invalid_choice', '(e) as an invalid choice (22023), never a missing value (23502)');
select is(app_private.authz_reason(pg_temp.u('nc:ali'), tests.id('nc'), 'notifications.write_own', null, null, pg_temp.u('nc:emre')),
  'out_of_scope', '(e) one''s choices are one''s own: the core refuses someone else''s');
select is(pg_temp.refusal(format($$select public.save_notification_preferences_service(%L, %L,
  '[{"topic": "my_schedule", "channel": "email", "enabled": false}]')$$, pg_temp.u('nc:sami'), tests.id('nc'))),
  'authz.not_active', '(e) a suspended member changes nothing');
select public.save_notification_preferences_service(pg_temp.u('nc:ali'), tests.id('nc'),
  '[{"topic": "my_schedule", "channel": "email", "enabled": null}]');
select is(pg_temp.why('schedule.published', tests.id('nc'), 'nc:ali', 'email'), 'default_on', '(e) a cleared choice falls back to the default');
select is((select count(*)::integer from public.notification_preferences where user_id = pg_temp.u('nc:ali') and workspace_id = tests.id('other')), 0,
  '(e) a choice is for one workspace');

select is(
  (select jsonb_build_object('email', s -> 'email_enabled', 'push', s -> 'push_enabled', 'sms', s -> 'sms_available',
     'muted', (select jsonb_agg(o ->> 'key') from jsonb_array_elements(s -> 'optional') o where not (o ->> 'enabled')::boolean),
     'optional', jsonb_array_length(s -> 'optional'), 'always', jsonb_array_length(s -> 'always_sent'))
   from (select public.get_notification_workspace_settings_service(pg_temp.u('nc:zeynep'), tests.id('nc')) s) x),
  '{"email": true, "push": true, "sms": false, "muted": ["shift_changes.open_shift_available"], "optional": 8, "always": 55}'::jsonb,
  '(e) an admin reads the workspace settings: the channels, the eight optional types, and what is always sent');
select public.save_notification_workspace_settings_service(pg_temp.u('nc:zeynep'), tests.id('nc'),
  '{"email_enabled": true, "push_enabled": true, "sms_enabled": false, "muted_types": []}');
select is(pg_temp.goes('shift_changes.open_shift_available', tests.id('nc'), 'nc:ali'), array['in_app', 'email', 'push'],
  '(e) an admin turns the type back on; Ali''s own choice is back');
select is(pg_temp.refusal(format($$select public.save_notification_workspace_settings_service(%L, %L,
  '{"email_enabled": false, "push_enabled": true, "sms_enabled": false, "muted_types": []}')$$, pg_temp.u('nc:ayse'), tests.id('nc'))),
  'authz.missing_permission', '(e) a manager does not change workspace settings');
select is(pg_temp.refusal(format('select public.get_notification_workspace_settings_service(%L, %L)', pg_temp.u('nc:ali'), tests.id('nc'))),
  'authz.missing_permission', '(e) an employee does not read them');
select is(pg_temp.refusal(format('select public.get_notification_workspace_settings_service(%L, %L)', pg_temp.u('other:owner'), tests.id('nc'))),
  'authz.not_member', '(e) nor does another workspace''s owner');
select throws_ok($$select public.save_notification_workspace_settings_service(pg_temp.u('nc:owner'), tests.id('nc'),
  '{"email_enabled": true, "push_enabled": true, "sms_enabled": false, "muted_types": ["schedule.published"]}')$$,
  '22023', null, '(e) the owner turns off optional types only');
select throws_ok($$select public.save_notification_workspace_settings_service(pg_temp.u('nc:owner'), tests.id('nc'),
  '{"email_enabled": true, "push_enabled": true, "sms_enabled": true, "muted_types": []}')$$,
  '22023', null, '(e) and cannot turn text messages on');
select is((select count(*)::integer from public.notification_workspace_settings where workspace_id = tests.id('other')), 0,
  '(e) the settings are one workspace''s');

-- One person in two workspaces: the same event key is one notice in each, and a choice in one is not
-- a choice in the other.
select public.accept_employee_invitation_by_id_service(pg_temp.u('nc:ali'), (public.create_employee_command_service(
  pg_temp.u('other:owner'), tests.id('other'), gen_random_uuid(),
  jsonb_build_object('first_name', 'Ali', 'middle_name', '', 'last_name', 'Person', 'preferred_name', '',
    'invitation_email', (select u.email from auth.users u where u.id = pg_temp.u('nc:ali')),
    'start_date', '', 'internal_note', '', 'location_ids', jsonb_build_array(tests.id('other:K')),
    'primary_location_id', tests.id('other:K'), 'job_ids', jsonb_build_array(tests.id('other:job:cook')),
    'primary_job_id', tests.id('other:job:cook'), 'is_remote', false, 'is_excluded_from_schedule', false, 'expected_revision', null),
  jsonb_build_object('employee_role_id',
    (select r.id from public.workspace_roles r where r.workspace_id = tests.id('other') and r.system_key = 'employee'))) ->> 'invitation_id')::uuid);
select tests.settle();
select is(app_private.notify('schedule.published', tests.id('nc'), array[pg_temp.u('nc:ali')], 'schedule.published:week-9', 'Out in nc'),
  1, '(e) a person in two workspaces gets the event in the first');
select is(app_private.notify('schedule.published', tests.id('other'), array[pg_temp.u('nc:ali')], 'schedule.published:week-9', 'Out in other'),
  1, '(e) and the same event key in the second: two workspaces, two events');
select is(
  (select array_agg(i ->> 'title') from jsonb_array_elements(public.get_notification_feed_service(pg_temp.u('nc:ali'), tests.id('other')) -> 'items') i
   where i ->> 'type' = 'schedule.published'),
  array['Out in other'], '(e) each list shows its own workspace''s');
select public.save_notification_preferences_service(pg_temp.u('nc:ali'), tests.id('nc'),
  '[{"topic": "my_schedule", "channel": "email", "enabled": false}]');
select is(pg_temp.why('schedule.published', tests.id('nc'), 'nc:ali', 'email'), 'person_off', '(e) email off in the first workspace');
select is(pg_temp.why('schedule.published', tests.id('other'), 'nc:ali', 'email'), 'default_on', '(e) still on in the second');

-- (f) The browser and the live channel ---------------------------------------------------------------------

select is(
  array(select c.relname::text from pg_class c
        where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
          and c.relname in ('notification_topics', 'notification_types', 'person_notifications', 'notification_deliveries',
                            'notification_preferences', 'notification_workspace_settings', 'notification_workspace_muted_types',
                            'notification_push_subscriptions', 'notification_email_suppressions', 'notification_sms_consents')
          and c.relrowsecurity
          and not has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
          and not has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
        order by 1),
  array['notification_deliveries', 'notification_email_suppressions', 'notification_preferences', 'notification_push_subscriptions',
        'notification_sms_consents', 'notification_topics', 'notification_types', 'notification_workspace_muted_types',
        'notification_workspace_settings', 'person_notifications'],
  '(f) the ten tables: row level security on, nothing granted to the browser');

create function pg_temp.receives(person text, topic text) returns boolean language plpgsql as $$
declare
  message_id uuid := gen_random_uuid();
  seen integer;
begin
  insert into realtime.messages (id, topic, extension, event, payload, private)
  values (message_id, topic, 'broadcast', 'probe', '{}'::jsonb, true);
  perform set_config('realtime.topic', topic, true);
  seen := tests.as_browser(pg_temp.u(person), format('select 1 from realtime.messages where id = %L', message_id));
  perform set_config('realtime.topic', '', true);
  return seen > 0;
end;
$$;
create function pg_temp.sends(person text, topic text) returns boolean language plpgsql as $$
begin
  perform set_config('realtime.topic', topic, true);
  begin
    perform tests.as_browser(pg_temp.u(person), format(
      'insert into realtime.messages (topic, extension, event, payload, private) values (%L, %L, %L, %L, true)',
      topic, 'broadcast', 'probe', '{}'));
    perform set_config('realtime.topic', '', true);
    return true;
  exception when insufficient_privilege then
    perform set_config('realtime.topic', '', true);
    return false;
  end;
end;
$$;
select ok(pg_temp.receives('nc:ali', 'notifications:' || pg_temp.u('nc:ali')), '(f) a person hears the signal for their own list');
select ok(not pg_temp.receives('nc:emre', 'notifications:' || pg_temp.u('nc:ali')), '(f) not someone else''s');
select ok(not pg_temp.receives('other:owner', 'notifications:' || pg_temp.u('nc:ali')), '(f) not from another workspace');
select ok(not pg_temp.sends('nc:ali', 'notifications:' || pg_temp.u('nc:ali')), '(f) and nobody sends one from the browser');
select ok(exists (select 1 from realtime.messages where topic = 'notifications:' || pg_temp.u('nc:emre') and private),
  '(f) a new notice sends a private signal');
select is(
  (select array_agg(distinct k order by k) from realtime.messages m, jsonb_object_keys(m.payload) k
   where m.topic like 'notifications:%' and m.event = 'changed'),
  array['id', 'workspace_id'], '(f) the signal says which workspace (and its own message id), never what the notice says');

-- (g) Retention --------------------------------------------------------------------------------------------

-- ponytail: the clock is moved by hand; now() is fixed inside the test transaction.
update public.person_notifications set expires_at = now() - interval '1 second'
where user_id = pg_temp.u('nc:emre') and event_key = 'schedule.published:week-1';
select is(app_private.purge_expired_notifications(), 1, '(g) an expired notice is deleted');
select is((select count(*)::integer from public.notification_deliveries d
           where not exists (select 1 from public.person_notifications n where n.id = d.notification_id)), 0,
  '(g) with its deliveries');
select is((select schedule || ' ' || command from cron.job where jobname = 'notification-retention'),
  '40 4 * * * select app_private.purge_expired_notifications()', '(g) every night');

select * from finish();
rollback;
