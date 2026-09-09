-- Cancellation is a separate, revision-bound request. Approved cancellation
-- subtracts exact instants from leave; no cancellation path assigns a shift.
create table public.time_off_cancellation_links(
 request_id uuid primary key, workspace_id uuid not null, parent_request_id uuid not null,
 parent_revision integer not null check(parent_revision>0),
 foreign key(request_id,workspace_id) references public.schedule_time_off_requests(id,workspace_id),
 foreign key(parent_request_id,workspace_id) references public.schedule_time_off_requests(id,workspace_id),
 check(request_id<>parent_request_id));
create index time_off_cancellation_parent_idx on public.time_off_cancellation_links(workspace_id,parent_request_id);
create table public.time_off_cancellation_periods(
 segment_id uuid primary key, workspace_id uuid not null, request_id uuid not null,
 parent_segment_id uuid not null, parent_request_id uuid not null,
 foreign key(request_id) references public.time_off_cancellation_links(request_id),
 foreign key(segment_id,request_id,workspace_id) references public.schedule_time_off_segments(id,request_id,workspace_id),
 foreign key(parent_segment_id,parent_request_id,workspace_id) references public.schedule_time_off_segments(id,request_id,workspace_id));
create index time_off_cancellation_period_parent_idx on public.time_off_cancellation_periods(parent_segment_id);
alter table public.time_off_cancellation_links enable row level security;
alter table public.time_off_cancellation_periods enable row level security;
revoke all on public.time_off_cancellation_links,public.time_off_cancellation_periods from public,anon,authenticated,service_role;
create function public.guard_time_off_cancellation_history() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Time-off cancellation history is immutable' using errcode='55000'; end $$;
create trigger guard_time_off_cancellation_history before update or delete on public.time_off_cancellation_links for each row execute function public.guard_time_off_cancellation_history();
create trigger guard_time_off_cancellation_history before update or delete on public.time_off_cancellation_periods for each row execute function public.guard_time_off_cancellation_history();

-- Keep the original decision partition independent from subsequent cancellation.
create function public.time_off_decided_ranges(segment_id uuid) returns tstzmultirange language sql stable security definer set search_path='' as $$
 select case when r.status='pending' then tstzmultirange(public.time_off_period_span(s.id))
  when r.status not in('approved','partially_approved') or s.status<>'approved' then '{}'::tstzmultirange
  when exists(select 1 from public.time_off_decision_pieces p where p.segment_id=s.id) then
   coalesce((select range_agg(tstzrange(p.starts_at,p.ends_at,'[)')) from public.time_off_decision_pieces p where p.segment_id=s.id and p.status='approved'
    and p.decision_revision=(select max(prior.decision_revision) from public.time_off_decision_pieces prior where prior.segment_id=s.id and prior.decision_revision<=r.revision)),'{}')
  else tstzmultirange(public.time_off_period_span(s.id)) end
 from public.schedule_time_off_segments s join public.schedule_time_off_requests r on r.id=s.request_id and r.workspace_id=s.workspace_id where s.id=segment_id;
$$;
create function public.time_off_cancelled_ranges(segment_id uuid) returns tstzmultirange language sql stable security definer set search_path='' as $$
 select coalesce(range_agg(span),'{}') from public.time_off_cancellation_periods cp
 join public.schedule_time_off_requests r on r.id=cp.request_id and r.workspace_id=cp.workspace_id
 cross join lateral unnest(public.time_off_decided_ranges(cp.segment_id)) pieces(span)
 where cp.parent_segment_id=time_off_cancelled_ranges.segment_id and r.status in('approved','partially_approved');
$$;
create or replace function public.time_off_effective_ranges(segment_id uuid) returns tstzmultirange language sql stable security definer set search_path='' as $$
 select case when r.request_type<>'time_off' then '{}'::tstzmultirange
  else public.time_off_decided_ranges(s.id)-public.time_off_cancelled_ranges(s.id) end
 from public.schedule_time_off_segments s join public.schedule_time_off_requests r on r.id=s.request_id and r.workspace_id=s.workspace_id where s.id=segment_id;
$$;

