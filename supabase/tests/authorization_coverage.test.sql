begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- Every server entry point (public.*_service) is tied to an action the
-- authorization matrix speaks for, or to a stated reason it has none. A new
-- entry point fails here until somebody writes down which it is, so no door
-- opens without a rule.
--
-- Actions are the keys the matrix and, from stage 4, app_private.authorize()
-- use. Exemptions:
--   exempt:worker     background work with no signed-in person (outbox, cron, maintenance)
--   exempt:token      a link token identifies the caller, not a session
--   exempt:predicate  a permission helper the API asks before acting; goes when
--                     authorize() replaces it (stages 4 and 6)
-- The exemption counts below only go down.

create temporary table service_class (name text primary key, class text not null);
insert into service_class values
  ('accept_employee_invitation_by_id_service', 'account.self'),
  ('accept_employee_invitation_service', 'account.self'),
  ('acknowledge_announcement_service', 'announcement.acknowledge'),
  ('acknowledge_document_lifecycle_service', 'documents.self'),
  ('acquire_schedule_edit_session_service', 'schedule.edit'),
  ('add_schedule_pending_op_service', 'schedule.edit'),
  ('apply_policy_definition_service', 'settings.documents.write'),
  ('apply_notification_email_event_service', 'exempt:worker'),
  ('apply_schedule_auto_fill_service', 'schedule.edit'),
  ('apply_schedule_default_hours_service', 'schedule.edit'),
  ('apply_schedule_template_service', 'schedule.templates'),
  ('autosave_schedule_edit_session_service', 'schedule.edit'),
  ('approve_signature_retention_policy_service', 'settings.documents.write'),
  ('assess_schedule_shift_service', 'schedule.edit'),
  ('assess_weekly_schedule_assignment_service', 'schedule.edit'),
  ('bulk_delete_schedule_edit_shifts_service', 'schedule.edit'),
  ('cancel_account_email_change_service', 'account.self'),
  ('claim_account_recovery_resend_service', 'account.self'),
  ('claim_notification_emails_service', 'exempt:worker'),
  ('claim_notification_push_service', 'exempt:worker'),
  ('claim_password_reset_send_service', 'account.self'),
  ('cancel_workspace_closure_service', 'workspace.close'),
  ('cancel_workspace_ownership_transfer_service', 'workspace.transfer_ownership'),
  -- ROL-CIFT 4.1: one rank above the person's highest access; the owner gives themselves the employee access
  ('change_employee_access_service', 'employee.change_role'),
  ('claim_account_deletion_work_service', 'exempt:worker'),
  ('complete_account_deletion_work_service', 'exempt:worker'),
  ('count_account_attention_service', 'account.self'),
  ('create_department_jobs_service', 'settings.jobs.write'),
  ('create_department_with_jobs_service', 'settings.jobs.write'),
  ('create_employee_command_service', 'employee.create'),
  ('create_job_with_assignments_service', 'settings.jobs.write'),
  ('create_owner_workspace_service', 'workspace.create'),
  ('create_schedule_export_preset_service', 'schedule.export'),
  ('create_schedule_export_schedule_service', 'schedule.export'),
  ('create_schedule_shifts_batch_service', 'schedule.edit'),
  ('create_schedule_template_service', 'schedule.templates'),
  ('create_workspace_todo_service', 'workspace.todos'),
  ('decide_employee_preferred_name_service', 'employee.decide_preferred_name'),
  ('decide_time_off_service', 'time_off.decide'),
  ('decline_employee_invitation_service', 'account.self'),
  ('defer_initial_employee_document_service', 'documents.self'),
  -- asks settings.locations.write for a location, settings.jobs.write for the rest (BL-133)
  ('delete_catalog_entity_service', 'settings.locations.write'),
  ('delete_job_with_assignments_service', 'settings.jobs.write'),
  ('delete_schedule_draft_service', 'schedule.edit'),
  ('delete_schedule_export_preset_service', 'schedule.export'),
  ('delete_schedule_export_schedule_service', 'schedule.export'),
  ('delete_schedule_template_service', 'schedule.templates'),
  ('delete_workspace_role_service', 'settings.roles.write'),
  ('discard_schedule_edit_session_service', 'schedule.edit'),
  ('document_definition_target_options_service', 'settings.documents.write'),
  ('documents_maintain_service', 'exempt:worker'),
  ('employee_has_hard_document_schedule_conflict_service', 'exempt:predicate'),
  ('employee_hub_actor_service', 'employee_hub.read'),
  ('employee_personal_tasks_service', 'employee_hub.self'),
  ('employee_request_action_service', 'employee_hub.self'),
  ('extend_employee_document_deadline_service', 'documents.review'),
  ('finalize_account_deletion_service', 'exempt:worker'),
  ('finalize_claimed_account_deletion_service', 'exempt:worker'),
  ('finish_notification_email_service', 'exempt:worker'),
  ('get_account_deletion_blockers_service', 'account.self'),
  ('get_announcement_service', 'announcement.read'),
  ('get_announcements_service', 'announcement.read'),
  ('get_important_dates_service', 'settings.important_dates.read'),
  -- The new notification system (BILDIRIM-07): one's own list and choices, and the workspace's settings.
  ('get_notification_feed_service', 'notifications.read_own'),
  ('get_lineup_day_service', 'lineup.read'),
  ('get_notification_preferences_service', 'notifications.read_own'),
  ('get_notification_workspace_settings_service', 'settings.organization.write'),
  ('get_employee_detail_service', 'employee.read'),
  ('get_employee_document_access_service', 'documents.self'),
  ('get_employee_document_lifecycle_path_service', 'documents.read'),
  ('get_employee_document_lifecycle_service', 'documents.read'),
  ('get_employee_hub_service', 'employee_hub.read'),
  ('get_employee_onboarding_review_service', 'onboarding.review'),
  ('get_employee_onboarding_service', 'onboarding.self'),
  ('get_employee_schedule_board_service', 'employee_hub.read'),
  ('get_own_legal_name_service', 'workspace.setup'),
  ('get_owner_setup_checklist_progress_service', 'workspace.setup'),
  ('get_schedule_edit_session_service', 'schedule.edit'),
  ('get_schedule_publication_history_service', 'schedule.read'),
  ('get_schedule_publication_status_service', 'schedule.read'),
  ('get_schedule_read_model_service', 'schedule.read'),
  -- also exchange.read for its shift-change rows (EKRAN-02 A4)
  ('get_schedule_requests_closed_service', 'requests.read'),
  ('get_schedule_requests_service', 'requests.read'),
  ('get_schedule_template_service', 'schedule.templates.read'),
  ('get_workspace_dashboard_service', 'workspace.read'),
  ('heartbeat_schedule_edit_session_service', 'schedule.edit'),
  ('initialize_employee_onboarding_service', 'onboarding.self'),
  ('initiate_workspace_ownership_transfer_service', 'workspace.transfer_ownership'),
  ('leave_employee_onboarding_service', 'onboarding.self'),
  ('list_account_deletion_avatar_photos_service', 'exempt:worker'),
  ('list_employee_document_lifecycle_service', 'documents.read'),
  ('list_employees_service', 'employee.list'),
  ('list_my_workspace_identities_service', 'account.self'),
  ('list_my_workspaces_service', 'account.self'),
  ('list_own_employment_records_service', 'account.self'),
  ('list_owner_onboarding_invitation_intents_service', 'workspace.setup'),
  ('list_pending_employee_invitations_for_account_service', 'account.self'),
  ('list_pending_preferred_names_service', 'employee.decide_preferred_name'),
  ('list_schedule_draft_document_conflicts_service', 'schedule.publish'),
  ('list_schedule_drafts_service', 'schedule.edit'),
  ('list_schedule_export_cron_candidates_service', 'exempt:worker'),
  ('list_schedule_export_events_service', 'schedule.export'),
  ('list_schedule_export_presets_service', 'schedule.export'),
  ('list_schedule_export_schedules_service', 'schedule.export'),
  ('list_schedule_pending_ops_service', 'schedule.edit'),
  ('list_schedule_templates_service', 'schedule.templates.read'),
  ('list_schedule_weekly_shifts_service', 'schedule.read'),
  ('list_settings_document_types_service', 'settings.documents.read'),
  ('list_settings_locations_service', 'settings.locations.read'),
  ('list_settings_shift_labels_service', 'settings.shift_catalog.read'),
  ('list_settings_shift_types_service', 'settings.shift_catalog.read'),
  ('load_employee_invitation_link_service', 'employee.invite'),
  ('load_employee_invitation_retry_service', 'employee.invite'),
  ('mark_account_deletion_email_sent_service', 'exempt:worker'),
  ('mark_employee_invitation_delivery_service', 'employee.invite'),
  ('mark_owner_onboarding_invitation_intent_dispatched_service', 'workspace.setup'),
  ('mark_owner_setup_checklist_item_service', 'workspace.setup'),
  ('mark_notifications_read_service', 'notifications.read_own'),
  ('mark_notifications_seen_service', 'notifications.read_own'),
  ('mark_workspace_retention_purge_completed_service', 'exempt:worker'),
  ('mutate_schedule_edit_shift_service', 'schedule.edit'),
  ('onboarding_phone_in_use_service', 'onboarding.self'),
  ('organization_job_counts_service', 'employee.list'),
  ('prepare_account_deletion_delivery_service', 'exempt:worker'),
  ('prepare_account_deletion_recovery_resend_service', 'account.self'),
  ('prepare_employee_invitation_service', 'employee.invite'),
  ('preview_announcement_service', 'announcement.write'),
  ('preview_document_publication_service', 'settings.documents.write'),
  -- also schedule.edit where the closed day opens shifts (FB-6.7 C, K13)
  ('preview_employee_access_change_service', 'employee.change_role'),
  ('preview_employee_document_assignments_service', 'employee.save'),
  ('preview_employee_invitation_service', 'exempt:token'),
  ('preview_policy_definition_apply_service', 'settings.documents.write'),
  ('preview_schedule_auto_fill_service', 'schedule.edit'),
  ('preview_schedule_default_hours_service', 'schedule.edit'),
  ('preview_schedule_export_service', 'schedule.export'),
  ('preview_schedule_publication_service', 'schedule.publish'),
  ('preview_schedule_template_apply_service', 'schedule.templates'),
  ('preview_schedule_unpublication_service', 'schedule.publish'),
  ('publish_schedule_draft_service', 'schedule.publish'),
  ('publish_signature_template_service', 'settings.documents.write'),
  ('queue_owner_onboarding_invitation_intent_service', 'workspace.setup'),
  ('read_employee_references_service', 'employee.references.read'),
  ('read_job_assignments_service', 'employee.list'),
  ('read_new_job_assignments_service', 'employee.list'),
  ('read_role_workspace_service', 'settings.roles.read'),
  ('read_settings_jobs_service', 'settings.jobs.read'),
  ('read_signature_settings_service', 'settings.signature_templates.read'),
  ('record_account_security_event_service', 'account.self'),
  ('record_schedule_export_event_service', 'schedule.export'),
  ('record_schedule_export_schedule_failure_service', 'exempt:worker'),
  ('record_schedule_export_schedule_success_service', 'exempt:worker'),
  ('release_notification_emails_service', 'exempt:worker'),
  ('remove_employee_access_service', 'employee.remove_access'),
  ('remove_employee_document_draft_file_service', 'documents.self'),
  ('remove_employee_from_location_service', 'employee.remove_from_location'),
  ('remove_schedule_pending_op_service', 'schedule.edit'),
  ('rename_schedule_template_service', 'schedule.templates'),
  ('renew_account_deletion_work_service', 'exempt:worker'),
  ('reorder_document_types_service', 'settings.documents.write'),
  ('reorder_shift_labels_service', 'settings.jobs.write'),
  ('reorder_shift_types_service', 'settings.jobs.write'),
  ('request_account_deletion_v2_service', 'account.self'),
  ('request_employee_preferred_name_service', 'employee.request_preferred_name'),
  ('request_workspace_closure_service', 'workspace.close'),
  ('reset_owner_onboarding_service', 'workspace.setup'),
  ('resolve_workspace_context_service', 'account.self'),
  ('resolve_workspace_todo_service', 'workspace.todos'),
  ('respond_workspace_ownership_transfer_service', 'workspace.accept_ownership'),
  ('restore_account_deletion_by_token_service', 'exempt:token'),
  ('review_employee_document_lifecycle_service', 'documents.review'),
  ('review_employee_onboarding_before_availability_service', 'onboarding.review'),
  ('review_employee_onboarding_service', 'onboarding.review'),
  ('revoke_employee_invitation_service', 'employee.invite'),
  ('save_announcement_service', 'announcement.write'),
  ('save_document_type_draft_service', 'settings.documents.write'),
  ('save_document_type_lifecycle_service', 'settings.documents.write'),
  ('save_document_type_service', 'settings.documents.write'),
  ('save_employee_document_draft_file_service', 'documents.self'),
  ('save_employee_onboarding_profile_service', 'onboarding.self'),
  ('save_employee_service', 'employee.save'),
  ('save_notification_preferences_service', 'notifications.write_own'),
  ('save_notification_workspace_settings_service', 'settings.organization.write'),
  ('save_own_employment_contact_service', 'employee.save_own_contact'),
  ('save_owner_legal_name_service', 'workspace.setup'),
  ('save_policy_lifecycle_service', 'settings.documents.write'),
  ('save_schedule_edit_session_service', 'schedule.edit'),
  ('save_signature_retention_policy_service', 'settings.documents.write'),
  ('save_signature_template_draft_service', 'settings.documents.write'),
  ('save_workspace_layout_service', 'workspace.todos'),
  ('save_workspace_role_service', 'settings.roles.write'),
  ('schedule_current_week_start_service', 'schedule.read'),
  ('schedule_draft_has_hard_document_conflicts_service', 'exempt:predicate'),
  ('schedule_shift_in_department_scope_service', 'exempt:predicate'),
  ('search_workspace_ownership_candidates_service', 'workspace.transfer_ownership'),
  ('set_active_workspace_service', 'account.self'),
  ('set_document_publication_service', 'settings.documents.write'),
  ('set_document_type_archived_service', 'settings.documents.write'),
  ('set_employee_archived_service', 'employee.archive'),
  ('set_announcement_state_service', 'announcement.write'),
  ('set_employee_document_exemption_service', 'documents.review'),
  ('set_employee_document_timezone_service', 'employee.save'),
  ('set_owner_setup_checklist_closed_service', 'workspace.setup'),
  ('set_signature_retention_policy_archived_service', 'settings.documents.write'),
  ('set_signature_template_archived_service', 'settings.documents.write'),
  ('shift_exchange_schedule_recovery_service', 'schedule.edit'),
  ('shift_exchanges_candidates_service', 'exchange.read'),
  ('shift_exchanges_command_service', 'exchange.command'),
  ('shift_exchanges_maintain_service', 'exempt:worker'),
  ('shift_exchanges_read_service', 'exchange.read'),
  ('request_time_off_cancellation_service', 'time_off.request_own'),
  ('revoke_time_off_service', 'time_off.revoke'),
  ('shorten_time_off_service', 'time_off.revoke'),
  ('store_employee_invitation_delivery_secret_service', 'employee.invite'),
  ('submit_employee_document_lifecycle_service', 'documents.self'),
  ('submit_employee_onboarding_service', 'onboarding.self'),
  ('submit_time_off_service', 'time_off.request_own'),
  ('sync_expiring_document_todos_service', 'exempt:worker'),
  ('terminate_employee_service', 'employee.terminate'),
  ('touch_workspace_membership_service', 'account.self'),
  ('unapprove_signature_retention_policy_service', 'settings.documents.write'),
  ('undo_schedule_edit_session_step_service', 'schedule.edit'),
  ('unpublish_schedule_service', 'schedule.publish'),
  ('unpublish_signature_template_service', 'settings.documents.write'),
  ('update_department_with_jobs_service', 'settings.jobs.write'),
  ('update_employee_membership_role_service', 'employee.change_role'),
  ('update_job_assignments_service', 'employee.save'),
  ('update_job_details_and_assignments_service', 'settings.jobs.write'),
  ('update_owner_onboarding_service', 'workspace.setup'),
  ('update_schedule_export_preset_service', 'schedule.export'),
  ('update_schedule_export_schedule_service', 'schedule.export'),
  ('update_schedule_pending_op_service', 'schedule.edit'),
  -- also settings.conflict_rules.write when the payload touches conflict handling (FB-6.1 N3)
  ('update_scheduling_settings_service', 'settings.scheduling.write'),
  ('weekly_preference_settings_read_service', 'settings.availability.read'),
  ('weekly_preference_settings_save_service', 'settings.availability.write'),
  ('weekly_preferences_read_service', 'availability.own'),
  ('weekly_preferences_save_service', 'availability.own'),
  ('verify_account_password_service', 'account.self'),
  ('weekly_team_read_service', 'availability.team_read'),
  ('withdraw_document_acknowledgement_service', 'documents.self'),
  -- Lineup publishing (LINEUP-PUBLISH): the manager publishes, the employee reads and acknowledges her own.
  ('lineup_command_service', 'lineup.share'),
  ('get_my_lineups_service', 'employee_hub.read'),
  ('acknowledge_lineup_service', 'lineup.acknowledge'),
  -- Phone alerts (BILDIRIM-15): a person's own devices; the worker sends.
  ('save_notification_push_subscription_service', 'account.self'),
  ('delete_notification_push_subscription_service', 'account.self'),
  ('finish_notification_push_service', 'exempt:worker'),
  ('release_notification_push_service', 'exempt:worker'),
  -- One dispatcher for every channel (BILDIRIM-DAGITICI): its lease and its alerts are the worker's.
  ('begin_notification_dispatch_service', 'exempt:worker'),
  ('end_notification_dispatch_service', 'exempt:worker'),
  ('notification_dispatch_alerts_service', 'exempt:worker'),
  ('raise_notification_alerts_service', 'exempt:worker'),
  -- One avatar per workspace membership (AVATAR-IKON): one's own, and a manager's read and photo removal.
  ('get_own_avatar_service', 'avatar.self'),
  ('save_own_avatar_service', 'avatar.self'),
  ('remove_own_avatar_service', 'avatar.self'),
  ('get_last_avatar_service', 'avatar.self'),
  ('get_member_avatar_service', 'employee.read'),
  ('remove_member_photo_service', 'employee.save');

