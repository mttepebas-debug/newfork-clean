-- EKRAN-01 VAR-UYG-DB-2 (KK-171): in Edit mode "changed after publishing"
-- belongs to the person on the card. When the edit gives the shift to someone
-- else than the published counterpart's person, the flag is false: the mark
-- that raised it was the published person's (KARARLAR K18, ILKELER P11).

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
