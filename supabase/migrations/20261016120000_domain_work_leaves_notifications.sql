-- BILDIRIM-01: five pieces of domain work lived inside the old notification code. The notification
-- system is torn down next; this migration lets each stand on its own first. The "send a
-- notification" calls stay where they are; the teardown removes them.
--
-- K1  The restriction for a missed document deadline (KARARLAR K:87) was written inside the reminder
--     loop's per-case block, after the batch cursor, so a failing notification undid it and a case
--     outside the batch of 100 waited. It is one statement of its own now, before the reminders.
-- K2  Unchanged here: shift_exchanges_maintain_service already holds no notification code; it moves to
--     its own cron (/api/internal/cron/maintenance, below) off the notification worker.
-- K3  The shift exchange history row was inserted inside shift_exchange_emit_notification_base. It is
--     inserted by shift_exchange_emit now, which hands its id to the notification call.
-- K4  The account security audit row had only a notification-named entry point. It has its own.
-- K5  Nothing to move: the to-do sync's notification call is one statement the to-do statements do
--     not read (supabase/tests/domain_work_outlives_notifications.test.sql).

-- K1 ------------------------------------------------------------------------------------------------

-- Every requirement whose deadline passed and whose settings restrict the person, of a person who is
-- still on the team in a workspace in use. Current access is always judged with server time.
create function app_private.document_suspend_overdue()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare suspended integer;
begin
  update public.employee_onboarding_requirements q set document_suspended_at = now()
  from public.employee_onboarding_cases oc
  join public.employee_profiles p on p.id = oc.employee_id and p.workspace_id = oc.workspace_id and p.archived_at is null
  join public.workspace_memberships m on m.id = oc.membership_id and m.user_id = p.user_id
    and m.status in ('active', 'pending_activation')
  where q.case_id = oc.id
    and q.document_suspended_at is null and q.lifecycle_retired_at is null
    -- What document_obligation_blocked needs before it can say yes, read first so the check runs on few rows.
    and q.deadline_at <= now()
    and coalesce((q.lifecycle_settings ->> 'suspend_on_overdue')::boolean, false)
    and app_private.workspace_allows_interactive_access(oc.workspace_id)
    and app_private.document_obligation_blocked(q, now());
  get diagnostics suspended = row_count;
  return suspended;
end;
$$;
revoke all on function app_private.document_suspend_overdue() from public, anon, authenticated;

