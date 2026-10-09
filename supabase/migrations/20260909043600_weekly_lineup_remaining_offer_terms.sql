-- Keep a manual need's own identity; it is not a guessed Schedule source.
alter table public.lineup_proposals add column weekly_manual_id uuid;

create function public.bind_weekly_lineup_manual_offer_source() returns trigger
language plpgsql security definer set search_path='' as $$
declare entry public.schedule_lineup_entries%rowtype; d date; tz text;
begin
 if new.kind<>'offer' or new.source_state->>'source_shift_id' is not null then return new; end if;
 select * into entry from public.schedule_lineup_entries where workspace_id=new.workspace_id
  and id=(new.source_state->>'id')::uuid and source_shift_id is null;
 if entry.id is null then return new; end if;
 select ln.lineup_date,l.timezone into d,tz from public.schedule_lineups ln
  join public.locations l on l.id=ln.location_id where ln.id=entry.lineup_id and ln.workspace_id=new.workspace_id;
 new.weekly_manual_id:=entry.id;
 new.weekly_whole_source:=coalesce(new.target_location_id=entry.location_id
  and public.lineup_shift_range((new.operation->'target'->>'date')::date,
   (new.operation->'target'->>'start_time')::time,(new.operation->'target'->>'end_time')::time,tz)
   = public.lineup_shift_range(d,entry.start_time,entry.end_time,tz),false);
 return new;
end; $$;
create trigger weekly_lineup_manual_offer_source before insert on public.lineup_proposals
for each row execute function public.bind_weekly_lineup_manual_offer_source();

update public.lineup_proposals p set weekly_manual_id=e.id,
 weekly_whole_source=coalesce(p.target_location_id=e.location_id
  and public.lineup_shift_range((p.operation->'target'->>'date')::date,
   (p.operation->'target'->>'start_time')::time,(p.operation->'target'->>'end_time')::time,l.timezone)
   = public.lineup_shift_range(ln.lineup_date,e.start_time,e.end_time,l.timezone),false)
from public.schedule_lineup_entries e join public.schedule_lineups ln on ln.id=e.lineup_id
 join public.locations l on l.id=e.location_id
where p.workspace_id=e.workspace_id and p.kind='offer' and p.status in ('pending','accepted')
 and p.expires_at>clock_timestamp() and p.source_state->>'source_shift_id' is null
 and e.source_shift_id is null and p.source_state->>'id'=e.id::text;

do $remaining_offer_terms$
declare body text; anchor text;
begin
 body:=pg_get_functiondef('public.refresh_weekly_lineup_offer_terms(uuid,uuid)'::regprocedure);
 anchor:='or not p.weekly_whole_source or p.weekly_source_id is null';
 if position(anchor in body)=0 then raise exception 'Offer refresh source boundary changed'; end if;
 body:=replace(body,anchor,'or (p.weekly_source_id is null and p.weekly_manual_id is null)');
 anchor:=' -- Replacement publications can temporarily contain zero/two physical rows.';
 if position(anchor in body)=0 then raise exception 'Offer source resolver changed'; end if;
 body:=replace(body,anchor,$manual$
 if p.weekly_manual_id is not null then
  select e.id,e.workspace_id,e.location_id,e.employee_id,e.job_id,e.shift_type_id,ln.lineup_date,e.start_time,e.end_time,'explicit',l.timezone
   into s.id,s.workspace_id,s.location_id,s.employee_id,s.job_id,s.shift_type_id,s.scheduled_date,s.start_time,s.end_time,s.time_basis,s.time_timezone
   from public.schedule_lineup_entries e join public.schedule_lineups ln on ln.id=e.lineup_id
   join public.locations l on l.id=e.location_id
   where e.workspace_id=w and e.id=p.weekly_manual_id and e.source_shift_id is null;
  if s.id is null then return; end if;
 else
$manual$||anchor);
 anchor:=' if s.employee_id::text is distinct from p.source_state->>''employee_id''';
 if position(anchor in body)=0 then raise exception 'Offer source responsibility comparison changed'; end if;
 body:=replace(body,anchor,E' end if;\n'||anchor);
 anchor:='where e->>''source_shift_id''=s.id::text and not (e->>''orphaned'')::boolean';
 if position(anchor in body)=0 then raise exception 'Offer model source lookup changed'; end if;
 body:=replace(body,anchor,'where ((p.weekly_manual_id is null and e->>''source_shift_id''=s.id::text) or
  (p.weekly_manual_id is not null and e->>''id''=p.weekly_manual_id::text and e->>''source_shift_id'' is null)) and not (e->>''orphaned'')::boolean');
 anchor:=$target$
 target:=p.operation->'target'||jsonb_build_object('date',s.scheduled_date,'location_id',s.location_id,
  'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'));
 if public.lineup_shift_range(s.scheduled_date,(target->>'start_time')::time,(target->>'end_time')::time,tz)
  is distinct from public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,tz) then return; end if;
