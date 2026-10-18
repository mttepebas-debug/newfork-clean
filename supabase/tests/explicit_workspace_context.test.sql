begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000091', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tab-user@example.test', '', '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000092', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@example.test', '', '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000093', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@example.test', '', '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values
  ('20000000-0000-4000-8000-000000000091', 'Tab Context A', '10000000-0000-4000-8000-000000000092'),
  ('20000000-0000-4000-8000-000000000092', 'Tab Context B', '10000000-0000-4000-8000-000000000093');

insert into public.workspace_memberships (id, workspace_id, user_id, status, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
  ('30000000-0000-4000-8000-000000000091', '20000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000092', 'owner', 'active'),
  ('30000000-0000-4000-8000-000000000092', '20000000-0000-4000-8000-000000000092', '10000000-0000-4000-8000-000000000093', 'owner', 'active'),
  ('30000000-0000-4000-8000-000000000093', '20000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000091', 'admin', 'active'),
  ('30000000-0000-4000-8000-000000000094', '20000000-0000-4000-8000-000000000092', '10000000-0000-4000-8000-000000000091', 'employee', 'active')) as legacy(id, workspace_id, user_id, role, status);

insert into public.workspace_onboarding (workspace_id, status, current_step, completed_at, updated_by)
values
  ('20000000-0000-4000-8000-000000000091', 'complete', 2, now(), '10000000-0000-4000-8000-000000000092'),
  ('20000000-0000-4000-8000-000000000092', 'complete', 2, now(), '10000000-0000-4000-8000-000000000093');

select ok(
  not has_table_privilege('authenticated', 'public.membership_location_scopes', 'select')
    and not has_table_privilege('service_role', 'public.membership_location_scopes', 'select'),
  'nobody outside the database reads where members work; the context call returns it'
);

set local role service_role;

select is(
  (select count(*)::integer from public.resolve_workspace_context_service('10000000-0000-4000-8000-000000000091', null)),
  0,
  'multiple active workspaces without a default still do not resolve randomly'
);

select is(
  (select workspace_id from public.resolve_workspace_context_service('10000000-0000-4000-8000-000000000091', '20000000-0000-4000-8000-000000000091')),
  '20000000-0000-4000-8000-000000000091'::uuid,
  'explicit context resolves first active membership'
);

select is(
  (select workspace_role from public.resolve_workspace_context_service('10000000-0000-4000-8000-000000000091', '20000000-0000-4000-8000-000000000092')),
  'employee'::public.workspace_role,
  'explicit context keeps the role scoped to the selected workspace'
);

reset role;

insert into public.user_workspace_preferences (user_id, active_workspace_id)
values ('10000000-0000-4000-8000-000000000091', '20000000-0000-4000-8000-000000000092');

set local role service_role;

select is(
  (select workspace_id from public.resolve_workspace_context_service('10000000-0000-4000-8000-000000000091', null)),
  '20000000-0000-4000-8000-000000000092'::uuid,
  'null context still preserves the account default behavior'
);

reset role;
-- Every workspace gets its setup state when it is created (create_owner_workspace);
-- one without it is not read as set up (BL-116).
delete from public.workspace_onboarding where workspace_id = '20000000-0000-4000-8000-000000000092';

set local role service_role;

select is(
  (select count(*)::integer from public.resolve_workspace_context_service('10000000-0000-4000-8000-000000000091', '20000000-0000-4000-8000-000000000092')),
  0,
  'a workspace without its setup state resolves no context'
);

reset role;

update public.workspaces
set lifecycle_status = 'deleted',
    closed_at = now(),
    closed_by = '10000000-0000-4000-8000-000000000092'
where id = '20000000-0000-4000-8000-000000000091';

set local role service_role;

select is(
  (select count(*)::integer from public.resolve_workspace_context_service('10000000-0000-4000-8000-000000000091', '20000000-0000-4000-8000-000000000091')),
  0,
  'explicit context does not resolve closed workspaces'
);

set local role authenticated;
select throws_ok(
  $$select public.resolve_workspace_context_service('10000000-0000-4000-8000-000000000091', '20000000-0000-4000-8000-000000000092')$$,
  '42501',
  'permission denied for function resolve_workspace_context_service',
  'authenticated users cannot call the service-only resolver directly'
);

select * from finish();
rollback;
