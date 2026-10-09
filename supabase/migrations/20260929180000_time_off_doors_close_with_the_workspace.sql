-- G9, first part: three small rules around time off and Shift Hub.
--
-- BL-247: a closed workspace refuses time off at every door. The request and
-- cancellation paths (and every other Employee Hub entry that names its person
-- through employee_hub_actor_service) now ask whether the workspace is open to
-- the person, and so does the owner's own-approval shortcut; the refusal is
-- the core's (42501, authz.workspace_closed). time_off_is_the_owners_own keeps
-- asking only who the person is: the notification check reads it too, and a
-- closed workspace's history must not turn into alarms.
--
-- BL-220: the notification check no longer asks who owns the workspace today.
-- An owner's own request is the one its requester approved in the same moment
-- (record_owner_time_off); that stays true after ownership moves on.
--
-- BL-109: the write guard's refusal is taken by a publication too, so it no
-- longer says a shift change is being reviewed.

create or replace function public.employee_hub_actor_service(actor_user_id uuid, target_workspace_id uuid)
returns public.employee_profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare employee public.employee_profiles%rowtype;
begin
  if not exists (
    select 1 from public.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
  ) then
    raise exception 'active employee membership required' using errcode = '42501';
  end if;
  if not app_private.workspace_open_to_actor(target_workspace_id, actor_user_id) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.workspace_closed';
  end if;
  select * into employee from public.employee_profiles profile
  where profile.workspace_id = target_workspace_id
    and profile.user_id = actor_user_id
    and profile.archived_at is null;
  if employee.id is null then
    raise exception 'employee profile required' using errcode = '42501';
  end if;
  return employee;
end; $$;

create or replace function app_private.authorize_time_off_decision(actor uuid, w uuid, requester uuid, place uuid, verb text)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare state app_private.actor_state := app_private.actor(actor, w);
begin
  -- The owner's own request is recorded approved (record_owner_time_off),
  -- whatever else stands in the owner's way, a missing document included
  -- (BL-221), but not a closed workspace (BL-247). time_off.decide refuses the
  -- owner only their own (rank); everyone else ranks below them.
  if verb = 'approve'
     and state.class = 'owner'
     and state.workspace_open
     and exists (select 1 from public.employee_profiles employee
                 where employee.id = requester and employee.workspace_id = w and employee.user_id = actor) then
    return;
  end if;
  perform app_private.authorize(actor, w, 'time_off.decide', target_locations => array[place], target_person => requester);
end;
$$;

create or replace function public.shift_exchange_guard_eligibility_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare workspaces uuid[]; w uuid;
begin
 if tg_op='INSERT' then workspaces:=array[new.workspace_id];
 elsif tg_op='DELETE' then workspaces:=array[old.workspace_id];
 else workspaces:=array[old.workspace_id,new.workspace_id]; end if;
 for w in select distinct value from unnest(workspaces) value where value is not null order by value loop
  -- The same lock is held by a Shift Hub approval and by a publication.
  if not pg_try_advisory_xact_lock(hashtextextended(w::text,921)) then
   raise exception 'Another change is being saved in this workspace. Your changes were not saved; try again.' using errcode='PT409';
  end if;
 end loop;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;

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
      -- The owner's own request was recorded approved by its requester in the
      -- same moment (record_owner_time_off); that fact is kept on the events, so
      -- the check does not depend on who owns the workspace today (BL-220).
      and not (event.action = 'submitted' and exists (
        select 1 from public.schedule_time_off_events decided
        where decided.workspace_id = event.workspace_id and decided.request_id = event.request_id
          and decided.action in ('approved', 'partially_approved')
          and decided.actor_user_id = event.actor_user_id and decided.created_at = event.created_at))
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

