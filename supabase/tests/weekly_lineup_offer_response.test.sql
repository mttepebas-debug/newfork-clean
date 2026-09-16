begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table ws as select
 'ad429000-0000-4000-8000-000000000001'::uuid w,
 'ad429000-0000-4000-8000-000000000002'::uuid manager,
 'ad429000-0000-4000-8000-000000000003'::uuid employee_user,
 'ad429000-0000-4000-8000-000000000004'::uuid other_user,
 'ad429000-0000-4000-8000-000000000005'::uuid emp,
 'ad429000-0000-4000-8000-000000000006'::uuid other_emp,
 'ad429000-0000-4000-8000-000000000007'::uuid loc,
 'ad429000-0000-4000-8000-000000000008'::uuid job,
 'ad429000-0000-4000-8000-000000000009'::uuid service,
 (date_trunc('week',current_date)::date+14) start_day;
insert into auth.users(id,email) select manager,'weekly-offer-manager@example.test' from ws
 union all select employee_user,'weekly-offer-employee@example.test' from ws
 union all select other_user,'weekly-offer-other@example.test' from ws;
insert into public.workspaces(id,name,created_by) select w,'Weekly Line Up offers',manager from ws;
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
 select w,manager,'owner'::public.workspace_role,true from ws
 union all select w,employee_user,'employee'::public.workspace_role,true from ws
 union all select w,other_user,'employee'::public.workspace_role,true from ws;
insert into public.workspace_scheduling_settings(workspace_id) select w from ws on conflict do nothing;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone,lineup_operations_enabled)
 select 'T00058', loc,w,'Offer site','1 Test Street','Test City','CA','90001','UTC',true from ws;
insert into public.jobs(id,workspace_id,name) select job,w,'Server' from ws;
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time)
 select service,w,'Dinner','18:00','22:00' from ws;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select emp,w,employee_user,'E-9934291','Offer','Employee',manager from ws
 union all select other_emp,w,other_user,'E-9934292','Other','Employee',manager from ws;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,e.id,loc,manager from ws cross join lateral unnest(array[emp,other_emp]) e(id);
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
 select w,e.id,job,true,manager from ws cross join lateral unnest(array[emp,other_emp]) e(id);
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
 select 'ad429000-0000-4000-8000-000000000010',w,loc,start_day,1,manager from ws;
create function pg_temp.shift_id(n integer) returns uuid language sql immutable as $$
 select ('ad429000-0000-4000-8000-'||lpad((20+n)::text,12,'0'))::uuid;