$target$;
 if position(anchor in body)=0 then raise exception 'Offer target interval boundary changed'; end if;
 body:=replace(body,anchor,$target$
 target:=p.operation->'target'||jsonb_build_object('date',s.scheduled_date+
  ((p.operation->'target'->>'date')::date-p.source_date),'location_id',s.location_id);
 if p.weekly_whole_source then
  target:=target||jsonb_build_object('date',s.scheduled_date,
   'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'));
  if public.lineup_shift_range(s.scheduled_date,(target->>'start_time')::time,(target->>'end_time')::time,tz)
   is distinct from public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,tz) then return; end if;
 else
  -- A partial offer keeps its clock interval and source-day offset. Never grow
  -- or clip accepted work merely because the surrounding need changed hours.
  if not coalesce(public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,tz) @>
   public.lineup_shift_range((target->>'date')::date,(target->>'start_time')::time,(target->>'end_time')::time,tz),false)
   then return; end if;
 end if;
$target$);
 body:=replace(body,'''source_id'',p.weekly_source_id','''source_id'',coalesce(p.weekly_source_id,p.weekly_manual_id)');
 body:=replace(body,'lower(public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,tz))',
  'lower(public.lineup_shift_range((target->>''date'')::date,(target->>''start_time'')::time,(target->>''end_time'')::time,tz))');
 -- For overnight partial offers the employee's date may differ from the source day.
 body:=replace(body,'loc_name,s.scheduled_date,target->>''start_time''','loc_name,target->>''date'',target->>''start_time''');
 execute body;

 body:=pg_get_functiondef('public.weekly_lineup_accepted_offer(uuid,jsonb)'::regprocedure);
 anchor:='p.weekly_whole_source and p.weekly_source_id is not null';
 if position(anchor in body)=0 then raise exception 'Retained offer history contract changed'; end if;
 body:=replace(body,anchor,'(p.weekly_source_id is not null or p.weekly_manual_id is not null)');
 body:=replace(body,'p.weekly_terms_history->-1->>''source_id''=p.weekly_source_id::text',
  'p.weekly_terms_history->-1->>''source_id''=coalesce(p.weekly_source_id,p.weekly_manual_id)::text');
 anchor:=' return p;';
 if position(anchor in body)=0 then raise exception 'Manual offer identity boundary changed'; end if;
 body:=replace(body,anchor,$identity$
 if p.weekly_manual_id is not null and not exists(select 1 from public.schedule_lineup_entries e
  where e.workspace_id=w and e.id=p.weekly_manual_id and e.source_shift_id is null
   and e.id::text=p.operation->>'source_entry_id') then
  raise exception 'Offer acceptance is not transferable to another need' using errcode='PT409'; end if;
$identity$||anchor);
 execute body;
end; $remaining_offer_terms$;

create function public.refresh_weekly_lineup_offer_terms_after_entry() returns trigger
language plpgsql security definer set search_path='' as $$
declare w uuid; ids uuid[]; sources uuid[]; item record;
begin
 w:=case when tg_op='DELETE' then old.workspace_id else new.workspace_id end;
 if tg_table_name='schedule_lineups' then
  select array_agg(id),array_agg(source_shift_id) into ids,sources from public.schedule_lineup_entries
   where workspace_id=w and lineup_id=new.id;
 else
  ids:=case when tg_op='DELETE' then array[old.id] else array[new.id] end;
  sources:=case when tg_op='DELETE' then array[old.source_shift_id] when tg_op='INSERT' then array[new.source_shift_id]
   else array[old.source_shift_id,new.source_shift_id] end;
 end if;
 for item in select p.id from public.lineup_proposals p where p.workspace_id=w and p.kind='offer'
  and p.status in ('pending','accepted') and (p.weekly_manual_id=any(ids) or p.weekly_source_id in (
   select coalesce(s.source_shift_id,s.id) from public.schedule_published_shifts s where s.workspace_id=w and s.id=any(sources)))
  order by p.id loop
  perform public.refresh_weekly_lineup_offer_terms(w,item.id);
 end loop;
 return null;
end; $$;
create constraint trigger weekly_lineup_offer_entry_terms_changed
after insert or update or delete on public.schedule_lineup_entries deferrable initially deferred
for each row execute function public.refresh_weekly_lineup_offer_terms_after_entry();
create constraint trigger weekly_lineup_offer_day_terms_changed
after update of lineup_date,location_id on public.schedule_lineups deferrable initially deferred
for each row execute function public.refresh_weekly_lineup_offer_terms_after_entry();

-- Repair a deferred refresh skipped while no current manager could resolve the
-- source. Only a real, currently authorized read/command invokes this recovery.
create function public.refresh_weekly_lineup_offers_for_actor(actor uuid,w uuid,employee uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare item record;
begin
 if employee is not null then
  if (public.employee_hub_actor_service(actor,w)).id is distinct from employee then
   raise exception 'Offer access denied' using errcode='42501'; end if;
 elsif not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage') then
  raise exception 'Offer access denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(w::text,921));
 for item in select p.id from public.lineup_proposals p where p.workspace_id=w and p.kind='offer'
  and p.status in ('pending','accepted') and p.expires_at>clock_timestamp()
  and ((employee is not null and p.employee_id=employee) or (employee is null and (
   public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',p.source_location_id)
   or exists(select 1 from public.schedule_published_shifts s join public.schedule_location_publications pub
    on pub.id=s.publication_id and pub.status='current' where s.workspace_id=w
    and coalesce(s.source_shift_id,s.id)=p.weekly_source_id
    and public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',s.location_id))
   or exists(select 1 from public.schedule_lineup_entries e where e.workspace_id=w and e.id=p.weekly_manual_id
    and public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',e.location_id)))))
  order by p.id loop
  perform public.refresh_weekly_lineup_offer_terms(w,item.id);
 end loop;
end; $$;

do $offer_recovery_consumers$
declare body text; anchor text;
begin
 body:=pg_get_functiondef('public.lineup_proposals_service(uuid,uuid,text,jsonb)'::regprocedure);
 anchor:='    emp:=public.employee_hub_actor_service(actor,w);';
 if position(anchor in body)=0 then raise exception 'Employee offer actor boundary changed'; end if;
 body:=replace(body,anchor,anchor||E'\n    perform public.refresh_weekly_lineup_offers_for_actor(actor,w,emp.id);');
 anchor:='  if not public.schedule_actor_has_capability_service(actor,w,''schedule.lineup.manage'') then raise exception ''Line Up manage access denied''; end if;';
 if position(anchor in body)=0 then raise exception 'Manager offer actor boundary changed'; end if;
 body:=replace(body,anchor,anchor||E'\n  if action in (''proposals'',''proposal_action'') then perform public.refresh_weekly_lineup_offers_for_actor(actor,w); end if;');
 execute body;
end; $offer_recovery_consumers$;

revoke all on function public.bind_weekly_lineup_manual_offer_source(),public.refresh_weekly_lineup_offer_terms_after_entry(),
 public.refresh_weekly_lineup_offers_for_actor(uuid,uuid,uuid) from public,anon,authenticated,service_role;
