-- BILDIRIM-07 (KARARLAR S-91, S-92, S-95, S-123): the new notification system's core, part 3 of the plan.
-- Producers, the inbox screens, the settings screens, email, push and text messages come in their own
-- parts; this one is what they all stand on:
--   * the catalog: 65 types, each with a topic, a level (required / important / optional), its default
--     channels and how long it is kept (90 days, account security a year; S-92). Only in the database (S-91);
--   * person_notifications: a person's list (seen, read, the decision that closed it);
--   * notification_deliveries: the queue and record of every outside channel (email, push, text), one
--     row per notice and channel so nothing goes twice;
--   * a person's choices (topic x channel, per workspace) and the workspace's settings (its channels and
--     the optional types the owner turned off);
--   * push subscriptions (one row per device), the email suppression list, text message consents (the
--     fields are ready; the channel stays closed);
--   * "will it go" (app_private.notification_route): required > the owner turned it off > the channel is
--     closed > the person's choice > the product's default. In-app is not in that order: every notice
--     the owner did not turn off reaches the list;
--   * app_private.notify: what a producer calls in its own transaction. Members only, never the person
--     who did it, one notice per event and person (S-95), a private live signal that carries no content;
--   * the services the screens will call, gated by the core (notifications.read_own for one's own list
--     and choices, notifications.write_own to change one's choices, settings.organization.write for the
--     workspace's settings).
-- Every table: row level security on, nothing granted to the browser; access is through the services.

-- Topics: what a person chooses by. A type belongs to one. --------------------------------------------------

create table public.notification_topics (
  key text primary key check (key ~ '^[a-z_]+$'),
  name text not null check (char_length(name) between 1 and 60),
  position smallint not null unique
);

insert into public.notification_topics (key, name, position) values
  ('my_schedule', 'My schedule', 1),
  ('open_shifts', 'Open shifts', 2),
  ('shift_changes', 'Shift changes', 3),
  ('time_off', 'Time off', 4),
  ('profile', 'Profile and onboarding', 5),
  ('documents', 'Documents', 6),
  ('announcements', 'Announcements', 7),
  ('approvals', 'Approvals', 8),
  ('needs_attention', 'Needs attention', 9),
  ('team', 'Team updates', 10),
  ('account', 'Account and security', 11),
  ('workspace', 'Workspace and billing', 12);

-- The catalog ------------------------------------------------------------------------------------------------

create table public.notification_types (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  area text not null check (area in ('schedule', 'shift_changes', 'time_off', 'availability', 'lineup', 'people',
                                     'documents', 'announcements', 'account', 'workspace')),
  topic_key text not null references public.notification_topics(key),
  -- required: nobody turns it off, it always goes by email too. important: the owner cannot turn it
  -- off; the person keeps it in the list and chooses email and push. optional: the owner may turn it
  -- off for the workspace (then nobody gets it); the person may turn its outside channels off.
  level text not null check (level in ('required', 'important', 'optional')),
  -- account: about a person's own account, in no workspace.
  scope text not null default 'workspace' check (scope in ('workspace', 'account')),
  needs_action boolean not null default false,
  default_email boolean not null,
  default_push boolean not null,
  default_sms boolean not null default false,
  retention_days smallint not null default 90 check (retention_days between 1 and 366),
  -- An account notice reaches the person who changed their own password; nothing else does.
  notify_actor boolean not null default false,
  -- Only "your access ended" reaches somebody who is no longer an active member.
  to_former_members boolean not null default false,
  description text not null check (char_length(description) between 1 and 160),
  position smallint not null unique,
  unique (key, level),
  check (level <> 'required' or default_email),
  check (scope = 'workspace' or level = 'required')
);

insert into public.notification_types
  (position, key, area, topic_key, level, needs_action, default_email, default_push, description) values
  -- Schedule
  (1, 'schedule.published', 'schedule', 'my_schedule', 'important', false, true, true, 'A week with your shifts is published; on a republish, only if your shifts changed'),
  (2, 'schedule.shift_changed', 'schedule', 'my_schedule', 'important', false, true, true, 'One of your published shifts moved'),
  (3, 'schedule.shift_added', 'schedule', 'my_schedule', 'important', false, true, true, 'You got a new published shift'),
  (4, 'schedule.shift_removed', 'schedule', 'my_schedule', 'important', false, true, true, 'Your shift went to someone else, was opened or was removed'),
  (5, 'schedule.unpublished', 'schedule', 'my_schedule', 'important', false, true, true, 'A week you work was taken back'),
  (6, 'schedule.shifts_unassigned', 'schedule', 'needs_attention', 'important', true, true, true, 'Shifts were left without anyone'),
  (7, 'schedule.closed_day_removed_shift', 'schedule', 'my_schedule', 'important', false, true, true, 'A closed day removed your shift'),
  (8, 'schedule.export_email_stopped', 'schedule', 'needs_attention', 'important', true, true, false, 'A scheduled schedule email stopped after three failures'),
  (9, 'schedule.week_not_published', 'schedule', 'needs_attention', 'optional', false, true, false, 'A week starting in three days is not published'),
  (10, 'schedule.shift_reminder', 'schedule', 'my_schedule', 'optional', false, false, true, 'Your shift starts in two hours'),
  -- Shift changes
  (11, 'shift_changes.open_shift_available', 'shift_changes', 'open_shifts', 'optional', true, false, true, 'An extra shift you can take is open'),
  (12, 'shift_changes.open_shift_taken', 'shift_changes', 'open_shifts', 'optional', false, false, false, 'An open shift you asked for went to someone else'),
  (13, 'shift_changes.open_shift_kept', 'shift_changes', 'open_shifts', 'optional', false, false, false, 'The owner of a shift you asked for kept it'),
  (14, 'shift_changes.cover_asked', 'shift_changes', 'shift_changes', 'important', true, true, true, 'You were asked by name to cover a shift'),
  (15, 'shift_changes.cover_taken', 'shift_changes', 'shift_changes', 'important', false, false, false, 'Someone else is covering a shift you were asked about'),
  (16, 'shift_changes.cover_unfilled', 'shift_changes', 'shift_changes', 'important', true, true, true, 'No one could cover your shift'),
  (17, 'shift_changes.swap_offered', 'shift_changes', 'shift_changes', 'important', true, true, true, 'You were offered a swap'),
  (18, 'shift_changes.swap_answered', 'shift_changes', 'shift_changes', 'important', false, false, true, 'The other side answered your swap'),
  (19, 'shift_changes.approval_needed', 'shift_changes', 'approvals', 'important', true, true, true, 'A shift change waits for your approval'),
  (20, 'shift_changes.approval_reminder', 'shift_changes', 'approvals', 'important', true, true, true, 'A shift change still waits for your approval'),
  (21, 'shift_changes.decided', 'shift_changes', 'shift_changes', 'important', false, true, true, 'Your shift change was approved or declined'),
  (22, 'shift_changes.closed', 'shift_changes', 'shift_changes', 'important', false, false, false, 'A shift change request closed before its shift'),
  (23, 'shift_changes.post_to_open_shifts', 'shift_changes', 'needs_attention', 'important', true, true, false, 'A shift without anyone could go to open shifts'),
  -- Time off
  (24, 'time_off.requested', 'time_off', 'approvals', 'important', true, true, true, 'Somebody asked for time off'),
  (25, 'time_off.decision_reminder', 'time_off', 'approvals', 'important', true, true, true, 'A time off request still waits for your decision'),
  (26, 'time_off.decided', 'time_off', 'time_off', 'important', false, true, true, 'Your time off was approved or declined'),
  (27, 'time_off.shortened', 'time_off', 'time_off', 'important', false, true, true, 'Approved time off was shortened'),
  -- Availability
  (28, 'availability.updated', 'availability', 'team', 'optional', false, false, false, 'Somebody you manage changed their availability'),
  (29, 'availability.mode_changed', 'availability', 'my_schedule', 'important', false, true, false, 'The owner changed how availability works'),
  -- Lineup
  (30, 'lineup.shared', 'lineup', 'my_schedule', 'important', false, false, true, 'Today''s lineup was shared'),
  (31, 'lineup.borrowed', 'lineup', 'my_schedule', 'important', false, false, true, 'You work at another location today'),
  -- People
  (32, 'people.joined', 'people', 'team', 'optional', false, false, false, 'Somebody you invited joined'),
  (33, 'people.invitation_declined', 'people', 'team', 'optional', false, false, false, 'Somebody you invited declined'),
  (34, 'people.invitation_cancelled', 'people', 'team', 'optional', false, false, false, 'An invitation you sent was cancelled'),
  (35, 'people.onboarding_review_needed', 'people', 'approvals', 'important', true, true, true, 'An onboarding is ready for your review'),
  (36, 'people.onboarding_change_requested', 'people', 'profile', 'important', true, true, true, 'One of your onboarding steps needs a change'),
  (37, 'people.onboarding_completed', 'people', 'profile', 'important', false, true, false, 'Your onboarding is complete'),
  (38, 'people.preferred_name_requested', 'people', 'approvals', 'important', true, true, false, 'Somebody asked to be called by another name'),
  (39, 'people.preferred_name_decided', 'people', 'profile', 'important', false, false, false, 'Your preferred name was answered'),
  (40, 'people.no_location', 'people', 'needs_attention', 'important', true, true, false, 'Somebody has no location left'),
  (41, 'people.role_changed', 'people', 'workspace', 'required', false, true, false, 'Your role changed'),
  (42, 'people.access_ended', 'people', 'workspace', 'required', false, true, false, 'Your access to the workspace ended'),
  (43, 'people.restored', 'people', 'workspace', 'required', false, true, false, 'Your access was restored'),
  (44, 'people.ownership_transfer_requested', 'people', 'workspace', 'required', true, true, false, 'You were asked to become the owner'),
  (45, 'people.ownership_transfer_answered', 'people', 'workspace', 'required', false, true, false, 'An ownership transfer was accepted, declined or cancelled'),
  -- Documents
  (46, 'documents.requested', 'documents', 'documents', 'important', true, true, true, 'A document is asked of you'),
  (47, 'documents.review_needed', 'documents', 'approvals', 'important', true, true, false, 'A document waits for your review'),
  (48, 'documents.decided', 'documents', 'documents', 'important', false, true, true, 'Your document was approved or declined'),
  (49, 'documents.due_soon', 'documents', 'documents', 'important', true, true, true, 'A document is due soon'),
  (50, 'documents.expiring', 'documents', 'documents', 'important', false, true, false, 'A document expires soon'),
  (51, 'documents.access_changed', 'documents', 'documents', 'important', true, true, true, 'Your access was restricted, or came back, because of a document'),
  -- Announcements
  (52, 'announcements.published', 'announcements', 'announcements', 'important', false, false, true, 'An announcement or an important date was published for you'),
  (53, 'announcements.reminder', 'announcements', 'announcements', 'important', false, false, true, 'A reminder about an announcement you have not read'),
  (54, 'announcements.cancelled', 'announcements', 'announcements', 'important', false, false, false, 'An announcement you saw was taken back'),
  (55, 'announcements.updated', 'announcements', 'announcements', 'important', false, false, false, 'An announcement you have not acknowledged changed'),
  (56, 'announcements.publish_failed', 'announcements', 'needs_attention', 'important', true, true, false, 'A scheduled announcement could not be published'),
  -- Workspace and billing
  (61, 'workspace.closure_scheduled', 'workspace', 'workspace', 'required', false, true, false, 'The workspace closing was scheduled or cancelled'),
  (62, 'workspace.trial_ending', 'workspace', 'workspace', 'required', true, true, false, 'The trial ends in three days'),
  (63, 'workspace.payment_failed', 'workspace', 'workspace', 'required', true, true, false, 'A payment failed or needs confirming'),
  (64, 'workspace.receipt', 'workspace', 'workspace', 'required', false, true, false, 'A payment went through'),
  (65, 'workspace.subscription_paused', 'workspace', 'workspace', 'required', false, true, false, 'The subscription stopped');

insert into public.notification_types
  (position, key, area, topic_key, level, scope, default_email, default_push, retention_days, notify_actor, description) values
  (57, 'account.password_changed', 'account', 'account', 'required', 'account', true, false, 365, true, 'Your password was changed'),
  (58, 'account.sign_in_email_changed', 'account', 'account', 'required', 'account', true, false, 365, true, 'Your sign-in email changed, or a change was asked for or cancelled'),
  (59, 'account.signed_out_elsewhere', 'account', 'account', 'required', 'account', true, false, 365, true, 'You were signed out everywhere else'),
  (60, 'account.new_sign_in', 'account', 'account', 'required', 'account', true, false, 365, true, 'A new device signed in to your account');

update public.notification_types set to_former_members = true where key = 'people.access_ended';

-- A person's list ------------------------------------------------------------------------------------------

create table public.person_notifications (
  id uuid primary key default gen_random_uuid(),
  -- null for a notice about the person's own account (the type's scope is 'account').
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type_key text not null references public.notification_types(key),
  -- What happened, as the producer names it: one notice per event, type, person and workspace (S-95).
  event_key text not null check (char_length(event_key) between 1 and 200),
  actor_user_id uuid references auth.users(id) on delete set null,
  subject_type text check (subject_type ~ '^[a-z_]+$'),
  subject_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text check (char_length(body) <= 1000),
  -- A path inside the app, never another site.
  url text check (url ~ '^/([^/\\].*)?$'),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  read_at timestamptz,
  resolved_at timestamptz,
  resolution text check (resolution ~ '^[a-z_]+$'),
  resolved_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  -- The workspace is part of the key: the same event key in two workspaces is two events (an account
  -- notice, in no workspace, counts as one place).
  unique nulls not distinct (user_id, workspace_id, type_key, event_key),
  check ((resolved_at is null) = (resolution is null))
);
create index person_notifications_list on public.person_notifications (user_id, workspace_id, created_at desc, id desc);
-- A workspace that goes takes its notices without reading the whole table.
create index person_notifications_workspace on public.person_notifications (workspace_id);
create index person_notifications_open_subject on public.person_notifications (workspace_id, subject_type, subject_id)
  where resolved_at is null and subject_id is not null;
