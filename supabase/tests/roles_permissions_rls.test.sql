begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('b1051001-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roles-owner@example.test', '', '{}', '{}', now(), now()),
  ('b1051001-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roles-admin@example.test', '', '{}', '{}', now(), now()),
  ('b1051001-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roles-manager@example.test', '', '{}', '{}', now(), now()),
  ('b1051001-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roles-outsider@example.test', '', '{}', '{}', now(), now());
-- These accounts have confirmed their address; accepting an invitation asks for it (SEC-003).
update auth.users set email_confirmed_at = now() where id::text like 'b1051001-%' and email_confirmed_at is null;

insert into public.workspaces (id, name, created_by)
values
  ('b1051002-0000-4000-8000-000000000001', 'Roles Workspace', 'b1051001-0000-4000-8000-000000000001'),
  ('b1051002-0000-4000-8000-000000000002', 'Other Roles Workspace', 'b1051001-0000-4000-8000-000000000004');

insert into public.workspace_memberships (id, workspace_id, user_id, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
  ('b1051003-0000-4000-8000-000000000001', 'b1051002-0000-4000-8000-000000000001', 'b1051001-0000-4000-8000-000000000001', 'owner'),
  ('b1051003-0000-4000-8000-000000000002', 'b1051002-0000-4000-8000-000000000001', 'b1051001-0000-4000-8000-000000000002', 'admin'),
  ('b1051003-0000-4000-8000-000000000003', 'b1051002-0000-4000-8000-000000000001', 'b1051001-0000-4000-8000-000000000003', 'manager'),
  ('b1051003-0000-4000-8000-000000000004', 'b1051002-0000-4000-8000-000000000002', 'b1051001-0000-4000-8000-000000000004', 'owner')) as legacy(id, workspace_id, user_id, role);


create temporary table role_test_state as select
 (select id from public.workspace_roles where workspace_id='b1051002-0000-4000-8000-000000000001' and system_key='owner') owner_role,
 (select id from public.workspace_roles where workspace_id='b1051002-0000-4000-8000-000000000001' and system_key='admin') admin_role,
 (select id from public.workspace_roles where workspace_id='b1051002-0000-4000-8000-000000000001' and system_key='manager') manager_role,
 null::uuid custom_role, null::timestamptz version, null::timestamptz admin_version, null::text[] admin_grants;
