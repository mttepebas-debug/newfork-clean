-- BILDIRIM-U3 (KARARLAR S-123, S-95, S-126; docs/plan/research/BILDIRIM-URETICILER.md §2.1): Schedule writes its
-- own notices into the new core (part 4, third slice).
--   * publish: a first publish tells everyone with a shift that week; a republish tells only the people
--     whose shifts changed (added, changed, given to someone else, opened, deleted), one notice each
--     however much changed (S-95). "Changed" is the publish preview's own comparison, so the publish
--     dialog's count ("N people will be told") and the notices agree: the preview now also counts the
--     person a shift was taken from, and leaves out the publisher and anyone a notice cannot reach;
--   * unpublish: who had shifts in the week, once; their shift change requests for those shifts close in
--     the same notice;
--   * a closed day (or short hours) that removes, opens or moves published shifts: each person once. The
--     notice stays when the closed day is taken back (BL-883);
--   * a scheduled schedule email that stops after three failures: the rule's owner, once.
-- The core gains app_private.notify_rows: many notices in one statement (one insert ... select, its
-- deliveries in another); app_private.notify is now one row set handed to it, so there is one way in.

-- The core: many notices at once ---------------------------------------------------------------------

-- rows: [{type, user_id, event_key, title, body?, url?, subject_type?, subject_id?, data?}]. The same rules as
-- app_private.notify: members only (account notices excepted), never the actor unless the type says so, one
-- notice per person, workspace, type and event (S-95), the owner's muted optional types write nothing. Answers
-- how many notices it wrote.
create function app_private.notify_rows(target_workspace uuid, target_actor uuid, target_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  total integer;
  told uuid[];
  person uuid;
begin
  if jsonb_typeof(coalesce(target_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'notice rows are an array' using errcode = '22023', hint = 'notifications.rows_required';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(target_rows, '[]'::jsonb)) x
             where not exists (select 1 from public.notification_types t where t.key = x ->> 'type')) then
    raise exception 'unknown notification type' using errcode = '22023', hint = 'notifications.unknown_type';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(target_rows, '[]'::jsonb)) x
             join public.notification_types t on t.key = x ->> 'type'
             where (t.scope = 'account') <> (target_workspace is null)) then
    raise exception 'an account notice names no workspace; every other names one'
      using errcode = '22023', hint = 'notifications.scope_mismatch';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(target_rows, '[]'::jsonb)) x
             where nullif(btrim(coalesce(x ->> 'event_key', '')), '') is null) then
    raise exception 'an event key is required' using errcode = '22023', hint = 'notifications.event_required';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(target_rows, '[]'::jsonb)) x
             where nullif(btrim(coalesce(x ->> 'title', '')), '') is null) then
    raise exception 'a title is required' using errcode = '22023', hint = 'notifications.title_required';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(target_rows, '[]'::jsonb)) x
             where x ->> 'url' is not null and x ->> 'url' !~ '^/([^/\\].*)?$') then
    raise exception 'a link stays inside the app' using errcode = '22023', hint = 'notifications.url_outside_app';
  end if;

  with given as (
    select distinct on (x.user_id, x.type, btrim(x.event_key)) x.*
    from jsonb_to_recordset(coalesce(target_rows, '[]'::jsonb)) x(type text, user_id uuid, event_key text, title text,
      body text, url text, subject_type text, subject_id uuid, data jsonb)
    where x.user_id is not null
    order by x.user_id, x.type, btrim(x.event_key)
  ), kept as (
    select g.*, t.retention_days
    from given g
    join public.notification_types t on t.key = g.type
    where (t.notify_actor or g.user_id is distinct from target_actor)
      -- The owner turned this optional type off: nobody gets it, not even in the list.
      and not exists (select 1 from public.notification_workspace_muted_types m
                      where m.workspace_id = target_workspace and m.type_key = t.key)
      and exists (select 1 from auth.users u where u.id = g.user_id)
      and (t.scope = 'account' or exists (
        select 1 from public.workspace_memberships m
        where m.workspace_id = target_workspace and m.user_id = g.user_id
          and (m.status in ('active', 'pending_activation')
               or (t.to_former_members and m.status in ('suspended', 'removed')))))
  ), written as (
    insert into public.person_notifications (
      workspace_id, user_id, type_key, event_key, actor_user_id, subject_type, subject_id, title, body, url, data, expires_at
    )
    select target_workspace, k.user_id, k.type, btrim(k.event_key), target_actor, k.subject_type, k.subject_id,
      btrim(k.title), nullif(btrim(coalesce(k.body, '')), ''), k.url, coalesce(k.data, '{}'::jsonb),
      now() + make_interval(days => k.retention_days)
    from kept k
    on conflict (user_id, workspace_id, type_key, event_key) do nothing
    returning id, user_id, type_key
  ), queued as (
    insert into public.notification_deliveries (notification_id, channel, reason)
    select w.id, r.channel, r.reason
    from written w cross join lateral app_private.notification_route(w.type_key, target_workspace, w.user_id) r
    where r.sends and r.channel <> 'in_app'
    returning 1
  )
  select count(*)::integer, coalesce(array_agg(distinct w.user_id), '{}'::uuid[]) into total, told from written w;

  -- A private signal per person that carries no content.
  foreach person in array told loop
    perform realtime.send(jsonb_build_object('workspace_id', target_workspace), 'changed', 'notifications:' || person::text, true);
  end loop;
  return total;
end;
$$;

revoke all on function app_private.notify_rows(uuid, uuid, jsonb) from public;

