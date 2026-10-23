begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table ws as select
 'ad428000-0000-4000-8000-000000000001'::uuid w,
 'ad428000-0000-4000-8000-000000000002'::uuid owner_id,
 'ad428000-0000-4000-8000-000000000003'::uuid first_user,
 'ad428000-0000-4000-8000-000000000004'::uuid second_user,
 'ad428000-0000-4000-8000-000000000005'::uuid first_emp,
 'ad428000-0000-4000-8000-000000000006'::uuid second_emp,
 'ad428000-0000-4000-8000-000000000007'::uuid loc,
 'ad428000-0000-4000-8000-000000000008'::uuid other_loc,
 'ad428000-0000-4000-8000-000000000009'::uuid job,
 'ad428000-0000-4000-8000-000000000011'::uuid manager_a,
 'ad428000-0000-4000-8000-000000000012'::uuid manager_b,
 (date_trunc('week',current_date)::date+14) start_day;
insert into auth.users(id,email) select owner_id,'terms-owner@example.test' from ws
 union all select first_user,'terms-first@example.test' from ws union all select second_user,'terms-second@example.test' from ws
 union all select manager_a,'terms-manager-a@example.test' from ws union all select manager_b,'terms-manager-b@example.test' from ws;
insert into public.workspaces(id,name,created_by) select w,'Changed terms',owner_id from ws;
insert into public.workspace_memberships (workspace_id, user_id, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (select w,owner_id,'owner'::public.workspace_role,true from ws
 union all select w,first_user,'employee'::public.workspace_role,true from ws
 union all select w,second_user,'employee'::public.workspace_role,true from ws
 union all select w,manager_a,'manager'::public.workspace_role,false from ws
 union all select w,manager_b,'manager'::public.workspace_role,false from ws) as legacy(workspace_id, user_id, role, all_locations);
insert into public.workspace_scheduling_settings(workspace_id) select w from ws on conflict do nothing;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select 'T00053', loc,w,'Original site','1 Test Street','Test City','CA','90001','UTC' from ws
 union all select 'T00054', other_loc,w,'New site','2 Test Street','Test City','NY','10001','America/New_York' from ws;
select tests.works_at(m.id, case when m.user_id=manager_a then loc else other_loc end) from ws
 join public.workspace_memberships m on m.workspace_id=w and m.user_id in(manager_a,manager_b);
insert into public.jobs(id,workspace_id,name) select job,w,'Server' from ws;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select first_emp,w,first_user,'E-9934281','First','Employee',owner_id from ws
 union all select second_emp,w,second_user,'E-9934282','Second','Employee',owner_id from ws;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,e.id,l.id,owner_id from ws cross join lateral unnest(array[first_emp,second_emp]) e(id)
 cross join lateral unnest(array[loc,other_loc]) l(id);
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
 select w,e.id,job,true,owner_id from ws cross join lateral unnest(array[first_emp,second_emp]) e(id);
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
 select 'ad428000-0000-4000-8000-000000000010'::uuid,w,loc,start_day,1,owner_id from ws
 union all select 'ad428000-0000-4000-8000-000000000013'::uuid,w,other_loc,start_day,1,owner_id from ws;
create function pg_temp.shift_id(n integer) returns uuid language sql immutable as $$
 select ('ad428000-0000-4000-8000-'||lpad((20+n)::text,12,'0'))::uuid;
$$;
insert into public.schedule_published_shifts(id,source_shift_id,workspace_id,location_id,publication_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select pg_temp.shift_id(n),pg_temp.shift_id(10+n),w,case when n=6 then other_loc else loc end,
  case when n=6 then 'ad428000-0000-4000-8000-000000000013'::uuid else 'ad428000-0000-4000-8000-000000000010'::uuid end,
  case when n=6 then second_emp else first_emp end,job,start_day+n-1,'18:00','22:00','explicit',
  case when n=6 then 'America/New_York' else 'UTC' end from ws cross join generate_series(1,7) n;
create function pg_temp.flush() returns void language plpgsql as $$ begin
 set constraints weekly_exchange_shift_terms_changed,weekly_exchange_publication_terms_changed immediate;
 set constraints weekly_exchange_shift_terms_changed,weekly_exchange_publication_terms_changed deferred;
end; $$;
select pg_temp.flush();
create function pg_temp.command(actor uuid,command jsonb) returns jsonb language sql as $$
 select public.shift_exchanges_command_service(actor,w,command,gen_random_uuid()) from ws;
$$;
create function pg_temp.read_model(actor uuid) returns jsonb language sql as $$
 select public.shift_exchanges_read_service(actor,w,false,start_day,start_day+10) from ws;
$$;
create temp table state(n integer primary key,cid uuid,aid uuid,revision integer,preview jsonb);
do $$declare n integer; r jsonb; f ws%rowtype; begin select * into f from ws;
 for n in select x from unnest(array[1,2,3,4,7]) x loop
  r:=pg_temp.command(f.first_user,jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift_id(n)));
  r:=pg_temp.command(f.second_user,jsonb_build_object('action','apply','shift_id',pg_temp.shift_id(n),'case_id',r->>'case_id'));
  insert into state select n,(r->>'case_id')::uuid,a.id,(r->>'revision')::integer,null from public.shift_exchange_applications a where a.case_id=(r->>'case_id')::uuid;
 end loop;
end; $$;
update state set preview=(select public.shift_exchange_preview(manager_a,w,cid,aid) from ws) where n=1;
update public.schedule_published_shifts set scheduled_date=(select start_day+1 from ws),start_time='19:00',end_time='23:00',
 location_id=(select other_loc from ws),publication_id='ad428000-0000-4000-8000-000000000013',time_timezone='America/New_York' where id=pg_temp.shift_id(1);
select pg_temp.flush();
select is(public.shift_exchange_live_status(w,cid),'open','changed date, hours and location retain the open request') from ws,state where n=1;
select is((select status from public.shift_exchange_applications where id=aid),'pending_manager','same employee acceptance is not reset') from state where n=1;
select is((select revision from public.shift_exchange_cases where id=cid),revision+1,'changed terms increment request revision once') from state where n=1;
select is((select offered_snapshot->>'location_id' from public.shift_exchange_cases where id=cid),(select other_loc::text from ws),'current request scope follows the new location') from state where n=1;
select is((select consent_fingerprint from public.shift_exchange_applications where id=aid),(select consent_fingerprint from public.shift_exchange_cases where id=cid),'retained acceptance is bound to current terms') from state where n=1;
select is((select expires_at from public.shift_exchange_cases where id=cid),(select (public.shift_exchange_shift(w,pg_temp.shift_id(1))->>'starts_at')::timestamptz-interval '4 hours' from ws),'deadline follows the new physical start, 4 hours before it (TAKAS-RELEASE)') from state where n=1;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift_id(1)),(select first_emp from ws),'term changes do not transfer responsibility');
select is((select count(*) from public.shift_exchange_events where case_id=cid and action='terms_changed'),1::bigint,'one changed-term event despite multiple queued triggers') from state where n=1;
select is((select details->'before'->'offered'->>'start_time' from public.shift_exchange_events where case_id=cid and action='terms_changed'),'18:00:00','original accepted descriptor remains in private history') from state where n=1;
select is((select details->'after'->'offered'->>'start_time' from public.shift_exchange_events where case_id=cid and action='terms_changed'),'19:00:00','history records the new descriptor') from state where n=1;
select ok(not (pg_temp.read_model(second_user)::text like '%"details"%'),'employee history does not expose private audit payload') from ws;
select throws_ok($$select public.shift_exchange_preview(manager_a,w,cid,aid) from ws,state where n=1$$,'42501',null,'old location manager cannot approve after the move');
select throws_ok($$select pg_temp.command(owner_id,jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',revision,'fingerprint',preview->>'fingerprint')) from ws,state where n=1$$,'PT409',null,'stale manager decision cannot reuse the old review');
select public.refresh_weekly_exchange_terms(w,cid) from ws,state where n=1;
update public.schedule_published_shifts set note='Only a note changed' where id=pg_temp.shift_id(1);
select pg_temp.flush();
select is((select count(*) from public.shift_exchange_events where case_id=cid and action='terms_changed'),1::bigint,'unchanged terms and shift notes write no second change') from state where n=1;

-- A failed history write rolls back the changed shift and request.
create function pg_temp.fail_terms_history() returns trigger language plpgsql as $$ begin
 if new.action='terms_changed' then raise exception 'Simulated history failure'; end if; return new;
end; $$;
create trigger test_terms_history_failure before insert on public.shift_exchange_events for each row execute function pg_temp.fail_terms_history();
create function pg_temp.change_and_flush() returns void language plpgsql as $$ begin
 update public.schedule_published_shifts set start_time='20:00' where id=pg_temp.shift_id(1);
 perform pg_temp.flush();
end; $$;
select throws_ok($$select pg_temp.change_and_flush()$$,'P0001','Simulated history failure','a history failure cannot commit a silent term change');
drop trigger test_terms_history_failure on public.shift_exchange_events;
select is((select start_time::text from public.schedule_published_shifts where id=pg_temp.shift_id(1)),'19:00:00','a history failure restores the published hours');
select is((select revision from public.shift_exchange_cases where id=cid),revision+1,'a history failure restores request revision') from state where n=1;
select tests.approved_leave(w,second_emp,second_user,other_loc,start_day+1,'19:00','20:00','ad428000-0000-4000-8000-000000000050') from ws;
select is(public.shift_exchange_preview(manager_b,w,cid,aid)->>'allowed','false','retained acceptance still cannot bypass approved leave at the new time') from ws,state where n=1;
-- Waiting for an answer: no `effective` hours yet (time off rebuild D8).
update public.time_off_requests set status='pending',effective='{}',decided_by=null,decided_at=null where id='ad428000-0000-4000-8000-000000000050';
select is(pg_temp.command(manager_b,jsonb_build_object('action','approve','case_id',cid,'application_id',aid,
 'expected_revision',(select revision from public.shift_exchange_cases where id=cid),
 'fingerprint',public.shift_exchange_preview(manager_b,w,cid,aid)->>'fingerprint'))->>'status','completed','current scoped manager completes the changed shift without employee re-acceptance') from ws,state where n=1;
select pg_temp.flush();
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift_id(1)),(select second_emp from ws),'final approval transfers the updated assignment');

