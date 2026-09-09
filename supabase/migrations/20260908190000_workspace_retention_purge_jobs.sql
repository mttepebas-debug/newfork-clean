create table if not exists public.workspace_retention_purge_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  closure_request_id uuid,
  status text not null default 'pending'
    check (status in ('pending', 'completed')),
  due_at timestamptz not null,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id),
  check (
    (status = 'pending' and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  )
);

alter table public.workspace_retention_purge_jobs
  drop constraint if exists workspace_retention_purge_jobs_closure_request_id_fkey;

alter table public.workspace_retention_purge_jobs
  add constraint workspace_retention_purge_jobs_closure_request_id_workspace_id_fkey
  foreign key (closure_request_id, workspace_id)
  references public.workspace_closure_requests(id, workspace_id)
  on delete set null (closure_request_id);

create table if not exists public.workspace_retention_tombstones (
  workspace_id uuid primary key,
  workspace_name text not null,
  closed_at timestamptz not null,
  closed_by uuid,
  purge_job_id uuid not null,
  purged_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.workspace_retention_purge_jobs enable row level security;
alter table public.workspace_retention_tombstones enable row level security;

revoke all on public.workspace_retention_purge_jobs from anon, authenticated;
revoke all on public.workspace_retention_tombstones from anon, authenticated;
grant select, insert, update, delete on public.workspace_retention_purge_jobs to service_role;
grant select, insert, update, delete on public.workspace_retention_tombstones to service_role;

create or replace function app_private.enqueue_workspace_retention_purge_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed_closure_request_id uuid;
begin
  if new.lifecycle_status <> 'deleted' then
    return new;
  end if;

  select request.id into completed_closure_request_id
  from public.workspace_closure_requests request
  where request.workspace_id = new.id
    and request.status = 'completed'
  order by request.completed_at desc, request.created_at desc
  limit 1;

  insert into public.workspace_retention_purge_jobs (
    workspace_id,
    closure_request_id,
    due_at,
    metadata
  )
  values (
    new.id,
    completed_closure_request_id,
    coalesce(new.closed_at, now()),
    jsonb_build_object('source', 'workspace_deleted')
  )
  on conflict (workspace_id) do update
    set closure_request_id = coalesce(public.workspace_retention_purge_jobs.closure_request_id, excluded.closure_request_id),
        due_at = least(public.workspace_retention_purge_jobs.due_at, excluded.due_at),
        updated_at = now()
    where public.workspace_retention_purge_jobs.status = 'pending';

  return new;
end;
$$;

drop trigger if exists enqueue_workspace_retention_purge_job_trigger
on public.workspaces;

create trigger enqueue_workspace_retention_purge_job_trigger
after insert or update of lifecycle_status, closed_at on public.workspaces
for each row
when (new.lifecycle_status = 'deleted')
execute function app_private.enqueue_workspace_retention_purge_job();

insert into public.workspace_retention_purge_jobs (
  workspace_id,
  closure_request_id,
  due_at,
  metadata
)
select workspace.id,
  (
    select request.id
    from public.workspace_closure_requests request
    where request.workspace_id = workspace.id
      and request.status = 'completed'
    order by request.completed_at desc, request.created_at desc
    limit 1
  ),
  coalesce(workspace.closed_at, now()),
  jsonb_build_object('source', 'migration_backfill')
from public.workspaces workspace
where workspace.lifecycle_status = 'deleted'
on conflict (workspace_id) do nothing;

create or replace function public.mark_workspace_retention_purge_completed_service(
  target_workspace_id uuid,
  purge_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_row public.workspaces%rowtype;
  purge_job public.workspace_retention_purge_jobs%rowtype;
  tombstone public.workspace_retention_tombstones%rowtype;
begin
  if target_workspace_id is null then
    raise exception 'valid workspace required' using errcode = '22023';
  end if;
  if purge_metadata is null or jsonb_typeof(purge_metadata) <> 'object' then
    raise exception 'purge metadata must be an object' using errcode = '22023';
  end if;

  select * into tombstone
  from public.workspace_retention_tombstones existing
  where existing.workspace_id = target_workspace_id;
  if tombstone.workspace_id is not null then
    return jsonb_build_object(
      'status', 'completed',
      'workspace_id', tombstone.workspace_id,
      'purged_at', tombstone.purged_at,
      'idempotent', true
    );
  end if;

  select * into workspace_row
  from public.workspaces workspace
  where workspace.id = target_workspace_id
  for update;
  if workspace_row.id is null then
    raise exception 'workspace not found' using errcode = '02000';
  end if;
  if workspace_row.lifecycle_status <> 'deleted' then
    raise exception 'workspace must be deleted before retention purge' using errcode = '23514';
  end if;

  insert into public.workspace_retention_purge_jobs (
    workspace_id,
    due_at,
    metadata
  )
  values (
    target_workspace_id,
    coalesce(workspace_row.closed_at, now()),
    jsonb_build_object('source', 'manual_service_enqueue')
  )
  on conflict (workspace_id) do nothing;

  select * into purge_job
  from public.workspace_retention_purge_jobs job
  where job.workspace_id = target_workspace_id
  for update;

  if purge_job.status = 'completed' then
    return jsonb_build_object(
      'status', 'completed',
      'workspace_id', target_workspace_id,
      'purged_at', purge_job.completed_at,
      'idempotent', true
    );
  end if;
  if purge_job.due_at > now() then
    raise exception 'workspace retention purge is not due' using errcode = '23514';
  end if;

  insert into public.workspace_retention_tombstones (
    workspace_id,
    workspace_name,
    closed_at,
    closed_by,
    purge_job_id,
    metadata
  )
  values (
    target_workspace_id,
    workspace_row.name,
    coalesce(workspace_row.closed_at, now()),
    workspace_row.closed_by,
    purge_job.id,
    purge_metadata
  )
  returning * into tombstone;

  update public.workspace_retention_purge_jobs
  set status = 'completed',
      completed_at = tombstone.purged_at,
      metadata = public.workspace_retention_purge_jobs.metadata || purge_metadata,
      updated_at = now()
  where id = purge_job.id;

  insert into public.audit_events (
    workspace_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    target_workspace_id,
    workspace_row.closed_by,
    'workspace.retention_purge.completed',
    'workspace',
    target_workspace_id::text,
    purge_metadata || jsonb_build_object('purge_job_id', purge_job.id)
  );

  return jsonb_build_object(
    'status', 'completed',
    'workspace_id', target_workspace_id,
    'purged_at', tombstone.purged_at,
    'idempotent', false
  );
end;
$$;

revoke all on function app_private.enqueue_workspace_retention_purge_job()
from public, anon, authenticated;

revoke all on function public.mark_workspace_retention_purge_completed_service(uuid, jsonb)
from public, anon, authenticated;

grant execute on function public.mark_workspace_retention_purge_completed_service(uuid, jsonb)
to service_role;

create or replace function public.block_membership_change_when_ownership_transfer_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  protected_membership_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
  protected_workspace_id uuid := case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end;
begin
  if coalesce(current_setting('app.owner_transfer', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if exists (
    select 1
    from public.workspace_ownership_transfers transfer
    where transfer.workspace_id = protected_workspace_id
      and transfer.status = 'pending'
      and protected_membership_id in (
        transfer.previous_owner_membership_id,
        transfer.target_membership_id
      )
  ) then
    raise exception 'pending ownership transfer must be resolved before membership changes'
      using errcode = '23514';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists block_membership_change_when_ownership_transfer_pending_trigger
on public.workspace_memberships;

create trigger block_membership_change_when_ownership_transfer_pending_trigger
before update of user_id, role, role_id, status or delete
on public.workspace_memberships
for each row execute function public.block_membership_change_when_ownership_transfer_pending();

revoke all on function public.block_membership_change_when_ownership_transfer_pending()
from public, anon, authenticated;

grant execute on function public.block_membership_change_when_ownership_transfer_pending()
to service_role;
