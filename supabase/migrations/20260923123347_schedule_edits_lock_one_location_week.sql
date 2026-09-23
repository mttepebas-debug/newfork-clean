-- FOUNDATION-B stage 3: a schedule edit locks one location and week, not the
-- whole workspace week.
--
-- Before: one active edit session per workspace week. Saving deleted the
-- draft's shifts at every location the saver could manage and put back only
-- the ones the session had loaded, so an admin who took over a Kadikoy edit
-- and saved erased Besiktas from the draft (BL-097). Publishing replaced each
-- requested location's publication with the draft's shifts there, so a draft
-- that never covered Besiktas published Besiktas as empty.
--
-- After:
-- * a session carries its locations (location_ids) and holds one lock per
--   location and week (schedule_edit_locks); two managers edit two locations
--   of the same week at the same time;
-- * opening an edit takes the requested locations the person may edit (all of
--   them when none are named); if somebody else holds one, the answer names
--   who holds which and which are free, and nothing is taken;
-- * a session's shifts can only be at its own locations; saving replaces the
--   draft's shifts at those locations only;
-- * a draft remembers the locations it covers; publishing a location the
--   draft does not cover is refused (22023) instead of emptying it;
-- * taking over a session needs the right to edit every location it holds;
-- * the availability check treats an open edit or a draft as replacing the
--   published week only at its own locations, so a shift at another location
--   still counts for overlap and travel time.

-- 1. Sessions and drafts carry their locations -------------------------------

alter table public.schedule_edit_sessions add column location_ids uuid[];
update public.schedule_edit_sessions session
set location_ids = coalesce((
  select array_agg(location.id order by location.id)
  from public.locations location
  where location.workspace_id = session.workspace_id
), '{}');
-- A session in a workspace with no location never had anything to edit.
delete from public.schedule_edit_sessions where cardinality(location_ids) = 0;
alter table public.schedule_edit_sessions
  alter column location_ids set not null,
  add constraint schedule_edit_sessions_location_ids_check check (cardinality(location_ids) > 0);

alter table public.schedule_drafts add column location_ids uuid[];
update public.schedule_drafts draft
set location_ids = coalesce((
  select array_agg(distinct shift.location_id order by shift.location_id)
  from public.schedule_draft_shifts shift
  where shift.draft_id = draft.id
), '{}');
alter table public.schedule_drafts
  alter column location_ids set default '{}',
  alter column location_ids set not null;

-- 2. One lock per location and week --------------------------------------------

create table public.schedule_edit_locks (
  workspace_id uuid not null,
  week_start date not null,
  location_id uuid not null,
  session_id uuid not null,
  primary key (location_id, week_start),
  foreign key (session_id, workspace_id)
    references public.schedule_edit_sessions(id, workspace_id) on delete cascade,
  foreign key (location_id, workspace_id)
    references public.locations(id, workspace_id) on delete cascade
);
create index schedule_edit_locks_session_idx on public.schedule_edit_locks (session_id);
alter table public.schedule_edit_locks enable row level security;

insert into public.schedule_edit_locks (workspace_id, week_start, location_id, session_id)
select session.workspace_id, session.week_start, location_id, session.id
from public.schedule_edit_sessions session, unnest(session.location_ids) location_id
where session.status = 'active'
on conflict do nothing;

drop index public.schedule_edit_sessions_active_week_idx;
-- One open edit per person per week keeps "resume" unambiguous.
create unique index schedule_edit_sessions_active_holder_week_idx
  on public.schedule_edit_sessions (workspace_id, week_start, holder_user_id)
  where status = 'active';

-- A session that stops being active lets its locations go.
create function app_private.release_schedule_edit_locks()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.schedule_edit_locks where session_id = new.id;
  return new;
end;
$$;
create trigger schedule_edit_session_releases_locks
after update of status on public.schedule_edit_sessions
for each row when (old.status = 'active' and new.status <> 'active')
execute function app_private.release_schedule_edit_locks();

-- A session's shifts stay inside its locations, whichever command writes them
-- (edit, batch, template, auto-fill, default hours, exchange recovery).
create function app_private.keep_session_shift_in_session_locations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.schedule_edit_sessions session
    where session.id = new.session_id and new.location_id = any(session.location_ids)
  ) then
    raise exception 'shift location is outside this edit' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger schedule_edit_session_shift_location
before insert or update of location_id on public.schedule_edit_session_shifts
for each row execute function app_private.keep_session_shift_in_session_locations();

-- 3. Opening an edit ---------------------------------------------------------------

drop function public.acquire_schedule_edit_session_service(uuid, uuid, date, public.schedule_edit_source, uuid);
drop function public.acquire_schedule_edit_session_service_past_week_base(uuid, uuid, date, public.schedule_edit_source, uuid);

