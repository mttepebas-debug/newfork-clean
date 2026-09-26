begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table ws as select
 'ad423000-0000-4000-8000-000000000001'::uuid w,
 'ad423000-0000-4000-8000-000000000002'::uuid owner_id,
 'ad423000-0000-4000-8000-000000000003'::uuid employee_user,
 'ad423000-0000-4000-8000-000000000004'::uuid emp,
 'ad423000-0000-4000-8000-000000000005'::uuid manager,
 'ad423000-0000-4000-8000-000000000006'::uuid loc,
 'ad423000-0000-4000-8000-000000000007'::uuid other_loc,
 'ad423000-0000-4000-8000-000000000008'::uuid shift,
 'ad423000-0000-4000-8000-000000000009'::uuid job,
 null::uuid session, null::uuid draft, null::jsonb payload, null::jsonb preview, null::jsonb snapshot;
insert into auth.users(id,email) select owner_id,'weekly-integration-owner@example.test' from ws
 union all select employee_user,'weekly-integration-employee@example.test' from ws
 union all select manager,'weekly-integration-manager@example.test' from ws;
insert into public.workspaces(id,name,created_by) select w,'Weekly integration',owner_id from ws;
insert into public.workspace_memberships(workspace_id,user_id,role,all_locations)
 select w,owner_id,'owner'::public.workspace_role,true from ws
 union all select w,employee_user,'employee'::public.workspace_role,false from ws
 union all select w,manager,'manager'::public.workspace_role,false from ws;
insert into public.workspace_scheduling_settings(workspace_id) select w from ws on conflict do nothing;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select 'T00072', loc,w,'West','1 Test Street','Test City','CA','90001','America/Los_Angeles' from ws
 union all select 'T00073', other_loc,w,'East','2 Test Street','Test City','NY','10001','America/New_York' from ws;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
 select emp,w,employee_user,'E-993423','Weekly','Integration',owner_id from ws;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,emp,loc,owner_id from ws;
select tests.works_at(m.id, f.loc) from ws f join public.workspace_memberships m on m.workspace_id=f.w and m.user_id in(f.employee_user,f.manager);
insert into public.jobs(id,workspace_id,name) select job,w,'Server' from ws;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by)
 select w,emp,job,true,owner_id from ws;
update public.workspace_scheduling_settings set conflict_rules=jsonb_set(conflict_rules,'{availability}','"warn"') where workspace_id=(select w from ws);
update ws set session=(public.acquire_schedule_edit_session_service(manager,w,'2035-01-15','blank',null)->'session'->>'id')::uuid;
update ws set payload=jsonb_build_object('location_id',loc,'employee_id',emp,'job_id',job,'scheduled_date','2035-01-15',
 'time_basis','explicit','start_time','18:00','end_time','20:00','time_timezone','America/Los_Angeles','note','');
create function pg_temp.assess(p jsonb default null) returns jsonb language sql as $$
 select public.assess_schedule_shift_service(manager,w,coalesce(p,payload),null,session) from ws;
$$;
create function pg_temp.mutate(p jsonb,op text default 'create') returns jsonb language sql as $$
 select public.mutate_schedule_edit_shift_service(s.manager,s.w,s.session,e.revision,op,s.shift,
  (select revision from public.schedule_edit_session_shifts where session_id=s.session and id=s.shift),p,gen_random_uuid())
 from ws s join public.schedule_edit_sessions e on e.id=s.session;
$$;
select is(pg_temp.assess()->>'operation','allowed','canonical Schedule defaults to fully available without an old baseline');
insert into public.manager_weekly_reminders(workspace_id,employee_id,enabled,preference,revision,updated_by)
 select w,emp,true,jsonb_set(public.empty_weekly_preference('time_range'),'{days,1,range}','{"start":"18:00","end":"20:00"}'),1,manager from ws;
