begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select is(
  (select public from storage.buckets where id = 'employee-onboarding'),
  false,
  'employee onboarding documents bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'employee-onboarding'),
  10485760::bigint,
  'employee onboarding documents bucket is capped at 10 MB'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'employee-onboarding'),
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  'employee onboarding documents bucket restricts MIME types'
);
select is(
  (select public from storage.buckets where id = 'employee-profile-photos'),
  false,
  'employee profile photos bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'employee-profile-photos'),
  5242880::bigint,
  'employee profile photos bucket is capped at 5 MB'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'employee-profile-photos'),
  array['image/jpeg', 'image/png', 'image/webp'],
  'employee profile photos bucket restricts MIME types'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and roles::text like '%authenticated%'
      and (
        coalesce(qual, '') like '%employee-onboarding%'
        or coalesce(with_check, '') like '%employee-onboarding%'
        or coalesce(qual, '') like '%employee-profile-photos%'
        or coalesce(with_check, '') like '%employee-profile-photos%'
      )
  ),
  0,
  'private employee buckets have no direct authenticated storage object policies'
);

set local role service_role;
select ok(
  app_private.is_employee_onboarding_document_path(
    '27000000-0000-4000-8000-000000000001/47000000-0000-4000-8000-000000000001/57000000-0000-4000-8000-000000000001/67000000-0000-4000-8000-000000000001.pdf',
    '27000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000001'
  ),
  'service role can validate a tenant-scoped employee document path'
);
select isnt(
  app_private.is_employee_onboarding_document_path(
    '27000000-0000-4000-8000-000000000001/47000000-0000-4000-8000-000000000001/57000000-0000-4000-8000-000000000001/photo-id.pdf',
    '27000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000001'
  ),
  true,
  'free-form employee document filenames are rejected'
);

set local role authenticated;
select throws_ok(
  $$select app_private.is_employee_onboarding_document_path(
    '27000000-0000-4000-8000-000000000001/47000000-0000-4000-8000-000000000001/57000000-0000-4000-8000-000000000001/67000000-0000-4000-8000-000000000001.pdf',
    '27000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  null,
  'authenticated users cannot call the private storage path helper directly'
);

reset role;
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('27000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'storage-owner@example.test', '', '{}', '{}', now(), now()),
  ('27000000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'storage-employee@example.test', '', '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values ('27000000-0000-4000-8000-000000000021', 'Storage Closure Workspace', '27000000-0000-4000-8000-000000000011');

insert into public.workspace_memberships (id, workspace_id, user_id, role, status)
values
  ('27000000-0000-4000-8000-000000000031', '27000000-0000-4000-8000-000000000021', '27000000-0000-4000-8000-000000000011', 'owner', 'active'),
  ('27000000-0000-4000-8000-000000000032', '27000000-0000-4000-8000-000000000021', '27000000-0000-4000-8000-000000000012', 'employee', 'active');

insert into public.employee_profiles (
  id, workspace_id, user_id, employee_code, first_name, last_name, created_by
) values (
  '27000000-0000-4000-8000-000000000041',
  '27000000-0000-4000-8000-000000000021',
  '27000000-0000-4000-8000-000000000012',
  'E-2701',
  'Storage',
  'Employee',
  '27000000-0000-4000-8000-000000000011'
);

insert into public.employee_onboarding_cases (
  id, workspace_id, employee_id, membership_id, status, approved_by, approved_at
) values (
  '27000000-0000-4000-8000-000000000051',
  '27000000-0000-4000-8000-000000000021',
  '27000000-0000-4000-8000-000000000041',
  '27000000-0000-4000-8000-000000000032',
  'approved',
  '27000000-0000-4000-8000-000000000011',
  now()
);

insert into public.employee_onboarding_requirements (
  id, workspace_id, case_id, employee_id, kind, source_id, title,
  required, blocks_activation, requires_review, sort_order, status
) values (
  '27000000-0000-4000-8000-000000000061',
  '27000000-0000-4000-8000-000000000021',
  '27000000-0000-4000-8000-000000000051',
  '27000000-0000-4000-8000-000000000041',
  'document',
  '27000000-0000-4000-8000-000000000071',
  'Storage document',
  true,
  true,
  false,
  1,
  'completed'
);

insert into public.employee_documents (
  id, workspace_id, employee_id, requirement_id, version_number, object_path,
  original_filename, media_type, size_bytes, review_status, uploaded_by
) values (
  '27000000-0000-4000-8000-000000000081',
  '27000000-0000-4000-8000-000000000021',
  '27000000-0000-4000-8000-000000000041',
  '27000000-0000-4000-8000-000000000061',
  1,
  '27000000-0000-4000-8000-000000000021/27000000-0000-4000-8000-000000000041/27000000-0000-4000-8000-000000000061/27000000-0000-4000-8000-000000000081.pdf',
  'storage-document.pdf',
  'application/pdf',
  128,
  'accepted',
  '27000000-0000-4000-8000-000000000012'
);

set local role service_role;
select is(
  public.get_employee_document_path_service(
    '27000000-0000-4000-8000-000000000011',
    '27000000-0000-4000-8000-000000000021',
    '27000000-0000-4000-8000-000000000041',
    '27000000-0000-4000-8000-000000000061'
  ),
  '27000000-0000-4000-8000-000000000021/27000000-0000-4000-8000-000000000041/27000000-0000-4000-8000-000000000061/27000000-0000-4000-8000-000000000081.pdf',
  'authorized owner can resolve a private employee document path'
);

select lives_ok(
  $$select public.request_workspace_closure_service(
    '27000000-0000-4000-8000-000000000011',
    '27000000-0000-4000-8000-000000000021',
    'immediate',
    'Storage Closure Workspace',
    true,
    null
  )$$,
  'owner can close the storage test workspace'
);

select throws_ok(
  $$select public.get_employee_document_path_service(
    '27000000-0000-4000-8000-000000000011',
    '27000000-0000-4000-8000-000000000021',
    '27000000-0000-4000-8000-000000000041',
    '27000000-0000-4000-8000-000000000061'
  )$$,
  'P0002',
  'employee document unavailable',
  'private document path resolution is denied after immediate workspace closure'
);

select * from finish();
rollback;
