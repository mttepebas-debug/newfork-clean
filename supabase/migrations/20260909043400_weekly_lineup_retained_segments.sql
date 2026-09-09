-- Published responsibility uses its saved clock evidence, not a later location setting.
create function public.weekly_lineup_entry_span(w uuid,entry jsonb,location jsonb,d date) returns tstzrange
language plpgsql stable security definer set search_path='' as $$
declare result tstzrange; basis text;
begin
 if entry->>'source_shift_id' is not null then
  select public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,
   coalesce(nullif(s.time_timezone,''),nullif(s.time_snapshot->>'timezone',''),location->>'timezone')),s.time_basis
  into result,basis from public.schedule_published_shifts s where s.workspace_id=w and s.id=(entry->>'source_shift_id')::uuid;
  if basis is null or basis in ('unresolved','legacy_unverified') then
   raise exception 'Confirm source shift hours before changing Line Up staffing' using errcode='23514'; end if;
  return result;
 end if;
 return public.lineup_shift_range(coalesce(public.lineup_entry_day(w,(entry->>'id')::uuid),d),
  (entry->>'start_time')::time,(entry->>'end_time')::time,location->>'timezone');
end; $$;

-- Called only by the private segment writer after the operation's scope checks.
-- This is lineage for unchanged work, not a fabricated employee/manager consent.
create function public.record_weekly_lineup_retained_segment(actor uuid,w uuid,source_id uuid,logical_id uuid,piece tstzrange) returns void
language plpgsql security definer set search_path='' as $$
declare parent public.schedule_published_shifts%rowtype; tz text; original tstzrange; s jsonb; identity jsonb;
begin
 perform public.availability_lock_workspace(w);
 select ps.* into parent from public.schedule_published_shifts ps
 join public.schedule_location_publications p on p.id=ps.publication_id and p.workspace_id=w and p.status='current'
 where ps.workspace_id=w and ps.id=source_id for update of ps;
 if parent.id is null or parent.time_basis in ('unresolved','legacy_unverified') or logical_id is null or logical_id=coalesce(parent.source_shift_id,parent.id)
  or exists(select 1 from public.schedule_published_shifts where workspace_id=w and source_shift_id=logical_id)
  or not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage') then
  raise exception 'Current published source required for retained work' using errcode='23514'; end if;
 select timezone into tz from public.locations where workspace_id=w and id=parent.location_id;
 original:=public.lineup_shift_range(parent.scheduled_date,parent.start_time,parent.end_time,
  coalesce(nullif(parent.time_timezone,''),nullif(parent.time_snapshot->>'timezone',''),tz));
 if original is null or lower_inf(original) or upper_inf(original) or piece is null or isempty(piece) or lower_inf(piece) or upper_inf(piece) or not original @> piece
  or not lower_inc(piece) or upper_inc(piece) then
  raise exception 'Retained work must stay inside its original responsibility' using errcode='23514'; end if;
 if public.lineup_shift_range((lower(piece) at time zone tz)::date,(lower(piece) at time zone tz)::time,
  (upper(piece) at time zone tz)::time,tz) is distinct from piece then
  raise exception 'Choose split boundaries that preserve the exact local times' using errcode='23514'; end if;
 if parent.employee_id is null then return; end if;
 s:=jsonb_build_object('id',logical_id,'source_shift_id',logical_id,'employee_id',parent.employee_id,
  'location_id',parent.location_id,'job_id',parent.job_id,'shift_type_id',parent.shift_type_id,
  'scheduled_date',(lower(piece) at time zone tz)::date,'start_time',(lower(piece) at time zone tz)::time,
  'end_time',(upper(piece) at time zone tz)::time,'time_basis','explicit','time_snapshot',null,'time_timezone',tz);
 identity:=public.schedule_availability_identity(s);
 insert into public.schedule_availability_overrides(workspace_id,shift_id,employee_id,location_id,assessment_fingerprint,assessment,reason,actor_user_id)
 values(w,logical_id,parent.employee_id,parent.location_id,encode(extensions.digest(convert_to(identity::text,'UTF8'),'sha256'),'hex'),
  jsonb_build_object('consent_source','lineup_retained_segment','retained_identity',identity,
   'original_published_shift_id',parent.id,'original_publication_id',parent.publication_id,
   'original_snapshot',parent.availability_snapshot),
  'Unchanged portion of an existing published responsibility.',actor);
end; $$;

