create or replace function public.unpublish_schedule_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_week_start date,
  target_location_ids uuid[],
  expected_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  preview jsonb;
  normalized_locations uuid[];
  publication_ids uuid[];
  kept_worked_count integer := 0;
  effective_unpublished_at timestamptz := now();
begin
  select array_agg(distinct location_id order by location_id) into normalized_locations
  from unnest(target_location_ids) location_id;
  perform 1 from public.schedule_location_publications publication
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_week_start
    and publication.location_id = any(normalized_locations)
    and publication.status = 'current' for update;
  preview := public.preview_schedule_unpublication_service(
    actor_user_id, target_workspace_id, target_week_start, normalized_locations
  );
  if preview->>'status' = 'past_week_closed' then
    raise exception 'past schedule week is closed' using errcode = '42501';
  end if;
  if preview->>'fingerprint' <> expected_fingerprint then
    raise exception 'stale unpublication preview' using errcode = '40001';
  end if;
  select array_agg((item->>'publication_id')::uuid order by item->>'publication_id')
  into publication_ids from jsonb_array_elements(preview->'locations') item;

  select count(distinct shift.id)::integer
  into kept_worked_count
  from public.schedule_published_shifts shift
  join public.locations location
    on location.id = shift.location_id
    and location.workspace_id = shift.workspace_id
  where shift.publication_id = any(publication_ids)
    and shift.employee_id is not null
    and exists (
      select 1
      from public.time_sessions session
      where session.workspace_id = shift.workspace_id
        and session.employee_id = shift.employee_id
        and session.location_id = shift.location_id
        and (
          (session.effective_started_at at time zone location.timezone)::date = shift.scheduled_date
          or (session.effective_ended_at at time zone location.timezone)::date = shift.scheduled_date
        )
    );

  update public.schedule_location_publications
  set status = 'unpublished', unpublished_by = actor_user_id,
    unpublished_at = effective_unpublished_at
  where id = any(publication_ids) and status = 'current';
  if not found then raise exception 'stale unpublication preview' using errcode = '40001'; end if;
  insert into public.schedule_publication_events (
    workspace_id, week_start, action, actor_user_id, location_ids,
    publication_ids, preflight_fingerprint, diff_summary
  ) values (
    target_workspace_id, target_week_start, 'unpublished', actor_user_id,
    normalized_locations, publication_ids, expected_fingerprint,
    jsonb_build_object('locations', preview->'locations')
  );
  return jsonb_build_object(
    'status', 'unpublished', 'workspace_id', target_workspace_id,
    'week_start', target_week_start, 'location_ids', to_jsonb(normalized_locations),
    'publication_ids', to_jsonb(publication_ids),
    'kept_worked_count', kept_worked_count,
    'unpublished_at', effective_unpublished_at
  );
end;
$$;
