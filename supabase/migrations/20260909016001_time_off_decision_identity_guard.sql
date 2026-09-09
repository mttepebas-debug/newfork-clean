-- Every pending requested segment must receive exactly one decision. Counting
-- joined JSON rows alone lets duplicate IDs stand in for an omitted segment.
do $decision_identity$
declare body text; anchor text;
begin
 body:=pg_get_functiondef('public.resolve_schedule_time_off_request_service(uuid,uuid,uuid,integer,text,text,jsonb)'::regprocedure);
 anchor:='elsif target_action=''partial_approve'' then';
 if position(anchor in body)=0 then raise exception 'Time-off decision transition changed'; end if;
 execute replace(body,anchor,anchor||$guard$
  if jsonb_typeof(target_segment_decisions) is distinct from 'array' then
   raise exception 'Every requested time-off segment needs exactly one decision' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(target_segment_decisions) d where jsonb_typeof(d)<>'object'
    or d->>'segment_id' is null or d->>'status' is null or d->>'status' not in ('approved','denied')) then
   raise exception 'Every requested time-off segment needs exactly one valid decision' using errcode='22023'; end if;
  if (select count(distinct (d->>'segment_id')::uuid) from jsonb_array_elements(target_segment_decisions) d)<>jsonb_array_length(target_segment_decisions)
    or exists(select 1 from jsonb_array_elements(target_segment_decisions) d where not exists(
     select 1 from public.schedule_time_off_segments s where s.workspace_id=target_workspace_id and s.request_id=r.id
      and s.id=(d->>'segment_id')::uuid and s.status='pending')) then
   raise exception 'Review each requested time-off segment once; duplicate or unrelated decisions are not allowed' using errcode='22023'; end if;
$guard$);
end; $decision_identity$;
