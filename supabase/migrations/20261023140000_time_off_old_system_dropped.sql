-- Time off rebuild D8: the old time off leaves the database. (KARARLAR S-239 (7), S-244.)
--
-- The old system (votes by location, a decision deadline with expiry, a voted cancellation, shortening) gave way to
-- public.time_off_requests in D2-D7, which are live. What it left goes now, with its rows and without a backup:
-- Mert, "eski izinler önemli değil" (S-244: the 12 live test requests).
--
-- 1. The 5-minute sweep (cron 'time-off-deadlines') stops.
-- 2. Nine readers that still read the old tables beside the new one read only the new one:
--    app_private.leave_spans (Schedule, Lineup, Home, Pre-flight and the rest read time off through it),
--    announcement_impact, close_employee_side, employee_side_impact, push_shows_body,
--    get_employee_hub_service (no lead time setting, no old request list: nothing reads them since D7),
--    get_manager_home_service, get_workspace_dashboard_service and update_scheduling_settings_service (the lead
--    time setting goes with its column).
-- 3. The old services and helpers (43 functions), its 10 tables and 2 enums go.
-- 4. The notices about old requests (subject 'time_off_request') go with what they pointed at, and so does the
--    notice type for shortened time off; the Time off topic stops promising it.
-- 5. The core action time_off.revoke goes: revoking is time_off.decide's (take_back_time_off_service).
-- 6. workspace_scheduling_settings.time_off_lead_hours goes.
-- 7. Found on the way (BL-354, refusals_answer_alike): the time off services answered a request that is not there
--    with 404 (P0002 time_off.not_found) and one the actor may not reach with 403, so an id told whether it was a
--    request. A request that is not there now answers as one the actor may not reach (42501 authz.out_of_scope):
--    answer_time_off_service, take_back_time_off_service, time_off_impact_service, withdraw_time_off_service,
--    ask_time_off_cancellation_service, and an unknown person in Add time off (app_private.time_off_entry_person).
-- retired_objects_stay_gone lists every one of them.

-- 1. The old sweep.
select cron.unschedule('time-off-deadlines') where exists (select 1 from cron.job where jobname = 'time-off-deadlines');

