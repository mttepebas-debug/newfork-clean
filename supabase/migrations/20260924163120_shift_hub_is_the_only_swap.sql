-- FOUNDATION-B 5.1b: the old Requests -> Shift changes flow is gone; Shift
-- Hub is the only way shifts change hands, and it is always on.
--
-- Deleted: the three request tables (schedule_shift_change_requests,
-- _participants, _events; empty locally and on the hosted project,
-- 2026-09-24), their enums, the five functions only they used, and the
-- workspace switch workspaces.shift_exchanges_enabled (off everywhere).
-- Kept, because Shift Hub uses them: the permission keys
-- schedule.shift_change_requests.read/.manage and the notification types
-- requests.shift_change.submitted/.status_changed.
--
-- Changed where the old flow reached:
-- * Shift Hub no longer checks the switch or waits for an old request; its
--   read model has no "enabled" flag; the guard on eligibility writes (job,
--   location, profile) applies to every workspace;
-- * the manager request queue (get_schedule_requests_service) is time off
--   only and loses its shift queue and cursor arguments;
-- * Employee Hub lists time-off requests only; the employee request action
--   is time-off cancellation only;
-- * the workspace dashboard no longer counts old requests (the web counts
--   Shift Hub cases);
-- * request notifications and their reconciliation cover time off only;
-- * an availability change no longer cancels old requests.

