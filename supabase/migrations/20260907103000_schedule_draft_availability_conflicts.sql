create function public.list_schedule_draft_availability_conflicts_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_draft_id uuid,
  target_week_start date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  draft_week date;
  conflicts jsonb := '[]'::jsonb;
  fingerprint text := 'none';
begin
  if not public.schedule_actor_has_capability_service(
    actor_user_id,
    target_workspace_id,
    'schedule.manage'
  ) then
    raise exception 'schedule manage access denied' using errcode='42501';
  end if;

  select draft.week_start into draft_week
    from public.schedule_drafts draft
   where draft.id = target_draft_id
     and draft.workspace_id = target_workspace_id
     and draft.archived_at is null
   limit 1;

  if draft_week is null or draft_week <> target_week_start then
    return jsonb_build_object(
      'status', 'ok',
      'conflicts', conflicts,
      'fingerprint', fingerprint
    );
  end if;

  with latest_availability as (
    select distinct on (version.employee_id)
      version.employee_id,
      version.recurring_rules
    from public.employee_schedule_availability_versions version
    where version.workspace_id = target_workspace_id
      and version.effective_at <= now()
    order by version.employee_id, version.version_number desc
  ), candidate_shifts as (
    select shift.id,
           shift.location_id,
           location.name as location_name,
           shift.employee_id,
           trim(profile.first_name || ' ' || profile.last_name) as employee_name,
           shift.shift_type_id,
           shift_type.name as shift_type_label,
           shift.job_id,
           job.name as job_name,
           shift.scheduled_date,
           to_char(shift.start_time, 'HH24:MI') as start_time,
           to_char(shift.end_time, 'HH24:MI') as end_time,
           rule.rule
      from public.schedule_draft_shifts shift
      join public.locations location
        on location.id = shift.location_id
       and location.workspace_id = shift.workspace_id
      join public.employee_profiles profile
        on profile.id = shift.employee_id
       and profile.workspace_id = shift.workspace_id
      left join public.shift_types shift_type
        on shift_type.id = shift.shift_type_id
       and shift_type.workspace_id = shift.workspace_id
      left join public.jobs job
        on job.id = shift.job_id
       and job.workspace_id = shift.workspace_id
      left join latest_availability availability
        on availability.employee_id = shift.employee_id
      left join lateral (
        select item as rule
          from jsonb_array_elements(
            coalesce(availability.recurring_rules, '[]'::jsonb)
          ) item
         where (item->>'day')::integer = extract(dow from shift.scheduled_date)::integer
         limit 1
      ) rule on true
     where shift.workspace_id = target_workspace_id
       and shift.draft_id = target_draft_id
       and shift.employee_id is not null
       and shift.scheduled_date >= target_week_start
       and shift.scheduled_date < target_week_start + 7
  ), violations as (
    select *,
           case
             when rule->>'mode' = 'unavailable'
               then 'Unavailable all day'
             when rule->>'mode' = 'windows'
              and not exists (
                select 1
                  from jsonb_array_elements(coalesce(rule->'windows', '[]'::jsonb)) availability_window
                 where (availability_window->>'start')::time <= candidate_shifts.start_time::time
                   and (availability_window->>'end')::time >= candidate_shifts.end_time::time
              )
               then 'Outside employee availability'
             else null
           end as warning_text
      from candidate_shifts
  ), conflict_rows as (
    select jsonb_build_object(
             'employee_id', employee_id,
             'employee_name', employee_name,
             'shift_id', id,
             'location_id', location_id,
             'location_name', location_name,
             'date', scheduled_date,
             'start_time', start_time,
             'end_time', end_time,
             'shift_type_label', shift_type_label,
             'job_name', job_name,
             'warning_text', warning_text,
             'conflict_fingerprint', 'pending'
           ) as conflict,
           concat_ws(
             '|',
             employee_id,
             id,
             location_id,
             scheduled_date,
             start_time,
             end_time,
             coalesce(shift_type_label, ''),
             coalesce(job_name, ''),
             warning_text
           ) as conflict_key
      from violations
     where warning_text is not null
     order by scheduled_date, start_time, id
  )
  select coalesce(jsonb_agg(conflict), '[]'::jsonb),
         coalesce(
           encode(
             extensions.digest(
               convert_to(string_agg(conflict_key, E'\n' order by conflict_key), 'UTF8'),
               'sha256'
             ),
             'hex'
           ),
           'none'
         )
    into conflicts, fingerprint
    from conflict_rows;

  if fingerprint <> 'none' then
    conflicts := (
      select jsonb_agg(conflict - 'conflict_fingerprint' || jsonb_build_object(
        'conflict_fingerprint',
        fingerprint
      ))
      from jsonb_array_elements(conflicts) conflict
    );
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'conflicts', conflicts,
    'fingerprint', fingerprint
  );
end;
$$;

revoke all on function public.list_schedule_draft_availability_conflicts_service(
  uuid,
  uuid,
  uuid,
  date
) from public, anon, authenticated;

grant execute on function public.list_schedule_draft_availability_conflicts_service(
  uuid,
  uuid,
  uuid,
  date
) to service_role;
