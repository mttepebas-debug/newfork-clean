-- EMP-001 B1 (user decisions 2026-09-30: item 6, S1, K4). "Manages without
-- working there" leaves the database and the authorization core whole.
--
-- A manager's reach is the locations they are assigned to, and nothing else.
-- To manage a location without taking shifts there, they are assigned to it
-- and excluded from the Schedule ("Exclude from schedule", per person).
--
-- 1. The core: actor().manages for a manager is where they work again, and a
--    person is reached where they are assigned (authz_check). scope_set is
--    untouched; it reads actor().
-- 2. The four older location helpers lose their "or manages it" branch.
-- 3. The Employees reads stop naming managed locations: the detail loses the
--    key and allowed's answer about setting them, the list loses the column
--    (dropped and made again: its columns change). The role service no longer
--    writes which managed locations went with a role.
-- 4. K4: a manager keeps a location, excluded from the Schedule or not: with
--    none they would manage nothing. One helper says so on every way there:
--    saving the record, "Remove from <location>" on their last one, making
--    somebody with no location a manager, inviting one as a manager. 22023,
--    hint employee.manager_location_required. An excluded employee and a
--    Remote person, manager or not, need none, as before.
-- 5. What goes: the command, the helper the drawer and the command shared, the
--    core action (74 -> 73), the role trigger and its function, the table, and
--    the key on workspace_memberships only the table's foreign key used. No
--    data is kept (CLAUDE.md §9). Listed in retired_objects_stay_gone.
--
-- Left for G8a (BL-132): archived locations in actor() and authz_check.

