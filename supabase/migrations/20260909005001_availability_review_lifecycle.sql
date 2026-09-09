-- CLI-generated migration, ordered after the existing forward migrations.
alter table public.workspace_scheduling_settings
  add column availability_ownership text not null default 'hybrid' check(availability_ownership in ('hybrid','employee_only','manager_only')),
  add column availability_approval text not null default 'narrowing' check(availability_approval in ('none','narrowing','all')),
  add column availability_initial_review boolean not null default false,
  add column availability_notice_days integer not null default 0 check(availability_notice_days between 0 and 90),
  add column availability_policy_revision integer not null default 1;

create function public.version_availability_policy() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform public.availability_lock_workspace(new.workspace_id);
 if (new.availability_ownership,new.availability_approval,new.availability_initial_review,new.availability_notice_days,new.availability_enforcement)
   is distinct from (old.availability_ownership,old.availability_approval,old.availability_initial_review,old.availability_notice_days,old.availability_enforcement) then
   new.availability_policy_revision:=old.availability_policy_revision+1;
 else new.availability_policy_revision:=old.availability_policy_revision; end if;
 return new;
end; $$;

revoke all on function public.version_availability_policy() from public,anon,authenticated;
create trigger availability_policy_revision before update on public.workspace_scheduling_settings for each row execute function public.version_availability_policy();

create table public.availability_requests (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 employee_id uuid not null, author_id uuid not null references auth.users(id),
 proposal jsonb not null, before_snapshot jsonb, base_revision integer not null check(base_revision>=0),
 policy_revision integer not null, policy_snapshot jsonb not null,
 source text not null check(source in ('employee','onboarding','manager_proposal','manager_recorded_confirmation')),
 confirmation jsonb, kind text not null check(kind in ('weekly','temporary')),
 effective_from date not null, effective_until date, is_narrowing boolean not null,
 status text not null check(status in ('awaiting_employee','pending_review','effective','denied','changes_requested','withdrawn','superseded')),
 capacity_notice_open boolean not null default false,
 reviewer_id uuid references auth.users(id), decision_reason text not null default '',
 revision integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(employee_id,workspace_id) references public.employee_profiles(id,workspace_id) on delete cascade,
 unique(id,workspace_id), check(effective_until is null or effective_until>=effective_from),
 check(kind<>'temporary' or effective_until is not null)
);
create index availability_requests_employee_period on public.availability_requests(workspace_id,employee_id,effective_from,effective_until);
create table public.availability_events (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 request_id uuid not null, actor_id uuid not null references auth.users(id), action text not null,
 detail jsonb not null, created_at timestamptz not null default now(),
 foreign key(request_id,workspace_id) references public.availability_requests(id,workspace_id) on delete cascade
);
create table public.availability_commands (
 workspace_id uuid not null references public.workspaces(id) on delete cascade, actor_id uuid not null references auth.users(id),
 idempotency_key uuid not null, input jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(workspace_id,actor_id,idempotency_key)
);
alter table public.employee_schedule_availability_versions
 add column request_id uuid,
 add constraint availability_version_request_workspace_fk foreign key(request_id,workspace_id) references public.availability_requests(id,workspace_id),
 add column kind text not null default 'weekly' check(kind in ('weekly','temporary')),
 add column confirmation_source text, add column confirmation jsonb;
alter table public.employee_availability_versions add column request_id uuid,
 add constraint onboarding_availability_request_workspace_fk foreign key(request_id,workspace_id) references public.availability_requests(id,workspace_id);
do $$ declare t text; begin
 foreach t in array array['availability_requests','availability_events','availability_commands'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to service_role',t);
 end loop;
end; $$;

create function public.availability_actor_scope(actor uuid,w uuid,emp uuid,manage boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.employee_profiles e where e.id=emp and e.workspace_id=w and e.archived_at is null)
 and case when manage then
   public.schedule_actor_has_capability_service(actor,w,'employees.manage') and
   not exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=emp and a.ended_at is null
     and not public.schedule_actor_has_capability_service(actor,w,'employees.manage',a.location_id)) and
   (exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=emp and a.ended_at is null)
     or exists(select 1 from public.workspace_memberships m where m.workspace_id=w and m.user_id=actor and m.status='active' and m.all_locations))
 else exists(select 1 from public.employee_profiles e join public.workspace_memberships m on m.workspace_id=e.workspace_id and m.user_id=e.user_id
   where e.id=emp and e.workspace_id=w and e.user_id=actor and m.status in ('active','pending_activation'))
   or (public.schedule_actor_has_capability_service(actor,w,'employees.read') and
     (exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=emp and a.ended_at is null
       and public.schedule_actor_has_capability_service(actor,w,'employees.read',a.location_id))
       or exists(select 1 from public.workspace_memberships m where m.workspace_id=w and m.user_id=actor and m.status='active' and m.all_locations))) end;
$$;
revoke all on function public.availability_actor_scope(uuid,uuid,uuid,boolean) from public,anon,authenticated;

create function public.availability_period_locked(w uuid,emp uuid,starts date,ends date) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.availability_publication_locks l where l.workspace_id=w
  and l.week_start<=coalesce(ends,'infinity'::date) and l.week_start+6>=starts
  and (exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=emp and a.location_id=l.location_id and a.ended_at is null)
    or exists(select 1 from public.schedule_published_shifts s where s.workspace_id=w and s.employee_id=emp and s.location_id=l.location_id and s.scheduled_date between l.week_start and l.week_start+6)));
$$;
revoke all on function public.availability_period_locked(uuid,uuid,date,date) from public,anon,authenticated;

