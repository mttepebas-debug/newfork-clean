-- FB-6.3 rule 13 (KARARLAR "İzin"): a shift that meets time off still waiting
-- for a decision gets a note in the publish window. A note never blocks the
-- publish, asks no confirmation and leaves no record.
--
-- One note per person, day, location and request: code time_off_pending,
-- severity soft, tier note, not overrideable, with the request's id and the
-- draft shifts there that have not started. The publisher sees the same
-- shifts as for every other finding (the locations being published). The
-- shift's span is the one the availability check measured and the leave's is
-- the one the approved check reads (time_off_effective_ranges is the asked
-- period while a request is pending), so pending and approved time off meet a
-- shift by one rule.

create or replace function public.weekly_schedule_publication_preflight(payload jsonb, actor uuid, departments uuid[] DEFAULT NULL::uuid[], include_no_department boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare findings jsonb; signatures jsonb:='[]'; s record; a jsonb; prior jsonb; evidence jsonb; scope jsonb;
 unsigned jsonb; w uuid:=(payload->>'workspace_id')::uuid; message text; state text; tier text; warning boolean;
 ack_by uuid; ack_at timestamptz; ack_name text; pending jsonb:='[]'; shift_span tstzrange; asking uuid[];
begin
 if payload->>'status'='past_week_closed' then return payload; end if;
 -- Who has time off waiting for a decision, read once for the whole draft.
 asking:=array(select distinct q.employee_id from public.schedule_time_off_requests q
  where q.workspace_id=w and q.status='pending' and q.request_type='time_off');
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
   select string_agg(r->>'message',' ' order by ord) into message from jsonb_array_elements(a->'reasons') with ordinality r(r,ord) where r->>'code'<>'availability';
   tier:=case when not warning then 'blocker' when state='new' and a->>'warning_policy'='confirm' then 'risk' else 'note' end;
   findings:=findings||jsonb_build_array(jsonb_build_object('id',a->>'fingerprint','code','schedule_conflict',
    'conflict_severity',coalesce(a->>'conflict_severity',case when a->>'warning_policy'='confirm' then 'confirm' else 'warn' end),
    'severity',case when warning then 'soft' else 'hard' end,'overrideable',warning,'tier',tier,'introduced',state is distinct from 'accepted',
    'location_id',s.location_id,'location_name',s.location_name,'employee_id',s.employee_id,'employee_name',nullif(s.employee_name,''),
    'scheduled_date',s.scheduled_date,'shift_ids',jsonb_build_array(s.id),'message',left(coalesce(message,'Review this assignment before publishing.'),500))
    ||case when warning then jsonb_build_object('availability_state',state,'warning_policy',a->>'warning_policy') else '{}'::jsonb end);
  end if;
  -- The availability warning: new until someone acknowledged this exact
  -- warning at a publish (same person, shift, hours and marks).
  if coalesce((a->>'has_availability_conflict')::boolean,false) then
   select o.actor_user_id,o.created_at,coalesce(nullif(p.display_name,''),'Manager') into ack_by,ack_at,ack_name
    from public.schedule_publication_overrides o left join public.user_profiles p on p.user_id=o.actor_user_id
    where o.workspace_id=w and o.finding_code='availability' and o.finding_id=a->>'availability_fingerprint'
    order by o.created_at desc limit 1;
   findings:=findings||jsonb_build_array(jsonb_build_object('id',a->>'availability_fingerprint','code','availability',
    'conflict_severity','warn','severity','soft','overrideable',true,'tier',case when ack_by is null then 'risk' else 'note' end,
    'introduced',ack_by is null,'availability_state',case when ack_by is null then 'new' else 'accepted' end,'warning_policy','confirm',
    'location_id',s.location_id,'location_name',s.location_name,'employee_id',s.employee_id,'employee_name',nullif(s.employee_name,''),
    'scheduled_date',s.scheduled_date,'shift_ids',jsonb_build_array(s.id),
    'message',left(coalesce(nullif(s.employee_name,''),'This person')||' shows as unavailable for this shift.',500))
    ||case when ack_by is null then '{}'::jsonb else jsonb_build_object('acknowledged_by_user_id',ack_by,'acknowledged_by_name',ack_name,'acknowledged_at',ack_at) end);
  end if;
  -- Time off waiting for a decision over a shift that has not started (FB-6.3).
  if s.employee_id=any(asking) then
   select tstzrange((i->>'start_at')::timestamptz,(i->>'end_at')::timestamptz,'[)') into shift_span
    from jsonb_array_elements(case when a->>'assessment_scope'='shift_interval' then a->'intervals' else a->'unknown_intervals' end) i limit 1;
   if lower(shift_span)>now() then
    pending:=pending||coalesce((select jsonb_agg(jsonb_build_object('employee_id',s.employee_id,'employee_name',nullif(s.employee_name,''),
      'scheduled_date',s.scheduled_date,'location_id',s.location_id,'location_name',s.location_name,'shift_id',s.id,'request_id',r.id))
     from (select distinct req.id from public.schedule_time_off_requests req
      join public.schedule_time_off_segments seg on seg.request_id=req.id and seg.workspace_id=req.workspace_id
      where req.workspace_id=w and req.employee_id=s.employee_id and req.request_type='time_off' and req.status='pending'
       and seg.segment_date between s.scheduled_date-3 and s.scheduled_date+3
       and public.time_off_effective_ranges(seg.id)&&shift_span) r),'[]');
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
end; $function$;

-- A note nobody can override (the time-off note) asks for nothing at publish
-- and leaves no record in schedule_publication_overrides. Above a note, a
-- soft finding still has to be reviewed.
create or replace function public.weekly_publication_decisions(preview jsonb, decisions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare result jsonb:='[]'; f jsonb; decision jsonb;
begin
 if jsonb_typeof(coalesce(decisions,'[]')) is distinct from 'array' then raise exception 'publication overrides must be an array' using errcode='22023'; end if;
 for f in select value from jsonb_array_elements(preview->'findings') where value->>'severity'='soft' loop
  if not coalesce((f->>'overrideable')::boolean,true) and f->>'tier'='note' then continue; end if;
  -- An availability warning acknowledged at an earlier publish keeps that record.
  if f->>'code'='availability' and f->>'availability_state'='accepted' then continue; end if;
  select d into decision from jsonb_array_elements(coalesce(decisions,'[]')) d where d->>'finding_id'=f->>'id' limit 1;
  if f->>'code'='availability' and decision is null then
   raise exception 'Acknowledge the availability warnings before publishing' using errcode='22023'; end if;
  if f->>'availability_state'='new' and f->>'warning_policy'='confirm' and decision is null then
   raise exception 'Confirm the current schedule conflicts before publishing' using errcode='22023'; end if;
  if f->>'availability_state' is null and coalesce(f->>'tier','blocker')<>'note' and decision is null then
   raise exception 'Review the current schedule conflicts before publishing' using errcode='22023'; end if;
  result:=result||jsonb_build_array(jsonb_build_object('finding_id',f->>'id','reason',case
   when f->>'code'='availability' then 'Availability warning acknowledged.'
   when f->>'availability_state'='accepted' then 'Previously accepted schedule conflict retained.'
   when f->>'warning_policy'='warn' then 'Schedule warning acknowledged (warn policy).'
   else 'Schedule conflict confirmed by manager.' end));
 end loop;
 return result;
end; $function$;
