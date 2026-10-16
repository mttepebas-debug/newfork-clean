-- BILDIRIM-12 (KARARLAR S-123; settings variant A):
--   * a person's notification choices list only the topics they could receive at least one type of, as the
--     core says, never by a role's name. Each type now names the actions it is heard by (heard_by); a topic
--     is listed when the person holds one of its types' actions somewhere (scope_set is not empty), the
--     owner has not turned that type off, and the type is not required. Each listed topic carries its
--     level (optional when every type the person could receive in it is optional, else important) and a
--     line that says what is in it;
--   * the list pages by (created_at, id), newest first: the next page starts after the last row's time and
--     id, given both or neither. Two notices written to one person in one transaction share their time; a
--     page break between them lost one.

-- Who hears each type -------------------------------------------------------------------------------------

alter table public.notification_types add column heard_by text[] not null default '{}';

update public.notification_types t set heard_by = h.actions
from (values
  ('schedule.published', array['employee_hub.read']),
  ('schedule.shift_changed', array['employee_hub.read']),
  ('schedule.shift_added', array['employee_hub.read']),
  ('schedule.shift_removed', array['employee_hub.read']),
  ('schedule.unpublished', array['employee_hub.read']),
  ('schedule.shifts_unassigned', array['schedule.publish']),
  ('schedule.closed_day_removed_shift', array['employee_hub.read']),
  ('schedule.export_email_stopped', array['schedule.export']),
  ('schedule.week_not_published', array['schedule.publish']),
  ('schedule.shift_reminder', array['employee_hub.read']),
  ('shift_changes.open_shift_available', array['exchange.apply_own']),
  ('shift_changes.open_shift_taken', array['exchange.apply_own']),
  ('shift_changes.open_shift_kept', array['exchange.apply_own']),
  ('shift_changes.cover_asked', array['exchange.apply_own']),
  ('shift_changes.cover_taken', array['exchange.apply_own']),
  ('shift_changes.cover_unfilled', array['exchange.offer_own']),
  ('shift_changes.swap_offered', array['exchange.apply_own']),
  ('shift_changes.swap_answered', array['exchange.offer_own']),
  ('shift_changes.approval_needed', array['exchange.approve']),
  ('shift_changes.approval_reminder', array['exchange.approve']),
  ('shift_changes.decided', array['exchange.offer_own', 'exchange.apply_own']),
  ('shift_changes.closed', array['exchange.offer_own', 'exchange.apply_own']),
  ('shift_changes.post_to_open_shifts', array['schedule.edit']),
  ('time_off.requested', array['time_off.decide']),
  ('time_off.decision_reminder', array['time_off.decide']),
  ('time_off.decided', array['time_off.request_own']),
  ('time_off.shortened', array['time_off.request_own', 'time_off.decide']),
  ('availability.updated', array['availability.team_read']),
  ('availability.mode_changed', array['availability.own']),
  ('lineup.shared', array['employee_hub.read']),
  ('lineup.borrowed', array['employee_hub.read']),
  ('people.joined', array['employee.invite']),
  ('people.invitation_declined', array['employee.invite']),
  ('people.invitation_cancelled', array['employee.invite']),
  ('people.onboarding_review_needed', array['onboarding.review']),
  ('people.onboarding_change_requested', array['onboarding.self']),
  ('people.onboarding_completed', array['onboarding.self']),
  ('people.preferred_name_requested', array['employee.decide_preferred_name']),
  ('people.preferred_name_decided', array['employee.request_preferred_name']),
  ('people.no_location', array['employee.terminate']),
  ('documents.requested', array['documents.self']),
  ('documents.review_needed', array['documents.review']),
  ('documents.decided', array['documents.self']),
  ('documents.due_soon', array['documents.self']),
  ('documents.expiring', array['documents.self', 'documents.review']),
  ('documents.access_changed', array['documents.self']),
  ('announcements.published', array['announcement.read']),
  ('announcements.reminder', array['announcement.read']),
  ('announcements.cancelled', array['announcement.read']),
  ('announcements.updated', array['announcement.read']),
  ('announcements.publish_failed', array['announcement.write'])
) h(key, actions)
where t.key = h.key;

-- A type a person may choose names who hears it; a required one always goes and is no choice.
alter table public.notification_types add constraint notification_types_heard_by_check
  check (level = 'required' or cardinality(heard_by) > 0);

-- What each topic is about ------------------------------------------------------------------------------

alter table public.notification_topics add column description text;
update public.notification_topics p set description = d.line
from (values
  ('my_schedule', 'A new week is out, or one of your shifts is added, moved or removed.'),
  ('open_shifts', 'A teammate releases a shift you can pick up.'),
  ('shift_changes', 'Someone asks you to cover or swap, and the answers to your own asks.'),
  ('time_off', 'Decisions on your time off, and approved time off that was shortened.'),
  ('profile', 'Your onboarding steps and your preferred name.'),
  ('documents', 'Documents to sign or upload, their due dates and review results.'),
  ('announcements', 'Posts and important dates for your locations.'),
  ('approvals', 'Time off, shift changes, onboarding, documents and names waiting for your decision.'),
  ('needs_attention', 'Shifts left without anyone, emails that stopped and posts that could not go out.'),
  ('team', 'Availability changes and new members joining.'),
  ('account', 'Your password, sign-in email and sessions.'),
  ('workspace', 'Your role and access, and the workspace closing or billing.')
) d(key, line)
where p.key = d.key;
alter table public.notification_topics alter column description set not null;
alter table public.notification_topics add constraint notification_topics_description_check
  check (char_length(description) between 1 and 160);

