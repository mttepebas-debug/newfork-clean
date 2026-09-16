begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.w() returns uuid language sql as $$select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid$$;
create function pg_temp.manager() returns uuid language sql as $$select 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid$$;
create function pg_temp.actor(n integer) returns uuid language sql as $$select ('ae800000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.emp(n integer) returns uuid language sql as $$select ('ae890000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.actor(n),'00000000-0000-0000-0000-000000000000','authenticated','authenticated','exchange-'||n||'@example.test','','{}','{}',now(),now() from generate_series(1,6)n;
insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations)
select pg_temp.w(),pg_temp.actor(n),'employee','active',true from generate_series(1,4)n;
-- Fresh actors do not depend on shared seed employees remaining active.
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,preferred_name,created_by)
select pg_temp.emp(n),pg_temp.w(),pg_temp.actor(n),'E-28'||(9900+n)::text,'Employee',n::text,'',pg_temp.manager() from generate_series(1,4)n;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,country_code,timezone)
select 'T00038-' || n::text, ('ae8a0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.w(),'Publication QA '||n,'1 Test St','Test City','CA','94000','US','America/Los_Angeles' from generate_series(1,2)n;
insert into public.jobs(id,workspace_id,name) values('ae8b0000-0000-4000-8000-000000000001',pg_temp.w(),'Publication QA job');
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time) values('ae8c0000-0000-4000-8000-000000000001',pg_temp.w(),'Publication QA service','09:00','17:00');
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
select pg_temp.w(),pg_temp.emp(n),l.id,pg_temp.manager() from generate_series(1,4)n cross join public.locations l where l.workspace_id=pg_temp.w() and l.id in('ae8a0000-0000-4000-8000-000000000001','ae8a0000-0000-4000-8000-000000000002')
and not exists(select 1 from public.employee_location_assignments a where a.employee_id=pg_temp.emp(n) and a.location_id=l.id and ended_at is null);
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by)
select pg_temp.w(),pg_temp.emp(n),'ae8b0000-0000-4000-8000-000000000001',pg_temp.manager() from generate_series(1,4)n
where not exists(select 1 from public.employee_job_assignments where employee_id=pg_temp.emp(n) and job_id='ae8b0000-0000-4000-8000-000000000001' and ended_at is null);
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until)
select pg_temp.w(),pg_temp.emp(n),coalesce((select max(version_number) from public.employee_schedule_availability_versions where employee_id=pg_temp.emp(n)),0)+1,'America/Los_Angeles',
(select jsonb_agg(jsonb_build_object('day',d,'mode','unrestricted','windows','[]'::jsonb)) from generate_series(0,6)d),'manager',pg_temp.manager(),'2030-01-07','2030-01-20' from generate_series(1,4)n;
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
values('ae810000-0000-4000-8000-000000000001',pg_temp.w(),'ae8a0000-0000-4000-8000-000000000001','2030-01-07',1,pg_temp.manager());
insert into public.schedule_published_shifts(id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
select ('ae820000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.w(),'ae8a0000-0000-4000-8000-000000000001','ae810000-0000-4000-8000-000000000001',case n when 4 then null when 3 then pg_temp.emp(2) else pg_temp.emp(1) end,'ae8b0000-0000-4000-8000-000000000001','ae8c0000-0000-4000-8000-000000000001','2030-01-07'::date+n-1,'09:00','17:00',gen_random_uuid() from generate_series(1,4)n;
create function pg_temp.shift(n integer) returns uuid language sql as $$select ('ae820000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;

update public.workspaces set shift_exchanges_enabled=true where id=pg_temp.w();
update public.locations set lineup_operations_enabled=true where id in('ae8a0000-0000-4000-8000-000000000001','ae8a0000-0000-4000-8000-000000000002');
insert into public.schedule_lineup_sections(id,workspace_id,name,color) values('ae850000-0000-4000-8000-000000000001',pg_temp.w(),'Person-state QA','#537663');
insert into public.schedule_lineups(id,workspace_id,location_id,lineup_date,created_by,updated_by)
values('ae860000-0000-4000-8000-000000000001',pg_temp.w(),'ae8a0000-0000-4000-8000-000000000001','2030-01-07',pg_temp.manager(),pg_temp.manager());
-- Share the original assignment before a later legacy override/call-off is recorded.
insert into public.schedule_lineup_entries(id,workspace_id,lineup_id,location_id,source_shift_id,employee_id,job_id,shift_type_id,start_time,end_time,section_id,station,call_off,note,created_by,updated_by,placement_segments)
values('ae870000-0000-4000-8000-000000000001',pg_temp.w(),'ae860000-0000-4000-8000-000000000001','ae8a0000-0000-4000-8000-000000000001',pg_temp.shift(1),pg_temp.emp(1),'ae8b0000-0000-4000-8000-000000000001','ae8c0000-0000-4000-8000-000000000001','09:00','17:00','ae850000-0000-4000-8000-000000000001','Shared station',false,'PERSON-SPECIFIC OLD NOTE',pg_temp.manager(),pg_temp.manager(),
jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'section_id','ae850000-0000-4000-8000-000000000001','station','Shared early station','start_at','2030-01-07T17:00:00Z','end_at','2030-01-07T21:00:00Z'),jsonb_build_object('id',gen_random_uuid(),'section_id','ae850000-0000-4000-8000-000000000001','station','Shared late station','start_at','2030-01-07T21:00:00Z','end_at','2030-01-08T01:00:00Z')));
-- Unlinked manual work belongs to another employee and must not be guessed into this shift.
insert into public.schedule_lineup_entries(id,workspace_id,lineup_id,location_id,employee_id,job_id,shift_type_id,start_time,end_time,station,note,created_by,updated_by)
values('ae870000-0000-4000-8000-000000000002',pg_temp.w(),'ae860000-0000-4000-8000-000000000001','ae8a0000-0000-4000-8000-000000000001',pg_temp.emp(4),'ae8b0000-0000-4000-8000-000000000001','ae8c0000-0000-4000-8000-000000000001','18:00','19:00','Legacy independent','LEGACY NOTE',pg_temp.manager(),pg_temp.manager());
create temp table person_state(cid uuid,aid uuid,preview jsonb,prior uuid,prior_hash text,segments jsonb,legacy jsonb,shared_entries jsonb);
insert into person_state(segments,legacy) select placement_segments,(select to_jsonb(e) from public.schedule_lineup_entries e where id='ae870000-0000-4000-8000-000000000002') from public.schedule_lineup_entries where id='ae870000-0000-4000-8000-000000000001';
update person_state set prior=(public.share_schedule_lineup_service(pg_temp.manager(),pg_temp.w(),'2030-01-07',array['ae8a0000-0000-4000-8000-000000000001'::uuid],public.preview_schedule_lineup_share_service(pg_temp.manager(),pg_temp.w(),'2030-01-07',array['ae8a0000-0000-4000-8000-000000000001'::uuid])->>'fingerprint')->'snapshot_ids'->>0)::uuid;
update person_state set prior_hash=(select md5(content::text) from public.schedule_lineup_snapshots where id=prior),shared_entries=(select content->'entries' from public.schedule_lineup_snapshots where id=prior);
select ok((select jsonb_array_length(shared_entries)>=2 from person_state),'real prior share includes source placements and legacy work');
-- Only live placement WIP is changed after sharing; delta must retain shared placements.
update public.schedule_lineup_entries set employee_id=pg_temp.emp(2),call_off=true,station='UNSHARED STATION WIP',placement_segments=jsonb_set(placement_segments,'{0,station}','"UNSHARED EARLY WIP"'),note='UNSHARED PRIVATE NOTE' where id='ae870000-0000-4000-8000-000000000001';
update person_state set segments=(select placement_segments from public.schedule_lineup_entries where id='ae870000-0000-4000-8000-000000000001');
update person_state set cid=(public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift(1)),gen_random_uuid())->>'case_id')::uuid;
select lives_ok($$select public.shift_exchanges_command_service(pg_temp.actor(3),pg_temp.w(),jsonb_build_object('action','apply','case_id',cid,'shift_id',pg_temp.shift(1)),gen_random_uuid()) from person_state$$,'eligible replacement applies despite source-linked old person override');
update person_state set aid=(select id from public.shift_exchange_applications where case_id=cid),preview=null;
update person_state set preview=public.shift_exchange_preview(pg_temp.manager(),pg_temp.w(),cid,aid);
select is(preview->>'allowed','true','old override and call-off do not become recipient eligibility') from person_state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(1)),pg_temp.emp(1),'canonical owner remains responsible before final');
update public.locations set lineup_operations_enabled=false where id='ae8a0000-0000-4000-8000-000000000001';
select lives_ok($$select public.shift_exchanges_command_service(pg_temp.manager(),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',2,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from person_state$$,'canonical exchange can finalize while Line Up editing is disabled');
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(1)),pg_temp.emp(3),'published owner is the selected replacement');
select is((select employee_id from public.schedule_lineup_entries where id='ae870000-0000-4000-8000-000000000001'),pg_temp.emp(3),'legacy person override is reconciled to selected replacement');
select is((select call_off from public.schedule_lineup_entries where id='ae870000-0000-4000-8000-000000000001'),false,'old call-off is not copied to new employee');
select is((select note from public.schedule_lineup_entries where id='ae870000-0000-4000-8000-000000000001'),'','old person-specific note is cleared');
select is((select placement_segments from public.schedule_lineup_entries where id='ae870000-0000-4000-8000-000000000001'),segments,'live placement WIP remains intact') from person_state;
select is((select to_jsonb(e) from public.schedule_lineup_entries e where id='ae870000-0000-4000-8000-000000000002'),legacy,'independent legacy assignment is unchanged') from person_state;
select is((select md5(content::text) from public.schedule_lineup_snapshots where id=prior),prior_hash,'previous share is immutable') from person_state;
create temp table person_latest as select content from public.schedule_lineup_snapshots where workspace_id=pg_temp.w() and location_id='ae8a0000-0000-4000-8000-000000000001' and lineup_date='2030-01-07' order by version_number desc limit 1;
select is((select count(*)::int from public.schedule_lineup_snapshots where workspace_id=pg_temp.w() and location_id='ae8a0000-0000-4000-8000-000000000001' and lineup_date='2030-01-07'),2,'final creates exactly one assignment delta share');
select ok(not exists(select 1 from person_latest cross join lateral jsonb_array_elements(content->'entries') e where e->>'source_shift_id'=pg_temp.shift(1)::text and (e->>'employee_id'<>pg_temp.emp(3)::text or coalesce((e->>'call_off')::boolean,false) or coalesce(e->>'note','')<>'')),'every shared segment uses new person with no inherited call-off or note');
select ok((select content::text like '%Shared early station%' and content::text like '%Shared late station%' and content::text not like '%UNSHARED%' and content::text not like '%PERSON-SPECIFIC OLD NOTE%' from person_latest),'assignment delta preserves shared placement and excludes live private WIP');
select is((select jsonb_agg(e order by e->>'id') from person_latest cross join lateral jsonb_array_elements(content->'entries') e where e->>'source_shift_id' is null),(select jsonb_agg(e order by e->>'id') from person_state cross join lateral jsonb_array_elements(shared_entries) e where e->>'source_shift_id' is null),'shared independent legacy rows are unchanged');
select is((select e->>'employee_id' from jsonb_array_elements(public.get_schedule_lineup_service(pg_temp.manager(),pg_temp.w(),'2030-01-07',array['ae8a0000-0000-4000-8000-000000000001'::uuid],null)->'locations'->0->'entries') e where e->>'source_shift_id'=pg_temp.shift(1)::text),pg_temp.emp(3)::text,'disabled Line Up live read still projects canonical replacement');

