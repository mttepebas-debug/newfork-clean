create or replace function public.set_active_workspace_when_owner_onboarding_completes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'complete'::public.onboarding_status then
    return new;
  end if;

  if not exists (
    select 1
    from public.workspace_memberships membership
    join public.workspaces workspace
      on workspace.id = membership.workspace_id
    where membership.workspace_id = new.workspace_id
      and membership.user_id = new.updated_by
      and membership.role = 'owner'::public.workspace_role
      and membership.status = 'active'::public.membership_status
      and workspace.lifecycle_status = 'active'::public.workspace_lifecycle_status
  ) then
    return new;
  end if;

  insert into public.user_workspace_preferences (user_id, active_workspace_id, updated_at)
  values (new.updated_by, new.workspace_id, now())
  on conflict (user_id) do update
    set active_workspace_id = excluded.active_workspace_id,
        updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists set_active_workspace_when_owner_onboarding_completes_trigger
on public.workspace_onboarding;

create trigger set_active_workspace_when_owner_onboarding_completes_trigger
after update of status on public.workspace_onboarding
for each row
when (
  old.status is distinct from 'complete'::public.onboarding_status
  and new.status = 'complete'::public.onboarding_status
)
execute function public.set_active_workspace_when_owner_onboarding_completes();

with eligible_single_workspace as (
  select
    membership.user_id,
    min(membership.workspace_id::text)::uuid as workspace_id
  from public.workspace_memberships membership
  join public.workspaces workspace
    on workspace.id = membership.workspace_id
  left join public.workspace_onboarding onboarding
    on onboarding.workspace_id = workspace.id
  left join public.user_workspace_preferences preference
    on preference.user_id = membership.user_id
  where membership.status = 'active'::public.membership_status
    and workspace.lifecycle_status = 'active'::public.workspace_lifecycle_status
    and coalesce(onboarding.status, 'complete'::public.onboarding_status) = 'complete'::public.onboarding_status
    and preference.user_id is null
  group by membership.user_id
  having count(*) = 1
)
insert into public.user_workspace_preferences (user_id, active_workspace_id, updated_at)
select user_id, workspace_id, now()
from eligible_single_workspace
on conflict (user_id) do nothing;

revoke all on function public.set_active_workspace_when_owner_onboarding_completes()
from public, anon, authenticated;