CREATE OR REPLACE FUNCTION public.shift_exchanges_command_service(actor uuid, w uuid, command jsonb, idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp public.employee_profiles%rowtype; c public.shift_exchange_cases%rowtype; a public.shift_exchange_applications%rowtype;
 old_cmd public.shift_exchange_commands%rowtype; s jsonb; t jsonb; checked jsonb; result jsonb; fp text;
 action text:=command->>'action'; cid uuid:=(command->>'case_id')::uuid; aid uuid:=(command->>'application_id')::uuid;
 candidate uuid; loc uuid; other record; expires timestamptz; owns boolean; manager boolean;
begin
 if idempotency_key is null then raise exception 'Idempotency key required'; end if;
 if not exists(select 1 from public.workspace_memberships where workspace_id=w and user_id=actor and status='active') then raise exception 'Active workspace access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(w::text,921));
 select * into old_cmd from public.shift_exchange_commands q where q.workspace_id=w and q.actor_user_id=actor and q.idempotency_key=shift_exchanges_command_service.idempotency_key;
 if old_cmd.idempotency_key is not null then
  if old_cmd.command<>command then raise exception 'Idempotency key was used for another action' using errcode='22023'; end if;
  return old_cmd.result;
 end if;
 select * into emp from public.employee_profiles where workspace_id=w and user_id=actor and archived_at is null;
 if action in('create','apply') then
  if emp.id is null then raise exception 'Employee profile required' using errcode='42501'; end if;
  s:=public.shift_exchange_shift(w,(command->>'shift_id')::uuid);
  if s is null or s->>'time_basis' in ('unresolved','legacy_unverified') or (s->>'starts_at')::timestamptz<=clock_timestamp() then raise exception 'Choose an upcoming published shift' using errcode='PT409'; end if;
  if action='create' then
   if (s->>'employee_id')::uuid is distinct from emp.id then raise exception 'Only the current owner can offer this shift' using errcode='42501'; end if;
   if command->>'kind' not in('cover','swap') then raise exception 'Invalid exchange kind'; end if;
   if command->>'kind'='swap' then
    t:=public.shift_exchange_shift(w,(command->>'requested_shift_id')::uuid);
    if t is null or t->>'time_basis' in ('unresolved','legacy_unverified') or t->>'employee_id' is null or t->>'employee_id'=emp.id::text or (t->>'starts_at')::timestamptz<=clock_timestamp() then raise exception 'Choose an upcoming teammate shift'; end if;
    candidate:=(t->>'employee_id')::uuid;
    perform public.require_weekly_exchange_employee_warning(actor,w,emp.id,t,command);
    if public.weekly_exchange_candidate_check(w,emp.id,t,array[(s->>'id')::uuid,(t->>'id')::uuid])->>'status'<>'eligible' then raise exception 'You are not eligible for the teammate shift'; end if;
   else candidate:=(command->>'employee_id')::uuid; end if;
   if candidate=emp.id then raise exception 'Choose a different teammate'; end if;
   if candidate is not null and public.weekly_exchange_candidate_check(w,candidate,s,array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null))->>'status'<>'eligible' then raise exception 'This teammate is not eligible for the full shift'; end if;
   for other in select x.id,public.shift_exchange_live_status(w,x.id) live_status from public.shift_exchange_cases x
    where x.workspace_id=w and x.status='open' and x.offered_source_id=(s->>'source_id')::uuid loop
    if other.live_status<>'open' then
     update public.shift_exchange_cases set status=other.live_status,revision=revision+1,updated_at=now() where id=other.id;
     update public.shift_exchange_applications set status=other.live_status,updated_at=now() where case_id=other.id and status in('invited','pending_manager');
     delete from public.shift_exchange_votes where case_id=other.id;
     perform public.shift_exchange_emit(actor,w,other.id,null,other.live_status,'This offer ended because the shift changed or started. Review the current schedule before making a new request.');
    end if;
   end loop;
   fp:=public.shift_exchange_fingerprint(w,s,t);
   expires:=least((s->>'starts_at')::timestamptz,(t->>'starts_at')::timestamptz);
   insert into public.shift_exchange_cases(workspace_id,kind,audience,offered_source_id,requested_source_id,owner_id,offered_snapshot,requested_snapshot,consent_fingerprint,expires_at,private_note,created_by)
   values(w,command->>'kind',case when candidate is null then 'eligible_pool' else 'direct' end,(s->>'source_id')::uuid,(t->>'source_id')::uuid,emp.id,s,t,fp,expires,coalesce(command->>'note',''),actor) returning * into c;
   cid:=c.id;
   if candidate is not null then
    insert into public.shift_exchange_applications(workspace_id,case_id,employee_id,status,consent_fingerprint) values(w,cid,candidate,'invited',fp) returning id into aid;
   end if;
   perform public.shift_exchange_emit(actor,w,cid,aid,case when candidate is null then 'cover_opened' else 'peer_invited' end,'Cover or swap requested. The current owner remains responsible until manager approval.');
  else
   if (s->>'employee_id')::uuid=emp.id then raise exception 'You already own this shift'; end if;
   select * into c from public.shift_exchange_cases where workspace_id=w and offered_source_id=(s->>'source_id')::uuid and status='open' for update;
   if c.id is null then
    if s->>'employee_id' is not null then raise exception 'This shift has not been offered for cover'; end if;
    fp:=public.shift_exchange_fingerprint(w,s,null);
    insert into public.shift_exchange_cases(workspace_id,kind,offered_source_id,offered_snapshot,consent_fingerprint,expires_at,created_by)
    values(w,'open_pickup',(s->>'source_id')::uuid,s,fp,(s->>'starts_at')::timestamptz,actor) returning * into c;
   end if;
   if c.audience<>'eligible_pool' or c.kind='swap' or (cid is not null and cid<>c.id) then raise exception 'This offer is not available' using errcode='42501'; end if;
   if public.shift_exchange_fingerprint(w,s,null)<>c.consent_fingerprint then raise exception 'Shift conditions changed. The owner must renew this offer' using errcode='PT409'; end if;
   perform public.require_weekly_exchange_employee_warning(actor,w,emp.id,s,command);
   if public.weekly_exchange_candidate_check(w,emp.id,s)->>'status'<>'eligible' then raise exception 'You are not eligible for the full shift'; end if;
   cid:=c.id;
   if exists(select 1 from public.shift_exchange_applications where case_id=cid and employee_id=emp.id and status='pending_manager') then raise exception 'You already have an active application'; end if;
   insert into public.shift_exchange_applications(workspace_id,case_id,employee_id,status,consent_fingerprint) values(w,cid,emp.id,'pending_manager',c.consent_fingerprint) returning id into aid;
   update public.shift_exchange_cases set revision=revision+1,updated_at=now() where id=cid returning * into c;
   perform public.shift_exchange_emit(actor,w,cid,aid,'application_submitted','A teammate requested this shift. The current owner remains responsible.');
  end if;
 else
  select * into c from public.shift_exchange_cases where id=cid and workspace_id=w for update;
  if c.id is null then raise exception 'Request not found' using errcode='P0002'; end if;
  s:=public.shift_exchange_shift(w,c.offered_source_id); t:=public.shift_exchange_shift(w,c.requested_source_id);
  owns:=c.owner_id=emp.id;
  manager:=public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',(c.offered_snapshot->>'location_id')::uuid)
   or (c.kind='swap' and public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',(c.requested_snapshot->>'location_id')::uuid));
  if not coalesce(owns,false) and not coalesce(manager,false) and not exists(select 1 from public.shift_exchange_applications where case_id=cid and employee_id=emp.id) then raise exception 'Request access denied' using errcode='42501'; end if;
  if c.status<>'open' or c.revision is distinct from (command->>'expected_revision')::integer then raise exception 'This request changed. Review the latest details' using errcode='PT409'; end if;
  if c.expires_at<=clock_timestamp() then
   update public.shift_exchange_cases set status='expired',revision=revision+1,updated_at=now() where id=cid returning * into c;
   update public.shift_exchange_applications set status='expired',updated_at=now() where case_id=cid and status in('invited','pending_manager');
   delete from public.shift_exchange_votes where case_id=cid;
   perform public.shift_exchange_emit(null,w,cid,null,'expired','The shift has started. The current owner remains responsible.');
  elsif public.shift_exchange_live_status(w,cid)='invalidated' then
   update public.shift_exchange_cases set status='invalidated',revision=revision+1,updated_at=now() where id=cid returning * into c;
   update public.shift_exchange_applications set status='invalidated',updated_at=now() where case_id=cid and status in('invited','pending_manager');
   delete from public.shift_exchange_votes where case_id=cid;
   perform public.shift_exchange_emit(actor,w,cid,null,'invalidated','Shift details changed. This offer ended without a transfer. Start a new request from the current schedule.');
  elsif action='close' then
   if not coalesce(owns,false) and not coalesce(manager,false) then raise exception 'Only the owner or a manager can close this search' using errcode='42501'; end if;
   if coalesce(length(trim(command->>'reason')),0)=0 then raise exception 'Choose a reason for closing this search'; end if;
   update public.shift_exchange_cases set status='cancelled',revision=revision+1,updated_at=now() where id=cid returning * into c;
   update public.shift_exchange_applications set status='closed_case_cancelled',reason=command->>'reason',updated_at=now() where case_id=cid and status in('invited','pending_manager');
   perform public.shift_exchange_emit(actor,w,cid,null,'case_closed',command->>'reason',coalesce(command->>'private_note',''));
  else
   select * into a from public.shift_exchange_applications where id=aid and case_id=cid and workspace_id=w for update;
   if a.id is null or a.status not in('invited','pending_manager') then raise exception 'This application is no longer active' using errcode='PT409'; end if;
   if action in('accept','decline','withdraw') then
    if a.employee_id is distinct from emp.id then raise exception 'Only the invited employee can respond' using errcode='42501'; end if;
    if action in('accept','decline') and a.status<>'invited' then raise exception 'This invitation already has a response'; end if;
    if action='accept' then
     if public.shift_exchange_fingerprint(w,s,t) is distinct from c.consent_fingerprint then raise exception 'Shift conditions changed. Ask for a new offer' using errcode='PT409'; end if;
     perform public.require_weekly_exchange_employee_warning(actor,w,emp.id,s,command);
     if public.weekly_exchange_candidate_check(w,emp.id,s,array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null))->>'status'<>'eligible'
      or (c.kind='swap' and public.weekly_exchange_candidate_check(w,c.owner_id,t,array[(s->>'id')::uuid,(t->>'id')::uuid])->>'status'<>'eligible') then raise exception 'Both employees must be eligible for the full exchange'; end if;
    end if;
    update public.shift_exchange_applications set status=case action when 'accept' then 'pending_manager' when 'decline' then 'declined_by_employee' else 'withdrawn' end,updated_at=now() where id=aid;
    delete from public.shift_exchange_votes where case_id=cid and application_id=aid;
    if c.audience='direct' and action in('decline','withdraw') then update public.shift_exchange_cases set status='cancelled' where id=cid; end if;
    perform public.shift_exchange_emit(actor,w,cid,aid,case action when 'accept' then 'peer_accepted' when 'decline' then 'peer_declined' else 'application_withdrawn' end,
     case action when 'accept' then 'Accepted. Awaiting manager approval; the original owner remains responsible.' when 'decline' then 'The teammate declined. No assignment changed.' else case when c.audience='direct' then 'The employee withdrew consent. This request ended without a transfer.' else 'The application was withdrawn. Other candidates remain available.' end end);
   elsif action in('reject','approve') then
    if not coalesce(manager,false) then raise exception 'Manager scope required' using errcode='42501'; end if;
    if action='reject' then
     if coalesce(length(trim(command->>'reason')),0)=0 then raise exception 'Provide a reason visible to this employee'; end if;
     update public.shift_exchange_applications set status='rejected_by_manager',reason=command->>'reason',updated_at=now() where id=aid;
     delete from public.shift_exchange_votes where case_id=cid and application_id=aid;
     if c.audience='direct' then update public.shift_exchange_cases set status='cancelled' where id=cid; end if;
     perform public.shift_exchange_emit(actor,w,cid,aid,'application_rejected',command->>'reason',coalesce(command->>'private_note',''));
    else
     checked:=public.shift_exchange_preview(actor,w,cid,aid);
     if not (checked->>'allowed')::boolean then raise exception '%',checked->'reasons' using errcode='PT409'; end if;
     if command->>'fingerprint' is distinct from checked->>'fingerprint' then raise exception 'This approval preview changed. Review the latest details' using errcode='PT409'; end if;
     fp:=checked->>'fingerprint';
     for loc in select distinct x from unnest(array[(s->>'location_id')::uuid,(t->>'location_id')::uuid]) x where x is not null loop
      if public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',loc) then
       insert into public.shift_exchange_votes(case_id,workspace_id,application_id,location_id,actor_user_id,fingerprint) values(cid,w,aid,loc,actor,fp)
       on conflict(case_id,location_id) do update set application_id=excluded.application_id,actor_user_id=excluded.actor_user_id,fingerprint=excluded.fingerprint,created_at=now();
      end if;
     end loop;
     if (checked->>'requires_other_manager')::boolean then
      perform public.shift_exchange_emit(actor,w,cid,aid,'scope_approved','One location approved. Awaiting the other manager; assignments are unchanged.');
     else
      perform 1 from public.schedule_published_shifts where id in((s->>'id')::uuid,(t->>'id')::uuid) order by id for update;
      -- Recheck after row locks as external Schedule writers may predate the shared workspace lock.
      checked:=public.shift_exchange_preview(actor,w,cid,aid);
      if not (checked->>'allowed')::boolean or checked->>'fingerprint'<>fp then raise exception 'Schedule changed during approval' using errcode='PT409'; end if;
      perform public.record_weekly_exchange_acceptance(w,cid,aid);
      -- BL-092: the two sides of a swap are one change for the assignment guard,
      -- in the publication and in the drafts reconciled after it.
      perform set_config('newfork.shift_exchange_scope',jsonb_build_object('workspace_id',w,'shift_ids',to_jsonb(array_remove(array[(s->>'source_id')::uuid,(t->>'source_id')::uuid],null)))::text,true);
      update public.schedule_published_shifts set employee_id=a.employee_id where id=(s->>'id')::uuid;
      if c.kind='swap' then update public.schedule_published_shifts set employee_id=c.owner_id where id=(t->>'id')::uuid; end if;
      perform public.shift_exchange_reconcile_batch(actor,w,jsonb_build_array(s||jsonb_build_object('new_employee_id',a.employee_id))||case when c.kind='swap' then jsonb_build_array(t||jsonb_build_object('new_employee_id',c.owner_id)) else '[]'::jsonb end);
      perform set_config('newfork.shift_exchange_scope','',true);
      
      update public.shift_exchange_applications set status='approved',updated_at=now() where id=aid;
      for other in select id from public.shift_exchange_applications where case_id=cid and id<>aid and status in('invited','pending_manager') loop
       update public.shift_exchange_applications set status='closed_other_selected',updated_at=now() where id=other.id;
       perform public.shift_exchange_emit(actor,w,cid,other.id,'other_selected','Another teammate was selected. Your schedule has not changed.');
      end loop;
      update public.shift_exchange_cases set status='completed' where id=cid;
      perform public.shift_exchange_emit(actor,w,cid,aid,'transfer_completed','Manager approved the transfer. The receiving employee is now responsible; the previous owner is released.',coalesce(command->>'private_note',''));
      for other in select x.id from public.shift_exchange_cases x where x.workspace_id=w and x.status='open' and x.id<>cid
       and (x.offered_source_id in(c.offered_source_id,c.requested_source_id) or x.requested_source_id in(c.offered_source_id,c.requested_source_id)) loop
       update public.shift_exchange_cases set status='invalidated',revision=revision+1,updated_at=now() where id=other.id;
       update public.shift_exchange_applications set status='invalidated',updated_at=now() where case_id=other.id and status in('invited','pending_manager');
       perform public.shift_exchange_emit(actor,w,other.id,null,'invalidated','An involved shift changed owner. Start a new request using the current schedule.');
      end loop;
     end if;
    end if;
   else raise exception 'Unknown exchange action'; end if;
   update public.shift_exchange_cases set revision=revision+1,updated_at=now() where id=cid returning * into c;
  end if;
 end if;
 perform realtime.send(jsonb_build_object('workspace_id',w,'case_id',cid,'revision',c.revision),'changed','shift-exchanges:'||w::text,false);
 result:=jsonb_build_object('case_id',cid,'status',c.status,'revision',c.revision);
 insert into public.shift_exchange_commands(workspace_id,actor_user_id,idempotency_key,command,result) values(w,actor,idempotency_key,command,result);
 return result;
