update public.notification_catalog
set lifecycle = 'active'
where type_key = 'schedule.published'
  and schema_version = 1;

update public.notification_template_versions
set content = jsonb_build_object(
      'title', 'New schedule published',
      'body', 'Your schedule for the week of {{week_start}} is available.',
      'safe_preview', 'A new work schedule is available.',
      'action_url', '/app/employee-hub?tab=schedule'
    ),
    status = 'published',
    published_at = coalesce(published_at, now())
where type_key = 'schedule.published'
  and schema_version = 1
  and channel = 'in_app'
  and locale = 'en'
  and template_version = 1;

create or replace function public.enqueue_notification_outbox_service(
  target_workspace_id uuid,
  target_event_id uuid,
  target_type_key text,
  target_schema_version integer,
  target_actor_user_id uuid,
  target_subject_type text,
  target_subject_id text,
  target_payload jsonb,
  target_occurred_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox_id uuid;
begin
  if jsonb_typeof(target_payload) <> 'object' then
    raise exception 'notification payload must be an object' using errcode = '22023';
  end if;

  insert into public.notification_outbox (
    workspace_id, event_id, type_key, schema_version, actor_user_id,
    subject_type, subject_id, payload, occurred_at
  ) values (
    target_workspace_id, target_event_id, target_type_key, target_schema_version,
    target_actor_user_id, target_subject_type, target_subject_id, target_payload,
    target_occurred_at
  )
  on conflict (workspace_id, event_id) do update
    set event_id = excluded.event_id
  returning id into outbox_id;

  return outbox_id;
end;
$$;

create or replace function public.publish_schedule_draft_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_draft_id uuid,
  target_location_ids uuid[],
  target_department_ids uuid[],
  include_no_department boolean,
  expected_draft_revision integer,
  expected_fingerprint text,
  override_decisions jsonb,
  target_notify_employee_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  notification_event_id uuid;
  normalized_recipient_ids uuid[];
  result_publication_ids uuid[];
begin
  result := public.publish_schedule_draft_service(
    actor_user_id,
    target_workspace_id,
    target_draft_id,
    target_location_ids,
    target_department_ids,
    include_no_department,
    expected_draft_revision,
    expected_fingerprint,
    override_decisions
  );

  if result->>'status' <> 'published'
    or coalesce(cardinality(target_notify_employee_ids), 0) = 0 then
    return result;
  end if;

  select array(
    select jsonb_array_elements_text(result->'publication_ids')::uuid
  ) into result_publication_ids;

  select coalesce(array_agg(distinct employee.id order by employee.id), '{}'::uuid[])
  into normalized_recipient_ids
  from public.employee_profiles employee
  join public.workspace_memberships membership
    on membership.workspace_id = employee.workspace_id
   and membership.user_id = employee.user_id
   and membership.status = 'active'
  where employee.workspace_id = target_workspace_id
    and employee.id = any(target_notify_employee_ids)
    and employee.archived_at is null
    and exists (
      select 1
      from public.schedule_published_shifts shift
      where shift.workspace_id = target_workspace_id
        and shift.publication_id = any(result_publication_ids)
        and shift.employee_id = employee.id
    );

  if cardinality(normalized_recipient_ids) = 0 then
    return result;
  end if;

  notification_event_id := gen_random_uuid();
  perform public.enqueue_notification_outbox_service(
    target_workspace_id,
    notification_event_id,
    'schedule.published',
    1,
    actor_user_id,
    'schedule_week',
    result->>'week_start',
    jsonb_build_object(
      'correlation_id', notification_event_id,
      'week_start', result->>'week_start',
      'publication_ids', result->'publication_ids',
      'location_ids', result->'location_ids',
      'recipient_employee_ids', to_jsonb(normalized_recipient_ids)
    ),
    (result->>'published_at')::timestamptz
  );

  return result || jsonb_build_object(
    'notification_event_id', notification_event_id,
    'notification_enqueued_count', cardinality(normalized_recipient_ids)
  );
end;
$$;

create or replace function public.lease_notification_outbox_service(
  target_worker_id text,
  target_batch_size integer default 25,
  target_lease_seconds integer default 60
)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(btrim(coalesce(target_worker_id, ''))) not between 1 and 120 then
    raise exception 'valid notification worker id required' using errcode = '22023';
  end if;
  if target_batch_size not between 1 and 100 then
    raise exception 'notification batch size must be between 1 and 100' using errcode = '22023';
  end if;
  if target_lease_seconds not between 5 and 300 then
    raise exception 'notification lease seconds must be between 5 and 300' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select outbox.id
    from public.notification_outbox outbox
    where (
        outbox.status in ('pending', 'retry')
        and outbox.available_at <= now()
      ) or (
        outbox.status = 'leased'
        and outbox.lease_expires_at <= now()
      )
    order by outbox.available_at, outbox.created_at, outbox.id
    for update skip locked
    limit target_batch_size
  )
  update public.notification_outbox outbox
  set status = 'leased',
      attempt_count = outbox.attempt_count + 1,
      lease_owner = btrim(target_worker_id),
      lease_expires_at = now() + make_interval(secs => target_lease_seconds),
      last_error = null
  from candidates
  where outbox.id = candidates.id
  returning outbox.*;
