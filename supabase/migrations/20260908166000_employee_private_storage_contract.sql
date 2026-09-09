insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'employee-onboarding',
    'employee-onboarding',
    false,
    10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'employee-profile-photos',
    'employee-profile-photos',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

comment on table public.employee_documents is
  'Private employee onboarding document metadata. Object bytes live in the private employee-onboarding storage bucket and are served only through service-issued short-lived signed URLs.';

comment on column public.employee_documents.object_path is
  'Path inside employee-onboarding bucket: workspace_id/employee_id/requirement_id/object_uuid.ext.';

alter table public.employee_documents
  add constraint employee_documents_object_path_format_check
  check (
    object_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$'
  );

create or replace function app_private.is_employee_onboarding_document_path(
  candidate_path text,
  target_workspace_id uuid,
  target_employee_id uuid,
  target_requirement_id uuid
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(candidate_path, '') ~* (
    '^'
    || target_workspace_id::text
    || '/'
    || target_employee_id::text
    || '/'
    || target_requirement_id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$'
  );
$$;

revoke all on function app_private.is_employee_onboarding_document_path(text, uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function app_private.is_employee_onboarding_document_path(text, uuid, uuid, uuid)
to service_role;

create or replace function public.confirm_employee_document_service(
  target_user_id uuid,
  target_requirement_id uuid,
  storage_object_path text,
  upload_filename text,
  upload_media_type text,
  upload_size_bytes bigint,
  upload_expiry_date date,
  expected_revision integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_case public.employee_onboarding_cases%rowtype;
  requirement public.employee_onboarding_requirements%rowtype;
  next_version integer;
begin
  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  join public.employee_profiles employee on employee.id = onboarding.employee_id
  where employee.user_id = target_user_id
  for update of onboarding;

  if target_case.id is null or target_case.revision <> expected_revision then
    raise exception 'onboarding changed; refresh required' using errcode = '40001';
  end if;
  if not app_private.workspace_allows_interactive_access(target_case.workspace_id) then
    raise exception 'employee onboarding is unavailable' using errcode = 'P0002';
  end if;
  if not exists (
    select 1
    from public.workspace_memberships membership
    where membership.id = target_case.membership_id
      and membership.workspace_id = target_case.workspace_id
      and membership.user_id = target_user_id
      and membership.status in ('pending_activation', 'active')
  ) then
    raise exception 'employee onboarding is unavailable' using errcode = 'P0002';
  end if;

  select * into requirement
  from public.employee_onboarding_requirements
  where id = target_requirement_id
    and case_id = target_case.id
    and kind = 'document'::public.employee_onboarding_requirement_kind
  for update;

  if requirement.id is null then
    raise exception 'document requirement unavailable' using errcode = 'P0002';
  end if;
  if upload_media_type not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
    or upload_size_bytes not between 1 and 10485760
    or not app_private.is_employee_onboarding_document_path(
      storage_object_path,
      target_case.workspace_id,
      target_case.employee_id,
      target_requirement_id
    ) then
    raise exception 'invalid private document upload' using errcode = '22023';
  end if;

  select coalesce(max(version_number), 0) + 1
  into next_version
  from public.employee_documents
  where requirement_id = requirement.id;

  update public.employee_documents
  set review_status = 'superseded'::public.employee_document_review_status
  where requirement_id = requirement.id
    and review_status <> 'superseded'::public.employee_document_review_status;

  insert into public.employee_documents (
    workspace_id, employee_id, requirement_id, version_number, object_path,
    original_filename, media_type, size_bytes, review_status, expiry_date, uploaded_by
  ) values (
    target_case.workspace_id, target_case.employee_id, requirement.id, next_version,
    storage_object_path, upload_filename, upload_media_type, upload_size_bytes,
    case
      when requirement.requires_review then 'awaiting_review'::public.employee_document_review_status
      else 'accepted'::public.employee_document_review_status
    end,
    upload_expiry_date, target_user_id
  );

  update public.employee_onboarding_requirements
  set status = case
      when requires_review then 'awaiting_review'::public.employee_onboarding_requirement_status
      else 'completed'::public.employee_onboarding_requirement_status
    end,
    rejection_reason = null,
    completed_at = now(),
    updated_at = now()
  where id = requirement.id;

  update public.employee_onboarding_cases
  set status = 'in_progress'::public.employee_onboarding_case_status,
    revision = revision + 1,
    updated_at = now()
  where id = target_case.id
  returning revision into expected_revision;

  insert into public.onboarding_events (
    workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id, metadata
  )
  values (
    target_case.workspace_id, target_case.employee_id, target_case.id, target_user_id,
    'onboarding.document_uploaded', 'onboarding_requirement', requirement.id::text,
    jsonb_build_object('version', next_version, 'review_required', requirement.requires_review)
  );

  return expected_revision;
end;
$$;

create or replace function public.get_employee_document_path_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  target_requirement_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_path text;
begin
  if not app_private.workspace_allows_interactive_access(target_workspace_id) then
    raise exception 'employee document unavailable' using errcode = 'P0002';
  end if;
  if not public.service_actor_has_permission(actor_user_id, target_workspace_id, 'employee_documents.review') then
    raise exception 'employee document review required' using errcode = '42501';
  end if;
  if not public.service_actor_can_access_employee(actor_user_id, target_workspace_id, target_employee_id) then
    raise exception 'employee document unavailable' using errcode = 'P0002';
  end if;

  select document.object_path into document_path
  from public.employee_documents document
  join public.employee_onboarding_requirements requirement
    on requirement.id = document.requirement_id
  where document.workspace_id = target_workspace_id
    and document.employee_id = target_employee_id
    and document.requirement_id = target_requirement_id
    and requirement.kind = 'document'::public.employee_onboarding_requirement_kind
    and document.review_status <> 'superseded'::public.employee_document_review_status
  order by document.version_number desc
  limit 1;

  if document_path is null then
    raise exception 'employee document unavailable' using errcode = 'P0002';
  end if;

  return document_path;
end;
$$;

revoke all on function public.confirm_employee_document_service(uuid, uuid, text, text, text, bigint, date, integer)
from public, anon, authenticated;
revoke all on function public.get_employee_document_path_service(uuid, uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.confirm_employee_document_service(uuid, uuid, text, text, text, bigint, date, integer)
to service_role;
grant execute on function public.get_employee_document_path_service(uuid, uuid, uuid, uuid)
to service_role;
