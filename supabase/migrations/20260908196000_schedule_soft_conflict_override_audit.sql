alter function public.mutate_schedule_edit_shift_service(
  uuid, uuid, uuid, integer, text, uuid, integer, jsonb, uuid
) rename to mutate_schedule_edit_shift_service_soft_audit_base;

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
  result jsonb;
  override_note text;
  audited_shift_id uuid;
begin
  result := public.mutate_schedule_edit_shift_service_soft_audit_base(
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

  override_note := btrim(coalesce(shift_payload->>'conflict_override_note', ''));

  if operation in ('create', 'update') and char_length(override_note) >= 10 then
    select shift.id
    into audited_shift_id
    from public.schedule_edit_session_shifts shift
    where shift.workspace_id = target_workspace_id
      and shift.session_id = target_session_id
      and (
        shift.id = target_shift_id
        or (
          operation = 'create'
          and request_idempotency_key is not null
          and shift.idempotency_key = request_idempotency_key
        )
      )
    order by (shift.id = target_shift_id) desc
    limit 1;

    if audited_shift_id is not null
      and not exists (
        select 1
        from public.audit_events event
        where event.workspace_id = target_workspace_id
          and event.action = 'schedule.soft_conflict_overridden'
          and event.target_type = 'schedule_edit_session_shift'
          and event.target_id = audited_shift_id::text
          and request_idempotency_key is not null
          and event.metadata->>'idempotency_key' = request_idempotency_key::text
      ) then
      insert into public.audit_events (
        workspace_id,
        actor_user_id,
        action,
        target_type,
        target_id,
        metadata
      ) values (
        target_workspace_id,
        actor_user_id,
        'schedule.soft_conflict_overridden',
        'schedule_edit_session_shift',
        audited_shift_id::text,
        jsonb_build_object(
          'session_id', target_session_id,
          'operation', operation,
          'idempotency_key', request_idempotency_key,
          'note', override_note
        )
      );
    end if;
  end if;

  return result;
end;
$$;

revoke all on function public.mutate_schedule_edit_shift_service_soft_audit_base(
  uuid, uuid, uuid, integer, text, uuid, integer, jsonb, uuid
) from public, anon, authenticated;
revoke all on function public.mutate_schedule_edit_shift_service(
  uuid, uuid, uuid, integer, text, uuid, integer, jsonb, uuid
) from public, anon, authenticated;

grant execute on function public.mutate_schedule_edit_shift_service(
  uuid, uuid, uuid, integer, text, uuid, integer, jsonb, uuid
) to service_role;