end; $function$;

CREATE OR REPLACE FUNCTION public.shift_exchanges_read_service(actor uuid, w uuid, manager_view boolean DEFAULT false, from_date date DEFAULT CURRENT_DATE, to_date date DEFAULT (CURRENT_DATE + 42), focused_case_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp public.employee_profiles%rowtype; c public.shift_exchange_cases%rowtype; s jsonb; t jsonb; allowed boolean; mine boolean;
 case_items jsonb[]:='{}'; opportunities jsonb:='[]'; own_shifts jsonb:='[]'; apps jsonb; hist jsonb; chk jsonb; shift_row record; stage text; live_status text; current_published boolean; requested_published boolean; published_cache jsonb:='{}'; source_key text;
begin
 if to_date<from_date or to_date>from_date+62 then raise exception 'Choose a date range up to 62 days'; end if;
 if not exists(select 1 from public.workspace_memberships where workspace_id=w and user_id=actor and status='active') then raise exception 'Active workspace access required' using errcode='42501'; end if;
 select * into emp from public.employee_profiles where workspace_id=w and user_id=actor and archived_at is null;
 if not manager_view and emp.id is null then raise exception 'Employee profile required' using errcode='42501'; end if;
 if manager_view and not public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.read',null) then
  if not exists(select 1 from public.locations l where l.workspace_id=w and public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.read',l.id)) then raise exception 'Manager request access required' using errcode='42501'; end if;
 end if;
 for c in select * from public.shift_exchange_cases x where x.workspace_id=w and (x.status='open' or x.id=focused_case_id
  or (x.offered_snapshot->>'date')::date between from_date and to_date
  or (x.requested_snapshot->>'date')::date between from_date and to_date
  or exists(select 1 from public.schedule_published_shifts p
   join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
   where p.workspace_id=w and coalesce(p.source_shift_id,p.id) in(x.offered_source_id,x.requested_source_id)
   and p.scheduled_date between from_date and to_date)) order by x.expires_at,x.created_at loop
  allowed:=manager_view and (public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.read',(c.offered_snapshot->>'location_id')::uuid) or (c.kind='swap' and public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.read',(c.requested_snapshot->>'location_id')::uuid)));
  mine:=coalesce(c.owner_id=emp.id,false);
  if not allowed and not mine and not exists(select 1 from public.shift_exchange_applications where case_id=c.id and employee_id=emp.id) then continue; end if;
  -- Repeated historical requests refer to the same published source. Resolve
  -- each source once in this read only; no cache survives the function call.
  foreach source_key in array array_remove(array[c.offered_source_id::text,c.requested_source_id::text],null) loop
   if not published_cache ? source_key then
    published_cache:=published_cache||jsonb_build_object(source_key,public.shift_exchange_shift(w,source_key::uuid));
   end if;
  end loop;
  s:=nullif(published_cache->c.offered_source_id::text,'null'::jsonb);
  t:=nullif(published_cache->c.requested_source_id::text,'null'::jsonb);
  current_published:=s is not null;
  requested_published:=t is not null;
  s:=coalesce(s,c.offered_snapshot);
  t:=coalesce(t,c.requested_snapshot);
  -- The list follows the displayed dates on either side. A focused deep link
  -- bypasses only the range, never the actor checks above.
  if c.id is distinct from focused_case_id and not (
   coalesce((s->>'date')::date between from_date and to_date,false)
   or coalesce((t->>'date')::date between from_date and to_date,false)
  ) then continue; end if;
  live_status:=public.shift_exchange_live_status(w,c.id);
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'employee_id',a.employee_id,'employee_name',coalesce(nullif(e.preferred_name,''),concat_ws(' ',e.first_name,e.last_name)),
   'status',case when live_status in('expired','invalidated') and a.status in('invited','pending_manager') then live_status else a.status end,'created_at',a.created_at,'reason',case when allowed or a.employee_id=emp.id then a.reason else '' end,
   'eligibility',case when (allowed or a.employee_id=emp.id) and live_status='open' then public.weekly_exchange_candidate_check(w,a.employee_id,s,array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null)) || case when a.employee_id=emp.id and a.status='invited' then jsonb_build_object('availability_warning',public.weekly_exchange_employee_warning(w,emp.id,s)) else '{}'::jsonb end end) order by a.created_at),'[]'::jsonb)
  into apps from public.shift_exchange_applications a join public.employee_profiles e on e.id=a.employee_id where a.case_id=c.id and (allowed or mine or a.employee_id=emp.id);
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'created_at',e.created_at,'message',e.message) order by e.created_at),'[]'::jsonb)
  into hist from public.shift_exchange_events e where e.case_id=c.id and (allowed or mine or e.application_id is null or exists(select 1 from public.shift_exchange_applications a where a.id=e.application_id and a.employee_id=emp.id));
  stage:=case when live_status<>'open' then 'closed'
   when exists(select 1 from public.shift_exchange_votes where case_id=c.id) then 'awaiting_other_manager'
   when exists(select 1 from public.shift_exchange_applications where case_id=c.id and status='pending_manager') then 'ready_for_manager'
   when exists(select 1 from public.shift_exchange_applications where case_id=c.id and status='invited') then 'awaiting_peer' else 'seeking_candidates' end;
  case_items:=array_append(case_items,jsonb_build_object('id',c.id,'kind',c.kind,'audience',c.audience,'status',live_status,'current_published',current_published,'requested_current_published',case when c.kind='swap' then requested_published else null end,
   'stage',stage,'revision',c.revision,'created_at',c.created_at,'expires_at',c.expires_at,'owner_id',c.owner_id,'owner_name',c.offered_snapshot->'employee_name',
   'shift',s,'requested_shift',t,'applications',apps,'candidate_count',(select count(*) from public.shift_exchange_applications where case_id=c.id and status in('invited','pending_manager') and live_status='open'),
   'can_manage',allowed and (public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',(c.offered_snapshot->>'location_id')::uuid) or (c.kind='swap' and public.schedule_actor_has_capability_service(actor,w,'schedule.shift_change_requests.manage',(c.requested_snapshot->>'location_id')::uuid))),
   'is_owner',mine,'private_note',case when allowed or mine then c.private_note else '' end,'history',hist));
 end loop;
 if not manager_view then
  for shift_row in select p.id from public.schedule_published_shifts p join public.schedule_location_publications pub on pub.id=p.publication_id and pub.status='current'
   where p.workspace_id=w and p.scheduled_date between from_date and to_date order by p.scheduled_date,p.start_time loop
   s:=public.shift_exchange_shift(w,shift_row.id);
   if (s->>'starts_at')::timestamptz<=clock_timestamp() then continue; end if;
   if (s->>'employee_id')::uuid=emp.id then own_shifts:=own_shifts||jsonb_build_array(s); continue; end if;
   select * into c from public.shift_exchange_cases where workspace_id=w and offered_source_id=(s->>'source_id')::uuid and status='open' and expires_at>clock_timestamp() and audience='eligible_pool' and kind<>'swap';
   if s->>'employee_id' is not null and c.id is null then continue; end if;
   chk:=public.weekly_exchange_candidate_check(w,emp.id,s)||jsonb_build_object('availability_warning',public.weekly_exchange_employee_warning(w,emp.id,s));
   if chk->>'status'='eligible' and (c.id is null or c.consent_fingerprint=public.shift_exchange_fingerprint(w,s,null)) then
    opportunities:=opportunities||jsonb_build_array(jsonb_build_object('case_id',c.id,'shift',s,'eligibility',chk));
   end if;
  end loop;
 end if;
 return jsonb_build_object('employee_id',emp.id,'cases',to_jsonb(case_items),'opportunities',opportunities,'own_shifts',own_shifts);
end; $function$;

CREATE OR REPLACE FUNCTION public.shift_exchange_guard_eligibility_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare workspaces uuid[]; w uuid;
begin
 if tg_op='INSERT' then workspaces:=array[new.workspace_id];
 elsif tg_op='DELETE' then workspaces:=array[old.workspace_id];
 else workspaces:=array[old.workspace_id,new.workspace_id]; end if;
 for w in select distinct value from unnest(workspaces) value where value is not null order by value loop
  if not pg_try_advisory_xact_lock(hashtextextended(w::text,921)) then
   raise exception 'A shift change is being reviewed. Your changes were not saved; try again.' using errcode='PT409';
  end if;
 end loop;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.employee_request_action_service(actor_user_id uuid, target_workspace_id uuid, target_request_id uuid, target_kind text, target_action text, target_expected_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare employee public.employee_profiles%rowtype; time_request public.schedule_time_off_requests%rowtype;
begin
  perform public.availability_lock_workspace(target_workspace_id);
employee:=public.employee_hub_actor_service(actor_user_id,target_workspace_id);
  if target_kind='time_off' and target_action='cancel' then
    select * into time_request from public.schedule_time_off_requests where id=target_request_id and workspace_id=target_workspace_id and employee_id=employee.id for update;
    if time_request.id is null then raise exception 'time off request not found' using errcode='P0002'; end if;
    if time_request.revision<>target_expected_revision or time_request.status<>'pending' then raise exception 'stale time off request' using errcode='40001'; end if;
    update public.schedule_time_off_requests set status='revoked',revision=revision+1,updated_at=now() where id=time_request.id returning * into time_request;
    insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note) values(target_workspace_id,time_request.id,'revoked',actor_user_id,'Cancelled by employee');
    return jsonb_build_object('status','cancelled','request_id',time_request.id,'revision',time_request.revision);
  end if;
  raise exception 'unsupported employee request action' using errcode='22023';
end; $function$;

CREATE OR REPLACE FUNCTION public.get_employee_hub_service(actor_user_id uuid, target_workspace_id uuid, target_from date, target_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare employee public.employee_profiles%rowtype; result jsonb;
begin
  if target_to < target_from or target_to > target_from + 62 then
    raise exception 'employee hub date range is invalid' using errcode = '22023';
  end if;
  employee := public.employee_hub_actor_service(actor_user_id, target_workspace_id);

  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'employee', jsonb_build_object(
      'id', employee.id,
      'display_name', concat_ws(' ', coalesce(nullif(employee.preferred_name,''),employee.first_name), employee.last_name)
    ),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('id',location.id,'name',location.name) order by location.sort_order,location.name)
      from public.employee_location_assignments assignment
      join public.locations location on location.id=assignment.location_id and location.archived_at is null
      where assignment.employee_id=employee.id and assignment.ended_at is null
    ),'[]'::jsonb),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',shift.id,'location_id',shift.location_id,'location_name',location.name,'job_name',job.name,
        'scheduled_date',shift.scheduled_date,'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time',to_char(shift.start_time,'HH24:MI'),
        'end_time',to_char(shift.end_time,'HH24:MI'),'note',shift.note,'employee_id',shift.employee_id
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      where shift.workspace_id=target_workspace_id and shift.employee_id=employee.id
        and shift.scheduled_date between target_from and target_to
    ),'[]'::jsonb),
    'open_shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',shift.id,'location_id',shift.location_id,'location_name',location.name,'job_name',job.name,
        'scheduled_date',shift.scheduled_date,'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time',to_char(shift.start_time,'HH24:MI'),
        'end_time',to_char(shift.end_time,'HH24:MI'),'note',shift.note,'employee_id',null
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      where shift.workspace_id=target_workspace_id and shift.employee_id is null
        and shift.scheduled_date between target_from and target_to
        and exists(select 1 from public.employee_location_assignments assignment
          where assignment.employee_id=employee.id and assignment.location_id=shift.location_id and assignment.ended_at is null)
    ),'[]'::jsonb),
    'team_shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',shift.id,'location_id',shift.location_id,'location_name',location.name,'job_name',job.name,
        'scheduled_date',shift.scheduled_date,'time_basis',shift.time_basis,'time_snapshot',shift.time_snapshot,'time_timezone',shift.time_timezone,'start_time',to_char(shift.start_time,'HH24:MI'),
        'end_time',to_char(shift.end_time,'HH24:MI'),'note',shift.note,'employee_id',shift.employee_id,
        'employee_name',concat_ws(' ',coalesce(nullif(teammate.preferred_name,''),teammate.first_name),teammate.last_name)
      ) order by shift.scheduled_date,shift.start_time)
      from public.schedule_published_shifts shift
      join public.schedule_location_publications publication on publication.id=shift.publication_id and publication.status='current'
      join public.locations location on location.id=shift.location_id
      join public.jobs job on job.id=shift.job_id
      join public.employee_profiles teammate on teammate.id=shift.employee_id
      where shift.workspace_id=target_workspace_id and shift.employee_id<>employee.id
        and shift.scheduled_date between target_from and target_to
        and exists(select 1 from public.employee_location_assignments assignment
          where assignment.employee_id=employee.id and assignment.location_id=shift.location_id and assignment.ended_at is null)
    ),'[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(request_row order by request_row->>'created_at' desc) from (
        select jsonb_build_object(
          'id',request.id,'kind','time_off','request_type',request.request_type,'cancellation',public.time_off_cancellation_context(target_workspace_id,request.id),'periods',public.time_off_request_periods(request.id,target_workspace_id), 'decision_events',coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'action',ev.action,'note',ev.note,'created_at',ev.created_at,'revision',ev.metadata->'revision','released_assignments',public.time_off_event_released_assignments(get_employee_hub_service.actor_user_id,target_workspace_id,ev.id)) order by ev.created_at,ev.id)
  from public.schedule_time_off_events ev where ev.request_id=request.id and ev.workspace_id=target_workspace_id and ev.action in('approved','partially_approved','denied','returned_to_pending','revoked')),'[]'), 'status',request.status::text,
          'title',case when request.request_type='time_off_cancellation' then 'Cancel approved leave · ' else 'Time off · ' end||to_char(min(segment.segment_date),'Mon DD')||case when min(segment.segment_date)<>max(segment.segment_date) then '–'||to_char(max(segment.segment_date),'Mon DD') else '' end,
          'detail',coalesce(nullif(request.reason,''),'No note'),'revision',request.revision,'created_at',request.created_at,
          'can_cancel',request.status='pending'
        ) request_row
        from public.schedule_time_off_requests request
        join public.schedule_time_off_segments segment on segment.request_id=request.id
        where request.workspace_id=target_workspace_id and request.employee_id=employee.id
        group by request.id
      ) requests
    ),'[]'::jsonb),
    'availability', (
      select jsonb_build_object('timezone',version.timezone,'days',version.recurring_rules)
      from public.employee_schedule_availability_versions version
      where version.employee_id=employee.id and version.effective_at<=now()
      order by version.version_number desc limit 1
    ),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',teammate.id,
        'display_name',concat_ws(' ',coalesce(nullif(teammate.preferred_name,''),teammate.first_name),teammate.last_name),
        'job_names',coalesce((select jsonb_agg(job.name order by job.sort_order,job.name) from public.employee_job_assignments assignment join public.jobs job on job.id=assignment.job_id where assignment.employee_id=teammate.id and assignment.ended_at is null),'[]'::jsonb),
        'location_names',coalesce((select jsonb_agg(location.name order by location.sort_order,location.name) from public.employee_location_assignments assignment join public.locations location on location.id=assignment.location_id where assignment.employee_id=teammate.id and assignment.ended_at is null),'[]'::jsonb)
      ) order by teammate.last_name,teammate.first_name)
      from public.employee_profiles teammate
      where teammate.workspace_id=target_workspace_id and teammate.archived_at is null and teammate.id<>employee.id
        and exists(select 1 from public.employee_location_assignments mine join public.employee_location_assignments theirs on theirs.location_id=mine.location_id and theirs.ended_at is null where mine.employee_id=employee.id and mine.ended_at is null and theirs.employee_id=teammate.id)
    ),'[]'::jsonb),
    'lineup', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',(entry->>'id')::uuid,'lineup_date',snapshot.lineup_date,'location_name',location.name,
        'employee_name',coalesce(nullif(entry->>'employee_name',''),'Open row'),'job_name',nullif(entry->>'job_name',''),
        'start_time',nullif(entry->>'start_time',''),'end_time',nullif(entry->>'end_time',''),
        'station',coalesce(entry->>'station',''),'section_name',nullif(entry->>'section_name',''),
        'call_off',coalesce((entry->>'call_off')::boolean,false)
      ) order by snapshot.lineup_date,location.sort_order,coalesce((entry->>'display_order')::integer,0))
      from public.schedule_lineup_snapshots snapshot
      join public.locations location on location.id=snapshot.location_id
      cross join lateral jsonb_array_elements(snapshot.content->'entries') entry
      where snapshot.workspace_id=target_workspace_id and snapshot.lineup_date between target_from and target_to
        and snapshot.version_number=(select max(latest.version_number) from public.schedule_lineup_snapshots latest where latest.workspace_id=snapshot.workspace_id and latest.location_id=snapshot.location_id and latest.lineup_date=snapshot.lineup_date)
        and exists(select 1 from public.employee_location_assignments assignment where assignment.employee_id=employee.id and assignment.location_id=snapshot.location_id and assignment.ended_at is null)
    ),'[]'::jsonb)
  ) into result;
  return result;
