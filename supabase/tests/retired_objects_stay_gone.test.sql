begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

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
-- FB-6.1 .2: one overload of a name that lives on (20260925173926); the API
-- asks the seven-argument list with the locations it publishes.
insert into retired (kind, name, step) values
  ('function_signature', 'public.list_schedule_draft_document_conflicts_service(uuid, uuid, uuid, date)', 'FB-6.1.2'),
  -- nobody takes over somebody else's open edit (user decision 2026-09-25)
  ('function', 'takeover_schedule_edit_session_service', 'FB-6.1.2');
-- FB-6.1 .4: one function per Schedule job; the layers under each and the
-- overloads beside it are gone.
insert into retired (kind, name, step)
select 'function', name, 'FB-6.1.4' from unnest(array[
  'acquire_schedule_edit_session_service_past_week_base',
  'apply_schedule_template_service_label_base', 'create_schedule_template_service_label_base',
  'get_schedule_edit_session_service_base', 'get_schedule_edit_session_service_label_base',
  'get_schedule_read_model_service_employee_exclusion_base', 'get_schedule_read_model_service_label_base',
  'get_schedule_read_model_service_shift_label_management_base',
  'mutate_schedule_edit_shift_service_base', 'mutate_schedule_edit_shift_service_document_conflict_base',
  'mutate_schedule_edit_shift_service_label_base', 'mutate_schedule_edit_shift_service_soft_audit_base',
  'preview_schedule_publication_before_availability_review_service', 'preview_schedule_unpublication_exchange_base',
  'publish_schedule_draft_exchange_base', 'publish_schedule_draft_service_document_conflict_base',
  'publish_schedule_draft_service_document_conflict_legacy_base', 'publish_schedule_draft_service_label_base',
  'save_schedule_edit_session_service_base', 'save_schedule_edit_session_service_exchange_base',
  'save_schedule_edit_session_service_label_base', 'save_schedule_edit_session_service_retroactive_base',
  'unpublish_schedule_service_exchange_base'
]) name;
insert into retired (kind, name, step) values
  ('function_signature', 'public.publish_schedule_draft_service(uuid, uuid, uuid, uuid[], integer, text, jsonb)', 'FB-6.1.4'),
  ('function_signature', 'public.publish_schedule_draft_service(uuid, uuid, uuid, uuid[], uuid[], boolean, integer, text, jsonb)', 'FB-6.1.4'),
  ('function_signature', 'public.preview_schedule_publication_service(uuid, uuid, uuid, uuid[])', 'FB-6.1.4'),
  ('function_signature', 'public.apply_schedule_template_service(uuid, uuid, uuid, integer, uuid, text)', 'FB-6.1.4');
-- BL-969: the account keeps its phone once, in E.164; the column kept for a
-- backward-compatible move is gone, and so are the phone checks of the 7-30
-- character and international era (the *_us_phone checks took their place).
insert into retired (kind, name, step) values
  ('column', 'user_profiles.phone', 'BL-969'),
  ('constraint', 'user_profiles_phone_check', 'BL-969'),
  ('constraint', 'user_profiles_phone_e164_check', 'BL-969'),
  ('constraint', 'employee_private_profiles_phone_check', 'BL-969'),
  ('constraint', 'employee_private_profiles_emergency_contact_phone_check', 'BL-969');
-- BL-186: every read shows today's marks; the publication snapshot's
-- availability visibility and the reminder stamp that fed it are gone.
insert into retired (kind, name, step) values
  ('function', 'weekly_published_availability_visible', 'BL-186'),
  ('function', 'stamp_weekly_reminder_disable', 'BL-186'),
  ('column', 'manager_weekly_reminders.last_disabled_at', 'BL-186'),
  ('trigger', 'manager_weekly_reminders.weekly_reminder_disable_stamp', 'BL-186');
-- BL-995: approved time off is never given up to take a shift (KARARLAR §1.1,
-- Mert 2026-10-09); the consent each side of an exchange gave is gone.
insert into retired (kind, name, step) values
  ('function', 'weekly_exchange_time_off_consent', 'BL-995'),
  ('function', 'time_off_leave_intervals', 'BL-995'),
  ('function', 'availability_json_ranges', 'BL-995'),
  ('column', 'shift_exchange_cases.owner_time_off_consent', 'BL-995'),
  ('column', 'shift_exchange_applications.time_off_consent', 'BL-995');
