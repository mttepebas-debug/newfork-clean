-- KATILIM-ONAY (KARARLAR S-231, Mert 2026-10-21): Settings > General, "New people wait for approval".
--
-- On: somebody who joins finishes their required details and documents, then a manager approves them
-- (Employees > the person > Approve) and they are in. Off: they are in as soon as they finish; a required
-- document still in review holds them as it does today, and its approval lets them in.
--
-- On by default, for new workspaces and for the ones that exist. The owner and admins change it, the same
-- right that writes the other organization settings (settings.organization.write, settings.general.manage;
-- GA-2, 20261008133054_organization_settings_stay_with_owner_and_admin).
--
-- A case copies the setting when it opens (snapshot_onboarding_final_approval) and keeps its copy; a change
-- of the setting reaches every case not yet approved, so an open case follows the setting as it is now.
-- Somebody approved never goes back to waiting.

-- 1. On by default --------------------------------------------------------------------------------------------

alter table public.employee_onboarding_settings alter column final_approval_required set default true;

update public.employee_onboarding_settings
set final_approval_required = true, updated_at = now()
where not final_approval_required;

-- A workspace without a row has never chosen: it waits for approval.
create or replace function public.employee_onboarding_final_approval_required(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select setting.final_approval_required
    from public.employee_onboarding_settings setting
    where setting.workspace_id = target_workspace_id
  ), true);
$$;

-- Open cases follow the setting as it is now. The revision stays: nothing the person sent changed.
update public.employee_onboarding_cases
set final_approval_required = true, updated_at = now()
where status <> 'approved'::public.employee_onboarding_case_status
  and not final_approval_required;

-- 2. Reading it -----------------------------------------------------------------------------------------------

-- Anybody in the workspace may know it (the table's own policy lets every member read it).
create function public.get_onboarding_approval_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.read');
  return jsonb_build_object(
    'final_approval_required', public.employee_onboarding_final_approval_required(target_workspace_id));
end;
$$;

-- 3. Changing it ----------------------------------------------------------------------------------------------

-- Turned off, the people waiting only for approval are let in at once, through the same activation the
-- person's own Submit uses (employee.auto_activated), with whoever turned it off as the one who let them in
-- (so the person hears they are in). Each one let in gets the onboarding history line a manager's Approve
-- writes (onboarding.activate, review_employee_onboarding_service), marked as coming from this change.
-- Somebody whose required document is still in review is not: the document's approval lets them in.
-- Turned on, the cases still open wait for approval too.
create function public.set_onboarding_approval_service(actor_user_id uuid, target_workspace_id uuid, approval_required boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  waiting record;
  activated integer := 0;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.organization.write');
  if approval_required is null then
    raise exception 'Choose whether new people wait for approval' using errcode = '22023';
  end if;

  -- The row is the lock: two changes of one workspace's setting run one after the other.
  insert into public.employee_onboarding_settings as setting (workspace_id, final_approval_required, updated_by, updated_at)
  values (target_workspace_id, approval_required, actor_user_id, now())
  on conflict (workspace_id) do update
    set final_approval_required = excluded.final_approval_required,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  update public.employee_onboarding_cases c
  set final_approval_required = approval_required, updated_at = now()
  where c.workspace_id = target_workspace_id
    and c.status <> 'approved'::public.employee_onboarding_case_status
    and c.final_approval_required is distinct from approval_required;

  if not approval_required then
    -- Waiting for approval alone: finished (submitted), not in yet, and nothing activation asks for left
    -- (the same two checks app_private.activate_employee_onboarding_case makes before it lets anyone in).
    for waiting in
      select c.id, c.employee_id
      from public.employee_onboarding_cases c
      join public.workspace_memberships m on m.id = c.membership_id
      where c.workspace_id = target_workspace_id
        and c.status = 'submitted'::public.employee_onboarding_case_status
        and m.status = 'pending_activation'
        and not exists (
          select 1 from public.employee_onboarding_requirements r
          where r.case_id = c.id and app_private.document_activation_blocked(r))
        and not exists (
          select 1 from public.employee_onboarding_requirements r
          where r.case_id = c.id
            and (r.kind <> 'document' or (r.publication_paused_at is null and not r.lifecycle_exempt
                 and r.lifecycle_closed_at is null and r.status <> 'superseded'))
            and r.required and r.blocks_activation
            and r.status <> 'completed'::public.employee_onboarding_requirement_status)
      order by c.id
      for update of c
    loop
      perform app_private.activate_employee_onboarding_case(waiting.id, actor_user_id, 'employee.auto_activated');
      insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id, metadata)
      values (target_workspace_id, waiting.employee_id, waiting.id, actor_user_id,
        'onboarding.activate', 'onboarding_case', waiting.id::text,
        jsonb_build_object('source', 'approval_setting_off'));
      activated := activated + 1;
    end loop;
  end if;

  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_workspace_id, actor_user_id, 'onboarding.approval_setting_changed', 'workspace', target_workspace_id::text,
    jsonb_build_object('final_approval_required', approval_required, 'activated', activated));

  return jsonb_build_object('final_approval_required', approval_required);
end;
$$;

revoke all on function public.get_onboarding_approval_service(uuid, uuid) from public;
revoke all on function public.set_onboarding_approval_service(uuid, uuid, boolean) from public;
grant execute on function public.get_onboarding_approval_service(uuid, uuid) to service_role;
grant execute on function public.set_onboarding_approval_service(uuid, uuid, boolean) to service_role;
