begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- BILDIRIM-06 (teardown part C2, KARARLAR S-123, S-124): the old notification system is gone.
--   (a) its tables, type, functions and live-updates policy;
--   (b) nothing left calls one of its functions or names one of its tables;
--   (c) the columns that only recorded a notice;
--   (d) the notification settings permissions and actions; the three for the new system stay;
--   (e) the Workspace home: no notification list or unread count, six cards;
--   (f) Remind on an announcement went with it, and came back on the new system (BILDIRIM-U6,
--       notify_announcements); (g) document maintenance's always-zero failed_cases.

select tests.world('nd');

-- (a) ----------------------------------------------------------------------------------------------

create temp table dropped(kind text, name text);
insert into dropped
select 'table', unnest(array[
  'public.notification_outbox', 'public.notification_catalog', 'public.notification_inbox_items',
  'public.notification_recipients', 'public.notification_audit_log', 'public.notification_events',
  'public.notification_org_policies', 'public.notifications', 'public.account_notification_items',
  'public.notification_template_versions', 'public.notification_user_preferences',
  'public.notification_recipient_decisions', 'public.notification_producer_registry',
  'public.notification_consents', 'public.notification_endpoints', 'public.notification_delivery_attempts',
  'app_private.document_notification_dedup', 'app_private.notification_legacy_default_accounts'])
union all
select 'function', unnest(array[
  'announcement_deliver', 'announcement_notice', 'announcement_on_text', 'announcement_shift_sentence',
  'announcement_tell_failed', 'communication_withdraw', 'document_account_inbox_action_base',
  'document_account_inbox_allowed', 'document_notification_policy', 'document_notify_access',
  'enqueue_document_notification', 'notify_document_audit', 'project_account_security_notification',
  'termination_notify_shifts_unassigned', 'time_off_alone_deciders', 'time_off_deciders', 'time_off_notice',
  'time_off_notify_shifts_opened', 'time_off_opened_shifts_told', 'act_on_notification_inbox_item_v2_service',
  'act_on_notification_inbox_workspace_base', 'enqueue_notification_outbox_service',
  'fail_notification_outbox_service', 'flush_shift_exchange_notifications_service',
  'get_notification_inbox_v2_service', 'get_notification_settings_service',
  'get_notification_user_preferences_service', 'get_notification_user_preferences_workspace_base',
  'get_notifications_service', 'lease_notification_outbox_service', 'notification_actor_is_active_member_service',
  'notification_default_channels_service', 'notification_user_channel_lock_reason_service',
  'notification_user_channel_lock_reason_workspace_base', 'notification_user_preference_to_json',
  'notify_schedule_request_event_service', 'notify_time_off_shortened', 'preview_notification_policy_service',
  'process_notification_outbox_before_signal', 'process_notification_outbox_service',
  'project_notification_event_service', 'project_notification_inbox_exchange_base',
  'project_notification_inbox_service', 'project_notification_recipients_service',
  'project_schedule_notification_recipients_service', 'reconcile_notification_platform_service',
  'record_account_security_notification_service', 'reset_notification_policies_service',
  'resolve_notification_policy_v1_service', 'save_notification_policy_service',
  'save_notification_user_preferences_service', 'shift_exchange_emit_notification_base',
  'shift_exchange_notification_allowed', 'shift_exchange_notification_policy_service',
  'shift_exchange_sync_notifications']);

select is(array(select name from dropped where kind = 'table' and to_regclass(name) is not null order by 1),
  '{}'::text[], '(a) the 18 notification tables are gone');
-- The new system (BILDIRIM-07) brings its own, under new names; nothing else is named for notifications.
select is(array(select c.relname::text from pg_class c
                where c.relnamespace in ('public'::regnamespace, 'app_private'::regnamespace)
                  and c.relkind in ('r', 'v', 'm', 'p') and c.relname ~ 'notif' order by 1),
  array['notification_alerts', 'notification_deliveries', 'notification_dispatch', 'notification_email_channel', 'notification_email_suppressions', 'notification_preferences',
        'notification_push_channel', 'notification_push_sends', 'notification_push_subscriptions', 'notification_quotas',
        'notification_sms_consents', 'notification_sms_opt_outs', 'notification_topics',
        'notification_types',
        'notification_workspace_muted_types', 'notification_workspace_settings', 'person_notifications'],
  '(a) no table, view or partition named for notifications is left but the new system''s');
