alter table public.employee_profiles add column document_timezone text;
create function app_private.document_employee_timezone(w uuid,e uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare zone text; has_primary boolean;
begin
 select l.timezone,true into zone,has_primary from public.employee_location_assignments a
 join public.locations l on l.id=a.location_id and l.workspace_id=a.workspace_id and l.archived_at is null
 where a.workspace_id=w and a.employee_id=e and a.ended_at is null and a.is_primary;
 if not coalesce(has_primary,false) then
  select document_timezone into zone from public.employee_profiles where workspace_id=w and id=e and (is_remote or is_excluded_from_schedule);
 end if;
 if zone is not null and (zone='UTC' or zone~'^[A-Za-z_]+/[A-Za-z0-9_+/-]+$') and exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then return zone; end if;
 return null;
end;
$$;
revoke all on function app_private.document_employee_timezone(uuid,uuid) from public,anon,authenticated,service_role;

create function app_private.document_timezone_admin(actor uuid,w uuid,e uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.service_actor_has_permission(actor,w,'employees.manage') and public.service_actor_can_access_employee(actor,w,e)
 and exists(select 1 from public.workspace_memberships m join public.workspace_roles r on r.id=m.role_id and r.workspace_id=m.workspace_id
  where m.workspace_id=w and m.user_id=actor and m.status='active' and r.access_class in ('owner','admin'));
$$;
revoke all on function app_private.document_timezone_admin(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.set_employee_document_timezone_service(actor_user_id uuid,target_workspace_id uuid,target_requirement_id uuid,expected_employee_revision integer,reference_timezone text)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.employee_onboarding_requirements%rowtype; e public.employee_profiles%rowtype;
begin
 select * into r from public.employee_onboarding_requirements where workspace_id=target_workspace_id and id=target_requirement_id;
 if r.id is null or not app_private.document_timezone_admin(actor_user_id,target_workspace_id,r.employee_id) then raise exception 'document timezone administration denied' using errcode='42501'; end if;
 select * into e from public.employee_profiles where id=r.employee_id and workspace_id=r.workspace_id for update;
 if e.revision is distinct from expected_employee_revision then raise exception 'employee changed; refresh required' using errcode='PT409'; end if;
 if not (e.is_remote or e.is_excluded_from_schedule) or exists(select 1 from public.employee_location_assignments a join public.locations l on l.id=a.location_id and l.workspace_id=a.workspace_id and l.archived_at is null where a.workspace_id=e.workspace_id and a.employee_id=e.id and a.ended_at is null and a.is_primary)
 then raise exception 'the active primary location controls the document timezone' using errcode='22023'; end if;
 if reference_timezone is null or not (reference_timezone='UTC' or reference_timezone~'^[A-Za-z_]+/[A-Za-z0-9_+/-]+$') or not exists(select 1 from pg_catalog.pg_timezone_names where name=reference_timezone)
 then raise exception 'valid IANA timezone required' using errcode='22023'; end if;
 if e.document_timezone=reference_timezone then return e.revision; end if;
 update public.employee_profiles set document_timezone=reference_timezone,revision=revision+1,updated_at=now() where id=e.id returning revision into expected_employee_revision;
 perform app_private.document_audit(r,actor_user_id,'document.reference_timezone_changed',jsonb_build_object('previous',e.document_timezone,'timezone',reference_timezone,'employee_revision',expected_employee_revision));
 return expected_employee_revision;
end;
$$;
revoke all on function public.set_employee_document_timezone_service(uuid,uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.set_employee_document_timezone_service(uuid,uuid,uuid,integer,text) to service_role;

-- Expiry date checks share one current employee reference. UTC grace instants,
-- expiry dates, submitted metadata and historical approvals are never rewritten.
do $$
declare name regprocedure; body text;
begin
 foreach name in array array[
  'app_private.document_obligation_state(public.employee_onboarding_requirements,timestamptz)'::regprocedure,
  'public.submit_employee_document_lifecycle_service(uuid,uuid,integer,uuid,date,jsonb)'::regprocedure,
  'public.review_employee_document_lifecycle_service(uuid,uuid,uuid,integer,uuid,text,text,text,jsonb)'::regprocedure
 ] loop
  body:=pg_get_functiondef(name);
  if strpos(body,'coalesce(r.source_snapshot->>''timezone'',''UTC'')')=0 then raise exception 'document expiry reference anchor changed'; end if;
  body:=replace(body,'coalesce(r.source_snapshot->>''timezone'',''UTC'')','app_private.document_employee_timezone(r.workspace_id,r.employee_id)');
  if name::text like '%document_obligation_state%' then
   body:=replace(body,'if approved.id is not null and (approved.expiry_date',
    'if approved.id is not null and approved.expiry_date is not null and app_private.document_employee_timezone(r.workspace_id,r.employee_id) is null then return ''timezone_required''; end if; if approved.id is not null and (approved.expiry_date');
  elsif name::text like '%submit_employee_document%' then
   body:=replace(body,'if submission_expiry <', 'if submission_expiry is not null and app_private.document_employee_timezone(r.workspace_id,r.employee_id) is null then raise exception ''Document timezone needs administrator configuration'' using errcode=''22023''; end if; if submission_expiry <');
  else
   body:=replace(body,'if review_decision=''approve'' and s.expiry_date<', 'if review_decision=''approve'' and s.expiry_date is not null and app_private.document_employee_timezone(r.workspace_id,r.employee_id) is null then raise exception ''Document timezone needs administrator configuration'' using errcode=''22023''; end if; if review_decision=''approve'' and s.expiry_date<');
  end if;
  execute body;
 end loop;
 body:=pg_get_functiondef('app_private.document_obligation_json(public.employee_onboarding_requirements)'::regprocedure);
 body:=replace(body,'''timezone'',r.source_snapshot->>''timezone''','''timezone'',app_private.document_employee_timezone(r.workspace_id,r.employee_id)');
 execute body;
 body:=pg_get_functiondef('public.get_employee_document_lifecycle_service(uuid,uuid,uuid,boolean)'::regprocedure);
 body:=replace(body,'''history'',history)', '''history'',history,''timezone_settings'',(select jsonb_build_object(''value'',app_private.document_employee_timezone(r.workspace_id,r.employee_id),''configured_value'',p.document_timezone,''employee_revision'',p.revision,''can_manage'',not self_only and (p.is_remote or p.is_excluded_from_schedule) and app_private.document_timezone_admin(actor_user_id,r.workspace_id,r.employee_id) and not exists(select 1 from public.employee_location_assignments a join public.locations l on l.id=a.location_id and l.workspace_id=a.workspace_id and l.archived_at is null where a.workspace_id=r.workspace_id and a.employee_id=r.employee_id and a.ended_at is null and a.is_primary)) from public.employee_profiles p where p.id=r.employee_id))');
 execute body;
end;
$$;
