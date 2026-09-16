-- Withdrawing changes eligibility, never the original signed evidence.
alter table public.employee_acknowledgement_envelopes add column withdrawn_at timestamptz;
alter table public.employee_acknowledgement_envelopes drop constraint employee_acknowledgement_envelopes_requirement_id_key;
create unique index acknowledgement_current_requirement on public.employee_acknowledgement_envelopes(requirement_id) where withdrawn_at is null;

create function public.withdraw_document_acknowledgement_service(actor_user_id uuid,target_workspace_id uuid,target_requirement_id uuid,expected_revision integer)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.employee_onboarding_requirements%rowtype; c public.employee_onboarding_cases%rowtype; evidence_id uuid;
begin
 select c0.* into c from public.employee_onboarding_cases c0 join public.employee_onboarding_requirements q on q.case_id=c0.id
 where q.id=target_requirement_id and q.workspace_id=target_workspace_id and q.lifecycle_user_id=actor_user_id for update of c0;
 select * into r from public.employee_onboarding_requirements where id=target_requirement_id and workspace_id=target_workspace_id for update;
 if c.id is null or r.kind<>'acknowledgement' or r.lifecycle_user_id is distinct from actor_user_id
  or not app_private.document_actor_can_read(actor_user_id,r.workspace_id,r.employee_id,r.lifecycle_user_id)
 then raise exception 'policy unavailable' using errcode='P0002'; end if;
 if r.lifecycle_revision<>expected_revision then raise exception 'policy changed; refresh required' using errcode='PT409'; end if;
 if c.submitted_at is not null or c.status<>'in_progress' or r.lifecycle_retired_at is not null
  or not exists(select 1 from public.workspace_memberships where id=c.membership_id and user_id=actor_user_id and status='pending_activation')
 then raise exception 'acknowledgement can only be withdrawn before first onboarding Submit' using errcode='22023'; end if;
 update public.employee_acknowledgement_envelopes set withdrawn_at=now() where requirement_id=r.id and user_id=actor_user_id and withdrawn_at is null returning id into evidence_id;
 if evidence_id is null then raise exception 'current acknowledgement unavailable' using errcode='PT409'; end if;
 update public.employee_onboarding_requirements set status='not_started',completed_at=null,lifecycle_revision=lifecycle_revision+1,updated_at=now() where id=r.id returning lifecycle_revision into expected_revision;
 perform app_private.document_audit(r,actor_user_id,'document.policy_withdrawn',jsonb_build_object('evidence_id',evidence_id,'revision',expected_revision));
 perform app_private.document_sync_onboarding(r.id,actor_user_id);
 return expected_revision;
end;
$$;
revoke all on function public.withdraw_document_acknowledgement_service(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.withdraw_document_acknowledgement_service(uuid,uuid,uuid,integer) to service_role;

do $$
declare body text;
begin
 body:=pg_get_functiondef('public.acknowledge_document_lifecycle_service(uuid,uuid,uuid,integer,text,text,timestamptz,uuid)'::regprocedure);
 body:=replace(body,'if evidence.id is not null then','if evidence.id is not null then if evidence.withdrawn_at is not null then raise exception ''acknowledgement was withdrawn; use a new request'' using errcode=''PT409''; end if;');
 body:=replace(body,'where requirement_id=r.id) then','where requirement_id=r.id and withdrawn_at is null) then');
 execute body;
 body:=pg_get_functiondef('public.get_employee_document_lifecycle_service(uuid,uuid,uuid,boolean)'::regprocedure);
 body:=replace(body,'where a.requirement_id=r.id and (not self_only','where a.requirement_id=r.id and a.withdrawn_at is null and (not self_only');
 body:=replace(body,'''evidence'',(select',
  '''can_withdraw'',self_only and exists(select 1 from public.employee_onboarding_cases c join public.workspace_memberships m on m.id=c.membership_id where c.id=r.case_id and c.submitted_at is null and c.status=''in_progress'' and m.status=''pending_activation'' and r.lifecycle_retired_at is null),''history'',coalesce((select jsonb_agg(jsonb_build_object(''typed_name'',a.typed_name,''executed_at'',a.executed_at,''withdrawn_at'',a.withdrawn_at,''content_digest'',a.content_digest) order by a.executed_at,a.id) from public.employee_acknowledgement_envelopes a where a.requirement_id=r.id and (not self_only or a.user_id=actor_user_id)),''[]''::jsonb),''evidence'',(select');
 execute body;
end;
$$;
