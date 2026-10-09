create or replace function public.schedule_pending_op_payload_json(
  target_shift public.schedule_edit_session_shifts
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'scheduled_date', target_shift.scheduled_date,
    'start_time', to_char(target_shift.start_time, 'HH24:MI'),
    'end_time', to_char(target_shift.end_time, 'HH24:MI'),
    'unpaid_break_minutes', coalesce(target_shift.unpaid_break_minutes, 0),
    'location_id', target_shift.location_id,
    'employee_id', target_shift.employee_id,
    'job_id', target_shift.job_id,
    'shift_type_id', target_shift.shift_type_id,
    'source_published_shift_id', target_shift.source_published_shift_id,
    'note', target_shift.note
  ));
$$;

create or replace function public.list_schedule_pending_ops_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_week_start date,
  target_location_ids uuid[] default null,
  target_draft_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'pending_ops',
    coalesce(jsonb_agg(jsonb_build_object(
      'id', shift.id,
      'location_id', shift.location_id,
      'week_start', session.week_start,
      'op_type', shift.pending_op_type,
      'target_shift_id', shift.source_published_shift_id,
      'target_draft_id', session.source_draft_id,
      'payload', public.schedule_pending_op_payload_json(shift),
      'created_by', session.holder_user_id,
      'created_at', shift.created_at,
      'updated_at', shift.updated_at
    ) order by shift.updated_at asc, shift.id asc), '[]'::jsonb)
  )
  from public.schedule_edit_sessions session
  join public.schedule_edit_session_shifts shift
    on shift.session_id = session.id
   and shift.workspace_id = session.workspace_id
  where session.workspace_id = target_workspace_id
    and session.week_start = target_week_start
    and session.status = 'active'
    and shift.pending_op_type is not null
    and (
      target_draft_id is null
      or session.source_draft_id = target_draft_id
    )
    and (
      target_location_ids is null
      or cardinality(target_location_ids) = 0
      or shift.location_id = any(target_location_ids)
    )
    and public.schedule_actor_can_manage_service(
      actor_user_id,
      target_workspace_id,
      shift.location_id
    );
$$;

create or replace function public.add_schedule_pending_op_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid,
  target_op_type text,
  target_shift_id uuid default null,
  target_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  target_session public.schedule_edit_sessions%rowtype;
  existing_shift public.schedule_edit_session_shifts%rowtype;
  created_id uuid := gen_random_uuid();
  next_location_id uuid;
  next_employee_id uuid;
  next_job_id uuid;
  next_shift_type_id uuid;
  next_scheduled_date date;
  next_start_time time;
  next_end_time time;
  next_unpaid_break_minutes integer;
  next_note text;
