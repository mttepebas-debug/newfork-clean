begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- What FOUNDATION-B deletes stays deleted. Each step adds its objects here in
-- the commit that drops them, so a migration, a restored dump or a copied
-- function cannot bring one back unnoticed.

create temporary table retired (kind text not null, name text not null, step text not null);
insert into retired (kind, name, step) values
  -- 3b the location and week edit lock (20260924152910)
  ('table', 'schedule_edit_locks', '3b'), ('function', 'release_schedule_edit_locks', '3b'),
  -- 5.1 the old Requests -> Shift changes flow; Shift Hub is always on
  ('table', 'schedule_shift_change_requests', '5.1'), ('table', 'schedule_shift_change_participants', '5.1'),
  ('table', 'schedule_shift_change_events', '5.1'),
  ('type', 'shift_change_request_type', '5.1'), ('type', 'shift_change_request_status', '5.1'),
  ('type', 'shift_change_participant_role', '5.1'),
  ('column', 'workspaces.shift_exchanges_enabled', '5.1'),
  ('function', 'get_shift_change_conflicts_service', '5.1'),
  ('function', 'resolve_schedule_shift_change_request_service', '5.1'),
  ('function', 'resolve_schedule_shift_change_request_exchange_legacy', '5.1'),
  ('function', 'submit_employee_shift_request_service', '5.1'),
  ('function', 'submit_employee_shift_request_exchange_legacy', '5.1'),
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
  ('checklist', 'kiosk', '5.2'),
  -- 5.6 Line Up (20260924180901)
  ('table', 'lineup_notes', '5.6'), ('table', 'lineup_notification_outbox', '5.6'),
  ('table', 'lineup_operation_events', '5.6'), ('table', 'lineup_proposals', '5.6'),
  ('table', 'lineup_receipts', '5.6'), ('table', 'lineup_section_plans', '5.6'),
  ('table', 'schedule_lineup_briefs', '5.6'), ('table', 'schedule_lineup_entries', '5.6'),
  ('table', 'schedule_lineup_sections', '5.6'), ('table', 'schedule_lineup_snapshots', '5.6'),
  ('table', 'schedule_lineups', '5.6'),
  ('column', 'locations.lineup_operations_enabled', '5.6'),
  ('permission', 'schedule.lineup.%', '5.6'),
  ('notification', 'schedule.staffing.%', '5.6');

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
insert into retired (kind, name, step)
select 'function', name, '5.6' from unnest(array[
  'archive_schedule_lineup_section_service', 'bind_weekly_lineup_manual_offer_source',
  'bind_weekly_lineup_offer_source', 'delete_schedule_lineup_entry_service', 'deliver_lineup_notifications_service',
  'flush_lineup_staffing_notifications_service', 'get_schedule_lineup_operations_base',
  'get_schedule_lineup_service', 'initialize_schedule_lineup_sections_after_workspace_insert',
  'lineup_assert_enabled', 'lineup_assign_segment', 'lineup_candidate_check', 'lineup_candidate_check_exchange_base',
  'lineup_candidate_option', 'lineup_clip_placements', 'lineup_copy_segment_placement', 'lineup_day_publication',
  'lineup_effective_travel_minutes', 'lineup_employee_assignment', 'lineup_employee_details', 'lineup_entry_day',
  'lineup_fill_coverage', 'lineup_operation_model', 'lineup_operation_preview', 'lineup_operations_service',
  'lineup_person_fingerprint', 'lineup_placements_service', 'lineup_prepare_placement', 'lineup_project_entry',
  'lineup_proposals_service', 'lineup_rebind_published_source', 'lineup_section_restriction', 'lineup_share_content',
  'lineup_share_content_for_services', 'lineup_shift_range', 'lineup_split_has_publications',
  'lineup_staffing_broadcast', 'lineup_staffing_enqueue_notification', 'lineup_staffing_notification_allowed',
  'lineup_staffing_notification_insert', 'lineup_staffing_proposal_status', 'lineup_staffing_sync_notifications',
  'move_schedule_lineup_entry_service', 'preview_schedule_lineup_scoped_share_service',
  'preview_schedule_lineup_share_service', 'project_notification_inbox_staffing_base',
  'record_weekly_lineup_manager_assignment', 'record_weekly_lineup_offer_assignment',
  'record_weekly_lineup_retained_segment', 'refresh_weekly_lineup_offer_terms',
  'refresh_weekly_lineup_offer_terms_after_entry', 'refresh_weekly_lineup_offer_terms_after_publication',
  'refresh_weekly_lineup_offers_for_actor', 'require_weekly_lineup_offer_acceptance',
  'share_schedule_lineup_scoped_service', 'share_schedule_lineup_service',
  'shift_exchange_lineup_reconciliation_issue', 'shift_exchange_notification_allowed_staffing_base',
  'shift_exchange_person_scheduled', 'shift_exchange_reconcile_shared_base', 'upsert_schedule_lineup_brief_service',
  'upsert_schedule_lineup_entry_operations_base', 'upsert_schedule_lineup_entry_service',
  'upsert_schedule_lineup_section_service', 'weekly_lineup_accepted_offer', 'weekly_lineup_assignment_target',
  'weekly_lineup_candidate_option', 'weekly_lineup_entry_span', 'weekly_lineup_manager_candidate',
  'weekly_lineup_offer_candidate', 'weekly_lineup_offer_warning'
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
select ok(
  not exists (
    select 1 from pg_constraint
    where conname = 'weekly_preference_commitment_decisions_kind_check' and pg_get_constraintdef(oid) like '%lineup_offer%'
  ),
  'the Line Up offer request kind stays gone'
);
select is(
  array(select r.name from retired r where r.kind = 'checklist' and r.name = any (app_private.owner_setup_checklist_item_ids()) order by 1),
  '{}'::text[], 'retired owner setup steps stay gone'
);

select * from finish();
rollback;
