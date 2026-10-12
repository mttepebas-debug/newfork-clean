-- EKRAN-08: one announcement record (Mert, 2026-10-12, the drawer thread; prototype
-- https://claude.ai/artifact/FXWWvxLd3T9v5Qfy4112Mm v11; plan approved 13:44Z).
--
-- Announcements and Important Dates become one record. Three optional flags
-- put it on the Important Dates page, the Schedule's calendar and the
-- Schedule's day headers. A record is about locations (each checked one has its
-- day: Open, Closed or Short hours) and people added by hand; everyone at a
-- checked location and everyone added gets it, and so does whoever's shift it
-- changes (K24: nobody else, whatever their role).
--
--   when      Starts and Ends are days in the location's own clock (Z1). An
--             event time is its own thing; a change in hours always covers the
--             whole business day, and short hours may close at most 6:00 AM
--             the next day (S3). A dated record is Past once its last day is
--             over (Z4); an undated one stays until it is archived.
--   hours     one record sets a location's hours for a day (S4).
--   shifts    the Shifts tab lists the published shifts a change in hours
--             reaches, each with its default (closed: Remove; short hours:
--             prep Keep, after closing Remove, running over Keep) and the
--             manager's choice. Choices apply when it publishes (V5), to every
--             copy of the shift (V7); a shift changed in the Schedule after the
--             record was saved keeps (V4). A draft week's own shifts follow the
--             default quietly (V6). What a record changed can be brought back,
--             one shift at a time (K15 widened); nothing comes back on its own.
--   notices   one notice per person, with their shift in it (B1, K14).
--   life      Draft, Scheduled (or Couldn't publish), Published, Past,
--             Unpublished, Archived. A scheduled record publishes with its
--             scheduler's authority at that moment (K22). Archive only from
--             Draft, Unpublished or Past (K8). A yearly record opens next
--             year's copy, Scheduled with the same lead, when it goes Past.
--
-- The important_dates tables, their services and their notification type go
-- (CLAUDE.md §3.A.4); live data is test data (§3.A.5).

-- 0. A helper that edits a function by its own text --------------------------------

create or replace function pg_temp.patch(fn regprocedure, edits text[]) returns void
language plpgsql as $patch$
declare
  definition text := pg_get_functiondef(fn);
  i integer;
  found integer;
begin
  for i in 1 .. array_length(edits, 1) by 3 loop
    found := (length(definition) - length(replace(definition, edits[i], ''))) / length(edits[i]);
    if found <> edits[i + 2]::integer then
      raise exception '%: anchor % found % times', fn, (i + 2) / 3, found;
    end if;
    definition := replace(definition, edits[i], edits[i + 1]);
  end loop;
  execute definition;
end
$patch$;

-- 1. What goes ---------------------------------------------------------------------

drop function public.save_important_date_service(uuid, uuid, uuid, text, text, date, date, text, text, boolean, uuid[], integer, uuid[], text);
drop function public.set_important_date_state_service(uuid, uuid, uuid, text, uuid[], text);
drop function public.preview_important_date_closure_service(uuid, uuid, uuid, text, date, date, text, uuid[]);
drop function public.read_important_date_history_service(uuid, uuid, uuid);
drop function public.read_settings_important_dates_service(uuid, uuid);
drop function public.publish_announcement_service(uuid, uuid, uuid, integer);
drop function public.save_announcement_audience_service(uuid, uuid, uuid, integer, text, text, text, text[], uuid[], timestamptz, timestamptz, text, uuid[], uuid[]);
drop function public.set_announcement_state_service(uuid, uuid, uuid, integer, text);

drop view public.schedule_closures;

drop function app_private.important_date_close_shifts(uuid, public.important_dates, jsonb, uuid[]);
drop function app_private.important_date_closure_impact(uuid, public.important_dates, text, date, date, text, uuid[]);
drop function app_private.important_date_deliver(public.important_dates, uuid[]);
drop function app_private.important_date_is_past(public.important_dates, date);
drop function app_private.important_date_keep_past(public.important_dates, date);
drop function app_private.important_date_next_day(public.important_dates);
drop function app_private.important_date_notified(public.important_dates);
drop function app_private.important_date_out_to(app_private.actor_state, public.important_dates);
drop function app_private.important_date_recipients(public.important_dates);
drop function app_private.important_date_refuse_past();
drop function app_private.important_date_snapshot(public.important_dates);
drop function app_private.important_date_stay_open(public.important_dates);
drop function app_private.important_date_tell_removed(public.important_dates, jsonb);
drop function app_private.important_date_version_seen(uuid[], jsonb);
drop function app_private.important_date_visible(uuid, public.important_dates);
drop function app_private.closure_days(uuid, public.important_date_type, date, date, public.important_date_recurrence, uuid[]);

drop function app_private.announcement_deliver(public.announcements, uuid[]);
drop function app_private.announcement_out_to(app_private.actor_state, public.announcements, uuid[]);
drop function app_private.announcement_recipients(public.announcements);
drop function app_private.announcement_visible(uuid, public.announcements);
drop function app_private.announcement_places(uuid);
drop function app_private.communication_audience(uuid, uuid[], public.workspace_role[], uuid[], uuid[]);
drop function app_private.communication_reaches(app_private.actor_state, uuid, uuid[], boolean, public.workspace_role[], uuid[], uuid[]);
drop function app_private.communication_authorize(uuid, uuid, text, uuid[], uuid, uuid[]);

drop table public.important_date_shift_releases;
drop table public.important_date_changes;
drop table public.important_dates;
drop type public.important_date_type;
drop type public.important_date_recurrence;

-- The important date's notice type: what points at a recipient goes before the
-- recipient (as 20261003040000 did for its type).
delete from public.notification_delivery_attempts where (recipient_projection_id, workspace_id) in
  (select r.id, r.workspace_id from public.notification_recipients r join public.notification_events e
    on e.id = r.event_id and e.workspace_id = r.workspace_id where e.type_key = 'schedule.important_date.available');
delete from public.notification_inbox_items where (recipient_projection_id, workspace_id) in
  (select r.id, r.workspace_id from public.notification_recipients r join public.notification_events e
    on e.id = r.event_id and e.workspace_id = r.workspace_id where e.type_key = 'schedule.important_date.available');
delete from public.notification_recipient_decisions where (event_id, workspace_id) in
  (select id, workspace_id from public.notification_events where type_key = 'schedule.important_date.available');
delete from public.notification_recipients where (event_id, workspace_id) in
  (select id, workspace_id from public.notification_events where type_key = 'schedule.important_date.available');
delete from public.notification_events where type_key = 'schedule.important_date.available';
delete from public.notification_outbox where type_key = 'schedule.important_date.available';
delete from public.account_notification_items where type_key = 'schedule.important_date.available';
delete from public.notification_org_policies where type_key = 'schedule.important_date.available';
delete from public.notification_producer_registry where type_key = 'schedule.important_date.available';
delete from public.notification_template_versions where type_key = 'schedule.important_date.available';
delete from public.notification_catalog where type_key = 'schedule.important_date.available';
delete from public.notifications where source_type = 'important_date';

-- 2. One record ----------------------------------------------------------------------

-- Categories are general words; what a day does comes from its location rows
-- (Mert, 2026-10-10 08:32 PDT). The old three fold into General.
alter type public.announcement_category rename to announcement_category_retired;
create type public.announcement_category as enum (
  'general', 'holiday', 'event', 'busy_day', 'celebration', 'inspection', 'staff_meeting', 'other');
alter table public.announcements alter column category drop default;
alter table public.announcements alter column category type public.announcement_category
  using 'general'::public.announcement_category;
alter table public.announcements alter column category set default 'general';
drop type public.announcement_category_retired;

alter table public.announcements
  add column category_other text,
  add column starts_on date,
  add column ends_on date,
  add column event_from time,
  add column event_until time,
  add column recurrence text not null default 'none',
  add column on_important_dates boolean not null default false,
  add column on_calendar boolean not null default false,
  add column on_schedule boolean not null default false,
  add column ask_ack boolean not null default false,
  add column time_zone text,
  add column scheduled_by uuid references auth.users (id) on delete set null,
  add column published_by uuid references auth.users (id) on delete set null,
  add column repeats_from uuid,
  add column shift_choices jsonb not null default '{}'::jsonb,
  add column choices_saved_at timestamptz,
  add column unpublished_at timestamptz;

-- Live data is test data: what the old fields said is kept where the new ones
-- can say it. A record for nobody in particular was the whole workspace; it
-- becomes every live location, Open. Every old one asked for acknowledgement.
-- One that ran out keeps its days, so it stays Past.
insert into public.announcement_locations (workspace_id, announcement_id, location_id)
select item.workspace_id, item.id, location.id
from public.announcements item
join public.locations location on location.workspace_id = item.workspace_id and location.archived_at is null
where not exists (select 1 from public.announcement_locations target where target.announcement_id = item.id);

update public.announcements item
set ask_ack = true,
    time_zone = coalesce((
      select location.timezone from public.announcement_locations target
      join public.locations location on location.id = target.location_id
      where target.announcement_id = item.id order by location.sort_order, location.name limit 1), 'America/Los_Angeles'),
    published_by = case when item.status = 'published' then item.updated_by end,
    scheduled_by = case when item.status = 'scheduled' then item.updated_by end,
    unpublished_at = case when item.status = 'unpublished' then item.updated_at end;

update public.announcements item
set starts_on = (coalesce(item.published_at, item.publish_at, item.created_at) at time zone item.time_zone)::date,
    ends_on = greatest((coalesce(item.published_at, item.publish_at, item.created_at) at time zone item.time_zone)::date,
                       ((item.expires_at - interval '1 second') at time zone item.time_zone)::date)
where item.expires_at is not null;

alter table public.announcements
  drop constraint announcements_action_url_check,
  drop constraint announcements_audience_roles_check,
  drop constraint announcements_body_check,
  drop constraint announcements_check,
  drop column audience_roles,
  drop column department_ids,
  drop column job_ids,
  drop column expires_at,
  drop column action_url,
  alter column time_zone set not null,
  add constraint announcements_body_check check (char_length(body) <= 5000),
  -- A draft may be half filled in; what a published record needs is checked
  -- when it goes out (announcement_problems).
  add constraint announcements_category_other_check check (
    category_other is null or (category = 'other' and char_length(btrim(category_other)) between 1 and 40)),
  add constraint announcements_days_check check (ends_on is null or starts_on is null or ends_on >= starts_on),
  add constraint announcements_event_time_check check ((event_from is null) = (event_until is null)),
  add constraint announcements_recurrence_check check (recurrence in ('none', 'date', 'nth', 'last')),
  add constraint announcements_repeats_from_key unique (repeats_from),
  add constraint announcements_repeats_from_fkey foreign key (repeats_from, workspace_id)
    references public.announcements (id, workspace_id) on delete set null (repeats_from);

-- A checked location's day: Open (usual hours), Closed (the whole business
-- day) or Short hours (Opens to Closes, Closes at most 6:00 AM the next day).
alter table public.announcement_locations
  add column day text not null default 'open',
  add column opens time,
  add column closes time,
  add constraint announcement_locations_day_check check (
    day in ('open', 'closed', 'short')
    and case when day = 'short' then opens is not null and closes is not null else opens is null and closes is null end);

-- Who was added by hand (Audience: Add people).
create table public.announcement_people (
  workspace_id uuid not null,
  announcement_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (announcement_id, user_id),
  foreign key (announcement_id, workspace_id) references public.announcements (id, workspace_id) on delete cascade
);
create index announcement_people_user_idx on public.announcement_people (workspace_id, user_id);

-- The record's History, newest on top on the screen.
create table public.announcement_changes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  announcement_id uuid not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null check (action in ('created', 'saved', 'scheduled', 'unscheduled', 'published', 'updated',
    'unpublished', 'brought_back', 'archived', 'publish_failed', 'repeated', 'reminded')),
  detail jsonb not null default '{}'::jsonb,
  changed_at timestamptz not null default now(),
  foreign key (announcement_id, workspace_id) references public.announcements (id, workspace_id) on delete cascade
);
create index announcement_changes_announcement_idx on public.announcement_changes (announcement_id, changed_at desc);

-- Every shift a record changed: removed, made open, or given new hours. A
-- draft week's own shift changes quietly (silent, V6). `before` is the shift as
-- it was, with its copies, so it can be brought back.
create table public.announcement_shift_changes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  announcement_id uuid not null,
  source_shift_id uuid not null,
  published_shift_id uuid,
  location_id uuid not null,
  scheduled_date date not null,
  employee_id uuid,
  outcome text not null check (outcome in ('removed', 'opened', 'edited')),
  before jsonb not null,
  after_start time,
  after_end time,
  silent boolean not null default false,
  actor_user_id uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now(),
  brought_back_at timestamptz,
  check ((outcome = 'edited') = (after_start is not null and after_end is not null)),
  check (silent or published_shift_id is not null),
  foreign key (announcement_id, workspace_id) references public.announcements (id, workspace_id) on delete cascade
);
create index announcement_shift_changes_announcement_idx on public.announcement_shift_changes (announcement_id);
create unique index announcement_shift_changes_live_key on public.announcement_shift_changes (announcement_id, source_shift_id)
  where brought_back_at is null;
create index announcement_shift_changes_employee_idx on public.announcement_shift_changes (workspace_id, employee_id)
  where not silent;

drop index public.announcements_workspace_status_idx;
create index announcements_workspace_status_idx on public.announcements (workspace_id, status, archived_at, starts_on);

alter table public.announcement_people enable row level security;
alter table public.announcement_changes enable row level security;
alter table public.announcement_shift_changes enable row level security;
revoke all on public.announcement_people, public.announcement_changes, public.announcement_shift_changes from anon, authenticated;
grant all on public.announcement_people, public.announcement_changes, public.announcement_shift_changes to service_role;

-- 3. Days, hours and moments ----------------------------------------------------------

-- Whether a location's day reaches a shift that starts that day and runs from
-- starts to ends (ends at or before starts: past midnight). Closed reaches every
-- shift of the business day (S2); short hours reach a shift with any part
-- outside them (S3). A shift belongs to the day it starts (S5).
create function app_private.closure_covers(kind text, opens time, closes time, starts time, ends time)
returns boolean
language sql immutable
set search_path = ''
as $$
  select case kind
    when 'closed' then true
    when 'short' then coalesce(not (m.s >= m.o and m.e <= m.c), false)
    else false end
  from (select extract(epoch from starts) / 60 s,
               extract(epoch from ends) / 60 + case when ends <= starts then 1440 else 0 end e,
               extract(epoch from opens) / 60 o,
               extract(epoch from closes) / 60 + case when closes <= opens then 1440 else 0 end c) m
