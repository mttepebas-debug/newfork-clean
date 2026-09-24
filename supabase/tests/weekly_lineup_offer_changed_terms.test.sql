begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table ws as select
 'ad435000-0000-4000-8000-000000000001'::uuid w,
 'ad435000-0000-4000-8000-000000000002'::uuid manager,
 'ad435000-0000-4000-8000-000000000003'::uuid employee_user,
 'ad435000-0000-4000-8000-000000000004'::uuid emp,
 'ad435000-0000-4000-8000-000000000005'::uuid loc,
 'ad435000-0000-4000-8000-000000000006'::uuid other_loc,
 'ad435000-0000-4000-8000-000000000007'::uuid job,
 'ad435000-0000-4000-8000-000000000008'::uuid service,
 (date_trunc('week',current_date)::date+14) start_day;
insert into auth.users(id,email) select manager,'weekly-terms-manager@example.test' from ws
 union all select employee_user,'weekly-terms-employee@example.test' from ws;
insert into public.workspaces(id,name,created_by) select w,'Weekly Line Up offer terms',manager from ws;
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
 select w,manager,'owner'::public.workspace_role,true from ws
 union all select w,employee_user,'employee'::public.workspace_role,true from ws;
insert into public.workspace_scheduling_settings(workspace_id,availability_warning_policy) select w,'confirm' from ws on conflict do nothing;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone,lineup_operations_enabled)
 select 'T00057-' || right(l::text, 4), l,w,case when l=loc then 'First site' else 'Second site' end,'1 Test Street','Test City','CA','90001','UTC',true
 from ws cross join lateral unnest(array[loc,other_loc]) l;
