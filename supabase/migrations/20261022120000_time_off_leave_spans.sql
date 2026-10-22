-- Time off rebuild D1a (KARARLAR S-239): one place says when a person is away.
--
-- app_private.leave_spans(workspace, people, window) returns each person's
-- time off that touches the window: approved time off as what is left of it
-- today (a revoke, a cancellation or a shortening has taken its hours out),
-- and a request waiting for a decision as the hours asked, marked pending.
-- This slice reads only today's tables (schedule_time_off_requests and its
-- segments, through time_off_effective_ranges); the new time_off_requests
-- table joins it later as a union, and the old part goes last.
--
-- Its readers move onto it with the same answers:
--   assess_weekly_shift_availability (the approved_time_off rule is untouched),
--   schedule_week_availability (leave_intervals), the publish preflight's
--   pending time off note, announcement_back_rows ("has approved time off").
-- Two answers change, both because the old read looked at the asked days:
--   Lineup's Add Staff list called a revoked or a shortened time off "Time off";
--   Home's Coming up drew a shortened time off at its first length.
--
-- A null window or a null list of people reads nothing (strict); '(,)' reads
-- everything. segment_id and revision are there for the assessment's leave
-- evidence (one entry per piece, as today); zone is the time zone the time
-- off was asked in, for reading a span as dates.

create or replace function app_private.leave_spans(target_workspace uuid, target_people uuid[], target_window tstzrange)
returns table (employee_id uuid, request_id uuid, segment_id uuid, revision integer, span tstzrange, pending boolean, zone text)
language sql
stable
strict
set search_path = ''
as $$
  select req.employee_id, req.id, seg.id, req.revision, piece.span, req.status = 'pending', seg.time_timezone
  from public.schedule_time_off_requests req
  join public.schedule_time_off_segments seg on seg.request_id = req.id and seg.workspace_id = req.workspace_id
  -- What time_off_effective_ranges says, without its three calls where nothing was given back: a
  -- pending request's hours are the hours asked; an approved period nothing cancels is all there.
  cross join lateral unnest(case
    when req.status = 'pending' then tstzmultirange(tstzrange(seg.starts_at, seg.ends_at, '[)'))
    when seg.status <> 'approved' then '{}'::tstzmultirange
    when not exists (select 1 from public.time_off_cancellation_periods cp where cp.parent_segment_id = seg.id)
      then tstzmultirange(tstzrange(seg.starts_at, seg.ends_at, '[)'))
    else public.time_off_effective_ranges(seg.id) end) piece(span)
  where req.workspace_id = leave_spans.target_workspace
    and req.employee_id = any (leave_spans.target_people)
    and req.request_type = 'time_off'
    and req.status in ('approved', 'pending')
    -- A period is at most a day long (time_off_resolve_period) and its date is
    -- local: three days either side finds every one that can touch the window.
    and (lower_inf(leave_spans.target_window)
      or seg.segment_date >= (lower(leave_spans.target_window) at time zone 'UTC')::date - 3)
    and (upper_inf(leave_spans.target_window)
      or seg.segment_date <= (upper(leave_spans.target_window) at time zone 'UTC')::date + 3)
    and tstzrange(seg.starts_at, seg.ends_at, '[)') && leave_spans.target_window
    and piece.span && leave_spans.target_window;
$$;

revoke all on function app_private.leave_spans(uuid, uuid[], tstzrange) from public;

CREATE OR REPLACE FUNCTION "app_private"."announcement_back_rows"("item" "public"."announcements", "first_day" "date", "last_day" "date", "day_rows" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
        select 1 from app_private.leave_spans(shaped.workspace_id, array[shaped.employee_id], shaped.span) away
        where not away.pending)
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

