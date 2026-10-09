create or replace function public.get_schedule_publication_status_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_week_start date
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'week_start', target_week_start,
    'week_end', target_week_start + 6,
    'week_start_day', coalesce(settings.week_start_day, 'monday'::public.schedule_week_start),
    'schedule_deadline_day', coalesce(settings.schedule_deadline_day, 'sunday'::public.schedule_deadline_day),
    'is_anchor_only', false,
    'locations', coalesce(jsonb_agg(jsonb_build_object(
      'id', location.id,
      'name', location.name,
      'color', null,
      'timezone', location.timezone,
      'status', case
        when publication.id is not null then 'published'
        else 'unpublished'
      end,
      'reason', case
        when publication.id is not null and published_counts.shift_count > 0 then 'active_publication_and_shifts'
        when publication.id is not null then 'no_published_shifts'
        else 'missing_publication'
      end,
      'publication_includes_location', publication.id is not null,
      'published_shift_count', coalesce(published_counts.shift_count, 0),
      'worked_shift_count', 0,
      'draft_shift_count', coalesce(draft_counts.shift_count, 0),
      'published_at', publication.published_at,
      'published_by_name', null
    ) order by location.sort_order, location.name), '[]'::jsonb)
  )
  from public.workspace_scheduling_settings settings
  right join public.locations location
    on location.workspace_id = target_workspace_id
   and location.archived_at is null
  left join public.schedule_location_publications publication
    on publication.workspace_id = target_workspace_id
   and publication.location_id = location.id
   and publication.week_start = target_week_start
   and publication.status = 'current'
  left join lateral (
    select count(*)::integer as shift_count
      from public.schedule_published_shifts shift
     where shift.publication_id = publication.id
  ) published_counts on true
  left join lateral (
    select count(*)::integer as shift_count
      from public.schedule_draft_shifts shift
      join public.schedule_drafts draft
        on draft.id = shift.draft_id
       and draft.workspace_id = shift.workspace_id
     where shift.workspace_id = target_workspace_id
       and shift.location_id = location.id
       and draft.week_start = target_week_start
       and draft.archived_at is null
  ) draft_counts on true
  where settings.workspace_id = target_workspace_id
    and public.schedule_actor_has_capability_service(
      actor_user_id,
      target_workspace_id,
      'schedule.read'
    )
    and public.schedule_actor_can_manage_service(
      actor_user_id,
      target_workspace_id,
      location.id
    )
  group by settings.week_start_day, settings.schedule_deadline_day;
$$;

revoke all on function public.get_schedule_publication_status_service(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.get_schedule_publication_status_service(uuid, uuid, date) to service_role;
