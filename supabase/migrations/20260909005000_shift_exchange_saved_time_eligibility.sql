-- The canonical shift's saved timezone drives eligibility, not a later location edit.
do $times$
declare body text;
begin
 body:=pg_get_functiondef('public.lineup_candidate_check_exchange_base(uuid,uuid,jsonb,uuid[],integer)'::regprocedure);
 body:=replace(body,'select timezone into tz from public.locations','select coalesce(nullif(target->>''time_timezone'',''''),timezone) into tz from public.locations');
 body:=replace(body,'public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,l.timezone)','public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,coalesce(s.time_timezone,l.timezone))');
 execute body;
 body:=pg_get_functiondef('public.lineup_candidate_check(uuid,uuid,jsonb,uuid[],integer)'::regprocedure);
 body:=replace(body,'begin','begin
 if target->>''time_basis'' in (''unresolved'',''legacy_unverified'') or nullif(target->>''start_time'','''') is null or nullif(target->>''end_time'','''') is null then
  return jsonb_build_object(''employee_id'',emp,''status'',''verification_required'',''reasons'',jsonb_build_array(''A manager must confirm the shift hours before a full-shift exchange''));
 end if;');
 body:=replace(body,'(target->>''end_time'')::time,l.timezone) r','(target->>''end_time'')::time,coalesce(nullif(target->>''time_timezone'',''''),l.timezone)) r');
 execute body;
end; $times$;
