begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('94000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase5d-manager@example.test','','{}','{}',now(),now()),
('94000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase5d-employee@example.test','','{}','{}',now(),now());
insert into public.user_profiles(user_id,display_name) values
('94000000-0000-4000-8000-000000000001','Phase 5D Manager'),('94000000-0000-4000-8000-000000000002','Phase 5D Employee');
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations) values
('94100000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','94000000-0000-4000-8000-000000000001','manager','active',false),
('94100000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','94000000-0000-4000-8000-000000000002','employee','active',true);
insert into public.membership_location_scopes(membership_id,workspace_id,location_id) values
('94100000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001');

set local role authenticated;
select throws_ok($$select * from public.schedule_templates$$,'42501',null,'templates deny authenticated table reads');
select throws_ok($$select * from public.schedule_template_shifts$$,'42501',null,'template shifts deny authenticated table reads');
select throws_ok($$select * from public.schedule_export_presets$$,'42501',null,'export presets deny authenticated table reads');
select throws_ok($$select * from public.schedule_template_events$$,'42501',null,'template events deny authenticated table reads');
reset role;

select is((select count(distinct (r.system_key, p.permission_key))::integer from public.workspace_role_permissions p join public.workspace_roles r on r.id=p.role_id where r.system_key in('owner','admin','manager') and p.permission_key in('schedule.templates.manage','schedule.export')),6,'manager roles receive Phase 5D capabilities');
select is((select count(*)::integer from public.workspace_role_permissions p join public.workspace_roles r on r.id=p.role_id where r.system_key='employee' and p.permission_key in('schedule.templates.manage','schedule.export')),0,'employee receives no Phase 5D capability');