create function public.acquire_schedule_edit_session_service_past_week_base(
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
  held jsonb;
  own_session public.schedule_edit_sessions%rowtype;
  stale public.schedule_edit_sessions%rowtype;
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

  -- Somebody else is editing one of these locations: say who, take nothing.
  select jsonb_agg(jsonb_build_object(
      'location_id', lock.location_id,
      'location_name', location.name,
      'session_id', session.id,
      'holder_name', coalesce(profile.display_name, 'Another manager'),
      'last_heartbeat', session.last_heartbeat,
      'expires_at', session.expires_at
    ) order by location.name)
  into held
  from public.schedule_edit_locks lock
  join public.schedule_edit_sessions session on session.id = lock.session_id
  join public.locations location on location.id = lock.location_id
  left join public.user_profiles profile on profile.user_id = session.holder_user_id
  where lock.workspace_id = target_workspace_id
    and lock.week_start = target_week_start
    and lock.location_id = any(adding)
    and session.holder_user_id <> actor_user_id
    and session.status = 'active'
    and session.expires_at > now();
  if held is not null then
    return jsonb_build_object(
      'status', 'conflict',
      'session_id', held -> 0 ->> 'session_id',
      'holder_name', held -> 0 ->> 'holder_name',
      'last_heartbeat', held -> 0 -> 'last_heartbeat',
      'expires_at', held -> 0 -> 'expires_at',
      'locks', held,
      'free_location_ids', to_jsonb(array(
        select location_id from unnest(effective) location_id
        where not exists (
          select 1 from jsonb_array_elements(held) item
          where (item ->> 'location_id')::uuid = location_id
        )
      ))
    );
  end if;

  -- An expired edit still holding one of these locations closes; unsaved work
  -- becomes a recovery draft for its own locations.
  for stale in
    select * from public.schedule_edit_sessions session
    where session.id in (
      select lock.session_id from public.schedule_edit_locks lock
      where lock.workspace_id = target_workspace_id
        and lock.week_start = target_week_start
        and lock.location_id = any(adding)
    )
    and session.holder_user_id <> actor_user_id
    for update
  loop
    recovery_draft_id := null;
    if stale.dirty then
      insert into public.schedule_drafts (
        workspace_id, week_start, name, created_by, updated_by, location_ids
      ) values (
        target_workspace_id, target_week_start,
        'Recovered edit ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS') || ' ' || left(stale.id::text, 4),
        stale.holder_user_id, stale.holder_user_id, stale.location_ids
      ) returning id into recovery_draft_id;
      insert into public.schedule_draft_shifts (id, workspace_id, draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision)
      select id, workspace_id, recovery_draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision
      from public.schedule_edit_session_shifts
      where session_id = stale.id;
    end if;
    update public.schedule_edit_sessions
    set status = case when recovery_draft_id is null then 'expired'::public.schedule_edit_session_status
                      else 'recovered'::public.schedule_edit_session_status end,
        recovered_draft_id = recovery_draft_id,
        closed_at = now()
    where id = stale.id;
  end loop;

  if own_session.id is not null then
    -- BL-069: the same person picks their edit back up, widened to the new locations.
    update public.schedule_edit_sessions
    set last_heartbeat = now(),
        expires_at = now() + interval '4 minutes',
        location_ids = array(
          select distinct location_id from unnest(own_session.location_ids || adding) location_id
          order by location_id
        )
    where id = own_session.id;
    edit_session_id := own_session.id;
    session_source := own_session.source_kind;
    session_draft_id := own_session.source_draft_id;
  else
    if requested_source = 'draft' then
      select * into source_draft
      from public.schedule_drafts draft
      where draft.id = requested_draft_id
        and draft.workspace_id = target_workspace_id
        and draft.week_start = target_week_start
        and draft.archived_at is null;
      if source_draft.id is null then
        raise exception 'draft not found' using errcode = 'P0002';
      end if;
    end if;
    insert into public.schedule_edit_sessions (
      workspace_id, week_start, source_kind, source_draft_id, source_revision,
      holder_user_id, location_ids
    ) values (
      target_workspace_id, target_week_start, requested_source,
      case when requested_source = 'draft' then source_draft.id end,
      case when requested_source = 'draft' then source_draft.revision else 0 end,
      actor_user_id, effective
    ) returning id into edit_session_id;
    session_source := requested_source;
    session_draft_id := source_draft.id;
  end if;

  insert into public.schedule_edit_locks (workspace_id, week_start, location_id, session_id)
  select target_workspace_id, target_week_start, location_id, edit_session_id
  from unnest(adding) location_id;

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