-- 2. The readers.
CREATE OR REPLACE FUNCTION "app_private"."leave_spans"("target_workspace" "uuid", "target_people" "uuid"[], "target_window" "tstzrange") RETURNS TABLE("employee_id" "uuid", "request_id" "uuid", "segment_id" "uuid", "revision" integer, "span" "tstzrange", "pending" boolean, "zone" "text")
    LANGUAGE "sql" STABLE STRICT
    SET "search_path" TO ''
    AS $$
  -- What is approved, or left of it, is `effective`; one request is one range, so its id is also the piece's
  -- (time off rebuild D2; the old tables' branch went in D8).
  select r.employee_id, r.id, r.id, r.revision, piece.span, false, r.time_timezone
  from public.time_off_requests r
  cross join lateral unnest(r.effective) piece(span)
  where r.workspace_id = leave_spans.target_workspace
    and r.employee_id = any (leave_spans.target_people)
    and r.kind = 'leave'
    and not isempty(r.effective)
    and (upper_inf(leave_spans.target_window) or r.starts_at < upper(leave_spans.target_window))
    and piece.span && leave_spans.target_window
  union all
  -- A request waiting for an answer, as the hours asked, until it starts: then it has expired.
  select r.employee_id, r.id, r.id, r.revision, tstzrange(r.starts_at, r.ends_at, '[)'), true, r.time_timezone
  from public.time_off_requests r
  where r.workspace_id = leave_spans.target_workspace
    and r.employee_id = any (leave_spans.target_people)
    and r.kind = 'leave'
    and r.status = 'pending'
    and r.starts_at > now()
    and (upper_inf(leave_spans.target_window) or r.starts_at < upper(leave_spans.target_window))
    and tstzrange(r.starts_at, r.ends_at, '[)') && leave_spans.target_window;
$$;

CREATE OR REPLACE FUNCTION "app_private"."announcement_impact"("w" "uuid", "record" "uuid", "first_day" "date", "last_day" "date", "day_rows" "jsonb", "choices" "jsonb", "saved_at" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
        -- Shifts time off opened (time off rebuild D3).
        or exists (select 1 from public.time_off_request_releases tie
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

CREATE OR REPLACE FUNCTION "app_private"."close_employee_side"("w" "uuid", "emp" "uuid", "actor" "uuid", "reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  impact jsonb;
  opened uuid[];
  closed record;
  why text := case reason
    when 'terminated' then 'This person no longer works here.'
    when 'access_removed' then 'This person no longer has access to the workspace.'
    else 'This person no longer works shifts here.' end;
begin
  if reason is null or reason not in ('access_dropped', 'terminated', 'access_removed') then
    raise exception 'unknown reason to close the employee side' using errcode = '22023';
  end if;
  perform public.availability_lock_workspace(w);
  impact := app_private.employee_side_impact(w, emp);

  if reason = 'access_dropped' then
    with released as (
      update public.schedule_published_shifts shift
      set employee_id = null
      from public.schedule_location_publications publication, public.locations location
      where publication.id = shift.publication_id and publication.workspace_id = shift.workspace_id
        and publication.location_id = shift.location_id and publication.status = 'current'
        and location.id = shift.location_id and location.workspace_id = shift.workspace_id
        and shift.workspace_id = w and shift.employee_id = emp
        and (shift.scheduled_date + shift.start_time) at time zone location.timezone >= now()
      returning shift.id)
    select coalesce(array_agg(id), '{}') into opened from released;
    perform app_private.schedule_tell_unassigned(w, opened, actor);
  else
    impact := impact || jsonb_build_object('shifts_opened', 0, 'availability_deleted', false);
  end if;

  -- Their own requests: a swap, a cover, a release.
  for closed in
    update public.shift_exchange_cases c
    set status = 'cancelled', revision = c.revision + 1, updated_at = now()
    where c.workspace_id = w and c.owner_id = emp and c.status = 'open'
    returning c.id
  loop
    update public.shift_exchange_applications
    set status = 'closed_case_cancelled', updated_at = now()
    where case_id = closed.id and status in ('invited', 'pending_manager');
    delete from public.shift_exchange_votes where case_id = closed.id;
    perform public.shift_exchange_emit(actor, w, closed.id, null, 'case_closed',
      why || case when reason = 'access_removed' then ' This request was closed. The owner keeps this shift.'
        else ' This request was closed. The shift is open for someone else to pick up.' end);
  end loop;

  -- What they answered on somebody else's request; a request made to them alone closes with it.
  for closed in
    update public.shift_exchange_applications a
    set status = 'closed_case_cancelled', updated_at = now()
    from public.shift_exchange_cases c
    where c.id = a.case_id and c.workspace_id = a.workspace_id and c.status = 'open'
      and a.workspace_id = w and a.employee_id = emp and a.status in ('invited', 'pending_manager')
    returning a.id, a.case_id, c.audience
  loop
    delete from public.shift_exchange_votes where case_id = closed.case_id and application_id = closed.id;
    update public.shift_exchange_cases
    set status = case when closed.audience = 'direct' then 'cancelled' else status end,
        revision = revision + 1, updated_at = now()
    where id = closed.case_id;
    perform public.shift_exchange_emit(actor, w, closed.case_id, closed.id, 'application_closed',
      why || ' Their answer was closed. No assignment changed.');
  end loop;

  -- Their time off waiting for an answer is withdrawn (design §4.8; time off rebuild D2); its cards close (D3).
  for closed in
    update public.time_off_requests r
    set status = 'withdrawn', ended_by = actor, ended_at = now(), ended_note = why, revision = r.revision + 1, updated_at = now()
    where r.workspace_id = w and r.employee_id = emp and r.status = 'pending'
    returning r.id
  loop
    perform app_private.notification_resolve(w, 'time_off', closed.id, 'withdrawn', actor);
  end loop;

  return impact;
end;
$$;

CREATE OR REPLACE FUNCTION "app_private"."employee_side_impact"("w" "uuid", "emp" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'shifts_opened', (
      select count(*)::integer
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication
        on publication.id = shift.publication_id and publication.workspace_id = shift.workspace_id
       and publication.location_id = shift.location_id and publication.status = 'current'
      join public.locations location on location.id = shift.location_id and location.workspace_id = shift.workspace_id
      where shift.workspace_id = w and shift.employee_id = emp
        and (shift.scheduled_date + shift.start_time) at time zone location.timezone >= now()),
    'requests_closed', (
      select count(*)::integer from public.shift_exchange_cases c
      where c.workspace_id = w and c.owner_id = emp and c.status = 'open'),
    'applications_closed', (
      select count(*)::integer
      from public.shift_exchange_applications a
      join public.shift_exchange_cases c on c.id = a.case_id and c.workspace_id = a.workspace_id
      where a.workspace_id = w and a.employee_id = emp and a.status in ('invited', 'pending_manager')
        and c.status = 'open' and c.owner_id is distinct from emp),
    'time_off_withdrawn', (
      select count(*)::integer from public.time_off_requests r
      where r.workspace_id = w and r.employee_id = emp and r.status = 'pending'),
    'availability_deleted',
      exists (select 1 from public.employee_weekly_preferences p where p.workspace_id = w and p.employee_id = emp)
      or exists (select 1 from public.manager_weekly_reminders m where m.workspace_id = w and m.employee_id = emp))
$$;

CREATE OR REPLACE FUNCTION "app_private"."push_shows_body"("target_type" "text", "target_subject" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select (target_type, target_subject) in (
    ('schedule.published', 'schedule_publication'), ('schedule.shift_added', 'schedule_publication'),
    ('schedule.shift_changed', 'schedule_publication'), ('schedule.shift_removed', 'schedule_publication'),
    ('people.onboarding_completed', 'onboarding_case'), ('time_off.decision_reminder', 'time_off'))
$$;

CREATE OR REPLACE FUNCTION "public"."get_employee_hub_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_from" "date", "target_to" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare employee public.employee_profiles%rowtype; result jsonb;
begin
  if target_to < target_from or target_to > target_from + 62 then
    raise exception 'employee hub date range is invalid' using errcode = '22023';
  end if;
  employee := public.employee_hub_actor_service(actor_user_id, target_workspace_id);

  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'employee', jsonb_build_object(
      'id', employee.id,
      'display_name', concat_ws(' ', coalesce(nullif(employee.preferred_name,''),employee.first_name), employee.last_name)
    ),
    'time_off_timezone', app_private.time_off_timezone(target_workspace_id, employee.id),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('id',location.id,'name',location.name) order by location.sort_order,location.name)
      from public.employee_location_assignments assignment
      join public.locations location on location.id=assignment.location_id and location.archived_at is null
      where assignment.employee_id=employee.id and assignment.ended_at is null
    ),'[]'::jsonb),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',shift.id,'location_id',shift.location_id,'location_name',location.name,'job_name',job.name,
        'scheduled_date',shift.scheduled_date,'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time',to_char(shift.start_time,'HH24:MI'),
        'end_time',to_char(shift.end_time,'HH24:MI'),'note',shift.note,'employee_id',shift.employee_id,
        'shift_type_name',shift_type.name
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      left join public.shift_types shift_type on shift_type.id=shift.shift_type_id and shift_type.workspace_id=shift.workspace_id
      where shift.workspace_id=target_workspace_id and shift.employee_id=employee.id
        and shift.scheduled_date between target_from and target_to
    ),'[]'::jsonb),
    -- An open shift reaches an employee only offered, in Shift Hub, to who is eligible (Mert, 2026-10-20).
    -- The field stays empty until the clients stop reading it (EKRAN 02 #47).
    'open_shifts', '[]'::jsonb,
    'team_shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',shift.id,'location_id',shift.location_id,'location_name',location.name,'job_name',job.name,
        'scheduled_date',shift.scheduled_date,'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time',to_char(shift.start_time,'HH24:MI'),
        'end_time',to_char(shift.end_time,'HH24:MI'),'note','','employee_id',shift.employee_id,
        'employee_name',concat_ws(' ',coalesce(nullif(teammate.preferred_name,''),teammate.first_name),teammate.last_name),
        'is_management',coalesce((select department.system_key='management' from public.departments department
          where department.id=job.department_id and department.workspace_id=shift.workspace_id),false)
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      join public.employee_profiles teammate on teammate.id=shift.employee_id
      where shift.workspace_id=target_workspace_id and shift.employee_id<>employee.id
        and shift.scheduled_date between target_from and target_to
        and exists(select 1 from public.employee_location_assignments assignment
          where assignment.employee_id=employee.id and assignment.location_id=shift.location_id and assignment.ended_at is null)
    ),'[]'::jsonb),
    -- The days of the range with time off the person has (time off rebuild D3): approved, or what is left
    -- of it (app_private.leave_spans), as days of the zone it was asked in. A piece that ends at midnight is the day before's. My shifts and Home's week read it.
    'leave_days', coalesce((
      select jsonb_agg(to_char(off_day.day, 'YYYY-MM-DD') order by off_day.day)
      from (
        select distinct d::date as day
        from app_private.leave_spans(target_workspace_id, array[employee.id],
          tstzrange((target_from - 1)::timestamp at time zone 'UTC', (target_to + 2)::timestamp at time zone 'UTC', '[)')) away
        cross join lateral generate_series((lower(away.span) at time zone away.zone)::date,
          ((upper(away.span) - interval '1 microsecond') at time zone away.zone)::date, interval '1 day') d
        where not away.pending
      ) off_day
      where off_day.day between target_from and target_to
    ),'[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',teammate.id,
        'display_name',concat_ws(' ',coalesce(nullif(teammate.preferred_name,''),teammate.first_name),teammate.last_name),
        'job_names',coalesce((select jsonb_agg(job.name order by lower(job.name),job.id) from public.employee_job_assignments assignment join public.jobs job on job.id=assignment.job_id where assignment.employee_id=teammate.id and assignment.ended_at is null),'[]'::jsonb),
        'location_names',coalesce((select jsonb_agg(location.name order by location.sort_order,location.name) from public.employee_location_assignments assignment join public.locations location on location.id=assignment.location_id where assignment.employee_id=teammate.id and assignment.ended_at is null),'[]'::jsonb)
      ) order by teammate.last_name,teammate.first_name)
      from public.employee_profiles teammate
      where teammate.workspace_id=target_workspace_id and teammate.archived_at is null and teammate.id<>employee.id
        and exists(select 1 from public.employee_location_assignments mine join public.employee_location_assignments theirs on theirs.location_id=mine.location_id and theirs.ended_at is null where mine.employee_id=employee.id and mine.ended_at is null and theirs.employee_id=teammate.id)
    ),'[]'::jsonb)
  ) into result;
  return result;