-- 1. The core ---------------------------------------------------------------------------

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
    where assignment.workspace_id = w
      and assignment.employee_id = state.employee_id
      and assignment.ended_at is null
  ), '{}');

  -- A manager manages where they are assigned, and nowhere else (EMP-001).
  state.manages := case
    when state.class in ('owner', 'admin') then coalesce((
      select array_agg(location.id order by location.id)
      from public.locations location
      where location.workspace_id = w and location.deleted_at is null
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
        where location.id = place and location.workspace_id = state.workspace_id and location.deleted_at is null
      )
    ) then
      return 'out_of_scope';
    end if;
  elsif rule_row.scope_class = 'person' and (person is not null or whose is not null) then
    -- Where the person is assigned; somebody with no employee record works nowhere.
    places := coalesce((
      select array_agg(distinct assignment.location_id)
      from public.employee_location_assignments assignment
      where assignment.employee_id = person and assignment.ended_at is null
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

-- 2. The older location helpers ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.schedule_actor_can_manage_service(actor_user_id uuid, target_workspace_id uuid, target_location_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    join public.workspace_role_permissions permission
      on permission.role_id = role.id and permission.workspace_id = role.workspace_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
      and role.access_class in ('owner', 'admin', 'manager')
      and permission.permission_key = 'schedule.manage'
      and (
        target_location_id is null
        or (membership.all_locations and exists (
          select 1 from public.locations location
          where location.id = target_location_id and location.workspace_id = target_workspace_id))
        or exists (
          select 1 from public.membership_location_scopes scope
          where scope.membership_id = membership.id
            and scope.workspace_id = target_workspace_id
            and scope.location_id = target_location_id
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.schedule_actor_can_publish_service(actor_user_id uuid, target_workspace_id uuid, target_location_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    join public.workspace_role_permissions permission
      on permission.role_id = role.id and permission.workspace_id = role.workspace_id
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
      and role.access_class in ('owner', 'admin', 'manager')
      and permission.permission_key = 'schedule.publish'
      and (
        target_location_id is null
        or (membership.all_locations and exists (
          select 1 from public.locations location
          where location.id = target_location_id and location.workspace_id = target_workspace_id))
        or exists (
          select 1 from public.membership_location_scopes scope
          where scope.membership_id = membership.id
            and scope.workspace_id = target_workspace_id
            and scope.location_id = target_location_id
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.schedule_actor_has_capability_service(actor_user_id uuid, target_workspace_id uuid, capability text, target_location_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.workspace_memberships m join public.workspace_roles r on r.id=m.role_id and r.workspace_id=m.workspace_id
 join public.workspace_role_permissions p on p.role_id=r.id and p.workspace_id=r.workspace_id
 where m.workspace_id=target_workspace_id and m.user_id=actor_user_id and m.status='active' and r.access_class in ('owner','admin','manager')
 and p.permission_key=capability and (target_location_id is null
   or (m.all_locations and exists(select 1 from public.locations l where l.id=target_location_id and l.workspace_id=target_workspace_id))
   or exists(select 1 from public.membership_location_scopes s where s.membership_id=m.id and s.workspace_id=target_workspace_id and s.location_id=target_location_id)));
$function$;

CREATE OR REPLACE FUNCTION public.communication_actor_has_capability_service(actor_user_id uuid, target_workspace_id uuid, capability text, target_location_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(
  select 1 from public.workspace_memberships membership
  join public.workspace_roles role on role.id=membership.role_id and role.workspace_id=membership.workspace_id
  join public.workspace_role_permissions permission on permission.role_id=role.id and permission.workspace_id=role.workspace_id
  where membership.workspace_id=target_workspace_id and membership.user_id=actor_user_id and membership.status='active'
   and permission.permission_key=capability
   and (target_location_id is null
    or (membership.all_locations and exists(select 1 from public.locations location where location.id=target_location_id and location.workspace_id=target_workspace_id))
    or exists(select 1 from public.membership_location_scopes scope where scope.membership_id=membership.id and scope.workspace_id=target_workspace_id and scope.location_id=target_location_id))
 );
$function$;

-- 4. K4: a manager keeps a location -------------------------------------------------------
--
-- Every manager who is not Remote, excluded from the Schedule or not.
-- Called after the write, so it reads what the record would be. becoming: the
-- role somebody is being invited into, when they have no membership yet.
-- The class comes from the core's actor(), not from a copy of the role tables.

create function app_private.keep_manager_at_a_location(
  w uuid,
  target_employee uuid,
  becoming public.workspace_role default null
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  record public.employee_profiles%rowtype;
  holder app_private.actor_state;
begin
  select * into record
  from public.employee_profiles employee
  where employee.id = target_employee and employee.workspace_id = w;
  if record.id is null or record.archived_at is not null or record.is_remote then
    return;
  end if;

  if becoming is null then
    if record.user_id is null then
      return;
    end if;
    holder := app_private.actor(record.user_id, w);
    if holder.class is distinct from 'manager' or holder.status not in ('active', 'pending_activation') then
      return;
    end if;
  elsif becoming <> 'manager' then
    return;
  end if;

  if not exists (
    select 1 from public.employee_location_assignments assignment
    where assignment.employee_id = record.id and assignment.ended_at is null
  ) then
    raise exception 'a manager needs a location to manage'
      using errcode = '22023', hint = 'employee.manager_location_required';
  end if;
end;
$$;
revoke all on function app_private.keep_manager_at_a_location(uuid, uuid, public.workspace_role)
  from public, anon, authenticated;

-- 3. The Employees reads and the role service ------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_employee_detail_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me app_private.actor_state;
  reads_private boolean;
  reads_access boolean;
  removal app_private.authz_actions;
  answer jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.read', target_person => target_employee_id);
  me := app_private.actor(actor_user_id, target_workspace_id);
  -- The owner holds every permission.
  reads_private := me.class = 'owner' or 'employees.private.read' = any (me.permissions);
  reads_access := me.class = 'owner' or 'employee_access.read' = any (me.permissions);
  select * into removal from app_private.authz_actions action where action.key = 'employee.remove_from_location';
  if not found then
    raise exception 'core action employee.remove_from_location is missing' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'id', employee.id,
    'workspace_id', employee.workspace_id,
    'employee_code', employee.employee_code,
    'first_name', employee.first_name,
    'last_name', employee.last_name,
    'preferred_name', employee.preferred_name,
    'display_name', concat_ws(' ', employee.first_name, employee.last_name),
    'invitation_email', employee.invitation_email,
    'account_email', account_user.email,
    'start_date', employee.start_date,
    'primary_location_id', primary_location.location_id,
    'primary_location_name', location.name,
    'location_count', (
      select count(*)
      from public.employee_location_assignments assignment
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ),
    'primary_job_id', primary_job.job_id,
    'primary_job_name', job.name,
    'job_count', (
      select count(*)
      from public.employee_job_assignments assignment
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ),
    'role_id', role.id,
    'role_name', role.name,
    'display_status', case
      when employee.archived_at is not null then 'archived'
      when membership.status = 'active' then 'active'
      when membership.status = 'pending_activation' then 'onboarding'
      when invitation.status = 'pending' and invitation.expires_at > now() then 'invited'
      else 'not_invited'
    end,
    'archived_at', employee.archived_at,
    'revision', employee.revision,
    'user_id', employee.user_id,
    'internal_note', employee.internal_note,
    'is_remote', employee.is_remote,
    'is_excluded_from_schedule', employee.is_excluded_from_schedule,
    -- null only when the reader may not read it. Somebody with nothing on file
    -- yet reads as an empty profile: no names, nothing given, the defaults the
    -- shared employeeDetailSchema needs (7b QA finding 1, shape agreed with
    -- nf-backend).
    'private_contact', case
      when not reads_private then null
      else jsonb_strip_nulls(jsonb_build_object(
        'legal_first_name', private_profile.legal_first_name,
        'legal_last_name', private_profile.legal_last_name,
        'preferred_name', private_profile.preferred_name
      )) || jsonb_build_object(
        'phone', private_profile.phone,
        'street_address', private_profile.street_address,
        'city', private_profile.city,
        'region', private_profile.region,
        'postal_code', private_profile.postal_code,
        'country_code', private_profile.country_code,
        'date_of_birth', private_profile.date_of_birth,
        'emergency_contact_name', private_profile.emergency_contact_name,
        'emergency_contact_relationship', private_profile.emergency_contact_relationship,
        'emergency_contact_phone', private_profile.emergency_contact_phone,
        'emergency_contact_email', coalesce(private_profile.emergency_contact_email, ''),
        'share_phone_with_teammates', coalesce(private_profile.share_phone_with_teammates, false),
        'share_email_with_teammates', coalesce(private_profile.share_email_with_teammates, false)
      )
    end,
    'locations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', assignment.location_id,
          'name', assigned_location.name,
          'primary', assignment.is_primary,
          'archived', assigned_location.archived_at is not null,
          -- May the reader take them off this location.
          'removable', app_private.authz_check(me, removal, array[assignment.location_id], employee.id, null) is null
        )
        order by assignment.is_primary desc, assigned_location.name
      )
      from public.employee_location_assignments assignment
      join public.locations assigned_location on assigned_location.id = assignment.location_id
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', assignment.job_id,
          'name', assigned_job.name,
          'primary', assignment.is_primary,
          'archived', assigned_job.archived_at is not null
        )
        order by assignment.is_primary desc, assigned_job.name
      )
      from public.employee_job_assignments assignment
      join public.jobs assigned_job on assigned_job.id = assignment.job_id
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ), '[]'::jsonb),
    'invitation', case
      when invitation.id is null or not reads_access then null
      else jsonb_build_object(
        'id', invitation.id,
        'email', invitation.email,
        'role_id', invitation.role_id,
        'status', invitation.status,
        'expires_at', invitation.expires_at,
        'sent_at', invitation.sent_at,
        'delivery_status', invitation.delivery_status,
        'delivery_attempted_at', invitation.delivery_attempted_at,
        'delivery_failed_at', invitation.delivery_failed_at,
        'delivery_error', invitation.delivery_error,
        'role_name', invitation_role.name,
        'invited_by_name', coalesce(
          nullif(btrim(inviter_profile.display_name), ''),
          inviter_user.email
        )
      )
    end,
    'onboarding', jsonb_build_object(
      'status', case
        when membership.status = 'pending_activation' then 'in_progress'
        when invitation.status = 'pending' then 'invited'
        else 'not_requested'
      end,
      'required_documents', (
        select count(*)
        from public.document_types document_type
        where document_type.workspace_id = employee.workspace_id
          and document_type.required_at_onboarding
          and document_type.archived_at is null
      ),
      'completed_documents', 0
    ),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', event.id,
          'action', event.action,
          'occurred_at', event.occurred_at,
          'actor_user_id', event.actor_user_id,
          'summary', event.summary
        )
        order by event.occurred_at desc
      )
      from (
        select *
        from public.employee_events
        where employee_id = employee.id
        order by occurred_at desc
        limit 50
      ) event
    ), '[]'::jsonb),
    -- What the reader may do to this record, by the same rules the actions ask.
    'allowed', (
      select jsonb_object_agg(replace(replace(action.key, 'employee.', ''), '.', '_'),
        app_private.authz_check(me, action, null, employee.id, null) is null
        -- Only a live record with no account on it is invitable, as
        -- prepare_employee_invitation_service says (7b QA finding 2).
        and (action.key <> 'employee.invite'
          or (employee.user_id is null and employee.archived_at is null)))
      from app_private.authz_actions action
      where action.key in ('employee.save', 'employee.terminate', 'employee.archive',
        'employee.remove_access', 'employee.change_role', 'employee.make_admin',
        'employee.invite', 'onboarding.review')
    )
  ) into answer
  from public.employee_profiles employee
  left join public.employee_private_profiles private_profile
    on private_profile.employee_id = employee.id
  left join auth.users account_user
    on account_user.id = employee.user_id
  left join public.employee_location_assignments primary_location
    on primary_location.employee_id = employee.id
    and primary_location.ended_at is null
    and primary_location.is_primary
  left join public.locations location on location.id = primary_location.location_id
  left join public.employee_job_assignments primary_job
    on primary_job.employee_id = employee.id
    and primary_job.ended_at is null
    and primary_job.is_primary
  left join public.jobs job on job.id = primary_job.job_id
  left join public.workspace_memberships membership
    on membership.workspace_id = employee.workspace_id
    and membership.user_id = employee.user_id
  left join public.workspace_roles role on role.id = membership.role_id
  left join lateral (
    select *
    from public.employee_invitations candidate
    where candidate.employee_id = employee.id
    order by candidate.created_at desc
    limit 1
  ) invitation on true
  left join public.workspace_roles invitation_role
    on invitation_role.id = invitation.role_id
  left join public.user_profiles inviter_profile
    on inviter_profile.user_id = invitation.created_by
  left join auth.users inviter_user
    on inviter_user.id = invitation.created_by
  where employee.id = target_employee_id
    and employee.workspace_id = target_workspace_id;

  return answer;
