create or replace function public.publish_schedule_draft_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_draft_id uuid,
  target_location_ids uuid[],
  expected_draft_revision integer,
  expected_fingerprint text,
  override_decisions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_draft public.schedule_drafts%rowtype;
  preview jsonb;
  location_item jsonb;
  finding jsonb;
  decision jsonb;
  publication_id uuid;
  previous_publication_id uuid;
  publication_ids uuid[] := '{}'::uuid[];
  normalized_locations uuid[];
  total_shift_count integer := 0;
  published_at timestamptz := now();
begin
  select * into target_draft from public.schedule_drafts draft
  where draft.id = target_draft_id and draft.workspace_id = target_workspace_id
    and draft.archived_at is null for update;
  if target_draft.id is null then raise exception 'schedule draft not found' using errcode = 'P0002'; end if;
  if target_draft.revision <> expected_draft_revision then
    raise exception 'stale publication preview' using errcode = '40001';
  end if;
  select array_agg(distinct location_id order by location_id) into normalized_locations
  from unnest(target_location_ids) location_id;
  perform 1 from public.schedule_location_publications publication
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_draft.week_start
    and publication.location_id = any(normalized_locations) for update;

  preview := public.preview_schedule_publication_service(
    actor_user_id, target_workspace_id, target_draft_id, normalized_locations
  );
  if preview->>'status' = 'past_week_closed' then
    raise exception 'past schedule week is closed' using errcode = '42501';
  end if;
  if preview->>'fingerprint' <> expected_fingerprint then
    raise exception 'stale publication preview' using errcode = '40001';
  end if;
  if preview->>'status' = 'hard_blocked' then
    raise exception 'schedule has hard publication blockers' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(override_decisions, '[]'::jsonb)) <> 'array' then
    raise exception 'publication overrides must be an array' using errcode = '22023';
  end if;
  for finding in select value from jsonb_array_elements(preview->'findings')
  loop
    if finding->>'severity' <> 'soft' then continue; end if;
    select value into decision from jsonb_array_elements(override_decisions)
    where value->>'finding_id' = finding->>'id' limit 1;
    if decision is null or char_length(btrim(coalesce(decision->>'reason', ''))) not between 10 and 500 then
      raise exception 'publication override reason required' using errcode = '22023';
    end if;
  end loop;

  for location_item in select value from jsonb_array_elements(preview->'locations')
  loop
    previous_publication_id := nullif(location_item->>'active_publication_id', '')::uuid;
    publication_id := gen_random_uuid();
    if previous_publication_id is not null then
      update public.schedule_location_publications
      set status = 'superseded'
      where id = previous_publication_id and status = 'current';
      if not found then raise exception 'stale publication preview' using errcode = '40001'; end if;
    end if;
    insert into public.schedule_location_publications (
      id, workspace_id, location_id, week_start, version_number, status,
      published_by, published_at, source_draft_id, source_draft_revision, content_fingerprint
    ) values (
      publication_id, target_workspace_id, (location_item->>'location_id')::uuid,
      target_draft.week_start,
      coalesce((select max(version_number) + 1 from public.schedule_location_publications
        where location_id = (location_item->>'location_id')::uuid and week_start = target_draft.week_start), 1),
      'current', actor_user_id, published_at, target_draft.id, target_draft.revision,
      expected_fingerprint
    );
    if previous_publication_id is not null then
      update public.schedule_location_publications
      set superseded_by = publication_id
      where id = previous_publication_id;
    end if;
    insert into public.schedule_published_shifts (
      workspace_id, location_id, publication_id, employee_id, job_id, shift_type_id,
      scheduled_date, start_time, end_time, unpaid_break_minutes, hide_time_on_badge, note, source_shift_id
    )
    select shift.workspace_id, shift.location_id, publication_id, shift.employee_id,
      shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time,
      shift.end_time, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.id
    from public.schedule_draft_shifts shift
    where shift.draft_id = target_draft.id
      and shift.location_id = (location_item->>'location_id')::uuid;
    get diagnostics total_shift_count = row_count;
    publication_ids := array_append(publication_ids, publication_id);

    for finding in select value from jsonb_array_elements(preview->'findings')
    loop
      if finding->>'severity' <> 'soft'
        or finding->>'location_id' <> location_item->>'location_id' then continue; end if;
      select value into decision from jsonb_array_elements(override_decisions)
      where value->>'finding_id' = finding->>'id' limit 1;
      insert into public.schedule_publication_overrides (
        workspace_id, publication_id, source_draft_id, source_draft_revision,
        finding_id, finding_code, employee_id, location_id, scheduled_date,
        source_shift_ids, reason, actor_user_id
      ) values (
        target_workspace_id, publication_id, target_draft.id, target_draft.revision,
        finding->>'id', finding->>'code', nullif(finding->>'employee_id', '')::uuid,
        (finding->>'location_id')::uuid, (finding->>'scheduled_date')::date,
        array(select jsonb_array_elements_text(finding->'shift_ids')::uuid),
        btrim(decision->>'reason'), actor_user_id
      );
    end loop;
  end loop;

  select count(*)::integer into total_shift_count
  from public.schedule_published_shifts shift where shift.publication_id = any(publication_ids);
  insert into public.schedule_publication_events (
    workspace_id, week_start, action, actor_user_id, location_ids,
    source_draft_id, source_draft_revision, publication_ids,
    preflight_fingerprint, diff_summary
  ) values (
    target_workspace_id, target_draft.week_start, 'published', actor_user_id,
    normalized_locations, target_draft.id, target_draft.revision, publication_ids,
    expected_fingerprint, jsonb_build_object('locations', preview->'locations')
  );
  return jsonb_build_object(
    'status', 'published', 'workspace_id', target_workspace_id,
    'week_start', target_draft.week_start, 'draft_id', target_draft.id,
    'draft_revision', target_draft.revision, 'location_ids', to_jsonb(normalized_locations),
    'publication_ids', to_jsonb(publication_ids), 'published_shift_count', total_shift_count,
    'published_at', published_at
  );
