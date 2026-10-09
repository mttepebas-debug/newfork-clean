-- FB-6.1 step .4: one function per Schedule job.
--
-- Each Schedule job the API calls is one function with the signature it had:
-- the week grid (4 -> 1), an open edit's read (3 -> 1), opening an edit
-- (2 -> 1), changing a shift (5 -> 1), saving the edit (5 -> 1), the publish
-- preview (4 -> 1), publishing (9 -> 1), the unpublish preview and unpublish
-- (2 -> 1 each), applying a template (3 -> 1) and saving one (2 -> 1). The 24
-- Schedule _base layers and the overloads beside the kept entry points go; a
-- call without the newer optional arguments reaches the kept function through
-- its defaults (supabase/tests/retired_objects_stay_gone.test.sql).
--
-- The last fourteen Schedule callers of the three old helpers ask the core
-- (app_private.authorize() / scope_set()) instead; ten time off and shift
-- exchange callers remain for FB-6.3 and FB-6.4 (user decision K-1).
--
-- Rules for things with several locations (REUSE "Taslak ve lokasyon", M2):
--   B3   a draft is deleted by a manager of every one of its locations, or an
--        admin or the owner;
--   K-2  a template is renamed or deleted the same way, by its shifts'
--        locations;
--   Q-B  a closed (deleted) location drops out of those two questions;
--   Q2   a publish, its preview and taking a week down name only locations the
--        person publishes at;
--   Q3   an export, scheduled or recorded, names only locations the person
--        exports.
-- A no is 42501 with an authz.* hint; an unknown draft or template is
-- out_of_scope, the same answer as one out of reach.
--
-- The grid and its ghosts draw one line, scope_set(actor, w, 'schedule.read');
-- a deleted location is neither a row nor a ghost (nf-guvenlik, FB-6.1 .5).

-- 0. What goes -----------------------------------------------------------------------------
-- Dropped first, so the kept functions can take the defaults their old
-- overloads provided.
drop function public.publish_schedule_draft_service(uuid, uuid, uuid, uuid[], integer, text, jsonb);
drop function public.publish_schedule_draft_service(uuid, uuid, uuid, uuid[], uuid[], boolean, integer, text, jsonb);
drop function public.publish_schedule_draft_exchange_base(uuid, uuid, uuid, uuid[], integer, text, jsonb);
drop function public.publish_schedule_draft_exchange_base(uuid, uuid, uuid, uuid[], uuid[], boolean, integer, text, jsonb);
drop function public.publish_schedule_draft_exchange_base(uuid, uuid, uuid, uuid[], uuid[], boolean, integer, text, jsonb, uuid[]);
drop function public.publish_schedule_draft_service_document_conflict_base(uuid, uuid, uuid, uuid[], uuid[], boolean, integer, text, jsonb);
drop function public.publish_schedule_draft_service_document_conflict_legacy_base(uuid, uuid, uuid, uuid[], integer, text, jsonb);
drop function public.publish_schedule_draft_service_label_base(uuid, uuid, uuid, uuid[], integer, text, jsonb);
drop function public.preview_schedule_publication_service(uuid, uuid, uuid, uuid[]);
drop function public.preview_schedule_publication_before_availability_review_service(uuid, uuid, uuid, uuid[]);
drop function public.preview_schedule_publication_before_availability_review_service(uuid, uuid, uuid, uuid[], uuid[], boolean);
drop function public.apply_schedule_template_service(uuid, uuid, uuid, integer, uuid, text);
drop function public.apply_schedule_template_service_label_base(uuid, uuid, uuid, integer, uuid, text);
drop function public.create_schedule_template_service_label_base(uuid, uuid, uuid, text, boolean);
drop function public.get_schedule_read_model_service_employee_exclusion_base(uuid, uuid, date);
drop function public.get_schedule_read_model_service_shift_label_management_base(uuid, uuid, date);
drop function public.get_schedule_read_model_service_label_base(uuid, uuid, date);
drop function public.get_schedule_edit_session_service_label_base(uuid, uuid, uuid);
drop function public.get_schedule_edit_session_service_base(uuid, uuid, uuid);
drop function public.mutate_schedule_edit_shift_service_soft_audit_base(uuid, uuid, uuid, integer, text, uuid, integer, jsonb, uuid);
drop function public.mutate_schedule_edit_shift_service_document_conflict_base(uuid, uuid, uuid, integer, text, uuid, integer, jsonb, uuid);
drop function public.mutate_schedule_edit_shift_service_label_base(uuid, uuid, uuid, integer, text, uuid, integer, jsonb, uuid);
drop function public.mutate_schedule_edit_shift_service_base(uuid, uuid, uuid, integer, text, uuid, integer, jsonb, uuid);
drop function public.save_schedule_edit_session_service_exchange_base(uuid, uuid, uuid, integer, text, uuid, integer, boolean);
drop function public.save_schedule_edit_session_service_retroactive_base(uuid, uuid, uuid, integer, text, uuid, integer);
drop function public.save_schedule_edit_session_service_label_base(uuid, uuid, uuid, integer, text, uuid, integer);
drop function public.save_schedule_edit_session_service_base(uuid, uuid, uuid, integer, text, uuid, integer);
drop function public.acquire_schedule_edit_session_service_past_week_base(uuid, uuid, date, public.schedule_edit_source, uuid, uuid[]);
drop function public.preview_schedule_unpublication_exchange_base(uuid, uuid, date, uuid[]);
drop function public.unpublish_schedule_service_exchange_base(uuid, uuid, date, uuid[], text);
-- 1. Things with several locations (B3, K-2, Q3) --------------------------------------------
-- A draft is deleted, a template renamed or deleted, only by a manager of every
-- one of its live locations, or by an admin or the owner; a closed location
-- drops out first (Q-B) and nothing left is the organization's. An unknown
-- draft or template is asked of no place: out_of_scope for everybody. An
-- export names only locations the person exports (M2).

CREATE OR REPLACE FUNCTION public.delete_schedule_draft_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_draft public.schedule_drafts%rowtype;
begin
  select * into target_draft
  from public.schedule_drafts draft
  where draft.id = target_draft_id
    and draft.workspace_id = target_workspace_id
    and draft.archived_at is null
  for update;

  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => case
    when target_draft.id is null then null
    else array(select place from unnest(target_draft.location_ids) place
      where not exists (select 1 from public.locations closed
        where closed.id = place and closed.workspace_id = target_workspace_id and closed.deleted_at is not null))
  end);

  -- Published shifts are independent snapshots. Archiving the named draft only
  -- hides the editable copy; retain its row and source links for publication history.
  update public.schedule_drafts
     set archived_at = now(),
         updated_by = actor_user_id,
         updated_at = now()
   where id = target_draft_id
     and workspace_id = target_workspace_id;

  return jsonb_build_object(
    'status', 'deleted',
    'draft_id', target_draft_id
  );
end;
$function$
;