end; $$;


ALTER FUNCTION "public"."get_employee_hub_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_from" "date", "target_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_employee_onboarding_review_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_employee_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare target_case public.employee_onboarding_cases%rowtype; requirement_rows jsonb; total_count integer; completed_count integer;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'onboarding.review', target_person => target_employee_id);
  select * into target_case from public.employee_onboarding_cases
  where workspace_id = target_workspace_id and employee_id = target_employee_id;
  if target_case.id is null then raise exception 'onboarding case unavailable' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', requirement.id, 'kind', requirement.kind, 'title', requirement.title,
    'description', requirement.description, 'status', (app_private.document_view(actor_user_id, requirement)).status,
    'required', requirement.required, 'blocks_activation', requirement.blocks_activation,
    'requires_review', requirement.requires_review, 'sort_order', requirement.sort_order,
    'source_id', requirement.source_id,
    'accepted_formats', coalesce(requirement.source_snapshot->'accepted_formats', '[]'::jsonb),
    'content_text', null, 'content_digest', requirement.source_snapshot->>'content_digest',
    'intent_statement', null, 'rejection_reason', (app_private.document_view(actor_user_id, requirement)).rejection_reason
  ) order by requirement.sort_order), '[]'::jsonb),
  count(*) filter (where requirement.required),
  count(*) filter (where requirement.required and (app_private.document_view(actor_user_id, requirement)).status = 'completed')
  into requirement_rows, total_count, completed_count
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id and requirement.status <> 'superseded' and requirement.lifecycle_retired_at is null
    -- a row the reader may not see is not counted either (S2)
    and (requirement.kind <> 'document' or app_private.document_row_readable(actor_user_id, requirement));
  return jsonb_build_object(
    'case_id', target_case.id, 'employee_id', target_case.employee_id,
    'case_status', target_case.status, 'revision', target_case.revision,
    'submitted_at', target_case.submitted_at,
    'progress_completed', completed_count, 'progress_total', total_count,
    'ssn_present', false,
    'requirements', requirement_rows
  );
