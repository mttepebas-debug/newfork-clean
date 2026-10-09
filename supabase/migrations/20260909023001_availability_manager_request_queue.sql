-- A scoped queue for the existing availability lifecycle. Decisions remain in
-- availability_command_service; listing never grants authority to review.
create function public.availability_requests_read_service(actor uuid,w uuid,filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare queue text:=coalesce(filters->>'queue','needs_review'); search text:=btrim(coalesce(filters->>'search',''));
 location_id uuid; request_id uuid; page_size integer; cursor_value jsonb; before_created timestamptz; before_id uuid; result jsonb;
begin
 if not public.schedule_actor_has_capability_service(actor,w,'employees.read') then raise exception 'Employee availability read access required' using errcode='42501'; end if;
 if jsonb_typeof(filters) is distinct from 'object' or queue not in ('needs_review','waiting_employee','history') or length(search)>100 then
  raise exception 'Choose a valid availability queue and search' using errcode='22023'; end if;
 begin
  location_id:=nullif(filters->>'location_id','')::uuid; request_id:=nullif(filters->>'request_id','')::uuid;
  page_size:=coalesce((filters->>'limit')::integer,40);
  if nullif(filters->>'cursor','') is not null then
   cursor_value:=(filters->>'cursor')::jsonb; before_created:=(cursor_value->>'created_at')::timestamptz; before_id:=(cursor_value->>'id')::uuid;
   if jsonb_typeof(cursor_value)<>'object' or before_created is null or not isfinite(before_created) or before_id is null then raise exception 'Invalid cursor'; end if;
  end if;
 exception when others then raise exception 'Invalid availability queue filter' using errcode='22023'; end;
 if page_size not between 1 and 100 then raise exception 'Choose 1 to 100 requests per page' using errcode='22023'; end if;
 if location_id is not null and (not public.schedule_actor_has_capability_service(actor,w,'employees.read',location_id)
  or not exists(select 1 from public.locations l where l.id=location_id and l.workspace_id=w)) then
  raise exception 'Availability location access denied' using errcode='42501'; end if;
 with visible as materialized (
  select r.*,e.user_id,concat_ws(' ',nullif(e.first_name,''),nullif(e.last_name,'')) employee_name,e.employee_code,
   public.availability_actor_scope(actor,w,e.id,true) all_scope,
   coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by l.name,l.id)
    from public.employee_location_assignments a join public.locations l on l.id=a.location_id and l.workspace_id=a.workspace_id
    where a.workspace_id=w and a.employee_id=e.id and a.ended_at is null and public.schedule_actor_has_capability_service(actor,w,'employees.read',l.id)),'[]') locations,
   case when r.status='pending_review' or (r.capacity_notice_open and r.status in ('denied','changes_requested')) then 'needs_review'
    when r.status in ('awaiting_employee','changes_requested') then 'waiting_employee' else 'history' end request_queue
  from public.availability_requests r join public.employee_profiles e on e.id=r.employee_id and e.workspace_id=r.workspace_id
  where r.workspace_id=w and e.archived_at is null and public.availability_actor_scope(actor,w,e.id,false)
 ), summaries as materialized (
  select v.*,jsonb_build_object('id',v.id,'employee_id',v.employee_id,'employee_name',v.employee_name,'employee_code',v.employee_code,
   'locations',v.locations,'queue',v.request_queue,'status',v.status,'kind',v.kind,'source',v.source,
   'effective_from',v.effective_from,'effective_until',v.effective_until,'timezone',v.proposal->>'timezone',
   'capacity_notice_open',v.capacity_notice_open,'is_narrowing',v.is_narrowing,'created_at',v.created_at,
   'can_review',v.all_scope and v.user_id is distinct from actor and v.author_id<>actor,
   'review_blocker',case when v.user_id=actor then 'self_review' when v.author_id=actor then 'author_review'
    when not v.all_scope then 'location_scope' else null end) summary
  from visible v
 ), filtered as materialized (
  select * from summaries s where (search='' or strpos(lower(s.employee_name||' '||s.employee_code),lower(search))>0)
   and (location_id is null or exists(select 1 from jsonb_array_elements(s.locations) l where (l->>'id')::uuid=location_id))
 ), page as materialized (
  select * from filtered f where f.request_queue=queue and (before_created is null or (f.created_at,f.id)<(before_created,before_id))
  order by f.created_at desc,f.id desc limit page_size+1
 ), displayed as materialized (select * from page order by created_at desc,id desc limit page_size)
 select jsonb_build_object('workspace_id',w,'queue',queue,
  'requests',coalesce((select jsonb_agg(summary order by created_at desc,id desc) from displayed),'[]'),
  'selected',(select summary from summaries s where s.id=request_id),
  'needs_review_count',(select count(*) from filtered where request_queue='needs_review'),
  'waiting_employee_count',(select count(*) from filtered where request_queue='waiting_employee'),
  'history_count',(select count(*) from filtered where request_queue='history'),
  'next_cursor',case when (select count(*) from page)>page_size then (select jsonb_build_object('created_at',created_at,'id',id)::text from displayed order by created_at,id limit 1) else null end,
  'locations',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by l.name,l.id),'[]') from public.locations l
    where l.workspace_id=w and l.archived_at is null and public.schedule_actor_has_capability_service(actor,w,'employees.read',l.id))) into result;
 return result;
end $$;
revoke all on function public.availability_requests_read_service(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.availability_requests_read_service(uuid,uuid,jsonb) to service_role;

-- Version the manager destination so already queued v1 notifications keep their
-- original route contract. New events open the exact request, including history.
insert into public.notification_catalog(type_key,schema_version,category,severity,sensitivity,supported_channels,default_cadence,
 audience_contract,action_route_contract,dedupe_policy,retention_class,template_key,lifecycle,mandatory_in_app)
select type_key,2,category,severity,sensitivity,supported_channels,default_cadence,audience_contract,
 '{"route":"/app/schedule/requests","allowed_query_keys":["tab","request"]}'::jsonb,dedupe_policy,retention_class,
 'availability.review_required.v2',lifecycle,mandatory_in_app from public.notification_catalog
where type_key='availability.review_required' and schema_version=1;
insert into public.notification_template_versions(type_key,schema_version,channel,locale,template_version,template_key,content,status,published_at)
select type_key,2,channel,locale,1,'availability.review_required.v2',
 content||'{"action_url":"/app/schedule/requests?tab=availability"}'::jsonb,'published',now()
from public.notification_template_versions where type_key='availability.review_required' and schema_version=1 and template_version=1;
insert into public.notification_producer_registry(type_key,schema_version,producer_id,source_migration,source_function)
values('availability.review_required',2,'availability_lifecycle_v2','20260909023001_availability_manager_request_queue.sql','availability_notify');
do $notification$ declare body text; anchor text; begin
 body:=pg_get_functiondef('public.availability_notify(public.availability_requests,uuid,uuid,text)'::regprocedure);
 anchor:='''availability.review_required'',1,actor';
 if position(anchor in body)=0 then raise exception 'Availability review notification changed'; end if;
 body:=replace(body,anchor,'''availability.review_required'',2,actor');
 anchor:='''action_url'',''/app/employees''';
 if position(anchor in body)=0 then raise exception 'Availability notification destination changed'; end if;
 execute replace(body,anchor,'''action_url'',''/app/schedule/requests?tab=availability&request=''||r.id::text');
end $notification$;
