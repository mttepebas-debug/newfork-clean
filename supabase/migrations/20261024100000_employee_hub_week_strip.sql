-- Home's "Next 7 days" strip (Mert, 2026-10-24): one line per shift, coloured by the shift's type and as long as
-- the shift, and a day off told apart from a day whose schedule is not posted yet. get_employee_hub_service adds,
-- and changes nothing else:
-- 1. On each of the person's own shifts: shift_type_color, shift_type_start_time and shift_type_end_time (the
--    type's colour and default times as HH:MM; null when the shift has no type or the type has no times). The
--    shift's own start_time/end_time stay; the web falls back to the type's when they are null.
-- 2. posted_days: the days of the range whose week has a current publication at one of the person's locations
--    (an assignment not ended). ponytail: a publication's department_ids are not read yet, so a week posted for
--    one department counts as posted for everyone at that location.

CREATE OR REPLACE FUNCTION "public"."get_employee_hub_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_from" "date", "target_to" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare employee public.employee_profiles%rowtype; result jsonb;
begin
  if target_to < target_from or target_to > target_from + 62 then
    raise exception 'employee hub date range is invalid' using errcode = '22023';
  end if;
  employee := public.employee_hub_actor_service(actor_user_id, target_workspace_id);

  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'employee', jsonb_build_object(
      'id', employee.id,
      'display_name', concat_ws(' ', coalesce(nullif(employee.preferred_name,''),employee.first_name), employee.last_name)
    ),
    'time_off_timezone', app_private.time_off_timezone(target_workspace_id, employee.id),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('id',location.id,'name',location.name) order by location.sort_order,location.name)
      from public.employee_location_assignments assignment
      join public.locations location on location.id=assignment.location_id and location.archived_at is null
      where assignment.employee_id=employee.id and assignment.ended_at is null
    ),'[]'::jsonb),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',shift.id,'location_id',shift.location_id,'location_name',location.name,'job_name',job.name,
        'scheduled_date',shift.scheduled_date,'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time',to_char(shift.start_time,'HH24:MI'),
        'end_time',to_char(shift.end_time,'HH24:MI'),'note',shift.note,'employee_id',shift.employee_id,
        'shift_type_name',shift_type.name,'shift_type_color',shift_type.color,
        'shift_type_start_time',to_char(shift_type.default_start_time,'HH24:MI'),
        'shift_type_end_time',to_char(shift_type.default_end_time,'HH24:MI')
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      left join public.shift_types shift_type on shift_type.id=shift.shift_type_id and shift_type.workspace_id=shift.workspace_id
      where shift.workspace_id=target_workspace_id and shift.employee_id=employee.id
        and shift.scheduled_date between target_from and target_to
    ),'[]'::jsonb),
    -- An open shift reaches an employee only offered, in Shift Hub, to who is eligible (Mert, 2026-10-20).
    -- The field stays empty until the clients stop reading it (EKRAN 02 #47).
    'open_shifts', '[]'::jsonb,
    'team_shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',shift.id,'location_id',shift.location_id,'location_name',location.name,'job_name',job.name,
        'scheduled_date',shift.scheduled_date,'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time',to_char(shift.start_time,'HH24:MI'),
        'end_time',to_char(shift.end_time,'HH24:MI'),'note','','employee_id',shift.employee_id,
        'employee_name',concat_ws(' ',coalesce(nullif(teammate.preferred_name,''),teammate.first_name),teammate.last_name),
        'is_management',coalesce((select department.system_key='management' from public.departments department
          where department.id=job.department_id and department.workspace_id=shift.workspace_id),false)
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      join public.employee_profiles teammate on teammate.id=shift.employee_id
      where shift.workspace_id=target_workspace_id and shift.employee_id<>employee.id
        and shift.scheduled_date between target_from and target_to
        and exists(select 1 from public.employee_location_assignments assignment
          where assignment.employee_id=employee.id and assignment.location_id=shift.location_id and assignment.ended_at is null)
    ),'[]'::jsonb),
    -- The days of the range with time off the person has (time off rebuild D3): approved, or what is left
    -- of it (app_private.leave_spans), as days of the zone it was asked in. A piece that ends at midnight is the day before's. My shifts and Home's week read it.
    'leave_days', coalesce((
      select jsonb_agg(to_char(off_day.day, 'YYYY-MM-DD') order by off_day.day)
      from (
        select distinct d::date as day
        from app_private.leave_spans(target_workspace_id, array[employee.id],
          tstzrange((target_from - 1)::timestamp at time zone 'UTC', (target_to + 2)::timestamp at time zone 'UTC', '[)')) away
        cross join lateral generate_series((lower(away.span) at time zone away.zone)::date,
          ((upper(away.span) - interval '1 microsecond') at time zone away.zone)::date, interval '1 day') d
        where not away.pending
      ) off_day
      where off_day.day between target_from and target_to
    ),'[]'::jsonb),
    -- The days of the range whose week is posted at one of the person's locations: a day with no shift there is
    -- a day off, not a schedule still to come (Home's week strip).
    'posted_days', coalesce((
      select jsonb_agg(to_char(posted.day, 'YYYY-MM-DD') order by posted.day)
      from (
        select d::date as day
        from generate_series(target_from, target_to, interval '1 day') d
        where exists(select 1 from public.schedule_location_publications publication
          join public.employee_location_assignments assignment
            on assignment.location_id=publication.location_id and assignment.employee_id=employee.id and assignment.ended_at is null
          where publication.workspace_id=target_workspace_id and publication.status='current'
            and publication.week_start<=d::date and d::date<publication.week_start+7)
      ) posted
    ),'[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',teammate.id,
        'display_name',concat_ws(' ',coalesce(nullif(teammate.preferred_name,''),teammate.first_name),teammate.last_name),
        'job_names',coalesce((select jsonb_agg(job.name order by lower(job.name),job.id) from public.employee_job_assignments assignment join public.jobs job on job.id=assignment.job_id where assignment.employee_id=teammate.id and assignment.ended_at is null),'[]'::jsonb),
        'location_names',coalesce((select jsonb_agg(location.name order by location.sort_order,location.name) from public.employee_location_assignments assignment join public.locations location on location.id=assignment.location_id where assignment.employee_id=teammate.id and assignment.ended_at is null),'[]'::jsonb)
      ) order by teammate.last_name,teammate.first_name)
      from public.employee_profiles teammate
      where teammate.workspace_id=target_workspace_id and teammate.archived_at is null and teammate.id<>employee.id
        and exists(select 1 from public.employee_location_assignments mine join public.employee_location_assignments theirs on theirs.location_id=mine.location_id and theirs.ended_at is null where mine.employee_id=employee.id and mine.ended_at is null and theirs.employee_id=teammate.id)
    ),'[]'::jsonb)
  ) into result;
  return result;
end; $$;


ALTER FUNCTION "public"."get_employee_hub_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_from" "date", "target_to" "date") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_employee_hub_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_from" "date", "target_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_employee_hub_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_from" "date", "target_to" "date") TO "service_role";
