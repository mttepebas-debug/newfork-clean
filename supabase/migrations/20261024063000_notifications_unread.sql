-- Notification panel, slice 2b (KARARLAR S-251, Mert 2026-10-23): a person can mark their own read notices
-- unread again (on a phone, a swipe on a read row says "Unread").
--
--   * public.mark_notifications_unread_service: mark_notifications_read_service's other half. It asks the core
--     the same thing (notifications.read_own) and touches only the caller's own rows here or about their account
--     (workspace_id null), named by id, that are read: read_at goes back to null, seen_at stays (the row was seen
--     and stays out of "New"). It never reads "no ids" as "all": none named is refused (22023,
--     notifications.ids_required), after the core has said who may ask. When a row changed, the same contentless
--     signal as the read service tells the person's other tabs and phones. It answers how many rows changed and
--     the unread count as the list counts it (a card a newer reminder replaced is not counted).
--
-- New: one service, the API's only (service role). Nothing else changes.

create function public.mark_notifications_unread_service(actor_user_id uuid, target_workspace_id uuid, target_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- person_notifications has an actor_user_id column of its own.
  viewer uuid := actor_user_id;
  updated integer;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'notifications.read_own');
  if coalesce(cardinality(target_ids), 0) = 0 then
    raise exception 'notifications to mark unread required' using errcode = '22023', hint = 'notifications.ids_required';
  end if;
  update public.person_notifications n set read_at = null
  where n.user_id = viewer and (n.workspace_id = target_workspace_id or n.workspace_id is null)
    and n.read_at is not null and n.id = any(target_ids);
  get diagnostics updated = row_count;
  -- S-247: the person's other tabs and phones refresh; the signal says nothing about the notices.
  if updated > 0 then
    perform realtime.send(jsonb_build_object('workspace_id', target_workspace_id), 'changed', 'notifications:' || viewer::text, true);
  end if;
  return jsonb_build_object('updated', updated, 'unread_count', (
    select count(*) from public.person_notifications n
    where n.user_id = viewer and (n.workspace_id = target_workspace_id or n.workspace_id is null) and n.read_at is null
      -- As the list counts: a card a newer reminder replaced is not counted.
      and (n.resolution is null or n.resolution not in ('superseded', 'reminded_again'))));
end;
$$;

revoke all on function public.mark_notifications_unread_service(uuid, uuid, uuid[]) from public;
grant execute on function public.mark_notifications_unread_service(uuid, uuid, uuid[]) to service_role;