-- One notice to many people: the same rules, through notify_rows.
create or replace function app_private.notify(
  target_type text,
  target_workspace uuid,
  target_recipients uuid[],
  target_event_key text,
  target_title text,
  target_body text default null,
  target_url text default null,
  target_actor uuid default null,
  target_subject_type text default null,
  target_subject_id uuid default null,
  target_data jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind public.notification_types;
begin
  select * into kind from public.notification_types t where t.key = target_type;
  if kind.key is null then
    raise exception 'unknown notification type' using errcode = '22023', hint = 'notifications.unknown_type';
  end if;
  if (kind.scope = 'account') <> (target_workspace is null) then
    raise exception 'an account notice names no workspace; every other names one'
      using errcode = '22023', hint = 'notifications.scope_mismatch';
  end if;
  if nullif(btrim(coalesce(target_event_key, '')), '') is null then
    raise exception 'an event key is required' using errcode = '22023', hint = 'notifications.event_required';
  end if;
  if nullif(btrim(coalesce(target_title, '')), '') is null then
    raise exception 'a title is required' using errcode = '22023', hint = 'notifications.title_required';
  end if;
  if target_url is not null and target_url !~ '^/([^/\\].*)?$' then
    raise exception 'a link stays inside the app' using errcode = '22023', hint = 'notifications.url_outside_app';
  end if;
  return app_private.notify_rows(target_workspace, target_actor, (
    select coalesce(jsonb_agg(jsonb_build_object(
      'type', target_type, 'user_id', r.id, 'event_key', target_event_key, 'title', target_title, 'body', target_body,
      'url', target_url, 'subject_type', target_subject_type, 'subject_id', target_subject_id, 'data', target_data)), '[]'::jsonb)
    from (select distinct x.id from unnest(coalesce(target_recipients, '{}'::uuid[])) x(id) where x.id is not null) r));
end;
$$;

-- Schedule ---------------------------------------------------------------------------------------------

-- "Oct 19–25", "Oct 30–Nov 5": a week.
create function app_private.schedule_week_text(target_week date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when date_trunc('month', target_week) = date_trunc('month', target_week + 6)
    then to_char(target_week, 'FMMon FMDD') || '–' || to_char(target_week + 6, 'FMDD')
    else to_char(target_week, 'FMMon FMDD') || '–' || to_char(target_week + 6, 'FMMon FMDD') end;
$$;

-- Who of these employees a schedule notice reaches: someone with an account who is a member (active or
-- finishing onboarding), not the person publishing. notify_rows keeps the same people; the publish
-- preview counts them with this, so "N people will be told" is the notices written.
create function app_private.schedule_people_told(target_workspace uuid, target_actor uuid, target_employees uuid[])
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(e.id order by e.id), '{}'::uuid[])
  from public.employee_profiles e
  where e.workspace_id = target_workspace and e.id = any (target_employees)
    and e.user_id is not null and e.user_id is distinct from target_actor
    and exists (select 1 from auth.users u where u.id = e.user_id)
    and exists (select 1 from public.workspace_memberships m
                where m.workspace_id = target_workspace and m.user_id = e.user_id
                  and m.status in ('active', 'pending_activation'));
$$;

-- A publish, location by location ({previous, current} publication ids): who had a shift added, changed,
-- taken away (given to someone else, opened, deleted), compared the way the publish preview compares.
-- One notice per person, to the people the preview counted; nobody whose shifts stayed the same.
create function app_private.schedule_tell_published(target_workspace uuid, target_actor uuid, target_event uuid,
  target_week date, target_pairs jsonb, target_told uuid[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  fmt text := app_private.announcement_time_format(target_workspace);
  week text := app_private.schedule_week_text(target_week);
  link text := '/app/employee-hub/schedule?view=day&date=' || target_week::text;
  notices jsonb;
begin
  with pair as (
    select nullif(p ->> 'previous', '')::uuid prev, (p ->> 'current')::uuid cur from jsonb_array_elements(target_pairs) p
  ), old_row as (
    select s.*, pair.cur from public.schedule_published_shifts s join pair on s.publication_id = pair.prev
  ), new_row as (
    select s.*, pair.prev from public.schedule_published_shifts s join pair on s.publication_id = pair.cur
  ), joined as (
    select o.id old_id, n.id new_id, n.prev is null first_time,
      o.employee_id old_emp, o.scheduled_date old_day, o.start_time old_start, o.end_time old_end,
      n.employee_id new_emp, n.scheduled_date new_day, n.start_time new_start, n.end_time new_end,
      (o.id is not null and n.id is not null and (
        o.employee_id is distinct from n.employee_id or o.job_id is distinct from n.job_id
        or o.shift_type_id is distinct from n.shift_type_id or o.scheduled_date is distinct from n.scheduled_date
        or o.start_time is distinct from n.start_time or o.end_time is distinct from n.end_time
        or o.time_basis is distinct from n.time_basis or o.time_snapshot is distinct from n.time_snapshot
        or o.time_timezone is distinct from n.time_timezone or o.note is distinct from n.note)) changed
    from old_row o full join new_row n on n.publication_id = o.cur and n.source_shift_id = o.source_shift_id
  ), change as (
    select new_emp emp, case when first_time then 'first' else 'added' end kind, new_day d, new_start st, new_end en
    from joined where old_id is null
    union all select old_emp, 'removed', old_day, old_start, old_end from joined where new_id is null
    union all select new_emp, 'changed', new_day, new_start, new_end from joined where changed and old_emp is not distinct from new_emp
    union all select old_emp, 'removed', old_day, old_start, old_end from joined where changed and old_emp is distinct from new_emp
    union all select new_emp, 'added', new_day, new_start, new_end from joined where changed and old_emp is distinct from new_emp
  ), person as (
    select e.user_id,
      count(*) filter (where c.kind = 'first')::integer firsts,
      count(*) filter (where c.kind = 'added')::integer added,
      count(*) filter (where c.kind = 'changed')::integer changed,
      count(*) filter (where c.kind = 'removed')::integer removed,
      min(c.d) d, min(c.st) st, min(c.en) en
    from change c
    join public.employee_profiles e on e.id = c.emp and e.workspace_id = target_workspace
    -- The people the publish preview counted (schedule_people_told): the dialog's number.
    where c.emp = any (target_told)
    group by e.user_id
  ), worded as (
    select p.*, to_char(p.d, 'FMDy, FMMon FMDD') day_text, app_private.announcement_hours_text(p.st, p.en, fmt) hours,
      case when p.removed > 0 then 'schedule.shift_removed' when p.changed > 0 then 'schedule.shift_changed'
           when p.added > 0 then 'schedule.shift_added' else 'schedule.published' end kind,
      p.added + p.changed + p.removed = 1 and p.firsts = 0 single
    from person p
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'type', w.kind, 'user_id', w.user_id, 'event_key', 'publish:' || target_event::text,
    'title', case
      when w.kind = 'schedule.published' then 'Your schedule for ' || week || ' is out'
      when w.single and w.kind = 'schedule.shift_changed' then 'Your ' || w.day_text || ' shift changed'
      when w.single and w.kind = 'schedule.shift_added' then 'New shift: ' || w.day_text || ' · ' || w.hours
      when w.single then 'Your ' || w.day_text || ' shift was removed'
      else 'Your schedule for ' || week || ' changed' end,
    'body', case
      when w.kind = 'schedule.published' then w.firsts || case when w.firsts = 1 then ' shift' else ' shifts' end || ' this week.'
      when w.single and w.kind = 'schedule.shift_changed' then 'Now ' || w.hours || '.'
      when w.single and w.kind = 'schedule.shift_added' then null
      when w.single then 'It is no longer yours.'
      else array_to_string(array_remove(array[
        case when w.changed > 0 then w.changed || case when w.changed = 1 then ' shift changed' else ' shifts changed' end end,
        case when w.added + w.firsts > 0 then (w.added + w.firsts) || ' new' end,
        case when w.removed > 0 then w.removed || ' removed' end], null), ', ') || '.' end,
    'url', link, 'subject_type', 'schedule_publication', 'subject_id', target_event,
    'data', jsonb_build_object('week_start', target_week, 'added', w.added + w.firsts, 'changed', w.changed, 'removed', w.removed))),
    '[]'::jsonb)
  into notices from worded w;
  return app_private.notify_rows(target_workspace, target_actor, notices);
end;
$$;

-- A week taken back: who had shifts in it, once; a shift change request on those shifts closes with it.
create function app_private.schedule_tell_unpublished(target_workspace uuid, target_actor uuid, target_event uuid,
  target_week date, target_publications uuid[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  week text := app_private.schedule_week_text(target_week);
  notices jsonb;
begin
  with held as (
    select s.employee_id, s.source_shift_id from public.schedule_published_shifts s
    where s.workspace_id = target_workspace and s.publication_id = any (target_publications) and s.employee_id is not null
  ), person as (
    select e.user_id, bool_or(exists (
      select 1 from public.shift_exchange_cases c
      where c.workspace_id = target_workspace and c.status = 'open'
        and (c.offered_source_id = h.source_shift_id or c.requested_source_id = h.source_shift_id))) asked
    from held h join public.employee_profiles e on e.id = h.employee_id and e.workspace_id = target_workspace
    where e.user_id is not null
    group by e.user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'type', 'schedule.unpublished', 'user_id', p.user_id, 'event_key', 'unpublish:' || target_event::text,
    'title', 'Your schedule for ' || week || ' was taken back',
    'body', 'It isn''t final until it is published again.'
      || case when p.asked then ' Your shift change requests for those shifts were closed.' else '' end,
    'url', '/app/employee-hub/schedule?view=day&date=' || target_week::text,
    'subject_type', 'schedule_publication', 'subject_id', target_event,
    'data', jsonb_build_object('week_start', target_week, 'requests_closed', p.asked))), '[]'::jsonb)
  into notices from person p;
  return app_private.notify_rows(target_workspace, target_actor, notices);
end;
$$;

-- A closed day or short hours that removed, opened or moved published shifts: each person once. rows:
-- [{employee_id, outcome (removed, opened, edited), day, kind (closed, short), from, until}].
create function app_private.schedule_tell_closed_day(target_workspace uuid, target_actor uuid, item public.announcements,
  target_rows jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  fmt text := app_private.announcement_time_format(target_workspace);
  notices jsonb;
begin
  with r as (
    select (x ->> 'employee_id')::uuid emp, x ->> 'outcome' outcome, (x ->> 'day')::date d, x ->> 'kind' kind,
      nullif(x ->> 'from', '')::time st, nullif(x ->> 'until', '')::time en
    from jsonb_array_elements(target_rows) x where x ->> 'employee_id' is not null
  ), person as (
    select e.user_id, count(*) filter (where r.outcome <> 'edited')::integer taken, count(*)::integer shifts,
      min(r.d) first_day, max(r.d) last_day, bool_and(r.kind = 'closed') closed, min(r.st) st, min(r.en) en
    from r join public.employee_profiles e on e.id = r.emp and e.workspace_id = target_workspace
    where e.user_id is not null
    group by e.user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'type', case when p.taken > 0 then 'schedule.closed_day_removed_shift' else 'schedule.shift_changed' end,
    'user_id', p.user_id, 'event_key', 'closed_day:' || item.id::text || ':' || item.revision::text,
    'title', case
      when p.taken > 0 and p.first_day = p.last_day then to_char(p.first_day, 'FMDy, FMMon FMDD')
        || case when p.closed then ' is closed.' else ' has short hours.' end
        || case when p.shifts = 1 then ' Your shift was removed.' else ' Your shifts were removed.' end
      when p.taken > 0 then item.title || ': your shifts were removed'
      when p.shifts = 1 then 'Your ' || to_char(p.first_day, 'FMDy, FMMon FMDD') || ' shift now runs '
        || app_private.announcement_hours_text(p.st, p.en, fmt)
      else item.title || ': your shift hours changed' end,
    'body', item.title,
    'url', '/app/employee-hub/schedule?view=day&date=' || p.first_day::text,
    'subject_type', 'announcement', 'subject_id', item.id,
    'data', jsonb_build_object('announcement_id', item.id, 'removed', p.taken, 'shifts', p.shifts))), '[]'::jsonb)
  into notices from person p;
  return app_private.notify_rows(target_workspace, target_actor, notices);
