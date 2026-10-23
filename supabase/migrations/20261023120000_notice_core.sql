-- Notification panel, slice 2, core (KARARLAR S-247 (3), Mert 2026-10-23): every person's notification is their
-- own. A request that closes (approved, declined, cancelled, expired) updates every card it put in a list: the
-- card stops waiting, says what happened and who did it, and stays. Read state is per person.
--
--   * app_private.notification_resolve and app_private.shift_exchange_resolve: the person who closed it (the
--     resolver) has read their own card: read_at and seen_at are set on their row only, kept when already set.
--     Every other recipient's read_at and seen_at stay as they were. Closed by nobody (a sweep, a reminder):
--     nobody's card is read.
--   * public.get_notification_feed_service: each item also says who closed it, as the workspace names people
--     (resolved_by_name, the shift change notices' own naming; null when nobody closed it or the resolver has no
--     profile in this workspace). A card a newer reminder replaced (resolution 'superseded' or
--     'reminded_again') is in no list and no count.
--   * public.mark_notifications_read_service and public.mark_notifications_seen_service: when they change a row,
--     they send the same contentless signal the notices send, so the person's other tabs and phones refresh.
--     The unread count mark-read answers with leaves the replaced cards out, as the list does.
--
--   * app_private.shift_exchange_name: a notice names a person short (KARARLAR S-248, Mert 2026-10-23): the
--     preferred or first name and the last name's initial, "Ali P.". The shift change notices and the closer's
--     name in the list use it; nothing else does.
--
-- Signatures, security, volatility and grants are unchanged (create or replace keeps them).

create or replace function app_private.shift_exchange_name(w uuid, emp uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select btrim(coalesce(nullif(btrim(e.preferred_name), ''), e.first_name)
    || coalesce(' ' || nullif(left(btrim(e.last_name), 1), '') || '.', ''))
  from public.employee_profiles e where e.workspace_id = shift_exchange_name.w and e.id = shift_exchange_name.emp
$$;

create or replace function app_private.notification_resolve(target_workspace uuid, target_subject_type text,
  target_subject_id uuid, target_resolution text, target_resolved_by uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  told uuid[];
  person uuid;
begin
  with closed as (
    update public.person_notifications n
    set resolved_at = now(), resolution = target_resolution, resolved_by = target_resolved_by,
      -- S-247: the one who did it has read their own card; everybody else's stays as it was.
      read_at = case when n.user_id = target_resolved_by then coalesce(n.read_at, now()) else n.read_at end,
      seen_at = case when n.user_id = target_resolved_by then coalesce(n.seen_at, now()) else n.seen_at end
    from public.notification_types t
    where t.key = n.type_key and t.needs_action
      and n.workspace_id = target_workspace and n.subject_type = target_subject_type and n.subject_id = target_subject_id
      and n.resolved_at is null
    returning n.user_id
  )
  select coalesce(array_agg(c.user_id), '{}'::uuid[]) into told from closed c;
  foreach person in array array(select distinct x from unnest(told) x) loop
    perform realtime.send(jsonb_build_object('workspace_id', target_workspace), 'changed', 'notifications:' || person::text, true);
  end loop;
  return cardinality(told);
end;
$$;

create or replace function app_private.shift_exchange_resolve(w uuid, cid uuid, kinds text[], how text, by_user uuid,
  people uuid[] default null::uuid[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  told uuid[];
  person uuid;
begin
  with closed as (
    update public.person_notifications n
    set resolved_at = now(), resolution = how, resolved_by = by_user,
      -- S-247: the one who did it has read their own card; everybody else's stays as it was.
      read_at = case when n.user_id = by_user then coalesce(n.read_at, now()) else n.read_at end,
      seen_at = case when n.user_id = by_user then coalesce(n.seen_at, now()) else n.seen_at end
    from public.notification_types t
    where t.key = n.type_key and t.needs_action
      and n.workspace_id = w and n.subject_type = 'shift_exchange_case' and n.subject_id = cid
      and n.resolved_at is null
      and (kinds is null or n.type_key = any (kinds))
      and (people is null or n.user_id = any (people))
    returning n.user_id
  )
  select coalesce(array_agg(x.user_id), '{}'::uuid[]) into told from closed x;
  foreach person in array array(select distinct x from unnest(told) x) loop
    perform realtime.send(jsonb_build_object('workspace_id', w), 'changed', 'notifications:' || person::text, true);
  end loop;
  return cardinality(told);
end;
$$;

create or replace function public.get_notification_feed_service(actor_user_id uuid, target_workspace_id uuid,
  target_filter text default 'all'::text, target_before timestamp with time zone default null::timestamp with time zone,
  target_before_id uuid default null::uuid, target_limit integer default 30)
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
      -- S-247: a card a newer reminder replaced is in no list and no count.
      and (n.resolution is null or n.resolution not in ('superseded', 'reminded_again'))
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
        'resolved_at', p.resolved_at, 'resolution', p.resolution, 'resolved_by', p.resolved_by,
        -- S-247: who closed it, as this workspace names its people; null without a profile here.
        'resolved_by_name', (select app_private.shift_exchange_name(target_workspace_id, e.id)
                             from public.employee_profiles e
                             where e.workspace_id = target_workspace_id and e.user_id = p.resolved_by)
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

create or replace function public.mark_notifications_read_service(actor_user_id uuid, target_workspace_id uuid,
  target_ids uuid[] default null::uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := actor_user_id;
  updated integer;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'notifications.read_own');
  update public.person_notifications n set read_at = now(), seen_at = coalesce(n.seen_at, now())
  where n.user_id = viewer and (n.workspace_id = target_workspace_id or n.workspace_id is null)
    and n.read_at is null and (target_ids is null or n.id = any(target_ids));
  get diagnostics updated = row_count;
  -- S-247: the person's other tabs and phones refresh; the signal says nothing about the notices.
  if updated > 0 then
    perform realtime.send(jsonb_build_object('workspace_id', target_workspace_id), 'changed', 'notifications:' || viewer::text, true);
  end if;
  return jsonb_build_object('updated', updated, 'unread_count', (
    select count(*) from public.person_notifications n
    where n.user_id = viewer and (n.workspace_id = target_workspace_id or n.workspace_id is null) and n.read_at is null
      -- As the list counts: a card a newer reminder replaced is not counted.
      and (n.resolution is null or n.resolution not in ('superseded', 'reminded_again'))));
end;
$$;

create or replace function public.mark_notifications_seen_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- person_notifications has an actor_user_id column of its own.
  viewer uuid := actor_user_id;
  updated integer;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'notifications.read_own');
  update public.person_notifications n set seen_at = now()
  where n.user_id = viewer and (n.workspace_id = target_workspace_id or n.workspace_id is null)
    and n.seen_at is null;
  get diagnostics updated = row_count;
  -- S-247: the person's other tabs and phones refresh; the signal says nothing about the notices.
  if updated > 0 then
    perform realtime.send(jsonb_build_object('workspace_id', target_workspace_id), 'changed', 'notifications:' || viewer::text, true);
  end if;
  return jsonb_build_object('unseen_count', 0);
end;
$$;
