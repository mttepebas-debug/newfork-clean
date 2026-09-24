begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create temp table ar_state as select '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'::uuid w,
 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'::uuid actor,'11000000-0000-4000-8000-000000000001'::uuid loc,
 '13000000-0000-4000-8000-000000000001'::uuid job,'ae910000-0000-4000-8000-000000000001'::uuid emp,
 'ae920000-0000-4000-8000-000000000001'::uuid shift,'ae930000-0000-4000-8000-000000000001'::uuid typ,
 current_date-extract(isodow from current_date)::integer+1+1470 week,
 (select jsonb_agg(jsonb_build_object('day',d,'mode','unrestricted','windows','[]'::jsonb)) from generate_series(0,6) d) all_hours,
 (select jsonb_agg(jsonb_build_object('day',d,'mode','windows','windows','[{"start":"18:00","end":"24:00"}]'::jsonb)) from generate_series(0,6) d) evenings,
 null::uuid session,null::uuid draft,null::jsonb payload,null::jsonb preview,null::jsonb snapshot;
insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by)
select emp,w,'E-993490','Read','Availability',actor from ar_state;
-- No location assignment yet: these independent historical pattern fixtures do
-- not change a published location's employee availability.
insert into public.employee_schedule_availability_versions(id,workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until,kind)
select 'ae940000-0000-4000-8000-000000000001',w,emp,1,'UTC',all_hours,'employee',actor,current_date-14,null,'weekly' from ar_state;
insert into public.employee_schedule_availability_versions(id,workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until,kind)
select 'ae940000-0000-4000-8000-000000000002',w,emp,2,'UTC',evenings,'employee',actor,current_date-7,current_date+7,'temporary' from ar_state;
insert into public.employee_schedule_availability_versions(id,workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until,kind)
select 'ae940000-0000-4000-8000-000000000003',w,emp,3,'UTC',all_hours,'employee',actor,current_date-1,null,'weekly' from ar_state;
select is((public.availability_version_for_calendar(emp,current_date)).version_number,2,'calendar keeps a temporary pattern above a newer weekly baseline') from ar_state;
select is((public.availability_version_at_instant(emp,now())).version_number,2,'current instant uses temporary precedence') from ar_state;
select is(public.availability_read_service(actor,w,emp)->'current'->>'revision','2','employee/manager panel current pattern matches canonical precedence') from ar_state;
select is(public.availability_read_service(actor,w,emp)->'latest'->>'revision','3','latest revision remains available for optimistic concurrency') from ar_state;
select is(public.availability_rules_for_date(emp,current_date),evenings,'calendar rules use the temporary pattern') from ar_state;
select is((public.availability_version_for_calendar(emp,current_date+8)).version_number,3,'temporary expiry reveals the newer weekly baseline') from ar_state;
insert into public.employee_schedule_availability_versions(id,workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until,kind,replace_version_ids)
select 'ae940000-0000-4000-8000-000000000004',w,emp,4,'UTC',all_hours,'employee',actor,current_date,current_date+1,'weekly',array['ae940000-0000-4000-8000-000000000002'::uuid] from ar_state;
select is((public.availability_version_for_calendar(emp,current_date)).version_number,4,'explicit replacement wins only during its dates') from ar_state;
select is((public.availability_version_for_calendar(emp,current_date+2)).version_number,2,'old temporary pattern resumes outside the replacement dates') from ar_state;
select is(public.availability_read_service(actor,w,emp)->'current'->'replace_version_ids','["ae940000-0000-4000-8000-000000000002"]'::jsonb,'read contract retains replacement provenance') from ar_state;
select is((public.availability_version_at_instant(emp,((current_date+2)+time '00:00') at time zone 'UTC')).version_number,2,'replacement expires at its calendar midnight') from ar_state;
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until,kind)
select w,emp,5,'Pacific/Honolulu',evenings,'employee',actor,current_date+20,current_date+21,'temporary' from ar_state;
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until,kind)
select w,emp,6,'UTC',all_hours,'employee',actor,current_date+20,null,'weekly' from ar_state;
select is((public.availability_version_at_instant(emp,((current_date+20)+time '08:00') at time zone 'UTC')).version_number,6,'a different timezone does not activate the temporary pattern before its own midnight') from ar_state;
select is((public.availability_version_at_instant(emp,((current_date+20)+time '10:00') at time zone 'UTC')).version_number,5,'the temporary pattern starts at its own timezone boundary despite a newer weekly revision') from ar_state;

insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by) select w,emp,loc,true,actor from ar_state;
insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by) select w,emp,job,true,actor from ar_state;
insert into public.shift_types(id,workspace_id,name,color,default_start_time,default_end_time) select typ,w,'Read Lunch','#123456','12:00','16:00' from ar_state;
update ar_state set session=(public.acquire_schedule_edit_session_service(actor,w,week,'blank',null)->'session'->>'id')::uuid;
update ar_state set payload=public.normalize_schedule_time_source(w,jsonb_build_object('location_id',loc,'employee_id',emp,'job_id',job,'shift_type_id',typ,'scheduled_date',week,'time_basis','type_default','hide_time_on_badge',true,'note',''));
select public.mutate_schedule_edit_shift_service(actor,w,session,1,'create',shift,null,payload,gen_random_uuid()) from ar_state;
update ar_state s set draft=(public.save_schedule_edit_session_service(actor,w,session,e.revision,'Availability read fixture',null,null)->>'id')::uuid from public.schedule_edit_sessions e where e.id=s.session;
create function pg_temp.ar_conflicts() returns jsonb language sql as $$ select public.list_schedule_draft_availability_conflicts_service(actor,w,draft,week) from ar_state; $$;
create function pg_temp.ar_week(use_draft boolean default true) returns jsonb language sql as $$ select public.list_schedule_weekly_shifts_service(actor,w,week,array[loc],case when use_draft then ar_state.draft end,false) from ar_state; $$;
select is(jsonb_array_length(pg_temp.ar_conflicts()->'conflicts'),0,'fully covered draft has no availability conflict');
select is(pg_temp.ar_week()->'shifts'->0->>'time_basis','type_default','weekly read retains the saved reference-time source');
select is(pg_temp.ar_week()->'shifts'->0->'availability_assessment'->>'coverage','full','weekly read uses canonical physical coverage');
update ar_state set snapshot=pg_temp.ar_conflicts();
insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until,kind)
select w,emp,7,'America/Los_Angeles',evenings,'employee',actor,week,week+6,'temporary' from ar_state;
update public.workspace_scheduling_settings set availability_enforcement='soft' where workspace_id=(select w from ar_state);
select is(jsonb_array_length(pg_temp.ar_conflicts()->'conflicts'),1,'future temporary hours produce a draft conflict using the evaluated date');
select is(pg_temp.ar_conflicts()->'conflicts'->0->'assessment'->>'operation','warning_requires_override','draft conflict carries the policy operation');
select is(pg_temp.ar_conflicts()->'conflicts'->0->'assessment'->'unavailable_intervals',public.assess_shift_availability(w,emp,payload||jsonb_build_object('id',shift))->'unavailable_intervals','draft conflict includes exact physical unavailable pieces') from ar_state;
select isnt(pg_temp.ar_conflicts()->>'fingerprint',snapshot->>'fingerprint','source changes invalidate the conflict fingerprint') from ar_state;
select is(pg_temp.ar_week()->'shifts'->0->'warning_codes','["availability"]'::jsonb,'weekly warning agrees with canonical draft conflict');
select ok(not (pg_temp.ar_week()->'shifts'->0->'availability_assessment' ?| array['sources','leave','pending']),'read projection does not expose internal source or leave rows');

insert into public.schedule_draft_shifts(id,workspace_id,draft_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,time_basis)
select 'ae920000-0000-4000-8000-000000000002',w,draft,loc,emp,job,typ,week+1,'unresolved' from ar_state;
select is(jsonb_array_length(pg_temp.ar_conflicts()->'conflicts'),2,'unresolved hours appear as a verification requirement, not an available person');
select is(pg_temp.ar_conflicts()->'conflicts'->1->'assessment'->>'operation','verification_required','unresolved named shift uses the explicit unknown state');
select is(pg_temp.ar_conflicts()->'conflicts'->1->'start_time','null'::jsonb,'unresolved conflict does not invent midnight');
delete from public.schedule_draft_shifts where id='ae920000-0000-4000-8000-000000000002';

