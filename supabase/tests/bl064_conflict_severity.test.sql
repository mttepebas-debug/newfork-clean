begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table f as select
 'b1640000-0000-4000-8000-000000000001'::uuid w,
 'b1640000-0000-4000-8000-000000000002'::uuid actor,
 'b1640000-0000-4000-8000-000000000003'::uuid loc,
 'b1640000-0000-4000-8000-000000000004'::uuid job,
 'b1640000-0000-4000-8000-000000000005'::uuid emp,
 'b1640000-0000-4000-8000-000000000006'::uuid typ,
 'b1640000-0000-4000-8000-000000000007'::uuid shift;
insert into auth.users(id,email) select actor,'bl064@example.test' from f;
insert into public.workspaces(id,name,created_by) select w,'BL064 SQL fixture',actor from f;
insert into public.workspace_memberships (workspace_id, user_id, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (select w,actor,'owner',true from f) as legacy(workspace_id, user_id, role, all_locations);
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select 'T00007', loc,w,'Test','1 Test','Test','CA','90001','America/Los_Angeles' from f;
insert into public.jobs(id,workspace_id,name) select job,w,'Test' from f;
insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time) select typ,w,'Test','09:00','17:00' from f;
insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by)
 select emp,w,'E-993064','BL064','Tester',actor from f;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by) select w,emp,loc,actor from f;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by) select w,emp,job,true,actor from f;
create temp table editor as select (public.acquire_schedule_edit_session_service(actor,w,'2035-01-15','blank',null)->'session'->>'id')::uuid id from f;
create function pg_temp.shift(changes jsonb default '{}') returns jsonb language sql stable as $$
 select jsonb_build_object('id',shift,'session_id',(select id from editor),'location_id',loc,'employee_id',emp,'job_id',job,'shift_type_id',typ,
  'scheduled_date','2035-01-15','time_basis','explicit','start_time','09:00','end_time','17:00','time_timezone','America/Los_Angeles')||changes from f;
$$;
create function pg_temp.assess(changes jsonb default '{}') returns jsonb language sql stable as $$
 select public.assess_weekly_shift_availability(w,emp,pg_temp.shift(changes)) from f;