-- A cancellation preserves its parent's time zone even after location settings
-- change. Absolute instants also distinguish repeated clocks during DST folds.
alter table public.schedule_time_off_segments drop constraint time_off_period_clocks;
alter table public.schedule_time_off_segments add constraint time_off_period_clocks check(
 (start_time is null and end_time is null and not ends_next_day) or
 (start_time is not null and end_time is not null and (start_time<>end_time or ends_next_day or starts_at<ends_at)));
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.schedule_time_off_segments'::regclass and contype='u'
  and pg_get_constraintdef(oid)='UNIQUE (request_id, segment_date, start_time, end_time)' loop
  execute format('alter table public.schedule_time_off_segments drop constraint %I',c.conname);
 end loop;
end $$;
create unique index time_off_snapshot_unique on public.schedule_time_off_segments(request_id,starts_at,ends_at) where starts_at is not null;
create unique index time_off_legacy_clock_unique on public.schedule_time_off_segments(request_id,segment_date,start_time,end_time) where starts_at is null;
do $guard$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.guard_time_off_requested_period()'::regprocedure);
 anchor:='select timezone into zone_name from public.locations where id=parent.location_id and workspace_id=parent.workspace_id;';
 if position(anchor in body)=0 then raise exception 'Requested period snapshot guard changed'; end if;
 execute replace(body,anchor,$cancel$
  if parent.request_type='time_off_cancellation' then
   if not exists(select 1 from public.time_off_cancellation_links cl join public.schedule_time_off_segments original on original.request_id=cl.parent_request_id and original.workspace_id=cl.workspace_id
    where cl.request_id=parent.id and cl.workspace_id=parent.workspace_id and original.time_timezone=new.time_timezone
     and public.time_off_effective_ranges(original.id) @> tstzrange(new.starts_at,new.ends_at,'[)'))
    or (new.segment_date,new.start_time,new.end_time,new.ends_next_day) is distinct from
     ((new.starts_at at time zone new.time_timezone)::date,(new.starts_at at time zone new.time_timezone)::time,
      (new.ends_at at time zone new.time_timezone)::time,(new.ends_at at time zone new.time_timezone)::date>(new.starts_at at time zone new.time_timezone)::date)
    then raise exception 'Cancellation hours must match approved leave in its original time zone' using errcode='22023'; end if;
   return new;
  end if;
 $cancel$||anchor);
end $guard$;

