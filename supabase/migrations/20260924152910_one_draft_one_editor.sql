-- FOUNDATION-B 3b: a schedule edit locks its draft, not its locations (user
-- decision 2026-09-24, option A).
--
-- Before (stage 3): an edit held one lock per location and week
-- (schedule_edit_locks), so nobody else could open a location somebody was
-- editing, not even to build a different draft.
--
-- After:
-- * one person edits a draft at a time; opening a draft somebody else is
--   editing names them and takes nothing, and an expired edit of it is closed
--   with its unsaved work kept as a recovery draft, as before;
-- * edits of different drafts, and edits started from the published week or
--   from a blank week, never block each other;
-- * an edit and its draft remember which publication each location had when
--   the work started (base_publication_ids); the publish preview says, per
--   location, who published or unpublished it since and when, so the publisher
--   decides knowing it; publishing makes what the draft just published its new
--   starting point.
-- Edits and drafts keep their locations: saving replaces a draft only at the
-- edit's locations, and a draft publishes only the locations it covers.

-- 1. The location and week lock goes ------------------------------------------

drop trigger schedule_edit_session_releases_locks on public.schedule_edit_sessions;
drop function app_private.release_schedule_edit_locks();
drop table public.schedule_edit_locks;

-- 2. One editor per draft -------------------------------------------------------

create unique index schedule_edit_sessions_active_draft_idx
  on public.schedule_edit_sessions (source_draft_id)
  where status = 'active';

-- 3. Where the work started -------------------------------------------------------

alter table public.schedule_edit_sessions
  add column base_publication_ids uuid[] not null default '{}';
alter table public.schedule_drafts
  add column base_publication_ids uuid[] not null default '{}';

-- Drafts and open edits that exist today count as started from today's
-- publications.
update public.schedule_drafts draft
set base_publication_ids = array(
  select publication.id from public.schedule_location_publications publication
  where publication.workspace_id = draft.workspace_id
    and publication.week_start = draft.week_start
    and publication.status = 'current'
    and publication.location_id = any(draft.location_ids)
  order by publication.id
);
update public.schedule_edit_sessions session
set base_publication_ids = array(
  select publication.id from public.schedule_location_publications publication
  where publication.workspace_id = session.workspace_id
    and publication.week_start = session.week_start
    and publication.status = 'current'
    and publication.location_id = any(session.location_ids)
  order by publication.id
)
where session.status = 'active';

-- The publications an edit of these locations starts from: where the source
-- draft covers a location, the draft's own starting point (its content was
-- built on that); anywhere else, the publication the location has now.
create function app_private.schedule_edit_starting_point(
  target_workspace_id uuid,
  target_week_start date,
  target_location_ids uuid[],
  source_draft_id uuid
)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(publication.id order by publication.id), '{}'::uuid[])
  from public.schedule_location_publications publication
  left join public.schedule_drafts draft on draft.id = source_draft_id
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_week_start
    and publication.location_id = any(target_location_ids)
    and case
      when publication.location_id = any(coalesce(draft.location_ids, '{}'::uuid[]))
        then publication.id = any(draft.base_publication_ids)
      else publication.status = 'current'
    end;
$$;

-- Publishing a draft makes what it published its new starting point there.
create function app_private.draft_starts_from_its_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.schedule_drafts draft
  set base_publication_ids = array(
    select base_id from unnest(draft.base_publication_ids) base_id
    where not exists (
      select 1 from public.schedule_location_publications publication
      where publication.id = base_id and publication.location_id = new.location_id
    )
  ) || new.id
  where draft.id = new.source_draft_id;
  return null;
end;
$$;
create trigger schedule_publication_moves_draft_start
after insert on public.schedule_location_publications
for each row when (new.source_draft_id is not null)
execute function app_private.draft_starts_from_its_publication();

