-- Every decision partitions an immutable requested period. Earlier decisions
-- remain audit evidence; only the latest completed decision supplies capacity.
alter table public.schedule_time_off_segments add constraint time_off_segment_identity unique(id,request_id,workspace_id);
create table public.time_off_decision_pieces(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, request_id uuid not null, segment_id uuid not null,
 decision_revision integer not null check(decision_revision>1), starts_at timestamptz not null, ends_at timestamptz not null,
 time_timezone text not null, status public.time_off_segment_status not null check(status in('approved','denied')),
 created_at timestamptz not null default now(), check(isfinite(starts_at) and isfinite(ends_at) and starts_at<ends_at),
 foreign key(segment_id,request_id,workspace_id) references public.schedule_time_off_segments(id,request_id,workspace_id),
 unique(segment_id,decision_revision,starts_at));
create index time_off_decision_request_idx on public.time_off_decision_pieces(workspace_id,request_id,decision_revision);
alter table public.time_off_decision_pieces enable row level security;
revoke all on public.time_off_decision_pieces from public,anon,authenticated,service_role;

create function public.guard_time_off_decision_piece() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.schedule_time_off_requests%rowtype;
begin
 if tg_op<>'INSERT' then raise exception 'Time-off decision history is immutable' using errcode='55000'; end if;
 select * into r from public.schedule_time_off_requests where id=new.request_id and workspace_id=new.workspace_id;
 if r.status<>'pending' or new.decision_revision<>r.revision+1 then raise exception 'Decision pieces require the next pending request revision' using errcode='40001'; end if;
 if not(public.time_off_period_span(new.segment_id) @> tstzrange(new.starts_at,new.ends_at,'[)')) then
  raise exception 'Decision pieces must stay within the requested period' using errcode='22023'; end if;
 return new;
end $$;
create trigger guard_time_off_decision_piece before insert or update or delete on public.time_off_decision_pieces
 for each row execute function public.guard_time_off_decision_piece();

create function public.time_off_effective_ranges(segment_id uuid) returns tstzmultirange language sql stable security definer set search_path='' as $$
 select case when r.request_type<>'time_off' then '{}'::tstzmultirange
  when r.status='pending' then tstzmultirange(public.time_off_period_span(s.id))
  when r.status not in('approved','partially_approved') or s.status<>'approved' then '{}'::tstzmultirange
  when exists(select 1 from public.time_off_decision_pieces p where p.segment_id=s.id) then
   coalesce((select range_agg(tstzrange(p.starts_at,p.ends_at,'[)')) from public.time_off_decision_pieces p where p.segment_id=s.id and p.status='approved'
    and p.decision_revision=(select max(prior.decision_revision) from public.time_off_decision_pieces prior where prior.segment_id=s.id and prior.decision_revision<=r.revision)),'{}')
  else tstzmultirange(public.time_off_period_span(s.id)) end
 from public.schedule_time_off_segments s join public.schedule_time_off_requests r on r.id=s.request_id and r.workspace_id=s.workspace_id where s.id=segment_id;
$$;

create or replace function public.resolve_schedule_time_off_request_service(actor_user_id uuid,target_workspace_id uuid,target_request_id uuid,
 target_expected_revision integer,target_action text,target_note text default '',target_segment_decisions jsonb default '[]')
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.schedule_time_off_requests%rowtype; s public.schedule_time_off_segments%rowtype; d jsonb; piece jsonb; pieces jsonb;
 decisions jsonb:=target_segment_decisions; original tstzrange; part tstzrange; covered tstzmultirange;
 a timestamptz; b timestamptz; zone_name text; next_status public.time_off_request_status; any_approved boolean:=false; any_denied boolean:=false;
