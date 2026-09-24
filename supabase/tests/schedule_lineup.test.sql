begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('95000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase6a-manager@example.test','','{}','{}',now(),now()),
('95000000-0000-4000-8000-000000000002','00000000-0000-0000-8000-000000000000','authenticated','authenticated','phase6a-employee@example.test','','{}','{}',now(),now());
insert into public.user_profiles(user_id,display_name) values
('95000000-0000-4000-8000-000000000001','Phase 6A Manager'),('95000000-0000-4000-8000-000000000002','Phase 6A Employee');
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations) values
('95100000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','95000000-0000-4000-8000-000000000001','manager','active',false),
('95100000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','95000000-0000-4000-8000-000000000002','employee','active',true);
select tests.works_at('95100000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001');

set local role authenticated;
select throws_ok($$select * from public.schedule_lineup_sections$$,'42501',null,'sections deny authenticated table reads');
select throws_ok($$select * from public.schedule_lineups$$,'42501',null,'line-ups deny authenticated table reads');
select throws_ok($$select * from public.schedule_lineup_entries$$,'42501',null,'entries deny authenticated table reads');
select throws_ok($$select * from public.schedule_lineup_briefs$$,'42501',null,'briefs deny authenticated table reads');
select throws_ok($$select * from public.schedule_lineup_snapshots$$,'42501',null,'snapshots deny authenticated table reads');
reset role;

