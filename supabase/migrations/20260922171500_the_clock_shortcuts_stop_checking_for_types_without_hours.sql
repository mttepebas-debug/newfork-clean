-- The availability screen offers each shift type as a clock shortcut -- tap
-- "Lunch" and its hours fill themselves in. The list used to skip any type
-- whose hours were missing or ran from a time to the same time, because such a
-- type would have had nothing to fill in.
--
-- Such a type cannot exist any more. guard_weekly_preference_type_hours
-- refuses one on the way in and refuses an edit that would empty its hours,
-- and a deleted type is always archived as well, which the list already
-- excludes. The condition was guarding a door that has been bricked up; this
-- product has no older data behind it that could still come through.

CREATE OR REPLACE FUNCTION public.availability_read_before_calendar_service(actor uuid, w uuid, employee_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.employee_profiles%rowtype; settings public.workspace_scheduling_settings%rowtype; latest jsonb; versions jsonb;
 locks jsonb; requests jsonb; events jsonb; is_self boolean; can_manage boolean; today date; suggested date;
begin
 select * into e from public.employee_profiles p where p.workspace_id=w and p.archived_at is null
  and case when availability_read_before_calendar_service.employee_id is null then p.user_id=actor else p.id=availability_read_before_calendar_service.employee_id end;
 if e.id is null or not public.availability_actor_scope(actor,w,e.id,false) then raise exception 'Availability access denied' using errcode='42501'; end if;
 is_self:=coalesce(e.user_id=actor,false); can_manage:=public.availability_actor_scope(actor,w,e.id,true);
 select * into settings from public.workspace_scheduling_settings where workspace_id=w;
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'timezone',v.timezone,'days',v.recurring_rules,'effective_from',v.effective_from,
  'effective_until',v.effective_until,'revision',v.version_number,'source',v.source,'kind',v.kind,'request_id',v.request_id,
  'date_overrides',v.date_overrides,'replace_version_ids',to_jsonb(v.replace_version_ids),'confirmation_source',v.confirmation_source,'confirmation',v.confirmation) order by version_number desc),'[]') into versions
  from public.employee_schedule_availability_versions v where v.workspace_id=w and v.employee_id=e.id;
 latest:=versions->0; today:=(now() at time zone coalesce(latest->>'timezone','UTC'))::date;
 select greatest(today,coalesce(max(l.week_start+7),today)) into suggested from public.availability_publication_locks l where l.workspace_id=w and l.week_start+6>=today
  and (exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=e.id and a.location_id=l.location_id and a.ended_at is null)
    or exists(select 1 from public.schedule_published_shifts s where s.workspace_id=w and s.employee_id=e.id and s.location_id=l.location_id and s.scheduled_date between l.week_start and l.week_start+6));
 select coalesce(jsonb_agg(jsonb_build_object('location_id',l.location_id,'location_name',loc.name,'starts_on',l.week_start,'ends_on',l.week_start+6) order by l.week_start,loc.name),'[]')
 into locks from public.availability_publication_locks l join public.locations loc on loc.id=l.location_id and loc.workspace_id=w
 where l.workspace_id=w and l.week_start+6>=today and (is_self or public.schedule_actor_has_capability_service(actor,w,'employees.read',l.location_id))
 and (exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=e.id and a.location_id=l.location_id and a.ended_at is null)
   or exists(select 1 from public.schedule_published_shifts s where s.workspace_id=w and s.employee_id=e.id and s.location_id=l.location_id and s.scheduled_date between l.week_start and l.week_start+6));
 select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('can_review',can_manage and not is_self and r.author_id<>actor,
   'can_withdraw',is_self or (r.author_id=actor and r.source='manager_proposal'),'can_confirm',is_self and r.status='awaiting_employee') order by r.created_at desc,r.id),'[]')
 into requests from public.availability_requests r where r.workspace_id=w and r.employee_id=e.id;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]') into events from public.availability_events x
 join public.availability_requests r on r.id=x.request_id and r.workspace_id=x.workspace_id where r.workspace_id=w and r.employee_id=e.id;
 return jsonb_build_object('employee_id',e.id,'latest',latest,'revision',coalesce((latest->>'revision')::integer,0),'versions',versions,
  'current',(select v from jsonb_array_elements(versions) v where v->>'id'=(public.availability_version_at_instant(e.id,now())).id::text),
  
  'clock_presets',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,
   'start_time',to_char(s.default_start_time,'HH24:MI'),'end_time',to_char(s.default_end_time,'HH24:MI')) order by s.name,s.id),'[]')
   from public.shift_types s where s.workspace_id=w and s.archived_at is null),
  
  'time_format',settings.time_format,
  'shift_types',(select coalesce(jsonb_agg(jsonb_build_object('id',st.id,'name',st.name,'archived',st.archived_at is not null) order by st.name,st.id),'[]') from public.shift_types st where st.workspace_id=w),
 'published_periods',locks,'suggested_start',greatest(suggested,today+settings.availability_notice_days),'requests',requests,'events',events,
  'is_self',is_self,'can_submit',is_self or (can_manage and settings.availability_ownership<>'employee_only'),'can_manage',can_manage,
  'policy',jsonb_build_object('ownership',settings.availability_ownership,'approval',settings.availability_approval,'initial_review',settings.availability_initial_review,
   'notice_days',settings.availability_notice_days,'revision',settings.availability_policy_revision,'enforcement',settings.availability_enforcement));
end; $function$;
