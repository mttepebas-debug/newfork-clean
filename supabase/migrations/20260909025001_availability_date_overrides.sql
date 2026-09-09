-- Dated physical-hour changes overlay a weekly/temporary pattern. They never
-- replace the employee's independent service restrictions or unpublished hours
-- outside the selected intervals. Existing lifecycle authorization is reused.
alter table public.employee_schedule_availability_versions add column date_overrides jsonb not null default '[]'
 check(jsonb_typeof(date_overrides)='array');

create function public.availability_resolve_date_overrides(p jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare item jsonb; resolved jsonb; result jsonb:='[]'; covered tstzmultirange:='{}'; span tstzrange;
 first_day date; last_day date; item_end date;
begin
 if not p ? 'date_overrides' then return '[]'; end if;
 if jsonb_typeof(p->'date_overrides') is distinct from 'array' then raise exception 'Choose dated availability hours' using errcode='22023'; end if;
 if jsonb_array_length(p->'date_overrides')=0 then return '[]'; end if;
 if jsonb_array_length(p->'date_overrides')>124 or p->>'effective_until' is null
   or coalesce(p->>'kind','temporary')<>'temporary' then raise exception 'Dated availability needs a bounded temporary period' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p->'date_overrides') loop
  if item->>'mode' is null or item->>'mode' not in('available','unavailable') then raise exception 'Choose available or unavailable for each dated period' using errcode='22023'; end if;
  resolved:=public.time_off_resolve_period(item,p->>'timezone');
  span:=tstzrange((resolved->>'starts_at')::timestamptz,(resolved->>'ends_at')::timestamptz,'[)');
  if covered && span then raise exception 'Dated availability periods must not overlap or repeat' using errcode='22023'; end if;
  covered:=covered+tstzmultirange(span);
  first_day:=least(first_day,(resolved->>'segment_date')::date);
  item_end:=((upper(span)-interval '1 microsecond') at time zone (p->>'timezone'))::date;
  last_day:=greatest(last_day,item_end);
  result:=result||jsonb_build_array(resolved||(resolved->'fold_choices')||jsonb_build_object('mode',item->>'mode'));
 end loop;
 if first_day is distinct from (p->>'effective_from')::date or last_day is distinct from (p->>'effective_until')::date or last_day-first_day>30 then
  raise exception 'The effective dates must cover exactly the selected dates, within 31 days' using errcode='22023'; end if;
 -- These compatibility weekday fields are deliberately inert for an overlay.
 if exists(select 1 from jsonb_array_elements(p->'days') d where d->>'mode'<>'unavailable' or jsonb_array_length(coalesce(d->'blocked_shift_type_ids','[]'))>0) then
  raise exception 'Dated hours preserve the existing weekly pattern and shift-type restrictions' using errcode='22023'; end if;
 return result;
end $$;
revoke all on function public.availability_resolve_date_overrides(jsonb) from public,anon,authenticated,service_role;

create function public.availability_date_override_ranges(periods jsonb) returns tstzmultirange
language sql immutable set search_path='' as $$
 select coalesce(range_agg(tstzrange((p->>'starts_at')::timestamptz,(p->>'ends_at')::timestamptz,'[)')),'{}') from jsonb_array_elements(periods) p;
$$;
revoke all on function public.availability_date_override_ranges(jsonb) from public,anon,authenticated,service_role;

create function public.availability_proposal_applies(p jsonb,target_span tstzrange) returns tstzmultirange
language sql stable set search_path='' as $$
 select case when coalesce(p->'date_overrides','[]')='[]'::jsonb then
  public.availability_calendar_mask(target_span,p->>'timezone',(p->>'effective_from')::date,(p->>'effective_until')::date)
 else public.availability_date_override_ranges(public.availability_resolve_date_overrides(p))*tstzmultirange(target_span) end;
