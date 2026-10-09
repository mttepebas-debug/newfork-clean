-- C2 (EKRAN-02 #78, #79; KARARLAR "Takas inceleme penceresi H2", uyarı kutuları):
-- the swap review draws a box for a rule on both shifts when it fails on one:
-- orange where it fails ("8 h of rest / 10 h needed"), green where it holds
-- ("12 h of rest / 10 h needed"). The green value is measured, never guessed
-- (ILKELER P11), so app_private.eligibility reports the nearest rest and
-- travel gaps it measured, and the rules, when ctx asks with_measures; only
-- the manager's decision preview (shift_exchange_preview) asks. Every other
-- caller reads the same answer as before.
-- Test: eligibility_matrix.test.sql (C2 cells).

create or replace function app_private.eligibility(w uuid, emp uuid, shift jsonb, ctx jsonb default '{}')
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare
 op text:=ctx->>'operation';
 excluded uuid[]:=array(select value::uuid from jsonb_array_elements_text(
  case when jsonb_typeof(ctx->'excluded')='array' then ctx->'excluded' else '[]'::jsonb end) where value is not null);
 consent jsonb:=ctx->'consent';
 loc uuid:=(shift->>'location_id')::uuid; d date:=(shift->>'date')::date;
 tz text; span tstzrange; a jsonb; leave jsonb; settings public.workspace_scheduling_settings%rowtype;
 blockers jsonb:='[]'; acks jsonb:='[]'; flags jsonb:='[]'; shortens boolean:=false; r jsonb;
 travel numeric; rest numeric; gap numeric; n record; near numeric; near_travel numeric;
begin
 if op is null or op not in ('swap','release_pickup','open_pickup','cover_accept') then
  raise exception 'Unknown exchange operation' using errcode='22023'; end if;
 if nullif(shift->>'start_time','') is null or nullif(shift->>'end_time','') is null then
  return jsonb_build_object('employee_id',emp,'operation',op,'eligible',false,'status','verification_required',
   'blockers',jsonb_build_array(jsonb_build_object('code','hours_unconfirmed','message','A manager must confirm the shift hours before a full-shift exchange')),
   'acknowledgements','[]'::jsonb,'approval_flags','[]'::jsonb,'approvals_required',jsonb_build_array(loc),'shortens_time_off',false,
   'reasons',jsonb_build_array('A manager must confirm the shift hours before a full-shift exchange'));
 end if;
 select coalesce(nullif(shift->>'time_timezone',''),nullif(shift->'time_snapshot'->>'timezone',''),l.timezone) into tz
  from public.locations l where l.id=loc and l.workspace_id=w and l.archived_at is null;
 if tz is null then raise exception 'location not found'; end if;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 span:=app_private.shift_time_range(d,(shift->>'start_time')::time,(shift->>'end_time')::time,tz);

 if not exists(select 1 from public.employee_profiles e join public.workspace_memberships m
  on m.workspace_id=e.workspace_id and m.user_id=e.user_id and m.status='active' where e.workspace_id=w and e.id=emp) then
  blockers:=blockers||jsonb_build_array(jsonb_build_object('code','workspace_access','message','Active workspace access is required')); end if;
 if not exists(select 1 from public.employee_location_assignments x where x.workspace_id=w and x.employee_id=emp and x.location_id=loc
  and x.assigned_at<=lower(span) and (x.ended_at is null or x.ended_at>=upper(span))) then
  blockers:=blockers||jsonb_build_array(jsonb_build_object('code','location_assignment','message','Not assigned to this location')); end if;
 if not exists(select 1 from public.employee_job_assignments x where x.workspace_id=w and x.employee_id=emp and x.job_id=(shift->>'job_id')::uuid
  and x.assigned_at<=lower(span) and (x.ended_at is null or x.ended_at>=upper(span))) then
  blockers:=blockers||jsonb_build_array(jsonb_build_object('code','job_assignment','message','Not eligible for this position')); end if;
 -- Documents stay as they are today (out of scope 2): an expired blocking document,
 -- and any document rule the conflict settings raise, below.
 if public.employee_has_hard_document_schedule_conflict_service(w,emp,d) then
  blockers:=blockers||jsonb_build_array(jsonb_build_object('code','document_expired','message','Required document is expired')); end if;

 -- The assessment reads the shift the way Schedule does; '_shift_exchange'
 -- keeps travel and rest out of it, they are flags here (D7).
 a:=public.assess_weekly_shift_availability(w,emp,shift||jsonb_build_object('scheduled_date',d,
  '_exclude_shift_ids',to_jsonb(excluded),'_shift_exchange',true));
 for r in select value from jsonb_array_elements(a->'reasons') loop
  if r->>'code' not in ('availability','note','approved_time_off') and not blockers @> jsonb_build_array(jsonb_build_object('code',r->>'code')) then
   blockers:=blockers||jsonb_build_array(jsonb_build_object('code',r->>'code','message',r->>'message')); end if;
 end loop;
 -- Approved time off: only the person's own consent sets it aside (BL-182), and
 -- only for the hours they agreed to; a cover search never passes consent (D1).
 leave:=public.time_off_leave_intervals(a);
 if jsonb_array_length(leave)>0 then
  if consent='true'::jsonb or (jsonb_typeof(consent)='array'
   and public.availability_json_ranges(consent) @> public.availability_json_ranges(leave)) then
   shortens:=true;
   acks:=acks||jsonb_build_array(jsonb_build_object('code','approved_time_off','intervals',leave));
  else
   blockers:=blockers||jsonb_build_array(jsonb_build_object('code','approved_time_off','message',
    (select x->>'message' from jsonb_array_elements(a->'reasons') x where x->>'code'='approved_time_off' limit 1)));
  end if;
 end if;
 if coalesce((a->>'has_availability_conflict')::boolean,false) and jsonb_array_length(coalesce(a->'employee_intervals','[]'))>0 then
  acks:=acks||jsonb_build_array(jsonb_build_object('code','availability','intervals',a->'employee_intervals'));
  flags:=flags||jsonb_build_array(jsonb_build_object('code','availability_consent'));
 end if;
 if jsonb_array_length(coalesce(a->'manager_intervals','[]'))>0 then
  flags:=flags||jsonb_build_array(jsonb_build_object('code','manager_note')); end if;

 -- Travel and rest, measured against the person's other published shifts (D7).
 for n in select p.location_id,app_private.shift_time_range(p.scheduled_date,p.start_time,p.end_time,coalesce(p.time_timezone,l.timezone)) r
  from public.schedule_published_shifts p join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
  join public.locations l on l.id=p.location_id
  where p.workspace_id=w and p.employee_id=emp and p.scheduled_date between d-2 and d+2
   and not p.id=any(excluded) and not coalesce(p.source_shift_id,p.id)=any(excluded)
 loop
  if n.r && span then continue; end if;
  gap:=extract(epoch from greatest(lower(span)-upper(n.r),lower(n.r)-upper(span)))/60;
  near:=least(coalesce(near,gap),gap);
  if n.location_id<>loc then near_travel:=least(coalesce(near_travel,gap),gap); end if;
  if n.location_id<>loc and gap<settings.minimum_travel_minutes then travel:=least(coalesce(travel,gap),gap); end if;
  if gap<settings.minimum_rest_minutes then rest:=least(coalesce(rest,gap),gap); end if;
 end loop;
 if travel is not null then flags:=flags||jsonb_build_array(jsonb_build_object('code','minimum_travel',
  'gap_minutes',travel::integer,'rule_minutes',settings.minimum_travel_minutes)); end if;
 if rest is not null then flags:=flags||jsonb_build_array(jsonb_build_object('code','minimum_rest',
  'gap_minutes',rest::integer,'rule_minutes',settings.minimum_rest_minutes)); end if;

 return jsonb_build_object('employee_id',emp,'operation',op,'eligible',jsonb_array_length(blockers)=0,
  'status',case when jsonb_array_length(blockers)=0 then 'eligible' else 'ineligible' end,
  'blockers',blockers,'acknowledgements',acks,'approval_flags',flags,'approvals_required',jsonb_build_array(loc),
  'shortens_time_off',shortens,
  'reasons',case when jsonb_array_length(blockers)=0 then '["Position and location match","No assignment blockers"]'::jsonb
   else (select jsonb_agg(b->>'message') from jsonb_array_elements(blockers) b) end)
  ||case when coalesce((ctx->>'with_assessment')::boolean,false) then jsonb_build_object('assessment',a) else '{}'::jsonb end
  -- C2: the swap review names the rule that holds too ("12 h of rest / 10 h needed").
  ||case when coalesce((ctx->>'with_measures')::boolean,false) then jsonb_build_object('measures',jsonb_build_object(
   'rest_gap_minutes',near::integer,'travel_gap_minutes',near_travel::integer,
   'rest_rule_minutes',settings.minimum_rest_minutes,'travel_rule_minutes',settings.minimum_travel_minutes)) else '{}'::jsonb end;
end;
$$;

CREATE OR REPLACE FUNCTION public.shift_exchange_preview(actor uuid, w uuid, cid uuid, aid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.shift_exchange_cases%rowtype; a public.shift_exchange_applications%rowtype;
 s jsonb; t jsonb; r jsonb; g jsonb; problems text[]:='{}'; loc uuid; scoped boolean:=false; missing boolean:=false; fp text;
begin
 select * into c from public.shift_exchange_cases where workspace_id=w and id=cid;
 if c.id is null then raise exception 'Request not found' using errcode='P0002'; end if;
 s:=public.shift_exchange_shift(w,c.offered_source_id); t:=public.shift_exchange_shift(w,c.requested_source_id);
 for loc in select distinct x from unnest(array[(c.offered_snapshot->>'location_id')::uuid,(c.requested_snapshot->>'location_id')::uuid]) x where x is not null loop
  scoped:=scoped or app_private.authz_reason(actor,w,'exchange.approve',array[loc]) is null;
 end loop;
 if not scoped then perform app_private.authorize(actor,w,'exchange.approve',array[(c.offered_snapshot->>'location_id')::uuid]); end if;
 select * into a from public.shift_exchange_applications where workspace_id=w and case_id=cid and id=aid;
 if a.id is null then raise exception 'Application not found' using errcode='P0002'; end if;
 if c.status<>'open' or a.status<>'pending_manager' then problems:=array_append(problems,'This request is no longer ready for approval'); end if;
 if s is null or (c.kind='swap' and t is null) then problems:=array_append(problems,'The published shift changed or was unpublished'); end if;
 fp:=public.shift_exchange_fingerprint(w,s,t);
 if fp is distinct from c.consent_fingerprint or fp is distinct from a.consent_fingerprint then problems:=array_append(problems,'Shift conditions changed. New employee consent is required'); end if;
 if c.expires_at<=clock_timestamp() or (s->>'starts_at')::timestamptz<=clock_timestamp() or (t->>'starts_at')::timestamptz<=clock_timestamp() then problems:=array_append(problems,'This shift has already started'); end if;
 if exists(select 1 from public.employee_profiles where workspace_id=w and user_id=actor and id in(c.owner_id,a.employee_id)) then problems:=array_append(problems,'A separate manager must approve your own exchange');
 -- D3: a peer manager reads the case and cannot decide it.
 elsif not exists(select 1 from unnest(array_remove(array[(c.offered_snapshot->>'location_id')::uuid,(c.requested_snapshot->>'location_id')::uuid],null)) x
  where app_private.exchange_decision_reason(actor,w,c.owner_id,a.employee_id,x) is null) then
  problems:=array_append(problems,'Someone with a higher role must approve this exchange'); end if;
 if s is not null then r:=app_private.eligibility(w,a.employee_id,s,jsonb_build_object('operation',case when c.kind in ('swap','open_pickup') then c.kind when c.audience='direct' then 'cover_accept' else 'release_pickup' end,'consent',a.time_off_consent,'excluded',to_jsonb(array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null)),'with_measures',true)); end if;
 if r is null then r:='{"status":"ineligible","reasons":["Published shift unavailable"]}'; end if;
 if r->>'status'<>'eligible' then problems:=array_append(problems,'The receiving employee is not eligible for the full shift'); end if;
 if c.kind='swap' and t is not null then
  g:=app_private.eligibility(w,c.owner_id,t,jsonb_build_object('operation','swap','consent',c.owner_time_off_consent,'excluded',jsonb_build_array(s->>'id',t->>'id'),'with_measures',true));
  if g->>'status'<>'eligible' then problems:=array_append(problems,'The other employee is not eligible for the exchanged shift'); end if;
 end if;
 for loc in select distinct x from unnest(array[(s->>'location_id')::uuid,(t->>'location_id')::uuid]) x where x is not null loop
  if app_private.exchange_decision_reason(actor,w,c.owner_id,a.employee_id,loc) is not null
   and not exists(select 1 from public.shift_exchange_votes v where v.case_id=cid and v.application_id=aid and v.location_id=loc and v.fingerprint=fp
   and app_private.exchange_decision_reason(v.actor_user_id,w,c.owner_id,a.employee_id,loc) is null
   and not exists(select 1 from public.employee_profiles e where e.workspace_id=w and e.user_id=v.actor_user_id and e.id in(c.owner_id,a.employee_id))) then missing:=true; end if;
 end loop;
 return jsonb_build_object('allowed',cardinality(problems)=0,'fingerprint',fp,'reasons',to_jsonb(problems),'receiver',r,'giver',g,'requires_other_manager',missing,
 'other_applications',(select count(*) from public.shift_exchange_applications where case_id=cid and id<>aid and status in('invited','pending_manager')));
end; $function$;