$$;

-- Why the day reaches the shift: closed; or with short hours, prep (it ends by
-- opening), after_close (it starts at or after closing) or over (it runs over
-- an edge). Null when it does not.
create function app_private.closure_reason(kind text, opens time, closes time, starts time, ends time)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when kind = 'closed' then 'closed'
    when kind <> 'short' or not app_private.closure_covers(kind, opens, closes, starts, ends) then null
    when m.e <= m.o then 'prep'
    when m.s >= m.c then 'after_close'
    else 'over' end
  from (select extract(epoch from starts) / 60 s,
               extract(epoch from ends) / 60 + case when ends <= starts then 1440 else 0 end e,
               extract(epoch from opens) / 60 o,
               extract(epoch from closes) / 60 + case when closes <= opens then 1440 else 0 end c) m
$$;

-- A record's location rows as the services pass them around.
create function app_private.announcement_rows(announcement uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('location_id', target.location_id, 'day', target.day,
    'opens', to_char(target.opens, 'HH24:MI'), 'closes', to_char(target.closes, 'HH24:MI'))
    order by target.location_id), '[]'::jsonb)
  from public.announcement_locations target where target.announcement_id = announcement
$$;

-- When a record with these days starts and when it is over (Z1, Z4), each
-- location in its own clock: the earliest start and the latest end of its live
-- checked locations, or own_zone when it has none. A change in hours takes the
-- whole business day; short hours past midnight end at closing the next day.
create function app_private.announcement_span(w uuid, first_day date, last_day date, event_from time,
  event_until time, own_zone text, day_rows jsonb)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  with places as (
    select location.timezone tz, r ->> 'day' as kind, (r ->> 'opens')::time opens, (r ->> 'closes')::time closes
    from jsonb_array_elements(coalesce(day_rows, '[]'::jsonb)) r
    join public.locations location
      on location.id = (r ->> 'location_id')::uuid and location.workspace_id = w and location.archived_at is null
  ), zones as (
    select distinct places.tz from places
    union select own_zone where not exists (select 1 from places)
  ), shape as (
    select exists (select 1 from places where places.kind <> 'open') hours, coalesce(last_day, first_day) final_day
  )
  select
    min((first_day + case when event_from is not null and not shape.hours then event_from
                          else time '00:00' end) at time zone zones.tz),
    greatest(
      max((case when event_until is not null and not shape.hours then shape.final_day + event_until
                else (shape.final_day + 1)::timestamp end) at time zone zones.tz),
      (select max(((shape.final_day + 1) + places.closes) at time zone places.tz)
       from places where places.kind = 'short' and places.closes <= places.opens))
  from zones, shape
  where first_day is not null
  group by shape.hours, shape.final_day
$$;

create function app_private.announcement_moments(item public.announcements)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select span.* from app_private.announcement_span(item.workspace_id, item.starts_on, item.ends_on, item.event_from,
    item.event_until, item.time_zone, app_private.announcement_rows(item.id)) span
$$;

-- What the lists show: archived; couldn't publish; past once it is over;
-- otherwise its status.
create function app_private.announcement_display_status(item public.announcements)
returns text
language sql stable security definer
set search_path = ''
as $$
  select case
    when item.archived_at is not null then 'archived'
    when item.status = 'scheduled' and item.release_failed_at is not null then 'publish_failed'
    when item.status = 'published'
      and coalesce((select moment.ends_at <= now() from app_private.announcement_moments(item) moment), false) then 'past'
    else item.status::text end
$$;

-- A published record whose first day has come: only its text, flags, people,
-- the acknowledge flag and Ends (not before today) change now.
create function app_private.announcement_started(item public.announcements)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select item.status = 'published'
    and coalesce((select moment.starts_at <= now() from app_private.announcement_moments(item) moment), false)
$$;

-- The Schedule's closures: every (location, day) a published or scheduled
-- record changes. Past ones stay (KK-97), an unpublished record's too for the
-- days before it was unpublished (K11); scheduled ones are for managers only.
create view public.schedule_closures with (security_invoker = true) as
select md5(item.id::text || ':' || target.location_id::text || ':' || day.on_date::date::text)::uuid as id,
  item.workspace_id, target.location_id, day.on_date::date as closed_date, item.title,
  target.day = 'closed' as is_all_day, target.day as kind, target.opens, target.closes,
  item.status::text as status, item.publish_at, item.on_schedule,
  item.created_by, item.created_at, item.id as announcement_id
from public.announcements item
join public.announcement_locations target on target.announcement_id = item.id and target.day <> 'open'
join public.locations location on location.id = target.location_id and location.archived_at is null
cross join lateral generate_series(item.starts_on, coalesce(item.ends_on, item.starts_on), interval '1 day') day(on_date)
where item.archived_at is null and item.starts_on is not null
  and (item.status in ('published', 'scheduled')
    or (item.status = 'unpublished' and day.on_date::date < (item.unpublished_at at time zone location.timezone)::date));

revoke all on public.schedule_closures from public, anon, authenticated;
grant select on public.schedule_closures to service_role;

create index announcement_locations_changed_idx on public.announcement_locations (location_id) where day <> 'open';

-- Text pieces the notices share (B1).
create function app_private.announcement_day_text(d date)
returns text
language sql immutable
set search_path = ''
as $$ select to_char(d, 'Dy, Mon FMDD') $$;

create function app_private.announcement_on_text(starts date, ends date)
returns text
language sql immutable
set search_path = ''
as $$
  select case when ends is null or ends = starts then 'on ' || app_private.announcement_day_text(starts)
    else 'from ' || app_private.announcement_day_text(starts) || ' to ' || app_private.announcement_day_text(ends) end
$$;

-- "4:00–10:00 PM", "11:00 AM–3:00 PM" or "16:00–22:00".
create function app_private.announcement_hours_text(starts time, ends time, fmt text)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when fmt = '24h' then to_char(starts, 'HH24:MI') || '–' || to_char(ends, 'HH24:MI')
    when (starts < time '12:00') = (ends < time '12:00') then to_char(starts, 'FMHH12:MI') || '–' || to_char(ends, 'FMHH12:MI AM')
    else to_char(starts, 'FMHH12:MI AM') || '–' || to_char(ends, 'FMHH12:MI AM') end
$$;

create function app_private.announcement_time_format(w uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select settings.time_format from public.workspace_scheduling_settings settings
                   where settings.workspace_id = w), '12h')
$$;

-- 4. Places, authority, reach ------------------------------------------------------------

-- The locations a record is about, for who may change it (K1): the checked
-- ones and where each person added by hand works first (their primary
-- location; all of theirs when none is primary).
create function app_private.announcement_places_of(w uuid, location_ids uuid[], user_ids uuid[])
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct place order by place), '{}') from (
    select unnest(coalesce(location_ids, '{}')) place
    union
    select assignment.location_id
    from public.employee_profiles person
    join public.employee_location_assignments assignment
      on assignment.employee_id = person.id and assignment.ended_at is null
    where person.workspace_id = w and person.user_id = any (coalesce(user_ids, '{}')) and person.archived_at is null
      and (assignment.is_primary or not exists (
        select 1 from public.employee_location_assignments other
        where other.employee_id = person.id and other.ended_at is null and other.is_primary))
  ) places
$$;

create function app_private.announcement_places(announcement uuid)
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select app_private.announcement_places_of(item.workspace_id,
    array(select target.location_id from public.announcement_locations target where target.announcement_id = item.id),
    array(select person.user_id from public.announcement_people person where person.announcement_id = item.id))
  from public.announcements item where item.id = announcement
$$;

-- Who may change a record about these places, written by author: the
-- announcement rule (K1, K3); with a change in hours or a place on Important
-- Dates, the important date rule too (Mert, 2026-10-12: a lead with only
-- Announcements can do neither). A record about no place (a new one, or one
-- only for people with no location): its own author, while they may write
-- one somewhere; anyone else needs the workspace-wide rule. Null, or the reason.
create function app_private.announcement_reason(state app_private.actor_state, places uuid[], author uuid, dates boolean)
returns text
language plpgsql stable security definer
set search_path = ''
as $$
declare
  reason text;
  kind text;
  narrow app_private.authz_actions;
begin
  foreach kind in array case when dates then array['announcement', 'important_date'] else array['announcement'] end loop
    reason := app_private.communication_reason(state, state.workspace_id, kind, coalesce(places, '{}'), author);
    if reason is not null and cardinality(coalesce(places, '{}')) = 0 and author = state.user_id then
      select * into strict narrow from app_private.authz_actions a where a.key = kind || '.write';
      if exists (select 1 from public.locations location
                 where location.workspace_id = state.workspace_id and location.archived_at is null
                   and app_private.authz_check(state, narrow, array[location.id], null, author) is null) then
        reason := null;
      end if;
    end if;
    if reason is not null then
      return reason;
    end if;
  end loop;
  return null;
end;
$$;

-- Whether a record changes hours or sits on Important Dates (the second rule).
create function app_private.announcement_dates(item public.announcements)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select item.on_important_dates or exists (
    select 1 from public.announcement_locations target where target.announcement_id = item.id and target.day <> 'open')
$$;

-- Whether the record is out to this person (K24): published (its past too),
-- not archived, and they work at a live checked location, were added by hand,
-- or had a shift changed by it.
create function app_private.announcement_reaches(item public.announcements, who uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select item.status = 'published' and item.archived_at is null
    and exists (select 1 from public.workspace_memberships membership
                where membership.workspace_id = item.workspace_id and membership.user_id = who and membership.status = 'active')
    and (exists (select 1 from public.announcement_people person where person.announcement_id = item.id and person.user_id = who)
      or exists (
        select 1 from public.announcement_locations target
        join public.locations location on location.id = target.location_id and location.archived_at is null
        join public.employee_location_assignments assignment on assignment.location_id = target.location_id and assignment.ended_at is null
        join public.employee_profiles person on person.id = assignment.employee_id and person.archived_at is null
        where target.announcement_id = item.id and person.workspace_id = item.workspace_id and person.user_id = who)
      or exists (
        select 1 from public.announcement_shift_changes change
        join public.employee_profiles person on person.id = change.employee_id
        where change.announcement_id = item.id and not change.silent and change.brought_back_at is null
          and person.user_id = who))
$$;

-- Everyone a record with these locations, people and shift changes goes out
-- to (K24): whoever works at a live checked location, whoever was added by hand,
-- whoever's shift it changed; active members only, never its author (KK-89).
create function app_private.announcement_audience(w uuid, location_ids uuid[], user_ids uuid[], employee_ids uuid[], author uuid)
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct who order by who), '{}') from (
    select unnest(coalesce(user_ids, '{}')) who
    union
    select person.user_id
    from public.locations location
    join public.employee_location_assignments assignment on assignment.location_id = location.id and assignment.ended_at is null
    join public.employee_profiles person on person.id = assignment.employee_id and person.archived_at is null
    where location.workspace_id = w and location.archived_at is null and location.id = any (coalesce(location_ids, '{}'))
      and person.workspace_id = w
    union
    select person.user_id from public.employee_profiles person
    where person.workspace_id = w and person.id = any (coalesce(employee_ids, '{}'))
  ) reached
  where who is not null and who is distinct from author
    and exists (select 1 from public.workspace_memberships membership
                where membership.workspace_id = w and membership.user_id = who and membership.status = 'active')
$$;

create function app_private.announcement_recipients(item public.announcements)
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select app_private.announcement_audience(item.workspace_id,
    array(select target.location_id from public.announcement_locations target where target.announcement_id = item.id),
    array(select person.user_id from public.announcement_people person where person.announcement_id = item.id),
    array(select change.employee_id from public.announcement_shift_changes change
          where change.announcement_id = item.id and not change.silent and change.brought_back_at is null),
    item.created_by)
$$;

-- Whether the reader may see the record at all: its author's draft; a record
-- they may change (not a draft); one that is out to them.
create function app_private.announcement_visible(state app_private.actor_state, item public.announcements)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when item.status = 'draft' then item.created_by = state.user_id
    else app_private.announcement_reason(state, app_private.announcement_places(item.id), item.created_by,
           app_private.announcement_dates(item)) is null
      or app_private.announcement_reaches(item, state.user_id) end
$$;

-- 5. Shifts ---------------------------------------------------------------------------------

-- Every (location, day) the rows change, from Starts to Ends.
create function app_private.announcement_days(day_rows jsonb, first_day date, last_day date)
returns table (location_id uuid, on_date date, kind text, opens time, closes time)
language sql immutable
set search_path = ''
as $$
  select (r ->> 'location_id')::uuid, d::date, r ->> 'day', (r ->> 'opens')::time, (r ->> 'closes')::time
  from jsonb_array_elements(coalesce(day_rows, '[]'::jsonb)) r
  cross join lateral generate_series(first_day, coalesce(last_day, first_day), interval '1 day') d
  where first_day is not null and r ->> 'day' in ('closed', 'short')
$$;