create function public.acquire_schedule_edit_session_service(
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
  current_week_start date;
begin
  current_week_start := public.schedule_current_week_start_service(target_workspace_id);
  if current_week_start is not null and target_week_start < current_week_start then
    raise exception '%', jsonb_build_object(
      'status', 'past_edit_blocked',
      'past_edits', jsonb_build_array(jsonb_build_object(
        'op_type', 'update',
        'shift_id', null,
        'scheduled_date', to_char(target_week_start, 'YYYY-MM-DD'),
        'location_name', 'Schedule week',
        'employee_name', null,
        'reason', 'past_week',
        'severity', 'blocked'
      )),
      'past_edit_messages', jsonb_build_array(
        'Past schedule weeks are read-only. Correct what actually happened in Time Entries.'
      ),
      'current_week_start', current_week_start
    )::text using errcode = 'P0001';
  end if;
  return public.acquire_schedule_edit_session_service_past_week_base(
    actor_user_id, target_workspace_id, target_week_start,
    requested_source, requested_draft_id, target_location_ids
  );
end;
$function$;

revoke all on function public.acquire_schedule_edit_session_service(uuid, uuid, date, public.schedule_edit_source, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.acquire_schedule_edit_session_service_past_week_base(uuid, uuid, date, public.schedule_edit_source, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.acquire_schedule_edit_session_service(uuid, uuid, date, public.schedule_edit_source, uuid, uuid[]) to service_role;
grant execute on function public.acquire_schedule_edit_session_service_past_week_base(uuid, uuid, date, public.schedule_edit_source, uuid, uuid[]) to service_role;

-- 4. Taking over ------------------------------------------------------------------

create or replace function public.takeover_schedule_edit_session_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_session public.schedule_edit_sessions%rowtype;
begin
  select * into target_session
  from public.schedule_edit_sessions session
  where session.id = target_session_id
    and session.workspace_id = target_workspace_id
    and session.status = 'active'
  for update;
  if target_session.id is null then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;
  -- Only somebody who can edit every location the session holds takes it over.
  if exists (
    select 1 from unnest(target_session.location_ids) location_id
    where not public.schedule_actor_can_manage_service(actor_user_id, target_workspace_id, location_id)
  ) then
    raise exception 'schedule takeover access denied' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.schedule_edit_sessions session
    where session.workspace_id = target_workspace_id
      and session.week_start = target_session.week_start
      and session.holder_user_id = actor_user_id
      and session.status = 'active'
      and session.id <> target_session.id
  ) then
    raise exception 'save or discard your own edit of this week first' using errcode = '55000';
  end if;
  update public.schedule_edit_sessions
  set holder_user_id = actor_user_id,
      last_heartbeat = now(),
      expires_at = now() + interval '4 minutes'
  where id = target_session_id
    and workspace_id = target_workspace_id;
  return jsonb_build_object(
    'status', 'acquired',
    'session', public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id)
  );
end;
$function$;


-- 5. Saving replaces the draft at the session's locations only ---------------

CREATE OR REPLACE FUNCTION public.save_schedule_edit_session_service_base(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, expected_session_revision integer, target_name text, target_draft_id uuid DEFAULT NULL::uuid, expected_draft_revision integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      workspace_id, week_start, name, created_by, updated_by, location_ids
    ) values (
      target_workspace_id, target_session.week_start, btrim(target_name),
      actor_user_id, actor_user_id, target_session.location_ids
    ) returning * into saved_draft;
  else
    update public.schedule_drafts draft
    set name = btrim(target_name), revision = revision + 1,
      updated_by = actor_user_id, updated_at = now(),
      location_ids = array(
        select distinct location_id from unnest(draft.location_ids || target_session.location_ids) location_id
        order by location_id
      )
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

-- 6. The session answer names its locations ----------------------------------

CREATE OR REPLACE FUNCTION public.get_schedule_edit_session_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  base jsonb;
  patched_shifts jsonb;
begin
  base := public.get_schedule_edit_session_service_label_base(
    actor_user_id,
    target_workspace_id,
    target_session_id
  );

  select coalesce(jsonb_agg(
    item.value
      || jsonb_build_object(
        'label_ids', to_jsonb(coalesce(shift.label_ids, '{}'::uuid[])),
        'label_names', to_jsonb(coalesce(shift.label_names, '{}'::text[]))
      )
    order by item.ordinality
  ), '[]'::jsonb)
  into patched_shifts
  from jsonb_array_elements(base->'shifts') with ordinality item(value, ordinality)
  left join public.schedule_edit_session_shifts shift
    on shift.session_id = target_session_id
   and shift.id = (item.value->>'id')::uuid;

  return jsonb_set(base, '{shifts}', patched_shifts, true)
    || jsonb_build_object('location_ids', (
      select to_jsonb(session.location_ids) from public.schedule_edit_sessions session
      where session.id = target_session_id and session.workspace_id = target_workspace_id
    ));
end;
$function$;

-- 7. Publishing only what the draft covers (preview4) ----------------------

CREATE OR REPLACE FUNCTION public.preview_schedule_publication_before_availability_review_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_location_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_draft public.schedule_drafts%rowtype;
  normalized_locations uuid[];
  location_payload jsonb;
  finding_payload jsonb;
  unsigned_payload jsonb;
  preview_fingerprint text;
  hard_count integer;
  soft_count integer;
begin
  select * into target_draft
  from public.schedule_drafts draft
  where draft.id = target_draft_id
    and draft.workspace_id = target_workspace_id
    and draft.archived_at is null;
  if target_draft.id is null then
    raise exception 'schedule draft not found' using errcode = 'P0002';
  end if;
  if target_draft.week_start < public.schedule_current_week_start_service(target_workspace_id) then
    return jsonb_build_object(
      'status', 'past_week_closed', 'workspace_id', target_workspace_id,
      'week_start', target_draft.week_start, 'draft_id', target_draft.id,
      'draft_revision', target_draft.revision, 'fingerprint', repeat('0', 64),
      'locations', '[]'::jsonb, 'findings', '[]'::jsonb
    );
  end if;

  select array_agg(distinct location_id order by location_id)
  into normalized_locations
  from unnest(target_location_ids) location_id;
  if coalesce(cardinality(normalized_locations), 0) = 0 then
    raise exception 'at least one publication location required' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(normalized_locations) location_id
    where not exists (
      select 1 from public.locations location
      where location.id = location_id and location.workspace_id = target_workspace_id
        and location.archived_at is null
    ) or not public.schedule_actor_can_publish_service(
      actor_user_id, target_workspace_id, location_id
    )
  ) then
    raise exception 'schedule publication scope denied' using errcode = '42501';
  end if;
  -- A draft publishes only the locations it covers; anything else would be
  -- replaced with nothing.
  if not normalized_locations <@ target_draft.location_ids then
    raise exception 'publication location is not in this draft' using errcode = '22023';
  end if;

  with selected_locations as (
    select location.id, location.name
    from public.locations location
    where location.id = any(normalized_locations)
  ), active as (
    select publication.*
    from public.schedule_location_publications publication
    where publication.workspace_id = target_workspace_id
      and publication.week_start = target_draft.week_start
      and publication.location_id = any(normalized_locations)
      and publication.status = 'current'
  ), current_shift as (
    select shift.*
    from public.schedule_published_shifts shift
    join active publication on publication.id = shift.publication_id
  ), next_shift as (
    select shift.*
    from public.schedule_draft_shifts shift
    where shift.draft_id = target_draft.id
      and shift.location_id = any(normalized_locations)
  ), comparison as (
    select location.id as location_id, location.name as location_name,
      publication.id as active_publication_id,
      publication.version_number as active_version,
      (select count(*) from current_shift shift where shift.location_id = location.id)::integer as current_shift_count,
      (select count(*) from next_shift shift where shift.location_id = location.id)::integer as next_shift_count,
      (select count(*) from next_shift next_row where next_row.location_id = location.id and not exists (
        select 1 from current_shift current_row where current_row.location_id = location.id and current_row.source_shift_id = next_row.id
      ))::integer as added,
      (select count(*) from current_shift current_row where current_row.location_id = location.id and not exists (
        select 1 from next_shift next_row where next_row.location_id = location.id and next_row.id = current_row.source_shift_id
      ))::integer as removed,
      (select count(*) from next_shift next_row join current_shift current_row
        on current_row.location_id = next_row.location_id and current_row.source_shift_id = next_row.id
        where next_row.location_id = location.id and (
          current_row.employee_id is distinct from next_row.employee_id
          or current_row.job_id is distinct from next_row.job_id
          or current_row.shift_type_id is distinct from next_row.shift_type_id
          or current_row.scheduled_date is distinct from next_row.scheduled_date
          or current_row.start_time is distinct from next_row.start_time
          or current_row.end_time is distinct from next_row.end_time
          or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
        ))::integer as updated,
      (select count(*) from next_shift next_row join current_shift current_row
        on current_row.location_id = next_row.location_id and current_row.source_shift_id = next_row.id
        where next_row.location_id = location.id and not (
          current_row.employee_id is distinct from next_row.employee_id
          or current_row.job_id is distinct from next_row.job_id
          or current_row.shift_type_id is distinct from next_row.shift_type_id
          or current_row.scheduled_date is distinct from next_row.scheduled_date
          or current_row.start_time is distinct from next_row.start_time
          or current_row.end_time is distinct from next_row.end_time
          or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
        ))::integer as unchanged,
      coalesce((
        select array_agg(distinct affected.employee_id order by affected.employee_id)
        from (
          select next_row.employee_id
          from next_shift next_row
          where next_row.location_id = location.id
            and next_row.employee_id is not null
            and not exists (
              select 1 from current_shift current_row
              where current_row.location_id = location.id
                and current_row.source_shift_id = next_row.id
            )
          union
          select next_row.employee_id
          from next_shift next_row
          join current_shift current_row
            on current_row.location_id = next_row.location_id
           and current_row.source_shift_id = next_row.id
          where next_row.location_id = location.id
            and next_row.employee_id is not null
            and (
              current_row.employee_id is distinct from next_row.employee_id
              or current_row.job_id is distinct from next_row.job_id
              or current_row.shift_type_id is distinct from next_row.shift_type_id
              or current_row.scheduled_date is distinct from next_row.scheduled_date
              or current_row.start_time is distinct from next_row.start_time
              or current_row.end_time is distinct from next_row.end_time
              or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
            )
          union
          select current_row.employee_id
          from current_shift current_row
          where current_row.location_id = location.id
            and current_row.employee_id is not null
            and not exists (
              select 1 from next_shift next_row
              where next_row.location_id = location.id
                and next_row.id = current_row.source_shift_id
            )
        ) affected
      ), '{}'::uuid[]) as affected_employee_ids
    from selected_locations location
    left join active publication on publication.location_id = location.id
  )
  select jsonb_agg(to_jsonb(comparison) order by location_name, location_id)
  into location_payload from comparison;

  with next_shift as (
    select shift.*,
      coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' ' || employee.last_name as employee_name,
      location.name as location_name,
      tsrange(
        shift.scheduled_date::timestamp + shift.start_time,
        shift.scheduled_date::timestamp + shift.end_time
          + case when shift.end_time <= shift.start_time then interval '1 day' else interval '0' end,
        '[)'
      ) as occupied
    from public.schedule_draft_shifts shift
    join public.locations location on location.id = shift.location_id
    left join public.employee_profiles employee on employee.id = shift.employee_id
    where shift.draft_id = target_draft.id and shift.location_id = any(normalized_locations)
  ), raw_findings as (
    select 'time_source_unresolved'::text as code, 'hard'::text as severity, false as overrideable,
      shift.location_id,shift.employee_id,shift.scheduled_date,array[shift.id]::uuid[] as shift_ids,
      'Confirm shift hours before publishing this assignment.'::text as message
    from next_shift shift where shift.employee_id is not null
      and shift.time_basis in ('unresolved','legacy_unverified') and not exists (
        select 1 from public.schedule_published_shifts s
        where s.workspace_id=shift.workspace_id and s.source_shift_id=shift.id and s.time_basis='legacy_unverified'
          and (s.employee_id,s.location_id,s.job_id,s.shift_type_id,s.scheduled_date,s.start_time,s.end_time)
            is not distinct from (shift.employee_id,shift.location_id,shift.job_id,shift.shift_type_id,shift.scheduled_date,shift.start_time,shift.end_time)
      )
    union all
    select
      'overlap'::text as code, case when first.time_basis='explicit' and second.time_basis='explicit' then 'hard' else 'soft' end::text as severity, (first.time_basis='type_default' or second.time_basis='type_default') as overrideable,
      first.location_id, first.employee_id, first.scheduled_date,
      array[first.id, second.id]::uuid[] as shift_ids,
      first.employee_name || case when first.time_basis='type_default' or second.time_basis='type_default' then ' has overlapping reference hours on ' else ' has overlapping shifts on ' end || first.scheduled_date::text || '.' as message
    from next_shift first
    join next_shift second on second.employee_id = first.employee_id and second.id > first.id
      and first.employee_id is not null and first.time_basis in ('explicit','type_default') and second.time_basis in ('explicit','type_default') and first.occupied && second.occupied
    union all
    select
      'availability', 'soft', true, shift.location_id, shift.employee_id,
      shift.scheduled_date, array[shift.id]::uuid[],
      shift.employee_name || ' is unavailable on ' || shift.scheduled_date::text || '.'
    from next_shift shift
    where shift.employee_id is not null and exists (
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
    )
    union all
    select
      'closed_location', 'soft', true, shift.location_id, shift.employee_id,
      shift.scheduled_date, array[shift.id]::uuid[],
      shift.location_name || ' is closed on ' || shift.scheduled_date::text || '.'
    from next_shift shift
    where exists (
      select 1 from public.schedule_closures closure
      where closure.location_id = shift.location_id
        and closure.closed_date = shift.scheduled_date and closure.is_all_day
    )
  ), findings as (
    select encode(extensions.digest(convert_to(
      code || '|' || coalesce(employee_id::text, '') || '|' || scheduled_date::text || '|' || array_to_string(shift_ids, ','),
      'UTF8'), 'sha256'), 'hex') as id, *
    from raw_findings
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'code', code, 'severity', severity, 'overrideable', overrideable,
    'message', message, 'location_id', location_id, 'employee_id', employee_id,
    'scheduled_date', scheduled_date, 'shift_ids', to_jsonb(shift_ids)
  ) order by severity, code, scheduled_date, id), '[]'::jsonb),
  count(*) filter (where severity = 'hard')::integer,
  count(*) filter (where severity = 'soft')::integer
  into finding_payload, hard_count, soft_count
  from findings;

  unsigned_payload := jsonb_build_object(
    'workspace_id', target_workspace_id,
    'week_start', target_draft.week_start,
    'draft_id', target_draft.id,
    'draft_revision', target_draft.revision,
    'locations', coalesce(location_payload, '[]'::jsonb),
    'findings', finding_payload
  );
  preview_fingerprint := encode(extensions.digest(convert_to(unsigned_payload::text, 'UTF8'), 'sha256'), 'hex');
  return unsigned_payload || jsonb_build_object(
    'status', case when hard_count > 0 then 'hard_blocked'
      when soft_count > 0 then 'override_required' else 'publish_ready' end,
    'fingerprint', preview_fingerprint
  );
