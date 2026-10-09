create function public.weekly_team_read_service(actor uuid,w uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.workspace_memberships m where m.workspace_id=w and m.user_id=actor
  and m.status='active' and m.role in ('owner','admin','manager')) then
  raise exception 'Manager workspace access required' using errcode='42501';
 end if;
 if not public.schedule_actor_has_capability_service(actor,w,'schedule.read',null)
  and not exists(select 1 from public.locations l where l.workspace_id=w and l.archived_at is null
   and public.schedule_actor_has_capability_service(actor,w,'schedule.read',l.id)) then
  raise exception 'Schedule read access required' using errcode='42501';
 end if;
 with scope as materialized (
  select l.id,l.name,l.sort_order from public.locations l where l.workspace_id=w and l.archived_at is null
   and public.schedule_actor_has_capability_service(actor,w,'schedule.read',l.id)
 ), people as materialized (
  select e.id,e.employee_code,coalesce(nullif(e.preferred_name,''),e.first_name)||' '||e.last_name display_name,
   coalesce((select jsonb_agg(a.location_id order by a.location_id) from public.employee_location_assignments a
    join scope s on s.id=a.location_id where a.workspace_id=w and a.employee_id=e.id and a.ended_at is null),'[]') location_ids,
   p.employee_id is not null submitted,coalesce(p.preference,public.empty_weekly_preference(s.availability_input_mode)) preference,
   (public.weekly_preference_manager_scope(actor,w,e.id,'employees.read')
    or public.weekly_preference_manager_scope(actor,w,e.id,'employees.manage')) can_open
  from public.employee_profiles e
  join public.workspace_scheduling_settings s on s.workspace_id=e.workspace_id
  left join public.employee_weekly_preferences p on p.workspace_id=e.workspace_id and p.employee_id=e.id
  where e.workspace_id=w and e.archived_at is null and (
   exists(select 1 from public.employee_location_assignments a join scope l on l.id=a.location_id
    where a.workspace_id=w and a.employee_id=e.id and a.ended_at is null)
   or (not exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=e.id and a.ended_at is null)
    and exists(select 1 from public.workspace_memberships m where m.workspace_id=w and m.user_id=actor and m.all_locations)
    and public.schedule_actor_has_capability_service(actor,w,'schedule.read',null))
  )
 ), selected_types as (
  select distinct type_id::uuid id from people p cross join lateral jsonb_array_elements(p.preference->'days') day
   cross join lateral jsonb_array_elements_text(day->'shift_type_ids') type_id
 ), types as (
  select x.id,coalesce(t.name,d.name,'Unavailable shift type') name,
   to_char(case when t.id is not null and t.archived_at is null and t.deleted_at is null then t.default_start_time else d.start_time end,'HH24:MI') start_time,
   to_char(case when t.id is not null and t.archived_at is null and t.deleted_at is null then t.default_end_time else d.end_time end,'HH24:MI') end_time,
   (t.id is null or t.archived_at is not null or t.deleted_at is not null) archived,false selectable
  from selected_types x left join public.shift_types t on t.workspace_id=w and t.id=x.id
   left join public.weekly_preference_type_defaults d on d.workspace_id=w and d.shift_type_id=x.id
 )
 select jsonb_build_object(
  'locations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by sort_order,name,id) from scope),'[]'),
  'time_format',(select time_format from public.workspace_scheduling_settings where workspace_id=w),
  'employees',coalesce((select jsonb_agg(to_jsonb(p) order by display_name,employee_code,id) from people p),'[]'),
  'shift_types',coalesce((select jsonb_agg(to_jsonb(t) order by name,id) from types t),'[]')
 ) into result;
 return result;
end; $$;
revoke all on function public.weekly_team_read_service(uuid,uuid) from public,anon,authenticated;
grant execute on function public.weekly_team_read_service(uuid,uuid) to service_role;
