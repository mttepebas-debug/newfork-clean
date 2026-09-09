-- An approval can start before the shift, wait on a writer, and resume after it.
-- Transaction-start now() is suitable for audit timestamps, not live deadlines.
do $deadline_clock$
declare fn regprocedure; body text; marker text;
begin
 foreach fn in array array[
  'public.shift_exchange_live_status(uuid,uuid)'::regprocedure,
  'public.shift_exchange_preview(uuid,uuid,uuid,uuid)'::regprocedure,
  'public.shift_exchanges_read_service(uuid,uuid,boolean,date,date,uuid)'::regprocedure,
  'public.shift_exchanges_candidates_service(uuid,uuid,uuid)'::regprocedure,
  'public.shift_exchanges_command_service(uuid,uuid,jsonb,uuid)'::regprocedure
 ] loop
  body:=replace(pg_get_functiondef(fn),E'\r\n',E'\n');
  if position('<=now()' in body)=0 and position('>now()' in body)=0 then
   raise exception 'Deadline comparisons changed in %; review this migration',fn; end if;
  body:=replace(replace(body,'<=now()','<=clock_timestamp()'),'>now()','>clock_timestamp()');
  if fn='public.shift_exchanges_command_service(uuid,uuid,jsonb,uuid)'::regprocedure then
   marker:='   perform public.shift_exchange_emit(actor,w,cid,null,''expired'',';
   if position(marker in body)=0 then raise exception 'Command expiry transition changed; review cleanup'; end if;
   body:=replace(body,marker,E'   delete from public.shift_exchange_votes where case_id=cid;\n   perform public.shift_exchange_emit(null,w,cid,null,''expired'',');
  end if;
  execute body;
  execute format('alter function %s volatile',fn);
 end loop;
end;
$deadline_clock$;

-- Final validation is deferred to transaction end. If the final command ran
-- before the deadline but its transaction was delayed, roll back assignment,
-- reconciliation, votes and outbox together rather than returning a late success.
create function public.shift_exchange_guard_commit_deadline() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if clock_timestamp()>=new.expires_at then
  raise exception 'The shift started before this approval could finish. No transfer was made. Refresh the request.' using errcode='PT409';
 end if;
 return new;
end;
$$;
revoke all on function public.shift_exchange_guard_commit_deadline() from public,anon,authenticated,service_role;
create constraint trigger shift_exchange_commit_deadline
after update on public.shift_exchange_cases
deferrable initially deferred for each row
when (new.status='completed' and old.status is distinct from 'completed')
execute function public.shift_exchange_guard_commit_deadline();
