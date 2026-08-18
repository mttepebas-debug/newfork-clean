begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@example.test', '', '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider@example.test', '', '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.test', '', '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values ('20000000-0000-4000-8000-000000000001', 'RLS Test Workspace', '10000000-0000-4000-8000-000000000001');

insert into public.workspace_memberships (id, workspace_id, user_id, role)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'admin');

insert into public.user_profiles (user_id, display_name)
values ('10000000-0000-4000-8000-000000000001', 'Test Owner');

insert into public.user_preferences (user_id, theme)
values ('10000000-0000-4000-8000-000000000001', 'system');

insert into public.workspace_onboarding (workspace_id, updated_by)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is((select count(*)::integer from public.workspaces), 1, 'member sees own workspace');
select is((select public.workspace_role_for('20000000-0000-4000-8000-000000000001')), 'owner'::public.workspace_role, 'member role resolves');
select is((select count(*)::integer from public.resolve_active_workspace()), 1, 'active workspace resolves');

insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'workspace.tested',
  'workspace',
  '20000000-0000-4000-8000-000000000001'
);
select is((select count(*)::integer from public.audit_events), 1, 'owner can append and read audit events');
select is((select display_name from public.user_profiles), 'Test Owner', 'owner sees own account profile');
select lives_ok(
  $$select public.update_owner_onboarding(
    '20000000-0000-4000-8000-000000000001',
    'Updated Test Workspace',
    2::smallint,
    true
  )$$,
  'owner can complete workspace onboarding'
);

select throws_ok(
  $$delete from public.workspace_memberships where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514',
  'workspace must retain an active owner',
  'last owner cannot be removed'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$update public.workspace_memberships set role = 'owner' where id = '30000000-0000-4000-8000-000000000002'$$,
  '42501',
  'membership role change is not permitted',
  'admin cannot promote itself to owner'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.workspaces), 0, 'outsider cannot see workspace');
select is((select count(*)::integer from public.audit_events), 0, 'outsider cannot see audit events');
select is((select count(*)::integer from public.user_profiles), 0, 'outsider cannot see another user profile');
select lives_ok(
  $$select public.create_owner_workspace('Outsider Workspace')$$,
  'authenticated user can bootstrap a workspace'
);
select is(
  (
    select workspace_role
    from public.list_my_workspaces()
    where workspace_name = 'Outsider Workspace'
  ),
  'owner'::public.workspace_role,
  'bootstrapped workspace grants owner membership'
);

select * from finish();
rollback;