-- What the publish preview adds to each location: who published or unpublished
-- it after the draft's work there started, and when (null when nothing did).
create function app_private.schedule_publication_changes_since_start(preview jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case when jsonb_typeof(preview -> 'locations') is distinct from 'array' then preview
  else jsonb_set(preview, '{locations}', coalesce((
    select jsonb_agg(item || jsonb_build_object('changed_since_start', (
      select case
        when current_publication.id is not null then jsonb_build_object(
          'kind', 'published',
          'by_name', coalesce(publisher.display_name, 'Another manager'),
          'at', current_publication.published_at)
        else jsonb_build_object(
          'kind', 'unpublished',
          'by_name', coalesce(unpublisher.display_name, 'Another manager'),
          'at', latest.unpublished_at)
      end
      from public.schedule_drafts draft
      left join public.schedule_location_publications current_publication
        on current_publication.id = nullif(item ->> 'active_publication_id', '')::uuid
      left join public.user_profiles publisher on publisher.user_id = current_publication.published_by
      left join lateral (
        select publication.* from public.schedule_location_publications publication
        where publication.location_id = (item ->> 'location_id')::uuid
          and publication.week_start = draft.week_start
        order by publication.version_number desc
        limit 1
      ) latest on true
      left join public.user_profiles unpublisher on unpublisher.user_id = latest.unpublished_by
      where draft.id = (preview ->> 'draft_id')::uuid
        and current_publication.id is distinct from (
          select publication.id from public.schedule_location_publications publication
          where publication.id = any(draft.base_publication_ids)
            and publication.location_id = (item ->> 'location_id')::uuid
        )
    )) order by position)
    from jsonb_array_elements(preview -> 'locations') with ordinality entry(item, position)
  ), '[]'::jsonb)) end;
$$;

revoke all on function app_private.schedule_edit_starting_point(uuid, date, uuid[], uuid) from public, anon, authenticated;
revoke all on function app_private.draft_starts_from_its_publication() from public, anon, authenticated;
revoke all on function app_private.schedule_publication_changes_since_start(jsonb) from public, anon, authenticated;

-- 4. Opening an edit ---------------------------------------------------------------

create or replace function public.acquire_schedule_edit_session_service_past_week_base(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_week_start date,
  requested_source public.schedule_edit_source,
  requested_draft_id uuid default null,
  target_location_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  manageable uuid[];
  effective uuid[];
  adding uuid[];
  own_session public.schedule_edit_sessions%rowtype;
  holder public.schedule_edit_sessions%rowtype;
  source_draft public.schedule_drafts%rowtype;
  edit_session_id uuid;
  session_source public.schedule_edit_source;
  session_draft_id uuid;
  recovery_draft_id uuid;
begin
  perform public.availability_lock_workspace(target_workspace_id);

  -- Where this person may edit. A blank list reaches nowhere.
  select coalesce(array_agg(location.id order by location.id), '{}') into manageable
  from public.locations location
  where location.workspace_id = target_workspace_id
    and location.archived_at is null
    and public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, location.id);
  select coalesce(array_agg(distinct requested order by requested), '{}') into effective
  from unnest(coalesce(target_location_ids, manageable)) requested
  where requested = any(manageable);
  if cardinality(effective) = 0 then
    raise exception 'schedule manage access denied' using errcode = '42501';
  end if;

  select * into own_session
  from public.schedule_edit_sessions session
  where session.workspace_id = target_workspace_id
    and session.week_start = target_week_start
    and session.holder_user_id = actor_user_id
    and session.status = 'active'
  for update;
  adding := array(
    select location_id from unnest(effective) location_id
    where own_session.id is null or not location_id = any(own_session.location_ids)
  );

  if own_session.id is null and requested_source = 'draft' then
    select * into source_draft
    from public.schedule_drafts draft
    where draft.id = requested_draft_id
      and draft.workspace_id = target_workspace_id
      and draft.week_start = target_week_start
      and draft.archived_at is null;
    if source_draft.id is null then
      raise exception 'draft not found' using errcode = 'P0002';
    end if;

    -- One person edits a draft at a time: say who, take nothing.
    select * into holder
    from public.schedule_edit_sessions session
    where session.source_draft_id = source_draft.id
      and session.status = 'active'
    for update;
    if holder.id is not null and holder.expires_at > now() then
      return jsonb_build_object(
        'status', 'conflict',
        'session_id', holder.id,
        'holder_name', coalesce((
          select profile.display_name from public.user_profiles profile
          where profile.user_id = holder.holder_user_id
        ), 'Another manager'),
        'last_heartbeat', holder.last_heartbeat,
        'expires_at', holder.expires_at
      );
    end if;

    -- An expired edit of the draft closes; unsaved work becomes a recovery draft.
    if holder.id is not null then
      if holder.dirty then
        insert into public.schedule_drafts (
          workspace_id, week_start, name, created_by, updated_by, location_ids, base_publication_ids
        ) values (
          target_workspace_id, target_week_start,
          'Recovered edit ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS') || ' ' || left(holder.id::text, 4),
          holder.holder_user_id, holder.holder_user_id, holder.location_ids, holder.base_publication_ids
        ) returning id into recovery_draft_id;
        insert into public.schedule_draft_shifts (id, workspace_id, draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision)
        select id, workspace_id, recovery_draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision
        from public.schedule_edit_session_shifts
        where session_id = holder.id;
      end if;
      update public.schedule_edit_sessions
      set status = case when recovery_draft_id is null then 'expired'::public.schedule_edit_session_status
                        else 'recovered'::public.schedule_edit_session_status end,
          recovered_draft_id = recovery_draft_id,
          closed_at = now()
      where id = holder.id;
    end if;
  end if;

  if own_session.id is not null then
    -- BL-069: the same person picks their edit back up, widened to the new locations.
    update public.schedule_edit_sessions
    set last_heartbeat = now(),
        expires_at = now() + interval '4 minutes',
        location_ids = array(
          select distinct location_id from unnest(own_session.location_ids || adding) location_id
          order by location_id
        ),
        base_publication_ids = own_session.base_publication_ids || app_private.schedule_edit_starting_point(
          target_workspace_id, target_week_start, adding, own_session.source_draft_id
        )
    where id = own_session.id;
    edit_session_id := own_session.id;
    session_source := own_session.source_kind;
    session_draft_id := own_session.source_draft_id;
  else
    insert into public.schedule_edit_sessions (
      workspace_id, week_start, source_kind, source_draft_id, source_revision,
      holder_user_id, location_ids, base_publication_ids
    ) values (
      target_workspace_id, target_week_start, requested_source,
      case when requested_source = 'draft' then source_draft.id end,
      case when requested_source = 'draft' then source_draft.revision else 0 end,
      actor_user_id, effective,
      app_private.schedule_edit_starting_point(target_workspace_id, target_week_start, effective, source_draft.id)
    ) returning id into edit_session_id;
    session_source := requested_source;
    session_draft_id := source_draft.id;
  end if;

  if session_source = 'published' then
    insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note)
    select shift.source_shift_id, shift.workspace_id, edit_session_id, shift.location_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note
    from public.schedule_published_shifts shift
    join public.schedule_location_publications publication on publication.id = shift.publication_id
    where shift.workspace_id = target_workspace_id
      and publication.week_start = target_week_start
      and publication.status = 'current'
      and shift.location_id = any(adding);
  elsif session_source = 'draft' then
    insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision)
    select shift.id, shift.workspace_id, edit_session_id, shift.location_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.revision
    from public.schedule_draft_shifts shift
    where shift.draft_id = session_draft_id
      and shift.location_id = any(adding);
  end if;

  return jsonb_build_object(
    'status', case
      when own_session.id is not null then 'resumed'
      when recovery_draft_id is not null then 'acquired_after_recovery'
      else 'acquired'
    end,
    'session', public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, edit_session_id),
    'recovered_draft_id', recovery_draft_id
  );
