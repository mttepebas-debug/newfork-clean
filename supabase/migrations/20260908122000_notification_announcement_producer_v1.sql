update public.notification_catalog
set lifecycle = 'active'
where type_key = 'communications.announcement.available'
  and schema_version = 1;

update public.notification_template_versions
set content = jsonb_build_object(
      'title', '{{title}}',
      'body', '{{body}}',
      'safe_preview', 'A new announcement is available.',
      'action_url', '/app/announcements'
    ),
    status = 'published',
    published_at = coalesce(published_at, now())
where type_key = 'communications.announcement.available'
  and schema_version = 1
  and channel = 'in_app'
  and locale = 'en'
  and template_version = 1;

alter function public.publish_announcement_service(uuid, uuid, uuid, integer)
  rename to publish_announcement_service_legacy_notifications;

create function public.publish_announcement_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_announcement_id uuid,
  target_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  announcement public.announcements%rowtype;
  notification_event_id uuid;
  recipient_user_ids uuid[] := '{}'::uuid[];
  location_ids uuid[] := '{}'::uuid[];
  visible_at timestamptz;
begin
  result := public.publish_announcement_service_legacy_notifications(
    actor_user_id,
    target_workspace_id,
    target_announcement_id,
    target_expected_revision
  );

  select * into announcement
  from public.announcements item
  where item.id = target_announcement_id
    and item.workspace_id = target_workspace_id;

  select coalesce(array_agg(distinct notification.recipient_user_id order by notification.recipient_user_id), '{}'::uuid[])
  into recipient_user_ids
  from public.notifications notification
  where notification.workspace_id = target_workspace_id
    and notification.source_type = 'announcement'
    and notification.source_id = target_announcement_id
    and notification.event_key = 'published';

  select coalesce(array_agg(target.location_id order by target.location_id), '{}'::uuid[])
  into location_ids
  from public.announcement_locations target
  where target.workspace_id = target_workspace_id
    and target.announcement_id = target_announcement_id;

  delete from public.notifications notification
  where notification.workspace_id = target_workspace_id
    and notification.source_type = 'announcement'
    and notification.source_id = target_announcement_id
    and notification.event_key = 'published';

  notification_event_id := (
    substr(md5(target_workspace_id::text || ':' || target_announcement_id::text || ':' || announcement.revision::text), 1, 8) || '-' ||
    substr(md5(target_workspace_id::text || ':' || target_announcement_id::text || ':' || announcement.revision::text), 9, 4) || '-' ||
    substr(md5(target_workspace_id::text || ':' || target_announcement_id::text || ':' || announcement.revision::text), 13, 4) || '-' ||
    substr(md5(target_workspace_id::text || ':' || target_announcement_id::text || ':' || announcement.revision::text), 17, 4) || '-' ||
    substr(md5(target_workspace_id::text || ':' || target_announcement_id::text || ':' || announcement.revision::text), 21, 12)
  )::uuid;
  visible_at := coalesce(announcement.publish_at, announcement.updated_at);

  perform public.enqueue_notification_outbox_service(
    target_workspace_id,
    notification_event_id,
    'communications.announcement.available',
    1,
    actor_user_id,
    'announcement',
    announcement.id::text,
    jsonb_build_object(
      'correlation_id', notification_event_id,
      'announcement_id', announcement.id,
      'announcement_revision', announcement.revision,
      'location_ids', to_jsonb(location_ids),
      'recipient_user_ids', to_jsonb(recipient_user_ids),
      'audience_contract', 'announcement_targeted_members',
      'category', 'announcement',
      'title', announcement.title,
      'body', left(announcement.body, 2000),
      'safe_preview', 'A new announcement is available.',
      'action_url', coalesce(announcement.action_url, '/app/announcements/' || announcement.id::text),
      'group_key', 'announcement:' || announcement.id::text,
      'visible_at', visible_at
    ),
    announcement.updated_at
  );

  return result || jsonb_build_object(
    'notification_event_id', notification_event_id,
    'notification_enqueued_count', cardinality(recipient_user_ids)
  );
end;
$$;

revoke all on function public.publish_announcement_service_legacy_notifications(uuid, uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.publish_announcement_service(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.publish_announcement_service(uuid, uuid, uuid, integer) to service_role;
