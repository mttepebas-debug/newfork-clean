-- Publish and time rules of the Schedule (EKRAN-01 DB-4).
--   BL-371  the draft menu says who published a location, never "Unknown".
--   BL-510  a finding nobody may override stops the publish even with a decision on it.
--   B-7     the Schedule's important dates are scoped and dated in the read model, not the API.
--   BL-174  a shift already published is still stopped by approved time off or unreadable hours.

-- BL-371 -------------------------------------------------------------------------
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
      -- Who published, never "Unknown" (BL-371).
      'published_by_name', case when publication.id is not null then coalesce((
        select nullif(profile.display_name, '') from public.user_profiles profile
        where profile.user_id = publication.published_by), 'Team member') end,
      'source_draft_id', publication.source_draft_id,
      'source_draft_name', source_draft.name
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
  left join public.schedule_drafts source_draft
    on source_draft.id = publication.source_draft_id
   and source_draft.workspace_id = target_workspace_id
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
$function$;

-- BL-510 -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.weekly_publication_decisions(preview jsonb, decisions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare result jsonb:='[]'; f jsonb; decision jsonb;
begin
 if jsonb_typeof(coalesce(decisions,'[]')) is distinct from 'array' then raise exception 'publication overrides must be an array' using errcode='22023'; end if;
 for f in select value from jsonb_array_elements(preview->'findings') where value->>'severity'='soft' loop
  -- A note (the availability list among them, M9) asks nothing and records nothing.
  if not coalesce((f->>'overrideable')::boolean,true) and f->>'tier'='note' then continue; end if;
  select d into decision from jsonb_array_elements(coalesce(decisions,'[]')) d where d->>'finding_id'=f->>'id' limit 1;
  if f->>'availability_state'='new' and f->>'warning_policy'='confirm' and decision is null then
   raise exception 'Confirm the current schedule conflicts before publishing' using errcode='22023'; end if;
  if f->>'availability_state' is null and coalesce(f->>'tier','blocker')<>'note' and decision is null then
   raise exception 'Review the current schedule conflicts before publishing' using errcode='22023'; end if;
  -- What nobody may override stops the publish, whatever was decided on it (BL-510).
  if not coalesce((f->>'overrideable')::boolean,true) then
   raise exception 'This schedule conflict cannot be overridden' using errcode='22023'; end if;
  result:=result||jsonb_build_array(jsonb_build_object('finding_id',f->>'id','reason',case
   when f->>'availability_state'='accepted' then 'Previously accepted schedule conflict retained.'
   when f->>'warning_policy'='warn' then 'Schedule warning acknowledged (warn policy).'
   else 'Schedule conflict confirmed by manager.' end));
 end loop;
 return result;
end; $function$;

-- BL-174 -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_schedule_assignment_availability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s jsonb:=to_jsonb(new); prior jsonb; a jsonb; evidence jsonb; logical_id uuid; hydrated boolean:=false; first_seen jsonb;
 -- Read once, empty as none: a pooled connection keeps a setting it once set
 -- locally as '' (BL-208).
 publish_scope jsonb:=nullif(current_setting('newfork.schedule_publish_scope',true),'')::jsonb;
 exchange_scope jsonb:=nullif(current_setting('newfork.shift_exchange_scope',true),'')::jsonb;
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
 if prior is not null and tg_table_name='schedule_published_shifts' then
  new.availability_snapshot:=coalesce(nullif(prior->'availability_snapshot','null'),jsonb_build_object(
   'status','legacy_published','original_published_shift_id',prior->>'id','original_publication_id',prior->>'publication_id',
   'message','This existing responsibility predates availability snapshots. Historical availability is not reconstructed.'));
 end if;
 -- A draft row of a published shift is where it gets fixed; it is never refused.
 if prior is not null and (tg_table_name<>'schedule_published_shifts' or new.employee_id is null) then return new; end if;
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

 if tg_table_name='schedule_published_shifts' and publish_scope is not null
  and (publish_scope->>'workspace_id')::uuid=new.workspace_id
  and exists(select 1 from public.schedule_location_publications p where p.id=(s->>'publication_id')::uuid
   and p.source_draft_id=(publish_scope->>'draft_id')::uuid) then
  s:=s||publish_scope;
 end if;
 if exchange_scope is not null
  and (exchange_scope->>'workspace_id')::uuid=new.workspace_id
  and exchange_scope->'shift_ids' ? logical_id::text then
  s:=s||jsonb_build_object('_exclude_shift_ids',exchange_scope->'shift_ids','_shift_exchange',true);
 end if;
 a:=public.assess_weekly_shift_availability(new.workspace_id,new.employee_id,s);
 -- Published before: the conflict accepted then stays accepted, as the publish
 -- preview says; what nobody can set aside still stops it (BL-174).
 if prior is not null then
  if a->>'operation' in ('blocked','verification_required') then
   raise exception 'Resolve shift hours or approved time off before this assignment' using errcode='23514',detail=a::text;
  end if;
  return new;
 end if;
 evidence:=public.schedule_availability_override(new.workspace_id,s,a);
 if tg_table_name='schedule_published_shifts' and evidence is null then
  select to_jsonb(o) into evidence from public.schedule_publication_overrides o where o.workspace_id=new.workspace_id
   and o.publication_id=new.publication_id and o.finding_code='schedule_conflict' and o.finding_id=a->>'fingerprint'
   and logical_id=any(o.source_shift_ids) and o.employee_id=new.employee_id and o.location_id=new.location_id
   and app_private.authz_reason(o.actor_user_id,new.workspace_id,'schedule.publish',array[new.location_id]) is null limit 1;
 end if;
 if a->>'operation'='blocked' or (tg_table_name='schedule_published_shifts' and a->>'operation'='verification_required') then
  raise exception 'Resolve shift hours or approved time off before this assignment' using errcode='23514',detail=a::text;
 end if;
 if a->>'operation'='warning_requires_override' and evidence is null then
  raise exception 'A current conflict acceptance is required' using errcode='23514',detail=a::text;
 end if;
 if tg_table_name='schedule_published_shifts' then
  -- What the shift's first publish with this person saw of their own marks
  -- (M11, D8): carried from the earliest earlier row, else this is the first.
  select x.availability_snapshot->'first' into first_seen from public.schedule_published_shifts x
   where x.workspace_id=new.workspace_id and x.employee_id=new.employee_id and coalesce(x.source_shift_id,x.id)=logical_id
    and x.id is distinct from new.id and x.availability_snapshot ? 'first'
   order by x.created_at, x.id limit 1;
  new.availability_snapshot:=jsonb_build_object('status','assessed','captured_at',now(),'assessment',a,'override',evidence,
   'first',coalesce(first_seen,jsonb_build_object('has_own_mark',coalesce((a->>'has_availability_conflict')::boolean,false),'captured_at',now())));
 elsif tg_op='UPDATE' then
  update public.schedule_availability_overrides set revoked_at=now() where workspace_id=new.workspace_id and shift_id=logical_id
   and revoked_at is null and assessment_fingerprint<>a->>'fingerprint';
 end if;
 return new;
end; $function$;

-- B-7 (BL-701) --------------------------------------------------------------------
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
    -- Names travel with the ghost, named as the grid names a real shift: the
    -- job and type, archived ones too (G8b, K8), null once deleted; the labels
    -- as the shift recorded them.
    left join public.jobs job
      on job.id = shift.job_id and job.workspace_id = target_workspace_id
     and job.deleted_at is null
    left join public.shift_types shift_type
      on shift_type.id = shift.shift_type_id and shift_type.workspace_id = target_workspace_id
     and shift_type.deleted_at is null
    where not exists (select 1 from allowed_locations allowed where allowed.id = shift.location_id)
  ), week_availability as materialized (
    select * from app_private.schedule_week_availability(
      target_workspace_id, resolved_week_start,
      (select coalesce(array_agg(employee.id), '{}') from visible_employees employee),
      (select coalesce(array_agg(location.id), '{}') from allowed_locations location))
  ), readable_notes as materialized (
    -- The note's words, by weekday from Sunday, for whoever the core lets read
    -- the note; nobody else gets them.
    -- Who last wrote it and when, named as the grid names a person (AVAIL-002).
    -- ponytail: a workspace-wide input-mode conversion also stamps the admin
    -- who changed the setting; keep the writer there if that ever misleads.
    select reminder.employee_id, to_jsonb(reminder.notes) as words,
      coalesce(nullif(author.preferred_name, ''), author.first_name) || ' ' || author.last_name as author,
      reminder.updated_at as edited_at
    from public.manager_weekly_reminders reminder
    left join public.employee_profiles author
      on author.workspace_id = reminder.workspace_id and author.user_id = reminder.updated_by
    where reminder.workspace_id = target_workspace_id and reminder.enabled
      and reminder.employee_id = any(array(select employee.id from visible_employees employee))
      and app_private.authz_reason(actor_user_id, target_workspace_id, 'availability.note_read',
        target_person => reminder.employee_id) is null
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
        'primary_job_id', app_private.stored_primary_job(employee.id),
        -- The note's words and hours only for whoever may read the note (M12).
        'weekly_availability', coalesce((select jsonb_agg((week.projection - 'note_intervals')
            || jsonb_build_object('manager_notes', note.words,
              'note_author', note.author, 'note_edited_at', note.edited_at,
              'note_intervals', case when note.employee_id is null then '[]'::jsonb else week.projection -> 'note_intervals' end)
            order by week.location_id)
          from week_availability week
          left join readable_notes note on note.employee_id = employee.id
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
        -- K18, M11: the employee's own mark came after the shift was first
        -- published; approved time off is no change of availability.
        'availability_changed_after_publish', mark.own_mark
          and not coalesce((shift.availability_snapshot -> 'first' ->> 'has_own_mark')::boolean, true),
        'warning_codes', to_jsonb(array_remove(array[
          case when exists (
            select 1 from public.schedule_closures closure
            where closure.workspace_id = target_workspace_id and closure.location_id = shift.location_id
              and closure.closed_date = shift.scheduled_date and closure.is_all_day
          ) then 'closed_location' end,
          -- Today's marks and approved leave: a mark made after publishing shows
          -- here too (BL-186).
          case when mark.unavailable then 'availability' end,
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
      cross join lateral (
        select shift.employee_id is not null and exists (select 1 from week_availability week
          where week.employee_id = shift.employee_id and week.location_id = shift.location_id
            and (week.unavailable + week.leave) && app_private.shift_time_range(shift.scheduled_date, shift.start_time, shift.end_time, shift.time_timezone)
        ) as unavailable,
        shift.employee_id is not null and exists (select 1 from week_availability week
          where week.employee_id = shift.employee_id and week.location_id = shift.location_id
            and week.unavailable && app_private.shift_time_range(shift.scheduled_date, shift.start_time, shift.end_time, shift.time_timezone)
        ) as own_mark
      ) mark
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
      where closure.workspace_id = target_workspace_id
        and closure.closed_date between resolved_week_start and resolved_week_start + 6
    ), '[]'::jsonb),
    -- Published dates that touch the week, one row per reachable location;
    -- a date for no location is everyone's (B-7). An annual date repeats from
    -- its first year to two years ahead, 29 Feb falling on 28 Feb.
    'important_dates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'location_id', place.id, 'title', d.title, 'type', d.type,
        'starts_on', d.starts_on, 'ends_on', d.ends_on, 'recurrence', d.recurrence
      ) order by d.starts_on, d.title, place.id)
      from public.important_dates d
      cross join lateral (
        select coalesce(nullif(d.location_ids, '{}'), array_remove(array[d.location_id], null)) ids
      ) named
      cross join lateral (
        select location.id from allowed_locations location where location.id = any (named.ids)
        union all select null::uuid where cardinality(named.ids) = 0
      ) place
      where d.workspace_id = target_workspace_id and d.archived_at is null
        and d.status = 'published' and d.affects_scheduling
        and case when d.recurrence = 'annual' then exists (
          select 1 from generate_series(resolved_week_start, resolved_week_start + 6, interval '1 day') day(at)
          cross join lateral (values (extract(year from day.at)::integer - 1), (extract(year from day.at)::integer)) y(year)
          cross join lateral (select y.year - extract(year from d.starts_on)::integer k) shift
          where shift.k >= 0
            and y.year <= greatest(extract(year from current_date)::integer + 2, extract(year from d.starts_on)::integer)
            and day.at::date between d.starts_on + make_interval(years => shift.k) and d.ends_on + make_interval(years => shift.k))
        else d.starts_on <= resolved_week_start + 6 and resolved_week_start <= d.ends_on end
    ), '[]'::jsonb)
  ) || app_private.schedule_departments_and_jobs(target_workspace_id)
    || app_private.schedule_referenced_catalog(target_workspace_id,
      array(select shift.job_id from current_shifts shift union select ghost.job_id from ghost_shifts ghost),
      array(select shift.shift_type_id from current_shifts shift
            union select ghost.shift_type_id from ghost_shifts ghost))
  into result;

  return result;
end;
$function$;
