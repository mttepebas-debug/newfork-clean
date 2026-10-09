create table public.notification_producer_registry (
  type_key text not null,
  schema_version integer not null,
  producer_id text not null check (char_length(btrim(producer_id)) between 1 and 120),
  source_migration text not null check (char_length(btrim(source_migration)) between 1 and 160),
  source_function text not null check (char_length(btrim(source_function)) between 1 and 160),
  integration_contract text not null default 'outbox_v1' check (integration_contract = 'outbox_v1'),
  activated_at timestamptz not null default now(),
  primary key (type_key, schema_version, producer_id),
  foreign key (type_key, schema_version)
    references public.notification_catalog(type_key, schema_version) on delete restrict
);

alter table public.notification_producer_registry enable row level security;
revoke all on table public.notification_producer_registry from public, anon, authenticated;
grant select, insert, update, delete on table public.notification_producer_registry to service_role;

insert into public.notification_producer_registry (
  type_key, schema_version, producer_id, source_migration, source_function
)
values
  ('communications.announcement.available', 1, 'announcement-publish', '20260908122000_notification_announcement_producer_v1.sql', 'publish_announcement_service'),
  ('requests.time_off.submitted', 1, 'time-off-submit', '20260908121000_notification_request_producers_v1.sql', 'notify_schedule_request_event_service'),
  ('requests.time_off.status_changed', 1, 'time-off-status-change', '20260908121000_notification_request_producers_v1.sql', 'notify_schedule_request_event_service'),
  ('requests.shift_change.submitted', 1, 'shift-change-submit', '20260908121000_notification_request_producers_v1.sql', 'notify_schedule_request_event_service'),
  ('requests.shift_change.status_changed', 1, 'shift-change-status-change', '20260908121000_notification_request_producers_v1.sql', 'notify_schedule_request_event_service'),
  ('time_tracking.correction.submitted', 1, 'time-correction-submit', '20260908123000_notification_time_correction_producers_v1.sql', 'request_own_time_correction_service'),
  ('time_tracking.correction.decided', 1, 'time-correction-decision', '20260908123000_notification_time_correction_producers_v1.sql', 'decide_time_correction_service'),
  ('schedule.published', 1, 'schedule-publish', '20260908112000_notification_outbox_relay.sql', 'publish_schedule_draft_service')
on conflict (type_key, schema_version, producer_id) do update
set source_migration = excluded.source_migration,
    source_function = excluded.source_function,
    integration_contract = excluded.integration_contract;

