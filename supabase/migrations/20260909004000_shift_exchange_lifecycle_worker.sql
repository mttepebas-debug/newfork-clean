-- Background lifecycle uses the same transaction lock as final manager approval.
-- A system event has no human actor; it must never imply employee consent.
alter table public.shift_exchange_events alter column actor_user_id drop not null;
do $producer$
declare body text;
begin
 body:=pg_get_functiondef('public.shift_exchange_emit(uuid,uuid,uuid,uuid,text,text,text)'::regprocedure);
 body:=replace(body,'e.user_id<>actor','e.user_id is distinct from actor');
 body:=replace(body,'m.user_id<>actor','m.user_id is distinct from actor');
 execute body;
end; $producer$;

create function public.shift_exchanges_maintain_service(target_batch_size integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate record; c public.shift_exchange_cases%rowtype; live_status text;
 expired_count integer:=0; invalidated_count integer:=0; busy_count integer:=0;
begin
 if target_batch_size not between 1 and 500 then raise exception 'Maintenance batch must contain 1 to 500 cases' using errcode='22023'; end if;
 for candidate in select x.id,x.workspace_id from public.shift_exchange_cases x
  where x.status='open' and public.shift_exchange_live_status(x.workspace_id,x.id)<>'open'
  order by x.workspace_id,x.expires_at,x.id limit target_batch_size
 loop
  if not pg_try_advisory_xact_lock(hashtextextended(candidate.workspace_id::text,921)) then busy_count:=busy_count+1; continue; end if;
  select * into c from public.shift_exchange_cases where id=candidate.id and status='open' for update;
  if c.id is null then continue; end if;
  live_status:=public.shift_exchange_live_status(c.workspace_id,c.id);
  if live_status not in('expired','invalidated') then continue; end if;
  update public.shift_exchange_cases set status=live_status,revision=revision+1,updated_at=now() where id=c.id returning * into c;
  update public.shift_exchange_applications set status=live_status,updated_at=now() where case_id=c.id and status in('invited','pending_manager');
  delete from public.shift_exchange_votes where case_id=c.id;
  perform public.shift_exchange_emit(null,c.workspace_id,c.id,null,live_status,
   case when live_status='expired' then 'The decision deadline passed. This search closed without a transfer. Check your current schedule for your assignment.'
    else 'Shift details changed. This search closed without a transfer. Review your current schedule before making a new request.' end);
  perform realtime.send(jsonb_build_object('workspace_id',c.workspace_id,'case_id',c.id,'revision',c.revision),'changed','shift-exchanges:'||c.workspace_id::text,false);
  if live_status='expired' then expired_count:=expired_count+1; else invalidated_count:=invalidated_count+1; end if;
 end loop;
 return jsonb_build_object('expired',expired_count,'invalidated',invalidated_count,'skipped_busy',busy_count);
end; $$;
revoke all on function public.shift_exchanges_maintain_service(integer) from public,anon,authenticated;
grant execute on function public.shift_exchanges_maintain_service(integer) to service_role;
