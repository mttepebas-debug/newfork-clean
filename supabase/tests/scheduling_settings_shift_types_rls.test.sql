begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

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

insert into public.workspace_memberships (id, workspace_id, user_id, role)
values
  ('32000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 'owner'),
  ('32000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000002', 'admin'),
  ('32000000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000003', 'manager'),
  ('32000000-0000-4000-8000-000000000004', '22000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000004', 'owner');

select is(
  (select count(*)::integer from public.workspace_scheduling_settings where workspace_id in ('22000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000002')),
  2,
  'new workspaces receive scheduling settings'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);
select is((select week_start_day::text from public.workspace_scheduling_settings), 'monday', 'owner sees default scheduling settings');
select lives_ok(
  $$update public.workspace_scheduling_settings
    set week_start_day = 'sunday', conflict_policy = 'block', updated_at = now()
    where workspace_id = '22000000-0000-4000-8000-000000000001'$$,
  'owner can update scheduling rules'
);
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
select lives_ok(
  $$select public.reorder_shift_types(
    '22000000-0000-4000-8000-000000000001',
    array['42000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000001']::uuid[]
  )$$,
  'owner can reorder every active shift type'
);
select is((select name from public.shift_types order by sort_order limit 1), 'Dinner', 'shift type order is persisted');
select throws_ok(
  $$insert into public.shift_types (workspace_id, name, default_start_time, default_end_time)
    values ('22000000-0000-4000-8000-000000000001', 'Invalid', '09:00', '09:00')$$,
  '23514',
  null,
  'equal default times are rejected'
);
select throws_ok(
  $$insert into public.shift_types (workspace_id, name) values ('22000000-0000-4000-8000-000000000001', 'breakfast')$$,
  '23505',
  null,
  'active shift type names are unique ignoring case'
);

select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$update public.workspace_scheduling_settings set availability_enforcement = 'hard'
    where workspace_id = '22000000-0000-4000-8000-000000000001'$$,
  'admin can update scheduling rules'
);

select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000003', true);
update public.workspace_scheduling_settings set conflict_policy = 'warn'
where workspace_id = '22000000-0000-4000-8000-000000000001';
select is(
  (select conflict_policy::text from public.workspace_scheduling_settings where workspace_id = '22000000-0000-4000-8000-000000000001'),
  'block',
  'manager cannot update scheduling rules'
);
select throws_ok(
  $$insert into public.shift_types (workspace_id, name) values ('22000000-0000-4000-8000-000000000001', 'Unauthorized')$$,
  '42501',
  'new row violates row-level security policy for table "shift_types"',
  'manager cannot create a shift type'
);
select throws_ok(
  $$select public.reorder_shift_types(
    '22000000-0000-4000-8000-000000000001',
    array['42000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000002']::uuid[]
  )$$,
  '42501',
  'workspace management access required',
  'manager cannot reorder shift types'
);

select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000004', true);
select is((select count(*)::integer from public.shift_types where workspace_id = '22000000-0000-4000-8000-000000000001'), 0, 'other tenant cannot see shift types');
select is((select count(*)::integer from public.workspace_scheduling_settings where workspace_id = '22000000-0000-4000-8000-000000000001'), 0, 'other tenant cannot see scheduling settings');

select * from finish();
rollback;