-- A prior call-off share omitted this source entirely: do not silently approve
-- an assignment delta that cannot bind to the shared plan.
insert into public.schedule_lineups(id,workspace_id,location_id,lineup_date,created_by,updated_by) values('ae860000-0000-4000-8000-000000000002',pg_temp.w(),'ae8a0000-0000-4000-8000-000000000001','2030-01-08',pg_temp.manager(),pg_temp.manager());
insert into public.schedule_lineup_entries(id,workspace_id,lineup_id,location_id,source_shift_id,employee_id,job_id,shift_type_id,start_time,end_time,station,call_off,note,created_by,updated_by)
values('ae870000-0000-4000-8000-000000000003',pg_temp.w(),'ae860000-0000-4000-8000-000000000002','ae8a0000-0000-4000-8000-000000000001',pg_temp.shift(2),pg_temp.emp(1),'ae8b0000-0000-4000-8000-000000000001','ae8c0000-0000-4000-8000-000000000001','09:00','17:00','UNSHARED COVER STATION',true,'PRIVATE CALLOFF',pg_temp.manager(),pg_temp.manager());
update public.locations set lineup_operations_enabled=true where id='ae8a0000-0000-4000-8000-000000000001';
select lives_ok($$select public.share_schedule_lineup_service(pg_temp.manager(),pg_temp.w(),'2030-01-08',array['ae8a0000-0000-4000-8000-000000000001'::uuid],public.preview_schedule_lineup_share_service(pg_temp.manager(),pg_temp.w(),'2030-01-08',array['ae8a0000-0000-4000-8000-000000000001'::uuid])->>'fingerprint')$$,'call-off source is legitimately omitted from a prior share');
update person_state set cid=(public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift(2)),gen_random_uuid())->>'case_id')::uuid;
select lives_ok($$select public.shift_exchanges_command_service(pg_temp.actor(3),pg_temp.w(),jsonb_build_object('action','apply','case_id',cid,'shift_id',pg_temp.shift(2)),gen_random_uuid()) from person_state$$,'employee may volunteer while manager reconciliation is pending');
update person_state set aid=(select id from public.shift_exchange_applications where case_id=cid);
update person_state set preview=public.shift_exchange_preview(pg_temp.manager(),pg_temp.w(),cid,aid);
select is(preview->>'allowed','false','missing prior shared assignment requires manager reconciliation') from person_state;
select ok(preview->'reasons' @> '["This shift is missing from the shared Line Up. Review and share its assignment before approving."]'::jsonb,'preview explains how to resolve missing shared assignment') from person_state;
select throws_ok($$select public.shift_exchanges_command_service(pg_temp.manager(),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',2,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from person_state$$,'PT409',null,'final rechecks safe Line Up delta and refuses silent omission');
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(2)),pg_temp.emp(1),'blocked reconciliation preserves current owner');
select is((select count(*)::int from public.schedule_lineup_snapshots where workspace_id=pg_temp.w() and location_id='ae8a0000-0000-4000-8000-000000000001' and lineup_date='2030-01-08'),1,'blocked reconciliation does not create misleading new share');

