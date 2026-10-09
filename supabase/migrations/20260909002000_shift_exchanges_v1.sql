-- Employee offers never unassign a shift. Only a final scoped decision transfers it.
-- CLI-created migration ordered after the Line Up / employee-create dependencies.
alter table public.workspaces add column shift_exchanges_enabled boolean not null default false;

create table public.shift_exchange_cases (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 kind text not null check(kind in ('cover','open_pickup','swap')),
 audience text not null default 'eligible_pool' check(audience in ('eligible_pool','direct')),
 status text not null default 'open' check(status in ('open','completed','cancelled','expired','invalidated')),
 offered_source_id uuid not null, requested_source_id uuid, owner_id uuid,
 offered_snapshot jsonb not null, requested_snapshot jsonb, consent_fingerprint text not null,
 revision integer not null default 1, expires_at timestamptz not null,
 private_note text not null default '' check(length(private_note)<=1000),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(id,workspace_id),
 foreign key(owner_id,workspace_id) references public.employee_profiles(id,workspace_id),
 check((kind='swap')=(requested_source_id is not null)), check((kind='open_pickup')=(owner_id is null))
);
create unique index shift_exchange_one_open_case on public.shift_exchange_cases(workspace_id,offered_source_id) where status='open';
create index shift_exchange_workspace_history on public.shift_exchange_cases(workspace_id,created_at desc);
create table public.shift_exchange_applications (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, case_id uuid not null,
 employee_id uuid not null, status text not null check(status in ('invited','pending_manager','approved','rejected_by_manager','declined_by_employee','withdrawn','closed_other_selected','closed_case_cancelled','expired','invalidated')),
 consent_fingerprint text not null, reason text not null default '' check(length(reason)<=1000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,workspace_id), foreign key(case_id,workspace_id) references public.shift_exchange_cases(id,workspace_id),
 foreign key(employee_id,workspace_id) references public.employee_profiles(id,workspace_id)
);
create unique index shift_exchange_one_active_application on public.shift_exchange_applications(case_id,employee_id) where status in ('invited','pending_manager');
create index shift_exchange_employee on public.shift_exchange_applications(workspace_id,employee_id,case_id);
create table public.shift_exchange_votes (
 case_id uuid not null, workspace_id uuid not null, application_id uuid not null,
 location_id uuid not null, actor_user_id uuid not null references auth.users(id), fingerprint text not null,
 created_at timestamptz not null default now(), primary key(case_id,location_id),
 foreign key(case_id,workspace_id) references public.shift_exchange_cases(id,workspace_id),
 foreign key(application_id,workspace_id) references public.shift_exchange_applications(id,workspace_id),
 foreign key(location_id,workspace_id) references public.locations(id,workspace_id)
);
create table public.shift_exchange_events (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, case_id uuid not null,
 application_id uuid, actor_user_id uuid not null references auth.users(id), action text not null,
 message text not null default '', private_note text not null default '', created_at timestamptz not null default now(),
 foreign key(case_id,workspace_id) references public.shift_exchange_cases(id,workspace_id),
 foreign key(application_id,workspace_id) references public.shift_exchange_applications(id,workspace_id)
);
create table public.shift_exchange_commands (
 workspace_id uuid not null references public.workspaces(id), actor_user_id uuid not null references auth.users(id),
 idempotency_key uuid not null, command jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(workspace_id,actor_user_id,idempotency_key)
);
alter table public.shift_exchange_cases enable row level security;
alter table public.shift_exchange_applications enable row level security;
alter table public.shift_exchange_votes enable row level security;
alter table public.shift_exchange_events enable row level security;
alter table public.shift_exchange_commands enable row level security;
revoke all on public.shift_exchange_cases,public.shift_exchange_applications,public.shift_exchange_votes,public.shift_exchange_events,public.shift_exchange_commands from public,anon,authenticated;
grant select on public.shift_exchange_cases,public.shift_exchange_applications,public.shift_exchange_votes,public.shift_exchange_events,public.shift_exchange_commands to service_role;

create function public.shift_exchange_shift(w uuid,source uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',s.id,'source_id',coalesce(s.source_shift_id,s.id),'location_id',s.location_id,'location_name',l.name,'timezone',l.timezone,
 'requires_employee_access',true,'job_id',s.job_id,'job_name',coalesce(j.name,'Unassigned position'),'shift_type_id',s.shift_type_id,
 'unpaid_break_minutes',s.unpaid_break_minutes,'scheduled_date',s.scheduled_date,'date',s.scheduled_date,'start_time',s.start_time,'end_time',s.end_time,
 'starts_at',lower(public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,l.timezone)),
 'ends_at',upper(public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,l.timezone)),
 'employee_id',s.employee_id,'employee_name',case when e.id is not null then coalesce(nullif(e.preferred_name,''),concat_ws(' ',e.first_name,e.last_name)) end)
 from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current'
 join public.locations l on l.id=s.location_id left join public.jobs j on j.id=s.job_id left join public.employee_profiles e on e.id=s.employee_id
 where s.workspace_id=w and (s.id=source or coalesce(s.source_shift_id,s.id)=source) order by s.created_at desc limit 1;