create or replace function public.reconcile_notification_platform_service()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_without_producer jsonb;
  active_without_template jsonb;
  missing_domain_events jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'type_key', catalog.type_key,
    'schema_version', catalog.schema_version,
    'reason', 'active_catalog_without_outbox_producer'
  ) order by catalog.type_key), '[]'::jsonb)
  into active_without_producer
  from public.notification_catalog catalog
  where catalog.lifecycle = 'active'
    and not exists (
      select 1 from public.notification_producer_registry registry
      where registry.type_key = catalog.type_key
        and registry.schema_version = catalog.schema_version
        and registry.integration_contract = 'outbox_v1'
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'type_key', catalog.type_key,
    'schema_version', catalog.schema_version,
    'reason', 'active_catalog_without_published_in_app_template'
  ) order by catalog.type_key), '[]'::jsonb)
  into active_without_template
  from public.notification_catalog catalog
  where catalog.lifecycle = 'active'
    and 'in_app' = any(catalog.supported_channels)
    and not exists (
      select 1 from public.notification_template_versions template
      where template.type_key = catalog.type_key
        and template.schema_version = catalog.schema_version
        and template.channel = 'in_app'
        and template.status = 'published'
    );

  with request_events as (
    select event.workspace_id, event.id event_id,
      case when event.action = 'submitted' then 'requests.time_off.submitted'
        else 'requests.time_off.status_changed' end type_key,
      event.created_at occurred_at
    from public.schedule_time_off_events event
    where event.action not in ('viewed', 'returned_to_pending')
    union all
    select event.workspace_id, event.id,
      case when event.action = 'submitted' then 'requests.shift_change.submitted'
        else 'requests.shift_change.status_changed' end,
      event.created_at
    from public.schedule_shift_change_events event
    where event.action <> 'viewed'
  ), missing_requests as (
    select request.workspace_id, request.event_id, request.type_key, request.occurred_at,
      'deterministic_request_event_without_outbox' reason
    from request_events request
    join public.notification_producer_registry registry
      on registry.type_key = request.type_key and registry.schema_version = 1
    where request.occurred_at >= registry.activated_at
      and not exists (
        select 1 from public.notification_outbox outbox
        where outbox.workspace_id = request.workspace_id and outbox.event_id = request.event_id
      )
  ), missing_corrections as (
    select correction.workspace_id,
      (
        substr(digest.value, 1, 8) || '-' || substr(digest.value, 9, 4) || '-' ||
        substr(digest.value, 13, 4) || '-' || substr(digest.value, 17, 4) || '-' || substr(digest.value, 21, 12)
      )::uuid event_id,
      'time_tracking.correction.submitted' type_key,
      correction.submitted_at occurred_at,
      'deterministic_time_correction_event_without_outbox' reason
    from public.time_correction_requests correction
    join public.notification_producer_registry registry
      on registry.type_key = 'time_tracking.correction.submitted' and registry.schema_version = 1
    cross join lateral (
      select md5(correction.workspace_id::text || ':time-correction-submitted:' || correction.request_idempotency_key::text) value
    ) digest
    where correction.submitted_at >= registry.activated_at
      and not exists (
        select 1 from public.notification_outbox outbox
        where outbox.workspace_id = correction.workspace_id
          and outbox.event_id = (
            substr(digest.value, 1, 8) || '-' || substr(digest.value, 9, 4) || '-' ||
            substr(digest.value, 13, 4) || '-' || substr(digest.value, 17, 4) || '-' || substr(digest.value, 21, 12)
          )::uuid
      )
    union all
    select correction.workspace_id,
      (
        substr(digest.value, 1, 8) || '-' || substr(digest.value, 9, 4) || '-' ||
        substr(digest.value, 13, 4) || '-' || substr(digest.value, 17, 4) || '-' || substr(digest.value, 21, 12)
      )::uuid,
      'time_tracking.correction.decided', correction.decided_at,
      'deterministic_time_correction_event_without_outbox'
    from public.time_correction_requests correction
    join public.notification_producer_registry registry
      on registry.type_key = 'time_tracking.correction.decided' and registry.schema_version = 1
    cross join lateral (
      select md5(correction.workspace_id::text || ':time-correction-decided:' || correction.decision_idempotency_key::text) value
    ) digest
    where correction.decided_at is not null
      and correction.decision_idempotency_key is not null
      and correction.decided_at >= registry.activated_at
      and not exists (
        select 1 from public.notification_outbox outbox
        where outbox.workspace_id = correction.workspace_id
          and outbox.event_id = (
            substr(digest.value, 1, 8) || '-' || substr(digest.value, 9, 4) || '-' ||
            substr(digest.value, 13, 4) || '-' || substr(digest.value, 17, 4) || '-' || substr(digest.value, 21, 12)
          )::uuid
      )
  ), missing_announcements as (
    select announcement.workspace_id, null::uuid event_id,
      'communications.announcement.available' type_key,
      announcement.updated_at occurred_at,
      'published_announcement_without_outbox' reason
    from public.announcements announcement
    join public.notification_producer_registry registry
      on registry.type_key = 'communications.announcement.available' and registry.schema_version = 1
    where announcement.status in ('published', 'scheduled')
      and announcement.updated_at >= registry.activated_at
      and not exists (
        select 1 from public.notification_outbox outbox
        where outbox.workspace_id = announcement.workspace_id
          and outbox.type_key = 'communications.announcement.available'
          and outbox.subject_id = announcement.id::text
          and outbox.payload->>'announcement_revision' = announcement.revision::text
      )
  ), all_missing as (
    select * from missing_requests
    union all select * from missing_corrections
    union all select * from missing_announcements
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'workspace_id', missing.workspace_id,
    'event_id', missing.event_id,
    'type_key', missing.type_key,
    'occurred_at', missing.occurred_at,
    'reason', missing.reason
  ) order by missing.occurred_at, missing.type_key), '[]'::jsonb)
  into missing_domain_events
  from all_missing missing;

  return jsonb_build_object(
    'status', case
      when jsonb_array_length(active_without_producer) = 0
        and jsonb_array_length(active_without_template) = 0
        and jsonb_array_length(missing_domain_events) = 0
      then 'healthy' else 'drift_detected' end,
    'active_catalog_without_producer', active_without_producer,
    'active_catalog_without_template', active_without_template,
    'deterministic_domain_events_without_outbox', missing_domain_events,
    'dead_letter_count', (select count(*) from public.notification_outbox where status = 'dead_letter'),
    'checked_at', now()
  );
end;
$$;

revoke all on function public.reconcile_notification_platform_service() from public, anon, authenticated;
grant execute on function public.reconcile_notification_platform_service() to service_role;
