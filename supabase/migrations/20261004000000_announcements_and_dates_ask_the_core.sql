-- FB-6.7 (part A, the adding half): announcements and important dates ask the
-- authorization core, and follow Mert's rules of 2026-10-02 (KARARLAR
-- "Duyurular ve önemli tarihler", K1-K6).
--
--   K1 a record at several locations, or at none (the whole workspace), is an
--      admin's or the owner's: the core's org/write rule, which reaches no
--      manager under M2 (announcement.write_wide, important_date.write_wide).
--      A record at one location is a place/write action (announcement.write,
--      important_date.write).
--   K2 nobody edits a record whose author outranks them, by the author's role
--      today (KK-87): authz_actions.outranked_no.
--   K3 a manager edits, archives, unpublishes and republishes another
--      manager's record where they manage: the place rule.
--   K4 a content change resets acknowledgements and tells everybody again; a
--      change of who it is for only tells the new people; republishing the
--      same content tells only those who have not acknowledged (an
--      announcement) or opened it (an important date; Mert, 2026-10-02: an
--      important date has no acknowledgement).
--   K5 it reaches the people it targets, every manager of its locations, the
--      owner and the admins; never its own author (KK-89).
--   K6 a manager sees a record at any location they manage, with the names of
--      its other locations; not one only at locations they do not manage. An
--      archived location counts nowhere (KK-86).
--
-- Unpublish and Archive are two things and both come back (Mert, 2026-10-02):
-- unpublished hides it from its people and keeps it editable; archived moves it
-- to "Show archived", and Restore brings it back unpublished, telling nobody.
--
-- Old paths keep working until the removing half (20261004010000) runs after
-- main has the new API and web (KARARLAR OPS-03): the browser's own writes to
-- important_dates, cancel_announcement_service, the old helpers.

-- 1. The core -----------------------------------------------------------------------

alter table app_private.authz_actions
  add column outranked_no boolean not null default false;
comment on column app_private.authz_actions.outranked_no is
  'No when target_user (the record''s author) outranks the actor today (FB-6.7 K2, KK-87).';

update app_private.authz_actions
set scope_class = 'place', outranked_no = true
where key in ('announcement.write', 'important_date.write');

insert into app_private.authz_actions (key, scope_class, effect, permission_key, outranked_no) values
  ('announcement.write_wide', 'org', 'write', 'announcements.manage', true),
  ('important_date.write_wide', 'org', 'write', 'important_dates.manage', true);

create or replace function app_private.authz_check(state app_private.actor_state, rule_row app_private.authz_actions, target_locations uuid[], target_person uuid, target_user uuid)
 returns text
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  target_workspace uuid;
  person uuid := target_person;
  whose uuid;
  target_access public.workspace_role;
  target_is_self boolean;
  places uuid[];
  reach text;
begin
  if state.user_id is null then
    return 'not_member';
  end if;
  if rule_row.scope_class = 'account' then
    -- An account action is about one's own account.
    if target_user is not null and target_user is distinct from state.user_id then
      return 'out_of_scope';
    end if;
    return null;
  end if;
  if state.membership_id is null then
    return 'not_member';
  end if;
  if not state.workspace_open then
    return 'workspace_closed';
  end if;

  if person is not null then
    select profile.workspace_id, profile.user_id into target_workspace, whose
    from public.employee_profiles profile
    where profile.id = person;
    if target_workspace is distinct from state.workspace_id then
      return 'out_of_scope';
    end if;
  end if;
  if target_user is not null then
    if person is not null and whose is distinct from target_user then
      return 'out_of_scope';
    end if;
    whose := target_user;
    if person is null then
      select profile.id into person
      from public.employee_profiles profile
      where profile.workspace_id = state.workspace_id
        and profile.user_id = target_user
        and profile.archived_at is null;
      if person is null and not exists (
        select 1 from public.workspace_memberships membership
        where membership.workspace_id = state.workspace_id and membership.user_id = target_user
      ) then
        return 'out_of_scope';
      end if;
    end if;
  end if;
  target_is_self := coalesce(whose = state.user_id, false);

  -- Their own row is theirs to read in any state.
  if rule_row.self_ok and target_is_self then
    return null;
  end if;

  if state.status = 'pending_activation' then
    if not rule_row.restricted_ok then
      return 'not_active';
    end if;
  elsif state.status <> 'active' then
    return 'not_active';
  elsif state.document_blocked and not rule_row.restricted_ok then
    return 'document_blocked';
  end if;

  if rule_row.scope_class = 'own' then
    if (person is null and whose is null) or target_is_self then
      return null;
    end if;
    return 'out_of_scope';
  end if;

  if rule_row.owner_only and state.class <> 'owner' then
    return 'owner_only';
  end if;
  -- The owner holds every permission.
  if state.class <> 'owner'
     and rule_row.permission_key is not null
     and not rule_row.permission_key = any (state.permissions) then
    return 'missing_permission';
  end if;
  if state.class = 'employee' then
    return 'missing_permission';
  end if;

  if rule_row.no_self and target_is_self then
    return 'rank';
  end if;
  -- A manager's own record goes one level up; owners and admins keep theirs
  -- (user decision 2026-09-24, 2A).
  if rule_row.rank_below and target_is_self and state.class not in ('owner', 'admin') then
    return 'rank';
  end if;
  if rule_row.rank_below and (person is not null or whose is not null) and not target_is_self then
    select role.access_class into target_access
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    where membership.workspace_id = state.workspace_id and membership.user_id = whose;
    -- ponytail: somebody without a membership yet ranks as an employee; use the
    -- invitation's role if a manager ever invites into a higher one.
    if app_private.authz_rank(coalesce(target_access, 'employee')) >= app_private.authz_rank(state.class) then
      return 'rank';
    end if;
  end if;

  -- Some actions are about employees only: never a manager, an admin or the
  -- owner, whoever asks, themselves included (the Manager note, 2026-09-26).
  if rule_row.employee_target and (person is not null or whose is not null)
     and not app_private.ranks_as_employee(state.workspace_id, whose) then
    return 'rank';
  end if;

  -- A record whose author outranks the actor today is not theirs to change;
  -- a peer's is (FB-6.7 K2, KK-87).
  if rule_row.outranked_no and whose is not null and not target_is_self then
    select role.access_class into target_access
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    where membership.workspace_id = state.workspace_id and membership.user_id = whose;
    if app_private.authz_rank(coalesce(target_access, 'employee')) > app_private.authz_rank(state.class) then
      return 'rank';
    end if;
  end if;

  if state.class in ('owner', 'admin') then
    reach := 'org';
  else
    select rule.manager_rule into reach
    from app_private.authz_scope_rules rule
    join app_private.authz_settings setting on setting.scope_model = rule.model
    where rule.scope_class = rule_row.scope_class and rule.effect = rule_row.effect;
    reach := coalesce(reach, 'none');
  end if;

  if rule_row.scope_class = 'org' then
    if reach = 'none' then
      return 'out_of_scope';
    end if;
    return null;
  end if;

  if target_locations is not null then
    places := target_locations;
    if array_position(places, null) is not null then
      return 'out_of_scope';
    end if;
    if rule_row.scope_class = 'place' and cardinality(places) <> 1 then
      return 'out_of_scope';
    end if;
    if exists (
      select 1 from unnest(places) place
      where not exists (
        select 1 from public.locations location
        where location.id = place and location.workspace_id = state.workspace_id and app_private.location_is_live(location)
      )
    ) then
      return 'out_of_scope';
    end if;
  elsif rule_row.scope_class = 'person' and (person is not null or whose is not null) then
    -- Where the person is assigned; somebody with no employee record works nowhere.
    places := coalesce((
      select array_agg(distinct assignment.location_id)
      from public.employee_location_assignments assignment
      join public.locations location on location.id = assignment.location_id
      where assignment.employee_id = person and assignment.ended_at is null
        and app_private.location_is_live(location)
    ), '{}');
  else
    return 'out_of_scope';
  end if;

  if reach = 'org' then
    return null;
  end if;
  if reach = 'none' or cardinality(places) = 0 then
    return 'out_of_scope';
  end if;
  if reach = 'any' and places && state.manages then
    return null;
  end if;
  if reach = 'all' and places <@ state.manages then
    return null;
  end if;
  return 'out_of_scope';
end;
$function$;

-- 2. What a record now holds ----------------------------------------------------------