$$;
create function public.shift_exchange_terms(s jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('source',s->'source_id','owner',s->'employee_id','location',s->'location_id','job',s->'job_id','service',s->'shift_type_id','date',s->'date','start',s->'start_time','end',s->'end_time','unpaid_break_minutes',coalesce(s->'unpaid_break_minutes','0'::jsonb));
$$;
create function public.shift_exchange_fingerprint(w uuid,s jsonb,t jsonb) returns text language sql stable set search_path='' as $$
 select md5(jsonb_build_object('offered',public.shift_exchange_terms(s),'requested',public.shift_exchange_terms(t),
 'placement',coalesce((select jsonb_agg(jsonb_build_object('source',coalesce(p.source_shift_id,p.id),'section',e.section_id,'station',e.station,'segments',e.placement_segments,'hidden',e.hidden) order by coalesce(p.source_shift_id,p.id))
 from public.schedule_lineup_entries e join public.schedule_published_shifts p on p.id=e.source_shift_id
 where e.workspace_id=w and p.id in ((s->>'id')::uuid,(t->>'id')::uuid)
 and (e.section_id is not null or coalesce(e.station,'')<>'' or coalesce(e.placement_segments,'[]'::jsonb)<>'[]'::jsonb or e.hidden)),'[]'::jsonb))::text);
$$;

-- Material changes invalidate consent; an empty operational overlay does not.
create function public.shift_exchange_live_status(w uuid,cid uuid) returns text
language plpgsql stable set search_path='' as $$
declare c public.shift_exchange_cases%rowtype; s jsonb; t jsonb;
begin
 select * into c from public.shift_exchange_cases where workspace_id=w and id=cid;
 if c.status<>'open' then return c.status; end if;
 if c.expires_at<=now() then return 'expired'; end if;
 s:=public.shift_exchange_shift(w,c.offered_source_id); t:=public.shift_exchange_shift(w,c.requested_source_id);
 if s is null or (c.kind='swap' and t is null) or public.shift_exchange_fingerprint(w,s,t) is distinct from c.consent_fingerprint then return 'invalidated'; end if;
 return 'open';
end; $$;

-- Extend the existing authoritative evaluator. All existing Line Up callers gain
-- membership and effective assignment checks; no second client-side rules engine.
alter function public.lineup_candidate_check(uuid,uuid,jsonb,uuid[],integer) rename to lineup_candidate_check_exchange_base;
-- Keep Line Up and Shift Hub on the same interval semantics. Time off uses
-- the request location's wall clock, which can differ from the target location.
do $eligibility$
declare body text;
begin
 body:=pg_get_functiondef('public.lineup_candidate_check_exchange_base(uuid,uuid,jsonb,uuid[],integer)'::regprocedure);
 body:=replace(body,'location_id=loc and ended_at is null','location_id=loc and assigned_at<=lower(span) and (ended_at is null or ended_at>=upper(span))');
 body:=replace(body,'job_id=job and ended_at is null','job_id=job and assigned_at<=lower(span) and (ended_at is null or ended_at>=upper(span))');
 body:=replace(body,'seg.segment_date::timestamp at time zone tz,(seg.segment_date+1)::timestamp at time zone tz','seg.segment_date::timestamp at time zone req_loc.timezone,(seg.segment_date+1)::timestamp at time zone req_loc.timezone');
 body:=replace(body,'seg.segment_date,seg.start_time,seg.end_time,tz','seg.segment_date,seg.start_time,seg.end_time,req_loc.timezone');
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='employee_schedule_availability_versions' and column_name='effective_until') then
  body:=replace(body,'and effective_at<=lower(span) order by version_number desc limit 1','and effective_at<=lower(span) and (effective_until is null or effective_until>=(lower(span) at time zone timezone)::date) order by version_number desc limit 1');
  if body not like '%available:=available*tstzmultirange(tstzrange(av.effective_at%' then body:=replace(body,'free:=available*tstzmultirange(span);','available:=available*tstzmultirange(tstzrange(av.effective_at,case when av.effective_until is null then null else (av.effective_until+1)::timestamp at time zone av.timezone end,''[)'')); free:=available*tstzmultirange(span);'); end if;
 end if;
 if body not like '%join public.locations req_loc%' then body:=replace(body,'public.schedule_time_off_requests req on req.id=seg.request_id','public.schedule_time_off_requests req on req.id=seg.request_id join public.locations req_loc on req_loc.id=req.location_id and req_loc.workspace_id=w'); end if;
 execute body;
end; $eligibility$;
create function public.lineup_candidate_check(w uuid,emp uuid,target jsonb,excluded uuid[] default '{}',travel_minutes integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; starts timestamptz; ends timestamptz; problems jsonb:='[]';
begin
 result:=public.lineup_candidate_check_exchange_base(w,emp,target,excluded,travel_minutes);
 select lower(r),upper(r) into starts,ends from (select public.lineup_shift_range((target->>'date')::date,(target->>'start_time')::time,(target->>'end_time')::time,l.timezone) r from public.locations l where l.id=(target->>'location_id')::uuid and l.workspace_id=w) q;
 if coalesce((target->>'requires_employee_access')::boolean,false) and not exists(select 1 from public.employee_profiles e join public.workspace_memberships m on m.workspace_id=e.workspace_id and m.user_id=e.user_id and m.status='active' where e.workspace_id=w and e.id=emp) then problems:=problems||'"Active workspace access is required"'::jsonb; end if;
 if not exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=emp and a.location_id=(target->>'location_id')::uuid and a.assigned_at<=starts and (a.ended_at is null or a.ended_at>=ends)) then problems:=problems||'"Location assignment must cover the full shift"'::jsonb; end if;
 if not exists(select 1 from public.employee_job_assignments a where a.workspace_id=w and a.employee_id=emp and a.job_id=(target->>'job_id')::uuid and a.assigned_at<=starts and (a.ended_at is null or a.ended_at>=ends)) then problems:=problems||'"Position assignment must cover the full shift"'::jsonb; end if;
 if jsonb_array_length(problems)>0 then result:=result||jsonb_build_object('status','ineligible','reasons',case when result->>'status'='eligible' then problems else result->'reasons'||problems end); end if;
 return result;
end; $$;