select is(array(select p.proname::text from pg_proc p join dropped d on d.kind = 'function' and d.name = p.proname
                where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace) order by 1),
  '{}'::text[], '(a) its functions are gone');
select is(array(select p.proname::text from pg_proc p
                where p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
                  and p.proname ~ '(notif|notice)' order by 1),
  array['apply_notification_email_event_service', 'begin_notification_dispatch_service', 'claim_notification_emails_service',
        'claim_notification_push_service', 'delete_notification_push_subscription_service', 'end_notification_dispatch_service',
        'finish_notification_email_service', 'finish_notification_push_service',
        'get_notification_feed_service', 'get_notification_preferences_service', 'get_notification_workspace_settings_service',
        'mark_notifications_read_service', 'mark_notifications_seen_service', 'notification_dispatch_alerts_service',
        'notification_resolve', 'notification_route', 'notify', 'notify_account_security', 'notify_deciders', 'notify_holders', 'notify_rows', 'notify_workspace_closing',
        'purge_expired_notifications', 'raise_notification_alerts_service', 'release_notification_emails_service',
        'release_notification_push_service',
        'save_notification_preferences_service', 'save_notification_push_subscription_service',
        'save_notification_workspace_settings_service'],
  '(a) no function named for notifications or notices is left but the new system''s (its producers'' helpers too)');
select ok(to_regtype('public.notification_category') is null, '(a) the notification_category type is gone');
select is((select count(*)::integer from pg_policies where schemaname = 'realtime' and tablename = 'messages'
           and policyname = 'people hear their own account notifications'), 0,
  '(a) nobody listens for account notifications on live updates');
select is(array(select policyname::text from pg_policies where policyname ~ 'notif' order by 1),
  array['people hear their own notification signals'], '(a) no policy is named for notifications but the new system''s');
select is(array(select jobname::text from cron.job where jobname ~ 'notif' order by 1),
  array['notification-dispatch', 'notification-heartbeat', 'notification-retention'],
  '(a) no scheduled job sends notifications but the new system''s: its one dispatcher for every channel and its heartbeat (BILDIRIM-DAGITICI) and the one that deletes expired ones');
-- The domain work they served is still here. Time off rebuild D8: the old time-off sweep (time_off_sweep) went
-- with the old time off; the new requests' sweep does its work (time off rebuild D6).
select ok(to_regprocedure('public.record_account_security_event_service(uuid, text, jsonb)') is not null
  and to_regprocedure('public.shift_exchange_emit(uuid, uuid, uuid, uuid, text, text, text)') is not null
  and to_regprocedure('app_private.announcement_release(uuid)') is not null
  and to_regprocedure('app_private.time_off_requests_sweep(integer, interval)') is not null,
  '(a) the domain work stays: security audit, exchange history, announcement release, time-off sweep');

-- (b) ----------------------------------------------------------------------------------------------

-- Every function body still in the database, read for a dropped function or table as a whole word
-- outside a quoted string ('notifications.read' is a permission that stays).
select is(
  array(select n.nspname || '.' || p.proname || ': ' || d.name
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        join dropped d on p.prosrc ~ ('(?<!'')\m' || case when d.kind = 'table' then split_part(d.name, '.', 2) else d.name end || '\M')
        where n.nspname in ('public', 'app_private', 'tests') and p.prokind = 'f'
        order by 1),
  '{}'::text[], '(b) no function calls a dropped function or reads a dropped table');

-- (c) ----------------------------------------------------------------------------------------------

select is(
  array(select table_name || '.' || column_name from information_schema.columns
        where table_schema = 'public'
          and (table_name, column_name) in (('employee_onboarding_cases', 'document_notified_restricted'),
            ('schedule_time_off_requests', 'fallback_notified_at'), ('schedule_time_off_requests', 'reminded_at'),
            ('shift_exchange_events', 'notification_sequence'))
        order by 1),
  '{}'::text[], '(c) the columns that only recorded a notice are gone');
select ok(to_regclass('public.shift_exchange_event_notification_order') is null
  and to_regclass('public.shift_exchange_events_notification_sequence_seq') is null,
  '(c) with the exchange history''s notification index and sequence');
select is(
  array(select table_name || '.' || column_name from information_schema.columns
        where table_schema = 'public'
          and (table_name, column_name) in (('announcements', 'delivered_to'),
            ('employee_onboarding_cases', 'document_notification_checked_at'))
        order by 1),
  array['announcements.delivered_to', 'employee_onboarding_cases.document_notification_checked_at'],
  '(c) an announcement''s reach and the document batch order stay');