$$;
insert into public.schedule_published_shifts(id,source_shift_id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select pg_temp.shift_id(n),pg_temp.shift_id(10+n),w,loc,'ad429000-0000-4000-8000-000000000010',null,job,service,start_day+n-1,'18:00','22:00','explicit','UTC'
 from ws cross join generate_series(1,4) n;
create temp table offers(n integer,pid uuid,op jsonb,token text);
insert into offers(n,op) select n,jsonb_build_object('kind','assign','source_entry_id',pg_temp.shift_id(n),'target_entry_id',null,'employee_id',emp,
 'reason','Cover the evening service','travel_minutes',0,'target',jsonb_build_object('date',start_day+n-1,'location_id',loc,'job_id',job,
 'shift_type_id',service,'start_time','18:00','end_time','22:00','section_id',null,'station','')) from ws cross join generate_series(1,4) n;
update offers set pid=(select public.lineup_proposals_service(manager,w,'propose',jsonb_build_object('kind','offer','operation',op,
 'fingerprint',public.lineup_operation_preview(manager,w,op)->>'fingerprint','idempotency_key',gen_random_uuid()))->>'id' from ws)::uuid;
create temp table extra_slot(result jsonb);
insert into extra_slot select public.upsert_schedule_lineup_entry_service(manager,w,loc,start_day+4,null,null,
 jsonb_build_object('source_shift_id',null,'employee_id',null,'job_id',job,'shift_type_id',service,'start_time','18:00','end_time','22:00',
 'section_id',null,'station','','call_off',false,'hidden',false,'display_order',0)) from ws;
insert into offers(n,op) select 5,jsonb_build_object('kind','assign','source_entry_id',result->'entry_id','target_entry_id',null,'employee_id',emp,
 'reason','Fill an extra open line','travel_minutes',0,'target',jsonb_build_object('date',start_day+4,'location_id',loc,'job_id',job,
 'shift_type_id',service,'start_time','18:00','end_time','20:00','section_id',null,'station','')) from ws,extra_slot;
update offers set pid=(select public.lineup_proposals_service(manager,w,'propose',jsonb_build_object('kind','offer','operation',op,
 'fingerprint',public.lineup_operation_preview(manager,w,op)->>'fingerprint','idempotency_key',gen_random_uuid()))->>'id' from ws)::uuid where n=5;
create function pg_temp.read_offers(actor uuid) returns jsonb language sql as $$
 select public.lineup_proposals_service(actor,w,'offers','{}') from ws;
$$;
create function pg_temp.respond(actor uuid,n integer,command jsonb default '{}') returns jsonb language sql as $$
 select public.lineup_proposals_service(actor,w,'respond',jsonb_build_object('id',o.pid,'response','accept')||command) from ws,offers o where o.n=$2;
$$;
create function pg_temp.unavailable() returns jsonb language sql as $$
 select jsonb_build_object('input_mode','time_range','days',jsonb_agg(jsonb_build_object('day',d,'all_day',true,'range',null,'shift_type_ids','[]'::jsonb) order by d)) from generate_series(0,6) d;
$$;
select is(jsonb_array_length(pg_temp.read_offers(employee_user)),5,'actual manager proposals reach the employee offer list') from ws;
select is(pg_temp.read_offers(employee_user)->0->'availability_warning','null'::jsonb,'empty preference needs no extra choice') from ws;
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,emp,pg_temp.unavailable(),1,employee_user from ws;
update offers set token=(select public.weekly_lineup_offer_warning(w,pid)->>'fingerprint' from ws);
select is(length(token),64,'own conflict exposes a decision token') from offers where n=1;
select throws_ok($$select pg_temp.respond(employee_user,1) from ws$$,'PT409',null,'ordinary acceptance cannot skip the explicit own-conflict choice');
select throws_ok($$select pg_temp.respond(employee_user,1,'{"availability_accepted":true}') from ws$$,'PT409',null,'a boolean cannot forge acceptance');
select is((select status from public.lineup_proposals where id=pid),'pending','rejected response leaves the offer pending') from offers where n=1;
select ok((select employee_acceptance is null from public.lineup_proposals where id=pid),'rejected response leaves no acceptance evidence') from offers where n=1;
select throws_ok($$select pg_temp.respond(employee_user,2,jsonb_build_object('availability_fingerprint',token)) from ws,offers where n=1$$,'PT409',null,'decision token cannot move to another offer');
update public.employee_weekly_preferences set preference=jsonb_set(jsonb_set(preference,'{days,1,all_day}','false'),'{days,1,range}','{"start":"19:00","end":"20:00"}') where workspace_id=(select w from ws);
select throws_ok($$select pg_temp.respond(employee_user,1,jsonb_build_object('availability_fingerprint',token)) from ws,offers where n=1$$,'PT409',null,'changed own conflict invalidates the displayed token');
update public.employee_weekly_preferences set preference=pg_temp.unavailable() where workspace_id=(select w from ws);
insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,notes,revision,updated_by)
 select w,emp,pg_temp.unavailable(),array['Private manager note','','','','','',''],1,manager from ws;
select is(public.weekly_lineup_offer_warning(w,pid)->>'fingerprint',token,'manager-only changes do not alter the employee token') from ws,offers where n=1;
select ok(pg_temp.read_offers(employee_user)::text not like '%Private manager note%' and pg_temp.read_offers(employee_user)::text not like '%employee_acceptance%' and pg_temp.read_offers(employee_user)::text not like '%manager_intervals%','employee list reveals neither reminders nor private acceptance record') from ws;
select throws_ok($$select pg_temp.respond(other_user,1,jsonb_build_object('availability_fingerprint',token)) from ws,offers where n=1$$,'P0001','Offer access denied','another employee cannot accept this offer');
select throws_ok($$select public.require_weekly_lineup_offer_acceptance(other_user,w,pid,jsonb_build_object('availability_fingerprint',token)) from ws,offers where n=1$$,'42501',null,'private helper independently verifies employee identity');

