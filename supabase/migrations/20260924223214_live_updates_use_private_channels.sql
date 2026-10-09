-- BL-114, FOUNDATION-B goal 8: every live update travels on a private channel.
--
-- Hosted allows private channels only since 2026-09-24 (Realtime "Allow public
-- access" off). The Schedule's channels were already private; Shift Hub's
-- refresh pings (shift-exchanges:<workspace>) and the account notification
-- listener (account-notifications:<user>) were public, so hosted dropped them.
-- Realtime lets a browser join a private channel only if it could read a
-- broadcast on the topic from realtime.messages; these policies say who can,
-- through the authorization core.

-- 1. The account action answers for one's own account only ---------------------------
CREATE OR REPLACE FUNCTION app_private.authz_check(state app_private.actor_state, rule_row app_private.authz_actions, target_locations uuid[], target_person uuid, target_user uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_workspace uuid;
  person uuid := target_person;
  whose uuid;
  target_access public.workspace_role;
  target_is_self boolean;
  places uuid[];
  reach text;
begin
  if state.user_id is null then
    return 'not_member';
  end if;
  if rule_row.scope_class = 'account' then
    -- An account action is about one's own account.
    if target_user is not null and target_user is distinct from state.user_id then
      return 'out_of_scope';
    end if;
    return null;
  end if;
  if state.membership_id is null then
    return 'not_member';
  end if;
  if not state.workspace_open then
    return 'workspace_closed';
  end if;

  if person is not null then
    select profile.workspace_id, profile.user_id into target_workspace, whose
    from public.employee_profiles profile
    where profile.id = person;
    if target_workspace is distinct from state.workspace_id then
      return 'out_of_scope';
    end if;
  end if;
  if target_user is not null then
    if person is not null and whose is distinct from target_user then
      return 'out_of_scope';
    end if;
    whose := target_user;
    if person is null then
      select profile.id into person
      from public.employee_profiles profile
      where profile.workspace_id = state.workspace_id
        and profile.user_id = target_user
        and profile.archived_at is null;
      if person is null and not exists (
        select 1 from public.workspace_memberships membership
        where membership.workspace_id = state.workspace_id and membership.user_id = target_user
      ) then
        return 'out_of_scope';
      end if;
    end if;
  end if;
  target_is_self := coalesce(whose = state.user_id, false);

  -- Their own row is theirs to read in any state.
  if rule_row.self_ok and target_is_self then
    return null;
  end if;

  if state.status = 'pending_activation' then
    if not rule_row.restricted_ok then
      return 'not_active';
    end if;
  elsif state.status <> 'active' then
    return 'not_active';
  elsif state.document_blocked and not rule_row.restricted_ok then
    return 'document_blocked';
  end if;

  if rule_row.scope_class = 'own' then
    if (person is null and whose is null) or target_is_self then
      return null;
    end if;
    return 'out_of_scope';
  end if;

  if rule_row.owner_only and state.class <> 'owner' then
    return 'owner_only';
  end if;
  -- The owner holds every permission.
  if state.class <> 'owner'
     and rule_row.permission_key is not null
     and not rule_row.permission_key = any (state.permissions) then
    return 'missing_permission';
  end if;
  if state.class = 'employee' then
    return 'missing_permission';
  end if;

  if rule_row.no_self and target_is_self then
    return 'rank';
  end if;
  -- A manager's own record goes one level up; owners and admins keep theirs
  -- (user decision 2026-09-24, 2A).
  if rule_row.rank_below and target_is_self and state.class not in ('owner', 'admin') then
    return 'rank';
  end if;
  if rule_row.rank_below and (person is not null or whose is not null) and not target_is_self then
    select role.access_class into target_access
    from public.workspace_memberships membership
    join public.workspace_roles role
      on role.id = membership.role_id and role.workspace_id = membership.workspace_id
    where membership.workspace_id = state.workspace_id and membership.user_id = whose;
    -- ponytail: somebody without a membership yet ranks as an employee; use the
    -- invitation's role if a manager ever invites into a higher one.
    if app_private.authz_rank(coalesce(target_access, 'employee')) >= app_private.authz_rank(state.class) then
      return 'rank';
    end if;
  end if;

  if state.class in ('owner', 'admin') then
    reach := 'org';
  else
    select rule.manager_rule into reach
    from app_private.authz_scope_rules rule
    join app_private.authz_settings setting on setting.scope_model = rule.model
    where rule.scope_class = rule_row.scope_class and rule.effect = rule_row.effect;
    reach := coalesce(reach, 'none');
  end if;

  if rule_row.scope_class = 'org' then
    if reach = 'none' then
      return 'out_of_scope';
    end if;
    return null;
  end if;

  if target_locations is not null then
    places := target_locations;
    if array_position(places, null) is not null then
      return 'out_of_scope';
    end if;
    if rule_row.scope_class = 'place' and cardinality(places) <> 1 then
      return 'out_of_scope';
    end if;
    if exists (
      select 1 from unnest(places) place
      where not exists (
        select 1 from public.locations location
        where location.id = place and location.workspace_id = state.workspace_id and location.deleted_at is null
      )
    ) then
      return 'out_of_scope';
    end if;
  elsif rule_row.scope_class = 'person' and (person is not null or whose is not null) then
    -- Where the person works; somebody with no employee record works nowhere.
    places := coalesce((
      select array_agg(distinct assignment.location_id)
      from public.employee_location_assignments assignment
      where assignment.employee_id = person and assignment.ended_at is null
    ), '{}');
  else
    return 'out_of_scope';
  end if;

  if reach = 'org' then
    return null;
  end if;
  if reach = 'none' or cardinality(places) = 0 then
    return 'out_of_scope';
  end if;
  if reach = 'any' and places && state.manages then
    return null;
  end if;
  if reach = 'all' and places <@ state.manages then
    return null;
  end if;
  return 'out_of_scope';
end;
$function$;

-- 2. Shift Hub's pings are private ------------------------------------------------------
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
  if s is null or (s->>'starts_at')::timestamptz<=clock_timestamp() then raise exception 'Choose an upcoming published shift' using errcode='PT409'; end if;
  if action='create' then
   if (s->>'employee_id')::uuid is distinct from emp.id then raise exception 'Only the current owner can offer this shift' using errcode='42501'; end if;
   if command->>'kind' not in('cover','swap') then raise exception 'Invalid exchange kind'; end if;
   if command->>'kind'='swap' then
    t:=public.shift_exchange_shift(w,(command->>'requested_shift_id')::uuid);
    if t is null or t->>'employee_id' is null or t->>'employee_id'=emp.id::text or (t->>'starts_at')::timestamptz<=clock_timestamp() then raise exception 'Choose an upcoming teammate shift'; end if;
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
 perform realtime.send(jsonb_build_object('workspace_id',w,'case_id',cid,'revision',c.revision),'changed','shift-exchanges:'||w::text,true);
 result:=jsonb_build_object('case_id',cid,'status',c.status,'revision',c.revision);
 insert into public.shift_exchange_commands(workspace_id,actor_user_id,idempotency_key,command,result) values(w,actor,idempotency_key,command,result);
 return result;
end; $function$;

CREATE OR REPLACE FUNCTION public.shift_exchanges_maintain_service(target_batch_size integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform realtime.send(jsonb_build_object('workspace_id',c.workspace_id,'case_id',c.id,'revision',c.revision),'changed','shift-exchanges:'||c.workspace_id::text,true);
  if live_status='expired' then expired_count:=expired_count+1; else invalidated_count:=invalidated_count+1; end if;
 end loop;
 return jsonb_build_object('expired',expired_count,'invalidated',invalidated_count,'skipped_busy',busy_count);
end; $function$;

CREATE OR REPLACE FUNCTION public.process_notification_outbox_service(target_worker_id text, target_outbox_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; item public.notification_outbox%rowtype; signalled jsonb;
begin
 result:=public.process_notification_outbox_before_signal(target_worker_id,target_outbox_id);
 select * into item from public.notification_outbox where id=target_outbox_id;
 if result->>'status'='processed' and item.subject_type='shift_exchange_cases' then
  -- One workspace signal per transaction, even for a large multi-candidate case.
  -- The content-free bus invalidates authenticated reads; it carries no inbox data.
  begin
   signalled:=coalesce(nullif(current_setting('app.exchange_inbox_signalled',true),''),'[]')::jsonb;
   if not signalled @> jsonb_build_array(item.workspace_id::text) then
    perform realtime.send(jsonb_build_object('workspace_id',item.workspace_id),'changed','shift-exchanges:'||item.workspace_id::text,true);
    perform set_config('app.exchange_inbox_signalled',(signalled||jsonb_build_array(item.workspace_id::text))::text,true);
   end if;
  exception when others then
   -- The existing poll/reconnect path remains available. A broadcast outage
   -- must not roll back a successfully projected inbox item.
   result:=result||jsonb_build_object('invalidation_deferred',true);
  end;
 end if;
 return result;
end; $function$;

CREATE OR REPLACE FUNCTION public.decide_time_off_with_assignments_service(actor uuid, w uuid, rid uuid, expected_revision integer, action text, note text, decisions jsonb, operation_id uuid, expected_impact text, dispositions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.schedule_time_off_requests%rowtype; prior public.time_off_commands%rowtype; command jsonb; result jsonb; preview jsonb;
 affected jsonb:='[]'; s jsonb; changes jsonb:='[]'; other record; locked_id uuid;
begin
 perform public.availability_lock_workspace(w);
 select * into r from public.schedule_time_off_requests where id=rid and workspace_id=w for update;
 if r.id is null then raise exception 'time off request not found' using errcode='P0002'; end if;
 if not public.schedule_actor_has_capability_service(actor,w,'schedule.time_off_requests.manage',r.location_id) then raise exception 'time off request manage access denied' using errcode='42501'; end if;
 if operation_id is null then raise exception 'A decision key is required' using errcode='22023'; end if;
 command:=jsonb_build_object('kind','assignment_decision','request_id',rid,'expected_revision',expected_revision,'action',action,'note',btrim(coalesce(note,'')),
  'decisions',decisions,'impact',expected_impact,'dispositions',dispositions);
 select * into prior from public.time_off_commands c where c.workspace_id=w and c.actor_user_id=actor and c.operation_id=decide_time_off_with_assignments_service.operation_id;
 if found then
  if prior.input->>'kind'='decision' and coalesce(dispositions,'[]'::jsonb)='[]'::jsonb and prior.input=jsonb_build_object('kind','decision','request_id',rid,
   'expected_revision',expected_revision,'action',action,'note',btrim(coalesce(note,'')),'decisions',decisions) then return prior.result; end if;
  if prior.input<>command then raise exception 'This decision key was used for a different decision' using errcode='40001'; end if;
  return prior.result;
 end if;
 if jsonb_typeof(dispositions) is distinct from 'array' then raise exception 'Review the published assignment decisions' using errcode='22023'; end if;
 
 if r.request_type='time_off_cancellation' then
  if expected_impact is not null or jsonb_array_length(dispositions)>0 then raise exception 'Cancellation cannot change published assignments' using errcode='22023'; end if;
  result:=public.apply_time_off_cancellation_decision(actor,w,rid,expected_revision,action,note,decisions);
  insert into public.time_off_commands(workspace_id,actor_user_id,operation_id,input,result) values(w,actor,operation_id,command,result);
  return result;
 end if;
 if action='return_to_pending' and exists(select 1 from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id=cl.request_id
  where cl.parent_request_id=rid and cr.status in('approved','partially_approved')) then raise exception 'Cancelled leave cannot be reopened; submit a new leave request' using errcode='22023'; end if;
 if action in('approve','partial_approve') then
  preview:=public.preview_time_off_assignment_decision_service(actor,w,rid,expected_revision,action,decisions);
  if (preview->>'restricted_count')::integer>0 then raise exception 'Published assignment scope denied; a manager with publishing access to every affected location must decide this request' using errcode='42501'; end if;
  affected:=preview->'affected_shifts';
  -- Lock the concrete current snapshots and recompute after any older writer.
  for locked_id in select ps.id from public.schedule_published_shifts ps where ps.workspace_id=w and ps.id in(select (x->>'id')::uuid from jsonb_array_elements(affected) x) order by ps.id for update loop null; end loop;
  preview:=public.preview_time_off_assignment_decision_service(actor,w,rid,expected_revision,action,decisions);
  if (preview->>'restricted_count')::integer>0 then raise exception 'Published assignment scope denied' using errcode='42501'; end if;
  affected:=preview->'affected_shifts';
  if (expected_impact is not null or jsonb_array_length(affected)>0) and expected_impact is distinct from preview->>'fingerprint' then
   raise exception 'Published assignment conflict: review the current affected shifts before approval' using errcode='40001'; end if;
  if jsonb_array_length(dispositions)<>jsonb_array_length(affected)
   or (select count(distinct (x->>'shift_id')::uuid) from jsonb_array_elements(dispositions) x)<>jsonb_array_length(dispositions)
   or exists(select 1 from jsonb_array_elements(dispositions) x where coalesce(x->>'action','')<>'release_entire_shift' or not exists(select 1 from jsonb_array_elements(affected) impacted where impacted->>'id'=((x->>'shift_id')::uuid)::text)) then
   raise exception 'Choose an explicit disposition for every affected published shift' using errcode='22023'; end if;
 elsif jsonb_array_length(dispositions)>0 then raise exception 'Only approval can change published assignments' using errcode='22023'; end if;
 result:=public.apply_time_off_period_decision(actor,w,rid,expected_revision,action,note,decisions);
 for other in select cr.id from public.time_off_cancellation_links cl join public.schedule_time_off_requests cr on cr.id=cl.request_id
  where cl.parent_request_id=rid and cr.status='pending' loop
  update public.schedule_time_off_requests set status='revoked',revision=revision+1,updated_at=now() where id=other.id;
  insert into public.schedule_time_off_events(workspace_id,request_id,action,actor_user_id,note,metadata)
   values(w,other.id,'revoked',actor,'Cancellation closed because the original leave changed. No shifts were reassigned.',jsonb_build_object('parent_request_id',rid));
 end loop;
 
 for s in select value from jsonb_array_elements(affected) loop
  insert into public.time_off_assignment_releases(workspace_id,request_id,decision_revision,published_shift_id,before_assignment,actor_user_id)
   values(w,rid,(result->>'revision')::integer,(s->>'id')::uuid,s,actor);
  update public.schedule_published_shifts set employee_id=null where workspace_id=w and id=(s->>'id')::uuid and employee_id=r.employee_id;
  if not found then raise exception 'Published assignment changed before release' using errcode='40001'; end if;
  changes:=changes||jsonb_build_array(s||jsonb_build_object('new_employee_id',null));
 end loop;
 if jsonb_array_length(changes)>0 then
  perform public.shift_exchange_reconcile_batch(actor,w,changes);
  for other in select c.id from public.shift_exchange_cases c where c.workspace_id=w and c.status='open'
   and exists(select 1 from jsonb_array_elements(changes) x where (x->>'source_id')::uuid in(c.offered_source_id,c.requested_source_id)) loop
   update public.shift_exchange_cases set status='invalidated',revision=revision+1,updated_at=now() where id=other.id;
   update public.shift_exchange_applications set status='invalidated',updated_at=now() where case_id=other.id and status in('invited','pending_manager');
   perform public.shift_exchange_emit(actor,w,other.id,null,'invalidated','An involved assignment was released with approved time off. Review the current schedule.');
  end loop;
  update public.schedule_time_off_events ev set metadata=ev.metadata||jsonb_build_object('released_assignments',changes)
   where ev.workspace_id=w and ev.request_id=rid and ev.metadata->>'revision'=result->>'revision' and ev.action in('approved','partially_approved');
  perform realtime.send(jsonb_build_object('workspace_id',w,'request_id',rid),'changed','shift-exchanges:'||w::text,true);
 end if;
 result:=result||jsonb_build_object('released_shift_count',jsonb_array_length(changes));
 insert into public.time_off_commands(workspace_id,actor_user_id,operation_id,input,result) values(w,actor,operation_id,command,result);
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.refresh_weekly_exchange_terms(w uuid, cid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.shift_exchange_cases%rowtype; s jsonb; t jsonb; fp text; deadline timestamptz;
 event_action text; message text; prior_details jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(w::text,921));
 select * into c from public.shift_exchange_cases where workspace_id=w and id=cid for update;
 -- Expired, invalidated and completed requests must never be revived.
 if c.id is null or c.status<>'open' or c.expires_at<=clock_timestamp() then return; end if;
 s:=public.shift_exchange_shift(w,c.offered_source_id); t:=public.shift_exchange_shift(w,c.requested_source_id);
 if not public.weekly_exchange_same_responsibility(c.offered_snapshot,s)
  or not public.weekly_exchange_same_responsibility(c.requested_snapshot,t) then return; end if;
 if public.shift_exchange_terms(c.offered_snapshot)=public.shift_exchange_terms(s)
  and public.shift_exchange_terms(c.requested_snapshot)=public.shift_exchange_terms(t) then return; end if;
 fp:=public.shift_exchange_fingerprint(w,s,t);
 if fp=c.consent_fingerprint then return; end if;
 deadline:=coalesce(least((s->>'starts_at')::timestamptz,(t->>'starts_at')::timestamptz),c.expires_at);
 event_action:=case when deadline<=clock_timestamp() then 'expired' else 'terms_changed' end;
 prior_details:=jsonb_build_object('before',jsonb_build_object('offered',c.offered_snapshot,'requested',c.requested_snapshot,
  'consent_fingerprint',c.consent_fingerprint,'revision',c.revision),
  'after',jsonb_build_object('offered',s,'requested',t,'consent_fingerprint',fp,'revision',c.revision+1),
  'acceptance_retained',event_action='terms_changed','cause','published_assignment_changed');
 update public.shift_exchange_cases set offered_snapshot=s,requested_snapshot=t,consent_fingerprint=fp,
  expires_at=deadline,status=case when event_action='expired' then 'expired' else status end,
  revision=revision+1,updated_at=now() where id=cid;
 update public.shift_exchange_applications set consent_fingerprint=fp,
  status=case when event_action='expired' then 'expired' else status end,updated_at=now()
  where case_id=cid and workspace_id=w and status in ('invited','pending_manager');
 -- Employee consent survives; a manager's old scoped review does not.
 delete from public.shift_exchange_votes where workspace_id=w and case_id=cid;
 message:=case when event_action='expired' then
  'The updated shift has already started. This request closed without a transfer. Check your current schedule.'
 else format('Shift details changed: %s, %s, %s-%s (%s).%s Existing acceptances remain valid; pending invitations still need a response. Final manager approval is required.',
  s->>'location_name',s->>'date',s->>'start_time',s->>'end_time',coalesce(s->>'time_timezone',s->>'timezone'),
  case when t is null then '' else format(' Swap shift: %s, %s, %s-%s (%s).',t->>'location_name',t->>'date',t->>'start_time',t->>'end_time',coalesce(t->>'time_timezone',t->>'timezone')) end) end;
 perform public.shift_exchange_emit(null,w,cid,null,event_action,message);
 -- emit is synchronous under the workspace lock; its newest event is ours.
 update public.shift_exchange_events set details=prior_details where id=(select id from public.shift_exchange_events
  where workspace_id=w and case_id=cid and action=event_action order by notification_sequence desc limit 1);
 perform realtime.send(jsonb_build_object('workspace_id',w,'case_id',cid,'revision',c.revision+1),
  'changed','shift-exchanges:'||w::text,true);
end; $function$;

-- 3. Who may join which channel -----------------------------------------------------------
grant execute on function app_private.rls_can(uuid, text, uuid[], uuid, uuid) to authenticated;

-- Anyone in the workspace who can use Shift Hub hears that something changed; the
-- ping carries ids only, and the screen re-reads through the API.
create policy "shift hub users hear shift hub changes"
  on realtime.messages for select to authenticated
  using (
    extension = 'broadcast'
    and (select realtime.topic()) ~ '^shift-exchanges:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
    and app_private.rls_can(split_part((select realtime.topic()), ':', 2)::uuid, 'exchange.offer_own')
  );

-- The account channel carries table changes only, and the table's own policy
-- picks the rows; joining it still takes a read right on the topic: one's own.
create policy "people hear their own account notifications"
  on realtime.messages for select to authenticated
  using (
    extension = 'broadcast'
    and (select realtime.topic()) ~ '^account-notifications:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
    and app_private.rls_can(null, 'account.self', null, null, split_part((select realtime.topic()), ':', 2)::uuid)
  );