-- FB-6.1.9: Settings > Roles reads through read_role_workspace_service.
insert into retired (kind, name, step) values
  ('function', 'read_role_workspace', 'FB-6.1.9');
-- FB-6.1.9: Settings reads these through the API; the browser reads none.
insert into retired (kind, name, step) values
  ('policy', 'document_types.document_types_select_authorized', 'FB-6.1.9'),
  ('policy', 'signature_retention_policies.signature_retention_policies_select_authorized', 'FB-6.1.9'),
  ('policy', 'signature_templates.signature_templates_select_authorized', 'FB-6.1.9'),
  ('policy', 'signature_template_versions.signature_template_versions_select_authorized', 'FB-6.1.9'),
  ('policy', 'workspace_role_permissions.workspace_role_permissions_select_authorized', 'FB-6.1.9'),
  ('policy', 'permissions.permissions_select_authenticated', 'FB-6.1.9');
-- BL-198: the publish asks the pre-flight check (shift_exchange_draft_undoes).
insert into retired (kind, name, step) values
  ('function', 'shift_exchange_assert_draft', 'BL-198');
-- BL-218: the owner is put on the Owner job only; new jobs are assigned by hand.
insert into retired (kind, name, step) values
  ('trigger', 'jobs.jobs_reach_the_owner', 'BL-218'),
  ('trigger', 'jobs.jobs_reach_the_owner_on_restore', 'BL-218');
-- SEC-003 (BL-269): account deletion goes one way, with the password
-- (request_account_deletion_v2_service, restore_account_deletion_by_token_service).
insert into retired (kind, name, step) values
  ('function', 'request_account_deletion_service', 'SEC-003'),
  ('function', 'restore_account_deletion_request_service', 'SEC-003');
-- FB-6.2.3: Employees reads ask the core; the browser-era bridges and the
-- open membership policy go.
insert into retired (kind, name, step) values
  ('function', 'get_employee_detail', 'FB-6.2.3'),
  ('function', 'list_employees', 'FB-6.2.3'),
  ('policy', 'workspace_memberships.memberships_select_workspace', 'FB-6.2.3');
-- FB-6.2.4: Employees writes ask the core; the browser-era write bridges, the
-- location helper only saving used, and the access snapshot's location copy
-- (nothing read it; a restored role reaches where its class says) go.
insert into retired (kind, name, step) values
  ('function', 'save_employee', 'FB-6.2.4'),
  ('function', 'set_employee_archived', 'FB-6.2.4'),
  ('function', 'terminate_employee', 'FB-6.2.4'),
  ('function', 'can_assign_employee_locations', 'FB-6.2.4'),
  ('column', 'employee_access_snapshots.all_locations', 'FB-6.2.4'),
  ('column', 'employee_access_snapshots.location_ids', 'FB-6.2.4'),
  -- nobody writes memberships from the browser (no grant); these never ran
  ('policy', 'workspace_memberships.memberships_update_manager', 'FB-6.2.4'),
  ('policy', 'workspace_memberships.memberships_delete_manager', 'FB-6.2.4');
-- FB-6.2.6: the jobs catalog, catalog deletion and Workspace home ask the core;
-- the old "may I see this person" helper (both copies) goes.
insert into retired (kind, name, step) values
  ('function', 'can_access_employee', 'FB-6.2.6');
-- FB-6.2.6: the onboarding review asks the core; the old "may I manage this
-- record" helper had no other caller.
insert into retired (kind, name, step) values
  ('function', 'can_manage_employee_record', 'FB-6.2.6');
-- FB-6.2 (KK-32, KK-34): the to-do list and Workspace home ask the core's
-- workspace.todos; their own twin gate goes.
insert into retired (kind, name, step) values
  ('function', 'authorize_workspace_todos', 'FB-6.2.6'),
  ('function', 'workspace_todo_actor_role', 'FB-6.2.6');
-- EMP-001: a manager manages the locations they are assigned to. "Manages
-- without working there" goes whole: its table, the command, the core action,
-- the role trigger and the key only its foreign key used.
insert into retired (kind, name, step) values
  ('table', 'membership_managed_locations', 'EMP-001'),
  ('function', 'set_employee_managed_locations_service', 'EMP-001'),
  ('function', 'manages_without_working', 'EMP-001'),
  ('function', 'managed_locations_follow_role', 'EMP-001'),
  ('trigger', 'workspace_memberships.managed_locations_follow_role', 'EMP-001'),
  ('action', 'employee.set_managed_locations', 'EMP-001'),
  ('constraint', 'workspace_memberships_id_workspace_id_role_key', 'EMP-001');
