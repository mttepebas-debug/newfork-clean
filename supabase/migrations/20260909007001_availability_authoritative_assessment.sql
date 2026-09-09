-- CLI-generated migration. Canonical physical availability uses half-open UTC intervals.
-- This is additive to the lifecycle migration and preserves saved shift time sources.
alter table public.availability_requests add column replace_version_ids uuid[] not null default '{}';
alter table public.employee_schedule_availability_versions add column replace_version_ids uuid[] not null default '{}';

create function public.availability_utc_offset(at_instant timestamptz,zone_name text) returns integer
language sql stable set search_path='' as $$
 select extract(epoch from ((at_instant at time zone zone_name)-(at_instant at time zone 'UTC')))::integer;
$$;
revoke all on function public.availability_utc_offset(timestamptz,text) from public,anon,authenticated,service_role;

-- Split an actual shift at timezone offset changes. Returning constant-offset pieces
-- lets recurring wall-clock windows include both occurrences in an autumn fold and
-- exclude nonexistent spring hours. It does not move an employee's 02:00 rule to 03:00.
create function public.availability_offset_segments(target_span tstzrange,zone_name text)
returns table(utc_span tstzrange,offset_seconds integer) language plpgsql stable set search_path='' as $$
declare cursor_at timestamptz:=lower(target_span); piece_start timestamptz:=lower(target_span); probe_at timestamptz;
 current_offset integer; next_offset integer; low_at timestamptz; high_at timestamptz; middle_at timestamptz;
begin
 if target_span is null or isempty(target_span) then return; end if;
 if lower_inf(target_span) or upper_inf(target_span) or upper(target_span)-lower(target_span)>interval '8 days' then
  raise exception 'Availability assessment requires a bounded shift interval' using errcode='22023'; end if;
 current_offset:=public.availability_utc_offset(cursor_at,zone_name);
 while cursor_at<upper(target_span) loop
  probe_at:=least(cursor_at+interval '1 hour',upper(target_span));
  next_offset:=public.availability_utc_offset(probe_at-interval '1 microsecond',zone_name);
  if next_offset<>current_offset then
   low_at:=cursor_at; high_at:=probe_at;
   while high_at-low_at>interval '1 second' loop
    middle_at:=to_timestamp(floor(extract(epoch from low_at)+(extract(epoch from high_at-low_at)/2)));
    if public.availability_utc_offset(middle_at,zone_name)=current_offset then low_at:=middle_at; else high_at:=middle_at; end if;
   end loop;
   utc_span:=tstzrange(piece_start,high_at,'[)'); offset_seconds:=current_offset; return next;
   piece_start:=high_at; cursor_at:=high_at; current_offset:=public.availability_utc_offset(high_at,zone_name);
  else
   cursor_at:=probe_at;
   if cursor_at<upper(target_span) and public.availability_utc_offset(cursor_at,zone_name)<>current_offset then
    utc_span:=tstzrange(piece_start,cursor_at,'[)'); offset_seconds:=current_offset; return next;
    piece_start:=cursor_at; current_offset:=public.availability_utc_offset(cursor_at,zone_name);
   end if;
  end if;
 end loop;
 if piece_start<upper(target_span) then utc_span:=tstzrange(piece_start,upper(target_span),'[)'); offset_seconds:=current_offset; return next; end if;
end; $$;
revoke all on function public.availability_offset_segments(tstzrange,text) from public,anon,authenticated,service_role;

create function public.availability_calendar_mask(target_span tstzrange,zone_name text,starts date,ends date)
returns tstzmultirange language sql stable set search_path='' as $$
 select coalesce(range_agg(s.utc_span*r.calendar_span),'{}'::tstzmultirange)
 from public.availability_offset_segments(target_span,zone_name) s cross join lateral (
  select tstzrange((starts::timestamp at time zone 'UTC')-make_interval(secs=>s.offset_seconds),
   case when ends is null then null else ((ends+1)::timestamp at time zone 'UTC')-make_interval(secs=>s.offset_seconds) end,'[)') calendar_span
 ) r where s.utc_span && r.calendar_span;
$$;
revoke all on function public.availability_calendar_mask(tstzrange,text,date,date) from public,anon,authenticated,service_role;

