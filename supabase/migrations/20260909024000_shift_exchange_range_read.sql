-- Generated with Supabase CLI; ordered after the existing 20260909023001 migration.
-- Match either displayed swap date, preserve authorized focused deep links,
-- and avoid repeated source reads within one response. No assignment writes.
-- CREATE OR REPLACE keeps the existing service-only grants and function identity.
CREATE OR REPLACE FUNCTION public.shift_exchanges_read_service(actor uuid, w uuid, manager_view boolean DEFAULT false, from_date date DEFAULT CURRENT_DATE, to_date date DEFAULT (CURRENT_DATE + 42), focused_case_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp public.employee_profiles%rowtype; c public.shift_exchange_cases%rowtype; s jsonb; t jsonb; allowed boolean; mine boolean;
 cases jsonb:='[]'; opportunities jsonb:='[]'; own_shifts jsonb:='[]'; apps jsonb; hist jsonb; chk jsonb; shift_row record; stage text; live_status text; current_published boolean; requested_published boolean; published_cache jsonb:='{}'; source_key text;
begin
 if to_date<from_date or to_date>from_date+62 then raise exception 'Choose a date range up to 62 days'; end if;
 if not exists(select 1 from public.workspace_memberships where workspace_id=w and user_id=actor and status='active') then raise exception 'Active workspace access required' using errcode='42501'; end if;
 select * into emp from public.employee_profiles where workspace_id=w and user_id=actor and archived_at is null;
 if not manager_view and emp.id is null then raise exception 'Employee profile required' using errcode='42501'; end if;
 if manager_view and not public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.read',null) then
  if not exists(select 1 from public.locations l where l.workspace_id=w and public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.read',l.id)) then raise exception 'Manager request access required' using errcode='42501'; end if;
 end if;
 for c in select * from public.shift_exchange_cases x where x.workspace_id=w and (x.status='open' or x.id=focused_case_id
  or (x.offered_snapshot->>'date')::date between from_date and to_date
  or (x.requested_snapshot->>'date')::date between from_date and to_date
  or exists(select 1 from public.schedule_published_shifts p
   join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
   where p.workspace_id=w and coalesce(p.source_shift_id,p.id) in(x.offered_source_id,x.requested_source_id)
   and p.scheduled_date between from_date and to_date)) order by x.expires_at,x.created_at loop
  allowed:=manager_view and (public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.read',(c.offered_snapshot->>'location_id')::uuid) or (c.kind='swap' and public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.read',(c.requested_snapshot->>'location_id')::uuid)));
  mine:=coalesce(c.owner_id=emp.id,false);
  if not allowed and not mine and not exists(select 1 from public.shift_exchange_applications where case_id=c.id and employee_id=emp.id) then continue; end if;
  -- Repeated historical requests refer to the same published source. Resolve
  -- each source once in this read only; no cache survives the function call.
  foreach source_key in array array_remove(array[c.offered_source_id::text,c.requested_source_id::text],null) loop
   if not published_cache ? source_key then
    published_cache:=published_cache||jsonb_build_object(source_key,public.shift_exchange_shift(w,source_key::uuid));
   end if;
  end loop;
  s:=nullif(published_cache->c.offered_source_id::text,'null'::jsonb);
  t:=nullif(published_cache->c.requested_source_id::text,'null'::jsonb);
  current_published:=s is not null;
  requested_published:=t is not null;
  s:=coalesce(s,c.offered_snapshot);
  t:=coalesce(t,c.requested_snapshot);
  -- The list follows the displayed dates on either side. A focused deep link
  -- bypasses only the range, never the actor checks above.
  if c.id is distinct from focused_case_id and not (
   coalesce((s->>'date')::date between from_date and to_date,false)
   or coalesce((t->>'date')::date between from_date and to_date,false)
  ) then continue; end if;
  live_status:=public.shift_exchange_live_status(w,c.id);
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
  cases:=cases||jsonb_build_array(jsonb_build_object('id',c.id,'kind',c.kind,'audience',c.audience,'status',live_status,'current_published',current_published,'requested_current_published',case when c.kind='swap' then requested_published else null end,
   'stage',stage,'revision',c.revision,'created_at',c.created_at,'expires_at',c.expires_at,'owner_id',c.owner_id,'owner_name',c.offered_snapshot->'employee_name',
   'shift',s,'requested_shift',t,'applications',apps,'candidate_count',(select count(*) from public.shift_exchange_applications where case_id=c.id and status in('invited','pending_manager') and live_status='open'),
   'can_manage',allowed and (public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',(c.offered_snapshot->>'location_id')::uuid) or (c.kind='swap' and public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',(c.requested_snapshot->>'location_id')::uuid))),
   'is_owner',mine,'private_note',case when allowed or mine then c.private_note else '' end,'history',hist));
 end loop;
 if not manager_view then
  for shift_row in select p.id from public.schedule_published_shifts p join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
   where p.workspace_id=w and p.scheduled_date between from_date and to_date order by p.scheduled_date,p.start_time loop
   s:=public.shift_exchange_shift(w,shift_row.id);
   if (s->>'starts_at')::timestamptz<=clock_timestamp() then continue; end if;
   if (s->>'employee_id')::uuid=emp.id then own_shifts:=own_shifts||jsonb_build_array(s); continue; end if;
   select * into c from public.shift_exchange_cases where workspace_id=w and offered_source_id=(s->>'source_id')::uuid and status='open' and expires_at>clock_timestamp() and audience='eligible_pool' and kind<>'swap';
   if s->>'employee_id' is not null and c.id is null then continue; end if;
   chk:=public.lineup_candidate_check(w,emp.id,s);
   if chk->>'status'='eligible' and (c.id is null or c.consent_fingerprint=public.shift_exchange_fingerprint(w,s,null)) then
    opportunities:=opportunities||jsonb_build_array(jsonb_build_object('case_id',c.id,'shift',s,'eligibility',chk));
   end if;
  end loop;
 end if;
 return jsonb_build_object('enabled',(select shift_exchanges_enabled from public.workspaces where id=w),'employee_id',emp.id,'cases',cases,'opportunities',opportunities,'own_shifts',own_shifts);
end; $function$;
