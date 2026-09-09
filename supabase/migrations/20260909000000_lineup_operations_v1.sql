-- Deployment switch: false preserves read access while disabling Line Up changes.
alter table public.locations add column lineup_operations_enabled boolean not null default true;
alter table public.schedule_lineup_sections add column location_ids uuid[] not null default '{}';
alter table public.schedule_lineup_sections add column shift_type_ids uuid[] not null default '{}';
alter table public.schedule_lineup_sections add column job_ids uuid[] not null default '{}';
alter table public.schedule_lineup_entries add column note text not null default '' check(char_length(note)<=500);
alter table public.schedule_lineup_entries add column source_changed boolean not null default false;
alter table public.schedule_lineup_entries add column placement_segments jsonb not null default '[]'::jsonb check(jsonb_typeof(placement_segments)='array');
alter function public.get_schedule_lineup_service(uuid,uuid,date,uuid[],uuid[]) rename to get_schedule_lineup_operations_base;
create function public.get_schedule_lineup_service(actor_user_id uuid,target_workspace_id uuid,target_date date,target_location_ids uuid[] default null,target_shift_type_ids uuid[] default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare model jsonb;
begin
 model:=public.get_schedule_lineup_operations_base(actor_user_id,target_workspace_id,target_date,target_location_ids,target_shift_type_ids);
 model:=jsonb_set(model,'{sections}',coalesce((select jsonb_agg(sec||jsonb_build_object('location_ids',stored.location_ids,'shift_type_ids',stored.shift_type_ids,'job_ids',stored.job_ids) order by (sec->>'sort_order')::integer,sec->>'name') from jsonb_array_elements(model->'sections') sec join public.schedule_lineup_sections stored on stored.workspace_id=target_workspace_id and stored.id=(sec->>'id')::uuid),'[]'::jsonb));
 return jsonb_set(model,'{locations}',coalesce((select jsonb_agg(l||jsonb_build_object('entries',coalesce((select jsonb_agg(e||jsonb_build_object('note',coalesce((select pe.note from public.schedule_lineup_entries pe where pe.workspace_id=target_workspace_id and pe.id=(e->>'overlay_id')::uuid),''),'placement_segments',coalesce((select jsonb_agg(seg||jsonb_build_object('section_name',coalesce(sec.name,'')) order by seg->>'start_at') from public.schedule_lineup_entries pe cross join lateral jsonb_array_elements(pe.placement_segments) seg left join public.schedule_lineup_sections sec on sec.id=(seg->>'section_id')::uuid and sec.workspace_id=target_workspace_id where pe.workspace_id=target_workspace_id and pe.id=(e->>'overlay_id')::uuid),'[]'::jsonb),'source_changed',coalesce((select p.source_changed from public.schedule_lineup_entries p where p.workspace_id=target_workspace_id and p.id=(e->>'overlay_id')::uuid),false))) from jsonb_array_elements(l->'entries') e),'[]'::jsonb))) from jsonb_array_elements(model->'locations') l),'[]'::jsonb));
end; $$;
revoke all on function public.get_schedule_lineup_operations_base(uuid,uuid,date,uuid[],uuid[]) from public,anon,authenticated,service_role;
revoke all on function public.get_schedule_lineup_service(uuid,uuid,date,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.get_schedule_lineup_service(uuid,uuid,date,uuid[],uuid[]) to service_role;
-- Per-day service setup; all-day values are overridden by a service-specific row.
create table public.lineup_section_plans (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 location_id uuid not null, date date not null, shift_type_id uuid, section_id uuid not null,
 closed boolean not null default false, lead_employee_id uuid, stations text not null default '' check(length(stations)<=500),
 revision integer not null default 1, updated_at timestamptz not null default now(), updated_by uuid not null,
 foreign key(workspace_id,location_id) references public.locations(workspace_id,id),
 foreign key(workspace_id,section_id) references public.schedule_lineup_sections(workspace_id,id),
 foreign key(workspace_id,shift_type_id) references public.shift_types(workspace_id,id),
 foreign key(workspace_id,lead_employee_id) references public.employee_profiles(workspace_id,id),
 unique nulls not distinct(workspace_id,location_id,date,shift_type_id,section_id)
);
alter table public.lineup_section_plans enable row level security;
revoke all on public.lineup_section_plans from anon,authenticated;
grant all on public.lineup_section_plans to service_role;

create table public.lineup_proposals (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 kind text not null check(kind in ('offer','transfer')), status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled','confirmed')),
 created_by uuid not null references auth.users(id), source_location_id uuid not null, target_location_id uuid not null, employee_id uuid,
 operation jsonb not null, fingerprint text not null, source_date date not null, source_state jsonb, idempotency_key uuid not null,
 expires_at timestamptz not null default now()+interval '2 hours', created_at timestamptz not null default now(), responded_at timestamptz,
 result jsonb, unique(workspace_id,idempotency_key),
 foreign key(source_location_id,workspace_id) references public.locations(id,workspace_id),
 foreign key(target_location_id,workspace_id) references public.locations(id,workspace_id),
 foreign key(employee_id,workspace_id) references public.employee_profiles(id,workspace_id)
);
alter table public.lineup_proposals enable row level security;
revoke all on public.lineup_proposals from public,anon,authenticated;
grant select on public.lineup_proposals to service_role;

-- Daily operations. Ordered after the existing 20260908 migrations because the
-- command layer relies on their workspace and document eligibility guards.
create table public.lineup_notes (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  location_id uuid, date date not null, shift_type_id uuid, section_id uuid,
  category text not null check(category in ('priority','specials','86','event','instruction','checklist','briefing')),
  content text not null check(char_length(btrim(content)) between 1 and 2000),
  visibility text not null check(visibility in ('team','managers')), pinned boolean not null default false,
  expires_at timestamptz, revision integer not null default 1, updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
  foreign key(location_id,workspace_id) references public.locations(id,workspace_id),
  foreign key(shift_type_id,workspace_id) references public.shift_types(id,workspace_id),
  foreign key(section_id,workspace_id) references public.schedule_lineup_sections(id,workspace_id)
);
create index lineup_notes_day_idx on public.lineup_notes(workspace_id,date,location_id);
create table public.lineup_operation_events (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id), kind text not null, date date not null,
  location_ids uuid[] not null, description text not null, before_state jsonb not null, after_state jsonb not null,
  idempotency_key uuid not null, created_at timestamptz not null default now(), unique(workspace_id,idempotency_key)
);
create table public.lineup_receipts (
  snapshot_id uuid not null references public.schedule_lineup_snapshots(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  employee_id uuid not null, content_fingerprint text not null, viewed_at timestamptz, acknowledged_at timestamptz,
  primary key(snapshot_id,employee_id), foreign key(employee_id,workspace_id) references public.employee_profiles(id,workspace_id)
);
create table public.lineup_notification_outbox (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  snapshot_id uuid not null references public.schedule_lineup_snapshots(id), employee_id uuid not null,
  created_at timestamptz not null default now(), delivered_at timestamptz,
  foreign key(employee_id,workspace_id) references public.employee_profiles(id,workspace_id), unique(snapshot_id,employee_id)
);
alter table public.lineup_notes enable row level security;
alter table public.lineup_operation_events enable row level security;
alter table public.lineup_receipts enable row level security;
alter table public.lineup_notification_outbox enable row level security;
revoke all on public.lineup_notes,public.lineup_operation_events,public.lineup_receipts,public.lineup_notification_outbox from public,anon,authenticated;
grant select on public.lineup_notes,public.lineup_operation_events,public.lineup_receipts,public.lineup_notification_outbox to service_role;

-- Use the existing stable Schedule source ID to retain section/station placement
-- across publication versions. Never match people or shifts by display text.
create function public.lineup_rebind_published_source() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.schedule_lineup_entries e set source_shift_id=new.id,
    employee_id=new.employee_id,job_id=new.job_id,shift_type_id=new.shift_type_id,
    start_time=new.start_time,end_time=new.end_time,source_changed=e.source_changed or (e.employee_id,e.job_id,e.shift_type_id,e.start_time,e.end_time) is distinct from (new.employee_id,new.job_id,new.shift_type_id,new.start_time,new.end_time),revision=e.revision+1,updated_at=now()
  from public.schedule_published_shifts previous_source,public.schedule_lineups ln
  where e.source_shift_id=previous_source.id and previous_source.source_shift_id=new.source_shift_id
    and previous_source.workspace_id=new.workspace_id and previous_source.id<>new.id
    and ln.id=e.lineup_id and ln.lineup_date=new.scheduled_date and ln.location_id=new.location_id;
  return new;
end; $$;

create function public.lineup_project_entry(entry jsonb,tz text) returns setof jsonb
language plpgsql stable set search_path='' as $$
declare segment jsonb;
begin
 if jsonb_array_length(coalesce(entry->'placement_segments','[]'::jsonb))=0 then return next entry; return; end if;
 for segment in select * from jsonb_array_elements(entry->'placement_segments') loop
  return next entry||jsonb_build_object('id',segment->'id','placement_parent_id',entry->'id','placement_segments','[]'::jsonb,
   'placement_start_at',segment->'start_at','placement_end_at',segment->'end_at',
   'start_time',to_char((segment->>'start_at')::timestamptz at time zone tz,'HH24:MI'),'end_time',to_char((segment->>'end_at')::timestamptz at time zone tz,'HH24:MI'),
   'section_id',segment->'section_id','section_name',coalesce(segment->>'section_name',''),'station',segment->'station');
 end loop;
end; $$;
revoke all on function public.lineup_project_entry(jsonb,text) from public,anon,authenticated,service_role;

create function public.lineup_share_content(actor uuid,w uuid,d date,locations uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare model jsonb; result jsonb;
begin
  if cardinality(locations)=0 or locations is null then raise exception 'Choose a location to share'; end if;
  if exists(select 1 from unnest(locations) id where not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.share',id)) then raise exception 'line-up share access denied'; end if;
  model:=public.get_schedule_lineup_service(actor,w,d,locations,null);
  if exists(select 1 from jsonb_array_elements(model->'locations') l cross join lateral jsonb_array_elements(l->'entries') e where coalesce((e->>'source_changed')::boolean,false) and not (e->>'hidden')::boolean) then raise exception 'Review changed Schedule assignments before sharing'; end if;
  select jsonb_set(model,'{locations}',coalesce(jsonb_agg(
    l||jsonb_build_object('entries',coalesce((select jsonb_agg(e order by (e->>'display_order')::integer,e->>'id') from jsonb_array_elements(l->'entries') raw cross join lateral public.lineup_project_entry(raw,l->>'timezone') e where not (e->>'hidden')::boolean and not (e->>'call_off')::boolean and not (e->>'orphaned')::boolean),'[]'::jsonb),
      'notes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'category',n.category,'content',n.content,'section_id',n.section_id,'shift_type_id',n.shift_type_id,'pinned',n.pinned,'expires_at',n.expires_at) order by n.pinned desc,n.id) from public.lineup_notes n
        where n.workspace_id=w and n.date=d and (n.location_id is null or n.location_id=(l->>'id')::uuid) and n.visibility='team' and (n.expires_at is null or n.expires_at>now())),'[]'::jsonb)) order by l->>'id'),'[]'::jsonb)) into result from jsonb_array_elements(model->'locations') l;
  result:=jsonb_set(result,'{locations}',(select jsonb_agg(l||jsonb_build_object('notes',(l->'notes')||coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'category','briefing','content',sec.name||case when p.closed then ' · Closed' else '' end||case when p.lead_employee_id is null then '' else ' · Lead: '||coalesce(nullif(ep.preferred_name,''),concat_ws(' ',ep.first_name,ep.last_name)) end||case when p.stations='' then '' else E'\n'||p.stations end,'section_id',p.section_id,'shift_type_id',p.shift_type_id,'pinned',false)) from public.lineup_section_plans p join public.schedule_lineup_sections sec on sec.id=p.section_id left join public.employee_profiles ep on ep.id=p.lead_employee_id where p.workspace_id=w and p.date=d and p.location_id=(l->>'id')::uuid),'[]'::jsonb))) from jsonb_array_elements(result->'locations') l));
  return (result - 'employees')||jsonb_build_object('employees','[]'::jsonb,'settings',jsonb_build_object('time_format',coalesce((select time_format from public.workspace_scheduling_settings where workspace_id=w),'12h')));
end; $$;

create function public.lineup_person_fingerprint(content jsonb,emp uuid) returns text
language sql stable set search_path='' as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',e->'id','job_id',e->'job_id','section_id',e->'section_id','station',e->'station','note',coalesce(e->>'note',''),'start_time',e->'start_time','end_time',e->'end_time','shift_type_id',e->'shift_type_id') order by e->>'id') from jsonb_array_elements(content->'entries') e where e->>'employee_id'=emp::text),'[]'::jsonb),
    'notes',coalesce((select jsonb_agg(n order by n->>'id') from jsonb_array_elements(coalesce(content->'notes','[]'::jsonb)) n where exists(select 1 from jsonb_array_elements(content->'entries') e where e->>'employee_id'=emp::text and (n->>'shift_type_id' is null or n->>'shift_type_id'=e->>'shift_type_id') and (n->>'section_id' is null or n->>'section_id'=e->>'section_id'))),'[]'::jsonb),
    'briefs',coalesce((select jsonb_agg(b-'revision' order by b->>'shift_type_id') from jsonb_array_elements(coalesce(content->'briefs','[]'::jsonb)) b where exists(select 1 from jsonb_array_elements(content->'entries') e where e->>'employee_id'=emp::text and e->>'shift_type_id'=b->>'shift_type_id')),'[]'::jsonb)
  )::text,'UTF8'),'sha256'),'hex');
$$;

