-- EKRAN-01 DB-3: a template and a published week keep their data.
--
-- S3 (Mert 2026-10-05; D-O4, B-4): Replace ("overwrite") clears only the
--   template's own locations and departments and never a shift that has
--   started; in a published week the published shift is staged for removal
--   (as Delete stages it), not deleted. Before the second click the server
--   says how many shifts would go (KARARLAR Schedule, KK-162:
--   "24 shifts will be removed."): preview_schedule_template_apply_service.
-- D-O2: a template keeps each shift's unpaid break, saved and applied.
-- D-O1: a shift added while editing a published week is not marked as a copy
--   of a published shift ("Live - published to employees").
-- BL-292: an edit whose payload leaves the note out keeps the note; an empty
--   string clears it.
-- BL-545: a closed day drops the unsaved shifts of an open edit to open too
--   (K16), and counts them with the draft shifts.

alter table public.schedule_template_shifts
  add column unpaid_break_minutes integer not null default 0
    constraint schedule_template_shifts_unpaid_break_minutes_check
    check (unpaid_break_minutes = any (array[0, 15, 30, 45, 60]));

-- The departments a Replace or its preview names: checked once, the same way
-- for both. No list = the whole template ('{}' back); '__no_department__'
-- stands for jobs without a department.
create function app_private.schedule_template_department_ids(w uuid, department_keys text[])
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ids uuid[];
begin
  if department_keys is null then
    return '{}'::uuid[];
  end if;
  if cardinality(department_keys) = 0 then
    raise exception 'select at least one department' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(department_keys) as key(value)
    where key.value <> '__no_department__'
      and key.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'invalid department key' using errcode = '22023';
  end if;
  ids := array(select key.value::uuid from unnest(department_keys) as key(value) where key.value <> '__no_department__');
  if exists (
    select 1 from unnest(ids) as selected(id)
    left join public.departments department
      on department.id = selected.id and department.workspace_id = w and department.archived_at is null
    where department.id is null
  ) then
    raise exception 'schedule template department not found' using errcode = 'P0002';
  end if;
  return ids;
end;
$$;

revoke all on function app_private.schedule_template_department_ids(uuid, text[]) from public, anon, authenticated;

