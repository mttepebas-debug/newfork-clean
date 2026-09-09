alter table public.document_types
  add column expiry_policy_version integer not null default 1
    check (expiry_policy_version > 0);

create or replace function public.bump_document_type_expiry_policy_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if row(
    new.title,
    new.required_at_onboarding,
    new.tracks_expiry,
    new.expiry_warning_days,
    new.expiry_schedule_impact,
    new.archived_at
  ) is distinct from row(
    old.title,
    old.required_at_onboarding,
    old.tracks_expiry,
    old.expiry_warning_days,
    old.expiry_schedule_impact,
    old.archived_at
  ) then
    new.expiry_policy_version := old.expiry_policy_version + 1;
  end if;

  return new;
end;
$$;

drop trigger if exists bump_document_type_expiry_policy_version_trigger
on public.document_types;

create trigger bump_document_type_expiry_policy_version_trigger
before update on public.document_types
for each row execute function public.bump_document_type_expiry_policy_version();

create or replace function public.list_schedule_draft_document_conflicts_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_draft_id uuid,
  target_week_start date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  draft_week date;
  conflicts jsonb := '[]'::jsonb;
  fingerprint text := 'none';
begin
  if not public.schedule_actor_has_capability_service(
    actor_user_id,
    target_workspace_id,
    'schedule.manage'
  ) then
    raise exception 'schedule manage access denied' using errcode = '42501';
  end if;

  select draft.week_start
  into draft_week
  from public.schedule_drafts draft
  where draft.id = target_draft_id
    and draft.workspace_id = target_workspace_id
    and draft.archived_at is null
  limit 1;

  if draft_week is null or draft_week <> target_week_start then
    return jsonb_build_object(
      'status', 'ok',
      'conflicts', conflicts,
      'fingerprint', fingerprint
    );
  end if;

  with candidate_shifts as (
    select
      shift.id,
      shift.location_id,
      location.name as location_name,
      shift.employee_id,
      trim(employee.first_name || ' ' || employee.last_name) as employee_name,
      shift.scheduled_date,
      to_char(shift.start_time, 'HH24:MI') as start_time,
      to_char(shift.end_time, 'HH24:MI') as end_time
    from public.schedule_draft_shifts shift
    join public.locations location
      on location.id = shift.location_id
     and location.workspace_id = shift.workspace_id
    join public.employee_profiles employee
      on employee.id = shift.employee_id
     and employee.workspace_id = shift.workspace_id
     and employee.archived_at is null
    where shift.workspace_id = target_workspace_id
      and shift.draft_id = target_draft_id
      and shift.employee_id is not null
      and shift.scheduled_date >= target_week_start
      and shift.scheduled_date < target_week_start + 7
  ),
  active_document_requirements as (
    select distinct on (requirement.employee_id, requirement.source_id)
      requirement.employee_id,
      requirement.id as requirement_id,
      requirement.source_id as document_type_id,
      requirement.title as document_title
    from public.employee_onboarding_requirements requirement
    join public.document_types document_type
      on document_type.id = requirement.source_id
     and document_type.workspace_id = requirement.workspace_id
    where requirement.workspace_id = target_workspace_id
      and requirement.kind = 'document'::public.employee_onboarding_requirement_kind
      and requirement.status <> 'superseded'::public.employee_onboarding_requirement_status
      and document_type.archived_at is null
      and document_type.tracks_expiry
      and document_type.expiry_schedule_impact in ('warn', 'block')
    order by requirement.employee_id, requirement.source_id, requirement.created_at desc, requirement.id
  ),
  latest_accepted_documents as (
    select distinct on (document.workspace_id, document.requirement_id)
      document.*
    from public.employee_documents document
    where document.workspace_id = target_workspace_id
      and document.review_status = 'accepted'::public.employee_document_review_status
    order by document.workspace_id, document.requirement_id, document.version_number desc
  ),
  latest_pending_documents as (
    select distinct on (document.workspace_id, document.requirement_id)
      document.*
    from public.employee_documents document
    where document.workspace_id = target_workspace_id
      and document.review_status = 'awaiting_review'::public.employee_document_review_status
    order by document.workspace_id, document.requirement_id, document.version_number desc
  ),
  violation_rows as (
    select
      document_type.expiry_schedule_impact,
      document_type.expiry_policy_version,
      requirement.requirement_id,
      requirement.document_type_id,
      requirement.document_title,
      accepted.id as document_id,
      accepted.expiry_date,
      pending.id as pending_document_id,
      shift.id as shift_id,
      shift.location_id,
      shift.location_name,
      shift.employee_id,
      shift.employee_name,
      shift.scheduled_date,
      shift.start_time,
      shift.end_time
    from candidate_shifts shift
    join active_document_requirements requirement
      on requirement.employee_id = shift.employee_id
    join public.document_types document_type
      on document_type.id = requirement.document_type_id
     and document_type.workspace_id = target_workspace_id
    join latest_accepted_documents accepted
      on accepted.requirement_id = requirement.requirement_id
    left join latest_pending_documents pending
      on pending.requirement_id = requirement.requirement_id
    where accepted.expiry_date is not null
      and accepted.expiry_date < shift.scheduled_date
  ),
  conflict_rows as (
    select
      jsonb_build_object(
        'employee_id', employee_id,
        'employee_name', employee_name,
        'shift_id', shift_id,
        'location_id', location_id,
        'location_name', location_name,
        'date', scheduled_date,
        'start_time', start_time,
        'end_time', end_time,
        'document_type_id', document_type_id,
        'requirement_id', requirement_id,
        'document_id', document_id,
        'document_title', document_title,
        'expiry_date', expiry_date,
        'expiry_policy_version', expiry_policy_version,
        'pending_document_id', pending_document_id,
        'review_action', case when pending_document_id is null then null else 'review_document' end,
        'severity', case
          when expiry_schedule_impact = 'block' then 'hard'
          else 'soft'
        end,
        'overrideable', expiry_schedule_impact = 'warn',
        'warning_text', case
          when expiry_schedule_impact = 'block'
            then document_title || ' is expired and blocks scheduling.'
          else document_title || ' is expired.'
        end,
        'conflict_fingerprint', 'pending'
      ) as conflict,
      concat_ws(
        '|',
        employee_id,
        shift_id,
        document_type_id,
        requirement_id,
        document_id,
        pending_document_id,
        expiry_schedule_impact,
        expiry_policy_version,
        scheduled_date,
        expiry_date
      ) as conflict_key
    from violation_rows
    order by scheduled_date, start_time, shift_id, document_type_id
  )
  select coalesce(jsonb_agg(conflict), '[]'::jsonb),
         coalesce(
           encode(
             extensions.digest(
               convert_to(string_agg(conflict_key, E'\n' order by conflict_key), 'UTF8'),
               'sha256'
             ),
             'hex'
           ),
           'none'
         )
  into conflicts, fingerprint
  from conflict_rows;

  if fingerprint <> 'none' then
    conflicts := (
      select jsonb_agg(conflict - 'conflict_fingerprint' || jsonb_build_object(
        'conflict_fingerprint',
        fingerprint
      ))
      from jsonb_array_elements(conflicts) conflict
    );
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'conflicts', conflicts,
    'fingerprint', fingerprint
  );
