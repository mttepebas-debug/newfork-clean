-- FB-6.1 step .2: Schedule's entry points ask the authorization core.
--
-- 33 functions stop asking the three old Schedule helpers
-- (schedule_actor_can_manage_service, schedule_actor_can_publish_service,
-- schedule_actor_has_capability_service) and ask app_private.authorize() /
-- scope_set() instead; a no is 42501 with an authz.* hint. Signatures and what
-- each returns stay the same. The 34th, taking over somebody else's edit, is
-- dropped with the other overload nobody calls (sections 2 and 3). The helpers stay: 24 callers remain, 14 fold in
-- FB-6.1 .4 and 10 belong to time off (FB-6.3) and shift exchanges (FB-6.4);
-- the last of those slices drops them (user decision K-1, 2026-09-25).
-- supabase/tests/schedule_asks_the_core.test.sql pins who still asks them.
--
-- How the old questions translate (docs/plan/research/fb61-2a-niyet-listesi-2026-09-25.md):
--   manage / 'schedule.manage'          -> schedule.edit      (a set of locations)
--   publish / 'schedule.publish'        -> schedule.publish   (one location)
--   'schedule.export'                   -> schedule.export    (a set)
--   'schedule.templates.manage'         -> schedule.templates (a set)
--   'schedule.templates.read'           -> schedule.templates.read (new, a set)
--   'schedule.time_off_requests.read'   -> requests.read      (a set)
--   'schedule.shift_change_requests.*'  -> exchange.read / exchange.approve (one location)
--   'availability.read' / '.manage'     -> availability.team_read / availability.team_write (new; a person)
--   'employees.manage' (a person)       -> employee.save
--   'settings.schedule_rules.manage'    -> settings.scheduling.write
--   'schedule.conflict_rules.manage'    -> settings.conflict_rules.write (new)
-- A blank location asked "anywhere" before. The core never reads a blank as
-- everywhere, so:
--   * a thing with a location asks at that location (or every one of them);
--   * a thing with no location of its own asks "somewhere", for a set action:
--       app_private.authorize(actor, w, act, target_locations => app_private.scope_set(actor, w, act))
--     owner and admin pass ('{}' is the whole organization), a manager passes
--     with one location in reach, a manager with none is out_of_scope;
--   * the same question for a one-place or person action:
--       if cardinality(app_private.scope_set(actor, w, act)) = 0
--          and (app_private.authz_reason(actor, w, act) is distinct from 'out_of_scope'
--               or exists (a live location in w)) then
--         perform app_private.authorize(actor, w, act);  -- no target: raises the reason
--       end if;
--     a workspace with no live location reads as empty to whoever would reach
--     it, rather than refusing the owner;
--   * a list filters by scope_set(); a record with several locations shows to a
--     manager when all of them are in reach, or when one is and the product
--     says so (the drafts list, B1); owners and admins are asked once with
--     authz_reason(actor, w, act, '{}') is null.
--   * a row that names somebody else (an override's publisher) asks the core
--     about that person: authz_reason(person, ...) is null.

-- 1. Three actions the core did not have -------------------------------------------------
-- Conflict handling (N3) has its own permission; folding it into
-- settings.scheduling.write would drop that permission without a word. Template
-- reads and a manager's hand on a person's availability (N4) keep the
-- permissions they have today.
insert into app_private.authz_actions (key, scope_class, effect, permission_key) values
  ('settings.conflict_rules.write', 'org', 'write', 'schedule.conflict_rules.manage'),
  ('schedule.templates.read', 'set', 'read', 'schedule.templates.read');
-- A manager's private availability note about a person follows the record
-- edit rule (REUSE "Müsaitlik notu", user decision 2026-09-26): only for
-- somebody ranked below, never for oneself; an admin not for the owner.
insert into app_private.authz_actions (key, scope_class, effect, permission_key, no_self, rank_below) values
  ('availability.team_write', 'person', 'write', 'availability.manage', true, true);

-- 2. The four-argument document conflicts list: nothing but a test called it; the
-- API asks the seven-argument one with the locations it publishes (N17).
drop function public.list_schedule_draft_document_conflicts_service(uuid, uuid, uuid, date);

-- 3. Nobody takes over somebody else's open edit, the owner and admins included;
-- the lock lapses after four minutes of no activity (user decision 2026-09-25,
-- REUSE "Plan kilidi"). The API route and the web call go with nf-backend's step.
drop function public.takeover_schedule_edit_session_service(uuid, uuid, uuid);

-- 4. The entry points ------------------------------------------------------------------------

-- Moving a pending shift is asked at the location it leaves and the one it goes to (N5).
CREATE OR REPLACE FUNCTION public.add_schedule_pending_op_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, target_op_type text, target_shift_id uuid DEFAULT NULL::uuid, target_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_session public.schedule_edit_sessions%rowtype;
  existing_shift public.schedule_edit_session_shifts%rowtype;
  created_id uuid := gen_random_uuid();
  next_location_id uuid;
  next_employee_id uuid;
  next_job_id uuid;
  next_shift_type_id uuid;
  next_scheduled_date date;
  next_start_time time;
  next_end_time time;
  next_unpaid_break_minutes integer;
  next_note text;
begin
 perform public.availability_lock_workspace(target_workspace_id);
  if target_op_type not in ('create', 'update', 'delete') then
    raise exception 'invalid pending op type' using errcode='22023';
  end if;

  select * into target_session
    from public.schedule_edit_sessions session
   where session.id = target_session_id
     and session.workspace_id = target_workspace_id
   for update;

  if target_session.id is null or target_session.holder_user_id <> actor_user_id then
    raise exception 'edit session not found' using errcode='P0002';
  end if;
  if target_session.status <> 'active' or target_session.expires_at <= now() then
    raise exception 'edit lease expired' using errcode='40001';
  end if;

  if target_op_type in ('update', 'delete') then
    select * into existing_shift
      from public.schedule_edit_session_shifts shift
     where shift.session_id = target_session_id
       and shift.id = target_shift_id
     for update;
    if existing_shift.id is null then
      raise exception 'shift not found' using errcode='P0002';
    end if;
  end if;

  next_location_id := coalesce(
    nullif(target_payload->>'location_id', '')::uuid,
    existing_shift.location_id
  );
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit',
    target_locations => case when next_location_id is not null then array(
      select distinct place from unnest(array[existing_shift.location_id, next_location_id]) place where place is not null
    ) end);

  if target_op_type in ('create','update') then
    target_payload:=public.normalize_schedule_time_source(target_workspace_id,case when target_payload ? 'time_basis' then coalesce(to_jsonb(existing_shift),'{}'::jsonb)||target_payload else (coalesce(to_jsonb(existing_shift),'{}'::jsonb)||target_payload)-'time_basis' end,case when existing_shift.id is not null then to_jsonb(existing_shift) else null end);
  end if;
  if target_op_type = 'create' then
    insert into public.schedule_edit_session_shifts(id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, note, pending_op_type, locked, hide_time_on_badge)
    values (created_id, target_workspace_id, target_session_id, next_location_id, nullif(target_payload->>'employee_id', '')::uuid, nullif(target_payload->>'job_id', '')::uuid, nullif(target_payload->>'shift_type_id', '')::uuid, (target_payload->>'scheduled_date')::date, nullif(target_payload->>'start_time','')::time, nullif(target_payload->>'end_time','')::time, target_payload->>'time_basis', target_payload->'time_snapshot', target_payload->>'time_timezone', coalesce((target_payload->>'unpaid_break_minutes')::integer, 0), coalesce(target_payload->>'note', ''), 'create', false, coalesce((target_payload->>'hide_time_on_badge')::boolean,false));
  else
    if target_op_type = 'delete' then
      update public.schedule_edit_session_shifts
         set pending_op_type = 'delete',
             locked = true,
             revision = revision + 1,
             updated_at = now()
       where session_id = target_session_id
         and id = existing_shift.id;
    else
      next_employee_id := coalesce(nullif(target_payload->>'employee_id', '')::uuid, existing_shift.employee_id);
      next_job_id := coalesce(nullif(target_payload->>'job_id', '')::uuid, existing_shift.job_id);
      next_shift_type_id := coalesce(nullif(target_payload->>'shift_type_id', '')::uuid, existing_shift.shift_type_id);
      next_scheduled_date := coalesce((target_payload->>'scheduled_date')::date, existing_shift.scheduled_date);
      next_start_time := nullif(target_payload->>'start_time','')::time;
      next_end_time := nullif(target_payload->>'end_time','')::time;
      next_unpaid_break_minutes := coalesce((target_payload->>'unpaid_break_minutes')::integer, existing_shift.unpaid_break_minutes, 0);
      next_note := coalesce(target_payload->>'note', existing_shift.note, '');

      update public.schedule_edit_session_shifts
         set location_id = next_location_id,
             employee_id = next_employee_id,
             job_id = next_job_id,
             shift_type_id = next_shift_type_id,
             scheduled_date = next_scheduled_date,
             start_time = next_start_time,
             end_time = next_end_time, time_basis=target_payload->>'time_basis', time_snapshot=target_payload->'time_snapshot', time_timezone=target_payload->>'time_timezone', hide_time_on_badge=coalesce((target_payload->>'hide_time_on_badge')::boolean,false),
             unpaid_break_minutes = next_unpaid_break_minutes,
             note = next_note,
             pending_op_type = 'update',
             locked = false,
             revision = revision + 1,
             updated_at = now()
       where session_id = target_session_id
         and id = existing_shift.id;
    end if;
    created_id := existing_shift.id;
  end if;

  update public.schedule_edit_sessions
     set revision = revision + 1,
         dirty = true,
         last_heartbeat = now(),
         expires_at = now() + interval '4 minutes'
   where id = target_session_id;

  return jsonb_build_object('status', 'ok', 'op_id', created_id);
end;
$function$
;

