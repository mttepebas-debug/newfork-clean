begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- One account onboarding in two workspaces: an older approved case (w1) and an
-- open case (w2). w3 is unrelated to the account.
insert into auth.users(id, email, email_confirmed_at) values
('a6600000-0000-4000-8000-000000000001', 'multi-owner@example.test', now()),
('a6600000-0000-4000-8000-000000000002', 'multi-employee@example.test', now());
insert into public.workspaces(id, name, created_by) values
('a6600000-0000-4000-8000-000000000101', 'Multi One', 'a6600000-0000-4000-8000-000000000001'),
('a6600000-0000-4000-8000-000000000102', 'Multi Two', 'a6600000-0000-4000-8000-000000000001'),
('a6600000-0000-4000-8000-000000000103', 'Multi Three', 'a6600000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(id, workspace_id, user_id, role, status, created_at) values
('a6600000-0000-4000-8000-000000000201', 'a6600000-0000-4000-8000-000000000101', 'a6600000-0000-4000-8000-000000000002', 'employee', 'active', now() - interval '2 days'),
('a6600000-0000-4000-8000-000000000202', 'a6600000-0000-4000-8000-000000000102', 'a6600000-0000-4000-8000-000000000002', 'employee', 'pending_activation', now() - interval '1 day');
insert into public.employee_profiles(id, workspace_id, user_id, employee_code, first_name, last_name, created_by) values
('a6600000-0000-4000-8000-000000000301', 'a6600000-0000-4000-8000-000000000101', 'a6600000-0000-4000-8000-000000000002', 'E-6601', 'Multi', 'Employee', 'a6600000-0000-4000-8000-000000000001'),
('a6600000-0000-4000-8000-000000000302', 'a6600000-0000-4000-8000-000000000102', 'a6600000-0000-4000-8000-000000000002', 'E-6602', 'Multi', 'Employee', 'a6600000-0000-4000-8000-000000000001');
insert into public.employee_onboarding_cases(id, workspace_id, employee_id, membership_id, created_at) values
('a6600000-0000-4000-8000-000000000401', 'a6600000-0000-4000-8000-000000000101', 'a6600000-0000-4000-8000-000000000301', 'a6600000-0000-4000-8000-000000000201', now() - interval '2 days'),
('a6600000-0000-4000-8000-000000000402', 'a6600000-0000-4000-8000-000000000102', 'a6600000-0000-4000-8000-000000000302', 'a6600000-0000-4000-8000-000000000202', now() - interval '1 day');
update public.employee_onboarding_cases set status = 'approved', approved_at = now(), approved_by = 'a6600000-0000-4000-8000-000000000001' where id = 'a6600000-0000-4000-8000-000000000401';

create temp table w1_before on commit drop as
select revision from public.employee_onboarding_cases where id = 'a6600000-0000-4000-8000-000000000401';
grant select on w1_before to service_role;

set local role service_role;
select is((public.get_employee_onboarding_service('a6600000-0000-4000-8000-000000000002', 'a6600000-0000-4000-8000-000000000101')->>'case_id')::uuid,
  'a6600000-0000-4000-8000-000000000401'::uuid, 'explicit workspace opens that workspace case even when approved');
select is((public.get_employee_onboarding_service('a6600000-0000-4000-8000-000000000002', 'a6600000-0000-4000-8000-000000000102')->>'case_id')::uuid,
  'a6600000-0000-4000-8000-000000000402'::uuid, 'explicit workspace opens the second workspace case');
select is((public.get_employee_onboarding_service('a6600000-0000-4000-8000-000000000002')->>'case_id')::uuid,
  'a6600000-0000-4000-8000-000000000402'::uuid, 'default selection prefers the open case over the older approved one');
select throws_ok($q$select public.get_employee_onboarding_service('a6600000-0000-4000-8000-000000000002', 'a6600000-0000-4000-8000-000000000103')$q$,
  '42501', 'Not allowed', 'unrelated workspace is unavailable');
select is((select count(*)::int from pg_proc where oid::regprocedure::text like 'get_employee_onboarding_service(%'), 1, 'getter has a single signature');
select is((select count(*)::int from pg_proc where proname in ('save_employee_onboarding_profile_service', 'submit_employee_onboarding_service', 'leave_employee_onboarding_service')), 3, 'mutations have a single signature each');

select lives_ok($q$select public.save_employee_onboarding_profile_service(
  'a6600000-0000-4000-8000-000000000002',
  '{"legal_first_name":"Multi","legal_last_name":"Employee","phone":"+14155550100","emergency_contact_name":"Friend","emergency_contact_relationship":"Friend","emergency_contact_phone":"+14155550101"}'::jsonb,
  (select revision from public.employee_onboarding_cases where id = 'a6600000-0000-4000-8000-000000000402'),
  'a6600000-0000-4000-8000-000000000102')$q$, 'save writes the requested workspace case');
select is((select legal_first_name from public.employee_private_profiles where employee_id = 'a6600000-0000-4000-8000-000000000302'), 'Multi', 'profile saved for the second workspace employee');
select ok(not exists(select 1 from public.employee_private_profiles where employee_id = 'a6600000-0000-4000-8000-000000000301'), 'first workspace profile untouched');

select lives_ok($q$select public.submit_employee_onboarding_service(
  'a6600000-0000-4000-8000-000000000002',
  (select revision from public.employee_onboarding_cases where id = 'a6600000-0000-4000-8000-000000000402'),
  'a6600000-0000-4000-8000-000000000102')$q$, 'submit targets the requested workspace case');
select isnt((select status::text from public.employee_onboarding_cases where id = 'a6600000-0000-4000-8000-000000000402'), 'in_progress', 'second workspace case moved past in_progress');
select is((select revision from public.employee_onboarding_cases where id = 'a6600000-0000-4000-8000-000000000401'), (select revision from w1_before), 'first workspace case revision unchanged');

select throws_ok($q$select public.leave_employee_onboarding_service(
  'a6600000-0000-4000-8000-000000000002',
  (select revision from public.employee_onboarding_cases where id = 'a6600000-0000-4000-8000-000000000401'),
  'a6600000-0000-4000-8000-000000000101')$q$, '23514', 'active employees cannot leave onboarding', 'leave checks the requested workspace membership');

reset role;
select ok(not has_function_privilege('authenticated', 'public.get_employee_onboarding_service(uuid,uuid)', 'EXECUTE'), 'authenticated cannot call the getter');
select ok(not has_function_privilege('anon', 'public.submit_employee_onboarding_service(uuid,integer,uuid)', 'EXECUTE'), 'anon cannot call submit');
select ok(has_function_privilege('service_role', 'public.leave_employee_onboarding_service(uuid,integer,uuid)', 'EXECUTE'), 'service role can call leave');
select ok(not has_function_privilege('service_role', 'app_private.employee_onboarding_case_id(uuid,uuid)', 'EXECUTE'), 'case helper is internal');
select * from finish();
rollback;
