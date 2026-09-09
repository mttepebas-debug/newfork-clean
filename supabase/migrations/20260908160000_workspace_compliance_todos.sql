create type public.workspace_todo_status as enum ('open', 'resolved');
create type public.workspace_todo_severity as enum ('info', 'warning', 'action_required');

create table public.workspace_todos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null default '' check (char_length(body) <= 1000),
  severity public.workspace_todo_severity not null default 'info',
  status public.workspace_todo_status not null default 'open',
  system_generated boolean not null default true,
  source_type text not null check (char_length(btrim(source_type)) between 1 and 80),
  source_id uuid not null,
  source_key text not null check (char_length(btrim(source_key)) between 1 and 160),
  employee_id uuid,
  due_at timestamptz,
  action_url text check (action_url is null or (char_length(action_url) <= 500 and action_url ~ '^/app(/|$)')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, source_type, source_id, source_key),
  foreign key (employee_id, workspace_id)
    references public.employee_profiles(id, workspace_id) on delete cascade,
  check ((status = 'resolved') = (resolved_at is not null))
);

alter table public.workspace_todos enable row level security;
revoke all on public.workspace_todos from public, anon, authenticated;
grant select, insert, update, delete on public.workspace_todos to service_role;

create index workspace_todos_open_idx
  on public.workspace_todos (workspace_id, due_at nulls first, created_at, id)
  where status = 'open';
create index workspace_todos_employee_idx
  on public.workspace_todos (workspace_id, employee_id)
  where employee_id is not null and status = 'open';

create or replace function public.normalize_workspace_widget_order(target_widget_order text[])
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
  with allowed(value, position) as (
    values
      ('operations', 1),
      ('pending_requests', 2),
      ('open_shifts', 3),
      ('announcements', 4),
      ('todos', 5),
      ('notifications', 6),
      ('quick_actions', 7)
  ),
  input_order as (
    select input.value, min(input.ordinality) as ordinality
    from unnest(coalesce(target_widget_order, '{}'::text[])) with ordinality input(value, ordinality)
    join allowed on allowed.value = input.value
    group by input.value
  )
  select array_agg(allowed.value order by coalesce(input_order.ordinality, 1000 + allowed.position), allowed.position)
  from allowed
  left join input_order on input_order.value = allowed.value;
$$;

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

create or replace function public.save_workspace_layout_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_widget_order text[],
  target_hidden_widget_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed constant text[] := array[
    'operations',
    'pending_requests',
    'open_shifts',
    'announcements',
    'todos',
    'notifications',
    'quick_actions'
  ];
begin
  if not public.communication_actor_has_capability_service(actor_user_id, target_workspace_id, 'workspace.read') then
    raise exception 'workspace access required' using errcode = '42501';
  end if;
  if cardinality(target_widget_order) <> cardinality(allowed)
    or (select count(distinct value) from unnest(target_widget_order) value) <> cardinality(allowed)
    or exists(select 1 from unnest(target_widget_order || target_hidden_widget_ids) value where not value = any(allowed)) then
    raise exception 'valid workspace layout required' using errcode = '22023';
  end if;

  insert into public.workspace_layout_preferences (
    workspace_id, user_id, widget_order, hidden_widget_ids
  ) values (
    target_workspace_id,
    actor_user_id,
    target_widget_order,
    array(select distinct value from unnest(target_hidden_widget_ids) value)
  )
  on conflict(workspace_id, user_id)
  do update set
    widget_order = excluded.widget_order,
    hidden_widget_ids = excluded.hidden_widget_ids,
    updated_at = now();

  return jsonb_build_object('status', 'saved');
end;
$$;