update role_test_state set admin_version=(select updated_at from public.workspace_roles where id=admin_role),admin_grants=array(select permission_key from public.workspace_role_permissions where role_id=admin_role);
grant all on role_test_state to service_role,authenticated;
select is((select count(*)::integer from public.workspace_roles where workspace_id='b1051002-0000-4000-8000-000000000001'),4,'four built-ins retain role identities');
select ok(public.service_actor_has_permission('b1051001-0000-4000-8000-000000000001','b1051002-0000-4000-8000-000000000001','roles.manage'),'Owner can manage roles');
-- Admins edit Settings -> Roles by default (D2, user decision 2026-09-23;
-- 20260924123013_authorization_core.sql); a manager does not.
select ok(public.service_actor_has_permission('b1051001-0000-4000-8000-000000000002','b1051002-0000-4000-8000-000000000001','roles.manage'),'Admin manages roles by default (D2)');
select ok(not public.service_actor_has_permission('b1051001-0000-4000-8000-000000000003','b1051002-0000-4000-8000-000000000001','roles.manage'),'Manager does not manage roles by default');
select ok(public.service_actor_has_permission('b1051001-0000-4000-8000-000000000003','b1051002-0000-4000-8000-000000000001','employees.archive'),'Manager operational Edit includes archive');
select ok(not exists(select 1 from public.workspace_role_permissions where role_id=(select manager_role from role_test_state) and (permission_key like 'settings.%' or permission_key in ('employee_access.manage','employees.private.read','documents.read','documents.manage','notifications.settings.write'))),'Manager defaults exclude settings/access/private/document types');
-- BL-560 (Mert, 2026-10-19): a new workspace's manager reads and decides the documents of the people
-- where they manage (M2, FB-6.6 D2); the Settings document catalog waits with the other catalogs (BL-680).
select is(array(select permission_key from public.workspace_role_permissions where role_id=(select manager_role from role_test_state) and permission_key like 'employee_documents.%' order by 1),array['employee_documents.read','employee_documents.review'],'Manager defaults read and review employee documents (BL-560)');
select is((select coalesce((select r.access_class::text from public.workspace_roles r where r.id = role_id), 'employee') from public.workspace_memberships where id='b1051003-0000-4000-8000-000000000003'), 'manager', 'Manager cannot inherit all-location scope');
set local role service_role;
select throws_ok($$select public.save_workspace_role_service('b1051001-0000-4000-8000-000000000003','b1051002-0000-4000-8000-000000000001',null,'Blocked','','manager',array['workspace.read'])$$,'42501',null,'A member without role management cannot create a role');
select throws_ok($$select public.save_workspace_role_service('b1051001-0000-4000-8000-000000000001','b1051002-0000-4000-8000-000000000001',(select owner_role from role_test_state),'Owner','','owner',array['workspace.read'],now())$$,'42501',null,'Owner role is immutable even to Owner');
select lives_ok($$select public.save_workspace_role_service('b1051001-0000-4000-8000-000000000001','b1051002-0000-4000-8000-000000000001',(select admin_role from role_test_state),'Admin','','admin',(select admin_grants from role_test_state)||array['roles.manage'],(select admin_version from role_test_state))$$,'Owner explicitly authorizes Admin');
select throws_ok($$select public.save_workspace_role_service('b1051001-0000-4000-8000-000000000002','b1051002-0000-4000-8000-000000000001',(select admin_role from role_test_state),'Admin','','admin',array['workspace.read'],now())$$,'42501',null,'Authorized Admin cannot edit own Admin role');
select throws_ok($$select public.save_workspace_role_service('b1051001-0000-4000-8000-000000000002','b1051002-0000-4000-8000-000000000001',null,'Escalation','','manager',array['workspace.read','roles.read','roles.manage'])$$,'42501',null,'Lower role cannot receive role management');
select throws_ok($$select public.save_workspace_role_service('b1051001-0000-4000-8000-000000000002','b1051002-0000-4000-8000-000000000001',null,'Bad employee','','employee',array['workspace.read','schedule.read','schedule.manage'])$$,'42501',null,'Employee experience rejects management grants');
select throws_ok($$select public.save_workspace_role_service('b1051001-0000-4000-8000-000000000002','b1051002-0000-4000-8000-000000000001',null,'Missing read','','manager',array['workspace.read','schedule.manage'])$$,'22023',null,'Write requires Read at the authoritative boundary');
update role_test_state set custom_role=public.save_workspace_role_service('b1051001-0000-4000-8000-000000000002','b1051002-0000-4000-8000-000000000001',null,'Floor lead','Independent copy','manager',array['workspace.read','schedule.read']);
set local role postgres;
update role_test_state set version=(select updated_at from public.workspace_roles where id=custom_role);
set local role service_role;
select throws_ok($$select public.save_workspace_role_service('b1051001-0000-4000-8000-000000000002','b1051002-0000-4000-8000-000000000001',(select custom_role from role_test_state),'Floor lead','','manager',array['workspace.read'])$$,'PT409',null,'Unversioned update cannot overwrite');
select lives_ok($$select public.save_workspace_role_service('b1051001-0000-4000-8000-000000000002','b1051002-0000-4000-8000-000000000001',(select custom_role from role_test_state),'Floor lead','Saved','manager',array['workspace.read','schedule.read','schedule.manage'],(select version from role_test_state))$$,'Authorized Admin can edit lower roles');
select throws_ok($$select public.save_workspace_role_service('b1051001-0000-4000-8000-000000000002','b1051002-0000-4000-8000-000000000001',(select custom_role from role_test_state),'Floor lead','Stale','manager',array['workspace.read'],(select version from role_test_state))$$,'PT409',null,'Stale editor cannot overwrite new grants');
select throws_ok($$select public.save_workspace_role_service('b1051001-0000-4000-8000-000000000004','b1051002-0000-4000-8000-000000000001',(select custom_role from role_test_state),'Floor lead','','manager',array['workspace.read'],now())$$,'42501',null,'Another tenant Owner cannot mutate roles');
set local role postgres;
update public.workspace_memberships set role_id=(select custom_role from role_test_state) where id='b1051003-0000-4000-8000-000000000003';
select ok(public.service_actor_has_permission('b1051001-0000-4000-8000-000000000003','b1051002-0000-4000-8000-000000000001','schedule.manage'),'Existing members immediately resolve current role grants');
set local role service_role;
select throws_ok($$select public.delete_workspace_role_service('b1051001-0000-4000-8000-000000000002','b1051002-0000-4000-8000-000000000001',(select custom_role from role_test_state))$$,'PT409',null,'Member references block deletion');
set local role postgres;
update public.workspace_memberships set role_id=(select manager_role from role_test_state) where id='b1051003-0000-4000-8000-000000000003';
insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by) values('b1051004-0000-4000-8000-000000000001','b1051002-0000-4000-8000-000000000001','E-0001','Pending','Invite','b1051001-0000-4000-8000-000000000001');
insert into public.employee_invitations(id,workspace_id,employee_id,email,role_id,token_hash,expires_at,created_by) values('b1051005-0000-4000-8000-000000000001','b1051002-0000-4000-8000-000000000001','b1051004-0000-4000-8000-000000000001','roles-invite@example.test',(select custom_role from role_test_state),repeat('a',64),now()+interval '1 day','b1051001-0000-4000-8000-000000000001');
set local role service_role;
select throws_ok($$select public.delete_workspace_role_service('b1051001-0000-4000-8000-000000000002','b1051002-0000-4000-8000-000000000001',(select custom_role from role_test_state))$$,'PT409',null,'Pending invitation references block deletion');
select is((select (r->>'pending_invite_count')::integer from jsonb_array_elements(public.read_role_workspace_service('b1051001-0000-4000-8000-000000000001','b1051002-0000-4000-8000-000000000001')->'roles') r where r->>'id'=(select custom_role::text from role_test_state)),1,'Role editor reports real pending impact');
select throws_ok($$select public.read_role_workspace_service('b1051001-0000-4000-8000-000000000001','b1051002-0000-4000-8000-000000000002')$$,'42501','Not allowed','Cross-tenant role reads denied');
set local role postgres;
select is((select role_id from public.employee_invitations where id='b1051005-0000-4000-8000-000000000001'),(select custom_role from role_test_state),'Invitation keeps original role ID');

