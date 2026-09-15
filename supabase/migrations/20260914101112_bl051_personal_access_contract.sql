-- Basic inbox/preferences remain available independently of organization grants.
update public.permissions set custom_grantable=true where key in ('notifications.read','notifications.read_own','notifications.preferences.write_own');
create or replace function public.service_actor_has_permission(actor_user_id uuid,target_workspace_id uuid,target_permission text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspace_memberships m
 where m.user_id=actor_user_id and m.workspace_id=target_workspace_id and m.status='active'
 and (target_permission in ('workspace.read','notifications.read','notifications.read_own','notifications.preferences.write_own')
   or exists(select 1 from public.workspace_role_permissions g where g.role_id=m.role_id and g.workspace_id=m.workspace_id and g.permission_key=target_permission))
 and (m.role<>'employee' or target_permission in ('workspace.read','schedule.read','announcements.read','notifications.read','notifications.read_own','notifications.preferences.write_own','time.capture.own','time.read.own','time.correction.request.own')));
$$;
