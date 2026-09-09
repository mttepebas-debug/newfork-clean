-- Private, bounded advisory projection; assignment commands always reassess.
create function public.weekly_schedule_location_projection(w uuid,emp uuid,loc uuid,week_start date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare zone_name text; location_name text; target_span tstzrange; piece_span tstzrange; capacity jsonb;
 unavailable tstzmultirange:='{}'; piece_unavailable tstzmultirange; leave_ranges tstzmultirange;
 clocks jsonb:='[]'; piece_clocks jsonb; days jsonb; result jsonb; offset_days integer;
begin
 select timezone,name into zone_name,location_name from public.locations where workspace_id=w and id=loc;
 result:=jsonb_build_object('location_id',loc,'location_name',location_name,'timezone',zone_name,'week_start',week_start);
 target_span:=tstzrange(week_start::timestamp at time zone zone_name,(week_start+8)::timestamp at time zone zone_name,'[)');
 -- The existing timezone helper bounds calls to eight physical days. Two pieces
 -- also cover the overnight tail during a 25-hour fall-back day.
 foreach offset_days in array array[0,4] loop
  piece_span:=tstzrange((week_start+offset_days)::timestamp at time zone zone_name,(week_start+offset_days+4)::timestamp at time zone zone_name,'[)');
  capacity:=public.weekly_preference_capacity(w,emp,piece_span,zone_name);
  select coalesce(range_agg(tstzrange((x->>'start_at')::timestamptz,(x->>'end_at')::timestamptz,'[)')),'{}') into piece_unavailable
   from jsonb_array_elements(capacity->'unavailable_intervals') x;
  unavailable:=unavailable+piece_unavailable;
  select coalesce(jsonb_agg(jsonb_build_object('start_at',lower(utc_span),'end_at',upper(utc_span),'offset_seconds',offset_seconds) order by lower(utc_span)),'[]') into piece_clocks
   from public.availability_offset_segments(piece_span,zone_name);
  clocks:=clocks||piece_clocks;
 end loop;
 select coalesce(range_agg(piece.span*target_span),'{}') into leave_ranges
  from public.schedule_time_off_segments seg join public.schedule_time_off_requests req on req.id=seg.request_id and req.workspace_id=seg.workspace_id
  cross join lateral unnest(public.time_off_effective_ranges(seg.id)) piece(span)
  where req.workspace_id=w and req.employee_id=emp and req.request_type='time_off'
   and req.status in('approved','partially_approved') and seg.status='approved'
   and seg.segment_date between week_start-4 and week_start+12 and piece.span && target_span;
 select jsonb_agg(jsonb_build_object('date',work_date,'has_unavailable',unavailable && day_span,'all_day',unavailable @> day_span) order by work_date) into days
  from (select week_start+i work_date,tstzrange((week_start+i)::timestamp at time zone zone_name,(week_start+i+1)::timestamp at time zone zone_name,'[)') day_span from generate_series(0,6) i) d;
 return result||jsonb_build_object('status','ready','unavailable_intervals',public.availability_ranges_json(unavailable),
  'leave_intervals',public.availability_ranges_json(leave_ranges),'clock_segments',clocks,'days',days);
exception when invalid_parameter_value then
 return result||jsonb_build_object('status','unknown','unavailable_intervals','[]'::jsonb,'leave_intervals','[]'::jsonb,'clock_segments','[]'::jsonb,'days','[]'::jsonb);
end; $$;
revoke all on function public.weekly_schedule_location_projection(uuid,uuid,uuid,date) from public,anon,authenticated,service_role;

create or replace function public.get_schedule_read_model_availability_v2_service(actor_user_id uuid,target_workspace_id uuid,target_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare model jsonb; employees jsonb;
begin
 model:=public.get_schedule_read_model_service(actor_user_id,target_workspace_id,target_date);
 if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.read') then
  raise exception 'Manager schedule read access required' using errcode='42501'; end if;
 select coalesce(jsonb_agg((e.value-'availability_versions'-'availability')||jsonb_build_object('availability',null,'weekly_availability',
  coalesce((select jsonb_agg(public.weekly_schedule_location_projection(target_workspace_id,(e.value->>'id')::uuid,(l->>'id')::uuid,(model->>'week_start')::date) order by l->>'id')
   from jsonb_array_elements(model->'locations') l where e.value->'location_ids' ? (l->>'id')
    and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.read',(l->>'id')::uuid)),'[]')) order by e.n),'[]')
  into employees from jsonb_array_elements(model->'employees') with ordinality e(value,n);
 return public.schedule_availability_enrich_read(actor_user_id,target_workspace_id,jsonb_set(model,'{employees}',employees));
end; $$;
revoke all on function public.get_schedule_read_model_availability_v2_service(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.get_schedule_read_model_availability_v2_service(uuid,uuid,date) to service_role;
