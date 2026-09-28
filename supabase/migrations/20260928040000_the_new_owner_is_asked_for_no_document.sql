-- BL-246 (user, 2026-09-28): the person who becomes owner by a transfer is
-- asked for no document from then on, like any owner. Accepting the transfer
-- excuses what they still owed, and a document block lifts with it.
--
-- BL-252 (user, 2026-09-28): only somebody with a live employee record in the
-- workspace can accept, so the Owner job always has somebody to go to.
-- Starting a transfer already asks for one; accepting asks again, as it does
-- for the rest of the target's eligibility.

-- What excusing an owner's document means, in one place: the documents that
-- reach an owner (z_owner_documents_arrive_excused) and the ones a new owner
-- still owed when the transfer was accepted.
create function app_private.owner_document_excused(requirement public.employee_onboarding_requirements)
returns public.employee_onboarding_requirements
language plpgsql
immutable
set search_path = ''
as $$
begin
  requirement.lifecycle_exempt := true;
  requirement.required := false;
  requirement.blocks_activation := false;
  requirement.deadline_at := null;
  requirement.lifecycle_close_reason :=
    'An owner is not asked for the documents they ask of everyone else';
  return requirement;
end;
$$;
revoke all on function app_private.owner_document_excused(public.employee_onboarding_requirements)
  from public, anon, authenticated;

create or replace function app_private.owner_documents_arrive_excused()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind in ('document', 'acknowledgement')
    and not coalesce(new.lifecycle_exempt, false)
    and app_private.employee_record_is_workspace_owner(new.workspace_id, new.employee_id)
  then
    new := app_private.owner_document_excused(new);
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.respond_workspace_ownership_transfer_service(actor_user_id uuid, target_workspace_id uuid, transfer_id uuid, transfer_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  transfer_row public.workspace_ownership_transfers%rowtype;
  owner_role_id uuid;
  admin_role_id uuid;
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
      -- The owner works the Owner job on their own record (BL-252), so only
      -- somebody with a live record here takes ownership.
      and exists (select 1 from public.employee_profiles employee
        where employee.workspace_id = m.workspace_id and employee.user_id = m.user_id
          and employee.archived_at is null)
  ) or not exists (
    select 1 from public.workspace_memberships m
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    where m.id = transfer_row.previous_owner_membership_id and m.workspace_id = target_workspace_id
      and m.user_id = transfer_row.initiated_by and m.status = 'active' and coalesce(r.access_class, m.role) = 'owner'
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
  -- owner later is, and the document block lifts with it.
  update public.employee_onboarding_requirements requirement
  set (lifecycle_exempt, required, blocks_activation, deadline_at, lifecycle_close_reason) = (
        select excused.lifecycle_exempt, excused.required, excused.blocks_activation,
          excused.deadline_at, excused.lifecycle_close_reason
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
    and requirement.lifecycle_retired_at is null;

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
$function$
;
