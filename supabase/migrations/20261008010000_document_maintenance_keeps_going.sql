-- BL-965: an approved document that tracks no expiry has no expiry date, so days_left is NULL.
-- `NULL in (30,7,1) and enqueue(...)` still calls enqueue (NULL AND x needs x), with a NULL dedup key,
-- the insert fails and the whole maintenance call rolls back for every workspace: no reminders, no
-- suspensions. Only that condition changes; the body is otherwise the current definition.

CREATE OR REPLACE FUNCTION "public"."documents_maintain_service"("target_batch_size" integer DEFAULT 100, "at_time" timestamp with time zone DEFAULT "now"()) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare c public.employee_onboarding_cases%rowtype; r public.employee_onboarding_requirements%rowtype; u uuid; tz text; local_now timestamp;
 checked integer:=0; enqueued integer:=0; missing_count integer; days_left integer; expiry date;
begin
 if target_batch_size not between 1 and 500 or at_time is null then raise exception 'valid maintenance batch required' using errcode='22023'; end if;
 for c in select oc.* from public.employee_onboarding_cases oc
  join public.employee_profiles p on p.id=oc.employee_id and p.workspace_id=oc.workspace_id and p.archived_at is null
  join public.workspace_memberships m on m.id=oc.membership_id and m.user_id=p.user_id and m.status in ('active','pending_activation')
  where app_private.workspace_allows_interactive_access(oc.workspace_id)
   and exists(select 1 from public.employee_onboarding_requirements q where q.case_id=oc.id and q.kind in ('document','acknowledgement') and q.lifecycle_retired_at is null)
  order by oc.document_notification_checked_at nulls first,oc.id limit target_batch_size for update of oc skip locked loop
  checked:=checked+1;
  select user_id into u from public.employee_profiles where id=c.employee_id;
  update public.employee_onboarding_cases set document_notification_checked_at=at_time where id=c.id;
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
   select expiry_date into expiry from public.employee_document_submissions where id=r.approved_document_id and state='accepted';
   days_left:=expiry-local_now::date;
   if days_left is not null and days_left in (30,7,1) and app_private.enqueue_document_notification(r.workspace_id,r.employee_id,u,'expiry:'||r.approved_document_id::text||':'||days_left::text,'expiry','Document expires soon',format('A document expires in %s day(s). Open Documents to renew it.',days_left),r.id) then enqueued:=enqueued+1; end if;
  end loop;
 end loop;
 return jsonb_build_object('checked',checked,'enqueued',enqueued);
end;
$$;