end;
$$;

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
    -- Time off's answers (time off rebuild D3), from the request itself: approved or declined in the
    -- last seven days and still so, read by whoever may answer it.
    select answered.decided_at, jsonb_build_object(
      'kind', 'time_off',
      'id', answered.id::text,
      'at', answered.decided_at,
      'location_ids', coalesce((
        select jsonb_agg(assignment.location_id order by assignment.is_primary desc, assignment.location_id)
        from public.employee_location_assignments assignment
        where assignment.employee_id = answered.employee_id and assignment.ended_at is null
          and assignment.location_id = any(places)
      ), '[]'::jsonb),
      'approved', answered.status = 'approved',
      'person', who.name,
      'by', (select person.name from person where person.user_id = answered.decided_by limit 1),
      'first_date', (answered.starts_at at time zone answered.time_timezone)::date,
      'last_date', ((answered.ends_at - interval '1 microsecond') at time zone answered.time_timezone)::date
    )
    from public.time_off_requests answered
    join person who on who.id = answered.employee_id
    where answered.workspace_id = target_workspace_id
      and answered.kind = 'leave'
      and answered.decided_at > now() - interval '7 days'
      and answered.status in ('approved', 'declined')
      and app_private.time_off_decider_why(me, answered.employee_id) is null
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
        -- leave: time off asked for; cancel: approved time off its person asks to cancel (D7).
        'kind', request.kind,
        'first_date', request.first_date,
        'last_date', request.last_date,
        'location_ids', coalesce((
          select jsonb_agg(assignment.location_id order by assignment.is_primary desc, assignment.location_id)
          from public.employee_location_assignments assignment
          where assignment.employee_id = request.employee_id and assignment.ended_at is null
            and assignment.location_id = any(places)
        ), '[]'::jsonb)
      ) order by request.created_at, request.id)
      from (
        select waiting.* from (
          -- Waiting, and this person may answer it (time off rebuild D3). Time off waits until it starts; a
          -- cancellation until the time off ends (D7: cancellations are listed too).
          select r.id, r.employee_id, r.created_at, r.kind,
            (r.starts_at at time zone r.time_timezone)::date as first_date,
            ((r.ends_at - interval '1 microsecond') at time zone r.time_timezone)::date as last_date
          from public.time_off_requests r
          where r.workspace_id = target_workspace_id
            and r.status = 'pending'
            and case when r.kind = 'cancel' then r.ends_at else r.starts_at end > now()
            and app_private.time_off_decider_why(me, r.employee_id) is null
        ) waiting
        order by waiting.created_at, waiting.id
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

CREATE OR REPLACE FUNCTION "public"."get_workspace_dashboard_service"("actor_user_id" "uuid", "target_workspace_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  read_rule app_private.authz_actions;
  documents_rule app_private.authz_actions;
  schedule_places uuid[];
  result jsonb;
begin
  -- Workspace home is the to-do list's page: one gate (KK-32, KK-34).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.todos');
  select * into read_rule from app_private.authz_actions r where r.key = 'employee.read';
  select * into documents_rule from app_private.authz_actions r where r.key = 'documents.read';
  schedule_places := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.read');

  perform public.sync_expiring_document_todos_service(target_workspace_id);

  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'display_name', profile.display_name,
    'metrics', jsonb_build_object(
      'today_shift_count', (
        select count(*)
        from public.schedule_published_shifts shift
        join public.schedule_location_publications publication
          on publication.id = shift.publication_id and publication.status = 'current'
        join public.locations location on location.id = shift.location_id
        where shift.workspace_id = target_workspace_id
          -- Every zone's date is within a day of UTC's: keeps the date index range.
          and shift.scheduled_date between (now() at time zone 'UTC')::date - 1 and (now() at time zone 'UTC')::date + 1
          and shift.location_id = any(schedule_places)
          and shift.scheduled_date = (now() at time zone location.timezone)::date
      ),
      'today_open_shift_count', (
        select count(*)
        from public.schedule_published_shifts shift
        join public.schedule_location_publications publication
          on publication.id = shift.publication_id and publication.status = 'current'
        join public.locations location on location.id = shift.location_id
        where shift.workspace_id = target_workspace_id
          -- Every zone's date is within a day of UTC's: keeps the date index range.
          and shift.scheduled_date between (now() at time zone 'UTC')::date - 1 and (now() at time zone 'UTC')::date + 1
          and shift.location_id = any(schedule_places)
          and shift.employee_id is null
          and shift.scheduled_date = (now() at time zone location.timezone)::date
      ),
      -- A request waiting that this person may answer (time off rebuild D3).
      'pending_time_off_count', (select count(*) from public.time_off_requests request
        where request.workspace_id = target_workspace_id and request.status = 'pending' and request.starts_at > now()
          and app_private.time_off_decider_why(me, request.employee_id) is null)
    ),
    'today_ends_at', (
      select min(((now() at time zone location.timezone)::date + 1)::timestamp at time zone location.timezone)
      from public.locations location
      where location.workspace_id = target_workspace_id
        and location.id = any(schedule_places)
    ),
    'announcements', coalesce((select jsonb_agg(item.value) from (select value from jsonb_array_elements((public.get_announcements_service(actor_user_id, target_workspace_id)->'announcements')) value
      -- K28: what is live; scheduled, past, unpublished and archived stay in the list only.
      where value->>'display_status' = 'published' limit 5) item), '[]'::jsonb),
    'todos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', todo.id,
        'workspace_id', todo.workspace_id,
        'title', todo.title,
        'body', todo.body,
        'severity', todo.severity,
        'status', todo.status,
        'system_generated', todo.system_generated,
        'source_type', todo.source_type,
        'source_id', todo.source_id,
        'source_key', todo.source_key,
        'employee_id', todo.employee_id,
        'due_at', todo.due_at,
        'action_url', todo.action_url,
        'created_at', todo.created_at
      ) order by todo.due_at nulls last, todo.created_at, todo.id)
      from (
        select todo.*
        from public.workspace_todos todo
        where todo.workspace_id = target_workspace_id
          and todo.status = 'open'::public.workspace_todo_status
          and (
            todo.employee_id is null
            -- KK-179 (5): a document to-do is read like the documents it is about.
            or app_private.authz_check(me,
                 case when todo.source_type = 'employee_document_expiry' then documents_rule else read_rule end,
                 null, todo.employee_id, null) is null
          )
        order by todo.due_at nulls last, todo.created_at, todo.id
        limit 5
      ) todo
    ), '[]'::jsonb),
    'layout', jsonb_build_object(
      'widget_order', public.normalize_workspace_widget_order(preference.widget_order),
      'hidden_widget_ids', array(
        select distinct value
        from unnest(coalesce(preference.hidden_widget_ids, '{}'::text[])) value
        where value = any(array[
          'operations',
          'pending_requests',
          'open_shifts',
          'announcements',
          'todos',
          'quick_actions'
        ])
      )
    )
  ) into result
  from public.user_profiles profile
  left join public.workspace_layout_preferences preference
    on preference.workspace_id = target_workspace_id
   and preference.user_id = actor_user_id
  where profile.user_id = actor_user_id;

  return result;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."update_scheduling_settings_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "settings" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare previous public.workspace_scheduling_settings; proposed public.workspace_scheduling_settings; saved public.workspace_scheduling_settings;
 conflict_keys text[]:=array['conflict_rules','conflict_rules_revision','minimum_travel_minutes','minimum_rest_minutes'];
 touches_conflicts boolean:=jsonb_typeof(settings)='object' and settings ?| conflict_keys;