insert into public.jobs(id,workspace_id,name) select job,w,'Server' from ws;
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time)
 select service,w,'Dinner','18:00','22:00' from ws;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select emp,w,employee_user,'E-9934351','Terms','Employee',manager from ws;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,emp,l,manager from ws cross join lateral unnest(array[loc,other_loc]) l;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
 select w,emp,job,true,manager from ws;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('ad435000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid;
$$;
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
 select pg_temp.id(1),w,loc,start_day,1,manager from ws
 union all select pg_temp.id(2),w,other_loc,start_day,1,manager from ws;
insert into public.schedule_published_shifts(id,source_shift_id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select pg_temp.id(10+n),pg_temp.id(30+n),w,loc,pg_temp.id(1),null,job,service,start_day+(n-1)%7,'18:00','22:00','explicit','UTC'
 from ws cross join generate_series(1,7) n;
create temp table offers(n integer,pid uuid,op jsonb,acceptance jsonb,deadline timestamptz,preview jsonb);
insert into offers(n,op) select n,jsonb_build_object('kind','assign','source_entry_id',pg_temp.id(10+n),'target_entry_id',null,
 'employee_id',emp,'reason','Cover the evening service','travel_minutes',0,'target',jsonb_build_object('date',start_day+n-1,
 'location_id',loc,'job_id',job,'shift_type_id',service,'start_time','18:00','end_time',case when n=6 then '20:00' else '22:00' end,'section_id',null,'station',''))
 from ws cross join generate_series(1,7) n;
update offers set pid=(select public.lineup_proposals_service(manager,w,'propose',jsonb_build_object('kind','offer','operation',op,
 'fingerprint',public.lineup_operation_preview(manager,w,op)->>'fingerprint','idempotency_key',gen_random_uuid()))->>'id' from ws)::uuid;
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,emp,jsonb_build_object('input_mode','time_range','days',(select jsonb_agg(jsonb_build_object('day',d,'all_day',true,
 'range',null,'shift_type_ids','[]'::jsonb) order by d) from generate_series(0,6) d)),1,employee_user from ws;
select public.lineup_proposals_service(employee_user,w,'respond',jsonb_build_object('id',pid,'response','accept',
 'availability_fingerprint',public.weekly_lineup_offer_warning(w,pid)->>'fingerprint')) from ws,offers where n<>2;
update offers o set acceptance=p.employee_acceptance,deadline=p.expires_at from public.lineup_proposals p where p.id=o.pid;
create function pg_temp.flush_terms() returns void language plpgsql as $$
begin
 set constraints weekly_lineup_offer_shift_terms_changed,weekly_lineup_offer_publication_terms_changed immediate;
 set constraints weekly_lineup_offer_shift_terms_changed,weekly_lineup_offer_publication_terms_changed deferred;
end; $$;
select pg_temp.flush_terms();
create function pg_temp.change_hours(n integer,s time,e time) returns void language plpgsql as $$
begin
 update public.schedule_published_shifts set start_time=s,end_time=e where id=pg_temp.id(10+n);
 perform pg_temp.flush_terms();
end; $$;
create function pg_temp.finalize(n integer,command jsonb default '{}') returns jsonb language sql as $$
 select public.lineup_proposals_service(manager,w,'proposal_action',jsonb_build_object('id',pid,'response','confirm')||command)
 from ws,offers o where o.n=$1;
$$;

select ok((select weekly_whole_source and weekly_source_id=pg_temp.id(31) from public.lineup_proposals where id=pid),'full offer binds to the stable Schedule identity') from offers where n=1;
select ok(not (select weekly_whole_source from public.lineup_proposals where id=pid),'partial offer is not expanded into its whole parent') from offers where n=6;
select pg_temp.change_hours(1,'17:00','23:00');
select is((select operation->'target'->>'start_time' from public.lineup_proposals where id=pid),'17:00','published hours refresh the same full offer') from offers where n=1;
select is((select status from public.lineup_proposals where id=pid),'accepted','changed hours retain accepted status') from offers where n=1;
select is((select employee_acceptance from public.lineup_proposals where id=pid),acceptance,'original employee response is immutable') from offers where n=1;
select is((select expires_at from public.lineup_proposals where id=pid),deadline,'changing hours does not renew the response deadline') from offers where n=1;
select is((select jsonb_array_length(weekly_terms_history) from public.lineup_proposals where id=pid),1,'private before/after history is written once') from offers where n=1;
select is((select count(*) from public.notifications where source_id=pid and event_key like 'terms_%'),2::bigint,'employee and manager both receive updated terms') from offers where n=1;
select is((select count(*) from public.notification_outbox o join public.notifications n on n.id::text=o.subject_id
 where n.source_id=pid and n.event_key like 'terms_%' and o.subject_type='lineup_staffing_notifications'),2::bigint,'both notices join the existing outbox') from offers where n=1;
select public.refresh_weekly_lineup_offer_terms(w,pid) from ws,offers where n=1;
select is((select jsonb_array_length(weekly_terms_history) from public.lineup_proposals where id=pid),1,'refresh retry is idempotent') from offers where n=1;
select ok((select item->>'start_time'='17:00' and item->'availability_warning'='null'::jsonb from jsonb_array_elements(
 public.lineup_proposals_service(employee_user,w,'offers','{}')) item where item->>'id'=pid::text),'employee sees updated terms without a second acceptance choice') from ws,offers where n=1;
update offers set preview=pg_temp.finalize(n,'{"response":"preview"}') where n=1;
select is(preview->>'allowed','true','fresh manager preview reuses the original acceptance') from offers where n=1;

-- A second change invalidates the manager preview but not the employee response.
insert into auth.users(id,email) values(pg_temp.id(150),'weekly-terms-source-manager@example.test'),(pg_temp.id(151),'weekly-terms-target-manager@example.test');
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
 select w,pg_temp.id(n),'manager'::public.workspace_role,false from ws,generate_series(150,151) n;
select tests.works_at(m.id, case when m.user_id=pg_temp.id(150) then loc else other_loc end) from ws
 join public.workspace_memberships m on m.workspace_id=w and m.user_id in(pg_temp.id(150),pg_temp.id(151));
update public.schedule_published_shifts set scheduled_date=(select start_day+1 from ws),location_id=(select other_loc from ws),publication_id=pg_temp.id(2)
 where id=pg_temp.id(11);
select pg_temp.flush_terms();
select ok((select source_date=start_day+1 and target_location_id=other_loc and source_location_id=other_loc
 from public.lineup_proposals where id=pid),'date and location follow the same logical responsibility') from ws,offers where n=1;
select is((select employee_acceptance from public.lineup_proposals where id=pid),acceptance,'location change does not rewrite employee consent') from offers where n=1;
select ok(exists(select 1 from public.notifications where source_id=pid and event_key='terms_manager:2' and recipient_user_id=pg_temp.id(151))
 and not exists(select 1 from public.notifications where source_id=pid and event_key='terms_manager:2' and recipient_user_id=pg_temp.id(150)),
 'changed terms notify the current destination managers, not an out-of-scope source manager') from offers where n=1;
select throws_ok($$select public.lineup_proposals_service(pg_temp.id(150),w,'proposal_action',jsonb_build_object('id',pid,'response','confirm')) from ws,offers where n=1$$,
 'P0001','Proposal scope denied','old location authority cannot finalize the moved offer');
select is(public.lineup_proposals_service(pg_temp.id(151),w,'proposal_action',jsonb_build_object('id',pid,'response','preview'))->>'allowed',
 'true','current destination manager can review retained employee acceptance') from ws,offers where n=1;
select throws_ok($$select pg_temp.finalize(1,jsonb_build_object('fingerprint',preview->>'fingerprint')) from offers where n=1$$,
 'P0001','stale approval preview; review both assignments again','old manager review cannot finalize changed terms');
select ok(not public.lineup_staffing_notification_allowed(o.id,manager),'old-location manager delivery is no longer authorized')
 from ws,offers f,public.notifications n,public.notification_outbox o where f.n=1 and n.source_id=f.pid
 and n.event_key='terms_manager:1' and o.subject_id=n.id::text;

-- Real blockers are checked against the new target, not the original response.
insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,status,created_by)
 select pg_temp.id(70),w,emp,other_loc,'approved',employee_user from ws;
insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date,start_time,end_time,status)
 select w,pg_temp.id(70),start_day+1,'19:00','20:00','approved' from ws;