-- A failure downstream in the existing notification transaction must undo evidence too.
create function pg_temp.fail_offer_notice() returns trigger language plpgsql as $$
begin
 if new.source_type='lineup_proposal' and new.event_key='accepted' and new.workspace_id='ad429000-0000-4000-8000-000000000001' then raise exception 'test notification failure'; end if;
 return new;
end; $$;
create trigger test_weekly_offer_notification before insert on public.notifications for each row execute function pg_temp.fail_offer_notice();
select throws_ok($$select pg_temp.respond(employee_user,1,jsonb_build_object('availability_fingerprint',token)) from ws,offers where n=1$$,'P0001','test notification failure','notification failure rolls back the response transaction');
select ok((select status='pending' and employee_acceptance is null from public.lineup_proposals where id=pid),'status and evidence roll back together') from offers where n=1;
drop trigger test_weekly_offer_notification on public.notifications;
select is(pg_temp.respond(employee_user,1,jsonb_build_object('availability_fingerprint',token))->>'status','accepted','explicit current acceptance succeeds') from ws,offers where n=1;
select is((select employee_acceptance->>'actor_user_id' from public.lineup_proposals where id=pid),employee_user::text,'acceptance records the actual employee actor') from ws,offers where n=1;
select ok((select employee_acceptance->>'proposal_id'=pid::text and employee_acceptance->'target'=op->'target' from public.lineup_proposals where id=pid),'acceptance is bound to this offer and exact target') from offers where n=1;
select ok(not exists(select 1 from public.schedule_published_shifts where workspace_id=w and employee_id=emp),'accepting does not assign or shorten a shift') from ws;
select is((select count(*) from public.schedule_availability_overrides where workspace_id=w),0::bigint,'no final Schedule override is invented at response time') from ws;
select is((select item->'availability_warning' from jsonb_array_elements(pg_temp.read_offers(employee_user)) item where item->>'id'=pid::text),'null'::jsonb,'accepted offer does not ask for availability acceptance again') from ws,offers where n=1;
select ok(exists(select 1 from public.notifications where workspace_id=w and source_id=pid and event_key='accepted' and recipient_user_id=manager),'existing manager response notification is retained') from ws,offers where n=1;

insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,status,created_by)
 select 'ad429000-0000-4000-8000-000000000050',w,emp,loc,'approved',employee_user from ws;
insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date,start_time,end_time,status)
 select w,'ad429000-0000-4000-8000-000000000050',start_day+1,'19:00','20:00','approved' from ws;
select throws_ok($$select pg_temp.respond(employee_user,2,jsonb_build_object('availability_fingerprint',token)) from ws,offers where n=2$$,'PT409',null,'voluntary preference acceptance never overrides approved leave');
select is(pg_temp.respond(employee_user,2,'{"response":"decline"}')->>'status','declined','decline needs no token even when a true blocker exists') from ws;
update public.employee_weekly_preferences set preference=public.empty_weekly_preference('time_range') where workspace_id=(select w from ws);
select is(public.weekly_lineup_offer_warning(w,pid),null::jsonb,'manager-only conflict is not exposed as the employee own warning') from ws,offers where n=3;
select is(pg_temp.respond(employee_user,3)->>'status','accepted','manager-only reminder does not require an employee availability decision') from ws;
select is((select employee_acceptance->'availability_fingerprint' from public.lineup_proposals where id=pid),'null'::jsonb,'voluntary response without own conflict still has a server record') from offers where n=3;
update public.lineup_proposals set expires_at=now()-interval '1 second' where id=(select pid from offers where n=4);
select throws_ok($$select pg_temp.respond(employee_user,4) from ws$$,'P0001','stale or expired offer','expired proposal cannot be accepted');
select ok(not has_function_privilege('authenticated','public.weekly_lineup_offer_warning(uuid,uuid)','execute') and not has_function_privilege('service_role','public.require_weekly_lineup_offer_acceptance(uuid,uuid,uuid,jsonb)','execute'),'helper functions cannot be called through the public RPC API');

