-- EKRAN-02 A0 (R2-03): Requests → Time off shows 50 requests a page and
-- "Older" asks for the requests sent before the cursor. The cursor was the
-- send time of the 51st row, so "Older" started after it: every page edge
-- lost one request (Ali's 51st request never showed). Two requests sent in
-- the same instant could also split across the edge and the second was lost.
--
-- The cursor is now the send time of the page's last row, and a page never
-- splits one instant: it takes every request sent at that time, so "Older"
-- (created_at < cursor) starts exactly after it. Signature and model shape
-- are unchanged; the API and the web pass the cursor as before.
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
 select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'employee_id', r.employee_id,
   'employee_name', concat_ws(' ', coalesce(nullif(e.preferred_name, ''), e.first_name), e.last_name),
   'request_type', r.request_type, 'reason', r.reason,
   'cancellation', public.time_off_cancellation_context(target_workspace_id, r.id), 'status', r.status,
   'start_date', (select min(s.segment_date) from public.schedule_time_off_segments s where s.request_id = r.id),
   'end_date', (select max(s.segment_date) from public.schedule_time_off_segments s where s.request_id = r.id),
   'revision', r.revision, 'created_at', r.created_at, 'decide_by', r.decide_by,
   'conflict_count', public.time_off_request_assignment_count(target_workspace_id, r.id),
   'segments', public.time_off_request_periods(r.id, target_workspace_id),
   'progress', case when r.status = 'pending' then app_private.time_off_progress(get_schedule_requests_service.actor_user_id, target_workspace_id, r.id) end,
   'events', coalesce((select jsonb_agg(jsonb_build_object('id', ev.id, 'action', ev.action,
       'actor_name', case when ev.actor_user_id is null then 'System' else coalesce(nullif(up.display_name, ''), 'Team member') end,
       'note', ev.note, 'created_at', ev.created_at,
       'released_assignments', public.time_off_event_released_assignments(get_schedule_requests_service.actor_user_id, target_workspace_id, ev.id)) order by ev.created_at)
     from public.schedule_time_off_events ev left join public.user_profiles up on up.user_id = ev.actor_user_id where ev.request_id = r.id), '[]'))
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
