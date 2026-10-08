-- BL-965: document maintenance kept going for no workspace.
-- 1. An approved document that tracks no expiry has no expiry date, so days_left was NULL, and
--    `NULL in (30,7,1) and enqueue(...)` still called enqueue (NULL AND x needs x) with a NULL dedup key:
--    the insert failed and the whole call rolled back for every workspace, every minute.
-- 2. Any error in one case did the same, and since the rollback also undid that case's checked mark,
--    it stayed at the head of the queue and failed first on every later run. Each case now runs in its
--    own block: a failing case is skipped and counted (failed_cases), its work is undone, a warning
--    names it in the database log, and its checked mark (set before the block) sends it to the back.
-- 3. An expiry reminder went out only when the run fell on the exact day (30, 7 or 1 days left); a day
--    without a run lost it. Now the latest milestone the document has reached is sent once (the dedup
--    key is per milestone, as before), but only if the document was approved before that milestone, so
--    nothing new is sent on a normal day and no late 30-day note follows an approval with 20 days left.
-- The enqueue sits behind CASE: evaluation order is guaranteed there, not for AND.

CREATE OR REPLACE FUNCTION "public"."documents_maintain_service"("target_batch_size" integer DEFAULT 100, "at_time" timestamp with time zone DEFAULT "now"()) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare c public.employee_onboarding_cases%rowtype; r public.employee_onboarding_requirements%rowtype; u uuid; tz text; local_now timestamp;
 checked integer:=0; enqueued integer:=0; failed integer:=0; missing_count integer; days_left integer; expiry date; approved_on date; milestone integer;
begin
 if target_batch_size not between 1 and 500 or at_time is null then raise exception 'valid maintenance batch required' using errcode='22023'; end if;
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
   -- Current access is always evaluated with server time, independent of reminder test time.
   update public.employee_onboarding_requirements q set document_suspended_at=now()
    where q.case_id=c.id and q.document_suspended_at is null and q.lifecycle_retired_at is null and app_private.document_obligation_blocked(q,now());
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
 return jsonb_build_object('checked',checked,'enqueued',enqueued,'failed_cases',failed);
end;
$$;
