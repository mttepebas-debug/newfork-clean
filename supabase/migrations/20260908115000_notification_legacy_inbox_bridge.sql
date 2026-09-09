create or replace function public.project_notification_inbox_service(
  target_outbox_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox public.notification_outbox%rowtype;
  affected_count integer;
begin
  select * into outbox
  from public.notification_outbox item
  where item.id = target_outbox_id;
  if outbox.id is null then
    raise exception 'notification outbox item not found' using errcode = 'P0002';
  end if;

  with legacy_items as (
    insert into public.notifications (
      workspace_id, recipient_user_id, category, title, body, action_url,
      source_type, source_id, event_key, created_at
    )
    select
      recipient.workspace_id,
      recipient.recipient_user_id,
      'schedule',
      'New schedule published',
      format('Your schedule for the week of %s is available.', outbox.payload->>'week_start'),
      '/app/employee-hub?tab=schedule',
      'notification_event',
      outbox.event_id,
      'in_app',
      outbox.occurred_at
    from public.notification_recipients recipient
    where recipient.workspace_id = outbox.workspace_id
      and recipient.event_id = outbox.event_id
    on conflict (recipient_user_id, source_type, source_id, event_key) do update
      set title = excluded.title,
          body = excluded.body,
          action_url = excluded.action_url
    returning id, recipient_user_id
  )
  insert into public.notification_inbox_items (
    workspace_id, recipient_projection_id, legacy_notification_id,
    title, body, safe_preview, action_url, group_key, created_at
  )
  select
    recipient.workspace_id,
    recipient.id,
    legacy.id,
    'New schedule published',
    format('Your schedule for the week of %s is available.', outbox.payload->>'week_start'),
    'A new work schedule is available.',
    '/app/employee-hub?tab=schedule',
    'schedule:' || outbox.subject_id,
    outbox.occurred_at
  from public.notification_recipients recipient
  join legacy_items legacy on legacy.recipient_user_id = recipient.recipient_user_id
  where recipient.workspace_id = outbox.workspace_id
    and recipient.event_id = outbox.event_id
  on conflict (recipient_projection_id) do update
    set legacy_notification_id = excluded.legacy_notification_id
  where public.notification_inbox_items.legacy_notification_id is null;

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

revoke all on function public.project_notification_inbox_service(uuid) from public, anon, authenticated;