end;
$function$;

-- 7. Publishing only what the draft covers (preview6) ----------------------

CREATE OR REPLACE FUNCTION public.preview_schedule_publication_before_availability_review_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_location_ids uuid[], target_department_ids uuid[], include_no_department boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_draft public.schedule_drafts%rowtype;
  normalized_locations uuid[];
  normalized_departments uuid[];
  effective_include_no_department boolean := coalesce(include_no_department, true);
  location_payload jsonb;
  finding_payload jsonb;
  unsigned_payload jsonb;
  preview_fingerprint text;
  hard_count integer;
  soft_count integer;
begin
  select * into target_draft
  from public.schedule_drafts draft
  where draft.id = target_draft_id
    and draft.workspace_id = target_workspace_id
    and draft.archived_at is null;
  if target_draft.id is null then
    raise exception 'schedule draft not found' using errcode = 'P0002';
  end if;
  if target_draft.week_start < public.schedule_current_week_start_service(target_workspace_id) then
    return jsonb_build_object(
      'status', 'past_week_closed', 'workspace_id', target_workspace_id,
      'week_start', target_draft.week_start, 'draft_id', target_draft.id,
      'draft_revision', target_draft.revision, 'fingerprint', repeat('0', 64),
      'locations', '[]'::jsonb, 'findings', '[]'::jsonb
    );
  end if;

  select array_agg(distinct location_id order by location_id)
  into normalized_locations
  from unnest(target_location_ids) location_id;
  if coalesce(cardinality(normalized_locations), 0) = 0 then
    raise exception 'at least one publication location required' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(normalized_locations) location_id
    where not exists (
      select 1 from public.locations location
      where location.id = location_id and location.workspace_id = target_workspace_id
        and location.archived_at is null
    ) or not public.schedule_actor_can_publish_service(
      actor_user_id, target_workspace_id, location_id
    )
  ) then
    raise exception 'schedule publication scope denied' using errcode = '42501';
  end if;
  -- A draft publishes only the locations it covers; anything else would be
  -- replaced with nothing.
  if not normalized_locations <@ target_draft.location_ids then
    raise exception 'publication location is not in this draft' using errcode = '22023';
  end if;

  if target_department_ids is not null then
    select coalesce(array_agg(distinct department.id order by department.id), '{}'::uuid[])
    into normalized_departments
    from public.departments department
    join unnest(target_department_ids) requested(id) on requested.id = department.id
    where department.workspace_id = target_workspace_id
      and department.archived_at is null;

    if cardinality(normalized_departments) = 0
      and not effective_include_no_department then
      raise exception 'invalid department publication scope' using errcode = '22023';
    end if;
  end if;

  with selected_locations as (
    select location.id, location.name
    from public.locations location
    where location.id = any(normalized_locations)
  ), active as (
    select publication.*
    from public.schedule_location_publications publication
    where publication.workspace_id = target_workspace_id
      and publication.week_start = target_draft.week_start
      and publication.location_id = any(normalized_locations)
      and publication.status = 'current'
  ), current_shift as (
    select shift.*
    from public.schedule_published_shifts shift
    join active publication on publication.id = shift.publication_id
    where public.schedule_shift_in_department_scope_service(
      shift.job_id, normalized_departments, effective_include_no_department
    )
  ), next_shift as (
    select shift.*
    from public.schedule_draft_shifts shift
    where shift.draft_id = target_draft.id
      and shift.location_id = any(normalized_locations)
      and public.schedule_shift_in_department_scope_service(
        shift.job_id, normalized_departments, effective_include_no_department
      )
  ), comparison as (
    select location.id as location_id, location.name as location_name,
      publication.id as active_publication_id,
      publication.version_number as active_version,
      (select count(*) from current_shift shift where shift.location_id = location.id)::integer as current_shift_count,
      (select count(*) from next_shift shift where shift.location_id = location.id)::integer as next_shift_count,
      (select count(*) from next_shift next_row where next_row.location_id = location.id and not exists (
        select 1 from current_shift current_row where current_row.location_id = location.id and current_row.source_shift_id = next_row.id
      ))::integer as added,
      (select count(*) from current_shift current_row where current_row.location_id = location.id and not exists (
        select 1 from next_shift next_row where next_row.location_id = location.id and next_row.id = current_row.source_shift_id
      ))::integer as removed,
      (select count(*) from next_shift next_row join current_shift current_row
        on current_row.location_id = next_row.location_id and current_row.source_shift_id = next_row.id
        where next_row.location_id = location.id and (
          current_row.employee_id is distinct from next_row.employee_id
          or current_row.job_id is distinct from next_row.job_id
          or current_row.shift_type_id is distinct from next_row.shift_type_id
          or current_row.scheduled_date is distinct from next_row.scheduled_date
          or current_row.start_time is distinct from next_row.start_time
          or current_row.end_time is distinct from next_row.end_time
          or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
        ))::integer as updated,
      (select count(*) from next_shift next_row join current_shift current_row
        on current_row.location_id = next_row.location_id and current_row.source_shift_id = next_row.id
        where next_row.location_id = location.id and not (
          current_row.employee_id is distinct from next_row.employee_id
          or current_row.job_id is distinct from next_row.job_id
          or current_row.shift_type_id is distinct from next_row.shift_type_id
          or current_row.scheduled_date is distinct from next_row.scheduled_date
          or current_row.start_time is distinct from next_row.start_time
          or current_row.end_time is distinct from next_row.end_time
          or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
        ))::integer as unchanged,
      coalesce((
        select array_agg(distinct affected.employee_id order by affected.employee_id)
        from (
          select next_row.employee_id
          from next_shift next_row
          where next_row.location_id = location.id
            and next_row.employee_id is not null
            and not exists (
              select 1 from current_shift current_row
              where current_row.location_id = location.id
                and current_row.source_shift_id = next_row.id
            )
          union
          select next_row.employee_id
          from next_shift next_row
          join current_shift current_row
            on current_row.location_id = next_row.location_id
           and current_row.source_shift_id = next_row.id
          where next_row.location_id = location.id
            and next_row.employee_id is not null
            and (
              current_row.employee_id is distinct from next_row.employee_id
              or current_row.job_id is distinct from next_row.job_id
              or current_row.shift_type_id is distinct from next_row.shift_type_id
              or current_row.scheduled_date is distinct from next_row.scheduled_date
              or current_row.start_time is distinct from next_row.start_time
              or current_row.end_time is distinct from next_row.end_time
              or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
            )
          union
          select current_row.employee_id
          from current_shift current_row
          where current_row.location_id = location.id
            and current_row.employee_id is not null
            and not exists (
              select 1 from next_shift next_row
              where next_row.location_id = location.id
                and next_row.id = current_row.source_shift_id
            )
        ) affected
      ), '{}'::uuid[]) as affected_employee_ids
    from selected_locations location
    left join active publication on publication.location_id = location.id
  )
  select jsonb_agg(to_jsonb(comparison) order by location_name, location_id)
  into location_payload from comparison;

  with next_shift as (
    select shift.*,
      coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' ' || employee.last_name as employee_name,
      location.name as location_name,
      tsrange(
        shift.scheduled_date::timestamp + shift.start_time,
        shift.scheduled_date::timestamp + shift.end_time
          + case when shift.end_time <= shift.start_time then interval '1 day' else interval '0' end,
        '[)'
      ) as occupied
    from public.schedule_draft_shifts shift
    join public.locations location on location.id = shift.location_id
    left join public.employee_profiles employee on employee.id = shift.employee_id
    where shift.draft_id = target_draft.id
      and shift.location_id = any(normalized_locations)
      and public.schedule_shift_in_department_scope_service(
        shift.job_id, normalized_departments, effective_include_no_department
      )
  ), raw_findings as (
    select 'time_source_unresolved'::text as code, 'hard'::text as severity, false as overrideable,
      shift.location_id,shift.employee_id,shift.scheduled_date,array[shift.id]::uuid[] as shift_ids,
      'Confirm shift hours before publishing this assignment.'::text as message
    from next_shift shift where shift.employee_id is not null
      and shift.time_basis in ('unresolved','legacy_unverified') and not exists (
        select 1 from public.schedule_published_shifts s
        where s.workspace_id=shift.workspace_id and s.source_shift_id=shift.id and s.time_basis='legacy_unverified'
          and (s.employee_id,s.location_id,s.job_id,s.shift_type_id,s.scheduled_date,s.start_time,s.end_time)
            is not distinct from (shift.employee_id,shift.location_id,shift.job_id,shift.shift_type_id,shift.scheduled_date,shift.start_time,shift.end_time)
      )
    union all
    select
      'overlap'::text as code, case when first.time_basis='explicit' and second.time_basis='explicit' then 'hard' else 'soft' end::text as severity, (first.time_basis='type_default' or second.time_basis='type_default') as overrideable,
      first.location_id, first.employee_id, first.scheduled_date,
      array[first.id, second.id]::uuid[] as shift_ids,
      first.employee_name || case when first.time_basis='type_default' or second.time_basis='type_default' then ' has overlapping reference hours on ' else ' has overlapping shifts on ' end || first.scheduled_date::text || '.' as message
    from next_shift first
    join next_shift second on second.employee_id = first.employee_id and second.id > first.id
      and first.employee_id is not null and first.time_basis in ('explicit','type_default') and second.time_basis in ('explicit','type_default') and first.occupied && second.occupied
    union all
    select
      'availability', 'soft', true, shift.location_id, shift.employee_id,
      shift.scheduled_date, array[shift.id]::uuid[],
      shift.employee_name || ' is unavailable on ' || shift.scheduled_date::text || '.'
    from next_shift shift
    where shift.employee_id is not null and exists (
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
    )
    union all
    select
      'closed_location', 'soft', true, shift.location_id, shift.employee_id,
      shift.scheduled_date, array[shift.id]::uuid[],
      shift.location_name || ' is closed on ' || shift.scheduled_date::text || '.'
    from next_shift shift
    where exists (
      select 1 from public.schedule_closures closure
      where closure.location_id = shift.location_id
        and closure.closed_date = shift.scheduled_date and closure.is_all_day
    )
  ), findings as (
    select encode(extensions.digest(convert_to(
      code || '|' || coalesce(employee_id::text, '') || '|' || scheduled_date::text || '|' || array_to_string(shift_ids, ','),
      'UTF8'), 'sha256'), 'hex') as id, *
    from raw_findings
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'code', code, 'severity', severity, 'overrideable', overrideable,
    'message', message, 'location_id', location_id, 'employee_id', employee_id,
    'scheduled_date', scheduled_date, 'shift_ids', to_jsonb(shift_ids)
  ) order by severity, code, scheduled_date, id), '[]'::jsonb),
  count(*) filter (where severity = 'hard')::integer,
  count(*) filter (where severity = 'soft')::integer
  into finding_payload, hard_count, soft_count
  from findings;

  unsigned_payload := jsonb_build_object(
    'workspace_id', target_workspace_id,
    'week_start', target_draft.week_start,
    'draft_id', target_draft.id,
    'draft_revision', target_draft.revision,
    'locations', coalesce(location_payload, '[]'::jsonb),
    'findings', finding_payload
  );
  preview_fingerprint := encode(extensions.digest(convert_to(unsigned_payload::text, 'UTF8'), 'sha256'), 'hex');
  return unsigned_payload || jsonb_build_object(
    'status', case when hard_count > 0 then 'hard_blocked'
      when soft_count > 0 then 'override_required' else 'publish_ready' end,
    'fingerprint', preview_fingerprint
  );