end; $function$;

CREATE OR REPLACE FUNCTION public.get_workspace_dashboard_service(actor_user_id uuid, target_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  membership public.workspace_memberships%rowtype;
  role_class public.workspace_role;
  result jsonb;
begin
  select member.* into membership
  from public.workspace_memberships member
  where member.user_id = actor_user_id
    and member.workspace_id = target_workspace_id
    and member.status = 'active';
  select role.access_class into role_class
  from public.workspace_roles role
  where role.id = membership.role_id
    and role.workspace_id = target_workspace_id;
  if membership.id is null
    or role_class = 'employee'
    or not public.communication_actor_has_capability_service(actor_user_id, target_workspace_id, 'workspace.read') then
    raise exception 'manager workspace access required' using errcode = '42501';
  end if;

  perform public.sync_expiring_document_todos_service(target_workspace_id);

  select jsonb_build_object(
    'workspace_id', target_workspace_id,
    'display_name', coalesce(profile.display_name, 'Manager'),
    'metrics', jsonb_build_object(
      'today_shift_count', (select count(*) from public.schedule_published_shifts shift join public.schedule_location_publications publication on publication.id = shift.publication_id and publication.status = 'current' where shift.workspace_id = target_workspace_id and shift.scheduled_date = current_date and (membership.all_locations or exists(select 1 from public.membership_location_scopes scope where scope.membership_id = membership.id and scope.location_id = shift.location_id))),
      'today_open_shift_count', (select count(*) from public.schedule_published_shifts shift join public.schedule_location_publications publication on publication.id = shift.publication_id and publication.status = 'current' where shift.workspace_id = target_workspace_id and shift.scheduled_date = current_date and shift.employee_id is null and (membership.all_locations or exists(select 1 from public.membership_location_scopes scope where scope.membership_id = membership.id and scope.location_id = shift.location_id))),
      'pending_time_off_count', (select count(*) from public.schedule_time_off_requests request where request.workspace_id = target_workspace_id and request.status = 'pending' and (membership.all_locations or exists(select 1 from public.membership_location_scopes scope where scope.membership_id = membership.id and scope.location_id = request.location_id))),
      'unread_notification_count', (select count(*) from public.notifications notification where notification.workspace_id = target_workspace_id and notification.recipient_user_id = actor_user_id and notification.dismissed_at is null and notification.read_at is null and notification.created_at <= now())
    ),
    'announcements', coalesce((select jsonb_agg(item.value) from (select value from jsonb_array_elements((public.get_announcements_service(actor_user_id, target_workspace_id)->'announcements')) value where value->>'status' in ('published', 'scheduled') and (value->>'publish_at')::timestamptz <= now() limit 5) item), '[]'::jsonb),
    'notifications', coalesce(public.get_notifications_service(actor_user_id, target_workspace_id, null, false, null, 5)->'notifications', '[]'::jsonb),
    'todos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', todo.id,
        'workspace_id', todo.workspace_id,
        'title', todo.title,
        'body', todo.body,
        'severity', todo.severity,
        'status', todo.status,
        'system_generated', todo.system_generated,
        'source_type', todo.source_type,
        'source_id', todo.source_id,
        'source_key', todo.source_key,
        'employee_id', todo.employee_id,
        'due_at', todo.due_at,
        'action_url', todo.action_url,
        'created_at', todo.created_at
      ) order by todo.due_at nulls last, todo.created_at, todo.id)
      from (
        select todo.*
        from public.workspace_todos todo
        where todo.workspace_id = target_workspace_id
          and todo.status = 'open'::public.workspace_todo_status
          and (
            todo.employee_id is null
            or public.service_actor_can_access_employee(actor_user_id, target_workspace_id, todo.employee_id)
          )
        order by todo.due_at nulls last, todo.created_at, todo.id
        limit 5
      ) todo
    ), '[]'::jsonb),
    'layout', jsonb_build_object(
      'widget_order', public.normalize_workspace_widget_order(preference.widget_order),
      'hidden_widget_ids', array(
        select distinct value
        from unnest(coalesce(preference.hidden_widget_ids, '{}'::text[])) value
        where value = any(array[
          'operations',
          'pending_requests',
          'open_shifts',
          'announcements',
          'todos',
          'notifications',
          'quick_actions'
        ])
      )
    )
  ) into result
  from public.user_profiles profile
  left join public.workspace_layout_preferences preference
    on preference.workspace_id = target_workspace_id
   and preference.user_id = actor_user_id
  where profile.user_id = actor_user_id;

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_schedule_request_event_service()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  event_location_id uuid;
  event_employee_id uuid;
  recipient_user_ids uuid[] := '{}'::uuid[];
  notification_type_key text;
  notification_title text;
  notification_body text;
  notification_preview text;
  notification_action_url text;
  audience_contract text;
