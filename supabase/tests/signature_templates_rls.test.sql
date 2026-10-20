begin;
create extension if not exists pgtap with schema extensions;
select plan(49);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('15000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'signature-owner@example.test', '', '{}', '{}', now(), now()),
  ('15000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'signature-admin@example.test', '', '{}', '{}', now(), now()),
  ('15000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'signature-manager@example.test', '', '{}', '{}', now(), now()),
  ('15000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'signature-outsider@example.test', '', '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values
  ('25000000-0000-4000-8000-000000000001', 'Signature Workspace', '15000000-0000-4000-8000-000000000001'),
  ('25000000-0000-4000-8000-000000000002', 'Other Signature Workspace', '15000000-0000-4000-8000-000000000004');

insert into public.workspace_memberships (id, workspace_id, user_id, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
  ('35000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001', 'owner'),
  ('35000000-0000-4000-8000-000000000002', '25000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000002', 'admin'),
  ('35000000-0000-4000-8000-000000000003', '25000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000003', 'manager'),
  ('35000000-0000-4000-8000-000000000004', '25000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000004', 'owner')) as legacy(id, workspace_id, user_id, role);

set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000001', true);
select ok(public.workspace_has_permission('25000000-0000-4000-8000-000000000001', 'documents.read'), 'owner receives documents.read, which opens acknowledgements too');
select ok(public.workspace_has_permission('25000000-0000-4000-8000-000000000001', 'documents.manage'), 'owner receives documents.manage');

select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000002', true);
select ok(public.workspace_has_permission('25000000-0000-4000-8000-000000000001', 'documents.manage'), 'admin receives documents.manage');

select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000003', true);
-- BL-680 (K14 S1, S3): the built-in manager reads the acknowledgements and changes none.
select ok(public.workspace_has_permission('25000000-0000-4000-8000-000000000001', 'documents.read'), 'manager reads acknowledgements by default (BL-680)');
select isnt(public.workspace_has_permission('25000000-0000-4000-8000-000000000001', 'documents.manage'), true, 'manager does not manage acknowledgements');

select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000001', true);
set local role postgres;
select lives_ok(
  $$select public.save_signature_retention_policy_service(
    '15000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000001', null, 'Policy acknowledgements',
    'employment_end', 1095, 'Workspace policy', 'Internal records schedule v1'
  )$$,
  'owner can create a draft retention policy'
);
select is((select count(*)::integer from public.signature_retention_policies where status = 'draft'), 1, 'draft retention policy is stored');
select is((select count(*)::integer from public.audit_events where action = 'signature_retention_policy.created'), 1, 'retention creation is audited');

select lives_ok(
  $$select public.save_signature_template_draft_service(
    '15000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000001', null,
    'Team handbook acknowledgement', 'Confirms receipt of the current handbook.',
    E'Team handbook\n\nFollow the published workplace policies.',
    'I acknowledge that I received and reviewed this policy.', 'en-US', '2026-08-17',
    true, true, (select id from public.signature_retention_policies where name = 'Policy acknowledgements')
  )$$,
  'owner can create an acknowledgement draft'
);
select is((select count(*)::integer from public.signature_templates), 1, 'template directory row is stored');
select is((select count(*)::integer from public.signature_template_versions where status = 'draft'), 1, 'draft version is stored');
select is(
  (select content_digest from public.signature_template_versions),
  encode(extensions.digest(convert_to(E'Team handbook\n\nFollow the published workplace policies.', 'UTF8'), 'sha256'), 'hex'),
  'canonical content digest is generated by the server'
);
select throws_ok(
  $$select public.publish_signature_template_service(
    '15000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000001',
    (select id from public.signature_templates where name = 'Team handbook acknowledgement')
  )$$,
  '22023', 'approved active retention policy required for publication',
  'publication fails closed while retention remains draft'
);
select throws_ok(
  $$select public.save_signature_template_draft_service(
    '15000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000001', null, 'Invalid blocker', '', 'Content',
    'I acknowledge receipt.', 'en-US', '2026-08-17', false, true,
    (select id from public.signature_retention_policies where name = 'Policy acknowledgements')
  )$$,
  '22023', 'activation blocking requires onboarding assignment',
  'activation blocking cannot be enabled for an optional template'
);
select lives_ok(
  $$select public.save_signature_retention_policy_service(
    '15000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000001',
    (select id from public.signature_retention_policies where name = 'Policy acknowledgements'),
    'Policy acknowledgements', 'employment_end', 1460, 'Workspace policy', 'Internal records schedule v2'
  )$$,
  'draft retention policy can be edited'
);
select lives_ok(
  $$select public.approve_signature_retention_policy_service(
    '15000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000001',
    (select id from public.signature_retention_policies where name = 'Policy acknowledgements')
  )$$,
  'owner can explicitly approve retention terms'
);
select is((select status::text from public.signature_retention_policies), 'approved', 'approved status is persisted');
select throws_ok(
  $$select public.save_signature_retention_policy_service(
    '15000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000001',
    (select id from public.signature_retention_policies where name = 'Policy acknowledgements'),
    'Changed', 'signed_at', 30, 'Changed', 'Changed'
  )$$,
  'P0002', 'editable retention policy not found', 'approved policy cannot be edited through RPC'
);
select is((select count(*)::integer from public.audit_events where action = 'signature_retention_policy.approved'), 1, 'retention approval is audited');
select lives_ok(
  $$select public.publish_signature_template_service(
    '15000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000001',
    (select id from public.signature_templates where name = 'Team handbook acknowledgement')
  )$$,
  'approved retention permits publication'
);
select is((select status::text from public.signature_template_versions), 'published', 'published status is persisted');
select is((select count(*)::integer from public.audit_events where action = 'signature_template.published'), 1, 'publication is audited');
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$update public.signature_template_versions set content_text = 'tampered'$$,
  '42501', 'permission denied for table signature_template_versions', 'authenticated clients cannot mutate published versions directly'
);
set local role postgres;
select throws_ok(
  $$update public.signature_template_versions set content_text = 'tampered' where status = 'published'$$,
  '55000', 'published acknowledgement versions are immutable', 'published version trigger rejects privileged mutation'
);
select throws_ok(
  $$update public.signature_retention_policies set duration_days = 1 where status = 'approved'$$,
  '55000', 'approved retention policies are immutable', 'approved retention trigger rejects privileged mutation'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000001', true);
set local role postgres;
select lives_ok(
  $$select public.set_signature_retention_policy_archived_service(
    '15000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000001',
    (select id from public.signature_retention_policies where name = 'Policy acknowledgements'), true
  )$$,
  'approved retention policy can be archived without mutation'
);
select ok((select archived_at is not null from public.signature_retention_policies), 'retention archive is persisted');
select lives_ok(
  $$select public.set_signature_retention_policy_archived_service(
    '15000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000001',
    (select id from public.signature_retention_policies where name = 'Policy acknowledgements'), false
  )$$,
  'approved retention policy can be restored'
);
select lives_ok(
  $$select public.save_signature_template_draft_service(
    '15000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000001',
    (select id from public.signature_templates where name = 'Team handbook acknowledgement'),
    'Team handbook acknowledgement', 'Updated handbook acknowledgement.',
    E'Team handbook version two\n\nFollow the current workplace policies.',
    'I acknowledge that I received and reviewed this policy.', 'en-US', '2026-09-01',
    true, true, (select id from public.signature_retention_policies where name = 'Policy acknowledgements')
  )$$,
  'editing a published template creates a new draft'
);
select is((select count(*)::integer from public.signature_template_versions), 2, 'published and draft versions coexist');
select is(
  (select content_text from public.signature_template_versions where version_number = 1),
  E'Team handbook\n\nFollow the published workplace policies.',
  'published content remains unchanged'
);
select lives_ok(
  $$select public.publish_signature_template_service(
    '15000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000001',
    (select id from public.signature_templates where name = 'Team handbook acknowledgement')
  )$$,
  'new draft version can be published'
);
select is((select count(*)::integer from public.signature_template_versions where status = 'published'), 2, 'multiple immutable published versions are retained');
select lives_ok(
  $$select public.set_signature_template_archived_service(
    '15000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000001',
    (select id from public.signature_templates where name = 'Team handbook acknowledgement'), true
  )$$,
  'template can be archived'
);
select is((select count(*)::integer from public.audit_events where action = 'signature_template.archived'), 1, 'template archive is audited');
select lives_ok(
  $$select public.set_signature_template_archived_service(
    '15000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000001',
    (select id from public.signature_templates where name = 'Team handbook acknowledgement'), false
  )$$,
  'template can be restored'
);

set local role postgres;
-- BL-680: the built-in manager reads the acknowledgements; it still writes nothing (below).
select lives_ok(
  $$select public.read_signature_settings_service(
    '15000000-0000-4000-8000-000000000003', '25000000-0000-4000-8000-000000000001')$$,
  'built-in manager lists templates (BL-680)'
);
select throws_ok(
  $$select public.save_signature_retention_policy_service(
    '15000000-0000-4000-8000-000000000003',
    '25000000-0000-4000-8000-000000000001', null, 'Unauthorized',
    'signed_at', 30, 'None', 'None'
  )$$,
  '42501', 'Not allowed', 'manager cannot create retention policy'
);

select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000002', true);
set local role postgres;
create temporary table signature_role_state (role_id uuid primary key);
grant all on table signature_role_state to service_role, authenticated;
set local role postgres;
-- An admin holds every default permission except roles.manage, which stays
-- with the owner unless the owner hands it over. This suite has its admin
-- build a custom role, so the owner hands it over first.
insert into public.workspace_role_permissions(workspace_id,role_id,permission_key)
select r.workspace_id, r.id, 'roles.manage' from public.workspace_roles r
where r.workspace_id='25000000-0000-4000-8000-000000000001' and r.system_key='admin'
on conflict do nothing;
set local role service_role;
-- documents.manage is the owner's and admin's (GUVENLIK-A GA-2).
select throws_ok(
  $$select public.save_workspace_role_service(
    '15000000-0000-4000-8000-000000000002',
    '25000000-0000-4000-8000-000000000001', null, 'Policy editor', '', 'manager',
    array['workspace.read', 'documents.read', 'documents.manage']::text[])$$,
  '42501', 'Permission is not eligible for a lower role',
  'Settings > Roles cannot put documents.manage on a manager-type role'
);
insert into signature_role_state
select public.save_workspace_role_service(
  '15000000-0000-4000-8000-000000000002',
  '25000000-0000-4000-8000-000000000001', null, 'Policy coordinator', '', 'manager',
  array['workspace.read', 'documents.read']::text[]
);
set local role postgres;
-- documents.manage written straight into the table: the write check below
-- proves the core still says no to a manager-type role that holds it.
insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
select '25000000-0000-4000-8000-000000000001', role_id, 'documents.manage' from signature_role_state;
select is((select count(*)::integer from signature_role_state), 1, 'admin can create a custom acknowledgement role');
select is(
  (select count(*)::integer from public.workspace_role_permissions where role_id = (select role_id from signature_role_state) and permission_key like 'documents.%'),
  2, 'the custom role holds documents.read from Settings > Roles and documents.manage written for the next check'
);
select lives_ok(
  $$update public.workspace_memberships set role_id = (select role_id from signature_role_state)
    where id = '35000000-0000-4000-8000-000000000003'$$,
  'admin can assign the custom acknowledgement role'
);

set local role postgres;
select is(
  jsonb_array_length(public.read_signature_settings_service(
    '15000000-0000-4000-8000-000000000003', '25000000-0000-4000-8000-000000000001') -> 'templates'),
  1, 'custom role can read acknowledgement templates'
);
-- Writing Settings is an owner's or an admin's: a manager-type role reaches no
-- workspace-wide write under M2, whatever permission it holds (org/write).
select throws_ok(
  $$select public.save_signature_retention_policy_service(
    '15000000-0000-4000-8000-000000000003',
    '25000000-0000-4000-8000-000000000001', null, 'Short notices',
    'signed_at', 365, 'Workspace notices', 'Internal schedule'
  )$$,
  '42501', 'Not allowed', 'a manager-type role with documents.manage still cannot create a retention policy'
);

set local role postgres;
select throws_ok(
  $$select public.read_signature_settings_service(
    '15000000-0000-4000-8000-000000000004', '25000000-0000-4000-8000-000000000001')$$,
  '42501', 'Not allowed', 'other tenant cannot read templates or retention policies'
);
-- Acknowledgements are read through the API only (FB-6.1.9): the browser
-- reads none of the three tables, not even the owner.
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000001', true);
select throws_ok($$select count(*) from public.signature_templates$$, '42501', null,
  'the browser cannot read acknowledgement templates');
select throws_ok($$select count(*) from public.signature_template_versions$$, '42501', null,
  'the browser cannot read acknowledgement versions');
select throws_ok($$select count(*) from public.signature_retention_policies$$, '42501', null,
  'the browser cannot read retention policies');
set local role postgres;
select throws_ok(
  $$select public.save_signature_template_draft_service(
    '15000000-0000-4000-8000-000000000004',
    '25000000-0000-4000-8000-000000000001', null, 'Cross tenant', '', 'Content',
    'I acknowledge receipt.', 'en-US', '2026-08-17', true, true,
    '25000000-0000-4000-8000-000000000001'
  )$$,
  '42501', 'Not allowed', 'other tenant cannot save acknowledgement drafts'
);

select * from finish();
rollback;
