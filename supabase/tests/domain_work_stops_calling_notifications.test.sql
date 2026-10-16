begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- BILDIRIM-04 (teardown part C1, KARARLAR S-123): the domain work stops calling the old notification
-- system. What changes shape or order with it, and what goes:
--   (a) publishing has one form, without anybody named to notify;
--   (b) the Workspace home answer keeps its shape, its notifications box empty until part C2;
--   (c) a shift exchange whose terms change finds its own history row without the notification
--       sequence, also when its terms change twice in one transaction;
--   (d) the three triggers that turned a domain row into a notification, the outbox job and the
--       account notification table's place in the live updates are gone.
-- That no domain function calls a notification object any more: domain_work_outlives_notifications.

select tests.world('dn');
select tests.person('dn', 'ali', 'employee', array['K'], array['cook']);
select tests.person('dn', 'deniz', 'employee', array['K'], array['cook']);

-- (a) ---------------------------------------------------------------------------------------------

select is(
  array(select p.oid::regprocedure::text from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = 'publish_schedule_draft_service'),
  array['publish_schedule_draft_service(uuid,uuid,uuid,uuid[],uuid[],boolean,integer,text,jsonb)'],
  '(a) publish has one form, and it names nobody to notify');
select is((select pg_get_function_identity_arguments(p.oid) like '%target_notify_employee_ids%' from pg_proc p
           where p.oid = 'public.publish_schedule_draft_service'::regproc), false,
  '(a) target_notify_employee_ids is gone');
select ok(has_function_privilege('service_role', 'public.publish_schedule_draft_service(uuid,uuid,uuid,uuid[],uuid[],boolean,integer,text,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.publish_schedule_draft_service(uuid,uuid,uuid,uuid[],uuid[],boolean,integer,text,jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.publish_schedule_draft_service(uuid,uuid,uuid,uuid[],uuid[],boolean,integer,text,jsonb)', 'execute'),
  '(a) only the API runs it, as before');
-- The test world publishes through it.
select tests.publish_week('dn', 1, '[
  {"label": "ali-tue", "person": "ali", "loc": "K", "job": "cook", "day": 1, "start": "09:00", "end": "15:00"}
]');
select is((select employee_id from public.schedule_published_shifts where id = tests.id('dn:shift:ali-tue')), tests.id('dn:ali'),
  '(a) a week goes out: Ali''s Tuesday is published');

-- (b) ---------------------------------------------------------------------------------------------

create temp table home as select public.get_workspace_dashboard_service(tests.user('dn:owner'), tests.id('dn')) j;
select is((select array(select k from jsonb_object_keys(j) k order by k) from home),
  array['announcements', 'display_name', 'layout', 'metrics', 'notifications', 'today_ends_at', 'todos', 'workspace_id'],
  '(b) the Workspace home answer keeps every key');
select is((select array(select k from jsonb_object_keys(j -> 'metrics') k order by k) from home),
  array['pending_time_off_count', 'today_open_shift_count', 'today_shift_count', 'unread_notification_count'],
  '(b) and every count');
select is((select j -> 'notifications' from home), '[]'::jsonb, '(b) its notifications list is empty');
select is((select j -> 'metrics' -> 'unread_notification_count' from home), '0'::jsonb, '(b) and its unread count 0, a number');
select ok((select j -> 'layout' -> 'widget_order' ? 'notifications' from home), '(b) the notifications box keeps its place until part C2');

-- (c) ---------------------------------------------------------------------------------------------

select tests.cover_case('dn', 'ali-tue', 'ali', 'deniz');
create function pg_temp.flush() returns void language plpgsql as $$ begin
  set constraints weekly_exchange_shift_terms_changed, weekly_exchange_publication_terms_changed immediate;
  set constraints weekly_exchange_shift_terms_changed, weekly_exchange_publication_terms_changed deferred;
end $$;
create temp table before_change as select revision from public.shift_exchange_cases where id = tests.id('dn:case:ali-tue');
-- Ali's Tuesday changes twice in this one transaction: both history rows have the same created_at.
update public.schedule_published_shifts set start_time = '10:00' where id = tests.id('dn:shift:ali-tue');
select pg_temp.flush();
update public.schedule_published_shifts set start_time = '11:00' where id = tests.id('dn:shift:ali-tue');
select pg_temp.flush();
select is((select count(*)::integer from public.shift_exchange_events
           where case_id = tests.id('dn:case:ali-tue') and action = 'terms_changed'), 2,
  '(c) two changes, two history rows');
select is((select count(distinct created_at)::integer from public.shift_exchange_events
           where case_id = tests.id('dn:case:ali-tue') and action = 'terms_changed'), 1,
  '(c) written at the same moment');
-- Each row holds its own change, in the order the rows were written (what the notification
-- sequence used to pick): the first 09:00 -> 10:00, the second 10:00 -> 11:00.
select is(
  array(select (e.details -> 'before' -> 'offered' ->> 'start_time') || '->' || (e.details -> 'after' -> 'offered' ->> 'start_time')
        || ' r' || (e.details -> 'after' ->> 'revision')
        from public.shift_exchange_events e
        where e.case_id = tests.id('dn:case:ali-tue') and e.action = 'terms_changed' order by e.notification_sequence),
  (select array['09:00:00->10:00:00 r' || (revision + 1), '10:00:00->11:00:00 r' || (revision + 2)] from before_change),
  '(c) each change finds its own row: the same row the notification sequence picked');

-- (d) ---------------------------------------------------------------------------------------------

select is(
  array(select c.relname || '.' || t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where not t.tgisinternal
          and t.tgname in ('notify_time_off_event', 'document_notification_audit', 'project_account_security_notification')
        order by 1),
  '{}'::text[], '(d) the three triggers are gone');
select is((select count(*)::integer from cron.job where jobname = 'notification-outbox'), 0, '(d) the outbox job is gone');
select is((select count(*)::integer from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'account_notification_items'), 0,
  '(d) account notifications are no longer sent live');
-- Their functions stay for part C2.
select ok(to_regprocedure('public.notify_schedule_request_event_service()') is not null
  and to_regprocedure('app_private.notify_document_audit()') is not null
  and to_regprocedure('app_private.project_account_security_notification()') is not null,
  '(d) the trigger functions are still there for part C2 to drop');

-- A time-off request, a document event and a security event write no notification now.
select tests.leave('dn', 'ali', 2);
select public.record_account_security_event_service(tests.user('dn:ali'), 'account.password_changed');
select is((select count(*)::integer from public.notification_outbox where workspace_id = tests.id('dn')), 0,
  '(d) nothing in this workspace queued a notification');
select is((select count(*)::integer from public.account_notification_items where user_id = tests.user('dn:ali')), 0,
  '(d) nor an account notification');

select * from finish();
rollback;
