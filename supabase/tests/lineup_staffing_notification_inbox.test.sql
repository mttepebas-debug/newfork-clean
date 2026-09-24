begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Keep retained provider messages out of this transaction's signal assertions.
create temp table staffing_existing_signals as select id from realtime.messages;
create function pg_temp.w() returns uuid language sql as $$select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid$$;
create function pg_temp.owner_id() returns uuid language sql as $$select 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid$$;
create function pg_temp.employee_id() returns uuid language sql as $$select 'bbb00000-0000-4000-8000-000000000201'::uuid$$;
create function pg_temp.manager_id() returns uuid language sql as $$select 'bbb00000-0000-4000-8000-000000000203'::uuid$$;
create function pg_temp.inbox(actor uuid) returns jsonb language sql as $$
 select public.get_notification_inbox_v2_service(actor,pg_temp.w(),null,null,null,null,null,50);
$$;
create function pg_temp.deliver(oid uuid) returns integer language plpgsql as $$
begin
 perform public.project_notification_event_service(oid);
 perform public.project_notification_recipients_service(oid);
 return public.project_notification_inbox_service(oid);
end; $$;
create function pg_temp.outbox(pid uuid,event_key text,actor uuid) returns uuid language sql as $$
 select o.id from public.notification_outbox o join public.notifications n on n.id::text=o.subject_id
 where o.subject_type='lineup_staffing_notifications' and n.source_id=pid
 and n.event_key=outbox.event_key and n.recipient_user_id=actor;
$$;
-- Planning availability is declared before the first publication.
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until)

select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',e.id,coalesce((select max(version_number) from public.employee_schedule_availability_versions where employee_id=e.id),0)+1,'America/Los_Angeles',

  (select jsonb_agg(jsonb_build_object('day',n,'mode',case when e.id='15000000-0000-4000-8000-000000000001' and n=5 then 'windows' else 'unrestricted' end,'windows',case when e.id='15000000-0000-4000-8000-000000000001' and n=5 then '[{"start":"00:00","end":"06:00"},{"start":"12:00","end":"15:00"}]'::jsonb else '[]'::jsonb end)) from generate_series(0,6) n),'manager','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','2030-01-07',null

from public.employee_profiles e where e.id in('15000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000002');

insert into public.schedule_location_publications(workspace_id,location_id,week_start,version_number,published_by)

select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',id,'2030-01-07',1,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' from public.locations where id in('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002');

insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)

select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',e.id,l.id,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' from public.employee_profiles e cross join public.locations l

where e.id in('15000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000002') and l.id in('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002')

and not exists(select 1 from public.employee_location_assignments a where a.employee_id=e.id and a.location_id=l.id and a.ended_at is null);

insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by)

select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',e.id,'13000000-0000-4000-8000-000000000001','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5' from public.employee_profiles e

where e.id='15000000-0000-4000-8000-000000000002' and not exists(select 1 from public.employee_job_assignments a where a.employee_id=e.id and a.job_id='13000000-0000-4000-8000-000000000001' and a.ended_at is null);




insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',label||'@example.test','','{}','{}',now(),now()
from (values ('bbb00000-0000-4000-8000-000000000201','staffing-employee'),('bbb00000-0000-4000-8000-000000000202','staffing-competitor'),('bbb00000-0000-4000-8000-000000000203','staffing-manager')) t(id,label);
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations)
select id::uuid,pg_temp.w(),id::uuid,(case when id like '%203' then 'manager' else 'employee' end)::public.workspace_role,'active',id not like '%203'
from unnest(array['bbb00000-0000-4000-8000-000000000201','bbb00000-0000-4000-8000-000000000202','bbb00000-0000-4000-8000-000000000203']) id;
select tests.works_at(pg_temp.manager_id(), '11000000-0000-4000-8000-000000000001');
update public.employee_profiles set user_id=pg_temp.employee_id() where id='15000000-0000-4000-8000-000000000002';
update public.employee_profiles set user_id='bbb00000-0000-4000-8000-000000000202' where id='15000000-0000-4000-8000-000000000001';
create temp table staffing_test(shift_id uuid,op jsonb,preview jsonb,proposal uuid,competitor uuid,notification_id uuid,oid uuid,event_id uuid);
insert into staffing_test(shift_id) values(gen_random_uuid());
insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
select t.shift_id,pg_temp.w(),p.id,p.location_id,null,'13000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','2030-01-07','09:00','17:00',gen_random_uuid()
from staffing_test t cross join public.schedule_location_publications p where p.workspace_id=pg_temp.w() and p.location_id='11000000-0000-4000-8000-000000000001' and p.week_start='2030-01-07';
update staffing_test set op=jsonb_build_object('kind','replace','source_entry_id',shift_id,'target_entry_id',null,'employee_id','15000000-0000-4000-8000-000000000002','reason','Staffing inbox integration','travel_minutes',0,'target',
'{"date":"2030-01-07","location_id":"11000000-0000-4000-8000-000000000001","job_id":"13000000-0000-4000-8000-000000000001","shift_type_id":"14000000-0000-4000-8000-000000000001","start_time":"09:00","end_time":"17:00","section_id":null,"station":""}'::jsonb);
update staffing_test set preview=public.lineup_operation_preview(pg_temp.owner_id(),pg_temp.w(),op);
select is(preview->>'allowed','true','offered assignment is eligible') from staffing_test;
update staffing_test set proposal=(public.lineup_proposals_service(pg_temp.owner_id(),pg_temp.w(),'propose',jsonb_build_object('kind','offer','operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid()))->>'id')::uuid;
update staffing_test set oid=pg_temp.outbox(proposal,'requested',pg_temp.employee_id());
select is((select count(*)::integer from realtime.messages where id not in(select id from staffing_existing_signals) and topic='shift-exchanges:'||pg_temp.w()::text and event='changed'),1,'new staffing proposal emits workspace invalidation');
select ok((select bool_and(payload-'id'=jsonb_build_object('workspace_id',pg_temp.w())) from realtime.messages where id not in(select id from staffing_existing_signals) and topic='shift-exchanges:'||pg_temp.w()::text),'broadcast has no offer, employee or assignment content');
create temp table staffing_signal_before as select count(*) count from realtime.messages where id not in(select id from staffing_existing_signals) and topic='shift-exchanges:'||pg_temp.w()::text;
update public.lineup_proposals set status=status where id=(select proposal from staffing_test);
select is((select count(*) from realtime.messages where id not in(select id from staffing_existing_signals) and topic='shift-exchanges:'||pg_temp.w()::text),(select count from staffing_signal_before),'no-op status write emits no new invalidation');

select ok(oid is not null,'real propose producer enqueues the employee offer') from staffing_test;
select is(pg_temp.deliver(oid),1,'offer reaches the modern inbox') from staffing_test;
select is(pg_temp.deliver(oid),0,'duplicate projection creates no second inbox item') from staffing_test;
select is((select count(*)::integer from public.notifications where source_id=t.proposal and recipient_user_id=pg_temp.employee_id()),1,'projection reuses original legacy notification') from staffing_test t;
select is(pg_temp.inbox(pg_temp.employee_id())->'notifications'->0->>'action_url','/app/employee-hub/lineup?staffing_offer='||proposal::text,'employee link selects exact offer') from staffing_test;
select is(pg_temp.inbox(pg_temp.employee_id())->'notifications'->0->>'severity','action_required','pending offer needs action');
select ok(not public.lineup_staffing_notification_allowed(oid,pg_temp.manager_id()),'another user cannot receive the invitation') from staffing_test;
update public.employee_job_assignments set ended_at=now() where employee_id='15000000-0000-4000-8000-000000000002' and job_id='13000000-0000-4000-8000-000000000001' and ended_at is null;
select is(jsonb_array_length(pg_temp.inbox(pg_temp.employee_id())->'notifications'),0,'qualification loss hides already delivered action');
select is(pg_temp.inbox(pg_temp.employee_id())->>'unread_count','0','qualification loss also removes unread badge');
update public.employee_job_assignments set ended_at=null where employee_id='15000000-0000-4000-8000-000000000002' and job_id='13000000-0000-4000-8000-000000000001';
update public.lineup_proposals set expires_at=clock_timestamp()-interval '1 second' where id=(select proposal from staffing_test);
select is(jsonb_array_length(pg_temp.inbox(pg_temp.employee_id())->'notifications'),0,'expiry is checked at inbox read without a cleanup job');
update public.lineup_proposals set expires_at=clock_timestamp()+interval '24 hours' where id=(select proposal from staffing_test);
-- A second eligible employee may volunteer; finalization closes only the competing need.
update staffing_test set preview=public.lineup_operation_preview(pg_temp.owner_id(),pg_temp.w(),op||'{"employee_id":"15000000-0000-4000-8000-000000000001"}');
update staffing_test set competitor=(public.lineup_proposals_service(pg_temp.owner_id(),pg_temp.w(),'propose',jsonb_build_object('kind','offer','operation',op||'{"employee_id":"15000000-0000-4000-8000-000000000001"}','fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid()))->>'id')::uuid;
select is(pg_temp.deliver(pg_temp.outbox(competitor,'requested','bbb00000-0000-4000-8000-000000000202')),1,'competing employee receives their own invitation') from staffing_test;
select is(public.lineup_proposals_service(pg_temp.employee_id(),pg_temp.w(),'respond',jsonb_build_object('id',proposal,'response','accept'))->>'status','accepted','employee consent succeeds') from staffing_test;
select ok((select employee_id is null from public.schedule_published_shifts where id=t.shift_id),'employee acceptance does not change assignment') from staffing_test t;
select is((select count(*)::integer from realtime.messages where id not in(select id from staffing_existing_signals) and topic='shift-exchanges:'||pg_temp.w()::text),3,'two proposals plus employee consent each invalidate readers');
select is(jsonb_array_length(pg_temp.inbox(pg_temp.employee_id())->'notifications'),0,'accepted invitation no longer appears actionable');
select is(pg_temp.deliver(pg_temp.outbox(proposal,'accepted',pg_temp.manager_id())),1,'scoped manager receives accepted offer decision') from staffing_test;
select is(pg_temp.inbox(pg_temp.manager_id())->'notifications'->0->>'action_url','/app/schedule/lineup?date=2030-01-07&location=11000000-0000-4000-8000-000000000001','manager link retains date and scope');
select tests.stops_working_at(pg_temp.manager_id());
select is(jsonb_array_length(pg_temp.inbox(pg_temp.manager_id())->'notifications'),0,'scope removal hides delivered manager decision');
select is(pg_temp.inbox(pg_temp.manager_id())->>'unread_count','0','scope removal removes manager unread badge');
select tests.works_at(pg_temp.manager_id(), '11000000-0000-4000-8000-000000000001');
-- Preference changes between recipient projection and delivery are re-evaluated.
update staffing_test set oid=pg_temp.outbox(proposal,'accepted',pg_temp.owner_id());
select public.project_notification_event_service(oid) from staffing_test;
select public.project_notification_recipients_service(oid) from staffing_test;
insert into public.notification_user_preferences(workspace_id,user_id,preference_scope,scope_key,channel_preferences) values(pg_temp.w(),pg_temp.owner_id(),'type','schedule.staffing.offer_updated','{"in_app":"disabled"}');
select is(public.project_notification_inbox_service(oid),0,'new opt-out after recipient projection blocks inbox delivery') from staffing_test;
delete from public.notification_user_preferences where workspace_id=pg_temp.w() and user_id=pg_temp.owner_id() and scope_key='schedule.staffing.offer_updated';
select is(public.project_notification_inbox_service(oid),1,'permitted retry delivers once') from staffing_test;
update staffing_test set preview=public.lineup_proposals_service(pg_temp.owner_id(),pg_temp.w(),'proposal_action',jsonb_build_object('id',proposal,'response','preview'));
update staffing_test set event_id=(public.lineup_proposals_service(pg_temp.owner_id(),pg_temp.w(),'proposal_action',jsonb_build_object('id',proposal,'response','confirm','fingerprint',preview->>'fingerprint'))->>'event_id')::uuid;
select is((select employee_id from public.schedule_published_shifts where id=t.shift_id),'15000000-0000-4000-8000-000000000002'::uuid,'manager finalization changes published owner') from staffing_test t;
select is(jsonb_array_length(pg_temp.inbox(pg_temp.manager_id())->'notifications'),0,'confirmed decision no longer asks manager to approve');
select is((select count(*)::integer from realtime.messages where id not in(select id from staffing_existing_signals) and topic='shift-exchanges:'||pg_temp.w()::text),6,'assignment plus confirmed and competing-closed transitions invalidate readers');
update staffing_test set oid=pg_temp.outbox(event_id,'assignment_changed',pg_temp.employee_id());
update staffing_test set notification_id=(select id from public.notifications where id::text=(select subject_id from public.notification_outbox where id=staffing_test.oid));
update public.notifications set read_at=now() where id=(select notification_id from staffing_test);
select is(pg_temp.deliver(oid),1,'confirmed assignment reaches modern inbox') from staffing_test;
select is(pg_temp.inbox(pg_temp.employee_id())->'notifications'->0->>'action_url','/app/employee-hub/schedule?date=2030-01-07&view=day','assignment result opens its employee Schedule day');
select ok((select read_at is not null and seen_at is not null from public.notification_inbox_items where legacy_notification_id=t.notification_id),'legacy read state is retained') from staffing_test t;
select is(public.lineup_staffing_enqueue_notification(notification_id),oid,'producer retry returns existing outbox ID') from staffing_test;
select is(pg_temp.deliver(oid),0,'completed result retry is idempotent') from staffing_test;
select is((select count(*)::integer from public.notifications where source_id=t.event_id and recipient_user_id=pg_temp.employee_id()),1,'no duplicate assignment notification') from staffing_test t;
select is(pg_temp.deliver(pg_temp.outbox(competitor,'coverage_filled','bbb00000-0000-4000-8000-000000000202')),1,'other employee receives coverage-filled result') from staffing_test;
select is(pg_temp.inbox('bbb00000-0000-4000-8000-000000000202')->'notifications'->0->>'severity','info','closed offer is informational instead of action required');
select is(pg_temp.inbox('bbb00000-0000-4000-8000-000000000202')->'notifications'->0->>'title','Shift offer closed','closed competing offer replaces invitation');
select ok(not has_function_privilege('authenticated','public.lineup_staffing_enqueue_notification(uuid)','EXECUTE'),'employee cannot forge notification events');
select ok(not has_function_privilege('service_role','public.lineup_staffing_proposal_status()','EXECUTE'),'trigger function is not a public service RPC');
select ok(has_function_privilege('service_role','public.project_notification_inbox_service(uuid)','EXECUTE'),'existing relay RPC remains available');

-- Explicit decline and manager cancellation are separate informational outcomes.
create function pg_temp.new_offer() returns uuid language plpgsql as $$
declare shift uuid:=gen_random_uuid(); operation jsonb; reviewed jsonb;
begin
 insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
 select shift,pg_temp.w(),p.id,p.location_id,null,'13000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','2030-01-07','18:00','20:00',gen_random_uuid()
 from public.schedule_location_publications p where p.workspace_id=pg_temp.w() and p.location_id='11000000-0000-4000-8000-000000000001' and p.week_start='2030-01-07';
 select op||jsonb_build_object('source_entry_id',shift,'target',(op->'target')||'{"start_time":"18:00","end_time":"20:00"}') into operation from staffing_test;
 reviewed:=public.lineup_operation_preview(pg_temp.owner_id(),pg_temp.w(),operation);
 return (public.lineup_proposals_service(pg_temp.owner_id(),pg_temp.w(),'propose',jsonb_build_object('kind','offer','operation',operation,'fingerprint',reviewed->>'fingerprint','idempotency_key',gen_random_uuid()))->>'id')::uuid;
end; $$;
update staffing_test set proposal=pg_temp.new_offer();
select is(public.lineup_proposals_service(pg_temp.employee_id(),pg_temp.w(),'respond',jsonb_build_object('id',proposal,'response','decline'))->>'status','declined','employee can decline a fresh offer') from staffing_test;
select is(pg_temp.deliver(pg_temp.outbox(proposal,'declined',pg_temp.manager_id())),1,'declined offer informs the manager') from staffing_test;
select is((select type_key from public.notification_outbox where id=pg_temp.outbox(t.proposal,'declined',pg_temp.manager_id())),'schedule.staffing.offer_closed','decline uses the informational catalog contract') from staffing_test t;
update staffing_test set proposal=pg_temp.new_offer();
select is(public.lineup_proposals_service(pg_temp.owner_id(),pg_temp.w(),'proposal_action',jsonb_build_object('id',proposal,'response','cancel'))->>'status','cancelled','manager may cancel an unanswered offer') from staffing_test;
update staffing_test set oid=pg_temp.outbox(proposal,'cancelled',pg_temp.employee_id());
-- Lease only this transaction-owned row, then run the production relay processor.
update public.notification_outbox set status='leased',lease_owner='staffing-test',lease_expires_at=clock_timestamp()+interval '1 minute' where id=(select oid from staffing_test);
select is(public.process_notification_outbox_service('staffing-test',oid)->>'status','processed','production relay processes the cancellation') from staffing_test;
select is((select count(*)::integer from public.notification_inbox_items i join public.notification_recipients r on r.id=i.recipient_projection_id join public.notification_outbox o on o.event_id=r.event_id and o.workspace_id=r.workspace_id where o.id=t.oid),1,'relay materializes exactly one cancelled-offer inbox row') from staffing_test t;
select is(public.act_on_notification_inbox_item_v2_service(pg_temp.employee_id(),pg_temp.w(),(select i.id from public.notification_inbox_items i join public.notification_recipients r on r.id=i.recipient_projection_id join public.notification_outbox o on o.event_id=r.event_id and o.workspace_id=r.workspace_id where o.id=t.oid),'dismiss')->>'status','saved','employee dismisses their own result') from staffing_test t;
select is(pg_temp.deliver(oid),0,'retry does not resurrect a dismissed result') from staffing_test;
select ok(not exists(select 1 from jsonb_array_elements(pg_temp.inbox(pg_temp.employee_id())->'notifications') n where n->>'title'='Shift offer cancelled'),'dismissed cancellation stays out of the inbox');


update staffing_signal_before set count=(select count(*) from realtime.messages where id not in(select id from staffing_existing_signals) and topic='shift-exchanges:'||pg_temp.w()::text);
create function pg_temp.rollback_status(pid uuid) returns void language plpgsql as $$
begin
 begin
  update public.lineup_proposals set status='declined' where id=pid;
  raise exception 'controlled_rollback';
 exception when raise_exception then
  if sqlerrm<>'controlled_rollback' then raise; end if;
 end;
end; $$;
select pg_temp.rollback_status(proposal) from staffing_test;
select is((select count(*) from realtime.messages where id not in(select id from staffing_existing_signals) and topic='shift-exchanges:'||pg_temp.w()::text),(select count from staffing_signal_before),'rolled-back decision leaves no broadcast message');
select ok(not has_function_privilege('authenticated','public.lineup_staffing_broadcast()','EXECUTE') and not has_function_privilege('service_role','public.lineup_staffing_broadcast()','EXECUTE'),'broadcast trigger is not an exposed RPC');


-- Date selection is per participant for a swap across two calendar weeks.
create temp table staffing_link_event(id uuid);
with event as (
 insert into public.lineup_operation_events(workspace_id,actor_user_id,kind,date,location_ids,description,before_state,after_state,idempotency_key)
 values(pg_temp.w(),pg_temp.owner_id(),'swap','2030-01-14',array['11000000-0000-4000-8000-000000000001'::uuid],
  'Notification link contract fixture',
  '{"source":{"employee_id":"15000000-0000-4000-8000-000000000002"},"other":{"employee_id":"15000000-0000-4000-8000-000000000001"}}',
  '{"operation":{"employee_id":"15000000-0000-4000-8000-000000000002"},"source_date":"2030-01-07","counterpart_date":"2030-01-14"}',gen_random_uuid()) returning id
) insert into staffing_link_event select id from event;
insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key)
select pg_temp.w(),actor,'schedule','Assignment changed','Review your updated day.','/app/employee-hub/schedule','lineup_operation',e.id,'assignment_changed'
from staffing_link_event e cross join unnest(array[pg_temp.employee_id(),'bbb00000-0000-4000-8000-000000000202'::uuid]) actor;
select is((select payload->>'action_url' from public.notification_outbox where id=pg_temp.outbox(e.id,'assignment_changed',pg_temp.employee_id())),
 '/app/employee-hub/schedule?date=2030-01-14&view=day','source employee swap notification opens the received week') from staffing_link_event e;
select is((select payload->>'action_url' from public.notification_outbox where id=pg_temp.outbox(e.id,'assignment_changed','bbb00000-0000-4000-8000-000000000202')),
 '/app/employee-hub/schedule?date=2030-01-07&view=day','counterpart swap notification opens their received week') from staffing_link_event e;

select * from finish();
rollback;
