-- Time off rebuild D7: the switch over. (KARARLAR S-239, S-243.)
--
-- 1. S-243: the Publish window's "time off waiting for a decision" note is read only by who may answer that
--    request, as the Schedule grid already does (app_private.time_off_decider_reason). A publisher who does not
--    decide time off gets no note; publishing is not held either way.
-- 2. The sweep (app_private.time_off_requests_sweep) takes a request that failed before after all the others, so
--    a request that keeps failing never fills a pass (nf-guvenlik, low).
-- 3. Requests → Time off's list (time_off_requests_service) carries the page's time format and location filter, which
--    the old Requests read (get_schedule_requests_service) carried; the web stops asking that read.
-- 4. The manager Home's waiting list (get_manager_home_service, 'time_off') lists cancellations too, each item saying
--    its kind ('leave' or 'cancel').

CREATE OR REPLACE FUNCTION "public"."weekly_schedule_publication_preflight"("payload" "jsonb", "actor" "uuid", "departments" "uuid"[] DEFAULT NULL::"uuid"[], "include_no_department" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare findings jsonb; signatures jsonb:='[]'; s record; a jsonb; prior jsonb; evidence jsonb; scope jsonb;
 unsigned jsonb; w uuid:=(payload->>'workspace_id')::uuid; message text; state text; tier text; warning boolean;
 pending jsonb:='[]'; shift_span tstzrange; asking uuid[];
begin
 if payload->>'status'='past_week_closed' then return payload; end if;
 -- Who has time off waiting for a decision, read once for the whole draft; only for who may answer it
 -- (S-243: as on the grid, a waiting request is read only by who decides it).
 asking:=array(select asking_one.employee_id from (select distinct away.employee_id from app_private.leave_spans(w,
   array(select distinct d.employee_id from public.schedule_draft_shifts d
    where d.workspace_id=w and d.draft_id=(payload->>'draft_id')::uuid and d.employee_id is not null),
   (select tstzrange((min(d.scheduled_date)-2)::timestamp at time zone 'UTC',(max(d.scheduled_date)+3)::timestamp at time zone 'UTC','[)')
    from public.schedule_draft_shifts d where d.workspace_id=w and d.draft_id=(payload->>'draft_id')::uuid)) away
  where away.pending) asking_one
  where app_private.time_off_decider_reason(actor,w,asking_one.employee_id) is null);
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
      'scheduled_date',s.scheduled_date,'location_id',s.location_id,'location_name',s.location_name,'shift_id',s.id,'request_id',r.id,
      -- Which table the request is in, so the web opens it where it lives (time off rebuild D3b).
      'time_off_source',case when exists(select 1 from public.time_off_requests t where t.id=r.id and t.workspace_id=w)
        then 'current' else 'legacy' end))
     from (select distinct away.request_id id from app_private.leave_spans(w,array[s.employee_id],shift_span) away
      where away.pending) r),'[]');
   end if;
  end if;
 end loop;
 findings:=findings||coalesce((select jsonb_agg(jsonb_build_object(
   'id',encode(extensions.digest(convert_to('time_off_pending|'||g.employee_id||'|'||g.scheduled_date||'|'||g.location_id||'|'||g.request_id,'UTF8'),'sha256'),'hex'),
   'code','time_off_pending','severity','soft','overrideable',false,'tier','note',
   'location_id',g.location_id,'location_name',g.location_name,'employee_id',g.employee_id,'employee_name',g.employee_name,
   'scheduled_date',g.scheduled_date,'shift_ids',g.shift_ids,'time_off_request_id',g.request_id,'time_off_source',g.time_off_source,
   'message',left(coalesce(g.employee_name,'This person')||' has time off waiting for a decision on '||to_char(g.scheduled_date,'Mon FMDD'),500))
  order by g.scheduled_date,g.employee_id,g.location_id,g.request_id)
  from (select h->>'employee_id' employee_id,h->>'employee_name' employee_name,(h->>'scheduled_date')::date scheduled_date,
    h->>'location_id' location_id,h->>'location_name' location_name,h->>'request_id' request_id,
    h->>'time_off_source' time_off_source,jsonb_agg(h->'shift_id' order by h->>'shift_id') shift_ids
   from jsonb_array_elements(pending) h group by 1,2,3,4,5,6,7) g),'[]');
 -- BL-198: a draft that would undo an approved shift change is a blocker.
 findings:=findings||public.shift_exchange_draft_undoes(w,(payload->>'draft_id')::uuid,
  array(select (x->>'location_id')::uuid from jsonb_array_elements(coalesce(payload->'locations','[]'::jsonb)) x),departments,include_no_department);
 unsigned:=(payload-'fingerprint'-'status')||jsonb_build_object('findings',findings,'availability_assessments',signatures,'department_ids',to_jsonb(departments),'include_no_department',coalesce(include_no_department,true));
 return unsigned||jsonb_build_object('status',case
  when exists(select 1 from jsonb_array_elements(findings) f where f->>'severity'='hard' and coalesce(f->>'tier','blocker')<>'note') then 'hard_blocked'
  when exists(select 1 from jsonb_array_elements(findings) f where coalesce(f->>'tier','blocker')<>'note' and (coalesce((f->>'introduced')::boolean,true) or not (f->>'overrideable')::boolean)) then 'override_required'
  else 'publish_ready' end,'fingerprint',encode(extensions.digest(convert_to(unsigned::text,'UTF8'),'sha256'),'hex'));
