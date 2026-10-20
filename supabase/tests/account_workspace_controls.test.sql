begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id, email, email_confirmed_at) values
('a5500000-0000-4000-8000-000000000001', 'gate2-1@example.test', now()),
('a5500000-0000-4000-8000-000000000002', 'gate2-2@example.test', now()),
('a5500000-0000-4000-8000-000000000003', 'gate2-3@example.test', now()),
('a5500000-0000-4000-8000-000000000004', 'gate2-4@example.test', now()),
('a5500000-0000-4000-8000-000000000005', 'gate2-5@example.test', now()),
('a5500000-0000-4000-8000-000000000006', 'gate2-6@example.test', null),
('a5500000-0000-4000-8000-000000000007', 'gate2-7@example.test', now()),
('a5500000-0000-4000-8000-000000000008', 'gate2-8@example.test', now());
insert into public.workspaces(id,name,created_by) values ('a5500000-0000-4000-8000-000000000101','Gate2 Workspace','a5500000-0000-4000-8000-000000000001'),('a5500000-0000-4000-8000-000000000102','Foreign Workspace','a5500000-0000-4000-8000-000000000008');
insert into public.workspace_memberships (id, workspace_id, user_id, status, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
('a5500000-0000-4000-8000-000000000201','a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000001','owner','active'),
('a5500000-0000-4000-8000-000000000202','a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000002','admin','active'),
('a5500000-0000-4000-8000-000000000203','a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000003','manager','active'),
('a5500000-0000-4000-8000-000000000204','a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000004','employee','active'),
('a5500000-0000-4000-8000-000000000205','a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000005','admin','active'),
('a5500000-0000-4000-8000-000000000206','a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000006','admin','active'),
('a5500000-0000-4000-8000-000000000207','a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000007','admin','suspended'),
('a5500000-0000-4000-8000-000000000208','a5500000-0000-4000-8000-000000000102','a5500000-0000-4000-8000-000000000008','owner','active')) as legacy(id, workspace_id, user_id, role, status);
-- The memberships above opened the account rows (KK-179 (2)); these name two of them.
insert into public.user_profiles(user_id, display_name) values ('a5500000-0000-4000-8000-000000000002','Eligible Admin'),('a5500000-0000-4000-8000-000000000005','Incomplete Admin')
on conflict (user_id) do update set display_name = excluded.display_name;
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
values ('a5500000-0000-4000-8000-000000000301','a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000005','E-9999','Incomplete','Admin','a5500000-0000-4000-8000-000000000001');
-- The eligible admin's onboarding filed a legal name; ownership only goes to
-- somebody with one on file (BL-080).
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
values ('a5500000-0000-4000-8000-000000000302','a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000002','E-9998','Eligible','Admin','a5500000-0000-4000-8000-000000000001');
insert into public.employee_private_profiles(employee_id,workspace_id,legal_first_name,legal_last_name)
values ('a5500000-0000-4000-8000-000000000302','a5500000-0000-4000-8000-000000000101','Eligible','Admin');
insert into public.employee_onboarding_cases(workspace_id,employee_id,membership_id)
values('a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000301','a5500000-0000-4000-8000-000000000205');
set local role service_role;
select throws_ok($q$select public.create_owner_workspace_service('a5500000-0000-4000-8000-000000000002','Denied')$q$,'42501','workspace owner access required','role 2 cannot create');
select throws_ok($q$select * from public.search_workspace_ownership_candidates_service('a5500000-0000-4000-8000-000000000002','a5500000-0000-4000-8000-000000000101','gate2')$q$,'42501','workspace owner access required','role 2 cannot search candidates');
select throws_ok($q$select public.create_owner_workspace_service('a5500000-0000-4000-8000-000000000003','Denied')$q$,'42501','workspace owner access required','role 3 cannot create');
select throws_ok($q$select * from public.search_workspace_ownership_candidates_service('a5500000-0000-4000-8000-000000000003','a5500000-0000-4000-8000-000000000101','gate2')$q$,'42501','workspace owner access required','role 3 cannot search candidates');
select throws_ok($q$select public.create_owner_workspace_service('a5500000-0000-4000-8000-000000000004','Denied')$q$,'42501','workspace owner access required','role 4 cannot create');
select throws_ok($q$select * from public.search_workspace_ownership_candidates_service('a5500000-0000-4000-8000-000000000004','a5500000-0000-4000-8000-000000000101','gate2')$q$,'42501','workspace owner access required','role 4 cannot search candidates');
select lives_ok($q$select public.create_owner_workspace_service('a5500000-0000-4000-8000-000000000001','Owner draft')$q$,'existing owner can create');
select throws_ok($q$select public.create_owner_workspace_service('a5500000-0000-4000-8000-000000000009','Missing user')$q$,'42501','authentication required','unknown user fails closed');
reset role;
insert into auth.users(id,email,email_confirmed_at) values('a5500000-0000-4000-8000-000000000009','new-gate2@example.test',now());
set local role service_role;
select lives_ok($q$select public.create_owner_workspace_service('a5500000-0000-4000-8000-000000000009','First workspace')$q$,'self signup first workspace preserved');
select throws_ok($q$select * from public.search_workspace_ownership_candidates_service('a5500000-0000-4000-8000-000000000001','a5500000-0000-4000-8000-000000000102','gate2')$q$,'42501','workspace owner access required','cross tenant search denied');
select throws_ok($q$select * from public.search_workspace_ownership_candidates_service('a5500000-0000-4000-8000-000000000001','a5500000-0000-4000-8000-000000000101','a')$q$,'22023','search must contain 2 to 80 characters','minimum query enforced');
select is((select count(*)::int from public.search_workspace_ownership_candidates_service('a5500000-0000-4000-8000-000000000001','a5500000-0000-4000-8000-000000000101','gate2')),1,'only active complete verified admin returned');
select is((select "userId" from public.search_workspace_ownership_candidates_service('a5500000-0000-4000-8000-000000000001','a5500000-0000-4000-8000-000000000101','Eligible')),'a5500000-0000-4000-8000-000000000002'::uuid,'name search returns eligible admin');
select is((select count(*)::int from public.search_workspace_ownership_candidates_service('a5500000-0000-4000-8000-000000000001','a5500000-0000-4000-8000-000000000101','%%')),0,'wildcards are literal');
select throws_ok($q$select public.initiate_workspace_ownership_transfer_service('a5500000-0000-4000-8000-000000000001','a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000003')$q$,'23514','ownership transfer target must be an active admin','ineligible target 3 denied');
select throws_ok($q$select public.initiate_workspace_ownership_transfer_service('a5500000-0000-4000-8000-000000000001','a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000004')$q$,'23514','ownership transfer target must be an active admin','ineligible target 4 denied');
select throws_ok($q$select public.initiate_workspace_ownership_transfer_service('a5500000-0000-4000-8000-000000000001','a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000005')$q$,'23514','ownership transfer target must have completed onboarding','ineligible target 5 denied');
select throws_ok($q$select public.initiate_workspace_ownership_transfer_service('a5500000-0000-4000-8000-000000000001','a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000006')$q$,'23514','ownership transfer target must have a verified email','ineligible target 6 denied');
select throws_ok($q$select public.initiate_workspace_ownership_transfer_service('a5500000-0000-4000-8000-000000000001','a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000007')$q$,'23514','ownership transfer target must be an active admin','ineligible target 7 denied');
select throws_ok($q$select public.initiate_workspace_ownership_transfer_service('a5500000-0000-4000-8000-000000000001','a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000008')$q$,'23514','ownership transfer target must be an active admin','ineligible target 8 denied');
select lives_ok($q$select public.initiate_workspace_ownership_transfer_service('a5500000-0000-4000-8000-000000000001','a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000002')$q$,'owner initiates eligible transfer');
select throws_ok($q$select public.cancel_workspace_ownership_transfer_service('a5500000-0000-4000-8000-000000000002','a5500000-0000-4000-8000-000000000101',(select id from public.workspace_ownership_transfers where workspace_id='a5500000-0000-4000-8000-000000000101' and status='pending'))$q$,'42501','workspace owner access required','non sender 2 cannot cancel');
select throws_ok($q$select public.cancel_workspace_ownership_transfer_service('a5500000-0000-4000-8000-000000000003','a5500000-0000-4000-8000-000000000101',(select id from public.workspace_ownership_transfers where workspace_id='a5500000-0000-4000-8000-000000000101' and status='pending'))$q$,'42501','workspace owner access required','non sender 3 cannot cancel');
select throws_ok($q$select public.cancel_workspace_ownership_transfer_service('a5500000-0000-4000-8000-000000000004','a5500000-0000-4000-8000-000000000101',(select id from public.workspace_ownership_transfers where workspace_id='a5500000-0000-4000-8000-000000000101' and status='pending'))$q$,'42501','workspace owner access required','non sender 4 cannot cancel');
select throws_ok($q$select public.cancel_workspace_ownership_transfer_service('a5500000-0000-4000-8000-000000000008','a5500000-0000-4000-8000-000000000101',(select id from public.workspace_ownership_transfers where workspace_id='a5500000-0000-4000-8000-000000000101' and status='pending'))$q$,'42501','workspace owner access required','non sender 8 cannot cancel');
reset role;
update public.workspace_ownership_transfers set expires_at=now()-interval '1 minute' where workspace_id='a5500000-0000-4000-8000-000000000101' and status='pending';
set local role service_role;
select ok((select pending_ownership_transfer_id is not null from public.list_my_workspaces_service('a5500000-0000-4000-8000-000000000001') where workspace_id='a5500000-0000-4000-8000-000000000101'),'sender can still see expired pending transfer to cancel');
select ok((select pending_ownership_transfer_id is null from public.list_my_workspaces_service('a5500000-0000-4000-8000-000000000002') where workspace_id='a5500000-0000-4000-8000-000000000101'),'target does not see expired acceptance banner');
select lives_ok($q$select public.cancel_workspace_ownership_transfer_service('a5500000-0000-4000-8000-000000000001','a5500000-0000-4000-8000-000000000101',(select id from public.workspace_ownership_transfers where workspace_id='a5500000-0000-4000-8000-000000000101' and status='pending'))$q$,'sender cancels pending transfer including expired requests');
reset role;
select is((select count(*)::int from public.audit_events where workspace_id='a5500000-0000-4000-8000-000000000101' and action='workspace.ownership_transfer.cancelled'),1,'cancel audited');
set local role service_role;
select throws_ok($q$select public.respond_workspace_ownership_transfer_service('a5500000-0000-4000-8000-000000000002','a5500000-0000-4000-8000-000000000101',(select id from public.workspace_ownership_transfers where workspace_id='a5500000-0000-4000-8000-000000000101' limit 1),'accept')$q$,'02000','pending ownership transfer not found','cancelled transfer cannot be accepted');
select lives_ok($q$select public.initiate_workspace_ownership_transfer_service('a5500000-0000-4000-8000-000000000001','a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000002')$q$,'can initiate after cancellation');
select lives_ok($q$select public.respond_workspace_ownership_transfer_service('a5500000-0000-4000-8000-000000000002','a5500000-0000-4000-8000-000000000101',(select id from public.workspace_ownership_transfers where workspace_id='a5500000-0000-4000-8000-000000000101' and status='pending'),'reject')$q$,'target rejects');
select lives_ok($q$select public.initiate_workspace_ownership_transfer_service('a5500000-0000-4000-8000-000000000001','a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000002')$q$,'can initiate after rejection');
reset role;
update auth.users set email_confirmed_at = null where id='a5500000-0000-4000-8000-000000000002';
set local role service_role;
select throws_ok($q$select public.respond_workspace_ownership_transfer_service('a5500000-0000-4000-8000-000000000002','a5500000-0000-4000-8000-000000000101',(select id from public.workspace_ownership_transfers where workspace_id='a5500000-0000-4000-8000-000000000101' and status='pending'),'accept')$q$,'42501','ownership transfer participants are no longer eligible','accept rechecks verified email');
reset role;
update auth.users set email_confirmed_at = now() where id='a5500000-0000-4000-8000-000000000002';
set local role service_role;
select lives_ok($q$select public.respond_workspace_ownership_transfer_service('a5500000-0000-4000-8000-000000000002','a5500000-0000-4000-8000-000000000101',(select id from public.workspace_ownership_transfers where workspace_id='a5500000-0000-4000-8000-000000000101' and status='pending'),'accept')$q$,'target accepts');
reset role;
select is((select coalesce((select r.access_class::text from public.workspace_roles r where r.id = role_id), 'employee') from public.workspace_memberships where id='a5500000-0000-4000-8000-000000000202'),'owner','target promoted');
select is((select coalesce((select r.access_class::text from public.workspace_roles r where r.id = role_id), 'employee') from public.workspace_memberships where id='a5500000-0000-4000-8000-000000000201'),'admin','sender demoted');
select ok(not has_function_privilege('anon','public.search_workspace_ownership_candidates_service(uuid,uuid,text)','EXECUTE'),'anon cannot call search RPC');
select ok(not has_function_privilege('anon','public.cancel_workspace_ownership_transfer_service(uuid,uuid,uuid)','EXECUTE'),'anon cannot call cancel RPC');
select ok(not has_function_privilege('anon','public.create_owner_workspace_service(uuid,text)','EXECUTE'),'anon cannot call create RPC');
select ok(not has_function_privilege('authenticated','public.search_workspace_ownership_candidates_service(uuid,uuid,text)','EXECUTE'),'authenticated cannot call search RPC');
select ok(not has_function_privilege('authenticated','public.cancel_workspace_ownership_transfer_service(uuid,uuid,uuid)','EXECUTE'),'authenticated cannot call cancel RPC');
select ok(not has_function_privilege('authenticated','public.create_owner_workspace_service(uuid,text)','EXECUTE'),'authenticated cannot call create RPC');
reset role;
select set_config('app.owner_transfer','on',true);
select set_config('request.jwt.claim.sub','a5500000-0000-4000-8000-000000000004',true);
-- As an application caller (service_role): the database owner's own console
-- is not guarded (BL-270).
create function tests.promote_to_owner(member_user uuid, w uuid) returns void language sql security definer set search_path = '' as $f$
  update public.workspace_memberships
  set role_id = (select r.id from public.workspace_roles r where r.workspace_id = w and r.system_key = 'owner')
  where user_id = member_user and workspace_id = w
