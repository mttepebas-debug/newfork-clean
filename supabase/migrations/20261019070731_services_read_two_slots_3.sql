-- ROL-CIFT 1.4, services_read_two_slots part 3 of 7: the same migration as part 1 describes, split at
-- statement boundaries so each part goes live in one piece. Runs after part 2.

CREATE OR REPLACE FUNCTION "public"."respond_workspace_ownership_transfer_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "transfer_id" "uuid", "transfer_action" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  transfer_row public.workspace_ownership_transfers%rowtype;
  owner_role_id uuid;
  admin_role_id uuid;
  owed public.employee_onboarding_requirements%rowtype;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501', hint = 'actor.required';
  end if;
  if transfer_action not in ('accept', 'reject') then
    raise exception 'valid ownership transfer action required' using errcode = '22023', hint = 'transfer.action_invalid';
  end if;

  perform 1 from public.workspaces where id = target_workspace_id for update;

  select * into transfer_row
  from public.workspace_ownership_transfers transfer
  where transfer.id = transfer_id
    and transfer.workspace_id = target_workspace_id
  for update;

  if transfer_row.id is null or transfer_row.status <> 'pending' then
    raise exception 'pending ownership transfer not found' using errcode = '02000', hint = 'transfer.not_found';
  end if;
  if transfer_row.target_user_id <> actor_user_id then
    raise exception 'ownership transfer target access required' using errcode = '42501', hint = 'transfer.target_required';
  end if;
  if transfer_row.expires_at <= now() then
    update public.workspace_ownership_transfers
    set status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = actor_user_id,
        updated_at = now()
    where id = transfer_row.id;
    raise exception 'ownership transfer has expired' using errcode = '23514', hint = 'transfer.expired';
  end if;

  if transfer_action = 'reject' then
    update public.workspace_ownership_transfers
    set status = 'rejected',
        rejected_at = now(),
        updated_at = now()
    where id = transfer_row.id;

    insert into public.audit_events (
      workspace_id,
      actor_user_id,
      action,
      target_type,
      target_id
    )
    values (
      target_workspace_id,
      actor_user_id,
      'workspace.ownership_transfer.rejected',
      'workspace_ownership_transfer',
      transfer_id::text
    );

    perform app_private.ownership_tell(transfer_row, 'declined', actor_user_id);
    return jsonb_build_object(
      'status', 'rejected',
      'transfer_id', transfer_id,
      'workspace_id', target_workspace_id
    );
  end if;

  if not app_private.workspace_allows_interactive_access(target_workspace_id) or not exists (
    select 1 from public.workspace_memberships m
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    join auth.users u on u.id = m.user_id and u.email_confirmed_at is not null
    where m.id = transfer_row.target_membership_id and m.workspace_id = target_workspace_id
      and m.user_id = actor_user_id and m.status = 'active' and r.access_class = 'admin'
      and not exists (select 1 from public.employee_onboarding_cases c
        where c.membership_id = m.id and c.workspace_id = m.workspace_id and c.status <> 'approved')
      -- The owner works the Owner job on their own record (BL-252), so only
      -- somebody with a live record here takes ownership.
      and exists (select 1 from public.employee_profiles employee
        where employee.workspace_id = m.workspace_id and employee.user_id = m.user_id
          and employee.archived_at is null)
  ) or not exists (
    select 1 from public.workspace_memberships m
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    where m.id = transfer_row.previous_owner_membership_id and m.workspace_id = target_workspace_id
      and m.user_id = transfer_row.initiated_by and m.status = 'active' and r.access_class = 'owner'
  ) then raise exception 'ownership transfer participants are no longer eligible' using errcode = '42501', hint = 'transfer.participants_ineligible'; end if;

  select id into owner_role_id
  from public.workspace_roles
  where workspace_id = target_workspace_id
    and system_key = 'owner';

  select id into admin_role_id
  from public.workspace_roles
  where workspace_id = target_workspace_id
    and system_key = 'admin';

  if owner_role_id is null or admin_role_id is null then
    raise exception 'system owner and admin roles are required' using errcode = 'P0002', hint = 'workspace.roles_missing';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  perform set_config('app.owner_transfer', 'on', true);

  update public.workspace_memberships
  set role_id = owner_role_id,
      updated_at = now()
  where id = transfer_row.target_membership_id
    and workspace_id = target_workspace_id
    and status = 'active';

  update public.workspace_memberships
  set role_id = admin_role_id,
      updated_at = now()
  where id = transfer_row.previous_owner_membership_id
    and workspace_id = target_workspace_id
    and status = 'active';

  -- The Owner job moves with ownership (BL-218): off the old owner's record,
  -- onto the new owner's, with every location, in this transaction.
  update public.employee_job_assignments assignment
  set ended_at = now(), is_primary = false
  from public.jobs job
  where job.id = assignment.job_id
    and job.workspace_id = target_workspace_id
    and job.system_key = 'owner'
    and assignment.ended_at is null
    and not app_private.employee_record_is_workspace_owner(target_workspace_id, assignment.employee_id);
  perform app_private.open_owner_record_to_everything(target_workspace_id, employee.id, actor_user_id)
  from public.employee_profiles employee
  where employee.workspace_id = target_workspace_id
    and employee.user_id = actor_user_id
    and employee.archived_at is null;

  -- The new owner is asked for no document from now on, like any owner
  -- (BL-246): what they still owed is excused the way a document reaching an
  -- owner later is, and the document block lifts with it. Each excuse is
  -- recorded like any exemption, as the old owner's are when taken back.
  for owed in
  update public.employee_onboarding_requirements requirement
  set (owner_excused, lifecycle_exempt, required, blocks_activation, deadline_at, lifecycle_close_reason,
       paused_remaining_seconds, document_suspended_at, lifecycle_closed_at) = (
        select excused.owner_excused, excused.lifecycle_exempt, excused.required, excused.blocks_activation,
          excused.deadline_at, excused.lifecycle_close_reason,
          excused.paused_remaining_seconds, excused.document_suspended_at, excused.lifecycle_closed_at
        from app_private.owner_document_excused(requirement) excused
      ),
      lifecycle_revision = requirement.lifecycle_revision + 1,
      updated_at = now()
  from public.employee_profiles employee
  where employee.id = requirement.employee_id
    and employee.workspace_id = target_workspace_id
    and employee.user_id = actor_user_id
    and requirement.workspace_id = target_workspace_id
    and requirement.kind in ('document', 'acknowledgement')
    and not requirement.lifecycle_exempt
    and requirement.lifecycle_retired_at is null
  returning requirement.*
  loop
    perform app_private.document_audit(owed, actor_user_id, 'document.exempted',
      jsonb_build_object('reason', 'Now the owner', 'revision', owed.lifecycle_revision));
  end loop;

  -- The old owner, now an admin, is asked for the documents everyone is
  -- (BL-252): the excuses they had for being the owner are taken back as a
  -- reviewer removes one. A document that is down keeps its excuse until it is
  -- put back up (set_document_publication_service).
  for owed in
    select r.* from public.employee_onboarding_requirements r
    join public.employee_profiles employee on employee.id = r.employee_id
    where r.workspace_id = target_workspace_id
      and employee.workspace_id = target_workspace_id
      and employee.user_id = transfer_row.initiated_by
      and r.kind in ('document', 'acknowledgement')
      and r.owner_excused
      and r.lifecycle_retired_at is null
    for update of r
  loop
    begin
      perform app_private.set_document_exemption(owed, actor_user_id, false, 'No longer the owner', owed.lifecycle_revision);
    exception when sqlstate 'PT409' then
      null;
    end;
  end loop;

  update public.workspace_ownership_transfers
  set status = 'accepted',
      accepted_at = now(),
      updated_at = now()
  where id = transfer_row.id;

  insert into public.audit_events (
    workspace_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    target_workspace_id,
    actor_user_id,
    'workspace.ownership_transfer.accepted',
    'workspace_ownership_transfer',
    transfer_id::text,
    jsonb_build_object(
      'previous_owner_membership_id', transfer_row.previous_owner_membership_id,
      'target_membership_id', transfer_row.target_membership_id
    )
  );

  insert into public.audit_events (
    workspace_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    target_workspace_id,
    actor_user_id,
    'billing.payment_method.detach_required_after_owner_transfer',
    'workspace',
    target_workspace_id::text,
    jsonb_build_object('previous_owner_user_id', transfer_row.initiated_by)
  );

  perform app_private.ownership_tell(transfer_row, 'accepted', actor_user_id);
  return jsonb_build_object(
    'status', 'accepted',
    'transfer_id', transfer_id,
    'workspace_id', target_workspace_id
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."list_my_workspace_identities_service"("actor_user_id" "uuid") RETURNS TABLE("workspace_id" "uuid", "workspace_name" "text", "workspace_role" "public"."workspace_role", "employee_name" "text", "employee_code" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    workspace.id,
    workspace.name,
    coalesce((select slot.access_class from public.workspace_roles slot where slot.id = membership.role_id), 'employee'::public.workspace_role),
    nullif(btrim(coalesce(employee.first_name, '') || ' ' || coalesce(employee.last_name, '')), ''),
    employee.employee_code
  from public.workspace_memberships membership
  join public.workspaces workspace on workspace.id = membership.workspace_id
  left join public.employee_profiles employee
    on employee.workspace_id = membership.workspace_id
   and employee.user_id = membership.user_id
   and employee.archived_at is null
  where membership.user_id = actor_user_id
    and membership.status in (
      'active'::public.membership_status,
      'pending_activation'::public.membership_status
    )
    and workspace.lifecycle_status <> 'deleted'::public.workspace_lifecycle_status
  order by workspace.name;
$$;

CREATE OR REPLACE FUNCTION "public"."list_my_workspaces"() RETURNS TABLE("workspace_id" "uuid", "workspace_name" "text", "workspace_role" "public"."workspace_role", "membership_status" "public"."membership_status", "is_active" boolean, "onboarding_status" "public"."onboarding_status", "onboarding_current_step" smallint, "workspace_lifecycle_status" "public"."workspace_lifecycle_status", "closure_effective_at" timestamp with time zone, "last_used_at" timestamp with time zone, "access_removed" boolean, "pending_ownership_transfer_id" "uuid", "pending_ownership_transfer_role" "text", "pending_ownership_transfer_expires_at" timestamp with time zone, "other_member_count" integer, "pending_invitation_count" integer, "default_closure_effective_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    workspace.id,
    workspace.name,
    coalesce((select slot.access_class from public.workspace_roles slot where slot.id = membership.role_id), 'employee'::public.workspace_role),
    membership.status,
    coalesce(workspace.id = preference.active_workspace_id, false)
      and membership.status = 'active'
      and (
        workspace.lifecycle_status = 'active'
        or (
          workspace.lifecycle_status = 'closure_scheduled'
          and workspace.closure_effective_at > now()
        )
      ),
    coalesce(onboarding.status, 'complete'::public.onboarding_status),
    coalesce(onboarding.current_step, 2::smallint),
    workspace.lifecycle_status,
    workspace.closure_effective_at,
    membership.last_used_at,
    exists (
      select 1
      from public.employee_access_snapshots snapshot
      where snapshot.membership_id = membership.id
        and snapshot.restored_at is null
    ),
    transfer.id,
    case
      when transfer.id is null then null
      when transfer.target_user_id = (select auth.uid()) then 'target'
      else 'initiator'
    end,
    transfer.expires_at,
    -- Everybody else who would lose access, and everybody who has been asked
    -- and not answered. The reader is not counted: they know about themselves,
    -- and what the closing screen has to say is what it costs other people.
    (
      select count(*)
      from public.workspace_memberships other
      where other.workspace_id = workspace.id
        and other.user_id <> membership.user_id
        and other.status in ('active', 'pending_activation')
        and not exists (
          select 1
          from public.employee_profiles employee
          where employee.workspace_id = other.workspace_id
            and employee.user_id = other.user_id
            and employee.archived_at is not null
        )
    )::integer,
    (
      select count(*)
      from public.employee_invitations invitation
      where invitation.workspace_id = workspace.id
        and invitation.status = 'pending'
        and invitation.expires_at > now()
    )::integer,
    -- What a scheduled closure would land on if nobody names a date, so the
    -- panel can say it before anybody commits to anything.
    now() + app_private.default_closure_period()
  from public.workspace_memberships membership
  join public.workspaces workspace on workspace.id = membership.workspace_id
  left join public.user_workspace_preferences preference on preference.user_id = membership.user_id
  left join public.workspace_onboarding onboarding on onboarding.workspace_id = workspace.id
  left join lateral (
    select pending_transfer.id,
           pending_transfer.target_user_id,
           pending_transfer.expires_at
    from public.workspace_ownership_transfers pending_transfer
    where pending_transfer.workspace_id = workspace.id
      and pending_transfer.status = 'pending'
      -- Keep expired requests visible to their sender so they can be cancelled.
      and (pending_transfer.expires_at > now() or pending_transfer.initiated_by = membership.user_id)
      and (
        pending_transfer.initiated_by = membership.user_id
        or pending_transfer.target_user_id = membership.user_id
      )
    order by pending_transfer.created_at desc
    limit 1
  ) transfer on true
  where membership.user_id = (select auth.uid())
    and not exists (
      select 1
      from public.employee_profiles employee
      where employee.workspace_id = membership.workspace_id
        and employee.user_id = membership.user_id
        and employee.archived_at is not null
    )
  order by
    (membership.status = 'active') desc,
    (coalesce(workspace.id = preference.active_workspace_id, false) and membership.status = 'active') desc,
    workspace.name asc;
$$;

CREATE OR REPLACE FUNCTION "public"."resolve_workspace_context_service"("actor_user_id" "uuid", "target_workspace_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("user_id" "uuid", "workspace_id" "uuid", "workspace_name" "text", "workspace_logo_storage_path" "text", "workspace_logo_file_name" "text", "workspace_logo_updated_at" timestamp with time zone, "schedule_logo_scale" numeric, "schedule_logo_offset_x" numeric, "schedule_logo_offset_y" numeric, "membership_id" "uuid", "workspace_role" "public"."workspace_role", "membership_role_id" "uuid", "membership_role_name" "text", "permission_keys" "text"[], "all_locations" boolean, "onboarding_status" "public"."onboarding_status", "onboarding_current_step" smallint, "onboarding_revision" integer, "actions" "text"[], "location_ids" "uuid"[], "document_restricted" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  chosen uuid := target_workspace_id;
  state app_private.actor_state;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  if chosen is null then
    select membership.workspace_id into chosen
    from public.workspace_memberships membership
    left join public.user_workspace_preferences preference on preference.user_id = membership.user_id
    where membership.user_id = actor_user_id
      and membership.status = 'active'
      and (
        membership.workspace_id = preference.active_workspace_id
        or (
          select count(*) from public.workspace_memberships other
          where other.user_id = actor_user_id and other.status = 'active'
        ) = 1
      )
    order by (membership.workspace_id = preference.active_workspace_id) desc nulls last, membership.created_at
    limit 1;
    if chosen is null then
      return;
    end if;
  else
    perform set_config('app.allow_incomplete_workspace_context', 'on', true);
  end if;

  state := app_private.actor(actor_user_id, chosen);

  return query
  select
    membership.user_id,
    workspace.id,
    workspace.name,
    workspace.logo_storage_path,
    workspace.logo_file_name,
    workspace.logo_updated_at,
    workspace.schedule_logo_scale,
    workspace.schedule_logo_offset_x,
    workspace.schedule_logo_offset_y,
    membership.id,
    role.access_class,
    role.id,
    role.name,
    coalesce(
      array_agg(grant_row.permission_key order by permission.sort_order)
        filter (where grant_row.permission_key is not null),
      '{}'::text[]
    ),
    role.access_class in ('owner', 'admin'),
    onboarding.status,
    onboarding.current_step,
    onboarding.revision,
    app_private.actor_actions(state),
    case when role.access_class in ('owner', 'admin') then '{}'::uuid[]
         when role.access_class = 'manager' then state.manages else state.works end,
    state.document_blocked
  from public.workspace_memberships membership
  join public.workspaces workspace
    on workspace.id = membership.workspace_id
  -- The role a screen shows: the management slot's, else the employee slot's (ROL-CIFT 1.4; the
  -- membership's two slots reach the API in 1.5).
  join public.workspace_roles role
    on role.id = coalesce(membership.role_id, membership.employee_role_id)
   and role.workspace_id = membership.workspace_id
  left join public.workspace_role_permissions grant_row
    on grant_row.role_id = role.id
  left join public.permissions permission
    on permission.key = grant_row.permission_key
  join public.workspace_onboarding onboarding
    on onboarding.workspace_id = workspace.id
  where membership.user_id = actor_user_id
    and membership.workspace_id = chosen
    and membership.status = 'active'
    -- ponytail: the workspace they last chose is not checked for being open,
    -- as before; its actions are empty when it is closed (the core refuses).
    and (target_workspace_id is null or app_private.workspace_allows_interactive_access(workspace.id))
  group by
    membership.user_id,
    workspace.id,
    workspace.name,
    workspace.logo_storage_path,
    workspace.logo_file_name,
    workspace.logo_updated_at,
    workspace.schedule_logo_scale,
    workspace.schedule_logo_offset_x,
    workspace.schedule_logo_offset_y,
    membership.id,
    role.access_class,
    role.id,
    role.name,
    onboarding.status,
    onboarding.current_step,
    onboarding.revision;
end;
$$;

CREATE OR REPLACE FUNCTION "app_private"."announcement_respondents"("item" "public"."announcements") RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(array_agg(who order by who), '{}')
  from unnest(app_private.announcement_recipients(item)) who
  where item.ask_ack and item.status = 'published'
    and app_private.authz_rank(coalesce((
      select role.access_class from public.workspace_memberships membership
      join public.workspace_roles role on role.id = coalesce(membership.role_id, membership.employee_role_id) and role.workspace_id = membership.workspace_id
      where membership.workspace_id = item.workspace_id and membership.user_id = who), 'employee'))
    < app_private.authz_rank(coalesce((
      select role.access_class from public.workspace_memberships membership
      join public.workspace_roles role on role.id = coalesce(membership.role_id, membership.employee_role_id) and role.workspace_id = membership.workspace_id
      where membership.workspace_id = item.workspace_id and membership.user_id = coalesce(item.published_by, item.created_by)),
      'owner'))
$$;

CREATE OR REPLACE FUNCTION "app_private"."communication_reason"("state" "app_private"."actor_state", "w" "uuid", "kind" "text", "stored" "uuid"[], "author" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  live uuid[] := app_private.live_locations(w, stored);
  writer uuid := (
    select membership.user_id from public.workspace_memberships membership
    where membership.workspace_id = w and membership.user_id = author and membership.status = 'active'
  );
  -- The role the author last had here, whether they are still here or not.
  last_role public.workspace_role := (
    select role.access_class from public.workspace_memberships membership
    join public.workspace_roles role on role.id = coalesce(membership.role_id, membership.employee_role_id) and role.workspace_id = membership.workspace_id
    where membership.workspace_id = w and membership.user_id = author
  );
  narrow app_private.authz_actions;
  wide app_private.authz_actions;
  reason text;
begin
  select * into strict narrow from app_private.authz_actions a where a.key = kind || '.write';
  select * into strict wide from app_private.authz_actions a where a.key = kind || '.write_wide';
  -- An admin or owner who has left protects the record harder, not softer:
  -- only an admin or the owner changes it (Mert, 2026-10-02, O1; fail
  -- closed). So does a record that no longer says who wrote it (a deleted
  -- account). A manager who has left ranks as the manager they were ("En
  -- nihayetinde o da müdürdü.", Mert, 2026-10-02): the K3 rule goes on.
  if writer is null and (last_role is null or last_role in ('owner', 'admin')) then
    reason := app_private.authz_check(state, wide, null, null, null);
    return case when reason = 'out_of_scope' then 'rank' else reason end;
  end if;
  writer := author;
  if cardinality(stored) > 0 and cardinality(live) = 1 then
    return app_private.authz_check(state, narrow, live, null, writer);
  end if;
  return app_private.authz_check(state, wide, null, null, writer);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_account_deletion_blockers_service"("actor_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with blocker_rows as (
    select
      'active_membership'::text as kind,
      membership.workspace_id,
      workspace.name as workspace_name,
      role.name as role_name,
      (role.system_key = 'owner') as is_owner,
      null::uuid as transfer_id,
      null::text as transfer_direction
    from public.workspace_memberships membership
    join public.workspaces workspace on workspace.id = membership.workspace_id
    join public.workspace_roles role on role.id = coalesce(membership.role_id, membership.employee_role_id)
    where membership.user_id = actor_user_id
      and membership.status = 'active'
      and (
        workspace.lifecycle_status = 'active'
        or (
          workspace.lifecycle_status = 'closure_scheduled'
          and workspace.closure_effective_at > now()
        )
      )

    union all

    select
      'pending_ownership_transfer'::text,
      transfer.workspace_id,
      workspace.name,
      null::text,
      false,
      transfer.id,
      case
        when transfer.initiated_by = actor_user_id then 'outgoing'
        else 'incoming'
      end
    from public.workspace_ownership_transfers transfer
    join public.workspaces workspace on workspace.id = transfer.workspace_id
    where transfer.status = 'pending'
      and (
        transfer.initiated_by = actor_user_id
        or transfer.target_user_id = actor_user_id
      )
  )
  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'kind', kind,
        'workspace_id', workspace_id,
        'workspace_name', workspace_name,
        'role_name', role_name,
        'is_owner', is_owner,
        'transfer_id', transfer_id,
        'transfer_direction', transfer_direction
      ))
      order by workspace_name, kind, transfer_id
    ),
    '[]'::jsonb
  )
  from blocker_rows;
$$;
