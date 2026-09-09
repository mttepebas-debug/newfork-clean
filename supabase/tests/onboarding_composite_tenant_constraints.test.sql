begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000171', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'constraint-owner-a@example.test', '', '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000172', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'constraint-owner-b@example.test', '', '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000173', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'constraint-member-b@example.test', '', '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values
  ('20000000-0000-4000-8000-000000000171', 'Composite Tenant A', '10000000-0000-4000-8000-000000000171'),
  ('20000000-0000-4000-8000-000000000172', 'Composite Tenant B', '10000000-0000-4000-8000-000000000172');

insert into public.workspace_memberships (id, workspace_id, user_id, role, status)
values
  ('30000000-0000-4000-8000-000000000171', '20000000-0000-4000-8000-000000000171', '10000000-0000-4000-8000-000000000171', 'owner', 'active'),
  ('30000000-0000-4000-8000-000000000172', '20000000-0000-4000-8000-000000000172', '10000000-0000-4000-8000-000000000172', 'owner', 'active'),
  ('30000000-0000-4000-8000-000000000173', '20000000-0000-4000-8000-000000000172', '10000000-0000-4000-8000-000000000173', 'employee', 'active');

insert into public.employee_profiles (id, workspace_id, employee_code, first_name, last_name, created_by)
values
  ('40000000-0000-4000-8000-000000000171', '20000000-0000-4000-8000-000000000171', 'E-0171', 'Ava', 'Alpha', '10000000-0000-4000-8000-000000000171'),
  ('40000000-0000-4000-8000-000000000172', '20000000-0000-4000-8000-000000000172', 'E-0172', 'Ben', 'Beta', '10000000-0000-4000-8000-000000000172'),
  ('40000000-0000-4000-8000-000000000173', '20000000-0000-4000-8000-000000000171', 'E-0173', 'Cara', 'Alpha', '10000000-0000-4000-8000-000000000171');

insert into public.employee_onboarding_cases (id, workspace_id, employee_id, membership_id, status)
values
  ('50000000-0000-4000-8000-000000000171', '20000000-0000-4000-8000-000000000171', '40000000-0000-4000-8000-000000000171', '30000000-0000-4000-8000-000000000171', 'in_progress'),
  ('50000000-0000-4000-8000-000000000172', '20000000-0000-4000-8000-000000000172', '40000000-0000-4000-8000-000000000172', '30000000-0000-4000-8000-000000000172', 'in_progress');

insert into public.employee_onboarding_requirements (id, workspace_id, case_id, employee_id, kind, source_id, title, required, blocks_activation, sort_order)
values
  ('60000000-0000-4000-8000-000000000172', '20000000-0000-4000-8000-000000000172', '50000000-0000-4000-8000-000000000172', '40000000-0000-4000-8000-000000000172', 'document', null, 'Tenant B document', true, true, 1);

select is(
  (select count(*)::integer from pg_constraint where conname = 'employee_onboarding_cases_membership_id_workspace_id_fkey'),
  1,
  'employee onboarding cases membership FK is workspace-aware'
);

select is(
  (select count(*)::integer from pg_constraint where conname = 'employee_documents_requirement_id_workspace_id_fkey'),
  1,
  'employee document requirement FK is workspace-aware'
);

select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.employee_acknowledgement_envelopes'::regclass
      and pg_get_constraintdef(oid) = 'FOREIGN KEY (template_version_id, workspace_id) REFERENCES signature_template_versions(id, workspace_id) ON DELETE RESTRICT'
  ),
  1,
  'acknowledgement template version FK is workspace-aware'
);

select is(
  (select count(*)::integer from pg_constraint where conname = 'onboarding_events_case_id_workspace_id_fkey'),
  1,
  'onboarding event case FK is workspace-aware'
);

select throws_ok(
  $$insert into public.employee_onboarding_cases (id, workspace_id, employee_id, membership_id, status)
    values ('50000000-0000-4000-8000-000000000173', '20000000-0000-4000-8000-000000000171', '40000000-0000-4000-8000-000000000173', '30000000-0000-4000-8000-000000000173', 'in_progress')$$,
  '23503',
  null,
  'case cannot bind a membership from another workspace'
);

select throws_ok(
  $$insert into public.employee_documents (id, workspace_id, employee_id, requirement_id, version_number, object_path, original_filename, media_type, size_bytes, review_status, uploaded_by)
    values ('70000000-0000-4000-8000-000000000171', '20000000-0000-4000-8000-000000000171', '40000000-0000-4000-8000-000000000171', '60000000-0000-4000-8000-000000000172', 1, '20000000-0000-4000-8000-000000000171/40000000-0000-4000-8000-000000000171/60000000-0000-4000-8000-000000000172/70000000-0000-4000-8000-000000000171.pdf', 'tenant-b-doc.pdf', 'application/pdf', 100, 'accepted', '10000000-0000-4000-8000-000000000171')$$,
  '23503',
  null,
  'document cannot bind a requirement from another workspace'
);

select throws_ok(
  $$insert into public.employee_availability_versions (id, workspace_id, employee_id, case_id, version_number, timezone, recurring_rules, confirmed_by)
    values ('80000000-0000-4000-8000-000000000171', '20000000-0000-4000-8000-000000000171', '40000000-0000-4000-8000-000000000171', '50000000-0000-4000-8000-000000000172', 1, 'America/New_York', '[{}, {}, {}, {}, {}, {}, {}]'::jsonb, '10000000-0000-4000-8000-000000000171')$$,
  '23503',
  null,
  'availability cannot bind a case from another workspace'
);

select throws_ok(
  $$insert into public.onboarding_events (id, workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id)
    values ('90000000-0000-4000-8000-000000000171', '20000000-0000-4000-8000-000000000171', '40000000-0000-4000-8000-000000000171', '50000000-0000-4000-8000-000000000172', '10000000-0000-4000-8000-000000000171', 'onboarding.test', 'case', '50000000-0000-4000-8000-000000000172')$$,
  '23503',
  null,
  'onboarding event cannot bind a case from another workspace'
);

select * from finish();
rollback;