-- The Shifts tab (V1–V7): the published shifts the proposed days reach, from
-- each location's today on, each with its default and the manager's choice
-- (closed: Remove; short hours: prep Keep, after closing Remove, running over
-- Keep; started, tied to an offboarding or a time-off release, or changed in
-- the Schedule after the record was saved: Keep). A shift this record already
-- changed, or one the published record already reaches for the same reason, is
-- not listed again. `quiet` is a draft week's own shifts that the default
-- removes without a word (V6, B4).
create function app_private.announcement_impact(w uuid, record uuid, first_day date, last_day date,
  day_rows jsonb, choices jsonb, saved_at timestamptz)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with stored as (
    select item.id, item.starts_on, item.ends_on from public.announcements item
    where item.id = record and item.workspace_id = w and item.status = 'published' and item.archived_at is null
  ), old_days as (
    select day.* from stored
    cross join lateral app_private.announcement_days(app_private.announcement_rows(stored.id), stored.starts_on, stored.ends_on) day
  ), new_days as (
    select day.*, location.timezone, location.name location_name, location.sort_order
    from app_private.announcement_days(day_rows, first_day, last_day) day
    join public.locations location on location.id = day.location_id and location.workspace_id = w and location.archived_at is null
    where day.on_date >= (now() at time zone location.timezone)::date
  ), done as (
    select change.source_shift_id from public.announcement_shift_changes change
    where change.announcement_id = record and change.brought_back_at is null
  ), reached as (
    select shift.id, shift.source_shift_id, shift.location_id, shift.scheduled_date, shift.employee_id, shift.job_id,
      shift.start_time, shift.end_time, new_days.kind, new_days.opens, new_days.closes, new_days.location_name,
      new_days.sort_order, why.reason,
      lower(app_private.shift_time_range(shift.scheduled_date, shift.start_time, shift.end_time,
        coalesce(shift.time_timezone, new_days.timezone))) <= now() started,
      exists (select 1 from public.employee_offboarding_shift_actions tie where tie.shift_id = shift.id and tie.workspace_id = w)
        or exists (select 1 from public.time_off_assignment_releases tie
                   where tie.published_shift_id = shift.id and tie.workspace_id = w) tied,
      coalesce(saved_at < (
        select min(copy.created_at) from public.schedule_published_shifts copy
        where copy.workspace_id = w and copy.source_shift_id = shift.source_shift_id
          and (copy.location_id, copy.scheduled_date, copy.employee_id, copy.start_time, copy.end_time)
            is not distinct from (shift.location_id, shift.scheduled_date, shift.employee_id, shift.start_time, shift.end_time)), false) changed
    from new_days
    join public.schedule_published_shifts shift
      on shift.workspace_id = w and shift.location_id = new_days.location_id and shift.scheduled_date = new_days.on_date
    join public.schedule_location_publications publication on publication.id = shift.publication_id and publication.status = 'current'
    left join old_days on old_days.location_id = shift.location_id and old_days.on_date = shift.scheduled_date
    cross join lateral (select
      app_private.closure_reason(new_days.kind, new_days.opens, new_days.closes, shift.start_time, shift.end_time) reason,
      app_private.closure_reason(old_days.kind, old_days.opens, old_days.closes, shift.start_time, shift.end_time) old_reason) why
    where why.reason is not null and why.reason is distinct from why.old_reason
      and not shift.source_shift_id in (select done.source_shift_id from done)
  ), defaulted as (
    select reached.*,
      case when reached.started or reached.changed or reached.tied or reached.reason in ('prep', 'over') then 'keep'
           else 'remove' end default_choice,
      choices -> reached.source_shift_id::text picked
    from reached
  ), decided as (
    select defaulted.*, case
        when defaulted.started then 'keep'
        when defaulted.picked ->> 'choice' = 'keep' then 'keep'
        when defaulted.picked ->> 'choice' = 'remove' and not defaulted.tied then 'remove'
        when defaulted.picked ->> 'choice' = 'open' and defaulted.employee_id is not null then 'open'
        when defaulted.picked ->> 'choice' = 'edit' and defaulted.kind = 'short'
          and (defaulted.picked ->> 'from')::time is distinct from (defaulted.picked ->> 'until')::time
          and (defaulted.picked ->> 'from') is not null and (defaulted.picked ->> 'until') is not null then 'edit'
        when defaulted.picked ->> 'choice' is not null and defaulted.picked ->> 'choice' not in ('keep', 'remove', 'open', 'edit') then 'keep'
        else defaulted.default_choice end choice
    from defaulted
  ), listed as (
    select decided.*,
      case when decided.choice = 'edit' then (decided.picked ->> 'from')::time end from_time,
      case when decided.choice = 'edit' then (decided.picked ->> 'until')::time end until_time,
      case decided.choice when 'remove' then 'removed' when 'open' then 'opened'
        when 'edit' then case when ((decided.picked ->> 'from')::time, (decided.picked ->> 'until')::time)
                                    = (decided.start_time, decided.end_time) then 'kept' else 'edited' end
        else 'kept' end outcome
    from decided
  ), quiet as (
    select draft_shift.id, draft_shift.location_id, draft_shift.scheduled_date, draft_shift.employee_id
    from new_days
    join public.schedule_draft_shifts draft_shift
      on draft_shift.workspace_id = w and draft_shift.location_id = new_days.location_id and draft_shift.scheduled_date = new_days.on_date
    join public.schedule_drafts draft on draft.id = draft_shift.draft_id and draft.archived_at is null
    left join old_days on old_days.location_id = draft_shift.location_id and old_days.on_date = draft_shift.scheduled_date
    cross join lateral (select
      app_private.closure_reason(new_days.kind, new_days.opens, new_days.closes, draft_shift.start_time, draft_shift.end_time) reason,
      app_private.closure_reason(old_days.kind, old_days.opens, old_days.closes, draft_shift.start_time, draft_shift.end_time) old_reason) why
    where why.reason in ('closed', 'after_close') and why.reason is distinct from why.old_reason
      and (saved_at is null or draft_shift.updated_at <= saved_at)
      and lower(app_private.shift_time_range(draft_shift.scheduled_date, draft_shift.start_time, draft_shift.end_time,
            coalesce(draft_shift.time_timezone, new_days.timezone))) > now()
      and not draft_shift.id in (select done.source_shift_id from done)
      and not exists (
        select 1 from public.schedule_published_shifts published
        join public.schedule_location_publications publication on publication.id = published.publication_id and publication.status = 'current'
        where published.workspace_id = w and published.source_shift_id = draft_shift.id)
    union
    select edit_shift.id, edit_shift.location_id, edit_shift.scheduled_date, edit_shift.employee_id
    from new_days
    join public.schedule_edit_session_shifts edit_shift
      on edit_shift.workspace_id = w and edit_shift.location_id = new_days.location_id and edit_shift.scheduled_date = new_days.on_date
     and edit_shift.source_published_shift_id is null and edit_shift.pending_op_type is distinct from 'delete'
    join public.schedule_edit_sessions session on session.id = edit_shift.session_id and session.status = 'active'
    left join old_days on old_days.location_id = edit_shift.location_id and old_days.on_date = edit_shift.scheduled_date
    cross join lateral (select
      app_private.closure_reason(new_days.kind, new_days.opens, new_days.closes, edit_shift.start_time, edit_shift.end_time) reason,
      app_private.closure_reason(old_days.kind, old_days.opens, old_days.closes, edit_shift.start_time, edit_shift.end_time) old_reason) why
    where why.reason in ('closed', 'after_close') and why.reason is distinct from why.old_reason
      and (saved_at is null or edit_shift.updated_at <= saved_at)
      and lower(app_private.shift_time_range(edit_shift.scheduled_date, edit_shift.start_time, edit_shift.end_time,
            coalesce(edit_shift.time_timezone, new_days.timezone))) > now()
      and not edit_shift.id in (select done.source_shift_id from done)
      and not exists (
        select 1 from public.schedule_published_shifts published
        join public.schedule_location_publications publication on publication.id = published.publication_id and publication.status = 'current'
        where published.workspace_id = w and (published.source_shift_id = edit_shift.id or published.id = edit_shift.id))
  ), quiet_one as (
    select quiet.id, min(quiet.location_id::text)::uuid location_id, min(quiet.scheduled_date) scheduled_date,
      min(quiet.employee_id::text)::uuid employee_id
    from quiet group by quiet.id
  )
  select jsonb_build_object(
    'fingerprint', md5(coalesce((select string_agg(concat_ws('|', listed.source_shift_id, listed.employee_id, listed.start_time,
        listed.end_time, listed.choice, listed.from_time, listed.until_time), ',' order by listed.source_shift_id) from listed), '')
      || ';' || coalesce((select string_agg(quiet_one.id::text, ',' order by quiet_one.id) from quiet_one), '')),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', listed.id, 'source_id', listed.source_shift_id, 'location_id', listed.location_id,
        'location_name', listed.location_name, 'scheduled_date', listed.scheduled_date,
        'employee_id', listed.employee_id, 'employee_user_id', person.user_id,
        'employee_name', case when person.id is not null
          then concat_ws(' ', coalesce(nullif(person.preferred_name, ''), person.first_name), person.last_name) end,
        'job_id', listed.job_id, 'job_name', coalesce(job.name, 'Unassigned position'),
        'start_time', to_char(listed.start_time, 'HH24:MI'), 'end_time', to_char(listed.end_time, 'HH24:MI'),
        'day', listed.kind, 'opens', to_char(listed.opens, 'HH24:MI'), 'closes', to_char(listed.closes, 'HH24:MI'),
        'reason', listed.reason, 'started', listed.started, 'tied', listed.tied, 'changed_in_schedule', listed.changed,
        'default', listed.default_choice, 'choice', listed.choice,
        'from', to_char(listed.from_time, 'HH24:MI'), 'until', to_char(listed.until_time, 'HH24:MI'),
        'outcome', listed.outcome)
        order by listed.scheduled_date, listed.sort_order, listed.location_name, listed.start_time, listed.source_shift_id)
      from listed
      left join public.employee_profiles person on person.id = listed.employee_id and person.workspace_id = w
      left join public.jobs job on job.id = listed.job_id and job.workspace_id = w), '[]'::jsonb),
    'quiet', coalesce((
      select jsonb_agg(jsonb_build_object('id', quiet_one.id, 'location_id', quiet_one.location_id,
        'scheduled_date', quiet_one.scheduled_date, 'employee_id', quiet_one.employee_id) order by quiet_one.id)
      from quiet_one), '[]'::jsonb),
    'counts', jsonb_build_object(
      'removed', (select count(*) from listed where listed.outcome = 'removed'),
      'edited', (select count(*) from listed where listed.outcome = 'edited'),
      'opened', (select count(*) from listed where listed.outcome = 'opened'),
      'kept', (select count(*) from listed where listed.outcome = 'kept'),
      'quiet', (select count(*) from quiet_one)))
$$;

-- Makes the impact's choices (V5, V7): every copy of a shift — published, in a
-- draft, in an open edit — gets the same outcome, with the authority of
-- whoever publishes (K22). What it changed is kept, with the shift as it was,
-- so it can be brought back. The number of shifts people are told about.
create function app_private.announcement_apply(actor uuid, item public.announcements, impact jsonb)
returns integer
language plpgsql security definer
set search_path = ''
as $$
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
  return told;
end;
$$;

-- The bring-back list (K15 widened, Mert 2026-10-11): what this record changed
-- that the proposed days no longer reach (all of it once it is unpublished),
-- from each location's today on. Nothing comes back on its own; a row that
-- can't come back says why.
create function app_private.announcement_back_rows(item public.announcements, first_day date, last_day date, day_rows jsonb)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with live as (
    select change.*, location.name location_name, location.sort_order, location.timezone,
      coalesce(change.before -> 'published', change.before -> 'drafts' -> 0, change.before -> 'edits' -> 0) was,
      public.shift_exchange_shift(change.workspace_id, change.source_shift_id) now_shift
    from public.announcement_shift_changes change
    join public.locations location on location.id = change.location_id
    where change.announcement_id = item.id and change.brought_back_at is null
      and change.scheduled_date >= (now() at time zone location.timezone)::date
      and (item.status = 'unpublished' or (item.status = 'published' and item.archived_at is null and not exists (
        select 1 from app_private.announcement_days(day_rows, first_day, last_day) day
        where day.location_id = change.location_id and day.on_date = change.scheduled_date)))
  ), shaped as (
    select live.*, (live.was ->> 'start_time')::time was_start, (live.was ->> 'end_time')::time was_end,
      app_private.shift_time_range(live.scheduled_date, (live.was ->> 'start_time')::time, (live.was ->> 'end_time')::time,
        coalesce(live.was ->> 'time_timezone', live.timezone)) span,
      person.user_id, person.first_name,
      case when person.id is not null
        then concat_ws(' ', coalesce(nullif(person.preferred_name, ''), person.first_name), person.last_name) end person_name,
      coalesce(nullif(person.preferred_name, ''), person.first_name) short_name
    from live
    left join public.employee_profiles person on person.id = live.employee_id and person.workspace_id = live.workspace_id
  ), locked as (
    select shaped.*, case
      when lower(shaped.span) <= now() then 'Already started'
      when shaped.employee_id is not null and exists (
        select 1 from public.schedule_time_off_segments segment
        join public.schedule_time_off_requests request on request.id = segment.request_id and request.workspace_id = segment.workspace_id
        where request.workspace_id = shaped.workspace_id and request.employee_id = shaped.employee_id and request.status = 'approved'
          and public.time_off_effective_ranges(segment.id) && shaped.span)
        then shaped.short_name || ' has approved time off that day'
      when shaped.silent and not exists (
        select 1 from public.schedule_drafts draft
        where draft.id = (shaped.before -> 'drafts' -> 0 ->> 'draft_id')::uuid and draft.archived_at is null)
        and not exists (
        select 1 from public.schedule_edit_sessions session
        where session.id = (shaped.before -> 'edits' -> 0 ->> 'session_id')::uuid and session.status = 'active')
        then 'Its draft week changed since'
      when shaped.outcome = 'removed' and not shaped.silent and shaped.now_shift is not null then 'Back on the Schedule already'
      when shaped.outcome = 'removed' and not shaped.silent and not exists (
        select 1 from public.schedule_location_publications publication
        where publication.workspace_id = shaped.workspace_id and publication.location_id = shaped.location_id
          and publication.status = 'current'
          and shaped.scheduled_date between publication.week_start and publication.week_start + 6)
        then 'Its week isn''t published anymore'
      when shaped.outcome in ('opened', 'edited') and shaped.now_shift is null then 'Removed in the Schedule since'
      when shaped.outcome = 'opened' and shaped.now_shift ->> 'employee_id' is not null
        then 'Picked up by ' || coalesce(shaped.now_shift ->> 'employee_name', 'someone else')
      when shaped.outcome = 'edited' and ((shaped.now_shift ->> 'start_time')::time, (shaped.now_shift ->> 'end_time')::time)
          is distinct from (shaped.after_start, shaped.after_end)
        then 'Changed in the Schedule since'
      when shaped.outcome in ('removed', 'opened') and shaped.employee_id is not null and not shaped.silent and exists (
        select 1 from public.schedule_published_shifts other
        join public.schedule_location_publications publication on publication.id = other.publication_id and publication.status = 'current'
        join public.locations place on place.id = other.location_id
        where other.workspace_id = shaped.workspace_id and other.employee_id = shaped.employee_id
          and other.source_shift_id <> shaped.source_shift_id
          and other.scheduled_date between shaped.scheduled_date - 1 and shaped.scheduled_date + 1
          and app_private.shift_time_range(other.scheduled_date, other.start_time, other.end_time,
                coalesce(other.time_timezone, place.timezone)) && shaped.span)
        then shaped.short_name || ' has another shift then'
      end lock_text
    from shaped
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', locked.id, 'source_id', locked.source_shift_id, 'outcome', locked.outcome, 'silent', locked.silent,
    'location_id', locked.location_id, 'location_name', locked.location_name, 'scheduled_date', locked.scheduled_date,
    'employee_id', locked.employee_id, 'employee_user_id', locked.user_id, 'employee_name', locked.person_name,
    'job_name', coalesce((select job.name from public.jobs job where job.id = (locked.was ->> 'job_id')::uuid), 'Unassigned position'),
    'start_time', to_char(locked.was_start, 'HH24:MI'), 'end_time', to_char(locked.was_end, 'HH24:MI'),
    'after_start', to_char(locked.after_start, 'HH24:MI'), 'after_end', to_char(locked.after_end, 'HH24:MI'),
    'lock', locked.lock_text)
    order by locked.scheduled_date, locked.sort_order, locked.location_name, locked.was_start, locked.id), '[]'::jsonb)
  from locked
