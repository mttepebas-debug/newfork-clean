-- FB-6.6, nf-guvenlik round 2, finding 1 (medium): an upload nobody reviewed
-- is its deciders' and its owner's (S2), whatever became of it. A renewal
-- replaced by another before review ends 'superseded' (only
-- submit_employee_document_lifecycle_service writes that state) and was
-- still listed, downloadable and in the history for a reader who may not
-- decide on it. One rule for the version list, the history and the download.
-- A separate migration so the review sees only this change.

-- Whether this reader sees this submission of somebody else's document:
-- reviewed (accepted, rejected) under M2; never reviewed (pending_review,
-- superseded) only if they may decide on it or own it; a draft never. A state
-- added later is hidden until it is named here.
create function app_private.document_submission_visible(actor uuid, r public.employee_onboarding_requirements, submission_state text)
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select submission_state in ('accepted', 'rejected')
    or (submission_state in ('pending_review', 'superseded') and app_private.document_sees_pending(actor, r));
$$;
revoke all on function app_private.document_submission_visible(uuid, public.employee_onboarding_requirements, text) from public, anon, authenticated;

create or replace function public.get_employee_document_lifecycle_service(actor_user_id uuid, target_workspace_id uuid, target_requirement_id uuid, self_only boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_onboarding_requirements%rowtype; submissions jsonb; history jsonb;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,case when self_only then 'documents.self' else 'documents.read' end,target_person=>(select q.employee_id from public.employee_onboarding_requirements q where q.id=target_requirement_id and q.workspace_id=target_workspace_id and q.kind in ('document','acknowledgement')));
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id and workspace_id=target_workspace_id and kind in ('document','acknowledgement');
 if r.id is null or self_only is null or (self_only and r.lifecycle_user_id is distinct from actor_user_id)
 then raise exception 'document unavailable' using errcode='P0002'; end if;
 -- A document waiting for review is its decider's and its owner's (S2).
 if not self_only and not app_private.document_row_readable(actor_user_id, r) then
  raise exception 'Not allowed' using errcode='42501', hint='authz.out_of_scope', detail='documents.read';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'version',s.version,'state',s.state,'submitted_at',s.submitted_at,
  'reviewed_at',s.reviewed_at,'expiry_date',s.expiry_date,'metadata',s.metadata,'rejection_reason',s.rejection_reason,
  'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'filename',f.original_filename,'media_type',f.media_type,'size_bytes',f.size_bytes,'decision',sf.decision,'note',sf.note) order by f.created_at,f.id)
   from public.employee_document_submission_files sf join public.employee_documents f on f.id=sf.file_id where sf.submission_id=s.id),'[]')) order by s.version desc),'[]')
 into submissions from public.employee_document_submissions s where s.requirement_id=r.id
  and (self_only or app_private.document_submission_visible(actor_user_id,r,s.state));
 select coalesce(jsonb_agg(jsonb_build_object('id',ev.id,'action',ev.action,'occurred_at',ev.occurred_at,'metadata',ev.metadata) order by ev.occurred_at desc),'[]') into history
 from public.onboarding_events ev where ev.workspace_id=r.workspace_id and ev.employee_id=r.employee_id and ev.target_id=r.id::text
  and (self_only or not exists(select 1 from public.employee_document_submissions s
   where s.id::text=ev.metadata->>'submission_id'
    and not app_private.document_submission_visible(get_employee_document_lifecycle_service.actor_user_id,r,s.state)));
 return jsonb_build_object('obligation',app_private.document_obligation_json(app_private.document_view(actor_user_id,r)),'submissions',submissions,'history',history,'policy',case when r.kind='acknowledgement' then jsonb_build_object('content_text',r.source_snapshot->>'content_text','content_digest',r.source_snapshot->>'content_digest','intent_statement',r.source_snapshot->>'intent_statement','can_withdraw',self_only and exists(select 1 from public.employee_onboarding_cases c join public.workspace_memberships m on m.id=c.membership_id where c.id=r.case_id and c.submitted_at is null and c.status='in_progress' and m.status='pending_activation' and r.lifecycle_retired_at is null),'history',coalesce((select jsonb_agg(jsonb_build_object('typed_name',a.typed_name,'executed_at',a.executed_at,'withdrawn_at',a.withdrawn_at,'content_digest',a.content_digest) order by a.executed_at,a.id) from public.employee_acknowledgement_envelopes a where a.requirement_id=r.id and (not self_only or a.user_id=actor_user_id)),'[]'::jsonb),'evidence',(select jsonb_build_object('typed_name',a.typed_name,'executed_at',a.executed_at,'content_digest',a.content_digest,'intent_statement',a.intent_statement) from public.employee_acknowledgement_envelopes a where a.requirement_id=r.id and a.withdrawn_at is null and (not self_only or a.user_id=actor_user_id))) end,'initial_deferral',jsonb_build_object('reason',r.conditional_reason,'allowed',self_only and r.kind='document' and r.lifecycle_settings->>'mode'='conditional' and r.submitted_document_id is null and not r.lifecycle_exempt and r.lifecycle_closed_at is null and not exists(select 1 from public.employee_document_submissions s where s.requirement_id=r.id and s.state<>'draft') and exists(select 1 from public.employee_onboarding_cases c join public.workspace_memberships m on m.id=c.membership_id where c.id=r.case_id and m.status='pending_activation')),'timezone_settings',(select jsonb_build_object('value',app_private.document_employee_timezone(r.workspace_id,r.employee_id),'configured_value',p.document_timezone,'employee_revision',p.revision,'can_manage',not self_only and (p.is_remote or p.is_excluded_from_schedule) and app_private.document_timezone_admin(actor_user_id,r.workspace_id,r.employee_id) and not exists(select 1 from public.employee_location_assignments a join public.locations l on l.id=a.location_id and l.workspace_id=a.workspace_id and l.archived_at is null where a.workspace_id=r.workspace_id and a.employee_id=r.employee_id and a.ended_at is null and a.is_primary)) from public.employee_profiles p where p.id=r.employee_id));
end;
$function$;

create or replace function public.get_employee_document_lifecycle_path_service(actor_user_id uuid, target_workspace_id uuid, target_requirement_id uuid, target_submission_id uuid, target_file_id uuid, self_only boolean)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare detail jsonb; path text;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,case when self_only then 'documents.self' else 'documents.read' end,target_person=>(select q.employee_id from public.employee_onboarding_requirements q where q.id=target_requirement_id and q.workspace_id=target_workspace_id and q.kind in ('document','acknowledgement')));
 detail:=public.get_employee_document_lifecycle_service(actor_user_id,target_workspace_id,target_requirement_id,self_only);
 select f.object_path into path from public.employee_document_submission_files sf
 join public.employee_document_submissions s on s.id=sf.submission_id join public.employee_documents f on f.id=sf.file_id
 where sf.requirement_id=target_requirement_id and sf.workspace_id=target_workspace_id and sf.submission_id=target_submission_id and sf.file_id=target_file_id and sf.decision='keep'
 and (self_only or app_private.document_submission_visible(actor_user_id,
  (select q from public.employee_onboarding_requirements q where q.id=target_requirement_id),s.state));
 if path is null then raise exception 'document file unavailable' using errcode='P0002'; end if;
 return path;
end;
$function$;