begin
 perform app_private.authorize(actor_user_id, target_workspace_id,
   case when touches_conflicts then 'settings.conflict_rules.write' else 'settings.scheduling.write' end);
 if touches_conflicts then
  if settings-conflict_keys<>'{}'::jsonb then
   perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.scheduling.write');
  end if;
 end if;
 if jsonb_typeof(settings) is distinct from 'object' then raise exception 'Valid settings required' using errcode='22023'; end if;
 if settings='{}'::jsonb then raise exception 'Settings are required' using errcode='22023'; end if;
 -- BL-186: availability is a preference; there is no rule to set.
 if settings->'conflict_rules' ? 'availability' then
  raise exception 'Availability is a preference and has no conflict rule' using errcode='22023'; end if;
 perform public.availability_lock_workspace(target_workspace_id);
 perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));
 select * into previous from public.workspace_scheduling_settings where workspace_id=target_workspace_id for update;
 if not found then raise exception 'Scheduling settings not found'; end if;
 if settings ?| conflict_keys and (settings->>'conflict_rules_revision')::integer is distinct from previous.conflict_rules_revision then
  raise exception 'Conflict rules changed. Reload the current rules before saving.' using errcode='PT409', hint='schedule.rules_changed';
 end if;
 -- Partial calls preserve every omitted field. Revision is stamped by trigger.
 select * into proposed from jsonb_populate_record(previous,settings);
 update public.workspace_scheduling_settings set
  week_start_day=proposed.week_start_day,schedule_deadline_day=proposed.schedule_deadline_day,
  time_format=proposed.time_format,minimum_travel_minutes=proposed.minimum_travel_minutes,
  minimum_rest_minutes=proposed.minimum_rest_minutes,conflict_rules=proposed.conflict_rules,updated_at=now()
 where workspace_id=target_workspace_id returning * into saved;
 if (to_jsonb(previous)-'updated_at') is distinct from (to_jsonb(saved)-'updated_at') then
  insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata)
  values(target_workspace_id,actor_user_id,'scheduling.settings_updated','scheduling_settings',target_workspace_id::text,
   jsonb_build_object('before',to_jsonb(previous),'after',to_jsonb(saved)));
 end if;
 return to_jsonb(saved);
end;
$$;

-- 3. The old services and helpers, then the tables (each after what points at it), the trigger functions
-- their tables used, and the types.
drop function public.submit_time_off_service(uuid, uuid, jsonb, text, text, uuid);
drop function public.decide_time_off_service(uuid, uuid, uuid, text, text, text);
drop function public.revoke_time_off_service(uuid, uuid, uuid, integer, text);
drop function public.shorten_time_off_service(uuid, uuid, uuid, integer, jsonb, text, uuid);
drop function public.request_time_off_cancellation_service(uuid, uuid, uuid, integer, jsonb, text, uuid);
drop function public.employee_request_action_service(uuid, uuid, uuid, text, text, integer);
drop function public.get_schedule_requests_service(uuid, uuid, text, uuid, text, timestamp with time zone, integer);
drop function public.get_schedule_requests_closed_service(uuid, uuid, text[], uuid, text, integer, integer);
drop function public.time_off_cancellation_context(uuid, uuid);
drop function public.time_off_cancelled_ranges(uuid);
drop function public.time_off_decided_ranges(uuid);
drop function public.time_off_effective_ranges(uuid);
drop function public.time_off_event_is_shortening(uuid, uuid, jsonb);
drop function public.time_off_event_released_assignments(uuid, uuid, uuid);
drop function public.time_off_period_span(uuid);
drop function public.time_off_request_assignment_count(uuid, uuid);
drop function public.time_off_request_periods(uuid, uuid);
drop function public.time_off_resolve_period(jsonb, text);
drop function app_private.shorten_time_off(uuid, uuid, uuid, tstzmultirange, text, jsonb);
drop function app_private.time_off_authorize(uuid, uuid, text, uuid);
drop function app_private.time_off_days_text(uuid, uuid);
drop function app_private.time_off_decide_by(uuid, timestamp with time zone);
drop function app_private.time_off_deciding_locations(uuid, uuid);
drop function app_private.time_off_display_status(uuid, uuid);
drop function app_private.time_off_finalize(uuid, uuid, text, uuid, text, boolean, boolean);
drop function app_private.time_off_impact(uuid, uuid);
drop function app_private.time_off_impact_seen(uuid, uuid, uuid);
drop function app_private.time_off_live_locations(uuid, uuid);
drop function app_private.time_off_location_staffed(uuid, uuid, uuid);
drop function app_private.time_off_location_voters(uuid, uuid, uuid);
drop function app_private.time_off_progress(uuid, uuid, uuid);
drop function app_private.time_off_release_shifts(uuid, uuid, uuid, integer, uuid);
drop function app_private.time_off_remind(uuid, uuid);
drop function app_private.time_off_request_item(uuid, uuid, uuid);
drop function app_private.time_off_shifts_fingerprint(jsonb);
drop function app_private.time_off_state(uuid, uuid);
drop function app_private.time_off_sweep(integer);
drop function app_private.time_off_tell(uuid, uuid, text, uuid, text);
drop function app_private.time_off_tell_shortened(uuid, uuid, uuid, uuid, tstzmultirange, text);