$$;

-- Puts the chosen rows of the bring-back list back on the Schedule, every copy
-- as it was. The rows brought back, for their notices.
create function app_private.announcement_bring_back(actor uuid, item public.announcements, ids uuid[], offered jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  w uuid := item.workspace_id;
  pick jsonb;
  change public.announcement_shift_changes;
  was public.schedule_published_shifts;
  copy jsonb;
  publication_id uuid;
  new_id uuid;
  snap jsonb;
  back jsonb := '[]'::jsonb;
begin
  if cardinality(coalesce(ids, '{}')) = 0 then
    return back;
  end if;
  if exists (select 1 from unnest(ids) id where not exists (
      select 1 from jsonb_array_elements(offered) row_item where (row_item ->> 'id')::uuid = id and row_item ->> 'lock' is null)) then
    raise exception 'A shift on the bring-back list changed. Review the list again.'
      using errcode = 'PT409', hint = 'announcement.bring_back_changed';
  end if;
  perform app_private.authorize(actor, w, 'schedule.edit', target_locations => array(
    select distinct change_row.location_id from public.announcement_shift_changes change_row
    where change_row.announcement_id = item.id and change_row.id = any (ids)));

  for pick in select row_item from jsonb_array_elements(offered) row_item where (row_item ->> 'id')::uuid = any (ids) loop
    select * into change from public.announcement_shift_changes change_row
    where change_row.id = (pick ->> 'id')::uuid and change_row.announcement_id = item.id and change_row.brought_back_at is null
    for update;
    if change.id is null then
      raise exception 'A shift on the bring-back list changed. Review the list again.'
        using errcode = 'PT409', hint = 'announcement.bring_back_changed';
    end if;

    begin
      if change.outcome = 'removed' and not change.silent then
        was := jsonb_populate_record(null::public.schedule_published_shifts, change.before -> 'published');
        select publication.id into publication_id from public.schedule_location_publications publication
        where publication.workspace_id = w and publication.location_id = change.location_id and publication.status = 'current'
          and change.scheduled_date between publication.week_start and publication.week_start + 6;
        new_id := gen_random_uuid();
        insert into public.schedule_published_shifts (id, workspace_id, location_id, publication_id, employee_id, job_id,
          shift_type_id, scheduled_date, start_time, end_time, note, source_shift_id, unpaid_break_minutes, hide_time_on_badge,
          label_ids, label_names, time_basis, time_snapshot, time_timezone)
        values (new_id, w, was.location_id, publication_id, was.employee_id, was.job_id, was.shift_type_id, was.scheduled_date,
          was.start_time, was.end_time, was.note, was.source_shift_id, was.unpaid_break_minutes, was.hide_time_on_badge,
          was.label_ids, was.label_names, was.time_basis, was.time_snapshot, was.time_timezone);
        -- An open edit of that week gets it too, the way a recovery adds it.
        insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, employee_id, job_id,
          shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes,
          hide_time_on_badge, note, source_published_shift_id, label_ids, label_names)
        select new_id, w, session.id, was.location_id, was.employee_id, was.job_id, was.shift_type_id, was.scheduled_date,
          was.start_time, was.end_time, was.time_basis, was.time_snapshot, was.time_timezone, was.unpaid_break_minutes,
          was.hide_time_on_badge, was.note, new_id, was.label_ids, was.label_names
        from public.schedule_edit_sessions session
        where session.workspace_id = w and session.status = 'active' and session.source_kind = 'published'
          and session.week_start <= was.scheduled_date and was.scheduled_date <= session.week_start + 6
          and was.location_id = any (session.location_ids)
          and not exists (select 1 from public.schedule_edit_session_shifts present
                          where present.session_id = session.id and present.id in (new_id, was.source_shift_id));
      elsif change.outcome = 'opened' then
        snap := public.shift_exchange_shift(w, change.source_shift_id);
        update public.schedule_published_shifts set employee_id = change.employee_id
        where workspace_id = w and id = (snap ->> 'id')::uuid and employee_id is null;
        if not found then
          raise exception 'A shift on the bring-back list changed. Review the list again.'
            using errcode = 'PT409', hint = 'announcement.bring_back_changed';
        end if;
        perform public.shift_exchange_reconcile_batch(actor, w, jsonb_build_array(snap || jsonb_build_object('new_employee_id', change.employee_id)));
      elsif change.outcome = 'edited' then
        snap := public.shift_exchange_shift(w, change.source_shift_id);
        was := jsonb_populate_record(null::public.schedule_published_shifts, change.before -> 'published');
        update public.schedule_published_shifts
        set start_time = was.start_time, end_time = was.end_time, time_basis = was.time_basis, time_snapshot = was.time_snapshot
        where workspace_id = w and id = (snap ->> 'id')::uuid and start_time = change.after_start and end_time = change.after_end;
        if not found then
          raise exception 'A shift on the bring-back list changed. Review the list again.'
            using errcode = 'PT409', hint = 'announcement.bring_back_changed';
        end if;
        with moved as (
          update public.schedule_draft_shifts copy
          set start_time = was.start_time, end_time = was.end_time, time_basis = was.time_basis, time_snapshot = was.time_snapshot,
              revision = copy.revision + 1, updated_at = now()
          where copy.workspace_id = w and copy.id in (change.source_shift_id, (snap ->> 'id')::uuid)
            and public.shift_exchange_edit_matches(to_jsonb(copy), snap)
          returning copy.draft_id)
        update public.schedule_drafts set revision = revision + 1, updated_at = now() where id in (select draft_id from moved);
        with moved as (
          update public.schedule_edit_session_shifts copy
          set start_time = was.start_time, end_time = was.end_time, time_basis = was.time_basis, time_snapshot = was.time_snapshot,
              revision = copy.revision + 1, updated_at = now()
          where copy.workspace_id = w and (copy.id in (change.source_shift_id, (snap ->> 'id')::uuid)
                or copy.source_published_shift_id = (snap ->> 'id')::uuid)
            and copy.pending_op_type is distinct from 'delete' and public.shift_exchange_edit_matches(to_jsonb(copy), snap)
          returning copy.session_id)
        update public.schedule_edit_sessions set revision = revision + 1 where id in (select session_id from moved);
      end if;
    exception when check_violation then
      raise exception '% can''t take this shift back: it overlaps another shift or approved time off.',
        coalesce(pick ->> 'employee_name', 'This person')
        using errcode = 'PT409', hint = 'announcement.bring_back_conflict';
    end;

    -- The draft and edit copies as they were (a draft week's own shift has only these).
    if change.outcome = 'removed' then
      for copy in select x from jsonb_array_elements(change.before -> 'drafts') x loop
        insert into public.schedule_draft_shifts (id, workspace_id, draft_id, location_id, employee_id, job_id, shift_type_id,
          scheduled_date, start_time, end_time, note, unpaid_break_minutes, hide_time_on_badge, label_ids, label_names,
          time_basis, time_snapshot, time_timezone)
        select restored.id, w, restored.draft_id, restored.location_id, restored.employee_id, restored.job_id, restored.shift_type_id,
          restored.scheduled_date, restored.start_time, restored.end_time, restored.note, restored.unpaid_break_minutes,
          restored.hide_time_on_badge, restored.label_ids, restored.label_names, restored.time_basis, restored.time_snapshot,
          restored.time_timezone
        from jsonb_populate_record(null::public.schedule_draft_shifts, copy) restored
        where exists (select 1 from public.schedule_drafts draft where draft.id = restored.draft_id and draft.archived_at is null)
          and not exists (select 1 from public.schedule_draft_shifts present where present.id = restored.id);
        update public.schedule_drafts set revision = revision + 1, updated_at = now() where id = (copy ->> 'draft_id')::uuid;
      end loop;
      if change.silent then
        for copy in select x from jsonb_array_elements(change.before -> 'edits') x loop
          insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, employee_id, job_id,
            shift_type_id, scheduled_date, start_time, end_time, note, unpaid_break_minutes, hide_time_on_badge, label_ids,
            label_names, time_basis, time_snapshot, time_timezone, pending_op_type)
          select restored.id, w, restored.session_id, restored.location_id, restored.employee_id, restored.job_id,
            restored.shift_type_id, restored.scheduled_date, restored.start_time, restored.end_time, restored.note,
            restored.unpaid_break_minutes, restored.hide_time_on_badge, restored.label_ids, restored.label_names,
            restored.time_basis, restored.time_snapshot, restored.time_timezone, restored.pending_op_type
          from jsonb_populate_record(null::public.schedule_edit_session_shifts, copy) restored
          where exists (select 1 from public.schedule_edit_sessions session where session.id = restored.session_id and session.status = 'active')
            and not exists (select 1 from public.schedule_edit_session_shifts present
                            where present.session_id = restored.session_id and present.id = restored.id);
          update public.schedule_edit_sessions set revision = revision + 1 where id = (copy ->> 'session_id')::uuid and status = 'active';
        end loop;
      end if;
    end if;

    update public.announcement_shift_changes set brought_back_at = now() where id = change.id;
    back := back || jsonb_build_array(pick);
  end loop;
  -- DB-1c: Undo does not take these back either.
  perform app_private.schedule_edit_undo_barrier();
  return back;
end;
$$;

-- 6. Notices -------------------------------------------------------------------------------

-- A shift change as the drawer, the History and the notices read it.
create function app_private.announcement_change_item(change public.announcement_shift_changes)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', change.id, 'source_id', change.source_shift_id, 'outcome', change.outcome, 'silent', change.silent,
    'location_id', change.location_id, 'location_name', location.name, 'scheduled_date', change.scheduled_date,
    'employee_id', change.employee_id, 'employee_user_id', person.user_id,
    'employee_name', case when person.id is not null
      then concat_ws(' ', coalesce(nullif(person.preferred_name, ''), person.first_name), person.last_name) end,
    'job_name', coalesce(job.name, 'Unassigned position'),
    'start_time', to_char((shape.was ->> 'start_time')::time, 'HH24:MI'),
    'end_time', to_char((shape.was ->> 'end_time')::time, 'HH24:MI'),
    'after_start', to_char(change.after_start, 'HH24:MI'), 'after_end', to_char(change.after_end, 'HH24:MI'),
    'changed_at', change.changed_at, 'brought_back_at', change.brought_back_at)
  from (select coalesce(change.before -> 'published', change.before -> 'drafts' -> 0, change.before -> 'edits' -> 0) was) shape
  join public.locations location on location.id = change.location_id
  left join public.employee_profiles person on person.id = change.employee_id and person.workspace_id = change.workspace_id
  left join public.jobs job on job.id = (shape.was ->> 'job_id')::uuid and job.workspace_id = change.workspace_id
$$;

-- One sentence per shift change (B1, K14); a record over more than one day
-- names the day.
create function app_private.announcement_shift_sentence(change jsonb, back boolean, multi boolean, fmt text)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when back and change ->> 'outcome' = 'edited' then 'Your ' || part.prefix || 'shift is back to ' || part.was
    when back then 'Your ' || part.was || ' shift' || part.suffix || ' is back'
    when change ->> 'outcome' = 'removed' then 'Your ' || part.was || ' shift' || part.suffix || ' was removed'
    when change ->> 'outcome' = 'opened'
      then 'You''re off the ' || part.was || ' shift' || part.suffix || '; it''s now open for others'
    else 'Your ' || part.prefix || 'shift is now ' || part.now end
  from (select
    app_private.announcement_hours_text((change ->> 'start_time')::time, (change ->> 'end_time')::time, fmt) was,
    app_private.announcement_hours_text((change ->> 'after_start')::time, (change ->> 'after_end')::time, fmt) now,
    case when multi then app_private.announcement_day_text((change ->> 'scheduled_date')::date) || ' ' else '' end prefix,
    case when multi then ' on ' || app_private.announcement_day_text((change ->> 'scheduled_date')::date) else '' end suffix) part
$$;

-- A person's one notice about the record (B1): the head says what the day is
-- where they are, the rest what happened to their shifts. publish (also every
-- later save) or cancel; back is what came back to them now. A record with no
-- day has no cancel notice; it just leaves the inbox.
create function app_private.announcement_notice(item public.announcements, who uuid, mode text, back jsonb)
returns table (title text, body text)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  fmt text := app_private.announcement_time_format(item.workspace_id);
  person_id uuid := (select person.id from public.employee_profiles person
                     where person.workspace_id = item.workspace_id and person.user_id = who);
  multi boolean := coalesce(item.ends_on, item.starts_on) > item.starts_on;
  on_text text := app_private.announcement_on_text(item.starts_on, item.ends_on);
  mine jsonb;
  changes jsonb := '[]'::jsonb;
  home uuid;
  place_name text;
  place_day text;
  place_opens time;
  place_closes time;
  head text;
  tail text;
