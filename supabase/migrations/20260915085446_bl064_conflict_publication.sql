-- Extend the existing evaluator with publication scope. Unpublished draft rows
-- outside that scope do not replace the currently published responsibility.
do $patch$
declare body text; anchor text;
begin
 body:=pg_get_functiondef('public.assess_weekly_shift_availability(uuid,uuid,jsonb)'::regprocedure);
 body:=replace(body,'s.id is distinct from exclude_id and s.source_shift_id is distinct from exclude_id',
  $scope$(shift ? '_publish_locations' or (s.id is distinct from exclude_id and s.source_shift_id is distinct from exclude_id))$scope$);
 anchor:='and s.id is distinct from exclude_id and s.scheduled_date between day-2 and day+2';
 if position(anchor in body)=0 then raise exception 'Conflict neighbor scope changed'; end if;
 body:=replace(body,anchor,anchor||$scope$
     and (not (shift ? '_publish_locations') or (s.location_id in (select value::uuid from jsonb_array_elements_text(shift->'_publish_locations'))
      and public.schedule_shift_in_department_scope_service(s.job_id,
       case when jsonb_typeof(shift->'_publish_departments')='array' then array(select value::uuid from jsonb_array_elements_text(shift->'_publish_departments')) end,
       coalesce((shift->>'_publish_no_department')::boolean,true))))$scope$);
 anchor:='and (schedule_week is null or s.scheduled_date not between schedule_week and schedule_week+6)';
 if position(anchor in body)=0 then raise exception 'Published neighbor scope changed'; end if;
 body:=replace(body,anchor,$scope$and (schedule_week is null or s.scheduled_date not between schedule_week and schedule_week+6
      or (shift ? '_publish_locations' and not (s.location_id in (select value::uuid from jsonb_array_elements_text(shift->'_publish_locations'))
       and public.schedule_shift_in_department_scope_service(s.job_id,
        case when jsonb_typeof(shift->'_publish_departments')='array' then array(select value::uuid from jsonb_array_elements_text(shift->'_publish_departments')) end,
        coalesce((shift->>'_publish_no_department')::boolean,true)))))$scope$);
 execute body;
end; $patch$;

-- Default-hour review removes the public identity from its confirmation token,
-- but must retain the current row exclusion for overlap evaluation.
do $default_hours$
declare body text; anchor text:=$old$proposed-'id'-'source_shift_id'$old$;
begin
 body:=pg_get_functiondef('public.preview_schedule_default_hours_service(uuid,uuid,uuid,jsonb)'::regprocedure);
 if position(anchor in body)=0 then raise exception 'Default-hour assessment seam changed'; end if;
 execute replace(body,anchor,$new$(proposed-'id'-'source_shift_id')||jsonb_build_object('_exclude_shift_id',shift.id,'session_id',sid)$new$);
end; $default_hours$;

alter table public.schedule_publication_overrides drop constraint schedule_publication_overrides_finding_code_check;
alter table public.schedule_publication_overrides add constraint schedule_publication_overrides_finding_code_check
 check(finding_code in ('availability','closed_location','schedule_conflict'));

create or replace function public.weekly_schedule_publication_preflight(payload jsonb,actor uuid,departments uuid[] default null,include_no_department boolean default true) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare findings jsonb; signatures jsonb:='[]'; s record; a jsonb; prior jsonb; evidence jsonb; scope jsonb;
 unsigned jsonb; w uuid:=(payload->>'workspace_id')::uuid; message text; state text; tier text; warning boolean;
begin
 if payload->>'status'='past_week_closed' then return payload; end if;
 select coalesce(jsonb_agg(f),'[]') into findings from jsonb_array_elements(payload->'findings') f
  where f->>'code' not in ('availability','availability_unknown','availability_review_pending','time_source_unresolved','overlap','double_booking','time_off','closed_location','closed_day');
 scope:=jsonb_build_object('_publish_locations',(select jsonb_agg(x->'location_id') from jsonb_array_elements(payload->'locations') x),
  '_publish_departments',to_jsonb(departments),'_publish_no_department',coalesce(include_no_department,true));
 for s in select d.*,concat_ws(' ',e.first_name,e.last_name) employee_name,l.name location_name
  from public.schedule_draft_shifts d left join public.employee_profiles e on e.id=d.employee_id and e.workspace_id=d.workspace_id
  join public.locations l on l.id=d.location_id and l.workspace_id=d.workspace_id
  where d.workspace_id=w and d.draft_id=(payload->>'draft_id')::uuid
   and d.location_id in (select (x->>'location_id')::uuid from jsonb_array_elements(payload->'locations') x)
   and public.schedule_shift_in_department_scope_service(d.job_id,departments,coalesce(include_no_department,true)) order by d.id loop
  if not public.schedule_actor_can_publish_service(actor,w,s.location_id) then raise exception 'Schedule location access denied' using errcode='42501'; end if;
  state:=null;
  a:=public.assess_weekly_shift_availability(w,s.employee_id,to_jsonb(s)||scope);
  prior:=public.schedule_availability_prior_publication(w,to_jsonb(s));
  evidence:=public.schedule_availability_override(w,to_jsonb(s),a);
  signatures:=signatures||jsonb_build_array(jsonb_build_object('shift_id',s.id,'fingerprint',a->>'fingerprint','override_id',evidence->>'id','retained_publication_id',prior->>'publication_id'));
  -- Always evaluate hard rules again. Retention only suppresses unchanged
  -- soft availability reminders; new business conflicts are still reviewed.
  if prior is not null and a->>'conflict_severity'<>'block' and
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
end; $$;
revoke all on function public.weekly_schedule_publication_preflight(jsonb,uuid,uuid[],boolean) from public,anon,authenticated,service_role;

