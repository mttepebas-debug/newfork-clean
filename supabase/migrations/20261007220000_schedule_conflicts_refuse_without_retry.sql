-- BL-958 (ACIL-40001, KK-211), Schedule's share: Schedule's editing,
-- template, auto-fill, default-hours and undo services refused a lasting
-- conflict (an old revision, an expired edit, a reused request key, a changed
-- review) with SQLSTATE 40001. PostgREST takes 40001 for a passing
-- serialization failure and runs the same request again without end, holding
-- one of its pooled connections; about ten such requests stop the API for
-- every workspace. These refusals now answer PT409, which PostgREST hands back
-- at once; the sentence stays. The edit conflicts the screen acts on carry
-- their key in the hint (schedule.edit_lease_expired,
-- schedule.edit_session_stale), and the API names them from it
-- (apps/api/src/schedule/schedule-routes.ts). Publishing and unpublishing
-- already turn a 40001 into PT409 and stay as they are.
-- Bodies are today's definitions from supabase/schema.sql; only the error
-- codes and those hints change (33 refusals in 15 functions).

CREATE OR REPLACE FUNCTION "public"."add_schedule_pending_op_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_session_id" "uuid", "target_op_type" "text", "target_shift_id" "uuid" DEFAULT NULL::"uuid", "target_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    raise exception 'edit lease expired' using errcode='PT409', hint = 'schedule.edit_lease_expired';
  end if;
  -- The edit's locations are still the person's to edit (B-3).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => target_session.location_ids);

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
$$;

CREATE OR REPLACE FUNCTION "public"."apply_schedule_auto_fill_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_session_id" "uuid", "expected_session_revision" integer, "expected_fingerprint" "text", "assignments" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare target_session public.schedule_edit_sessions%rowtype; preview jsonb; assignment jsonb; proposal jsonb;
  applied jsonb:='[]'::jsonb; rejected jsonb:='[]'::jsonb; shift_row public.schedule_edit_session_shifts%rowtype; employee uuid;
begin
 perform public.availability_lock_workspace(target_workspace_id);
  if jsonb_typeof(assignments)<>'array' then raise exception 'auto-fill assignments must be an array' using errcode='22023'; end if;
  select * into target_session from public.schedule_edit_sessions s where s.id=target_session_id and s.workspace_id=target_workspace_id for update;
  if target_session.id is null or target_session.holder_user_id<>actor_user_id then raise exception 'edit session not found' using errcode='P0002'; end if;
  if target_session.revision<>expected_session_revision then raise exception 'stale auto-fill preview' using errcode='PT409'; end if;
  preview:=public.preview_schedule_auto_fill_service(actor_user_id,target_workspace_id,target_session_id);
  if preview->>'fingerprint'<>expected_fingerprint then raise exception 'stale auto-fill preview' using errcode='PT409'; end if;
  for assignment in select value from jsonb_array_elements(assignments) loop
    select value into proposal from jsonb_array_elements(preview->'proposals') where value->>'shift_id'=assignment->>'shift_id';
    employee:=(assignment->>'employee_id')::uuid;
    select * into shift_row from public.schedule_edit_session_shifts where session_id=target_session.id and id=(assignment->>'shift_id')::uuid and employee_id is null;
    if proposal is null or shift_row.id is null or not exists(select 1 from jsonb_array_elements(proposal->'candidates') c where c->>'employee_id'=assignment->>'employee_id')
      or exists(select 1 from public.schedule_edit_session_shifts x where x.session_id=target_session.id and x.employee_id=employee
        and tsrange(x.scheduled_date+x.start_time,x.scheduled_date+x.end_time+case when x.end_time<=x.start_time then interval '1 day' else interval '0' end,'[)')
          && tsrange(shift_row.scheduled_date+shift_row.start_time,shift_row.scheduled_date+shift_row.end_time+case when shift_row.end_time<=shift_row.start_time then interval '1 day' else interval '0' end,'[)')) then
      rejected:=rejected||jsonb_build_array(jsonb_build_object('shift_id',assignment->>'shift_id','reason','Assignment is no longer eligible'));
    else
      update public.schedule_edit_session_shifts set employee_id=employee,revision=revision+1,updated_at=now() where session_id=target_session.id and id=shift_row.id;
      applied:=applied||jsonb_build_array(jsonb_build_object('shift_id',shift_row.id,'employee_id',employee));
    end if;
  end loop;
  if jsonb_array_length(applied)>0 then update public.schedule_edit_sessions set revision=revision+1,dirty=true,last_heartbeat=now(),expires_at=now()+interval '4 minutes' where id=target_session.id; end if;
  return jsonb_build_object('status','applied','applied',applied,'rejected',rejected,'session',public.get_schedule_edit_session_service(actor_user_id,target_workspace_id,target_session.id));
end; $$;

CREATE OR REPLACE FUNCTION "public"."apply_schedule_default_hours_service"("actor" "uuid", "w" "uuid", "sid" "uuid", "command" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare review jsonb; row_value jsonb; result jsonb; prior public.schedule_default_hours_reviews%rowtype; rev integer; key uuid:=(command->>'idempotency_key')::uuid;
begin
 if key is null then raise exception 'A retry key is required' using errcode='22023'; end if;
 perform public.availability_lock_workspace(w);
 perform public.get_schedule_edit_session_service(actor,w,sid);
 select * into prior from public.schedule_default_hours_reviews where workspace_id=w and actor_id=actor and operation_id=key;
 if found then
  if prior.session_id<>sid or prior.command<>command then raise exception 'Retry key was already used for a different review' using errcode='PT409'; end if;
  return public.get_schedule_edit_session_service(actor,w,sid);
 end if;
 -- Settings uses atomic row updates. Hold these source rows while reviewing and
 -- applying so a changed default cannot slip between the two operations.
 perform 1 from public.shift_types t where t.workspace_id=w and t.id in(select s.shift_type_id from public.schedule_edit_session_shifts s where s.workspace_id=w and s.session_id=sid and s.id in(select value::uuid from jsonb_array_elements_text(command->'shift_ids'))) order by t.id for share;
 review:=public.preview_schedule_default_hours_service(actor,w,sid,command);
 if review->>'fingerprint' is distinct from command->>'fingerprint' then raise exception 'Defaults, shifts or conflicts changed; review again' using errcode='PT409'; end if;
 if (review->>'blocked_count')::integer>0 or (review->>'changed_count')::integer=0 then raise exception 'Resolve blocked shifts or choose changed defaults before applying' using errcode='23514'; end if;
 if exists(select 1 from jsonb_array_elements(review->'shifts') x where (x->>'can_apply')::boolean
  and x->'after_assessment'->>'operation'='warning_requires_override'
  and x->'after_assessment'->>'warning_policy'='confirm'
  and not coalesce((x->'after_assessment'->>'override_recorded')::boolean,false))
  and not coalesce((command->>'confirm_availability')::boolean,false) then
  raise exception 'Confirm the current availability conflicts before applying defaults' using errcode='22023'; end if;
  rev:=(review->>'session_revision')::integer;
 for row_value in select value from jsonb_array_elements(review->'shifts') where (value->>'can_apply')::boolean loop
  result:=public.mutate_schedule_edit_shift_service(actor,w,sid,rev,'update',(row_value->>'shift_id')::uuid,(row_value->>'shift_revision')::integer,row_value->'after',null);
  rev:=(result->>'revision')::integer;
 end loop;
 insert into public.schedule_default_hours_reviews(workspace_id,actor_id,operation_id,session_id,command,review,result) values(w,actor,key,sid,command,review,result);
 insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata) values(w,actor,'schedule.default_hours_applied','schedule_edit_session',sid::text,
  jsonb_build_object('review_operation_id',key,'fingerprint',review->>'fingerprint','changed_count',review->'changed_count','starts_on',review->'starts_on','ends_on',review->'ends_on'));
 return result;
end $$;

CREATE OR REPLACE FUNCTION "public"."apply_schedule_template_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_session_id" "uuid", "expected_session_revision" integer, "target_template_id" "uuid", "apply_mode" "text", "department_keys" "text"[] DEFAULT NULL::"text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  kept_ids uuid[];
  kept_names text[];
  left_off text[] := '{}'::text[];
  skipped jsonb;
  replaced uuid[] := '{}'::uuid[];
