-- ROL-CIFT 2.1 (KARARLAR S-164 ... S-169; design §4.4): only somebody with the employee access is
-- scheduled. The exchange engine says why a person without it may not take a shift
-- (no_employee_access); every exchange list (cover candidates, swap targets, the release pool) reads
-- that engine, so it filters them too. The Schedule grid lists only people with the employee access.
-- The employee detail names the record's two access slots, so the Employees drawer shows
-- "Exclude from schedule" only to somebody who can be scheduled (2.2).
--
-- Riskli canlı migration: three existing SECURITY DEFINER functions change their bodies
-- (CREATE OR REPLACE); app_private.eligibility, get_schedule_read_model_service and
-- get_employee_detail_service keep their signatures.

CREATE OR REPLACE FUNCTION "app_private"."eligibility"("w" "uuid", "emp" "uuid", "shift" "jsonb", "ctx" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
 op text:=ctx->>'operation';
 excluded uuid[]:=array(select value::uuid from jsonb_array_elements_text(
  case when jsonb_typeof(ctx->'excluded')='array' then ctx->'excluded' else '[]'::jsonb end) where value is not null);
 loc uuid:=(shift->>'location_id')::uuid; d date:=(shift->>'date')::date;
 tz text; span tstzrange; a jsonb; settings public.workspace_scheduling_settings%rowtype;
 blockers jsonb:='[]'; acks jsonb:='[]'; flags jsonb:='[]'; r jsonb;
 travel numeric; rest numeric; gap numeric; n record; near numeric; near_travel numeric;
begin
 if op is null or op not in ('swap','release_pickup','cover_accept') then
  raise exception 'Unknown exchange operation' using errcode='22023'; end if;
 if nullif(shift->>'start_time','') is null or nullif(shift->>'end_time','') is null then
  return jsonb_build_object('employee_id',emp,'operation',op,'eligible',false,'status','verification_required',
   'blockers',jsonb_build_array(jsonb_build_object('code','hours_unconfirmed','message','A manager must confirm the shift hours before a full-shift exchange')),
   'acknowledgements','[]'::jsonb,'approval_flags','[]'::jsonb,'approvals_required',jsonb_build_array(loc),
   'reasons',jsonb_build_array('A manager must confirm the shift hours before a full-shift exchange'));
 end if;
 select coalesce(nullif(shift->>'time_timezone',''),nullif(shift->'time_snapshot'->>'timezone',''),l.timezone) into tz
  from public.locations l where l.id=loc and l.workspace_id=w and l.archived_at is null;
 if tz is null then raise exception 'location not found'; end if;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 span:=app_private.shift_time_range(d,(shift->>'start_time')::time,(shift->>'end_time')::time,tz);

 if not exists(select 1 from public.employee_profiles e join public.workspace_memberships m
  on m.workspace_id=e.workspace_id and m.user_id=e.user_id and m.status='active' where e.workspace_id=w and e.id=emp) then
  blockers:=blockers||jsonb_build_array(jsonb_build_object('code','workspace_access','message','Active workspace access is required')); end if;
 -- ROL-CIFT 2.1: a shift is somebody's to take only with the employee access; who only manages is
 -- never scheduled.
 if not app_private.has_employee_access(w,(select e.user_id from public.employee_profiles e where e.workspace_id=w and e.id=emp)) then
  blockers:=blockers||jsonb_build_array(jsonb_build_object('code','no_employee_access','message','Employee access is required')); end if;
 if not exists(select 1 from public.employee_location_assignments x where x.workspace_id=w and x.employee_id=emp and x.location_id=loc
  and x.assigned_at<=lower(span) and (x.ended_at is null or x.ended_at>=upper(span))) then
  blockers:=blockers||jsonb_build_array(jsonb_build_object('code','location_assignment','message','Not assigned to this location')); end if;
 if not exists(select 1 from public.employee_job_assignments x where x.workspace_id=w and x.employee_id=emp and x.job_id=(shift->>'job_id')::uuid
  and x.assigned_at<=lower(span) and (x.ended_at is null or x.ended_at>=upper(span))) then
  blockers:=blockers||jsonb_build_array(jsonb_build_object('code','job_assignment','message','Not eligible for this position')); end if;
 -- Documents stay as they are today (out of scope 2): an expired blocking document,
 -- and any document rule the conflict settings raise, below.
 if public.employee_has_hard_document_schedule_conflict_service(w,emp,d) then
  blockers:=blockers||jsonb_build_array(jsonb_build_object('code','document_expired','message','Required document is expired')); end if;

 -- The assessment reads the shift the way Schedule does; '_shift_exchange'
 -- keeps travel and rest out of it, they are flags here (D7).
 a:=public.assess_weekly_shift_availability(w,emp,shift||jsonb_build_object('scheduled_date',d,
  '_exclude_shift_ids',to_jsonb(excluded),'_shift_exchange',true));
 for r in select value from jsonb_array_elements(a->'reasons') loop
  if r->>'code' not in ('availability','note') and not blockers @> jsonb_build_array(jsonb_build_object('code',r->>'code')) then
   blockers:=blockers||jsonb_build_array(jsonb_build_object('code',r->>'code','message',r->>'message')); end if;
 end loop;
 -- Approved time off is a blocker like the reasons above, even by a minute
 -- and for the person themselves (KARARLAR §1.1, 2026-10-09; BL-995).
 if coalesce((a->>'has_availability_conflict')::boolean,false) and jsonb_array_length(coalesce(a->'employee_intervals','[]'))>0 then
  acks:=acks||jsonb_build_array(jsonb_build_object('code','availability','intervals',a->'employee_intervals'));
  flags:=flags||jsonb_build_array(jsonb_build_object('code','availability_consent'));
 end if;
 if jsonb_array_length(coalesce(a->'manager_intervals','[]'))>0 then
  flags:=flags||jsonb_build_array(jsonb_build_object('code','manager_note')); end if;

 -- Travel and rest, measured against the person's other published shifts (D7).
 for n in select p.location_id,app_private.shift_time_range(p.scheduled_date,p.start_time,p.end_time,coalesce(p.time_timezone,l.timezone)) r
  from public.schedule_published_shifts p join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
  join public.locations l on l.id=p.location_id
  where p.workspace_id=w and p.employee_id=emp and p.scheduled_date between d-2 and d+2
   and not p.id=any(excluded) and not coalesce(p.source_shift_id,p.id)=any(excluded)
 loop
  if n.r && span then continue; end if;
  gap:=extract(epoch from greatest(lower(span)-upper(n.r),lower(n.r)-upper(span)))/60;
  near:=least(coalesce(near,gap),gap);
  if n.location_id<>loc then near_travel:=least(coalesce(near_travel,gap),gap); end if;
  if n.location_id<>loc and gap<settings.minimum_travel_minutes then travel:=least(coalesce(travel,gap),gap); end if;
  if gap<settings.minimum_rest_minutes then rest:=least(coalesce(rest,gap),gap); end if;
 end loop;
 if travel is not null then flags:=flags||jsonb_build_array(jsonb_build_object('code','minimum_travel',
  'gap_minutes',travel::integer,'rule_minutes',settings.minimum_travel_minutes)); end if;
 if rest is not null then flags:=flags||jsonb_build_array(jsonb_build_object('code','minimum_rest',
  'gap_minutes',rest::integer,'rule_minutes',settings.minimum_rest_minutes)); end if;

 return jsonb_build_object('employee_id',emp,'operation',op,'eligible',jsonb_array_length(blockers)=0,
  'status',case when jsonb_array_length(blockers)=0 then 'eligible' else 'ineligible' end,
  'blockers',blockers,'acknowledgements',acks,'approval_flags',flags,'approvals_required',jsonb_build_array(loc),
  'reasons',case when jsonb_array_length(blockers)=0 then '["Position and location match","No assignment blockers"]'::jsonb
   else (select jsonb_agg(b->>'message') from jsonb_array_elements(blockers) b) end)
  ||case when coalesce((ctx->>'with_assessment')::boolean,false) then jsonb_build_object('assessment',a) else '{}'::jsonb end
  -- C2: the swap review names the rule that holds too ("12 h of rest / 10 h needed").
  ||case when coalesce((ctx->>'with_measures')::boolean,false) then jsonb_build_object('measures',jsonb_build_object(
   'rest_gap_minutes',near::integer,'travel_gap_minutes',near_travel::integer,
   'rest_rule_minutes',settings.minimum_rest_minutes,'travel_rule_minutes',settings.minimum_travel_minutes)) else '{}'::jsonb end;
end;
$$;



CREATE OR REPLACE FUNCTION "public"."get_schedule_read_model_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  settings public.workspace_scheduling_settings%rowtype;
  resolved_week_start date;
  -- ponytail: one mode today, live shifts elsewhere as ghosts. B4's
  -- published-plan preview (FB-6.1b) is a second way to fill ghost_shifts,
  -- not a second read.
  reach uuid[] := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.read');
  result jsonb;
begin
  -- Nowhere to read: the core says why. A workspace with no live location
  -- reads as empty to whoever would reach it, rather than refusing the owner.
  if cardinality(reach) = 0
     and (app_private.authz_reason(actor_user_id, target_workspace_id, 'schedule.read') is distinct from 'out_of_scope'
          or exists (select 1 from public.locations l where l.workspace_id = target_workspace_id and l.deleted_at is null)) then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.read');
  end if;

  select * into settings
  from public.workspace_scheduling_settings
  where workspace_id = target_workspace_id;
  if settings.workspace_id is null then
    raise exception 'scheduling settings are unavailable' using errcode = 'P0002';
  end if;

  resolved_week_start := case settings.week_start_day
    when 'sunday' then target_date - extract(dow from target_date)::integer
    else target_date - (extract(isodow from target_date)::integer - 1)
  end;

  with allowed_locations as (
    select location.*
    from public.locations location
    where location.workspace_id = target_workspace_id
      and location.archived_at is null
      and location.id = any(reach)
  ), current_publications as (
    select publication.*
    from public.schedule_location_publications publication
    join allowed_locations location on location.id = publication.location_id
    where publication.week_start = resolved_week_start
      and publication.status = 'current'
  ), visible_employees as (
    select distinct employee.*
    from public.employee_profiles employee
    where employee.workspace_id = target_workspace_id
      and employee.archived_at is null
      and exists (
        select 1
        from public.employee_location_assignments assignment
        join allowed_locations location on location.id = assignment.location_id
        where assignment.employee_id = employee.id and assignment.ended_at is null
      )
      -- ROL-CIFT 2.1: the grid is the people who can be scheduled; who only manages is not on it.
      and app_private.has_employee_access(target_workspace_id, employee.user_id)
  ), current_shifts as (
    select shift.*
    from public.schedule_published_shifts shift
    join current_publications publication on publication.id = shift.publication_id
    where shift.scheduled_date between resolved_week_start and resolved_week_start + 6
  ), ghost_shifts as (
    -- A shift somebody on this grid works at a location the actor does not
    -- reach: what the shift card says, not its note (REUSE B1, FB-6.1 T3).
    select shift.id, shift.employee_id, shift.location_id, location.name as location_name,
      shift.scheduled_date, shift.start_time, shift.end_time, shift.crosses_midnight,
      shift.job_id, job.name as job_name, shift.shift_type_id, shift_type.name as shift_type_name,
      shift.label_ids, shift.label_names
    from visible_employees employee
    join public.schedule_published_shifts shift
      on shift.employee_id = employee.id
     and shift.scheduled_date between resolved_week_start and resolved_week_start + 6
    join public.schedule_location_publications publication
      on publication.id = shift.publication_id and publication.status = 'current'
     and publication.week_start = resolved_week_start
    join public.locations location
      on location.id = shift.location_id and location.workspace_id = target_workspace_id
     and location.archived_at is null and location.deleted_at is null
    -- Names travel with the ghost, named as the grid names a real shift: the
    -- job and type, archived ones too (G8b, K8), null once deleted; the labels
    -- as the shift recorded them.
    left join public.jobs job
      on job.id = shift.job_id and job.workspace_id = target_workspace_id
     and job.deleted_at is null
    left join public.shift_types shift_type
      on shift_type.id = shift.shift_type_id and shift_type.workspace_id = target_workspace_id
     and shift_type.deleted_at is null
    where not exists (select 1 from allowed_locations allowed where allowed.id = shift.location_id)
  ), week_availability as materialized (
    select * from app_private.schedule_week_availability(
      target_workspace_id, resolved_week_start,
      (select coalesce(array_agg(employee.id), '{}') from visible_employees employee),
      (select coalesce(array_agg(location.id), '{}') from allowed_locations location))
  ), readable_notes as materialized (
    -- The note's words, by weekday from Sunday, for whoever the core lets read
    -- the note; nobody else gets them.
    -- Who last wrote it and when, named as the grid names a person (AVAIL-002).
    -- ponytail: a workspace-wide input-mode conversion also stamps the admin
    -- who changed the setting; keep the writer there if that ever misleads.
    select reminder.employee_id, to_jsonb(reminder.notes) as words,
      coalesce(nullif(author.preferred_name, ''), author.first_name) || ' ' || author.last_name as author,
      reminder.updated_at as edited_at
    from public.manager_weekly_reminders reminder
    left join public.employee_profiles author
      on author.workspace_id = reminder.workspace_id and author.user_id = reminder.updated_by
    where reminder.workspace_id = target_workspace_id and reminder.enabled
      and reminder.employee_id = any(array(select employee.id from visible_employees employee))
      and app_private.authz_reason(actor_user_id, target_workspace_id, 'availability.note_read',
        target_person => reminder.employee_id) is null
  )
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'week_start', resolved_week_start,
    'week_start_day', settings.week_start_day,
    'settings', jsonb_build_object(
      'time_format', coalesce(settings.time_format, '12h'),
      'conflict_rules', settings.conflict_rules,
      'minimum_travel_minutes', settings.minimum_travel_minutes,
      'minimum_rest_minutes', settings.minimum_rest_minutes
    ),
    'shift_labels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', label.id, 'name', label.name, 'color', label.color, 'sort_order', label.sort_order
      ) order by label.sort_order, label.name)
      from public.shift_labels label
      where label.workspace_id = target_workspace_id and label.archived_at is null
    ), '[]'::jsonb),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', location.id,
        'name', location.name,
        'timezone', location.timezone,
        'sort_order', location.sort_order,
        'publication_status', case when publication.id is null then 'unpublished' else 'published' end,
        'published_at', publication.published_at
      ) order by location.sort_order, location.name)
      from allowed_locations location
      left join current_publications publication on publication.location_id = location.id
    ), '[]'::jsonb),
    'shift_types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', shift_type.id, 'name', shift_type.name, 'color', shift_type.color,
        'sort_order', shift_type.sort_order,
        'default_revision',shift_type.default_revision,'default_start_time', case when shift_type.default_start_time is null then null else to_char(shift_type.default_start_time, 'HH24:MI') end,
        'default_end_time', case when shift_type.default_end_time is null then null else to_char(shift_type.default_end_time, 'HH24:MI') end
      ) order by shift_type.sort_order, shift_type.name)
      from public.shift_types shift_type
      where shift_type.workspace_id = target_workspace_id and shift_type.archived_at is null
    ), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', employee.id,
        'employee_code', employee.employee_code,
        'display_name', coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' ' || employee.last_name,
        'is_excluded_from_schedule', coalesce(employee.is_excluded_from_schedule, false),
        'location_ids', coalesce((select jsonb_agg(assignment.location_id order by assignment.location_id)
          from public.employee_location_assignments assignment
          join allowed_locations location on location.id = assignment.location_id
          where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
        'job_ids', coalesce((select jsonb_agg(assignment.job_id order by assignment.job_id)
          from public.employee_job_assignments assignment
          where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
        'primary_job_id', app_private.stored_primary_job(employee.id),
        -- The note's words and hours only for whoever may read the note (M12).
        'weekly_availability', coalesce((select jsonb_agg((week.projection - 'note_intervals')
            || jsonb_build_object('manager_notes', note.words,
              'note_author', note.author, 'note_edited_at', note.edited_at,
              'note_intervals', case when note.employee_id is null then '[]'::jsonb else week.projection -> 'note_intervals' end)
            order by week.location_id)
          from week_availability week
          left join readable_notes note on note.employee_id = employee.id
          where week.employee_id = employee.id
            and exists (select 1 from public.employee_location_assignments assignment
              where assignment.employee_id = employee.id and assignment.location_id = week.location_id
                and assignment.ended_at is null)), '[]'::jsonb)
      ) order by employee.last_name, employee.first_name, employee.id)
      from visible_employees employee
    ), '[]'::jsonb),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', shift.id,
        'location_id', shift.location_id,
        'employee_id', shift.employee_id,
        'job_id', shift.job_id,
        'shift_type_id', shift.shift_type_id,
        'scheduled_date', shift.scheduled_date,
        'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time', to_char(shift.start_time, 'HH24:MI'),
        'end_time', to_char(shift.end_time, 'HH24:MI'),
        'crosses_midnight', shift.crosses_midnight,
        'unpaid_break_minutes', coalesce(shift.unpaid_break_minutes, 0),
        'hide_time_on_badge', coalesce(shift.hide_time_on_badge, false),
        'note', shift.note,
        'label_ids', to_jsonb(coalesce(shift.label_ids, '{}'::uuid[])),
        'label_names', to_jsonb(coalesce(shift.label_names, '{}'::text[])),
        -- K18, M11: the employee's own mark came after the shift was first
        -- published; approved time off is no change of availability.
        'availability_changed_after_publish', mark.own_mark
          and not coalesce((shift.availability_snapshot -> 'first' ->> 'has_own_mark')::boolean, true),
        'warning_codes', to_jsonb(array_remove(array[
          case when exists (
            select 1 from public.schedule_closures closure
            where closure.workspace_id = target_workspace_id and closure.location_id = shift.location_id
              and closure.closed_date = shift.scheduled_date
              and app_private.closure_covers(closure.kind, closure.opens, closure.closes, shift.start_time, shift.end_time)
          ) then 'closed_location' end,
          -- Today's marks and approved leave: a mark made after publishing shows
          -- here too (BL-186).
          case when mark.unavailable then 'availability' end,
          case when shift.employee_id is not null and exists (
            select 1 from current_shifts other
            where other.employee_id = shift.employee_id
              and other.scheduled_date = shift.scheduled_date
              and other.id <> shift.id
              and not shift.crosses_midnight and not other.crosses_midnight
              and shift.start_time < other.end_time and shift.end_time > other.start_time
          ) then 'overlap' end
        ]::text[], null))
      ) order by shift.scheduled_date, shift.start_time, shift.id)
      from current_shifts shift
      cross join lateral (
        select shift.employee_id is not null and exists (select 1 from week_availability week
          where week.employee_id = shift.employee_id and week.location_id = shift.location_id
            and (week.unavailable + week.leave) && app_private.shift_time_range(shift.scheduled_date, shift.start_time, shift.end_time, shift.time_timezone)
        ) as unavailable,
        shift.employee_id is not null and exists (select 1 from week_availability week
          where week.employee_id = shift.employee_id and week.location_id = shift.location_id
            and week.unavailable && app_private.shift_time_range(shift.scheduled_date, shift.start_time, shift.end_time, shift.time_timezone)
        ) as own_mark
      ) mark
    ), '[]'::jsonb),
    'ghost_shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ghost.id,
        'employee_id', ghost.employee_id,
        'location_id', ghost.location_id,
        'location_name', ghost.location_name,
        'scheduled_date', ghost.scheduled_date,
        'start_time', to_char(ghost.start_time, 'HH24:MI'),
        'end_time', to_char(ghost.end_time, 'HH24:MI'),
        'crosses_midnight', ghost.crosses_midnight,
        'job_id', ghost.job_id,
        'job_name', ghost.job_name,
        'shift_type_id', ghost.shift_type_id,
        'shift_type_name', ghost.shift_type_name,
        'label_ids', to_jsonb(ghost.label_ids),
        'label_names', to_jsonb(ghost.label_names)
      ) order by ghost.scheduled_date, ghost.start_time, ghost.id)
      from ghost_shifts ghost
    ), '[]'::jsonb),
    'closures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', closure.id, 'location_id', closure.location_id,
        'closed_date', closure.closed_date, 'title', closure.title,
        'is_all_day', closure.is_all_day, 'kind', closure.kind,
        'opens', to_char(closure.opens, 'HH24:MI'), 'closes', to_char(closure.closes, 'HH24:MI'),
        'status', closure.status, 'publish_at', closure.publish_at, 'on_schedule', closure.on_schedule,
        'announcement_id', closure.announcement_id
      ) order by closure.closed_date, closure.title)
      from public.schedule_closures closure
      join allowed_locations location on location.id = closure.location_id
      where closure.workspace_id = target_workspace_id
        and closure.closed_date between resolved_week_start and resolved_week_start + 6
    ), '[]'::jsonb),
    -- Records on the Schedule that touch the week, published or scheduled (a
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
          -- The reader is a scalar subquery: worked out once per read, not per record.
          and (app_private.announcement_reaches(item, actor_user_id)
            or app_private.announcement_reason((select app_private.actor(actor_user_id, target_workspace_id)),
                 app_private.announcement_places(item.id), item.created_by, app_private.announcement_dates(item)) is null)
      ) place
      where item.workspace_id = target_workspace_id and item.status in ('published', 'scheduled')
        and item.archived_at is null and item.on_schedule and item.starts_on is not null
        and item.starts_on <= resolved_week_start + 6 and resolved_week_start <= coalesce(item.ends_on, item.starts_on)
    ), '[]'::jsonb)
  ) || app_private.schedule_departments_and_jobs(target_workspace_id)
    || app_private.schedule_referenced_catalog(target_workspace_id,
      array(select shift.job_id from current_shifts shift union select ghost.job_id from ghost_shifts ghost),
      array(select shift.shift_type_id from current_shifts shift
            union select ghost.shift_type_id from ghost_shifts ghost))
  into result;

  return result;
