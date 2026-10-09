-- BL-188 (REUSE Q-C, user decision 2026-09-26): a deleted location counts
-- in no template or scheduled export rule.
--
-- Before: rename and delete dropped a deleted location (Q-B, inline in each),
-- but reading, listing and applying a template, and the scheduled and recent
-- export lists, still counted it. "Standard week" (Kadikoy + Besiktas): after
-- Besiktas was deleted, Ayse (Kadikoy manager) was allowed to rename it, the
-- rename re-read it through get and failed with "not found"; the list hid it
-- and applying it refused the whole template.
--
-- After: live_location_ids is the one place that drops deleted locations.
-- Every template rule (read, list, rename, delete, apply) and the scheduled
-- and recent export rules ask it. Applying writes only the shifts at live
-- locations. A location that is only archived (not deleted) still counts.

create function public.live_location_ids(w uuid, ids uuid[])
returns uuid[]
language sql
stable
set search_path = ''
as $$
 select array(select distinct x from unnest(ids) x
  where not exists (select 1 from public.locations l where l.id = x and l.workspace_id = w and l.deleted_at is not null)
  order by 1);
$$;
revoke all on function public.live_location_ids(uuid, uuid[]) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_schedule_template_service(actor_user_id uuid, target_workspace_id uuid, target_template_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; template_scope uuid[]; org_wide boolean;
begin
 perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.templates.read',
   target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.templates.read'));
 template_scope := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.templates.read');
 org_wide := app_private.authz_reason(actor_user_id, target_workspace_id, 'schedule.templates.read', '{}'::uuid[]) is null;
 select jsonb_build_object('template',jsonb_build_object('id',t.id,'workspace_id',t.workspace_id,'name',t.name,'revision',t.revision,
   'shift_count',(select count(*) from public.schedule_template_shifts s where s.template_id=t.id and s.location_id=any(places.ids)),
   'open_slot_count',(select count(*) from public.schedule_template_shifts s where s.template_id=t.id and s.location_id=any(places.ids) and s.employee_id is null),
   'created_by_name',coalesce(u.display_name,'Manager'),'updated_at',t.updated_at),
   'shifts',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'location_id',s.location_id,'employee_id',s.employee_id,'job_id',s.job_id,
     'shift_type_id',s.shift_type_id,'day_offset',s.day_offset,'time_basis',s.time_basis,'time_snapshot',s.time_snapshot,'time_timezone',s.time_timezone,'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'),
     'crosses_midnight',s.crosses_midnight,'hide_time_on_badge',coalesce(s.hide_time_on_badge,false),'label_ids',to_jsonb(coalesce(s.label_ids,'{}'::uuid[])),
     'label_names',to_jsonb(coalesce(s.label_names,'{}'::text[])),'note',s.note) order by s.day_offset,s.start_time,s.id) from public.schedule_template_shifts s where s.template_id=t.id and s.location_id=any(places.ids)),'[]'::jsonb))
 into result from public.schedule_templates t join public.user_profiles u on u.user_id=t.created_by
 cross join lateral (select public.live_location_ids(t.workspace_id, array(select distinct s.location_id from public.schedule_template_shifts s where s.template_id=t.id)) ids) places
 where t.id=target_template_id and t.workspace_id=target_workspace_id
 and (org_wide or (cardinality(places.ids)>0 and places.ids <@ template_scope));
 if result is null then raise exception 'schedule template not found' using errcode='P0002'; end if; return result;
end; $function$
;

