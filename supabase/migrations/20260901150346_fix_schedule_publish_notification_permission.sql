create or replace function public.create_schedule_publish_notifications_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_week_start date,
  target_publication_ids uuid[],
  target_employee_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_publication_ids uuid[];
  normalized_employee_ids uuid[];
  inserted_count integer := 0;
begin
  if actor_user_id is null then
    raise exception 'schedule publish access required' using errcode = '42501';
  end if;

  select array_agg(distinct publication_id order by publication_id)
  into normalized_publication_ids
  from unnest(target_publication_ids) publication_id;

  if coalesce(cardinality(normalized_publication_ids), 0) = 0 then
    return jsonb_build_object('status', 'skipped', 'notification_count', 0);
  end if;

  if exists (
    select 1
    from public.schedule_location_publications publication
    where publication.workspace_id = target_workspace_id
      and publication.week_start = target_week_start
      and publication.id = any(normalized_publication_ids)
      and not public.schedule_actor_can_publish_service(
        actor_user_id,
        target_workspace_id,
        publication.location_id
      )
  ) or exists (
    select 1
    from unnest(normalized_publication_ids) publication_id
    where not exists (
      select 1
      from public.schedule_location_publications publication
      where publication.workspace_id = target_workspace_id
        and publication.week_start = target_week_start
        and publication.id = publication_id
    )
  ) then
    raise exception 'schedule publish access required' using errcode = '42501';
  end if;

  select array_agg(distinct employee_id order by employee_id)
  into normalized_employee_ids
  from unnest(coalesce(target_employee_ids, '{}'::uuid[])) employee_id;

  insert into public.notifications(
    workspace_id,
    recipient_user_id,
    category,
    title,
    body,
    action_url,
    source_type,
    source_id,
    event_key,
    created_at
  )
  select distinct
    target_workspace_id,
    employee.user_id,
    'schedule'::public.notification_category,
    'Schedule published',
    'Your schedule for the week of ' || target_week_start::text || ' has been published.',
    '/app/employee-hub?tab=schedule',
    'schedule_publication',
    normalized_publication_ids[1],
    'published:' || target_week_start::text,
    now()
  from public.schedule_published_shifts shift
  join public.schedule_location_publications publication
    on publication.id = shift.publication_id
   and publication.workspace_id = target_workspace_id
   and publication.week_start = target_week_start
   and publication.status = 'current'
  join public.employee_profiles employee
    on employee.id = shift.employee_id
   and employee.workspace_id = target_workspace_id
   and employee.archived_at is null
   and employee.user_id is not null
  where shift.workspace_id = target_workspace_id
    and shift.publication_id = any(normalized_publication_ids)
    and (
      coalesce(cardinality(normalized_employee_ids), 0) = 0
      or employee.id = any(normalized_employee_ids)
    )
  on conflict (recipient_user_id, source_type, source_id, event_key)
  do update set
    created_at = excluded.created_at,
    read_at = null,
    dismissed_at = null;

  get diagnostics inserted_count = row_count;
  return jsonb_build_object('status', 'notified', 'notification_count', inserted_count);
end;
$$;

revoke all on function public.create_schedule_publish_notifications_service(
  uuid,
  uuid,
  date,
  uuid[],
  uuid[]
) from public, anon, authenticated;
grant execute on function public.create_schedule_publish_notifications_service(
  uuid,
  uuid,
  date,
  uuid[],
  uuid[]
) to service_role;