begin
  mine := coalesce((select jsonb_agg(x order by x ->> 'scheduled_date', x ->> 'start_time')
                    from jsonb_array_elements(coalesce(back, '[]'::jsonb)) x
                    where (x ->> 'employee_id')::uuid = person_id and not coalesce((x ->> 'silent')::boolean, false)), '[]'::jsonb);
  if item.starts_on is null then
    if mode <> 'cancel' then
      title := item.title;
      body := coalesce(nullif(btrim(left(item.body, 2000)), ''), item.title);
      return next;
    end if;
    return;
  end if;
  if mode <> 'cancel' then
    changes := coalesce((
      select jsonb_agg(app_private.announcement_change_item(change) order by change.scheduled_date, change.changed_at, change.id)
      from public.announcement_shift_changes change
      where change.announcement_id = item.id and change.employee_id = person_id
        and not change.silent and change.brought_back_at is null), '[]'::jsonb);
  end if;
  home := coalesce(case when mode = 'cancel' then mine else changes end -> 0 ->> 'location_id',
    (select target.location_id::text from public.announcement_locations target
     join public.locations location on location.id = target.location_id and location.archived_at is null
     join public.employee_location_assignments assignment
       on assignment.location_id = target.location_id and assignment.employee_id = person_id and assignment.ended_at is null
     where target.announcement_id = item.id
     order by assignment.is_primary desc, location.sort_order, location.name limit 1))::uuid;
  select location.name, target.day, target.opens, target.closes into place_name, place_day, place_opens, place_closes
  from public.locations location
  left join public.announcement_locations target on target.location_id = location.id and target.announcement_id = item.id
  where location.id = home;

  if mode = 'cancel' then
    head := case place_day
      when 'closed' then place_name || ' will be open ' || on_text || ' after all'
      when 'short' then place_name || ' keeps its usual hours ' || on_text || ' after all'
      else item.title || ' ' || on_text || ' is cancelled' end;
    tail := (select string_agg(app_private.announcement_shift_sentence(x, true, multi, fmt), ' · ' order by n)
             from jsonb_array_elements(mine) with ordinality line(x, n));
  else
    head := case
      when home is null then item.title || ' ' || on_text
        || case when item.event_from is not null
             then ', ' || app_private.announcement_hours_text(item.event_from, item.event_until, fmt) else '' end
      when place_day = 'closed' then place_name || ' is closed ' || on_text
      when place_day = 'short' then place_name || ' has short hours ' || on_text || ' ('
        || app_private.announcement_hours_text(place_opens, place_closes, fmt)
        || case when place_closes <= place_opens then ' next day' else '' end || ')'
      else item.title || ' ' || on_text end;
    tail := case
      when jsonb_array_length(changes) > 0 then (
        select string_agg(app_private.announcement_shift_sentence(x, false, multi, fmt), ' · ' order by n)
        from jsonb_array_elements(changes) with ordinality line(x, n))
      when home is null then null
      when place_day = 'open' then place_name || ' keeps its usual hours'
      else item.title end;
    if jsonb_array_length(mine) > 0 then
      tail := concat_ws(' · ', tail, (
        select string_agg(app_private.announcement_shift_sentence(x, true, multi, fmt), ' · ' order by n)
        from jsonb_array_elements(mine) with ordinality line(x, n)));
    end if;
  end if;
  title := head;
  body := coalesce(nullif(tail, ''), nullif(btrim(left(item.body, 2000)), ''), item.title);
  return next;
end;
$$;

-- Sends each person their notice: one event per distinct notice, so a person
-- gets exactly one (B1). The number of people told.
create function app_private.announcement_deliver(actor uuid, item public.announcements, people uuid[], mode text,
  back jsonb default '[]'::jsonb)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  notice record;
  event_id uuid;
  told integer := 0;
begin
  for notice in
    select line.title, line.body, array_agg(who order by who) recipients
    from unnest(coalesce(people, '{}')) who
    cross join lateral app_private.announcement_notice(item, who, mode, back) line
    group by line.title, line.body
  loop
    event_id := gen_random_uuid();
    perform public.enqueue_notification_outbox_service(
      item.workspace_id, event_id, 'communications.announcement.available', 1, actor, 'announcement', item.id::text,
      jsonb_build_object(
        'correlation_id', event_id,
        'announcement_id', item.id,
        'announcement_revision', item.revision,
        'content_revision', item.content_revision,
        'location_ids', to_jsonb(app_private.announcement_places(item.id)),
        'recipient_user_ids', to_jsonb(notice.recipients),
        'audience_contract', 'announcement_targeted_members',
        'category', 'announcement',
        'title', notice.title,
        'body', notice.body,
        'safe_preview', case when mode = 'cancel' then 'An announcement was cancelled.' else 'A new announcement is available.' end,
        'action_url', '/app/announcements/' || item.id::text,
        'group_key', 'announcement:' || item.id::text,
        'visible_at', now()),
      now());
    told := told + cardinality(notice.recipients);
  end loop;
  return told;
end;
$$;

-- K21: a scheduled record that couldn't go out tells the one who scheduled it
-- (the owner when they are gone), once.
create function app_private.announcement_tell_failed(item public.announcements, why text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  event_id uuid := gen_random_uuid();
  who uuid := coalesce(
    (select membership.user_id from public.workspace_memberships membership
     where membership.workspace_id = item.workspace_id and membership.user_id = coalesce(item.scheduled_by, item.created_by)
       and membership.status = 'active'),
    (select membership.user_id from public.workspace_memberships membership
     join public.workspace_roles role on role.id = membership.role_id
     where membership.workspace_id = item.workspace_id and membership.status = 'active'
       and app_private.authz_rank(role.access_class) = app_private.authz_rank('owner')
     order by membership.created_at limit 1));
begin
  if who is null then
    return;
  end if;
  perform public.enqueue_notification_outbox_service(
    item.workspace_id, event_id, 'communications.announcement.available', 1, null, 'announcement', item.id::text,
    jsonb_build_object(
      'correlation_id', event_id, 'announcement_id', item.id, 'announcement_revision', item.revision,
      'content_revision', item.content_revision, 'location_ids', to_jsonb(app_private.announcement_places(item.id)),
      'recipient_user_ids', jsonb_build_array(who), 'audience_contract', 'announcement_targeted_members',
      'category', 'announcement', 'title', 'Couldn''t publish "' || item.title || '"', 'body', why,
      'safe_preview', 'An announcement couldn''t be published.',
      'action_url', '/app/announcements/' || item.id::text, 'group_key', 'announcement:' || item.id::text,
      'visible_at', now()),
    now());
end;
$$;

-- K22: who is asked to acknowledge: the people it is out to who rank below
-- whoever published it (owner > admin > manager > employee); never the owner.
create function app_private.announcement_respondents(item public.announcements)
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(who order by who), '{}')
  from unnest(app_private.announcement_recipients(item)) who
  where item.ask_ack and item.status = 'published'
    and app_private.authz_rank(coalesce((
      select role.access_class from public.workspace_memberships membership
      join public.workspace_roles role on role.id = membership.role_id and role.workspace_id = membership.workspace_id
      where membership.workspace_id = item.workspace_id and membership.user_id = who), 'employee'))
    < app_private.authz_rank(coalesce((
      select role.access_class from public.workspace_memberships membership
      join public.workspace_roles role on role.id = membership.role_id and role.workspace_id = membership.workspace_id
      where membership.workspace_id = item.workspace_id and membership.user_id = coalesce(item.published_by, item.created_by)),
      'owner'))
$$;

-- 7. What a save says ---------------------------------------------------------------------

-- Next year's day for a yearly record (S-15): the same date (Feb 29 is Feb 28
-- in a year without one), the same nth weekday of the month, or the month's
-- last such weekday.
create function app_private.announcement_next_year(d date, mode text)
returns date
language sql immutable
set search_path = ''
as $$
  select case mode
    when 'date' then make_date(ym.y, ym.m, least(extract(day from d)::integer, extract(day from edge.last_of)::integer))
    when 'nth' then least(edge.first_dow + 7 * (ceil(extract(day from d) / 7.0)::integer - 1), edge.last_dow)
    when 'last' then edge.last_dow end
  from (select extract(year from d)::integer + 1 y, extract(month from d)::integer m, extract(dow from d)::integer dow) ym
  cross join lateral (select make_date(ym.y, ym.m, 1) first_of,
    (make_date(ym.y, ym.m, 1) + interval '1 month' - interval '1 day')::date last_of) month_of
  cross join lateral (select month_of.last_of,
    month_of.first_of + (ym.dow - extract(dow from month_of.first_of)::integer + 7) % 7 first_dow,
    month_of.last_of - (extract(dow from month_of.last_of)::integer - ym.dow + 7) % 7 last_dow) edge
  where d is not null and mode in ('date', 'nth', 'last')
$$;

-- The record a save or a preview proposes, in one shape: what was sent, with
-- a stored row at an archived location kept as it was. A started record keeps
-- its day, its event time, its repeat and its locations (only its text, the
-- boxes, its people and Ends change now).
create function app_private.announcement_proposal(w uuid, stored public.announcements, p jsonb, author uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
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
    'hours', hours,
    'choices', case when jsonb_typeof(p -> 'choices') = 'object' then p -> 'choices' else '{}'::jsonb end);
end;
$$;

-- What keeps a proposal from going out, each at its own field (the drawer
-- shows them there; a save refuses with the first). A draft needs only a
-- title. tab: details | where | aud; required: an empty field, shown once a
-- Publish or Schedule was tried.
create function app_private.announcement_problems(w uuid, stored public.announcements, n jsonb, intent text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
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

  if jsonb_array_length(n -> 'live_location_ids') = 0 and jsonb_array_length(n -> 'people') = 0 then
    found := found || jsonb_build_array(jsonb_build_object('tab', 'aud', 'field', 'people', 'code', 'nobody',
      'message', 'Nobody gets it yet. Check a location on Locations & publishing, or add people here.', 'required', true));
  end if;
  return found;
end;
$$;

-- A person as the Audience lists them: name, primary job, where they work first.
create function app_private.announcement_person(w uuid, who uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', who, 'employee_id', person.id,
    'name', coalesce(case when person.id is not null
      then concat_ws(' ', coalesce(nullif(person.preferred_name, ''), person.first_name), person.last_name) end,
      account.display_name, 'Workspace member'),
    'job_name', (select job.name from public.employee_job_assignments assignment
                 join public.jobs job on job.id = assignment.job_id and job.archived_at is null
                 where assignment.employee_id = person.id and assignment.ended_at is null
                 order by assignment.is_primary desc, lower(job.name) limit 1),
    'job_ids', coalesce((select jsonb_agg(distinct assignment.job_id) from public.employee_job_assignments assignment
                         join public.jobs job on job.id = assignment.job_id and job.archived_at is null
                         where assignment.employee_id = person.id and assignment.ended_at is null), '[]'::jsonb),
    'department_ids', coalesce((select jsonb_agg(distinct job.department_id) from public.employee_job_assignments assignment
                                join public.jobs job on job.id = assignment.job_id and job.archived_at is null
                                where assignment.employee_id = person.id and assignment.ended_at is null
                                  and job.department_id is not null), '[]'::jsonb),
    'location_ids', coalesce((select jsonb_agg(assignment.location_id order by assignment.is_primary desc, location.sort_order, location.name)
                              from public.employee_location_assignments assignment
                              join public.locations location on location.id = assignment.location_id and location.archived_at is null
                              where assignment.employee_id = person.id and assignment.ended_at is null), '[]'::jsonb),
    'location_name', (select location.name from public.employee_location_assignments assignment
                      join public.locations location on location.id = assignment.location_id and location.archived_at is null
                      where assignment.employee_id = person.id and assignment.ended_at is null
                      order by assignment.is_primary desc, location.sort_order, location.name limit 1))
  from (select who) me
  left join public.employee_profiles person on person.workspace_id = w and person.user_id = who and person.archived_at is null
  left join public.user_profiles account on account.user_id = who
$$;

-- One record as the lists and the drawer read it. allowed: the reader may
-- change it (K1, K3).
create function app_private.announcement_item(state app_private.actor_state, item public.announcements, allowed boolean)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', item.id, 'title', item.title, 'body', item.body,
    'category', item.category, 'category_other', item.category_other,
    'status', item.status, 'display_status', shown.status,
    'publish_error_code', case when shown.status <> 'publish_failed' then null
      when item.release_error like '42501%' then 'not_allowed'
      when item.release_error like '%too_late%' then 'too_late' else 'failed' end,
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

-- The Announcements page: every record the reader may see (their own drafts,
-- what they may change, what is out to them), and what the drawer offers them.
create or replace function public.get_announcements_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
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
                         where assignment.location_id = location.id and assignment.ended_at is null))
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

-- One record for the drawer: what the list says, and for whoever may change
-- it the people added, the shifts it changed, who acknowledged and its History.
create function public.get_announcement_service(actor_user_id uuid, target_workspace_id uuid, target_announcement_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  w uuid := target_workspace_id;
  reader app_private.actor_state;
  item public.announcements;
  allowed boolean;
  seen uuid[];
begin
  perform app_private.authorize(actor_user_id, w, 'announcement.read');
  perform app_private.announcement_release(w);
  reader := app_private.actor(actor_user_id, w);
  select * into item from public.announcements where id = target_announcement_id and workspace_id = w;
  if item.id is null or not app_private.announcement_visible(reader, item) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.read';
  end if;
  allowed := app_private.announcement_reason(reader, app_private.announcement_places(item.id), item.created_by,
    app_private.announcement_dates(item)) is null;
  if not allowed then
    return app_private.announcement_item(reader, item, false);
  end if;
  seen := app_private.scope_set(actor_user_id, w, 'schedule.read');
  return app_private.announcement_item(reader, item, true) || jsonb_build_object(
    'people', coalesce((
      select jsonb_agg(app_private.announcement_person(w, person.user_id) order by person.user_id)
      from public.announcement_people person where person.announcement_id = item.id), '[]'::jsonb),
    'shift_choices', item.shift_choices,
    'choices_saved_at', item.choices_saved_at,
    -- Whose shifts it changed, where the reader may read the Schedule (D1).
    'changes', coalesce((
      select jsonb_agg(app_private.announcement_change_item(change) order by change.scheduled_date, change.changed_at, change.id)
      from public.announcement_shift_changes change
      where change.announcement_id = item.id and change.location_id = any (seen)), '[]'::jsonb),
    'hidden_change_count', (select count(*) from public.announcement_shift_changes change
      where change.announcement_id = item.id and not change.location_id = any (seen)),
    'acknowledgements', coalesce((
      select jsonb_agg(app_private.announcement_person(w, who) || jsonb_build_object('acknowledged_at', ack.acknowledged_at)
        order by ack.acknowledged_at is not null, ack.acknowledged_at, who)
      from unnest(case when item.ask_ack and item.status = 'published'
                       then app_private.announcement_respondents(item) else '{}'::uuid[] end) who
      left join public.announcement_acknowledgements ack on ack.announcement_id = item.id and ack.user_id = who), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('id', change.id, 'action', change.action, 'detail', change.detail,
        'changed_at', change.changed_at, 'actor_user_id', change.actor_user_id,
        'actor_name', coalesce(account.display_name, case when change.actor_user_id is null then null else 'Workspace member' end))
        order by change.changed_at desc, change.id)
      from public.announcement_changes change
      left join public.user_profiles account on account.user_id = change.actor_user_id
      where change.announcement_id = item.id), '[]'::jsonb));
end;
$$;

-- Important Dates (under Announcements): every published record on it, past
-- ones too, in day order.
create function public.get_important_dates_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  w uuid := target_workspace_id;
  reader app_private.actor_state;
  writable uuid[];