-- EMP-001 C: a job under Management is an ordinary job and can be primary;
-- only the Owner job never is. The trigger that cleared the primary mark of a
-- job moved under Management goes, with the helper that asked "is this a
-- Management job".
insert into retired (kind, name, step) values
  ('trigger', 'jobs.jobs_under_management_are_primary', 'EMP-001'),
  ('function', 'management_jobs_are_primary_by_department', 'EMP-001'),
  ('function', 'is_management_job', 'EMP-001');
-- BL-475: departments and jobs go by name; nobody orders them by hand. The
-- reorder command goes, and the checks that allowed any position give way to
-- *_sort_order_unused (always 0).
insert into retired (kind, name, step) values
  ('function', 'reorder_organization_entities_service', 'BL-475'),
  ('function', 'reorder_organization_entities', 'BL-475'),
  ('constraint', 'jobs_sort_order_check', 'BL-475'),
  ('constraint', 'departments_sort_order_check', 'BL-475');
-- FB-6.3.7: time off belongs to the person and is decided by its locations'
-- votes. The location on the request, the "viewed" mark, partial decisions
-- and the old submit, decide and preview path go; every request carries its
-- own time-zone snapshot, so the request's period version goes too.
insert into retired (kind, name, step) values
  ('table', 'time_off_decision_pieces', 'FB-6.3.7'),
  ('column', 'schedule_time_off_requests.location_id', 'FB-6.3.7'),
  ('column', 'schedule_time_off_requests.viewed_at', 'FB-6.3.7'),
  ('column', 'schedule_time_off_requests.period_version', 'FB-6.3.7'),
  ('notification', 'schedule.owner_time_off.shifts_opened', 'FB-6.3.7'),
  ('constraint', 'time_off_period_snapshot_complete', 'FB-6.3.7'),
  ('constraint', 'schedule_time_off_requests_period_version_check', 'FB-6.3.7');
insert into retired (kind, name, step)
select 'function', name, 'FB-6.3.7' from unnest(array[
  'decide_time_off_with_assignments_service', 'preview_time_off_assignment_decision_service',
  'resolve_schedule_time_off_request_service', 'resolve_time_off_period_decision_service',
  'apply_time_off_period_decision', 'apply_time_off_cancellation_decision',
  'submit_employee_time_off_service', 'submit_employee_time_off_periods_service',
  'mark_schedule_time_off_viewed_service', 'submit_employee_time_off_cancellation_service',
  'authorize_time_off_decision', 'authorize_time_off_request', 'time_off_proposed_approved_ranges',
  'guard_time_off_decision_piece', 'notify_owner_time_off_open_shifts', 'record_owner_time_off'
]) name;
-- BL-496: departments and jobs carry no position at all.
insert into retired (kind, name, step) values
  ('column', 'departments.sort_order', 'BL-496'), ('column', 'jobs.sort_order', 'BL-496'),
  ('constraint', 'departments_sort_order_unused', 'BL-496'), ('constraint', 'jobs_sort_order_unused', 'BL-496');
-- FB-6.7: announcements and important dates ask the core; the browser writes no
-- important date; a closed day is the Schedule's closure (BL-530).
insert into retired (kind, name, step)
select 'function', name, '6.7' from unnest(array[
  'communication_actor_has_capability_service', 'communication_actor_has_all_locations_service',
  'communication_actor_can_control_announcement_service', 'publish_announcement_service_legacy_notifications',
  'cancel_announcement_service', 'announcement_member_matches_jobs_service',
  'announcement_member_matches_locations_service', 'synchronize_announcement_notification_lifecycle_service',
  'can_manage_important_date', 'audit_important_date_change', 'normalize_important_date_locations'
]) name;
-- FB-6.6: documents, signature templates and onboarding ask the core. The
-- browser-era functions behind the eleven Settings bridges, the old person
-- helper and the onboarding activation entry point go (activation is internal).
insert into retired (kind, name, step)
select 'function', name, '6.6' from unnest(array[
  'approve_signature_retention_policy', 'publish_signature_template', 'reorder_document_types',
  'save_document_type', 'save_signature_retention_policy', 'save_signature_template_draft',
  'set_document_type_archived', 'set_signature_retention_policy_archived', 'set_signature_template_archived',
  'unapprove_signature_retention_policy', 'unpublish_signature_template',
  'service_actor_can_access_employee', 'document_publication_can_access', 'activate_employee_onboarding_case_service'
]) name;
-- FB-6.6 A1b: acknowledgements open with the documents permissions.
insert into retired (kind, name, step) values ('permission', 'signature_templates.%', '6.6');
-- AVAIL-002 A1: availability is never a conflict; the draft availability
-- conflict list had no reader (BL-206).
insert into retired (kind, name, step) values
  ('function', 'list_schedule_draft_availability_conflicts_service', 'AVAIL-002');