end;
$function$;

-- 8. Availability: an edit replaces the published week at its own locations only

CREATE OR REPLACE FUNCTION public.assess_weekly_shift_availability(w uuid, emp uuid, shift jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare loc uuid:=(shift->>'location_id')::uuid; day date:=coalesce(shift->>'scheduled_date',shift->>'date')::date;
 zone_name text; preference_zone text; basis text:=coalesce(shift->>'time_basis','explicit'); start_clock time; end_clock time;
 local_start timestamp; local_end timestamp; start_at timestamptz; end_at timestamptz; span tstzrange; day_span tstzrange;
 capacity jsonb; remaining tstzmultirange; unavailable tstzmultirange:='{}'; leave_ranges tstzmultirange:='{}';
 leave_evidence jsonb:='[]'; reasons jsonb:='[]'; settings public.workspace_scheduling_settings%rowtype;
 leave_row record; leave_span tstzrange; coverage text; operation text; fingerprint_payload jsonb;
 conflict_severity text; rule_severity text; rule jsonb; annotated jsonb:='[]';
 neighbor record; neighbor_span tstzrange; gap_minutes numeric; schedule_week date; schedule_locations uuid[];
 edit_id uuid:=nullif(shift->>'session_id','')::uuid; context_draft_id uuid:=nullif(shift->>'draft_id','')::uuid;
 exclude_id uuid:=coalesce(nullif(shift->>'_exclude_shift_id',''),shift->>'source_shift_id',shift->>'id')::uuid;
 missing_time boolean; invalid_clock boolean:=false; ambiguous_clock boolean:=false;
begin
 select l.timezone,coalesce(nullif(shift->>'time_timezone',''),nullif(shift->'time_snapshot'->>'timezone',''),l.timezone)
  into preference_zone,zone_name from public.locations l where l.workspace_id=w and l.id=loc;
 if day is null or not isfinite(day) or zone_name is null or preference_zone is null
  or not exists(select 1 from pg_timezone_names where name=zone_name)
  or not exists(select 1 from pg_timezone_names where name=preference_zone) then
  raise exception 'A valid location, date and timezone are required for availability assessment' using errcode='22023'; end if;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 if settings.workspace_id is null then raise exception 'Scheduling settings unavailable' using errcode='P0002'; end if;
 if basis not in ('explicit','type_default','unresolved','legacy_unverified') then
  raise exception 'Unknown shift time source' using errcode='22023'; end if;
 if basis='type_default' then
  start_clock:=nullif(shift->'time_snapshot'->>'start_time','')::time;
  end_clock:=nullif(shift->'time_snapshot'->>'end_time','')::time;
  if (start_clock,end_clock) is distinct from (nullif(shift->>'start_time','')::time,nullif(shift->>'end_time','')::time) then
   raise exception 'Saved reference hours and their snapshot must agree' using errcode='22023'; end if;
 elsif basis='explicit' then
  start_clock:=nullif(shift->>'start_time','')::time; end_clock:=nullif(shift->>'end_time','')::time;
 end if;
 invalid_clock:=start_clock is not null and start_clock=end_clock;
 missing_time:=start_clock is null or end_clock is null or start_clock=end_clock or basis in ('unresolved','legacy_unverified');
 day_span:=tstzrange(day::timestamp at time zone zone_name,(day+1)::timestamp at time zone zone_name,'[)');
 if not missing_time then
  local_start:=day+start_clock;
  local_end:=day+end_clock+case when end_clock<start_clock then interval '1 day' else interval '0' end;
  start_at:=local_start at time zone zone_name; end_at:=local_end at time zone zone_name;
  invalid_clock:=(start_at at time zone zone_name)<>local_start or (end_at at time zone zone_name)<>local_end or end_at<=start_at;
  if not invalid_clock then
   span:=tstzrange(start_at,end_at,'[)');
   ambiguous_clock:=exists(select 1 from (values(start_at,local_start),(end_at,local_end)) endpoint(instant,wall)
    cross join (values(interval '-1 day'),(interval '1 day')) probe(delta)
    cross join lateral (select (endpoint.wall at time zone 'UTC')-make_interval(secs=>public.availability_utc_offset(endpoint.instant+probe.delta,zone_name)) alternate) alt
    where alt.alternate<>endpoint.instant and (alt.alternate at time zone zone_name)=endpoint.wall);
  end if;
 end if;
 -- Assignment snapshots locate the actual instants; recurring rules are always
 -- interpreted in the target location's current local timezone.
 capacity:=case when emp is null then jsonb_build_object('unavailable_intervals','[]'::jsonb,'employee_intervals','[]'::jsonb,'manager_intervals','[]'::jsonb)
  else public.weekly_preference_capacity(w,emp,coalesce(span,day_span),preference_zone) end;
 select coalesce(range_agg(tstzrange((x->>'start_at')::timestamptz,(x->>'end_at')::timestamptz,'[)')),'{}') into unavailable
  from jsonb_array_elements(capacity->'unavailable_intervals') x;
 for leave_row in select seg.id,seg.request_id,req.revision,approved_piece.span
  from public.schedule_time_off_segments seg
  join public.schedule_time_off_requests req on req.id=seg.request_id and req.workspace_id=seg.workspace_id
  cross join lateral unnest(public.time_off_effective_ranges(seg.id)) approved_piece(span)
  where req.workspace_id=w and req.employee_id=emp and req.request_type='time_off'
   and req.status in('approved','partially_approved') and seg.status='approved'
   and seg.segment_date between day-3 and day+3 order by seg.id,lower(approved_piece.span) loop
  leave_span:=leave_row.span*coalesce(span,day_span);
  if not isempty(leave_span) then
   leave_ranges:=leave_ranges+tstzmultirange(leave_span);
   leave_evidence:=leave_evidence||jsonb_build_array(jsonb_build_object('segment_id',leave_row.id,'request_id',leave_row.request_id,
    'request_revision',leave_row.revision,'intervals',public.availability_ranges_json(tstzmultirange(leave_span))));
  end if;
 end loop;
 remaining:=tstzmultirange(coalesce(span,day_span))-(unavailable+leave_ranges);
 coverage:=case when span is null then 'unknown' when isempty(remaining) then 'none' when remaining @> span then 'full' else 'partial' end;
 if not isempty(leave_ranges) then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','approved_time_off',
  'message','Approved time off overlaps this assignment. Resolve the leave or assignment before assigning.',
  'intervals',public.availability_ranges_json(leave_ranges),'definite',span is not null or leave_ranges @> day_span)); end if;
 if not isempty(unavailable) and span is not null then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','availability',
  'message','The assignment overlaps unavailable hours.','intervals',public.availability_ranges_json(unavailable),'definite',true)); end if;
 if missing_time then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','time_source_unresolved',
  'message','Confirm shift hours before assigning or publishing.','definite',false)); end if;
 if invalid_clock then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','invalid_local_time',
  'message','These hours do not exist on this date in the selected timezone. Choose valid hours.','definite',true)); end if;
 -- Required schedule references are hard constraints. Availability-only callers
 -- without a job descriptor retain their existing contract.
 if shift ? 'job_id' then
  if not exists(select 1 from public.locations where workspace_id=w and id=loc and archived_at is null)
   or not exists(select 1 from public.jobs where workspace_id=w and id=(shift->>'job_id')::uuid and archived_at is null)
   or (nullif(shift->>'shift_type_id','') is not null and not exists(select 1 from public.shift_types where workspace_id=w and id=(shift->>'shift_type_id')::uuid and archived_at is null)) then
   reasons:=reasons||jsonb_build_array(jsonb_build_object('code','invalid_reference','message','A location, job or shift type is no longer available.','definite',true));
  end if;
  if emp is not null then
   if not exists(select 1 from public.employee_profiles where workspace_id=w and id=emp and archived_at is null and not is_excluded_from_schedule and (start_date is null or start_date<=day)) then
    reasons:=reasons||jsonb_build_array(jsonb_build_object('code','employee_inactive','message','Employee is not active in Schedule.','definite',true));
   end if;
   if not exists(select 1 from public.employee_location_assignments where workspace_id=w and employee_id=emp and location_id=loc and ended_at is null)
    or not exists(select 1 from public.employee_job_assignments where workspace_id=w and employee_id=emp and job_id=(shift->>'job_id')::uuid and ended_at is null) then
    reasons:=reasons||jsonb_build_array(jsonb_build_object('code','assignment_missing','message','Employee needs an active location and job assignment.','definite',true));
   end if;
  end if;
  if exists(select 1 from public.schedule_closures c where c.workspace_id=w and c.location_id=loc
   and day between c.closed_date and coalesce(c.end_date,c.closed_date)
   and (c.is_all_day or (shift->>'shift_type_id')::uuid=any(c.shift_type_ids))) then
   reasons:=reasons||jsonb_build_array(jsonb_build_object('code','closed_location','message','Location or shift type is closed on this date.','definite',true));
  end if;
 end if;
 -- The edit session replaces its week; a saved draft replaces its week. Other
 -- current publications remain relevant across locations and week boundaries.
 select week_start,location_ids into schedule_week,schedule_locations from public.schedule_edit_sessions where workspace_id=w and id=edit_id;
 if schedule_week is null then select week_start,location_ids into schedule_week,schedule_locations from public.schedule_drafts where workspace_id=w and id=context_draft_id; end if;
 if span is not null and emp is not null and shift ? 'job_id' then
  for neighbor in
   select s.id,s.location_id,s.scheduled_date,s.start_time,s.end_time,s.time_basis,coalesce(s.time_timezone,l.timezone) zone
    from public.schedule_edit_session_shifts s join public.locations l on l.id=s.location_id and l.workspace_id=w
    where s.workspace_id=w and s.session_id=edit_id and s.employee_id=emp and s.pending_op_type is distinct from 'delete'
     and s.id is distinct from exclude_id and s.scheduled_date between day-2 and day+2
     and (not (shift ? '_publish_locations') or (s.location_id in (select value::uuid from jsonb_array_elements_text(shift->'_publish_locations'))
      and public.schedule_shift_in_department_scope_service(s.job_id,
       case when jsonb_typeof(shift->'_publish_departments')='array' then array(select value::uuid from jsonb_array_elements_text(shift->'_publish_departments')) end,
       coalesce((shift->>'_publish_no_department')::boolean,true))))
   union all
   select s.id,s.location_id,s.scheduled_date,s.start_time,s.end_time,s.time_basis,coalesce(s.time_timezone,l.timezone)
    from public.schedule_draft_shifts s join public.locations l on l.id=s.location_id and l.workspace_id=w
    where edit_id is null and s.workspace_id=w and s.draft_id=context_draft_id and s.employee_id=emp
     and s.id is distinct from exclude_id and s.scheduled_date between day-2 and day+2
     and (not (shift ? '_publish_locations') or (s.location_id in (select value::uuid from jsonb_array_elements_text(shift->'_publish_locations'))
      and public.schedule_shift_in_department_scope_service(s.job_id,
       case when jsonb_typeof(shift->'_publish_departments')='array' then array(select value::uuid from jsonb_array_elements_text(shift->'_publish_departments')) end,
       coalesce((shift->>'_publish_no_department')::boolean,true))))
   union all
   select s.id,s.location_id,s.scheduled_date,s.start_time,s.end_time,s.time_basis,coalesce(s.time_timezone,l.timezone)
    from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current'
    join public.locations l on l.id=s.location_id and l.workspace_id=w
    where s.workspace_id=w and s.employee_id=emp and (shift ? '_publish_locations' or (s.id is distinct from exclude_id and s.source_shift_id is distinct from exclude_id))
     and s.scheduled_date between day-2 and day+2
     and (schedule_week is null or s.scheduled_date not between schedule_week and schedule_week+6
      or not s.location_id = any(coalesce(schedule_locations, '{}'))
      or (shift ? '_publish_locations' and not (s.location_id in (select value::uuid from jsonb_array_elements_text(shift->'_publish_locations'))
       and public.schedule_shift_in_department_scope_service(s.job_id,
        case when jsonb_typeof(shift->'_publish_departments')='array' then array(select value::uuid from jsonb_array_elements_text(shift->'_publish_departments')) end,
        coalesce((shift->>'_publish_no_department')::boolean,true)))))
   order by 1
  loop
   if neighbor.time_basis not in ('explicit','type_default') or neighbor.start_time is null or neighbor.end_time is null then
    reasons:=reasons||jsonb_build_array(jsonb_build_object('code','neighbor_time_unresolved','message','Another assignment has unresolved hours. Confirm the schedule.','definite',false));
    continue;
   end if;
   neighbor_span:=public.lineup_shift_range(neighbor.scheduled_date,neighbor.start_time,neighbor.end_time,neighbor.zone);
   if span && neighbor_span then
    reasons:=reasons||jsonb_build_array(jsonb_build_object('code','time_overlap','message','Employee already has an overlapping shift.','definite',true,
     'intervals',public.availability_ranges_json(tstzmultirange(span*neighbor_span))));
   else
    gap_minutes:=extract(epoch from greatest(lower(span)-upper(neighbor_span),lower(neighbor_span)-upper(span)))/60;
    if neighbor.location_id<>loc and gap_minutes<settings.minimum_travel_minutes then
     reasons:=reasons||jsonb_build_array(jsonb_build_object('code','minimum_travel','message','There is not enough travel time between locations.','definite',true));
    end if;
    if gap_minutes<settings.minimum_rest_minutes then
     reasons:=reasons||jsonb_build_array(jsonb_build_object('code','minimum_rest','message','There is not enough rest time between shifts.','definite',true));
    end if;
   end if;
  end loop;
 end if;
 reasons:=reasons||app_private.document_shift_reasons(w,emp,day,coalesce(start_at,lower(day_span))); conflict_severity:='allow';
 for rule in select value from jsonb_array_elements(reasons) loop
  rule_severity:=case rule->>'code'
   when 'availability' then settings.conflict_rules->>'availability'
   when 'approved_time_off' then settings.conflict_rules->>'approved_time_off'
   when 'closed_location' then settings.conflict_rules->>'closed_location'
   when 'minimum_travel' then settings.conflict_rules->>'minimum_travel'
   when 'minimum_rest' then settings.conflict_rules->>'minimum_rest' when 'document_required' then settings.conflict_rules->>'document_required' when 'document_conditional_grace' then settings.conflict_rules->>'document_conditional_grace' when 'document_conditional_overdue' then settings.conflict_rules->>'document_conditional_overdue'
   when 'time_source_unresolved' then 'confirm'
   when 'neighbor_time_unresolved' then 'confirm'
   else 'block' end;
  if array_position(array['allow','warn','confirm','block'],rule_severity)>array_position(array['allow','warn','confirm','block'],conflict_severity) then conflict_severity:=rule_severity; end if;
  if rule_severity<>'allow' then annotated:=annotated||jsonb_build_array(rule||jsonb_build_object('severity',rule_severity)); end if;
 end loop;
 reasons:=annotated;
 operation:=case conflict_severity when 'block' then 'blocked' when 'allow' then 'allowed' else 'warning_requires_override' end;
 -- Revision counters, manager notes and unrelated weekdays/settings are not
 -- conflict identity. The adapters use warning_policy to decide warn/confirm.
 fingerprint_payload:=jsonb_build_object('workspace_id',w,'employee_id',emp,
  'assignment',jsonb_build_object('id',coalesce(shift->>'source_shift_id',shift->>'id'),'location_id',loc,'date',day),
  'intervals',public.availability_ranges_json(case when span is null then '{}'::tstzmultirange else tstzmultirange(span) end),
  'unavailable',public.availability_ranges_json(unavailable),'leave',public.availability_ranges_json(leave_ranges),
  'warning_policy',case when conflict_severity='confirm' then 'confirm' else 'warn' end,'operation',operation,
  'conflict_rules',settings.conflict_rules,'minimum_travel_minutes',settings.minimum_travel_minutes,'minimum_rest_minutes',settings.minimum_rest_minutes,'reasons',reasons);
 return jsonb_build_object('coverage',coverage,'operation',operation,'time_basis',basis,'timezone',zone_name,'preference_timezone',preference_zone,
  'assessment_scope',case when span is null then 'calendar_day' else 'shift_interval' end,
  'intervals',public.availability_ranges_json(case when span is null then '{}'::tstzmultirange else tstzmultirange(span) end),
  'available_intervals',case when span is null then '[]'::jsonb else public.availability_ranges_json(remaining) end,
  'unavailable_intervals',public.availability_ranges_json(unavailable+leave_ranges),
  'unknown_intervals',case when span is null then public.availability_ranges_json(tstzmultirange(day_span)) else '[]'::jsonb end,
  'employee_intervals',capacity->'employee_intervals','manager_intervals',capacity->'manager_intervals',
  'has_availability_conflict',span is not null and not isempty(unavailable),'conflict_severity',conflict_severity,
  'warning_policy',case when conflict_severity='confirm' then 'confirm' else 'warn' end,
  'leave',leave_evidence,'pending','[]'::jsonb,'type_restrictions','[]'::jsonb,'reasons',reasons,
  'policy_revision',settings.availability_preferences_revision,
  'fold_resolution',case when ambiguous_clock then 'post_transition_offset' else null end,
  'assessment_minutes',case when span is null then null else extract(epoch from upper(span)-lower(span))/60 end,
  'fingerprint',encode(extensions.digest(convert_to(fingerprint_payload::text,'UTF8'),'sha256'),'hex'));