do $retained_segments$
declare body text; anchor text;
begin
 body:=pg_get_functiondef('public.guard_schedule_assignment_availability()'::regprocedure);
 anchor:=' a:=public.assess_weekly_shift_availability(new.workspace_id,new.employee_id,s);';
 if position(anchor in body)=0 then raise exception 'Assignment guard assessment boundary changed'; end if;
 body:=replace(body,anchor,$retained$
 if tg_table_name='schedule_published_shifts' and tg_op='INSERT' then
  select o.assessment into evidence from public.schedule_availability_overrides o
  where o.workspace_id=new.workspace_id and o.shift_id=logical_id and o.employee_id=new.employee_id
   and o.location_id=new.location_id and o.revoked_at is null
   and o.assessment->>'consent_source'='lineup_retained_segment'
   and o.assessment->'retained_identity'=public.schedule_availability_identity(s) limit 1;
  if evidence is not null then
   new.availability_snapshot:=coalesce(nullif(evidence->'original_snapshot','null'),jsonb_build_object(
    'status','legacy_published','message','Existing published responsibility retained; historical availability is not reconstructed.'))
    ||jsonb_build_object('retained_from',jsonb_build_object('published_shift_id',evidence->'original_published_shift_id',
      'publication_id',evidence->'original_publication_id'));
   return new;
  end if;
 end if;
$retained$||anchor);
 execute body;

 body:=replace(pg_get_functiondef('public.lineup_assign_segment(uuid,uuid,uuid,uuid,jsonb)'::regprocedure),E'\r','');
 anchor:='original:=public.lineup_shift_range(old.scheduled_date,old.start_time,old.end_time,src_loc.timezone);';
 if position(anchor in body)=0 then raise exception 'Segment source geometry changed'; end if;
 body:=replace(body,anchor,'original:=public.lineup_shift_range(old.scheduled_date,old.start_time,old.end_time,coalesce(nullif(old.time_timezone,''''),nullif(old.time_snapshot->>''timezone'',''''),src_loc.timezone));');
 anchor:='    for residual in select unnest(remaining) loop';
 if position(anchor in body)=0 then raise exception 'Retained segment loop changed'; end if;
 body:=replace(body,anchor,anchor||E'\n      new_logical_id:=gen_random_uuid();\n      perform public.record_weekly_lineup_retained_segment(actor,w,old.id,new_logical_id,residual);');
 anchor:='src_loc.timezone, old.note, gen_random_uuid()) returning id into new_id;';
 if position(anchor in body)=0 then raise exception 'Retained segment logical ID changed'; end if;
 body:=replace(body,anchor,'src_loc.timezone, old.note, new_logical_id) returning id into new_id;');
 execute body;

 body:=pg_get_functiondef('public.lineup_operation_preview(uuid,uuid,jsonb)'::regprocedure);
 anchor:='public.lineup_shift_range(coalesce(public.lineup_entry_day(w,(src->>''id'')::uuid),d),(src->>''start_time'')::time,(src->>''end_time'')::time,src_loc->>''timezone'')';
 if position(anchor in body)=0 then raise exception 'Preview source geometry changed'; end if;
 body:=replace(body,anchor,'public.weekly_lineup_entry_span(w,src,src_loc,d)');
 anchor:='public.lineup_shift_range(coalesce(public.lineup_entry_day(w,(other->>''id'')::uuid),d),(other->>''start_time'')::time,(other->>''end_time'')::time,other_loc->>''timezone'')';
 if position(anchor in body)=0 then raise exception 'Preview counterpart geometry changed'; end if;
 body:=replace(body,anchor,'public.weekly_lineup_entry_span(w,other,other_loc,d)');
 anchor:='  fingerprint:=encode(';
 if position(anchor in body)=0 then raise exception 'Operation fingerprint boundary changed'; end if;
 body:=replace(body,anchor,$saved_clock$
  -- Same-location writes deliberately retain the saved timezone in the shared
  -- clock normalizer. Do not let a Line Up clock in the new zone be reinterpreted.
  if exists(select 1 from public.schedule_published_shifts ps join public.locations l on l.id=ps.location_id
   where ps.workspace_id=w and ps.id in ((src->>'source_shift_id')::uuid,(other->>'source_shift_id')::uuid)
    and (op->>'kind' in ('assign','replace','release','swap') or ps.location_id=destination)
    and coalesce(nullif(ps.time_timezone,''),nullif(ps.time_snapshot->>'timezone',''),l.timezone)<>l.timezone) then
   blocked:=array_append(blocked,'Saved and current location timezones differ. Review the assignment in Schedule before changing Line Up staffing.');
  end if;
$saved_clock$||anchor);
 execute body;

 body:=pg_get_functiondef('public.lineup_split_has_publications(uuid,uuid,tstzrange,tstzrange,integer)'::regprocedure);
 anchor:='   day:=(lower(piece) at time zone tz)::date;';
 if position(anchor in body)=0 then raise exception 'Split publication range loop changed'; end if;
 body:=replace(body,anchor,$clock$
   if public.lineup_shift_range((lower(piece) at time zone tz)::date,(lower(piece) at time zone tz)::time,
    (upper(piece) at time zone tz)::time,tz) is distinct from piece then
    raise exception 'Choose split boundaries that preserve the exact local times' using errcode='23514'; end if;
$clock$||anchor);
 execute body;

 body:=pg_get_functiondef('public.lineup_candidate_option(uuid,uuid,uuid,jsonb,uuid[],jsonb)'::regprocedure);
 anchor:='public.lineup_shift_range(ps.scheduled_date,ps.start_time,ps.end_time,l.timezone)';
 if position(anchor in body)=0 then raise exception 'Movable candidate source geometry changed'; end if;
 body:=replace(body,anchor,'public.lineup_shift_range(ps.scheduled_date,ps.start_time,ps.end_time,coalesce(nullif(ps.time_timezone,''''),nullif(ps.time_snapshot->>''timezone'',''''),l.timezone))');
 body:=replace(body,'select ps.*,l.timezone,l.name as location_name','select ps.*,coalesce(nullif(ps.time_timezone,''''),nullif(ps.time_snapshot->>''timezone'',''''),l.timezone) as timezone,l.name as location_name');
 execute body;
end; $retained_segments$;

revoke all on function public.weekly_lineup_entry_span(uuid,jsonb,jsonb,date),
 public.record_weekly_lineup_retained_segment(uuid,uuid,uuid,uuid,tstzrange) from public,anon,authenticated,service_role;