end;
$$;

revoke all on function app_private.schedule_week_text(date) from public;
revoke all on function app_private.schedule_people_told(uuid, uuid, uuid[]) from public;
revoke all on function app_private.schedule_tell_published(uuid, uuid, uuid, date, jsonb, uuid[]) from public;
revoke all on function app_private.schedule_tell_unpublished(uuid, uuid, uuid, date, uuid[]) from public;
revoke all on function app_private.schedule_tell_closed_day(uuid, uuid, public.announcements, jsonb) from public;

-- The domain work calls them ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."preview_schedule_publication_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_draft_id" "uuid", "target_location_ids" "uuid"[], "target_department_ids" "uuid"[] DEFAULT NULL::"uuid"[], "include_no_department" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  requested uuid;
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
  -- Nothing named is nowhere to publish; the core says why.
  if cardinality(coalesce(target_location_ids, '{}'::uuid[])) = 0 then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => '{}'::uuid[]);
  end if;
  foreach requested in array target_location_ids loop
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => array[requested]);
  end loop;

  select * into target_draft
  from public.schedule_drafts draft
  where draft.id = target_draft_id
    and draft.workspace_id = target_workspace_id
    and draft.archived_at is null;
  if target_draft.id is null then
    raise exception 'schedule draft not found' using errcode = 'P0002';
  end if;
  -- S-01: each place publishes up to its own line.
  if exists (select 1 from unnest(target_location_ids) place
             where target_draft.week_start < public.schedule_current_week_start_service(target_workspace_id, array[place])) then
    return app_private.schedule_publication_changes_since_start(public.weekly_schedule_publication_preflight(
      jsonb_build_object(
        'status', 'past_week_closed', 'workspace_id', target_workspace_id,
        'week_start', target_draft.week_start, 'draft_id', target_draft.id,
        'draft_revision', target_draft.revision, 'fingerprint', repeat('0', 64),
        'locations', '[]'::jsonb, 'findings', '[]'::jsonb
      ), actor_user_id, target_department_ids, include_no_department));
  end if;

  select array_agg(distinct location_id order by location_id)
  into normalized_locations
  from unnest(target_location_ids) location_id;
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
      -- The people the publish tells (BILDIRIM-U3): not the publisher, only who a notice reaches.
      app_private.schedule_people_told(target_workspace_id, actor_user_id, coalesce((
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
          -- Whose shift went to someone else or was opened is affected too (BILDIRIM-U3): the
          -- publish dialog counts the people the publish tells.
          select current_row.employee_id
          from next_shift next_row
          join current_shift current_row
            on current_row.location_id = next_row.location_id
           and current_row.source_shift_id = next_row.id
          where next_row.location_id = location.id
            and current_row.employee_id is not null
            and current_row.employee_id is distinct from next_row.employee_id
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
      ), '{}'::uuid[])) as affected_employee_ids
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
      'closed_location', 'soft', true, shift.location_id, shift.employee_id,
      shift.scheduled_date, array[shift.id]::uuid[],
      shift.location_name || case hit.kind when 'closed' then ' is closed on ' else ' has short hours on ' end
        || shift.scheduled_date::text || '.'
    from next_shift shift
    cross join lateral (
      select closure.kind from public.schedule_closures closure
      where closure.location_id = shift.location_id
        and closure.closed_date = shift.scheduled_date
        and app_private.closure_covers(closure.kind, closure.opens, closure.closes, shift.start_time, shift.end_time)
      order by closure.kind = 'closed' desc limit 1
    ) hit
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
  return app_private.schedule_publication_changes_since_start(public.weekly_schedule_publication_preflight(
    unsigned_payload || jsonb_build_object(
      'status', case when hard_count > 0 then 'hard_blocked'
        when soft_count > 0 then 'override_required' else 'publish_ready' end,
      'fingerprint', preview_fingerprint
    ), actor_user_id, target_department_ids, include_no_department));