create or replace function public.documents_maintain_service(target_batch_size integer default 100, at_time timestamp with time zone default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare c public.employee_onboarding_cases%rowtype; r public.employee_onboarding_requirements%rowtype; u uuid; tz text; local_now timestamp;
 checked integer:=0; enqueued integer:=0; failed integer:=0; suspended integer; missing_count integer; days_left integer; expiry date; approved_on date; milestone integer;
begin
 if target_batch_size not between 1 and 500 or at_time is null then raise exception 'valid maintenance batch required' using errcode='22023'; end if;
 -- The restriction first, for every case and on its own: no reminder below can undo it.
 suspended:=app_private.document_suspend_overdue();
 -- Reminders: a batch of cases at a time, oldest checked first.
 for c in select oc.* from public.employee_onboarding_cases oc
  join public.employee_profiles p on p.id=oc.employee_id and p.workspace_id=oc.workspace_id and p.archived_at is null
  join public.workspace_memberships m on m.id=oc.membership_id and m.user_id=p.user_id and m.status in ('active','pending_activation')
  where app_private.workspace_allows_interactive_access(oc.workspace_id)
   and exists(select 1 from public.employee_onboarding_requirements q where q.case_id=oc.id and q.kind in ('document','acknowledgement') and q.lifecycle_retired_at is null)
  order by oc.document_notification_checked_at nulls first,oc.id limit target_batch_size for update of oc skip locked loop
  checked:=checked+1;
  -- Outside the case's block: a case that fails still moves to the back of the queue.
  update public.employee_onboarding_cases set document_notification_checked_at=at_time where id=c.id;
  begin
   select user_id into u from public.employee_profiles where id=c.employee_id;
   perform app_private.document_notify_access(c.workspace_id,c.employee_id,u);
   tz:=app_private.document_employee_timezone(c.workspace_id,c.employee_id);
   if tz is null then continue; end if;
   local_now:=at_time at time zone tz;
   if local_now::time<'09:00'::time then continue; end if;
   select count(*) into missing_count from public.employee_onboarding_requirements q
    where q.case_id=c.id and q.lifecycle_user_id=u and q.kind in ('document','acknowledgement') and q.lifecycle_retired_at is null
     and q.lifecycle_settings->>'mode'<>'optional' and not q.lifecycle_exempt and q.lifecycle_closed_at is null and q.status<>'superseded'
     and app_private.document_obligation_state(q,at_time) in ('missing','grace','rejected','expired')
     and not exists(select 1 from public.employee_document_submissions s where s.id=q.submitted_document_id and s.state='pending_review');
   if missing_count>0 and app_private.enqueue_document_notification(c.workspace_id,c.employee_id,u,'missing:'||local_now::date::text,'missing','Documents need attention',format('%s outstanding document request(s). Open Documents for details.',missing_count)) then enqueued:=enqueued+1; end if;
   for r in select q.* from public.employee_onboarding_requirements q where q.case_id=c.id and q.lifecycle_user_id=u and q.lifecycle_retired_at is null
    and q.publication_paused_at is null and q.kind='document' and q.lifecycle_settings->>'mode'<>'optional' and not q.lifecycle_exempt and q.lifecycle_closed_at is null and q.status<>'superseded' and q.approved_document_id is not null
    and not exists(select 1 from public.employee_document_submissions s where s.id=q.submitted_document_id and s.state='pending_review') loop
    select s.expiry_date,(s.reviewed_at at time zone tz)::date into expiry,approved_on from public.employee_document_submissions s where s.id=r.approved_document_id and s.state='accepted';
    days_left:=expiry-local_now::date;
    milestone:=case when days_left between 1 and 1 then 1 when days_left between 2 and 7 then 7 when days_left between 8 and 30 then 30 end;
    -- Parenthesised: PL/pgSQL reads an IF condition up to the first THEN outside parentheses.
    if (case when milestone is null or approved_on>expiry-milestone then false
     else app_private.enqueue_document_notification(r.workspace_id,r.employee_id,u,'expiry:'||r.approved_document_id::text||':'||milestone::text,'expiry','Document expires soon',format('A document expires in %s day(s). Open Documents to renew it.',days_left),r.id) end)
    then enqueued:=enqueued+1; end if;
   end loop;
  exception when others then
   failed:=failed+1;
   raise warning 'documents_maintain_service: case % skipped: % (%)',c.id,sqlerrm,sqlstate;
  end;
 end loop;
 return jsonb_build_object('checked',checked,'enqueued',enqueued,'failed_cases',failed,'suspended',suspended);
end;
$$;

-- K3 ------------------------------------------------------------------------------------------------

-- The notification half takes the history row's id instead of writing the row; private_msg was only
-- written to the row, so it stays with shift_exchange_emit.
drop function public.shift_exchange_emit_notification_base(uuid, uuid, uuid, uuid, text, text, text);

create function public.shift_exchange_emit_notification_base(eid uuid, actor uuid, w uuid, cid uuid, aid uuid, act text, msg text)
returns void
language plpgsql
set search_path = ''
as $$
declare loc uuid; recipients uuid[]; reviewers uuid[]; c public.shift_exchange_cases%rowtype; recipient uuid; body text; offered jsonb;
begin
 select * into c from public.shift_exchange_cases where id=cid and workspace_id=w;
 loc:=(c.offered_snapshot->>'location_id')::uuid;
 select coalesce(array_agg(distinct e.user_id),'{}'::uuid[]) into recipients from public.employee_profiles e join public.workspace_memberships m on m.workspace_id=w and m.user_id=e.user_id and m.status='active'
 where e.workspace_id=w and e.archived_at is null and ((e.id=c.owner_id and act<>'other_selected') or exists(select 1 from public.shift_exchange_applications a where a.case_id=cid and a.employee_id=e.id and (aid is null or a.id=aid) and (act<>'terms_changed' or a.status in ('invited','pending_manager')))) and e.user_id is distinct from actor;
 foreach recipient in array recipients loop
  body:=case when act='transfer_completed' then
   case when c.kind='swap' then 'Your swap is approved. Your updated shifts are now your responsibility. Open your schedule to review both changes.'
    when exists(select 1 from public.employee_profiles e where e.id=c.owner_id and e.user_id=recipient) then 'Your cover is approved. You are no longer responsible for this shift.'
    else 'Your pickup is approved. This shift is now assigned to you and is your responsibility.' end
   -- BL-910: a declined application's reason is written for the applicant alone.
   when act='application_rejected' and not exists(select 1 from public.shift_exchange_applications a join public.employee_profiles e on e.id=a.employee_id
    where a.id=aid and e.user_id=recipient) then 'A request for your shift was declined. You are still responsible for this shift.'
   else msg end;
  perform public.enqueue_notification_outbox_service(w,gen_random_uuid(),'requests.shift_change.status_changed',1,actor,'shift_exchange_cases',cid::text,
   jsonb_build_object('correlation_id',eid,'request_id',cid,'request_event_id',eid,'request_action',act,'location_id',loc,'location_ids',jsonb_build_array(loc),'recipient_user_ids',jsonb_build_array(recipient),
   'audience_contract','shift_change_participants','category','request','title',case when act='transfer_completed' then 'Shift change approved' when act='other_selected' then 'Another teammate was selected' when act='peer_invited' then 'A teammate needs your response' else 'Shift request updated' end,
   'body',body,'safe_preview','A shift request was updated.','action_url','/app/employee-hub/shift-hub?case='||cid::text||'&hub_view=requests','group_key','shift_exchange:'||cid::text),now());
 end loop;
 if act='cover_opened' then
  offered:=public.shift_exchange_shift(w,c.offered_source_id);
  select coalesce(array_agg(e.user_id),'{}'::uuid[]) into recipients from public.employee_profiles e
   join public.workspace_memberships m on m.workspace_id=w and m.user_id=e.user_id and m.status='active'
   where e.workspace_id=w and e.archived_at is null and e.id<>c.owner_id and app_private.eligibility(w,e.id,offered,'{"operation":"release_pickup"}')->>'status'='eligible';
  if cardinality(recipients)>0 then
   perform public.enqueue_notification_outbox_service(w,gen_random_uuid(),'requests.shift_change.status_changed',1,actor,'shift_exchange_cases',cid::text,
    jsonb_build_object('correlation_id',eid,'request_id',cid,'request_event_id',eid,'request_action',act,'location_id',loc,'location_ids',jsonb_build_array(loc),'recipient_user_ids',to_jsonb(recipients),
    'audience_contract','eligible_shift_cover_candidates','category','request','title','A shift is available for cover','body',(offered->>'location_name')||' · '||(offered->>'date')||' · '||(offered->>'start_time')||'–'||(offered->>'end_time')||'. Apply in Shift Hub; final assignment requires manager approval.',
    'safe_preview','A teammate is looking for cover.','action_url','/app/employee-hub/shift-hub?hub_view=available&q='||(offered->>'date'),'group_key','shift_exchange_available:'||cid::text),now());
  end if;
 end if;
 if act in('application_submitted','peer_accepted','scope_approved') or
  (act='terms_changed' and exists(select 1 from public.shift_exchange_applications where case_id=cid and status='pending_manager')) then
 -- K-S4: the people who decide the case at each location, its managers when
 -- it has any who may; else the admins and the owner who may (D3, K-S1).
 with place as (
  select distinct x loc from unnest(array_remove(array[loc,(c.requested_snapshot->>'location_id')::uuid],null)) x
 ), decider as (
  select m.user_id,place.loc,(app_private.actor(m.user_id,w)).class cls
  from public.workspace_memberships m cross join place
  where m.workspace_id=w and m.status='active' and m.user_id is distinct from actor
   and not exists(select 1 from public.shift_exchange_applications a where a.case_id=cid
    and (a.id=aid or (act='terms_changed' and a.status='pending_manager'))
    and app_private.exchange_decision_reason(m.user_id,w,c.owner_id,a.employee_id,place.loc) is not null)
   and app_private.exchange_decision_reason(m.user_id,w,c.owner_id,null,place.loc) is null
 )
 select coalesce(array_agg(distinct d.user_id),'{}'::uuid[]) into reviewers from decider d
 where d.cls='manager' or not exists(select 1 from decider x where x.loc=d.loc and x.cls='manager');
 if cardinality(reviewers)>0 then
 perform public.enqueue_notification_outbox_service(w,gen_random_uuid(),'requests.shift_change.submitted',1,actor,'shift_exchange_cases',cid::text,
 jsonb_build_object('correlation_id',eid,'request_id',cid,'request_event_id',eid,'request_action',act,'location_ids',to_jsonb(array_remove(array[loc,(c.requested_snapshot->>'location_id')::uuid],null)),'recipient_user_ids',to_jsonb(reviewers),
 'audience_contract','schedule_request_reviewers','category','request','title','Shift change ready for review','body','A teammate is ready. Review the candidates before approving.',
 'safe_preview','A shift request needs review.','action_url','/app/schedule/requests?tab=shift-changes&case='||cid::text,'group_key','shift_exchange_review:'||cid::text),now());
 end if;
 end if;
end; $$;
revoke all on function public.shift_exchange_emit_notification_base(uuid, uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;

create or replace function public.shift_exchange_emit(actor uuid, w uuid, cid uuid, aid uuid, act text, msg text, private_msg text default '')
returns void
language plpgsql
set search_path = ''
as $$
declare eid uuid;
begin
 -- The case's history (Shift Hub, Requests): one row per step, whatever is told about it.
 insert into public.shift_exchange_events(workspace_id,case_id,application_id,actor_user_id,action,message,private_note)
 values(w,cid,aid,actor,act,msg,private_msg) returning id into eid;
 perform public.shift_exchange_emit_notification_base(eid,actor,w,cid,aid,act,msg);
 perform public.shift_exchange_sync_notifications(w,cid);
end; $$;

-- K4 ------------------------------------------------------------------------------------------------

-- The account security events the API observes (Supabase Auth makes the change), written to the audit
-- trail. The account notification follows from the audit row by its trigger, until the teardown.
create function public.record_account_security_event_service(actor_user_id uuid, target_event text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
 if target_event is null or target_event not in ('account.email_change_requested','account.password_changed','account.sessions_revoked') then
  raise exception 'unsupported account security event' using errcode='22023';
 end if;
 if actor_user_id is null or not exists(select 1 from auth.users u where u.id=actor_user_id and u.deleted_at is null) then
  raise exception 'account session required' using errcode='42501', hint='authz.not_active';
 end if;
 return app_private.record_security_audit_event_service(actor_user_id,null,target_event,'account.security','auth_user',actor_user_id::text,'{}');
end; $$;
revoke all on function public.record_account_security_event_service(uuid, text) from public, anon, authenticated;
grant execute on function public.record_account_security_event_service(uuid, text) to service_role;

-- K1 + K2: their own cron -------------------------------------------------------------------------------

-- Every minute, as they ran inside the notification worker. Same dispatcher and Vault secrets as the
-- other cron routes (20260918120000), so a database without them stays quiet.
select cron.unschedule(jobid) from cron.job where jobname = 'maintenance';
select cron.schedule(
  'maintenance',
  '* * * * *',
  $$select app_private.dispatch_cron_endpoint('/api/internal/cron/maintenance');$$
);
