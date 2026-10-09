-- BL-055 Gate 3: global security events have no workspace foreign key.
-- No changes to Auth or Realtime-owned schemas. Existing preferences are retained.
alter table public.notification_catalog add column notification_scope text not null default 'workspace'
  check (notification_scope in ('workspace','account'));
create table public.account_notification_items (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 type_key text not null check(type_key like 'security.account.%'),
 schema_version integer not null default 1,
 event_id uuid not null unique,
 created_at timestamptz not null default now(),
 seen_at timestamptz, read_at timestamptz, dismissed_at timestamptz,
 foreign key(type_key,schema_version) references public.notification_catalog(type_key,schema_version)
);
create index account_notification_items_user_time on public.account_notification_items(user_id,created_at desc,id desc);
alter table public.account_notification_items enable row level security;
revoke all on public.account_notification_items from public,anon,authenticated;
grant select on public.account_notification_items to authenticated;
grant all on public.account_notification_items to service_role;
create policy account_notification_self_read on public.account_notification_items for select to authenticated
 using (user_id=(select auth.uid()));
alter publication supabase_realtime add table public.account_notification_items;

-- Freeze the old implicit email default for existing accounts without overwriting a preference.
create table app_private.notification_legacy_default_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table app_private.notification_legacy_default_accounts enable row level security;
revoke all on app_private.notification_legacy_default_accounts from public,anon,authenticated;
insert into app_private.notification_legacy_default_accounts select id from auth.users;

insert into public.notification_catalog(type_key,schema_version,category,severity,sensitivity,supported_channels,default_cadence,audience_contract,action_route_contract,dedupe_policy,retention_class,template_key,lifecycle,mandatory_in_app,notification_scope)
 values('security.account.email_change_requested',1,'security','warning','confidential',array['in_app'],'immediate','account_self',
 '{"route":"/app/account/security","allowed_query_keys":[]}','{"strategy":"keep_first","scope":"event_recipient","key_fields":["event_id","recipient_user_id"]}',
 'sensitive_30d','security.account.email_change_requested.v1','active',true,'account');
insert into public.notification_template_versions(type_key,schema_version,channel,locale,template_version,template_key,content,status,published_at)
 values('security.account.email_change_requested',1,'in_app','en',1,'security.account.email_change_requested.v1',
 jsonb_build_object('title','Email change requested','body','An email change was requested for your account. Review Security if this was not you.','safe_preview','An account security update is available.','action_url','/app/account/security'),'published',now());
insert into public.notification_catalog(type_key,schema_version,category,severity,sensitivity,supported_channels,default_cadence,audience_contract,action_route_contract,dedupe_policy,retention_class,template_key,lifecycle,mandatory_in_app,notification_scope)
 values('security.account.email_change_cancelled',1,'security','warning','confidential',array['in_app'],'immediate','account_self',
 '{"route":"/app/account/security","allowed_query_keys":[]}','{"strategy":"keep_first","scope":"event_recipient","key_fields":["event_id","recipient_user_id"]}',
 'sensitive_30d','security.account.email_change_cancelled.v1','active',true,'account');
insert into public.notification_template_versions(type_key,schema_version,channel,locale,template_version,template_key,content,status,published_at)
 values('security.account.email_change_cancelled',1,'in_app','en',1,'security.account.email_change_cancelled.v1',
 jsonb_build_object('title','Email change cancelled','body','The pending email change for your account was cancelled.','safe_preview','An account security update is available.','action_url','/app/account/security'),'published',now());
insert into public.notification_catalog(type_key,schema_version,category,severity,sensitivity,supported_channels,default_cadence,audience_contract,action_route_contract,dedupe_policy,retention_class,template_key,lifecycle,mandatory_in_app,notification_scope)
 values('security.account.password_changed',1,'security','warning','confidential',array['in_app'],'immediate','account_self',
 '{"route":"/app/account/security","allowed_query_keys":[]}','{"strategy":"keep_first","scope":"event_recipient","key_fields":["event_id","recipient_user_id"]}',
 'sensitive_30d','security.account.password_changed.v1','active',true,'account');
insert into public.notification_template_versions(type_key,schema_version,channel,locale,template_version,template_key,content,status,published_at)
 values('security.account.password_changed',1,'in_app','en',1,'security.account.password_changed.v1',
 jsonb_build_object('title','Password changed','body','Your account password was changed. Review Security if this was not you.','safe_preview','An account security update is available.','action_url','/app/account/security'),'published',now());
insert into public.notification_catalog(type_key,schema_version,category,severity,sensitivity,supported_channels,default_cadence,audience_contract,action_route_contract,dedupe_policy,retention_class,template_key,lifecycle,mandatory_in_app,notification_scope)
 values('security.account.sessions_revoked',1,'security','warning','confidential',array['in_app'],'immediate','account_self',
 '{"route":"/app/account/security","allowed_query_keys":[]}','{"strategy":"keep_first","scope":"event_recipient","key_fields":["event_id","recipient_user_id"]}',
 'sensitive_30d','security.account.sessions_revoked.v1','active',true,'account');
insert into public.notification_template_versions(type_key,schema_version,channel,locale,template_version,template_key,content,status,published_at)
 values('security.account.sessions_revoked',1,'in_app','en',1,'security.account.sessions_revoked.v1',
 jsonb_build_object('title','Other sessions signed out','body','Other sessions for your account were signed out.','safe_preview','An account security update is available.','action_url','/app/account/security'),'published',now());
insert into public.notification_catalog(type_key,schema_version,category,severity,sensitivity,supported_channels,default_cadence,audience_contract,action_route_contract,dedupe_policy,retention_class,template_key,lifecycle,mandatory_in_app,notification_scope)
 values('security.account.deletion_requested',1,'security','warning','confidential',array['in_app'],'immediate','account_self',
 '{"route":"/app/account/security","allowed_query_keys":[]}','{"strategy":"keep_first","scope":"event_recipient","key_fields":["event_id","recipient_user_id"]}',
 'sensitive_30d','security.account.deletion_requested.v1','active',true,'account');
