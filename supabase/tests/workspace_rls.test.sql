begin;
create extension if not exists pgtap with schema extensions;
select plan(113);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@example.test', '', '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider@example.test', '', '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.test', '', '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'draft-owner@example.test', '', '{}', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'no-org@example.test', '', '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values
  ('20000000-0000-4000-8000-000000000001', 'RLS Test Workspace', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'Second Test Workspace', '10000000-0000-4000-8000-000000000003'),
  ('20000000-0000-4000-8000-000000000003', 'Foreign Test Workspace', '10000000-0000-4000-8000-000000000003');

insert into public.workspace_memberships (id, workspace_id, user_id, status, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'admin', 'active'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'owner', 'active'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'employee', 'active'),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'owner', 'active'),
  ('30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'employee', 'suspended')) as legacy(id, workspace_id, user_id, role, status);

-- The owner membership above opened the account row (KK-179 (2)); this names it.
insert into public.user_profiles (user_id, display_name)
values ('10000000-0000-4000-8000-000000000001', 'Test Owner')
on conflict (user_id) do update set display_name = excluded.display_name;

insert into public.user_preferences (user_id, theme)
values ('10000000-0000-4000-8000-000000000001', 'system');

insert into public.workspace_onboarding (workspace_id, status, current_step, completed_at, updated_by)
values
  ('20000000-0000-4000-8000-000000000001', 'complete', 4, now(), '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'complete', 4, now(), '10000000-0000-4000-8000-000000000003'),
  ('20000000-0000-4000-8000-000000000003', 'complete', 4, now(), '10000000-0000-4000-8000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is((select count(*)::integer from public.workspaces), 2, 'member sees own workspaces');
select is((select public.workspace_role_for('20000000-0000-4000-8000-000000000001')), 'owner'::public.workspace_role, 'member role resolves');
set local role service_role;
select is((select count(*)::integer from public.resolve_workspace_context_service('10000000-0000-4000-8000-000000000001')), 0, 'multiple active workspaces without a default do not resolve randomly');
select is((select count(*)::integer from public.list_my_workspaces_service('10000000-0000-4000-8000-000000000001')), 3, 'same account can belong to active and non-active workspaces');
select is(
  (
    select workspace_role
    from public.list_my_workspaces_service('10000000-0000-4000-8000-000000000001')
    where workspace_id = '20000000-0000-4000-8000-000000000002'
  ),
  'employee'::public.workspace_role,
  'same account can hold a different role in another workspace'
);
select is(
  (
    select membership_status
    from public.list_my_workspaces_service('10000000-0000-4000-8000-000000000001')
    where workspace_id = '20000000-0000-4000-8000-000000000003'
  ),
  'suspended'::public.membership_status,
  'workspace switcher projection retains suspended memberships'
);
reset role;
select lives_ok(
  $$insert into public.user_workspace_preferences (user_id, active_workspace_id)
    values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002')$$,
  'direct active workspace preference accepts an active membership'
);
select is((select count(*)::integer from public.resolve_workspace_context_service('10000000-0000-4000-8000-000000000001')), 1, 'active workspace resolves after explicit default selection');
select throws_ok(
  $$update public.user_workspace_preferences
    set active_workspace_id = '20000000-0000-4000-8000-000000000003'
    where user_id = '10000000-0000-4000-8000-000000000001'$$,
  '23514',
  'active workspace preference requires active completed membership',
  'direct active workspace preference rejects a foreign workspace'
);
create temporary table test_owner_draft_results(id uuid);
grant select on test_owner_draft_results to service_role;
insert into test_owner_draft_results
select public.create_owner_workspace_service(
  '10000000-0000-4000-8000-000000000004',
  'Draft Bistro'
);
insert into test_owner_draft_results
select public.create_owner_workspace_service(
  '10000000-0000-4000-8000-000000000004',
  'Draft Bistro Retry'
);
select is(
  (select count(distinct id)::integer from test_owner_draft_results),
  1,
  'owner workspace creation reuses the same incomplete draft'
);
select is(
  (
    select count(*)::integer
    from public.workspace_memberships
    where user_id = '10000000-0000-4000-8000-000000000004'
      and coalesce((select r.access_class::text from public.workspace_roles r where r.id = role_id), 'employee') = 'owner'
  ),
  1,
  'owner workspace creation does not create duplicate owner drafts'
);
select throws_ok(
  $$insert into public.user_workspace_preferences (user_id, active_workspace_id)
    values ('10000000-0000-4000-8000-000000000004', (select id from test_owner_draft_results limit 1))$$,
  '23514',
  'active workspace preference requires active completed membership',
  'draft owner workspace cannot be selected as a default organization'
);
insert into public.locations (short_name,
  id, workspace_id, name, street_address, city, region, postal_code, country_code, timezone
) values ('T00080',
  '40000000-0000-4000-8000-000000000010',
  (select id from test_owner_draft_results limit 1),
  'Draft Location',
  '10 Draft St',
  'Los Angeles',
  'CA',
  '90010',
  'US',
  'America/Los_Angeles'
);
insert into public.departments (id, workspace_id, name, color)
values (
  '41000000-0000-4000-8000-000000000010',
  (select id from test_owner_draft_results limit 1),
  'Draft Department',
  '#3C7A68'
);
insert into public.jobs (id, workspace_id, department_id, name, color)
values (
  '42000000-0000-4000-8000-000000000010',
  (select id from test_owner_draft_results limit 1),
  '41000000-0000-4000-8000-000000000010',
  'Draft Job',
  '#4478A8'
);
insert into public.employee_profiles (
  id, workspace_id, employee_code, first_name, last_name, created_by
) values (
  '43000000-0000-4000-8000-000000000010',
  (select id from test_owner_draft_results limit 1),
  'E-0001',
  'Draft',
  'Employee',
  '10000000-0000-4000-8000-000000000004'
);
insert into public.employee_location_assignments (
  workspace_id, employee_id, location_id, is_primary, created_by
) values (
  (select id from test_owner_draft_results limit 1),
  '43000000-0000-4000-8000-000000000010',
  '40000000-0000-4000-8000-000000000010',
  true,
  '10000000-0000-4000-8000-000000000004'
);
insert into public.employee_job_assignments (
  workspace_id, employee_id, job_id, is_primary, created_by
) values (
  (select id from test_owner_draft_results limit 1),
  '43000000-0000-4000-8000-000000000010',
  '42000000-0000-4000-8000-000000000010',
  true,
  '10000000-0000-4000-8000-000000000004'
);
insert into public.schedule_export_presets (
  id, workspace_id, name, settings, created_by, updated_by
) values (
  '89000000-0000-4000-8000-000000000010',
  (select id from test_owner_draft_results limit 1),
  'Draft Export Preset',
  '{}'::jsonb,
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000004'
);
insert into public.scheduled_schedule_exports (
  id,
  workspace_id,
  preset_id,
  name,
  recipients,
  location_ids,
  day_of_week,
  send_hour,
  timezone,
  created_by,
  updated_by
) values (
  '8a000000-0000-4000-8000-000000000010',
  (select id from test_owner_draft_results limit 1),
  '89000000-0000-4000-8000-000000000010',
  'Draft Weekly Export',
  '[{"email":"draft-owner@example.test"}]'::jsonb,
  array['40000000-0000-4000-8000-000000000010']::uuid[],
  1,
  9,
  'America/Los_Angeles',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000004'
);
select is(
  app_private.workspace_allows_interactive_access((select id from test_owner_draft_results limit 1)),
  false,
  'draft owner workspace is not interactive for notification and todo jobs'
);
select is(
  (
    select count(*)::integer
    from jsonb_array_elements(public.list_schedule_export_cron_candidates_service(now())->'schedules') candidate
    where candidate->>'workspace_id' = (select id::text from test_owner_draft_results limit 1)
  ),
  0,
  'draft owner workspace scheduled export is not a cron candidate'
);
select is(
  (
    select count(*)::integer
    from public.resolve_workspace_context_service(
      '10000000-0000-4000-8000-000000000004',
      (select id from test_owner_draft_results limit 1)
    )
  ),
  1,
  'draft owner workspace can still resolve explicit onboarding context'
);
set local role service_role;
select lives_ok(
  $$select public.reset_owner_onboarding_service(
    '10000000-0000-4000-8000-000000000004',
    (select id from test_owner_draft_results limit 1)
  )$$,
  'owner can reset an incomplete owner onboarding draft'
);
reset role;
select is((select current_step from public.workspace_onboarding where workspace_id = (select id from test_owner_draft_results limit 1)), 1::smallint, 'owner onboarding reset returns draft to step one');
select is((select count(*)::integer from public.locations where workspace_id = (select id from test_owner_draft_results limit 1)), 0, 'owner onboarding reset clears draft locations');
select is((select count(*)::integer from public.departments where workspace_id = (select id from test_owner_draft_results limit 1)), 0, 'owner onboarding reset clears draft departments');
select is((select count(*)::integer from public.jobs where workspace_id = (select id from test_owner_draft_results limit 1)), 0, 'owner onboarding reset clears draft jobs');
select is((select count(*)::integer from public.employee_profiles where workspace_id = (select id from test_owner_draft_results limit 1)), 0, 'owner onboarding reset clears draft employees');
select is((select count(*)::integer from public.audit_events where workspace_id = (select id from test_owner_draft_results limit 1) and action = 'workspace.onboarding_reset'), 1, 'owner onboarding reset is audited');

-- Audit rows are written by the server; the browser only reads them.
insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'workspace.tested',
  'workspace',
  '20000000-0000-4000-8000-000000000001'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id)
    values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
            'workspace.forged', 'workspace', '20000000-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'the browser cannot write audit events'
);
select is((select count(*)::integer from public.audit_events), 1, 'owner reads own workspace audit events');
reset role;
insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id)
values (
  '20000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'workspace.employee_hidden_test',
  'workspace',
  '20000000-0000-4000-8000-000000000002'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is(
  (select count(*)::integer from public.audit_events),
  1,
  'same account does not see audit counts for a workspace where they are only employee'
);
select is(
  (
    select count(*)::integer
    from public.audit_events
    where workspace_id = '20000000-0000-4000-8000-000000000002'
  ),
  0,
  'same account does not read employee-scope workspace audit event details'
);
select is((select display_name from public.user_profiles), 'Test Owner', 'owner sees own account profile');
reset role;
insert into public.locations (short_name,
  id, workspace_id, name, street_address, city, region, postal_code, country_code, timezone
) values ('T00081',
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Main Dining',
  '1 Main St',
  'Los Angeles',
  'CA',
  '90001',
  'US',
  'America/Los_Angeles'
);
insert into public.departments (id, workspace_id, name, color)
values (
  '41000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Front of house',
  '#3C7A68'
);
insert into public.jobs (id, workspace_id, department_id, name, color)
values (
  '42000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  'Server',
  '#4478A8'
);
insert into public.employee_profiles (
  id, workspace_id, employee_code, first_name, last_name, invitation_email, created_by
) values (
  '43000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'E-0002',
  'Owner',
  'Invite',
  'owner-invite@example.test',
  '10000000-0000-4000-8000-000000000001'
);
insert into public.employee_profiles (
  id, workspace_id, user_id, employee_code, first_name, last_name,
  invitation_email, is_excluded_from_schedule, created_by
) values (
  '43000000-0000-4000-8000-000000000011',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'E-0003',
  'Stale',
  'Legal Name',
  'owner@example.test',
  true,
  '10000000-0000-4000-8000-000000000001'
);
-- Setup's first step gave the owner a legal name (BL-080); no step after it
-- passes without one.
insert into public.employee_private_profiles (
  employee_id, workspace_id, legal_first_name, legal_last_name
) values (
  '43000000-0000-4000-8000-000000000011',
  '20000000-0000-4000-8000-000000000001',
  'Test',
  'Owner'
);
insert into public.employee_location_assignments (
  workspace_id, employee_id, location_id, is_primary, created_by
) values (
  '20000000-0000-4000-8000-000000000001',
  '43000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  true,
  '10000000-0000-4000-8000-000000000001'
);
insert into public.employee_job_assignments (
  workspace_id, employee_id, job_id, is_primary, created_by
) values (
  '20000000-0000-4000-8000-000000000001',
  '43000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000001',
  true,
  '10000000-0000-4000-8000-000000000001'
);
update public.workspace_onboarding
set status = 'incomplete',
    current_step = 3,
    completed_at = null
where workspace_id = '20000000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok(
  $$select public.update_owner_onboarding_service(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Updated Test Workspace',
    3::smallint,
    false,
    999
  )$$,
  'PT409',
  'owner onboarding revision conflict',
  'stale owner onboarding revision is rejected'
);
select lives_ok(
  $$select public.queue_owner_onboarding_invitation_intent_service(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '43000000-0000-4000-8000-000000000001',
    'OWNER-INVITE@example.test'
  )$$,
  'owner onboarding can queue invitation intents before completion'
);
select throws_ok(
  $$select public.list_owner_onboarding_invitation_intents_service(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  )$$,
  '22023',
  'owner onboarding must be complete',
  'owner onboarding invitation intents are not dispatchable before completion'
);
select lives_ok(
  $$select public.update_owner_onboarding_service(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Updated Test Workspace',
    4::smallint,
    true
  )$$,
  'owner can complete four-step workspace onboarding'
);
reset role;
select is(
  (
    select revision
    from public.workspace_onboarding
    where workspace_id = '20000000-0000-4000-8000-000000000001'
  ),
  2,
  'owner onboarding completion increments revision'
);
select is(
  (
    select active_workspace_id
    from public.user_workspace_preferences
    where user_id = '10000000-0000-4000-8000-000000000001'
  ),
  '20000000-0000-4000-8000-000000000001'::uuid,
  'owner onboarding completion selects the completed workspace'
);
set local role service_role;
select ok(
  (
    select is_active
    from public.list_my_workspaces_service('10000000-0000-4000-8000-000000000001')
    where workspace_id = '20000000-0000-4000-8000-000000000001'
  ),
  'completed owner onboarding workspace is active in the workspace list'
);
select is(
  (
    select count(*)::integer
    from public.list_owner_onboarding_invitation_intents_service(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001'
    )
  ),
  1,
  'owner onboarding completion exposes queued invitation intents once'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.employee_profiles
    where workspace_id = '20000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000001'
      and archived_at is null
  ),
  1,
  'owner onboarding completion creates one linked owner employee record'
);
select is(
  (
    select concat_ws(' ', first_name, last_name)
    from public.employee_profiles
    where workspace_id = '20000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000001'
  ),
  'Stale Legal Name',
  -- It used to overwrite this from the account name on every completion, which
  -- threw away whatever the employees tab had been corrected to.
  'owner onboarding completion leaves the name the employees tab holds alone'
);
update public.user_profiles
set display_name = 'Independent Account Name'
where user_id = '10000000-0000-4000-8000-000000000001';
select is(
  (
    select concat_ws(' ', first_name, last_name)
    from public.employee_profiles
    where workspace_id = '20000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000001'
  ),
  'Stale Legal Name',
  'post-onboarding Account display name edits do not change the owner employee legal name'
);
update public.user_profiles
set display_name = 'Test Owner'
where user_id = '10000000-0000-4000-8000-000000000001';
reset role;
update auth.users
set raw_user_meta_data = jsonb_build_object('display_name', 'Metadata Owner')
where id = '10000000-0000-4000-8000-000000000004';
set local role service_role;
create temporary table metadata_owner_workspace as
select public.create_owner_workspace_service(
  '10000000-0000-4000-8000-000000000004',
  'Metadata Workspace'
) as workspace_id;
reset role;
insert into public.locations (short_name,
  id, workspace_id, name, street_address, city, region, postal_code,
  country_code, timezone
)
select 'T00082',
  '40000000-0000-4000-8000-000000000009'::uuid,
  workspace_id,
  'Metadata Location',
  '1 Metadata Way',
  'Los Angeles',
  'CA',
  '90001',
  'US',
  'America/Los_Angeles'
