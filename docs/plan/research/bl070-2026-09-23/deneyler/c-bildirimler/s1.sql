\echo == S1 auto: Ali asks for preferred name
select public.request_employee_preferred_name_service('c0000000-0000-4000-8000-000000000005','c0100000-0000-4000-8000-000000000001','c0400000-0000-4000-8000-000000000005','Alican');
select type_key, status, payload from public.notification_outbox where workspace_id='c0100000-0000-4000-8000-000000000001';
update public.notification_outbox set status='leased', lease_owner='cb-worker', lease_expires_at=now()+interval '1 minute' where workspace_id='c0100000-0000-4000-8000-000000000001';
savepoint p1;
select public.process_notification_outbox_service('cb-worker', id) from public.notification_outbox where workspace_id='c0100000-0000-4000-8000-000000000001';
rollback to savepoint p1;
\echo == what the worker does on failure
select public.fail_notification_outbox_service('cb-worker', id, 'notification recipients are required') from public.notification_outbox where workspace_id='c0100000-0000-4000-8000-000000000001';
\echo == inbox of owner / managers after
select u, public.get_notification_inbox_v2_service(u,'c0100000-0000-4000-8000-000000000001',null,null,null,null,null,30)->'notifications' from unnest(array['c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000004']::uuid[]) u;
\echo == S1b manager mode
select public.set_employee_name_settings_service('c0000000-0000-4000-8000-000000000001','c0100000-0000-4000-8000-000000000001','manager');
select public.request_employee_preferred_name_service('c0000000-0000-4000-8000-000000000005','c0100000-0000-4000-8000-000000000001','c0400000-0000-4000-8000-000000000005','Ali K');
select type_key, status, payload ? 'recipient_user_ids' has_recipients from public.notification_outbox where workspace_id='c0100000-0000-4000-8000-000000000001' order by created_at;
\echo == who can list/decide pending: Burak (Besiktas manager) and Mehmet (Kadikoy)
select 'burak', count(*) from public.list_pending_preferred_names_service('c0000000-0000-4000-8000-000000000004','c0100000-0000-4000-8000-000000000001');
\echo == Zeynep (Besiktas only) asks; can Mehmet (Kadikoy) see/decide?
select public.request_employee_preferred_name_service('c0000000-0000-4000-8000-000000000006','c0100000-0000-4000-8000-000000000001','c0400000-0000-4000-8000-000000000006','Zeyno');
savepoint p2;
select 'mehmet sees', employee_name, requested_name from public.list_pending_preferred_names_service('c0000000-0000-4000-8000-000000000003','c0100000-0000-4000-8000-000000000001');
rollback to savepoint p2;
select public.decide_employee_preferred_name_service('c0000000-0000-4000-8000-000000000003','c0100000-0000-4000-8000-000000000001',(select id from employee_preferred_name_requests where employee_id='c0400000-0000-4000-8000-000000000006' and status='pending'),true);
select 'zeynep preferred after mehmet decision', preferred_name from employee_profiles where id='c0400000-0000-4000-8000-000000000006';
\echo == Mehmet asks his own and approves himself
select public.request_employee_preferred_name_service('c0000000-0000-4000-8000-000000000003','c0100000-0000-4000-8000-000000000001','c0400000-0000-4000-8000-000000000003','Memo');
select public.decide_employee_preferred_name_service('c0000000-0000-4000-8000-000000000003','c0100000-0000-4000-8000-000000000001',(select id from employee_preferred_name_requests where employee_id='c0400000-0000-4000-8000-000000000003' and status='pending'),true);
select 'mehmet preferred after self decision', preferred_name from employee_profiles where id='c0400000-0000-4000-8000-000000000003';
