create or replace function public.get_notification_inbox_v2_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_cursor_created_at timestamptz default null,
  target_cursor_id uuid default null,
  target_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  effective_limit integer := greatest(1, least(coalesce(target_limit, 30), 50));
begin
  if not public.notification_actor_is_active_member_service(actor_user_id, target_workspace_id) then
    raise exception 'notification inbox access required' using errcode = '42501';
  end if;
  if (target_cursor_created_at is null) <> (target_cursor_id is null) then
    raise exception 'complete notification cursor required' using errcode = '22023';
  end if;

  with candidate as (
    select
      item.id,
      item.workspace_id,
      recipient.event_id,
      event.type_key,
      event.schema_version,
      item.title,
      item.body,
      item.safe_preview,
      item.action_url,
      item.group_key,
      item.created_at,
      item.seen_at,
      item.read_at,
      item.dismissed_at,
      item.visibility_state
    from public.notification_inbox_items item
    join public.notification_recipients recipient
      on recipient.id = item.recipient_projection_id
     and recipient.workspace_id = item.workspace_id
    join public.notification_events event
      on event.id = recipient.event_id
     and event.workspace_id = recipient.workspace_id
    where item.workspace_id = target_workspace_id
      and recipient.recipient_user_id = get_notification_inbox_v2_service.actor_user_id
      and item.dismissed_at is null
      and item.visibility_state = 'visible'
      and (
        target_cursor_created_at is null
        or (item.created_at, item.id) < (target_cursor_created_at, target_cursor_id)
      )
    order by item.created_at desc, item.id desc
    limit effective_limit + 1
  ), page as (
    select * from candidate
    order by created_at desc, id desc
    limit effective_limit
  )
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'unread_count', (
      select count(*)
      from public.notification_inbox_items unread_item
      join public.notification_recipients unread_recipient
        on unread_recipient.id = unread_item.recipient_projection_id
       and unread_recipient.workspace_id = unread_item.workspace_id
      where unread_item.workspace_id = target_workspace_id
        and unread_recipient.recipient_user_id = get_notification_inbox_v2_service.actor_user_id
        and unread_item.read_at is null
        and unread_item.dismissed_at is null
        and unread_item.visibility_state = 'visible'
    ),
    'next_cursor', case
      when (select count(*) from candidate) > effective_limit then (
        select jsonb_build_object('created_at', created_at, 'id', id)
        from page
        order by created_at asc, id asc
        limit 1
      )
      else null
    end,
    'items', coalesce((
      select jsonb_agg(to_jsonb(page_row) order by page_row.created_at desc, page_row.id desc)
      from page page_row
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_notification_inbox_v2_service(uuid, uuid, timestamptz, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_notification_inbox_v2_service(uuid, uuid, timestamptz, uuid, integer)
  to service_role;