CREATE OR REPLACE FUNCTION "app_private"."schedule_week_availability"("target_workspace_id" "uuid", "target_week_start" "date", "target_employee_ids" "uuid"[], "target_location_ids" "uuid"[], "with_reminders" boolean DEFAULT true) RETURNS TABLE("employee_id" "uuid", "location_id" "uuid", "unavailable" "tstzmultirange", "leave" "tstzmultirange", "projection" "jsonb")
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
with location_zone as (
  select l.id, l.name, l.timezone, app_private.timezone_name_valid(l.timezone) as zone_ok
  from public.locations l
  where l.workspace_id = target_workspace_id and l.id = any(target_location_ids)
), zone as (
  select distinct z.timezone as zone_name from location_zone z where z.zone_ok
), piece as (
  -- Two four-day pieces, as the offset helper is bounded to eight physical
  -- days and a fall-back week is eight days and an hour.
  select z.zone_name,
    tstzrange((target_week_start + o.offset_days)::timestamp at time zone z.zone_name,
              (target_week_start + o.offset_days + 4)::timestamp at time zone z.zone_name, '[)') as span
  from zone z cross join (values (0), (4)) o(offset_days)
), segment as (
  select p.zone_name, s.utc_span, s.offset_seconds
  from piece p cross join lateral public.availability_offset_segments(p.span, p.zone_name) s
), mark as (
  select e.employee_id, false as reminder, e.preference, public.weekly_preference_valid(e.preference) as valid
  from public.employee_weekly_preferences e
  where e.workspace_id = target_workspace_id and e.employee_id = any(target_employee_ids)
  union all
  select m.employee_id, true, m.preference, public.weekly_preference_valid(m.preference)
  from public.manager_weekly_reminders m
  where with_reminders and m.workspace_id = target_workspace_id and m.employee_id = any(target_employee_ids) and m.enabled
), mark_day as (
  select m.employee_id, m.reminder, d.value as rule
  from mark m cross join lateral jsonb_array_elements(case when m.valid then m.preference -> 'days' else '[]'::jsonb end) d
), clock as (
  -- Availability is hours only: a whole day, or the day's one range.
  select md.employee_id, md.reminder, (md.rule ->> 'day')::integer as dow,
    time '00:00' as start_clock, time '24:00' as end_clock
  from mark_day md
  where coalesce((md.rule ->> 'all_day')::boolean, false)
  union all
  select md.employee_id, md.reminder, (md.rule ->> 'day')::integer,
    (r.value ->> 'start')::time, (r.value ->> 'end')::time
  from mark_day md
  cross join lateral jsonb_array_elements(md.rule -> 'ranges') r
  where not coalesce((md.rule ->> 'all_day')::boolean, false)
), broken as (
  -- A mark that cannot be read makes the employee's week unknown rather than
  -- partly drawn.
  select m.employee_id from mark m where not m.valid
), local_day as (
  select s.zone_name, s.utc_span, s.offset_seconds, day::date as local_date
  from segment s
  cross join lateral generate_series(
    (((lower(s.utc_span) at time zone 'UTC') + make_interval(secs => s.offset_seconds))::date - 1)::timestamp,
    (((upper(s.utc_span) at time zone 'UTC') + make_interval(secs => s.offset_seconds))::date)::timestamp,
    interval '1 day') day
), unavailable_piece as (
  select c.employee_id, c.reminder, ld.zone_name,
    tstzrange(((ld.local_date + c.start_clock) at time zone 'UTC') - make_interval(secs => ld.offset_seconds),
              ((ld.local_date + c.end_clock + case when c.end_clock < c.start_clock then interval '1 day' else interval '0' end) at time zone 'UTC')
                - make_interval(secs => ld.offset_seconds), '[)') * ld.utc_span as span
  from local_day ld
  join clock c on c.dow = extract(dow from ld.local_date)::integer
), unavailable as (
  -- Unavailable is the employee's own marks; a manager's note is kept apart,
  -- only a reminder (M12).
  select u.employee_id, u.zone_name, range_agg(u.span) filter (where not u.reminder) as spans,
    range_agg(u.span) filter (where u.reminder) as note_spans
  from unavailable_piece u
  where not isempty(u.span)
  group by u.employee_id, u.zone_name
), leave_target as (
  select z.zone_name,
    tstzrange(target_week_start::timestamp at time zone z.zone_name, (target_week_start + 8)::timestamp at time zone z.zone_name, '[)') as span
  from zone z
), leave_piece as materialized (
  -- Read once for the week and a day either side, whatever the zones (UTC-12 to UTC+14).
  select away.employee_id, away.span
  from app_private.leave_spans(target_workspace_id, target_employee_ids,
    tstzrange((target_week_start - 1)::timestamp at time zone 'UTC', (target_week_start + 9)::timestamp at time zone 'UTC', '[)')) away
  where not away.pending
), leave as (
  select lp.employee_id, lt.zone_name, range_agg(lp.span * lt.span) as spans
  from leave_target lt
  join leave_piece lp on lp.span && lt.span
  group by lp.employee_id, lt.zone_name
), clock_segments as (
  select s.zone_name,
    jsonb_agg(jsonb_build_object('start_at', lower(s.utc_span), 'end_at', upper(s.utc_span), 'offset_seconds', s.offset_seconds)
      order by lower(s.utc_span)) as segments
  from segment s
  group by s.zone_name
), day_span as (
  select z.zone_name, target_week_start + i as work_date,
    tstzrange((target_week_start + i)::timestamp at time zone z.zone_name, (target_week_start + i + 1)::timestamp at time zone z.zone_name, '[)') as span
  from zone z cross join generate_series(0, 6) i
), employee_zone as (
  -- Everything but the location's own name is the same for every location in
  -- a time zone, so it is built once per employee and zone.
  select e.employee_id, z.zone_name,
    coalesce(u.spans, '{}'::tstzmultirange) as unavailable,
    coalesce(lv.spans, '{}'::tstzmultirange) as leave,
    jsonb_build_object(
      'status', 'ready',
      'unavailable_intervals', public.availability_ranges_json(coalesce(u.spans, '{}'::tstzmultirange)),
      'employee_intervals', public.availability_ranges_json(coalesce(u.spans, '{}'::tstzmultirange)),
      -- The note's hours, for the card shown while writing; the caller keeps
      -- them only for whoever may read the note.
      'note_intervals', public.availability_ranges_json(coalesce(u.note_spans, '{}'::tstzmultirange)),
      'leave_intervals', public.availability_ranges_json(coalesce(lv.spans, '{}'::tstzmultirange)),
      'clock_segments', cs.segments,
      'days', (select jsonb_agg(jsonb_build_object(
                 'date', ds.work_date,
                 'has_unavailable', coalesce(u.spans, '{}'::tstzmultirange) && ds.span,
                 'all_day', coalesce(u.spans, '{}'::tstzmultirange) @> ds.span) order by ds.work_date)
               from day_span ds where ds.zone_name = z.zone_name)) as body
  from unnest(target_employee_ids) e(employee_id)
  cross join zone z
  left join unavailable u on u.employee_id = e.employee_id and u.zone_name = z.zone_name
  left join leave lv on lv.employee_id = e.employee_id and lv.zone_name = z.zone_name
  left join clock_segments cs on cs.zone_name = z.zone_name
  where not exists (select 1 from broken b where b.employee_id = e.employee_id)
)
select e.employee_id, lz.id, ez.unavailable, ez.leave,
  jsonb_build_object('location_id', lz.id, 'location_name', lz.name, 'timezone', lz.timezone, 'week_start', target_week_start)
  || coalesce(ez.body, jsonb_build_object('status', 'unknown', 'unavailable_intervals', '[]'::jsonb, 'employee_intervals', '[]'::jsonb, 'note_intervals', '[]'::jsonb, 'leave_intervals', '[]'::jsonb,
       'clock_segments', '[]'::jsonb, 'days', '[]'::jsonb))
from unnest(target_employee_ids) e(employee_id)
cross join location_zone lz
left join employee_zone ez on ez.employee_id = e.employee_id and ez.zone_name = lz.timezone and lz.zone_ok;
$$;