begin
  perform app_private.authorize(actor_user_id, w, 'settings.important_dates.read');
  perform app_private.announcement_release(w);
  reader := app_private.actor(actor_user_id, w);
  writable := app_private.scope_set(actor_user_id, w, 'important_date.write');
  return jsonb_build_object(
    'workspace_id', w,
    'time_format', app_private.announcement_time_format(w),
    'can_write', app_private.authz_reason(actor_user_id, w, 'important_date.write_wide') is null or cardinality(writable) > 0,
    'dates', coalesce((
      select jsonb_agg(app_private.announcement_item(reader, item, control.allowed) order by item.starts_on, item.event_from nulls first, item.id)
      from public.announcements item
      cross join lateral (select app_private.announcement_reason(reader, app_private.announcement_places(item.id),
        item.created_by, app_private.announcement_dates(item)) is null allowed) control
      where item.workspace_id = w and item.on_important_dates and item.starts_on is not null
        and item.status = 'published' and item.archived_at is null
        and (control.allowed or app_private.announcement_reaches(item, actor_user_id))), '[]'::jsonb));
end;
$$;

-- Whether the reader may write a record about these places, by this author
-- (K1, K3; the second rule for a change in hours or Important Dates).
create function app_private.announcement_authorize(state app_private.actor_state, n jsonb, author uuid)
returns void
language plpgsql stable security definer
set search_path = ''
as $$
declare
  reason text := app_private.announcement_reason(state,
    app_private.announcement_places_of(state.workspace_id,
      array(select (r ->> 'location_id')::uuid from jsonb_array_elements(n -> 'locations') r),
      array(select x::uuid from jsonb_array_elements_text(n -> 'people') x)),
    author, (n ->> 'on_important_dates')::boolean or (n ->> 'hours')::boolean);
begin
  if reason is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || reason, detail = 'announcement.write';
  end if;
end;
$$;

