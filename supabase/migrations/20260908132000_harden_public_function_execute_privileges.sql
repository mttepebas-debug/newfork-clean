-- Lock down the implicit RPC surface for SECURITY DEFINER functions.
-- Intentional client-facing RPCs keep their explicit role grants in earlier migrations.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from authenticated;

create or replace function public.list_employees_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  include_archived boolean default false,
  search_text text default '',
  status_filter text default 'all',
  page_limit integer default 100,
  page_offset integer default 0
)
returns table (
  id uuid,
  workspace_id uuid,
  employee_code text,
  first_name text,
  last_name text,
  preferred_name text,
  display_name text,
  invitation_email text,
  start_date date,
  primary_location_id uuid,
  primary_location_name text,
  location_count bigint,
  primary_job_id uuid,
  primary_job_name text,
  job_count bigint,
  role_name text,
  display_status text,
  archived_at timestamptz,
  revision integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  return query
  select *
  from public.list_employees(
    target_workspace_id,
    include_archived,
    search_text,
    status_filter,
    page_limit,
    page_offset
  );
end;
$$;

create or replace function public.get_employee_detail_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  return public.get_employee_detail(target_workspace_id, target_employee_id);
end;
$$;

create or replace function public.save_employee_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  employee_first_name text,
  employee_last_name text,
  employee_preferred_name text,
  employee_invitation_email text,
  employee_start_date date,
  employee_internal_note text,
  location_ids uuid[],
  primary_location_id uuid,
  job_ids uuid[],
  primary_job_id uuid,
  expected_revision integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  return public.save_employee(
    target_workspace_id,
    target_employee_id,
    employee_first_name,
    employee_last_name,
    employee_preferred_name,
    employee_invitation_email,
    employee_start_date,
    employee_internal_note,
    location_ids,
    primary_location_id,
    job_ids,
    primary_job_id,
    expected_revision
  );
end;
$$;

create or replace function public.set_employee_archived_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  should_archive boolean,
  restore_access boolean default false
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

  perform public.set_employee_archived(
    target_workspace_id,
    target_employee_id,
    should_archive,
    restore_access
  );
end;
$$;

create or replace function public.terminate_employee_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  effective_local timestamp without time zone,
  worksite_timezone text,
  time_entry_action text,
  termination_reason text,
  target_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  return public.terminate_employee(
    target_workspace_id,
    target_employee_id,
    effective_local,
    worksite_timezone,
    time_entry_action,
    termination_reason,
    target_idempotency_key
  );
end;
$$;

revoke execute on function public.list_employees(uuid, boolean, text, text, integer, integer)
from authenticated;
revoke execute on function public.get_employee_detail(uuid, uuid)
from authenticated;
revoke execute on function public.save_employee(uuid, uuid, text, text, text, text, date, text, uuid[], uuid, uuid[], uuid, integer)
from authenticated;
revoke execute on function public.set_employee_archived(uuid, uuid, boolean, boolean)
from authenticated;
revoke execute on function public.terminate_employee(uuid, uuid, timestamp without time zone, text, text, text, uuid)
from authenticated;

revoke all on function public.list_employees_service(uuid, uuid, boolean, text, text, integer, integer)
from public, anon, authenticated;
revoke all on function public.get_employee_detail_service(uuid, uuid, uuid)
from public, anon, authenticated;
revoke all on function public.save_employee_service(uuid, uuid, uuid, text, text, text, text, date, text, uuid[], uuid, uuid[], uuid, integer)
from public, anon, authenticated;
revoke all on function public.set_employee_archived_service(uuid, uuid, uuid, boolean, boolean)
from public, anon, authenticated;
revoke all on function public.terminate_employee_service(uuid, uuid, uuid, timestamp without time zone, text, text, text, uuid)
from public, anon, authenticated;

grant execute on function public.list_employees_service(uuid, uuid, boolean, text, text, integer, integer)
to service_role;
grant execute on function public.get_employee_detail_service(uuid, uuid, uuid)
to service_role;
grant execute on function public.save_employee_service(uuid, uuid, uuid, text, text, text, text, date, text, uuid[], uuid, uuid[], uuid, integer)
to service_role;
grant execute on function public.set_employee_archived_service(uuid, uuid, uuid, boolean, boolean)
to service_role;
grant execute on function public.terminate_employee_service(uuid, uuid, uuid, timestamp without time zone, text, text, text, uuid)
to service_role;

create or replace function public.save_document_type_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_document_type_id uuid,
  document_title text,
  document_description text,
  is_required_at_onboarding boolean,
  is_review_required boolean,
  document_formats text[],
  should_track_expiry boolean,
  warning_days integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  return public.save_document_type(
    target_workspace_id,
    target_document_type_id,
    document_title,
    document_description,
    is_required_at_onboarding,
    is_review_required,
    document_formats,
    should_track_expiry,
    warning_days
  );
end;
$$;

create or replace function public.set_document_type_archived_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_document_type_id uuid,
  should_archive boolean
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

  perform public.set_document_type_archived(
    target_workspace_id,
    target_document_type_id,
    should_archive
  );
end;
$$;

create or replace function public.reorder_document_types_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  ordered_ids uuid[]
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

  perform public.reorder_document_types(target_workspace_id, ordered_ids);
end;
$$;

revoke execute on function public.save_document_type(uuid, uuid, text, text, boolean, boolean, text[], boolean, integer)
from authenticated;
revoke execute on function public.set_document_type_archived(uuid, uuid, boolean)
from authenticated;
revoke execute on function public.reorder_document_types(uuid, uuid[])
from authenticated;

revoke all on function public.save_document_type_service(uuid, uuid, uuid, text, text, boolean, boolean, text[], boolean, integer)
from public, anon, authenticated;
revoke all on function public.set_document_type_archived_service(uuid, uuid, uuid, boolean)
from public, anon, authenticated;
revoke all on function public.reorder_document_types_service(uuid, uuid, uuid[])
from public, anon, authenticated;

grant execute on function public.save_document_type_service(uuid, uuid, uuid, text, text, boolean, boolean, text[], boolean, integer)
to service_role;
grant execute on function public.set_document_type_archived_service(uuid, uuid, uuid, boolean)
to service_role;
grant execute on function public.reorder_document_types_service(uuid, uuid, uuid[])
to service_role;

create or replace function public.save_workspace_role_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_role_id uuid,
  role_name text,
  role_description text,
  role_access_class public.workspace_role,
  permission_keys text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  return public.save_workspace_role(
    target_workspace_id,
    target_role_id,
    role_name,
    role_description,
    role_access_class,
    permission_keys
  );
end;
$$;

create or replace function public.delete_workspace_role_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_role_id uuid
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

  perform public.delete_workspace_role(target_workspace_id, target_role_id);
end;
$$;

revoke execute on function public.save_workspace_role(uuid, uuid, text, text, public.workspace_role, text[])
from authenticated;
revoke execute on function public.delete_workspace_role(uuid, uuid)
from authenticated;

revoke all on function public.save_workspace_role_service(uuid, uuid, uuid, text, text, public.workspace_role, text[])
from public, anon, authenticated;
revoke all on function public.delete_workspace_role_service(uuid, uuid, uuid)
from public, anon, authenticated;

grant execute on function public.save_workspace_role_service(uuid, uuid, uuid, text, text, public.workspace_role, text[])
to service_role;
grant execute on function public.delete_workspace_role_service(uuid, uuid, uuid)
to service_role;

create or replace function public.save_signature_retention_policy_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_policy_id uuid,
  policy_name text,
  policy_trigger text,
  policy_duration_days integer,
  policy_jurisdiction_scope text,
  policy_authority_reference text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  return public.save_signature_retention_policy(
    target_workspace_id,
    target_policy_id,
    policy_name,
    policy_trigger,
    policy_duration_days,
    policy_jurisdiction_scope,
    policy_authority_reference
  );
end;
$$;

create or replace function public.approve_signature_retention_policy_service(
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

  perform public.approve_signature_retention_policy(
    target_workspace_id,
    target_policy_id
  );
end;
$$;

create or replace function public.set_signature_retention_policy_archived_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_policy_id uuid,
  should_archive boolean
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

  perform public.set_signature_retention_policy_archived(
    target_workspace_id,
    target_policy_id,
    should_archive
  );
end;
$$;

create or replace function public.save_signature_template_draft_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_template_id uuid,
  template_name text,
  template_summary text,
  template_content text,
  template_intent_statement text,
  template_locale text,
  template_effective_date date,
  is_required_at_onboarding boolean,
  should_block_activation boolean,
  target_retention_policy_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  return public.save_signature_template_draft(
    target_workspace_id,
    target_template_id,
    template_name,
    template_summary,
    template_content,
    template_intent_statement,
    template_locale,
    template_effective_date,
    is_required_at_onboarding,
    should_block_activation,
    target_retention_policy_id
  );
end;
$$;

create or replace function public.publish_signature_template_service(
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

  perform public.publish_signature_template(
    target_workspace_id,
    target_template_id
  );
end;
$$;

create or replace function public.set_signature_template_archived_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_template_id uuid,
  should_archive boolean
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

  perform public.set_signature_template_archived(
    target_workspace_id,
    target_template_id,
    should_archive
  );
end;
$$;

revoke execute on function public.save_signature_retention_policy(uuid, uuid, text, text, integer, text, text)
from authenticated;
revoke execute on function public.approve_signature_retention_policy(uuid, uuid)
from authenticated;
revoke execute on function public.set_signature_retention_policy_archived(uuid, uuid, boolean)
from authenticated;
revoke execute on function public.save_signature_template_draft(uuid, uuid, text, text, text, text, text, date, boolean, boolean, uuid)
from authenticated;
revoke execute on function public.publish_signature_template(uuid, uuid)
from authenticated;
revoke execute on function public.set_signature_template_archived(uuid, uuid, boolean)
from authenticated;

revoke all on function public.save_signature_retention_policy_service(uuid, uuid, uuid, text, text, integer, text, text)
from public, anon, authenticated;
revoke all on function public.approve_signature_retention_policy_service(uuid, uuid, uuid)
from public, anon, authenticated;
revoke all on function public.set_signature_retention_policy_archived_service(uuid, uuid, uuid, boolean)
from public, anon, authenticated;
revoke all on function public.save_signature_template_draft_service(uuid, uuid, uuid, text, text, text, text, text, date, boolean, boolean, uuid)
from public, anon, authenticated;
revoke all on function public.publish_signature_template_service(uuid, uuid, uuid)
from public, anon, authenticated;
revoke all on function public.set_signature_template_archived_service(uuid, uuid, uuid, boolean)
from public, anon, authenticated;

grant execute on function public.save_signature_retention_policy_service(uuid, uuid, uuid, text, text, integer, text, text)
to service_role;
grant execute on function public.approve_signature_retention_policy_service(uuid, uuid, uuid)
to service_role;
grant execute on function public.set_signature_retention_policy_archived_service(uuid, uuid, uuid, boolean)
to service_role;
grant execute on function public.save_signature_template_draft_service(uuid, uuid, uuid, text, text, text, text, text, date, boolean, boolean, uuid)
to service_role;
grant execute on function public.publish_signature_template_service(uuid, uuid, uuid)
to service_role;
grant execute on function public.set_signature_template_archived_service(uuid, uuid, uuid, boolean)
to service_role;

create or replace function public.reorder_organization_entities_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  entity_type text,
  ordered_ids uuid[]
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

  perform public.reorder_organization_entities(
    target_workspace_id,
    entity_type,
    ordered_ids
  );
end;
$$;

create or replace function public.reorder_shift_types_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  ordered_ids uuid[]
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

  perform public.reorder_shift_types(target_workspace_id, ordered_ids);
end;
$$;

revoke execute on function public.reorder_organization_entities(uuid, text, uuid[])
from authenticated;
revoke execute on function public.reorder_shift_types(uuid, uuid[])
from authenticated;

revoke all on function public.reorder_organization_entities_service(uuid, uuid, text, uuid[])
from public, anon, authenticated;
revoke all on function public.reorder_shift_types_service(uuid, uuid, uuid[])
from public, anon, authenticated;

grant execute on function public.reorder_organization_entities_service(uuid, uuid, text, uuid[])
to service_role;
grant execute on function public.reorder_shift_types_service(uuid, uuid, uuid[])
to service_role;

create or replace function public.create_owner_workspace_service(
  actor_user_id uuid,
  workspace_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  return public.create_owner_workspace(workspace_name);
end;
$$;

create or replace function public.set_active_workspace_service(
  actor_user_id uuid,
  target_workspace_id uuid
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

  perform public.set_active_workspace(target_workspace_id);
end;
$$;

create or replace function public.update_owner_onboarding_service(
  actor_user_id uuid,
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
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  perform public.update_owner_onboarding(
    target_workspace_id,
    workspace_name,
    next_step,
    mark_complete
  );
end;
$$;

create or replace function public.list_my_workspaces_service(actor_user_id uuid)
returns table (
  workspace_id uuid,
  workspace_name text,
  workspace_role public.workspace_role,
  is_active boolean,
  onboarding_status public.onboarding_status,
  onboarding_current_step smallint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  return query
  select *
  from public.list_my_workspaces();
end;
$$;

create or replace function public.resolve_active_workspace_service(actor_user_id uuid)
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
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);

  return query
  select *
  from public.resolve_active_workspace();
end;
$$;

revoke execute on function public.create_owner_workspace(text)
from authenticated;
revoke execute on function public.set_active_workspace(uuid)
from authenticated;
revoke execute on function public.update_owner_onboarding(uuid, text, smallint, boolean)
from authenticated;
revoke execute on function public.list_my_workspaces()
from authenticated;
revoke execute on function public.resolve_active_workspace()
from authenticated;

revoke all on function public.create_owner_workspace_service(uuid, text)
from public, anon, authenticated;
revoke all on function public.set_active_workspace_service(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.update_owner_onboarding_service(uuid, uuid, text, smallint, boolean)
from public, anon, authenticated;
revoke all on function public.list_my_workspaces_service(uuid)
from public, anon, authenticated;
revoke all on function public.resolve_active_workspace_service(uuid)
from public, anon, authenticated;

grant execute on function public.create_owner_workspace_service(uuid, text)
to service_role;
grant execute on function public.set_active_workspace_service(uuid, uuid)
to service_role;
grant execute on function public.update_owner_onboarding_service(uuid, uuid, text, smallint, boolean)
to service_role;
grant execute on function public.list_my_workspaces_service(uuid)
to service_role;
grant execute on function public.resolve_active_workspace_service(uuid)
to service_role;

-- Repair the time-format migration's audit trigger body so it writes to the
-- existing audit_events target_type/target_id columns.
create or replace function public.audit_scheduling_settings_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if row(
    new.week_start_day,
    new.schedule_deadline_day,
    new.conflict_policy,
    new.availability_enforcement,
    new.time_format
  ) is distinct from row(
    old.week_start_day,
    old.schedule_deadline_day,
    old.conflict_policy,
    old.availability_enforcement,
    old.time_format
  ) and (select auth.uid()) is not null then
    insert into public.audit_events (
      workspace_id,
      actor_user_id,
      action,
      target_type,
      target_id,
      metadata
    ) values (
      new.workspace_id,
      (select auth.uid()),
      'scheduling.settings_updated',
      'scheduling_settings',
      new.workspace_id::text,
      jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
    );
  end if;
  return new;
end;
$$;

-- These schedule helpers are called by the API's service-role client or by
-- other database functions. They should not be directly callable as user RPCs.
revoke execute on function public.preview_schedule_publication_service(uuid, uuid, uuid, uuid[])
from authenticated;
revoke execute on function public.preview_schedule_publication_service(uuid, uuid, uuid, uuid[], uuid[], boolean)
from authenticated;
revoke execute on function public.publish_schedule_draft_service_label_base(uuid, uuid, uuid, uuid[], integer, text, jsonb)
from authenticated;
revoke execute on function public.schedule_shift_in_department_scope_service(uuid, uuid[], boolean)
from authenticated;

grant execute on function public.preview_schedule_publication_service(uuid, uuid, uuid, uuid[])
to service_role;
grant execute on function public.preview_schedule_publication_service(uuid, uuid, uuid, uuid[], uuid[], boolean)
to service_role;
grant execute on function public.publish_schedule_draft_service_label_base(uuid, uuid, uuid, uuid[], integer, text, jsonb)
to service_role;
grant execute on function public.schedule_shift_in_department_scope_service(uuid, uuid[], boolean)
to service_role;

-- The remaining authenticated SECURITY DEFINER functions are intentional for
-- now: current web clients call several settings/workspace RPCs directly, and
-- the workspace helper functions are referenced by RLS policies. Tightening
-- those requires moving the affected browser RPCs behind API service-role
-- routes or replacing the RLS helper contract first.
