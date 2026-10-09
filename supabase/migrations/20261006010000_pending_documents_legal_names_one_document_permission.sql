-- FB-6.6 A1b: Mert's answers (2026-10-02 ~19:10Z) and one documents permission.
--
--   S1 only an owner or an admin approves a legal name typed in onboarding;
--      a manager does not, whatever permission their role carries. The core's
--      onboarding.legal_name is a workspace-wide write (no manager reaches one
--      under M2), one rank up and never one's own.
--   S2 a document waiting for review is seen by whoever may decide on it and
--      by its owner; once decided it is seen under M2 again.
--   signature_templates.read and .manage fold into documents.read and
--      .manage (KARARLAR K14 S3; CLAUDE.md §9 no twin): Settings > Documents
--      and Signature templates open with one pair of permissions. The action
--      settings.signature_templates.read keeps its name.

-- 1. S1 -----------------------------------------------------------------------------------

insert into app_private.authz_actions (key, scope_class, effect, permission_key, no_self, rank_below)
values ('onboarding.legal_name', 'org', 'write', 'employee_onboarding.review', true, true);

create or replace function public.review_employee_onboarding_before_availability_service(actor_user_id uuid, target_workspace_id uuid, target_employee_id uuid, review_action text, target_requirement_id uuid, review_reason text, expected_revision integer, production_ready boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_case public.employee_onboarding_cases%rowtype;
  requirement public.employee_onboarding_requirements%rowtype;
  private_profile public.employee_private_profiles%rowtype;
  target_employee_user_id uuid;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'onboarding.review', target_person => target_employee_id);

  select onboarding.* into target_case
  from public.employee_onboarding_cases onboarding
  where onboarding.workspace_id = target_workspace_id
    and onboarding.employee_id = target_employee_id
  for update of onboarding;
  if target_case.id is null or target_case.revision <> expected_revision then raise exception 'onboarding changed; refresh required' using errcode = '40001'; end if;
  select employee.user_id into target_employee_user_id
  from public.employee_profiles employee
  where employee.id = target_employee_id
    and employee.workspace_id = target_workspace_id;
  if review_action in ('accept_requirement', 'reject_requirement') then
    select * into requirement from public.employee_onboarding_requirements
    where id = target_requirement_id and case_id = target_case.id for update;
    if requirement.id is null or not requirement.requires_review then raise exception 'reviewable requirement unavailable' using errcode = 'P0002'; end if;
    if requirement.kind = 'document'::public.employee_onboarding_requirement_kind then
      perform app_private.authorize(actor_user_id, target_workspace_id, 'documents.review', target_person => target_employee_id);
    end if;
    -- A legal name is approved by an owner or an admin only (FB-6.6 S1).
    if requirement.kind = 'profile'::public.employee_onboarding_requirement_kind then
      perform app_private.authorize(actor_user_id, target_workspace_id, 'onboarding.legal_name', target_person => target_employee_id);
    end if;
    if review_action = 'reject_requirement' and char_length(btrim(coalesce(review_reason, ''))) not between 1 and 500 then
      raise exception 'specific correction reason required' using errcode = '22023';
    end if;
    update public.employee_onboarding_requirements set
      status = case
        when review_action = 'accept_requirement' then 'completed'::public.employee_onboarding_requirement_status
        else 'rejected'::public.employee_onboarding_requirement_status
      end,
      rejection_reason = case when review_action = 'reject_requirement' then btrim(review_reason) else null end,
      reviewed_by = actor_user_id,
      reviewed_at = now(),
      completed_at = case when review_action = 'accept_requirement' then now() else null end,
      updated_at = now()
    where id = requirement.id;
    if requirement.kind = 'document'::public.employee_onboarding_requirement_kind then
      update public.employee_documents set
        review_status = case
          when review_action = 'accept_requirement' then 'accepted'::public.employee_document_review_status
          else 'rejected'::public.employee_document_review_status
        end,
        rejection_reason = case when review_action = 'reject_requirement' then btrim(review_reason) else null end,
        reviewed_by = actor_user_id, reviewed_at = now()
      where requirement_id = requirement.id and review_status = 'awaiting_review'::public.employee_document_review_status;
    end if;
    if requirement.kind = 'profile'::public.employee_onboarding_requirement_kind and review_action = 'accept_requirement' then
      select * into private_profile
      from public.employee_private_profiles
      where employee_id = target_employee_id;
      if private_profile.employee_id is null then
        raise exception 'private profile unavailable' using errcode = 'P0002';
      end if;
      update public.employee_profiles set
        first_name = private_profile.legal_first_name,
        last_name = private_profile.legal_last_name,
        revision = revision + 1,
        updated_at = now()
      where id = target_employee_id;
      insert into public.employee_events (workspace_id, employee_id, actor_user_id, action, summary)
      values (target_workspace_id, target_employee_id, actor_user_id,
        'employee.legal_name_approved', 'Employee legal name change approved from onboarding');
    end if;
    if review_action = 'reject_requirement' then
      update public.employee_onboarding_cases set status = 'changes_requested'::public.employee_onboarding_case_status, revision = revision + 1,
        updated_at = now() where id = target_case.id returning revision into expected_revision;
    else
      update public.employee_onboarding_cases set revision = revision + 1, updated_at = now()
      where id = target_case.id returning revision into expected_revision;
      if target_case.status = 'submitted'::public.employee_onboarding_case_status
        and not public.employee_onboarding_final_approval_required(target_workspace_id)
        and not exists (
          select 1
          from public.employee_onboarding_requirements
          where case_id = target_case.id
            and required
            and blocks_activation
            and status <> 'completed'::public.employee_onboarding_requirement_status
        ) then
        expected_revision := app_private.activate_employee_onboarding_case(
          target_case.id,
          actor_user_id,
          'employee.auto_activated_after_review'
        );
      end if;
    end if;
  elsif review_action = 'activate' then
    if target_case.status <> 'submitted'::public.employee_onboarding_case_status then raise exception 'submitted onboarding required' using errcode = '23514'; end if;
    if not production_ready then raise exception 'sensitive infrastructure readiness required' using errcode = '55000'; end if;
    if exists (select 1 from public.employee_onboarding_requirements
      where case_id = target_case.id and required and blocks_activation and status <> 'completed'::public.employee_onboarding_requirement_status) then
      raise exception 'activation-blocking requirements remain' using errcode = '23514';
    end if;
    expected_revision := app_private.activate_employee_onboarding_case(
      target_case.id,
      actor_user_id,
      'employee.activated'
    );
  else
    raise exception 'unsupported onboarding review action' using errcode = '22023';
  end if;
  insert into public.onboarding_events (workspace_id, employee_id, case_id, actor_user_id, action, target_type, target_id, metadata)
  values (target_workspace_id, target_employee_id, target_case.id, actor_user_id,
    'onboarding.' || review_action, 'onboarding_case', target_case.id::text,
    jsonb_build_object('requirement_id', target_requirement_id, 'reason_present', nullif(btrim(coalesce(review_reason, '')), '') is not null));
  return expected_revision;
