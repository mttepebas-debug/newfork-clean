-- K28 (BL-564): the Announcements box on Workspace shows only what is live.
--
-- Zeynep archives "Inventory day", "New menu tasting" runs past its end, and
-- "Patio opens" could not go out at nine: Ayse's Workspace box still listed all
-- three, because the box kept every published or due scheduled announcement.
-- Now it keeps what the Announcements list calls published, or scheduled and
-- due, and not archived; the three stay in the list with their labels (K12,
-- KK-98). Only the box's filter changes.
--
-- The function is replaced whole, and only from the body it has today
-- (20261007235000); any other body stops the migration.
do $guard$
begin
  if md5(pg_get_functiondef('public.get_workspace_dashboard_service(uuid,uuid)'::regprocedure))
      <> '33e36ef2cd03686005c7eb981ccdebea' then
    raise exception 'K28: get_workspace_dashboard_service is not the body this replaces';
  end if;
end
$guard$;

CREATE OR REPLACE FUNCTION public.get_workspace_dashboard_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  read_rule app_private.authz_actions;
  schedule_places uuid[];
  result jsonb;
begin
  -- Workspace home is the to-do list's page: one gate (KK-32, KK-34).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.todos');
  select * into read_rule from app_private.authz_actions r where r.key = 'employee.read';
  schedule_places := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.read');

  perform public.sync_expiring_document_todos_service(target_workspace_id);

  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'display_name', coalesce(profile.display_name, 'Manager'),
    'metrics', jsonb_build_object(
      'today_shift_count', (
        select count(*)
        from public.schedule_published_shifts shift
        join public.schedule_location_publications publication
          on publication.id = shift.publication_id and publication.status = 'current'
        join public.locations location on location.id = shift.location_id
        where shift.workspace_id = target_workspace_id
          -- Every zone's date is within a day of UTC's: keeps the date index range.
          and shift.scheduled_date between (now() at time zone 'UTC')::date - 1 and (now() at time zone 'UTC')::date + 1
          and shift.location_id = any(schedule_places)
          and shift.scheduled_date = (now() at time zone location.timezone)::date
      ),
      'today_open_shift_count', (
        select count(*)
        from public.schedule_published_shifts shift
        join public.schedule_location_publications publication
          on publication.id = shift.publication_id and publication.status = 'current'
        join public.locations location on location.id = shift.location_id
        where shift.workspace_id = target_workspace_id
          -- Every zone's date is within a day of UTC's: keeps the date index range.
          and shift.scheduled_date between (now() at time zone 'UTC')::date - 1 and (now() at time zone 'UTC')::date + 1
          and shift.location_id = any(schedule_places)
          and shift.employee_id is null
          and shift.scheduled_date = (now() at time zone location.timezone)::date
      ),
      'pending_time_off_count', (select count(*) from public.schedule_time_off_requests request where request.workspace_id = target_workspace_id and request.status = 'pending'
        and app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', request.employee_id) is null),
      'unread_notification_count', (select count(*) from public.notifications notification where notification.workspace_id = target_workspace_id and notification.recipient_user_id = actor_user_id and notification.dismissed_at is null and notification.read_at is null and notification.created_at <= now())
    ),
    'today_ends_at', (
      select min(((now() at time zone location.timezone)::date + 1)::timestamp at time zone location.timezone)
      from public.locations location
      where location.workspace_id = target_workspace_id
        and location.id = any(schedule_places)
    ),
    'announcements', coalesce((select jsonb_agg(item.value) from (select value from jsonb_array_elements((public.get_announcements_service(actor_user_id, target_workspace_id)->'announcements')) value
      -- K28: what is live; archived, expired and couldn't-publish stay in the list only.
      where value->>'display_status' in ('published', 'scheduled') and value->>'archived_at' is null
        and (value->>'publish_at')::timestamptz <= now() limit 5) item), '[]'::jsonb),
    'notifications', coalesce(public.get_notifications_service(actor_user_id, target_workspace_id, null, false, null, 5)->'notifications', '[]'::jsonb),
    'todos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', todo.id,
        'workspace_id', todo.workspace_id,
        'title', todo.title,
        'body', todo.body,
        'severity', todo.severity,
        'status', todo.status,
        'system_generated', todo.system_generated,
        'source_type', todo.source_type,
        'source_id', todo.source_id,
        'source_key', todo.source_key,
        'employee_id', todo.employee_id,
        'due_at', todo.due_at,
        'action_url', todo.action_url,
        'created_at', todo.created_at
      ) order by todo.due_at nulls last, todo.created_at, todo.id)
      from (
        select todo.*
        from public.workspace_todos todo
        where todo.workspace_id = target_workspace_id
          and todo.status = 'open'::public.workspace_todo_status
          and (
            todo.employee_id is null
            or app_private.authz_check(me, read_rule, null, todo.employee_id, null) is null
          )
        order by todo.due_at nulls last, todo.created_at, todo.id
        limit 5
      ) todo
    ), '[]'::jsonb),
    'layout', jsonb_build_object(
      'widget_order', public.normalize_workspace_widget_order(preference.widget_order),
      'hidden_widget_ids', array(
        select distinct value
        from unnest(coalesce(preference.hidden_widget_ids, '{}'::text[])) value
        where value = any(array[
          'operations',
          'pending_requests',
          'open_shifts',
          'announcements',
          'todos',
          'notifications',
          'quick_actions'
        ])
      )
    )
  ) into result
  from public.user_profiles profile
  left join public.workspace_layout_preferences preference
    on preference.workspace_id = target_workspace_id
   and preference.user_id = actor_user_id
  where profile.user_id = actor_user_id;

  return result;
end;
$function$;