create index person_notifications_expiry on public.person_notifications (expires_at);
create index person_notifications_actor on public.person_notifications (actor_user_id) where actor_user_id is not null;
create index person_notifications_resolver on public.person_notifications (resolved_by) where resolved_by is not null;

-- The outside channels' queue and record --------------------------------------------------------------------

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.person_notifications(id) on delete cascade,
  channel text not null check (channel in ('email', 'push', 'sms')),
  -- Why the rule sent it: required, person_on, default_on, push_fallback.
  reason text not null check (reason ~ '^[a-z_]+$'),
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'dead', 'bounced', 'complained', 'suppressed')),
  attempts smallint not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  provider_message_id text check (char_length(provider_message_id) <= 200),
  last_error text check (char_length(last_error) <= 2000),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz not null default now(),
  -- The one key of a delivery: nothing goes twice.
  unique (notification_id, channel)
);
create index notification_deliveries_due on public.notification_deliveries (next_attempt_at) where status in ('queued', 'failed');

-- A person's choices: one topic, one outside channel, one workspace ------------------------------------------

create table public.notification_preferences (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_key text not null references public.notification_topics(key),
  channel text not null check (channel in ('email', 'push', 'sms')),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id, topic_key, channel)
);
create index notification_preferences_user on public.notification_preferences (user_id);