-- Announcement states: draft -> scheduled -> published <-> unpublished. Archive
-- is archived_at, from any state. 'cancelled' goes: Cancel was final, and both
-- of its jobs (hide it, put it away) come back now.
-- The old trigger took back every notification on any revision; K4 keeps them
-- when only the audience changes, so the services take back what they mean to.
drop trigger synchronize_announcement_notification_lifecycle on public.announcements;
drop function public.synchronize_announcement_notification_lifecycle_service();
alter type public.announcement_status rename to announcement_status_old;
create type public.announcement_status as enum ('draft', 'scheduled', 'published', 'unpublished');
alter table public.announcements alter column status drop default;
alter table public.announcements
  alter column status type public.announcement_status
  using (case when status::text = 'cancelled' then 'unpublished' else status::text end)::public.announcement_status;
alter table public.announcements alter column status set default 'draft';
drop type public.announcement_status_old;

-- content_revision counts content changes (K4); delivered_to is who has been
-- told about the current content.
alter table public.announcements
  add column content_revision integer not null default 1,
  add column delivered_to uuid[] not null default '{}',
  -- A scheduled one that could not be published is set aside, not retried
  -- every minute in everybody's way.
  add column release_failed_at timestamptz;

alter table public.important_dates
  add column status text not null default 'published' check (status in ('published', 'unpublished')),
  add column created_by uuid references auth.users (id) on delete set null,
  add column updated_by uuid references auth.users (id) on delete set null,
  add column content_revision integer not null default 1,
  add column delivered_to uuid[] not null default '{}',
  -- Two people editing the same date: the second save is refused, not lost (P11).
  add column revision integer not null default 1;
-- ponytail: dates written before an author was kept count as the workspace
-- creator's; there is no live data (CLAUDE.md §9).
update public.important_dates date_row
set created_by = workspace.created_by
from public.workspaces workspace
where workspace.id = date_row.workspace_id and date_row.created_by is null;

-- Who changed an important date, when, from what to what (FB-6.7, done-when 8).
create table public.important_date_changes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  important_date_id uuid not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null check (action in ('created', 'updated', 'unpublished', 'republished', 'archived', 'restored')),
  before jsonb,
  after jsonb,
  changed_at timestamptz not null default now(),
  foreign key (important_date_id, workspace_id) references public.important_dates (id, workspace_id) on delete cascade
);
create index important_date_changes_date_idx on public.important_date_changes (important_date_id, changed_at desc);
alter table public.important_date_changes enable row level security;
revoke all on public.important_date_changes from anon, authenticated;

-- 3. Notifications for important dates -------------------------------------------------

insert into public.notification_catalog (
  type_key, schema_version, category, severity, sensitivity, supported_channels,
  default_cadence, audience_contract, action_route_contract, dedupe_policy,
  retention_class, template_key, lifecycle, mandatory_in_app, notification_scope
) values (
  'schedule.important_date.available', 1, 'schedule', 'info', 'internal', '{in_app}', 'immediate',
  'important_date_targeted_members',
  '{"route": "/app/schedule", "allowed_query_keys": ["date"]}',
  '{"scope": "subject_recipient", "strategy": "new_revision", "key_fields": ["important_date_id", "content_revision", "recipient_user_id"]}',
  'standard_90d', 'schedule.important_date.available.v1', 'active', false, 'workspace'
);
insert into public.notification_producer_registry (type_key, schema_version, producer_id, source_migration, source_function, integration_contract) values
  ('schedule.important_date.available', 1, 'important-date-deliver',
   '20261004000000_announcements_and_dates_ask_the_core.sql', 'important_date_deliver', 'outbox_v1');
insert into public.notification_template_versions (type_key, schema_version, channel, locale, template_version, template_key, content, status, published_at) values
  ('schedule.important_date.available', 1, 'in_app', 'en', 1, 'schedule.important_date.available.v1',
   '{"title": "{{title}}", "body": "{{body}}", "action_url": "/app/schedule", "safe_preview": "An important date was added to the schedule."}',
   'published', now());

-- 4. Shared rules -----------------------------------------------------------------------

-- The live locations among a record's own (KK-86).
create function app_private.live_locations(w uuid, ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(location.id order by location.id), '{}')
  from public.locations location
  where location.workspace_id = w and location.id = any (ids) and app_private.location_is_live(location)
$$;

