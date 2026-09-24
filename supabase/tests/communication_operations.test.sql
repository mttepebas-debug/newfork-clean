begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

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
select tests.works_at('a8100000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001');
select tests.works_at('a8100000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000002');
update public.employee_profiles set user_id='a8000000-0000-4000-8000-000000000002' where id='15000000-0000-4000-8000-000000000001';
update public.employee_location_assignments set ended_at=now() where employee_id='15000000-0000-4000-8000-000000000001' and ended_at is null;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by)
values('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',true,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5');
update public.workspace_onboarding
set status='complete',
    current_step=4,
    completed_at=coalesce(completed_at, now())
where workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de00fd';

set local role service_role;
select is((select is_active from public.list_my_workspaces_service('a8000000-0000-4000-8000-000000000002') where workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'),false,'workspace list returns false when an active preference has not been chosen');
reset role;
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

create temp table communication_state(announcement_id uuid,revision integer,notification_id uuid,manual_todo_id uuid);
with saved as (
 select public.save_announcement_service(
  'a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null,
  'Service briefing','Doors open at 4 PM.','operations',array['employee'],array['11000000-0000-4000-8000-000000000001']::uuid[],null,null,'/app/employee-hub/line-up'
 ) result
) insert into communication_state(announcement_id,revision) select (result->>'announcement_id')::uuid,(result->>'revision')::integer from saved;
select is((select status::text from public.announcements announcement join communication_state state on state.announcement_id=announcement.id),'draft','announcement starts as a draft');
select is((select public.publish_announcement_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',announcement_id,revision)->>'recipient_count' from communication_state),'1','publication resolves only employees assigned to the targeted location');
update public.notification_outbox set status='leased',lease_owner='communication-test',lease_expires_at=now()+interval '1 minute'
where type_key='communications.announcement.available' and subject_id=(select announcement_id::text from communication_state);
do $$ declare outbox_id uuid; begin
 select id into outbox_id from public.notification_outbox where type_key='communications.announcement.available' and subject_id=(select announcement_id::text from communication_state);
 perform public.process_notification_outbox_service('communication-test',outbox_id);
end $$;
update communication_state set revision=2,notification_id=(
  select item.id
  from public.notification_inbox_items item
  join public.notification_recipients recipient on recipient.id=item.recipient_projection_id
  join public.notification_outbox outbox on outbox.event_id=recipient.event_id
  where outbox.subject_id=communication_state.announcement_id::text
    and recipient.recipient_user_id='a8000000-0000-4000-8000-000000000002'
);
insert into public.workspaces(id,name,created_by)
values('a8f00000-0000-4000-8000-000000000001','Second Comms Workspace','a8000000-0000-4000-8000-000000000004');
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations)
values
 ('a8f10000-0000-4000-8000-000000000001','a8f00000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000004','owner','active',true),
 ('a8f10000-0000-4000-8000-000000000002','a8f00000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000002','employee','active',true);
insert into public.notification_events(
  id,workspace_id,type_key,schema_version,actor_user_id,subject_type,subject_id,payload_digest,sensitivity,occurred_at
) values (
  'a8f20000-0000-4000-8000-000000000001','a8f00000-0000-4000-8000-000000000001',
  'communications.announcement.available',1,'a8000000-0000-4000-8000-000000000004',
  'announcement','a8f-announcement',repeat('f',64),'internal',now()
);
insert into public.notification_recipients(
  id,workspace_id,event_id,recipient_user_id,audience_reason,policy_snapshot
) values (
  'a8f30000-0000-4000-8000-000000000001','a8f00000-0000-4000-8000-000000000001',
  'a8f20000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000002',
  '{"contract":"same_account_second_workspace"}','{"in_app":{"eligible":true}}'
);
insert into public.notification_inbox_items(
  id,workspace_id,recipient_projection_id,title,body,safe_preview,action_url,created_at
) values (
  'a8f40000-0000-4000-8000-000000000001','a8f00000-0000-4000-8000-000000000001',
  'a8f30000-0000-4000-8000-000000000001','Second workspace notice','Body','Second workspace notice',
  '/app/employee-hub','2035-01-01 13:00:00+00'
);
select is((select jsonb_array_length(public.get_announcements_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'announcements')),1,'target employee sees the published announcement');
select is((select jsonb_array_length(public.get_announcements_service('a8000000-0000-4000-8000-000000000003','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'announcements')),0,'employee at another location cannot see the announcement');
update public.workspace_memberships set all_locations=true where id='a8100000-0000-4000-8000-000000000003';
select is((select jsonb_array_length(public.get_announcements_service('a8000000-0000-4000-8000-000000000003','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'announcements')),0,'all-location employee membership without a matching location assignment cannot see the announcement');
select throws_ok($$select public.acknowledge_announcement_service('a8000000-0000-4000-8000-000000000003','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select announcement_id from communication_state))$$,'P0002','announcement not found','employee cannot acknowledge an announcement outside their assignments');
select isnt((public.acknowledge_announcement_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select announcement_id from communication_state))->>'acknowledged_at'),null,'target employee can acknowledge the announcement');
select isnt((public.get_announcements_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'announcements'->0->>'acknowledged_at'),null,'acknowledged announcement stays listed with its acknowledgement');
select throws_ok($$select public.publish_announcement_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select announcement_id from communication_state),1)$$,'40001','stale announcement revision','publication is revision guarded');

select is((public.get_notification_inbox_v2_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null,null,null,null,30)->>'unread_count')::integer,1,'target employee receives one unread notification');
select is((public.get_notification_inbox_v2_service('a8000000-0000-4000-8000-000000000002','a8f00000-0000-4000-8000-000000000001',null,null,null,null,null,30)->>'unread_count')::integer,1,'same account reads the second workspace notification only in that workspace');
select throws_ok($$select public.act_on_notification_inbox_item_v2_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','a8f40000-0000-4000-8000-000000000001','read')$$,'P0002','notification inbox item not found','same account cannot mutate a second workspace notification through the first workspace');
select is((public.get_notification_inbox_v2_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null,null,null,null,30)->>'unread_count')::integer,1,'same account second workspace notification does not inflate first workspace unread count');
select is((public.act_on_notification_inbox_item_v2_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select notification_id from communication_state),'read')->>'affected')::integer,1,'employee can mark a personal notification read');
select is((public.get_notification_inbox_v2_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null,null,null,null,30)->>'unread_count')::integer,0,'read state is reflected in the inbox');
select throws_ok($$select public.act_on_notification_inbox_item_v2_service('a8000000-0000-4000-8000-000000000003','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select notification_id from communication_state),'dismiss')$$,'P0002','notification inbox item not found','another employee cannot mutate the notification');
select is((select public.cancel_announcement_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',announcement_id,revision)->>'status' from communication_state),'cancelled','publisher can cancel the projected announcement revision');
select is((select count(*)::integer from public.notifications notification join communication_state state on notification.id=state.notification_id),0,'announcement cancellation does not depend on legacy notification rows');
select ok((select bool_and(item.visibility_state='cancelled') from public.notification_inbox_items item join public.notification_recipients recipient on recipient.id=item.recipient_projection_id join public.notification_outbox outbox on outbox.event_id=recipient.event_id join communication_state state on outbox.subject_id=state.announcement_id::text),'announcement cancellation retains cancelled v2 audit projections');

select lives_ok($$select public.save_workspace_layout_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',array['notifications','operations','pending_requests','open_shifts','announcements','todos','quick_actions'],array['quick_actions'])$$,'valid fixed-catalog Workspace layout is saved');
select throws_ok($$select public.save_workspace_layout_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',array['operations','operations','pending_requests','open_shifts','announcements','notifications'],array[]::text[])$$,'22023','valid workspace layout required','duplicate widgets are rejected');
select is((public.get_workspace_dashboard_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'layout'->'widget_order'->>0),'notifications','Workspace dashboard returns the synced personal order');
select is(
  (public.get_workspace_dashboard_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'layout'->'widget_order' ? 'todos'),
  true,
  'Workspace dashboard includes the todos widget catalog entry'
);
insert into public.workspace_layout_preferences(workspace_id,user_id,widget_order,hidden_widget_ids)
values('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','a8000000-0000-4000-8000-000000000001',array['operations','pending_requests','open_shifts','announcements','notifications','quick_actions'],array[]::text[])
on conflict(workspace_id,user_id) do update set widget_order=excluded.widget_order,hidden_widget_ids=excluded.hidden_widget_ids;
select is(
  (public.get_workspace_dashboard_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'layout'->'widget_order'->>6),
  'todos',
  'legacy six-widget layouts append todos without dropping saved order'
);
insert into public.document_types(
 id,workspace_id,title,description,required_at_onboarding,requires_review,accepted_formats,tracks_expiry,expiry_warning_days,expiry_schedule_impact,sort_order,created_by
) values (
 'a9700000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Food handler card','Expiring certificate',true,false,array['pdf'],true,14,'track_only',90,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5'
);
-- A document requirement is only created against a published document
-- type; against a draft, or a type that does not exist, the row is dropped
-- without a word and everything that points at it fails later.
update public.document_types set publication_status='published' where id='a9700000-0000-4000-8000-000000000001';
insert into public.employee_onboarding_cases(id,workspace_id,employee_id,membership_id,status)
values('a9700000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','a8100000-0000-4000-8000-000000000002','in_progress');
insert into public.employee_onboarding_requirements(id,workspace_id,case_id,employee_id,kind,source_id,title,required,blocks_activation,requires_review,sort_order,status)
values('a9700000-0000-4000-8000-000000000003','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','a9700000-0000-4000-8000-000000000002','15000000-0000-4000-8000-000000000001','document','a9700000-0000-4000-8000-000000000001','Food handler card',true,true,false,90,'completed');
insert into public.employee_documents(id,workspace_id,employee_id,requirement_id,version_number,object_path,original_filename,media_type,size_bytes,review_status,expiry_date,uploaded_by)
values('a9700000-0000-4000-8000-000000000004','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','a9700000-0000-4000-8000-000000000003',1,'6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/15000000-0000-4000-8000-000000000001/a9700000-0000-4000-8000-000000000003/b9700000-0000-4000-8000-000000000004.pdf','food-handler.pdf','application/pdf',1024,'accepted',current_date + 3,'a8000000-0000-4000-8000-000000000002');
select is((public.sync_expiring_document_todos_service('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->>'opened_or_refreshed')::integer,1,'expiring accepted document creates one source-linked todo');
select is((select count(*)::integer from public.notification_outbox where type_key='people.employee_document.expiring' and subject_id='a9700000-0000-4000-8000-000000000004'),1,'expiring accepted document enqueues one source-linked notification');
select is((public.get_workspace_dashboard_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'todos'->0->>'body'),'Alex Kim - Food handler card','Workspace dashboard lists scoped document-expiry todo');
select is((select count(*)::integer from public.workspace_todos where source_type='employee_document_expiry' and source_id='a9700000-0000-4000-8000-000000000004'),1,'document-expiry todo sync is deduped by source');
select is((select count(*)::integer from public.notification_outbox where type_key='people.employee_document.expiring' and subject_id='a9700000-0000-4000-8000-000000000004'),1,'document-expiry notification sync is deduped by source');
select throws_ok($$select public.create_workspace_todo_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Employee task','',null,null)$$,'42501','workspace todo management required','employee-only users cannot create Workspace todos');
select is((public.create_workspace_todo_service('a8000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Scoped follow-up','Review employee file','15000000-0000-4000-8000-000000000001',now()+interval '1 day')->>'employee_id'),'15000000-0000-4000-8000-000000000001','manager can create a manual todo for an employee in scope');
with saved as (
 select public.create_workspace_todo_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Owner follow-up','',null,null) result
) update communication_state set manual_todo_id=(result->>'id')::uuid from saved;
select throws_ok($$select public.resolve_workspace_todo_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select id from public.workspace_todos where source_type='employee_document_expiry' limit 1))$$,'42501','system todo resolves from source','system-generated todos cannot be manually resolved');
select is((select public.resolve_workspace_todo_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',manual_todo_id)->>'status' from communication_state),'resolved','manual Workspace todos can be resolved directly');
update public.employee_documents set review_status='superseded' where id='a9700000-0000-4000-8000-000000000004';
insert into public.employee_documents(id,workspace_id,employee_id,requirement_id,version_number,object_path,original_filename,media_type,size_bytes,review_status,expiry_date,uploaded_by)
values('a9700000-0000-4000-8000-000000000005','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','a9700000-0000-4000-8000-000000000003',2,'6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/15000000-0000-4000-8000-000000000001/a9700000-0000-4000-8000-000000000003/b9700000-0000-4000-8000-000000000005.pdf','food-handler-renewed.pdf','application/pdf',1024,'accepted',current_date + 400,'a8000000-0000-4000-8000-000000000002');
select is((public.sync_expiring_document_todos_service('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->>'resolved')::integer,1,'source-linked system todo resolves only after the source document is no longer expiring');
set local role postgres;
update public.employee_documents set expiry_date=current_date + 1 where id='a9700000-0000-4000-8000-000000000005';
update public.workspaces set lifecycle_status='deleted', closed_at=now(), closed_by='a8000000-0000-4000-8000-000000000001' where id='6ea5d512-bc7f-4cf3-aad4-2f0815de00fd';
set local role service_role;
select is((public.sync_expiring_document_todos_service('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->>'opened_or_refreshed')::integer,0,'closed workspaces do not create document-expiry todos');
select throws_ok($$select public.get_workspace_dashboard_service('a8000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')$$,'42501','manager workspace access required','employee-only users cannot open manager Workspace');
set local role postgres;
select is((select count(*)::integer from public.audit_events event join communication_state state on event.target_id=state.announcement_id::text where event.action='announcement.published'),1,'announcement publication writes an audit event');

select * from finish();
rollback;
