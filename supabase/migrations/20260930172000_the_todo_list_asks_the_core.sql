-- FB-6.2 (KK-32, KK-34; nf-guvenlik T5b-3 D1, D2): the to-do list and
-- Workspace home have one gate, the core's workspace.todos, instead of their
-- own twin (app_private.authorize_workspace_todos over
-- app_private.workspace_todo_actor_role). The owner, an admin and a manager keep
-- the list as before; an employee does not; a closed workspace, a member still
-- onboarding and a missing required document now refuse the home too.
--
-- workspace.todos is a write action labelled read (KK-34): the M2 scope model
-- gives a manager org reach for org/read and none for org/write, and the
-- to-do list is the whole workspace's. The label gives no gate away: the core
-- still refuses a closed workspace, a restricted member and an employee
-- before it reads the effect (people_behind_the_catalog_ask_the_core).
update app_private.authz_actions
set effect = 'read', permission_key = 'workspace.read'
where key = 'workspace.todos';

create or replace function public.create_workspace_todo_service(actor_user_id uuid, target_workspace_id uuid, todo_title text,
  todo_body text default ''::text, target_employee_id uuid default null::uuid, target_due_at timestamp with time zone default null::timestamp with time zone)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted public.workspace_todos%rowtype;
  source_uuid uuid := gen_random_uuid();
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.todos');
  if target_employee_id is not null then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.read', target_person => target_employee_id);
  end if;
  if nullif(btrim(coalesce(todo_title, '')), '') is null then
    raise exception 'todo title required' using errcode = '22023';
  end if;

  insert into public.workspace_todos (
    workspace_id, title, body, severity, status, system_generated,
    source_type, source_id, source_key, employee_id, due_at, action_url
  )
  values (
    target_workspace_id,
    left(btrim(todo_title), 160),
    left(btrim(coalesce(todo_body, '')), 1000),
    'info', 'open', false, 'manual', source_uuid,
    'manual:' || source_uuid::text,
    target_employee_id, target_due_at, null
  )
  returning * into inserted;

  return app_private.workspace_todo_json(inserted);
end;
$$;

create or replace function public.resolve_workspace_todo_service(actor_user_id uuid, target_workspace_id uuid, target_todo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.workspace_todos%rowtype;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.todos');
  -- Asked before the lock: a to-do about somebody out of reach is not theirs to touch.
  select * into target
  from public.workspace_todos
  where id = target_todo_id
    and workspace_id = target_workspace_id;
  if not found then
    raise exception 'workspace todo not found' using errcode = 'P0002';
  end if;
  if target.employee_id is not null then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.read', target_person => target.employee_id);
  end if;
  if target.system_generated then
    raise exception 'system todo resolves from source' using errcode = '42501', hint = 'authz.missing_permission';
  end if;

  update public.workspace_todos
  set status = 'resolved',
      resolved_at = now(),
      updated_at = now()
  where id = target_todo_id
    and workspace_id = target_workspace_id
    and status = 'open'
  returning * into target;

  if not found then
    select * into target
    from public.workspace_todos
    where id = target_todo_id
      and workspace_id = target_workspace_id;
  end if;

  return app_private.workspace_todo_json(target);
end;
$$;

create or replace function public.get_workspace_dashboard_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  read_rule app_private.authz_actions;
  schedule_places uuid[];
  request_places uuid[];
  result jsonb;
begin
  -- Workspace home is the to-do list's page: one gate (KK-32, KK-34).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.todos');
  select * into read_rule from app_private.authz_actions r where r.key = 'employee.read';
  schedule_places := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.read');
  request_places := app_private.scope_set(actor_user_id, target_workspace_id, 'requests.read');

  perform public.sync_expiring_document_todos_service(target_workspace_id);

  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'display_name', coalesce(profile.display_name, 'Manager'),
    'metrics', jsonb_build_object(
      'today_shift_count', (select count(*) from public.schedule_published_shifts shift join public.schedule_location_publications publication on publication.id = shift.publication_id and publication.status = 'current' where shift.workspace_id = target_workspace_id and shift.scheduled_date = current_date and shift.location_id = any(schedule_places)),
      'today_open_shift_count', (select count(*) from public.schedule_published_shifts shift join public.schedule_location_publications publication on publication.id = shift.publication_id and publication.status = 'current' where shift.workspace_id = target_workspace_id and shift.scheduled_date = current_date and shift.employee_id is null and shift.location_id = any(schedule_places)),
      'pending_time_off_count', (select count(*) from public.schedule_time_off_requests request where request.workspace_id = target_workspace_id and request.status = 'pending' and request.location_id = any(request_places)),
      'unread_notification_count', (select count(*) from public.notifications notification where notification.workspace_id = target_workspace_id and notification.recipient_user_id = actor_user_id and notification.dismissed_at is null and notification.read_at is null and notification.created_at <= now())
    ),
    'announcements', coalesce((select jsonb_agg(item.value) from (select value from jsonb_array_elements((public.get_announcements_service(actor_user_id, target_workspace_id)->'announcements')) value where value->>'status' in ('published', 'scheduled') and (value->>'publish_at')::timestamptz <= now() limit 5) item), '[]'::jsonb),
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
$$;

drop function app_private.authorize_workspace_todos(uuid, uuid);
drop function app_private.workspace_todo_actor_role(uuid, uuid);
