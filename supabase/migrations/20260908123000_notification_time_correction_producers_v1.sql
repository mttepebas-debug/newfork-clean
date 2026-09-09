update public.notification_catalog
set lifecycle = 'active'
where type_key in (
  'time_tracking.correction.submitted',
  'time_tracking.correction.decided'
)
and schema_version = 1;

update public.notification_template_versions template
set content = case template.type_key
      when 'time_tracking.correction.submitted' then jsonb_build_object(
        'title', 'Time correction requested',
        'body', 'A time correction needs review.',
        'safe_preview', 'A time entry needs review.',
        'action_url', '/app/time-entries'
      )
      else jsonb_build_object(
        'title', 'Time correction decided',
        'body', 'Your time correction was decided.',
        'safe_preview', 'A time entry request was updated.',
        'action_url', '/app/employee-hub?tab=time'
      )
    end,
    status = 'published',
    published_at = coalesce(template.published_at, now())
where template.type_key in (
  'time_tracking.correction.submitted',
  'time_tracking.correction.decided'
)
and template.schema_version = 1
and template.channel = 'in_app'
and template.locale = 'en'
and template.template_version = 1;

alter function public.request_own_time_correction_service(uuid, uuid, uuid, integer, timestamptz, timestamptz, text, uuid)
  rename to request_own_time_correction_service_legacy_notifications;
alter function public.decide_time_correction_service(uuid, uuid, uuid, integer, text, text, uuid)
  rename to decide_time_correction_service_legacy_notifications;

create function public.request_own_time_correction_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid,
  target_expected_revision integer,
  target_requested_started_at timestamptz,
  target_requested_ended_at timestamptz,
  target_reason text,
  target_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  correction public.time_correction_requests%rowtype;
  employee public.employee_profiles%rowtype;
  recipient_user_ids uuid[] := '{}'::uuid[];
  notification_event_id uuid;
  digest text;
begin
  result := public.request_own_time_correction_service_legacy_notifications(
    actor_user_id, target_workspace_id, target_session_id, target_expected_revision,
    target_requested_started_at, target_requested_ended_at, target_reason, target_idempotency_key
  );
  select * into correction from public.time_correction_requests item
  where item.id = (result->'correction'->>'id')::uuid and item.workspace_id = target_workspace_id;
  select * into employee from public.employee_profiles item
  where item.id = correction.employee_id and item.workspace_id = target_workspace_id;

  select coalesce(array_agg(distinct membership.user_id order by membership.user_id), '{}'::uuid[])
  into recipient_user_ids
  from public.workspace_memberships membership
  join public.workspace_role_permissions permission
    on permission.workspace_id = membership.workspace_id and permission.role_id = membership.role_id
  where membership.workspace_id = target_workspace_id
    and membership.status = 'active'
    and permission.permission_key = 'time.correction.review.location'
    and (
      membership.all_locations
      or exists (
        select 1 from public.membership_location_scopes scope
        where scope.membership_id = membership.id
          and scope.workspace_id = target_workspace_id
          and scope.location_id = correction.location_id
      )
    );

  delete from public.notifications notification
  where notification.workspace_id = target_workspace_id
    and notification.source_type = 'time_correction'
    and notification.source_id = correction.id
    and notification.event_key = 'submitted';

  digest := md5(target_workspace_id::text || ':time-correction-submitted:' || target_idempotency_key::text);
  notification_event_id := (
    substr(digest, 1, 8) || '-' || substr(digest, 9, 4) || '-' || substr(digest, 13, 4) || '-' ||
    substr(digest, 17, 4) || '-' || substr(digest, 21, 12)
  )::uuid;

  perform public.enqueue_notification_outbox_service(
    target_workspace_id, notification_event_id, 'time_tracking.correction.submitted', 1,
    actor_user_id, 'time_correction', correction.id::text,
    jsonb_build_object(
      'correlation_id', notification_event_id,
      'idempotency_key_fingerprint', md5(target_idempotency_key::text),
      'correction_id', correction.id,
      'session_id', correction.session_id,
      'location_id', correction.location_id,
      'location_ids', jsonb_build_array(correction.location_id),
      'recipient_user_ids', to_jsonb(recipient_user_ids),
      'audience_contract', 'time_correction_reviewers',
      'category', 'request',
      'title', 'Time correction requested',
      'body', coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' requested a time correction.',
      'safe_preview', 'A time entry needs review.',
      'action_url', '/app/time-entries',
      'group_key', 'time_correction:' || correction.id::text
    ),
    correction.submitted_at
  );

  return result || jsonb_build_object(
    'notification_event_id', notification_event_id,
    'notification_enqueued_count', cardinality(recipient_user_ids)
  );
