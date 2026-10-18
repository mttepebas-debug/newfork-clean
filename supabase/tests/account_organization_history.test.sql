begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('a5050000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','auth005-'||n||'@example.test','','{}','{}',now(),now() from generate_series(1,3) n;

select is((select count(*)::int from public.account_organization_history where user_id='a5050000-0000-4000-8000-000000000001'),0,'a fresh account carries no organization history');

insert into public.workspaces(id,name,created_by)
values ('a5051000-0000-4000-8000-000000000001','AUTH005 Owned','a5050000-0000-4000-8000-000000000001');
insert into public.workspace_memberships (workspace_id, user_id, status, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values ('a5051000-0000-4000-8000-000000000001','a5050000-0000-4000-8000-000000000001','owner','active',true)) as legacy(workspace_id, user_id, role, status, all_locations);

select is((select count(*)::int from public.account_organization_history where user_id='a5050000-0000-4000-8000-000000000001'),1,'creating the first membership marks the account');

-- A half-finished employee onboarding counts the same as a completed one.
insert into public.workspace_memberships (workspace_id, user_id, status, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values ('a5051000-0000-4000-8000-000000000001','a5050000-0000-4000-8000-000000000002','employee','pending_activation',true)) as legacy(workspace_id, user_id, role, status, all_locations);
select is((select count(*)::int from public.account_organization_history where user_id='a5050000-0000-4000-8000-000000000002'),1,'a pending activation membership also marks the account');

create temp table first_mark as
select first_linked_at from public.account_organization_history where user_id='a5050000-0000-4000-8000-000000000001';

insert into public.workspaces(id,name,created_by)
values ('a5051000-0000-4000-8000-000000000002','AUTH005 Second','a5050000-0000-4000-8000-000000000001');
insert into public.workspace_memberships (workspace_id, user_id, status, role_id, employee_role_id)
select legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values ('a5051000-0000-4000-8000-000000000002','a5050000-0000-4000-8000-000000000001','owner','active',true)) as legacy(workspace_id, user_id, role, status, all_locations);

select is((select count(*)::int from public.account_organization_history where user_id='a5050000-0000-4000-8000-000000000001'),1,'a second membership does not add a second row');
select is((select first_linked_at from public.account_organization_history where user_id='a5050000-0000-4000-8000-000000000001'),(select first_linked_at from first_mark),'the first link timestamp is never rewritten');

-- Losing every link must still read as a returning account.
delete from public.workspace_memberships where user_id='a5050000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.workspace_memberships where user_id='a5050000-0000-4000-8000-000000000002'),0,'the account has no membership left');
select is((select count(*)::int from public.account_organization_history where user_id='a5050000-0000-4000-8000-000000000002'),1,'removing every membership keeps the account marked');

select is((select count(*)::int from public.account_organization_history where user_id='a5050000-0000-4000-8000-000000000003'),0,'an untouched account stays unmarked');

-- Backfill covers accounts that were linked before this migration existed.
select ok((select count(*) from public.account_organization_history) >= (select count(distinct user_id) from public.workspace_memberships),'every existing membership holder is marked');

select * from finish();
rollback;