-- Migration 430: manager completion reuses the server response, not a client flag.
update public.employee_weekly_preferences set preference=pg_temp.unavailable() where workspace_id=(select w from ws);
update public.workspace_scheduling_settings set availability_warning_policy='confirm' where workspace_id=(select w from ws);
select is(pg_temp.respond(employee_user,5,jsonb_build_object('availability_fingerprint',token))->>'status','accepted','new open-line offer records own-conflict acceptance') from ws,offers where n=5;
create function pg_temp.finalize(n integer,command jsonb default '{}') returns jsonb language sql as $$
 select public.lineup_proposals_service(manager,w,'proposal_action',jsonb_build_object('id',pid,'response','confirm')||command)
 from ws,offers where offers.n=$1;
$$;
create temp table final_review(n integer,preview jsonb,result jsonb);
insert into final_review(n,preview) select n,pg_temp.finalize(n,'{"response":"preview"}') from offers where n in (1,3);
select is(preview->>'allowed','true','accepted offer has no second manager reminder decision') from final_review where n=1;
select ok(preview->'effects' ? 'Employee offer acceptance retained. Weekly preferences stay unchanged.','manager preview explains retained acceptance') from final_review where n=1;
select ok(preview::text not like '%Private manager note%' and preview::text not like '%employee_intervals%' and preview::text not like '%manager_intervals%','final preview has no raw preference source data') from final_review where n=1;
select throws_ok($$select pg_temp.finalize(1,jsonb_build_object('fingerprint',repeat('0',64)))$$,'P0001','stale approval preview; review both assignments again','stale review cannot finalize');
select throws_ok($$select public.weekly_lineup_accepted_offer(w,op||jsonb_build_object('_weekly_offer_id',pid,'employee_id',other_emp)) from ws,offers where n=1$$,'PT409',null,'accepted proposal cannot change employee');
select throws_ok($$select public.weekly_lineup_accepted_offer(w,jsonb_set(op||jsonb_build_object('_weekly_offer_id',pid),'{target,end_time}','"23:00"')) from ws,offers where n=1$$,'PT409',null,'client cannot extend accepted work by copying its marker');
select throws_ok($$select public.weekly_lineup_accepted_offer(w,op||jsonb_build_object('_weekly_offer_id',pid)) from ws,offers where n=2$$,'PT409',null,'declined proposal supplies no final acceptance');
select throws_ok($$select public.lineup_proposals_service(employee_user,w,'proposal_action',jsonb_build_object('id',pid,'response','confirm')) from ws,offers where n=1$$,'P0001',null,'employee acceptance does not grant manager finalization permission');
insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date,start_time,end_time,status)
 select w,'ad429000-0000-4000-8000-000000000050',start_day,'19:00','20:00','approved' from ws;
select is(pg_temp.finalize(1,'{"response":"preview"}')->>'allowed','false','leave approved after acceptance still blocks final assignment');
select throws_ok($$select pg_temp.finalize(1)$$,'P0001',null,'final command rechecks approved leave');
select is((select count(*) from public.schedule_availability_overrides where workspace_id=w),0::bigint,'blocked finalization writes no Schedule evidence') from ws;
delete from public.schedule_time_off_segments where request_id='ad429000-0000-4000-8000-000000000050' and segment_date=(select start_day from ws);

create function pg_temp.fail_assignment_notice() returns trigger language plpgsql as $$
begin
 if new.source_type='lineup_operation' and new.event_key='assignment_changed' and new.workspace_id='ad429000-0000-4000-8000-000000000001' then raise exception 'test final notification failure'; end if;
 return new;
