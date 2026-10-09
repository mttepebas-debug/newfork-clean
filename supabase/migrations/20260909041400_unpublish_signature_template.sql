create or replace function public.protect_published_signature_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'published'
    and not (
      tg_op = 'UPDATE'
      and new.workspace_id is not distinct from old.workspace_id
      and new.template_id is not distinct from old.template_id
      and new.version_number is not distinct from old.version_number
      and new.title is not distinct from old.title
      and new.summary is not distinct from old.summary
      and new.execution_class is not distinct from old.execution_class
      and new.content_text is not distinct from old.content_text
      and new.content_digest is not distinct from old.content_digest
      and new.intent_statement is not distinct from old.intent_statement
      and new.locale is not distinct from old.locale
      and new.effective_date is not distinct from old.effective_date
      and new.required_at_onboarding is not distinct from old.required_at_onboarding
      and new.blocks_activation is not distinct from old.blocks_activation
      and new.retention_policy_id is not distinct from old.retention_policy_id
      and new.status = 'draft'
      and new.published_by is null
      and new.published_at is null
    ) then
    raise exception 'published acknowledgement versions are immutable' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.unpublish_signature_template(
  target_workspace_id uuid,
  target_template_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  published_record public.signature_template_versions%rowtype;
begin
  if actor_id is null
    or not public.workspace_has_permission(target_workspace_id, 'signature_templates.manage') then
    raise exception 'acknowledgement template management access required' using errcode = '42501';
  end if;

  select version.* into published_record
  from public.signature_template_versions version
  join public.signature_templates template on template.id = version.template_id
  where version.workspace_id = target_workspace_id
    and version.template_id = target_template_id
    and version.status = 'published'
    and template.archived_at is null
  order by version.version_number desc
  limit 1
  for update of version;

  if published_record.id is null then
    raise exception 'published acknowledgement template not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.signature_template_versions draft
    where draft.template_id = target_template_id
      and draft.status = 'draft'
      and draft.id <> published_record.id
  ) then
    raise exception 'draft acknowledgement already exists' using errcode = '23505';
  end if;

  update public.signature_template_versions
  set status = 'draft', published_by = null, published_at = null, updated_at = now()
  where id = published_record.id;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id, actor_id, 'signature_template.unpublished',
    'signature_template', target_template_id::text,
    jsonb_build_object(
      'version_id', published_record.id,
      'version_number', published_record.version_number,
      'content_digest', published_record.content_digest
    )
  );
end;
$$;

create or replace function public.unpublish_signature_template_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_template_id uuid
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

  perform public.unpublish_signature_template(
    target_workspace_id,
    target_template_id
  );
end;
$$;

revoke all on function public.unpublish_signature_template(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.unpublish_signature_template_service(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.unpublish_signature_template_service(uuid, uuid, uuid)
to service_role;
