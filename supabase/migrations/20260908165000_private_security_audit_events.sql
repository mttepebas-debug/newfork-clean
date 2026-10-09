create table if not exists app_private.security_audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  event_type text not null check (char_length(btrim(event_type)) between 1 and 120),
  surface text not null check (char_length(btrim(surface)) between 1 and 120),
  resource_type text check (resource_type is null or char_length(btrim(resource_type)) between 1 and 120),
  resource_id_hash text check (resource_id_hash is null or resource_id_hash ~ '^[a-f0-9]{64}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create index if not exists security_audit_events_time_idx
  on app_private.security_audit_events (occurred_at desc, id desc);
create index if not exists security_audit_events_workspace_time_idx
  on app_private.security_audit_events (workspace_id, occurred_at desc, id desc)
  where workspace_id is not null;
create index if not exists security_audit_events_actor_time_idx
  on app_private.security_audit_events (actor_user_id, occurred_at desc, id desc)
  where actor_user_id is not null;

alter table app_private.security_audit_events enable row level security;

revoke all on app_private.security_audit_events from public, anon, authenticated;
grant select, insert on app_private.security_audit_events to service_role;

create or replace function app_private.record_security_audit_event_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  event_type text,
  surface text,
  resource_type text default null,
  raw_resource_id text default null,
  metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid;
begin
  if btrim(coalesce(event_type, '')) = '' then
    raise exception 'security audit event type required' using errcode = '23514';
  end if;
  if btrim(coalesce(surface, '')) = '' then
    raise exception 'security audit surface required' using errcode = '23514';
  end if;
  if metadata is null or jsonb_typeof(metadata) <> 'object' then
    raise exception 'security audit metadata object required' using errcode = '23514';
  end if;

  insert into app_private.security_audit_events (
    actor_user_id,
    workspace_id,
    event_type,
    surface,
    resource_type,
    resource_id_hash,
    metadata
  ) values (
    actor_user_id,
    target_workspace_id,
    btrim(event_type),
    btrim(surface),
    nullif(btrim(coalesce(resource_type, '')), ''),
    case
      when raw_resource_id is null or btrim(raw_resource_id) = '' then null
      else encode(extensions.digest(btrim(raw_resource_id), 'sha256'), 'hex')
    end,
    metadata
  )
  returning id into event_id;

  return event_id;
end;
$$;

revoke all on function app_private.record_security_audit_event_service(
  uuid, uuid, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function app_private.record_security_audit_event_service(
  uuid, uuid, text, text, text, text, jsonb
) to service_role;
