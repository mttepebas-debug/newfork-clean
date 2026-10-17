-- AVAIL-GUN-DB: availability is asked in hours only (Mert, 2026-10-16, "yalnız saat"; "kural da
-- 1'e insin"; "sayfa verisi genişlesin").
--
-- Before: an organization chose how availability was entered (Settings -> Scheduling, "Entry
-- mode": time range or shift type). A saved week carried that mode and, per day, the shift types
-- picked; changing the mode converted every saved week (KARARLAR M4); the Schedule's availability
-- read the picked types' default hours, and an archived type's last hours were kept for it. A day
-- could hold up to twelve ranges.
--
-- After:
-- * a week is { days: [ { day, all_day, ranges } x 7 ] } and nothing else; a day is a whole day or
--   at most one range (weekly_preference_valid);
-- * workspace_scheduling_settings.availability_input_mode goes; the only availability setting is
--   "onboarding asks for it" (read and save);
-- * the mode conversion, the "all types picked = whole day" rule, the archived type hours table
--   and its trigger go; the Schedule's week read and the assignment check read hours only;
-- * a shift type's default hours stay its own rule (guard_weekly_preference_type_hours), without
--   the mode's clause;
-- * the team read names each person's job (the one the Employees list shows) and when their week
--   was last saved.
--
-- Hosted, 2026-10-16 (measured by the main session): all three workspaces use time ranges and
-- neither weekly table has a row. A week that cannot take the new form (a shift-type week, or a
-- day with several ranges) is deleted, not converted (CLAUDE.md 3.A.5).

-- The two checks name the validator; they come back at the end, once every row fits.
alter table public.employee_weekly_preferences drop constraint employee_weekly_preferences_preference_check;
alter table public.manager_weekly_reminders drop constraint manager_weekly_reminders_preference_check;

delete from public.employee_weekly_preferences p
where p.preference->>'input_mode' is distinct from 'time_range'
   or exists (select 1 from jsonb_array_elements(p.preference->'days') d
              where jsonb_array_length(coalesce(d->'ranges', '[]'::jsonb)) > 1
                 or jsonb_array_length(coalesce(d->'shift_type_ids', '[]'::jsonb)) > 0);
delete from public.manager_weekly_reminders p
where p.preference->>'input_mode' is distinct from 'time_range'
   or exists (select 1 from jsonb_array_elements(p.preference->'days') d
              where jsonb_array_length(coalesce(d->'ranges', '[]'::jsonb)) > 1
                 or jsonb_array_length(coalesce(d->'shift_type_ids', '[]'::jsonb)) > 0);

update public.employee_weekly_preferences p set preference = jsonb_build_object('days', (
  select jsonb_agg(jsonb_build_object('day', d->'day', 'all_day', d->'all_day', 'ranges', d->'ranges') order by (d->>'day')::integer)
  from jsonb_array_elements(p.preference->'days') d));
update public.manager_weekly_reminders p set preference = jsonb_build_object('days', (
  select jsonb_agg(jsonb_build_object('day', d->'day', 'all_day', d->'all_day', 'ranges', d->'ranges') order by (d->>'day')::integer)
  from jsonb_array_elements(p.preference->'days') d));

-- The empty week has no mode to be asked for.
drop function public.empty_weekly_preference(text);
create function public.empty_weekly_preference() returns jsonb
  language sql immutable
  set search_path to ''
as $$
 select jsonb_build_object('days',jsonb_agg(jsonb_build_object('day',day,'all_day',false,'ranges','[]'::jsonb) order by day))
 from generate_series(0,6) day;
$$;
revoke all on function public.empty_weekly_preference() from public, anon, authenticated, service_role;

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
$$;

-- A shift type's default hours are the shift type's own rule; availability no
-- longer reads them, so the organization's entry mode leaves the check.
CREATE OR REPLACE FUNCTION "public"."guard_weekly_preference_type_hours"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare must_have_hours boolean;
begin
 if new.archived_at is not null or new.deleted_at is not null then return new; end if;
 if tg_op='INSERT' then must_have_hours:=true;
 else must_have_hours:=old.archived_at is not null or old.deleted_at is not null
   or (new.default_start_time,new.default_end_time) is distinct from (old.default_start_time,old.default_end_time);
 end if;
 if must_have_hours and (new.default_start_time is null or new.default_end_time is null
  or new.default_start_time=new.default_end_time or new.default_start_time='24:00'::time) then
  raise exception 'Set valid default start and end times for this shift type' using errcode='22023'; end if;
 return new;
end; $$;

CREATE OR REPLACE FUNCTION "public"."validate_weekly_preference_command"("actor" "uuid", "w" "uuid", "command" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare model jsonb; prior jsonb; pref jsonb:=command->'preference'; source text:=command->>'source'; copied boolean:=false;
 notes jsonb:=command->'notes';
begin
 model:=public.weekly_preferences_read_service(actor,w,(command->>'employee_id')::uuid);
 perform app_private.weekly_preference_may_write(actor,w,source,model);
 if not public.weekly_preference_valid(pref) then raise exception 'Check the weekly unavailable hours' using errcode='22023'; end if;
 perform 1 from public.workspace_scheduling_settings where workspace_id=w for share;
 model:=public.weekly_preferences_read_service(actor,w,(command->>'employee_id')::uuid);
 prior:=model->source;
 if (command->>'expected_revision')::integer is distinct from (prior->>'revision')::integer then raise exception 'Availability changed. Reload before saving; your draft has not been saved.' using errcode='PT409',hint='availability.changed'; end if;
 if (command->>'settings_revision')::integer is distinct from (model->'settings'->>'revision')::integer then raise exception 'Availability settings changed. Reload before saving.' using errcode='PT409',hint='availability.changed'; end if;
 if source='employee' and (command ? 'notes' or command ? 'enabled' or command ? 'copy_employee_revision') then raise exception 'Manager fields cannot be saved with employee preferences' using errcode='42501'; end if;
 if source='manager' then
  if jsonb_typeof(command->'enabled') is distinct from 'boolean' or jsonb_typeof(notes) is distinct from 'array' or jsonb_array_length(notes)<>7
   or exists(select 1 from jsonb_array_elements(notes) n where jsonb_typeof(n)<>'string' or length(n#>>'{}')>1000) then raise exception 'Include reminder state and seven valid notes' using errcode='22023'; end if;
  if command ? 'copy_employee_revision' then
   if not (model->'employee'->>'submitted')::boolean or (command->>'copy_employee_revision')::integer is distinct from (model->'employee'->>'revision')::integer
    or pref is distinct from model->'employee'->'preference' then raise exception 'Employee preferences changed. Copy the latest saved week again.' using errcode='PT409',hint='availability.changed'; end if;
   copied:=true;
  end if;
  if not (prior->>'enabled')::boolean and not (command->>'enabled')::boolean and (pref<>prior->'preference' or notes<>prior->'notes' or copied) then
   raise exception 'Turn reminders on before editing or copying' using errcode='22023'; end if;
 end if;
 return model;
end; $$;

CREATE OR REPLACE FUNCTION "public"."version_weekly_preference_settings"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
 if new.availability_onboarding_required is distinct from old.availability_onboarding_required then
  if auth.uid() is not null then raise exception 'Use Availability settings to save these changes' using errcode='42501'; end if;
  new.availability_preferences_revision:=old.availability_preferences_revision+1;
 else new.availability_preferences_revision:=old.availability_preferences_revision; end if;
 return new;
end; $$;


CREATE OR REPLACE FUNCTION "public"."weekly_preference_capacity"("w" "uuid", "emp" "uuid", "target_span" "tstzrange", "zone_name" "text", "proposed" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare employee_week jsonb; manager_week jsonb; employee_ranges tstzmultirange:='{}'; manager_ranges tstzmultirange:='{}';
begin
 if not exists(select 1 from public.employee_profiles where workspace_id=w and id=emp) then raise exception 'Employee not found' using errcode='42501'; end if;
 if target_span is null or isempty(target_span) then raise exception 'A valid assignment span is required' using errcode='22023'; end if;
 select preference into employee_week from public.employee_weekly_preferences where workspace_id=w and employee_id=emp;
 employee_week:=coalesce(proposed,employee_week,public.empty_weekly_preference());
 employee_ranges:=public.weekly_preference_intersections(w,employee_week,target_span,zone_name);
 select preference into manager_week from public.manager_weekly_reminders where workspace_id=w and employee_id=emp and enabled;
 if manager_week is not null then manager_ranges:=public.weekly_preference_intersections(w,manager_week,target_span,zone_name); end if;
 return jsonb_build_object('employee_intervals',public.availability_ranges_json(employee_ranges),
  'manager_intervals',public.availability_ranges_json(manager_ranges));
end; $$;


CREATE OR REPLACE FUNCTION "public"."weekly_preference_intersections"("w" "uuid", "preference" "jsonb", "target_span" "tstzrange", "zone_name" "text") RETURNS "tstzmultirange"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare result tstzmultirange:='{}'; piece record; local_day date; last_day date; rule jsonb;
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
   if (rule->>'all_day')::boolean then clocks:='[{"start":"00:00","end":"24:00"}]';
   else clocks:=rule->'ranges'; end if;
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
end; $$;

CREATE OR REPLACE FUNCTION "public"."weekly_preference_settings_read_service"("actor" "uuid", "w" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare settings public.workspace_scheduling_settings%rowtype; can_edit boolean;
begin
 perform app_private.authorize(actor,w,'settings.availability.read');
 can_edit:=app_private.authz_reason(actor,w,'settings.availability.write') is null;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 if not found then raise exception 'Availability settings not found' using errcode='P0002'; end if;
 return jsonb_build_object('settings',jsonb_build_object(
  'onboarding_required',settings.availability_onboarding_required,'revision',settings.availability_preferences_revision),
  'can_edit',can_edit);
end; $$;

CREATE OR REPLACE FUNCTION "public"."weekly_preference_settings_save_service"("actor" "uuid", "w" "uuid", "command" "jsonb", "request_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare model jsonb; prior jsonb; stored public.weekly_preference_commands%rowtype;
 envelope jsonb:=jsonb_build_object('kind','settings','value',command);
begin
 perform public.availability_lock_workspace(w);
 perform app_private.authorize(actor,w,'settings.availability.write');
 model:=public.weekly_preference_settings_read_service(actor,w);
 if request_key is null then raise exception 'A save key is required' using errcode='22023'; end if;
 select * into stored from public.weekly_preference_commands q where q.workspace_id=w and q.actor_user_id=actor and q.request_key=weekly_preference_settings_save_service.request_key;
 if found then
  if stored.command<>envelope then raise exception 'Idempotency key was used for another save' using errcode='22023'; end if;
  return model;
 end if;
 -- The only availability setting is whether onboarding asks for it.
 if jsonb_typeof(command) is distinct from 'object' or (command-array['onboarding_required','expected_revision'])<>'{}'::jsonb
  or jsonb_typeof(command->'onboarding_required') is distinct from 'boolean'
  or jsonb_typeof(command->'expected_revision') is distinct from 'number' or (command->>'expected_revision') !~ '^[0-9]+$' then
  raise exception 'Choose valid availability settings' using errcode='22023'; end if;
 perform 1 from public.workspace_scheduling_settings where workspace_id=w for update;
 model:=public.weekly_preference_settings_read_service(actor,w); prior:=model->'settings';
 if (command->>'expected_revision')::integer is distinct from (prior->>'revision')::integer then
  raise exception 'Availability settings changed. Reload the latest settings before saving.' using errcode = 'PT409',hint='availability.changed'; end if;
 if (command-'expected_revision') is distinct from (prior-'revision') then
  update public.workspace_scheduling_settings set
   availability_onboarding_required=(command->>'onboarding_required')::boolean,updated_at=now() where workspace_id=w;
  model:=public.weekly_preference_settings_read_service(actor,w);
  insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata)
   values(w,actor,'availability.settings_updated','scheduling_settings',w::text,jsonb_build_object('before',prior,'after',model->'settings'));
 end if;
 insert into public.weekly_preference_commands(workspace_id,actor_user_id,request_key,command,result) values(w,actor,request_key,envelope,'{}');
 return model;
end; $_$;

CREATE OR REPLACE FUNCTION "public"."weekly_preference_valid"("preference" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $_$
declare rule jsonb; seen integer[]:='{}'; weekday integer; piece jsonb;
begin
 -- A week is seven days and nothing else; a day is a whole day or at most one
 -- range of hours (Mert, 2026-10-16: "yalnız saat", "kural da 1'e insin").
 if jsonb_typeof(preference) is distinct from 'object' or (preference-'days')<>'{}'::jsonb
  or jsonb_typeof(preference->'days') is distinct from 'array' or jsonb_array_length(preference->'days')<>7 then return false; end if;
 for rule in select value from jsonb_array_elements(preference->'days') loop
  if jsonb_typeof(rule) is distinct from 'object' or (rule-array['day','all_day','ranges'])<>'{}'::jsonb
   or jsonb_typeof(rule->'day') is distinct from 'number'
   or (rule->>'day') !~ '^[0-6]$' or jsonb_typeof(rule->'all_day') is distinct from 'boolean'
   or jsonb_typeof(rule->'ranges') is distinct from 'array' or jsonb_array_length(rule->'ranges')>1 then return false; end if;
  weekday:=(rule->>'day')::integer;
  if weekday=any(seen) then return false; end if;
  seen:=array_append(seen,weekday);
  if (rule->>'all_day')::boolean and jsonb_array_length(rule->'ranges')>0 then return false; end if;
  -- The day's range is within the day.
  for piece in select value from jsonb_array_elements(rule->'ranges') loop
   if jsonb_typeof(piece) is distinct from 'object' or (piece-array['start','end'])<>'{}'::jsonb
    or jsonb_typeof(piece->'start') is distinct from 'string' or jsonb_typeof(piece->'end') is distinct from 'string'
    or (piece->>'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or (piece->>'end') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
    or (piece->>'end')<=(piece->>'start') then return false; end if;
  end loop;
 end loop;
 return true;
exception when invalid_text_representation or invalid_parameter_value then return false;
end; $_$;
CREATE OR REPLACE FUNCTION "public"."weekly_preferences_read_service"("actor" "uuid", "w" "uuid", "emp" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare employee public.employee_profiles%rowtype; settings public.workspace_scheduling_settings%rowtype;
 own_record boolean; can_manage boolean; can_read boolean; can_view_manager boolean; employee_record jsonb; manager_record jsonb;
begin
 select * into employee from public.employee_profiles e where e.workspace_id=w and (e.id=emp or (emp is null and e.user_id=actor)) and e.archived_at is null;
 if employee.id is null then
  -- Nobody there: the same no as somebody out of reach (a non-member hears that first).
  perform app_private.authorize(actor,w,'availability.own',target_person=>emp);
  raise exception 'Not allowed' using errcode='42501',hint='authz.out_of_scope',detail='availability.own';
 end if;
 -- One's own week is an employee's own action (M13), asked of the core.
 own_record:=app_private.authz_reason(actor,w,'availability.own',target_person=>employee.id) is null;
 can_manage:=public.weekly_preference_manager_scope(actor,w,employee.id,'availability.manage');
 can_read:=public.weekly_preference_manager_scope(actor,w,employee.id,'availability.read');
 -- The Manager note exists for employees only (availability.note_read).
 can_view_manager:=can_manage or public.weekly_preference_manager_scope(actor,w,employee.id,'availability.note');
 if not own_record and not can_read and not can_view_manager then
  -- The core says why: their own week, or somebody else's.
  perform app_private.authorize(actor,w,case when employee.user_id=actor then 'availability.own' else 'availability.team_read' end,target_person=>employee.id);
  raise exception 'Not allowed' using errcode='42501',hint='authz.out_of_scope',detail='availability.team_read';
 end if;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 if settings.workspace_id is null then raise exception 'Scheduling settings unavailable' using errcode='P0002'; end if;
 select jsonb_build_object('revision',p.revision,'submitted',true,'updated_at',p.updated_at,'preference',p.preference) into employee_record
  from public.employee_weekly_preferences p where p.workspace_id=w and p.employee_id=employee.id;
 employee_record:=coalesce(employee_record,jsonb_build_object('revision',0,'submitted',false,'updated_at',null,'preference',public.empty_weekly_preference()));
 if can_view_manager then
  select jsonb_build_object('revision',p.revision,'submitted',true,'updated_at',p.updated_at,'preference',p.preference,'enabled',p.enabled,'notes',to_jsonb(p.notes)) into manager_record
   from public.manager_weekly_reminders p where p.workspace_id=w and p.employee_id=employee.id;
  manager_record:=coalesce(manager_record,jsonb_build_object('revision',0,'submitted',false,'updated_at',null,'preference',public.empty_weekly_preference(),'enabled',true,'notes',jsonb_build_array('','','','','','','')));
 end if;
 return jsonb_build_object('employee_id',employee.id,'employee_name',concat_ws(' ',coalesce(nullif(employee.preferred_name,''),employee.first_name),employee.last_name),
  'can_edit_employee',own_record,'can_manage',can_manage,
  'settings',jsonb_build_object(
   'onboarding_required',settings.availability_onboarding_required,'revision',settings.availability_preferences_revision),
  'employee',employee_record,'time_format',settings.time_format)
  -- The manager part: the note when it is this reader's to see; null for an
  -- employee's note they may not see; left out when there is no note at all
  -- (the person is not an employee).
  || case when can_view_manager then jsonb_build_object('manager',manager_record)
     when app_private.ranks_as_employee(w,employee.user_id) then jsonb_build_object('manager',null)
     else '{}'::jsonb end;
end; $$;
CREATE OR REPLACE FUNCTION "public"."weekly_preferences_save_service"("actor" "uuid", "w" "uuid", "command" "jsonb", "request_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare emp uuid:=(command->>'employee_id')::uuid; source text:=command->>'source'; model jsonb; prior jsonb; preference jsonb;
 old_command public.weekly_preference_commands%rowtype; event uuid:=gen_random_uuid(); result jsonb:='{}';
 summary text; changed_days text;
begin
 if request_key is null then raise exception 'Idempotency key required' using errcode='22023'; end if;
 perform public.availability_lock_workspace(w);
 -- Authorize again before idempotent replay; never return a stored private read model.
 model:=public.weekly_preferences_read_service(actor,w,emp);
 perform app_private.weekly_preference_may_write(actor,w,source,model);
 select * into old_command from public.weekly_preference_commands q where q.workspace_id=w and q.actor_user_id=actor and q.request_key=weekly_preferences_save_service.request_key;
 if old_command.request_key is not null then
  if old_command.command<>command then raise exception 'Idempotency key was used for another save' using errcode='22023'; end if;
  return old_command.result||jsonb_build_object('model',model);
 end if;
 model:=public.validate_weekly_preference_command(actor,w,command); prior:=model->source;
 emp:=(model->>'employee_id')::uuid;
 -- A pending swap, cover or pickup is never asked about and never changed:
 -- the employee withdraws one in Shift Hub if they want to (M5).
 preference:=command->'preference';
 insert into public.weekly_preference_events(id,workspace_id,employee_id,source,actor_user_id,before_record,after_record)
  values(event,w,emp,source,actor,prior,'{}');
 if source='employee' then
  insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
   values(w,emp,preference,1,actor) on conflict(workspace_id,employee_id) do update set preference=excluded.preference,revision=employee_weekly_preferences.revision+1,updated_by=actor,updated_at=now();
  update public.employee_onboarding_requirements set status='completed',completed_at=now(),rejection_reason=null,updated_at=now() where workspace_id=w and employee_id=emp and kind='availability';
  update public.employee_onboarding_cases set revision=revision+1,updated_at=now() where workspace_id=w and employee_id=emp;
 else
  insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,enabled,notes,revision,updated_by)
   values(w,emp,preference,(command->>'enabled')::boolean,array(select jsonb_array_elements_text(command->'notes')),1,actor)
   on conflict(workspace_id,employee_id) do update set preference=excluded.preference,enabled=excluded.enabled,notes=excluded.notes,revision=manager_weekly_reminders.revision+1,updated_by=actor,updated_at=now();
 end if;
 model:=public.weekly_preferences_read_service(actor,w,emp);
 update public.weekly_preference_events set after_record=model->(command->>'source') where id=event;
 select string_agg((array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[(d->>'day')::integer+1],', ' order by (d->>'day')::integer) into changed_days
 from jsonb_array_elements(preference->'days') d
 where d is distinct from (select value from jsonb_array_elements(prior->'preference'->'days') where value->'day'=d->'day');
 summary:=case when source='manager' then 'Manager reminders updated.' else 'Weekly availability updated. '||case when changed_days is null then 'Week confirmed.' else 'Changed days: '||changed_days||'.' end end;
 insert into public.employee_events(workspace_id,employee_id,actor_user_id,action,summary) values(w,emp,actor,case when source='manager' then 'manager_reminders_updated' else 'weekly_availability_updated' end,summary);
 insert into public.weekly_preference_commands(workspace_id,actor_user_id,request_key,command,result) values(w,actor,request_key,command,result);
 return result||jsonb_build_object('model',model);
end; $$;
CREATE OR REPLACE FUNCTION "public"."weekly_team_read_service"("actor" "uuid", "w" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare result jsonb; read_scope uuid[]; org_wide boolean;
begin
 read_scope:=app_private.scope_set(actor,w,'availability.team_read');
 -- Nowhere to read the team's availability: asked with nobody named, the core says
 -- why; with no live location in the workspace, only the people with none show.
 if cardinality(read_scope)=0 and (app_private.authz_reason(actor,w,'availability.team_read') is distinct from 'out_of_scope'
  or exists(select 1 from public.locations l where l.workspace_id=w and l.deleted_at is null)) then
  perform app_private.authorize(actor,w,'availability.team_read');
 end if;
 org_wide:=app_private.authz_reason(actor,w,'availability.team_read','{}'::uuid[]) is null;
 with scope as materialized (
  select l.id,l.name,l.sort_order from public.locations l where l.workspace_id=w and l.archived_at is null
   and l.id=any(read_scope)
 ), people as materialized (
  select e.id,e.employee_code,coalesce(nullif(e.preferred_name,''),e.first_name)||' '||e.last_name display_name,
   coalesce((select jsonb_agg(a.location_id order by a.location_id) from public.employee_location_assignments a
    join scope s on s.id=a.location_id where a.workspace_id=w and a.employee_id=e.id and a.ended_at is null),'[]') location_ids,
   -- The job the Employees list names (list_employees_service): the stored
   -- primary; failing that the Owner job, then the first job A to Z.
   (select job.name from public.employee_job_assignments assignment
     join public.jobs job on job.id=assignment.job_id
     where assignment.employee_id=e.id and assignment.ended_at is null
      and (assignment.is_primary or job.archived_at is null)
     order by assignment.is_primary desc,coalesce(job.system_key='owner',false) desc,lower(job.name),job.id
     limit 1) job_name,
   p.employee_id is not null submitted,coalesce(p.preference,public.empty_weekly_preference()) preference,
   p.updated_at,
   (public.weekly_preference_manager_scope(actor,w,e.id,'availability.read')
    or public.weekly_preference_manager_scope(actor,w,e.id,'availability.manage')) can_open
  from public.employee_profiles e
  left join public.employee_weekly_preferences p on p.workspace_id=e.workspace_id and p.employee_id=e.id
  -- Only an employee enters availability (M13): nobody ranking above one is
  -- listed, nor counted as a week not submitted (KK-178). Somebody not joined
  -- yet has no account to rank by: the role they were last invited with says.
  where e.workspace_id=w and e.archived_at is null and app_private.ranks_as_employee(w,e.user_id)
   and (e.user_id is not null or coalesce((select app_private.authz_rank(r.access_class)=app_private.authz_rank('employee')
    from public.employee_invitations i join public.workspace_roles r on r.id=i.role_id and r.workspace_id=i.workspace_id
    where i.workspace_id=w and i.employee_id=e.id order by i.created_at desc,i.id desc limit 1),true)) and (
   exists(select 1 from public.employee_location_assignments a join scope l on l.id=a.location_id
    where a.workspace_id=w and a.employee_id=e.id and a.ended_at is null)
   or (not exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=e.id and a.ended_at is null)
    and org_wide)
  )
 )
 select jsonb_build_object(
  'locations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by sort_order,name,id) from scope),'[]'),
  'time_format',(select time_format from public.workspace_scheduling_settings where workspace_id=w),
  'employees',coalesce((select jsonb_agg(to_jsonb(p) order by display_name,employee_code,id) from people p),'[]')
 ) into result;
 return result;
end; $$;

-- What only the entry mode needed goes.
drop function public.weekly_preference_convert(uuid, jsonb, text);
drop function app_private.weekly_preference_whole_days(uuid, jsonb);
drop trigger weekly_preference_type_defaults on public.shift_types;
drop function public.capture_weekly_preference_type_defaults();
drop table public.weekly_preference_type_defaults;
alter table public.workspace_scheduling_settings drop column availability_input_mode;

alter table public.employee_weekly_preferences
  add constraint employee_weekly_preferences_preference_check check (public.weekly_preference_valid(preference));
alter table public.manager_weekly_reminders
  add constraint manager_weekly_reminders_preference_check check (public.weekly_preference_valid(preference));
