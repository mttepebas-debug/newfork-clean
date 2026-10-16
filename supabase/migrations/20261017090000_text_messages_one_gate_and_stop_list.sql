-- BILDIRIM-SMS (KARARLAR S-123): text messages are ready but closed, part 9 of the plan. No provider is
-- connected and nothing is bought. The consent fields came with the core (notification_sms_consents);
-- this part adds what stays true whether the channel is open or not:
--   * one gate, app_private.sms_channel_open(). Every function that speaks of text messages asks it; the
--     five that each said "not available" on their own now say what the gate says. It answers false.
--     Opening it is its own migration, with the provider paid for (Mert's yes), and the browser's
--     shapes in packages/shared, which refuse a text message choice before it reaches here;
--   * the queue's last lock: while the gate is closed no text message can be written to
--     notification_deliveries, by a producer or any other way;
--   * the STOP list, kept by phone number, not by workspace: STOP from a number ends its consent in every
--     workspace and no later consent sends to it until the number sends START (the carriers' and the
--     FCC's rule; the provider's inbound webhook will call app_private.sms_inbound_keyword when it comes).

-- The gate ---------------------------------------------------------------------------------------------

create function app_private.sms_channel_open()
returns boolean
language sql
stable
set search_path = ''
as $$
  -- Closed until a provider is paid for (S-123).
  select false
$$;
revoke all on function app_private.sms_channel_open() from public, anon, authenticated;

-- The STOP list ----------------------------------------------------------------------------------------------

-- No key to a person or a workspace: a number that said STOP stays stopped when they go.
create table public.notification_sms_opt_outs (
  phone_e164 text primary key check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  keyword text not null check (keyword ~ '^[A-Z]{1,20}$'),
  opted_out_at timestamptz not null default now()
);
alter table public.notification_sms_opt_outs enable row level security;
revoke all on public.notification_sms_opt_outs from anon, authenticated;

-- What a number texted back: STOP and its kin stop it everywhere, START lifts the stop (consent must be
-- given again), HELP is answered by the provider's reply, anything else is ignored. Kept while the
-- channel is closed too: the law's, not the channel's.
create function app_private.sms_inbound_keyword(target_phone text, target_body text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  word text := upper(btrim(coalesce(target_body, '')));
begin
  if target_phone is null or target_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'a phone number in E.164 required' using errcode = '22023', hint = 'notifications.invalid_phone';
  end if;
  if word in ('STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT') then
    insert into public.notification_sms_opt_outs (phone_e164, keyword) values (target_phone, word)
    on conflict (phone_e164) do nothing;
    update public.notification_sms_consents c set revoked_at = now(), revoked_via = 'stop'
    where c.phone_e164 = target_phone and c.revoked_at is null;
    return 'stopped';
  elsif word in ('START', 'UNSTOP') then
    delete from public.notification_sms_opt_outs o where o.phone_e164 = target_phone;
    return 'started';
  elsif word in ('HELP', 'INFO') then
    return 'help';
  end if;
  return 'ignored';
end;
$$;
revoke all on function app_private.sms_inbound_keyword(text, text) from public, anon, authenticated;

-- The queue's last lock -----------------------------------------------------------------------------------

create function app_private.sms_delivery_gate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not app_private.sms_channel_open() then
    raise exception 'text messages are not available' using errcode = '22023', hint = 'notifications.sms_unavailable';
  end if;
  return new;
end;
$$;
revoke all on function app_private.sms_delivery_gate() from public, anon, authenticated;

create trigger notification_deliveries_sms_gate
  before insert or update of channel on public.notification_deliveries
  for each row when (new.channel = 'sms')
  execute function app_private.sms_delivery_gate();

-- Will it go: the gate, then a stopped number ----------------------------------------------------------------

create or replace function app_private.notification_route(target_type text, target_workspace uuid, target_user uuid)
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
  address text;
  suppressed boolean;
  devices integer;
  sms_consent boolean;
  sms_stopped boolean;
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
    select count(*) > 0, coalesce(bool_or(o.phone_e164 is not null), false) into sms_consent, sms_stopped
    from public.notification_sms_consents c
    left join public.notification_sms_opt_outs o on o.phone_e164 = c.phone_e164
    where c.workspace_id = target_workspace and c.user_id = target_user and c.revoked_at is null;
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

  -- Text message: closed at the gate, then as the other channels, a stopped number closing it last.
  if not app_private.sms_channel_open() then
    sms_sends := false; sms_why := 'not_available';
  elsif kind.level <> 'required' and not sms_on then
    sms_sends := false; sms_why := 'owner_off';
  elsif not coalesce(sms_consent, false) then
    sms_sends := false; sms_why := 'no_consent';
  elsif sms_stopped then
    sms_sends := false; sms_why := 'stopped';
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

-- A person's choices and the workspace's settings say what the gate says ---------------------------------------

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
  -- What the person hears: 'self', always, being a member; and the actions they hold somewhere in the
  -- workspace, as the core says: at a live location, or across it (the core's '{}', an owner's or an
  -- admin's even with no open location left).
  select array['self'] || coalesce(array_agg(x.a), '{}') into held
  from (select distinct unnest(t.heard_by) a from public.notification_types t) x
  where x.a <> 'self'
    and (cardinality(app_private.scope_set(actor_user_id, target_workspace_id, x.a)) > 0
         or app_private.authz_reason(actor_user_id, target_workspace_id, x.a, '{}') is null);

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
      'sms', jsonb_build_object('available', app_private.sms_channel_open(), 'workspace_enabled', coalesce(s.sms_enabled, false))),
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

create or replace function public.save_notification_preferences_service(actor_user_id uuid, target_workspace_id uuid, target_choices jsonb)
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
    if choice ->> 'channel' = 'sms' and not app_private.sms_channel_open() then
      raise exception 'text messages are not available' using errcode = '22023', hint = 'notifications.sms_unavailable';
    end if;
    if choice ->> 'channel' not in ('email', 'push', 'sms') then
      raise exception 'only email, push and text messages are a choice' using errcode = '22023', hint = 'notifications.invalid_channel';
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

create or replace function public.get_notification_workspace_settings_service(actor_user_id uuid, target_workspace_id uuid)
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
    'sms_available', app_private.sms_channel_open(),
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

create or replace function public.save_notification_workspace_settings_service(actor_user_id uuid, target_workspace_id uuid, target_settings jsonb)
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
  if (target_settings ->> 'sms_enabled')::boolean and not app_private.sms_channel_open() then
    raise exception 'text messages are not available' using errcode = '22023', hint = 'notifications.sms_unavailable';
  end if;
  muted := array(select distinct e from jsonb_array_elements_text(target_settings -> 'muted_types') e);
  if exists (select 1 from unnest(muted) k
             where not exists (select 1 from public.notification_types t where t.key = k and t.level = 'optional')) then
    raise exception 'only an optional type can be turned off' using errcode = '22023', hint = 'notifications.not_optional';
  end if;

  insert into public.notification_workspace_settings (workspace_id, email_enabled, push_enabled, sms_enabled, updated_by, updated_at)
  values (target_workspace_id, (target_settings ->> 'email_enabled')::boolean, (target_settings ->> 'push_enabled')::boolean,
          (target_settings ->> 'sms_enabled')::boolean, actor_user_id, now())
  on conflict (workspace_id) do update set
    email_enabled = excluded.email_enabled, push_enabled = excluded.push_enabled, sms_enabled = excluded.sms_enabled,
    updated_by = excluded.updated_by, updated_at = now();
  delete from public.notification_workspace_muted_types m
  where m.workspace_id = target_workspace_id and not m.type_key = any(muted);
  insert into public.notification_workspace_muted_types (workspace_id, type_key, muted_by)
  select target_workspace_id, k, actor_user_id from unnest(muted) k
  on conflict (workspace_id, type_key) do nothing;
  return public.get_notification_workspace_settings_service(actor_user_id, target_workspace_id);
end;
$$;
