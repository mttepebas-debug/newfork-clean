alter table public.notifications
  add constraint notifications_id_workspace_id_key unique (id, workspace_id);

alter table public.schedule_edit_sessions
  add constraint schedule_edit_sessions_id_workspace_id_key unique (id, workspace_id);

alter table public.schedule_location_publications
  add constraint schedule_location_publications_id_workspace_id_key unique (id, workspace_id);

alter table public.schedule_published_shifts
  add constraint schedule_published_shifts_id_workspace_id_key unique (id, workspace_id);

alter table public.time_amendments
  add constraint time_amendments_id_workspace_id_key unique (id, workspace_id);

alter table public.time_export_snapshots
  add constraint time_export_snapshots_id_workspace_id_key unique (id, workspace_id);

alter table public.time_review_windows
  add constraint time_review_windows_id_workspace_id_key unique (id, workspace_id);

alter table public.time_sessions
  add constraint time_sessions_id_workspace_id_key unique (id, workspace_id);

alter table public.employee_offboarding_followups
  drop constraint if exists employee_offboarding_followups_shift_id_fkey;

alter table public.employee_offboarding_followups
  add constraint employee_offboarding_followups_shift_id_workspace_id_fkey
  foreign key (shift_id, workspace_id)
  references public.schedule_published_shifts(id, workspace_id) on delete restrict;

alter table public.employee_offboarding_shift_actions
  drop constraint if exists employee_offboarding_shift_actions_shift_id_fkey;

alter table public.employee_offboarding_shift_actions
  add constraint employee_offboarding_shift_actions_shift_id_workspace_id_fkey
  foreign key (shift_id, workspace_id)
  references public.schedule_published_shifts(id, workspace_id) on delete restrict;

alter table public.employee_terminations
  drop constraint if exists employee_terminations_active_session_id_fkey;

alter table public.employee_terminations
  add constraint employee_terminations_active_session_id_workspace_id_fkey
  foreign key (active_session_id, workspace_id)
  references public.time_sessions(id, workspace_id) on delete restrict;

alter table public.notification_inbox_items
  drop constraint if exists notification_inbox_items_legacy_notification_id_fkey;

alter table public.notification_inbox_items
  add constraint notification_inbox_items_legacy_notification_id_workspace_id_fkey
  foreign key (legacy_notification_id, workspace_id)
  references public.notifications(id, workspace_id) on delete restrict;

alter table public.schedule_edit_session_shifts
  drop constraint if exists schedule_edit_session_shifts_session_id_fkey;

alter table public.schedule_edit_session_shifts
  add constraint schedule_edit_session_shifts_session_id_workspace_id_fkey
  foreign key (session_id, workspace_id)
  references public.schedule_edit_sessions(id, workspace_id) on delete cascade;

alter table public.schedule_edit_sessions
  drop constraint if exists schedule_edit_sessions_recovered_draft_id_fkey;

alter table public.schedule_edit_sessions
  add constraint schedule_edit_sessions_recovered_draft_id_workspace_id_fkey
  foreign key (recovered_draft_id, workspace_id)
  references public.schedule_drafts(id, workspace_id);

alter table public.schedule_location_publications
  drop constraint if exists schedule_location_publications_superseded_by_fkey;

alter table public.schedule_location_publications
  add constraint schedule_location_publications_superseded_by_workspace_id_fkey
  foreign key (superseded_by, workspace_id)
  references public.schedule_location_publications(id, workspace_id);

alter table public.schedule_publication_overrides
  drop constraint if exists schedule_publication_overrides_publication_id_fkey;

alter table public.schedule_publication_overrides
  add constraint schedule_publication_overrides_publication_id_workspace_id_fkey
  foreign key (publication_id, workspace_id)
  references public.schedule_location_publications(id, workspace_id) on delete restrict;

alter table public.schedule_shift_change_requests
  drop constraint if exists schedule_shift_change_requests_offered_shift_id_fkey,
  drop constraint if exists schedule_shift_change_requests_requested_shift_id_fkey;

alter table public.schedule_shift_change_requests
  add constraint schedule_shift_change_requests_offered_shift_id_workspace_id_fkey
  foreign key (offered_shift_id, workspace_id)
  references public.schedule_published_shifts(id, workspace_id) on delete restrict,
  add constraint schedule_shift_change_requests_requested_shift_id_workspace_id_fkey
  foreign key (requested_shift_id, workspace_id)
  references public.schedule_published_shifts(id, workspace_id) on delete restrict;

alter table public.scheduled_schedule_exports
  drop constraint if exists scheduled_schedule_exports_preset_id_fkey;

alter table public.scheduled_schedule_exports
  add constraint scheduled_schedule_exports_preset_id_workspace_id_fkey
  foreign key (preset_id, workspace_id)
  references public.schedule_export_presets(id, workspace_id) on delete restrict;

alter table public.time_correction_requests
  drop constraint if exists time_correction_requests_result_amendment_id_fkey;

alter table public.time_correction_requests
  add constraint time_correction_requests_result_amendment_id_workspace_id_fkey
  foreign key (result_amendment_id, workspace_id)
  references public.time_amendments(id, workspace_id);

alter table public.time_export_snapshot_rows
  drop constraint if exists time_export_snapshot_rows_review_window_id_fkey,
  drop constraint if exists time_export_snapshot_rows_snapshot_id_fkey;

alter table public.time_export_snapshot_rows
  add constraint time_export_snapshot_rows_review_window_id_workspace_id_fkey
  foreign key (review_window_id, workspace_id)
  references public.time_review_windows(id, workspace_id) on delete restrict,
  add constraint time_export_snapshot_rows_snapshot_id_workspace_id_fkey
  foreign key (snapshot_id, workspace_id)
  references public.time_export_snapshots(id, workspace_id) on delete restrict;
