-- Opportunistic delivery only after the staffing domain transaction commits.
create index notifications_staffing_subject on public.notifications(workspace_id,source_type,source_id) where source_type in('lineup_proposal','lineup_operation');
create index notification_outbox_staffing_delivery on public.notification_outbox(workspace_id,subject_id,available_at,created_at,id)
 where subject_type='lineup_staffing_notifications' and status in('pending','retry','leased');
create function public.flush_lineup_staffing_notifications_service(
 target_workspace_id uuid,target_proposal_id uuid default null,target_event_id uuid default null,target_batch_size integer default 50
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='100ms' as $$
declare
 p public.lineup_proposals%rowtype; event_id uuid:=target_event_id; notification_ids text[];
 item public.notification_outbox%rowtype; worker text:='staffing-immediate-'||gen_random_uuid()::text;
 result jsonb; failure jsonb; started timestamptz:=clock_timestamp();
 processed integer:=0; skipped integer:=0; retried integer:=0; dead integer:=0; leased integer:=0; deferred integer:=0; busy boolean:=false;
begin
 if target_workspace_id is null or (target_proposal_id is null)=(target_event_id is null)
  or target_batch_size is null or target_batch_size not between 1 and 100 then
  raise exception 'A workspace, one staffing subject and bounded batch are required' using errcode='22023';
 end if;
 if target_proposal_id is not null then
  select * into p from public.lineup_proposals where workspace_id=target_workspace_id and id=target_proposal_id;
  if p.id is null then raise exception 'Staffing proposal not found' using errcode='P0002'; end if;
  event_id:=(p.result->>'event_id')::uuid;
 elsif not exists(select 1 from public.lineup_operation_events where workspace_id=target_workspace_id and id=event_id) then
  raise exception 'Staffing operation not found' using errcode='P0002';
 end if;
 -- Proposal outcome includes the operation plus competing offers closed in
 -- that exact confirmation transaction. Other open offers/needs stay untouched.
 select coalesce(array_agg(n.id::text),'{}'::text[]) into notification_ids
 from public.notifications n where n.workspace_id=target_workspace_id and (
  (n.source_type='lineup_operation' and n.source_id=event_id)
  or (n.source_type='lineup_proposal' and (n.source_id=target_proposal_id or
   (p.status='confirmed' and n.event_key='coverage_filled' and exists(
    select 1 from public.lineup_proposals sibling where sibling.workspace_id=target_workspace_id and sibling.id=n.source_id
     and sibling.kind='offer' and sibling.status='cancelled' and sibling.responded_at=p.responded_at
     and sibling.operation->>'source_entry_id'=p.operation->>'source_entry_id')))));
 for item in
  select o.* from public.notification_outbox o
  where o.workspace_id=target_workspace_id and o.subject_type='lineup_staffing_notifications' and o.subject_id=any(notification_ids)
   and ((o.status in('pending','retry') and o.available_at<=clock_timestamp()) or (o.status='leased' and o.lease_expires_at<=clock_timestamp()))
  order by o.available_at,o.created_at,o.id for update skip locked limit target_batch_size
 loop
  exit when clock_timestamp()-started>=interval '1 second';
  -- Same per-notification lock as inbox projection. Do not wait on a worker.
  if not pg_try_advisory_xact_lock(hashtextextended(item.workspace_id::text||':'||item.subject_id,926)) then busy:=true;continue;end if;
  update public.notification_outbox set status='leased',lease_owner=worker,lease_expires_at=clock_timestamp()+interval '60 seconds',
   attempt_count=attempt_count+1,last_error=null where id=item.id;
  leased:=leased+1;
  begin
   result:=public.process_notification_outbox_service(worker,item.id);
   if result->>'status'='skipped' then skipped:=skipped+1;else processed:=processed+1;end if;
   if coalesce((result->>'invalidation_deferred')::boolean,false) then deferred:=deferred+1;end if;
  exception when others then
   failure:=public.fail_notification_outbox_service(worker,item.id,left(SQLERRM,500),5,15);
   if failure->>'status'='dead_letter' then dead:=dead+1;else retried:=retried+1;end if;
  end;
 end loop;
 return jsonb_build_object('busy',busy,'leased',leased,'processed',processed,'skipped',skipped,'retried',retried,'dead_lettered',dead,'invalidation_deferred',deferred,
  'remaining',exists(select 1 from public.notification_outbox o where o.workspace_id=target_workspace_id and o.subject_type='lineup_staffing_notifications' and o.subject_id=any(notification_ids)
   and ((o.status in('pending','retry') and o.available_at<=clock_timestamp()) or (o.status='leased' and o.lease_expires_at<=clock_timestamp()))));
end; $$;
revoke all on function public.flush_lineup_staffing_notifications_service(uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.flush_lineup_staffing_notifications_service(uuid,uuid,uuid,integer) to service_role;