-- Templates have no location of their own: "somewhere" first, then every
-- template shift's location must be in reach.
CREATE OR REPLACE FUNCTION public.apply_schedule_template_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, expected_session_revision integer, target_template_id uuid, apply_mode text, department_keys text[])
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
begin
 perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.templates',
   target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.templates'));
 template_scope := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.templates');
 perform public.availability_lock_workspace(target_workspace_id);
  if department_keys is null then
    return public.apply_schedule_template_service(
      actor_user_id,
      target_workspace_id,
      target_session_id,
      expected_session_revision,
      target_template_id,
      apply_mode
    );
  end if;

  if apply_mode not in ('merge', 'overwrite') then
    raise exception 'invalid template apply mode' using errcode = '22023';
  end if;

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
        job.department_id = any(selected_department_ids)
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
      and (
        job.department_id = any(selected_department_ids)
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

-- A shift with no location is not everywhere.
CREATE OR REPLACE FUNCTION public.assess_weekly_schedule_assignment_service(actor uuid, w uuid, shift jsonb, target_shift_id uuid DEFAULT NULL::uuid, target_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare previous jsonb; normalized jsonb; identified jsonb; a jsonb; current_a jsonb; loc uuid:=(shift->>'location_id')::uuid;
begin
 perform app_private.authorize(actor, w, 'schedule.edit', target_locations => array[loc]);
 if target_session_id is not null then
  if not exists(select 1 from public.schedule_edit_sessions where workspace_id=w and id=target_session_id and holder_user_id=actor and status='active' and expires_at>now()) then
   raise exception 'Edit session not found or expired' using errcode='42501'; end if;
  select to_jsonb(s) into previous from public.schedule_edit_session_shifts s where workspace_id=w and session_id=target_session_id and id=target_shift_id;
  if target_shift_id is not null and previous is null then raise exception 'Shift no longer exists in this edit session' using errcode='P0002'; end if;
 end if;
 if nullif(shift->>'employee_id','') is not null and not exists(select 1 from public.employee_location_assignments where workspace_id=w and employee_id=(shift->>'employee_id')::uuid and location_id=loc and ended_at is null) then
  raise exception 'Employee is not assigned to this location' using errcode='42501'; end if;
 normalized:=(public.normalize_schedule_time_source(w,shift,previous)-'id'-'source_shift_id')
   ||jsonb_build_object('session_id',target_session_id,'_exclude_shift_id',target_shift_id);
 a:=public.assess_weekly_shift_availability(w,(shift->>'employee_id')::uuid,normalized);
 identified:=normalized||jsonb_build_object('id',target_shift_id);
 if target_shift_id is not null and a->>'conflict_severity'<>'block' and public.schedule_availability_prior_publication(w,identified) is not null then
  a:=a||jsonb_build_object('operation','allowed','reasons','[]'::jsonb,'responsibility_retained',true);
 elsif previous is not null and a->>'operation'='warning_requires_override' then
  current_a:=public.assess_weekly_shift_availability(w,(shift->>'employee_id')::uuid,identified);
  if public.schedule_availability_override(w,identified,current_a) is not null then
   a:=a||jsonb_build_object('override_recorded',true);
  end if;
 end if;
 return a||jsonb_build_object('can_override',true);
end; $function$
;

-- A shift out of reach does not match, as before (the request is stale).
CREATE OR REPLACE FUNCTION public.bulk_delete_schedule_edit_shifts_service(actor_user_id uuid, target_workspace_id uuid, target_shift_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_session public.schedule_edit_sessions%rowtype;
  requested_count integer;
  matched_count integer;
  changed_count integer;
  edit_scope uuid[] := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.edit');
begin
 perform public.availability_lock_workspace(target_workspace_id);
  select count(distinct id) into requested_count
  from unnest(coalesce(target_shift_ids, array[]::uuid[])) as input(id);
  if requested_count < 1 or requested_count > 100 then
    raise exception 'valid shift ids required' using errcode = '22023';
  end if;

  select session.* into target_session
  from public.schedule_edit_sessions session
  where session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id
    and session.status = 'active'
    and session.expires_at > now()
    and exists (
      select 1
      from public.schedule_edit_session_shifts shift
      where shift.session_id = session.id
        and shift.id = any(target_shift_ids)
    )
  order by session.last_heartbeat desc
  limit 1
  for update;

  if target_session.id is null then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;

  select count(distinct shift.id) into matched_count
  from public.schedule_edit_session_shifts shift
  where shift.session_id = target_session.id
    and shift.id = any(target_shift_ids)
    and shift.location_id = any (edit_scope);

  if matched_count <> requested_count then
    raise exception 'shift revision stale' using errcode = '40001';
  end if;

  update public.schedule_availability_overrides set revoked_at=now() where workspace_id=target_workspace_id and shift_id=any(target_shift_ids) and revoked_at is null;
   with draft_deletes as (
    delete from public.schedule_edit_session_shifts shift
    where shift.session_id = target_session.id
      and shift.id = any(target_shift_ids)
      and shift.source_published_shift_id is null
      and not shift.locked
    returning shift.id
  ), live_marks as (
    update public.schedule_edit_session_shifts shift
    set pending_op_type = 'delete',
        locked = true,
        revision = revision + 1,
        updated_at = now()
    where shift.session_id = target_session.id
      and shift.id = any(target_shift_ids)
      and (shift.source_published_shift_id is not null or shift.locked)
      and shift.pending_op_type is distinct from 'delete'
    returning shift.id
  )
  select count(*) into changed_count
  from (
    select id from draft_deletes
    union all
    select id from live_marks
  ) changed;

  update public.schedule_edit_sessions
  set revision = revision + 1,
      dirty = true,
      last_heartbeat = now(),
      expires_at = now() + interval '4 minutes'
  where id = target_session.id;

  return jsonb_build_object(
    'deleted_count', changed_count,
    'session', public.get_schedule_edit_session_service(
      actor_user_id,
      target_workspace_id,
      target_session.id
    )
  );
end;
$function$
;

-- A preset is the person's own and has no location: "somewhere".
CREATE OR REPLACE FUNCTION public.create_schedule_export_preset_service(actor_user_id uuid, target_workspace_id uuid, target_name text, target_settings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.schedule_export_presets%rowtype;
begin
 perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.export',
   target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.export'));
 insert into public.schedule_export_presets(workspace_id,name,settings,created_by,updated_by) values(target_workspace_id,btrim(target_name),target_settings,actor_user_id,actor_user_id) returning * into p;
 return jsonb_build_object('id',p.id,'workspace_id',p.workspace_id,'name',p.name,'settings',p.settings,'created_by',p.created_by,'updated_at',p.updated_at);
exception when unique_violation then raise exception 'schedule export preset name conflict' using errcode='23505'; end; $function$
;

-- Every pasted shift's location must be in reach; one without a location is not.
CREATE OR REPLACE FUNCTION public.create_schedule_shifts_batch_service(actor uuid, w uuid, sid uuid, expected_revision integer, shifts jsonb, request_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare session public.schedule_edit_sessions%rowtype; receipt public.schedule_shift_batch_commands%rowtype;
 item jsonb; result jsonb; next_revision integer;
begin
 if jsonb_typeof(shifts) is distinct from 'array' then
  raise exception 'Choose 1 to 200 shifts' using errcode='22023'; end if;
 if jsonb_array_length(shifts) not between 1 and 200 or request_key is null or expected_revision is null
  or exists(select 1 from jsonb_array_elements(shifts) v where jsonb_typeof(v) is distinct from 'object') then
  raise exception 'Valid shifts, revision and request key required' using errcode='22023'; end if;
 perform public.availability_lock_workspace(w);
 select * into session from public.schedule_edit_sessions where workspace_id=w and id=sid for update;
 if session.id is null or session.holder_user_id is distinct from actor then
  raise exception 'Schedule manage access required' using errcode='42501'; end if;
 perform app_private.authorize(actor, w, 'schedule.edit', target_locations => array(
  select distinct nullif(v->>'location_id','')::uuid from jsonb_array_elements(shifts) v));
 if session.status<>'active' or session.expires_at<=now() then
  raise exception 'Schedule editing expired; reopen the schedule' using errcode='40001'; end if;
 select * into receipt from public.schedule_shift_batch_commands c
  where c.workspace_id=w and c.actor_user_id=actor and c.idempotency_key=request_key;
 if found then
  if receipt.session_id is distinct from sid or receipt.expected_revision is distinct from expected_revision or receipt.shifts is distinct from shifts then
   raise exception 'Request key already used for a different batch' using errcode='40001'; end if;
  return public.get_schedule_edit_session_service(actor,w,sid);
 end if;
 if session.revision is distinct from expected_revision then
  raise exception 'Schedule editing changed; reload before pasting' using errcode='40001'; end if;
 next_revision:=session.revision;
 for item in select value from jsonb_array_elements(shifts) loop
  result:=public.mutate_schedule_edit_shift_service(actor,w,sid,next_revision,'create',gen_random_uuid(),null,item,gen_random_uuid());
  next_revision:=(result->>'revision')::integer;
 end loop;
 insert into public.schedule_shift_batch_commands(workspace_id,actor_user_id,idempotency_key,session_id,expected_revision,shifts)
  values(w,actor,request_key,sid,expected_revision,shifts);
 return result;
end; $function$
;

-- Deleting one's own scheduled export only narrows what goes out: "somewhere".
CREATE OR REPLACE FUNCTION public.delete_schedule_export_schedule_service(actor_user_id uuid, target_workspace_id uuid, target_schedule_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.export',
    target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.export'));

  delete from public.scheduled_schedule_exports
   where id = target_schedule_id
     and workspace_id = target_workspace_id
     and created_by = actor_user_id;

  if not found then
    raise exception 'scheduled export not found' using errcode='P0002';
  end if;

  return jsonb_build_object('status', 'deleted', 'schedule_id', target_schedule_id);
end;
$function$
;

-- Publication history of the locations the person may publish.
CREATE OR REPLACE FUNCTION public.get_schedule_publication_history_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'week_start', target_week_start,
    'publications', coalesce(jsonb_agg(jsonb_build_object(
      'id', publication.id,
      'location_id', publication.location_id,
      'location_name', location.name,
      'version', publication.version_number,
      'status', publication.status,
      'source_draft_id', publication.source_draft_id,
      'source_draft_revision', publication.source_draft_revision,
      'shift_count', (select count(*) from public.schedule_published_shifts shift where shift.publication_id = publication.id),
      'published_at', publication.published_at,
      'unpublished_at', publication.unpublished_at,
      'superseded_by', publication.superseded_by
    ) order by location.sort_order, publication.version_number desc) filter (where publication.id is not null), '[]'::jsonb)
  )
  from public.schedule_location_publications publication
  join public.locations location on location.id = publication.location_id
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_week_start
    and publication.location_id = any ((select app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.publish'))::uuid[]);
$function$
;

-- Status of the locations the person may read and edit.
CREATE OR REPLACE FUNCTION public.get_schedule_publication_status_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'week_start', target_week_start,
    'week_end', target_week_start + 6,
    'week_start_day', coalesce(settings.week_start_day, 'monday'::public.schedule_week_start),
    'schedule_deadline_day', coalesce(settings.schedule_deadline_day, 'sunday'::public.schedule_deadline_day),
    'is_anchor_only', false,
    'locations', coalesce(jsonb_agg(jsonb_build_object(
      'id', location.id,
      'name', location.name,
      'color', null,
      'timezone', location.timezone,
      'status', case
        when publication.id is not null and published_counts.shift_count > 0 then 'published'
        else 'unpublished'
      end,
      'reason', case
        when publication.id is not null and published_counts.shift_count > 0 then 'active_publication_and_shifts'
        when publication.id is not null then 'no_published_shifts'
        else 'missing_publication'
      end,
      'publication_includes_location', publication.id is not null,
      'published_shift_count', coalesce(published_counts.shift_count, 0),
      'draft_shift_count', coalesce(draft_counts.shift_count, 0),
      'published_at', publication.published_at,
      'published_by_name', null
    ) order by location.sort_order, location.name), '[]'::jsonb)
  )
  from public.workspace_scheduling_settings settings
  right join public.locations location
    on location.workspace_id = target_workspace_id
   and location.archived_at is null
  left join public.schedule_location_publications publication
    on publication.workspace_id = target_workspace_id
   and publication.location_id = location.id
   and publication.week_start = target_week_start
   and publication.status = 'current'
  left join lateral (
    select count(*)::integer as shift_count
      from public.schedule_published_shifts shift
     where shift.publication_id = publication.id
  ) published_counts on true
  left join lateral (
    select count(*)::integer as shift_count
      from public.schedule_draft_shifts shift
      join public.schedule_drafts draft
        on draft.id = shift.draft_id
       and draft.workspace_id = shift.workspace_id
     where shift.workspace_id = target_workspace_id
       and shift.location_id = location.id
       and draft.week_start = target_week_start
       and draft.archived_at is null
  ) draft_counts on true
  where settings.workspace_id = target_workspace_id
    and location.id = any ((select app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.read'))::uuid[])
    and location.id = any ((select app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.edit'))::uuid[])
  group by settings.week_start_day, settings.schedule_deadline_day;
$function$
;

-- The requests screen reads time off where requests.read reaches and shift
-- changes where exchange.read does.
CREATE OR REPLACE FUNCTION public.get_schedule_requests_service(actor_user_id uuid, target_workspace_id uuid, target_time_off_queue text DEFAULT 'needs_review'::text, target_location_id uuid DEFAULT NULL::uuid, target_search text DEFAULT ''::text, target_time_off_cursor timestamp with time zone DEFAULT NULL::timestamp with time zone, target_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare can_time_off boolean; can_shift boolean; time_rows jsonb; locations jsonb;
 time_count integer; time_cursor timestamptz; time_scope uuid[]; shift_scope uuid[];
begin
 if target_time_off_queue not in('needs_review','closed') or target_limit not between 1 and 100 then raise exception 'invalid schedule request query' using errcode='22023'; end if;
 time_scope:=app_private.scope_set(actor_user_id,target_workspace_id,'requests.read');
 shift_scope:=app_private.scope_set(actor_user_id,target_workspace_id,'exchange.read');
 can_time_off:=cardinality(time_scope)>0;
 can_shift:=cardinality(shift_scope)>0;
 -- Neither list anywhere: time off requests are asked "somewhere" and say why not.
 if not can_time_off and not can_shift then
  perform app_private.authorize(actor_user_id, target_workspace_id, 'requests.read',
    target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'requests.read'));
 end if;
 if target_location_id is not null then
  if can_time_off then perform app_private.authorize(actor_user_id,target_workspace_id,'requests.read',array[target_location_id]); end if;
  if can_shift then perform app_private.authorize(actor_user_id,target_workspace_id,'exchange.read',array[target_location_id]); end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by l.name),'[]') into locations from public.locations l where l.workspace_id=target_workspace_id and l.archived_at is null and (l.id=any(time_scope) or l.id=any(shift_scope));
 select count(*) into time_count from public.schedule_time_off_requests r where can_time_off and r.workspace_id=target_workspace_id and r.status='pending' and r.location_id=any(time_scope);
 with filtered as(select r.* from public.schedule_time_off_requests r join public.employee_profiles e on e.id=r.employee_id join public.locations l on l.id=r.location_id where can_time_off and r.workspace_id=target_workspace_id and r.location_id=any(time_scope) and (target_location_id is null or r.location_id=target_location_id) and ((target_time_off_queue='needs_review' and r.status='pending') or (target_time_off_queue='closed' and r.status<>'pending')) and (target_time_off_cursor is null or r.created_at<target_time_off_cursor) and (btrim(target_search)='' or concat_ws(' ',e.first_name,e.last_name,e.preferred_name,r.reason) ilike '%'||btrim(target_search)||'%') order by r.created_at desc,r.id limit target_limit+1), page as(select * from filtered limit target_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'employee_id',r.employee_id,'employee_name',concat_ws(' ',coalesce(nullif(e.preferred_name,''),e.first_name),e.last_name),'location_id',r.location_id,'location_name',l.name,'request_type',r.request_type,'reason',r.reason,'cancellation',public.time_off_cancellation_context(target_workspace_id,r.id),'status',r.status,'start_date',(select min(s.segment_date) from public.schedule_time_off_segments s where s.request_id=r.id),'end_date',(select max(s.segment_date) from public.schedule_time_off_segments s where s.request_id=r.id),'revision',r.revision,'viewed_at',r.viewed_at,'created_at',r.created_at,'conflict_count',public.time_off_request_assignment_count(target_workspace_id,r.id),'segments',public.time_off_request_periods(r.id,target_workspace_id),'events',coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'action',ev.action,'actor_name',coalesce(nullif(up.display_name,''),'Team member'),'note',ev.note,'created_at',ev.created_at,'released_assignments',public.time_off_event_released_assignments(get_schedule_requests_service.actor_user_id,target_workspace_id,ev.id)) order by ev.created_at) from public.schedule_time_off_events ev left join public.user_profiles up on up.user_id=ev.actor_user_id where ev.request_id=r.id),'[]')) order by r.created_at desc),'[]') into time_rows from page r join public.employee_profiles e on e.id=r.employee_id join public.locations l on l.id=r.location_id;
 with filtered as(select r.created_at from public.schedule_time_off_requests r join public.employee_profiles e on e.id=r.employee_id where can_time_off and r.workspace_id=target_workspace_id and r.location_id=any(time_scope) and (target_location_id is null or r.location_id=target_location_id) and ((target_time_off_queue='needs_review' and r.status='pending') or (target_time_off_queue='closed' and r.status<>'pending')) and (target_time_off_cursor is null or r.created_at<target_time_off_cursor) and (btrim(target_search)='' or concat_ws(' ',e.first_name,e.last_name,e.preferred_name,r.reason) ilike '%'||btrim(target_search)||'%') order by r.created_at desc,r.id limit target_limit+1) select case when count(*)>target_limit then min(created_at) else null end into time_cursor from filtered;
 return jsonb_build_object('workspace_id',target_workspace_id,'time_format',(select time_format from public.workspace_scheduling_settings where workspace_id=target_workspace_id),'locations',locations,'time_off_pending_count',time_count,'time_off_next_cursor',time_cursor,'time_off_requests',time_rows);
end; $function$
;

-- A template shows when every one of its shifts' locations is in reach; one
-- with none, or with a closed location, only to owners and admins.
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
   'shift_count',(select count(*) from public.schedule_template_shifts s where s.template_id=t.id),
   'open_slot_count',(select count(*) from public.schedule_template_shifts s where s.template_id=t.id and s.employee_id is null),
   'created_by_name',coalesce(u.display_name,'Manager'),'updated_at',t.updated_at),
   'shifts',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'location_id',s.location_id,'employee_id',s.employee_id,'job_id',s.job_id,
     'shift_type_id',s.shift_type_id,'day_offset',s.day_offset,'time_basis',s.time_basis,'time_snapshot',s.time_snapshot,'time_timezone',s.time_timezone,'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'),
     'crosses_midnight',s.crosses_midnight,'hide_time_on_badge',coalesce(s.hide_time_on_badge,false),'label_ids',to_jsonb(coalesce(s.label_ids,'{}'::uuid[])),
     'label_names',to_jsonb(coalesce(s.label_names,'{}'::text[])),'note',s.note) order by s.day_offset,s.start_time,s.id) from public.schedule_template_shifts s where s.template_id=t.id),'[]'::jsonb))
 into result from public.schedule_templates t join public.user_profiles u on u.user_id=t.created_by
 cross join lateral (select array(select distinct s.location_id from public.schedule_template_shifts s where s.template_id=t.id) ids) places
 where t.id=target_template_id and t.workspace_id=target_workspace_id
 and (org_wide or (cardinality(places.ids)>0 and places.ids <@ template_scope));
 if result is null then raise exception 'schedule template not found' using errcode='P0002'; end if; return result;