-- The drawer as it is being filled in: what keeps it from going out, the
-- shifts it would change and their choices, the bring-back list, and how many
-- people get it. Nothing is written.
create function public.preview_announcement_service(actor_user_id uuid, target_workspace_id uuid, target_announcement_id uuid,
  target_payload jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  w uuid := target_workspace_id;
  me app_private.actor_state;
  stored public.announcements;
  shown text := 'new';
  n jsonb;
  author uuid;
  reason text;
  intent text := coalesce(nullif(target_payload ->> 'intent', ''), 'publish');
  impact jsonb := jsonb_build_object('fingerprint', null, 'shifts', '[]'::jsonb, 'quiet', '[]'::jsonb,
    'counts', jsonb_build_object('removed', 0, 'edited', 0, 'opened', 0, 'kept', 0, 'quiet', 0));
  offered jsonb := '[]'::jsonb;
  span record;
  -- Whose shifts are named: only where the writer may read the Schedule (D1);
  -- the rest are counted.
  seen uuid[];
begin
  perform app_private.authorize(actor_user_id, w, 'announcement.read');
  seen := app_private.scope_set(actor_user_id, w, 'schedule.read');
  if intent not in ('draft', 'schedule', 'publish', 'save') then
    raise exception 'valid announcement intent required' using errcode = '22023', hint = 'announcement.invalid';
  end if;
  perform app_private.announcement_release(w);
  me := app_private.actor(actor_user_id, w);
  if target_announcement_id is not null then
    select * into stored from public.announcements where id = target_announcement_id and workspace_id = w;
    if stored.id is null or not app_private.announcement_visible(me, stored) then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.write';
    end if;
    reason := app_private.announcement_reason(me, app_private.announcement_places(stored.id), stored.created_by,
      app_private.announcement_dates(stored));
    if reason is not null then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || reason, detail = 'announcement.write';
    end if;
    shown := app_private.announcement_display_status(stored);
    if shown in ('past', 'archived') then
      raise exception 'This post can''t change anymore.' using errcode = 'PT409', hint = 'announcement.read_only';
    end if;
  end if;
  author := coalesce(stored.created_by, actor_user_id);
  n := app_private.announcement_proposal(w, stored, coalesce(target_payload, '{}'::jsonb), author);
  perform app_private.announcement_authorize(me, n, author);

  if (n ->> 'hours')::boolean and n ->> 'starts_on' is not null then
    impact := app_private.announcement_impact(w, stored.id, (n ->> 'starts_on')::date, (n ->> 'ends_on')::date,
      n -> 'locations', n -> 'choices', stored.choices_saved_at);
  end if;
  if shown = 'published' then
    offered := app_private.announcement_back_rows(stored, (n ->> 'starts_on')::date, (n ->> 'ends_on')::date, n -> 'locations');
  elsif shown = 'unpublished' then
    offered := app_private.announcement_back_rows(stored, null, null, '[]'::jsonb);
  end if;
  select * into span from app_private.announcement_span(w, (n ->> 'starts_on')::date, (n ->> 'ends_on')::date,
    (n ->> 'event_from')::time, (n ->> 'event_until')::time, n ->> 'time_zone', n -> 'locations');

  return jsonb_build_object(
    'problems', app_private.announcement_problems(w, stored, n, intent),
    'fingerprint', impact -> 'fingerprint',
    'shifts', coalesce((select jsonb_agg(x order by place) from jsonb_array_elements(impact -> 'shifts') with ordinality s(x, place)
                        where (x ->> 'location_id')::uuid = any (seen)), '[]'::jsonb),
    'hidden_count', (select count(*) from jsonb_array_elements(impact -> 'shifts') x
                     where not (x ->> 'location_id')::uuid = any (seen)),
    'quiet_count', (impact -> 'counts' ->> 'quiet')::integer,
    'counts', impact -> 'counts',
    'bring_back', coalesce((select jsonb_agg(x order by place) from jsonb_array_elements(offered) with ordinality s(x, place)
                            where (x ->> 'location_id')::uuid = any (seen)), '[]'::jsonb),
    'time_zone', n ->> 'time_zone',
    'starts_at', span.starts_at,
    'ends_at', span.ends_at,
    'recipient_count', cardinality(app_private.announcement_audience(w,
      array(select x::uuid from jsonb_array_elements_text(n -> 'live_location_ids') x),
      array(select x::uuid from jsonb_array_elements_text(n -> 'people') x),
      array(select (s ->> 'employee_id')::uuid from jsonb_array_elements(impact -> 'shifts') s
            where s ->> 'outcome' <> 'kept' and s ->> 'employee_id' is not null
            union
            select change.employee_id from public.announcement_shift_changes change
            where change.announcement_id = stored.id and not change.silent and change.brought_back_at is null),
      author)));
end;
$$;

-- Save draft, Schedule, Publish, and Save changes on a published record. A
-- schedule or publish needs everything announcement_problems asks; a draft
-- only its title. Publish and Save make the Shifts tab's choices (V5) after
-- checking the list is the one the drawer showed (fingerprint), bring back
-- what was picked, and tell each person once (B1, B3).
create function public.save_announcement_service(actor_user_id uuid, target_workspace_id uuid, target_announcement_id uuid,
  target_expected_revision integer, target_payload jsonb, target_intent text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  w uuid := target_workspace_id;
  me app_private.actor_state;
  stored public.announcements;
  item public.announcements;
  shown text := 'new';
  n jsonb;
  author uuid;
  reason text;
  found jsonb;
  impact jsonb;
  offered jsonb := '[]'::jsonb;
  back jsonb := '[]'::jsonb;
  told integer := 0;
  reached uuid[] := '{}';
  content_changed boolean := true;
  reset boolean := false;
  acked uuid[] := '{}';
  earlier uuid[] := '{}';
  touched uuid[] := '{}';
  notified uuid[] := '{}';
  history_action text;
begin
  perform app_private.authorize(actor_user_id, w, 'announcement.read');
  if target_intent is null or target_intent not in ('draft', 'schedule', 'publish', 'save')
     or jsonb_typeof(coalesce(target_payload -> 'bring_back', '[]'::jsonb)) <> 'array'
     or exists (select 1 from jsonb_array_elements(coalesce(target_payload -> 'bring_back', '[]'::jsonb)) x
                where jsonb_typeof(x) <> 'string'
                   or x #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'valid announcement intent required' using errcode = '22023', hint = 'announcement.invalid';
  end if;
  -- S4 and the shifts: one record at a time, then the Schedule's own lock.
  perform pg_advisory_xact_lock(hashtextextended(w::text, 931));
  if target_intent <> 'draft' then
    perform public.availability_lock_workspace(w);
  end if;
  perform app_private.announcement_release(w);
  me := app_private.actor(actor_user_id, w);

  if target_announcement_id is not null then
    select * into stored from public.announcements where id = target_announcement_id and workspace_id = w for update;
    if stored.id is null or not app_private.announcement_visible(me, stored) then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.write';
    end if;
    reason := app_private.announcement_reason(me, app_private.announcement_places(stored.id), stored.created_by,
      app_private.announcement_dates(stored));
    if reason is not null then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || reason, detail = 'announcement.write';
    end if;
    if stored.revision is distinct from target_expected_revision then
      raise exception 'This post changed since you opened it.' using errcode = 'PT409', hint = 'announcement.changed';
    end if;
    shown := app_private.announcement_display_status(stored);
    if shown in ('past', 'archived') then
      raise exception 'This post can''t change anymore.' using errcode = 'PT409', hint = 'announcement.read_only';
    end if;
  end if;
  if not ((target_intent = 'save' and shown = 'published')
          or (target_intent <> 'save' and shown in ('new', 'draft', 'scheduled', 'publish_failed', 'unpublished'))) then
    raise exception 'This post changed since you opened it.' using errcode = 'PT409', hint = 'announcement.changed';
  end if;

  author := coalesce(stored.created_by, actor_user_id);
  n := app_private.announcement_proposal(w, stored, coalesce(target_payload, '{}'::jsonb), author);
  perform app_private.announcement_authorize(me, n, author);
  found := app_private.announcement_problems(w, stored, n, target_intent);
  if jsonb_array_length(found) > 0 then
    raise exception '%', found -> 0 ->> 'message'
      using errcode = '22023', hint = 'announcement.' || (found -> 0 ->> 'code'), detail = found -> 0 ->> 'field';
  end if;

  if target_intent in ('publish', 'save') then
    impact := app_private.announcement_impact(w, stored.id, (n ->> 'starts_on')::date, (n ->> 'ends_on')::date,
      n -> 'locations', n -> 'choices', stored.choices_saved_at);
    if (jsonb_array_length(impact -> 'shifts') > 0 or jsonb_array_length(impact -> 'quiet') > 0)
       and (target_payload ->> 'fingerprint') is distinct from (impact ->> 'fingerprint') then
      raise exception 'The shifts on these days changed. Review the Shifts tab again.'
        using errcode = 'PT409', hint = 'announcement.shifts_changed';
    end if;
  end if;
  if target_intent = 'save' then
    offered := app_private.announcement_back_rows(stored, (n ->> 'starts_on')::date, (n ->> 'ends_on')::date, n -> 'locations');
  end if;

  if stored.id is null then
    insert into public.announcements (workspace_id, title, body, time_zone, created_by, updated_by)
    values (w, n ->> 'title', n ->> 'body', n ->> 'time_zone', actor_user_id, actor_user_id)
    returning * into item;
    insert into public.announcement_changes (workspace_id, announcement_id, actor_user_id, action)
    values (w, item.id, actor_user_id, 'created');
  else
    item := stored;
    -- K4: what it says (its text, its days, what a day does at a location it
    -- already had) is content; a location or a person added or taken off is
    -- only who gets it.
    content_changed := (stored.title, stored.body, stored.category::text, stored.category_other, stored.starts_on,
        stored.ends_on, stored.event_from, stored.event_until, stored.recurrence)
      is distinct from (n ->> 'title', n ->> 'body', n ->> 'category', n ->> 'category_other', (n ->> 'starts_on')::date,
        (n ->> 'ends_on')::date, (n ->> 'event_from')::time, (n ->> 'event_until')::time, n ->> 'recurrence')
      or exists (
        select 1 from jsonb_array_elements(app_private.announcement_rows(stored.id)) was
        join jsonb_array_elements(n -> 'locations') now_row on now_row ->> 'location_id' = was ->> 'location_id'
        where (was ->> 'day', was ->> 'opens', was ->> 'closes')
          is distinct from (now_row ->> 'day', now_row ->> 'opens', now_row ->> 'closes'));
  end if;

  update public.announcements
  set title = n ->> 'title', body = n ->> 'body',
      category = (n ->> 'category')::public.announcement_category, category_other = n ->> 'category_other',
      starts_on = (n ->> 'starts_on')::date, ends_on = (n ->> 'ends_on')::date,
      event_from = (n ->> 'event_from')::time, event_until = (n ->> 'event_until')::time,
      recurrence = n ->> 'recurrence',
      on_important_dates = (n ->> 'on_important_dates')::boolean, on_calendar = (n ->> 'on_calendar')::boolean,
      on_schedule = (n ->> 'on_schedule')::boolean, ask_ack = (n ->> 'ask_ack')::boolean,
      time_zone = n ->> 'time_zone',
      publish_at = case target_intent when 'publish' then now() when 'save' then item.publish_at
                                      else (n ->> 'publish_at')::timestamptz end,
      status = case target_intent when 'draft' then 'draft' when 'schedule' then 'scheduled'
                                  else 'published' end::public.announcement_status,
      scheduled_by = case target_intent when 'schedule' then actor_user_id when 'draft' then null else item.scheduled_by end,
      published_by = case when target_intent = 'publish' then actor_user_id else item.published_by end,
      published_at = case when target_intent = 'publish' then now() else item.published_at end,
      unpublished_at = case when target_intent = 'publish' then null else item.unpublished_at end,
      shift_choices = n -> 'choices',
      choices_saved_at = case when target_intent = 'draft' then null else now() end,
      release_failed_at = null, release_error = null,
      content_revision = item.content_revision + case when content_changed and stored.id is not null then 1 else 0 end,
      revision = item.revision + case when stored.id is null then 0 else 1 end,
      updated_by = actor_user_id, updated_at = now()
  where id = item.id
  returning * into item;

  delete from public.announcement_locations where announcement_id = item.id;
  insert into public.announcement_locations (workspace_id, announcement_id, location_id, day, opens, closes)
  select w, item.id, (r ->> 'location_id')::uuid, r ->> 'day', (r ->> 'opens')::time, (r ->> 'closes')::time
  from jsonb_array_elements(n -> 'locations') r;
  delete from public.announcement_people where announcement_id = item.id;
  insert into public.announcement_people (workspace_id, announcement_id, user_id)
  select w, item.id, x::uuid from jsonb_array_elements_text(n -> 'people') x;

  if target_intent = 'save' then
    back := app_private.announcement_bring_back(actor_user_id, item,
      array(select x::uuid from jsonb_array_elements_text(coalesce(target_payload -> 'bring_back', '[]'::jsonb)) x), offered);
  end if;
  if target_intent in ('publish', 'save') then
    earlier := array(select change.id from public.announcement_shift_changes change where change.announcement_id = item.id);
    told := app_private.announcement_apply(actor_user_id, item, impact);
    reached := app_private.announcement_recipients(item);
    -- Whoever's shift this write changed hears it, whatever else holds.
    touched := array(select distinct person.user_id from public.announcement_shift_changes change
                     join public.employee_profiles person on person.id = change.employee_id
                     where change.announcement_id = item.id and not change.silent and change.brought_back_at is null
                       and not change.id = any (earlier) and person.user_id is not null);
    -- K27: acknowledgements stay unless the writer asks for them again; then
    -- everyone it reaches answers anew.
    if item.ask_ack and coalesce((target_payload ->> 'reset_acknowledgements')::boolean, false)
       and exists (select 1 from public.announcement_acknowledgements ack where ack.announcement_id = item.id) then
      update public.announcements
      set acknowledged_before = array(select distinct who from unnest(acknowledged_before || array(
            select ack.user_id from public.announcement_acknowledgements ack where ack.announcement_id = item.id)) who)
      where id = item.id returning * into item;
      delete from public.announcement_acknowledgements where announcement_id = item.id;
      reset := true;
    end if;
    acked := array(select ack.user_id from public.announcement_acknowledgements ack where ack.announcement_id = item.id);
  end if;

  if target_intent = 'publish' then
    -- K4 (3), K27: brought out again with its acknowledgements kept, it is told
    -- to whoever hasn't acknowledged; the first time, to everyone.
    notified := array(select who from unnest(reached) who where not who = any (acked) or who = any (touched));
    perform app_private.communication_withdraw(w, 'communications.announcement.available', 'announcement', item.id::text, 'superseded');
    perform app_private.announcement_deliver(actor_user_id, item, notified, 'publish');
  elsif target_intent = 'save' then
    -- Those it no longer reaches lose it (BL-534).
    if exists (select 1 from unnest(item.delivered_to) who where not who = any (reached)) then
      perform app_private.communication_withdraw(w, 'communications.announcement.available', 'announcement', item.id::text,
        'cancelled', array(select who from unnest(item.delivered_to) who where not who = any (reached)));
    end if;
    -- K4: new people are told; a change in what it says is told to whoever
    -- hasn't acknowledged it (everyone, once asked again, K27); a changed or
    -- returned shift to its person. B3: the new notice takes the old one's place.
    notified := array(select who from unnest(reached) who
                      where not who = any (item.delivered_to) or who = any (touched)
                         or ((content_changed or reset) and not who = any (acked))
                         or who = any (array(select (x ->> 'employee_user_id')::uuid from jsonb_array_elements(back) x
                                             where not coalesce((x ->> 'silent')::boolean, false))));
    if cardinality(notified) > 0 then
      perform app_private.communication_withdraw(w, 'communications.announcement.available', 'announcement', item.id::text,
        'superseded', notified);
      perform app_private.announcement_deliver(actor_user_id, item, notified, 'publish', back);
    end if;
    perform app_private.announcement_deliver(actor_user_id, item, array(
      select distinct (x ->> 'employee_user_id')::uuid from jsonb_array_elements(back) x
      where x ->> 'employee_user_id' is not null and not coalesce((x ->> 'silent')::boolean, false)
        and not (x ->> 'employee_user_id')::uuid = any (reached)), 'cancel', back);
  end if;
  if target_intent in ('publish', 'save') then
    update public.announcements set delivered_to = reached where id = item.id returning * into item;
  end if;

  history_action := case
    when target_intent = 'draft' and stored.status = 'scheduled' then 'unscheduled'
    when target_intent = 'draft' then 'saved'
    when target_intent = 'schedule' then 'scheduled'
    when target_intent = 'publish' then 'published'
    else 'updated' end;
  insert into public.announcement_changes (workspace_id, announcement_id, actor_user_id, action, detail)
  values (w, item.id, actor_user_id, history_action, jsonb_strip_nulls(jsonb_build_object(
    'publish_at', case when target_intent = 'schedule' then item.publish_at end,
    'rescheduled', case when target_intent = 'schedule' and stored.status = 'scheduled' then true end,
    'shift_changes', nullif(told, 0),
    'brought_back', nullif(jsonb_array_length(back), 0),
    'told', case when target_intent in ('publish', 'save') then cardinality(notified) end,
    'acknowledgements_reset', case when reset then true end)));
  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (w, actor_user_id, 'announcement.' || history_action, 'announcement', item.id::text,
    jsonb_build_object('content_changed', content_changed, 'shift_changes', told, 'brought_back', jsonb_array_length(back)));

  return jsonb_build_object('status', item.status, 'display_status', app_private.announcement_display_status(item),
    'announcement_id', item.id, 'revision', item.revision, 'recipient_count', cardinality(item.delivered_to),
    'shift_changes', told, 'brought_back', jsonb_array_length(back));
end;
$$;

-- Unschedule (back to Draft), Unpublish (two clicks on the screen; the people
-- told hear it's cancelled), Archive (Draft, Unpublished or Past only, K8),
-- Bring back on an unpublished record, and Remind whoever hasn't acknowledged.
create function public.set_announcement_state_service(actor_user_id uuid, target_workspace_id uuid, target_announcement_id uuid,
  target_expected_revision integer, target_action text, target_bring_back uuid[] default '{}'::uuid[])
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  w uuid := target_workspace_id;
  me app_private.actor_state;
  item public.announcements;
  shown text;
  reason text;
  told integer := 0;
  back jsonb := '[]'::jsonb;
  people uuid[];
begin
  perform app_private.authorize(actor_user_id, w, 'announcement.read');
  if target_action is null or target_action not in ('unschedule', 'unpublish', 'archive', 'bring_back', 'remind') then
    raise exception 'valid announcement action required' using errcode = '22023', hint = 'announcement.invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(w::text, 931));
  if target_action = 'bring_back' then
    perform public.availability_lock_workspace(w);
  end if;
  perform app_private.announcement_release(w);
  me := app_private.actor(actor_user_id, w);
  select * into item from public.announcements where id = target_announcement_id and workspace_id = w for update;
  if item.id is null or not app_private.announcement_visible(me, item) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.write';
  end if;
  reason := app_private.announcement_reason(me, app_private.announcement_places(item.id), item.created_by,
    app_private.announcement_dates(item));
  if reason is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || reason, detail = 'announcement.write';
  end if;
  shown := app_private.announcement_display_status(item);
  -- A past post can only be archived; an archived one is done (Mert, 2026-10-12).
  if (shown = 'past' and target_action <> 'archive') or shown = 'archived' then
    raise exception 'This post can''t change anymore.' using errcode = 'PT409', hint = 'announcement.read_only';
  end if;
  if item.revision is distinct from target_expected_revision
     or (target_action = 'unschedule' and shown not in ('scheduled', 'publish_failed'))
     or (target_action = 'unpublish' and shown <> 'published')
     or (target_action = 'archive' and shown not in ('draft', 'unpublished', 'past'))
     or (target_action = 'bring_back' and shown <> 'unpublished')
     or (target_action = 'remind' and (shown <> 'published' or not item.ask_ack)) then
    raise exception 'This post changed since you opened it.' using errcode = 'PT409', hint = 'announcement.changed';
  end if;

  if target_action = 'unschedule' then
    update public.announcements
    set status = 'draft', scheduled_by = null, choices_saved_at = null, release_failed_at = null, release_error = null
    where id = item.id;
  elsif target_action = 'unpublish' then
    perform app_private.communication_withdraw(w, 'communications.announcement.available', 'announcement', item.id::text, 'cancelled');
    told := app_private.announcement_deliver(actor_user_id, item, item.delivered_to, 'cancel');
    update public.announcements set status = 'unpublished', unpublished_at = now(), delivered_to = '{}' where id = item.id;
  elsif target_action = 'archive' then
    if cardinality(item.delivered_to) > 0 then
      perform app_private.communication_withdraw(w, 'communications.announcement.available', 'announcement', item.id::text, 'cancelled');
    end if;
    update public.announcements set archived_at = now(), delivered_to = '{}' where id = item.id;
  elsif target_action = 'bring_back' then
    back := app_private.announcement_bring_back(actor_user_id, item, target_bring_back,
      app_private.announcement_back_rows(item, null, null, '[]'::jsonb));
    if jsonb_array_length(back) = 0 then
      raise exception 'Pick the shifts to bring back.' using errcode = '22023', hint = 'announcement.invalid';
    end if;
    people := array(select distinct (x ->> 'employee_user_id')::uuid from jsonb_array_elements(back) x
                    where x ->> 'employee_user_id' is not null and not coalesce((x ->> 'silent')::boolean, false));
    if cardinality(people) > 0 then
      perform app_private.communication_withdraw(w, 'communications.announcement.available', 'announcement', item.id::text,
        'superseded', people);
      told := app_private.announcement_deliver(actor_user_id, item, people, 'cancel', back);
    end if;
  else
    people := array(select who from unnest(app_private.announcement_respondents(item)) who
                    where not exists (select 1 from public.announcement_acknowledgements ack
                                      where ack.announcement_id = item.id and ack.user_id = who));
    if cardinality(people) = 0 then
      raise exception 'Everyone acknowledged.' using errcode = 'PT409', hint = 'announcement.changed';
    end if;
    perform app_private.communication_withdraw(w, 'communications.announcement.available', 'announcement', item.id::text,
      'superseded', people);
    told := app_private.announcement_deliver(actor_user_id, item, people, 'publish');
  end if;

  update public.announcements set revision = revision + 1, updated_by = actor_user_id, updated_at = now()
  where id = item.id returning * into item;
  insert into public.announcement_changes (workspace_id, announcement_id, actor_user_id, action, detail)
  values (w, item.id, actor_user_id,
    case target_action when 'unschedule' then 'unscheduled' when 'unpublish' then 'unpublished' when 'archive' then 'archived'
                       when 'bring_back' then 'brought_back' else 'reminded' end,
    jsonb_strip_nulls(jsonb_build_object('told', case when target_action in ('unpublish', 'bring_back', 'remind') then told end,
      'brought_back', nullif(jsonb_array_length(back), 0))));
  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (w, actor_user_id, 'announcement.' || case target_action when 'unschedule' then 'unscheduled'
      when 'unpublish' then 'unpublished' when 'archive' then 'archived' when 'bring_back' then 'brought_back' else 'reminded' end,
    'announcement', item.id::text, jsonb_build_object('told', told, 'brought_back', jsonb_array_length(back)));
  return jsonb_build_object('status', item.status, 'display_status', app_private.announcement_display_status(item),
    'announcement_id', item.id, 'revision', item.revision, 'archived_at', item.archived_at, 'told', told);
end;
$$;

-- Acknowledge: only on a published record that asks for it, by someone it is
-- out to and who ranks below whoever published it (K22).
create or replace function public.acknowledge_announcement_service(actor_user_id uuid, target_workspace_id uuid,
  target_announcement_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  item public.announcements;
  acknowledged timestamptz;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'announcement.acknowledge');
  perform app_private.announcement_release(target_workspace_id);
  select * into item from public.announcements where id = target_announcement_id and workspace_id = target_workspace_id;
  if item.id is null or not item.ask_ack or app_private.announcement_display_status(item) <> 'published'
     or not app_private.announcement_reaches(item, actor_user_id)
     or not actor_user_id = any (app_private.announcement_respondents(item)) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.acknowledge';
  end if;
  insert into public.announcement_acknowledgements (workspace_id, announcement_id, user_id)
  values (target_workspace_id, target_announcement_id, actor_user_id)
  on conflict (announcement_id, user_id) do nothing;
  select ack.acknowledged_at into acknowledged from public.announcement_acknowledgements ack
  where ack.announcement_id = target_announcement_id and ack.user_id = actor_user_id;
  return jsonb_build_object('status', 'saved', 'acknowledged_at', acknowledged);
end;
$$;

-- 8. On their own -------------------------------------------------------------------------

-- A yearly record that went Past opens next year's copy: the same post on the
-- next day by its repeat, Scheduled with the same lead before it starts, by
-- whoever published this year's (K22; when they are gone the owner hears it
-- couldn't go out, K21). Shifts written to those days from now on keep (V4).
create function app_private.announcement_repeat(item public.announcements)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  next_item public.announcements;
  next_day date := app_private.announcement_next_year(item.starts_on, item.recurrence);
  lead_time interval := greatest(coalesce((select moment.starts_at from app_private.announcement_moments(item) moment)
    - coalesce(item.published_at, item.publish_at), interval '0'), interval '1 minute');
  next_start timestamptz;
begin
  if next_day is null or exists (select 1 from public.announcements other where other.repeats_from = item.id) then
    return null;
  end if;
  insert into public.announcements (workspace_id, title, body, category, category_other, starts_on, ends_on, event_from,
    event_until, recurrence, on_important_dates, on_calendar, on_schedule, ask_ack, time_zone, status, publish_at,
    scheduled_by, repeats_from, choices_saved_at, created_by, updated_by)
  values (item.workspace_id, item.title, item.body, item.category, item.category_other, next_day,
    next_day + (item.ends_on - item.starts_on), item.event_from, item.event_until, item.recurrence, item.on_important_dates,
    item.on_calendar, item.on_schedule, item.ask_ack, item.time_zone, 'scheduled', now(),
    coalesce(item.published_by, item.scheduled_by, item.created_by), item.id, now(), item.created_by, item.created_by)
  returning * into next_item;
  insert into public.announcement_locations (workspace_id, announcement_id, location_id, day, opens, closes)
  select next_item.workspace_id, next_item.id, target.location_id, target.day, target.opens, target.closes
  from public.announcement_locations target
  join public.locations location on location.id = target.location_id and location.archived_at is null
  where target.announcement_id = item.id;
  insert into public.announcement_people (workspace_id, announcement_id, user_id)
  select next_item.workspace_id, next_item.id, person.user_id
  from public.announcement_people person where person.announcement_id = item.id;
  next_start := (select moment.starts_at from app_private.announcement_moments(next_item) moment);
  update public.announcements set publish_at = greatest(next_start - lead_time, now()) where id = next_item.id;
  insert into public.announcement_changes (workspace_id, announcement_id, actor_user_id, action, detail)
  values (next_item.workspace_id, next_item.id, null, 'repeated',
    jsonb_build_object('from', item.id, 'scheduled_by', next_item.scheduled_by));
  return next_item.id;
end;
$$;

-- The cron (announcements-due, every minute) and every read: a scheduled
-- record whose time came publishes with its scheduler's authority at that
-- moment (K22) and makes its shift choices then (V5). One that can't (no
-- authority, or it started first) is Couldn't publish, once, and its scheduler
-- hears it (K21); anything else is tried again the next minute. A published
-- record that is over leaves the inboxes, and a yearly one opens next year's.
create or replace function app_private.announcement_release(w uuid default null)
returns integer
language plpgsql security definer
set search_path = ''
as $$
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
        impact := app_private.announcement_impact(place, item.id, item.starts_on, item.ends_on,
          app_private.announcement_rows(item.id), item.shift_choices, item.choices_saved_at);
        update public.announcements
        set status = 'published', published_at = item.publish_at, published_by = publisher, unpublished_at = null,
            release_error = null, revision = revision + 1
        where id = item.id returning * into item;
        told := app_private.announcement_apply(publisher, item, impact);
        reached := app_private.announcement_recipients(item);
        perform app_private.communication_withdraw(place, 'communications.announcement.available', 'announcement',
          item.id::text, 'superseded');
        perform app_private.announcement_deliver(publisher, item, reached, 'publish');
        update public.announcements set delivered_to = reached where id = item.id;
        insert into public.announcement_changes (workspace_id, announcement_id, actor_user_id, action, detail)
        values (place, item.id, publisher, 'published', jsonb_strip_nulls(jsonb_build_object('auto', true,
          'shift_changes', nullif(told, 0), 'told', cardinality(reached))));
        released := released + 1;
      exception when others then
        get stacked diagnostics failure = returned_sqlstate, failure_hint = pg_exception_hint, failure_text = message_text;
        if failure = '42501' or failure_hint = 'announcement.too_late' then
          update public.announcements
          set release_failed_at = now(), release_error = left(failure || ': ' || failure_text, 2000), revision = revision + 1
          where id = item.id returning * into item;
          insert into public.announcement_changes (workspace_id, announcement_id, actor_user_id, action, detail)
          values (place, item.id, null, 'publish_failed',
            jsonb_build_object('code', case when failure = '42501' then 'not_allowed' else 'too_late' end));
          begin
            perform app_private.announcement_tell_failed(item, case when failure = '42501'
              then 'Whoever scheduled it can''t publish it there anymore. Open it to publish it yourself or change it.'
              else 'It started before it could go out. Open it to change its day or archive it.' end);
          exception when others then
            raise warning 'announcement % failure notice did not go out: %', item.id, sqlerrm;
          end;
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
          perform app_private.communication_withdraw(place, 'communications.announcement.available', 'announcement',
            item.id::text, 'cancelled');
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

-- 9. The Schedule reads the record --------------------------------------------------------

-- A shift is flagged when its day is Closed, or has Short hours and the shift
-- is not inside them (closure_covers). Managers see what is scheduled too;
-- an employee only what is out.

-- The employee board.
select pg_temp.patch('public.get_employee_schedule_board_service(uuid, uuid, date)'::regprocedure, array[
  $t$              and closure.closed_date = shift.scheduled_date and closure.is_all_day
$t$,
  $t$              and closure.closed_date = shift.scheduled_date and closure.status <> 'scheduled'
              and app_private.closure_covers(closure.kind, closure.opens, closure.closes, shift.start_time, shift.end_time)
$t$,
  $t$1$t$,
  $t$        'is_all_day', closure.is_all_day
      ) order by closure.closed_date, closure.title)
      from public.schedule_closures closure
      join allowed_locations location on location.id = closure.location_id
      where closure.closed_date between resolved_week_start and resolved_week_start + 6
$t$,
  $t$        'is_all_day', closure.is_all_day, 'kind', closure.kind,
        'opens', to_char(closure.opens, 'HH24:MI'), 'closes', to_char(closure.closes, 'HH24:MI'),
        'announcement_id', closure.announcement_id
      ) order by closure.closed_date, closure.title)
      from public.schedule_closures closure
      join allowed_locations location on location.id = closure.location_id
      where closure.closed_date between resolved_week_start and resolved_week_start + 6
        and closure.status <> 'scheduled'
$t$,
  $t$1$t$,
  $t$    'important_dates', '[]'::jsonb
$t$,
  $t$    -- Records on the Schedule that are out to the employee and touch the week,
    -- one row per their checked location; a record for no location is theirs
    -- wherever they work. A yearly record's next year is its own record.
    'important_dates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id, 'location_id', place.location_id, 'title', item.title,
        'category', item.category, 'category_other', item.category_other,
        'starts_on', item.starts_on, 'ends_on', coalesce(item.ends_on, item.starts_on),
        'status', item.status, 'publish_at', item.publish_at, 'day', place.day,
        'opens', to_char(place.opens, 'HH24:MI'), 'closes', to_char(place.closes, 'HH24:MI'),
        'event_from', to_char(item.event_from, 'HH24:MI'), 'event_until', to_char(item.event_until, 'HH24:MI')
      ) order by item.starts_on, item.title, place.location_id)
      from public.announcements item
      cross join lateral (
        select target.location_id, target.day, target.opens, target.closes
        from public.announcement_locations target
        join allowed_locations location on location.id = target.location_id
        where target.announcement_id = item.id
        union all
        select null::uuid, 'open', null::time, null::time
        where not exists (
          select 1 from public.announcement_locations target
          join public.locations location on location.id = target.location_id and location.archived_at is null
          where target.announcement_id = item.id)
      ) place
      where item.workspace_id = target_workspace_id and item.status = 'published' and item.archived_at is null
        and item.on_schedule and item.starts_on is not null
        and item.starts_on <= resolved_week_start + 6 and resolved_week_start <= coalesce(item.ends_on, item.starts_on)
        and app_private.announcement_reaches(item, actor_user_id)
    ), '[]'::jsonb)
