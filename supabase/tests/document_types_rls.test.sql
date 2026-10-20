begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

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

insert into public.workspace_memberships (id, workspace_id, user_id, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
  ('34000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000001', 'owner'),
  ('34000000-0000-4000-8000-000000000002', '24000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000002', 'admin'),
  ('34000000-0000-4000-8000-000000000003', '24000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000003', 'manager'),
  ('34000000-0000-4000-8000-000000000004', '24000000-0000-4000-8000-000000000002', '14000000-0000-4000-8000-000000000004', 'owner')) as legacy(id, workspace_id, user_id, role);

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000001', true);
select ok(public.workspace_has_permission('24000000-0000-4000-8000-000000000001', 'documents.read'), 'owner receives documents.read');
select ok(public.workspace_has_permission('24000000-0000-4000-8000-000000000001', 'documents.manage'), 'owner receives documents.manage');

select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000002', true);
select ok(public.workspace_has_permission('24000000-0000-4000-8000-000000000001', 'documents.manage'), 'admin receives documents.manage');

select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000003', true);
-- BL-680 (K14 S1): the built-in manager reads the document types and changes none.
select ok(public.workspace_has_permission('24000000-0000-4000-8000-000000000001', 'documents.read'), 'manager reads document types by default (BL-680)');
select isnt(public.workspace_has_permission('24000000-0000-4000-8000-000000000001', 'documents.manage'), true, 'manager does not manage document types');

set local role service_role;
select lives_ok(
  $$select public.save_document_type_service(
    '14000000-0000-4000-8000-000000000001',
    '24000000-0000-4000-8000-000000000001', null, 'Food handler card', 'Current certification',
    true, true, array['pdf', 'jpeg', 'png']::text[], true, 30, 'warn'
  )$$,
  'owner can create a required expiring document type'
);
select lives_ok(
  $$select public.save_document_type_service(
    '14000000-0000-4000-8000-000000000001',
    '24000000-0000-4000-8000-000000000001', null, 'Team handbook', 'Signed acknowledgement handled later',
    false, false, array['pdf']::text[], false, 30
  )$$,
  'owner can create an optional document type'
);
set local role postgres;
create temporary table document_type_ids (label text primary key, id uuid not null);
insert into document_type_ids
select title, id from public.document_types
where workspace_id = '24000000-0000-4000-8000-000000000001' and title in ('Food handler card', 'Team handbook');
grant select on document_type_ids to service_role;
select is((select count(*)::integer from public.document_types where workspace_id = '24000000-0000-4000-8000-000000000001'), 2, 'document types are stored');
select ok(
  (select required_at_onboarding and requires_review and tracks_expiry from public.document_types where workspace_id = '24000000-0000-4000-8000-000000000001' and title = 'Food handler card'),
  'workflow metadata is persisted'
);
select is(
  (select expiry_schedule_impact::text from public.document_types where workspace_id = '24000000-0000-4000-8000-000000000001' and title = 'Food handler card'),
  'warn',
  'expiry schedule impact is persisted'
);
select is((select count(*)::integer from public.audit_events where action = 'document_type.created' and workspace_id = '24000000-0000-4000-8000-000000000001'), 2, 'document creation is audited');
set local role service_role;
select lives_ok(
  $$select public.reorder_document_types_service(
    '14000000-0000-4000-8000-000000000001',
    '24000000-0000-4000-8000-000000000001',
    array[
      (select id from document_type_ids where label = 'Team handbook'),
      (select id from document_type_ids where label = 'Food handler card')
    ]::uuid[]
  )$$,
  'owner can reorder every active document type'
);
set local role postgres;
select is((select title from public.document_types where workspace_id = '24000000-0000-4000-8000-000000000001' order by sort_order limit 1), 'Team handbook', 'document order is persisted');
set local role service_role;
select throws_ok(
  $$select public.save_document_type_service(
    '14000000-0000-4000-8000-000000000001',
    '24000000-0000-4000-8000-000000000001', null, 'food HANDLER card', '',
    false, true, array['pdf']::text[], false, 30
  )$$,
  '23505', null, 'active document names are unique ignoring case'
);
select throws_ok(
  $$select public.save_document_type_service(
    '14000000-0000-4000-8000-000000000001',
    '24000000-0000-4000-8000-000000000001', null, 'Executable', '',
    false, false, array['exe']::text[], false, 30
  )$$,
  '22023', 'document formats contain unsupported values', 'unsupported formats are rejected'
);
select throws_ok(
  $$select public.save_document_type_service(
    '14000000-0000-4000-8000-000000000001',
    '24000000-0000-4000-8000-000000000001', null, 'Optional blocker', '',
    false, true, array['pdf']::text[], true, 30, 'block'
  )$$,
  '22023', 'only required documents can create hard schedule conflicts', 'optional documents cannot create hard schedule conflicts'
);