-- Where a template's shifts are, less closed locations; null when there is no
-- such template here.
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
   else array(select distinct s.location_id from public.schedule_template_shifts s
     where s.template_id = target_template_id and s.workspace_id = target_workspace_id
       and not exists (select 1 from public.locations closed
         where closed.id = s.location_id and closed.workspace_id = target_workspace_id and closed.deleted_at is not null))
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
   else array(select distinct s.location_id from public.schedule_template_shifts s
     where s.template_id = target_template_id and s.workspace_id = target_workspace_id
       and not exists (select 1 from public.locations closed
         where closed.id = s.location_id and closed.workspace_id = target_workspace_id and closed.deleted_at is not null))
 end);
 delete from public.schedule_templates where id=target_template_id and workspace_id=target_workspace_id and revision=expected_revision returning name into old_name;
 if old_name is null then raise exception 'schedule template revision stale' using errcode='40001'; end if;
 insert into public.schedule_template_events(workspace_id,template_id,template_name,action,actor_user_id) values(target_workspace_id,target_template_id,old_name,'deleted',actor_user_id);
 return jsonb_build_object('status','deleted','template_id',target_template_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_schedule_export_schedule_service(actor_user_id uuid, target_workspace_id uuid, target_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  created public.scheduled_schedule_exports%rowtype;
  preset_name text;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.export', target_locations => array(
    select jsonb_array_elements_text(target_payload->'location_ids')::uuid
  ));

  if not exists (
    select 1
      from public.schedule_export_presets p
     where p.id = (target_payload->>'preset_id')::uuid
       and p.workspace_id = target_workspace_id
       and p.created_by = actor_user_id
  ) then
    raise exception 'schedule export preset not found' using errcode='P0002';
  end if;

  insert into public.scheduled_schedule_exports(
    workspace_id,
    preset_id,
    name,
    recipients,
    location_ids,
    day_of_week,
    send_hour,
    timezone,
    created_by,
    updated_by
  )
  values (
    target_workspace_id,
    (target_payload->>'preset_id')::uuid,
    btrim(target_payload->>'name'),
    target_payload->'recipients',
    array(
      select jsonb_array_elements_text(target_payload->'location_ids')::uuid
    ),
    (target_payload->>'day_of_week')::smallint,
    (target_payload->>'send_hour')::smallint,
    btrim(target_payload->>'timezone'),
    actor_user_id,
    actor_user_id
  )
  returning * into created;

  select p.name into preset_name
    from public.schedule_export_presets p
   where p.id = created.preset_id;

  return public.schedule_export_schedule_json(created, preset_name);
exception
  when unique_violation then
    raise exception 'scheduled export name conflict' using errcode='23505';
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
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.export', target_locations => next_location_ids);

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

-- A recent export records the locations it named; they are asked again here.
-- An export with no location list is the organization's.
CREATE OR REPLACE FUNCTION public.record_schedule_export_event_service(actor_user_id uuid, target_workspace_id uuid, target_surface text, target_format text, target_params jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  created public.schedule_export_events%rowtype;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.export', target_locations => case
    when jsonb_typeof(target_params->'location_ids') = 'array'
      then array(select jsonb_array_elements_text(target_params->'location_ids')::uuid)
    else '{}'::uuid[]
  end);

  insert into public.schedule_export_events(
    workspace_id,
    actor_user_id,
    surface,
    format,
    params
  )
  values (
    target_workspace_id,
    actor_user_id,
    btrim(target_surface),
    btrim(target_format),
    coalesce(target_params, '{}'::jsonb)
  )
  returning * into created;

  return public.schedule_export_event_json(created);
end;
$function$
;