begin
 perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.templates',
   target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.templates'));
 template_scope := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.templates');
 perform public.availability_lock_workspace(target_workspace_id);
  if apply_mode not in ('merge', 'overwrite') then
    raise exception 'invalid template apply mode' using errcode = '22023';
  end if;

  -- No department list: the whole template. Checked the same way as the preview.
  selected_department_ids := app_private.schedule_template_department_ids(target_workspace_id, department_keys);
  include_no_department := coalesce('__no_department__' = any (department_keys), false);

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
    raise exception 'edit lease expired' using errcode = 'PT409', hint = 'schedule.edit_lease_expired';
  end if;

  if target_session.revision <> expected_session_revision then
    raise exception 'session revision stale' using errcode = 'PT409', hint = 'schedule.edit_session_stale';
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

  -- S3 (Mert 2026-10-05): Replace clears only the template's own locations and
  -- departments, never a shift that has started; a published shift is staged
  -- for removal like Delete stages it, a draft-only shift goes.
  if apply_mode = 'overwrite' then
    replaced := array(select app_private.schedule_template_replace_targets(
      target_workspace_id, target_session.id, template_row.id, department_keys));
    update public.schedule_availability_overrides set revoked_at = now()
    where workspace_id = target_workspace_id and shift_id = any (replaced) and revoked_at is null;
    delete from public.schedule_edit_session_shifts session_shift
    where session_shift.session_id = target_session.id
      and session_shift.id = any (replaced)
      and session_shift.source_published_shift_id is null
      and not session_shift.locked;
    update public.schedule_edit_session_shifts session_shift
    set pending_op_type = 'delete', locked = true, revision = session_shift.revision + 1, updated_at = now()
    where session_shift.session_id = target_session.id
      and session_shift.id = any (replaced)
      and (session_shift.source_published_shift_id is not null or session_shift.locked);
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
          -- Excluded from Schedule: the template's shift comes in open (BL-218).
          and not employee.is_excluded_from_schedule
      )
      or exists (
        select 1
        from public.schedule_edit_session_shifts existing_shift
        where existing_shift.session_id = target_session.id
          and existing_shift.employee_id = chosen_employee
          and existing_shift.pending_op_type is distinct from 'delete'
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

    -- Only labels still active in Settings > Shift labels, named as there
    -- (BL-164); the rest are left off and counted (BL-197).
    select coalesce(array_agg(label.id order by tag.ord), '{}'::uuid[]), coalesce(array_agg(label.name order by tag.ord), '{}'::text[])
      into kept_ids, kept_names
    from unnest(coalesce(source.label_ids, '{}'::uuid[])) with ordinality as tag(id, ord)
    join public.shift_labels label
      on label.id = tag.id and label.workspace_id = target_workspace_id and label.archived_at is null;
    left_off := left_off || array(
      select coalesce(nullif(tag.name, ''), 'Unnamed label')
      from unnest(coalesce(source.label_ids, '{}'::uuid[]), coalesce(source.label_names, '{}'::text[])) as tag(id, name)
      where tag.id is not null and not tag.id = any (kept_ids));

    insert into public.schedule_edit_session_shifts(id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, hide_time_on_badge, label_ids, label_names, note, unpaid_break_minutes)
    values(gen_random_uuid(), target_workspace_id, target_session.id, source.location_id, chosen_employee, source.job_id, source.shift_type_id, target_date, source.start_time, source.end_time, source.time_basis, source.time_snapshot, source.time_timezone, source.hide_time_on_badge, kept_ids, kept_names, source.note, source.unpaid_break_minutes);
    applied_count := applied_count + 1;
  end loop;

  -- What was not applied, one entry per kind and name; BL-197 fills archived labels.
  select coalesce(jsonb_agg(jsonb_build_object('kind', 'archived_label', 'name', x.name, 'shift_count', x.n) order by x.name), '[]'::jsonb)
    into skipped
  from (select name, count(*)::integer n from unnest(left_off) name group by name) x;

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
      'converted_open_count', converted_count,
      'skipped', skipped
    )
  );

  return jsonb_build_object(
    'status', 'applied',
    'mode', apply_mode,
    'applied_shift_count', applied_count,
    'converted_open_count', converted_count,
    'removed_shift_count', cardinality(replaced),
    'skipped', skipped,
    'session', public.get_schedule_edit_session_service(
      actor_user_id,
      target_workspace_id,
      target_session.id
    )
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."bulk_delete_schedule_edit_shifts_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_shift_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
    raise exception 'shift revision stale' using errcode = 'PT409', hint = 'schedule.edit_session_stale';
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
$$;

CREATE OR REPLACE FUNCTION "public"."create_schedule_shifts_batch_service"("actor" "uuid", "w" "uuid", "sid" "uuid", "expected_revision" integer, "shifts" "jsonb", "request_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  raise exception 'Not allowed' using errcode = '42501', detail = 'schedule.edit', hint = 'authz.out_of_scope'; end if;
 -- The edit's locations are still the person's to edit (B-3).
 perform app_private.authorize(actor, w, 'schedule.edit', target_locations => session.location_ids);
 perform app_private.authorize(actor, w, 'schedule.edit', target_locations => array(
  select distinct nullif(v->>'location_id','')::uuid from jsonb_array_elements(shifts) v));
 if session.status<>'active' or session.expires_at<=now() then
  raise exception 'Schedule editing expired; reopen the schedule' using errcode='PT409'; end if;
 select * into receipt from public.schedule_shift_batch_commands c
  where c.workspace_id=w and c.actor_user_id=actor and c.idempotency_key=request_key;
 if found then
  if receipt.session_id is distinct from sid or receipt.expected_revision is distinct from expected_revision or receipt.shifts is distinct from shifts then
   raise exception 'Request key already used for a different batch' using errcode='PT409'; end if;
  return public.get_schedule_edit_session_service(actor,w,sid);
 end if;
 if session.revision is distinct from expected_revision then
  raise exception 'Schedule editing changed; reload before pasting' using errcode='PT409'; end if;
 next_revision:=session.revision;
 for item in select value from jsonb_array_elements(shifts) loop
  result:=public.mutate_schedule_edit_shift_service(actor,w,sid,next_revision,'create',gen_random_uuid(),null,item,gen_random_uuid());
  next_revision:=(result->>'revision')::integer;
 end loop;
 insert into public.schedule_shift_batch_commands(workspace_id,actor_user_id,idempotency_key,session_id,expected_revision,shifts)
  values(w,actor,request_key,sid,expected_revision,shifts);
 return result;
end; $$;

CREATE OR REPLACE FUNCTION "public"."delete_schedule_template_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_template_id" "uuid", "expected_revision" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare old_name text;
begin
 perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.templates', target_locations => case
   when not exists (select 1 from public.schedule_templates t where t.id = target_template_id and t.workspace_id = target_workspace_id) then null
   else public.live_location_ids(target_workspace_id, array(select distinct s.location_id from public.schedule_template_shifts s
     where s.template_id = target_template_id and s.workspace_id = target_workspace_id))
 end);
 delete from public.schedule_templates where id=target_template_id and workspace_id=target_workspace_id and revision=expected_revision returning name into old_name;
 if old_name is null then raise exception 'schedule template revision stale' using errcode='PT409'; end if;
 insert into public.schedule_template_events(workspace_id,template_id,template_name,action,actor_user_id) values(target_workspace_id,target_template_id,old_name,'deleted',actor_user_id);
 return jsonb_build_object('status','deleted','template_id',target_template_id);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."heartbeat_schedule_edit_session_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_session_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  -- The edit's locations are still the person's to edit (B-3).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => session.location_ids)
  from public.schedule_edit_sessions session
  where session.id = target_session_id and session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id;
  update public.schedule_edit_sessions session
  set last_heartbeat = now(), expires_at = now() + interval '4 minutes'
  where session.id = target_session_id and session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id and session.status = 'active'
    and session.expires_at > now();
  if not found then
    raise exception 'edit lease expired' using errcode = 'PT409', hint = 'schedule.edit_lease_expired';
  end if;
  return public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."mutate_schedule_edit_shift_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_session_id" "uuid", "expected_session_revision" integer, "operation" "text", "target_shift_id" "uuid", "expected_shift_revision" integer DEFAULT NULL::integer, "shift_payload" "jsonb" DEFAULT NULL::"jsonb", "request_idempotency_key" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  result jsonb;
  reach uuid[];
  write_row boolean := false;
  target_session public.schedule_edit_sessions%rowtype;
  target_shift public.schedule_edit_session_shifts%rowtype;
  mutated_shift record;
  override_note text;
  audited_shift_id uuid;
begin
  perform public.availability_lock_workspace(target_workspace_id);
  if operation not in ('create', 'update', 'delete', 'restore') then
    raise exception 'invalid shift operation' using errcode = '22023';
  end if;
  reach := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.edit');

  -- a. Delete and restore: a published shift is marked, an unpublished one goes.
  if operation in ('create', 'update') then
    write_row := true;
  else
    select * into target_session
    from public.schedule_edit_sessions session
    where session.id = target_session_id
      and session.workspace_id = target_workspace_id
    for update;

    if target_session.id is null or target_session.holder_user_id <> actor_user_id then
      raise exception 'edit session not found' using errcode = 'P0002';
    end if;
    if target_session.status <> 'active' or target_session.expires_at <= now() then
      raise exception 'edit lease expired' using errcode = 'PT409', hint = 'schedule.edit_lease_expired';
    end if;
    if target_session.revision <> expected_session_revision then
      raise exception 'session revision stale' using errcode = 'PT409', hint = 'schedule.edit_session_stale';
    end if;

    select * into target_shift
    from public.schedule_edit_session_shifts shift
    where shift.session_id = target_session_id
      and shift.id = target_shift_id
      and shift.revision = expected_shift_revision
      and shift.location_id = any(reach)
    for update;

    if target_shift.id is null then
      raise exception 'shift revision stale' using errcode = 'PT409', hint = 'schedule.edit_session_stale';
    end if;

    if operation = 'restore' then
      if target_shift.source_published_shift_id is null
        or target_shift.pending_op_type is distinct from 'delete' then
        raise exception 'shift restore unavailable' using errcode = '22023';
      end if;

      update public.schedule_edit_session_shifts shift
      set pending_op_type = null,
          locked = true,
          revision = revision + 1,
          updated_at = now()
      where shift.session_id = target_session_id
        and shift.id = target_shift_id;

      update public.schedule_edit_sessions
      set revision = revision + 1,
          dirty = true,
          last_heartbeat = now(),
          expires_at = now() + interval '4 minutes'
      where id = target_session_id;

      result := public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
    elsif target_shift.source_published_shift_id is null and not target_shift.locked then
      write_row := true;
    else
      update public.schedule_edit_session_shifts shift
      set pending_op_type = 'delete',
          locked = true,
          revision = revision + 1,
          updated_at = now()
      where shift.session_id = target_session_id
        and shift.id = target_shift_id;

      update public.schedule_edit_sessions
      set revision = revision + 1,
          dirty = true,
          last_heartbeat = now(),
          expires_at = now() + interval '4 minutes'
      where id = target_session_id;

      result := public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
    end if;
  end if;

  -- b. Write the row: create, update, or delete an unpublished shift. The
  -- block keeps its own copy of the id and payload, as the old inner layer did.
  if write_row then
    <<write_shift>>
    declare
      row_shift_id uuid := target_shift_id;
      row_payload jsonb := shift_payload;
      target_location_id uuid;
      target_employee_id uuid;
      target_job_id uuid;
      target_shift_type_id uuid;
      target_scheduled_date date;
      target_start_time time;
      target_end_time time;
      target_unpaid_break_minutes integer;
      target_hide_time_on_badge boolean;
      target_note text;
      kept public.schedule_edit_session_shifts%rowtype;
    begin
      select * into target_session from public.schedule_edit_sessions session
      where session.id = target_session_id and session.workspace_id = target_workspace_id
      for update;
      if target_session.id is null or target_session.holder_user_id <> actor_user_id then
        raise exception 'edit session not found' using errcode = 'P0002';
      end if;
      if target_session.status <> 'active' or target_session.expires_at <= now() then
        raise exception 'edit lease expired' using errcode = 'PT409', hint = 'schedule.edit_lease_expired';
      end if;
      if target_session.revision <> expected_session_revision then
        raise exception 'session revision stale' using errcode = 'PT409', hint = 'schedule.edit_session_stale';
      end if;

      if operation in ('create', 'update') then
        row_payload := public.normalize_schedule_time_source(target_workspace_id,row_payload,(select to_jsonb(s) from public.schedule_edit_session_shifts s where s.session_id=target_session_id and s.id=row_shift_id));
        target_location_id := (row_payload->>'location_id')::uuid;
        target_employee_id := nullif(row_payload->>'employee_id', '')::uuid;
        target_job_id := (row_payload->>'job_id')::uuid;
        target_shift_type_id := nullif(row_payload->>'shift_type_id', '')::uuid;
        target_scheduled_date := (row_payload->>'scheduled_date')::date;
        target_start_time := nullif(row_payload->>'start_time','')::time;
        target_end_time := nullif(row_payload->>'end_time','')::time;
        -- A field the payload leaves out keeps the shift's own value; a new
        -- shift starts from the default (BL-292, EKRAN-01 #11).
        select * into kept from public.schedule_edit_session_shifts s
        where s.session_id = target_session_id and s.id = row_shift_id;
        target_unpaid_break_minutes := case when row_payload ? 'unpaid_break_minutes'
          then coalesce((row_payload->>'unpaid_break_minutes')::integer, 0)
          else coalesce(kept.unpaid_break_minutes, 0) end;
        target_hide_time_on_badge := case when row_payload ? 'hide_time_on_badge'
          then coalesce((row_payload->>'hide_time_on_badge')::boolean, false)
          else coalesce(kept.hide_time_on_badge, false) end;
        target_note := case when row_payload ? 'note' then coalesce(row_payload->>'note', '')
          else coalesce(kept.note, '') end;
        if target_start_time = target_end_time then
          raise exception 'Start and end time cannot be the same.' using errcode = '22023';
        end if;
        if char_length(target_note) > 500
          or target_unpaid_break_minutes not in (0, 15, 30, 45, 60)
          or target_scheduled_date not between target_session.week_start and target_session.week_start + 6 then
          raise exception 'invalid shift values' using errcode = '22023';
        end if;
        perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => array[target_location_id]);
        if not exists (select 1 from public.jobs job where job.id = target_job_id and job.workspace_id = target_workspace_id and job.archived_at is null)
          or not exists (select 1 from public.locations location where location.id = target_location_id and location.workspace_id = target_workspace_id and location.archived_at is null)
          or (target_shift_type_id is not null and not exists (select 1 from public.shift_types shift_type where shift_type.id = target_shift_type_id and shift_type.workspace_id = target_workspace_id and shift_type.archived_at is null))
          or (target_employee_id is not null and not exists (
            select 1 from public.employee_profiles employee
            join public.employee_location_assignments location_assignment
              on location_assignment.employee_id = employee.id and location_assignment.location_id = target_location_id and location_assignment.ended_at is null
            join public.employee_job_assignments job_assignment
              on job_assignment.employee_id = employee.id and job_assignment.job_id = target_job_id and job_assignment.ended_at is null
            where employee.id = target_employee_id and employee.workspace_id = target_workspace_id and employee.archived_at is null
          )) then
          raise exception 'invalid shift reference' using errcode = '23503';
        end if;
      end if;

      if operation = 'create' then
        if request_idempotency_key is not null and exists (
          select 1 from public.schedule_edit_session_shifts shift
          where shift.session_id = target_session_id and shift.idempotency_key = request_idempotency_key
        ) then
          result := public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
          exit write_shift;
        end if;
        row_shift_id:=coalesce(row_shift_id,gen_random_uuid());
        perform public.schedule_prepare_availability_assignment(actor_user_id,target_workspace_id,row_payload||jsonb_build_object('id',row_shift_id,'session_id',target_session_id),null);
        insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, idempotency_key) values (row_shift_id, target_workspace_id, target_session_id, target_location_id, target_employee_id, target_job_id, target_shift_type_id, target_scheduled_date, target_start_time, target_end_time, row_payload->>'time_basis', row_payload->'time_snapshot', row_payload->>'time_timezone', target_unpaid_break_minutes, target_hide_time_on_badge, target_note, request_idempotency_key);
      elsif operation = 'update' then
        perform public.schedule_prepare_availability_assignment(actor_user_id,target_workspace_id,row_payload||jsonb_build_object('id',row_shift_id,'session_id',target_session_id),(select to_jsonb(s) from public.schedule_edit_session_shifts s where s.workspace_id=target_workspace_id and s.session_id=target_session_id and s.id=row_shift_id));
        update public.schedule_edit_session_shifts shift
        set location_id = target_location_id, employee_id = target_employee_id,
          job_id = target_job_id, shift_type_id = target_shift_type_id,
          scheduled_date = target_scheduled_date, start_time = target_start_time,
          end_time = target_end_time, time_basis=row_payload->>'time_basis', time_snapshot=row_payload->'time_snapshot', time_timezone=row_payload->>'time_timezone', unpaid_break_minutes = target_unpaid_break_minutes, hide_time_on_badge = target_hide_time_on_badge, note = target_note,
          revision = revision + 1, updated_at = now()
        where shift.session_id = target_session_id and shift.id = row_shift_id
          and shift.revision = expected_shift_revision
          and shift.location_id = any(reach);
        if not found then
          raise exception 'shift revision stale' using errcode = 'PT409', hint = 'schedule.edit_session_stale';
        end if;
      else
        update public.schedule_availability_overrides set revoked_at=now() where workspace_id=target_workspace_id and shift_id=row_shift_id and revoked_at is null;
        delete from public.schedule_edit_session_shifts shift
        where shift.session_id = target_session_id and shift.id = row_shift_id
          and shift.revision = expected_shift_revision
          and shift.location_id = any(reach);
        if not found then
          raise exception 'shift revision stale' using errcode = 'PT409', hint = 'schedule.edit_session_stale';
        end if;
      end if;

      update public.schedule_edit_sessions
      set revision = revision + 1, dirty = true,
        last_heartbeat = now(), expires_at = now() + interval '4 minutes'
      where id = target_session_id;
      result := public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
    end write_shift;

    -- An updated published shift becomes a pending update and unlocks.
    if operation = 'update' then
      update public.schedule_edit_session_shifts shift
      set pending_op_type = case
            when shift.source_published_shift_id is not null
             and shift.pending_op_type is distinct from 'delete'
            then 'update'
            else shift.pending_op_type
          end,
          locked = case
            when shift.source_published_shift_id is not null then false
            else shift.locked
          end
      where shift.session_id = target_session_id
        and shift.id = target_shift_id;

      result := public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
    end if;
  end if;

  -- c. Labels: the catalog's name for an active label of this workspace, the
  -- shift's own copy for a label it already carries; anything else is refused.
  if operation in ('create', 'update') and shift_payload is not null then
    <<labels>>
    declare
      tag_ids uuid[];
      tag_names text[];
    begin
      select * into target_shift from public.schedule_edit_session_shifts shift
      where shift.session_id = target_session_id
        and shift.id = target_shift_id
        and shift.workspace_id = target_workspace_id;
      if target_shift.id is null then
        exit labels;
      end if;

      select coalesce(array_agg(requested.id order by requested.ord), '{}'::uuid[]),
             coalesce(array_agg(coalesce(catalog.name, kept.name) order by requested.ord), '{}'::text[])
      into tag_ids, tag_names
      from (
        select tag.value::uuid as id, min(tag.ord) as ord
        from jsonb_array_elements_text(coalesce(shift_payload->'label_ids', '[]'::jsonb)) with ordinality as tag(value, ord)
        group by tag.value::uuid
      ) requested
      left join public.shift_labels catalog
        on catalog.id = requested.id
       and catalog.workspace_id = target_workspace_id
       and catalog.archived_at is null
      left join lateral (
        select copy.name from unnest(target_shift.label_ids, target_shift.label_names) as copy(id, name)
        where copy.id = requested.id limit 1
      ) kept on true;

      if array_position(tag_names, null) is not null then
        raise exception 'invalid shift reference' using errcode = '23503';
      end if;

      update public.schedule_edit_session_shifts shift
         set label_ids = tag_ids, label_names = tag_names
       where shift.session_id = target_session_id
         and shift.id = target_shift_id
         and shift.workspace_id = target_workspace_id;
      result := public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
    end labels;
  end if;

  -- d. A person missing a required document is never on a shift that day.
  if operation in ('create', 'update') then
    select shift.employee_id, shift.scheduled_date
    into mutated_shift
    from public.schedule_edit_session_shifts shift
    where shift.workspace_id = target_workspace_id
      and shift.session_id = target_session_id
      and shift.id = target_shift_id
    limit 1;

    if mutated_shift.employee_id is not null
      and public.employee_has_hard_document_schedule_conflict_service(
        target_workspace_id,
        mutated_shift.employee_id,
        mutated_shift.scheduled_date
      ) then
      raise exception 'employee document hard conflict' using errcode = '23514';
    end if;
  end if;

  -- e. An overridden soft conflict is audited once per request.
  override_note := btrim(coalesce(shift_payload->>'conflict_override_note', ''));

  if operation in ('create', 'update') and char_length(override_note) >= 10 then
    select shift.id
    into audited_shift_id
    from public.schedule_edit_session_shifts shift
    where shift.workspace_id = target_workspace_id
      and shift.session_id = target_session_id
      and (
        shift.id = target_shift_id
        or (
          operation = 'create'
          and request_idempotency_key is not null
          and shift.idempotency_key = request_idempotency_key
        )
      )
    order by (shift.id = target_shift_id) desc
    limit 1;

    if audited_shift_id is not null
      and not exists (
        select 1
        from public.audit_events event
        where event.workspace_id = target_workspace_id
          and event.action = 'schedule.soft_conflict_overridden'
          and event.target_type = 'schedule_edit_session_shift'
          and event.target_id = audited_shift_id::text
          and request_idempotency_key is not null
          and event.metadata->>'idempotency_key' = request_idempotency_key::text
      ) then
      insert into public.audit_events (
        workspace_id,
        actor_user_id,
        action,
        target_type,
        target_id,
        metadata
      ) values (
        target_workspace_id,
        actor_user_id,
        'schedule.soft_conflict_overridden',
        'schedule_edit_session_shift',
        audited_shift_id::text,
        jsonb_build_object(
          'session_id', target_session_id,
          'operation', operation,
          'idempotency_key', request_idempotency_key,
          'note', override_note
        )
      );
    end if;
  end if;

  return result;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."normalize_schedule_time_source"("w" "uuid", "payload" "jsonb", "previous" "jsonb" DEFAULT NULL::"jsonb", "preserve_saved_timezone" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare basis text; snap jsonb; tz text; source_type uuid; source_revision integer; ver public.shift_type_time_versions%rowtype;
begin
  select timezone into tz from public.locations where id=(payload->>'location_id')::uuid and workspace_id=w;
  if tz is null then raise exception 'invalid shift location' using errcode='23503'; end if;
  if previous is not null and payload->>'location_id'=previous->>'location_id' then
    tz:=coalesce(nullif(previous->>'time_timezone',''),tz);
  elsif preserve_saved_timezone then
    tz:=coalesce(nullif(payload->>'time_timezone',''),tz);
  end if;
  if not app_private.timezone_name_valid(tz) then
    raise exception 'Invalid shift timezone' using errcode='22023';
  end if;
  basis:=payload->>'time_basis';
  if basis is null and previous is not null then
    if previous->>'time_basis'='type_default' and
      (nullif(payload->>'start_time','')::time,nullif(payload->>'end_time','')::time) is distinct from
      (nullif(previous->>'start_time','')::time,nullif(previous->>'end_time','')::time) then
      raise exception 'Refresh the schedule before changing reference hours' using errcode='PT409';
    end if;
    basis:=previous->>'time_basis'; snap:=previous->'time_snapshot';
  else snap:=payload->'time_snapshot'; end if;
  basis:=coalesce(basis,'explicit');
  if basis not in ('explicit','type_default') then raise exception 'invalid shift time source' using errcode='22023'; end if;
  if basis='type_default' then
    if snap is null or snap='null'::jsonb then
      source_type:=(payload->>'shift_type_id')::uuid;
      select default_revision into source_revision from public.shift_types where id=source_type and workspace_id=w;
    else
      source_type:=(snap->>'shift_type_id')::uuid; source_revision:=(snap->>'default_revision')::integer;
    end if;
    select * into ver from public.shift_type_time_versions where workspace_id=w and shift_type_id=source_type and revision=source_revision;
    if ver.shift_type_id is null or ver.start_time is null or ver.end_time is null then
      raise exception 'This shift type has no default hours. Enter start and end time.' using errcode='23514';
    end if;
    if snap is not null and snap<>'null'::jsonb and
      ((snap->>'start_time')::time,(snap->>'end_time')::time) is distinct from (ver.start_time,ver.end_time) then
      raise exception 'Shift default hours changed; refresh the reference before saving' using errcode='PT409';
    end if;
    if previous is not null and payload->>'location_id'=previous->>'location_id' then
      tz:=coalesce(nullif(previous->>'time_timezone',''),tz);
    end if;
    snap:=jsonb_build_object('shift_type_id',source_type,'default_revision',source_revision,
      'start_time',to_char(ver.start_time,'HH24:MI'),'end_time',to_char(ver.end_time,'HH24:MI'),'timezone',tz);
    payload:=payload||jsonb_build_object('start_time',to_char(ver.start_time,'HH24:MI'),'end_time',to_char(ver.end_time,'HH24:MI'));
  else
    if nullif(payload->>'start_time','') is null or nullif(payload->>'end_time','') is null then
      raise exception 'Enter start and end time.' using errcode='22023'; end if;
    if (payload->>'start_time')::time=(payload->>'end_time')::time then
      raise exception 'Start and end time cannot be the same.' using errcode='22023'; end if;
    snap:=null;
    if previous is not null and payload->>'location_id'=previous->>'location_id' then tz:=coalesce(nullif(previous->>'time_timezone',''),tz); end if;
  end if;
  return payload||jsonb_build_object('time_basis',basis,'time_snapshot',snap,'time_timezone',tz);
end; $$;

CREATE OR REPLACE FUNCTION "public"."preview_schedule_auto_fill_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_session_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare target_session public.schedule_edit_sessions%rowtype; open_shift record; candidate_payload jsonb; recommended uuid;
  proposals jsonb:='[]'::jsonb; unfilled jsonb:='[]'::jsonb; unsigned jsonb;
begin
  select * into target_session from public.schedule_edit_sessions s where s.id=target_session_id and s.workspace_id=target_workspace_id;
  if target_session.id is null or target_session.holder_user_id<>actor_user_id then raise exception 'edit session not found' using errcode='P0002'; end if;
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => target_session.location_ids);
  if target_session.status<>'active' or target_session.expires_at<=now() then raise exception 'edit lease expired' using errcode='PT409', hint = 'schedule.edit_lease_expired'; end if;
  for open_shift in select s.*,l.name location_name,j.name job_name from public.schedule_edit_session_shifts s
    join public.locations l on l.id=s.location_id join public.jobs j on j.id=s.job_id
    where s.session_id=target_session.id and s.employee_id is null order by s.scheduled_date,s.start_time,s.id loop
    with eligible as (
      select e.id employee_id,coalesce(nullif(e.preferred_name,''),e.first_name||' '||e.last_name) employee_name,ja.is_primary,assessed.a->>'fingerprint' availability_fingerprint,
        coalesce((select sum(case when x.end_time<=x.start_time then 1440 else 0 end + extract(epoch from (x.end_time-x.start_time))/60)::integer
          from public.schedule_edit_session_shifts x where x.session_id=target_session.id and x.employee_id=e.id),0) scheduled_minutes
      from public.employee_profiles e
      join public.employee_location_assignments la on la.employee_id=e.id and la.workspace_id=e.workspace_id and la.location_id=open_shift.location_id and la.ended_at is null
      join public.employee_job_assignments ja on ja.employee_id=e.id and ja.workspace_id=e.workspace_id and ja.job_id=open_shift.job_id and ja.ended_at is null
      cross join lateral (select public.assess_weekly_shift_availability(target_workspace_id,e.id,to_jsonb(open_shift)||jsonb_build_object('employee_id',e.id)) a) assessed
      where e.workspace_id=target_workspace_id and e.archived_at is null
      and not exists(select 1 from public.schedule_edit_session_shifts x where x.session_id=target_session.id and x.employee_id=e.id
        and tsrange(x.scheduled_date+x.start_time,x.scheduled_date+x.end_time+case when x.end_time<=x.start_time then interval '1 day' else interval '0' end,'[)')
          && tsrange(open_shift.scheduled_date+open_shift.start_time,open_shift.scheduled_date+open_shift.end_time+case when open_shift.end_time<=open_shift.start_time then interval '1 day' else interval '0' end,'[)'))
      and assessed.a->>'operation'='allowed' and not coalesce((assessed.a->>'has_availability_conflict')::boolean,false)
      and not exists(select 1 from jsonb_array_elements(proposals) p where (p->>'recommended_employee_id')::uuid=e.id
        and tsrange((p->>'scheduled_date')::date+(p->>'start_time')::time,(p->>'scheduled_date')::date+(p->>'end_time')::time+case when (p->>'end_time')::time<=(p->>'start_time')::time then interval '1 day' else interval '0' end,'[)')
          && tsrange(open_shift.scheduled_date+open_shift.start_time,open_shift.scheduled_date+open_shift.end_time+case when open_shift.end_time<=open_shift.start_time then interval '1 day' else interval '0' end,'[)'))
    ), ranked as (select *,min(scheduled_minutes) over() min_minutes from eligible)
    select coalesce(jsonb_agg(jsonb_build_object('employee_id',employee_id,'employee_name',employee_name,'scheduled_minutes',scheduled_minutes,
      'availability_fingerprint',availability_fingerprint,'primary_job',is_primary,'reasons',to_jsonb(array_remove(array[case when scheduled_minutes=min_minutes then 'Fewest scheduled hours' end,case when is_primary then 'Primary job' end,'Available']::text[],null)))
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
end; $$;

CREATE OR REPLACE FUNCTION "public"."preview_schedule_default_hours_service"("actor" "uuid", "w" "uuid", "sid" "uuid", "command" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare session public.schedule_edit_sessions%rowtype; shift record; proposed jsonb; before_a jsonb; after_a jsonb;
 rows jsonb:='[]'; evidence jsonb:='[]'; row_value jsonb; peers jsonb; before_count integer; after_count integer;
 original_span tstzrange; proposed_span tstzrange; reason text; can_override boolean; fingerprint text;
 ids uuid[]; starts date; ends date; changed integer:=0; blocked integer:=0; edit_scope uuid[]; fmt text; overlap text;
begin
 if jsonb_typeof(command) is distinct from 'object' or jsonb_typeof(command->'shift_ids') is distinct from 'array'
  or jsonb_array_length(command->'shift_ids') not between 1 and 200 then raise exception 'Choose 1 to 200 shifts to review' using errcode='22023'; end if;
 select array_agg(value::uuid order by value::uuid) into ids from jsonb_array_elements_text(command->'shift_ids');
 if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Choose each shift once' using errcode='22023'; end if;
 select * into session from public.schedule_edit_sessions where workspace_id=w and id=sid;
 if session.id is null or session.holder_user_id is distinct from actor then raise exception 'Edit session not found' using errcode='42501'; end if;
 if session.status<>'active' or session.expires_at<=now() or session.revision is distinct from (command->>'expected_session_revision')::integer then
  raise exception 'Schedule editing changed; reopen the review' using errcode='PT409'; end if;
 starts:=(command->>'starts_on')::date; ends:=(command->>'ends_on')::date;
 if starts is null or ends is null or starts<session.week_start or ends>session.week_start+6 or ends<starts then
  raise exception 'Choose dates within this schedule week' using errcode='22023'; end if;
 if (select count(*) from public.schedule_edit_session_shifts s where s.workspace_id=w and s.session_id=sid and s.id=any(ids)
  and s.scheduled_date between starts and ends and coalesce(s.pending_op_type,'')<>'delete')<>cardinality(ids) then
  raise exception 'Selected shifts changed or are outside these dates' using errcode='PT409'; end if;
 perform app_private.authorize(actor, w, 'schedule.edit', target_locations => array(
  select distinct s.location_id from public.schedule_edit_session_shifts s where s.workspace_id=w and s.session_id=sid and s.id=any(ids)));
 edit_scope:=app_private.scope_set(actor, w, 'schedule.edit');
 for shift in select s.*,to_jsonb(s) payload,t.default_revision,t.default_start_time,t.default_end_time,t.archived_at type_archived,
  t.name type_name,l.name location_name,l.archived_at location_archived,j.archived_at job_archived,
  coalesce(nullif(concat_ws(' ',coalesce(nullif(e.preferred_name,''),e.first_name),e.last_name),''),'Open shift') employee_name
  from public.schedule_edit_session_shifts s
  join public.locations l on l.id=s.location_id and l.workspace_id=w
  join public.jobs j on j.id=s.job_id and j.workspace_id=w
  left join public.shift_types t on t.id=s.shift_type_id and t.workspace_id=w
  left join public.employee_profiles e on e.id=s.employee_id and e.workspace_id=w
  where s.workspace_id=w and s.session_id=sid and s.id=any(ids) order by s.scheduled_date,s.location_id,s.id loop
  reason:=null; proposed:=null; before_a:=null; after_a:=null; can_override:=false;
  original_span:=app_private.shift_time_range(shift.scheduled_date,shift.start_time,shift.end_time,shift.time_timezone);
  if shift.time_basis<>'type_default' then reason:='Only saved shift-type reference hours are included; explicit hours stay unchanged';
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
   if shift.employee_id is not null and app_private.authz_reason(actor,w,'availability.note_read',target_person=>shift.employee_id) is not null then
    before_a:=jsonb_set(before_a,'{reasons}',(select coalesce(jsonb_agg(r),'[]') from jsonb_array_elements(before_a->'reasons') r where r->>'code'<>'note'));
    after_a:=jsonb_set(after_a,'{reasons}',(select coalesce(jsonb_agg(r),'[]') from jsonb_array_elements(after_a->'reasons') r where r->>'code'<>'note'));
   end if;
   if after_a->>'operation' in('blocked','verification_required') then reason:='Resolve shift hours or approved time off before applying these hours';
   
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
 -- cross-location commitments. Of another shift only its type and hours leave
 -- this helper, which the grid already shows as a ghost (FB-6.1 .5).
 select coalesce(jsonb_agg(payload order by source,id),'[]') into peers from (
  select 'edit' source,s.id,to_jsonb(s) payload from public.schedule_edit_session_shifts s
   where s.workspace_id=w and s.session_id=sid and coalesce(s.pending_op_type,'')<>'delete'
  union all
  select 'published',p.id,to_jsonb(p)||jsonb_build_object('id',coalesce(p.source_shift_id,p.id)) from public.schedule_published_shifts p
   join public.schedule_location_publications pub on pub.id=p.publication_id and pub.workspace_id=w and pub.status='current'
   where p.workspace_id=w and p.scheduled_date between starts-2 and ends+2 and p.employee_id is not null
    and not exists(select 1 from public.schedule_edit_session_shifts s where s.workspace_id=w and s.session_id=sid and s.id=coalesce(p.source_shift_id,p.id))
 ) candidates;
 fmt:=case when (select time_format from public.workspace_scheduling_settings where workspace_id=w)='24h' then 'HH24:MI' else 'FMHH12:MI AM' end;
 for row_value in select value from jsonb_array_elements(rows) loop
  before_count:=0; after_count:=0; overlap:=null;
  if row_value->'after'<>'null'::jsonb and row_value->'before'->>'employee_id' is not null then
   original_span:=app_private.shift_time_range((row_value->>'scheduled_date')::date,(row_value->'before'->>'start_time')::time,(row_value->'before'->>'end_time')::time,row_value->'before'->>'time_timezone');
   proposed_span:=app_private.shift_time_range((row_value->>'scheduled_date')::date,(row_value->'after'->>'start_time')::time,(row_value->'after'->>'end_time')::time,row_value->'after'->>'time_timezone');
   -- A peer in the selection is compared at its proposed hours.
   select count(*) filter(where spans.before_span&&original_span),count(*) filter(where spans.after_span&&proposed_span),
    (array_agg(coalesce(t.name,'shift')||' '||to_char((eff.p->>'start_time')::time,fmt)||'–'||to_char((eff.p->>'end_time')::time,fmt) order by lower(spans.after_span))
     filter(where spans.after_span&&proposed_span))[1]
    into before_count,after_count,overlap
   from jsonb_array_elements(peers) peer
   left join lateral(select value r from jsonb_array_elements(rows) where value->>'shift_id'=peer->>'id') replacement on true
   cross join lateral(select coalesce(nullif(replacement.r->'after','null'),peer) p) eff
   cross join lateral(select app_private.shift_time_range((peer->>'scheduled_date')::date,(peer->>'start_time')::time,(peer->>'end_time')::time,peer->>'time_timezone') before_span,
    app_private.shift_time_range((eff.p->>'scheduled_date')::date,(eff.p->>'start_time')::time,(eff.p->>'end_time')::time,eff.p->>'time_timezone') after_span) spans
   left join public.shift_types t on t.workspace_id=w and t.id=(eff.p->>'shift_type_id')::uuid
   where peer->>'employee_id'=row_value->'before'->>'employee_id' and peer->>'id'<>row_value->>'shift_id';
   if overlap is not null and (row_value->>'can_apply')::boolean then
    row_value:=row_value||jsonb_build_object('reason','Overlaps '||overlap,'can_apply',false); blocked:=blocked+1;
   elsif overlap is not null and row_value->'after_assessment'->>'operation'='blocked'
    and not exists(select 1 from jsonb_array_elements(row_value->'after_assessment'->'reasons') x where x->>'severity'='block' and x->>'code'<>'time_overlap') then
    -- The core already blocked it for this overlap alone: name the shift instead of the generic availability text.
    row_value:=row_value||jsonb_build_object('reason','Overlaps '||overlap);
   end if;
  end if;
  evidence:=evidence||jsonb_build_array(row_value||jsonb_build_object('before_overlap_count',before_count,'after_overlap_count',after_count));
 end loop;
 fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('workspace',w,'actor',actor,'session',sid,'revision',session.revision,'command',command-'fingerprint'-'idempotency_key'-'confirm_availability','rows',evidence,'peers',peers)::text,'UTF8'),'sha256'),'hex');
 return jsonb_build_object('session_id',sid,'session_revision',session.revision,'starts_on',starts,'ends_on',ends,'fingerprint',fingerprint,'changed_count',changed,'blocked_count',blocked,'shifts',evidence);
