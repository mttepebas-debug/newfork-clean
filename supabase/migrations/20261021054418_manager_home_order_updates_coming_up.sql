-- S-220, S-225 (Mert 2026-10-20): the managers' Home keeps the person's own
-- order of the location cards, apart from the sections' order, and gains two
-- sections: Updates (the last seven days: a week published, a request decided,
-- a person who joined) and Coming up (the next fourteen days: a closed day,
-- approved time off, days not published yet past the next seven).
--
-- Adds: a column on the person's layout row, a section-order helper, a save
-- overload that takes the location order and the eight sections, three
-- indexes for the seven-day reads, and the Home read's layout, order, Updates
-- and Coming up. The four-argument save stays as it is (the API live until
-- this ships calls it); the Workspace dashboard's six-key layout stays too.
--
-- Gates: Home's own (workspace.todos) to open and to save, as before. What a
-- line shows is read under its own rule: a publication or a closed day at a
-- location in the actor's schedule.read scope; time off by requests.read per
-- person (time_off_reason); a shift change at a side in exchange.read scope;
-- a person who joined by employee.read (authz_check).

alter table public.workspace_layout_preferences
  add column location_order uuid[] not null default '{}';

-- The Home's eight sections: the person's order first, any section they have
-- not placed after it, in the first order. Unknown keys are dropped.
create function app_private.home_section_order(target_order text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  with allowed(value, position) as (
    values ('operations', 1), ('pending_requests', 2), ('quick_actions', 3), ('updates', 4),
      ('open_shifts', 5), ('announcements', 6), ('coming_up', 7), ('todos', 8)
  ),
  placed as (
    select input.value, min(input.ordinality) as ordinality
    from unnest(coalesce(target_order, '{}'::text[])) with ordinality input(value, ordinality)
    join allowed on allowed.value = input.value
    group by input.value
  )
  select array_agg(allowed.value order by coalesce(placed.ordinality, 1000 + allowed.position), allowed.position)
  from allowed left join placed on placed.value = allowed.value;
$$;

revoke all on function app_private.home_section_order(text[]) from public, anon, authenticated;

create function public.save_workspace_layout_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_widget_order text[],
  target_hidden_widget_ids text[],
  target_location_order uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed constant text[] := app_private.home_section_order(null);
begin
  -- The home's own gate (KK-34): whoever cannot open it does not arrange it.
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.todos');
  if target_widget_order is null or target_hidden_widget_ids is null or target_location_order is null
    or cardinality(target_widget_order) <> cardinality(allowed)
    or (select count(distinct value) from unnest(target_widget_order) value) <> cardinality(allowed)
    or exists (select 1 from unnest(target_widget_order || target_hidden_widget_ids) value where value is null or not value = any(allowed))
    or cardinality(target_location_order) > 500
    or exists (select 1 from unnest(target_location_order) value where value is null)
    or (select count(distinct value) from unnest(target_location_order) value) <> cardinality(target_location_order) then
    raise exception 'valid workspace layout required' using errcode = '22023';
  end if;

  insert into public.workspace_layout_preferences (workspace_id, user_id, widget_order, hidden_widget_ids, location_order)
  values (
    target_workspace_id,
    actor_user_id,
    target_widget_order,
    array(select distinct value from unnest(target_hidden_widget_ids) value),
    -- S-220: only this workspace's locations are kept; the read shows those in the actor's scope.
    array(
      select given.id
      from unnest(target_location_order) with ordinality given(id, ordinality)
      join public.locations location on location.id = given.id and location.workspace_id = target_workspace_id
      order by given.ordinality
    )
  )
  on conflict (workspace_id, user_id)
  do update set
    widget_order = excluded.widget_order,
    hidden_widget_ids = excluded.hidden_widget_ids,
    location_order = excluded.location_order,
    updated_at = now();

  return jsonb_build_object('status', 'saved');
end;
$$;

revoke all on function public.save_workspace_layout_service(uuid, uuid, text[], text[], uuid[]) from public, anon, authenticated;
grant execute on function public.save_workspace_layout_service(uuid, uuid, text[], text[], uuid[]) to service_role;

-- Updates reads seven days of these; until now only their primary keys led anywhere.
create index schedule_time_off_events_recent_idx on public.schedule_time_off_events (workspace_id, created_at);
create index shift_exchange_events_recent_idx on public.shift_exchange_events (workspace_id, created_at);
create index employee_invitations_accepted_idx on public.employee_invitations (workspace_id, accepted_at)
  where accepted_at is not null;

create or replace function public.get_manager_home_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me app_private.actor_state;
  documents_rule app_private.authz_actions;
  employee_rule app_private.authz_actions;
  places uuid[];
  exchange_places uuid[];
  saved public.workspace_layout_preferences;
  local_today date;
  result jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.todos');
  me := app_private.actor(actor_user_id, target_workspace_id);
  places := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.read');
  exchange_places := app_private.scope_set(actor_user_id, target_workspace_id, 'exchange.read');
  select * into documents_rule from app_private.authz_actions r where r.key = 'documents.read';
  select * into employee_rule from app_private.authz_actions r where r.key = 'employee.read';
  select * into saved from public.workspace_layout_preferences p
  where p.workspace_id = target_workspace_id and p.user_id = actor_user_id;
  -- Coming up starts on the earliest "today" among the locations in view.
  local_today := coalesce(
    (select min((now() at time zone l.timezone)::date) from public.locations l
     where l.workspace_id = target_workspace_id and l.id = any(places)),
    (now() at time zone 'UTC')::date);

  with place as (
    select l.id, l.name, l.timezone, (now() at time zone l.timezone)::date as today
    from public.locations l
    where l.workspace_id = target_workspace_id
      and l.id = any(places)
  ),
  shift as (
    select s.id, s.location_id, s.employee_id, s.job_id, s.scheduled_date,
      (s.scheduled_date + s.start_time) at time zone s.time_timezone as starts_at,
      (s.scheduled_date + s.end_time + case when s.crosses_midnight then interval '1 day' else interval '0 days' end)
        at time zone s.time_timezone as ends_at
    from public.schedule_published_shifts s
    join public.schedule_location_publications p on p.id = s.publication_id and p.status = 'current'
    join place on place.id = s.location_id
    where s.workspace_id = target_workspace_id
      -- Every zone's date is within a day of UTC's: keeps the date index range.
      and s.scheduled_date between (now() at time zone 'UTC')::date - 2 and (now() at time zone 'UTC')::date + 8
      and s.scheduled_date between place.today - 1 and place.today + 6
  ),
  person as (
    select e.id, e.user_id, btrim(coalesce(nullif(btrim(e.preferred_name), ''), e.first_name) || ' ' || e.last_name) as name
    from public.employee_profiles e
    where e.workspace_id = target_workspace_id
  ),
  -- Updates (S-225), the last seven days. A location-week published, its latest version.
  published as (
    select distinct on (p.location_id, p.week_start) p.id, p.location_id, p.week_start, p.published_at, p.published_by
    from public.schedule_location_publications p
    where p.workspace_id = target_workspace_id
      and p.location_id = any(places)
      and p.published_at > now() - interval '7 days'
    order by p.location_id, p.week_start, p.published_at desc
  ),
  -- Time off decided: the request's own verdict (not a shortening or a cancellation's echo), still standing.
  decided_time_off as materialized (
    -- decided_by, not actor_user_id: a column named as the parameter makes the whole read ambiguous (42702).
    select distinct on (event.request_id) event.id, event.request_id, event.action, event.actor_user_id as decided_by, event.created_at,
      request.employee_id
    from public.schedule_time_off_events event
    join public.schedule_time_off_requests request on request.id = event.request_id
    where event.workspace_id = target_workspace_id
      and event.created_at > now() - interval '7 days'
      and event.action in ('approved', 'denied')
      and not event.metadata ? 'shortened'
      and not event.metadata ? 'cancellation_request_id'
      and request.request_type = 'time_off'
      and request.status::text = event.action
    order by event.request_id, event.created_at desc
  ),
  -- A shift change a manager closed: approved, or declined where that ends it (a direct request).
  decided_exchange as (
    select distinct on (event.case_id) event.id, event.action, event.actor_user_id as decided_by, event.created_at, exchange.kind,
      exchange.owner_id, exchange.offered_snapshot, exchange.requested_snapshot
    from public.shift_exchange_events event
    join public.shift_exchange_cases exchange on exchange.id = event.case_id
    where event.workspace_id = target_workspace_id
      and event.created_at > now() - interval '7 days'
      and (event.action = 'transfer_completed' or (event.action = 'application_rejected' and exchange.audience = 'direct'))
      and ((exchange.offered_snapshot ->> 'location_id')::uuid = any(exchange_places)
        or (exchange.kind = 'swap' and (exchange.requested_snapshot ->> 'location_id')::uuid = any(exchange_places)))
    order by event.case_id, event.created_at desc
  ),
  joined as materialized (
    select invitation.id, invitation.employee_id, invitation.accepted_at
    from public.employee_invitations invitation
    where invitation.workspace_id = target_workspace_id
      and invitation.accepted_at > now() - interval '7 days'
  ),
  update_line as (
    select published.published_at as at, jsonb_build_object(
      'kind', 'published',
      'id', published.id::text,
      'at', published.published_at,
      'location_ids', jsonb_build_array(published.location_id),
      'by', (select person.name from person where person.user_id = published.published_by limit 1),
      'first_date', published.week_start,
      'last_date', published.week_start + 6,
      'shifts', (select count(*) from public.schedule_published_shifts s
        where s.workspace_id = target_workspace_id and s.location_id = published.location_id
          and s.scheduled_date between published.week_start and published.week_start + 6
          and s.publication_id = published.id)
    ) as line
    from published
    union all
    select decided.created_at, jsonb_build_object(
      'kind', 'time_off',
      'id', decided.id::text,
      'at', decided.created_at,
      'location_ids', coalesce((
        select jsonb_agg(assignment.location_id order by assignment.is_primary desc, assignment.location_id)
        from public.employee_location_assignments assignment
        where assignment.employee_id = decided.employee_id and assignment.ended_at is null
          and assignment.location_id = any(places)
      ), '[]'::jsonb),
      'approved', decided.action = 'approved',
      'person', who.name,
      'by', (select person.name from person where person.user_id = decided.decided_by limit 1),
      'first_date', (select min(segment.segment_date) from public.schedule_time_off_segments segment where segment.request_id = decided.request_id),
      'last_date', (select max(segment.segment_date) from public.schedule_time_off_segments segment where segment.request_id = decided.request_id)
    )
    from decided_time_off decided
    join person who on who.id = decided.employee_id
    where app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', decided.employee_id) is null
    union all
    select decided.created_at, jsonb_build_object(
      'kind', decided.kind,
      'id', decided.id::text,
      'at', decided.created_at,
      'location_ids', to_jsonb(array(
        select distinct side from unnest(array[(decided.offered_snapshot ->> 'location_id')::uuid,
          (decided.requested_snapshot ->> 'location_id')::uuid]) side
        where side = any(exchange_places))),
      'approved', decided.action = 'transfer_completed',
      'person', coalesce(owner.name, 'Somebody'),
      'by', (select person.name from person where person.user_id = decided.decided_by limit 1),
      'first_date', (decided.offered_snapshot ->> 'date')::date,
      'last_date', (decided.offered_snapshot ->> 'date')::date
    )
    from decided_exchange decided
    left join person owner on owner.id = decided.owner_id
    union all
    select joined.accepted_at, jsonb_build_object(
      'kind', 'joined',
      'id', joined.id::text,
      'at', joined.accepted_at,
      'location_ids', coalesce((
        select jsonb_agg(assignment.location_id order by assignment.is_primary desc, assignment.location_id)
        from public.employee_location_assignments assignment
        where assignment.employee_id = joined.employee_id and assignment.ended_at is null
          and assignment.location_id = any(places)
      ), '[]'::jsonb),
      'person', who.name
    )
    from joined
    join person who on who.id = joined.employee_id
    where who.user_id is distinct from actor_user_id
      and app_private.authz_check(me, employee_rule, null, joined.employee_id, null) is null
  ),
  -- Coming up (S-225), the next fourteen days. A day an announcement closes a location in view.
  closed as (
    select closure.announcement_id, closure.title, min(closure.closed_date) as first_date, max(closure.closed_date) as last_date,
      jsonb_agg(distinct closure.location_id) as location_ids
    from public.schedule_closures closure
    join place on place.id = closure.location_id
    where closure.workspace_id = target_workspace_id
      and closure.kind = 'closed'
      and closure.closed_date between place.today and place.today + 13
    group by closure.announcement_id, closure.title
  ),
  approved_off as materialized (
    select request.id, request.employee_id, min(segment.segment_date) as first_date, max(segment.segment_date) as last_date
    from public.schedule_time_off_segments segment
    join public.schedule_time_off_requests request on request.id = segment.request_id
    where segment.workspace_id = target_workspace_id
      and segment.segment_date between local_today and local_today + 13
      and segment.status = 'approved'
      and request.status = 'approved'
      and request.request_type = 'time_off'
    group by request.id, request.employee_id
  ),
  -- Days past the next seven (those are in "Needs you") with no current publication.
  unpublished as (
    select place.id as location_id, min(day.date) as first_date, max(day.date) as last_date
    from place
    cross join lateral (select (place.today + offset_days)::date as date from generate_series(7, 13) offset_days) day
    where not exists (
      select 1 from public.schedule_location_publications publication
      where publication.location_id = place.id and publication.status = 'current'
        and day.date >= publication.week_start and day.date < publication.week_start + 7)
    group by place.id
  ),
  coming_line as (
    select closed.first_date, 1 as rank, jsonb_build_object(
      'kind', 'closed', 'id', closed.announcement_id::text, 'location_ids', closed.location_ids, 'name', closed.title,
      'first_date', closed.first_date, 'last_date', closed.last_date) as line
    from closed
    union all
    select off.first_date, 2, jsonb_build_object(
      'kind', 'time_off', 'id', off.id::text,
      'location_ids', coalesce((
        select jsonb_agg(assignment.location_id order by assignment.is_primary desc, assignment.location_id)
        from public.employee_location_assignments assignment
        where assignment.employee_id = off.employee_id and assignment.ended_at is null
          and assignment.location_id = any(places)
      ), '[]'::jsonb),
      'person', who.name, 'first_date', off.first_date, 'last_date', off.last_date)
    from approved_off off
    join person who on who.id = off.employee_id
    where app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', off.employee_id) is null
    union all
    select unpublished.first_date, 3, jsonb_build_object(
      'kind', 'unpublished', 'id', unpublished.location_id::text || ':' || unpublished.first_date::text,
      'location_ids', jsonb_build_array(unpublished.location_id),
      'first_date', unpublished.first_date, 'last_date', unpublished.last_date)
    from unpublished
  )
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'now', now(),
    -- S-220: in the person's own order; a location they have not placed comes after, by name.
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', place.id,
        'name', place.name,
        'timezone', place.timezone,
        'today', place.today,
        -- Today's shifts there, last night's that run into it too: "on now" and the hours line.
        'today_shifts', coalesce((
          select jsonb_agg(jsonb_build_object('starts_at', shift.starts_at, 'ends_at', shift.ends_at,
            'open', shift.employee_id is null) order by shift.starts_at, shift.id)
          from shift
          where shift.location_id = place.id
            and shift.scheduled_date <= place.today
            and shift.ends_at > place.today::timestamp at time zone place.timezone
        ), '[]'::jsonb),
        -- S-163 (7): somebody in a Management job on a published shift there today.
        'floor_managers', coalesce((
          select jsonb_agg(jsonb_build_object('name', person.name, 'starts_at', shift.starts_at, 'ends_at', shift.ends_at)
            order by shift.starts_at, person.name)
          from shift
          join person on person.id = shift.employee_id
          join public.jobs job on job.id = shift.job_id
          join public.departments department on department.id = job.department_id and department.system_key = 'management'
          where shift.location_id = place.id
            and shift.scheduled_date <= place.today
            and shift.ends_at > place.today::timestamp at time zone place.timezone
        ), '[]'::jsonb),
        'week', (
          select jsonb_agg(jsonb_build_object(
            'date', day.date,
            'shifts', (select count(*) from shift where shift.location_id = place.id and shift.scheduled_date = day.date),
            'open', (select count(*) from shift where shift.location_id = place.id and shift.scheduled_date = day.date and shift.employee_id is null),
            'published', exists (
              select 1 from public.schedule_location_publications publication
              where publication.location_id = place.id and publication.status = 'current'
                and day.date >= publication.week_start and day.date < publication.week_start + 7)
          ) order by day.date)
          from (select (place.today + offset_days)::date as date from generate_series(0, 6) offset_days) day
        ),
        'open_shifts', coalesce((
          select jsonb_agg(jsonb_build_object('date', open_shift.scheduled_date, 'starts_at', open_shift.starts_at,
            'ends_at', open_shift.ends_at, 'job_name', open_shift.job_name) order by open_shift.starts_at)
          from (
            select shift.scheduled_date, shift.starts_at, shift.ends_at, job.name as job_name
            from shift join public.jobs job on job.id = shift.job_id
            where shift.location_id = place.id and shift.employee_id is null and shift.ends_at > now()
            order by shift.starts_at, shift.id
            limit 12
          ) open_shift
        ), '[]'::jsonb),
        -- S-206: whoever works here without a required document, as the documents rule lets the actor see.
        'missing_documents', coalesce((
          select jsonb_agg(jsonb_build_object('employee_id', missing.employee_id, 'name', missing.name,
            'document', missing.title) order by missing.name, missing.title)
          from (
            select distinct requirement.employee_id, person.name, requirement.title
            from public.employee_onboarding_requirements requirement
            join person on person.id = requirement.employee_id
            join public.employee_profiles profile on profile.id = requirement.employee_id and profile.archived_at is null
            where requirement.workspace_id = target_workspace_id
              and requirement.kind = 'document'
              and requirement.required
              and not requirement.owner_excused
              and exists (
                select 1 from public.employee_location_assignments assignment
                where assignment.employee_id = requirement.employee_id and assignment.location_id = place.id
                  and assignment.ended_at is null)
              and app_private.document_obligation_state(requirement, now()) in ('missing', 'rejected', 'expired')
              and app_private.authz_check(me, documents_rule, null, requirement.employee_id, null) is null
            order by person.name, requirement.title
            limit 20
          ) missing
        ), '[]'::jsonb)
      ) order by array_position(coalesce(saved.location_order, '{}'::uuid[]), place.id) nulls last, place.name, place.id)
      from place
    ), '[]'::jsonb),
    -- Time off waiting on an answer the actor may read, with the person's locations in view.
    'time_off', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', request.id,
        'employee_id', request.employee_id,
        'employee_name', person.name,
        'first_date', (select min(segment.segment_date) from public.schedule_time_off_segments segment where segment.request_id = request.id),
        'last_date', (select max(segment.segment_date) from public.schedule_time_off_segments segment where segment.request_id = request.id),
        'location_ids', coalesce((
          select jsonb_agg(assignment.location_id order by assignment.is_primary desc, assignment.location_id)
          from public.employee_location_assignments assignment
          where assignment.employee_id = request.employee_id and assignment.ended_at is null
            and assignment.location_id = any(places)
        ), '[]'::jsonb)
      ) order by request.created_at, request.id)
      from (
        select r.*
        from public.schedule_time_off_requests r
        where r.workspace_id = target_workspace_id
          and r.status = 'pending'
          and r.request_type = 'time_off'
          and app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', r.employee_id) is null
        order by r.created_at, r.id
        limit 50
      ) request
      join person on person.id = request.employee_id
    ), '[]'::jsonb),
    -- S-220: the person's sections, the two new ones after what they placed.
    'layout', jsonb_build_object(
      'widget_order', to_jsonb(app_private.home_section_order(saved.widget_order)),
      'hidden_widget_ids', to_jsonb(array(
        select distinct value from unnest(coalesce(saved.hidden_widget_ids, '{}'::text[])) value
        where value = any(app_private.home_section_order(null))))
    ),
    'updates', coalesce((
      select jsonb_agg(item.line order by item.at desc, item.line ->> 'id')
      from (select * from update_line order by at desc, line ->> 'id' limit 30) item
    ), '[]'::jsonb),
    'coming_up', coalesce((
      select jsonb_agg(item.line order by item.first_date, item.rank, item.line ->> 'id')
      from (select * from coming_line order by first_date, rank, line ->> 'id' limit 30) item
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;
