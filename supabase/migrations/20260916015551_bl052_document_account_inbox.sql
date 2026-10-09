-- Self document notices remain reachable through Account while onboarding or
-- document access is restricted. Workspace inbox authorization is unchanged.
create function app_private.document_account_inbox_allowed(item_id uuid,actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.notification_inbox_items i
  join public.notification_recipients r on r.id=i.recipient_projection_id and r.workspace_id=i.workspace_id
  join public.notification_events ev on ev.id=r.event_id and ev.workspace_id=r.workspace_id
  join public.notification_outbox o on o.event_id=ev.id and o.workspace_id=ev.workspace_id
  join public.employee_profiles p on p.id=(o.payload->>'employee_id')::uuid and p.workspace_id=i.workspace_id
  join public.workspace_memberships m on m.workspace_id=p.workspace_id and m.user_id=p.user_id
  join auth.users u on u.id=actor and u.deleted_at is null
  where i.id=item_id and r.recipient_user_id=actor and p.user_id=actor and p.archived_at is null
   and m.status in ('active','pending_activation') and app_private.workspace_allows_interactive_access(i.workspace_id)
   and i.dismissed_at is null and i.visibility_state='visible' and ev.cancelled_at is null
   and o.subject_type='employee_documents'
   and ev.type_key in ('people.documents.missing','people.documents.expiry','people.documents.approved','people.documents.rejected',
    'people.documents.restricted','people.documents.restored','people.documents.assigned','people.documents.activated')
   and (o.payload->>'requirement_id' is null or exists(select 1 from public.employee_onboarding_requirements q
    where q.id=(o.payload->>'requirement_id')::uuid and q.workspace_id=i.workspace_id and q.employee_id=p.id
     and q.lifecycle_user_id=actor and q.lifecycle_retired_at is null and q.status<>'superseded'))
   and app_private.document_notification_policy(o.id,actor,'{"decision":"allow"}') ->> 'decision'='allow'
 );
$$;
revoke all on function app_private.document_account_inbox_allowed(uuid,uuid) from public,anon,authenticated,service_role;

do $$
declare body text;
begin
 body:=pg_get_functiondef('public.get_notification_inbox_v2_service(uuid,uuid,text,text,text,timestamptz,uuid,integer)'::regprocedure);
 if strpos(body,'where item.workspace_id = target_workspace_id')=0 or strpos(body,'where unread_item.workspace_id = target_workspace_id')=0 then
  raise exception 'notification account inbox scope anchors changed'; end if;
 body:=replace(body,'where item.workspace_id = target_workspace_id',
  'where (item.workspace_id = target_workspace_id or (target_workspace_id is null and app_private.document_account_inbox_allowed(item.id,get_notification_inbox_v2_service.actor_user_id)))');
 body:=replace(body,'where unread_item.workspace_id = target_workspace_id',
  'where (unread_item.workspace_id = target_workspace_id or (target_workspace_id is null and app_private.document_account_inbox_allowed(unread_item.id,get_notification_inbox_v2_service.actor_user_id)))');
 -- Account lists a neutral summary and organization identity; private document
 -- content is still opened only on the separately authorized Documents route.
 body:=replace(body,'      item.safe_preview,',
  '      case when target_workspace_id is null then (select w.name from public.workspaces w where w.id=item.workspace_id)||'' · A document update is available.'' else item.safe_preview end as safe_preview,');
 execute body;
end;
$$;

alter function public.act_on_notification_inbox_item_v2_service(uuid,uuid,uuid,text) rename to document_account_inbox_action_base;
alter function public.document_account_inbox_action_base(uuid,uuid,uuid,text) set schema app_private;
revoke all on function app_private.document_account_inbox_action_base(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.act_on_notification_inbox_item_v2_service(actor_user_id uuid,target_workspace_id uuid,target_item_id uuid,target_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; affected integer;
begin
 if target_workspace_id is not null then
  return app_private.document_account_inbox_action_base(actor_user_id,target_workspace_id,target_item_id,target_action);
 end if;
 if target_action not in ('read_all','seen','read','unread','dismiss') then raise exception 'unsupported notification action' using errcode='22023'; end if;
 if target_action='read_all' or app_private.document_account_inbox_allowed(target_item_id,actor_user_id) then
  update public.notification_inbox_items i set
   seen_at=coalesce(i.seen_at,now()),
   read_at=case when target_action in ('read','read_all') then coalesce(i.read_at,now()) when target_action='unread' then null else i.read_at end,
   dismissed_at=case when target_action='dismiss' then now() else i.dismissed_at end
  where (target_action='read_all' or i.id=target_item_id) and app_private.document_account_inbox_allowed(i.id,actor_user_id);
  get diagnostics affected=row_count;
  if target_action='read_all' then
   result:=app_private.document_account_inbox_action_base(actor_user_id,null,null,target_action);
   affected:=affected+(result->>'affected')::integer;
  elsif affected=0 then raise exception 'notification inbox item not found' using errcode='P0002';
  end if;
  return jsonb_build_object('status','saved','affected',affected);
 end if;
 return app_private.document_account_inbox_action_base(actor_user_id,null,target_item_id,target_action);
end;
$$;
revoke all on function public.act_on_notification_inbox_item_v2_service(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.act_on_notification_inbox_item_v2_service(uuid,uuid,uuid,text) to service_role;