CREATE OR REPLACE FUNCTION public.list_schedule_templates_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare template_scope uuid[]; org_wide boolean;
begin
 perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.templates.read',
   target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.templates.read'));
 template_scope := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.templates.read');
 org_wide := app_private.authz_reason(actor_user_id, target_workspace_id, 'schedule.templates.read', '{}'::uuid[]) is null;
 return (
 select jsonb_build_object('templates',coalesce(jsonb_agg(jsonb_build_object(
   'id',t.id,'workspace_id',t.workspace_id,'name',t.name,'revision',t.revision,
   'shift_count',x.shift_count,'open_slot_count',x.open_slot_count,
   'created_by_name',coalesce(u.display_name,'Manager'),'updated_at',t.updated_at
 ) order by t.updated_at desc,t.id) filter(where t.id is not null),'[]'::jsonb))
 from public.schedule_templates t join public.user_profiles u on u.user_id=t.created_by
 cross join lateral (select public.live_location_ids(t.workspace_id, array(select distinct z.location_id from public.schedule_template_shifts z where z.template_id=t.id)) ids) live
 cross join lateral (select count(*)::integer shift_count,count(*) filter(where s.employee_id is null)::integer open_slot_count
   from public.schedule_template_shifts s where s.template_id=t.id and s.location_id=any(live.ids)) x
 where t.workspace_id=target_workspace_id
 and (org_wide or (cardinality(live.ids)>0 and live.ids <@ template_scope))
 );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rename_schedule_template_service(actor_user_id uuid, target_workspace_id uuid, target_template_id uuid, target_name text, expected_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_name text;
begin
 select name into old_name from public.schedule_templates where id=target_template_id and workspace_id=target_workspace_id;
 perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.templates', target_locations => case
   when old_name is null then null
   else public.live_location_ids(target_workspace_id, array(select distinct s.location_id from public.schedule_template_shifts s
     where s.template_id = target_template_id and s.workspace_id = target_workspace_id))
 end);
 update public.schedule_templates set name=btrim(target_name),revision=revision+1,updated_by=actor_user_id,updated_at=now()
 where id=target_template_id and workspace_id=target_workspace_id and revision=expected_revision;
 if not found then raise exception 'schedule template revision stale' using errcode='40001'; end if;
 insert into public.schedule_template_events(workspace_id,template_id,template_name,action,actor_user_id,detail)
 values(target_workspace_id,target_template_id,btrim(target_name),'renamed',actor_user_id,jsonb_build_object('previous_name',old_name));
 return public.get_schedule_template_service(actor_user_id,target_workspace_id,target_template_id);
