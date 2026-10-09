-- Keep immutable event/recipient evidence while presenting one current case update.
alter table public.shift_exchange_events add column notification_sequence bigint;
-- Older events have no sequence. Timestamp plus UUID is a deterministic tie
-- break for historical rows; new events use an actual monotonic sequence.
with ordered as (
 select id,row_number() over(order by created_at,id) sequence from public.shift_exchange_events
)
update public.shift_exchange_events e set notification_sequence=o.sequence from ordered o where o.id=e.id;
alter table public.shift_exchange_events alter column notification_sequence set not null;
alter table public.shift_exchange_events alter column notification_sequence add generated always as identity;
select setval(pg_get_serial_sequence('public.shift_exchange_events','notification_sequence'),
 coalesce(max(notification_sequence),1),count(*)>0) from public.shift_exchange_events;
create index shift_exchange_event_notification_order on public.shift_exchange_events(workspace_id,case_id,notification_sequence desc);
create index notification_outbox_exchange_case on public.notification_outbox(workspace_id,subject_id,event_id) where subject_type='shift_exchange_cases';

create function public.shift_exchange_notification_allowed(oid uuid, recipient uuid)
returns boolean language plpgsql stable set search_path='' as $$
declare o public.notification_outbox%rowtype; c public.shift_exchange_cases%rowtype;
 e public.shift_exchange_events%rowtype; person uuid; offered jsonb; audience text;
begin
 select * into o from public.notification_outbox where id=oid;
 if o.id is null then return false; end if;
 if o.subject_type<>'shift_exchange_cases' then return true; end if;
 select * into c from public.shift_exchange_cases where workspace_id=o.workspace_id and id::text=o.subject_id;
 if c.id is null or not app_private.workspace_allows_interactive_access(o.workspace_id)
  or not exists(select 1 from public.workspace_memberships m where m.workspace_id=o.workspace_id and m.user_id=recipient and m.status='active') then return false; end if;
 select * into e from public.shift_exchange_events where workspace_id=o.workspace_id and case_id=c.id and id::text=o.payload->>'request_event_id';
 if e.id is null then return false; end if;
 select id into person from public.employee_profiles where workspace_id=o.workspace_id and user_id=recipient and archived_at is null;
 audience:=o.payload->>'audience_contract';
 if audience='schedule_request_reviewers' then
  return public.shift_exchange_live_status(o.workspace_id,c.id)='open'
   and exists(select 1 from public.shift_exchange_applications a where a.case_id=c.id and a.status='pending_manager')
   and (public.schedule_actor_has_capability_service(recipient,o.workspace_id,'schedule.shift_change_requests.manage',(c.offered_snapshot->>'location_id')::uuid)
    or (c.kind='swap' and public.schedule_actor_has_capability_service(recipient,o.workspace_id,'schedule.shift_change_requests.manage',(c.requested_snapshot->>'location_id')::uuid)))
   and (person is null or (person is distinct from c.owner_id and not exists(select 1 from public.shift_exchange_applications a where a.id=e.application_id and a.employee_id=person)));
 elsif audience='eligible_shift_cover_candidates' then
  if public.shift_exchange_live_status(o.workspace_id,c.id)<>'open' or person is null or person=c.owner_id then return false; end if;
  offered:=public.shift_exchange_shift(o.workspace_id,c.offered_source_id);
  return coalesce(public.lineup_candidate_check(o.workspace_id,person,offered)->>'status'='eligible',false);
 elsif audience='shift_change_participants' then
  if person is null or not (person is not distinct from c.owner_id or exists(select 1 from public.shift_exchange_applications a where a.case_id=c.id and a.employee_id=person and (e.application_id is null or a.id=e.application_id))) then return false; end if;
  if e.action in('application_submitted','peer_accepted','scope_approved','peer_invited') then
   return public.shift_exchange_live_status(o.workspace_id,c.id)='open'
    and exists(select 1 from public.shift_exchange_applications a where a.id=e.application_id and a.status=case when e.action='peer_invited' then 'invited' else 'pending_manager' end);
  end if;
  return true;
 end if;
 return false;
end; $$;

create function public.shift_exchange_notification_policy_service(oid uuid, recipient uuid, policy jsonb)
returns jsonb language sql stable set search_path='' as $$
 select case when public.shift_exchange_notification_allowed(oid,recipient) then policy
  else policy || jsonb_build_object('decision','deny','eligible',false,
   'reason_chain',coalesce(policy->'reason_chain','[]'::jsonb)||jsonb_build_array('shift_exchange_audience_changed'),
   'channels',jsonb_build_object('in_app',jsonb_build_object('eligible',false,'cadence','immediate','reason_chain',jsonb_build_array('shift_exchange_audience_changed')))) end;
$$;