-- K1-K3: may this person change a record kept at these locations, written by
-- this author? A record at one live location is a place action; anything else
-- (several, or none: the whole workspace, or only archived ones) is the org's.
-- An author who has left, or one no longer known: admin and owner only (O1).
-- It takes the actor's state (app_private.actor), so a list reads it once.
create function app_private.communication_reason(state app_private.actor_state, w uuid, kind text, stored uuid[], author uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  live uuid[] := app_private.live_locations(w, stored);
  writer uuid := (
    select membership.user_id from public.workspace_memberships membership
    where membership.workspace_id = w and membership.user_id = author and membership.status = 'active'
  );
  narrow app_private.authz_actions;
  wide app_private.authz_actions;
  reason text;
begin
  select * into strict narrow from app_private.authz_actions a where a.key = kind || '.write';
  select * into strict wide from app_private.authz_actions a where a.key = kind || '.write_wide';
  -- An author who has left protects the record harder, not softer: only an
  -- admin or the owner changes it (Mert, 2026-10-02, O1; fail closed). So
  -- does a record that no longer says who wrote it (a deleted account).
  if writer is null then
    reason := app_private.authz_check(state, wide, null, null, null);
    return case when reason = 'out_of_scope' then 'rank' else reason end;
  end if;
  if cardinality(stored) > 0 and cardinality(live) = 1 then
    return app_private.authz_check(state, narrow, live, null, writer);
  end if;
  return app_private.authz_check(state, wide, null, null, writer);
end;
$$;

-- The same, as the one way to say no. The locations a write names must be live
-- locations of this workspace, or archived ones the record already had (kept:
-- "Kadikoy + Moda" after Moda closed is edited as a Kadikoy record, KK-86); an
-- unknown one is out of scope like one out of reach (FOUNDATION-B).
create function app_private.communication_authorize(actor uuid, w uuid, kind text, stored uuid[], author uuid, kept uuid[] default '{}')
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  reason text := app_private.communication_reason(app_private.actor(actor, w), w, kind, stored, author);
begin
  if reason is null and exists (
    select 1 from unnest(stored) id
    where not id = any (app_private.live_locations(w, stored)) and not id = any (kept)
  ) then
    reason := 'out_of_scope';
  end if;
  if reason is not null then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.' || reason, detail = kind || '.write';
  end if;
end;
$$;

-- K5: everybody a record reaches: whoever manages one of its live locations
-- (the owner, the admins, its managers; the core's actor().manages), and its
-- targeted people: their role class, where they work, their department and
-- job. No locations means the whole workspace. A record left only at archived
-- locations reaches nobody (KK-86). A null roles list (an important date)
-- targets every role. communication_reaches is the rule for one person (a
-- read asks it of its reader only); communication_audience asks it of every
-- active member.
create function app_private.communication_reaches(state app_private.actor_state, w uuid, live uuid[], everywhere boolean, roles public.workspace_role[], department_ids uuid[], job_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select state.status = 'active' and (
    state.manages && live
    or (everywhere and cardinality(state.manages) > 0)
    or ((roles is null or state.class = any (roles))
        and (everywhere or state.works && live)
        and (cardinality(coalesce(department_ids, '{}')) = 0 or exists (
          select 1 from public.employee_job_assignments assignment
          join public.jobs job on job.id = assignment.job_id and job.workspace_id = w
          where assignment.workspace_id = w and assignment.employee_id = state.employee_id
            and assignment.ended_at is null and job.archived_at is null and job.department_id = any (department_ids)))
        and (cardinality(coalesce(job_ids, '{}')) = 0 or exists (
          select 1 from public.employee_job_assignments assignment
          join public.jobs job on job.id = assignment.job_id and job.workspace_id = w
          where assignment.workspace_id = w and assignment.employee_id = state.employee_id
            and assignment.ended_at is null and job.archived_at is null and job.id = any (job_ids)))))
$$;

create function app_private.communication_audience(w uuid, stored uuid[], roles public.workspace_role[], department_ids uuid[], job_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with live as (
    select app_private.live_locations(w, stored) ids, cardinality(stored) = 0 everywhere
  )
  select membership.user_id
  from public.workspace_memberships membership, live
  where membership.workspace_id = w and membership.status = 'active'
    and app_private.communication_reaches(app_private.actor(membership.user_id, w), w, live.ids, live.everywhere,
          roles, department_ids, job_ids)
$$;

-- Takes back what a record told people: the events queued or projected for it
-- go to 'superseded' (its content changed) or 'cancelled' (unpublished,
-- archived), and the copies in the old inbox go. Given people, it takes it back
-- from them only: those a narrower audience no longer reaches (BL-534) lose it
-- from their inboxes, and a notice not yet delivered leaves them out.
create function app_private.communication_withdraw(w uuid, type_key text, subject_type text, subject_id text, visibility text, people uuid[] default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  outbox_row public.notification_outbox%rowtype;
  legacy_ids uuid[];
begin
  for outbox_row in
    select * from public.notification_outbox outbox
    where outbox.workspace_id = w and outbox.type_key = communication_withdraw.type_key
      and outbox.subject_type = communication_withdraw.subject_type
      and outbox.subject_id = communication_withdraw.subject_id
    for update
  loop
    if people is not null then
      update public.notification_outbox outbox
      set payload = jsonb_set(outbox.payload, '{recipient_user_ids}', coalesce((
            select jsonb_agg(who) from jsonb_array_elements_text(outbox.payload -> 'recipient_user_ids') who
            where not who::uuid = any (people)), '[]'::jsonb))
      where outbox.id = outbox_row.id and outbox.status in ('pending', 'retry');

      select coalesce(array_agg(item.legacy_notification_id), '{}') into legacy_ids
      from public.notification_inbox_items item
      join public.notification_recipients recipient on recipient.id = item.recipient_projection_id
      where recipient.workspace_id = w and recipient.event_id = outbox_row.event_id
        and recipient.recipient_user_id = any (people) and item.legacy_notification_id is not null;

      update public.notification_inbox_items item
      set visibility_state = visibility, legacy_notification_id = null
      from public.notification_recipients recipient
      where recipient.id = item.recipient_projection_id
        and recipient.workspace_id = w and recipient.event_id = outbox_row.event_id
        and recipient.recipient_user_id = any (people) and item.visibility_state = 'visible';

      delete from public.notifications notification
      where notification.id = any (legacy_ids) and notification.workspace_id = w;
      continue;
    end if;

    perform public.project_notification_event_service(outbox_row.id);
    update public.notification_events event
    set cancelled_at = coalesce(event.cancelled_at, now())
    where event.id = outbox_row.event_id and event.workspace_id = w;

    select coalesce(array_agg(item.legacy_notification_id), '{}') into legacy_ids
    from public.notification_inbox_items item
    join public.notification_recipients recipient on recipient.id = item.recipient_projection_id
    where recipient.workspace_id = w and recipient.event_id = outbox_row.event_id
      and item.legacy_notification_id is not null;

    update public.notification_inbox_items item
    set visibility_state = visibility, legacy_notification_id = null
    from public.notification_recipients recipient
    where recipient.id = item.recipient_projection_id
      and recipient.workspace_id = w and recipient.event_id = outbox_row.event_id
      and item.visibility_state = 'visible';

    delete from public.notifications notification
    where notification.id = any (legacy_ids) and notification.workspace_id = w;

    update public.notification_outbox outbox
    set status = 'processed', lease_owner = null, lease_expires_at = null,
        last_error = 'withdrawn: ' || visibility,
        payload = outbox.payload || jsonb_build_object('cancelled_at', now(), 'visibility_state', visibility)
    where outbox.id = outbox_row.id and outbox.status in ('pending', 'retry', 'leased');
  end loop;
end;
$$;

-- 5. Announcements --------------------------------------------------------------------------

-- The locations an announcement is kept at (none: the whole workspace).
create function app_private.announcement_places(announcement uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(target.location_id order by target.location_id), '{}')
  from public.announcement_locations target where target.announcement_id = announcement
$$;

-- Tells these people about an announcement's current content.
create function app_private.announcement_deliver(item public.announcements, recipients uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid := gen_random_uuid();
begin
  if cardinality(recipients) = 0 then
    return;
  end if;
  perform public.enqueue_notification_outbox_service(
    item.workspace_id, event_id, 'communications.announcement.available', 1, item.updated_by,
    'announcement', item.id::text,
    jsonb_build_object(
      'correlation_id', event_id,
      'announcement_id', item.id,
      'announcement_revision', item.revision,
      'content_revision', item.content_revision,
      'location_ids', to_jsonb(app_private.announcement_places(item.id)),
      'recipient_user_ids', to_jsonb(recipients),
      'audience_contract', 'announcement_targeted_members',
      'category', 'announcement',
      'title', item.title,
      'body', left(item.body, 2000),
      'safe_preview', 'A new announcement is available.',
      'action_url', coalesce(item.action_url, '/app/announcements/' || item.id::text),
      'group_key', 'announcement:' || item.id::text,
      'visible_at', coalesce(item.published_at, now())),
    now());
end;
$$;

-- Everybody an announcement reaches today (K5), but its author (KK-89).
create function app_private.announcement_recipients(item public.announcements)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct who order by who), '{}')
  from app_private.communication_audience(item.workspace_id,
    app_private.announcement_places(item.id),
    item.audience_roles, item.department_ids, item.job_ids) who
  where who is distinct from item.created_by
$$;

-- Publishes what is due: a scheduled announcement whose time has come is
-- published, and its people are told (FB-6.7, done-when 7). The read and every
-- write call it for their workspace, and pg_cron for all of them each minute.
create function app_private.announcement_release(w uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.announcements;
  released integer := 0;
begin
  for item in
    select * from public.announcements announcement
    where (w is null or announcement.workspace_id = w)
      and announcement.status = 'scheduled' and announcement.archived_at is null
      and announcement.publish_at <= now() and announcement.release_failed_at is null
    for update skip locked
  loop
    begin
      if item.expires_at is not null and item.expires_at <= now() then
        -- Its time ran out before it went out: it does not (P25).
        update public.announcements set status = 'unpublished', revision = revision + 1 where id = item.id;
      else
        update public.announcements
        set status = 'published', published_at = item.publish_at, revision = revision + 1,
            delivered_to = app_private.announcement_recipients(item)
        where id = item.id
        returning * into item;
        perform app_private.announcement_deliver(item, item.delivered_to);
        released := released + 1;
      end if;
    exception when others then
      -- One broken row must not hold up every workspace's, nor the read that
      -- called this (O2).
      update public.announcements set release_failed_at = now() where id = item.id;
    end;
  end loop;
  return released;
end;
$$;
select cron.schedule('announcements-due', '* * * * *', 'select app_private.announcement_release()');

-- Is an announcement out and does it reach this person (K5, K6)? The list
-- asks it with its reader's state, read once.
create function app_private.announcement_out_to(state app_private.actor_state, item public.announcements, places uuid[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select item.status = 'published' and item.archived_at is null
     and (item.expires_at is null or item.expires_at > now())
     and app_private.communication_reaches(state, item.workspace_id,
           app_private.live_locations(item.workspace_id, places), cardinality(places) = 0,
           item.audience_roles, item.department_ids, item.job_ids)
$$;

-- Who may see an announcement: whoever may change it, in any state (K3), and
-- whoever it reaches while it is out (K5, K6).
create function app_private.announcement_visible(actor uuid, item public.announcements)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select app_private.actor(actor, item.workspace_id) state, app_private.announcement_places(item.id) places
  )
  select app_private.communication_reason(me.state, item.workspace_id, 'announcement', me.places, item.created_by) is null
      or app_private.announcement_out_to(me.state, item, me.places)
  from me
$$;

create or replace function public.get_announcements_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  writable uuid[];
  wide boolean;
  reader app_private.actor_state;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'announcement.read');
  perform app_private.announcement_release(target_workspace_id);
  reader := app_private.actor(actor_user_id, target_workspace_id);
  writable := app_private.scope_set(actor_user_id, target_workspace_id, 'announcement.write');
  wide := app_private.authz_reason(actor_user_id, target_workspace_id, 'announcement.write_wide') is null;
  return jsonb_build_object(
    'workspace_id', target_workspace_id,
    'can_manage', wide or cardinality(writable) > 0,
    'can_target_workspace', wide,
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('id', location.id, 'name', location.name) order by location.sort_order, location.name)
      from public.locations location
      where location.workspace_id = target_workspace_id and app_private.location_is_live(location)
        and location.id = any (writable)), '[]'::jsonb),
    'departments', case when wide or cardinality(writable) > 0 then coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by lower(d.name), d.id)
      from public.departments d where d.workspace_id = target_workspace_id and d.archived_at is null), '[]'::jsonb)
      else '[]'::jsonb end,
    'jobs', case when wide or cardinality(writable) > 0 then coalesce((
      select jsonb_agg(jsonb_build_object('id', j.id, 'name', j.name, 'department_id', j.department_id) order by lower(j.name), j.id)
      from public.jobs j where j.workspace_id = target_workspace_id and j.archived_at is null), '[]'::jsonb)
      else '[]'::jsonb end,
    'announcements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id, 'workspace_id', item.workspace_id, 'title', item.title, 'body', item.body,
        'category', item.category, 'status', item.status, 'audience_roles', item.audience_roles,
        -- Every location it is kept at, archived ones too, so an edit keeps them;
        -- live_location_ids are where it reaches (KK-86).
        'location_ids', coalesce(targets.ids, '{}'::uuid[]), 'location_names', coalesce(targets.names, '{}'::text[]),
        'live_location_ids', app_private.live_locations(target_workspace_id, coalesce(targets.ids, '{}'::uuid[])),
        'department_ids', item.department_ids, 'job_ids', item.job_ids, 'archived_at', item.archived_at,
        'department_names', coalesce((select jsonb_agg(d.name order by lower(d.name), d.id) from public.departments d
          where d.workspace_id = target_workspace_id and d.id = any (item.department_ids)), '[]'::jsonb),
        'job_names', coalesce((select jsonb_agg(j.name order by lower(j.name), j.id) from public.jobs j
          where j.workspace_id = target_workspace_id and j.id = any (item.job_ids)), '[]'::jsonb),
        'publish_at', item.publish_at, 'published_at', item.published_at, 'expires_at', item.expires_at,
        'action_url', item.action_url, 'author_name', coalesce(author.display_name, 'Workspace member'),
        'author_user_id', item.created_by,
        'revision', item.revision, 'content_revision', item.content_revision,
        'created_at', item.created_at, 'updated_at', item.updated_at,
        'read_at', null,
        'acknowledged_at', acknowledgement.acknowledged_at,
        'acknowledged_count', (select count(*) from public.announcement_acknowledgements a where a.announcement_id = item.id),
        'can_edit', control.allowed and item.archived_at is null,
        'can_publish', control.allowed and item.archived_at is null and item.status in ('draft', 'scheduled', 'unpublished'),
        'can_unpublish', control.allowed and item.archived_at is null and item.status in ('scheduled', 'published'),
        'can_archive', control.allowed and item.archived_at is null,
        'can_restore', control.allowed and item.archived_at is not null
      ) order by coalesce(item.publish_at, item.created_at) desc, item.id)
      from public.announcements item
      left join public.user_profiles author on author.user_id = item.created_by
      left join lateral (
        select array_agg(location.id order by location.sort_order, location.name) ids,
               array_agg(location.name order by location.sort_order, location.name) names
        from public.announcement_locations target
        join public.locations location on location.id = target.location_id
        where target.announcement_id = item.id) targets on true
      left join public.announcement_acknowledgements acknowledgement
        on acknowledgement.announcement_id = item.id and acknowledgement.user_id = actor_user_id
      cross join lateral (select app_private.announcement_places(item.id) places) kept
      cross join lateral (
        select app_private.communication_reason(reader, target_workspace_id, 'announcement',
          kept.places, item.created_by) is null allowed) control
      -- announcement_visible, with the reader's state read once for the list.
      where item.workspace_id = target_workspace_id
        and (control.allowed or app_private.announcement_out_to(reader, item, kept.places))), '[]'::jsonb)
  );