CREATE OR REPLACE FUNCTION "public"."assess_weekly_shift_availability"("w" "uuid", "emp" "uuid", "shift" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare loc uuid:=(shift->>'location_id')::uuid; day date:=coalesce(shift->>'scheduled_date',shift->>'date')::date;
 zone_name text; preference_zone text; basis text:=coalesce(shift->>'time_basis','explicit'); start_clock time; end_clock time;
 local_start timestamp; local_end timestamp; start_at timestamptz; end_at timestamptz; span tstzrange; day_span tstzrange;
 capacity jsonb; remaining tstzmultirange; unavailable tstzmultirange:='{}'; leave_ranges tstzmultirange:='{}';
 leave_evidence jsonb:='[]'; reasons jsonb:='[]'; settings public.workspace_scheduling_settings%rowtype;
 leave_row record; leave_span tstzrange; coverage text; operation text; fingerprint_payload jsonb;
 conflict_severity text; rule_severity text; rule jsonb; annotated jsonb:='[]'; availability_fingerprint text;
 neighbor record; neighbor_span tstzrange; gap_minutes numeric; schedule_week date; schedule_locations uuid[];
 edit_id uuid:=nullif(shift->>'session_id','')::uuid; context_draft_id uuid:=nullif(shift->>'draft_id','')::uuid;
 exclude_id uuid:=coalesce(nullif(shift->>'_exclude_shift_id',''),shift->>'source_shift_id',shift->>'id')::uuid;
 -- BL-092: shifts this person gives up in the same operation (the other side
 -- of a swap) are not theirs any more when this one becomes theirs.
 given_up uuid[]:=array(select value::uuid from jsonb_array_elements_text(
  case when jsonb_typeof(shift->'_exclude_shift_ids')='array' then shift->'_exclude_shift_ids' else '[]'::jsonb end)
  where value is not null);
 missing_time boolean; invalid_clock boolean:=false; ambiguous_clock boolean:=false;
begin
 select l.timezone,coalesce(nullif(shift->>'time_timezone',''),nullif(shift->'time_snapshot'->>'timezone',''),l.timezone)
  into preference_zone,zone_name from public.locations l where l.workspace_id=w and l.id=loc;
 if day is null or not isfinite(day) or zone_name is null or preference_zone is null
  or not app_private.timezone_name_valid(zone_name)
  or not app_private.timezone_name_valid(preference_zone) then
  raise exception 'A valid location, date and timezone are required for availability assessment' using errcode='22023'; end if;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 if settings.workspace_id is null then raise exception 'Scheduling settings unavailable' using errcode='P0002'; end if;
 if basis not in ('explicit','type_default') then
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
 missing_time:=start_clock is null or end_clock is null or start_clock=end_clock;
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
 -- Only the employee's own marks are unavailable hours; the note is not (M12).
 select coalesce(range_agg(tstzrange((x->>'start_at')::timestamptz,(x->>'end_at')::timestamptz,'[)')),'{}') into unavailable
  from jsonb_array_elements(capacity->'employee_intervals') x;
 for leave_row in select away.segment_id id,away.request_id,away.revision,away.span
  from app_private.leave_spans(w,array[emp],coalesce(span,day_span)) away
  where not away.pending order by away.segment_id,lower(away.span) loop
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
 -- The employee's own mark is always only a warning (M8); a manager's note is
 -- a reminder shown while writing, nothing more (M12).
 if span is not null and jsonb_array_length(capacity->'employee_intervals')>0 then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','availability',
  'message','The assignment overlaps unavailable hours.','intervals',capacity->'employee_intervals','definite',true)); end if;
 if span is not null and jsonb_array_length(capacity->'manager_intervals')>0 then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','note',
  'message','The assignment overlaps hours a manager noted for this person.','intervals',capacity->'manager_intervals','definite',true)); end if;
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
   -- Excluded from Schedule keeps a person out of new shifts only (BL-218): a
   -- shift already published with them stays theirs through edits and republishing.
   if not exists(select 1 from public.employee_profiles where workspace_id=w and id=emp and archived_at is null and (start_date is null or start_date<=day)
     and (not is_excluded_from_schedule or exists(select 1 from public.schedule_published_shifts published
       where published.workspace_id=w and published.employee_id=emp
         and published.source_shift_id=coalesce(nullif(shift->>'source_shift_id',''),shift->>'id')::uuid))) then
    reasons:=reasons||jsonb_build_array(jsonb_build_object('code','employee_inactive','message','Employee is not active in Schedule.','definite',true));
   end if;
   if not exists(select 1 from public.employee_location_assignments where workspace_id=w and employee_id=emp and location_id=loc and ended_at is null)
    or not exists(select 1 from public.employee_job_assignments where workspace_id=w and employee_id=emp and job_id=(shift->>'job_id')::uuid and ended_at is null) then
    reasons:=reasons||jsonb_build_array(jsonb_build_object('code','assignment_missing','message','Employee needs an active location and job assignment.','definite',true));
   end if;
   -- ROL-CIFT 2.1: a shift is somebody's only with the employee access; who only manages is never
   -- scheduled. Every save, the check before it and the exchange engine read this one reason.
   if not app_private.has_employee_access(w,(select e.user_id from public.employee_profiles e where e.workspace_id=w and e.id=emp)) then
    reasons:=reasons||jsonb_build_array(jsonb_build_object('code','no_employee_access','message','Employee access is required to be scheduled.','definite',true));
   end if;
  end if;
  if exists(select 1 from public.schedule_closures c where c.workspace_id=w and c.location_id=loc
   and c.closed_date=day and app_private.closure_covers(c.kind,c.opens,c.closes,start_clock,end_clock)) then
   reasons:=reasons||jsonb_build_array(jsonb_build_object('code','closed_location','message','Location is closed or has short hours at this time.','definite',true));
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
     and s.id is distinct from exclude_id and not s.id=any(given_up) and s.scheduled_date between day-2 and day+2
     and (not (shift ? '_publish_locations') or (s.location_id in (select value::uuid from jsonb_array_elements_text(shift->'_publish_locations'))
      and public.schedule_shift_in_department_scope_service(s.job_id,
       case when jsonb_typeof(shift->'_publish_departments')='array' then array(select value::uuid from jsonb_array_elements_text(shift->'_publish_departments')) end,
       coalesce((shift->>'_publish_no_department')::boolean,true))))
   union all
   select s.id,s.location_id,s.scheduled_date,s.start_time,s.end_time,s.time_basis,coalesce(s.time_timezone,l.timezone)
    from public.schedule_draft_shifts s join public.locations l on l.id=s.location_id and l.workspace_id=w
    where edit_id is null and s.workspace_id=w and s.draft_id=context_draft_id and s.employee_id=emp
     and s.id is distinct from exclude_id and not s.id=any(given_up) and s.scheduled_date between day-2 and day+2
     and (not (shift ? '_publish_locations') or (s.location_id in (select value::uuid from jsonb_array_elements_text(shift->'_publish_locations'))
      and public.schedule_shift_in_department_scope_service(s.job_id,
       case when jsonb_typeof(shift->'_publish_departments')='array' then array(select value::uuid from jsonb_array_elements_text(shift->'_publish_departments')) end,
       coalesce((shift->>'_publish_no_department')::boolean,true))))
   union all
   select s.id,s.location_id,s.scheduled_date,s.start_time,s.end_time,s.time_basis,coalesce(s.time_timezone,l.timezone)
    from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current'
    join public.locations l on l.id=s.location_id and l.workspace_id=w
    where s.workspace_id=w and s.employee_id=emp and (shift ? '_publish_locations' or (s.id is distinct from exclude_id and s.source_shift_id is distinct from exclude_id
     and not s.id=any(given_up) and not coalesce(s.source_shift_id,s.id)=any(given_up)))
     and s.scheduled_date between day-2 and day+2
     and (schedule_week is null or s.scheduled_date not between schedule_week and schedule_week+6
      or not s.location_id = any(coalesce(schedule_locations, '{}'))
      or (shift ? '_publish_locations' and not (s.location_id in (select value::uuid from jsonb_array_elements_text(shift->'_publish_locations'))
       and public.schedule_shift_in_department_scope_service(s.job_id,
        case when jsonb_typeof(shift->'_publish_departments')='array' then array(select value::uuid from jsonb_array_elements_text(shift->'_publish_departments')) end,
        coalesce((shift->>'_publish_no_department')::boolean,true)))))
   order by 1
  loop
   neighbor_span:=app_private.shift_time_range(neighbor.scheduled_date,neighbor.start_time,neighbor.end_time,neighbor.zone);
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
   when 'availability' then 'warn'
   when 'note' then 'warn'
   when 'approved_time_off' then settings.conflict_rules->>'approved_time_off'
   -- K17: "confirm once" asks like "confirm"; its answer holds for the editing session.
   when 'closed_location' then case settings.conflict_rules->>'closed_location' when 'confirm_once' then 'confirm' else settings.conflict_rules->>'closed_location' end
   when 'minimum_travel' then case when shift ? '_shift_exchange' then 'allow' else settings.conflict_rules->>'minimum_travel' end
   when 'minimum_rest' then case when shift ? '_shift_exchange' then 'allow' else settings.conflict_rules->>'minimum_rest' end when 'document_required' then settings.conflict_rules->>'document_required' when 'document_conditional_grace' then settings.conflict_rules->>'document_conditional_grace' when 'document_conditional_overdue' then settings.conflict_rules->>'document_conditional_overdue'
   when 'time_source_unresolved' then 'confirm'
   else 'block' end;
  if rule->>'code' not in ('availability','note') and array_position(array['allow','warn','confirm','block'],rule_severity)>array_position(array['allow','warn','confirm','block'],conflict_severity) then conflict_severity:=rule_severity; end if;
  if rule_severity<>'allow' then annotated:=annotated||jsonb_build_array(rule||jsonb_build_object('severity',rule_severity)
   ||case when rule->>'code'='closed_location' and settings.conflict_rules->>'closed_location'='confirm_once'
    then jsonb_build_object('confirm_scope','edit_session') else '{}'::jsonb end); end if;
 end loop;
 reasons:=annotated;
 operation:=case conflict_severity when 'block' then 'blocked' when 'allow' then 'allowed' else 'warning_requires_override' end;
 -- Revision counters, manager notes and unrelated weekdays/settings are not
 -- conflict identity. The adapters use warning_policy to decide warn/confirm.
 -- Availability is not a conflict: it has its own fingerprint below, which
 -- changes with the person, the shift, its hours or the overlapping marks.
 if span is not null and not isempty(unavailable) then
  availability_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('workspace_id',w,'employee_id',emp,
   'assignment',coalesce(shift->>'source_shift_id',shift->>'id'),'location_id',loc,'date',day,
   'intervals',public.availability_ranges_json(tstzmultirange(span)),
   'employee_intervals',capacity->'employee_intervals')::text,'UTF8'),'sha256'),'hex');
 end if;
 fingerprint_payload:=jsonb_build_object('workspace_id',w,'employee_id',emp,
  'assignment',jsonb_build_object('id',coalesce(shift->>'source_shift_id',shift->>'id'),'location_id',loc,'date',day),
  'intervals',public.availability_ranges_json(case when span is null then '{}'::tstzmultirange else tstzmultirange(span) end),
  'leave',public.availability_ranges_json(leave_ranges),
  'warning_policy',case when conflict_severity='confirm' then 'confirm' else 'warn' end,'operation',operation,
  'conflict_rules',settings.conflict_rules,'minimum_travel_minutes',settings.minimum_travel_minutes,'minimum_rest_minutes',settings.minimum_rest_minutes,
  'reasons',(select coalesce(jsonb_agg(r),'[]') from jsonb_array_elements(reasons) r where r->>'code' not in ('availability','note')));
 return jsonb_build_object('coverage',coverage,'operation',operation,'time_basis',basis,'timezone',zone_name,'preference_timezone',preference_zone,
  'assessment_scope',case when span is null then 'calendar_day' else 'shift_interval' end,
  'intervals',public.availability_ranges_json(case when span is null then '{}'::tstzmultirange else tstzmultirange(span) end),
  'available_intervals',case when span is null then '[]'::jsonb else public.availability_ranges_json(remaining) end,
  'unavailable_intervals',public.availability_ranges_json(unavailable+leave_ranges),
  'unknown_intervals',case when span is null then public.availability_ranges_json(tstzmultirange(day_span)) else '[]'::jsonb end,
  'employee_intervals',capacity->'employee_intervals','manager_intervals',capacity->'manager_intervals',
  'has_availability_conflict',span is not null and not isempty(unavailable),'availability_fingerprint',availability_fingerprint,'conflict_severity',conflict_severity,
  'warning_policy',case when conflict_severity='confirm' then 'confirm' else 'warn' end,
  'leave',leave_evidence,'reasons',reasons,
  'policy_revision',settings.availability_preferences_revision,
  'fold_resolution',case when ambiguous_clock then 'post_transition_offset' else null end,
  'assessment_minutes',case when span is null then null else extract(epoch from upper(span)-lower(span))/60 end,
  'fingerprint',encode(extensions.digest(convert_to(fingerprint_payload::text,'UTF8'),'sha256'),'hex'));
