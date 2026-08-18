begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('97000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase6b-manager@example.test','','{}','{}',now(),now()),
('97000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase6b-employee@example.test','','{}','{}',now(),now());
insert into public.user_profiles(user_id,display_name) values
('97000000-0000-4000-8000-000000000001','Phase 6B Manager'),('97000000-0000-4000-8000-000000000002','Phase 6B Employee');
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations) values
('97100000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','97000000-0000-4000-8000-000000000001','manager','active',false),
('97100000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','97000000-0000-4000-8000-000000000002','employee','active',true);
insert into public.membership_location_scopes(membership_id,workspace_id,location_id) values
('97100000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001');

set local role authenticated;
select throws_ok($$select * from public.schedule_time_off_requests$$,'42501',null,'time off requests deny authenticated reads');
select throws_ok($$select * from public.schedule_time_off_segments$$,'42501',null,'time off segments deny authenticated reads');
select throws_ok($$select * from public.schedule_time_off_events$$,'42501',null,'time off events deny authenticated reads');
select throws_ok($$select * from public.schedule_shift_change_requests$$,'42501',null,'shift requests deny authenticated reads');
select throws_ok($$select * from public.schedule_shift_change_participants$$,'42501',null,'shift participants deny authenticated reads');
select throws_ok($$select * from public.schedule_shift_change_events$$,'42501',null,'shift events deny authenticated reads');
reset role;

select is((select count(*)::integer from public.workspace_role_permissions p join public.workspace_roles r on r.id=p.role_id where r.system_key in('owner','admin','manager') and p.permission_key in('schedule.time_off_requests.read','schedule.time_off_requests.manage','schedule.shift_change_requests.read','schedule.shift_change_requests.manage')),12,'manager classes receive four request capabilities');
select is((select count(*)::integer from public.workspace_role_permissions p join public.workspace_roles r on r.id=p.role_id where r.system_key='employee' and p.permission_key like 'schedule.%requests.%'),0,'employee receives no manager request capability');

insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,reason,created_by) values
('97200000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Family appointment','97000000-0000-4000-8000-000000000002'),
('97200000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','15000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000002','Garden request','97000000-0000-4000-8000-000000000002');
insert into public.schedule_time_off_segments(id,workspace_id,request_id,segment_date) values
('97300000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','97200000-0000-4000-8000-000000000001',current_date-(extract(isodow from current_date)::integer-1)),
('97300000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','97200000-0000-4000-8000-000000000001',current_date-(extract(isodow from current_date)::integer-1)+1),
('97300000-0000-4000-8000-000000000003','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','97200000-0000-4000-8000-000000000002',current_date);
insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note) values
('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','97200000-0000-4000-8000-000000000001','submitted','97000000-0000-4000-8000-000000000002','Family appointment');

create temp table phase6b_state(model jsonb,result jsonb);
insert into phase6b_state(model) values(public.get_schedule_requests_service('97000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'));
select is(model->>'workspace_id','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','request model is workspace scoped') from phase6b_state;
select is((model->>'time_off_pending_count')::integer,1,'pending count honors location scope') from phase6b_state;
select is(jsonb_array_length(model->'time_off_requests'),1,'queue excludes inaccessible location') from phase6b_state;
select is(model->'time_off_requests'->0->>'employee_name','Alex Kim','queue returns employee identity') from phase6b_state;
select is(jsonb_array_length(model->'time_off_requests'->0->'segments'),2,'queue returns immutable request segments') from phase6b_state;
select throws_ok($$select public.get_schedule_requests_service('97000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','needs_review','needs_review','11000000-0000-4000-8000-000000000002')$$,'42501','schedule request scope denied','manager cannot query another location');
select throws_ok($$select public.get_schedule_requests_service('97000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')$$,'42501','schedule request read access denied','employee cannot read manager queues');

select is((public.mark_schedule_time_off_viewed_service('97000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','97200000-0000-4000-8000-000000000001')->>'status'),'viewed','opening request records viewed state');
select is((select count(*)::integer from public.schedule_time_off_events where request_id='97200000-0000-4000-8000-000000000001' and action='viewed'),1,'viewed audit is recorded once');
select lives_ok($$select public.mark_schedule_time_off_viewed_service('97000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','97200000-0000-4000-8000-000000000001')$$,'repeat viewing is idempotent');
select is((select count(*)::integer from public.schedule_time_off_events where request_id='97200000-0000-4000-8000-000000000001' and action='viewed'),1,'repeat viewing does not duplicate audit');

update phase6b_state set result=public.resolve_schedule_time_off_request_service('97000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','97200000-0000-4000-8000-000000000001',1,'partial_approve','First day approved',jsonb_build_array(jsonb_build_object('segment_id','97300000-0000-4000-8000-000000000001','status','approved'),jsonb_build_object('segment_id','97300000-0000-4000-8000-000000000002','status','denied')));
select is(result->>'status','partially_approved','mixed segment decisions create partial approval') from phase6b_state;
select is((result->>'revision')::integer,2,'time off decision increments revision') from phase6b_state;
select is((select count(*)::integer from public.schedule_time_off_segments where request_id='97200000-0000-4000-8000-000000000001' and status='approved'),1,'partial approval persists approved segment');
select throws_ok($$select public.resolve_schedule_time_off_request_service('97000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','97200000-0000-4000-8000-000000000001',1,'revoke')$$,'40001','stale time off request','stale time off transition fails');
select is((public.resolve_schedule_time_off_request_service('97000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','97200000-0000-4000-8000-000000000001',2,'return_to_pending')->>'status'),'pending','closed request returns to pending');
select is((select count(*)::integer from public.schedule_time_off_segments where request_id='97200000-0000-4000-8000-000000000001' and status='pending'),2,'return resets segment decisions');

insert into public.schedule_shift_change_requests(id,workspace_id,request_type,offered_shift_id,expected_offered_employee_id,note,created_by) values
('97400000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','direct_coverage','22000000-0000-4000-8000-000000000005',null,'Sam offered coverage','97000000-0000-4000-8000-000000000002');
insert into public.schedule_shift_change_participants(workspace_id,request_id,employee_id,participant_role) values
('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','97400000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000003','requester'),
('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','97400000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000003','receiver');
insert into public.schedule_shift_change_events(workspace_id,request_id,action,actor_user_id) values
('6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','97400000-0000-4000-8000-000000000001','submitted','97000000-0000-4000-8000-000000000002');
select is((select public.get_shift_change_conflicts_service('97400000-0000-4000-8000-000000000001')->0->>'severity'),'soft','missing location assignment is a soft conflict');
select throws_ok($$select public.resolve_schedule_shift_change_request_service('97000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','97400000-0000-4000-8000-000000000001',1,'approve','short')$$,'23514','soft conflict override note required','soft conflict requires manager reason');
select is((public.resolve_schedule_shift_change_request_service('97000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','97400000-0000-4000-8000-000000000001',1,'approve','Approved for cross-location coverage')->>'status'),'approved','reasoned soft conflict can be approved');
select is((select employee_id::text from public.schedule_published_shifts where id='22000000-0000-4000-8000-000000000005'),'15000000-0000-4000-8000-000000000003','approval changes published shift owner atomically');
select is((select count(*)::integer from public.schedule_shift_change_events where request_id='97400000-0000-4000-8000-000000000001' and action='approved'),1,'shift approval records domain event');
select throws_ok($$select public.resolve_schedule_shift_change_request_service('97000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','97400000-0000-4000-8000-000000000001',1,'reject')$$,'40001','stale shift change request','resolved shift request cannot transition again');

select * from finish();
rollback;
