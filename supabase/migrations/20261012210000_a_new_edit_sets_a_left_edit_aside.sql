-- Schedule: a new edit never brings back an edit that was left open (Mert
-- 2026-10-12, "Sor + tek kural"). Ayşe edits Oct 13-19, closes the tab without
-- saving and comes back later: New schedule > Blank opened her old blank edit
-- with its shifts, Edit on the published week opened her old published edit,
-- and only a different source put the work into an "Auto-save" draft.
-- Now a new edit asked for from a menu (resume_open_edit = false) sets aside the
-- person's own edit of the week whose lock ran out, the same way another source
-- already does (D-O9): unsaved work becomes an "Auto-save" draft, and the answer
-- says so (acquired_after_recovery). An edit still open in another tab (its
-- lock is live) is picked up as before.
-- Picking an edit back up (a reload in edit mode, a lapsed lock while the page
-- holds the edit, D-Y3 / D-Y4) keeps resume_open_edit = true, the default.

drop function public.acquire_schedule_edit_session_service(uuid, uuid, date, public.schedule_edit_source, uuid, uuid[]);

create function public.acquire_schedule_edit_session_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_week_start date,
  requested_source public.schedule_edit_source,
  requested_draft_id uuid default null::uuid,
  target_location_ids uuid[] default null::uuid[],
  resume_open_edit boolean default true
) returns jsonb
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  current_week_start date;
  manageable uuid[];
  effective uuid[];
  adding uuid[];
  own_session public.schedule_edit_sessions%rowtype;
  holder public.schedule_edit_sessions%rowtype;
  set_aside public.schedule_edit_sessions%rowtype;
  set_aside_draft_id uuid;
  source_draft public.schedule_drafts%rowtype;
  edit_session_id uuid;
  session_source public.schedule_edit_source;
  session_draft_id uuid;
  recovery_draft_id uuid;
