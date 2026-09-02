alter function public.acquire_schedule_edit_session_service(
  uuid, uuid, date, public.schedule_edit_source, uuid
) rename to acquire_schedule_edit_session_service_past_week_base;

create function public.acquire_schedule_edit_session_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_week_start date,
  requested_source public.schedule_edit_source,
  requested_draft_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_week_start date;
begin
  current_week_start := public.schedule_current_week_start_service(
    target_workspace_id
  );

  if current_week_start is not null and target_week_start < current_week_start then
    raise exception '%', jsonb_build_object(
      'status', 'past_edit_blocked',
      'past_edits', jsonb_build_array(jsonb_build_object(
        'op_type', 'update',
        'shift_id', null,
        'scheduled_date', to_char(target_week_start, 'YYYY-MM-DD'),
        'location_name', 'Schedule week',
        'employee_name', null,
        'reason', 'past_week',
        'severity', 'blocked'
      )),
      'past_edit_messages', jsonb_build_array(
        'Past schedule weeks are read-only. Correct what actually happened in Time Entries.'
      ),
      'current_week_start', current_week_start
    )::text using errcode = 'P0001';
  end if;

  return public.acquire_schedule_edit_session_service_past_week_base(
    actor_user_id,
    target_workspace_id,
    target_week_start,
    requested_source,
    requested_draft_id
  );
end;
$$;

revoke all on function public.acquire_schedule_edit_session_service(
  uuid, uuid, date, public.schedule_edit_source, uuid
) from public, anon, authenticated;

grant execute on function public.acquire_schedule_edit_session_service(
  uuid, uuid, date, public.schedule_edit_source, uuid
) to service_role;
