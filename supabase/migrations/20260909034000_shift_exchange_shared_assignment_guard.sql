-- A transfer may only amend assignment rows that were already shared. Never
-- silently publish a live placement omitted from the prior shared Line Up.
create or replace function public.shift_exchange_lineup_reconciliation_issue(w uuid, s jsonb)
returns text language plpgsql stable set search_path = '' as $function$
declare shared_entries jsonb;
begin
 if s is null then return null; end if;
 select content->'entries' into shared_entries from public.schedule_lineup_snapshots
 where workspace_id=w and location_id=(s->>'location_id')::uuid
 and lineup_date=(s->>'date')::date order by version_number desc limit 1;
 -- No previous share is an intentionally unpublished Line Up (AT31).
 if not found then return null; end if;
 if jsonb_typeof(shared_entries) is distinct from 'array' then
  return 'The shared Line Up needs review. Review and share its assignments before approving.';
 end if;
 if not exists(select 1 from jsonb_array_elements(shared_entries) e
  where e->>'source_shift_id'=s->>'id' or exists(
   select 1 from public.schedule_published_shifts ps
   where ps.workspace_id=w and ps.id::text=e->>'source_shift_id'
   and coalesce(ps.source_shift_id,ps.id)=(s->>'source_id')::uuid)) then
  return 'This shift is missing from the shared Line Up. Review and share its assignment before approving.';
 end if;
 return null;
end; $function$;
revoke all on function public.shift_exchange_lineup_reconciliation_issue(uuid,jsonb) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.shift_exchange_preview(actor uuid, w uuid, cid uuid, aid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.shift_exchange_cases%rowtype; a public.shift_exchange_applications%rowtype;
 s jsonb; t jsonb; r jsonb; g jsonb; problems text[]:='{}'; loc uuid; scoped boolean:=false; missing boolean:=false; fp text; reconciliation_issue text;
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
 if s->>'time_basis' in ('unresolved','legacy_unverified') or t->>'time_basis' in ('unresolved','legacy_unverified') then problems:=array_append(problems,'Confirm shift hours before approving this exchange'); end if;
 if s is null or (c.kind='swap' and t is null) then problems:=array_append(problems,'The published shift changed or was unpublished'); end if;
 fp:=public.shift_exchange_fingerprint(w,s,t);
 if fp is distinct from c.consent_fingerprint or fp is distinct from a.consent_fingerprint then problems:=array_append(problems,'Shift conditions changed. New employee consent is required'); end if;
 if c.expires_at<=clock_timestamp() or (s->>'starts_at')::timestamptz<=clock_timestamp() or (t->>'starts_at')::timestamptz<=clock_timestamp() then problems:=array_append(problems,'This shift has already started'); end if;
 if exists(select 1 from public.employee_profiles where workspace_id=w and user_id=actor and id in(c.owner_id,a.employee_id)) then problems:=array_append(problems,'A separate manager must approve your own exchange'); end if;
 if s is not null then r:=public.lineup_candidate_check(w,a.employee_id,s,array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null)); end if;
 if r is null then r:='{"status":"ineligible","reasons":["Published shift unavailable"]}'; end if;
 if r->>'status'<>'eligible' then problems:=array_append(problems,'The receiving employee is not eligible for the full shift'); end if;
 if c.kind='swap' and t is not null then
  g:=public.lineup_candidate_check(w,c.owner_id,t,array[(s->>'id')::uuid,(t->>'id')::uuid]::uuid[]);
  if g->>'status'<>'eligible' then problems:=array_append(problems,'The other employee is not eligible for the exchanged shift'); end if;
 end if;
 -- Final approval invokes this same preview again inside its workspace lock.
 reconciliation_issue:=public.shift_exchange_lineup_reconciliation_issue(w,s);
 if reconciliation_issue is not null then problems:=array_append(problems,reconciliation_issue); end if;
 if c.kind='swap' then
  reconciliation_issue:=public.shift_exchange_lineup_reconciliation_issue(w,t);
  if reconciliation_issue is not null and not reconciliation_issue=any(problems) then
   problems:=array_append(problems,reconciliation_issue);
  end if;
 end if;
 for loc in select distinct x from unnest(array[(s->>'location_id')::uuid,(t->>'location_id')::uuid]) x where x is not null loop
  if not public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',loc)
   and not exists(select 1 from public.shift_exchange_votes v where v.case_id=cid and v.application_id=aid and v.location_id=loc and v.fingerprint=fp
   and public.schedule_actor_has_capability_service(v.actor_user_id,w,'schedule.shift_change_requests.manage',loc)
   and not exists(select 1 from public.employee_profiles e where e.workspace_id=w and e.user_id=v.actor_user_id and e.id in(c.owner_id,a.employee_id))) then missing:=true; end if;
 end loop;
 return jsonb_build_object('allowed',cardinality(problems)=0,'fingerprint',fp,'reasons',to_jsonb(problems),'receiver',r,'giver',g,'requires_other_manager',missing,
 'other_applications',(select count(*) from public.shift_exchange_applications where case_id=cid and id<>aid and status in('invited','pending_manager')));
end; $function$;
