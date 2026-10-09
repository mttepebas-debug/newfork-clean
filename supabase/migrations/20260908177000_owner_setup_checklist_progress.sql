create table if not exists public.owner_setup_checklist_progress (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  completed_item_ids text[] not null default '{}',
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  check (
    completed_item_ids <@ array[
      'app_tour',
      'scheduling_preferences',
      'employees',
      'kiosk',
      'documents',
      'schedule'
    ]::text[]
  )
);

alter table public.owner_setup_checklist_progress enable row level security;

drop policy if exists "owner_setup_checklist_progress_no_direct_access"
on public.owner_setup_checklist_progress;

create policy "owner_setup_checklist_progress_no_direct_access"
on public.owner_setup_checklist_progress
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create or replace function app_private.owner_setup_checklist_item_ids()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'app_tour',
    'scheduling_preferences',
    'employees',
    'kiosk',
    'documents',
    'schedule'
  ]::text[];
$$;

create or replace function public.get_owner_setup_checklist_progress_service(
  actor_user_id uuid,
  target_workspace_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  progress public.owner_setup_checklist_progress%rowtype;
begin
  if actor_user_id is null then
    raise exception 'workspace management required' using errcode = '42501';
  end if;
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'workspace.manage') then
    raise exception 'workspace management required' using errcode = '42501';
  end if;

  select * into progress
  from public.owner_setup_checklist_progress
  where workspace_id = target_workspace_id
    and user_id = actor_user_id;

  return jsonb_build_object(
    'workspace_id', target_workspace_id,
    'user_id', actor_user_id,
    'completed_item_ids', coalesce(progress.completed_item_ids, '{}'::text[]),
    'closed_at', progress.closed_at
  );
end;
$$;

create or replace function public.mark_owner_setup_checklist_item_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_item_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_item_id text := lower(btrim(coalesce(target_item_id, '')));
begin
  if actor_user_id is null then
    raise exception 'workspace management required' using errcode = '42501';
  end if;
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'workspace.manage') then
    raise exception 'workspace management required' using errcode = '42501';
  end if;
  if normalized_item_id <> all(app_private.owner_setup_checklist_item_ids()) then
    raise exception 'valid setup checklist item required' using errcode = '22023';
  end if;

  insert into public.owner_setup_checklist_progress (
    workspace_id,
    user_id,
    completed_item_ids
  )
  values (
    target_workspace_id,
    actor_user_id,
    array[normalized_item_id]
  )
  on conflict (workspace_id, user_id)
  do update set
    completed_item_ids = (
      select array_agg(distinct item order by item)
      from unnest(
        public.owner_setup_checklist_progress.completed_item_ids ||
        excluded.completed_item_ids
      ) item
    ),
    updated_at = now();

  return public.get_owner_setup_checklist_progress_service(
    actor_user_id,
    target_workspace_id
  );
end;
$$;

create or replace function public.set_owner_setup_checklist_closed_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  should_close boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null then
    raise exception 'workspace management required' using errcode = '42501';
  end if;
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'workspace.manage') then
    raise exception 'workspace management required' using errcode = '42501';
  end if;

  insert into public.owner_setup_checklist_progress (
    workspace_id,
    user_id,
    completed_item_ids,
    closed_at
  )
  values (
    target_workspace_id,
    actor_user_id,
    '{}'::text[],
    case when should_close then now() else null end
  )
  on conflict (workspace_id, user_id)
  do update set
    closed_at = case when should_close then now() else null end,
    updated_at = now();

  return public.get_owner_setup_checklist_progress_service(
    actor_user_id,
    target_workspace_id
  );
end;
$$;

revoke all on table public.owner_setup_checklist_progress
from public, anon, authenticated;

revoke all on function app_private.owner_setup_checklist_item_ids()
from public, anon, authenticated;

revoke all on function public.get_owner_setup_checklist_progress_service(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.mark_owner_setup_checklist_item_service(uuid, uuid, text)
from public, anon, authenticated;
revoke all on function public.set_owner_setup_checklist_closed_service(uuid, uuid, boolean)
from public, anon, authenticated;

grant execute on function public.get_owner_setup_checklist_progress_service(uuid, uuid)
to service_role;
grant execute on function public.mark_owner_setup_checklist_item_service(uuid, uuid, text)
to service_role;
grant execute on function public.set_owner_setup_checklist_closed_service(uuid, uuid, boolean)
to service_role;
