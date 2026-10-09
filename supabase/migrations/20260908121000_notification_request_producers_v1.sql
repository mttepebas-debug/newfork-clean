update public.notification_catalog
set lifecycle = 'active'
where type_key in (
  'requests.time_off.submitted',
  'requests.time_off.status_changed',
  'requests.shift_change.submitted',
  'requests.shift_change.status_changed'
)
and schema_version = 1;

update public.notification_template_versions template
set content = case template.type_key
      when 'requests.time_off.submitted' then jsonb_build_object(
        'title', 'New time-off request',
        'body', 'A time-off request needs manager review.',
        'safe_preview', 'A schedule request needs review.',
        'action_url', '/app/schedule/requests'
      )
      when 'requests.time_off.status_changed' then jsonb_build_object(
        'title', 'Time-off request updated',
        'body', 'Your time-off request status changed.',
        'safe_preview', 'A schedule request was updated.',
        'action_url', '/app/employee-hub/my-availability'
      )
      when 'requests.shift_change.submitted' then jsonb_build_object(
        'title', 'New shift request',
        'body', 'A shift request needs manager review.',
        'safe_preview', 'A schedule request needs review.',
        'action_url', '/app/schedule/requests'
      )
      else jsonb_build_object(
        'title', 'Shift request updated',
        'body', 'A shift request involving you changed.',
        'safe_preview', 'A schedule request was updated.',
        'action_url', '/app/employee-hub/shift-hub'
      )
    end,
    status = 'published',
    published_at = coalesce(template.published_at, now())
where template.type_key in (
  'requests.time_off.submitted',
  'requests.time_off.status_changed',
  'requests.shift_change.submitted',
  'requests.shift_change.status_changed'
)
and template.schema_version = 1
and template.channel = 'in_app'
and template.locale = 'en'
and template.template_version = 1;

create or replace function public.notify_schedule_request_event_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
  if tg_table_name = 'schedule_time_off_events' then
    select request.location_id, request.employee_id
    into event_location_id, event_employee_id
    from public.schedule_time_off_requests request
    where request.id = new.request_id and request.workspace_id = new.workspace_id;
  else
    select shift.location_id
    into event_location_id
    from public.schedule_shift_change_requests request
    join public.schedule_published_shifts shift on shift.id = request.offered_shift_id
    where request.id = new.request_id and request.workspace_id = new.workspace_id;
  end if;

  if event_location_id is null then
    raise exception 'schedule request location not found' using errcode = 'P0002';
  end if;

  if new.action = 'submitted' then
    notification_type_key := case when tg_table_name = 'schedule_time_off_events'
      then 'requests.time_off.submitted' else 'requests.shift_change.submitted' end;
    notification_title := case when tg_table_name = 'schedule_time_off_events'
      then 'New time-off request' else 'New shift request' end;
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
      and permission.permission_key = case when tg_table_name = 'schedule_time_off_events'
        then 'schedule.time_off_requests.read' else 'schedule.shift_change_requests.read' end
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
    if tg_table_name = 'schedule_time_off_events' then
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
      notification_type_key := 'requests.shift_change.status_changed';
      notification_title := 'Shift request updated';
      notification_body := 'A shift request involving you changed.';
      notification_preview := 'A schedule request was updated.';
      notification_action_url := '/app/employee-hub/shift-hub';
      audience_contract := 'shift_change_participants';
      select coalesce(array_agg(distinct employee.user_id order by employee.user_id), '{}'::uuid[])
      into recipient_user_ids
      from public.schedule_shift_change_participants participant
      join public.employee_profiles employee
        on employee.id = participant.employee_id
       and employee.workspace_id = participant.workspace_id
      where participant.request_id = new.request_id
        and participant.workspace_id = new.workspace_id
        and employee.user_id is not null
        and employee.user_id <> new.actor_user_id;
    end if;
  else
    return new;
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
$$;

revoke all on function public.notify_schedule_request_event_service() from public, anon, authenticated;