create function public.submit_employee_time_off_cancellation_service(actor uuid,w uuid,parent_id uuid,expected_revision integer,
 reason text,periods jsonb,operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare employee public.employee_profiles%rowtype; parent public.schedule_time_off_requests%rowtype; original public.schedule_time_off_segments%rowtype;
 prior public.time_off_commands%rowtype; command jsonb; result jsonb; p jsonb; a timestamptz; b timestamptz; span tstzrange;
 covered tstzmultirange:='{}'; rid uuid:=gen_random_uuid(); sid uuid; zone_name text;
begin
 perform public.availability_lock_workspace(w);
 employee:=public.employee_hub_actor_service(actor,w);
 select * into parent from public.schedule_time_off_requests where id=parent_id and workspace_id=w and employee_id=employee.id for update;
 if parent.id is null then raise exception 'time off request not found' using errcode='P0002'; end if;
 if operation_id is null then raise exception 'A cancellation request key is required' using errcode='22023'; end if;
 command:=jsonb_build_object('kind','cancellation','parent',parent_id,'revision',expected_revision,'reason',btrim(coalesce(reason,'')),'periods',periods);
 select * into prior from public.time_off_commands c where c.workspace_id=w and c.actor_user_id=actor and c.operation_id=submit_employee_time_off_cancellation_service.operation_id;
 if found then
  if prior.input<>command then raise exception 'This request key was used for a different cancellation' using errcode='40001'; end if;
  return prior.result;
 end if;
 if expected_revision is null or parent.revision<>expected_revision or parent.request_type<>'time_off' or parent.status not in('approved','partially_approved') then
  raise exception 'stale approved leave; refresh before requesting cancellation' using errcode='40001'; end if;
 if exists(select 1 from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id=cl.request_id
  where cl.parent_request_id=parent.id and cr.status='pending') then raise exception 'A cancellation request is already pending for this leave' using errcode='23514'; end if;
 if jsonb_typeof(periods) is distinct from 'array' then raise exception 'Choose approved hours to cancel' using errcode='22023'; end if;
 if jsonb_array_length(periods) not between 1 and 124 or char_length(btrim(coalesce(reason,'')))>1000 then raise exception 'Choose up to 124 periods and a note of at most 1000 characters' using errcode='22023'; end if;
 insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,request_type,reason,created_by,period_version)
  values(rid,w,employee.id,parent.location_id,'time_off_cancellation',btrim(coalesce(reason,'')),actor,2);
 insert into public.time_off_cancellation_links values(rid,w,parent.id,parent.revision);
 for p in select value from jsonb_array_elements(periods) loop
  select * into original from public.schedule_time_off_segments where id=(p->>'segment_id')::uuid and workspace_id=w and request_id=parent.id;
  if original.id is null or original.time_timezone is null then raise exception 'Choose a snapshotted approved period from this leave' using errcode='22023'; end if;
  if coalesce(p->>'starts_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or coalesce(p->>'ends_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
   raise exception 'Cancellation needs exact start and end instants' using errcode='22023'; end if;
  a:=(p->>'starts_at')::timestamptz; b:=(p->>'ends_at')::timestamptz;
  if not isfinite(a) or not isfinite(b) or a>=b or a<=now() then raise exception 'Only future approved hours can be cancelled' using errcode='22023'; end if;
  span:=tstzrange(a,b,'[)');
  if not(public.time_off_effective_ranges(original.id) @> span) or covered && span then raise exception 'Cancellation must select approved hours without overlap' using errcode='22023'; end if;
  covered:=covered+tstzmultirange(span); zone_name:=original.time_timezone; sid:=gen_random_uuid();
  insert into public.schedule_time_off_segments(id,workspace_id,request_id,segment_date,start_time,end_time,time_timezone,starts_at,ends_at,ends_next_day)
   values(sid,w,rid,(a at time zone zone_name)::date,(a at time zone zone_name)::time,(b at time zone zone_name)::time,zone_name,a,b,
    (b at time zone zone_name)::date>(a at time zone zone_name)::date);
  insert into public.time_off_cancellation_periods values(sid,w,rid,original.id,parent.id);
 end loop;
 insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata)
  values(w,rid,'submitted',actor,btrim(coalesce(reason,'')),jsonb_build_object('parent_request_id',parent.id,'parent_revision',parent.revision,'operation_id',operation_id));
 result:=jsonb_build_object('status','pending','request_id',rid,'revision',1);
 insert into public.time_off_commands(workspace_id,actor_user_id,operation_id,input,result) values(w,actor,operation_id,command,result);
 return result;
end $$;

create function public.apply_time_off_cancellation_decision(actor uuid,w uuid,rid uuid,expected_revision integer,action text,note text,decisions jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cl public.time_off_cancellation_links%rowtype; parent public.schedule_time_off_requests%rowtype; result jsonb;
 approved tstzmultirange; remaining tstzmultirange; next_status public.time_off_request_status;
begin
 select * into cl from public.time_off_cancellation_links where request_id=rid and workspace_id=w;
 if cl.request_id is null then raise exception 'Cancellation is missing its original leave reference' using errcode='22023'; end if;
 select * into parent from public.schedule_time_off_requests where id=cl.parent_request_id and workspace_id=w for update;
 if action is null or action not in('approve','partial_approve','deny') then
  raise exception 'A completed cancellation cannot be reopened or revoked; submit a new leave request' using errcode='22023'; end if;
 if action in('approve','partial_approve') then
  if parent.revision<>cl.parent_revision or parent.status not in('approved','partially_approved') then raise exception 'stale original leave; refresh the cancellation request' using errcode='40001'; end if;
  approved:=public.time_off_proposed_approved_ranges(w,rid,action,decisions);
  if exists(select 1 from unnest(approved) piece where lower(piece)<=now()) then raise exception 'Only future approved hours can be cancelled' using errcode='22023'; end if;
  if exists(select 1 from public.time_off_cancellation_periods cp where cp.request_id=rid and
   not(public.time_off_effective_ranges(cp.parent_segment_id) @> public.time_off_period_span(cp.segment_id))) then raise exception 'stale approved hours; review the original leave' using errcode='40001'; end if;
 end if;
 result:=public.apply_time_off_period_decision(actor,w,rid,expected_revision,action,note,decisions);
 if action in('approve','partial_approve') and not isempty(approved) then
  select coalesce(range_agg(span),'{}') into remaining from public.schedule_time_off_segments s cross join lateral unnest(public.time_off_effective_ranges(s.id)) p(span) where s.request_id=parent.id;
  next_status:=case when isempty(remaining) then 'revoked'::public.time_off_request_status else 'partially_approved'::public.time_off_request_status end;
  update public.schedule_time_off_requests set status=next_status,revision=revision+1,updated_at=now() where id=parent.id returning * into parent;
  insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata)
   values(w,parent.id,next_status::text,actor,'Cancellation approved. Previously released shifts stay unassigned.'||case when btrim(coalesce(note,''))<>'' then ' '||left(btrim(note),910) else '' end,
    jsonb_build_object('revision',parent.revision,'cancellation_request_id',rid,'cancelled_intervals',public.availability_ranges_json(approved)));
 end if;
 return result||jsonb_build_object('parent_request_id',parent.id,'parent_revision',parent.revision,'released_shift_count',0);
