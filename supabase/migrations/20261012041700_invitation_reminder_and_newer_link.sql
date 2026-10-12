-- BL-767 + BL-922: the two ends of sending an invitation again.
--
-- Send reminder (Employees drawer, Access, on a waiting invitation) sends the
-- same link again and leaves its expiry alone (KARARLAR Employees S2). The
-- drawer has always called the delivery retry for it, and the retry only
-- answered an invitation whose first email had failed, so every reminder on
-- an invitation that went out fine was refused ("failed invitation not
-- found"). The retry now answers any open invitation and says which of the two
-- it was: `reminder` (the first email went out; the API words the email as a
-- reminder) or a retry of a failed first email. `attempt` numbers the email so
-- each one reaches the provider under its own idempotency key; the first
-- email's key is the invitation's id alone, and reusing it would have the
-- provider drop every reminder as a duplicate.
--
-- Resend opens a new invitation and takes back the one waiting before it, the
-- same `revoked` an admin's Revoke writes. The old email's link then read
-- "This invitation was withdrawn", which tells the person they are not
-- wanted (BL-922). The preview now tells the two apart without a new column:
-- a revoked invitation whose person has a waiting invitation to the same
-- address was replaced (K7, KARARLAR S-86: "A newer invitation was sent to
-- you. Open the latest email."). Only one invitation per person waits at a
-- time (employee_invitation_pending_idx), so that waiting one is the newer.
-- Revoke, decline and acceptance keep their own answers.

create or replace function public.load_employee_invitation_retry_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_row public.employee_invitations%rowtype;
  recovered_token text;
  reminder boolean;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'employee.invite', target_person => target_employee_id);

  select * into invitation_row
  from public.employee_invitations
  where workspace_id = target_workspace_id
    and employee_id = target_employee_id
    and status = 'pending'
  order by created_at desc
  limit 1
  for update;
  if invitation_row.id is not null
     and not app_private.can_invite_with_role(actor_user_id, target_workspace_id, invitation_row.role_id) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.rank', detail = 'employee.invite';
  end if;
  if invitation_row.id is null then
    raise exception 'open invitation not found' using errcode = 'P0002';
  end if;
  if invitation_row.expires_at <= now() then
    raise exception 'invitation expired; use Resend' using errcode = '22023';
  end if;

  select token into recovered_token
  from public.employee_invitation_delivery_secrets
  where invitation_id = invitation_row.id
    and workspace_id = invitation_row.workspace_id;
  if recovered_token is null then
    raise exception 'original invitation link is unavailable; use Resend'
      using errcode = 'P0002';
  end if;
  if invitation_row.token_hash <>
    encode(extensions.digest(recovered_token, 'sha256'), 'hex') then
    raise exception 'stored invitation token does not match'
      using errcode = '22023';
  end if;

  -- A failed first email is sent again as it was; anything else already
  -- reached (or is reaching) the person, so this one is a reminder.
  reminder := invitation_row.delivery_status <> 'failed';

  update public.employee_invitations
  set resend_count = resend_count + 1,
      updated_at = now()
  where id = invitation_row.id;

  insert into public.employee_events (
    workspace_id,
    employee_id,
    actor_user_id,
    action,
    summary
  ) values (
    target_workspace_id,
    target_employee_id,
    actor_user_id,
    case when reminder
      then 'employee.invitation_reminder_started'
      else 'employee.invitation_delivery_retry_started' end,
    case when reminder
      then 'Employee invitation reminder started'
      else 'Employee invitation delivery retry started' end
  );

  return jsonb_build_object(
    'id', invitation_row.id,
    'email', invitation_row.email,
    'token', recovered_token,
    'expires_at', invitation_row.expires_at,
    'reminder', reminder,
    'attempt', invitation_row.resend_count + 1
  );
end;
$$;

create or replace function public.preview_employee_invitation_service(invitation_token_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'state', case
          when invitation.status = 'pending'::public.employee_invitation_status
               and invitation.expires_at <= now()
            then 'expired'
          when invitation.status = 'revoked'::public.employee_invitation_status
               and exists (
                 select 1
                 from public.employee_invitations newer
                 where newer.employee_id = invitation.employee_id
                   and newer.workspace_id = invitation.workspace_id
                   and newer.email = invitation.email
                   and newer.status = 'pending'::public.employee_invitation_status
                   and newer.id <> invitation.id
               )
            then 'replaced'
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
      where invitation.token_hash = preview_employee_invitation_service.invitation_token_hash
      limit 1
    ),
    jsonb_build_object('state', 'not_found')
  );
$$;