from metadata_owner_workspace;
insert into public.departments (id, workspace_id, name, color)
select
  '41000000-0000-4000-8000-000000000009'::uuid,
  workspace_id,
  'Metadata Department',
  '#3C7A68'
from metadata_owner_workspace;
insert into public.jobs (id, workspace_id, department_id, name, color)
select
  '42000000-0000-4000-8000-000000000009'::uuid,
  workspace_id,
  '41000000-0000-4000-8000-000000000009'::uuid,
  'Metadata Job',
  '#4478A8'
from metadata_owner_workspace;
set local role service_role;
-- A name in the account is not a legal name (BL-080): setup that never asked
-- for one cannot finish, and nothing is filed under the account's name.
select throws_ok(
  $$select public.update_owner_onboarding_service(
    '10000000-0000-4000-8000-000000000004',
    (select workspace_id from metadata_owner_workspace),
    'Metadata Workspace',
    4::smallint,
    true
  )$$,
  '23514',
  'the owner''s legal name is required',
  'owner onboarding cannot complete without the owner''s legal name'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.employee_profiles
    where workspace_id = (select workspace_id from metadata_owner_workspace)
      and user_id = '10000000-0000-4000-8000-000000000004'
  ),
  0,
  'nobody is filed under the name the account happens to carry'
);
select ok(
  (
    select is_excluded_from_schedule
    from public.employee_profiles
    where workspace_id = '20000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000001'
  ),
  'owner employee record is excluded from scheduling by default'
);
create temporary table owner_employee_ids as
select id, revision,
  -- The owner stays at every location (BL-218): the save keeps them.
  array(select a.location_id from public.employee_location_assignments a where a.employee_id = e.id and a.ended_at is null) as location_ids,
  array(select a.job_id from public.employee_job_assignments a where a.employee_id = e.id and a.ended_at is null) as job_ids