begin
  if target_op_type not in ('create', 'update', 'delete') then
    raise exception 'invalid pending op type' using errcode='22023';
  end if;

  select * into target_session
    from public.schedule_edit_sessions session
   where session.id = target_session_id
     and session.workspace_id = target_workspace_id
   for update;

  if target_session.id is null or target_session.holder_user_id <> actor_user_id then
    raise exception 'edit session not found' using errcode='P0002';
  end if;
  if target_session.status <> 'active' or target_session.expires_at <= now() then
    raise exception 'edit lease expired' using errcode='40001';
  end if;

  if target_op_type in ('update', 'delete') then
    select * into existing_shift
      from public.schedule_edit_session_shifts shift
     where shift.session_id = target_session_id
       and shift.id = target_shift_id
     for update;
    if existing_shift.id is null then
      raise exception 'shift not found' using errcode='P0002';
    end if;
  end if;

  next_location_id := coalesce(
    nullif(target_payload->>'location_id', '')::uuid,
    existing_shift.location_id
  );
  if not public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, next_location_id) then
    raise exception 'schedule pending-op scope denied' using errcode='42501';
  end if;

  if target_op_type = 'create' then
    insert into public.schedule_edit_session_shifts(
      id, workspace_id, session_id, location_id, employee_id, job_id,
      shift_type_id, scheduled_date, start_time, end_time,
      unpaid_break_minutes, note, pending_op_type, locked
    )
    values (
      created_id,
      target_workspace_id,
      target_session_id,
      next_location_id,
      nullif(target_payload->>'employee_id', '')::uuid,
      nullif(target_payload->>'job_id', '')::uuid,
      nullif(target_payload->>'shift_type_id', '')::uuid,
      (target_payload->>'scheduled_date')::date,
      (target_payload->>'start_time')::time,
      (target_payload->>'end_time')::time,
      coalesce((target_payload->>'unpaid_break_minutes')::integer, 0),
      coalesce(target_payload->>'note', ''),
      'create',
      false
    );
  else
    if target_op_type = 'delete' then
      update public.schedule_edit_session_shifts
         set pending_op_type = 'delete',
             locked = true,
             revision = revision + 1,
             updated_at = now()
       where session_id = target_session_id
         and id = existing_shift.id;
    else
      next_employee_id := coalesce(nullif(target_payload->>'employee_id', '')::uuid, existing_shift.employee_id);
      next_job_id := coalesce(nullif(target_payload->>'job_id', '')::uuid, existing_shift.job_id);
      next_shift_type_id := coalesce(nullif(target_payload->>'shift_type_id', '')::uuid, existing_shift.shift_type_id);
      next_scheduled_date := coalesce((target_payload->>'scheduled_date')::date, existing_shift.scheduled_date);
      next_start_time := coalesce((target_payload->>'start_time')::time, existing_shift.start_time);
      next_end_time := coalesce((target_payload->>'end_time')::time, existing_shift.end_time);
      next_unpaid_break_minutes := coalesce((target_payload->>'unpaid_break_minutes')::integer, existing_shift.unpaid_break_minutes, 0);
      next_note := coalesce(target_payload->>'note', existing_shift.note, '');

      update public.schedule_edit_session_shifts
         set location_id = next_location_id,
             employee_id = next_employee_id,
             job_id = next_job_id,
             shift_type_id = next_shift_type_id,
             scheduled_date = next_scheduled_date,
             start_time = next_start_time,
             end_time = next_end_time,
             unpaid_break_minutes = next_unpaid_break_minutes,
             note = next_note,
             pending_op_type = 'update',
             locked = false,
             revision = revision + 1,
             updated_at = now()
       where session_id = target_session_id
         and id = existing_shift.id;
    end if;
    created_id := existing_shift.id;
  end if;

  update public.schedule_edit_sessions
     set revision = revision + 1,
         dirty = true,
         last_heartbeat = now(),
         expires_at = now() + interval '4 minutes'
   where id = target_session_id;

  return jsonb_build_object('status', 'ok', 'op_id', created_id);
end;
$$;

create or replace function public.update_schedule_pending_op_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_op_id uuid,
  target_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  target_session public.schedule_edit_sessions%rowtype;
  target_shift public.schedule_edit_session_shifts%rowtype;
begin
  select session.* into target_session
    from public.schedule_edit_sessions session
    join public.schedule_edit_session_shifts shift on shift.session_id = session.id
   where session.workspace_id = target_workspace_id
     and shift.id = target_op_id
     and session.status = 'active'
   for update of session;

  select shift.* into target_shift
    from public.schedule_edit_session_shifts shift
   where shift.session_id = target_session.id
     and shift.id = target_op_id
   for update;

  if target_session.id is null or target_session.holder_user_id <> actor_user_id then
    raise exception 'pending op not found' using errcode='P0002';
  end if;
  if target_shift.pending_op_type is null then
    raise exception 'pending op not found' using errcode='P0002';
  end if;

  perform public.add_schedule_pending_op_service(
    actor_user_id,
    target_workspace_id,
    target_session.id,
    target_shift.pending_op_type,
    target_op_id,
    public.schedule_pending_op_payload_json(target_shift) || target_payload
  );
  return jsonb_build_object('status', 'ok', 'op_id', target_op_id);
end;
$$;

create or replace function public.remove_schedule_pending_op_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_op_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  target_session public.schedule_edit_sessions%rowtype;
  target_shift public.schedule_edit_session_shifts%rowtype;
