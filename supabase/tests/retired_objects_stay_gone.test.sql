begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- What FOUNDATION-B stage 5 deleted stays deleted. Each step adds its objects
-- here in the commit that drops them, so a migration, a restored dump or a
-- copied function cannot bring one back unnoticed.

create temporary table retired (kind text not null, name text not null, step text not null);
insert into retired (kind, name, step) values
  -- 5.2 kiosk and time tracking (20260924145822)
  ('table', 'employee_kiosk_credentials', '5.2'), ('table', 'kiosk_action_sessions', '5.2'),
  ('table', 'kiosk_devices', '5.2'), ('table', 'kiosk_enrollment_codes', '5.2'),
  ('table', 'kiosk_security_events', '5.2'), ('table', 'kiosk_verification_attempts', '5.2'),
  ('table', 'time_amendments', '5.2'), ('table', 'time_correction_requests', '5.2'),
  ('table', 'time_events', '5.2'), ('table', 'time_export_snapshot_rows', '5.2'),
  ('table', 'time_export_snapshots', '5.2'), ('table', 'time_manual_entries', '5.2'),
  ('table', 'time_review_windows', '5.2'), ('table', 'time_sessions', '5.2'),
  ('type', 'kiosk_device_status', '5.2'), ('type', 'kiosk_enrollment_status', '5.2'),
  ('type', 'kiosk_verification_outcome', '5.2'), ('type', 'time_capture_source', '5.2'),
  ('type', 'time_capture_state', '5.2'), ('type', 'time_correction_status', '5.2'),
  ('type', 'time_event_type', '5.2'), ('type', 'time_export_snapshot_status', '5.2'),
  ('type', 'time_review_state', '5.2'),
  ('column', 'employee_terminations.time_entry_action', '5.2'),
  ('column', 'employee_terminations.active_session_id', '5.2'),
  ('permission', 'kiosk.%', '5.2'), ('permission', 'time.%', '5.2'),
  ('notification', 'time_tracking.%', '5.2'),
  ('checklist', 'kiosk', '5.2');

-- Functions: every name the step dropped, in any schema the app owns.
insert into retired (kind, name, step)
select 'function', name, '5.2' from unnest(array[
  'apply_time_amendment_service', 'approve_time_review_window_service', 'begin_kiosk_pin_verification_service',
  'cancel_kiosk_action_service', 'capture_kiosk_time_action_service', 'capture_own_time_event_service',
  'capture_time_event_service', 'create_kiosk_enrollment_service', 'create_kiosk_reenrollment_service',
  'create_manual_time_session_service', 'create_time_export_snapshot_service', 'decide_time_correction_service',
  'decide_time_correction_service_legacy_notifications', 'exchange_kiosk_enrollment_service',
  'finish_kiosk_pin_verification_service', 'get_employee_time_tracking_service', 'get_kiosk_action_state_service',
  'get_kiosk_directory_service', 'get_kiosk_management_service', 'get_manager_time_entries_service',
  'grant_new_kiosk_system_role_permissions', 'kiosk_device_json', 'manager_time_session_detail_json',
  'mark_time_export_snapshot_superseded', 'prevent_time_history_mutation', 'preview_time_export_snapshot_service',
  'protect_time_correction_history', 'protect_time_export_snapshot_history', 'protect_time_export_snapshot_row_history',
  'request_own_time_correction_service', 'request_own_time_correction_service_legacy_notifications',
  'revoke_kiosk_device_service', 'rotate_kiosk_device_credential_service', 'service_actor_can_kiosk_location',
  'service_actor_can_time_location', 'set_employee_kiosk_pin_service', 'time_employee_has_location',
  'time_export_normalize_location_ids', 'time_export_preview_rows', 'time_session_detail_json',
  'update_kiosk_device_label_service'
]) name;

select is(
  array(select r.name from retired r where r.kind = 'table' and to_regclass('public.' || r.name) is not null order by 1),
  '{}'::text[], 'retired tables stay gone'
);
select is(
  array(select r.name from retired r where r.kind = 'type' and to_regtype('public.' || r.name) is not null order by 1),
  '{}'::text[], 'retired types stay gone'
);
select is(
  array(
    select r.name from retired r
    join pg_proc p on p.proname = r.name
    where r.kind = 'function' and p.pronamespace in ('public'::regnamespace, 'app_private'::regnamespace)
    order by 1
  ),
  '{}'::text[], 'retired functions stay gone'
);
select is(
  array(
    select r.name from retired r
    join information_schema.columns c
      on c.table_schema = 'public' and c.table_name || '.' || c.column_name = r.name
    where r.kind = 'column'
    order by 1
  ),
  '{}'::text[], 'retired columns stay gone'
);
select is(
  array(
    select p.key from public.permissions p
    where exists (select 1 from retired r where r.kind = 'permission' and p.key like r.name)
    order by 1
  ),
  '{}'::text[], 'retired permission keys stay gone'
);
select is(
  array(
    select c.type_key from public.notification_catalog c
    where exists (select 1 from retired r where r.kind = 'notification' and c.type_key like r.name)
    order by 1
  ),
  '{}'::text[], 'retired notification types stay gone'
);
select ok(
  not exists (
    select 1 from pg_constraint
    where conname = 'notification_catalog_category_check' and pg_get_constraintdef(oid) like '%time_tracking%'
  ),
  'the time tracking notification category stays gone'
);
select is(
  array(select r.name from retired r where r.kind = 'checklist' and r.name = any (app_private.owner_setup_checklist_item_ids()) order by 1),
  '{}'::text[], 'retired owner setup steps stay gone'
);

select * from finish();
rollback;
