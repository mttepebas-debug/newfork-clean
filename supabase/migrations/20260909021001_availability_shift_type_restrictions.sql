-- Clock presets and service restrictions express different intentions. Service
-- restrictions stay bound to type identity, independently of its default hours.
create function public.validate_availability_shift_types(w uuid,days jsonb) returns void
language plpgsql stable security definer set search_path='' as $$
declare d jsonb; ids jsonb;
begin
 for d in select value from jsonb_array_elements(days) loop
  ids:=coalesce(d->'blocked_shift_type_ids','[]');
  if jsonb_typeof(ids) is distinct from 'array' then raise exception 'Choose shift types from this workspace' using errcode='22023'; end if;
  if jsonb_array_length(ids)>64 or exists(select 1 from jsonb_array_elements(ids) x where jsonb_typeof(x)<>'string' or (x#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
   raise exception 'Choose up to 64 distinct shift types per weekday' using errcode='22023'; end if;
  if (select count(distinct x::uuid) from jsonb_array_elements_text(ids) x)<>jsonb_array_length(ids)
   or exists(select 1 from jsonb_array_elements_text(ids) x where not exists(select 1 from public.shift_types st where st.id=x::uuid and st.workspace_id=w)) then
   raise exception 'Choose distinct shift types belonging to this workspace' using errcode='22023'; end if;
 end loop;
end $$;
revoke all on function public.validate_availability_shift_types(uuid,jsonb) from public,anon,authenticated,service_role;
do $validate$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.guard_availability_request()'::regprocedure);
 anchor:='perform public.validate_availability_week(new.proposal->>''timezone'',new.proposal->''days'');';
 if position(anchor in body)=0 then raise exception 'Availability request validation changed'; end if;
 execute replace(body,anchor,anchor||' perform public.validate_availability_shift_types(new.workspace_id,new.proposal->''days'');');
 body:=pg_get_functiondef('public.guard_availability_write()'::regprocedure);
 anchor:='perform public.validate_availability_week(new.timezone,new.recurring_rules);';
 if position(anchor in body)=0 then raise exception 'Availability version validation changed'; end if;
 execute replace(body,anchor,anchor||' perform public.validate_availability_shift_types(new.workspace_id,new.recurring_rules);');
 body:=pg_get_functiondef('public.availability_command_service(uuid,uuid,jsonb,uuid)'::regprocedure);
 anchor:='perform public.validate_availability_week(p->>''timezone'',p->''days'');';
 if position(anchor in body)=0 then raise exception 'Availability command validation changed'; end if;
 execute replace(body,anchor,anchor||' perform public.validate_availability_shift_types(w,p->''days'');');
end $validate$;

-- Derive effective version masks from the physical resolver. This shares all
-- weekly/temporary/replacement/time-zone precedence instead of reimplementing it.
create function public.availability_shift_type_rules(w uuid,emp uuid,target_span tstzrange,proposed jsonb default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare capacity public.availability_capacity_result; version_source jsonb; rules jsonb; piece jsonb; offset_piece record; local_day date; last_day date;
 rule jsonb; type_id uuid; candidate tstzrange; clipped tstzrange; result jsonb:='[]';
begin
 if not exists(select 1 from public.employee_schedule_availability_versions v cross join lateral jsonb_array_elements(v.recurring_rules) d
   where v.workspace_id=w and v.employee_id=emp and jsonb_array_length(coalesce(d->'blocked_shift_type_ids','[]'))>0)
  and not exists(select 1 from jsonb_array_elements(proposed->'days') d where jsonb_array_length(coalesce(d->'blocked_shift_type_ids','[]'))>0) then return '[]'; end if;
 capacity:=public.availability_capacity_for_span(w,emp,target_span,proposed);
 for version_source in select value from jsonb_array_elements(capacity.sources) loop
  if proposed is not null and version_source->>'version_id'='00000000-0000-4000-8000-000000000001' then rules:=proposed->'days';
  else select recurring_rules into rules from public.employee_schedule_availability_versions where id=(version_source->>'version_id')::uuid and workspace_id=w and employee_id=emp; end if;
  if not exists(select 1 from jsonb_array_elements(rules) d where jsonb_array_length(coalesce(d->'blocked_shift_type_ids','[]'))>0) then continue; end if;
  for piece in select value from jsonb_array_elements(version_source->'applies') loop
   for offset_piece in select * from public.availability_offset_segments(tstzrange((piece->>'start_at')::timestamptz,(piece->>'end_at')::timestamptz,'[)'),version_source->>'timezone') loop
    local_day:=(lower(offset_piece.utc_span) at time zone (version_source->>'timezone'))::date;
    last_day:=((upper(offset_piece.utc_span)-interval '1 microsecond') at time zone (version_source->>'timezone'))::date;
    while local_day<=last_day loop
     select value into rule from jsonb_array_elements(rules) d where (d->>'day')::integer=extract(dow from local_day)::integer;
     candidate:=tstzrange((local_day::timestamp at time zone 'UTC')-make_interval(secs=>offset_piece.offset_seconds),((local_day+1)::timestamp at time zone 'UTC')-make_interval(secs=>offset_piece.offset_seconds),'[)');
     clipped:=candidate*offset_piece.utc_span;
     if not isempty(clipped) then
      for type_id in select value::uuid from jsonb_array_elements_text(coalesce(rule->'blocked_shift_type_ids','[]')) loop
       result:=result||jsonb_build_array(jsonb_build_object('shift_type_id',type_id,'version_id',version_source->>'version_id','revision',version_source->'revision','timezone',version_source->>'timezone')
        ||(public.availability_ranges_json(tstzmultirange(clipped))->0));
      end loop;
     end if;
     local_day:=local_day+1;
    end loop;
   end loop;
  end loop;
 end loop;
 return result;
end $$;
revoke all on function public.availability_shift_type_rules(uuid,uuid,tstzrange,jsonb) from public,anon,authenticated,service_role;

-- Adding a semantic restriction is a narrowing even when clock hours are equal.
do $narrow$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.availability_change_narrows(uuid,uuid,jsonb)'::regprocedure);
 anchor:='  before_capacity:=public.availability_capacity_for_span(w,emp,span);';
 if position(anchor in body)=0 then raise exception 'Availability narrowing probes changed'; end if;
 execute replace(body,anchor,$types$
  if exists(select 1 from jsonb_array_elements(public.availability_shift_type_rules(w,emp,span,p)) proposed_rule
   where not coalesce((select range_agg(tstzrange((old_rule->>'start_at')::timestamptz,(old_rule->>'end_at')::timestamptz,'[)'))
    from jsonb_array_elements(public.availability_shift_type_rules(w,emp,span)) old_rule where old_rule->>'shift_type_id'=proposed_rule->>'shift_type_id'),'{}'::tstzmultirange)
     @> tstzrange((proposed_rule->>'start_at')::timestamptz,(proposed_rule->>'end_at')::timestamptz,'[)')) then return true; end if;
 $types$||anchor);
end $narrow$;

-- A type-bound restriction does not change physical-hour coverage. Its separate
-- operation reason blocks hard-policy assignments or requires a soft override.
do $assess$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.assess_shift_availability(uuid,uuid,jsonb)'::regprocedure);
 anchor:='missing_time boolean:=false;';
 if position(anchor in body)=0 then raise exception 'Availability assessment variables changed'; end if;
 body:=replace(body,anchor,'type_rules jsonb; matching_types jsonb; type_conflict boolean:=false; service_unknown boolean:=false; '||anchor);
 anchor:=' remaining:=capacity.available-leave_ranges;';
 if position(anchor in body)=0 then raise exception 'Availability physical coverage changed'; end if;
 body:=replace(body,anchor,$types$
 type_rules:=public.availability_shift_type_rules(w,emp,coalesce(span,day_span));
 select coalesce(jsonb_agg(x order by x->>'shift_type_id',x->>'start_at'),'[]') into matching_types
  from jsonb_array_elements(type_rules) x where shift->>'shift_type_id' is null or (x->>'shift_type_id')::uuid=(shift->>'shift_type_id')::uuid;
 type_conflict:=shift->>'shift_type_id' is not null and jsonb_array_length(matching_types)>0;
 service_unknown:=shift->>'shift_type_id' is null and jsonb_array_length(matching_types)>0;
 if type_conflict then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','shift_type_restricted','definite',true,
  'message','The employee is unavailable for this shift type on an affected weekday, regardless of its hours.')); end if;
 if service_unknown then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','shift_service_unclassified','definite',false,
  'message','The employee has shift-type restrictions. Classify the service before assigning; matching hours alone do not identify a shift type.')); end if;
 $types$||anchor);
 anchor:='  when settings.availability_enforcement=''hard'' and not isempty(capacity.unavailable)';
 if position(anchor in body)=0 then raise exception 'Availability enforcement order changed'; end if;
 body:=replace(body,anchor,'  when settings.availability_enforcement=''hard'' and type_conflict then ''blocked'' '||anchor);
 anchor:='  when missing_time or coverage=''unknown'' or jsonb_array_length(pending)>0 then';
 if position(anchor in body)=0 then raise exception 'Availability verification order changed'; end if;
 body:=replace(body,anchor,'  when service_unknown then ''verification_required'' '||anchor);
 anchor:='  when not isempty(capacity.unavailable) then ''warning_requires_override''';
 if position(anchor in body)=0 then raise exception 'Availability soft policy changed'; end if;
 body:=replace(body,anchor,'  when type_conflict then ''warning_requires_override'' '||anchor);
 anchor:=' result:=jsonb_build_object(''coverage'',coverage,';
 if position(anchor in body)=0 then raise exception 'Availability evidence projection changed'; end if;
 body:=replace(body,anchor,' fingerprint_payload:=fingerprint_payload||case when jsonb_array_length(matching_types)>0 then jsonb_build_object(''type_restrictions'',matching_types) else ''{}''::jsonb end; '
  ||' result:=jsonb_build_object(''type_restrictions'',matching_types,''coverage'',coverage,');
 execute body;
end $assess$;

do $read$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.availability_read_service(uuid,uuid,uuid)'::regprocedure);
 anchor:='''published_periods'',locks,';
 if position(anchor in body)=0 then raise exception 'Availability read projection changed'; end if;
 execute replace(body,anchor,$types$
  'time_format',settings.time_format,
  'shift_types',(select coalesce(jsonb_agg(jsonb_build_object('id',st.id,'name',st.name,'archived',st.archived_at is not null) order by st.name,st.id),'[]') from public.shift_types st where st.workspace_id=w),
 $types$||anchor);
end $read$;
