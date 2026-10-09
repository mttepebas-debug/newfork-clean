-- FB-6.6, nf-guvenlik round 1, two low findings.
--   #3 the onboarding review counts only the rows its reader sees: a document
--      waiting for review that the reader may not decide on is neither listed
--      nor counted in progress_total / progress_completed (S2; a count is
--      information too).
--   #4 one's own onboarding read asks the core about the workspace of the case
--      it reads (by_case), as save, submit and leave do.
--   S2, as Mert chose it: a pending document is its deciders' and its owner's,
--      an approved one is seen under M2. A new upload waiting for review over a
--      valid approval hides only the new upload (its files, its download, its
--      history, the "waiting" state and the paused clock); the approved
--      version and its state stay visible. A document with nothing approved
--      yet stays hidden whole while it waits.

-- Whoever sees what waits for review on this row: its owner and its deciders.
create function app_private.document_sees_pending(actor uuid, r public.employee_onboarding_requirements)
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select r.lifecycle_user_id = actor
    or app_private.authz_reason(actor, r.workspace_id, 'documents.review', null, r.employee_id) is null;
$$;
revoke all on function app_private.document_sees_pending(uuid, public.employee_onboarding_requirements) from public, anon, authenticated;

-- The row as this actor sees it: without the upload waiting for review when
-- they may not see it.
create function app_private.document_view(actor uuid, r public.employee_onboarding_requirements)
returns public.employee_onboarding_requirements
language plpgsql
stable security definer
set search_path = ''
as $$
begin
  if r.kind <> 'document' or r.submitted_document_id is null
    or not exists (select 1 from public.employee_document_submissions s
                   where s.id = r.submitted_document_id and s.state = 'pending_review')
    or app_private.document_sees_pending(actor, r) then
    return r;
  end if;
  r.submitted_document_id := null;
  r.paused_remaining_seconds := null;
  r.status := case when app_private.document_obligation_state(r, now()) = 'completed'
    then 'completed' else 'in_progress' end::public.employee_onboarding_requirement_status;
  return r;
end;
$$;
revoke all on function app_private.document_view(uuid, public.employee_onboarding_requirements) from public, anon, authenticated;

-- Hidden whole only while it waits with nothing approved to show.
create or replace function app_private.document_row_readable(actor uuid, r public.employee_onboarding_requirements)
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select app_private.document_actor_can_read(actor, r.workspace_id, r.employee_id, r.lifecycle_user_id)
    and (r.approved_document_id is not null
      or not exists (
        select 1 from public.employee_document_submissions s
        where s.id = r.submitted_document_id and s.state = 'pending_review')
      or app_private.document_sees_pending(actor, r));
$$;

create or replace function public.get_employee_onboarding_review_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_case public.employee_onboarding_cases%rowtype; requirement_rows jsonb; total_count integer; completed_count integer;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'onboarding.review', target_person => target_employee_id);
  select * into target_case from public.employee_onboarding_cases
  where workspace_id = target_workspace_id and employee_id = target_employee_id;
  if target_case.id is null then raise exception 'onboarding case unavailable' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', requirement.id, 'kind', requirement.kind, 'title', requirement.title,
    'description', requirement.description, 'status', (app_private.document_view(actor_user_id, requirement)).status,
    'required', requirement.required, 'blocks_activation', requirement.blocks_activation,
    'requires_review', requirement.requires_review, 'sort_order', requirement.sort_order,
    'source_id', requirement.source_id,
    'accepted_formats', coalesce(requirement.source_snapshot->'accepted_formats', '[]'::jsonb),
    'content_text', null, 'content_digest', requirement.source_snapshot->>'content_digest',
    'intent_statement', null, 'rejection_reason', requirement.rejection_reason
  ) order by requirement.sort_order), '[]'::jsonb),
  count(*) filter (where requirement.required),
  count(*) filter (where requirement.required and (app_private.document_view(actor_user_id, requirement)).status = 'completed')
  into requirement_rows, total_count, completed_count
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id and requirement.status <> 'superseded' and requirement.lifecycle_retired_at is null
    -- a row the reader may not see is not counted either (S2)
    and (requirement.kind <> 'document' or app_private.document_row_readable(actor_user_id, requirement));
  return jsonb_build_object(
    'case_id', target_case.id, 'employee_id', target_case.employee_id,
    'case_status', target_case.status, 'revision', target_case.revision,
    'submitted_at', target_case.submitted_at,
    'progress_completed', completed_count, 'progress_total', total_count,
    'ssn_present', false,
    'requirements', requirement_rows
  );
end;
$function$;

