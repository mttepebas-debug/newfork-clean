begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('75000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','avatar-self@example.test','','{}','{}',now(),now()),
 ('75000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','avatar-other@example.test','','{}','{}',now(),now());
insert into public.workspaces(id,name,created_by) values
 ('75000000-0000-4000-8000-000000000101','Avatar contract','75000000-0000-4000-8000-000000000001');
select public.initialize_workspace_roles('75000000-0000-4000-8000-000000000101');
insert into public.workspace_memberships(id,workspace_id,user_id,role,status) values
 ('75000000-0000-4000-8000-000000000201','75000000-0000-4000-8000-000000000101','75000000-0000-4000-8000-000000000001','owner','active');
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,invitation_email,created_by) values
 ('75000000-0000-4000-8000-000000000301','75000000-0000-4000-8000-000000000101','75000000-0000-4000-8000-000000000001','E-7501','Test','Person','avatar-self@example.test','75000000-0000-4000-8000-000000000001');
insert into public.user_profiles(user_id,display_name,phone) values ('75000000-0000-4000-8000-000000000001','Test Person','3105559999');
select public.initialize_employee_onboarding_service('75000000-0000-4000-8000-000000000001');
select is(public.save_employee_onboarding_profile_service('75000000-0000-4000-8000-000000000001',
 '{"legal_first_name":"Test","legal_last_name":"Person","phone":"4155550123","emergency_contact_name":"Example","emergency_contact_relationship":"Friend","emergency_contact_phone":"4155550100"}'::jsonb,1),2,
 'workspace phone is accepted independently');
select is((select phone from public.employee_private_profiles where employee_id='75000000-0000-4000-8000-000000000301'),'4155550123','account phone never overrides submitted workspace phone');
select is((select phone from public.user_profiles where user_id='75000000-0000-4000-8000-000000000001'),'3105559999','workspace save never changes global phone');
update public.user_profiles set phone='3105550123' where user_id='75000000-0000-4000-8000-000000000001';
select is((select phone from public.employee_private_profiles where employee_id='75000000-0000-4000-8000-000000000301'),'4155550123','later global phone edit leaves workspace phone unchanged');
update public.employee_private_profiles set avatar_object_path='75000000-0000-4000-8000-000000000101/75000000-0000-4000-8000-000000000301/75000000-0000-4000-8000-000000000401.png' where employee_id='75000000-0000-4000-8000-000000000301';
select is(public.get_own_employee_avatar_path_service('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000101'),
 '75000000-0000-4000-8000-000000000101/75000000-0000-4000-8000-000000000301/75000000-0000-4000-8000-000000000401.png','self photo projection returns only own tenant path');
select throws_ok($$select public.get_own_employee_avatar_path_service('75000000-0000-4000-8000-000000000002','75000000-0000-4000-8000-000000000101')$$,'P0002','workspace unavailable','outsider cannot read avatar');
select ok(not has_function_privilege('authenticated','public.get_own_employee_avatar_path_service(uuid,uuid)','EXECUTE'),'client cannot spoof actor');
select ok(not has_function_privilege('anon','public.get_own_employee_avatar_path_service(uuid,uuid)','EXECUTE'),'anonymous cannot call service');
update public.employee_private_profiles set avatar_object_path='75000000-0000-4000-8000-000000000102/75000000-0000-4000-8000-000000000301/75000000-0000-4000-8000-000000000401.png' where employee_id='75000000-0000-4000-8000-000000000301';
select is(public.get_own_employee_avatar_path_service('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000101'),null,'mismatched tenant path is never signed');
update public.employee_private_profiles set avatar_object_path=null where employee_id='75000000-0000-4000-8000-000000000301';
select is(public.get_own_employee_avatar_path_service('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000101'),null,'removed workspace photo allows global fallback');
update public.workspaces set lifecycle_status='deleted', closed_at=now(), closed_by='75000000-0000-4000-8000-000000000001' where id='75000000-0000-4000-8000-000000000101';
select throws_ok($$select public.get_own_employee_avatar_path_service('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000101')$$,'P0002','workspace unavailable','closed workspace does not expose avatar');
select * from finish();
rollback;