end;
$$;

create or replace function public.share_schedule_lineup_service(actor_user_id uuid,target_workspace_id uuid,target_date date,target_location_ids uuid[],expected_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare model jsonb; actual text; item jsonb; ln public.schedule_lineups%rowtype; snapshot_ids uuid[]:='{}'::uuid[]; saved_id uuid; shared_time timestamptz:=now();
begin
 model:=public.get_schedule_lineup_service(actor_user_id,target_workspace_id,target_date,target_location_ids,null);
 model:=jsonb_set(model,'{locations}',coalesce((select jsonb_agg(jsonb_set(location,'{entries}',coalesce((select jsonb_agg(entry) from jsonb_array_elements(location->'entries') entry where not coalesce((entry->>'call_off')::boolean,false) and not coalesce((entry->>'hidden')::boolean,false)),'[]'::jsonb))) from jsonb_array_elements(model->'locations') location),'[]'::jsonb));
 if not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.lineup.share') or exists(select 1 from unnest(target_location_ids) id where not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.lineup.share',id)) then raise exception 'schedule line-up share access denied' using errcode='42501'; end if;
 actual:=encode(extensions.digest(convert_to(model::text,'UTF8'),'sha256'),'hex'); if actual<>expected_fingerprint then raise exception 'stale schedule line-up share preview' using errcode='40001'; end if;
 for item in select * from jsonb_array_elements(model->'locations') loop
   insert into public.schedule_lineups(workspace_id,location_id,lineup_date,created_by,updated_by) values(target_workspace_id,(item->>'id')::uuid,target_date,actor_user_id,actor_user_id)
   on conflict(workspace_id,location_id,lineup_date) do update set share_version=public.schedule_lineups.share_version+1,shared_at=shared_time,updated_by=actor_user_id,updated_at=shared_time
   returning * into ln;
   if ln.share_version=0 then update public.schedule_lineups set share_version=1,shared_at=shared_time where id=ln.id returning * into ln; end if;
   insert into public.schedule_lineup_snapshots(workspace_id,location_id,lineup_date,version_number,fingerprint,content,shared_by,shared_at)
   values(target_workspace_id,ln.location_id,target_date,ln.share_version,actual,item,actor_user_id,shared_time) returning id into saved_id;
   snapshot_ids:=array_append(snapshot_ids,saved_id);
 end loop;
 return jsonb_build_object('status','shared','workspace_id',target_workspace_id,'date',target_date,'location_ids',target_location_ids,'snapshot_ids',snapshot_ids,'shared_at',shared_time);
end; $$;

