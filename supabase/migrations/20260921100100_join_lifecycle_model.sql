-- JOIN-002: one field answers "what state is this workspace in", a membership
-- remembers when it was last used, and it knows which employee record it is.

-- 0. The closure constraint listed the lifecycle values one by one, so the two
--    new ones have to be named in it. They carry no closure dates, exactly like
--    'active'; 'deleted' remains the state a closed workspace ends in.
alter table public.workspaces
  drop constraint if exists workspaces_closure_lifecycle_consistency;
alter table public.workspaces
  add constraint workspaces_closure_lifecycle_consistency check (
    (
      lifecycle_status in ('draft', 'active', 'suspended')
      and closure_scheduled_at is null
      and closure_effective_at is null
      and closed_at is null
      and closed_by is null
    )
    or (
      lifecycle_status = 'closure_scheduled'
      and closure_scheduled_at is not null
      and closure_effective_at is not null
      and closed_at is null
      and closed_by is null
    )
    or (
      lifecycle_status = 'deleted'
      and closed_at is not null
      and closed_by is not null
    )
  );

-- 1. A workspace whose setup is unfinished is a draft. Until now that fact was
--    read from a second table, so every caller had to join two rows to learn
--    one thing.
update public.workspaces workspace
set lifecycle_status = 'draft'
from public.workspace_onboarding onboarding
where onboarding.workspace_id = workspace.id
  and onboarding.status = 'incomplete'
  and workspace.lifecycle_status = 'active';

-- The two stay in step from here on. Only draft and active move: a suspended,
-- scheduled-for-closure or closed workspace is not brought back by its setup.
create or replace function app_private.sync_workspace_lifecycle_with_onboarding()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.status = 'complete'::public.onboarding_status then
    update public.workspaces
    set lifecycle_status = 'active'::public.workspace_lifecycle_status,
        updated_at = now()
    where id = new.workspace_id
      and lifecycle_status = 'draft'::public.workspace_lifecycle_status;
  else
    update public.workspaces
    set lifecycle_status = 'draft'::public.workspace_lifecycle_status,
        updated_at = now()
    where id = new.workspace_id
      and lifecycle_status = 'active'::public.workspace_lifecycle_status;
  end if;
  return new;
end;
$function$;

-- The name matters: triggers on a table fire in name order, and
-- set_active_workspace_when_owner_onboarding_completes_trigger refuses a
-- workspace that cannot be opened. The workspace has to stop being a draft
-- before that one looks at it.
drop trigger if exists workspace_onboarding_syncs_lifecycle on public.workspace_onboarding;
drop trigger if exists onboarding_syncs_workspace_lifecycle_trigger on public.workspace_onboarding;
create trigger onboarding_syncs_workspace_lifecycle_trigger
after insert or update of status on public.workspace_onboarding
for each row execute function app_private.sync_workspace_lifecycle_with_onboarding();

-- 2. The gate now reads the one field. A workspace with no setup row at all is
--    an existing workspace, which is why the default stays 'active'.
create or replace function app_private.workspace_allows_interactive_access(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.workspaces workspace
    where workspace.id = target_workspace_id
      and (
        workspace.lifecycle_status = 'active'
        or (
          workspace.lifecycle_status = 'closure_scheduled'
          and workspace.closure_effective_at > now()
        )
        or (
          workspace.lifecycle_status = 'draft'
          and current_setting('app.allow_incomplete_workspace_context', true) = 'on'
        )
      )
  );
$function$;

-- 3. The landing decision needs to know which workspace was used last, and a
--    membership needs to name the employee record it belongs to. Both were
--    missing: the first lived as a single active_workspace_id per account, the
--    second only existed in the opposite direction.
alter table public.workspace_memberships
  add column if not exists last_used_at timestamptz,
  add column if not exists employee_id uuid
    references public.employee_profiles(id) on delete set null;

-- The index goes in before the backfill. Postgres refuses to build an index on
-- a table that has pending trigger events in the same transaction, and the
-- backfill below queues them on every row it touches.
create index if not exists workspace_memberships_last_used_idx
  on public.workspace_memberships (user_id, last_used_at desc nulls last);

update public.workspace_memberships membership
set employee_id = employee.id
from public.employee_profiles employee
where employee.workspace_id = membership.workspace_id
  and employee.user_id = membership.user_id
  and employee.archived_at is null
  and membership.employee_id is null;

comment on column public.workspace_memberships.last_used_at is
  'When this membership was last opened. The landing decision picks the most recent one.';
comment on column public.workspace_memberships.employee_id is
  'The employee record this membership is. Null while the workspace has no record for the account.';