create function public.availability_ranges_json(ranges tstzmultirange) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('start_at',to_char(lower(r) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'end_at',to_char(upper(r) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by lower(r)),'[]') from unnest(ranges) r;
$$;
revoke all on function public.availability_ranges_json(tstzmultirange) from public,anon,authenticated,service_role;

create type public.availability_capacity_result as (available tstzmultirange,unavailable tstzmultirange,unknown tstzmultirange,sources jsonb);
create function public.availability_capacity_for_span(w uuid,emp uuid,target_span tstzrange,proposed jsonb default null)
returns public.availability_capacity_result language plpgsql stable security definer set search_path='' as $$
declare versions jsonb; v jsonb; replacement jsonb; applicable tstzmultirange; covered tstzmultirange:='{}'; available tstzmultirange:='{}';
 sources jsonb:='[]'; component tstzrange; offset_piece record; local_day date; last_day date; rule jsonb; win jsonb; candidate tstzrange;
 start_clock time; end_clock time; result public.availability_capacity_result;
begin
 if target_span is null or isempty(target_span) then return ('{}','{}','{}','[]')::public.availability_capacity_result; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'revision',a.version_number,'timezone',a.timezone,'days',a.recurring_rules,
  'effective_from',a.effective_from,'effective_until',a.effective_until,'kind',a.kind,'replace_version_ids',to_jsonb(a.replace_version_ids))),'[]') into versions
 from public.employee_schedule_availability_versions a where a.workspace_id=w and a.employee_id=emp;
 if proposed is not null then
  perform public.validate_availability_week(proposed->>'timezone',proposed->'days');
  versions:=versions||jsonb_build_array(proposed||jsonb_build_object('id','00000000-0000-4000-8000-000000000001',
   'kind',coalesce(proposed->>'kind',case when proposed->>'effective_until' is null then 'weekly' else 'temporary' end),
   'revision',coalesce((select max((x->>'revision')::integer) from jsonb_array_elements(versions) x),0)+1));
 end if;
 for v in select value from jsonb_array_elements(versions) order by case when value->>'kind'='temporary' then 1 else 0 end desc,(value->>'revision')::integer desc loop
  applicable:=public.availability_calendar_mask(target_span,v->>'timezone',(v->>'effective_from')::date,(v->>'effective_until')::date);
  -- Explicit replacement removes only the named old pattern and only during the
  -- replacing record's effective period. A newer weekly record alone cannot erase a temporary one.
  for replacement in select value from jsonb_array_elements(versions) where (value->>'revision')::integer>(v->>'revision')::integer
   and coalesce(value->'replace_version_ids','[]') @> jsonb_build_array(v->>'id') loop
   applicable:=applicable-public.availability_calendar_mask(target_span,replacement->>'timezone',(replacement->>'effective_from')::date,(replacement->>'effective_until')::date);
  end loop;
  applicable:=applicable-covered;
  if isempty(applicable) then continue; end if;
  covered:=covered+applicable;
  sources:=sources||jsonb_build_array(jsonb_build_object('version_id',v->>'id','revision',(v->>'revision')::integer,'timezone',v->>'timezone','kind',v->>'kind','applies',public.availability_ranges_json(applicable)));
  for component in select unnest(applicable) loop
   for offset_piece in select * from public.availability_offset_segments(component,v->>'timezone') loop
    local_day:=(lower(offset_piece.utc_span) at time zone (v->>'timezone'))::date;
    last_day:=((upper(offset_piece.utc_span)-interval '1 microsecond') at time zone (v->>'timezone'))::date;
    while local_day<=last_day loop
     select value into rule from jsonb_array_elements(v->'days') where (value->>'day')::integer=extract(dow from local_day)::integer;
     if rule->>'mode'='unrestricted' then rule:=jsonb_build_object('mode','windows','windows',jsonb_build_array(jsonb_build_object('start','00:00','end','24:00'))); end if;
     if rule->>'mode'='windows' then
      for win in select value from jsonb_array_elements(rule->'windows') loop
       start_clock:=(win->>'start')::time; end_clock:=(win->>'end')::time;
       candidate:=tstzrange(((local_day+start_clock) at time zone 'UTC')-make_interval(secs=>offset_piece.offset_seconds),
        ((local_day+end_clock) at time zone 'UTC')-make_interval(secs=>offset_piece.offset_seconds),'[)');
       if candidate && offset_piece.utc_span then available:=available+tstzmultirange(candidate*offset_piece.utc_span); end if;
      end loop;
     end if;
     local_day:=local_day+1;
    end loop;
   end loop;
  end loop;
 end loop;
 result.available:=available; result.unavailable:=covered-available; result.unknown:=tstzmultirange(target_span)-covered; result.sources:=sources;
 return result;