drop table app_private.time_off_sweep_failures;
drop table public.time_off_votes;
drop table public.time_off_required_locations;
drop table public.time_off_assignment_releases;
drop table public.time_off_cancellation_periods;
drop table public.time_off_cancellation_links;
drop table public.schedule_time_off_events;
drop table public.schedule_time_off_segments;
drop table public.schedule_time_off_requests;
drop table public.time_off_commands;

drop function public.guard_time_off_assignment_release();
drop function public.guard_time_off_cancellation_history();
drop function public.guard_time_off_request_identity();
drop function public.guard_time_off_requested_period();

drop type public.time_off_request_status;
drop type public.time_off_segment_status;

-- 4. Notices about requests that are gone, and the shortened notice's type.
delete from public.person_notifications where subject_type = 'time_off_request';
delete from public.person_notifications where type_key = 'time_off.shortened';
delete from public.notification_workspace_muted_types where type_key = 'time_off.shortened';
delete from public.notification_types where key = 'time_off.shortened';
update public.notification_topics set description = 'Decisions on your time off.' where key = 'time_off';

-- 5. The revoke action.
delete from app_private.authz_actions where key = 'time_off.revoke';

-- 6. The lead time setting.
alter table public.workspace_scheduling_settings drop column time_off_lead_hours;

-- 7. A request (or person) that is not there answers as one out of reach.
CREATE OR REPLACE FUNCTION "app_private"."time_off_entry_person"("state" "app_private"."actor_state", "person" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  why text := app_private.time_off_decider_why(state, null);
  account uuid;
  zone_name text;
begin
  if why is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || why, detail = 'time_off.decide';
  end if;
  select e.user_id into account from public.employee_profiles e
  where e.id = person and e.workspace_id = state.workspace_id and e.archived_at is null;
  if not found then
    -- Nobody by that id answers as somebody the actor may not add time off for (BL-354).
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.decide';
  end if;
  why := app_private.time_off_decider_why(state, person);
  if why is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || why, detail = 'time_off.decide';
  end if;
  if account is not null and not app_private.has_employee_access(state.workspace_id, account) then
    raise exception 'Time off is only for people who work shifts' using errcode = '22023', hint = 'time_off.no_employee_access';
  end if;
  zone_name := app_private.time_off_timezone(state.workspace_id, person);
  if zone_name is null then
    raise exception 'This person needs a location before they can have time off' using errcode = '55000', hint = 'time_off.no_location';
  end if;
  return zone_name;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."answer_time_off_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_request_id" "uuid", "verdict" "text", "note" "text", "expected_revision" integer, "expected_impact" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me app_private.actor_state;
  why text;
  found_request public.time_off_requests;
  parent public.time_off_requests;
  note_text text := nullif(btrim(coalesce(note, '')), '');
begin
  perform public.availability_lock_workspace(target_workspace_id);
  me := app_private.actor(actor_user_id, target_workspace_id);
  why := app_private.time_off_decider_why(me, null);
  if why is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || why, detail = 'time_off.decide';
  end if;
  select * into found_request from public.time_off_requests r
  where r.id = target_request_id and r.workspace_id = target_workspace_id;
  if not found then
    -- A request that is not there answers as one at a location the actor does not reach (BL-354).
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.decide';
  end if;
  why := app_private.time_off_decider_why(me, found_request.employee_id);
  if why is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || why, detail = 'time_off.decide';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('time_off_person:' || found_request.employee_id::text, 0));
  select * into found_request from public.time_off_requests r where r.id = target_request_id for update;

  if verdict is null or verdict not in ('approve', 'decline') or char_length(note_text) > 1000 then
    raise exception 'Approve or decline; a note is at most 1000 characters' using errcode = '22023', hint = 'time_off.invalid';
  end if;

  if found_request.kind = 'cancel' then
    -- The time off ended while it waited: expired (the sweep would write the same).
    if found_request.status = 'pending' and found_request.ends_at <= now() then
      update public.time_off_requests
      set status = 'expired', revision = revision + 1, updated_at = now()
      where id = found_request.id
      returning * into found_request;
      perform app_private.time_off_request_tell(found_request, 'expired', null);
      return app_private.time_off_decider_view(found_request);
    end if;
    if found_request.revision is distinct from expected_revision then
      raise exception 'This request changed. Review it again' using errcode = 'PT409', hint = 'time_off.changed';
    end if;
    if found_request.status <> 'pending' then
      raise exception 'This request was already answered' using errcode = 'PT409', hint = 'time_off.not_pending';
    end if;
    select * into parent from public.time_off_requests r where r.id = found_request.cancels_id for update;
    if parent.status <> 'approved' then
      raise exception 'This time off is no longer approved' using errcode = 'PT409', hint = 'time_off.not_pending';
    end if;
    if verdict = 'approve' then
      parent := app_private.time_off_cut(parent.id, tstzrange(greatest(now(), parent.starts_at), parent.ends_at, '[)'));
      update public.time_off_requests
      set status = 'cancelled', ended_by = actor_user_id, ended_at = now(), updated_at = now()
      where id = parent.id;
      update public.time_off_requests
      set status = 'approved', decided_by = actor_user_id, decided_at = now(), decision_note = note_text,
          revision = revision + 1, updated_at = now()
      where id = found_request.id
      returning * into found_request;
    else
      update public.time_off_requests
      set status = 'declined', decided_by = actor_user_id, decided_at = now(), decision_note = note_text,
          revision = revision + 1, updated_at = now()
      where id = found_request.id
      returning * into found_request;
    end if;
    perform app_private.time_off_request_tell(found_request, found_request.status, actor_user_id);
    return app_private.time_off_decider_view(found_request);
  end if;

  -- Its start passed while it waited: expired (the sweep would write the same).
  if found_request.status = 'pending' and found_request.starts_at <= now() then
    update public.time_off_requests
    set status = 'expired', revision = revision + 1, updated_at = now()
    where id = found_request.id
    returning * into found_request;
    perform app_private.time_off_request_tell(found_request, 'expired', null);
    return app_private.time_off_decider_view(found_request);
  end if;
  if found_request.revision is distinct from expected_revision then
    raise exception 'This request changed. Review it again' using errcode = 'PT409', hint = 'time_off.changed';
  end if;
  if found_request.status <> 'pending' then
    raise exception 'This request was already answered' using errcode = 'PT409', hint = 'time_off.not_pending';
  end if;

  if verdict = 'approve' then
    if expected_impact is distinct from app_private.time_off_shifts_print(app_private.time_off_shifts_at_stake(found_request)) then
      raise exception 'The shifts this time off opens changed. Review them again' using errcode = 'PT409', hint = 'time_off.changed';
    end if;
    update public.time_off_requests
    set status = 'approved', effective = tstzmultirange(tstzrange(starts_at, ends_at, '[)')),
        decided_by = actor_user_id, decided_at = now(), decision_note = note_text,
        revision = revision + 1, updated_at = now()
    where id = found_request.id
    returning * into found_request;
    perform app_private.time_off_open_shifts(found_request, actor_user_id);
  else
    update public.time_off_requests
    set status = 'declined', decided_by = actor_user_id, decided_at = now(), decision_note = note_text,
        revision = revision + 1, updated_at = now()
    where id = found_request.id
    returning * into found_request;
  end if;
  perform app_private.time_off_request_tell(found_request, found_request.status, actor_user_id);
  return app_private.time_off_decider_view(found_request);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."take_back_time_off_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_request_id" "uuid", "note" "text", "expected_revision" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me app_private.actor_state;
  why text;
  found_request public.time_off_requests;
  closed uuid;
  note_text text := nullif(btrim(coalesce(note, '')), '');