end;
$$;



CREATE OR REPLACE FUNCTION "public"."get_employee_detail_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_employee_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me app_private.actor_state;
  reads_private boolean;
  reads_access boolean;
  removal app_private.authz_actions;
  invite_rule app_private.authz_actions;
  answer jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.read', target_person => target_employee_id);
  me := app_private.actor(actor_user_id, target_workspace_id);
  -- The owner holds every permission.
  reads_private := me.class = 'owner' or 'employees.private.read' = any (me.permissions);
  reads_access := me.class = 'owner' or 'employee_access.read' = any (me.permissions);
  select * into removal from app_private.authz_actions action where action.key = 'employee.remove_from_location';
  if not found then
    raise exception 'core action employee.remove_from_location is missing' using errcode = '22023';
  end if;
  select * into invite_rule from app_private.authz_actions action where action.key = 'employee.invite';
  if not found then
    raise exception 'core action employee.invite is missing' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'id', employee.id,
    'workspace_id', employee.workspace_id,
    'employee_code', employee.employee_code,
    'first_name', employee.first_name,
    'last_name', employee.last_name,
    'preferred_name', employee.preferred_name,
    'display_name', concat_ws(' ', employee.first_name, employee.last_name),
    'invitation_email', employee.invitation_email,
    'account_email', account_user.email,
    'start_date', employee.start_date,
    'primary_location_id', primary_location.location_id,
    'primary_location_name', location.name,
    'location_count', (
      select count(*)
      from public.employee_location_assignments assignment
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ),
    'primary_job_id', primary_job.job_id,
    'primary_job_name', job.name,
    'job_count', (
      select count(*)
      from public.employee_job_assignments assignment
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ),
    'role_id', role.id,
    'role_name', role.name,
    -- ROL-CIFT 2.2: the record's two access slots, as app_private.has_employee_access reads the
    -- employee one (somebody with no account yet works); the drawer asks here, not the role's name.
    'access', jsonb_build_object(
      'employee', membership.id is null or membership.employee_role_id is not null,
      'management', management_role.access_class),
    'display_status', case
      when employee.archived_at is not null then 'archived'
      when membership.status = 'active' then 'active'
      when membership.status = 'pending_activation' then 'onboarding'
      when invitation.status = 'pending' and invitation.expires_at > now() then 'invited'
      else 'not_invited'
    end,
    'archived_at', employee.archived_at,
    'revision', employee.revision,
    'user_id', employee.user_id,
    'internal_note', employee.internal_note,
    'is_remote', employee.is_remote,
    'is_excluded_from_schedule', employee.is_excluded_from_schedule,
    -- Whether this is the workspace owner's record: the drawer asks here, not
    -- the role's name (BL-421).
    'is_workspace_owner', app_private.employee_record_is_workspace_owner(employee.workspace_id, employee.id),
    -- null only when the reader may not read it. Somebody with nothing on file
    -- yet reads as an empty profile: no names, nothing given, the defaults the
    -- shared employeeDetailSchema needs (7b QA finding 1, shape agreed with
    -- nf-backend).
    'private_contact', case
      when not reads_private then null
      else jsonb_strip_nulls(jsonb_build_object(
        'legal_first_name', private_profile.legal_first_name,
        'legal_last_name', private_profile.legal_last_name,
        'preferred_name', private_profile.preferred_name
      )) || jsonb_build_object(
        'phone', private_profile.phone,
        'street_address', private_profile.street_address,
        'city', private_profile.city,
        'region', private_profile.region,
        'postal_code', private_profile.postal_code,
        'country_code', private_profile.country_code,
        'date_of_birth', private_profile.date_of_birth,
        'emergency_contact_name', private_profile.emergency_contact_name,
        'emergency_contact_relationship', private_profile.emergency_contact_relationship,
        'emergency_contact_phone', private_profile.emergency_contact_phone,
        'emergency_contact_email', coalesce(private_profile.emergency_contact_email, ''),
        'share_phone_with_teammates', coalesce(private_profile.share_phone_with_teammates, false),
        'share_email_with_teammates', coalesce(private_profile.share_email_with_teammates, false)
      )
    end,
    'locations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', assignment.location_id,
          'name', assigned_location.name,
          'primary', assignment.is_primary,
          'archived', assigned_location.archived_at is not null,
          -- May the reader take them off this location.
          'removable', app_private.authz_check(me, removal, array[assignment.location_id], employee.id, null) is null
        )
        order by assignment.is_primary desc, assigned_location.name
      )
      from public.employee_location_assignments assignment
      join public.locations assigned_location on assigned_location.id = assignment.location_id
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', assignment.job_id,
          'name', assigned_job.name,
          'primary', assignment.is_primary,
          'archived', assigned_job.archived_at is not null
        )
        order by assignment.is_primary desc, lower(assigned_job.name), assigned_job.id
      )
      from public.employee_job_assignments assignment
      join public.jobs assigned_job on assigned_job.id = assignment.job_id
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ), '[]'::jsonb),
    'invitation', case
      -- Who reads access reads it; so does whoever its buttons answer to
      -- (employee.invite, a role they may give; BL-1069).
      when invitation.id is null or not (reads_access
        or (app_private.authz_check(me, invite_rule, null, employee.id, null) is null
          and app_private.can_invite_with_role(actor_user_id, target_workspace_id, invitation.role_id))) then null
      else jsonb_build_object(
        'id', invitation.id,
        'email', invitation.email,
        'role_id', invitation.role_id,
        'status', invitation.status,
        'expires_at', invitation.expires_at,
        'sent_at', invitation.sent_at,
        'delivery_status', invitation.delivery_status,
        'delivery_attempted_at', invitation.delivery_attempted_at,
        'delivery_failed_at', invitation.delivery_failed_at,
        'delivery_error', invitation.delivery_error,
        'role_name', invitation_role.name,
        'invited_by_name', coalesce(
          nullif(btrim(inviter_profile.display_name), ''),
          inviter_user.email
        )
      )
    end,
    'onboarding', jsonb_build_object(
      'status', case
        when membership.status = 'pending_activation' then 'in_progress'
        when invitation.status = 'pending' then 'invited'
        else 'not_requested'
      end,
      'required_documents', (
        select count(*)
        from public.document_types document_type
        where document_type.workspace_id = employee.workspace_id
          and document_type.required_at_onboarding
          and document_type.archived_at is null
      ),
      'completed_documents', 0
    ),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', event.id,
          'action', event.action,
          'occurred_at', event.occurred_at,
          'actor_user_id', event.actor_user_id,
          'summary', event.summary
        )
        order by event.occurred_at desc
      )
      from (
        select *
        from public.employee_events
        where employee_id = employee.id
        order by occurred_at desc
        limit 50
      ) event
    ), '[]'::jsonb),
    -- What the reader may do to this record, by the same rules the actions ask.
    'allowed', (
      select jsonb_object_agg(replace(replace(action.key, 'employee.', ''), '.', '_'),
        app_private.authz_check(me, action, null, employee.id, null) is null
        -- Only a live record with no account on it is invitable, as
        -- prepare_employee_invitation_service says (7b QA finding 2).
        and (action.key <> 'employee.invite'
          or (employee.user_id is null and employee.archived_at is null)))
      from app_private.authz_actions action
      where action.key in ('employee.save', 'employee.terminate', 'employee.archive',
        'employee.remove_access', 'employee.change_role', 'employee.make_admin',
        'employee.invite', 'onboarding.review')
    )
  ) into answer
  from public.employee_profiles employee
  left join public.employee_private_profiles private_profile
    on private_profile.employee_id = employee.id
  left join auth.users account_user
    on account_user.id = employee.user_id
  left join public.employee_location_assignments primary_location
    on primary_location.employee_id = employee.id
    and primary_location.ended_at is null
    and primary_location.is_primary
  left join public.locations location on location.id = primary_location.location_id
  left join public.employee_job_assignments primary_job
    on primary_job.employee_id = employee.id
    and primary_job.ended_at is null
    and primary_job.is_primary
  left join public.jobs job on job.id = primary_job.job_id
  left join public.workspace_memberships membership
    on membership.workspace_id = employee.workspace_id
    and membership.user_id = employee.user_id
  left join public.workspace_roles role on role.id = coalesce(membership.role_id, membership.employee_role_id)
  left join public.workspace_roles management_role on management_role.id = membership.role_id
  left join lateral (
    select *
    from public.employee_invitations candidate
    where candidate.employee_id = employee.id
    order by candidate.created_at desc
    limit 1
  ) invitation on true
  left join public.workspace_roles invitation_role
    on invitation_role.id = invitation.role_id
  left join public.user_profiles inviter_profile
    on inviter_profile.user_id = invitation.created_by
  left join auth.users inviter_user
    on inviter_user.id = invitation.created_by
  where employee.id = target_employee_id
    and employee.workspace_id = target_workspace_id;

  return answer;
end;
$$;