end;
$$;

CREATE OR REPLACE FUNCTION "public"."publish_schedule_draft_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_draft_id" "uuid", "target_location_ids" "uuid"[], "target_department_ids" "uuid"[], "include_no_department" boolean, "expected_draft_revision" integer, "expected_fingerprint" "text", "override_decisions" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  requested uuid;
  result jsonb;
  target_draft public.schedule_drafts%rowtype;
  preview jsonb;
  location_item jsonb;
  finding jsonb;
  decision jsonb;
  new_publication_id uuid;
  previous_publication_id uuid;
  publication_ids uuid[] := '{}'::uuid[];
  normalized_locations uuid[];
  normalized_departments uuid[];
  effective_include_no_department boolean := coalesce(include_no_department, true);
  total_shift_count integer := 0;
  published_at timestamptz := now();
  pairs jsonb := '[]'::jsonb;
  publish_event_id uuid;
begin
  if cardinality(coalesce(target_location_ids, '{}'::uuid[])) = 0 then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => '{}'::uuid[]);
  end if;
  foreach requested in array target_location_ids loop
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => array[requested]);
  end loop;
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));

  perform public.availability_lock_workspace(target_workspace_id);
  select * into target_draft from public.schedule_drafts draft
  where draft.id = target_draft_id and draft.workspace_id = target_workspace_id
    and draft.archived_at is null for update;
  if target_draft.id is null then raise exception 'schedule draft not found' using errcode = 'P0002'; end if;
  if target_draft.revision <> expected_draft_revision then
    raise exception 'stale publication preview' using errcode = '40001';
  end if;
  select array_agg(distinct location_id order by location_id) into normalized_locations
  from unnest(target_location_ids) location_id;

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

  perform 1 from public.schedule_location_publications publication
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_draft.week_start
    and publication.location_id = any(normalized_locations) for update;

  preview := public.preview_schedule_publication_service(
    actor_user_id,
    target_workspace_id,
    target_draft_id,
    normalized_locations,
    normalized_departments,
    effective_include_no_department
  );
  if preview->>'status' = 'past_week_closed' then
    raise exception 'past schedule week is closed' using errcode = 'P0001', hint = 'schedule.past_week_closed';
  end if;
  if preview->>'fingerprint' <> expected_fingerprint then
    raise exception 'stale publication preview' using errcode = '40001';
  end if;
  if preview->>'status' = 'hard_blocked' then
    raise exception 'schedule has hard publication blockers' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(override_decisions, '[]'::jsonb)) <> 'array' then
    raise exception 'publication overrides must be an array' using errcode = '22023';
  end if;
  -- The one place that says which findings are recorded and with which
  -- sentence (BL-190); the publisher's id and the time go with each row.
  override_decisions:=public.weekly_publication_decisions(preview,override_decisions);
  perform set_config('newfork.schedule_publish_scope',jsonb_build_object('workspace_id',target_workspace_id,'draft_id',target_draft_id,
   '_publish_locations',(select jsonb_agg(x->'location_id') from jsonb_array_elements(preview->'locations') x),
   '_publish_departments',preview->'department_ids','_publish_no_department',coalesce((preview->>'include_no_department')::boolean,true))::text,true);
  for location_item in select value from jsonb_array_elements(preview->'locations')
  loop
    previous_publication_id := nullif(location_item->>'active_publication_id', '')::uuid;
    new_publication_id := gen_random_uuid();
    if previous_publication_id is not null then
      update public.schedule_location_publications
      set status = 'superseded'
      where id = previous_publication_id and status = 'current';
      if not found then raise exception 'stale publication preview' using errcode = '40001'; end if;
    end if;
    insert into public.schedule_location_publications (
      id, workspace_id, location_id, week_start, version_number, status,
      published_by, published_at, source_draft_id, source_draft_revision,
      content_fingerprint, department_ids, include_no_department
    ) values (
      new_publication_id, target_workspace_id, (location_item->>'location_id')::uuid,
      target_draft.week_start,
      coalesce((select max(version_number) + 1 from public.schedule_location_publications
        where location_id = (location_item->>'location_id')::uuid and week_start = target_draft.week_start), 1),
      'current', actor_user_id, published_at, target_draft.id, target_draft.revision,
      expected_fingerprint, normalized_departments, effective_include_no_department
    );
    for finding in select value from jsonb_array_elements(preview->'findings')
    loop
      if finding->>'severity' <> 'soft'
        or finding->>'location_id' <> location_item->>'location_id' then continue; end if;
      select value into decision from jsonb_array_elements(override_decisions)
      where value->>'finding_id' = finding->>'id' limit 1;
      if decision is null then continue; end if;
      insert into public.schedule_publication_overrides (
        workspace_id, publication_id, source_draft_id, source_draft_revision,
        finding_id, finding_code, employee_id, location_id, scheduled_date,
        source_shift_ids, reason, actor_user_id
      ) values (
        target_workspace_id, new_publication_id, target_draft.id, target_draft.revision,
        finding->>'id', finding->>'code', nullif(finding->>'employee_id', '')::uuid,
        (finding->>'location_id')::uuid, (finding->>'scheduled_date')::date,
        array(select jsonb_array_elements_text(finding->'shift_ids')::uuid),
        btrim(decision->>'reason'), actor_user_id
      );
    end loop;
    if previous_publication_id is not null then
      update public.schedule_location_publications
      set superseded_by = new_publication_id
      where id = previous_publication_id;

      insert into public.schedule_published_shifts (workspace_id, location_id, publication_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, source_shift_id, label_ids, label_names)
      select shift.workspace_id, shift.location_id, new_publication_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.source_shift_id, shift.label_ids, shift.label_names from public.schedule_published_shifts shift
      where shift.publication_id = previous_publication_id
        and not public.schedule_shift_in_department_scope_service(
          shift.job_id, normalized_departments, effective_include_no_department
        );
    end if;

    insert into public.schedule_published_shifts (workspace_id, location_id, publication_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, source_shift_id, label_ids, label_names)
    select shift.workspace_id, shift.location_id, new_publication_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.id, shift.label_ids, shift.label_names from public.schedule_draft_shifts shift
    where shift.draft_id = target_draft.id
      and shift.location_id = (location_item->>'location_id')::uuid
      and public.schedule_shift_in_department_scope_service(
        shift.job_id, normalized_departments, effective_include_no_department
      );
    publication_ids := array_append(publication_ids, new_publication_id);
    pairs := pairs || jsonb_build_array(jsonb_build_object('previous', previous_publication_id, 'current', new_publication_id));

  end loop;

  select count(*)::integer into total_shift_count
  from public.schedule_published_shifts shift where shift.publication_id = any(publication_ids);
  insert into public.schedule_publication_events (
    workspace_id, week_start, action, actor_user_id, location_ids,
    source_draft_id, source_draft_revision, publication_ids,
    preflight_fingerprint, diff_summary
  ) values (
    target_workspace_id, target_draft.week_start, 'published', actor_user_id,
    normalized_locations, target_draft.id, target_draft.revision, publication_ids,
    expected_fingerprint,
    jsonb_build_object(
      'locations', preview->'locations',
      'department_ids', to_jsonb(normalized_departments),
      'include_no_department', effective_include_no_department
    )
  ) returning id into publish_event_id;
  -- Whose shifts changed hears it once (S-95; schedule_tell_published).
  perform app_private.schedule_tell_published(target_workspace_id, actor_user_id, publish_event_id,
    target_draft.week_start, pairs, array(select distinct x::uuid from jsonb_array_elements(preview -> 'locations') l,
      jsonb_array_elements_text(l -> 'affected_employee_ids') x));
  result := jsonb_build_object(
    'status', 'published', 'workspace_id', target_workspace_id,
    'week_start', target_draft.week_start, 'draft_id', target_draft.id,
    'draft_revision', target_draft.revision, 'location_ids', to_jsonb(normalized_locations),
    'publication_ids', to_jsonb(publication_ids), 'published_shift_count', total_shift_count,
    'published_at', published_at
  );

  -- Nobody missing a required document goes out on the published week.
  if public.schedule_draft_has_hard_document_conflicts_service(
      actor_user_id,
      target_workspace_id,
      target_draft_id,
      (result->>'week_start')::date,
      target_location_ids,
      target_department_ids,
      include_no_department
    ) then
    raise exception 'schedule has hard document blockers' using errcode = '23514';
  end if;

  return result;
