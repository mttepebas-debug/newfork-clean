-- Time off rebuild D7: the switch over. (KARARLAR S-239, S-243.)
--
-- 1. S-243: the Publish window's "time off waiting for a decision" note is read only by who may answer that
--    request, as the Schedule grid already does (app_private.time_off_decider_reason). A publisher who does not
--    decide time off gets no note; publishing is not held either way.
-- 2. The sweep (app_private.time_off_requests_sweep) takes a request that failed before after all the others, so
--    a request that keeps failing never fills a pass (nf-guvenlik, low).

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
