-- G18 slice c (BL-341). The Documents number on the account button counted
-- every onboarding requirement still open, and the profile and availability
-- steps of joining live in the same table: anybody with an employee record saw
-- at least 2 with no document at all (a finished profile step reads as
-- "missing" to document_obligation_state, which knows documents only).
--
-- The count now reads the kinds Account > Documents lists
-- (list_employee_document_lifecycle_service): documents and acknowledgements.
-- Nothing else changes: whose rows are counted, the states left out, the
-- workspaces number, the signature and the grants.

CREATE OR REPLACE FUNCTION public.count_account_attention_service(actor_user_id uuid)
 RETURNS TABLE(documents integer, workspaces integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    (
      -- Every document still theirs to act on. The states left out are the ones
      -- where acting is not possible: finished, with a reviewer, or closed.
      select count(*)
      from public.employee_onboarding_requirements requirement
      join public.employee_profiles employee
        on employee.id = requirement.employee_id
      join public.workspaces workspace
        on workspace.id = requirement.workspace_id
      where employee.user_id = actor_user_id
        and employee.archived_at is null
        and requirement.kind in ('document', 'acknowledgement')
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
          and account.email_confirmed_at is not null
      )
      + (
        select count(*)
        from public.workspace_ownership_transfers transfer
        where transfer.status = 'pending'
          and transfer.expires_at > now()
          and transfer.target_user_id = actor_user_id
      )
    )::integer;
$function$;