-- The workspace's settings ----------------------------------------------------------------------------------

create table public.notification_workspace_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  email_enabled boolean not null default true,
  push_enabled boolean not null default true,
  -- Text messages are paid and stay closed: the services refuse to turn this on (S-123).
  sms_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- The optional types the owner turned off. Only an optional type can be here.
create table public.notification_workspace_muted_types (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type_key text not null,
  level text not null default 'optional' check (level = 'optional'),
  muted_by uuid references auth.users(id) on delete set null,
  muted_at timestamptz not null default now(),
  primary key (workspace_id, type_key),
  foreign key (type_key, level) references public.notification_types(key, level)
);

-- The channels' own state -----------------------------------------------------------------------------------

-- One row per device that takes push notifications. A device is a person's, not a workspace's.
create table public.notification_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 2000),
  p256dh text not null check (char_length(p256dh) between 1 and 200),
  auth_secret text not null check (char_length(auth_secret) between 1 and 100),
  device_label text check (char_length(device_label) <= 120),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason in ('person', 'gone', 'expired')),
  check ((revoked_at is null) = (revoked_reason is null))
);
create index notification_push_subscriptions_live on public.notification_push_subscriptions (user_id) where revoked_at is null;

-- Addresses that bounced or complained get no email until cleared.
create table public.notification_email_suppressions (
  email text primary key check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  reason text not null check (reason in ('bounce', 'complaint', 'manual')),
  detail text check (char_length(detail) <= 500),
  suppressed_at timestamptz not null default now(),
  cleared_at timestamptz
);

