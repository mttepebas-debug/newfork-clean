begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- BL-237: this file reads whatever the shared Meyhouse workspace's real data
-- already has published for "the current week" -- it never publishes
-- anything itself. `current_date`'s week only matches that real data on the
-- day someone last published it; every day after, the real week and
-- `current_date`'s week are different weeks and the read model comes back
-- empty. pg_temp.week_start() asks the real data which week it actually
-- published, instead of assuming it is this one.
create function pg_temp.week_start() returns date language sql stable as $$
  select coalesce(
    (select week_start from public.schedule_location_publications
     where workspace_id = '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd' and status = 'current'
     order by published_at desc limit 1),
    current_date - (extract(isodow from current_date)::integer - 1)
  )
$$;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('98000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hub-alex@example.test','','{}','{}',now(),now()),
('98000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hub-jordan@example.test','','{}','{}',now(),now()),
('98000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hub-no-profile@example.test','','{}','{}',now(),now());
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations) values
('98100000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','98000000-0000-4000-8000-000000000001','employee','active',true),
('98100000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','98000000-0000-4000-8000-000000000002','employee','active',true),
('98100000-0000-4000-8000-000000000003','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','98000000-0000-4000-8000-000000000003','employee','active',true);
insert into public.workspaces(id,name,created_by)
values ('99000000-0000-4000-8000-000000000001','Second Hub Workspace','98000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations)
values ('98100000-0000-4000-8000-000000000004','99000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000001','employee','active',true);
update public.employee_profiles set user_id='98000000-0000-4000-8000-000000000001' where id='15000000-0000-4000-8000-000000000001';
update public.employee_profiles set user_id='98000000-0000-4000-8000-000000000002' where id='15000000-0000-4000-8000-000000000002';
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,preferred_name,invitation_email,created_by)
values (
  '99000000-0000-4000-8000-000000000002',
  '99000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000001',
  'E-9901',
  'Alex',
  'Second',
  '',
  'hub-alex@example.test',
  '98000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select throws_ok($$select * from public.schedule_published_shifts$$,'42501',null,'employee cannot read published shift tables directly');
select throws_ok($$select public.get_employee_hub_service('98000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date,current_date+14)$$,'42501',null,'authenticated role cannot invoke service RPC directly');
reset role;

select throws_ok($$select public.get_employee_hub_service('98000000-0000-4000-8000-000000000003','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',current_date,current_date+14)$$,'42501','employee profile required','active membership without employee profile fails closed');

create temp table hub_state(model jsonb,result jsonb,request_id uuid);
insert into hub_state(model) values(public.get_employee_hub_service('98000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',pg_temp.week_start(),pg_temp.week_start()+42));
select is(model->'employee'->>'id','15000000-0000-4000-8000-000000000001','read model resolves actor employee server-side') from hub_state;
select is(jsonb_array_length(model->'shifts'),2,'read model returns only actor published shifts') from hub_state;
select is(jsonb_array_length(model->'open_shifts'),1,'read model exposes open shifts at assigned locations') from hub_state;
select is((select count(*)::integer from jsonb_array_elements(model->'team') teammate where teammate->>'display_name'='Jordan Lee'),1,'team includes employees at shared locations') from hub_state;
select is((select count(*)::integer from jsonb_array_elements(model->'team') teammate where teammate->>'display_name'='Sam Rivera'),0,'team excludes employees only at other locations') from hub_state;

select throws_ok($$select public.submit_employee_time_off_service('98000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000002','Other location',array[current_date+10])$$,'42501','employee location access denied','time off rejects an unassigned location');
update hub_state set result=public.submit_employee_time_off_service('98000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','Personal',array[current_date+10,current_date+11]);
update hub_state set request_id=(result->>'request_id')::uuid;
select is(result->>'status','pending','time off submission creates a pending request') from hub_state;
select is((select count(*)::integer from public.schedule_time_off_segments segment join hub_state state on state.request_id=segment.request_id),2,'time off submission stores immutable date segments');
select throws_ok($$select public.submit_employee_time_off_service('98000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','11000000-0000-4000-8000-000000000001','Overlap',array[current_date+10])$$,'23514','overlapping time off request exists','overlapping request is rejected');
select is((public.employee_request_action_service('98000000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd',(select request_id from hub_state),'time_off','cancel',1)->>'status'),'cancelled','employee can cancel own pending time off');

select * from finish();
rollback;
