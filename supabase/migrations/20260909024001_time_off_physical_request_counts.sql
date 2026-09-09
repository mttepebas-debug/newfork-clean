-- Request summaries and final assignment review use the same physical hours.
-- Pending requests use proposed hours; closed requests use only remaining
-- approved leave. Counting never changes a published responsibility.
create function public.time_off_request_assignment_count(w uuid,rid uuid) returns integer
language plpgsql stable security definer set search_path='' as $$
declare r public.schedule_time_off_requests%rowtype; periods tstzmultirange;
begin
 select * into r from public.schedule_time_off_requests where id=rid and workspace_id=w;
 if r.id is null or r.request_type<>'time_off' then return 0; end if;
 select coalesce(range_agg(span),'{}') into periods from public.schedule_time_off_segments s
 cross join lateral unnest(public.time_off_effective_ranges(s.id)) pieces(span)
 where s.request_id=rid and s.workspace_id=w;
 return jsonb_array_length(public.time_off_assignment_impact(w,r.employee_id,periods));
end $$;
revoke all on function public.time_off_request_assignment_count(uuid,uuid) from public,anon,authenticated,service_role;

do $counts$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.get_schedule_requests_service(uuid,uuid,text,text,uuid,text,timestamptz,timestamptz,integer)'::regprocedure);
 anchor:='(select count(*) from public.schedule_published_shifts ps join public.schedule_location_publications p on p.id=ps.publication_id and p.status=''current'' where ps.employee_id=r.employee_id and ps.location_id=r.location_id and ps.scheduled_date in(select segment_date from public.schedule_time_off_segments where request_id=r.id))';
 if position(anchor in body)=0 then raise exception 'Time-off request conflict projection changed'; end if;
 execute replace(body,anchor,'public.time_off_request_assignment_count(target_workspace_id,r.id)');
end $counts$;
