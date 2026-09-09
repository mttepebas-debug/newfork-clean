create or replace function public.protect_approved_signature_retention_policy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'approved'
    and not (
      tg_op = 'UPDATE'
      and new.name is not distinct from old.name
      and new.retention_trigger is not distinct from old.retention_trigger
      and new.duration_days is not distinct from old.duration_days
      and new.jurisdiction_scope is not distinct from old.jurisdiction_scope
      and new.authority_reference is not distinct from old.authority_reference
      and new.status = 'draft'
      and new.approved_by is null
      and new.approved_at is null
    )
    and (
      tg_op = 'DELETE'
      or new.name is distinct from old.name
      or new.retention_trigger is distinct from old.retention_trigger
      or new.duration_days is distinct from old.duration_days
      or new.jurisdiction_scope is distinct from old.jurisdiction_scope
      or new.authority_reference is distinct from old.authority_reference
      or new.status is distinct from old.status
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
    ) then
    raise exception 'approved retention policies are immutable' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.unapprove_signature_retention_policy(
  target_workspace_id uuid,
  target_policy_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_name text;
begin
  if actor_id is null
    or not public.workspace_has_permission(target_workspace_id, 'signature_templates.manage') then
    raise exception 'acknowledgement template management access required' using errcode = '42501';
  end if;

  update public.signature_retention_policies
  set status = 'draft', approved_by = null, approved_at = null, updated_at = now()
  where id = target_policy_id and workspace_id = target_workspace_id
    and status = 'approved' and archived_at is null
  returning name into target_name;
  if target_name is null then
    raise exception 'approved retention policy not found' using errcode = 'P0002';
  end if;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id, actor_id, 'signature_retention_policy.unapproved',
    'signature_retention_policy', target_policy_id::text,
    jsonb_build_object('name', target_name)
  );
end;
$$;

create or replace function public.unapprove_signature_retention_policy_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_policy_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  perform public.unapprove_signature_retention_policy(
    target_workspace_id,
    target_policy_id
  );
end;
$$;

revoke all on function public.unapprove_signature_retention_policy(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.unapprove_signature_retention_policy_service(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.unapprove_signature_retention_policy_service(uuid, uuid, uuid)
to service_role;