begin
 perform public.availability_lock_workspace(target_workspace_id);
 select * into r from public.schedule_time_off_requests where id=target_request_id and workspace_id=target_workspace_id for update;
 if r.id is null then raise exception 'time off request not found' using errcode='P0002'; end if;
 if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.time_off_requests.manage',r.location_id) then raise exception 'time off request manage access denied' using errcode='42501'; end if;
 if exists(select 1 from public.employee_profiles e where e.id=r.employee_id and e.workspace_id=target_workspace_id and e.user_id=actor_user_id) then
  raise exception 'Own time-off decision access denied; another manager must review this request' using errcode='42501'; end if;
 if target_expected_revision is null or r.revision<>target_expected_revision then raise exception 'stale time off request' using errcode='40001'; end if;
 if char_length(btrim(coalesce(target_note,'')))>1000 then raise exception 'Manager note must be at most 1000 characters' using errcode='22023'; end if;
 if target_action in('approve','deny','partial_approve') then
  if r.status<>'pending' then raise exception 'time off request is not pending' using errcode='40001'; end if;
  if target_action in('approve','deny') then
   select jsonb_agg(jsonb_build_object('segment_id',id,'status',case target_action when 'approve' then 'approved' else 'denied' end)) into decisions
    from public.schedule_time_off_segments where request_id=r.id and workspace_id=target_workspace_id;
  end if;
  if jsonb_typeof(decisions) is distinct from 'array' then raise exception 'Every requested time-off segment needs exactly one decision' using errcode='22023'; end if;
  if jsonb_array_length(decisions)=0 or exists(select 1 from jsonb_array_elements(decisions) item where jsonb_typeof(item) is distinct from 'object' or item->>'segment_id' is null)
   then raise exception 'Every requested time-off segment needs exactly one valid decision' using errcode='22023'; end if;
  if (select count(distinct (item->>'segment_id')::uuid) from jsonb_array_elements(decisions) item)<>jsonb_array_length(decisions)
   or jsonb_array_length(decisions)<>(select count(*) from public.schedule_time_off_segments where request_id=r.id and workspace_id=target_workspace_id and status='pending')
   or exists(select 1 from jsonb_array_elements(decisions) item where not exists(select 1 from public.schedule_time_off_segments seg
    where seg.id=(item->>'segment_id')::uuid and seg.request_id=r.id and seg.workspace_id=target_workspace_id and seg.status='pending')) then
   raise exception 'Review each requested time-off segment once; duplicate or unrelated decisions are not allowed' using errcode='22023'; end if;
  for d in select value from jsonb_array_elements(decisions) loop
   select * into s from public.schedule_time_off_segments where id=(d->>'segment_id')::uuid;
   original:=public.time_off_period_span(s.id);
   select coalesce(s.time_timezone,l.timezone) into zone_name from public.locations l where l.id=r.location_id and l.workspace_id=target_workspace_id;
   if d ? 'pieces' then
    if s.starts_at is null then raise exception 'Review the original time zone before splitting an earlier request; submit a new hourly request' using errcode='22023'; end if;
    if d ? 'status' or jsonb_typeof(d->'pieces') is distinct from 'array' then raise exception 'Choose a whole-period decision or explicit pieces' using errcode='22023'; end if;
    pieces:=d->'pieces';
   else
    pieces:=jsonb_build_array(jsonb_build_object('starts_at',lower(original),'ends_at',upper(original),'status',d->>'status'));
   end if;
   if jsonb_array_length(pieces) not between 1 and 32 then raise exception 'Decide between 1 and 32 pieces for each requested period' using errcode='22023'; end if;
   covered:='{}';
   for piece in select value from jsonb_array_elements(pieces) loop
    if jsonb_typeof(piece) is distinct from 'object' or coalesce(piece->>'status','') not in('approved','denied')
     or coalesce(piece->>'starts_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or coalesce(piece->>'ends_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
     raise exception 'Each decision piece requires explicit instants and an approval or denial' using errcode='22023'; end if;
    a:=(piece->>'starts_at')::timestamptz; b:=(piece->>'ends_at')::timestamptz;
    if not isfinite(a) or not isfinite(b) or a>=b then raise exception 'Decision pieces must have a positive finite duration' using errcode='22023'; end if;
    part:=tstzrange(a,b,'[)');
    if not(original @> part) or covered && part then raise exception 'Decision pieces must cover the requested period without overlap or outside hours' using errcode='22023'; end if;
    covered:=covered+tstzmultirange(part);
    if piece->>'status'='approved' and exists(select 1 from public.schedule_time_off_requests other_r join public.schedule_time_off_segments other_s on other_s.request_id=other_r.id and other_s.workspace_id=other_r.workspace_id
     where other_r.workspace_id=target_workspace_id and other_r.employee_id=r.employee_id and other_r.id<>r.id and other_r.request_type='time_off'
      and other_r.status in('pending','approved','partially_approved') and public.time_off_effective_ranges(other_s.id) && part) then
     raise exception 'Overlapping time-off conflict; resolve the other request before approval' using errcode='23514'; end if;
    insert into public.time_off_decision_pieces(workspace_id,request_id,segment_id,decision_revision,starts_at,ends_at,time_timezone,status)
     values(target_workspace_id,r.id,s.id,r.revision+1,a,b,zone_name,(piece->>'status')::public.time_off_segment_status);
    any_approved:=any_approved or piece->>'status'='approved'; any_denied:=any_denied or piece->>'status'='denied';
   end loop;
   if covered<>tstzmultirange(original) then raise exception 'Decision pieces must cover every requested instant without gaps' using errcode='22023'; end if;
   update public.schedule_time_off_segments set status=case when exists(select 1 from jsonb_array_elements(pieces) p where p->>'status'='approved')
    then 'approved'::public.time_off_segment_status else 'denied'::public.time_off_segment_status end where id=s.id;
  end loop;
  next_status:=case when any_approved and any_denied then 'partially_approved'::public.time_off_request_status when any_approved then 'approved'::public.time_off_request_status else 'denied'::public.time_off_request_status end;
 elsif target_action='return_to_pending' then
  if r.status='pending' then raise exception 'time off request transition is invalid' using errcode='40001'; end if;
  if exists(select 1 from public.schedule_time_off_segments own_s cross join public.schedule_time_off_requests other_r
   join public.schedule_time_off_segments other_s on other_s.request_id=other_r.id and other_s.workspace_id=other_r.workspace_id
   where own_s.request_id=r.id and own_s.workspace_id=target_workspace_id and other_r.workspace_id=target_workspace_id
    and other_r.employee_id=r.employee_id and other_r.id<>r.id and other_r.request_type='time_off' and other_r.status in('pending','approved','partially_approved')
    and public.time_off_effective_ranges(other_s.id) && public.time_off_period_span(own_s.id)) then
   raise exception 'Overlapping time-off conflict; resolve the other request before reopening this request' using errcode='23514'; end if;
  update public.schedule_time_off_segments set status='pending' where request_id=r.id and workspace_id=target_workspace_id; next_status:='pending';
 elsif target_action='revoke' then
  if r.status in('pending','revoked') then raise exception 'time off request transition is invalid' using errcode='40001'; end if;
  next_status:='revoked';
 else raise exception 'unsupported time off request action' using errcode='22023'; end if;
 update public.schedule_time_off_requests set status=next_status,revision=revision+1,updated_at=now() where id=r.id returning * into r;
 insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata)
  values(target_workspace_id,r.id,case target_action when 'return_to_pending' then 'returned_to_pending' when 'revoke' then 'revoked' else r.status::text end,
   actor_user_id,btrim(coalesce(target_note,'')),jsonb_build_object('revision',r.revision,'segments',decisions));
 return jsonb_build_object('status',r.status,'request_id',r.id,'revision',r.revision);
