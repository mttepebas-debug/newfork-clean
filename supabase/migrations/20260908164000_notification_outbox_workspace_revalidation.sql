create or replace function public.process_notification_outbox_service(
  target_worker_id text,
  target_outbox_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox public.notification_outbox%rowtype;
  recipient_count integer;
  inbox_count integer;
begin
  select * into outbox
  from public.notification_outbox item
  where item.id = target_outbox_id
  for update;

  if outbox.id is null then
    raise exception 'notification outbox item not found' using errcode = 'P0002';
  end if;

  if outbox.status <> 'leased'
    or outbox.lease_owner <> btrim(target_worker_id)
    or outbox.lease_expires_at <= now()
  then
    raise exception 'active notification lease required' using errcode = '42501';
  end if;

  if not app_private.workspace_allows_interactive_access(outbox.workspace_id) then
    update public.notification_outbox
    set status = 'processed',
        lease_owner = null,
        lease_expires_at = null,
        last_error = 'workspace no longer allows notification processing'
    where id = outbox.id;

    insert into public.notification_audit_log (
      workspace_id, actor_user_id, action, target_type, target_id, metadata
    ) values (
      outbox.workspace_id,
      null,
      'notification.outbox.cancelled_workspace',
      'notification_event',
      outbox.event_id::text,
      jsonb_build_object(
        'correlation_id', outbox.payload->>'correlation_id',
        'worker_id', left(btrim(target_worker_id), 120)
      )
    );

    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'workspace_not_interactive',
      'outbox_id', outbox.id,
      'event_id', outbox.event_id,
      'recipient_projections_created', 0,
      'inbox_items_created', 0
    );
  end if;

  perform public.project_notification_event_service(outbox.id);
  if outbox.type_key = 'schedule.published' and outbox.schema_version = 1 then
    recipient_count := public.project_schedule_notification_recipients_service(outbox.id);
  else
    recipient_count := public.project_notification_recipients_service(outbox.id);
  end if;
  inbox_count := public.project_notification_inbox_service(outbox.id);

  update public.notification_outbox
  set status = 'processed', lease_owner = null, lease_expires_at = null, last_error = null
  where id = outbox.id;

  insert into public.notification_audit_log (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    outbox.workspace_id, null, 'notification.outbox.processed', 'notification_event',
    outbox.event_id::text,
    jsonb_build_object(
      'correlation_id', outbox.payload->>'correlation_id',
      'recipient_projections_created', recipient_count,
      'inbox_items_created', inbox_count,
      'worker_id', left(btrim(target_worker_id), 120)
    )
  );

  return jsonb_build_object(
    'status', 'processed', 'outbox_id', outbox.id, 'event_id', outbox.event_id,
    'recipient_projections_created', recipient_count, 'inbox_items_created', inbox_count
  );
end;
$$;

revoke all on function public.process_notification_outbox_service(text, uuid)
from public, anon, authenticated;
grant execute on function public.process_notification_outbox_service(text, uuid)
to service_role;
