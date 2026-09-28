-- BL-246 (user, 2026-09-28): the person who becomes owner by a transfer is
-- asked for no document from then on, like any owner. Accepting the transfer
-- excuses what they still owed, and a document block lifts with it.
--
-- BL-252 (user, 2026-09-28): only somebody with a live employee record in the
-- workspace can accept, so the Owner job always has somebody to go to.
-- Starting a transfer already asks for one; accepting asks again, as it does
-- for the rest of the target's eligibility.
--
-- BL-252 (user, 2026-09-28): the old owner, now an admin, is asked for the
-- documents everyone is. The excuses they had for being the owner are taken
-- back when the transfer is accepted, the way a reviewer removes an exemption
-- (audit, a fresh deadline from now); excuses somebody gave by hand stay. A
-- document that is down keeps the excuse until it is put back up.

-- 1. Which excuses come from being the owner ------------------------------------------

alter table public.employee_onboarding_requirements
  add column owner_excused boolean not null default false;
comment on column public.employee_onboarding_requirements.owner_excused is
  'Excused because the record belonged to the owner; taken back when it no longer does.';

update public.employee_onboarding_requirements requirement
set owner_excused = true
where requirement.lifecycle_exempt
  and requirement.lifecycle_close_reason =
    'An owner is not asked for the documents they ask of everyone else'
  and app_private.employee_record_is_workspace_owner(requirement.workspace_id, requirement.employee_id);

-- 2. What a document asks of the person holding it, in one place: when it is
-- assigned (snapshot_document_lifecycle_requirement) and when an exemption is
-- taken back.
create function app_private.document_requirement_asked(requirement public.employee_onboarding_requirements)
returns public.employee_onboarding_requirements
language plpgsql
immutable
set search_path = ''
as $$
begin
  requirement.required := requirement.lifecycle_settings ->> 'mode' = 'required';
  requirement.blocks_activation := requirement.required;
  return requirement;
end;
$$;
revoke all on function app_private.document_requirement_asked(public.employee_onboarding_requirements)
  from public, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.snapshot_document_lifecycle_requirement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare membership_state public.membership_status;
begin
 if new.kind not in ('document','acknowledgement') then return new; end if;
 select e.user_id,m.status into new.lifecycle_user_id,membership_state from public.employee_profiles e
 join public.employee_onboarding_cases c on c.id=new.case_id and c.workspace_id=new.workspace_id
 join public.workspace_memberships m on m.id=c.membership_id and m.user_id=e.user_id
 where e.id=new.employee_id and e.workspace_id=new.workspace_id;
 if new.lifecycle_settings is null and new.kind='document' then
  select lifecycle_settings into new.lifecycle_settings from public.document_types where id=new.source_id and workspace_id=new.workspace_id;
 end if;
 if new.lifecycle_settings is null and new.kind='acknowledgement' then select app_private.policy_lifecycle_settings(v) into new.lifecycle_settings from public.signature_template_versions v where v.id=new.source_id and v.workspace_id=new.workspace_id; end if; if new.lifecycle_settings is null then
  new.lifecycle_settings:=jsonb_build_object('mode',case when new.required then 'required' else 'optional' end,
   'target',jsonb_build_object('operator','and','location_ids','[]'::jsonb,'department_ids','[]'::jsonb,'job_ids','[]'::jsonb,'employee_ids','[]'::jsonb),
   'assignment_scope','future_onboarding','period_days',null,'suspend_on_overdue',false,'extra_fields','[]'::jsonb);
 end if;
 new := app_private.document_requirement_asked(new);
 if membership_state='active' and new.lifecycle_settings->>'mode'<>'optional' and new.lifecycle_settings->>'period_days' is not null then
  new.deadline_at:=now()+(new.lifecycle_settings->>'period_days')::integer*interval '24 hours';
 end if;
 return new;
end;
$function$
;

-- 3. What excusing an owner's document means, in one place: the documents that
-- reach an owner (z_owner_documents_arrive_excused) and the ones a new owner
-- still owed when the transfer was accepted.
create function app_private.owner_document_excused(requirement public.employee_onboarding_requirements)
returns public.employee_onboarding_requirements
language plpgsql
immutable
set search_path = ''
as $$
begin
  requirement.owner_excused := true;
  requirement.lifecycle_exempt := true;
  requirement.required := false;
  requirement.blocks_activation := false;
  requirement.deadline_at := null;
  requirement.lifecycle_close_reason :=
    'An owner is not asked for the documents they ask of everyone else';
  return requirement;