create function public.availability_week_capacity(days jsonb) returns int4multirange language sql immutable set search_path='' as $$
 select coalesce(range_agg(int4range((r->>'day')::integer*86400+case when r->>'mode'='unrestricted' then 0 else (extract(epoch from (win->>'start')::time))::integer end,
   (r->>'day')::integer*86400+case when r->>'mode'='unrestricted' then 86400 else (extract(epoch from (win->>'end')::time))::integer end,'[)')),'{}'::int4multirange)
 from jsonb_array_elements(days) r left join lateral jsonb_array_elements(r->'windows') win on true where r->>'mode'<>'unavailable';
$$;
revoke all on function public.availability_week_capacity(jsonb) from public,anon,authenticated;

create function public.availability_change_narrows(w uuid,emp uuid,p jsonb) returns boolean language sql stable set search_path='' as $$
 with boundaries as (
  select (p->>'effective_from')::date d
  union select effective_from from public.employee_schedule_availability_versions where workspace_id=w and employee_id=emp and effective_from>=(p->>'effective_from')::date
  union select effective_until+1 from public.employee_schedule_availability_versions where workspace_id=w and employee_id=emp and effective_until>=(p->>'effective_from')::date
 ), days as (
  select distinct d+n d from boundaries cross join generate_series(0,6) n where d is not null and d+n<=coalesce((p->>'effective_until')::date,'infinity'::date)
 ), compared as (
  select days.d,v.*,public.availability_week_capacity(v.recurring_rules)*int4multirange(int4range(extract(dow from days.d)::integer*86400,(extract(dow from days.d)::integer+1)*86400,'[)')) previous
  from days cross join lateral (select * from public.employee_schedule_availability_versions v where v.workspace_id=w and v.employee_id=emp
    and v.effective_from<=days.d and (v.effective_until is null or v.effective_until>=days.d) order by version_number desc limit 1) v
 ) select exists(select 1 from compared where timezone<>p->>'timezone' or not public.availability_week_capacity(p->'days') @> previous);
$$;
revoke all on function public.availability_change_narrows(uuid,uuid,jsonb) from public,anon,authenticated;

create function public.guard_availability_request() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform public.availability_lock_workspace(new.workspace_id);
 if tg_op='UPDATE' then
  if (new.workspace_id,new.employee_id,new.author_id,new.proposal,new.before_snapshot,new.base_revision,new.policy_revision,new.policy_snapshot,new.source,new.kind,new.effective_from,new.effective_until,new.is_narrowing,new.created_at)
    is distinct from (old.workspace_id,old.employee_id,old.author_id,old.proposal,old.before_snapshot,old.base_revision,old.policy_revision,old.policy_snapshot,old.source,old.kind,old.effective_from,old.effective_until,old.is_narrowing,old.created_at) then
    raise exception 'Availability proposal is immutable; submit a replacement' using errcode='23514'; end if;
 else
  perform public.validate_availability_week(new.proposal->>'timezone',new.proposal->'days');
  if new.effective_from is distinct from (new.proposal->>'effective_from')::date or new.effective_until is distinct from (new.proposal->>'effective_until')::date then
   raise exception 'Availability period must match its proposal' using errcode='23514'; end if;
  if public.availability_period_locked(new.workspace_id,new.employee_id,new.effective_from,new.effective_until) then
   raise exception 'This period is published. Request time off or a shift change; availability cannot change published responsibilities.' using errcode='23514'; end if;
 end if;
 return new;
end; $$;
revoke all on function public.guard_availability_request() from public,anon,authenticated;
create trigger availability_request_guard before insert or update on public.availability_requests for each row execute function public.guard_availability_request();

create function public.availability_emit(r public.availability_requests,actor uuid,action_name text) returns void language plpgsql security definer set search_path='' as $$
declare event uuid;
begin
 insert into public.availability_events(workspace_id,request_id,actor_id,action,detail)
 values(r.workspace_id,r.id,actor,action_name,jsonb_build_object('status',r.status,'revision',r.revision,'source',r.source,'reason',r.decision_reason,
  'capacity_notice_open',r.capacity_notice_open,'confirmation',r.confirmation)) returning id into event;
 perform public.availability_notify(r,actor,event,action_name);
end; $$;
revoke all on function public.availability_emit(public.availability_requests,uuid,text) from public,anon,authenticated,service_role;

create function public.availability_activate(r public.availability_requests,actor uuid) returns integer language plpgsql security definer set search_path='' as $$
declare next_version integer; c public.employee_onboarding_cases%rowtype; onboarding_version integer;
begin
 select coalesce(max(version_number),0)+1 into next_version from public.employee_schedule_availability_versions where workspace_id=r.workspace_id and employee_id=r.employee_id;
 insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from,effective_until,request_id,kind,confirmation_source,confirmation)
 values(r.workspace_id,r.employee_id,next_version,r.proposal->>'timezone',r.proposal->'days',case when r.source like 'manager_%' then 'manager' else r.source end,r.author_id,
   r.effective_from,r.effective_until,r.id,r.kind,case when r.confirmation->>'channel'='app' then 'employee' else r.source end,r.confirmation);
 if r.source='onboarding' then
  select * into c from public.employee_onboarding_cases where workspace_id=r.workspace_id and employee_id=r.employee_id for update;
  if c.id is not null then
   select coalesce(max(version_number),0)+1 into onboarding_version from public.employee_availability_versions where case_id=c.id;
   insert into public.employee_availability_versions(workspace_id,employee_id,case_id,version_number,timezone,recurring_rules,confirmed_by,effective_from,effective_until,request_id)
   values(r.workspace_id,r.employee_id,c.id,onboarding_version,r.proposal->>'timezone',r.proposal->'days',r.author_id,r.effective_from,r.effective_until,r.id);
   update public.employee_onboarding_requirements set status='completed',rejection_reason=null,completed_at=now(),updated_at=now() where case_id=c.id and kind='availability';
  end if;
 end if;
 return next_version;