-- Reconciliation is a manager sharing action, not new employee consent.
select ok(not has_function_privilege('authenticated','public.shift_exchange_lineup_reconciliation_issue(uuid,jsonb)','EXECUTE') and not has_function_privilege('anon','public.shift_exchange_lineup_reconciliation_issue(uuid,jsonb)','EXECUTE'),'internal reconciliation helper is not a browser RPC');
select is((select count(*)::int from public.shift_exchange_events where case_id=(select cid from person_state) and action='transfer_completed'),0,'blocked final creates no transfer');
select is(public.shift_exchange_lineup_reconciliation_issue(pg_temp.w(),public.shift_exchange_shift(pg_temp.w(),(select source_shift_id from public.schedule_published_shifts where id=pg_temp.shift(3)))),null::text,'a never-shared date does not require or create a first share');
update public.schedule_lineup_entries set call_off=false,note='' where id='ae870000-0000-4000-8000-000000000003';
select lives_ok($$select public.share_schedule_lineup_service(pg_temp.manager(),pg_temp.w(),'2030-01-08',array['ae8a0000-0000-4000-8000-000000000001'::uuid],public.preview_schedule_lineup_share_service(pg_temp.manager(),pg_temp.w(),'2030-01-08',array['ae8a0000-0000-4000-8000-000000000001'::uuid])->>'fingerprint')$$,'manager explicitly reviews and shares the restored assignment');
select is(public.shift_exchange_preview(pg_temp.manager(),pg_temp.w(),cid,aid)->>'fingerprint',preview->>'fingerprint','Line Up reconciliation preserves employee consent fingerprint') from person_state;
update person_state set preview=public.shift_exchange_preview(pg_temp.manager(),pg_temp.w(),cid,aid);
select is(preview->>'allowed','true','same pending application becomes approvable after reconciliation') from person_state;
select lives_ok($$select public.shift_exchanges_command_service(pg_temp.manager(),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',2,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from person_state$$,'manager final succeeds after explicit sharing');
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(2)),pg_temp.emp(3),'reconciled final changes canonical owner');
select is((select count(*)::int from public.schedule_lineup_snapshots where workspace_id=pg_temp.w() and location_id='ae8a0000-0000-4000-8000-000000000001' and lineup_date='2030-01-08'),3,'explicit recovery share and final assignment delta are separate versions');
select is((select e->>'employee_id' from (select content from public.schedule_lineup_snapshots where workspace_id=pg_temp.w() and location_id='ae8a0000-0000-4000-8000-000000000001' and lineup_date='2030-01-08' order by version_number desc limit 1) latest cross join lateral jsonb_array_elements(content->'entries') e where e->>'source_shift_id'=pg_temp.shift(2)::text),pg_temp.emp(3)::text,'latest shared assignment names the selected replacement');

