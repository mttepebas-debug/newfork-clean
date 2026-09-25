-- FOUNDATION-B 5.5: what nothing reaches any more is gone.
--
-- Measured on 2026-09-24 against the catalog and the code: no trigger, policy,
-- view, default, constraint, index, cron job, other function or product code
-- names these objects. The product has no live data, so nothing is kept for
-- an old client.

-- 1. Read policies on employee tables the browser cannot read at all (no grant
--    since 2026-09-08). They never ran.
drop policy employee_events_select on public.employee_events;
drop policy employee_invitations_select on public.employee_invitations;
drop policy employee_jobs_select on public.employee_job_assignments;
drop policy employee_locations_select on public.employee_location_assignments;
drop policy employee_offboarding_followups_select on public.employee_offboarding_followups;
drop policy employee_offboarding_shift_actions_select on public.employee_offboarding_shift_actions;
drop policy employee_profiles_select on public.employee_profiles;
drop policy employee_terminations_select on public.employee_terminations;

-- 2. The 2026-09-14 role and scope snapshots (BL-051), empty since the
--    scope table became a view.
drop table app_private.bl051_membership_scope_snapshot;
drop table app_private.bl051_role_grant_snapshot;

-- 3. Functions with no caller. Among them the old employee-onboarding
--    document path (upload confirmation and reset always refused; the
--    signature and download paths had no screen), the document-type Apply
--    (publishing a document type applies it), and service twins the API
--    replaced (announcements, notification preferences, account deletion work).
drop function public.acknowledge_employee_requirement_service(target_user_id uuid, target_requirement_id uuid, signer_name text, expected_content_digest text, authenticated_timestamp timestamp with time zone, request_idempotency_key uuid, expected_revision integer);
drop function public.act_on_notification_service(actor_user_id uuid, target_workspace_id uuid, target_notification_id uuid, target_action text);
drop function public.apply_document_definition_service(actor_user_id uuid, target_workspace_id uuid, target_document_type_id uuid, expected_revision integer, expected_preview_token text, apply_reason text);
drop function public.confirm_employee_document_service(target_user_id uuid, target_requirement_id uuid, storage_object_path text, upload_filename text, upload_media_type text, upload_size_bytes bigint, upload_expiry_date date, expected_revision integer);
drop function public.create_schedule_publish_notifications_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date, target_publication_ids uuid[], target_employee_ids uuid[]);
drop function public.delete_workspace_role(target_workspace_id uuid, target_role_id uuid);
drop function public.get_employee_document_path_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, target_requirement_id uuid);
drop function public.heartbeat_notification_outbox_service(target_worker_id text, target_outbox_id uuid, target_lease_seconds integer);
drop function public.list_account_deletion_work_service(target_now timestamp with time zone, target_batch_size integer);
drop function public.preview_document_definition_apply_service(actor_user_id uuid, target_workspace_id uuid, target_document_type_id uuid);
drop function public.reset_employee_onboarding_service(target_user_id uuid, expected_revision integer);
drop function public.resolve_notification_in_app_policy_v1_service(target_workspace_id uuid, target_user_id uuid, target_type_key text, target_category text);
drop function public.rotate_account_deletion_recovery_token_service(target_request_id uuid, recovery_token_digest text);
drop function public.save_announcement_service(actor_user_id uuid, target_workspace_id uuid, target_announcement_id uuid, target_expected_revision integer, target_title text, target_body text, target_category text, target_audience_roles text[], target_location_ids uuid[], target_publish_at timestamp with time zone, target_expires_at timestamp with time zone, target_action_url text);
drop function public.save_employee_ssn_envelope_service(target_user_id uuid, encrypted_ciphertext text, encrypted_key text, encrypted_nonce text, encrypted_tag text, kms_key_id text, kms_key_version text, ssn_last_four text, expected_revision integer);
drop function public.save_notification_user_preference_service(actor_user_id uuid, target_workspace_id uuid, target_preference_scope text, target_scope_key text, target_channel_preferences jsonb, target_cadence text, target_timezone text, target_quiet_hours jsonb, target_safe_preview_enabled boolean, target_expected_version integer);
drop function public.save_workspace_role(target_workspace_id uuid, target_role_id uuid, role_name text, role_description text, role_access_class workspace_role, permission_keys text[]);
drop function public.schedule_request_shift_payload_service(target_shift_id uuid);
drop function public.shift_exchange_reconcile(actor uuid, w uuid, s jsonb, new_employee uuid);
drop function public.update_owner_onboarding(target_workspace_id uuid, workspace_name text, next_step smallint, mark_complete boolean);

