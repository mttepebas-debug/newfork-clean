-- Publication is additive: preserve every legacy definition and its archive state.
alter table public.document_types
 add column publication_status text not null default 'published' check (publication_status in ('draft','published')),
 add column publication_revision integer not null default 1 check (publication_revision > 0),
 add column published_at timestamptz;
alter table public.document_types alter column publication_status set default 'draft';
alter table public.employee_onboarding_requirements add column publication_paused_at timestamptz;
grant select(publication_status,publication_revision,published_at) on public.document_types to authenticated;

-- Guard both lifecycle Save and old RPC clients at the table boundary. Archive/reorder remain independent.
create function app_private.guard_document_definition_edit() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.publication_status='published' and
  (new.title,new.description,new.required_at_onboarding,new.requires_review,new.accepted_formats,new.tracks_expiry,new.expiry_warning_days,new.expiry_schedule_impact,new.lifecycle_settings,new.lifecycle_revision)
  is distinct from
  (old.title,old.description,old.required_at_onboarding,old.requires_review,old.accepted_formats,old.tracks_expiry,old.expiry_warning_days,old.expiry_schedule_impact,old.lifecycle_settings,old.lifecycle_revision)
 then raise exception 'Published documents cannot be edited; unpublish first' using errcode='PT409'; end if;
 if old.publication_status='draft' and new.lifecycle_revision=old.lifecycle_revision and (new.title,new.description,new.required_at_onboarding,new.requires_review,new.accepted_formats,new.tracks_expiry,new.expiry_warning_days,new.expiry_schedule_impact,new.lifecycle_settings) is distinct from (old.title,old.description,old.required_at_onboarding,old.requires_review,old.accepted_formats,old.tracks_expiry,old.expiry_warning_days,old.expiry_schedule_impact,old.lifecycle_settings) then new.lifecycle_revision:=old.lifecycle_revision+1; end if;
 return new;
end;
$$;
revoke all on function app_private.guard_document_definition_edit() from public,anon,authenticated,service_role;
create trigger guard_document_definition_edit before update on public.document_types for each row execute function app_private.guard_document_definition_edit();

-- Keep the generic definition view and acknowledgement branch. Only published documents are assignable.
do $$
declare body text;
begin
 body:=pg_get_viewdef('app_private.lifecycle_definition'::regclass,true);
 if strpos(body,'true AS current_version')=0 then raise exception 'publication definition view anchor changed'; end if;
 body:=replace(body,'true AS current_version','(d.publication_status = ''published'') AS current_version');
 execute 'create or replace view app_private.lifecycle_definition as '||body;
end;
$$;

-- Draft definitions cannot enter onboarding through any insertion path.
create function app_private.guard_document_requirement_publication() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.kind='document' and new.source_id is not null and not exists(
  select 1 from public.document_types d where d.id=new.source_id and d.workspace_id=new.workspace_id and d.publication_status='published'
 ) then return null; end if;
 return new;
end;
$$;
revoke all on function app_private.guard_document_requirement_publication() from public,anon,authenticated,service_role;
create trigger a_document_requirement_publication before insert on public.employee_onboarding_requirements for each row execute function app_private.guard_document_requirement_publication();

create function app_private.assert_document_published(r public.employee_onboarding_requirements) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if r.kind='document' and (r.publication_paused_at is not null or (r.source_id is not null and exists(select 1 from public.document_types d where d.id=r.source_id and d.workspace_id=r.workspace_id and d.publication_status<>'published')))
 then raise exception 'Document is unpublished; changes are paused' using errcode='PT409'; end if;
end;
$$;
revoke all on function app_private.assert_document_published(public.employee_onboarding_requirements) from public,anon,authenticated,service_role;

