begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.w() returns uuid language sql as $$select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid$$;
create function pg_temp.manager() returns uuid language sql as $$select 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid$$;
create function pg_temp.actor(n integer) returns uuid language sql as $$select ('98000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.emp(n integer) returns uuid language sql as $$select ('98090000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.actor(n),'00000000-0000-0000-0000-000000000000','authenticated','authenticated','exchange-'||n||'@example.test','','{}','{}',now(),now() from generate_series(1,6)n;
insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations)
select pg_temp.w(),pg_temp.actor(n),'employee','active',true from generate_series(1,4)n;
-- Fresh actors do not depend on shared seed employees remaining active.
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,preferred_name,created_by)
select pg_temp.emp(n),pg_temp.w(),pg_temp.actor(n),'E-'||(9900+n)::text,'Employee',n::text,'',pg_temp.manager() from generate_series(1,4)n;
insert into public.locations(id,workspace_id,name,street_address,city,region,postal_code,country_code,timezone)
select ('980a0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.w(),'Publication QA '||n,'1 Test St','Test City','CA','94000','US','America/Los_Angeles' from generate_series(1,2)n;
insert into public.jobs(id,workspace_id,name) values('980b0000-0000-4000-8000-000000000001',pg_temp.w(),'Publication QA job');
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time) values('980c0000-0000-4000-8000-000000000001',pg_temp.w(),'Publication QA service','09:00','17:00');
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
select pg_temp.w(),pg_temp.emp(n),l.id,pg_temp.manager() from generate_series(1,4)n cross join public.locations l where l.workspace_id=pg_temp.w() and l.id in('980a0000-0000-4000-8000-000000000001','980a0000-0000-4000-8000-000000000002')
and not exists(select 1 from public.employee_location_assignments a where a.employee_id=pg_temp.emp(n) and a.location_id=l.id and ended_at is null);
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by)
select pg_temp.w(),pg_temp.emp(n),'980b0000-0000-4000-8000-000000000001',pg_temp.manager() from generate_series(1,4)n
where not exists(select 1 from public.employee_job_assignments where employee_id=pg_temp.emp(n) and job_id='980b0000-0000-4000-8000-000000000001' and ended_at is null);
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until)
select pg_temp.w(),pg_temp.emp(n),coalesce((select max(version_number) from public.employee_schedule_availability_versions where employee_id=pg_temp.emp(n)),0)+1,'America/Los_Angeles',
(select jsonb_agg(jsonb_build_object('day',d,'mode','unrestricted','windows','[]'::jsonb)) from generate_series(0,6)d),'manager',pg_temp.manager(),'2030-01-07','2030-01-20' from generate_series(1,4)n;
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
values('98010000-0000-4000-8000-000000000001',pg_temp.w(),'980a0000-0000-4000-8000-000000000001','2030-01-07',1,pg_temp.manager());
insert into public.schedule_published_shifts(id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
select ('98020000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.w(),'980a0000-0000-4000-8000-000000000001','98010000-0000-4000-8000-000000000001',case n when 4 then null when 3 then pg_temp.emp(2) else pg_temp.emp(1) end,'980b0000-0000-4000-8000-000000000001','980c0000-0000-4000-8000-000000000001','2030-01-07'::date+n-1,'09:00','17:00',gen_random_uuid() from generate_series(1,4)n;
create function pg_temp.shift(n integer) returns uuid language sql as $$select ('98020000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create temp table staffing_flush_state(proposal uuid,competitor uuid,unrelated uuid,result jsonb,op jsonb,preview jsonb);
insert into staffing_flush_state(op) values(jsonb_build_object('kind','replace','source_entry_id',pg_temp.shift(4),'target_entry_id',null,'employee_id',pg_temp.emp(1),'reason','Immediate staffing delivery QA','travel_minutes',0,'target',
jsonb_build_object('date','2030-01-10','location_id','980a0000-0000-4000-8000-000000000001','job_id','980b0000-0000-4000-8000-000000000001','shift_type_id','980c0000-0000-4000-8000-000000000001','start_time','09:00','end_time','17:00','section_id',null,'station','')));
update staffing_flush_state set preview=public.lineup_operation_preview(pg_temp.manager(),pg_temp.w(),op);
select is(preview->>'allowed','true','offered shift is eligible') from staffing_flush_state;
update staffing_flush_state set proposal=(public.lineup_proposals_service(pg_temp.manager(),pg_temp.w(),'propose',jsonb_build_object('kind','offer','operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid()))->>'id')::uuid;
create function pg_temp.flush(pid uuid,batch integer default 50) returns jsonb language sql as $$select public.flush_lineup_staffing_notifications_service(pg_temp.w(),pid,null,batch)$$;
create function pg_temp.visible(pid uuid,evt text) returns integer language sql as $$
 select count(*)::integer from public.notification_inbox_items i join public.notifications n on n.id=i.legacy_notification_id
 where n.source_id=pid and n.event_key=evt and i.visibility_state='visible';$$;
select is(pg_temp.visible(proposal,'requested'),0,'durable command has not synchronously projected its inbox') from staffing_flush_state;
-- Another worker's active lease must be respected, then recoverable on expiry.
update public.notification_outbox o set status='leased',lease_owner='staffing-test-worker',lease_expires_at=clock_timestamp()+interval '1 minute'
from public.notifications n where n.id::text=o.subject_id and n.source_id=(select proposal from staffing_flush_state);
select is(pg_temp.flush(proposal)->>'leased','0','active worker lease is not stolen') from staffing_flush_state;
update public.notification_outbox o set lease_expires_at=clock_timestamp()-interval '1 second'
from public.notifications n where n.id::text=o.subject_id and n.source_id=(select proposal from staffing_flush_state);
update staffing_flush_state set result=pg_temp.flush(proposal);
select is(result->>'processed','1','post-commit scoped flush projects the offer') from staffing_flush_state;
select is(pg_temp.visible(proposal,'requested'),1,'employee has one actionable offer') from staffing_flush_state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(4)),null::uuid,'offering and delivery leave the open assignment unchanged');
select is(pg_temp.flush(proposal)->>'leased','0','repeat flush creates no second delivery') from staffing_flush_state;
-- A separate offer must not be leased by a response to the first.
update staffing_flush_state set op=jsonb_set(op,'{employee_id}',to_jsonb(pg_temp.emp(2)));
update staffing_flush_state set preview=public.lineup_operation_preview(pg_temp.manager(),pg_temp.w(),op);
update staffing_flush_state set competitor=(public.lineup_proposals_service(pg_temp.manager(),pg_temp.w(),'propose',jsonb_build_object('kind','offer','operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',gen_random_uuid()))->>'id')::uuid;
select public.lineup_proposals_service(pg_temp.actor(1),pg_temp.w(),'respond',jsonb_build_object('id',proposal,'response','accept')) from staffing_flush_state;
update staffing_flush_state set result=pg_temp.flush(proposal);
select ok((result->>'processed')::integer>0,'acceptance delivers manager review immediately') from staffing_flush_state;
select is(pg_temp.visible(proposal,'accepted'),1,'manager sees acceptance once') from staffing_flush_state;
select is(pg_temp.visible(competitor,'requested'),0,'other proposal outbox remains unprojected') from staffing_flush_state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(4)),null::uuid,'employee acceptance and delivery do not assign the shift');
-- Record only inbox delivery failure, with domain state already final.
update staffing_flush_state set result=public.lineup_proposals_service(pg_temp.manager(),pg_temp.w(),'proposal_action',jsonb_build_object('id',proposal,'response','confirm'));
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(4)),pg_temp.emp(1),'only final manager command assigns the shift');
create function pg_temp.fail_assignment_inbox() returns trigger language plpgsql as $$begin
 if exists(select 1 from public.notifications where id=new.legacy_notification_id and event_key='assignment_changed') then raise exception 'Controlled staffing inbox failure';end if;return new;end;$$;
