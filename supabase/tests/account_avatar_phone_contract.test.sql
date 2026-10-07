begin;
create extension if not exists pgtap with schema extensions;
select plan(21);
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
insert into public.user_profiles(user_id,display_name) values ('75000000-0000-4000-8000-000000000001','Test Person');
select public.initialize_employee_onboarding_service('75000000-0000-4000-8000-000000000001');
select is(public.save_employee_onboarding_profile_service('75000000-0000-4000-8000-000000000001',
 '{"legal_first_name":"Test","legal_last_name":"Person","phone":"4155550123","emergency_contact_name":"Example","emergency_contact_relationship":"Friend","emergency_contact_phone":"4155550100"}'::jsonb,1),2,
 'workspace phone is accepted independently');
-- BL-335 / KK-7: the account is the phone's only source; the record copies it.
select is((select phone_e164 from public.user_profiles where user_id='75000000-0000-4000-8000-000000000001'),'+14155550123','an account without an E.164 phone takes the onboarding number');
select is((select phone from public.employee_private_profiles where employee_id='75000000-0000-4000-8000-000000000301'),'+14155550123','the record carries the account phone');
-- BL-969: a phone is a US number in E.164 in the data, whichever way it is typed.
select is((select emergency_contact_phone from public.employee_private_profiles where employee_id='75000000-0000-4000-8000-000000000301'),
 '+14155550100','the emergency phone typed without +1 is kept in E.164');
select is(app_private.account_phone_e164('(415) 555-0100'),'+14155550100','a US number typed any way becomes E.164');
select is(app_private.account_phone_e164('+1 415 555 0100'),'+14155550100','with its +1 too');
select throws_ok($$select app_private.account_phone_e164('+44 20 7946 0958')$$,'22023',null,'a number from outside the US is refused');
select throws_ok($$select app_private.account_phone_e164('(015) 555-0100')$$,'22023',null,'no US area code starts with 0 or 1');
select throws_ok($$update public.user_profiles set phone_e164='+442079460958' where user_id='75000000-0000-4000-8000-000000000001'$$,
 '23514',null,'the account keeps only a US number');
select throws_ok($$update public.employee_private_profiles set phone='+442079460958' where employee_id='75000000-0000-4000-8000-000000000301'$$,
 '23514',null,'the record keeps only a US number');
select throws_ok($$update public.employee_private_profiles set emergency_contact_phone='4155550100' where employee_id='75000000-0000-4000-8000-000000000301'$$,
 '23514',null,'the emergency phone is stored only in E.164');
select lives_ok($$select public.save_own_employment_contact_service('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000101',
 '75000000-0000-4000-8000-000000000301','Example','Friend','3105550101')$$,'the own emergency contact takes a US number typed without +1');
select is((select emergency_contact_phone from public.employee_private_profiles where employee_id='75000000-0000-4000-8000-000000000301'),
 '+13105550101','and keeps it in E.164');
update public.user_profiles set phone_e164='+13105550123' where user_id='75000000-0000-4000-8000-000000000001';
select is((select phone from public.employee_private_profiles where employee_id='75000000-0000-4000-8000-000000000301'),'+13105550123','a later account phone edit reaches the record');
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