end;
$function$;

drop function public.list_employees_service(uuid, uuid, boolean, text, text, integer, integer);

CREATE FUNCTION public.list_employees_service(actor_user_id uuid, target_workspace_id uuid, include_archived boolean DEFAULT false, search_text text DEFAULT ''::text, status_filter text DEFAULT 'all'::text, page_limit integer DEFAULT 100, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, workspace_id uuid, employee_code text, first_name text, last_name text, preferred_name text, display_name text, invitation_email text, start_date date, primary_location_id uuid, primary_location_name text, location_count bigint, primary_job_id uuid, primary_job_name text, job_count bigint, role_name text, display_status text, archived_at timestamp with time zone, revision integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  rule_row app_private.authz_actions;
  reason text;
begin
  select * into rule_row from app_private.authz_actions action where action.key = 'employee.list';
  if not found then
    raise exception 'core action employee.list is missing' using errcode = '22023';
  end if;
  -- May they list anybody at all; who, is answered row by row.
  reason := app_private.authz_check(me, rule_row, null, null, null);
  if reason is not null and reason <> 'out_of_scope' then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || reason, detail = 'employee.list';
  end if;

  return query
  with directory as (
    select employee.id, employee.workspace_id, employee.employee_code,
      employee.first_name, employee.last_name, employee.preferred_name,
      concat_ws(' ', coalesce(nullif(employee.preferred_name, ''), employee.first_name), employee.last_name) as display_name,
      employee.invitation_email, employee.start_date,
      primary_location.location_id as primary_location_id,
      location.name as primary_location_name,
      (select count(*) from public.employee_location_assignments a where a.employee_id = employee.id and a.ended_at is null) as location_count,
      primary_job.job_id as primary_job_id, listed_job.name as primary_job_name,
      (select count(*) from public.employee_job_assignments a where a.employee_id = employee.id and a.ended_at is null) as job_count,
      role.name as role_name,
      case
        when employee.archived_at is not null then 'archived'
        when membership.status = 'active' then 'active'
        when onboarding.status in ('submitted', 'changes_requested') then 'needs_attention'
        when membership.status = 'pending_activation' then 'onboarding'
        when invitation.status = 'pending' and invitation.expires_at > now() then 'invited'
        else 'not_invited'
      end as display_status,
      employee.archived_at, employee.revision
    from public.employee_profiles employee
    left join public.employee_location_assignments primary_location on primary_location.employee_id = employee.id and primary_location.ended_at is null and primary_location.is_primary
    left join public.locations location on location.id = primary_location.location_id
    left join public.employee_job_assignments primary_job on primary_job.employee_id = employee.id and primary_job.ended_at is null and primary_job.is_primary
    -- The job the list names: the stored primary; failing that the first
    -- Management job in the catalog's order, then the first job.
    left join lateral (
      select job.name
      from public.employee_job_assignments assignment
      join public.jobs job on job.id = assignment.job_id
      left join public.departments department on department.id = job.department_id
      where assignment.employee_id = employee.id and assignment.ended_at is null
        and (assignment.is_primary or job.archived_at is null)
      order by assignment.is_primary desc, coalesce(department.system_key = 'management', false) desc,
        job.sort_order, job.name, job.id
      limit 1
    ) listed_job on true
    left join public.workspace_memberships membership on membership.workspace_id = employee.workspace_id and membership.user_id = employee.user_id
    left join public.workspace_roles role on role.id = membership.role_id
    left join public.employee_onboarding_cases onboarding on onboarding.employee_id = employee.id
    left join lateral (
      select candidate.status, candidate.expires_at
      from public.employee_invitations candidate
      where candidate.employee_id = employee.id
      order by candidate.created_at desc limit 1
    ) invitation on true
    where employee.workspace_id = target_workspace_id
      and (include_archived = (employee.archived_at is not null))
      and app_private.authz_check(me, rule_row, null, employee.id, null) is null
  )
  select * from directory
  where (
      btrim(search_text) = ''
      or concat_ws(
        ' ',
        directory.first_name,
        directory.last_name,
        directory.preferred_name,
        directory.employee_code,
        directory.invitation_email,
        directory.primary_location_name,
        directory.primary_job_name
      ) ilike '%' || btrim(search_text) || '%'
    )
    and (status_filter = 'all' or directory.display_status = status_filter)
  order by lower(directory.display_name), directory.id
  limit least(greatest(page_limit, 1), 200)
  offset greatest(page_offset, 0);
end;
$function$;
revoke all on function public.list_employees_service(uuid, uuid, boolean, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.list_employees_service(uuid, uuid, boolean, text, text, integer, integer) to service_role;

CREATE OR REPLACE FUNCTION public.update_employee_membership_role_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, target_role_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_employee public.employee_profiles%rowtype;
  target_membership public.workspace_memberships%rowtype;
  existing_role public.workspace_roles%rowtype;
  next_role public.workspace_roles%rowtype;
begin
  perform app_private.authorize_role_grant(actor_user_id, target_workspace_id, target_role_id,
    target_person => target_employee_id);
  select role.* into next_role
  from public.workspace_roles role
  where role.id = target_role_id and role.workspace_id = target_workspace_id;

  select employee.* into target_employee
  from public.employee_profiles employee
  where employee.id = target_employee_id
    and employee.workspace_id = target_workspace_id
    and employee.archived_at is null
  for update;
  if target_employee.id is null then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;
  if target_employee.user_id is null then
    raise exception 'employee has no linked workspace account' using errcode = '22023';
  end if;

  select membership.* into target_membership
  from public.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = target_employee.user_id
    and membership.status = 'active'
  for update;
  if target_membership.id is null then
    raise exception 'active workspace membership not found' using errcode = 'P0002';
  end if;

  select role.* into existing_role
  from public.workspace_roles role
  where role.id = target_membership.role_id and role.workspace_id = target_workspace_id;

  perform set_config('app.membership_change', target_membership.id::text, true);
  update public.workspace_memberships
  set role_id = next_role.id, updated_at = now()
  where id = target_membership.id and workspace_id = target_workspace_id;

  -- K4: nobody without a location becomes a manager, unless Remote.
  perform app_private.keep_manager_at_a_location(target_workspace_id, target_employee.id);

  update public.employee_profiles
  set revision = revision + 1, updated_at = now()
  where id = target_employee.id and workspace_id = target_workspace_id;

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (target_workspace_id, target_employee.id, actor_user_id, 'employee.role_changed', 'Workspace access role changed');

  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    target_workspace_id,
    actor_user_id,
    'membership.role_changed',
    'workspace_membership',
    target_membership.id::text,
    jsonb_build_object(
      'employee_id', target_employee.id,
      'from_role_id', existing_role.id,
      'from_access_class', existing_role.access_class,
      'to_role_id', next_role.id,
      'to_access_class', next_role.access_class
    )
  );

  return jsonb_build_object(
    'membership_id', target_membership.id,
    'role_id', next_role.id,
    'role_name', next_role.name,
    'access_class', next_role.access_class
  );
end;
$function$;

-- 4 (cont.). The ways to a manager with no location ---------------------------------------------

CREATE OR REPLACE FUNCTION public.save_employee_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, employee_first_name text, employee_middle_name text, employee_last_name text, employee_preferred_name text, employee_invitation_email text, employee_start_date date, employee_internal_note text, location_ids uuid[], primary_location_id uuid, job_ids uuid[], primary_job_id uuid, employee_is_remote boolean, employee_is_excluded_from_schedule boolean, expected_revision integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  saved_id uuid := target_employee_id;
  reachable uuid[];
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

  if char_length(btrim(employee_first_name)) not between 1 and 80 or char_length(btrim(employee_last_name)) not between 1 and 80 then
    raise exception 'employee first and last name are required' using errcode = '22023';
  end if;
  -- Somebody not Remote nor excluded from Schedule needs a location, a primary
  -- location and a job, and a primary job only when a job sits outside
  -- Management: a Management job is primary by its department (BL-218 .3b).
  -- The owner's record needs none of it: the owner may work anywhere.
  if not assignment_optional and not app_private.employee_record_is_workspace_owner(target_workspace_id, target_employee_id) then
    if cardinality(coalesce(location_ids, '{}'::uuid[])) = 0 or primary_location_id is null then
      raise exception 'employee requires a location and job unless remote or excluded from schedule'
        using errcode = '22023', hint = 'employee.location_required';
    end if;
    if cardinality(coalesce(job_ids, '{}'::uuid[])) = 0 then
      raise exception 'employee requires a location and job unless remote or excluded from schedule'
        using errcode = '22023', hint = 'employee.job_required';
    end if;
    -- Only this workspace's Management counts: another workspace's job reads as
    -- unknown here, so the answer says nothing about it.
    if primary_job_id is null and exists (
      select 1 from unnest(job_ids) selected(job_id)
      where not exists (
        select 1 from public.jobs job
        join public.departments department on department.id = job.department_id
        where job.id = selected.job_id and job.workspace_id = target_workspace_id
          and department.system_key = 'management'
      )
    ) then
      raise exception 'employee requires a primary job outside Management'
        using errcode = '22023', hint = 'employee.primary_job_required';
    end if;
  end if;
  if primary_location_id is not null and not primary_location_id = any(coalesce(location_ids, '{}'::uuid[])) then
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
      where location.id is null
         or (not selected.location_id = any (reachable) and not exists (
           select 1 from public.employee_location_assignments existing
           where existing.employee_id = target_employee_id and existing.location_id = selected.location_id
             and existing.ended_at is null))
    )
    or exists (
      select 1 from public.employee_location_assignments existing
      where existing.employee_id = target_employee_id and existing.ended_at is null
        and not existing.location_id = any (coalesce(location_ids, '{}'::uuid[]))
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
    and not location_id = any(coalesce(location_ids, '{}'::uuid[]));
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

CREATE OR REPLACE FUNCTION public.remove_employee_from_location_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, target_location_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  assignment public.employee_location_assignments%rowtype;
  employee public.employee_profiles%rowtype;
  released uuid[];
  locations_left integer;
  told uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.remove_from_location',
    array[target_location_id], target_employee_id);

  select * into assignment
  from public.employee_location_assignments candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.employee_id = target_employee_id
    and candidate.location_id = target_location_id
    and candidate.ended_at is null
  for update;
  -- Not working there is answered as a target out of reach: the refusal does
  -- not tell what the record holds.
  if assignment.id is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope',
      detail = 'employee.remove_from_location';
  end if;

  select * into employee from public.employee_profiles where id = target_employee_id for update;

  update public.employee_location_assignments set ended_at = now(), is_primary = false
  where id = assignment.id;
  -- Another location they still work at becomes the primary one.
  if assignment.is_primary then
    update public.employee_location_assignments set is_primary = true
    where id = (
      select other.id from public.employee_location_assignments other
      where other.employee_id = target_employee_id and other.ended_at is null
      order by other.assigned_at, other.id
      limit 1
    );
  end if;

  -- K4: a manager's last location is not taken; the record of anybody else
  -- stays, with no location if this was the only one.
  perform app_private.keep_manager_at_a_location(target_workspace_id, target_employee_id);

  -- Their published shifts there from now on are left open, as when
  -- employment ends; their shifts elsewhere stay.
  with open_up as (
    update public.schedule_published_shifts shift
    set employee_id = null
    from public.schedule_location_publications publication, public.locations location
    where publication.id = shift.publication_id
      and publication.workspace_id = shift.workspace_id
      and publication.location_id = shift.location_id
      and publication.status = 'current'
      and location.id = shift.location_id
      and location.workspace_id = shift.workspace_id
      and shift.workspace_id = target_workspace_id
      and shift.employee_id = target_employee_id
      and shift.location_id = target_location_id
      and (shift.scheduled_date + shift.start_time) at time zone location.timezone >= now()
    returning shift.id
  )
  select coalesce(array_agg(id), '{}') into released from open_up;

  update public.employee_profiles
  set revision = revision + 1, updated_at = now()
  where id = target_employee_id;

  select count(*) into locations_left
  from public.employee_location_assignments other
  where other.employee_id = target_employee_id and other.ended_at is null;

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary, occurred_at)
  values (target_workspace_id, target_employee_id, actor_user_id, 'employee.location_removed',
    format('Removed from a location; %s published shift(s) left open', cardinality(released)), now());

  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_workspace_id, actor_user_id, 'employee.location_removed', 'employee', target_employee_id::text,
    jsonb_build_object('location_id', target_location_id, 'released_shift_ids', to_jsonb(released),
      'locations_left', locations_left));

  -- No location left: whoever may end their employment or give them another
  -- location decides (the owner and admins; S1). The record stays.
  if locations_left = 0 then
    select coalesce(array_agg(member.user_id order by member.user_id), '{}') into told
    from public.workspace_memberships member
    where member.workspace_id = target_workspace_id
      and member.status = 'active'
      and member.user_id is distinct from actor_user_id
      and app_private.authz_reason(member.user_id, target_workspace_id, 'employee.terminate', null, target_employee_id) is null;
    if cardinality(told) > 0 then
      perform public.enqueue_notification_outbox_service(
        target_workspace_id,
        gen_random_uuid(),
        'people.employee.no_location',
        1,
        actor_user_id,
        'employee',
        target_employee_id::text,
        jsonb_build_object(
          'employee_id', target_employee_id,
          'recipient_user_ids', to_jsonb(told),
          'audience_contract', 'workspace_employee_access_managers',
          'category', 'people',
          'title', 'No location left',
          'body', left(concat_ws(' ', employee.first_name, employee.last_name)
            || ' has no location left. End their employment or give them a new location.', 2000),
          'safe_preview', 'Somebody on your team has no location left.',
          'action_url', '/app/employees?employeeId=' || target_employee_id::text,
          'group_key', 'employee:' || target_employee_id::text
        ),
        now()
      );
    end if;
  end if;

  return jsonb_build_object(
    'employee_id', target_employee_id,
    'location_id', target_location_id,
    'released_shift_count', cardinality(released),
    'locations_left', locations_left
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_employee_invitation_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, employee_email text, target_role_id uuid, invitation_token_hash text, invitation_expires_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  invitation_id uuid;
  invite_role public.workspace_roles%rowtype;
  assigned_location_ids uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.invite', target_person => target_employee_id);
  if employee_email <> lower(btrim(employee_email)) or employee_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'valid normalized invitation email required' using errcode = '22023';
  end if;
  if invitation_token_hash !~ '^[0-9a-f]{64}$' or invitation_expires_at <= now() then
    raise exception 'valid invitation token and expiry required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.employee_profiles employee
    where employee.id = target_employee_id
      and employee.workspace_id = target_workspace_id
      and employee.archived_at is null
      and employee.user_id is null
  ) then
    raise exception 'invitable employee not found' using errcode = 'P0002';
  end if;

  if target_role_id is null then
    select * into invite_role from public.workspace_roles
    where workspace_id = target_workspace_id and system_key = 'employee';
  else
    select * into invite_role from public.workspace_roles
    where workspace_id = target_workspace_id and id = target_role_id;
  end if;
  if invite_role.id is null then
    raise exception 'invitation role is unavailable' using errcode = '22023';
  end if;
  if not app_private.can_invite_with_role(actor_user_id, target_workspace_id, invite_role.id) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.rank', detail = 'employee.invite';
  end if;

  -- K4: nobody without a location is invited as a manager, unless Remote.
  perform app_private.keep_manager_at_a_location(target_workspace_id, target_employee_id, invite_role.access_class);

  select coalesce(array_agg(location_id order by location_id), '{}') into assigned_location_ids
  from public.employee_location_assignments
  where employee_id = target_employee_id and ended_at is null;
  if cardinality(assigned_location_ids) = 0 and not exists (
    select 1 from public.employee_profiles where id = target_employee_id
      and workspace_id = target_workspace_id and (is_remote or is_excluded_from_schedule)
  ) then
    raise exception 'employee requires a location before invitation' using errcode = '22023';
  end if;

  -- Inviting again takes back what was waiting: only an invitation the actor
  -- could take back themselves (nf-guvenlik O-2).
  if exists (
    select 1 from public.employee_invitations pending
    where pending.employee_id = target_employee_id and pending.status = 'pending'
      and not app_private.can_invite_with_role(actor_user_id, target_workspace_id, pending.role_id)
  ) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.rank', detail = 'employee.invite';
  end if;
  update public.employee_invitations
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where employee_id = target_employee_id and status = 'pending';
  insert into public.employee_invitations (
    workspace_id, employee_id, email, role_id, all_locations, location_ids,
    token_hash, expires_at, created_by, delivery_status
  ) values (
    target_workspace_id, target_employee_id, employee_email, invite_role.id,
    invite_role.access_class in ('admin', 'employee'),
    case when invite_role.access_class in ('admin', 'employee') then '{}'::uuid[] else assigned_location_ids end, invitation_token_hash, invitation_expires_at,
    actor_user_id, 'pending'
  ) returning id into invitation_id;
  update public.employee_profiles
  set invitation_email = employee_email, revision = revision + 1, updated_at = now()
  where id = target_employee_id;
  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (target_workspace_id, target_employee_id, actor_user_id, 'employee.invited', 'Employee invitation prepared');
  return invitation_id;
end;
$function$;

-- 5. What goes --------------------------------------------------------------------------------

drop function public.set_employee_managed_locations_service(uuid, uuid, uuid, uuid[]);
drop function app_private.manages_without_working(uuid, uuid);
delete from app_private.authz_actions where key = 'employee.set_managed_locations';
drop trigger managed_locations_follow_role on public.workspace_memberships;
drop function app_private.managed_locations_follow_role();
drop table public.membership_managed_locations;
alter table public.workspace_memberships drop constraint workspace_memberships_id_workspace_id_role_key;
