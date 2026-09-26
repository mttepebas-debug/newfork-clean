-- FB-6.1.7 (T4, REUSE "Müsaitlik"): switching employee availability to Block
-- does not reach shifts that were accepted and published before the switch.
-- The grid, the edit session and the publish trigger already kept such an
-- unchanged shift; the publication preview re-judged it under Block and said
-- hard_blocked, so the week could not be published again (also after an
-- unpublish). Retention now covers any availability-only assessment, Block
-- included; any other reason (approved time off, overlap, rest, documents...)
-- is still judged afresh. Body copied from the live definition; only the
-- retention condition and its comment change.
create or replace function public.weekly_schedule_publication_preflight(payload jsonb, actor uuid, departments uuid[] default null::uuid[], include_no_department boolean default true)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare findings jsonb; signatures jsonb:='[]'; s record; a jsonb; prior jsonb; evidence jsonb; scope jsonb;
 unsigned jsonb; w uuid:=(payload->>'workspace_id')::uuid; message text; state text; tier text; warning boolean;
begin
 if payload->>'status'='past_week_closed' then return payload; end if;
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
  state:=null;
  a:=public.assess_weekly_shift_availability(w,s.employee_id,to_jsonb(s)||scope);
  prior:=public.schedule_availability_prior_publication(w,to_jsonb(s));
  evidence:=public.schedule_availability_override(w,to_jsonb(s),a);
  signatures:=signatures||jsonb_build_array(jsonb_build_object('shift_id',s.id,'fingerprint',a->>'fingerprint','override_id',evidence->>'id','retained_publication_id',prior->>'publication_id'));
  -- An unchanged, already published shift keeps its availability acceptance
  -- at any level, Block included (switching to Block reaches only new
  -- assignments). Every other reason is judged again.
  if prior is not null and
   not exists(select 1 from jsonb_array_elements(a->'reasons') r where r->>'code'<>'availability') then
   if not public.weekly_published_availability_visible(w,s.employee_id,prior->'availability_snapshot') then continue; end if;
   a:=prior->'availability_snapshot'->'assessment'; state:='accepted';
  elsif a->>'operation'='allowed' then continue;
  elsif a->>'operation'='warning_requires_override' then
   state:=case when evidence is not null or prior->'availability_snapshot'->'assessment'->>'fingerprint'=a->>'fingerprint'
    or exists(select 1 from public.schedule_publication_overrides o where o.workspace_id=w
     and o.publication_id=(prior->>'publication_id')::uuid and o.finding_id=a->>'fingerprint' and s.id=any(o.source_shift_ids)) then 'accepted' else 'new' end;
   if s.employee_id is null and exists(select 1 from public.audit_events ev where ev.workspace_id=w and ev.action='schedule.conflict_accepted'
     and ev.target_id=s.id::text and ev.metadata->'assessment'->>'fingerprint'=a->>'fingerprint') then state:='accepted'; end if;
  end if;
  warning:=state is not null;
  select string_agg(r->>'message',' ' order by ord) into message from jsonb_array_elements(a->'reasons') with ordinality r(r,ord);
  tier:=case when not warning then 'blocker' when state='new' and a->>'warning_policy'='confirm' then 'risk' else 'note' end;
  findings:=findings||jsonb_build_array(jsonb_build_object('id',a->>'fingerprint',
   'code',case when not exists(select 1 from jsonb_array_elements(a->'reasons') r where r->>'code'<>'availability') then 'availability' else 'schedule_conflict' end,
   'conflict_severity',coalesce(a->>'conflict_severity',case when a->>'warning_policy'='confirm' then 'confirm' else 'warn' end),
   'severity',case when warning then 'soft' else 'hard' end,'overrideable',warning,'tier',tier,'introduced',state is distinct from 'accepted',
   'location_id',s.location_id,'location_name',s.location_name,'employee_id',s.employee_id,'employee_name',nullif(s.employee_name,''),
   'scheduled_date',s.scheduled_date,'shift_ids',jsonb_build_array(s.id),'message',left(coalesce(message,'Review this assignment before publishing.'),500))
   ||case when warning then jsonb_build_object('availability_state',state,'warning_policy',a->>'warning_policy') else '{}'::jsonb end);
 end loop;
 unsigned:=(payload-'fingerprint'-'status')||jsonb_build_object('findings',findings,'availability_assessments',signatures,'department_ids',to_jsonb(departments),'include_no_department',coalesce(include_no_department,true));
 return unsigned||jsonb_build_object('status',case
  when exists(select 1 from jsonb_array_elements(findings) f where f->>'severity'='hard' and coalesce(f->>'tier','blocker')<>'note') then 'hard_blocked'
  when exists(select 1 from jsonb_array_elements(findings) f where coalesce(f->>'tier','blocker')<>'note' and (coalesce((f->>'introduced')::boolean,true) or not (f->>'overrideable')::boolean)) then 'override_required'
  else 'publish_ready' end,'fingerprint',encode(extensions.digest(convert_to(unsigned::text,'UTF8'),'sha256'),'hex'));
end; $function$;