set local role service_role;
select lives_ok(
  $$select public.save_document_type_service(
    '14000000-0000-4000-8000-000000000002',
    '24000000-0000-4000-8000-000000000001',
    (select id from document_type_ids where label = 'Team handbook'),
    'Team handbook', 'Current handbook upload', false, true, array['pdf']::text[], false, 30
  )$$,
  'admin can update a document type'
);
set local role postgres;
select is((select description from public.document_types where workspace_id = '24000000-0000-4000-8000-000000000001' and title = 'Team handbook'), 'Current handbook upload', 'document update is persisted');
set local role service_role;
select lives_ok(
  $$select public.set_document_type_archived_service(
    '14000000-0000-4000-8000-000000000002',
    '24000000-0000-4000-8000-000000000001',
    (select id from document_type_ids where label = 'Team handbook'), true
  )$$,
  'admin can archive a document type'
);
set local role postgres;
select is((select count(*)::integer from public.audit_events where action = 'document_type.archived' and workspace_id = '24000000-0000-4000-8000-000000000001'), 1, 'document archive is audited');

set local role service_role;
-- BL-680: the built-in manager reads the catalog; it still writes nothing (below).
select lives_ok(
  $$select public.list_settings_document_types_service(
    '14000000-0000-4000-8000-000000000003', '24000000-0000-4000-8000-000000000001')$$,
  'built-in manager lists document types (BL-680)'
);
select throws_ok(
  $$select public.save_document_type_service(
    '14000000-0000-4000-8000-000000000003',
    '24000000-0000-4000-8000-000000000001', null, 'Unauthorized', '',
    false, false, array['pdf']::text[], false, 30
  )$$,
  '42501', 'Not allowed', 'manager cannot create a document type'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000002', true);
set local role postgres;
create temporary table document_role_state (role_id uuid primary key);
grant all on table document_role_state to service_role, authenticated;
set local role postgres;
-- An admin holds every default permission except roles.manage, which stays
-- with the owner unless the owner hands it over. This suite has its admin
-- build a custom role, so the owner hands it over first.
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key)
select r.workspace_id, r.id, 'roles.manage' from public.workspace_roles r
where r.workspace_id='24000000-0000-4000-8000-000000000001' and r.system_key='admin'
on conflict do nothing;
set local role service_role;
-- documents.manage is the owner's and admin's (GUVENLIK-A GA-2).
select throws_ok(
  $$select public.save_workspace_role_service(
    '14000000-0000-4000-8000-000000000002',
    '24000000-0000-4000-8000-000000000001', null, 'Document editor', '', 'manager',
    array['workspace.read', 'documents.read', 'documents.manage']::text[])$$,
  '42501', 'Permission is not eligible for a lower role',
  'Settings > Roles cannot put documents.manage on a manager-type role'
);
insert into document_role_state
select public.save_workspace_role_service(
  '14000000-0000-4000-8000-000000000002',
  '24000000-0000-4000-8000-000000000001', null, 'Document coordinator', '', 'manager',
  array['workspace.read', 'documents.read']::text[]
);
set local role postgres;
-- documents.manage written straight into the table: the write check below
-- proves the core still says no to a manager-type role that holds it.
insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
select '24000000-0000-4000-8000-000000000001', role_id, 'documents.manage' from document_role_state;
select is(
  (select count(*)::integer from public.workspace_role_permissions where role_id = (select role_id from document_role_state) and permission_key like 'documents.%'),
  2,
  'the custom role holds documents.read from Settings > Roles and documents.manage written for the next check'
);
select lives_ok(
  $$update public.workspace_memberships
    set role_id = (select role_id from document_role_state)
    where id = '34000000-0000-4000-8000-000000000003'$$,
  'admin can assign the custom document role'
);

set local role service_role;
select is(
  jsonb_array_length(public.list_settings_document_types_service(
    '14000000-0000-4000-8000-000000000003', '24000000-0000-4000-8000-000000000001')),
  2, 'custom document role can read the catalog'
);
-- Writing Settings is an owner's or an admin's: a manager-type role reaches no
-- workspace-wide write under M2, whatever permission it holds (org/write).
select throws_ok(
  $$select public.save_document_type_service(
    '14000000-0000-4000-8000-000000000003',
    '24000000-0000-4000-8000-000000000001', null, 'Profile photo', '',
    false, true, array['jpeg', 'png', 'webp']::text[], false, 30
  )$$,
  '42501', 'Not allowed', 'a manager-type role with documents.manage still cannot create a type'
);

set local role service_role;
select throws_ok(
  $$select public.list_settings_document_types_service(
    '14000000-0000-4000-8000-000000000004', '24000000-0000-4000-8000-000000000001')$$,
  '42501', 'Not allowed', 'other tenant cannot read document types'
);
-- The catalog is read through the API only (FB-6.1.9): the browser reads
-- no document type, not even the owner.
set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select count(*) from public.document_types$$,
  '42501', null, 'the browser cannot read document types'
);
set local role service_role;
select throws_ok(
  $$select public.save_document_type_service(
    '14000000-0000-4000-8000-000000000004',
    '24000000-0000-4000-8000-000000000001', null, 'Cross tenant', '',
    false, false, array['pdf']::text[], false, 30
  )$$,
  '42501', 'Not allowed', 'other tenant cannot create document types'
);

select * from finish();
rollback;
