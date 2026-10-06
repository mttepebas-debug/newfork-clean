-- Requests -> Closed reads one list (EKRAN-02 A4).
--   K-S9, K-S10  closed time off and closed shift changes (swap, cover, open
--                shift) in one order, newest decision first, with a total and
--                numbered pages of 25 / 50 / 100, filtered by type, location
--                and search: get_schedule_requests_closed_service.
--   R2-12        the order runs on across pages.
--   BL-839       in Requests an open shift change is listed whatever its date.
-- A row is drawn by the same builder the two existing lists use, so the Time
-- off and shift change drawers read the same object from either list.

-- Row builders --------------------------------------------------------------------
create function app_private.time_off_request_item(actor_user_id uuid, target_workspace_id uuid, target_request_id uuid)
returns jsonb language sql stable set search_path = '' as $function$
 select jsonb_build_object('id', r.id, 'employee_id', r.employee_id,
   'employee_name', concat_ws(' ', coalesce(nullif(e.preferred_name, ''), e.first_name), e.last_name),
   'request_type', r.request_type, 'reason', r.reason,
   'cancellation', public.time_off_cancellation_context(target_workspace_id, r.id), 'status', r.status,
   'start_date', (select min(s.segment_date) from public.schedule_time_off_segments s where s.request_id = r.id),
   'end_date', (select max(s.segment_date) from public.schedule_time_off_segments s where s.request_id = r.id),
   'revision', r.revision, 'created_at', r.created_at, 'decide_by', r.decide_by,
   -- Withdrawn by the employee (R2-42); hours the system gave back (R2-52).
   'withdrawn', app_private.time_off_display_status(target_workspace_id, r.id) = 'Withdrawn',
   'shortened', public.time_off_event_is_shortening(target_workspace_id, r.id, '{}'),
   'conflict_count', public.time_off_request_assignment_count(target_workspace_id, r.id),
   'segments', public.time_off_request_periods(r.id, target_workspace_id),
   'progress', case when r.status = 'pending' then app_private.time_off_progress(time_off_request_item.actor_user_id, target_workspace_id, r.id) end,
   'events', coalesce((select jsonb_agg(jsonb_build_object('id', ev.id, 'action', ev.action,
       'actor_name', case when ev.actor_user_id is null then 'System' else coalesce(nullif(up.display_name, ''), 'Team member') end,
       'note', ev.note, 'created_at', ev.created_at,
       'released_assignments', public.time_off_event_released_assignments(time_off_request_item.actor_user_id, target_workspace_id, ev.id)) order by ev.created_at)
     from public.schedule_time_off_events ev left join public.user_profiles up on up.user_id = ev.actor_user_id where ev.request_id = r.id), '[]'))
 from public.schedule_time_off_requests r join public.employee_profiles e on e.id = r.employee_id
 where r.id = target_request_id and r.workspace_id = target_workspace_id
$function$;
comment on function app_private.time_off_request_item(uuid, uuid, uuid) is
  'One time-off request as the Requests lists draw it; the reader decides who may see it (EKRAN-02 A4).';
revoke all on function app_private.time_off_request_item(uuid, uuid, uuid) from public, anon, authenticated, service_role;

create function app_private.shift_exchange_case_item(actor uuid, w uuid, c public.shift_exchange_cases, allowed boolean,
 emp_id uuid, published_offered jsonb, published_requested jsonb, live_status text)
returns jsonb language plpgsql set search_path = '' as $function$
declare s jsonb := coalesce(published_offered, c.offered_snapshot); t jsonb := coalesce(published_requested, c.requested_snapshot);
 current_published boolean := published_offered is not null; requested_published boolean := published_requested is not null;
 decides boolean; mine boolean := coalesce(c.owner_id = emp_id, false); apps jsonb; hist jsonb; stage text;
