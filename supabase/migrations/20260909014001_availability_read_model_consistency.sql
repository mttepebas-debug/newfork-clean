-- Calendar projections share the physical evaluator's temporary/replacement
-- precedence. They describe patterns; actual assignments still use UTC spans.
create function public.availability_version_for_calendar(emp uuid,day date)
returns public.employee_schedule_availability_versions
language sql stable security definer set search_path='' as $$
 select v from public.employee_schedule_availability_versions v
 where v.employee_id=emp and v.effective_from<=day and coalesce(v.effective_until,'infinity'::date)>=day
 and not exists(select 1 from public.employee_schedule_availability_versions r
   where r.workspace_id=v.workspace_id and r.employee_id=v.employee_id and r.version_number>v.version_number
    and v.id=any(r.replace_version_ids) and r.effective_from<=day and coalesce(r.effective_until,'infinity'::date)>=day)
 order by (v.kind='temporary') desc,v.version_number desc limit 1;
$$;
create function public.availability_version_at_instant(emp uuid,instant timestamptz)
returns public.employee_schedule_availability_versions
language sql stable security definer set search_path='' as $$
 select v from public.employee_schedule_availability_versions v
 where v.employee_id=emp and v.effective_from<=(instant at time zone v.timezone)::date
  and coalesce(v.effective_until,'infinity'::date)>=(instant at time zone v.timezone)::date
 and not exists(select 1 from public.employee_schedule_availability_versions r
   where r.workspace_id=v.workspace_id and r.employee_id=v.employee_id and r.version_number>v.version_number
    and v.id=any(r.replace_version_ids) and r.effective_from<=(instant at time zone r.timezone)::date
    and coalesce(r.effective_until,'infinity'::date)>=(instant at time zone r.timezone)::date)
 order by (v.kind='temporary') desc,v.version_number desc limit 1;
$$;
revoke all on function public.availability_version_for_calendar(uuid,date),public.availability_version_at_instant(uuid,timestamptz) from public,anon,authenticated,service_role;

create or replace function public.availability_rules_for_date(target_employee_id uuid,target_date date)
returns jsonb language sql stable set search_path='' as $$
 select v.recurring_rules from public.employee_schedule_availability_versions v
 where v.employee_id=target_employee_id and v.effective_from<=target_date and coalesce(v.effective_until,'infinity'::date)>=target_date
 and not exists(select 1 from public.employee_schedule_availability_versions r
   where r.workspace_id=v.workspace_id and r.employee_id=v.employee_id and r.version_number>v.version_number
    and v.id=any(r.replace_version_ids) and r.effective_from<=target_date and coalesce(r.effective_until,'infinity'::date)>=target_date)
 order by (v.kind='temporary') desc,v.version_number desc limit 1;
$$;

-- Preserve the existing read authorization, published locks and request history.
do $reads$
declare body text; anchor text;
begin
 body:=pg_get_functiondef('public.availability_read_service(uuid,uuid,uuid)'::regprocedure);
 anchor:='''confirmation_source'',v.confirmation_source,''confirmation'',v.confirmation)';
 if position(anchor in body)=0 then raise exception 'Availability version projection changed'; end if;
 body:=replace(body,anchor,'''replace_version_ids'',to_jsonb(v.replace_version_ids),'||anchor);
 anchor:='(select v from jsonb_array_elements(versions) v where (v->>''effective_from'')::date<=today and coalesce((v->>''effective_until'')::date,''infinity''::date)>=today order by (v->>''revision'')::integer desc limit 1)';
 if position(anchor in body)=0 then raise exception 'Availability current projection changed'; end if;
 body:=replace(body,anchor,'(select v from jsonb_array_elements(versions) v where v->>''id''=(public.availability_version_at_instant(e.id,now())).id::text)');
 execute body;

 body:=pg_get_functiondef('public.get_employee_hub_availability_v2_service(uuid,uuid,date,date)'::regprocedure);
 anchor:='where v.employee_id=(model->''employee''->>''id'')::uuid';
 if position(anchor in body)=0 then raise exception 'Hub availability projection changed'; end if;
 body:=replace(body,anchor,'where v.id=(public.availability_version_at_instant((model->''employee''->>''id'')::uuid,now())).id');
 execute body;

 body:=pg_get_functiondef('public.get_schedule_read_model_availability_v2_service(uuid,uuid,date)'::regprocedure);
 anchor:='''revision'',v.version_number,''timezone'',v.timezone,''days'',v.recurring_rules,';
 if position(anchor in body)=0 then raise exception 'Schedule version projection changed'; end if;
 body:=replace(body,anchor,'''id'',v.id,''kind'',v.kind,''replace_version_ids'',to_jsonb(v.replace_version_ids),'||anchor);
 execute body;