-- A historical deadline or a different responsibility cannot be resurrected.
update public.shift_exchange_cases set expires_at=clock_timestamp()-interval '1 minute' where id=(select cid from state where n=2);
update public.schedule_published_shifts set start_time='19:00' where id=pg_temp.shift_id(2);
select pg_temp.flush();
select is(public.shift_exchange_live_status(w,cid),'expired','rescheduling never revives an already expired request') from ws,state where n=2;
do $$declare f ws%rowtype; r jsonb; begin select * into f from ws;
 r:=pg_temp.command(f.first_user,jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift_id(2)));
 r:=pg_temp.command(f.second_user,jsonb_build_object('action','apply','shift_id',pg_temp.shift_id(2),'case_id',r->>'case_id'));
 insert into state select 8,(r->>'case_id')::uuid,a.id,(r->>'revision')::integer,null from public.shift_exchange_applications a where a.case_id=(r->>'case_id')::uuid;
end; $$;
update public.schedule_published_shifts set scheduled_date=current_date-1 where id=pg_temp.shift_id(2);
select pg_temp.flush();
select is((select status from public.shift_exchange_cases where id=cid),'expired','moving a future request into the past closes it atomically') from state where n=8;
select is((select status from public.shift_exchange_applications where id=aid),'expired','past shift closes active applications without transferring') from state where n=8;
select is((select count(*) from public.shift_exchange_events where case_id=cid and action='expired'),1::bigint,'past-time closure leaves one history row') from state where n=8;

