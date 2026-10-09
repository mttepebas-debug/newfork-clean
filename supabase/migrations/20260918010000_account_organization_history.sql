-- AUTH-005: an account that has never been linked to an organization is a new
-- visitor; one that lost its last link is a returning user. The two must not see
-- the same landing screen, and list_my_workspaces cannot answer the question
-- because it filters archived, suspended and closed links out.
create table public.account_organization_history (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_linked_at timestamptz not null default now()
);

alter table public.account_organization_history enable row level security;
revoke all on public.account_organization_history from public, anon, authenticated;
grant select on public.account_organization_history to authenticated;
grant all on public.account_organization_history to service_role;

create policy account_organization_history_self_read
  on public.account_organization_history
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Every link starts as a membership row: invitation acceptance, owner workspace
-- creation, and any future path all pass through here. The mark is written once
-- and never removed, so losing the membership later still reads as "returning".
create or replace function app_private.mark_account_organization_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.account_organization_history (user_id, first_linked_at)
  values (new.user_id, now())
  on conflict (user_id) do nothing;
  return new;
end; $$;

create trigger workspace_memberships_mark_account_history
  after insert on public.workspace_memberships
  for each row execute function app_private.mark_account_organization_history();

insert into public.account_organization_history (user_id, first_linked_at)
select membership.user_id, min(membership.created_at)
from public.workspace_memberships membership
group by membership.user_id
on conflict (user_id) do nothing;
