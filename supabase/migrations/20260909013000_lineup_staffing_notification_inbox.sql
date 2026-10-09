-- Staffing keeps its existing domain records, while joining the shared
-- outbox/policy/inbox pipeline. No assignment or historical read state changes.
insert into public.notification_catalog(type_key,schema_version,category,severity,sensitivity,supported_channels,default_cadence,audience_contract,action_route_contract,dedupe_policy,retention_class,template_key,lifecycle,mandatory_in_app)
values (
 'schedule.staffing.offer_updated', 1,'schedule','action_required','confidential',array['in_app'],'immediate','lineup_staffing_participants',
 '{"route":"/app/employee-hub/lineup","allowed_query_keys":["staffing_offer","date","location"]}',
 '{"strategy":"keep_first","scope":"event_recipient","key_fields":["legacy_notification_id","recipient_user_id"]}',
 'standard_90d','schedule.staffing.offer_updated.v1','active',false
), (
 'schedule.staffing.offer_closed', 1,'schedule','info','confidential',array['in_app'],'immediate','lineup_staffing_participants',
 '{"route":"/app/employee-hub/lineup","allowed_query_keys":["staffing_offer","date","location"]}',
 '{"strategy":"keep_first","scope":"event_recipient","key_fields":["legacy_notification_id","recipient_user_id"]}',
 'standard_90d','schedule.staffing.offer_closed.v1','active',false
), (
 'schedule.staffing.assignment_changed', 1,'schedule','info','confidential',array['in_app'],'immediate','lineup_staffing_participants',
 '{"route":"/app/employee-hub/schedule","allowed_query_keys":["staffing_offer","date","location"]}',
 '{"strategy":"keep_first","scope":"event_recipient","key_fields":["legacy_notification_id","recipient_user_id"]}',
 'standard_90d','schedule.staffing.assignment_changed.v1','active',false
);
insert into public.notification_template_versions(type_key,schema_version,channel,locale,template_version,template_key,content,status,published_at)
select type_key,1,'in_app','en',1,template_key,
 jsonb_build_object('title','Staffing update','body','Your staffing request or assignment changed.','safe_preview','A staffing update is available.','action_url',action_route_contract->>'route'),
 'published',now() from public.notification_catalog where type_key in('schedule.staffing.offer_updated','schedule.staffing.offer_closed','schedule.staffing.assignment_changed');

create function public.lineup_staffing_notification_allowed(oid uuid,recipient uuid)
returns boolean language plpgsql volatile set search_path='' as $$
declare o public.notification_outbox%rowtype; n public.notifications%rowtype;
 p public.lineup_proposals%rowtype; e public.lineup_operation_events%rowtype; person uuid;
begin
 select * into o from public.notification_outbox where id=oid;
 if o.subject_type is distinct from 'lineup_staffing_notifications' then return false; end if;
 select * into n from public.notifications where id::text=o.subject_id and workspace_id=o.workspace_id;
 if n.id is null or n.recipient_user_id<>recipient or not app_private.workspace_allows_interactive_access(o.workspace_id)
  or not exists(select 1 from public.workspace_memberships m where m.workspace_id=o.workspace_id and m.user_id=recipient and m.status='active') then return false; end if;
 select id into person from public.employee_profiles where workspace_id=o.workspace_id and user_id=recipient and archived_at is null;
 if n.source_type='lineup_proposal' then
  select * into p from public.lineup_proposals where workspace_id=o.workspace_id and id=n.source_id and kind='offer';
  if p.id is null then return false; end if;
  if n.event_key in('requested','coverage_filled','cancelled') then
   return person is not null and person=p.employee_id and
    case n.event_key when 'requested' then p.status='pending' and p.expires_at>clock_timestamp() and public.lineup_candidate_check(o.workspace_id,person,p.operation->'target')->>'status'='eligible'
      else p.status='cancelled' end;
  elsif n.event_key in('accepted','declined') then
   return p.status=n.event_key and (n.event_key<>'accepted' or p.expires_at>clock_timestamp())
    and public.schedule_actor_has_capability_service(recipient,o.workspace_id,'schedule.lineup.manage',p.source_location_id)
    and public.schedule_actor_can_publish_service(recipient,o.workspace_id,p.source_location_id);
  end if;
 elsif n.source_type='lineup_operation' then
  select * into e from public.lineup_operation_events where workspace_id=o.workspace_id and id=n.source_id;
  if e.id is null then return false; end if;
  if n.event_key='assignment_changed' then
   return person is not null and person::text in(e.after_state->'operation'->>'employee_id',e.before_state->'source'->>'employee_id',e.before_state->'other'->>'employee_id');
  elsif n.event_key='manager_assignment_changed' then
   return exists(select 1 from unnest(e.location_ids) loc
    where public.schedule_actor_has_capability_service(recipient,o.workspace_id,'schedule.lineup.manage',loc)
     and public.schedule_actor_can_publish_service(recipient,o.workspace_id,loc));
  end if;
 end if;
 return false;