update public.schedule_published_shifts set start_time='19:00' where id=pg_temp.shift_id(4);
select pg_temp.flush();
select pg_temp.command(second_user,jsonb_build_object('action','withdraw','case_id',cid,'application_id',aid,
 'expected_revision',(select revision from public.shift_exchange_cases where id=cid))) from ws,state where n=4;
update public.schedule_published_shifts set start_time='20:00' where id=pg_temp.shift_id(4);
select pg_temp.flush();
update public.schedule_published_shifts set employee_id=(select second_emp from ws) where id=pg_temp.shift_id(3);
select pg_temp.flush();
select is(public.shift_exchange_live_status(w,cid),'invalidated','changed owner does not inherit consent') from ws,state where n=3;
select ok(not public.weekly_exchange_same_responsibility(public.shift_exchange_shift(w,pg_temp.shift_id(7)),
 public.shift_exchange_shift(w,pg_temp.shift_id(7))||jsonb_build_object('job_id',gen_random_uuid())),'position changes remain outside date/time/location retention') from ws;

-- Both swap sides retain their choices; invitations are never auto-accepted.
do $$declare f ws%rowtype; r jsonb; begin select * into f from ws;
 r:=pg_temp.command(f.first_user,jsonb_build_object('action','create','kind','swap','shift_id',pg_temp.shift_id(5),'requested_shift_id',pg_temp.shift_id(6)));
 insert into state select 5,(r->>'case_id')::uuid,a.id,(r->>'revision')::integer,null from public.shift_exchange_applications a where a.case_id=(r->>'case_id')::uuid;