begin
  select session.* into target_session
    from public.schedule_edit_sessions session
    join public.schedule_edit_session_shifts shift on shift.session_id = session.id
   where session.workspace_id = target_workspace_id
     and shift.id = target_op_id
     and session.status = 'active'
   for update of session;

  select shift.* into target_shift
    from public.schedule_edit_session_shifts shift
   where shift.session_id = target_session.id
     and shift.id = target_op_id
   for update;

  if target_session.id is null or target_session.holder_user_id <> actor_user_id then
    raise exception 'pending op not found' using errcode='P0002';
  end if;
  if not public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, target_shift.location_id) then
    raise exception 'schedule pending-op scope denied' using errcode='42501';
  end if;

  if target_shift.pending_op_type = 'create' then
    delete from public.schedule_edit_session_shifts
     where session_id = target_session.id
       and id = target_op_id;
  else
    update public.schedule_edit_session_shifts
       set pending_op_type = null,
           locked = target_shift.source_published_shift_id is not null,
           revision = revision + 1,
           updated_at = now()
     where session_id = target_session.id
       and id = target_op_id;
  end if;

  update public.schedule_edit_sessions
     set revision = revision + 1,
         dirty = true,
         last_heartbeat = now(),
         expires_at = now() + interval '4 minutes'
   where id = target_session.id;

  return jsonb_build_object('status', 'ok', 'op_id', target_op_id);
end;
$$;

create or replace function public.get_schedule_publication_status_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_week_start date
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'week_start', target_week_start,
    'week_end', target_week_start + 6,
    'week_start_day', coalesce(settings.week_start_day, 'monday'::public.schedule_week_start),
    'schedule_deadline_day', coalesce(settings.schedule_deadline_day, 'sunday'::public.schedule_deadline_day),
    'is_anchor_only', false,
    'locations', coalesce(jsonb_agg(jsonb_build_object(
      'id', location.id,
      'name', location.name,
      'color', null,
      'timezone', location.timezone,
      'status', case
        when publication.id is not null and published_counts.shift_count > 0 then 'published'
        else 'unpublished'
      end,
      'reason', case
        when publication.id is not null and published_counts.shift_count > 0 then 'active_publication_and_shifts'
        when publication.id is not null then 'no_published_shifts'
        else 'missing_publication'
      end,
      'publication_includes_location', publication.id is not null,
      'published_shift_count', coalesce(published_counts.shift_count, 0),
      'worked_shift_count', 0,
      'draft_shift_count', coalesce(draft_counts.shift_count, 0),
      'published_at', publication.published_at,
      'published_by_name', null
    ) order by location.sort_order, location.name), '[]'::jsonb)
  )
  from public.workspace_scheduling_settings settings
  right join public.locations location
    on location.workspace_id = target_workspace_id
   and location.archived_at is null
  left join public.schedule_location_publications publication
    on publication.workspace_id = target_workspace_id
   and publication.location_id = location.id
   and publication.week_start = target_week_start
   and publication.status = 'current'
  left join lateral (
    select count(*)::integer as shift_count
      from public.schedule_published_shifts shift
     where shift.publication_id = publication.id
  ) published_counts on true
  left join lateral (
    select count(*)::integer as shift_count
      from public.schedule_draft_shifts shift
      join public.schedule_drafts draft
        on draft.id = shift.draft_id
       and draft.workspace_id = shift.workspace_id
     where shift.workspace_id = target_workspace_id
       and shift.location_id = location.id
       and draft.week_start = target_week_start
       and draft.archived_at is null
  ) draft_counts on true
  where settings.workspace_id = target_workspace_id
    and public.schedule_actor_has_capability_service(
      actor_user_id,
      target_workspace_id,
      'schedule.read'
    )
    and public.schedule_actor_can_manage_service(
      actor_user_id,
      target_workspace_id,
      location.id
    )
  group by settings.week_start_day, settings.schedule_deadline_day;
$$;

revoke all on function public.schedule_pending_op_payload_json(public.schedule_edit_session_shifts) from public, anon, authenticated;
revoke all on function public.list_schedule_pending_ops_service(uuid, uuid, date, uuid[], uuid) from public, anon, authenticated;
revoke all on function public.add_schedule_pending_op_service(uuid, uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.update_schedule_pending_op_service(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.remove_schedule_pending_op_service(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_schedule_publication_status_service(uuid, uuid, date) from public, anon, authenticated;

grant execute on function public.list_schedule_pending_ops_service(uuid, uuid, date, uuid[], uuid) to service_role;
grant execute on function public.add_schedule_pending_op_service(uuid, uuid, uuid, text, uuid, jsonb) to service_role;
grant execute on function public.update_schedule_pending_op_service(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.remove_schedule_pending_op_service(uuid, uuid, uuid) to service_role;
grant execute on function public.get_schedule_publication_status_service(uuid, uuid, date) to service_role;