from public.employee_profiles e
where workspace_id = '20000000-0000-4000-8000-000000000001'
  and user_id = '10000000-0000-4000-8000-000000000001';
grant select on owner_employee_ids to service_role;
set local role service_role;
-- The owner's record used to be the one record in a workspace nobody could
-- touch, including the owner. They can edit their own; nobody else can.
select lives_ok(
  $$select public.save_employee_service(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    (select id from owner_employee_ids limit 1),
    'Owner',
    '',
    'Edited',
    '',
    'owner@example.test',
    null,
    '',
    (select location_ids from owner_employee_ids limit 1),
    null,
    (select job_ids from owner_employee_ids limit 1),
    null,
    false,
    true,
    (select revision from owner_employee_ids limit 1)
  )$$,
  'an owner can edit their own employee record'
);
select throws_ok(
  $$select public.save_employee_service(
    '10000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',
    (select id from owner_employee_ids limit 1),
    'Owner',
    '',
    'EditedByAdmin',
    '',
    'owner@example.test',
    null,
    '',
    '{}'::uuid[],
    null,
    '{}'::uuid[],
    null,
    false,
    true,
    (select revision + 1 from owner_employee_ids limit 1)
  )$$,
  '42501',
  null,
  'an admin still cannot edit the owner employee record'
);
select throws_ok(
  $$select public.set_employee_archived_service(
    '10000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',
    (select id from owner_employee_ids limit 1),
    true,
    false
  )$$,
  '42501',
  null,
  'owner employee record cannot be archived through ordinary lifecycle'
);
reset role;
select is(
  (
    select status
    from public.workspace_entitlements
    where workspace_id = '20000000-0000-4000-8000-000000000001'
  ),
  'trialing'::public.workspace_entitlement_status,
  'owner onboarding completion starts an internal trial entitlement'
);
select ok(
  (
    select trial_ends_at = trial_started_at + interval '14 days'
      and current_period_ends_at = current_period_started_at + interval '14 days'
      and billing_owner_user_id = '10000000-0000-4000-8000-000000000001'
    from public.workspace_entitlements
    where workspace_id = '20000000-0000-4000-8000-000000000001'
  ),
  'owner onboarding trial entitlement is cardless, owner-scoped and 14 days'
);
reset role;
insert into public.employee_invitations (
  workspace_id, employee_id, email, employee_role_id, token_hash, expires_at, created_by, delivery_status
) values (
  '20000000-0000-4000-8000-000000000001',
  '43000000-0000-4000-8000-000000000001',
  'owner-invite@example.test',
  (select id from public.workspace_roles where workspace_id = '20000000-0000-4000-8000-000000000001' and system_key = 'employee'),
  repeat('a', 64),
  now() + interval '7 days',
  '10000000-0000-4000-8000-000000000001',
  'pending'
);
set local role service_role;
select is(
  (
    select count(*)::integer
    from public.list_owner_onboarding_invitation_intents_service(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001'
    )
  ),
  0,
  'owner onboarding invitation intents skip employees with existing pending invitations'
);
select lives_ok(
  $$select public.mark_owner_onboarding_invitation_intent_dispatched_service(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '43000000-0000-4000-8000-000000000001',
    'Invitation delivery failed'
  )$$,
  'owner onboarding invitation intent dispatch result can be recorded'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.owner_onboarding_invitation_intents
    where workspace_id = '20000000-0000-4000-8000-000000000001'
      and employee_id = '43000000-0000-4000-8000-000000000001'
      and dispatched_at is not null
      and dispatch_error = 'Invitation delivery failed'
  ),
  1,
  'owner onboarding invitation dispatch failure is retained for audit'
);
select lives_ok(
  $$select public.update_owner_onboarding_service(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Updated Test Workspace',
    4::smallint,
    true
  )$$,
  'repeated owner onboarding completion is idempotent'
);
select is(
  (
    select count(*)::integer
    from public.workspace_entitlements
    where workspace_id = '20000000-0000-4000-8000-000000000001'
  ),
  1,
  'repeated owner onboarding completion does not duplicate trial entitlement'
);
select is(
  (
    select count(*)::integer
    from public.employee_profiles
    where workspace_id = '20000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000001'
  ),
  1,
  'repeated owner onboarding completion does not duplicate owner employee record'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is(
  (
    select count(*)::integer
    from public.audit_events
    where workspace_id = '20000000-0000-4000-8000-000000000001'
      and action = 'workspace.onboarding_completed'
  ),
  1,
  'repeated owner onboarding completion does not duplicate completion audit'
);
set local role service_role;
select throws_ok(
  $$select public.update_owner_onboarding_service(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Updated Test Workspace',
    4::smallint,
    false
  )$$,
  '22023',
  'completed owner onboarding cannot be changed',
  'completed owner onboarding cannot be reopened through the save endpoint'
);
select throws_ok(
  $$select public.reset_owner_onboarding_service(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  )$$,
  '22023', 'completed owner onboarding cannot be reset', 'completed owner onboarding cannot be reset'
);
-- Memberships change only through the server; the owner invariant holds there too.
reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$delete from public.workspace_memberships where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514',
  'workspace must retain an active owner',
  'last owner cannot be removed'
);