create or replace function public.weekly_publication_decisions(preview jsonb,decisions jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb:='[]'; f jsonb; decision jsonb;
begin
 if jsonb_typeof(coalesce(decisions,'[]')) is distinct from 'array' then raise exception 'publication overrides must be an array' using errcode='22023'; end if;
 for f in select value from jsonb_array_elements(preview->'findings') where value->>'severity'='soft' loop
  select d into decision from jsonb_array_elements(coalesce(decisions,'[]')) d where d->>'finding_id'=f->>'id' limit 1;
  if f->>'availability_state'='new' and f->>'warning_policy'='confirm' and decision is null then
   raise exception 'Confirm the current schedule conflicts before publishing' using errcode='22023'; end if;
  if f->>'availability_state' is null and coalesce(f->>'tier','blocker')<>'note' and decision is null then
   raise exception 'Review the current schedule conflicts before publishing' using errcode='22023'; end if;
  result:=result||jsonb_build_array(jsonb_build_object('finding_id',f->>'id','reason',case
   when f->>'availability_state'='accepted' then 'Previously accepted schedule conflict retained.'
   when f->>'warning_policy'='warn' then 'Schedule warning acknowledged (warn policy).'
   else 'Schedule conflict confirmed by manager.' end));
 end loop;
 return result;
end; $$;
revoke all on function public.weekly_publication_decisions(jsonb,jsonb) from public,anon,authenticated,service_role;

-- Pass the same transaction-local scope to the existing assignment trigger.
-- This matters when a draft contains edits outside the chosen publish scope.
do $patch$
declare body text; sig regprocedure; anchor text;
begin
 foreach sig in array array[
  'public.publish_schedule_draft_service_document_conflict_base(uuid,uuid,uuid,uuid[],uuid[],boolean,integer,text,jsonb)'::regprocedure,
  'public.publish_schedule_draft_service_label_base(uuid,uuid,uuid,uuid[],integer,text,jsonb)'::regprocedure
 ] loop
  body:=pg_get_functiondef(sig);
  anchor:='override_decisions:=public.weekly_publication_decisions(preview,override_decisions);';
  if position(anchor in body)=0 then raise exception 'Publication decision seam changed'; end if;
  body:=replace(body,anchor,anchor||$scope$
  perform set_config('newfork.schedule_publish_scope',jsonb_build_object('workspace_id',target_workspace_id,'draft_id',target_draft_id,
   '_publish_locations',(select jsonb_agg(x->'location_id') from jsonb_array_elements(preview->'locations') x),
   '_publish_departments',preview->'department_ids','_publish_no_department',coalesce((preview->>'include_no_department')::boolean,true))::text,true);$scope$);
  execute body;
 end loop;
 body:=pg_get_functiondef('public.guard_schedule_assignment_availability()'::regprocedure);
 anchor:='a:=public.assess_weekly_shift_availability(new.workspace_id,new.employee_id,s);';
 if position(anchor in body)=0 then raise exception 'Assignment trigger assessment seam changed'; end if;
 body:=replace(body,anchor,$scope$
 if tg_table_name='schedule_published_shifts' and nullif(current_setting('newfork.schedule_publish_scope',true),'') is not null
  and (current_setting('newfork.schedule_publish_scope',true)::jsonb->>'workspace_id')::uuid=new.workspace_id
  and exists(select 1 from public.schedule_location_publications p where p.id=(s->>'publication_id')::uuid
   and p.source_draft_id=(current_setting('newfork.schedule_publish_scope',true)::jsonb->>'draft_id')::uuid) then
  s:=s||current_setting('newfork.schedule_publish_scope',true)::jsonb;
 end if;
 $scope$||anchor);
 body:=replace(body,$old$o.finding_code='availability'$old$,$new$o.finding_code in ('availability','schedule_conflict')$new$);
 execute body;
end; $patch$;