end; $$;

CREATE OR REPLACE FUNCTION "app_private"."time_off_requests_sweep"("pass_limit" integer DEFAULT 500, "pass_time" interval DEFAULT '00:00:30'::interval) RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  started timestamptz := clock_timestamp();
  due record;
  r public.time_off_requests;
  done integer := 0;
begin
  for due in
    select q.id, q.workspace_id
    from public.time_off_requests q
    where q.status = 'pending'
      and ((q.kind = 'leave' and (q.starts_at <= now()
             or (q.reminded_at is null and q.starts_at - interval '1 day' <= now()
                 and q.created_at < q.starts_at - interval '1 day')))
        or (q.kind = 'cancel' and q.ends_at <= now()))
    -- One that failed before waits behind the rest, so broken requests never fill a pass (nf-guvenlik, D7).
    order by exists (select 1 from app_private.time_off_request_sweep_failures f where f.request_id = q.id),
             case when q.kind = 'cancel' then q.ends_at when q.starts_at <= now() then q.starts_at
                  else q.starts_at - interval '1 day' end, q.id
    limit pass_limit
  loop
    -- Each request on its own: one that fails is rolled back alone and kept; the rest of the pass goes on.
    begin
      -- Read again under its row lock: an answer or a withdrawal may have closed it. One that somebody holds
      -- now is left for the next pass.
      select * into r from public.time_off_requests q where q.id = due.id and q.status = 'pending'
      for update skip locked;
      if found then
        if (r.kind = 'leave' and r.starts_at <= now()) or (r.kind = 'cancel' and r.ends_at <= now()) then
          update public.time_off_requests
          set status = 'expired', ended_at = case when r.kind = 'cancel' then r.ends_at else r.starts_at end,
              revision = revision + 1, updated_at = now()
          where id = r.id
          returning * into r;
          perform app_private.time_off_request_tell(r, 'expired', null);
          done := done + 1;
        elsif r.kind = 'leave' and r.reminded_at is null and r.starts_at - interval '1 day' <= now()
              and r.created_at < r.starts_at - interval '1 day' then
          update public.time_off_requests set reminded_at = now() where id = r.id returning * into r;
          perform app_private.time_off_request_tell(r, 'reminder', null);
          done := done + 1;
        end if;
        delete from app_private.time_off_request_sweep_failures f where f.request_id = r.id;
      end if;
    exception when others then
      insert into app_private.time_off_request_sweep_failures (request_id, workspace_id, sqlstate, message)
      values (due.id, due.workspace_id, sqlstate, sqlerrm)
      on conflict (request_id) do update
      set last_failed_at = now(), attempts = app_private.time_off_request_sweep_failures.attempts + 1,
          sqlstate = excluded.sqlstate, message = excluded.message;
      raise warning 'time-off-requests: request % of workspace % failed: % %', due.id, due.workspace_id, sqlstate, sqlerrm;
    end;
    -- Out of time: the request in hand is done; the rest wait for the next pass.
    exit when clock_timestamp() - started >= pass_time;
  end loop;
  return done;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."time_off_requests_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_view" "text" DEFAULT 'all'::"text", "target_location_id" "uuid" DEFAULT NULL::"uuid", "target_search" "text" DEFAULT ''::"text", "target_sort" "text" DEFAULT 'needs_decision'::"text", "target_page" integer DEFAULT 1, "target_page_size" integer DEFAULT 50, "target_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  why text := app_private.time_off_decider_why(me, null);
  needle text := nullif(btrim(coalesce(target_search, '')), '');
  result jsonb;