create function public.shift_exchange_preview(actor uuid,w uuid,cid uuid,aid uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.shift_exchange_cases%rowtype; a public.shift_exchange_applications%rowtype;
 s jsonb; t jsonb; r jsonb; g jsonb; problems text[]:='{}'; loc uuid; scoped boolean:=false; missing boolean:=false; fp text;
begin
 select * into c from public.shift_exchange_cases where workspace_id=w and id=cid;
 if c.id is null then raise exception 'Request not found' using errcode='P0002'; end if;
 s:=public.shift_exchange_shift(w,c.offered_source_id); t:=public.shift_exchange_shift(w,c.requested_source_id);
 for loc in select distinct x from unnest(array[(c.offered_snapshot->>'location_id')::uuid,(c.requested_snapshot->>'location_id')::uuid]) x where x is not null loop
  scoped:=scoped or public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',loc);
 end loop;
 if not scoped then raise exception 'Manager scope required' using errcode='42501'; end if;
 select * into a from public.shift_exchange_applications where workspace_id=w and case_id=cid and id=aid;
 if a.id is null then raise exception 'Application not found' using errcode='P0002'; end if;
 if c.status<>'open' or a.status<>'pending_manager' then problems:=array_append(problems,'This request is no longer ready for approval'); end if;
 if s is null or (c.kind='swap' and t is null) then problems:=array_append(problems,'The published shift changed or was unpublished'); end if;
 fp:=public.shift_exchange_fingerprint(w,s,t);
 if fp is distinct from c.consent_fingerprint or fp is distinct from a.consent_fingerprint then problems:=array_append(problems,'Shift conditions changed. New employee consent is required'); end if;
 if c.expires_at<=now() or (s->>'starts_at')::timestamptz<=now() or (t->>'starts_at')::timestamptz<=now() then problems:=array_append(problems,'This shift has already started'); end if;
 if exists(select 1 from public.employee_profiles where workspace_id=w and user_id=actor and id in(c.owner_id,a.employee_id)) then problems:=array_append(problems,'A separate manager must approve your own exchange'); end if;
 if s is not null then r:=public.lineup_candidate_check(w,a.employee_id,s,array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null)); end if;
 if r is null then r:='{"status":"ineligible","reasons":["Published shift unavailable"]}'; end if;
 if r->>'status'<>'eligible' then problems:=array_append(problems,'The receiving employee is not eligible for the full shift'); end if;
 if c.kind='swap' and t is not null then
  g:=public.lineup_candidate_check(w,c.owner_id,t,array[(s->>'id')::uuid,(t->>'id')::uuid]::uuid[]);
  if g->>'status'<>'eligible' then problems:=array_append(problems,'The other employee is not eligible for the exchanged shift'); end if;
 end if;
 for loc in select distinct x from unnest(array[(s->>'location_id')::uuid,(t->>'location_id')::uuid]) x where x is not null loop
  if not public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',loc)
   and not exists(select 1 from public.shift_exchange_votes v where v.case_id=cid and v.application_id=aid and v.location_id=loc and v.fingerprint=fp
   and public.schedule_actor_has_capability_service(v.actor_user_id,w,'schedule.shift_change_requests.manage',loc)
   and not exists(select 1 from public.employee_profiles e where e.workspace_id=w and e.user_id=v.actor_user_id and e.id in(c.owner_id,a.employee_id))) then missing:=true; end if;
 end loop;
 return jsonb_build_object('allowed',cardinality(problems)=0,'fingerprint',fp,'reasons',to_jsonb(problems),'receiver',r,'giver',g,'requires_other_manager',missing,
 'other_applications',(select count(*) from public.shift_exchange_applications where case_id=cid and id<>aid and status in('invited','pending_manager')));
end; $$;

create function public.shift_exchanges_read_service(actor uuid,w uuid,manager_view boolean default false,from_date date default current_date,to_date date default current_date+42,focused_case_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare emp public.employee_profiles%rowtype; c public.shift_exchange_cases%rowtype; s jsonb; t jsonb; allowed boolean; mine boolean;
 cases jsonb:='[]'; opportunities jsonb:='[]'; own_shifts jsonb:='[]'; apps jsonb; hist jsonb; chk jsonb; shift_row record; stage text; live_status text; current_published boolean;
begin
 if to_date<from_date or to_date>from_date+62 then raise exception 'Choose a date range up to 62 days'; end if;
 if not exists(select 1 from public.workspace_memberships where workspace_id=w and user_id=actor and status='active') then raise exception 'Active workspace access required' using errcode='42501'; end if;
 select * into emp from public.employee_profiles where workspace_id=w and user_id=actor and archived_at is null;
 if not manager_view and emp.id is null then raise exception 'Employee profile required' using errcode='42501'; end if;
 if manager_view and not public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.read',null) then
  if not exists(select 1 from public.locations l where l.workspace_id=w and public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.read',l.id)) then raise exception 'Manager request access required' using errcode='42501'; end if;
 end if;
 for c in select * from public.shift_exchange_cases x where x.workspace_id=w and (x.status='open' or x.id=focused_case_id or (x.offered_snapshot->>'date')::date between from_date and to_date) order by x.expires_at,x.created_at loop
  allowed:=manager_view and (public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.read',(c.offered_snapshot->>'location_id')::uuid) or (c.kind='swap' and public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.read',(c.requested_snapshot->>'location_id')::uuid)));
  mine:=coalesce(c.owner_id=emp.id,false);
  if not allowed and not mine and not exists(select 1 from public.shift_exchange_applications where case_id=c.id and employee_id=emp.id) then continue; end if;
  live_status:=public.shift_exchange_live_status(w,c.id);
  current_published:=public.shift_exchange_shift(w,c.offered_source_id) is not null;
  s:=coalesce(public.shift_exchange_shift(w,c.offered_source_id),c.offered_snapshot);
  t:=coalesce(public.shift_exchange_shift(w,c.requested_source_id),c.requested_snapshot);
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'employee_id',a.employee_id,'employee_name',coalesce(nullif(e.preferred_name,''),concat_ws(' ',e.first_name,e.last_name)),
   'status',case when live_status in('expired','invalidated') and a.status in('invited','pending_manager') then live_status else a.status end,'created_at',a.created_at,'reason',case when allowed or a.employee_id=emp.id then a.reason else '' end,
   'eligibility',case when (allowed or a.employee_id=emp.id) and live_status='open' then public.lineup_candidate_check(w,a.employee_id,s,array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null)) end) order by a.created_at),'[]'::jsonb)
  into apps from public.shift_exchange_applications a join public.employee_profiles e on e.id=a.employee_id where a.case_id=c.id and (allowed or mine or a.employee_id=emp.id);
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'created_at',e.created_at,'message',e.message) order by e.created_at),'[]'::jsonb)
  into hist from public.shift_exchange_events e where e.case_id=c.id and (allowed or mine or e.application_id is null or exists(select 1 from public.shift_exchange_applications a where a.id=e.application_id and a.employee_id=emp.id));
  stage:=case when live_status<>'open' then 'closed'
   when exists(select 1 from public.shift_exchange_votes where case_id=c.id) then 'awaiting_other_manager'
   when exists(select 1 from public.shift_exchange_applications where case_id=c.id and status='pending_manager') then 'ready_for_manager'
   when exists(select 1 from public.shift_exchange_applications where case_id=c.id and status='invited') then 'awaiting_peer' else 'seeking_candidates' end;
  cases:=cases||jsonb_build_array(jsonb_build_object('id',c.id,'kind',c.kind,'audience',c.audience,'status',live_status,'current_published',current_published,
   'stage',stage,'revision',c.revision,'created_at',c.created_at,'expires_at',c.expires_at,'owner_id',c.owner_id,'owner_name',c.offered_snapshot->'employee_name',
   'shift',s,'requested_shift',t,'applications',apps,'candidate_count',(select count(*) from public.shift_exchange_applications where case_id=c.id and status in('invited','pending_manager') and live_status='open'),
   'can_manage',allowed and (public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',(c.offered_snapshot->>'location_id')::uuid) or (c.kind='swap' and public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',(c.requested_snapshot->>'location_id')::uuid))),
   'is_owner',mine,'private_note',case when allowed or mine then c.private_note else '' end,'history',hist));
 end loop;
 if not manager_view then
  for shift_row in select p.id from public.schedule_published_shifts p join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
   where p.workspace_id=w and p.scheduled_date between from_date and to_date order by p.scheduled_date,p.start_time loop
   s:=public.shift_exchange_shift(w,shift_row.id);
   if (s->>'starts_at')::timestamptz<=now() then continue; end if;
   if (s->>'employee_id')::uuid=emp.id then own_shifts:=own_shifts||jsonb_build_array(s); continue; end if;
   select * into c from public.shift_exchange_cases where workspace_id=w and offered_source_id=(s->>'source_id')::uuid and status='open' and expires_at>now() and audience='eligible_pool' and kind<>'swap';
   if s->>'employee_id' is not null and c.id is null then continue; end if;
   chk:=public.lineup_candidate_check(w,emp.id,s);
   if chk->>'status'='eligible' and (c.id is null or c.consent_fingerprint=public.shift_exchange_fingerprint(w,s,null)) then
    opportunities:=opportunities||jsonb_build_array(jsonb_build_object('case_id',c.id,'shift',s,'eligibility',chk));
   end if;
  end loop;
 end if;
 return jsonb_build_object('enabled',(select shift_exchanges_enabled from public.workspaces where id=w),'employee_id',emp.id,'cases',cases,'opportunities',opportunities,'own_shifts',own_shifts);