-- A person's choices: the topics they could receive -----------------------------------------------------

create or replace function public.get_notification_preferences_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  held text[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'notifications.read_own');
  -- The actions the person holds somewhere in the workspace, as the core says.
  select coalesce(array_agg(x.a), '{}') into held
  from (select distinct unnest(t.heard_by) a from public.notification_types t) x
  where cardinality(app_private.scope_set(actor_user_id, target_workspace_id, x.a)) > 0;

  select jsonb_build_object(
    'channels', jsonb_build_object(
      'in_app', jsonb_build_object('locked', true),
      'email', jsonb_build_object(
        'workspace_enabled', coalesce(s.email_enabled, true),
        'address_on_file', u.email is not null,
        'suppressed', exists (select 1 from public.notification_email_suppressions x where x.email = lower(u.email) and x.cleared_at is null)),
      'push', jsonb_build_object(
        'workspace_enabled', coalesce(s.push_enabled, true),
        'devices', (select count(*) from public.notification_push_subscriptions d where d.user_id = actor_user_id and d.revoked_at is null)),
      'sms', jsonb_build_object('available', false, 'workspace_enabled', coalesce(s.sms_enabled, false))),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', o.key, 'name', o.name, 'level', o.level, 'description', o.description,
        'email', jsonb_build_object('choice', (select p.enabled from public.notification_preferences p
                   where p.workspace_id = target_workspace_id and p.user_id = actor_user_id and p.topic_key = o.key and p.channel = 'email'),
                 'default', o.email_default),
        'push', jsonb_build_object('choice', (select p.enabled from public.notification_preferences p
                   where p.workspace_id = target_workspace_id and p.user_id = actor_user_id and p.topic_key = o.key and p.channel = 'push'),
                 'default', o.push_default)
      ) order by o.position)
      from (
        select tp.key, tp.name, tp.position, tp.description,
          case when bool_and(t.level = 'optional') then 'optional' else 'important' end level,
          bool_or(t.default_email) email_default, bool_or(t.default_push) push_default
        from public.notification_topics tp
        join public.notification_types t on t.topic_key = tp.key and t.level <> 'required'
        where t.heard_by && held
          and not exists (select 1 from public.notification_workspace_muted_types m
                          where m.workspace_id = target_workspace_id and m.type_key = t.key)
        group by tp.key, tp.name, tp.position, tp.description
      ) o
    ), '[]'::jsonb)
  ) into result
  from auth.users u
  left join public.notification_workspace_settings s on s.workspace_id = target_workspace_id
  where u.id = actor_user_id;
  return result;
end;
$$;

-- The list pages by (created_at, id) ----------------------------------------------------------------------

drop function public.get_notification_feed_service(uuid, uuid, text, timestamptz, integer);

create function public.get_notification_feed_service(actor_user_id uuid, target_workspace_id uuid,
  target_filter text default 'all', target_before timestamptz default null, target_before_id uuid default null,
  target_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer uuid := actor_user_id;
  result jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'notifications.read_own');
  if target_filter is null or target_filter not in ('all', 'unread', 'needs_action')
     or target_limit is null or target_limit not between 1 and 100
     -- The next page starts after the last row: its time and its id, both or neither.
     or (target_before is null) <> (target_before_id is null) then
    raise exception 'valid list request required' using errcode = '22023', hint = 'notifications.invalid_list';
  end if;

  with mine as (
    select n.*, t.area, t.topic_key, t.level, t.needs_action
    from public.person_notifications n
    join public.notification_types t on t.key = n.type_key
    where n.user_id = viewer and (n.workspace_id = target_workspace_id or n.workspace_id is null)
  ),
  page as (
    select m.* from mine m
    where (target_before is null or (m.created_at, m.id) < (target_before, target_before_id))
      and (target_filter = 'all'
           or (target_filter = 'unread' and m.read_at is null)
           or (target_filter = 'needs_action' and m.needs_action and m.resolved_at is null))
    order by m.created_at desc, m.id desc
    limit target_limit + 1
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'workspace_id', p.workspace_id, 'type', p.type_key, 'area', p.area, 'topic', p.topic_key,
        'level', p.level, 'needs_action', p.needs_action, 'title', p.title, 'body', p.body, 'url', p.url,
        'data', p.data, 'actor_user_id', p.actor_user_id, 'subject_type', p.subject_type, 'subject_id', p.subject_id,
        'created_at', p.created_at, 'seen_at', p.seen_at, 'read_at', p.read_at,
        'resolved_at', p.resolved_at, 'resolution', p.resolution, 'resolved_by', p.resolved_by
      ) order by p.created_at desc, p.id desc)
      from (select * from page order by page.created_at desc, page.id desc limit target_limit) p
    ), '[]'::jsonb),
    'has_more', (select count(*) from page) > target_limit,
    'unseen_count', (select count(*) from mine where mine.seen_at is null),
    'unread_count', (select count(*) from mine where mine.read_at is null),
    'needs_action_count', (select count(*) from mine where mine.needs_action and mine.resolved_at is null)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_notification_feed_service(uuid, uuid, text, timestamptz, uuid, integer) from public;
grant all on function public.get_notification_feed_service(uuid, uuid, text, timestamptz, uuid, integer) to service_role;