end; $$;

create function public.lineup_staffing_enqueue_notification(nid uuid)
returns uuid language plpgsql set search_path='' as $$
declare n public.notifications%rowtype; p public.lineup_proposals%rowtype; e public.lineup_operation_events%rowtype;
 loc uuid; locations uuid[]; actor uuid; destination text; key text;
begin
 select * into n from public.notifications where id=nid;
 if n.source_type='lineup_proposal' then
  select * into p from public.lineup_proposals where workspace_id=n.workspace_id and id=n.source_id and kind='offer';
  if p.id is null or n.event_key not in('requested','accepted','declined','cancelled','coverage_filled') then return null; end if;
  loc:=p.source_location_id; locations:=array[p.source_location_id,p.target_location_id]; actor:=case when n.event_key='requested' then p.created_by else null end;
  key:=case when n.event_key in('requested','accepted') then 'schedule.staffing.offer_updated' else 'schedule.staffing.offer_closed' end;
  destination:=case when n.event_key in('accepted','declined') then '/app/schedule/lineup?date='||p.source_date::text||'&location='||loc::text
   else '/app/employee-hub/lineup?staffing_offer='||p.id::text end;
 elsif n.source_type='lineup_operation' then
  select * into e from public.lineup_operation_events where workspace_id=n.workspace_id and id=n.source_id;
  if e.id is null or n.event_key not in('assignment_changed','manager_assignment_changed') then return null; end if;
  locations:=e.location_ids; loc:=locations[1]; actor:=e.actor_user_id; key:='schedule.staffing.assignment_changed';
  if n.event_key='manager_assignment_changed' then
   select candidate into loc from unnest(locations) candidate
   where public.schedule_actor_has_capability_service(n.recipient_user_id,n.workspace_id,'schedule.lineup.manage',candidate)
    and public.schedule_actor_can_publish_service(n.recipient_user_id,n.workspace_id,candidate)
   order by candidate limit 1;
   if loc is null then return null; end if;
  end if;
  destination:=case when n.event_key='assignment_changed' then '/app/employee-hub/schedule'
   else '/app/schedule/lineup?date='||e.date::text||'&location='||loc::text end;
 else return null;
 end if;
 -- Original UUID is the idempotency key; replays cannot multiply the event.
 return public.enqueue_notification_outbox_service(n.workspace_id,n.id,key,1,actor,'lineup_staffing_notifications',n.id::text,
  jsonb_build_object('correlation_id',n.id,'legacy_notification_id',n.id,'location_id',loc,'location_ids',to_jsonb(locations),
   'recipient_user_ids',jsonb_build_array(n.recipient_user_id),'audience_contract','lineup_staffing_participants',
   'title',n.title,'body',n.body,'safe_preview','A staffing update is available.','action_url',destination,
   'group_key','staffing:'||n.source_id::text||':'||n.event_key),n.created_at);
end; $$;
create function public.lineup_staffing_notification_insert() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform public.lineup_staffing_enqueue_notification(new.id); return new; end; $$;
create trigger lineup_staffing_notification_insert after insert on public.notifications for each row
 when(new.source_type in('lineup_proposal','lineup_operation')) execute function public.lineup_staffing_notification_insert();

-- Reuse the shared current-audience gate at recipient projection. All existing
-- Shift Hub cases retain their exact implementation and grants.
alter function public.shift_exchange_notification_allowed(uuid,uuid) rename to shift_exchange_notification_allowed_staffing_base;
create function public.shift_exchange_notification_allowed(oid uuid,recipient uuid)
returns boolean language plpgsql volatile set search_path='' as $$
begin
 if exists(select 1 from public.notification_outbox where id=oid and subject_type='lineup_staffing_notifications') then
  return public.lineup_staffing_notification_allowed(oid,recipient);
 end if;
 return public.shift_exchange_notification_allowed_staffing_base(oid,recipient);
end; $$;