end; $$;
revoke all on function public.availability_activate(public.availability_requests,uuid) from public,anon,authenticated,service_role;

-- Canonical activation already wrote the version for linked onboarding snapshots.
create or replace function public.sync_onboarding_availability() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.request_id is not null then return new; end if;
 raise exception 'Refresh onboarding before submitting availability' using errcode='40001';
end; $$;

-- Service-only command boundary; every transition is serialized with publication.
create function public.availability_command_service(actor uuid,w uuid,command jsonb,request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare emp public.employee_profiles%rowtype; r public.availability_requests%rowtype; old_request public.availability_requests%rowtype;
 settings public.workspace_scheduling_settings%rowtype; prior public.availability_commands%rowtype;
 action_name text:=command->>'action'; p jsonb; conf jsonb; request_source text; current_revision integer; next_revision integer;
 is_self boolean; can_manage boolean; narrowing boolean; needs_review boolean; initial boolean; result jsonb;
begin
 if request_key is null or jsonb_typeof(command) is distinct from 'object' then raise exception 'A command and idempotency key are required' using errcode='22023'; end if;
 select * into emp from public.employee_profiles where workspace_id=w and id=(command->>'employee_id')::uuid and archived_at is null;
 if emp.id is null or not public.availability_actor_scope(actor,w,emp.id,false) then raise exception 'Availability access denied' using errcode='42501'; end if;
 is_self:=coalesce(emp.user_id=actor,false); can_manage:=public.availability_actor_scope(actor,w,emp.id,true);
 perform public.availability_lock_workspace(w);
 select * into prior from public.availability_commands where workspace_id=w and actor_id=actor and idempotency_key=request_key;
 if prior.idempotency_key is not null then
  if prior.input is distinct from command then raise exception 'This retry key belongs to a different change' using errcode='40001'; end if;
  return prior.result;
 end if;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 if settings.workspace_id is null then raise exception 'Scheduling settings unavailable' using errcode='P0002'; end if;
 select coalesce(max(version_number),0) into current_revision from public.employee_schedule_availability_versions where workspace_id=w and employee_id=emp.id;
 if action_name='submit' then
  if command->>'source'='onboarding' and not exists(select 1 from public.employee_onboarding_cases c
    where c.workspace_id=w and c.employee_id=emp.id and c.status<>'cancelled' and c.revision=(command->>'onboarding_revision')::integer) then
   raise exception 'Onboarding changed; refresh before submitting availability' using errcode='40001'; end if;
  if (command->>'expected_revision')::integer is distinct from current_revision then raise exception 'Availability changed; refresh before submitting' using errcode='40001'; end if;
  if not coalesce(is_self,false) and (not can_manage or settings.availability_ownership='employee_only') then raise exception 'A manager for every employee location is required' using errcode='42501'; end if;
  p:=command->'proposal'; conf:=command->'confirmation';
  perform public.validate_availability_week(p->>'timezone',p->'days');
  if (p->>'effective_from') is null or not isfinite((p->>'effective_from')::date) or ((p->>'effective_until') is not null and not isfinite((p->>'effective_until')::date)) or (p->>'effective_from')::date<(now() at time zone (p->>'timezone'))::date
    or (p->>'effective_until')::date<(p->>'effective_from')::date then raise exception 'Choose a valid current or future availability period' using errcode='22023'; end if;
  if coalesce(command->>'source','employee')='onboarding' and (not coalesce(is_self,false) or not exists(select 1 from public.employee_onboarding_cases where workspace_id=w and employee_id=emp.id)) then
   raise exception 'Employee onboarding access required' using errcode='42501'; end if;
  request_source:=case when is_self then case when command->>'source'='onboarding' then 'onboarding' else 'employee' end
    when command->>'source'='manager_recorded_confirmation' then 'manager_recorded_confirmation' else 'manager_proposal' end;
  if request_source='manager_recorded_confirmation' then
   if conf->>'channel' is null or conf->>'channel' not in ('conversation','phone','message','document') or conf->>'confirmed_at' is null
     or (conf->>'confirmed_at')::timestamptz>now() or length(btrim(coalesce(conf->>'note','')))<3 then
    raise exception 'Record when and how the employee confirmed these hours' using errcode='22023'; end if;
  elsif is_self then conf:=jsonb_build_object('channel','app','confirmed_at',now(),'user_id',actor); else conf:=null; end if;
  if command->>'supersedes_request_id' is not null then
   select * into old_request from public.availability_requests where id=(command->>'supersedes_request_id')::uuid and workspace_id=w and employee_id=emp.id for update;
   if old_request.id is null or old_request.revision is distinct from (command->>'supersedes_request_revision')::integer
     or old_request.status in ('effective','withdrawn','superseded') or (not coalesce(is_self,false) and old_request.author_id<>actor) then
     raise exception 'The earlier request changed; refresh before replacing it' using errcode='40001'; end if;
   update public.availability_requests set status='superseded',capacity_notice_open=false,revision=revision+1,updated_at=now() where id=old_request.id returning * into old_request;
   perform public.availability_emit(old_request,actor,'superseded');
  end if;
  if exists(select 1 from public.availability_requests x where x.workspace_id=w and x.employee_id=emp.id
    and (x.status in ('awaiting_employee','pending_review','changes_requested') or x.capacity_notice_open)
    and x.effective_from<=coalesce((p->>'effective_until')::date,'infinity'::date) and coalesce(x.effective_until,'infinity'::date)>=(p->>'effective_from')::date) then
   raise exception 'An overlapping request is still open. Explicitly replace or withdraw it first' using errcode='40001'; end if;
  if exists(select 1 from public.employee_schedule_availability_versions v where v.workspace_id=w and v.employee_id=emp.id and v.kind='temporary'
    and v.effective_from<=coalesce((p->>'effective_until')::date,'infinity'::date) and v.effective_until>=(p->>'effective_from')::date
    and not coalesce(command->'replace_version_ids','[]'::jsonb) @> jsonb_build_array(v.id::text)) then
   raise exception 'Review and explicitly replace the overlapping temporary availability' using errcode='40001'; end if;
  narrowing:=public.availability_change_narrows(w,emp.id,p); initial:=current_revision=0;
  needs_review:=case when initial then settings.availability_initial_review else settings.availability_approval='all' or (settings.availability_approval='narrowing' and narrowing) end
    or (is_self and settings.availability_ownership='manager_only')
    or (p->>'effective_from')::date < (now() at time zone (p->>'timezone'))::date+settings.availability_notice_days;
  insert into public.availability_requests(workspace_id,employee_id,author_id,proposal,before_snapshot,base_revision,policy_revision,policy_snapshot,
    source,confirmation,kind,effective_from,effective_until,is_narrowing,status,capacity_notice_open)
  values(w,emp.id,actor,p,(select coalesce(jsonb_agg(to_jsonb(v) order by version_number),'[]') from public.employee_schedule_availability_versions v where v.workspace_id=w and v.employee_id=emp.id),
    current_revision,settings.availability_policy_revision,jsonb_build_object('approval',settings.availability_approval,'initial_review',settings.availability_initial_review,'ownership',settings.availability_ownership,'notice_days',settings.availability_notice_days),
    request_source,conf,coalesce(p->>'kind',case when p->>'effective_until' is null then 'weekly' else 'temporary' end),(p->>'effective_from')::date,(p->>'effective_until')::date,narrowing,
    case when request_source='manager_proposal' then 'awaiting_employee' when needs_review then 'pending_review' else 'effective' end,
    narrowing and request_source<>'manager_proposal' and needs_review) returning * into r;
  if r.status='effective' then next_revision:=public.availability_activate(r,actor); end if;
 else
  select * into r from public.availability_requests where id=(command->>'request_id')::uuid and workspace_id=w and employee_id=emp.id for update;
  if r.id is null then raise exception 'Availability request not found' using errcode='P0002'; end if;
  if r.revision is distinct from (command->>'expected_request_revision')::integer then raise exception 'This request changed; refresh before deciding' using errcode='40001'; end if;
  if action_name in ('approve','deny','changes_requested','resolve_notice') then
   if not can_manage or coalesce(is_self,false) or r.author_id=actor then raise exception 'A different manager with all affected locations must review this request' using errcode='42501'; end if;
   if (command->>'expected_revision')::integer is distinct from current_revision or (command->>'policy_revision')::integer is distinct from settings.availability_policy_revision then
    raise exception 'Availability or policy changed; review the current details again' using errcode='40001'; end if;
   if action_name='resolve_notice' then
    if not r.capacity_notice_open then raise exception 'No unresolved availability notice' using errcode='22023'; end if;
    conf:=command->'confirmation';
    if conf->>'channel' is null or conf->>'channel' not in ('conversation','phone','message','document') or conf->>'confirmed_at' is null or (conf->>'confirmed_at')::timestamptz>now()
      or length(btrim(coalesce(conf->>'note','')))<3 then raise exception 'Record the employee conversation that resolves this notice' using errcode='22023'; end if;
    r.capacity_notice_open:=false; r.confirmation:=conf;
   else
    if r.status<>'pending_review' then raise exception 'This availability request is not awaiting review' using errcode='40001'; end if;
    if action_name='approve' then next_revision:=public.availability_activate(r,actor); r.status:='effective'; r.capacity_notice_open:=false;
    else
     if length(btrim(coalesce(command->>'reason','')))<3 then raise exception 'Add a short explanation for the employee' using errcode='22023'; end if;
     r.status:=case when action_name='deny' then 'denied' else 'changes_requested' end;
    end if;
   end if;
   r.reviewer_id:=actor; r.decision_reason:=btrim(coalesce(command->>'reason',''));
  elsif action_name='confirm' then
   if not coalesce(is_self,false) or r.status<>'awaiting_employee' then raise exception 'Only the employee can confirm this proposal' using errcode='42501'; end if;
   if (command->>'expected_revision')::integer is distinct from current_revision then raise exception 'Availability changed; review the current proposal again' using errcode='40001'; end if;
   r.confirmation:=jsonb_build_object('channel','app','confirmed_at',now(),'user_id',actor);
   narrowing:=public.availability_change_narrows(w,emp.id,r.proposal);
   needs_review:=case when current_revision=0 then settings.availability_initial_review else settings.availability_approval='all' or (settings.availability_approval='narrowing' and narrowing) end
     or settings.availability_ownership='manager_only'
     or r.effective_from<(now() at time zone (r.proposal->>'timezone'))::date+settings.availability_notice_days;
   r.status:=case when needs_review then 'pending_review' else 'effective' end; r.capacity_notice_open:=needs_review and narrowing;
   if not needs_review then next_revision:=public.availability_activate(r,actor); end if;
  elsif action_name in ('withdraw','decline') then
   if not (coalesce(is_self,false) or (r.author_id=actor and r.source='manager_proposal')) or r.status in ('effective','withdrawn','superseded') then
    raise exception 'This availability request cannot be withdrawn by you' using errcode='42501'; end if;
   r.status:='withdrawn'; r.capacity_notice_open:=false; r.decision_reason:=btrim(coalesce(command->>'reason',''));
  else raise exception 'Unknown availability action' using errcode='22023'; end if;
  update public.availability_requests set status=r.status,capacity_notice_open=r.capacity_notice_open,confirmation=r.confirmation,
    reviewer_id=r.reviewer_id,decision_reason=r.decision_reason,revision=revision+1,updated_at=now() where id=r.id returning * into r;
 end if;
 perform public.availability_emit(r,actor,action_name);
 result:=jsonb_build_object('status',r.status,'request_id',r.id,'request_revision',r.revision,'revision',coalesce(next_revision,current_revision),'capacity_notice_open',r.capacity_notice_open);
 insert into public.availability_commands(workspace_id,actor_id,idempotency_key,input,result) values(w,actor,request_key,command,result);
 return result;
end; $$;
revoke all on function public.availability_command_service(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.availability_command_service(uuid,uuid,jsonb,uuid) to service_role;

-- Pending onboarding uses the same command boundary and remains visibly awaiting review.
create or replace function public.save_employee_availability_v2_service(
 actor_user_id uuid,target_workspace_id uuid,availability_timezone text,availability_days jsonb,
 starts_on date,ends_on date,expected_revision integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.employee_profiles%rowtype;
begin
 e:=public.employee_hub_actor_service(actor_user_id,target_workspace_id);
 return public.availability_command_service(actor_user_id,target_workspace_id,jsonb_build_object('action','submit','employee_id',e.id,
  'expected_revision',expected_revision,'proposal',jsonb_build_object('timezone',availability_timezone,'days',availability_days,
   'effective_from',starts_on,'effective_until',ends_on)),gen_random_uuid());
end; $$;

create function public.save_onboarding_availability_v3_service(
 target_user_id uuid,availability_timezone text,availability_days jsonb,expected_revision integer,
 starts_on date,ends_on date,availability_revision integer,request_key uuid
) returns integer language plpgsql security definer set search_path='' as $$
declare c public.employee_onboarding_cases%rowtype; result jsonb; prior public.availability_commands%rowtype; command jsonb;
begin
 select onboarding.* into c from public.employee_onboarding_cases onboarding
 join public.employee_profiles e on e.id=onboarding.employee_id and e.workspace_id=onboarding.workspace_id
 join public.workspace_memberships m on m.id=onboarding.membership_id
 where e.user_id=target_user_id and e.archived_at is null and m.status in ('active','pending_activation') order by onboarding.created_at limit 1;
 if c.id is null then raise exception 'onboarding unavailable' using errcode='P0002'; end if;
 perform public.availability_lock_workspace(c.workspace_id);
 command:=jsonb_build_object('action','submit','employee_id',c.employee_id,'source','onboarding','expected_revision',availability_revision,
  'onboarding_revision',expected_revision,'proposal',jsonb_build_object('timezone',availability_timezone,'days',availability_days,'effective_from',starts_on,'effective_until',ends_on));
 select * into prior from public.availability_commands where workspace_id=c.workspace_id and actor_id=target_user_id and idempotency_key=request_key;
 if prior.idempotency_key is not null then
  if prior.input is distinct from command then raise exception 'This retry key belongs to a different change' using errcode='40001'; end if;
  return (prior.result->>'onboarding_revision')::integer;
 end if;
 select * into c from public.employee_onboarding_cases where id=c.id for update;
 if c.revision is distinct from expected_revision then raise exception 'onboarding changed; refresh required' using errcode='40001'; end if;
 result:=public.availability_command_service(target_user_id,c.workspace_id,command,request_key);
 update public.employee_onboarding_requirements set status=case when result->>'status'='effective' then 'completed'::public.employee_onboarding_requirement_status else 'awaiting_review'::public.employee_onboarding_requirement_status end,
  rejection_reason=null,completed_at=case when result->>'status'='effective' then now() else null end,updated_at=now()
  where case_id=c.id and kind='availability';
 update public.employee_onboarding_cases set status=case when status in ('approved','cancelled') then status else 'in_progress' end,revision=revision+1,updated_at=now()
  where id=c.id returning revision into expected_revision;
 update public.availability_commands set result=availability_commands.result||jsonb_build_object('onboarding_revision',expected_revision)
  where workspace_id=c.workspace_id and actor_id=target_user_id and idempotency_key=request_key;
 return expected_revision;
end; $$;
revoke all on function public.save_onboarding_availability_v3_service(uuid,text,jsonb,integer,date,date,integer,uuid) from public,anon,authenticated;
grant execute on function public.save_onboarding_availability_v3_service(uuid,text,jsonb,integer,date,date,integer,uuid) to service_role;

create or replace function public.save_onboarding_availability_v2_service(
 target_user_id uuid,availability_timezone text,availability_days jsonb,expected_revision integer,
 starts_on date,ends_on date,availability_revision integer
) returns integer language sql security definer set search_path='' as $$
 select public.save_onboarding_availability_v3_service(target_user_id,availability_timezone,availability_days,expected_revision,starts_on,ends_on,availability_revision,gen_random_uuid());
$$;
-- Clients without effective dates/revisions must refresh, never bypass approval.
create or replace function public.save_employee_availability_service(target_user_id uuid,availability_timezone text,availability_days jsonb,expected_revision integer)
returns integer language plpgsql security definer set search_path='' as $$ begin raise exception 'Refresh onboarding to choose an effective period' using errcode='40001'; end; $$;
create or replace function public.save_employee_hub_availability_service(actor_user_id uuid,target_workspace_id uuid,availability_timezone text,availability_days jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$ begin raise exception 'Refresh availability to choose an effective period' using errcode='40001'; end; $$;

create function public.availability_read_service(actor uuid,w uuid,employee_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e public.employee_profiles%rowtype; settings public.workspace_scheduling_settings%rowtype; latest jsonb; versions jsonb;
 locks jsonb; requests jsonb; events jsonb; is_self boolean; can_manage boolean; today date; suggested date;
begin
 select * into e from public.employee_profiles p where p.workspace_id=w and p.archived_at is null
  and case when availability_read_service.employee_id is null then p.user_id=actor else p.id=availability_read_service.employee_id end;
 if e.id is null or not public.availability_actor_scope(actor,w,e.id,false) then raise exception 'Availability access denied' using errcode='42501'; end if;
 is_self:=coalesce(e.user_id=actor,false); can_manage:=public.availability_actor_scope(actor,w,e.id,true);
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'timezone',v.timezone,'days',v.recurring_rules,'effective_from',v.effective_from,
  'effective_until',v.effective_until,'revision',v.version_number,'source',v.source,'kind',v.kind,'request_id',v.request_id,
  'confirmation_source',v.confirmation_source,'confirmation',v.confirmation) order by version_number desc),'[]') into versions
  from public.employee_schedule_availability_versions v where v.workspace_id=w and v.employee_id=e.id;
 latest:=versions->0; today:=(now() at time zone coalesce(latest->>'timezone','UTC'))::date;
 select greatest(today,coalesce(max(l.week_start+7),today)) into suggested from public.availability_publication_locks l where l.workspace_id=w and l.week_start+6>=today
  and (exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=e.id and a.location_id=l.location_id and a.ended_at is null)
    or exists(select 1 from public.schedule_published_shifts s where s.workspace_id=w and s.employee_id=e.id and s.location_id=l.location_id and s.scheduled_date between l.week_start and l.week_start+6));
 select coalesce(jsonb_agg(jsonb_build_object('location_id',l.location_id,'location_name',loc.name,'starts_on',l.week_start,'ends_on',l.week_start+6) order by l.week_start,loc.name),'[]')
 into locks from public.availability_publication_locks l join public.locations loc on loc.id=l.location_id and loc.workspace_id=w
 where l.workspace_id=w and l.week_start+6>=today and (is_self or public.schedule_actor_has_capability_service(actor,w,'employees.read',l.location_id))
 and (exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=e.id and a.location_id=l.location_id and a.ended_at is null)
   or exists(select 1 from public.schedule_published_shifts s where s.workspace_id=w and s.employee_id=e.id and s.location_id=l.location_id and s.scheduled_date between l.week_start and l.week_start+6));
 select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('can_review',can_manage and not is_self and r.author_id<>actor,
   'can_withdraw',is_self or (r.author_id=actor and r.source='manager_proposal'),'can_confirm',is_self and r.status='awaiting_employee') order by r.created_at desc,r.id),'[]')
 into requests from public.availability_requests r where r.workspace_id=w and r.employee_id=e.id;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]') into events from public.availability_events x
 join public.availability_requests r on r.id=x.request_id and r.workspace_id=x.workspace_id where r.workspace_id=w and r.employee_id=e.id;
 return jsonb_build_object('employee_id',e.id,'latest',latest,'revision',coalesce((latest->>'revision')::integer,0),'versions',versions,
  'current',(select v from jsonb_array_elements(versions) v where (v->>'effective_from')::date<=today and coalesce((v->>'effective_until')::date,'infinity'::date)>=today order by (v->>'revision')::integer desc limit 1),
  'published_periods',locks,'suggested_start',greatest(suggested,today+settings.availability_notice_days),'requests',requests,'events',events,
  'is_self',is_self,'can_submit',is_self or (can_manage and settings.availability_ownership<>'employee_only'),'can_manage',can_manage,
  'policy',jsonb_build_object('ownership',settings.availability_ownership,'approval',settings.availability_approval,'initial_review',settings.availability_initial_review,
   'notice_days',settings.availability_notice_days,'revision',settings.availability_policy_revision,'enforcement',settings.availability_enforcement));
