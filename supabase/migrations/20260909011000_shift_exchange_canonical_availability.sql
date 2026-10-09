-- Shared Line Up / Shift Hub candidate eligibility consumes the canonical
-- physical-interval assessment. Full-shift exchanges never inherit a Schedule
-- soft-policy override; partial coverage is still useful for Line Up planning.
-- Requires the independently maintained 07001 availability engine.
do $canonical_availability$
declare body text; first_at integer; last_at integer; replacement text;
begin
 perform 'public.assess_shift_availability(uuid,uuid,jsonb)'::regprocedure;
 body:=replace(pg_get_functiondef('public.lineup_candidate_check_exchange_base(uuid,uuid,jsonb,uuid[],integer)'::regprocedure),E'\r\n',E'\n');
 if position('av public.employee_schedule_availability_versions%rowtype;' in body)=0 then
  raise exception 'Candidate availability declaration changed; review integration'; end if;
 body:=replace(body,'av public.employee_schedule_availability_versions%rowtype;','assessment jsonb;');
 first_at:=position('  select * into av from public.employee_schedule_availability_versions' in body);
 last_at:=position('  select coalesce(range_agg(r),''{}''::tstzmultirange) into overlap' in body);
 if first_at=0 or last_at<=first_at then raise exception 'Candidate availability boundaries changed; review integration'; end if;
 replacement:=$block$
  if exists(select 1 from public.employee_profiles where workspace_id=w and id=emp) then
    -- The Line Up descriptor contract uses date. A copied Schedule descriptor
    -- can still contain scheduled_date from before a preview date edit.
    assessment:=public.assess_shift_availability(w,emp,target||jsonb_build_object('scheduled_date',d));
    select coalesce(range_agg(tstzrange((r->>'start_at')::timestamptz,(r->>'end_at')::timestamptz,'[)')),'{}'::tstzmultirange)
      into free from jsonb_array_elements(assessment->'available_intervals') r;
    state:=case
      when exists(select 1 from jsonb_array_elements(assessment->'reasons') r where r->>'code' in ('approved_time_off','invalid_local_time')) then 'ineligible'
      when assessment->>'coverage'='none' then 'ineligible'
      when assessment->>'operation'='verification_required' or assessment->>'coverage'='unknown' then 'verification_required'
      when assessment->>'coverage'='partial' then 'partial'
      else 'eligible' end;
    reasons:=reasons||array(select r->>'message' from jsonb_array_elements(assessment->'reasons') r);
  end if;
$block$;
 body:=left(body,first_at-1)||replacement||substr(body,last_at);
 -- Approved leave is already assessed using its saved/request location timezone.
 -- Keep only published shifts and extra daily assignments in the busy union.
 first_at:=position(E'    union all\n    select case when seg.start_time is null' in body);
 last_at:=position(E'\n  ) busy where r && span;' in body);
 if first_at=0 or last_at<=first_at then raise exception 'Candidate leave union changed; review integration'; end if;
 body:=left(body,first_at-1)||substr(body,last_at);
 execute body;
end;
$canonical_availability$;