end; $$;
revoke all on function public.availability_capacity_for_span(uuid,uuid,tstzrange,jsonb) from public,anon,authenticated,service_role;

create or replace function public.availability_change_narrows(w uuid,emp uuid,p jsonb) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare boundary date; span tstzrange; before_capacity public.availability_capacity_result; after_capacity public.availability_capacity_result;
begin
 for boundary in with boundaries as (
  select (p->>'effective_from')::date d
  union select effective_from-1 from public.employee_schedule_availability_versions where workspace_id=w and employee_id=emp and effective_from>=(p->>'effective_from')::date
  union select effective_until from public.employee_schedule_availability_versions where workspace_id=w and employee_id=emp and effective_until>=(p->>'effective_from')::date
 ), probes as (select greatest(d,(p->>'effective_from')::date)+n d from boundaries cross join (values(0),(7)) weeks(n))
 select distinct d from probes where d<=coalesce((p->>'effective_until')::date,'infinity'::date) loop
  span:=tstzrange(boundary::timestamp at time zone (p->>'timezone'),least(boundary+7,coalesce((p->>'effective_until')::date+1,'infinity'::date))::timestamp at time zone (p->>'timezone'),'[)');
  before_capacity:=public.availability_capacity_for_span(w,emp,span);
  after_capacity:=public.availability_capacity_for_span(w,emp,span,p);
  -- A timezone change deserves review even when this particular week is aligned;
  -- different zones can diverge at a later seasonal/political offset change.
  if exists(select 1 from jsonb_array_elements(before_capacity.sources) source where source->>'timezone'<>p->>'timezone')
    or not after_capacity.available @> before_capacity.available then return true; end if;
 end loop;
 return false;
end; $$;

create function public.availability_overlapping_temporary_versions(w uuid,emp uuid,p jsonb) returns setof uuid
language sql stable security definer set search_path='' as $$
 select v.id from public.employee_schedule_availability_versions v where v.workspace_id=w and v.employee_id=emp and v.kind='temporary'
 and not isempty(datemultirange(daterange(v.effective_from,v.effective_until+1,'[)')*daterange((p->>'effective_from')::date,(p->>'effective_until')::date+1,'[)'))
   -coalesce((select range_agg(daterange(replacer.effective_from,replacer.effective_until+1,'[)'))
     from public.employee_schedule_availability_versions replacer where replacer.workspace_id=w and replacer.employee_id=emp and v.id=any(replacer.replace_version_ids)),'{}'::datemultirange));