select is(pg_temp.assess()->>'operation','warning_requires_override','canonical assessment reads the manager''s reminders');
select is(pg_temp.assess()->>'warning_policy','confirm','a manager''s reminder asks for confirmation even under Warn');
select is(pg_temp.assess()->>'can_override','true','the manager can place anyway');
select throws_ok($$select public.assess_schedule_shift_service(employee_user,w,payload) from ws$$,'42501',null,'employee cannot inspect manager assessment');
select throws_ok($$select public.assess_schedule_shift_service(manager,w,payload||jsonb_build_object('location_id',other_loc)) from ws$$,'42501',null,'location scope remains enforced');
select throws_ok($$select pg_temp.mutate(payload) from ws$$,'PT409',null,'canonical mutation requires fresh assessment');
select throws_ok($$insert into public.schedule_edit_session_shifts(id,workspace_id,session_id,location_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select shift,w,session,loc,emp,job,'2035-01-15','18:00','20:00','explicit','America/Los_Angeles' from ws$$,'23514',null,'raw assignment cannot bypass weekly acceptance');
select lives_ok($$select pg_temp.mutate(payload||jsonb_build_object('availability_assessment_fingerprint',pg_temp.assess()->>'fingerprint')) from ws$$,'actual mutation stores a warning acceptance without a written reason');
select is((select count(*) from public.schedule_availability_overrides where workspace_id=(select w from ws)),1::bigint,'canonical mutation records exactly one acceptance');
select lives_ok($$select pg_temp.mutate(payload||'{"note":"Changed display note"}','update') from ws$$,'same-conflict note edit needs no new decision');
select is((select count(*) from public.schedule_availability_overrides where workspace_id=(select w from ws)),1::bigint,'note edit does not duplicate acceptance history');
select throws_ok($$select pg_temp.mutate(payload||'{"start_time":"19:00"}','update') from ws$$,'PT409',null,'changed hours cannot reuse the acceptance');
select throws_ok($$select pg_temp.mutate(payload||'{"time_basis":"unresolved","start_time":null,"end_time":null}','update') from ws$$,'22023',null,'assignment without hours or a named type is invalid');
select is(public.schedule_availability_read_projection(manager,w,payload||jsonb_build_object('id',shift))->'availability_assessment'->>'override_recorded','true','draft read uses accepted weekly evidence') from ws;
select is(public.schedule_availability_read_projection(employee_user,w,payload||jsonb_build_object('id',shift))->'availability_assessment','null'::jsonb,'employee projection does not leak manager preferences') from ws;
insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,status,created_by)
 select 'ad423000-0000-4000-8000-000000000011',w,emp,loc,'approved',employee_user from ws;
insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date,start_time,end_time,status)
 select w,'ad423000-0000-4000-8000-000000000011','2035-01-15','12:00','14:00','approved' from ws;
