-- BL-559: a person without a primary location (the owner, for one) could not submit an
-- expiring document: documents read only the primary location, while time off falls back to
-- the earliest live location. Mert, 2026-10-19: documents follow the time-off rule.
-- The admin's document timezone now applies only to a person with no live location, so the
-- setter and the drawer's can_manage ask the same helper.

CREATE OR REPLACE FUNCTION "app_private"."document_employee_timezone"("w" "uuid", "e" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare zone text;
begin
 -- One rule with time off: the primary location, else the earliest live location;
 -- only a person with no live location falls back to the admin's document timezone.
 zone := app_private.time_off_timezone(w, e);
 if zone is null then
  select document_timezone into zone from public.employee_profiles where workspace_id=w and id=e and (is_remote or is_excluded_from_schedule);
 end if;
 if zone is not null and (zone='UTC' or zone~'^[A-Za-z_]+/[A-Za-z0-9_+/-]+$') and app_private.timezone_name_valid(zone) then return zone; end if;
 return null;
end;
$_$;

CREATE OR REPLACE FUNCTION "public"."set_employee_document_timezone_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_requirement_id" "uuid", "expected_employee_revision" integer, "reference_timezone" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare r public.employee_onboarding_requirements%rowtype; e public.employee_profiles%rowtype;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,'employee.save',target_person=>(select q.employee_id from public.employee_onboarding_requirements q where q.id=target_requirement_id and q.workspace_id=target_workspace_id));
 perform app_private.authorize(actor_user_id,target_workspace_id,'settings.documents.write');
 select * into r from public.employee_onboarding_requirements where workspace_id=target_workspace_id and id=target_requirement_id;
 if r.id is null then raise exception 'document unavailable' using errcode='P0002'; end if;
 select * into e from public.employee_profiles where id=r.employee_id and workspace_id=r.workspace_id for update;
 if e.revision is distinct from expected_employee_revision then raise exception 'employee changed; refresh required' using errcode='PT409',hint='employee.revision_conflict'; end if;
 if not (e.is_remote or e.is_excluded_from_schedule) or app_private.time_off_timezone(e.workspace_id,e.id) is not null
 then raise exception 'an active location controls the document timezone' using errcode='22023'; end if;
 if reference_timezone is null or not (reference_timezone='UTC' or reference_timezone~'^[A-Za-z_]+/[A-Za-z0-9_+/-]+$') or not exists(select 1 from pg_catalog.pg_timezone_names where name=reference_timezone)
 then raise exception 'valid IANA timezone required' using errcode='22023'; end if;
 if e.document_timezone=reference_timezone then return e.revision; end if;
 update public.employee_profiles set document_timezone=reference_timezone,revision=revision+1,updated_at=now() where id=e.id returning revision into expected_employee_revision;
 perform app_private.document_audit(r,actor_user_id,'document.reference_timezone_changed',jsonb_build_object('previous',e.document_timezone,'timezone',reference_timezone,'employee_revision',expected_employee_revision));
 return expected_employee_revision;
end;
$_$;

CREATE OR REPLACE FUNCTION "public"."get_employee_document_lifecycle_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_requirement_id" "uuid", "self_only" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
 return jsonb_build_object('obligation',app_private.document_obligation_json(app_private.document_view(actor_user_id,r)),'submissions',submissions,'history',history,'policy',case when r.kind='acknowledgement' then jsonb_build_object('content_text',r.source_snapshot->>'content_text','content_digest',r.source_snapshot->>'content_digest','intent_statement',r.source_snapshot->>'intent_statement','can_withdraw',self_only and exists(select 1 from public.employee_onboarding_cases c join public.workspace_memberships m on m.id=c.membership_id where c.id=r.case_id and c.submitted_at is null and c.status='in_progress' and m.status='pending_activation' and r.lifecycle_retired_at is null),'history',coalesce((select jsonb_agg(jsonb_build_object('typed_name',a.typed_name,'executed_at',a.executed_at,'withdrawn_at',a.withdrawn_at,'content_digest',a.content_digest) order by a.executed_at,a.id) from public.employee_acknowledgement_envelopes a where a.requirement_id=r.id and (not self_only or a.user_id=actor_user_id)),'[]'::jsonb),'evidence',(select jsonb_build_object('typed_name',a.typed_name,'executed_at',a.executed_at,'content_digest',a.content_digest,'intent_statement',a.intent_statement) from public.employee_acknowledgement_envelopes a where a.requirement_id=r.id and a.withdrawn_at is null and (not self_only or a.user_id=actor_user_id))) end,'initial_deferral',jsonb_build_object('reason',r.conditional_reason,'allowed',self_only and r.kind='document' and r.lifecycle_settings->>'mode'='conditional' and r.submitted_document_id is null and not r.lifecycle_exempt and r.lifecycle_closed_at is null and not exists(select 1 from public.employee_document_submissions s where s.requirement_id=r.id and s.state<>'draft') and exists(select 1 from public.employee_onboarding_cases c join public.workspace_memberships m on m.id=c.membership_id where c.id=r.case_id and m.status='pending_activation')),'timezone_settings',(select jsonb_build_object('value',app_private.document_employee_timezone(r.workspace_id,r.employee_id),'configured_value',p.document_timezone,'employee_revision',p.revision,'can_manage',not self_only and (p.is_remote or p.is_excluded_from_schedule) and app_private.document_timezone_admin(actor_user_id,r.workspace_id,r.employee_id) and app_private.time_off_timezone(r.workspace_id,r.employee_id) is null) from public.employee_profiles p where p.id=r.employee_id));
end;
$$;