create or replace function public.preview_schedule_lineup_share_service(actor_user_id uuid,target_workspace_id uuid,target_date date,target_location_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin return public.preview_schedule_lineup_scoped_share_service(actor_user_id,target_workspace_id,target_date,target_location_ids,null); end; $$;

create or replace function public.share_schedule_lineup_service(actor_user_id uuid,target_workspace_id uuid,target_date date,target_location_ids uuid[],expected_fingerprint text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin return public.share_schedule_lineup_scoped_service(actor_user_id,target_workspace_id,target_date,target_location_ids,expected_fingerprint,null); end; $$;
create trigger lineup_rebind_published_source after insert on public.schedule_published_shifts
for each row execute function public.lineup_rebind_published_source();

create function public.lineup_shift_range(d date,s time,e time,tz text) returns tstzrange
language sql stable set search_path='' as $$
  select tstzrange((d+s) at time zone tz,((d+case when e<=s then 1 else 0 end)+e) at time zone tz,'[)');
$$;

-- Empty applicability arrays mean all active workspace values.
create function public.lineup_section_restriction(w uuid,section_id uuid,loc uuid,service_id uuid,job uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare sec public.schedule_lineup_sections%rowtype;
begin
 if section_id is null then return null; end if;
 select * into sec from public.schedule_lineup_sections where id=section_id and workspace_id=w and archived_at is null;
 if sec.id is null then return 'Section is not active in this workspace'; end if;
 if cardinality(sec.location_ids)>0 and not loc=any(sec.location_ids) then return 'Section is not available at this location'; end if;
 if service_id is not null and cardinality(sec.shift_type_ids)>0 and not service_id=any(sec.shift_type_ids) then return 'Section is not available for this service'; end if;
 if job is not null and cardinality(sec.job_ids)>0 and not job=any(sec.job_ids) then return 'Position is not permitted in this section'; end if;
 return null;
end; $$;
revoke all on function public.lineup_section_restriction(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.lineup_candidate_check(w uuid,emp uuid,target jsonb,excluded uuid[] default '{}',travel_minutes integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare loc uuid:=(target->>'location_id')::uuid; job uuid:=(target->>'job_id')::uuid;
  d date:=(target->>'date')::date; tz text; span tstzrange; av public.employee_schedule_availability_versions%rowtype;
  available tstzmultirange; overlap tstzmultirange; free tstzmultirange; reasons text[]:=array[]::text[]; state text:='eligible';
begin
  select timezone into tz from public.locations where id=loc and workspace_id=w and archived_at is null;
  if tz is null then raise exception 'location not found'; end if;
  span:=public.lineup_shift_range(d,(target->>'start_time')::time,(target->>'end_time')::time,tz);
  if public.lineup_section_restriction(w,(target->>'section_id')::uuid,loc,(target->>'shift_type_id')::uuid,job) is not null then reasons:=array_append(reasons,public.lineup_section_restriction(w,(target->>'section_id')::uuid,loc,(target->>'shift_type_id')::uuid,job)); end if;
  if not exists(select 1 from public.employee_profiles p where p.id=emp and p.workspace_id=w and p.archived_at is null and not p.is_excluded_from_schedule
    and (p.start_date is null or p.start_date<=d)) then reasons:=array_append(reasons,'Employee is not active in Schedule'); end if;
  if not exists(select 1 from public.employee_location_assignments where employee_id=emp and workspace_id=w and location_id=loc and ended_at is null) then reasons:=array_append(reasons,'Not assigned to this location'); end if;
  if not exists(select 1 from public.employee_job_assignments where employee_id=emp and workspace_id=w and job_id=job and ended_at is null) then reasons:=array_append(reasons,'Not eligible for this position'); end if;
  if exists(select 1 from public.schedule_closures c where c.workspace_id=w and c.location_id=loc and c.closed_date=d and (c.is_all_day or (target->>'shift_type_id')::uuid=any(c.shift_type_ids))) then reasons:=array_append(reasons,'Location or service is closed'); end if;
  if public.employee_has_hard_document_schedule_conflict_service(w,emp,d) then reasons:=array_append(reasons,'Required document is expired'); end if;
  select * into av from public.employee_schedule_availability_versions where workspace_id=w and employee_id=emp and effective_at<=lower(span) order by version_number desc limit 1;
  if av.id is null then state:='verification_required'; reasons:=array_append(reasons,'Availability has not been confirmed');
  else
    select coalesce(range_agg(r),'{}'::tstzmultirange) into available from (
      select case when rule->>'mode'='unrestricted' then tstzrange(day::date::timestamp at time zone av.timezone,(day::date+1)::timestamp at time zone av.timezone,'[)')
        else public.lineup_shift_range(day::date,(win->>'start')::time,(win->>'end')::time,av.timezone) end r
      from generate_series((lower(span) at time zone av.timezone)::date-1,(upper(span) at time zone av.timezone)::date,interval '1 day') day
      cross join lateral jsonb_array_elements(av.recurring_rules) rule
      left join lateral jsonb_array_elements(rule->'windows') win on true
      where (rule->>'day')::integer=extract(dow from day)::integer and rule->>'mode'<>'unavailable'
        and (rule->>'mode'='unrestricted' or win is not null)
    ) ranges;
    free:=available*tstzmultirange(span);
    if not available @> span then
      state:=case when isempty(free) then 'ineligible' else 'partial' end;
      reasons:=array_append(reasons,case when isempty(free) then 'Unavailable during this shift' else 'Available for part of this shift; adjust the interval' end);
    end if;
  end if;
  select coalesce(range_agg(r),'{}'::tstzmultirange) into overlap from (
    select public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,l.timezone) r
    from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current'
    join public.locations l on l.id=s.location_id
    where s.workspace_id=w and s.employee_id=emp and not s.id=any(excluded)
      and s.scheduled_date between d-2 and d+2
    union all
    select public.lineup_shift_range(ln.lineup_date,e.start_time,e.end_time,l.timezone)
    from public.schedule_lineup_entries e join public.schedule_lineups ln on ln.id=e.lineup_id join public.locations l on l.id=e.location_id
    where e.workspace_id=w and e.employee_id=emp and e.source_shift_id is null and not e.hidden and not e.call_off and not e.id=any(excluded) and e.start_time is not null and ln.lineup_date between d-2 and d+2
    union all
    select case when seg.start_time is null then tstzrange(seg.segment_date::timestamp at time zone tz,(seg.segment_date+1)::timestamp at time zone tz,'[)')
      else public.lineup_shift_range(seg.segment_date,seg.start_time,seg.end_time,tz) end
    from public.schedule_time_off_segments seg join public.schedule_time_off_requests req on req.id=seg.request_id
    where req.workspace_id=w and req.employee_id=emp and seg.status='approved' and req.status in('approved','partially_approved') and seg.segment_date between d-2 and d+2
  ) busy where r && span;
  if overlap && span then state:='ineligible'; reasons:=array_append(reasons,'Overlaps a published shift, daily assignment or approved time off'); end if;
  if travel_minutes>0 and exists(select 1 from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current' join public.locations l on l.id=s.location_id
    where s.workspace_id=w and s.employee_id=emp and s.location_id<>loc and not s.id=any(excluded)
    and tstzrange(lower(public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,l.timezone))-make_interval(mins=>travel_minutes),upper(public.lineup_shift_range(s.scheduled_date,s.start_time,s.end_time,l.timezone))+make_interval(mins=>travel_minutes),'[)') && span) then
      state:='ineligible';reasons:=array_append(reasons,'Not enough time to travel between locations');
  end if;
  if cardinality(reasons)>0 and state='eligible' then state:='ineligible'; end if;
  if exists(select 1 from unnest(reasons) r where r in('Employee is not active in Schedule','Not assigned to this location','Not eligible for this position','Required document is expired','Location or service is closed')) then state:='ineligible'; end if;
  if cardinality(reasons)=0 then reasons:=array['Position and location match','Available for the full interval','No conflicts']; end if;
  return jsonb_build_object('employee_id',emp,'status',state,'reasons',to_jsonb(reasons),
    'available_start',case when free is not null and not isempty(free) then (select lower(r)::text from unnest(free) r order by lower(r) limit 1) end,
    'available_end',case when free is not null and not isempty(free) then (select upper(r)::text from unnest(free) r order by lower(r) limit 1) end);
end; $$;

-- Section edits must not silently rewrite the employee's Schedule assignment.
alter function public.upsert_schedule_lineup_entry_service(uuid,uuid,uuid,date,uuid,integer,jsonb) rename to upsert_schedule_lineup_entry_operations_base;
-- Placement intervals are an operational overlay; Schedule and clock records
-- are never split by a same-location section change.
create function public.lineup_prepare_placement(w uuid,loc uuid,d date,tz text,before_entry jsonb,entry jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare original tstzrange; part tstzrange; span tstzrange; past tstzrange; residual tstzrange;
 old_segments jsonb; next_segments jsonb; segment jsonb; covered tstzmultirange; seen tstzmultirange:='{}'::tstzmultirange;
 start_day date; requested_section uuid:=(entry->>'section_id')::uuid; requested_station text:=coalesce(entry->>'station','');
begin
 if before_entry is null then return entry||jsonb_build_object('placement_segments','[]'::jsonb); end if;
 if before_entry->>'start_time' is null or before_entry->>'end_time' is null then
  if entry ? 'placement_range' then raise exception 'Reconcile missing shift times in Schedule before placing part of a shift'; end if;
  return entry||jsonb_build_object('placement_segments','[]'::jsonb);
 end if;
 original:=public.lineup_shift_range(d,(before_entry->>'start_time')::time,(before_entry->>'end_time')::time,tz);
 old_segments:=coalesce(before_entry->'placement_segments','[]'::jsonb);
 if jsonb_array_length(old_segments)=0 then old_segments:=jsonb_build_array(jsonb_build_object('id',before_entry->'id','start_at',lower(original),'end_at',upper(original),'section_id',before_entry->'section_id','station',before_entry->'station')); end if;
 if entry ? 'placement_range' then
  start_day:=d+case when (entry->'placement_range'->>'start_time')::time<(before_entry->>'start_time')::time then 1 else 0 end;
  part:=public.lineup_shift_range(start_day,(entry->'placement_range'->>'start_time')::time,(entry->'placement_range'->>'end_time')::time,tz);
  if not original @> part then raise exception 'Placement interval must fit inside the published shift'; end if;
  next_segments:='[]';
  for segment in select * from jsonb_array_elements(old_segments) loop
   span:=tstzrange((segment->>'start_at')::timestamptz,(segment->>'end_at')::timestamptz,'[)');
   for residual in select unnest(tstzmultirange(span)-tstzmultirange(part)) loop
    next_segments:=next_segments||jsonb_build_array((segment-'section_name')||jsonb_build_object('id',case when residual=span then (segment->>'id')::uuid else gen_random_uuid() end,'start_at',lower(residual),'end_at',upper(residual)));
   end loop;
  end loop;
  next_segments:=next_segments||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'start_at',lower(part),'end_at',upper(part),'section_id',requested_section,'station',requested_station));
  entry:=entry||jsonb_build_object('section_id',before_entry->'section_id','station',before_entry->'station');
 elsif entry ? 'placement_segments' then next_segments:=entry->'placement_segments';
 elsif (entry->'section_id',entry->'station') is distinct from (before_entry->'section_id',before_entry->'station') then next_segments:='[]';
 else next_segments:=coalesce(before_entry->'placement_segments','[]'::jsonb); end if;
 if jsonb_array_length(next_segments)>64 then raise exception 'Too many placement intervals'; end if;
 if jsonb_array_length(next_segments)=0 then
  next_segments:=jsonb_build_array(jsonb_build_object('id',before_entry->'id','start_at',lower(original),'end_at',upper(original),'section_id',entry->'section_id','station',entry->'station'));
 end if;
 for segment in select * from jsonb_array_elements(next_segments) loop
  if (segment->>'id')::uuid is null or length(coalesce(segment->>'station',''))>80 then raise exception 'Invalid placement interval'; end if;
  span:=tstzrange((segment->>'start_at')::timestamptz,(segment->>'end_at')::timestamptz,'[)');
  if lower_inf(span) or upper_inf(span) or isempty(span) or not original @> span or seen && tstzmultirange(span) then raise exception 'Placement intervals must be non-overlapping and inside the shift'; end if;
  seen:=seen+tstzmultirange(span);
  if segment->>'section_id' is not null and not exists(select 1 from public.schedule_lineup_sections where workspace_id=w and id=(segment->>'section_id')::uuid and archived_at is null) then raise exception 'Section is not active in this workspace'; end if;
  if upper(span)>now() and public.lineup_section_restriction(w,(segment->>'section_id')::uuid,loc,(entry->>'shift_type_id')::uuid,(entry->>'job_id')::uuid) is not null then raise exception '%',public.lineup_section_restriction(w,(segment->>'section_id')::uuid,loc,(entry->>'shift_type_id')::uuid,(entry->>'job_id')::uuid); end if;
  if not coalesce((entry->>'hidden')::boolean,false) and coalesce((select p.closed from public.lineup_section_plans p where p.workspace_id=w and p.location_id=loc and p.date=d and p.section_id=(segment->>'section_id')::uuid and (p.shift_type_id is null or p.shift_type_id=(entry->>'shift_type_id')::uuid) order by p.shift_type_id nulls last limit 1),false) then raise exception 'This section is closed for the selected service'; end if;
 end loop;
 if seen<>tstzmultirange(original) then raise exception 'Placement intervals must cover the complete shift'; end if;
 if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(next_segments)) then raise exception 'Placement interval IDs must be unique'; end if;
 for segment in select * from jsonb_array_elements(old_segments) loop
  past:=tstzrange((segment->>'start_at')::timestamptz,(segment->>'end_at')::timestamptz,'[)') * tstzrange(null,now(),'[)');
  if not isempty(past) then
   select coalesce(range_agg(tstzrange((n->>'start_at')::timestamptz,(n->>'end_at')::timestamptz,'[)')),'{}'::tstzmultirange) into covered from jsonb_array_elements(next_segments) n where (n->>'section_id',coalesce(n->>'station','')) is not distinct from (segment->>'section_id',coalesce(segment->>'station',''));
   if not covered @> past then raise exception 'Past placement is preserved; choose an interval that starts in the future'; end if;
  end if;
 end loop;
 -- Coalesce adjacent equal placements so a no-op cannot duplicate a person.
 with ordered as (
  select n, (n->>'start_at')::timestamptz starts, (n->>'end_at')::timestamptz ends,
   case when lag((n->>'end_at')::timestamptz) over q=(n->>'start_at')::timestamptz and (lag(n->>'section_id') over q,lag(coalesce(n->>'station','')) over q) is not distinct from (n->>'section_id',coalesce(n->>'station','')) then 0 else 1 end boundary
  from jsonb_array_elements(next_segments) n window q as (order by (n->>'start_at')::timestamptz)
 ), grouped as (select *,sum(boundary) over(order by starts) island from ordered), merged as (
 select jsonb_build_object('id',(array_agg(n->>'id' order by starts))[1],'start_at',min(starts),'end_at',max(ends),'section_id',min(n->>'section_id'),'station',min(coalesce(n->>'station',''))) n,min(starts) starts from grouped group by island)
 select jsonb_agg(n order by starts) into next_segments from merged;
 -- A single full-shift placement uses the existing section/station fields.
 if jsonb_array_length(next_segments)=1 then
  entry:=entry||jsonb_build_object('section_id',next_segments->0->'section_id','station',next_segments->0->'station'); next_segments:='[]';
 end if;
 return (entry-'placement_range')||jsonb_build_object('placement_segments',(select coalesce(jsonb_agg(n-'section_name' order by n->>'start_at'),'[]'::jsonb) from jsonb_array_elements(next_segments) n));
end; $$;
revoke all on function public.lineup_prepare_placement(uuid,uuid,date,text,jsonb,jsonb) from public,anon,authenticated,service_role;

create function public.upsert_schedule_lineup_entry_service(actor_user_id uuid,target_workspace_id uuid,target_location_id uuid,target_date date,target_entry_id uuid,target_expected_revision integer,entry jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare shift public.schedule_published_shifts%rowtype; old public.schedule_lineup_entries%rowtype; result jsonb; before_entry jsonb; tz text;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));
  if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.lineup.manage',target_location_id) then raise exception 'line-up access denied'; end if;
  if not coalesce((select lineup_operations_enabled from public.locations where workspace_id=target_workspace_id and id=target_location_id),false) then raise exception 'Line Up changes are disabled for this location'; end if;
  select timezone into tz from public.locations where workspace_id=target_workspace_id and id=target_location_id;
  select e into before_entry from jsonb_array_elements(public.get_schedule_lineup_service(actor_user_id,target_workspace_id,target_date,array[target_location_id],null)->'locations') l cross join lateral jsonb_array_elements(l->'entries') e where e->>'overlay_id'=target_entry_id::text or (target_entry_id is null and e->>'source_shift_id'=entry->>'source_shift_id');
  entry:=public.lineup_prepare_placement(target_workspace_id,target_location_id,target_date,tz,before_entry,entry);
  if nullif(entry->>'source_shift_id','') is not null then
    select * into shift from public.schedule_published_shifts where id=(entry->>'source_shift_id')::uuid and workspace_id=target_workspace_id for update;
    if shift.id is null or shift.location_id<>target_location_id or shift.scheduled_date<>target_date then raise exception 'published shift not found'; end if;
    if shift.employee_id is distinct from nullif(entry->>'employee_id','')::uuid or shift.job_id is distinct from nullif(entry->>'job_id','')::uuid or shift.shift_type_id is distinct from nullif(entry->>'shift_type_id','')::uuid
      or shift.start_time is distinct from nullif(entry->>'start_time','')::time or shift.end_time is distinct from nullif(entry->>'end_time','')::time then raise exception 'Use a Schedule operation to change staffing or shift times'; end if;
  elsif nullif(entry->>'employee_id','') is not null then
    select * into old from public.schedule_lineup_entries where id=target_entry_id and workspace_id=target_workspace_id for update;
    if old.id is null or old.employee_id is distinct from (entry->>'employee_id')::uuid or old.start_time is distinct from (entry->>'start_time')::time or old.end_time is distinct from (entry->>'end_time')::time then raise exception 'Use an assignment operation to create working time'; end if;
  else
    if nullif(entry->>'job_id','') is null or nullif(entry->>'shift_type_id','') is null or nullif(entry->>'start_time','') is null or nullif(entry->>'end_time','') is null then raise exception 'Position, service and time are required for an extra line'; end if;
  end if;
  if not coalesce((entry->>'hidden')::boolean,false) and coalesce((select p.closed from public.lineup_section_plans p where p.workspace_id=target_workspace_id and p.location_id=target_location_id and p.date=target_date and p.section_id=(entry->>'section_id')::uuid and (p.shift_type_id is null or p.shift_type_id=(entry->>'shift_type_id')::uuid) order by p.shift_type_id nulls last limit 1),false) then raise exception 'This section is closed for the selected service'; end if;
  if before_entry is null and public.lineup_section_restriction(target_workspace_id,(entry->>'section_id')::uuid,target_location_id,(entry->>'shift_type_id')::uuid,(entry->>'job_id')::uuid) is not null then raise exception '%',public.lineup_section_restriction(target_workspace_id,(entry->>'section_id')::uuid,target_location_id,(entry->>'shift_type_id')::uuid,(entry->>'job_id')::uuid); end if;
  select * into old from public.schedule_lineup_entries where id=target_entry_id and workspace_id=target_workspace_id;
  result:=public.upsert_schedule_lineup_entry_operations_base(actor_user_id,target_workspace_id,target_location_id,target_date,target_entry_id,target_expected_revision,entry);
  update public.schedule_lineup_entries set note=coalesce(entry->>'note',note),source_changed=false,placement_segments=coalesce(entry->'placement_segments','[]'::jsonb) where id=(result->>'entry_id')::uuid and workspace_id=target_workspace_id;
  insert into public.lineup_operation_events(workspace_id,actor_user_id,kind,date,location_ids,description,before_state,after_state,idempotency_key)
  values(target_workspace_id,actor_user_id,'placement',target_date,array[target_location_id],case when coalesce((entry->>'call_off')::boolean,false) then 'Marked called off' when coalesce((entry->>'hidden')::boolean,false) then 'Cancelled open extra line' when target_entry_id is null and shift.id is null then 'Created an extra line' else 'Updated section placement' end,coalesce(to_jsonb(old),'{}'::jsonb),entry,gen_random_uuid());
  return result;
