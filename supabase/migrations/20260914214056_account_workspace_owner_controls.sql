-- Account controls use service-only RPCs: the API resolves the actor from Auth.
create or replace function public.create_owner_workspace_service(actor_user_id uuid, workspace_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;
  -- Serialize create attempts for one account, preserving incomplete-draft reuse.
  perform 1 from auth.users where id = actor_user_id for update;
  if not found then raise exception 'authentication required' using errcode = '42501'; end if;
  if exists (
    select 1 from public.workspace_memberships m
    where m.user_id = actor_user_id and m.status = 'active'
      and app_private.workspace_allows_interactive_access(m.workspace_id)
  ) and not exists (
    select 1 from public.workspace_memberships m
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    where m.user_id = actor_user_id and m.status = 'active'
      and coalesce(r.access_class, m.role) = 'owner'
      and app_private.workspace_allows_interactive_access(m.workspace_id)
  ) then
    raise exception 'workspace owner access required' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  return public.create_owner_workspace(workspace_name);
end; $$;

create or replace function public.search_workspace_ownership_candidates_service(
  actor_user_id uuid, target_workspace_id uuid, search_text text
)
returns table ("userId" uuid, name text, email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if actor_user_id is null or not app_private.workspace_allows_interactive_access(target_workspace_id)
    or not exists (
      select 1 from public.workspace_memberships m
      left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
      where m.workspace_id = target_workspace_id and m.user_id = actor_user_id
        and m.status = 'active' and coalesce(r.access_class, m.role) = 'owner'
    ) then raise exception 'workspace owner access required' using errcode = '42501'; end if;
  if search_text is null or char_length(btrim(search_text)) not between 2 and 80 then
    raise exception 'search must contain 2 to 80 characters' using errcode = '22023';
  end if;
  return query
    select m.user_id, coalesce(nullif(concat_ws(' ', coalesce(nullif(e.preferred_name, ''), e.first_name), e.last_name), ''), p.display_name, u.email)::text, u.email::text
    from public.workspace_memberships m
    join auth.users u on u.id = m.user_id and u.email_confirmed_at is not null
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    left join public.employee_profiles e on e.workspace_id = m.workspace_id and e.user_id = m.user_id and e.archived_at is null
    left join public.user_profiles p on p.user_id = m.user_id
    where m.workspace_id = target_workspace_id and m.status = 'active'
      and m.user_id <> actor_user_id and coalesce(r.access_class, m.role) = 'admin'
      -- Active legacy memberships without an onboarding case are already complete.
      and not exists (select 1 from public.employee_onboarding_cases c
        where c.workspace_id = target_workspace_id and c.membership_id = m.id and c.status <> 'approved')
      -- Literal substring matching: '%' and '_' cannot enumerate the directory.
      and position(lower(btrim(search_text)) in lower(concat_ws(' ', e.first_name, e.last_name, e.preferred_name, p.display_name, u.email))) > 0
    order by 2, m.user_id limit 10;
end; $$;

create or replace function public.cancel_workspace_ownership_transfer_service(
  actor_user_id uuid, target_workspace_id uuid, transfer_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare transfer_row public.workspace_ownership_transfers%rowtype;
begin
  -- Same workspace -> transfer lock order as initiate/accept, to serialize races.
  perform 1 from public.workspaces where id = target_workspace_id for update;
  if actor_user_id is null or not exists (
    select 1 from public.workspace_memberships m
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    where m.workspace_id = target_workspace_id and m.user_id = actor_user_id
      and m.status = 'active' and coalesce(r.access_class, m.role) = 'owner'
  ) then raise exception 'workspace owner access required' using errcode = '42501'; end if;
  select * into transfer_row from public.workspace_ownership_transfers t
    where t.id = transfer_id and t.workspace_id = target_workspace_id for update;
  if transfer_row.id is null or transfer_row.status <> 'pending' then
    raise exception 'pending ownership transfer not found' using errcode = '02000';
  end if;
  if transfer_row.initiated_by <> actor_user_id then
    raise exception 'ownership transfer initiator access required' using errcode = '42501';
  end if;
  update public.workspace_ownership_transfers set status = 'cancelled', cancelled_at = now(),
    cancelled_by = actor_user_id, updated_at = now() where id = transfer_row.id;
  insert into public.audit_events(workspace_id, actor_user_id, action, target_type, target_id)
    values(target_workspace_id, actor_user_id, 'workspace.ownership_transfer.cancelled', 'workspace_ownership_transfer', transfer_row.id::text);
  return jsonb_build_object('status', 'cancelled', 'transfer_id', transfer_row.id, 'workspace_id', target_workspace_id);
end; $$;

revoke all on function public.create_owner_workspace_service(uuid, text) from public, anon, authenticated;
revoke all on function public.search_workspace_ownership_candidates_service(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_workspace_ownership_transfer_service(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_owner_workspace_service(uuid, text) to service_role;
grant execute on function public.search_workspace_ownership_candidates_service(uuid, uuid, text) to service_role;
grant execute on function public.cancel_workspace_ownership_transfer_service(uuid, uuid, uuid) to service_role;
create or replace function public.respond_workspace_ownership_transfer_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  transfer_id uuid,
  transfer_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  transfer_row public.workspace_ownership_transfers%rowtype;
  owner_role_id uuid;
  admin_role_id uuid;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;
  if transfer_action not in ('accept', 'reject') then
    raise exception 'valid ownership transfer action required' using errcode = '22023';
  end if;

  perform 1 from public.workspaces where id = target_workspace_id for update;

  select * into transfer_row
  from public.workspace_ownership_transfers transfer
  where transfer.id = transfer_id
    and transfer.workspace_id = target_workspace_id
  for update;

  if transfer_row.id is null or transfer_row.status <> 'pending' then
    raise exception 'pending ownership transfer not found' using errcode = '02000';
  end if;
  if transfer_row.target_user_id <> actor_user_id then
    raise exception 'ownership transfer target access required' using errcode = '42501';
  end if;
  if transfer_row.expires_at <= now() then
    update public.workspace_ownership_transfers
    set status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = actor_user_id,
        updated_at = now()
    where id = transfer_row.id;
    raise exception 'ownership transfer has expired' using errcode = '23514';
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
      and m.user_id = actor_user_id and m.status = 'active' and coalesce(r.access_class, m.role) = 'admin'
      and not exists (select 1 from public.employee_onboarding_cases c
        where c.membership_id = m.id and c.workspace_id = m.workspace_id and c.status <> 'approved')
  ) or not exists (
    select 1 from public.workspace_memberships m
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    where m.id = transfer_row.previous_owner_membership_id and m.workspace_id = target_workspace_id
      and m.user_id = transfer_row.initiated_by and m.status = 'active' and coalesce(r.access_class, m.role) = 'owner'
  ) then raise exception 'ownership transfer participants are no longer eligible' using errcode = '42501'; end if;

  select id into owner_role_id
  from public.workspace_roles
  where workspace_id = target_workspace_id
    and system_key = 'owner';

  select id into admin_role_id
  from public.workspace_roles
  where workspace_id = target_workspace_id
    and system_key = 'admin';

  if owner_role_id is null or admin_role_id is null then
    raise exception 'system owner and admin roles are required' using errcode = 'P0002';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  perform set_config('app.owner_transfer', 'on', true);

  update public.workspace_memberships
  set role_id = owner_role_id,
      role = 'owner',
      all_locations = true,
      updated_at = now()
  where id = transfer_row.target_membership_id
    and workspace_id = target_workspace_id
    and status = 'active';

  update public.workspace_memberships
  set role_id = admin_role_id,
      role = 'admin',
      all_locations = true,
      updated_at = now()
  where id = transfer_row.previous_owner_membership_id
    and workspace_id = target_workspace_id
    and status = 'active';

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

  return jsonb_build_object(
    'status', 'accepted',
    'transfer_id', transfer_id,
    'workspace_id', target_workspace_id
  );
end;
$$;
create or replace function public.enforce_membership_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.workspace_role;
  bootstrap_allowed boolean;
begin
  if coalesce(current_setting('app.workspace_closure', true), '') = 'on' then
    return new;
  end if;

  if coalesce(current_setting('app.employee_invitation_accept', true), '') = 'on' then
    if tg_op = 'INSERT'
      and new.status = 'pending_activation'::public.membership_status
      and new.role <> 'owner'::public.workspace_role then
      return new;
    end if;

    if tg_op = 'UPDATE'
      and old.workspace_id = new.workspace_id
      and old.user_id = new.user_id
      and old.status = 'suspended'::public.membership_status
      and new.status = 'pending_activation'::public.membership_status
      and new.role <> 'owner'::public.workspace_role then
      return new;
    end if;
  end if;

  -- Only the accepted transfer's two immutable, active participant rows may
  -- bypass ordinary role editing. The service validates and locks the transfer.
  if tg_op = 'UPDATE' and coalesce(current_setting('app.owner_transfer', true), '') = 'on'
    and new.workspace_id = old.workspace_id and new.user_id = old.user_id
    and new.status = 'active' and old.status = 'active'
    and exists (
      select 1 from public.workspace_ownership_transfers t
      where t.workspace_id = new.workspace_id and t.status = 'pending'
        and t.target_user_id = actor_id and t.expires_at > now()
        and (
          (t.target_membership_id = new.id and old.role = 'admin' and new.role = 'owner')
          or (t.previous_owner_membership_id = new.id and old.role = 'owner' and new.role = 'admin')
        )
    ) then return new; end if;

  if actor_id is null then return new; end if;

  if tg_op = 'INSERT' then
    select exists (
      select 1
      from public.workspaces workspace
      where workspace.id = new.workspace_id
        and workspace.created_by = actor_id
        and new.user_id = actor_id
        and new.role = 'owner'
        and not exists (
          select 1 from public.workspace_memberships existing
          where existing.workspace_id = new.workspace_id
        )
    ) into bootstrap_allowed;
    if bootstrap_allowed then return new; end if;
  end if;

  actor_role := public.workspace_role_for(new.workspace_id);
  if actor_role = 'owner' then return new; end if;
  if actor_role = 'admin' and new.role in ('manager', 'employee') then
    if tg_op = 'INSERT' or old.role in ('manager', 'employee') then return new; end if;
  end if;

  raise exception 'membership role change is not permitted' using errcode = '42501';
end;
$$;
create or replace function public.list_my_workspaces()
returns table (
  workspace_id uuid,
  workspace_name text,
  workspace_role public.workspace_role,
  membership_status public.membership_status,
  is_active boolean,
  onboarding_status public.onboarding_status,
  onboarding_current_step smallint,
  workspace_lifecycle_status public.workspace_lifecycle_status,
  closure_effective_at timestamptz,
  pending_ownership_transfer_id uuid,
  pending_ownership_transfer_role text,
  pending_ownership_transfer_expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    workspace.id,
    workspace.name,
    membership.role,
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
    transfer.id,
    case
      when transfer.id is null then null
      when transfer.target_user_id = (select auth.uid()) then 'target'
      else 'initiator'
    end,
    transfer.expires_at
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
    and workspace.lifecycle_status <> 'deleted'
    and (
      workspace.lifecycle_status <> 'closure_scheduled'
      or workspace.closure_effective_at > now()
    )
    and not (
      membership.status = 'suspended'::public.membership_status
      and exists (
        select 1
        from public.employee_access_snapshots snapshot
        where snapshot.membership_id = membership.id
          and snapshot.restored_at is null
      )
    )
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