end $$;

-- All old and new decision endpoints route through this branch. Cancellation
-- uses the decision partition machinery, without its leave-overlap check.
do $routing$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.apply_time_off_period_decision(uuid,uuid,uuid,integer,text,text,jsonb)'::regprocedure);
 anchor:='if piece->>''status''=''approved'' and exists';
 if position(anchor in body)=0 then raise exception 'Decision overlap guard changed'; end if;
 execute replace(body,anchor,'if r.request_type=''time_off'' and piece->>''status''=''approved'' and exists');
 body:=pg_get_functiondef('public.decide_time_off_with_assignments_service(uuid,uuid,uuid,integer,text,text,jsonb,uuid,text,jsonb)'::regprocedure);
 anchor:='if action in(''approve'',''partial_approve'') then';
 if position(anchor in body)=0 then raise exception 'Assignment decision routing changed'; end if;
 body:=replace(body,anchor,$cancel$
 if r.request_type='time_off_cancellation' then
  if expected_impact is not null or jsonb_array_length(dispositions)>0 then raise exception 'Cancellation cannot change published assignments' using errcode='22023'; end if;
  result:=public.apply_time_off_cancellation_decision(actor,w,rid,expected_revision,action,note,decisions);
  insert into public.time_off_commands(workspace_id,actor_user_id,operation_id,input,result) values(w,actor,operation_id,command,result);
  return result;
 end if;
 if action='return_to_pending' and exists(select 1 from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id=cl.request_id
  where cl.parent_request_id=rid and cr.status in('approved','partially_approved')) then raise exception 'Cancelled leave cannot be reopened; submit a new leave request' using errcode='22023'; end if;
 $cancel$||anchor);
 anchor:='result:=public.apply_time_off_period_decision(actor,w,rid,expected_revision,action,note,decisions);';
 if position(anchor in body)=0 then raise exception 'Leave decision application changed'; end if;
 body:=replace(body,anchor,anchor||$close$
 for other in select cr.id from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id=cl.request_id
  where cl.parent_request_id=rid and cr.status='pending' loop
  update public.schedule_time_off_requests set status='revoked',revision=revision+1,updated_at=now() where id=other.id;
  insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata)
   values(w,other.id,'revoked',actor,'Cancellation closed because the original leave changed. No shifts were reassigned.',jsonb_build_object('parent_request_id',rid));
 end loop;
 $close$);
 execute body;
 body:=pg_get_functiondef('public.preview_time_off_assignment_decision_service(uuid,uuid,uuid,integer,text,jsonb)'::regprocedure);
 anchor:='approved:=public.time_off_proposed_approved_ranges(w,rid,action,decisions);';
 if position(anchor in body)=0 then raise exception 'Assignment preview routing changed'; end if;
 execute replace(body,anchor,'if r.request_type<>''time_off'' then raise exception ''Cancellation does not change published assignments'' using errcode=''22023''; end if; '||anchor);
end $routing$;

