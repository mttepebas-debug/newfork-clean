-- AVAIL-002 A2 (M4, S2 a, S3 a; Mert 2026-10-04): a time-range day holds
-- several ranges ("ranges": each within the day, in order and apart) instead
-- of one "range", so converting shift types to hours loses nothing: hours past
-- midnight go to the next day and a gap between two types stays available.

-- ==== schedule_week_availability
CREATE OR REPLACE FUNCTION app_private.schedule_week_availability(target_workspace_id uuid, target_week_start date, target_employee_ids uuid[], target_location_ids uuid[], with_reminders boolean DEFAULT true)
 RETURNS TABLE(employee_id uuid, location_id uuid, unavailable tstzmultirange, leave tstzmultirange, projection jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
  select m.employee_id, m.reminder, m.valid, m.preference ->> 'input_mode' as input_mode, d.value as rule
  from mark m cross join lateral jsonb_array_elements(case when m.valid then m.preference -> 'days' else '[]'::jsonb end) d
), clock as (
  select md.employee_id, md.reminder, (md.rule ->> 'day')::integer as dow,
    time '00:00' as start_clock, time '24:00' as end_clock, true as ok
  from mark_day md
  where coalesce((md.rule ->> 'all_day')::boolean, false)
  union all
  select md.employee_id, md.reminder, (md.rule ->> 'day')::integer,
    (r.value ->> 'start')::time, (r.value ->> 'end')::time, true
  from mark_day md
  cross join lateral jsonb_array_elements(md.rule -> 'ranges') r
  where not coalesce((md.rule ->> 'all_day')::boolean, false) and md.input_mode = 'time_range'
  union all
  select md.employee_id, md.reminder, (md.rule ->> 'day')::integer, hours.start_clock, hours.end_clock,
    hours.start_clock is not null and hours.end_clock is not null and hours.start_clock <> hours.end_clock
  from mark_day md
  cross join lateral jsonb_array_elements_text(md.rule -> 'shift_type_ids') selected(type_id)
  cross join lateral (
    select case when t.id is not null and t.archived_at is null and t.deleted_at is null then t.default_start_time else d.start_time end as start_clock,
           case when t.id is not null and t.archived_at is null and t.deleted_at is null then t.default_end_time else d.end_time end as end_clock
    from (select selected.type_id::uuid as id) chosen
    left join public.shift_types t on t.workspace_id = target_workspace_id and t.id = chosen.id
    left join public.weekly_preference_type_defaults d on d.workspace_id = target_workspace_id and d.shift_type_id = chosen.id
  ) hours
  where not coalesce((md.rule ->> 'all_day')::boolean, false) and md.input_mode = 'shift_type'
), broken as (
  -- A mark that cannot be read (invalid, or a shift type without hours) makes
  -- the employee's week unknown rather than partly drawn.
  select m.employee_id from mark m where not m.valid
  union
  select c.employee_id from clock c where not c.ok
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
  join clock c on c.dow = extract(dow from ld.local_date)::integer and c.ok
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
), leave as (
  select req.employee_id, lt.zone_name, range_agg(piece.span * lt.span) as spans
  from leave_target lt
  join public.schedule_time_off_requests req
    on req.workspace_id = target_workspace_id and req.employee_id = any(target_employee_ids)
   and req.request_type = 'time_off' and req.status = 'approved'
  join public.schedule_time_off_segments seg
    on seg.request_id = req.id and seg.workspace_id = req.workspace_id and seg.status = 'approved'
   and seg.segment_date between target_week_start - 4 and target_week_start + 12
  cross join lateral unnest(public.time_off_effective_ranges(seg.id)) piece(span)
  where piece.span && lt.span
  group by req.employee_id, lt.zone_name
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
$function$;

-- ==== weekly_preference_intersections
CREATE OR REPLACE FUNCTION public.weekly_preference_intersections(w uuid, preference jsonb, target_span tstzrange, zone_name text)
 RETURNS tstzmultirange
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result tstzmultirange:='{}'; piece record; local_day date; last_day date; rule jsonb; type_id uuid;
 clocks jsonb; clock jsonb; start_clock time; end_clock time; candidate tstzrange; local_start timestamp; local_end timestamp;
begin
 if not public.weekly_preference_valid(preference) then raise exception 'Invalid weekly preferences' using errcode='22023'; end if;
 if zone_name is null or not app_private.timezone_name_valid(zone_name) then raise exception 'Valid location timezone required' using errcode='22023'; end if;
 if target_span is null or isempty(target_span) then return result; end if;
 for piece in select * from public.availability_offset_segments(target_span,zone_name) loop
  local_day:=((lower(piece.utc_span) at time zone 'UTC')+make_interval(secs=>piece.offset_seconds))::date-1;
  last_day:=((upper(piece.utc_span) at time zone 'UTC')+make_interval(secs=>piece.offset_seconds))::date;
  while local_day<=last_day loop
   select value into rule from jsonb_array_elements(preference->'days') where (value->>'day')::integer=extract(dow from local_day)::integer;
   clocks:='[]';
   if (rule->>'all_day')::boolean then clocks:='[{"start":"00:00","end":"24:00"}]';
   elsif preference->>'input_mode'='time_range' then clocks:=rule->'ranges';
   elsif preference->>'input_mode'='shift_type' then
    for type_id in select value::uuid from jsonb_array_elements_text(rule->'shift_type_ids') loop
     select case when t.id is not null and t.archived_at is null and t.deleted_at is null then t.default_start_time else d.start_time end,
      case when t.id is not null and t.archived_at is null and t.deleted_at is null then t.default_end_time else d.end_time end
      into start_clock,end_clock
     from (select type_id id) selected left join public.shift_types t on t.workspace_id=w and t.id=selected.id
      left join public.weekly_preference_type_defaults d on d.workspace_id=w and d.shift_type_id=selected.id;
     if start_clock is null or end_clock is null or start_clock=end_clock then raise exception 'Selected shift type has no valid default hours' using errcode='22023'; end if;
     clocks:=clocks||jsonb_build_array(jsonb_build_object('start',start_clock,'end',end_clock));
    end loop;
   end if;
   for clock in select value from jsonb_array_elements(clocks) loop
    start_clock:=(clock->>'start')::time; end_clock:=(clock->>'end')::time;
    local_start:=local_day+start_clock;
    local_end:=local_day+end_clock+case when end_clock<start_clock then interval '1 day' else interval '0' end;
    candidate:=tstzrange((local_start at time zone 'UTC')-make_interval(secs=>piece.offset_seconds),
     (local_end at time zone 'UTC')-make_interval(secs=>piece.offset_seconds),'[)');
    if candidate && piece.utc_span then result:=result+tstzmultirange(candidate*piece.utc_span); end if;
   end loop;
   local_day:=local_day+1;
  end loop;
 end loop;
 return result;
end; $function$;

-- ==== weekly_preference_valid
CREATE OR REPLACE FUNCTION public.weekly_preference_valid(preference jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare rule jsonb; mode text; seen integer[]:='{}'; weekday integer; ids uuid[]; piece jsonb; previous_end text;
begin
 if jsonb_typeof(preference) is distinct from 'object' then return false; end if;
 mode:=preference->>'input_mode';
 if mode is null or mode not in ('shift_type','time_range') or jsonb_typeof(preference->'days') is distinct from 'array'
  or jsonb_array_length(preference->'days')<>7 then return false; end if;
 for rule in select value from jsonb_array_elements(preference->'days') loop
  if jsonb_typeof(rule) is distinct from 'object' or jsonb_typeof(rule->'day') is distinct from 'number'
   or (rule->>'day') !~ '^[0-6]$' or jsonb_typeof(rule->'all_day') is distinct from 'boolean'
   or jsonb_typeof(rule->'shift_type_ids') is distinct from 'array' or jsonb_typeof(rule->'ranges') is distinct from 'array'
   or rule ? 'range' or jsonb_array_length(rule->'ranges')>12 then return false; end if;
  weekday:=(rule->>'day')::integer;
  if weekday=any(seen) then return false; end if;
  seen:=array_append(seen,weekday);
  if jsonb_array_length(rule->'shift_type_ids')>64 or exists(select 1 from jsonb_array_elements(rule->'shift_type_ids') x where jsonb_typeof(x)<>'string') then return false; end if;
  select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(rule->'shift_type_ids');
  if cardinality(ids)<>(select count(distinct id) from unnest(ids) id) then return false; end if;
  if (rule->>'all_day')::boolean and (cardinality(ids)>0 or jsonb_array_length(rule->'ranges')>0) then return false; end if;
  if mode='time_range' and cardinality(ids)>0 then return false; end if;
  if mode='shift_type' and jsonb_array_length(rule->'ranges')>0 then return false; end if;
  -- Several hours a day (M4, S2 a), each within the day, in order and apart.
  previous_end:=null;
  for piece in select value from jsonb_array_elements(rule->'ranges') loop
   if jsonb_typeof(piece) is distinct from 'object'
    or jsonb_typeof(piece->'start') is distinct from 'string' or jsonb_typeof(piece->'end') is distinct from 'string'
    or (piece->>'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or (piece->>'end') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
    or (piece->>'end')<=(piece->>'start') or (piece->>'start')<=previous_end then return false; end if;
   previous_end:=piece->>'end';
  end loop;
 end loop;
 return true;
exception when invalid_text_representation or invalid_parameter_value then return false;
end; $function$;

-- ==== empty_weekly_preference
CREATE OR REPLACE FUNCTION public.empty_weekly_preference(mode text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('input_mode',mode,'days',jsonb_agg(jsonb_build_object('day',day,'all_day',false,'shift_type_ids','[]'::jsonb,'ranges','[]'::jsonb) order by day))
 from generate_series(0,6) day;
$function$;

-- ==== weekly_preference_convert: lossless the way M4 says.
-- Type to time: every unavailable minute stays (several hours a day; what a
-- type runs past midnight goes to the next day, Saturday into Sunday). Time to
-- type: a type is marked when any minute of it is unavailable (S3 a).
CREATE OR REPLACE FUNCTION public.weekly_preference_convert(w uuid, preference jsonb, target_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare days jsonb:='[]'; d integer; week int4multirange; day_set int4multirange; whole int4multirange;
 source_rule jsonb; marked jsonb; ranges jsonb; unresolved integer;
begin
 if preference->>'input_mode'=target_mode then return preference; end if;
 -- A picked type means the hours weekly_preference_intersections reads for it:
 -- the live type while it is active, its last saved hours once archived.
 select count(*) into unresolved
 from jsonb_array_elements(preference->'days') r
 cross join lateral jsonb_array_elements_text(r->'shift_type_ids') picked(id)
 left join public.shift_types t on t.workspace_id=w and t.id=picked.id::uuid and t.archived_at is null and t.deleted_at is null
 left join public.weekly_preference_type_defaults dft on dft.workspace_id=w and dft.shift_type_id=picked.id::uuid
 where coalesce(case when t.id is not null then t.default_start_time else dft.start_time end,'00:00')
  =coalesce(case when t.id is not null then t.default_end_time else dft.end_time end,'00:00');
 if unresolved>0 then raise exception 'A saved week names a shift type with no valid default hours' using errcode='22023'; end if;
 -- The week's unavailable minutes, Sunday 00:00 = 0, wrapping past Saturday.
 with clock as (
  select (r->>'day')::integer as day, 0 as s, 1440 as e
  from jsonb_array_elements(preference->'days') r where (r->>'all_day')::boolean
  union all
  select (r->>'day')::integer, split_part(x->>'start',':',1)::integer*60+split_part(x->>'start',':',2)::integer,
   split_part(x->>'end',':',1)::integer*60+split_part(x->>'end',':',2)::integer
  from jsonb_array_elements(preference->'days') r cross join lateral jsonb_array_elements(r->'ranges') x
  where not (r->>'all_day')::boolean
  union all
  select (r->>'day')::integer, h.s, case when h.e<=h.s then h.e+1440 else h.e end
  from jsonb_array_elements(preference->'days') r
  cross join lateral jsonb_array_elements_text(r->'shift_type_ids') picked(id)
  left join public.shift_types t on t.workspace_id=w and t.id=picked.id::uuid and t.archived_at is null and t.deleted_at is null
  left join public.weekly_preference_type_defaults dft on dft.workspace_id=w and dft.shift_type_id=picked.id::uuid
  cross join lateral (select
   (extract(hour from case when t.id is not null then t.default_start_time else dft.start_time end)*60
    +extract(minute from case when t.id is not null then t.default_start_time else dft.start_time end))::integer s,
   (extract(hour from case when t.id is not null then t.default_end_time else dft.end_time end)*60
    +extract(minute from case when t.id is not null then t.default_end_time else dft.end_time end))::integer e) h
  where not (r->>'all_day')::boolean
 ), piece as (
  select int4range(c.day*1440+c.s, least(c.day*1440+c.e,10080)) span from clock c
  union all
  select int4range(0, c.day*1440+c.e-10080) from clock c where c.day*1440+c.e>10080
 )
 select coalesce(range_agg(span),'{}') into week from piece where not isempty(span);
 for d in 0..6 loop
  whole:=int4multirange(int4range(d*1440,(d+1)*1440));
  select value into source_rule from jsonb_array_elements(preference->'days') where (value->>'day')::integer=d;
  if target_mode='time_range' then
   day_set:=week*whole;
   if day_set=whole then
    days:=days||jsonb_build_array(jsonb_build_object('day',d,'all_day',true,'shift_type_ids','[]'::jsonb,'ranges','[]'::jsonb));
   else
    select coalesce(jsonb_agg(jsonb_build_object(
      'start',lpad(((lower(x)-d*1440)/60)::text,2,'0')||':'||lpad(((lower(x)-d*1440)%60)::text,2,'0'),
      'end',lpad(((upper(x)-d*1440)/60)::text,2,'0')||':'||lpad(((upper(x)-d*1440)%60)::text,2,'0')) order by lower(x)),'[]')
     into ranges from unnest(day_set) x;
    days:=days||jsonb_build_array(jsonb_build_object('day',d,'all_day',false,'shift_type_ids','[]'::jsonb,'ranges',ranges));
   end if;
  elsif coalesce((source_rule->>'all_day')::boolean,false) then
   days:=days||jsonb_build_array(jsonb_build_object('day',d,'all_day',true,'shift_type_ids','[]'::jsonb,'ranges','[]'::jsonb));
  else
   -- ponytail: a range reaching more than 64 active types fails the week's check; cap it when a workspace has that many.
   select coalesce(jsonb_agg(t.id order by t.sort_order,t.name,t.id),'[]') into marked from public.shift_types t
   cross join lateral (select (extract(hour from t.default_start_time)*60+extract(minute from t.default_start_time))::integer s,
    (extract(hour from t.default_end_time)*60+extract(minute from t.default_end_time))::integer e) h
   cross join lateral (select d*1440+h.s lo, d*1440+case when h.e<=h.s then h.e+1440 else h.e end hi) span
   where t.workspace_id=w and t.archived_at is null and t.deleted_at is null
    and t.default_start_time is not null and t.default_end_time is not null and t.default_start_time<>t.default_end_time
    and week && (int4multirange(int4range(span.lo,least(span.hi,10080)))
     +case when span.hi>10080 then int4multirange(int4range(0,span.hi-10080)) else '{}'::int4multirange end);
   days:=days||jsonb_build_array(jsonb_build_object('day',d,'all_day',false,'shift_type_ids',marked,'ranges','[]'::jsonb));
  end if;
 end loop;
 return app_private.weekly_preference_whole_days(w,jsonb_build_object('input_mode',target_mode,'days',days));
end; $function$;

-- ==== Saved weeks take the new shape: one range becomes a list of one.
update public.employee_weekly_preferences p set preference=jsonb_set(p.preference,'{days}',(
 select jsonb_agg((d-'range')||jsonb_build_object('ranges',case when jsonb_typeof(d->'range')='object' then jsonb_build_array(d->'range') else '[]'::jsonb end)
  order by (d->>'day')::integer) from jsonb_array_elements(p.preference->'days') d))
where exists (select 1 from jsonb_array_elements(p.preference->'days') d where d ? 'range');
update public.manager_weekly_reminders p set preference=jsonb_set(p.preference,'{days}',(
 select jsonb_agg((d-'range')||jsonb_build_object('ranges',case when jsonb_typeof(d->'range')='object' then jsonb_build_array(d->'range') else '[]'::jsonb end)
  order by (d->>'day')::integer) from jsonb_array_elements(p.preference->'days') d))
where exists (select 1 from jsonb_array_elements(p.preference->'days') d where d ? 'range');