-- 2. The week grid: one function (4 -> 1) ---------------------------------------------------
-- The grid and its ghosts draw one line, the locations scope_set() gives for
-- schedule.read (REUSE B1, FB-6.1 T3): a live location in reach is a row, a
-- shift somebody on the grid works anywhere else is a ghost. The labels, the
-- shift label list, the schedule exclusion and the conflict settings the
-- three old layers added are part of the one read.
CREATE OR REPLACE FUNCTION public.get_schedule_read_model_service(actor_user_id uuid, target_workspace_id uuid, target_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  settings public.workspace_scheduling_settings%rowtype;
  resolved_week_start date;
  -- ponytail: one mode today, live shifts elsewhere as ghosts. B4's
  -- published-plan preview (FB-6.1b) is a second way to fill ghost_shifts,
  -- not a second read.
  reach uuid[] := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.read');
  result jsonb;
begin
  -- Nowhere to read: the core says why. A workspace with no live location
  -- reads as empty to whoever would reach it, rather than refusing the owner.
  if cardinality(reach) = 0
     and (app_private.authz_reason(actor_user_id, target_workspace_id, 'schedule.read') is distinct from 'out_of_scope'
          or exists (select 1 from public.locations l where l.workspace_id = target_workspace_id and l.deleted_at is null)) then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.read');
  end if;

  select * into settings
  from public.workspace_scheduling_settings
  where workspace_id = target_workspace_id;
  if settings.workspace_id is null then
    raise exception 'scheduling settings are unavailable' using errcode = 'P0002';
  end if;

  resolved_week_start := case settings.week_start_day
    when 'sunday' then target_date - extract(dow from target_date)::integer
    else target_date - (extract(isodow from target_date)::integer - 1)
  end;

  with allowed_locations as (
    select location.*
    from public.locations location
    where location.workspace_id = target_workspace_id
      and location.archived_at is null
      and location.id = any(reach)
  ), current_publications as (
    select publication.*
    from public.schedule_location_publications publication
    join allowed_locations location on location.id = publication.location_id
    where publication.week_start = resolved_week_start
      and publication.status = 'current'
  ), visible_employees as (
    select distinct employee.*
    from public.employee_profiles employee
    where employee.workspace_id = target_workspace_id
      and employee.archived_at is null
      and exists (
        select 1
        from public.employee_location_assignments assignment
        join allowed_locations location on location.id = assignment.location_id
        where assignment.employee_id = employee.id and assignment.ended_at is null
      )
  ), current_shifts as (
    select shift.*
    from public.schedule_published_shifts shift
    join current_publications publication on publication.id = shift.publication_id
    where shift.scheduled_date between resolved_week_start and resolved_week_start + 6
  ), ghost_shifts as (
    -- A shift somebody on this grid works at a location the actor does not
    -- reach: what the shift card says, not its note (REUSE B1, FB-6.1 T3).
    select shift.id, shift.employee_id, shift.location_id, location.name as location_name,
      shift.scheduled_date, shift.start_time, shift.end_time, shift.crosses_midnight,
      shift.job_id, job.name as job_name, shift.shift_type_id, shift_type.name as shift_type_name,
      shift.label_ids, shift.label_names
    from visible_employees employee
    join public.schedule_published_shifts shift
      on shift.employee_id = employee.id
     and shift.scheduled_date between resolved_week_start and resolved_week_start + 6
    join public.schedule_location_publications publication
      on publication.id = shift.publication_id and publication.status = 'current'
     and publication.week_start = resolved_week_start
    join public.locations location
      on location.id = shift.location_id and location.workspace_id = target_workspace_id
     and location.archived_at is null and location.deleted_at is null
    -- Names travel with the ghost, named as the grid names a real shift: from
    -- the live job and type (null once archived or deleted, as the grid's
    -- lists leave them out) and the labels as the shift recorded them.
    left join public.jobs job
      on job.id = shift.job_id and job.workspace_id = target_workspace_id
     and job.archived_at is null and job.deleted_at is null
    left join public.shift_types shift_type
      on shift_type.id = shift.shift_type_id and shift_type.workspace_id = target_workspace_id
     and shift_type.archived_at is null and shift_type.deleted_at is null
    where not exists (select 1 from allowed_locations allowed where allowed.id = shift.location_id)
  ), week_availability as materialized (
    select * from app_private.schedule_week_availability(
      target_workspace_id, resolved_week_start,
      (select coalesce(array_agg(employee.id), '{}') from visible_employees employee),
      (select coalesce(array_agg(location.id), '{}') from allowed_locations location))
  )
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'week_start', resolved_week_start,
    'week_start_day', settings.week_start_day,
    'settings', jsonb_build_object(
      'time_format', coalesce(settings.time_format, '12h'),
      'conflict_rules', settings.conflict_rules,
      'minimum_travel_minutes', settings.minimum_travel_minutes,
      'minimum_rest_minutes', settings.minimum_rest_minutes
    ),
    'shift_labels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', label.id, 'name', label.name, 'color', label.color, 'sort_order', label.sort_order
      ) order by label.sort_order, label.name)
      from public.shift_labels label
      where label.workspace_id = target_workspace_id and label.archived_at is null
    ), '[]'::jsonb),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', location.id,
        'name', location.name,
        'timezone', location.timezone,
        'sort_order', location.sort_order,
        'publication_status', case when publication.id is null then 'unpublished' else 'published' end,
        'published_at', publication.published_at
      ) order by location.sort_order, location.name)
      from allowed_locations location
      left join current_publications publication on publication.location_id = location.id
    ), '[]'::jsonb),
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', department.id, 'name', department.name, 'color', department.color,
        'sort_order', department.sort_order
      ) order by department.sort_order, department.name)
      from public.departments department
      where department.workspace_id = target_workspace_id and department.archived_at is null
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', job.id, 'name', job.name, 'color', job.color,
        'sort_order', job.sort_order, 'department_id', job.department_id
      ) order by job.sort_order, job.name)
      from public.jobs job
      where job.workspace_id = target_workspace_id and job.archived_at is null
    ), '[]'::jsonb),
    'shift_types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', shift_type.id, 'name', shift_type.name, 'color', shift_type.color,
        'sort_order', shift_type.sort_order,
        'default_revision',shift_type.default_revision,'default_start_time', case when shift_type.default_start_time is null then null else to_char(shift_type.default_start_time, 'HH24:MI') end,
        'default_end_time', case when shift_type.default_end_time is null then null else to_char(shift_type.default_end_time, 'HH24:MI') end
      ) order by shift_type.sort_order, shift_type.name)
      from public.shift_types shift_type
      where shift_type.workspace_id = target_workspace_id and shift_type.archived_at is null
    ), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', employee.id,
        'employee_code', employee.employee_code,
        'display_name', coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' ' || employee.last_name,
        'is_excluded_from_schedule', coalesce(employee.is_excluded_from_schedule, false),
        'location_ids', coalesce((select jsonb_agg(assignment.location_id order by assignment.location_id)
          from public.employee_location_assignments assignment
          join allowed_locations location on location.id = assignment.location_id
          where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
        'job_ids', coalesce((select jsonb_agg(assignment.job_id order by assignment.job_id)
          from public.employee_job_assignments assignment
          where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
        'primary_job_id', (select assignment.job_id
          from public.employee_job_assignments assignment
          where assignment.employee_id = employee.id and assignment.ended_at is null
          order by assignment.is_primary desc, assignment.job_id
          limit 1),
        'weekly_availability', coalesce((select jsonb_agg(week.projection order by week.location_id)
          from week_availability week
          where week.employee_id = employee.id
            and exists (select 1 from public.employee_location_assignments assignment
              where assignment.employee_id = employee.id and assignment.location_id = week.location_id
                and assignment.ended_at is null)), '[]'::jsonb)
      ) order by employee.last_name, employee.first_name, employee.id)
      from visible_employees employee
    ), '[]'::jsonb),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', shift.id,
        'location_id', shift.location_id,
        'employee_id', shift.employee_id,
        'job_id', shift.job_id,
        'shift_type_id', shift.shift_type_id,
        'scheduled_date', shift.scheduled_date,
        'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time', to_char(shift.start_time, 'HH24:MI'),
        'end_time', to_char(shift.end_time, 'HH24:MI'),
        'crosses_midnight', shift.crosses_midnight,
        'unpaid_break_minutes', coalesce(shift.unpaid_break_minutes, 0),
        'hide_time_on_badge', coalesce(shift.hide_time_on_badge, false),
        'note', shift.note,
        'label_ids', to_jsonb(coalesce(shift.label_ids, '{}'::uuid[])),
        'label_names', to_jsonb(coalesce(shift.label_names, '{}'::text[])),
        'warning_codes', to_jsonb(array_remove(array[
          case when exists (
            select 1 from public.schedule_closures closure
            where closure.location_id = shift.location_id
              and closure.closed_date = shift.scheduled_date and closure.is_all_day
          ) then 'closed_location' end,
          -- A published shift keeps what was accepted when it was published.
          case when shift.employee_id is not null
            and public.weekly_published_availability_visible(target_workspace_id, shift.employee_id, shift.availability_snapshot)
          then 'availability' end,
          case when shift.employee_id is not null and exists (
            select 1 from current_shifts other
            where other.employee_id = shift.employee_id
              and other.scheduled_date = shift.scheduled_date
              and other.id <> shift.id
              and not shift.crosses_midnight and not other.crosses_midnight
              and shift.start_time < other.end_time and shift.end_time > other.start_time
          ) then 'overlap' end
        ]::text[], null))
      ) order by shift.scheduled_date, shift.start_time, shift.id)
      from current_shifts shift
    ), '[]'::jsonb),
    'ghost_shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ghost.id,
        'employee_id', ghost.employee_id,
        'location_id', ghost.location_id,
        'location_name', ghost.location_name,
        'scheduled_date', ghost.scheduled_date,
        'start_time', to_char(ghost.start_time, 'HH24:MI'),
        'end_time', to_char(ghost.end_time, 'HH24:MI'),
        'crosses_midnight', ghost.crosses_midnight,
        'job_id', ghost.job_id,
        'job_name', ghost.job_name,
        'shift_type_id', ghost.shift_type_id,
        'shift_type_name', ghost.shift_type_name,
        'label_ids', to_jsonb(ghost.label_ids),
        'label_names', to_jsonb(ghost.label_names)
      ) order by ghost.scheduled_date, ghost.start_time, ghost.id)
      from ghost_shifts ghost
    ), '[]'::jsonb),
    'closures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', closure.id, 'location_id', closure.location_id,
        'closed_date', closure.closed_date, 'title', closure.title,
        'is_all_day', closure.is_all_day
      ) order by closure.closed_date, closure.title)
      from public.schedule_closures closure
      join allowed_locations location on location.id = closure.location_id
      where closure.closed_date between resolved_week_start and resolved_week_start + 6
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$function$

;

-- 3. An open edit: one read (3 -> 1) --------------------------------------------------------
-- The edit's own shifts with what the two old layers added: where a shift came
-- from, its pending change and lock, its labels, and the edit's locations.
-- ponytail: the edit is its holder's; the locations it may hold were asked of
-- the core when it opened (acquire) and each change asks again (mutate).
CREATE OR REPLACE FUNCTION public.get_schedule_edit_session_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_session public.schedule_edit_sessions%rowtype;
  result jsonb;