end $$;

CREATE OR REPLACE FUNCTION "public"."rename_schedule_template_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_template_id" "uuid", "target_name" "text", "expected_revision" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
 if not found then raise exception 'schedule template revision stale' using errcode='PT409'; end if;
 insert into public.schedule_template_events(workspace_id,template_id,template_name,action,actor_user_id,detail)
 values(target_workspace_id,target_template_id,btrim(target_name),'renamed',actor_user_id,jsonb_build_object('previous_name',old_name));
 return public.get_schedule_template_service(actor_user_id,target_workspace_id,target_template_id);
exception when unique_violation then raise exception 'schedule template name conflict' using errcode='23505'; end;
$$;

CREATE OR REPLACE FUNCTION "public"."save_schedule_edit_session_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_session_id" "uuid", "expected_session_revision" integer, "target_name" "text", "target_draft_id" "uuid" DEFAULT NULL::"uuid", "expected_draft_revision" integer DEFAULT NULL::integer, "acknowledge_past_edits" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  target_session public.schedule_edit_sessions%rowtype;
  saved_draft public.schedule_drafts%rowtype;
  reach uuid[];
  current_week_start date;
  findings jsonb := '[]'::jsonb;
  blocked_findings jsonb := '[]'::jsonb;
  warning_findings jsonb := '[]'::jsonb;
  session_labels jsonb;
  result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));
  perform public.shift_exchange_assert_session(target_workspace_id,target_session_id);

  -- a. A past week never changes; a shift that already started changes only
  -- when the person says they know.
  select * into target_session
  from public.schedule_edit_sessions session
  where session.id = target_session_id
    and session.workspace_id = target_workspace_id
  for update;

  if target_session.id is null or target_session.holder_user_id <> actor_user_id then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;
  if target_session.status <> 'active' or target_session.expires_at <= now() then
    raise exception 'edit lease expired' using errcode = 'PT409', hint = 'schedule.edit_lease_expired';
  end if;
  if target_session.revision <> expected_session_revision then
    raise exception 'session revision stale' using errcode = 'PT409', hint = 'schedule.edit_session_stale';
  end if;
  -- The edit's locations are still the person's to edit (B-3), and the draft
  -- it writes into is the one it was opened from, a new one, or one the core
  -- lets the person write at all its locations (B-1).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => target_session.location_ids);
  if target_draft_id is distinct from target_session.source_draft_id and target_draft_id is not null then
    select * into saved_draft from public.schedule_drafts draft
    where draft.id = target_draft_id and draft.workspace_id = target_workspace_id
      and draft.week_start = target_session.week_start and draft.archived_at is null;
    if saved_draft.id is null then
      raise exception 'Not allowed' using errcode = '42501', detail = 'schedule.edit', hint = 'authz.out_of_scope';
    end if;
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit',
      target_locations => app_private.live_draft_locations(target_workspace_id, saved_draft.location_ids));
    saved_draft := null;
  end if;

  reach := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.edit');
  current_week_start := public.schedule_current_week_start_service(target_workspace_id);

  if current_week_start is not null and target_session.week_start < current_week_start then
    select coalesce(jsonb_agg(jsonb_build_object(
      'op_type', coalesce(shift.pending_op_type, 'update'),
      'shift_id', shift.id,
      'scheduled_date', to_char(shift.scheduled_date, 'YYYY-MM-DD'),
      'location_name', coalesce(location.name, 'Unknown location'),
      'employee_name', coalesce(
        nullif(trim(concat_ws(' ', nullif(employee.preferred_name, ''), employee.last_name)), ''),
        nullif(trim(concat_ws(' ', employee.first_name, employee.last_name)), '')
      ),
      'reason', 'past_week',
      'severity', 'blocked'
    ) order by shift.scheduled_date, shift.start_time, shift.id), '[]'::jsonb)
    into blocked_findings
    from public.schedule_edit_session_shifts shift
    left join public.locations location
      on location.id = shift.location_id
     and location.workspace_id = shift.workspace_id
    left join public.employee_profiles employee
      on employee.id = shift.employee_id
     and employee.workspace_id = shift.workspace_id
    where shift.session_id = target_session_id
      and shift.workspace_id = target_workspace_id
      and shift.location_id = any(reach);

    if jsonb_array_length(blocked_findings) = 0 then
      blocked_findings := jsonb_build_array(jsonb_build_object(
        'op_type', 'update',
        'shift_id', null,
        'scheduled_date', to_char(target_session.week_start, 'YYYY-MM-DD'),
        'location_name', 'Schedule week',
        'employee_name', null,
        'reason', 'past_week',
        'severity', 'blocked'
      ));
    end if;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'op_type', shift.pending_op_type,
      'shift_id', shift.id,
      'scheduled_date', to_char(shift.scheduled_date, 'YYYY-MM-DD'),
      'location_name', coalesce(location.name, 'Unknown location'),
      'employee_name', coalesce(
        nullif(trim(concat_ws(' ', nullif(employee.preferred_name, ''), employee.last_name)), ''),
        nullif(trim(concat_ws(' ', employee.first_name, employee.last_name)), '')
      ),
      'reason', 'shift_started',
      'severity', 'warning'
    ) order by shift.scheduled_date, shift.start_time, shift.id), '[]'::jsonb)
    into warning_findings
    from public.schedule_edit_session_shifts shift
    join public.locations location
      on location.id = shift.location_id
     and location.workspace_id = shift.workspace_id
    left join public.employee_profiles employee
      on employee.id = shift.employee_id
     and employee.workspace_id = shift.workspace_id
    where shift.session_id = target_session_id
      and shift.workspace_id = target_workspace_id
      and shift.pending_op_type in ('create', 'update', 'delete')
      and shift.location_id = any(reach)
      and ((shift.scheduled_date::timestamp + shift.start_time) at time zone location.timezone) <= now();
  end if;

  if jsonb_array_length(blocked_findings) > 0 then
    findings := blocked_findings;
    raise exception '%', jsonb_build_object(
      'status', 'past_edit_blocked',
      'past_edits', findings,
      'past_edit_messages', (
        select coalesce(jsonb_agg(
          coalesce(finding->>'employee_name', 'An open shift')
          || ' - '
          || coalesce(finding->>'location_name', 'Unknown location')
          || ' on '
          || coalesce(finding->>'scheduled_date', target_session.week_start::text)
          || ' is in a past week and cannot change.'
        ), '[]'::jsonb)
        from jsonb_array_elements(findings) finding
      ),
      'current_week_start', current_week_start
    )::text using errcode = 'P0001';
  end if;

  if jsonb_array_length(warning_findings) > 0 and acknowledge_past_edits is distinct from true then
    findings := warning_findings;
    raise exception '%', jsonb_build_object(
      'status', 'past_shift_edit_requires_ack',
      'past_edits', findings,
      'past_edit_messages', (
        select coalesce(jsonb_agg(
          coalesce(finding->>'employee_name', 'An open shift')
          || ' - '
          || coalesce(finding->>'location_name', 'Unknown location')
          || ' on '
          || coalesce(finding->>'scheduled_date', target_session.week_start::text)
          || ' has already started. Employees will not be notified of this change.'
        ), '[]'::jsonb)
        from jsonb_array_elements(findings) finding
      )
    )::text using errcode = 'P0001';
  end if;

  -- b. The labels, kept aside: the draft rows are written fresh.
  perform public.availability_lock_workspace(target_workspace_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', shift.id,
    'label_ids', to_jsonb(coalesce(shift.label_ids, '{}'::uuid[])),
    'label_names', to_jsonb(coalesce(shift.label_names, '{}'::text[]))
  )), '[]'::jsonb)
  into session_labels
  from public.schedule_edit_session_shifts shift
  join public.schedule_edit_sessions session
    on session.id = shift.session_id
   and session.workspace_id = shift.workspace_id
  where shift.session_id = target_session_id
    and shift.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id;

  -- c. Pending deletes go, then the draft is written.
  delete from public.schedule_edit_session_shifts shift
  using public.schedule_edit_sessions session
  where session.id = target_session_id
    and session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id
    and session.status = 'active'
    and shift.session_id = session.id
    and shift.pending_op_type = 'delete';

  begin
    select * into target_session from public.schedule_edit_sessions session
    where session.id = target_session_id and session.workspace_id = target_workspace_id
    for update;
    if target_session.id is null or target_session.holder_user_id <> actor_user_id then
      raise exception 'edit session not found' using errcode = 'P0002';
    end if;
    if target_session.status <> 'active' or target_session.expires_at <= now() then
      raise exception 'edit lease expired' using errcode = 'PT409', hint = 'schedule.edit_lease_expired';
    end if;
    if target_session.revision <> expected_session_revision then
      raise exception 'session revision stale' using errcode = 'PT409', hint = 'schedule.edit_session_stale';
    end if;
    if char_length(btrim(target_name)) not between 1 and 80 then
      raise exception 'invalid draft name' using errcode = '22023';
    end if;

    if target_draft_id is null then
      insert into public.schedule_drafts (
        workspace_id, week_start, name, created_by, updated_by, location_ids, base_publication_ids
      ) values (
        target_workspace_id, target_session.week_start, btrim(target_name),
        actor_user_id, actor_user_id, target_session.location_ids, target_session.base_publication_ids
      ) returning * into saved_draft;
    else
      update public.schedule_drafts draft
      set name = btrim(target_name), revision = revision + 1,
        updated_by = actor_user_id, updated_at = now(),
        location_ids = array(
          select distinct location_id from unnest(draft.location_ids || target_session.location_ids) location_id
          order by location_id
        ),
        -- The edit's locations now start where the edit started.
        base_publication_ids = array(
          select base_id from unnest(draft.base_publication_ids) base_id
          where not exists (
            select 1 from public.schedule_location_publications publication
            where publication.id = base_id
              and publication.location_id = any(target_session.location_ids)
          )
        ) || target_session.base_publication_ids
      where draft.id = target_draft_id and draft.workspace_id = target_workspace_id
        and draft.week_start = target_session.week_start and draft.archived_at is null
        and draft.revision = expected_draft_revision
      returning * into saved_draft;
      if saved_draft.id is null then
        raise exception 'draft revision stale' using errcode = 'PT409', hint = 'schedule.edit_session_stale';
      end if;
    end if;

    -- BL-097: only the locations this session holds are replaced; the rest of
    -- the draft stays as it was.
    delete from public.schedule_draft_shifts shift
    where shift.draft_id = saved_draft.id
      and shift.location_id = any(target_session.location_ids);
    insert into public.schedule_draft_shifts (id, workspace_id, draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision)
    select shift.id, shift.workspace_id, saved_draft.id, shift.location_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.revision from public.schedule_edit_session_shifts shift
    where shift.session_id = target_session_id;

    delete from public.schedule_edit_session_shifts where session_id = target_session_id;
    update public.schedule_edit_sessions
    set status = 'saved', dirty = false, closed_at = now(), expires_at = now()
    where id = target_session_id;

    result := jsonb_build_object(
      'id', saved_draft.id, 'workspace_id', saved_draft.workspace_id,
      'week_start', saved_draft.week_start, 'name', saved_draft.name,
      'revision', saved_draft.revision, 'created_by', saved_draft.created_by,
      'updated_by', saved_draft.updated_by, 'created_at', saved_draft.created_at,
      'updated_at', saved_draft.updated_at
    );
  exception
    when unique_violation then
      raise exception 'draft name conflict' using errcode = '23505';
  end;

  -- d. The labels back on the draft rows.
  update public.schedule_draft_shifts draft_shift
     set label_ids = coalesce(label_row.label_ids, '{}'::uuid[]),
         label_names = coalesce(label_row.label_names, '{}'::text[])
    from jsonb_to_recordset(session_labels) as label_row(
      id uuid,
      label_ids uuid[],
      label_names text[]
    )
   where draft_shift.draft_id = saved_draft.id
     and draft_shift.id = label_row.id
     and draft_shift.workspace_id = target_workspace_id;

  return result;
