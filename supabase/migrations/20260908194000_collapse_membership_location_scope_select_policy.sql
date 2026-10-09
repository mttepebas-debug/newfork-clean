drop policy if exists location_scopes_manage_admin
  on public.membership_location_scopes;

create policy location_scopes_insert_admin
on public.membership_location_scopes
for insert
to authenticated
with check ((select public.can_manage_workspace(workspace_id)));

create policy location_scopes_update_admin
on public.membership_location_scopes
for update
to authenticated
using ((select public.can_manage_workspace(workspace_id)))
with check ((select public.can_manage_workspace(workspace_id)));

create policy location_scopes_delete_admin
on public.membership_location_scopes
for delete
to authenticated
using ((select public.can_manage_workspace(workspace_id)));