select is((select count(distinct (r.system_key, p.permission_key))::integer from public.workspace_role_permissions p join public.workspace_roles r on r.id=p.role_id where r.system_key in('owner','admin','manager') and p.permission_key like 'schedule.lineup.%'),9,'manager roles receive all Line-up capabilities');
select is((select count(*)::integer from public.workspace_role_permissions p join public.workspace_roles r on r.id=p.role_id where r.system_key='employee' and p.permission_key like 'schedule.lineup.%'),0,'employee receives no Line-up capability');
select is((select count(*)::integer from public.schedule_lineup_sections where workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'),3,'workspace receives default sections');

create temp table phase6a_state(model jsonb,saved jsonb,brief jsonb,preview jsonb,shared jsonb,section jsonb);
insert into phase6a_state(model) values(public.get_schedule_lineup_service('95000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date-(extract(isodow from current_date)::integer-1),array['11000000-0000-4000-8000-000000000001'::uuid],null));
select is(jsonb_array_length(model->'locations'),1,'read model honors manager location scope') from phase6a_state;
select is(model->'locations'->0->>'name','Main Dining','read model returns requested location') from phase6a_state;
select is(jsonb_array_length(model->'locations'->0->'entries'),1,'published schedule is canonical source') from phase6a_state;
select is(jsonb_array_length(model->'employees'),4,'staff picker returns active employee directory') from phase6a_state;
select throws_ok($$select public.get_schedule_lineup_service('95000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date,array['11000000-0000-4000-8000-000000000002'::uuid],null)$$,'42501','schedule line-up scope denied','manager cannot read another location');
select throws_ok($$select public.get_schedule_lineup_service('95000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date,null,null)$$,'42501','schedule line-up read access denied','employee cannot read manager Line-up');

update phase6a_state set saved=public.upsert_schedule_lineup_entry_service('95000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001',current_date-(extract(isodow from current_date)::integer-1),null,null,
 jsonb_build_object('source_shift_id','22000000-0000-4000-8000-000000000001','employee_id','15000000-0000-4000-8000-000000000002','job_id','13000000-0000-4000-8000-000000000002','shift_type_id','14000000-0000-4000-8000-000000000001','start_time','09:00','end_time','17:00','section_id',(select id from public.schedule_lineup_sections where name='Floor' limit 1),'station','Patio','call_off',false,'hidden',false,'display_order',2));
select is(saved->>'status','saved','published row overlay saves') from phase6a_state;
select is((select public.get_schedule_lineup_service('95000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date-(extract(isodow from current_date)::integer-1),array['11000000-0000-4000-8000-000000000001'::uuid],null)->'locations'->0->'entries'->0->>'station'),'Patio','overlay changes operational station') from phase6a_state;
select throws_ok(format($$select public.upsert_schedule_lineup_entry_service('95000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001',current_date-(extract(isodow from current_date)::integer-1),%L,99,'{}')$$,(select saved->>'entry_id' from phase6a_state)),'40001','stale schedule line-up entry','stale overlay update fails');

update phase6a_state set brief=public.upsert_schedule_lineup_brief_service('95000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001',current_date-(extract(isodow from current_date)::integer-1),'14000000-0000-4000-8000-000000000001',null,'{"out_of_stock":"Salmon","specials":"Soup","pre_shift_notes":"Doors at ten"}');
select is(brief->>'status','saved','service brief saves') from phase6a_state;
select is((select count(*)::integer from public.schedule_lineup_briefs),1,'service brief persists once');

update phase6a_state s set saved=public.upsert_schedule_lineup_entry_service('95000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001',current_date-(extract(isodow from current_date)::integer-1),(s.saved->>'entry_id')::uuid,1,
 jsonb_build_object('source_shift_id','22000000-0000-4000-8000-000000000001','employee_id','15000000-0000-4000-8000-000000000002','job_id','13000000-0000-4000-8000-000000000002','shift_type_id','14000000-0000-4000-8000-000000000001','start_time','09:00','end_time','17:00','section_id',(select id from public.schedule_lineup_sections where name='Floor' limit 1),'station','Patio','call_off',true,'hidden',false,'display_order',2));
update phase6a_state set preview=public.preview_schedule_lineup_share_service('95000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date-(extract(isodow from current_date)::integer-1),array['11000000-0000-4000-8000-000000000001'::uuid]);
select is(preview->>'status','share_ready','share preview is explicit') from phase6a_state;
select is(length(preview->>'fingerprint'),64,'share preview is fingerprinted') from phase6a_state;
select is((preview->'locations'->0->>'entry_count')::integer,0,'share preview excludes called-off rows') from phase6a_state;
update phase6a_state s set shared=public.share_schedule_lineup_service('95000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date-(extract(isodow from current_date)::integer-1),array['11000000-0000-4000-8000-000000000001'::uuid],s.preview->>'fingerprint');
select is(shared->>'status','shared','reviewed Line-up shares') from phase6a_state;
select is((select count(*)::integer from public.schedule_lineup_snapshots),1,'share creates immutable snapshot');
update phase6a_state set preview=public.preview_schedule_lineup_share_service('95000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date-(extract(isodow from current_date)::integer-1),array['11000000-0000-4000-8000-000000000001'::uuid]);
select is((preview->'locations'->0->>'added')::integer,0,'unchanged share has no added rows') from phase6a_state;
select is((preview->'locations'->0->>'updated')::integer,0,'unchanged share has no updated rows') from phase6a_state;
select is((preview->'locations'->0->>'removed')::integer,0,'unchanged share has no removed rows') from phase6a_state;
delete from public.schedule_published_shifts where id='22000000-0000-4000-8000-000000000001';
select is((select public.get_schedule_lineup_service('95000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date-(extract(isodow from current_date)::integer-1),array['11000000-0000-4000-8000-000000000001'::uuid],null)->'locations'->0->'entries'->0->>'orphaned'),'true','removed source shift remains an explicit orphan review row');
update phase6a_state set section=public.upsert_schedule_lineup_section_service('95000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',null,null,'{"name":"Host stand","color":"#336699","sort_order":30}');
select is(section->>'name','Host stand','section catalog creates a section') from phase6a_state;
select is((section->>'revision')::integer,1,'new section starts at revision one') from phase6a_state;
update phase6a_state s set section=public.upsert_schedule_lineup_section_service('95000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(s.section->>'id')::uuid,1,'{"name":"Welcome desk","color":"#224466","sort_order":5}');
select is((section->>'revision')::integer,2,'section update increments revision') from phase6a_state;
select throws_ok(format($$select public.upsert_schedule_lineup_section_service('95000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',%L,1,'{"name":"Stale","color":"#224466","sort_order":5}')$$,(select section->>'id' from phase6a_state)),'40001','stale schedule line-up section','stale section update fails');
select is((select public.archive_schedule_lineup_section_service('95000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select section->>'id' from phase6a_state)::uuid,2)->>'status'),'archived','section archives by revision');
select is((select count(*)::integer from public.schedule_lineup_sections where workspace_id='6ea5d512-bc7f-4cf3-aad4-2f0815de00fd' and archived_at is null),3,'archived section leaves default active catalog intact');
set local role authenticated;
select throws_ok($$update public.schedule_lineup_snapshots set content='{}'$$,'42501',null,'authenticated clients cannot mutate snapshots');
reset role;

select * from finish();
rollback;
