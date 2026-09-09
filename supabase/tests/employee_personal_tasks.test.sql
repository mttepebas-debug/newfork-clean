begin;
create extension if not exists pgtap with schema extensions;
select plan(14);
insert into auth.users(id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
('b7100000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hub-task-one@example.test','{}','{}',now(),now()),
('b7100000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hub-task-two@example.test','{}','{}',now(),now());
insert into public.workspace_memberships(id,workspace_id,user_id,role,status,all_locations) values
('b7200000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','b7100000-0000-4000-8000-000000000001','employee','active',true),
('b7200000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','b7100000-0000-4000-8000-000000000002','employee','active',true);
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,preferred_name,invitation_email,created_by) values
('b7300000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','b7100000-0000-4000-8000-000000000001','E-9791','Task','One','','hub-task-one@example.test','b7100000-0000-4000-8000-000000000001'),
('b7300000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','b7100000-0000-4000-8000-000000000002','E-9792','Task','Two','','hub-task-two@example.test','b7100000-0000-4000-8000-000000000002');
set local role anon;
select throws_ok($$select * from public.employee_personal_tasks$$,'42501',null,'anon cannot read personal reminders');
reset role;
set local role authenticated;
select throws_ok($$select * from public.employee_personal_tasks$$,'42501',null,'authenticated cannot read another employee through the data API');
select throws_ok($$select public.employee_personal_tasks_service('b7100000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')$$,'42501',null,'authenticated cannot impersonate an actor through RPC');
reset role;
set local role service_role;
select is(jsonb_array_length(public.employee_personal_tasks_service('b7100000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','create','b7400000-0000-4000-8000-000000000001','Notebook')),1,'owner can create');
select is(jsonb_array_length(public.employee_personal_tasks_service('b7100000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','create','b7400000-0000-4000-8000-000000000001','Notebook')),1,'retry is idempotent');
select is(jsonb_array_length(public.employee_personal_tasks_service('b7100000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')),0,'another employee sees no reminders');
select throws_ok($$select public.employee_personal_tasks_service('b7100000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','complete','b7400000-0000-4000-8000-000000000001')$$,'P0001','Task not found','another employee cannot complete a reminder');
select throws_ok($$select public.employee_personal_tasks_service('b7100000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','create','b7400000-0000-4000-8000-000000000001','Steal')$$,'P0001','Task not found','creation cannot take over another users reminder');
select throws_ok($$select public.employee_personal_tasks_service('b7100000-0000-4000-8000-000000000001','7ea5d512-bc7f-4cf3-aad4-2f0815de00fd')$$,'42501',null,'cross-workspace reads denied');
select is(public.employee_personal_tasks_service('b7100000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','complete','b7400000-0000-4000-8000-000000000001')->0->>'completed','true','owner can complete');
select is(public.employee_personal_tasks_service('b7100000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','reopen','b7400000-0000-4000-8000-000000000001')->0->>'completed','false','owner can undo completion');
select is(jsonb_array_length(public.employee_personal_tasks_service('b7100000-0000-4000-8000-000000000002','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd','delete','b7400000-0000-4000-8000-000000000001')),0,'other employee deletion reveals nothing');
select is(jsonb_array_length(public.employee_personal_tasks_service('b7100000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')),1,'other employee deletion leaves original intact');
reset role;
update public.workspace_memberships set status='suspended' where id='b7200000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($$select public.employee_personal_tasks_service('b7100000-0000-4000-8000-000000000001','6ea5d512-bc7f-4cf3-aad4-2f0815de00fd')$$,'42501',null,'suspension immediately revokes access');
reset role;
select * from finish();
rollback;