begin
  perform public.availability_lock_workspace(target_workspace_id);

  -- Where this person may edit: the live locations the core gives.
  manageable := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.edit');
  select coalesce(array_agg(location.id order by location.id), '{}') into manageable
  from public.locations location
  where location.workspace_id = target_workspace_id
    and location.archived_at is null
    and location.id = any(manageable);
  select coalesce(array_agg(distinct requested order by requested), '{}') into effective
  from unnest(coalesce(target_location_ids, manageable)) requested
  where requested = any(manageable);
  if cardinality(effective) = 0 then
    -- Nothing here to edit: asked of no place, the core answers with the
    -- person's reason (no permission, blocked) or out_of_scope.
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => array[null]::uuid[]);
  end if;

  -- A past week never opens; "this week" is the one these places are in (S-01).
  current_week_start := public.schedule_current_week_start_service(target_workspace_id, effective);
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
        'Past schedule weeks are read-only.'
      ),
      'current_week_start', current_week_start
    )::text using errcode = 'P0001';
  end if;

  select * into own_session
  from public.schedule_edit_sessions session
  where session.workspace_id = target_workspace_id
    and session.week_start = target_week_start
    and session.holder_user_id = actor_user_id
    and session.status = 'active'
  for update;
  -- The person's own edit reaching a location they no longer edit closes;
  -- they start again where they may (B-3).
  -- Asking for another draft or source of the week puts the open edit aside
  -- the same way (D-O9): it is never resumed in place of what was asked for.
  -- It closes below, once nobody else's edit of the asked draft says no.
  -- A new edit asked for from a menu sets aside an edit that was left open
  -- (its lock ran out): it never comes back in place of a new one.
  if own_session.id is not null
    and (app_private.authz_reason(actor_user_id, target_workspace_id, 'schedule.edit', own_session.location_ids) is not null
      or (not resume_open_edit and own_session.expires_at <= now())
      or own_session.source_kind is distinct from requested_source
      or own_session.source_draft_id is distinct from case when requested_source = 'draft' then requested_draft_id end) then
    set_aside := own_session;
    own_session := null;
  end if;
  adding := array(
    select location_id from unnest(effective) location_id
    where own_session.id is null or not location_id = any(own_session.location_ids)
  );

  if own_session.id is null and requested_source = 'draft' then
    select * into source_draft
    from public.schedule_drafts draft
    where draft.id = requested_draft_id
      and draft.workspace_id = target_workspace_id
      and draft.week_start = target_week_start
      and draft.archived_at is null
      and draft.location_ids && manageable;
    -- A draft touching none of the person's locations is not there for them.
    if source_draft.id is null then
      raise exception 'Not allowed' using errcode = '42501', detail = 'schedule.edit', hint = 'authz.out_of_scope';
    end if;

    -- One person edits a draft at a time: say who, take nothing.
    select * into holder
    from public.schedule_edit_sessions session
    where session.source_draft_id = source_draft.id
      and session.status = 'active'
    for update;
    -- An edit whose holder may no longer edit all of it holds nothing (B-3).
    if holder.id is not null and holder.expires_at > now()
      and app_private.authz_reason(holder.holder_user_id, target_workspace_id, 'schedule.edit', holder.location_ids) is null then
      return jsonb_build_object(
        'status', 'conflict',
        'session_id', holder.id,
        'holder_name', coalesce((
          select profile.display_name from public.user_profiles profile
          where profile.user_id = holder.holder_user_id
        ), 'Another manager'),
        'last_heartbeat', holder.last_heartbeat,
        'expires_at', holder.expires_at
      );
    end if;

    -- An expired edit of the draft closes; unsaved work becomes a recovery draft.
    -- ponytail: if the person's own edit is put aside too, the answer names only this one.
    if holder.id is not null then
      recovery_draft_id := app_private.close_schedule_edit_session(holder);
    end if;
  end if;

  if set_aside.id is not null and set_aside.id is distinct from holder.id then
    -- Closed always; the answer names the other editor's draft first.
    set_aside_draft_id := app_private.close_schedule_edit_session(set_aside);
    recovery_draft_id := coalesce(recovery_draft_id, set_aside_draft_id);
  end if;

  if own_session.id is not null then
    -- BL-069: the same person picks their edit back up, widened to the new locations.
    update public.schedule_edit_sessions
    set last_heartbeat = now(),
        expires_at = now() + interval '4 minutes',
        location_ids = array(
          select distinct location_id from unnest(own_session.location_ids || adding) location_id
          order by location_id
        ),
        base_publication_ids = own_session.base_publication_ids || app_private.schedule_edit_starting_point(
          target_workspace_id, target_week_start, adding, own_session.source_draft_id
        )
    where id = own_session.id;
    edit_session_id := own_session.id;
    session_source := own_session.source_kind;
    session_draft_id := own_session.source_draft_id;
  else
    insert into public.schedule_edit_sessions (
      workspace_id, week_start, source_kind, source_draft_id, source_revision,
      holder_user_id, location_ids, base_publication_ids
    ) values (
      target_workspace_id, target_week_start, requested_source,
      case when requested_source = 'draft' then source_draft.id end,
      case when requested_source = 'draft' then source_draft.revision else 0 end,
      actor_user_id, effective,
      app_private.schedule_edit_starting_point(target_workspace_id, target_week_start, effective, source_draft.id)
    ) returning id into edit_session_id;
    session_source := requested_source;
    session_draft_id := source_draft.id;
  end if;

  -- The shifts the edit is opened or widened with are not a step of it, and
  -- do not push its oldest step out (EKRAN-01 #12).
  perform set_config('app.schedule_edit_widening', 'on', true);
  if session_source = 'published' then
    insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, label_ids, label_names)
    select shift.source_shift_id, shift.workspace_id, edit_session_id, shift.location_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.label_ids, shift.label_names
    from public.schedule_published_shifts shift
    join public.schedule_location_publications publication on publication.id = shift.publication_id
    where shift.workspace_id = target_workspace_id
      and publication.week_start = target_week_start
      and publication.status = 'current'
      and shift.location_id = any(adding);
  elsif session_source = 'draft' then
    insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision, label_ids, label_names)
    select shift.id, shift.workspace_id, edit_session_id, shift.location_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.revision, shift.label_ids, shift.label_names
    from public.schedule_draft_shifts shift
    where shift.draft_id = session_draft_id
      and shift.location_id = any(adding);
  end if;

  perform set_config('app.schedule_edit_widening', '', true);

  return jsonb_build_object(
    'status', case
      when own_session.id is not null then 'resumed'
      when recovery_draft_id is not null then 'acquired_after_recovery'
      else 'acquired'
    end,
    'session', public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, edit_session_id),
    'recovered_draft_id', recovery_draft_id,
    'recovered_draft_name', (select draft.name from public.schedule_drafts draft where draft.id = recovery_draft_id)
  );
end;
$$;

revoke all on function public.acquire_schedule_edit_session_service(uuid, uuid, date, public.schedule_edit_source, uuid, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.acquire_schedule_edit_session_service(uuid, uuid, date, public.schedule_edit_source, uuid, uuid[], boolean) to service_role;
