create or replace function public.delete_schedule_draft_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_draft_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  target_draft public.schedule_drafts%rowtype;
begin
  if not public.schedule_actor_can_manage_service(
    actor_user_id,
    target_workspace_id
  ) then
    raise exception 'schedule manage access required' using errcode='42501';
  end if;

  select * into target_draft
  from public.schedule_drafts draft
  where draft.id = target_draft_id
    and draft.workspace_id = target_workspace_id
    and draft.archived_at is null
  for update;

  if target_draft.id is null then
    raise exception 'schedule draft not found' using errcode='P0002';
  end if;

  -- Published shifts are independent snapshots. Archiving the named draft only
  -- hides the editable copy; retain its row and source links for publication history.
  update public.schedule_drafts
     set archived_at = now(),
         updated_by = actor_user_id,
         updated_at = now()
   where id = target_draft_id
     and workspace_id = target_workspace_id;

  return jsonb_build_object(
    'status', 'deleted',
    'draft_id', target_draft_id
  );
end;
$$;

revoke all on function public.delete_schedule_draft_service(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;

grant execute on function public.delete_schedule_draft_service(
  uuid,
  uuid,
  uuid
) to service_role;