insert into public.schedule_drafts(id,workspace_id,week_start,name,revision,created_by,updated_by) values
('94200000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date-(extract(isodow from current_date)::integer-1),'Phase 5D source',1,'d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','d9f43e62-e099-48e1-bc6f-a5aabe8e87d5');
insert into public.schedule_draft_shifts(id,workspace_id,draft_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,note,revision) values
('94300000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','94200000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001',current_date-(extract(isodow from current_date)::integer-1),'09:00','17:00','Opening',1),
('94300000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','94200000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',null,'13000000-0000-4000-8000-000000000001',null,current_date-(extract(isodow from current_date)::integer-1)+1,'10:00','14:00','Open slot',1);

create temp table phase5d_state(template jsonb,assigned_template jsonb,acquired jsonb,applied jsonb,autofill jsonb,autofill_applied jsonb,exported jsonb,preset jsonb);
update phase5d_state set template=null;
insert into phase5d_state(template) values(public.create_schedule_template_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','94200000-0000-4000-8000-000000000001','Standard week',true));
select is(template->'template'->>'name','Standard week','template creates from named draft') from phase5d_state;
select is((template->'template'->>'shift_count')::integer,2,'template captures every source shift') from phase5d_state;
select is((template->'template'->>'open_slot_count')::integer,2,'assignment stripping creates open slots') from phase5d_state;
select is((select jsonb_array_length(public.list_schedule_templates_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'templates')),1,'template list returns accessible template');
select is((select max((x->>'day_offset')::integer) from phase5d_state,jsonb_array_elements(template->'shifts') x),1,'template stores relative day offsets');
select is((select count(*)::integer from public.schedule_template_events where action='created'),1,'template creation is audited');
select throws_ok(format($$select public.rename_schedule_template_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',%L,'Stale',99)$$,(select template->'template'->>'id' from phase5d_state)),'40001','schedule template revision stale','stale template rename fails');
update phase5d_state s set template=public.rename_schedule_template_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(s.template->'template'->>'id')::uuid,'Opening pattern',1);
select is((template->'template'->>'revision')::integer,2,'template rename increments revision') from phase5d_state;
update phase5d_state set assigned_template=public.create_schedule_template_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','94200000-0000-4000-8000-000000000001','Assigned pattern',false);
select is((assigned_template->'template'->>'open_slot_count')::integer,1,'template may preserve employee assignments') from phase5d_state;
select is(public.delete_schedule_template_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(assigned_template->'template'->>'id')::uuid,1)->>'status','deleted','template deletes by revision') from phase5d_state;
select is((select count(*)::integer from public.schedule_template_events where action='deleted'),1,'template deletion is audited');

update phase5d_state set acquired=public.acquire_schedule_edit_session_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date-(extract(isodow from current_date)::integer-1),'blank',null);
select is(acquired->>'status','acquired','blank edit session acquired for template apply') from phase5d_state;
update phase5d_state s set applied=public.apply_schedule_template_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(s.acquired->'session'->>'id')::uuid,(s.acquired->'session'->>'revision')::integer,(s.template->'template'->>'id')::uuid,'overwrite');
select is(applied->>'status','applied','template applies to active edit lease') from phase5d_state;
select is((applied->>'applied_shift_count')::integer,2,'template apply copies both shifts atomically') from phase5d_state;
select is(jsonb_array_length(applied->'session'->'shifts'),2,'applied session returns complete snapshot') from phase5d_state;
select is((select count(*)::integer from jsonb_array_elements(applied->'session'->'shifts') x where x->>'employee_id' is null),2,'stripped template remains open after apply') from phase5d_state;
select is((select count(*)::integer from public.schedule_template_events where action='applied'),1,'template application is audited');
select throws_ok(format($$select public.apply_schedule_template_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',%L,1,%L,'merge')$$,(select acquired->'session'->>'id' from phase5d_state),(select template->'template'->>'id' from phase5d_state)),'40001','session revision stale','template apply rejects stale edit revision');

update phase5d_state s set autofill=public.preview_schedule_auto_fill_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(s.applied->'session'->>'id')::uuid);
select is(autofill->>'status','review_ready','auto-fill produces review') from phase5d_state;
select ok(jsonb_array_length(autofill->'proposals')>0,'auto-fill proposes eligible employees') from phase5d_state;
select is(autofill->'proposals'->0->>'recommended_employee_id','15000000-0000-4000-8000-000000000001','auto-fill recommendation is deterministic') from phase5d_state;
select ok(jsonb_array_length(autofill->'proposals'->0->'candidates')>0,'auto-fill exposes review candidates') from phase5d_state;
select throws_ok(format($$select public.apply_schedule_auto_fill_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',%L,%s,%L,'[]')$$,(select autofill->>'session_id' from phase5d_state),(select autofill->>'session_revision' from phase5d_state),repeat('f',64)),'40001','stale auto-fill preview','auto-fill rejects stale fingerprint');
update phase5d_state s set autofill_applied=public.apply_schedule_auto_fill_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(s.autofill->>'session_id')::uuid,(s.autofill->>'session_revision')::integer,s.autofill->>'fingerprint',
 (select jsonb_agg(jsonb_build_object('shift_id',p->>'shift_id','employee_id',p->>'recommended_employee_id')) from jsonb_array_elements(s.autofill->'proposals') p));
select ok(jsonb_array_length(autofill_applied->'applied')>0,'reviewed auto-fill assignments apply') from phase5d_state;
select is((select count(*)::integer from jsonb_array_elements(autofill_applied->'session'->'shifts') x where x->>'employee_id' is not null),jsonb_array_length(autofill_applied->'applied'),'session reflects applied auto-fill assignments') from phase5d_state;

update phase5d_state set exported=public.preview_schedule_export_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date-(extract(isodow from current_date)::integer-1),'published',null,array['11000000-0000-4000-8000-000000000001'::uuid]);
select is(exported->>'status','export_ready','published schedule export previews') from phase5d_state;
select is(jsonb_array_length(exported->'rows'),5,'published export is location scoped') from phase5d_state;
select ok(not exists(select 1 from phase5d_state,jsonb_array_elements(exported->'rows') x where x->>'location_name'<>'Main Dining'),'export rows do not leak another location');
select is(jsonb_array_length(public.preview_schedule_export_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date-(extract(isodow from current_date)::integer-1),'draft','94200000-0000-4000-8000-000000000001',array['11000000-0000-4000-8000-000000000001'::uuid])->'rows'),2,'named draft export preserves source rows');
select throws_ok($$select public.preview_schedule_export_service('94000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date-(extract(isodow from current_date)::integer-1),'published',null,array['11000000-0000-4000-8000-000000000002'::uuid])$$,'42501','schedule export scope denied','manager cannot export another location');

update phase5d_state set preset=public.create_schedule_export_preset_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','Wall chart','{"format":"print","layout":"weekly","time_format":"12h","include_unassigned":true,"include_notes":false,"include_scheduled_hours":true,"csv_delimiter":","}');
select is(preset->>'name','Wall chart','export preset creates') from phase5d_state;
select is(jsonb_array_length(public.list_schedule_export_presets_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'presets'),1,'export preset lists for creator') from phase5d_state;
select is(public.delete_schedule_export_preset_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(preset->>'id')::uuid)->>'status','deleted','export preset deletes') from phase5d_state;
select is(jsonb_array_length(public.list_schedule_export_presets_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')->'presets'),0,'deleted preset disappears') from phase5d_state;
select throws_ok($$select public.create_schedule_template_service('94000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','94200000-0000-4000-8000-000000000001','Denied',true)$$,'42501','schedule template access denied','employee cannot create template');
select throws_ok($$select public.preview_schedule_export_service('94000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date-(extract(isodow from current_date)::integer-1),'published',null,array['11000000-0000-4000-8000-000000000001'::uuid])$$,'42501','schedule export scope denied','employee cannot export manager schedule');

select * from finish();
rollback;
