-- BL-230 (user, K13 a): an approved shift change is never undone by publishing
-- a draft, also after the week was taken down. shift_exchange_draft_undoes read
-- only the week's live publication, so once Ayse took the week down, a new
-- draft giving Ali's Tuesday back to Ali published without a word. It now reads
-- the week's latest publication at each place, live or taken down.

CREATE OR REPLACE FUNCTION public.shift_exchange_draft_undoes(w uuid, draft uuid, locations uuid[], departments uuid[] DEFAULT NULL::uuid[], include_no_department boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id','shift_exchange_undone:'||x.shift_id,'code','shift_exchange_undone',
   'severity','hard','overrideable',false,'tier','blocker','introduced',true,
   'location_id',x.location_id,'location_name',x.location_name,
   'employee_id',x.to_id,'employee_name',x.to_name,
   'scheduled_date',x.scheduled_date,'start_time',to_char(x.start_time,'HH24:MI'),'end_time',to_char(x.end_time,'HH24:MI'),
   'shift_ids',coalesce(to_jsonb(x.draft_ids),'[]'::jsonb),
   'exchange_case_id',x.case_id,'exchange_kind',x.kind,
   'from_employee_id',x.from_id,'from_employee_name',x.from_name,
   'to_employee_id',x.to_id,'to_employee_name',x.to_name,
   'draft_employee_id',x.draft_employee_id,'draft_employee_name',x.draft_employee_name,
   'message',case when x.from_id is null
     then coalesce(x.to_name,'A teammate')||' picked up this open shift after the schedule was last published, and this draft does not have it. Publishing would undo it.'
     else 'This shift was '||case x.kind when 'swap' then 'swapped' else 'handed over' end||' from '||coalesce(x.from_name,'a teammate')
      ||' to '||coalesce(x.to_name,'a teammate')||' after the schedule was last published, and this draft does not have it. Publishing would undo it.' end)
  order by x.scheduled_date,x.start_time,x.shift_id),'[]'::jsonb)
 from (
  select distinct on (p.id) p.id shift_id,p.location_id,l.name location_name,p.scheduled_date,p.start_time,p.end_time,
   c.id case_id,c.kind,
   -- Who held it when the change was asked: the offered side's owner, or on
   -- a swap's requested side the teammate who gave it.
   nullif(case when coalesce(p.source_shift_id,p.id)=c.offered_source_id then c.offered_snapshot else c.requested_snapshot end->>'employee_id','')::uuid from_id,
   nullif(case when coalesce(p.source_shift_id,p.id)=c.offered_source_id then c.offered_snapshot else c.requested_snapshot end->>'employee_name','') from_name,
   p.employee_id to_id,nullif(concat_ws(' ',coalesce(nullif(e.preferred_name,''),e.first_name),e.last_name),'') to_name,
   own.ids draft_ids,own.employee_id draft_employee_id,own.employee_name draft_employee_name
  from public.shift_exchange_cases c
  join public.schedule_published_shifts p on p.workspace_id=w and coalesce(p.source_shift_id,p.id) in (c.offered_source_id,c.requested_source_id)
  -- The week's latest publication at that place, live or taken down (BL-230):
  -- taking a week down does not undo an approved change either.
  join public.schedule_location_publications pub on pub.id=p.publication_id
   and pub.version_number=(select max(latest.version_number) from public.schedule_location_publications latest
    where latest.location_id=pub.location_id and latest.week_start=pub.week_start)
  join public.schedule_drafts dr on dr.id=draft and dr.workspace_id=w
  join public.locations l on l.id=p.location_id and l.workspace_id=w
  left join public.employee_profiles e on e.id=p.employee_id and e.workspace_id=w
  -- The draft's copy of this shift: the same row, or else a row in the same
  -- slot (place, job, day, hours), e.g. a draft written after the change.
  left join lateral (
   select array[d.id] ids,d.employee_id,
    nullif(concat_ws(' ',coalesce(nullif(de.preferred_name,''),de.first_name),de.last_name),'') employee_name
   from public.schedule_draft_shifts d
   left join public.employee_profiles de on de.id=d.employee_id and de.workspace_id=w
   where d.workspace_id=w and d.draft_id=draft and (d.id in (p.id,p.source_shift_id)
    or (d.location_id,d.job_id,d.scheduled_date,d.start_time,d.end_time) is not distinct from (p.location_id,p.job_id,p.scheduled_date,p.start_time,p.end_time))
   order by d.id in (p.id,p.source_shift_id) desc,d.id limit 1
  ) own on true
  -- ponytail: transaction start times. An approval that began before a
  -- publish but waited for the workspace lock (both take it first thing)
  -- reads as earlier; the window is the few statements before the lock.
  where c.workspace_id=w and c.status='completed' and c.updated_at>pub.published_at
   and p.location_id=any(locations)
   and p.scheduled_date between dr.week_start and dr.week_start+6
   and public.schedule_shift_in_department_scope_service(p.job_id,departments,coalesce(include_no_department,true))
   and not exists (select 1 from public.schedule_draft_shifts d where d.workspace_id=w and d.draft_id=draft
    and public.shift_exchange_edit_matches(to_jsonb(d),to_jsonb(p)))
  order by p.id,c.updated_at desc
 ) x;
$function$
;