alter function public.project_notification_inbox_service(uuid) rename to project_notification_inbox_staffing_base;
create function public.project_notification_inbox_service(target_outbox_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare o public.notification_outbox%rowtype; affected integer;
begin
 select * into o from public.notification_outbox where id=target_outbox_id;
 if o.subject_type is distinct from 'lineup_staffing_notifications' then return public.project_notification_inbox_staffing_base(target_outbox_id); end if;
 -- Serialize duplicate deliveries and reuse the original legacy row, including
 -- its read/dismiss timestamps. Never create a second unread legacy badge.
 perform pg_advisory_xact_lock(hashtextextended(o.workspace_id::text||':'||o.subject_id,926));
 insert into public.notification_inbox_items(workspace_id,recipient_projection_id,legacy_notification_id,title,body,safe_preview,action_url,group_key,created_at,seen_at,read_at,dismissed_at)
 select r.workspace_id,r.id,n.id,n.title,n.body,o.payload->>'safe_preview',o.payload->>'action_url',o.payload->>'group_key',n.created_at,
  coalesce(n.read_at,n.dismissed_at),n.read_at,n.dismissed_at
 from public.notification_recipients r join public.notifications n on n.id::text=o.subject_id and n.workspace_id=r.workspace_id and n.recipient_user_id=r.recipient_user_id
 where r.workspace_id=o.workspace_id and r.event_id=o.event_id
  and public.lineup_staffing_notification_allowed(o.id,r.recipient_user_id)
  and public.resolve_notification_policy_v1_service(o.workspace_id,r.recipient_user_id,o.type_key,'in_app',null,
    (o.payload->>'location_id')::uuid,jsonb_build_object('location_ids',o.payload->'location_ids','audience_contract','lineup_staffing_participants'))->>'decision'='allow'
 on conflict (recipient_projection_id) do nothing;
 get diagnostics affected=row_count;
 return affected;
end; $$;

create function public.lineup_staffing_sync_notifications(w uuid) returns void
language plpgsql set search_path='' as $$
begin
 update public.notification_inbox_items i set visibility_state='cancelled'
 from public.notification_recipients r join public.notification_outbox o on o.workspace_id=r.workspace_id and o.event_id=r.event_id
 where i.recipient_projection_id=r.id and i.workspace_id=w and o.subject_type='lineup_staffing_notifications'
  and i.visibility_state='visible' and not public.lineup_staffing_notification_allowed(o.id,r.recipient_user_id);
 update public.notifications n set dismissed_at=coalesce(n.dismissed_at,now())
 from public.notification_inbox_items i where i.workspace_id=w and i.legacy_notification_id=n.id and i.visibility_state='cancelled'
  and n.source_type in('lineup_proposal','lineup_operation');
end; $$;
create function public.lineup_staffing_proposal_status() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.kind='offer' and new.status in('accepted','declined') then
  insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key)
  select new.workspace_id,m.user_id,'schedule',case new.status when 'accepted' then 'Shift offer accepted' else 'Shift offer declined' end,
   case new.status when 'accepted' then 'An employee accepted your shift offer. Review the current assignment before confirming.' else 'An employee declined your shift offer. Coverage remains unchanged.' end,
   '/app/schedule/lineup?date='||new.source_date::text||'&location='||new.source_location_id::text,'lineup_proposal',new.id,new.status
  from public.workspace_memberships m where m.workspace_id=new.workspace_id and m.status='active'
   and public.schedule_actor_has_capability_service(m.user_id,new.workspace_id,'schedule.lineup.manage',new.source_location_id)
   and public.schedule_actor_can_publish_service(m.user_id,new.workspace_id,new.source_location_id)
  on conflict do nothing;
 elsif new.kind='offer' and new.status='cancelled' and not coalesce(new.result->>'reason','') like '%another accepted offer%' then
  insert into public.notifications(workspace_id,recipient_user_id,category,title,body,action_url,source_type,source_id,event_key)
  select new.workspace_id,e.user_id,'schedule','Shift offer cancelled','This shift offer was cancelled. Your Schedule has not changed.',
   '/app/employee-hub/lineup?staffing_offer='||new.id::text,'lineup_proposal',new.id,'cancelled'
  from public.employee_profiles e where e.workspace_id=new.workspace_id and e.id=new.employee_id and e.user_id is not null and e.archived_at is null on conflict do nothing;
 end if;
 perform public.lineup_staffing_sync_notifications(new.workspace_id);
 return new;
end; $$;
create trigger lineup_staffing_proposal_status after update of status on public.lineup_proposals for each row
 when(new.status is distinct from old.status) execute function public.lineup_staffing_proposal_status();

revoke all on function public.lineup_staffing_notification_allowed(uuid,uuid),public.lineup_staffing_enqueue_notification(uuid),public.lineup_staffing_notification_insert(),public.lineup_staffing_sync_notifications(uuid),public.lineup_staffing_proposal_status(),public.shift_exchange_notification_allowed_staffing_base(uuid,uuid),public.shift_exchange_notification_allowed(uuid,uuid),public.project_notification_inbox_staffing_base(uuid),public.project_notification_inbox_service(uuid) from public,anon,authenticated,service_role;
grant execute on function public.project_notification_inbox_service(uuid) to service_role;

-- Apply the same audience check before pagination and unread counting.
-- Expiry and revoked location scope must not leave an actionable inbox item.
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
  if not public.notification_actor_is_active_member_service(actor_user_id, target_workspace_id) then
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

  with candidate as (
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
      and (
        target_category is null
        or catalog.category = target_category
        or (target_category = 'announcement' and catalog.category = 'communications')
        or (target_category = 'request' and catalog.category in ('requests', 'time_tracking'))
      )
      and (target_severity is null or catalog.severity = target_severity)
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
    'unread_count', (
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