insert into public.notification_template_versions(type_key,schema_version,channel,locale,template_version,template_key,content,status,published_at)
 values('security.account.deletion_requested',1,'in_app','en',1,'security.account.deletion_requested.v1',
 jsonb_build_object('title','Account deletion requested','body','Account deletion was requested. Check your recovery email to restore access.','safe_preview','An account security update is available.','action_url','/app/account/security'),'published',now());
insert into public.notification_catalog(type_key,schema_version,category,severity,sensitivity,supported_channels,default_cadence,audience_contract,action_route_contract,dedupe_policy,retention_class,template_key,lifecycle,mandatory_in_app,notification_scope)
 values('security.account.deletion_restored',1,'security','warning','confidential',array['in_app'],'immediate','account_self',
 '{"route":"/app/account/security","allowed_query_keys":[]}','{"strategy":"keep_first","scope":"event_recipient","key_fields":["event_id","recipient_user_id"]}',
 'sensitive_30d','security.account.deletion_restored.v1','active',true,'account');
insert into public.notification_template_versions(type_key,schema_version,channel,locale,template_version,template_key,content,status,published_at)
 values('security.account.deletion_restored',1,'in_app','en',1,'security.account.deletion_restored.v1',
 jsonb_build_object('title','Account restored','body','Your account deletion request was cancelled and account access was restored.','safe_preview','An account security update is available.','action_url','/app/account/security'),'published',now());

-- Project only allow-listed, authoritative audit events; never copy audit metadata or tokens.
create function app_private.project_account_security_notification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.workspace_id is null and new.actor_user_id is not null and new.event_type in
 ('account.email_change_requested','account.email_change_cancelled','account.password_changed',
 'account.sessions_revoked','account.deletion_requested','account.deletion_restored') then
  insert into public.account_notification_items(user_id,type_key,event_id)
   values(new.actor_user_id,'security.'||new.event_type,new.id) on conflict(event_id) do nothing;
 end if;
 return new;
end; $$;
revoke all on function app_private.project_account_security_notification() from public,anon,authenticated;
create trigger project_account_security_notification after insert on app_private.security_audit_events
 for each row execute function app_private.project_account_security_notification();

-- API-only observed Auth completions. Actor comes from Auth getUser, never request body.
create function public.record_account_security_notification_service(actor_user_id uuid,target_event text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if target_event not in ('account.email_change_requested','account.password_changed','account.sessions_revoked') then
  raise exception 'unsupported account security event' using errcode='22023';
 end if;
 if not exists(select 1 from auth.users where id=actor_user_id and deleted_at is null) then
  raise exception 'account session required' using errcode='42501';
 end if;
 perform app_private.record_security_audit_event_service(actor_user_id,null,target_event,'account.security','auth_user',actor_user_id::text,'{}');
end; $$;
revoke all on function public.record_account_security_notification_service(uuid,text) from public,anon,authenticated;
grant execute on function public.record_account_security_notification_service(uuid,text) to service_role;

create function public.notification_default_channels_service(actor_user_id uuid,target_type_key text)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('in_app','enabled','email',case when c.severity='action_required'
  or exists(select 1 from app_private.notification_legacy_default_accounts a where a.user_id=actor_user_id)
  then 'enabled' else 'disabled' end)
 from public.notification_catalog c where c.type_key=target_type_key order by c.schema_version desc limit 1;
$$;
revoke all on function public.notification_default_channels_service(uuid,text) from public,anon,authenticated;

alter function public.notification_user_channel_lock_reason_service(uuid,uuid,text,text) rename to notification_user_channel_lock_reason_workspace_base;
create function public.notification_user_channel_lock_reason_service(actor_user_id uuid,target_workspace_id uuid,target_type_key text,target_channel text)
returns text language plpgsql stable security definer set search_path='' as $$
begin
 if exists(select 1 from public.notification_catalog where type_key=target_type_key and notification_scope='account') then return 'mandatory_account_security'; end if;
 if target_channel='email' then
  if not exists(select 1 from auth.users where id=actor_user_id and email_confirmed_at is not null) then return 'email_unverified'; end if;
  -- There is currently no workspace email sender. Catalog support is not delivery capability.
  return 'delivery_unavailable';
 end if;
 return public.notification_user_channel_lock_reason_workspace_base(actor_user_id,target_workspace_id,target_type_key,target_channel);
end; $$;
revoke all on function public.notification_user_channel_lock_reason_service(uuid,uuid,text,text) from public,anon,authenticated;

alter function public.get_notification_user_preferences_service(uuid,uuid) rename to get_notification_user_preferences_workspace_base;
create function public.get_notification_user_preferences_service(actor_user_id uuid,target_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; account_catalog jsonb;
begin
 if not exists(select 1 from auth.users where id=actor_user_id and deleted_at is null) then raise exception 'account session required' using errcode='42501'; end if;
 if target_workspace_id is not null and not exists(select 1 from public.workspaces where id=target_workspace_id and lifecycle_status in ('active','closure_scheduled')) then raise exception 'notification preference access required' using errcode='42501'; end if;
 if target_workspace_id is null then
  result:=jsonb_build_object('workspace_id',null,'can_write',false,'workspaces','[]'::jsonb,'catalog','[]'::jsonb,'preferences','[]'::jsonb);
 else
  result:=public.get_notification_user_preferences_workspace_base(actor_user_id,target_workspace_id);
  result:=jsonb_set(result,'{workspaces}',coalesce((select jsonb_agg(w) from jsonb_array_elements(result->'workspaces') w where exists(select 1 from public.workspaces where id=(w->>'id')::uuid and lifecycle_status in ('active','closure_scheduled'))),'[]'::jsonb));
  result:=jsonb_set(result,'{catalog}',coalesce((select jsonb_agg(e||jsonb_build_object('default_channels',public.notification_default_channels_service(actor_user_id,e->>'type_key')))
   from jsonb_array_elements(result->'catalog') e where not exists(select 1 from public.notification_catalog c where c.type_key=e->>'type_key' and c.notification_scope='account')),'[]'::jsonb));
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('type_key',c.type_key,'scope','account','title',t.content->>'title','description',t.content->>'body','mandatory_in_app',true,'delivery','transactional_in_app') order by c.type_key),'[]'::jsonb)
 into account_catalog from public.notification_catalog c join public.notification_template_versions t using(type_key,schema_version)
 where c.notification_scope='account' and c.lifecycle='active' and t.channel='in_app' and t.locale='en' and t.status='published';
 return result||jsonb_build_object('account_catalog',account_catalog,'email_channel_reason',case when exists(select 1 from auth.users where id=actor_user_id and email_confirmed_at is not null) then 'delivery_unavailable' else 'email_unverified' end);