begin
  select * into target_session
  from public.schedule_edit_sessions session
  where session.id = target_session_id
    and session.workspace_id = target_workspace_id
    and session.holder_user_id = actor_user_id;
  if target_session.id is null then
    raise exception 'edit session not found' using errcode = 'P0002';
  end if;

  with week_availability as materialized (
    select * from app_private.schedule_week_availability(
      target_workspace_id, target_session.week_start,
      array(select distinct s.employee_id from public.schedule_edit_session_shifts s
            where s.session_id = target_session.id and s.employee_id is not null),
      array(select distinct s.location_id from public.schedule_edit_session_shifts s
            where s.session_id = target_session.id))
  )
  select jsonb_build_object(
    'id', target_session.id,
    'workspace_id', target_session.workspace_id,
    'week_start', target_session.week_start,
    'source_kind', target_session.source_kind,
    'source_draft_id', target_session.source_draft_id,
    'source_revision', target_session.source_revision,
    'holder_user_id', target_session.holder_user_id,
    'holder_name', coalesce((
      select profile.display_name from public.user_profiles profile
      where profile.user_id = target_session.holder_user_id
    ), 'Manager'),
    'revision', target_session.revision,
    'dirty', target_session.dirty,
    'last_heartbeat', target_session.last_heartbeat,
    'expires_at', target_session.expires_at,
    'location_ids', to_jsonb(target_session.location_ids),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', shift.id,
        'location_id', shift.location_id,
        'employee_id', shift.employee_id,
        'job_id', shift.job_id,
        'shift_type_id', shift.shift_type_id,
        'scheduled_date', shift.scheduled_date,
        'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time', to_char(shift.start_time, 'HH24:MI'),
        'end_time', to_char(shift.end_time, 'HH24:MI'),
        'crosses_midnight', shift.crosses_midnight,
        'unpaid_break_minutes', coalesce(shift.unpaid_break_minutes, 0),
        'hide_time_on_badge', coalesce(shift.hide_time_on_badge, false),
        'note', shift.note,
        'revision', shift.revision,
        'source_published_shift_id', shift.source_published_shift_id,
        'pending_op_type', shift.pending_op_type,
        'locked', shift.locked,
        'label_ids', to_jsonb(coalesce(shift.label_ids, '{}'::uuid[])),
        'label_names', to_jsonb(coalesce(shift.label_names, '{}'::text[])),
        'warning_codes', to_jsonb(array_remove(array[
          case when exists (
            select 1 from public.schedule_closures closure
            where closure.location_id = shift.location_id
              and closure.closed_date = shift.scheduled_date and closure.is_all_day
          ) then 'closed_location' end,
          -- Unchanged published work keeps its accepted snapshot; anything else is
          -- checked against today's marks and approved leave.
          case when shift.employee_id is not null and (
            select case when kept.prior is not null
              then public.weekly_published_availability_visible(target_workspace_id, shift.employee_id, kept.prior -> 'availability_snapshot')
              else exists (select 1 from week_availability week
                where week.employee_id = shift.employee_id and week.location_id = shift.location_id
                  and (week.unavailable + week.leave) && app_private.shift_time_range(shift.scheduled_date, shift.start_time, shift.end_time,
                    coalesce(shift.time_timezone, (select l.timezone from public.locations l where l.id = shift.location_id))))
            end
            from (select public.schedule_availability_prior_publication(target_workspace_id, to_jsonb(shift)) as prior) kept
          ) then 'availability' end,
          case when shift.employee_id is not null and exists (
            select 1 from public.schedule_edit_session_shifts other
            where other.session_id = target_session.id
              and other.employee_id = shift.employee_id
              and other.scheduled_date = shift.scheduled_date
              and other.id <> shift.id
              and not shift.crosses_midnight and not other.crosses_midnight
              and shift.start_time < other.end_time and shift.end_time > other.start_time
          ) then 'overlap' end
        ]::text[], null))
      ) order by shift.scheduled_date, shift.start_time, shift.id)
      from public.schedule_edit_session_shifts shift
      where shift.session_id = target_session.id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$function$

;

-- 4. Opening an edit: one function (2 -> 1) ------------------------------------------------
-- A past week stays read-only; the edit holds the requested locations the
-- person edits (all of them by default), so a draft of Kadıköy and Beşiktaş
-- opens at Kadıköy only for Kadıköy's manager (B1).
CREATE OR REPLACE FUNCTION public.acquire_schedule_edit_session_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date, requested_source schedule_edit_source, requested_draft_id uuid DEFAULT NULL::uuid, target_location_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_week_start date;
  manageable uuid[];
  effective uuid[];
  adding uuid[];
  own_session public.schedule_edit_sessions%rowtype;
  holder public.schedule_edit_sessions%rowtype;
  source_draft public.schedule_drafts%rowtype;
  edit_session_id uuid;
  session_source public.schedule_edit_source;
  session_draft_id uuid;
  recovery_draft_id uuid;
begin
  current_week_start := public.schedule_current_week_start_service(target_workspace_id);
  if current_week_start is not null and target_week_start < current_week_start then
    raise exception '%', jsonb_build_object(
      'status', 'past_edit_blocked',
      'past_edits', jsonb_build_array(jsonb_build_object(
        'op_type', 'update',
        'shift_id', null,
        'scheduled_date', to_char(target_week_start, 'YYYY-MM-DD'),
        'location_name', 'Schedule week',
        'employee_name', null,
        'reason', 'past_week',
        'severity', 'blocked'
      )),
      'past_edit_messages', jsonb_build_array(
        'Past schedule weeks are read-only.'
      ),
      'current_week_start', current_week_start
    )::text using errcode = 'P0001';
  end if;

  perform public.availability_lock_workspace(target_workspace_id);

  -- Where this person may edit: the live locations the core gives.
  manageable := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.edit');
  select coalesce(array_agg(location.id order by location.id), '{}') into manageable
  from public.locations location
  where location.workspace_id = target_workspace_id
    and location.archived_at is null
    and location.id = any(manageable);
  select coalesce(array_agg(distinct requested order by requested), '{}') into effective
  from unnest(coalesce(target_location_ids, manageable)) requested
  where requested = any(manageable);
  if cardinality(effective) = 0 then
    -- Nothing here to edit: asked of no place, the core answers with the
    -- person's reason (no permission, blocked) or out_of_scope.
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.edit', target_locations => array[null]::uuid[]);
  end if;

  select * into own_session
  from public.schedule_edit_sessions session
  where session.workspace_id = target_workspace_id
    and session.week_start = target_week_start
    and session.holder_user_id = actor_user_id
    and session.status = 'active'
  for update;
  adding := array(
    select location_id from unnest(effective) location_id
    where own_session.id is null or not location_id = any(own_session.location_ids)
  );

  if own_session.id is null and requested_source = 'draft' then
    select * into source_draft
    from public.schedule_drafts draft
    where draft.id = requested_draft_id
      and draft.workspace_id = target_workspace_id
      and draft.week_start = target_week_start
      and draft.archived_at is null;
    if source_draft.id is null then
      raise exception 'draft not found' using errcode = 'P0002';
    end if;

    -- One person edits a draft at a time: say who, take nothing.
    select * into holder
    from public.schedule_edit_sessions session
    where session.source_draft_id = source_draft.id
      and session.status = 'active'
    for update;
    if holder.id is not null and holder.expires_at > now() then
      return jsonb_build_object(
        'status', 'conflict',
        'session_id', holder.id,
        'holder_name', coalesce((
          select profile.display_name from public.user_profiles profile
          where profile.user_id = holder.holder_user_id
        ), 'Another manager'),
        'last_heartbeat', holder.last_heartbeat,
        'expires_at', holder.expires_at
      );
    end if;

    -- An expired edit of the draft closes; unsaved work becomes a recovery draft.
    if holder.id is not null then
      if holder.dirty then
        insert into public.schedule_drafts (
          workspace_id, week_start, name, created_by, updated_by, location_ids, base_publication_ids
        ) values (
          target_workspace_id, target_week_start,
          'Recovered edit ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS') || ' ' || left(holder.id::text, 4),
          holder.holder_user_id, holder.holder_user_id, holder.location_ids, holder.base_publication_ids
        ) returning id into recovery_draft_id;
        insert into public.schedule_draft_shifts (id, workspace_id, draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision)
        select id, workspace_id, recovery_draft_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision
        from public.schedule_edit_session_shifts
        where session_id = holder.id;
      end if;
      update public.schedule_edit_sessions
      set status = case when recovery_draft_id is null then 'expired'::public.schedule_edit_session_status
                        else 'recovered'::public.schedule_edit_session_status end,
          recovered_draft_id = recovery_draft_id,
          closed_at = now()
      where id = holder.id;
    end if;
  end if;

  if own_session.id is not null then
    -- BL-069: the same person picks their edit back up, widened to the new locations.
    update public.schedule_edit_sessions
    set last_heartbeat = now(),
        expires_at = now() + interval '4 minutes',
        location_ids = array(
          select distinct location_id from unnest(own_session.location_ids || adding) location_id
          order by location_id
        ),
        base_publication_ids = own_session.base_publication_ids || app_private.schedule_edit_starting_point(
          target_workspace_id, target_week_start, adding, own_session.source_draft_id
        )
    where id = own_session.id;
    edit_session_id := own_session.id;
    session_source := own_session.source_kind;
    session_draft_id := own_session.source_draft_id;
  else
    insert into public.schedule_edit_sessions (
      workspace_id, week_start, source_kind, source_draft_id, source_revision,
      holder_user_id, location_ids, base_publication_ids
    ) values (
      target_workspace_id, target_week_start, requested_source,
      case when requested_source = 'draft' then source_draft.id end,
      case when requested_source = 'draft' then source_draft.revision else 0 end,
      actor_user_id, effective,
      app_private.schedule_edit_starting_point(target_workspace_id, target_week_start, effective, source_draft.id)
    ) returning id into edit_session_id;
    session_source := requested_source;
    session_draft_id := source_draft.id;
  end if;

  if session_source = 'published' then
    insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note)
    select shift.source_shift_id, shift.workspace_id, edit_session_id, shift.location_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note
    from public.schedule_published_shifts shift
    join public.schedule_location_publications publication on publication.id = shift.publication_id
    where shift.workspace_id = target_workspace_id
      and publication.week_start = target_week_start
      and publication.status = 'current'
      and shift.location_id = any(adding);
  elsif session_source = 'draft' then
    insert into public.schedule_edit_session_shifts (id, workspace_id, session_id, location_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, revision)
    select shift.id, shift.workspace_id, edit_session_id, shift.location_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.revision
    from public.schedule_draft_shifts shift
    where shift.draft_id = session_draft_id
      and shift.location_id = any(adding);
  end if;

  return jsonb_build_object(
    'status', case
      when own_session.id is not null then 'resumed'
      when recovery_draft_id is not null then 'acquired_after_recovery'
      else 'acquired'
    end,
    'session', public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, edit_session_id),
    'recovered_draft_id', recovery_draft_id
  );
