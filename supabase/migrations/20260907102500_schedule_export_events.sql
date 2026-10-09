create table public.schedule_export_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  surface text not null,
  format text not null,
  params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint schedule_export_events_surface_check check (length(btrim(surface)) between 1 and 80),
  constraint schedule_export_events_format_check check (length(btrim(format)) between 1 and 20),
  constraint schedule_export_events_params_check check (jsonb_typeof(params) = 'object')
);

create index schedule_export_events_workspace_created_idx
  on public.schedule_export_events(workspace_id, created_at desc);

alter table public.schedule_export_events enable row level security;

revoke all on public.schedule_export_events from public, anon, authenticated;
grant select, insert on public.schedule_export_events to service_role;

create function public.schedule_export_event_json(
  target_event public.schedule_export_events
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'id', target_event.id,
    'workspace_id', target_event.workspace_id,
    'surface', target_event.surface,
    'format', target_event.format,
    'params', target_event.params,
    'actor_user_id', target_event.actor_user_id,
    'created_at', target_event.created_at
  );
$$;

create function public.list_schedule_export_events_service(
  actor_user_id uuid,
  target_workspace_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'events',
    coalesce(
      jsonb_agg(public.schedule_export_event_json(event_row) order by event_row.created_at desc, event_row.id desc),
      '[]'::jsonb
    )
  )
  from (
    select event.*
      from public.schedule_export_events event
     where event.workspace_id = target_workspace_id
       and public.schedule_actor_has_capability_service(
         actor_user_id,
         target_workspace_id,
         'schedule.export'
       )
     order by event.created_at desc, event.id desc
     limit 10
  ) event_row;
$$;

create function public.record_schedule_export_event_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_surface text,
  target_format text,
  target_params jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  created public.schedule_export_events%rowtype;
begin
  if not public.schedule_actor_has_capability_service(
    actor_user_id,
    target_workspace_id,
    'schedule.export'
  ) then
    raise exception 'schedule export access denied' using errcode='42501';
  end if;

  insert into public.schedule_export_events(
    workspace_id,
    actor_user_id,
    surface,
    format,
    params
  )
  values (
    target_workspace_id,
    actor_user_id,
    btrim(target_surface),
    btrim(target_format),
    coalesce(target_params, '{}'::jsonb)
  )
  returning * into created;

  return public.schedule_export_event_json(created);
end;
$$;

revoke all on function public.schedule_export_event_json(
  public.schedule_export_events
) from public, anon, authenticated;
revoke all on function public.list_schedule_export_events_service(
  uuid,
  uuid
) from public, anon, authenticated;
revoke all on function public.record_schedule_export_event_service(
  uuid,
  uuid,
  text,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.list_schedule_export_events_service(
  uuid,
  uuid
) to service_role;
grant execute on function public.record_schedule_export_event_service(
  uuid,
  uuid,
  text,
  text,
  jsonb
) to service_role;
