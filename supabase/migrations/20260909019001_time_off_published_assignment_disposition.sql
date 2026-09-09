-- A leave decision and its explicit published-assignment disposition commit
-- together. Requests and previews never release an employee from a shift.
create function public.time_off_proposed_approved_ranges(w uuid,rid uuid,action text,decisions jsonb)
returns tstzmultirange language plpgsql stable security definer set search_path='' as $$
declare d jsonb; p jsonb; pieces jsonb; original tstzrange; part tstzrange; covered tstzmultirange; approved tstzmultirange:='{}';
begin
 if action='approve' then return coalesce((select range_agg(public.time_off_period_span(s.id)) from public.schedule_time_off_segments s where s.workspace_id=w and s.request_id=rid),'{}'); end if;
 if action<>'partial_approve' then return '{}'; end if;
 if jsonb_typeof(decisions) is distinct from 'array' then raise exception 'Decide each requested period' using errcode='22023'; end if;
 if jsonb_array_length(decisions)=0 or jsonb_array_length(decisions)<>(select count(*) from public.schedule_time_off_segments where workspace_id=w and request_id=rid)
  or (select count(distinct (item->>'segment_id')::uuid) from jsonb_array_elements(decisions) item)<>jsonb_array_length(decisions)
  or exists(select 1 from jsonb_array_elements(decisions) item where not exists(select 1 from public.schedule_time_off_segments s where s.id=(item->>'segment_id')::uuid and s.workspace_id=w and s.request_id=rid)) then
  raise exception 'Review each requested time-off segment exactly once' using errcode='22023'; end if;
 for d in select value from jsonb_array_elements(decisions) loop
  original:=public.time_off_period_span((d->>'segment_id')::uuid); covered:='{}';
  if d ? 'pieces' then
   if d ? 'status' or jsonb_typeof(d->'pieces') is distinct from 'array' then raise exception 'Choose a whole-period decision or explicit pieces' using errcode='22023'; end if;
   pieces:=d->'pieces';
  else pieces:=jsonb_build_array(jsonb_build_object('starts_at',lower(original),'ends_at',upper(original),'status',d->>'status')); end if;
  if jsonb_array_length(pieces) not between 1 and 32 then raise exception 'Decide every piece of the requested period' using errcode='22023'; end if;
  for p in select value from jsonb_array_elements(pieces) loop
   if coalesce(p->>'status','') not in('approved','denied') or coalesce(p->>'starts_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
    or coalesce(p->>'ends_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Each decision piece needs exact instants and an outcome' using errcode='22023'; end if;
   if (p->>'starts_at')::timestamptz>=(p->>'ends_at')::timestamptz then raise exception 'Decision pieces must have positive duration' using errcode='22023'; end if;
   part:=tstzrange((p->>'starts_at')::timestamptz,(p->>'ends_at')::timestamptz,'[)');
   if not(original @> part) or covered && part then raise exception 'Decision pieces overlap or exceed the requested hours' using errcode='22023'; end if;
   covered:=covered+tstzmultirange(part);
   if p->>'status'='approved' then approved:=approved+tstzmultirange(part); end if;
  end loop;
  if covered<>tstzmultirange(original) then raise exception 'Decision pieces must cover the entire requested period' using errcode='22023'; end if;
 end loop;
 return approved;
end $$;

create function public.time_off_assignment_impact(w uuid,emp uuid,approved tstzmultirange) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s record; assessment jsonb; span tstzrange; item jsonb; result jsonb:='[]'; zone_name text;
begin
 if isempty(approved) then return result; end if;
 for s in select ps.* from public.schedule_published_shifts ps join public.schedule_location_publications pub on pub.id=ps.publication_id and pub.status='current'
  where ps.workspace_id=w and ps.employee_id=emp
   and ps.scheduled_date between (lower(range_merge(approved)) at time zone 'UTC')::date-3 and (upper(range_merge(approved)) at time zone 'UTC')::date+3 order by ps.id loop
  assessment:=public.assess_shift_availability(w,emp,to_jsonb(s)); zone_name:=assessment->>'timezone';
  if jsonb_array_length(assessment->'intervals')>0 then
   span:=tstzrange((assessment->'intervals'->0->>'start_at')::timestamptz,(assessment->'intervals'->0->>'end_at')::timestamptz,'[)');
  else span:=tstzrange(s.scheduled_date::timestamp at time zone zone_name,(s.scheduled_date+1)::timestamp at time zone zone_name,'[)'); end if;
  if approved && span then
   item:=public.shift_exchange_shift(w,s.id)||jsonb_build_object('publication_id',s.publication_id,'time_unknown',jsonb_array_length(assessment->'intervals')=0,
    'starts_at',case when jsonb_array_length(assessment->'intervals')>0 then lower(span) end,'ends_at',case when jsonb_array_length(assessment->'intervals')>0 then upper(span) end);
   result:=result||jsonb_build_array(item);
  end if;
 end loop;
 return result;
end $$;

create function public.preview_time_off_assignment_decision_service(actor uuid,w uuid,rid uuid,expected_revision integer,action text,decisions jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.schedule_time_off_requests%rowtype; approved tstzmultirange; affected jsonb; visible_shifts jsonb:='[]'; s jsonb; restricted integer:=0; fp text;
begin
 select * into r from public.schedule_time_off_requests where id=rid and workspace_id=w;
 if r.id is null then raise exception 'time off request not found' using errcode='P0002'; end if;
 if not public.schedule_actor_has_capability_service(actor,w,'schedule.time_off_requests.manage',r.location_id) then raise exception 'time off request manage access denied' using errcode='42501'; end if;
 if exists(select 1 from public.employee_profiles e where e.id=r.employee_id and e.workspace_id=w and e.user_id=actor) then raise exception 'Own time-off decision access denied; another manager must review this request' using errcode='42501'; end if;
 if expected_revision is null or r.revision<>expected_revision or r.status<>'pending' then raise exception 'stale time off request' using errcode='40001'; end if;
 if action not in('approve','partial_approve') then raise exception 'Preview the approval decision before changing assignments' using errcode='22023'; end if;
 approved:=public.time_off_proposed_approved_ranges(w,rid,action,decisions);
 affected:=public.time_off_assignment_impact(w,r.employee_id,approved);
 for s in select value from jsonb_array_elements(affected) loop
  if public.schedule_actor_can_publish_service(actor,w,(s->>'location_id')::uuid) then visible_shifts:=visible_shifts||jsonb_build_array(s);
  else restricted:=restricted+1; end if;
 end loop;
 fp:=encode(extensions.digest(convert_to(jsonb_build_object('request',rid,'revision',r.revision,'approved',public.availability_ranges_json(approved),'shifts',affected)::text,'UTF8'),'sha256'),'hex');
 return jsonb_build_object('request_id',rid,'revision',r.revision,'fingerprint',fp,'affected_shifts',visible_shifts,'restricted_count',restricted,
  'approved_intervals',public.availability_ranges_json(approved));
end $$;

create table public.time_off_assignment_releases(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,request_id uuid not null,decision_revision integer not null,
 published_shift_id uuid not null,before_assignment jsonb not null,
 actor_user_id uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(request_id,workspace_id) references public.schedule_time_off_requests(id,workspace_id),
 foreign key(published_shift_id,workspace_id) references public.schedule_published_shifts(id,workspace_id),
 unique(request_id,decision_revision,published_shift_id));
alter table public.time_off_assignment_releases enable row level security;
revoke all on public.time_off_assignment_releases from public,anon,authenticated,service_role;
create function public.guard_time_off_assignment_release() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Time-off assignment release history is immutable' using errcode='55000'; end $$;
create trigger guard_time_off_assignment_release before update or delete on public.time_off_assignment_releases for each row execute function public.guard_time_off_assignment_release();

-- Private decision core retains 18001 validation, exact-cover and history. Both
-- public compatibility signatures below now pass through assignment disposition.
alter function public.resolve_schedule_time_off_request_service(uuid,uuid,uuid,integer,text,text,jsonb) rename to apply_time_off_period_decision;
revoke all on function public.apply_time_off_period_decision(uuid,uuid,uuid,integer,text,text,jsonb) from public,anon,authenticated,service_role;

create function public.decide_time_off_with_assignments_service(actor uuid,w uuid,rid uuid,expected_revision integer,action text,note text,decisions jsonb,
 operation_id uuid,expected_impact text,dispositions jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.schedule_time_off_requests%rowtype; prior public.time_off_commands%rowtype; command jsonb; result jsonb; preview jsonb;
 affected jsonb:='[]'; s jsonb; changes jsonb:='[]'; other record; locked_id uuid;
begin
 perform public.availability_lock_workspace(w);
 select * into r from public.schedule_time_off_requests where id=rid and workspace_id=w for update;
 if r.id is null then raise exception 'time off request not found' using errcode='P0002'; end if;
 if not public.schedule_actor_has_capability_service(actor,w,'schedule.time_off_requests.manage',r.location_id) then raise exception 'time off request manage access denied' using errcode='42501'; end if;
 if operation_id is null then raise exception 'A decision key is required' using errcode='22023'; end if;
 command:=jsonb_build_object('kind','assignment_decision','request_id',rid,'expected_revision',expected_revision,'action',action,'note',btrim(coalesce(note,'')),
  'decisions',decisions,'impact',expected_impact,'dispositions',dispositions);
 select * into prior from public.time_off_commands c where c.workspace_id=w and c.actor_user_id=actor and c.operation_id=decide_time_off_with_assignments_service.operation_id;
 if found then
  if prior.input->>'kind'='decision' and coalesce(dispositions,'[]'::jsonb)='[]'::jsonb and prior.input=jsonb_build_object('kind','decision','request_id',rid,
   'expected_revision',expected_revision,'action',action,'note',btrim(coalesce(note,'')),'decisions',decisions) then return prior.result; end if;
  if prior.input<>command then raise exception 'This decision key was used for a different decision' using errcode='40001'; end if;
  return prior.result;
 end if;
 if jsonb_typeof(dispositions) is distinct from 'array' then raise exception 'Review the published assignment decisions' using errcode='22023'; end if;
 if action in('approve','partial_approve') then
  preview:=public.preview_time_off_assignment_decision_service(actor,w,rid,expected_revision,action,decisions);
  if (preview->>'restricted_count')::integer>0 then raise exception 'Published assignment scope denied; a manager with publishing access to every affected location must decide this request' using errcode='42501'; end if;
  affected:=preview->'affected_shifts';
  -- Lock the concrete current snapshots and recompute after any older writer.
  for locked_id in select ps.id from public.schedule_published_shifts ps where ps.workspace_id=w and ps.id in(select (x->>'id')::uuid from jsonb_array_elements(affected) x) order by ps.id for update loop null; end loop;
  preview:=public.preview_time_off_assignment_decision_service(actor,w,rid,expected_revision,action,decisions);
  if (preview->>'restricted_count')::integer>0 then raise exception 'Published assignment scope denied' using errcode='42501'; end if;
  affected:=preview->'affected_shifts';
  if (expected_impact is not null or jsonb_array_length(affected)>0) and expected_impact is distinct from preview->>'fingerprint' then
   raise exception 'Published assignment conflict: review the current affected shifts before approval' using errcode='40001'; end if;
  if jsonb_array_length(dispositions)<>jsonb_array_length(affected)
   or (select count(distinct (x->>'shift_id')::uuid) from jsonb_array_elements(dispositions) x)<>jsonb_array_length(dispositions)
   or exists(select 1 from jsonb_array_elements(dispositions) x where coalesce(x->>'action','')<>'release_entire_shift' or not exists(select 1 from jsonb_array_elements(affected) impacted where impacted->>'id'=((x->>'shift_id')::uuid)::text)) then
   raise exception 'Choose an explicit disposition for every affected published shift' using errcode='22023'; end if;
 elsif jsonb_array_length(dispositions)>0 then raise exception 'Only approval can change published assignments' using errcode='22023'; end if;
 result:=public.apply_time_off_period_decision(actor,w,rid,expected_revision,action,note,decisions);
 for s in select value from jsonb_array_elements(affected) loop
  insert into public.time_off_assignment_releases(workspace_id,request_id,decision_revision,published_shift_id,before_assignment,actor_user_id)
   values(w,rid,(result->>'revision')::integer,(s->>'id')::uuid,s,actor);
  update public.schedule_published_shifts set employee_id=null where workspace_id=w and id=(s->>'id')::uuid and employee_id=r.employee_id;
  if not found then raise exception 'Published assignment changed before release' using errcode='40001'; end if;
  changes:=changes||jsonb_build_array(s||jsonb_build_object('new_employee_id',null));
 end loop;
 if jsonb_array_length(changes)>0 then
  perform public.shift_exchange_reconcile_batch(actor,w,changes);
  for other in select c.id from public.shift_exchange_cases c where c.workspace_id=w and c.status='open'
   and exists(select 1 from jsonb_array_elements(changes) x where (x->>'source_id')::uuid in(c.offered_source_id,c.requested_source_id)) loop
   update public.shift_exchange_cases set status='invalidated',revision=revision+1,updated_at=now() where id=other.id;
   update public.shift_exchange_applications set status='invalidated',updated_at=now() where case_id=other.id and status in('invited','pending_manager');
   perform public.shift_exchange_emit(actor,w,other.id,null,'invalidated','An involved assignment was released with approved time off. Review the current schedule.');
  end loop;
  update public.schedule_time_off_events ev set metadata=ev.metadata||jsonb_build_object('released_assignments',changes)
   where ev.workspace_id=w and ev.request_id=rid and ev.metadata->>'revision'=result->>'revision' and ev.action in('approved','partially_approved');
  perform realtime.send(jsonb_build_object('workspace_id',w,'request_id',rid),'changed','shift-exchanges:'||w::text,false);
 end if;
 result:=result||jsonb_build_object('released_shift_count',jsonb_array_length(changes));
 insert into public.time_off_commands(workspace_id,actor_user_id,operation_id,input,result) values(w,actor,operation_id,command,result);
 return result;
end $$;

create function public.resolve_schedule_time_off_request_service(actor_user_id uuid,target_workspace_id uuid,target_request_id uuid,target_expected_revision integer,
 target_action text,target_note text default '',target_segment_decisions jsonb default '[]') returns jsonb language sql security definer set search_path='' as $$
 select public.decide_time_off_with_assignments_service(actor_user_id,target_workspace_id,target_request_id,target_expected_revision,target_action,target_note,target_segment_decisions,gen_random_uuid(),null,'[]');
$$;
create or replace function public.resolve_time_off_period_decision_service(actor_user_id uuid,w uuid,request_id uuid,expected_revision integer,
 action text,note text,decisions jsonb,operation_id uuid) returns jsonb language sql security definer set search_path='' as $$
 select public.decide_time_off_with_assignments_service(actor_user_id,w,request_id,expected_revision,action,note,decisions,operation_id,null,'[]');
$$;

create function public.time_off_event_released_assignments(actor uuid,w uuid,event_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item order by ord),'[]') from public.schedule_time_off_events ev
 join public.schedule_time_off_requests r on r.id=ev.request_id and r.workspace_id=ev.workspace_id
 join public.employee_profiles emp on emp.id=r.employee_id and emp.workspace_id=r.workspace_id
 cross join lateral jsonb_array_elements(coalesce(ev.metadata->'released_assignments','[]')) with ordinality changes(item,ord)
 where ev.id=event_id and ev.workspace_id=w
  and (emp.user_id=actor or public.schedule_actor_has_capability_service(actor,w,'schedule.read',(item->>'location_id')::uuid));
$$;
do $read$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.get_employee_hub_service(uuid,uuid,date,date)'::regprocedure);
 anchor:='''revision'',ev.metadata->''revision'') order by ev.created_at,ev.id)';
 if position(anchor in body)=0 then raise exception 'Employee decision event projection changed'; end if;
 execute replace(body,anchor,'''revision'',ev.metadata->''revision'',''released_assignments'',public.time_off_event_released_assignments(get_employee_hub_service.actor_user_id,target_workspace_id,ev.id)) order by ev.created_at,ev.id)');
 body:=pg_get_functiondef('public.get_schedule_requests_service(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,integer)'::regprocedure);
 anchor:='''note'',ev.note,''created_at'',ev.created_at) order by ev.created_at) from public.schedule_time_off_events ev';
 if position(anchor in body)=0 then raise exception 'Manager decision event projection changed'; end if;
 execute replace(body,anchor,'''note'',ev.note,''created_at'',ev.created_at,''released_assignments'',public.time_off_event_released_assignments(get_schedule_requests_service.actor_user_id,target_workspace_id,ev.id)) order by ev.created_at) from public.schedule_time_off_events ev');
end $read$;

revoke all on function public.time_off_proposed_approved_ranges(uuid,uuid,text,jsonb),public.time_off_assignment_impact(uuid,uuid,tstzmultirange),
 public.time_off_event_released_assignments(uuid,uuid,uuid),
 public.preview_time_off_assignment_decision_service(uuid,uuid,uuid,integer,text,jsonb),public.guard_time_off_assignment_release(),
 public.decide_time_off_with_assignments_service(uuid,uuid,uuid,integer,text,text,jsonb,uuid,text,jsonb),
 public.resolve_schedule_time_off_request_service(uuid,uuid,uuid,integer,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.preview_time_off_assignment_decision_service(uuid,uuid,uuid,integer,text,jsonb),
 public.decide_time_off_with_assignments_service(uuid,uuid,uuid,integer,text,text,jsonb,uuid,text,jsonb),
 public.resolve_schedule_time_off_request_service(uuid,uuid,uuid,integer,text,text,jsonb) to service_role;
