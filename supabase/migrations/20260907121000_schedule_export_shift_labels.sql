create or replace function public.preview_schedule_export_service(actor_user_id uuid,target_workspace_id uuid,target_week_start date,source_type text,source_draft_id uuid,target_location_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare normalized uuid[]; source_revision integer; rows jsonb; locations jsonb; unsigned jsonb; workspace_name text;
begin
  if source_type not in ('published','draft') then raise exception 'invalid schedule export source' using errcode='22023'; end if;
  select array_agg(distinct id order by id) into normalized from unnest(target_location_ids) id;
  if coalesce(cardinality(normalized),0)=0 then raise exception 'schedule export location required' using errcode='22023'; end if;
  if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.export')
    or exists(select 1 from unnest(normalized) id where not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.export',id)) then
    raise exception 'schedule export scope denied' using errcode='42501';
  end if;
  if source_type='draft' then
    select revision into source_revision from public.schedule_drafts d where d.id=source_draft_id and d.workspace_id=target_workspace_id and d.week_start=target_week_start and d.archived_at is null;
    if source_revision is null then raise exception 'schedule export draft not found' using errcode='P0002'; end if;
  elsif source_draft_id is not null then raise exception 'published export cannot specify draft' using errcode='22023'; end if;
  select name into workspace_name from public.workspaces where id=target_workspace_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by l.sort_order,l.id),'[]'::jsonb) into locations
  from public.locations l where l.workspace_id=target_workspace_id and l.id=any(normalized);
  if jsonb_array_length(locations)<>cardinality(normalized) then raise exception 'schedule export location not found' using errcode='P0002'; end if;
  if source_type='draft' then
    select coalesce(jsonb_agg(jsonb_build_object('shift_id',s.id,'scheduled_date',s.scheduled_date,'location_name',l.name,
      'employee_name',case when s.employee_id is null then null else coalesce(nullif(e.preferred_name,''),e.first_name||' '||e.last_name) end,'job_name',j.name,'shift_type_name',st.name,
      'label_names',to_jsonb(coalesce(s.label_names,'{}'::text[])),
      'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'),'crosses_midnight',s.crosses_midnight,'note',s.note,
      'scheduled_minutes',(case when s.end_time<=s.start_time then 1440 else 0 end+extract(epoch from(s.end_time-s.start_time))/60)::integer)
      order by s.scheduled_date,l.sort_order,s.start_time,s.id),'[]'::jsonb) into rows
    from public.schedule_draft_shifts s join public.locations l on l.id=s.location_id join public.jobs j on j.id=s.job_id
    left join public.employee_profiles e on e.id=s.employee_id left join public.shift_types st on st.id=s.shift_type_id
    where s.draft_id=source_draft_id and s.location_id=any(normalized);
  else
    select coalesce(jsonb_agg(jsonb_build_object('shift_id',s.id,'scheduled_date',s.scheduled_date,'location_name',l.name,
      'employee_name',case when s.employee_id is null then null else coalesce(nullif(e.preferred_name,''),e.first_name||' '||e.last_name) end,'job_name',j.name,'shift_type_name',st.name,
      'label_names',to_jsonb(coalesce(s.label_names,'{}'::text[])),
      'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'),'crosses_midnight',s.crosses_midnight,'note',s.note,
      'scheduled_minutes',(case when s.end_time<=s.start_time then 1440 else 0 end+extract(epoch from(s.end_time-s.start_time))/60)::integer)
      order by s.scheduled_date,l.sort_order,s.start_time,s.id),'[]'::jsonb) into rows
    from public.schedule_published_shifts s join public.schedule_location_publications p on p.id=s.publication_id and p.status='current' and p.week_start=target_week_start
    join public.locations l on l.id=s.location_id join public.jobs j on j.id=s.job_id left join public.employee_profiles e on e.id=s.employee_id left join public.shift_types st on st.id=s.shift_type_id
    where s.workspace_id=target_workspace_id and s.location_id=any(normalized);
  end if;
  unsigned:=jsonb_build_object('workspace_id',target_workspace_id,'workspace_name',workspace_name,'week_start',target_week_start,
    'source',case when source_type='draft' then jsonb_build_object('type','draft','draft_id',source_draft_id) else jsonb_build_object('type','published') end,
    'source_revision',source_revision,'locations',locations,'rows',rows,'summary',jsonb_build_object('shift_count',jsonb_array_length(rows),
      'employee_count',(select count(distinct x->>'employee_name') from jsonb_array_elements(rows) x where x->>'employee_name' is not null),
      'scheduled_minutes',(select coalesce(sum((x->>'scheduled_minutes')::integer),0) from jsonb_array_elements(rows) x)));
  return unsigned||jsonb_build_object('status','export_ready','fingerprint',encode(extensions.digest(convert_to(unsigned::text,'UTF8'),'sha256'),'hex'));
end; $$;