$$;
select ok((select not conflict_rules ? 'availability' from public.workspace_scheduling_settings where workspace_id=(select w from f)),'a new workspace has no availability rule: availability is a preference (BL-186)');
select is(pg_temp.assess()->>'conflict_severity','allow','clear assignment is allowed');
select is(pg_temp.assess('{"start_time":"09:00","end_time":"09:00"}')->>'conflict_severity','block','equal hours are immutable block');
select is(pg_temp.assess('{"start_time":null,"end_time":null}')->>'conflict_severity','confirm','a proposal without hours needs confirmation');
select lives_ok($$select public.prepare_weekly_schedule_assignment(actor,w,pg_temp.shift(),null) from f$$,'normal assignment needs no confirmation request');
insert into public.schedule_edit_session_shifts(id,workspace_id,session_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select shift,w,(select id from editor),loc,emp,job,typ,'2035-01-15','09:00','17:00','explicit','America/Los_Angeles' from f;
select is(pg_temp.assess()->>'conflict_severity','allow','edit excludes its own shift');
select is(pg_temp.assess('{"id":"b1640000-0000-4000-8000-000000000008","start_time":"18:00","end_time":"20:00"}')->>'conflict_severity','allow','same shift type without overlap is allowed');
select is(pg_temp.assess('{"id":"b1640000-0000-4000-8000-000000000008","start_time":"16:00","end_time":"20:00"}')->>'conflict_severity','block','real overlap blocks another assignment');
select is((select public.assess_weekly_shift_availability(w,emp,public.normalize_schedule_time_source(w,pg_temp.shift('{"id":"b1640000-0000-4000-8000-000000000008","time_basis":"type_default"}'),null))->>'conflict_severity' from f),'block','default-hour overlap is also immutable');
select throws_ok($$select public.prepare_weekly_schedule_assignment(actor,w,pg_temp.shift('{"id":"b1640000-0000-4000-8000-000000000008","start_time":"16:00","end_time":"20:00"}'),null) from f$$,'23514',null,'command enforces overlap without UI');
update public.workspace_scheduling_settings set minimum_rest_minutes=120 where workspace_id=(select w from f);
select is(pg_temp.assess('{"id":"b1640000-0000-4000-8000-000000000008","start_time":"18:00","end_time":"20:00"}')->>'conflict_severity','confirm','short rest uses workspace policy');
update public.workspace_scheduling_settings set conflict_rules=jsonb_set(conflict_rules,'{minimum_rest}','"block"') where workspace_id=(select w from f);
select is(pg_temp.assess('{"id":"b1640000-0000-4000-8000-000000000008","start_time":"18:00","end_time":"20:00"}')->>'conflict_severity','block','rest block policy is authoritative');
select tests.closed_day(w, array[loc]::uuid[], ('2035-01-16')::date, ('2035-01-16')::date, actor) from f;
select is(pg_temp.assess('{"scheduled_date":"2035-01-16"}')->>'conflict_severity','confirm','closed location defaults to confirmation');
select throws_ok($$select public.prepare_weekly_schedule_assignment(actor,w,pg_temp.shift('{"scheduled_date":"2035-01-16"}'),null) from f$$,'PT409',null,'closed-location command requests current fingerprint');
select lives_ok($$select public.prepare_weekly_schedule_assignment(actor,w,pg_temp.shift('{"scheduled_date":"2035-01-16"}')||jsonb_build_object('availability_assessment_fingerprint',public.assess_weekly_shift_availability(w,emp,pg_temp.shift('{"scheduled_date":"2035-01-16","_exclude_shift_id":"b1640000-0000-4000-8000-000000000007"}')-'id')->>'fingerprint'),null) from f$$,'confirmation reuses canonical fingerprint and automatic audit');
select is((select count(*) from public.schedule_availability_overrides where workspace_id=(select w from f)),1::bigint,'one automatic acceptance record');
update public.employee_profiles set is_excluded_from_schedule=true where workspace_id=(select w from f);
select is(pg_temp.assess('{"scheduled_date":"2035-01-16"}')->>'conflict_severity','block','hard employee block wins over closure confirmation');
select ok(not has_function_privilege('authenticated','public.assess_weekly_shift_availability(uuid,uuid,jsonb)','execute'),'evaluator stays internal');

-- Settings use the same workspace policy, with an independent configuration permission.
insert into auth.users(id,email) values ('b1640000-0000-4000-8000-000000000010','bl064-manager@example.test');
insert into public.workspace_roles(id,workspace_id,name,access_class,sort_order)
 select 'b1640000-0000-4000-8000-000000000011',w,'Limited schedule manager','manager',100 from f;
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key)
 select w,'b1640000-0000-4000-8000-000000000011',unnest(array['schedule.manage','settings.schedule_rules.read','settings.schedule_rules.manage']) from f;
