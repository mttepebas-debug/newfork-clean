-- EKRAN-01 DB-1b (S1, D-O9, D-Y5, D-O6, BL-224): an edit that ends keeps its
-- work, and each manager sees only their own unsaved changes.
--
-- * "Keep editing?" ran out (KARARLAR Schedule "Hareketsizlik"): the screen
--   calls autosave_schedule_edit_session_service; the unsaved shifts wait in a
--   draft named "Auto-save · Ayşe Yılmaz · Oct 5, 9:14 PM" and the lock is let
--   go. Nothing of the edit is deleted.
-- * Every closed edit's draft carries that name (KK-162): a lease that ran out
--   when somebody opens the draft, an editor who lost a location, and the
--   person's own edit when they ask for another draft or source of the same
--   week (before, the old edit was resumed silently). The open answer names
--   the draft (recovered_draft_name).
-- * Unsaved changes on a published week are listed for their own editor only
--   (D-Y5); the owner editing the same week no longer gets Ayşe's.
-- * A draft somebody is editing is not deleted under them: PT409 +
--   schedule.draft_being_edited. Once their lease ran out, deleting closes
--   their edit first (Auto-save), so their next save is not "draft revision
--   stale" for ever (D-O6).
-- * A draft's live locations (archived and deleted left out, KARARLAR Q-B/Q-C) come
--   from one helper, for deleting and for saving into it (BL-224).
-- * Discard and the pending-change commands ask the core for the edit's
--   locations, like heartbeat, read and save (DB-1a review finding 1).

create function app_private.live_draft_locations(w uuid, locs uuid[])
returns uuid[]
language sql
stable
set search_path to ''
as $function$
  -- KARARLAR Q-B, Q-C: an archived or deleted location no longer counts for
  -- the draft; live is what the core calls live.
  select array(select place from unnest(locs) place
    where exists (select 1 from public.locations location
      where location.id = place and location.workspace_id = w and app_private.location_is_live(location)))
$function$;
revoke all on function app_private.live_draft_locations(uuid, uuid[]) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.close_schedule_edit_session(edit schedule_edit_sessions)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare recovery_draft_id uuid; base_name text; draft_name text; copy integer := 1;
begin
  -- Unsaved work becomes a recovery draft; nothing of it is deleted.
  if edit.dirty then
    -- KK-162: "Auto-save · Ayşe Yılmaz · Oct 5, 9:14 PM", in the edit's
    -- location's time and the workspace's 12/24-hour clock.
    base_name := 'Auto-save · ' || left(coalesce(nullif(btrim((select profile.display_name from public.user_profiles profile
        where profile.user_id = edit.holder_user_id)), ''), 'Manager'), 40)
      || ' · ' || to_char(now() at time zone coalesce((select location.timezone from public.locations location
          where location.id = any(edit.location_ids) order by location.name, location.id limit 1), 'UTC'),
        case when (select settings.time_format from public.workspace_scheduling_settings settings
          where settings.workspace_id = edit.workspace_id) = '24h' then 'Mon FMDD, HH24:MI' else 'Mon FMDD, FMHH12:MI AM' end);
    draft_name := base_name;
    -- ponytail: names are unique in a week; count up until one is free.
    while exists (select 1 from public.schedule_drafts draft
      where draft.workspace_id = edit.workspace_id and draft.week_start = edit.week_start
        and draft.archived_at is null and lower(btrim(draft.name)) = lower(btrim(draft_name))) loop
      copy := copy + 1;
      draft_name := base_name || ' (' || copy || ')';
    end loop;
    insert into public.schedule_drafts (
      workspace_id, week_start, name, created_by, updated_by, location_ids, base_publication_ids
    ) values (
      edit.workspace_id, edit.week_start, draft_name,
      edit.holder_user_id, edit.holder_user_id, edit.location_ids, edit.base_publication_ids
    ) returning id into recovery_draft_id;
    insert into public.schedule_draft_shifts (id, workspace_id, draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision, label_ids, label_names)
    select id, workspace_id, recovery_draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision, label_ids, label_names
    from public.schedule_edit_session_shifts
    -- A shift the person took off stays off, as when they save.
    where session_id = edit.id and pending_op_type is distinct from 'delete';
  end if;
  update public.schedule_edit_sessions
  set status = case when recovery_draft_id is null then 'expired'::public.schedule_edit_session_status
                    else 'recovered'::public.schedule_edit_session_status end,
      recovered_draft_id = recovery_draft_id,
      closed_at = now()
  where id = edit.id;
  return recovery_draft_id;
