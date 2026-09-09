create or replace function app_private.workspace_todo_actor_role(
  actor_user_id uuid,
  target_workspace_id uuid
)
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select role.access_class
  from public.workspace_memberships membership
  join public.workspace_roles role
    on role.id = membership.role_id
   and role.workspace_id = membership.workspace_id
  where membership.workspace_id = target_workspace_id
    and membership.user_id = actor_user_id
    and membership.status = 'active'
    and role.access_class in ('owner', 'admin', 'manager')
  limit 1
$$;

create or replace function app_private.workspace_todo_json(todo public.workspace_todos)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
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
  )
$$;

create or replace function public.create_workspace_todo_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  todo_title text,
  todo_body text default '',
  target_employee_id uuid default null,
  target_due_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.workspace_role;
  inserted public.workspace_todos%rowtype;
  source_uuid uuid := gen_random_uuid();
begin
  actor_role := app_private.workspace_todo_actor_role(actor_user_id, target_workspace_id);
  if actor_role is null then
    raise exception 'workspace todo management required' using errcode = '42501';
  end if;
  if not app_private.workspace_allows_interactive_access(target_workspace_id) then
    raise exception 'workspace todo management required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(todo_title, '')), '') is null then
    raise exception 'todo title required' using errcode = '22023';
  end if;
  if target_employee_id is not null and not public.service_actor_can_access_employee(actor_user_id, target_workspace_id, target_employee_id) then
    raise exception 'employee access required' using errcode = '42501';
  end if;

  insert into public.workspace_todos (
    workspace_id,
    title,
    body,
    severity,
    status,
    system_generated,
    source_type,
    source_id,
    source_key,
    employee_id,
    due_at,
    action_url
  )
  values (
    target_workspace_id,
    left(btrim(todo_title), 160),
    left(btrim(coalesce(todo_body, '')), 1000),
    'info',
    'open',
    false,
    'manual',
    source_uuid,
    'manual:' || source_uuid::text,
    target_employee_id,
    target_due_at,
    null
  )
  returning * into inserted;

  return app_private.workspace_todo_json(inserted);
end;
$$;

create or replace function public.resolve_workspace_todo_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_todo_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.workspace_role;
  target public.workspace_todos%rowtype;
begin
  actor_role := app_private.workspace_todo_actor_role(actor_user_id, target_workspace_id);
  if actor_role is null then
    raise exception 'workspace todo management required' using errcode = '42501';
  end if;
  if not app_private.workspace_allows_interactive_access(target_workspace_id) then
    raise exception 'workspace todo management required' using errcode = '42501';
  end if;

  select * into target
  from public.workspace_todos
  where id = target_todo_id
    and workspace_id = target_workspace_id
  for update;

  if not found then
    raise exception 'workspace todo not found' using errcode = 'P0002';
  end if;
  if target.employee_id is not null and not public.service_actor_can_access_employee(actor_user_id, target_workspace_id, target.employee_id) then
    raise exception 'employee access required' using errcode = '42501';
  end if;
  if target.system_generated then
    raise exception 'system todo resolves from source' using errcode = '42501';
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

revoke all on function app_private.workspace_todo_actor_role(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.workspace_todo_json(public.workspace_todos) from public, anon, authenticated;
revoke all on function public.create_workspace_todo_service(uuid, uuid, text, text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.resolve_workspace_todo_service(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function app_private.workspace_todo_actor_role(uuid, uuid) to service_role;
grant execute on function app_private.workspace_todo_json(public.workspace_todos) to service_role;
grant execute on function public.create_workspace_todo_service(uuid, uuid, text, text, uuid, timestamptz) to service_role;
grant execute on function public.resolve_workspace_todo_service(uuid, uuid, uuid) to service_role;
