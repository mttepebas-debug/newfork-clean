-- G8a / BL-132 (KK-13): an archived location counts in the authorization core
-- as a deleted one does, and comes back when the archive is undone.
--
-- One predicate says whether a location is live: app_private.location_is_live.
-- Live is "not archived": every delete stamps the archive too, and the catalog
-- guard (app_private.guard_catalog_deletion_state, "Deleted items must remain
-- archived") refuses a deleted row without it, so no second rule is added.
-- The core reads that predicate wherever it asks about a location:
--   scope_set                  the locations an action reaches
--   actor()                    owner/admin: every live location; works (and so
--                              a manager's manages): live assigned locations
--   authz_check                a target location; a target person's locations
--   actor_actions              the sample location that probes place actions
--   public.live_location_ids   which of a template's or export's locations count
-- The publish preview's own archived-location refusal goes: the core answers
-- it now, with the same 42501 authz.out_of_scope.
-- Functions that still filter archived locations inline are BL-423.

create function app_private.location_is_live(location public.locations)
returns boolean
language sql
immutable
set search_path to ''
as $$ select location.archived_at is null $$;
revoke all on function app_private.location_is_live(public.locations) from public;

CREATE OR REPLACE FUNCTION app_private.scope_set(actor uuid, w uuid, action text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  rule_row app_private.authz_actions;
  state app_private.actor_state;
begin
  select * into rule_row from app_private.authz_actions a where a.key = action;
  if not found then
    raise exception 'Unknown action %', action using errcode = '22023';
  end if;
  state := app_private.actor(actor, w);
  return coalesce((
    select array_agg(location.id order by location.id)
    from public.locations location
    where location.workspace_id = w
      and app_private.location_is_live(location)
      and app_private.authz_check(state, rule_row, array[location.id], null, null) is null
  ), '{}');
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.actor(actor uuid, w uuid)
 RETURNS app_private.actor_state
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  state app_private.actor_state;
  held_role uuid;
begin
  state.user_id := actor;
  state.workspace_id := w;
  state.works := '{}';
  state.manages := '{}';
  state.permissions := '{}';

  select membership.id, membership.status, role.access_class, role.id
    into state.membership_id, state.status, state.class, held_role
  from public.workspace_memberships membership
  join public.workspace_roles role
    on role.id = membership.role_id and role.workspace_id = membership.workspace_id
  where membership.workspace_id = w and membership.user_id = actor;
  if state.membership_id is null then
    return state;
  end if;

  state.workspace_open := app_private.workspace_open_to_actor(w, actor);
  state.document_blocked := coalesce(app_private.document_actor_blocked(actor, w), false);

  select profile.id into state.employee_id
  from public.employee_profiles profile
  where profile.workspace_id = w and profile.user_id = actor and profile.archived_at is null;

  state.works := coalesce((
    select array_agg(distinct assignment.location_id order by assignment.location_id)
    from public.employee_location_assignments assignment
    join public.locations location on location.id = assignment.location_id
    where assignment.workspace_id = w
      and assignment.employee_id = state.employee_id
      and assignment.ended_at is null
      and app_private.location_is_live(location)
  ), '{}');

  -- A manager manages where they are assigned, and nowhere else (EMP-001).
  state.manages := case
    when state.class in ('owner', 'admin') then coalesce((
      select array_agg(location.id order by location.id)
      from public.locations location
      where location.workspace_id = w and app_private.location_is_live(location)
    ), '{}')
    when state.class = 'manager' then state.works
    else '{}'::uuid[]
  end;

  state.permissions := coalesce((
    select array_agg(grant_row.permission_key order by grant_row.permission_key)
    from public.workspace_role_permissions grant_row
    join public.permissions permission on permission.key = grant_row.permission_key
    where grant_row.workspace_id = w
      and grant_row.role_id = held_role
      and (state.class <> 'employee' or permission.employee_eligible)
  ), '{}');

  return state;
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.authz_check(state app_private.actor_state, rule_row app_private.authz_actions, target_locations uuid[], target_person uuid, target_user uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_workspace uuid;
  person uuid := target_person;
  whose uuid;
  target_access public.workspace_role;
  target_is_self boolean;
  places uuid[];
  reach text;
begin
  if state.user_id is null then
    return 'not_member';
  end if;
  if rule_row.scope_class = 'account' then
    -- An account action is about one's own account.
    if target_user is not null and target_user is distinct from state.user_id then
      return 'out_of_scope';
    end if;
    return null;
  end if;
  if state.membership_id is null then
    return 'not_member';
  end if;
  if not state.workspace_open then
    return 'workspace_closed';
  end if;

  if person is not null then
    select profile.workspace_id, profile.user_id into target_workspace, whose
    from public.employee_profiles profile
    where profile.id = person;
    if target_workspace is distinct from state.workspace_id then
      return 'out_of_scope';
    end if;
  end if;
  if target_user is not null then
    if person is not null and whose is distinct from target_user then
      return 'out_of_scope';
    end if;
    whose := target_user;
    if person is null then
      select profile.id into person
      from public.employee_profiles profile
      where profile.workspace_id = state.workspace_id
        and profile.user_id = target_user
        and profile.archived_at is null;
      if person is null and not exists (
        select 1 from public.workspace_memberships membership
        where membership.workspace_id = state.workspace_id and membership.user_id = target_user
      ) then
        return 'out_of_scope';
      end if;
    end if;
  end if;
  target_is_self := coalesce(whose = state.user_id, false);

  -- Their own row is theirs to read in any state.
  if rule_row.self_ok and target_is_self then
    return null;
  end if;

  if state.status = 'pending_activation' then
    if not rule_row.restricted_ok then
      return 'not_active';
    end if;
  elsif state.status <> 'active' then
    return 'not_active';
  elsif state.document_blocked and not rule_row.restricted_ok then
    return 'document_blocked';
  end if;

  if rule_row.scope_class = 'own' then
    if (person is null and whose is null) or target_is_self then
      return null;
    end if;
    return 'out_of_scope';
  end if;

  if rule_row.owner_only and state.class <> 'owner' then
    return 'owner_only';
  end if;
  -- The owner holds every permission.
  if state.class <> 'owner'
     and rule_row.permission_key is not null
     and not rule_row.permission_key = any (state.permissions) then
    return 'missing_permission';
  end if;
  if state.class = 'employee' then
    return 'missing_permission';
  end if;

  if rule_row.no_self and target_is_self then
    return 'rank';
  end if;
  -- A manager's own record goes one level up; owners and admins keep theirs
  -- (user decision 2026-09-24, 2A).
  if rule_row.rank_below and target_is_self and state.class not in ('owner', 'admin') then
    return 'rank';
  end if;
  if rule_row.rank_below and (person is not null or whose is not null) and not target_is_self then
    select role.access_class into target_access
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    where membership.workspace_id = state.workspace_id and membership.user_id = whose;
    -- ponytail: somebody without a membership yet ranks as an employee; use the
    -- invitation's role if a manager ever invites into a higher one.
    if app_private.authz_rank(coalesce(target_access, 'employee')) >= app_private.authz_rank(state.class) then
      return 'rank';
    end if;
  end if;

  -- Some actions are about employees only: never a manager, an admin or the
  -- owner, whoever asks, themselves included (the Manager note, 2026-09-26).
  if rule_row.employee_target and (person is not null or whose is not null)
     and not app_private.ranks_as_employee(state.workspace_id, whose) then
    return 'rank';
  end if;

  if state.class in ('owner', 'admin') then
    reach := 'org';
  else
    select rule.manager_rule into reach
    from app_private.authz_scope_rules rule
    join app_private.authz_settings setting on setting.scope_model = rule.model
    where rule.scope_class = rule_row.scope_class and rule.effect = rule_row.effect;
    reach := coalesce(reach, 'none');
  end if;

  if rule_row.scope_class = 'org' then
    if reach = 'none' then
      return 'out_of_scope';
    end if;
    return null;
  end if;

  if target_locations is not null then
    places := target_locations;
    if array_position(places, null) is not null then
      return 'out_of_scope';
    end if;
    if rule_row.scope_class = 'place' and cardinality(places) <> 1 then
      return 'out_of_scope';
    end if;
    if exists (
      select 1 from unnest(places) place
      where not exists (
        select 1 from public.locations location
        where location.id = place and location.workspace_id = state.workspace_id and app_private.location_is_live(location)
      )
    ) then
      return 'out_of_scope';
    end if;
  elsif rule_row.scope_class = 'person' and (person is not null or whose is not null) then
    -- Where the person is assigned; somebody with no employee record works nowhere.
    places := coalesce((
      select array_agg(distinct assignment.location_id)
      from public.employee_location_assignments assignment
      join public.locations location on location.id = assignment.location_id
      where assignment.employee_id = person and assignment.ended_at is null
        and app_private.location_is_live(location)
    ), '{}');
  else
    return 'out_of_scope';
  end if;

  if reach = 'org' then
    return null;
  end if;
  if reach = 'none' or cardinality(places) = 0 then
    return 'out_of_scope';
  end if;
  if reach = 'any' and places && state.manages then
    return null;
  end if;
  if reach = 'all' and places <@ state.manages then
    return null;
  end if;
  return 'out_of_scope';
end;
$function$;

CREATE OR REPLACE FUNCTION app_private.actor_actions(state app_private.actor_state)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  some_location uuid;
begin
  select location.id into some_location
  from public.locations location
  where location.workspace_id = state.workspace_id and app_private.location_is_live(location)
  order by location.id
  limit 1;

  return coalesce((
    select array_agg(action.key order by action.key)
    from app_private.authz_actions action
    where case
      when action.scope_class in ('account', 'own', 'org') then
        app_private.authz_check(state, action, null, null, null) is null
      else
        app_private.authz_check(state, action, '{}'::uuid[], null, null) is null
        or (cardinality(state.manages) > 0
            and app_private.authz_check(state, action, state.manages[1:1], null, null) is null)
        or (some_location is not null
            and app_private.authz_check(state, action, array[some_location], null, null) is null)
    end
  ), '{}');
end;
$function$;

CREATE OR REPLACE FUNCTION public.live_location_ids(w uuid, ids uuid[])
 RETURNS uuid[]
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select array(select distinct x from unnest(ids) x
  where not exists (select 1 from public.locations l where l.id = x and l.workspace_id = w and not app_private.location_is_live(l))
  order by 1);
$function$;

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
$function$;