end; $$;

CREATE OR REPLACE FUNCTION "public"."get_lineup_candidates_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  place public.locations;
  day date;
  type_id uuid;
  edit jsonb := payload -> 'row';
  department uuid;
  read jsonb;
  target jsonb;
  win_from timestamptz;
  win_to timestamptz;
  win_minutes numeric;
  result jsonb;
  uuid_shape constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if jsonb_typeof(payload) is distinct from 'object'
     or payload ->> 'location_id' is null or (payload ->> 'location_id') !~* uuid_shape
     or payload ->> 'service_date' is null or (payload ->> 'service_date') !~ '^\d{4}-\d{2}-\d{2}$'
     or (payload ->> 'shift_type_id' is not null and (payload ->> 'shift_type_id') !~* uuid_shape)
     or (payload ? 'row') = (payload ? 'department_id')
     or (payload ? 'row' and (jsonb_typeof(edit) is distinct from 'object'
         or ((edit ->> 'source_shift_id') is null) = ((edit ->> 'row_id') is null)
         or coalesce(edit ->> 'source_shift_id', edit ->> 'row_id') !~* uuid_shape))
     or (payload ->> 'department_id' is not null and (payload ->> 'department_id') !~* uuid_shape) then
    raise exception 'Choose a department or a person' using errcode = '22023', hint = 'lineup.invalid_command';
  end if;
  -- The core first: a stranger learns nothing.
  perform app_private.authorize(actor_user_id, target_workspace_id, 'lineup.share',
    target_locations => array[(payload ->> 'location_id')::uuid]);

  select * into place from public.locations l
  where l.id = (payload ->> 'location_id')::uuid and l.workspace_id = target_workspace_id;
  day := (payload ->> 'service_date')::date;
  type_id := (payload ->> 'shift_type_id')::uuid;
  department := (payload ->> 'department_id')::uuid;
  if type_id is not null and not exists (
    select 1 from public.shift_types t where t.id = type_id and t.workspace_id = target_workspace_id and t.deleted_at is null
  ) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'lineup.share';
  end if;

  -- The whole day, every location's lineups: who works where, and when.
  read := app_private.lineup_day(target_workspace_id, day, array(
    select l.id from public.locations l
    where l.workspace_id = target_workspace_id and l.archived_at is null and l.deleted_at is null));

  if payload ? 'row' then
    select r into target
    from jsonb_array_elements(read -> 'locations') l, jsonb_array_elements(l -> 'lineups') x, jsonb_array_elements(x -> 'rows') r
    where (l ->> 'id')::uuid = place.id and (x ->> 'shift_type_id')::uuid is not distinct from type_id
      and (r ->> 'employee_id') is not null
      and ((edit ? 'source_shift_id' and r ->> 'source_shift_id' = edit ->> 'source_shift_id')
        or (edit ? 'row_id' and r ->> 'id' = edit ->> 'row_id' and (r -> 'lineup_only')::boolean));
    if target is null then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'lineup.share';
    end if;
    if target ->> 'called_off_at' is not null or target ->> 'replaced_by_row_id' is not null then
      raise exception 'This person isn''t on the lineup now' using errcode = '22023', hint = 'lineup.row_out';
    end if;
    win_from := (day + (target ->> 'start_time')::time) at time zone place.timezone;
    win_to := (day + (target ->> 'end_time')::time
      + case when (target -> 'crosses_midnight')::boolean then interval '1 day' else interval '0' end) at time zone place.timezone;
  else
    -- The department's hours on this lineup (its first in to its last out), else the shift type's.
    select min((day + (r ->> 'start_time')::time) at time zone place.timezone),
      max((day + (r ->> 'end_time')::time
        + case when (r -> 'crosses_midnight')::boolean then interval '1 day' else interval '0' end) at time zone place.timezone)
    into win_from, win_to
    from jsonb_array_elements(read -> 'locations') l, jsonb_array_elements(l -> 'lineups') x, jsonb_array_elements(x -> 'rows') r
    where (l ->> 'id')::uuid = place.id and (x ->> 'shift_type_id')::uuid is not distinct from type_id
      and r ->> 'employee_id' is not null and r ->> 'called_off_at' is null and r ->> 'replaced_by_row_id' is null
      and (r ->> 'department_id')::uuid is not distinct from department;
    if win_from is null then
      select (day + t.default_start_time) at time zone place.timezone,
        (day + t.default_end_time + case when t.default_end_time <= t.default_start_time then interval '1 day' else interval '0' end)
          at time zone place.timezone
      into win_from, win_to
      from public.shift_types t where t.id = type_id and t.workspace_id = target_workspace_id
        and t.default_start_time is not null and t.default_end_time is not null;
    end if;
  end if;
  -- No hours to measure by: the whole day there.
  if win_from is null then
    win_from := day::timestamp at time zone place.timezone;
    win_to := (day + 1)::timestamp at time zone place.timezone;
  end if;
  win_minutes := extract(epoch from win_to - win_from) / 60;

  with day_rows as (
    -- Everyone's shift that day, wherever, but this lineup's: who is on it is not offered. Here, and where its lineup
    -- is published, as the lineup has it; at another location's draft, as its published Schedule has it (a draft is
    -- its manager's; the Schedule's ghost shift says no more).
    select (r ->> 'employee_id')::uuid as employee_id, (l ->> 'id')::uuid as location_id, l ->> 'name' as location_name,
      l ->> 'timezone' as zone, coalesce(x ->> 'shift_type_name', 'No shift type') as shift_name, r,
      (l ->> 'id')::uuid = place.id or (x -> 'published')::boolean as live
    from jsonb_array_elements(read -> 'locations') l, jsonb_array_elements(l -> 'lineups') x, jsonb_array_elements(x -> 'rows') r
    where r ->> 'employee_id' is not null
      and not ((l ->> 'id')::uuid = place.id and (x ->> 'shift_type_id')::uuid is not distinct from type_id)
  ), shifts as (
    select d.employee_id, d.location_id, d.location_name, d.shift_name, t.start_time, t.end_time,
      (day + t.start_time::time) at time zone d.zone as from_at,
      (day + t.end_time::time + case when t.end_time::time <= t.start_time::time then interval '1 day' else interval '0' end)
        at time zone d.zone as to_at
    from day_rows d
    cross join lateral (select
        case when d.live then d.r ->> 'start_time' else d.r ->> 'schedule_start_time' end as start_time,
        case when d.live then d.r ->> 'end_time' else d.r ->> 'schedule_end_time' end as end_time) t
    where case when d.live then d.r ->> 'called_off_at' is null and d.r ->> 'replaced_by_row_id' is null
               else not (d.r -> 'lineup_only')::boolean end
  ), measured as (
    select s.*, greatest(0, extract(epoch from least(s.to_at, win_to) - greatest(s.from_at, win_from)) / 60) as overlap
    from shifts s
  ), on_lineup as (
    select (r ->> 'employee_id')::uuid as employee_id
    from jsonb_array_elements(read -> 'locations') l, jsonb_array_elements(l -> 'lineups') x, jsonb_array_elements(x -> 'rows') r
    where (l ->> 'id')::uuid = place.id and (x ->> 'shift_type_id')::uuid is not distinct from type_id
      and r ->> 'employee_id' is not null
  ), people as (
    select e.id, coalesce(nullif(e.preferred_name, ''), e.first_name) || ' ' || e.last_name as name,
      array(select a.job_id from public.employee_job_assignments a join public.jobs j on j.id = a.job_id
            where a.workspace_id = target_workspace_id and a.employee_id = e.id and a.ended_at is null and j.archived_at is null
            order by a.is_primary desc, j.name) as job_ids
    from public.employee_profiles e
    where e.workspace_id = target_workspace_id
      and app_private.lineup_staff_eligible(target_workspace_id, place.id, e.id)
      and not exists (select 1 from on_lineup o where o.employee_id = e.id)
  ), on_leave as materialized (
    -- Time off in these hours, as it is now: revoked or given back hours are no time off (D1a).
    select distinct l.employee_id
    from app_private.leave_spans(target_workspace_id, array(select p.id from people p), tstzrange(win_from, win_to, '[)')) l
    where not l.pending
  ), fitted as (
    select p.*,
      array(select j.id from unnest(p.job_ids) as k (id) join public.jobs j on j.id = k.id
            where case when target is not null then j.id = (target ->> 'job_id')::uuid
                       else j.department_id is not distinct from department end) as fits,
      exists (select 1 from on_leave o where o.employee_id = p.id) as off,
      away.location_name as away_location, away.shift_name as away_shift, away.start_time as away_start,
      away.end_time as away_end, away.overlap as away_overlap,
      here.shift_name as here_shift, here.start_time as here_start, here.end_time as here_end, here.overlap as here_overlap,
      first.location_id as first_location_id, first.location_name as first_location, first.shift_name as first_shift,
      first.start_time as first_start, first.end_time as first_end
    from people p
    -- The most of these hours somewhere else, the most here, and the day's first shift.
    left join lateral (select m.* from measured m where m.employee_id = p.id and m.location_id <> place.id and m.overlap > 0
                       order by m.overlap desc limit 1) away on true
    left join lateral (select m.* from measured m where m.employee_id = p.id and m.location_id = place.id and m.overlap > 0
                       order by m.overlap desc limit 1) here on true
    left join lateral (select m.* from measured m where m.employee_id = p.id order by m.from_at limit 1) first on true
  ), scored as (
    select f.*, cardinality(f.fits) > 0 as match,
      case
        when f.off then 10 + case when cardinality(f.fits) > 0 then 5 else 0 end
        when f.away_overlap is not null then (case when f.away_overlap < win_minutes then 40 else 25 end)
          + case when cardinality(f.fits) > 0 then 5 else 0 end
        when f.here_overlap is not null then 30
        when f.first_start is not null then case when f.first_location_id = place.id then 65 else 70 end
        else 100
      end as score
    from fitted f
    -- Here at another shift for half these hours or more: not free for this one.
    where f.off or f.away_overlap is not null or f.here_overlap is null or f.here_overlap < win_minutes / 2
  )
  select jsonb_build_object(
    'window', jsonb_build_object('start_time', to_char(win_from at time zone place.timezone, 'HH24:MI'),
      'end_time', to_char(win_to at time zone place.timezone, 'HH24:MI')),
    'job_id', target -> 'job_id',
    'candidates', coalesce(jsonb_agg(jsonb_build_object(
      'employee_id', s.id,
      'name', s.name,
      'job_ids', to_jsonb(s.job_ids),
      -- The position the person would take: the row's on Replace, else her first in the department.
      'job_id', case when target is not null then target -> 'job_id' else to_jsonb(s.fits[1]) end,
      'group', case when s.off or s.away_overlap is not null then 'unavailable' when not s.match then 'consider'
                    when s.score = 100 then 'best_fit' else 'available' end,
      'score', s.score,
      'why', case
        when s.off then jsonb_build_object('reason', 'time_off')
        when s.away_overlap is not null then jsonb_build_object('reason', 'elsewhere', 'location_name', s.away_location,
          'shift_name', s.away_shift, 'start_time', s.away_start, 'end_time', s.away_end,
          'partial', s.away_overlap < win_minutes)
        when s.here_overlap is not null then jsonb_build_object('reason', 'overlap_here', 'shift_name', s.here_shift,
          'start_time', s.here_start, 'end_time', s.here_end, 'overlap_minutes', round(s.here_overlap))
        when s.first_start is not null then jsonb_build_object('reason', 'other_shift',
          'location_name', case when s.first_location_id = place.id then null else s.first_location end,
          'shift_name', s.first_shift, 'start_time', s.first_start, 'end_time', s.first_end)
        else jsonb_build_object('reason', 'no_shift')
      end
    ) order by s.score desc, s.name, s.id), '[]'::jsonb))
  into result
  from scored s;
  return result;