end; $$;
update public.schedule_published_shifts set start_time='17:00',end_time='21:00' where id=pg_temp.shift_id(6);
select pg_temp.flush();
select is((select status from public.shift_exchange_applications where id=aid),'invited','changed swap terms do not invent invited employee acceptance') from state where n=5;
select pg_temp.command(second_user,jsonb_build_object('action','accept','case_id',cid,'application_id',aid,
 'expected_revision',(select revision from public.shift_exchange_cases where id=cid))) from ws,state where n=5;
select pg_temp.command(manager_a,jsonb_build_object('action','approve','case_id',cid,'application_id',aid,
 'expected_revision',(select revision from public.shift_exchange_cases where id=cid),
 'fingerprint',public.shift_exchange_preview(manager_a,w,cid,aid)->>'fingerprint')) from ws,state where n=5;
select is((select count(*) from public.shift_exchange_votes where case_id=cid),1::bigint,'cross-location swap waits for the second scoped manager') from state where n=5;
update public.schedule_published_shifts set start_time='19:00' where id=pg_temp.shift_id(5);
select pg_temp.flush();
select is((select count(*) from public.shift_exchange_votes where case_id=cid),0::bigint,'new terms clear the prior manager vote, not employee acceptance') from state where n=5;
select is((select status from public.shift_exchange_applications where id=aid),'pending_manager','both swap participants retain consent after another term change') from state where n=5;
select is(pg_temp.command(manager_b,jsonb_build_object('action','approve','case_id',cid,'application_id',aid,
 'expected_revision',(select revision from public.shift_exchange_cases where id=cid),
 'fingerprint',public.shift_exchange_preview(manager_b,w,cid,aid)->>'fingerprint'))->>'status','open','second location cannot finalize using the invalidated first vote') from ws,state where n=5;
select is(pg_temp.command(manager_a,jsonb_build_object('action','approve','case_id',cid,'application_id',aid,
 'expected_revision',(select revision from public.shift_exchange_cases where id=cid),
 'fingerprint',public.shift_exchange_preview(manager_a,w,cid,aid)->>'fingerprint'))->>'status','completed','fresh manager reviews finalize both retained swap acceptances') from ws,state where n=5;
select pg_temp.flush();

-- Replacement publication: the source identity survives a new physical row.
update public.schedule_location_publications set status='superseded' where id='ad428000-0000-4000-8000-000000000010';
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
 select 'ad428000-0000-4000-8000-000000000014',w,loc,start_day,2,owner_id from ws;
insert into public.schedule_published_shifts(id,source_shift_id,workspace_id,location_id,publication_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select 'ad428000-0000-4000-8000-000000000060',source_shift_id,workspace_id,location_id,'ad428000-0000-4000-8000-000000000014',employee_id,job_id,scheduled_date,'19:00',end_time,time_basis,time_timezone
 from public.schedule_published_shifts where id=pg_temp.shift_id(7);
select pg_temp.flush();
select is(public.shift_exchange_live_status(w,cid),'open','replacement publication evaluates final state rather than its missing-source intermediate state') from ws,state where n=7;
select is((select offered_snapshot->>'id' from public.shift_exchange_cases where id=cid),'ad428000-0000-4000-8000-000000000060','current snapshot follows the new published row') from state where n=7;
select is((select count(*) from public.shift_exchange_events where case_id=cid and action='terms_changed'),1::bigint,'publication and row triggers coalesce to one term-change event') from state where n=7;
select is(pg_temp.command(manager_a,jsonb_build_object('action','approve','case_id',cid,'application_id',aid,
 'expected_revision',(select revision from public.shift_exchange_cases where id=cid),
 'fingerprint',public.shift_exchange_preview(manager_a,w,cid,aid)->>'fingerprint'))->>'status','completed','same logical shift transfers after republish without another employee response') from ws,state where n=7;
select pg_temp.flush();
-- D6 (P24): new hours that overlap another shift of the person who accepted
-- end that acceptance; an open search keeps looking, a direct offer ends.
insert into public.schedule_published_shifts(id,source_shift_id,workspace_id,location_id,publication_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select pg_temp.shift_id(n),pg_temp.shift_id(10+n),w,loc,'ad428000-0000-4000-8000-000000000014',
  case when n in (81,83) then second_emp else first_emp end,job,start_day+case when n<82 then 2 else 4 end,
  case when n in (80,82) then '10:00'::time else '13:00' end,case when n in (80,82) then '12:00'::time else '15:00' end,'explicit','UTC'
 from ws cross join unnest(array[80,81,82,83]) n;
select pg_temp.flush();
do $$declare f ws%rowtype; r jsonb; begin select * into f from ws;
 r:=pg_temp.command(f.first_user,jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift_id(80)));
 r:=pg_temp.command(f.second_user,jsonb_build_object('action','apply','shift_id',pg_temp.shift_id(80),'case_id',r->>'case_id'));
 insert into state select 80,(r->>'case_id')::uuid,a.id,(r->>'revision')::integer,null from public.shift_exchange_applications a where a.case_id=(r->>'case_id')::uuid;
 r:=pg_temp.command(f.first_user,jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift_id(82),'employee_id',f.second_emp));
 insert into state select 82,(r->>'case_id')::uuid,a.id,(r->>'revision')::integer,null from public.shift_exchange_applications a where a.case_id=(r->>'case_id')::uuid;