end; $function$
;

-- An override accepted at publication counts when the person who accepted it
-- may publish at the shift's location (asked of that person, not the caller).
CREATE OR REPLACE FUNCTION public.guard_schedule_assignment_availability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s jsonb:=to_jsonb(new); prior jsonb; a jsonb; evidence jsonb; logical_id uuid; hydrated boolean:=false;
begin
 perform public.availability_lock_workspace(new.workspace_id);
 logical_id:=coalesce(s->>'source_shift_id',s->>'id')::uuid;
 s:=s||jsonb_build_object('id',logical_id);
 
 if tg_op='UPDATE' and new.employee_id is null and old.employee_id is not null then
  update public.schedule_availability_overrides set revoked_at=now() where workspace_id=new.workspace_id and shift_id=logical_id and revoked_at is null;
 end if;
 if tg_op='UPDATE' and public.schedule_availability_identity(s)=public.schedule_availability_identity(to_jsonb(old)) then
  if tg_table_name='schedule_published_shifts' then new.availability_snapshot:=old.availability_snapshot; end if;
  return new;
 end if;
 prior:=public.schedule_availability_prior_publication(new.workspace_id,s,case when tg_table_name='schedule_published_shifts' and tg_op='INSERT' then (s->>'publication_id')::uuid end);
 if prior is not null then
  if tg_table_name='schedule_published_shifts' then
   new.availability_snapshot:=coalesce(nullif(prior->'availability_snapshot','null'),jsonb_build_object(
    'status','legacy_published','original_published_shift_id',prior->>'id','original_publication_id',prior->>'publication_id',
    'message','This existing responsibility predates availability snapshots. Historical availability is not reconstructed.'));
  end if;
  return new;
 end if;
 if tg_table_name<>'schedule_published_shifts' and tg_op='INSERT' then
  -- Acquiring/recovering a draft must remain possible when its old assessment
  -- has become stale. The assignment is retained for repair, not certified.
  select exists(select 1 from public.schedule_draft_shifts x where x.workspace_id=new.workspace_id and x.id=logical_id and public.schedule_availability_identity(to_jsonb(x))=public.schedule_availability_identity(s))
    or exists(select 1 from public.schedule_edit_session_shifts x where x.workspace_id=new.workspace_id and x.id=logical_id and public.schedule_availability_identity(to_jsonb(x))=public.schedule_availability_identity(s)) into hydrated;
  if hydrated then return new; end if;
 end if;
 if new.employee_id is null then
  if tg_table_name='schedule_published_shifts' then new.availability_snapshot:=jsonb_build_object('status','unassigned'); end if;
  return new;
 end if;

 if tg_table_name='schedule_published_shifts' and nullif(current_setting('newfork.schedule_publish_scope',true),'') is not null
  and (current_setting('newfork.schedule_publish_scope',true)::jsonb->>'workspace_id')::uuid=new.workspace_id
  and exists(select 1 from public.schedule_location_publications p where p.id=(s->>'publication_id')::uuid
   and p.source_draft_id=(current_setting('newfork.schedule_publish_scope',true)::jsonb->>'draft_id')::uuid) then
  s:=s||current_setting('newfork.schedule_publish_scope',true)::jsonb;
 end if;
 if nullif(current_setting('newfork.shift_exchange_scope',true),'') is not null
  and (current_setting('newfork.shift_exchange_scope',true)::jsonb->>'workspace_id')::uuid=new.workspace_id
  and current_setting('newfork.shift_exchange_scope',true)::jsonb->'shift_ids' ? logical_id::text then
  s:=s||jsonb_build_object('_exclude_shift_ids',current_setting('newfork.shift_exchange_scope',true)::jsonb->'shift_ids');
 end if;
 a:=public.assess_weekly_shift_availability(new.workspace_id,new.employee_id,s);
 evidence:=public.schedule_availability_override(new.workspace_id,s,a);
 if tg_table_name='schedule_published_shifts' and evidence is null then
  select to_jsonb(o) into evidence from public.schedule_publication_overrides o where o.workspace_id=new.workspace_id
   and o.publication_id=new.publication_id and o.finding_code in ('availability','schedule_conflict') and o.finding_id=a->>'fingerprint'
   and logical_id=any(o.source_shift_ids) and o.employee_id=new.employee_id and o.location_id=new.location_id
   and app_private.authz_reason(o.actor_user_id,new.workspace_id,'schedule.publish',array[new.location_id]) is null limit 1;
 end if;
 if a->>'operation'='blocked' or (tg_table_name='schedule_published_shifts' and a->>'operation'='verification_required') then
  raise exception 'Resolve availability, shift hours or approved time off before this assignment' using errcode='23514',detail=a::text;
 end if;
 if a->>'operation'='warning_requires_override' and evidence is null then
  raise exception 'A current availability acceptance is required' using errcode='23514',detail=a::text;
 end if;
 if tg_table_name='schedule_published_shifts' then
  new.availability_snapshot:=jsonb_build_object('status','assessed','captured_at',now(),'assessment',a,'override',evidence);
 elsif tg_op='UPDATE' then
  update public.schedule_availability_overrides set revoked_at=now() where workspace_id=new.workspace_id and shift_id=logical_id
   and revoked_at is null and assessment_fingerprint<>a->>'fingerprint';
 end if;
 return new;
end; $function$
;

-- "Somewhere", then only the draft's shifts at locations in reach.
CREATE OR REPLACE FUNCTION public.list_schedule_draft_availability_conflicts_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_week_start date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s record; a jsonb; projection jsonb; conflicts jsonb:='[]'; signatures jsonb:='[]'; fingerprint text; edit_scope uuid[];
begin
 perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit',
   target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.edit'));
 edit_scope := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.edit');
 if not exists(select 1 from public.schedule_drafts d where d.workspace_id=target_workspace_id and d.id=target_draft_id and d.week_start=target_week_start and d.archived_at is null) then
  return jsonb_build_object('status','ok','conflicts',conflicts,'fingerprint','none'); end if;
 for s in select shift.*,l.name location_name,trim(coalesce(nullif(e.preferred_name,''),e.first_name)||' '||e.last_name) employee_name,t.name shift_type_label,j.name job_name
  from public.schedule_draft_shifts shift
  join public.locations l on l.workspace_id=shift.workspace_id and l.id=shift.location_id
  join public.employee_profiles e on e.workspace_id=shift.workspace_id and e.id=shift.employee_id
  left join public.shift_types t on t.workspace_id=shift.workspace_id and t.id=shift.shift_type_id
  left join public.jobs j on j.workspace_id=shift.workspace_id and j.id=shift.job_id
  where shift.workspace_id=target_workspace_id and shift.draft_id=target_draft_id and shift.scheduled_date between target_week_start and target_week_start+6
   and shift.location_id = any (edit_scope)
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
end; $function$
;