create trigger staffing_flush_failure before insert on public.notification_inbox_items for each row execute function pg_temp.fail_assignment_inbox();
update staffing_flush_state set result=pg_temp.flush(proposal,1);
select ok((result->>'leased')::integer<=1,'batch bound is respected') from staffing_flush_state;
update staffing_flush_state set result=pg_temp.flush(proposal);
select is(pg_temp.visible(competitor,'coverage_filled'),1,'confirmation also delivers the losing offer outcome') from staffing_flush_state;
select is(pg_temp.visible(proposal,'accepted'),0,'confirmed proposal no longer appears actionable') from staffing_flush_state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(4)),pg_temp.emp(1),'delivery cannot undo manager assignment');
select is((select count(*)::integer from public.notification_outbox o join public.notifications n on n.id::text=o.subject_id where n.source_id=(select result->>'event_id' from public.lineup_proposals where id=(select proposal from staffing_flush_state))::uuid and n.event_key='assignment_changed' and o.status='retry'),1,'injected delivery failure is retained for retry');
drop trigger staffing_flush_failure on public.notification_inbox_items;
update public.notification_outbox o set available_at=clock_timestamp()-interval '1 second' from public.notifications n
where n.id::text=o.subject_id and n.source_id=(select (result->>'event_id')::uuid from public.lineup_proposals where id=(select proposal from staffing_flush_state)) and o.status='retry';
update staffing_flush_state set result=pg_temp.flush(proposal);
select is(result->>'processed','1','retry successfully projects the retained assignment outcome') from staffing_flush_state;
select is(pg_temp.flush(proposal)->>'leased','0','successful retry is not delivered twice') from staffing_flush_state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(4)),pg_temp.emp(1),'retry preserves final assignment');
select ok(not has_function_privilege('authenticated','public.flush_lineup_staffing_notifications_service(uuid,uuid,uuid,integer)','execute'),'employees cannot invoke service flush directly');
select ok(not has_function_privilege('anon','public.flush_lineup_staffing_notifications_service(uuid,uuid,uuid,integer)','execute'),'anonymous clients cannot invoke service flush');
select throws_ok('select public.flush_lineup_staffing_notifications_service(''00000000-0000-4000-8000-000000000099''::uuid,(select proposal from staffing_flush_state))','P0002','Staffing proposal not found','wrong workspace cannot flush the proposal');
select throws_ok('select public.flush_lineup_staffing_notifications_service(pg_temp.w(),null,null)','22023','A workspace, one staffing subject and bounded batch are required','unscoped flush rejected');
select * from finish();
rollback;
