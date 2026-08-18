begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('14000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'documents-owner@example.test', '', '{}', '{}', now(), now()),
  ('14000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'documents-admin@example.test', '', '{}', '{}', now(), now()),
  ('14000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'documents-manager@example.test', '', '{}', '{}', now(), now()),
  ('14000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'documents-outsider@example.test', '', '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values
  ('24000000-0000-4000-8000-000000000001', 'Documents Workspace', '14000000-0000-4000-8000-000000000001'),
  ('24000000-0000-4000-8000-000000000002', 'Other Documents Workspace', '14000000-0000-4000-8000-000000000004');

insert into public.workspace_memberships (id, workspace_id, user_id, role)
values
  ('34000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000001', 'owner'),
  ('34000000-0000-4000-8000-000000000002', '24000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000002', 'admin'),
  ('34000000-0000-4000-8000-000000000003', '24000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000003', 'manager'),
  ('34000000-0000-4000-8000-000000000004', '24000000-0000-4000-8000-000000000002', '14000000-0000-4000-8000-000000000004', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000001', true);
select ok(public.workspace_has_permission('24000000-0000-4000-8000-000000000001', 'documents.read'), 'owner receives documents.read');
select ok(public.workspace_has_permission('24000000-0000-4000-8000-000000000001', 'documents.manage'), 'owner receives documents.manage');

select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000002', true);
select ok(public.workspace_has_permission('24000000-0000-4000-8000-000000000001', 'documents.manage'), 'admin receives documents.manage');

select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000003', true);
select isnt(public.workspace_has_permission('24000000-0000-4000-8000-000000000001', 'documents.read'), true, 'manager has no document access by default');

select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.save_document_type(
    '24000000-0000-4000-8000-000000000001', null, 'Food handler card', 'Current certification',
    true, true, array['pdf', 'jpeg', 'png']::text[], true, 30
  )$$,
  'owner can create a required expiring document type'
);
select lives_ok(
  $$select public.save_document_type(
    '24000000-0000-4000-8000-000000000001', null, 'Team handbook', 'Signed acknowledgement handled later',
    false, false, array['pdf']::text[], false, 30
  )$$,
  'owner can create an optional document type'
);
select is((select count(*)::integer from public.document_types), 2, 'document types are stored');
select ok(
  (select required_at_onboarding and requires_review and tracks_expiry from public.document_types where title = 'Food handler card'),
  'workflow metadata is persisted'
);
select is((select count(*)::integer from public.audit_events where action = 'document_type.created'), 2, 'document creation is audited');
select lives_ok(
  $$select public.reorder_document_types(
    '24000000-0000-4000-8000-000000000001',
    array[
      (select id from public.document_types where title = 'Team handbook'),
      (select id from public.document_types where title = 'Food handler card')
    ]::uuid[]
  )$$,
  'owner can reorder every active document type'
);
select is((select title from public.document_types order by sort_order limit 1), 'Team handbook', 'document order is persisted');
select throws_ok(
  $$select public.save_document_type(
    '24000000-0000-4000-8000-000000000001', null, 'food HANDLER card', '',
    false, true, array['pdf']::text[], false, 30
  )$$,
  '23505', null, 'active document names are unique ignoring case'
);
select throws_ok(
  $$select public.save_document_type(
    '24000000-0000-4000-8000-000000000001', null, 'Executable', '',
    false, false, array['exe']::text[], false, 30
  )$$,
  '22023', 'document formats contain unsupported values', 'unsupported formats are rejected'
);

select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.save_document_type(
    '24000000-0000-4000-8000-000000000001',
    (select id from public.document_types where title = 'Team handbook'),
    'Team handbook', 'Current handbook upload', false, true, array['pdf']::text[], false, 30
  )$$,
  'admin can update a document type'
);
select is((select description from public.document_types where title = 'Team handbook'), 'Current handbook upload', 'document update is persisted');
select lives_ok(
  $$select public.set_document_type_archived(
    '24000000-0000-4000-8000-000000000001',
    (select id from public.document_types where title = 'Team handbook'), true
  )$$,
  'admin can archive a document type'
);
select is((select count(*)::integer from public.audit_events where action = 'document_type.archived'), 1, 'document archive is audited');

select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000003', true);
select is((select count(*)::integer from public.document_types), 0, 'manager without permission cannot list document types');
select throws_ok(
  $$select public.save_document_type(
    '24000000-0000-4000-8000-000000000001', null, 'Unauthorized', '',
    false, false, array['pdf']::text[], false, 30
  )$$,
  '42501', 'document management access required', 'manager cannot create a document type'
);

select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000002', true);
create temporary table document_role_state (role_id uuid primary key);
insert into document_role_state
select public.save_workspace_role(
  '24000000-0000-4000-8000-000000000001', null, 'Document coordinator', '', 'manager',
  array['workspace.read', 'documents.read', 'documents.manage']::text[]
);
select is(
  (select count(*)::integer from public.workspace_role_permissions where role_id = (select role_id from document_role_state) and permission_key like 'documents.%'),
  2,
  'custom roles can receive bounded document permissions'
);
select lives_ok(
  $$update public.workspace_memberships
    set role_id = (select role_id from document_role_state)
    where id = '34000000-0000-4000-8000-000000000003'$$,
  'admin can assign the custom document role'
);

select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000003', true);
select is((select count(*)::integer from public.document_types), 2, 'custom document role can read the catalog');
select lives_ok(
  $$select public.save_document_type(
    '24000000-0000-4000-8000-000000000001', null, 'Profile photo', '',
    false, true, array['jpeg', 'png', 'webp']::text[], false, 30
  )$$,
  'custom document manager can create a type'
);

select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000004', true);
select is((select count(*)::integer from public.document_types where workspace_id = '24000000-0000-4000-8000-000000000001'), 0, 'other tenant cannot read document types');
select throws_ok(
  $$select public.save_document_type(
    '24000000-0000-4000-8000-000000000001', null, 'Cross tenant', '',
    false, false, array['pdf']::text[], false, 30
  )$$,
  '42501', 'document management access required', 'other tenant cannot create document types'
);

select * from finish();
rollback;