$f$;
grant execute on function tests.promote_to_owner(uuid, uuid) to service_role;
set local role service_role;
select throws_ok($q$select tests.promote_to_owner('a5500000-0000-4000-8000-000000000004','a5500000-0000-4000-8000-000000000101')$q$,'42501','membership change is not permitted','transfer flag cannot promote unrelated employee');
reset role;
select set_config('request.jwt.claim.sub','',true);
insert into auth.users(id,email,email_confirmed_at) values
('a5500000-0000-4000-8000-000000000400','bounded-admin-0@example.test',now()),
('a5500000-0000-4000-8000-000000000401','bounded-admin-1@example.test',now()),
('a5500000-0000-4000-8000-000000000402','bounded-admin-2@example.test',now()),
('a5500000-0000-4000-8000-000000000403','bounded-admin-3@example.test',now()),
('a5500000-0000-4000-8000-000000000404','bounded-admin-4@example.test',now()),
('a5500000-0000-4000-8000-000000000405','bounded-admin-5@example.test',now()),
('a5500000-0000-4000-8000-000000000406','bounded-admin-6@example.test',now()),
('a5500000-0000-4000-8000-000000000407','bounded-admin-7@example.test',now()),
('a5500000-0000-4000-8000-000000000408','bounded-admin-8@example.test',now()),
('a5500000-0000-4000-8000-000000000409','bounded-admin-9@example.test',now()),
('a5500000-0000-4000-8000-000000000410','bounded-admin-10@example.test',now()),
('a5500000-0000-4000-8000-000000000411','bounded-admin-11@example.test',now());
insert into public.workspace_memberships (workspace_id, user_id, status, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
('a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000400','admin','active'),
('a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000401','admin','active'),
('a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000402','admin','active'),
('a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000403','admin','active'),
('a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000404','admin','active'),
('a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000405','admin','active'),
('a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000406','admin','active'),
('a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000407','admin','active'),
('a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000408','admin','active'),
('a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000409','admin','active'),
('a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000410','admin','active'),
('a5500000-0000-4000-8000-000000000101','a5500000-0000-4000-8000-000000000411','admin','active')) as legacy(workspace_id, user_id, role, status);
-- Each has a legal name on file, or none of them would be a candidate (BL-080).
with filed as (
  insert into public.employee_profiles(workspace_id,user_id,employee_code,first_name,last_name,created_by)
  select 'a5500000-0000-4000-8000-000000000101', u.id, 'E-8' || lpad(n::text, 3, '0'), 'Bounded', 'Admin ' || n,
    'a5500000-0000-4000-8000-000000000001'
  from generate_series(0, 11) n
  join auth.users u on u.id = ('a5500000-0000-4000-8000-000000000' || (400 + n)::text)::uuid
  returning id, workspace_id, last_name
)
insert into public.employee_private_profiles(employee_id,workspace_id,legal_first_name,legal_last_name)
select id, workspace_id, 'Bounded', last_name from filed;
set local role service_role;
select is((select count(*)::int from public.search_workspace_ownership_candidates_service('a5500000-0000-4000-8000-000000000002','a5500000-0000-4000-8000-000000000101','bounded-admin')),10,'candidate results limited to ten');
select lives_ok($q$select public.request_workspace_closure_service('a5500000-0000-4000-8000-000000000002','a5500000-0000-4000-8000-000000000101','scheduled_end_period',null,true,now()+interval '3 days')$q$,'owner schedules closure');
select lives_ok($q$select public.cancel_workspace_closure_service('a5500000-0000-4000-8000-000000000002','a5500000-0000-4000-8000-000000000101')$q$,'owner cancels scheduled closure');
select lives_ok($q$select public.request_workspace_closure_service('a5500000-0000-4000-8000-000000000002','a5500000-0000-4000-8000-000000000101','immediate','Gate2 Workspace',true,null)$q$,'owner closes workspace');
select is((select workspace_lifecycle_status::text from public.list_my_workspaces_service('a5500000-0000-4000-8000-000000000002') where workspace_id='a5500000-0000-4000-8000-000000000101'),'deleted','closed workspace stays listed as closed');
reset role;
-- AUTH-002: a pending invitation blocks first-workspace creation until resolved.
insert into auth.users(id,email,email_confirmed_at) values
('a5500000-0000-4000-8000-000000000012','invitee-gate2@example.test',now()),
('a5500000-0000-4000-8000-000000000013','expired-invitee-gate2@example.test',now()),
('a5500000-0000-4000-8000-000000000014','owner-invitee-gate2@example.test',now());
insert into public.workspaces(id,name,created_by) values ('a5500000-0000-4000-8000-000000000103','Invitee Own Workspace','a5500000-0000-4000-8000-000000000014');
insert into public.workspace_memberships (workspace_id, user_id, status, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values ('a5500000-0000-4000-8000-000000000103','a5500000-0000-4000-8000-000000000014','owner','active')) as legacy(workspace_id, user_id, role, status);
insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by) values
('a5500000-0000-4000-8000-000000000312','a5500000-0000-4000-8000-000000000102',null,'E-9912','Pending','Invitee','a5500000-0000-4000-8000-000000000008'),
('a5500000-0000-4000-8000-000000000313','a5500000-0000-4000-8000-000000000102',null,'E-9913','Expired','Invitee','a5500000-0000-4000-8000-000000000008'),
('a5500000-0000-4000-8000-000000000314','a5500000-0000-4000-8000-000000000102',null,'E-9914','Owner','Invitee','a5500000-0000-4000-8000-000000000008');
insert into public.employee_invitations(workspace_id,employee_id,email,employee_role_id,management_role_id,token_hash,expires_at,created_by)
select 'a5500000-0000-4000-8000-000000000102', invitee.employee_id, invitee.email,
  (select id from public.workspace_roles where workspace_id='a5500000-0000-4000-8000-000000000102' and access_class='employee' and id=first_role.id),
  (select id from public.workspace_roles where workspace_id='a5500000-0000-4000-8000-000000000102' and access_class<>'employee' and id=first_role.id),
  repeat(invitee.hash_char,64), now() + invitee.expires_in, 'a5500000-0000-4000-8000-000000000008'