select is(
  array(
    select distinct p.proname::text from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname like '%\_service'
      and p.proname::text not in (select name from service_class)
    order by 1
  ),
  '{}'::text[],
  'every service entry point is classified'
);
select is(
  array(
    select c.name from service_class c
    where not exists (
      select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = c.name
    )
    order by 1
  ),
  '{}'::text[],
  'no classification row names an entry point that is gone'
);
-- The core answers for every action an entry point is tied to.
-- shift_exchanges_command_service is one entry point for several actions
-- (exchange.offer_own, exchange.apply_own, exchange.approve).
select is(
  array(
    select distinct c.class from service_class c
    where c.class not like 'exempt:%' and c.class <> 'exchange.command'
      and not exists (select 1 from app_private.authz_actions a where a.key = c.class)
    order by 1
  ),
  '{}'::text[],
  'the authorization core knows every action an entry point is tied to'
);
select ok(
  not exists (select 1 from service_class where class like 'exempt:%' and class not in (
    'exempt:worker', 'exempt:token', 'exempt:predicate')),
  'every exemption is one of the stated reasons'
);
-- FB-6.7 took the announcement helpers (16 -> 11), FB-6.4 A2 the three Schedule helpers (11 -> 8),
-- BILDIRIM-06 the old notification system's (8 -> 3).
select cmp_ok((select count(*)::integer from service_class where class = 'exempt:predicate'), '<=', 3, 'permission helpers only go down');

select * from finish();
rollback;