end; $$;
revoke all on function public.get_notification_user_preferences_service(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_notification_user_preferences_service(uuid,uuid) to service_role;

create or replace function public.get_notification_inbox_v2_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_category text,
  target_severity text,
  target_read_state text,
  target_cursor_created_at timestamptz,
  target_cursor_id uuid,
  target_limit integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result jsonb;
  effective_limit integer := greatest(1, least(coalesce(target_limit, 30), 50));
begin
  if target_workspace_id is not null and not public.notification_actor_is_active_member_service(actor_user_id, target_workspace_id) then
    raise exception 'notification inbox access required' using errcode = '42501';
  end if;
  if (target_cursor_created_at is null) <> (target_cursor_id is null) then
    raise exception 'complete notification cursor required' using errcode = '22023';
  end if;
  if target_category is not null and target_category not in (
    'security', 'schedule', 'requests', 'time_tracking',
    'payroll', 'people', 'communications', 'system',
    'announcement', 'request'
  ) then
    raise exception 'valid notification category required' using errcode = '22023';
  end if;
  if target_severity is not null and target_severity not in ('info', 'success', 'warning', 'action_required') then
    raise exception 'valid notification severity required' using errcode = '22023';
  end if;
  if target_read_state is not null and target_read_state not in ('all', 'seen', 'unseen', 'read', 'unread') then
    raise exception 'valid notification read state required' using errcode = '22023';
  end if;

  with all_items as (
    select
      item.id,
      item.workspace_id,
      catalog.category,
      event.type_key,
      event.schema_version,
      catalog.severity,
      item.title,
      item.body,
      item.safe_preview,
      item.action_url,
      item.group_key,
      'notification_event'::text as source_type,
      event.id as source_id,
      item.created_at,
      item.seen_at,
      item.read_at,
      item.dismissed_at,
      item.visibility_state
    from public.notification_inbox_items item
    join public.notification_recipients recipient
      on recipient.id = item.recipient_projection_id
     and recipient.workspace_id = item.workspace_id
    join public.notification_events event
      on event.id = recipient.event_id
     and event.workspace_id = recipient.workspace_id
    join public.notification_catalog catalog
      on catalog.type_key = event.type_key
     and catalog.schema_version = event.schema_version
    where item.workspace_id = target_workspace_id
      and recipient.recipient_user_id = get_notification_inbox_v2_service.actor_user_id
      and item.dismissed_at is null
      and item.visibility_state = 'visible'
      and not exists (
        select 1 from public.notification_outbox staffing_outbox
        where staffing_outbox.workspace_id = recipient.workspace_id
          and staffing_outbox.event_id = recipient.event_id
          and staffing_outbox.subject_type = 'lineup_staffing_notifications'
          and not public.lineup_staffing_notification_allowed(staffing_outbox.id, recipient.recipient_user_id)
      )

    union all
    select a.id,null::uuid,'security',a.type_key,a.schema_version,c.severity,t.content->>'title',t.content->>'body',
     t.content->>'safe_preview','/app/account/security',null::text,'account_security',a.event_id,a.created_at,a.seen_at,a.read_at,a.dismissed_at,'visible'
    from public.account_notification_items a join public.notification_catalog c using(type_key,schema_version)
    join public.notification_template_versions t using(type_key,schema_version)
    where a.user_id=actor_user_id and a.dismissed_at is null and t.channel='in_app' and t.locale='en' and t.status='published'
  ), candidate as (
    select * from all_items item where true
      and (
        target_category is null
        or item.category = target_category
        or (target_category = 'announcement' and item.category = 'communications')
        or (target_category = 'request' and item.category in ('requests', 'time_tracking'))
      )
      and (target_severity is null or item.severity = target_severity)
      and (
        target_read_state is null
        or target_read_state = 'all'
        or (target_read_state = 'seen' and item.seen_at is not null)
        or (target_read_state = 'unseen' and item.seen_at is null)
        or (target_read_state = 'read' and item.read_at is not null)
        or (target_read_state = 'unread' and item.read_at is null)
      )
      and (
        target_cursor_created_at is null
        or (item.created_at, item.id) < (target_cursor_created_at, target_cursor_id)
      )
    order by item.created_at desc, item.id desc
    limit effective_limit + 1
  ), page as (
    select * from candidate
    order by created_at desc, id desc
    limit effective_limit
  )
  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'unread_count', (select count(*) from public.account_notification_items where user_id=actor_user_id and read_at is null and dismissed_at is null) + (
      select count(*)
      from public.notification_inbox_items unread_item
      join public.notification_recipients unread_recipient
        on unread_recipient.id = unread_item.recipient_projection_id
       and unread_recipient.workspace_id = unread_item.workspace_id
      where unread_item.workspace_id = target_workspace_id
        and unread_recipient.recipient_user_id = get_notification_inbox_v2_service.actor_user_id
        and unread_item.read_at is null
        and unread_item.dismissed_at is null
        and unread_item.visibility_state = 'visible'
        and not exists (
          select 1 from public.notification_outbox staffing_outbox
          where staffing_outbox.workspace_id = unread_recipient.workspace_id
            and staffing_outbox.event_id = unread_recipient.event_id
            and staffing_outbox.subject_type = 'lineup_staffing_notifications'
            and not public.lineup_staffing_notification_allowed(staffing_outbox.id, unread_recipient.recipient_user_id)
        )
    ),
    'next_cursor', case
      when (select count(*) from candidate) > effective_limit then (
        select jsonb_build_object('created_at', created_at, 'id', id)
        from page
        order by created_at asc, id asc
        limit 1
      )
      else null
    end,
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page_row.id,
        'workspace_id', page_row.workspace_id,
        'scope', case when page_row.workspace_id is null then 'account' else 'workspace' end,
        'category', page_row.category,
        'type_key', page_row.type_key,
        'severity', page_row.severity,
        'safe_preview', page_row.safe_preview,
        'title', page_row.title,
        'body', page_row.body,
        'action_url', page_row.action_url,
        'group_key', page_row.group_key,
        'source_type', page_row.source_type,
        'source_id', page_row.source_id,
        'created_at', page_row.created_at,
        'seen_at', page_row.seen_at,
        'read_at', page_row.read_at,
        'visibility_state', page_row.visibility_state
      ) order by page_row.created_at desc, page_row.id desc)
      from page page_row
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

