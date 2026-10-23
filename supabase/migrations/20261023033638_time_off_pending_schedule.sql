-- Time off rebuild D3b (KARARLAR S-239 (9)): time off waiting for an answer is only a warning on the
-- Schedule, never a block.
--
-- schedule_week_availability: the week's projection carries the waiting hours apart, as
--   pending_leave_intervals beside leave_intervals, from the same leave_spans read (pending = true). They are
--   never in the `leave` column the assessment and the edit session block on: no block, no conflict.
-- get_schedule_read_model_service: the grid hands those hours only to who may answer the request
--   (app_private.time_off_decider_reason) or to the person; anybody else gets []. Asked only for the people
--   who have one that week.
-- weekly_schedule_publication_preflight: the time_off_pending note says which table its request is in,
--   time_off_source = 'current' (time_off_requests) or 'legacy' (schedule_time_off_requests), so the web
--   never opens a new request in the old drawer or the other way round. Its id is unchanged.
--
-- Each body is today's (supabase/schema.sql after D3) with only these changes.

CREATE OR REPLACE FUNCTION "app_private"."schedule_week_availability"("target_workspace_id" "uuid", "target_week_start" "date", "target_employee_ids" "uuid"[], "target_location_ids" "uuid"[], "with_reminders" boolean DEFAULT true) RETURNS TABLE("employee_id" "uuid", "location_id" "uuid", "unavailable" "tstzmultirange", "leave" "tstzmultirange", "projection" "jsonb")
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
with location_zone as (
  select l.id, l.name, l.timezone, app_private.timezone_name_valid(l.timezone) as zone_ok
  from public.locations l
  where l.workspace_id = target_workspace_id and l.id = any(target_location_ids)
), zone as (
  select distinct z.timezone as zone_name from location_zone z where z.zone_ok
), piece as (
  -- Two four-day pieces, as the offset helper is bounded to eight physical
  -- days and a fall-back week is eight days and an hour.
  select z.zone_name,
    tstzrange((target_week_start + o.offset_days)::timestamp at time zone z.zone_name,
              (target_week_start + o.offset_days + 4)::timestamp at time zone z.zone_name, '[)') as span
  from zone z cross join (values (0), (4)) o(offset_days)
), segment as (
  select p.zone_name, s.utc_span, s.offset_seconds
  from piece p cross join lateral public.availability_offset_segments(p.span, p.zone_name) s
), mark as (
  select e.employee_id, false as reminder, e.preference, public.weekly_preference_valid(e.preference) as valid
  from public.employee_weekly_preferences e
  where e.workspace_id = target_workspace_id and e.employee_id = any(target_employee_ids)
  union all
  select m.employee_id, true, m.preference, public.weekly_preference_valid(m.preference)
  from public.manager_weekly_reminders m
  where with_reminders and m.workspace_id = target_workspace_id and m.employee_id = any(target_employee_ids) and m.enabled
), mark_day as (
  select m.employee_id, m.reminder, d.value as rule
  from mark m cross join lateral jsonb_array_elements(case when m.valid then m.preference -> 'days' else '[]'::jsonb end) d
), clock as (
  -- Availability is hours only: a whole day, or the day's one range.
  select md.employee_id, md.reminder, (md.rule ->> 'day')::integer as dow,
    time '00:00' as start_clock, time '24:00' as end_clock
  from mark_day md
  where coalesce((md.rule ->> 'all_day')::boolean, false)
  union all
  select md.employee_id, md.reminder, (md.rule ->> 'day')::integer,
    (r.value ->> 'start')::time, (r.value ->> 'end')::time
  from mark_day md
  cross join lateral jsonb_array_elements(md.rule -> 'ranges') r
  where not coalesce((md.rule ->> 'all_day')::boolean, false)
), broken as (
  -- A mark that cannot be read makes the employee's week unknown rather than
  -- partly drawn.
  select m.employee_id from mark m where not m.valid
), local_day as (
  select s.zone_name, s.utc_span, s.offset_seconds, day::date as local_date
  from segment s
  cross join lateral generate_series(
    (((lower(s.utc_span) at time zone 'UTC') + make_interval(secs => s.offset_seconds))::date - 1)::timestamp,
    (((upper(s.utc_span) at time zone 'UTC') + make_interval(secs => s.offset_seconds))::date)::timestamp,
    interval '1 day') day
), unavailable_piece as (
  select c.employee_id, c.reminder, ld.zone_name,
    tstzrange(((ld.local_date + c.start_clock) at time zone 'UTC') - make_interval(secs => ld.offset_seconds),
              ((ld.local_date + c.end_clock + case when c.end_clock < c.start_clock then interval '1 day' else interval '0' end) at time zone 'UTC')
                - make_interval(secs => ld.offset_seconds), '[)') * ld.utc_span as span
  from local_day ld
  join clock c on c.dow = extract(dow from ld.local_date)::integer
), unavailable as (
  -- Unavailable is the employee's own marks; a manager's note is kept apart,
  -- only a reminder (M12).
  select u.employee_id, u.zone_name, range_agg(u.span) filter (where not u.reminder) as spans,
    range_agg(u.span) filter (where u.reminder) as note_spans
  from unavailable_piece u
  where not isempty(u.span)
  group by u.employee_id, u.zone_name
), leave_target as (
  select z.zone_name,
    tstzrange(target_week_start::timestamp at time zone z.zone_name, (target_week_start + 8)::timestamp at time zone z.zone_name, '[)') as span
  from zone z
), leave_piece as materialized (
  -- Read once for the week and a day either side, whatever the zones (UTC-12 to UTC+14).
  -- Time off waiting for an answer comes in the same read, kept apart below.
  select away.employee_id, away.span, away.pending
  from app_private.leave_spans(target_workspace_id, target_employee_ids,
    tstzrange((target_week_start - 1)::timestamp at time zone 'UTC', (target_week_start + 9)::timestamp at time zone 'UTC', '[)')) away
), leave as (
  select lp.employee_id, lt.zone_name, range_agg(lp.span * lt.span) as spans
  from leave_target lt
  join leave_piece lp on lp.span && lt.span and not lp.pending
  group by lp.employee_id, lt.zone_name
), pending_leave as (
  -- Time off waiting for an answer (KARARLAR S-239 (9)): only a warning. It is never part of `leave`, so
  -- nothing blocks on it and it is no conflict; the grid hands it only to who may answer it.
  select lp.employee_id, lt.zone_name, range_agg(lp.span * lt.span) as spans
  from leave_target lt
  join leave_piece lp on lp.span && lt.span and lp.pending
  group by lp.employee_id, lt.zone_name
), clock_segments as (
  select s.zone_name,
    jsonb_agg(jsonb_build_object('start_at', lower(s.utc_span), 'end_at', upper(s.utc_span), 'offset_seconds', s.offset_seconds)
      order by lower(s.utc_span)) as segments
  from segment s
  group by s.zone_name
), day_span as (
  select z.zone_name, target_week_start + i as work_date,
    tstzrange((target_week_start + i)::timestamp at time zone z.zone_name, (target_week_start + i + 1)::timestamp at time zone z.zone_name, '[)') as span
  from zone z cross join generate_series(0, 6) i
), employee_zone as (
  -- Everything but the location's own name is the same for every location in
  -- a time zone, so it is built once per employee and zone.
  select e.employee_id, z.zone_name,
    coalesce(u.spans, '{}'::tstzmultirange) as unavailable,
    coalesce(lv.spans, '{}'::tstzmultirange) as leave,
    jsonb_build_object(
      'status', 'ready',
      'unavailable_intervals', public.availability_ranges_json(coalesce(u.spans, '{}'::tstzmultirange)),
      'employee_intervals', public.availability_ranges_json(coalesce(u.spans, '{}'::tstzmultirange)),
      -- The note's hours, for the card shown while writing; the caller keeps
      -- them only for whoever may read the note.
      'note_intervals', public.availability_ranges_json(coalesce(u.note_spans, '{}'::tstzmultirange)),
      'leave_intervals', public.availability_ranges_json(coalesce(lv.spans, '{}'::tstzmultirange)),
      'pending_leave_intervals', public.availability_ranges_json(coalesce(pl.spans, '{}'::tstzmultirange)),
      'clock_segments', cs.segments,
      'days', (select jsonb_agg(jsonb_build_object(
                 'date', ds.work_date,
                 'has_unavailable', coalesce(u.spans, '{}'::tstzmultirange) && ds.span,
                 'all_day', coalesce(u.spans, '{}'::tstzmultirange) @> ds.span) order by ds.work_date)
               from day_span ds where ds.zone_name = z.zone_name)) as body
  from unnest(target_employee_ids) e(employee_id)
  cross join zone z
  left join unavailable u on u.employee_id = e.employee_id and u.zone_name = z.zone_name
  left join leave lv on lv.employee_id = e.employee_id and lv.zone_name = z.zone_name
  left join pending_leave pl on pl.employee_id = e.employee_id and pl.zone_name = z.zone_name
  left join clock_segments cs on cs.zone_name = z.zone_name
  where not exists (select 1 from broken b where b.employee_id = e.employee_id)
)
select e.employee_id, lz.id, ez.unavailable, ez.leave,
  jsonb_build_object('location_id', lz.id, 'location_name', lz.name, 'timezone', lz.timezone, 'week_start', target_week_start)
  || coalesce(ez.body, jsonb_build_object('status', 'unknown', 'unavailable_intervals', '[]'::jsonb, 'employee_intervals', '[]'::jsonb, 'note_intervals', '[]'::jsonb, 'leave_intervals', '[]'::jsonb,
       'pending_leave_intervals', '[]'::jsonb, 'clock_segments', '[]'::jsonb, 'days', '[]'::jsonb))