end;
$function$

;

-- 5. Changing a shift in an open edit: one function (5 -> 1) -------------------------------
-- In order, as the five layers ran: create and update change the row (steps
-- a-b); delete and restore of a published shift only mark it, an unpublished
-- one is deleted outright (step a); then the labels (c), the hard document
-- block (d) and the audit of an overridden soft conflict (e). The location a
-- shift is written to is asked of the core; the rows it acts on are those in
-- reach (scope_set()), so a shift somebody else's location holds reads as
-- stale.
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
        target_note := coalesce(row_payload->>'note', '');
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

  -- c. Labels.
  if operation in ('create', 'update') and shift_payload is not null then
    update public.schedule_edit_session_shifts shift
       set label_ids = coalesce(
             array(select jsonb_array_elements_text(coalesce(shift_payload->'label_ids', '[]'::jsonb))::uuid),
             '{}'::uuid[]
           ),
           label_names = coalesce(
             array(select jsonb_array_elements_text(coalesce(shift_payload->'label_names', '[]'::jsonb))),
             '{}'::text[]
           )
     where shift.session_id = target_session_id
       and shift.id = target_shift_id
       and shift.workspace_id = target_workspace_id;

    if found then
      result := public.get_schedule_edit_session_service(actor_user_id, target_workspace_id, target_session_id);
    end if;
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
$function$
;

