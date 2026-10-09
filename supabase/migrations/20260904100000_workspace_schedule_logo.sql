alter table public.workspaces
  add column logo_storage_path text,
  add column logo_file_name text,
  add column logo_updated_at timestamptz,
  add column schedule_logo_scale numeric(4, 2) not null default 1,
  add column schedule_logo_offset_x numeric(5, 2) not null default 0,
  add column schedule_logo_offset_y numeric(5, 2) not null default 0,
  add constraint workspaces_logo_file_name_check
    check (logo_file_name is null or char_length(btrim(logo_file_name)) between 1 and 255),
  add constraint workspaces_logo_storage_path_check
    check (
      logo_storage_path is null
      or logo_storage_path ~* '^[a-f0-9-]+/logo/[a-f0-9-]+\.(jpg|png|webp|svg)$'
    ),
  add constraint workspaces_schedule_logo_scale_check
    check (schedule_logo_scale between 0.25 and 4),
  add constraint workspaces_schedule_logo_offset_x_check
    check (schedule_logo_offset_x between -100 and 100),
  add constraint workspaces_schedule_logo_offset_y_check
    check (schedule_logo_offset_y between -100 and 100),
  add constraint workspaces_logo_metadata_check
    check (
      (logo_storage_path is null and logo_file_name is null and logo_updated_at is null)
      or (logo_storage_path is not null and logo_file_name is not null and logo_updated_at is not null)
    );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workspace-logos',
  'workspace-logos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy workspace_logos_insert_admin
on storage.objects for insert to authenticated
with check (
  bucket_id = 'workspace-logos'
  and (storage.foldername(name))[2] = 'logo'
  and (select public.can_manage_workspace(((storage.foldername(name))[1])::uuid))
);

create policy workspace_logos_update_admin
on storage.objects for update to authenticated
using (
  bucket_id = 'workspace-logos'
  and (storage.foldername(name))[2] = 'logo'
  and (select public.can_manage_workspace(((storage.foldername(name))[1])::uuid))
)
with check (
  bucket_id = 'workspace-logos'
  and (storage.foldername(name))[2] = 'logo'
  and (select public.can_manage_workspace(((storage.foldername(name))[1])::uuid))
);

create policy workspace_logos_delete_admin
on storage.objects for delete to authenticated
using (
  bucket_id = 'workspace-logos'
  and (storage.foldername(name))[2] = 'logo'
  and (select public.can_manage_workspace(((storage.foldername(name))[1])::uuid))
);

drop function public.resolve_active_workspace();
create function public.resolve_active_workspace()
returns table (
  user_id uuid,
  workspace_id uuid,
  workspace_name text,
  workspace_logo_storage_path text,
  workspace_logo_file_name text,
  workspace_logo_updated_at timestamptz,
  schedule_logo_scale numeric,
  schedule_logo_offset_x numeric,
  schedule_logo_offset_y numeric,
  membership_id uuid,
  workspace_role public.workspace_role,
  membership_role_id uuid,
  membership_role_name text,
  permission_keys text[],
  all_locations boolean,
  onboarding_status public.onboarding_status,
  onboarding_current_step smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    membership.user_id,
    workspace.id,
    workspace.name,
    workspace.logo_storage_path,
    workspace.logo_file_name,
    workspace.logo_updated_at,
    workspace.schedule_logo_scale,
    workspace.schedule_logo_offset_x,
    workspace.schedule_logo_offset_y,
    membership.id,
    membership.role,
    role.id,
    role.name,
    coalesce(
      array_agg(grant_row.permission_key order by permission.sort_order)
        filter (where grant_row.permission_key is not null),
      '{}'::text[]
    ),
    membership.all_locations,
    coalesce(onboarding.status, 'complete'::public.onboarding_status),
    coalesce(onboarding.current_step, 2::smallint)
  from public.workspace_memberships membership
  join public.workspaces workspace on workspace.id = membership.workspace_id
  join public.workspace_roles role on role.id = membership.role_id
  left join public.workspace_role_permissions grant_row on grant_row.role_id = role.id
  left join public.permissions permission on permission.key = grant_row.permission_key
  left join public.user_workspace_preferences preference on preference.user_id = membership.user_id
  left join public.workspace_onboarding onboarding on onboarding.workspace_id = workspace.id
  where membership.user_id = (select auth.uid())
    and membership.status = 'active'
  group by membership.id, workspace.id, role.id, preference.active_workspace_id,
    onboarding.status, onboarding.current_step
  order by (workspace.id = preference.active_workspace_id) desc, membership.created_at asc
  limit 1;
$$;

revoke all on function public.resolve_active_workspace() from public, anon;
grant execute on function public.resolve_active_workspace() to authenticated;