select is(pg_temp.assess(payload||'{"start_time":"12:00","end_time":"14:00"}')->>'operation','blocked','approved leave remains a real assignment blocker') from ws;
select throws_ok($$select pg_temp.mutate(payload||'{"start_time":"12:00","end_time":"14:00"}','update') from ws$$,'23514',null,'canonical manager mutation cannot override approved leave');
-- Auto-fill has a separate automatic policy: it may not manufacture acceptance.
insert into public.schedule_edit_session_shifts(id,workspace_id,session_id,location_id,job_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select 'ad423000-0000-4000-8000-000000000010',w,session,loc,job,'2035-01-16','18:00','20:00','explicit','America/Los_Angeles' from ws;
update public.manager_weekly_reminders set preference=jsonb_set(preference,'{days,2,all_day}','true') where workspace_id=(select w from ws);
select ok(not exists(select 1 from ws,jsonb_array_elements(public.preview_schedule_auto_fill_service(manager,w,session)->'proposals') p,
 jsonb_array_elements(p->'candidates') c where c->>'employee_id'=emp::text),'canonical auto-fill excludes new weekly unavailable hours');
update public.manager_weekly_reminders set preference=jsonb_set(preference,'{days,2,all_day}','false') where workspace_id=(select w from ws);
select ok(exists(select 1 from ws,jsonb_array_elements(public.preview_schedule_auto_fill_service(manager,w,session)->'proposals') p,
 jsonb_array_elements(p->'candidates') c where c->>'employee_id'=emp::text),'canonical auto-fill includes unmarked available hours');
delete from public.schedule_edit_session_shifts where id='ad423000-0000-4000-8000-000000000010';
update ws s set draft=(public.save_schedule_edit_session_service(manager,w,session,e.revision,'Weekly integration',null,null)->>'id')::uuid
 from public.schedule_edit_sessions e where e.id=s.session;
create function pg_temp.preflight() returns jsonb language sql as $$
 select public.preview_schedule_publication_service(manager,w,draft,array[loc],null,true) from ws;
$$;
create function pg_temp.publish(decisions jsonb default '[]') returns jsonb language plpgsql as $$
declare s ws%rowtype; rev integer;
begin
 select * into s from ws; select revision into rev from public.schedule_drafts where id=s.draft;
 return public.publish_schedule_draft_service(s.manager,s.w,s.draft,array[s.loc],null,true,rev,s.preview->>'fingerprint',decisions);
end; $$;
select is(pg_temp.preflight()->'findings'->0->>'availability_state','accepted','canonical preflight retains accepted conflict group');
update public.manager_weekly_reminders set preference=jsonb_set(preference,'{days,1,range}','{"start":"19:00","end":"20:00"}') where workspace_id=(select w from ws);
update ws set preview=pg_temp.preflight();
select is(preview->>'status','override_required','a changed reminder conflict asks for a decision even under Warn') from ws;
select is(preview->'findings'->0->>'availability_state','new','changed conflict is marked new') from ws;
update public.workspace_scheduling_settings set conflict_rules=jsonb_set(conflict_rules,'{availability}','"confirm"') where workspace_id=(select w from ws);
select throws_ok($$select pg_temp.publish()$$,'PT409',null,'final publish rejects changed assessment since preview');
update ws set preview=pg_temp.preflight();
select is(preview->>'status','override_required','new confirm finding requires one explicit decision') from ws;
select throws_ok($$select pg_temp.publish()$$,'22023',null,'final publish cannot silently accept a confirm conflict');
select is((select count(*) from public.schedule_location_publications where workspace_id=(select w from ws)),0::bigint,'failed publish leaves no publication');
select lives_ok($$select pg_temp.publish(jsonb_build_array(jsonb_build_object('finding_id',preview->'findings'->0->>'id'))) from ws$$,'final publish accepts finding ID without written reason or legacy permission');
update ws s set snapshot=(select availability_snapshot from public.schedule_published_shifts where workspace_id=s.w and source_shift_id=s.shift limit 1);
select is(snapshot->'assessment'->>'warning_policy','confirm','published assignment captures the current weekly assessment') from ws;
select is(snapshot->'override'->>'reason','Schedule conflict confirmed by manager.','published audit uses system action text') from ws;
select is(public.schedule_availability_read_projection(manager,w,(select to_jsonb(p) from public.schedule_published_shifts p where p.workspace_id=w limit 1))->'availability_assessment'->>'has_availability_conflict','true','published manager warning is initially visible') from ws;
update public.manager_weekly_reminders set enabled=false where workspace_id=(select w from ws);
select is(pg_temp.preflight()->'findings','[]'::jsonb,'disabled manager warning disappears from retained preflight');
update public.manager_weekly_reminders set enabled=true where workspace_id=(select w from ws);
select is(pg_temp.preflight()->'findings','[]'::jsonb,'re-enabling does not backfill published warning');
select is(public.schedule_availability_read_projection(manager,w,(select to_jsonb(p) from public.schedule_published_shifts p where p.workspace_id=w limit 1))->'availability_assessment'->>'has_availability_conflict','false','published read suppresses re-enabled reminder') from ws;
update ws set preview=public.preview_schedule_publication_service(manager,w,draft,array[loc]);
select lives_ok($$select pg_temp.publish('[]')$$,'republishing preserves unchanged responsibility without another decision');
select is((select availability_snapshot from public.schedule_published_shifts p join public.schedule_location_publications l on l.id=p.publication_id where p.workspace_id=s.w and l.status='current' limit 1),snapshot,'republish keeps immutable original evidence') from ws s;
-- A distinct new assignment must not inherit the previous publication's choice.
-- The employee's own mark follows Warn (a manager's reminder would ask for confirmation).
insert into public.schedule_draft_shifts(id,workspace_id,draft_id,location_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select 'ad423000-0000-4000-8000-000000000012',w,draft,loc,emp,job,'2035-01-16','18:00','20:00','explicit','America/Los_Angeles' from ws;
insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
 select w,emp,jsonb_set(public.empty_weekly_preference('time_range'),'{days,2,range}','{"start":"18:00","end":"20:00"}'),1,employee_user from ws;
update public.workspace_scheduling_settings set conflict_rules=jsonb_set(conflict_rules,'{availability}','"warn"') where workspace_id=(select w from ws);
update ws set preview=pg_temp.preflight();
select is(preview->'findings'->0->>'availability_state','new','a different shift has its own new conflict') from ws;
select lives_ok($$select pg_temp.publish()$$,'new warn conflicts publish without any explicit decision or written reason');
select is((select availability_snapshot->'override'->>'reason' from public.schedule_published_shifts p
 join public.schedule_location_publications l on l.id=p.publication_id where p.workspace_id=(select w from ws)
 and p.source_shift_id='ad423000-0000-4000-8000-000000000012' and l.status='current'),
 'Schedule warning acknowledged (warn policy).','warn publication still records its current system action');
-- Default-hour batches share the same policy without borrowing publication consent.
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time)
 select 'ad423000-0000-4000-8000-000000000015',w,'Default review','12:00','16:00' from ws;