select is(pg_temp.finalize(1,'{"response":"preview"}')->>'allowed','false','approved leave still blocks changed accepted terms');
select throws_ok($$select pg_temp.finalize(1)$$,'P0001',null,'retained consent cannot override leave');
delete from public.schedule_time_off_segments where request_id=pg_temp.id(70);
select is(pg_temp.finalize(1)->>'status','applied','same accepted offer finalizes at its new date/location/hours');
select ok((select employee_id=emp and scheduled_date=start_day+1 and location_id=other_loc and start_time='17:00' and end_time='23:00'
 from public.schedule_published_shifts where id=pg_temp.id(11)),'canonical Schedule receives the updated assignment') from ws;
select ok(exists(select 1 from public.schedule_availability_overrides where workspace_id=w and shift_id=pg_temp.id(31)
 and actor_user_id=employee_user and assessment->>'consent_proposal_id'=pid::text and revoked_at is null),'final evidence retains employee identity on the same logical shift') from ws,offers where n=1;
select pg_temp.flush_terms();
select is((select jsonb_array_length(weekly_terms_history) from public.lineup_proposals where id=pid),2,'finalized assignment does not refresh its closed offer') from offers where n=1;

select pg_temp.change_hours(2,'16:00','21:00');
select is((select status from public.lineup_proposals where id=pid),'pending','unanswered changed offer never becomes accepted') from offers where n=2;
select ok((select employee_acceptance is null from public.lineup_proposals where id=pid),'pending offer has no invented response') from offers where n=2;
select ok(public.weekly_lineup_offer_warning(w,pid) is not null,'pending employee still sees the current own-conflict choice') from ws,offers where n=2;

-- A notification failure undoes the source change and all linked offer effects.
create function pg_temp.fail_terms_notice() returns trigger language plpgsql as $$
begin
 if new.workspace_id='ad435000-0000-4000-8000-000000000001' and new.event_key like 'terms_%' then raise exception 'test terms notification failure'; end if;
 return new;