-- The shifts of an edit that Replace takes away: at a (location, department)
-- pair the template writes to -- only among the departments picked, if any --
-- not yet started, not already staged for removal. One rule for the preview
-- and the apply.
create function app_private.schedule_template_replace_targets(
  w uuid, edit_session uuid, template uuid, department_keys text[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with template_shift as (
    select template_shift.location_id, job.department_id
    from public.schedule_template_shifts template_shift
    join public.jobs job on job.id = template_shift.job_id and job.workspace_id = template_shift.workspace_id
    where template_shift.template_id = template and template_shift.workspace_id = w
      and template_shift.location_id = any (public.live_location_ids(w, array(
        select distinct s.location_id from public.schedule_template_shifts s where s.template_id = template)))
  ), picked as (
    select app_private.schedule_template_department_ids(w, department_keys) as ids
  )
  select edit_shift.id
  from public.schedule_edit_session_shifts edit_shift
  join public.jobs job on job.id = edit_shift.job_id and job.workspace_id = edit_shift.workspace_id
  join public.locations location on location.id = edit_shift.location_id and location.workspace_id = edit_shift.workspace_id
  cross join picked
  where edit_shift.session_id = edit_session and edit_shift.workspace_id = w
    and edit_shift.pending_op_type is distinct from 'delete'
    and exists (
      select 1 from template_shift t
      where t.location_id = edit_shift.location_id and t.department_id is not distinct from job.department_id)
    and (department_keys is null
      or job.department_id = any (picked.ids)
      or (job.department_id is null and '__no_department__' = any (department_keys)))
    -- A shift that has started stays (P09); an unknown time counts as not started.
    and coalesce(lower(app_private.shift_time_range(edit_shift.scheduled_date, edit_shift.start_time,
          edit_shift.end_time, coalesce(edit_shift.time_timezone, location.timezone))) > now(), true)
$$;

revoke all on function app_private.schedule_template_replace_targets(uuid, uuid, uuid, text[]) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_schedule_template_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_name text, strip_assignments boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.schedule_drafts%rowtype; new_template public.schedule_templates%rowtype;
begin
 perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.templates',
   target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.templates'));
 select * into d from public.schedule_drafts where id=target_draft_id and workspace_id=target_workspace_id and archived_at is null;
 if d.id is null then raise exception 'schedule draft not found' using errcode='P0002'; end if;
 if not exists(select 1 from public.schedule_draft_shifts where draft_id=d.id) then raise exception 'schedule template source is empty' using errcode='22023'; end if;
 perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.templates',
   target_locations => array(select distinct s.location_id from public.schedule_draft_shifts s where s.draft_id=d.id));
 insert into public.schedule_templates(workspace_id,name,created_by,updated_by) values(target_workspace_id,btrim(target_name),actor_user_id,actor_user_id) returning * into new_template;
 insert into public.schedule_template_shifts(workspace_id, template_id, location_id, employee_id, job_id, shift_type_id, day_offset, start_time, end_time, time_basis, time_snapshot, time_timezone, hide_time_on_badge, note, label_ids, label_names, unpaid_break_minutes)
 select s.workspace_id, new_template.id, s.location_id, case when strip_assignments then null else s.employee_id end, s.job_id, s.shift_type_id, (s.scheduled_date-d.week_start), s.start_time, s.end_time, s.time_basis, s.time_snapshot, s.time_timezone, s.hide_time_on_badge, s.note,
   coalesce(s.label_ids, '{}'::uuid[]), coalesce(s.label_names, '{}'::text[]), s.unpaid_break_minutes
 from public.schedule_draft_shifts s where s.draft_id=d.id;
 insert into public.schedule_template_events(workspace_id,template_id,template_name,action,actor_user_id,detail)
 values(target_workspace_id,new_template.id,new_template.name,'created',actor_user_id,jsonb_build_object('source_draft_id',d.id,'strip_assignments',strip_assignments));
 return public.get_schedule_template_service(actor_user_id,target_workspace_id,new_template.id);
exception when unique_violation then raise exception 'schedule template name conflict' using errcode='23505'; end;
$function$;

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
     'label_names',to_jsonb(coalesce(s.label_names,'{}'::text[])),'note',s.note,'unpaid_break_minutes',s.unpaid_break_minutes) order by s.day_offset,s.start_time,s.id) from public.schedule_template_shifts s where s.template_id=t.id and s.location_id=any(places.ids)),'[]'::jsonb))
 into result from public.schedule_templates t join public.user_profiles u on u.user_id=t.created_by
 cross join lateral (select public.live_location_ids(t.workspace_id, array(select distinct s.location_id from public.schedule_template_shifts s where s.template_id=t.id)) ids) places
 where t.id=target_template_id and t.workspace_id=target_workspace_id
 and (org_wide or (cardinality(places.ids)>0 and places.ids <@ template_scope));
 if result is null then raise exception 'schedule template not found' using errcode='P0002'; end if; return result;
end; $function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.mark_schedule_edit_session_shift_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  session_source public.schedule_edit_source;
  session_week date;
