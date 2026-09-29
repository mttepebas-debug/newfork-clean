-- BL-182 + BL-127 (G9b; KARARLAR "Takas ... uygunluk", KK-19): approved time
-- off can be given back for a shift, in one way only.
--
-- Before: approved time off blocked every path the same way. An employee could
-- not take a shift inside their own leave through Shift Hub (the rule says they
-- may, after agreeing), and a manager's only way out was to cancel the leave.
--
-- After:
-- * app_private.shorten_time_off is the one way to shorten approved time off:
--   a system-written cancellation of exactly those hours, approved at once
--   (the same rows an approved cancellation leaves, so every reader of
--   time_off_effective_ranges agrees). Whoever approved the leave is told
--   (requests.time_off.shortened); the time-off review notices stay quiet for
--   these rows and the notification check does not count them.
-- * Shift Hub: the employee is asked about their own approved time off with
--   the question they already get for their own availability
--   (availability_warning, now with time_off_intervals). The hours they agree
--   to are kept with the application (time_off_consent) or, for the other side
--   of a swap, with the request (owner_time_off_consent). The candidate check
--   sets aside approved time off only for those hours and only when it is the
--   one blocker; the leave shortens at the manager's final approval (KK-19), so
--   a rejected application gives nothing back. Cover searches, notices to
--   possible takers and a manager's Schedule pass no agreement: someone on
--   approved leave is still never offered, and the assignment guard and the
--   transfer's own check (record_weekly_exchange_acceptance) stay strict.
-- * shorten_time_off_service: whoever may decide the leave (time_off.decide,
--   one rank up, never one's own) gives back hours of it; the employee and
--   whoever approved it are told. No new core action: shortening is deciding
--   a cancellation of that leave.

alter table public.shift_exchange_applications
  add column time_off_consent jsonb not null default '[]' check (jsonb_typeof(time_off_consent) = 'array');
alter table public.shift_exchange_cases
  add column owner_time_off_consent jsonb not null default '[]' check (jsonb_typeof(owner_time_off_consent) = 'array');

create function public.availability_json_ranges(intervals jsonb)
returns tstzmultirange
language sql
immutable
set search_path = ''
as $$
 select coalesce(range_agg(tstzrange((x->>'start_at')::timestamptz, (x->>'end_at')::timestamptz, '[)')), '{}')
 from jsonb_array_elements(coalesce(intervals, '[]')) x;
$$;

-- The approved time off an assessment found, as availability_ranges_json intervals.
create function public.time_off_leave_intervals(assessment jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
 select coalesce((select r->'intervals' from jsonb_array_elements(assessment->'reasons') r
  where r->>'code' = 'approved_time_off' limit 1), '[]');
$$;

create or replace function public.weekly_exchange_employee_warning(w uuid, emp uuid, target jsonb)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare a jsonb; leave jsonb;
begin
 a:=public.assess_weekly_shift_availability(w,emp,target||jsonb_build_object('scheduled_date',target->>'date'));
 leave:=public.time_off_leave_intervals(a);
 -- Their own approved time off is asked about only when it is the one thing
 -- in the way (BL-182); anything else that blocks is not theirs to set aside.
 if a->>'operation'='verification_required' or (a->>'operation'='blocked' and (jsonb_array_length(leave)=0
  or exists(select 1 from jsonb_array_elements(a->'reasons') r where r->>'severity'='block' and r->>'code'<>'approved_time_off'))) then
  return null; end if;
 if jsonb_array_length(a->'employee_intervals')=0 and jsonb_array_length(leave)=0 then return null; end if;
 return jsonb_build_object('fingerprint',encode(extensions.digest(convert_to(jsonb_build_object(
  'workspace',w,'employee',emp,'source',target->>'source_id','location',target->>'location_id',
  'intervals',a->'intervals','conflicts',a->'employee_intervals','time_off',leave)::text,'UTF8'),'sha256'),'hex'),
  'time_off_intervals',leave);
end; $$;

-- The approved time off the employee has just agreed to give up for this shift
-- (asked after require_weekly_exchange_employee_warning checked the answer).
create function public.weekly_exchange_time_off_consent(w uuid, emp uuid, target jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
 select coalesce(public.weekly_exchange_employee_warning(w,emp,target)->'time_off_intervals','[]'::jsonb);
$$;

-- A time-off event of a shortening: its own piece (marked on the submitted
-- event) or the leave's event that records it.
create function public.time_off_event_is_shortening(w uuid, rid uuid, metadata jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
 select coalesce(metadata->>'shortened','')='true' or exists(select 1 from public.schedule_time_off_events e
  where e.workspace_id=w and e.request_id=rid and e.action='submitted' and e.metadata->>'shortened'='true');
$$;

insert into public.notification_catalog (
  type_key, schema_version, category, severity, sensitivity, supported_channels,
  default_cadence, audience_contract, action_route_contract, dedupe_policy,
  retention_class, template_key, lifecycle, mandatory_in_app, notification_scope
)
values (
  'requests.time_off.shortened', 1, 'requests', 'info', 'confidential',
  '{in_app}', 'immediate', 'time_off_deciders',
  '{"route": "/app/schedule/requests", "allowed_query_keys": ["tab", "request"]}',
  '{"scope": "event_recipient", "strategy": "keep_first", "key_fields": ["event_id", "recipient_user_id"]}',
  'sensitive_30d', 'requests.time_off.shortened.v1', 'active', false, 'workspace'
);

create function public.notify_time_off_shortened(actor uuid, w uuid, parent_id uuid, cut tstzmultirange, zone_name text, source jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare fmt text; employee_user uuid; employee_name text; lines text; deciders uuid[];
 by_manager boolean:=coalesce(source->>'source','')='manager';
begin
 fmt := case when (select s.time_format from public.workspace_scheduling_settings s where s.workspace_id = w) = '24h'
  then 'HH24:MI' else 'FMHH12:MI AM' end;
 select e.user_id, coalesce(nullif(e.preferred_name, ''), e.first_name) into employee_user, employee_name
  from public.schedule_time_off_requests r join public.employee_profiles e on e.id = r.employee_id and e.workspace_id = r.workspace_id
  where r.id = parent_id and r.workspace_id = w;
 -- "Wed, Oct 1, 10:00 AM–2:00 PM", in the leave's own time zone.
 select string_agg(to_char(lower(p) at time zone zone_name, 'Dy, Mon FMDD') || ', ' || to_char(lower(p) at time zone zone_name, fmt)
   || '–' || to_char(upper(p) at time zone zone_name, fmt), '; ' order by lower(p))
  into lines from unnest(cut) p;
 -- Whoever approved the leave (its decisions), but not the one shortening it
 -- and not the employee: the owner's own leave is approved by themselves.
 select coalesce(array_agg(distinct ev.actor_user_id order by ev.actor_user_id), '{}') into deciders
  from public.schedule_time_off_events ev
  join public.workspace_memberships m on m.workspace_id = w and m.user_id = ev.actor_user_id and m.status = 'active'
  where ev.workspace_id = w and ev.request_id = parent_id and ev.action in ('approved', 'partially_approved')
   and ev.metadata ? 'segments' and ev.actor_user_id <> actor and ev.actor_user_id is distinct from employee_user;
 if cardinality(deciders) > 0 then
  perform public.enqueue_notification_outbox_service(w, gen_random_uuid(), 'requests.time_off.shortened', 1, actor,
   'schedule_time_off_requests', parent_id::text,
   jsonb_build_object('request_id', parent_id, 'recipient_user_ids', to_jsonb(deciders),
    'audience_contract', 'time_off_deciders', 'category', 'requests',
    'title', left(coalesce(employee_name, 'An employee') || '''s time off was shortened', 160),
    'body', left(lines || case when by_manager then ' is back on the schedule.' else ' — they took a shift in these hours.' end, 500),
    'safe_preview', 'Approved time off was shortened.',
    'action_url', '/app/schedule/requests?tab=time-off&request=' || parent_id::text,
    'group_key', 'schedule_time_off_requests:' || parent_id::text),
   now());
 end if;
 -- The employee agreed in Shift Hub themselves; a manager's shortening is news to them.
 if by_manager and employee_user is not null and employee_user <> actor
  and exists (select 1 from public.workspace_memberships m where m.workspace_id = w and m.user_id = employee_user and m.status = 'active') then
  perform public.enqueue_notification_outbox_service(w, gen_random_uuid(), 'requests.time_off.shortened', 1, actor,
   'schedule_time_off_requests', parent_id::text,
   jsonb_build_object('request_id', parent_id, 'recipient_user_ids', jsonb_build_array(employee_user),
    'audience_contract', 'time_off_requester', 'category', 'requests',
    'title', 'Your time off was shortened',
    'body', left(lines || ' is no longer time off. Your manager can put you on the schedule then.', 500),
    'safe_preview', 'Approved time off was shortened.',
    'action_url', '/app/employee-hub/my-availability#request-' || parent_id::text,
    'group_key', 'schedule_time_off_requests:' || parent_id::text),
   now());
 end if;
end;
$$;

insert into public.notification_producer_registry (type_key, schema_version, producer_id, source_migration, source_function, integration_contract)
values ('requests.time_off.shortened', 1, 'time-off-shortened',
  '20260929190000_time_off_shortens_for_a_shift.sql', 'notify_time_off_shortened', 'outbox_v1');
insert into public.notification_template_versions (type_key, schema_version, channel, locale, template_version, template_key, content, status, published_at)
values ('requests.time_off.shortened', 1, 'in_app', 'en', 1, 'requests.time_off.shortened.v1',
  '{"title": "Time off was shortened", "body": "Approved time off was shortened.", "action_url": "/app/schedule/requests", "safe_preview": "Approved time off was shortened."}',
  'published', now());

-- The one way approved time off is shortened. Each approved leave of the
-- employee that meets the cut gets a cancellation of exactly those hours,
-- approved at once by the actor. The caller has authorized the actor.
create function app_private.shorten_time_off(actor uuid, w uuid, emp uuid, cut tstzmultirange, note text, source jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare parent public.schedule_time_off_requests%rowtype; seg record; rid uuid; sid uuid; zone_name text;
 given tstzmultirange; remaining tstzmultirange; next_status public.time_off_request_status; said text; result jsonb:='[]';
begin
 perform public.availability_lock_workspace(w);
 if cut is null or isempty(cut) then return result; end if;
 if exists(select 1 from unnest(cut) x where lower(x)<=now() or not isfinite(lower(x)) or not isfinite(upper(x))) then
  raise exception 'Only future approved hours can be given back' using errcode='22023'; end if;
 said:=left(btrim(coalesce(note,'')),1000);
 for parent in select r.* from public.schedule_time_off_requests r
  where r.workspace_id=w and r.employee_id=emp and r.request_type='time_off' and r.status in('approved','partially_approved')
   and exists(select 1 from public.schedule_time_off_segments s where s.request_id=r.id and s.workspace_id=w and public.time_off_effective_ranges(s.id) && cut)
  order by r.created_at, r.id for update loop
  rid:=gen_random_uuid(); given:='{}';
  insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,request_type,reason,created_by,period_version)
   values(rid,w,emp,parent.location_id,'time_off_cancellation',said,actor,2);
  insert into public.time_off_cancellation_links values(rid,w,parent.id,parent.revision);
  for seg in select s.id,s.time_timezone,p.piece from public.schedule_time_off_segments s
   cross join lateral unnest(public.time_off_effective_ranges(s.id)*cut) p(piece)
   where s.request_id=parent.id and s.workspace_id=w order by lower(p.piece) loop
   if seg.time_timezone is null then
    raise exception 'Review the original time zone of this time off before shortening it' using errcode='22023'; end if;
   zone_name:=seg.time_timezone; sid:=gen_random_uuid();
   insert into public.schedule_time_off_segments(id,workspace_id,request_id,segment_date,start_time,end_time,time_timezone,starts_at,ends_at,ends_next_day)
    values(sid,w,rid,(lower(seg.piece) at time zone zone_name)::date,(lower(seg.piece) at time zone zone_name)::time,(upper(seg.piece) at time zone zone_name)::time,
     zone_name,lower(seg.piece),upper(seg.piece),(upper(seg.piece) at time zone zone_name)::date>(lower(seg.piece) at time zone zone_name)::date);
   insert into public.time_off_cancellation_periods values(sid,w,rid,seg.id,parent.id);
   given:=given+tstzmultirange(seg.piece);
  end loop;
  insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata)
   values(w,rid,'submitted',actor,said,jsonb_build_object('parent_request_id',parent.id,'parent_revision',parent.revision,'shortened',true,'source',source));
  perform public.apply_time_off_period_decision(actor,w,rid,1,'approve',said,'[]');
  select coalesce(range_agg(p.span),'{}') into remaining from public.schedule_time_off_segments s
   cross join lateral unnest(public.time_off_effective_ranges(s.id)) p(span) where s.request_id=parent.id and s.workspace_id=w;
  next_status:=case when isempty(remaining) then 'revoked'::public.time_off_request_status else 'partially_approved'::public.time_off_request_status end;
  update public.schedule_time_off_requests set status=next_status,revision=revision+1,updated_at=now() where id=parent.id returning * into parent;
  insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata)
   values(w,parent.id,next_status::text,actor,said,jsonb_build_object('revision',parent.revision,'cancellation_request_id',rid,
    'cancelled_intervals',public.availability_ranges_json(given),'shortened',true,'source',source));
  perform public.notify_time_off_shortened(actor,w,parent.id,given,zone_name,source);
  result:=result||jsonb_build_array(jsonb_build_object('request_id',parent.id,'revision',parent.revision,'status',parent.status,
   'cancellation_request_id',rid,'intervals',public.availability_ranges_json(given)));
 end loop;
 return result;
end;
$$;

-- BL-127: a manager gives back hours of approved time off, e.g. to put the
-- employee on a shift that day. Same reach as deciding the leave.
create function public.shorten_time_off_service(actor uuid, w uuid, rid uuid, expected_revision integer, periods jsonb, note text, operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare parent public.schedule_time_off_requests%rowtype; prior public.time_off_commands%rowtype; command jsonb; result jsonb;
 p jsonb; a timestamptz; b timestamptz; span tstzrange; cut tstzmultirange:='{}';
begin
 perform public.availability_lock_workspace(w);
 select * into parent from public.schedule_time_off_requests where id=rid and workspace_id=w and request_type='time_off' for update;
 if parent.id is null then raise exception 'time off request not found' using errcode='P0002'; end if;
 perform app_private.authorize_time_off_decision(actor,w,parent.employee_id,parent.location_id,'shorten');
 if operation_id is null then raise exception 'A request key is required' using errcode='22023'; end if;
 command:=jsonb_build_object('kind','shorten','request_id',rid,'expected_revision',expected_revision,'periods',periods,'note',btrim(coalesce(note,'')));
 select * into prior from public.time_off_commands c where c.workspace_id=w and c.actor_user_id=actor and c.operation_id=shorten_time_off_service.operation_id;
 if found then
  if prior.input<>command then raise exception 'This request key was used for a different change' using errcode='40001'; end if;
  return prior.result;
 end if;
 if expected_revision is null or parent.revision<>expected_revision or parent.status not in('approved','partially_approved') then
  raise exception 'stale approved leave; refresh before shortening it' using errcode='40001'; end if;
 if jsonb_typeof(periods) is distinct from 'array' or jsonb_array_length(periods) not between 1 and 124 then
  raise exception 'Choose up to 124 periods of approved hours' using errcode='22023'; end if;
 if char_length(btrim(coalesce(note,'')))>1000 then raise exception 'The note can be at most 1000 characters' using errcode='22023'; end if;
 for p in select value from jsonb_array_elements(periods) loop
  if coalesce(p->>'starts_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or coalesce(p->>'ends_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
   raise exception 'Each period needs exact start and end instants' using errcode='22023'; end if;
  a:=(p->>'starts_at')::timestamptz; b:=(p->>'ends_at')::timestamptz;
  if not isfinite(a) or not isfinite(b) or a>=b or a<=now() then raise exception 'Only future approved hours can be given back' using errcode='22023'; end if;
  span:=tstzrange(a,b,'[)');
  if cut && span or not exists(select 1 from public.schedule_time_off_segments s where s.id=(p->>'segment_id')::uuid and s.workspace_id=w
   and s.request_id=parent.id and public.time_off_effective_ranges(s.id) @> span) then
   raise exception 'Choose approved hours of this time off, without overlap' using errcode='22023'; end if;
  cut:=cut+tstzmultirange(span);
 end loop;
 perform app_private.shorten_time_off(actor,w,parent.employee_id,cut,coalesce(nullif(btrim(coalesce(note,'')),''),'Shortened by a manager.'),
  jsonb_build_object('source','manager','request_id',rid));
 select jsonb_build_object('status',r.status,'request_id',r.id,'revision',r.revision) into result
  from public.schedule_time_off_requests r where r.id=rid;
 insert into public.time_off_commands(workspace_id,actor_user_id,operation_id,input,result) values(w,actor,operation_id,command,result);
 return result;
end;
$$;

CREATE OR REPLACE FUNCTION public.weekly_assignment_candidate_base(w uuid, emp uuid, target jsonb, excluded uuid[] DEFAULT '{}'::uuid[], travel_minutes integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare loc uuid:=(target->>'location_id')::uuid; job uuid:=(target->>'job_id')::uuid;
  d date:=(target->>'date')::date; tz text; span tstzrange; assessment jsonb;
  available tstzmultirange; overlap tstzmultirange; free tstzmultirange; reasons text[]:=array[]::text[]; state text:='eligible';
  consent jsonb:=target->'_time_off_consent'; leave tstzmultirange; waived boolean:=false; op text;
begin
  travel_minutes:=greatest(coalesce(travel_minutes,0),coalesce((select minimum_travel_minutes
    from public.workspace_scheduling_settings where workspace_id=w),0));
  select coalesce(nullif(target->>'time_timezone',''),nullif(target->'time_snapshot'->>'timezone',''),timezone) into tz from public.locations where id=loc and workspace_id=w and archived_at is null;
  if tz is null then raise exception 'location not found'; end if;
  span:=app_private.shift_time_range(d,(target->>'start_time')::time,(target->>'end_time')::time,tz);
  if not exists(select 1 from public.employee_profiles p where p.id=emp and p.workspace_id=w and p.archived_at is null and not p.is_excluded_from_schedule
    and (p.start_date is null or p.start_date<=d)) then reasons:=array_append(reasons,'Employee is not active in Schedule'); end if;
  if not exists(select 1 from public.employee_location_assignments where employee_id=emp and workspace_id=w and location_id=loc and assigned_at<=lower(span) and (ended_at is null or ended_at>=upper(span))) then reasons:=array_append(reasons,'Not assigned to this location'); end if;
  if not exists(select 1 from public.employee_job_assignments where employee_id=emp and workspace_id=w and job_id=job and assigned_at<=lower(span) and (ended_at is null or ended_at>=upper(span))) then reasons:=array_append(reasons,'Not eligible for this position'); end if;
  if exists(select 1 from public.schedule_closures c where c.workspace_id=w and c.location_id=loc and c.closed_date=d and (c.is_all_day or (target->>'shift_type_id')::uuid=any(c.shift_type_ids))) then reasons:=array_append(reasons,'Location or service is closed'); end if;
  if public.employee_has_hard_document_schedule_conflict_service(w,emp,d) then reasons:=array_append(reasons,'Required document is expired'); end if;


  if exists(select 1 from public.employee_profiles where workspace_id=w and id=emp) then
    -- A candidate target names its day as date; the assessment reads scheduled_date.
    assessment:=public.assess_weekly_shift_availability(w,emp,target||jsonb_build_object('scheduled_date',d,'_exclude_shift_ids',to_jsonb(excluded)));
    -- BL-182: approved time off is the one blocker its own employee may set
    -- aside, and only for hours they agreed to: consent is true while they act
    -- themselves, else the intervals kept with their application. Nobody else
    -- (a cover search, a manager's Schedule) passes consent.
    leave:=public.availability_json_ranges(public.time_off_leave_intervals(assessment));
    waived:=coalesce(assessment->>'operation'='blocked' and not isempty(leave)
      and not exists(select 1 from jsonb_array_elements(assessment->'reasons') r
        where r->>'severity'='block' and r->>'code'<>'approved_time_off')
      and (consent='true'::jsonb or (jsonb_typeof(consent)='array' and public.availability_json_ranges(consent) @> leave)),false);
    op:=case when waived then 'warning_requires_override' else assessment->>'operation' end;
    -- Preferences never shorten the requested assignment. Hard blockers remain
    -- in status/reasons; the private assessment carries the separate warning.
    if op in ('allowed','warning_requires_override') then
      select coalesce(range_agg(tstzrange((r->>'start_at')::timestamptz,(r->>'end_at')::timestamptz,'[)')),'{}'::tstzmultirange)
        into free from jsonb_array_elements(assessment->'intervals') r;
    end if;
    state:=case op
      when 'blocked' then 'ineligible'
      when 'verification_required' then 'verification_required'
      else 'eligible' end;
    reasons:=reasons||array(select r->>'message' from jsonb_array_elements(assessment->'reasons') r
      where r->>'code'<>'availability' and not (waived and r->>'code'='approved_time_off'));
  end if;
  select coalesce(range_agg(r),'{}'::tstzmultirange) into overlap from (
    select app_private.shift_time_range(s.scheduled_date,s.start_time,s.end_time,coalesce(s.time_timezone,l.timezone)) r
    from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current'
    join public.locations l on l.id=s.location_id
    where s.workspace_id=w and s.employee_id=emp and not s.id=any(excluded)
      and s.scheduled_date between d-2 and d+2
  ) busy where r && span;
  if overlap && span then state:='ineligible'; reasons:=array_append(reasons,'Overlaps a published shift or approved time off'); end if;
  if travel_minutes>0 and exists(select 1 from (
    select app_private.shift_time_range(s.scheduled_date,s.start_time,s.end_time,coalesce(s.time_timezone,l.timezone)) r
    from public.schedule_published_shifts s
    join public.schedule_location_publications p on p.id=s.publication_id and p.status='current'
    join public.locations l on l.id=s.location_id
    where s.workspace_id=w and s.employee_id=emp and s.location_id<>loc
      and not s.id=any(excluded) and s.scheduled_date between d-2 and d+2
   ) busy where tstzrange(lower(r)-make_interval(mins=>travel_minutes),upper(r)+make_interval(mins=>travel_minutes),'[)') && span) then
    state:='ineligible';reasons:=array_append(reasons,format('At least %s minutes are required between locations',travel_minutes));
  end if;
  if cardinality(reasons)>0 and state='eligible' then state:='ineligible'; end if;
  if exists(select 1 from unnest(reasons) r where r in('Employee is not active in Schedule','Not assigned to this location','Not eligible for this position','Required document is expired','Location or service is closed')) then state:='ineligible'; end if;

  if cardinality(reasons)=0 then
    reasons:=case when coalesce((assessment->>'has_availability_conflict')::boolean,false)
      then array['Position and location match','No assignment blockers']
      else array['Position and location match','Available for the full interval','No conflicts'] end;
  end if;

  return jsonb_build_object('employee_id',emp,'status',state,'shortens_time_off',waived,'reasons',to_jsonb(reasons),'availability',assessment,
    'available_start',case when free is not null and not isempty(free) then (select lower(r)::text from unnest(free) r order by lower(r) limit 1) end,
    'available_end',case when free is not null and not isempty(free) then (select upper(r)::text from unnest(free) r order by lower(r) limit 1) end);
end; $function$;

CREATE OR REPLACE FUNCTION public.weekly_exchange_candidate_check(w uuid, emp uuid, target jsonb, excluded uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('status',r->>'status','reasons',case when r->>'status'='eligible'
  then '["Position and location match","No assignment blockers"]'::jsonb else r->'reasons' end,
  'shortens_time_off',coalesce((r->>'shortens_time_off')::boolean,false))
 from (select public.weekly_assignment_candidate_check(w,emp,target,excluded) r) q;
$function$;

CREATE OR REPLACE FUNCTION public.shift_exchange_preview(actor uuid, w uuid, cid uuid, aid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.shift_exchange_cases%rowtype; a public.shift_exchange_applications%rowtype;
 s jsonb; t jsonb; r jsonb; g jsonb; problems text[]:='{}'; loc uuid; scoped boolean:=false; missing boolean:=false; fp text;
begin
 select * into c from public.shift_exchange_cases where workspace_id=w and id=cid;
 if c.id is null then raise exception 'Request not found' using errcode='P0002'; end if;
 s:=public.shift_exchange_shift(w,c.offered_source_id); t:=public.shift_exchange_shift(w,c.requested_source_id);
 for loc in select distinct x from unnest(array[(c.offered_snapshot->>'location_id')::uuid,(c.requested_snapshot->>'location_id')::uuid]) x where x is not null loop
  scoped:=scoped or public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',loc);
 end loop;
 if not scoped then raise exception 'Manager scope required' using errcode='42501'; end if;
 select * into a from public.shift_exchange_applications where workspace_id=w and case_id=cid and id=aid;
 if a.id is null then raise exception 'Application not found' using errcode='P0002'; end if;
 if c.status<>'open' or a.status<>'pending_manager' then problems:=array_append(problems,'This request is no longer ready for approval'); end if;
 if s is null or (c.kind='swap' and t is null) then problems:=array_append(problems,'The published shift changed or was unpublished'); end if;
 fp:=public.shift_exchange_fingerprint(w,s,t);
 if fp is distinct from c.consent_fingerprint or fp is distinct from a.consent_fingerprint then problems:=array_append(problems,'Shift conditions changed. New employee consent is required'); end if;
 if c.expires_at<=clock_timestamp() or (s->>'starts_at')::timestamptz<=clock_timestamp() or (t->>'starts_at')::timestamptz<=clock_timestamp() then problems:=array_append(problems,'This shift has already started'); end if;
 if exists(select 1 from public.employee_profiles where workspace_id=w and user_id=actor and id in(c.owner_id,a.employee_id)) then problems:=array_append(problems,'A separate manager must approve your own exchange'); end if;
 if s is not null then r:=public.weekly_exchange_candidate_check(w,a.employee_id,s||jsonb_build_object('_time_off_consent',a.time_off_consent),array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null)); end if;
 if r is null then r:='{"status":"ineligible","reasons":["Published shift unavailable"]}'; end if;
 if r->>'status'<>'eligible' then problems:=array_append(problems,'The receiving employee is not eligible for the full shift'); end if;
 if c.kind='swap' and t is not null then
  g:=public.weekly_exchange_candidate_check(w,c.owner_id,t||jsonb_build_object('_time_off_consent',c.owner_time_off_consent),array[(s->>'id')::uuid,(t->>'id')::uuid]::uuid[]);
  if g->>'status'<>'eligible' then problems:=array_append(problems,'The other employee is not eligible for the exchanged shift'); end if;
 end if;
 for loc in select distinct x from unnest(array[(s->>'location_id')::uuid,(t->>'location_id')::uuid]) x where x is not null loop
  if not public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',loc)
   and not exists(select 1 from public.shift_exchange_votes v where v.case_id=cid and v.application_id=aid and v.location_id=loc and v.fingerprint=fp
   and public.schedule_actor_has_capability_service(v.actor_user_id,w,'schedule.shift_change_requests.manage',loc)
   and not exists(select 1 from public.employee_profiles e where e.workspace_id=w and e.user_id=v.actor_user_id and e.id in(c.owner_id,a.employee_id))) then missing:=true; end if;
 end loop;
 return jsonb_build_object('allowed',cardinality(problems)=0,'fingerprint',fp,'reasons',to_jsonb(problems),'receiver',r,'giver',g,'requires_other_manager',missing,
 'other_applications',(select count(*) from public.shift_exchange_applications where case_id=cid and id<>aid and status in('invited','pending_manager')));
end; $function$;

CREATE OR REPLACE FUNCTION public.shift_exchanges_command_service(actor uuid, w uuid, command jsonb, idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp public.employee_profiles%rowtype; c public.shift_exchange_cases%rowtype; a public.shift_exchange_applications%rowtype;
 old_cmd public.shift_exchange_commands%rowtype; s jsonb; t jsonb; checked jsonb; result jsonb; fp text;
 action text:=command->>'action'; cid uuid:=(command->>'case_id')::uuid; aid uuid:=(command->>'application_id')::uuid;
 candidate uuid; loc uuid; other record; expires timestamptz; owns boolean; manager boolean; consent jsonb:='[]';
begin
 if idempotency_key is null then raise exception 'Idempotency key required'; end if;
 if not exists(select 1 from public.workspace_memberships where workspace_id=w and user_id=actor and status='active') then raise exception 'Active workspace access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(w::text,921));
 select * into old_cmd from public.shift_exchange_commands q where q.workspace_id=w and q.actor_user_id=actor and q.idempotency_key=shift_exchanges_command_service.idempotency_key;
 if old_cmd.idempotency_key is not null then
  if old_cmd.command<>command then raise exception 'Idempotency key was used for another action' using errcode='22023'; end if;
  return old_cmd.result;
 end if;
 select * into emp from public.employee_profiles where workspace_id=w and user_id=actor and archived_at is null;
 if action in('create','apply') then
  if emp.id is null then raise exception 'Employee profile required' using errcode='42501'; end if;
  s:=public.shift_exchange_shift(w,(command->>'shift_id')::uuid);
  if s is null or (s->>'starts_at')::timestamptz<=clock_timestamp() then raise exception 'Choose an upcoming published shift' using errcode='PT409'; end if;
  if action='create' then
   if (s->>'employee_id')::uuid is distinct from emp.id then raise exception 'Only the current owner can offer this shift' using errcode='42501'; end if;
   if command->>'kind' not in('cover','swap') then raise exception 'Invalid exchange kind'; end if;
   if command->>'kind'='swap' then
    t:=public.shift_exchange_shift(w,(command->>'requested_shift_id')::uuid);
    if t is null or t->>'employee_id' is null or t->>'employee_id'=emp.id::text or (t->>'starts_at')::timestamptz<=clock_timestamp() then raise exception 'Choose an upcoming teammate shift'; end if;
    candidate:=(t->>'employee_id')::uuid;
    perform public.require_weekly_exchange_employee_warning(actor,w,emp.id,t,command);
    consent:=public.weekly_exchange_time_off_consent(w,emp.id,t);
    if public.weekly_exchange_candidate_check(w,emp.id,t||jsonb_build_object('_time_off_consent',consent),array[(s->>'id')::uuid,(t->>'id')::uuid])->>'status'<>'eligible' then raise exception 'You are not eligible for the teammate shift'; end if;
   else candidate:=(command->>'employee_id')::uuid; end if;
   if candidate=emp.id then raise exception 'Choose a different teammate'; end if;
   if candidate is not null and public.weekly_exchange_candidate_check(w,candidate,s,array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null))->>'status'<>'eligible' then raise exception 'This teammate is not eligible for the full shift'; end if;
   for other in select x.id,public.shift_exchange_live_status(w,x.id) live_status from public.shift_exchange_cases x
    where x.workspace_id=w and x.status='open' and x.offered_source_id=(s->>'source_id')::uuid loop
    if other.live_status<>'open' then
     update public.shift_exchange_cases set status=other.live_status,revision=revision+1,updated_at=now() where id=other.id;
     update public.shift_exchange_applications set status=other.live_status,updated_at=now() where case_id=other.id and status in('invited','pending_manager');
     delete from public.shift_exchange_votes where case_id=other.id;
     perform public.shift_exchange_emit(actor,w,other.id,null,other.live_status,'This offer ended because the shift changed or started. Review the current schedule before making a new request.');
    end if;
   end loop;
   fp:=public.shift_exchange_fingerprint(w,s,t);
   expires:=least((s->>'starts_at')::timestamptz,(t->>'starts_at')::timestamptz);
   insert into public.shift_exchange_cases(workspace_id,kind,audience,offered_source_id,requested_source_id,owner_id,offered_snapshot,requested_snapshot,consent_fingerprint,expires_at,private_note,created_by,owner_time_off_consent)
   values(w,command->>'kind',case when candidate is null then 'eligible_pool' else 'direct' end,(s->>'source_id')::uuid,(t->>'source_id')::uuid,emp.id,s,t,fp,expires,coalesce(command->>'note',''),actor,consent) returning * into c;
   cid:=c.id;
   if candidate is not null then
    insert into public.shift_exchange_applications(workspace_id,case_id,employee_id,status,consent_fingerprint) values(w,cid,candidate,'invited',fp) returning id into aid;
   end if;
   perform public.shift_exchange_emit(actor,w,cid,aid,case when candidate is null then 'cover_opened' else 'peer_invited' end,'Cover or swap requested. The current owner remains responsible until manager approval.');
  else
   if (s->>'employee_id')::uuid=emp.id then raise exception 'You already own this shift'; end if;
   select * into c from public.shift_exchange_cases where workspace_id=w and offered_source_id=(s->>'source_id')::uuid and status='open' for update;
   if c.id is null then
    if s->>'employee_id' is not null then raise exception 'This shift has not been offered for cover'; end if;
    fp:=public.shift_exchange_fingerprint(w,s,null);
    insert into public.shift_exchange_cases(workspace_id,kind,offered_source_id,offered_snapshot,consent_fingerprint,expires_at,created_by)
    values(w,'open_pickup',(s->>'source_id')::uuid,s,fp,(s->>'starts_at')::timestamptz,actor) returning * into c;
   end if;
   if c.audience<>'eligible_pool' or c.kind='swap' or (cid is not null and cid<>c.id) then raise exception 'This offer is not available' using errcode='42501'; end if;
   if public.shift_exchange_fingerprint(w,s,null)<>c.consent_fingerprint then raise exception 'Shift conditions changed. The owner must renew this offer' using errcode='PT409'; end if;
   perform public.require_weekly_exchange_employee_warning(actor,w,emp.id,s,command);
   consent:=public.weekly_exchange_time_off_consent(w,emp.id,s);
   if public.weekly_exchange_candidate_check(w,emp.id,s||jsonb_build_object('_time_off_consent',consent))->>'status'<>'eligible' then raise exception 'You are not eligible for the full shift'; end if;
   cid:=c.id;
   if exists(select 1 from public.shift_exchange_applications where case_id=cid and employee_id=emp.id and status='pending_manager') then raise exception 'You already have an active application'; end if;
   insert into public.shift_exchange_applications(workspace_id,case_id,employee_id,status,consent_fingerprint,time_off_consent) values(w,cid,emp.id,'pending_manager',c.consent_fingerprint,consent) returning id into aid;
   update public.shift_exchange_cases set revision=revision+1,updated_at=now() where id=cid returning * into c;
   perform public.shift_exchange_emit(actor,w,cid,aid,'application_submitted','A teammate requested this shift. The current owner remains responsible.');
  end if;
 else
  select * into c from public.shift_exchange_cases where id=cid and workspace_id=w for update;
  if c.id is null then raise exception 'Request not found' using errcode='P0002'; end if;
  s:=public.shift_exchange_shift(w,c.offered_source_id); t:=public.shift_exchange_shift(w,c.requested_source_id);
  owns:=c.owner_id=emp.id;
  manager:=public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',(c.offered_snapshot->>'location_id')::uuid)
   or (c.kind='swap' and public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',(c.requested_snapshot->>'location_id')::uuid));
  if not coalesce(owns,false) and not coalesce(manager,false) and not exists(select 1 from public.shift_exchange_applications where case_id=cid and employee_id=emp.id) then raise exception 'Request access denied' using errcode='42501'; end if;
  if c.status<>'open' or c.revision is distinct from (command->>'expected_revision')::integer then raise exception 'This request changed. Review the latest details' using errcode='PT409'; end if;
  if c.expires_at<=clock_timestamp() then
   update public.shift_exchange_cases set status='expired',revision=revision+1,updated_at=now() where id=cid returning * into c;
   update public.shift_exchange_applications set status='expired',updated_at=now() where case_id=cid and status in('invited','pending_manager');
   delete from public.shift_exchange_votes where case_id=cid;
   perform public.shift_exchange_emit(null,w,cid,null,'expired','The shift has started. The current owner remains responsible.');
  elsif public.shift_exchange_live_status(w,cid)='invalidated' then
   update public.shift_exchange_cases set status='invalidated',revision=revision+1,updated_at=now() where id=cid returning * into c;
   update public.shift_exchange_applications set status='invalidated',updated_at=now() where case_id=cid and status in('invited','pending_manager');
   delete from public.shift_exchange_votes where case_id=cid;
   perform public.shift_exchange_emit(actor,w,cid,null,'invalidated','Shift details changed. This offer ended without a transfer. Start a new request from the current schedule.');
  elsif action='close' then
   if not coalesce(owns,false) and not coalesce(manager,false) then raise exception 'Only the owner or a manager can close this search' using errcode='42501'; end if;
   if coalesce(length(trim(command->>'reason')),0)=0 then raise exception 'Choose a reason for closing this search'; end if;
   update public.shift_exchange_cases set status='cancelled',revision=revision+1,updated_at=now() where id=cid returning * into c;
   update public.shift_exchange_applications set status='closed_case_cancelled',reason=command->>'reason',updated_at=now() where case_id=cid and status in('invited','pending_manager');
   perform public.shift_exchange_emit(actor,w,cid,null,'case_closed',command->>'reason',coalesce(command->>'private_note',''));
  else
   select * into a from public.shift_exchange_applications where id=aid and case_id=cid and workspace_id=w for update;
   if a.id is null or a.status not in('invited','pending_manager') then raise exception 'This application is no longer active' using errcode='PT409'; end if;
   if action in('accept','decline','withdraw') then
    if a.employee_id is distinct from emp.id then raise exception 'Only the invited employee can respond' using errcode='42501'; end if;
    if action in('accept','decline') and a.status<>'invited' then raise exception 'This invitation already has a response'; end if;
    if action='accept' then
     if public.shift_exchange_fingerprint(w,s,t) is distinct from c.consent_fingerprint then raise exception 'Shift conditions changed. Ask for a new offer' using errcode='PT409'; end if;
     perform public.require_weekly_exchange_employee_warning(actor,w,emp.id,s,command);
     consent:=public.weekly_exchange_time_off_consent(w,emp.id,s);
     if public.weekly_exchange_candidate_check(w,emp.id,s||jsonb_build_object('_time_off_consent',consent),array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null))->>'status'<>'eligible'
      or (c.kind='swap' and public.weekly_exchange_candidate_check(w,c.owner_id,t||jsonb_build_object('_time_off_consent',c.owner_time_off_consent),array[(s->>'id')::uuid,(t->>'id')::uuid])->>'status'<>'eligible') then raise exception 'Both employees must be eligible for the full exchange'; end if;
    end if;
    update public.shift_exchange_applications set status=case action when 'accept' then 'pending_manager' when 'decline' then 'declined_by_employee' else 'withdrawn' end,
     time_off_consent=case when action='accept' then consent else time_off_consent end,updated_at=now() where id=aid;
    delete from public.shift_exchange_votes where case_id=cid and application_id=aid;
    if c.audience='direct' and action in('decline','withdraw') then update public.shift_exchange_cases set status='cancelled' where id=cid; end if;
    perform public.shift_exchange_emit(actor,w,cid,aid,case action when 'accept' then 'peer_accepted' when 'decline' then 'peer_declined' else 'application_withdrawn' end,
     case action when 'accept' then 'Accepted. Awaiting manager approval; the original owner remains responsible.' when 'decline' then 'The teammate declined. No assignment changed.' else case when c.audience='direct' then 'The employee withdrew consent. This request ended without a transfer.' else 'The application was withdrawn. Other candidates remain available.' end end);
   elsif action in('reject','approve') then
    if not coalesce(manager,false) then raise exception 'Manager scope required' using errcode='42501'; end if;
    if action='reject' then
     if coalesce(length(trim(command->>'reason')),0)=0 then raise exception 'Provide a reason visible to this employee'; end if;
     update public.shift_exchange_applications set status='rejected_by_manager',reason=command->>'reason',updated_at=now() where id=aid;
     delete from public.shift_exchange_votes where case_id=cid and application_id=aid;
     if c.audience='direct' then update public.shift_exchange_cases set status='cancelled' where id=cid; end if;
     perform public.shift_exchange_emit(actor,w,cid,aid,'application_rejected',command->>'reason',coalesce(command->>'private_note',''));
    else
     checked:=public.shift_exchange_preview(actor,w,cid,aid);
     if not (checked->>'allowed')::boolean then raise exception '%',checked->'reasons' using errcode='PT409'; end if;
     if command->>'fingerprint' is distinct from checked->>'fingerprint' then raise exception 'This approval preview changed. Review the latest details' using errcode='PT409'; end if;
     fp:=checked->>'fingerprint';
     for loc in select distinct x from unnest(array[(s->>'location_id')::uuid,(t->>'location_id')::uuid]) x where x is not null loop
      if public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',loc) then
       insert into public.shift_exchange_votes(case_id,workspace_id,application_id,location_id,actor_user_id,fingerprint) values(cid,w,aid,loc,actor,fp)
       on conflict(case_id,location_id) do update set application_id=excluded.application_id,actor_user_id=excluded.actor_user_id,fingerprint=excluded.fingerprint,created_at=now();
      end if;
     end loop;
     if (checked->>'requires_other_manager')::boolean then
      perform public.shift_exchange_emit(actor,w,cid,aid,'scope_approved','One location approved. Awaiting the other manager; assignments are unchanged.');
     else
      perform 1 from public.schedule_published_shifts where id in((s->>'id')::uuid,(t->>'id')::uuid) order by id for update;
      -- Recheck after row locks as external Schedule writers may predate the shared workspace lock.
      checked:=public.shift_exchange_preview(actor,w,cid,aid);
      if not (checked->>'allowed')::boolean or checked->>'fingerprint'<>fp then raise exception 'Schedule changed during approval' using errcode='PT409'; end if;
      -- BL-182, KK-19: the approved time off each side agreed to give up ends
      -- now, at the manager's approval, never at the application.
      if (checked->'receiver'->>'shortens_time_off')::boolean then
       perform app_private.shorten_time_off(actor,w,a.employee_id,tstzmultirange(tstzrange((s->>'starts_at')::timestamptz,(s->>'ends_at')::timestamptz,'[)')),
        'Shortened for a shift they took through Shift Hub.',jsonb_build_object('source','shift_exchange','case_id',cid,'application_id',aid));
      end if;
      if c.kind='swap' and (checked->'giver'->>'shortens_time_off')::boolean then
       perform app_private.shorten_time_off(actor,w,c.owner_id,tstzmultirange(tstzrange((t->>'starts_at')::timestamptz,(t->>'ends_at')::timestamptz,'[)')),
        'Shortened for a shift they took through Shift Hub.',jsonb_build_object('source','shift_exchange','case_id',cid,'application_id',aid));
      end if;
      perform public.record_weekly_exchange_acceptance(w,cid,aid);
      -- BL-092: the two sides of a swap are one change for the assignment guard,
      -- in the publication and in the drafts reconciled after it.
      perform set_config('newfork.shift_exchange_scope',jsonb_build_object('workspace_id',w,'shift_ids',to_jsonb(array_remove(array[(s->>'source_id')::uuid,(t->>'source_id')::uuid],null)))::text,true);
      update public.schedule_published_shifts set employee_id=a.employee_id where id=(s->>'id')::uuid;
      if c.kind='swap' then update public.schedule_published_shifts set employee_id=c.owner_id where id=(t->>'id')::uuid; end if;
      perform public.shift_exchange_reconcile_batch(actor,w,jsonb_build_array(s||jsonb_build_object('new_employee_id',a.employee_id))||case when c.kind='swap' then jsonb_build_array(t||jsonb_build_object('new_employee_id',c.owner_id)) else '[]'::jsonb end);
      perform set_config('newfork.shift_exchange_scope','',true);
      
      update public.shift_exchange_applications set status='approved',updated_at=now() where id=aid;
      for other in select id from public.shift_exchange_applications where case_id=cid and id<>aid and status in('invited','pending_manager') loop
       update public.shift_exchange_applications set status='closed_other_selected',updated_at=now() where id=other.id;
       perform public.shift_exchange_emit(actor,w,cid,other.id,'other_selected','Another teammate was selected. Your schedule has not changed.');
      end loop;
      update public.shift_exchange_cases set status='completed' where id=cid;
      perform public.shift_exchange_emit(actor,w,cid,aid,'transfer_completed','Manager approved the transfer. The receiving employee is now responsible; the previous owner is released.',coalesce(command->>'private_note',''));
      for other in select x.id from public.shift_exchange_cases x where x.workspace_id=w and x.status='open' and x.id<>cid
       and (x.offered_source_id in(c.offered_source_id,c.requested_source_id) or x.requested_source_id in(c.offered_source_id,c.requested_source_id)) loop
       update public.shift_exchange_cases set status='invalidated',revision=revision+1,updated_at=now() where id=other.id;
       update public.shift_exchange_applications set status='invalidated',updated_at=now() where case_id=other.id and status in('invited','pending_manager');
       perform public.shift_exchange_emit(actor,w,other.id,null,'invalidated','An involved shift changed owner. Start a new request using the current schedule.');
      end loop;
     end if;
    end if;
   else raise exception 'Unknown exchange action'; end if;
   update public.shift_exchange_cases set revision=revision+1,updated_at=now() where id=cid returning * into c;
  end if;
 end if;
 perform realtime.send(jsonb_build_object('workspace_id',w,'case_id',cid,'revision',c.revision),'changed','shift-exchanges:'||w::text,true);
 result:=jsonb_build_object('case_id',cid,'status',c.status,'revision',c.revision);
 insert into public.shift_exchange_commands(workspace_id,actor_user_id,idempotency_key,command,result) values(w,actor,idempotency_key,command,result);
 return result;
end; $function$;

CREATE OR REPLACE FUNCTION public.shift_exchanges_read_service(actor uuid, w uuid, manager_view boolean DEFAULT false, from_date date DEFAULT CURRENT_DATE, to_date date DEFAULT (CURRENT_DATE + 42), focused_case_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp public.employee_profiles%rowtype; c public.shift_exchange_cases%rowtype; s jsonb; t jsonb; allowed boolean; mine boolean;
 case_items jsonb[]:='{}'; opportunities jsonb:='[]'; own_shifts jsonb:='[]'; apps jsonb; hist jsonb; chk jsonb; shift_row record; stage text; live_status text; current_published boolean; requested_published boolean; published_cache jsonb:='{}'; source_key text;
 read_scope uuid[]:='{}'; manage_scope uuid[]:='{}';
begin
 if to_date<from_date or to_date>from_date+62 then raise exception 'Choose a date range up to 62 days'; end if;
 if not exists(select 1 from public.workspace_memberships where workspace_id=w and user_id=actor and status='active') then raise exception 'Active workspace access required' using errcode='42501'; end if;
 select * into emp from public.employee_profiles where workspace_id=w and user_id=actor and archived_at is null;
 if not manager_view and emp.id is null then raise exception 'Employee profile required' using errcode='42501'; end if;
 if manager_view then
  read_scope:=app_private.scope_set(actor,w,'exchange.read');
  -- Nowhere to read requests: asked with no location, the core says why; with
  -- no live location in the workspace there is nothing to read.
  if cardinality(read_scope)=0 and (app_private.authz_reason(actor,w,'exchange.read') is distinct from 'out_of_scope'
   or exists(select 1 from public.locations l where l.workspace_id=w and l.deleted_at is null)) then
   perform app_private.authorize(actor,w,'exchange.read');
  end if;
  manage_scope:=app_private.scope_set(actor,w,'exchange.approve');
 end if;
 for c in select * from public.shift_exchange_cases x where x.workspace_id=w and (x.status='open' or x.id=focused_case_id
  or (x.offered_snapshot->>'date')::date between from_date and to_date
  or (x.requested_snapshot->>'date')::date between from_date and to_date
  or exists(select 1 from public.schedule_published_shifts p
   join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
   where p.workspace_id=w and coalesce(p.source_shift_id,p.id) in(x.offered_source_id,x.requested_source_id)
   and p.scheduled_date between from_date and to_date)) order by x.expires_at,x.created_at loop
  allowed:=manager_view and coalesce((c.offered_snapshot->>'location_id')::uuid=any(read_scope) or (c.kind='swap' and (c.requested_snapshot->>'location_id')::uuid=any(read_scope)),false);
  mine:=coalesce(c.owner_id=emp.id,false);
  if not allowed and not mine and not exists(select 1 from public.shift_exchange_applications where case_id=c.id and employee_id=emp.id) then continue; end if;
  -- Repeated historical requests refer to the same published source. Resolve
  -- each source once in this read only; no cache survives the function call.
  foreach source_key in array array_remove(array[c.offered_source_id::text,c.requested_source_id::text],null) loop
   if not published_cache ? source_key then
    published_cache:=published_cache||jsonb_build_object(source_key,public.shift_exchange_shift(w,source_key::uuid));
   end if;
  end loop;
  s:=nullif(published_cache->c.offered_source_id::text,'null'::jsonb);
  t:=nullif(published_cache->c.requested_source_id::text,'null'::jsonb);
  current_published:=s is not null;
  requested_published:=t is not null;
  s:=coalesce(s,c.offered_snapshot);
  t:=coalesce(t,c.requested_snapshot);
  -- The list follows the displayed dates on either side. A focused deep link
  -- bypasses only the range, never the actor checks above.
  if c.id is distinct from focused_case_id and not (
   coalesce((s->>'date')::date between from_date and to_date,false)
   or coalesce((t->>'date')::date between from_date and to_date,false)
  ) then continue; end if;
  live_status:=public.shift_exchange_live_status(w,c.id);
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'employee_id',a.employee_id,'employee_name',coalesce(nullif(e.preferred_name,''),concat_ws(' ',e.first_name,e.last_name)),
   'status',case when live_status in('expired','invalidated') and a.status in('invited','pending_manager') then live_status else a.status end,'created_at',a.created_at,'reason',case when allowed or a.employee_id=emp.id then a.reason else '' end,
   'eligibility',case when (allowed or a.employee_id=emp.id) and live_status='open' then public.weekly_exchange_candidate_check(w,a.employee_id,s||jsonb_build_object('_time_off_consent',case when a.employee_id=emp.id and a.status='invited' then 'true'::jsonb else a.time_off_consent end),array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null)) || case when a.employee_id=emp.id and a.status='invited' then jsonb_build_object('availability_warning',public.weekly_exchange_employee_warning(w,emp.id,s)) else '{}'::jsonb end end) order by a.created_at),'[]'::jsonb)
  into apps from public.shift_exchange_applications a join public.employee_profiles e on e.id=a.employee_id where a.case_id=c.id and (allowed or mine or a.employee_id=emp.id);
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'created_at',e.created_at,'message',e.message) order by e.created_at),'[]'::jsonb)
  into hist from public.shift_exchange_events e where e.case_id=c.id and (allowed or mine or e.application_id is null or exists(select 1 from public.shift_exchange_applications a where a.id=e.application_id and a.employee_id=emp.id));
  stage:=case when live_status<>'open' then 'closed'
   when exists(select 1 from public.shift_exchange_votes where case_id=c.id) then 'awaiting_other_manager'
   when exists(select 1 from public.shift_exchange_applications where case_id=c.id and status='pending_manager') then 'ready_for_manager'
   when exists(select 1 from public.shift_exchange_applications where case_id=c.id and status='invited') then 'awaiting_peer' else 'seeking_candidates' end;
  case_items:=array_append(case_items,jsonb_build_object('id',c.id,'kind',c.kind,'audience',c.audience,'status',live_status,'current_published',current_published,'requested_current_published',case when c.kind='swap' then requested_published else null end,
   'stage',stage,'revision',c.revision,'created_at',c.created_at,'expires_at',c.expires_at,'owner_id',c.owner_id,'owner_name',c.offered_snapshot->'employee_name',
   'shift',s,'requested_shift',t,'applications',apps,'candidate_count',(select count(*) from public.shift_exchange_applications where case_id=c.id and status in('invited','pending_manager') and live_status='open'),
   'can_manage',allowed and coalesce((c.offered_snapshot->>'location_id')::uuid=any(manage_scope) or (c.kind='swap' and (c.requested_snapshot->>'location_id')::uuid=any(manage_scope)),false),
   'is_owner',mine,'private_note',case when allowed or mine then c.private_note else '' end,'history',hist));
 end loop;
 if not manager_view then
  for shift_row in select p.id from public.schedule_published_shifts p join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
   where p.workspace_id=w and p.scheduled_date between from_date and to_date order by p.scheduled_date,p.start_time loop
   s:=public.shift_exchange_shift(w,shift_row.id);
   if (s->>'starts_at')::timestamptz<=clock_timestamp() then continue; end if;
   if (s->>'employee_id')::uuid=emp.id then own_shifts:=own_shifts||jsonb_build_array(s); continue; end if;
   select * into c from public.shift_exchange_cases where workspace_id=w and offered_source_id=(s->>'source_id')::uuid and status='open' and expires_at>clock_timestamp() and audience='eligible_pool' and kind<>'swap';
   if s->>'employee_id' is not null and c.id is null then continue; end if;
   chk:=public.weekly_exchange_candidate_check(w,emp.id,s||'{"_time_off_consent":true}'::jsonb)||jsonb_build_object('availability_warning',public.weekly_exchange_employee_warning(w,emp.id,s));
   if chk->>'status'='eligible' and (c.id is null or c.consent_fingerprint=public.shift_exchange_fingerprint(w,s,null)) then
    opportunities:=opportunities||jsonb_build_array(jsonb_build_object('case_id',c.id,'shift',s,'eligibility',chk));
   end if;
  end loop;
 end if;
 return jsonb_build_object('employee_id',emp.id,'cases',to_jsonb(case_items),'opportunities',opportunities,'own_shifts',own_shifts);
end; $function$;

CREATE OR REPLACE FUNCTION public.shift_exchanges_candidates_service(actor uuid, w uuid, shift_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp public.employee_profiles%rowtype; s jsonb; t jsonb; e record; p record; checked jsonb; employees jsonb:='[]'; shifts jsonb:='[]';
begin
 emp:=public.employee_hub_actor_service(actor,w); s:=public.shift_exchange_shift(w,shift_id);
 if s is null or (s->>'employee_id')::uuid is distinct from emp.id then raise exception 'Only the owner can search for a replacement' using errcode='42501'; end if;
 for e in select id,coalesce(nullif(preferred_name,''),concat_ws(' ',first_name,last_name)) name from public.employee_profiles where workspace_id=w and archived_at is null and id<>emp.id order by first_name loop
  checked:=public.weekly_exchange_candidate_check(w,e.id,s);
  if checked->>'status'='eligible' then employees:=employees||jsonb_build_array(jsonb_build_object('id',e.id,'name',e.name,'eligibility',checked)); end if;
 end loop;
 for p in select x.id from public.schedule_published_shifts x join public.schedule_location_publications pub on pub.id=x.publication_id and pub.status='current'
  where x.workspace_id=w and x.employee_id is not null and x.employee_id<>emp.id and x.scheduled_date between current_date-1 and current_date+62 order by x.scheduled_date,x.start_time loop
  t:=public.shift_exchange_shift(w,p.id);
  if (t->>'starts_at')::timestamptz>clock_timestamp() and public.weekly_exchange_candidate_check(w,emp.id,t||'{"_time_off_consent":true}'::jsonb,array[(s->>'id')::uuid,(t->>'id')::uuid])->>'status'='eligible'
   and public.weekly_exchange_candidate_check(w,(t->>'employee_id')::uuid,s,array[(s->>'id')::uuid,(t->>'id')::uuid])->>'status'='eligible' then shifts:=shifts||jsonb_build_array(t||jsonb_build_object('availability_warning',public.weekly_exchange_employee_warning(w,emp.id,t))); end if;
 end loop;
 return jsonb_build_object('employees',employees,'shifts',shifts);
end; $function$;

CREATE OR REPLACE FUNCTION public.notify_schedule_request_event_service()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  event_location_id uuid;
  event_employee_id uuid;
  recipient_user_ids uuid[] := '{}'::uuid[];
  notification_type_key text;
  notification_title text;
  notification_body text;
  notification_preview text;
  notification_action_url text;
  audience_contract text;
begin
  select request.location_id, request.employee_id
  into event_location_id, event_employee_id
  from public.schedule_time_off_requests request
  where request.id = new.request_id and request.workspace_id = new.workspace_id;

  if event_location_id is null then
    raise exception 'schedule request location not found' using errcode = 'P0002';
  end if;

  -- BL-182/BL-127: a shortening tells its own people (requests.time_off.shortened).
  if public.time_off_event_is_shortening(new.workspace_id, new.request_id, new.metadata) then
    return new;
  end if;

  if new.action = 'submitted' then
    -- The owner's own time off is recorded without review (BL-183).
    if public.time_off_is_the_owners_own(new.actor_user_id, new.workspace_id, new.request_id) then
      return new;
    end if;
    notification_type_key := 'requests.time_off.submitted';
    notification_title := 'New time-off request';
    notification_body := 'A schedule request needs manager review.';
    notification_preview := 'A schedule request needs review.';
    notification_action_url := '/app/schedule/requests';
    audience_contract := 'schedule_request_reviewers';

    select coalesce(array_agg(distinct membership.user_id order by membership.user_id), '{}'::uuid[])
    into recipient_user_ids
    from public.workspace_memberships membership
    join public.workspace_role_permissions permission
      on permission.workspace_id = membership.workspace_id
     and permission.role_id = membership.role_id
    where membership.workspace_id = new.workspace_id
      and membership.status = 'active'
      and permission.permission_key = 'schedule.time_off_requests.read'
      and (
        membership.all_locations
        or exists (
          select 1 from public.membership_location_scopes scope
          where scope.membership_id = membership.id
            and scope.workspace_id = new.workspace_id
            and scope.location_id = event_location_id
        )
      );
  elsif new.action not in ('viewed', 'returned_to_pending') then
    notification_type_key := 'requests.time_off.status_changed';
      notification_title := 'Time-off request updated';
      notification_body := 'Your time-off request status changed.';
      notification_preview := 'A schedule request was updated.';
      notification_action_url := '/app/employee-hub/my-availability';
      audience_contract := 'time_off_requester';
      select coalesce(array_agg(employee.user_id), '{}'::uuid[])
      into recipient_user_ids
      from public.employee_profiles employee
      where employee.id = event_employee_id
        and employee.workspace_id = new.workspace_id
        and employee.user_id is not null
        and employee.user_id <> new.actor_user_id;
  else
    return new;
  end if;

  
 if tg_table_name='schedule_time_off_events' and exists(select 1 from public.schedule_time_off_requests r where r.id=new.request_id and r.request_type='time_off_cancellation') then
  if new.action='submitted' then
   notification_title:='Leave cancellation requested';
   notification_body:='Review the proposed cancellation. Approved leave stays in effect until accepted.';
   notification_preview:='A leave cancellation needs review.';
   notification_action_url:='/app/schedule/requests?tab=time-off&request='||new.request_id::text;
  else
   notification_title:='Leave cancellation updated';
   notification_body:=case new.action when 'denied' then 'Your cancellation was declined. The approved leave remains in effect.'
    when 'revoked' then 'Your cancellation request was closed. Review the original leave for its current status.'
    else 'Your leave cancellation was reviewed. See the exact hours in your request. Previously released shifts are not reassigned automatically.' end;
   notification_preview:='A leave cancellation was updated.';
   notification_action_url:='/app/employee-hub/my-availability#request-'||new.request_id::text;
  end if;
 end if;
 perform public.enqueue_notification_outbox_service(
    new.workspace_id,
    new.id,
    notification_type_key,
    1,
    new.actor_user_id,
    tg_table_name,
    new.request_id::text,
    jsonb_build_object(
      'correlation_id', new.id,
      'request_id', new.request_id,
      'request_event_id', new.id,
      'request_action', new.action,
      'location_id', event_location_id,
      'location_ids', jsonb_build_array(event_location_id),
      'recipient_user_ids', to_jsonb(recipient_user_ids),
      'audience_contract', audience_contract,
      'category', 'request',
      'title', notification_title,
      'body', notification_body,
      'safe_preview', notification_preview,
      'action_url', notification_action_url,
      'group_key', tg_table_name || ':' || new.request_id::text
    ),
    new.created_at
  );

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_notification_platform_service()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  active_without_producer jsonb;
  active_without_template jsonb;
  missing_domain_events jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'type_key', catalog.type_key,
    'schema_version', catalog.schema_version,
    'reason', 'active_catalog_without_outbox_producer'
  ) order by catalog.type_key), '[]'::jsonb)
  into active_without_producer
  from public.notification_catalog catalog
  where catalog.lifecycle = 'active'
    and not exists (
      select 1 from public.notification_producer_registry registry
      where registry.type_key = catalog.type_key
        and registry.schema_version = catalog.schema_version
        and registry.integration_contract = case when catalog.notification_scope='account' then 'account_audit_v1' else 'outbox_v1' end
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'type_key', catalog.type_key,
    'schema_version', catalog.schema_version,
    'reason', 'active_catalog_without_published_in_app_template'
  ) order by catalog.type_key), '[]'::jsonb)
  into active_without_template
  from public.notification_catalog catalog
  where catalog.lifecycle = 'active'
    and 'in_app' = any(catalog.supported_channels)
    and not exists (
      select 1 from public.notification_template_versions template
      where template.type_key = catalog.type_key
        and template.schema_version = catalog.schema_version
        and template.channel = 'in_app'
        and template.status = 'published'
    );

  with request_events as (
    select event.workspace_id, event.id event_id,
      case when event.action = 'submitted' then 'requests.time_off.submitted'
        else 'requests.time_off.status_changed' end type_key,
      event.created_at occurred_at
    from public.schedule_time_off_events event
    where event.action not in ('viewed', 'returned_to_pending')
      -- The owner's own request was recorded approved by its requester in the
      -- same moment (record_owner_time_off); that fact is kept on the events, so
      -- the check does not depend on who owns the workspace today (BL-220).
      and not (event.action = 'submitted' and exists (
        select 1 from public.schedule_time_off_events decided
        where decided.workspace_id = event.workspace_id and decided.request_id = event.request_id
          and decided.action in ('approved', 'partially_approved')
          and decided.actor_user_id = event.actor_user_id and decided.created_at = event.created_at))
      -- A shortening tells its own people (requests.time_off.shortened, BL-182).
      and not public.time_off_event_is_shortening(event.workspace_id, event.request_id, event.metadata)
  ), missing_requests as (
    select request.workspace_id, request.event_id, request.type_key, request.occurred_at,
      'deterministic_request_event_without_outbox' reason
    from request_events request
    join public.notification_producer_registry registry
      on registry.type_key = request.type_key and registry.schema_version = 1
    where request.occurred_at >= registry.activated_at
      and not exists (
        select 1 from public.notification_outbox outbox
        where outbox.workspace_id = request.workspace_id and outbox.event_id = request.event_id
      )
  ), missing_announcements as (
    select announcement.workspace_id, null::uuid event_id,
      'communications.announcement.available' type_key,
      announcement.updated_at occurred_at,
      'published_announcement_without_outbox' reason
    from public.announcements announcement
    join public.notification_producer_registry registry
      on registry.type_key = 'communications.announcement.available' and registry.schema_version = 1
    where announcement.status in ('published', 'scheduled')
      and announcement.updated_at >= registry.activated_at
      and not exists (
        select 1 from public.notification_outbox outbox
        where outbox.workspace_id = announcement.workspace_id
          and outbox.type_key = 'communications.announcement.available'
          and outbox.subject_id = announcement.id::text
          and outbox.payload->>'announcement_revision' = announcement.revision::text
      )
  ), all_missing as (
    select * from missing_requests
    union all select * from missing_announcements
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'workspace_id', missing.workspace_id,
    'event_id', missing.event_id,
    'type_key', missing.type_key,
    'occurred_at', missing.occurred_at,
    'reason', missing.reason
  ) order by missing.occurred_at, missing.type_key), '[]'::jsonb)
  into missing_domain_events
  from all_missing missing;

  return jsonb_build_object(
    'status', case
      when jsonb_array_length(active_without_producer) = 0
        and jsonb_array_length(active_without_template) = 0
        and jsonb_array_length(missing_domain_events) = 0
      then 'healthy' else 'drift_detected' end,
    'active_catalog_without_producer', active_without_producer,
    'active_catalog_without_template', active_without_template,
    'deterministic_domain_events_without_outbox', missing_domain_events,
    'dead_letter_count', (select count(*) from public.notification_outbox where status = 'dead_letter'),
    'checked_at', now()
  );
end;
$function$;

revoke all on function public.availability_json_ranges(jsonb), public.time_off_leave_intervals(jsonb),
  public.weekly_exchange_time_off_consent(uuid, uuid, jsonb), public.time_off_event_is_shortening(uuid, uuid, jsonb),
  public.notify_time_off_shortened(uuid, uuid, uuid, tstzmultirange, text, jsonb),
  app_private.shorten_time_off(uuid, uuid, uuid, tstzmultirange, text, jsonb),
  public.shorten_time_off_service(uuid, uuid, uuid, integer, jsonb, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.shorten_time_off_service(uuid, uuid, uuid, integer, jsonb, text, uuid) to service_role;