end;
$$;

create or replace function public.heartbeat_notification_outbox_service(
  target_worker_id text,
  target_outbox_id uuid,
  target_lease_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_lease_seconds not between 5 and 300 then
    raise exception 'notification lease seconds must be between 5 and 300' using errcode = '22023';
  end if;

  update public.notification_outbox
  set lease_expires_at = now() + make_interval(secs => target_lease_seconds)
  where id = target_outbox_id
    and status = 'leased'
    and lease_owner = btrim(target_worker_id)
    and lease_expires_at > now();
  return found;
end;
$$;

create or replace function public.project_notification_event_service(
  target_outbox_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox public.notification_outbox%rowtype;
begin
  select * into outbox
  from public.notification_outbox item
  where item.id = target_outbox_id;
  if outbox.id is null then
    raise exception 'notification outbox item not found' using errcode = 'P0002';
  end if;

  insert into public.notification_events (
    id, workspace_id, type_key, schema_version, actor_user_id,
    subject_type, subject_id, payload_digest, sensitivity, occurred_at
  )
  select
    outbox.event_id, outbox.workspace_id, outbox.type_key, outbox.schema_version,
    outbox.actor_user_id, outbox.subject_type, outbox.subject_id,
    encode(extensions.digest(convert_to(outbox.payload::text, 'UTF8'), 'sha256'), 'hex'),
    catalog.sensitivity, outbox.occurred_at
  from public.notification_catalog catalog
  where catalog.type_key = outbox.type_key
    and catalog.schema_version = outbox.schema_version
    and catalog.lifecycle = 'active'
  on conflict (id) do nothing;

  if not found and not exists (
    select 1 from public.notification_events event where event.id = outbox.event_id
  ) then
    raise exception 'notification catalog type is not active' using errcode = '23514';
  end if;
  return outbox.event_id;
end;
$$;

create or replace function public.project_schedule_notification_recipients_service(
  target_outbox_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox public.notification_outbox%rowtype;
  inserted_count integer;
begin
  select * into outbox
  from public.notification_outbox item
  where item.id = target_outbox_id;
  if outbox.id is null then
    raise exception 'notification outbox item not found' using errcode = 'P0002';
  end if;
  if outbox.type_key <> 'schedule.published' or outbox.schema_version <> 1 then
    raise exception 'unsupported notification audience contract' using errcode = '0A000';
  end if;
  if jsonb_typeof(outbox.payload->'recipient_employee_ids') is distinct from 'array' then
    raise exception 'schedule notification recipients are required' using errcode = '22023';
  end if;

  with requested as (
    select distinct value::uuid employee_id
    from jsonb_array_elements_text(outbox.payload->'recipient_employee_ids') value
  ), eligible as (
    select
      employee.id employee_id,
      employee.user_id,
      membership.role::text role_key,
      type_preference.version type_preference_version,
      category_preference.version category_preference_version,
      global_policy.version org_policy_version,
      coalesce(
        type_preference.channel_preferences->>'in_app',
        category_preference.channel_preferences->>'in_app',
        'enabled'
      ) <> 'disabled'
      and coalesce(global_policy.enabled, true)
      and (
        global_policy.allowed_channels is null
        or 'in_app' = any(global_policy.allowed_channels)
      ) in_app_enabled
    from requested
    join public.employee_profiles employee
      on employee.id = requested.employee_id
     and employee.workspace_id = outbox.workspace_id
     and employee.user_id is not null
     and employee.archived_at is null
    join public.workspace_memberships membership
      on membership.workspace_id = outbox.workspace_id
     and membership.user_id = employee.user_id
     and membership.status = 'active'
    left join public.notification_org_policies global_policy
      on global_policy.workspace_id = outbox.workspace_id
     and global_policy.type_key = outbox.type_key
     and global_policy.role_id is null
     and global_policy.location_id is null
    left join public.notification_user_preferences type_preference
      on type_preference.workspace_id = outbox.workspace_id
     and type_preference.user_id = employee.user_id
     and type_preference.preference_scope = 'type'
     and type_preference.scope_key = outbox.type_key
    left join public.notification_user_preferences category_preference
      on category_preference.workspace_id = outbox.workspace_id
     and category_preference.user_id = employee.user_id
     and category_preference.preference_scope = 'category'
     and category_preference.scope_key = 'schedule'
  )
  insert into public.notification_recipients (
    workspace_id, event_id, recipient_user_id, recipient_employee_id,
    audience_reason, policy_snapshot
  )
  select
    outbox.workspace_id,
    outbox.event_id,
    eligible.user_id,
    eligible.employee_id,
    jsonb_build_object(
      'contract', 'published_shift_assignees',
      'source', 'producer_recipient_snapshot'
    ),
    jsonb_build_object(
      'catalog', jsonb_build_object('type_key', outbox.type_key, 'schema_version', outbox.schema_version),
      'organization_policy_version', eligible.org_policy_version,
      'user_type_preference_version', eligible.type_preference_version,
      'user_category_preference_version', eligible.category_preference_version,
      'channels', jsonb_build_object(
        'in_app', jsonb_build_object(
          'eligible', eligible.in_app_enabled,
          'cadence', 'immediate',
          'reason_chain', jsonb_build_array(
            'catalog_supported', 'organization_default', 'user_preference'
          )
        )
      )
    )
  from eligible
  where eligible.in_app_enabled
  on conflict (workspace_id, event_id, recipient_user_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.project_notification_inbox_service(
  target_outbox_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox public.notification_outbox%rowtype;
  inserted_count integer;
begin
  select * into outbox
  from public.notification_outbox item
  where item.id = target_outbox_id;
  if outbox.id is null then
    raise exception 'notification outbox item not found' using errcode = 'P0002';
  end if;

  insert into public.notification_inbox_items (
    workspace_id, recipient_projection_id, title, body, safe_preview,
    action_url, group_key, created_at
  )
  select
    recipient.workspace_id,
    recipient.id,
    'New schedule published',
    format('Your schedule for the week of %s is available.', outbox.payload->>'week_start'),
    'A new work schedule is available.',
    '/app/employee-hub?tab=schedule',
    'schedule:' || outbox.subject_id,
    outbox.occurred_at
  from public.notification_recipients recipient
  where recipient.workspace_id = outbox.workspace_id
    and recipient.event_id = outbox.event_id
  on conflict (recipient_projection_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.process_notification_outbox_service(
  target_worker_id text,
  target_outbox_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox public.notification_outbox%rowtype;
  recipient_count integer;
  inbox_count integer;
begin
  select * into outbox
  from public.notification_outbox item
  where item.id = target_outbox_id
  for update;
  if outbox.id is null then
    raise exception 'notification outbox item not found' using errcode = 'P0002';
  end if;
  if outbox.status <> 'leased'
    or outbox.lease_owner <> btrim(target_worker_id)
    or outbox.lease_expires_at <= now() then
    raise exception 'active notification lease required' using errcode = '42501';
  end if;

  perform public.project_notification_event_service(outbox.id);
  recipient_count := public.project_schedule_notification_recipients_service(outbox.id);
  inbox_count := public.project_notification_inbox_service(outbox.id);

  update public.notification_outbox
  set status = 'processed', lease_owner = null, lease_expires_at = null, last_error = null
  where id = outbox.id;

  insert into public.notification_audit_log (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    outbox.workspace_id, null, 'notification.outbox.processed', 'notification_event',
    outbox.event_id::text,
    jsonb_build_object(
      'correlation_id', outbox.payload->>'correlation_id',
      'recipient_projections_created', recipient_count,
      'inbox_items_created', inbox_count,
      'worker_id', left(btrim(target_worker_id), 120)
    )
  );

  return jsonb_build_object(
    'status', 'processed',
    'outbox_id', outbox.id,
    'event_id', outbox.event_id,
    'recipient_projections_created', recipient_count,
    'inbox_items_created', inbox_count
  );
end;
$$;

create or replace function public.fail_notification_outbox_service(
  target_worker_id text,
  target_outbox_id uuid,
  target_error text,
  target_max_attempts integer default 5,
  target_base_delay_seconds integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox public.notification_outbox%rowtype;
  next_status text;
  retry_delay_seconds integer;
begin
  if target_max_attempts not between 1 and 20 then
    raise exception 'notification max attempts must be between 1 and 20' using errcode = '22023';
  end if;
  if target_base_delay_seconds not between 1 and 3600 then
    raise exception 'notification retry delay must be between 1 and 3600' using errcode = '22023';
  end if;

  select * into outbox
  from public.notification_outbox item
  where item.id = target_outbox_id
  for update;
  if outbox.id is null then
    raise exception 'notification outbox item not found' using errcode = 'P0002';
  end if;
  if outbox.status <> 'leased' or outbox.lease_owner <> btrim(target_worker_id) then
    raise exception 'owned notification lease required' using errcode = '42501';
  end if;

  next_status := case when outbox.attempt_count >= target_max_attempts then 'dead_letter' else 'retry' end;
  retry_delay_seconds := least(
    86400,
    target_base_delay_seconds * power(2, greatest(outbox.attempt_count - 1, 0))::integer
  );

  update public.notification_outbox
  set status = next_status,
      available_at = case
        when next_status = 'retry' then now() + make_interval(secs => retry_delay_seconds)
        else available_at
      end,
      lease_owner = null,
      lease_expires_at = null,
      last_error = left(coalesce(nullif(btrim(target_error), ''), 'notification processing failed'), 2000)
  where id = outbox.id;

  return jsonb_build_object(
    'status', next_status,
    'outbox_id', outbox.id,
    'attempt_count', outbox.attempt_count,
    'retry_delay_seconds', case when next_status = 'retry' then retry_delay_seconds else null end
  );
end;
$$;

revoke all on function public.enqueue_notification_outbox_service(uuid, uuid, text, integer, uuid, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.publish_schedule_draft_service(uuid, uuid, uuid, uuid[], uuid[], boolean, integer, text, jsonb) from authenticated;
revoke all on function public.publish_schedule_draft_service(uuid, uuid, uuid, uuid[], uuid[], boolean, integer, text, jsonb, uuid[]) from public, anon, authenticated;
revoke all on function public.lease_notification_outbox_service(text, integer, integer) from public, anon, authenticated;
revoke all on function public.heartbeat_notification_outbox_service(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.project_notification_event_service(uuid) from public, anon, authenticated;
revoke all on function public.project_schedule_notification_recipients_service(uuid) from public, anon, authenticated;
revoke all on function public.project_notification_inbox_service(uuid) from public, anon, authenticated;
revoke all on function public.process_notification_outbox_service(text, uuid) from public, anon, authenticated;
revoke all on function public.fail_notification_outbox_service(text, uuid, text, integer, integer) from public, anon, authenticated;

grant execute on function public.publish_schedule_draft_service(uuid, uuid, uuid, uuid[], uuid[], boolean, integer, text, jsonb, uuid[]) to service_role;
grant execute on function public.lease_notification_outbox_service(text, integer, integer) to service_role;
grant execute on function public.heartbeat_notification_outbox_service(text, uuid, integer) to service_role;
grant execute on function public.process_notification_outbox_service(text, uuid) to service_role;
grant execute on function public.fail_notification_outbox_service(text, uuid, text, integer, integer) to service_role;