begin
  perform public.availability_lock_workspace(target_workspace_id);
  me := app_private.actor(actor_user_id, target_workspace_id);
  why := app_private.time_off_decider_why(me, null);
  if why is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || why, detail = 'time_off.decide';
  end if;
  select * into found_request from public.time_off_requests r
  where r.id = target_request_id and r.workspace_id = target_workspace_id and r.kind = 'leave';
  if not found then
    -- A request that is not there answers as one at a location the actor does not reach (BL-354).
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.decide';
  end if;
  why := app_private.time_off_decider_why(me, found_request.employee_id);
  if why is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || why, detail = 'time_off.decide';
  end if;
  if note_text is null then
    raise exception 'Say why you revoke this time off' using errcode = '22023', hint = 'time_off.note_required';
  end if;
  if char_length(note_text) > 1000 then
    raise exception 'A note is at most 1000 characters' using errcode = '22023', hint = 'time_off.invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('time_off_person:' || found_request.employee_id::text, 0));
  select * into found_request from public.time_off_requests r where r.id = target_request_id for update;
  if found_request.revision is distinct from expected_revision then
    raise exception 'This time off changed. Review it again' using errcode = 'PT409', hint = 'time_off.changed';
  end if;
  if found_request.status <> 'approved' then
    raise exception 'Only approved time off can be revoked' using errcode = 'PT409', hint = 'time_off.not_approved';
  end if;
  if found_request.ends_at <= now() then
    raise exception 'This time off is over' using errcode = 'PT409', hint = 'time_off.ended';
  end if;

  perform app_private.time_off_cut(found_request.id, tstzrange(greatest(now(), found_request.starts_at), found_request.ends_at, '[)'));
  update public.time_off_requests
  set status = 'revoked', ended_by = actor_user_id, ended_at = now(), ended_note = note_text, updated_at = now()
  where id = found_request.id
  returning * into found_request;

  for closed in
    update public.time_off_requests c
    set status = 'withdrawn', ended_by = actor_user_id, ended_at = now(), ended_note = 'The time off was revoked.',
        revision = c.revision + 1, updated_at = now()
    where c.cancels_id = found_request.id and c.kind = 'cancel' and c.status = 'pending'
    returning c.id
  loop
    perform app_private.notification_resolve(found_request.workspace_id, 'time_off', closed, 'revoked', actor_user_id);
  end loop;

  perform app_private.time_off_request_tell(found_request, 'revoked', actor_user_id);
  return app_private.time_off_decider_view(found_request);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."time_off_impact_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  read_rule app_private.authz_actions;
  why text;
  found_request public.time_off_requests;
  at_stake jsonb := '[]';
