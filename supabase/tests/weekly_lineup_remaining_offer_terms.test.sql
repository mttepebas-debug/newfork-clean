begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table ws as select
 'ad436000-0000-4000-8000-000000000001'::uuid w,
 'ad436000-0000-4000-8000-000000000002'::uuid manager,
 'ad436000-0000-4000-8000-000000000003'::uuid employee_user,
 'ad436000-0000-4000-8000-000000000004'::uuid emp,
 'ad436000-0000-4000-8000-000000000005'::uuid loc,
 'ad436000-0000-4000-8000-000000000006'::uuid other_loc,
 'ad436000-0000-4000-8000-000000000007'::uuid job,
 'ad436000-0000-4000-8000-000000000008'::uuid service,
 date_trunc('week',current_date)::date+14 start_day;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('ad436000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid;
$$;
insert into auth.users(id,email) select manager,'remaining-offer-manager@example.test' from ws
 union all select employee_user,'remaining-offer-employee@example.test' from ws;
insert into public.workspaces(id,name,created_by) select w,'Remaining Line Up offer terms',manager from ws;
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
 select w,manager,'owner'::public.workspace_role,true from ws
 union all select w,employee_user,'employee'::public.workspace_role,true from ws;
insert into public.workspace_scheduling_settings(workspace_id,availability_warning_policy) select w,'confirm' from ws on conflict(workspace_id) do update set availability_warning_policy='confirm';
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone,lineup_operations_enabled)
 select 'T00059-' || right(l::text, 4), l,w,case when l=loc then 'First site' else 'Second site' end,'1 Test Street','Test City','CA','90001','UTC',true from ws cross join lateral unnest(array[loc,other_loc]) l;
insert into public.jobs(id,workspace_id,name) select job,w,'Server' from ws;
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time)
 select service,w,'Dinner','18:00','22:00' from ws;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select emp,w,employee_user,'E-9934361','Remaining','Employee',manager from ws;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,emp,l,manager from ws cross join lateral unnest(array[loc,other_loc]) l;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by) select w,emp,job,true,manager from ws;
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
 select pg_temp.id(1),w,loc,start_day,1,manager from ws
 union all select pg_temp.id(2),w,other_loc,start_day,1,manager from ws
 union all select pg_temp.id(3),w,other_loc,start_day+7,1,manager from ws;
create temp table offers(n integer,pid uuid,entry_id uuid,op jsonb,acceptance jsonb,preview jsonb);
insert into offers(n,entry_id) select n,(public.upsert_schedule_lineup_entry_service(manager,w,loc,start_day+n-1,null,null,
 jsonb_build_object('source_shift_id',null,'employee_id',null,'job_id',job,'shift_type_id',service,'start_time','18:00','end_time','22:00',
 'section_id',null,'station','','call_off',false,'hidden',false,'display_order',0))->>'entry_id')::uuid
 from ws,generate_series(1,7) n where n<>3;
