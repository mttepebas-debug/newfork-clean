-- ROL-CIFT 1.4, services_read_two_slots part 4 of 7: the same migration as part 1 describes, split at
-- statement boundaries so each part goes live in one piece. Runs after part 3.

CREATE OR REPLACE FUNCTION "public"."get_employee_detail_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_employee_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  me app_private.actor_state;
  reads_private boolean;
  reads_access boolean;
  removal app_private.authz_actions;
  invite_rule app_private.authz_actions;
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
  select * into invite_rule from app_private.authz_actions action where action.key = 'employee.invite';
  if not found then
    raise exception 'core action employee.invite is missing' using errcode = '22023';
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
    -- Whether this is the workspace owner's record: the drawer asks here, not
    -- the role's name (BL-421).
    'is_workspace_owner', app_private.employee_record_is_workspace_owner(employee.workspace_id, employee.id),
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
        order by assignment.is_primary desc, lower(assigned_job.name), assigned_job.id
      )
      from public.employee_job_assignments assignment
      join public.jobs assigned_job on assigned_job.id = assignment.job_id
      where assignment.employee_id = employee.id and assignment.ended_at is null
    ), '[]'::jsonb),
    'invitation', case
      -- Who reads access reads it; so does whoever its buttons answer to
      -- (employee.invite, a role they may give; BL-1069).
      when invitation.id is null or not (reads_access
        or (app_private.authz_check(me, invite_rule, null, employee.id, null) is null
          and app_private.can_invite_with_role(actor_user_id, target_workspace_id, invitation.role_id))) then null
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
  left join public.workspace_roles role on role.id = coalesce(membership.role_id, membership.employee_role_id)
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

CREATE OR REPLACE FUNCTION "public"."list_employees_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "include_archived" boolean DEFAULT false, "search_text" "text" DEFAULT ''::"text", "status_filter" "text" DEFAULT 'all'::"text", "page_limit" integer DEFAULT 100, "page_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "workspace_id" "uuid", "employee_code" "text", "first_name" "text", "last_name" "text", "preferred_name" "text", "display_name" "text", "invitation_email" "text", "start_date" "date", "locations" "jsonb", "primary_job_id" "uuid", "primary_job_name" "text", "job_count" bigint, "role_name" "text", "display_status" "text", "archived_at" timestamp with time zone, "revision" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
      -- Every location they work at, the primary first, then A to Z (BL-436).
      coalesce((
        select jsonb_agg(jsonb_build_object('id', place.id, 'name', place.name, 'primary', assignment.is_primary)
          order by assignment.is_primary desc, lower(place.name), place.id)
        from public.employee_location_assignments assignment
        join public.locations place on place.id = assignment.location_id
        where assignment.employee_id = employee.id and assignment.ended_at is null
      ), '[]'::jsonb) as locations,
      primary_job.job_id as primary_job_id, app_private.listed_job_name(employee.id) as primary_job_name,
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
    left join public.employee_job_assignments primary_job on primary_job.employee_id = employee.id and primary_job.ended_at is null and primary_job.is_primary
    left join public.workspace_memberships membership on membership.workspace_id = employee.workspace_id and membership.user_id = employee.user_id
    left join public.workspace_roles role on role.id = coalesce(membership.role_id, membership.employee_role_id)
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
        (select string_agg(place ->> 'name', ' ') from jsonb_array_elements(directory.locations) place),
        directory.primary_job_name
      ) ilike '%' || btrim(search_text) || '%'
    )
    and (status_filter = 'all' or directory.display_status = status_filter)
  order by lower(directory.display_name), directory.id
  limit least(greatest(page_limit, 1), 200)
  offset greatest(page_offset, 0);
end;
$$;