end;
$$;
revoke all on function app_private.owner_document_excused(public.employee_onboarding_requirements)
  from public, anon, authenticated;

create or replace function app_private.owner_documents_arrive_excused()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind in ('document', 'acknowledgement')
    and not coalesce(new.lifecycle_exempt, false)
    and app_private.employee_record_is_workspace_owner(new.workspace_id, new.employee_id)
  then
    new := app_private.owner_document_excused(new);
  end if;
  return new;
end;
$$;

-- 4. Giving and taking back an exemption, one way ----------------------------------------
-- A reviewer's button (set_employee_document_exemption_service), a transfer
-- taking the old owner's excuses back, and a document put back up all go
-- through here. The caller has decided the actor may; this keeps the rest of
-- the rules. Taking an exemption back asks the document again as it asks
-- everyone, whatever the exemption had set.
create function app_private.set_document_exemption(r public.employee_onboarding_requirements, actor_user_id uuid, make_exempt boolean, exemption_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare next_deadline timestamptz; matching boolean; valid_approved boolean; asked public.employee_onboarding_requirements; next_revision integer;
begin
 if not make_exempt and app_private.employee_record_is_workspace_owner(r.workspace_id,r.employee_id) then
  raise exception 'an owner is not asked for the documents they ask of everyone else' using errcode='42501';
 end if;
 if not make_exempt then perform app_private.assert_document_published(r); end if;
 if make_exempt is null or nullif(btrim(exemption_reason),'') is null or char_length(exemption_reason)>500 then raise exception 'exemption reason required' using errcode='22023'; end if;
 if r.lifecycle_exempt=make_exempt then return r.lifecycle_revision; end if;
 asked:=app_private.document_requirement_asked(r);
 matching:=app_private.document_target_matches(r.workspace_id,r.employee_id,r.lifecycle_settings->'target');
 -- Ignore exemption/closure while checking a retained approved version.
 r.lifecycle_exempt:=false; r.lifecycle_closed_at:=null;
 if r.status='superseded' then r.status:='not_started'; end if;
 valid_approved:=app_private.document_obligation_state(r,now())='completed';
 if not make_exempt and matching and not valid_approved and r.lifecycle_settings->>'mode'<>'optional' and r.lifecycle_settings->>'period_days' is not null then
  next_deadline:=now()+(r.lifecycle_settings->>'period_days')::integer*interval '24 hours';
 end if;
 update public.employee_onboarding_requirements set lifecycle_exempt=make_exempt,
  lifecycle_closed_at=case when make_exempt or matching then null else coalesce(lifecycle_closed_at,now()) end,
  lifecycle_close_reason=btrim(exemption_reason),deadline_at=next_deadline,paused_remaining_seconds=null,document_suspended_at=null,
  required=case when make_exempt then required else asked.required end,
  blocks_activation=case when make_exempt then blocks_activation else asked.blocks_activation end,
  owner_excused=false,
  lifecycle_revision=lifecycle_revision+1,updated_at=now() where id=r.id returning lifecycle_revision into next_revision;
 perform app_private.document_audit(r,actor_user_id,case when make_exempt then 'document.exempted' else 'document.exemption_removed' end,
  jsonb_build_object('reason',btrim(exemption_reason),'revision',next_revision,'old_deadline',r.deadline_at,'new_deadline',next_deadline,'matching',matching,'valid_approved',valid_approved));
 return next_revision;
end;
$function$;
revoke all on function app_private.set_document_exemption(public.employee_onboarding_requirements, uuid, boolean, text)
  from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_employee_document_exemption_service(actor_user_id uuid, target_workspace_id uuid, target_requirement_id uuid, expected_revision integer, make_exempt boolean, exemption_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.employee_onboarding_requirements%rowtype;
begin
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id and workspace_id=target_workspace_id and kind='document' for update;
 if r.id is null or not public.service_actor_has_permission(actor_user_id,target_workspace_id,'employee_documents.review')
  or not public.service_actor_can_access_employee(actor_user_id,target_workspace_id,r.employee_id)
  or not app_private.workspace_allows_interactive_access(target_workspace_id) then raise exception 'document exemption unavailable' using errcode='42501'; end if;
 if expected_revision is null or r.lifecycle_revision<>expected_revision then raise exception 'document changed; refresh required' using errcode='PT409'; end if;
 return app_private.set_document_exemption(r,actor_user_id,make_exempt,exemption_reason);
end;
$function$
;

-- 5. A document put back up takes back the excuses its holders had for being
-- an owner they no longer are (while it was down, a transfer left them).
CREATE OR REPLACE FUNCTION public.set_document_publication_service(actor_user_id uuid, target_workspace_id uuid, target_document_type_id uuid, expected_revision integer, expected_publication_revision integer, expected_preview_token text, publish_reason text, target_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.document_types%rowtype; preview jsonb; core_preview jsonb; result jsonb; r public.employee_onboarding_requirements%rowtype;
begin
 if not public.service_actor_has_permission(actor_user_id,target_workspace_id,'documents.manage') then raise exception 'document management access required' using errcode='42501'; end if;
 if target_status is null or target_status not in ('draft','published') or nullif(btrim(publish_reason),'') is null or char_length(publish_reason)>500 then raise exception 'Valid publication status and reason required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,52001));
 select * into d from public.document_types where id=target_document_type_id and workspace_id=target_workspace_id for update;
 if d.id is null then raise exception 'document type not found' using errcode='P0002'; end if;
 if d.lifecycle_revision is distinct from expected_revision or d.publication_revision is distinct from expected_publication_revision or d.publication_status=target_status then raise exception 'Document publication changed; refresh required' using errcode='PT409'; end if;
 -- Assignment mutations use this same tenant advisory lock. Lock cases before requirements, as Submit/review do.
 perform 1 from public.employee_profiles where workspace_id=target_workspace_id order by id for update;
 perform 1 from public.employee_onboarding_cases where workspace_id=target_workspace_id order by id for update;
 perform 1 from public.employee_onboarding_requirements where workspace_id=target_workspace_id and source_id=d.id and kind='document' order by id for update;
 perform 1 from public.departments where workspace_id=target_workspace_id order by id for share;
 perform 1 from public.employee_location_assignments where workspace_id=target_workspace_id order by id for share;
 preview:=public.preview_document_publication_service(actor_user_id,target_workspace_id,d.id);
 if preview->>'preview_token' is distinct from expected_preview_token then raise exception 'Document publication impact changed; refresh preview' using errcode='PT409'; end if;
 if target_status='published' then
  update public.document_types set publication_status='published',publication_revision=publication_revision+1,published_at=now() where id=d.id;
  core_preview:=app_private.preview_lifecycle_definition(actor_user_id,target_workspace_id,d.id,'document');
  result:=app_private.apply_lifecycle_definition(actor_user_id,target_workspace_id,d.id,d.lifecycle_revision,core_preview->>'preview_token',publish_reason,'document');
  update public.employee_onboarding_requirements set publication_paused_at=null,lifecycle_revision=lifecycle_revision+1 where workspace_id=target_workspace_id and source_id=d.id and kind='document' and publication_paused_at is not null and (lifecycle_exempt or lifecycle_closed_at is not null or lifecycle_retired_at is not null or lifecycle_assignment_disabled or status='superseded');
  for r in select * from public.employee_onboarding_requirements where workspace_id=target_workspace_id and source_id=d.id and kind='document'
   and owner_excused and lifecycle_retired_at is null and not app_private.employee_record_is_workspace_owner(workspace_id,employee_id) loop
   perform app_private.set_document_exemption(r,actor_user_id,false,'No longer the owner');
  end loop;
 else
  update public.document_types set publication_status='draft',publication_revision=publication_revision+1 where id=d.id;
  for r in update public.employee_onboarding_requirements set publication_paused_at=now(),deadline_at=null,document_suspended_at=null,lifecycle_revision=lifecycle_revision+1,updated_at=now()
   where workspace_id=target_workspace_id and source_id=d.id and kind='document' and lifecycle_retired_at is null and lifecycle_closed_at is null and not lifecycle_exempt and not lifecycle_assignment_disabled returning * loop
   perform app_private.document_audit(r,actor_user_id,'document.publication_paused',jsonb_build_object('reason',btrim(publish_reason),'publication_revision',d.publication_revision+1));
  end loop;
  update public.notification_outbox set payload=jsonb_set(payload,'{body}',to_jsonb('You have outstanding document requests. Open Documents for details.'::text)) where workspace_id=target_workspace_id and type_key='people.documents.missing' and status in ('pending','retry');
  result:=jsonb_build_object('paused',jsonb_array_length(preview->'employees'));
 end if;
 insert into public.audit_events(workspace_id,actor_user_id,action,target_type,target_id,metadata)
 values(target_workspace_id,actor_user_id,case when target_status='published' then 'document_type.published' else 'document_type.unpublished' end,'document_type',d.id::text,jsonb_build_object('reason',btrim(publish_reason),'definition_revision',d.lifecycle_revision,'publication_revision',d.publication_revision+1,'impact',preview->'employees'));
 return result||jsonb_build_object('publication_status',target_status,'publication_revision',d.publication_revision+1);
end;
$function$
;

-- 6. The transfer -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.respond_workspace_ownership_transfer_service(actor_user_id uuid, target_workspace_id uuid, transfer_id uuid, transfer_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  transfer_row public.workspace_ownership_transfers%rowtype;
  owner_role_id uuid;
  admin_role_id uuid;
  owed public.employee_onboarding_requirements%rowtype;
begin
  if actor_user_id is null then
    raise exception 'valid actor required' using errcode = '42501', hint = 'actor.required';
  end if;
  if transfer_action not in ('accept', 'reject') then
    raise exception 'valid ownership transfer action required' using errcode = '22023', hint = 'transfer.action_invalid';
  end if;

  perform 1 from public.workspaces where id = target_workspace_id for update;

  select * into transfer_row
  from public.workspace_ownership_transfers transfer
  where transfer.id = transfer_id
    and transfer.workspace_id = target_workspace_id
  for update;

  if transfer_row.id is null or transfer_row.status <> 'pending' then
    raise exception 'pending ownership transfer not found' using errcode = '02000', hint = 'transfer.not_found';
  end if;
  if transfer_row.target_user_id <> actor_user_id then
    raise exception 'ownership transfer target access required' using errcode = '42501', hint = 'transfer.target_required';
  end if;
  if transfer_row.expires_at <= now() then
    update public.workspace_ownership_transfers
    set status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = actor_user_id,
        updated_at = now()
    where id = transfer_row.id;
    raise exception 'ownership transfer has expired' using errcode = '23514', hint = 'transfer.expired';
  end if;

  if transfer_action = 'reject' then
    update public.workspace_ownership_transfers
    set status = 'rejected',
        rejected_at = now(),
        updated_at = now()
    where id = transfer_row.id;

    insert into public.audit_events (
      workspace_id,
      actor_user_id,
      action,
      target_type,
      target_id
    )
    values (
      target_workspace_id,
      actor_user_id,
      'workspace.ownership_transfer.rejected',
      'workspace_ownership_transfer',
      transfer_id::text
    );

    return jsonb_build_object(
      'status', 'rejected',
      'transfer_id', transfer_id,
      'workspace_id', target_workspace_id
    );
  end if;

  if not app_private.workspace_allows_interactive_access(target_workspace_id) or not exists (
    select 1 from public.workspace_memberships m
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    join auth.users u on u.id = m.user_id and u.email_confirmed_at is not null
    where m.id = transfer_row.target_membership_id and m.workspace_id = target_workspace_id
      and m.user_id = actor_user_id and m.status = 'active' and coalesce(r.access_class, m.role) = 'admin'
      and not exists (select 1 from public.employee_onboarding_cases c
        where c.membership_id = m.id and c.workspace_id = m.workspace_id and c.status <> 'approved')
      -- The owner works the Owner job on their own record (BL-252), so only
      -- somebody with a live record here takes ownership.
      and exists (select 1 from public.employee_profiles employee
        where employee.workspace_id = m.workspace_id and employee.user_id = m.user_id
          and employee.archived_at is null)
  ) or not exists (
    select 1 from public.workspace_memberships m
    left join public.workspace_roles r on r.id = m.role_id and r.workspace_id = m.workspace_id
    where m.id = transfer_row.previous_owner_membership_id and m.workspace_id = target_workspace_id
      and m.user_id = transfer_row.initiated_by and m.status = 'active' and coalesce(r.access_class, m.role) = 'owner'
  ) then raise exception 'ownership transfer participants are no longer eligible' using errcode = '42501', hint = 'transfer.participants_ineligible'; end if;

  select id into owner_role_id
  from public.workspace_roles
  where workspace_id = target_workspace_id
    and system_key = 'owner';

  select id into admin_role_id
  from public.workspace_roles
  where workspace_id = target_workspace_id
    and system_key = 'admin';

  if owner_role_id is null or admin_role_id is null then
    raise exception 'system owner and admin roles are required' using errcode = 'P0002', hint = 'workspace.roles_missing';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  perform set_config('app.owner_transfer', 'on', true);

  update public.workspace_memberships
  set role_id = owner_role_id,
      role = 'owner',
      all_locations = true,
      updated_at = now()
  where id = transfer_row.target_membership_id
    and workspace_id = target_workspace_id
    and status = 'active';

  update public.workspace_memberships
  set role_id = admin_role_id,
      role = 'admin',
      all_locations = true,
      updated_at = now()
  where id = transfer_row.previous_owner_membership_id
    and workspace_id = target_workspace_id
    and status = 'active';

  -- The Owner job moves with ownership (BL-218): off the old owner's record,
  -- onto the new owner's, with every location, in this transaction.
  update public.employee_job_assignments assignment
  set ended_at = now(), is_primary = false
  from public.jobs job
  where job.id = assignment.job_id
    and job.workspace_id = target_workspace_id
    and job.system_key = 'owner'
    and assignment.ended_at is null
    and not app_private.employee_record_is_workspace_owner(target_workspace_id, assignment.employee_id);
  perform app_private.open_owner_record_to_everything(target_workspace_id, employee.id, actor_user_id)
  from public.employee_profiles employee
  where employee.workspace_id = target_workspace_id
    and employee.user_id = actor_user_id
    and employee.archived_at is null;

  -- The new owner is asked for no document from now on, like any owner
  -- (BL-246): what they still owed is excused the way a document reaching an
  -- owner later is, and the document block lifts with it. Each excuse is
  -- recorded like any exemption, as the old owner's are when taken back.
  for owed in
  update public.employee_onboarding_requirements requirement
  set (owner_excused, lifecycle_exempt, required, blocks_activation, deadline_at, lifecycle_close_reason) = (
        select excused.owner_excused, excused.lifecycle_exempt, excused.required, excused.blocks_activation,
          excused.deadline_at, excused.lifecycle_close_reason
        from app_private.owner_document_excused(requirement) excused
      ),
      lifecycle_revision = requirement.lifecycle_revision + 1,
      updated_at = now()
  from public.employee_profiles employee
  where employee.id = requirement.employee_id
    and employee.workspace_id = target_workspace_id
    and employee.user_id = actor_user_id
    and requirement.workspace_id = target_workspace_id
    and requirement.kind in ('document', 'acknowledgement')
    and not requirement.lifecycle_exempt
    and requirement.lifecycle_retired_at is null
  returning requirement.*
  loop
    perform app_private.document_audit(owed, actor_user_id, 'document.exempted',
      jsonb_build_object('reason', 'Now the owner', 'revision', owed.lifecycle_revision));
  end loop;

  -- The old owner, now an admin, is asked for the documents everyone is
  -- (BL-252): the excuses they had for being the owner are taken back as a
  -- reviewer removes one. A document that is down keeps its excuse until it is
  -- put back up (set_document_publication_service).
  for owed in
    select r.* from public.employee_onboarding_requirements r
    join public.employee_profiles employee on employee.id = r.employee_id
    where r.workspace_id = target_workspace_id
      and employee.workspace_id = target_workspace_id
      and employee.user_id = transfer_row.initiated_by
      and r.kind = 'document'
      and r.owner_excused
      and r.lifecycle_retired_at is null
    for update of r
  loop
    begin
      perform app_private.set_document_exemption(owed, actor_user_id, false, 'No longer the owner');
    exception when sqlstate 'PT409' then
      null;
    end;
  end loop;

  update public.workspace_ownership_transfers
  set status = 'accepted',
      accepted_at = now(),
      updated_at = now()
  where id = transfer_row.id;

  insert into public.audit_events (
    workspace_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    target_workspace_id,
    actor_user_id,
    'workspace.ownership_transfer.accepted',
    'workspace_ownership_transfer',
    transfer_id::text,
    jsonb_build_object(
      'previous_owner_membership_id', transfer_row.previous_owner_membership_id,
      'target_membership_id', transfer_row.target_membership_id
    )
  );

  insert into public.audit_events (
    workspace_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    target_workspace_id,
    actor_user_id,
    'billing.payment_method.detach_required_after_owner_transfer',
    'workspace',
    target_workspace_id::text,
    jsonb_build_object('previous_owner_user_id', transfer_row.initiated_by)
  );

  return jsonb_build_object(
    'status', 'accepted',
    'transfer_id', transfer_id,
    'workspace_id', target_workspace_id
  );
end;
$function$
;
