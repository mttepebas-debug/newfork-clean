-- Full published-shift offers follow their stable Schedule responsibility.
-- Original employee responses remain immutable; this private history explains
-- which later terms can reuse that response. Partial/manual offers stay explicit.
alter table public.lineup_proposals
 add column weekly_source_id uuid,
 add column weekly_whole_source boolean not null default false,
 add column weekly_terms_history jsonb not null default '[]';

create function public.bind_weekly_lineup_offer_source() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.schedule_published_shifts%rowtype; tz text;
begin
 if new.kind<>'offer' or new.source_state->>'source_shift_id' is null then return new; end if;
 select * into s from public.schedule_published_shifts where workspace_id=new.workspace_id
  and id=(new.source_state->>'source_shift_id')::uuid;
 if s.id is null then return new; end if;
 new.weekly_source_id:=coalesce(s.source_shift_id,s.id);
 select timezone into tz from public.locations where workspace_id=new.workspace_id and id=s.location_id;
 new.weekly_whole_source:=coalesce(s.time_basis<>'legacy_unverified' and s.start_time is not null and s.end_time is not null
  and new.target_location_id=s.location_id
  and public.lineup_shift_range((new.operation->'target'->>'date')::date,
   (new.operation->'target'->>'start_time')::time,(new.operation->'target'->>'end_time')::time,tz)
   = public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,coalesce(s.time_timezone,tz)),false);
 return new;
end; $$;
create trigger weekly_lineup_offer_source before insert on public.lineup_proposals
for each row execute function public.bind_weekly_lineup_offer_source();

-- Existing offers receive only a source binding, never a fabricated response.
update public.lineup_proposals p set weekly_source_id=coalesce(s.source_shift_id,s.id),
 weekly_whole_source=coalesce(s.time_basis<>'legacy_unverified' and s.start_time is not null and s.end_time is not null
  and p.target_location_id=s.location_id
  and public.lineup_shift_range((p.operation->'target'->>'date')::date,
   (p.operation->'target'->>'start_time')::time,(p.operation->'target'->>'end_time')::time,l.timezone)
   = public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,coalesce(s.time_timezone,l.timezone)),false)
from public.schedule_published_shifts s join public.locations l on l.id=s.location_id
where p.workspace_id=s.workspace_id and p.kind='offer' and p.status in ('pending','accepted')
 and p.expires_at>clock_timestamp() and p.source_state->>'source_shift_id'=s.id::text;

