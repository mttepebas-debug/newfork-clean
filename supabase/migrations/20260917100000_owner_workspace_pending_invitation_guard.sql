-- AUTH-002: an account with a pending invitation and no owner membership is an
-- invitee; it must resolve the invitation before creating its own workspace.
create or replace function public.create_owner_workspace_service(actor_user_id uuid, workspace_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;
  -- Serialize create attempts for one account, preserving incomplete-draft reuse.
  perform 1 from auth.users where id = actor_user_id for update;
  if not found then raise exception 'authentication required' using errcode = '42501'; end if;
  -- Same email match and expiry filter as list_pending_employee_invitations_for_account_service.
  if not exists (
    select 1 from public.workspace_memberships m
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    where m.user_id = actor_user_id and m.status = 'active'
      and coalesce(r.access_class, m.role) = 'owner'
  ) and exists (
    select 1
    from public.employee_invitations invitation
    join auth.users user_row on user_row.id = actor_user_id
    where invitation.email = lower(user_row.email)
      and invitation.status = 'pending'
      and invitation.expires_at > now()
      and not exists (
        select 1 from public.workspace_memberships membership
        where membership.workspace_id = invitation.workspace_id
          and membership.user_id = actor_user_id
      )
  ) then
    raise exception 'pending invitation must be resolved first' using errcode = '42501';
  end if;
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

revoke all on function public.create_owner_workspace_service(uuid, text) from public, anon, authenticated;
grant execute on function public.create_owner_workspace_service(uuid, text) to service_role;
