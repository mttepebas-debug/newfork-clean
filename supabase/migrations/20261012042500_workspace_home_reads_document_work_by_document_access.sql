-- Workspace home, two findings of its review (KK-179).
--
-- (5) BL-807: Ayse (Kadikoy, built-in Manager, no document access) saw
-- "Expired employee document · Ali Brown" in her to-dos and could not open the
-- document; its notification went only to people with document access. A
-- document-expiry to-do is now read with documents.read, the rule its
-- notification uses (sync_expiring_document_todos_service); every other to-do
-- about a person keeps employee.read. Nobody reads more than before.
--
-- (2) BL-805: an owner or admin with no account row (user_profiles) opened
-- Workspace and got "Internal server error": the dashboard is built from that
-- row, nothing made one at sign-up, and the 'Manager' stand-in went in the
-- 2026-09-08 rewrite. The rule is now the database's: a membership that can
-- open the app (active, pending_activation) opens its account row when there
-- is none, named like the onboarding fallback does (account metadata, the
-- person's record, the email's local part). A row that exists is never touched,
-- and an account whose deletion finished does not come back. Members without a
-- row today get one here; nothing is deleted. The dashboard's 'Manager'
-- stand-in goes (BL-816).
--
-- The dashboard is replaced whole, and only from the body it has today
-- (20261009130000); any other body stops the migration.
do $guard$
begin
  if md5(pg_get_functiondef('public.get_workspace_dashboard_service(uuid,uuid)'::regprocedure))
      <> 'f4bc852dbadaeb0072af6b1b3c1abc14' then
    raise exception 'KK-179: get_workspace_dashboard_service is not the body this replaces';
  end if;
end
$guard$;

-- 1. Every member has an account row -----------------------------------------

create or replace function app_private.open_account_row(target_user_id uuid, target_workspace_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.user_profiles (user_id, display_name)
  select
    account.id,
    left(coalesce(
      nullif(btrim(account.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(account.raw_user_meta_data ->> 'full_name'), ''),
      (select nullif(btrim(record.first_name || ' ' || record.last_name), '')
       from public.employee_profiles record
       where record.workspace_id = target_workspace_id
         and record.user_id = account.id
         and record.archived_at is null
       order by record.created_at
       limit 1),
      nullif(btrim(split_part(account.email, '@', 1)), ''),
      'Team member'
    ), 100)
  from auth.users account
  where account.id = target_user_id
    and not exists (
      select 1 from public.account_deletion_requests deletion
      where deletion.user_id = account.id and deletion.status = 'completed'
    )
  on conflict (user_id) do nothing;
$$;

revoke all on function app_private.open_account_row(uuid, uuid) from public, anon, authenticated;

create or replace function app_private.every_member_has_an_account_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('active', 'pending_activation') then
    perform app_private.open_account_row(new.user_id, new.workspace_id);
  end if;
  return null;
end;
$$;

revoke all on function app_private.every_member_has_an_account_row() from public, anon, authenticated;

drop trigger if exists every_member_has_an_account_row on public.workspace_memberships;
create trigger every_member_has_an_account_row
after insert or update of user_id, status on public.workspace_memberships
for each row execute function app_private.every_member_has_an_account_row();

-- Members without a row today (Mert's local Meyhouse admin, half-finished
-- owner setups) get one; nothing is deleted. A new row has no phone, and the
-- account is the phone's only source (KK-7): account_phone_reaches_employee_records
-- would clear a phone a record kept from before KK-7. Such a person stops the
-- migration instead of losing the number silently.
do $phones$
declare
  kept integer;
begin
  select count(distinct member.user_id) into kept
  from public.workspace_memberships member
  join public.employee_profiles record
    on record.workspace_id = member.workspace_id and record.user_id = member.user_id and record.archived_at is null
  join public.employee_private_profiles private_record
    on private_record.employee_id = record.id and private_record.workspace_id = record.workspace_id
  where member.status in ('active', 'pending_activation')
    and private_record.phone is not null
    and not exists (select 1 from public.user_profiles profile where profile.user_id = member.user_id);
  if kept > 0 then
    raise exception 'KK-179: % member(s) without an account row keep a phone on their record; ask before it is cleared', kept;
  end if;
end
$phones$;

select app_private.open_account_row(member.user_id, member.workspace_id)
from public.workspace_memberships member
where member.status in ('active', 'pending_activation')
  and not exists (select 1 from public.user_profiles profile where profile.user_id = member.user_id);

-- 2. Workspace home -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_workspace_dashboard_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        and app_private.time_off_reason(actor_user_id, target_workspace_id, 'requests.read', request.employee_id) is null),
      'unread_notification_count', (select count(*) from public.notifications notification where notification.workspace_id = target_workspace_id and notification.recipient_user_id = actor_user_id and notification.dismissed_at is null and notification.read_at is null and notification.created_at <= now())
    ),
    'today_ends_at', (
      select min(((now() at time zone location.timezone)::date + 1)::timestamp at time zone location.timezone)
      from public.locations location
      where location.workspace_id = target_workspace_id
        and location.id = any(schedule_places)
    ),
    'announcements', coalesce((select jsonb_agg(item.value) from (select value from jsonb_array_elements((public.get_announcements_service(actor_user_id, target_workspace_id)->'announcements')) value
      -- K28: what is live; archived, expired and couldn't-publish stay in the list only.
      where value->>'display_status' in ('published', 'scheduled') and value->>'archived_at' is null
        and (value->>'publish_at')::timestamptz <= now() limit 5) item), '[]'::jsonb),
    'notifications', coalesce(public.get_notifications_service(actor_user_id, target_workspace_id, null, false, null, 5)->'notifications', '[]'::jsonb),
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
            -- KK-179 (5): a document to-do is read like its notification.
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
          'notifications',
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
