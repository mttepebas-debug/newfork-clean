alter function public.save_schedule_edit_session_service(
  uuid, uuid, uuid, integer, text, uuid, integer
) rename to save_schedule_edit_session_service_retroactive_base;

create function public.save_schedule_edit_session_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid,
  expected_session_revision integer,
  target_name text,
  target_draft_id uuid default null,
  expected_draft_revision integer default null,
  acknowledge_past_edits boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.schedule_edit_sessions%rowtype;
  current_week_start date;
  findings jsonb := '[]'::jsonb;
  blocked_findings jsonb := '[]'::jsonb;
  warning_findings jsonb := '[]'::jsonb;
begin
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

  current_week_start := public.schedule_current_week_start_service(target_workspace_id);

  if current_week_start is not null and target_session.week_start < current_week_start then
    select coalesce(jsonb_agg(jsonb_build_object(
      'op_type', coalesce(shift.pending_op_type, 'update'),
      'shift_id', shift.id,
      'scheduled_date', to_char(shift.scheduled_date, 'YYYY-MM-DD'),
      'location_name', coalesce(location.name, 'Unknown location'),
      'employee_name', coalesce(
        nullif(trim(concat_ws(' ', nullif(employee.preferred_name, ''), employee.last_name)), ''),
        nullif(trim(concat_ws(' ', employee.first_name, employee.last_name)), '')
      ),
      'reason', 'past_week',
      'severity', 'blocked'
    ) order by shift.scheduled_date, shift.start_time, shift.id), '[]'::jsonb)
    into blocked_findings
    from public.schedule_edit_session_shifts shift
    left join public.locations location
      on location.id = shift.location_id
     and location.workspace_id = shift.workspace_id
    left join public.employee_profiles employee
      on employee.id = shift.employee_id
     and employee.workspace_id = shift.workspace_id
    where shift.session_id = target_session_id
      and shift.workspace_id = target_workspace_id
      and public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, shift.location_id);

    if jsonb_array_length(blocked_findings) = 0 then
      blocked_findings := jsonb_build_array(jsonb_build_object(
        'op_type', 'update',
        'shift_id', null,
        'scheduled_date', to_char(target_session.week_start, 'YYYY-MM-DD'),
        'location_name', 'Schedule week',
        'employee_name', null,
        'reason', 'past_week',
        'severity', 'blocked'
      ));
    end if;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'op_type', shift.pending_op_type,
      'shift_id', shift.id,
      'scheduled_date', to_char(shift.scheduled_date, 'YYYY-MM-DD'),
      'location_name', coalesce(location.name, 'Unknown location'),
      'employee_name', coalesce(
        nullif(trim(concat_ws(' ', nullif(employee.preferred_name, ''), employee.last_name)), ''),
        nullif(trim(concat_ws(' ', employee.first_name, employee.last_name)), '')
      ),
      'reason', 'shift_started',
      'severity', 'warning'
    ) order by shift.scheduled_date, shift.start_time, shift.id), '[]'::jsonb)
    into warning_findings
    from public.schedule_edit_session_shifts shift
    join public.locations location
      on location.id = shift.location_id
     and location.workspace_id = shift.workspace_id
    left join public.employee_profiles employee
      on employee.id = shift.employee_id
     and employee.workspace_id = shift.workspace_id
    where shift.session_id = target_session_id
      and shift.workspace_id = target_workspace_id
      and shift.pending_op_type in ('create', 'update', 'delete')
      and public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, shift.location_id)
      and ((shift.scheduled_date::timestamp + shift.start_time) at time zone location.timezone) <= now();
  end if;

  if jsonb_array_length(blocked_findings) > 0 then
    findings := blocked_findings;
    raise exception '%', jsonb_build_object(
      'status', 'past_edit_blocked',
      'past_edits', findings,
      'past_edit_messages', (
        select coalesce(jsonb_agg(
          coalesce(finding->>'employee_name', 'An open shift')
          || ' - '
          || coalesce(finding->>'location_name', 'Unknown location')
          || ' on '
          || coalesce(finding->>'scheduled_date', target_session.week_start::text)
          || ' is in a past week. Correct what actually happened in Time Entries.'
        ), '[]'::jsonb)
        from jsonb_array_elements(findings) finding
      ),
      'current_week_start', current_week_start
    )::text using errcode = 'P0001';
  end if;

  if jsonb_array_length(warning_findings) > 0 and acknowledge_past_edits is distinct from true then
    findings := warning_findings;
    raise exception '%', jsonb_build_object(
      'status', 'past_shift_edit_requires_ack',
      'past_edits', findings,
      'past_edit_messages', (
        select coalesce(jsonb_agg(
          coalesce(finding->>'employee_name', 'An open shift')
          || ' - '
          || coalesce(finding->>'location_name', 'Unknown location')
          || ' on '
          || coalesce(finding->>'scheduled_date', target_session.week_start::text)
          || ' has already started. Employees will not be notified of this change.'
        ), '[]'::jsonb)
        from jsonb_array_elements(findings) finding
      )
    )::text using errcode = 'P0001';
  end if;

  return public.save_schedule_edit_session_service_retroactive_base(
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

revoke all on function public.save_schedule_edit_session_service(
  uuid, uuid, uuid, integer, text, uuid, integer, boolean
) from public, anon, authenticated;

grant execute on function public.save_schedule_edit_session_service(
  uuid, uuid, uuid, integer, text, uuid, integer, boolean
) to service_role;
