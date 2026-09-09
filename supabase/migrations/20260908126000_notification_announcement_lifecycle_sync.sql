create or replace function public.synchronize_announcement_notification_lifecycle_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox_row public.notification_outbox%rowtype;
  legacy_notification_ids uuid[] := '{}'::uuid[];
  next_visibility text;
begin
  if new.status <> 'cancelled' and new.revision = old.revision then
    return new;
  end if;
  next_visibility := case when new.status = 'cancelled' then 'cancelled' else 'superseded' end;

  for outbox_row in
    select * from public.notification_outbox outbox
    where outbox.workspace_id = new.workspace_id
      and outbox.type_key = 'communications.announcement.available'
      and outbox.subject_type = 'announcement'
      and outbox.subject_id = new.id::text
    for update
  loop
    perform public.project_notification_event_service(outbox_row.id);
    update public.notification_events event
    set cancelled_at = coalesce(event.cancelled_at, now())
    where event.id = outbox_row.event_id and event.workspace_id = new.workspace_id;

    select coalesce(array_agg(item.legacy_notification_id), '{}'::uuid[])
    into legacy_notification_ids
    from public.notification_inbox_items item
    join public.notification_recipients recipient on recipient.id = item.recipient_projection_id
    where recipient.workspace_id = new.workspace_id
      and recipient.event_id = outbox_row.event_id
      and item.legacy_notification_id is not null;

    update public.notification_inbox_items item
    set visibility_state = next_visibility,
        legacy_notification_id = null
    from public.notification_recipients recipient
    where recipient.id = item.recipient_projection_id
      and recipient.workspace_id = new.workspace_id
      and recipient.event_id = outbox_row.event_id;

    delete from public.notifications notification
    where notification.id = any(legacy_notification_ids)
      and notification.workspace_id = new.workspace_id
      and notification.source_type = 'notification_event'
      and notification.source_id = outbox_row.event_id;

    update public.notification_outbox outbox
    set status = 'processed',
        lease_owner = null,
        lease_expires_at = null,
        last_error = case when next_visibility = 'cancelled'
          then 'announcement cancelled before or after projection'
          else 'announcement revision superseded before or after projection' end,
        payload = outbox.payload || jsonb_build_object(
          'cancelled_at', now(), 'visibility_state', next_visibility
        )
    where outbox.id = outbox_row.id
      and outbox.status in ('pending', 'retry', 'leased');
  end loop;

  return new;
end;
$$;

drop trigger if exists synchronize_announcement_notification_lifecycle
on public.announcements;
create trigger synchronize_announcement_notification_lifecycle
after update of status, revision on public.announcements
for each row execute function public.synchronize_announcement_notification_lifecycle_service();

revoke all on function public.synchronize_announcement_notification_lifecycle_service() from public, anon, authenticated;