$$;
create function public.availability_proposals_overlap(a jsonb,b jsonb) returns boolean
language plpgsql stable set search_path='' as $$
declare dated jsonb; other jsonb; span tstzrange;
begin
 if coalesce(a->'date_overrides','[]')='[]'::jsonb and coalesce(b->'date_overrides','[]')='[]'::jsonb then
  return (a->>'effective_from')::date<=coalesce((b->>'effective_until')::date,'infinity'::date)
   and (b->>'effective_from')::date<=coalesce((a->>'effective_until')::date,'infinity'::date);
 end if;
 if coalesce(a->'date_overrides','[]')<>'[]'::jsonb then dated:=a; other:=b; else dated:=b; other:=a; end if;
 for span in select unnest(public.availability_date_override_ranges(public.availability_resolve_date_overrides(dated))) loop
  -- Each original period is at most one day, but range aggregation may join
  -- consecutive dates. Probe bounded daily chunks for the pattern resolver.
  if exists(select 1 from generate_series(lower(span),upper(span)-interval '1 microsecond',interval '1 day') t
   where not isempty(public.availability_proposal_applies(other,tstzrange(t,least(t+interval '1 day',upper(span)),'[)')))) then return true; end if;
 end loop;
 return false;
end $$;
create function public.availability_date_overrides_locked(w uuid,emp uuid,periods jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.availability_publication_locks locked join public.locations l on l.id=locked.location_id and l.workspace_id=w
  cross join lateral jsonb_array_elements(periods) p
  where locked.workspace_id=w and not isempty(public.availability_calendar_mask(tstzrange((p->>'starts_at')::timestamptz,(p->>'ends_at')::timestamptz,'[)'),l.timezone,locked.week_start,locked.week_start+6))
   and (exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=emp and a.location_id=l.id and a.ended_at is null)
    or exists(select 1 from public.schedule_published_shifts s where s.workspace_id=w and s.employee_id=emp and s.location_id=l.id and s.scheduled_date between locked.week_start and locked.week_start+6)));
