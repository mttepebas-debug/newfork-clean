alter table public.schedule_edit_session_shifts
  add column if not exists source_published_shift_id uuid,
  add column if not exists pending_op_type text
    check (pending_op_type is null or pending_op_type in ('create', 'update', 'delete')),
  add column if not exists locked boolean not null default false;

create index if not exists schedule_edit_session_shifts_source_published_idx
  on public.schedule_edit_session_shifts (session_id, source_published_shift_id)
  where source_published_shift_id is not null;

create or replace function public.mark_schedule_edit_session_shift_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_source public.schedule_edit_source;
begin
  select session.source_kind into session_source
  from public.schedule_edit_sessions session
  where session.id = new.session_id
    and session.workspace_id = new.workspace_id;

  if session_source = 'published' and new.source_published_shift_id is null then
    new.source_published_shift_id := new.id;
    new.locked := true;
  end if;

  return new;
end;
$$;

drop trigger if exists mark_schedule_edit_session_shift_source_trigger
  on public.schedule_edit_session_shifts;
create trigger mark_schedule_edit_session_shift_source_trigger
before insert on public.schedule_edit_session_shifts
for each row execute function public.mark_schedule_edit_session_shift_source();

update public.schedule_edit_session_shifts shift
set source_published_shift_id = shift.id,
    locked = true
from public.schedule_edit_sessions session
where session.id = shift.session_id
  and session.workspace_id = shift.workspace_id
  and session.source_kind = 'published'
  and shift.source_published_shift_id is null;

alter function public.get_schedule_edit_session_service(uuid, uuid, uuid)
  rename to get_schedule_edit_session_service_base;

create function public.get_schedule_edit_session_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base jsonb;
  patched_shifts jsonb;
begin
  base := public.get_schedule_edit_session_service_base(
    actor_user_id,
    target_workspace_id,
    target_session_id
  );

  select coalesce(jsonb_agg(
    item.value
      || jsonb_build_object(
        'source_published_shift_id', shift.source_published_shift_id,
        'pending_op_type', shift.pending_op_type,
        'locked', shift.locked
      )
    order by item.ordinality
  ), '[]'::jsonb)
  into patched_shifts
  from jsonb_array_elements(base->'shifts') with ordinality item(value, ordinality)
  left join public.schedule_edit_session_shifts shift
    on shift.session_id = target_session_id
   and shift.id = (item.value->>'id')::uuid;

  return jsonb_set(base, '{shifts}', patched_shifts, true);
end;
$$;

alter function public.mutate_schedule_edit_shift_service(
  uuid, uuid, uuid, integer, text, uuid, integer, jsonb, uuid
) rename to mutate_schedule_edit_shift_service_base;

create function public.mutate_schedule_edit_shift_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid,
  expected_session_revision integer,
  operation text,
  target_shift_id uuid,
  expected_shift_revision integer default null,
  shift_payload jsonb default null,
  request_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.schedule_edit_sessions%rowtype;
  target_shift public.schedule_edit_session_shifts%rowtype;
  result jsonb;
