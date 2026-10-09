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
-- save_employee_service leaves an assignment at an archived location as it is.
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

-- A record with an assignment at an archived location still saves: that
-- assignment is left as it is (nf-guvenlik G8a Y1; also the owner's own
-- drawer, E1). "Remove from <location>" on an archived location stays refused
-- by the core, as on a deleted one.

CREATE OR REPLACE FUNCTION public.save_employee_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, employee_first_name text, employee_middle_name text, employee_last_name text, employee_preferred_name text, employee_invitation_email text, employee_start_date date, employee_internal_note text, location_ids uuid[], primary_location_id uuid, job_ids uuid[], primary_job_id uuid, employee_is_remote boolean, employee_is_excluded_from_schedule boolean, expected_revision integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  saved_id uuid := target_employee_id;
  reachable uuid[];
  kept uuid[];
  current_revision integer;
  next_code bigint;
  assignment_optional boolean := coalesce(employee_is_remote, false) or coalesce(employee_is_excluded_from_schedule, false);
begin
  -- A new record is asked where it will work (a manager only where they
  -- manage, never nowhere); an existing one, whose it is.
  if target_employee_id is null then
    perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.create',
      coalesce(location_ids, '{}'::uuid[]));
  else
    perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.save',
      target_person => target_employee_id);
  end if;

  -- An assignment at a location that is not live (archived) is left as it is,
  -- sent or not: that location counts nowhere, and the assignment is back when
  -- the archive is undone (G8a, KK-13). Only live locations are added, kept or
  -- taken away here; the primary mark still follows primary_location_id.
  kept := coalesce((
    select array_agg(existing.location_id)
    from public.employee_location_assignments existing
    join public.locations location on location.id = existing.location_id
    where existing.employee_id = target_employee_id and existing.ended_at is null
      and not app_private.location_is_live(location)
  ), '{}');

  if char_length(btrim(employee_first_name)) not between 1 and 80 or char_length(btrim(employee_last_name)) not between 1 and 80 then
    raise exception 'employee first and last name are required' using errcode = '22023';
  end if;
  -- Somebody not Remote nor excluded from Schedule needs a location, a primary
  -- location, a job and a primary job; any job can be the primary one, under
  -- Management too (EMP-001 S2). The owner's record needs none of it: the owner
  -- may work anywhere, and their Owner job is never primary.
  if not assignment_optional and not app_private.employee_record_is_workspace_owner(target_workspace_id, target_employee_id) then
    if cardinality(coalesce(location_ids, '{}'::uuid[]) || kept) = 0 or primary_location_id is null then
      raise exception 'employee requires a location and job unless remote or excluded from schedule'
        using errcode = '22023', hint = 'employee.location_required';
    end if;
    if cardinality(coalesce(job_ids, '{}'::uuid[])) = 0 then
      raise exception 'employee requires a location and job unless remote or excluded from schedule'
        using errcode = '22023', hint = 'employee.job_required';
    end if;
    if primary_job_id is null then
      raise exception 'employee requires a primary job unless remote or excluded from schedule'
        using errcode = '22023', hint = 'employee.primary_job_required';
    end if;
  end if;
  if primary_location_id is not null and not primary_location_id = any(coalesce(location_ids, '{}'::uuid[]) || kept) then
    raise exception 'primary location must be assigned' using errcode = '22023';
  end if;
  if primary_job_id is not null and not primary_job_id = any(coalesce(job_ids, '{}'::uuid[])) then
    raise exception 'primary job must be assigned' using errcode = '22023';
  end if;

  -- A location added or taken away is one the actor reaches; an unknown or
  -- archived one reads the same.
  reachable := app_private.scope_set(actor_user_id, target_workspace_id, 'employee.save');
  if exists (
      select 1 from unnest(coalesce(location_ids, '{}'::uuid[])) selected(location_id)
      left join public.locations location
        on location.id = selected.location_id and location.workspace_id = target_workspace_id and location.archived_at is null
      where not selected.location_id = any (kept)
        and (location.id is null
         or (not selected.location_id = any (reachable) and not exists (
           select 1 from public.employee_location_assignments existing
           where existing.employee_id = target_employee_id and existing.location_id = selected.location_id
             and existing.ended_at is null)))
    )
    or exists (
      select 1 from public.employee_location_assignments existing
      where existing.employee_id = target_employee_id and existing.ended_at is null
        and not existing.location_id = any (coalesce(location_ids, '{}'::uuid[]) || kept)
        and not existing.location_id = any (reachable)
    ) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'employee.save';
  end if;
  if exists (select 1 from unnest(coalesce(job_ids, '{}'::uuid[])) selected(job_id) left join public.jobs j on j.id = selected.job_id and j.workspace_id = target_workspace_id and j.archived_at is null where j.id is null) then
    raise exception 'invalid employee job' using errcode = '22023';
  end if;

  if saved_id is null then
    insert into public.workspace_employee_counters (workspace_id, next_value)
    values (target_workspace_id, 1)
    on conflict (workspace_id) do nothing;

    update public.workspace_employee_counters counter
    set next_value = greatest(
      counter.next_value,
      coalesce((
        select max(substring(employee.employee_code from 3)::bigint) + 1
        from public.employee_profiles employee
        where employee.workspace_id = target_workspace_id
          and employee.employee_code ~ '^E-[0-9]{4,}$'
      ), 1)
    ) + 1
    where counter.workspace_id = target_workspace_id
    returning counter.next_value - 1 into next_code;

    insert into public.employee_profiles (
      workspace_id, employee_code, first_name, middle_name, last_name, preferred_name,
      invitation_email, start_date, internal_note, is_remote,
      is_excluded_from_schedule, created_by
    )
    values (
      target_workspace_id, 'E-' || lpad(next_code::text, 4, '0'),
      btrim(employee_first_name), left(btrim(coalesce(employee_middle_name, '')), 80), btrim(employee_last_name),
      '',
      nullif(lower(btrim(employee_invitation_email)), ''),
      employee_start_date, btrim(coalesce(employee_internal_note, '')),
      coalesce(employee_is_remote, false),
      coalesce(employee_is_excluded_from_schedule, false),
      actor_user_id
    )
    returning id into saved_id;
    insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
    values (target_workspace_id, saved_id, actor_user_id, 'employee.created', 'Employee record created');
  else
    select revision into current_revision from public.employee_profiles
    where id = saved_id and workspace_id = target_workspace_id and archived_at is null
    for update;
    if current_revision is null then raise exception 'employee not found' using errcode = 'P0002'; end if;
    if expected_revision is null or expected_revision <> current_revision then raise exception 'employee revision conflict' using errcode = '40001'; end if;
    -- The preferred name is not the drawer's: it changes by request and answer.
    update public.employee_profiles set
      first_name = btrim(employee_first_name),
      middle_name = left(btrim(coalesce(employee_middle_name, '')), 80),
      last_name = btrim(employee_last_name),
      invitation_email = nullif(lower(btrim(employee_invitation_email)), ''),
      start_date = employee_start_date,
      internal_note = btrim(coalesce(employee_internal_note, '')),
      is_remote = coalesce(employee_is_remote, false),
      is_excluded_from_schedule = coalesce(employee_is_excluded_from_schedule, false),
      revision = revision + 1,
      updated_at = now()
    where id = saved_id;
    insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
    values (target_workspace_id, saved_id, actor_user_id, 'employee.updated', 'Employee profile and assignments updated');
  end if;

  -- Only what changed is written (BL-218): a kept assignment keeps its row, so
  -- the rules on the assignment tables (the owner stays at every location, the
  -- Owner job stays the owner's) judge a real removal, not every save. The
  -- primary flag is cleared before it is set, one row at a time for the index.
  update public.employee_location_assignments set ended_at = now(), is_primary = false
  where employee_id = saved_id and ended_at is null
    and not location_id = any(coalesce(location_ids, '{}'::uuid[]) || kept);
  update public.employee_location_assignments set is_primary = false
  where employee_id = saved_id and ended_at is null and is_primary
    and location_id is distinct from primary_location_id;
  insert into public.employee_location_assignments (workspace_id, employee_id, location_id, is_primary, created_by)
  select distinct target_workspace_id, saved_id, selected.location_id, false, actor_user_id
  from unnest(coalesce(location_ids, '{}'::uuid[])) selected(location_id)
  where not exists (select 1 from public.employee_location_assignments existing
    where existing.employee_id = saved_id and existing.location_id = selected.location_id and existing.ended_at is null);
  update public.employee_location_assignments set is_primary = true
  where employee_id = saved_id and ended_at is null and not is_primary and location_id = primary_location_id;

  update public.employee_job_assignments set ended_at = now(), is_primary = false
  where employee_id = saved_id and ended_at is null
    and not job_id = any(coalesce(job_ids, '{}'::uuid[]));
  update public.employee_job_assignments set is_primary = false
  where employee_id = saved_id and ended_at is null and is_primary
    and job_id is distinct from primary_job_id;
  insert into public.employee_job_assignments (workspace_id, employee_id, job_id, is_primary, created_by)
  select distinct target_workspace_id, saved_id, selected.job_id, false, actor_user_id
  from unnest(coalesce(job_ids, '{}'::uuid[])) selected(job_id)
  where not exists (select 1 from public.employee_job_assignments existing
    where existing.employee_id = saved_id and existing.job_id = selected.job_id and existing.ended_at is null);
  update public.employee_job_assignments set is_primary = true
  where employee_id = saved_id and ended_at is null and not is_primary and job_id = primary_job_id;

  -- K4: excluded from the Schedule needs no location, except a manager, who
  -- manages only where they are assigned.
  perform app_private.keep_manager_at_a_location(target_workspace_id, saved_id);
  return saved_id;
end;
$function$;

-- Settings > Locations still lists an archived location to whoever may change
-- locations, so it can be restored (ultrareview finding 2).

CREATE OR REPLACE FUNCTION public.list_settings_locations_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  listed uuid[] := app_private.scope_set(actor_user_id, target_workspace_id, 'settings.locations.read');
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.locations.read',
    target_locations => listed);
  -- An archived location counts nowhere (G8a), but whoever may change
  -- locations still finds it here, to restore it.
  if app_private.authz_reason(actor_user_id, target_workspace_id, 'settings.locations.write', null, null, null) is null then
    listed := listed || coalesce((
      select array_agg(location.id)
      from public.locations location
      where location.workspace_id = target_workspace_id and location.deleted_at is null
        and not app_private.location_is_live(location)
    ), '{}');
  end if;
  return app_private.settings_locations(target_workspace_id, listed);
end;
$function$;

-- A scheduled export rule is not given an archived location it was not asked
-- about (ultrareview finding 1).

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
    -- A location already on the rule and no longer live is not asked about;
    -- every location added is, so an archived one cannot be slipped in.
    target_locations => array(
      select distinct requested.id from unnest(next_location_ids) requested(id)
      where requested.id = any (public.live_location_ids(target_workspace_id, next_location_ids))
         or not requested.id = any (coalesce(existing.location_ids, '{}'::uuid[]))));

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
$function$;