-- Internal row revisions must not imply new team-facing content after final.
select is(public.lineup_operations_service(pg_temp.manager(),pg_temp.w(),'state',jsonb_build_object('location_id','ae8a0000-0000-4000-8000-000000000001','date','2030-01-08'))->>'unpublished_changes','false','assignment-only final has no false unshared changes from entry revision');
select is(public.lineup_operations_service(pg_temp.manager(),pg_temp.w(),'state',jsonb_build_object('location_id','ae8a0000-0000-4000-8000-000000000001','date','2030-01-07'))->>'unpublished_changes','true','real private live placement WIP still needs explicit sharing');
update public.schedule_lineup_entries set station='New unshared station' where id='ae870000-0000-4000-8000-000000000003';
select is(public.lineup_operations_service(pg_temp.manager(),pg_temp.w(),'state',jsonb_build_object('location_id','ae8a0000-0000-4000-8000-000000000001','date','2030-01-08'))->>'unpublished_changes','true','real station edit still reports unshared changes');
update public.schedule_lineup_entries set station='UNSHARED COVER STATION' where id='ae870000-0000-4000-8000-000000000003';

-- The requested half of a swap needs the same reconciliation guard.
insert into public.schedule_lineups(id,workspace_id,location_id,lineup_date,created_by,updated_by) values('ae860000-0000-4000-8000-000000000003',pg_temp.w(),'ae8a0000-0000-4000-8000-000000000001','2030-01-09',pg_temp.manager(),pg_temp.manager());
insert into public.schedule_lineup_entries(id,workspace_id,lineup_id,location_id,source_shift_id,employee_id,job_id,shift_type_id,start_time,end_time,call_off,created_by,updated_by)
values('ae870000-0000-4000-8000-000000000004',pg_temp.w(),'ae860000-0000-4000-8000-000000000003','ae8a0000-0000-4000-8000-000000000001',pg_temp.shift(3),pg_temp.emp(2),'ae8b0000-0000-4000-8000-000000000001','ae8c0000-0000-4000-8000-000000000001','09:00','17:00',true,pg_temp.manager(),pg_temp.manager());
select public.share_schedule_lineup_service(pg_temp.manager(),pg_temp.w(),'2030-01-09',array['ae8a0000-0000-4000-8000-000000000001'::uuid],public.preview_schedule_lineup_share_service(pg_temp.manager(),pg_temp.w(),'2030-01-09',array['ae8a0000-0000-4000-8000-000000000001'::uuid])->>'fingerprint');
update person_state set cid=(public.shift_exchanges_command_service(pg_temp.actor(3),pg_temp.w(),jsonb_build_object('action','create','kind','swap','shift_id',pg_temp.shift(2),'requested_shift_id',pg_temp.shift(3)),gen_random_uuid())->>'case_id')::uuid;
update person_state set aid=(select id from public.shift_exchange_applications where case_id=cid);
select public.shift_exchanges_command_service(pg_temp.actor(2),pg_temp.w(),jsonb_build_object('action','accept','case_id',cid,'application_id',aid,'expected_revision',1),gen_random_uuid()) from person_state;
update person_state set preview=public.shift_exchange_preview(pg_temp.manager(),pg_temp.w(),cid,aid);
select is(preview->>'allowed','false','missing shared counterpart blocks a mutually accepted swap') from person_state;
select ok(preview->'reasons' @> '["This shift is missing from the shared Line Up. Review and share its assignment before approving."]'::jsonb,'swap preview explains counterpart reconciliation') from person_state;
select throws_ok($$select public.shift_exchanges_command_service(pg_temp.manager(),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',2,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from person_state$$,'PT409',null,'swap final cannot bypass counterpart reconciliation');
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(2)),pg_temp.emp(3),'blocked swap preserves offered owner');
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(3)),pg_temp.emp(2),'blocked swap preserves requested owner');

select * from finish();
rollback;