-- Publishing is asked one location at a time, at every location the preview
-- is for; naming none is a no.
CREATE OR REPLACE FUNCTION public.list_schedule_draft_document_conflicts_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_week_start date, target_location_ids uuid[], target_department_ids uuid[] DEFAULT NULL::uuid[], include_no_department boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  draft_week date;
  conflicts jsonb := '[]'::jsonb;
  fingerprint text := 'none';
  normalized_locations uuid[];
  normalized_departments uuid[];
  effective_include_no_department boolean := coalesce(include_no_department, true);
  requested uuid;
begin
  if cardinality(coalesce(target_location_ids, '{}'::uuid[])) = 0 then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => '{}'::uuid[]);
  end if;
  foreach requested in array target_location_ids loop
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => array[requested]);
  end loop;

  select coalesce(array_agg(distinct location.id order by location.id), '{}'::uuid[])
  into normalized_locations
  from public.locations location
  join unnest(coalesce(target_location_ids, '{}'::uuid[])) requested(location_id)
    on requested.location_id = location.id
  where location.workspace_id = target_workspace_id
    and location.archived_at is null;

  if cardinality(normalized_locations) = 0 then
    return jsonb_build_object(
      'status', 'ok',
      'conflicts', conflicts,
      'fingerprint', fingerprint
    );
  end if;

  if target_department_ids is not null then
    select coalesce(array_agg(distinct department.id order by department.id), '{}'::uuid[])
    into normalized_departments
    from public.departments department
    join unnest(target_department_ids) requested(id)
      on requested.id = department.id
    where department.workspace_id = target_workspace_id
      and department.archived_at is null;
  end if;

  select draft.week_start
  into draft_week
  from public.schedule_drafts draft
  where draft.id = target_draft_id
    and draft.workspace_id = target_workspace_id
    and draft.archived_at is null
  limit 1;

  if draft_week is null or draft_week <> target_week_start then
    return jsonb_build_object(
      'status', 'ok',
      'conflicts', conflicts,
      'fingerprint', fingerprint
    );
  end if;

  with candidate_shifts as (
    select
      shift.id,
      shift.location_id,
      location.name as location_name,
      shift.employee_id,
      trim(coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' ' || employee.last_name) as employee_name,
      shift.scheduled_date,
      to_char(shift.start_time, 'HH24:MI') as start_time,
      to_char(shift.end_time, 'HH24:MI') as end_time
    from public.schedule_draft_shifts shift
    join public.locations location
      on location.id = shift.location_id
     and location.workspace_id = shift.workspace_id
    join public.employee_profiles employee
      on employee.id = shift.employee_id
     and employee.workspace_id = shift.workspace_id
     and employee.archived_at is null
    where shift.workspace_id = target_workspace_id
      and shift.draft_id = target_draft_id
      and shift.employee_id is not null
      and shift.location_id = any(normalized_locations)
      and public.schedule_shift_in_department_scope_service(
        shift.job_id,
        normalized_departments,
        effective_include_no_department
      )
      and shift.scheduled_date >= target_week_start
      and shift.scheduled_date < target_week_start + 7
  ),
  active_document_requirements as (
    select distinct on (requirement.employee_id, requirement.source_id)
      requirement.employee_id,
      requirement.id as requirement_id,
      requirement.source_id as document_type_id,
      requirement.title as document_title
    from public.employee_onboarding_requirements requirement
    join public.document_types document_type
      on document_type.id = requirement.source_id
     and document_type.workspace_id = requirement.workspace_id
    where requirement.workspace_id = target_workspace_id
      and requirement.kind = 'document'::public.employee_onboarding_requirement_kind
      and requirement.status <> 'superseded'::public.employee_onboarding_requirement_status
      and document_type.archived_at is null
      and document_type.tracks_expiry
      and document_type.expiry_schedule_impact in ('warn', 'block')
    order by requirement.employee_id, requirement.source_id, requirement.created_at desc, requirement.id
  ),
  latest_accepted_documents as (
    select distinct on (document.workspace_id, document.requirement_id)
      document.*
    from public.employee_documents document
    where document.workspace_id = target_workspace_id
      and document.review_status = 'accepted'::public.employee_document_review_status
    order by document.workspace_id, document.requirement_id, document.version_number desc
  ),
  latest_pending_documents as (
    select distinct on (document.workspace_id, document.requirement_id)
      document.*
    from public.employee_documents document
    where document.workspace_id = target_workspace_id
      and document.review_status = 'awaiting_review'::public.employee_document_review_status
    order by document.workspace_id, document.requirement_id, document.version_number desc
  ),
  violation_rows as (
    select
      document_type.expiry_schedule_impact,
      document_type.expiry_policy_version,
      requirement.requirement_id,
      requirement.document_type_id,
      requirement.document_title,
      accepted.id as document_id,
      accepted.expiry_date,
      pending.id as pending_document_id,
      shift.id as shift_id,
      shift.location_id,
      shift.location_name,
      shift.employee_id,
      shift.employee_name,
      shift.scheduled_date,
      shift.start_time,
      shift.end_time
    from candidate_shifts shift
    join active_document_requirements requirement
      on requirement.employee_id = shift.employee_id
    join public.document_types document_type
      on document_type.id = requirement.document_type_id
     and document_type.workspace_id = target_workspace_id
    join latest_accepted_documents accepted
      on accepted.requirement_id = requirement.requirement_id
    left join latest_pending_documents pending
      on pending.requirement_id = requirement.requirement_id
    where accepted.expiry_date is not null
      and accepted.expiry_date < shift.scheduled_date
  ),
  conflict_rows as (
    select
      jsonb_build_object(
        'kind', 'document_expiry',
        'employee_id', employee_id,
        'employee_name', employee_name,
        'shift_id', shift_id,
        'location_id', location_id,
        'location_name', location_name,
        'date', scheduled_date,
        'start_time', start_time,
        'end_time', end_time,
        'document_type_id', document_type_id,
        'requirement_id', requirement_id,
        'document_id', document_id,
        'document_title', document_title,
        'expiry_date', expiry_date,
        'expiry_policy_version', expiry_policy_version,
        'pending_document_id', pending_document_id,
        'review_action', case when pending_document_id is null then null else 'review_document' end,
        'severity', case
          when expiry_schedule_impact = 'block' then 'hard'
          else 'soft'
        end,
        'overrideable', expiry_schedule_impact = 'warn',
        'warning_text', case
          when expiry_schedule_impact = 'block'
            then document_title || ' is expired and blocks scheduling.'
          else document_title || ' is expired.'
        end,
        'conflict_fingerprint', 'pending'
      ) as conflict,
      concat_ws(
        '|',
        employee_id,
        shift_id,
        document_type_id,
        requirement_id,
        document_id,
        pending_document_id,
        expiry_schedule_impact,
        expiry_policy_version,
        scheduled_date,
        expiry_date
      ) as conflict_key
    from violation_rows
    order by scheduled_date, start_time, shift_id, document_type_id
  )
  select coalesce(jsonb_agg(conflict), '[]'::jsonb),
         coalesce(
           encode(
             extensions.digest(
               convert_to(string_agg(conflict_key, E'\n' order by conflict_key), 'UTF8'),
               'sha256'
             ),
             'hex'
           ),
           'none'
         )
  into conflicts, fingerprint
  from conflict_rows;

  if fingerprint <> 'none' then
    conflicts := (
      select jsonb_agg(conflict - 'conflict_fingerprint' || jsonb_build_object(
        'conflict_fingerprint',
        fingerprint
      ))
      from jsonb_array_elements(conflicts) conflict
    );
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'conflicts', conflicts,
    'fingerprint', fingerprint
  );
end;
$function$
;

-- The draft list shows a draft that includes one of the person's locations
-- (B1: Ayşe opens the Kadıköy + Beşiktaş draft and works on Kadıköy); owners
-- and admins see every draft.
CREATE OR REPLACE FUNCTION public.list_schedule_drafts_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare edit_scope uuid[]; org_wide boolean;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit',
    target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.edit'));
  edit_scope := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.edit');
  org_wide := app_private.authz_reason(actor_user_id, target_workspace_id, 'schedule.edit', '{}'::uuid[]) is null;
  return jsonb_build_object('drafts', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', draft.id, 'workspace_id', draft.workspace_id,
      'week_start', draft.week_start, 'name', draft.name,
      'revision', draft.revision, 'created_by', draft.created_by,
      'updated_by', draft.updated_by, 'created_at', draft.created_at,
      'updated_at', draft.updated_at
    ) order by draft.updated_at desc, draft.name)
    from public.schedule_drafts draft
    where draft.workspace_id = target_workspace_id
      and draft.week_start = target_week_start and draft.archived_at is null
      and (org_wide or draft.location_ids && edit_scope)
  ), '[]'::jsonb));
end;
$function$
;

-- Recent exports (Q-A, user decision 2026-09-25): a manager sees an export
-- when every location it was for is in reach; one with no, a malformed, a
-- closed or an unknown location only owners and admins see. The ten latest the
-- person may see.
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
         and (org_wide or (cardinality(places.ids) > 0 and places.ids <@ export_scope))
       order by event.created_at desc, event.id desc
       limit 10
    ) event_row
  );
end;
$function$
;

-- A person's own presets; a preset has no location: "somewhere".
CREATE OR REPLACE FUNCTION public.list_schedule_export_presets_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.export',
   target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.export'));
 return (
 select jsonb_build_object('presets',coalesce(jsonb_agg(jsonb_build_object('id',p.id,'workspace_id',p.workspace_id,'name',p.name,'settings',p.settings,'created_by',p.created_by,'updated_at',p.updated_at) order by p.updated_at desc,p.id),'[]'::jsonb))
 from public.schedule_export_presets p where p.workspace_id=target_workspace_id and p.created_by=actor_user_id
 );
end;
$function$
;

-- Scheduled exports (Q-A, user decision 2026-09-25): a manager sees one when
-- every location on it is in reach, recipients included; one with a closed or
-- unknown location only owners and admins see.
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
      and (org_wide or (cardinality(s.location_ids) > 0 and s.location_ids <@ export_scope))
  );
end;
$function$
;

