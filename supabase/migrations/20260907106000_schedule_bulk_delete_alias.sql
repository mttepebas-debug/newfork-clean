create function public.bulk_delete_schedule_edit_shifts_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_shift_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.schedule_edit_sessions%rowtype;
  requested_count integer;
  matched_count integer;
  changed_count integer;
begin
  select count(distinct id) into requested_count
  from unnest(coalesce(target_shift_ids, array[]::uuid[])) as input(id);
  if requested_count < 1 or requested_count > 100 then
    raise exception 'valid shift ids required' using errcode = '22023';
  end if;

  select session.* into target_session
  from public.schedule_edit_sessions session
  where session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id
    and session.status = 'active'
    and session.expires_at > now()
    and exists (
      select 1
      from public.schedule_edit_session_shifts shift
      where shift.session_id = session.id
        and shift.id = any(target_shift_ids)
    )
  order by session.last_heartbeat desc
  limit 1
  for update;

  if target_session.id is null then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;

  select count(distinct shift.id) into matched_count
  from public.schedule_edit_session_shifts shift
  where shift.session_id = target_session.id
    and shift.id = any(target_shift_ids)
    and public.schedule_actor_can_manage_service(
      actor_user_id,
      target_workspace_id,
      shift.location_id
    );

  if matched_count <> requested_count then
    raise exception 'shift revision stale' using errcode = '40001';
  end if;

  with draft_deletes as (
    delete from public.schedule_edit_session_shifts shift
    where shift.session_id = target_session.id
      and shift.id = any(target_shift_ids)
      and shift.source_published_shift_id is null
      and not shift.locked
    returning shift.id
  ), live_marks as (
    update public.schedule_edit_session_shifts shift
    set pending_op_type = 'delete',
        locked = true,
        revision = revision + 1,
        updated_at = now()
    where shift.session_id = target_session.id
      and shift.id = any(target_shift_ids)
      and (shift.source_published_shift_id is not null or shift.locked)
      and shift.pending_op_type is distinct from 'delete'
    returning shift.id
  )
  select count(*) into changed_count
  from (
    select id from draft_deletes
    union all
    select id from live_marks
  ) changed;

  update public.schedule_edit_sessions
  set revision = revision + 1,
      dirty = true,
      last_heartbeat = now(),
      expires_at = now() + interval '4 minutes'
  where id = target_session.id;

  return jsonb_build_object(
    'deleted_count', changed_count,
    'session', public.get_schedule_edit_session_service(
      actor_user_id,
      target_workspace_id,
      target_session.id
    )
  );
end;
$$;

revoke all on function public.bulk_delete_schedule_edit_shifts_service(uuid, uuid, uuid[])
from public, anon, authenticated;
grant execute on function public.bulk_delete_schedule_edit_shifts_service(uuid, uuid, uuid[])
to service_role;