end; $$;

-- Legacy drag/move clients may only rearrange within the same location/day.
create or replace function public.move_schedule_lineup_entry_service(actor_user_id uuid,target_workspace_id uuid,move jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare model jsonb; loc jsonb; row jsonb;
begin
  model:=public.get_schedule_lineup_service(actor_user_id,target_workspace_id,(move->>'target_date')::date,null,null);
  select l,e into loc,row from jsonb_array_elements(model->'locations') l cross join lateral jsonb_array_elements(l->'entries') e where e->>'id'=move->>'source_entry_id';
  if row is null then raise exception 'line-up entry not found'; end if;
  if loc->>'id'<>move->>'target_location_id' then raise exception 'Use a transfer operation to move between locations'; end if;
  return public.upsert_schedule_lineup_entry_service(actor_user_id,target_workspace_id,(loc->>'id')::uuid,(move->>'target_date')::date,(row->>'overlay_id')::uuid,(row->>'revision')::integer,
    row||jsonb_build_object('section_id',move->'target_section_id','display_order',coalesce((move->>'display_order')::integer,0)));
end; $$;

create function public.lineup_entry_day(w uuid,entry_id uuid) returns date
language sql stable security definer set search_path='' as $$
 select coalesce(
   (select ln.lineup_date from public.schedule_lineup_entries e join public.schedule_lineups ln on ln.id=e.lineup_id where e.workspace_id=w and e.id=entry_id),
   (select ps.scheduled_date from public.schedule_published_shifts ps where ps.workspace_id=w and ps.id=entry_id));
$$;
revoke all on function public.lineup_entry_day(uuid,uuid) from public,anon,authenticated,service_role;

create function public.lineup_operation_model(actor uuid,w uuid,d date,op jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare proposal public.lineup_proposals%rowtype; source_model jsonb; destination_model jsonb; model jsonb; item jsonb; day date;
 source_day date:=coalesce(public.lineup_entry_day(w,(op->>'source_entry_id')::uuid),d);
 other_day date:=coalesce(public.lineup_entry_day(w,(op->>'target_entry_id')::uuid),d);
begin
 if op->>'_proposal_id' is null then
   model:=public.get_schedule_lineup_service(actor,w,d,null,null);
   for day in select distinct value from unnest(array[source_day,other_day]) value where value<>d order by value loop
     item:=public.get_schedule_lineup_service(actor,w,day,null,null);
     model:=jsonb_set(model,'{locations}',(model->'locations')||(item->'locations'));
   end loop;
   return model;
 end if;
 select * into proposal from public.lineup_proposals where id=(op->>'_proposal_id')::uuid and workspace_id=w;
 if proposal.id is null or proposal.kind<>'transfer' or proposal.operation<>(op-'_proposal_id') or proposal.status<>'pending' or proposal.expires_at<=now() then raise exception 'stale transfer proposal'; end if;
 if not public.schedule_actor_can_publish_service(proposal.created_by,w,proposal.source_location_id) or not public.schedule_actor_has_capability_service(proposal.created_by,w,'schedule.lineup.manage',proposal.source_location_id)
 or not public.schedule_actor_can_publish_service(actor,w,proposal.target_location_id) or not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',proposal.target_location_id) then raise exception 'Transfer approval scope denied'; end if;
 source_model:=public.get_schedule_lineup_service(proposal.created_by,w,proposal.source_date,array[proposal.source_location_id],null);
 destination_model:=public.get_schedule_lineup_service(actor,w,other_day,array[proposal.target_location_id],null);
 if proposal.source_state is distinct from (select e from jsonb_array_elements(source_model->'locations') l cross join lateral jsonb_array_elements(l->'entries') e where e->>'id'=op->>'source_entry_id') then raise exception 'stale transfer source; request a new review'; end if;
 return jsonb_set(source_model,'{locations}',(source_model->'locations')||(destination_model->'locations'));
end; $$;

create function public.lineup_split_has_publications(w uuid,loc uuid,original tstzrange,part tstzrange,travel integer) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare tz text; cut tstzrange; remaining tstzmultirange; gaps tstzmultirange; piece tstzrange; day date;
begin
 select timezone into tz from public.locations where id=loc and workspace_id=w;
 cut:=tstzrange(lower(part)-make_interval(mins=>travel),upper(part)+make_interval(mins=>travel),'[)');
 remaining:=tstzmultirange(original)-tstzmultirange(cut);
 gaps:=tstzmultirange(original)-remaining-tstzmultirange(part);
 for piece in select unnest(remaining) union all select unnest(gaps) union all select part loop
   day:=(lower(piece) at time zone tz)::date;
   if not exists(select 1 from public.schedule_location_publications p where p.workspace_id=w and p.location_id=loc and p.status='current' and day between p.week_start and p.week_start+6) then return false; end if;
 end loop;
 return true;
end; $$;
revoke all on function public.lineup_split_has_publications(uuid,uuid,tstzrange,tstzrange,integer) from public,anon,authenticated,service_role;

create function public.lineup_operation_preview(actor uuid,w uuid,op jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare target jsonb:=op->'target'; d date:=(target->>'date')::date; destination uuid:=(target->>'location_id')::uuid;
  model jsonb; src jsonb; src_loc jsonb; other jsonb; other_loc jsonb; check1 jsonb; check2 jsonb; other_target jsonb;
  blocked text[]:=array[]::text[]; effects text[]:=array[]::text[]; exclude_ids uuid[]:=array[]::uuid[]; candidate uuid;
  span tstzrange; original tstzrange; fingerprint text; needs_approval boolean:=false; source_actor uuid:=actor;
begin
  model:=public.lineup_operation_model(actor,w,d,op);
  if not coalesce((select lineup_operations_enabled from public.locations where id=destination and workspace_id=w),false) then blocked:=array_append(blocked,'Line Up is read-only at the destination'); end if;
  if op->>'_proposal_id' is not null then select created_by into source_actor from public.lineup_proposals where id=(op->>'_proposal_id')::uuid; end if;
  if not public.schedule_actor_can_publish_service(case when op->>'_proposal_id' is not null and op->>'kind'='swap' then source_actor else actor end,w,destination) or not public.schedule_actor_has_capability_service(case when op->>'_proposal_id' is not null and op->>'kind'='swap' then source_actor else actor end,w,'schedule.lineup.manage',destination) then
    if op->>'kind' in ('move','swap') and op->>'_proposal_id' is null then needs_approval:=true; else raise exception 'Schedule publish and Line Up manage access denied'; end if;
  end if;
  if (target->>'start_time')::time=(target->>'end_time')::time then raise exception 'Start and end must differ'; end if;
  if not exists(select 1 from public.schedule_location_publications where workspace_id=w and location_id=destination and status='current' and d between week_start and week_start+6) then blocked:=array_append(blocked,'Publish the destination Schedule week before assigning staff'); end if;
  if op->>'kind' not in ('assign','replace','move','swap','release') or char_length(btrim(op->>'reason')) not between 1 and 500 then raise exception 'Valid operation and reason required'; end if;
  if not exists(select 1 from public.jobs where id=(target->>'job_id')::uuid and workspace_id=w and archived_at is null) or not exists(select 1 from public.shift_types where id=(target->>'shift_type_id')::uuid and workspace_id=w and archived_at is null) then raise exception 'Position or service not found'; end if;
  if public.lineup_section_restriction(w,(target->>'section_id')::uuid,destination,(target->>'shift_type_id')::uuid,(target->>'job_id')::uuid) is not null then blocked:=array_append(blocked,public.lineup_section_restriction(w,(target->>'section_id')::uuid,destination,(target->>'shift_type_id')::uuid,(target->>'job_id')::uuid)); end if;
  if coalesce((select p.closed from public.lineup_section_plans p where p.workspace_id=w and p.location_id=destination and p.date=d and p.section_id=(target->>'section_id')::uuid and (p.shift_type_id is null or p.shift_type_id=(target->>'shift_type_id')::uuid) order by p.shift_type_id nulls last limit 1),false) then blocked:=array_append(blocked,'This section is closed for the selected service'); end if;
  if target->>'section_id' is not null and not exists(select 1 from public.schedule_lineup_sections where id=(target->>'section_id')::uuid and workspace_id=w and archived_at is null) then raise exception 'Section not found'; end if;
  select l,e into src_loc,src from jsonb_array_elements(model->'locations') l cross join lateral jsonb_array_elements(l->'entries') e where e->>'id'=op->>'source_entry_id';
  if op->>'source_entry_id' is not null and (src is null or (src->>'orphaned')::boolean or (src->>'hidden')::boolean) then blocked:=array_append(blocked,'Source assignment changed or was removed'); end if;
  if src is not null then
    if not (select lineup_operations_enabled from public.locations where id=(src_loc->>'id')::uuid and workspace_id=w) then blocked:=array_append(blocked,'Line Up is read-only at the source'); end if;
    if coalesce((src->>'source_changed')::boolean,false) then blocked:=array_append(blocked,'Review the updated Schedule assignment before changing staffing'); end if;
    if not public.schedule_actor_can_publish_service(source_actor,w,(src_loc->>'id')::uuid) or not public.schedule_actor_has_capability_service(source_actor,w,'schedule.lineup.manage',(src_loc->>'id')::uuid) then raise exception 'Source Schedule publish access denied'; end if;
    exclude_ids:=array_append(exclude_ids,coalesce((src->>'source_shift_id')::uuid,(src->>'id')::uuid));
    original:=public.lineup_shift_range(coalesce(public.lineup_entry_day(w,(src->>'id')::uuid),d),(src->>'start_time')::time,(src->>'end_time')::time,src_loc->>'timezone');
    span:=public.lineup_shift_range(d,(target->>'start_time')::time,(target->>'end_time')::time,(select timezone from public.locations where id=destination));
    if not original @> span then blocked:=array_append(blocked,'The changed interval must fit within the original shift'); end if;
    if original @> span and not public.lineup_split_has_publications(w,(src_loc->>'id')::uuid,original,span,case when op->>'kind' in('move','swap') then coalesce((op->>'travel_minutes')::integer,0) else 0 end) then blocked:=array_append(blocked,'Publish the affected next Schedule week before splitting this overnight assignment'); end if;
    if op->>'kind' in ('move','swap') and src->>'employee_id' is null then blocked:=array_append(blocked,'Choose an assigned employee'); end if;
    if op->>'kind' in ('move','swap') and src->>'source_shift_id' is null then blocked:=array_append(blocked,'Legacy manual assignment requires Schedule reconciliation first'); end if;
    if op->>'kind'='move' and destination=(src_loc->>'id')::uuid then blocked:=array_append(blocked,'Choose another destination location'); end if;
    if op->>'kind' in ('replace','assign') and destination<>(src_loc->>'id')::uuid then blocked:=array_append(blocked,'Replacement stays in the source location'); end if;
    if lower(span)<now() and (span<>original or op->>'kind' in ('move','swap','replace','release')) then blocked:=array_append(blocked,'Past working time cannot be transferred; select a future handover interval'); end if;
  elsif op->>'kind'<>'assign' then blocked:=array_append(blocked,'A source assignment is required'); end if;
  if op->>'kind'='move' and op->>'target_entry_id' is not null then
    select l,e into other_loc,other from jsonb_array_elements(model->'locations') l cross join lateral jsonb_array_elements(l->'entries') e where e->>'id'=op->>'target_entry_id';
    if other is null or other_loc->>'id'<>target->>'location_id' or (other->>'hidden')::boolean or (other->>'orphaned')::boolean or coalesce((other->>'source_changed')::boolean,false) or (other->>'employee_id' is not null and not (other->>'call_off')::boolean and not coalesce((op->>'replace_target')::boolean,false)) then blocked:=array_append(blocked,'The destination coverage need is no longer open');
    elsif other->>'employee_id' is not null and other->>'source_shift_id' is null then blocked:=array_append(blocked,'Reconcile the legacy destination assignment in Schedule first');
    elsif other->>'job_id'<>target->>'job_id' or other->>'shift_type_id'<>target->>'shift_type_id' then blocked:=array_append(blocked,'Choose the position and service of the destination coverage need');
    elsif not public.lineup_shift_range(coalesce(public.lineup_entry_day(w,(other->>'id')::uuid),d),(other->>'start_time')::time,(other->>'end_time')::time,other_loc->>'timezone') @> span then blocked:=array_append(blocked,'The moved interval must fit inside the destination coverage need');
    else effects:=array_append(effects,case when other->>'employee_id' is not null and not (other->>'call_off')::boolean then 'Replaces '||(other->>'employee_name')||' at '||(other_loc->>'name')||' for the selected interval. Their unchanged hours are preserved.' else 'Fills the existing open need at '||(other_loc->>'name')||'. Its uncovered intervals remain open.' end); end if;
  end if;
  if op->>'kind'='swap' then
    select l,e into other_loc,other from jsonb_array_elements(model->'locations') l cross join lateral jsonb_array_elements(l->'entries') e where e->>'id'=op->>'target_entry_id';
    if op->>'target_entry_id' is null and destination<>(src_loc->>'id')::uuid then
      needs_approval:=true;effects:=array_append(effects,'The destination manager will choose the swap counterpart. Both employees must qualify before any assignment changes.');
    elsif other is null or other->>'employee_id' is null or other->>'source_shift_id' is null or (other->>'orphaned')::boolean or (other->>'hidden')::boolean or (other->>'call_off')::boolean then blocked:=array_append(blocked,'The other assignment is no longer available');
    elsif other_loc->>'id'=src_loc->>'id' or other->>'employee_id'=src->>'employee_id' then blocked:=array_append(blocked,'Choose a different employee at another location');
    else
      if not public.schedule_actor_can_publish_service(actor,w,(other_loc->>'id')::uuid) or not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',(other_loc->>'id')::uuid) then raise exception 'Both locations require Schedule publish and Line Up manage access'; end if;
      if destination<>(src_loc->>'id')::uuid then blocked:=array_append(blocked,'Choose the swap interval in the source location timezone'); end if;
      if not (select lineup_operations_enabled from public.locations where id=(other_loc->>'id')::uuid and workspace_id=w) then blocked:=array_append(blocked,'Line Up is read-only at the counterpart location'); end if;
      exclude_ids:=array_append(exclude_ids,(other->>'source_shift_id')::uuid);
      other_target:=jsonb_build_object('date',(lower(span) at time zone (other_loc->>'timezone'))::date,'location_id',other_loc->'id','job_id',other->'job_id','shift_type_id',other->'shift_type_id','start_time',to_char(lower(span) at time zone (other_loc->>'timezone'),'HH24:MI'),'end_time',to_char(upper(span) at time zone (other_loc->>'timezone'),'HH24:MI'));
      if not public.lineup_shift_range(coalesce(public.lineup_entry_day(w,(other->>'id')::uuid),d),(other->>'start_time')::time,(other->>'end_time')::time,other_loc->>'timezone') @> span then blocked:=array_append(blocked,'The swap interval must fit inside both assignments'); end if;
      if not public.lineup_split_has_publications(w,(other_loc->>'id')::uuid,public.lineup_shift_range(coalesce(public.lineup_entry_day(w,(other->>'id')::uuid),d),(other->>'start_time')::time,(other->>'end_time')::time,other_loc->>'timezone'),span,coalesce((op->>'travel_minutes')::integer,0)) then blocked:=array_append(blocked,'Publish the counterpart Schedule week before splitting this overnight assignment'); end if;
      check2:=public.lineup_candidate_check(w,(src->>'employee_id')::uuid,other_target,exclude_ids,(op->>'travel_minutes')::integer);
      if check2->>'status'<>'eligible' then blocked:=blocked||array(select jsonb_array_elements_text(check2->'reasons')); end if;

      effects:=array_append(effects,(src->>'employee_name')||' → '||(other_loc->>'name')||' · '||(other->>'job_name')||' · '||(other_target->>'date')||' '||(other_target->>'start_time')||'–'||(other_target->>'end_time')||' ('||(other_loc->>'timezone')||')');
    end if;
    candidate:=coalesce((other->>'employee_id')::uuid,(src->>'employee_id')::uuid);
  else candidate:=case when op->>'kind'='move' then (src->>'employee_id')::uuid else (op->>'employee_id')::uuid end; end if;
  if op->>'kind'='release' then
    if src->>'employee_id' is null or src->>'source_shift_id' is null then blocked:=array_append(blocked,'Choose a current Schedule assignment with an employee'); end if;
    if destination is distinct from (src_loc->>'id')::uuid or target->>'job_id' is distinct from src->>'job_id' or target->>'shift_type_id' is distinct from src->>'shift_type_id' then blocked:=array_append(blocked,'Removing an assignment keeps its location, position and service'); end if;
    if op->>'employee_id' is not null or op->>'target_entry_id' is not null or coalesce((op->>'travel_minutes')::integer,0)<>0 then blocked:=array_append(blocked,'Removal does not assign a replacement or reserve travel'); end if;
    effects:=array_append(effects,coalesce(src->>'employee_name','Employee')||' is removed for the selected interval. The same position remains open; earlier and later work stays assigned.');
  elsif candidate is null then blocked:=array_append(blocked,'Choose an employee');
  else
    check1:=public.lineup_candidate_check(w,candidate,target,exclude_ids,(op->>'travel_minutes')::integer);
    if check1->>'status'<>'eligible' then blocked:=blocked||array(select jsonb_array_elements_text(check1->'reasons')); end if;
  end if;
  if op->>'kind' in ('move','swap') and (op->>'travel_minutes')::integer>0 then effects:=array_append(effects,(op->>'travel_minutes')||' minutes of travel are reserved before and after the changed interval. Any resulting gaps remain open.'); end if;
  if op->>'kind'<>'release' then
  effects:=array_append(effects,coalesce((select coalesce(nullif(preferred_name,''),concat_ws(' ',first_name,last_name)) from public.employee_profiles where id=candidate),'Employee')||' → '||(select name from public.locations where id=destination)||' · '||d::text||' '||(target->>'start_time')||'–'||(target->>'end_time')||' ('||(select timezone from public.locations where id=destination)||')');
  end if;
  if op->>'kind'='move' then effects:=array_append(effects,'An open position remains at '||(src_loc->>'name')||' · '||to_char(lower(span) at time zone (src_loc->>'timezone'),'YYYY-MM-DD HH24:MI')||'–'||to_char(upper(span) at time zone (src_loc->>'timezone'),'HH24:MI')||' ('||(src_loc->>'timezone')||').'); end if;
  if needs_approval then effects:=array_append(effects,'Awaiting destination approval. No shifts change until the other location approves.'); end if;
  effects:=array_append(effects,'Schedule and Line Up update together. Previous working records stay unchanged. Share the updated plan for acknowledgement.');
  fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('operation',op,'model',model,'candidate',check1,'other_candidate',check2)::text,'UTF8'),'sha256'),'hex');
  return jsonb_build_object('fingerprint',fingerprint,'allowed',cardinality(blocked)=0,'requires_approval',needs_approval,'effects',to_jsonb(effects),'blockers',to_jsonb(blocked));