-- A person's consent to text messages, kept as the law asks (when, where, which words); STOP revokes it.
create table public.notification_sms_consents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  consent_text text not null check (char_length(consent_text) between 1 and 1000),
  consent_source text not null check (consent_source in ('account_settings', 'onboarding')),
  consented_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_via text check (revoked_via in ('stop', 'person', 'owner')),
  check ((revoked_at is null) = (revoked_via is null))
);
create unique index notification_sms_consents_live on public.notification_sms_consents (workspace_id, user_id) where revoked_at is null;
create index notification_sms_consents_user on public.notification_sms_consents (user_id);

do $$
declare t text;
begin
  foreach t in array array['notification_topics', 'notification_types', 'person_notifications', 'notification_deliveries',
                           'notification_preferences', 'notification_workspace_settings', 'notification_workspace_muted_types',
                           'notification_push_subscriptions', 'notification_email_suppressions', 'notification_sms_consents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- Will it go ------------------------------------------------------------------------------------------------

-- For one type, workspace and person: whether each channel sends, and why. The order (S-123):
--   1. required: it goes, whatever the owner or the person chose;
--   2. the owner turned it off (an optional type, or the workspace's email or push);
--   3. the channel is closed (a suppressed address, no device that takes push, no text consent);
--   4. the person's choice for the type's topic and the channel;
--   5. the type's default.
-- A closed channel stops a required one too: an address that bounced cannot take it (the providers'
-- rule). In-app always sends unless the owner turned the type off. Push chosen with no device to take
-- it falls back to email for a required or important type, unless the person turned email off or the
-- owner closed it.
create function app_private.notification_route(target_type text, target_workspace uuid, target_user uuid)
returns table (channel text, sends boolean, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  kind public.notification_types;
  email_on boolean := true;
  push_on boolean := true;
  sms_on boolean := false;
  -- The text message channel stays closed until a provider is paid for (S-123).
  sms_open constant boolean := false;
  address text;
  suppressed boolean;
  devices integer;
  sms_consent boolean;
  email_choice boolean;
  push_choice boolean;
  sms_choice boolean;
  email_sends boolean;
  email_why text;
  push_sends boolean;
  push_why text;
  sms_sends boolean;
  sms_why text;
begin
  select * into kind from public.notification_types t where t.key = target_type;
  if kind.key is null then
    raise exception 'unknown notification type' using errcode = '22023', hint = 'notifications.unknown_type';
  end if;

  if target_workspace is not null then
    if exists (select 1 from public.notification_workspace_muted_types m
               where m.workspace_id = target_workspace and m.type_key = kind.key) then
      return query values ('in_app', false, 'owner_off'), ('email', false, 'owner_off'),
                          ('push', false, 'owner_off'), ('sms', false, 'owner_off');
      return;
    end if;
    select s.email_enabled, s.push_enabled, s.sms_enabled into email_on, push_on, sms_on
    from public.notification_workspace_settings s where s.workspace_id = target_workspace;
    email_on := coalesce(email_on, true);
    push_on := coalesce(push_on, true);
    sms_on := coalesce(sms_on, false);
    select bool_or(p.enabled) filter (where p.channel = 'email'),
           bool_or(p.enabled) filter (where p.channel = 'push'),
           bool_or(p.enabled) filter (where p.channel = 'sms')
      into email_choice, push_choice, sms_choice
    from public.notification_preferences p
    where p.workspace_id = target_workspace and p.user_id = target_user and p.topic_key = kind.topic_key;
    sms_consent := exists (select 1 from public.notification_sms_consents c
                           where c.workspace_id = target_workspace and c.user_id = target_user and c.revoked_at is null);
  end if;

  select lower(u.email) into address from auth.users u where u.id = target_user;
  suppressed := exists (select 1 from public.notification_email_suppressions s where s.email = address and s.cleared_at is null);
  select count(*) into devices from public.notification_push_subscriptions d where d.user_id = target_user and d.revoked_at is null;

  -- Email.
  if kind.level <> 'required' and not email_on then
    email_sends := false; email_why := 'owner_off';
  elsif address is null then
    email_sends := false; email_why := 'no_address';
  elsif suppressed then
    email_sends := false; email_why := 'suppressed';
  elsif kind.level = 'required' then
    email_sends := true; email_why := 'required';
  elsif email_choice is not null then
    email_sends := email_choice; email_why := case when email_choice then 'person_on' else 'person_off' end;
  else
    email_sends := kind.default_email; email_why := case when kind.default_email then 'default_on' else 'default_off' end;
  end if;

  -- Push: wanted first, then whether a device takes it.
  if kind.level = 'required' then
    push_sends := true; push_why := 'required';
  elsif not push_on then
    push_sends := false; push_why := 'owner_off';
  elsif push_choice is not null then
    push_sends := push_choice; push_why := case when push_choice then 'person_on' else 'person_off' end;
  else
    push_sends := kind.default_push; push_why := case when kind.default_push then 'default_on' else 'default_off' end;
  end if;
  if push_sends and devices = 0 then
    push_sends := false; push_why := 'no_device';
    if kind.level in ('required', 'important') and not email_sends and email_why = 'default_off' then
      email_sends := true; email_why := 'push_fallback';
    end if;
  end if;

  -- Text message.
  if not sms_open then
    sms_sends := false; sms_why := 'not_available';
  elsif kind.level <> 'required' and not sms_on then
    sms_sends := false; sms_why := 'owner_off';
  elsif not coalesce(sms_consent, false) then
    sms_sends := false; sms_why := 'no_consent';
  elsif kind.level = 'required' then
    sms_sends := true; sms_why := 'required';
  elsif sms_choice is not null then
    sms_sends := sms_choice; sms_why := case when sms_choice then 'person_on' else 'person_off' end;
  else
    sms_sends := kind.default_sms; sms_why := case when kind.default_sms then 'default_on' else 'default_off' end;
  end if;

  return query values ('in_app', true, 'always'), ('email', email_sends, email_why),
                      ('push', push_sends, push_why), ('sms', sms_sends, sms_why);
end;
$$;

-- Writing a notice ------------------------------------------------------------------------------------------

-- What a producer calls in its own transaction. Recipients are found by the producer from the core
-- (authorize / scope_set); this keeps them to the workspace's members, leaves out the person who did it,
-- writes one notice per event and person, queues the outside channels the rule allows and sends each
-- recipient a private signal that carries no content. Answers how many notices it wrote.
create function app_private.notify(
  target_type text,
  target_workspace uuid,
  target_recipients uuid[],
  target_event_key text,
  target_title text,
  target_body text default null,
  target_url text default null,
  target_actor uuid default null,
  target_subject_type text default null,
  target_subject_id uuid default null,
  target_data jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind public.notification_types;
  recipient uuid;
  written uuid;
  total integer := 0;
begin
  select * into kind from public.notification_types t where t.key = target_type;
  if kind.key is null then
    raise exception 'unknown notification type' using errcode = '22023', hint = 'notifications.unknown_type';
  end if;
  if (kind.scope = 'account') <> (target_workspace is null) then
    raise exception 'an account notice names no workspace; every other names one'
      using errcode = '22023', hint = 'notifications.scope_mismatch';
  end if;
  if nullif(btrim(coalesce(target_event_key, '')), '') is null then
    raise exception 'an event key is required' using errcode = '22023', hint = 'notifications.event_required';
  end if;
  if nullif(btrim(coalesce(target_title, '')), '') is null then
    raise exception 'a title is required' using errcode = '22023', hint = 'notifications.title_required';
  end if;
  if target_url is not null and target_url !~ '^/([^/\\].*)?$' then
    raise exception 'a link stays inside the app' using errcode = '22023', hint = 'notifications.url_outside_app';
  end if;
  -- The owner turned this optional type off: nobody gets it, not even in the list.
  if target_workspace is not null and exists (
    select 1 from public.notification_workspace_muted_types m where m.workspace_id = target_workspace and m.type_key = kind.key
  ) then
    return 0;
  end if;

  for recipient in
    select distinct r.id
    from unnest(coalesce(target_recipients, '{}'::uuid[])) r(id)
    where r.id is not null
      and (kind.notify_actor or r.id is distinct from target_actor)
      and exists (select 1 from auth.users u where u.id = r.id)
      and (kind.scope = 'account' or exists (
        select 1 from public.workspace_memberships m
        where m.workspace_id = target_workspace and m.user_id = r.id
          and (m.status in ('active', 'pending_activation')
               or (kind.to_former_members and m.status in ('suspended', 'removed')))
      ))
  loop
    written := null;
    insert into public.person_notifications (
      workspace_id, user_id, type_key, event_key, actor_user_id, subject_type, subject_id,
      title, body, url, data, expires_at
    ) values (
      target_workspace, recipient, kind.key, target_event_key, target_actor, target_subject_type, target_subject_id,
      btrim(target_title), nullif(btrim(coalesce(target_body, '')), ''), target_url, coalesce(target_data, '{}'::jsonb),
      now() + make_interval(days => kind.retention_days)
    )
    on conflict (user_id, workspace_id, type_key, event_key) do nothing
    returning id into written;
    continue when written is null;
    total := total + 1;

    insert into public.notification_deliveries (notification_id, channel, reason)
    select written, x.channel, x.reason
    from app_private.notification_route(kind.key, target_workspace, recipient) x
    where x.sends and x.channel <> 'in_app';

    perform realtime.send(jsonb_build_object('workspace_id', target_workspace), 'changed', 'notifications:' || recipient::text, true);
  end loop;
  return total;
end;
$$;

-- The first decision closes every decider's card ("Approved by ..."); a closed card stays as decided.
create function app_private.notification_resolve(
  target_workspace uuid,
  target_subject_type text,
  target_subject_id uuid,
  target_resolution text,
  target_resolved_by uuid
)
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
    set resolved_at = now(), resolution = target_resolution, resolved_by = target_resolved_by
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

-- Kept 90 days, account security a year (S-92): what is past its date goes, with its deliveries.
create function app_private.purge_expired_notifications(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare gone integer;
begin
  delete from public.person_notifications n where n.expires_at <= at_time;
  get diagnostics gone = row_count;
  return gone;
end;
$$;

select cron.schedule('notification-retention', '40 4 * * *', 'select app_private.purge_expired_notifications()');

-- Writing one's own choices is its own action (one's own, also while onboarding is not finished).
-- Like every 'own' action the core reads no permission for it; notifications.preferences.write_own,
-- which every system role holds, names it in the role catalog.
insert into app_private.authz_actions (key, scope_class, effect, restricted_ok)
values ('notifications.write_own', 'own', 'write', true);

-- The person's list -----------------------------------------------------------------------------------------

-- One's own list in a workspace, with the account's own notices: newest first, 'all', 'unread' or
-- 'needs_action', a page at a time; the badge counts what was not seen.
create function public.get_notification_feed_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_filter text default 'all',
  target_before timestamptz default null,
  target_limit integer default 30
)
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
     or target_limit is null or target_limit not between 1 and 100 then
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
    where (target_before is null or m.created_at < target_before)
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

-- Opening the list clears the badge; it reads nothing.
create function public.mark_notifications_seen_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- person_notifications has an actor_user_id column of its own.
  viewer uuid := actor_user_id;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'notifications.read_own');
  update public.person_notifications n set seen_at = now()
  where n.user_id = viewer and (n.workspace_id = target_workspace_id or n.workspace_id is null)
    and n.seen_at is null;
  return jsonb_build_object('unseen_count', 0);
end;
$$;

-- Clicking a row reads it; no ids is "Mark all as read". Only one's own rows.
create function public.mark_notifications_read_service(actor_user_id uuid, target_workspace_id uuid, target_ids uuid[] default null)
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
  return jsonb_build_object('updated', updated, 'unread_count', (
    select count(*) from public.person_notifications n
    where n.user_id = viewer and (n.workspace_id = target_workspace_id or n.workspace_id is null) and n.read_at is null));
end;
$$;

-- The person's choices --------------------------------------------------------------------------------------

-- The topics a person chooses by (those with a type that is not required and the owner did not turn
-- off), their choice and the default for email and push, and the state of each channel.
create function public.get_notification_preferences_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'notifications.read_own');
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
        'key', o.key, 'name', o.name,
        'email', jsonb_build_object('choice', (select p.enabled from public.notification_preferences p
                   where p.workspace_id = target_workspace_id and p.user_id = actor_user_id and p.topic_key = o.key and p.channel = 'email'),
                 'default', o.email_default),
        'push', jsonb_build_object('choice', (select p.enabled from public.notification_preferences p
                   where p.workspace_id = target_workspace_id and p.user_id = actor_user_id and p.topic_key = o.key and p.channel = 'push'),
                 'default', o.push_default)
      ) order by o.position)
      from (
        select tp.key, tp.name, tp.position, bool_or(t.default_email) email_default, bool_or(t.default_push) push_default
        from public.notification_topics tp
        join public.notification_types t on t.topic_key = tp.key and t.level <> 'required'
        where not exists (select 1 from public.notification_workspace_muted_types m
                          where m.workspace_id = target_workspace_id and m.type_key = t.key)
        group by tp.key, tp.name, tp.position
      ) o
    ), '[]'::jsonb)
  ) into result
  from auth.users u
  left join public.notification_workspace_settings s on s.workspace_id = target_workspace_id
  where u.id = actor_user_id;
  return result;