CREATE OR REPLACE FUNCTION "app_private"."can_edit_role"("actor" "uuid", "w" "uuid", "rid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
 select exists(select 1 from public.workspace_memberships m join public.workspace_roles ar on ar.id=coalesce(m.role_id, m.employee_role_id)
 left join public.workspace_roles target on target.id=rid and target.workspace_id=w
 where m.user_id=actor and m.workspace_id=w and m.status='active' and coalesce(m.role_id, m.employee_role_id) is distinct from rid
 and app_private.authz_reason(actor,w,'settings.roles.write') is null
 and (rid is null or (target.id is not null and target.access_class<>'owner'))
 and (ar.access_class='owner' or (ar.access_class='admin' and (rid is null or target.access_class in ('manager','employee')))));
$$;

CREATE OR REPLACE FUNCTION "public"."read_role_workspace_service"("actor_user_id" "uuid", "target_workspace_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.roles.read');
  return jsonb_build_object(
    'permissions', (select jsonb_agg(p order by p.sort_order) from public.permissions p),
    'roles', coalesce((
      select jsonb_agg(to_jsonb(r) || jsonb_build_object(
        'permission_keys', coalesce((select jsonb_agg(g.permission_key order by g.permission_key)
          from public.workspace_role_permissions g where g.role_id = r.id), '[]'::jsonb),
        'member_count', (select count(*) from public.workspace_memberships m where r.id in (m.role_id, m.employee_role_id) and m.status = 'active'),
        'pending_invite_count', (select count(*) from public.employee_invitations i
          where i.role_id = r.id and i.status = 'pending' and i.expires_at > now()),
        'blocking_member_count', (select count(*) from public.workspace_memberships m where r.id in (m.role_id, m.employee_role_id))
          + (select count(*) from public.employee_access_snapshots snap where snap.role_id = r.id),
        'blocking_invite_count', (select count(*) from public.employee_invitations i where i.role_id = r.id),
        'editable', app_private.can_edit_role(actor_user_id, target_workspace_id, r.id),
        'deletable', r.system_key is null and app_private.can_edit_role(actor_user_id, target_workspace_id, r.id)
          and not exists (select 1 from public.workspace_memberships m where r.id in (m.role_id, m.employee_role_id))
          and not exists (select 1 from public.employee_invitations i where i.role_id = r.id)
          and not exists (select 1 from public.employee_access_snapshots snap where snap.role_id = r.id)
      ) order by r.sort_order, r.name)
      from public.workspace_roles r
      where r.workspace_id = target_workspace_id
    ), '[]'::jsonb)
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."set_employee_archived_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_employee_id" "uuid", "should_archive" boolean, "restore_access" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  employee_user_id uuid;
  member public.workspace_memberships%rowtype;
  reopened public.workspace_memberships%rowtype;
  snapshot public.employee_access_snapshots%rowtype;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.archive', target_person => target_employee_id);

  select user_id into employee_user_id
  from public.employee_profiles
  where id = target_employee_id and workspace_id = target_workspace_id
  for update;

  if not should_archive and restore_access then
    select * into snapshot
    from public.employee_access_snapshots
    where employee_id = target_employee_id and restored_at is null
    order by captured_at desc
    limit 1
    for update;
    if snapshot.id is null then
      raise exception 'restorable access snapshot not found' using errcode = 'P0002';
    end if;
    select * into reopened
    from public.workspace_memberships
    where id = snapshot.membership_id and workspace_id = target_workspace_id;
    -- Only the account still linked to the record is reopened: once a rehire
    -- restore detached it, reopening would hand its role to an account no
    -- record stands for (nf-guvenlik Y1).
    if employee_user_id is null or reopened.user_id is distinct from employee_user_id then
      raise exception 'employee has no linked workspace account' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.workspace_roles
      where id = snapshot.role_id and workspace_id = target_workspace_id
    ) then
      raise exception 'snapshotted role is no longer available' using errcode = '22023';
    end if;
    -- Giving the account back is the twin of taking it away, and hands out the
    -- role it had: both asked of the membership it reopens.
    perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.remove_access',
      target_user => reopened.user_id);
    perform app_private.authorize_role_grant(actor_user_id, target_workspace_id, snapshot.role_id,
      target_user => reopened.user_id);
  end if;

  select * into member
  from public.workspace_memberships
  where workspace_id = target_workspace_id and user_id = employee_user_id;

  if should_archive and member.id is not null and member.status in ('active', 'pending_activation') then
    insert into public.employee_access_snapshots (workspace_id, employee_id, membership_id, role_id, captured_by)
    values (target_workspace_id, target_employee_id, member.id, coalesce(member.role_id, member.employee_role_id), actor_user_id);

    update public.workspace_memberships
    set status = 'suspended'::public.membership_status, updated_at = now()
    where id = member.id;
  end if;

  update public.employee_profiles
  set archived_at = case when should_archive then now() else null end,
      archived_by = case when should_archive then actor_user_id else null end,
      user_id = case
        when not should_archive and not restore_access and employee_user_id is not null then null
        else user_id
      end,
      revision = revision + 1,
      updated_at = now()
  where id = target_employee_id;

  if not should_archive and restore_access then
    perform set_config('app.membership_change', snapshot.membership_id::text, true);
    update public.workspace_memberships
    set status = 'active'::public.membership_status, updated_at = now()
    where id = snapshot.membership_id;
    perform app_private.place_single_role(snapshot.membership_id, snapshot.role_id);

    update public.employee_access_snapshots set restored_at = now() where id = snapshot.id;
  end if;

  insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
  values (
    target_workspace_id,
    target_employee_id,
    actor_user_id,
    case when should_archive then 'employee.archived' else 'employee.restored' end,
    case
      when should_archive then 'Employee archived and linked access suspended'
      when restore_access then 'Employee record and access restored'
      else 'Employee record restored for rehire'
    end
  );

  -- Archived with access: the person hears it ended. Restored with access: the person and who may publish
  -- where they work (access_tell_ended, access_tell_restored).
  if should_archive and member.id is not null and member.status in ('active', 'pending_activation') then
    perform app_private.access_tell_ended(target_workspace_id, target_employee_id, employee_user_id, member.id, actor_user_id);
  elsif should_archive then
    perform app_private.access_tell_ended(target_workspace_id, target_employee_id, null, null, actor_user_id);
  elsif not should_archive and restore_access then
    perform app_private.access_tell_restored(target_workspace_id, target_employee_id, reopened.user_id, actor_user_id);
  end if;
end;
$$;