end; $$;
revoke all on function public.availability_read_service(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.availability_read_service(uuid,uuid,uuid) to service_role;
create or replace function public.employee_availability_context_service(actor_user_id uuid,target_workspace_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$ select public.availability_read_service(actor_user_id,target_workspace_id); $$;

create function public.availability_pending_publication(w uuid,loc uuid,week date) returns setof public.availability_requests
language sql stable security definer set search_path='' as $$
 select r.* from public.availability_requests r where r.workspace_id=w
 and (r.status in ('pending_review','awaiting_employee','changes_requested') or r.capacity_notice_open)
 and r.effective_from<=week+6 and coalesce(r.effective_until,'infinity'::date)>=week
 and (exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=r.employee_id and a.location_id=loc and a.ended_at is null)
  or exists(select 1 from public.schedule_draft_shifts s where s.workspace_id=w and s.employee_id=r.employee_id and s.location_id=loc and s.scheduled_date between week and week+6)
  or exists(select 1 from public.schedule_published_shifts s where s.workspace_id=w and s.employee_id=r.employee_id and s.location_id=loc and s.scheduled_date between week and week+6));
$$;
revoke all on function public.availability_pending_publication(uuid,uuid,date) from public,anon,authenticated,service_role;
create or replace function public.capture_availability_publication_lock() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform public.availability_lock_workspace(new.workspace_id);
 if exists(select 1 from public.availability_pending_publication(new.workspace_id,new.location_id,new.week_start)) then
  raise exception 'Resolve pending availability and employee capacity notices before publishing this period' using errcode='23514'; end if;
 insert into public.availability_publication_locks(workspace_id,location_id,week_start,first_published_at)
 values(new.workspace_id,new.location_id,new.week_start,new.published_at) on conflict do nothing;
 return new;
end; $$;

create function public.availability_publication_preflight(payload jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare findings jsonb; unsigned jsonb;
begin
 if payload->>'status'='past_week_closed' then return payload; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id','availability-review:'||r.id::text||':'||(loc->>'location_id'),
  'code','availability_review_pending','severity','hard','overrideable',false,'location_id',loc->>'location_id','employee_id',r.employee_id,
  'scheduled_date',greatest(r.effective_from,(payload->>'week_start')::date),'shift_ids','[]'::jsonb,
  'message','Resolve pending availability or the employee capacity notice before publishing.','request_id',r.id,'request_revision',r.revision)
  order by loc->>'location_id',r.id),'[]') into findings from jsonb_array_elements(payload->'locations') loc
  cross join lateral public.availability_pending_publication((payload->>'workspace_id')::uuid,(loc->>'location_id')::uuid,(payload->>'week_start')::date) r;
 unsigned:=(payload-'fingerprint'-'status')||jsonb_build_object('findings',(payload->'findings')||findings);
 return unsigned||jsonb_build_object('status',case when jsonb_array_length(findings)>0 then 'hard_blocked' else payload->>'status' end,
  'fingerprint',encode(extensions.digest(convert_to(unsigned::text,'UTF8'),'sha256'),'hex'));