-- 6. Saving an edit as a draft: one function (5 -> 1) ---------------------------------------
-- In order, as the five layers ran: the Shift Hub guard, the past-week and
-- started-shift findings over the shifts in reach (scope_set()), the labels
-- kept aside, the pending deletes applied, the draft written, the labels put
-- back. The whole edit is saved, as before; B2 (save only the locations one
-- manages, FB-6.1b) narrows the location list step c writes, not the shape.
CREATE OR REPLACE FUNCTION public.save_schedule_edit_session_service(actor_user_id uuid, target_workspace_id uuid, target_session_id uuid, expected_session_revision integer, target_name text, target_draft_id uuid DEFAULT NULL::uuid, expected_draft_revision integer DEFAULT NULL::integer, acknowledge_past_edits boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    raise exception 'edit lease expired' using errcode = '40001';
  end if;
  if target_session.revision <> expected_session_revision then
    raise exception 'session revision stale' using errcode = '40001';
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
      raise exception 'edit lease expired' using errcode = '40001';
    end if;
    if target_session.revision <> expected_session_revision then
      raise exception 'session revision stale' using errcode = '40001';
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
        raise exception 'draft revision stale' using errcode = '40001';
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
$function$
;

-- 7. The publish preview: one function (4 -> 1) --------------------------------------------
-- Every location a publish names is one the person publishes at (M2, B2's
-- publish side, Q2): each is asked of the core, a location out of reach is
-- out_of_scope and nothing is previewed. The weekly availability review and
-- the "changed since you started" note the two old wrappers added are part of
-- the one answer. Without departments the whole draft is previewed.
CREATE OR REPLACE FUNCTION public.preview_schedule_publication_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_location_ids uuid[], target_department_ids uuid[] DEFAULT NULL::uuid[], include_no_department boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  requested uuid;
  target_draft public.schedule_drafts%rowtype;
  normalized_locations uuid[];
  normalized_departments uuid[];
  effective_include_no_department boolean := coalesce(include_no_department, true);
  location_payload jsonb;
  finding_payload jsonb;
  unsigned_payload jsonb;
  preview_fingerprint text;
  hard_count integer;
  soft_count integer;
begin
  -- Nothing named is nowhere to publish; the core says why.
  if cardinality(coalesce(target_location_ids, '{}'::uuid[])) = 0 then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => '{}'::uuid[]);
  end if;
  foreach requested in array target_location_ids loop
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => array[requested]);
  end loop;

  select * into target_draft
  from public.schedule_drafts draft
  where draft.id = target_draft_id
    and draft.workspace_id = target_workspace_id
    and draft.archived_at is null;
  if target_draft.id is null then
    raise exception 'schedule draft not found' using errcode = 'P0002';
  end if;
  if target_draft.week_start < public.schedule_current_week_start_service(target_workspace_id) then
    return app_private.schedule_publication_changes_since_start(public.weekly_schedule_publication_preflight(
      jsonb_build_object(
        'status', 'past_week_closed', 'workspace_id', target_workspace_id,
        'week_start', target_draft.week_start, 'draft_id', target_draft.id,
        'draft_revision', target_draft.revision, 'fingerprint', repeat('0', 64),
        'locations', '[]'::jsonb, 'findings', '[]'::jsonb
      ), actor_user_id, target_department_ids, include_no_department));
  end if;

  select array_agg(distinct location_id order by location_id)
  into normalized_locations
  from unnest(target_location_ids) location_id;
  -- ponytail: a closed (archived) location the core still counts as live
  -- (FB-6.1 2a N6) keeps its old refusal.
  if exists (
    select 1 from unnest(normalized_locations) location_id
    where not exists (
      select 1 from public.locations location
      where location.id = location_id and location.workspace_id = target_workspace_id
        and location.archived_at is null
    )
  ) then
    raise exception 'schedule publication scope denied' using errcode = '42501';
  end if;
  -- A draft publishes only the locations it covers; anything else would be
  -- replaced with nothing.
  if not normalized_locations <@ target_draft.location_ids then
    raise exception 'publication location is not in this draft' using errcode = '22023';
  end if;

  if target_department_ids is not null then
    select coalesce(array_agg(distinct department.id order by department.id), '{}'::uuid[])
    into normalized_departments
    from public.departments department
    join unnest(target_department_ids) requested(id) on requested.id = department.id
    where department.workspace_id = target_workspace_id
      and department.archived_at is null;

    if cardinality(normalized_departments) = 0
      and not effective_include_no_department then
      raise exception 'invalid department publication scope' using errcode = '22023';
    end if;
  end if;

  with selected_locations as (
    select location.id, location.name
    from public.locations location
    where location.id = any(normalized_locations)
  ), active as (
    select publication.*
    from public.schedule_location_publications publication
    where publication.workspace_id = target_workspace_id
      and publication.week_start = target_draft.week_start
      and publication.location_id = any(normalized_locations)
      and publication.status = 'current'
  ), current_shift as (
    select shift.*
    from public.schedule_published_shifts shift
    join active publication on publication.id = shift.publication_id
    where public.schedule_shift_in_department_scope_service(
      shift.job_id, normalized_departments, effective_include_no_department
    )
  ), next_shift as (
    select shift.*
    from public.schedule_draft_shifts shift
    where shift.draft_id = target_draft.id
      and shift.location_id = any(normalized_locations)
      and public.schedule_shift_in_department_scope_service(
        shift.job_id, normalized_departments, effective_include_no_department
      )
  ), comparison as (
    select location.id as location_id, location.name as location_name,
      publication.id as active_publication_id,
      publication.version_number as active_version,
      (select count(*) from current_shift shift where shift.location_id = location.id)::integer as current_shift_count,
      (select count(*) from next_shift shift where shift.location_id = location.id)::integer as next_shift_count,
      (select count(*) from next_shift next_row where next_row.location_id = location.id and not exists (
        select 1 from current_shift current_row where current_row.location_id = location.id and current_row.source_shift_id = next_row.id
      ))::integer as added,
      (select count(*) from current_shift current_row where current_row.location_id = location.id and not exists (
        select 1 from next_shift next_row where next_row.location_id = location.id and next_row.id = current_row.source_shift_id
      ))::integer as removed,
      (select count(*) from next_shift next_row join current_shift current_row
        on current_row.location_id = next_row.location_id and current_row.source_shift_id = next_row.id
        where next_row.location_id = location.id and (
          current_row.employee_id is distinct from next_row.employee_id
          or current_row.job_id is distinct from next_row.job_id
          or current_row.shift_type_id is distinct from next_row.shift_type_id
          or current_row.scheduled_date is distinct from next_row.scheduled_date
          or current_row.start_time is distinct from next_row.start_time
          or current_row.end_time is distinct from next_row.end_time
          or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
        ))::integer as updated,
      (select count(*) from next_shift next_row join current_shift current_row
        on current_row.location_id = next_row.location_id and current_row.source_shift_id = next_row.id
        where next_row.location_id = location.id and not (
          current_row.employee_id is distinct from next_row.employee_id
          or current_row.job_id is distinct from next_row.job_id
          or current_row.shift_type_id is distinct from next_row.shift_type_id
          or current_row.scheduled_date is distinct from next_row.scheduled_date
          or current_row.start_time is distinct from next_row.start_time
          or current_row.end_time is distinct from next_row.end_time
          or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
        ))::integer as unchanged,
      coalesce((
        select array_agg(distinct affected.employee_id order by affected.employee_id)
        from (
          select next_row.employee_id
          from next_shift next_row
          where next_row.location_id = location.id
            and next_row.employee_id is not null
            and not exists (
              select 1 from current_shift current_row
              where current_row.location_id = location.id
                and current_row.source_shift_id = next_row.id
            )
          union
          select next_row.employee_id
          from next_shift next_row
          join current_shift current_row
            on current_row.location_id = next_row.location_id
           and current_row.source_shift_id = next_row.id
          where next_row.location_id = location.id
            and next_row.employee_id is not null
            and (
              current_row.employee_id is distinct from next_row.employee_id
              or current_row.job_id is distinct from next_row.job_id
              or current_row.shift_type_id is distinct from next_row.shift_type_id
              or current_row.scheduled_date is distinct from next_row.scheduled_date
              or current_row.start_time is distinct from next_row.start_time
              or current_row.end_time is distinct from next_row.end_time
              or current_row.time_basis is distinct from next_row.time_basis
          or current_row.time_snapshot is distinct from next_row.time_snapshot
          or current_row.time_timezone is distinct from next_row.time_timezone
          or current_row.note is distinct from next_row.note
            )
          union
          select current_row.employee_id
          from current_shift current_row
          where current_row.location_id = location.id
            and current_row.employee_id is not null
            and not exists (
              select 1 from next_shift next_row
              where next_row.location_id = location.id
                and next_row.id = current_row.source_shift_id
            )
        ) affected
      ), '{}'::uuid[]) as affected_employee_ids
    from selected_locations location
    left join active publication on publication.location_id = location.id
  )
  select jsonb_agg(to_jsonb(comparison) order by location_name, location_id)
  into location_payload from comparison;

  with next_shift as (
    select shift.*,
      coalesce(nullif(employee.preferred_name, ''), employee.first_name) || ' ' || employee.last_name as employee_name,
      location.name as location_name,
      tsrange(
        shift.scheduled_date::timestamp + shift.start_time,
        shift.scheduled_date::timestamp + shift.end_time
          + case when shift.end_time <= shift.start_time then interval '1 day' else interval '0' end,
        '[)'
      ) as occupied
    from public.schedule_draft_shifts shift
    join public.locations location on location.id = shift.location_id
    left join public.employee_profiles employee on employee.id = shift.employee_id
    where shift.draft_id = target_draft.id
      and shift.location_id = any(normalized_locations)
      and public.schedule_shift_in_department_scope_service(
        shift.job_id, normalized_departments, effective_include_no_department
      )
  ), raw_findings as (
    select
      'overlap'::text as code, case when first.time_basis='explicit' and second.time_basis='explicit' then 'hard' else 'soft' end::text as severity, (first.time_basis='type_default' or second.time_basis='type_default') as overrideable,
      first.location_id, first.employee_id, first.scheduled_date,
      array[first.id, second.id]::uuid[] as shift_ids,
      first.employee_name || case when first.time_basis='type_default' or second.time_basis='type_default' then ' has overlapping reference hours on ' else ' has overlapping shifts on ' end || first.scheduled_date::text || '.' as message
    from next_shift first
    join next_shift second on second.employee_id = first.employee_id and second.id > first.id
      and first.employee_id is not null and first.time_basis in ('explicit','type_default') and second.time_basis in ('explicit','type_default') and first.occupied && second.occupied
    union all
    select
      'closed_location', 'soft', true, shift.location_id, shift.employee_id,
      shift.scheduled_date, array[shift.id]::uuid[],
      shift.location_name || ' is closed on ' || shift.scheduled_date::text || '.'
    from next_shift shift
    where exists (
      select 1 from public.schedule_closures closure
      where closure.location_id = shift.location_id
        and closure.closed_date = shift.scheduled_date and closure.is_all_day
    )
  ), findings as (
    select encode(extensions.digest(convert_to(
      code || '|' || coalesce(employee_id::text, '') || '|' || scheduled_date::text || '|' || array_to_string(shift_ids, ','),
      'UTF8'), 'sha256'), 'hex') as id, *
    from raw_findings
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'code', code, 'severity', severity, 'overrideable', overrideable,
    'message', message, 'location_id', location_id, 'employee_id', employee_id,
    'scheduled_date', scheduled_date, 'shift_ids', to_jsonb(shift_ids)
  ) order by severity, code, scheduled_date, id), '[]'::jsonb),
  count(*) filter (where severity = 'hard')::integer,
  count(*) filter (where severity = 'soft')::integer
  into finding_payload, hard_count, soft_count
  from findings;

  unsigned_payload := jsonb_build_object(
    'workspace_id', target_workspace_id,
    'week_start', target_draft.week_start,
    'draft_id', target_draft.id,
    'draft_revision', target_draft.revision,
    'locations', coalesce(location_payload, '[]'::jsonb),
    'findings', finding_payload
  );
  preview_fingerprint := encode(extensions.digest(convert_to(unsigned_payload::text, 'UTF8'), 'sha256'), 'hex');
  return app_private.schedule_publication_changes_since_start(public.weekly_schedule_publication_preflight(
    unsigned_payload || jsonb_build_object(
      'status', case when hard_count > 0 then 'hard_blocked'
        when soft_count > 0 then 'override_required' else 'publish_ready' end,
      'fingerprint', preview_fingerprint
    ), actor_user_id, target_department_ids, include_no_department));