begin
  if why is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || why, detail = 'time_off.decide';
  end if;
  if target_view is null or target_view not in ('all', 'open', 'closed')
     or target_sort is null or target_sort not in ('needs_decision', 'starts', 'newest')
     or target_page is null or target_page < 1 or target_page_size is null or target_page_size not in (25, 50, 100)
     or char_length(needle) > 200 then
    raise exception 'Choose a view, a sort and a page' using errcode = '22023', hint = 'time_off.invalid';
  end if;

  with answerable as materialized (
    select e.id, btrim(coalesce(nullif(btrim(e.preferred_name), ''), e.first_name) || ' ' || e.last_name) as name
    from public.employee_profiles e
    where e.workspace_id = target_workspace_id
      and exists (select 1 from public.time_off_requests q where q.workspace_id = target_workspace_id and q.employee_id = e.id)
      and app_private.time_off_decider_why(me, e.id) is null
  ), listed as materialized (
    select r as request, r.id, r.starts_at, r.created_at, coalesce(greatest(r.decided_at, r.ended_at), r.updated_at) as answered_at,
      (r.status = 'pending' and case when r.kind = 'cancel' then r.ends_at else r.starts_at end > now()) as waiting
    from public.time_off_requests r
    join answerable person on person.id = r.employee_id
    where r.workspace_id = target_workspace_id
      and r.status in ('pending', 'approved', 'declined', 'expired', 'cancelled', 'revoked')
      and (target_request_id is null or r.id = target_request_id)
      and (target_location_id is null or exists (
        select 1 from public.employee_location_assignments a
        where a.workspace_id = target_workspace_id and a.employee_id = r.employee_id and a.location_id = target_location_id
          and a.ended_at is null))
      and (needle is null or strpos(lower(person.name), lower(needle)) > 0 or strpos(lower(coalesce(r.note, '')), lower(needle)) > 0)
  ), viewed as (
    select * from listed l
    where target_view = 'all' or (target_view = 'open') = l.waiting
  ), page as (
    select v.request, row_number() over (order by
        case when target_sort = 'needs_decision' then not v.waiting end,
        case when target_sort = 'needs_decision' and v.waiting then v.starts_at end,
        case when target_sort = 'needs_decision' then v.answered_at end desc,
        case when target_sort = 'starts' then v.starts_at end,
        case when target_sort = 'newest' then v.created_at end desc,
        v.id) as at
    from viewed v
  )
  select jsonb_build_object(
    'total', (select count(*)::integer from viewed),
    'waiting', (select count(*)::integer from listed l where l.waiting),
    'page', target_page,
    'page_size', target_page_size,
    -- The page's own clock and location filter (D7: the old Requests read that carried them is gone): the
    -- workspace's time format, and the live locations whose time off this person answers.
    'time_format', (select st.time_format from public.workspace_scheduling_settings st where st.workspace_id = target_workspace_id),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) order by l.name, l.id)
      from public.locations l
      where l.workspace_id = target_workspace_id and l.archived_at is null
        and app_private.time_off_reason(actor_user_id, target_workspace_id, 'time_off.decide', null, l.id) is null), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(app_private.time_off_decider_view(p.request) order by p.at)
      from page p
      where p.at > (target_page - 1) * target_page_size and p.at <= target_page * target_page_size), '[]'::jsonb))
  into result;
  return result;
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
    -- The new time off's answers (time off rebuild D3), from the request itself: approved or declined in the
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
          select r.id, r.employee_id, r.created_at, 'leave'::text as kind,
            (select min(segment.segment_date) from public.schedule_time_off_segments segment where segment.request_id = r.id) as first_date,
            (select max(segment.segment_date) from public.schedule_time_off_segments segment where segment.request_id = r.id) as last_date
          from public.schedule_time_off_requests r
          where r.workspace_id = target_workspace_id
            and r.status = 'pending'
            and r.request_type = 'time_off'
            and app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', r.employee_id) is null
          union all
          -- The new time off's (time off rebuild D3): waiting, and this person may answer it. Time off waits
          -- until it starts; a cancellation until the time off ends (D7: cancellations are listed too).
          select r.id, r.employee_id, r.created_at, r.kind,
            (r.starts_at at time zone r.time_timezone)::date,
            ((r.ends_at - interval '1 microsecond') at time zone r.time_timezone)::date
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