end; $$;
revoke all on function public.availability_publication_preflight(jsonb) from public,anon,authenticated,service_role;
-- Preserve both independently implemented authorization/department overloads.
alter function public.preview_schedule_publication_service(uuid,uuid,uuid,uuid[]) rename to preview_schedule_publication_before_availability_review_service;
alter function public.preview_schedule_publication_service(uuid,uuid,uuid,uuid[],uuid[],boolean) rename to preview_schedule_publication_before_availability_review_service;
create function public.preview_schedule_publication_service(actor_user_id uuid,target_workspace_id uuid,target_draft_id uuid,target_location_ids uuid[])
returns jsonb language sql stable security definer set search_path='' as $$
 select public.availability_publication_preflight(public.preview_schedule_publication_before_availability_review_service(actor_user_id,target_workspace_id,target_draft_id,target_location_ids)); $$;
create function public.preview_schedule_publication_service(actor_user_id uuid,target_workspace_id uuid,target_draft_id uuid,target_location_ids uuid[],target_department_ids uuid[],include_no_department boolean)
returns jsonb language sql stable security definer set search_path='' as $$
 select public.availability_publication_preflight(public.preview_schedule_publication_before_availability_review_service(actor_user_id,target_workspace_id,target_draft_id,target_location_ids,target_department_ids,include_no_department)); $$;