create function public.refresh_weekly_lineup_offer_terms(w uuid,pid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.lineup_proposals%rowtype; s public.schedule_published_shifts%rowtype;
 actor uuid; model jsonb; src jsonb; target jsonb; op jsonb; tz text; loc_name text;
 history jsonb; term_change boolean; deadline timestamptz; sequence integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(w::text,921));
 select * into p from public.lineup_proposals where workspace_id=w and id=pid for update;
 if p.id is null or p.kind<>'offer' or not p.weekly_whole_source or p.weekly_source_id is null
  or p.status not in ('pending','accepted') or p.expires_at<=clock_timestamp() then return; end if;
 -- Replacement publications can temporarily contain zero/two physical rows.
 if (select count(*) from public.schedule_published_shifts candidate join public.schedule_location_publications pub
  on pub.id=candidate.publication_id and pub.status='current'
  where candidate.workspace_id=w and coalesce(candidate.source_shift_id,candidate.id)=p.weekly_source_id)<>1 then return; end if;
 select candidate.* into s from public.schedule_published_shifts candidate join public.schedule_location_publications pub
  on pub.id=candidate.publication_id and pub.status='current'
  where candidate.workspace_id=w and coalesce(candidate.source_shift_id,candidate.id)=p.weekly_source_id;
 if s.employee_id::text is distinct from p.source_state->>'employee_id'
  or s.job_id::text is distinct from p.source_state->>'job_id'
  or s.shift_type_id::text is distinct from p.source_state->>'shift_type_id'
  or p.employee_id::text is distinct from p.operation->>'employee_id'
  or s.time_basis='legacy_unverified' or s.start_time is null or s.end_time is null then return; end if;
 select timezone,name into tz,loc_name from public.locations where workspace_id=w and id=s.location_id and archived_at is null;
 -- Do not silently reinterpret saved physical hours in a changed location clock.
 if tz is null or coalesce(s.time_timezone,tz)<>tz then return; end if;
 select m.user_id into actor from public.workspace_memberships m where m.workspace_id=w and m.status='active'
  and public.schedule_actor_has_capability_service(m.user_id,w,'schedule.lineup.manage',s.location_id)
  and public.schedule_actor_can_publish_service(m.user_id,w,s.location_id)
  order by (m.user_id=p.created_by) desc,m.user_id limit 1;
 if actor is null then return; end if;
 model:=public.get_schedule_lineup_service(actor,w,s.scheduled_date,array[s.location_id],null);
 select e into src from jsonb_array_elements(model->'locations') l cross join lateral jsonb_array_elements(l->'entries') e
  where e->>'source_shift_id'=s.id::text and not (e->>'orphaned')::boolean
   and not (e->>'hidden')::boolean and not (e->>'call_off')::boolean;
 if src is null or src->>'employee_id' is distinct from p.source_state->>'employee_id'
  or src->>'job_id' is distinct from p.source_state->>'job_id'
  or src->>'shift_type_id' is distinct from p.source_state->>'shift_type_id' then return; end if;
 target:=p.operation->'target'||jsonb_build_object('date',s.scheduled_date,'location_id',s.location_id,
  'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'));
 if public.lineup_shift_range(s.scheduled_date,(target->>'start_time')::time,(target->>'end_time')::time,tz)
  is distinct from public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,tz) then return; end if;
 if s.location_id<>p.target_location_id then target:=target||jsonb_build_object('section_id',null,'station',''); end if;
 op:=p.operation||jsonb_build_object('source_entry_id',src->'id','target',target);
 if op=p.operation and src=p.source_state then return; end if;
 term_change:=target is distinct from p.operation->'target';
 deadline:=least(p.expires_at,lower(public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,tz)));
 history:=jsonb_build_object('at',clock_timestamp(),'before_operation',p.operation,'after_operation',op,
  'before_source',p.source_state,'after_source',src,'employee_acceptance',p.employee_acceptance,
  'acceptance_retained',p.status='accepted','source_id',p.weekly_source_id);
 sequence:=jsonb_array_length(p.weekly_terms_history)+1;
 update public.lineup_proposals set operation=op,source_state=src,source_date=s.scheduled_date,
  source_location_id=s.location_id,target_location_id=s.location_id,expires_at=deadline,
  weekly_terms_history=weekly_terms_history||jsonb_build_array(history)
  where id=pid;
 -- A re-publication/placement-only refresh needs no duplicate terms notice.
 if term_change then
  insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key)
  select w,m.user_id,'schedule','Shift offer details changed',
   format('%s, %s, %s-%s (%s). %s',loc_name,s.scheduled_date,target->>'start_time',target->>'end_time',tz,
    case when deadline<=clock_timestamp() then 'This offer has expired. Your Schedule has not changed.'
     when p.status='accepted' then 'Your existing acceptance remains valid. Final manager approval is still required.'
     else 'Review the updated offer before responding. Your Schedule has not changed.' end),
   '/app/employee-hub/lineup?staffing_offer='||pid::text,'lineup_proposal',pid,'terms_employee:'||sequence
  from public.workspace_memberships m join public.employee_profiles e on e.workspace_id=m.workspace_id and e.user_id=m.user_id
  where m.workspace_id=w and m.status='active' and e.id=p.employee_id and e.archived_at is null;
  insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key)
  select w,m.user_id,'schedule','Shift offer details changed',
   format('%s, %s, %s-%s (%s). %s',loc_name,s.scheduled_date,target->>'start_time',target->>'end_time',tz,
    case when deadline<=clock_timestamp() then 'This offer has expired without an assignment.'
     when p.status='accepted' then 'Employee acceptance is retained. Review current staffing before final approval.'
     else 'The employee has not accepted yet.' end),
   '/app/schedule/lineup?date='||s.scheduled_date::text||'&location='||s.location_id::text,'lineup_proposal',pid,'terms_manager:'||sequence
  from public.workspace_memberships m where m.workspace_id=w and m.status='active'
   and public.schedule_actor_has_capability_service(m.user_id,w,'schedule.lineup.manage',s.location_id)
   and public.schedule_actor_can_publish_service(m.user_id,w,s.location_id);
  perform public.lineup_staffing_sync_notifications(w);
 end if;
 perform realtime.send(jsonb_build_object('workspace_id',w),'changed','shift-exchanges:'||w::text,false);
end; $$;

create function public.refresh_weekly_lineup_offer_terms_after_publication() returns trigger
language plpgsql security definer set search_path='' as $$
declare w uuid; sources uuid[]; item record;
begin
 w:=case when tg_op='DELETE' then old.workspace_id else new.workspace_id end;
 if tg_table_name='schedule_published_shifts' then
  sources:=case when tg_op='DELETE' then array[coalesce(old.source_shift_id,old.id)]
   when tg_op='INSERT' then array[coalesce(new.source_shift_id,new.id)]
   else array[coalesce(old.source_shift_id,old.id),coalesce(new.source_shift_id,new.id)] end;
 else
  select array_agg(coalesce(source_shift_id,id)) into sources from public.schedule_published_shifts
   where workspace_id=w and publication_id=new.id;
 end if;
 for item in select id from public.lineup_proposals where workspace_id=w and kind='offer'
  and status in ('pending','accepted') and weekly_source_id=any(sources) order by id loop
  perform public.refresh_weekly_lineup_offer_terms(w,item.id);
 end loop;
 return null;