end;
$function$;


-- 2. S2 -----------------------------------------------------------------------------------

-- Whether the actor sees this document row: its owner always; anybody else who
-- reads the person's documents, and while it waits for review only if they
-- may decide on it.
create function app_private.document_row_readable(actor uuid, r public.employee_onboarding_requirements)
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select app_private.document_actor_can_read(actor, r.workspace_id, r.employee_id, r.lifecycle_user_id)
    and (r.lifecycle_user_id = actor
      or not exists (
        select 1 from public.employee_document_submissions s
        where s.id = r.submitted_document_id and s.state = 'pending_review')
      or app_private.authz_reason(actor, r.workspace_id, 'documents.review', null, r.employee_id) is null);
$$;
revoke all on function app_private.document_row_readable(uuid, public.employee_onboarding_requirements) from public, anon, authenticated;

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
 return (select coalesce(jsonb_agg(app_private.document_obligation_json(r) order by r.sort_order,r.id),'[]')
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
 into submissions from public.employee_document_submissions s where s.requirement_id=r.id and (self_only or s.state<>'draft');
 select coalesce(jsonb_agg(jsonb_build_object('id',ev.id,'action',ev.action,'occurred_at',ev.occurred_at,'metadata',ev.metadata) order by ev.occurred_at desc),'[]') into history
 from public.onboarding_events ev where ev.workspace_id=r.workspace_id and ev.employee_id=r.employee_id and ev.target_id=r.id::text;
 return jsonb_build_object('obligation',app_private.document_obligation_json(r),'submissions',submissions,'history',history,'policy',case when r.kind='acknowledgement' then jsonb_build_object('content_text',r.source_snapshot->>'content_text','content_digest',r.source_snapshot->>'content_digest','intent_statement',r.source_snapshot->>'intent_statement','can_withdraw',self_only and exists(select 1 from public.employee_onboarding_cases c join public.workspace_memberships m on m.id=c.membership_id where c.id=r.case_id and c.submitted_at is null and c.status='in_progress' and m.status='pending_activation' and r.lifecycle_retired_at is null),'history',coalesce((select jsonb_agg(jsonb_build_object('typed_name',a.typed_name,'executed_at',a.executed_at,'withdrawn_at',a.withdrawn_at,'content_digest',a.content_digest) order by a.executed_at,a.id) from public.employee_acknowledgement_envelopes a where a.requirement_id=r.id and (not self_only or a.user_id=actor_user_id)),'[]'::jsonb),'evidence',(select jsonb_build_object('typed_name',a.typed_name,'executed_at',a.executed_at,'content_digest',a.content_digest,'intent_statement',a.intent_statement) from public.employee_acknowledgement_envelopes a where a.requirement_id=r.id and a.withdrawn_at is null and (not self_only or a.user_id=actor_user_id))) end,'initial_deferral',jsonb_build_object('reason',r.conditional_reason,'allowed',self_only and r.kind='document' and r.lifecycle_settings->>'mode'='conditional' and r.submitted_document_id is null and not r.lifecycle_exempt and r.lifecycle_closed_at is null and not exists(select 1 from public.employee_document_submissions s where s.requirement_id=r.id and s.state<>'draft') and exists(select 1 from public.employee_onboarding_cases c join public.workspace_memberships m on m.id=c.membership_id where c.id=r.case_id and m.status='pending_activation')),'timezone_settings',(select jsonb_build_object('value',app_private.document_employee_timezone(r.workspace_id,r.employee_id),'configured_value',p.document_timezone,'employee_revision',p.revision,'can_manage',not self_only and (p.is_remote or p.is_excluded_from_schedule) and app_private.document_timezone_admin(actor_user_id,r.workspace_id,r.employee_id) and not exists(select 1 from public.employee_location_assignments a join public.locations l on l.id=a.location_id and l.workspace_id=a.workspace_id and l.archived_at is null where a.workspace_id=r.workspace_id and a.employee_id=r.employee_id and a.ended_at is null and a.is_primary)) from public.employee_profiles p where p.id=r.employee_id));
end;
$function$;

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
    'description', requirement.description, 'status', requirement.status,
    'required', requirement.required, 'blocks_activation', requirement.blocks_activation,
    'requires_review', requirement.requires_review, 'sort_order', requirement.sort_order,
    'source_id', requirement.source_id,
    'accepted_formats', coalesce(requirement.source_snapshot->'accepted_formats', '[]'::jsonb),
    'content_text', null, 'content_digest', requirement.source_snapshot->>'content_digest',
    'intent_statement', null, 'rejection_reason', requirement.rejection_reason
  ) order by requirement.sort_order) filter (where requirement.kind <> 'document' or app_private.document_row_readable(actor_user_id, requirement)), '[]'::jsonb),
  count(*) filter (where requirement.required),
  count(*) filter (where requirement.required and requirement.status = 'completed')
  into requirement_rows, total_count, completed_count
  from public.employee_onboarding_requirements requirement
  where requirement.case_id = target_case.id and requirement.status <> 'superseded' and requirement.lifecycle_retired_at is null;
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


-- 3. One documents permission ---------------------------------------------------------------

-- Whoever held the acknowledgement permission holds the documents one.
insert into public.workspace_role_permissions (workspace_id, role_id, permission_key)
select g.workspace_id, g.role_id,
  case g.permission_key when 'signature_templates.read' then 'documents.read' else 'documents.manage' end
from public.workspace_role_permissions g
where g.permission_key in ('signature_templates.read', 'signature_templates.manage')
on conflict do nothing;
delete from public.workspace_role_permissions where permission_key in ('signature_templates.read', 'signature_templates.manage');
delete from app_private.role_permission_dependencies
where permission_key in ('signature_templates.read', 'signature_templates.manage')
   or required_key in ('signature_templates.read', 'signature_templates.manage');
update app_private.authz_actions set permission_key = 'documents.read' where key = 'settings.signature_templates.read';
delete from public.permissions where key in ('signature_templates.read', 'signature_templates.manage');
update public.permissions set label = 'View documents and acknowledgements' where key = 'documents.read';
update public.permissions set label = 'Manage documents and acknowledgements' where key = 'documents.manage';
