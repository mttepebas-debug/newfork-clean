-- EKRAN-01 #12, BL-998 / BL-999: Undo no longer sticks on a step that cannot
-- come back.
--
-- Ayşe deletes Ali's evening, then Ali's time off that evening is approved;
-- or she moves his short-rest evening and the acceptance it carried goes. The
-- newest step could no longer be put back: every press of Undo was refused the
-- same way, the button stayed on and every older step was out of reach. Now
-- the refused step leaves the history with nothing of it written, and the
-- answer names the rule (undo_refused.reason: availability, document,
-- conflict_acceptance or rule) so the screen can say why; the next Undo takes
-- the step before it. The edit's revision moves with its history.
--
-- The function is replaced whole, and only from the body it has today
-- (EKRAN-01 #12, 20261009080320); any other body stops the migration.
do $guard$
begin
  if md5(pg_get_functiondef('public.undo_schedule_edit_session_step_service(uuid,uuid,uuid,integer)'::regprocedure))
      <> '39073e8f95d0414f7de2793bf8097b13' then
    raise exception 'BL-998: undo_schedule_edit_session_step_service is not the body this replaces';
  end if;
end
$guard$;

CREATE OR REPLACE FUNCTION public.undo_schedule_edit_session_step_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, expected_session_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  edit public.schedule_edit_sessions%rowtype;
  last_at timestamptz;
  last_xact xid8;
  steps jsonb;
  refused_message text;
  refused text;
begin
  perform public.availability_lock_workspace(target_workspace_id);
  select * into edit from public.schedule_edit_sessions session
  where session.id = target_session_id and session.workspace_id = target_workspace_id
  for update;
  if edit.id is null or edit.holder_user_id is distinct from actor_user_id then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;
  -- The edit's locations are still the person's to edit (B-3).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => edit.location_ids);
  if edit.status <> 'active' then
    raise exception 'edit session closed' using errcode = 'PT409', hint = 'schedule.edit_session_closed';
  elsif edit.expires_at <= now() then
    raise exception 'edit lease expired' using errcode = 'PT409', hint = 'schedule.edit_lease_expired';
  end if;
  if edit.revision is distinct from expected_session_revision then
    raise exception 'session revision stale' using errcode = 'PT409', hint = 'schedule.edit_session_stale';
  end if;

  select step.step_at, step.step_xact into last_at, last_xact
  from app_private.schedule_edit_undo_steps step
  where step.session_id = edit.id
  -- The step written last, by its number (EKRAN-01 #12).
  order by step.step_no desc
  limit 1;
  if last_at is null then
    raise exception 'nothing to undo' using errcode = 'PT409', hint = 'schedule.nothing_to_undo';
  end if;

  -- BL-998: a step that can no longer come back (a rule that applies now:
  -- approved time off, a missing document, an acceptance the edit lost) leaves
  -- the history and the answer says why; nothing of it is written, and the
  -- steps before it stay in reach.
  begin
  -- Each shift the step touched, as it was before it. The step leaves the
  -- history first, so the writes below do not push an older step out.
  with taken as (
    delete from app_private.schedule_edit_undo_steps step
    where step.session_id = edit.id and step.step_at = last_at and step.step_xact = last_xact
    returning step.shift_id, step.before)
  select coalesce(jsonb_agg(jsonb_build_object('id', taken.shift_id, 'before', taken.before)), '[]'::jsonb)
  into steps from taken;

  -- Shifts the step added go first, so the ones coming back find room.
  delete from public.schedule_edit_session_shifts shift
  using jsonb_array_elements(steps) step
  where shift.session_id = edit.id and shift.id = (step ->> 'id')::uuid and step -> 'before' = 'null'::jsonb;

  -- The rows come back as they were; their revision moves on, so a screen
  -- that still holds the undone row is told it is stale.
  update public.schedule_edit_session_shifts shift
  set location_id = prior.location_id, employee_id = prior.employee_id, job_id = prior.job_id,
      shift_type_id = prior.shift_type_id, scheduled_date = prior.scheduled_date,
      start_time = prior.start_time, end_time = prior.end_time, note = prior.note,
      idempotency_key = prior.idempotency_key, source_published_shift_id = prior.source_published_shift_id,
      pending_op_type = prior.pending_op_type, locked = prior.locked,
      unpaid_break_minutes = prior.unpaid_break_minutes, hide_time_on_badge = prior.hide_time_on_badge,
      label_ids = prior.label_ids, label_names = prior.label_names, time_basis = prior.time_basis,
      time_snapshot = prior.time_snapshot, time_timezone = prior.time_timezone,
      revision = shift.revision + 1, updated_at = now()
  from jsonb_array_elements(steps) step
  cross join lateral jsonb_populate_record(null::public.schedule_edit_session_shifts, nullif(step -> 'before', 'null'::jsonb)) prior
  where shift.session_id = edit.id and shift.id = prior.id and step -> 'before' <> 'null'::jsonb;

  insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, employee_id, job_id,
    shift_type_id, scheduled_date, start_time, end_time, note, revision, idempotency_key, created_at, updated_at,
    source_published_shift_id, pending_op_type, locked, unpaid_break_minutes, hide_time_on_badge, label_ids,
    label_names, time_basis, time_snapshot, time_timezone)
  select prior.id, edit.workspace_id, edit.id, prior.location_id, prior.employee_id, prior.job_id,
    prior.shift_type_id, prior.scheduled_date, prior.start_time, prior.end_time, prior.note,
    prior.revision + 1, prior.idempotency_key, prior.created_at, now(),
    prior.source_published_shift_id, prior.pending_op_type, prior.locked, prior.unpaid_break_minutes,
    prior.hide_time_on_badge, prior.label_ids, prior.label_names, prior.time_basis, prior.time_snapshot, prior.time_timezone
  from jsonb_array_elements(steps) step
  cross join lateral jsonb_populate_record(null::public.schedule_edit_session_shifts, nullif(step -> 'before', 'null'::jsonb)) prior
  where step -> 'before' <> 'null'::jsonb
    and not exists (select 1 from public.schedule_edit_session_shifts shift
      where shift.session_id = edit.id and shift.id = prior.id);

  -- A person missing a required document is never on a shift that day, Undo or not.
  if exists (
    select 1 from jsonb_array_elements(steps) step
    cross join lateral jsonb_populate_record(null::public.schedule_edit_session_shifts, nullif(step -> 'before', 'null'::jsonb)) prior
    where prior.employee_id is not null
      and public.employee_has_hard_document_schedule_conflict_service(target_workspace_id, prior.employee_id, prior.scheduled_date)
  ) then
    raise exception 'employee document hard conflict' using errcode = '23514';
  end if;
  exception when check_violation then
    get stacked diagnostics refused_message = message_text;
    refused := case refused_message
      when 'Resolve shift hours or approved time off before this assignment' then 'availability'
      when 'A current conflict acceptance is required' then 'conflict_acceptance'
      when 'employee document hard conflict' then 'document'
      else 'rule' end;
    delete from app_private.schedule_edit_undo_steps step
    where step.session_id = edit.id and step.step_at = last_at and step.step_xact = last_xact;
  end;

  -- Undo's own writes are not a step.
  delete from app_private.schedule_edit_undo_steps step
  where step.session_id = edit.id and step.step_at = statement_timestamp() and step.step_xact = pg_current_xact_id();

  update public.schedule_edit_sessions
  set revision = revision + 1, dirty = true, last_heartbeat = now(), expires_at = now() + interval '4 minutes'
  where id = edit.id;

  return public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id)
    || case when refused is not null then jsonb_build_object('undo_refused', jsonb_build_object('reason', refused)) else '{}'::jsonb end;
end;
$function$;
