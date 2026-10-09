create function public.time_session_detail_json(target_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(session) || jsonb_build_object(
    'location_name', location.name,
    'events', coalesce((
      select jsonb_agg(to_jsonb(event) order by event.occurred_at, event.received_at)
      from public.time_events event
      where event.session_id = session.id
    ), '[]'::jsonb),
    'amendments', coalesce((
      select jsonb_agg(to_jsonb(amendment) order by amendment.result_revision)
      from public.time_amendments amendment
      where amendment.session_id = session.id
    ), '[]'::jsonb)
  )
  from public.time_sessions session
  join public.locations location
    on location.id = session.location_id
    and location.workspace_id = session.workspace_id
  where session.id = target_session_id;
$$;

create function public.get_employee_time_tracking_service(
  actor_user_id uuid,
  target_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  employee_row public.employee_profiles%rowtype;
  current_session_id uuid;
begin
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'time.read.own') then
    raise exception 'own time access denied' using errcode = '42501';
  end if;

  select * into employee_row
  from public.employee_profiles employee
  where employee.workspace_id = target_workspace_id
    and employee.user_id = actor_user_id
    and employee.archived_at is null;
  if not found then raise exception 'employee profile required' using errcode = '42501'; end if;

  select session.id into current_session_id
  from public.time_sessions session
  where session.workspace_id = target_workspace_id
    and session.employee_id = employee_row.id
    and session.capture_state in ('open', 'on_break')
  order by session.started_at desc
  limit 1;

  return jsonb_build_object(
    'workspace_id', target_workspace_id,
    'employee', jsonb_build_object(
      'id', employee_row.id,
      'display_name', coalesce(nullif(employee_row.preferred_name, ''), employee_row.first_name) || ' ' || employee_row.last_name
    ),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', location.id,
        'name', location.name,
        'timezone', location.timezone
      ) order by assignment.is_primary desc, location.sort_order, location.name)
      from public.employee_location_assignments assignment
      join public.locations location
        on location.id = assignment.location_id
        and location.workspace_id = assignment.workspace_id
      where assignment.workspace_id = target_workspace_id
        and assignment.employee_id = employee_row.id
        and assignment.ended_at is null
        and location.archived_at is null
    ), '[]'::jsonb),
    'current_session', case
      when current_session_id is null then null
      else public.time_session_detail_json(current_session_id)
    end,
    'sessions', coalesce((
      select jsonb_agg(public.time_session_detail_json(recent.id) order by recent.started_at desc)
      from (
        select session.id, session.started_at
        from public.time_sessions session
        where session.workspace_id = target_workspace_id
          and session.employee_id = employee_row.id
          and session.capture_state in ('complete', 'needs_attention')
        order by session.started_at desc
        limit 30
      ) recent
    ), '[]'::jsonb)
  );
end;
$$;

create function public.capture_own_time_event_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_location_id uuid,
  target_session_id uuid,
  target_event_type public.time_event_type,
  target_occurred_at timestamptz,
  target_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_employee_id uuid;
begin
  select employee.id into target_employee_id
  from public.employee_profiles employee
  where employee.workspace_id = target_workspace_id
    and employee.user_id = actor_user_id
    and employee.archived_at is null;
  if not found then raise exception 'employee profile required' using errcode = '42501'; end if;

  return public.capture_time_event_service(
    actor_user_id,
    target_workspace_id,
    target_employee_id,
    target_location_id,
    target_session_id,
    target_event_type,
    target_occurred_at,
    target_idempotency_key,
    'web'
  );
end;
$$;

revoke all on function public.time_session_detail_json(uuid) from public, anon, authenticated;
revoke all on function public.get_employee_time_tracking_service(uuid, uuid) from public, anon, authenticated;
revoke all on function public.capture_own_time_event_service(uuid, uuid, uuid, uuid, public.time_event_type, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.get_employee_time_tracking_service(uuid, uuid) to service_role;
grant execute on function public.capture_own_time_event_service(uuid, uuid, uuid, uuid, public.time_event_type, timestamptz, uuid) to service_role;