alter function public.act_on_notification_inbox_item_v2_service(uuid,uuid,uuid,text) rename to act_on_notification_inbox_workspace_base;
create function public.act_on_notification_inbox_item_v2_service(actor_user_id uuid,target_workspace_id uuid,target_item_id uuid,target_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare affected integer; workspace_result jsonb;
begin
 if target_workspace_id is not null and not public.notification_actor_is_active_member_service(actor_user_id,target_workspace_id) then
  raise exception 'notification inbox access required' using errcode='42501'; end if;
 if target_action not in ('read_all','seen','read','unread','dismiss') then raise exception 'unsupported notification action' using errcode='22023'; end if;
 if target_action='read_all' or exists(select 1 from public.account_notification_items where id=target_item_id and user_id=actor_user_id) then
  update public.account_notification_items set
   seen_at=coalesce(seen_at,now()),
   read_at=case when target_action in ('read','read_all') then coalesce(read_at,now()) when target_action='unread' then null else read_at end,
   dismissed_at=case when target_action='dismiss' then now() else dismissed_at end
  where user_id=actor_user_id and dismissed_at is null and (target_action='read_all' or id=target_item_id);
  get diagnostics affected=row_count;
  if target_action='read_all' and target_workspace_id is not null then
   workspace_result:=public.act_on_notification_inbox_workspace_base(actor_user_id,target_workspace_id,null,target_action);
   affected:=affected+(workspace_result->>'affected')::integer;
  end if;
  return jsonb_build_object('status','saved','affected',affected);
 end if;
 if target_workspace_id is null then raise exception 'notification inbox item not found' using errcode='P0002'; end if;
 return public.act_on_notification_inbox_workspace_base(actor_user_id,target_workspace_id,target_item_id,target_action);
end; $$;
revoke all on function public.act_on_notification_inbox_item_v2_service(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.act_on_notification_inbox_item_v2_service(uuid,uuid,uuid,text) to service_role;

create or replace function public.resolve_notification_policy_v1_service(
  target_workspace_id uuid,
  target_user_id uuid,
  target_type_key text,
  target_channel text,
  target_role_id uuid default null,
  target_location_id uuid default null,
  target_event_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  catalog public.notification_catalog%rowtype;
  membership public.workspace_memberships%rowtype;
  global_policy public.notification_org_policies%rowtype;
  role_policy public.notification_org_policies%rowtype;
  type_preference public.notification_user_preferences%rowtype;
  category_preference public.notification_user_preferences%rowtype;
  context_location_ids uuid[] := '{}'::uuid[];
  location_policy_versions jsonb := '[]'::jsonb;
  location_policy_denied boolean := false;
  location_policy_cadence text;
  preference_value text;
  consent_state text;
  eligible boolean := true;
  cadence text := 'immediate';
  reasons jsonb := '[]'::jsonb;
begin
  if target_channel not in ('in_app', 'email', 'push') then
    raise exception 'unsupported notification channel' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(target_event_context, '{}'::jsonb)) <> 'object' then
    raise exception 'notification event context must be an object' using errcode = '22023';
  end if;

  select * into catalog
  from public.notification_catalog entry
  where entry.type_key = target_type_key
    and entry.schema_version = 1
    and entry.lifecycle = 'active';

  if catalog.type_key is null then
    return jsonb_build_object(
      'decision', 'deny', 'eligible', false, 'cadence', 'immediate',
      'reason_chain', jsonb_build_array('catalog_inactive'),
      'versions', jsonb_build_object('schema_version', 1),
      'channels', jsonb_build_object(target_channel, jsonb_build_object(
        'eligible', false, 'cadence', 'immediate',
        'reason_chain', jsonb_build_array('catalog_inactive')
      ))
    );
  end if;
  reasons := reasons || jsonb_build_array('catalog_active');
  cadence := catalog.default_cadence;

  select * into membership
  from public.workspace_memberships member
  where member.workspace_id = target_workspace_id
    and member.user_id = target_user_id;
  if membership.id is null or membership.status <> 'active' then
    eligible := false;
    reasons := reasons || jsonb_build_array('membership_inactive');
  else
    reasons := reasons || jsonb_build_array('membership_active');
  end if;

  if membership.id is not null
    and target_role_id is not null
    and membership.role_id <> target_role_id then
    eligible := false;
    reasons := reasons || jsonb_build_array('role_context_mismatch');
  end if;

  if exists (
    select 1 from public.employee_profiles employee
    where employee.workspace_id = target_workspace_id
      and employee.user_id = target_user_id
      and employee.archived_at is not null
  ) then
    eligible := false;
    reasons := reasons || jsonb_build_array('employee_archived');
  end if;

  if target_location_id is not null then
    context_location_ids := array[target_location_id];
  elsif jsonb_typeof(target_event_context->'location_ids') = 'array' then
    select coalesce(array_agg(distinct value::uuid), '{}'::uuid[])
    into context_location_ids
    from jsonb_array_elements_text(target_event_context->'location_ids') item(value);
  elsif nullif(target_event_context->>'location_id', '') is not null then
    context_location_ids := array[(target_event_context->>'location_id')::uuid];
  end if;

  if cardinality(context_location_ids) > 0 then
    if exists (
      select 1 from unnest(context_location_ids) context_location(location_id)
      where not exists (
        select 1 from public.locations location
        where location.id = context_location.location_id
          and location.workspace_id = target_workspace_id
      )
    ) then
      eligible := false;
      reasons := reasons || jsonb_build_array('location_context_mismatch');
    elsif membership.id is null or (
      not membership.all_locations
      and not exists (
        select 1 from public.membership_location_scopes scope
        where scope.workspace_id = target_workspace_id
          and scope.membership_id = membership.id
          and scope.location_id = any(context_location_ids)
      )
    ) then
      eligible := false;
      reasons := reasons || jsonb_build_array('location_scope_denied');
    else
      reasons := reasons || jsonb_build_array('location_scope_allowed');
    end if;
  end if;

  select * into global_policy
  from public.notification_org_policies policy
  where policy.workspace_id = target_workspace_id
    and policy.type_key = target_type_key
    and policy.role_id is null
    and policy.location_id is null;

  if membership.role_id is not null then
    select * into role_policy
    from public.notification_org_policies policy
    where policy.workspace_id = target_workspace_id
      and policy.type_key = target_type_key
      and policy.role_id = membership.role_id
      and policy.location_id is null;
  end if;

  if cardinality(context_location_ids) > 0 then
    select
      coalesce(bool_or(not policy.enabled or not (target_channel = any(policy.allowed_channels))), false),
      coalesce(jsonb_agg(jsonb_build_object('location_id', policy.location_id, 'version', policy.version) order by policy.location_id), '[]'::jsonb),
      case
        when bool_or(policy.cadence = 'weekly_digest') then 'weekly_digest'
        when bool_or(policy.cadence = 'daily_digest') then 'daily_digest'
        else null
      end
    into location_policy_denied, location_policy_versions, location_policy_cadence
    from public.notification_org_policies policy
    where policy.workspace_id = target_workspace_id
      and policy.type_key = target_type_key
      and policy.location_id = any(context_location_ids)
      and policy.role_id is null;
  end if;

  if not (target_channel = any(catalog.supported_channels)) then
    eligible := false;
    reasons := reasons || jsonb_build_array('catalog_channel_unsupported');
  else
    reasons := reasons || jsonb_build_array('catalog_channel_supported');
  end if;

  if global_policy.id is not null then
    reasons := reasons || jsonb_build_array('organization_policy_v' || global_policy.version::text);
    cadence := global_policy.cadence;
    if not global_policy.enabled or not (target_channel = any(global_policy.allowed_channels)) then
      eligible := false;
      reasons := reasons || jsonb_build_array('organization_policy_denied');
    end if;
  else
    reasons := reasons || jsonb_build_array('organization_default');
  end if;

  if role_policy.id is not null then
    reasons := reasons || jsonb_build_array('role_policy_v' || role_policy.version::text);
    cadence := role_policy.cadence;
    if not role_policy.enabled or not (target_channel = any(role_policy.allowed_channels)) then
      eligible := false;
      reasons := reasons || jsonb_build_array('role_policy_denied');
    end if;
  end if;

  if jsonb_array_length(location_policy_versions) > 0 then
    reasons := reasons || jsonb_build_array('location_policy');
    cadence := coalesce(location_policy_cadence, cadence);
    if location_policy_denied then
      eligible := false;
      reasons := reasons || jsonb_build_array('location_policy_denied');
    end if;
  end if;

  select * into type_preference
  from public.notification_user_preferences preference
  where preference.workspace_id = target_workspace_id
    and preference.user_id = target_user_id
    and preference.preference_scope = 'type'
    and preference.scope_key = target_type_key;
  select * into category_preference
  from public.notification_user_preferences preference
  where preference.workspace_id = target_workspace_id
    and preference.user_id = target_user_id
    and preference.preference_scope = 'category'
    and preference.scope_key = catalog.category;

  preference_value := coalesce(
    nullif(type_preference.channel_preferences->>target_channel,'inherit'),
    nullif(category_preference.channel_preferences->>target_channel,'inherit'),
    role_policy.channel_defaults->>target_channel,
    global_policy.channel_defaults->>target_channel,
    public.notification_default_channels_service(target_user_id,target_type_key)->>target_channel,
    'enabled'
  );
  cadence := coalesce(type_preference.cadence, category_preference.cadence, cadence);

  if target_channel = 'in_app' and catalog.mandatory_in_app then
    reasons := reasons || jsonb_build_array('mandatory_in_app');
  elsif preference_value = 'disabled' then
    eligible := false;
    reasons := reasons || jsonb_build_array(
      case
        when type_preference.id is not null then 'user_type_preference_disabled'
        when category_preference.id is not null then 'user_category_preference_disabled'
        else 'organization_channel_default_disabled'
      end
    );
  elsif type_preference.id is not null then
    reasons := reasons || jsonb_build_array('user_type_preference');
  elsif category_preference.id is not null then
    reasons := reasons || jsonb_build_array('user_category_preference');
  else
    reasons := reasons || jsonb_build_array('user_default');
  end if;

  if target_channel in ('email', 'push') and eligible then
    select consent.consent_state into consent_state
    from public.notification_consents consent
    where consent.workspace_id = target_workspace_id
      and consent.user_id = target_user_id
      and consent.channel = target_channel
    order by consent.recorded_at desc, consent.id desc
    limit 1;
    if consent_state not in ('granted', 'not_required') or consent_state is null then
      eligible := false;
      reasons := reasons || jsonb_build_array('consent_missing_or_withdrawn');
    elsif not exists (
      select 1 from public.notification_endpoints endpoint
      where endpoint.workspace_id = target_workspace_id
        and endpoint.user_id = target_user_id
        and endpoint.channel = target_channel
        and endpoint.status = 'active'
    ) then
      eligible := false;
      reasons := reasons || jsonb_build_array('endpoint_unavailable_or_suppressed');
    else
      reasons := reasons || jsonb_build_array('consent_and_endpoint_active');
    end if;
  end if;

  reasons := reasons || jsonb_build_array(case when eligible then 'allow' else 'deny' end);
  return jsonb_build_object(
    'decision', case when eligible then 'allow' else 'deny' end,
    'eligible', eligible,
    'cadence', cadence,
    'reason_chain', reasons,
    'versions', jsonb_build_object(
      'catalog_schema_version', catalog.schema_version,
      'organization_policy_version', global_policy.version,
      'role_policy_version', role_policy.version,
      'location_policy_versions', location_policy_versions,
      'user_type_preference_version', type_preference.version,
      'user_category_preference_version', category_preference.version
    ),
    'channels', jsonb_build_object(target_channel, jsonb_build_object(
      'eligible', eligible,
      'cadence', cadence,
      'reason_chain', reasons
    ))
  );
end;
$$;

create or replace function public.get_notification_settings_service(
  actor_user_id uuid,
  target_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  can_write boolean;
  catalog_rows jsonb;
  policy_rows jsonb;
  role_rows jsonb;
  location_rows jsonb;
  audit_rows jsonb;
begin
  if not (
    public.service_actor_has_permission(actor_user_id, target_workspace_id, 'notifications.settings.read')
    or public.service_actor_has_permission(actor_user_id, target_workspace_id, 'notifications.settings.write')
  ) then
    raise exception 'notification settings read access required' using errcode = '42501';
  end if;

  can_write := public.service_actor_has_permission(
    actor_user_id,
    target_workspace_id,
    'notifications.settings.write'
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'type_key', entry.type_key,
    'schema_version', entry.schema_version,
    'category', entry.category,
    'severity', entry.severity,
    'sensitivity', entry.sensitivity,
    'supported_channels', to_jsonb(entry.supported_channels),
    'default_cadence', entry.default_cadence,
    'action_route', entry.action_route_contract->>'route',
    'mandatory_in_app', entry.mandatory_in_app,
    'policy', jsonb_build_object(
      'id', policy.id,
      'scope', jsonb_build_object('kind', 'global', 'id', null, 'name', 'Organization'),
      'enabled', coalesce(policy.enabled, true),
      'allowed_channels', coalesce(to_jsonb(policy.allowed_channels), to_jsonb(entry.supported_channels)),
      'cadence', coalesce(policy.cadence, entry.default_cadence),
      'version', policy.version,
      'updated_by', policy.updated_by,
      'updated_at', policy.updated_at,
      'source', case when policy.id is null then 'catalog_default' else 'organization_policy' end
    )
  ) order by entry.category, entry.type_key), '[]'::jsonb)
  into catalog_rows
  from public.notification_catalog entry
  left join public.notification_org_policies policy
    on policy.workspace_id = target_workspace_id
   and policy.type_key = entry.type_key
   and policy.schema_version = entry.schema_version
   and policy.role_id is null
   and policy.location_id is null
  where entry.notification_scope = 'workspace' and entry.lifecycle = 'active';

  select coalesce(jsonb_agg(jsonb_build_object(
    'type_key', policy.type_key,
    'schema_version', policy.schema_version,
    'id', policy.id,
    'scope', jsonb_build_object(
      'kind', case
        when policy.role_id is not null then 'role'
        when policy.location_id is not null then 'location'
        else 'global'
      end,
      'id', coalesce(policy.role_id, policy.location_id),
      'name', coalesce(role_row.name, location.name, 'Organization')
    ),
    'enabled', policy.enabled,
    'allowed_channels', to_jsonb(policy.allowed_channels),
    'cadence', policy.cadence,
    'version', policy.version,
    'updated_by', policy.updated_by,
    'updated_at', policy.updated_at,
    'source', 'organization_policy'
  ) order by policy.type_key, coalesce(role_row.name, location.name, 'Organization')), '[]'::jsonb)
  into policy_rows
  from public.notification_org_policies policy
  left join public.workspace_roles role_row
    on role_row.id = policy.role_id and role_row.workspace_id = policy.workspace_id
  left join public.locations location
    on location.id = policy.location_id and location.workspace_id = policy.workspace_id
  where policy.workspace_id = target_workspace_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', role_row.id, 'name', role_row.name)
    order by role_row.sort_order, role_row.name), '[]'::jsonb)
  into role_rows
  from public.workspace_roles role_row
  where role_row.workspace_id = target_workspace_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', location.id, 'name', location.name)
    order by location.sort_order, location.name), '[]'::jsonb)
  into location_rows
  from public.locations location
  where location.workspace_id = target_workspace_id
    and location.archived_at is null;

  select coalesce(jsonb_agg(to_jsonb(audit_item) order by audit_item.occurred_at desc, audit_item.id desc), '[]'::jsonb)
  into audit_rows
  from (
    select
      log.id,
      log.action,
      log.target_type,
      log.target_id,
      log.actor_user_id,
      log.reason,
      case when jsonb_typeof(log.metadata->'before_version') = 'number'
        then (log.metadata->>'before_version')::integer else null end as before_version,
      case when jsonb_typeof(log.metadata->'after_version') = 'number'
        then (log.metadata->>'after_version')::integer else null end as after_version,
      log.occurred_at
    from public.notification_audit_log log
    where log.workspace_id = target_workspace_id
      and log.action in ('notification.policy.saved', 'notification.policy.reset')
    order by log.occurred_at desc, log.id desc
    limit 50
  ) audit_item;

  return jsonb_build_object(
    'workspace_id', target_workspace_id,
    'can_write', can_write,
    'catalog', catalog_rows,
    'policies', policy_rows,
    'roles', role_rows,
    'locations', location_rows,
    'audit', audit_rows
  );