create or replace function public.get_workspace_dashboard_service(
  actor_user_id uuid,
  target_workspace_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership public.workspace_memberships%rowtype;
  role_class public.workspace_role;
  result jsonb;
begin
  select member.* into membership
  from public.workspace_memberships member
  where member.user_id = actor_user_id
    and member.workspace_id = target_workspace_id
    and member.status = 'active';
  select role.access_class into role_class
  from public.workspace_roles role
  where role.id = membership.role_id
    and role.workspace_id = target_workspace_id;
  if membership.id is null
    or role_class = 'employee'
    or not public.communication_actor_has_capability_service(actor_user_id, target_workspace_id, 'workspace.read') then
    raise exception 'manager workspace access required' using errcode = '42501';
  end if;

  perform public.sync_expiring_document_todos_service(target_workspace_id);

  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'display_name', coalesce(profile.display_name, 'Manager'),
    'metrics', jsonb_build_object(
      'today_shift_count', (select count(*) from public.schedule_published_shifts shift join public.schedule_location_publications publication on publication.id = shift.publication_id and publication.status = 'current' where shift.workspace_id = target_workspace_id and shift.scheduled_date = current_date and (membership.all_locations or exists(select 1 from public.membership_location_scopes scope where scope.membership_id = membership.id and scope.location_id = shift.location_id))),
      'today_open_shift_count', (select count(*) from public.schedule_published_shifts shift join public.schedule_location_publications publication on publication.id = shift.publication_id and publication.status = 'current' where shift.workspace_id = target_workspace_id and shift.scheduled_date = current_date and shift.employee_id is null and (membership.all_locations or exists(select 1 from public.membership_location_scopes scope where scope.membership_id = membership.id and scope.location_id = shift.location_id))),
      'pending_time_off_count', (select count(*) from public.schedule_time_off_requests request where request.workspace_id = target_workspace_id and request.status = 'pending' and (membership.all_locations or exists(select 1 from public.membership_location_scopes scope where scope.membership_id = membership.id and scope.location_id = request.location_id))),
      'pending_shift_change_count', (select count(*) from public.schedule_shift_change_requests request join public.schedule_published_shifts shift on shift.id = request.offered_shift_id where request.workspace_id = target_workspace_id and request.status = 'pending_manager_approval' and (membership.all_locations or exists(select 1 from public.membership_location_scopes scope where scope.membership_id = membership.id and scope.location_id = shift.location_id))),
      'unread_notification_count', (select count(*) from public.notifications notification where notification.workspace_id = target_workspace_id and notification.recipient_user_id = actor_user_id and notification.dismissed_at is null and notification.read_at is null and notification.created_at <= now())
    ),
    'announcements', coalesce((select jsonb_agg(item.value) from (select value from jsonb_array_elements((public.get_announcements_service(actor_user_id, target_workspace_id)->'announcements')) value where value->>'status' in ('published', 'scheduled') and (value->>'publish_at')::timestamptz <= now() limit 5) item), '[]'::jsonb),
    'notifications', coalesce(public.get_notifications_service(actor_user_id, target_workspace_id, null, false, null, 5)->'notifications', '[]'::jsonb),
    'todos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', todo.id,
        'workspace_id', todo.workspace_id,
        'title', todo.title,
        'body', todo.body,
        'severity', todo.severity,
        'status', todo.status,
        'system_generated', todo.system_generated,
        'source_type', todo.source_type,
        'source_id', todo.source_id,
        'source_key', todo.source_key,
        'employee_id', todo.employee_id,
        'due_at', todo.due_at,
        'action_url', todo.action_url,
        'created_at', todo.created_at
      ) order by todo.due_at nulls last, todo.created_at, todo.id)
      from (
        select todo.*
        from public.workspace_todos todo
        where todo.workspace_id = target_workspace_id
          and todo.status = 'open'::public.workspace_todo_status
          and (
            todo.employee_id is null
            or public.service_actor_can_access_employee(actor_user_id, target_workspace_id, todo.employee_id)
          )
        order by todo.due_at nulls last, todo.created_at, todo.id
        limit 5
      ) todo
    ), '[]'::jsonb),
    'layout', jsonb_build_object(
      'widget_order', public.normalize_workspace_widget_order(preference.widget_order),
      'hidden_widget_ids', array(
        select distinct value
        from unnest(coalesce(preference.hidden_widget_ids, '{}'::text[])) value
        where value = any(array[
          'operations',
          'pending_requests',
          'open_shifts',
          'announcements',
          'todos',
          'notifications',
          'quick_actions'
        ])
      )
    )
  ) into result
  from public.user_profiles profile
  left join public.workspace_layout_preferences preference
    on preference.workspace_id = target_workspace_id
   and preference.user_id = actor_user_id
  where profile.user_id = actor_user_id;

  return result;
end;
$$;

revoke all on function public.normalize_workspace_widget_order(text[]) from public, anon, authenticated;
revoke all on function public.sync_expiring_document_todos_service(uuid) from public, anon, authenticated;
revoke all on function public.save_workspace_layout_service(uuid, uuid, text[], text[]) from public, anon, authenticated;
revoke all on function public.get_workspace_dashboard_service(uuid, uuid) from public, anon, authenticated;
grant execute on function public.normalize_workspace_widget_order(text[]) to service_role;
grant execute on function public.sync_expiring_document_todos_service(uuid) to service_role;
grant execute on function public.save_workspace_layout_service(uuid, uuid, text[], text[]) to service_role;
grant execute on function public.get_workspace_dashboard_service(uuid, uuid) to service_role;