from unnest(target_employee_ids) e(employee_id)
cross join location_zone lz
left join employee_zone ez on ez.employee_id = e.employee_id and ez.zone_name = lz.timezone and lz.zone_ok;
$$;

CREATE OR REPLACE FUNCTION "public"."get_schedule_read_model_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  settings public.workspace_scheduling_settings%rowtype;
  resolved_week_start date;
  -- ponytail: one mode today, live shifts elsewhere as ghosts. B4's
  -- published-plan preview (FB-6.1b) is a second way to fill ghost_shifts,
  -- not a second read.
  reach uuid[] := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.read');
  result jsonb;
begin
  -- Nowhere to read: the core says why. A workspace with no live location
  -- reads as empty to whoever would reach it, rather than refusing the owner.
  if cardinality(reach) = 0
     and (app_private.authz_reason(actor_user_id, target_workspace_id, 'schedule.read') is distinct from 'out_of_scope'
          or exists (select 1 from public.locations l where l.workspace_id = target_workspace_id and l.deleted_at is null)) then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.read');
  end if;

  select * into settings
  from public.workspace_scheduling_settings
  where workspace_id = target_workspace_id;
  if settings.workspace_id is null then
    raise exception 'scheduling settings are unavailable' using errcode = 'P0002';
  end if;

  resolved_week_start := case settings.week_start_day
    when 'sunday' then target_date - extract(dow from target_date)::integer
    else target_date - (extract(isodow from target_date)::integer - 1)
  end;

  with allowed_locations as (
    select location.*
    from public.locations location
    where location.workspace_id = target_workspace_id
      and location.archived_at is null
      and location.id = any(reach)
  ), current_publications as (
    select publication.*
    from public.schedule_location_publications publication
    join allowed_locations location on location.id = publication.location_id
    where publication.week_start = resolved_week_start
      and publication.status = 'current'
  ), visible_employees as (
    select distinct employee.*
    from public.employee_profiles employee
    where employee.workspace_id = target_workspace_id
      and employee.archived_at is null
      and exists (
        select 1
        from public.employee_location_assignments assignment
        join allowed_locations location on location.id = assignment.location_id
        where assignment.employee_id = employee.id and assignment.ended_at is null
      )
      -- ROL-CIFT 2.1: the grid is the people who can be scheduled; who only manages is not on it.
      and app_private.has_employee_access(target_workspace_id, employee.user_id)
  ), current_shifts as (
    select shift.*
    from public.schedule_published_shifts shift
    join current_publications publication on publication.id = shift.publication_id
    where shift.scheduled_date between resolved_week_start and resolved_week_start + 6
  ), ghost_shifts as (
    -- A shift somebody on this grid works at a location the actor does not
    -- reach: what the shift card says, not its note (REUSE B1, FB-6.1 T3).
    select shift.id, shift.employee_id, shift.location_id, location.name as location_name,
      shift.scheduled_date, shift.start_time, shift.end_time, shift.crosses_midnight,
      shift.job_id, job.name as job_name, shift.shift_type_id, shift_type.name as shift_type_name,
      shift.label_ids, shift.label_names
    from visible_employees employee
    join public.schedule_published_shifts shift
      on shift.employee_id = employee.id
     and shift.scheduled_date between resolved_week_start and resolved_week_start + 6
    join public.schedule_location_publications publication
      on publication.id = shift.publication_id and publication.status = 'current'
     and publication.week_start = resolved_week_start
    join public.locations location
      on location.id = shift.location_id and location.workspace_id = target_workspace_id
     and location.archived_at is null and location.deleted_at is null
    -- Names travel with the ghost, named as the grid names a real shift: the
    -- job and type, archived ones too (G8b, K8), null once deleted; the labels
    -- as the shift recorded them.
    left join public.jobs job
      on job.id = shift.job_id and job.workspace_id = target_workspace_id
     and job.deleted_at is null
    left join public.shift_types shift_type
      on shift_type.id = shift.shift_type_id and shift_type.workspace_id = target_workspace_id
     and shift_type.deleted_at is null
    where not exists (select 1 from allowed_locations allowed where allowed.id = shift.location_id)
  ), week_availability as materialized (
    select * from app_private.schedule_week_availability(
      target_workspace_id, resolved_week_start,
      (select coalesce(array_agg(employee.id), '{}') from visible_employees employee),
      (select coalesce(array_agg(location.id), '{}') from allowed_locations location))
  ), readable_notes as materialized (
    -- The note's words, by weekday from Sunday, for whoever the core lets read
    -- the note; nobody else gets them.
    -- Who last wrote it and when, named as the grid names a person (AVAIL-002).
    -- ponytail: a workspace-wide input-mode conversion also stamps the admin
    -- who changed the setting; keep the writer there if that ever misleads.
    select reminder.employee_id, to_jsonb(reminder.notes) as words,
      coalesce(nullif(author.preferred_name, ''), author.first_name) || ' ' || author.last_name as author,
      reminder.updated_at as edited_at
    from public.manager_weekly_reminders reminder
    left join public.employee_profiles author
      on author.workspace_id = reminder.workspace_id and author.user_id = reminder.updated_by
    where reminder.workspace_id = target_workspace_id and reminder.enabled
      and reminder.employee_id = any(array(select employee.id from visible_employees employee))
      and app_private.authz_reason(actor_user_id, target_workspace_id, 'availability.note_read',
        target_person => reminder.employee_id) is null
  ), pending_readers as materialized (
    -- Time off waiting for an answer reaches the grid only for who may answer it, or the person
    -- themself (KARARLAR S-239: a waiting request is read only by who decides it). Asked only for the
    -- few people who have one this week.
    select asking.employee_id
    from (select distinct week.employee_id from week_availability week
          where jsonb_array_length(coalesce(week.projection -> 'pending_leave_intervals', '[]'::jsonb)) > 0) asking
    join visible_employees employee on employee.id = asking.employee_id
    where employee.user_id = actor_user_id
      or app_private.time_off_decider_reason(actor_user_id, target_workspace_id, asking.employee_id) is null
  )
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'week_start', resolved_week_start,
    'week_start_day', settings.week_start_day,
    'settings', jsonb_build_object(
      'time_format', coalesce(settings.time_format, '12h'),
      'conflict_rules', settings.conflict_rules,
      'minimum_travel_minutes', settings.minimum_travel_minutes,
      'minimum_rest_minutes', settings.minimum_rest_minutes
    ),
    'shift_labels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', label.id, 'name', label.name, 'color', label.color, 'sort_order', label.sort_order
      ) order by label.sort_order, label.name)
      from public.shift_labels label
      where label.workspace_id = target_workspace_id and label.archived_at is null
    ), '[]'::jsonb),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', location.id,
        'name', location.name,
        'timezone', location.timezone,
        'sort_order', location.sort_order,
        'publication_status', case when publication.id is null then 'unpublished' else 'published' end,
        'published_at', publication.published_at
      ) order by location.sort_order, location.name)
      from allowed_locations location
      left join current_publications publication on publication.location_id = location.id
    ), '[]'::jsonb),
    'shift_types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', shift_type.id, 'name', shift_type.name, 'color', shift_type.color,
        'sort_order', shift_type.sort_order,
        'default_revision',shift_type.default_revision,'default_start_time', case when shift_type.default_start_time is null then null else to_char(shift_type.default_start_time, 'HH24:MI') end,
        'default_end_time', case when shift_type.default_end_time is null then null else to_char(shift_type.default_end_time, 'HH24:MI') end,
        'time_options', shift_type.time_options
      ) order by shift_type.sort_order, shift_type.name)
      from public.shift_types shift_type
      where shift_type.workspace_id = target_workspace_id and shift_type.archived_at is null
    ), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', employee.id,
        'employee_code', employee.employee_code,
        'display_name', coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' ' || employee.last_name,
        'is_excluded_from_schedule', coalesce(employee.is_excluded_from_schedule, false),
        'location_ids', coalesce((select jsonb_agg(assignment.location_id order by assignment.location_id)
          from public.employee_location_assignments assignment
          join allowed_locations location on location.id = assignment.location_id
          where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
        'job_ids', coalesce((select jsonb_agg(assignment.job_id order by assignment.job_id)
          from public.employee_job_assignments assignment
          where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
        'primary_job_id', app_private.stored_primary_job(employee.id),
        -- The note's words and hours only for whoever may read the note (M12).
        'weekly_availability', coalesce((select jsonb_agg((week.projection - 'note_intervals' - 'pending_leave_intervals')
            || jsonb_build_object('manager_notes', note.words,
              'note_author', note.author, 'note_edited_at', note.edited_at,
              'note_intervals', case when note.employee_id is null then '[]'::jsonb else week.projection -> 'note_intervals' end,
              'pending_leave_intervals', case when pending_reader.employee_id is null then '[]'::jsonb
                else week.projection -> 'pending_leave_intervals' end)
            order by week.location_id)
          from week_availability week
          left join readable_notes note on note.employee_id = employee.id
          left join pending_readers pending_reader on pending_reader.employee_id = employee.id
          where week.employee_id = employee.id
            and exists (select 1 from public.employee_location_assignments assignment
              where assignment.employee_id = employee.id and assignment.location_id = week.location_id
                and assignment.ended_at is null)), '[]'::jsonb)
      ) order by employee.last_name, employee.first_name, employee.id)
      from visible_employees employee
    ), '[]'::jsonb),
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
        'label_ids', to_jsonb(coalesce(shift.label_ids, '{}'::uuid[])),
        'label_names', to_jsonb(coalesce(shift.label_names, '{}'::text[])),
        -- K18, M11: the employee's own mark came after the shift was first
        -- published; approved time off is no change of availability.
        'availability_changed_after_publish', mark.own_mark
          and not coalesce((shift.availability_snapshot -> 'first' ->> 'has_own_mark')::boolean, true),
        'warning_codes', to_jsonb(array_remove(array[
          case when exists (
            select 1 from public.schedule_closures closure
            where closure.workspace_id = target_workspace_id and closure.location_id = shift.location_id
              and closure.closed_date = shift.scheduled_date
              and app_private.closure_covers(closure.kind, closure.opens, closure.closes, shift.start_time, shift.end_time)
          ) then 'closed_location' end,
          -- Today's marks and approved leave: a mark made after publishing shows
          -- here too (BL-186).
          case when mark.unavailable then 'availability' end,
          case when shift.employee_id is not null and exists (
            select 1 from current_shifts other
            where other.employee_id = shift.employee_id
              and other.scheduled_date = shift.scheduled_date
              and other.id <> shift.id
              and not shift.crosses_midnight and not other.crosses_midnight
              and shift.start_time < other.end_time and shift.end_time > other.start_time
          ) then 'overlap' end
        ]::text[], null))
      ) order by shift.scheduled_date, shift.start_time, shift.id)
      from current_shifts shift
      cross join lateral (
        select shift.employee_id is not null and exists (select 1 from week_availability week
          where week.employee_id = shift.employee_id and week.location_id = shift.location_id
            and (week.unavailable + week.leave) && app_private.shift_time_range(shift.scheduled_date, shift.start_time, shift.end_time, shift.time_timezone)
        ) as unavailable,
        shift.employee_id is not null and exists (select 1 from week_availability week
          where week.employee_id = shift.employee_id and week.location_id = shift.location_id
            and week.unavailable && app_private.shift_time_range(shift.scheduled_date, shift.start_time, shift.end_time, shift.time_timezone)
        ) as own_mark
      ) mark
    ), '[]'::jsonb),
    'ghost_shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ghost.id,
        'employee_id', ghost.employee_id,
        'location_id', ghost.location_id,
        'location_name', ghost.location_name,
        'scheduled_date', ghost.scheduled_date,
        'start_time', to_char(ghost.start_time, 'HH24:MI'),
        'end_time', to_char(ghost.end_time, 'HH24:MI'),
        'crosses_midnight', ghost.crosses_midnight,
        'job_id', ghost.job_id,
        'job_name', ghost.job_name,
        'shift_type_id', ghost.shift_type_id,
        'shift_type_name', ghost.shift_type_name,
        'label_ids', to_jsonb(ghost.label_ids),
        'label_names', to_jsonb(ghost.label_names)
      ) order by ghost.scheduled_date, ghost.start_time, ghost.id)
      from ghost_shifts ghost
    ), '[]'::jsonb),
    'closures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', closure.id, 'location_id', closure.location_id,
        'closed_date', closure.closed_date, 'title', closure.title,
        'is_all_day', closure.is_all_day, 'kind', closure.kind,
        'opens', to_char(closure.opens, 'HH24:MI'), 'closes', to_char(closure.closes, 'HH24:MI'),
        'status', closure.status, 'publish_at', closure.publish_at, 'on_schedule', closure.on_schedule,
        'announcement_id', closure.announcement_id
      ) order by closure.closed_date, closure.title)
      from public.schedule_closures closure
      join allowed_locations location on location.id = closure.location_id
      where closure.workspace_id = target_workspace_id
        and closure.closed_date between resolved_week_start and resolved_week_start + 6
    ), '[]'::jsonb),
    -- Records on the Schedule that touch the week, published or scheduled (a
    -- manager sees what is coming), one row per reachable checked location. A
    -- record about no live location (only for people added by hand) is on the
    -- week of whoever it is out to or may change it, never everyone's. A yearly
    -- record's next year is its own record.
    'important_dates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id, 'location_id', place.location_id, 'title', item.title,
        'category', item.category, 'category_other', item.category_other,
        'starts_on', item.starts_on, 'ends_on', coalesce(item.ends_on, item.starts_on),
        'status', item.status, 'publish_at', item.publish_at, 'day', place.day,
        'opens', to_char(place.opens, 'HH24:MI'), 'closes', to_char(place.closes, 'HH24:MI'),
        'event_from', to_char(item.event_from, 'HH24:MI'), 'event_until', to_char(item.event_until, 'HH24:MI')
      ) order by item.starts_on, item.title, place.location_id)
      from public.announcements item
      cross join lateral (
        select target.location_id, target.day, target.opens, target.closes
        from public.announcement_locations target
        join allowed_locations location on location.id = target.location_id
        where target.announcement_id = item.id
        union all
        select null::uuid, 'open', null::time, null::time
        where not exists (
          select 1 from public.announcement_locations target
          join public.locations location on location.id = target.location_id and location.archived_at is null
          where target.announcement_id = item.id)
          -- The reader is a scalar subquery: worked out once per read, not per record.
          and (app_private.announcement_reaches(item, actor_user_id)
            or app_private.announcement_reason((select app_private.actor(actor_user_id, target_workspace_id)),
                 app_private.announcement_places(item.id), item.created_by, app_private.announcement_dates(item)) is null)
      ) place
      where item.workspace_id = target_workspace_id and item.status in ('published', 'scheduled')
        and item.archived_at is null and item.on_schedule and item.starts_on is not null
        and item.starts_on <= resolved_week_start + 6 and resolved_week_start <= coalesce(item.ends_on, item.starts_on)
    ), '[]'::jsonb)
  ) || app_private.schedule_departments_and_jobs(target_workspace_id)
    || app_private.schedule_referenced_catalog(target_workspace_id,
      array(select shift.job_id from current_shifts shift union select ghost.job_id from ghost_shifts ghost),
      array(select shift.shift_type_id from current_shifts shift
            union select ghost.shift_type_id from ghost_shifts ghost))
  into result;

  return result;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."weekly_schedule_publication_preflight"("payload" "jsonb", "actor" "uuid", "departments" "uuid"[] DEFAULT NULL::"uuid"[], "include_no_department" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare findings jsonb; signatures jsonb:='[]'; s record; a jsonb; prior jsonb; evidence jsonb; scope jsonb;
 unsigned jsonb; w uuid:=(payload->>'workspace_id')::uuid; message text; state text; tier text; warning boolean;
 pending jsonb:='[]'; shift_span tstzrange; asking uuid[];
begin
 if payload->>'status'='past_week_closed' then return payload; end if;
 -- Who has time off waiting for a decision, read once for the whole draft.
 asking:=array(select distinct away.employee_id from app_private.leave_spans(w,
   array(select distinct d.employee_id from public.schedule_draft_shifts d
    where d.workspace_id=w and d.draft_id=(payload->>'draft_id')::uuid and d.employee_id is not null),
   (select tstzrange((min(d.scheduled_date)-2)::timestamp at time zone 'UTC',(max(d.scheduled_date)+3)::timestamp at time zone 'UTC','[)')
    from public.schedule_draft_shifts d where d.workspace_id=w and d.draft_id=(payload->>'draft_id')::uuid)) away
  where away.pending);
 select coalesce(jsonb_agg(f),'[]') into findings from jsonb_array_elements(payload->'findings') f
  where f->>'code' not in ('availability','availability_unknown','availability_review_pending','time_source_unresolved','overlap','double_booking','time_off','closed_location','closed_day');
 -- Publishing is asked at each location the preview is for, once.
 perform app_private.authorize(actor,w,'schedule.publish',array[(x->>'location_id')::uuid])
  from jsonb_array_elements(coalesce(payload->'locations','[]'::jsonb)) x;
 scope:=jsonb_build_object('_publish_locations',(select jsonb_agg(x->'location_id') from jsonb_array_elements(payload->'locations') x),
  '_publish_departments',to_jsonb(departments),'_publish_no_department',coalesce(include_no_department,true));
 for s in select d.*,concat_ws(' ',coalesce(nullif(e.preferred_name,''),e.first_name),e.last_name) employee_name,l.name location_name
  from public.schedule_draft_shifts d left join public.employee_profiles e on e.id=d.employee_id and e.workspace_id=d.workspace_id
  join public.locations l on l.id=d.location_id and l.workspace_id=d.workspace_id
  where d.workspace_id=w and d.draft_id=(payload->>'draft_id')::uuid
   and d.location_id in (select (x->>'location_id')::uuid from jsonb_array_elements(payload->'locations') x)
   and public.schedule_shift_in_department_scope_service(d.job_id,departments,coalesce(include_no_department,true)) order by d.id loop
  state:=null; prior:=null;
  a:=public.assess_weekly_shift_availability(w,s.employee_id,to_jsonb(s)||scope);
  evidence:=public.schedule_availability_override(w,to_jsonb(s),a);
  -- A conflict accepted when this shift was last published stays accepted
  -- (BL-174). Availability is no conflict and is not part of it (BL-186).
  if a->>'operation'='warning_requires_override' then
   prior:=public.schedule_availability_prior_publication(w,to_jsonb(s));
   state:=case when evidence is not null or prior->'availability_snapshot'->'assessment'->>'fingerprint'=a->>'fingerprint'
    or exists(select 1 from public.schedule_publication_overrides o where o.workspace_id=w
     and o.publication_id=(prior->>'publication_id')::uuid and o.finding_id=a->>'fingerprint' and s.id=any(o.source_shift_ids)) then 'accepted' else 'new' end;
   if s.employee_id is null and exists(select 1 from public.audit_events ev where ev.workspace_id=w and ev.action='schedule.conflict_accepted'
     and ev.target_id=s.id::text and ev.metadata->'assessment'->>'fingerprint'=a->>'fingerprint') then state:='accepted'; end if;
  end if;
  signatures:=signatures||jsonb_build_array(jsonb_build_object('shift_id',s.id,'fingerprint',a->>'fingerprint',
   'availability_fingerprint',a->>'availability_fingerprint','override_id',evidence->>'id','retained_publication_id',prior->>'publication_id'));
  if a->>'operation'<>'allowed' then
   warning:=state is not null;
   select string_agg(r->>'message',' ' order by ord) into message from jsonb_array_elements(a->'reasons') with ordinality r(r,ord) where r->>'code' not in ('availability','note');
   tier:=case when not warning then 'blocker' when state='new' and a->>'warning_policy'='confirm' then 'risk' else 'note' end;
   findings:=findings||jsonb_build_array(jsonb_build_object('id',a->>'fingerprint','code','schedule_conflict',
    'conflict_severity',coalesce(a->>'conflict_severity',case when a->>'warning_policy'='confirm' then 'confirm' else 'warn' end),
    'severity',case when warning then 'soft' else 'hard' end,'overrideable',warning,'tier',tier,'introduced',state is distinct from 'accepted',
    'location_id',s.location_id,'location_name',s.location_name,'employee_id',s.employee_id,'employee_name',nullif(s.employee_name,''),
    'scheduled_date',s.scheduled_date,'shift_ids',jsonb_build_array(s.id),'message',left(coalesce(message,'Review this assignment before publishing.'),500))
    ||case when warning then jsonb_build_object('availability_state',state,'warning_policy',a->>'warning_policy') else '{}'::jsonb end);
  end if;
  -- The employee's own mark: listed for a last look, never asked (M9); a
  -- manager's note never reaches Publish (M12).
  if coalesce((a->>'has_availability_conflict')::boolean,false) then
   findings:=findings||jsonb_build_array(jsonb_build_object('id',a->>'availability_fingerprint','code','availability',
    'conflict_severity','warn','severity','soft','overrideable',false,'tier','note',
    'location_id',s.location_id,'location_name',s.location_name,'employee_id',s.employee_id,'employee_name',nullif(s.employee_name,''),
    'scheduled_date',s.scheduled_date,'shift_ids',jsonb_build_array(s.id),
    'message',left(coalesce(nullif(s.employee_name,''),'This person')||' shows as unavailable for this shift.',500)));
  end if;
  -- Time off waiting for a decision over a shift that has not started (FB-6.3).
  if s.employee_id=any(asking) then
   select tstzrange((i->>'start_at')::timestamptz,(i->>'end_at')::timestamptz,'[)') into shift_span
    from jsonb_array_elements(case when a->>'assessment_scope'='shift_interval' then a->'intervals' else a->'unknown_intervals' end) i limit 1;
   if lower(shift_span)>now() then
    pending:=pending||coalesce((select jsonb_agg(jsonb_build_object('employee_id',s.employee_id,'employee_name',nullif(s.employee_name,''),
      'scheduled_date',s.scheduled_date,'location_id',s.location_id,'location_name',s.location_name,'shift_id',s.id,'request_id',r.id,
      -- Which table the request is in, so the web opens it where it lives (time off rebuild D3b).
      'time_off_source',case when exists(select 1 from public.time_off_requests t where t.id=r.id and t.workspace_id=w)
        then 'current' else 'legacy' end))
     from (select distinct away.request_id id from app_private.leave_spans(w,array[s.employee_id],shift_span) away
      where away.pending) r),'[]');
   end if;
  end if;
 end loop;
 findings:=findings||coalesce((select jsonb_agg(jsonb_build_object(
   'id',encode(extensions.digest(convert_to('time_off_pending|'||g.employee_id||'|'||g.scheduled_date||'|'||g.location_id||'|'||g.request_id,'UTF8'),'sha256'),'hex'),
   'code','time_off_pending','severity','soft','overrideable',false,'tier','note',
   'location_id',g.location_id,'location_name',g.location_name,'employee_id',g.employee_id,'employee_name',g.employee_name,
   'scheduled_date',g.scheduled_date,'shift_ids',g.shift_ids,'time_off_request_id',g.request_id,'time_off_source',g.time_off_source,
   'message',left(coalesce(g.employee_name,'This person')||' has time off waiting for a decision on '||to_char(g.scheduled_date,'Mon FMDD'),500))
  order by g.scheduled_date,g.employee_id,g.location_id,g.request_id)
  from (select h->>'employee_id' employee_id,h->>'employee_name' employee_name,(h->>'scheduled_date')::date scheduled_date,
    h->>'location_id' location_id,h->>'location_name' location_name,h->>'request_id' request_id,
    h->>'time_off_source' time_off_source,jsonb_agg(h->'shift_id' order by h->>'shift_id') shift_ids
   from jsonb_array_elements(pending) h group by 1,2,3,4,5,6,7) g),'[]');
 -- BL-198: a draft that would undo an approved shift change is a blocker.
 findings:=findings||public.shift_exchange_draft_undoes(w,(payload->>'draft_id')::uuid,
  array(select (x->>'location_id')::uuid from jsonb_array_elements(coalesce(payload->'locations','[]'::jsonb)) x),departments,include_no_department);
 unsigned:=(payload-'fingerprint'-'status')||jsonb_build_object('findings',findings,'availability_assessments',signatures,'department_ids',to_jsonb(departments),'include_no_department',coalesce(include_no_department,true));
 return unsigned||jsonb_build_object('status',case
  when exists(select 1 from jsonb_array_elements(findings) f where f->>'severity'='hard' and coalesce(f->>'tier','blocker')<>'note') then 'hard_blocked'
  when exists(select 1 from jsonb_array_elements(findings) f where coalesce(f->>'tier','blocker')<>'note' and (coalesce((f->>'introduced')::boolean,true) or not (f->>'overrideable')::boolean)) then 'override_required'
  else 'publish_ready' end,'fingerprint',encode(extensions.digest(convert_to(unsigned::text,'UTF8'),'sha256'),'hex'));
end; $$;