end; $$;
select pg_temp.command(second_user,jsonb_build_object('action','accept','case_id',cid,'application_id',aid,
 'expected_revision',(select revision from public.shift_exchange_cases where id=cid))) from ws,state where n=82;
select is((select status from public.shift_exchange_applications where id=aid),'pending_manager','Second accepted both offers') from state where n in (80,82);
update public.schedule_published_shifts set start_time='13:30',end_time='15:30' where id=pg_temp.shift_id(80);
select pg_temp.flush();
select is((select status from public.shift_exchange_applications where id=aid),'invalidated','new hours overlapping her own shift end her acceptance') from state where n=80;
select is(public.shift_exchange_live_status(w,cid),'open','the open search keeps looking for somebody else') from ws,state where n=80;
select is((select count(*) from public.shift_exchange_events where case_id=cid and action='invalidated' and application_id=aid),1::bigint,
 'her acceptance ending is in the history') from state where n=80;
select is((select details->'acceptances_ended' from public.shift_exchange_events where case_id=cid and action='terms_changed'),
 jsonb_build_array(aid),'the private history names the acceptance that ended') from state where n=80;
update public.schedule_published_shifts set start_time='14:00',end_time='16:00' where id=pg_temp.shift_id(82);
select pg_temp.flush();
select is(public.shift_exchange_live_status(w,cid),'invalidated','a direct offer whose one acceptance ends, ends') from ws,state where n=82;
select is((select status from public.shift_exchange_applications where id=aid),'invalidated','with its acceptance') from state where n=82;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift_id(82)),(select first_emp from ws),'and nobody''s shift changed');
-- Approved time off at the new hours is no overlap: the acceptance stays and
-- the approval meets the leave (D6; the preview cell above).
insert into public.schedule_published_shifts(id,source_shift_id,workspace_id,location_id,publication_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select pg_temp.shift_id(84),pg_temp.shift_id(94),w,loc,'ad428000-0000-4000-8000-000000000014',first_emp,job,start_day+5,'10:00','12:00','explicit','UTC' from ws;
select pg_temp.flush();
do $$declare f ws%rowtype; r jsonb; begin select * into f from ws;
 r:=pg_temp.command(f.first_user,jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift_id(84)));
 r:=pg_temp.command(f.second_user,jsonb_build_object('action','apply','shift_id',pg_temp.shift_id(84),'case_id',r->>'case_id'));
 insert into state select 84,(r->>'case_id')::uuid,a.id,(r->>'revision')::integer,null from public.shift_exchange_applications a where a.case_id=(r->>'case_id')::uuid;
end; $$;
select tests.approved_leave(w,second_emp,second_user,loc,start_day+5,'14:00','15:00') from ws;
update public.schedule_published_shifts set start_time='13:30',end_time='15:30' where id=pg_temp.shift_id(84);
select pg_temp.flush();
select is((select status from public.shift_exchange_applications where id=aid),'pending_manager','new hours over her approved time off keep her acceptance') from state where n=84;

select ok(not has_function_privilege('authenticated','public.refresh_weekly_exchange_terms(uuid,uuid)','execute'),'employee cannot rewrite request snapshots directly');
select ok(not has_function_privilege('service_role','public.refresh_weekly_exchange_terms(uuid,uuid)','execute'),'snapshot refresh is not an exposed RPC');
select * from finish();
rollback;