end;
$$;

-- Saves a draft, or changes one in any state but archived (K4). A content
-- change on a published announcement resets its acknowledgements and tells
-- everybody again; a change of who it is for tells only the new people.
create or replace function public.save_announcement_audience_service(actor_user_id uuid, target_workspace_id uuid, target_announcement_id uuid, target_expected_revision integer, target_title text, target_body text, target_category text, target_audience_roles text[], target_location_ids uuid[], target_publish_at timestamp with time zone, target_expires_at timestamp with time zone, target_action_url text, target_department_ids uuid[], target_job_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.announcements;
  before public.announcements;
  stored uuid[];
  content_changed boolean := false;
  reached uuid[];
  dropped uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'announcement.read');
  target_location_ids := array(select distinct id from unnest(coalesce(target_location_ids, '{}')) id order by id);
  if target_announcement_id is null then
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'announcement', target_location_ids, actor_user_id);
  else
    perform app_private.announcement_release(target_workspace_id);
    select * into before from public.announcements
    where id = target_announcement_id and workspace_id = target_workspace_id for update;
    if before.id is null or not app_private.announcement_visible(actor_user_id, before) then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.write';
    end if;
    stored := app_private.announcement_places(before.id);
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'announcement', stored, before.created_by, stored);
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'announcement', target_location_ids, before.created_by, stored);
    -- A record kept at an archived location never becomes the whole workspace
    -- by losing its locations (KK-86); the owner may still widen a live one (K1).
    if cardinality(target_location_ids) = 0
       and cardinality(stored) > cardinality(app_private.live_locations(target_workspace_id, stored)) then
      raise exception 'Choose at least one location' using errcode = '22023';
    end if;
  end if;

  target_department_ids := coalesce(target_department_ids, '{}');
  target_job_ids := coalesce(target_job_ids, '{}');
  if coalesce(cardinality(target_audience_roles), 0) = 0 then
    target_audience_roles := array['owner', 'admin', 'manager', 'employee'];
  end if;
  if cardinality(target_department_ids) > 100 or cardinality(target_job_ids) > 100 or cardinality(target_location_ids) > 100 then
    raise exception 'too many audience filters' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(target_department_ids) selected(id) where not exists (
       select 1 from public.departments d where d.id = selected.id and d.workspace_id = target_workspace_id and d.archived_at is null))
  or exists (select 1 from unnest(target_job_ids) selected(id) where not exists (
       select 1 from public.jobs j where j.id = selected.id and j.workspace_id = target_workspace_id and j.archived_at is null)) then
    raise exception 'active workspace department and job required' using errcode = '22023';
  end if;
  if char_length(btrim(target_title)) not between 1 and 120 or char_length(btrim(target_body)) not between 1 and 5000
     or target_category not in ('general', 'operations', 'schedule') then
    raise exception 'valid announcement content required' using errcode = '22023';
  end if;
  if cardinality(target_audience_roles) not between 1 and 4
     or exists (select 1 from unnest(target_audience_roles) role_name where role_name not in ('owner', 'admin', 'manager', 'employee')) then
    raise exception 'valid announcement audience required' using errcode = '22023';
  end if;
  if target_action_url is not null and (char_length(target_action_url) > 500 or target_action_url !~ '^/app(/|$)') then
    raise exception 'valid app action required' using errcode = '22023';
  end if;
  if target_expires_at is not null and target_publish_at is not null and target_expires_at <= target_publish_at then
    raise exception 'expiry must follow publication' using errcode = '22023';
  end if;

  if target_announcement_id is null then
    insert into public.announcements (workspace_id, title, body, category, audience_roles, publish_at, expires_at,
      action_url, department_ids, job_ids, created_by, updated_by)
    values (target_workspace_id, btrim(target_title), btrim(target_body), target_category::public.announcement_category,
      array(select distinct role_name::public.workspace_role from unnest(target_audience_roles) role_name),
      target_publish_at, target_expires_at, target_action_url,
      array(select distinct unnest(target_department_ids)), array(select distinct unnest(target_job_ids)),
      actor_user_id, actor_user_id)
    returning * into item;
  else
    if before.revision is distinct from target_expected_revision then
      raise exception 'stale announcement revision' using errcode = '40001';
    end if;
    if before.archived_at is not null then
      raise exception 'announcement can no longer be edited' using errcode = '40001';
    end if;
    content_changed := (before.title, before.body, before.category::text, before.action_url)
      is distinct from (btrim(target_title), btrim(target_body), target_category, target_action_url);
    update public.announcements
    set title = btrim(target_title), body = btrim(target_body), category = target_category::public.announcement_category,
        audience_roles = array(select distinct role_name::public.workspace_role from unnest(target_audience_roles) role_name),
        publish_at = target_publish_at, expires_at = target_expires_at, action_url = target_action_url,
        department_ids = array(select distinct unnest(target_department_ids)),
        job_ids = array(select distinct unnest(target_job_ids)),
        content_revision = content_revision + case when content_changed then 1 else 0 end,
        -- A scheduled one with its time taken away waits as a draft (P10).
        status = case when status = 'scheduled' and target_publish_at is null then 'draft' else status end,
        release_failed_at = null,
        revision = revision + 1, updated_by = actor_user_id, updated_at = now()
    where id = before.id
    returning * into item;
  end if;

  delete from public.announcement_locations where announcement_id = item.id;
  insert into public.announcement_locations (workspace_id, announcement_id, location_id)
  select target_workspace_id, item.id, id from unnest(target_location_ids) id;

  if content_changed then
    delete from public.announcement_acknowledgements where announcement_id = item.id;
  end if;
  if item.status = 'published' then
    reached := app_private.announcement_recipients(item);
    if content_changed then
      perform app_private.communication_withdraw(target_workspace_id, 'communications.announcement.available',
        'announcement', item.id::text, 'superseded');
      perform app_private.announcement_deliver(item, reached);
    else
      -- Those it no longer reaches lose it (BL-534); the new people are told.
      dropped := array(select who from unnest(item.delivered_to) who where not who = any (reached));
      if cardinality(dropped) > 0 then
        perform app_private.communication_withdraw(target_workspace_id, 'communications.announcement.available',
          'announcement', item.id::text, 'cancelled', dropped);
      end if;
      perform app_private.announcement_deliver(item,
        array(select who from unnest(reached) who where not who = any (item.delivered_to)));
    end if;
    update public.announcements set delivered_to = reached where id = item.id returning * into item;
  elsif content_changed then
    update public.announcements set delivered_to = '{}' where id = item.id returning * into item;
  end if;

  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_workspace_id, actor_user_id,
    case when target_announcement_id is null then 'announcement.created' else 'announcement.updated' end,
    'announcement', item.id::text, jsonb_build_object('content_changed', content_changed));
  return jsonb_build_object('status', item.status, 'announcement_id', item.id, 'revision', item.revision,
    'recipient_count', cardinality(item.delivered_to));