-- Archived employees are visible in publication impact only to workspace administrators.
create function app_private.document_publication_can_access(actor uuid,w uuid,e uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.service_actor_can_access_employee(actor,w,e) or exists(select 1 from public.employee_profiles p,public.workspace_memberships m join public.workspace_roles role on role.id=m.role_id and role.workspace_id=m.workspace_id where p.id=e and p.workspace_id=w and p.archived_at is not null and m.workspace_id=w and m.user_id=actor and m.status='active' and role.access_class in ('owner','admin'));
$$;
revoke all on function app_private.document_publication_can_access(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Extend canonical predicates and commands; never change the acknowledgement branch.
do $$
declare body text; proc regprocedure; anchor text;
begin
 body:=pg_get_functiondef('app_private.document_obligation_state(public.employee_onboarding_requirements,timestamp with time zone)'::regprocedure);
 anchor:=' select * into approved';
 if strpos(body,anchor)=0 then raise exception 'obligation state anchor changed'; end if;
 body:=replace(body,anchor,' if r.publication_paused_at is not null then return ''paused''; end if;'||chr(10)||anchor); execute body;
 body:=pg_get_functiondef('app_private.document_obligation_blocked(public.employee_onboarding_requirements,timestamp with time zone)'::regprocedure);
 body:=replace(body,'state in (''completed'',''removed'',''exempt'')','state in (''completed'',''removed'',''exempt'',''paused'')'); execute body;
 body:=pg_get_functiondef('app_private.document_obligation_json(public.employee_onboarding_requirements)'::regprocedure);
 body:=replace(body,'''status'',case when','''publication_paused'',r.publication_paused_at is not null,''status'',case when r.publication_paused_at is not null and not r.lifecycle_exempt and r.lifecycle_closed_at is null then ''paused'' when');
 body:=replace(body,'''remaining_seconds'',coalesce(','''remaining_seconds'',case when r.publication_paused_at is not null then null else coalesce(');
 -- Close the CASE only at the original remaining-seconds expression boundary.
 body:=replace(body,'end),'||chr(10)||'  ''rejection_reason''','end) end,'||chr(10)||'  ''rejection_reason'''); execute body;
 foreach proc in array array[
  'app_private.document_initial_action_missing(public.employee_onboarding_requirements)'::regprocedure,
  'app_private.document_activation_blocked(public.employee_onboarding_requirements)'::regprocedure
 ] loop
  body:=pg_get_functiondef(proc);
  body:=replace(body,'r.kind=''document''','r.publication_paused_at is null and r.kind=''document'''); execute body;
 end loop;
 body:=pg_get_functiondef('app_private.document_reconcile_employee(uuid,uuid)'::regprocedure);
 body:=replace(body,'if r.lifecycle_exempt or r.lifecycle_assignment_disabled then','if r.publication_paused_at is not null or r.lifecycle_exempt or r.lifecycle_assignment_disabled then'); execute body;
 body:=pg_get_functiondef('app_private.start_document_activation_periods()'::regprocedure);
 body:=replace(body,'and r.deadline_at is null','and r.publication_paused_at is null and r.deadline_at is null'); execute body;
 body:=pg_get_functiondef('app_private.document_shift_reasons(uuid,uuid,date,timestamp with time zone)'::regprocedure);
 body:=replace(body,'and lifecycle_settings->>''mode''','and publication_paused_at is null and lifecycle_settings->>''mode'''); execute body;
 foreach proc in array array[
  'public.submit_employee_document_lifecycle_service(uuid,uuid,integer,uuid,date,jsonb)'::regprocedure,
  'public.review_employee_document_lifecycle_service(uuid,uuid,uuid,integer,uuid,text,text,text,jsonb)'::regprocedure,
  'public.save_employee_document_draft_file_service(uuid,uuid,integer,text,text,text,bigint)'::regprocedure,
  'public.remove_employee_document_draft_file_service(uuid,uuid,uuid,integer,uuid,uuid)'::regprocedure,
  'public.defer_initial_employee_document_service(uuid,uuid,integer,text)'::regprocedure
 ] loop
  body:=pg_get_functiondef(proc); anchor:=' if r.lifecycle_revision';
  if strpos(body,anchor)=0 then raise exception 'publication mutation guard anchor changed: %',proc; end if;
  body:=replace(body,anchor,' perform app_private.assert_document_published(r);'||chr(10)||anchor); execute body;
 end loop;
 body:=pg_get_functiondef('public.set_employee_document_exemption_service(uuid,uuid,uuid,integer,boolean,text)'::regprocedure);
 if strpos(body,' if expected_revision is null')=0 then raise exception 'exemption publication guard anchor changed'; end if;
 body:=replace(body,' if expected_revision is null',' if not make_exempt then perform app_private.assert_document_published(r); end if;'||chr(10)||' if expected_revision is null'); execute body;
 body:=pg_get_functiondef('public.extend_employee_document_deadline_service(uuid,uuid,uuid,integer,integer,text)'::regprocedure);
 body:=replace(body,' if r.lifecycle_revision',' perform app_private.assert_document_published(r);'||chr(10)||' if r.lifecycle_revision'); execute body;
 -- Pending onboarding paths must not reintroduce a required-document gate while paused.
 foreach proc in array array[
  'public.activate_employee_onboarding_case_service(uuid,uuid,text)'::regprocedure,
  -- AUTH-002 signature change: patch the new signature when it exists, else the old one.
  coalesce(to_regprocedure('public.submit_employee_onboarding_service(uuid,integer,uuid)'), to_regprocedure('public.submit_employee_onboarding_service(uuid,integer)')),
  coalesce(to_regprocedure('public.get_employee_onboarding_service(uuid,uuid)'), to_regprocedure('public.get_employee_onboarding_service(uuid)')),
  'app_private.document_sync_onboarding(uuid,uuid)'::regprocedure
 ] loop
  body:=pg_get_functiondef(proc);
  body:=replace(body,'not lifecycle_exempt and lifecycle_closed_at','publication_paused_at is null and not lifecycle_exempt and lifecycle_closed_at');
  body:=replace(body,'not requirement.lifecycle_exempt and requirement.lifecycle_closed_at','requirement.publication_paused_at is null and not requirement.lifecycle_exempt and requirement.lifecycle_closed_at');
  body:=replace(body,'not q.lifecycle_exempt and q.lifecycle_closed_at','q.publication_paused_at is null and not q.lifecycle_exempt and q.lifecycle_closed_at'); execute body;
 end loop;
 -- Canonical Preview/Apply understands publication resumes; closed/exempt/retired records stay closed.
 body:=pg_get_functiondef('app_private.preview_lifecycle_definition(uuid,uuid,uuid,text)'::regprocedure);
 anchor:='when not matches and (r).id is not null';
 if strpos(body,anchor)=0 then raise exception 'publication preview anchor changed'; end if;
 body:=replace(body,anchor,'when target_kind=''document'' and ((r).lifecycle_retired_at is not null or (r).lifecycle_assignment_disabled or (r).lifecycle_closed_at is not null or (r).status=''superseded'') then ''unchanged'' when target_kind=''document'' and matches and (r).publication_paused_at is not null then ''update'' '||anchor);
 body:=replace(body,'when action in (''assign'',''reopen'') then ''restart''','when target_kind=''document'' and (r).publication_paused_at is not null and action=''update'' then ''restart'' when action in (''assign'',''reopen'') then ''restart'''); execute body;
 body:=replace(body,'d.archived_at is null and app_private.document_target_matches','d.archived_at is null and (target_kind<>''document'' or (e.archived_at is null and m.status in (''active'',''pending_activation''))) and app_private.document_target_matches');
 body:=replace(body,'where e.workspace_id=target_workspace_id and e.archived_at is null and m.status in (''active'',''pending_activation'')','where e.workspace_id=target_workspace_id and ((e.archived_at is null and m.status in (''active'',''pending_activation'')) or (target_kind=''document'' and (r).publication_paused_at is not null))');
 body:=replace(body,'and public.service_actor_can_access_employee(actor_user_id,e.workspace_id,e.id)','and (case when target_kind=''document'' then app_private.document_publication_can_access(actor_user_id,e.workspace_id,e.id) else public.service_actor_can_access_employee(actor_user_id,e.workspace_id,e.id) end)');
 execute body;
 body:=pg_get_functiondef('app_private.apply_lifecycle_definition(uuid,uuid,uuid,integer,text,text,text)'::regprocedure);
 anchor:=' perform 1 from public.employee_onboarding_requirements where workspace_id=target_workspace_id';
 body:=replace(body,anchor,' perform 1 from public.employee_onboarding_cases where workspace_id=target_workspace_id order by id for update;'||chr(10)||anchor);
 body:=replace(body,'r.lifecycle_closed_at:=null;','r.publication_paused_at:=null; r.lifecycle_closed_at:=null;');
 body:=replace(body,'deadline_at=deadline,paused_remaining_seconds=case',
  'publication_paused_at=case when target_kind=''document'' then null else publication_paused_at end,deadline_at=deadline,paused_remaining_seconds=case when target_kind=''document'' and item->>''deadline_action''=''restart'' and not valid_approved and d.lifecycle_settings->>''mode''<>''optional'' and exists(select 1 from public.employee_document_submissions s where s.id=r.submitted_document_id and s.state=''pending_review'') then (d.lifecycle_settings->>''period_days'')::numeric*86400');
 body:=replace(body,'document_suspended_at=case when item->>''action''=''remove''','document_suspended_at=case when target_kind=''document'' and item->>''deadline_action''=''restart'' then null when item->>''action''=''remove'''); execute body;
end;
$$;

do $$
declare body text;
begin
 body:=pg_get_functiondef('public.save_document_type_lifecycle_service(uuid,uuid,uuid,integer,jsonb)'::regprocedure);
 body:=replace(body,'begin','begin'||chr(10)||' perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,52001));');
 body:=replace(body,' if settings is null', ' settings:=jsonb_set(settings,''{assignment_scope}'',''"all_active"''::jsonb); if target_document_type_id is null and jsonb_array_length(coalesce(settings->''target''->''employee_ids'',''[]''))>0 then raise exception ''Individual document assignment is not supported'' using errcode=''22023''; end if; if target_document_type_id is not null and exists(select 1 from public.document_types d where d.id=target_document_type_id and d.workspace_id=target_workspace_id and coalesce(d.lifecycle_settings->''target''->''employee_ids'',''[]'') is distinct from coalesce(settings->''target''->''employee_ids'',''[]'')) then raise exception ''Legacy named targets must be preserved'' using errcode=''22023''; end if; if settings is null'); execute body;
 body:=pg_get_functiondef('public.save_document_type(uuid,uuid,text,text,boolean,boolean,text[],boolean,integer,text)'::regprocedure);
 body:=replace(body,'begin', 'begin'||chr(10)||' perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,52001));');
 execute body;
end;
$$;

-- Publication requires complete visibility of actual affected employees, including paused former targets.
create function public.preview_document_publication_service(actor_user_id uuid,target_workspace_id uuid,target_document_type_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d public.document_types%rowtype; result jsonb; effects jsonb; scope_options jsonb; pair text[]; identities jsonb; token text;
begin
 if not public.service_actor_has_permission(actor_user_id,target_workspace_id,'documents.manage') then raise exception 'document management access required' using errcode='42501'; end if;
 select * into d from public.document_types where id=target_document_type_id and workspace_id=target_workspace_id;
 if d.id is null then raise exception 'document type not found' using errcode='P0002'; end if;
 if d.archived_at is not null then raise exception 'Archived documents cannot be published; restore first' using errcode='PT409'; end if;
 perform app_private.assert_document_definition_target(actor_user_id,target_workspace_id,d.lifecycle_settings->'target');
 if exists(select 1 from public.employee_profiles e join public.workspace_memberships m on m.workspace_id=e.workspace_id and m.user_id=e.user_id
  where e.workspace_id=target_workspace_id and not app_private.document_publication_can_access(actor_user_id,e.workspace_id,e.id)
  and ((e.archived_at is null and m.status in ('active','pending_activation') and app_private.document_target_matches(e.workspace_id,e.id,d.lifecycle_settings->'target') and (m.status='pending_activation' or d.lifecycle_settings->>'assignment_scope'='all_active'))
   or exists(select 1 from public.employee_onboarding_requirements r where r.workspace_id=e.workspace_id and r.employee_id=e.id and r.kind='document' and r.source_id=d.id and r.lifecycle_retired_at is null and r.lifecycle_closed_at is null and not r.lifecycle_exempt and not r.lifecycle_assignment_disabled)))
 then raise exception 'Complete document target access required' using errcode='42501'; end if;
 result:=app_private.preview_lifecycle_definition(actor_user_id,target_workspace_id,d.id,'document');
 if d.publication_status='published' then
  select coalesce(jsonb_agg(jsonb_build_object('employee_id',r.employee_id,'employee_name',concat_ws(' ',e.first_name,e.last_name),'employee_revision',e.revision,
    'requirement_id',r.id,'revision',r.lifecycle_revision,'action','pause','deadline_action','pause') order by r.id),'[]') into effects
  from public.employee_onboarding_requirements r join public.employee_profiles e on e.id=r.employee_id and e.workspace_id=r.workspace_id
  where r.workspace_id=target_workspace_id and r.source_id=d.id and r.kind='document' and r.lifecycle_retired_at is null and r.lifecycle_closed_at is null and not r.lifecycle_exempt and not r.lifecycle_assignment_disabled;
  result:=jsonb_set(result,'{employees}',effects);
 end if;
 scope_options:=public.document_definition_target_options_service(actor_user_id,target_workspace_id);
 if exists(select 1 from jsonb_array_elements(result->'employees') effect join public.employee_location_assignments a on a.employee_id=(effect->>'employee_id')::uuid and a.workspace_id=target_workspace_id and a.ended_at is null join public.locations l on l.id=a.location_id and l.workspace_id=a.workspace_id and l.archived_at is null where effect->>'action' not in ('unchanged','exempt') and not exists(select 1 from jsonb_array_elements(scope_options->'locations') o where o->>'id'=l.id::text)) then raise exception 'Complete document target access required' using errcode='42501'; end if;
 -- Include selected identities and the actual locations/jobs/departments of affected employees.
 foreach pair slice 1 in array array[['location_ids','locations'],['department_ids','departments'],['job_ids','jobs'],['employee_ids','named_people']] loop
  select coalesce(jsonb_agg(o order by o->>'name',o->>'id'),'[]') into identities
  from jsonb_array_elements(scope_options->case when pair[2]='named_people' then 'employees' else pair[2] end) o
  where (pair[2]<>'named_people' and jsonb_array_length(coalesce(d.lifecycle_settings->'target'->pair[1],'[]'))=0) or (d.lifecycle_settings->'target'->pair[1]) ? (o->>'id') or (pair[2]<>'named_people' and exists(
   select 1 from jsonb_array_elements(result->'employees') effect
   where effect->>'action' not in ('unchanged','exempt') and (
    (pair[2]='locations' and exists(select 1 from public.employee_location_assignments a where a.workspace_id=target_workspace_id and a.employee_id=(effect->>'employee_id')::uuid and a.ended_at is null and a.location_id=(o->>'id')::uuid)) or
    (pair[2] in ('jobs','departments') and exists(select 1 from public.employee_job_assignments a join public.jobs j on j.id=a.job_id and j.workspace_id=a.workspace_id where a.workspace_id=target_workspace_id and a.employee_id=(effect->>'employee_id')::uuid and a.ended_at is null and (case when pair[2]='jobs' then j.id else j.department_id end)=(o->>'id')::uuid))
   )));
  result:=result||jsonb_build_object(pair[2],identities);
 end loop;
 -- Return exact matcher membership even for unchanged/exempt rows; bind it to the confirmation token.
 select coalesce(jsonb_agg(effect || jsonb_build_object('matches_target',
   exists(select 1 from public.employee_profiles e join public.workspace_memberships m on m.workspace_id=e.workspace_id and m.user_id=e.user_id
    where e.id=(effect->>'employee_id')::uuid and e.workspace_id=target_workspace_id and e.archived_at is null and m.status in ('active','pending_activation')
      and app_private.document_target_matches(e.workspace_id,e.id,d.lifecycle_settings->'target')))
   order by position),'[]') into effects
 from jsonb_array_elements(result->'employees') with ordinality as entries(effect,position);
 result:=jsonb_set(result,'{employees}',effects);
 result:=(result-'preview_token')||jsonb_build_object('publication_revision',d.publication_revision,'target',d.lifecycle_settings->'target','assignment_scope',d.lifecycle_settings->>'assignment_scope','transition',case when d.publication_status='draft' then 'publish' else 'unpublish' end);
 token:=encode(extensions.digest(convert_to(jsonb_build_object('actor',actor_user_id,'definition',to_jsonb(d),'impact',result)::text,'UTF8'),'sha256'),'hex');
 return result||jsonb_build_object('preview_token',token);
end;
$$;
revoke all on function public.preview_document_publication_service(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.preview_document_publication_service(uuid,uuid,uuid) to service_role;

create function public.set_document_publication_service(actor_user_id uuid,target_workspace_id uuid,target_document_type_id uuid,expected_revision integer,expected_publication_revision integer,expected_preview_token text,publish_reason text,target_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
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
 perform 1 from public.membership_location_scopes where workspace_id=target_workspace_id order by membership_id,location_id for share;
 preview:=public.preview_document_publication_service(actor_user_id,target_workspace_id,d.id);
 if preview->>'preview_token' is distinct from expected_preview_token then raise exception 'Document publication impact changed; refresh preview' using errcode='PT409'; end if;
 if target_status='published' then
  update public.document_types set publication_status='published',publication_revision=publication_revision+1,published_at=now() where id=d.id;
  core_preview:=app_private.preview_lifecycle_definition(actor_user_id,target_workspace_id,d.id,'document');
  result:=app_private.apply_lifecycle_definition(actor_user_id,target_workspace_id,d.id,d.lifecycle_revision,core_preview->>'preview_token',publish_reason,'document');
  update public.employee_onboarding_requirements set publication_paused_at=null,lifecycle_revision=lifecycle_revision+1 where workspace_id=target_workspace_id and source_id=d.id and kind='document' and publication_paused_at is not null and (lifecycle_exempt or lifecycle_closed_at is not null or lifecycle_retired_at is not null or lifecycle_assignment_disabled or status='superseded');
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
$$;
revoke all on function public.set_document_publication_service(uuid,uuid,uuid,integer,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.set_document_publication_service(uuid,uuid,uuid,integer,integer,text,text,text) to service_role;

-- Old Apply clients may only apply a published definition; they cannot publish a draft implicitly.
create or replace function public.apply_document_definition_service(actor_user_id uuid,target_workspace_id uuid,target_document_type_id uuid,expected_revision integer,expected_preview_token text,apply_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.service_actor_has_permission(actor_user_id,target_workspace_id,'documents.manage') then raise exception 'document management access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text,52001));
 perform 1 from public.document_types where id=target_document_type_id and workspace_id=target_workspace_id and publication_status='published' for update;
 if not found then raise exception 'Document must be published before applying assignments' using errcode='PT409'; end if;
 return app_private.apply_lifecycle_definition(actor_user_id,target_workspace_id,target_document_type_id,expected_revision,expected_preview_token,apply_reason,'document');
end;
$$;

-- Pause suppresses generation and delayed delivery; delivered history is untouched.
do $$
declare body text;
begin
 body:=pg_get_functiondef('public.documents_maintain_service(integer,timestamp with time zone)'::regprocedure);
 body:=replace(body,'and q.kind=''document'' and q.lifecycle_settings', 'and q.publication_paused_at is null and q.kind=''document'' and q.lifecycle_settings'); execute body;
 body:=pg_get_functiondef('app_private.enqueue_document_notification(uuid,uuid,uuid,text,text,text,text,uuid,uuid)'::regprocedure);
 body:=replace(body,'if requirement is not null then', 'if requirement is not null and kind in (''expiry'',''review'',''assigned'') and exists(select 1 from public.employee_onboarding_requirements r where r.id=requirement and r.publication_paused_at is not null) then return false; end if; if requirement is not null then');
 body:=replace(body,' if u is null', ' if kind=''missing'' then body:=''You have outstanding document requests. Open Documents for details.''; end if; if u is null');
 body:=replace(body,'''submission_id'',submission', '''submission_id'',submission,''document_publication_revision'',(select d.publication_revision from public.employee_onboarding_requirements r join public.document_types d on d.id=r.source_id and d.workspace_id=r.workspace_id where r.id=requirement and r.kind=''document'')');
 body:=replace(body,'''/app/settings/documents?requirement=''','''/app/employees/documents?requirement='''); execute body;
 body:=pg_get_functiondef('app_private.document_notification_policy(uuid,uuid,jsonb)'::regprocedure);
 body:=replace(body,' if not coalesce(valid,false) then',
 ' if o.type_key in (''people.documents.review'',''people.documents.expiry'',''people.documents.assigned'') then valid:=valid and not exists(select 1 from public.employee_onboarding_requirements r left join public.document_types d on d.id=r.source_id and d.workspace_id=r.workspace_id and r.kind=''document'' where r.id=(o.payload->>''requirement_id'')::uuid and (r.publication_paused_at is not null or d.publication_status=''draft'' or o.created_at<d.published_at or (o.payload ? ''document_publication_revision'' and r.kind=''document'' and (o.payload->>''document_publication_revision'')::integer is distinct from d.publication_revision))); end if;
 if o.type_key in (''people.documents.restricted'',''people.documents.restored'') then valid:=valid and (app_private.document_actor_blocked(u,o.workspace_id)=(o.type_key=''people.documents.restricted'')); end if;

 if not coalesce(valid,false) then'); execute body;
end;
$$;

update public.notification_catalog set action_route_contract=jsonb_set(action_route_contract,'{route}','"/app/employees/documents"'::jsonb) where type_key='people.documents.review';

-- A versioned Save entrypoint fails closed before this migration is deployed.
create function public.save_document_type_draft_service(actor_user_id uuid,target_workspace_id uuid,target_document_type_id uuid,expected_revision integer,document_payload jsonb)
returns uuid language sql security definer set search_path='' as $$
 select public.save_document_type_lifecycle_service(actor_user_id,target_workspace_id,target_document_type_id,expected_revision,document_payload);
$$;
revoke all on function public.save_document_type_draft_service(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_document_type_draft_service(uuid,uuid,uuid,integer,jsonb) to service_role;