end $$;

create function public.resolve_time_off_period_decision_service(actor_user_id uuid,w uuid,request_id uuid,expected_revision integer,
 action text,note text,decisions jsonb,operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.schedule_time_off_requests%rowtype; prior public.time_off_commands%rowtype; command jsonb; result jsonb;
begin
 perform public.availability_lock_workspace(w);
 select * into r from public.schedule_time_off_requests where id=request_id and workspace_id=w;
 if r.id is null then raise exception 'time off request not found' using errcode='P0002'; end if;
 if not public.schedule_actor_has_capability_service(actor_user_id,w,'schedule.time_off_requests.manage',r.location_id) then raise exception 'time off request manage access denied' using errcode='42501'; end if;
 if operation_id is null then raise exception 'A decision key is required' using errcode='22023'; end if;
 command:=jsonb_build_object('kind','decision','request_id',request_id,'expected_revision',expected_revision,'action',action,'note',btrim(coalesce(note,'')),'decisions',decisions);
 select * into prior from public.time_off_commands c where c.workspace_id=w and c.actor_user_id=resolve_time_off_period_decision_service.actor_user_id and c.operation_id=resolve_time_off_period_decision_service.operation_id;
 if found then
  if prior.input<>command then raise exception 'This decision key was used for a different decision' using errcode='40001'; end if;
  return prior.result;
 end if;
 result:=public.resolve_schedule_time_off_request_service(actor_user_id,w,request_id,expected_revision,action,note,decisions);
 insert into public.time_off_commands(workspace_id,actor_user_id,operation_id,input,result) values(w,actor_user_id,operation_id,command,result);
 return result;
end $$;

-- Enrich the authorized employee and manager projections with the same pieces.
do $read$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.get_schedule_requests_service(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,integer)'::regprocedure);
 anchor:='return jsonb_build_object(''workspace_id'',target_workspace_id,';
 if position(anchor in body)=0 then raise exception 'Manager requests envelope changed'; end if;
 execute replace(body,anchor,anchor||'''time_format'',(select time_format from public.workspace_scheduling_settings where workspace_id=target_workspace_id),');
 body:=pg_get_functiondef('public.time_off_request_periods(uuid,uuid)'::regprocedure);
 anchor:='''status'',s.status,';
 if position(anchor in body)=0 then raise exception 'Time-off period projection changed'; end if;
 body:=replace(body,anchor,anchor||$pieces$ 'decision_revision',(select max(p.decision_revision) from public.time_off_decision_pieces p where p.segment_id=s.id and p.decision_revision<=r.revision),
 'decision_pieces',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'starts_at',p.starts_at,'ends_at',p.ends_at,'time_timezone',p.time_timezone,'status',p.status) order by p.starts_at)
  from public.time_off_decision_pieces p where p.segment_id=s.id and p.decision_revision=(select max(p2.decision_revision) from public.time_off_decision_pieces p2 where p2.segment_id=s.id and p2.decision_revision<=r.revision)
  and r.status in('approved','partially_approved','denied','revoked')),'[]'), $pieces$);
 execute body;
 body:=pg_get_functiondef('public.get_employee_hub_service(uuid,uuid,date,date)'::regprocedure);
 anchor:='''periods'',public.time_off_request_periods(request.id,target_workspace_id),';
 if position(anchor in body)=0 then raise exception 'Employee time-off projection changed'; end if;
 execute replace(body,anchor,anchor||$events$ 'decision_events',coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'action',ev.action,'note',ev.note,'created_at',ev.created_at,'revision',ev.metadata->'revision') order by ev.created_at,ev.id)
  from public.schedule_time_off_events ev where ev.request_id=request.id and ev.workspace_id=target_workspace_id and ev.action in('approved','partially_approved','denied','returned_to_pending','revoked')),'[]'), $events$);
end $read$;

do $capacity$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.submit_employee_time_off_periods_service(uuid,uuid,uuid,text,jsonb,uuid,text)'::regprocedure);
 anchor:='covered && public.time_off_period_span(s.id)';
 if position(anchor in body)=0 then raise exception 'Time-off submission overlap check changed'; end if;
 execute replace(body,anchor,'covered && public.time_off_effective_ranges(s.id)');
 body:=pg_get_functiondef('public.assess_shift_availability(uuid,uuid,jsonb)'::regprocedure);
 anchor:='for leave_row in select seg.*,';
 if position(anchor in body)=0 then raise exception 'Approved-leave projection changed'; end if;
 body:=replace(body,anchor,'for leave_row in select seg.*,approved_piece.span approved_span,');
 anchor:='join public.locations req_loc on req_loc.id=req.location_id and req_loc.workspace_id=w';
 if position(anchor in body)=0 then raise exception 'Approved-leave joins changed'; end if;
 body:=replace(body,anchor,anchor||' cross join lateral unnest(public.time_off_effective_ranges(seg.id)) approved_piece(span)');
 anchor:='leave_span:=public.time_off_period_span(leave_row.id);';
 if position(anchor in body)=0 then raise exception 'Approved-leave span changed'; end if;
 execute replace(body,anchor,'leave_span:=leave_row.approved_span;');
 body:=pg_get_functiondef('public.get_shift_change_conflicts_service(uuid)'::regprocedure);
 anchor:=$legacy$exists(select 1 from public.schedule_time_off_requests tr join public.schedule_time_off_segments sg on sg.request_id=tr.id where tr.workspace_id=r.workspace_id and tr.employee_id=receiver_id and tr.status in('approved','partially_approved') and sg.status='approved' and sg.segment_date=offered.scheduled_date)$legacy$;
 if position(anchor in body)=0 then raise exception 'Earlier shift-request approved-leave check changed'; end if;
 execute replace(body,anchor,'jsonb_array_length(public.assess_shift_availability(r.workspace_id,receiver_id,to_jsonb(offered))->''leave'')>0');
end $capacity$;

revoke all on function public.guard_time_off_decision_piece(),public.time_off_effective_ranges(uuid),
 public.resolve_time_off_period_decision_service(uuid,uuid,uuid,integer,text,text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.resolve_time_off_period_decision_service(uuid,uuid,uuid,integer,text,text,jsonb,uuid) to service_role;