create or replace function public.save_announcement_service(actor_user_id uuid,target_workspace_id uuid,target_announcement_id uuid,target_expected_revision integer,target_title text,target_body text,target_category text,target_audience_roles text[],target_location_ids uuid[],target_publish_at timestamptz,target_expires_at timestamptz,target_action_url text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare announcement public.announcements%rowtype; location_id uuid; next_status public.announcement_status:='draft'::public.announcement_status;
begin
 if not public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'announcements.manage') then raise exception 'announcement management required' using errcode='42501'; end if;
 if char_length(btrim(target_title)) not between 1 and 120 or char_length(btrim(target_body)) not between 1 and 5000 or target_category not in('general','operations','schedule') then raise exception 'valid announcement content required' using errcode='22023'; end if;
 if cardinality(target_audience_roles) not between 1 and 4 or exists(select 1 from unnest(target_audience_roles) role_name where role_name not in('owner','admin','manager','employee')) then raise exception 'valid announcement audience required' using errcode='22023'; end if;
 if target_action_url is not null and (char_length(target_action_url)>500 or target_action_url!~'^/app(/|$)') then raise exception 'valid app action required' using errcode='22023'; end if;
 if target_expires_at is not null and target_publish_at is not null and target_expires_at<=target_publish_at then raise exception 'expiry must follow publication' using errcode='22023'; end if;
 if cardinality(target_location_ids)=0 and not public.communication_actor_has_all_locations_service(actor_user_id,target_workspace_id) then raise exception 'all-location announcement access required' using errcode='42501'; end if;
 foreach location_id in array target_location_ids loop
  if not public.communication_actor_has_capability_service(actor_user_id,target_workspace_id,'announcements.manage',location_id) or not exists(select 1 from public.locations where id=location_id and workspace_id=target_workspace_id and archived_at is null) then raise exception 'announcement location access denied' using errcode='42501'; end if;
 end loop;
 if target_announcement_id is null then
  insert into public.announcements(workspace_id,title,body,category,audience_roles,publish_at,expires_at,action_url,created_by,updated_by)
  values(target_workspace_id,btrim(target_title),btrim(target_body),target_category::public.announcement_category,array(select distinct role_name::public.workspace_role from unnest(target_audience_roles) role_name),target_publish_at,target_expires_at,target_action_url,actor_user_id,actor_user_id) returning * into announcement;
 else
  select * into announcement from public.announcements where id=target_announcement_id and workspace_id=target_workspace_id for update;
  if announcement.id is null then raise exception 'announcement not found' using errcode='P0002'; end if;
  if announcement.revision<>target_expected_revision then raise exception 'stale announcement revision' using errcode='40001'; end if;
  if announcement.status not in('draft','scheduled') then raise exception 'announcement can no longer be edited' using errcode='40001'; end if;
  next_status:=announcement.status;
  update public.announcements set title=btrim(target_title),body=btrim(target_body),category=target_category::public.announcement_category,audience_roles=array(select distinct role_name::public.workspace_role from unnest(target_audience_roles) role_name),publish_at=target_publish_at,expires_at=target_expires_at,action_url=target_action_url,revision=revision+1,updated_by=actor_user_id,updated_at=now() where id=announcement.id returning * into announcement;
  delete from public.notifications where source_type='announcement' and source_id=announcement.id;
 end if;
 delete from public.announcement_locations where announcement_id=announcement.id;
 insert into public.announcement_locations(workspace_id,announcement_id,location_id) select target_workspace_id,announcement.id,distinct_id from (select distinct unnest(target_location_ids) distinct_id) locations;
 if next_status='scheduled' then perform public.publish_announcement_service(actor_user_id,target_workspace_id,announcement.id,announcement.revision); select * into announcement from public.announcements where id=announcement.id; end if;
 return jsonb_build_object('status',announcement.status,'announcement_id',announcement.id,'revision',announcement.revision,'recipient_count',0);
end; $$;

revoke all on function public.publish_schedule_draft_service(uuid, uuid, uuid, uuid[], integer, text, jsonb) from public, anon;
grant execute on function public.publish_schedule_draft_service(uuid, uuid, uuid, uuid[], integer, text, jsonb) to authenticated;
revoke all on function public.share_schedule_lineup_service(uuid,uuid,date,uuid[],text) from public,anon,authenticated;
grant execute on function public.share_schedule_lineup_service(uuid,uuid,date,uuid[],text) to service_role;
revoke all on function public.save_announcement_service(uuid,uuid,uuid,integer,text,text,text,text[],uuid[],timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.save_announcement_service(uuid,uuid,uuid,integer,text,text,text,text[],uuid[],timestamptz,timestamptz,text) to service_role;