create temp table wd as select
 (public.acquire_schedule_edit_session_service(manager,w,'2035-01-29','blank',null)->'session'->>'id')::uuid session,
 null::jsonb command, null::jsonb review from ws;
select public.mutate_schedule_edit_shift_service(s.manager,s.w,d.session,e.revision,'create','ad423000-0000-4000-8000-000000000016',null,
 jsonb_build_object('location_id',s.loc,'employee_id',s.emp,'job_id',s.job,'scheduled_date','2035-02-01','shift_type_id','ad423000-0000-4000-8000-000000000015','time_basis','type_default'),gen_random_uuid())->>'revision'
 from ws s,wd d,public.schedule_edit_sessions e where e.id=d.session;
update public.employee_weekly_preferences set preference=jsonb_set(preference,'{days,4,range}','{"start":"16:00","end":"18:00"}') where workspace_id=(select w from ws);
update public.shift_types set default_end_time='18:00' where id='ad423000-0000-4000-8000-000000000015';
update wd d set command=jsonb_build_object('expected_session_revision',e.revision,'starts_on','2035-01-29','ends_on','2035-02-04',
 'shift_ids',jsonb_build_array('ad423000-0000-4000-8000-000000000016'),'overrides','[]'::jsonb) from public.schedule_edit_sessions e where e.id=d.session;
update wd set review=public.preview_schedule_default_hours_service(s.manager,s.w,wd.session,command) from ws s;
select is(review->'shifts'->0->'after_assessment'->>'warning_policy','warn','default-hour preview carries weekly policy') from wd;
select is(review->>'blocked_count','0','default-hour warning does not require an override reason') from wd;
create function pg_temp.apply_defaults(confirmed boolean default false) returns jsonb language sql as $$
 select public.apply_schedule_default_hours_service(s.manager,s.w,d.session,d.command||jsonb_build_object('fingerprint',d.review->>'fingerprint',
  'idempotency_key',gen_random_uuid(),'confirm_availability',confirmed)) from ws s,wd d;