create or replace function public.get_employee_onboarding_service(target_user_id uuid, target_workspace_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_case public.employee_onboarding_cases%rowtype;
  employee public.employee_profiles%rowtype;
  membership public.workspace_memberships%rowtype;
  profile jsonb;
  requirements jsonb;
  completed_count integer;
  total_count integer;
  first_path text;
begin
 perform app_private.authorize(target_user_id, app_private.onboarding_self_workspace(target_user_id, target_workspace_id, true), 'onboarding.self');
  perform app_private.initialize_employee_onboarding(target_user_id, target_workspace_id);
  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  where onboarding.id = app_private.employee_onboarding_case_id(target_user_id, target_workspace_id);
  if target_case.id is null then
    raise exception 'employee onboarding is unavailable' using errcode = 'P0002';
  end if;
  select * into employee from public.employee_profiles where id = target_case.employee_id;
  select * into membership from public.workspace_memberships where id = target_case.membership_id;

  select to_jsonb(private_profile) - 'created_at' - 'updated_at' - 'employee_id' - 'workspace_id'
  into profile from public.employee_private_profiles private_profile
  where private_profile.employee_id = employee.id;
  profile := coalesce(
    profile,
    jsonb_build_object(
      'legal_first_name', employee.first_name,
      'legal_last_name', employee.last_name
    )
  );


  select coalesce(jsonb_agg(jsonb_build_object(
    'id', requirement.id,
    'kind', requirement.kind,
    'title', requirement.title,
    'description', requirement.description,
    'status', requirement.status,
    'required', requirement.required,'document_mode',requirement.lifecycle_settings->>'mode', 'conditional_reason',requirement.conditional_reason,
    'blocks_activation', requirement.blocks_activation,
    'requires_review', requirement.requires_review,
    'sort_order', requirement.sort_order,
    'source_id', requirement.source_id,
    'accepted_formats', coalesce(requirement.source_snapshot->'accepted_formats', '[]'::jsonb),
    'content_text', requirement.source_snapshot->>'content_text',
    'content_digest', requirement.source_snapshot->>'content_digest',
    'intent_statement', requirement.source_snapshot->>'intent_statement',
    'rejection_reason', requirement.rejection_reason
  ) order by requirement.sort_order, requirement.id), '[]'::jsonb),
  count(*) filter (where requirement.required or (requirement.kind='document' and requirement.lifecycle_settings->>'mode'='conditional')),
  count(*) filter (where (requirement.required and requirement.status in ('completed', 'awaiting_review')) or (requirement.kind='document' and requirement.lifecycle_settings->>'mode'='conditional' and not app_private.document_initial_action_missing(requirement)))
  into requirements, total_count, completed_count
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id and requirement.status <> 'superseded' and requirement.lifecycle_retired_at is null and (requirement.kind<>'document' or (not requirement.lifecycle_exempt and requirement.lifecycle_closed_at is null));

  select case requirement.kind
    when 'profile' then '/welcome/profile'
    when 'ssn' then '/welcome/review'
    when 'document' then '/welcome/documents/' || requirement.id
    when 'acknowledgement' then '/welcome/acknowledgements/' || requirement.id
    when 'availability' then '/welcome/availability'
  end into first_path
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id
    and (requirement.required or app_private.document_initial_action_missing(requirement))
    and requirement.status in ('not_started', 'in_progress', 'rejected', 'manual_follow_up')
  order by case when requirement.status = 'rejected' then 0 else 1 end,
    requirement.sort_order, requirement.id
  limit 1;
  first_path := coalesce(first_path,
    case when target_case.status = 'approved' then '/app/employee-hub' else '/welcome/review' end);

  return jsonb_build_object(
    'case_id', target_case.id,
    'workspace_id', target_case.workspace_id,
    'workspace_name', (select name from public.workspaces where id = target_case.workspace_id),
    'employee_id', employee.id,
    'employee_name', concat_ws(' ', employee.first_name, employee.last_name),
    'membership_id', membership.id,
    'membership_status', membership.status,
    'case_status', target_case.status,
    'revision', target_case.revision,
    'progress_completed', completed_count,
    'progress_total', total_count,
    'first_actionable_path', first_path,
    'ssn_status', jsonb_build_object(
      'present', false,
      'last_four', null
    ),
    'profile', profile,
    'assignments', jsonb_build_object(
      'locations', coalesce((select jsonb_agg(location.name order by assignment.is_primary desc, location.name)
        from public.employee_location_assignments assignment join public.locations location on location.id = assignment.location_id
        where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb),
      'jobs', coalesce((select jsonb_agg(job.name order by assignment.is_primary desc, lower(job.name), job.id)
        from public.employee_job_assignments assignment join public.jobs job on job.id = assignment.job_id
        where assignment.employee_id = employee.id and assignment.ended_at is null), '[]'::jsonb)
    ),
    'requirements', requirements
  );
end;
$function$;

create or replace function public.list_employee_document_lifecycle_service(actor_user_id uuid, target_workspace_id uuid, self_only boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,case when self_only then 'documents.self' else 'documents.read' end,
  target_locations=>case when self_only then null else app_private.scope_set(actor_user_id,target_workspace_id,'documents.read') end);
 if self_only is null then raise exception 'document audience required' using errcode='22023'; end if;
 return (select coalesce(jsonb_agg(app_private.document_obligation_json(app_private.document_view(actor_user_id,r)) order by r.sort_order,r.id),'[]')
 from public.employee_onboarding_requirements r where r.workspace_id=target_workspace_id and r.kind in ('document','acknowledgement')
 and (not self_only or r.lifecycle_user_id=actor_user_id)
 and app_private.document_row_readable(actor_user_id,r));
end;
$function$;

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
 into submissions from public.employee_document_submissions s where s.requirement_id=r.id and (self_only or s.state<>'draft')
  and (s.state<>'pending_review' or app_private.document_sees_pending(actor_user_id,r));
 select coalesce(jsonb_agg(jsonb_build_object('id',ev.id,'action',ev.action,'occurred_at',ev.occurred_at,'metadata',ev.metadata) order by ev.occurred_at desc),'[]') into history
 from public.onboarding_events ev where ev.workspace_id=r.workspace_id and ev.employee_id=r.employee_id and ev.target_id=r.id::text
  and (app_private.document_sees_pending(get_employee_document_lifecycle_service.actor_user_id,r) or not exists(select 1 from public.employee_document_submissions s
   where s.id::text=ev.metadata->>'submission_id' and s.state='pending_review'));
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
 and (self_only or s.state<>'draft')
 and (s.state<>'pending_review' or app_private.document_sees_pending(actor_user_id,
  (select q from public.employee_onboarding_requirements q where q.id=target_requirement_id)));
 if path is null then raise exception 'document file unavailable' using errcode='P0002'; end if;
 return path;
end;
$function$;
