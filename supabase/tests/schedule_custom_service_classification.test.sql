begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table sc as select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid w,
 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid actor,'af9e0000-0000-4000-8000-000000000005'::uuid loc,
 '13000000-0000-4000-8000-000000000001'::uuid job,'af9e0000-0000-4000-8000-000000000001'::uuid emp,
 'af9e0000-0000-4000-8000-000000000002'::uuid shift,'af9e0000-0000-4000-8000-000000000003'::uuid typ,
 '2036-01-14'::date week,null::uuid session,null::uuid draft,null::jsonb payload,null::jsonb preview;
select public.availability_lock_workspace(w) from sc;
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,country_code,timezone)
select 'T00032', loc,w,'Custom classification fixture','1 Verification Way','Test City','CA','94301','US','America/Los_Angeles' from sc;
insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by)
select emp,w,'E-994951','Custom','Work',actor from sc;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by) select w,emp,loc,true,actor from sc;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by) select w,emp,job,true,actor from sc;
insert into public.shift_types(id,workspace_id,name,color,default_start_time,default_end_time) select typ,w,'Custom Fixture Lunch','#123456','12:00','16:00' from sc;
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from)
select w,emp,1,'America/Los_Angeles',(select jsonb_agg(jsonb_build_object('day',d,'mode','windows','windows','[{"start":"09:00","end":"21:00"}]'::jsonb,'blocked_shift_type_ids',jsonb_build_array(typ))) from generate_series(0,6) d),'employee',actor,week from sc;
update public.workspace_scheduling_settings set availability_enforcement='hard' where workspace_id=(select w from sc);
update sc set session=(public.acquire_schedule_edit_session_service(actor,w,week,'blank',null)->'session'->>'id')::uuid;
update sc set payload=public.normalize_schedule_time_source(w,jsonb_build_object('location_id',loc,'employee_id',emp,'job_id',job,'shift_type_id',null,
 'scheduled_date',week,'time_basis','explicit','start_time','12:00','end_time','16:00','note',''));
create function pg_temp.sc_assess(p jsonb) returns jsonb language sql as $$
 select public.assess_schedule_shift_service(actor,w,p,shift,session) from sc;
$$;
create function pg_temp.sc_custom(p jsonb) returns jsonb language sql as $$
 select p||jsonb_build_object('service_classification_note','Inventory training independent of lunch service.',
  'service_classification_fingerprint',pg_temp.sc_assess(p||'{"service_classification_note":"Inventory training independent of lunch service."}')->>'service_classification_fingerprint');
$$;
create function pg_temp.sc_mutate(p jsonb,op text default 'create') returns jsonb language sql as $$
 select public.mutate_schedule_edit_shift_service(s.actor,s.w,s.session,e.revision,op,s.shift,
  (select revision from public.schedule_edit_session_shifts where session_id=s.session and id=s.shift),p,gen_random_uuid())
 from sc s join public.schedule_edit_sessions e on e.id=s.session;