$$;
revoke all on function public.availability_proposal_applies(jsonb,tstzrange),public.availability_proposals_overlap(jsonb,jsonb),public.availability_date_overrides_locked(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- Copy the current weekly resolver, preserving its DST and explicit replacement
-- behavior. The public entry remains the single physical assessment boundary.
do $base$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.availability_capacity_for_span(uuid,uuid,tstzrange,jsonb)'::regprocedure);
 body:=replace(body,'FUNCTION public.availability_capacity_for_span(','FUNCTION public.availability_pattern_capacity_for_span(');
 anchor:='from public.employee_schedule_availability_versions a where a.workspace_id=w and a.employee_id=emp;';
 if position(anchor in body)=0 then raise exception 'Availability capacity source changed'; end if;
 body:=replace(body,anchor,replace(anchor,';',' and a.date_overrides=''[]''::jsonb;'));
 body:=replace(body,'if proposed is not null then','if proposed is not null and coalesce(proposed->''date_overrides'',''[]'')=''[]''::jsonb then');
 body:=replace(body,'coalesce((select max((x->>''revision'')::integer) from jsonb_array_elements(versions) x),0)+1',
  '(select coalesce(max(version_number),0)+1 from public.employee_schedule_availability_versions where workspace_id=w and employee_id=emp)');
 execute body;
end $base$;
revoke all on function public.availability_pattern_capacity_for_span(uuid,uuid,tstzrange,jsonb) from public,anon,authenticated,service_role;

create or replace function public.availability_capacity_for_span(w uuid,emp uuid,target_span tstzrange,proposed jsonb default null)
returns public.availability_capacity_result language plpgsql stable security definer set search_path='' as $$
declare result public.availability_capacity_result; versions jsonb; v jsonb; piece jsonb; newer jsonb;
 applies tstzmultirange; selected tstzmultirange; covered tstzmultirange:='{}'; changes jsonb; src jsonb;
begin
 result:=public.availability_pattern_capacity_for_span(w,emp,target_span,proposed);
 if target_span is null or isempty(target_span) then return result; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',version_number,'timezone',timezone,'date_overrides',date_overrides,
  'replace_version_ids',to_jsonb(replace_version_ids))),'[]') into versions
 from public.employee_schedule_availability_versions where workspace_id=w and employee_id=emp and date_overrides<>'[]'::jsonb;
 if proposed is not null and coalesce(proposed->'date_overrides','[]')<>'[]'::jsonb then
  changes:=public.availability_resolve_date_overrides(proposed);
  versions:=versions||jsonb_build_array(proposed||jsonb_build_object('id','00000000-0000-4000-8000-000000000001','date_overrides',changes,
   'revision',(select coalesce(max(version_number),0)+1 from public.employee_schedule_availability_versions where workspace_id=w and employee_id=emp)));
 end if;
 if versions='[]'::jsonb then return result; end if;
 for v in select value from jsonb_array_elements(versions) order by (value->>'revision')::integer desc loop
  applies:=public.availability_date_override_ranges(v->'date_overrides')*tstzmultirange(target_span);
  for newer in select value from jsonb_array_elements(versions) where (value->>'revision')::integer>(v->>'revision')::integer
   and coalesce(value->'replace_version_ids','[]') @> jsonb_build_array(v->>'id') loop
   applies:=applies-public.availability_date_override_ranges(newer->'date_overrides');
  end loop;
  applies:=applies-covered;
  if isempty(applies) then continue; end if;
  covered:=covered+applies;
  result.available:=result.available-applies; result.unavailable:=result.unavailable-applies; result.unknown:=result.unknown-applies;
  for piece in select value from jsonb_array_elements(v->'date_overrides') loop
   selected:=applies*tstzmultirange(tstzrange((piece->>'starts_at')::timestamptz,(piece->>'ends_at')::timestamptz,'[)'));
   if piece->>'mode'='available' then result.available:=result.available+selected; else result.unavailable:=result.unavailable+selected; end if;
  end loop;
  result.sources:=result.sources||jsonb_build_array(jsonb_build_object('version_id',v->>'id','revision',v->'revision','timezone',v->>'timezone','kind','date_exception','applies',public.availability_ranges_json(applies)));
 end loop;
 -- Each physical source reports only its effective hours. Service rules use the
 -- unmodified pattern resolver and therefore cannot be erased by a clock edit.
 select coalesce(jsonb_agg(case when s->>'kind'='date_exception' then s else
  s||jsonb_build_object('applies',public.availability_ranges_json(coalesce((select range_agg(tstzrange((p->>'start_at')::timestamptz,(p->>'end_at')::timestamptz,'[)')) from jsonb_array_elements(s->'applies') p),'{}')-covered)) end),'[]')
 into result.sources from jsonb_array_elements(result.sources) s;
 return result;
end $$;

do $types$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.availability_shift_type_rules(uuid,uuid,tstzrange,jsonb)'::regprocedure);
 anchor:='capacity:=public.availability_capacity_for_span(w,emp,target_span,proposed);';
 if position(anchor in body)=0 then raise exception 'Service source resolver changed'; end if;
 execute replace(body,anchor,'capacity:=public.availability_pattern_capacity_for_span(w,emp,target_span,proposed);');
end $types$;