$$;
revoke all on function public.availability_overlapping_temporary_versions(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- Narrow patches preserve the lifecycle command's authorization, retry and audit logic.
do $wire_replacements$
declare body text; old_fragment text; new_fragment text;
begin
 body:=pg_get_functiondef('public.availability_command_service(uuid,uuid,jsonb,uuid)'::regprocedure);
 old_fragment:='  if exists(select 1 from public.employee_schedule_availability_versions v where v.workspace_id=w and v.employee_id=emp.id and v.kind=''temporary''
    and v.effective_from<=coalesce((p->>''effective_until'')::date,''infinity''::date) and v.effective_until>=(p->>''effective_from'')::date
    and not coalesce(command->''replace_version_ids'',''[]''::jsonb) @> jsonb_build_array(v.id::text)) then';
 new_fragment:='  if exists(select 1 from jsonb_array_elements_text(coalesce(command->''replace_version_ids'',''[]'')) x(id) where not exists(
    select 1 from public.employee_schedule_availability_versions v where v.workspace_id=w and v.employee_id=emp.id and v.id=x.id::uuid)) then
    raise exception ''Choose only this employee''''s existing availability patterns for replacement'' using errcode=''22023''; end if;
  if coalesce(p->>''kind'',case when p->>''effective_until'' is null then ''weekly'' else ''temporary'' end)=''temporary''
    and exists(select 1 from public.availability_overlapping_temporary_versions(w,emp.id,p) v(id)
      where not coalesce(command->''replace_version_ids'',''[]'') @> jsonb_build_array(v.id::text)) then';
 if position(old_fragment in body)=0 then raise exception 'Availability command overlap logic changed; review this migration'; end if;
 body:=replace(body,old_fragment,new_fragment);
 body:=replace(body,'narrowing:=public.availability_change_narrows(w,emp.id,p);',
  'p:=p||jsonb_build_object(''kind'',coalesce(p->>''kind'',case when p->>''effective_until'' is null then ''weekly'' else ''temporary'' end),''replace_version_ids'',coalesce(command->''replace_version_ids'',''[]'')); narrowing:=public.availability_change_narrows(w,emp.id,p);');
 body:=replace(body,'source,confirmation,kind,effective_from,effective_until,is_narrowing,status,capacity_notice_open)',
  'source,confirmation,kind,effective_from,effective_until,is_narrowing,status,capacity_notice_open,replace_version_ids)');
 body:=replace(body,'narrowing and request_source<>''manager_proposal'' and needs_review) returning * into r;',
  'narrowing and request_source<>''manager_proposal'' and needs_review,array(select value::uuid from jsonb_array_elements_text(coalesce(command->''replace_version_ids'',''[]'')))) returning * into r;');
 execute body;
 body:=pg_get_functiondef('public.availability_activate(public.availability_requests,uuid)'::regprocedure);
 body:=replace(body,'request_id,kind,confirmation_source,confirmation)', 'request_id,kind,confirmation_source,confirmation,replace_version_ids)');
 body:=replace(body,'else r.source end,r.confirmation);','else r.source end,r.confirmation,r.replace_version_ids);');
 execute body;
 body:=pg_get_functiondef('public.guard_availability_request()'::regprocedure);
 body:=replace(body,'new.is_narrowing,new.created_at)', 'new.is_narrowing,new.created_at,new.replace_version_ids)');
 body:=replace(body,'old.is_narrowing,old.created_at)', 'old.is_narrowing,old.created_at,old.replace_version_ids)');
 execute body;
end; $wire_replacements$;

-- Shared evaluator for saved/normalized assignment descriptors. It does not grant
-- an override or change an assignment; every writer must enforce its result.
create function public.assess_shift_availability(w uuid,emp uuid,shift jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare loc uuid:=(shift->>'location_id')::uuid; day date:=coalesce(shift->>'scheduled_date',shift->>'date')::date;
 zone_name text; basis text:=coalesce(shift->>'time_basis','explicit'); start_clock time; end_clock time;
 local_start timestamp; local_end timestamp; start_at timestamptz; end_at timestamptz; span tstzrange; day_span tstzrange;
 capacity public.availability_capacity_result; remaining tstzmultirange; unavailable tstzmultirange; unknown tstzmultirange;
 leave_ranges tstzmultirange:='{}'; leave_evidence jsonb:='[]'; pending jsonb:='[]'; reasons jsonb:='[]'; settings public.workspace_scheduling_settings%rowtype;
 leave_row record; leave_span tstzrange; leave_zone text; coverage text; operation text; fingerprint_payload jsonb; result jsonb;
 missing_time boolean:=false; invalid_clock boolean:=false; ambiguous_clock boolean:=false; definite_block boolean:=false;
begin
 select coalesce(nullif(shift->>'time_timezone',''),nullif(shift->'time_snapshot'->>'timezone',''),l.timezone) into zone_name
 from public.locations l where l.workspace_id=w and l.id=loc;
 if zone_name is null or day is null or not isfinite(day) or not exists(select 1 from pg_timezone_names where name=zone_name) then
  raise exception 'A valid location, date and timezone are required for availability assessment' using errcode='22023'; end if;
 if not exists(select 1 from public.employee_profiles e where e.workspace_id=w and e.id=emp) then raise exception 'Employee not found in this workspace' using errcode='42501'; end if;
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 if settings.workspace_id is null then raise exception 'Scheduling settings unavailable' using errcode='P0002'; end if;
 if basis not in ('explicit','type_default','unresolved','legacy_unverified') then raise exception 'Unknown shift time source' using errcode='22023'; end if;
 if basis='type_default' then
  start_clock:=nullif(shift->'time_snapshot'->>'start_time','')::time; end_clock:=nullif(shift->'time_snapshot'->>'end_time','')::time;
  if (start_clock,end_clock) is distinct from (nullif(shift->>'start_time','')::time,nullif(shift->>'end_time','')::time) then
   raise exception 'Saved reference hours and their snapshot must agree' using errcode='22023'; end if;
 elsif basis='explicit' then start_clock:=nullif(shift->>'start_time','')::time; end_clock:=nullif(shift->>'end_time','')::time;
 end if;
 missing_time:=start_clock is null or end_clock is null or start_clock=end_clock or basis in ('unresolved','legacy_unverified');
 day_span:=tstzrange(day::timestamp at time zone zone_name,(day+1)::timestamp at time zone zone_name,'[)');
 if not missing_time then
  local_start:=day+start_clock; local_end:=day+end_clock+case when end_clock<start_clock then interval '1 day' else interval '0' end;
  start_at:=local_start at time zone zone_name; end_at:=local_end at time zone zone_name;
  invalid_clock:=(start_at at time zone zone_name)<>local_start or (end_at at time zone zone_name)<>local_end or end_at<=start_at;
  if not invalid_clock then
   span:=tstzrange(start_at,end_at,'[)');
   -- PostgreSQL chooses the offset following an autumn fold. Report that choice
   -- explicitly; recurring availability itself covers both occurrences above.
   ambiguous_clock:=exists(select 1 from (values(start_at,local_start),(end_at,local_end)) endpoint(instant,wall)
    cross join (values(interval '-1 day'),(interval '1 day')) probe(delta)
    cross join lateral (select (endpoint.wall at time zone 'UTC')-make_interval(secs=>public.availability_utc_offset(endpoint.instant+probe.delta,zone_name)) alternate) alt
    where alt.alternate<>endpoint.instant and (alt.alternate at time zone zone_name)=endpoint.wall);
  end if;
 end if;
 capacity:=public.availability_capacity_for_span(w,emp,coalesce(span,day_span));
 for leave_row in select seg.*,req.revision request_revision,req.status request_status,req_loc.timezone location_timezone
  from public.schedule_time_off_segments seg join public.schedule_time_off_requests req on req.id=seg.request_id and req.workspace_id=seg.workspace_id
  join public.locations req_loc on req_loc.id=req.location_id and req_loc.workspace_id=w
  where req.workspace_id=w and req.employee_id=emp and req.status in ('approved','partially_approved') and seg.status='approved'
   and seg.segment_date between day-3 and day+3 order by seg.id loop
  leave_zone:=coalesce(to_jsonb(leave_row)->>'time_timezone',leave_row.location_timezone);
  if leave_row.start_time is null then leave_span:=tstzrange(leave_row.segment_date::timestamp at time zone leave_zone,(leave_row.segment_date+1)::timestamp at time zone leave_zone,'[)');
  else leave_span:=tstzrange((leave_row.segment_date+leave_row.start_time) at time zone leave_zone,
    (leave_row.segment_date+leave_row.end_time+case when leave_row.end_time<=leave_row.start_time then interval '1 day' else interval '0' end) at time zone leave_zone,'[)'); end if;
  if leave_span && coalesce(span,day_span) then
   leave_ranges:=leave_ranges+tstzmultirange(leave_span*coalesce(span,day_span));
   leave_evidence:=leave_evidence||jsonb_build_array(jsonb_build_object('segment_id',leave_row.id,'request_id',leave_row.request_id,'request_revision',leave_row.request_revision,
    'timezone',leave_zone,'timezone_source',case when to_jsonb(leave_row)->>'time_timezone' is null then 'legacy_location' else 'snapshot' end,
    'intervals',public.availability_ranges_json(tstzmultirange(leave_span*coalesce(span,day_span)))));
  end if;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('request_id',r.id,'revision',r.revision,'status',r.status,'capacity_notice_open',r.capacity_notice_open) order by r.id),'[]') into pending
 from public.availability_requests r where r.workspace_id=w and r.employee_id=emp
  and (r.status in ('pending_review','awaiting_employee','changes_requested') or r.capacity_notice_open)
  and not isempty(public.availability_calendar_mask(coalesce(span,day_span),r.proposal->>'timezone',r.effective_from,r.effective_until));
 remaining:=capacity.available-leave_ranges; unavailable:=capacity.unavailable+leave_ranges; unknown:=capacity.unknown-leave_ranges;
 if span is null then
  definite_block:=isempty(capacity.unknown) and isempty(capacity.available);
  coverage:=case when definite_block or leave_ranges @> day_span then 'none' else 'unknown' end;
 else coverage:=case when not isempty(unknown) then 'unknown' when isempty(remaining) then 'none' when remaining @> span then 'full' else 'partial' end; end if;
 if not isempty(leave_ranges) then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','approved_time_off','message','Approved time off overlaps this assignment. Resolve the leave or assignment before assigning.',
  'intervals',public.availability_ranges_json(leave_ranges),'definite',span is not null or leave_ranges @> day_span)); end if;
 if not isempty(capacity.unavailable) and (span is not null or definite_block) then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','availability','message',case when basis='type_default' then 'The saved reference hours overlap unavailable hours.' else 'The assignment overlaps unavailable hours.' end,
  'intervals',public.availability_ranges_json(capacity.unavailable),'definite',true)); end if;
 if missing_time then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','time_source_unresolved','message','Confirm shift hours before assigning or publishing.','definite',false)); end if;
 if invalid_clock then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','invalid_local_time','message','These hours do not exist on this date in the selected timezone. Choose valid hours.','definite',true)); end if;
 if not isempty(capacity.unknown) then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','availability_unknown','message','Availability has not been confirmed for the entire assignment.','intervals',public.availability_ranges_json(capacity.unknown),'definite',false)); end if;
 if jsonb_array_length(pending)>0 then reasons:=reasons||jsonb_build_array(jsonb_build_object('code','availability_review_pending','message','Resolve the pending availability request or capacity notice before publishing.','definite',true)); end if;
 operation:=case
  when invalid_clock or (not isempty(leave_ranges) and (span is not null or leave_ranges @> day_span)) then 'blocked'
  when settings.availability_enforcement='hard' and not isempty(capacity.unavailable) and (span is not null or definite_block) then 'blocked'
  when missing_time or coverage='unknown' or jsonb_array_length(pending)>0 then 'verification_required'
  when not isempty(capacity.unavailable) then 'warning_requires_override'
  else 'allowed' end;
 fingerprint_payload:=jsonb_build_object('workspace_id',w,'employee_id',emp,'shift',jsonb_build_object('id',shift->>'id','location_id',loc,'job_id',shift->>'job_id',
  'shift_type_id',shift->>'shift_type_id','date',day,'time_basis',basis,'time_snapshot',shift->'time_snapshot','timezone',zone_name,'start',start_clock,'end',end_clock),
  'intervals',public.availability_ranges_json(case when span is null then '{}'::tstzmultirange else tstzmultirange(span) end),
  'sources',capacity.sources,'leave',leave_evidence,'pending',pending,'policy_revision',settings.availability_policy_revision);
 result:=jsonb_build_object('coverage',coverage,'operation',operation,'time_basis',basis,'timezone',zone_name,
  'assessment_scope',case when span is null then 'calendar_day' else 'shift_interval' end,
  'intervals',public.availability_ranges_json(case when span is null then '{}'::tstzmultirange else tstzmultirange(span) end),
  'available_intervals',case when span is null then '[]'::jsonb else public.availability_ranges_json(remaining) end,
  'unavailable_intervals',public.availability_ranges_json(unavailable),'unknown_intervals',public.availability_ranges_json(unknown),
  'sources',capacity.sources,'leave',leave_evidence,'pending',pending,'reasons',reasons,'policy_revision',settings.availability_policy_revision,
  'fold_resolution',case when ambiguous_clock then 'post_transition_offset' else null end,
  'assessment_minutes',case when span is null then null else extract(epoch from upper(span)-lower(span))/60 end,
  'fingerprint',encode(extensions.digest(convert_to(fingerprint_payload::text,'UTF8'),'sha256'),'hex'));
 return result;
end; $$;
revoke all on function public.assess_shift_availability(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
