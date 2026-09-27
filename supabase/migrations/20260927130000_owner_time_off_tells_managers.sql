-- BL-183 (user decision 2026-09-26): the owner's time off asks nobody for a
-- review; it tells the managers where it left shifts open.
--
-- Before: the owner's own time off is recorded without review
-- (app_private.record_owner_time_off, BL-177), but the request trigger still
-- sent "New time-off request / A schedule request needs manager review." to
-- the reviewers, who found nothing to review and were not told which shifts
-- had been left open.
--
-- After:
-- * time_off_is_the_owners_own is the one test for "the owner's own request";
--   the trigger sends no review notice for it and record_owner_time_off uses it.
-- * notify_owner_time_off_open_shifts: once the time off is recorded, each
--   manager (a manager-class member whom the core lets edit the Schedule at
--   the location) of a location where a shift was released gets one notice
--   listing the open shifts there. Admins, other locations' managers and the
--   owner get none (user decision); a location without a manager tells nobody.
--   No shift released, no notice. Cancelling the time off sends nothing.
-- Wording is nf-arayuz's; this is the proposed text from the task file.

insert into public.notification_catalog (
  type_key, schema_version, category, severity, sensitivity, supported_channels,
  default_cadence, audience_contract, action_route_contract, dedupe_policy,
  retention_class, template_key, lifecycle, mandatory_in_app, notification_scope
)
values (
  'schedule.owner_time_off.shifts_opened', 1, 'schedule', 'action_required', 'confidential',
  '{in_app}', 'immediate', 'owner_time_off_location_managers',
  '{"route": "/app/schedule", "allowed_query_keys": ["date"]}',
  '{"scope": "event_recipient", "strategy": "keep_first", "key_fields": ["event_id", "recipient_user_id"]}',
  'sensitive_30d', 'schedule.owner_time_off.shifts_opened.v1', 'active', false, 'workspace'
);