begin
  if operation not in ('create', 'update', 'delete', 'restore') then
    raise exception 'invalid shift operation' using errcode = '22023';
  end if;

  if operation in ('create', 'update') then
    result := public.mutate_schedule_edit_shift_service_base(
      actor_user_id,
      target_workspace_id,
      target_session_id,
      expected_session_revision,
      operation,
      target_shift_id,
      expected_shift_revision,
      shift_payload,
      request_idempotency_key
    );

    if operation = 'update' then
      update public.schedule_edit_session_shifts shift
      set pending_op_type = case
            when shift.source_published_shift_id is not null
             and shift.pending_op_type is distinct from 'delete'
            then 'update'
            else shift.pending_op_type
          end,
          locked = case
            when shift.source_published_shift_id is not null then false
            else shift.locked
          end
      where shift.session_id = target_session_id
        and shift.id = target_shift_id;

      return public.get_schedule_edit_session_service(
        actor_user_id,
        target_workspace_id,
        target_session_id
      );
    end if;

    return result;
  end if;

  select * into target_session
  from public.schedule_edit_sessions session
  where session.id = target_session_id
    and session.workspace_id = target_workspace_id
  for update;

  if target_session.id is null or target_session.holder_user_id <> actor_user_id then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;
  if target_session.status <> 'active' or target_session.expires_at <= now() then
    raise exception 'edit lease expired' using errcode = '40001';
  end if;
  if target_session.revision <> expected_session_revision then
    raise exception 'session revision stale' using errcode = '40001';
  end if;

  select * into target_shift
  from public.schedule_edit_session_shifts shift
  where shift.session_id = target_session_id
    and shift.id = target_shift_id
    and shift.revision = expected_shift_revision
    and public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, shift.location_id)
  for update;

  if target_shift.id is null then
    raise exception 'shift revision stale' using errcode = '40001';
  end if;

  if operation = 'restore' then
    if target_shift.source_published_shift_id is null
      or target_shift.pending_op_type is distinct from 'delete' then
      raise exception 'shift restore unavailable' using errcode = '22023';
    end if;

    update public.schedule_edit_session_shifts shift
    set pending_op_type = null,
        locked = true,
        revision = revision + 1,
        updated_at = now()
    where shift.session_id = target_session_id
      and shift.id = target_shift_id;

    update public.schedule_edit_sessions
    set revision = revision + 1,
        dirty = true,
        last_heartbeat = now(),
        expires_at = now() + interval '4 minutes'
    where id = target_session_id;

    return public.get_schedule_edit_session_service(
      actor_user_id,
      target_workspace_id,
      target_session_id
    );
  end if;

  if target_shift.source_published_shift_id is null and not target_shift.locked then
    return public.mutate_schedule_edit_shift_service_base(
      actor_user_id,
      target_workspace_id,
      target_session_id,
      expected_session_revision,
      operation,
      target_shift_id,
      expected_shift_revision,
      shift_payload,
      request_idempotency_key
    );
  end if;

  update public.schedule_edit_session_shifts shift
  set pending_op_type = 'delete',
      locked = true,
      revision = revision + 1,
      updated_at = now()
  where shift.session_id = target_session_id
    and shift.id = target_shift_id;

  update public.schedule_edit_sessions
  set revision = revision + 1,
      dirty = true,
      last_heartbeat = now(),
      expires_at = now() + interval '4 minutes'
  where id = target_session_id;

  return public.get_schedule_edit_session_service(
    actor_user_id,
    target_workspace_id,
    target_session_id
  );
end;
$$;

alter function public.save_schedule_edit_session_service(
  uuid, uuid, uuid, integer, text, uuid, integer
) rename to save_schedule_edit_session_service_base;

create function public.save_schedule_edit_session_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid,
  expected_session_revision integer,
  target_name text,
  target_draft_id uuid default null,
  expected_draft_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.schedule_edit_session_shifts shift
  using public.schedule_edit_sessions session
  where session.id = target_session_id
    and session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id
    and session.status = 'active'
    and shift.session_id = session.id
    and shift.pending_op_type = 'delete';

  return public.save_schedule_edit_session_service_base(
    actor_user_id,
    target_workspace_id,
    target_session_id,
    expected_session_revision,
    target_name,
    target_draft_id,
    expected_draft_revision
  );
end;
$$;

revoke all on function public.get_schedule_edit_session_service(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.mutate_schedule_edit_shift_service(uuid, uuid, uuid, integer, text, uuid, integer, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.save_schedule_edit_session_service(uuid, uuid, uuid, integer, text, uuid, integer) from public, anon, authenticated;

grant execute on function public.get_schedule_edit_session_service(uuid, uuid, uuid) to service_role;
grant execute on function public.mutate_schedule_edit_shift_service(uuid, uuid, uuid, integer, text, uuid, integer, jsonb, uuid) to service_role;
grant execute on function public.save_schedule_edit_session_service(uuid, uuid, uuid, integer, text, uuid, integer) to service_role;