revoke all on function public.preview_schedule_publication_service(uuid,uuid,uuid,uuid[]) from public,anon,authenticated;
revoke all on function public.preview_schedule_publication_service(uuid,uuid,uuid,uuid[],uuid[],boolean) from public,anon,authenticated;
grant execute on function public.preview_schedule_publication_service(uuid,uuid,uuid,uuid[]),public.preview_schedule_publication_service(uuid,uuid,uuid,uuid[],uuid[],boolean) to service_role;
revoke all on function public.preview_schedule_publication_before_availability_review_service(uuid,uuid,uuid,uuid[]),public.preview_schedule_publication_before_availability_review_service(uuid,uuid,uuid,uuid[],uuid[],boolean) from service_role;

-- Use the existing transactional relay, policy resolver and inbox projector.
insert into public.notification_catalog(type_key,schema_version,category,severity,sensitivity,supported_channels,default_cadence,
 audience_contract,action_route_contract,dedupe_policy,retention_class,template_key,lifecycle,mandatory_in_app)
select 'availability.'||x.name,1,'requests',case when x.name='review_required' then 'action_required' else 'info' end,
 'confidential',array['in_app'],'immediate','availability_scoped_recipients',jsonb_build_object('route',x.route,'allowed_query_keys','[]'::jsonb),
 '{"scope":"event_recipient","strategy":"keep_first","key_fields":["event_id","recipient_user_id"]}',
 'sensitive_30d','availability.'||x.name||'.v1','active',false
