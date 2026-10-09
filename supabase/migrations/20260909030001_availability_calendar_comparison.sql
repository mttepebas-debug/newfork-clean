-- Approved and proposed calendars share one physical resolver. The proposed
-- context is private and can only be reached through a validated comparison.
do $comparison$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.availability_calendar_read_service(uuid,uuid,uuid,date,text,integer)'::regprocedure);
 anchor:='day_count integer DEFAULT 7';
 if position(anchor in body)=0 then raise exception 'Calendar signature changed'; end if;
 body:=replace(body,'FUNCTION public.availability_calendar_read_service(','FUNCTION public.availability_calendar_context(');
 body:=replace(body,anchor,'day_count integer, proposed jsonb');
 anchor:='public.availability_capacity_for_span(w,emp,day_span)';
 if position(anchor in body)=0 then raise exception 'Calendar capacity resolver changed'; end if;
 body:=replace(body,anchor,'public.availability_capacity_for_span(w,emp,day_span,proposed)');
 anchor:='public.availability_shift_type_rules(w,emp,day_span)';
 if position(anchor in body)=0 then raise exception 'Calendar type resolver changed'; end if;
 execute replace(body,anchor,'public.availability_shift_type_rules(w,emp,day_span,proposed)');
end $comparison$;
revoke all on function public.availability_calendar_context(uuid,uuid,uuid,date,text,integer,jsonb) from public,anon,authenticated,service_role;

create or replace function public.availability_calendar_read_service(actor uuid,w uuid,employee_id uuid,starts_on date,zone_name text,day_count integer default 7)
returns jsonb language sql stable security definer set search_path='' as $$
 select public.availability_calendar_context(actor,w,employee_id,starts_on,zone_name,day_count,null);
$$;

create function public.availability_calendar_comparison_service(actor uuid,w uuid,command jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare before_calendar jsonb; after_calendar jsonb; p jsonb; r public.availability_requests%rowtype;
 emp uuid; before_day jsonb; after_day jsonb; before_ranges tstzmultirange; after_ranges tstzmultirange; type_changed boolean; changes jsonb:='[]';
begin
 if jsonb_typeof(command) is distinct from 'object' or ((command->>'request_id' is null)=(command->'proposal' is null)) then
  raise exception 'Choose a proposed pattern or an open request to compare' using errcode='22023'; end if;
 emp:=(command->>'employee_id')::uuid;
 if emp is null then raise exception 'Choose an employee to compare' using errcode='22023'; end if;
 before_calendar:=public.availability_calendar_context(actor,w,emp,(command->>'starts_on')::date,command->>'timezone',coalesce((command->>'day_count')::integer,7),null);
 if (before_calendar->>'revision')::integer is distinct from (command->>'expected_revision')::integer then raise exception 'Availability changed; refresh before comparing' using errcode='40001'; end if;
 if command->>'request_id' is not null then
  select * into r from public.availability_requests where workspace_id=w and employee_id=emp and id=(command->>'request_id')::uuid;
  if r.id is null then raise exception 'Availability request not found' using errcode='P0002'; end if;
  if r.status not in('pending_review','awaiting_employee','changes_requested') or r.revision is distinct from (command->>'expected_request_revision')::integer then
   raise exception 'This request changed; reopen it before comparing' using errcode='40001'; end if;
  p:=r.proposal;
 else
  p:=command->'proposal'||jsonb_build_object('replace_version_ids',coalesce(command->'replace_version_ids','[]'));
 end if;
 perform public.validate_availability_week(p->>'timezone',p->'days');
 perform public.validate_availability_shift_types(w,p->'days');
 if p->>'effective_from' is null or not isfinite((p->>'effective_from')::date)
  or (p->>'effective_until' is not null and not isfinite((p->>'effective_until')::date))
  or (p->>'effective_until')::date<(p->>'effective_from')::date or (p->>'kind'='temporary' and p->>'effective_until' is null) then
  raise exception 'Choose valid availability dates' using errcode='22023'; end if;
 perform public.availability_validate_date_override_replacements(w,emp,p,coalesce(p->'replace_version_ids','[]'));
 if public.availability_period_locked(w,emp,(p->>'effective_from')::date,(p->>'effective_until')::date)
  or public.availability_date_overrides_locked(w,emp,public.availability_resolve_date_overrides(p)) then
  raise exception 'This period is published. Availability cannot change published responsibilities.' using errcode='23514'; end if;
 after_calendar:=public.availability_calendar_context(actor,w,emp,(command->>'starts_on')::date,command->>'timezone',coalesce((command->>'day_count')::integer,7),p);
 for before_day in select value from jsonb_array_elements(before_calendar->'days') loop
  select value into after_day from jsonb_array_elements(after_calendar->'days') where value->>'date'=before_day->>'date';
  select coalesce(range_agg(tstzrange((s->>'start_at')::timestamptz,(s->>'end_at')::timestamptz,'[)')),'{}') into before_ranges from jsonb_array_elements(before_day->'planning_available') s;
  select coalesce(range_agg(tstzrange((s->>'start_at')::timestamptz,(s->>'end_at')::timestamptz,'[)')),'{}') into after_ranges from jsonb_array_elements(after_day->'planning_available') s;
  select exists(select 1 from
   (select s->>'shift_type_id' id,range_agg(tstzrange((s->>'start_at')::timestamptz,(s->>'end_at')::timestamptz,'[)')) spans from jsonb_array_elements(before_day->'shift_type_rules') s group by s->>'shift_type_id') b
   full join (select s->>'shift_type_id' id,range_agg(tstzrange((s->>'start_at')::timestamptz,(s->>'end_at')::timestamptz,'[)')) spans from jsonb_array_elements(after_day->'shift_type_rules') s group by s->>'shift_type_id') a using(id)
   where b.spans is distinct from a.spans) into type_changed;
  changes:=changes||jsonb_build_array(jsonb_build_object('date',before_day->>'date','shift_type_rules_changed',type_changed,
   'newly_available',public.availability_ranges_json(after_ranges-before_ranges),'no_longer_available',public.availability_ranges_json(before_ranges-after_ranges)));
 end loop;
 return jsonb_build_object('before',before_calendar,'after',after_calendar,'changes',changes);
end $$;
revoke all on function public.availability_calendar_comparison_service(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.availability_calendar_comparison_service(uuid,uuid,jsonb) to service_role;
