create or replace function public.sync_expiring_document_todos_service(target_workspace_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
  resolved_count integer := 0;
begin
  with latest_documents as (
    select distinct on (document.workspace_id, document.requirement_id)
      document.*
    from public.employee_documents document
    where document.review_status <> 'superseded'::public.employee_document_review_status
      and (target_workspace_id is null or document.workspace_id = target_workspace_id)
    order by document.workspace_id, document.requirement_id, document.version_number desc
  ),
  eligible as (
    select
      document.workspace_id,
      document.id as document_id,
      document.employee_id,
      document.requirement_id,
      document.expiry_date,
      requirement.title as document_title,
      employee.first_name,
      employee.last_name,
      type.expiry_schedule_impact
    from latest_documents document
    join public.workspaces workspace
      on workspace.id = document.workspace_id
     and app_private.workspace_allows_interactive_access(workspace.id)
    join public.employee_onboarding_requirements requirement
      on requirement.id = document.requirement_id
     and requirement.workspace_id = document.workspace_id
     and requirement.kind = 'document'::public.employee_onboarding_requirement_kind
     and requirement.status <> 'superseded'::public.employee_onboarding_requirement_status
    join public.document_types type
      on type.id = requirement.source_id
     and type.workspace_id = document.workspace_id
     and type.archived_at is null
     and type.tracks_expiry
    join public.employee_profiles employee
      on employee.id = document.employee_id
     and employee.workspace_id = document.workspace_id
     and employee.archived_at is null
    where document.review_status = 'accepted'::public.employee_document_review_status
      and document.expiry_date is not null
      and document.expiry_date <= current_date + type.expiry_warning_days
  )
  insert into public.workspace_todos (
    workspace_id,
    title,
    body,
    severity,
    status,
    system_generated,
    source_type,
    source_id,
    source_key,
    employee_id,
    due_at,
    action_url,
    resolved_at
  )
  select
    eligible.workspace_id,
    case
      when eligible.expiry_date < current_date then 'Expired employee document'
      else 'Employee document expires soon'
    end,
    btrim(eligible.first_name || ' ' || eligible.last_name) || ' - ' || eligible.document_title,
    case
      when eligible.expiry_date < current_date then 'action_required'::public.workspace_todo_severity
      else 'warning'::public.workspace_todo_severity
    end,
    'open'::public.workspace_todo_status,
    true,
    'employee_document_expiry',
    eligible.document_id,
    'requirement:' || eligible.requirement_id::text,
    eligible.employee_id,
    eligible.expiry_date::timestamptz,
    '/app/employees',
    null
  from eligible
  on conflict (workspace_id, source_type, source_id, source_key)
  do update set
    title = excluded.title,
    body = excluded.body,
    severity = excluded.severity,
    status = 'open'::public.workspace_todo_status,
    employee_id = excluded.employee_id,
    due_at = excluded.due_at,
    action_url = excluded.action_url,
    resolved_at = null,
    updated_at = now()
  where public.workspace_todos.status <> 'open'::public.workspace_todo_status
     or public.workspace_todos.title <> excluded.title
     or public.workspace_todos.body <> excluded.body
     or public.workspace_todos.severity <> excluded.severity
     or public.workspace_todos.employee_id is distinct from excluded.employee_id
     or public.workspace_todos.due_at is distinct from excluded.due_at
     or public.workspace_todos.action_url is distinct from excluded.action_url;
  get diagnostics inserted_count = row_count;

  with latest_documents as (
    select distinct on (document.workspace_id, document.requirement_id)
      document.*
    from public.employee_documents document
    where document.review_status <> 'superseded'::public.employee_document_review_status
      and (target_workspace_id is null or document.workspace_id = target_workspace_id)
    order by document.workspace_id, document.requirement_id, document.version_number desc
  ),
  eligible as (
    select document.workspace_id, document.id as document_id, document.requirement_id
    from latest_documents document
    join public.workspaces workspace
      on workspace.id = document.workspace_id
     and app_private.workspace_allows_interactive_access(workspace.id)
    join public.employee_onboarding_requirements requirement
      on requirement.id = document.requirement_id
     and requirement.workspace_id = document.workspace_id
     and requirement.kind = 'document'::public.employee_onboarding_requirement_kind
     and requirement.status <> 'superseded'::public.employee_onboarding_requirement_status
    join public.document_types type
      on type.id = requirement.source_id
     and type.workspace_id = document.workspace_id
     and type.archived_at is null
     and type.tracks_expiry
    join public.employee_profiles employee
      on employee.id = document.employee_id
     and employee.workspace_id = document.workspace_id
     and employee.archived_at is null
    where document.review_status = 'accepted'::public.employee_document_review_status
      and document.expiry_date is not null
      and document.expiry_date <= current_date + type.expiry_warning_days
  )
  update public.workspace_todos todo
  set status = 'resolved'::public.workspace_todo_status,
      resolved_at = now(),
      updated_at = now()
  where todo.source_type = 'employee_document_expiry'
    and todo.system_generated
    and todo.status = 'open'::public.workspace_todo_status
    and (target_workspace_id is null or todo.workspace_id = target_workspace_id)
    and not exists (
      select 1
      from eligible
      where eligible.workspace_id = todo.workspace_id
        and eligible.document_id = todo.source_id
        and 'requirement:' || eligible.requirement_id::text = todo.source_key
    );
  get diagnostics resolved_count = row_count;

  return jsonb_build_object(
    'status', 'synced',
    'affected', inserted_count + resolved_count,
    'opened_or_refreshed', inserted_count,
    'resolved', resolved_count
  );
end;
$$;

revoke all on function public.sync_expiring_document_todos_service(uuid)
from public, anon, authenticated;
grant execute on function public.sync_expiring_document_todos_service(uuid)
to service_role;