exception when unique_violation then raise exception 'schedule template name conflict' using errcode='23505'; end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_schedule_template_service(actor_user_id uuid, target_workspace_id uuid, target_template_id uuid, expected_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_name text;
begin
 perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.templates', target_locations => case
   when not exists (select 1 from public.schedule_templates t where t.id = target_template_id and t.workspace_id = target_workspace_id) then null
   else public.live_location_ids(target_workspace_id, array(select distinct s.location_id from public.schedule_template_shifts s
     where s.template_id = target_template_id and s.workspace_id = target_workspace_id))
 end);
 delete from public.schedule_templates where id=target_template_id and workspace_id=target_workspace_id and revision=expected_revision returning name into old_name;
 if old_name is null then raise exception 'schedule template revision stale' using errcode='40001'; end if;
 insert into public.schedule_template_events(workspace_id,template_id,template_name,action,actor_user_id) values(target_workspace_id,target_template_id,old_name,'deleted',actor_user_id);
 return jsonb_build_object('status','deleted','template_id',target_template_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_schedule_template_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, expected_session_revision integer, target_template_id uuid, apply_mode text, department_keys text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_session public.schedule_edit_sessions%rowtype;
  template_row public.schedule_templates%rowtype;
  source record;
  applied_count integer := 0;
  converted_count integer := 0;
  chosen_employee uuid;
  target_date date;
  target_end_date date;
  selected_department_ids uuid[] := '{}'::uuid[];
  include_no_department boolean := false;
  template_scope uuid[];
  live_locations uuid[];
begin
 perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.templates',
   target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.templates'));
 template_scope := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.templates');
 perform public.availability_lock_workspace(target_workspace_id);
  if apply_mode not in ('merge', 'overwrite') then
    raise exception 'invalid template apply mode' using errcode = '22023';
  end if;

  -- No department list: the whole template, as the six-argument twin did.
  if department_keys is not null then
    if cardinality(department_keys) = 0 then
      raise exception 'select at least one department' using errcode = '22023';
    end if;

    if exists (
      select 1
      from unnest(department_keys) as key(value)
      where key.value <> '__no_department__'
        and key.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
      raise exception 'invalid department key' using errcode = '22023';
    end if;

    select coalesce(array_agg(key.value::uuid), '{}'::uuid[])
      into selected_department_ids
    from unnest(department_keys) as key(value)
    where key.value <> '__no_department__';

    include_no_department := '__no_department__' = any(department_keys);
  end if;

  if exists (
    select 1
    from unnest(selected_department_ids) as selected_department(id)
    left join public.departments department
      on department.id = selected_department.id
     and department.workspace_id = target_workspace_id
     and department.archived_at is null
    where department.id is null
  ) then
    raise exception 'schedule template department not found' using errcode = 'P0002';
  end if;

  select *
    into target_session
  from public.schedule_edit_sessions session
  where session.id = target_session_id
    and session.workspace_id = target_workspace_id
  for update;

  if target_session.id is null or target_session.holder_user_id <> actor_user_id then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;

  if target_session.status <> 'active' or target_session.expires_at <= now() then
    raise exception 'edit lease expired' using errcode = '40001';
  end if;

  if target_session.revision <> expected_session_revision then
    raise exception 'session revision stale' using errcode = '40001';
  end if;

  select *
    into template_row
  from public.schedule_templates template
  where template.id = target_template_id
    and template.workspace_id = target_workspace_id;

  if template_row.id is null then
    raise exception 'schedule template not found' using errcode = 'P0002';
  end if;
  -- Shifts at a deleted location are neither checked nor written (Q-C).
  live_locations := public.live_location_ids(target_workspace_id, array(
    select distinct s.location_id from public.schedule_template_shifts s where s.template_id = template_row.id));

  if exists (
    select 1
    from public.schedule_template_shifts template_shift
    left join public.locations location
      on location.id = template_shift.location_id
     and location.workspace_id = template_shift.workspace_id
     and location.archived_at is null
    left join public.jobs job
      on job.id = template_shift.job_id
     and job.workspace_id = template_shift.workspace_id
     and job.archived_at is null
    left join public.shift_types shift_type
      on shift_type.id = template_shift.shift_type_id
     and shift_type.workspace_id = template_shift.workspace_id
     and shift_type.archived_at is null
    where template_shift.template_id = template_row.id
      and template_shift.location_id = any (live_locations)
      and (
        location.id is null
        or job.id is null
        or (template_shift.shift_type_id is not null and shift_type.id is null)
        or not template_shift.location_id = any (template_scope)
      )
  ) then
    raise exception 'schedule template references unavailable schedule definitions' using errcode = '23503';
  end if;

  if apply_mode = 'overwrite' then
    delete from public.schedule_edit_session_shifts session_shift
    using public.jobs job
    where session_shift.session_id = target_session.id
      and session_shift.workspace_id = target_workspace_id
      and job.id = session_shift.job_id
      and job.workspace_id = session_shift.workspace_id
      and (
        department_keys is null
        or job.department_id = any(selected_department_ids)
        or (job.department_id is null and include_no_department)
      );
  end if;

  for source in
    select template_shift.*
    from public.schedule_template_shifts template_shift
    join public.jobs job
      on job.id = template_shift.job_id
     and job.workspace_id = template_shift.workspace_id
    where template_shift.template_id = template_row.id
      and template_shift.workspace_id = target_workspace_id
      and template_shift.location_id = any (live_locations)
      and (
        department_keys is null
        or job.department_id = any(selected_department_ids)
        or (job.department_id is null and include_no_department)
      )
    order by template_shift.day_offset, template_shift.start_time, template_shift.id
  loop
    target_date := target_session.week_start + source.day_offset;
    target_end_date := target_date + case when source.end_time <= source.start_time then 1 else 0 end;
    chosen_employee := source.employee_id;

    if chosen_employee is not null and (
      not exists (
        select 1
        from public.employee_profiles employee
        join public.employee_location_assignments location_assignment
          on location_assignment.employee_id = employee.id
         and location_assignment.workspace_id = employee.workspace_id
         and location_assignment.location_id = source.location_id
         and location_assignment.ended_at is null
        join public.employee_job_assignments job_assignment
          on job_assignment.employee_id = employee.id
         and job_assignment.workspace_id = employee.workspace_id
         and job_assignment.job_id = source.job_id
         and job_assignment.ended_at is null
        where employee.id = chosen_employee
          and employee.workspace_id = target_workspace_id
          and employee.archived_at is null
      )
      or exists (
        select 1
        from public.schedule_edit_session_shifts existing_shift
        where existing_shift.session_id = target_session.id
          and existing_shift.employee_id = chosen_employee
          and tsrange(
            existing_shift.scheduled_date + existing_shift.start_time,
            existing_shift.scheduled_date + existing_shift.end_time + case
              when existing_shift.end_time <= existing_shift.start_time then interval '1 day'
              else interval '0'
            end,
            '[)'
          ) && tsrange(target_date + source.start_time, target_end_date + source.end_time, '[)')
      )
    ) then
      chosen_employee := null;
      converted_count := converted_count + 1;
    end if;

    insert into public.schedule_edit_session_shifts(id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, hide_time_on_badge, label_ids, label_names, note)
    values(gen_random_uuid(), target_workspace_id, target_session.id, source.location_id, chosen_employee, source.job_id, source.shift_type_id, target_date, source.start_time, source.end_time, source.time_basis, source.time_snapshot, source.time_timezone, source.hide_time_on_badge, coalesce(source.label_ids, '{}'::uuid[]), coalesce(source.label_names, '{}'::text[]), source.note);
    applied_count := applied_count + 1;
  end loop;

  update public.schedule_edit_sessions
     set revision = revision + 1,
         dirty = true,
         last_heartbeat = now(),
         expires_at = now() + interval '4 minutes'
   where id = target_session.id;

  insert into public.schedule_template_events(
    workspace_id,
    template_id,
    template_name,
    action,
    actor_user_id,
    session_id,
    detail
  )
  values(
    target_workspace_id,
    template_row.id,
    template_row.name,
    'applied',
    actor_user_id,
    target_session.id,
    jsonb_build_object(
      'mode', apply_mode,
      'department_keys', to_jsonb(department_keys),
      'applied_shift_count', applied_count,
      'converted_open_count', converted_count
    )
  );

  return jsonb_build_object(
    'status', 'applied',
    'mode', apply_mode,
    'applied_shift_count', applied_count,
    'converted_open_count', converted_count,
    'session', public.get_schedule_edit_session_service(
      actor_user_id,
      target_workspace_id,
      target_session.id
    )
  );
end;
$function$

;

CREATE OR REPLACE FUNCTION public.list_schedule_export_schedules_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare export_scope uuid[]; org_wide boolean;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.export',
    target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.export'));
  export_scope := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.export');
  org_wide := app_private.authz_reason(actor_user_id, target_workspace_id, 'schedule.export', '{}'::uuid[]) is null;
  return (
    select jsonb_build_object(
      'schedules',
      coalesce(
        jsonb_agg(
          public.schedule_export_schedule_json(s, p.name)
          order by lower(s.name), s.id
        ),
        '[]'::jsonb
      )
    )
    from public.scheduled_schedule_exports s
    left join public.schedule_export_presets p
      on p.id = s.preset_id
     and p.workspace_id = s.workspace_id
    where s.workspace_id = target_workspace_id
      and (org_wide or (cardinality(public.live_location_ids(target_workspace_id, s.location_ids)) > 0
        and public.live_location_ids(target_workspace_id, s.location_ids) <@ export_scope))
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_schedule_export_events_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare export_scope uuid[]; org_wide boolean;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.export',
    target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.export'));
  export_scope := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.export');
  org_wide := app_private.authz_reason(actor_user_id, target_workspace_id, 'schedule.export', '{}'::uuid[]) is null;
  return (
    select jsonb_build_object(
      'events',
      coalesce(
        jsonb_agg(public.schedule_export_event_json(event_row) order by event_row.created_at desc, event_row.id desc),
        '[]'::jsonb
      )
    )
    from (
      select event.*
        from public.schedule_export_events event
        cross join lateral (
          -- The locations it was for; null when the list is missing or holds
          -- anything that is not a location id.
          select case
            when jsonb_typeof(event.params -> 'location_ids') = 'array'
              and not exists (
                select 1 from jsonb_array_elements(event.params -> 'location_ids') item
                where jsonb_typeof(item) <> 'string'
                   or item #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              )
            then array(select (item #>> '{}')::uuid from jsonb_array_elements(event.params -> 'location_ids') item)
          end as ids
        ) places
       where event.workspace_id = target_workspace_id
         and (org_wide or (cardinality(public.live_location_ids(target_workspace_id, places.ids)) > 0
           and public.live_location_ids(target_workspace_id, places.ids) <@ export_scope))
       order by event.created_at desc, event.id desc
       limit 10
    ) event_row
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_schedule_export_schedule_service(actor_user_id uuid, target_workspace_id uuid, target_schedule_id uuid, target_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  existing public.scheduled_schedule_exports%rowtype;
  updated public.scheduled_schedule_exports%rowtype;
  next_location_ids uuid[];
  next_preset_id uuid;
  preset_name text;
  reset_failure_state boolean := false;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.export',
    target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.export'));

  select * into existing
    from public.scheduled_schedule_exports s
   where s.id = target_schedule_id
     and s.workspace_id = target_workspace_id
     and s.created_by = actor_user_id
   for update;

  if not found then
    raise exception 'scheduled export not found' using errcode='P0002';
  end if;

  -- The locations it will export once saved.
  next_location_ids := case
    when target_payload ? 'location_ids' then
      array(select jsonb_array_elements_text(target_payload->'location_ids')::uuid)
    else existing.location_ids
  end;
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.export',
    target_locations => public.live_location_ids(target_workspace_id, next_location_ids));

  next_preset_id := coalesce((target_payload->>'preset_id')::uuid, existing.preset_id);
  if not exists (
    select 1
      from public.schedule_export_presets p
     where p.id = next_preset_id
       and p.workspace_id = target_workspace_id
       and p.created_by = actor_user_id
  ) then
    raise exception 'schedule export preset not found' using errcode='P0002';
  end if;

  reset_failure_state :=
    target_payload ? 'enabled' and (target_payload->>'enabled')::boolean = true;

  update public.scheduled_schedule_exports
     set preset_id = next_preset_id,
         name = coalesce(btrim(target_payload->>'name'), existing.name),
         recipients = coalesce(target_payload->'recipients', existing.recipients),
         location_ids = next_location_ids,
         day_of_week = coalesce((target_payload->>'day_of_week')::smallint, existing.day_of_week),
         send_hour = coalesce((target_payload->>'send_hour')::smallint, existing.send_hour),
         timezone = coalesce(btrim(target_payload->>'timezone'), existing.timezone),
         enabled = coalesce((target_payload->>'enabled')::boolean, existing.enabled),
         updated_by = actor_user_id,
         updated_at = now(),
         consecutive_failures = case when reset_failure_state then 0 else consecutive_failures end,
         last_error = case when reset_failure_state then null else last_error end,
         auto_disabled_at = case when reset_failure_state then null else auto_disabled_at end
   where id = target_schedule_id
     and workspace_id = target_workspace_id
   returning * into updated;

  select p.name into preset_name
    from public.schedule_export_presets p
   where p.id = updated.preset_id;

  return public.schedule_export_schedule_json(updated, preset_name);
exception
  when unique_violation then
    raise exception 'scheduled export name conflict' using errcode='23505';
end;
$function$
;
