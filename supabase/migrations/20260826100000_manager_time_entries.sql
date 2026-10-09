create table public.time_manual_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  session_id uuid not null,
  employee_id uuid not null,
  location_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  foreign key (session_id, workspace_id, employee_id, location_id)
    references public.time_sessions(id, workspace_id, employee_id, location_id) on delete restrict,
  unique (session_id),
  unique (workspace_id, actor_user_id, idempotency_key)
);

alter table public.time_manual_entries enable row level security;
revoke all on public.time_manual_entries from public, anon, authenticated;
grant select, insert on public.time_manual_entries to service_role;

create trigger prevent_time_manual_entry_mutation_trigger
before update or delete on public.time_manual_entries
for each row execute function public.prevent_time_history_mutation();

create function public.manager_time_session_detail_json(target_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(session_row)
    || jsonb_build_object(
      'employee_name', coalesce(nullif(employee.preferred_name, ''), concat_ws(' ', employee.first_name, employee.last_name)),
      'employee_code', employee.employee_code,
      'location_name', location.name,
      'location_timezone', location.timezone,
      'attention_codes', (
        select coalesce(jsonb_agg(code order by sort_order), '[]'::jsonb)
        from (
          select 'open_session'::text as code, 10 as sort_order where session_row.capture_state = 'open'
          union all
          select 'open_break', 20 where session_row.capture_state = 'on_break'
          union all
          select 'needs_attention', 30 where session_row.capture_state = 'needs_attention'
          union all
          select 'overlap', 40 where exists (
            select 1
            from public.time_sessions other
            where other.workspace_id = session_row.workspace_id
              and other.employee_id = session_row.employee_id
              and other.id <> session_row.id
              and coalesce(other.effective_ended_at, 'infinity'::timestamptz) > session_row.effective_started_at
              and coalesce(session_row.effective_ended_at, 'infinity'::timestamptz) > other.effective_started_at
          )
          union all
          select 'amended', 50 where exists (
            select 1 from public.time_amendments amendment
            where amendment.session_id = session_row.id
          )
        ) attention
      ),
      'events', (
        select coalesce(jsonb_agg(to_jsonb(event_row) order by event_row.occurred_at, event_row.received_at), '[]'::jsonb)
        from public.time_events event_row
        where event_row.session_id = session_row.id
      ),
      'amendments', (
        select coalesce(jsonb_agg(to_jsonb(amendment_row) order by amendment_row.result_revision), '[]'::jsonb)
        from public.time_amendments amendment_row
        where amendment_row.session_id = session_row.id
      ),
      'manual_entry', (
        select to_jsonb(manual_row)
        from public.time_manual_entries manual_row
        where manual_row.session_id = session_row.id
      )
    )
  from public.time_sessions session_row
  join public.employee_profiles employee
    on employee.id = session_row.employee_id and employee.workspace_id = session_row.workspace_id
  join public.locations location
    on location.id = session_row.location_id and location.workspace_id = session_row.workspace_id
  where session_row.id = target_session_id;
$$;

create function public.get_manager_time_entries_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_from date,
  target_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if target_from is null or target_to is null or target_to < target_from then
    raise exception 'valid time entry range required' using errcode = '22023';
  end if;
  if target_to - target_from > 41 then
    raise exception 'time entry range cannot exceed 42 days' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.locations location
    where location.workspace_id = target_workspace_id
      and location.archived_at is null
      and public.service_actor_can_time_location(
        actor_user_id, target_workspace_id, location.id, 'time.read.location'
      )
  ) then
    raise exception 'location time read denied' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'from', target_from,
    'to', target_to,
    'locations', (
      select coalesce(jsonb_agg(
        jsonb_build_object('id', location.id, 'name', location.name, 'timezone', location.timezone)
        order by location.sort_order, location.name
      ), '[]'::jsonb)
      from public.locations location
      where location.workspace_id = target_workspace_id
        and location.archived_at is null
        and public.service_actor_can_time_location(
          actor_user_id, target_workspace_id, location.id, 'time.read.location'
        )
    ),
    'employees', (
      select coalesce(jsonb_agg(employee_json order by employee_name), '[]'::jsonb)
      from (
        select
          coalesce(nullif(employee.preferred_name, ''), concat_ws(' ', employee.first_name, employee.last_name)) as employee_name,
          jsonb_build_object(
            'id', employee.id,
            'employee_code', employee.employee_code,
            'display_name', coalesce(nullif(employee.preferred_name, ''), concat_ws(' ', employee.first_name, employee.last_name)),
            'location_ids', jsonb_agg(assignment.location_id order by assignment.location_id)
          ) as employee_json
        from public.employee_profiles employee
        join public.employee_location_assignments assignment
          on assignment.workspace_id = employee.workspace_id
          and assignment.employee_id = employee.id
          and assignment.ended_at is null
        join public.locations location
          on location.id = assignment.location_id
          and location.workspace_id = assignment.workspace_id
          and location.archived_at is null
        where employee.workspace_id = target_workspace_id
          and employee.archived_at is null
          and public.service_actor_can_time_location(
            actor_user_id, target_workspace_id, location.id, 'time.read.location'
          )
        group by employee.id
      ) employee_rows
    ),
    'sessions', (
      select coalesce(jsonb_agg(detail order by started_at desc), '[]'::jsonb)
      from (
        select
          session_row.started_at,
          public.manager_time_session_detail_json(session_row.id) as detail
        from public.time_sessions session_row
        join public.locations location
          on location.id = session_row.location_id
          and location.workspace_id = session_row.workspace_id
        where session_row.workspace_id = target_workspace_id
          and (session_row.started_at at time zone location.timezone)::date between target_from and target_to
          and public.service_actor_can_time_location(
            actor_user_id, target_workspace_id, session_row.location_id, 'time.read.location'
          )
        order by session_row.started_at desc
        limit 500
      ) session_rows
    )
  ) into result;
  return result;