$t$,
  $t$1$t$
]);

-- The edit session.
select pg_temp.patch('public.get_schedule_edit_session_service(uuid, uuid, uuid)'::regprocedure, array[
  $t$              and closure.closed_date = shift.scheduled_date and closure.is_all_day
$t$,
  $t$              and closure.closed_date = shift.scheduled_date
              and app_private.closure_covers(closure.kind, closure.opens, closure.closes, shift.start_time, shift.end_time)
$t$,
  $t$1$t$
]);

-- The manager's week.
select pg_temp.patch('public.get_schedule_read_model_service(uuid, uuid, date)'::regprocedure, array[
  $t$              and closure.closed_date = shift.scheduled_date and closure.is_all_day
$t$,
  $t$              and closure.closed_date = shift.scheduled_date
              and app_private.closure_covers(closure.kind, closure.opens, closure.closes, shift.start_time, shift.end_time)
$t$,
  $t$1$t$,
  $t$        'is_all_day', closure.is_all_day
      ) order by closure.closed_date, closure.title)
$t$,
  $t$        'is_all_day', closure.is_all_day, 'kind', closure.kind,
        'opens', to_char(closure.opens, 'HH24:MI'), 'closes', to_char(closure.closes, 'HH24:MI'),
        'status', closure.status, 'publish_at', closure.publish_at, 'on_schedule', closure.on_schedule,
        'announcement_id', closure.announcement_id
      ) order by closure.closed_date, closure.title)
$t$,
  $t$1$t$,
  $t$    -- Published dates that touch the week, one row per reachable location;
    -- a date for no location is everyone's (B-7). An annual date repeats from
    -- its first year to two years ahead, 29 Feb falling on 28 Feb.
    'important_dates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'location_id', place.id, 'title', d.title, 'type', d.type,
        'starts_on', d.starts_on, 'ends_on', d.ends_on, 'recurrence', d.recurrence
      ) order by d.starts_on, d.title, place.id)
      from public.important_dates d
      cross join lateral (
        select coalesce(nullif(d.location_ids, '{}'), array_remove(array[d.location_id], null)) ids
      ) named
      cross join lateral (
        select location.id from allowed_locations location where location.id = any (named.ids)
        union all select null::uuid where cardinality(named.ids) = 0
      ) place
      where d.workspace_id = target_workspace_id and d.archived_at is null
        and d.status = 'published' and d.affects_scheduling
        and case when d.recurrence = 'annual' then exists (
          select 1 from generate_series(resolved_week_start, resolved_week_start + 6, interval '1 day') day(at)
          cross join lateral (values (extract(year from day.at)::integer - 1), (extract(year from day.at)::integer)) y(year)
          cross join lateral (select y.year - extract(year from d.starts_on)::integer k) shift
          where shift.k >= 0
            and y.year <= greatest(extract(year from current_date)::integer + 2, extract(year from d.starts_on)::integer)
            and day.at::date between d.starts_on + make_interval(years => shift.k) and d.ends_on + make_interval(years => shift.k))
        else d.starts_on <= resolved_week_start + 6 and resolved_week_start <= d.ends_on end
    ), '[]'::jsonb)
$t$,
  $t$    -- Records on the Schedule that touch the week, published or scheduled (a
    -- manager sees what is coming), one row per reachable checked location. A
    -- record about no live location (only for people added by hand) is on the
    -- week of whoever it is out to or may change it, never everyone's. A yearly
    -- record's next year is its own record.
    'important_dates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id, 'location_id', place.location_id, 'title', item.title,
        'category', item.category, 'category_other', item.category_other,
        'starts_on', item.starts_on, 'ends_on', coalesce(item.ends_on, item.starts_on),
        'status', item.status, 'publish_at', item.publish_at, 'day', place.day,
        'opens', to_char(place.opens, 'HH24:MI'), 'closes', to_char(place.closes, 'HH24:MI'),
        'event_from', to_char(item.event_from, 'HH24:MI'), 'event_until', to_char(item.event_until, 'HH24:MI')
      ) order by item.starts_on, item.title, place.location_id)
      from public.announcements item
      cross join lateral (
        select target.location_id, target.day, target.opens, target.closes
        from public.announcement_locations target
        join allowed_locations location on location.id = target.location_id
        where target.announcement_id = item.id
        union all
        select null::uuid, 'open', null::time, null::time
        where not exists (
          select 1 from public.announcement_locations target
          join public.locations location on location.id = target.location_id and location.archived_at is null
          where target.announcement_id = item.id)
          and (app_private.announcement_reaches(item, actor_user_id)
            or app_private.announcement_reason(app_private.actor(actor_user_id, target_workspace_id),
                 app_private.announcement_places(item.id), item.created_by, app_private.announcement_dates(item)) is null)
      ) place
      where item.workspace_id = target_workspace_id and item.status in ('published', 'scheduled')
        and item.archived_at is null and item.on_schedule and item.starts_on is not null
        and item.starts_on <= resolved_week_start + 6 and resolved_week_start <= coalesce(item.ends_on, item.starts_on)
    ), '[]'::jsonb)
$t$,
  $t$1$t$
]);

-- The week's shift list and its ghosts.
select pg_temp.patch('public.list_schedule_weekly_shifts_service(uuid, uuid, date, uuid[], uuid, boolean)'::regprocedure, array[
  $t$            and closure.closed_date = shift.scheduled_date
            and closure.is_all_day
$t$,
  $t$            and closure.closed_date = shift.scheduled_date
            and app_private.closure_covers(closure.kind, closure.opens, closure.closes, shift.start_time, shift.end_time)
$t$,
  $t$2$t$
]);

-- Publishing's findings.
select pg_temp.patch('public.preview_schedule_publication_service(uuid, uuid, uuid, uuid[], uuid[], boolean)'::regprocedure, array[
  $t$      shift.location_name || ' is closed on ' || shift.scheduled_date::text || '.'
    from next_shift shift
    where exists (
      select 1 from public.schedule_closures closure
      where closure.location_id = shift.location_id
        and closure.closed_date = shift.scheduled_date and closure.is_all_day
    )
$t$,
  $t$      shift.location_name || case hit.kind when 'closed' then ' is closed on ' else ' has short hours on ' end
        || shift.scheduled_date::text || '.'
    from next_shift shift
    cross join lateral (
      select closure.kind from public.schedule_closures closure
      where closure.location_id = shift.location_id
        and closure.closed_date = shift.scheduled_date
        and app_private.closure_covers(closure.kind, closure.opens, closure.closes, shift.start_time, shift.end_time)
      order by closure.kind = 'closed' desc limit 1
    ) hit
$t$,
  $t$1$t$
]);

-- The one assessment every assignment passes.
select pg_temp.patch('public.assess_weekly_shift_availability(uuid, uuid, jsonb)'::regprocedure, array[
  $t$   and day between c.closed_date and coalesce(c.end_date,c.closed_date)
   and (c.is_all_day or (shift->>'shift_type_id')::uuid=any(c.shift_type_ids))) then
   reasons:=reasons||jsonb_build_array(jsonb_build_object('code','closed_location','message','Location or shift type is closed on this date.','definite',true));
$t$,
  $t$   and c.closed_date=day and app_private.closure_covers(c.kind,c.opens,c.closes,start_clock,end_clock)) then
   reasons:=reasons||jsonb_build_array(jsonb_build_object('code','closed_location','message','Location is closed or has short hours at this time.','definite',true));
$t$,
  $t$1$t$
]);

-- Home shows what is out now.
select pg_temp.patch('public.get_workspace_dashboard_service(uuid, uuid)'::regprocedure, array[
  $t$      -- K28: what is live; archived, expired and couldn't-publish stay in the list only.
      where value->>'display_status' in ('published', 'scheduled') and value->>'archived_at' is null
        and (value->>'publish_at')::timestamptz <= now() limit 5) item), '[]'::jsonb),
$t$,
  $t$      -- K28: what is live; scheduled, past, unpublished and archived stay in the list only.
      where value->>'display_status' = 'published' limit 5) item), '[]'::jsonb),
$t$,
  $t$1$t$
]);


-- 10. Who may call what --------------------------------------------------------------------

-- Nothing here is for a browser: the API calls the services as service_role.
do $grants$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure signature, p.pronamespace = 'public'::regnamespace entry_point
    from pg_proc p
    where (p.pronamespace = 'app_private'::regnamespace
           and (p.proname like 'announcement\_%' or p.proname in ('closure_covers', 'closure_reason')))
       or (p.pronamespace = 'public'::regnamespace
           and p.proname in ('get_announcements_service', 'get_announcement_service', 'get_important_dates_service',
             'preview_announcement_service', 'save_announcement_service', 'set_announcement_state_service',
             'acknowledge_announcement_service'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
    if fn.entry_point then
      execute format('grant execute on function %s to service_role', fn.signature);
    end if;
  end loop;
end
$grants$;
