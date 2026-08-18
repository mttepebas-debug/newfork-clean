begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('13000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roles-owner@example.test', '', '{}', '{}', now(), now()),
  ('13000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roles-admin@example.test', '', '{}', '{}', now(), now()),
  ('13000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roles-manager@example.test', '', '{}', '{}', now(), now()),
  ('13000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roles-outsider@example.test', '', '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values
  ('23000000-0000-4000-8000-000000000001', 'Roles Workspace', '13000000-0000-4000-8000-000000000001'),
  ('23000000-0000-4000-8000-000000000002', 'Other Roles Workspace', '13000000-0000-4000-8000-000000000004');

insert into public.workspace_memberships (id, workspace_id, user_id, role)
values
  ('33000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'owner'),
  ('33000000-0000-4000-8000-000000000002', '23000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000002', 'admin'),
  ('33000000-0000-4000-8000-000000000003', '23000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000003', 'manager'),
  ('33000000-0000-4000-8000-000000000004', '23000000-0000-4000-8000-000000000002', '13000000-0000-4000-8000-000000000004', 'owner');

select is(
  (select count(*)::integer from public.workspace_roles where workspace_id = '23000000-0000-4000-8000-000000000001'),
  4,
  'workspace receives four built-in roles'
);
select ok(
  (select role_id is not null from public.workspace_memberships where id = '33000000-0000-4000-8000-000000000001'),
  'membership receives a role reference'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*)::integer from public.workspace_roles where workspace_id = '23000000-0000-4000-8000-000000000001'),
  4,
  'owner can read the role catalog'
);
select ok(
  public.workspace_has_permission('23000000-0000-4000-8000-000000000001', 'roles.manage'),
  'owner resolves role management permission'
);

select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000003', true);
select is(
  (select count(*)::integer from public.workspace_roles where workspace_id = '23000000-0000-4000-8000-000000000001'),
  0,
  'manager without roles.read cannot list roles'
);
select throws_ok(
  $$select public.save_workspace_role(
    '23000000-0000-4000-8000-000000000001', null, 'Unauthorized', '', 'manager',
    array['workspace.read']::text[]
  )$$,
  '42501',
  'role management access required',
  'manager cannot create a custom role'
);

select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.save_workspace_role(
    '23000000-0000-4000-8000-000000000001', null, 'Escalated', '', 'manager',
    array['workspace.read', 'roles.manage']::text[]
  )$$,
  '22023',
  'permission set contains unknown or protected permissions',
  'protected permissions cannot be granted to custom roles'
);
select throws_ok(
  $$select public.save_workspace_role(
    '23000000-0000-4000-8000-000000000001', null, 'Broken', '', 'manager',
    array['workspace.read', 'schedule.manage']::text[]
  )$$,
  '22023',
  'schedule.manage requires schedule.read',
  'permission dependencies are enforced'
);

create temporary table role_test_state (role_id uuid primary key);
insert into role_test_state
select public.save_workspace_role(
  '23000000-0000-4000-8000-000000000001', null, 'Floor lead', 'Runs service', 'manager',
  array['workspace.read', 'schedule.read', 'schedule.manage', 'roles.read']::text[]
);

select is(
  (select count(*)::integer from public.workspace_roles where system_key is null),
  1,
  'admin can create a custom role'
);
select is(
  (select count(*)::integer from public.workspace_role_permissions where role_id = (select role_id from role_test_state)),
  4,
  'custom role grants are persisted'
);
select is(
  (select count(*)::integer from public.audit_events where action = 'role.created'),
  1,
  'role creation is audited'
);
select throws_ok(
  $$select public.save_workspace_role(
    '23000000-0000-4000-8000-000000000001',
    (select id from public.workspace_roles where workspace_id = '23000000-0000-4000-8000-000000000001' and system_key = 'manager'),
    'Changed manager', '', 'manager', array['workspace.read']::text[]
  )$$,
  'P0002',
  'custom role not found',
  'built-in roles are immutable'
);
select throws_ok(
  $$select public.save_workspace_role(
    '23000000-0000-4000-8000-000000000001', null, 'floor LEAD', '', 'employee',
    array['workspace.read']::text[]
  )$$,
  '23505',
  null,
  'role names are unique ignoring case'
);

update public.workspace_memberships
set role_id = (select role_id from role_test_state)
where id = '33000000-0000-4000-8000-000000000003';
select is(
  (select role::text from public.workspace_memberships where id = '33000000-0000-4000-8000-000000000003'),
  'manager',
  'custom role assignment keeps the selected landing class'
);
select throws_ok(
  $$select public.delete_workspace_role(
    '23000000-0000-4000-8000-000000000001', (select role_id from role_test_state)
  )$$,
  '23503',
  'role is assigned to members',
  'an assigned custom role cannot be deleted'
);

select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000003', true);
select ok(
  public.workspace_has_permission('23000000-0000-4000-8000-000000000001', 'roles.read'),
  'assigned custom role permissions become effective'
);
select is(
  (select membership_role_name from public.resolve_active_workspace()),
  'Floor lead',
  'active context resolves the custom role name'
);

select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000002', true);
update public.workspace_memberships
set role_id = (
  select id from public.workspace_roles
  where workspace_id = '23000000-0000-4000-8000-000000000001' and system_key = 'manager'
)
where id = '33000000-0000-4000-8000-000000000003';
select lives_ok(
  $$select public.delete_workspace_role(
    '23000000-0000-4000-8000-000000000001', (select role_id from role_test_state)
  )$$,
  'unused custom role can be deleted'
);
select is(
  (select count(*)::integer from public.audit_events where action = 'role.deleted'),
  1,
  'role deletion is audited'
);

select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000004', true);
select is(
  (select count(*)::integer from public.workspace_roles where workspace_id = '23000000-0000-4000-8000-000000000001'),
  0,
  'other tenant cannot read role records'
);
select throws_ok(
  $$select public.save_workspace_role(
    '23000000-0000-4000-8000-000000000001', null, 'Cross tenant', '', 'employee',
    array['workspace.read']::text[]
  )$$,
  '42501',
  'role management access required',
  'other tenant cannot create roles'
);

select * from finish();
rollback;