end;
$$;

-- Publishes a draft or a scheduled announcement (at its time, or now), or
-- republishes an unpublished one. Republishing keeps every acknowledgement and
-- tells only those who have not acknowledged it (K4).
create or replace function public.publish_announcement_service(actor_user_id uuid, target_workspace_id uuid, target_announcement_id uuid, target_expected_revision integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.announcements;
  reached uuid[];
  told uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'announcement.read');
  perform app_private.announcement_release(target_workspace_id);
  select * into item from public.announcements
  where id = target_announcement_id and workspace_id = target_workspace_id for update;
  if item.id is null or not app_private.announcement_visible(actor_user_id, item) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.write';
  end if;
  perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'announcement',
    app_private.announcement_places(item.id),
    item.created_by, app_private.announcement_places(item.id));
  if item.revision is distinct from target_expected_revision or item.archived_at is not null
     or item.status not in ('draft', 'scheduled', 'unpublished') then
    raise exception 'stale announcement revision' using errcode = '40001';
  end if;

  if item.expires_at is not null and item.expires_at <= now() then
    raise exception 'This announcement has expired' using errcode = '22023';
  end if;
  if item.publish_at is not null and item.publish_at > now() then
    update public.announcements
    set status = 'scheduled', release_failed_at = null, published_at = null, revision = revision + 1, updated_by = actor_user_id, updated_at = now()
    where id = item.id returning * into item;
    told := '{}';
  else
    reached := app_private.announcement_recipients(item);
    told := case when item.status = 'unpublished'
      then array(select who from unnest(reached) who where not exists (
        select 1 from public.announcement_acknowledgements a where a.announcement_id = item.id and a.user_id = who))
      else reached end;
    update public.announcements
    set status = 'published', published_at = now(), publish_at = coalesce(publish_at, now()),
        delivered_to = reached, revision = revision + 1, updated_by = actor_user_id, updated_at = now()
    where id = item.id returning * into item;
    perform app_private.announcement_deliver(item, told);
  end if;

  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_workspace_id, actor_user_id, 'announcement.published', 'announcement', item.id::text,
    jsonb_build_object('status', item.status, 'recipient_count', cardinality(told)));
  return jsonb_build_object('status', item.status, 'announcement_id', item.id, 'revision', item.revision,
    'recipient_count', cardinality(told), 'notification_enqueued_count', cardinality(told));
end;
$$;

-- Unpublish, archive, restore (Mert, 2026-10-02). Unpublishing and archiving
-- take back what it told people; restoring brings it back unpublished (a
-- draft stays a draft) and tells nobody.
create function public.set_announcement_state_service(actor_user_id uuid, target_workspace_id uuid, target_announcement_id uuid, target_expected_revision integer, target_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.announcements;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'announcement.read');
  perform app_private.announcement_release(target_workspace_id);
  select * into item from public.announcements
  where id = target_announcement_id and workspace_id = target_workspace_id for update;
  if item.id is null or not app_private.announcement_visible(actor_user_id, item) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.write';
  end if;
  perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'announcement',
    app_private.announcement_places(item.id),
    item.created_by, app_private.announcement_places(item.id));
  if target_action not in ('unpublish', 'archive', 'restore') then
    raise exception 'valid announcement action required' using errcode = '22023';
  end if;
  if item.revision is distinct from target_expected_revision
     or (target_action = 'unpublish' and (item.archived_at is not null or item.status not in ('scheduled', 'published')))
     or (target_action = 'archive' and item.archived_at is not null)
     or (target_action = 'restore' and item.archived_at is null) then
    raise exception 'stale announcement revision' using errcode = '40001';
  end if;

  if target_action in ('unpublish', 'archive') then
    perform app_private.communication_withdraw(target_workspace_id, 'communications.announcement.available',
      'announcement', item.id::text, 'cancelled');
  end if;
  update public.announcements
  set status = case
        when target_action = 'unpublish' then 'unpublished'
        when target_action = 'restore' and status <> 'draft' then 'unpublished'
        else status end,
      archived_at = case target_action when 'archive' then now() when 'restore' then null else archived_at end,
      revision = revision + 1, updated_by = actor_user_id, updated_at = now()
  where id = item.id returning * into item;

  insert into public.audit_events (workspace_id, actor_user_id, action, target_type, target_id)
  values (target_workspace_id, actor_user_id,
    'announcement.' || case target_action when 'unpublish' then 'unpublished' when 'archive' then 'archived' else 'restored' end,
    'announcement', item.id::text);
  return jsonb_build_object('status', item.status, 'announcement_id', item.id, 'revision', item.revision,
    'archived_at', item.archived_at, 'recipient_count', 0);
end;
$$;

-- ponytail: the API main runs today still calls Cancel; it archives now and
-- goes with the removing half (20261004010000).
create or replace function public.cancel_announcement_service(actor_user_id uuid, target_workspace_id uuid, target_announcement_id uuid, target_expected_revision integer)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.set_announcement_state_service(actor_user_id, target_workspace_id, target_announcement_id,
    target_expected_revision, 'archive')
$$;

create or replace function public.acknowledge_announcement_service(actor_user_id uuid, target_workspace_id uuid, target_announcement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.announcements;
  acknowledged timestamptz;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'announcement.acknowledge');
  perform app_private.announcement_release(target_workspace_id);
  select * into item from public.announcements where id = target_announcement_id and workspace_id = target_workspace_id;
  if item.id is null or item.status <> 'published' or item.archived_at is not null
     or not app_private.announcement_visible(actor_user_id, item) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'announcement.acknowledge';
  end if;
  insert into public.announcement_acknowledgements (workspace_id, announcement_id, user_id)
  values (target_workspace_id, target_announcement_id, actor_user_id)
  on conflict (announcement_id, user_id) do nothing;
  select a.acknowledged_at into acknowledged from public.announcement_acknowledgements a
  where a.announcement_id = target_announcement_id and a.user_id = actor_user_id;
  return jsonb_build_object('status', 'saved', 'acknowledged_at', acknowledged);
end;
$$;

-- 6. Important dates --------------------------------------------------------------------------

create function app_private.important_date_recipients(item public.important_dates)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct who order by who), '{}')
  from app_private.communication_audience(item.workspace_id, item.location_ids, null, null, null) who
  where who is distinct from item.created_by
$$;

-- Who is told about an important date now: its recipients at the locations
-- where it is not over yet, by each location's own today. A one-time date
-- already over tells nobody (anti-goal "notification noise"); a yearly one
-- comes again and is never over.
create function app_private.important_date_notified(item public.important_dates)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  places uuid[] := app_private.live_locations(item.workspace_id,
    case when cardinality(item.location_ids) = 0
      then array(select location.id from public.locations location where location.workspace_id = item.workspace_id)
      else item.location_ids end);
  open_places uuid[];