-- Pending changes at the locations the person may edit.
CREATE OR REPLACE FUNCTION public.list_schedule_pending_ops_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date, target_location_ids uuid[] DEFAULT NULL::uuid[], target_draft_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'pending_ops',
    coalesce(jsonb_agg(jsonb_build_object(
      'id', shift.id,
      'location_id', shift.location_id,
      'week_start', session.week_start,
      'op_type', shift.pending_op_type,
      'target_shift_id', shift.source_published_shift_id,
      'target_draft_id', session.source_draft_id,
      'payload', public.schedule_pending_op_payload_json(shift),
      'created_by', session.holder_user_id,
      'created_at', shift.created_at,
      'updated_at', shift.updated_at
    ) order by shift.updated_at asc, shift.id asc), '[]'::jsonb)
  )
  from public.schedule_edit_sessions session
  join public.schedule_edit_session_shifts shift
    on shift.session_id = session.id
   and shift.workspace_id = session.workspace_id
  where session.workspace_id = target_workspace_id
    and session.week_start = target_week_start
    and session.status = 'active'
    and shift.pending_op_type is not null
    and (
      target_draft_id is null
      or session.source_draft_id = target_draft_id
    )
    and (
      target_location_ids is null
      or cardinality(target_location_ids) = 0
      or shift.location_id = any(target_location_ids)
    )
    and shift.location_id = any ((select app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.edit'))::uuid[]);
$function$
;

-- The templates whose shifts are all at locations in reach; owners and admins
-- see every template.
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
 cross join lateral (select count(*)::integer shift_count,count(*) filter(where s.employee_id is null)::integer open_slot_count,
   array(select distinct z.location_id from public.schedule_template_shifts z where z.template_id=t.id) location_ids
   from public.schedule_template_shifts s where s.template_id=t.id) x
 where t.workspace_id=target_workspace_id
 and (org_wide or (cardinality(x.location_ids)>0 and x.location_ids <@ template_scope))
 );
end;
$function$
;

-- Asked at the shift's location; a shift without one is not everywhere.
CREATE OR REPLACE FUNCTION public.prepare_weekly_schedule_assignment(actor uuid, w uuid, s jsonb, previous jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a jsonb; preview jsonb; evidence jsonb; logical_id uuid:=coalesce(s->>'source_shift_id',s->>'id')::uuid;
 loc uuid:=(s->>'location_id')::uuid; emp uuid:=(s->>'employee_id')::uuid;
begin
 perform public.availability_lock_workspace(w);
 if logical_id is null then
  raise exception 'Schedule location access denied' using errcode='42501'; end if;
 perform app_private.authorize(actor, w, 'schedule.edit', target_locations => array[loc]);
 if emp is not null and not exists(select 1 from public.employee_location_assignments
  where workspace_id=w and employee_id=emp and location_id=loc and ended_at is null) then
  raise exception 'Employee is not assigned to this location' using errcode='42501'; end if;
 
 
 s:=s||jsonb_build_object('_exclude_shift_id',logical_id);
 a:=public.assess_weekly_shift_availability(w,emp,s);
 if a->>'operation' in ('blocked','verification_required') then
  raise exception '%',coalesce((select string_agg(r->>'message',' ') from jsonb_array_elements(a->'reasons') r where r->>'severity'='block'),'Scheduling rules block this assignment') using errcode='23514',detail=a::text;
 end if;
 if emp is null then
   if a->>'operation'='warning_requires_override' and s->>'availability_assessment_fingerprint' is distinct from
    public.assess_weekly_shift_availability(w,emp,s-'id'-'source_shift_id')->>'fingerprint' then
    raise exception 'Review the current availability assessment before saving' using errcode='PT409';
   end if;
   if a->>'operation'='warning_requires_override' then
    insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata)
    values(w,actor,'schedule.conflict_accepted','shift',logical_id::text,jsonb_build_object('assessment',a));
   end if;
   return;
  end if;
  evidence:=public.schedule_availability_override(w,s,a);
 -- Only an existing same-identity assignment can reuse its acceptance.
 if evidence is not null and previous is not null
  and coalesce(previous->>'source_shift_id',previous->>'id')=logical_id::text
  and previous->>'employee_id'=emp::text then return; end if;
 if a->>'operation'='warning_requires_override' then
  preview:=public.assess_weekly_shift_availability(w,emp,s-'id'-'source_shift_id');
  if s->>'availability_assessment_fingerprint' is distinct from preview->>'fingerprint' then
   raise exception 'Review the current availability assessment before saving' using errcode='PT409'; end if;
 end if;
 update public.schedule_availability_overrides set revoked_at=now() where workspace_id=w and shift_id=logical_id and revoked_at is null;
 if a->>'operation'='warning_requires_override' then
  insert into public.schedule_availability_overrides(workspace_id,shift_id,employee_id,location_id,assessment_fingerprint,assessment,reason,actor_user_id)
  values(w,logical_id,emp,loc,a->>'fingerprint',a,
   case when a->>'warning_policy'='confirm' then 'Schedule conflict confirmed by manager.' else 'Schedule warning acknowledged (warn policy).' end,actor);
 end if;
end; $function$
;

-- Auto-fill works on the person's own edit and is asked at its locations.
CREATE OR REPLACE FUNCTION public.preview_schedule_auto_fill_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_session public.schedule_edit_sessions%rowtype; open_shift record; candidate_payload jsonb; recommended uuid;
  proposals jsonb:='[]'::jsonb; unfilled jsonb:='[]'::jsonb; unsigned jsonb;
begin
  select * into target_session from public.schedule_edit_sessions s where s.id=target_session_id and s.workspace_id=target_workspace_id;
  if target_session.id is null or target_session.holder_user_id<>actor_user_id then raise exception 'edit session not found' using errcode='P0002'; end if;
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => target_session.location_ids);
  if target_session.status<>'active' or target_session.expires_at<=now() then raise exception 'edit lease expired' using errcode='40001'; end if;
  for open_shift in select s.*,l.name location_name,j.name job_name from public.schedule_edit_session_shifts s
    join public.locations l on l.id=s.location_id join public.jobs j on j.id=s.job_id
    where s.session_id=target_session.id and s.employee_id is null order by s.scheduled_date,s.start_time,s.id loop
    with eligible as (
      select e.id employee_id,coalesce(nullif(e.preferred_name,''),e.first_name||' '||e.last_name) employee_name,ja.is_primary,
        coalesce((select sum(case when x.end_time<=x.start_time then 1440 else 0 end + extract(epoch from (x.end_time-x.start_time))/60)::integer
          from public.schedule_edit_session_shifts x where x.session_id=target_session.id and x.employee_id=e.id),0) scheduled_minutes
      from public.employee_profiles e
      join public.employee_location_assignments la on la.employee_id=e.id and la.workspace_id=e.workspace_id and la.location_id=open_shift.location_id and la.ended_at is null
      join public.employee_job_assignments ja on ja.employee_id=e.id and ja.workspace_id=e.workspace_id and ja.job_id=open_shift.job_id and ja.ended_at is null
      where e.workspace_id=target_workspace_id and e.archived_at is null
      and not exists(select 1 from public.schedule_edit_session_shifts x where x.session_id=target_session.id and x.employee_id=e.id
        and tsrange(x.scheduled_date+x.start_time,x.scheduled_date+x.end_time+case when x.end_time<=x.start_time then interval '1 day' else interval '0' end,'[)')
          && tsrange(open_shift.scheduled_date+open_shift.start_time,open_shift.scheduled_date+open_shift.end_time+case when open_shift.end_time<=open_shift.start_time then interval '1 day' else interval '0' end,'[)'))
      and (public.assess_weekly_shift_availability(target_workspace_id,e.id,to_jsonb(open_shift)||jsonb_build_object('employee_id',e.id))->>'operation')='allowed'
      and not exists(select 1 from jsonb_array_elements(proposals) p where (p->>'recommended_employee_id')::uuid=e.id
        and tsrange((p->>'scheduled_date')::date+(p->>'start_time')::time,(p->>'scheduled_date')::date+(p->>'end_time')::time+case when (p->>'end_time')::time<=(p->>'start_time')::time then interval '1 day' else interval '0' end,'[)')
          && tsrange(open_shift.scheduled_date+open_shift.start_time,open_shift.scheduled_date+open_shift.end_time+case when open_shift.end_time<=open_shift.start_time then interval '1 day' else interval '0' end,'[)'))
    ), ranked as (select *,min(scheduled_minutes) over() min_minutes from eligible)
    select coalesce(jsonb_agg(jsonb_build_object('employee_id',employee_id,'employee_name',employee_name,'scheduled_minutes',scheduled_minutes,
      'availability_fingerprint',public.assess_weekly_shift_availability(target_workspace_id,employee_id,to_jsonb(open_shift)||jsonb_build_object('employee_id',employee_id))->>'fingerprint','primary_job',is_primary,'reasons',to_jsonb(array_remove(array[case when scheduled_minutes=min_minutes then 'Fewest scheduled hours' end,case when is_primary then 'Primary job' end,'Available']::text[],null)))
      order by scheduled_minutes,is_primary desc,employee_id),'[]'::jsonb) into candidate_payload from ranked;
    if jsonb_array_length(candidate_payload)=0 then unfilled:=unfilled||jsonb_build_array(jsonb_build_object('shift_id',open_shift.id,'reason','No eligible employee'));
    else
      recommended:=(candidate_payload->0->>'employee_id')::uuid;
      proposals:=proposals||jsonb_build_array(jsonb_build_object('shift_id',open_shift.id,'location_name',open_shift.location_name,'job_name',open_shift.job_name,
        'scheduled_date',open_shift.scheduled_date,'time_basis',open_shift.time_basis,'time_snapshot',open_shift.time_snapshot,'time_timezone',open_shift.time_timezone,'start_time',to_char(open_shift.start_time,'HH24:MI'),'end_time',to_char(open_shift.end_time,'HH24:MI'),
        'recommended_employee_id',recommended,'candidates',candidate_payload));
    end if;
  end loop;
  unsigned:=jsonb_build_object('workspace_id',target_workspace_id,'session_id',target_session.id,'session_revision',target_session.revision,'proposals',proposals,'unfilled',unfilled);
  return unsigned||jsonb_build_object('status','review_ready','fingerprint',encode(extensions.digest(convert_to(unsigned::text,'UTF8'),'sha256'),'hex'));
end; $function$
;