select throws_ok(
  $$update public.workspace_memberships set status = 'suspended' where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514',
  'workspace must retain an active owner',
  'last owner cannot be suspended'
);
select throws_ok(
  $$update public.workspace_memberships
    set role_id = (
      select id
      from public.workspace_roles
      where workspace_id = '20000000-0000-4000-8000-000000000001'
        and system_key = 'admin'
    )
    where id = '30000000-0000-4000-8000-000000000001'$$,
  '23514',
  'workspace must retain an active owner',
  'last owner cannot be demoted through role_id'
);
select throws_ok(
  $$update public.workspace_memberships
    set user_id = null
    where id = '30000000-0000-4000-8000-000000000001'$$,
  '23502',
  null,
  'last owner cannot be unlinked because membership user is required'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$update public.workspace_memberships set role_id = role_id where id = '30000000-0000-4000-8000-000000000002'$$,
  '42501',
  null,
  'admin cannot promote itself to owner from the browser'
);

set local role service_role;
select throws_ok(
  $$select public.request_workspace_closure_service(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    'scheduled_end_period',
    null,
    true,
    (now() + interval '30 days')
  )$$,
  '42501',
  'workspace owner access required',
  'non-owner cannot schedule workspace closure'
);
select throws_ok(
  $$select public.request_workspace_closure_service(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'immediate',
    'Wrong Name',
    true,
    null
  )$$,
  '23514',
  'workspace name confirmation does not match',
  'immediate closure requires exact workspace name confirmation'
);
reset role;
insert into public.locations (short_name,
  id, workspace_id, name, street_address, city, region, postal_code, country_code, timezone
) values ('T00083',
  '40000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  'Closure Dining',
  '2 Closure St',
  'Los Angeles',
  'CA',
  '90002',
  'US',
  'America/Los_Angeles'
);
insert into public.employee_profiles (
  id, workspace_id, employee_code, first_name, last_name, created_by
) values (
  '43000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  'E-0002',
  'Closure',
  'Employee',
  '10000000-0000-4000-8000-000000000003'
);
insert into public.schedule_edit_sessions (
  id, workspace_id, week_start, source_kind, holder_user_id, location_ids
) values (
  '44000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  current_date - (extract(isodow from current_date)::integer - 1),
  'blank',
  '10000000-0000-4000-8000-000000000003',
  array['40000000-0000-4000-8000-000000000002']::uuid[]
);
insert into public.workspace_entitlements (
  workspace_id,
  trial_started_at,
  trial_ends_at,
  current_period_started_at,
  current_period_ends_at,
  billing_owner_user_id
) values (
  '20000000-0000-4000-8000-000000000002',
  now(),
  now() + interval '14 days',
  now(),
  now() + interval '14 days',
  '10000000-0000-4000-8000-000000000003'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is(
  (
    select count(*)::integer
    from public.workspace_entitlements
    where workspace_id = '20000000-0000-4000-8000-000000000002'
  ),
  0,
  'same account does not see billing entitlement rows for a workspace where they are only employee'
);
select is(
  (select count(*)::integer from public.workspace_entitlements),
  1,
  'employee-scope workspace entitlement does not leak into billing counts'
);
set local role service_role;
select lives_ok(
  $$select public.request_workspace_closure_service(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'scheduled_end_period',
    null,
    true,
    (now() + interval '30 days')
  )$$,
  'owner can schedule closure at period end'
);
select is(
  (
    select workspace_lifecycle_status
    from public.list_my_workspaces_service('10000000-0000-4000-8000-000000000001')
    where workspace_id = '20000000-0000-4000-8000-000000000001'
  ),
  'closure_scheduled'::public.workspace_lifecycle_status,
  'scheduled closure stays visible in workspace switcher projection'
);
select lives_ok(
  $$select public.cancel_workspace_closure_service(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  )$$,
  'owner can cancel scheduled closure before it takes effect'
);
reset role;
select is(
  (
    select lifecycle_status
    from public.workspaces
    where id = '20000000-0000-4000-8000-000000000001'
  ),
  'active'::public.workspace_lifecycle_status,
  'cancelled closure restores active workspace lifecycle'
);
set local role service_role;
select lives_ok(
  $$select public.request_workspace_closure_service(
    '10000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000002',
    'immediate',
    'Second Test Workspace',
    true,
    null
  )$$,
  'owner can close organization immediately'
);
reset role;
select is(
  (
    select lifecycle_status
    from public.workspaces
    where id = '20000000-0000-4000-8000-000000000002'
  ),
  'deleted'::public.workspace_lifecycle_status,
  'immediate closure tombstones the workspace'
);
select throws_ok(
  $$select public.cancel_workspace_closure_service(
    '10000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000002'
  )$$,
  '02000',
  'workspace not found',
  'immediate closure cannot be cancelled after deletion'
);
select throws_ok(
  $$select public.request_workspace_closure_service(
    '10000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000002',
    'scheduled_end_period',
    null,
    true,
    (now() + interval '30 days')
  )$$,
  '02000',
  'workspace not found',
  'deleted workspace cannot re-enter the closure lifecycle'
);
-- It used to be filtered out, which reads as the workspace having never
-- existed; the account is owed a sentence about it instead.
select is(
  (
    select workspace_lifecycle_status::text
    from public.list_my_workspaces_service('10000000-0000-4000-8000-000000000001')
    where workspace_id = '20000000-0000-4000-8000-000000000002'
  ),
  'deleted',
  'a closed workspace stays in the account projection, marked closed'
);
select is(
  (
    select count(*)::integer
    from public.workspace_memberships
    where workspace_id = '20000000-0000-4000-8000-000000000002'
      and status = 'active'
  ),
  0,
  'immediate closure suspends organization access for all members'
);
select is(
  (
    select count(*)::integer
    from public.user_workspace_preferences
    where active_workspace_id = '20000000-0000-4000-8000-000000000002'
  ),
  0,
  'immediate closure clears active workspace preferences'
);
select is(
  (select count(*)::integer from auth.users where id = '10000000-0000-4000-8000-000000000001'),
  1,
  'immediate organization closure leaves global user accounts intact'
);
select is(
  (select status::text from public.schedule_edit_sessions where id = '44000000-0000-4000-8000-000000000002'),
  'expired',
  'immediate closure expires open schedule edit sessions'
);
select is(
  (
    select (metadata->'runtime_revocation'->>'schedule_edit_sessions_expired')::integer
    from public.audit_events
    where workspace_id = '20000000-0000-4000-8000-000000000002'
      and action = 'workspace.closure.completed_immediate'
    order by occurred_at desc
    limit 1
  ),
  1,
  'immediate closure audits runtime revocation counts'
);
select is(
  (
    select status
    from public.workspace_entitlements
    where workspace_id = '20000000-0000-4000-8000-000000000002'
  ),
  'cancelled'::public.workspace_entitlement_status,
  'immediate organization closure cancels internal entitlement'
);
select is(
  (
    select count(*)::integer
    from public.workspace_retention_purge_jobs
    where workspace_id = '20000000-0000-4000-8000-000000000002'
      and status = 'pending'
  ),
  1,
  'immediate organization closure enqueues a retention purge job'
);
set local role service_role;
select is(
  (
    public.mark_workspace_retention_purge_completed_service(
      '20000000-0000-4000-8000-000000000002',
      jsonb_build_object('executor', 'workspace_rls_test')
    )->>'status'
  ),
  'completed',
  'system retention purge completion records a tombstone'
);
select is(
  (
    public.mark_workspace_retention_purge_completed_service(
      '20000000-0000-4000-8000-000000000002',
      jsonb_build_object('executor', 'workspace_rls_test')
    )->>'idempotent'
  ),
  'true',
  'system retention purge completion is idempotent'
);
select is(
  (
    select count(*)::integer
    from public.workspace_retention_tombstones
    where workspace_id = '20000000-0000-4000-8000-000000000002'
  ),
  1,
  'system retention purge preserves one minimal tombstone'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.workspaces), 0, 'outsider cannot see workspace');