exception when serialization_failure then raise exception '%',SQLERRM using errcode='PT409', hint='schedule.publication_changed';
end;
$$;

CREATE OR REPLACE FUNCTION "public"."unpublish_schedule_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_week_start" "date", "target_location_ids" "uuid"[], "expected_fingerprint" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  preview jsonb;
  normalized_locations uuid[];
  publication_ids uuid[];
  effective_unpublished_at timestamptz := now();
  unpublish_event_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));
  select array_agg(distinct location_id order by location_id) into normalized_locations
  from unnest(target_location_ids) location_id;
  perform 1 from public.schedule_location_publications publication
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_week_start
    and publication.location_id = any(normalized_locations)
    and publication.status = 'current' for update;
  -- The preview asks the core for every location.
  preview := public.preview_schedule_unpublication_service(
    actor_user_id, target_workspace_id, target_week_start, normalized_locations
  );
  if preview->>'status' = 'past_week_closed' then
    raise exception 'past schedule week is closed' using errcode = 'P0001', hint = 'schedule.past_week_closed';
  end if;
  if preview->>'fingerprint' <> expected_fingerprint then
    raise exception 'stale unpublication preview' using errcode = '40001';
  end if;
  select array_agg((item->>'publication_id')::uuid order by item->>'publication_id')
  into publication_ids from jsonb_array_elements(preview->'locations') item;

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
  ) returning id into unpublish_event_id;
  perform app_private.schedule_tell_unpublished(target_workspace_id, actor_user_id, unpublish_event_id,
    target_week_start, publication_ids);
  return jsonb_build_object(
    'status', 'unpublished', 'workspace_id', target_workspace_id,
    'week_start', target_week_start, 'location_ids', to_jsonb(normalized_locations),
    'publication_ids', to_jsonb(publication_ids),
    'unpublished_at', effective_unpublished_at
  );