from (values
  ('a5500000-0000-4000-8000-000000000312'::uuid,'invitee-gate2@example.test','b',interval '1 day'),
  ('a5500000-0000-4000-8000-000000000313'::uuid,'expired-invitee-gate2@example.test','c',interval '-1 day'),
  ('a5500000-0000-4000-8000-000000000314'::uuid,'owner-invitee-gate2@example.test','d',interval '1 day')
) as invitee(employee_id,email,hash_char,expires_in),
-- The role goes in the slot of its class (DAVET-ERISIM).
(select id from public.workspace_roles where workspace_id='a5500000-0000-4000-8000-000000000102' order by created_at limit 1) as first_role;
set local role service_role;
select throws_ok($q$select public.create_owner_workspace_service('a5500000-0000-4000-8000-000000000012','Invitee business')$q$,'42501','pending invitation must be resolved first','pending invitee without owner membership cannot create');
select lives_ok($q$select public.create_owner_workspace_service('a5500000-0000-4000-8000-000000000013','Expired invitee business')$q$,'expired invitation does not block creation');
select lives_ok($q$select public.create_owner_workspace_service('a5500000-0000-4000-8000-000000000014','Owner second business')$q$,'active owner can create while an invitation is pending');
reset role;
-- BL-906 (GUVENLIK-A GA-4): "Close later" finishes on its date. Close Later Co
-- is past its date and Not Yet Co is not; the closure job closes only the first,
-- the way "Close now" closes a workspace. Broken Close Co is due earlier still
-- and its closure fails here on purpose: it stays scheduled and does not hold
-- the others back.
insert into auth.users(id,email,email_confirmed_at) values
('a5500000-0000-4000-8000-000000000015','close-later-owner@example.test',now()),
('a5500000-0000-4000-8000-000000000016','close-later-admin@example.test',now()),
('a5500000-0000-4000-8000-000000000017','not-yet-owner@example.test',now()),
('a5500000-0000-4000-8000-000000000018','broken-close-owner@example.test',now());
insert into public.workspaces(id,name,created_by) values
('a5500000-0000-4000-8000-000000000104','Close Later Co','a5500000-0000-4000-8000-000000000015'),
('a5500000-0000-4000-8000-000000000105','Not Yet Co','a5500000-0000-4000-8000-000000000017'),
('a5500000-0000-4000-8000-000000000106','Broken Close Co','a5500000-0000-4000-8000-000000000018');
insert into public.workspace_memberships (workspace_id, user_id, status, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
('a5500000-0000-4000-8000-000000000104','a5500000-0000-4000-8000-000000000015','owner','active'),
('a5500000-0000-4000-8000-000000000104','a5500000-0000-4000-8000-000000000016','admin','active'),
('a5500000-0000-4000-8000-000000000105','a5500000-0000-4000-8000-000000000017','owner','active'),
('a5500000-0000-4000-8000-000000000106','a5500000-0000-4000-8000-000000000018','owner','active')) as legacy(workspace_id, user_id, role, status);
insert into public.locations(short_name,id,workspace_id,name,street_address,city,region,postal_code,timezone)
values ('CLC1','a5500000-0000-4000-8000-000000000604','a5500000-0000-4000-8000-000000000104','Close Later Main','1 Main St','Los Angeles','CA','90001','America/Los_Angeles');
set local role service_role;
select lives_ok($q$select public.request_workspace_closure_service('a5500000-0000-4000-8000-000000000015','a5500000-0000-4000-8000-000000000104','scheduled_end_period',null,true,now()+interval '3 days')$q$,'the owner of Close Later Co closes it later');
select lives_ok($q$select public.request_workspace_closure_service('a5500000-0000-4000-8000-000000000017','a5500000-0000-4000-8000-000000000105','scheduled_end_period',null,true,now()+interval '3 days')$q$,'the owner of Not Yet Co closes it later');
select lives_ok($q$select public.request_workspace_closure_service('a5500000-0000-4000-8000-000000000018','a5500000-0000-4000-8000-000000000106','scheduled_end_period',null,true,now()+interval '3 days')$q$,'the owner of Broken Close Co closes it later');
reset role;
-- ponytail: now() is fixed inside the transaction, so the dates are moved into
-- the past by hand; Broken Close Co comes first.
update public.workspaces set closure_effective_at = now() - interval '1 minute' where id = 'a5500000-0000-4000-8000-000000000104';
update public.workspace_closure_requests set effective_at = now() - interval '1 minute' where workspace_id = 'a5500000-0000-4000-8000-000000000104' and status = 'scheduled';
update public.workspaces set closure_effective_at = now() - interval '2 minutes' where id = 'a5500000-0000-4000-8000-000000000106';
update public.workspace_closure_requests set effective_at = now() - interval '2 minutes' where workspace_id = 'a5500000-0000-4000-8000-000000000106' and status = 'scheduled';
create function public.awc_refuse_broken_close() returns trigger language plpgsql as $f$
begin
  if new.id = 'a5500000-0000-4000-8000-000000000106' and new.lifecycle_status = 'deleted' then
    raise exception 'this closure fails on purpose';
  end if;
  return new;
