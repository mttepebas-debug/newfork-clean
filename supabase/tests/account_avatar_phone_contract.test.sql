begin;
create extension if not exists pgtap with schema extensions;
select plan(28);
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('75000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','avatar-self@example.test','','{}','{}',now(),now()),
 ('75000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','avatar-other@example.test','','{}','{}',now(),now());
insert into public.workspaces(id,name,created_by) values
 ('75000000-0000-4000-8000-000000000101','Avatar contract','75000000-0000-4000-8000-000000000001');
select public.initialize_workspace_roles('75000000-0000-4000-8000-000000000101');
insert into public.workspace_memberships (id, workspace_id, user_id, status, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
 ('75000000-0000-4000-8000-000000000201','75000000-0000-4000-8000-000000000101','75000000-0000-4000-8000-000000000001','owner','active')) as legacy(id, workspace_id, user_id, role, status);
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,invitation_email,created_by) values
 ('75000000-0000-4000-8000-000000000301','75000000-0000-4000-8000-000000000101','75000000-0000-4000-8000-000000000001','E-7501','Test','Person','avatar-self@example.test','75000000-0000-4000-8000-000000000001');
-- The owner membership above opened the account row (KK-179 (2)); this names it.
insert into public.user_profiles(user_id,display_name) values ('75000000-0000-4000-8000-000000000001','Test Person')
on conflict (user_id) do update set display_name = excluded.display_name;
select public.initialize_employee_onboarding_service('75000000-0000-4000-8000-000000000001');
select is(public.save_employee_onboarding_profile_service('75000000-0000-4000-8000-000000000001',
 '{"legal_first_name":"Test","legal_last_name":"Person","phone":"4155550123","emergency_contact_name":"Example","emergency_contact_relationship":"Friend","emergency_contact_phone":"+14155550100"}'::jsonb,1),2,
 'workspace phone is accepted independently');
-- BL-335 / KK-7: the account is the phone's only source; the record copies it.
select is((select phone_e164 from public.user_profiles where user_id='75000000-0000-4000-8000-000000000001'),'+14155550123','an account without an E.164 phone takes the onboarding number');
select is((select phone from public.employee_private_profiles where employee_id='75000000-0000-4000-8000-000000000301'),'+14155550123','the record carries the account phone');
-- BL-969: a phone is a US number in E.164 in the data. The account's number
-- is read the way the app reads it (toUsPhone; the same table is in
-- packages/shared/src/us-forms.test.ts).
select is(app_private.account_phone_e164('(415) 555-0100'), '+14155550100', 'reads ' || '(415) 555-0100' || ' as a US number');
select is(app_private.account_phone_e164('+1 (415) 555-0100'), '+14155550100', 'reads ' || '+1 (415) 555-0100' || ' as a US number');
select is(app_private.account_phone_e164('1-415-555-0100'), '+14155550100', 'reads ' || '1-415-555-0100' || ' as a US number');
select is(app_private.account_phone_e164('415.555.0100'), '+14155550100', 'reads ' || '415.555.0100' || ' as a US number');
select is(app_private.account_phone_e164(E'\t+1 415 555 0100'), '+14155550100', 'reads ' || E'\t+1 415 555 0100' || ' as a US number');
select is(app_private.account_phone_e164(U&'\FF0B1 415 555 0100'), '+14155550100', 'reads ' || U&'\FF0B1 415 555 0100' || ' as a US number');
select is(app_private.account_phone_e164(U&'\FF14\FF11\FF15\FF15\FF15\FF15\FF10\FF11\FF10\FF10'), '+14155550100', 'reads ' || U&'\FF14\FF11\FF15\FF15\FF15\FF15\FF10\FF11\FF10\FF10' || ' as a US number');
select is(app_private.account_phone_e164(U&'+\20282 415 555 010'), '+12415555010', 'reads a + before a line separator (U+2028) the way the app does: not a country code');
select throws_ok(format('select app_private.account_phone_e164(%L)', '+44 20 7946 0958'), '22023', 'that phone number cannot be dialled', 'refuses ' || '+44 20 7946 0958');
select throws_ok(format('select app_private.account_phone_e164(%L)', '(+44) 20 7946 0958'), '22023', 'that phone number cannot be dialled', 'refuses ' || '(+44) 20 7946 0958');
select throws_ok(format('select app_private.account_phone_e164(%L)', '+(44) 2079 4609'), '22023', 'that phone number cannot be dialled', 'refuses ' || '+(44) 2079 4609');
select throws_ok(format('select app_private.account_phone_e164(%L)', E'\t+32 2 123 45 67'), '22023', 'that phone number cannot be dialled', 'refuses ' || E'\t+32 2 123 45 67');
select throws_ok(format('select app_private.account_phone_e164(%L)', U&'\00A0+47 1234 5678'), '22023', 'that phone number cannot be dialled', 'refuses ' || U&'\00A0+47 1234 5678');
select throws_ok(format('select app_private.account_phone_e164(%L)', U&'\FF0B44 2079460958'), '22023', 'that phone number cannot be dialled', 'refuses ' || U&'\FF0B44 2079460958');
select throws_ok(format('select app_private.account_phone_e164(%L)', 'tel:+442079460958'), '22023', 'that phone number cannot be dialled', 'refuses ' || 'tel:+442079460958');
select throws_ok(format('select app_private.account_phone_e164(%L)', '(015) 555-0100'), '22023', 'that phone number cannot be dialled', 'refuses ' || '(015) 555-0100');
select throws_ok(format('select app_private.account_phone_e164(%L)', '555-0100'), '22023', 'that phone number cannot be dialled', 'refuses ' || '555-0100');
select throws_ok(format('select app_private.account_phone_e164(%L)', '4155550100 ext 12'), '22023', 'that phone number cannot be dialled', 'refuses ' || '4155550100 ext 12');
select is(app_private.account_phone_e164(''), null, 'an empty number is no number');
-- Named: the record's own CHECK would refuse the copied number too.
select throws_ok($$update public.user_profiles set phone_e164='+442079460958' where user_id='75000000-0000-4000-8000-000000000001'$$,
 '23514','new row for relation "user_profiles" violates check constraint "user_profiles_phone_e164_us_phone"',
 'the account keeps only a US number');
select throws_ok($$update public.employee_private_profiles set phone='+442079460958' where employee_id='75000000-0000-4000-8000-000000000301'$$,
 '23514',null,'the record keeps only a US number');
select throws_ok($$update public.employee_private_profiles set emergency_contact_phone='4155550100' where employee_id='75000000-0000-4000-8000-000000000301'$$,
 '23514',null,'the emergency phone is stored only in E.164');
select throws_ok($$select public.save_own_employment_contact_service('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000101',
 '75000000-0000-4000-8000-000000000301','Example','Friend','3105550101')$$,'23514',null,'the own emergency contact is kept only in E.164');
select lives_ok($$select public.save_own_employment_contact_service('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000101',
 '75000000-0000-4000-8000-000000000301','Example','Friend','+13105550101')$$,'and takes the number the API sends');
update public.user_profiles set phone_e164='+13105550123' where user_id='75000000-0000-4000-8000-000000000001';
select is((select phone from public.employee_private_profiles where employee_id='75000000-0000-4000-8000-000000000301'),'+13105550123','a later account phone edit reaches the record');
-- The workspace avatar moved to member_avatars (AVATAR-IKON); member_avatars.test.sql reads and writes it.
select * from finish();
rollback;
