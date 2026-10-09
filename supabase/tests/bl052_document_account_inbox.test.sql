begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('15200000-0000-4000-8000-00000000000'||n)::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','bl052-'||n||'@example.test','','{}','{}',now(),now() from generate_series(1,3) n;
insert into public.workspaces(id,name,created_by) values('25200000-0000-4000-8000-000000000001','BL052 test','15200000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations) values
 ('35200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000001','owner','active',true),
 ('35200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000002','employee','active',true);
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,preferred_name,invitation_email,created_by)
values('45200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000002','E-0001','Document','Employee','','bl052-2@example.test','15200000-0000-4000-8000-000000000001');
insert into public.employee_onboarding_cases(id,workspace_id,employee_id,membership_id)
values('55200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','35200000-0000-4000-8000-000000000002');
insert into public.employee_onboarding_requirements(id,workspace_id,employee_id,case_id,kind,title,required,blocks_activation,requires_review,sort_order,source_snapshot,lifecycle_user_id,lifecycle_settings,deadline_at)
values('65200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','55200000-0000-4000-8000-000000000001','document','Certification',true,false,true,1,
 '{"accepted_formats":["pdf"],"tracks_expiry":true,"timezone":"America/Los_Angeles"}','15200000-0000-4000-8000-000000000002',
 '{"mode":"conditional","target":{"location_ids":[],"department_ids":[],"job_ids":[],"employee_ids":[]},"assignment_scope":"all_active","period_days":7,"suspend_on_overdue":true,"extra_fields":[]}',now()+interval '7 days');

insert into public.locations(id,workspace_id,name,short_name,street_address,city,region,postal_code,country_code,timezone) values
 ('85200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','West','WEST','1 Road','City','CA','90012','US','America/Los_Angeles'),
 ('85200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001','East','EAST','2 Road','City','NY','10001','US','America/New_York');
insert into public.departments(id,workspace_id,name) values('95200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','Kitchen');
insert into public.jobs(id,workspace_id,department_id,name) values
 ('a5200000-0000-4000-8000-000000000001','25200000-0000-4000-8000-000000000001','95200000-0000-4000-8000-000000000001','Cook'),
 ('a5200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001',null,'Host');
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by)
select '25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001',id,id='85200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000001' from public.locations where workspace_id='25200000-0000-4000-8000-000000000001';
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by)
select '25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001',id,'15200000-0000-4000-8000-000000000001' from public.jobs where workspace_id='25200000-0000-4000-8000-000000000001';

set constraints all immediate;

-- BL-245: the lease takes the oldest 100 due rows of every workspace, so rows
-- other runs left in a shared local queue push this test's own rows out of
-- the window. Park them for this transaction only (the file rolls back).
create function pg_temp.park_other_outbox() returns void language sql as $$
  update public.notification_outbox set available_at = now() + interval '1 day'
  where workspace_id <> '25200000-0000-4000-8000-000000000001' and status in ('pending', 'retry');
  update public.notification_outbox set lease_expires_at = now() + interval '1 day'
  where workspace_id <> '25200000-0000-4000-8000-000000000001' and status = 'leased';
$$;

select app_private.enqueue_document_notification('25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000002','inbox-assigned','assigned','Document request','Open Documents','65200000-0000-4000-8000-000000000001');
select app_private.enqueue_document_notification('25200000-0000-4000-8000-000000000001','45200000-0000-4000-8000-000000000001','15200000-0000-4000-8000-000000000002','inbox-missing','missing','Documents need attention','Open Documents');
select pg_temp.park_other_outbox();
create temp table leased as select * from public.lease_notification_outbox_service('bl052-account-worker',100,60);
select public.process_notification_outbox_service('bl052-account-worker',id) from leased;
select public.record_account_security_notification_service('15200000-0000-4000-8000-000000000002','account.password_changed');
create temp table selected_item as select i.id from public.notification_inbox_items i join public.notification_recipients r on r.id=i.recipient_projection_id join public.notification_events e on e.id=r.event_id where e.type_key='people.documents.assigned';
create function pg_temp.inbox(u uuid default '15200000-0000-4000-8000-000000000002') returns jsonb language sql as $$
 select public.get_notification_inbox_v2_service(u,null,null,null,null,null,null,30);