end;
$_$;

CREATE OR REPLACE FUNCTION "public"."get_manager_home_service"("actor_user_id" "uuid", "target_workspace_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  -- Time off as it is now (D1a): the days left of it, in the zone it was asked in. A piece that
  -- ends at midnight is that day's; the next fourteen days hold it.
  approved_off as materialized (
    select away.request_id as id, away.employee_id,
      greatest(min((lower(away.span) at time zone away.zone)::date), local_today) as first_date,
      least(max(((upper(away.span) - interval '1 microsecond') at time zone away.zone)::date), local_today + 13) as last_date
    from app_private.leave_spans(target_workspace_id,
      array(select e.id from public.employee_profiles e where e.workspace_id = target_workspace_id),
      tstzrange((local_today - 1)::timestamp at time zone 'UTC', (local_today + 15)::timestamp at time zone 'UTC', '[)')) away
    where not away.pending
      and (lower(away.span) at time zone away.zone)::date <= local_today + 13
      and ((upper(away.span) - interval '1 microsecond') at time zone away.zone)::date >= local_today
    group by away.request_id, away.employee_id
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
            'document', missing.title, 'requirement_id', missing.id, 'status', missing.state)
            order by missing.name, missing.title, missing.id)
          from (
            select requirement.id, requirement.employee_id, person.name, requirement.title, obligation.state
            from public.employee_onboarding_requirements requirement
            join person on person.id = requirement.employee_id
            join public.employee_profiles profile on profile.id = requirement.employee_id and profile.archived_at is null
            cross join lateral (select app_private.document_obligation_state(requirement, now()) as state) obligation
            where requirement.workspace_id = target_workspace_id
              and requirement.kind = 'document'
              and requirement.required
              and not requirement.owner_excused
              and exists (
                select 1 from public.employee_location_assignments assignment
                where assignment.employee_id = requirement.employee_id and assignment.location_id = place.id
                  and assignment.ended_at is null)
              and obligation.state in ('missing', 'rejected', 'expired')
              and app_private.authz_check(me, documents_rule, null, requirement.employee_id, null) is null
            order by person.name, requirement.title, requirement.id
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

CREATE OR REPLACE FUNCTION "public"."weekly_schedule_publication_preflight"("payload" "jsonb", "actor" "uuid", "departments" "uuid"[] DEFAULT NULL::"uuid"[], "include_no_department" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare findings jsonb; signatures jsonb:='[]'; s record; a jsonb; prior jsonb; evidence jsonb; scope jsonb;
 unsigned jsonb; w uuid:=(payload->>'workspace_id')::uuid; message text; state text; tier text; warning boolean;
 pending jsonb:='[]'; shift_span tstzrange; asking uuid[];
begin
 if payload->>'status'='past_week_closed' then return payload; end if;
 -- Who has time off waiting for a decision, read once for the whole draft.
 asking:=array(select distinct away.employee_id from app_private.leave_spans(w,
   array(select distinct d.employee_id from public.schedule_draft_shifts d
    where d.workspace_id=w and d.draft_id=(payload->>'draft_id')::uuid and d.employee_id is not null),
   (select tstzrange((min(d.scheduled_date)-2)::timestamp at time zone 'UTC',(max(d.scheduled_date)+3)::timestamp at time zone 'UTC','[)')
    from public.schedule_draft_shifts d where d.workspace_id=w and d.draft_id=(payload->>'draft_id')::uuid)) away
  where away.pending);
 select coalesce(jsonb_agg(f),'[]') into findings from jsonb_array_elements(payload->'findings') f
  where f->>'code' not in ('availability','availability_unknown','availability_review_pending','time_source_unresolved','overlap','double_booking','time_off','closed_location','closed_day');
 -- Publishing is asked at each location the preview is for, once.
 perform app_private.authorize(actor,w,'schedule.publish',array[(x->>'location_id')::uuid])
  from jsonb_array_elements(coalesce(payload->'locations','[]'::jsonb)) x;
 scope:=jsonb_build_object('_publish_locations',(select jsonb_agg(x->'location_id') from jsonb_array_elements(payload->'locations') x),
  '_publish_departments',to_jsonb(departments),'_publish_no_department',coalesce(include_no_department,true));
 for s in select d.*,concat_ws(' ',coalesce(nullif(e.preferred_name,''),e.first_name),e.last_name) employee_name,l.name location_name
  from public.schedule_draft_shifts d left join public.employee_profiles e on e.id=d.employee_id and e.workspace_id=d.workspace_id
  join public.locations l on l.id=d.location_id and l.workspace_id=d.workspace_id
  where d.workspace_id=w and d.draft_id=(payload->>'draft_id')::uuid
   and d.location_id in (select (x->>'location_id')::uuid from jsonb_array_elements(payload->'locations') x)
   and public.schedule_shift_in_department_scope_service(d.job_id,departments,coalesce(include_no_department,true)) order by d.id loop
  state:=null; prior:=null;
  a:=public.assess_weekly_shift_availability(w,s.employee_id,to_jsonb(s)||scope);
  evidence:=public.schedule_availability_override(w,to_jsonb(s),a);
  -- A conflict accepted when this shift was last published stays accepted
  -- (BL-174). Availability is no conflict and is not part of it (BL-186).
  if a->>'operation'='warning_requires_override' then
   prior:=public.schedule_availability_prior_publication(w,to_jsonb(s));
   state:=case when evidence is not null or prior->'availability_snapshot'->'assessment'->>'fingerprint'=a->>'fingerprint'
    or exists(select 1 from public.schedule_publication_overrides o where o.workspace_id=w
     and o.publication_id=(prior->>'publication_id')::uuid and o.finding_id=a->>'fingerprint' and s.id=any(o.source_shift_ids)) then 'accepted' else 'new' end;
   if s.employee_id is null and exists(select 1 from public.audit_events ev where ev.workspace_id=w and ev.action='schedule.conflict_accepted'
     and ev.target_id=s.id::text and ev.metadata->'assessment'->>'fingerprint'=a->>'fingerprint') then state:='accepted'; end if;
  end if;
  signatures:=signatures||jsonb_build_array(jsonb_build_object('shift_id',s.id,'fingerprint',a->>'fingerprint',
   'availability_fingerprint',a->>'availability_fingerprint','override_id',evidence->>'id','retained_publication_id',prior->>'publication_id'));
  if a->>'operation'<>'allowed' then
   warning:=state is not null;
   select string_agg(r->>'message',' ' order by ord) into message from jsonb_array_elements(a->'reasons') with ordinality r(r,ord) where r->>'code' not in ('availability','note');
   tier:=case when not warning then 'blocker' when state='new' and a->>'warning_policy'='confirm' then 'risk' else 'note' end;
   findings:=findings||jsonb_build_array(jsonb_build_object('id',a->>'fingerprint','code','schedule_conflict',
    'conflict_severity',coalesce(a->>'conflict_severity',case when a->>'warning_policy'='confirm' then 'confirm' else 'warn' end),
    'severity',case when warning then 'soft' else 'hard' end,'overrideable',warning,'tier',tier,'introduced',state is distinct from 'accepted',
    'location_id',s.location_id,'location_name',s.location_name,'employee_id',s.employee_id,'employee_name',nullif(s.employee_name,''),
    'scheduled_date',s.scheduled_date,'shift_ids',jsonb_build_array(s.id),'message',left(coalesce(message,'Review this assignment before publishing.'),500))
    ||case when warning then jsonb_build_object('availability_state',state,'warning_policy',a->>'warning_policy') else '{}'::jsonb end);
  end if;
  -- The employee's own mark: listed for a last look, never asked (M9); a
  -- manager's note never reaches Publish (M12).
  if coalesce((a->>'has_availability_conflict')::boolean,false) then
   findings:=findings||jsonb_build_array(jsonb_build_object('id',a->>'availability_fingerprint','code','availability',
    'conflict_severity','warn','severity','soft','overrideable',false,'tier','note',
    'location_id',s.location_id,'location_name',s.location_name,'employee_id',s.employee_id,'employee_name',nullif(s.employee_name,''),
    'scheduled_date',s.scheduled_date,'shift_ids',jsonb_build_array(s.id),
    'message',left(coalesce(nullif(s.employee_name,''),'This person')||' shows as unavailable for this shift.',500)));
  end if;
  -- Time off waiting for a decision over a shift that has not started (FB-6.3).
  if s.employee_id=any(asking) then
   select tstzrange((i->>'start_at')::timestamptz,(i->>'end_at')::timestamptz,'[)') into shift_span
    from jsonb_array_elements(case when a->>'assessment_scope'='shift_interval' then a->'intervals' else a->'unknown_intervals' end) i limit 1;
   if lower(shift_span)>now() then
    pending:=pending||coalesce((select jsonb_agg(jsonb_build_object('employee_id',s.employee_id,'employee_name',nullif(s.employee_name,''),
      'scheduled_date',s.scheduled_date,'location_id',s.location_id,'location_name',s.location_name,'shift_id',s.id,'request_id',r.id))
     from (select distinct away.request_id id from app_private.leave_spans(w,array[s.employee_id],shift_span) away
      where away.pending) r),'[]');
   end if;
  end if;
 end loop;
 findings:=findings||coalesce((select jsonb_agg(jsonb_build_object(
   'id',encode(extensions.digest(convert_to('time_off_pending|'||g.employee_id||'|'||g.scheduled_date||'|'||g.location_id||'|'||g.request_id,'UTF8'),'sha256'),'hex'),
   'code','time_off_pending','severity','soft','overrideable',false,'tier','note',
   'location_id',g.location_id,'location_name',g.location_name,'employee_id',g.employee_id,'employee_name',g.employee_name,
   'scheduled_date',g.scheduled_date,'shift_ids',g.shift_ids,'time_off_request_id',g.request_id,
   'message',left(coalesce(g.employee_name,'This person')||' has time off waiting for a decision on '||to_char(g.scheduled_date,'Mon FMDD'),500))
  order by g.scheduled_date,g.employee_id,g.location_id,g.request_id)
  from (select h->>'employee_id' employee_id,h->>'employee_name' employee_name,(h->>'scheduled_date')::date scheduled_date,
    h->>'location_id' location_id,h->>'location_name' location_name,h->>'request_id' request_id,
    jsonb_agg(h->'shift_id' order by h->>'shift_id') shift_ids
   from jsonb_array_elements(pending) h group by 1,2,3,4,5,6) g),'[]');
 -- BL-198: a draft that would undo an approved shift change is a blocker.
 findings:=findings||public.shift_exchange_draft_undoes(w,(payload->>'draft_id')::uuid,
  array(select (x->>'location_id')::uuid from jsonb_array_elements(coalesce(payload->'locations','[]'::jsonb)) x),departments,include_no_department);
 unsigned:=(payload-'fingerprint'-'status')||jsonb_build_object('findings',findings,'availability_assessments',signatures,'department_ids',to_jsonb(departments),'include_no_department',coalesce(include_no_department,true));
 return unsigned||jsonb_build_object('status',case
  when exists(select 1 from jsonb_array_elements(findings) f where f->>'severity'='hard' and coalesce(f->>'tier','blocker')<>'note') then 'hard_blocked'
  when exists(select 1 from jsonb_array_elements(findings) f where coalesce(f->>'tier','blocker')<>'note' and (coalesce((f->>'introduced')::boolean,true) or not (f->>'overrideable')::boolean)) then 'override_required'
  else 'publish_ready' end,'fingerprint',encode(extensions.digest(convert_to(unsigned::text,'UTF8'),'sha256'),'hex'));
end; $$;

