-- YONETICI-HOME (BL-1156, KARARLAR S-210): the managers' Home, "Locations first".
-- One read for what Workspace's dashboard does not hold: each location's day
-- (today's shifts for "on now" and the hour-by-hour line, the Management shifts
-- for "Manager on the floor", the next seven days with their open and
-- unpublished days, the open shifts), the people working without a required
-- document (S-206's warning, by location), and the time off waiting on an
-- answer. Adds one function; changes nothing that exists.
--
-- Gates: Home's own (workspace.todos, as Workspace's dashboard, KK-34); the
-- locations are the actor's schedule.read scope (scope_set); a person's
-- documents are read by documents.read and a request by requests.read, each
-- asked of the core per row.

create function public.get_manager_home_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me app_private.actor_state;
  documents_rule app_private.authz_actions;
  places uuid[];
  result jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.todos');
  me := app_private.actor(actor_user_id, target_workspace_id);
  places := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.read');
  select * into documents_rule from app_private.authz_actions r where r.key = 'documents.read';

  with place as (
    select l.id, l.name, l.timezone, (now() at time zone l.timezone)::date as today
    from public.locations l
    where l.workspace_id = target_workspace_id
      and l.id = any(places)
  ),
  shift as (
    select s.id, s.location_id, s.employee_id, s.job_id, s.scheduled_date,
      (s.scheduled_date + s.start_time) at time zone s.time_timezone as starts_at,
      (s.scheduled_date + s.end_time + case when s.crosses_midnight then interval '1 day' else interval '0 days' end)
        at time zone s.time_timezone as ends_at
    from public.schedule_published_shifts s
    join public.schedule_location_publications p on p.id = s.publication_id and p.status = 'current'
    join place on place.id = s.location_id
    where s.workspace_id = target_workspace_id
      -- Every zone's date is within a day of UTC's: keeps the date index range.
      and s.scheduled_date between (now() at time zone 'UTC')::date - 2 and (now() at time zone 'UTC')::date + 8
      and s.scheduled_date between place.today - 1 and place.today + 6
  ),
  person as (
    select e.id, btrim(coalesce(nullif(btrim(e.preferred_name), ''), e.first_name) || ' ' || e.last_name) as name
    from public.employee_profiles e
    where e.workspace_id = target_workspace_id
  )
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'now', now(),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', place.id,
        'name', place.name,
        'timezone', place.timezone,
        'today', place.today,
        -- Today's shifts there, last night's that run into it too: "on now" and the hours line.
        'today_shifts', coalesce((
          select jsonb_agg(jsonb_build_object('starts_at', shift.starts_at, 'ends_at', shift.ends_at,
            'open', shift.employee_id is null) order by shift.starts_at, shift.id)
          from shift
          where shift.location_id = place.id
            and shift.scheduled_date <= place.today
            and shift.ends_at > place.today::timestamp at time zone place.timezone
        ), '[]'::jsonb),
        -- S-163 (7): somebody in a Management job on a published shift there today.
        'floor_managers', coalesce((
          select jsonb_agg(jsonb_build_object('name', person.name, 'starts_at', shift.starts_at, 'ends_at', shift.ends_at)
            order by shift.starts_at, person.name)
          from shift
          join person on person.id = shift.employee_id
          join public.jobs job on job.id = shift.job_id
          join public.departments department on department.id = job.department_id and department.system_key = 'management'
          where shift.location_id = place.id
            and shift.scheduled_date <= place.today
            and shift.ends_at > place.today::timestamp at time zone place.timezone
        ), '[]'::jsonb),
        'week', (
          select jsonb_agg(jsonb_build_object(
            'date', day.date,
            'shifts', (select count(*) from shift where shift.location_id = place.id and shift.scheduled_date = day.date),
            'open', (select count(*) from shift where shift.location_id = place.id and shift.scheduled_date = day.date and shift.employee_id is null),
            'published', exists (
              select 1 from public.schedule_location_publications publication
              where publication.location_id = place.id and publication.status = 'current'
                and day.date >= publication.week_start and day.date < publication.week_start + 7)
          ) order by day.date)
          from (select (place.today + offset_days)::date as date from generate_series(0, 6) offset_days) day
        ),
        'open_shifts', coalesce((
          select jsonb_agg(jsonb_build_object('date', open_shift.scheduled_date, 'starts_at', open_shift.starts_at,
            'ends_at', open_shift.ends_at, 'job_name', open_shift.job_name) order by open_shift.starts_at)
          from (
            select shift.scheduled_date, shift.starts_at, shift.ends_at, job.name as job_name
            from shift join public.jobs job on job.id = shift.job_id
            where shift.location_id = place.id and shift.employee_id is null and shift.ends_at > now()
            order by shift.starts_at, shift.id
            limit 12
          ) open_shift
        ), '[]'::jsonb),
        -- S-206: whoever works here without a required document, as the documents rule lets the actor see.
        'missing_documents', coalesce((
          select jsonb_agg(jsonb_build_object('employee_id', missing.employee_id, 'name', missing.name,
            'document', missing.title) order by missing.name, missing.title)
          from (
            select distinct requirement.employee_id, person.name, requirement.title
            from public.employee_onboarding_requirements requirement
            join person on person.id = requirement.employee_id
            join public.employee_profiles profile on profile.id = requirement.employee_id and profile.archived_at is null
            where requirement.workspace_id = target_workspace_id
              and requirement.kind = 'document'
              and requirement.required
              and not requirement.owner_excused
              and exists (
                select 1 from public.employee_location_assignments assignment
                where assignment.employee_id = requirement.employee_id and assignment.location_id = place.id
                  and assignment.ended_at is null)
              and app_private.document_obligation_state(requirement, now()) in ('missing', 'rejected', 'expired')
              and app_private.authz_check(me, documents_rule, null, requirement.employee_id, null) is null
            order by person.name, requirement.title
            limit 20
          ) missing
        ), '[]'::jsonb)
      ) order by place.name, place.id)
      from place
    ), '[]'::jsonb),
    -- Time off waiting on an answer the actor may read, with the person's locations in view.
    'time_off', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', request.id,
        'employee_id', request.employee_id,
        'employee_name', person.name,
        'first_date', (select min(segment.segment_date) from public.schedule_time_off_segments segment where segment.request_id = request.id),
        'last_date', (select max(segment.segment_date) from public.schedule_time_off_segments segment where segment.request_id = request.id),
        'location_ids', coalesce((
          select jsonb_agg(assignment.location_id order by assignment.is_primary desc, assignment.location_id)
          from public.employee_location_assignments assignment
          where assignment.employee_id = request.employee_id and assignment.ended_at is null
            and assignment.location_id = any(places)
        ), '[]'::jsonb)
      ) order by request.created_at, request.id)
      from (
        select r.*
        from public.schedule_time_off_requests r
        where r.workspace_id = target_workspace_id
          and r.status = 'pending'
          and r.request_type = 'time_off'
          and app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', r.employee_id) is null
        order by r.created_at, r.id
        limit 50
      ) request
      join person on person.id = request.employee_id
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_manager_home_service(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_manager_home_service(uuid, uuid) to service_role;