create function public.time_off_is_the_owners_own(actor uuid, w uuid, rid uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
 select app_private.authz_reason(actor, w, 'workspace.setup') is null
  and exists (select 1 from public.schedule_time_off_requests r
   join public.employee_profiles e on e.id = r.employee_id and e.workspace_id = r.workspace_id
   where r.id = rid and r.workspace_id = w and e.user_id = actor);
$$;
revoke all on function public.time_off_is_the_owners_own(uuid, uuid, uuid) from public, anon, authenticated, service_role;

create function public.notify_owner_time_off_open_shifts(actor uuid, w uuid, rid uuid, decision integer)
returns void
language plpgsql
set search_path = ''
as $$
declare fmt text; owner_name text; g record;
begin
 fmt := case when (select s.time_format from public.workspace_scheduling_settings s where s.workspace_id = w) = '24h'
  then 'HH24:MI' else 'FMHH12:MI AM' end;
 select coalesce(nullif(e.preferred_name, ''), e.first_name) into owner_name
  from public.schedule_time_off_requests r join public.employee_profiles e on e.id = r.employee_id and e.workspace_id = r.workspace_id
  where r.id = rid and r.workspace_id = w;
 -- One notice per set of people who manage the same open shifts.
 for g in
  with opened as (
   select p.location_id, l.name location_name, p.scheduled_date, p.start_time, p.end_time
   from public.time_off_assignment_releases rel
   join public.schedule_published_shifts p on p.id = rel.published_shift_id and p.workspace_id = w
   join public.locations l on l.id = p.location_id and l.workspace_id = w
   where rel.workspace_id = w and rel.request_id = rid and rel.decision_revision = decision
  ), managers as (
   select m.user_id from public.workspace_memberships m
   where m.workspace_id = w and m.status = 'active' and m.user_id <> actor
    and (app_private.actor(m.user_id, w)).class = 'manager'
  ), told as (
   select mg.user_id, o.* from managers mg join opened o
    on app_private.authz_reason(mg.user_id, w, 'schedule.edit', array[o.location_id]) is null
  ), per_person as (
   select t.user_id, count(*)::integer n, min(t.scheduled_date) first_day,
    to_jsonb(array_agg(distinct t.location_id)) location_ids,
    string_agg(to_char(t.scheduled_date, 'Dy Mon FMDD') || ', ' || to_char(t.start_time, fmt) || '–' || to_char(t.end_time, fmt)
     || ' (' || t.location_name || ')', '; ' order by t.scheduled_date, t.start_time, t.location_name) lines
   from told t group by t.user_id
  )
  select n, first_day, location_ids, lines, array_agg(user_id order by user_id) recipients
  from per_person group by n, first_day, location_ids, lines
 loop
  perform public.enqueue_notification_outbox_service(w, gen_random_uuid(), 'schedule.owner_time_off.shifts_opened', 1, actor,
   'schedule_time_off_requests', rid::text,
   jsonb_build_object('request_id', rid, 'location_ids', g.location_ids, 'recipient_user_ids', to_jsonb(g.recipients),
    'audience_contract', 'owner_time_off_location_managers', 'category', 'schedule',
    'title', left(coalesce(owner_name, 'The owner') || ' is off — ' || g.n || case when g.n = 1 then ' shift is open' else ' shifts are open' end, 160),
    -- ponytail: 2000 is the notification body limit; a week of shifts is far below it.
    'body', left(g.lines, 2000),
    'safe_preview', 'Time off left shifts open.',
    'action_url', '/app/schedule?date=' || g.first_day::text,
    'group_key', 'schedule_time_off_requests:' || rid::text),
   now());
 end loop;
end;
$$;
revoke all on function public.notify_owner_time_off_open_shifts(uuid, uuid, uuid, integer) from public, anon, authenticated, service_role;

insert into public.notification_producer_registry (type_key, schema_version, producer_id, source_migration, source_function, integration_contract)
values ('schedule.owner_time_off.shifts_opened', 1, 'owner-time-off-open-shifts',
  '20260927130000_owner_time_off_tells_managers.sql', 'notify_owner_time_off_open_shifts', 'outbox_v1');
insert into public.notification_template_versions (type_key, schema_version, channel, locale, template_version, template_key, content, status, published_at)
values ('schedule.owner_time_off.shifts_opened', 1, 'in_app', 'en', 1, 'schedule.owner_time_off.shifts_opened.v1',
  '{"title": "Shifts are open", "body": "Time off left shifts open.", "action_url": "/app/schedule", "safe_preview": "Time off left shifts open."}',
  'published', now());

create or replace function app_private.record_owner_time_off(actor uuid, w uuid, rid uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  r public.schedule_time_off_requests%rowtype;
  preview jsonb;
  result jsonb;
begin
  -- Only the owner's own request; anybody else's is left as it is.
  if not public.time_off_is_the_owners_own(actor, w, rid) then
    return null;
  end if;
  select * into r from public.schedule_time_off_requests where id = rid and workspace_id = w;
  if r.request_type = 'time_off' then
    preview := public.preview_time_off_assignment_decision_service(actor, w, rid, r.revision, 'approve', '[]');
    result := public.decide_time_off_with_assignments_service(actor, w, rid, r.revision, 'approve', '', '[]',
      gen_random_uuid(), preview ->> 'fingerprint',
      coalesce((select jsonb_agg(jsonb_build_object('shift_id', shift ->> 'id', 'action', 'release_entire_shift'))
                from jsonb_array_elements(preview -> 'affected_shifts') shift), '[]'));
    perform public.notify_owner_time_off_open_shifts(actor, w, rid, (result ->> 'revision')::integer);
  else
    result := public.decide_time_off_with_assignments_service(actor, w, rid, r.revision, 'approve', '', '[]',
      gen_random_uuid(), null, '[]');
  end if;
  return jsonb_build_object('status', result ->> 'status', 'request_id', rid, 'revision', (result ->> 'revision')::integer);
end;
$$;

CREATE OR REPLACE FUNCTION public.notify_schedule_request_event_service()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  event_location_id uuid;
  event_employee_id uuid;
  recipient_user_ids uuid[] := '{}'::uuid[];
  notification_type_key text;
  notification_title text;
  notification_body text;
  notification_preview text;
  notification_action_url text;
  audience_contract text;
begin
  select request.location_id, request.employee_id
  into event_location_id, event_employee_id
  from public.schedule_time_off_requests request
  where request.id = new.request_id and request.workspace_id = new.workspace_id;

  if event_location_id is null then
    raise exception 'schedule request location not found' using errcode = 'P0002';
  end if;

  if new.action = 'submitted' then
    -- The owner's own time off is recorded without review (BL-183).
    if public.time_off_is_the_owners_own(new.actor_user_id, new.workspace_id, new.request_id) then
      return new;
    end if;
    notification_type_key := 'requests.time_off.submitted';
    notification_title := 'New time-off request';
    notification_body := 'A schedule request needs manager review.';
    notification_preview := 'A schedule request needs review.';
    notification_action_url := '/app/schedule/requests';
    audience_contract := 'schedule_request_reviewers';

    select coalesce(array_agg(distinct membership.user_id order by membership.user_id), '{}'::uuid[])
    into recipient_user_ids
    from public.workspace_memberships membership
    join public.workspace_role_permissions permission
      on permission.workspace_id = membership.workspace_id
     and permission.role_id = membership.role_id
    where membership.workspace_id = new.workspace_id
      and membership.status = 'active'
      and permission.permission_key = 'schedule.time_off_requests.read'
      and (
        membership.all_locations
        or exists (
          select 1 from public.membership_location_scopes scope
          where scope.membership_id = membership.id
            and scope.workspace_id = new.workspace_id
            and scope.location_id = event_location_id
        )
      );
  elsif new.action not in ('viewed', 'returned_to_pending') then
    notification_type_key := 'requests.time_off.status_changed';
      notification_title := 'Time-off request updated';
      notification_body := 'Your time-off request status changed.';
      notification_preview := 'A schedule request was updated.';
      notification_action_url := '/app/employee-hub/my-availability';
      audience_contract := 'time_off_requester';
      select coalesce(array_agg(employee.user_id), '{}'::uuid[])
      into recipient_user_ids
      from public.employee_profiles employee
      where employee.id = event_employee_id
        and employee.workspace_id = new.workspace_id
        and employee.user_id is not null
        and employee.user_id <> new.actor_user_id;
  else
    return new;
  end if;

  
 if tg_table_name='schedule_time_off_events' and exists(select 1 from public.schedule_time_off_requests r where r.id=new.request_id and r.request_type='time_off_cancellation') then
  if new.action='submitted' then
   notification_title:='Leave cancellation requested';
   notification_body:='Review the proposed cancellation. Approved leave stays in effect until accepted.';
   notification_preview:='A leave cancellation needs review.';
   notification_action_url:='/app/schedule/requests?tab=time-off&request='||new.request_id::text;
  else
   notification_title:='Leave cancellation updated';
   notification_body:=case new.action when 'denied' then 'Your cancellation was declined. The approved leave remains in effect.'
    when 'revoked' then 'Your cancellation request was closed. Review the original leave for its current status.'
    else 'Your leave cancellation was reviewed. See the exact hours in your request. Previously released shifts are not reassigned automatically.' end;
   notification_preview:='A leave cancellation was updated.';
   notification_action_url:='/app/employee-hub/my-availability#request-'||new.request_id::text;
  end if;
 end if;
 perform public.enqueue_notification_outbox_service(
    new.workspace_id,
    new.id,
    notification_type_key,
    1,
    new.actor_user_id,
    tg_table_name,
    new.request_id::text,
    jsonb_build_object(
      'correlation_id', new.id,
      'request_id', new.request_id,
      'request_event_id', new.id,
      'request_action', new.action,
      'location_id', event_location_id,
      'location_ids', jsonb_build_array(event_location_id),
      'recipient_user_ids', to_jsonb(recipient_user_ids),
      'audience_contract', audience_contract,
      'category', 'request',
      'title', notification_title,
      'body', notification_body,
      'safe_preview', notification_preview,
      'action_url', notification_action_url,
      'group_key', tg_table_name || ':' || new.request_id::text
    ),
    new.created_at
  );

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_notification_platform_service()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        and registry.integration_contract = case when catalog.notification_scope='account' then 'account_audit_v1' else 'outbox_v1' end
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
      and not (event.action = 'submitted' and public.time_off_is_the_owners_own(event.actor_user_id, event.workspace_id, event.request_id))
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
$function$;
