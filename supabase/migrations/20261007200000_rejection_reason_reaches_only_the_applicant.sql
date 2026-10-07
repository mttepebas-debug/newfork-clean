-- BL-910 (EKRAN-02 #108): the reason a manager writes when declining an
-- application ("Provide a reason visible to this employee") reaches the
-- applicant alone. The owner who gave the shift up, and anyone else told
-- about the decline, read a general sentence instead: in the notification
-- (shift_exchange_emit_notification_base) and in the case's history as
-- Shift Hub and Requests read it (app_private.shift_exchange_case_item).
-- Example: Emre gives up his Monday shift, Ali applies, Ayse declines with
-- "You were late twice this month"; Ali reads it, Emre does not.
-- Test: shift_exchange_rejection_reason_stays_with_the_applicant.test.sql.

CREATE OR REPLACE FUNCTION public.shift_exchange_emit_notification_base(actor uuid, w uuid, cid uuid, aid uuid, act text, msg text, private_msg text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare eid uuid; loc uuid; recipients uuid[]; reviewers uuid[]; c public.shift_exchange_cases%rowtype; recipient uuid; body text; destination text; offered jsonb;
begin
 select * into c from public.shift_exchange_cases where id=cid and workspace_id=w;
 loc:=(c.offered_snapshot->>'location_id')::uuid;
 insert into public.shift_exchange_events(workspace_id,case_id,application_id,actor_user_id,action,message,private_note)
 values(w,cid,aid,actor,act,msg,private_msg) returning id into eid;
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
end; $function$;

create or replace function app_private.shift_exchange_case_item(actor uuid, w uuid, c public.shift_exchange_cases, allowed boolean,
 emp_id uuid, published_offered jsonb, published_requested jsonb, live_status text)
returns jsonb language plpgsql set search_path = '' as $function$
declare s jsonb := coalesce(published_offered, c.offered_snapshot); t jsonb := coalesce(published_requested, c.requested_snapshot);
 current_published boolean := published_offered is not null; requested_published boolean := published_requested is not null;
 decides boolean; mine boolean := coalesce(c.owner_id = emp_id, false); apps jsonb; hist jsonb; stage text;
begin
  -- Who decides the case (D3, K-S1) gets its buttons and its private notes (K-S5).
  decides:=allowed and exists(select 1 from unnest(array_remove(array[(c.offered_snapshot->>'location_id')::uuid,(c.requested_snapshot->>'location_id')::uuid],null)) x
   where app_private.exchange_decision_reason(actor,w,c.owner_id,null,x) is null);
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'employee_id',a.employee_id,'employee_name',coalesce(nullif(e.preferred_name,''),concat_ws(' ',e.first_name,e.last_name)),
   'status',case when live_status in('expired','invalidated') and a.status in('invited','pending_manager') then live_status else a.status end,'created_at',a.created_at,'reason',case when allowed or a.employee_id=emp_id then a.reason else '' end,
   'eligibility',case when (allowed or a.employee_id=emp_id) and live_status='open' then (app_private.eligibility(w,a.employee_id,s,jsonb_build_object('operation',case when c.kind in ('swap','open_pickup') then c.kind when c.audience='direct' then 'cover_accept' else 'release_pickup' end,'consent',case when a.employee_id=emp_id and a.status='invited' then 'true'::jsonb else a.time_off_consent end,'excluded',to_jsonb(array_remove(array[(s->>'id')::uuid,(t->>'id')::uuid],null))))-case when allowed then '{}'::text[] else array['approval_flags'] end) || case when a.employee_id=emp_id and a.status='invited' then jsonb_build_object('availability_warning',public.weekly_exchange_employee_warning(w,emp_id,s)) else '{}'::jsonb end end) order by a.created_at),'[]'::jsonb)
  into apps from public.shift_exchange_applications a join public.employee_profiles e on e.id=a.employee_id where a.case_id=c.id and (allowed or mine or a.employee_id=emp_id);
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'created_at',e.created_at,
   -- BL-910: a declined application's reason is read by the applicant and by who decides.
   'message',case when e.action='application_rejected' and not allowed and not exists(select 1 from public.shift_exchange_applications a
    where a.id=e.application_id and a.employee_id=emp_id) then 'A request for your shift was declined. You are still responsible for this shift.' else e.message end,
   -- K-S5: the note goes to who decides this case for this application too.
   'private_note',case when decides and exists(select 1 from unnest(array_remove(array[(c.offered_snapshot->>'location_id')::uuid,(c.requested_snapshot->>'location_id')::uuid],null)) x
    where app_private.exchange_decision_reason(actor,w,c.owner_id,(select a.employee_id from public.shift_exchange_applications a where a.id=e.application_id),x) is null)
    then nullif(e.private_note,'') end) order by e.created_at),'[]'::jsonb)
  into hist from public.shift_exchange_events e where e.case_id=c.id and (allowed or mine or e.application_id is null or exists(select 1 from public.shift_exchange_applications a where a.id=e.application_id and a.employee_id=emp_id));
  stage:=case when live_status<>'open' then 'closed'
   when exists(select 1 from public.shift_exchange_votes where case_id=c.id) then 'awaiting_other_manager'
   when exists(select 1 from public.shift_exchange_applications where case_id=c.id and status='pending_manager') then 'ready_for_manager'
   when exists(select 1 from public.shift_exchange_applications where case_id=c.id and status='invited') then 'awaiting_peer' else 'seeking_candidates' end;
 return jsonb_build_object('id',c.id,'kind',c.kind,'audience',c.audience,'status',live_status,'current_published',current_published,'requested_current_published',case when c.kind='swap' then requested_published else null end,
   'stage',stage,'revision',c.revision,'created_at',c.created_at,'expires_at',c.expires_at,'owner_id',c.owner_id,'owner_name',c.offered_snapshot->'employee_name',
   'shift',s,'requested_shift',t,'applications',apps,'candidate_count',(select count(*) from public.shift_exchange_applications where case_id=c.id and status in('invited','pending_manager') and live_status='open'),
   'can_manage',decides,
   'is_owner',mine,'private_note',case when allowed or mine then c.private_note else '' end,'history',hist);
end; $function$;