from (values('review_required','/app/employees'),('status_changed','/app/employee-hub/my-availability')) x(name,route);
insert into public.notification_template_versions(type_key,schema_version,channel,locale,template_version,template_key,content,status,published_at)
select type_key,1,'in_app','en',1,template_key,jsonb_build_object('title','Availability updated','body','Review the latest availability details.',
 'safe_preview','Availability updated.','action_url',action_route_contract->>'route'),'published',now()
from public.notification_catalog where type_key in ('availability.review_required','availability.status_changed') and schema_version=1;
insert into public.notification_producer_registry(type_key,schema_version,producer_id,source_migration,source_function)
select type_key,1,'availability_lifecycle_v1','20260909005001_availability_review_lifecycle.sql','availability_notify'
from public.notification_catalog where type_key in ('availability.review_required','availability.status_changed') and schema_version=1;
create function public.availability_notify(r public.availability_requests,actor uuid,event uuid,action_name text) returns void
language plpgsql security definer set search_path='' as $$
declare recipients uuid[]; employee_user uuid; review_needed boolean; c public.employee_onboarding_cases%rowtype;
begin
 select user_id into employee_user from public.employee_profiles where id=r.employee_id and workspace_id=r.workspace_id;
 review_needed:=r.status in ('pending_review','changes_requested') or r.capacity_notice_open;
 if review_needed then
  select coalesce(array_agg(m.user_id order by m.user_id),'{}'::uuid[]) into recipients from public.workspace_memberships m
  where m.workspace_id=r.workspace_id and m.status='active' and m.user_id<>actor and m.user_id is distinct from employee_user
   and m.user_id<>r.author_id and public.availability_actor_scope(m.user_id,r.workspace_id,r.employee_id,true);
  perform public.enqueue_notification_outbox_service(r.workspace_id,event,'availability.review_required',1,actor,'availability_request',r.id::text,
   jsonb_build_object('recipient_user_ids',to_jsonb(recipients),'audience_contract','availability_scoped_recipients','category','request',
    'title','Availability needs a decision','body','Resolve the availability request before publishing its period.','safe_preview','An availability request needs review.',
    'action_url','/app/employees','group_key','availability:'||r.id::text,'request_id',r.id),now());
 end if;
 if employee_user is not null and employee_user<>actor then
  -- A separate deterministic event ID keeps both recipient groups independently retryable.
  perform public.enqueue_notification_outbox_service(r.workspace_id,md5(event::text||':employee')::uuid,'availability.status_changed',1,actor,'availability_request',r.id::text,
   jsonb_build_object('recipient_user_ids',jsonb_build_array(employee_user),'audience_contract','availability_scoped_recipients','category','request',
    'title',case when r.status='awaiting_employee' then 'Confirm your availability' else 'Availability updated' end,
    'body',case when r.status='awaiting_employee' then 'Your manager proposed hours. Review and confirm them.' else 'Review the decision and your effective availability.' end,
    'safe_preview','Availability updated.','action_url','/app/employee-hub/my-availability','group_key','availability:'||r.id::text,'request_id',r.id),now());
 end if;
 if r.source='onboarding' then
  select * into c from public.employee_onboarding_cases where workspace_id=r.workspace_id and employee_id=r.employee_id for update;
  update public.employee_onboarding_requirements set
   status=case when r.status='effective' then 'completed'::public.employee_onboarding_requirement_status
    when r.status in ('denied','changes_requested') then 'rejected'::public.employee_onboarding_requirement_status
    when r.status in ('withdrawn','superseded') then 'not_started'::public.employee_onboarding_requirement_status
    else 'awaiting_review'::public.employee_onboarding_requirement_status end,
   rejection_reason=nullif(r.decision_reason,''),completed_at=case when r.status='effective' then now() else null end,updated_at=now()
  where case_id=c.id and kind='availability';
  update public.employee_onboarding_cases set revision=revision+1,updated_at=now() where id=c.id;
 end if;
