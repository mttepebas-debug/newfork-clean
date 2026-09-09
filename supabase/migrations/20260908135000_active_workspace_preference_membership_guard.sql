create or replace function public.enforce_active_workspace_preference_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.workspace_memberships membership
    where membership.user_id = new.user_id
      and membership.workspace_id = new.active_workspace_id
      and membership.status = 'active'
  ) then
    raise exception 'active workspace preference requires active membership'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_active_workspace_preference_membership_trigger
on public.user_workspace_preferences;

create trigger enforce_active_workspace_preference_membership_trigger
before insert or update of user_id, active_workspace_id
on public.user_workspace_preferences
for each row execute function public.enforce_active_workspace_preference_membership();

revoke all on function public.enforce_active_workspace_preference_membership()
from public, anon, authenticated;