end; $reads$;

-- Keep only the public assessment fields. Private leave/source rows are not
-- part of the Schedule read contract. Old publications stay explicitly unknown.
create function public.schedule_availability_read_projection(actor uuid,w uuid,s jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare prior jsonb; a jsonb; evidence jsonb; retained boolean:=false; can_override boolean:=false;
begin
 if s->>'employee_id' is not null then
  prior:=case when s->>'publication_id' is not null then s else public.schedule_availability_prior_publication(w,s) end;
  retained:=prior is not null;
  if retained then
   a:=nullif(prior->'availability_snapshot'->'assessment','null');
   if a is not null then a:=a||jsonb_build_object('operation','allowed','reasons','[]'::jsonb,'responsibility_retained',true); end if;
  else
   a:=public.assess_shift_availability(w,(s->>'employee_id')::uuid,s);
   evidence:=public.schedule_availability_override(w,s,a);
   if a->>'operation'='warning_requires_override' and evidence is not null then
    a:=a||jsonb_build_object('operation','allowed','reasons','[]'::jsonb,'override_recorded',true);
   end if;
  end if;
  can_override:=public.schedule_actor_has_capability_service(actor,w,'schedule.availability.override',(s->>'location_id')::uuid);
 end if;
 if a is not null then
  select jsonb_object_agg(key,value) into a from jsonb_each(a) where key=any(array[
   'coverage','operation','time_basis','timezone','assessment_scope','intervals','available_intervals','unavailable_intervals','unknown_intervals',
   'reasons','fingerprint','policy_revision','fold_resolution','assessment_minutes','responsibility_retained','override_recorded']);
  a:=a||jsonb_build_object('can_override',can_override);
 end if;
 return jsonb_build_object('availability_assessment',a,'availability_responsibility_retained',retained,
  'time_basis',s->'time_basis','time_snapshot',s->'time_snapshot','time_timezone',s->'time_timezone',
  'hide_time_on_badge',coalesce((s->>'hide_time_on_badge')::boolean,false));
end; $$;
revoke all on function public.schedule_availability_read_projection(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- The supplied model has already passed the existing actor/location filters.
-- Never add records; enrich only exact IDs/dates/locations returned by that read.
create function public.schedule_availability_enrich_read(actor uuid,w uuid,model jsonb,draft uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare field text; item jsonb; result jsonb; stored jsonb; projection jsonb; codes jsonb;
begin
 foreach field in array array['shifts','ghost_shifts'] loop
  if not model ? field then continue; end if;
  result:='[]';
  for item in select value from jsonb_array_elements(coalesce(model->field,'[]')) loop
   stored:=null;
   if draft is not null and field='shifts' then
    select to_jsonb(s) into stored from public.schedule_draft_shifts s where s.workspace_id=w and s.draft_id=draft
     and s.id=(item->>'id')::uuid and s.location_id=(item->>'location_id')::uuid and s.scheduled_date=(item->>'scheduled_date')::date;
   else
    select to_jsonb(s) into stored from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.workspace_id=s.workspace_id
     where s.workspace_id=w and (s.source_shift_id=(item->>'id')::uuid or s.id=(item->>'id')::uuid)
      and s.location_id=(item->>'location_id')::uuid and s.scheduled_date=(item->>'scheduled_date')::date and p.status='current'
     order by p.version_number desc limit 1;
   end if;
   if stored is not null then
    projection:=public.schedule_availability_read_projection(actor,w,stored);
    select coalesce(jsonb_agg(value),'[]') into codes from jsonb_array_elements(coalesce(item->'warning_codes','[]')) where value<>'"availability"'::jsonb;
    if projection->'availability_assessment'->>'operation'<>'allowed' then codes:=codes||'"availability"'::jsonb; end if;
    item:=item||projection||jsonb_build_object('warning_codes',codes);
   end if;
   result:=result||jsonb_build_array(item);
  end loop;
  model:=jsonb_set(model,array[field],result);
 end loop;
 return model;
end; $$;
revoke all on function public.schedule_availability_enrich_read(uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;

do $enrich$
declare body text; anchor text;
begin
 body:=pg_get_functiondef('public.get_schedule_read_model_availability_v2_service(uuid,uuid,date)'::regprocedure);
 anchor:='return jsonb_set(model,''{employees}'',employees);';
 if position(anchor in body)=0 then raise exception 'Schedule read return changed'; end if;
 execute replace(body,anchor,'return public.schedule_availability_enrich_read(actor_user_id,target_workspace_id,jsonb_set(model,''{employees}'',employees));');
 body:=pg_get_functiondef('public.list_schedule_weekly_shifts_service(uuid,uuid,date,uuid[],uuid,boolean)'::regprocedure);
 anchor:='return result;';
 if position(anchor in body)=0 then raise exception 'Weekly read return changed'; end if;
 execute replace(body,anchor,'return public.schedule_availability_enrich_read(actor_user_id,target_workspace_id,result,target_draft_id);');
end; $enrich$;

create or replace function public.list_schedule_draft_availability_conflicts_service(
 actor_user_id uuid,target_workspace_id uuid,target_draft_id uuid,target_week_start date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s record; a jsonb; projection jsonb; conflicts jsonb:='[]'; signatures jsonb:='[]'; fingerprint text;
begin
 if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.manage') then
  raise exception 'schedule manage access denied' using errcode='42501'; end if;
 if not exists(select 1 from public.schedule_drafts d where d.workspace_id=target_workspace_id and d.id=target_draft_id and d.week_start=target_week_start and d.archived_at is null) then
  return jsonb_build_object('status','ok','conflicts',conflicts,'fingerprint','none'); end if;
 for s in select shift.*,l.name location_name,trim(e.first_name||' '||e.last_name) employee_name,t.name shift_type_label,j.name job_name
  from public.schedule_draft_shifts shift
  join public.locations l on l.workspace_id=shift.workspace_id and l.id=shift.location_id
  join public.employee_profiles e on e.workspace_id=shift.workspace_id and e.id=shift.employee_id
  left join public.shift_types t on t.workspace_id=shift.workspace_id and t.id=shift.shift_type_id
  left join public.jobs j on j.workspace_id=shift.workspace_id and j.id=shift.job_id
  where shift.workspace_id=target_workspace_id and shift.draft_id=target_draft_id and shift.scheduled_date between target_week_start and target_week_start+6
   and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.manage',shift.location_id)
  order by shift.scheduled_date,shift.start_time,shift.id loop
  projection:=public.schedule_availability_read_projection(actor_user_id,target_workspace_id,to_jsonb(s));
  a:=nullif(projection->'availability_assessment','null');
  signatures:=signatures||jsonb_build_array(jsonb_build_object('shift_id',s.id,'assessment',a,'retained',projection->'availability_responsibility_retained'));
  if a->>'operation'<>'allowed' then
   conflicts:=conflicts||jsonb_build_array(jsonb_build_object('employee_id',s.employee_id,'employee_name',s.employee_name,'shift_id',s.id,
    'location_id',s.location_id,'location_name',s.location_name,'date',s.scheduled_date,'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'),
    'shift_type_label',s.shift_type_label,'job_name',s.job_name,'warning_text',coalesce(a->'reasons'->0->>'message','Review employee availability.'),
    'assessment',a,'conflict_fingerprint',a->>'fingerprint'));
  end if;
 end loop;
 fingerprint:=encode(extensions.digest(signatures::text,'sha256'),'hex');
 return jsonb_build_object('status','ok','conflicts',conflicts,'fingerprint',fingerprint);
end; $$;