end;
$function$

;

-- 8. Publishing: one function (9 -> 1) -----------------------------------------------------
-- In order, as the nine functions ran on the path the API calls: every named
-- location asked of the core first (Q2), the Shift Hub guard, the publish
-- itself against the preview's fingerprint, the hard document block, and the
-- publish notification to the people named. The seven- and nine-argument
-- publishes and the label-copying twin are gone; calls without departments or
-- recipients reach this one through its defaults.
CREATE OR REPLACE FUNCTION public.publish_schedule_draft_service(actor_user_id uuid, target_workspace_id uuid, target_draft_id uuid, target_location_ids uuid[], target_department_ids uuid[], include_no_department boolean, expected_draft_revision integer, expected_fingerprint text, override_decisions jsonb DEFAULT '[]'::jsonb, target_notify_employee_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  requested uuid;
  result jsonb;
  notification_event_id uuid;
  normalized_recipient_ids uuid[];
  result_publication_ids uuid[];
  target_draft public.schedule_drafts%rowtype;
  preview jsonb;
  location_item jsonb;
  finding jsonb;
  decision jsonb;
  new_publication_id uuid;
  previous_publication_id uuid;
  publication_ids uuid[] := '{}'::uuid[];
  normalized_locations uuid[];
  normalized_departments uuid[];
  effective_include_no_department boolean := coalesce(include_no_department, true);
  total_shift_count integer := 0;
  published_at timestamptz := now();
begin
  if cardinality(coalesce(target_location_ids, '{}'::uuid[])) = 0 then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => '{}'::uuid[]);
  end if;
  foreach requested in array target_location_ids loop
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => array[requested]);
  end loop;
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));
  perform public.shift_exchange_assert_draft(target_workspace_id,target_draft_id,target_location_ids,target_department_ids,include_no_department);

  perform public.availability_lock_workspace(target_workspace_id);
  select * into target_draft from public.schedule_drafts draft
  where draft.id = target_draft_id and draft.workspace_id = target_workspace_id
    and draft.archived_at is null for update;
  if target_draft.id is null then raise exception 'schedule draft not found' using errcode = 'P0002'; end if;
  if target_draft.revision <> expected_draft_revision then
    raise exception 'stale publication preview' using errcode = '40001';
  end if;
  select array_agg(distinct location_id order by location_id) into normalized_locations
  from unnest(target_location_ids) location_id;

  if target_department_ids is not null then
    select coalesce(array_agg(distinct department.id order by department.id), '{}'::uuid[])
    into normalized_departments
    from public.departments department
    join unnest(target_department_ids) requested(id) on requested.id = department.id
    where department.workspace_id = target_workspace_id
      and department.archived_at is null;

    if cardinality(normalized_departments) = 0
      and not effective_include_no_department then
      raise exception 'invalid department publication scope' using errcode = '22023';
    end if;
  end if;

  perform 1 from public.schedule_location_publications publication
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_draft.week_start
    and publication.location_id = any(normalized_locations) for update;

  preview := public.preview_schedule_publication_service(
    actor_user_id,
    target_workspace_id,
    target_draft_id,
    normalized_locations,
    normalized_departments,
    effective_include_no_department
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
  override_decisions:=public.weekly_publication_decisions(preview,override_decisions);
  perform set_config('newfork.schedule_publish_scope',jsonb_build_object('workspace_id',target_workspace_id,'draft_id',target_draft_id,
   '_publish_locations',(select jsonb_agg(x->'location_id') from jsonb_array_elements(preview->'locations') x),
   '_publish_departments',preview->'department_ids','_publish_no_department',coalesce((preview->>'include_no_department')::boolean,true))::text,true);
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
    new_publication_id := gen_random_uuid();
    if previous_publication_id is not null then
      update public.schedule_location_publications
      set status = 'superseded'
      where id = previous_publication_id and status = 'current';
      if not found then raise exception 'stale publication preview' using errcode = '40001'; end if;
    end if;
    insert into public.schedule_location_publications (
      id, workspace_id, location_id, week_start, version_number, status,
      published_by, published_at, source_draft_id, source_draft_revision,
      content_fingerprint, department_ids, include_no_department
    ) values (
      new_publication_id, target_workspace_id, (location_item->>'location_id')::uuid,
      target_draft.week_start,
      coalesce((select max(version_number) + 1 from public.schedule_location_publications
        where location_id = (location_item->>'location_id')::uuid and week_start = target_draft.week_start), 1),
      'current', actor_user_id, published_at, target_draft.id, target_draft.revision,
      expected_fingerprint, normalized_departments, effective_include_no_department
    );
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
        target_workspace_id, new_publication_id, target_draft.id, target_draft.revision,
        finding->>'id', finding->>'code', nullif(finding->>'employee_id', '')::uuid,
        (finding->>'location_id')::uuid, (finding->>'scheduled_date')::date,
        array(select jsonb_array_elements_text(finding->'shift_ids')::uuid),
        btrim(decision->>'reason'), actor_user_id
      );
    end loop;
    if previous_publication_id is not null then
      update public.schedule_location_publications
      set superseded_by = new_publication_id
      where id = previous_publication_id;

      insert into public.schedule_published_shifts (workspace_id, location_id, publication_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, source_shift_id)
      select shift.workspace_id, shift.location_id, new_publication_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.source_shift_id from public.schedule_published_shifts shift
      where shift.publication_id = previous_publication_id
        and not public.schedule_shift_in_department_scope_service(
          shift.job_id, normalized_departments, effective_include_no_department
        );
    end if;

    insert into public.schedule_published_shifts (workspace_id, location_id, publication_id, employee_id, job_id, shift_type_id, scheduled_date, start_time, end_time, time_basis, time_snapshot, time_timezone, unpaid_break_minutes, hide_time_on_badge, note, source_shift_id)
    select shift.workspace_id, shift.location_id, new_publication_id, shift.employee_id, shift.job_id, shift.shift_type_id, shift.scheduled_date, shift.start_time, shift.end_time, shift.time_basis, shift.time_snapshot, shift.time_timezone, shift.unpaid_break_minutes, shift.hide_time_on_badge, shift.note, shift.id from public.schedule_draft_shifts shift
    where shift.draft_id = target_draft.id
      and shift.location_id = (location_item->>'location_id')::uuid
      and public.schedule_shift_in_department_scope_service(
        shift.job_id, normalized_departments, effective_include_no_department
      );
    publication_ids := array_append(publication_ids, new_publication_id);

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
    expected_fingerprint,
    jsonb_build_object(
      'locations', preview->'locations',
      'department_ids', to_jsonb(normalized_departments),
      'include_no_department', effective_include_no_department
    )
  );
  result := jsonb_build_object(
    'status', 'published', 'workspace_id', target_workspace_id,
    'week_start', target_draft.week_start, 'draft_id', target_draft.id,
    'draft_revision', target_draft.revision, 'location_ids', to_jsonb(normalized_locations),
    'publication_ids', to_jsonb(publication_ids), 'published_shift_count', total_shift_count,
    'published_at', published_at
  );

  -- Nobody missing a required document goes out on the published week.
  if public.schedule_draft_has_hard_document_conflicts_service(
      actor_user_id,
      target_workspace_id,
      target_draft_id,
      (result->>'week_start')::date,
      target_location_ids,
      target_department_ids,
      include_no_department
    ) then
    raise exception 'schedule has hard document blockers' using errcode = '23514';
  end if;

  -- The people named hear that their week is out.
  if coalesce(cardinality(target_notify_employee_ids), 0) = 0 then
    return result;
  end if;

  select array(
    select jsonb_array_elements_text(result->'publication_ids')::uuid
  ) into result_publication_ids;

  select coalesce(array_agg(distinct employee.id order by employee.id), '{}'::uuid[])
  into normalized_recipient_ids
  from public.employee_profiles employee
  join public.workspace_memberships membership
    on membership.workspace_id = employee.workspace_id
   and membership.user_id = employee.user_id
   and membership.status = 'active'
  where employee.workspace_id = target_workspace_id
    and employee.id = any(target_notify_employee_ids)
    and employee.archived_at is null
    and exists (
      select 1
      from public.schedule_published_shifts shift
      where shift.workspace_id = target_workspace_id
        and shift.publication_id = any(result_publication_ids)
        and shift.employee_id = employee.id
    );

  if cardinality(normalized_recipient_ids) = 0 then
    return result;
  end if;

  notification_event_id := gen_random_uuid();
  perform public.enqueue_notification_outbox_service(
    target_workspace_id,
    notification_event_id,
    'schedule.published',
    1,
    actor_user_id,
    'schedule_week',
    result->>'week_start',
    jsonb_build_object(
      'correlation_id', notification_event_id,
      'week_start', result->>'week_start',
      'publication_ids', result->'publication_ids',
      'location_ids', result->'location_ids',
      'recipient_employee_ids', to_jsonb(normalized_recipient_ids)
    ),
    (result->>'published_at')::timestamptz
  );

  return result || jsonb_build_object(
    'notification_event_id', notification_event_id,
    'notification_enqueued_count', cardinality(normalized_recipient_ids)
  );
