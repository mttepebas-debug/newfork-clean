-- PRESET-SAAT (KARARLAR S-183): a shift type's time options. Besides its primary hours
-- (default_start_time / default_end_time, unchanged, still the ones every type_default shift and
-- default_revision follow) a type keeps up to 8 more start-end pairs. A preset dropped on the Schedule
-- offers the primary first, then these; picking one writes the shift with those hours, shown on its card.
-- Example: Dinner 16:15-23:30 is primary; 17:00-23:00 and 18:00-23:30 are its options.
--
-- public.shift_types.time_options is a jsonb array of {"start_time":"HH:MM","end_time":"HH:MM"}. The
-- trigger shift_types_time_options checks every write (an array of at most 8 objects with exactly those two
-- valid times, start <> end, no pair twice, none equal to the primary hours) and stores the times as
-- HH:MM, refusing anything else with 22023 shift_type.time_options_invalid. Making an option primary is one
-- update that swaps it into the default columns (the existing revision trigger raises default_revision).
-- The browser changes it like the type's other details: a column grant, under the existing
-- shift_types_update_admin policy (settings.shift_catalog.manage). The Schedule read model and the Settings
-- list return it; the employee board does not need it (the shared schema reads a missing list as []).

alter table public.shift_types add column time_options jsonb not null default '[]'::jsonb;
comment on column public.shift_types.time_options is
  'More start-end pairs beside the primary hours, in order: [{"start_time":"HH:MM","end_time":"HH:MM"}], at most 8, no repeats, none equal to the primary (PRESET-SAAT, KARARLAR S-183). Checked and normalized by trigger shift_types_time_options.';

create function app_private.shift_types_time_options()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item jsonb;
  start_at time;
  end_at time;
  pair text;
  seen text[] := '{}';
  normalized jsonb := '[]'::jsonb;
  valid boolean := true;
begin
  if jsonb_typeof(new.time_options) is distinct from 'array' or jsonb_array_length(new.time_options) > 8 then
    valid := false;
  end if;
  if valid and new.default_start_time is not null then
    seen := array[to_char(new.default_start_time, 'HH24:MI') || '-' || to_char(new.default_end_time, 'HH24:MI')];
  elsif valid and jsonb_array_length(new.time_options) > 0 then
    valid := false;
  end if;
  if valid then
    for item in select value from jsonb_array_elements(new.time_options) loop
      if jsonb_typeof(item) is distinct from 'object'
        or (select count(*) from jsonb_object_keys(item)) <> 2
        or jsonb_typeof(item->'start_time') is distinct from 'string'
        or jsonb_typeof(item->'end_time') is distinct from 'string'
        or (item->>'start_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:00)?$'
        or (item->>'end_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:00)?$' then
        valid := false;
        exit;
      end if;
      start_at := (item->>'start_time')::time;
      end_at := (item->>'end_time')::time;
      pair := to_char(start_at, 'HH24:MI') || '-' || to_char(end_at, 'HH24:MI');
      if start_at = end_at or pair = any (seen) then
        valid := false;
        exit;
      end if;
      seen := seen || pair;
      normalized := normalized || jsonb_build_array(jsonb_build_object(
        'start_time', to_char(start_at, 'HH24:MI'), 'end_time', to_char(end_at, 'HH24:MI')));
    end loop;
  end if;
  if not valid then
    raise exception 'Each time needs a start and an end that differ, appears once, and differs from the primary time; up to 8 more times'
      using errcode = '22023', hint = 'shift_type.time_options_invalid';
  end if;
  new.time_options := normalized;
  return new;
end;
$$;
alter function app_private.shift_types_time_options() owner to postgres;
revoke all on function app_private.shift_types_time_options() from public;

create trigger shift_types_time_options
before insert or update of time_options, default_start_time, default_end_time on public.shift_types
for each row execute function app_private.shift_types_time_options();

grant update (time_options) on table public.shift_types to authenticated;

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
        'weekly_availability', coalesce((select jsonb_agg((week.projection - 'note_intervals')
            || jsonb_build_object('manager_notes', note.words,
              'note_author', note.author, 'note_edited_at', note.edited_at,
              'note_intervals', case when note.employee_id is null then '[]'::jsonb else week.projection -> 'note_intervals' end)
            order by week.location_id)
          from week_availability week
          left join readable_notes note on note.employee_id = employee.id
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

CREATE OR REPLACE FUNCTION "public"."list_settings_shift_types_service"("actor_user_id" "uuid", "target_workspace_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.shift_catalog.read');
  return (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order, t.name, t.id), '[]'::jsonb)
    from (
      select shift_type.id, shift_type.workspace_id, shift_type.name, shift_type.color,
        to_char(shift_type.default_start_time, 'HH24:MI') as default_start_time,
        to_char(shift_type.default_end_time, 'HH24:MI') as default_end_time,
        shift_type.default_revision, shift_type.crosses_midnight, shift_type.sort_order, shift_type.archived_at, shift_type.time_options
      from public.shift_types shift_type
      where shift_type.workspace_id = target_workspace_id and shift_type.deleted_at is null
    ) t
  );
end;
$$;