begin
  select session.source_kind, session.week_start into session_source, session_week
  from public.schedule_edit_sessions session
  where session.id = new.session_id
    and session.workspace_id = new.workspace_id;

  -- D-O1: a shift added while editing a published week is new, not "Live".
  if session_source = 'published' and new.source_published_shift_id is null and exists (
    select 1 from public.schedule_location_publications publication
    join public.schedule_published_shifts published
      on published.publication_id = publication.id and published.source_shift_id = new.id
    where publication.location_id = new.location_id and publication.week_start = session_week
      and publication.status = 'current' and publication.workspace_id = new.workspace_id
  ) then
    new.source_published_shift_id := new.id;
    new.locked := true;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mutate_schedule_edit_shift_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, expected_session_revision integer, operation text, target_shift_id uuid, expected_shift_revision integer DEFAULT NULL::integer, shift_payload jsonb DEFAULT NULL::jsonb, request_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      raise exception 'edit lease expired' using errcode = '40001';
    end if;
    if target_session.revision <> expected_session_revision then
      raise exception 'session revision stale' using errcode = '40001';
    end if;

    select * into target_shift
    from public.schedule_edit_session_shifts shift
    where shift.session_id = target_session_id
      and shift.id = target_shift_id
      and shift.revision = expected_shift_revision
      and shift.location_id = any(reach)
    for update;

    if target_shift.id is null then
      raise exception 'shift revision stale' using errcode = '40001';
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
    begin
      select * into target_session from public.schedule_edit_sessions session
      where session.id = target_session_id and session.workspace_id = target_workspace_id
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

      if operation in ('create', 'update') then
        row_payload := public.normalize_schedule_time_source(target_workspace_id,row_payload,(select to_jsonb(s) from public.schedule_edit_session_shifts s where s.session_id=target_session_id and s.id=row_shift_id));
        target_location_id := (row_payload->>'location_id')::uuid;
        target_employee_id := nullif(row_payload->>'employee_id', '')::uuid;
        target_job_id := (row_payload->>'job_id')::uuid;
        target_shift_type_id := nullif(row_payload->>'shift_type_id', '')::uuid;
        target_scheduled_date := (row_payload->>'scheduled_date')::date;
        target_start_time := nullif(row_payload->>'start_time','')::time;
        target_end_time := nullif(row_payload->>'end_time','')::time;
        target_unpaid_break_minutes := coalesce((row_payload->>'unpaid_break_minutes')::integer, 0);
        target_hide_time_on_badge := coalesce((row_payload->>'hide_time_on_badge')::boolean, false);
        target_note := case when row_payload ? 'note' then coalesce(row_payload->>'note', '')
          else coalesce((select s.note from public.schedule_edit_session_shifts s
                         where s.session_id = target_session_id and s.id = row_shift_id), '') end;
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
          raise exception 'shift revision stale' using errcode = '40001';
        end if;
      else
        update public.schedule_availability_overrides set revoked_at=now() where workspace_id=target_workspace_id and shift_id=row_shift_id and revoked_at is null;
        delete from public.schedule_edit_session_shifts shift
        where shift.session_id = target_session_id and shift.id = row_shift_id
          and shift.revision = expected_shift_revision
          and shift.location_id = any(reach);
        if not found then
          raise exception 'shift revision stale' using errcode = '40001';
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
$function$;

