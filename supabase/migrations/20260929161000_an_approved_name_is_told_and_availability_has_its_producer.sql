-- G6 additions (KK-17).
--
-- BL-342: when a manager approves a preferred name, the person is told on their
-- own account ("You now go by "Al"."). A refusal stays silent, as before: being
-- told would make a refusal a conversation the workspace did not choose to
-- have. Nobody is told about their own decision. The notice opens the app's
-- home: the person's profile lives outside /app (/account/profile), which a
-- notice link may not name.
--
-- BL-343: availability.status_changed has a producer
-- (weekly_preference_settings_save_service, "Check your availability" when the
-- entry mode changes) but 20260924204854_old_availability_is_gone.sql deleted
-- its registry row together with the retired producer's, so the notification
-- health check reported it as a type nobody produces.

insert into public.notification_catalog (
  type_key, schema_version, category, severity, sensitivity, supported_channels,
  default_cadence, audience_contract, action_route_contract, dedupe_policy,
  retention_class, template_key, lifecycle, mandatory_in_app, notification_scope
)
values (
  'people.preferred_name.approved', 1, 'people', 'success', 'confidential',
  '{in_app}', 'immediate', 'preferred_name_requester',
  '{"route": "/app", "allowed_query_keys": []}',
  '{"scope": "event_recipient", "strategy": "keep_first", "key_fields": ["event_id", "recipient_user_id"]}',
  'sensitive_30d', 'people.preferred_name.approved.v1', 'active', false, 'workspace'
);

create or replace function public.decide_employee_preferred_name_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_request_id uuid,
  approve boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.employee_preferred_name_requests%rowtype;
  person uuid;
begin
  if not public.service_actor_has_permission(
    actor_user_id, target_workspace_id, 'employees.manage'
  ) then
    raise exception 'employee management access required'
      using errcode = '42501', hint = 'workspace.employees_manage_required';
  end if;

  select * into request_row
  from public.employee_preferred_name_requests
  where id = target_request_id
    and workspace_id = target_workspace_id
    and status = 'pending'
  for update;

  if request_row.id is null then
    raise exception 'that request is no longer waiting for an answer'
      using errcode = 'P0002', hint = 'employee.preferred_name.not_pending';
  end if;

  update public.employee_preferred_name_requests
  set status = case when approve then 'approved' else 'rejected' end,
      decided_by = actor_user_id,
      decided_at = now()
  where id = request_row.id;

  if approve then
    update public.employee_profiles
    set preferred_name = request_row.requested_name, updated_at = now()
    where id = request_row.employee_id
    returning user_id into person;

    if person is not null and person <> actor_user_id then
      perform public.enqueue_notification_outbox_service(
        target_workspace_id,
        gen_random_uuid(),
        'people.preferred_name.approved',
        1,
        actor_user_id,
        'employee',
        request_row.employee_id::text,
        jsonb_build_object(
          'employee_id', request_row.employee_id,
          'request_id', request_row.id,
          'recipient_user_ids', jsonb_build_array(person),
          'audience_contract', 'preferred_name_requester',
          'category', 'people',
          'title', 'Preferred name approved',
          'body', 'You now go by "' || request_row.requested_name || '".',
          'safe_preview', 'Your preferred name was approved.',
          'action_url', '/app',
          'group_key', 'employee:' || request_row.employee_id::text
        ),
        now()
      );
    end if;
  end if;
end;
$$;

insert into public.notification_producer_registry (type_key, schema_version, producer_id, source_migration, source_function, integration_contract)
values
  ('people.preferred_name.approved', 1, 'preferred-name-decision',
   '20260929161000_an_approved_name_is_told_and_availability_has_its_producer.sql', 'decide_employee_preferred_name_service', 'outbox_v1'),
  ('availability.status_changed', 1, 'weekly-availability-entry-mode',
   '20260924204854_old_availability_is_gone.sql', 'weekly_preference_settings_save_service', 'outbox_v1');

insert into public.notification_template_versions (type_key, schema_version, channel, locale, template_version, template_key, content, status, published_at)
values ('people.preferred_name.approved', 1, 'in_app', 'en', 1, 'people.preferred_name.approved.v1',
  '{"title": "Preferred name approved", "body": "Your preferred name was approved.", "action_url": "/app", "safe_preview": "Your preferred name was approved."}',
  'published', now());
