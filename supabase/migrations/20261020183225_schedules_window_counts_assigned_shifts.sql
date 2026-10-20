-- QA 41 (Mert, 2026-10-20): an open shift is in no total, the grid's way.
-- The Schedules window counted every shift of a schedule, open ones too, so it
-- said more shifts and hours than the grid. Shifts and paid minutes now count
-- assigned shifts only; open shifts are told apart as open_shift_count.
-- Same signature, scope and grants; only the three numbers change.

CREATE OR REPLACE FUNCTION "public"."list_schedule_drafts_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_week_start" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare edit_scope uuid[]; org_wide boolean;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit',
    target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.edit'));
  edit_scope := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.edit');
  org_wide := app_private.authz_reason(actor_user_id, target_workspace_id, 'schedule.edit', '{}'::uuid[]) is null;
  return jsonb_build_object('drafts', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', draft.id, 'workspace_id', draft.workspace_id,
      'week_start', draft.week_start, 'name', draft.name,
      'revision', draft.revision, 'created_by', draft.created_by,
      'updated_by', draft.updated_by, 'created_at', draft.created_at,
      'updated_at', draft.updated_at,
      'updated_by_name', coalesce((
        select nullif(profile.display_name, '') from public.user_profiles profile
        where profile.user_id = draft.updated_by), 'Team member'),
      'shift_count', facts.shift_count, 'paid_minutes', facts.paid_minutes,
      'open_shift_count', facts.open_shift_count
    ) order by draft.updated_at desc, draft.name)
    from public.schedule_drafts draft
    cross join lateral (
      select count(*) filter (where shift.employee_id is not null)::integer as shift_count,
        coalesce(sum(greatest(0, (case when shift.end_time <= shift.start_time then 1440 else 0 end
          + extract(epoch from (shift.end_time - shift.start_time)) / 60)::integer
          - shift.unpaid_break_minutes)) filter (where shift.employee_id is not null), 0)::integer as paid_minutes,
        count(*) filter (where shift.employee_id is null)::integer as open_shift_count
      from public.schedule_draft_shifts shift
      where shift.draft_id = draft.id and shift.workspace_id = target_workspace_id
        and (org_wide or shift.location_id = any (edit_scope))
    ) facts
    where draft.workspace_id = target_workspace_id
      and draft.week_start = target_week_start and draft.archived_at is null
      and (org_wide or draft.location_ids && edit_scope)
  ), '[]'::jsonb),
  'published', (
    select jsonb_build_object('shift_count', count(*) filter (where shift.employee_id is not null)::integer,
      'paid_minutes', coalesce(sum(greatest(0, (case when shift.end_time <= shift.start_time then 1440 else 0 end
        + extract(epoch from (shift.end_time - shift.start_time)) / 60)::integer
        - shift.unpaid_break_minutes)) filter (where shift.employee_id is not null), 0)::integer,
      'open_shift_count', count(*) filter (where shift.employee_id is null)::integer)
    from public.schedule_published_shifts shift
    join public.schedule_location_publications publication
      on publication.id = shift.publication_id and publication.workspace_id = shift.workspace_id
    where publication.workspace_id = target_workspace_id
      and publication.week_start = target_week_start and publication.status = 'current'
      and (org_wide or shift.location_id = any (edit_scope))
  ));
end;
$$;
