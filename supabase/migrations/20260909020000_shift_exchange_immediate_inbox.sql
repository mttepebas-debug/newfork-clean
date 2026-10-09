-- Delivery is a separate transaction after the domain command has committed.
-- Cron uses the same processor, so both immediate delivery and later retries
-- notify open screens only after inbox projection is durable.
create index notification_outbox_exchange_delivery on public.notification_outbox(workspace_id,subject_id,available_at,created_at,id)
 where subject_type='shift_exchange_cases' and status in('pending','retry','leased');
alter function public.process_notification_outbox_service(text,uuid)
  rename to process_notification_outbox_before_signal;

create function public.process_notification_outbox_service(target_worker_id text,target_outbox_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; item public.notification_outbox%rowtype; signalled jsonb;
begin
 result:=public.process_notification_outbox_before_signal(target_worker_id,target_outbox_id);
 select * into item from public.notification_outbox where id=target_outbox_id;
 if result->>'status'='processed' and item.subject_type in('shift_exchange_cases','lineup_staffing_notifications') then
  -- One workspace signal per transaction, even for a large multi-candidate case.
  -- The content-free bus invalidates authenticated reads; it carries no inbox data.
  begin
   signalled:=coalesce(nullif(current_setting('app.exchange_inbox_signalled',true),''),'[]')::jsonb;
   if not signalled @> jsonb_build_array(item.workspace_id::text) then
    perform realtime.send(jsonb_build_object('workspace_id',item.workspace_id),'changed','shift-exchanges:'||item.workspace_id::text,false);
    perform set_config('app.exchange_inbox_signalled',(signalled||jsonb_build_array(item.workspace_id::text))::text,true);
   end if;
  exception when others then
   -- The existing poll/reconnect path remains available. A broadcast outage
   -- must not roll back a successfully projected inbox item.
   result:=result||jsonb_build_object('invalidation_deferred',true);
  end;
 end if;
 return result;
end; $$;

create function public.flush_shift_exchange_notifications_service(
 target_workspace_id uuid,target_case_id uuid,target_batch_size integer default 50
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='100ms' as $$
declare
 item public.notification_outbox%rowtype;
 worker text:='exchange-immediate-'||gen_random_uuid()::text;
 result jsonb; failure jsonb;
 processed integer:=0; skipped integer:=0; retried integer:=0; dead integer:=0; leased integer:=0; deferred integer:=0;
 started timestamptz:=clock_timestamp();
begin
 if target_workspace_id is null or target_case_id is null or target_batch_size is null or target_batch_size not between 1 and 100 then
  raise exception 'A workspace, case and bounded batch are required' using errcode='22023';
 end if;
 if not exists(select 1 from public.shift_exchange_cases where id=target_case_id and workspace_id=target_workspace_id) then
  raise exception 'Shift exchange not found' using errcode='P0002';
 end if;
 -- Same case lock as projection/commands. Never delay a manager command waiting
 -- for this opportunistic path: a busy case remains available to the cron worker.
 if not pg_try_advisory_xact_lock(hashtextextended(target_workspace_id::text||':'||target_case_id::text,925)) then
  return jsonb_build_object('busy',true,'leased',0,'processed',0,'skipped',0,'retried',0,'dead_lettered',0,'invalidation_deferred',0);
 end if;
 for item in
  select o.* from public.notification_outbox o
  where o.workspace_id=target_workspace_id and o.subject_type='shift_exchange_cases' and o.subject_id=target_case_id::text
   and ((o.status in('pending','retry') and o.available_at<=clock_timestamp())
     or (o.status='leased' and o.lease_expires_at<=clock_timestamp()))
  order by o.available_at,o.created_at,o.id
  for update skip locked limit target_batch_size
 loop
  exit when clock_timestamp()-started>=interval '1 second';
  update public.notification_outbox set status='leased',lease_owner=worker,lease_expires_at=clock_timestamp()+interval '60 seconds',
   attempt_count=attempt_count+1,last_error=null where id=item.id;
  leased:=leased+1;
  begin
   result:=public.process_notification_outbox_service(worker,item.id);
   if result->>'status'='skipped' then skipped:=skipped+1; else processed:=processed+1; end if;
   if coalesce((result->>'invalidation_deferred')::boolean,false) then deferred:=deferred+1; end if;
  exception when others then
   failure:=public.fail_notification_outbox_service(worker,item.id,left(SQLERRM,500),5,15);
   if failure->>'status'='dead_letter' then dead:=dead+1; else retried:=retried+1; end if;
  end;
 end loop;
 return jsonb_build_object('busy',false,'leased',leased,'processed',processed,'skipped',skipped,'retried',retried,'dead_lettered',dead,'invalidation_deferred',deferred,
  'remaining',exists(select 1 from public.notification_outbox o where o.workspace_id=target_workspace_id and o.subject_type='shift_exchange_cases' and o.subject_id=target_case_id::text
    and ((o.status in('pending','retry') and o.available_at<=clock_timestamp()) or (o.status='leased' and o.lease_expires_at<=clock_timestamp()))));
end; $$;

revoke all on function public.process_notification_outbox_before_signal(text,uuid),
 public.process_notification_outbox_service(text,uuid),public.flush_shift_exchange_notifications_service(uuid,uuid,integer)
 from public,anon,authenticated,service_role;
grant execute on function public.process_notification_outbox_service(text,uuid),public.flush_shift_exchange_notifications_service(uuid,uuid,integer) to service_role;