end;
$$;

-- [{topic, channel, enabled}]: enabled null goes back to the default. Email and push only: the list is
-- never turned off, text messages are not available, a required topic is no choice.
create function public.save_notification_preferences_service(actor_user_id uuid, target_workspace_id uuid, target_choices jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  choice jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'notifications.write_own');
  if jsonb_typeof(target_choices) is distinct from 'array' or jsonb_array_length(target_choices) not between 1 and 50 then
    raise exception 'valid choices required' using errcode = '22023', hint = 'notifications.invalid_choice';
  end if;
  for choice in select value from jsonb_array_elements(target_choices) loop
    if jsonb_typeof(choice) is distinct from 'object'
       or jsonb_typeof(choice -> 'enabled') is null or jsonb_typeof(choice -> 'enabled') not in ('boolean', 'null')
       or jsonb_typeof(choice -> 'topic') is distinct from 'string' or jsonb_typeof(choice -> 'channel') is distinct from 'string' then
      raise exception 'valid choices required' using errcode = '22023', hint = 'notifications.invalid_choice';
    end if;
    if choice ->> 'channel' = 'sms' then
      raise exception 'text messages are not available' using errcode = '22023', hint = 'notifications.sms_unavailable';
    end if;
    if choice ->> 'channel' not in ('email', 'push') then
      raise exception 'only email and push are a choice' using errcode = '22023', hint = 'notifications.invalid_channel';
    end if;
    if not exists (select 1 from public.notification_types t where t.topic_key = choice ->> 'topic' and t.level <> 'required') then
      raise exception 'this topic is not a choice' using errcode = '22023', hint = 'notifications.topic_locked';
    end if;
    if choice -> 'enabled' = 'null'::jsonb then
      delete from public.notification_preferences p
      where p.workspace_id = target_workspace_id and p.user_id = actor_user_id
        and p.topic_key = choice ->> 'topic' and p.channel = choice ->> 'channel';
    else
      insert into public.notification_preferences (workspace_id, user_id, topic_key, channel, enabled)
      values (target_workspace_id, actor_user_id, choice ->> 'topic', choice ->> 'channel', (choice ->> 'enabled')::boolean)
      on conflict (workspace_id, user_id, topic_key, channel)
      do update set enabled = excluded.enabled, updated_at = now();
    end if;
  end loop;
  return public.get_notification_preferences_service(actor_user_id, target_workspace_id);