end; $$;
revoke all on function public.availability_notify(public.availability_requests,uuid,uuid,text) from public,anon,authenticated,service_role;

-- Generic requirement review must not certify an unapproved capacity proposal.
alter function public.review_employee_onboarding_service(uuid,uuid,uuid,text,uuid,text,integer,boolean) rename to review_employee_onboarding_before_availability_service;
create function public.review_employee_onboarding_service(actor_user_id uuid,target_workspace_id uuid,target_employee_id uuid,
 review_action text,target_requirement_id uuid,review_reason text,expected_revision integer,production_ready boolean)
returns integer language plpgsql security definer set search_path='' as $$
begin
 perform public.get_employee_onboarding_review_service(actor_user_id,target_workspace_id,target_employee_id);
 if review_action in ('accept_requirement','reject_requirement') and exists(select 1 from public.employee_onboarding_requirements q
   where q.id=target_requirement_id and q.workspace_id=target_workspace_id and q.employee_id=target_employee_id and q.kind='availability')
   and exists(select 1 from public.availability_requests r where r.workspace_id=target_workspace_id and r.employee_id=target_employee_id) then
  raise exception 'Review availability in the employee Availability tab so the capacity decision and onboarding stay consistent' using errcode='22023'; end if;
 if review_action='activate' and exists(select 1 from public.availability_requests r where r.workspace_id=target_workspace_id and r.employee_id=target_employee_id
   and r.source='onboarding' and (r.status in ('pending_review','awaiting_employee','changes_requested') or r.capacity_notice_open)) then
  raise exception 'Resolve the onboarding availability request before activation' using errcode='23514'; end if;
 return public.review_employee_onboarding_before_availability_service(actor_user_id,target_workspace_id,target_employee_id,review_action,target_requirement_id,review_reason,expected_revision,production_ready);
end; $$;
revoke all on function public.review_employee_onboarding_service(uuid,uuid,uuid,text,uuid,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.review_employee_onboarding_service(uuid,uuid,uuid,text,uuid,text,integer,boolean) to service_role;
revoke all on function public.review_employee_onboarding_before_availability_service(uuid,uuid,uuid,text,uuid,text,integer,boolean) from public,anon,authenticated,service_role;