end; $$;

create function public.shift_exchanges_candidates_service(actor uuid,w uuid,shift_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare emp public.employee_profiles%rowtype; s jsonb; t jsonb; e record; p record; checked jsonb; employees jsonb:='[]'; shifts jsonb:='[]';
begin
 emp:=public.employee_hub_actor_service(actor,w); s:=public.shift_exchange_shift(w,shift_id);
 if s is null or (s->>'employee_id')::uuid is distinct from emp.id then raise exception 'Only the owner can search for a replacement' using errcode='42501'; end if;
 for e in select id,coalesce(nullif(preferred_name,''),concat_ws(' ',first_name,last_name)) name from public.employee_profiles where workspace_id=w and archived_at is null and id<>emp.id order by first_name loop
  checked:=public.lineup_candidate_check(w,e.id,s);
  if checked->>'status'='eligible' then employees:=employees||jsonb_build_array(jsonb_build_object('id',e.id,'name',e.name,'eligibility',checked)); end if;
 end loop;
 for p in select x.id from public.schedule_published_shifts x join public.schedule_location_publications pub on pub.id=x.publication_id and pub.status='current'
  where x.workspace_id=w and x.employee_id is not null and x.employee_id<>emp.id and x.scheduled_date between current_date-1 and current_date+62 order by x.scheduled_date,x.start_time loop
  t:=public.shift_exchange_shift(w,p.id);
  if (t->>'starts_at')::timestamptz>now() and public.lineup_candidate_check(w,emp.id,t,array[(s->>'id')::uuid,(t->>'id')::uuid])->>'status'='eligible'
   and public.lineup_candidate_check(w,(t->>'employee_id')::uuid,s,array[(s->>'id')::uuid,(t->>'id')::uuid])->>'status'='eligible' then shifts:=shifts||jsonb_build_array(t); end if;
 end loop;
 return jsonb_build_object('employees',employees,'shifts',shifts);
end; $$;



-- Shared assignment delta uses the last published content, never unshared notes.
create function public.shift_exchange_reconcile(actor uuid,w uuid,s jsonb,new_employee uuid) returns void
language plpgsql set search_path='' as $$
declare prior public.schedule_lineup_snapshots%rowtype; snap public.schedule_lineup_snapshots%rowtype;
 item jsonb; entries jsonb; person uuid; fp text; old_receipt public.lineup_receipts%rowtype; new_name text; ver integer;
begin
 select coalesce(nullif(preferred_name,''),concat_ws(' ',first_name,last_name)) into new_name from public.employee_profiles where id=new_employee and workspace_id=w;
 update public.schedule_lineup_entries set employee_id=new_employee,call_off=false,source_changed=false,note='',revision=revision+1,updated_by=actor,updated_at=now()
 where workspace_id=w and source_shift_id=(s->>'id')::uuid;
 select * into prior from public.schedule_lineup_snapshots where workspace_id=w and location_id=(s->>'location_id')::uuid and lineup_date=(s->>'date')::date order by version_number desc limit 1;
 if prior.id is null then return; end if;
 select jsonb_agg(case when e->>'source_shift_id'=s->>'id' or exists(select 1 from public.schedule_published_shifts p where p.id=(e->>'source_shift_id')::uuid and coalesce(p.source_shift_id,p.id)=(s->>'source_id')::uuid) then
 e||jsonb_build_object('employee_id',new_employee,'employee_name',new_name,'call_off',false,'note','','source_shift_id',s->'id') else e end order by ord)
 into entries from jsonb_array_elements(prior.content->'entries') with ordinality q(e,ord);
 if entries is not distinct from prior.content->'entries' then return; end if;
 ver:=prior.version_number+1;
 item:=prior.content||jsonb_build_object('entries',entries,'share_version',ver,'shared_at',now());
 insert into public.schedule_lineup_snapshots(workspace_id,location_id,lineup_date,version_number,fingerprint,content,shared_by)
 values(w,prior.location_id,prior.lineup_date,ver,encode(extensions.digest(convert_to(item::text,'UTF8'),'sha256'),'hex'),item,actor) returning * into snap;
 update public.schedule_lineups set share_version=ver,shared_at=now(),updated_by=actor where workspace_id=w and location_id=prior.location_id and lineup_date=prior.lineup_date;
 for person in select distinct (e->>'employee_id')::uuid from jsonb_array_elements(entries||(prior.content->'entries')) e where e->>'employee_id' is not null loop
  fp:=public.lineup_person_fingerprint(item,person);
  select * into old_receipt from public.lineup_receipts where snapshot_id=prior.id and employee_id=person;
  insert into public.lineup_receipts(snapshot_id,workspace_id,employee_id,content_fingerprint,viewed_at,acknowledged_at)
  values(snap.id,w,person,fp,case when old_receipt.content_fingerprint=fp then old_receipt.viewed_at end,case when old_receipt.content_fingerprint=fp then old_receipt.acknowledged_at end);
  if old_receipt.content_fingerprint is distinct from fp then insert into public.lineup_notification_outbox(workspace_id,snapshot_id,employee_id) values(w,snap.id,person) on conflict do nothing; end if;
 end loop;
end; $$;

create function public.shift_exchange_emit(actor uuid,w uuid,cid uuid,aid uuid,act text,msg text,private_msg text default '') returns void
language plpgsql set search_path='' as $$
declare eid uuid; loc uuid; recipients uuid[]; reviewers uuid[]; c public.shift_exchange_cases%rowtype; recipient uuid; body text; destination text; offered jsonb;
begin
 select * into c from public.shift_exchange_cases where id=cid and workspace_id=w;
 loc:=(c.offered_snapshot->>'location_id')::uuid;
 insert into public.shift_exchange_events(workspace_id,case_id,application_id,actor_user_id,action,message,private_note)
 values(w,cid,aid,actor,act,msg,private_msg) returning id into eid;
 select coalesce(array_agg(distinct e.user_id),'{}'::uuid[]) into recipients from public.employee_profiles e join public.workspace_memberships m on m.workspace_id=w and m.user_id=e.user_id and m.status='active'
 where e.workspace_id=w and e.archived_at is null and ((e.id=c.owner_id and act<>'other_selected') or exists(select 1 from public.shift_exchange_applications a where a.case_id=cid and a.employee_id=e.id and (aid is null or a.id=aid))) and e.user_id<>actor;
 foreach recipient in array recipients loop
  body:=case when act='transfer_completed' then
   case when c.kind='swap' then 'Your swap is approved. Your updated shifts are now your responsibility. Open your schedule to review both changes.'
    when exists(select 1 from public.employee_profiles e where e.id=c.owner_id and e.user_id=recipient) then 'Your cover is approved. You are no longer responsible for this shift.'
    else 'Your pickup is approved. This shift is now assigned to you and is your responsibility.' end else msg end;
  perform public.enqueue_notification_outbox_service(w,gen_random_uuid(),'requests.shift_change.status_changed',1,actor,'shift_exchange_cases',cid::text,
   jsonb_build_object('correlation_id',eid,'request_id',cid,'request_event_id',eid,'request_action',act,'location_id',loc,'location_ids',jsonb_build_array(loc),'recipient_user_ids',jsonb_build_array(recipient),
   'audience_contract','shift_change_participants','category','request','title',case when act='transfer_completed' then 'Shift change approved' when act='other_selected' then 'Another teammate was selected' when act='peer_invited' then 'A teammate needs your response' else 'Shift request updated' end,
   'body',body,'safe_preview','A shift request was updated.','action_url','/app/employee-hub/shift-hub?case='||cid::text||'&hub_view=requests','group_key','shift_exchange:'||cid::text),now());
 end loop;
 if act='cover_opened' then
  offered:=public.shift_exchange_shift(w,c.offered_source_id);
  select coalesce(array_agg(e.user_id),'{}'::uuid[]) into recipients from public.employee_profiles e
   join public.workspace_memberships m on m.workspace_id=w and m.user_id=e.user_id and m.status='active'
   where e.workspace_id=w and e.archived_at is null and e.id<>c.owner_id and public.lineup_candidate_check(w,e.id,offered)->>'status'='eligible';
  if cardinality(recipients)>0 then
   perform public.enqueue_notification_outbox_service(w,gen_random_uuid(),'requests.shift_change.status_changed',1,actor,'shift_exchange_cases',cid::text,
    jsonb_build_object('correlation_id',eid,'request_id',cid,'request_event_id',eid,'request_action',act,'location_id',loc,'location_ids',jsonb_build_array(loc),'recipient_user_ids',to_jsonb(recipients),
    'audience_contract','eligible_shift_cover_candidates','category','request','title','A shift is available for cover','body',(offered->>'location_name')||' · '||(offered->>'date')||' · '||(offered->>'start_time')||'–'||(offered->>'end_time')||'. Apply in Shift Hub; final assignment requires manager approval.',
    'safe_preview','A teammate is looking for cover.','action_url','/app/employee-hub/shift-hub?hub_view=available&q='||(offered->>'date'),'group_key','shift_exchange_available:'||cid::text),now());
  end if;
 end if;
 if act in('application_submitted','peer_accepted','scope_approved') then
 select coalesce(array_agg(m.user_id),'{}'::uuid[]) into reviewers from public.workspace_memberships m where m.workspace_id=w and m.status='active'
 and (public.schedule_actor_has_capability_service(m.user_id,w,'schedule.shift_change_requests.manage',loc) or (c.kind='swap' and public.schedule_actor_has_capability_service(m.user_id,w,'schedule.shift_change_requests.manage',(c.requested_snapshot->>'location_id')::uuid)))
 and m.user_id<>actor and not exists(select 1 from public.employee_profiles e where e.workspace_id=w and e.user_id=m.user_id and (e.id=c.owner_id or exists(select 1 from public.shift_exchange_applications a where a.id=aid and a.employee_id=e.id)));
 if cardinality(reviewers)>0 then
 perform public.enqueue_notification_outbox_service(w,gen_random_uuid(),'requests.shift_change.submitted',1,actor,'shift_exchange_cases',cid::text,
 jsonb_build_object('correlation_id',eid,'request_id',cid,'request_event_id',eid,'request_action',act,'location_ids',to_jsonb(array_remove(array[loc,(c.requested_snapshot->>'location_id')::uuid],null)),'recipient_user_ids',to_jsonb(reviewers),
 'audience_contract','schedule_request_reviewers','category','request','title','Shift change ready for review','body','A teammate is ready. Review the candidates before approving.',
 'safe_preview','A shift request needs review.','action_url','/app/schedule/requests?tab=shift-changes&case='||cid::text,'group_key','shift_exchange_review:'||cid::text),now());
 end if;
 end if;
end; $$;

create function public.shift_exchanges_command_service(actor uuid,w uuid,command jsonb,idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare emp public.employee_profiles%rowtype; c public.shift_exchange_cases%rowtype; a public.shift_exchange_applications%rowtype;
 old_cmd public.shift_exchange_commands%rowtype; s jsonb; t jsonb; checked jsonb; result jsonb; fp text;
 action text:=command->>'action'; cid uuid:=(command->>'case_id')::uuid; aid uuid:=(command->>'application_id')::uuid;
 candidate uuid; loc uuid; other record; expires timestamptz; owns boolean; manager boolean;
begin
 if idempotency_key is null then raise exception 'Idempotency key required'; end if;
 if not exists(select 1 from public.workspace_memberships where workspace_id=w and user_id=actor and status='active') then raise exception 'Active workspace access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(w::text,921));
 select * into old_cmd from public.shift_exchange_commands q where q.workspace_id=w and q.actor_user_id=actor and q.idempotency_key=shift_exchanges_command_service.idempotency_key;
 if old_cmd.idempotency_key is not null then
  if old_cmd.command<>command then raise exception 'Idempotency key was used for another action' using errcode='22023'; end if;
  return old_cmd.result;
 end if;
 if not coalesce((select shift_exchanges_enabled from public.workspaces where id=w),false) then raise exception 'Shift changes are temporarily read-only' using errcode='55000'; end if;
 select * into emp from public.employee_profiles where workspace_id=w and user_id=actor and archived_at is null;
 if action in('create','apply') then
  if emp.id is null then raise exception 'Employee profile required' using errcode='42501'; end if;
  s:=public.shift_exchange_shift(w,(command->>'shift_id')::uuid);
  if s is null or (s->>'starts_at')::timestamptz<=now() then raise exception 'Choose an upcoming published shift' using errcode='PT409'; end if;
  if exists(select 1 from public.schedule_shift_change_requests r join public.schedule_published_shifts p on p.id in(r.offered_shift_id,r.requested_shift_id) where r.workspace_id=w and r.status='pending_manager_approval' and coalesce(p.source_shift_id,p.id)=(s->>'source_id')::uuid) then raise exception 'An existing request must be resolved before offering this shift'; end if;
  if action='create' then
   if (s->>'employee_id')::uuid is distinct from emp.id then raise exception 'Only the current owner can offer this shift' using errcode='42501'; end if;
   if command->>'kind' not in('cover','swap') then raise exception 'Invalid exchange kind'; end if;
   if command->>'kind'='swap' then
    t:=public.shift_exchange_shift(w,(command->>'requested_shift_id')::uuid);
    if t is null or t->>'employee_id' is null or t->>'employee_id'=emp.id::text or (t->>'starts_at')::timestamptz<=now() then raise exception 'Choose an upcoming teammate shift'; end if;
    candidate:=(t->>'employee_id')::uuid;
    if public.lineup_candidate_check(w,emp.id,t,array[(s->>'id')::uuid,(t->>'id')::uuid])->>'status'<>'eligible' then raise exception 'You are not eligible for the teammate shift'; end if;
   else candidate:=(command->>'employee_id')::uuid; end if;
   if candidate=emp.id then raise exception 'Choose a different teammate'; end if;
   if candidate is not null and public.lineup_candidate_check(w,candidate,s,array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null))->>'status'<>'eligible' then raise exception 'This teammate is not eligible for the full shift'; end if;
   for other in select x.id,public.shift_exchange_live_status(w,x.id) live_status from public.shift_exchange_cases x
    where x.workspace_id=w and x.status='open' and x.offered_source_id=(s->>'source_id')::uuid loop
    if other.live_status<>'open' then
     update public.shift_exchange_cases set status=other.live_status,revision=revision+1,updated_at=now() where id=other.id;
     update public.shift_exchange_applications set status=other.live_status,updated_at=now() where case_id=other.id and status in('invited','pending_manager');
     delete from public.shift_exchange_votes where case_id=other.id;
     perform public.shift_exchange_emit(actor,w,other.id,null,other.live_status,'This offer ended because the shift changed or started. Review the current schedule before making a new request.');
    end if;
   end loop;
   fp:=public.shift_exchange_fingerprint(w,s,t);
   expires:=least((s->>'starts_at')::timestamptz,(t->>'starts_at')::timestamptz);
   insert into public.shift_exchange_cases(workspace_id,kind,audience,offered_source_id,requested_source_id,owner_id,offered_snapshot,requested_snapshot,consent_fingerprint,expires_at,private_note,created_by)
   values(w,command->>'kind',case when candidate is null then 'eligible_pool' else 'direct' end,(s->>'source_id')::uuid,(t->>'source_id')::uuid,emp.id,s,t,fp,expires,coalesce(command->>'note',''),actor) returning * into c;
   cid:=c.id;
   if candidate is not null then
    insert into public.shift_exchange_applications(workspace_id,case_id,employee_id,status,consent_fingerprint) values(w,cid,candidate,'invited',fp) returning id into aid;
   end if;
   perform public.shift_exchange_emit(actor,w,cid,aid,case when candidate is null then 'cover_opened' else 'peer_invited' end,'Cover or swap requested. The current owner remains responsible until manager approval.');
  else
   if (s->>'employee_id')::uuid=emp.id then raise exception 'You already own this shift'; end if;
   select * into c from public.shift_exchange_cases where workspace_id=w and offered_source_id=(s->>'source_id')::uuid and status='open' for update;
   if c.id is null then
    if s->>'employee_id' is not null then raise exception 'This shift has not been offered for cover'; end if;
    fp:=public.shift_exchange_fingerprint(w,s,null);
    insert into public.shift_exchange_cases(workspace_id,kind,offered_source_id,offered_snapshot,consent_fingerprint,expires_at,created_by)
    values(w,'open_pickup',(s->>'source_id')::uuid,s,fp,(s->>'starts_at')::timestamptz,actor) returning * into c;
   end if;
   if c.audience<>'eligible_pool' or c.kind='swap' or (cid is not null and cid<>c.id) then raise exception 'This offer is not available' using errcode='42501'; end if;
   if public.shift_exchange_fingerprint(w,s,null)<>c.consent_fingerprint then raise exception 'Shift conditions changed. The owner must renew this offer' using errcode='PT409'; end if;
   if public.lineup_candidate_check(w,emp.id,s)->>'status'<>'eligible' then raise exception 'You are not eligible for the full shift'; end if;
   cid:=c.id;
   if exists(select 1 from public.shift_exchange_applications where case_id=cid and employee_id=emp.id and status='pending_manager') then raise exception 'You already have an active application'; end if;
   insert into public.shift_exchange_applications(workspace_id,case_id,employee_id,status,consent_fingerprint) values(w,cid,emp.id,'pending_manager',c.consent_fingerprint) returning id into aid;
   update public.shift_exchange_cases set revision=revision+1,updated_at=now() where id=cid returning * into c;
   perform public.shift_exchange_emit(actor,w,cid,aid,'application_submitted','A teammate requested this shift. The current owner remains responsible.');
  end if;
 else
  select * into c from public.shift_exchange_cases where id=cid and workspace_id=w for update;
  if c.id is null then raise exception 'Request not found' using errcode='P0002'; end if;
  s:=public.shift_exchange_shift(w,c.offered_source_id); t:=public.shift_exchange_shift(w,c.requested_source_id);
  owns:=c.owner_id=emp.id;
  manager:=public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',(c.offered_snapshot->>'location_id')::uuid)
   or (c.kind='swap' and public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',(c.requested_snapshot->>'location_id')::uuid));
  if not coalesce(owns,false) and not coalesce(manager,false) and not exists(select 1 from public.shift_exchange_applications where case_id=cid and employee_id=emp.id) then raise exception 'Request access denied' using errcode='42501'; end if;
  if c.status<>'open' or c.revision is distinct from (command->>'expected_revision')::integer then raise exception 'This request changed. Review the latest details' using errcode='PT409'; end if;
  if c.expires_at<=now() then
   update public.shift_exchange_cases set status='expired',revision=revision+1,updated_at=now() where id=cid returning * into c;
   update public.shift_exchange_applications set status='expired',updated_at=now() where case_id=cid and status in('invited','pending_manager');
   perform public.shift_exchange_emit(actor,w,cid,null,'expired','The shift has started. The current owner remains responsible.');
  elsif public.shift_exchange_live_status(w,cid)='invalidated' then
   update public.shift_exchange_cases set status='invalidated',revision=revision+1,updated_at=now() where id=cid returning * into c;
   update public.shift_exchange_applications set status='invalidated',updated_at=now() where case_id=cid and status in('invited','pending_manager');
   delete from public.shift_exchange_votes where case_id=cid;
   perform public.shift_exchange_emit(actor,w,cid,null,'invalidated','Shift details changed. This offer ended without a transfer. Start a new request from the current schedule.');
  elsif action='close' then
   if not coalesce(owns,false) and not coalesce(manager,false) then raise exception 'Only the owner or a manager can close this search' using errcode='42501'; end if;
   if coalesce(length(trim(command->>'reason')),0)=0 then raise exception 'Choose a reason for closing this search'; end if;
   update public.shift_exchange_cases set status='cancelled',revision=revision+1,updated_at=now() where id=cid returning * into c;
   update public.shift_exchange_applications set status='closed_case_cancelled',reason=command->>'reason',updated_at=now() where case_id=cid and status in('invited','pending_manager');
   perform public.shift_exchange_emit(actor,w,cid,null,'case_closed',command->>'reason',coalesce(command->>'private_note',''));
  else
   select * into a from public.shift_exchange_applications where id=aid and case_id=cid and workspace_id=w for update;
   if a.id is null or a.status not in('invited','pending_manager') then raise exception 'This application is no longer active' using errcode='PT409'; end if;
   if action in('accept','decline','withdraw') then
    if a.employee_id is distinct from emp.id then raise exception 'Only the invited employee can respond' using errcode='42501'; end if;
    if action in('accept','decline') and a.status<>'invited' then raise exception 'This invitation already has a response'; end if;
    if action='accept' then
     if public.shift_exchange_fingerprint(w,s,t) is distinct from c.consent_fingerprint then raise exception 'Shift conditions changed. Ask for a new offer' using errcode='PT409'; end if;
     if public.lineup_candidate_check(w,emp.id,s,array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null))->>'status'<>'eligible'
      or (c.kind='swap' and public.lineup_candidate_check(w,c.owner_id,t,array[(s->>'id')::uuid,(t->>'id')::uuid])->>'status'<>'eligible') then raise exception 'Both employees must be eligible for the full exchange'; end if;
    end if;
    update public.shift_exchange_applications set status=case action when 'accept' then 'pending_manager' when 'decline' then 'declined_by_employee' else 'withdrawn' end,updated_at=now() where id=aid;
    delete from public.shift_exchange_votes where case_id=cid and application_id=aid;
    if c.audience='direct' and action in('decline','withdraw') then update public.shift_exchange_cases set status='cancelled' where id=cid; end if;
    perform public.shift_exchange_emit(actor,w,cid,aid,case action when 'accept' then 'peer_accepted' when 'decline' then 'peer_declined' else 'application_withdrawn' end,
     case action when 'accept' then 'Accepted. Awaiting manager approval; the original owner remains responsible.' when 'decline' then 'The teammate declined. No assignment changed.' else case when c.audience='direct' then 'The employee withdrew consent. This request ended without a transfer.' else 'The application was withdrawn. Other candidates remain available.' end end);
   elsif action in('reject','approve') then
    if not coalesce(manager,false) then raise exception 'Manager scope required' using errcode='42501'; end if;
    if action='reject' then
     if coalesce(length(trim(command->>'reason')),0)=0 then raise exception 'Provide a reason visible to this employee'; end if;
     update public.shift_exchange_applications set status='rejected_by_manager',reason=command->>'reason',updated_at=now() where id=aid;
     delete from public.shift_exchange_votes where case_id=cid and application_id=aid;
     if c.audience='direct' then update public.shift_exchange_cases set status='cancelled' where id=cid; end if;
     perform public.shift_exchange_emit(actor,w,cid,aid,'application_rejected',command->>'reason',coalesce(command->>'private_note',''));
    else
     checked:=public.shift_exchange_preview(actor,w,cid,aid);
     if not (checked->>'allowed')::boolean then raise exception '%',checked->'reasons' using errcode='PT409'; end if;
     if command->>'fingerprint' is distinct from checked->>'fingerprint' then raise exception 'This approval preview changed. Review the latest details' using errcode='PT409'; end if;
     fp:=checked->>'fingerprint';
     for loc in select distinct x from unnest(array[(s->>'location_id')::uuid,(t->>'location_id')::uuid]) x where x is not null loop
      if public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',loc) then
       insert into public.shift_exchange_votes(case_id,workspace_id,application_id,location_id,actor_user_id,fingerprint) values(cid,w,aid,loc,actor,fp)
       on conflict(case_id,location_id) do update set application_id=excluded.application_id,actor_user_id=excluded.actor_user_id,fingerprint=excluded.fingerprint,created_at=now();
      end if;
     end loop;
     if (checked->>'requires_other_manager')::boolean then
      perform public.shift_exchange_emit(actor,w,cid,aid,'scope_approved','One location approved. Awaiting the other manager; assignments are unchanged.');
     else
      perform 1 from public.schedule_published_shifts where id in((s->>'id')::uuid,(t->>'id')::uuid) order by id for update;
      -- Recheck after row locks as external Schedule writers may predate the shared workspace lock.
      checked:=public.shift_exchange_preview(actor,w,cid,aid);
      if not (checked->>'allowed')::boolean or checked->>'fingerprint'<>fp then raise exception 'Schedule changed during approval' using errcode='PT409'; end if;
      update public.schedule_published_shifts set employee_id=a.employee_id where id=(s->>'id')::uuid;
      if c.kind='swap' then update public.schedule_published_shifts set employee_id=c.owner_id where id=(t->>'id')::uuid; end if;
      perform public.shift_exchange_reconcile(actor,w,s,a.employee_id);
      if c.kind='swap' then perform public.shift_exchange_reconcile(actor,w,t,c.owner_id); end if;
      update public.shift_exchange_applications set status='approved',updated_at=now() where id=aid;
      for other in select id from public.shift_exchange_applications where case_id=cid and id<>aid and status in('invited','pending_manager') loop
       update public.shift_exchange_applications set status='closed_other_selected',updated_at=now() where id=other.id;
       perform public.shift_exchange_emit(actor,w,cid,other.id,'other_selected','Another teammate was selected. Your schedule has not changed.');
      end loop;
      update public.shift_exchange_cases set status='completed' where id=cid;
      perform public.shift_exchange_emit(actor,w,cid,aid,'transfer_completed','Manager approved the transfer. The receiving employee is now responsible; the previous owner is released.',coalesce(command->>'private_note',''));
      for other in select x.id from public.shift_exchange_cases x where x.workspace_id=w and x.status='open' and x.id<>cid
       and (x.offered_source_id in(c.offered_source_id,c.requested_source_id) or x.requested_source_id in(c.offered_source_id,c.requested_source_id)) loop
       update public.shift_exchange_cases set status='invalidated',revision=revision+1,updated_at=now() where id=other.id;
       update public.shift_exchange_applications set status='invalidated',updated_at=now() where case_id=other.id and status in('invited','pending_manager');
       perform public.shift_exchange_emit(actor,w,other.id,null,'invalidated','An involved shift changed owner. Start a new request using the current schedule.');
      end loop;
     end if;
    end if;
   else raise exception 'Unknown exchange action'; end if;
   update public.shift_exchange_cases set revision=revision+1,updated_at=now() where id=cid returning * into c;
  end if;
 end if;
 perform realtime.send(jsonb_build_object('workspace_id',w,'case_id',cid,'revision',c.revision),'changed','shift-exchanges:'||w::text,false);
 result:=jsonb_build_object('case_id',cid,'status',c.status,'revision',c.revision);
 insert into public.shift_exchange_commands(workspace_id,actor_user_id,idempotency_key,command,result) values(w,actor,idempotency_key,command,result);
 return result;
end; $$;

-- No direct REST table mutations. Only service RPCs bind the verified API actor.
revoke all on function public.shift_exchange_live_status(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.shift_exchange_shift(uuid,uuid),public.shift_exchange_terms(jsonb),public.shift_exchange_fingerprint(uuid,jsonb,jsonb),public.lineup_candidate_check_exchange_base(uuid,uuid,jsonb,uuid[],integer),public.lineup_candidate_check(uuid,uuid,jsonb,uuid[],integer),public.shift_exchange_preview(uuid,uuid,uuid,uuid),public.shift_exchange_reconcile(uuid,uuid,jsonb,uuid),public.shift_exchange_emit(uuid,uuid,uuid,uuid,text,text,text),public.shift_exchanges_command_service(uuid,uuid,jsonb,uuid),public.shift_exchanges_read_service(uuid,uuid,boolean,date,date,uuid),public.shift_exchanges_candidates_service(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.shift_exchange_preview(uuid,uuid,uuid,uuid),public.shift_exchanges_command_service(uuid,uuid,jsonb,uuid),public.shift_exchanges_read_service(uuid,uuid,boolean,date,date,uuid),public.shift_exchanges_candidates_service(uuid,uuid,uuid) to service_role;
