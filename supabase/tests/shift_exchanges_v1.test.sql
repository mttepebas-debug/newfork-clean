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
-- The seed's Alex Kim cannot work Fridays; this suite needs its four people free every day.
delete from public.employee_weekly_preferences where workspace_id=pg_temp.w() and employee_id in(select pg_temp.emp(n) from generate_series(1,4)n);
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by,published_at)
values('98010000-0000-4000-8000-000000000001',pg_temp.w(),'11000000-0000-4000-8000-000000000001','2030-01-07',1,pg_temp.manager(),now()-interval '1 day');
insert into public.schedule_published_shifts(id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
select ('98020000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pg_temp.w(),'11000000-0000-4000-8000-000000000001','98010000-0000-4000-8000-000000000001',case n when 4 then null when 3 then pg_temp.emp(2) else pg_temp.emp(1) end,'13000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','2030-01-07'::date+n-1,'09:00','17:00',gen_random_uuid() from generate_series(1,4)n;
create function pg_temp.shift(n integer) returns uuid language sql as $$select ('98020000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create temp table sx_state(cid uuid, aid uuid, result jsonb, preview jsonb);
insert into sx_state values(null,null,null,null);
set local role authenticated;
select throws_ok($$select * from public.shift_exchange_cases$$,'42501',null,'case tables are private');
select throws_ok($$select public.shift_exchanges_command_service(null,null,'{}',gen_random_uuid())$$,'42501',null,'authenticated clients cannot spoof service actor');
reset role;
select throws_ok($$select public.shift_exchanges_command_service(pg_temp.actor(2),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift(1)),gen_random_uuid())$$,'42501',null,'only current owner can offer');
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift(1),'note','Private reason'),'98030000-0000-4000-8000-000000000001');
update sx_state set cid=(result->>'case_id')::uuid;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(1)),pg_temp.emp(1),'AT01 offer retains owner');
select is((select status from public.shift_exchange_cases where id=cid),'open','AT01 offer is an open listing') from sx_state;
select is(public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift(1),'note','Private reason'),'98030000-0000-4000-8000-000000000001')->>'case_id',cid::text,'AT03 retry returns same case') from sx_state;
select throws_ok($$select public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift(2)),'98030000-0000-4000-8000-000000000001')$$,'22023',null,'idempotency key cannot be reused for a different command');
select public.shift_exchanges_command_service(pg_temp.actor(n),pg_temp.w(),jsonb_build_object('action','apply','shift_id',pg_temp.shift(1),'case_id',cid),gen_random_uuid()) from sx_state cross join generate_series(2,4)n;
select is((select count(*)::int from public.shift_exchange_applications where case_id=cid),3,'AT02 three candidates share one case') from sx_state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(1)),pg_temp.emp(1),'AT02 applications preserve owner');
select throws_ok($$select public.shift_exchanges_command_service(pg_temp.actor(2),pg_temp.w(),jsonb_build_object('action','apply','shift_id',pg_temp.shift(1),'case_id',cid),gen_random_uuid()) from sx_state$$,'P0001',null,'AT03 duplicate application blocked');
select is(jsonb_array_length(public.shift_exchanges_read_service(pg_temp.actor(2),pg_temp.w(),false,'2030-01-07','2030-01-20')->'cases'->0->'applications'),1,'AT34 candidate cannot see other applicants');
select is(jsonb_array_length(public.shift_exchanges_read_service(pg_temp.actor(1),pg_temp.w(),false,'2030-01-07','2030-01-20')->'cases'->0->'applications'),3,'owner sees three applicants');
select ok(not (public.shift_exchanges_read_service(pg_temp.actor(2),pg_temp.w(),false,'2030-01-07','2030-01-20')::text like '%Private reason%'),'private note does not leak');
update sx_state set aid=(select id from public.shift_exchange_applications where case_id=cid and employee_id=pg_temp.emp(2));
update sx_state set result=public.shift_exchanges_command_service(pg_temp.manager(),pg_temp.w(),jsonb_build_object('action','reject','case_id',cid,'application_id',aid,'expected_revision',4,'reason','Another availability plan'),gen_random_uuid());
select is((select count(*)::int from public.shift_exchange_applications where case_id=cid and status='pending_manager'),2,'AT04 rejecting one keeps two candidates') from sx_state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(1)),pg_temp.emp(1),'rejection preserves ownership');
update sx_state set aid=(select id from public.shift_exchange_applications where case_id=cid and employee_id=pg_temp.emp(3));
update sx_state set preview=public.shift_exchange_preview(pg_temp.manager(),pg_temp.w(),cid,aid);
select is(preview->>'allowed','true','eligible candidate preview allowed') from sx_state;
-- A Schedule draft and a dirty edit session were opened before this decision.
insert into public.schedule_drafts(id,workspace_id,week_start,name,created_by,updated_by,created_at)
values('98040000-0000-4000-8000-000000000001',pg_temp.w(),'2030-01-07','Earlier draft',pg_temp.manager(),pg_temp.manager(),now()-interval '1 day');
insert into public.schedule_draft_shifts(id,workspace_id,draft_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,note)
select source_shift_id,workspace_id,'98040000-0000-4000-8000-000000000001',location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,'KEEP DRAFT NOTE' from public.schedule_published_shifts where id=pg_temp.shift(1);
insert into public.schedule_edit_sessions(id,workspace_id,week_start,source_kind,holder_user_id,dirty,created_at,location_ids)
values('98040000-0000-4000-8000-000000000002',pg_temp.w(),'2030-01-07','published',pg_temp.manager(),true,now()-interval '1 day',
 array[(select location_id from public.schedule_published_shifts where id=pg_temp.shift(1))]);