end; $$;

create function public.lineup_candidate_option(actor uuid,w uuid,emp uuid,target jsonb,excluded uuid[],need jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; assignment record; model jsonb; source jsonb; preview jsonb; op jsonb; span tstzrange; target_tz text;
begin
 result:=public.lineup_candidate_check(w,emp,target,excluded);
 if result->>'status'<>'ineligible' then return result; end if;
 select timezone into target_tz from public.locations where id=(target->>'location_id')::uuid and workspace_id=w;
 span:=public.lineup_shift_range((target->>'date')::date,(target->>'start_time')::time,(target->>'end_time')::time,target_tz);
 for assignment in
   select ps.*,l.timezone,l.name as location_name from public.schedule_published_shifts ps join public.schedule_location_publications pub on pub.id=ps.publication_id and pub.status='current' join public.locations l on l.id=ps.location_id
   where ps.workspace_id=w and ps.employee_id=emp and ps.location_id<>(target->>'location_id')::uuid and not ps.id=any(excluded)
     and ps.scheduled_date between (target->>'date')::date-2 and (target->>'date')::date+2
     and public.schedule_actor_can_publish_service(actor,w,ps.location_id) and public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',ps.location_id)
     and public.lineup_shift_range(ps.scheduled_date,ps.start_time,ps.end_time,l.timezone) @> span
   order by ps.scheduled_date,ps.id loop
   model:=public.get_schedule_lineup_service(actor,w,assignment.scheduled_date,array[assignment.location_id],null);
   select e into source from jsonb_array_elements(model->'locations'->0->'entries') e where e->>'source_shift_id'=assignment.id::text;
   if source is null or (source->>'hidden')::boolean or (source->>'call_off')::boolean or (source->>'orphaned')::boolean or coalesce((source->>'source_changed')::boolean,false) then continue; end if;
   op:=jsonb_build_object('kind','move','source_entry_id',source->'id','target_entry_id',need->'id','employee_id',emp,'replace_target',need->>'employee_id' is not null and not coalesce((need->>'call_off')::boolean,false),'target',target,'reason','Review a move to cover this assignment','travel_minutes',0);
   preview:=public.lineup_operation_preview(actor,w,op);
   if (preview->>'allowed')::boolean then
     return result||jsonb_build_object('status','movable','reasons',jsonb_build_array('Currently assigned at '||assignment.location_name,'Moving leaves one '||(source->>'job_name')||' coverage gap at the source. Review the impact before confirming.'),
       'move_source',jsonb_build_object('entry_id',source->'id','location_id',assignment.location_id,'location_name',assignment.location_name,'date',assignment.scheduled_date,'timezone',assignment.timezone,'job_name',source->'job_name','start_time',source->'start_time','end_time',source->'end_time'));
   end if;
 end loop;
 return result;
end; $$;
revoke all on function public.lineup_candidate_option(uuid,uuid,uuid,jsonb,uuid[],jsonb) from public,anon,authenticated,service_role;

create function public.lineup_day_publication(w uuid,loc uuid,day date) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare publication uuid;
begin
 select p.id into publication from public.schedule_location_publications p where p.workspace_id=w and p.location_id=loc and p.status='current' and day between p.week_start and p.week_start+6;
 if publication is null then raise exception 'Publish the Schedule week covering % at the affected location before splitting an overnight assignment',day; end if;
 return publication;
end; $$;
revoke all on function public.lineup_day_publication(uuid,uuid,date) from public,anon,authenticated,service_role;

create function public.lineup_clip_placements(segments jsonb,span tstzrange) returns jsonb
language sql volatile set search_path='' as $$
 select coalesce(jsonb_agg((s-'section_name')||jsonb_build_object('id',case when clipped=original then (s->>'id')::uuid else gen_random_uuid() end,'start_at',lower(clipped),'end_at',upper(clipped)) order by lower(clipped)),'[]'::jsonb)
 from jsonb_array_elements(coalesce(segments,'[]'::jsonb)) s
 cross join lateral (select tstzrange((s->>'start_at')::timestamptz,(s->>'end_at')::timestamptz,'[)') original) o
 cross join lateral (select original * span clipped) c where not isempty(clipped);
$$;
revoke all on function public.lineup_clip_placements(jsonb,tstzrange) from public,anon,authenticated,service_role;

create function public.lineup_copy_segment_placement(actor uuid,w uuid,original_entry jsonb,shift_id uuid,span tstzrange) returns void
language plpgsql security definer set search_path='' as $$
declare shift public.schedule_published_shifts%rowtype; ln public.schedule_lineups%rowtype;
begin
 if original_entry->>'id' is null then return; end if;
 select * into strict shift from public.schedule_published_shifts where workspace_id=w and id=shift_id;
 insert into public.schedule_lineups(workspace_id,location_id,lineup_date,created_by,updated_by)
 values(w,shift.location_id,shift.scheduled_date,actor,actor)
 on conflict(workspace_id,location_id,lineup_date) do update set revision=public.schedule_lineups.revision+1 returning * into ln;
 insert into public.schedule_lineup_entries(workspace_id,lineup_id,location_id,source_shift_id,employee_id,job_id,shift_type_id,start_time,end_time,section_id,station,call_off,display_order,placement_segments,note,created_by,updated_by)
 values(w,ln.id,shift.location_id,shift.id,shift.employee_id,shift.job_id,shift.shift_type_id,shift.start_time,shift.end_time,(original_entry->>'section_id')::uuid,coalesce(original_entry->>'station',''),
 case when shift.employee_id is null then false else coalesce((original_entry->>'call_off')::boolean,false) end,coalesce((original_entry->>'display_order')::integer,0),public.lineup_clip_placements(original_entry->'placement_segments',span),coalesce(original_entry->>'note',''),actor,actor);
end; $$;
revoke all on function public.lineup_copy_segment_placement(uuid,uuid,jsonb,uuid,tstzrange) from public,anon,authenticated,service_role;

create function public.lineup_assign_segment(actor uuid,w uuid,source_id uuid,emp uuid,target jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare old public.schedule_published_shifts%rowtype; pub public.schedule_location_publications%rowtype; saved public.schedule_published_shifts%rowtype;
  src_loc public.locations%rowtype; dest public.locations%rowtype; ln public.schedule_lineups%rowtype;
  d date:=(target->>'date')::date; original tstzrange; part tstzrange; cut tstzrange; residual tstzrange; remaining tstzmultirange; gaps tstzmultirange; travel integer:=coalesce((target->>'travel_minutes')::integer,0);
  new_id uuid; source_line public.schedule_lineup_entries%rowtype;
begin
  select * into dest from public.locations where id=(target->>'location_id')::uuid and workspace_id=w;
  select * into pub from public.schedule_location_publications where workspace_id=w and location_id=dest.id and status='current' and d between week_start and week_start+6 for update;
  if pub.id is null then raise exception 'Publish the destination Schedule week before assigning staff'; end if;
  if source_id is not null then
    select * into old from public.schedule_published_shifts where id=source_id and workspace_id=w for update;
    select * into src_loc from public.locations where id=old.location_id;
    select * into source_line from public.schedule_lineup_entries where source_shift_id=old.id and workspace_id=w;
    original:=public.lineup_shift_range(old.scheduled_date,old.start_time,old.end_time,src_loc.timezone);
    part:=public.lineup_shift_range(d,(target->>'start_time')::time,(target->>'end_time')::time,dest.timezone);
    cut:=tstzrange(lower(part)-make_interval(mins=>travel),upper(part)+make_interval(mins=>travel),'[)');
    remaining:=tstzmultirange(original)-tstzmultirange(cut);
    gaps:=tstzmultirange(original)-remaining-tstzmultirange(part);
    for residual in select unnest(gaps) loop
      insert into public.schedule_published_shifts(workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,note,source_shift_id)
      values(w,old.location_id,public.lineup_day_publication(w,old.location_id,(lower(residual) at time zone src_loc.timezone)::date),null,old.job_id,old.shift_type_id,(lower(residual) at time zone src_loc.timezone)::date,(lower(residual) at time zone src_loc.timezone)::time,(upper(residual) at time zone src_loc.timezone)::time,'Coverage needed during travel',gen_random_uuid()) returning id into new_id;
      perform public.lineup_copy_segment_placement(actor,w,to_jsonb(source_line),new_id,residual);
    end loop;
    for residual in select unnest(remaining) loop
      insert into public.schedule_published_shifts(workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,note,source_shift_id)
      values(w,old.location_id,public.lineup_day_publication(w,old.location_id,(lower(residual) at time zone src_loc.timezone)::date),old.employee_id,old.job_id,old.shift_type_id,(lower(residual) at time zone src_loc.timezone)::date,(lower(residual) at time zone src_loc.timezone)::time,(upper(residual) at time zone src_loc.timezone)::time,old.note,gen_random_uuid()) returning id into new_id;
      perform public.lineup_copy_segment_placement(actor,w,to_jsonb(source_line),new_id,residual);
    end loop;
    if old.location_id<>dest.id then
      insert into public.schedule_published_shifts(workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,note,source_shift_id)
      values(w,old.location_id,public.lineup_day_publication(w,old.location_id,(lower(part) at time zone src_loc.timezone)::date),null,old.job_id,old.shift_type_id,(lower(part) at time zone src_loc.timezone)::date,(lower(part) at time zone src_loc.timezone)::time,(upper(part) at time zone src_loc.timezone)::time,'Coverage needed after location transfer',gen_random_uuid()) returning id into new_id;
      perform public.lineup_copy_segment_placement(actor,w,to_jsonb(source_line),new_id,part);
    end if;
    update public.schedule_published_shifts set employee_id=emp,publication_id=pub.id,location_id=dest.id,job_id=(target->>'job_id')::uuid,shift_type_id=(target->>'shift_type_id')::uuid,scheduled_date=d,start_time=(target->>'start_time')::time,end_time=(target->>'end_time')::time where id=old.id returning * into saved;
  else
    insert into public.schedule_published_shifts(workspace_id,location_id,publication_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
    values(w,dest.id,pub.id,emp,(target->>'job_id')::uuid,(target->>'shift_type_id')::uuid,d,(target->>'start_time')::time,(target->>'end_time')::time,gen_random_uuid()) returning * into saved;
  end if;
  insert into public.schedule_lineups(workspace_id,location_id,lineup_date,created_by,updated_by) values(w,dest.id,d,actor,actor)
  on conflict(workspace_id,location_id,lineup_date) do update set revision=public.schedule_lineups.revision+1,updated_by=actor,updated_at=now() returning * into ln;
  if source_line.id is not null then
    update public.schedule_lineup_entries set lineup_id=ln.id,location_id=dest.id,employee_id=emp,job_id=saved.job_id,shift_type_id=saved.shift_type_id,start_time=saved.start_time,end_time=saved.end_time,section_id=(target->>'section_id')::uuid,station=coalesce(target->>'station',''),placement_segments=coalesce(target->'placement_segments','[]'::jsonb),call_off=false,hidden=false,revision=revision+1,updated_by=actor,updated_at=now() where id=source_line.id;
  else
    insert into public.schedule_lineup_entries(workspace_id,lineup_id,location_id,source_shift_id,employee_id,job_id,shift_type_id,start_time,end_time,section_id,station,created_by,updated_by)
    values(w,ln.id,dest.id,saved.id,emp,saved.job_id,saved.shift_type_id,saved.start_time,saved.end_time,(target->>'section_id')::uuid,coalesce(target->>'station',''),actor,actor);
  end if;
  return saved.id;
end; $$;

-- Personal history and team are derived only from immutable shared content.
-- Teammates expose operational fields for the employee's own section/service.
create function public.lineup_employee_assignment(e jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('placement_start_at',e->'placement_start_at','placement_end_at',e->'placement_end_at','id',e->'id','employee_name',e->'employee_name','job_name',e->'job_name',
 'section_name',e->'section_name','station',e->'station','note',coalesce(e->>'note',''),'start_time',e->'start_time','end_time',e->'end_time','shift_type_name',e->'shift_type_name');
$$;
create function public.lineup_employee_details(current_content jsonb,prior_content jsonb,prior_version integer,emp uuid) returns jsonb
language sql stable set search_path='' as $$
 with personal as (
 select coalesce(jsonb_agg(public.lineup_employee_assignment(e) order by e->>'id'),'[]'::jsonb) entries
 from jsonb_array_elements(current_content->'entries') e where e->>'employee_id'=emp::text
 ), previous as (
 select coalesce(jsonb_agg(public.lineup_employee_assignment(e) order by e->>'id'),'[]'::jsonb) entries
 from jsonb_array_elements(coalesce(prior_content->'entries','[]'::jsonb)) e where e->>'employee_id'=emp::text
 )
 select jsonb_build_object('section_team',coalesce((select jsonb_agg(public.lineup_employee_assignment(e) order by e->>'section_name',e->>'employee_name',e->>'start_time')
 from jsonb_array_elements(current_content->'entries') e where e->>'employee_id' is not null and e->>'employee_id'<>emp::text
 and exists(select 1 from jsonb_array_elements(current_content->'entries') own where own->>'employee_id'=emp::text and own->>'section_id' is not null and own->>'section_id'=e->>'section_id' and own->>'shift_type_id'=e->>'shift_type_id')),'[]'::jsonb),
 'changes',jsonb_build_object('previous_version',prior_version,'previous_entries',previous.entries,
 'assignment_changed',prior_version is not null and personal.entries<>previous.entries,
 'brief_changed',prior_version is not null and public.lineup_person_fingerprint(current_content||jsonb_build_object('entries',current_content->'entries'),emp) is distinct from public.lineup_person_fingerprint(prior_content||jsonb_build_object('entries',current_content->'entries'),emp)))
 from personal cross join previous;
$$;
revoke all on function public.lineup_employee_assignment(jsonb),public.lineup_employee_details(jsonb,jsonb,integer,uuid) from public,anon,authenticated,service_role;

create function public.lineup_placements_service(actor uuid,w uuid,action text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d date:=(payload->>'date')::date; loc uuid:=(payload->>'location_id')::uuid; model jsonb; row jsonb; item jsonb; result jsonb;
 rows jsonb:='[]'::jsonb; saved jsonb:='[]'::jsonb; all_allowed boolean:=true; fp text; existing public.lineup_operation_events%rowtype; tz text;
 effects text[]; message text; before_rows jsonb:='[]'::jsonb; segment jsonb; original tstzrange; part tstzrange; effect_span tstzrange; start_day date;
begin
 perform pg_advisory_xact_lock(hashtextextended(w::text,921));
 if not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',loc) then raise exception 'line-up access denied'; end if;
 select timezone into tz from public.locations where workspace_id=w and id=loc and lineup_operations_enabled;
 if tz is null then raise exception 'Line Up changes are disabled for this location'; end if;
 if jsonb_array_length(payload->'entries') not between 1 and 100 or (select count(*)<>count(distinct e->>'id') from jsonb_array_elements(payload->'entries') e) then raise exception 'Choose distinct assignments'; end if;
 if action='placements_apply' then
  select * into existing from public.lineup_operation_events where workspace_id=w and idempotency_key=(payload->>'idempotency_key')::uuid;
  if existing.id is not null then
   if existing.actor_user_id<>actor or existing.before_state->'request'<>payload-'fingerprint'-'idempotency_key' then raise exception 'Idempotency key belongs to another operation'; end if;
   return existing.after_state;
  end if;
 end if;
 model:=public.get_schedule_lineup_service(actor,w,d,array[loc],null);
 fp:=encode(extensions.digest(convert_to(jsonb_build_object('model',model,'request',payload-'fingerprint'-'idempotency_key')::text,'UTF8'),'sha256'),'hex');
 for item in select * from jsonb_array_elements(payload->'entries') loop
  row:=null; message:=null; effects:=array[]::text[];
  select e into row from jsonb_array_elements(model->'locations'->0->'entries') e where e->>'id'=item->>'id';
  begin
   if row is null or (row->>'hidden')::boolean or (row->>'orphaned')::boolean then raise exception 'Assignment no longer exists in this day'; end if;
   if coalesce((row->>'source_changed')::boolean,false) then raise exception 'Review the changed Schedule source first'; end if;
   if (row->>'revision')::integer is distinct from (item->>'expected_revision')::integer then raise exception 'Assignment changed; reopen the selection'; end if;
   if (row->'source_shift_id',row->'employee_id',row->'job_id',row->'shift_type_id',row->'start_time',row->'end_time',row->'call_off',row->'hidden') is distinct from (item->'entry'->'source_shift_id',item->'entry'->'employee_id',item->'entry'->'job_id',item->'entry'->'shift_type_id',item->'entry'->'start_time',item->'entry'->'end_time',item->'entry'->'call_off',item->'entry'->'hidden') then raise exception 'Section placement cannot change staffing, attendance or shift times'; end if;
   perform public.lineup_prepare_placement(w,loc,d,tz,row,item->'entry');
   if row->>'start_time' is not null then
    original:=public.lineup_shift_range(d,(row->>'start_time')::time,(row->>'end_time')::time,tz);
    if item->'entry' ? 'placement_range' then
     start_day:=d+case when (item->'entry'->'placement_range'->>'start_time')::time<(row->>'start_time')::time then 1 else 0 end;
     part:=public.lineup_shift_range(start_day,(item->'entry'->'placement_range'->>'start_time')::time,(item->'entry'->'placement_range'->>'end_time')::time,tz);
    else part:=original; end if;
    for segment in select * from public.lineup_project_entry(row,tz) loop
     effect_span:=case when segment->>'placement_start_at' is null then original else tstzrange((segment->>'placement_start_at')::timestamptz,(segment->>'placement_end_at')::timestamptz,'[)') end * part;
     if not isempty(effect_span) and segment->>'section_id' is distinct from item->'entry'->>'section_id' and segment->>'section_id' is not null then
      effects:=array_append(effects,coalesce(nullif(segment->>'section_name',''),'Previous section')||' loses this assignment for '||to_char(lower(effect_span) at time zone tz,'HH24:MI')||'–'||to_char(upper(effect_span) at time zone tz,'HH24:MI')||'; review its coverage.');
     end if;
    end loop;
   end if;
   effects:=array_append(effects,coalesce((select name from public.schedule_lineup_sections where id=(item->'entry'->>'section_id')::uuid),'Unassigned')||' · '||coalesce(item->'entry'->'placement_range'->>'start_time',row->>'start_time','')||'–'||coalesce(item->'entry'->'placement_range'->>'end_time',row->>'end_time','')||' · Schedule working time stays unchanged.');
  exception when others then message:=sqlerrm; all_allowed:=false;
  end;
  rows:=rows||jsonb_build_array(jsonb_build_object('entry_id',item->'id','employee_name',coalesce(nullif(row->>'employee_name',''),'Open position'),'allowed',message is null,'effects',to_jsonb(effects),'blockers',case when message is null then '[]'::jsonb else jsonb_build_array(message) end));
 end loop;
 result:=jsonb_build_object('fingerprint',fp,'allowed',all_allowed,'rows',rows);
 if action='placements_preview' then return result; end if;
 if action<>'placements_apply' then raise exception 'Unknown placement action'; end if;
 if fp is distinct from payload->>'fingerprint' then raise exception 'stale section placement preview' using errcode='40001'; end if;
 if not all_allowed then raise exception 'Resolve the highlighted section placement conflicts first'; end if;
 for item in select * from jsonb_array_elements(payload->'entries') loop
  select e into row from jsonb_array_elements(model->'locations'->0->'entries') e where e->>'id'=item->>'id';
  before_rows:=before_rows||jsonb_build_array(row);
  saved:=saved||jsonb_build_array(public.upsert_schedule_lineup_entry_service(actor,w,loc,d,(row->>'overlay_id')::uuid,(row->>'revision')::integer,item->'entry'));
 end loop;
 result:=jsonb_build_object('entries',saved);
 insert into public.lineup_operation_events(workspace_id,actor_user_id,kind,date,location_ids,description,before_state,after_state,idempotency_key)
 values(w,actor,'placements',d,array[loc],'Placed '||jsonb_array_length(saved)||' assignments',jsonb_build_object('request',payload-'fingerprint'-'idempotency_key','entries',before_rows),result,(payload->>'idempotency_key')::uuid);
 return result;
end; $$;
revoke all on function public.lineup_placements_service(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;

create function public.lineup_assert_enabled(actor uuid,w uuid,locations uuid[],permission text) returns void
language plpgsql security definer set search_path='' as $$
declare loc public.locations%rowtype; found_any boolean:=false;
begin
 if permission not in ('schedule.lineup.manage','schedule.lineup.share') then raise exception 'Invalid Line Up permission'; end if;
 for loc in select * from public.locations where workspace_id=w and archived_at is null and ($3 is null or id=any($3)) order by id for share loop
  found_any:=true;
  if not public.schedule_actor_has_capability_service(actor,w,permission,loc.id) then raise exception 'line-up access denied'; end if;
  if not loc.lineup_operations_enabled then raise exception 'Line Up is read-only at this location; changes are disabled during rollout'; end if;
 end loop;
 if not found_any or ($3 is not null and exists(select 1 from unnest($3) requested where not exists(select 1 from public.locations where id=requested and workspace_id=w and archived_at is null))) then raise exception 'location not found'; end if;
end; $$;
revoke all on function public.lineup_assert_enabled(uuid,uuid,uuid[],text) from public,anon,authenticated,service_role;

create function public.lineup_operations_service(actor_user_id uuid,target_workspace_id uuid,action text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w uuid:=target_workspace_id; actor uuid:=actor_user_id; d date; source_day date; other_day date; loc uuid; result jsonb; item jsonb; model jsonb;
  op jsonb; target jsonb; preview jsonb; src jsonb; other jsonb; src_loc jsonb; other_loc jsonb;
  emp public.employee_profiles%rowtype; note public.lineup_notes%rowtype; snap public.schedule_lineup_snapshots%rowtype;
  receipt public.lineup_receipts%rowtype; existing public.lineup_operation_events%rowtype;
  employee_id uuid; source_id uuid; saved_id uuid; sent integer;
  previous jsonb; operation_id uuid; excluded uuid[]:=array[]::uuid[]; locations uuid[]; swap_span tstzrange;
begin
  if action='guard' then
   if payload->>'entry_id' is not null then
    select location_id into loc from public.schedule_lineup_entries where workspace_id=w and id=(payload->>'entry_id')::uuid;
    if loc is null then select location_id into loc from public.schedule_published_shifts where workspace_id=w and id=(payload->>'entry_id')::uuid; end if;
    if loc is null then raise exception 'line-up entry not found'; end if;
    locations:=array[loc];
   elsif jsonb_typeof(payload->'location_ids')='array' then locations:=array(select value::uuid from jsonb_array_elements_text(payload->'location_ids')); end if;
   perform public.lineup_assert_enabled(actor,w,locations,coalesce(payload->>'permission','schedule.lineup.manage'));
   return '{"enabled":true}'::jsonb;
  end if;
  if action in ('note','section_plan') then
   loc:=case when action='note' then (payload->'note'->>'location_id')::uuid else (payload->>'location_id')::uuid end;
   perform public.lineup_assert_enabled(actor,w,case when loc is null then null else array[loc] end,'schedule.lineup.manage');
  end if;
  if action in ('placements_preview','placements_apply') then return public.lineup_placements_service(actor,w,action,payload); end if;
  if action in ('published','receipt') then
    emp:=public.employee_hub_actor_service(actor,w);
    if action='published' then
      if (payload->>'to')::date<(payload->>'from')::date or (payload->>'to')::date>(payload->>'from')::date+62 then raise exception 'Invalid date range'; end if;
      select coalesce(jsonb_agg(jsonb_build_object('snapshot_id',s.id,'location_id',s.location_id,'location_name',l.name,'timezone',l.timezone,'date',s.lineup_date,'version',s.version_number,'shared_at',s.shared_at,'viewed_at',r.viewed_at,'acknowledged_at',r.acknowledged_at,'source_current',exists(select 1 from public.schedule_location_publications cp where cp.workspace_id=w and cp.location_id=s.location_id and cp.status='current' and s.lineup_date between cp.week_start and cp.week_start+6),
        'entries',coalesce((select jsonb_agg(e) from jsonb_array_elements(s.content->'entries') e where e->>'employee_id'=emp.id::text),'[]'::jsonb),
        'notes',coalesce((select jsonb_agg(n) from jsonb_array_elements(coalesce(s.content->'notes','[]'::jsonb)) n where exists(select 1 from jsonb_array_elements(s.content->'entries') e where e->>'employee_id'=emp.id::text and (n->>'shift_type_id' is null or n->>'shift_type_id'=e->>'shift_type_id') and (n->>'section_id' is null or n->>'section_id'=e->>'section_id'))),'[]'::jsonb),
        'briefs',coalesce((select jsonb_agg(b) from jsonb_array_elements(coalesce(s.content->'briefs','[]'::jsonb)) b where exists(select 1 from jsonb_array_elements(s.content->'entries') e where e->>'employee_id'=emp.id::text and e->>'shift_type_id'=b->>'shift_type_id')),'[]'::jsonb)
      )||public.lineup_employee_details(s.content,prior.content,prior.version_number,emp.id) order by s.lineup_date,l.name),'[]'::jsonb) into result
      from public.schedule_lineup_snapshots s join public.lineup_receipts r on r.snapshot_id=s.id and r.employee_id=emp.id join public.locations l on l.id=s.location_id
      left join lateral (select old.content,old.version_number from public.schedule_lineup_snapshots old join public.lineup_receipts old_receipt on old_receipt.snapshot_id=old.id and old_receipt.employee_id=emp.id where old.workspace_id=w and old.location_id=s.location_id and old.lineup_date=s.lineup_date and old.version_number<s.version_number order by old.version_number desc limit 1) prior on true
      where s.workspace_id=w and s.lineup_date between (payload->>'from')::date and (payload->>'to')::date
        and not exists(select 1 from public.schedule_lineup_snapshots newer where newer.workspace_id=w and newer.location_id=s.location_id and newer.lineup_date=s.lineup_date and newer.version_number>s.version_number)
        and exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=emp.id and a.location_id=s.location_id and a.ended_at is null);
      return result;
    end if;
    select s.* into snap from public.schedule_lineup_snapshots s join public.lineup_receipts r on r.snapshot_id=s.id and r.employee_id=emp.id
    where s.id=(payload->>'snapshot_id')::uuid and s.workspace_id=w
      and exists(select 1 from public.employee_location_assignments a where a.employee_id=emp.id and a.workspace_id=w and a.location_id=s.location_id and a.ended_at is null);
    if snap.id is null then raise exception 'Shared Line Up access denied'; end if;
    if exists(select 1 from public.schedule_lineup_snapshots s where s.workspace_id=w and s.location_id=snap.location_id and s.lineup_date=snap.lineup_date and s.version_number>snap.version_number) then raise exception 'stale shared Line Up; open the latest version'; end if;
    if payload->>'action'='acknowledge' and not exists(select 1 from public.schedule_location_publications cp where cp.workspace_id=w and cp.location_id=snap.location_id and cp.status='current' and snap.lineup_date between cp.week_start and cp.week_start+6) then raise exception 'Schedule was unpublished; this snapshot is historical'; end if;
    if payload->>'action' not in ('view','acknowledge') then raise exception 'Invalid receipt action'; end if;
    update public.lineup_receipts set viewed_at=coalesce(viewed_at,now()),acknowledged_at=case when payload->>'action'='acknowledge' then coalesce(acknowledged_at,now()) else acknowledged_at end
    where snapshot_id=snap.id and lineup_receipts.employee_id=emp.id returning * into receipt;
    return to_jsonb(receipt);
  end if;
  if not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.read') then raise exception 'Line Up access denied'; end if;
  if action='shared_export' then
    d:=(payload->>'date')::date;loc:=(payload->>'location_id')::uuid;
    if not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.share',loc) then raise exception 'Shared export scope denied'; end if;
    select * into snap from public.schedule_lineup_snapshots where workspace_id=w and location_id=loc and lineup_date=d order by version_number desc limit 1;
    if snap.id is null then raise exception 'No shared version for this day'; end if;
    if snap.content->'catalogue' is null then raise exception 'Legacy share has no immutable export catalogue; its original snapshot remains in history'; end if;
    return (snap.content->'catalogue')||jsonb_build_object('locations',jsonb_build_array((snap.content-'catalogue')||jsonb_build_object('shared_at',snap.shared_at)));
  end if;
  if action='state' then
    d:=(payload->>'date')::date;loc:=(payload->>'location_id')::uuid;
    if not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.read',loc) then raise exception 'Line Up scope denied'; end if;
    select * into snap from public.schedule_lineup_snapshots where workspace_id=w and location_id=loc and lineup_date=d order by version_number desc limit 1;
    model:=public.get_schedule_lineup_service(actor,w,d,array[loc],null);
    return jsonb_build_object(
      'section_plans',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('lead_name',coalesce(nullif(e.preferred_name,''),concat_ws(' ',e.first_name,e.last_name)))) from public.lineup_section_plans p left join public.employee_profiles e on e.id=p.lead_employee_id where p.workspace_id=w and p.location_id=loc and p.date=d),'[]'::jsonb),
      'can_manage_sections',public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage') and not exists(select 1 from public.locations sl where sl.workspace_id=w and sl.archived_at is null and (not sl.lineup_operations_enabled or not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',sl.id))),
      'read_only',not (select lineup_operations_enabled from public.locations where id=loc and workspace_id=w),'server_time',now(),'source_current',exists(select 1 from public.schedule_location_publications cp where cp.workspace_id=w and cp.location_id=loc and cp.status='current' and d between cp.week_start and cp.week_start+6),
      'pending_notifications',(select count(*) from public.lineup_notification_outbox o join public.employee_profiles ep on ep.id=o.employee_id join public.workspace_memberships wm on wm.workspace_id=w and wm.user_id=ep.user_id and wm.status='active' where o.snapshot_id=snap.id and o.delivered_at is null),
      'unreachable_recipients',(select count(*) from public.lineup_notification_outbox o where o.snapshot_id=snap.id and o.delivered_at is null and not exists(select 1 from public.employee_profiles ep join public.workspace_memberships wm on wm.workspace_id=w and wm.user_id=ep.user_id and wm.status='active' where ep.id=o.employee_id)),
      'active_entry_ids',coalesce((select jsonb_agg(e->'id') from jsonb_array_elements(model->'locations'->0->'entries') e where public.lineup_shift_range(d,(e->>'start_time')::time,(e->>'end_time')::time,model->'locations'->0->>'timezone') @> now()),'[]'::jsonb),
      'notes',coalesce((select jsonb_agg(to_jsonb(n)-'workspace_id'-'updated_by'-'updated_at' order by n.pinned desc,n.id) from public.lineup_notes n where n.workspace_id=w and n.date=d and (n.location_id is null or n.location_id=loc) and (n.visibility='team' or public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',loc)) and (n.expires_at is null or n.expires_at>now())),'[]'::jsonb),
      'receipts',coalesce((select jsonb_agg(jsonb_build_object('employee_id',r.employee_id,'employee_name',coalesce(nullif(e.preferred_name,''),concat_ws(' ',e.first_name,e.last_name)),'snapshot_id',snap.id,'version',snap.version_number,'viewed_at',r.viewed_at,'acknowledged_at',r.acknowledged_at) order by e.first_name) from public.lineup_receipts r join public.employee_profiles e on e.id=r.employee_id where r.snapshot_id=snap.id),'[]'::jsonb),
      'events',coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'kind',ev.kind,'description',ev.description,'created_at',ev.created_at) order by ev.created_at desc) from public.lineup_operation_events ev where ev.workspace_id=w and (ev.date=d or ev.after_state->>'source_date'=d::text or ev.after_state->>'counterpart_date'=d::text) and loc=any(ev.location_ids)),'[]'::jsonb),
      'unpublished_changes',snap.id is null or exists(select 1 from jsonb_array_elements(model->'locations'->0->'entries') se where coalesce((se->>'source_changed')::boolean,false)) or case when public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.share',loc) and not exists(select 1 from jsonb_array_elements(model->'locations'->0->'entries') se where coalesce((se->>'source_changed')::boolean,false) and not (se->>'hidden')::boolean) then (select jsonb_build_object('entries',c->'entries','notes',c->'notes','briefs',c->'briefs') is distinct from jsonb_build_object('entries',snap.content->'entries','notes',snap.content->'notes','briefs',snap.content->'briefs') from (select public.lineup_share_content(actor,w,d,array[loc])->'locations'->0 c) current_content) else false end or (model->'locations'->0->>'revision')::integer is distinct from (snap.content->>'revision')::integer or exists(select 1 from public.lineup_section_plans sp where sp.workspace_id=w and sp.location_id=loc and sp.date=d and sp.updated_at>snap.shared_at) or exists(select 1 from public.lineup_notes n where n.workspace_id=w and n.date=d and (n.location_id is null or n.location_id=loc) and n.visibility='team' and n.updated_at>snap.shared_at));
  end if;
  if not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage') then raise exception 'Line Up manage access denied'; end if;
  if action='section_plan' then
    d:=(payload->>'date')::date;loc:=(payload->>'location_id')::uuid;
    if not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',loc) then raise exception 'Section setup scope denied'; end if;
    perform pg_advisory_xact_lock(hashtextextended(w::text,921));
    model:=public.get_schedule_lineup_service(actor,w,d,array[loc],null);
    if public.lineup_section_restriction(w,(payload->>'section_id')::uuid,loc,(payload->>'shift_type_id')::uuid,null) is not null then raise exception '%',public.lineup_section_restriction(w,(payload->>'section_id')::uuid,loc,(payload->>'shift_type_id')::uuid,null); end if;
    if (payload->>'closed')::boolean and exists(select 1 from jsonb_array_elements(model->'locations'->0->'entries') e where (case when jsonb_array_length(coalesce(e->'placement_segments','[]'::jsonb))>0 then exists(select 1 from jsonb_array_elements(e->'placement_segments') seg where seg->>'section_id'=payload->>'section_id') else e->>'section_id'=payload->>'section_id' end) and not (e->>'hidden')::boolean and not (e->>'orphaned')::boolean and (payload->>'shift_type_id' is null or e->>'shift_type_id'=payload->>'shift_type_id')) then raise exception 'Reassign this section before closing it'; end if;
    if payload->>'lead_employee_id' is not null and not exists(select 1 from jsonb_array_elements(model->'locations'->0->'entries') e where e->>'employee_id'=payload->>'lead_employee_id' and not (e->>'hidden')::boolean and not (e->>'call_off')::boolean and not (e->>'orphaned')::boolean and (payload->>'shift_type_id' is null or e->>'shift_type_id'=payload->>'shift_type_id')) then raise exception 'Section lead must be scheduled for this service'; end if;
    select to_jsonb(p) into previous from public.lineup_section_plans p where p.workspace_id=w and p.location_id=loc and p.date=d and p.section_id=(payload->>'section_id')::uuid and p.shift_type_id is not distinct from (payload->>'shift_type_id')::uuid for update;
    if (previous->>'revision')::integer is distinct from (payload->>'expected_revision')::integer then raise exception 'stale section setup'; end if;
    insert into public.lineup_section_plans(workspace_id,location_id,date,shift_type_id,section_id,closed,lead_employee_id,stations,updated_by)
    values(w,loc,d,(payload->>'shift_type_id')::uuid,(payload->>'section_id')::uuid,(payload->>'closed')::boolean,(payload->>'lead_employee_id')::uuid,payload->>'stations',actor)
    on conflict(workspace_id,location_id,date,shift_type_id,section_id) do update set closed=excluded.closed,lead_employee_id=excluded.lead_employee_id,stations=excluded.stations,revision=public.lineup_section_plans.revision+1,updated_by=actor,updated_at=now() returning to_jsonb(lineup_section_plans) into result;
    return result;
  end if;
  if action='remind_unacknowledged' then
    d:=(payload->>'date')::date;loc:=(payload->>'location_id')::uuid;
    perform public.lineup_assert_enabled(actor,w,array[loc],'schedule.lineup.share');
    perform pg_advisory_xact_lock(hashtextextended(w::text,921));
    select * into snap from public.schedule_lineup_snapshots where workspace_id=w and location_id=loc and lineup_date=d order by version_number desc limit 1;
    if snap.id is null or snap.id is distinct from (payload->>'snapshot_id')::uuid then raise exception 'stale acknowledgement list; open the latest shared version'; end if;
    if d<(now() at time zone (select timezone from public.locations where id=loc))::date or not exists(select 1 from public.schedule_location_publications cp where cp.workspace_id=w and cp.location_id=loc and cp.status='current' and d between cp.week_start and cp.week_start+6) then raise exception 'Reminders require a current plan for today or an upcoming day'; end if;
    perform 1 from public.lineup_receipts r where r.snapshot_id=snap.id and r.acknowledged_at is null order by r.employee_id for update;
    insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key)
    select w,e.user_id,'schedule','Please read your updated Line Up','Your shared plan for '||d::text||' is waiting for your acknowledgement.','/app/employee-hub/lineup','lineup_snapshot',snap.id,'ack_reminder:'||to_char(now() at time zone 'UTC','YYYYMMDDHH24')
    from public.lineup_receipts r join public.employee_profiles e on e.id=r.employee_id and e.workspace_id=w
    join public.workspace_memberships m on m.workspace_id=w and m.user_id=e.user_id and m.status='active'
    where r.snapshot_id=snap.id and r.acknowledged_at is null and e.archived_at is null
      and exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=e.id and a.location_id=loc and a.ended_at is null)
      and not exists(select 1 from public.notifications n where n.workspace_id=w and n.source_type='lineup_snapshot' and n.source_id=snap.id and n.recipient_user_id=e.user_id and n.event_key like 'ack_reminder:%' and n.created_at>now()-interval '1 hour') on conflict do nothing;
    get diagnostics sent=row_count;
    return jsonb_build_object('sent',sent,'snapshot_id',snap.id);
  end if;
  if action='retry_notifications' then
    d:=(payload->>'date')::date;loc:=(payload->>'location_id')::uuid;
    if not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.share',loc) then raise exception 'Line Up notification scope denied'; end if;
    return jsonb_build_object('delivered',public.deliver_lineup_notifications_service(actor,w,array(select id from public.schedule_lineup_snapshots where workspace_id=w and location_id=loc and lineup_date=d)));
  end if;
  if action='note' then
    item:=payload->'note';loc:=(item->>'location_id')::uuid;d:=(item->>'date')::date;
    if loc is null and exists(select 1 from public.locations l where l.workspace_id=w and l.archived_at is null and not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',l.id)) then raise exception 'All-location notes require access to every location'; end if;
    if loc is not null and not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',loc) then raise exception 'Line Up note scope denied'; end if;
    perform pg_advisory_xact_lock(hashtextextended(w::text,921));
    if payload->>'note_id' is null then
      insert into public.lineup_notes(workspace_id,location_id,date,shift_type_id,section_id,category,content,visibility,pinned,expires_at,updated_by)
      values(w,loc,d,(item->>'shift_type_id')::uuid,(item->>'section_id')::uuid,item->>'category',item->>'content',item->>'visibility',(item->>'pinned')::boolean,(item->>'expires_at')::timestamptz,actor) returning * into note;
    else
      select * into note from public.lineup_notes where id=(payload->>'note_id')::uuid and workspace_id=w for update;
      if note.id is null or note.revision<>(payload->>'expected_revision')::integer then raise exception 'stale Line Up note'; end if;
      if note.location_id is null and exists(select 1 from public.locations l where l.workspace_id=w and l.archived_at is null and not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',l.id)) then raise exception 'Original note scope denied'; end if;
      if note.location_id is not null and not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',note.location_id) then raise exception 'Original note scope denied'; end if;
      update public.lineup_notes set location_id=loc,date=d,shift_type_id=(item->>'shift_type_id')::uuid,section_id=(item->>'section_id')::uuid,category=item->>'category',content=item->>'content',visibility=item->>'visibility',pinned=(item->>'pinned')::boolean,expires_at=(item->>'expires_at')::timestamptz,revision=revision+1,updated_by=actor,updated_at=now() where id=note.id returning * into note;
    end if;
    return to_jsonb(note);
  end if;
  if action='candidates' then
    target:=payload->'target';loc:=(target->>'location_id')::uuid;d:=(target->>'date')::date;
    if not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',loc) then raise exception 'Candidate scope denied'; end if;
    model:=public.lineup_operation_model(actor,w,d,jsonb_build_object('source_entry_id',payload->'source_entry_id'));
    select e into src from jsonb_array_elements(model->'locations') l cross join lateral jsonb_array_elements(l->'entries') e where e->>'id'=payload->>'source_entry_id';
    if src is not null then excluded:=array[coalesce((src->>'source_shift_id')::uuid,(src->>'id')::uuid)]; end if;
    select coalesce(jsonb_agg(c order by case c->>'status' when 'eligible' then 0 when 'partial' then 1 when 'movable' then 2 when 'verification_required' then 3 else 4 end,c->>'display_name'),'[]'::jsonb) into result from (
      select public.lineup_candidate_option(actor,w,e.id,target,excluded,src)||jsonb_build_object('display_name',coalesce(nullif(e.preferred_name,''),concat_ws(' ',e.first_name,e.last_name))) c
      from public.employee_profiles e where e.workspace_id=w and e.archived_at is null
        and exists(select 1 from public.employee_location_assignments a where a.employee_id=e.id and a.workspace_id=w and a.ended_at is null and public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',a.location_id))
    ) candidates;
    return result;
  end if;
  if action in ('preview','apply') then
    op:=payload->'operation';target:=op->'target';d:=(target->>'date')::date;loc:=(target->>'location_id')::uuid;
    source_day:=coalesce(public.lineup_entry_day(w,(op->>'source_entry_id')::uuid),d);other_day:=coalesce(public.lineup_entry_day(w,(op->>'target_entry_id')::uuid),d);
    if action='apply' then
      perform pg_advisory_xact_lock(hashtextextended(w::text,921));
      select * into existing from public.lineup_operation_events where workspace_id=w and idempotency_key=(payload->>'idempotency_key')::uuid;
      if existing.id is not null then
        if existing.actor_user_id<>actor or existing.after_state->'operation'<>op then raise exception 'Idempotency key already used for another operation'; end if;
        if exists(select 1 from unnest(existing.location_ids) id where not public.schedule_actor_can_publish_service(actor,w,id) or not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',id)) then raise exception 'Operation scope denied'; end if;
        return jsonb_build_object('status','applied','event_id',existing.id);
      end if;
      perform 1 from public.schedule_location_publications p where p.workspace_id=w and p.status='current' and p.week_start between least(d,source_day,other_day)-8 and greatest(d,source_day,other_day)+2 order by p.id for update;
      perform 1 from public.workspace_memberships m where m.workspace_id=w order by m.id for share;
      perform 1 from public.schedule_published_shifts s where s.workspace_id=w and s.scheduled_date between least(d,source_day,other_day)-2 and greatest(d,source_day,other_day)+2 order by s.id for update;
      perform 1 from public.employee_profiles e where e.workspace_id=w order by e.id for update;
    end if;
    preview:=public.lineup_operation_preview(actor,w,op);
    if action='preview' then return preview; end if;
    if preview->>'fingerprint'<>payload->>'fingerprint' then raise exception 'stale Line Up operation preview'; end if;
    if not (preview->>'allowed')::boolean then raise exception '%',preview->'blockers'; end if;
    if (preview->>'requires_approval')::boolean then raise exception 'Destination approval required; submit a transfer proposal'; end if;
    model:=public.lineup_operation_model(actor,w,d,op);

    select l,e into src_loc,src from jsonb_array_elements(model->'locations') l cross join lateral jsonb_array_elements(l->'entries') e where e->>'id'=op->>'source_entry_id';
    source_id:=(src->>'source_shift_id')::uuid;
    if op->>'kind'='swap' then
      select l,e into other_loc,other from jsonb_array_elements(model->'locations') l cross join lateral jsonb_array_elements(l->'entries') e where e->>'id'=op->>'target_entry_id';
      swap_span:=public.lineup_shift_range(d,(target->>'start_time')::time,(target->>'end_time')::time,src_loc->>'timezone');
      perform public.lineup_assign_segment(actor,w,(other->>'source_shift_id')::uuid,(src->>'employee_id')::uuid,
        jsonb_build_object('date',(lower(swap_span) at time zone (other_loc->>'timezone'))::date,'location_id',other_loc->'id','job_id',other->'job_id','shift_type_id',other->'shift_type_id','start_time',to_char(lower(swap_span) at time zone (other_loc->>'timezone'),'HH24:MI'),'end_time',to_char(upper(swap_span) at time zone (other_loc->>'timezone'),'HH24:MI'),'section_id',other->'section_id','station',other->'station','placement_segments',public.lineup_clip_placements(other->'placement_segments',swap_span),'travel_minutes',op->'travel_minutes'));
      employee_id:=(other->>'employee_id')::uuid;
    else employee_id:=case when op->>'kind'='move' then (src->>'employee_id')::uuid else (op->>'employee_id')::uuid end; end if;
    if op->>'kind'='release' then
      swap_span:=public.lineup_shift_range(d,(target->>'start_time')::time,(target->>'end_time')::time,src_loc->>'timezone');
      saved_id:=public.lineup_assign_segment(actor,w,source_id,null,target||jsonb_build_object('section_id',src->'section_id','station',src->'station','placement_segments',public.lineup_clip_placements(src->'placement_segments',swap_span),'travel_minutes',0));
    elsif op->>'kind'='move' and op->>'target_entry_id' is not null then
      select l,e into other_loc,other from jsonb_array_elements(model->'locations') l cross join lateral jsonb_array_elements(l->'entries') e where e->>'id'=op->>'target_entry_id';
      swap_span:=public.lineup_shift_range(d,(target->>'start_time')::time,(target->>'end_time')::time,other_loc->>'timezone');
      perform public.lineup_assign_segment(actor,w,source_id,null,jsonb_build_object('date',(lower(swap_span) at time zone (src_loc->>'timezone'))::date,'location_id',src_loc->'id','job_id',src->'job_id','shift_type_id',src->'shift_type_id','section_id',src->'section_id','station',src->'station','start_time',to_char(lower(swap_span) at time zone (src_loc->>'timezone'),'HH24:MI'),'end_time',to_char(upper(swap_span) at time zone (src_loc->>'timezone'),'HH24:MI'),'travel_minutes',op->'travel_minutes'));
      saved_id:=public.lineup_fill_coverage(actor,w,other,employee_id,target);
    else
      saved_id:=public.lineup_fill_coverage(actor,w,src,employee_id,target||jsonb_build_object('travel_minutes',case when op->>'kind' in ('move','swap') then (op->>'travel_minutes')::integer else 0 end));
    end if;
    locations:=array_remove(array[loc,(src_loc->>'id')::uuid,(other_loc->>'id')::uuid],null);
    update public.schedule_lineups set revision=revision+1,updated_at=now(),updated_by=actor where workspace_id=w and lineup_date in(d,source_day,other_day) and location_id=any(locations);
    insert into public.lineup_operation_events(workspace_id,actor_user_id,kind,date,location_ids,description,before_state,after_state,idempotency_key)
    values(w,actor,op->>'kind',d,locations,op->>'reason',jsonb_build_object('source',src,'other',other),jsonb_build_object('operation',op,'shift_id',saved_id,'source_date',source_day,'counterpart_date',other_day),(payload->>'idempotency_key')::uuid) returning id into operation_id;
    insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key)
    select w,e.user_id,'schedule','Your assignment has changed','Your manager updated your work assignment for '||d::text||'. Open Schedule to review the change.','/app/employee-hub','lineup_operation',operation_id,'assignment_changed'
    from public.employee_profiles e join public.workspace_memberships m on m.workspace_id=w and m.user_id=e.user_id and m.status='active'
    where e.workspace_id=w and e.id in((select ps.employee_id from public.schedule_published_shifts ps where ps.id=saved_id),(src->>'employee_id')::uuid,(other->>'employee_id')::uuid) on conflict do nothing;
    insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key)
    select w,m.user_id,'schedule','Line Up staffing updated','A staffing change for '||chosen.local_day::text||' is confirmed. Review the updated coverage and share the plan.','/app/schedule/lineup?date='||chosen.local_day::text||'&location='||chosen.id::text,'lineup_operation',operation_id,'manager_assignment_changed'
    from public.workspace_memberships m
    cross join lateral (
      select affected.id,(lower(public.lineup_shift_range(d,(target->>'start_time')::time,(target->>'end_time')::time,(select timezone from public.locations where id=loc))) at time zone affected.timezone)::date as local_day
      from public.locations affected where affected.workspace_id=w and affected.id=any(locations)
        and public.schedule_actor_can_publish_service(m.user_id,w,affected.id) and public.schedule_actor_has_capability_service(m.user_id,w,'schedule.lineup.manage',affected.id)
      order by (affected.id=loc) desc,affected.id limit 1
    ) chosen where m.workspace_id=w and m.status='active' and m.user_id<>actor on conflict do nothing;
    return jsonb_build_object('status','applied','event_id',operation_id,'shift_id',saved_id);
  end if;
  raise exception 'Unknown Line Up operation';
end; $$;

-- Outbox delivery is independent of snapshot creation, so a failed notification
-- cannot roll back a shared plan. Safe to retry with the same snapshot.
create function public.deliver_lineup_notifications_service(actor uuid,w uuid,snapshot_ids uuid[]) returns integer
language plpgsql security definer set search_path='' as $$
declare delivery record; total integer:=0;
begin
  for delivery in select o.*,e.user_id,s.location_id,s.lineup_date,s.version_number from public.lineup_notification_outbox o join public.employee_profiles e on e.id=o.employee_id join public.schedule_lineup_snapshots s on s.id=o.snapshot_id
    where o.workspace_id=w and o.snapshot_id=any(snapshot_ids) and o.delivered_at is null and e.archived_at is null and e.user_id is not null for update of o skip locked loop
    if not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.share',delivery.location_id) then raise exception 'Line Up notification scope denied'; end if;
    if exists(select 1 from public.workspace_memberships m where m.workspace_id=w and m.user_id=delivery.user_id and m.status='active') then
      insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key)
      values(w,delivery.user_id,'schedule','Your Line Up was updated','Review your assignment and daily brief · v'||delivery.version_number,'/app/employee-hub/lineup','lineup',delivery.snapshot_id,'shared') on conflict do nothing;
      update public.lineup_notification_outbox set delivered_at=now() where id=delivery.id;total:=total+1;
    end if;
  end loop;
  return total;
end; $$;

-- Service-only entry points. The API supplies the authenticated actor and every
-- function checks workspace/location scope; no browser-supplied actor is trusted.
revoke all on function public.lineup_rebind_published_source(),public.lineup_shift_range(date,time,time,text),public.lineup_candidate_check(uuid,uuid,jsonb,uuid[],integer),public.lineup_share_content(uuid,uuid,date,uuid[]),public.lineup_person_fingerprint(jsonb,uuid),public.lineup_operation_preview(uuid,uuid,jsonb),public.lineup_assign_segment(uuid,uuid,uuid,uuid,jsonb),public.lineup_operations_service(uuid,uuid,text,jsonb),public.deliver_lineup_notifications_service(uuid,uuid,uuid[]),public.upsert_schedule_lineup_entry_operations_base(uuid,uuid,uuid,date,uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.lineup_operations_service(uuid,uuid,text,jsonb),public.deliver_lineup_notifications_service(uuid,uuid,uuid[]) to service_role;
revoke all on function public.upsert_schedule_lineup_entry_service(uuid,uuid,uuid,date,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.upsert_schedule_lineup_entry_service(uuid,uuid,uuid,date,uuid,integer,jsonb) to service_role;

revoke all on function public.lineup_operation_model(uuid,uuid,date,jsonb) from public,anon,authenticated,service_role;

create function public.lineup_proposals_service(actor_user_id uuid,target_workspace_id uuid,action text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=actor_user_id; w uuid:=target_workspace_id; p public.lineup_proposals%rowtype;
  emp public.employee_profiles%rowtype; op jsonb; preview jsonb; model jsonb; src jsonb; src_loc jsonb; operation_result jsonb; destination uuid; d date; counterpart jsonb; original_op jsonb; transfer_span tstzrange; source_tz text;
begin
  if action in ('offers','respond') then
    emp:=public.employee_hub_actor_service(actor,w);
    if action='offers' then
      select coalesce(jsonb_agg(jsonb_build_object('id',pr.id,'status',pr.status,'date',pr.operation->'target'->>'date','location_name',l.name,'job_name',j.name,'start_time',pr.operation->'target'->>'start_time','end_time',pr.operation->'target'->>'end_time','expires_at',pr.expires_at) order by pr.created_at),'[]'::jsonb) into operation_result
      from public.lineup_proposals pr join public.locations l on l.id=pr.target_location_id join public.jobs j on j.id=(pr.operation->'target'->>'job_id')::uuid
      where pr.workspace_id=w and pr.employee_id=emp.id and pr.kind='offer' and pr.status in('pending','accepted') and pr.expires_at>now();
      return operation_result;
    end if;
    select * into p from public.lineup_proposals where id=(payload->>'id')::uuid and workspace_id=w and employee_id=emp.id and kind='offer' for update;
    if p.id is null then raise exception 'Offer access denied'; end if;
    if p.status<>'pending' or p.expires_at<=now() then raise exception 'stale or expired offer'; end if;
    if payload->>'response' not in ('accept','decline') then raise exception 'Invalid offer response'; end if;
    update public.lineup_proposals set status=case when payload->>'response'='accept' then 'accepted' else 'declined' end,responded_at=now() where id=p.id returning * into p;
    return jsonb_build_object('status',p.status);
  end if;
  if not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage') then raise exception 'Line Up manage access denied'; end if;
  if action='destinations' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'timezone',timezone) order by sort_order,name) from public.locations where workspace_id=w and archived_at is null),'[]'::jsonb);
  end if;
  if action='proposals' then
    d:=(payload->>'date')::date;destination:=(payload->>'location_id')::uuid;
    if not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',destination) then raise exception 'Proposal scope denied'; end if;
    return coalesce((select jsonb_agg(jsonb_build_object('id',pr.id,'kind',pr.kind,'status',case when pr.expires_at<=now() and pr.status in('pending','accepted') then 'expired' else pr.status end,'description',pr.operation->>'reason','resolution',pr.result->>'reason','source_name',sl.name,'target_name',tl.name,'source_date',pr.source_date,'target_date',pr.operation->'target'->>'date','employee_name',coalesce(nullif(e.preferred_name,''),concat_ws(' ',e.first_name,e.last_name)),'start_time',pr.operation->'target'->>'start_time','end_time',pr.operation->'target'->>'end_time','can_choose_need',pr.kind='transfer' and pr.operation->>'kind'='move' and pr.operation->>'target_entry_id' is null,'needs_counterpart',pr.operation->>'kind'='swap' and pr.operation->>'target_entry_id' is null,'target_location_id',pr.target_location_id,'can_cancel',pr.created_by=actor and pr.status in('pending','accepted'),'can_confirm',case when pr.kind='transfer' then public.schedule_actor_can_publish_service(actor,w,pr.target_location_id) else public.schedule_actor_can_publish_service(actor,w,pr.source_location_id) end) order by pr.created_at desc)
    from public.lineup_proposals pr join public.locations sl on sl.id=pr.source_location_id join public.locations tl on tl.id=pr.target_location_id left join public.employee_profiles e on e.id=pr.employee_id
    where pr.workspace_id=w and (pr.operation->'target'->>'date'=d::text or pr.source_date=d) and destination in(pr.source_location_id,pr.target_location_id)),'[]'::jsonb);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(w::text,921));
  if action='propose' then
    op:=payload->'operation';d:=(op->'target'->>'date')::date;destination:=(op->'target'->>'location_id')::uuid;
    preview:=public.lineup_operation_preview(actor,w,op);
    if preview->>'fingerprint'<>payload->>'fingerprint' then raise exception 'stale proposal preview'; end if;
    if not (preview->>'allowed')::boolean then raise exception '%',preview->'blockers'; end if;
    if payload->>'kind' not in('offer','transfer') then raise exception 'Invalid proposal kind'; end if;
    if payload->>'kind'='offer' and ((preview->>'requires_approval')::boolean or op->>'kind' not in('assign','replace')) then raise exception 'Review location approval before offering work'; end if;
    if payload->>'kind'='transfer' and op->>'kind' not in('move','swap') then raise exception 'Transfer proposal requires a location move or swap'; end if;
    model:=public.lineup_operation_model(actor,w,d,op);
    select l,e into src_loc,src from jsonb_array_elements(model->'locations') l cross join lateral jsonb_array_elements(l->'entries') e where e->>'id'=op->>'source_entry_id';
    if src is null then raise exception 'Create an open position before sending an offer'; end if;
    select * into emp from public.employee_profiles where workspace_id=w and id=coalesce((op->>'employee_id')::uuid,(src->>'employee_id')::uuid);
    if payload->>'kind'='offer' and (emp.user_id is null or not exists(select 1 from public.workspace_memberships m where m.workspace_id=w and m.user_id=emp.user_id and m.status='active')) then raise exception 'The selected employee needs an active account to receive an offer'; end if;
    select * into p from public.lineup_proposals where workspace_id=w and idempotency_key=(payload->>'idempotency_key')::uuid;
    if p.id is not null then
      if p.created_by<>actor or p.operation<>op or p.kind<>payload->>'kind' then raise exception 'Idempotency key already used'; end if;
      return jsonb_build_object('status',p.status,'id',p.id);
    end if;
    insert into public.lineup_proposals(workspace_id,kind,created_by,source_location_id,target_location_id,employee_id,operation,fingerprint,source_date,source_state,idempotency_key)
    values(w,payload->>'kind',actor,(src_loc->>'id')::uuid,destination,emp.id,op,preview->>'fingerprint',coalesce(public.lineup_entry_day(w,(src->>'id')::uuid),d),src,(payload->>'idempotency_key')::uuid) returning * into p;
    insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key)
    select w,m.user_id,'schedule',case when p.kind='offer' then 'A shift offer is waiting' else 'Line Up transfer approval requested' end,
      case when p.kind='offer' then 'Review the assignment and choose whether to accept.' else 'Review the source and destination impact before approving.' end,
      case when p.kind='offer' then '/app/employee-hub/lineup' else '/app/schedule/lineup?date='||d::text end,'lineup_proposal',p.id,'requested'
    from public.workspace_memberships m where m.workspace_id=w and m.status='active' and
      ((p.kind='offer' and m.user_id=emp.user_id) or (p.kind='transfer' and public.schedule_actor_can_publish_service(m.user_id,w,destination) and public.schedule_actor_has_capability_service(m.user_id,w,'schedule.lineup.manage',destination))) on conflict do nothing;
    return jsonb_build_object('status','pending','id',p.id);
  end if;
  if action='proposal_action' then
    select * into p from public.lineup_proposals where id=(payload->>'id')::uuid and workspace_id=w for update;
    if p.id is null then raise exception 'Proposal not found'; end if;
    if not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',p.source_location_id) and not public.schedule_actor_has_capability_service(actor,w,'schedule.lineup.manage',p.target_location_id) then raise exception 'Proposal scope denied'; end if;
    if payload->>'response'='cancel' then
      if p.created_by<>actor or p.status not in('pending','accepted') then raise exception 'Proposal cannot be cancelled'; end if;
      update public.lineup_proposals set status='cancelled',responded_at=now() where id=p.id;return jsonb_build_object('status','cancelled');
    end if;
    if payload->>'response' not in('confirm','preview') then raise exception 'Invalid proposal action'; end if;
    if p.kind='transfer' then
      if not public.schedule_actor_can_publish_service(actor,w,p.target_location_id) or not public.schedule_actor_can_publish_service(p.created_by,w,p.source_location_id) then raise exception 'Transfer approval access denied'; end if;
    elsif not public.schedule_actor_can_publish_service(actor,w,p.source_location_id) then raise exception 'Assignment approval access denied'; end if;
    if p.status='confirmed' then return p.result; end if;
    if p.expires_at<=now() or (p.kind='transfer' and p.status<>'pending') or (p.kind='offer' and p.status<>'accepted') then raise exception 'stale or expired proposal'; end if;
    op:=p.operation;d:=(op->'target'->>'date')::date;
    if p.kind='transfer' then
      if op->>'kind'='move' and op->>'target_entry_id' is null and payload->>'target_entry_id' is not null then
        original_op:=op;op:=op||jsonb_build_object('target_entry_id',payload->'target_entry_id');
        update public.lineup_proposals set operation=op where id=p.id;
      end if;
      if op->>'kind'='swap' and op->>'target_entry_id' is null then
        original_op:=op;
        model:=public.get_schedule_lineup_service(actor,w,d,array[p.target_location_id],null);
        select e into counterpart from jsonb_array_elements(model->'locations'->0->'entries') e where e->>'id'=payload->>'target_entry_id';
        if counterpart is null or counterpart->>'employee_id' is null or counterpart->>'source_shift_id' is null or (counterpart->>'hidden')::boolean or (counterpart->>'call_off')::boolean or (counterpart->>'orphaned')::boolean or coalesce((counterpart->>'source_changed')::boolean,false) then raise exception 'Choose a current assigned counterpart in the destination'; end if;
        if counterpart->>'job_id'<>op->'target'->>'job_id' or counterpart->>'shift_type_id'<>op->'target'->>'shift_type_id' then raise exception 'The counterpart must match the requested destination position and service'; end if;
        select timezone into source_tz from public.locations where id=p.source_location_id;
        transfer_span:=public.lineup_shift_range(d,(op->'target'->>'start_time')::time,(op->'target'->>'end_time')::time,model->'locations'->0->>'timezone');
        op:=op||jsonb_build_object('target_entry_id',counterpart->'id','target',jsonb_build_object('date',(lower(transfer_span) at time zone source_tz)::date,'location_id',p.source_location_id,'job_id',p.source_state->'job_id','shift_type_id',p.source_state->'shift_type_id','section_id',p.source_state->'section_id','station',p.source_state->'station','start_time',to_char(lower(transfer_span) at time zone source_tz,'HH24:MI'),'end_time',to_char(upper(transfer_span) at time zone source_tz,'HH24:MI')));
        -- Temporarily resolve the requested counterpart under the same row lock. A preview restores the original intent before returning.
        update public.lineup_proposals set operation=op where id=p.id;
      end if;
      op:=op||jsonb_build_object('_proposal_id',p.id);

    else
      model:=public.lineup_operation_model(actor,w,d,op);
      select e into src from jsonb_array_elements(model->'locations') l cross join lateral jsonb_array_elements(l->'entries') e where e->>'id'=op->>'source_entry_id';
      if src is distinct from p.source_state then raise exception 'stale offer assignment; review the latest coverage need'; end if;
    end if;
    preview:=public.lineup_operation_preview(actor,w,op);
    if payload->>'response'='preview' then
      if original_op is not null then update public.lineup_proposals set operation=original_op where id=p.id; end if;
      return preview;
    end if;
    if payload->>'fingerprint' is not null and payload->>'fingerprint'<>preview->>'fingerprint' then raise exception 'stale approval preview; review both assignments again'; end if;
    if not (preview->>'allowed')::boolean then raise exception '%',preview->'blockers'; end if;
    operation_result:=public.lineup_operations_service(actor,w,'apply',jsonb_build_object('operation',op,'fingerprint',preview->>'fingerprint','idempotency_key',p.id));
    update public.lineup_proposals set status='confirmed',responded_at=now(),result=operation_result,operation=coalesce(original_op,p.operation) where id=p.id;
    if p.kind='offer' then
      with closed as (
        update public.lineup_proposals competing set status='cancelled',responded_at=now(),result=jsonb_build_object('reason','This coverage need was filled through another accepted offer.')
        where competing.workspace_id=w and competing.kind='offer' and competing.id<>p.id and competing.status in('pending','accepted') and competing.operation->>'source_entry_id'=p.operation->>'source_entry_id'
        returning competing.id,competing.employee_id
      )
      insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key)
      select w,ep.user_id,'schedule','Shift offer closed','This coverage need was filled through another accepted offer. Your Schedule has not changed.','/app/employee-hub','lineup_proposal',closed.id,'coverage_filled'
      from closed join public.employee_profiles ep on ep.id=closed.employee_id join public.workspace_memberships wm on wm.workspace_id=w and wm.user_id=ep.user_id and wm.status='active' on conflict do nothing;
    end if;

    return operation_result;
  end if;
  raise exception 'Unknown proposal action';