end
$f$;
create trigger awc_refuse_broken_close before update on public.workspaces
for each row execute function public.awc_refuse_broken_close();
-- The job runs as cron does: nobody signed in.
select set_config('request.jwt.claim.sub','',true);
select lives_ok($q$select app_private.complete_due_workspace_closures()$q$,'the closure job runs');
select is((select lifecycle_status::text from public.workspaces where id='a5500000-0000-4000-8000-000000000106'),'closure_scheduled','a closure that fails stays scheduled for the next run');
select is((select status::text from public.workspace_closure_requests where workspace_id='a5500000-0000-4000-8000-000000000106' order by created_at desc limit 1),'scheduled','its closure request is left as it was');
select is((select lifecycle_status::text from public.workspaces where id='a5500000-0000-4000-8000-000000000104'),'deleted','a workspace past its Close later date is closed');
select is((select closed_at from public.workspaces where id='a5500000-0000-4000-8000-000000000104'),now() - interval '1 minute','it closes at the date it promised');
select is((select count(*)::int from public.workspace_memberships where workspace_id='a5500000-0000-4000-8000-000000000104' and status<>'suspended'),0,'its memberships are suspended');
select is((select status::text from public.workspace_closure_requests where workspace_id='a5500000-0000-4000-8000-000000000104' order by created_at desc limit 1),'completed','its closure request is completed');
select ok(exists(select 1 from public.workspace_retention_purge_jobs where workspace_id='a5500000-0000-4000-8000-000000000104'),'its data is queued for removal');
select ok(exists(select 1 from public.audit_events where workspace_id='a5500000-0000-4000-8000-000000000104' and action='workspace.closure.completed_scheduled'),'the scheduled closure is audited');
select is((select lifecycle_status::text from public.workspaces where id='a5500000-0000-4000-8000-000000000105'),'closure_scheduled','a workspace before its date stays scheduled');
select set_config('request.jwt.claim.sub','a5500000-0000-4000-8000-000000000016',true);
set local role authenticated;
-- Most catalog updates already stop at the date (their read policy hides a
-- closed workspace); adding rows and editing locations went on until now.
select throws_ok($q$insert into public.departments(workspace_id,name) values ('a5500000-0000-4000-8000-000000000104','After close')$q$,'42501',null,'an admin of the closed workspace no longer adds to its settings');
update public.locations set name='After close' where id='a5500000-0000-4000-8000-000000000604';
reset role;
select set_config('request.jwt.claim.sub','',true);
select is((select name from public.locations where id='a5500000-0000-4000-8000-000000000604'),'Close Later Main','an admin of the closed workspace no longer edits its locations');
select is((select schedule || ' ' || command from cron.job where jobname='workspace-closures'),'*/5 * * * * select app_private.complete_due_workspace_closures()','the closure job runs every five minutes');
select * from finish();
rollback;