end; $$;
create constraint trigger weekly_lineup_offer_shift_terms_changed
after insert or update or delete on public.schedule_published_shifts deferrable initially deferred
for each row execute function public.refresh_weekly_lineup_offer_terms_after_publication();
create constraint trigger weekly_lineup_offer_publication_terms_changed
after update on public.schedule_location_publications deferrable initially deferred
for each row execute function public.refresh_weekly_lineup_offer_terms_after_publication();

do $offer_terms_consumers$
declare body text; anchor text;
begin
 body:=pg_get_functiondef('public.weekly_lineup_accepted_offer(uuid,jsonb)'::regprocedure);
 anchor:=' return p;';
 if position(anchor in body)=0 then raise exception 'Offer source identity boundary changed'; end if;
 body:=replace(body,anchor,$identity$
 if p.weekly_source_id is not null and not exists(select 1 from public.schedule_published_shifts s
  join public.schedule_location_publications pub on pub.id=s.publication_id and pub.status='current'
  where s.workspace_id=w and s.id=(p.source_state->>'source_shift_id')::uuid
   and coalesce(s.source_shift_id,s.id)=p.weekly_source_id) then
  raise exception 'Offer acceptance is not transferable to another responsibility' using errcode='PT409'; end if;
$identity$||anchor);
 anchor:='or p.employee_acceptance->''target'' is distinct from p.operation->''target''';
 if position(anchor in body)=0 then raise exception 'Offer acceptance target boundary changed'; end if;
 body:=replace(body,anchor,$retained$
  or (p.employee_acceptance->'target' is distinct from p.operation->'target' and not coalesce((
   p.weekly_whole_source and p.weekly_source_id is not null
   and p.weekly_terms_history->-1->'employee_acceptance'=p.employee_acceptance
   and p.weekly_terms_history->-1->'after_operation'=p.operation
   and p.weekly_terms_history->-1->>'source_id'=p.weekly_source_id::text
   and p.weekly_terms_history->-1->>'acceptance_retained'='true'),false))
$retained$);
 execute body;

 body:=pg_get_functiondef('public.lineup_staffing_enqueue_notification(uuid)'::regprocedure);
 anchor:='if p.id is null or n.event_key not in(''requested'',''accepted'',''declined'',''cancelled'',''coverage_filled'') then return null; end if;';
 if position(anchor in body)=0 then raise exception 'Staffing enqueue event boundary changed'; end if;
 body:=replace(body,anchor,'if p.id is null or (n.event_key not in(''requested'',''accepted'',''declined'',''cancelled'',''coverage_filled'') and n.event_key not like ''terms_employee:%'' and n.event_key not like ''terms_manager:%'') then return null; end if;');
 body:=replace(body,'n.event_key in(''requested'',''accepted'')','(n.event_key in(''requested'',''accepted'') or n.event_key like ''terms_%'')');
 body:=replace(body,'n.event_key in(''accepted'',''declined'')','(n.event_key in(''accepted'',''declined'') or n.event_key like ''terms_manager:%'')');
 execute body;

 body:=pg_get_functiondef('public.lineup_staffing_notification_allowed(uuid,uuid)'::regprocedure);
 anchor:='  if n.event_key in(''requested'',''coverage_filled'',''cancelled'') then';
 if position(anchor in body)=0 then raise exception 'Staffing delivery audience boundary changed'; end if;
 body:=replace(body,anchor,$audience$
  if n.event_key like 'terms_employee:%' or n.event_key like 'terms_manager:%' then
   if p.status not in ('pending','accepted') then return false; end if;
   if n.event_key like 'terms_employee:%' then return person is not null and person=p.employee_id; end if;
   return o.payload->>'location_id'=p.target_location_id::text
    and public.schedule_actor_has_capability_service(recipient,o.workspace_id,'schedule.lineup.manage',p.target_location_id)
    and public.schedule_actor_can_publish_service(recipient,o.workspace_id,p.target_location_id);
  end if;
$audience$||anchor);
 execute body;
end; $offer_terms_consumers$;

revoke all on function public.bind_weekly_lineup_offer_source(),public.refresh_weekly_lineup_offer_terms(uuid,uuid),
 public.refresh_weekly_lineup_offer_terms_after_publication() from public,anon,authenticated,service_role;