end;
$$;

revoke all on function public.bump_document_type_expiry_policy_version()
from public, anon, authenticated;

revoke all on function public.list_schedule_draft_document_conflicts_service(
  uuid,
  uuid,
  uuid,
  date
) from public, anon, authenticated;

grant execute on function public.list_schedule_draft_document_conflicts_service(
  uuid,
  uuid,
  uuid,
  date
) to service_role;

insert into public.notification_catalog (
  type_key, schema_version, category, severity, sensitivity,
  supported_channels, default_cadence, audience_contract,
  action_route_contract, dedupe_policy, retention_class, template_key,
  lifecycle, mandatory_in_app
) values (
  'people.employee_document.expiring', 1, 'people', 'warning', 'confidential',
  array['in_app'], 'immediate', 'employee_document_expiry_reviewers',
  '{"route":"/app/employees","allowed_query_keys":[]}',
  '{"strategy":"refresh","scope":"subject_recipient","key_fields":["document_id","recipient_user_id"]}',
  'sensitive_30d', 'people.employee_document.expiring.v1', 'active', false
)
on conflict (type_key, schema_version) do update
set lifecycle = excluded.lifecycle;

insert into public.notification_template_versions (
  type_key, schema_version, channel, locale, template_version, template_key,
  content, status, published_at
) values (
  'people.employee_document.expiring', 1, 'in_app', 'en', 1,
  'people.employee_document.expiring.v1',
  jsonb_build_object(
    'title', 'Employee document expiring',
    'body', '{{employee_name}} - {{document_title}} expires on {{expiry_date}}.',
    'safe_preview', 'An employee document needs attention.',
    'action_url', '/app/employees'
  ),
  'published',
  now()
)
on conflict (type_key, schema_version, channel, locale, template_version)
do update set content = excluded.content,
              status = excluded.status,
              published_at = coalesce(public.notification_template_versions.published_at, excluded.published_at);

