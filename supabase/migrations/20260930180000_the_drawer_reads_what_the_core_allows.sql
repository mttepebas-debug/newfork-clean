-- FB-6.2 .7b (KK-35 S1 a, S2 a): the Employees drawer and list read what the
-- core allows, so the screen does not work it out.
--
-- 1. The detail names the locations the person only manages (KK-29,
--    managed_locations [{id, name}]) so the drawer's editor starts from what
--    is there; per location they work at, whether the reader may take them
--    off it (removable, employee.remove_from_location); and allowed answers
--    set_managed_locations, invite and onboarding_review too. Only a
--    manager manages where they do not work, so set_managed_locations is no
--    for anybody else, as the command answers.
-- 2. The list names the locations each person only manages, for the
--    "Manages" label (managed_location_names).
-- Both name only the managed locations the reader reaches (actor().manages:
-- every live location for the owner and admins, their own for a manager). The
-- list's columns grow, so it is dropped and made again with its grants.
-- 3. Saving the Workspace home layout asks the home's own gate, the core's
--    workspace.todos (KK-36 (a)), instead of the old capability helper with a
--    bare 42501. An employee, who cannot open the home, no longer saves its
--    layout; a closed workspace and a document block refuse too; every
--    refusal carries its authz.* hint.
-- 4. Review (nf-guvenlik D4, D5): whether somebody may manage without working
--    there is one helper the drawer and the command both ask; a core action
--    row that is missing refuses (22023) instead of reading as allowed.