begin
  -- Who decides the case (D3, K-S1) gets its buttons and its private notes (K-S5).
  decides:=allowed and exists(select 1 from unnest(array_remove(array[(c.offered_snapshot->>'location_id')::uuid,(c.requested_snapshot->>'location_id')::uuid],null)) x
   where app_private.exchange_decision_reason(actor,w,c.owner_id,null,x) is null);
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'employee_id',a.employee_id,'employee_name',coalesce(nullif(e.preferred_name,''),concat_ws(' ',e.first_name,e.last_name)),
   'status',case when live_status in('expired','invalidated') and a.status in('invited','pending_manager') then live_status else a.status end,'created_at',a.created_at,'reason',case when allowed or a.employee_id=emp_id then a.reason else '' end,
   'eligibility',case when (allowed or a.employee_id=emp_id) and live_status='open' then (app_private.eligibility(w,a.employee_id,s,jsonb_build_object('operation',case when c.kind in ('swap','open_pickup') then c.kind when c.audience='direct' then 'cover_accept' else 'release_pickup' end,'consent',case when a.employee_id=emp_id and a.status='invited' then 'true'::jsonb else a.time_off_consent end,'excluded',to_jsonb(array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null))))-case when allowed then '{}'::text[] else array['approval_flags'] end) || case when a.employee_id=emp_id and a.status='invited' then jsonb_build_object('availability_warning',public.weekly_exchange_employee_warning(w,emp_id,s)) else '{}'::jsonb end end) order by a.created_at),'[]'::jsonb)
  into apps from public.shift_exchange_applications a join public.employee_profiles e on e.id=a.employee_id where a.case_id=c.id and (allowed or mine or a.employee_id=emp_id);
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'created_at',e.created_at,'message',e.message,
   -- K-S5: the note goes to who decides this case for this application too.
   'private_note',case when decides and exists(select 1 from unnest(array_remove(array[(c.offered_snapshot->>'location_id')::uuid,(c.requested_snapshot->>'location_id')::uuid],null)) x
    where app_private.exchange_decision_reason(actor,w,c.owner_id,(select a.employee_id from public.shift_exchange_applications a where a.id=e.application_id),x) is null)
    then nullif(e.private_note,'') end) order by e.created_at),'[]'::jsonb)
  into hist from public.shift_exchange_events e where e.case_id=c.id and (allowed or mine or e.application_id is null or exists(select 1 from public.shift_exchange_applications a where a.id=e.application_id and a.employee_id=emp_id));
  stage:=case when live_status<>'open' then 'closed'
   when exists(select 1 from public.shift_exchange_votes where case_id=c.id) then 'awaiting_other_manager'
   when exists(select 1 from public.shift_exchange_applications where case_id=c.id and status='pending_manager') then 'ready_for_manager'
   when exists(select 1 from public.shift_exchange_applications where case_id=c.id and status='invited') then 'awaiting_peer' else 'seeking_candidates' end;
 return jsonb_build_object('id',c.id,'kind',c.kind,'audience',c.audience,'status',live_status,'current_published',current_published,'requested_current_published',case when c.kind='swap' then requested_published else null end,
   'stage',stage,'revision',c.revision,'created_at',c.created_at,'expires_at',c.expires_at,'owner_id',c.owner_id,'owner_name',c.offered_snapshot->'employee_name',
   'shift',s,'requested_shift',t,'applications',apps,'candidate_count',(select count(*) from public.shift_exchange_applications where case_id=c.id and status in('invited','pending_manager') and live_status='open'),
   'can_manage',decides,
   'is_owner',mine,'private_note',case when allowed or mine then c.private_note else '' end,'history',hist);
end; $function$;
comment on function app_private.shift_exchange_case_item(uuid, uuid, public.shift_exchange_cases, boolean, uuid, jsonb, jsonb, text) is
  'One shift change as the Requests lists draw it; the reader decides who may see it (EKRAN-02 A4).';
revoke all on function app_private.shift_exchange_case_item(uuid, uuid, public.shift_exchange_cases, boolean, uuid, jsonb, jsonb, text) from public, anon, authenticated, service_role;

