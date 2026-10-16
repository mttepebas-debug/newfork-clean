-- BILDIRIM-06 (teardown part C2, the last one): the old notification system's objects are dropped.
-- Mert, 2026-10-16 (KARARLAR S-123): the old system goes; nothing is notified until the new one
-- comes (S-96). Part C1 (20261016160000) took every notification call out of the domain work; what is
-- left here only belonged to the notification system:
--   * its 18 tables, its type, its functions (55 signatures) and its live-updates policy;
--   * the columns on domain tables that only recorded a notice (document_notified_restricted,
--     fallback_notified_at, reminded_at, notification_sequence and its index);
--   * Remind on an announcement (S-124: hidden on the web since BILDIRIM-05; the new system brings
--     it back);
--   * the six permissions and three core actions of the notification settings. notifications.read,
--     notifications.read_own, notifications.preferences.write_own and the notifications.read_own
--     action stay for the new system (docs/plan/tasks/BILDIRIM.md);
--   * the Workspace home's Notifications card: six cards now, and the home answer has no
--     notification list or unread count.
-- Kept on purpose: announcements.delivered_to (the announcement's own state) and
-- employee_onboarding_cases.document_notification_checked_at (document maintenance's batch order).
-- No data is kept (S-91): the old notices and outbox rows go with their tables.

-- Domain functions that still named a notification part ---------------------------------------------

-- Document maintenance answers what it did: cases checked, requirements restricted. failed_cases was
-- always 0 once the reminders went (C1).
create or replace function public.documents_maintain_service(target_batch_size integer default 100, at_time timestamp with time zone default now())
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare c public.employee_onboarding_cases%rowtype; checked integer:=0; suspended integer;
begin
 if target_batch_size not between 1 and 500 or at_time is null then raise exception 'valid maintenance batch required' using errcode='22023'; end if;
 -- The restriction first, for every case and on its own.
 suspended:=app_private.document_suspend_overdue();
 -- A batch of cases at a time, oldest checked first.
 for c in select oc.* from public.employee_onboarding_cases oc
  join public.employee_profiles p on p.id=oc.employee_id and p.workspace_id=oc.workspace_id and p.archived_at is null
  join public.workspace_memberships m on m.id=oc.membership_id and m.user_id=p.user_id and m.status in ('active','pending_activation')
  where app_private.workspace_allows_interactive_access(oc.workspace_id)
   and exists(select 1 from public.employee_onboarding_requirements q where q.case_id=oc.id and q.kind in ('document','acknowledgement') and q.lifecycle_retired_at is null)
  order by oc.document_notification_checked_at nulls first,oc.id limit target_batch_size for update of oc skip locked loop
  checked:=checked+1;
  update public.employee_onboarding_cases set document_notification_checked_at=at_time where id=c.id;
 end loop;
 return jsonb_build_object('checked',checked,'suspended',suspended);
end;
$function$;

-- The Workspace home has six cards; Notifications is gone with its list and its unread count.
create or replace function public.normalize_workspace_widget_order(target_widget_order text[])
 returns text[]
 language sql
 immutable security definer
 set search_path to ''
as $function$
  with allowed(value, position) as (
    values
      ('operations', 1),
      ('pending_requests', 2),
      ('open_shifts', 3),
      ('announcements', 4),
      ('todos', 5),
      ('quick_actions', 6)
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
$function$;

create or replace function public.save_workspace_layout_service(actor_user_id uuid, target_workspace_id uuid, target_widget_order text[], target_hidden_widget_ids text[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  allowed constant text[] := array[
    'operations',
    'pending_requests',
    'open_shifts',
    'announcements',
    'todos',
    'quick_actions'
  ];
begin
  -- The home's own gate (KK-34): whoever cannot open it does not arrange it.
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.todos');
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
$function$;

-- A saved layout keeps its order without the Notifications card.
update public.workspace_layout_preferences
set widget_order = array_remove(widget_order, 'notifications'),
    hidden_widget_ids = array_remove(hidden_widget_ids, 'notifications')
where 'notifications' = any(widget_order) or 'notifications' = any(hidden_widget_ids);

create or replace function public.get_workspace_dashboard_service(actor_user_id uuid, target_workspace_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  me app_private.actor_state := app_private.actor(actor_user_id, target_workspace_id);
  read_rule app_private.authz_actions;
  documents_rule app_private.authz_actions;
  schedule_places uuid[];
  result jsonb;
begin
  -- Workspace home is the to-do list's page: one gate (KK-32, KK-34).
  perform app_private.authorize(actor_user_id, target_workspace_id, 'workspace.todos');
  select * into read_rule from app_private.authz_actions r where r.key = 'employee.read';
  select * into documents_rule from app_private.authz_actions r where r.key = 'documents.read';
  schedule_places := app_private.scope_set(actor_user_id, target_workspace_id, 'schedule.read');

  perform public.sync_expiring_document_todos_service(target_workspace_id);

  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'display_name', profile.display_name,
    'metrics', jsonb_build_object(
      'today_shift_count', (
        select count(*)
        from public.schedule_published_shifts shift
        join public.schedule_location_publications publication
          on publication.id = shift.publication_id and publication.status = 'current'
        join public.locations location on location.id = shift.location_id
        where shift.workspace_id = target_workspace_id
          -- Every zone's date is within a day of UTC's: keeps the date index range.
          and shift.scheduled_date between (now() at time zone 'UTC')::date - 1 and (now() at time zone 'UTC')::date + 1
          and shift.location_id = any(schedule_places)
          and shift.scheduled_date = (now() at time zone location.timezone)::date
      ),
      'today_open_shift_count', (
        select count(*)
        from public.schedule_published_shifts shift
        join public.schedule_location_publications publication
          on publication.id = shift.publication_id and publication.status = 'current'
        join public.locations location on location.id = shift.location_id
        where shift.workspace_id = target_workspace_id
          -- Every zone's date is within a day of UTC's: keeps the date index range.
          and shift.scheduled_date between (now() at time zone 'UTC')::date - 1 and (now() at time zone 'UTC')::date + 1
          and shift.location_id = any(schedule_places)
          and shift.employee_id is null
          and shift.scheduled_date = (now() at time zone location.timezone)::date
      ),
      'pending_time_off_count', (select count(*) from public.schedule_time_off_requests request where request.workspace_id = target_workspace_id and request.status = 'pending'
        and app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', request.employee_id) is null)
    ),
    'today_ends_at', (
      select min(((now() at time zone location.timezone)::date + 1)::timestamp at time zone location.timezone)
      from public.locations location
      where location.workspace_id = target_workspace_id
        and location.id = any(schedule_places)
    ),
    'announcements', coalesce((select jsonb_agg(item.value) from (select value from jsonb_array_elements((public.get_announcements_service(actor_user_id, target_workspace_id)->'announcements')) value
      -- K28: what is live; scheduled, past, unpublished and archived stay in the list only.
      where value->>'display_status' = 'published' limit 5) item), '[]'::jsonb),
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
            -- KK-179 (5): a document to-do is read like the documents it is about.
            or app_private.authz_check(me,
                 case when todo.source_type = 'employee_document_expiry' then documents_rule else read_rule end,
                 null, todo.employee_id, null) is null
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
$function$;

-- Remind goes until the new notification system (S-124): it told nobody since part C1. Past
-- "reminded" history rows stay readable.
create or replace function public.set_announcement_state_service(actor_user_id uuid, target_workspace_id uuid, target_announcement_id uuid, target_expected_revision integer, target_action text, target_bring_back uuid[] default '{}'::uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  w uuid := target_workspace_id;
  me app_private.actor_state;
  item public.announcements;
  shown text;
  reason text;
  told integer := 0;
  back jsonb := '[]'::jsonb;
  people uuid[];
begin
  perform app_private.authorize(actor_user_id, w, 'announcement.read');
  if target_action is null or target_action not in ('unschedule', 'unpublish', 'archive', 'bring_back') then
    raise exception 'valid announcement action required' using errcode = '22023', hint = 'announcement.invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(w::text, 931));
  if target_action = 'bring_back' then
    perform public.availability_lock_workspace(w);
  end if;
  perform app_private.announcement_release(w);
  me := app_private.actor(actor_user_id, w);
  select * into item from public.announcements where id = target_announcement_id and workspace_id = w for update;
  if item.id is null or not app_private.announcement_visible(me, item) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.write';
  end if;
  reason := app_private.announcement_reason(me, app_private.announcement_places(item.id), item.created_by,
    app_private.announcement_dates(item));
  if reason is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || reason, detail = 'announcement.write';
  end if;
  shown := app_private.announcement_display_status(item);
  -- A past post can only be archived; an archived one is done (Mert, 2026-10-12).
  if (shown = 'past' and target_action <> 'archive') or shown = 'archived' then
    raise exception 'This post can''t change anymore.' using errcode = 'PT409', hint = 'announcement.read_only';
  end if;
  if item.revision is distinct from target_expected_revision
     or (target_action = 'unschedule' and shown not in ('scheduled', 'publish_failed'))
     or (target_action = 'unpublish' and shown <> 'published')
     or (target_action = 'archive' and shown not in ('draft', 'unpublished', 'past'))
     or (target_action = 'bring_back' and shown <> 'unpublished') then
    raise exception 'This post changed since you opened it.' using errcode = 'PT409', hint = 'announcement.changed';
  end if;

  if target_action = 'unschedule' then
    update public.announcements
    set status = 'draft', scheduled_by = null, choices_saved_at = null, release_failed_at = null, release_error = null
    where id = item.id;
  elsif target_action = 'unpublish' then
    told := case when item.starts_on is null then 0 else coalesce(cardinality(item.delivered_to), 0) end;
    update public.announcements set status = 'unpublished', unpublished_at = now(), delivered_to = '{}' where id = item.id;
  elsif target_action = 'archive' then
    update public.announcements set archived_at = now(), delivered_to = '{}' where id = item.id;
  else
    back := app_private.announcement_bring_back(actor_user_id, item, target_bring_back,
      app_private.announcement_back_rows(item, null, null, '[]'::jsonb));
    if jsonb_array_length(back) = 0 then
      raise exception 'Pick the shifts to bring back.' using errcode = '22023', hint = 'announcement.invalid';
    end if;
    people := array(select distinct (x ->> 'employee_user_id')::uuid from jsonb_array_elements(back) x
                    where x ->> 'employee_user_id' is not null and not coalesce((x ->> 'silent')::boolean, false));
    told := case when item.starts_on is null then 0 else coalesce(cardinality(people), 0) end;
  end if;

  update public.announcements set revision = revision + 1, updated_by = actor_user_id, updated_at = now()
  where id = item.id returning * into item;
  insert into public.announcement_changes (workspace_id, announcement_id, actor_user_id, action, detail)
  values (w, item.id, actor_user_id,
    case target_action when 'unschedule' then 'unscheduled' when 'unpublish' then 'unpublished' when 'archive' then 'archived'
                       else 'brought_back' end,
    jsonb_strip_nulls(jsonb_build_object('told', case when target_action in ('unpublish', 'bring_back') then told end,
      'brought_back', nullif(jsonb_array_length(back), 0))));
  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (w, actor_user_id, 'announcement.' || case target_action when 'unschedule' then 'unscheduled'
      when 'unpublish' then 'unpublished' when 'archive' then 'archived' else 'brought_back' end,
    'announcement', item.id::text, jsonb_build_object('told', told, 'brought_back', jsonb_array_length(back)));
  return jsonb_build_object('status', item.status, 'display_status', app_private.announcement_display_status(item),
    'announcement_id', item.id, 'revision', item.revision, 'archived_at', item.archived_at, 'told', told);
end;
$function$;

-- A time-off request no longer marks "an admin was told" (fallback_notified_at goes below).
create or replace function public.submit_time_off_service(actor uuid, w uuid, periods jsonb, reason text, expected_timezone text, operation_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  employee public.employee_profiles%rowtype;
  zone_name text;
  command jsonb;
  prior public.time_off_commands%rowtype;
  period jsonb;
  resolved jsonb;
  asked jsonb := '[]';
  span tstzrange;
  covered tstzmultirange := '{}';
  rid uuid;
  result jsonb;
begin
  perform public.availability_lock_workspace(w);
  perform app_private.time_off_authorize(actor, w, 'time_off.request_own');
  select * into employee from public.employee_profiles e where e.workspace_id = w and e.user_id = actor and e.archived_at is null;
  if employee.id is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.request_own';
  end if;
  if operation_id is null then raise exception 'A request key is required' using errcode = '22023'; end if;
  command := jsonb_build_object('kind', 'request', 'periods', periods, 'reason', btrim(coalesce(reason, '')), 'expected_timezone', expected_timezone);
  select * into prior from public.time_off_commands c where c.workspace_id = w and c.actor_user_id = actor and c.operation_id = submit_time_off_service.operation_id;
  if found then
    if prior.input <> command then raise exception 'This request key was used for different time-off hours' using errcode = 'PT409', hint = 'time_off.request_reused'; end if;
    return prior.result;
  end if;
  if jsonb_typeof(periods) is distinct from 'array' then raise exception 'Enter the requested time-off periods' using errcode = '22023'; end if;
  if jsonb_array_length(periods) not between 1 and 31 or char_length(btrim(coalesce(reason, ''))) > 1000 then
    raise exception 'Enter between 1 and 31 days and a note of at most 1000 characters' using errcode = '22023'; end if;

  zone_name := app_private.time_off_timezone(w, employee.id);
  if zone_name is null then
    zone_name := expected_timezone;
  elsif expected_timezone is distinct from zone_name then
    raise exception 'The time zone of your location changed. Review the hours in the current time zone before sending' using errcode = 'PT409', hint = 'time_off.timezone_changed';
  end if;

  for period in select value from jsonb_array_elements(periods) loop
    resolved := public.time_off_resolve_period(period, zone_name);
    span := tstzrange((resolved ->> 'starts_at')::timestamptz, (resolved ->> 'ends_at')::timestamptz, '[)');
    if covered && span then raise exception 'Requested time-off periods must not overlap or repeat' using errcode = '22023'; end if;
    covered := covered + tstzmultirange(span);
    asked := asked || jsonb_build_array(resolved);
  end loop;
  if lower(range_merge(covered)) <= now() then
    raise exception 'Time off that has already started cannot be asked for here. Talk to your manager directly' using errcode = '22023';
  end if;
  if (select max((p ->> 'segment_date')::date) - min((p ->> 'segment_date')::date) + 1 <> count(distinct p ->> 'segment_date')
      from jsonb_array_elements(asked) p) then
    raise exception 'A request is one run of days in a row' using errcode = '22023';
  end if;
  if exists (select 1 from public.schedule_time_off_requests other
    join public.schedule_time_off_segments s on s.request_id = other.id and s.workspace_id = other.workspace_id
    where other.workspace_id = w and other.employee_id = employee.id and other.request_type = 'time_off'
      and other.status in ('pending', 'approved') and s.status in ('pending', 'approved')
      and covered && public.time_off_effective_ranges(s.id)) then
    raise exception 'overlapping time off request exists' using errcode = '23514';
  end if;

  insert into public.schedule_time_off_requests(workspace_id, employee_id, reason, created_by, decide_by)
  values (w, employee.id, btrim(coalesce(reason, '')), actor, app_private.time_off_decide_by(w, lower(range_merge(covered))))
  returning id into rid;
  insert into public.schedule_time_off_segments(workspace_id, request_id, segment_date, start_time, end_time, time_timezone, starts_at, ends_at, ends_next_day, fold_choices)
  select w, rid, (p ->> 'segment_date')::date, (p ->> 'start_time')::time, (p ->> 'end_time')::time, p ->> 'time_timezone',
    (p ->> 'starts_at')::timestamptz, (p ->> 'ends_at')::timestamptz, (p ->> 'ends_next_day')::boolean, p -> 'fold_choices'
  from jsonb_array_elements(asked) p;
  insert into public.time_off_required_locations(request_id, workspace_id, location_id)
  select rid, w, place from unnest(app_private.time_off_deciding_locations(w, employee.id)) place;
  insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, metadata)
  values (w, rid, 'submitted', actor, jsonb_build_object('periods', asked, 'operation_id', submit_time_off_service.operation_id));
  -- The owner's own time off is recorded approved (K12, BL-221).
  if public.time_off_is_the_owners_own(actor, w, rid) then
    perform app_private.time_off_finalize(w, rid, 'approve', actor, '', true);
  end if;
  select jsonb_build_object('status', r.status, 'request_id', r.id, 'revision', r.revision, 'decide_by', r.decide_by) into result
  from public.schedule_time_off_requests r where r.id = rid;
  insert into public.time_off_commands(workspace_id, actor_user_id, operation_id, input, result)
  values (w, actor, submit_time_off_service.operation_id, command, result);
  return result;
end;
$function$;

create or replace function public.request_time_off_cancellation_service(actor uuid, w uuid, parent_id uuid, expected_revision integer, periods jsonb, reason text, operation_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  employee public.employee_profiles%rowtype;
  parent public.schedule_time_off_requests%rowtype;
  original public.schedule_time_off_segments%rowtype;
  prior public.time_off_commands%rowtype;
  command jsonb;
  result jsonb;
  p jsonb;
  a timestamptz;
  b timestamptz;
  span tstzrange;
  covered tstzmultirange := '{}';
  rid uuid := gen_random_uuid();
  sid uuid;
begin
  perform public.availability_lock_workspace(w);
  perform app_private.time_off_authorize(actor, w, 'time_off.request_own');
  select r.* into parent from public.schedule_time_off_requests r
  join public.employee_profiles e on e.id = r.employee_id and e.workspace_id = r.workspace_id
  where r.id = parent_id and r.workspace_id = w and e.user_id = actor and e.archived_at is null
  for update of r;
  if parent.id is null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'time_off.request_own';
  end if;
  if operation_id is null then raise exception 'A cancellation request key is required' using errcode = '22023'; end if;
  command := jsonb_build_object('kind', 'cancellation', 'parent', parent_id, 'revision', expected_revision, 'reason', btrim(coalesce(reason, '')), 'periods', periods);
  select * into prior from public.time_off_commands c where c.workspace_id = w and c.actor_user_id = actor and c.operation_id = request_time_off_cancellation_service.operation_id;
  if found then
    if prior.input <> command then raise exception 'This request key was used for a different cancellation' using errcode = 'PT409', hint = 'time_off.request_reused'; end if;
    return prior.result;
  end if;
  if expected_revision is null or parent.revision <> expected_revision or parent.request_type <> 'time_off' or parent.status <> 'approved' then
    raise exception 'stale approved leave; refresh before requesting cancellation' using errcode = 'PT409', hint = 'time_off.changed'; end if;
  if exists (select 1 from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id = cl.request_id
    where cl.parent_request_id = parent.id and cr.status = 'pending') then
    raise exception 'A cancellation request is already pending for this leave' using errcode = '23514'; end if;
  if jsonb_typeof(periods) is distinct from 'array' then raise exception 'Choose approved hours to cancel' using errcode = '22023'; end if;
  if jsonb_array_length(periods) not between 1 and 124 or char_length(btrim(coalesce(reason, ''))) > 1000 then
    raise exception 'Choose up to 124 periods and a note of at most 1000 characters' using errcode = '22023'; end if;

  insert into public.schedule_time_off_requests(id, workspace_id, employee_id, request_type, reason, created_by)
  values (rid, w, parent.employee_id, 'time_off_cancellation', btrim(coalesce(reason, '')), actor);
  insert into public.time_off_cancellation_links values (rid, w, parent.id, parent.revision);
  for p in select value from jsonb_array_elements(periods) loop
    -- A malformed id is a bad request, not a server error (R2-55).
    if coalesce(p ->> 'segment_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Choose an approved period from this leave' using errcode = '22023'; end if;
    select * into original from public.schedule_time_off_segments where id = (p ->> 'segment_id')::uuid and workspace_id = w and request_id = parent.id;
    if original.id is null then raise exception 'Choose an approved period from this leave' using errcode = '22023'; end if;
    if coalesce(p ->> 'starts_at', '') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or coalesce(p ->> 'ends_at', '') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
      raise exception 'Cancellation needs exact start and end instants' using errcode = '22023'; end if;
    a := (p ->> 'starts_at')::timestamptz; b := (p ->> 'ends_at')::timestamptz;
    if not isfinite(a) or not isfinite(b) or a >= b or a <= now() then raise exception 'Only future approved hours can be cancelled' using errcode = '22023'; end if;
    span := tstzrange(a, b, '[)');
    if not (public.time_off_effective_ranges(original.id) @> span) or covered && span then
      raise exception 'Cancellation must select approved hours without overlap' using errcode = '22023'; end if;
    covered := covered + tstzmultirange(span);
    sid := gen_random_uuid();
    insert into public.schedule_time_off_segments(id, workspace_id, request_id, segment_date, start_time, end_time, time_timezone, starts_at, ends_at, ends_next_day)
    values (sid, w, rid, (a at time zone original.time_timezone)::date, (a at time zone original.time_timezone)::time, (b at time zone original.time_timezone)::time,
      original.time_timezone, a, b, (b at time zone original.time_timezone)::date > (a at time zone original.time_timezone)::date);
    insert into public.time_off_cancellation_periods values (sid, w, rid, original.id, parent.id);
  end loop;
  update public.schedule_time_off_requests set decide_by = app_private.time_off_decide_by(w, lower(range_merge(covered))) where id = rid;
  insert into public.time_off_required_locations(request_id, workspace_id, location_id)
  select rid, w, place from unnest(app_private.time_off_deciding_locations(w, parent.employee_id)) place;
  insert into public.schedule_time_off_events(workspace_id, request_id, action, actor_user_id, note, metadata)
  values (w, rid, 'submitted', actor, btrim(coalesce(reason, '')),
    jsonb_build_object('parent_request_id', parent.id, 'parent_revision', parent.revision, 'operation_id', request_time_off_cancellation_service.operation_id));
  if public.time_off_is_the_owners_own(actor, w, rid) then
    perform app_private.time_off_finalize(w, rid, 'approve', actor, '', true);
  end if;
  select jsonb_build_object('status', r.status, 'request_id', r.id, 'revision', r.revision, 'decide_by', r.decide_by) into result
  from public.schedule_time_off_requests r where r.id = rid;
  insert into public.time_off_commands(workspace_id, actor_user_id, operation_id, input, result)
  values (w, actor, request_time_off_cancellation_service.operation_id, command, result);
  return result;
end;
$function$;

-- Live updates ------------------------------------------------------------------------------------

drop policy "people hear their own account notifications" on realtime.messages;

-- Functions ---------------------------------------------------------------------------------------
-- Nothing outside this list calls any of them (measured on pg_proc.prosrc, word boundaries; the
-- domain_work_outlives_notifications test keeps it so). Dropped before the tables: two take a
-- notification table's row type.

drop function
  app_private.announcement_deliver(uuid, public.announcements, uuid[], text, jsonb),
  app_private.announcement_notice(public.announcements, uuid, text, jsonb),
  app_private.announcement_on_text(date, date),
  app_private.announcement_shift_sentence(jsonb, boolean, boolean, text),
  app_private.announcement_tell_failed(public.announcements, text),
  app_private.communication_withdraw(uuid, text, text, text, text, uuid[]),
  app_private.document_account_inbox_action_base(uuid, uuid, uuid, text),
  app_private.document_account_inbox_allowed(uuid, uuid),
  app_private.document_notification_policy(uuid, uuid, jsonb),
  app_private.document_notify_access(uuid, uuid, uuid),
  app_private.enqueue_document_notification(uuid, uuid, uuid, text, text, text, text, uuid, uuid),
  app_private.notify_document_audit(),
  app_private.project_account_security_notification(),
  app_private.termination_notify_shifts_unassigned(uuid, uuid, uuid),
  app_private.time_off_deciders(uuid, uuid, boolean),
  app_private.time_off_notice(uuid, uuid, text, uuid[], text, text, text),
  app_private.time_off_notify_shifts_opened(uuid, uuid, uuid, integer),
  app_private.time_off_opened_shifts_told(uuid, uuid, uuid, integer),
  public.act_on_notification_inbox_item_v2_service(uuid, uuid, uuid, text),
  public.act_on_notification_inbox_workspace_base(uuid, uuid, uuid, text),
  public.enqueue_notification_outbox_service(uuid, uuid, text, integer, uuid, text, text, jsonb, timestamp with time zone),
  public.fail_notification_outbox_service(text, uuid, text, integer, integer),
  public.flush_shift_exchange_notifications_service(uuid, uuid, integer),
  public.get_notification_inbox_v2_service(uuid, uuid, text, text, text, timestamp with time zone, uuid, integer),
  public.get_notification_inbox_v2_service(uuid, uuid, timestamp with time zone, uuid, integer),
  public.get_notification_settings_service(uuid, uuid),
  public.get_notification_user_preferences_service(uuid, uuid),
  public.get_notification_user_preferences_workspace_base(uuid, uuid),
  public.get_notifications_service(uuid, uuid, text, boolean, timestamp with time zone, integer),
  public.lease_notification_outbox_service(text, integer, integer),
  public.notification_actor_is_active_member_service(uuid, uuid),
  public.notification_default_channels_service(uuid, text),
  public.notification_user_channel_lock_reason_service(uuid, uuid, text, text),
  public.notification_user_channel_lock_reason_workspace_base(uuid, uuid, text, text),
  public.notification_user_preference_to_json(public.notification_user_preferences),
  public.notify_schedule_request_event_service(),
  public.notify_time_off_shortened(uuid, uuid, uuid, tstzmultirange, text, jsonb),
  public.preview_notification_policy_service(uuid, uuid, text, text, uuid),
  public.process_notification_outbox_before_signal(text, uuid),
  public.process_notification_outbox_service(text, uuid),
  public.project_notification_event_service(uuid),
  public.project_notification_inbox_exchange_base(uuid),
  public.project_notification_inbox_service(uuid),
  public.project_notification_recipients_service(uuid),
  public.project_schedule_notification_recipients_service(uuid),
  public.reconcile_notification_platform_service(),
  public.record_account_security_notification_service(uuid, text),
  public.reset_notification_policies_service(uuid, uuid, text, text, text),
  public.resolve_notification_policy_v1_service(uuid, uuid, text, text, uuid, uuid, jsonb),
  public.save_notification_policy_service(uuid, uuid, text, integer, text, uuid, integer, boolean, text[], text, text),
  public.save_notification_user_preferences_service(uuid, uuid, jsonb),
  public.shift_exchange_emit_notification_base(uuid, uuid, uuid, uuid, uuid, text, text),
  public.shift_exchange_notification_allowed(uuid, uuid),
  public.shift_exchange_notification_policy_service(uuid, uuid, jsonb),
  public.shift_exchange_sync_notifications(uuid, uuid);

-- time_off_alone_deciders was only time_off_deciders' helper.
drop function app_private.time_off_alone_deciders;

-- Tables and type -----------------------------------------------------------------------------------
-- One statement: they reference each other. Their policies, indexes (notification_outbox_staffing_delivery,
-- notifications_staffing_subject) and grants go with them.

drop table
  public.notification_outbox,
  public.notification_catalog,
  public.notification_inbox_items,
  public.notification_recipients,
  public.notification_audit_log,
  public.notification_events,
  public.notification_org_policies,
  public.notifications,
  public.account_notification_items,
  public.notification_template_versions,
  public.notification_user_preferences,
  public.notification_recipient_decisions,
  public.notification_producer_registry,
  public.notification_consents,
  public.notification_endpoints,
  public.notification_delivery_attempts,
  app_private.document_notification_dedup,
  app_private.notification_legacy_default_accounts;

drop type public.notification_category;

-- Columns that only recorded a notice ------------------------------------------------------------------

alter table public.employee_onboarding_cases drop column document_notified_restricted;
alter table public.schedule_time_off_requests drop column fallback_notified_at, drop column reminded_at;
-- The history's order is created_at, id (refresh_weekly_exchange_terms since C1); the sequence goes
-- with its identity column.
drop index public.shift_exchange_event_notification_order;
alter table public.shift_exchange_events drop column notification_sequence;

-- Notification settings permissions and actions -----------------------------------------------------
-- Each role loses them; the three that stay are for the new system.

delete from app_private.role_permission_dependencies
where permission_key in ('notifications.settings.read', 'notifications.settings.write', 'notifications.test_send',
                         'notifications.delivery_audit.read', 'notifications.dlq.replay', 'notifications.broadcast.approve')
   or required_key in ('notifications.settings.read', 'notifications.settings.write', 'notifications.test_send',
                       'notifications.delivery_audit.read', 'notifications.dlq.replay', 'notifications.broadcast.approve');

delete from app_private.authz_actions
where key in ('settings.notifications.read', 'settings.notifications.write', 'settings.notifications.test');

delete from public.workspace_role_permissions
where permission_key in ('notifications.settings.read', 'notifications.settings.write', 'notifications.test_send',
                         'notifications.delivery_audit.read', 'notifications.dlq.replay', 'notifications.broadcast.approve');

delete from public.permissions
where key in ('notifications.settings.read', 'notifications.settings.write', 'notifications.test_send',
              'notifications.delivery_audit.read', 'notifications.dlq.replay', 'notifications.broadcast.approve');
