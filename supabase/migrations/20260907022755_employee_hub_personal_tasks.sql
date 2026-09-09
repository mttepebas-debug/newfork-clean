-- Private employee reminders are independent of management/compliance todos.
-- The API enriches only the location ids returned by the authorized Hub RPC.
grant select (id, workspace_id, timezone) on public.locations to service_role;
create table if not exists public.employee_personal_tasks (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 160),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists employee_personal_tasks_owner_idx
  on public.employee_personal_tasks(workspace_id, user_id, created_at);
alter table public.employee_personal_tasks enable row level security;
revoke all on public.employee_personal_tasks from public, anon, authenticated;
grant select, insert, update, delete on public.employee_personal_tasks to service_role;

-- Service-only invoker: actor comes from the authenticated API context, never the body.
create or replace function public.employee_personal_tasks_service(
  actor_user_id uuid, target_workspace_id uuid,
  task_action text default 'list', target_task_id uuid default null, task_title text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare owner_profile public.employee_profiles%rowtype;
begin
  owner_profile := public.employee_hub_actor_service(actor_user_id, target_workspace_id);
  -- Serialize per-person writes, including the task limit and retry-safe creation.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_workspace_id::text || actor_user_id::text, 0));
  if task_action = 'create' then
    if target_task_id is null or task_title is null or length(btrim(task_title)) not between 1 and 160 then
      raise exception 'Valid personal task required';
    end if;
    if exists(select 1 from public.employee_personal_tasks where id = target_task_id
      and (workspace_id <> target_workspace_id or user_id <> actor_user_id)) then
      raise exception 'Task not found';
    end if;
    if not exists(select 1 from public.employee_personal_tasks where id = target_task_id) then
      if (select count(*) from public.employee_personal_tasks where workspace_id = target_workspace_id and user_id = actor_user_id) >= 100 then
        raise exception 'Your list is full. Remove a completed reminder to add another.';
      end if;
      insert into public.employee_personal_tasks(id, workspace_id, user_id, title)
      values(target_task_id, target_workspace_id, actor_user_id, btrim(task_title));
    end if;
  elsif task_action in ('complete', 'reopen') then
    update public.employee_personal_tasks set completed = (task_action = 'complete')
      where id = target_task_id and workspace_id = target_workspace_id and user_id = actor_user_id;
    if not found then raise exception 'Task not found'; end if;
  elsif task_action = 'delete' then
    delete from public.employee_personal_tasks
      where id = target_task_id and workspace_id = target_workspace_id and user_id = actor_user_id;
  elsif task_action <> 'list' then
    raise exception 'Invalid personal task action';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', id, 'title', title, 'completed', completed, 'created_at', created_at
  ) order by completed, created_at desc, id) from public.employee_personal_tasks
    where workspace_id = target_workspace_id and user_id = actor_user_id), '[]'::jsonb);
end; $$;
revoke all on function public.employee_personal_tasks_service(uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.employee_personal_tasks_service(uuid, uuid, text, uuid, text) to service_role;
