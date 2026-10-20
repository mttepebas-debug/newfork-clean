-- Bugs 2 and 35 (2026-10-20): an announcement reaches people, not checked
-- locations. Publishing and the scheduled release refuse a post that would
-- reach nobody but its author; the location row's people count leaves out
-- whoever is writing, as the recipient count already did.
-- Every function here is replaced whole; its owner and grants stay.

CREATE OR REPLACE FUNCTION "app_private"."announcement_proposal"("w" "uuid", "stored" "public"."announcements", "p" "jsonb", "author" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  picked_category text := coalesce(nullif(p ->> 'category', ''), 'general');
  picked_recurrence text := coalesce(nullif(p ->> 'recurrence', ''), 'none');
  first_day date := nullif(p ->> 'starts_on', '')::date;
  final_day date := nullif(p ->> 'ends_on', '')::date;
  time_from time := nullif(p ->> 'event_from', '')::time;
  time_until time := nullif(p ->> 'event_until', '')::time;
  sent jsonb := coalesce(p -> 'locations', '[]'::jsonb);
  live_rows jsonb;
  kept_rows jsonb;
  stored_live jsonb;
  added uuid[];
  zone_name text;
  hours boolean;
begin
  -- The shapes first: the checks below read inside them.
  if jsonb_typeof(sent) <> 'array' or coalesce(jsonb_typeof(p -> 'choices'), 'object') <> 'object'
     or jsonb_typeof(coalesce(p -> 'people', '[]'::jsonb)) <> 'array' then
    raise exception 'This post can''t be saved as sent.' using errcode = '22023', hint = 'announcement.invalid';
  end if;
  if picked_category not in (select unnest(enum_range(null::public.announcement_category))::text)
     or picked_recurrence not in ('none', 'date', 'nth', 'last')
     or char_length(btrim(coalesce(p ->> 'title', ''))) > 120
     or char_length(btrim(coalesce(p ->> 'body', ''))) > 5000
     or char_length(btrim(coalesce(p ->> 'category_other', ''))) > 40
     or (time_from is null) <> (time_until is null)
     or jsonb_typeof(sent) <> 'array' or jsonb_array_length(sent) > 100
     or jsonb_typeof(coalesce(p -> 'people', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p -> 'people', '[]'::jsonb)) > 1000
     or exists (select 1 from jsonb_array_elements(coalesce(p -> 'people', '[]'::jsonb)) x
                where jsonb_typeof(x) <> 'string' or x #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
     or exists (
       select 1 from jsonb_array_elements(sent) r
       where jsonb_typeof(r) <> 'object'
          or coalesce(r ->> 'location_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          or coalesce(r ->> 'day', '') not in ('open', 'closed', 'short')
          or (r ->> 'day' = 'short' and (coalesce(r ->> 'opens', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
                                         or coalesce(r ->> 'closes', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')))
     or (select count(*) <> count(distinct r ->> 'location_id') from jsonb_array_elements(sent) r)
     -- A shift's choice: Keep, Remove, Open shift, or new hours (Short hours).
     or coalesce(jsonb_typeof(p -> 'choices'), 'object') <> 'object'
     or exists (
       select 1 from jsonb_each(coalesce(p -> 'choices', '{}'::jsonb)) c
       where c.key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          or jsonb_typeof(c.value) <> 'object'
          or coalesce(c.value ->> 'choice', '') not in ('keep', 'remove', 'open', 'edit')
          or (c.value ->> 'choice' = 'edit' and not (coalesce(c.value ->> 'from', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
                                                    and coalesce(c.value ->> 'until', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'))) then
    raise exception 'This post can''t be saved as sent.' using errcode = '22023', hint = 'announcement.invalid';
  end if;
  -- A row at an archived location the record already has stays as it was
  -- (kept_rows); any other location that is not a live one here is the same no
  -- as one out of reach.
  sent := coalesce((
    select jsonb_agg(r) from jsonb_array_elements(sent) r
    where not exists (select 1 from public.locations location
                      join public.announcement_locations target
                        on target.location_id = location.id and target.announcement_id = stored.id
                      where location.id = (r ->> 'location_id')::uuid and location.archived_at is not null)), '[]'::jsonb);
  if exists (select 1 from jsonb_array_elements(sent) r
             where not exists (select 1 from public.locations location
                               where location.id = (r ->> 'location_id')::uuid and location.workspace_id = w
                                 and location.archived_at is null)) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.write';
  end if;

  live_rows := coalesce((
    select jsonb_agg(jsonb_build_object('location_id', (r ->> 'location_id')::uuid, 'day', r ->> 'day',
      'opens', case when r ->> 'day' = 'short' then to_char((r ->> 'opens')::time, 'HH24:MI') end,
      'closes', case when r ->> 'day' = 'short' then to_char((r ->> 'closes')::time, 'HH24:MI') end)
      order by (r ->> 'location_id')::uuid)
    from jsonb_array_elements(sent) r), '[]'::jsonb);
  kept_rows := coalesce((
    select jsonb_agg(r order by (r ->> 'location_id')::uuid)
    from jsonb_array_elements(app_private.announcement_rows(stored.id)) r
    join public.locations location on location.id = (r ->> 'location_id')::uuid and location.archived_at is not null), '[]'::jsonb);
  hours := exists (select 1 from jsonb_array_elements(live_rows) r where r ->> 'day' <> 'open');

  added := array(select distinct x::uuid from jsonb_array_elements_text(coalesce(p -> 'people', '[]'::jsonb)) x);
  if exists (
    select 1 from unnest(added) who
    where not exists (select 1 from public.workspace_memberships membership
                      where membership.workspace_id = w and membership.user_id = who and membership.status = 'active')
      and not exists (select 1 from public.announcement_people person
                      where person.announcement_id = stored.id and person.user_id = who)) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.write';
  end if;

  -- Z2: a change in hours takes the whole day; the event time is for a day
  -- whose hours stay.
  if hours then
    time_from := null;
    time_until := null;
  end if;
  if first_day is null then
    picked_recurrence := 'none';
  end if;

  if stored.id is not null and app_private.announcement_started(stored) then
    stored_live := coalesce((
      select jsonb_agg(r order by (r ->> 'location_id')::uuid)
      from jsonb_array_elements(app_private.announcement_rows(stored.id)) r
      join public.locations location on location.id = (r ->> 'location_id')::uuid and location.archived_at is null), '[]'::jsonb);
    if (first_day, time_from, time_until, picked_recurrence)
         is distinct from (stored.starts_on, stored.event_from, stored.event_until, stored.recurrence)
       or live_rows is distinct from stored_live then
      raise exception 'It has started: only its text, its people, the boxes and Ends change now.'
        using errcode = '22023', hint = 'announcement.started_locked';
    end if;
  end if;

  -- Z1: the clock of its first checked location; with none, the author's
  -- primary location's, then the device's.
  zone_name := (select location.timezone from jsonb_array_elements(live_rows) r
                join public.locations location on location.id = (r ->> 'location_id')::uuid
                order by location.sort_order, location.name limit 1);
  if zone_name is null then
    zone_name := (select location.timezone from public.employee_profiles person
                  join public.employee_location_assignments assignment
                    on assignment.employee_id = person.id and assignment.ended_at is null
                  join public.locations location on location.id = assignment.location_id and location.archived_at is null
                  where person.workspace_id = w and person.user_id = author and person.archived_at is null
                  order by assignment.is_primary desc, location.sort_order, location.name limit 1);
  end if;
  if zone_name is null and nullif(p ->> 'time_zone', '') is not null then
    begin
      perform now() at time zone (p ->> 'time_zone');
      zone_name := p ->> 'time_zone';
    exception when others then
      zone_name := null;
    end;
  end if;

  return jsonb_build_object(
    'title', btrim(coalesce(p ->> 'title', '')),
    'body', btrim(coalesce(p ->> 'body', '')),
    'category', picked_category,
    'category_other', case when picked_category = 'other' then nullif(btrim(p ->> 'category_other'), '') end,
    'starts_on', first_day,
    'ends_on', final_day,
    'event_from', to_char(time_from, 'HH24:MI'),
    'event_until', to_char(time_until, 'HH24:MI'),
    'recurrence', picked_recurrence,
    'on_important_dates', coalesce((p ->> 'on_important_dates')::boolean, false),
    'on_calendar', coalesce((p ->> 'on_calendar')::boolean, false),
    'on_schedule', coalesce((p ->> 'on_schedule')::boolean, false),
    'ask_ack', coalesce((p ->> 'ask_ack')::boolean, false),
    'time_zone', coalesce(zone_name, stored.time_zone, 'America/Los_Angeles'),
    'publish_at', nullif(p ->> 'publish_at', '')::timestamptz,
    'locations', coalesce((select jsonb_agg(r order by (r ->> 'location_id')::uuid)
                           from jsonb_array_elements(live_rows || kept_rows) r), '[]'::jsonb),
    'live_location_ids', coalesce((select jsonb_agg(r -> 'location_id') from jsonb_array_elements(live_rows) r), '[]'::jsonb),
    'people', to_jsonb(added),
    -- Bug 2: who wrote it never counts as reached; the checks read it here.
    'author', author,
    'hours', hours,
    'choices', case when jsonb_typeof(p -> 'choices') = 'object' then p -> 'choices' else '{}'::jsonb end);
end;
$_$;

CREATE OR REPLACE FUNCTION "app_private"."announcement_problems"("w" "uuid", "stored" "public"."announcements", "n" "jsonb", "intent" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  found jsonb := '[]'::jsonb;
  fmt text := app_private.announcement_time_format(w);
  zone_name text := n ->> 'time_zone';
  today date := (now() at time zone (n ->> 'time_zone'))::date;
  first_day date := (n ->> 'starts_on')::date;
  final_day date := (n ->> 'ends_on')::date;
  time_from time := (n ->> 'event_from')::time;
  time_until time := (n ->> 'event_until')::time;
  publish_moment timestamptz := (n ->> 'publish_at')::timestamptz;
  started boolean := stored.id is not null and app_private.announcement_started(stored);
  start_moment timestamptz;
  needs_day boolean := (n ->> 'on_important_dates')::boolean or (n ->> 'on_calendar')::boolean
    or (n ->> 'on_schedule')::boolean or (n ->> 'hours')::boolean;
  hit record;
  r jsonb;
begin
  if n ->> 'title' = '' then
    found := found || jsonb_build_array(jsonb_build_object('tab', 'details', 'field', 'title', 'code', 'title_required',
      'message', 'Add a title.', 'required', true));
  end if;
  if intent = 'draft' then
    return found;
  end if;
  if n ->> 'category' = 'other' and n ->> 'category_other' is null then
    found := found || jsonb_build_array(jsonb_build_object('tab', 'details', 'field', 'category_other',
      'code', 'category_name_required', 'message', 'Name the category.', 'required', true));
  end if;
  if first_day is null then
    if needs_day or final_day is not null or time_from is not null then
      found := found || jsonb_build_array(jsonb_build_object('tab', 'details', 'field', 'starts_on', 'code', 'start_required',
        'message', 'Choose the day it starts.', 'required', true));
    end if;
  else
    if not started and first_day < today then
      found := found || jsonb_build_array(jsonb_build_object('tab', 'details', 'field', 'starts_on', 'code', 'start_past',
        'message', 'It can''t start before today (' || app_private.announcement_day_text(today) || ').', 'required', false));
    end if;
    if final_day < first_day then
      found := found || jsonb_build_array(jsonb_build_object('tab', 'details', 'field', 'ends_on', 'code', 'ends_before_starts',
        'message', 'Ends can''t be before Starts.', 'required', false));
    end if;
    if started and coalesce(final_day, first_day) < today then
      found := found || jsonb_build_array(jsonb_build_object('tab', 'details', 'field', 'ends_on', 'code', 'ends_past',
        'message', 'Ends can''t be before today.', 'required', false));
    end if;
  end if;
  if time_from is not null and coalesce(final_day, first_day) is not distinct from first_day and time_until <= time_from then
    found := found || jsonb_build_array(jsonb_build_object('tab', 'details', 'field', 'event_until', 'code', 'event_time_order',
      'message', 'The end time must be after the start time.', 'required', false));
  end if;

  for r in
    select row_item from jsonb_array_elements(n -> 'locations') row_item
    join public.locations location on location.id = (row_item ->> 'location_id')::uuid and location.archived_at is null
    where row_item ->> 'day' <> 'open'
    order by location.sort_order, location.name
  loop
    if r ->> 'day' = 'short' and not ((r ->> 'closes')::time > (r ->> 'opens')::time or (r ->> 'closes')::time <= time '06:00') then
      found := found || jsonb_build_array(jsonb_build_object('tab', 'where', 'field', 'location:' || (r ->> 'location_id'),
        'code', 'hours_invalid', 'message', 'Closing must be after opening, at most 6:00 AM the next day.', 'required', false));
    end if;
    -- S4: one record sets a location's hours for a day.
    if first_day is not null then
      select other.title, location.name location_name, target.day, greatest(other.starts_on, first_day) on_day into hit
      from public.announcements other
      join public.announcement_locations target
        on target.announcement_id = other.id and target.location_id = (r ->> 'location_id')::uuid and target.day <> 'open'
      join public.locations location on location.id = target.location_id
      where other.workspace_id = w and other.id is distinct from stored.id and other.archived_at is null
        and other.status in ('scheduled', 'published') and other.starts_on is not null
        and other.starts_on <= coalesce(final_day, first_day) and coalesce(other.ends_on, other.starts_on) >= first_day
      order by other.starts_on, other.id limit 1;
      if hit.title is not null then
        found := found || jsonb_build_array(jsonb_build_object('tab', 'where', 'field', 'location:' || (r ->> 'location_id'),
          'code', 'hours_taken', 'message', hit.location_name || ' already has '
            || case when hit.day = 'closed' then 'Closed' else 'Short hours' end || ' on '
            || app_private.announcement_day_text(hit.on_day) || ' (' || hit.title
            || '). Only one post can set a location''s hours for a day.', 'required', false));
      end if;
    end if;
  end loop;

  if intent = 'schedule' then
    select span.starts_at into start_moment
    from app_private.announcement_span(w, first_day, final_day, time_from, time_until, zone_name, n -> 'locations') span;
    if publish_moment is null then
      found := found || jsonb_build_array(jsonb_build_object('tab', 'where', 'field', 'publish_at', 'code', 'publish_time_required',
        'message', 'Pick when it publishes.', 'required', true));
    elsif publish_moment <= now() then
      found := found || jsonb_build_array(jsonb_build_object('tab', 'where', 'field', 'publish_at', 'code', 'publish_time_past',
        'message', 'Pick a time after now (' || to_char(now() at time zone zone_name, 'Dy, Mon FMDD, ')
          || case when fmt = '24h' then to_char(now() at time zone zone_name, 'HH24:MI')
                  else to_char(now() at time zone zone_name, 'FMHH12:MI AM') end || ').', 'required', false));
    elsif start_moment is not null and publish_moment >= start_moment then
      found := found || jsonb_build_array(jsonb_build_object('tab', 'where', 'field', 'publish_at', 'code', 'publish_after_start',
        'message', 'Publish it before it starts (' || app_private.announcement_day_text(first_day)
          || case when time_from is not null then ', ' || case when fmt = '24h' then to_char(time_from, 'HH24:MI')
                                                              else to_char(time_from, 'FMHH12:MI AM') end else '' end
          || ').', 'required', false));
    end if;
  end if;

  -- Bug 2: it goes to people, not to checked locations; with nobody but its
  -- author at them (or only its author named) it reaches nobody.
  if cardinality(app_private.announcement_audience(w,
       array(select x::uuid from jsonb_array_elements_text(n -> 'live_location_ids') x),
       array(select x::uuid from jsonb_array_elements_text(n -> 'people') x),
       array(select change.employee_id from public.announcement_shift_changes change
             where change.announcement_id = stored.id and not change.silent and change.brought_back_at is null),
       coalesce(stored.created_by, (n ->> 'author')::uuid))) = 0 then
    found := found || jsonb_build_array(jsonb_build_object('tab', 'aud', 'field', 'people', 'code', 'nobody',
      'message', 'Nobody gets it yet. Check a location on Locations & publishing, or add people here.', 'required', true));
  end if;
  return found;
end;
$$;

CREATE OR REPLACE FUNCTION "app_private"."announcement_release"("w" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  place uuid;
  item public.announcements;
  publisher uuid;
  impact jsonb;
  reached uuid[];
  told integer;
  released integer := 0;
  failure text;
  failure_hint text;
  failure_text text;
begin
  for place in
    select distinct announcement.workspace_id from public.announcements announcement
    where (w is null or announcement.workspace_id = w) and announcement.archived_at is null
      and ((announcement.status = 'scheduled' and announcement.publish_at <= now() and announcement.release_failed_at is null)
        or (announcement.status = 'published'
            and coalesce(announcement.ends_on, announcement.starts_on) <= (now() at time zone 'UTC')::date + 1
            and (cardinality(announcement.delivered_to) > 0 or (announcement.recurrence <> 'none' and not exists (
              select 1 from public.announcements other where other.repeats_from = announcement.id)))))
    order by 1
  loop
    -- The order a save takes: this lock, the record, then the Schedule's.
    perform pg_advisory_xact_lock(hashtextextended(place::text, 931));
    for item in
      select * from public.announcements announcement
      where announcement.workspace_id = place and announcement.status = 'scheduled' and announcement.archived_at is null
        and announcement.publish_at <= now() and announcement.release_failed_at is null
      order by announcement.publish_at, announcement.id
      for update skip locked
    loop
      begin
        perform public.availability_lock_workspace(place);
        publisher := coalesce(item.scheduled_by, item.created_by);
        if exists (select 1 from app_private.announcement_moments(item) moment where moment.starts_at <= now()) then
          raise exception 'too_late' using errcode = '22023', hint = 'announcement.too_late';
        end if;
        failure := app_private.announcement_reason(app_private.actor(publisher, place), app_private.announcement_places(item.id),
          item.created_by, app_private.announcement_dates(item));
        if failure is not null then
          raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || failure, detail = 'announcement.write';
        end if;
        -- Bug 2: due with nobody left to reach (they left its locations), it stays back.
        if cardinality(app_private.announcement_recipients(item)) = 0 then
          raise exception 'nobody' using errcode = '22023', hint = 'announcement.nobody';
        end if;
        impact := app_private.announcement_impact(place, item.id, item.starts_on, item.ends_on,
          app_private.announcement_rows(item.id), item.shift_choices, item.choices_saved_at);
        update public.announcements
        set status = 'published', published_at = item.publish_at, published_by = publisher, unpublished_at = null,
            release_error = null, revision = revision + 1
        where id = item.id returning * into item;
        told := app_private.announcement_apply(publisher, item, impact);
        reached := app_private.announcement_recipients(item);
        update public.announcements set delivered_to = reached where id = item.id;
        -- Out on time: whoever it reaches who has not acknowledged it (brought out again), not its publisher.
        perform app_private.announcement_tell(publisher, item, 'published', array(
          select who from unnest(reached) who where not exists (select 1 from public.announcement_acknowledgements ack
            where ack.announcement_id = item.id and ack.user_id = who)));
        insert into public.announcement_changes (workspace_id, announcement_id, actor_user_id, action, detail)
        values (place, item.id, publisher, 'published', jsonb_strip_nulls(jsonb_build_object('auto', true,
          'shift_changes', nullif(told, 0), 'told', cardinality(reached))));
        released := released + 1;
      exception when others then
        get stacked diagnostics failure = returned_sqlstate, failure_hint = pg_exception_hint, failure_text = message_text;
        if failure = '42501' or failure_hint in ('announcement.too_late', 'announcement.nobody') then
          update public.announcements
          set release_failed_at = now(), release_error = left(failure || ': ' || failure_text, 2000), revision = revision + 1
          where id = item.id returning * into item;
          insert into public.announcement_changes (workspace_id, announcement_id, actor_user_id, action, detail)
          values (place, item.id, null, 'publish_failed',
            jsonb_build_object('code', case when failure = '42501' then 'not_allowed'
                                            when failure_hint = 'announcement.nobody' then 'nobody' else 'too_late' end));
          perform app_private.announcement_tell_release_failed(item, case when failure = '42501'
            then 'Whoever scheduled it may no longer publish it.'
            when failure_hint = 'announcement.nobody' then 'Nobody else would get it.'
            else 'Its day started before it could go out.' end);
        else
          -- One broken row must not hold up every workspace's, nor the read
          -- that called this (O2). It tries again the next minute (KK-98).
          update public.announcements set release_error = left(failure || ': ' || failure_text, 2000) where id = item.id;
        end if;
      end;
    end loop;

    for item in
      select * from public.announcements announcement
      where announcement.workspace_id = place and announcement.status = 'published' and announcement.archived_at is null
        and coalesce(announcement.ends_on, announcement.starts_on) <= (now() at time zone 'UTC')::date + 1
        and (cardinality(announcement.delivered_to) > 0 or (announcement.recurrence <> 'none' and not exists (
          select 1 from public.announcements other where other.repeats_from = announcement.id)))
        and exists (select 1 from app_private.announcement_moments(announcement) moment where moment.ends_at <= now())
      for update skip locked
    loop
      begin
        if cardinality(item.delivered_to) > 0 then
          update public.announcements set delivered_to = '{}' where id = item.id;
        end if;
        if item.recurrence <> 'none' then
          perform app_private.announcement_repeat(item);
        end if;
      exception when others then
        -- The next minute tries again.
        raise warning 'announcement % did not close: %', item.id, sqlerrm;
      end;
    end loop;
  end loop;
  return released;
end;
$$;

CREATE OR REPLACE FUNCTION "app_private"."announcement_item"("state" "app_private"."actor_state", "item" "public"."announcements", "allowed" boolean) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'id', item.id, 'title', item.title, 'body', item.body,
    'category', item.category, 'category_other', item.category_other,
    'status', item.status, 'display_status', shown.status,
    'publish_error_code', case when shown.status <> 'publish_failed' then null
      when item.release_error like '42501%' then 'not_allowed'
      when item.release_error like '%too_late%' then 'too_late'
      when item.release_error = '22023: nobody' then 'nobody' else 'failed' end,
    'starts_on', item.starts_on, 'ends_on', item.ends_on,
    'event_from', to_char(item.event_from, 'HH24:MI'), 'event_until', to_char(item.event_until, 'HH24:MI'),
    'recurrence', item.recurrence,
    'on_important_dates', item.on_important_dates, 'on_calendar', item.on_calendar, 'on_schedule', item.on_schedule,
    'ask_ack', item.ask_ack, 'time_zone', item.time_zone,
    'publish_at', item.publish_at, 'published_at', item.published_at, 'unpublished_at', item.unpublished_at,
    'archived_at', item.archived_at, 'starts_at', moment.starts_at, 'ends_at', moment.ends_at,
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('location_id', target.location_id, 'name', location.name,
        'short_name', location.short_name, 'timezone', location.timezone, 'day', target.day,
        'opens', to_char(target.opens, 'HH24:MI'), 'closes', to_char(target.closes, 'HH24:MI'),
        'archived', location.archived_at is not null) order by location.sort_order, location.name)
      from public.announcement_locations target
      join public.locations location on location.id = target.location_id
      where target.announcement_id = item.id), '[]'::jsonb),
    'author_user_id', item.created_by,
    'author_name', coalesce(author.display_name, 'Workspace member'),
    'revision', item.revision, 'content_revision', item.content_revision,
    'created_at', item.created_at, 'updated_at', item.updated_at, 'repeats_from', item.repeats_from,
    'can_edit', allowed and item.archived_at is null and shown.status <> 'past',
    'can_unschedule', allowed and shown.status in ('scheduled', 'publish_failed'),
    'can_unpublish', allowed and shown.status = 'published',
    'can_archive', allowed and shown.status in ('draft', 'unpublished', 'past'),
    'asked_to_acknowledge', shown.status = 'published' and state.user_id = any (asked.who),
    'acknowledged_at', mine.acknowledged_at,
    'content_changed_since_acknowledged', mine.acknowledged_at is null and state.user_id = any (item.acknowledged_before),
    'respondent_count', case when allowed and item.ask_ack and item.status = 'published' then cardinality(asked.who) end,
    'acknowledged_count', case when allowed and item.ask_ack and item.status = 'published' then (
      select count(*) from public.announcement_acknowledgements ack
      where ack.announcement_id = item.id and ack.user_id = any (asked.who)) end,
    'recipient_count', case when allowed and shown.status = 'published' then cardinality(item.delivered_to) end,
    'shift_change_count', case when allowed then (
      select count(*) from public.announcement_shift_changes change
      where change.announcement_id = item.id and not change.silent and change.brought_back_at is null) end,
    'my_changes', case when state.employee_id is null or item.status <> 'published' then '[]'::jsonb else coalesce((
      select jsonb_agg(app_private.announcement_change_item(change) order by change.scheduled_date, change.changed_at, change.id)
      from public.announcement_shift_changes change
      where change.announcement_id = item.id and change.employee_id = state.employee_id
        and not change.silent and change.brought_back_at is null), '[]'::jsonb) end)
  from (select app_private.announcement_display_status(item) status) shown
  left join lateral app_private.announcement_moments(item) moment on true
  cross join lateral (select case when item.ask_ack and item.status = 'published'
                                  then app_private.announcement_respondents(item) else '{}'::uuid[] end who) asked
  left join public.user_profiles author on author.user_id = item.created_by
  left join public.announcement_acknowledgements mine on mine.announcement_id = item.id and mine.user_id = state.user_id
$$;

CREATE OR REPLACE FUNCTION "public"."get_announcements_service"("actor_user_id" "uuid", "target_workspace_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  w uuid := target_workspace_id;
  reader app_private.actor_state;
  writable uuid[];
  dates_writable uuid[];
  wide boolean;
  dates_wide boolean;
  manages boolean;
begin
  perform app_private.authorize(actor_user_id, w, 'announcement.read');
  perform app_private.announcement_release(w);
  reader := app_private.actor(actor_user_id, w);
  writable := app_private.scope_set(actor_user_id, w, 'announcement.write');
  dates_writable := app_private.scope_set(actor_user_id, w, 'important_date.write');
  wide := app_private.authz_reason(actor_user_id, w, 'announcement.write_wide') is null;
  dates_wide := app_private.authz_reason(actor_user_id, w, 'important_date.write_wide') is null;
  manages := wide or cardinality(writable) > 0;
  return jsonb_build_object(
    'workspace_id', w,
    'can_manage', manages,
    'can_write_dates', manages and (dates_wide or cardinality(dates_writable) > 0),
    'can_read_dates', app_private.authz_reason(actor_user_id, w, 'settings.important_dates.read') is null,
    'time_format', app_private.announcement_time_format(w),
    'locations', case when manages then coalesce((
      select jsonb_agg(jsonb_build_object('id', location.id, 'name', location.name, 'short_name', location.short_name,
        'timezone', location.timezone,
        'can_change_hours', dates_wide or location.id = any (dates_writable),
        'people_count', (select count(distinct person.user_id) from public.employee_location_assignments assignment
                         join public.employee_profiles person on person.id = assignment.employee_id and person.archived_at is null
                         join public.workspace_memberships membership
                           on membership.workspace_id = w and membership.user_id = person.user_id and membership.status = 'active'
                         -- Bug 35: whoever is writing never gets their own post.
                         where assignment.location_id = location.id and assignment.ended_at is null
                           and person.user_id <> actor_user_id))
        order by location.sort_order, location.name)
      from public.locations location
      where location.workspace_id = w and location.archived_at is null and (wide or location.id = any (writable))), '[]'::jsonb)
      else '[]'::jsonb end,
    'people', case when manages then coalesce((
      select jsonb_agg(app_private.announcement_person(w, membership.user_id) order by lower(coalesce(
        nullif(person.preferred_name, ''), person.first_name, account.display_name)), lower(person.last_name), membership.user_id)
      from public.workspace_memberships membership
      left join public.employee_profiles person
        on person.workspace_id = w and person.user_id = membership.user_id and person.archived_at is null
      left join public.user_profiles account on account.user_id = membership.user_id
      where membership.workspace_id = w and membership.status = 'active' and membership.user_id <> actor_user_id
        and (wide or app_private.announcement_places_of(w, '{}', array[membership.user_id]) <@ writable)), '[]'::jsonb)
      else '[]'::jsonb end,
    'departments', case when manages then coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by lower(d.name), d.id)
      from public.departments d where d.workspace_id = w and d.archived_at is null), '[]'::jsonb) else '[]'::jsonb end,
    'jobs', case when manages then coalesce((
      select jsonb_agg(jsonb_build_object('id', j.id, 'name', j.name, 'department_id', j.department_id) order by lower(j.name), j.id)
      from public.jobs j where j.workspace_id = w and j.archived_at is null), '[]'::jsonb) else '[]'::jsonb end,
    'announcements', coalesce((
      select jsonb_agg(app_private.announcement_item(reader, item, control.allowed)
        order by coalesce(item.published_at, item.publish_at, item.created_at) desc, item.id)
      from public.announcements item
      cross join lateral (select app_private.announcement_reason(reader, app_private.announcement_places(item.id),
        item.created_by, app_private.announcement_dates(item)) is null allowed) control
      where item.workspace_id = w
        and case when item.status = 'draft' then item.created_by = actor_user_id
                 else control.allowed or app_private.announcement_reaches(item, actor_user_id) end), '[]'::jsonb));
end;
$$;