create or replace function public.sync_expiring_document_todos_service(target_workspace_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
  resolved_count integer := 0;
  notification_count integer := 0;
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
    select
      document.workspace_id,
      document.id as document_id,
      document.employee_id,
      document.requirement_id,
      document.expiry_date,
      requirement.title as document_title,
      employee.first_name,
      employee.last_name,
      array(
        select distinct membership.user_id
        from public.workspace_memberships membership
        join public.workspace_roles role
          on role.id = membership.role_id
         and role.workspace_id = membership.workspace_id
        where membership.workspace_id = document.workspace_id
          and membership.status = 'active'
          and role.access_class in ('owner', 'admin', 'manager')
          and public.service_actor_can_access_employee(
            membership.user_id,
            document.workspace_id,
            document.employee_id
          )
        order by membership.user_id
      ) as recipient_user_ids
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
  ),
  event_rows as (
    select
      eligible.*,
      md5(
        eligible.workspace_id::text || ':employee-document-expiry:' ||
        eligible.document_id::text || ':' || eligible.requirement_id::text
      ) as event_digest
    from eligible
    where cardinality(eligible.recipient_user_ids) > 0
  ),
  enqueued as (
    select public.enqueue_notification_outbox_service(
      event_rows.workspace_id,
      (
        substr(event_rows.event_digest, 1, 8) || '-' ||
        substr(event_rows.event_digest, 9, 4) || '-' ||
        substr(event_rows.event_digest, 13, 4) || '-' ||
        substr(event_rows.event_digest, 17, 4) || '-' ||
        substr(event_rows.event_digest, 21, 12)
      )::uuid,
      'people.employee_document.expiring',
      1,
      null,
      'employee_document',
      event_rows.document_id::text,
      jsonb_build_object(
        'correlation_id',
        (
          substr(event_rows.event_digest, 1, 8) || '-' ||
          substr(event_rows.event_digest, 9, 4) || '-' ||
          substr(event_rows.event_digest, 13, 4) || '-' ||
          substr(event_rows.event_digest, 17, 4) || '-' ||
          substr(event_rows.event_digest, 21, 12)
        )::uuid,
        'audience_contract', 'employee_document_expiry_reviewers',
        'recipient_user_ids', to_jsonb(event_rows.recipient_user_ids),
        'employee_id', event_rows.employee_id,
        'employee_name', btrim(event_rows.first_name || ' ' || event_rows.last_name),
        'document_id', event_rows.document_id,
        'requirement_id', event_rows.requirement_id,
        'document_title', event_rows.document_title,
        'expiry_date', event_rows.expiry_date,
        'title', case
          when event_rows.expiry_date < current_date then 'Employee document expired'
          else 'Employee document expiring'
        end,
        'body', btrim(event_rows.first_name || ' ' || event_rows.last_name) || ' - ' ||
          event_rows.document_title || ' expires on ' || event_rows.expiry_date::text || '.',
        'safe_preview', 'An employee document needs attention.',
        'action_url', '/app/employees',
        'group_key', 'employee-document-expiry:' || event_rows.document_id::text
      ),
      now()
    ) as outbox_id
    from event_rows
  )
  select count(*)::integer into notification_count
  from enqueued;

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
    'resolved', resolved_count,
    'notifications_enqueued', notification_count
  );
end;
$$;

revoke all on function public.sync_expiring_document_todos_service(uuid)
from public, anon, authenticated;
grant execute on function public.sync_expiring_document_todos_service(uuid)
to service_role;
