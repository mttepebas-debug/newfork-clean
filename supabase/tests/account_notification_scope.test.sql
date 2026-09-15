begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('b5500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','gate3-'||n||'@example.test','','{}','{}',now(),now() from generate_series(1,3) n;
insert into public.workspaces(id,name,created_by)
select ('b5510000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Gate3 '||n,'b5500000-0000-4000-8000-000000000001' from generate_series(1,2) n;
insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations)
select id,'b5500000-0000-4000-8000-000000000001','owner','active',true from public.workspaces where name like 'Gate3 %';
insert into public.notification_events(id,workspace_id,type_key,schema_version,subject_type,subject_id,payload_digest,sensitivity,occurred_at)
select id,id,'schedule.published',1,'schedule_week','test',repeat('a',64),'confidential',now() from public.workspaces where name like 'Gate3 %';
insert into public.notification_recipients(workspace_id,event_id,recipient_user_id,audience_reason,policy_snapshot)
select id,id,'b5500000-0000-4000-8000-000000000001','{}','{}' from public.workspaces where name like 'Gate3 %';
insert into public.notification_inbox_items(workspace_id,recipient_projection_id,title,body)
select workspace_id,id,'Workspace only','Workspace message' from public.notification_recipients where recipient_user_id='b5500000-0000-4000-8000-000000000001';
create function pg_temp.inbox(w uuid default null,u uuid default 'b5500000-0000-4000-8000-000000000001') returns jsonb language sql as $$
 select public.get_notification_inbox_v2_service(u,w,null,null,null,null,null,30);
$$;
select public.record_account_security_notification_service('b5500000-0000-4000-8000-000000000001','account.password_changed');
select public.record_account_security_notification_service('b5500000-0000-4000-8000-000000000002','account.sessions_revoked');
select is(jsonb_array_length(pg_temp.inbox()->'notifications'),1,'account inbox works without any workspace');
select is(pg_temp.inbox()->'notifications'->0->>'scope','account','global row exposes explicit account scope');
select is(pg_temp.inbox()->'notifications'->0->>'workspace_id',null,'account row has no synthetic tenant');
select is(jsonb_array_length(pg_temp.inbox('b5510000-0000-4000-8000-000000000001')->'notifications'),2,'workspace A includes global plus A only');
select is(jsonb_array_length(pg_temp.inbox('b5510000-0000-4000-8000-000000000002')->'notifications'),2,'workspace B includes same global plus B only');
select is(jsonb_array_length(pg_temp.inbox(null,'b5500000-0000-4000-8000-000000000003')->'notifications'),0,'other account cannot see either user event');
select throws_ok($$select pg_temp.inbox('b5510000-0000-4000-8000-000000000001','b5500000-0000-4000-8000-000000000002')$$,'42501','notification inbox access required','non-member cannot read tenant even with own global event');
select is(pg_temp.inbox('b5510000-0000-4000-8000-000000000001')->>'unread_count','2','combined unread badge counts both scopes');
create temp table first_page as select public.get_notification_inbox_v2_service('b5500000-0000-4000-8000-000000000001','b5510000-0000-4000-8000-000000000001',null,null,null,null,null,1) j;
select ok((select j->'next_cursor' <> 'null'::jsonb from first_page),'mixed inbox has a next cursor');
select is((select jsonb_array_length(public.get_notification_inbox_v2_service('b5500000-0000-4000-8000-000000000001','b5510000-0000-4000-8000-000000000001',null,null,null,(j->'next_cursor'->>'created_at')::timestamptz,(j->'next_cursor'->>'id')::uuid,1)->'notifications') from first_page),1,'mixed pagination returns remaining event');
select is(jsonb_array_length(public.get_notification_inbox_v2_service('b5500000-0000-4000-8000-000000000001','b5510000-0000-4000-8000-000000000001','security',null,null,null,null,30)->'notifications'),1,'security category filters both scopes');
select throws_ok($$select public.act_on_notification_inbox_item_v2_service('b5500000-0000-4000-8000-000000000002',null,(select id from public.account_notification_items where user_id='b5500000-0000-4000-8000-000000000001'),'read')$$,'P0002','notification inbox item not found','other account cannot mark global event read');
select is(public.act_on_notification_inbox_item_v2_service('b5500000-0000-4000-8000-000000000001','b5510000-0000-4000-8000-000000000001',null,'read_all')->>'affected','2','read all applies to global plus selected workspace');
select is(pg_temp.inbox('b5510000-0000-4000-8000-000000000002')->>'unread_count','1','read all leaves other tenant unread');
select is(public.get_notification_user_preferences_service('b5500000-0000-4000-8000-000000000003',null)->>'email_channel_reason','email_unverified','email lock is derived from Auth verification');
update auth.users set email_confirmed_at=now() where id='b5500000-0000-4000-8000-000000000003';
select is(public.get_notification_user_preferences_service('b5500000-0000-4000-8000-000000000003',null)->>'email_channel_reason','delivery_unavailable','verified email still requires actual sender');
select is(jsonb_array_length(public.get_notification_user_preferences_service('b5500000-0000-4000-8000-000000000003',null)->'account_catalog'),6,'mandatory security catalog has six real projections');
select is((select count(*)::int from jsonb_array_elements(public.get_notification_user_preferences_service('b5500000-0000-4000-8000-000000000001','b5510000-0000-4000-8000-000000000001')->'catalog') e where e->>'type_key' like 'security.account.%'),0,'global events never become workspace preferences');
select is(public.notification_default_channels_service('b5500000-0000-4000-8000-000000000001','schedule.published')->>'email','disabled','new account informative emails default off');
select is(public.notification_default_channels_service('b5500000-0000-4000-8000-000000000001','requests.time_off.submitted')->>'email','enabled','new account action-required emails default on');
insert into app_private.notification_legacy_default_accounts values('b5500000-0000-4000-8000-000000000001');
select is(public.notification_default_channels_service('b5500000-0000-4000-8000-000000000001','schedule.published')->>'email','enabled','existing account implicit default preserved');
insert into public.notification_user_preferences(workspace_id,user_id,preference_scope,scope_key,channel_preferences,cadence,quiet_hours,timezone)
values('b5510000-0000-4000-8000-000000000001','b5500000-0000-4000-8000-000000000001','type','schedule.published','{"email":"enabled","push":"disabled"}','daily_digest','{"enabled":true,"start":"22:00","end":"07:00"}','UTC');
select lives_ok($$select public.save_notification_user_preferences_service('b5500000-0000-4000-8000-000000000001','b5510000-0000-4000-8000-000000000001','[{"preference_scope":"type","scope_key":"schedule.published","channel_preferences":{"in_app":"disabled","email":"enabled"},"cadence":"daily_digest","quiet_hours":{"enabled":true,"start":"22:00","end":"07:00"},"timezone":"UTC","expected_version":1}]')$$,'in-app save retains existing locked email value');
select is((select channel_preferences->>'push' from public.notification_user_preferences where user_id='b5500000-0000-4000-8000-000000000001'),'disabled','omitted push preference survives save');
select is((select cadence from public.notification_user_preferences where user_id='b5500000-0000-4000-8000-000000000001'),'daily_digest','stored digest survives save');
select is((select quiet_hours->>'start' from public.notification_user_preferences where user_id='b5500000-0000-4000-8000-000000000001'),'22:00','stored quiet hours survive save');
select throws_ok($$select public.save_notification_user_preferences_service('b5500000-0000-4000-8000-000000000001','b5510000-0000-4000-8000-000000000001','[{"preference_scope":"type","scope_key":"security.account.password_changed","channel_preferences":{"in_app":"disabled"},"expected_version":null}]')$$,'42501','account security notifications are mandatory','global security cannot be disabled through workspace save');
set local role authenticated;
select set_config('request.jwt.claim.sub','b5500000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.account_notification_items),1,'Realtime SELECT RLS returns only own account');
select throws_ok($$select public.record_account_security_notification_service('b5500000-0000-4000-8000-000000000001','account.password_changed')$$,'42501',null,'browser cannot emit service-only security events');
select throws_ok($$select public.get_notification_inbox_v2_service('b5500000-0000-4000-8000-000000000001',null,null,null,null,null,null,30)$$,'42501',null,'browser cannot spoof RPC actor');
select throws_ok($$update public.account_notification_items set user_id='b5500000-0000-4000-8000-000000000001'$$,'42501',null,'browser cannot mutate recipient or read state directly');
reset role;
select throws_ok($$select public.record_account_security_notification_service('b5500000-0000-4000-8000-000000000001','account.external_login')$$,'22023','unsupported account security event','unobservable external events are not fabricated');
select is(public.reconcile_notification_platform_service()->'active_catalog_without_producer','[]'::jsonb,'every active account and workspace catalog event has its delivery boundary registered');
select is(public.reconcile_notification_platform_service()->'active_catalog_without_template','[]'::jsonb,'every active event has a published in-app template');
select public.cancel_account_email_change_service('b5500000-0000-4000-8000-000000000003');
select is(jsonb_array_length(pg_temp.inbox(null,'b5500000-0000-4000-8000-000000000003')->'notifications'),0,'cancelling a nonexistent pending email does not fabricate an event');
update auth.users set email_change='fixture-next@example.test' where id='b5500000-0000-4000-8000-000000000003';
select public.cancel_account_email_change_service('b5500000-0000-4000-8000-000000000003');
select is(pg_temp.inbox(null,'b5500000-0000-4000-8000-000000000003')->'notifications'->0->>'type_key','security.account.email_change_cancelled','real cancellation and mandatory notification commit together');
select throws_ok($$insert into public.account_notification_items(user_id,type_key,event_id) values('b5500000-0000-4000-8000-000000000003','schedule.published',gen_random_uuid())$$,'23514',null,'account storage rejects a workspace catalog type');
select * from finish();
rollback;
