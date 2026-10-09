create table public.scheduled_schedule_exports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  preset_id uuid not null references public.schedule_export_presets(id) on delete restrict,
  name text not null,
  recipients jsonb not null default '[]'::jsonb,
  location_ids uuid[] not null default '{}'::uuid[],
  day_of_week smallint not null,
  send_hour smallint not null,
  timezone text not null default 'UTC',
  enabled boolean not null default true,
  last_sent_at timestamptz,
  consecutive_failures integer not null default 0,
  last_error text,
  auto_disabled_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_schedule_exports_name_check check (length(btrim(name)) between 1 and 80),
  constraint scheduled_schedule_exports_recipients_check check (
    jsonb_typeof(recipients) = 'array' and jsonb_array_length(recipients) between 1 and 10
  ),
  constraint scheduled_schedule_exports_locations_check check (cardinality(location_ids) between 1 and 100),
  constraint scheduled_schedule_exports_day_check check (day_of_week between 0 and 6),
  constraint scheduled_schedule_exports_hour_check check (send_hour between 0 and 23),
  constraint scheduled_schedule_exports_timezone_check check (length(btrim(timezone)) between 1 and 80),
  constraint scheduled_schedule_exports_failures_check check (consecutive_failures >= 0)
);

create unique index scheduled_schedule_exports_name_idx
  on public.scheduled_schedule_exports(workspace_id, created_by, lower(btrim(name)));

create index scheduled_schedule_exports_workspace_idx
  on public.scheduled_schedule_exports(workspace_id, enabled, day_of_week, send_hour);

alter table public.scheduled_schedule_exports enable row level security;

revoke all on public.scheduled_schedule_exports from public, anon, authenticated;
grant select, insert, update, delete on public.scheduled_schedule_exports to service_role;

create function public.schedule_export_schedule_json(
  target_schedule public.scheduled_schedule_exports,
  target_preset_name text
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'id', target_schedule.id,
    'workspace_id', target_schedule.workspace_id,
    'preset_id', target_schedule.preset_id,
    'preset_name', target_preset_name,
    'name', target_schedule.name,
    'recipients', target_schedule.recipients,
    'location_ids', to_jsonb(target_schedule.location_ids),
    'day_of_week', target_schedule.day_of_week,
    'send_hour', target_schedule.send_hour,
    'timezone', target_schedule.timezone,
    'enabled', target_schedule.enabled,
    'last_sent_at', target_schedule.last_sent_at,
    'consecutive_failures', target_schedule.consecutive_failures,
    'last_error', target_schedule.last_error,
    'auto_disabled_at', target_schedule.auto_disabled_at,
    'created_at', target_schedule.created_at,
    'updated_at', target_schedule.updated_at
  );
$$;

create function public.list_schedule_export_schedules_service(
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
    'schedules',
    coalesce(
      jsonb_agg(
        public.schedule_export_schedule_json(s, p.name)
        order by lower(s.name), s.id
      ),
      '[]'::jsonb
    )
  )
  from public.scheduled_schedule_exports s
  left join public.schedule_export_presets p
    on p.id = s.preset_id
   and p.workspace_id = s.workspace_id
  where s.workspace_id = target_workspace_id
    and public.schedule_actor_has_capability_service(
      actor_user_id,
      target_workspace_id,
      'schedule.export'
    );
$$;

create function public.create_schedule_export_schedule_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  created public.scheduled_schedule_exports%rowtype;
  preset_name text;
begin
  if not public.schedule_actor_has_capability_service(
    actor_user_id,
    target_workspace_id,
    'schedule.export'
  ) then
    raise exception 'schedule export access denied' using errcode='42501';
  end if;

  if not exists (
    select 1
      from public.schedule_export_presets p
     where p.id = (target_payload->>'preset_id')::uuid
       and p.workspace_id = target_workspace_id
       and p.created_by = actor_user_id
  ) then
    raise exception 'schedule export preset not found' using errcode='P0002';
  end if;

  insert into public.scheduled_schedule_exports(
    workspace_id,
    preset_id,
    name,
    recipients,
    location_ids,
    day_of_week,
    send_hour,
    timezone,
    created_by,
    updated_by
  )
  values (
    target_workspace_id,
    (target_payload->>'preset_id')::uuid,
    btrim(target_payload->>'name'),
    target_payload->'recipients',
    array(
      select jsonb_array_elements_text(target_payload->'location_ids')::uuid
    ),
    (target_payload->>'day_of_week')::smallint,
    (target_payload->>'send_hour')::smallint,
    btrim(target_payload->>'timezone'),
    actor_user_id,
    actor_user_id
  )
  returning * into created;

  select p.name into preset_name
    from public.schedule_export_presets p
   where p.id = created.preset_id;

  return public.schedule_export_schedule_json(created, preset_name);