$$;
select lives_ok($$select pg_temp.apply_defaults()$$,'actual default-hour batch applies warn conflict without reason');
select is((select end_time::text from public.schedule_edit_session_shifts where id='ad423000-0000-4000-8000-000000000016'),'18:00:00','batch stores the reviewed current hours');
update public.workspace_scheduling_settings set conflict_rules=jsonb_set(conflict_rules,'{availability}','"confirm"') where workspace_id=(select w from ws);
update public.shift_types set default_start_time='11:00' where id='ad423000-0000-4000-8000-000000000015';
update wd d set command=command||jsonb_build_object('expected_session_revision',e.revision) from public.schedule_edit_sessions e where e.id=d.session;
update wd set review=public.preview_schedule_default_hours_service(s.manager,s.w,wd.session,command) from ws s;
select throws_ok($$select pg_temp.apply_defaults()$$,'22023',null,'confirm-policy batch requires the explicit bulk action');
select is((select start_time::text from public.schedule_edit_session_shifts where id='ad423000-0000-4000-8000-000000000016'),'12:00:00','missing confirmation changes no shift');
select lives_ok($$select pg_temp.apply_defaults(true)$$,'one explicit confirmation applies default hours without reason');
select is((select start_time::text from public.schedule_edit_session_shifts where id='ad423000-0000-4000-8000-000000000016'),'11:00:00','confirmed batch stores current start time');

-- Publication capability remains independent of the edit/default-hours commands.
insert into public.workspace_roles(id,workspace_id,name,access_class)
 select 'ad423000-0000-4000-8000-000000000013',w,'Publisher','manager' from ws;
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key)
 select w,'ad423000-0000-4000-8000-000000000013',p from ws,unnest(array['workspace.read','schedule.read','schedule.publish']) p;
update public.workspace_memberships set role_id='ad423000-0000-4000-8000-000000000013' where workspace_id=(select w from ws) and user_id=(select manager from ws);
select ok(not public.schedule_actor_can_manage_service(manager,w,loc),'custom publisher does not have edit permission') from ws;
select lives_ok($$select pg_temp.preflight()$$,'canonical preflight honors publish permission independently of edit');
update ws set preview=pg_temp.preflight();
select lives_ok($$select pg_temp.publish()$$,'publish-only manager can retain accepted assignments');
select throws_ok($$select public.preview_schedule_publication_service(manager,w,draft,array[other_loc]) from ws$$,'42501',null,'publish-only manager still cannot publish outside location scope');
-- Leave is added after a valid draft assignment, so final publication must recheck.
insert into public.schedule_draft_shifts(id,workspace_id,draft_id,location_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select 'ad423000-0000-4000-8000-000000000014',w,draft,loc,emp,job,'2035-01-17','18:00','20:00','explicit','America/Los_Angeles' from ws;
insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date,start_time,end_time,status)
 select w,'ad423000-0000-4000-8000-000000000011','2035-01-17','18:00','20:00','approved' from ws;
update ws set preview=pg_temp.preflight();
select is(preview->>'status','hard_blocked','approved leave added to draft still blocks canonical preflight') from ws;
select throws_ok($$select pg_temp.publish()$$,'23514',null,'warn policy never bypasses approved leave at final publish');
select ok(not has_function_privilege('authenticated','public.weekly_publication_decisions(jsonb,jsonb)','execute'),'normal clients cannot call internal publication decision normalizer');
select ok(not has_function_privilege('service_role','public.schedule_prepare_availability_assignment(uuid,uuid,jsonb,jsonb)','execute'),'canonical raw acceptance preparer remains internal');
select * from finish();
rollback;