create function public.availability_validate_date_override_replacements(w uuid,emp uuid,p jsonb,ids jsonb) returns void
language plpgsql stable security definer set search_path='' as $$
declare changes jsonb:=public.availability_resolve_date_overrides(p); proposed_ranges tstzmultirange; v record; remaining tstzmultirange;
begin
 if changes='[]'::jsonb then
  if exists(select 1 from public.employee_schedule_availability_versions where workspace_id=w and employee_id=emp and date_overrides<>'[]'::jsonb and ids @> jsonb_build_array(id::text)) then
   raise exception 'Change dated hours with another dated change; a weekly pattern cannot erase them' using errcode='22023'; end if;
  return;
 end if;
 if not exists(select 1 from public.employee_schedule_availability_versions where workspace_id=w and employee_id=emp and date_overrides='[]'::jsonb) then
  raise exception 'Save and approve the weekly availability before adding dated changes' using errcode='22023'; end if;
 if exists(select 1 from public.employee_schedule_availability_versions where workspace_id=w and employee_id=emp and date_overrides='[]'::jsonb and ids @> jsonb_build_array(id::text)) then
  raise exception 'Dated hours cannot replace a weekly or temporary pattern' using errcode='22023'; end if;
 proposed_ranges:=public.availability_date_override_ranges(changes);
 for v in select * from public.employee_schedule_availability_versions where workspace_id=w and employee_id=emp and date_overrides<>'[]'::jsonb loop
  remaining:=public.availability_date_override_ranges(v.date_overrides)-coalesce((select range_agg(span) from public.employee_schedule_availability_versions newer
   cross join lateral unnest(public.availability_date_override_ranges(newer.date_overrides)) span
   where newer.workspace_id=w and newer.employee_id=emp and newer.version_number>v.version_number and v.id=any(newer.replace_version_ids)),'{}');
  if remaining && proposed_ranges and not ids @> jsonb_build_array(v.id::text) then
   raise exception 'Review and explicitly replace the overlapping dated availability' using errcode='40001'; end if;
 end loop;