end;
$$;

create or replace function public.save_notification_user_preferences_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_updates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  update_row jsonb;
  requested_preference_scope text;
  requested_scope_key text;
  requested_channel_preferences jsonb;
  requested_cadence text;
  requested_timezone text;
  requested_quiet_hours jsonb;
  requested_safe_preview boolean;
  expected_version integer;
  existing public.notification_user_preferences%rowtype;
  saved public.notification_user_preferences%rowtype;
  saved_rows jsonb := '[]'::jsonb;
  seen_keys text[] := array[]::text[];
  changed_channel text;
  changed_value text;
  lock_reason text;
  audit_before jsonb;
begin
  if not public.notification_actor_is_active_member_service(actor_user_id, target_workspace_id) then
    raise exception 'notification preference access required' using errcode = '42501';
  end if;
  if jsonb_typeof(target_updates) <> 'array'
    or jsonb_array_length(target_updates) = 0
    or jsonb_array_length(target_updates) > 50 then
    raise exception 'valid notification preference patch required' using errcode = '22023';
  end if;

  for update_row in select * from jsonb_array_elements(target_updates)
  loop
    requested_preference_scope := update_row->>'preference_scope';
    requested_scope_key := btrim(coalesce(update_row->>'scope_key', ''));
    requested_channel_preferences := coalesce(update_row->'channel_preferences', '{}'::jsonb);
    requested_cadence := nullif(update_row->>'cadence', '');
    requested_timezone := nullif(update_row->>'timezone', '');
    requested_quiet_hours := case
      when update_row ? 'quiet_hours' and update_row->'quiet_hours' <> 'null'::jsonb
      then update_row->'quiet_hours'
      else null
    end;
    requested_safe_preview := coalesce((update_row->>'safe_preview_enabled')::boolean, true);
    expected_version := case
      when update_row ? 'expected_version' and update_row->'expected_version' <> 'null'::jsonb
      then (update_row->>'expected_version')::integer
      else null
    end;

    if array[requested_preference_scope || ':' || requested_scope_key] && seen_keys then
      raise exception 'duplicate notification preference scope' using errcode = '22023';
    end if;
    seen_keys := seen_keys || (requested_preference_scope || ':' || requested_scope_key);

    if requested_preference_scope not in ('category', 'type')
      or requested_scope_key = ''
      or jsonb_typeof(requested_channel_preferences) <> 'object'
      or requested_channel_preferences - array['in_app', 'email', 'push']::text[] <> '{}'::jsonb
      or exists (
        select 1
        from jsonb_each_text(requested_channel_preferences) entry
        where entry.value not in ('enabled', 'disabled', 'inherit')
      )
      or (requested_cadence is not null and requested_cadence not in ('immediate', 'daily_digest', 'weekly_digest'))
      or (requested_timezone is not null and char_length(requested_timezone) > 80)
      or (requested_quiet_hours is not null and (
        jsonb_typeof(requested_quiet_hours) <> 'object'
        or not (requested_quiet_hours ? 'enabled')
        or not (requested_quiet_hours ? 'start')
        or not (requested_quiet_hours ? 'end')
      )) then
      raise exception 'valid notification preference required' using errcode = '22023';
    end if;

    if requested_preference_scope = 'category' and not exists (
      select 1 from public.notification_catalog catalog
      where catalog.lifecycle = 'active'
        and catalog.notification_scope = 'workspace' and catalog.category = requested_scope_key
    ) then
      raise exception 'notification preference scope not found' using errcode = 'P0002';
    end if;
    if requested_preference_scope = 'type' and not exists (
      select 1 from public.notification_catalog catalog
      where catalog.lifecycle = 'active'
        and catalog.type_key = requested_scope_key
    ) then
      raise exception 'notification preference scope not found' using errcode = 'P0002';
    end if;

    select * into existing
    from public.notification_user_preferences preference
    where preference.workspace_id = target_workspace_id
      and preference.user_id = actor_user_id
      and preference.preference_scope = requested_preference_scope
      and preference.scope_key = requested_scope_key
    for update;
    if requested_preference_scope='type' and exists(select 1 from public.notification_catalog where type_key=requested_scope_key and notification_scope='account') then
      raise exception 'account security notifications are mandatory' using errcode='42501';
    end if;
    for changed_channel, changed_value in
      select entry.key, entry.value from jsonb_each_text(requested_channel_preferences) entry
    loop
      if changed_value = 'enabled' and changed_value is distinct from existing.channel_preferences->>changed_channel then
        if requested_preference_scope = 'type' then
          lock_reason := public.notification_user_channel_lock_reason_service(
            actor_user_id,
            target_workspace_id,
            requested_scope_key,
            changed_channel
          );
          if lock_reason <> 'available' then
            raise exception 'notification channel managed by organization' using errcode = '42501';
          end if;
        elsif exists (
          select 1
          from public.notification_catalog catalog
          where catalog.lifecycle = 'active'
            and catalog.notification_scope = 'workspace' and catalog.category = requested_scope_key
            and public.notification_user_channel_lock_reason_service(
              actor_user_id,
              target_workspace_id,
              catalog.type_key,
              changed_channel
            ) <> 'available'
        ) then
          raise exception 'notification channel managed by organization' using errcode = '42501';
        end if;
      end if;
    end loop;

    audit_before := case
      when existing.id is null then null
      else public.notification_user_preference_to_json(existing)
    end;

    if existing.id is not null then
      if expected_version is null or existing.version <> expected_version then
        raise exception 'stale notification preference version' using errcode = '40001';
      end if;
      update public.notification_user_preferences
      set channel_preferences = existing.channel_preferences || requested_channel_preferences,
          cadence = requested_cadence,
          timezone = requested_timezone,
          quiet_hours = requested_quiet_hours,
          safe_preview_enabled = requested_safe_preview,
          version = public.notification_user_preferences.version + 1,
          updated_at = now()
      where id = existing.id
      returning * into saved;
    else
      if expected_version is not null then
        raise exception 'notification preference not found' using errcode = 'P0002';
      end if;
      insert into public.notification_user_preferences (
        workspace_id, user_id, preference_scope, scope_key,
        channel_preferences, cadence, timezone, quiet_hours, safe_preview_enabled
      ) values (
        target_workspace_id, actor_user_id, requested_preference_scope, requested_scope_key,
        requested_channel_preferences, requested_cadence, requested_timezone,
        requested_quiet_hours, requested_safe_preview
      )
      returning * into saved;
    end if;

    insert into public.notification_audit_log (
      workspace_id, actor_user_id, action, target_type, target_id, reason, metadata
    ) values (
      target_workspace_id,
      actor_user_id,
      'notification.preference.saved',
      'notification_user_preference',
      saved.id::text,
      null,
      jsonb_build_object(
        'before', audit_before,
        'after', public.notification_user_preference_to_json(saved)
      )
    );

    saved_rows := saved_rows || jsonb_build_array(public.notification_user_preference_to_json(saved));
  end loop;

  return jsonb_build_object('status', 'saved', 'preferences', saved_rows);