end;
$$;

-- The workspace's settings ----------------------------------------------------------------------------------

-- Settings > Notifications: the workspace's channels, the optional types (on or off) and what is always
-- sent. An organization setting: owner and admin (GA-2).
create function public.get_notification_workspace_settings_service(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.organization.write');
  select jsonb_build_object(
    'email_enabled', coalesce(s.email_enabled, true),
    'push_enabled', coalesce(s.push_enabled, true),
    'sms_enabled', coalesce(s.sms_enabled, false),
    'sms_available', false,
    'optional', coalesce((
      select jsonb_agg(jsonb_build_object('key', t.key, 'area', t.area, 'description', t.description,
        'enabled', not exists (select 1 from public.notification_workspace_muted_types m
                               where m.workspace_id = target_workspace_id and m.type_key = t.key)) order by t.position)
      from public.notification_types t where t.level = 'optional'), '[]'::jsonb),
    'always_sent', coalesce((
      select jsonb_agg(jsonb_build_object('key', t.key, 'area', t.area, 'level', t.level, 'description', t.description) order by t.position)
      from public.notification_types t where t.level <> 'optional'), '[]'::jsonb)
  ) into result
  from (select 1) one
  left join public.notification_workspace_settings s on s.workspace_id = target_workspace_id;
  return result;
end;
$$;

-- {email_enabled, push_enabled, sms_enabled, muted_types}: the whole setting at once. Only optional
-- types can be turned off; text messages cannot be turned on.
create function public.save_notification_workspace_settings_service(actor_user_id uuid, target_workspace_id uuid, target_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  muted text[];
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.organization.write');
  if jsonb_typeof(target_settings) is distinct from 'object'
     or jsonb_typeof(target_settings -> 'email_enabled') is distinct from 'boolean'
     or jsonb_typeof(target_settings -> 'push_enabled') is distinct from 'boolean'
     or jsonb_typeof(target_settings -> 'sms_enabled') is distinct from 'boolean'
     or jsonb_typeof(target_settings -> 'muted_types') is distinct from 'array'
     or exists (select 1 from jsonb_array_elements(target_settings -> 'muted_types') e where jsonb_typeof(e) <> 'string') then
    raise exception 'valid notification settings required' using errcode = '22023', hint = 'notifications.invalid_settings';
  end if;
  if (target_settings ->> 'sms_enabled')::boolean then
    raise exception 'text messages are not available' using errcode = '22023', hint = 'notifications.sms_unavailable';
  end if;
  muted := array(select distinct e from jsonb_array_elements_text(target_settings -> 'muted_types') e);
  if exists (select 1 from unnest(muted) k
             where not exists (select 1 from public.notification_types t where t.key = k and t.level = 'optional')) then
    raise exception 'only an optional type can be turned off' using errcode = '22023', hint = 'notifications.not_optional';
  end if;

  insert into public.notification_workspace_settings (workspace_id, email_enabled, push_enabled, sms_enabled, updated_by, updated_at)
  values (target_workspace_id, (target_settings ->> 'email_enabled')::boolean, (target_settings ->> 'push_enabled')::boolean,
          false, actor_user_id, now())
  on conflict (workspace_id) do update set
    email_enabled = excluded.email_enabled, push_enabled = excluded.push_enabled, sms_enabled = false,
    updated_by = excluded.updated_by, updated_at = now();
  delete from public.notification_workspace_muted_types m
  where m.workspace_id = target_workspace_id and not m.type_key = any(muted);
  insert into public.notification_workspace_muted_types (workspace_id, type_key, muted_by)
  select target_workspace_id, k, actor_user_id from unnest(muted) k
  on conflict (workspace_id, type_key) do nothing;
  return public.get_notification_workspace_settings_service(actor_user_id, target_workspace_id);
end;
$$;

-- Who may call what ------------------------------------------------------------------------------------------

revoke all on function app_private.notification_route(text, uuid, uuid) from public;
revoke all on function app_private.notify(text, uuid, uuid[], text, text, text, text, uuid, text, uuid, jsonb) from public;
revoke all on function app_private.notification_resolve(uuid, text, uuid, text, uuid) from public;
revoke all on function app_private.purge_expired_notifications(timestamptz) from public;

revoke all on function public.get_notification_feed_service(uuid, uuid, text, timestamptz, integer) from public;
revoke all on function public.mark_notifications_seen_service(uuid, uuid) from public;
revoke all on function public.mark_notifications_read_service(uuid, uuid, uuid[]) from public;
revoke all on function public.get_notification_preferences_service(uuid, uuid) from public;
revoke all on function public.save_notification_preferences_service(uuid, uuid, jsonb) from public;
revoke all on function public.get_notification_workspace_settings_service(uuid, uuid) from public;
revoke all on function public.save_notification_workspace_settings_service(uuid, uuid, jsonb) from public;
grant execute on function public.get_notification_feed_service(uuid, uuid, text, timestamptz, integer) to service_role;
grant execute on function public.mark_notifications_seen_service(uuid, uuid) to service_role;
grant execute on function public.mark_notifications_read_service(uuid, uuid, uuid[]) to service_role;
grant execute on function public.get_notification_preferences_service(uuid, uuid) to service_role;
grant execute on function public.save_notification_preferences_service(uuid, uuid, jsonb) to service_role;
grant execute on function public.get_notification_workspace_settings_service(uuid, uuid) to service_role;
grant execute on function public.save_notification_workspace_settings_service(uuid, uuid, jsonb) to service_role;

-- The live channel: a person hears the signal for their own list, nobody sends one from the browser
-- (Realtime private channels only; S-91, BL-114).
create policy "people hear their own notification signals" on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and (select realtime.topic()) ~ '^notifications:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
    and app_private.rls_can(null::uuid, 'account.self', null::uuid[], null::uuid, split_part((select realtime.topic()), ':', 2)::uuid)
  );