create function public.time_off_cancellation_context(w uuid,rid uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('parent_request_id',(select parent_request_id from public.time_off_cancellation_links where request_id=rid),
  'parent_revision',(select parent_revision from public.time_off_cancellation_links where request_id=rid),
  'pending_request_id',(select cl.request_id from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id=cl.request_id where cl.parent_request_id=rid and cr.status='pending' limit 1),
  'has_completed_cancellation',exists(select 1 from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id=cl.request_id where cl.parent_request_id=rid and cr.status in('approved','partially_approved')),
  'can_request',r.request_type='time_off' and r.status in('approved','partially_approved') and
   not exists(select 1 from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id=cl.request_id where cl.parent_request_id=rid and cr.status='pending') and
   exists(select 1 from public.schedule_time_off_segments s cross join lateral unnest(public.time_off_effective_ranges(s.id)) p(span) where s.request_id=rid and s.time_timezone is not null and lower(span)>now()))
 from public.schedule_time_off_requests r where r.id=rid and r.workspace_id=w;
$$;
do $read$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.time_off_request_periods(uuid,uuid)'::regprocedure);
 anchor:='''status'',s.status,';
 if position(anchor in body)=0 then raise exception 'Time-off periods projection changed'; end if;
 execute replace(body,anchor,anchor||'''effective_intervals'',case when r.status in(''approved'',''partially_approved'') then public.availability_ranges_json(public.time_off_effective_ranges(s.id)) else ''[]''::jsonb end,''cancelled_intervals'',public.availability_ranges_json(public.time_off_cancelled_ranges(s.id)),');
 body:=pg_get_functiondef('public.get_employee_hub_service(uuid,uuid,date,date)'::regprocedure);
 anchor:='''kind'',''time_off'',';
 if position(anchor in body)=0 then raise exception 'Employee time-off projection changed'; end if;
 body:=replace(body,anchor,anchor||'''request_type'',request.request_type,''cancellation'',public.time_off_cancellation_context(target_workspace_id,request.id),');
 anchor:='''title'',''Time off · ''||';
 if position(anchor in body)=0 then raise exception 'Employee time-off title changed'; end if;
 execute replace(body,anchor,'''title'',case when request.request_type=''time_off_cancellation'' then ''Cancel approved leave · '' else ''Time off · '' end||');
 body:=pg_get_functiondef('public.get_schedule_requests_service(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,integer)'::regprocedure);
 anchor:='''request_type'',r.request_type,''reason'',r.reason,';
 if position(anchor in body)=0 then raise exception 'Manager time-off projection changed'; end if;
 execute replace(body,anchor,anchor||'''cancellation'',public.time_off_cancellation_context(target_workspace_id,r.id),');
end $read$;

-- Reuse scoped request recipients, while making cancellation meaning explicit.
-- This only enqueues the existing notification pipeline; it sends no mail.
do $notifications$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.notify_schedule_request_event_service()'::regprocedure);
 anchor:='perform public.enqueue_notification_outbox_service(';
 if position(anchor in body)=0 then raise exception 'Request notification producer changed'; end if;
 execute replace(body,anchor,$cancel$
 if tg_table_name='schedule_time_off_events' and exists(select 1 from public.schedule_time_off_requests r where r.id=new.request_id and r.request_type='time_off_cancellation') then
  if new.action='submitted' then
   notification_title:='Leave cancellation requested';
   notification_body:='Review the proposed cancellation. Approved leave stays in effect until accepted.';
   notification_preview:='A leave cancellation needs review.';
   notification_action_url:='/app/schedule/requests?tab=time-off&request='||new.request_id::text;
  else
   notification_title:='Leave cancellation updated';
   notification_body:=case new.action when 'denied' then 'Your cancellation was declined. The approved leave remains in effect.'
    when 'revoked' then 'Your cancellation request was closed. Review the original leave for its current status.'
    else 'Your leave cancellation was reviewed. See the exact hours in your request. Previously released shifts are not reassigned automatically.' end;
   notification_preview:='A leave cancellation was updated.';
   notification_action_url:='/app/employee-hub/my-availability#request-'||new.request_id::text;
  end if;
 end if;
 $cancel$||anchor);
end $notifications$;

revoke all on function public.guard_time_off_cancellation_history(),public.time_off_decided_ranges(uuid),public.time_off_cancelled_ranges(uuid),
 public.time_off_cancellation_context(uuid,uuid),public.apply_time_off_cancellation_decision(uuid,uuid,uuid,integer,text,text,jsonb),
 public.submit_employee_time_off_cancellation_service(uuid,uuid,uuid,integer,text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.submit_employee_time_off_cancellation_service(uuid,uuid,uuid,integer,text,jsonb,uuid) to service_role;