begin
  select request.location_id, request.employee_id
  into event_location_id, event_employee_id
  from public.schedule_time_off_requests request
  where request.id = new.request_id and request.workspace_id = new.workspace_id;

  if event_location_id is null then
    raise exception 'schedule request location not found' using errcode = 'P0002';
  end if;

  if new.action = 'submitted' then
    notification_type_key := 'requests.time_off.submitted';
    notification_title := 'New time-off request';
    notification_body := 'A schedule request needs manager review.';
    notification_preview := 'A schedule request needs review.';
    notification_action_url := '/app/schedule/requests';
    audience_contract := 'schedule_request_reviewers';

    select coalesce(array_agg(distinct membership.user_id order by membership.user_id), '{}'::uuid[])
    into recipient_user_ids
    from public.workspace_memberships membership
    join public.workspace_role_permissions permission
      on permission.workspace_id = membership.workspace_id
     and permission.role_id = membership.role_id
    where membership.workspace_id = new.workspace_id
      and membership.status = 'active'
      and permission.permission_key = 'schedule.time_off_requests.read'
      and (
        membership.all_locations
        or exists (
          select 1 from public.membership_location_scopes scope
          where scope.membership_id = membership.id
            and scope.workspace_id = new.workspace_id
            and scope.location_id = event_location_id
        )
      );
  elsif new.action not in ('viewed', 'returned_to_pending') then
    notification_type_key := 'requests.time_off.status_changed';
      notification_title := 'Time-off request updated';
      notification_body := 'Your time-off request status changed.';
      notification_preview := 'A schedule request was updated.';
      notification_action_url := '/app/employee-hub/my-availability';
      audience_contract := 'time_off_requester';
      select coalesce(array_agg(employee.user_id), '{}'::uuid[])
      into recipient_user_ids
      from public.employee_profiles employee
      where employee.id = event_employee_id
        and employee.workspace_id = new.workspace_id
        and employee.user_id is not null
        and employee.user_id <> new.actor_user_id;
  else
    return new;
  end if;

  
 if tg_table_name='schedule_time_off_events' and exists(select 1 from public.schedule_time_off_requests r where r.id=new.request_id and r.request_type='time_off_cancellation') then
  if new.action='submitted' then
   notification_title:='Leave cancellation requested';
   notification_body:='Review the proposed cancellation. Approved leave stays in effect until accepted.';
   notification_preview:='A leave cancellation needs review.';
   notification_action_url:='/app/schedule/requests?tab=time-off&request='||new.request_id::text;
  else
   notification_title:='Leave cancellation updated';
   notification_body:=case new.action when 'denied' then 'Your cancellation was declined. The approved leave remains in effect.'
    when 'revoked' then 'Your cancellation request was closed. Review the original leave for its current status.'
    else 'Your leave cancellation was reviewed. See the exact hours in your request. Previously released shifts are not reassigned automatically.' end;
   notification_preview:='A leave cancellation was updated.';
   notification_action_url:='/app/employee-hub/my-availability#request-'||new.request_id::text;
  end if;
 end if;
 perform public.enqueue_notification_outbox_service(
    new.workspace_id,
    new.id,
    notification_type_key,
    1,
    new.actor_user_id,
    tg_table_name,
    new.request_id::text,
    jsonb_build_object(
      'correlation_id', new.id,
      'request_id', new.request_id,
      'request_event_id', new.id,
      'request_action', new.action,
      'location_id', event_location_id,
      'location_ids', jsonb_build_array(event_location_id),
      'recipient_user_ids', to_jsonb(recipient_user_ids),
      'audience_contract', audience_contract,
      'category', 'request',
      'title', notification_title,
      'body', notification_body,
      'safe_preview', notification_preview,
      'action_url', notification_action_url,
      'group_key', tg_table_name || ':' || new.request_id::text
    ),
    new.created_at
  );

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_notification_platform_service()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.weekly_preference_commitments(w uuid, emp uuid, selected_kind text DEFAULT NULL::text, selected_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(kind text, id uuid, status text, request_revision text, request_type text, target jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select 'exchange_application',a.id,
  case when a.status='approved' then 'finalized' when a.status='pending_manager' and c.status='open' and c.expires_at>now() then 'pending' else 'resolved' end,
  md5(jsonb_build_array(c.revision,a.updated_at,a.status)::text),c.kind,
  coalesce(public.shift_exchange_shift(w,c.offered_source_id),c.offered_snapshot)
 from public.shift_exchange_applications a join public.shift_exchange_cases c on c.workspace_id=w and c.id=a.case_id
 where a.workspace_id=w and a.employee_id=emp and (selected_kind is null or selected_kind='exchange_application')
  and ((selected_id is null and a.status='pending_manager' and c.status='open' and c.expires_at>now()) or a.id=selected_id)
 union all
 select 'exchange_swap',c.id,case when c.status='completed' then 'finalized' when c.status='open' and c.expires_at>now() then 'pending' else 'resolved' end,
  c.revision::text,c.kind,coalesce(public.shift_exchange_shift(w,c.requested_source_id),c.requested_snapshot)
 from public.shift_exchange_cases c where c.workspace_id=w and c.owner_id=emp and c.kind='swap' and (selected_kind is null or selected_kind='exchange_swap')
  and ((selected_id is null and c.status='open' and c.expires_at>now()) or c.id=selected_id)
 union all
 select 'lineup_offer',p.id,case when p.status='confirmed' then 'finalized' when p.status='accepted' and p.expires_at>now() then 'pending' else 'resolved' end,
  md5(jsonb_build_array(p.fingerprint,p.responded_at,p.status,p.operation)::text),'lineup_offer',
  p.operation->'target'||jsonb_build_object('location_id',p.target_location_id)
 from public.lineup_proposals p where p.workspace_id=w and p.employee_id=emp and p.kind='offer' and (selected_kind is null or selected_kind='lineup_offer')
  and ((selected_id is null and p.status='accepted' and p.expires_at>now()) or p.id=selected_id)
;
$function$;

CREATE OR REPLACE FUNCTION public.weekly_preferences_save_service(actor uuid, w uuid, command jsonb, request_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare emp uuid:=(command->>'employee_id')::uuid; source text:=command->>'source'; model jsonb; prior jsonb;
 old_command public.weekly_preference_commands%rowtype; required jsonb; choice jsonb; row_value jsonb; commitment record;
 event uuid:=gen_random_uuid(); kept integer:=0; cancelled integer:=0; resolved integer:=0; finalized jsonb:='[]'; result jsonb;
 c public.shift_exchange_cases%rowtype; a public.shift_exchange_applications%rowtype; recipients uuid[]; summary text; changed_days text;
begin
 if request_key is null then raise exception 'Idempotency key required' using errcode='22023'; end if;
 perform public.availability_lock_workspace(w);
 -- Authorize again before idempotent replay; never return a stored private read model.
 model:=public.weekly_preferences_read_service(actor,w,emp);
 if source is null or source not in ('employee','manager') or not coalesce((model->>case when source='employee' then 'can_edit_employee' else 'can_manage' end)::boolean,false) then raise exception 'Preference write access required' using errcode='42501'; end if;
 select * into old_command from public.weekly_preference_commands q where q.workspace_id=w and q.actor_user_id=actor and q.request_key=weekly_preferences_save_service.request_key;
 if old_command.request_key is not null then
  if old_command.command<>command then raise exception 'Idempotency key was used for another save' using errcode='22023'; end if;
  return old_command.result||jsonb_build_object('model',model);
 end if;
 model:=public.validate_weekly_preference_command(actor,w,command); prior:=model->source;
 if source='employee' then
  -- The workspace lock serializes exchange approval; row locks also cover offer
  -- responses that predate that common lock in the existing Line Up service.
  perform 1 from public.lineup_proposals where workspace_id=w and employee_id=emp and kind='offer' and status in ('pending','accepted') order by id for update;
  required:=public.weekly_preference_commitment_conflicts(w,emp,command->'preference');
  if exists(select 1 from jsonb_array_elements(coalesce(command->'decisions','[]')) d group by d->>'kind',d->>'id' having count(*)>1) then raise exception 'Choose each request once' using errcode='22023'; end if;
  for row_value in select value from jsonb_array_elements(required) loop
   if not exists(select 1 from jsonb_array_elements(coalesce(command->'decisions','[]')) d where d->>'kind'=row_value->>'kind' and d->>'id'=row_value->>'id' and d->>'fingerprint'=row_value->>'fingerprint' and d->>'action' in ('keep','cancel')) then
    raise exception 'Pending requests changed. Review each conflicting request before saving.' using errcode='PT409'; end if;
  end loop;
 end if;
 insert into public.weekly_preference_events(id,workspace_id,employee_id,source,actor_user_id,before_record,after_record,decisions)
  values(event,w,emp,source,actor,prior,'{}',coalesce(command->'decisions','[]'));
 for choice in select value from jsonb_array_elements(coalesce(command->'decisions','[]')) loop
  if choice->>'action' is null or choice->>'action' not in ('keep','cancel') then raise exception 'Choose keep or cancel' using errcode='22023'; end if;
  select * into commitment from public.weekly_preference_commitments(w,emp,choice->>'kind',(choice->>'id')::uuid);
  if not found then raise exception 'Request does not belong to this employee' using errcode='42501'; end if;
  if commitment.status='finalized' then finalized:=finalized||jsonb_build_array(jsonb_build_object('kind',commitment.kind,'id',commitment.id)); continue; end if;
  if commitment.status='resolved' then resolved:=resolved+1; continue; end if;
  select value into row_value from jsonb_array_elements(required) where value->>'kind'=choice->>'kind' and value->>'id'=choice->>'id' and value->>'fingerprint'=choice->>'fingerprint';
  if row_value is null then raise exception 'The request conflict changed. Review it again before saving.' using errcode='PT409'; end if;
  insert into public.weekly_preference_commitment_decisions(workspace_id,employee_id,kind,request_id,conflict_fingerprint,action,event_id)
   values(w,emp,commitment.kind,commitment.id,choice->>'fingerprint',choice->>'action',event)
   on conflict(workspace_id,employee_id,kind,request_id) do update set conflict_fingerprint=excluded.conflict_fingerprint,action=excluded.action,event_id=excluded.event_id;
  if choice->>'action'='keep' then kept:=kept+1; continue; end if;
  if commitment.kind='lineup_offer' then
   update public.lineup_proposals set status='declined',responded_at=now(),result=jsonb_build_object('reason','Employee withdrew acceptance after updating availability.') where workspace_id=w and id=commitment.id and status='accepted';
  else
   if commitment.kind='exchange_swap' then
    select * into c from public.shift_exchange_cases where workspace_id=w and id=commitment.id for update;
    update public.shift_exchange_cases set status='cancelled',revision=revision+1,updated_at=now() where id=c.id;
    update public.shift_exchange_applications set status='closed_case_cancelled',updated_at=now() where workspace_id=w and case_id=c.id and status in ('invited','pending_manager');
    delete from public.shift_exchange_votes where workspace_id=w and case_id=c.id;
    perform public.shift_exchange_emit(actor,w,c.id,null,'case_closed','Employee cancelled the swap after updating availability. No assignment changed.');
   else
    select * into a from public.shift_exchange_applications where workspace_id=w and id=commitment.id for update;
    select * into c from public.shift_exchange_cases where workspace_id=w and id=a.case_id for update;
    update public.shift_exchange_applications set status='withdrawn',updated_at=now() where id=a.id;
    update public.shift_exchange_cases set status=case when audience='direct' then 'cancelled' else status end,revision=revision+1,updated_at=now() where id=c.id;
    delete from public.shift_exchange_votes where workspace_id=w and case_id=c.id and application_id=a.id;
    perform public.shift_exchange_emit(actor,w,c.id,a.id,'application_withdrawn','Employee withdrew this request after updating availability. No assignment changed.');
   end if;
  end if;
  cancelled:=cancelled+1;
 end loop;
 if source='employee' then
  insert into public.employee_weekly_preferences(workspace_id,employee_id,preference,revision,updated_by)
   values(w,emp,command->'preference',1,actor) on conflict(workspace_id,employee_id) do update set preference=excluded.preference,revision=employee_weekly_preferences.revision+1,updated_by=actor,updated_at=now();
  update public.employee_onboarding_requirements set status='completed',completed_at=now(),rejection_reason=null,updated_at=now() where workspace_id=w and employee_id=emp and kind='availability';
  update public.employee_onboarding_cases set revision=revision+1,updated_at=now() where workspace_id=w and employee_id=emp;
 else
  insert into public.manager_weekly_reminders(workspace_id,employee_id,preference,enabled,notes,revision,updated_by)
   values(w,emp,command->'preference',(command->>'enabled')::boolean,array(select jsonb_array_elements_text(command->'notes')),1,actor)
   on conflict(workspace_id,employee_id) do update set preference=excluded.preference,enabled=excluded.enabled,notes=excluded.notes,revision=manager_weekly_reminders.revision+1,updated_by=actor,updated_at=now();
 end if;
 model:=public.weekly_preferences_read_service(actor,w,emp);
 update public.weekly_preference_events set after_record=model->(command->>'source') where id=event;
 select string_agg((array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[(d->>'day')::integer+1],', ' order by (d->>'day')::integer) into changed_days
 from jsonb_array_elements(command->'preference'->'days') d
 where d is distinct from (select value from jsonb_array_elements(prior->'preference'->'days') where value->'day'=d->'day');
 summary:=case when source='manager' then 'Manager reminders updated.' else 'Weekly availability updated. '||case when changed_days is null then 'Week confirmed.' else 'Changed days: '||changed_days||'.' end end;
 insert into public.employee_events(workspace_id,employee_id,actor_user_id,action,summary) values(w,emp,actor,case when source='manager' then 'manager_reminders_updated' else 'weekly_availability_updated' end,summary);
 if source='employee' then
  select coalesce(array_agg(m.user_id),'{}') into recipients from public.workspace_memberships m where m.workspace_id=w and m.status='active' and m.user_id<>actor
   and (public.weekly_preference_manager_scope(m.user_id,w,emp,'employees.manage') or exists(select 1 from public.workspace_roles r where r.workspace_id=w and r.id=m.role_id and r.access_class in ('owner','admin')));
  perform public.enqueue_notification_outbox_service(w,event,'availability.weekly_updated',1,actor,'weekly_availability',emp::text,
   jsonb_build_object('recipient_user_ids',to_jsonb(recipients),'audience_contract','availability_scoped_recipients','category','request',
    'title','Availability updated','body',(model->>'employee_name')||': '||summary,'safe_preview','An employee updated weekly availability.',
    'action_url','/app/employees?employeeId='||emp::text||'&section=availability','employee_id',emp,'changed_days',changed_days,'group_key','weekly-availability:'||emp::text),now());
 end if;
 result:=jsonb_build_object('kept_count',kept,'cancelled_count',cancelled,'resolved_count',resolved,'finalized',finalized);
 insert into public.weekly_preference_commands(workspace_id,actor_user_id,request_key,command,result) values(w,actor,request_key,command,result);
 return result||jsonb_build_object('model',model);
end; $function$;

drop function public.get_shift_change_conflicts_service(uuid);
drop function public.resolve_schedule_shift_change_request_exchange_legacy(uuid, uuid, uuid, integer, text, text);
drop function public.resolve_schedule_shift_change_request_service(uuid, uuid, uuid, integer, text, text);
drop function public.submit_employee_shift_request_exchange_legacy(uuid, uuid, text, uuid, uuid, text);
drop function public.submit_employee_shift_request_service(uuid, uuid, text, uuid, uuid, text);

drop table public.schedule_shift_change_events;
drop table public.schedule_shift_change_participants;
drop table public.schedule_shift_change_requests;
drop type public.shift_change_participant_role;
drop type public.shift_change_request_status;
drop type public.shift_change_request_type;

alter table public.workspaces drop column shift_exchanges_enabled;

drop function public.get_schedule_requests_service(uuid, uuid, text, text, uuid, text, timestamp with time zone, timestamp with time zone, integer);

CREATE FUNCTION public.get_schedule_requests_service(actor_user_id uuid, target_workspace_id uuid, target_time_off_queue text DEFAULT 'needs_review'::text, target_location_id uuid DEFAULT NULL::uuid, target_search text DEFAULT ''::text, target_time_off_cursor timestamp with time zone DEFAULT NULL::timestamp with time zone, target_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare can_time_off boolean; can_shift boolean; time_rows jsonb; locations jsonb;
 time_count integer; time_cursor timestamptz;
begin
 if target_time_off_queue not in('needs_review','closed') or target_limit not between 1 and 100 then raise exception 'invalid schedule request query' using errcode='22023'; end if;
 can_time_off:=public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.time_off_requests.read');
 can_shift:=public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.shift_change_requests.read');
 if not can_time_off and not can_shift then raise exception 'schedule request read access denied' using errcode='42501'; end if;
 if target_location_id is not null and ((can_time_off and not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.time_off_requests.read',target_location_id)) or (can_shift and not public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.shift_change_requests.read',target_location_id))) then raise exception 'schedule request scope denied' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by l.name),'[]') into locations from public.locations l where l.workspace_id=target_workspace_id and l.archived_at is null and ((can_time_off and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.time_off_requests.read',l.id)) or (can_shift and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.shift_change_requests.read',l.id)));
 select count(*) into time_count from public.schedule_time_off_requests r where can_time_off and r.workspace_id=target_workspace_id and r.status='pending' and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.time_off_requests.read',r.location_id);
 with filtered as(select r.* from public.schedule_time_off_requests r join public.employee_profiles e on e.id=r.employee_id join public.locations l on l.id=r.location_id where can_time_off and r.workspace_id=target_workspace_id and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.time_off_requests.read',r.location_id) and (target_location_id is null or r.location_id=target_location_id) and ((target_time_off_queue='needs_review' and r.status='pending') or (target_time_off_queue='closed' and r.status<>'pending')) and (target_time_off_cursor is null or r.created_at<target_time_off_cursor) and (btrim(target_search)='' or concat_ws(' ',e.first_name,e.last_name,e.preferred_name,r.reason) ilike '%'||btrim(target_search)||'%') order by r.created_at desc,r.id limit target_limit+1), page as(select * from filtered limit target_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'employee_id',r.employee_id,'employee_name',concat_ws(' ',coalesce(nullif(e.preferred_name,''),e.first_name),e.last_name),'location_id',r.location_id,'location_name',l.name,'request_type',r.request_type,'reason',r.reason,'cancellation',public.time_off_cancellation_context(target_workspace_id,r.id),'status',r.status,'start_date',(select min(s.segment_date) from public.schedule_time_off_segments s where s.request_id=r.id),'end_date',(select max(s.segment_date) from public.schedule_time_off_segments s where s.request_id=r.id),'revision',r.revision,'viewed_at',r.viewed_at,'created_at',r.created_at,'conflict_count',public.time_off_request_assignment_count(target_workspace_id,r.id),'segments',public.time_off_request_periods(r.id,target_workspace_id),'events',coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'action',ev.action,'actor_name',coalesce(nullif(up.display_name,''),'Team member'),'note',ev.note,'created_at',ev.created_at,'released_assignments',public.time_off_event_released_assignments(get_schedule_requests_service.actor_user_id,target_workspace_id,ev.id)) order by ev.created_at) from public.schedule_time_off_events ev left join public.user_profiles up on up.user_id=ev.actor_user_id where ev.request_id=r.id),'[]')) order by r.created_at desc),'[]') into time_rows from page r join public.employee_profiles e on e.id=r.employee_id join public.locations l on l.id=r.location_id;
 with filtered as(select r.created_at from public.schedule_time_off_requests r join public.employee_profiles e on e.id=r.employee_id where can_time_off and r.workspace_id=target_workspace_id and public.schedule_actor_has_capability_service(actor_user_id,target_workspace_id,'schedule.time_off_requests.read',r.location_id) and (target_location_id is null or r.location_id=target_location_id) and ((target_time_off_queue='needs_review' and r.status='pending') or (target_time_off_queue='closed' and r.status<>'pending')) and (target_time_off_cursor is null or r.created_at<target_time_off_cursor) and (btrim(target_search)='' or concat_ws(' ',e.first_name,e.last_name,e.preferred_name,r.reason) ilike '%'||btrim(target_search)||'%') order by r.created_at desc,r.id limit target_limit+1) select case when count(*)>target_limit then min(created_at) else null end into time_cursor from filtered;
 return jsonb_build_object('workspace_id',target_workspace_id,'time_format',(select time_format from public.workspace_scheduling_settings where workspace_id=target_workspace_id),'locations',locations,'time_off_pending_count',time_count,'time_off_next_cursor',time_cursor,'time_off_requests',time_rows);
end; $function$;

revoke all on function public.get_schedule_requests_service(uuid, uuid, text, uuid, text, timestamp with time zone, integer) from public, anon, authenticated;
grant execute on function public.get_schedule_requests_service(uuid, uuid, text, uuid, text, timestamp with time zone, integer) to service_role;
