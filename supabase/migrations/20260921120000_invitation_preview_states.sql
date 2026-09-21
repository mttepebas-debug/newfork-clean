-- JOIN-004: an invitation link has more than two outcomes, and the screen that
-- opens it could only tell two apart. Expired, revoked, declined, already
-- accepted and "the workspace is not open" all arrived as the same empty
-- answer, which the API turned into the same 404 and the page into the same
-- sentence. The preview now names the state it found.
--
-- The pending filter is gone on purpose: holding the token is what earns the
-- answer, and an answer that says "this one was already accepted" is the point.
create or replace function public.preview_employee_invitation_service(invitation_token_hash text)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    (
      select jsonb_build_object(
        'state', case
          when invitation.status = 'pending'::public.employee_invitation_status
               and invitation.expires_at <= now()
            then 'expired'
          when invitation.status <> 'pending'::public.employee_invitation_status
            then invitation.status::text
          when workspace.lifecycle_status <> 'active'::public.workspace_lifecycle_status
               and not (
                 workspace.lifecycle_status = 'closure_scheduled'::public.workspace_lifecycle_status
                 and workspace.closure_effective_at > now()
               )
            then 'workspace_unavailable'
          else 'valid'
        end,
        'workspace_name', workspace.name,
        'email', invitation.email,
        'expires_at', invitation.expires_at
      )
      from public.employee_invitations invitation
      join public.workspaces workspace on workspace.id = invitation.workspace_id
      where invitation.token_hash = invitation_token_hash
      limit 1
    ),
    jsonb_build_object('state', 'not_found')
  );
$function$;
