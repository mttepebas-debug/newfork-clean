begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- BILDIRIM-04 (teardown part C1, KARARLAR S-123): the domain work stops calling the old notification
-- system. What changes shape or order with it, and what goes:
--   (a) publishing has one form, without anybody named to notify;
--   (b) the Workspace home answer has no notifications box (part C2 dropped it, BILDIRIM-06);
--   (c) a shift exchange whose terms change finds its own history row without the notification
--       sequence (dropped in C2), also when its terms change twice in one transaction;
--   (d) the three triggers that turned a domain row into a notification and the outbox job are gone,
--       their functions too since C2.
-- That nothing of the old system is left: old_notifications_are_dropped.

select tests.world('dn');
select tests.person('dn', 'ali', 'employee', array['K'], array['cook']);
select tests.person('dn', 'deniz', 'employee', array['K'], array['cook']);

-- (a) ---------------------------------------------------------------------------------------------

select is(
  array(select p.oid::regprocedure::text from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = 'publish_schedule_draft_service'),
  array['publish_schedule_draft_service(uuid,uuid,uuid,uuid[],uuid[],boolean,integer,text,jsonb,text)'],
  '(a) publish has one form, and it names nobody to notify (its last argument is the open shifts'' choice)');
select is((select pg_get_function_identity_arguments(p.oid) like '%target_notify_employee_ids%' from pg_proc p
           where p.oid = 'public.publish_schedule_draft_service'::regproc), false,
  '(a) target_notify_employee_ids is gone');
select ok(has_function_privilege('service_role', 'public.publish_schedule_draft_service(uuid,uuid,uuid,uuid[],uuid[],boolean,integer,text,jsonb,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.publish_schedule_draft_service(uuid,uuid,uuid,uuid[],uuid[],boolean,integer,text,jsonb,text)', 'execute')
  and not has_function_privilege('anon', 'public.publish_schedule_draft_service(uuid,uuid,uuid,uuid[],uuid[],boolean,integer,text,jsonb,text)', 'execute'),
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
  array['announcements', 'display_name', 'layout', 'metrics', 'today_ends_at', 'todos', 'workspace_id'],
  '(b) the Workspace home answer has no notifications list');
select is((select array(select k from jsonb_object_keys(j -> 'metrics') k order by k) from home),
  array['pending_time_off_count', 'today_open_shift_count', 'today_shift_count'],
  '(b) nor an unread count');
select ok(not (select j -> 'layout' -> 'widget_order' ? 'notifications' from home), '(b) nor a notifications box');

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
-- Each row holds its own change: the first 09:00 -> 10:00 at revision r+1, the second
-- 10:00 -> 11:00 at r+2. (The notification sequence that used to order them is gone.)
select is(
  array(select (e.details -> 'before' -> 'offered' ->> 'start_time') || '->' || (e.details -> 'after' -> 'offered' ->> 'start_time')
        || ' r' || (e.details -> 'after' ->> 'revision')
        from public.shift_exchange_events e
        where e.case_id = tests.id('dn:case:ali-tue') and e.action = 'terms_changed' order by (e.details -> 'after' ->> 'revision')::integer),
  (select array['09:00:00->10:00:00 r' || (revision + 1), '10:00:00->11:00:00 r' || (revision + 2)] from before_change),
  '(c) each change finds its own row');

-- (d) ---------------------------------------------------------------------------------------------

select is(
  array(select c.relname || '.' || t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where not t.tgisinternal
          and t.tgname in ('notify_time_off_event', 'document_notification_audit', 'project_account_security_notification')
        order by 1),
  '{}'::text[], '(d) the three triggers are gone');
select is((select count(*)::integer from cron.job where jobname = 'notification-outbox'), 0, '(d) the outbox job is gone');
select ok(to_regprocedure('public.notify_schedule_request_event_service()') is null
  and to_regprocedure('app_private.notify_document_audit()') is null
  and to_regprocedure('app_private.project_account_security_notification()') is null,
  '(d) and their functions (part C2)');
-- A time-off request and a security event still go through.
select tests.leave('dn', 'ali', 2);
select public.record_account_security_event_service(tests.user('dn:ali'), 'account.password_changed');
select is((select count(*)::integer from app_private.security_audit_events
           where actor_user_id = tests.user('dn:ali') and event_type = 'account.password_changed'), 1,
  '(d) a security event is recorded without its old trigger');

select * from finish();
rollback;