exception
  when unique_violation then
    raise exception 'scheduled export name conflict' using errcode='23505';
end;
$$;

create function public.update_schedule_export_schedule_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_schedule_id uuid,
  target_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  existing public.scheduled_schedule_exports%rowtype;
  updated public.scheduled_schedule_exports%rowtype;
  next_preset_id uuid;
  preset_name text;
  reset_failure_state boolean := false;
begin
  if not public.schedule_actor_has_capability_service(
    actor_user_id,
    target_workspace_id,
    'schedule.export'
  ) then
    raise exception 'schedule export access denied' using errcode='42501';
  end if;

  select * into existing
    from public.scheduled_schedule_exports s
   where s.id = target_schedule_id
     and s.workspace_id = target_workspace_id
     and s.created_by = actor_user_id
   for update;

  if not found then
    raise exception 'scheduled export not found' using errcode='P0002';
  end if;

  next_preset_id := coalesce((target_payload->>'preset_id')::uuid, existing.preset_id);
  if not exists (
    select 1
      from public.schedule_export_presets p
     where p.id = next_preset_id
       and p.workspace_id = target_workspace_id
       and p.created_by = actor_user_id
  ) then
    raise exception 'schedule export preset not found' using errcode='P0002';
  end if;

  reset_failure_state :=
    target_payload ? 'enabled' and (target_payload->>'enabled')::boolean = true;

  update public.scheduled_schedule_exports
     set preset_id = next_preset_id,
         name = coalesce(btrim(target_payload->>'name'), existing.name),
         recipients = coalesce(target_payload->'recipients', existing.recipients),
         location_ids = case
           when target_payload ? 'location_ids' then
             array(
               select jsonb_array_elements_text(target_payload->'location_ids')::uuid
             )
           else existing.location_ids
         end,
         day_of_week = coalesce((target_payload->>'day_of_week')::smallint, existing.day_of_week),
         send_hour = coalesce((target_payload->>'send_hour')::smallint, existing.send_hour),
         timezone = coalesce(btrim(target_payload->>'timezone'), existing.timezone),
         enabled = coalesce((target_payload->>'enabled')::boolean, existing.enabled),
         updated_by = actor_user_id,
         updated_at = now(),
         consecutive_failures = case when reset_failure_state then 0 else consecutive_failures end,
         last_error = case when reset_failure_state then null else last_error end,
         auto_disabled_at = case when reset_failure_state then null else auto_disabled_at end
   where id = target_schedule_id
     and workspace_id = target_workspace_id
   returning * into updated;

  select p.name into preset_name
    from public.schedule_export_presets p
   where p.id = updated.preset_id;

  return public.schedule_export_schedule_json(updated, preset_name);
exception
  when unique_violation then
    raise exception 'scheduled export name conflict' using errcode='23505';
end;
$$;

create function public.delete_schedule_export_schedule_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_schedule_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.schedule_actor_has_capability_service(
    actor_user_id,
    target_workspace_id,
    'schedule.export'
  ) then
    raise exception 'schedule export access denied' using errcode='42501';
  end if;

  delete from public.scheduled_schedule_exports
   where id = target_schedule_id
     and workspace_id = target_workspace_id
     and created_by = actor_user_id;

  if not found then
    raise exception 'scheduled export not found' using errcode='P0002';
  end if;

  return jsonb_build_object('status', 'deleted', 'schedule_id', target_schedule_id);
end;
$$;

revoke all on function public.schedule_export_schedule_json(
  public.scheduled_schedule_exports,
  text
) from public, anon, authenticated;
revoke all on function public.list_schedule_export_schedules_service(
  uuid,
  uuid
) from public, anon, authenticated;
revoke all on function public.create_schedule_export_schedule_service(
  uuid,
  uuid,
  jsonb
) from public, anon, authenticated;
revoke all on function public.update_schedule_export_schedule_service(
  uuid,
  uuid,
  uuid,
  jsonb
) from public, anon, authenticated;
revoke all on function public.delete_schedule_export_schedule_service(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;

grant execute on function public.list_schedule_export_schedules_service(
  uuid,
  uuid
) to service_role;
grant execute on function public.create_schedule_export_schedule_service(
  uuid,
  uuid,
  jsonb
) to service_role;
grant execute on function public.update_schedule_export_schedule_service(
  uuid,
  uuid,
  uuid,
  jsonb
) to service_role;
grant execute on function public.delete_schedule_export_schedule_service(
  uuid,
  uuid,
  uuid
) to service_role;