end;
$function$
;

create function public.autosave_schedule_edit_session_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  edit public.schedule_edit_sessions%rowtype;
  saved_draft_id uuid;
begin
  -- "Keep editing?" ran out (KARARLAR Schedule "Hareketsizlik"): the unsaved
  -- work goes to an Auto-save draft and the lock is let go.
  perform public.availability_lock_workspace(target_workspace_id);
  select * into edit from public.schedule_edit_sessions session
  where session.id = target_session_id and session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id and session.status = 'active'
  for update;
  if edit.id is null then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => edit.location_ids);
  saved_draft_id := app_private.close_schedule_edit_session(edit);
  return jsonb_build_object(
    'status', case when saved_draft_id is null then 'nothing_to_save' else 'saved' end,
    'draft_id', saved_draft_id,
    'draft_name', (select draft.name from public.schedule_drafts draft where draft.id = saved_draft_id));
end;
$function$;
revoke all on function public.autosave_schedule_edit_session_service(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.autosave_schedule_edit_session_service(uuid, uuid, uuid) to service_role;

CREATE OR REPLACE FUNCTION public.acquire_schedule_edit_session_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date, requested_source schedule_edit_source, requested_draft_id uuid DEFAULT NULL::uuid, target_location_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  current_week_start := public.schedule_current_week_start_service(target_workspace_id);
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
  if own_session.id is not null
    and (app_private.authz_reason(actor_user_id, target_workspace_id, 'schedule.edit', own_session.location_ids) is not null
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
$function$
;

CREATE OR REPLACE FUNCTION public.save_schedule_edit_session_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, expected_session_revision integer, target_name text, target_draft_id uuid DEFAULT NULL::uuid, expected_draft_revision integer DEFAULT NULL::integer, acknowledge_past_edits boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_session public.schedule_edit_sessions%rowtype;
  saved_draft public.schedule_drafts%rowtype;
  reach uuid[];
  current_week_start date;
  findings jsonb := '[]'::jsonb;
  blocked_findings jsonb := '[]'::jsonb;
  warning_findings jsonb := '[]'::jsonb;
  session_labels jsonb;
  result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));
  perform public.shift_exchange_assert_session(target_workspace_id,target_session_id);

  -- a. A past week never changes; a shift that already started changes only
  -- when the person says they know.
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
  -- The edit's locations are still the person's to edit (B-3), and the draft
  -- it writes into is the one it was opened from, a new one, or one the core
  -- lets the person write at all its locations (B-1).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => target_session.location_ids);
  if target_draft_id is distinct from target_session.source_draft_id and target_draft_id is not null then
    select * into saved_draft from public.schedule_drafts draft
    where draft.id = target_draft_id and draft.workspace_id = target_workspace_id
      and draft.week_start = target_session.week_start and draft.archived_at is null;
    if saved_draft.id is null then
      raise exception 'Not allowed' using errcode = '42501', detail = 'schedule.edit', hint = 'authz.out_of_scope';
    end if;
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit',
      target_locations => app_private.live_draft_locations(target_workspace_id, saved_draft.location_ids));
    saved_draft := null;
  end if;

  reach := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.edit');
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
      and shift.location_id = any(reach);

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
      and shift.location_id = any(reach)
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
          || ' is in a past week and cannot change.'
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

  -- b. The labels, kept aside: the draft rows are written fresh.
  perform public.availability_lock_workspace(target_workspace_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', shift.id,
    'label_ids', to_jsonb(coalesce(shift.label_ids, '{}'::uuid[])),
    'label_names', to_jsonb(coalesce(shift.label_names, '{}'::text[]))
  )), '[]'::jsonb)
  into session_labels
  from public.schedule_edit_session_shifts shift
  join public.schedule_edit_sessions session
    on session.id = shift.session_id
   and session.workspace_id = shift.workspace_id
  where shift.session_id = target_session_id
    and shift.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id;

  -- c. Pending deletes go, then the draft is written.
  delete from public.schedule_edit_session_shifts shift
  using public.schedule_edit_sessions session
  where session.id = target_session_id
    and session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id
    and session.status = 'active'
    and shift.session_id = session.id
    and shift.pending_op_type = 'delete';

  begin
    select * into target_session from public.schedule_edit_sessions session
    where session.id = target_session_id and session.workspace_id = target_workspace_id
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
    if char_length(btrim(target_name)) not between 1 and 80 then
      raise exception 'invalid draft name' using errcode = '22023';
    end if;

    if target_draft_id is null then
      insert into public.schedule_drafts (
        workspace_id, week_start, name, created_by, updated_by, location_ids, base_publication_ids
      ) values (
        target_workspace_id, target_session.week_start, btrim(target_name),
        actor_user_id, actor_user_id, target_session.location_ids, target_session.base_publication_ids
      ) returning * into saved_draft;
    else
      update public.schedule_drafts draft
      set name = btrim(target_name), revision = revision + 1,
        updated_by = actor_user_id, updated_at = now(),
        location_ids = array(
          select distinct location_id from unnest(draft.location_ids || target_session.location_ids) location_id
          order by location_id
        ),
        -- The edit's locations now start where the edit started.
        base_publication_ids = array(
          select base_id from unnest(draft.base_publication_ids) base_id
          where not exists (
            select 1 from public.schedule_location_publications publication
            where publication.id = base_id
              and publication.location_id = any(target_session.location_ids)
          )
        ) || target_session.base_publication_ids
      where draft.id = target_draft_id and draft.workspace_id = target_workspace_id
        and draft.week_start = target_session.week_start and draft.archived_at is null
        and draft.revision = expected_draft_revision
      returning * into saved_draft;
      if saved_draft.id is null then
        raise exception 'draft revision stale' using errcode = '40001';
      end if;
    end if;

    -- BL-097: only the locations this session holds are replaced; the rest of
    -- the draft stays as it was.
    delete from public.schedule_draft_shifts shift
    where shift.draft_id = saved_draft.id
      and shift.location_id = any(target_session.location_ids);
    insert into public.schedule_draft_shifts (id, workspace_id, draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision)
    select shift.id, shift.workspace_id, saved_draft.id, shift.location_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.revision from public.schedule_edit_session_shifts shift
    where shift.session_id = target_session_id;

    delete from public.schedule_edit_session_shifts where session_id = target_session_id;
    update public.schedule_edit_sessions
    set status = 'saved', dirty = false, closed_at = now(), expires_at = now()
    where id = target_session_id;

    result := jsonb_build_object(
      'id', saved_draft.id, 'workspace_id', saved_draft.workspace_id,
      'week_start', saved_draft.week_start, 'name', saved_draft.name,
      'revision', saved_draft.revision, 'created_by', saved_draft.created_by,
      'updated_by', saved_draft.updated_by, 'created_at', saved_draft.created_at,
      'updated_at', saved_draft.updated_at
    );
  exception
    when unique_violation then
      raise exception 'draft name conflict' using errcode = '23505';
  end;

  -- d. The labels back on the draft rows.
  update public.schedule_draft_shifts draft_shift
     set label_ids = coalesce(label_row.label_ids, '{}'::uuid[]),
         label_names = coalesce(label_row.label_names, '{}'::text[])
    from jsonb_to_recordset(session_labels) as label_row(
      id uuid,
      label_ids uuid[],
      label_names text[]
    )
   where draft_shift.draft_id = saved_draft.id
     and draft_shift.id = label_row.id
     and draft_shift.workspace_id = target_workspace_id;

  return result;