-- 4. "Worked shifts kept" was always 0 since time tracking went (5.2).
CREATE OR REPLACE FUNCTION public.get_schedule_publication_status_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'week_start', target_week_start,
    'week_end', target_week_start + 6,
    'week_start_day', coalesce(settings.week_start_day, 'monday'::public.schedule_week_start),
    'schedule_deadline_day', coalesce(settings.schedule_deadline_day, 'sunday'::public.schedule_deadline_day),
    'is_anchor_only', false,
    'locations', coalesce(jsonb_agg(jsonb_build_object(
      'id', location.id,
      'name', location.name,
      'color', null,
      'timezone', location.timezone,
      'status', case
        when publication.id is not null and published_counts.shift_count > 0 then 'published'
        else 'unpublished'
      end,
      'reason', case
        when publication.id is not null and published_counts.shift_count > 0 then 'active_publication_and_shifts'
        when publication.id is not null then 'no_published_shifts'
        else 'missing_publication'
      end,
      'publication_includes_location', publication.id is not null,
      'published_shift_count', coalesce(published_counts.shift_count, 0),
      'draft_shift_count', coalesce(draft_counts.shift_count, 0),
      'published_at', publication.published_at,
      'published_by_name', null
    ) order by location.sort_order, location.name), '[]'::jsonb)
  )
  from public.workspace_scheduling_settings settings
  right join public.locations location
    on location.workspace_id = target_workspace_id
   and location.archived_at is null
  left join public.schedule_location_publications publication
    on publication.workspace_id = target_workspace_id
   and publication.location_id = location.id
   and publication.week_start = target_week_start
   and publication.status = 'current'
  left join lateral (
    select count(*)::integer as shift_count
      from public.schedule_published_shifts shift
     where shift.publication_id = publication.id
  ) published_counts on true
  left join lateral (
    select count(*)::integer as shift_count
      from public.schedule_draft_shifts shift
      join public.schedule_drafts draft
        on draft.id = shift.draft_id
       and draft.workspace_id = shift.workspace_id
     where shift.workspace_id = target_workspace_id
       and shift.location_id = location.id
       and draft.week_start = target_week_start
       and draft.archived_at is null
  ) draft_counts on true
  where settings.workspace_id = target_workspace_id
    and public.schedule_actor_has_capability_service(
      actor_user_id,
      target_workspace_id,
      'schedule.read'
    )
    and public.schedule_actor_can_manage_service(
      actor_user_id,
      target_workspace_id,
      location.id
    )
  group by settings.week_start_day, settings.schedule_deadline_day;
$function$;

CREATE OR REPLACE FUNCTION public.unpublish_schedule_service_exchange_base(actor_user_id uuid, target_workspace_id uuid, target_week_start date, target_location_ids uuid[], expected_fingerprint text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  preview jsonb;
  normalized_locations uuid[];
  publication_ids uuid[];
  effective_unpublished_at timestamptz := now();
begin
  select array_agg(distinct location_id order by location_id) into normalized_locations
  from unnest(target_location_ids) location_id;
  perform 1 from public.schedule_location_publications publication
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_week_start
    and publication.location_id = any(normalized_locations)
    and publication.status = 'current' for update;
  preview := public.preview_schedule_unpublication_service(
    actor_user_id, target_workspace_id, target_week_start, normalized_locations
  );
  if preview->>'status' = 'past_week_closed' then
    raise exception 'past schedule week is closed' using errcode = '42501';
  end if;
  if preview->>'fingerprint' <> expected_fingerprint then
    raise exception 'stale unpublication preview' using errcode = '40001';
  end if;
  select array_agg((item->>'publication_id')::uuid order by item->>'publication_id')
  into publication_ids from jsonb_array_elements(preview->'locations') item;

  update public.schedule_location_publications
  set status = 'unpublished', unpublished_by = actor_user_id,
    unpublished_at = effective_unpublished_at
  where id = any(publication_ids) and status = 'current';
  if not found then raise exception 'stale unpublication preview' using errcode = '40001'; end if;
  insert into public.schedule_publication_events (
    workspace_id, week_start, action, actor_user_id, location_ids,
    publication_ids, preflight_fingerprint, diff_summary
  ) values (
    target_workspace_id, target_week_start, 'unpublished', actor_user_id,
    normalized_locations, publication_ids, expected_fingerprint,
    jsonb_build_object('locations', preview->'locations')
  );
  return jsonb_build_object(
    'status', 'unpublished', 'workspace_id', target_workspace_id,
    'week_start', target_week_start, 'location_ids', to_jsonb(normalized_locations),
    'publication_ids', to_jsonb(publication_ids),
    'unpublished_at', effective_unpublished_at
  );
end;
$function$;