end; $$;
create trigger test_weekly_final_notification before insert on public.notifications for each row execute function pg_temp.fail_assignment_notice();
select throws_ok($$select pg_temp.finalize(1)$$,'P0001','test final notification failure','final notification failure rolls back assignment and consent evidence');
select ok((select employee_id is null from public.schedule_published_shifts where id=pg_temp.shift_id(1)) and
 not exists(select 1 from public.schedule_availability_overrides where workspace_id=w),'failed finalization restores Schedule and evidence') from ws;
select is((select status from public.lineup_proposals where id=pid),'accepted','failed finalization leaves employee acceptance retryable') from offers where n=1;
drop trigger test_weekly_final_notification on public.notifications;
update final_review set preview=pg_temp.finalize(n,'{"response":"preview"}') where n=1;
update final_review set result=pg_temp.finalize(n,jsonb_build_object('fingerprint',preview->>'fingerprint')) where n=1;
select is(result->>'status','applied','actual accepted offer finalization succeeds without availability decision') from final_review where n=1;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift_id(1)),emp,'accepted employee receives the canonical Schedule shift') from ws;
select ok(exists(select 1 from public.schedule_lineup_entries where workspace_id=w and source_shift_id=pg_temp.shift_id(1) and employee_id=emp),'Line Up references the same assigned published shift') from ws;
select is((select assessment->>'consent_proposal_id' from public.schedule_availability_overrides where workspace_id=w and shift_id=pg_temp.shift_id(11) and revoked_at is null),pid::text,'Schedule evidence is bound to the accepted offer and logical shift') from ws,offers where n=1;
select is((select actor_user_id from public.schedule_availability_overrides where workspace_id=w and shift_id=pg_temp.shift_id(11) and revoked_at is null),employee_user,'Schedule evidence retains employee identity rather than pretending manager consent') from ws;
select ok((select availability_snapshot->'override' is not null and availability_snapshot->'override'<>'null'::jsonb from public.schedule_published_shifts where id=pg_temp.shift_id(1)),'canonical assignment guard captures retained evidence');
select is(pg_temp.finalize(1),(select result from final_review where n=1),'confirmed proposal retries return the same result');
select is((select count(*) from public.schedule_availability_overrides where workspace_id=w and shift_id=pg_temp.shift_id(11)),1::bigint,'retry never duplicates acceptance evidence') from ws;
-- Old accepted statuses are server-owned too; preserve them with explicit provenance.
update public.lineup_proposals set employee_acceptance=null where id=(select pid from offers where n=3);
select is(pg_temp.finalize(3)->>'status','applied','pre-cutover accepted offer remains usable');
select is((select assessment->>'acceptance_provenance' from public.schedule_availability_overrides where workspace_id=w and shift_id=pg_temp.shift_id(13) and revoked_at is null),'legacy_accepted_status','legacy acceptance is labelled rather than reconstructing a response event') from ws;
insert into final_review(n,result) values(5,pg_temp.finalize(5));
select is(result->>'status','applied','accepted extra-line offer creates a new canonical shift') from final_review where n=5;
select ok(exists(select 1 from public.schedule_published_shifts s join public.schedule_availability_overrides a
 on a.workspace_id=s.workspace_id and a.shift_id=s.source_shift_id and a.employee_id=s.employee_id
 where s.workspace_id=w and s.id=(result->>'shift_id')::uuid and a.assessment->>'consent_proposal_id'=pid::text
 and s.start_time='18:00' and s.end_time='20:00'),'new logical shift identity is bound before the guarded insert') from ws,offers,final_review where offers.n=5 and final_review.n=5;
select ok(exists(select 1 from public.schedule_lineup_entries e where e.workspace_id=w and e.id=(extra_slot.result->>'entry_id')::uuid
 and e.source_shift_id=(final_review.result->>'shift_id')::uuid and e.employee_id=emp),'original extra-line identity is retained after filling') from ws,extra_slot,final_review where n=5;
select ok(exists(select 1 from public.schedule_lineup_entries e join public.schedule_lineups l on l.id=e.lineup_id
 where e.workspace_id=w and l.lineup_date=start_day+4 and e.employee_id is null and e.start_time='20:00' and e.end_time='22:00'),'unrequested extra-line remainder stays open, not assigned') from ws;
