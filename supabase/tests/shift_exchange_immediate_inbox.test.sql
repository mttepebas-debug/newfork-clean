begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.w() returns uuid language sql as $$select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid$$;
create function pg_temp.manager() returns uuid language sql as $$select 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid$$;
create function pg_temp.actor(n integer) returns uuid language sql as $$select ('98000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.emp(n integer) returns uuid language sql as $$select ('15000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.actor(n),'00000000-0000-0000-0000-000000000000','authenticated','authenticated','exchange-'||n||'@example.test','','{}','{}',now(),now() from generate_series(1,6)n;
insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations)
select pg_temp.w(),pg_temp.actor(n),'employee','active',true from generate_series(1,4)n;
update public.employee_profiles set user_id=pg_temp.actor(right(id::text,1)::int) where id in(pg_temp.emp(1),pg_temp.emp(2),pg_temp.emp(3));
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,preferred_name,created_by)
values(pg_temp.emp(4),pg_temp.w(),pg_temp.actor(4),'E-9804','Drew','Test','',pg_temp.manager());
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
select pg_temp.w(),pg_temp.emp(n),l.id,pg_temp.manager() from generate_series(1,4)n cross join public.locations l where l.workspace_id=pg_temp.w() and l.id in('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002')
and not exists(select 1 from public.employee_location_assignments a where a.employee_id=pg_temp.emp(n) and a.location_id=l.id and ended_at is null);
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by)
select pg_temp.w(),pg_temp.emp(n),'13000000-0000-4000-8000-000000000001',pg_temp.manager() from generate_series(1,4)n
where not exists(select 1 from public.employee_job_assignments where employee_id=pg_temp.emp(n) and job_id='13000000-0000-4000-8000-000000000001' and ended_at is null);
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
values('98010000-0000-4000-8000-000000000001',pg_temp.w(),'11000000-0000-4000-8000-000000000001','2030-01-07',1,pg_temp.manager());
insert into public.schedule_published_shifts(id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
select ('98020000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.w(),'11000000-0000-4000-8000-000000000001','98010000-0000-4000-8000-000000000001',case n when 4 then null when 3 then pg_temp.emp(2) else pg_temp.emp(1) end,'13000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','2030-01-07'::date+n-1,'09:00','17:00',gen_random_uuid() from generate_series(1,4)n;
create function pg_temp.shift(n integer) returns uuid language sql as $$select ('98020000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create temp table sx_state(cid uuid, aid uuid, result jsonb, preview jsonb);
insert into sx_state values(null,null,null,null);

create function pg_temp.cid() returns uuid language sql as $$select cid from sx_state$$;
create temp table unrelated_before as select to_jsonb(o) row from public.notification_outbox o;
select ok(not has_function_privilege('anon','public.flush_shift_exchange_notifications_service(uuid,uuid,integer)','execute'),'immediate delivery is not callable by anon');
select ok(not has_function_privilege('authenticated','public.flush_shift_exchange_notifications_service(uuid,uuid,integer)','execute'),'immediate delivery is not callable by employee JWT');
select ok(has_function_privilege('service_role','public.flush_shift_exchange_notifications_service(uuid,uuid,integer)','execute'),'backend may flush a committed case');
select ok(not has_function_privilege('service_role','public.process_notification_outbox_before_signal(text,uuid)','execute'),'the pre-signal processor cannot bypass invalidation');
select throws_ok($$select public.flush_shift_exchange_notifications_service(pg_temp.w(),gen_random_uuid(),null)$$,'22023',null,'null batch size cannot become unbounded');
select throws_ok($$select public.flush_shift_exchange_notifications_service(pg_temp.w(),gen_random_uuid(),101)$$,'22023',null,'batch size has a hard bound');
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift(1)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
select throws_ok($$select public.flush_shift_exchange_notifications_service('7ea5d512-bc7f-4cf3-aad4-2f0815de00fd',pg_temp.cid())$$,'P0002',null,'workspace and case scope must match');
select public.shift_exchanges_command_service(pg_temp.actor(n),pg_temp.w(),jsonb_build_object('action','apply','case_id',pg_temp.cid(),'shift_id',pg_temp.shift(1)),gen_random_uuid()) from generate_series(2,4)n;
create temp table broadcast_before as select count(*) n from realtime.messages where topic='shift-exchanges:'||pg_temp.w()::text and payload-'id'=jsonb_build_object('workspace_id',pg_temp.w());
select set_config('app.exchange_inbox_signalled','[]',true);
update sx_state set result=public.flush_shift_exchange_notifications_service(pg_temp.w(),pg_temp.cid(),1);
select is(result->>'leased','1','bounded first flush processes exactly one event') from sx_state;
select is((select count(*) from realtime.messages where topic='shift-exchanges:'||pg_temp.w()::text and payload-'id'=jsonb_build_object('workspace_id',pg_temp.w()))-(select n from broadcast_before),1::bigint,'delivered inbox produces one content-free invalidation');
create temp table delivery_slices(processed integer);
insert into delivery_slices values(0);
do $$ declare r jsonb; begin
 for i in 1..10 loop
  r:=public.flush_shift_exchange_notifications_service(pg_temp.w(),pg_temp.cid());
  update delivery_slices set processed=processed+(r->>'processed')::int;
  exit when not (r->>'remaining')::boolean;
 end loop;
end; $$;
select is(processed,6,'bounded slices deliver the remaining six events') from delivery_slices;
select is((select count(*) from realtime.messages where topic='shift-exchanges:'||pg_temp.w()::text and payload-'id'=jsonb_build_object('workspace_id',pg_temp.w()))-(select n from broadcast_before),1::bigint,'same transaction coalesces repeated delivery signals');
select is((select count(*)::int from public.notification_inbox_items i join public.notification_recipients r on r.id=i.recipient_projection_id where i.group_key='shift_exchange_review:'||pg_temp.cid()::text and r.recipient_user_id=pg_temp.manager() and i.visibility_state='visible' and i.title='3 candidates ready for review'),1,'manager sees one current three-candidate task');
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(1)),pg_temp.emp(1),'delivery never releases the owner');
update sx_state set aid=(select id from public.shift_exchange_applications where case_id=cid and employee_id=pg_temp.emp(2));
update sx_state set preview=public.shift_exchange_preview(pg_temp.manager(),pg_temp.w(),cid,aid);
select public.shift_exchanges_command_service(pg_temp.manager(),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',4,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from sx_state;
create temp table approved_before as select to_jsonb(s) row from public.schedule_published_shifts s where id=pg_temp.shift(1);
-- A failing winner's inbox must not prevent the other three terminal results.
create function pg_temp.fail_winner() returns trigger language plpgsql as $$begin
 if new.group_key='shift_exchange:'||pg_temp.cid()::text and exists(select 1 from public.notification_recipients r where r.id=new.recipient_projection_id and r.recipient_user_id=pg_temp.actor(2)) then raise exception 'controlled immediate inbox failure'; end if; return new;end;$$;
create trigger sx_immediate_fail before insert on public.notification_inbox_items for each row execute function pg_temp.fail_winner();
update sx_state set result=public.flush_shift_exchange_notifications_service(pg_temp.w(),pg_temp.cid());
select is(result->>'processed','3','three other terminal results progress past a failed recipient') from sx_state;
select is(result->>'retried','1','failing result remains on the real retry path') from sx_state;
select is((select to_jsonb(s) from public.schedule_published_shifts s where id=pg_temp.shift(1)),(select row from approved_before),'delivery failure preserves the entire committed published assignment');
drop trigger sx_immediate_fail on public.notification_inbox_items;
select is(public.flush_shift_exchange_notifications_service(pg_temp.w(),pg_temp.cid())->>'leased','0','immediate repeat respects the future retry deadline');
select is((select attempt_count from public.notification_outbox where subject_id=pg_temp.cid()::text and status='retry'),1,'retry is not immediately consumed again');
-- Force only the test event due to verify resuming a prior retry in this rollback test.
update public.notification_outbox set available_at=clock_timestamp()-interval '1 second' where subject_id=pg_temp.cid()::text and status='retry';
select is(public.flush_shift_exchange_notifications_service(pg_temp.w(),pg_temp.cid())->>'processed','1','due retry delivers once');
select is(public.flush_shift_exchange_notifications_service(pg_temp.w(),pg_temp.cid())->>'leased','0','successful retries do not create duplicates');
select is((select count(*)::int from public.notification_inbox_items where group_key='shift_exchange:'||pg_temp.cid()::text and visibility_state='visible'),4,'exactly four participant results remain visible');
select is((select count(*)::int from public.notification_inbox_items where group_key='shift_exchange_review:'||pg_temp.cid()::text and visibility_state='visible'),0,'completed manager task disappears');
select is((select count(*)::int from unrelated_before b join public.notification_outbox o on o.id=(b.row->>'id')::uuid where to_jsonb(o) is distinct from b.row),0,'unrelated case and workspace queues remain untouched');
create temp table held_case as select (public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift(2)),gen_random_uuid())->>'case_id')::uuid cid;
update public.notification_outbox set status='leased',lease_owner='another-worker',lease_expires_at=clock_timestamp()+interval '1 hour',attempt_count=1 where subject_id=(select cid::text from held_case);
select is(public.flush_shift_exchange_notifications_service(pg_temp.w(),(select cid from held_case))->>'leased','0','active lease owned by another worker is not stolen');
select is((select lease_owner from public.notification_outbox where subject_id=(select cid::text from held_case)),'another-worker','skipped lease ownership is unchanged');
update public.notification_outbox set lease_expires_at=clock_timestamp()-interval '1 second' where subject_id=(select cid::text from held_case);
select is(public.flush_shift_exchange_notifications_service(pg_temp.w(),(select cid from held_case))->>'processed','1','expired lease is safely recovered');
select is((select attempt_count from public.notification_outbox where subject_id=(select cid::text from held_case)),2,'lease recovery records the next attempt');
select * from finish();
rollback;