insert into public.schedule_published_shifts(id,source_shift_id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select pg_temp.id(13),pg_temp.id(33),w,loc,pg_temp.id(1),null,job,service,start_day+2,'18:00','22:00','explicit','UTC' from ws;
insert into offers(n,entry_id) values(3,pg_temp.id(13));
update offers set op=(select jsonb_build_object('kind','assign','source_entry_id',entry_id,'target_entry_id',null,'employee_id',emp,
 'reason','Cover this need','travel_minutes',0,'target',jsonb_build_object('date',start_day+n-1,'location_id',loc,'job_id',job,
 'shift_type_id',service,'start_time','18:00','end_time',case when n in(2,3,6) then '20:00' else '22:00' end,'section_id',null,'station','')) from ws);
insert into public.schedule_published_shifts(id,source_shift_id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select pg_temp.id(18),pg_temp.id(38),w,loc,pg_temp.id(1),null,job,service,start_day+5,'22:00','04:00','explicit','UTC' from ws;
insert into offers(n,entry_id,op) select 8,pg_temp.id(18),jsonb_build_object('kind','assign','source_entry_id',pg_temp.id(18),
 'target_entry_id',null,'employee_id',emp,'reason','Cover after midnight','travel_minutes',0,'target',jsonb_build_object('date',start_day+6,
 'location_id',loc,'job_id',job,'shift_type_id',service,'start_time','00:00','end_time','02:00','section_id',null,'station','')) from ws;
update offers set pid=(select public.lineup_proposals_service(manager,w,'propose',jsonb_build_object('kind','offer','operation',op,
 'fingerprint',public.lineup_operation_preview(manager,w,op)->>'fingerprint','idempotency_key',gen_random_uuid()))->>'id' from ws)::uuid;
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,emp,jsonb_build_object('input_mode','time_range','days',(select jsonb_agg(jsonb_build_object('day',d,'all_day',true,
 'range',null,'shift_type_ids','[]'::jsonb) order by d) from generate_series(0,6) d)),1,employee_user from ws;
select public.lineup_proposals_service(employee_user,w,'respond',jsonb_build_object('id',pid,'response','accept',
 'availability_fingerprint',public.weekly_lineup_offer_warning(w,pid)->>'fingerprint')) from ws,offers where n<>4;
update offers o set acceptance=p.employee_acceptance from public.lineup_proposals p where p.id=o.pid;
create function pg_temp.flush_terms() returns void language plpgsql as $$
begin
 set constraints weekly_lineup_offer_shift_terms_changed,weekly_lineup_offer_publication_terms_changed,
  weekly_lineup_offer_entry_terms_changed,weekly_lineup_offer_day_terms_changed immediate;
 set constraints weekly_lineup_offer_shift_terms_changed,weekly_lineup_offer_publication_terms_changed,
  weekly_lineup_offer_entry_terms_changed,weekly_lineup_offer_day_terms_changed deferred;
end; $$;
select pg_temp.flush_terms();
create function pg_temp.change_need(n integer,s text,e text) returns void language plpgsql as $$
declare result jsonb;
begin
 select public.upsert_schedule_lineup_entry_service(manager,w,loc,start_day+o.n-1,o.entry_id,entry.revision,
  to_jsonb(entry)||jsonb_build_object('start_time',s,'end_time',e)) into result
 from ws,offers o,public.schedule_lineup_entries entry where o.n=$1 and entry.id=o.entry_id;
 perform pg_temp.flush_terms();
end; $$;
create function pg_temp.finalize(n integer,command jsonb default '{}') returns jsonb language sql as $$
 select public.lineup_proposals_service(manager,w,'proposal_action',jsonb_build_object('id',pid,'response','confirm')||command)
 from ws,offers o where o.n=$1;
$$;

select ok((select weekly_manual_id=entry_id and weekly_source_id is null and weekly_whole_source from public.lineup_proposals where id=pid),
 'whole manual offer binds to the actual need, not a fictional Schedule source') from offers where n=1;
select ok(not (select weekly_whole_source from public.lineup_proposals where id=pid),'manual partial offer stays partial') from offers where n=2;
select pg_temp.change_need(1,'17:00','23:00');
select is((select operation->'target'->>'end_time' from public.lineup_proposals where id=pid),'23:00','whole manual offer follows current need hours') from offers where n=1;
select is((select employee_acceptance from public.lineup_proposals where id=pid),acceptance,'changed manual hours preserve the original response') from offers where n=1;
select is((select count(*) from public.notifications where source_id=pid and event_key like 'terms_%'),2::bigint,'manual terms change uses both existing notification audiences') from offers where n=1;
select is(pg_temp.finalize(1,'{"response":"preview"}')->>'allowed','true','changed manual offer needs no second availability choice');
select is(pg_temp.finalize(1)->>'status','applied','changed manual offer creates the canonical assignment');
select ok(exists(select 1 from public.schedule_published_shifts s join public.schedule_lineup_entries e on e.source_shift_id=s.id
 where e.id=entry_id and s.employee_id=emp and s.start_time='17:00' and s.end_time='23:00'),
 'manual need identity is retained after filling the updated hours') from ws,offers where n=1;

select pg_temp.change_need(2,'17:00','23:00');
select is((select operation->'target'->>'end_time' from public.lineup_proposals where id=pid),'20:00','larger manual parent does not expand a partial offer') from offers where n=2;
select is(pg_temp.finalize(2)->>'status','applied','contained manual partial offer retains acceptance');
select ok(exists(select 1 from public.schedule_published_shifts s join public.schedule_lineup_entries e on e.source_shift_id=s.id
 where e.id=entry_id and s.employee_id=emp and s.start_time='18:00' and s.end_time='20:00'),
 'only the explicitly offered partial hours are assigned') from ws,offers where n=2;
select is((select count(*) from public.schedule_lineup_entries e join public.schedule_lineups ln on ln.id=e.lineup_id
 where e.workspace_id=w and ln.lineup_date=start_day+1 and e.employee_id is null),2::bigint,'both remaining manual portions stay open') from ws;

-- A published partial offer follows date/location but keeps its own time interval.
update offers set preview=pg_temp.finalize(n,'{"response":"preview"}') where n=3;
update public.schedule_published_shifts set start_time='17:00',end_time='23:00',scheduled_date=(select start_day+7 from ws),
 location_id=(select other_loc from ws),publication_id=pg_temp.id(3) where id=pg_temp.id(13);
select pg_temp.flush_terms();
select ok((select operation->'target'->>'date'=(start_day+7)::text and operation->'target'->>'location_id'=other_loc::text
 and operation->'target'->>'start_time'='18:00' and operation->'target'->>'end_time'='20:00' from public.lineup_proposals where id=pid),
 'partial published offer follows the source day/location without growing') from ws,offers where n=3;
select throws_ok($$select pg_temp.finalize(3,jsonb_build_object('fingerprint',preview->>'fingerprint')) from offers where n=3$$,
 'P0001','stale approval preview; review both assignments again','prior partial-offer manager review becomes stale');
select is(pg_temp.finalize(3)->>'status','applied','partial published offer finalizes after date/location change');
select ok(exists(select 1 from public.schedule_published_shifts where id=pg_temp.id(13) and employee_id=emp
 and location_id=other_loc and scheduled_date=start_day+7 and start_time='18:00' and end_time='20:00'),
 'updated partial responsibility is the actual final Schedule assignment') from ws;

select pg_temp.change_need(4,'16:00','21:00');
select ok((select status='pending' and employee_acceptance is null from public.lineup_proposals where id=pid),'changed pending manual offer is never auto-accepted') from offers where n=4;
select pg_temp.change_need(6,'19:00','22:00');
select is((select operation->'target'->>'start_time' from public.lineup_proposals where id=pid),'18:00','out-of-bounds partial hours are never clipped or shifted silently') from offers where n=6;
select throws_ok($$select pg_temp.finalize(6)$$,'P0001','stale offer assignment; review the latest coverage need',
 'partial offer outside its new parent requires a staffing review');

-- Missing authority skips refresh; an authorized read repairs it after access returns.
update public.workspace_memberships set all_locations=false where workspace_id=(select w from ws) and user_id=(select manager from ws);
update public.schedule_lineup_entries set start_time='17:00',end_time='23:00',revision=revision+1 where id=(select entry_id from offers where n=5);
select pg_temp.flush_terms();
select is((select operation->'target'->>'start_time' from public.lineup_proposals where id=pid),'18:00','no-manager state does not fabricate an authorized source read') from offers where n=5;
update public.workspace_memberships set all_locations=true where workspace_id=(select w from ws) and user_id=(select manager from ws);
select ok((select item->>'start_time'='17:00' and item->'availability_warning'='null'::jsonb from jsonb_array_elements(
 public.lineup_proposals_service(employee_user,w,'offers','{}')) item where item->>'id'=pid::text),
 'employee read recovers updated accepted terms after manager authority returns') from ws,offers where n=5;
select is((select employee_acceptance from public.lineup_proposals where id=pid),acceptance,'recovery preserves the original response') from offers where n=5;
select is((select count(*) from public.notifications where source_id=pid and event_key like 'terms_%'),2::bigint,'recovery emits one terms notification per audience') from offers where n=5;
select public.lineup_proposals_service(employee_user,w,'offers','{}') is not null from ws;
select is((select count(*) from public.notifications where source_id=pid and event_key like 'terms_%'),2::bigint,'read retries do not duplicate recovered notices') from offers where n=5;

-- Private markers and the original need identity cannot be transferred.
select throws_ok($$select public.refresh_weekly_lineup_offers_for_actor(employee_user,w,pg_temp.id(99)) from ws$$,
 '42501','Offer access denied','recovery checks the employee argument independently');
select throws_ok($$select public.refresh_weekly_lineup_offers_for_actor(employee_user,w) from ws$$,
 '42501','Offer access denied','employee cannot use manager recovery');
insert into public.jobs(id,workspace_id,name) select pg_temp.id(80),w,'Other responsibility' from ws;
update public.schedule_lineup_entries set job_id=pg_temp.id(80) where id=(select entry_id from offers where n=5);
select pg_temp.flush_terms();
select throws_ok($$select pg_temp.finalize(5)$$,'P0001','stale offer assignment; review the latest coverage need','new job cannot reuse a manual offer acceptance');

create function pg_temp.fail_notice() returns trigger language plpgsql as $$
begin
 if new.workspace_id='ad436000-0000-4000-8000-000000000001' and new.event_key like 'terms_%' then raise exception 'test manual notification failure'; end if;
 return new;
end; $$;
create trigger test_manual_notice before insert on public.notifications for each row execute function pg_temp.fail_notice();
select throws_ok($$select pg_temp.change_need(7,'17:00','23:00')$$,'P0001','test manual notification failure','manual edit and deferred notification fail atomically');
select ok((select start_time='18:00' from public.schedule_lineup_entries where id=entry_id)
 and (select weekly_terms_history='[]'::jsonb from public.lineup_proposals where id=pid),'failed notice restores original manual need and offer') from offers where n=7;
drop trigger test_manual_notice on public.notifications;
update public.schedule_published_shifts set scheduled_date=(select start_day+6 from ws),end_time='05:00',
 location_id=(select other_loc from ws),publication_id=pg_temp.id(2) where id=pg_temp.id(18);
select pg_temp.flush_terms();
select ok((select source_date=start_day+6 and operation->'target'->>'date'=(start_day+7)::text
 and operation->'target'->>'start_time'='00:00' and operation->'target'->>'end_time'='02:00' from public.lineup_proposals where id=pid),
 'overnight partial offer keeps its next-day offset across the week boundary') from ws,offers where n=8;
select is(pg_temp.finalize(8)->>'status','applied','overnight partial offer finalizes in the next publication week');
select ok(exists(select 1 from public.schedule_published_shifts where id=pg_temp.id(18) and employee_id=emp and scheduled_date=start_day+7
 and start_time='00:00' and end_time='02:00' and location_id=other_loc),'actual overnight assignment keeps only the offered hours') from ws;
select ok(not has_function_privilege('service_role','public.refresh_weekly_lineup_offers_for_actor(uuid,uuid,uuid)','execute')
 and not has_function_privilege('authenticated','public.refresh_weekly_lineup_offer_terms_after_entry()','execute'),'recovery and entry helpers remain private');
select * from finish();
rollback;
