alter table public.time_sessions
  alter column created_by drop not null,
  add column created_by_employee_id uuid,
  add column created_by_kiosk_device_id uuid,
  add foreign key (created_by_employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete restrict,
  add foreign key (created_by_kiosk_device_id, workspace_id)
    references public.kiosk_devices(id, workspace_id) on delete restrict,
  add constraint time_session_creator_principal_check check (
    (created_by is not null and created_by_employee_id is null and created_by_kiosk_device_id is null)
    or
    (created_by is null and created_by_employee_id = employee_id and created_by_kiosk_device_id is not null)
  );

alter table public.time_events
  alter column actor_user_id drop not null,
  add column actor_employee_id uuid,
  add column kiosk_device_id uuid,
  add column kiosk_action_session_id uuid,
  add foreign key (actor_employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete restrict,
  add foreign key (kiosk_device_id, workspace_id)
    references public.kiosk_devices(id, workspace_id) on delete restrict,
  add foreign key (kiosk_action_session_id, workspace_id)
    references public.kiosk_action_sessions(id, workspace_id) on delete restrict,
  add constraint time_event_actor_principal_check check (
    (source = 'kiosk' and actor_user_id is null and actor_employee_id = employee_id
      and kiosk_device_id is not null and kiosk_action_session_id is not null)
    or
    (source <> 'kiosk' and actor_user_id is not null and actor_employee_id is null
      and kiosk_device_id is null and kiosk_action_session_id is null)
  );

create unique index time_events_kiosk_action_type_idx
  on public.time_events (kiosk_action_session_id, event_type)
  where kiosk_action_session_id is not null;

alter table public.kiosk_action_sessions
  add column request_idempotency_key uuid,
  add column requested_action text,
  add column requested_occurred_at timestamptz,
  add column result_session_id uuid,
  add foreign key (result_session_id, workspace_id, employee_id, location_id)
    references public.time_sessions(id, workspace_id, employee_id, location_id) on delete restrict,
  add constraint kiosk_action_consumption_check check (
    (consumed_at is null and request_idempotency_key is null and requested_action is null
      and requested_occurred_at is null and result_session_id is null)
    or
    (consumed_at is not null and request_idempotency_key is not null and requested_action is not null
      and requested_occurred_at is not null and result_session_id is not null)
  );

create function public.get_kiosk_directory_service(target_credential_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  device public.kiosk_devices;
  result jsonb;
begin
  select candidate.* into device
  from public.kiosk_devices candidate
  join public.locations location on location.id = candidate.location_id
    and location.workspace_id = candidate.workspace_id and location.archived_at is null
  where candidate.credential_hash = target_credential_hash and candidate.status = 'active'
  for update of candidate;
  if device.id is null then raise exception 'active kiosk device not found' using errcode = 'P0002'; end if;

  update public.kiosk_devices set last_seen_at = now() where id = device.id;
  select jsonb_build_object(
    'device', jsonb_build_object(
      'id', device.id, 'label', device.label, 'workspace_id', device.workspace_id,
      'workspace_name', workspace.name,
      'location', jsonb_build_object('id', location.id, 'name', location.name, 'timezone', location.timezone)
    ),
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', employee.id,
        'display_name', concat_ws(' ', coalesce(nullif(employee.preferred_name, ''), employee.first_name), employee.last_name)
      ) order by lower(concat_ws(' ', coalesce(nullif(employee.preferred_name, ''), employee.first_name), employee.last_name)), employee.id)
      from public.employee_profiles employee
      join public.employee_location_assignments assignment on assignment.employee_id = employee.id
        and assignment.workspace_id = employee.workspace_id
        and assignment.location_id = device.location_id and assignment.ended_at is null
      where employee.workspace_id = device.workspace_id and employee.archived_at is null
    ), '[]'::jsonb)
  ) into result
  from public.workspaces workspace
  join public.locations location on location.id = device.location_id and location.workspace_id = device.workspace_id
  where workspace.id = device.workspace_id;
  return result;