insert into public.workspace_memberships (workspace_id, user_id, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(legacy.role_id::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(legacy.role_id::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (select w,'b1640000-0000-4000-8000-000000000010','manager','b1640000-0000-4000-8000-000000000011',true from f) as legacy(workspace_id, user_id, role, role_id, all_locations);
select throws_ok($$select public.update_scheduling_settings_service('b1640000-0000-4000-8000-000000000010',w,'{"minimum_rest_minutes":90,"conflict_rules_revision":1}') from f$$,'42501',null,'general settings management does not grant conflict management');
select throws_ok($$select public.update_scheduling_settings_service(actor,w,'{"minimum_rest_minutes":90}') from f$$,'PT409',null,'missing conflict revision is rejected');
select throws_ok($$select public.update_scheduling_settings_service(actor,w,'{"minimum_rest_minutes":90,"conflict_rules_revision":999}') from f$$,'PT409',null,'stale conflict revision is rejected');
create temp table settings_before as select * from public.workspace_scheduling_settings where workspace_id=(select w from f);
select lives_ok($$select public.update_scheduling_settings_service(actor,w,jsonb_build_object('minimum_rest_minutes',90,'conflict_rules_revision',(select conflict_rules_revision from settings_before))) from f$$,'owner saves the current conflict revision');
select is((select conflict_rules_revision from public.workspace_scheduling_settings where workspace_id=(select w from f)),(select conflict_rules_revision+1 from settings_before),'policy change increments conflict revision');
select is((select week_start_day::text from public.workspace_scheduling_settings where workspace_id=(select w from f)),(select week_start_day::text from settings_before),'partial conflict save preserves general settings');
select throws_ok($$select public.update_scheduling_settings_service(actor,w,jsonb_build_object('conflict_rules',jsonb_set(s.conflict_rules,'{approved_time_off}','"allow"'),'conflict_rules_revision',s.conflict_rules_revision)) from f join public.workspace_scheduling_settings s on s.workspace_id=f.w$$,'23514',null,'approved leave cannot be weakened to allow');
select set_config('request.jwt.claim.sub','b1640000-0000-4000-8000-000000000010',true);
select throws_ok($$update public.workspace_scheduling_settings set minimum_rest_minutes=60 where workspace_id=(select w from f)$$,'42501',null,'authenticated direct update cannot bypass conflict permission');
select set_config('request.jwt.claim.sub','',true);
delete from public.workspace_role_permissions where role_id='b1640000-0000-4000-8000-000000000011' and permission_key='settings.schedule_rules.manage';
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key) select w,'b1640000-0000-4000-8000-000000000011','schedule.conflict_rules.manage' from f;
-- A manager-type role never writes organization settings, conflict handling included (REUSE, FB-6.1 N3).
select throws_ok($$select public.update_scheduling_settings_service('b1640000-0000-4000-8000-000000000010',w,jsonb_build_object('minimum_rest_minutes',60,'conflict_rules_revision',s.conflict_rules_revision)) from f join public.workspace_scheduling_settings s on s.workspace_id=f.w$$,'42501','Not allowed','a manager-type role holding the conflict permission does not save conflict settings');
select throws_ok($$select public.update_scheduling_settings_service('b1640000-0000-4000-8000-000000000010',w,'{"week_start_day":"sunday"}') from f$$,'42501',null,'conflict manager cannot alter general settings');
select lives_ok($$select public.weekly_preference_settings_save_service(actor,w,jsonb_build_object('onboarding_required',true,'expected_revision',s.availability_preferences_revision),gen_random_uuid()) from f join public.workspace_scheduling_settings s on s.workspace_id=f.w$$,'weekly form saves without a conflict policy field');

-- FB-6.1.6 (T5): approved time off is always a hard block for a manager's
-- assignment; there is no setting for it (REUSE "İzin"). The owner tries to
-- soften it first, then the manager tries to confirm past it.
update public.employee_profiles set is_excluded_from_schedule=false where workspace_id=(select w from f);
select tests.approved_leave(w,emp,actor,loc,'2035-01-17','09:00','17:00','b1640000-0000-4000-8000-000000000030') from f;
select throws_ok($$select public.update_scheduling_settings_service(actor,w,jsonb_build_object('conflict_rules',jsonb_set(s.conflict_rules,'{approved_time_off}','"confirm"'),'conflict_rules_revision',s.conflict_rules_revision)) from f join public.workspace_scheduling_settings s on s.workspace_id=f.w$$,'23514',null,'approved leave cannot be softened to confirmation');
select throws_ok($$update public.workspace_scheduling_settings set conflict_rules=jsonb_set(conflict_rules,'{approved_time_off}','"warn"') where workspace_id=(select w from f)$$,'23514',null,'approved leave has no warn level');
select is(pg_temp.assess('{"scheduled_date":"2035-01-17","_exclude_shift_id":"b1640000-0000-4000-8000-000000000007"}')->>'conflict_severity','block','approved leave is a hard block for the assignment');
select throws_ok($$select public.prepare_weekly_schedule_assignment(actor,w,pg_temp.shift('{"scheduled_date":"2035-01-17"}')||jsonb_build_object('availability_assessment_fingerprint',public.assess_weekly_shift_availability(w,emp,pg_temp.shift('{"scheduled_date":"2035-01-17","_exclude_shift_id":"b1640000-0000-4000-8000-000000000007"}')-'id')->>'fingerprint'),null) from f$$,'23514',null,'a manager cannot confirm an assignment over approved leave');

-- Publish the same canonical findings and recheck newly introduced hard rules.
update public.employee_profiles set is_excluded_from_schedule=false where workspace_id=(select w from f);
update public.workspace_scheduling_settings set minimum_rest_minutes=0 where workspace_id=(select w from f);
create temp table pub as select (public.save_schedule_edit_session_service(f.actor,f.w,e.id,e.revision,'BL064 publish',null,null)->>'id')::uuid draft, null::jsonb preview
 from f join public.schedule_edit_sessions e on e.id=(select id from editor);
insert into public.schedule_draft_shifts(id,workspace_id,draft_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select 'b1640000-0000-4000-8000-000000000020',w,(select draft from pub),loc,null,job,typ,'2035-01-16','09:00','17:00','explicit','America/Los_Angeles' from f;
create function pg_temp.preflight() returns jsonb language sql as $$
 select public.preview_schedule_publication_service(actor,w,draft,array[loc],null,true) from f,pub;
$$;
create function pg_temp.publish() returns jsonb language sql as $$
 select public.publish_schedule_draft_service(actor,w,draft,array[loc],null,true,d.revision,p.preview->>'fingerprint',
  (select coalesce(jsonb_agg(jsonb_build_object('finding_id',finding->>'id')),'[]') from jsonb_array_elements(p.preview->'findings') finding where finding->>'severity'='soft'))
 from f,pub p join public.schedule_drafts d on d.id=p.draft;
$$;
update pub set preview=pg_temp.preflight();
select is((select preview->'findings'->0->>'conflict_severity' from pub),'confirm','unassigned closure is included in publish recap');
select lives_ok($$select pg_temp.publish()$$,'publish confirms business rules with finding IDs only');
select is((select reason from public.schedule_publication_overrides where workspace_id=(select w from f) and finding_code='schedule_conflict' limit 1),'Schedule conflict confirmed by manager.','business conflict publish records automatic actor decision');
select is(pg_temp.preflight()->'findings'->0->>'availability_state','accepted','previously confirmed unassigned closure stays in accepted recap');
update public.workspace_scheduling_settings set conflict_rules=jsonb_set(conflict_rules,'{closed_location}','"block"') where workspace_id=(select w from f);
update pub set preview=pg_temp.preflight();
select is((select preview->>'status' from pub),'hard_blocked','a new hard rule overrides a previous publication acceptance');
select throws_ok($$select pg_temp.publish()$$,'23514',null,'final publish cannot bypass the newly hard closure');
update public.workspace_scheduling_settings set conflict_rules=jsonb_set(conflict_rules,'{closed_location}','"confirm"') where workspace_id=(select w from f);
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone)
 select 'T00008', 'b1640000-0000-4000-8000-000000000021',w,'Other','2 Test','Test','CA','90001','America/Los_Angeles' from f;
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
 select w,emp,'b1640000-0000-4000-8000-000000000021',actor from f;
update public.schedule_draft_shifts set location_id='b1640000-0000-4000-8000-000000000021' where id=(select shift from f) and draft_id=(select draft from pub);
-- A draft publishes only the locations its edits held; this one now holds both.
update public.schedule_drafts set location_ids=location_ids||'{b1640000-0000-4000-8000-000000000021}'::uuid[] where id=(select draft from pub);
select is((select public.preview_schedule_publication_service(actor,w,draft,array['b1640000-0000-4000-8000-000000000021'::uuid],null,true)->>'status' from f,pub),'hard_blocked','publishing only the moved-to location detects retained original-location overlap');
select is((select public.preview_schedule_publication_service(actor,w,draft,array[loc,'b1640000-0000-4000-8000-000000000021'::uuid],null,true)->>'status' from f,pub),'publish_ready','publishing both locations replaces the old assignment instead of self-overlapping');
-- FB-6.1.6 (T5): leave approved after the draft was saved blocks its publication.
insert into public.schedule_draft_shifts(id,workspace_id,draft_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
 select 'b1640000-0000-4000-8000-000000000032',w,(select draft from pub),loc,emp,job,typ,'2035-01-18','09:00','17:00','explicit','America/Los_Angeles' from f;
select tests.approved_leave(w,emp,actor,loc,'2035-01-18','12:00','13:00','b1640000-0000-4000-8000-000000000033') from f;
update pub set preview=(select public.preview_schedule_publication_service(actor,w,draft,array[loc,'b1640000-0000-4000-8000-000000000021'::uuid],null,true) from f);
select is((select preview->>'status' from pub),'hard_blocked','a draft shift over approved leave is a hard block at publish');
select throws_ok($$select public.publish_schedule_draft_service(actor,w,draft,array[loc,'b1640000-0000-4000-8000-000000000021'::uuid],null,true,d.revision,p.preview->>'fingerprint',
  (select coalesce(jsonb_agg(jsonb_build_object('finding_id',finding->>'id')),'[]') from jsonb_array_elements(p.preview->'findings') finding where finding->>'severity' in ('soft','hard')))
 from f,pub p join public.schedule_drafts d on d.id=p.draft$$,'23514',null,'publish cannot confirm past approved leave');
select * from finish();
rollback;