end;
$$;

-- The reconciliation registry describes both transactional projection boundaries.
alter table public.notification_producer_registry drop constraint notification_producer_registry_integration_contract_check;
alter table public.notification_producer_registry add constraint notification_producer_registry_integration_contract_check
 check(integration_contract in ('outbox_v1','account_audit_v1'));
insert into public.notification_producer_registry(type_key,schema_version,producer_id,source_migration,source_function,integration_contract)
 select type_key,1,type_key,'20260914221045_account_notification_scope.sql','app_private.project_account_security_notification','account_audit_v1'
 from public.notification_catalog where notification_scope='account';
-- These existing producers were implemented but absent from the database registry.
insert into public.notification_producer_registry(type_key,schema_version,producer_id,source_migration,source_function)
 select type_key,1,type_key,'20260909013000_lineup_staffing_notification_inbox.sql','lineup_staffing_enqueue_notification'
 from public.notification_catalog where type_key like 'schedule.staffing.%';
insert into public.notification_producer_registry(type_key,schema_version,producer_id,source_migration,source_function)
 values('security.account_invitation_cancelled',1,'account-deletion-invitation-cancellation','20260914115233_account_security_deletion_lifecycle.sql','request_account_deletion_v2_service');

create or replace function public.reconcile_notification_platform_service()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    where event.action not in ('viewed', 'returned_to_pending')
    union all
    select event.workspace_id, event.id,
      case when event.action = 'submitted' then 'requests.shift_change.submitted'
        else 'requests.shift_change.status_changed' end,
      event.created_at
    from public.schedule_shift_change_events event
    where event.action <> 'viewed'
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
  ), missing_corrections as (
    select correction.workspace_id,
      (
        substr(digest.value, 1, 8) || '-' || substr(digest.value, 9, 4) || '-' ||
        substr(digest.value, 13, 4) || '-' || substr(digest.value, 17, 4) || '-' || substr(digest.value, 21, 12)
      )::uuid event_id,
      'time_tracking.correction.submitted' type_key,
      correction.submitted_at occurred_at,
      'deterministic_time_correction_event_without_outbox' reason
    from public.time_correction_requests correction
    join public.notification_producer_registry registry
      on registry.type_key = 'time_tracking.correction.submitted' and registry.schema_version = 1
    cross join lateral (
      select md5(correction.workspace_id::text || ':time-correction-submitted:' || correction.request_idempotency_key::text) value
    ) digest
    where correction.submitted_at >= registry.activated_at
      and not exists (
        select 1 from public.notification_outbox outbox
        where outbox.workspace_id = correction.workspace_id
          and outbox.event_id = (
            substr(digest.value, 1, 8) || '-' || substr(digest.value, 9, 4) || '-' ||
            substr(digest.value, 13, 4) || '-' || substr(digest.value, 17, 4) || '-' || substr(digest.value, 21, 12)
          )::uuid
      )
    union all
    select correction.workspace_id,
      (
        substr(digest.value, 1, 8) || '-' || substr(digest.value, 9, 4) || '-' ||
        substr(digest.value, 13, 4) || '-' || substr(digest.value, 17, 4) || '-' || substr(digest.value, 21, 12)
      )::uuid,
      'time_tracking.correction.decided', correction.decided_at,
      'deterministic_time_correction_event_without_outbox'
    from public.time_correction_requests correction
    join public.notification_producer_registry registry
      on registry.type_key = 'time_tracking.correction.decided' and registry.schema_version = 1
    cross join lateral (
      select md5(correction.workspace_id::text || ':time-correction-decided:' || correction.decision_idempotency_key::text) value
    ) digest
    where correction.decided_at is not null
      and correction.decision_idempotency_key is not null
      and correction.decided_at >= registry.activated_at
      and not exists (
        select 1 from public.notification_outbox outbox
        where outbox.workspace_id = correction.workspace_id
          and outbox.event_id = (
            substr(digest.value, 1, 8) || '-' || substr(digest.value, 9, 4) || '-' ||
            substr(digest.value, 13, 4) || '-' || substr(digest.value, 17, 4) || '-' || substr(digest.value, 21, 12)
          )::uuid
      )
  ), missing_announcements as (
    select announcement.workspace_id, null::uuid event_id,
      'communications.announcement.available' type_key,
      announcement.updated_at occurred_at,
      'published_announcement_without_outbox' reason
    from public.announcements announcement
    join public.notification_producer_registry registry
      on registry.type_key = 'communications.announcement.available' and registry.schema_version = 1
    where announcement.status in ('published', 'scheduled')
      and announcement.updated_at >= registry.activated_at
      and not exists (
        select 1 from public.notification_outbox outbox
        where outbox.workspace_id = announcement.workspace_id
          and outbox.type_key = 'communications.announcement.available'
          and outbox.subject_id = announcement.id::text
          and outbox.payload->>'announcement_revision' = announcement.revision::text
      )
  ), all_missing as (
    select * from missing_requests
    union all select * from missing_corrections
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
$$;

-- Audit proved this existing mandatory workspace producer lacked its published template.
insert into public.notification_template_versions(type_key,schema_version,channel,locale,template_version,template_key,content,status,published_at)
 select type_key,schema_version,'in_app','en',1,template_key,
 jsonb_build_object('title','Pending invitation cancelled','body','A pending employee invitation was cancelled after an account deletion request.','safe_preview','A workspace access update is available.','action_url','/app/employees'),
 'published',now() from public.notification_catalog where type_key='security.account_invitation_cancelled'
 on conflict do nothing;
create or replace function public.cancel_account_email_change_service(
  actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_email text;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501';
  end if;

  select nullif(email_change,'') into pending_email from auth.users where id=actor_user_id for update;
  if not found then raise exception 'account not found' using errcode='P0002'; end if;
  if pending_email is null then return jsonb_build_object('status','cancelled'); end if;

  update auth.users auth_user
  set email_change = '',
      email_change_token_current = '',
      email_change_token_new = '',
      email_change_sent_at = null,
      email_change_confirm_status = 0,
      updated_at = now()
  where auth_user.id = actor_user_id
;

  if not found then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  delete from auth.one_time_tokens token
  where token.user_id = actor_user_id
    and token.token_type in (
      'email_change_token_current'::auth.one_time_token_type,
      'email_change_token_new'::auth.one_time_token_type
    );

  perform app_private.record_security_audit_event_service(
    actor_user_id, null, 'account.email_change_cancelled', 'account.security',
    'auth_user', actor_user_id::text, '{}'::jsonb
  );

  return jsonb_build_object('status', 'cancelled');
end;
$$;