end; $$;
revoke all on function public.lineup_proposals_service(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.lineup_proposals_service(uuid,uuid,text,jsonb) to service_role;

-- Service-scoped shares retain the previously shared content of other services.
create function public.lineup_share_content_for_services(actor uuid,w uuid,d date,locations uuid[],services uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare model jsonb; updated_locations jsonb:='[]'::jsonb; item jsonb; prior jsonb;
begin
 model:=public.lineup_share_content(actor,w,d,locations);
 if services is null then return model; end if;
 if cardinality(services)=0 or exists(select 1 from unnest(services) svc where not exists(select 1 from public.shift_types st where st.id=svc and st.workspace_id=w and st.archived_at is null)) then raise exception 'Choose active services to share'; end if;
 for item in select * from jsonb_array_elements(model->'locations') loop
  select content into prior from public.schedule_lineup_snapshots where workspace_id=w and location_id=(item->>'id')::uuid and lineup_date=d order by version_number desc limit 1;
  item:=item||jsonb_build_object(
   'entries',coalesce((select jsonb_agg(e order by (e->>'display_order')::integer,e->>'id') from (select e from jsonb_array_elements(item->'entries') e where (e->>'shift_type_id')::uuid=any(services) union all select e from jsonb_array_elements(coalesce(prior->'entries','[]'::jsonb)) e where not (e->>'shift_type_id')::uuid=any(services)) entries),'[]'::jsonb),
   'briefs',coalesce((select jsonb_agg(b order by b->>'shift_type_id') from (select b from jsonb_array_elements(item->'briefs') b where (b->>'shift_type_id')::uuid=any(services) union all select b from jsonb_array_elements(coalesce(prior->'briefs','[]'::jsonb)) b where not (b->>'shift_type_id')::uuid=any(services)) briefs),'[]'::jsonb),
   'notes',coalesce((select jsonb_agg(n order by (n->>'pinned')::boolean desc,n->>'id') from (select n from jsonb_array_elements(item->'notes') n where n->>'shift_type_id' is null or (n->>'shift_type_id')::uuid=any(services) union all select n from jsonb_array_elements(coalesce(prior->'notes','[]'::jsonb)) n where n->>'shift_type_id' is not null and not (n->>'shift_type_id')::uuid=any(services)) notes),'[]'::jsonb));
  updated_locations:=updated_locations||jsonb_build_array(item);
 end loop;
 return jsonb_set(model,'{locations}',updated_locations);
end; $$;
revoke all on function public.lineup_share_content_for_services(uuid,uuid,date,uuid[],uuid[]) from public,anon,authenticated,service_role;
create or replace function public.preview_schedule_lineup_scoped_share_service(actor_user_id uuid,target_workspace_id uuid,target_date date,target_location_ids uuid[],target_shift_type_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare model jsonb; result jsonb;
begin
  model:=public.lineup_share_content_for_services(actor_user_id,target_workspace_id,target_date,target_location_ids,target_shift_type_ids);
  select coalesce(jsonb_agg(jsonb_build_object('location_id',l->'id','location_name',l->'name','current_version',coalesce(previous.version_number,0),'entry_count',jsonb_array_length(l->'entries'),
    'added',(select count(*) from jsonb_array_elements(l->'entries') e where not exists(select 1 from jsonb_array_elements(coalesce(previous.content->'entries','[]'::jsonb)) old where old->>'id'=e->>'id')),
    'updated',(select count(*) from jsonb_array_elements(l->'entries') e join jsonb_array_elements(coalesce(previous.content->'entries','[]'::jsonb)) old on old->>'id'=e->>'id' where old<>e),
    'removed',(select count(*) from jsonb_array_elements(coalesce(previous.content->'entries','[]'::jsonb)) old where not exists(select 1 from jsonb_array_elements(l->'entries') e where e->>'id'=old->>'id')))), '[]'::jsonb) into result
  from jsonb_array_elements(model->'locations') l left join lateral(select s.* from public.schedule_lineup_snapshots s where s.workspace_id=target_workspace_id and s.location_id=(l->>'id')::uuid and s.lineup_date=target_date order by version_number desc limit 1) previous on true;
  return jsonb_build_object('status','share_ready','workspace_id',target_workspace_id,'date',target_date,'fingerprint',encode(extensions.digest(convert_to(model::text,'UTF8'),'sha256'),'hex'),'locations',result,'content',model);
end; $$;
create or replace function public.share_schedule_lineup_scoped_service(actor_user_id uuid,target_workspace_id uuid,target_date date,target_location_ids uuid[],expected_fingerprint text,target_shift_type_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare model jsonb; actual text; item jsonb; ln public.schedule_lineups%rowtype; snap public.schedule_lineup_snapshots%rowtype;
  prior public.schedule_lineup_snapshots%rowtype; emp uuid; fp text; previous_receipt public.lineup_receipts%rowtype; ids uuid[]:=array[]::uuid[];
begin
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));
  perform public.lineup_assert_enabled(actor_user_id,target_workspace_id,target_location_ids,'schedule.lineup.share');
  model:=public.lineup_share_content_for_services(actor_user_id,target_workspace_id,target_date,target_location_ids,target_shift_type_ids);
  actual:=encode(extensions.digest(convert_to(model::text,'UTF8'),'sha256'),'hex');
  if actual<>expected_fingerprint then raise exception 'stale schedule line-up share preview' using errcode='40001'; end if;
  for item in select * from jsonb_array_elements(model->'locations') loop
    select * into prior from public.schedule_lineup_snapshots where workspace_id=target_workspace_id and location_id=(item->>'id')::uuid and lineup_date=target_date order by version_number desc limit 1;
    insert into public.schedule_lineups(workspace_id,location_id,lineup_date,created_by,updated_by,share_version,shared_at)
    values(target_workspace_id,(item->>'id')::uuid,target_date,actor_user_id,actor_user_id,1,now())
    on conflict(workspace_id,location_id,lineup_date) do update set share_version=public.schedule_lineups.share_version+1,shared_at=now(),updated_by=actor_user_id returning * into ln;
    insert into public.schedule_lineup_snapshots(workspace_id,location_id,lineup_date,version_number,fingerprint,content,shared_by)
    values(target_workspace_id,ln.location_id,target_date,ln.share_version,actual,item||jsonb_build_object('catalogue',model-'locations','share_version',ln.share_version,'shared_at',now()),actor_user_id) returning * into snap;
    ids:=array_append(ids,snap.id);
    for emp in select distinct (e->>'employee_id')::uuid from jsonb_array_elements((item->'entries')||coalesce(prior.content->'entries','[]'::jsonb)) e where e->>'employee_id' is not null loop
      fp:=public.lineup_person_fingerprint(item,emp);
      select * into previous_receipt from public.lineup_receipts where snapshot_id=prior.id and employee_id=emp;
      insert into public.lineup_receipts(snapshot_id,workspace_id,employee_id,content_fingerprint,viewed_at,acknowledged_at)
      values(snap.id,target_workspace_id,emp,fp,case when previous_receipt.content_fingerprint=fp then previous_receipt.viewed_at end,case when previous_receipt.content_fingerprint=fp then previous_receipt.acknowledged_at end);
      if previous_receipt.content_fingerprint is distinct from fp then
        insert into public.lineup_notification_outbox(workspace_id,snapshot_id,employee_id) values(target_workspace_id,snap.id,emp) on conflict do nothing;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('status','shared','workspace_id',target_workspace_id,'date',target_date,'location_ids',target_location_ids,'snapshot_ids',ids,'shared_at',now());
end; $$;
revoke all on function public.preview_schedule_lineup_scoped_share_service(uuid,uuid,date,uuid[],uuid[]),public.share_schedule_lineup_scoped_service(uuid,uuid,date,uuid[],text,uuid[]) from public,anon,authenticated;
grant execute on function public.preview_schedule_lineup_scoped_share_service(uuid,uuid,date,uuid[],uuid[]),public.share_schedule_lineup_scoped_service(uuid,uuid,date,uuid[],text,uuid[]) to service_role;

create function public.lineup_fill_coverage(actor uuid,w uuid,need jsonb,emp uuid,target jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare saved_id uuid; slot public.schedule_lineup_entries%rowtype; piece tstzrange; rest tstzmultirange; tz text; ln public.schedule_lineups%rowtype;
begin
 if need->>'source_shift_id' is null and need->>'id' is not null then select * into slot from public.schedule_lineup_entries where workspace_id=w and id=(need->>'id')::uuid for update; end if;
 saved_id:=public.lineup_assign_segment(actor,w,(need->>'source_shift_id')::uuid,emp,target);
 if slot.id is not null then
  select timezone into tz from public.locations where id=slot.location_id;
  rest:=tstzmultirange(public.lineup_shift_range(public.lineup_entry_day(w,slot.id),slot.start_time,slot.end_time,tz))-tstzmultirange(public.lineup_shift_range((target->>'date')::date,(target->>'start_time')::time,(target->>'end_time')::time,tz));
  for piece in select unnest(rest) loop
   insert into public.schedule_lineups(workspace_id,location_id,lineup_date,created_by,updated_by) values(w,slot.location_id,(lower(piece) at time zone tz)::date,actor,actor) on conflict(workspace_id,location_id,lineup_date) do update set revision=public.schedule_lineups.revision+1 returning * into ln;
   insert into public.schedule_lineup_entries(workspace_id,lineup_id,location_id,employee_id,job_id,shift_type_id,start_time,end_time,section_id,station,display_order,placement_segments,note,created_by,updated_by)
   values(w,ln.id,slot.location_id,null,slot.job_id,slot.shift_type_id,(lower(piece) at time zone tz)::time,(upper(piece) at time zone tz)::time,slot.section_id,slot.station,slot.display_order,public.lineup_clip_placements(slot.placement_segments,piece),slot.note,actor,actor);
  end loop;
  delete from public.schedule_lineup_entries where source_shift_id=saved_id and workspace_id=w;
  select * into strict ln from public.schedule_lineups where workspace_id=w and location_id=(target->>'location_id')::uuid and lineup_date=(target->>'date')::date;
  update public.schedule_lineup_entries set lineup_id=ln.id,location_id=ln.location_id,source_shift_id=saved_id,employee_id=emp,job_id=(target->>'job_id')::uuid,shift_type_id=(target->>'shift_type_id')::uuid,start_time=(target->>'start_time')::time,end_time=(target->>'end_time')::time,section_id=(target->>'section_id')::uuid,station=coalesce(target->>'station',''),placement_segments='[]'::jsonb,call_off=false,source_changed=false,revision=revision+1,updated_by=actor,updated_at=now() where id=slot.id;
 end if;
 return saved_id;
end; $$;
revoke all on function public.lineup_fill_coverage(uuid,uuid,jsonb,uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function public.upsert_schedule_lineup_section_service(actor_user_id uuid,target_workspace_id uuid,target_section_id uuid,target_expected_revision integer,section jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.schedule_lineup_sections%rowtype; previous public.schedule_lineup_sections%rowtype;
 locations uuid[]; services uuid[]; positions uuid[]; conflicts integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));
 perform public.lineup_assert_enabled(actor_user_id,target_workspace_id,null,'schedule.lineup.manage');
 if target_section_id is not null then
  select * into previous from public.schedule_lineup_sections where workspace_id=target_workspace_id and id=target_section_id and archived_at is null and revision=target_expected_revision for update;
  if previous.id is null then raise exception 'stale schedule line-up section' using errcode='40001'; end if;
 end if;
 locations:=case when section ? 'location_ids' then array(select distinct value::uuid from jsonb_array_elements_text(section->'location_ids') order by value::uuid) else coalesce(previous.location_ids,'{}'::uuid[]) end;
 services:=case when section ? 'shift_type_ids' then array(select distinct value::uuid from jsonb_array_elements_text(section->'shift_type_ids') order by value::uuid) else coalesce(previous.shift_type_ids,'{}'::uuid[]) end;
 positions:=case when section ? 'job_ids' then array(select distinct value::uuid from jsonb_array_elements_text(section->'job_ids') order by value::uuid) else coalesce(previous.job_ids,'{}'::uuid[]) end;
 if cardinality(locations)>100 or exists(select 1 from unnest(locations) requested where not exists(select 1 from public.locations l where l.workspace_id=target_workspace_id and l.id=requested and l.archived_at is null)) then raise exception 'Choose active locations in this workspace'; end if;
 if cardinality(services)>100 or exists(select 1 from unnest(services) requested where not exists(select 1 from public.shift_types t where t.workspace_id=target_workspace_id and t.id=requested and t.archived_at is null)) then raise exception 'Choose active services in this workspace'; end if;
 if cardinality(positions)>100 or exists(select 1 from unnest(positions) requested where not exists(select 1 from public.jobs j where j.workspace_id=target_workspace_id and j.id=requested and j.archived_at is null)) then raise exception 'Choose active positions in this workspace'; end if;
 if target_section_id is null then
  insert into public.schedule_lineup_sections(workspace_id,name,color,sort_order,location_ids,shift_type_ids,job_ids)
  values(target_workspace_id,btrim(section->>'name'),section->>'color',coalesce((section->>'sort_order')::integer,0),locations,services,positions) returning * into saved;
 else
  update public.schedule_lineup_sections set name=btrim(section->>'name'),color=section->>'color',sort_order=coalesce((section->>'sort_order')::integer,0),location_ids=locations,shift_type_ids=services,job_ids=positions,revision=revision+1,updated_at=now() where id=target_section_id and workspace_id=target_workspace_id returning * into saved;
 end if;
 select count(distinct e.id)::integer into conflicts from public.schedule_lineup_entries e
 join public.schedule_lineups ln on ln.id=e.lineup_id join public.locations l on l.id=e.location_id
 cross join lateral public.lineup_project_entry(to_jsonb(e),l.timezone) segment
 where e.workspace_id=target_workspace_id and not e.hidden and segment->>'section_id'=saved.id::text
 and (e.source_shift_id is null or exists(select 1 from public.schedule_published_shifts ps join public.schedule_location_publications pub on pub.id=ps.publication_id where ps.id=e.source_shift_id and pub.status='current'))
 and coalesce((segment->>'placement_end_at')::timestamptz,upper(public.lineup_shift_range(ln.lineup_date,e.start_time,e.end_time,l.timezone)))>now()
 and public.lineup_section_restriction(target_workspace_id,saved.id,e.location_id,e.shift_type_id,e.job_id) is not null;
 if conflicts>0 then raise exception 'Reassign % future assignments or open needs before restricting this section',conflicts; end if;
 return jsonb_build_object('id',saved.id,'workspace_id',saved.workspace_id,'name',saved.name,'color',saved.color,'sort_order',saved.sort_order,'revision',saved.revision,'location_ids',saved.location_ids,'shift_type_ids',saved.shift_type_ids,'job_ids',saved.job_ids);
end; $$;
revoke all on function public.upsert_schedule_lineup_section_service(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.upsert_schedule_lineup_section_service(uuid,uuid,uuid,integer,jsonb) to service_role;

-- Archiving a definition never rewrites historical placements or leaves future
-- segment references pointing at an unavailable section.
create or replace function public.archive_schedule_lineup_section_service(actor_user_id uuid,target_workspace_id uuid,target_section_id uuid,target_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));
 perform public.lineup_assert_enabled(actor_user_id,target_workspace_id,null,'schedule.lineup.manage');
 perform 1 from public.schedule_lineup_sections where id=target_section_id and workspace_id=target_workspace_id and archived_at is null and revision=target_expected_revision for update;
 if not found then raise exception 'stale schedule line-up section' using errcode='40001'; end if;
 if exists(select 1 from public.schedule_lineup_entries e join public.schedule_lineups ln on ln.id=e.lineup_id join public.locations l on l.id=e.location_id
 cross join lateral public.lineup_project_entry(to_jsonb(e),l.timezone) segment
 where e.workspace_id=target_workspace_id and not e.hidden and segment->>'section_id'=target_section_id::text
 and (e.source_shift_id is null or exists(select 1 from public.schedule_published_shifts ps join public.schedule_location_publications pub on pub.id=ps.publication_id where ps.id=e.source_shift_id and pub.status='current'))
 and coalesce((segment->>'placement_end_at')::timestamptz,upper(public.lineup_shift_range(ln.lineup_date,e.start_time,e.end_time,l.timezone)))>now()) then
  raise exception 'Reassign future assignments and open needs before archiving this section';
 end if;
 update public.schedule_lineup_sections set archived_at=now(),revision=revision+1,updated_at=now() where id=target_section_id and workspace_id=target_workspace_id;
 return jsonb_build_object('status','archived','id',target_section_id);
end; $$;
revoke all on function public.archive_schedule_lineup_section_service(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.archive_schedule_lineup_section_service(uuid,uuid,uuid,integer) to service_role;