begin
  if item.recurrence = 'annual' then
    return app_private.important_date_recipients(item);
  end if;
  open_places := array(
    select location.id from public.locations location
    where location.id = any (places) and item.ends_on >= (now() at time zone location.timezone)::date
    order by location.id);
  if cardinality(open_places) = 0 then
    return '{}';
  end if;
  if cardinality(open_places) = cardinality(places) then
    return app_private.important_date_recipients(item);
  end if;
  return coalesce((
    select array_agg(distinct who order by who)
    from app_private.communication_audience(item.workspace_id, open_places, null, null, null) who
    where who is distinct from item.created_by), '{}');
end;
$$;

-- The day an important date's notice opens: its own first day, or for a
-- yearly one, its next time from today on.
create function app_private.important_date_next_day(item public.important_dates)
returns date
language sql
stable
set search_path = ''
as $$
  select case when item.recurrence <> 'annual' then item.starts_on else coalesce((
    select (item.starts_on + make_interval(years => n))::date
    from generate_series(greatest(extract(year from current_date)::integer - extract(year from item.starts_on)::integer - 1, 0),
                         greatest(extract(year from current_date)::integer - extract(year from item.starts_on)::integer + 1, 0)) n
    where (item.ends_on + make_interval(years => n))::date >= current_date
    order by n limit 1), item.starts_on) end
$$;

create function app_private.important_date_deliver(item public.important_dates, recipients uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid := gen_random_uuid();
begin
  if cardinality(recipients) = 0 then
    return;
  end if;
  perform public.enqueue_notification_outbox_service(
    item.workspace_id, event_id, 'schedule.important_date.available', 1, item.updated_by,
    'important_date', item.id::text,
    jsonb_build_object(
      'correlation_id', event_id,
      'important_date_id', item.id,
      'content_revision', item.content_revision,
      'location_ids', to_jsonb(item.location_ids),
      'recipient_user_ids', to_jsonb(recipients),
      'audience_contract', 'important_date_targeted_members',
      'category', 'schedule',
      'title', item.title,
      'body', case when item.starts_on = item.ends_on then to_char(item.starts_on, 'Mon FMDD, YYYY')
                   else to_char(item.starts_on, 'Mon FMDD') || ' - ' || to_char(item.ends_on, 'Mon FMDD, YYYY') end,
      'safe_preview', 'An important date was added to the schedule.',
      'action_url', '/app/schedule?date=' || app_private.important_date_next_day(item)::text,
      'group_key', 'important_date:' || item.id::text,
      'visible_at', now()),
    now());
end;
$$;

-- Is an important date out and does it reach this person (K5, K6)?
create function app_private.important_date_out_to(state app_private.actor_state, item public.important_dates)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select item.status = 'published' and item.archived_at is null
     and app_private.communication_reaches(state, item.workspace_id,
           app_private.live_locations(item.workspace_id, item.location_ids), cardinality(item.location_ids) = 0,
           null, null, null)
$$;

-- Who may see an important date: whoever may change it, in any state, and
-- whoever it reaches while it is out (K5, K6).
create function app_private.important_date_visible(actor uuid, item public.important_dates)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select app_private.actor(actor, item.workspace_id) state)
  select app_private.communication_reason(me.state, item.workspace_id, 'important_date', item.location_ids, item.created_by) is null
      or app_private.important_date_out_to(me.state, item)
  from me
$$;

create function app_private.important_date_snapshot(item public.important_dates)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('title', item.title, 'type', item.type, 'starts_on', item.starts_on, 'ends_on', item.ends_on,
    'recurrence', item.recurrence, 'note', item.note, 'affects_scheduling', item.affects_scheduling,
    'location_ids', to_jsonb(item.location_ids), 'status', item.status, 'archived_at', item.archived_at)
$$;

-- Adds an important date, or changes one (K1-K4). A new date is out at once
-- and tells its people; a content change tells everybody again; adding
-- locations tells only the new people.
create function public.save_important_date_service(actor_user_id uuid, target_workspace_id uuid, target_important_date_id uuid, target_title text, target_type text, target_starts_on date, target_ends_on date, target_recurrence text, target_note text, target_affects_scheduling boolean, target_location_ids uuid[], target_expected_revision integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.important_dates;
  before public.important_dates;
  content_changed boolean := true;
  reached uuid[];
  told uuid[];
  dropped uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.important_dates.read');
  target_location_ids := array(select distinct id from unnest(coalesce(target_location_ids, '{}')) id order by id);
  if target_important_date_id is null then
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'important_date', target_location_ids, actor_user_id);
  else
    select * into before from public.important_dates
    where id = target_important_date_id and workspace_id = target_workspace_id for update;
    if before.id is null or not app_private.important_date_visible(actor_user_id, before) then
      raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'important_date.write';
    end if;
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'important_date', before.location_ids, before.created_by, before.location_ids);
    perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'important_date', target_location_ids, before.created_by, before.location_ids);
    if before.archived_at is not null then
      raise exception 'Restore this date before you edit it' using errcode = '40001';
    end if;
    if before.revision is distinct from target_expected_revision then
      raise exception 'This date changed. Reload and try again.' using errcode = '40001';
    end if;
    -- The same as an announcement's (KK-86).
    if cardinality(target_location_ids) = 0
       and cardinality(before.location_ids) > cardinality(app_private.live_locations(target_workspace_id, before.location_ids)) then
      raise exception 'Choose at least one location' using errcode = '22023';
    end if;
  end if;

  if cardinality(target_location_ids) > 100 then
    raise exception 'too many locations' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(target_title, ''))) not between 1 and 120 or char_length(coalesce(target_note, '')) > 500
     or target_type not in ('holiday', 'event', 'blackout', 'closed_day') or target_recurrence not in ('none', 'annual')
     or target_starts_on is null or target_ends_on is null or target_ends_on < target_starts_on then
    raise exception 'valid important date required' using errcode = '22023';
  end if;
  if target_type = 'closed_day' then
    target_affects_scheduling := true;
  end if;

  if target_important_date_id is null then
    insert into public.important_dates (workspace_id, title, type, starts_on, ends_on, recurrence, note,
      affects_scheduling, location_ids, location_id, created_by, updated_by)
    values (target_workspace_id, btrim(target_title), target_type::public.important_date_type, target_starts_on,
      target_ends_on, target_recurrence::public.important_date_recurrence, coalesce(target_note, ''),
      coalesce(target_affects_scheduling, true), target_location_ids,
      case when cardinality(target_location_ids) = 1 then target_location_ids[1] end, actor_user_id, actor_user_id)
    returning * into item;
  else
    content_changed := (before.title, before.type::text, before.starts_on, before.ends_on, before.recurrence::text,
      before.note, before.affects_scheduling)
      is distinct from (btrim(target_title), target_type, target_starts_on, target_ends_on, target_recurrence,
      coalesce(target_note, ''), coalesce(target_affects_scheduling, true));
    update public.important_dates
    set title = btrim(target_title), type = target_type::public.important_date_type, starts_on = target_starts_on,
        ends_on = target_ends_on, recurrence = target_recurrence::public.important_date_recurrence,
        note = coalesce(target_note, ''), affects_scheduling = coalesce(target_affects_scheduling, true),
        location_ids = target_location_ids,
        location_id = case when cardinality(target_location_ids) = 1 then target_location_ids[1] end,
        content_revision = content_revision + case when content_changed then 1 else 0 end,
        revision = revision + 1, updated_by = actor_user_id, updated_at = now()
    where id = before.id
    returning * into item;
  end if;

  if item.status = 'published' then
    -- Everybody it is for, and those told now: not where it is already over.
    reached := app_private.important_date_recipients(item);
    told := app_private.important_date_notified(item);
    if content_changed then
      if before.id is not null then
        perform app_private.communication_withdraw(target_workspace_id, 'schedule.important_date.available',
          'important_date', item.id::text, 'superseded');
      end if;
      perform app_private.important_date_deliver(item, told);
    else
      -- Those it no longer reaches lose it (BL-534); the new people are told.
      dropped := array(select who from unnest(item.delivered_to) who where not who = any (reached));
      if cardinality(dropped) > 0 then
        perform app_private.communication_withdraw(target_workspace_id, 'schedule.important_date.available',
          'important_date', item.id::text, 'cancelled', dropped);
      end if;
      perform app_private.important_date_deliver(item,
        array(select who from unnest(told) who where not who = any (item.delivered_to)));
      told := array(select distinct who from unnest(told || array(
        select who from unnest(item.delivered_to) who where who = any (reached))) who);
    end if;
    update public.important_dates set delivered_to = told where id = item.id returning * into item;
  end if;

  insert into public.important_date_changes (workspace_id, important_date_id, actor_user_id, action, before, after)
  values (target_workspace_id, item.id, actor_user_id,
    case when before.id is null then 'created' else 'updated' end,
    case when before.id is null then null else app_private.important_date_snapshot(before) end,
    app_private.important_date_snapshot(item));
  return jsonb_build_object('important_date_id', item.id, 'status', item.status, 'revision', item.revision,
    'recipient_count', cardinality(item.delivered_to));