exception when serialization_failure then raise exception '%',SQLERRM using errcode='PT409', hint='schedule.publication_changed';
end;
$$;

CREATE OR REPLACE FUNCTION "app_private"."announcement_apply"("actor" "uuid", "item" "public"."announcements", "impact" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  w uuid := item.workspace_id;
  s jsonb;
  q jsonb;
  snap jsonb;
  shift public.schedule_published_shifts;
  places uuid[];
  before jsonb;
  told integer := 0;
  touched uuid[] := '{}';
  other record;
  changed_rows jsonb := '[]'::jsonb;
begin
  places := array(
    select (x ->> 'location_id')::uuid from jsonb_array_elements(impact -> 'shifts') x where x ->> 'outcome' <> 'kept'
    union select (x ->> 'location_id')::uuid from jsonb_array_elements(impact -> 'quiet') x);
  if cardinality(places) = 0 then
    return 0;
  end if;
  perform app_private.authorize(actor, w, 'schedule.edit', target_locations => places);

  for s in select x from jsonb_array_elements(impact -> 'shifts') x where x ->> 'outcome' <> 'kept' loop
    select * into shift from public.schedule_published_shifts published
    where published.workspace_id = w and published.id = (s ->> 'id')::uuid for update;
    snap := public.shift_exchange_shift(w, shift.id);
    if shift.id is null or snap is null then
      raise exception 'A shift on these days changed. Review the shifts again.'
        using errcode = 'PT409', hint = 'announcement.shifts_changed';
    end if;
    before := jsonb_build_object(
      'published', to_jsonb(shift) - 'crosses_midnight' - 'availability_snapshot',
      'drafts', coalesce((
        select jsonb_agg(to_jsonb(copy) - 'crosses_midnight') from public.schedule_draft_shifts copy
        where copy.workspace_id = w and copy.id in (shift.source_shift_id, shift.id)
          and public.shift_exchange_edit_matches(to_jsonb(copy), snap)), '[]'::jsonb),
      'edits', coalesce((
        select jsonb_agg(to_jsonb(copy) - 'crosses_midnight') from public.schedule_edit_session_shifts copy
        where copy.workspace_id = w and (copy.id in (shift.source_shift_id, shift.id) or copy.source_published_shift_id = shift.id)
          and copy.pending_op_type is distinct from 'delete' and public.shift_exchange_edit_matches(to_jsonb(copy), snap)), '[]'::jsonb));

    if s ->> 'outcome' = 'removed' then
      if (s ->> 'tied')::boolean then
        raise exception 'This shift is tied to an offboarding or a time-off decision and can''t be removed.'
          using errcode = 'PT409', hint = 'announcement.shift_tied';
      end if;
      with gone as (
        delete from public.schedule_edit_session_shifts copy
        where copy.workspace_id = w and (copy.id in (shift.source_shift_id, shift.id) or copy.source_published_shift_id = shift.id)
          and copy.pending_op_type is distinct from 'delete' and public.shift_exchange_edit_matches(to_jsonb(copy), snap)
        returning copy.session_id)
      update public.schedule_edit_sessions set revision = revision + 1 where id in (select session_id from gone);
      with gone as (
        delete from public.schedule_draft_shifts copy
        where copy.workspace_id = w and copy.id in (shift.source_shift_id, shift.id)
          and public.shift_exchange_edit_matches(to_jsonb(copy), snap)
        returning copy.draft_id)
      update public.schedule_drafts set revision = revision + 1, updated_at = now() where id in (select draft_id from gone);
      delete from public.schedule_published_shifts where id = shift.id;
    elsif s ->> 'outcome' = 'opened' then
      update public.schedule_published_shifts set employee_id = null where id = shift.id;
      perform public.shift_exchange_reconcile_batch(actor, w, jsonb_build_array(snap || jsonb_build_object('new_employee_id', null)));
    else
      begin
        update public.schedule_published_shifts
        set start_time = (s ->> 'from')::time, end_time = (s ->> 'until')::time, time_basis = 'explicit', time_snapshot = null
        where id = shift.id;
      exception when check_violation then
        raise exception '% can''t work %: it overlaps another shift or approved time off.',
          coalesce(snap ->> 'employee_name', 'This open shift'),
          app_private.announcement_hours_text((s ->> 'from')::time, (s ->> 'until')::time, app_private.announcement_time_format(w))
          using errcode = 'PT409', hint = 'announcement.shift_conflict';
      end;
      with moved as (
        update public.schedule_draft_shifts copy
        set start_time = (s ->> 'from')::time, end_time = (s ->> 'until')::time, time_basis = 'explicit', time_snapshot = null,
            revision = copy.revision + 1, updated_at = now()
        where copy.workspace_id = w and copy.id in (shift.source_shift_id, shift.id)
          and public.shift_exchange_edit_matches(to_jsonb(copy), snap)
        returning copy.draft_id)
      update public.schedule_drafts set revision = revision + 1, updated_at = now() where id in (select draft_id from moved);
      with moved as (
        update public.schedule_edit_session_shifts copy
        set start_time = (s ->> 'from')::time, end_time = (s ->> 'until')::time, time_basis = 'explicit', time_snapshot = null,
            revision = copy.revision + 1, updated_at = now()
        where copy.workspace_id = w and (copy.id in (shift.source_shift_id, shift.id) or copy.source_published_shift_id = shift.id)
          and copy.pending_op_type is distinct from 'delete' and public.shift_exchange_edit_matches(to_jsonb(copy), snap)
        returning copy.session_id)
      update public.schedule_edit_sessions set revision = revision + 1 where id in (select session_id from moved);
    end if;

    insert into public.announcement_shift_changes (workspace_id, announcement_id, source_shift_id, published_shift_id,
      location_id, scheduled_date, employee_id, outcome, before, after_start, after_end, actor_user_id)
    values (w, item.id, shift.source_shift_id, shift.id, shift.location_id, shift.scheduled_date, shift.employee_id,
      s ->> 'outcome', before,
      case when s ->> 'outcome' = 'edited' then (s ->> 'from')::time end,
      case when s ->> 'outcome' = 'edited' then (s ->> 'until')::time end, actor);
    changed_rows := changed_rows || jsonb_build_array(jsonb_build_object('employee_id', shift.employee_id,
      'outcome', s ->> 'outcome', 'day', shift.scheduled_date, 'kind', s ->> 'day', 'from', s ->> 'from', 'until', s ->> 'until'));
    touched := touched || shift.source_shift_id;
    told := told + 1;
  end loop;

  -- A draft week's own shifts follow the default without a word (V6, B4).
  for q in select x from jsonb_array_elements(impact -> 'quiet') x loop
    before := jsonb_build_object(
      'drafts', coalesce((
        select jsonb_agg(to_jsonb(copy) - 'crosses_midnight') from public.schedule_draft_shifts copy
        join public.schedule_drafts draft on draft.id = copy.draft_id and draft.archived_at is null
        where copy.workspace_id = w and copy.id = (q ->> 'id')::uuid), '[]'::jsonb),
      'edits', coalesce((
        select jsonb_agg(to_jsonb(copy) - 'crosses_midnight') from public.schedule_edit_session_shifts copy
        join public.schedule_edit_sessions session on session.id = copy.session_id and session.status = 'active'
        where copy.workspace_id = w and copy.id = (q ->> 'id')::uuid and copy.source_published_shift_id is null
          and copy.pending_op_type is distinct from 'delete'), '[]'::jsonb));
    with gone as (
      delete from public.schedule_edit_session_shifts copy
      where copy.workspace_id = w and copy.id = (q ->> 'id')::uuid and copy.source_published_shift_id is null
        and copy.pending_op_type is distinct from 'delete'
        and exists (select 1 from public.schedule_edit_sessions session where session.id = copy.session_id and session.status = 'active')
      returning copy.session_id)
    update public.schedule_edit_sessions set revision = revision + 1 where id in (select session_id from gone);
    with gone as (
      delete from public.schedule_draft_shifts copy
      where copy.workspace_id = w and copy.id = (q ->> 'id')::uuid
        and exists (select 1 from public.schedule_drafts draft where draft.id = copy.draft_id and draft.archived_at is null)
      returning copy.draft_id)
    update public.schedule_drafts set revision = revision + 1, updated_at = now() where id in (select draft_id from gone);
    insert into public.announcement_shift_changes (workspace_id, announcement_id, source_shift_id, location_id,
      scheduled_date, employee_id, outcome, before, silent, actor_user_id)
    values (w, item.id, (q ->> 'id')::uuid, (q ->> 'location_id')::uuid, (q ->> 'scheduled_date')::date,
      (q ->> 'employee_id')::uuid, 'removed', before, true, actor);
  end loop;

  -- DB-1c: Undo does not take these back.
  perform app_private.schedule_edit_undo_barrier();
  -- V8: a swap, cover or open shift request on a changed shift closes; both sides hear.
  if cardinality(touched) > 0 then
    for other in
      select c.id from public.shift_exchange_cases c
      where c.workspace_id = w and c.status = 'open'
        and (c.offered_source_id = any (touched) or c.requested_source_id = any (touched))
    loop
      update public.shift_exchange_cases set status = 'invalidated', revision = revision + 1, updated_at = now() where id = other.id;
      update public.shift_exchange_applications set status = 'invalidated', updated_at = now()
      where case_id = other.id and status in ('invited', 'pending_manager');
      perform public.shift_exchange_emit(actor, w, other.id, null, 'invalidated',
        'An involved shift changed with an announcement. Review the current schedule.');
    end loop;
    perform realtime.send(jsonb_build_object('workspace_id', w, 'announcement_id', item.id),
      'changed', 'shift-exchanges:' || w::text, true);
  end if;
  -- Each person whose published shifts it changed hears it once; the notice stays if the day is taken back.
  perform app_private.schedule_tell_closed_day(w, actor, item, changed_rows);
  return told;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."record_schedule_export_schedule_failure_service"("target_workspace_id" "uuid", "target_schedule_id" "uuid", "target_error" "text", "auto_disable_after" integer DEFAULT 3) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  failures integer;
  updated public.scheduled_schedule_exports%rowtype;
  was_enabled boolean;
begin
  select case
           when s.consecutive_failures > 0 and s.last_failed_at > now() - interval '20 hours'
             then s.consecutive_failures
           else s.consecutive_failures + 1
         end, s.enabled
    into failures, was_enabled
    from public.scheduled_schedule_exports s
   where s.id = target_schedule_id
     and s.workspace_id = target_workspace_id
   for update;

  if not found then
    raise exception 'scheduled export not found' using errcode='P0002';
  end if;

  update public.scheduled_schedule_exports
     set consecutive_failures = failures,
         last_failed_at = now(),
         last_error = left(coalesce(nullif(btrim(target_error), ''), 'Scheduled export failed'), 500),
         enabled = case
           when failures >= auto_disable_after then false
           else enabled
         end,
         auto_disabled_at = case
           when failures >= auto_disable_after then now()
           else auto_disabled_at
         end,
         updated_at = now()
   where id = target_schedule_id
     and workspace_id = target_workspace_id
   returning * into updated;

  -- It stopped just now: the person who set it up hears it, once.
  if was_enabled and not updated.enabled then
    perform app_private.notify('schedule.export_email_stopped', target_workspace_id, array[updated.created_by],
      'export_stop:' || updated.id::text || ':' || updated.auto_disabled_at::text,
      'Your scheduled schedule email stopped',
      format('"%s" failed %s times in a row, so it was turned off. Check its recipients and turn it back on.',
        updated.name, failures),
      '/app/schedule', null, 'scheduled_schedule_export', updated.id,
      jsonb_build_object('schedule_id', updated.id, 'failures', failures));
  end if;

  return public.schedule_export_schedule_json(
    updated,
    (select p.name from public.schedule_export_presets p where p.id = updated.preset_id)
  );
end;
$$;