-- The two reads draw their rows with them; BL-839 ----------------------------------
CREATE OR REPLACE FUNCTION public.get_schedule_requests_service(actor_user_id uuid, target_workspace_id uuid, target_time_off_queue text DEFAULT 'needs_review'::text, target_location_id uuid DEFAULT NULL::uuid, target_search text DEFAULT ''::text, target_time_off_cursor timestamp with time zone DEFAULT NULL::timestamp with time zone, target_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare can_time_off boolean; can_shift boolean; time_rows jsonb; locations jsonb;
 time_count integer; time_cursor timestamptz; time_scope uuid[]; shift_scope uuid[]; reached uuid[];
begin
 if target_time_off_queue not in ('needs_review', 'closed') or target_limit not between 1 and 100 then raise exception 'invalid schedule request query' using errcode = '22023'; end if;
 time_scope := app_private.scope_set(actor_user_id, target_workspace_id, 'requests.read');
 shift_scope := app_private.scope_set(actor_user_id, target_workspace_id, 'exchange.read');
 -- The people whose time off the actor reads.
 -- ponytail: one core call per person of the workspace; ask per page if workspaces grow past a few hundred people.
 reached := coalesce((select array_agg(e.id) from public.employee_profiles e where e.workspace_id = target_workspace_id
   and app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', e.id) is null), '{}');
 can_time_off := cardinality(reached) > 0;
 can_shift := cardinality(shift_scope) > 0;
 -- Neither list anywhere: say why not.
 if not can_time_off and not can_shift then
  perform app_private.authorize(actor_user_id, target_workspace_id, 'requests.read', target_locations => time_scope);
 end if;
 if target_location_id is not null then
  if can_time_off and app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', null, target_location_id) is not null then
   raise exception 'Not allowed' using errcode = '42501', detail = 'requests.read',
     hint = 'authz.' || app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', null, target_location_id);
  end if;
  if can_shift then perform app_private.authorize(actor_user_id, target_workspace_id, 'exchange.read', array[target_location_id]); end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) order by l.name), '[]') into locations
 from public.locations l where l.workspace_id = target_workspace_id and l.archived_at is null and (l.id = any (time_scope) or l.id = any (shift_scope));
 select count(*) into time_count from public.schedule_time_off_requests r
 where can_time_off and r.workspace_id = target_workspace_id and r.status = 'pending' and r.employee_id = any (reached);
 -- ponytail: the queue past the cursor is read whole to find the page edge; bound it by the edge's send time if one queue grows past tens of thousands of requests.
 with filtered as (
  select r.* from public.schedule_time_off_requests r join public.employee_profiles e on e.id = r.employee_id
  where can_time_off and r.workspace_id = target_workspace_id and r.employee_id = any (reached)
   and (target_location_id is null
        or exists (select 1 from public.time_off_required_locations x where x.request_id = r.id and x.location_id = target_location_id))
   and ((target_time_off_queue = 'needs_review' and r.status = 'pending') or (target_time_off_queue = 'closed' and r.status <> 'pending'))
   and (target_time_off_cursor is null or r.created_at < target_time_off_cursor)
   and (btrim(target_search) = '' or concat_ws(' ', e.first_name, e.last_name, e.preferred_name, r.reason) ilike '%' || btrim(target_search) || '%')
 ), edge as (
  -- The send time of the page's last row.
  select f.created_at from filtered f order by f.created_at desc, f.id offset target_limit - 1 limit 1
 ), page as (
  -- A page takes every request sent at its edge's time, so "Older" starts right after it.
  select f.* from filtered f where not exists (select 1 from edge) or f.created_at >= (select edge.created_at from edge)
 )
 select coalesce(jsonb_agg(app_private.time_off_request_item(get_schedule_requests_service.actor_user_id, target_workspace_id, r.id)
   order by r.created_at desc, r.id), '[]'),
   -- "Older" only while something was sent before the edge.
   (select edge.created_at from edge where exists (select 1 from filtered f where f.created_at < edge.created_at))
 into time_rows, time_cursor
 from page r join public.employee_profiles e on e.id = r.employee_id;
 return jsonb_build_object('workspace_id', target_workspace_id,
   'time_format', (select time_format from public.workspace_scheduling_settings where workspace_id = target_workspace_id),
   'locations', locations, 'time_off_pending_count', time_count, 'time_off_next_cursor', time_cursor, 'time_off_requests', time_rows);
end;
$function$;