end;
$$;

-- Unpublish, republish, archive, restore an important date (Mert, 2026-10-02).
-- Republishing the same content tells only those who have not opened it (K4,
-- Mert 2026-10-02: an important date has no acknowledgement).
create function public.set_important_date_state_service(actor_user_id uuid, target_workspace_id uuid, target_important_date_id uuid, target_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.important_dates;
  before public.important_dates;
  reached uuid[];
  opened uuid[];
  told uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.important_dates.read');
  select * into before from public.important_dates
  where id = target_important_date_id and workspace_id = target_workspace_id for update;
  if before.id is null or not app_private.important_date_visible(actor_user_id, before) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'important_date.write';
  end if;
  perform app_private.communication_authorize(actor_user_id, target_workspace_id, 'important_date', before.location_ids, before.created_by, before.location_ids);
  if target_action not in ('unpublish', 'republish', 'archive', 'restore') then
    raise exception 'valid important date action required' using errcode = '22023';
  end if;
  if (target_action = 'unpublish' and (before.archived_at is not null or before.status <> 'published'))
     or (target_action = 'republish' and (before.archived_at is not null or before.status <> 'unpublished'))
     or (target_action = 'archive' and before.archived_at is not null)
     or (target_action = 'restore' and before.archived_at is null) then
    raise exception 'This date changed. Reload and try again.' using errcode = '40001';
  end if;

  if target_action in ('unpublish', 'archive') then
    perform app_private.communication_withdraw(target_workspace_id, 'schedule.important_date.available',
      'important_date', before.id::text, 'cancelled');
  end if;
  update public.important_dates
  set status = case when target_action in ('unpublish', 'restore') then 'unpublished'
                    when target_action = 'republish' then 'published' else status end,
      archived_at = case target_action when 'archive' then now() when 'restore' then null else archived_at end,
      revision = revision + 1, updated_by = actor_user_id, updated_at = now()
  where id = before.id
  returning * into item;

  if target_action = 'republish' then
    reached := app_private.important_date_recipients(item);
    -- Who opened the current content already is not told again (K7).
    opened := array(
      select who from unnest(reached) who
      where exists (
        select 1 from public.notification_outbox outbox
        join public.notification_recipients recipient
          on recipient.workspace_id = outbox.workspace_id and recipient.event_id = outbox.event_id
        join public.notification_inbox_items inbox on inbox.recipient_projection_id = recipient.id
        where outbox.workspace_id = item.workspace_id and outbox.type_key = 'schedule.important_date.available'
          and outbox.subject_type = 'important_date' and outbox.subject_id = item.id::text
          and outbox.payload ->> 'content_revision' = item.content_revision::text
          and recipient.recipient_user_id = who and inbox.read_at is not null));
    told := array(select who from unnest(app_private.important_date_notified(item)) who where not who = any (opened));
    perform app_private.important_date_deliver(item, told);
    update public.important_dates set delivered_to = array(select distinct who from unnest(told || opened) who)
    where id = item.id returning * into item;
  end if;

  insert into public.important_date_changes (workspace_id, important_date_id, actor_user_id, action, before, after)
  values (target_workspace_id, item.id, actor_user_id,
    case target_action when 'unpublish' then 'unpublished' when 'republish' then 'republished'
      when 'archive' then 'archived' else 'restored' end,
    app_private.important_date_snapshot(before), app_private.important_date_snapshot(item));
  return jsonb_build_object('important_date_id', item.id, 'status', item.status, 'revision', item.revision,
    'archived_at', item.archived_at);
end;
$$;

-- Settings > Important dates: the dates this person may see (K6), and what
-- they may do to each (K1-K3).
create or replace function public.read_settings_important_dates_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  writable uuid[];
  wide boolean;
  reader app_private.actor_state;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.important_dates.read');
  reader := app_private.actor(actor_user_id, target_workspace_id);
  writable := app_private.scope_set(actor_user_id, target_workspace_id, 'important_date.write');
  wide := app_private.authz_reason(actor_user_id, target_workspace_id, 'important_date.write_wide') is null;
  return jsonb_build_object(
    'can_manage', wide or cardinality(writable) > 0,
    'can_target_workspace', wide,
    'dates', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.starts_on, d.title, d.id), '[]'::jsonb)
      from (
        select date_row.id, date_row.workspace_id, date_row.location_id, date_row.location_ids,
          date_row.title, date_row.type, date_row.starts_on, date_row.ends_on, date_row.recurrence,
          date_row.note, date_row.affects_scheduling, date_row.archived_at, date_row.status, date_row.revision,
          date_row.created_by, coalesce(author.display_name, 'Workspace member') as author_name,
          date_row.updated_at,
          (select location.name from public.locations location
           where location.id = date_row.location_id and location.workspace_id = date_row.workspace_id) as location_name,
          (select coalesce(jsonb_agg(coalesce(location.name, 'Archived location') order by location.sort_order nulls last, location.name, listed.n), '[]'::jsonb)
           from unnest(date_row.location_ids) with ordinality listed(id, n)
           left join public.locations location
             on location.id = listed.id and location.workspace_id = date_row.workspace_id
            and location.deleted_at is null) as location_names,
          control.allowed and date_row.archived_at is null as can_edit,
          control.allowed and date_row.archived_at is null and date_row.status = 'published' as can_unpublish,
          control.allowed and date_row.archived_at is null and date_row.status = 'unpublished' as can_republish,
          control.allowed and date_row.archived_at is null as can_archive,
          control.allowed and date_row.archived_at is not null as can_restore
        from public.important_dates date_row
        left join public.user_profiles author on author.user_id = date_row.created_by
        cross join lateral (
          select app_private.communication_reason(reader, target_workspace_id, 'important_date',
            date_row.location_ids, date_row.created_by) is null allowed) control
        -- important_date_visible, with the reader's state read once for the list.
        where date_row.workspace_id = target_workspace_id
          and (control.allowed or app_private.important_date_out_to(reader, date_row))
      ) d),
    'locations', app_private.settings_locations(target_workspace_id, writable)
  );
end;
$$;

