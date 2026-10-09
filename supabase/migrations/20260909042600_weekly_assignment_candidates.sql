-- Private, staged Line Up / Exchange adapter. Eligibility is not consent:
-- callers must apply the actor-specific warning and acceptance contract before
-- switching their writes. Do not return the private assessment to employees.
-- Keep existing consumers unchanged until those adapters are connected.
do $weekly_candidates$
declare body text; first_at integer; last_at integer; anchor text;
begin
 body:=replace(pg_get_functiondef('public.lineup_candidate_check_exchange_base(uuid,uuid,jsonb,uuid[],integer)'::regprocedure),E'\r\n',E'\n');
 anchor:='CREATE OR REPLACE FUNCTION public.lineup_candidate_check_exchange_base(';
 if position(anchor in body)<>1 then raise exception 'Candidate function declaration changed'; end if;
 body:=replace(body,anchor,'CREATE FUNCTION public.weekly_assignment_candidate_base(');
 anchor:='coalesce(nullif(target->>''time_timezone'',''''),timezone)';
 if position(anchor in body)=0 then raise exception 'Candidate timezone resolution changed'; end if;
 body:=replace(body,anchor,'coalesce(nullif(target->>''time_timezone'',''''),nullif(target->''time_snapshot''->>''timezone'',''''),timezone)');
 first_at:=position('  if exists(select 1 from public.employee_profiles where workspace_id=w and id=emp) then' in body);
 last_at:=position('  select coalesce(range_agg(r),''{}''::tstzmultirange) into overlap' in body);
 if first_at=0 or last_at<=first_at then raise exception 'Candidate assessment boundaries changed'; end if;
 if position('public.assess_shift_availability(' in substr(body,first_at,last_at-first_at))=0 then
  raise exception 'Candidate assessment implementation changed'; end if;
 body:=left(body,first_at-1)||$assessment$
  if exists(select 1 from public.employee_profiles where workspace_id=w and id=emp) then
    -- Line Up edits date, even when a copied descriptor has scheduled_date.
    assessment:=public.assess_weekly_shift_availability(w,emp,target||jsonb_build_object('scheduled_date',d));
    -- Preferences never shorten the requested assignment. Hard blockers remain
    -- in status/reasons; the private assessment carries the separate warning.
    if assessment->>'operation' in ('allowed','warning_requires_override') then
      select coalesce(range_agg(tstzrange((r->>'start_at')::timestamptz,(r->>'end_at')::timestamptz,'[)')),'{}'::tstzmultirange)
        into free from jsonb_array_elements(assessment->'intervals') r;
    end if;
    state:=case assessment->>'operation'
      when 'blocked' then 'ineligible'
      when 'verification_required' then 'verification_required'
      else 'eligible' end;
    reasons:=reasons||array(select r->>'message' from jsonb_array_elements(assessment->'reasons') r
      where r->>'code'<>'availability');
  end if;
$assessment$||substr(body,last_at);
 anchor:='  if cardinality(reasons)=0 then reasons:=array[''Position and location match'',''Available for the full interval'',''No conflicts'']; end if;';
 if position(anchor in body)=0 then raise exception 'Candidate success reasons changed'; end if;
 body:=replace(body,anchor,$reasons$
  if cardinality(reasons)=0 then
    reasons:=case when coalesce((assessment->>'has_availability_conflict')::boolean,false)
      then array['Position and location match','No assignment blockers']
      else array['Position and location match','Available for the full interval','No conflicts'] end;
  end if;
$reasons$);
 anchor:='''employee_id'',emp,''status'',state,''reasons'',to_jsonb(reasons),';
 if position(anchor in body)=0 then raise exception 'Candidate result changed'; end if;
 body:=replace(body,anchor,anchor||'''availability'',assessment,');
 execute body;

 -- Retain the full-interval employment, active access and unresolved-time
 -- checks in the existing Exchange wrapper, not just its Line Up base.
 body:=pg_get_functiondef('public.lineup_candidate_check(uuid,uuid,jsonb,uuid[],integer)'::regprocedure);
 anchor:='CREATE OR REPLACE FUNCTION public.lineup_candidate_check(';
 if position(anchor in body)<>1 or position('public.lineup_candidate_check_exchange_base(w,emp,target,excluded,travel_minutes)' in body)=0 then
  raise exception 'Candidate wrapper changed'; end if;
 body:=replace(body,anchor,'CREATE FUNCTION public.weekly_assignment_candidate_check(');
 body:=replace(body,'public.lineup_candidate_check_exchange_base(w,emp,target,excluded,travel_minutes)',
  'public.weekly_assignment_candidate_base(w,emp,target,excluded,travel_minutes)');
 anchor:='coalesce(nullif(target->>''time_timezone'',''''),l.timezone)';
 if position(anchor in body)=0 then raise exception 'Candidate employment timezone resolution changed'; end if;
 body:=replace(body,anchor,'coalesce(nullif(target->>''time_timezone'',''''),nullif(target->''time_snapshot''->>''timezone'',''''),l.timezone)');
 execute body;
end;
$weekly_candidates$;
revoke all on function public.weekly_assignment_candidate_base(uuid,uuid,jsonb,uuid[],integer),
 public.weekly_assignment_candidate_check(uuid,uuid,jsonb,uuid[],integer) from public,anon,authenticated,service_role;