$$;
select is(jsonb_array_length(pg_temp.inbox()->'notifications'),3,'Account inbox includes own self-document notices and unchanged security event');
select is(pg_temp.inbox()->>'unread_count','3','Account unread count matches eligible list');
select ok(exists(select 1 from jsonb_array_elements(pg_temp.inbox()->'notifications') n where n->>'safe_preview' like 'BL052 test%' and n->>'workspace_id'='25200000-0000-4000-8000-000000000001' and n->>'action_url' like '/app/account/documents?workspace=%'),'neutral self notice retains organization identity and safe document link');
select is(jsonb_array_length(pg_temp.inbox('15200000-0000-4000-8000-000000000003')->'notifications'),0,'another recipient cannot read these notices');
select throws_ok($$select public.act_on_notification_inbox_item_v2_service('15200000-0000-4000-8000-000000000003',null,(select id from selected_item),'read')$$,'P0002',null,'another recipient cannot mutate a document notice');
update public.workspace_memberships set status='pending_activation' where user_id='15200000-0000-4000-8000-000000000002';
select is(jsonb_array_length(pg_temp.inbox()->'notifications'),3,'pending onboarding retains own Account document notices');
update public.workspace_memberships set status='active' where user_id='15200000-0000-4000-8000-000000000002';
update public.employee_onboarding_requirements set deadline_at=now()-interval '1 day' where id='65200000-0000-4000-8000-000000000001';
select is(public.get_employee_document_access_service('15200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001')->>'restricted','true','fixture has real document restriction');
select is(jsonb_array_length(pg_temp.inbox()->'notifications'),3,'restricted employee retains own Account notices');
create temp table first_page as select public.get_notification_inbox_v2_service('15200000-0000-4000-8000-000000000002',null,null,null,null,null,null,1) j;
select is((select jsonb_array_length(public.get_notification_inbox_v2_service('15200000-0000-4000-8000-000000000002',null,null,null,null,(j->'next_cursor'->>'created_at')::timestamptz,(j->'next_cursor'->>'id')::uuid,30)->'notifications') from first_page),2,'Account cursor paginates security and eligible document notices together');
select is(public.act_on_notification_inbox_item_v2_service('15200000-0000-4000-8000-000000000002',null,(select id from selected_item),'read')->>'affected','1','restricted recipient can mark own notice read');
select is(pg_temp.inbox()->>'unread_count','2','item action and unread count use the same scope');
select is(public.act_on_notification_inbox_item_v2_service('15200000-0000-4000-8000-000000000002',null,null,'read_all')->>'affected','3','Account read all covers own visible documents and security');
select is(pg_temp.inbox()->>'unread_count','0','Account read all clears exactly eligible unread notices');
update public.employee_onboarding_requirements set lifecycle_retired_at=now() where id='65200000-0000-4000-8000-000000000001';
select is(jsonb_array_length(pg_temp.inbox()->'notifications'),1,'retired requirement hides document notices while preserving security');
select throws_ok($$select public.act_on_notification_inbox_item_v2_service('15200000-0000-4000-8000-000000000002',null,(select id from selected_item),'unread')$$,'P0002',null,'retired notice is also unavailable to item actions');
update public.employee_onboarding_requirements set lifecycle_retired_at=null where id='65200000-0000-4000-8000-000000000001';
update public.notification_inbox_items set visibility_state='superseded' where id=(select id from selected_item);
select is(jsonb_array_length(pg_temp.inbox()->'notifications'),2,'superseded item is excluded from Account');
update public.notification_inbox_items set visibility_state='visible' where id=(select id from selected_item);
update public.employee_profiles set user_id=null where id='45200000-0000-4000-8000-000000000001';
select is(jsonb_array_length(pg_temp.inbox()->'notifications'),1,'unlinked account loses document notices but keeps security');
select throws_ok($$select public.act_on_notification_inbox_item_v2_service('15200000-0000-4000-8000-000000000002',null,(select id from selected_item),'read')$$,'P0002',null,'unlinked account loses document item actions');
update public.employee_profiles set user_id='15200000-0000-4000-8000-000000000002' where id='45200000-0000-4000-8000-000000000001';
delete from public.workspace_memberships where user_id='15200000-0000-4000-8000-000000000002';
select is(jsonb_array_length(pg_temp.inbox()->'notifications'),1,'revoked organization membership cannot expose retained document notices');
select * from finish();rollback;

