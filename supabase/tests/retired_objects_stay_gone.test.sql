begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

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
  -- 5.3 the old availability system (20260924204854)
  ('table', 'availability_commands', '5.3'), ('table', 'availability_draft_impact_reviews', '5.3'),
  ('table', 'availability_events', '5.3'), ('table', 'availability_publication_locks', '5.3'),
  ('table', 'availability_requests', '5.3'), ('table', 'employee_availability_versions', '5.3'),
  ('table', 'employee_schedule_availability_versions', '5.3'), ('table', 'schedule_service_classifications', '5.3'),
  ('type', 'availability_capacity_result', '5.3'), ('type', 'availability_enforcement', '5.3'),
  ('type', 'schedule_conflict_policy', '5.3'),
  ('column', 'workspace_scheduling_settings.conflict_policy', '5.3'),
  ('column', 'workspace_scheduling_settings.availability_enforcement', '5.3'),
  ('column', 'workspace_scheduling_settings.availability_ownership', '5.3'),
  ('column', 'workspace_scheduling_settings.availability_approval', '5.3'),
  ('column', 'workspace_scheduling_settings.availability_initial_review', '5.3'),
  ('column', 'workspace_scheduling_settings.availability_notice_days', '5.3'),
  ('column', 'workspace_scheduling_settings.availability_policy_revision', '5.3'),
  ('column', 'workspace_scheduling_settings.availability_warning_policy', '5.3'),
  ('permission', 'schedule.availability.override', '5.3'),
  ('notification', 'availability.review_required', '5.3'),
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
select 'function', name, '5.3' from unnest(array[
  'assess_shift_availability', 'assess_shift_availability_context', 'assess_shift_availability_core',
  'audit_scheduling_settings_change', 'availability_activate', 'availability_actor_scope',
  'availability_calendar_comparison_service', 'availability_calendar_context',
  'availability_calendar_read_service', 'availability_capacity_for_span', 'availability_change_narrows',
  'availability_command_service', 'availability_date_override_ranges', 'availability_date_overrides_locked',
  'availability_emit', 'availability_impact_comparison', 'availability_notify',
  'availability_overlapping_temporary_versions', 'availability_pattern_capacity_for_span',
  'availability_pending_publication', 'availability_period_locked', 'availability_proposal_applies',
  'availability_proposals_overlap', 'availability_publication_preflight',
  'availability_read_before_calendar_service', 'availability_read_service',
  'availability_requests_read_service', 'availability_resolve_date_overrides', 'availability_rules_for_date',
  'availability_shift_type_rules', 'availability_validate_date_override_replacements',
  'availability_version_at_instant', 'availability_version_for_calendar', 'availability_week_capacity',
  'capture_availability_publication_lock', 'employee_availability_context_service',
  'get_employee_hub_availability_v2_service', 'get_schedule_read_model_availability_v2_service',
  'guard_availability_draft_impact_review', 'guard_availability_request', 'guard_availability_write',
  'guard_schedule_service_classification_history', 'preview_availability_draft_impact_service',
  'save_employee_availability_service', 'save_employee_availability_v2_service',
  'save_employee_hub_availability_service', 'save_onboarding_availability_v2_service',
  'save_onboarding_availability_v3_service', 'schedule_assess_availability_preview',
  'schedule_availability_publication_preflight', 'schedule_prepare_service_classification',
  'schedule_service_classification', 'sync_onboarding_availability', 'validate_availability_shift_types',
  'validate_availability_week', 'version_availability_policy', 'weekly_schedule_location_projection'
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

-- 5.5 what nothing reached any more (20260925000517)
insert into retired (kind, name, step)
select 'function', name, '5.5' from unnest(array[
  'acknowledge_employee_requirement_service', 'act_on_notification_service', 'apply_document_definition_service',
  'confirm_employee_document_service', 'create_schedule_publish_notifications_service', 'delete_workspace_role',
  'get_employee_document_path_service', 'heartbeat_notification_outbox_service',
  'list_account_deletion_work_service', 'preview_document_definition_apply_service',
  'reset_employee_onboarding_service', 'resolve_notification_in_app_policy_v1_service',
  'rotate_account_deletion_recovery_token_service', 'save_announcement_service',
  'save_employee_ssn_envelope_service', 'save_notification_user_preference_service', 'save_workspace_role',
  'schedule_request_shift_payload_service', 'shift_exchange_reconcile', 'update_owner_onboarding'
]) name;
insert into retired (kind, name, step) values
  ('private_table', 'bl051_membership_scope_snapshot', '5.5'), ('private_table', 'bl051_role_grant_snapshot', '5.5'),
  ('policy', 'employee_events.employee_events_select', '5.5'),
  ('policy', 'employee_invitations.employee_invitations_select', '5.5'),
  ('policy', 'employee_job_assignments.employee_jobs_select', '5.5'),
  ('policy', 'employee_location_assignments.employee_locations_select', '5.5'),
  ('policy', 'employee_offboarding_followups.employee_offboarding_followups_select', '5.5'),
  ('policy', 'employee_offboarding_shift_actions.employee_offboarding_shift_actions_select', '5.5'),
  ('policy', 'employee_profiles.employee_profiles_select', '5.5'),
  ('policy', 'employee_terminations.employee_terminations_select', '5.5');

select is(
  array(select r.name from retired r where r.kind = 'table' and to_regclass('public.' || r.name) is not null order by 1),
  '{}'::text[], 'retired tables stay gone'
);
select is(
  array(select r.name from retired r where r.kind = 'private_table' and to_regclass('app_private.' || r.name) is not null order by 1),
  '{}'::text[], 'retired private tables stay gone'
);
select is(
  array(
    select r.name from retired r
    join pg_policies p on p.schemaname = 'public' and p.tablename || '.' || p.policyname = r.name
    where r.kind = 'policy'
    order by 1
  ),
  '{}'::text[], 'retired policies stay gone'
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