-- AVAIL-002 A2 (M5): no keep / cancel when availability is saved.
insert into retired (kind, name, step) values
  ('function', 'weekly_preferences_preview_service', 'AVAIL-002'),
  ('function', 'weekly_preference_commitment_conflicts', 'AVAIL-002'),
  ('function', 'weekly_preference_commitments', 'AVAIL-002'),
  ('table', 'weekly_preference_commitment_decisions', 'AVAIL-002'),
  ('column', 'weekly_preference_events.decisions', 'AVAIL-002');
-- AVAIL-002: one role-change trigger follows availability (availability_follows_role).
insert into retired (kind, name, step) values
  ('function', 'manager_note_follows_role', 'AVAIL-002'),
  ('trigger', 'workspace_memberships.manager_note_follows_role', 'AVAIL-002');

-- FB-6.4 A1: one eligibility engine (app_private.eligibility) for swap, pickup and cover.
insert into retired (kind, name, step) values
  ('function', 'weekly_assignment_candidate_base', 'FB-6.4'),
  ('function', 'weekly_assignment_candidate_check', 'FB-6.4'),
  ('function', 'weekly_exchange_candidate_check', 'FB-6.4');
-- FB-6.4 A2: Shift Hub and time off ask the core; the Schedule helpers go (FB-6.1 K-1).
insert into retired (kind, name, step) values
  ('function', 'schedule_actor_can_manage_service', 'FB-6.4'),
  ('function', 'schedule_actor_can_publish_service', 'FB-6.4'),
  ('function', 'schedule_actor_has_capability_service', 'FB-6.4');

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
  array(select r.name from retired r where r.kind = 'function_signature' and to_regprocedure(r.name) is not null order by 1),
  '{}'::text[], 'retired overloads stay gone'
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
    select r.name from retired r
    join pg_trigger t on not t.tgisinternal
    join pg_class c on c.oid = t.tgrelid and c.relnamespace = 'public'::regnamespace
    where r.kind = 'trigger' and c.relname || '.' || t.tgname = r.name
    order by 1
  ),
  '{}'::text[], 'retired triggers stay gone'
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
select ok(
  not ('partially_approved' = any (enum_range(null::public.time_off_request_status)::text[])),
  'a partly approved time-off request stays gone'
);
select ok(
  not exists (
    select 1 from pg_constraint
    where conname = 'schedule_time_off_events_action_check'
      and pg_get_constraintdef(oid) ~ '''(viewed|partially_approved|returned_to_pending)'''
  ),
  'the viewed, partly approved and returned-to-pending time-off events stay gone'
);
select is(
  array(select r.name from retired r join app_private.authz_actions a on a.key = r.name where r.kind = 'action' order by 1),
  '{}'::text[], 'retired core actions stay gone'
);
select is(
  array(select r.name from retired r join pg_constraint c on c.conname = r.name where r.kind = 'constraint' order by 1),
  '{}'::text[], 'retired constraints stay gone'
);
select is(
  array(select r.name from retired r where r.kind = 'checklist' and r.name = any (app_private.owner_setup_checklist_item_ids()) order by 1),
  '{}'::text[], 'retired owner setup steps stay gone'
);

select ok(
  not ('cancelled' = any (enum_range(null::public.announcement_status)::text[])),
  'a final, unrecoverable Cancel on an announcement stays gone (unpublish and archive come back)'
);
select is(
  (select c.relkind::text from pg_class c where c.oid = 'public.schedule_closures'::regclass), 'v',
  'schedule_closures is the closed days, never a table of its own again (BL-530)'
);

select * from finish();
rollback;
