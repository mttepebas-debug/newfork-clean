\echo == S2 Ali time off filed under Kadikoy
insert into public.schedule_time_off_requests (id, workspace_id, employee_id, location_id, reason, created_by) values
 ('c0500000-0000-4000-8000-000000000001','c0100000-0000-4000-8000-000000000001','c0400000-0000-4000-8000-000000000005','c0300000-0000-4000-8000-000000000001','Vacation','c0000000-0000-4000-8000-000000000005');
insert into public.schedule_time_off_events (id, workspace_id, request_id, action, actor_user_id) values
 ('c0600000-0000-4000-8000-000000000001','c0100000-0000-4000-8000-000000000001','c0500000-0000-4000-8000-000000000001','submitted','c0000000-0000-4000-8000-000000000005');
select 'ali-timeoff recipients', (select string_agg(m.role::text, ',' order by m.role) from jsonb_array_elements_text(payload->'recipient_user_ids') r join workspace_memberships m on m.user_id=r::uuid and m.workspace_id=workspace_id) from notification_outbox where event_id='c0600000-0000-4000-8000-000000000001';
select 'recipient users', payload->'recipient_user_ids' from notification_outbox where event_id='c0600000-0000-4000-8000-000000000001';
\echo == S3 Mehmet (Kadikoy manager) own time off under Kadikoy
insert into public.schedule_time_off_requests (id, workspace_id, employee_id, location_id, reason, created_by) values
 ('c0500000-0000-4000-8000-000000000002','c0100000-0000-4000-8000-000000000001','c0400000-0000-4000-8000-000000000003','c0300000-0000-4000-8000-000000000001','Vacation','c0000000-0000-4000-8000-000000000003');
insert into public.schedule_time_off_events (id, workspace_id, request_id, action, actor_user_id) values
 ('c0600000-0000-4000-8000-000000000002','c0100000-0000-4000-8000-000000000001','c0500000-0000-4000-8000-000000000002','submitted','c0000000-0000-4000-8000-000000000003');
select 'mehmet-own recipients', payload->'recipient_user_ids' from notification_outbox where event_id='c0600000-0000-4000-8000-000000000002';
update public.notification_outbox set status='leased', lease_owner='cb-worker', lease_expires_at=now()+interval '1 minute' where workspace_id='c0100000-0000-4000-8000-000000000001' and status='pending';
select public.process_notification_outbox_service('cb-worker', id)->>'recipient_projections_created' from public.notification_outbox where workspace_id='c0100000-0000-4000-8000-000000000001' and status='leased';
select 'inbox', right(u::text,1) who, n->>'title', n->>'body' from unnest(array['c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000004']::uuid[]) u,
 lateral jsonb_array_elements(public.get_notification_inbox_v2_service(u,'c0100000-0000-4000-8000-000000000001',null,null,null,null,null,30)->'notifications') n;