exception when serialization_failure then raise exception '%',SQLERRM using errcode='PT409';
end;
$$;

CREATE OR REPLACE FUNCTION "public"."undo_schedule_edit_session_step_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_session_id" "uuid", "expected_session_revision" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  edit public.schedule_edit_sessions%rowtype;
  last_at timestamptz;
  last_xact xid8;
  steps jsonb;
begin
  perform public.availability_lock_workspace(target_workspace_id);
  select * into edit from public.schedule_edit_sessions session
  where session.id = target_session_id and session.workspace_id = target_workspace_id
  for update;
  if edit.id is null or edit.holder_user_id is distinct from actor_user_id then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;
  -- The edit's locations are still the person's to edit (B-3).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => edit.location_ids);
  if edit.status <> 'active' or edit.expires_at <= now() then
    raise exception 'edit lease expired' using errcode = 'PT409', hint = 'schedule.edit_lease_expired';
  end if;
  if edit.revision is distinct from expected_session_revision then
    raise exception 'session revision stale' using errcode = 'PT409', hint = 'schedule.edit_session_stale';
  end if;

  select step.step_at, step.step_xact into last_at, last_xact
  from app_private.schedule_edit_undo_steps step
  where step.session_id = edit.id
  order by step.step_at desc, step.step_xact desc
  limit 1;
  if last_at is null then
    raise exception 'nothing to undo' using errcode = 'PT409', hint = 'schedule.nothing_to_undo';
  end if;

  -- Each shift the step touched, as it was before it. The step leaves the
  -- history first, so the writes below do not push an older step out.
  with taken as (
    delete from app_private.schedule_edit_undo_steps step
    where step.session_id = edit.id and step.step_at = last_at and step.step_xact = last_xact
    returning step.shift_id, step.before)
  select coalesce(jsonb_agg(jsonb_build_object('id', taken.shift_id, 'before', taken.before)), '[]'::jsonb)
  into steps from taken;

  -- Shifts the step added go first, so the ones coming back find room.
  delete from public.schedule_edit_session_shifts shift
  using jsonb_array_elements(steps) step
  where shift.session_id = edit.id and shift.id = (step ->> 'id')::uuid and step -> 'before' = 'null'::jsonb;

  -- The rows come back as they were; their revision moves on, so a screen
  -- that still holds the undone row is told it is stale.
  update public.schedule_edit_session_shifts shift
  set location_id = prior.location_id, employee_id = prior.employee_id, job_id = prior.job_id,
      shift_type_id = prior.shift_type_id, scheduled_date = prior.scheduled_date,
      start_time = prior.start_time, end_time = prior.end_time, note = prior.note,
      idempotency_key = prior.idempotency_key, source_published_shift_id = prior.source_published_shift_id,
      pending_op_type = prior.pending_op_type, locked = prior.locked,
      unpaid_break_minutes = prior.unpaid_break_minutes, hide_time_on_badge = prior.hide_time_on_badge,
      label_ids = prior.label_ids, label_names = prior.label_names, time_basis = prior.time_basis,
      time_snapshot = prior.time_snapshot, time_timezone = prior.time_timezone,
      revision = shift.revision + 1, updated_at = now()
  from jsonb_array_elements(steps) step
  cross join lateral jsonb_populate_record(null::public.schedule_edit_session_shifts, nullif(step -> 'before', 'null'::jsonb)) prior
  where shift.session_id = edit.id and shift.id = prior.id and step -> 'before' <> 'null'::jsonb;

  insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, employee_id, job_id,
    shift_type_id, scheduled_date, start_time, end_time, note, revision, idempotency_key, created_at, updated_at,
    source_published_shift_id, pending_op_type, locked, unpaid_break_minutes, hide_time_on_badge, label_ids,
    label_names, time_basis, time_snapshot, time_timezone)
  select prior.id, edit.workspace_id, edit.id, prior.location_id, prior.employee_id, prior.job_id,
    prior.shift_type_id, prior.scheduled_date, prior.start_time, prior.end_time, prior.note,
    prior.revision + 1, prior.idempotency_key, prior.created_at, now(),
    prior.source_published_shift_id, prior.pending_op_type, prior.locked, prior.unpaid_break_minutes,
    prior.hide_time_on_badge, prior.label_ids, prior.label_names, prior.time_basis, prior.time_snapshot, prior.time_timezone
  from jsonb_array_elements(steps) step
  cross join lateral jsonb_populate_record(null::public.schedule_edit_session_shifts, nullif(step -> 'before', 'null'::jsonb)) prior
  where step -> 'before' <> 'null'::jsonb
    and not exists (select 1 from public.schedule_edit_session_shifts shift
      where shift.session_id = edit.id and shift.id = prior.id);

  -- A person missing a required document is never on a shift that day, Undo or not.
  if exists (
    select 1 from jsonb_array_elements(steps) step
    cross join lateral jsonb_populate_record(null::public.schedule_edit_session_shifts, nullif(step -> 'before', 'null'::jsonb)) prior
    where prior.employee_id is not null
      and public.employee_has_hard_document_schedule_conflict_service(target_workspace_id, prior.employee_id, prior.scheduled_date)
  ) then
    raise exception 'employee document hard conflict' using errcode = '23514';
  end if;

  -- Undo's own writes are not a step.
  delete from app_private.schedule_edit_undo_steps step
  where step.session_id = edit.id and step.step_at = statement_timestamp() and step.step_xact = pg_current_xact_id();

  update public.schedule_edit_sessions
  set revision = revision + 1, dirty = true, last_heartbeat = now(), expires_at = now() + interval '4 minutes'
  where id = edit.id;

  return public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
end;
$$;