exception when serialization_failure then raise exception '%',SQLERRM using errcode='PT409';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_schedule_draft_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_draft public.schedule_drafts%rowtype;
  editing public.schedule_edit_sessions%rowtype;
begin
  -- The lock opening and saving an edit take, in the same order.
  perform public.availability_lock_workspace(target_workspace_id);
  select * into target_draft
  from public.schedule_drafts draft
  where draft.id = target_draft_id
    and draft.workspace_id = target_workspace_id
    and draft.archived_at is null
  for update;

  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => case
    when target_draft.id is null then null
    else app_private.live_draft_locations(target_workspace_id, target_draft.location_ids)
  end);

  -- Not under somebody who is editing it (D-O6); an edit whose lease ran out
  -- is closed first, its unsaved work to an Auto-save draft.
  select * into editing from public.schedule_edit_sessions session
  where session.source_draft_id = target_draft_id and session.status = 'active'
  for update;
  if editing.id is not null and editing.expires_at > now()
    and app_private.authz_reason(editing.holder_user_id, target_workspace_id, 'schedule.edit', editing.location_ids) is null then
    raise exception 'draft is being edited' using errcode = 'PT409', hint = 'schedule.draft_being_edited';
  end if;
  if editing.id is not null then
    perform app_private.close_schedule_edit_session(editing);
  end if;

  -- Published shifts are independent snapshots. Archiving the named draft only
  -- hides the editable copy; retain its row and source links for publication history.
  update public.schedule_drafts
     set archived_at = now(),
         updated_by = actor_user_id,
         updated_at = now()
   where id = target_draft_id
     and workspace_id = target_workspace_id;

  return jsonb_build_object(
    'status', 'deleted',
    'draft_id', target_draft_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_schedule_pending_ops_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date, target_location_ids uuid[] DEFAULT NULL::uuid[], target_draft_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- Each manager's own unsaved changes only (D-Y5).
    and session.holder_user_id = actor_user_id
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
    and shift.location_id = any ((select app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.edit'))::uuid[]);
$function$
;

CREATE OR REPLACE FUNCTION public.add_schedule_pending_op_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, target_op_type text, target_shift_id uuid DEFAULT NULL::uuid, target_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 perform public.availability_lock_workspace(target_workspace_id);
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
  -- The edit's locations are still the person's to edit (B-3).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => target_session.location_ids);

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
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit',
    target_locations => case when next_location_id is not null then array(
      select distinct place from unnest(array[existing_shift.location_id, next_location_id]) place where place is not null
    ) end);

  if target_op_type in ('create','update') then
    target_payload:=public.normalize_schedule_time_source(target_workspace_id,case when target_payload ? 'time_basis' then coalesce(to_jsonb(existing_shift),'{}'::jsonb)||target_payload else (coalesce(to_jsonb(existing_shift),'{}'::jsonb)||target_payload)-'time_basis' end,case when existing_shift.id is not null then to_jsonb(existing_shift) else null end);
  end if;
  if target_op_type = 'create' then
    insert into public.schedule_edit_session_shifts(id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, note, pending_op_type, locked, hide_time_on_badge)
    values (created_id, target_workspace_id, target_session_id, next_location_id, nullif(target_payload->>'employee_id', '')::uuid, nullif(target_payload->>'job_id', '')::uuid, nullif(target_payload->>'shift_type_id', '')::uuid, (target_payload->>'scheduled_date')::date, nullif(target_payload->>'start_time','')::time, nullif(target_payload->>'end_time','')::time, target_payload->>'time_basis', target_payload->'time_snapshot', target_payload->>'time_timezone', coalesce((target_payload->>'unpaid_break_minutes')::integer, 0), coalesce(target_payload->>'note', ''), 'create', false, coalesce((target_payload->>'hide_time_on_badge')::boolean,false));
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
      next_start_time := nullif(target_payload->>'start_time','')::time;
      next_end_time := nullif(target_payload->>'end_time','')::time;
      next_unpaid_break_minutes := coalesce((target_payload->>'unpaid_break_minutes')::integer, existing_shift.unpaid_break_minutes, 0);
      next_note := coalesce(target_payload->>'note', existing_shift.note, '');

      update public.schedule_edit_session_shifts
         set location_id = next_location_id,
             employee_id = next_employee_id,
             job_id = next_job_id,
             shift_type_id = next_shift_type_id,
             scheduled_date = next_scheduled_date,
             start_time = next_start_time,
             end_time = next_end_time, time_basis=target_payload->>'time_basis', time_snapshot=target_payload->'time_snapshot', time_timezone=target_payload->>'time_timezone', hide_time_on_badge=coalesce((target_payload->>'hide_time_on_badge')::boolean,false),
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
$function$
;

CREATE OR REPLACE FUNCTION public.remove_schedule_pending_op_service(actor_user_id uuid, target_workspace_id uuid, target_op_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_session public.schedule_edit_sessions%rowtype;
  target_shift public.schedule_edit_session_shifts%rowtype;
begin
 perform public.availability_lock_workspace(target_workspace_id);
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
  -- The edit's locations are still the person's to edit (B-3).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => target_session.location_ids);
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => array[target_shift.location_id]);

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
$function$
;

CREATE OR REPLACE FUNCTION public.discard_schedule_edit_session_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform public.availability_lock_workspace(target_workspace_id);
  -- The edit's locations are still the person's to edit (B-3).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => session.location_ids)
  from public.schedule_edit_sessions session
  where session.id = target_session_id and session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id and session.status = 'active';
  delete from public.schedule_edit_session_shifts shift
  using public.schedule_edit_sessions session
  where session.id = target_session_id and session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id and session.status = 'active'
    and shift.session_id = session.id;
  update public.schedule_edit_sessions session
  set status = 'discarded', dirty = false, closed_at = now(), expires_at = now()
  where session.id = target_session_id and session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id and session.status = 'active';
  if not found then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('status', 'discarded');
end;
$function$
;
