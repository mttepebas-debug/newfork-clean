-- BL-099 (delivery part), BL-119: a preferred-name notice reaches somebody.
--
-- Before: request_employee_preferred_name_service queued
-- people.preferred_name.review_required / .published with no recipients, so the
-- relay dropped every one ("notification recipients are required"); neither
-- type had a producer or a published template, and the catalog's route key
-- (`employee`) was not the one the Employees screen reads (`employeeId`).
--
-- After: the notice names its recipients: the active members the core lets
-- decide this person's preferred name (employee.decide_preferred_name: in scope,
-- ranked above the person, never the person). On auto nobody decides, and the
-- same people are told the name changed. Nobody to tell (the owner's own name),
-- no notice. It opens the person's record on Employees.
--
-- Out of scope (G7 = FB-6.2.1, KK-11): decide_employee_preferred_name_service
-- and list_pending_preferred_names_service moving to authorize().

update public.notification_catalog
set action_route_contract = '{"route": "/app/employees", "allowed_query_keys": ["employeeId"]}'
where type_key in ('people.preferred_name.review_required', 'people.preferred_name.published')
  and schema_version = 1;

create or replace function public.request_employee_preferred_name_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_employee_id uuid,
  preferred_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_row public.employee_profiles%rowtype;
  approval text;
  cleaned text := btrim(coalesce(preferred_name, ''));
  request_id uuid;
  deciders uuid[];
  full_name text;
begin
  select * into employee_row
  from public.employee_profiles
  where id = target_employee_id
    and workspace_id = target_workspace_id
    and archived_at is null;

  if employee_row.id is null then
    raise exception 'employee not found'
      using errcode = 'P0002', hint = 'employee.not_found';
  end if;
  if employee_row.user_id is distinct from actor_user_id then
    raise exception 'this record belongs to somebody else'
      using errcode = '42501', hint = 'employee.not_yours';
  end if;
  if char_length(cleaned) > 80 then
    raise exception 'a preferred name is at most 80 characters'
      using errcode = '22023', hint = 'employee.preferred_name.too_long';
  end if;

  -- Clearing it is always the person's own business; there is nothing for a
  -- manager to answer about a name that will not be shown.
  if cleaned = '' then
    update public.employee_preferred_name_requests
    set status = 'rejected', decided_by = actor_user_id, decided_at = now()
    where employee_id = target_employee_id and status = 'pending';
    update public.employee_profiles set preferred_name = '', updated_at = now()
    where id = target_employee_id;
    return 'cleared';
  end if;

  approval := coalesce(
    (select preferred_name_approval from public.employee_name_settings
     where workspace_id = target_workspace_id),
    'auto'
  );

  -- Whatever was waiting is replaced: the latest answer is the one asked for.
  update public.employee_preferred_name_requests
  set status = 'rejected', decided_by = actor_user_id, decided_at = now()
  where employee_id = target_employee_id and status = 'pending';

  insert into public.employee_preferred_name_requests (
    workspace_id, employee_id, requested_name, status, requested_by,
    decided_by, decided_at
  )
  values (
    target_workspace_id, target_employee_id, cleaned,
    case when approval = 'auto' then 'approved' else 'pending' end,
    actor_user_id,
    case when approval = 'auto' then actor_user_id end,
    case when approval = 'auto' then now() end
  )
  returning id into request_id;

  if approval = 'auto' then
    update public.employee_profiles
    set preferred_name = cleaned, updated_at = now()
    where id = target_employee_id;
  end if;

  -- Told: whoever the core lets decide this person's preferred name.
  -- ponytail: one core call per active member; a workspace is tens of people.
  select coalesce(array_agg(member.user_id order by member.user_id), '{}')
  into deciders
  from public.workspace_memberships member
  where member.workspace_id = target_workspace_id
    and member.status = 'active'
    and app_private.authz_reason(member.user_id, target_workspace_id,
      'employee.decide_preferred_name', null, target_employee_id) is null;

  if cardinality(deciders) > 0 then
    full_name := concat_ws(' ', employee_row.first_name, employee_row.last_name);
    perform public.enqueue_notification_outbox_service(
      target_workspace_id,
      gen_random_uuid(),
      case
        when approval = 'auto' then 'people.preferred_name.published'
        else 'people.preferred_name.review_required'
      end,
      1,
      actor_user_id,
      'employee',
      target_employee_id::text,
      jsonb_build_object(
        'employee_id', target_employee_id,
        'requested_name', cleaned,
        'request_id', request_id,
        'recipient_user_ids', to_jsonb(deciders),
        'audience_contract', 'workspace_employee_access_managers',
        'category', 'people',
        'title', case when approval = 'auto' then 'Preferred name changed' else 'Preferred name to review' end,
        'body', left(full_name || case when approval = 'auto'
          then ' now goes by "' || cleaned || '".'
          else ' asked to go by "' || cleaned || '".' end, 2000),
        'safe_preview', case when approval = 'auto'
          then 'A preferred name changed.' else 'A preferred name is waiting for review.' end,
        'action_url', '/app/employees?employeeId=' || target_employee_id::text,
        'group_key', 'employee:' || target_employee_id::text
      ),
      now()
    );
  end if;

  return case when approval = 'auto' then 'published' else 'waiting' end;
end;
$$;

insert into public.notification_producer_registry (type_key, schema_version, producer_id, source_migration, source_function, integration_contract)
values
  ('people.preferred_name.review_required', 1, 'preferred-name-request',
   '20260929160000_a_preferred_name_notice_reaches_its_deciders.sql', 'request_employee_preferred_name_service', 'outbox_v1'),
  ('people.preferred_name.published', 1, 'preferred-name-request',
   '20260929160000_a_preferred_name_notice_reaches_its_deciders.sql', 'request_employee_preferred_name_service', 'outbox_v1');

insert into public.notification_template_versions (type_key, schema_version, channel, locale, template_version, template_key, content, status, published_at)
values
  ('people.preferred_name.review_required', 1, 'in_app', 'en', 1, 'people.preferred_name.review_required.v1',
   '{"title": "Preferred name to review", "body": "A preferred name is waiting for review.", "action_url": "/app/employees", "safe_preview": "A preferred name is waiting for review."}',
   'published', now()),
  ('people.preferred_name.published', 1, 'in_app', 'en', 1, 'people.preferred_name.published.v1',
   '{"title": "Preferred name changed", "body": "A preferred name changed.", "action_url": "/app/employees", "safe_preview": "A preferred name changed."}',
   'published', now());