create function public.shift_exchange_sync_notifications(w uuid,cid uuid)
returns void language plpgsql set search_path='' as $$
declare pending integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(w::text||':'||cid::text,925));
 select count(*) into pending from public.shift_exchange_applications where workspace_id=w and case_id=cid and status='pending_manager';
 -- Keep actionable counts current even when the last candidate withdraws and
 -- no new reviewer outbox event is produced. Already-read rows remain read.
 update public.notification_inbox_items i set
  title=case when i.group_key='shift_exchange_review:'||cid::text then format('%s %s ready for review',pending,case when pending=1 then 'candidate' else 'candidates' end) else i.title end,
  body=format('%s %s awaiting manager approval. Review this request in Shift Hub.',pending,case when pending=1 then 'candidate is' else 'candidates are' end)
 from public.notification_recipients r join public.notification_outbox o on o.event_id=r.event_id and o.workspace_id=r.workspace_id
 where i.recipient_projection_id=r.id and i.workspace_id=w and o.subject_type='shift_exchange_cases' and o.subject_id=cid::text
  and i.visibility_state='visible' and o.payload->>'request_action' in('application_submitted','peer_accepted','scope_approved');

 with ranked as (
  select i.id,row_number() over(partition by r.recipient_user_id,i.group_key order by e.notification_sequence desc,i.id desc) position
  from public.notification_inbox_items i
  join public.notification_recipients r on r.id=i.recipient_projection_id and r.workspace_id=i.workspace_id
  join public.notification_outbox o on o.event_id=r.event_id and o.workspace_id=r.workspace_id
  join public.shift_exchange_events e on e.workspace_id=r.workspace_id and e.case_id=cid and e.id::text=o.payload->>'request_event_id'
  where i.workspace_id=w and o.subject_type='shift_exchange_cases' and o.subject_id=cid::text and i.group_key like 'shift_exchange%'
 )
 update public.notification_inbox_items i set visibility_state='superseded' from ranked where i.id=ranked.id and ranked.position>1 and i.visibility_state='visible';

 -- Run on domain changes as well as relay delivery. A zero-candidate closure
 -- may produce no recipient event, but must still remove the old opportunity.
 update public.notification_inbox_items i set visibility_state='cancelled'
 from public.notification_recipients r join public.notification_outbox o on o.event_id=r.event_id and o.workspace_id=r.workspace_id
 where i.recipient_projection_id=r.id and i.workspace_id=w and o.subject_type='shift_exchange_cases' and o.subject_id=cid::text
  and i.visibility_state='visible' and not public.shift_exchange_notification_allowed(o.id,r.recipient_user_id);

 update public.notifications n set title=i.title,body=i.body,
  dismissed_at=case when i.visibility_state<>'visible' then coalesce(n.dismissed_at,now()) else n.dismissed_at end
 from public.notification_inbox_items i join public.notification_recipients r on r.id=i.recipient_projection_id
 join public.notification_outbox o on o.event_id=r.event_id and o.workspace_id=r.workspace_id
 where n.id=i.legacy_notification_id and i.workspace_id=w and o.subject_type='shift_exchange_cases' and o.subject_id=cid::text;
end; $$;

alter function public.shift_exchange_emit(uuid,uuid,uuid,uuid,text,text,text) rename to shift_exchange_emit_notification_base;
create function public.shift_exchange_emit(actor uuid,w uuid,cid uuid,aid uuid,act text,msg text,private_msg text default '') returns void
language plpgsql set search_path='' as $$
begin
 perform public.shift_exchange_emit_notification_base(actor,w,cid,aid,act,msg,private_msg);
 perform public.shift_exchange_sync_notifications(w,cid);
end; $$;

-- Apply the existing channel preferences, then the current domain audience.
do $hook$
declare definition text; updated text;
begin
 definition:=pg_get_functiondef('public.project_notification_recipients_service(uuid)'::regprocedure);
 updated:=replace(definition,'public.resolve_notification_policy_v1_service(',
  'public.shift_exchange_notification_policy_service(outbox.id, candidate.user_id, public.resolve_notification_policy_v1_service(');
 updated:=replace(updated,') snapshot', ')) snapshot');
 if updated=definition or updated not like '%candidate.user_id, public.resolve_notification_policy_v1_service(%' then raise exception 'Recipient projection hook not found'; end if;
 execute updated;
end; $hook$;

-- Revalidation also runs immediately before inbox insertion, including retries
-- after a recipient projection was already created under earlier permissions.
do $hook$
declare definition text; updated text;
begin
 definition:=pg_get_functiondef('public.project_notification_inbox_service(uuid)'::regprocedure);
 updated:=replace(definition,'where recipient.workspace_id = outbox.workspace_id and recipient.event_id = outbox.event_id',
  'where recipient.workspace_id = outbox.workspace_id and recipient.event_id = outbox.event_id and public.shift_exchange_notification_allowed(outbox.id, recipient.recipient_user_id)');
 if updated=definition then raise exception 'Inbox projection hook not found'; end if;
 execute updated;
 alter function public.project_notification_inbox_service(uuid) rename to project_notification_inbox_exchange_base;
end; $hook$;

create function public.project_notification_inbox_service(target_outbox_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare o public.notification_outbox%rowtype; affected integer;
begin
 select * into o from public.notification_outbox where id=target_outbox_id;
 if o.subject_type='shift_exchange_cases' then
  -- Relay workers for the same case serialize so two deliveries cannot both win.
  perform pg_advisory_xact_lock(hashtextextended(o.workspace_id::text||':'||o.subject_id,925));
 end if;
 affected:=public.project_notification_inbox_exchange_base(target_outbox_id);
 if o.subject_type<>'shift_exchange_cases' then return affected; end if;

 perform public.shift_exchange_sync_notifications(o.workspace_id,o.subject_id::uuid);
 return affected;
end; $$;

revoke all on function public.shift_exchange_notification_allowed(uuid,uuid),public.shift_exchange_notification_policy_service(uuid,uuid,jsonb),public.project_notification_inbox_exchange_base(uuid),public.project_notification_inbox_service(uuid) from public,anon,authenticated;
grant execute on function public.project_notification_inbox_service(uuid) to service_role;

revoke all on function public.shift_exchange_sync_notifications(uuid,uuid),public.shift_exchange_emit_notification_base(uuid,uuid,uuid,uuid,text,text,text),public.shift_exchange_emit(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