-- (d) ----------------------------------------------------------------------------------------------

select is(array(select key from public.permissions where key like 'notifications.%' order by 1),
  array['notifications.preferences.write_own', 'notifications.read', 'notifications.read_own'],
  '(d) three notification permissions stay, for the new system');
select is((select count(*)::integer from public.workspace_role_permissions
           where permission_key in ('notifications.settings.read', 'notifications.settings.write', 'notifications.test_send',
             'notifications.delivery_audit.read', 'notifications.dlq.replay', 'notifications.broadcast.approve')), 0,
  '(d) no role holds a notification settings permission');
select is((select count(*)::integer from app_private.role_permission_dependencies
           where permission_key like 'notifications.%' or required_key like 'notifications.%'), 0,
  '(d) nor a dependency between them');
-- notifications.write_own is the new system's (BILDIRIM-07).
select is(array(select key from app_private.authz_actions where key like '%notifications%' order by 1),
  array['notifications.read_own', 'notifications.write_own'], '(d) the core answers notifications.read_own and the new system''s write_own only');
select ok((select count(*) from public.workspace_role_permissions g join public.workspace_roles r on r.id = g.role_id
           where r.workspace_id = tests.id('nd') and g.permission_key = 'notifications.read') > 0,
  '(d) roles still hold the permissions that stay');

-- (e) ----------------------------------------------------------------------------------------------

create temp table home as select public.get_workspace_dashboard_service(tests.user('nd:owner'), tests.id('nd')) j;
select is((select array(select k from jsonb_object_keys(j) k order by k) from home),
  array['announcements', 'display_name', 'layout', 'metrics', 'today_ends_at', 'todos', 'workspace_id'],
  '(e) the Workspace home answer has no notification list');
select is((select array(select k from jsonb_object_keys(j -> 'metrics') k order by k) from home),
  array['pending_time_off_count', 'today_open_shift_count', 'today_shift_count'],
  '(e) and no unread count');
select is((select j -> 'layout' -> 'widget_order' from home),
  '["operations", "pending_requests", "open_shifts", "announcements", "todos", "quick_actions"]'::jsonb,
  '(e) six cards, in their place');
select is(public.normalize_workspace_widget_order(array['quick_actions', 'notifications', 'todos']),
  array['quick_actions', 'todos', 'operations', 'pending_requests', 'open_shifts', 'announcements'],
  '(e) a saved order that names the old card keeps the rest in its order');
select is(public.save_workspace_layout_service(tests.user('nd:owner'), tests.id('nd'),
  array['todos', 'operations', 'pending_requests', 'open_shifts', 'announcements', 'quick_actions'], array['quick_actions']),
  '{"status": "saved"}'::jsonb, '(e) six cards save');
select is((select j -> 'layout' from (select public.get_workspace_dashboard_service(tests.user('nd:owner'), tests.id('nd')) j) x),
  '{"widget_order": ["todos", "operations", "pending_requests", "open_shifts", "announcements", "quick_actions"], "hidden_widget_ids": ["quick_actions"]}'::jsonb,
  '(e) and read back as saved');
select throws_ok($$select public.save_workspace_layout_service(tests.user('nd:owner'), tests.id('nd'),
  array['operations', 'pending_requests', 'open_shifts', 'announcements', 'todos', 'notifications', 'quick_actions'], '{}')$$,
  '22023', 'valid workspace layout required', '(e) seven with the old card do not');
select throws_ok($$select public.save_workspace_layout_service(tests.user('nd:owner'), tests.id('nd'),
  array['operations', 'pending_requests', 'open_shifts', 'announcements', 'todos', 'quick_actions'], array['notifications'])$$,
  '22023', 'valid workspace layout required', '(e) nor does hiding it');

-- (f) ----------------------------------------------------------------------------------------------

-- Remind is an action again: an unknown post is refused as out of scope, not as an unknown action.
select throws_ok($$select public.set_announcement_state_service(tests.user('nd:owner'), tests.id('nd'), gen_random_uuid(), 1, 'remind')$$,
  '42501', 'Not allowed', '(f) Remind is back on the new system (BILDIRIM-U6)');

-- (g) ----------------------------------------------------------------------------------------------

select is((select array(select k from jsonb_object_keys(public.documents_maintain_service(1)) k order by k)),
  array['checked', 'suspended'], '(g) document maintenance answers what it checked and restricted');

select * from finish();
rollback;
