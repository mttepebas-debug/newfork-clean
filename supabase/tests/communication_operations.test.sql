begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('a8000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','comms-manager@example.test','','{}','{}',now(),now()),
 ('a8000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','comms-employee-one@example.test','','{}','{}',now(),now()),
 ('a8000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','comms-employee-two@example.test','','{}','{}',now(),now()),
 ('a8000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','comms-outsider@example.test','','{}','{}',now(),now());
insert into public.user_profiles(user_id,display_name) values
 ('a8000000-0000-4000-8000-000000000001','Scoped Manager'),
 ('a8000000-0000-4000-8000-000000000002','Employee One'),
 ('a8000000-0000-4000-8000-000000000003','Employee Two');
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations) values
 ('a8100000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','a8000000-0000-4000-8000-000000000001','manager','active',false),
 ('a8100000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','a8000000-0000-4000-8000-000000000002','employee','active',false),
 ('a8100000-0000-4000-8000-000000000003','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','a8000000-0000-4000-8000-000000000003','employee','active',false);
insert into public.membership_location_scopes(workspace_id,membership_id,location_id) values
 ('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','a8100000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001'),
 ('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','a8100000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001'),
 ('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','a8100000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000002');
update public.employee_profiles set user_id='a8000000-0000-4000-8000-000000000002' where id='15000000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub','a8000000-0000-4000-8000-000000000002',true);
select is((select is_active from public.list_my_workspaces() where workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'),false,'workspace list returns false when an active preference has not been chosen');
select set_config('request.jwt.claim.sub','',true);

set local role authenticated;
select throws_ok($$select * from public.announcements$$,'42501',null,'browser roles cannot read announcement tables directly');
select throws_ok($$select public.get_announcements_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')$$,'42501',null,'browser roles cannot invoke service announcement RPCs');
reset role;

select throws_ok($$select public.get_announcements_service('a8000000-0000-4000-8000-000000000004','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')$$,'42501','announcement access required','cross-tenant announcement reads fail closed');
select throws_ok($$select public.save_announcement_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null,'No access','Body','general',array['employee'],array['11000000-0000-4000-8000-000000000001']::uuid[],null,null,null)$$,'42501','announcement management required','employees cannot manage announcements');
select throws_ok($$select public.save_announcement_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null,'Other location','Body','operations',array['employee'],array['11000000-0000-4000-8000-000000000002']::uuid[],null,null,null)$$,'42501','announcement location access denied','location-scoped manager cannot target another location');
select throws_ok($$select public.save_announcement_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null,'Everywhere','Body','general',array['employee'],array[]::uuid[],null,null,null)$$,'42501','all-location announcement access required','location-scoped manager cannot broadcast workspace-wide');
select is((public.save_announcement_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null,'Owner draft','Private owner draft','general',array['owner'],array[]::uuid[],null,null,null)->>'status'),'draft','owner can create an all-location draft');
select is((select count(*)::integer from jsonb_array_elements(public.get_announcements_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'announcements') item where item->>'title'='Owner draft'),0,'scoped manager cannot inspect an all-location draft outside control scope');

create temp table communication_state(announcement_id uuid,revision integer,notification_id uuid);
with saved as (
 select public.save_announcement_service(
  'a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null,
  'Service briefing','Doors open at 4 PM.','operations',array['employee'],array['11000000-0000-4000-8000-000000000001']::uuid[],null,null,'/app/employee-hub/line-up'
 ) result
) insert into communication_state(announcement_id,revision) select (result->>'announcement_id')::uuid,(result->>'revision')::integer from saved;
select is((select status::text from public.announcements announcement join communication_state state on state.announcement_id=announcement.id),'draft','announcement starts as a draft');
select is((select public.publish_announcement_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',announcement_id,revision)->>'recipient_count' from communication_state),'2','publication resolves every matching role and location recipient server-side');
update communication_state set revision=2,notification_id=(select id from public.notifications where source_type='announcement' and source_id=communication_state.announcement_id and recipient_user_id='a8000000-0000-4000-8000-000000000002');
select is((select jsonb_array_length(public.get_announcements_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'announcements')),1,'target employee sees the published announcement');
select is((select jsonb_array_length(public.get_announcements_service('a8000000-0000-4000-8000-000000000003','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'announcements')),0,'employee at another location cannot see the announcement');
select throws_ok($$select public.publish_announcement_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select announcement_id from communication_state),1)$$,'40001','stale announcement revision','publication is revision guarded');

select is((public.get_notifications_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->>'unread_count')::integer,1,'target employee receives one unread notification');
select is((public.act_on_notification_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select notification_id from communication_state),'read')->>'affected')::integer,1,'employee can mark a personal notification read');
select is((public.get_notifications_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->>'unread_count')::integer,0,'read state is reflected in the inbox');
select throws_ok($$select public.act_on_notification_service('a8000000-0000-4000-8000-000000000003','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select notification_id from communication_state),'dismiss')$$,'P0002','notification not found','another employee cannot mutate the notification');

select lives_ok($$select public.save_workspace_layout_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',array['notifications','operations','pending_requests','open_shifts','announcements','quick_actions'],array['quick_actions'])$$,'valid fixed-catalog Workspace layout is saved');
select throws_ok($$select public.save_workspace_layout_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',array['operations','operations','pending_requests','open_shifts','announcements','notifications'],array[]::text[])$$,'22023','valid workspace layout required','duplicate widgets are rejected');
select is((public.get_workspace_dashboard_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'layout'->'widget_order'->>0),'notifications','Workspace dashboard returns the synced personal order');
select throws_ok($$select public.get_workspace_dashboard_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')$$,'42501','manager workspace access required','employee-only users cannot open manager Workspace');
select is((select count(*)::integer from public.audit_events event join communication_state state on event.target_id=state.announcement_id::text where event.action='announcement.published'),1,'announcement publication writes an audit event');

select * from finish();
rollback;