insert into public.schedule_edit_session_shifts(id,workspace_id,session_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,note,source_published_shift_id)
select id,workspace_id,'98040000-0000-4000-8000-000000000002',location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,'KEEP SESSION NOTE',id from public.schedule_published_shifts where id=pg_temp.shift(1);
update sx_state set result=public.shift_exchanges_command_service(pg_temp.manager(),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',5,'fingerprint',preview->>'fingerprint'),'98030000-0000-4000-8000-000000000002');
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(1)),pg_temp.emp(3),'AT07 approval transfers directly to chosen candidate');
select is((select status from public.shift_exchange_applications where case_id=cid and employee_id=pg_temp.emp(4)),'closed_other_selected','AT07 other volunteer closes neutrally') from sx_state;
select is((select status from public.shift_exchange_applications where case_id=cid and employee_id=pg_temp.emp(2)),'rejected_by_manager','prior rejection is preserved') from sx_state;
select throws_ok($$select public.shift_exchanges_command_service(pg_temp.manager(),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',5,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from sx_state$$,'PT409',null,'AT08 stale final decision blocked');
select is((select employee_id from public.schedule_draft_shifts where draft_id='98040000-0000-4000-8000-000000000001'),pg_temp.emp(3),'AT27 old draft ownership rebased');
select is((select note from public.schedule_draft_shifts where draft_id='98040000-0000-4000-8000-000000000001'),'KEEP DRAFT NOTE','AT27 unrelated draft note retained');
select is((select employee_id from public.schedule_edit_session_shifts where session_id='98040000-0000-4000-8000-000000000002'),pg_temp.emp(3),'AT27 dirty session ownership rebased');
select is((select note from public.schedule_edit_session_shifts where session_id='98040000-0000-4000-8000-000000000002'),'KEEP SESSION NOTE','AT27 dirty session note retained');
select is(public.shift_exchange_draft_undoes(pg_temp.w(),'98040000-0000-4000-8000-000000000001',array['11000000-0000-4000-8000-000000000001'::uuid]),'[]'::jsonb,'AT27 rebased draft can pass publication guard');
select lives_ok($$select public.shift_exchange_assert_session(pg_temp.w(),'98040000-0000-4000-8000-000000000002')$$,'AT27 rebased session can pass save guard');
update public.schedule_draft_shifts set employee_id=pg_temp.emp(1) where draft_id='98040000-0000-4000-8000-000000000001';
update public.schedule_edit_session_shifts set employee_id=pg_temp.emp(1) where session_id='98040000-0000-4000-8000-000000000002';
select is((select jsonb_agg(f->>'code') from jsonb_array_elements(public.shift_exchange_draft_undoes(pg_temp.w(),'98040000-0000-4000-8000-000000000001',array['11000000-0000-4000-8000-000000000001'::uuid])) f),'["shift_exchange_undone"]'::jsonb,'AT27 stale owner cannot be published');
select throws_ok($$select public.shift_exchange_assert_session(pg_temp.w(),'98040000-0000-4000-8000-000000000002')$$,'PT409',null,'AT27 stale session cannot overwrite approved transfer');
-- Direct invitation, consent withdrawal and a full two-direction swap.
-- Recovery is explicit, preview-bound and preserves notes / unrelated edits.
select throws_ok($$select public.shift_exchange_schedule_recovery_service(pg_temp.actor(1),pg_temp.w(),'98040000-0000-4000-8000-000000000002')$$,'42501',null,'AT27 another employee cannot read the manager edit session');
update sx_state set preview=public.shift_exchange_schedule_recovery_service(pg_temp.manager(),pg_temp.w(),'98040000-0000-4000-8000-000000000002');
select is(jsonb_array_length(preview->'changes'),1,'AT27 recovery shows the conflicting assignment') from sx_state;
select is(preview->'changes'->0->'current'->>'employee_id',pg_temp.emp(3)::text,'AT27 comparison identifies the approved owner') from sx_state;
select throws_ok($$select public.shift_exchange_schedule_recovery_service(pg_temp.manager(),pg_temp.w(),'98040000-0000-4000-8000-000000000002','stale',gen_random_uuid())$$,'PT409',null,'AT27 stale recovery preview cannot change the draft');
update sx_state set result=public.shift_exchange_schedule_recovery_service(pg_temp.manager(),pg_temp.w(),'98040000-0000-4000-8000-000000000002',preview->>'fingerprint','98030000-0000-4000-8000-000000000009');
select is((select employee_id from public.schedule_edit_session_shifts where session_id='98040000-0000-4000-8000-000000000002'),pg_temp.emp(3),'AT27 explicit recovery adopts approved assignment');
select is((select note from public.schedule_edit_session_shifts where session_id='98040000-0000-4000-8000-000000000002'),'KEEP SESSION NOTE','AT27 recovery preserves manager note');
select is(public.shift_exchange_schedule_recovery_service(pg_temp.manager(),pg_temp.w(),'98040000-0000-4000-8000-000000000002',preview->>'fingerprint','98030000-0000-4000-8000-000000000009'),result,'AT27 lost response retry returns the same recovery result') from sx_state;
select lives_ok($$select public.shift_exchange_assert_session(pg_temp.w(),'98040000-0000-4000-8000-000000000002')$$,'AT27 recovered session passes the save guard');
update public.schedule_edit_session_shifts set unpaid_break_minutes=30 where session_id='98040000-0000-4000-8000-000000000002';
select throws_ok($$select public.shift_exchange_assert_session(pg_temp.w(),'98040000-0000-4000-8000-000000000002')$$,'PT409',null,'AT27 changed break cannot silently reuse approved terms');
update public.schedule_edit_session_shifts set unpaid_break_minutes=0 where session_id='98040000-0000-4000-8000-000000000002';
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','swap','shift_id',pg_temp.shift(2),'requested_shift_id',pg_temp.shift(3)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
update sx_state set aid=(select id from public.shift_exchange_applications where case_id=cid);
select is(public.shift_exchange_preview(pg_temp.manager(),pg_temp.w(),cid,aid)->>'allowed','false','AT12 unaccepted swap cannot be approved') from sx_state;
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(2),pg_temp.w(),jsonb_build_object('action','accept','case_id',cid,'application_id',aid,'expected_revision',1),gen_random_uuid());
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(2)),pg_temp.emp(1),'peer accept preserves original assignments');
update sx_state set preview=public.shift_exchange_preview(pg_temp.manager(),pg_temp.w(),cid,aid);
select is(preview->>'allowed','true','AT14 both exchanged shifts excluded from conflict check') from sx_state;
update sx_state set result=public.shift_exchanges_command_service(pg_temp.manager(),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',2,'fingerprint',preview->>'fingerprint'),gen_random_uuid());
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(2)),pg_temp.emp(2),'swap first assignment transfers');
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(3)),pg_temp.emp(1),'swap second assignment transfers');
-- Cross-location approval: each scoped manager votes; only the second commits.
insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations)
select pg_temp.w(),pg_temp.actor(n),'manager', 'active',false from generate_series(5,6)n;
select tests.works_at(id, case when user_id=pg_temp.actor(5) then '11000000-0000-4000-8000-000000000001'::uuid else '11000000-0000-4000-8000-000000000002'::uuid end) from public.workspace_memberships where workspace_id=pg_temp.w() and user_id in(pg_temp.actor(5),pg_temp.actor(6));
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
values('98010000-0000-4000-8000-000000000002',pg_temp.w(),'11000000-0000-4000-8000-000000000002','2030-01-07',1,pg_temp.manager());
insert into public.schedule_published_shifts(id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
values(pg_temp.shift(5),pg_temp.w(),'11000000-0000-4000-8000-000000000001','98010000-0000-4000-8000-000000000001',pg_temp.emp(1),'13000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','2030-01-11','09:00','17:00',gen_random_uuid()),
(pg_temp.shift(6),pg_temp.w(),'11000000-0000-4000-8000-000000000002','98010000-0000-4000-8000-000000000002',pg_temp.emp(2),'13000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','2030-01-12','09:00','17:00',gen_random_uuid());
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','swap','shift_id',pg_temp.shift(5),'requested_shift_id',pg_temp.shift(6)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
update sx_state set aid=(select id from public.shift_exchange_applications where case_id=cid);
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(2),pg_temp.w(),jsonb_build_object('action','accept','case_id',cid,'application_id',aid,'expected_revision',1),gen_random_uuid());
update sx_state set preview=public.shift_exchange_preview(pg_temp.actor(5),pg_temp.w(),cid,aid);
select is(preview->>'requires_other_manager','true','AT16 scoped manager sees the second approval requirement') from sx_state;
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(5),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',2,'fingerprint',preview->>'fingerprint'),gen_random_uuid());
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(5)),pg_temp.emp(1),'AT16 first scope vote preserves source assignment');
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(6)),pg_temp.emp(2),'AT16 first scope vote preserves target assignment');
update sx_state set preview=public.shift_exchange_preview(pg_temp.actor(6),pg_temp.w(),cid,aid);
select is(preview->>'requires_other_manager','false','second scoped manager has the required combined scope') from sx_state;
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(6),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',3,'fingerprint',preview->>'fingerprint'),gen_random_uuid());
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(5)),pg_temp.emp(2),'AT16 final scoped approval transfers source');
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(6)),pg_temp.emp(1),'AT16 final scoped approval transfers target');
-- Open pickup, withdrawal, close and both-direction final eligibility recheck.
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(4),pg_temp.w(),jsonb_build_object('action','apply','shift_id',pg_temp.shift(4)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
update sx_state set aid=(select id from public.shift_exchange_applications where case_id=cid);
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(4)),null::uuid,'AT10 open pickup stays unassigned until final approval');
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(4),pg_temp.w(),jsonb_build_object('action','withdraw','case_id',cid,'application_id',aid,'expected_revision',2),gen_random_uuid());
select is((select status from public.shift_exchange_applications where id=aid),'withdrawn','AT05 participant can withdraw before final decision') from sx_state;
update sx_state set result=public.shift_exchanges_command_service(pg_temp.manager(),pg_temp.w(),jsonb_build_object('action','close','case_id',cid,'expected_revision',3,'reason','Coverage no longer needed'),gen_random_uuid());
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(4)),null::uuid,'close does not assign an open shift');
-- Material change is visible immediately, and renewal retires old consent.
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(3),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift(1)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
update public.schedule_published_shifts set end_time='18:00' where id=pg_temp.shift(1);
select is(public.shift_exchange_live_status(pg_temp.w(),cid),'invalidated','AT24 material hours invalidate consent') from sx_state;
select lives_ok($$select public.shift_exchanges_command_service(pg_temp.actor(3),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift(1)),gen_random_uuid())$$,'AT24 owner can renew changed offer');
select is((select status from public.shift_exchange_cases where id=cid),'invalidated','AT24 previous offer retained as invalidated history') from sx_state;
-- Direct decline ends this invitation, freeing the owner to search again.
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(2),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift(2),'employee_id',pg_temp.emp(4)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
update sx_state set aid=(select id from public.shift_exchange_applications where case_id=cid);
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(4),pg_temp.w(),jsonb_build_object('action','decline','case_id',cid,'application_id',aid,'expected_revision',1),gen_random_uuid());
select is(result->>'status','cancelled','AT11 declined direct invitation ends cleanly') from sx_state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(2)),pg_temp.emp(2),'AT11 declined cover preserves owner');
-- Hard eligibility is re-used by listing, submission and final preview.
select is(public.weekly_exchange_candidate_check(pg_temp.w(),pg_temp.emp(4),public.shift_exchange_shift(pg_temp.w(),pg_temp.shift(1)))->>'status','eligible','baseline candidate is fully eligible');
update public.employee_profiles set is_excluded_from_schedule=true where id=pg_temp.emp(4);
select is(public.weekly_exchange_candidate_check(pg_temp.w(),pg_temp.emp(4),public.shift_exchange_shift(pg_temp.w(),pg_temp.shift(1)))->>'status','ineligible','AT18 excluded employee cannot receive a shift');
update public.employee_profiles set is_excluded_from_schedule=false where id=pg_temp.emp(4);
update public.employee_job_assignments set ended_at='2029-12-31' where workspace_id=pg_temp.w() and employee_id=pg_temp.emp(4);
select is(public.weekly_exchange_candidate_check(pg_temp.w(),pg_temp.emp(4),public.shift_exchange_shift(pg_temp.w(),pg_temp.shift(1)))->>'status','ineligible','AT18 expired position qualification blocks receipt');
update public.employee_job_assignments set ended_at=null where workspace_id=pg_temp.w() and employee_id=pg_temp.emp(4);
update public.employee_location_assignments set ended_at='2030-01-07T20:00:00Z' where workspace_id=pg_temp.w() and employee_id=pg_temp.emp(4);
select is(public.weekly_exchange_candidate_check(pg_temp.w(),pg_temp.emp(4),public.shift_exchange_shift(pg_temp.w(),pg_temp.shift(1)))->>'status','ineligible','AT18 location assignment must cover the entire shift');
update public.employee_location_assignments set ended_at=null where workspace_id=pg_temp.w() and employee_id=pg_temp.emp(4);
update public.locations set timezone='America/New_York' where id='11000000-0000-4000-8000-000000000002';
select tests.approved_leave(pg_temp.w(),pg_temp.emp(4),pg_temp.manager(),'11000000-0000-4000-8000-000000000002','2030-01-07','09:00','10:00');
select is(public.weekly_exchange_candidate_check(pg_temp.w(),pg_temp.emp(4),public.shift_exchange_shift(pg_temp.w(),pg_temp.shift(1)))->>'status','eligible','AT21 09:00 New York leave does not overlap 09:00 Los Angeles shift');
select tests.approved_leave(pg_temp.w(),pg_temp.emp(4),pg_temp.manager(),'11000000-0000-4000-8000-000000000002','2030-01-07','12:00','13:00');
select is(public.weekly_exchange_candidate_check(pg_temp.w(),pg_temp.emp(4),public.shift_exchange_shift(pg_temp.w(),pg_temp.shift(1)))->>'status','ineligible','AT21 12:00 New York leave overlaps 09:00 Los Angeles shift');
-- A worker closes deadlines without an employee or manager screen being open.
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(2),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift(2)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
select is((select expires_at from public.shift_exchange_cases where id=cid),(public.shift_exchange_shift(pg_temp.w(),pg_temp.shift(2))->>'starts_at')::timestamptz,'AT26 deadline is the offered shift start') from sx_state;
select public.shift_exchanges_command_service(pg_temp.actor(4),pg_temp.w(),jsonb_build_object('action','apply','shift_id',pg_temp.shift(2),'case_id',cid),gen_random_uuid()) from sx_state;
update public.shift_exchange_cases set expires_at=now()-interval '1 second' where id=(select cid from sx_state);
select public.shift_exchanges_maintain_service(100);
select is((select status from public.shift_exchange_cases where id=cid),'expired','AT26 background worker persists expiry') from sx_state;
select is((select status from public.shift_exchange_applications where case_id=cid),'expired','AT26 linked active application expires') from sx_state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(2)),pg_temp.emp(2),'AT26 background expiry preserves current owner');
select ok((select actor_user_id is null from public.shift_exchange_events where case_id=cid and action='expired'),'AT26 system expiry does not impersonate an employee') from sx_state;
select public.shift_exchanges_maintain_service(100);
select is((select count(*)::integer from public.shift_exchange_events where case_id=cid and action='expired'),1,'AT33 repeated maintenance emits expiry only once') from sx_state;
select ok(exists(select 1 from public.notification_outbox where subject_id=cid::text and payload->>'request_action'='expired' and payload->'recipient_user_ids' @> jsonb_build_array(pg_temp.actor(4))),'AT33 background expiry notifies the affected applicant') from sx_state;
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift(3)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
update public.schedule_published_shifts set end_time='18:00' where id=pg_temp.shift(3);
select public.shift_exchanges_maintain_service(100);
select is((select status from public.shift_exchange_cases where id=cid),'invalidated','AT24 changed conditions close in background') from sx_state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(3)),pg_temp.emp(1),'AT24 invalidation does not assign a replacement');
set local role authenticated;
select throws_ok($$select public.shift_exchanges_maintain_service(100)$$,'42501',null,'browser cannot invoke cross-workspace maintenance');
reset role;
-- Time-source integration: unknown hours are not eligible; saved zones are canonical.
insert into public.schedule_published_shifts(id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
values(pg_temp.shift(7),pg_temp.w(),'11000000-0000-4000-8000-000000000002','98010000-0000-4000-8000-000000000002',pg_temp.emp(4),'13000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','2030-01-08','09:00','10:00',gen_random_uuid());
update public.locations set timezone='America/Los_Angeles' where id='11000000-0000-4000-8000-000000000002';
select is(public.weekly_exchange_candidate_check(pg_temp.w(),pg_temp.emp(4),public.shift_exchange_shift(pg_temp.w(),pg_temp.shift(2)))->>'status','eligible','AT20 conflict checks retain other shifts saved timezone');
update public.locations set timezone='America/New_York' where id='11000000-0000-4000-8000-000000000001';
select is(public.weekly_exchange_candidate_check(pg_temp.w(),pg_temp.emp(4),public.shift_exchange_shift(pg_temp.w(),pg_temp.shift(2)))->>'status','eligible','AT20 target eligibility retains its saved timezone after location edit');
update public.locations set timezone='America/Los_Angeles' where id='11000000-0000-4000-8000-000000000001';
-- Drive the real outbox projection only for events created by this transaction.
insert into public.schedule_published_shifts(id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
select pg_temp.shift(n),pg_temp.w(),'11000000-0000-4000-8000-000000000001','98010000-0000-4000-8000-000000000001',pg_temp.emp(n-7),'13000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','2030-01-13',case n when 8 then '09:00'::time else '13:00'::time end,case n when 8 then '12:00'::time else '17:00'::time end,gen_random_uuid() from generate_series(8,9)n;
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','swap','shift_id',pg_temp.shift(8),'requested_shift_id',pg_temp.shift(9)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
update sx_state set aid=(select id from public.shift_exchange_applications where case_id=cid);
select public.shift_exchanges_command_service(pg_temp.actor(2),pg_temp.w(),jsonb_build_object('action','accept','case_id',cid,'application_id',aid,'expected_revision',1),gen_random_uuid()) from sx_state;
update sx_state set preview=public.shift_exchange_preview(pg_temp.manager(),pg_temp.w(),cid,aid);
select public.shift_exchanges_command_service(pg_temp.manager(),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',2,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from sx_state;
select ok(exists(select 1 from public.notification_outbox where workspace_id=pg_temp.w() and subject_type='shift_exchange_cases' and payload->>'request_action'='transfer_completed' and payload->>'body' like '%no longer responsible%'),'AT33 giver receives the release confirmation');
select ok(not exists(select 1 from public.notification_outbox where workspace_id=pg_temp.w() and subject_type='shift_exchange_cases' and payload->>'request_action'='other_selected' and payload->'recipient_user_ids' @> to_jsonb(array[pg_temp.actor(1)])),'AT33 losing-candidate message is not sent to original owner');
update public.notification_outbox set status='leased',lease_owner='exchange-pgtap',lease_expires_at=now()+interval '1 minute',attempt_count=attempt_count+1
 where workspace_id=pg_temp.w() and subject_type='shift_exchange_cases';
do $$ declare row record; begin for row in select id from public.notification_outbox where workspace_id=pg_temp.w() and subject_type='shift_exchange_cases' loop
 perform public.process_notification_outbox_service('exchange-pgtap',row.id); end loop; end; $$;
select ok(exists(select 1 from public.notifications where workspace_id=pg_temp.w() and recipient_user_id=pg_temp.actor(3) and title='Shift change approved' and body like '%now assigned to you%' and action_url like '%?case=%'),'AT33 approved receiver has an actionable inbox notification');
select ok(exists(select 1 from public.notifications where workspace_id=pg_temp.w() and recipient_user_id=pg_temp.actor(4) and title='Another teammate was selected'),'AT33 other candidate gets neutral inbox result');
create temp table sx_inbox_count as select count(*) n from public.notifications where workspace_id=pg_temp.w();
do $$ declare row record; begin for row in select id from public.notification_outbox where workspace_id=pg_temp.w() and subject_type='shift_exchange_cases' loop
 perform public.project_notification_recipients_service(row.id); perform public.project_notification_inbox_service(row.id); end loop; end; $$;
select is((select count(*) from public.notifications where workspace_id=pg_temp.w()),(select n from sx_inbox_count),'AT33 retrying projection does not duplicate inbox items');
-- Additional decision matrix: use a separate week to avoid accidental conflicts.
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
select ('98010000-0000-4000-8000-'||lpad((n+2)::text,12,'0'))::uuid,pg_temp.w(),('11000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'2030-01-14',1,pg_temp.manager() from generate_series(1,2)n;
insert into public.schedule_published_shifts(id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
select pg_temp.shift(n),pg_temp.w(),case when n in(13,15) then '11000000-0000-4000-8000-000000000002'::uuid else '11000000-0000-4000-8000-000000000001'::uuid end,
 case when n in(13,15) then '98010000-0000-4000-8000-000000000004'::uuid else '98010000-0000-4000-8000-000000000003'::uuid end,
 case when n=11 then null when n in(13,15) then pg_temp.emp(2) else pg_temp.emp(1) end,'13000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','2030-01-14'::date+n-10,'09:00','17:00',gen_random_uuid() from generate_series(10,16)n;
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift(10)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
select public.shift_exchanges_command_service(pg_temp.actor(n),pg_temp.w(),jsonb_build_object('action','apply','shift_id',pg_temp.shift(10),'case_id',cid),gen_random_uuid()) from sx_state cross join generate_series(2,4)n;
update sx_state set aid=(select id from public.shift_exchange_applications where case_id=cid and employee_id=pg_temp.emp(2));
select public.shift_exchanges_command_service(pg_temp.actor(2),pg_temp.w(),jsonb_build_object('action','withdraw','case_id',cid,'application_id',aid,'expected_revision',4),gen_random_uuid()) from sx_state;
select is((select count(*)::int from public.shift_exchange_applications where case_id=cid and status='pending_manager'),2,'AT05 pool withdrawal leaves the other two candidates active') from sx_state;
select ok(exists(select 1 from public.shift_exchange_events where case_id=cid and application_id=aid and action='application_withdrawn'),'AT05 pool withdrawal has its own history event') from sx_state;
select public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','close','case_id',cid,'expected_revision',5,'reason','I can work my shift'),gen_random_uuid()) from sx_state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(10)),pg_temp.emp(1),'AT06 owner closes search without releasing responsibility');
select is((select count(*)::int from public.shift_exchange_applications where case_id=cid and status='closed_case_cancelled'),2,'AT06 owner close closes all remaining applications') from sx_state;
select is((select status from public.shift_exchange_applications where id=aid),'withdrawn','AT06 owner close preserves an earlier withdrawal') from sx_state;
select ok((select count(*)=2 from public.notification_outbox where subject_id=cid::text and payload->>'request_action'='case_closed' and (payload->'recipient_user_ids' @> jsonb_build_array(pg_temp.actor(3)) or payload->'recipient_user_ids' @> jsonb_build_array(pg_temp.actor(4)))),'AT06 both remaining candidates receive a closure event') from sx_state;

-- A genuine open shift also supports multiple candidates and a final winner.
select public.shift_exchanges_command_service(pg_temp.actor(n),pg_temp.w(),jsonb_build_object('action','apply','shift_id',pg_temp.shift(11)),gen_random_uuid()) from generate_series(2,4)n;
update sx_state set cid=(select id from public.shift_exchange_cases where offered_source_id=(select source_shift_id from public.schedule_published_shifts where id=pg_temp.shift(11)) and status='open');
update sx_state set aid=(select id from public.shift_exchange_applications where case_id=cid and employee_id=pg_temp.emp(3));
update sx_state set preview=public.shift_exchange_preview(pg_temp.manager(),pg_temp.w(),cid,aid);
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(11)),null::uuid,'AT10 three open-shift candidates still do not assign anyone');
select public.shift_exchanges_command_service(pg_temp.manager(),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',4,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from sx_state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(11)),pg_temp.emp(3),'AT10 open shift assigns only the approved winner');
select is((select count(*)::int from public.shift_exchange_applications where case_id=cid and status='closed_other_selected'),2,'AT10 other open-shift candidates close neutrally') from sx_state;

-- Each side of a swap is independently mandatory, including after peer consent.
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','swap','shift_id',pg_temp.shift(12),'requested_shift_id',pg_temp.shift(13)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
update sx_state set aid=(select id from public.shift_exchange_applications where case_id=cid);
select public.shift_exchanges_command_service(pg_temp.actor(2),pg_temp.w(),jsonb_build_object('action','accept','case_id',cid,'application_id',aid,'expected_revision',1),gen_random_uuid()) from sx_state;
update public.employee_profiles set is_excluded_from_schedule=true where id=pg_temp.emp(1);
update sx_state set preview=public.shift_exchange_preview(pg_temp.manager(),pg_temp.w(),cid,aid);
select ok(preview->>'allowed'='false' and preview->'giver'->>'status'='ineligible' and preview->'receiver'->>'status'='eligible','AT13 giver-only ineligibility blocks the complete swap') from sx_state;
select throws_ok($$select public.shift_exchanges_command_service(pg_temp.manager(),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',2,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from sx_state$$,'PT409',null,'AT13 giver-only invalid swap cannot commit');
update public.employee_profiles set is_excluded_from_schedule=false where id=pg_temp.emp(1);
update public.employee_profiles set is_excluded_from_schedule=true where id=pg_temp.emp(2);
update sx_state set preview=public.shift_exchange_preview(pg_temp.manager(),pg_temp.w(),cid,aid);
select ok(preview->>'allowed'='false' and preview->'receiver'->>'status'='ineligible' and preview->'giver'->>'status'='eligible','AT13 receiver-only ineligibility blocks the complete swap') from sx_state;
select throws_ok($$select public.shift_exchanges_command_service(pg_temp.manager(),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',2,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from sx_state$$,'PT409',null,'AT13 receiver-only invalid swap cannot commit');
update public.employee_profiles set is_excluded_from_schedule=false where id=pg_temp.emp(2);
update sx_state set preview=public.shift_exchange_preview(pg_temp.actor(5),pg_temp.w(),cid,aid);
select public.shift_exchanges_command_service(pg_temp.actor(5),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',2,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from sx_state;
select tests.stops_working_at((select id from public.workspace_memberships where workspace_id=pg_temp.w() and user_id=pg_temp.actor(5)));
update sx_state set preview=public.shift_exchange_preview(pg_temp.actor(6),pg_temp.w(),cid,aid);
select is(preview->>'requires_other_manager','true','AT41 revoked first manager scope makes the old vote insufficient') from sx_state;
select public.shift_exchanges_command_service(pg_temp.actor(6),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',3,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from sx_state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(12)),pg_temp.emp(1),'AT41 second vote cannot transfer after first scope is revoked');
select throws_ok($$select public.shift_exchanges_command_service(pg_temp.actor(5),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',4,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from sx_state$$,'42501',null,'AT41 revoked manager cannot issue a new approval');
update sx_state set preview=public.shift_exchange_preview(pg_temp.manager(),pg_temp.w(),cid,aid);
select is(preview->>'requires_other_manager','false','AT15 one manager with both scopes can complete the decision') from sx_state;
select public.shift_exchanges_command_service(pg_temp.manager(),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',4,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from sx_state;
select ok((select employee_id=pg_temp.emp(2) from public.schedule_published_shifts where id=pg_temp.shift(12)) and (select employee_id=pg_temp.emp(1) from public.schedule_published_shifts where id=pg_temp.shift(13)),'AT15 both location assignments change together under the qualified manager');

-- Direct cover consent can be withdrawn before final approval.
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift(14),'employee_id',pg_temp.emp(4)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
update sx_state set aid=(select id from public.shift_exchange_applications where case_id=cid);
select public.shift_exchanges_command_service(pg_temp.actor(4),pg_temp.w(),jsonb_build_object('action','accept','case_id',cid,'application_id',aid,'expected_revision',1),gen_random_uuid()) from sx_state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(14)),pg_temp.emp(1),'AT11 direct acceptance does not release the current owner');
select public.shift_exchanges_command_service(pg_temp.actor(4),pg_temp.w(),jsonb_build_object('action','withdraw','case_id',cid,'application_id',aid,'expected_revision',2),gen_random_uuid()) from sx_state;
select is((select status from public.shift_exchange_cases where id=cid),'cancelled','AT11 withdrawing direct consent closes that invitation') from sx_state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(14)),pg_temp.emp(1),'AT11 withdrawal retains original responsibility');

-- A manager involved on either side still needs an independent reviewer.
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift(14)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
select public.shift_exchanges_command_service(pg_temp.actor(2),pg_temp.w(),jsonb_build_object('action','apply','shift_id',pg_temp.shift(14),'case_id',cid),gen_random_uuid()) from sx_state;
update sx_state set aid=(select id from public.shift_exchange_applications where case_id=cid);
update public.workspace_memberships set role='manager',role_id=(select role_id from public.workspace_memberships where workspace_id=pg_temp.w() and user_id=pg_temp.actor(6)) where workspace_id=pg_temp.w() and user_id in(pg_temp.actor(1),pg_temp.actor(2));
-- A manager with no location of their own is turned away before anything
-- else is looked at, so these two would never reach the rule this block is
-- about: that nobody approves their own exchange. They are given the
-- workspace's locations first, so the refusal they get is that one.
select tests.works_at(m.id, l) from public.workspace_memberships m
 cross join unnest(array['11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002']::uuid[]) l
 where m.workspace_id=pg_temp.w() and m.user_id in(pg_temp.actor(1),pg_temp.actor(2));
select is(public.shift_exchange_preview(pg_temp.actor(1),pg_temp.w(),cid,aid)->>'allowed','false','AT41 owner with manager role cannot approve their own release') from sx_state;
select is(public.shift_exchange_preview(pg_temp.actor(2),pg_temp.w(),cid,aid)->>'allowed','false','AT41 recipient with manager role cannot approve their own pickup') from sx_state;
select ok(public.shift_exchange_preview(pg_temp.actor(1),pg_temp.w(),cid,aid)->'reasons' @> '["A separate manager must approve your own exchange"]'::jsonb,'AT41 self-approval rejection explains the independent reviewer requirement') from sx_state;
select throws_ok($$select public.shift_exchanges_command_service(pg_temp.actor(2),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',2,'fingerprint',public.shift_exchange_preview(pg_temp.actor(2),pg_temp.w(),cid,aid)->>'fingerprint'),gen_random_uuid()) from sx_state$$,'PT409',null,'AT41 recipient manager cannot bypass preview using the final command');
-- A material change after the first scoped approval requires fresh consent and votes.
select tests.works_at(id, '11000000-0000-4000-8000-000000000001') from public.workspace_memberships where workspace_id=pg_temp.w() and user_id=pg_temp.actor(5);
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','swap','shift_id',pg_temp.shift(10),'requested_shift_id',pg_temp.shift(15)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
update sx_state set aid=(select id from public.shift_exchange_applications where case_id=cid);
select public.shift_exchanges_command_service(pg_temp.actor(2),pg_temp.w(),jsonb_build_object('action','accept','case_id',cid,'application_id',aid,'expected_revision',1),gen_random_uuid()) from sx_state;
update sx_state set preview=public.shift_exchange_preview(pg_temp.actor(5),pg_temp.w(),cid,aid);
select public.shift_exchanges_command_service(pg_temp.actor(5),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',2,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from sx_state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(10)),pg_temp.emp(1),'AT17 first location vote preserves responsibility');
update public.schedule_published_shifts set end_time='18:00' where id=pg_temp.shift(15);
select is(public.shift_exchange_preview(pg_temp.actor(6),pg_temp.w(),cid,aid)->>'allowed','false','AT17 changed shift terms invalidate the accepted swap after one vote') from sx_state;
select is(public.shift_exchanges_command_service(pg_temp.actor(6),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',3,'fingerprint',preview->>'fingerprint'),gen_random_uuid())->>'status','invalidated','AT17 stale approval ends the case without committing a transfer') from sx_state;
select public.shift_exchanges_maintain_service(500);
select is((select status from public.shift_exchange_cases where id=cid),'invalidated','AT17 lifecycle closes the stale consent') from sx_state;
select is((select count(*)::int from public.shift_exchange_votes where case_id=cid),0,'AT17 lifecycle removes obsolete location votes') from sx_state;
select ok((select employee_id=pg_temp.emp(1) from public.schedule_published_shifts where id=pg_temp.shift(10)) and (select employee_id=pg_temp.emp(2) from public.schedule_published_shifts where id=pg_temp.shift(15)),'AT17 invalidation preserves both owners');
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','swap','shift_id',pg_temp.shift(10),'requested_shift_id',pg_temp.shift(15)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
update sx_state set aid=(select id from public.shift_exchange_applications where case_id=cid);
select public.shift_exchanges_command_service(pg_temp.actor(2),pg_temp.w(),jsonb_build_object('action','accept','case_id',cid,'application_id',aid,'expected_revision',1),gen_random_uuid()) from sx_state;
select is((select count(*)::int from public.shift_exchange_votes where case_id=cid),0,'AT17 renewed consent does not inherit earlier manager votes') from sx_state;
update sx_state set preview=public.shift_exchange_preview(pg_temp.actor(6),pg_temp.w(),cid,aid);
select is(preview->>'requires_other_manager','true','AT17 renewed request still needs the other location manager') from sx_state;
select public.shift_exchanges_command_service(pg_temp.actor(6),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',2,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from sx_state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(10)),pg_temp.emp(1),'AT17 new first vote alone cannot transfer');
update sx_state set preview=public.shift_exchange_preview(pg_temp.actor(5),pg_temp.w(),cid,aid);
select public.shift_exchanges_command_service(pg_temp.actor(5),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',3,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from sx_state;
select ok((select employee_id=pg_temp.emp(2) from public.schedule_published_shifts where id=pg_temp.shift(10)) and (select employee_id=pg_temp.emp(1) from public.schedule_published_shifts where id=pg_temp.shift(15)),'AT17 fresh consent and both new votes transfer the pair together');
-- Technical republication keeps consent when terms match.
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',pg_temp.shift(16)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
select public.shift_exchanges_command_service(pg_temp.actor(2),pg_temp.w(),jsonb_build_object('action','apply','shift_id',pg_temp.shift(16),'case_id',cid),gen_random_uuid()) from sx_state;
update sx_state set aid=(select id from public.shift_exchange_applications where case_id=cid);
update sx_state set preview=public.shift_exchange_preview(pg_temp.manager(),pg_temp.w(),cid,aid);
update public.schedule_location_publications set status='superseded' where id='98010000-0000-4000-8000-000000000003';
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
values('98010000-0000-4000-8000-000000000005',pg_temp.w(),'11000000-0000-4000-8000-000000000001','2030-01-14',2,pg_temp.manager());
insert into public.schedule_published_shifts(workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id,time_basis,time_snapshot,time_timezone,unpaid_break_minutes)
select workspace_id,location_id,'98010000-0000-4000-8000-000000000005',employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,coalesce(source_shift_id,id),time_basis,time_snapshot,time_timezone,unpaid_break_minutes
from public.schedule_published_shifts where publication_id='98010000-0000-4000-8000-000000000003';
select is(public.shift_exchange_live_status(pg_temp.w(),cid),'open','AT25 unchanged republication preserves the open request') from sx_state;
select is(public.shift_exchange_preview(pg_temp.manager(),pg_temp.w(),cid,aid)->>'fingerprint',preview->>'fingerprint','AT25 new publication keeps the same consent fingerprint') from sx_state;
select public.shift_exchanges_command_service(pg_temp.manager(),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',2,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from sx_state;
select is((select employee_id from public.schedule_published_shifts where publication_id='98010000-0000-4000-8000-000000000005' and scheduled_date='2030-01-20'),pg_temp.emp(2),'AT25 approval changes the current publication owner');
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(16)),pg_temp.emp(1),'AT25 previous publication retains its historical owner');
-- Case notifications coalesce in delivery order and revalidate current scope.
update sx_state set cid=(select id from public.shift_exchange_cases where status='open' and offered_source_id=(select source_shift_id from public.schedule_published_shifts where id=pg_temp.shift(14)));
select public.shift_exchanges_command_service(pg_temp.actor(n),pg_temp.w(),jsonb_build_object('action','apply','shift_id',(select source_shift_id from public.schedule_published_shifts where id=pg_temp.shift(14)),'case_id',cid),gen_random_uuid()) from sx_state cross join generate_series(3,4)n;
create temp table sx_notice_state as
select o.id latest_oid, o.event_id, c.cid from sx_state c join public.notification_outbox o on o.subject_id=c.cid::text
join public.shift_exchange_events e on e.id::text=o.payload->>'request_event_id'
where o.payload->>'audience_contract'='schedule_request_reviewers' order by e.notification_sequence desc limit 1;
select public.project_notification_event_service(latest_oid) from sx_notice_state;
select public.project_notification_recipients_service(latest_oid) from sx_notice_state;
select tests.stops_working_at((select id from public.workspace_memberships where workspace_id=pg_temp.w() and user_id=pg_temp.actor(5)));
update public.notification_outbox set status='leased',lease_owner='exchange-pgtap',lease_expires_at=now()+interval '1 minute',attempt_count=attempt_count+1 where workspace_id=pg_temp.w() and subject_id=(select cid::text from sx_state);
do $$ declare row record; begin for row in
 select o.id from public.notification_outbox o join public.shift_exchange_events e on e.id::text=o.payload->>'request_event_id'
 where o.workspace_id=pg_temp.w() and o.subject_id=(select cid::text from sx_state) order by e.notification_sequence desc
loop perform public.process_notification_outbox_service('exchange-pgtap',row.id); end loop; end; $$;
select is((select count(*)::int from public.notification_inbox_items i join public.notification_recipients r on r.id=i.recipient_projection_id where i.group_key='shift_exchange_review:'||(select cid from sx_state)::text and r.recipient_user_id=pg_temp.manager() and i.visibility_state='visible'),1,'AT33 three applications produce one visible manager case notification');
select ok(exists(select 1 from public.notification_inbox_items i join public.notification_recipients r on r.id=i.recipient_projection_id where i.group_key='shift_exchange_review:'||(select cid from sx_state)::text and r.recipient_user_id=pg_temp.manager() and i.visibility_state='visible' and i.title='3 candidates ready for review' and i.body like '3 candidates are%'),'AT33 case notification displays the current candidate count');
select is((select count(*)::int from public.notification_inbox_items i join public.notification_recipients r on r.id=i.recipient_projection_id where i.group_key='shift_exchange:'||(select cid from sx_state)::text and r.recipient_user_id=pg_temp.actor(1) and i.visibility_state='visible'),1,'AT33 owner receives one case update rather than three separate candidate rows');
select is((select count(*)::int from public.notifications n join public.notification_inbox_items i on i.legacy_notification_id=n.id where i.group_key='shift_exchange_review:'||(select cid from sx_state)::text and n.recipient_user_id=pg_temp.manager() and n.dismissed_at is null),1,'AT33 legacy badge reader also counts one manager notification');
select is((select count(*)::int from public.notification_outbox o where o.subject_id=(select cid::text from sx_state) and o.payload->>'audience_contract'='schedule_request_reviewers'),3,'AT33 immutable reviewer event evidence is retained');
select is((select count(*)::int from public.notification_inbox_items i join public.notification_recipients r on r.id=i.recipient_projection_id where i.group_key='shift_exchange_review:'||(select cid from sx_state)::text and r.recipient_user_id=pg_temp.actor(5)),0,'AT34 revoked scope prevents inbox insertion even after recipient projection');
select ok(exists(select 1 from public.notification_recipient_decisions d join public.notification_outbox o on o.event_id=d.event_id where o.subject_id=(select cid::text from sx_state) and d.candidate_user_id=pg_temp.actor(5) and d.decision='deny' and d.reason_chain @> '["shift_exchange_audience_changed"]'::jsonb),'AT34 relay records the changed-audience reason for revoked reviewers');
update public.notification_inbox_items set seen_at=now(),read_at=now() where group_key='shift_exchange_review:'||(select cid from sx_state)::text and visibility_state='visible';
do $$ declare row record; begin for row in select id from public.notification_outbox where subject_id=(select cid::text from sx_state) loop perform public.project_notification_inbox_service(row.id); end loop; end; $$;
select is((select count(*)::int from public.notification_inbox_items i join public.notification_recipients r on r.id=i.recipient_projection_id where i.group_key='shift_exchange_review:'||(select cid from sx_state)::text and r.recipient_user_id=pg_temp.manager() and i.visibility_state='visible' and i.read_at is not null),1,'AT33 delivery retry does not revive old rows or reset the latest read state');
select public.shift_exchanges_command_service(pg_temp.actor(4),pg_temp.w(),jsonb_build_object('action','withdraw','case_id',cid,'application_id',(select id from public.shift_exchange_applications where case_id=cid and employee_id=pg_temp.emp(4) and status='pending_manager'),'expected_revision',4),gen_random_uuid()) from sx_state;
select ok(exists(select 1 from public.notification_inbox_items where group_key='shift_exchange_review:'||(select cid from sx_state)::text and visibility_state='visible' and title='2 candidates ready for review'),'AT33 withdrawal immediately refreshes the existing manager count without a new review event');
select public.shift_exchanges_command_service(pg_temp.actor(3),pg_temp.w(),jsonb_build_object('action','withdraw','case_id',cid,'application_id',(select id from public.shift_exchange_applications where case_id=cid and employee_id=pg_temp.emp(3) and status='pending_manager'),'expected_revision',5),gen_random_uuid()) from sx_state;
select public.shift_exchanges_command_service(pg_temp.actor(2),pg_temp.w(),jsonb_build_object('action','withdraw','case_id',cid,'application_id',(select id from public.shift_exchange_applications where case_id=cid and employee_id=pg_temp.emp(2) and status='pending_manager'),'expected_revision',6),gen_random_uuid()) from sx_state;
select is((select count(*)::int from public.notification_inbox_items where group_key='shift_exchange_review:'||(select cid from sx_state)::text and visibility_state='visible'),0,'AT33 last candidate withdrawal removes the obsolete manager task immediately');
select public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','close','case_id',cid,'expected_revision',7,'reason','Keeping my shift'),gen_random_uuid()) from sx_state;
update public.notification_outbox set status='leased',lease_owner='exchange-pgtap',lease_expires_at=now()+interval '1 minute',attempt_count=attempt_count+1 where workspace_id=pg_temp.w() and subject_id=(select cid::text from sx_state) and status='pending';
do $$ declare row record; begin for row in select id from public.notification_outbox where subject_id=(select cid::text from sx_state) and status='leased' loop perform public.process_notification_outbox_service('exchange-pgtap',row.id); end loop; end; $$;
select is((select count(*)::int from public.notification_inbox_items where group_key='shift_exchange_review:'||(select cid from sx_state)::text and visibility_state='visible'),0,'AT33 closing a case removes its obsolete review task from every manager inbox');
select is((select count(*)::int from public.notification_inbox_items where group_key='shift_exchange_available:'||(select cid from sx_state)::text and visibility_state='visible'),0,'AT34 a closed cover no longer advertises a pickup opportunity');
-- A pool with no applications emits no closure recipient event. Its existing
-- opportunity still disappears synchronously, including the legacy badge.
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',(select source_shift_id from public.schedule_published_shifts where id=pg_temp.shift(14))),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
update public.notification_outbox set status='leased',lease_owner='exchange-pgtap',lease_expires_at=now()+interval '1 minute',attempt_count=attempt_count+1 where workspace_id=pg_temp.w() and subject_id=(select cid::text from sx_state) and status='pending';
do $$ declare row record; begin for row in select id from public.notification_outbox where subject_id=(select cid::text from sx_state) and status='leased' loop perform public.process_notification_outbox_service('exchange-pgtap',row.id); end loop; end; $$;
select ok(exists(select 1 from public.notification_inbox_items where group_key='shift_exchange_available:'||(select cid from sx_state)::text and visibility_state='visible'),'AT34 zero-application pool has delivered opportunities before closure');
select public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','close','case_id',cid,'expected_revision',1,'reason','Keeping my shift'),gen_random_uuid()) from sx_state;
select is((select count(*)::int from public.notification_outbox where subject_id=(select cid::text from sx_state) and payload->>'request_action'='case_closed'),0,'AT34 zero-application closure needs no artificial notification recipient');
select is((select count(*)::int from public.notification_inbox_items where group_key='shift_exchange_available:'||(select cid from sx_state)::text and visibility_state='visible'),0,'AT34 zero-application closure removes opportunities without a relay event');
select is((select count(*)::int from public.notifications n join public.notification_inbox_items i on i.legacy_notification_id=n.id where i.group_key='shift_exchange_available:'||(select cid from sx_state)::text and n.dismissed_at is null),0,'AT34 zero-application closure clears legacy unread badges too');
-- Unpublish previews bind current assignment terms, not only publication count.
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','cover','shift_id',(select source_shift_id from public.schedule_published_shifts where id=pg_temp.shift(14))),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
select public.shift_exchanges_command_service(pg_temp.actor(3),pg_temp.w(),jsonb_build_object('action','apply','shift_id',(select source_shift_id from public.schedule_published_shifts where id=pg_temp.shift(14)),'case_id',cid),gen_random_uuid()) from sx_state;
update sx_state set aid=(select id from public.shift_exchange_applications where case_id=cid and status='pending_manager');
create temp table sx_unpublish_review as select public.preview_schedule_unpublication_service(pg_temp.manager(),pg_temp.w(),'2030-01-14',array['11000000-0000-4000-8000-000000000001']::uuid[]) before_review;
select public.shift_exchanges_command_service(pg_temp.manager(),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',2,'fingerprint',public.shift_exchange_preview(pg_temp.manager(),pg_temp.w(),cid,aid)->>'fingerprint'),gen_random_uuid()) from sx_state;
select isnt(public.preview_schedule_unpublication_service(pg_temp.manager(),pg_temp.w(),'2030-01-14',array['11000000-0000-4000-8000-000000000001']::uuid[])->>'fingerprint',before_review->>'fingerprint','AT24 ownership change invalidates an earlier unpublish review even within the same publication') from sx_unpublish_review;
select throws_ok($$select public.unpublish_schedule_service(pg_temp.manager(),pg_temp.w(),'2030-01-14',array['11000000-0000-4000-8000-000000000001']::uuid[],before_review->>'fingerprint') from sx_unpublish_review$$,'PT409',null,'AT24 stale unpublish cannot remove a newly approved assignment');
select is((select status from public.schedule_location_publications where id='98010000-0000-4000-8000-000000000005'),'current','AT24 failed stale unpublish keeps the live publication');
select is((select employee_id from public.schedule_published_shifts where publication_id='98010000-0000-4000-8000-000000000005' and scheduled_date='2030-01-18'),pg_temp.emp(3),'AT24 failed stale unpublish preserves the approved recipient');
select lives_ok($$select public.unpublish_schedule_service(pg_temp.manager(),pg_temp.w(),'2030-01-14',array['11000000-0000-4000-8000-000000000001']::uuid[],public.preview_schedule_unpublication_service(pg_temp.manager(),pg_temp.w(),'2030-01-14',array['11000000-0000-4000-8000-000000000001']::uuid[])->>'fingerprint')$$,'AT24 a freshly reviewed unpublish remains available to the authorized manager');
select is((select status from public.schedule_location_publications where id='98010000-0000-4000-8000-000000000005'),'unpublished','AT24 fresh review unpublishes only after manager confirmation');
select is((select employee_id from public.schedule_published_shifts where publication_id='98010000-0000-4000-8000-000000000005' and scheduled_date='2030-01-18'),pg_temp.emp(3),'AT24 historical assignment retains the approved recipient after intentional unpublish');
-- Changing the swap candidate requires a new case and fresh consent from all
-- participants. An earlier location vote must not authorize the replacement.
select tests.works_at(id, '11000000-0000-4000-8000-000000000001') from public.workspace_memberships where workspace_id=pg_temp.w() and user_id=pg_temp.actor(5);
insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
select ('98010000-0000-4000-8000-'||lpad((5+n)::text,12,'0'))::uuid,pg_temp.w(),('11000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'2030-01-21',1,pg_temp.manager() from generate_series(1,2)n;
insert into public.schedule_published_shifts(id,workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
select pg_temp.shift(16+n),pg_temp.w(),case when n=1 then '11000000-0000-4000-8000-000000000001'::uuid else '11000000-0000-4000-8000-000000000002'::uuid end,
case when n=1 then '98010000-0000-4000-8000-000000000006'::uuid else '98010000-0000-4000-8000-000000000007'::uuid end,
pg_temp.emp(n),'13000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','2030-01-20'::date+n,'09:00','17:00',gen_random_uuid() from generate_series(1,3)n;
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','swap','shift_id',pg_temp.shift(17),'requested_shift_id',pg_temp.shift(18)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
update sx_state set aid=(select id from public.shift_exchange_applications where case_id=cid);
select public.shift_exchanges_command_service(pg_temp.actor(2),pg_temp.w(),jsonb_build_object('action','accept','case_id',cid,'application_id',aid,'expected_revision',1),gen_random_uuid()) from sx_state;
update sx_state set preview=public.shift_exchange_preview(pg_temp.actor(5),pg_temp.w(),cid,aid);
select public.shift_exchanges_command_service(pg_temp.actor(5),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',2,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from sx_state;
select is((select count(*)::int from public.shift_exchange_votes where case_id=cid),1,'AT17 original candidate has exactly one location vote') from sx_state;
create temp table sx_previous_candidate as select cid,aid,preview from sx_state;
select public.shift_exchanges_command_service(pg_temp.actor(2),pg_temp.w(),jsonb_build_object('action','withdraw','case_id',cid,'application_id',aid,'expected_revision',3),gen_random_uuid()) from sx_state;
select is((select status from public.shift_exchange_cases where id=cid),'cancelled','AT17 candidate withdrawal ends the original swap') from sx_state;
select is((select count(*)::int from public.shift_exchange_votes where case_id=cid),0,'AT17 candidate withdrawal removes the earlier location vote') from sx_state;
select is((select count(*)::int from public.schedule_published_shifts where id in(pg_temp.shift(17),pg_temp.shift(18),pg_temp.shift(19)) and employee_id=pg_temp.emp(right(id::text,2)::int-16)),3,'AT17 withdrawal preserves all three shift owners');
select throws_ok($$select public.shift_exchanges_command_service(pg_temp.actor(6),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',3,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from sx_previous_candidate$$,'PT409',null,'AT17 an old approval cannot revive withdrawn candidate consent');
update sx_state set result=public.shift_exchanges_command_service(pg_temp.actor(1),pg_temp.w(),jsonb_build_object('action','create','kind','swap','shift_id',pg_temp.shift(17),'requested_shift_id',pg_temp.shift(19)),gen_random_uuid());
update sx_state set cid=(result->>'case_id')::uuid;
update sx_state set aid=(select id from public.shift_exchange_applications where case_id=cid);
select isnt(cid,(select cid from sx_previous_candidate),'AT17 replacement candidate receives a new case') from sx_state;
select is((select status from public.shift_exchange_applications where id=aid),'invited','AT17 replacement candidate must explicitly accept before manager review') from sx_state;
select is(public.shift_exchange_preview(pg_temp.actor(6),pg_temp.w(),cid,aid)->>'allowed','false','AT17 earlier peer consent does not authorize the replacement') from sx_state;
select public.shift_exchanges_command_service(pg_temp.actor(3),pg_temp.w(),jsonb_build_object('action','accept','case_id',cid,'application_id',aid,'expected_revision',1),gen_random_uuid()) from sx_state;
select is((select count(*)::int from public.shift_exchange_votes where case_id=cid),0,'AT17 replacement case inherits no earlier manager votes') from sx_state;
select throws_ok($$select public.shift_exchanges_command_service(pg_temp.actor(6),pg_temp.w(),jsonb_build_object('action','approve','case_id',s.cid,'application_id',p.aid,'expected_revision',2,'fingerprint',p.preview->>'fingerprint'),gen_random_uuid()) from sx_state s cross join sx_previous_candidate p$$,'PT409','This application is no longer active','AT17 an application from the original case cannot approve the replacement');
update sx_state set preview=public.shift_exchange_preview(pg_temp.actor(6),pg_temp.w(),cid,aid);
select is(preview->>'requires_other_manager','true','AT17 replacement requires a new first-location approval') from sx_state;
select public.shift_exchanges_command_service(pg_temp.actor(6),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',2,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from sx_state;
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(17)),pg_temp.emp(1),'AT17 new second-location vote alone preserves original responsibility');
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(19)),pg_temp.emp(3),'AT17 new second-location vote alone preserves replacement responsibility');
update sx_state set preview=public.shift_exchange_preview(pg_temp.actor(5),pg_temp.w(),cid,aid);
select public.shift_exchanges_command_service(pg_temp.actor(5),pg_temp.w(),jsonb_build_object('action','approve','case_id',cid,'application_id',aid,'expected_revision',3,'fingerprint',preview->>'fingerprint'),gen_random_uuid()) from sx_state;
select ok((select employee_id=pg_temp.emp(3) from public.schedule_published_shifts where id=pg_temp.shift(17)) and (select employee_id=pg_temp.emp(1) from public.schedule_published_shifts where id=pg_temp.shift(19)),'AT17 fresh candidate consent and both fresh votes transfer only the new pair');
select is((select employee_id from public.schedule_published_shifts where id=pg_temp.shift(18)),pg_temp.emp(2),'AT17 original candidate retains the shift they withdrew from swapping');
select is((select count(*)::int from public.shift_exchange_events where case_id=p.cid and action='transfer_completed'),0,'AT17 withdrawn case never records a transfer') from sx_previous_candidate p;
select is((select count(*)::int from public.shift_exchange_events where case_id=s.cid and action='transfer_completed'),1,'AT17 replacement case records exactly one transfer') from sx_state s;
select * from finish();
rollback;
