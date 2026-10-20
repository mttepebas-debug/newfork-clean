begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('12000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'schedule-owner@example.test', '', '{}', '{}', now(), now()),
  ('12000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'schedule-admin@example.test', '', '{}', '{}', now(), now()),
  ('12000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'schedule-manager@example.test', '', '{}', '{}', now(), now()),
  ('12000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'schedule-outsider@example.test', '', '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values
  ('22000000-0000-4000-8000-000000000001', 'Schedule Workspace', '12000000-0000-4000-8000-000000000001'),
  ('22000000-0000-4000-8000-000000000002', 'Other Schedule Workspace', '12000000-0000-4000-8000-000000000004');

insert into public.workspace_memberships (id, workspace_id, user_id, role_id, employee_role_id)
select legacy.id::uuid, legacy.workspace_id::uuid, legacy.user_id::uuid, (case when legacy.role::text <> 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key::text = legacy.role::text)) end), (case when legacy.role::text = 'employee' then coalesce(null::uuid, (select r.id from public.workspace_roles r where r.workspace_id = legacy.workspace_id::uuid and r.system_key = 'employee')) end)
from (values
  ('32000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 'owner'),
  ('32000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000002', 'admin'),
  ('32000000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000003', 'manager'),
  ('32000000-0000-4000-8000-000000000004', '22000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000004', 'owner')) as legacy(id, workspace_id, user_id, role);

select is(
  (select count(*)::integer from public.workspace_scheduling_settings where workspace_id in ('22000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000002')),
  2,
  'new workspaces receive scheduling settings'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);
select is((select week_start_day::text from public.workspace_scheduling_settings), 'monday', 'owner sees default scheduling settings');
-- Scheduling rules change only through the API service; the browser reads them.
select throws_ok(
  $$update public.workspace_scheduling_settings
    set week_start_day = 'sunday', updated_at = now()
    where workspace_id = '22000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'owner cannot update scheduling rules from the browser'
);
set local role service_role;
select lives_ok(
  $$select public.update_scheduling_settings_service(
    '12000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000001',
    '{"week_start_day": "sunday"}'::jsonb
  )$$,
  'owner updates scheduling rules through the API service'
);
set local role authenticated;
select is((select count(*)::integer from public.audit_events where action = 'scheduling.settings_updated'), 1, 'scheduling update is audited');
select lives_ok(
  $$insert into public.shift_types (id, workspace_id, name, color, default_start_time, default_end_time, sort_order)
    values
      ('42000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'Breakfast', '#D39A36', '07:00', '15:00', 0),
      ('42000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000001', 'Dinner', '#7B5EA7', '17:00', '01:00', 1)$$,
  'owner can create shift types'
);
select ok((select crosses_midnight from public.shift_types where name = 'Dinner'), 'overnight shift is derived');
select is((select count(*)::integer from public.audit_events where action = 'shift_type.created'), 2, 'shift type creation is audited');
set local role service_role;
select ok(
  has_table_privilege('service_role', 'public.workspace_scheduling_settings', 'select')
  and has_table_privilege('service_role', 'public.workspace_scheduling_settings', 'update'),
  'service role can read and update scheduling settings through API services'
);
select lives_ok(
  $$select public.reorder_shift_types_service(
    '12000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000001',
    array['42000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000001']::uuid[]
  )$$,
  'owner can reorder every active shift type'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);
select is((select name from public.shift_types order by sort_order limit 1), 'Dinner', 'shift type order is persisted');
-- Every shift type has valid default times; the times guard answers before
-- any other check, so the refusals below that are not about times give valid
-- times.
select throws_ok(
  $$insert into public.shift_types (workspace_id, name, default_start_time, default_end_time)
    values ('22000000-0000-4000-8000-000000000001', 'Invalid', '09:00', '09:00')$$,
  '22023',
  'Set valid default start and end times for this shift type',
  'equal default times are rejected'
);
select throws_ok(
  $$insert into public.shift_types (workspace_id, name, default_start_time, default_end_time)
    values ('22000000-0000-4000-8000-000000000001', 'breakfast', '09:00', '17:00')$$,
  '23505',
  null,
  'active shift type names are unique ignoring case'
);
select lives_ok(
  $$insert into public.shift_labels (id, workspace_id, name, color, sort_order)
    values
      ('43000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'Training', '#54736A', 0),
      ('43000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000001', 'Close', '#7B5EA7', 1)$$,
  'owner can create shift labels'
);
select is((select count(*)::integer from public.audit_events where action = 'shift_label.created'), 2, 'shift label creation is audited');
set local role service_role;
select lives_ok(
  $$select public.reorder_shift_labels_service(
    '12000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000001',
    array['43000000-0000-4000-8000-000000000002', '43000000-0000-4000-8000-000000000001']::uuid[]
  )$$,
  'owner can reorder every active shift label'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);
select is((select name from public.shift_labels order by sort_order limit 1), 'Close', 'shift label order is persisted');
select throws_ok(
  $$insert into public.shift_labels (workspace_id, name) values ('22000000-0000-4000-8000-000000000001', 'training')$$,
  '23505',
  null,
  'active shift label names are unique ignoring case'
);

select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$update public.workspace_scheduling_settings set week_start_day = 'monday'
    where workspace_id = '22000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'admin cannot update scheduling rules from the browser'
);
set local role service_role;
select lives_ok(
  $$select public.update_scheduling_settings_service(
    '12000000-0000-4000-8000-000000000002',
    '22000000-0000-4000-8000-000000000001',
    '{"week_start_day": "monday"}'::jsonb
  )$$,
  'admin updates scheduling rules through the API service'
);
select throws_ok(
  $$select public.update_scheduling_settings_service(
    '12000000-0000-4000-8000-000000000003',
    '22000000-0000-4000-8000-000000000001',
    '{"week_start_day": "sunday"}'::jsonb
  )$$,
  '42501',
  null,
  'manager cannot update scheduling rules through the API service'
);
set local role authenticated;

select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000003', true);
select is(
  (select week_start_day::text from public.workspace_scheduling_settings where workspace_id = '22000000-0000-4000-8000-000000000001'),
  'monday',
  'manager cannot update scheduling rules'
);
select throws_ok(
  $$insert into public.shift_types (workspace_id, name, default_start_time, default_end_time)
    values ('22000000-0000-4000-8000-000000000001', 'Unauthorized', '09:00', '17:00')$$,
  '42501',
  'new row violates row-level security policy for table "shift_types"',
  'manager cannot create a shift type'
);
select throws_ok(
  $$insert into public.shift_labels (workspace_id, name) values ('22000000-0000-4000-8000-000000000001', 'Unauthorized')$$,
  '42501',
  'new row violates row-level security policy for table "shift_labels"',
  'manager cannot create a shift label'
);
set local role service_role;
select throws_ok(
  $$select public.reorder_shift_types_service(
    '12000000-0000-4000-8000-000000000003',
    '22000000-0000-4000-8000-000000000001',
    array['42000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000002']::uuid[]
  )$$,
  '42501',
  'workspace management access required',
  'manager cannot reorder shift types'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000004', true);
select is((select count(*)::integer from public.shift_types where workspace_id = '22000000-0000-4000-8000-000000000001'), 0, 'other tenant cannot see shift types');
select is((select count(*)::integer from public.shift_labels where workspace_id = '22000000-0000-4000-8000-000000000001'), 0, 'other tenant cannot see shift labels');
select is((select count(*)::integer from public.workspace_scheduling_settings where workspace_id = '22000000-0000-4000-8000-000000000001'), 0, 'other tenant cannot see scheduling settings');

select * from finish();
rollback;