begin
  why := app_private.time_off_decider_why(me, null);
  if why is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || why, detail = 'time_off.decide';
  end if;
  select * into found_request from public.time_off_requests r
  where r.id = target_request_id and r.workspace_id = target_workspace_id and r.kind = 'leave';
  if not found then
    -- A request that is not there answers as one at a location the actor does not reach (BL-354).
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.decide';
  end if;
  why := app_private.time_off_decider_why(me, found_request.employee_id);
  if why is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || why, detail = 'time_off.decide';
  end if;
  select * into read_rule from app_private.authz_actions a where a.key = 'schedule.read';
  if found_request.status = 'pending' and found_request.starts_at > now() then
    at_stake := app_private.time_off_shifts_at_stake(found_request);
  end if;
  return jsonb_build_object(
    'request', app_private.time_off_decider_view(found_request),
    'fingerprint', app_private.time_off_shifts_print(at_stake),
    'shift_count', jsonb_array_length(at_stake),
    'hidden_shift_count', (select count(*)::integer from jsonb_array_elements(at_stake) x
      where app_private.authz_check(me, read_rule, array[(x ->> 'location_id')::uuid], null, null) is not null),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('location_id', place.location_id, 'location_name', place.location_name,
        'shifts', place.shifts) order by place.location_name, place.location_id)
      from (
        select (x ->> 'location_id')::uuid as location_id, min(x ->> 'location_name') as location_name,
          jsonb_agg(jsonb_build_object(
            'id', x ->> 'id',
            'scheduled_date', x ->> 'scheduled_date',
            'start_time', to_char((x ->> 'start_time')::time, 'HH24:MI'),
            'end_time', to_char((x ->> 'end_time')::time, 'HH24:MI'),
            'job_name', x ->> 'job_name',
            'starts_at', x ->> 'starts_at',
            'ends_at', x ->> 'ends_at',
            'timezone', x ->> 'timezone') order by x ->> 'starts_at', x ->> 'id') as shifts
        from jsonb_array_elements(at_stake) x
        where app_private.authz_check(me, read_rule, array[(x ->> 'location_id')::uuid], null, null) is null
        group by (x ->> 'location_id')::uuid
      ) place), '[]'::jsonb));
end;
$$;

CREATE OR REPLACE FUNCTION "public"."ask_time_off_cancellation_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_request_id" "uuid", "asked_note" "text", "expected_revision" integer, "request_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  found_request public.time_off_requests;
  prior public.time_off_requests;
  created public.time_off_requests;
  note_text text := nullif(btrim(coalesce(asked_note, '')), '');
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'time_off.request_own');
  select * into found_request from public.time_off_requests r
  where r.id = target_request_id and r.workspace_id = target_workspace_id and r.kind = 'leave';
  if not found then
    -- A request that is not there answers as somebody else's (BL-354).
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.request_own';
  end if;
  perform app_private.authorize(actor_user_id, target_workspace_id, 'time_off.request_own', target_person => found_request.employee_id);
  if request_key is null or char_length(note_text) > 1000 then
    raise exception 'A request key is required; a note is at most 1000 characters' using errcode = '22023', hint = 'time_off.invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('time_off_person:' || found_request.employee_id::text, 0));

  select * into prior from public.time_off_requests r where r.client_key = request_key;
  if found then
    if prior.kind <> 'cancel' or prior.cancels_id is distinct from found_request.id or prior.note is distinct from note_text then
      raise exception 'This request key was used for something else' using errcode = 'PT409', hint = 'time_off.key_reused';
    end if;
    return app_private.time_off_request_view(found_request);
  end if;

  select * into found_request from public.time_off_requests r where r.id = target_request_id for update;
  if found_request.revision is distinct from expected_revision then
    raise exception 'This time off changed. Check it again' using errcode = 'PT409', hint = 'time_off.changed';
  end if;
  if found_request.status <> 'approved' then
    raise exception 'Only approved time off can be cancelled' using errcode = 'PT409', hint = 'time_off.not_approved';
  end if;
  if found_request.ends_at <= now() then
    raise exception 'This time off is over' using errcode = 'PT409', hint = 'time_off.ended';
  end if;
  if exists (select 1 from public.time_off_requests c
             where c.cancels_id = found_request.id and c.kind = 'cancel' and c.status = 'pending') then
    raise exception 'A cancellation is already waiting for an answer' using errcode = 'PT409', hint = 'time_off.cancel_pending';
  end if;

  insert into public.time_off_requests (workspace_id, employee_id, kind, cancels_id, starts_at, ends_at, all_day,
    time_timezone, kind_of_leave, note, created_by, client_key)
  values (found_request.workspace_id, found_request.employee_id, 'cancel', found_request.id, found_request.starts_at,
    found_request.ends_at, found_request.all_day, found_request.time_timezone, found_request.kind_of_leave, note_text,
    actor_user_id, request_key)
  returning * into created;
  perform app_private.time_off_request_tell(created, 'requested', actor_user_id);
  return app_private.time_off_request_view(found_request);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."withdraw_time_off_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_request_id" "uuid", "expected_revision" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  found_request public.time_off_requests;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'time_off.request_own');
  select * into found_request from public.time_off_requests r
  where r.id = target_request_id and r.workspace_id = target_workspace_id;
  if not found then
    -- A request that is not there answers as somebody else's (BL-354).
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.request_own';
  end if;
  perform app_private.authorize(actor_user_id, target_workspace_id, 'time_off.request_own', target_person => found_request.employee_id);
  perform pg_advisory_xact_lock(hashtextextended('time_off_person:' || found_request.employee_id::text, 0));
  select * into found_request from public.time_off_requests r where r.id = target_request_id for update;
  if found_request.revision is distinct from expected_revision then
    raise exception 'This request changed. Check it again' using errcode = 'PT409', hint = 'time_off.changed';
  end if;
  if found_request.status <> 'pending'
     or (found_request.kind = 'leave' and found_request.starts_at <= now())
     or (found_request.kind = 'cancel' and found_request.ends_at <= now()) then
    raise exception 'Only a request waiting for an answer can be withdrawn' using errcode = 'PT409', hint = 'time_off.not_pending';
  end if;
  update public.time_off_requests
  set status = 'withdrawn', ended_by = actor_user_id, ended_at = now(), revision = revision + 1, updated_at = now()
  where id = found_request.id
  returning * into found_request;
  perform app_private.time_off_request_tell(found_request, 'withdrawn', actor_user_id);
  return app_private.time_off_request_view(found_request);
end;
$$;
