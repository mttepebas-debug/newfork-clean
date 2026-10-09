create or replace function public.acquire_schedule_edit_session_service(
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
  existing_session public.schedule_edit_sessions%rowtype;
  source_draft public.schedule_drafts%rowtype;
  new_session_id uuid;
  recovery_draft_id uuid;
  holder_label text;
begin
  if not public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id) then
    raise exception 'schedule manage access denied' using errcode = '42501';
  end if;

  select * into existing_session
  from public.schedule_edit_sessions session
  where session.workspace_id = target_workspace_id
    and session.week_start = target_week_start and session.status = 'active'
  for update;

  if existing_session.id is not null then
    if existing_session.holder_user_id = actor_user_id then
      return jsonb_build_object(
        'status', 'resumed',
        'session', public.get_schedule_edit_session_service(
          actor_user_id, target_workspace_id, existing_session.id
        )
      );
    end if;
    if existing_session.expires_at > now() then
      select profile.display_name into holder_label
      from public.user_profiles profile where profile.user_id = existing_session.holder_user_id;
      return jsonb_build_object(
        'status', 'conflict',
        'session_id', existing_session.id,
        'holder_name', coalesce(holder_label, 'Another manager'),
        'last_heartbeat', existing_session.last_heartbeat,
        'expires_at', existing_session.expires_at
      );
    end if;

    if existing_session.dirty then
      insert into public.schedule_drafts (
        workspace_id, week_start, name, created_by, updated_by
      ) values (
        target_workspace_id, target_week_start,
        'Recovered edit ' || to_char(now(), 'YYYY-MM-DD HH24:MI'),
        existing_session.holder_user_id, existing_session.holder_user_id
      ) returning id into recovery_draft_id;
      insert into public.schedule_draft_shifts (
        id, workspace_id, draft_id, location_id, employee_id, job_id,
        shift_type_id, scheduled_date, start_time, end_time, unpaid_break_minutes, note, revision
      )
      select id, workspace_id, recovery_draft_id, location_id, employee_id, job_id,
        shift_type_id, scheduled_date, start_time, end_time, unpaid_break_minutes, note, revision
      from public.schedule_edit_session_shifts
      where session_id = existing_session.id;
    end if;
    update public.schedule_edit_sessions
    set status = case
        when recovery_draft_id is null then 'expired'::public.schedule_edit_session_status
        else 'recovered'::public.schedule_edit_session_status
      end,
      recovered_draft_id = recovery_draft_id, closed_at = now()
    where id = existing_session.id;
  end if;

  if requested_source = 'draft' then
    select * into source_draft
    from public.schedule_drafts draft
    where draft.id = requested_draft_id and draft.workspace_id = target_workspace_id
      and draft.week_start = target_week_start and draft.archived_at is null;
    if source_draft.id is null then
      raise exception 'draft not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.schedule_edit_sessions (
    workspace_id, week_start, source_kind, source_draft_id, source_revision,
    holder_user_id
  ) values (
    target_workspace_id, target_week_start, requested_source,
    case when requested_source = 'draft' then source_draft.id else null end,
    case when requested_source = 'draft' then source_draft.revision else 0 end,
    actor_user_id
  ) returning id into new_session_id;

  if requested_source = 'published' then
    insert into public.schedule_edit_session_shifts (
      id, workspace_id, session_id, location_id, employee_id, job_id,
      shift_type_id, scheduled_date, start_time, end_time, unpaid_break_minutes, note
    )
    select shift.source_shift_id, shift.workspace_id, new_session_id,
      shift.location_id, shift.employee_id, shift.job_id, shift.shift_type_id,
      shift.scheduled_date, shift.start_time, shift.end_time, shift.unpaid_break_minutes, shift.note
    from public.schedule_published_shifts shift
    join public.schedule_location_publications publication on publication.id = shift.publication_id
    where shift.workspace_id = target_workspace_id
      and publication.week_start = target_week_start and publication.status = 'current'
      and public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, shift.location_id);
  elsif requested_source = 'draft' then
    insert into public.schedule_edit_session_shifts (
      id, workspace_id, session_id, location_id, employee_id, job_id,
      shift_type_id, scheduled_date, start_time, end_time, unpaid_break_minutes, note, revision
    )
    select shift.id, shift.workspace_id, new_session_id, shift.location_id,
      shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date,
      shift.start_time, shift.end_time, shift.unpaid_break_minutes, shift.note, shift.revision
    from public.schedule_draft_shifts shift
    where shift.draft_id = source_draft.id
      and public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, shift.location_id);
  end if;

  return jsonb_build_object(
    'status', case when recovery_draft_id is null then 'acquired' else 'acquired_after_recovery' end,
    'session', public.get_schedule_edit_session_service(
      actor_user_id, target_workspace_id, new_session_id
    ),
    'recovered_draft_id', recovery_draft_id
  );
end;
$$;

create function public.takeover_schedule_edit_session_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  target_session public.schedule_edit_sessions%rowtype;
begin
  if not exists (
    select 1
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    join public.workspace_role_permissions permission
      on permission.role_id = role.id and permission.workspace_id = role.workspace_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
      and role.access_class in ('owner', 'admin')
      and permission.permission_key = 'schedule.manage'
  ) then
    raise exception 'schedule takeover access denied' using errcode='42501';
  end if;

  select * into target_session
    from public.schedule_edit_sessions session
   where session.id = target_session_id
     and session.workspace_id = target_workspace_id
     and session.status = 'active'
   for update;

  if target_session.id is null then
    raise exception 'edit session not found' using errcode='P0002';
  end if;

  update public.schedule_edit_sessions
     set holder_user_id = actor_user_id,
         last_heartbeat = now(),
         expires_at = now() + interval '4 minutes'
   where id = target_session_id
     and workspace_id = target_workspace_id;

  return jsonb_build_object(
    'status', 'acquired',
    'session', public.get_schedule_edit_session_service(
      actor_user_id,
      target_workspace_id,
      target_session_id
    )
  );
end;
$$;

revoke all on function public.acquire_schedule_edit_session_service(
  uuid,
  uuid,
  date,
  public.schedule_edit_source,
  uuid
) from public, anon, authenticated;
revoke all on function public.takeover_schedule_edit_session_service(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;

grant execute on function public.acquire_schedule_edit_session_service(
  uuid,
  uuid,
  date,
  public.schedule_edit_source,
  uuid
) to service_role;
grant execute on function public.takeover_schedule_edit_session_service(
  uuid,
  uuid,
  uuid
) to service_role;