$$;
select is(pg_temp.sc_assess(payload)->>'operation','verification_required','unnamed assignment is unclassified by default') from sc;
select is(public.assess_shift_availability(w,emp,payload||'{"service_independent":true,"service_classification":{"kind":"custom"}}')->>'operation','verification_required','raw JSON cannot forge a trusted service classification') from sc;
select is(pg_temp.sc_assess(payload||'{"service_classification_note":"Inventory training independent of lunch service."}')->>'operation','allowed','explicit manager preview clears service uncertainty within confirmed hours') from sc;
select is((select count(*)::integer from public.schedule_service_classifications),0,'preview never writes classification evidence');
select throws_ok($$select public.assess_schedule_shift_service(gen_random_uuid(),w,payload||'{"service_classification_note":"Inventory training independent of lunch service."}') from sc$$,'42501',null,'unknown actor cannot classify through preview');
select throws_ok($$select pg_temp.sc_assess(payload||jsonb_build_object('shift_type_id',typ,'service_classification_note','Inventory training independent of lunch service.')) from sc$$,'22023',null,'named restricted service cannot be relabelled custom without removing its type') from sc;
select throws_ok($$select pg_temp.sc_assess(payload||'{"time_basis":"unresolved","start_time":null,"end_time":null,"service_classification_note":"Inventory training independent of lunch service."}') from sc$$,'22023',null,'unresolved hours cannot be classified');
select throws_ok($$select pg_temp.sc_mutate(payload||'{"service_classification_note":"Inventory training independent of lunch service."}') from sc$$,'40001',null,'commit requires current classification review fingerprint');
select throws_ok($$select pg_temp.sc_mutate(pg_temp.sc_custom(payload)||'{"start_time":"13:00"}') from sc$$,'40001',null,'changing reviewed hours invalidates classification intent');
select is((select count(*)::integer from public.schedule_service_classifications),0,'failed commits leave no classification history');
select lives_ok($$select pg_temp.sc_mutate(payload) from sc$$,'unclassified work may be retained for repair in a draft');
select lives_ok($$select pg_temp.sc_mutate(pg_temp.sc_custom(payload),'update') from sc$$,'manager can classify an existing unchanged draft assignment');
select is((select count(*)::integer from public.schedule_service_classifications),1,'commit creates one auditable decision');
select is((select reason from public.schedule_service_classifications),'Inventory training independent of lunch service.','audit preserves the manager explanation');
select is((select actor_user_id from public.schedule_service_classifications),actor,'audit derives the actual manager identity') from sc;
select is(public.schedule_availability_read_projection(actor,w,payload||jsonb_build_object('id',shift))->'availability_assessment'->'service_classification'->>'kind','custom','authorized Schedule read preserves the classification explanation') from sc;
select is(pg_temp.sc_assess(payload)->'service_classification'->>'status','recorded','editor read recognizes the stored assignment decision') from sc;
select is(pg_temp.sc_assess(payload)->>'operation','allowed','read uses existing evidence without asking for a new classification') from sc;
select is(public.assess_shift_availability(w,emp,payload||jsonb_build_object('id',shift))->>'operation','allowed','canonical evaluator uses only recorded evidence') from sc;
select is(public.assess_shift_availability(w,emp,payload||jsonb_build_object('id',gen_random_uuid()))->>'operation','verification_required','copying to another shift does not copy classification') from sc;
select is(public.assess_shift_availability(w,emp,payload||jsonb_build_object('id',shift,'scheduled_date',week+1))->>'operation','verification_required','classification is bound to its date') from sc;
select is(public.assess_shift_availability(w,emp,payload||jsonb_build_object('id',shift,'shift_type_id',typ))->>'operation','blocked','adding a restricted service type cannot use custom evidence') from sc;
select is(public.assess_shift_availability(w,emp,payload||jsonb_build_object('id',shift,'employee_id',gen_random_uuid()))->>'operation','allowed','core target employee remains authoritative over spoofed JSON employee') from sc;
select is(public.schedule_service_classification(w,gen_random_uuid(),payload||jsonb_build_object('id',shift)),null::jsonb,'classification cannot be borrowed by a different employee') from sc;
select is(pg_temp.sc_assess(payload||jsonb_build_object('scheduled_date',week-7,'service_classification_note','Inventory training independent of lunch service.'))->>'operation','verification_required','custom intent cannot supply unconfirmed availability') from sc;
select throws_ok($$update public.schedule_service_classifications set reason='Rewrite the old decision explanation'$$,'23514',null,'audit explanation is immutable');
select lives_ok($$select pg_temp.sc_mutate(payload||'{"note":"Only badge text changed"}','update') from sc$$,'ordinary note edits retain classification');
select is((select count(*)::integer from public.schedule_service_classifications where revoked_at is null),1,'display changes do not require duplicate decisions');
-- Direct assignment updates revoke old evidence, including moving away/back.
update public.schedule_edit_session_shifts set employee_id=null where id=(select shift from sc) and session_id=(select session from sc);
select is((select count(*)::integer from public.schedule_service_classifications where revoked_at is null),0,'unassigning revokes classification');
update public.schedule_edit_session_shifts set employee_id=(select emp from sc) where id=(select shift from sc) and session_id=(select session from sc);
select is(pg_temp.sc_assess(payload)->>'operation','verification_required','raw reassignment cannot revive the old classification') from sc;
select lives_ok($$select pg_temp.sc_mutate(pg_temp.sc_custom(payload),'update') from sc$$,'explicit new classification can restore the custom assignment');
-- Classification never supplies hours, a soft override, or approved leave.
select is(pg_temp.sc_assess(payload||'{"start_time":"07:00","service_classification_note":"Inventory training independent of lunch service."}')->>'operation','blocked','custom preview still blocks hard physical unavailability') from sc;
select throws_ok($$select pg_temp.sc_mutate(pg_temp.sc_custom(payload||'{"start_time":"07:00"}'),'update') from sc$$,'23514',null,'custom commit cannot bypass hard physical hours');
select is((select count(*)::integer from public.schedule_service_classifications where revoked_at is null),1,'failed hard-hour update retains original decision atomically');
update public.workspace_scheduling_settings set availability_enforcement='soft' where workspace_id=(select w from sc);
select is(pg_temp.sc_assess(payload||'{"start_time":"07:00","service_classification_note":"Inventory training independent of lunch service."}')->>'operation','warning_requires_override','custom work still needs separate soft availability review') from sc;
select throws_ok($$select pg_temp.sc_mutate(pg_temp.sc_custom(payload||'{"start_time":"07:00"}'),'update') from sc$$,'40001',null,'classification explanation cannot replace a soft override');
select lives_ok($$select pg_temp.sc_mutate(pg_temp.sc_custom(payload||'{"start_time":"07:00"}')||jsonb_build_object('availability_assessment_fingerprint',pg_temp.sc_assess(payload||'{"start_time":"07:00","service_classification_note":"Inventory training independent of lunch service."}')->>'fingerprint','conflict_override_note','Employee agreed to this earlier training exception.'),'update') from sc$$,'classification and independent soft override commit together');
select is((select count(*)::integer from public.schedule_availability_overrides where shift_id=(select shift from sc) and revoked_at is null),1,'soft override has its own audit evidence');
select lives_ok($$select pg_temp.sc_mutate(pg_temp.sc_custom(payload),'update') from sc$$,'return to confirmed hours with a fresh classification');
update public.workspace_scheduling_settings set availability_enforcement='hard' where workspace_id=(select w from sc);
insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,status,created_by)
select 'af9e0000-0000-4000-8000-000000000004',w,emp,loc,'approved',actor from sc;
insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date,start_time,end_time,status)
select w,'af9e0000-0000-4000-8000-000000000004',week+1,'13:00','14:00','approved' from sc;
select is(pg_temp.sc_assess(payload||jsonb_build_object('scheduled_date',week+1,'service_classification_note','Inventory training independent of lunch service.'))->>'operation','blocked','approved leave blocks custom work too') from sc;
select throws_ok($$select pg_temp.sc_mutate(pg_temp.sc_custom(payload||jsonb_build_object('scheduled_date',week+1)),'update') from sc$$,'23514',null,'approved leave blocks custom commit atomically');
-- Ordinary scoped Schedule management can classify work, while the separate
-- availability override permission is still required for physical exceptions.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('af9e0000-0000-4000-8000-000000000010','00000000-0000-0000-0000-000000000000','authenticated','authenticated','custom-scoped@example.test','','{}','{}',now(),now());
insert into public.workspace_roles(id,workspace_id,name,access_class) select 'af9e0000-0000-4000-8000-000000000011',w,'Custom work scoped manager','manager' from sc;
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key)
select w,'af9e0000-0000-4000-8000-000000000011',p from sc,unnest(array['workspace.read','schedule.read','schedule.manage']) p;
insert into public.workspace_memberships(id,workspace_id,user_id,role,role_id,status,all_locations)
select 'af9e0000-0000-4000-8000-000000000012',w,'af9e0000-0000-4000-8000-000000000010','manager','af9e0000-0000-4000-8000-000000000011','active',false from sc;
select tests.works_at('af9e0000-0000-4000-8000-000000000012', loc) from sc;
select is(public.assess_schedule_shift_service('af9e0000-0000-4000-8000-000000000010',w,payload||'{"service_classification_note":"Inventory training independent of lunch service."}')->>'operation','allowed','scoped Schedule manager can review independent custom work') from sc;
select is(public.assess_schedule_shift_service('af9e0000-0000-4000-8000-000000000010',w,payload||'{"service_classification_note":"Inventory training independent of lunch service."}')->>'can_override','false','classification does not grant availability override permission') from sc;
select throws_ok($$select public.assess_schedule_shift_service('af9e0000-0000-4000-8000-000000000010',w,payload||'{"location_id":"11000000-0000-4000-8000-000000000002","service_classification_note":"Inventory training independent of lunch service."}') from sc$$,'42501',null,'custom preview respects manager location scope');
-- Saving and publication retain the exact decision, not client-supplied fields.
update sc s set draft=(public.save_schedule_edit_session_service(actor,w,session,e.revision,'Custom work fixture',null,null)->>'id')::uuid from public.schedule_edit_sessions e where e.id=s.session;
select is((select count(*)::integer from public.schedule_service_classifications where revoked_at is null),1,'save/hydration retains current evidence');
update sc set preview=public.preview_schedule_publication_service(actor,w,draft,array[loc]);
select is(preview->>'status','publish_ready','classified custom work can publish under hard service restrictions') from sc;
select lives_ok($$select public.publish_schedule_draft_service(s.actor,s.w,s.draft,array[s.loc],d.revision,s.preview->>'fingerprint','[]') from sc s join public.schedule_drafts d on d.id=s.draft$$,'publication enforces and captures the custom classification');
select is((select availability_snapshot->'assessment'->'service_classification'->>'reason' from public.schedule_published_shifts where source_shift_id=(select shift from sc)),'Inventory training independent of lunch service.','published snapshot retains the exact classification explanation');
update public.schedule_published_shifts set employee_id=null where source_shift_id=(select shift from sc);
select throws_ok($$update public.schedule_published_shifts set employee_id=(select emp from sc) where source_shift_id=(select shift from sc)$$,'23514',null,'published raw reassignment cannot revive custom classification');
set local role authenticated;
select throws_ok($$select * from public.schedule_service_classifications$$,'42501',null,'employee cannot read private classification ledger directly');
select throws_ok($$select public.assess_shift_availability_core(null,null,'{}',true)$$,'42501',null,'employee cannot invoke trusted core boolean');
reset role;
select ok(not has_function_privilege('service_role','public.assess_shift_availability_core(uuid,uuid,jsonb,boolean)','execute'),'service cannot bypass scoped API through trusted core');
select ok(not has_function_privilege('service_role','public.schedule_prepare_service_classification(uuid,uuid,jsonb,jsonb)','execute'),'service cannot call private classification writer');
select ok(not has_table_privilege('service_role','public.schedule_service_classifications','insert'),'service cannot forge classification evidence');
select * from finish();
rollback;