end; $$;
create trigger test_terms_notice before insert on public.notifications for each row execute function pg_temp.fail_terms_notice();
select throws_ok($$select pg_temp.change_hours(3,'17:00','23:00')$$,'P0001','test terms notification failure','notification failure rolls back source change');
select ok((select start_time='18:00' from public.schedule_published_shifts where id=pg_temp.id(13))
 and (select weekly_terms_history='[]'::jsonb and employee_acceptance=acceptance from public.lineup_proposals where id=pid),'source, history and consent stay unchanged after failure') from offers where n=3;
drop trigger test_terms_notice on public.notifications;

-- Re-publication changes physical IDs only; it cannot move consent to a new source.
update public.schedule_location_publications set status='superseded' where id=pg_temp.id(1);
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
 select pg_temp.id(3),w,loc,start_day,2,manager from ws;
insert into public.schedule_published_shifts(id,source_shift_id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select pg_temp.id(50+n),pg_temp.id(30+n),w,loc,pg_temp.id(3),null,job,service,start_day+n-1,'18:00','22:00','explicit','UTC'
 from ws cross join generate_series(3,7) n;
select pg_temp.flush_terms();
select is((select operation->>'source_entry_id' from public.lineup_proposals where id=pid),pg_temp.id(53)::text,'replacement publication rebinds the same logical source') from offers where n=3;
select is((select count(*) from public.notifications where source_id=pid and event_key like 'terms_%'),0::bigint,'physical-row replacement alone sends no terms notice') from offers where n=3;
select is(pg_temp.finalize(3)->>'status','applied','accepted offer survives a replacement publication');

insert into public.jobs(id,workspace_id,name) select pg_temp.id(80),w,'Different responsibility' from ws;
update public.schedule_published_shifts set job_id=pg_temp.id(80) where id=pg_temp.id(54);
select pg_temp.flush_terms();
select throws_ok($$select pg_temp.finalize(4)$$,'P0001',null,'different job cannot reuse accepted responsibility');
update public.lineup_proposals set expires_at=now()-interval '1 second' where id=(select pid from offers where n=5);
update public.schedule_published_shifts set start_time='17:00' where id=pg_temp.id(55);
select pg_temp.flush_terms();
select throws_ok($$select pg_temp.finalize(5)$$,'P0001','stale or expired proposal','expired accepted offer is not revived');
select ok((select expires_at<now() from public.lineup_proposals where id=pid),'refresh never extends an expired deadline') from offers where n=5;
update public.schedule_published_shifts set start_time='17:00',end_time='23:00' where id=pg_temp.id(56);
select pg_temp.flush_terms();
select is((select operation->'target'->>'end_time' from public.lineup_proposals where id=pid),'20:00','partial accepted hours never silently expand') from offers where n=6;

-- Changed source employee and forged private markers still cannot transfer consent.
update public.schedule_published_shifts set source_shift_id=pg_temp.id(90) where id=pg_temp.id(57);
select pg_temp.flush_terms();
select is((select weekly_source_id from public.lineup_proposals where id=pid),pg_temp.id(37),'source binding never follows another logical identity') from offers where n=7;
select throws_ok($$select pg_temp.finalize(7)$$,'PT409',null,'finalization cannot reuse the old physical row after its logical identity changes');
select throws_ok($$select public.weekly_lineup_accepted_offer(w,jsonb_set(op||jsonb_build_object('_weekly_offer_id',pid),'{target,end_time}','"23:00"')) from ws,offers where n=7$$,
 'PT409',null,'client cannot copy the acceptance marker to changed terms');
select ok(public.lineup_proposals_service(employee_user,w,'offers','{}')::text not like '%weekly_terms_history%'
 and public.lineup_proposals_service(employee_user,w,'offers','{}')::text not like '%employee_acceptance%',
 'employee read model never exposes private history or acceptance evidence') from ws;
select ok(not has_function_privilege('service_role','public.refresh_weekly_lineup_offer_terms(uuid,uuid)','execute')
 and not has_function_privilege('authenticated','public.bind_weekly_lineup_offer_source()','execute'),'new helpers are private');
select * from finish();
rollback;
