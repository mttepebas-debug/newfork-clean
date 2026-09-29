-- The New Schedule menu marks the draft a week was published from and names it.
-- The status already answers only for locations the caller may edit, so the
-- draft's name reaches no one who could not open that draft; it stays readable
-- after the draft itself is deleted (archived).
CREATE OR REPLACE FUNCTION public.get_schedule_publication_status_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        when publication.id is not null and published_counts.shift_count > 0 then 'published'
        else 'unpublished'
      end,
      'reason', case
        when publication.id is not null and published_counts.shift_count > 0 then 'active_publication_and_shifts'
        when publication.id is not null then 'no_published_shifts'
        else 'missing_publication'
      end,
      'publication_includes_location', publication.id is not null,
      'published_shift_count', coalesce(published_counts.shift_count, 0),
      'draft_shift_count', coalesce(draft_counts.shift_count, 0),
      'published_at', publication.published_at,
      'published_by_name', null,
      'source_draft_id', publication.source_draft_id,
      'source_draft_name', source_draft.name
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
  left join public.schedule_drafts source_draft
    on source_draft.id = publication.source_draft_id
   and source_draft.workspace_id = target_workspace_id
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
    and location.id = any ((select app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.read'))::uuid[])
    and location.id = any ((select app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.edit'))::uuid[])
  group by settings.week_start_day, settings.schedule_deadline_day;
$function$
;