CREATE OR REPLACE FUNCTION public.shift_exchanges_read_service(actor uuid, w uuid, manager_view boolean DEFAULT false, from_date date DEFAULT CURRENT_DATE, to_date date DEFAULT (CURRENT_DATE + 42), focused_case_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp public.employee_profiles%rowtype; c public.shift_exchange_cases%rowtype; s jsonb; t jsonb; allowed boolean; mine boolean;
 case_items jsonb[]:='{}'; opportunities jsonb:='[]'; own_shifts jsonb:='[]'; chk jsonb; shift_row record; live_status text; published_cache jsonb:='{}'; source_key text;
 read_scope uuid[]:='{}';
begin
 if to_date<from_date or to_date>from_date+62 then raise exception 'Choose a date range up to 62 days'; end if;
 if not manager_view then perform app_private.authorize(actor,w,'employee_hub.read'); end if;
 select * into emp from public.employee_profiles where workspace_id=w and user_id=actor and archived_at is null;
 if not manager_view and emp.id is null then raise exception 'Employee profile required' using errcode='42501',hint='authz.out_of_scope'; end if;
 if manager_view then
  read_scope:=app_private.scope_set(actor,w,'exchange.read');
  -- Nowhere to read requests: asked with no location, the core says why; with
  -- no live location in the workspace there is nothing to read.
  if cardinality(read_scope)=0 and (app_private.authz_reason(actor,w,'exchange.read') is distinct from 'out_of_scope'
   or exists(select 1 from public.locations l where l.workspace_id=w and l.deleted_at is null)) then
   perform app_private.authorize(actor,w,'exchange.read');
  end if;
 end if;
 for c in select * from public.shift_exchange_cases x where x.workspace_id=w and (x.status='open' or x.id=focused_case_id
  or (x.offered_snapshot->>'date')::date between from_date and to_date
  or (x.requested_snapshot->>'date')::date between from_date and to_date
  or exists(select 1 from public.schedule_published_shifts p
   join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
   where p.workspace_id=w and coalesce(p.source_shift_id,p.id) in(x.offered_source_id,x.requested_source_id)
   and p.scheduled_date between from_date and to_date)) order by x.expires_at,x.created_at loop
  allowed:=manager_view and coalesce((c.offered_snapshot->>'location_id')::uuid=any(read_scope) or (c.kind='swap' and (c.requested_snapshot->>'location_id')::uuid=any(read_scope)),false);
  mine:=coalesce(c.owner_id=emp.id,false);
  if not allowed and not mine and not exists(select 1 from public.shift_exchange_applications where case_id=c.id and employee_id=emp.id) then continue; end if;
  -- Repeated historical requests refer to the same published source. Resolve
  -- each source once in this read only; no cache survives the function call.
  foreach source_key in array array_remove(array[c.offered_source_id::text,c.requested_source_id::text],null) loop
   if not published_cache ? source_key then
    published_cache:=published_cache||jsonb_build_object(source_key,public.shift_exchange_shift(w,source_key::uuid));
   end if;
  end loop;
  s:=nullif(published_cache->c.offered_source_id::text,'null'::jsonb);
  t:=nullif(published_cache->c.requested_source_id::text,'null'::jsonb);
  live_status:=public.shift_exchange_live_status(w,c.id);
  -- The list follows the displayed dates on either side; in Requests an open
  -- request is listed whatever its date (BL-839). A focused deep link bypasses
  -- only the range, never the actor checks above.
  if c.id is distinct from focused_case_id and not (manager_view and live_status='open') and not (
   coalesce((coalesce(s,c.offered_snapshot)->>'date')::date between from_date and to_date,false)
   or coalesce((coalesce(t,c.requested_snapshot)->>'date')::date between from_date and to_date,false)
  ) then continue; end if;
  case_items:=array_append(case_items,app_private.shift_exchange_case_item(actor,w,c,allowed,emp.id,s,t,live_status));
 end loop;
 if not manager_view then
  for shift_row in select p.id from public.schedule_published_shifts p join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
   where p.workspace_id=w and p.scheduled_date between from_date and to_date order by p.scheduled_date,p.start_time loop
   s:=public.shift_exchange_shift(w,shift_row.id);
   if (s->>'starts_at')::timestamptz<=clock_timestamp() then continue; end if;
   if (s->>'employee_id')::uuid=emp.id then own_shifts:=own_shifts||jsonb_build_array(s); continue; end if;
   select * into c from public.shift_exchange_cases where workspace_id=w and offered_source_id=(s->>'source_id')::uuid and status='open' and expires_at>clock_timestamp() and audience='eligible_pool' and kind<>'swap';
   if s->>'employee_id' is not null and c.id is null then continue; end if;
   chk:=(app_private.eligibility(w,emp.id,s,jsonb_build_object('operation',case when c.id is null then 'open_pickup' else 'release_pickup' end,'consent',true))-'approval_flags')||jsonb_build_object('availability_warning',public.weekly_exchange_employee_warning(w,emp.id,s));
   if chk->>'status'='eligible' and (c.id is null or c.consent_fingerprint=public.shift_exchange_fingerprint(w,s,null)) then
    opportunities:=opportunities||jsonb_build_array(jsonb_build_object('case_id',c.id,'shift',s,'eligibility',chk));
   end if;
  end loop;
 end if;
 return jsonb_build_object('employee_id',emp.id,'cases',to_jsonb(case_items),'opportunities',opportunities,'own_shifts',own_shifts);
end; $function$;

-- The Closed list ------------------------------------------------------------------
-- A date as Requests writes it ("Tue, Oct 14", "Oct 14, 2026") and as typed ("2026-10-14").
create function app_private.request_date_text(d date)
returns text language sql stable set search_path = '' as $function$
 select concat_ws(' ', to_char(d, 'Dy, Mon FMDD'), to_char(d, 'Mon FMDD, YYYY'), to_char(d, 'YYYY-MM-DD'))
$function$;
revoke all on function app_private.request_date_text(date) from public, anon, authenticated, service_role;

create function public.get_schedule_requests_closed_service(actor_user_id uuid, target_workspace_id uuid,
  target_kinds text[] default null, target_location_id uuid default null, target_search text default '',
  target_page integer default 1, target_page_size integer default 50)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare time_scope uuid[]; shift_scope uuid[]; reached uuid[]; time_here boolean; shift_here boolean;
 emp_id uuid; needle text := btrim(coalesce(target_search, '')); total integer; picked jsonb;
begin
 if target_page is null or target_page < 1 or target_page_size is null or target_page_size not in (25, 50, 100) then
  raise exception 'invalid closed request query' using errcode = '22023'; end if;
 time_scope := app_private.scope_set(actor_user_id, target_workspace_id, 'requests.read');
 shift_scope := app_private.scope_set(actor_user_id, target_workspace_id, 'exchange.read');
 -- The people whose time off the actor reads (requests.read; K-S2 lets a manager missing a document in).
 -- ponytail: one core call per person of the workspace, as the open list does; ask per page past a few hundred people.
 reached := coalesce((select array_agg(e.id) from public.employee_profiles e where e.workspace_id = target_workspace_id
   and app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', e.id) is null), '{}');
 time_here := cardinality(reached) > 0;
 shift_here := cardinality(shift_scope) > 0;
 -- Neither list anywhere: say why not.
 if not time_here and not shift_here then
  perform app_private.authorize(actor_user_id, target_workspace_id, 'requests.read', target_locations => time_scope);
 end if;
 -- A location narrows each list it is in; one in neither is refused.
 if target_location_id is not null then
  time_here := time_here and app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', null, target_location_id) is null;
  shift_here := shift_here and target_location_id = any (shift_scope);
  if not time_here and not shift_here then
   if cardinality(reached) > 0 then
    raise exception 'Not allowed' using errcode = '42501', detail = 'requests.read',
      hint = 'authz.' || app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', null, target_location_id);
   end if;
   perform app_private.authorize(actor_user_id, target_workspace_id, 'exchange.read', array[target_location_id]);
  end if;
 end if;
 select e.id into emp_id from public.employee_profiles e
 where e.workspace_id = target_workspace_id and e.user_id = actor_user_id and e.archived_at is null;

 -- ponytail: every closed request the actor reads is ranked to cut one page; key the order
 -- (closed_at, kind, id) with a cursor index if one workspace holds tens of thousands.
 with listed as (
  -- Closed time off: what the open list's "closed" queue holds. Every decision on a
  -- request (a verdict, the deadline, a revoke, a shortening) stamps its updated_at.
  select 'time_off'::text as kind, r.id, r.updated_at as closed_at
  from public.schedule_time_off_requests r join public.employee_profiles e on e.id = r.employee_id
  where time_here and r.workspace_id = target_workspace_id and r.status <> 'pending' and r.employee_id = any (reached)
   and (target_kinds is null or 'time_off' = any (target_kinds))
   and (target_location_id is null
        or exists (select 1 from public.time_off_required_locations x where x.request_id = r.id and x.location_id = target_location_id))
   and (needle = '' or concat_ws(' ', e.first_name, e.last_name, e.preferred_name, r.reason,
         (select concat_ws(' ', app_private.request_date_text(min(s.segment_date)), app_private.request_date_text(max(s.segment_date)))
          from public.schedule_time_off_segments s where s.request_id = r.id)) ilike '%' || needle || '%')
  union all
  -- Closed shift changes: every case no longer open, as its live status says; who sees one is who
  -- sees it in the shift changes list (exchange.read at a side's location, its owner, an applicant).
  select c.kind, c.id,
    greatest(c.updated_at, (select max(ev.created_at) from public.shift_exchange_events ev where ev.workspace_id = c.workspace_id and ev.case_id = c.id),
      case when c.status = 'open' and c.expires_at <= now() then c.expires_at end)
  from public.shift_exchange_cases c
  where shift_here and c.workspace_id = target_workspace_id
   and (target_kinds is null or c.kind = any (target_kinds))
   and (c.status <> 'open' or public.shift_exchange_live_status(target_workspace_id, c.id) <> 'open')
   and ((c.offered_snapshot ->> 'location_id')::uuid = any (shift_scope)
        or (c.kind = 'swap' and (c.requested_snapshot ->> 'location_id')::uuid = any (shift_scope))
        or c.owner_id = emp_id
        or exists (select 1 from public.shift_exchange_applications a where a.case_id = c.id and a.employee_id = emp_id))
   and (target_location_id is null or target_location_id in
        ((c.offered_snapshot ->> 'location_id')::uuid, (c.requested_snapshot ->> 'location_id')::uuid))
   and (needle = '' or concat_ws(' ', c.offered_snapshot ->> 'employee_name', c.requested_snapshot ->> 'employee_name',
         app_private.request_date_text((c.offered_snapshot ->> 'date')::date),
         app_private.request_date_text((c.requested_snapshot ->> 'date')::date),
         (select string_agg(concat_ws(' ', ae.first_name, ae.last_name, ae.preferred_name), ' ')
          from public.shift_exchange_applications a join public.employee_profiles ae on ae.id = a.employee_id
          where a.case_id = c.id)) ilike '%' || needle || '%')
 ), page as (
  select l.* from listed l order by l.closed_at desc, l.kind, l.id
  offset (target_page - 1) * target_page_size limit target_page_size
 )
 select (select count(*)::integer from listed),
   coalesce((select jsonb_agg(jsonb_build_object('kind', p.kind, 'id', p.id, 'closed_at', p.closed_at,
     'time_off', case when p.kind = 'time_off' then app_private.time_off_request_item(actor_user_id, target_workspace_id, p.id) end,
     'exchange', case when p.kind <> 'time_off' then (
       select app_private.shift_exchange_case_item(actor_user_id, target_workspace_id, c, coalesce(
           (c.offered_snapshot ->> 'location_id')::uuid = any (shift_scope)
           or (c.kind = 'swap' and (c.requested_snapshot ->> 'location_id')::uuid = any (shift_scope)), false),
         emp_id, public.shift_exchange_shift(target_workspace_id, c.offered_source_id),
         public.shift_exchange_shift(target_workspace_id, c.requested_source_id),
         public.shift_exchange_live_status(target_workspace_id, c.id))
       from public.shift_exchange_cases c where c.id = p.id) end)
     order by p.closed_at desc, p.kind, p.id) from page p), '[]')
 into total, picked;

 return jsonb_build_object('workspace_id', target_workspace_id,
   'time_format', (select time_format from public.workspace_scheduling_settings where workspace_id = target_workspace_id),
   'total', total, 'page', target_page, 'page_size', target_page_size, 'rows', picked);
end;
$function$;
comment on function public.get_schedule_requests_closed_service(uuid, uuid, text[], uuid, text, integer, integer) is
  'Requests -> Closed: closed time off (requests.read) and closed shift changes (exchange.read) in one order, newest decision first, a page at a time (EKRAN-02 A4).';
revoke all on function public.get_schedule_requests_closed_service(uuid, uuid, text[], uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.get_schedule_requests_closed_service(uuid, uuid, text[], uuid, text, integer, integer) to service_role;