select is((select count(*)::integer from public.audit_events), 0, 'outsider cannot see audit events');
select is((select count(*)::integer from public.user_profiles), 0, 'outsider cannot see another user profile');
set local role service_role;
select lives_ok(
  $$select public.create_owner_workspace_service('10000000-0000-4000-8000-000000000002', 'Outsider Workspace')$$,
  'authenticated user can bootstrap a workspace'
);
select is(
  (
    select workspace_role
    from public.list_my_workspaces_service('10000000-0000-4000-8000-000000000002')
    where workspace_name = 'Outsider Workspace'
  ),
  'owner'::public.workspace_role,
  'bootstrapped workspace grants owner membership'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
update auth.users
set email_confirmed_at = now()
where id = '10000000-0000-4000-8000-000000000003';

insert into public.workspaces (id, name, created_by)
values (
  '20000000-0000-4000-8000-000000000004',
  'Transfer Test Workspace',
  '10000000-0000-4000-8000-000000000001'
);
insert into public.workspace_memberships (id, workspace_id, user_id, status, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, legacy.status::text::public.membership_status, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
  ('30000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('30000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 'admin', 'active')) as legacy(id, workspace_id, user_id, role, status);
insert into public.employee_profiles (
  id, workspace_id, user_id, employee_code, first_name, last_name, created_by
) values (
  '43000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000003',
  'E-0004',
  'Transfer',
  'Target',
  '10000000-0000-4000-8000-000000000001'
);
-- Ownership only goes to somebody with a legal name on file (BL-080); this
-- admin's onboarding filed one.
insert into public.employee_private_profiles (
  employee_id, workspace_id, legal_first_name, legal_last_name
) values (
  '43000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000004',
  'Transfer',
  'Target'
);
insert into public.workspace_onboarding (
  workspace_id,
  status,
  current_step,
  completed_at,
  updated_by
)
values (
  '20000000-0000-4000-8000-000000000004',
  'complete',
  4,
  now(),
  '10000000-0000-4000-8000-000000000001'
);
insert into public.workspace_entitlements (
  workspace_id,
  trial_started_at,
  trial_ends_at,
  current_period_started_at,
  current_period_ends_at,
  billing_owner_user_id
) values (
  '20000000-0000-4000-8000-000000000004',
  now(),
  now() + interval '14 days',
  now(),
  now() + interval '14 days',
  '10000000-0000-4000-8000-000000000001'
);

set local role service_role;
select lives_ok(
  $$select public.initiate_workspace_ownership_transfer_service(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000003'
    )$$,
  'owner can initiate transfer to an active verified admin'
);
select is(
  (
    select pending_ownership_transfer_role
    from public.list_my_workspaces_service('10000000-0000-4000-8000-000000000003')
    where workspace_id = '20000000-0000-4000-8000-000000000004'
  ),
  'target',
  'target admin workspace list exposes pending ownership transfer response role'
);
set local role postgres;
select throws_ok(
  $$update public.workspace_memberships
    set role_id = (
      select id
      from public.workspace_roles
      where workspace_id = '20000000-0000-4000-8000-000000000004'
        and system_key = 'employee'
    )
    where id = '30000000-0000-4000-8000-000000000008'$$,
  '23514',
  'pending ownership transfer must be resolved before membership changes',
  'pending ownership transfer locks target role changes'
);
select throws_ok(
  $$update public.workspace_memberships
    set status = 'suspended'
    where id = '30000000-0000-4000-8000-000000000008'$$,
  '23514',
  'pending ownership transfer must be resolved before membership changes',
  'pending ownership transfer locks target suspension'
);
select throws_ok(
  $$update public.workspace_memberships
    set user_id = '10000000-0000-4000-8000-000000000002'
    where id = '30000000-0000-4000-8000-000000000008'$$,
  '23514',
  'pending ownership transfer must be resolved before membership changes',
  'pending ownership transfer locks participant rebinding'
);
set local role service_role;
select throws_ok(
  $$select public.set_employee_archived_service(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000004',
    '43000000-0000-4000-8000-000000000004',
    true,
    false
  )$$,
  '23514',
  'pending ownership transfer must be resolved before membership changes',
  'pending ownership transfer locks drawer archive access suspension'
);
set local role service_role;
select throws_ok(
  $$select public.request_workspace_closure_service(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000004',
    'immediate',
    'Transfer Test Workspace',
    true,
    null
  )$$,
  '23514',
  'pending ownership transfer must be resolved before workspace closure',
  'pending ownership transfer blocks organization closure'
);
select throws_ok(
  $$select public.request_account_deletion_v2_service(
    '10000000-0000-4000-8000-000000000001',
    repeat('a', 64)
  )$$,
  '23514',
  null,
  'pending ownership transfer blocks initiator account deletion'
);
select ok(
  public.get_account_deletion_blockers_service('10000000-0000-4000-8000-000000000001')
    @> '[{"kind": "pending_ownership_transfer"}]',
  'the pending transfer is what blocks the initiator'
);
select throws_ok(
  $$select public.request_account_deletion_v2_service(
    '10000000-0000-4000-8000-000000000003',
    repeat('a', 64)
  )$$,
  '23514',
  null,
  'pending ownership transfer blocks target account deletion'
);
select ok(
  public.get_account_deletion_blockers_service('10000000-0000-4000-8000-000000000003')
    @> '[{"kind": "pending_ownership_transfer"}]',
  'the pending transfer is what blocks the target'
);
set local role postgres;
select throws_ok(
  $$update public.workspace_entitlements
    set billing_owner_user_id = '10000000-0000-4000-8000-000000000003',
        payment_method_required_at = now()
    where workspace_id = '20000000-0000-4000-8000-000000000004'$$,
  '23514',
  'pending ownership transfer must be resolved before billing owner changes',
  'pending ownership transfer locks internal billing owner mutations'
);
set local role service_role;
select throws_ok(
  $$select public.respond_workspace_ownership_transfer_service(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000004',
    (
      select id
      from public.workspace_ownership_transfers
      where workspace_id = '20000000-0000-4000-8000-000000000004'
        and status = 'pending'
      order by created_at
      limit 1
    ),
    'accept'
  )$$,
  '42501',
  'ownership transfer target access required',
  'only the target account can accept ownership transfer'
);
select lives_ok(
  $$select public.respond_workspace_ownership_transfer_service(
    '10000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000004',
    (
      select id
      from public.workspace_ownership_transfers
      where workspace_id = '20000000-0000-4000-8000-000000000004'
        and status = 'pending'
      order by created_at
      limit 1
    ),
    'reject'
  )$$,
  'target admin can reject ownership transfer'
);
select lives_ok(
  $$select public.initiate_workspace_ownership_transfer_service(
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000003'
    )$$,
  'owner can initiate a new transfer after rejection'
);
select lives_ok(
  $$select public.respond_workspace_ownership_transfer_service(
    '10000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000004',
    (
      select id
      from public.workspace_ownership_transfers
      where workspace_id = '20000000-0000-4000-8000-000000000004'
        and status = 'pending'
      order by created_at desc
      limit 1
    ),
    'accept'
  )$$,
  'target admin can accept ownership transfer'
);
reset role;
select is(
  (
    select coalesce((select r.access_class::text from public.workspace_roles r where r.id = role_id), 'employee')
    from public.workspace_memberships
    where id = '30000000-0000-4000-8000-000000000008'
  ),
  'owner',
  'accepted ownership transfer promotes target admin to owner'
);
select is(
  (
    select coalesce((select r.access_class::text from public.workspace_roles r where r.id = role_id), 'employee')
    from public.workspace_memberships
    where id = '30000000-0000-4000-8000-000000000007'
  ),
  'admin',
  'accepted ownership transfer demotes previous owner to admin'
);
select is(
  (
    select count(*)::integer
    from public.workspace_memberships
    where workspace_id = '20000000-0000-4000-8000-000000000004'
      and coalesce((select r.access_class::text from public.workspace_roles r where r.id = role_id), 'employee') = 'owner'
      and status = 'active'
  ),
  1,
  'ownership transfer leaves exactly one active owner'
);
select is(
  (
    select count(*)::integer
    from public.audit_events
    where workspace_id = '20000000-0000-4000-8000-000000000004'
      and action = 'billing.payment_method.detach_required_after_owner_transfer'
  ),
  1,
  'ownership transfer records prior owner payment-method detach requirement'
);
select is(
  (
    select billing_owner_user_id
    from public.workspace_entitlements
    where workspace_id = '20000000-0000-4000-8000-000000000004'
      and payment_method_required_at is not null
  ),
  '10000000-0000-4000-8000-000000000003'::uuid,
  'ownership transfer moves internal billing owner and requires a new payment method'
);

select throws_ok(
  $$select public.request_account_deletion_v2_service(
    '10000000-0000-4000-8000-000000000003',
    repeat('a', 64)
  )$$,
  '23514',
  null,
  'global account deletion is blocked while active organization access exists'
);
select ok(
  public.get_account_deletion_blockers_service('10000000-0000-4000-8000-000000000003')
    @> '[{"kind": "active_membership"}]',
  'the active membership is what blocks it'
);
select lives_ok(
  $$select public.request_account_deletion_v2_service(
    '10000000-0000-4000-8000-000000000005',
    repeat('b', 64)
  )$$,
  'account without active organizations can request global account deletion'
);
select lives_ok(
  $$select public.restore_account_deletion_by_token_service(repeat('b', 64))$$,
  'pending global account deletion can be restored inside the restore window'
);

select * from finish();
rollback;
