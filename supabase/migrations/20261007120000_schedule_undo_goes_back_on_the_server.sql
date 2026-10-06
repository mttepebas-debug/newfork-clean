-- EKRAN-01 DB-1c (S2, KK-171): Undo takes the last step back on the server too,
-- in one piece (KARARLAR Schedule "Undo sunucuda da geri alır").
--
-- * A step is one write call from the screen: a drag, a paste, a template,
--   Auto-fill, a delete. Every change it makes to an open edit's shifts leaves
--   the row as it was before in app_private.schedule_edit_undo_steps, once per
--   shift. The edit keeps its last 25 steps (the screen's Undo depth).
-- * undo_schedule_edit_session_step_service puts every shift of the last step
--   back as it was, in one transaction: if a rule refuses one of them (a
--   required document missing by now, the shift's person on approved time
--   off), none goes back; time off a draft's copy hides from the edit is still
--   refused on publish. Example: Ayşe applies a template that adds 24 shifts
--   and presses Undo; the 24 go, the edit moves on to the next revision.
-- * The edit's answer says how many steps Undo can take back (undo_depth), so
--   the button is right after a reload too.
-- * Undo does not cross what the edit did not do itself: the shifts an edit is
--   opened or widened with are not a step, and a swap or a closed day that
--   rewrites an open edit drops its history. Saving, discarding or closing the
--   edit drops it too (Undo does not undo a saved step, KARARLAR Schedule).

create table app_private.schedule_edit_undo_steps (
  workspace_id uuid not null,
  session_id uuid not null,
  -- The write call: its statement's start and its transaction.
  step_at timestamptz not null,
  step_xact xid8 not null,
  shift_id uuid not null,
  -- The row before the step; null when the step created it.
  before jsonb,
  primary key (session_id, shift_id, step_at, step_xact),
  foreign key (session_id, workspace_id)
    references public.schedule_edit_sessions(id, workspace_id) on delete cascade
);
create index schedule_edit_undo_steps_step_idx on app_private.schedule_edit_undo_steps (session_id, step_at, step_xact);
alter table app_private.schedule_edit_undo_steps enable row level security;
revoke all on table app_private.schedule_edit_undo_steps from public, anon, authenticated, service_role;

create function app_private.record_schedule_edit_undo_step()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  edit uuid := coalesce(new.session_id, old.session_id);
  call_at timestamptz := statement_timestamp();
  call_xact xid8 := pg_current_xact_id();
begin
  -- A closed edit keeps no history, nor does one being deleted.
  if not exists (select 1 from public.schedule_edit_sessions session where session.id = edit and session.status = 'active') then
    return null;
  end if;
  -- A new step: only the 24 before it are kept.
  if not exists (select 1 from app_private.schedule_edit_undo_steps step
      where step.session_id = edit and step.step_at = call_at and step.step_xact = call_xact) then
    delete from app_private.schedule_edit_undo_steps step
    where step.session_id = edit and (step.step_at, step.step_xact) <= (
      select kept.step_at, kept.step_xact
      from (select distinct older.step_at, older.step_xact from app_private.schedule_edit_undo_steps older
            where older.session_id = edit) kept
      order by kept.step_at desc, kept.step_xact desc offset 24 limit 1);
  end if;
  insert into app_private.schedule_edit_undo_steps (workspace_id, session_id, step_at, step_xact, shift_id, before)
  values (coalesce(new.workspace_id, old.workspace_id), edit, call_at, call_xact, coalesce(new.id, old.id),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end)
  -- The first change in a step is how the row was before it.
  on conflict (session_id, shift_id, step_at, step_xact) do nothing;
  return null;
end;
$function$;
revoke all on function app_private.record_schedule_edit_undo_step() from public, anon, authenticated;

create trigger record_undo_step
after insert or update or delete on public.schedule_edit_session_shifts
for each row execute function app_private.record_schedule_edit_undo_step();

create function app_private.forget_schedule_edit_undo_steps()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  delete from app_private.schedule_edit_undo_steps step where step.session_id = new.id;
  return null;
end;
$function$;
revoke all on function app_private.forget_schedule_edit_undo_steps() from public, anon, authenticated;

create trigger forget_undo_steps
after update of status on public.schedule_edit_sessions
for each row when (new.status <> 'active')
execute function app_private.forget_schedule_edit_undo_steps();

-- A swap or a closed day rewrote these edits: Undo does not cross it. Called
-- after the write, by the write that is not a step of the edit.
create function app_private.schedule_edit_undo_barrier()
returns void
language sql
set search_path to ''
as $function$
  delete from app_private.schedule_edit_undo_steps step
  where step.session_id in (select touched.session_id from app_private.schedule_edit_undo_steps touched
    where touched.step_at = statement_timestamp() and touched.step_xact = pg_current_xact_id());
$function$;
revoke all on function app_private.schedule_edit_undo_barrier() from public, anon, authenticated;

create function public.undo_schedule_edit_session_step_service(
  actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, expected_session_revision integer)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  edit public.schedule_edit_sessions%rowtype;
  last_at timestamptz;
  last_xact xid8;
  steps jsonb;
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
  if edit.status <> 'active' or edit.expires_at <= now() then
    raise exception 'edit lease expired' using errcode = '40001';
  end if;
  if edit.revision is distinct from expected_session_revision then
    raise exception 'session revision stale' using errcode = '40001';
  end if;

  select step.step_at, step.step_xact into last_at, last_xact
  from app_private.schedule_edit_undo_steps step
  where step.session_id = edit.id
  order by step.step_at desc, step.step_xact desc
  limit 1;
  if last_at is null then
    raise exception 'nothing to undo' using errcode = 'PT409', hint = 'schedule.nothing_to_undo';
  end if;

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

  -- Undo's own writes are not a step.
  delete from app_private.schedule_edit_undo_steps step
  where step.session_id = edit.id and step.step_at = statement_timestamp() and step.step_xact = pg_current_xact_id();

  update public.schedule_edit_sessions
  set revision = revision + 1, dirty = true, last_heartbeat = now(), expires_at = now() + interval '4 minutes'
  where id = edit.id;

  return public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
end;
$function$;
revoke all on function public.undo_schedule_edit_session_step_service(uuid, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.undo_schedule_edit_session_step_service(uuid, uuid, uuid, integer) to service_role;

-- The edit's answer carries undo_depth; opening an edit, a swap and a closed day
-- are not steps.

CREATE OR REPLACE FUNCTION public.get_schedule_edit_session_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_session public.schedule_edit_sessions%rowtype;
  result jsonb;
begin
  select * into target_session
  from public.schedule_edit_sessions session
  where session.id = target_session_id
    and session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id;
  if target_session.id is null then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;
  -- The edit's locations are still the person's to edit (B-3).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => target_session.location_ids);

  with counterpart as materialized (
    select published.source_shift_id as edit_shift_id, published.employee_id, published.location_id,
      published.scheduled_date, published.start_time, published.end_time, published.time_timezone,
      published.availability_snapshot
    from public.schedule_location_publications publication
    join public.schedule_published_shifts published on published.publication_id = publication.id
    where publication.workspace_id = target_workspace_id and publication.status = 'current'
      and publication.week_start = target_session.week_start
      and publication.location_id = any (target_session.location_ids)
  ), week_availability as materialized (
    select * from app_private.schedule_week_availability(
      target_workspace_id, target_session.week_start,
      array(select s.employee_id from public.schedule_edit_session_shifts s
            where s.session_id = target_session.id and s.employee_id is not null
            union select c.employee_id from counterpart c where c.employee_id is not null),
      array(select s.location_id from public.schedule_edit_session_shifts s
            where s.session_id = target_session.id
            union select c.location_id from counterpart c))
  )
  select jsonb_build_object(
    'id', target_session.id,
    'workspace_id', target_session.workspace_id,
    'week_start', target_session.week_start,
    'source_kind', target_session.source_kind,
    'source_draft_id', target_session.source_draft_id,
    'source_revision', target_session.source_revision,
    'holder_user_id', target_session.holder_user_id,
    'holder_name', coalesce((
      select profile.display_name from public.user_profiles profile
      where profile.user_id = target_session.holder_user_id
    ), 'Manager'),
    'revision', target_session.revision,
    'dirty', target_session.dirty,
    -- DB-1c: how many steps Undo can take back.
    'undo_depth', (select count(*) from (select distinct step.step_at, step.step_xact
      from app_private.schedule_edit_undo_steps step where step.session_id = target_session.id) undo)::integer,
    'last_heartbeat', target_session.last_heartbeat,
    'expires_at', target_session.expires_at,
    'location_ids', to_jsonb(target_session.location_ids),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', shift.id,
        'location_id', shift.location_id,
        'employee_id', shift.employee_id,
        'job_id', shift.job_id,
        'shift_type_id', shift.shift_type_id,
        'scheduled_date', shift.scheduled_date,
        'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time', to_char(shift.start_time, 'HH24:MI'),
        'end_time', to_char(shift.end_time, 'HH24:MI'),
        'crosses_midnight', shift.crosses_midnight,
        'unpaid_break_minutes', coalesce(shift.unpaid_break_minutes, 0),
        'hide_time_on_badge', coalesce(shift.hide_time_on_badge, false),
        'note', shift.note,
        'revision', shift.revision,
        'source_published_shift_id', shift.source_published_shift_id,
        'pending_op_type', shift.pending_op_type,
        'locked', shift.locked,
        'label_ids', to_jsonb(coalesce(shift.label_ids, '{}'::uuid[])),
        'label_names', to_jsonb(coalesce(shift.label_names, '{}'::text[])),
        -- K18, M11 in Edit mode (VAR-UYG-DB): read from the shift's published
        -- counterpart by the published week's own rule; a shift never
        -- published has none and says false.
        'availability_changed_after_publish', coalesce((
          -- KK-171: only while the edit keeps the published person on the card.
          select c.employee_id is not null and c.employee_id = shift.employee_id
            and exists (select 1 from week_availability week
              where week.employee_id = c.employee_id and week.location_id = c.location_id
                and week.unavailable && app_private.shift_time_range(c.scheduled_date, c.start_time, c.end_time, c.time_timezone))
            and not coalesce((c.availability_snapshot -> 'first' ->> 'has_own_mark')::boolean, true)
          from counterpart c where c.edit_shift_id = shift.id
          -- A shift moved to another location and published only there sits in
          -- two current publications; the one at its location today speaks.
          order by (c.location_id = shift.location_id) desc limit 1), false),
        'warning_codes', to_jsonb(array_remove(array[
          case when exists (
            select 1 from public.schedule_closures closure
            where closure.location_id = shift.location_id
              and closure.closed_date = shift.scheduled_date and closure.is_all_day
          ) then 'closed_location' end,
          -- Today's marks and approved leave, published or not (BL-186).
          case when shift.employee_id is not null and exists (select 1 from week_availability week
            where week.employee_id = shift.employee_id and week.location_id = shift.location_id
              and (week.unavailable + week.leave) && app_private.shift_time_range(shift.scheduled_date, shift.start_time, shift.end_time, shift.time_timezone)
          ) then 'availability' end,
          case when shift.employee_id is not null and exists (
            select 1 from public.schedule_edit_session_shifts other
            where other.session_id = target_session.id
              and other.employee_id = shift.employee_id
              and other.scheduled_date = shift.scheduled_date
              and other.id <> shift.id
              and not shift.crosses_midnight and not other.crosses_midnight
              and shift.start_time < other.end_time and shift.end_time > other.start_time
          ) then 'overlap' end
        ]::text[], null))
      ) order by shift.scheduled_date, shift.start_time, shift.id)
      from public.schedule_edit_session_shifts shift
      where shift.session_id = target_session.id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$function$;

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

  -- DB-1c: the shifts the edit is opened or widened with are not a step of it.
  delete from app_private.schedule_edit_undo_steps step
  where step.session_id = edit_session_id and step.step_at = statement_timestamp()
    and step.step_xact = pg_current_xact_id();

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
$function$;