end;
$$;

create function public.get_kiosk_action_state_service(
  target_credential_hash text,
  target_action_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_session public.kiosk_action_sessions;
  active_session public.time_sessions;
  display_name text;
  location_name text;
  location_timezone text;
  actions jsonb := '[]'::jsonb;
  blocked text;
begin
  select action.* into action_session
  from public.kiosk_action_sessions action
  join public.kiosk_devices device on device.id = action.device_id and device.workspace_id = action.workspace_id
  where action.token_hash = target_action_token_hash
    and device.credential_hash = target_credential_hash and device.status = 'active'
    and action.consumed_at is null and action.revoked_at is null and action.expires_at > now()
  for update of action;
  if action_session.id is null then raise exception 'active kiosk action not found' using errcode = 'P0002'; end if;

  select concat_ws(' ', coalesce(nullif(employee.preferred_name, ''), employee.first_name), employee.last_name)
    into display_name from public.employee_profiles employee
  where employee.id = action_session.employee_id and employee.workspace_id = action_session.workspace_id
    and employee.archived_at is null;
  if display_name is null or not public.time_employee_has_location(
    action_session.workspace_id, action_session.employee_id, action_session.location_id
  ) then raise exception 'active kiosk employee not found' using errcode = 'P0002'; end if;

  select location.name, location.timezone into location_name, location_timezone
  from public.locations location where location.id = action_session.location_id
    and location.workspace_id = action_session.workspace_id and location.archived_at is null;
  if location_name is null then raise exception 'active kiosk location not found' using errcode = 'P0002'; end if;

  select * into active_session from public.time_sessions session
  where session.workspace_id = action_session.workspace_id and session.employee_id = action_session.employee_id
    and session.capture_state in ('open', 'on_break') for update;
  if active_session.id is null then
    actions := '["clock_in"]'::jsonb;
  elsif active_session.location_id <> action_session.location_id then
    blocked := 'other_location';
  elsif active_session.capture_state = 'open' then
    actions := '["break_start", "clock_out"]'::jsonb;
  else
    actions := '["break_end", "end_break_and_clock_out"]'::jsonb;
  end if;

  return jsonb_build_object(
    'employee', jsonb_build_object('id', action_session.employee_id, 'display_name', display_name),
    'location', jsonb_build_object('id', action_session.location_id, 'name', location_name, 'timezone', location_timezone),
    'current_session', case when active_session.id is null then null else jsonb_build_object(
      'id', active_session.id, 'capture_state', active_session.capture_state,
      'started_at', active_session.started_at, 'revision', active_session.revision) end,
    'expected_revision', coalesce(active_session.revision, 0),
    'allowed_actions', actions, 'blocked_reason', blocked, 'expires_at', action_session.expires_at
  );
end;
$$;

create function public.capture_kiosk_time_action_service(
  target_credential_hash text,
  target_action_token_hash text,
  target_action text,
  target_expected_revision integer,
  target_occurred_at timestamptz,
  target_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_session public.kiosk_action_sessions;
  active_session public.time_sessions;
  event_row public.time_events;
  events jsonb := '[]'::jsonb;
  allowed boolean := false;
  event_kind public.time_event_type;
begin
  select action.* into action_session from public.kiosk_action_sessions action
  join public.kiosk_devices device on device.id = action.device_id and device.workspace_id = action.workspace_id
  where action.token_hash = target_action_token_hash
    and device.credential_hash = target_credential_hash and device.status = 'active'
  for update of action;
  if action_session.id is null then raise exception 'active kiosk action not found' using errcode = 'P0002'; end if;

  if action_session.consumed_at is not null then
    if action_session.request_idempotency_key = target_idempotency_key
      and action_session.requested_action = target_action
      and action_session.requested_occurred_at = target_occurred_at then
      select * into active_session from public.time_sessions where id = action_session.result_session_id;
      select coalesce(jsonb_agg(jsonb_build_object('id', event.id, 'event_type', event.event_type,
        'occurred_at', event.occurred_at, 'received_at', event.received_at) order by event.received_at, event.id), '[]'::jsonb)
        into events from public.time_events event where event.kiosk_action_session_id = action_session.id;
      return jsonb_build_object('status', 'accepted', 'session', jsonb_build_object(
        'id', active_session.id, 'capture_state', active_session.capture_state,
        'revision', active_session.revision, 'last_event_at', active_session.last_event_at),
        'events', events, 'idempotent_replay', true);
    end if;
    raise exception 'kiosk action already consumed' using errcode = '23505';
  end if;
  if action_session.revoked_at is not null or action_session.expires_at <= now() then
    raise exception 'active kiosk action not found' using errcode = 'P0002';
  end if;
  if target_expected_revision < 0 or target_occurred_at > now() + interval '5 minutes' then
    update public.kiosk_action_sessions set revoked_at = now() where id = action_session.id;
    return jsonb_build_object('status', 'conflict', 'reason', 'invalid_action');
  end if;
  if not public.time_employee_has_location(action_session.workspace_id, action_session.employee_id, action_session.location_id) then
    update public.kiosk_action_sessions set revoked_at = now() where id = action_session.id;
    return jsonb_build_object('status', 'conflict', 'reason', 'invalid_action');
  end if;

  select * into active_session from public.time_sessions session
  where session.workspace_id = action_session.workspace_id and session.employee_id = action_session.employee_id
    and session.capture_state in ('open', 'on_break') for update;
  if active_session.id is not null and active_session.location_id <> action_session.location_id then
    update public.kiosk_action_sessions set revoked_at = now() where id = action_session.id;
    return jsonb_build_object('status', 'conflict', 'reason', 'other_location');
  end if;
  if coalesce(active_session.revision, 0) <> target_expected_revision then
    update public.kiosk_action_sessions set revoked_at = now() where id = action_session.id;
    return jsonb_build_object('status', 'conflict', 'reason', 'stale_state');
  end if;

  allowed := coalesce((active_session.id is null and target_action = 'clock_in')
    or (active_session.capture_state = 'open' and target_action in ('break_start', 'clock_out'))
    or (active_session.capture_state = 'on_break' and target_action in ('break_end', 'end_break_and_clock_out')), false);
  if not allowed then
    update public.kiosk_action_sessions set revoked_at = now() where id = action_session.id;
    return jsonb_build_object('status', 'conflict', 'reason', 'invalid_action');
  end if;

  if active_session.id is null then
    insert into public.time_sessions (workspace_id, employee_id, location_id, capture_state, started_at,
      effective_started_at, last_event_at, created_by, created_by_employee_id, created_by_kiosk_device_id)
    values (action_session.workspace_id, action_session.employee_id, action_session.location_id, 'open',
      target_occurred_at, target_occurred_at, target_occurred_at, null, action_session.employee_id, action_session.device_id)
    returning * into active_session;
  elsif target_occurred_at < active_session.last_event_at then
    update public.kiosk_action_sessions set revoked_at = now() where id = action_session.id;
    return jsonb_build_object('status', 'conflict', 'reason', 'stale_state');
  end if;

  if target_action in ('clock_out', 'end_break_and_clock_out')
    and target_occurred_at <= active_session.started_at then
    update public.kiosk_action_sessions set revoked_at = now() where id = action_session.id;
    return jsonb_build_object('status', 'conflict', 'reason', 'invalid_action');
  end if;

  if target_action = 'clock_in' then event_kind := 'clock_in';
  elsif target_action = 'break_start' then
    event_kind := 'break_start';
    update public.time_sessions set capture_state = 'on_break', last_event_at = target_occurred_at,
      revision = revision + 1, updated_at = now() where id = active_session.id returning * into active_session;
  elsif target_action = 'break_end' or target_action = 'end_break_and_clock_out' then
    event_kind := 'break_end';
    update public.time_sessions set capture_state = 'open', last_event_at = target_occurred_at,
      revision = revision + 1, updated_at = now() where id = active_session.id returning * into active_session;
  elsif target_action = 'clock_out' then event_kind := null;
  end if;

  if event_kind is not null then
    insert into public.time_events (workspace_id, session_id, employee_id, location_id, event_type,
      occurred_at, received_at, actor_user_id, actor_employee_id, kiosk_device_id, kiosk_action_session_id, source, idempotency_key)
    values (action_session.workspace_id, active_session.id, action_session.employee_id, action_session.location_id,
      event_kind, target_occurred_at, clock_timestamp(), null, action_session.employee_id, action_session.device_id,
      action_session.id, 'kiosk', gen_random_uuid()) returning * into event_row;
    events := events || jsonb_build_array(jsonb_build_object('id', event_row.id, 'event_type', event_row.event_type,
      'occurred_at', event_row.occurred_at, 'received_at', event_row.received_at));
  end if;

  if target_action in ('clock_out', 'end_break_and_clock_out') then
    update public.time_sessions set capture_state = 'complete', ended_at = target_occurred_at,
      effective_ended_at = target_occurred_at, last_event_at = target_occurred_at,
      revision = revision + 1, updated_at = now() where id = active_session.id returning * into active_session;
    insert into public.time_events (workspace_id, session_id, employee_id, location_id, event_type,
      occurred_at, received_at, actor_user_id, actor_employee_id, kiosk_device_id, kiosk_action_session_id, source, idempotency_key)
    values (action_session.workspace_id, active_session.id, action_session.employee_id, action_session.location_id,
      'clock_out', target_occurred_at,
      case when target_action = 'end_break_and_clock_out'
        then greatest(clock_timestamp(), event_row.received_at + interval '1 microsecond')
        else clock_timestamp() end,
      null, action_session.employee_id, action_session.device_id,
      action_session.id, 'kiosk', gen_random_uuid()) returning * into event_row;
    events := events || jsonb_build_array(jsonb_build_object('id', event_row.id, 'event_type', event_row.event_type,
      'occurred_at', event_row.occurred_at, 'received_at', event_row.received_at));
  end if;

  update public.kiosk_action_sessions set consumed_at = now(), request_idempotency_key = target_idempotency_key,
    requested_action = target_action, requested_occurred_at = target_occurred_at, result_session_id = active_session.id
  where id = action_session.id;
  insert into public.kiosk_security_events (workspace_id, location_id, device_id, employee_id, action, metadata)
  values (action_session.workspace_id, action_session.location_id, action_session.device_id,
    action_session.employee_id, 'kiosk.time_action.accepted',
    jsonb_build_object('time_session_id', active_session.id, 'requested_action', target_action));
  return jsonb_build_object('status', 'accepted', 'session', jsonb_build_object(
    'id', active_session.id, 'capture_state', active_session.capture_state,
    'revision', active_session.revision, 'last_event_at', active_session.last_event_at),
    'events', events, 'idempotent_replay', false);
end;
$$;

create function public.cancel_kiosk_action_service(
  target_credential_hash text,
  target_action_token_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.kiosk_action_sessions action set revoked_at = now()
  from public.kiosk_devices device
  where action.device_id = device.id and action.workspace_id = device.workspace_id
    and action.token_hash = target_action_token_hash and device.credential_hash = target_credential_hash
    and action.consumed_at is null and action.revoked_at is null;
end;
$$;

revoke all on function public.get_kiosk_directory_service(text) from public, anon, authenticated;
revoke all on function public.get_kiosk_action_state_service(text, text) from public, anon, authenticated;
revoke all on function public.capture_kiosk_time_action_service(text, text, text, integer, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.cancel_kiosk_action_service(text, text) from public, anon, authenticated;
grant execute on function public.get_kiosk_directory_service(text) to service_role;
grant execute on function public.get_kiosk_action_state_service(text, text) to service_role;
grant execute on function public.capture_kiosk_time_action_service(text, text, text, integer, timestamptz, uuid) to service_role;
grant execute on function public.cancel_kiosk_action_service(text, text) to service_role;
