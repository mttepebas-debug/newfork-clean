-- The account area has six tabs and no way to tell which of them wants
-- something. A document request and an invitation both sit behind a tab that
-- looks exactly like the four that want nothing.
--
-- One count per tab, from one call. A number here means somebody is waiting for
-- an answer from this person; it closes when the thing is done, not when the
-- tab is opened, so it cannot be cleared by looking at it.

create function public.count_account_attention_service(actor_user_id uuid)
returns table (documents integer, workspaces integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      -- Everything still theirs to act on. The states left out are the ones
      -- where acting is not possible: finished, with a reviewer, or closed.
      select count(*)
      from public.employee_onboarding_requirements requirement
      join public.employee_profiles employee
        on employee.id = requirement.employee_id
      join public.workspaces workspace
        on workspace.id = requirement.workspace_id
      where employee.user_id = actor_user_id
        and employee.archived_at is null
        and requirement.lifecycle_retired_at is null
        and workspace.lifecycle_status <> 'deleted'
        and app_private.document_obligation_state(requirement, now()) not in (
          'completed', 'pending_review', 'exempt', 'removed', 'paused'
        )
    )::integer,
    (
      -- Somebody asked and is waiting: an invitation addressed to this account,
      -- or an ownership transfer sent to it.
      (
        select count(*)
        from public.employee_invitations invitation
        join auth.users account on account.id = actor_user_id
        where invitation.status = 'pending'
          and invitation.expires_at > now()
          and lower(invitation.email) = lower(account.email)
      )
      + (
        select count(*)
        from public.workspace_ownership_transfers transfer
        where transfer.status = 'pending'
          and transfer.expires_at > now()
          and transfer.target_user_id = actor_user_id
      )
    )::integer;
$$;

revoke all on function public.count_account_attention_service(uuid)
  from public, anon, authenticated;
grant execute on function public.count_account_attention_service(uuid)
  to service_role;
