-- Keep original publication evidence immutable while suppressing reminders
-- that were disabled after publication. Re-enabling must not backfill them.
alter table public.manager_weekly_reminders add column last_disabled_at timestamptz;
update public.manager_weekly_reminders set last_disabled_at=updated_at where not enabled;
create function public.stamp_weekly_reminder_disable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then new.last_disabled_at:=case when not new.enabled then clock_timestamp() end;
 elsif old.enabled and not new.enabled then new.last_disabled_at:=clock_timestamp();
 else new.last_disabled_at:=old.last_disabled_at; end if;
 return new;
end; $$;
revoke all on function public.stamp_weekly_reminder_disable() from public,anon,authenticated,service_role;
create trigger weekly_reminder_disable_stamp before insert or update on public.manager_weekly_reminders
 for each row execute function public.stamp_weekly_reminder_disable();

create function public.weekly_published_availability_visible(w uuid,emp uuid,snapshot jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((snapshot->'assessment'->>'has_availability_conflict')::boolean,false) and (
  jsonb_array_length(coalesce(snapshot->'assessment'->'employee_intervals','[]'))>0 or (
   jsonb_array_length(coalesce(snapshot->'assessment'->'manager_intervals','[]'))>0 and exists(
    select 1 from public.manager_weekly_reminders m where m.workspace_id=w and m.employee_id=emp and m.enabled
     and (m.last_disabled_at is null or m.last_disabled_at<(snapshot->>'captured_at')::timestamptz)
   )
  )
 );
$$;
revoke all on function public.weekly_published_availability_visible(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

-- Staged replacement for schedule_availability_publication_preflight. Final
-- publication guards and commands must be switched before wiring this reader.
create function public.weekly_schedule_publication_preflight(payload jsonb,actor uuid,departments uuid[] default null,include_no_department boolean default true) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare findings jsonb; signatures jsonb:='[]'; s record; a jsonb; prior jsonb; evidence jsonb;
 unsigned jsonb; w uuid:=(payload->>'workspace_id')::uuid; code text; message text; state text; tier text; warning boolean;
begin
 if payload->>'status'='past_week_closed' then return payload; end if;
 select coalesce(jsonb_agg(f),'[]') into findings from jsonb_array_elements(payload->'findings') f
  where f->>'code' not in ('availability','availability_unknown','availability_review_pending','time_source_unresolved');
 for s in select d.*,concat_ws(' ',e.first_name,e.last_name) employee_name,l.name location_name
  from public.schedule_draft_shifts d join public.employee_profiles e on e.id=d.employee_id and e.workspace_id=d.workspace_id
  join public.locations l on l.id=d.location_id and l.workspace_id=d.workspace_id
  where d.workspace_id=w and d.draft_id=(payload->>'draft_id')::uuid
   and d.location_id in (select (x->>'location_id')::uuid from jsonb_array_elements(payload->'locations') x)
   and public.schedule_shift_in_department_scope_service(d.job_id,departments,coalesce(include_no_department,true)) order by d.id loop
  if not public.schedule_actor_can_manage_service(actor,w,s.location_id) then raise exception 'Schedule location access denied' using errcode='42501'; end if;
  state:=null;
  prior:=public.schedule_availability_prior_publication(w,to_jsonb(s));
  if prior is not null then
   signatures:=signatures||jsonb_build_array(jsonb_build_object('shift_id',s.id,'retained_publication_id',prior->>'publication_id'));
   if not public.weekly_published_availability_visible(w,s.employee_id,prior->'availability_snapshot') then continue; end if;
   a:=prior->'availability_snapshot'->'assessment'; state:='accepted';
  else
   a:=public.assess_weekly_shift_availability(w,s.employee_id,to_jsonb(s));
   evidence:=public.schedule_availability_override(w,to_jsonb(s),a);
   signatures:=signatures||jsonb_build_array(jsonb_build_object('shift_id',s.id,'fingerprint',a->>'fingerprint','override_id',evidence->>'id'));
   if a->>'operation'='allowed' then continue; end if;
   if a->>'operation'='warning_requires_override' then state:=case when evidence is null then 'new' else 'accepted' end; end if;
  end if;
  warning:=state is not null;
  code:=case when warning then 'availability'
   when exists(select 1 from jsonb_array_elements(a->'reasons') r where r->>'code'='approved_time_off') then 'time_off'
   when s.time_basis in ('unresolved','legacy_unverified') then 'time_source_unresolved' else 'availability_unknown' end;
  if warning then message:='This shift overlaps unavailable hours.';
  else select string_agg(r->>'message',' ' order by ord) into message from jsonb_array_elements(a->'reasons') with ordinality r(r,ord)
   where r->>'code'<>'availability'; end if;
  tier:=case when not warning then 'blocker' when state='new' and a->>'warning_policy'='confirm' then 'risk' else 'note' end;
  findings:=findings||jsonb_build_array(jsonb_build_object('id',a->>'fingerprint','code',code,
   'severity',case when warning then 'soft' else 'hard' end,'overrideable',warning,'tier',tier,'introduced',state is distinct from 'accepted',
   'location_id',s.location_id,'location_name',s.location_name,'employee_id',s.employee_id,'employee_name',s.employee_name,
   'scheduled_date',s.scheduled_date,'shift_ids',jsonb_build_array(s.id),'message',left(coalesce(message,'Confirm shift hours before publishing.'),500))
   ||case when warning then jsonb_build_object('availability_state',state,'warning_policy',a->>'warning_policy') else '{}'::jsonb end);
 end loop;
 unsigned:=(payload-'fingerprint'-'status')||jsonb_build_object('findings',findings,'availability_assessments',signatures);
 return unsigned||jsonb_build_object('status',case
  when exists(select 1 from jsonb_array_elements(findings) f where f->>'severity'='hard' and coalesce(f->>'tier','blocker')<>'note') then 'hard_blocked'
  when exists(select 1 from jsonb_array_elements(findings) f where coalesce(f->>'tier','blocker')<>'note' and (coalesce((f->>'introduced')::boolean,true) or not (f->>'overrideable')::boolean)) then 'override_required'
  else 'publish_ready' end,'fingerprint',encode(extensions.digest(convert_to(unsigned::text,'UTF8'),'sha256'),'hex'));
end; $$;
revoke all on function public.weekly_schedule_publication_preflight(jsonb,uuid,uuid[],boolean) from public,anon,authenticated,service_role;