update ar_state set preview=public.preview_schedule_publication_service(actor,w,draft,array[loc]);
select lives_ok($$select public.publish_schedule_draft_service(s.actor,s.w,s.draft,array[s.loc],d.revision,s.preview->>'fingerprint',
 (select jsonb_agg(jsonb_build_object('finding_id',f->>'id','reason','Employee confirmed this exact lunch assignment.')) from jsonb_array_elements(s.preview->'findings') f))
 from ar_state s join public.schedule_drafts d on d.id=s.draft$$,'reviewed publication creates an immutable capacity snapshot');
update public.workspace_scheduling_settings set availability_enforcement='hard' where workspace_id=(select w from ar_state);
select is(pg_temp.ar_week(false)->'shifts'->0->'availability_assessment'->>'operation','allowed','published read retains the accepted responsibility after a policy change');
select is(pg_temp.ar_week(false)->'shifts'->0->>'availability_responsibility_retained','true','published read explicitly identifies retained responsibility');
select is(pg_temp.ar_week(false)->'shifts'->0->'warning_codes','[]'::jsonb,'published read does not create a retroactive availability warning');
select is(jsonb_array_length(pg_temp.ar_conflicts()->'conflicts'),0,'unchanged published assignment in a draft is not retroactively re-assessed');
select is((public.get_schedule_read_model_availability_v2_service(actor,w,week)->'shifts'->0->>'availability_responsibility_retained'),'true','main Schedule read retains publication evidence too') from ar_state;
select ok(exists(select 1 from jsonb_array_elements(public.get_schedule_read_model_availability_v2_service(actor,w,week)->'employees') e,
 jsonb_array_elements(e->'availability_versions') v where e->>'id'=emp::text and v->>'kind'='temporary' and v ? 'id' and v ? 'replace_version_ids'),'Schedule patterns retain precedence metadata') from ar_state;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('ae960000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','availability-read-scope@example.test','','{}','{}',now(),now());
insert into public.workspace_roles(id,workspace_id,name,access_class)
select 'ae960000-0000-4000-8000-000000000002',w,'Availability read scope','manager' from ar_state;
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key)
select w,'ae960000-0000-4000-8000-000000000002',permission from ar_state,unnest(array['workspace.read','schedule.read','schedule.manage']) permission;
insert into public.workspace_memberships(id,workspace_id,user_id,role,role_id,status,all_locations)
select 'ae960000-0000-4000-8000-000000000003',w,'ae960000-0000-4000-8000-000000000001','manager','ae960000-0000-4000-8000-000000000002','active',false from ar_state;
select tests.works_at('ae960000-0000-4000-8000-000000000003', loc) from ar_state;
insert into public.schedule_draft_shifts(id,workspace_id,draft_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,time_basis)
select 'ae920000-0000-4000-8000-000000000003',w,draft,'11000000-0000-4000-8000-000000000002',emp,job,typ,week+2,'unresolved' from ar_state;
select is(jsonb_array_length(pg_temp.ar_conflicts()->'conflicts'),1,'owner sees the unresolved assignment in the second location');
select is(jsonb_array_length(public.list_schedule_draft_availability_conflicts_service('ae960000-0000-4000-8000-000000000001',w,draft,week)->'conflicts'),0,'scoped manager cannot read another location through the conflict endpoint') from ar_state;
select is(jsonb_array_length(public.list_schedule_weekly_shifts_service('ae960000-0000-4000-8000-000000000001',w,week,null,draft,false)->'shifts'),1,'weekly enrichment preserves existing location filters') from ar_state;
set local role authenticated;
select throws_ok($$select public.schedule_availability_enrich_read(null,null,'{}')$$,'42501',null,'untrusted clients cannot call the enrichment helper');
reset role;
select ok(not has_function_privilege('service_role','public.availability_version_at_instant(uuid,timestamptz)','execute'),'private unscoped version selector is not exposed');
select * from finish();
rollback;
