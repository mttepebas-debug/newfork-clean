-- New staffing results link to the employee's affected local day, including
-- assignments beyond the default six-week window. Existing inbox history stays intact.
update public.notification_catalog
set action_route_contract=jsonb_set(action_route_contract,'{allowed_query_keys}','["staffing_offer","date","location","view"]'::jsonb)
where type_key='schedule.staffing.assignment_changed' and schema_version=1;

create or replace function public.lineup_staffing_enqueue_notification(nid uuid)
returns uuid language plpgsql set search_path='' as $$
declare n public.notifications%rowtype; p public.lineup_proposals%rowtype; e public.lineup_operation_events%rowtype;
 loc uuid; locations uuid[]; actor uuid; destination text; key text; person uuid; assignment_date date;
begin
 select * into n from public.notifications where id=nid;
 if n.source_type='lineup_proposal' then
  select * into p from public.lineup_proposals where workspace_id=n.workspace_id and id=n.source_id and kind='offer';
  if p.id is null or n.event_key not in('requested','accepted','declined','cancelled','coverage_filled') then return null; end if;
  loc:=p.source_location_id; locations:=array[p.source_location_id,p.target_location_id]; actor:=case when n.event_key='requested' then p.created_by else null end;
  key:=case when n.event_key in('requested','accepted') then 'schedule.staffing.offer_updated' else 'schedule.staffing.offer_closed' end;
  destination:=case when n.event_key in('accepted','declined') then '/app/schedule/lineup?date='||p.source_date::text||'&location='||loc::text
   else '/app/employee-hub/lineup?staffing_offer='||p.id::text end;
 elsif n.source_type='lineup_operation' then
  select * into e from public.lineup_operation_events where workspace_id=n.workspace_id and id=n.source_id;
  if e.id is null or n.event_key not in('assignment_changed','manager_assignment_changed') then return null; end if;
  locations:=e.location_ids; loc:=locations[1]; actor:=e.actor_user_id; key:='schedule.staffing.assignment_changed';
  if n.event_key='manager_assignment_changed' then
   select candidate into loc from unnest(locations) candidate
   where public.schedule_actor_has_capability_service(n.recipient_user_id,n.workspace_id,'schedule.lineup.manage',candidate)
    and public.schedule_actor_can_publish_service(n.recipient_user_id,n.workspace_id,candidate)
   order by candidate limit 1;
   if loc is null then return null; end if;
  end if;
  select id into person from public.employee_profiles where workspace_id=n.workspace_id and user_id=n.recipient_user_id;
  assignment_date:=case
   when e.kind='swap' and person::text=e.before_state->'source'->>'employee_id' then coalesce((e.after_state->>'counterpart_date')::date,e.date)
   when e.kind='swap' and person::text=e.before_state->'other'->>'employee_id' then coalesce((e.after_state->>'source_date')::date,e.date)
   when person::text=e.after_state->'operation'->>'employee_id' then e.date
   when person::text=e.before_state->'source'->>'employee_id' then coalesce((e.after_state->>'source_date')::date,e.date)
   else e.date end;
  destination:=case when n.event_key='assignment_changed' then '/app/employee-hub/schedule?date='||assignment_date::text||'&view=day'
   else '/app/schedule/lineup?date='||e.date::text||'&location='||loc::text end;
 else return null;
 end if;
 -- Original UUID is the idempotency key; replays cannot multiply the event.
 return public.enqueue_notification_outbox_service(n.workspace_id,n.id,key,1,actor,'lineup_staffing_notifications',n.id::text,
  jsonb_build_object('correlation_id',n.id,'legacy_notification_id',n.id,'location_id',loc,'location_ids',to_jsonb(locations),
   'recipient_user_ids',jsonb_build_array(n.recipient_user_id),'audience_contract','lineup_staffing_participants',
   'title',n.title,'body',n.body,'safe_preview','A staffing update is available.','action_url',destination,
   'group_key','staffing:'||n.source_id::text||':'||n.event_key),n.created_at);
end; $$;