select ok(not has_function_privilege('service_role','public.record_weekly_lineup_offer_assignment(uuid,uuid,uuid,uuid,uuid,jsonb)','execute'),'final acceptance helper is not an exposed RPC');

-- Migration 431: direct manager decisions use the same weekly assessment.
create temp table direct(op jsonb,preview jsonb,result jsonb,key uuid default gen_random_uuid());
insert into direct(op) select op from offers where n=4;
update direct set preview=(select public.lineup_operations_service(manager,w,'preview',jsonb_build_object('operation',op)) from ws);
select is(preview->>'allowed','true','preference-only direct assignment remains eligible') from direct;
select is(preview->'availability_warning'->>'policy','confirm','direct preview returns the organization warning policy') from direct;
select is(public.lineup_operations_service(manager,w,'candidates',jsonb_build_object('target',op->'target','source_entry_id',op->'source_entry_id'))->0->>'status','eligible','weekly candidate list no longer treats availability as an assignment blocker') from ws,direct;
select throws_ok($$select public.lineup_operations_service(manager,w,'apply',jsonb_build_object('operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',key)) from ws,direct$$,'22023','Confirm the availability conflict before assigning','confirm policy requires explicit direct-assignment choice');
select throws_ok($$select public.lineup_operations_service(manager,w,'apply',jsonb_build_object('operation',op,'fingerprint',repeat('0',64),'idempotency_key',key,'confirm_availability',true)) from ws,direct$$,'P0001','stale Line Up operation preview','confirmation never bypasses a stale full preview');
select ok((select employee_id is null from public.schedule_published_shifts where id=pg_temp.shift_id(4)),'unconfirmed assignment leaves Schedule unchanged');
update direct set result=(select public.lineup_operations_service(manager,w,'apply',jsonb_build_object('operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',key,'confirm_availability',true)) from ws);
select is(result->>'status','applied','confirmed direct command succeeds') from direct;
select is((select actor_user_id from public.schedule_availability_overrides where workspace_id=w and shift_id=pg_temp.shift_id(14) and revoked_at is null),manager,'direct assignment records manager identity, not employee voluntary consent') from ws;
select is((select assessment->>'consent_source' from public.schedule_availability_overrides where workspace_id=w and shift_id=pg_temp.shift_id(14) and revoked_at is null),'lineup_manager','direct evidence has its own provenance') from ws;
select is(public.lineup_operations_service(manager,w,'preview',jsonb_build_object('operation',op))->'availability_warning','null'::jsonb,'unchanged published employee and shift need no new availability decision') from ws,direct;
update public.workspace_scheduling_settings set availability_warning_policy='warn' where workspace_id=(select w from ws);
update direct set op=op||jsonb_build_object('source_entry_id',null,'target',(op->'target')||jsonb_build_object('date',(select start_day+5 from ws))),key=gen_random_uuid();
update direct set preview=(select public.lineup_operations_service(manager,w,'preview',jsonb_build_object('operation',op)) from ws);
select is(preview->'availability_warning'->>'policy','warn','warn policy is refreshed for the current target') from direct;
update direct set result=(select public.lineup_operations_service(manager,w,'apply',jsonb_build_object('operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',key)) from ws);
select is(result->>'status','applied','warn-only direct assignment needs no confirmation flag') from direct;
select ok(exists(select 1 from public.schedule_published_shifts s join public.schedule_availability_overrides a on a.workspace_id=s.workspace_id and a.shift_id=s.source_shift_id
 where s.workspace_id=w and s.id=(result->>'shift_id')::uuid and a.reason='Availability warning acknowledged (warn policy).'),'new direct shift gets acceptance before its guarded insert') from ws,direct;
select is((select count(*) from public.employee_schedule_availability_versions where workspace_id=w),0::bigint,'new manager proposals and assignments need no legacy availability declaration') from ws;
select ok(not has_function_privilege('service_role','public.record_weekly_lineup_manager_assignment(uuid,uuid,uuid,uuid,jsonb)','execute'),'manager acceptance writer stays private');
select * from finish();
rollback;
