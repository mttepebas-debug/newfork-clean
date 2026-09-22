-- The documents a workspace asks for are the owner's own request. The owner
-- never runs onboarding, so there is nobody to hand them to and nobody to
-- review them. Until now an owner picked up every document scoped to all
-- active staff, and each one sat on their record as missing.
--
-- They are still assigned, so the owner's Documents tab shows what the
-- workspace asks of everyone. They simply arrive excused, whenever they are
-- added, and the excuse cannot be taken away.

-- One definition of "this employment record belongs to an owner". The four
-- inline copies of this test in the RLS functions were how the draft-lifecycle
-- change slipped past its own gate; this one is named so a later change can
-- find every reader.
create function app_private.employee_record_is_workspace_owner(
  target_workspace_id uuid,
  target_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employee_profiles employee
    join public.workspace_memberships membership
      on membership.workspace_id = employee.workspace_id
     and membership.user_id = employee.user_id
    where employee.id = target_employee_id
      and employee.workspace_id = target_workspace_id
      and employee.user_id is not null
      and membership.role = 'owner'::public.workspace_role
  );
$$;

revoke all on function app_private.employee_record_is_workspace_owner(uuid, uuid)
  from public, anon, authenticated;

-- Every document and acknowledgement reaches a record through an insert here:
-- the onboarding snapshot, and the reconciler that catches up a record when a
-- definition is published later. One trigger covers both, and anything added
-- after it.
create function app_private.owner_documents_arrive_excused()
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
    new.lifecycle_exempt := true;
    new.required := false;
    new.blocks_activation := false;
    new.deadline_at := null;
    new.lifecycle_close_reason :=
      'An owner is not asked for the documents they ask of everyone else';
  end if;
  return new;
end;
$$;

-- Runs last: the lifecycle snapshot trigger sets required, blocks_activation
-- and deadline_at from the definition, and this overrides all three.
create trigger z_owner_documents_arrive_excused
before insert on public.employee_onboarding_requirements
for each row execute function app_private.owner_documents_arrive_excused();

-- An owner whose record already exists keeps whatever it collected before this.
update public.employee_onboarding_requirements requirement
set lifecycle_exempt = true,
    required = false,
    blocks_activation = false,
    deadline_at = null,
    lifecycle_close_reason =
      'An owner is not asked for the documents they ask of everyone else',
    lifecycle_revision = lifecycle_revision + 1,
    updated_at = now()
where requirement.kind in ('document', 'acknowledgement')
  and not requirement.lifecycle_exempt
  and requirement.lifecycle_retired_at is null
  and app_private.employee_record_is_workspace_owner(
    requirement.workspace_id, requirement.employee_id
  );

-- Reviewers hand out and take back exemptions. An owner's is not theirs to
-- take back: the rule is the record, not a decision somebody made about it.
create or replace function public.set_employee_document_exemption_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_requirement_id uuid,
  expected_revision integer,
  make_exempt boolean,
  exemption_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare r public.employee_onboarding_requirements%rowtype; next_deadline timestamptz; matching boolean; valid_approved boolean;
begin
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id and workspace_id=target_workspace_id and kind='document' for update;
 if r.id is null or not public.service_actor_has_permission(actor_user_id,target_workspace_id,'employee_documents.review')
  or not public.service_actor_can_access_employee(actor_user_id,target_workspace_id,r.employee_id)
  or not app_private.workspace_allows_interactive_access(target_workspace_id) then raise exception 'document exemption unavailable' using errcode='42501'; end if;
 if not make_exempt and app_private.employee_record_is_workspace_owner(r.workspace_id,r.employee_id) then
  raise exception 'an owner is not asked for the documents they ask of everyone else' using errcode='42501';
 end if;
 if not make_exempt then perform app_private.assert_document_published(r); end if;
 if expected_revision is null or r.lifecycle_revision<>expected_revision then raise exception 'document changed; refresh required' using errcode='PT409'; end if;
 if make_exempt is null or nullif(btrim(exemption_reason),'') is null or char_length(exemption_reason)>500 then raise exception 'exemption reason required' using errcode='22023'; end if;
 if r.lifecycle_exempt=make_exempt then return r.lifecycle_revision; end if;
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
  lifecycle_revision=lifecycle_revision+1,updated_at=now() where id=r.id returning lifecycle_revision into expected_revision;
 perform app_private.document_audit(r,actor_user_id,case when make_exempt then 'document.exempted' else 'document.exemption_removed' end,
  jsonb_build_object('reason',btrim(exemption_reason),'revision',expected_revision,'old_deadline',r.deadline_at,'new_deadline',next_deadline,'matching',matching,'valid_approved',valid_approved));
 return expected_revision;
end;
$function$;

revoke all on function public.set_employee_document_exemption_service(uuid, uuid, uuid, integer, boolean, text)
  from public, anon, authenticated;
grant execute on function public.set_employee_document_exemption_service(uuid, uuid, uuid, integer, boolean, text)
  to service_role;

-- The drawer offers reviewers a "Remove exemption" button. On an owner's
-- record the service refuses, so the payload says so and the button stays away
-- rather than failing when pressed.
create or replace function app_private.document_obligation_json(r public.employee_onboarding_requirements)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
 select jsonb_build_object(
  'id',r.id,'workspace_id',r.workspace_id,'employee_id',r.employee_id,'employee_name',concat_ws(' ',e.first_name,e.last_name),
  'title',r.title,'source_id',r.source_id,'kind',r.kind,'mode',r.lifecycle_settings->>'mode',
  'publication_paused',r.publication_paused_at is not null,'status',case when r.publication_paused_at is not null and not r.lifecycle_exempt and r.lifecycle_closed_at is null then 'paused' when not r.lifecycle_exempt and r.lifecycle_closed_at is null and r.status<>'superseded'
    and exists(select 1 from public.employee_document_submissions s where s.id=r.submitted_document_id and s.state='pending_review')
    then 'pending_review' else app_private.document_obligation_state(r,now()) end,'revision',r.lifecycle_revision,'requires_review',r.requires_review,
  'deadline_at',r.deadline_at,'remaining_seconds',case when r.publication_paused_at is not null then null else coalesce(r.paused_remaining_seconds,case when r.deadline_at is not null then greatest(0,extract(epoch from r.deadline_at-now())) end) end,
  'rejection_reason',r.rejection_reason,'suspended',app_private.document_obligation_blocked(r,now()),
  'exemption_locked',app_private.employee_record_is_workspace_owner(r.workspace_id,r.employee_id),
  'submitted_id',r.submitted_document_id,'approved_id',r.approved_document_id,
  'location_ids',coalesce((select jsonb_agg(l.id order by l.name) from public.employee_location_assignments a join public.locations l on l.id=a.location_id and l.workspace_id=a.workspace_id where a.employee_id=r.employee_id and a.workspace_id=r.workspace_id and a.ended_at is null),'[]'),
  'location_names',coalesce((select jsonb_agg(l.name order by l.name) from public.employee_location_assignments a join public.locations l on l.id=a.location_id and l.workspace_id=a.workspace_id where a.employee_id=r.employee_id and a.workspace_id=r.workspace_id and a.ended_at is null),'[]'),
  'timezone',app_private.document_employee_timezone(r.workspace_id,r.employee_id),'settings',r.lifecycle_settings,
  'accepted_formats',coalesce(r.source_snapshot->'accepted_formats','[]'), 'tracks_expiry',coalesce((r.source_snapshot->>'tracks_expiry')::boolean,false))
 from public.employee_profiles e where e.id=r.employee_id and e.workspace_id=r.workspace_id;
$function$;
