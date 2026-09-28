-- BL-234: the join below meant "the draft this edit resumes" (the function's
-- own source_draft_id argument), but schedule_location_publications also has a
-- source_draft_id column, and in a SQL function a bare name that matches both
-- binds to the column. Every publication was joined to the draft it came from,
-- so a week published twice started a new edit from the superseded publication
-- as well, and the publish preview then failed with "more than one row returned
-- by a subquery used as an expression". Only change: the argument is qualified.
create or replace function app_private.schedule_edit_starting_point(
  target_workspace_id uuid,
  target_week_start date,
  target_location_ids uuid[],
  source_draft_id uuid
)
returns uuid[]
language sql
stable
set search_path to ''
as $function$
  select coalesce(array_agg(publication.id order by publication.id), '{}'::uuid[])
  from public.schedule_location_publications publication
  left join public.schedule_drafts draft on draft.id = schedule_edit_starting_point.source_draft_id
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_week_start
    and publication.location_id = any(target_location_ids)
    and case
      when publication.location_id = any(coalesce(draft.location_ids, '{}'::uuid[]))
        then publication.id = any(draft.base_publication_ids)
      else publication.status = 'current'
    end;
$function$;