end $$;
revoke all on function public.availability_validate_date_override_replacements(uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;

-- Add the overlay to the existing immutable request/version lifecycle.
do $lifecycle$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.availability_command_service(uuid,uuid,jsonb,uuid)'::regprocedure);
 anchor:='perform public.validate_availability_shift_types(w,p->''days'');';
 if position(anchor in body)=0 then raise exception 'Availability command validation changed'; end if;
 body:=replace(body,anchor,anchor||$patch$
  perform public.availability_validate_date_override_replacements(w,emp.id,p,coalesce(command->'replace_version_ids','[]'));
  if coalesce(p->'date_overrides','[]')<>'[]'::jsonb then
   if command->>'source'='onboarding' then raise exception 'Onboarding must establish the weekly pattern first' using errcode='22023'; end if;
   p:=p||jsonb_build_object('date_overrides',public.availability_resolve_date_overrides(p));
  end if;
 $patch$);
 anchor:='x.effective_from<=coalesce((p->>''effective_until'')::date,''infinity''::date) and coalesce(x.effective_until,''infinity''::date)>=(p->>''effective_from'')::date';
 if position(anchor in body)=0 then raise exception 'Open availability overlap changed'; end if;
 body:=replace(body,anchor,'public.availability_proposals_overlap(x.proposal,p)');
 anchor:='if coalesce(p->>''kind'',case when p->>''effective_until'' is null then ''weekly'' else ''temporary'' end)=''temporary''';
 if position(anchor in body)=0 then raise exception 'Temporary overlap validation changed'; end if;
 body:=replace(body,anchor,anchor||' and coalesce(p->''date_overrides'',''[]'')=''[]''::jsonb');
 execute body;
 body:=pg_get_functiondef('public.availability_overlapping_temporary_versions(uuid,uuid,jsonb)'::regprocedure);
 execute replace(body,'v.kind=''temporary''','v.kind=''temporary'' and v.date_overrides=''[]''::jsonb');
 body:=pg_get_functiondef('public.availability_activate(public.availability_requests,uuid)'::regprocedure);
 anchor:='confirmation_source,confirmation,replace_version_ids)';
 if position(anchor in body)=0 then raise exception 'Availability activation columns changed'; end if;
 body:=replace(body,anchor,'confirmation_source,confirmation,replace_version_ids,date_overrides)');
 body:=replace(body,'r.confirmation,r.replace_version_ids);','r.confirmation,r.replace_version_ids,coalesce(r.proposal->''date_overrides'',''[]''));');
 execute body;
 body:=pg_get_functiondef('public.guard_availability_request()'::regprocedure);
 anchor:='perform public.validate_availability_shift_types(new.workspace_id,new.proposal->''days'');';
 if position(anchor in body)=0 then raise exception 'Availability request guard changed'; end if;
 body:=replace(body,anchor,anchor||' perform public.availability_resolve_date_overrides(new.proposal);');
 anchor:='if public.availability_period_locked(new.workspace_id,new.employee_id,new.effective_from,new.effective_until) then';
 if position(anchor in body)=0 then raise exception 'Availability publication request lock changed'; end if;
 execute replace(body,anchor,'if public.availability_period_locked(new.workspace_id,new.employee_id,new.effective_from,new.effective_until) or public.availability_date_overrides_locked(new.workspace_id,new.employee_id,public.availability_resolve_date_overrides(new.proposal)) then');
 body:=pg_get_functiondef('public.guard_availability_write()'::regprocedure);
 anchor:='if tg_table_name=''employee_schedule_availability_versions'' then';
 if position(anchor in body)=0 then raise exception 'Availability version guard changed'; end if;
 -- Only this relation has the new column; onboarding uses the same trigger.
 body:=replace(body,anchor,anchor||$patch$
    if new.date_overrides<>'[]'::jsonb then
     if new.date_overrides is distinct from public.availability_resolve_date_overrides(jsonb_build_object('timezone',new.timezone,'days',new.recurring_rules,
      'effective_from',new.effective_from,'effective_until',new.effective_until,'kind',new.kind,'date_overrides',new.date_overrides)) then
      raise exception 'Dated availability snapshots must match the requested local hours' using errcode='22023'; end if;
     perform public.availability_validate_date_override_replacements(new.workspace_id,new.employee_id,jsonb_build_object('timezone',new.timezone,'days',new.recurring_rules,
      'effective_from',new.effective_from,'effective_until',new.effective_until,'kind',new.kind,'date_overrides',new.date_overrides),to_jsonb(new.replace_version_ids));
     if public.availability_date_overrides_locked(new.workspace_id,new.employee_id,new.date_overrides) then
      raise exception 'These hours touch a published period in an employee location. Request time off or a shift change.' using errcode='23514'; end if;
    end if;
 $patch$);
 execute body;
end $lifecycle$;

-- Calendar pattern reads continue selecting the actual base pattern; callers
-- receive overlays separately instead of mistaking inert weekdays for capacity.
do $reads$ declare body text; signature text; anchor text; begin
 foreach signature in array array['public.availability_version_for_calendar(uuid,date)','public.availability_version_at_instant(uuid,timestamptz)','public.availability_rules_for_date(uuid,date)'] loop
  body:=pg_get_functiondef(signature::regprocedure);
  anchor:='where v.employee_id=';
  if position(anchor in body)=0 then raise exception 'Availability calendar source changed: %',signature; end if;
  execute replace(body,anchor,'where v.date_overrides=''[]''::jsonb and v.employee_id=');
 end loop;
 body:=pg_get_functiondef('public.availability_read_service(uuid,uuid,uuid)'::regprocedure);
 anchor:='''replace_version_ids'',to_jsonb(v.replace_version_ids),';
 if position(anchor in body)=0 then raise exception 'Availability read source changed'; end if;
 execute replace(body,anchor,'''date_overrides'',v.date_overrides,'||anchor);
 body:=pg_get_functiondef('public.get_schedule_read_model_availability_v2_service(uuid,uuid,date)'::regprocedure);
 anchor:='''replace_version_ids'',to_jsonb(v.replace_version_ids),';
 if position(anchor in body)=0 then raise exception 'Schedule availability source changed'; end if;
 execute replace(body,anchor,'''date_overrides'',v.date_overrides,'||anchor);
end $reads$;

do $pending$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.assess_shift_availability_core(uuid,uuid,jsonb,boolean)'::regprocedure);
 anchor:='public.availability_calendar_mask(coalesce(span,day_span),r.proposal->>''timezone'',r.effective_from,r.effective_until)';
 if position(anchor in body)=0 then raise exception 'Assessment pending availability mask changed'; end if;
 execute replace(body,anchor,'public.availability_proposal_applies(r.proposal,coalesce(span,day_span))');
 body:=pg_get_functiondef('public.availability_pending_publication(uuid,uuid,date)'::regprocedure);
 anchor:='r.effective_from<=week+6 and coalesce(r.effective_until,''infinity''::date)>=week';
 if position(anchor in body)=0 then raise exception 'Publication pending availability dates changed'; end if;
 execute replace(body,anchor,$patch$(case when coalesce(r.proposal->'date_overrides','[]')='[]'::jsonb then
  r.effective_from<=week+6 and coalesce(r.effective_until,'infinity'::date)>=week
 else not isempty(public.availability_proposal_applies(r.proposal,tstzrange(week::timestamp at time zone (select timezone from public.locations where id=loc and workspace_id=w),
  (week+7)::timestamp at time zone (select timezone from public.locations where id=loc and workspace_id=w),'[)'))) end)$patch$);
end $pending$;

create or replace function public.availability_rules_for_date(target_employee_id uuid,target_date date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base public.employee_schedule_availability_versions; span tstzrange; capacity public.availability_capacity_result;
 component tstzrange; offset_piece record; clocks int4multirange:='{}'; start_seconds integer; end_seconds integer; windows jsonb; result jsonb;
begin
 base:=public.availability_version_for_calendar(target_employee_id,target_date);
 if base.id is null then return null; end if;
 span:=tstzrange(target_date::timestamp at time zone base.timezone,(target_date+1)::timestamp at time zone base.timezone,'[)');
 if not exists(select 1 from public.employee_schedule_availability_versions v where v.workspace_id=base.workspace_id and v.employee_id=target_employee_id
  and public.availability_date_override_ranges(v.date_overrides) && span) then return base.recurring_rules; end if;
 -- A repeated/skipped clock cannot be represented faithfully by a legacy
 -- weekday-only DTO. Its actual assignment still uses the UTC assessment.
 if (select count(*) from public.availability_offset_segments(span,base.timezone))>1 then return null; end if;
 capacity:=public.availability_capacity_for_span(base.workspace_id,target_employee_id,span);
 if not isempty(capacity.unknown) then return null; end if;
 for component in select unnest(capacity.available) loop
  for offset_piece in select * from public.availability_offset_segments(component,base.timezone) loop
   start_seconds:=extract(epoch from ((lower(offset_piece.utc_span) at time zone 'UTC')+make_interval(secs=>offset_piece.offset_seconds)-target_date::timestamp))::integer;
   end_seconds:=extract(epoch from ((upper(offset_piece.utc_span) at time zone 'UTC')+make_interval(secs=>offset_piece.offset_seconds)-target_date::timestamp))::integer;
   clocks:=clocks+int4multirange(int4range(greatest(0,start_seconds),least(86400,end_seconds),'[)'));
  end loop;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('start',to_char(target_date::timestamp+make_interval(secs=>lower(r)),'HH24:MI:SS'),
  'end',case when upper(r)=86400 then '24:00' else to_char(target_date::timestamp+make_interval(secs=>upper(r)),'HH24:MI:SS') end) order by lower(r)),'[]') into windows from unnest(clocks) r;
 select jsonb_agg(case when (d->>'day')::integer=extract(dow from target_date)::integer then
  d||jsonb_build_object('mode',case when isempty(clocks) then 'unavailable' else 'windows' end,'windows',windows) else d end order by (d->>'day')::integer)
 into result from jsonb_array_elements(base.recurring_rules) d;
 return result;
end $$;
