create or replace function public.list_schedule_weekly_shifts_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_week_start date,
  target_location_ids uuid[] default null,
  target_draft_id uuid default null,
  include_live_context boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not exists (
    select 1
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    join public.workspace_role_permissions permission
      on permission.role_id = role.id and permission.workspace_id = role.workspace_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
      and role.access_class in ('owner', 'admin', 'manager')
      and permission.permission_key = 'schedule.read'
  ) then
    raise exception 'manager schedule read access required' using errcode = '42501';
  end if;

  if target_draft_id is not null and not exists (
    select 1
    from public.schedule_drafts draft
    where draft.id = target_draft_id
      and draft.workspace_id = target_workspace_id
      and draft.week_start = target_week_start
      and draft.archived_at is null
  ) then
    raise exception 'draft not found' using errcode = 'P0002';
  end if;

  with actor_membership as (
    select membership.id, membership.all_locations
    from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
    limit 1
  ), requested_locations as (
    select unnest(coalesce(target_location_ids, array[]::uuid[])) as id
  ), allowed_locations as (
    select location.id
    from public.locations location
    cross join actor_membership membership
    where location.workspace_id = target_workspace_id
      and location.archived_at is null
      and (
        coalesce(array_length(target_location_ids, 1), 0) = 0
        or location.id in (select id from requested_locations)
      )
      and (
        membership.all_locations
        or exists (
          select 1
          from public.membership_location_scopes scope
          where scope.membership_id = membership.id
            and scope.workspace_id = target_workspace_id
            and scope.location_id = location.id
        )
      )
  ), current_publications as (
    select publication.*
    from public.schedule_location_publications publication
    join allowed_locations location on location.id = publication.location_id
    where publication.workspace_id = target_workspace_id
      and publication.week_start = target_week_start
      and publication.status = 'current'
  ), draft_shifts as (
    select
      shift.id,
      shift.workspace_id,
      shift.location_id,
      shift.employee_id,
      shift.job_id,
      shift.shift_type_id,
      shift.scheduled_date,
      shift.start_time,
      shift.end_time,
      shift.crosses_midnight,
      shift.unpaid_break_minutes,
      shift.note
    from public.schedule_draft_shifts shift
    join allowed_locations location on location.id = shift.location_id
    where target_draft_id is not null
      and shift.workspace_id = target_workspace_id
      and shift.draft_id = target_draft_id
      and shift.scheduled_date between target_week_start and target_week_start + 6
  ), published_shifts as (
    select
      shift.source_shift_id as id,
      shift.workspace_id,
      shift.location_id,
      shift.employee_id,
      shift.job_id,
      shift.shift_type_id,
      shift.scheduled_date,
      shift.start_time,
      shift.end_time,
      shift.crosses_midnight,
      shift.unpaid_break_minutes,
      shift.note
    from public.schedule_published_shifts shift
    join current_publications publication on publication.id = shift.publication_id
    where shift.workspace_id = target_workspace_id
      and shift.scheduled_date between target_week_start and target_week_start + 6
  ), selected_shifts as (
    select * from draft_shifts
    union all
    select * from published_shifts where target_draft_id is null
  ), ghost_context as (
    select published.*
    from published_shifts published
    where include_live_context
      and target_draft_id is not null
      and not exists (
        select 1 from draft_shifts draft where draft.id = published.id
      )
  ), selected_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', shift.id,
      'location_id', shift.location_id,
      'employee_id', shift.employee_id,
      'job_id', shift.job_id,
      'shift_type_id', shift.shift_type_id,
      'scheduled_date', shift.scheduled_date,
      'start_time', to_char(shift.start_time, 'HH24:MI'),
      'end_time', to_char(shift.end_time, 'HH24:MI'),
      'crosses_midnight', shift.crosses_midnight,
      'unpaid_break_minutes', coalesce(shift.unpaid_break_minutes, 0),
      'note', shift.note,
      'warning_codes', to_jsonb(array_remove(array[
        case when exists (
          select 1
          from public.schedule_closures closure
          where closure.location_id = shift.location_id
            and closure.closed_date = shift.scheduled_date
            and closure.is_all_day
        ) then 'closed_location' end,
        case when shift.employee_id is not null and exists (
          select 1
          from public.employee_schedule_availability_versions version,
            lateral jsonb_array_elements(version.recurring_rules) rule
          where version.employee_id = shift.employee_id
            and version.version_number = (
              select max(latest.version_number)
              from public.employee_schedule_availability_versions latest
              where latest.employee_id = shift.employee_id
            )
            and (rule->>'day')::integer = extract(dow from shift.scheduled_date)::integer
            and rule->>'mode' = 'unavailable'
        ) then 'availability' end,
        case when shift.employee_id is not null and exists (
          select 1
          from selected_shifts other
          where other.employee_id = shift.employee_id
            and other.scheduled_date = shift.scheduled_date
            and other.id <> shift.id
            and not shift.crosses_midnight and not other.crosses_midnight
            and shift.start_time < other.end_time and shift.end_time > other.start_time
        ) then 'overlap' end
      ]::text[], null))
    ) order by shift.scheduled_date, shift.start_time, shift.id), '[]'::jsonb) as payload
    from selected_shifts shift
  ), ghost_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', shift.id,
      'location_id', shift.location_id,
      'employee_id', shift.employee_id,
      'job_id', shift.job_id,
      'shift_type_id', shift.shift_type_id,
      'scheduled_date', shift.scheduled_date,
      'start_time', to_char(shift.start_time, 'HH24:MI'),
      'end_time', to_char(shift.end_time, 'HH24:MI'),
      'crosses_midnight', shift.crosses_midnight,
      'unpaid_break_minutes', coalesce(shift.unpaid_break_minutes, 0),
      'note', shift.note,
      'warning_codes', to_jsonb(array_remove(array[
        case when exists (
          select 1
          from public.schedule_closures closure
          where closure.location_id = shift.location_id
            and closure.closed_date = shift.scheduled_date
            and closure.is_all_day
        ) then 'closed_location' end,
        case when shift.employee_id is not null and exists (
          select 1
          from public.employee_schedule_availability_versions version,
            lateral jsonb_array_elements(version.recurring_rules) rule
          where version.employee_id = shift.employee_id
            and version.version_number = (
              select max(latest.version_number)
              from public.employee_schedule_availability_versions latest
              where latest.employee_id = shift.employee_id
            )
            and (rule->>'day')::integer = extract(dow from shift.scheduled_date)::integer
            and rule->>'mode' = 'unavailable'
        ) then 'availability' end
      ]::text[], null))
    ) order by shift.scheduled_date, shift.start_time, shift.id), '[]'::jsonb) as payload
    from ghost_context shift
  )
  select jsonb_build_object(
    'shifts', selected_json.payload,
    'ghost_shifts', ghost_json.payload
  )
  into result
  from selected_json, ghost_json;

  return result;
end;
$$;

revoke all on function public.list_schedule_weekly_shifts_service(uuid, uuid, date, uuid[], uuid, boolean)
from public, anon, authenticated;
grant execute on function public.list_schedule_weekly_shifts_service(uuid, uuid, date, uuid[], uuid, boolean)
to service_role;
