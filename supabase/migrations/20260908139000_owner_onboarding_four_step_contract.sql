alter table public.workspace_onboarding
  drop constraint if exists workspace_onboarding_current_step_check;

alter table public.workspace_onboarding
  add constraint workspace_onboarding_current_step_check
  check (current_step between 1 and 4);

create or replace function public.update_owner_onboarding(
  target_workspace_id uuid,
  workspace_name text,
  next_step smallint,
  mark_complete boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null or public.workspace_role_for(target_workspace_id) <> 'owner' then
    raise exception 'owner access required' using errcode = '42501';
  end if;
  if char_length(btrim(workspace_name)) not between 1 and 120 then
    raise exception 'workspace name must be between 1 and 120 characters' using errcode = '22023';
  end if;
  if next_step not between 1 and 4 then
    raise exception 'invalid onboarding step' using errcode = '22023';
  end if;

  update public.workspaces
  set name = btrim(workspace_name), updated_at = now()
  where id = target_workspace_id;

  update public.workspace_onboarding
  set
    status = case
      when mark_complete then 'complete'::public.onboarding_status
      else 'incomplete'::public.onboarding_status
    end,
    current_step = next_step,
    completed_at = case when mark_complete then now() else null end,
    updated_by = actor_id,
    updated_at = now()
  where workspace_id = target_workspace_id;

  if not found then
    raise exception 'workspace onboarding was not found' using errcode = 'P0002';
  end if;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id,
    actor_id,
    case when mark_complete then 'workspace.onboarding_completed' else 'workspace.onboarding_saved' end,
    'workspace',
    target_workspace_id::text,
    jsonb_build_object('step', next_step)
  );
end;
$$;