end; $function$;

-- 9. The schedule's live-update channels are private ---------------------------
-- schedule:invalidation:<workspace> tells open Schedule screens to refetch;
-- schedule:presence:<workspace>:<location>:<week> shows who else is looking.
-- Both were public: anyone with the public key and a workspace id could listen.
-- The API now sends and the web now listens on private channels, and only
-- somebody who can read that workspace's schedule (and, for presence, reach
-- that location) may join. Nobody but the API sends change notices.

create policy "schedule readers receive schedule notices"
on realtime.messages
for select
to authenticated
using (
  case
    when realtime.messages.extension = 'broadcast'
      and (select realtime.topic()) ~ '^schedule:invalidation:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
    then app_private.workspace_has_permission(split_part((select realtime.topic()), ':', 3)::uuid, 'schedule.read')
    when realtime.messages.extension = 'presence'
      and (select realtime.topic()) ~ '^schedule:presence:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}:'
    then app_private.workspace_has_permission(split_part((select realtime.topic()), ':', 3)::uuid, 'schedule.read')
      and app_private.can_access_location(split_part((select realtime.topic()), ':', 3)::uuid, split_part((select realtime.topic()), ':', 4)::uuid)
    else false
  end
);

create policy "schedule readers share their presence"
on realtime.messages
for insert
to authenticated
with check (
  case
    when realtime.messages.extension = 'presence'
      and (select realtime.topic()) ~ '^schedule:presence:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}:'
    then app_private.workspace_has_permission(split_part((select realtime.topic()), ':', 3)::uuid, 'schedule.read')
      and app_private.can_access_location(split_part((select realtime.topic()), ':', 3)::uuid, split_part((select realtime.topic()), ':', 4)::uuid)
    else false
  end
);