-- Reviewing default hours is asked at every selected shift's location.
CREATE OR REPLACE FUNCTION public.preview_schedule_default_hours_service(actor uuid, w uuid, sid uuid, command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare session public.schedule_edit_sessions%rowtype; shift record; proposed jsonb; before_a jsonb; after_a jsonb;
 rows jsonb:='[]'; evidence jsonb:='[]'; row_value jsonb; peers jsonb; before_count integer; after_count integer; unknown_count integer;
 original_span tstzrange; proposed_span tstzrange; reason text; can_override boolean; fingerprint text;
 ids uuid[]; starts date; ends date; changed integer:=0; blocked integer:=0; edit_scope uuid[];
begin
 if jsonb_typeof(command) is distinct from 'object' or jsonb_typeof(command->'shift_ids') is distinct from 'array'
  or jsonb_array_length(command->'shift_ids') not between 1 and 200 then raise exception 'Choose 1 to 200 shifts to review' using errcode='22023'; end if;
 select array_agg(value::uuid order by value::uuid) into ids from jsonb_array_elements_text(command->'shift_ids');
 if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Choose each shift once' using errcode='22023'; end if;
 select * into session from public.schedule_edit_sessions where workspace_id=w and id=sid;
 if session.id is null or session.holder_user_id is distinct from actor then raise exception 'Edit session not found' using errcode='42501'; end if;
 if session.status<>'active' or session.expires_at<=now() or session.revision is distinct from (command->>'expected_session_revision')::integer then
  raise exception 'Schedule editing changed; reopen the review' using errcode='40001'; end if;
 starts:=(command->>'starts_on')::date; ends:=(command->>'ends_on')::date;
 if starts is null or ends is null or starts<session.week_start or ends>session.week_start+6 or ends<starts then
  raise exception 'Choose dates within this schedule week' using errcode='22023'; end if;
 if (select count(*) from public.schedule_edit_session_shifts s where s.workspace_id=w and s.session_id=sid and s.id=any(ids)
  and s.scheduled_date between starts and ends and coalesce(s.pending_op_type,'')<>'delete')<>cardinality(ids) then
  raise exception 'Selected shifts changed or are outside these dates' using errcode='40001'; end if;
 perform app_private.authorize(actor, w, 'schedule.edit', target_locations => array(
  select distinct s.location_id from public.schedule_edit_session_shifts s where s.workspace_id=w and s.session_id=sid and s.id=any(ids)));
 edit_scope:=app_private.scope_set(actor, w, 'schedule.edit');
 for shift in select s.*,to_jsonb(s) payload,t.default_revision,t.default_start_time,t.default_end_time,t.archived_at type_archived,
  t.name type_name,l.name location_name,l.archived_at location_archived,j.archived_at job_archived,
  coalesce(nullif(concat_ws(' ',coalesce(nullif(e.preferred_name,''),e.first_name),e.last_name),''),'Open shift') employee_name,
  l.timezone location_timezone from public.schedule_edit_session_shifts s
  join public.locations l on l.id=s.location_id and l.workspace_id=w
  join public.jobs j on j.id=s.job_id and j.workspace_id=w
  left join public.shift_types t on t.id=s.shift_type_id and t.workspace_id=w
  left join public.employee_profiles e on e.id=s.employee_id and e.workspace_id=w
  where s.workspace_id=w and s.session_id=sid and s.id=any(ids) order by s.scheduled_date,s.location_id,s.id loop
  reason:=null; proposed:=null; before_a:=null; after_a:=null; can_override:=false;
  original_span:=app_private.shift_time_range(shift.scheduled_date,shift.start_time,shift.end_time,coalesce(shift.time_timezone,shift.location_timezone));
  if shift.time_basis<>'type_default' then reason:='Only saved shift-type reference hours are included; explicit and unconfirmed hours stay unchanged';
  elsif shift.type_archived is not null or shift.default_revision is null then reason:='This shift type is archived or unavailable';
  elsif shift.default_start_time is null or shift.default_end_time is null then reason:='This shift type has no current default hours';
  elsif lower(original_span)<=now() then reason:='This shift has already started';
  elsif shift.time_snapshot->>'default_revision'=shift.default_revision::text and shift.time_snapshot->>'shift_type_id'=shift.shift_type_id::text then reason:='Already uses the current defaults';
  end if;
  if reason is null then
   proposed:=public.normalize_schedule_time_source(w,shift.payload||jsonb_build_object('time_snapshot',null),shift.payload);
   proposed_span:=app_private.shift_time_range(shift.scheduled_date,(proposed->>'start_time')::time,(proposed->>'end_time')::time,proposed->>'time_timezone');
   if lower(proposed_span)<=now() then reason:='The proposed start time is already in the past'; proposed:=null; end if;
  end if;
  if proposed is not null then
   changed:=changed+1;
   can_override:=shift.location_id=any(edit_scope);
   if shift.employee_id is not null then
    before_a:=public.availability_impact_assessment(public.assess_weekly_shift_availability(w,shift.employee_id,shift.payload))||jsonb_build_object('can_override',can_override);
    
    after_a:=public.assess_weekly_shift_availability(w,shift.employee_id,proposed);
    after_a:=public.availability_impact_assessment(after_a)||jsonb_build_object('can_override',can_override,
     'warning_policy',after_a->'warning_policy','has_availability_conflict',after_a->'has_availability_conflict',
     'override_recorded',public.schedule_availability_override(w,proposed,after_a) is not null);
 
   end if;
   if after_a->>'operation' in('blocked','verification_required') then reason:='Resolve availability or approved leave before applying these hours';
   
   elsif shift.location_archived is not null or shift.job_archived is not null then reason:='The location or job is archived';
   elsif shift.employee_id is not null and public.employee_has_hard_document_schedule_conflict_service(w,shift.employee_id,shift.scheduled_date) then reason:='Employee document requirements block this assignment';
   end if;
   if after_a->>'operation'='warning_requires_override' and reason is null then
    proposed:=proposed||jsonb_build_object('availability_assessment_fingerprint',public.assess_weekly_shift_availability(w,shift.employee_id,(proposed-'id'-'source_shift_id')||jsonb_build_object('_exclude_shift_id',shift.id,'session_id',sid))->>'fingerprint'); end if;
   if reason is not null then blocked:=blocked+1; end if;
  end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('shift_id',shift.id,'shift_revision',shift.revision,'scheduled_date',shift.scheduled_date,
   'location_id',shift.location_id,'location_name',shift.location_name,'shift_type_name',coalesce(shift.type_name,'Unnamed shift'),'employee_name',shift.employee_name,
   'before',shift.payload,'after',proposed,'before_assessment',before_a,'after_assessment',after_a,'reason',reason,'will_change',proposed is not null,'can_apply',proposed is not null and reason is null,
   'current_default_revision',shift.default_revision));
 end loop;
 -- Compare the complete proposed selection together, including overnight and
 -- cross-location commitments. Hidden peer identities never leave this helper.
 select coalesce(jsonb_agg(payload order by source,id),'[]') into peers from (
  select 'edit' source,s.id,to_jsonb(s) payload from public.schedule_edit_session_shifts s
   where s.workspace_id=w and s.session_id=sid and coalesce(s.pending_op_type,'')<>'delete'
  union all
  select 'published',p.id,to_jsonb(p)||jsonb_build_object('id',coalesce(p.source_shift_id,p.id)) from public.schedule_published_shifts p
   join public.schedule_location_publications pub on pub.id=p.publication_id and pub.workspace_id=w and pub.status='current'
   where p.workspace_id=w and p.scheduled_date between starts-2 and ends+2 and p.employee_id is not null
    and not exists(select 1 from public.schedule_edit_session_shifts s where s.workspace_id=w and s.session_id=sid and s.id=coalesce(p.source_shift_id,p.id))
 ) candidates;
 for row_value in select value from jsonb_array_elements(rows) loop
  before_count:=0; after_count:=0; unknown_count:=0;
  if row_value->'after'<>'null'::jsonb and row_value->'before'->>'employee_id' is not null then
   select count(*) filter(where peer->>'time_basis' in('explicit','type_default') and peer->>'start_time' is not null and peer->>'end_time' is not null and peer->>'time_timezone' is not null and app_private.shift_time_range((peer->>'scheduled_date')::date,(peer->>'start_time')::time,(peer->>'end_time')::time,peer->>'time_timezone') &&
    app_private.shift_time_range((row_value->>'scheduled_date')::date,(row_value->'before'->>'start_time')::time,(row_value->'before'->>'end_time')::time,row_value->'before'->>'time_timezone')),
    count(*) filter(where peer->>'time_basis' in('explicit','type_default') and peer->>'start_time' is not null and peer->>'end_time' is not null and peer->>'time_timezone' is not null and app_private.shift_time_range((coalesce(nullif(r->'after','null'),peer)->>'scheduled_date')::date,(coalesce(nullif(r->'after','null'),peer)->>'start_time')::time,(coalesce(nullif(r->'after','null'),peer)->>'end_time')::time,coalesce(nullif(r->'after','null'),peer)->>'time_timezone') &&
    app_private.shift_time_range((row_value->>'scheduled_date')::date,(row_value->'after'->>'start_time')::time,(row_value->'after'->>'end_time')::time,row_value->'after'->>'time_timezone'))
    into before_count,after_count
   from jsonb_array_elements(peers) peer left join lateral(select value r from jsonb_array_elements(rows) where value->>'shift_id'=peer->>'id') replacement on true
   where peer->>'employee_id'=row_value->'before'->>'employee_id' and peer->>'id'<>row_value->>'shift_id';
   select count(*) into unknown_count from jsonb_array_elements(peers) peer
    where peer->>'employee_id'=row_value->'before'->>'employee_id' and peer->>'id'<>row_value->>'shift_id'
     and (peer->>'scheduled_date')::date between (row_value->>'scheduled_date')::date-2 and (row_value->>'scheduled_date')::date+2
     and (coalesce(peer->>'time_basis','') not in('explicit','type_default') or peer->>'start_time' is null or peer->>'end_time' is null or peer->>'time_timezone' is null);
  end if;
  evidence:=evidence||jsonb_build_array(row_value||jsonb_build_object('before_overlap_count',before_count,'after_overlap_count',after_count,'unconfirmed_peer_count',unknown_count));
 end loop;
 fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('workspace',w,'actor',actor,'session',sid,'revision',session.revision,'command',command-'fingerprint'-'idempotency_key'-'acknowledge_reference_overlaps'-'confirm_availability','rows',evidence,'peers',peers)::text,'UTF8'),'sha256'),'hex');
 return jsonb_build_object('session_id',sid,'session_revision',session.revision,'starts_on',starts,'ends_on',ends,'fingerprint',fingerprint,'changed_count',changed,'blocked_count',blocked,'shifts',evidence);
end $function$
;

-- An export is for locations that are all in reach (M2).
CREATE OR REPLACE FUNCTION public.preview_schedule_export_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date, source_type text, source_draft_id uuid, target_location_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare normalized uuid[]; source_revision integer; rows jsonb; locations jsonb; unsigned jsonb; workspace_name text;
begin
  if source_type not in ('published','draft') then raise exception 'invalid schedule export source' using errcode='22023'; end if;
  select array_agg(distinct id order by id) into normalized from unnest(target_location_ids) id;
  if coalesce(cardinality(normalized),0)=0 then raise exception 'schedule export location required' using errcode='22023'; end if;
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.export', target_locations => normalized);
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
      'time_basis',s.time_basis,'time_snapshot',s.time_snapshot,'time_timezone',s.time_timezone,'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'),'crosses_midnight',s.crosses_midnight,'note',s.note,
      'scheduled_minutes',greatest(0,(case when s.end_time<=s.start_time then 1440 else 0 end+extract(epoch from(s.end_time-s.start_time))/60)::integer-coalesce(s.unpaid_break_minutes,0)))
      order by s.scheduled_date,l.sort_order,s.start_time,s.id),'[]'::jsonb) into rows
    from public.schedule_draft_shifts s join public.locations l on l.id=s.location_id join public.jobs j on j.id=s.job_id
    left join public.employee_profiles e on e.id=s.employee_id left join public.shift_types st on st.id=s.shift_type_id
    where s.draft_id=source_draft_id and s.location_id=any(normalized);
  else
    select coalesce(jsonb_agg(jsonb_build_object('shift_id',s.id,'scheduled_date',s.scheduled_date,'location_name',l.name,
      'employee_name',case when s.employee_id is null then null else coalesce(nullif(e.preferred_name,''),e.first_name||' '||e.last_name) end,'job_name',j.name,'shift_type_name',st.name,
      'label_names',to_jsonb(coalesce(s.label_names,'{}'::text[])),
      'time_basis',s.time_basis,'time_snapshot',s.time_snapshot,'time_timezone',s.time_timezone,'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'),'crosses_midnight',s.crosses_midnight,'note',s.note,
      'scheduled_minutes',greatest(0,(case when s.end_time<=s.start_time then 1440 else 0 end+extract(epoch from(s.end_time-s.start_time))/60)::integer-coalesce(s.unpaid_break_minutes,0)))
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
end; $function$
;

-- Undoing a pending change is asked at its shift's location.
CREATE OR REPLACE FUNCTION public.remove_schedule_pending_op_service(actor_user_id uuid, target_workspace_id uuid, target_op_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_session public.schedule_edit_sessions%rowtype;
  target_shift public.schedule_edit_session_shifts%rowtype;
begin
 perform public.availability_lock_workspace(target_workspace_id);
  select session.* into target_session
    from public.schedule_edit_sessions session
    join public.schedule_edit_session_shifts shift on shift.session_id = session.id
   where session.workspace_id = target_workspace_id
     and shift.id = target_op_id
     and session.status = 'active'
   for update of session;

  select shift.* into target_shift
    from public.schedule_edit_session_shifts shift
   where shift.session_id = target_session.id
     and shift.id = target_op_id
   for update;

  if target_session.id is null or target_session.holder_user_id <> actor_user_id then
    raise exception 'pending op not found' using errcode='P0002';
  end if;
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => array[target_shift.location_id]);

  if target_shift.pending_op_type = 'create' then
    delete from public.schedule_edit_session_shifts
     where session_id = target_session.id
       and id = target_op_id;
  else
    update public.schedule_edit_session_shifts
       set pending_op_type = null,
           locked = target_shift.source_published_shift_id is not null,
           revision = revision + 1,
           updated_at = now()
     where session_id = target_session.id
       and id = target_op_id;
  end if;

  update public.schedule_edit_sessions
     set revision = revision + 1,
         dirty = true,
         last_heartbeat = now(),
         expires_at = now() + interval '4 minutes'
   where id = target_session.id;

  return jsonb_build_object('status', 'ok', 'op_id', target_op_id);
end;
$function$
;

-- Availability detail shows to whoever may edit or publish at the shift's location.
CREATE OR REPLACE FUNCTION public.schedule_availability_read_projection(actor uuid, w uuid, s jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare prior jsonb; a jsonb; evidence jsonb; retained boolean:=false; can_manage boolean; visible boolean;
begin
 can_manage:=app_private.authz_reason(actor,w,'schedule.edit',array[(s->>'location_id')::uuid]) is null
  or app_private.authz_reason(actor,w,'schedule.publish',array[(s->>'location_id')::uuid]) is null;
 if s->>'employee_id' is not null and can_manage then
  prior:=case when s->>'publication_id' is not null then s else public.schedule_availability_prior_publication(w,s) end;
  retained:=prior is not null;
  if retained then
   a:=nullif(prior->'availability_snapshot'->'assessment','null');
   if a is not null then
    visible:=public.weekly_published_availability_visible(w,(s->>'employee_id')::uuid,prior->'availability_snapshot');
    a:=a||jsonb_build_object('operation','allowed','reasons','[]'::jsonb,'responsibility_retained',true,'has_availability_conflict',visible);
   end if;
  else
   a:=public.assess_weekly_shift_availability(w,(s->>'employee_id')::uuid,s);
   evidence:=public.schedule_availability_override(w,s,a);
   if a->>'operation'='warning_requires_override' and evidence is not null then
    a:=a||jsonb_build_object('operation','allowed','reasons','[]'::jsonb,'override_recorded',true);
   end if;
  end if;
 end if;
 if a is not null then
  select jsonb_object_agg(key,value) into a from jsonb_each(a) where key=any(array[
   'coverage','operation','time_basis','timezone','assessment_scope','intervals','available_intervals','unavailable_intervals','unknown_intervals',
   'reasons','fingerprint','policy_revision','fold_resolution','assessment_minutes','responsibility_retained','override_recorded',
   'warning_policy','has_availability_conflict','preference_timezone']);
  a:=a||jsonb_build_object('can_override',can_manage);
 end if;
 return jsonb_build_object('availability_assessment',a,'availability_responsibility_retained',retained,
  'time_basis',s->'time_basis','time_snapshot',s->'time_snapshot','time_timezone',s->'time_timezone',
  'hide_time_on_badge',coalesce((s->>'hide_time_on_badge')::boolean,false));
end; $function$
;

-- Publishing is asked at every location checked, one at a time; naming none is a no.
CREATE OR REPLACE FUNCTION public.schedule_draft_has_hard_document_conflicts_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_week_start date, target_location_ids uuid[], target_department_ids uuid[] DEFAULT NULL::uuid[], include_no_department boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  normalized_locations uuid[];
  normalized_departments uuid[];
  effective_include_no_department boolean := coalesce(include_no_department, true);
  requested uuid;
begin
  select coalesce(array_agg(distinct location_id order by location_id), '{}'::uuid[])
  into normalized_locations
  from unnest(coalesce(target_location_ids, '{}'::uuid[])) location_id;

  if cardinality(normalized_locations) = 0 then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => '{}'::uuid[]);
  end if;
  foreach requested in array normalized_locations loop
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => array[requested]);
  end loop;

  if target_department_ids is not null then
    select coalesce(array_agg(distinct department.id order by department.id), '{}'::uuid[])
    into normalized_departments
    from public.departments department
    join unnest(target_department_ids) requested(id)
      on requested.id = department.id
    where department.workspace_id = target_workspace_id
      and department.archived_at is null;
  end if;

  return exists (
    select 1
    from public.schedule_drafts draft
    join public.schedule_draft_shifts shift
      on shift.draft_id = draft.id
     and shift.workspace_id = draft.workspace_id
    where draft.id = target_draft_id
      and draft.workspace_id = target_workspace_id
      and draft.week_start = target_week_start
      and draft.archived_at is null
      and shift.employee_id is not null
      and shift.location_id = any(normalized_locations)
      and public.schedule_shift_in_department_scope_service(
        shift.job_id,
        normalized_departments,
        effective_include_no_department
      )
      and public.employee_has_hard_document_schedule_conflict_service(
        target_workspace_id,
        shift.employee_id,
        shift.scheduled_date
      )
  );