-- Invitation acceptance binds the current role; no permission snapshot is replayed.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('b1051001-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','roles-invite@example.test','','{}','{}',now(),now());
-- These accounts have confirmed their address; accepting an invitation asks for it (SEC-003).
update auth.users set email_confirmed_at = now() where id::text like 'b1051001-%' and email_confirmed_at is null;
update role_test_state set version=(select updated_at from public.workspace_roles where id=custom_role);
select public.save_workspace_role_service('b1051001-0000-4000-8000-000000000001','b1051002-0000-4000-8000-000000000001',(select custom_role from role_test_state),'Floor lead','Changed during invite', 'manager',array['workspace.read','schedule.read'],(select version from role_test_state));
set local role service_role;
select lives_ok($$select public.accept_employee_invitation_by_id_service('b1051001-0000-4000-8000-000000000005','b1051005-0000-4000-8000-000000000001')$$,'Pending invitation accepts after role edit');
set local role postgres;
select is((select role_id from public.workspace_memberships where workspace_id='b1051002-0000-4000-8000-000000000001' and user_id='b1051001-0000-4000-8000-000000000005'),(select custom_role from role_test_state),'Accepted membership retains role identity');
select ok(not exists(select 1 from public.workspace_memberships m join public.workspace_role_permissions g on g.role_id=m.role_id where m.user_id='b1051001-0000-4000-8000-000000000005' and g.permission_key='schedule.manage'),'Accepted membership uses updated grants, not sent-time edit permission');
select set_config('request.jwt.claim.sub','',true);
insert into public.locations(short_name, id,workspace_id,name,street_address,city,region,postal_code,timezone) values
('T00030','b1051006-0000-4000-8000-000000000001','b1051002-0000-4000-8000-000000000001','Shared','1 Test','Test','CA','90001','America/Los_Angeles'),
('T00031','b1051006-0000-4000-8000-000000000002','b1051002-0000-4000-8000-000000000001','Outside','2 Test','Test','CA','90001','America/Los_Angeles');
insert into public.jobs(id,workspace_id,name) values('b1051007-0000-4000-8000-000000000001','b1051002-0000-4000-8000-000000000001','Server');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('b1051001-0000-4000-8000-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','roles-employee@example.test','','{}','{}',now(),now());
-- These accounts have confirmed their address; accepting an invitation asks for it (SEC-003).
update auth.users set email_confirmed_at = now() where id::text like 'b1051001-%' and email_confirmed_at is null;
insert into public.workspace_memberships (workspace_id, user_id, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values('b1051002-0000-4000-8000-000000000001','b1051001-0000-4000-8000-000000000006','employee')) as legacy(workspace_id, user_id, role);
insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,user_id,created_by) values
('b1051004-0000-4000-8000-000000000002','b1051002-0000-4000-8000-000000000001','E-0002','Manager','Test','b1051001-0000-4000-8000-000000000003','b1051001-0000-4000-8000-000000000001'),
('b1051004-0000-4000-8000-000000000003','b1051002-0000-4000-8000-000000000001','E-0003','Common','Record','b1051001-0000-4000-8000-000000000006','b1051001-0000-4000-8000-000000000001'),
('b1051004-0000-4000-8000-000000000004','b1051002-0000-4000-8000-000000000001','E-0004','Protected','Owner','b1051001-0000-4000-8000-000000000001','b1051001-0000-4000-8000-000000000001');
insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by) values
('b1051002-0000-4000-8000-000000000001','b1051004-0000-4000-8000-000000000002','b1051006-0000-4000-8000-000000000001',true,'b1051001-0000-4000-8000-000000000001'),
('b1051002-0000-4000-8000-000000000001','b1051004-0000-4000-8000-000000000003','b1051006-0000-4000-8000-000000000001',true,'b1051001-0000-4000-8000-000000000001'),
('b1051002-0000-4000-8000-000000000001','b1051004-0000-4000-8000-000000000003','b1051006-0000-4000-8000-000000000002',false,'b1051001-0000-4000-8000-000000000001'),
('b1051002-0000-4000-8000-000000000001','b1051004-0000-4000-8000-000000000004','b1051006-0000-4000-8000-000000000001',true,'b1051001-0000-4000-8000-000000000001');
insert into public.employee_private_profiles(employee_id,workspace_id,legal_first_name,legal_last_name,phone,emergency_contact_name,emergency_contact_phone) values('b1051004-0000-4000-8000-000000000003','b1051002-0000-4000-8000-000000000001','Private','Person','+14155550100','Test Contact','+14155550101');
set constraints all immediate;
set constraints all deferred;
select is((select count(*)::integer from public.membership_location_scopes where membership_id='b1051003-0000-4000-8000-000000000003'),1,'Manager scope projects their employee assignment only');
set local role authenticated;
select set_config('request.jwt.claim.sub','b1051001-0000-4000-8000-000000000003',true);
select ok(public.can_access_location('b1051002-0000-4000-8000-000000000001','b1051006-0000-4000-8000-000000000001') and not public.can_access_location('b1051002-0000-4000-8000-000000000001','b1051006-0000-4000-8000-000000000002'),'Manager has shared location but not outside location');
set local role service_role;
select is(public.get_employee_detail_service('b1051001-0000-4000-8000-000000000003','b1051002-0000-4000-8000-000000000001','b1051004-0000-4000-8000-000000000003')->'private_contact','null'::jsonb,'Operational Read redacts real private contact data');
select lives_ok($$select public.save_employee_service('b1051001-0000-4000-8000-000000000003','b1051002-0000-4000-8000-000000000001','b1051004-0000-4000-8000-000000000003','Changed','','Record','','',null,'Common record edit',array['b1051006-0000-4000-8000-000000000001','b1051006-0000-4000-8000-000000000002']::uuid[],'b1051006-0000-4000-8000-000000000001',array['b1051007-0000-4000-8000-000000000001']::uuid[],'b1051007-0000-4000-8000-000000000001',false,false,1)$$,'One shared location permits common employee record edit');
select throws_ok($$select public.set_employee_archived_service('b1051001-0000-4000-8000-000000000003','b1051002-0000-4000-8000-000000000001','b1051004-0000-4000-8000-000000000004',true,false)$$,'42501',null,'Manager cannot archive Owner');
set local role authenticated;
select throws_ok($$insert into public.announcements(workspace_id,title,body,starts_on,ends_on,on_important_dates,time_zone,created_by,updated_by) values('b1051002-0000-4000-8000-000000000001','Forbidden date','','2026-09-15','2026-09-15',true,'UTC','b1051001-0000-4000-8000-000000000003','b1051001-0000-4000-8000-000000000003')$$,'42501',null,'The browser writes no announcement or important date: the server does (FB-6.7, EKRAN-08)');
select throws_ok($$insert into public.announcement_locations(workspace_id,announcement_id,location_id,day) values('b1051002-0000-4000-8000-000000000001',gen_random_uuid(),'b1051006-0000-4000-8000-000000000001','closed')$$,'42501',null,'nor closes its own location: the server does (EKRAN-08)');
select throws_ok($$insert into public.jobs(workspace_id,name) values('b1051002-0000-4000-8000-000000000001','Unauthorized job')$$,'42501',null,'Manager defaults cannot edit organization catalog');
set local role postgres;
select is((select count(*)::integer from public.employee_location_assignments where employee_id='b1051004-0000-4000-8000-000000000003' and ended_at is null),2,'Common-record edit preserved outside location assignment');
-- Ending employment is the owner's and admins'; a manager removes somebody
-- from their own location only (KARARLAR "Ürün kuralları", FB-6.2 S1).
set local role service_role;
select throws_ok($$select public.terminate_employee_service('b1051001-0000-4000-8000-000000000003','b1051002-0000-4000-8000-000000000001','b1051004-0000-4000-8000-000000000003',(now() at time zone 'America/Los_Angeles'),'America/Los_Angeles','Local test termination','b1051008-0000-4000-8000-000000000001')$$,'42501',null,'Manager cannot end employment');
select throws_ok($$select public.remove_employee_from_location_service('b1051001-0000-4000-8000-000000000003','b1051002-0000-4000-8000-000000000001','b1051004-0000-4000-8000-000000000003','b1051006-0000-4000-8000-000000000002')$$,'42501',null,'Manager cannot remove somebody from a location that is not theirs');
select lives_ok($$select public.remove_employee_from_location_service('b1051001-0000-4000-8000-000000000003','b1051002-0000-4000-8000-000000000001','b1051004-0000-4000-8000-000000000003','b1051006-0000-4000-8000-000000000001')$$,'Manager removes somebody from their own location');
set local role postgres;
select is((select array_agg(location_id) from public.employee_location_assignments where employee_id='b1051004-0000-4000-8000-000000000003' and ended_at is null),array['b1051006-0000-4000-8000-000000000002']::uuid[],'Removal ends only the manager''s location; the other one stays');
select is((select status::text from public.workspace_memberships where workspace_id='b1051002-0000-4000-8000-000000000001' and user_id='b1051001-0000-4000-8000-000000000006'),'active','Removal from a location leaves the membership active');
select set_config('request.jwt.claim.sub','',true);
set local role service_role;
select lives_ok($$select public.terminate_employee_service('b1051001-0000-4000-8000-000000000002','b1051002-0000-4000-8000-000000000001','b1051004-0000-4000-8000-000000000003',(now() at time zone 'America/Los_Angeles'),'America/Los_Angeles','Local test termination','b1051008-0000-4000-8000-000000000001')$$,'Admin ends employment across locations');
set local role postgres;
-- GUVENLIK-A GA-2 (BL-178; KARARLAR K14 S1/S2): a manager role may read the
-- organization settings but never gets their Edit. Settings > Roles refuses
-- General Edit and Locations Edit for the manager role, and a manager who
-- reads them still cannot rename the workspace or change a location that is
-- not theirs. (A grant written straight into the table is GA-3's test: the
-- core says no even then.)
select throws_ok($$select public.save_workspace_role_service('b1051001-0000-4000-8000-000000000001','b1051002-0000-4000-8000-000000000001',(select manager_role from role_test_state),'Manager','','manager',array(select permission_key from public.workspace_role_permissions where role_id=(select manager_role from role_test_state))||array['settings.general.read','settings.general.manage','settings.locations.read','settings.locations.manage'],(select updated_at from public.workspace_roles where id=(select manager_role from role_test_state)))$$,'42501',null,'Owner cannot give the manager role General Edit or Locations Edit');
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key)
select 'b1051002-0000-4000-8000-000000000001',manager_role,key from role_test_state cross join unnest(array['settings.general.read','settings.locations.read']) key
on conflict do nothing;
select set_config('request.jwt.claim.sub','b1051001-0000-4000-8000-000000000003',true);
set local role authenticated;
update public.workspaces set name='General permission test' where id='b1051002-0000-4000-8000-000000000001';
update public.locations set name='Updated outside location' where id='b1051006-0000-4000-8000-000000000002';
select throws_ok($$insert into public.jobs(workspace_id,name) values('b1051002-0000-4000-8000-000000000001','Still unauthorized')$$,'42501',null,'Settings reads do not grant Jobs Edit');
set local role postgres;
select set_config('request.jwt.claim.sub','',true);
select isnt((select name from public.workspaces where id='b1051002-0000-4000-8000-000000000001'),'General permission test','A manager who reads General cannot rename the workspace');
select isnt((select name from public.locations where id='b1051006-0000-4000-8000-000000000002'),'Updated outside location','A manager who reads Locations cannot change a location that is not theirs');
select public.initialize_workspace_roles('b1051002-0000-4000-8000-000000000001');
select is((select array_agg(permission_key order by permission_key) from public.workspace_role_permissions where role_id=(select custom_role from role_test_state)),array['schedule.read','workspace.read'],'Repeated initialization never seeds built-in grants into custom roles');
select ok(public.service_actor_has_permission('b1051001-0000-4000-8000-000000000003','b1051002-0000-4000-8000-000000000001','notifications.preferences.write_own'),'Personal preferences remain independent');
create temporary table unused_role as select public.save_workspace_role_service('b1051001-0000-4000-8000-000000000001','b1051002-0000-4000-8000-000000000001',null,'Unused blank','','manager',array['workspace.read','notifications.read','notifications.read_own','notifications.preferences.write_own']) id;
grant select on unused_role to service_role;
set local role service_role;
select lives_ok($$select public.delete_workspace_role_service('b1051001-0000-4000-8000-000000000001','b1051002-0000-4000-8000-000000000001',(select id from unused_role))$$,'Unused blank role is deletable');
set local role postgres;
select ok(not exists(select 1 from public.workspace_roles where id=(select id from unused_role)),'Unused role deletion persisted without reassignment');
select is((select status::text from public.workspace_memberships where workspace_id='b1051002-0000-4000-8000-000000000001' and user_id='b1051001-0000-4000-8000-000000000006'),'suspended','Ending employment suspends the linked member without an independent access grant');
select set_config('request.jwt.claim.sub','',true);
set constraints all immediate;
select * from finish();
rollback;