-- A past version of an important date as somebody who manages these
-- locations may see it: one kept only at locations they do not manage (or
-- only at archived ones) is hidden (K6).
create function app_private.important_date_version_seen(reach uuid[], version jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $fn$
  select case
    when version is null then null
    when jsonb_array_length(coalesce(version -> 'location_ids', '[]'::jsonb)) = 0 then version
    when exists (select 1 from jsonb_array_elements_text(version -> 'location_ids') id where id::uuid = any (reach)) then version
    else jsonb_build_object('hidden', true)
  end
$fn$;

-- An important date's history: who changed what, when, from what to what
-- (FB-6.7, done-when 8). Whoever may see the date reads it.
create function public.read_important_date_history_service(actor_user_id uuid, target_workspace_id uuid, target_important_date_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  item public.important_dates;
  reach uuid[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.important_dates.read');
  reach := (app_private.actor(actor_user_id, target_workspace_id)).manages;
  select * into item from public.important_dates where id = target_important_date_id and workspace_id = target_workspace_id;
  if item.id is null or not app_private.important_date_visible(actor_user_id, item) then
    raise exception 'Not allowed' using errcode = '42501', hint = 'authz.out_of_scope', detail = 'settings.important_dates.read';
  end if;
  return jsonb_build_object(
    'important_date_id', item.id,
    'author_user_id', item.created_by,
    'author_name', coalesce((select profile.display_name from public.user_profiles profile where profile.user_id = item.created_by), 'Workspace member'),
    'changes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', change.id, 'action', change.action, 'changed_at', change.changed_at,
        'actor_user_id', change.actor_user_id,
        'actor_name', coalesce(actor.display_name, 'Workspace member'),
        'before', app_private.important_date_version_seen(reach, change.before),
        'after', app_private.important_date_version_seen(reach, change.after)) order by change.changed_at desc, change.id)
      from public.important_date_changes change
      left join public.user_profiles actor on actor.user_id = change.actor_user_id
      where change.important_date_id = item.id and change.workspace_id = target_workspace_id), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.set_announcement_state_service(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.save_important_date_service(uuid, uuid, uuid, text, text, date, date, text, text, boolean, uuid[], integer) from public, anon, authenticated;
revoke all on function public.set_important_date_state_service(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.read_important_date_history_service(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_announcement_state_service(uuid, uuid, uuid, integer, text) to service_role;
grant execute on function public.save_important_date_service(uuid, uuid, uuid, text, text, date, date, text, text, boolean, uuid[], integer) to service_role;
grant execute on function public.set_important_date_state_service(uuid, uuid, uuid, text) to service_role;
grant execute on function public.read_important_date_history_service(uuid, uuid, uuid) to service_role;

-- 7. The notification health check counts what K4 delivers: a published
-- announcement has an event for its current content once somebody was told.
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
    -- The owner's own request was recorded approved by its requester in the
    -- same moment (submit_time_off_service); that fact is kept on the events,
    -- so the check does not depend on who owns the workspace today (BL-220).
    where not (event.action = 'submitted' and exists (
        select 1 from public.schedule_time_off_events decided
        where decided.workspace_id = event.workspace_id and decided.request_id = event.request_id
          and decided.action = 'approved'
          and decided.actor_user_id = event.actor_user_id and decided.created_at = event.created_at))
      -- A shortening tells its own people (requests.time_off.shortened, BL-182).
      and not public.time_off_event_is_shortening(event.workspace_id, event.request_id, event.metadata)
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
    where announcement.status = 'published' and announcement.archived_at is null
      and cardinality(announcement.delivered_to) > 0
      and announcement.updated_at >= registry.activated_at
      and not exists (
        select 1 from public.notification_outbox outbox
        where outbox.workspace_id = announcement.workspace_id
          and outbox.type_key = 'communications.announcement.available'
          and outbox.subject_id = announcement.id::text
          and outbox.payload->>'content_revision' = announcement.content_revision::text
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

-- 8. BL-532: "Pending invitation cancelled" reaches whoever could have sent the
-- invitation (its person's locations, the core's employee.invite), not every
-- manager with employee access in the workspace. Example: an invitation to
-- Kadikoy is cancelled; the Besiktas manager hears nothing.
CREATE OR REPLACE FUNCTION public.request_account_deletion_v2_service(actor_user_id uuid, recovery_token_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_email text;
  blockers jsonb;
  existing_request public.account_deletion_requests%rowtype;
  created_request public.account_deletion_requests%rowtype;
  cancelled_workspace_id uuid;
  manager_user_ids uuid[];
  notification_event_id uuid;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;
  if recovery_token_digest is null
    or recovery_token_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'valid recovery token digest required' using errcode = '22023';
  end if;

  select lower(btrim(auth_user.email)) into actor_email
  from auth.users auth_user
  where auth_user.id = actor_user_id;
  if actor_email is null then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  blockers := public.get_account_deletion_blockers_service(actor_user_id);
  if jsonb_array_length(blockers) > 0 then
    raise exception 'account deletion blocked: %', blockers::text
      using errcode = '23514';
  end if;

  select * into existing_request
  from public.account_deletion_requests request
  where request.user_id = actor_user_id
    and request.status = 'pending'
  order by request.requested_at desc
  limit 1
  for update;

  if existing_request.id is not null then
    update public.account_deletion_requests
    set recovery_token_digest = request_account_deletion_v2_service.recovery_token_digest,
        recovery_token_rotated_at = now(),
        updated_at = now()
    where id = existing_request.id
    returning * into existing_request;

    return jsonb_build_object(
      'status', existing_request.status,
      'request_id', existing_request.id,
      'email', actor_email,
      'restore_until', existing_request.restore_until
    );
  end if;

  for cancelled_workspace_id in
    with cancelled as (
      update public.employee_invitations invitation
      set status = 'revoked'::public.employee_invitation_status,
          revoked_at = now(),
          updated_at = now()
      where invitation.email = actor_email
        and invitation.status = 'pending'::public.employee_invitation_status
      returning invitation.workspace_id
    )
    select distinct workspace_id from cancelled
  loop
    select coalesce(array_agg(distinct membership.user_id), '{}'::uuid[])
    into manager_user_ids
    from public.workspace_memberships membership
    where membership.workspace_id = cancelled_workspace_id
      and membership.status = 'active'
      -- Whoever could have sent the invitation: not every manager (BL-532).
      and exists (
        select 1 from public.employee_invitations invitation
        where invitation.workspace_id = cancelled_workspace_id
          and invitation.email = actor_email
          and invitation.status = 'revoked'::public.employee_invitation_status
          and invitation.revoked_at = now()
          and app_private.authz_reason(membership.user_id, cancelled_workspace_id, 'employee.invite',
                null, invitation.employee_id) is null);

    if cardinality(manager_user_ids) > 0 then
      notification_event_id := gen_random_uuid();
      perform public.enqueue_notification_outbox_service(
        cancelled_workspace_id,
        notification_event_id,
        'security.account_invitation_cancelled',
        1,
        null,
        'account_deletion_request',
        actor_user_id::text,
        jsonb_build_object(
          'recipient_user_ids', to_jsonb(manager_user_ids),
          'title', 'Pending invitation cancelled',
          'body', 'A pending employee invitation was cancelled because the recipient requested account deletion.',
          'safe_preview', 'A pending employee invitation was cancelled.',
          'action_url', '/app/employees',
          'audience_contract', 'producer_recipient_snapshot'
        ),
        now()
      );
    end if;
  end loop;

insert into public.account_deletion_requests (
    user_id, typed_email, acknowledged, recovery_token_digest,
    recovery_token_rotated_at
  ) values (
    actor_user_id, actor_email, true, recovery_token_digest, now()
  )
  returning * into created_request;

  perform app_private.record_security_audit_event_service(
    actor_user_id, null, 'account.deletion_requested', 'account.security',
    'account_deletion_request', created_request.id::text,
    jsonb_build_object('restore_until', created_request.restore_until)
  );

  return jsonb_build_object(
    'status', created_request.status,
    'request_id', created_request.id,
    'email', actor_email,
    'restore_until', created_request.restore_until
  );
end;
$function$;

-- 9. Workspace's notifications card still reads the old inbox; it asks the core
-- for one's own notifications instead of the old capability helper.
CREATE OR REPLACE FUNCTION public.get_notifications_service(actor_user_id uuid, target_workspace_id uuid, target_category text DEFAULT NULL::text, target_unread_only boolean DEFAULT false, target_cursor timestamp with time zone DEFAULT NULL::timestamp with time zone, target_limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,'notifications.read_own');
 if target_category is not null and target_category not in('announcement','request','schedule') then raise exception 'valid notification category required' using errcode='22023'; end if;
 select jsonb_build_object(
  'workspace_id',target_workspace_id,
  'unread_count',(select count(*) from public.notifications where workspace_id=target_workspace_id and recipient_user_id=actor_user_id and dismissed_at is null and read_at is null and created_at<=now()),
  'next_cursor',(select min(page.created_at) from (select notification.created_at from public.notifications notification where notification.workspace_id=target_workspace_id and notification.recipient_user_id=actor_user_id and notification.dismissed_at is null and notification.created_at<=now() and (target_category is null or notification.category::text=target_category) and (not target_unread_only or notification.read_at is null) and (target_cursor is null or notification.created_at<target_cursor) order by notification.created_at desc,notification.id limit greatest(1,least(target_limit,50))+1) page having count(*)>greatest(1,least(target_limit,50))),
  'notifications',coalesce((select jsonb_agg(jsonb_build_object('id',page.id,'workspace_id',page.workspace_id,'category',page.category,'title',page.title,'body',page.body,'action_url',page.action_url,'source_type',page.source_type,'source_id',page.source_id,'created_at',page.created_at,'read_at',page.read_at) order by page.created_at desc,page.id) from (select notification.* from public.notifications notification where notification.workspace_id=target_workspace_id and notification.recipient_user_id=actor_user_id and notification.dismissed_at is null and notification.created_at<=now() and (target_category is null or notification.category::text=target_category) and (not target_unread_only or notification.read_at is null) and (target_cursor is null or notification.created_at<target_cursor) order by notification.created_at desc,notification.id limit greatest(1,least(target_limit,50))) page),'[]'::jsonb)
 ) into result;
 return result;
end; $function$;