end;
$function$
;

-- Shift Hub's manager view reads requests at locations where exchange.read
-- reaches and marks the ones exchange.approve reaches.
CREATE OR REPLACE FUNCTION public.shift_exchanges_read_service(actor uuid, w uuid, manager_view boolean DEFAULT false, from_date date DEFAULT CURRENT_DATE, to_date date DEFAULT (CURRENT_DATE + 42), focused_case_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp public.employee_profiles%rowtype; c public.shift_exchange_cases%rowtype; s jsonb; t jsonb; allowed boolean; mine boolean;
 case_items jsonb[]:='{}'; opportunities jsonb:='[]'; own_shifts jsonb:='[]'; apps jsonb; hist jsonb; chk jsonb; shift_row record; stage text; live_status text; current_published boolean; requested_published boolean; published_cache jsonb:='{}'; source_key text;
 read_scope uuid[]:='{}'; manage_scope uuid[]:='{}';
begin
 if to_date<from_date or to_date>from_date+62 then raise exception 'Choose a date range up to 62 days'; end if;
 if not exists(select 1 from public.workspace_memberships where workspace_id=w and user_id=actor and status='active') then raise exception 'Active workspace access required' using errcode='42501'; end if;
 select * into emp from public.employee_profiles where workspace_id=w and user_id=actor and archived_at is null;
 if not manager_view and emp.id is null then raise exception 'Employee profile required' using errcode='42501'; end if;
 if manager_view then
  read_scope:=app_private.scope_set(actor,w,'exchange.read');
  -- Nowhere to read requests: asked with no location, the core says why; with
  -- no live location in the workspace there is nothing to read.
  if cardinality(read_scope)=0 and (app_private.authz_reason(actor,w,'exchange.read') is distinct from 'out_of_scope'
   or exists(select 1 from public.locations l where l.workspace_id=w and l.deleted_at is null)) then
   perform app_private.authorize(actor,w,'exchange.read');
  end if;
  manage_scope:=app_private.scope_set(actor,w,'exchange.approve');
 end if;
 for c in select * from public.shift_exchange_cases x where x.workspace_id=w and (x.status='open' or x.id=focused_case_id
  or (x.offered_snapshot->>'date')::date between from_date and to_date
  or (x.requested_snapshot->>'date')::date between from_date and to_date
  or exists(select 1 from public.schedule_published_shifts p
   join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
   where p.workspace_id=w and coalesce(p.source_shift_id,p.id) in(x.offered_source_id,x.requested_source_id)
   and p.scheduled_date between from_date and to_date)) order by x.expires_at,x.created_at loop
  allowed:=manager_view and coalesce((c.offered_snapshot->>'location_id')::uuid=any(read_scope) or (c.kind='swap' and (c.requested_snapshot->>'location_id')::uuid=any(read_scope)),false);
  mine:=coalesce(c.owner_id=emp.id,false);
  if not allowed and not mine and not exists(select 1 from public.shift_exchange_applications where case_id=c.id and employee_id=emp.id) then continue; end if;
  -- Repeated historical requests refer to the same published source. Resolve
  -- each source once in this read only; no cache survives the function call.
  foreach source_key in array array_remove(array[c.offered_source_id::text,c.requested_source_id::text],null) loop
   if not published_cache ? source_key then
    published_cache:=published_cache||jsonb_build_object(source_key,public.shift_exchange_shift(w,source_key::uuid));
   end if;
  end loop;
  s:=nullif(published_cache->c.offered_source_id::text,'null'::jsonb);
  t:=nullif(published_cache->c.requested_source_id::text,'null'::jsonb);
  current_published:=s is not null;
  requested_published:=t is not null;
  s:=coalesce(s,c.offered_snapshot);
  t:=coalesce(t,c.requested_snapshot);
  -- The list follows the displayed dates on either side. A focused deep link
  -- bypasses only the range, never the actor checks above.
  if c.id is distinct from focused_case_id and not (
   coalesce((s->>'date')::date between from_date and to_date,false)
   or coalesce((t->>'date')::date between from_date and to_date,false)
  ) then continue; end if;
  live_status:=public.shift_exchange_live_status(w,c.id);
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'employee_id',a.employee_id,'employee_name',coalesce(nullif(e.preferred_name,''),concat_ws(' ',e.first_name,e.last_name)),
   'status',case when live_status in('expired','invalidated') and a.status in('invited','pending_manager') then live_status else a.status end,'created_at',a.created_at,'reason',case when allowed or a.employee_id=emp.id then a.reason else '' end,
   'eligibility',case when (allowed or a.employee_id=emp.id) and live_status='open' then public.weekly_exchange_candidate_check(w,a.employee_id,s,array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null)) || case when a.employee_id=emp.id and a.status='invited' then jsonb_build_object('availability_warning',public.weekly_exchange_employee_warning(w,emp.id,s)) else '{}'::jsonb end end) order by a.created_at),'[]'::jsonb)
  into apps from public.shift_exchange_applications a join public.employee_profiles e on e.id=a.employee_id where a.case_id=c.id and (allowed or mine or a.employee_id=emp.id);
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'created_at',e.created_at,'message',e.message) order by e.created_at),'[]'::jsonb)
  into hist from public.shift_exchange_events e where e.case_id=c.id and (allowed or mine or e.application_id is null or exists(select 1 from public.shift_exchange_applications a where a.id=e.application_id and a.employee_id=emp.id));
  stage:=case when live_status<>'open' then 'closed'
   when exists(select 1 from public.shift_exchange_votes where case_id=c.id) then 'awaiting_other_manager'
   when exists(select 1 from public.shift_exchange_applications where case_id=c.id and status='pending_manager') then 'ready_for_manager'
   when exists(select 1 from public.shift_exchange_applications where case_id=c.id and status='invited') then 'awaiting_peer' else 'seeking_candidates' end;
  case_items:=array_append(case_items,jsonb_build_object('id',c.id,'kind',c.kind,'audience',c.audience,'status',live_status,'current_published',current_published,'requested_current_published',case when c.kind='swap' then requested_published else null end,
   'stage',stage,'revision',c.revision,'created_at',c.created_at,'expires_at',c.expires_at,'owner_id',c.owner_id,'owner_name',c.offered_snapshot->'employee_name',
   'shift',s,'requested_shift',t,'applications',apps,'candidate_count',(select count(*) from public.shift_exchange_applications where case_id=c.id and status in('invited','pending_manager') and live_status='open'),
   'can_manage',allowed and coalesce((c.offered_snapshot->>'location_id')::uuid=any(manage_scope) or (c.kind='swap' and (c.requested_snapshot->>'location_id')::uuid=any(manage_scope)),false),
   'is_owner',mine,'private_note',case when allowed or mine then c.private_note else '' end,'history',hist));
 end loop;
 if not manager_view then
  for shift_row in select p.id from public.schedule_published_shifts p join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
   where p.workspace_id=w and p.scheduled_date between from_date and to_date order by p.scheduled_date,p.start_time loop
   s:=public.shift_exchange_shift(w,shift_row.id);
   if (s->>'starts_at')::timestamptz<=clock_timestamp() then continue; end if;
   if (s->>'employee_id')::uuid=emp.id then own_shifts:=own_shifts||jsonb_build_array(s); continue; end if;
   select * into c from public.shift_exchange_cases where workspace_id=w and offered_source_id=(s->>'source_id')::uuid and status='open' and expires_at>clock_timestamp() and audience='eligible_pool' and kind<>'swap';
   if s->>'employee_id' is not null and c.id is null then continue; end if;
   chk:=public.weekly_exchange_candidate_check(w,emp.id,s)||jsonb_build_object('availability_warning',public.weekly_exchange_employee_warning(w,emp.id,s));
   if chk->>'status'='eligible' and (c.id is null or c.consent_fingerprint=public.shift_exchange_fingerprint(w,s,null)) then
    opportunities:=opportunities||jsonb_build_array(jsonb_build_object('case_id',c.id,'shift',s,'eligibility',chk));
   end if;
  end loop;
 end if;
 return jsonb_build_object('employee_id',emp.id,'cases',to_jsonb(case_items),'opportunities',opportunities,'own_shifts',own_shifts);
end; $function$
;