CREATE OR REPLACE FUNCTION public.shift_exchange_rebase_drafts(w uuid, s jsonb, recipient uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 with changed as (
  update public.schedule_draft_shifts d set employee_id=recipient,revision=revision+1,updated_at=now()
  where d.workspace_id=w and d.id in((s->>'source_id')::uuid,(s->>'id')::uuid)
   and public.shift_exchange_edit_matches(to_jsonb(d),s) returning d.draft_id
 ) update public.schedule_drafts set revision=revision+1,updated_at=now() where id in(select draft_id from changed);
 with changed as (
  update public.schedule_edit_session_shifts d set employee_id=recipient,revision=revision+1,updated_at=now()
  where d.workspace_id=w and (d.id in((s->>'source_id')::uuid,(s->>'id')::uuid) or d.source_published_shift_id=(s->>'id')::uuid)
   and public.shift_exchange_edit_matches(to_jsonb(d),s) and d.pending_op_type is distinct from 'delete' returning d.session_id
 ) update public.schedule_edit_sessions set revision=revision+1 where id in(select session_id from changed);
 -- DB-1c: Undo does not take the swap back.
 perform app_private.schedule_edit_undo_barrier();
end; $function$;

CREATE OR REPLACE FUNCTION app_private.important_date_close_shifts(actor uuid, item important_dates, impact jsonb, keep uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s jsonb;
  opened jsonb := coalesce((select jsonb_agg(x) from jsonb_array_elements(impact -> 'shifts') x
                            where not (x ->> 'id')::uuid = any (coalesce(keep, '{}'))), '[]'::jsonb);
  drafts uuid[] := array(select value::uuid from jsonb_array_elements_text(impact -> 'draft_shift_ids'));
  places uuid[];
  other record;
begin
  places := array(
    select distinct (x ->> 'location_id')::uuid from jsonb_array_elements(opened) x
    union select draft_shift.location_id from public.schedule_draft_shifts draft_shift where draft_shift.id = any (drafts)
    union select edit_shift.location_id from public.schedule_edit_session_shifts edit_shift
          where edit_shift.workspace_id = item.workspace_id and edit_shift.id = any (drafts));
  if cardinality(places) = 0 then
    return '[]'::jsonb;
  end if;
  perform app_private.authorize(actor, item.workspace_id, 'schedule.edit', target_locations => places);

  for s in select x from jsonb_array_elements(opened) x loop
    insert into public.important_date_shift_releases (workspace_id, important_date_id, published_shift_id, source_shift_id,
      before_assignment, actor_user_id)
    values (item.workspace_id, item.id, (s ->> 'id')::uuid, (s ->> 'source_id')::uuid, s, actor);
    update public.schedule_published_shifts set employee_id = null
    where workspace_id = item.workspace_id and id = (s ->> 'id')::uuid and employee_id = (s ->> 'employee_id')::uuid;
    if not found then
      raise exception 'A shift on this closed day changed. Review the shifts again.'
        using errcode = '40001', hint = 'important_date.closure_changed';
    end if;
  end loop;

  with dropped as (
    update public.schedule_draft_shifts draft_shift
    set employee_id = null, revision = draft_shift.revision + 1, updated_at = now()
    where draft_shift.id = any (drafts)
      and (draft_shift.location_id, draft_shift.scheduled_date) in (
        select (day ->> 'location_id')::uuid, (day ->> 'closed_date')::date from jsonb_array_elements(impact -> 'days') day)
    returning draft_shift.draft_id
  )
  update public.schedule_drafts set revision = revision + 1, updated_at = now()
  where id in (select draft_id from dropped);

  -- BL-545: the same shift in an open edit drops too; the edit's revision moves
  -- so the open screen reloads it (as shift_exchange_rebase_drafts does).
  with dropped_edit as (
    update public.schedule_edit_session_shifts edit_shift
    set employee_id = null, revision = edit_shift.revision + 1, updated_at = now()
    where edit_shift.workspace_id = item.workspace_id and edit_shift.id = any (drafts)
      and edit_shift.employee_id is not null and edit_shift.source_published_shift_id is null
      and edit_shift.pending_op_type is distinct from 'delete'
      and (edit_shift.location_id, edit_shift.scheduled_date) in (
        select (day ->> 'location_id')::uuid, (day ->> 'closed_date')::date from jsonb_array_elements(impact -> 'days') day)
      and exists (select 1 from public.schedule_edit_sessions edit where edit.id = edit_shift.session_id and edit.status = 'active')
    returning edit_shift.session_id
  )
  update public.schedule_edit_sessions set revision = revision + 1
  where id in (select session_id from dropped_edit);
  -- DB-1c: Undo does not take the closed day back.
  perform app_private.schedule_edit_undo_barrier();

  if jsonb_array_length(opened) > 0 then
    perform public.shift_exchange_reconcile_batch(actor, item.workspace_id,
      (select jsonb_agg(x || jsonb_build_object('new_employee_id', null)) from jsonb_array_elements(opened) x));
    -- ponytail: the same steps approved time off takes (time_off_release_shifts).
    for other in
      select c.id from public.shift_exchange_cases c
      where c.workspace_id = item.workspace_id and c.status = 'open'
        and exists (select 1 from jsonb_array_elements(opened) x
                    where (x ->> 'source_id')::uuid in (c.offered_source_id, c.requested_source_id))
    loop
      update public.shift_exchange_cases set status = 'invalidated', revision = revision + 1, updated_at = now() where id = other.id;
      update public.shift_exchange_applications set status = 'invalidated', updated_at = now()
      where case_id = other.id and status in ('invited', 'pending_manager');
      perform public.shift_exchange_emit(actor, item.workspace_id, other.id, null, 'invalidated',
        'An involved assignment was opened by a closed day. Review the current schedule.');
    end loop;
    perform realtime.send(jsonb_build_object('workspace_id', item.workspace_id, 'important_date_id', item.id),
      'changed', 'shift-exchanges:' || item.workspace_id::text, true);
  end if;
  return opened;
end;
$function$;
