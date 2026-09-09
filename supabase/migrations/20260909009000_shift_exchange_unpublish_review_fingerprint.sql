-- Exchange approval changes an assignment inside the current publication.
-- A previously reviewed unpublish operation must notice that material change,
-- even when the publication id, version, and number of shifts are unchanged.
alter function public.preview_schedule_unpublication_service(uuid,uuid,date,uuid[])
 rename to preview_schedule_unpublication_exchange_base;

create function public.preview_schedule_unpublication_service(
 actor_user_id uuid,target_workspace_id uuid,target_week_start date,target_location_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare reviewed jsonb; assignments jsonb;
begin
 -- Retain the existing role/location scope checks and user-facing preview.
 reviewed:=public.preview_schedule_unpublication_exchange_base(
  actor_user_id,target_workspace_id,target_week_start,target_location_ids);
 select coalesce(jsonb_agg(jsonb_build_array(
  s.id,s.source_shift_id,s.employee_id,s.location_id,s.job_id,s.shift_type_id,
  s.scheduled_date,s.start_time,s.end_time,s.unpaid_break_minutes,
  s.time_basis,s.time_timezone,s.time_snapshot) order by s.id),'[]'::jsonb)
 into assignments
 from public.schedule_published_shifts s
 join public.schedule_location_publications p on p.id=s.publication_id and p.workspace_id=s.workspace_id
 where p.workspace_id=target_workspace_id and p.week_start=target_week_start
  and p.location_id=any(target_location_ids) and p.status='current';
 return reviewed||jsonb_build_object('fingerprint',encode(extensions.digest(
  convert_to(jsonb_build_object('review',reviewed->>'fingerprint','assignments',assignments)::text,'UTF8'),'sha256'),'hex'));
end; $$;

revoke all on function public.preview_schedule_unpublication_exchange_base(uuid,uuid,date,uuid[]),
 public.preview_schedule_unpublication_service(uuid,uuid,date,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.preview_schedule_unpublication_service(uuid,uuid,date,uuid[]) to service_role;