CREATE OR REPLACE FUNCTION app_private.important_date_closure_impact(w uuid, stored important_dates, kind text, starts date, ends date, recurrence text, location_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with newly as (
    select day.location_id, day.closed_date
    from app_private.closure_days(w, kind::public.important_date_type, starts, ends,
      recurrence::public.important_date_recurrence, coalesce(location_ids, '{}')) day
    where day.closed_date >= public.schedule_current_week_start_service(w)
    except
    select day.location_id, day.closed_date
    from app_private.closure_days(w, stored.type, stored.starts_on, stored.ends_on, stored.recurrence,
      coalesce(stored.location_ids, '{}')) day
    where stored.id is not null and stored.status = 'published' and stored.archived_at is null
  ), shifts as (
    select public.shift_exchange_shift(w, shift.id) || jsonb_build_object('employee_user_id', person.user_id) as x
    from newly
    join public.schedule_published_shifts shift
      on shift.workspace_id = w and shift.location_id = newly.location_id and shift.scheduled_date = newly.closed_date
    join public.schedule_location_publications publication on publication.id = shift.publication_id and publication.status = 'current'
    join public.locations location on location.id = shift.location_id
    left join public.employee_profiles person on person.id = shift.employee_id and person.workspace_id = w
    where shift.employee_id is not null
      and lower(app_private.shift_time_range(shift.scheduled_date, shift.start_time, shift.end_time,
            coalesce(shift.time_timezone, location.timezone))) > now()
  )
  select jsonb_build_object(
    'fingerprint', md5(coalesce((select string_agg(concat_ws('|', x ->> 'id', x ->> 'employee_id', x ->> 'starts_at', x ->> 'ends_at'),
      ',' order by x ->> 'id') from shifts), '')),
    'shifts', coalesce((select jsonb_agg(x order by x ->> 'starts_at', x ->> 'location_name', x ->> 'id') from shifts), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object('location_id', location_id, 'closed_date', closed_date)) from newly), '[]'::jsonb),
    -- K16: a saved draft's own shifts on those days (a copy of a published
    -- shift follows that shift instead), and since BL-545 the unsaved ones in
    -- an open edit. One id for a shift that is in both.
    'draft_shift_ids', coalesce((
      select jsonb_agg(distinct dropping.id) from (
        select draft_shift.id
        from newly
        join public.schedule_draft_shifts draft_shift
          on draft_shift.workspace_id = w and draft_shift.location_id = newly.location_id
         and draft_shift.scheduled_date = newly.closed_date and draft_shift.employee_id is not null
        join public.schedule_drafts draft on draft.id = draft_shift.draft_id and draft.archived_at is null
        where not exists (
          select 1 from public.schedule_published_shifts published
          join public.schedule_location_publications publication
            on publication.id = published.publication_id and publication.status = 'current'
          where published.workspace_id = w and coalesce(published.source_shift_id, published.id) = draft_shift.id)
        union
        select edit_shift.id
        from newly
        join public.schedule_edit_session_shifts edit_shift
          on edit_shift.workspace_id = w and edit_shift.location_id = newly.location_id
         and edit_shift.scheduled_date = newly.closed_date and edit_shift.employee_id is not null
         and edit_shift.source_published_shift_id is null and edit_shift.pending_op_type is distinct from 'delete'
        join public.schedule_edit_sessions edit on edit.id = edit_shift.session_id and edit.status = 'active'
        -- An edit opened from a draft carries the published shift's id without
        -- the copy mark; that copy follows the published shift too (K13 keep).
        where not exists (
          select 1 from public.schedule_published_shifts published
          join public.schedule_location_publications publication
            on publication.id = published.publication_id and publication.status = 'current'
          where published.workspace_id = w and coalesce(published.source_shift_id, published.id) = edit_shift.id)
      ) dropping), '[]'::jsonb))
$function$;