end;
$$;

create function public.decide_time_correction_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_correction_id uuid,
  target_expected_session_revision integer,
  target_action text,
  target_reason text,
  target_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  correction public.time_correction_requests%rowtype;
  recipient_user_ids uuid[] := '{}'::uuid[];
  notification_event_id uuid;
  notification_title text;
  digest text;
begin
  result := public.decide_time_correction_service_legacy_notifications(
    actor_user_id, target_workspace_id, target_correction_id, target_expected_session_revision,
    target_action, target_reason, target_idempotency_key
  );
  select * into correction from public.time_correction_requests item
  where item.id = target_correction_id and item.workspace_id = target_workspace_id;

  select coalesce(array_agg(employee.user_id), '{}'::uuid[])
  into recipient_user_ids
  from public.employee_profiles employee
  where employee.id = correction.employee_id
    and employee.workspace_id = target_workspace_id
    and employee.user_id is not null;

  delete from public.notifications notification
  where notification.workspace_id = target_workspace_id
    and notification.source_type = 'time_correction'
    and notification.source_id = correction.id
    and notification.event_key = 'decided';

  digest := md5(target_workspace_id::text || ':time-correction-decided:' || target_idempotency_key::text);
  notification_event_id := (
    substr(digest, 1, 8) || '-' || substr(digest, 9, 4) || '-' || substr(digest, 13, 4) || '-' ||
    substr(digest, 17, 4) || '-' || substr(digest, 21, 12)
  )::uuid;
  notification_title := case when correction.status = 'accepted'
    then 'Time correction accepted' else 'Time correction declined' end;

  perform public.enqueue_notification_outbox_service(
    target_workspace_id, notification_event_id, 'time_tracking.correction.decided', 1,
    actor_user_id, 'time_correction', correction.id::text,
    jsonb_build_object(
      'correlation_id', notification_event_id,
      'idempotency_key_fingerprint', md5(target_idempotency_key::text),
      'correction_id', correction.id,
      'session_id', correction.session_id,
      'decision', correction.status,
      'location_id', correction.location_id,
      'location_ids', jsonb_build_array(correction.location_id),
      'recipient_user_ids', to_jsonb(recipient_user_ids),
      'audience_contract', 'time_correction_requester',
      'category', 'request',
      'title', notification_title,
      'body', correction.decision_reason,
      'safe_preview', 'A time entry request was updated.',
      'action_url', '/app/employee-hub?tab=time',
      'group_key', 'time_correction:' || correction.id::text
    ),
    correction.decided_at
  );

  return result || jsonb_build_object(
    'notification_event_id', notification_event_id,
    'notification_enqueued_count', cardinality(recipient_user_ids)
  );
end;
$$;

revoke all on function public.request_own_time_correction_service_legacy_notifications(uuid, uuid, uuid, integer, timestamptz, timestamptz, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.decide_time_correction_service_legacy_notifications(uuid, uuid, uuid, integer, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.request_own_time_correction_service(uuid, uuid, uuid, integer, timestamptz, timestamptz, text, uuid) from public, anon, authenticated;
revoke all on function public.decide_time_correction_service(uuid, uuid, uuid, integer, text, text, uuid) from public, anon, authenticated;
grant execute on function public.request_own_time_correction_service(uuid, uuid, uuid, integer, timestamptz, timestamptz, text, uuid) to service_role;
grant execute on function public.decide_time_correction_service(uuid, uuid, uuid, integer, text, text, uuid) to service_role;
