begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('98000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hub-alex@example.test','','{}','{}',now(),now()),
('98000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hub-jordan@example.test','','{}','{}',now(),now()),
('98000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hub-no-profile@example.test','','{}','{}',now(),now());
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations) values
('98100000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','98000000-0000-4000-8000-000000000001','employee','active',true),
('98100000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','98000000-0000-4000-8000-000000000002','employee','active',true),
('98100000-0000-4000-8000-000000000003','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','98000000-0000-4000-8000-000000000003','employee','active',true);
update public.employee_profiles set user_id='98000000-0000-4000-8000-000000000001' where id='15000000-0000-4000-8000-000000000001';
update public.employee_profiles set user_id='98000000-0000-4000-8000-000000000002' where id='15000000-0000-4000-8000-000000000002';

set local role authenticated;
select throws_ok($$select * from public.schedule_published_shifts$$,'42501',null,'employee cannot read published shift tables directly');
select throws_ok($$select public.get_employee_hub_service('98000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date,current_date+14)$$,'42501',null,'authenticated role cannot invoke service RPC directly');
reset role;

select throws_ok($$select public.get_employee_hub_service('98000000-0000-4000-8000-000000000003','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date,current_date+14)$$,'42501','employee profile required','active membership without employee profile fails closed');

create temp table hub_state(model jsonb,result jsonb,request_id uuid);
insert into hub_state(model) values(public.get_employee_hub_service('98000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date-(extract(isodow from current_date)::integer-1),current_date+42));
select is(model->'employee'->>'id','15000000-0000-4000-8000-000000000001','read model resolves actor employee server-side') from hub_state;
select is(jsonb_array_length(model->'shifts'),2,'read model returns only actor published shifts') from hub_state;
select is(jsonb_array_length(model->'open_shifts'),1,'read model exposes open shifts at assigned locations') from hub_state;
select is((select count(*)::integer from jsonb_array_elements(model->'team') teammate where teammate->>'display_name'='Jordy Lee'),1,'team includes employees at shared locations') from hub_state;
select is((select count(*)::integer from jsonb_array_elements(model->'team') teammate where teammate->>'display_name'='Sam Rivera'),0,'team excludes employees only at other locations') from hub_state;

select is((public.save_employee_hub_availability_service('98000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','America/Los_Angeles','[{"day":0,"mode":"unrestricted","windows":[]},{"day":1,"mode":"unrestricted","windows":[]},{"day":2,"mode":"unrestricted","windows":[]},{"day":3,"mode":"unrestricted","windows":[]},{"day":4,"mode":"unrestricted","windows":[]},{"day":5,"mode":"unavailable","windows":[]},{"day":6,"mode":"unavailable","windows":[]}]')->>'revision')::integer,2,'employee availability appends a new version');
select is((select source from public.employee_schedule_availability_versions where employee_id='15000000-0000-4000-8000-000000000001' order by version_number desc limit 1),'employee','availability records employee source');
select throws_ok($$select public.submit_employee_time_off_service('98000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000002','Other location',array[current_date+10])$$,'42501','employee location access denied','time off rejects an unassigned location');
update hub_state set result=public.submit_employee_time_off_service('98000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','Personal',array[current_date+10,current_date+11]);
update hub_state set request_id=(result->>'request_id')::uuid;
select is(result->>'status','pending','time off submission creates a pending request') from hub_state;
select is((select count(*)::integer from public.schedule_time_off_segments segment join hub_state state on state.request_id=segment.request_id),2,'time off submission stores immutable date segments');
select throws_ok($$select public.submit_employee_time_off_service('98000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','Overlap',array[current_date+10])$$,'23514','overlapping time off request exists','overlapping request is rejected');
select is((public.employee_request_action_service('98000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select request_id from hub_state),'time_off','cancel',1)->>'status'),'cancelled','employee can cancel own pending time off');

update hub_state set result=public.submit_employee_shift_request_service('98000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','pickup','22000000-0000-4000-8000-000000000005');
select is(result->>'status','pending_manager_approval','open shift pickup enters manager approval') from hub_state;
select is((select participant_role::text from public.schedule_shift_change_participants participant join hub_state state on participant.request_id=(state.result->>'request_id')::uuid where participant.employee_id='15000000-0000-4000-8000-000000000001' and participant.participant_role='receiver'),'receiver','pickup derives receiver from actor profile') from hub_state;

update hub_state set result=public.submit_employee_shift_request_service('98000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','swap','22000000-0000-4000-8000-000000000004','22000000-0000-4000-8000-000000000002');
update hub_state set request_id=(result->>'request_id')::uuid;
select is(result->>'status','awaiting_teammate','swap waits for receiving employee') from hub_state;
select is((public.get_shift_change_conflicts_service((select request_id from hub_state))->0->>'code'),'participant_acceptance','unaccepted swap is a hard manager conflict');
select throws_ok($$select public.resolve_schedule_shift_change_request_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select request_id from hub_state),1,'approve')$$,'23514','hard shift conflict blocks approval','manager cannot bypass teammate acceptance');
select is((public.employee_request_action_service('98000000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select request_id from hub_state),'shift_change','accept',1)->>'status'),'pending_manager_approval','receiving employee can accept swap');
select is(jsonb_array_length(public.get_shift_change_conflicts_service((select request_id from hub_state))),0,'accepted valid swap clears manager conflicts');
select is((public.resolve_schedule_shift_change_request_service('d9f43e62-e099-48e1-bc6f-a5aabe8e87d5','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select request_id from hub_state),2,'approve')->>'status'),'approved','manager can approve accepted swap');

select * from finish();
rollback;