CREATE OR REPLACE FUNCTION app_private.important_date_close_shifts(actor uuid, item important_dates, impact jsonb, keep uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s jsonb;
  opened jsonb := coalesce((select jsonb_agg(x) from jsonb_array_elements(impact -> 'shifts') x
                            where not (x ->> 'id')::uuid = any (coalesce(keep, '{}'))), '[]'::jsonb);
  drafts uuid[] := array(select value::uuid from jsonb_array_elements_text(impact -> 'draft_shift_ids'));
  places uuid[];
  other record;
begin
  places := array(
    select distinct (x ->> 'location_id')::uuid from jsonb_array_elements(opened) x
    union select draft_shift.location_id from public.schedule_draft_shifts draft_shift where draft_shift.id = any (drafts)
    union select edit_shift.location_id from public.schedule_edit_session_shifts edit_shift
          where edit_shift.workspace_id = item.workspace_id and edit_shift.id = any (drafts));
  if cardinality(places) = 0 then
    return '[]'::jsonb;
  end if;
  perform app_private.authorize(actor, item.workspace_id, 'schedule.edit', target_locations => places);

  for s in select x from jsonb_array_elements(opened) x loop
    insert into public.important_date_shift_releases (workspace_id, important_date_id, published_shift_id, source_shift_id,
      before_assignment, actor_user_id)
    values (item.workspace_id, item.id, (s ->> 'id')::uuid, (s ->> 'source_id')::uuid, s, actor);
    update public.schedule_published_shifts set employee_id = null
    where workspace_id = item.workspace_id and id = (s ->> 'id')::uuid and employee_id = (s ->> 'employee_id')::uuid;
    if not found then
      raise exception 'A shift on this closed day changed. Review the shifts again.'
        using errcode = '40001', hint = 'important_date.closure_changed';
    end if;
  end loop;

  with dropped as (
    update public.schedule_draft_shifts draft_shift
    set employee_id = null, revision = draft_shift.revision + 1, updated_at = now()
    where draft_shift.id = any (drafts)
      and (draft_shift.location_id, draft_shift.scheduled_date) in (
        select (day ->> 'location_id')::uuid, (day ->> 'closed_date')::date from jsonb_array_elements(impact -> 'days') day)
    returning draft_shift.draft_id
  )
  update public.schedule_drafts set revision = revision + 1, updated_at = now()
  where id in (select draft_id from dropped);

  -- BL-545: the same shift in an open edit drops too; the edit's revision moves
  -- so the open screen reloads it (as shift_exchange_rebase_drafts does).
  with dropped_edit as (
    update public.schedule_edit_session_shifts edit_shift
    set employee_id = null, revision = edit_shift.revision + 1, updated_at = now()
    where edit_shift.workspace_id = item.workspace_id and edit_shift.id = any (drafts)
      and edit_shift.employee_id is not null and edit_shift.source_published_shift_id is null
      and edit_shift.pending_op_type is distinct from 'delete'
      and (edit_shift.location_id, edit_shift.scheduled_date) in (
        select (day ->> 'location_id')::uuid, (day ->> 'closed_date')::date from jsonb_array_elements(impact -> 'days') day)
      and exists (select 1 from public.schedule_edit_sessions edit where edit.id = edit_shift.session_id and edit.status = 'active')
    returning edit_shift.session_id
  )
  update public.schedule_edit_sessions set revision = revision + 1
  where id in (select session_id from dropped_edit);

  if jsonb_array_length(opened) > 0 then
    perform public.shift_exchange_reconcile_batch(actor, item.workspace_id,
      (select jsonb_agg(x || jsonb_build_object('new_employee_id', null)) from jsonb_array_elements(opened) x));
    -- ponytail: the same steps approved time off takes (time_off_release_shifts).
    for other in
      select c.id from public.shift_exchange_cases c
      where c.workspace_id = item.workspace_id and c.status = 'open'
        and exists (select 1 from jsonb_array_elements(opened) x
                    where (x ->> 'source_id')::uuid in (c.offered_source_id, c.requested_source_id))
    loop
      update public.shift_exchange_cases set status = 'invalidated', revision = revision + 1, updated_at = now() where id = other.id;
      update public.shift_exchange_applications set status = 'invalidated', updated_at = now()
      where case_id = other.id and status in ('invited', 'pending_manager');
      perform public.shift_exchange_emit(actor, item.workspace_id, other.id, null, 'invalidated',
        'An involved assignment was opened by a closed day. Review the current schedule.');
    end loop;
    perform realtime.send(jsonb_build_object('workspace_id', item.workspace_id, 'important_date_id', item.id),
      'changed', 'shift-exchanges:' || item.workspace_id::text, true);
  end if;
  return opened;
end;
$function$;

-- Replace's first click: how many of this edit's shifts the template would
-- take away. Writes nothing. Same gate and checks as the apply.
create function public.preview_schedule_template_apply_service(
  actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, target_template_id uuid,
  department_keys text[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  template_scope uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.templates',
    target_locations => app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.templates'));
  template_scope := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.templates');
  -- Checked here too: the count below never reaches it when the edit is empty.
  perform app_private.schedule_template_department_ids(target_workspace_id, department_keys);

  if not exists (
    select 1 from public.schedule_edit_sessions session
    where session.id = target_session_id and session.workspace_id = target_workspace_id
      and session.holder_user_id = actor_user_id
  ) then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.schedule_templates template
    where template.id = target_template_id and template.workspace_id = target_workspace_id
  ) then
    raise exception 'schedule template not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.schedule_template_shifts template_shift
    where template_shift.template_id = target_template_id
      and template_shift.location_id = any (public.live_location_ids(target_workspace_id, array(
        select distinct s.location_id from public.schedule_template_shifts s where s.template_id = target_template_id)))
      and not template_shift.location_id = any (template_scope)
  ) then
    raise exception 'schedule template references unavailable schedule definitions' using errcode = '23503';
  end if;

  return jsonb_build_object('removed_shift_count', (
    select count(*)::integer
    from app_private.schedule_template_replace_targets(target_workspace_id, target_session_id, target_template_id,
      department_keys)));
end;
$$;

revoke all on function public.preview_schedule_template_apply_service(uuid, uuid, uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.preview_schedule_template_apply_service(uuid, uuid, uuid, uuid, text[]) to service_role;