end;
$function$;

-- 5. Saving carries where the work started into the draft --------------------------

create or replace function public.save_schedule_edit_session_service_base(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid,
  expected_session_revision integer,
  target_name text,
  target_draft_id uuid default null,
  expected_draft_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_session public.schedule_edit_sessions%rowtype;
  saved_draft public.schedule_drafts%rowtype;
begin
 perform public.availability_lock_workspace(target_workspace_id);
  select * into target_session from public.schedule_edit_sessions session
  where session.id = target_session_id and session.workspace_id = target_workspace_id
  for update;
  if target_session.id is null or target_session.holder_user_id <> actor_user_id then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;
  if target_session.status <> 'active' or target_session.expires_at <= now() then
    raise exception 'edit lease expired' using errcode = '40001';
  end if;
  if target_session.revision <> expected_session_revision then
    raise exception 'session revision stale' using errcode = '40001';
  end if;
  if char_length(btrim(target_name)) not between 1 and 80 then
    raise exception 'invalid draft name' using errcode = '22023';
  end if;

  if target_draft_id is null then
    insert into public.schedule_drafts (
      workspace_id, week_start, name, created_by, updated_by, location_ids, base_publication_ids
    ) values (
      target_workspace_id, target_session.week_start, btrim(target_name),
      actor_user_id, actor_user_id, target_session.location_ids, target_session.base_publication_ids
    ) returning * into saved_draft;
  else
    update public.schedule_drafts draft
    set name = btrim(target_name), revision = revision + 1,
      updated_by = actor_user_id, updated_at = now(),
      location_ids = array(
        select distinct location_id from unnest(draft.location_ids || target_session.location_ids) location_id
        order by location_id
      ),
      -- The edit's locations now start where the edit started.
      base_publication_ids = array(
        select base_id from unnest(draft.base_publication_ids) base_id
        where not exists (
          select 1 from public.schedule_location_publications publication
          where publication.id = base_id
            and publication.location_id = any(target_session.location_ids)
        )
      ) || target_session.base_publication_ids
    where draft.id = target_draft_id and draft.workspace_id = target_workspace_id
      and draft.week_start = target_session.week_start and draft.archived_at is null
      and draft.revision = expected_draft_revision
    returning * into saved_draft;
    if saved_draft.id is null then
      raise exception 'draft revision stale' using errcode = '40001';
    end if;
  end if;

  -- BL-097: only the locations this session holds are replaced; the rest of
  -- the draft stays as it was.
  delete from public.schedule_draft_shifts shift
  where shift.draft_id = saved_draft.id
    and shift.location_id = any(target_session.location_ids);
  insert into public.schedule_draft_shifts (id, workspace_id, draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision)
  select shift.id, shift.workspace_id, saved_draft.id, shift.location_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.revision from public.schedule_edit_session_shifts shift
  where shift.session_id = target_session_id;

  delete from public.schedule_edit_session_shifts where session_id = target_session_id;
  update public.schedule_edit_sessions
  set status = 'saved', dirty = false, closed_at = now(), expires_at = now()
  where id = target_session_id;

  return jsonb_build_object(
    'id', saved_draft.id, 'workspace_id', saved_draft.workspace_id,
    'week_start', saved_draft.week_start, 'name', saved_draft.name,
    'revision', saved_draft.revision, 'created_by', saved_draft.created_by,
    'updated_by', saved_draft.updated_by, 'created_at', saved_draft.created_at,
    'updated_at', saved_draft.updated_at
  );
exception
  when unique_violation then
    raise exception 'draft name conflict' using errcode = '23505';
end;
$function$;

-- 6. The publish preview says what changed since the work started ---------------------

create or replace function public.preview_schedule_publication_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_draft_id uuid,
  target_location_ids uuid[],
  target_department_ids uuid[],
  include_no_department boolean
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
 select app_private.schedule_publication_changes_since_start(public.weekly_schedule_publication_preflight(public.preview_schedule_publication_before_availability_review_service(actor_user_id,target_workspace_id,target_draft_id,target_location_ids,target_department_ids,include_no_department),actor_user_id,target_department_ids,include_no_department));
$function$;