-- A person's own preset: "somewhere".
CREATE OR REPLACE FUNCTION public.update_schedule_export_preset_service(actor_user_id uuid, target_workspace_id uuid, target_preset_id uuid, target_name text, target_settings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p public.schedule_export_presets%rowtype;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.export',
    target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.export'));

  update public.schedule_export_presets
     set name = btrim(target_name),
         settings = target_settings,
         updated_by = actor_user_id,
         updated_at = now()
   where id = target_preset_id
     and workspace_id = target_workspace_id
     and created_by = actor_user_id
   returning * into p;

  if not found then
    raise exception 'schedule export preset not found' using errcode='P0002';
  end if;

  return jsonb_build_object(
    'id', p.id,
    'workspace_id', p.workspace_id,
    'name', p.name,
    'settings', p.settings,
    'created_by', p.created_by,
    'updated_at', p.updated_at
  );
exception
  when unique_violation then
    raise exception 'schedule export preset name conflict' using errcode='23505';
end;
$function$
;

-- Organization settings (REUSE: a manager-type role never writes them).
-- Conflict handling is its own action (N3); who may write is asked before the
-- payload is read: conflict handling when the payload touches it, the other
-- settings otherwise, both when it touches both.
CREATE OR REPLACE FUNCTION public.update_scheduling_settings_service(actor_user_id uuid, target_workspace_id uuid, settings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare previous public.workspace_scheduling_settings; proposed public.workspace_scheduling_settings; saved public.workspace_scheduling_settings;
 conflict_keys text[]:=array['conflict_rules','conflict_rules_revision','minimum_travel_minutes','minimum_rest_minutes'];
 touches_conflicts boolean:=jsonb_typeof(settings)='object' and settings ?| conflict_keys;
begin
 perform app_private.authorize(actor_user_id, target_workspace_id,
   case when touches_conflicts then 'settings.conflict_rules.write' else 'settings.scheduling.write' end);
 if touches_conflicts then
  if settings-conflict_keys<>'{}'::jsonb then
   perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.scheduling.write');
  end if;
 end if;
 if jsonb_typeof(settings) is distinct from 'object' then raise exception 'Valid settings required' using errcode='22023'; end if;
 if settings='{}'::jsonb then raise exception 'Settings are required' using errcode='22023'; end if;
 perform public.availability_lock_workspace(target_workspace_id);
 perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));
 select * into previous from public.workspace_scheduling_settings where workspace_id=target_workspace_id for update;
 if not found then raise exception 'Scheduling settings not found'; end if;
 if settings ?| conflict_keys and (settings->>'conflict_rules_revision')::integer is distinct from previous.conflict_rules_revision then
  raise exception 'Conflict rules changed. Reload the current rules before saving.' using errcode='PT409';
 end if;
 -- Partial calls preserve every omitted field. Revision is stamped by trigger.
 select * into proposed from jsonb_populate_record(previous,settings);
 update public.workspace_scheduling_settings set
  week_start_day=proposed.week_start_day,schedule_deadline_day=proposed.schedule_deadline_day,
  time_format=proposed.time_format,minimum_travel_minutes=proposed.minimum_travel_minutes,
  minimum_rest_minutes=proposed.minimum_rest_minutes,conflict_rules=proposed.conflict_rules,updated_at=now()
 where workspace_id=target_workspace_id returning * into saved;
 if (to_jsonb(previous)-'updated_at') is distinct from (to_jsonb(saved)-'updated_at') then
  insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata)
  values(target_workspace_id,actor_user_id,'scheduling.settings_updated','scheduling_settings',target_workspace_id::text,
   jsonb_build_object('before',to_jsonb(previous),'after',to_jsonb(saved)));
 end if;
 return to_jsonb(saved);
end;
$function$
;

-- Whether a manager reaches this person's availability with a permission,
-- asked of the core about the person (where they work, their rank, whether it
-- is the actor). Callers name the permission: availability.read ->
-- availability.team_read, availability.manage -> availability.team_write.
-- employees.manage is who hears of a change: every manager of a location the
-- person works at, whatever the person's rank (user decision 2026-09-26), so
-- it asks availability.team_read without the older employee-only access check.
-- Any other permission is an unknown action (22023).
CREATE OR REPLACE FUNCTION public.weekly_preference_manager_scope(actor uuid, w uuid, emp uuid, capability text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 with asked as (
  select case capability when 'availability.read' then 'availability.team_read'
   when 'availability.manage' then 'availability.team_write' when 'employees.manage' then 'availability.team_read' end as action
 )
 select (capability = 'employees.manage' or public.service_actor_can_access_employee(actor,w,emp))
  and app_private.authz_reason(actor,w,asked.action,target_person=>emp) is null
 from asked;
$function$
;

-- The publication preview's availability pass.
CREATE OR REPLACE FUNCTION public.weekly_schedule_publication_preflight(payload jsonb, actor uuid, departments uuid[] DEFAULT NULL::uuid[], include_no_department boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare findings jsonb; signatures jsonb:='[]'; s record; a jsonb; prior jsonb; evidence jsonb; scope jsonb;
 unsigned jsonb; w uuid:=(payload->>'workspace_id')::uuid; message text; state text; tier text; warning boolean;
begin
 if payload->>'status'='past_week_closed' then return payload; end if;
 select coalesce(jsonb_agg(f),'[]') into findings from jsonb_array_elements(payload->'findings') f
  where f->>'code' not in ('availability','availability_unknown','availability_review_pending','time_source_unresolved','overlap','double_booking','time_off','closed_location','closed_day');
 -- Publishing is asked at each location the preview is for, once.
 perform app_private.authorize(actor,w,'schedule.publish',array[(x->>'location_id')::uuid])
  from jsonb_array_elements(coalesce(payload->'locations','[]'::jsonb)) x;
 scope:=jsonb_build_object('_publish_locations',(select jsonb_agg(x->'location_id') from jsonb_array_elements(payload->'locations') x),
  '_publish_departments',to_jsonb(departments),'_publish_no_department',coalesce(include_no_department,true));
 for s in select d.*,concat_ws(' ',coalesce(nullif(e.preferred_name,''),e.first_name),e.last_name) employee_name,l.name location_name
  from public.schedule_draft_shifts d left join public.employee_profiles e on e.id=d.employee_id and e.workspace_id=d.workspace_id
  join public.locations l on l.id=d.location_id and l.workspace_id=d.workspace_id
  where d.workspace_id=w and d.draft_id=(payload->>'draft_id')::uuid
   and d.location_id in (select (x->>'location_id')::uuid from jsonb_array_elements(payload->'locations') x)
   and public.schedule_shift_in_department_scope_service(d.job_id,departments,coalesce(include_no_department,true)) order by d.id loop
  state:=null;
  a:=public.assess_weekly_shift_availability(w,s.employee_id,to_jsonb(s)||scope);
  prior:=public.schedule_availability_prior_publication(w,to_jsonb(s));
  evidence:=public.schedule_availability_override(w,to_jsonb(s),a);
  signatures:=signatures||jsonb_build_array(jsonb_build_object('shift_id',s.id,'fingerprint',a->>'fingerprint','override_id',evidence->>'id','retained_publication_id',prior->>'publication_id'));
  -- Always evaluate hard rules again. Retention only suppresses unchanged
  -- soft availability reminders; new business conflicts are still reviewed.
  if prior is not null and a->>'conflict_severity'<>'block' and
   not exists(select 1 from jsonb_array_elements(a->'reasons') r where r->>'code'<>'availability') then
   if not public.weekly_published_availability_visible(w,s.employee_id,prior->'availability_snapshot') then continue; end if;
   a:=prior->'availability_snapshot'->'assessment'; state:='accepted';
  elsif a->>'operation'='allowed' then continue;
  elsif a->>'operation'='warning_requires_override' then
   state:=case when evidence is not null or prior->'availability_snapshot'->'assessment'->>'fingerprint'=a->>'fingerprint'
    or exists(select 1 from public.schedule_publication_overrides o where o.workspace_id=w
     and o.publication_id=(prior->>'publication_id')::uuid and o.finding_id=a->>'fingerprint' and s.id=any(o.source_shift_ids)) then 'accepted' else 'new' end;
   if s.employee_id is null and exists(select 1 from public.audit_events ev where ev.workspace_id=w and ev.action='schedule.conflict_accepted'
     and ev.target_id=s.id::text and ev.metadata->'assessment'->>'fingerprint'=a->>'fingerprint') then state:='accepted'; end if;
  end if;
  warning:=state is not null;
  select string_agg(r->>'message',' ' order by ord) into message from jsonb_array_elements(a->'reasons') with ordinality r(r,ord);
  tier:=case when not warning then 'blocker' when state='new' and a->>'warning_policy'='confirm' then 'risk' else 'note' end;
  findings:=findings||jsonb_build_array(jsonb_build_object('id',a->>'fingerprint',
   'code',case when not exists(select 1 from jsonb_array_elements(a->'reasons') r where r->>'code'<>'availability') then 'availability' else 'schedule_conflict' end,
   'conflict_severity',coalesce(a->>'conflict_severity',case when a->>'warning_policy'='confirm' then 'confirm' else 'warn' end),
   'severity',case when warning then 'soft' else 'hard' end,'overrideable',warning,'tier',tier,'introduced',state is distinct from 'accepted',
   'location_id',s.location_id,'location_name',s.location_name,'employee_id',s.employee_id,'employee_name',nullif(s.employee_name,''),
   'scheduled_date',s.scheduled_date,'shift_ids',jsonb_build_array(s.id),'message',left(coalesce(message,'Review this assignment before publishing.'),500))
   ||case when warning then jsonb_build_object('availability_state',state,'warning_policy',a->>'warning_policy') else '{}'::jsonb end);
 end loop;
 unsigned:=(payload-'fingerprint'-'status')||jsonb_build_object('findings',findings,'availability_assessments',signatures,'department_ids',to_jsonb(departments),'include_no_department',coalesce(include_no_department,true));
 return unsigned||jsonb_build_object('status',case
  when exists(select 1 from jsonb_array_elements(findings) f where f->>'severity'='hard' and coalesce(f->>'tier','blocker')<>'note') then 'hard_blocked'
  when exists(select 1 from jsonb_array_elements(findings) f where coalesce(f->>'tier','blocker')<>'note' and (coalesce((f->>'introduced')::boolean,true) or not (f->>'overrideable')::boolean)) then 'override_required'
  else 'publish_ready' end,'fingerprint',encode(extensions.digest(convert_to(unsigned::text,'UTF8'),'sha256'),'hex'));
end; $function$
;

-- Team availability at the locations availability.team_read reaches; people
-- with no location to owners and admins.
CREATE OR REPLACE FUNCTION public.weekly_team_read_service(actor uuid, w uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; read_scope uuid[]; org_wide boolean;
begin
 read_scope:=app_private.scope_set(actor,w,'availability.team_read');
 -- Nowhere to read the team's availability: asked with nobody named, the core says
 -- why; with no live location in the workspace, only the people with none show.
 if cardinality(read_scope)=0 and (app_private.authz_reason(actor,w,'availability.team_read') is distinct from 'out_of_scope'
  or exists(select 1 from public.locations l where l.workspace_id=w and l.deleted_at is null)) then
  perform app_private.authorize(actor,w,'availability.team_read');
 end if;
 org_wide:=app_private.authz_reason(actor,w,'availability.team_read','{}'::uuid[]) is null;
 with scope as materialized (
  select l.id,l.name,l.sort_order from public.locations l where l.workspace_id=w and l.archived_at is null
   and l.id=any(read_scope)
 ), people as materialized (
  select e.id,e.employee_code,coalesce(nullif(e.preferred_name,''),e.first_name)||' '||e.last_name display_name,
   coalesce((select jsonb_agg(a.location_id order by a.location_id) from public.employee_location_assignments a
    join scope s on s.id=a.location_id where a.workspace_id=w and a.employee_id=e.id and a.ended_at is null),'[]') location_ids,
   p.employee_id is not null submitted,coalesce(p.preference,public.empty_weekly_preference(s.availability_input_mode)) preference,
   (public.weekly_preference_manager_scope(actor,w,e.id,'availability.read')
    or public.weekly_preference_manager_scope(actor,w,e.id,'availability.manage')) can_open
  from public.employee_profiles e
  join public.workspace_scheduling_settings s on s.workspace_id=e.workspace_id
  left join public.employee_weekly_preferences p on p.workspace_id=e.workspace_id and p.employee_id=e.id
  where e.workspace_id=w and e.archived_at is null and (
   exists(select 1 from public.employee_location_assignments a join scope l on l.id=a.location_id
    where a.workspace_id=w and a.employee_id=e.id and a.ended_at is null)
   or (not exists(select 1 from public.employee_location_assignments a where a.workspace_id=w and a.employee_id=e.id and a.ended_at is null)
    and org_wide)
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
end; $function$
;