exception when serialization_failure then raise exception '%',SQLERRM using errcode='PT409';
end;
$function$

;

-- 9. Taking a week down: preview and unpublish, one function each (2 -> 1, 2 -> 1) ---------
-- Every named location is one the person publishes at (Q2), asked of the core.
CREATE OR REPLACE FUNCTION public.preview_schedule_unpublication_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date, target_location_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  requested uuid;
  normalized_locations uuid[];
  location_payload jsonb;
  unsigned_payload jsonb;
  reviewed jsonb;
  assignments jsonb;
begin
  if cardinality(coalesce(target_location_ids, '{}'::uuid[])) = 0 then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => '{}'::uuid[]);
  end if;
  foreach requested in array target_location_ids loop
    perform app_private.authorize(actor_user_id, target_workspace_id, 'schedule.publish', target_locations => array[requested]);
  end loop;

  select array_agg(distinct location_id order by location_id) into normalized_locations
  from unnest(target_location_ids) location_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'location_id', publication.location_id, 'location_name', location.name,
    'publication_id', publication.id, 'version', publication.version_number,
    'shift_count', (select count(*) from public.schedule_published_shifts shift where shift.publication_id = publication.id)
  ) order by location.name, location.id), '[]'::jsonb)
  into location_payload
  from public.schedule_location_publications publication
  join public.locations location on location.id = publication.location_id
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_week_start
    and publication.location_id = any(normalized_locations)
    and publication.status = 'current';
  if jsonb_array_length(location_payload) <> cardinality(normalized_locations) then
    raise exception 'current schedule publication not found' using errcode = 'P0002';
  end if;
  unsigned_payload := jsonb_build_object(
    'workspace_id', target_workspace_id, 'week_start', target_week_start,
    'locations', location_payload
  );
  reviewed := unsigned_payload || jsonb_build_object(
    'status', case when target_week_start < public.schedule_current_week_start_service(target_workspace_id)
      then 'past_week_closed' else 'unpublish_ready' end,
    'fingerprint', encode(extensions.digest(convert_to(unsigned_payload::text, 'UTF8'), 'sha256'), 'hex')
  );

  -- The fingerprint also covers the published assignments, so a change to
  -- them after the preview makes the unpublish stale.
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
end;
$function$
;

CREATE OR REPLACE FUNCTION public.unpublish_schedule_service(actor_user_id uuid, target_workspace_id uuid, target_week_start date, target_location_ids uuid[], expected_fingerprint text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  preview jsonb;
  normalized_locations uuid[];
  publication_ids uuid[];
  effective_unpublished_at timestamptz := now();
begin
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,921));
  select array_agg(distinct location_id order by location_id) into normalized_locations
  from unnest(target_location_ids) location_id;
  perform 1 from public.schedule_location_publications publication
  where publication.workspace_id = target_workspace_id
    and publication.week_start = target_week_start
    and publication.location_id = any(normalized_locations)
    and publication.status = 'current' for update;
  -- The preview asks the core for every location.
  preview := public.preview_schedule_unpublication_service(
    actor_user_id, target_workspace_id, target_week_start, normalized_locations
  );
  if preview->>'status' = 'past_week_closed' then
    raise exception 'past schedule week is closed' using errcode = '42501';
  end if;
  if preview->>'fingerprint' <> expected_fingerprint then
    raise exception 'stale unpublication preview' using errcode = '40001';
  end if;
  select array_agg((item->>'publication_id')::uuid order by item->>'publication_id')
  into publication_ids from jsonb_array_elements(preview->'locations') item;

  update public.schedule_location_publications
  set status = 'unpublished', unpublished_by = actor_user_id,
    unpublished_at = effective_unpublished_at
  where id = any(publication_ids) and status = 'current';
  if not found then raise exception 'stale unpublication preview' using errcode = '40001'; end if;
  insert into public.schedule_publication_events (
    workspace_id, week_start, action, actor_user_id, location_ids,
    publication_ids, preflight_fingerprint, diff_summary
  ) values (
    target_workspace_id, target_week_start, 'unpublished', actor_user_id,
    normalized_locations, publication_ids, expected_fingerprint,
    jsonb_build_object('locations', preview->'locations')
  );
  return jsonb_build_object(
    'status', 'unpublished', 'workspace_id', target_workspace_id,
    'week_start', target_week_start, 'location_ids', to_jsonb(normalized_locations),
    'publication_ids', to_jsonb(publication_ids),
    'unpublished_at', effective_unpublished_at
  );
exception when serialization_failure then raise exception '%',SQLERRM using errcode='PT409';
end;
$function$
;

-- 10. Applying a template: one function (3 -> 1) -------------------------------------------
-- The department-scoped apply, with no department list meaning the whole
-- template (what the six-argument twin and its label layer did). Every
-- location the template's shifts use is in the person's reach, as before.
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

-- 11. Saving a draft as a template: one function (2 -> 1) ----------------------------------
-- Every location of the draft's shifts is one the person keeps templates for;
-- the labels are copied with the shifts.
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
 insert into public.schedule_template_shifts(workspace_id, template_id, location_id, employee_id, job_id, shift_type_id, day_offset, start_time, end_time, time_basis, time_snapshot, time_timezone, hide_time_on_badge, note, label_ids, label_names)
 select s.workspace_id, new_template.id, s.location_id, case when strip_assignments then null else s.employee_id end, s.job_id, s.shift_type_id, (s.scheduled_date-d.week_start), s.start_time, s.end_time, s.time_basis, s.time_snapshot, s.time_timezone, s.hide_time_on_badge, s.note,
   coalesce(s.label_ids, '{}'::uuid[]), coalesce(s.label_names, '{}'::text[])
 from public.schedule_draft_shifts s where s.draft_id=d.id;
 insert into public.schedule_template_events(workspace_id,template_id,template_name,action,actor_user_id,detail)
 values(target_workspace_id,new_template.id,new_template.name,'created',actor_user_id,jsonb_build_object('source_draft_id',d.id,'strip_assignments',strip_assignments));
 return public.get_schedule_template_service(actor_user_id,target_workspace_id,new_template.id);
exception when unique_violation then raise exception 'schedule template name conflict' using errcode='23505'; end;
$function$
;