end;
$$;

create function public.create_manual_time_session_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  target_location_id uuid,
  target_started_at timestamptz,
  target_ended_at timestamptz,
  target_reason text,
  target_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_manual public.time_manual_entries%rowtype;
  manual_row public.time_manual_entries%rowtype;
  session_row public.time_sessions%rowtype;
  clock_in_event public.time_events%rowtype;
  clock_out_event public.time_events%rowtype;
  clock_in_hash text := md5(target_idempotency_key::text || ':clock-in');
  clock_out_hash text := md5(target_idempotency_key::text || ':clock-out');
  clock_in_key uuid := (
    substr(clock_in_hash, 1, 8) || '-' || substr(clock_in_hash, 9, 4) ||
    '-5' || substr(clock_in_hash, 14, 3) || '-8' || substr(clock_in_hash, 18, 3) ||
    '-' || substr(clock_in_hash, 21, 12)
  )::uuid;
  clock_out_key uuid := (
    substr(clock_out_hash, 1, 8) || '-' || substr(clock_out_hash, 9, 4) ||
    '-5' || substr(clock_out_hash, 14, 3) || '-8' || substr(clock_out_hash, 18, 3) ||
    '-' || substr(clock_out_hash, 21, 12)
  )::uuid;
begin
  select candidate.* into existing_manual
  from public.time_manual_entries candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.actor_user_id = create_manual_time_session_service.actor_user_id
    and candidate.idempotency_key = target_idempotency_key;
  if found then
    select * into session_row from public.time_sessions where id = existing_manual.session_id;
    if session_row.employee_id <> target_employee_id
      or session_row.location_id <> target_location_id
      or session_row.started_at <> target_started_at
      or session_row.ended_at <> target_ended_at
      or existing_manual.reason <> btrim(target_reason) then
      raise exception 'idempotency key payload conflict' using errcode = '23505';
    end if;
    select * into clock_in_event from public.time_events
      where session_id = session_row.id and event_type = 'clock_in';
    select * into clock_out_event from public.time_events
      where session_id = session_row.id and event_type = 'clock_out';
    return jsonb_build_object(
      'session', to_jsonb(session_row),
      'events', jsonb_build_array(to_jsonb(clock_in_event), to_jsonb(clock_out_event)),
      'manual_entry', to_jsonb(existing_manual),
      'idempotent_replay', true
    );
  end if;

  if not public.service_actor_can_time_location(
    actor_user_id, target_workspace_id, target_location_id, 'time.amend.location'
  ) then
    raise exception 'location time amendment denied' using errcode = '42501';
  end if;
  if not public.time_employee_has_location(
    target_workspace_id, target_employee_id, target_location_id
  ) then
    raise exception 'employee location assignment required' using errcode = '42501';
  end if;
  if target_ended_at <= target_started_at then
    raise exception 'manual entry end must follow start' using errcode = '22023';
  end if;
  if char_length(btrim(target_reason)) not between 3 and 500 then
    raise exception 'manual entry reason must be between 3 and 500 characters' using errcode = '22023';
  end if;

  insert into public.time_sessions (
    workspace_id, employee_id, location_id, capture_state, started_at, ended_at,
    effective_started_at, effective_ended_at, last_event_at, created_by
  ) values (
    target_workspace_id, target_employee_id, target_location_id, 'complete',
    target_started_at, target_ended_at, target_started_at, target_ended_at,
    target_ended_at, actor_user_id
  ) returning * into session_row;

  insert into public.time_events (
    workspace_id, session_id, employee_id, location_id, event_type, occurred_at,
    actor_user_id, source, idempotency_key
  ) values (
    target_workspace_id, session_row.id, target_employee_id, target_location_id,
    'clock_in', target_started_at, actor_user_id, 'manager', clock_in_key
  ) returning * into clock_in_event;

  insert into public.time_events (
    workspace_id, session_id, employee_id, location_id, event_type, occurred_at,
    actor_user_id, source, idempotency_key
  ) values (
    target_workspace_id, session_row.id, target_employee_id, target_location_id,
    'clock_out', target_ended_at, actor_user_id, 'manager', clock_out_key
  ) returning * into clock_out_event;

  insert into public.time_manual_entries (
    workspace_id, session_id, employee_id, location_id, actor_user_id, reason,
    idempotency_key
  ) values (
    target_workspace_id, session_row.id, target_employee_id, target_location_id,
    actor_user_id, btrim(target_reason), target_idempotency_key
  ) returning * into manual_row;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id, actor_user_id, 'time.manual_session_created',
    'time_session', session_row.id::text,
    jsonb_build_object('manual_entry_id', manual_row.id, 'reason', manual_row.reason)
  );

  return jsonb_build_object(
    'session', to_jsonb(session_row),
    'events', jsonb_build_array(to_jsonb(clock_in_event), to_jsonb(clock_out_event)),
    'manual_entry', to_jsonb(manual_row),
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.manager_time_session_detail_json(uuid) from public, anon, authenticated;
revoke all on function public.get_manager_time_entries_service(uuid, uuid, date, date) from public, anon, authenticated;
revoke all on function public.create_manual_time_session_service(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function public.get_manager_time_entries_service(uuid, uuid, date, date) to service_role;
grant execute on function public.create_manual_time_session_service(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, uuid) to service_role;