-- Only a manager manages a location without working there: one answer for the
-- drawer and for the command (nf-guvenlik D4).
create function app_private.manages_without_working(w uuid, member uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((app_private.actor(member, w)).class = 'manager', false)
$$;
revoke all on function app_private.manages_without_working(uuid, uuid) from public, anon, authenticated;

create or replace function public.get_employee_detail_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    'private_contact', case
      when private_profile.employee_id is null or not reads_private then null
      else jsonb_build_object(
        'legal_first_name', private_profile.legal_first_name,
        'legal_last_name', private_profile.legal_last_name,
        'preferred_name', private_profile.preferred_name,
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
        'emergency_contact_email', private_profile.emergency_contact_email,
        'share_phone_with_teammates', private_profile.share_phone_with_teammates,
        'share_email_with_teammates', private_profile.share_email_with_teammates
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
    -- Where they only manage (KK-29), as far as the reader reaches: a location
    -- out of the reader's reach is not named. Deleted ones are out of everyone's.
    'managed_locations', coalesce((
      select jsonb_agg(jsonb_build_object('id', place.id, 'name', place.name) order by place.name, place.id)
      from public.membership_managed_locations managed
      join public.locations place on place.id = managed.location_id
      where managed.membership_id = membership.id
        and managed.location_id = any (me.manages)
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
        -- Only a manager manages where they do not work, as the command says.
        and (action.key <> 'employee.set_managed_locations'
          or app_private.manages_without_working(target_workspace_id, employee.user_id)))
      from app_private.authz_actions action
      where action.key in ('employee.save', 'employee.terminate', 'employee.archive',
        'employee.remove_access', 'employee.change_role', 'employee.make_admin',
        'employee.set_managed_locations', 'employee.invite', 'onboarding.review')
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
$$;

drop function public.list_employees_service(uuid, uuid, boolean, text, text, integer, integer);

create function public.list_employees_service(actor_user_id uuid, target_workspace_id uuid, include_archived boolean default false, search_text text default ''::text, status_filter text default 'all'::text, page_limit integer default 100, page_offset integer default 0)
returns table(id uuid, workspace_id uuid, employee_code text, first_name text, last_name text, preferred_name text, display_name text, invitation_email text, start_date date, primary_location_id uuid, primary_location_name text, location_count bigint, primary_job_id uuid, primary_job_name text, job_count bigint, role_name text, display_status text, archived_at timestamp with time zone, revision integer, managed_location_names text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
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
      employee.archived_at, employee.revision,
      -- The "Manages" label: where they only manage, as far as the reader reaches.
      coalesce((
        select array_agg(place.name order by place.name, place.id)
        from public.membership_managed_locations managed
        join public.locations place on place.id = managed.location_id
        where managed.membership_id = membership.id
          and managed.location_id = any (me.manages)
      ), '{}') as managed_location_names
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
$$;

revoke all on function public.list_employees_service(uuid, uuid, boolean, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_employees_service(uuid, uuid, boolean, text, text, integer, integer) to service_role;

create or replace function public.save_workspace_layout_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_widget_order text[],
  target_hidden_widget_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed constant text[] := array[
    'operations',
    'pending_requests',
    'open_shifts',
    'announcements',
    'todos',
    'notifications',
    'quick_actions'
  ];
begin
  -- The home's own gate (KK-34): whoever cannot open it does not arrange it.
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.todos');
  if cardinality(target_widget_order) <> cardinality(allowed)
    or (select count(distinct value) from unnest(target_widget_order) value) <> cardinality(allowed)
    or exists(select 1 from unnest(target_widget_order || target_hidden_widget_ids) value where not value = any(allowed)) then
    raise exception 'valid workspace layout required' using errcode = '22023';
  end if;

  insert into public.workspace_layout_preferences (
    workspace_id, user_id, widget_order, hidden_widget_ids
  ) values (
    target_workspace_id,
    actor_user_id,
    target_widget_order,
    array(select distinct value from unnest(target_hidden_widget_ids) value)
  )
  on conflict(workspace_id, user_id)
  do update set
    widget_order = excluded.widget_order,
    hidden_widget_ids = excluded.hidden_widget_ids,
    updated_at = now();

  return jsonb_build_object('status', 'saved');
end;
$$;

create or replace function public.set_employee_managed_locations_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  location_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  member public.workspace_memberships%rowtype;
  wanted uuid[] := array(select distinct place from unnest(coalesce(location_ids, '{}'::uuid[])) place order by place);
  held uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.set_managed_locations',
    target_person => target_employee_id);

  select membership.* into member
  from public.employee_profiles employee
  join public.workspace_memberships membership
    on membership.workspace_id = employee.workspace_id and membership.user_id = employee.user_id
  where employee.id = target_employee_id and employee.workspace_id = target_workspace_id
  for update of membership;
  if member.id is null or not app_private.manages_without_working(target_workspace_id, member.user_id) then
    raise exception 'Only a manager manages a location without working there'
      using errcode = '22023', hint = 'employee.not_a_manager';
  end if;

  select coalesce(array_agg(managed.location_id order by managed.location_id), '{}') into held
  from public.membership_managed_locations managed
  where managed.membership_id = member.id;

  -- A location added is a live one of this workspace; anything else is out of
  -- reach, as an unknown id is.
  if exists (
    select 1 from unnest(wanted) place
    where not place = any (held)
      and not exists (
        select 1 from public.locations location
        where location.id = place and location.workspace_id = target_workspace_id
          and location.deleted_at is null and location.archived_at is null)
  ) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope',
      detail = 'employee.set_managed_locations';
  end if;

  delete from public.membership_managed_locations
  where membership_id = member.id and not location_id = any (wanted);
  insert into public.membership_managed_locations (workspace_id, membership_id, location_id, added_by)
  select target_workspace_id, member.id, place, actor_user_id
  from unnest(wanted) place
  where not place = any (held);

  if wanted is distinct from held then
    insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
    values (target_workspace_id, actor_user_id, 'employee.managed_locations_changed', 'employee',
      target_employee_id::text, jsonb_build_object(
        'added', to_jsonb(array(select unnest(wanted) except select unnest(held))),
        'removed', to_jsonb(array(select unnest(held) except select unnest(wanted)))));
  end if;

  return jsonb_build_object('employee_id', target_employee_id, 'location_ids', to_jsonb(wanted));
end;
$$;
