-- BL-821 (Mert, 2026-10-19, SORULAR G11 option a): archiving a published document type does
-- what Unpublish does. Before, Archive only stamped archived_at: the people asked for the
-- document stayed asked, an overdue one stayed restricted, and only Restore -> Unpublish ->
-- Archive got them out. Archive now takes the type through set_document_publication_service
-- (the one Unpublish path: open obligations pause, deadlines and suspensions clear, the audit
-- says "unpublished", reason "Archived"), then archives it. Restore therefore brings back a
-- draft; nobody is asked again until it is published.

create or replace function public.set_document_type_archived_service(
  actor_user_id uuid,
  target_workspace_id uuid,
  target_document_type_id uuid,
  should_archive boolean
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  actor_id uuid := actor_user_id;
  d public.document_types%rowtype;
  preview jsonb;
begin
  perform app_private.authorize(actor_user_id, target_workspace_id, 'settings.documents.write');
  -- Same tenant lock and row order as set_document_publication_service.
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text, 52001));
  select * into d from public.document_types
  where id = target_document_type_id and workspace_id = target_workspace_id
  for update;
  if d.id is null then
    raise exception 'document type not found' using errcode = 'P0002';
  end if;

  if should_archive and d.archived_at is null and d.publication_status = 'published' then
    preview := public.preview_document_publication_service(actor_user_id, target_workspace_id, d.id);
    perform public.set_document_publication_service(
      actor_user_id, target_workspace_id, d.id,
      d.lifecycle_revision, d.publication_revision, preview->>'preview_token',
      'Archived', 'draft'
    );
  end if;

  update public.document_types
  set archived_at = case when should_archive then now() else null end,
      updated_at = now()
  where id = d.id;

  insert into public.audit_events (
    workspace_id, actor_user_id, action, target_type, target_id, metadata
  ) values (
    target_workspace_id,
    actor_id,
    case when should_archive then 'document_type.archived' else 'document_type.restored' end,
    'document_type',
    d.id::text,
    jsonb_build_object('title', d.title)
  );
end;
$$;

-- Archive now goes through the Unpublish preview, so the preview must not refuse a published
-- document whose target names an archived location, job, department or person: that check
-- belongs to publishing only. Before this, such a document could be neither unpublished nor,
-- with Archive going through Unpublish, archived (42501 "document target access denied").
CREATE OR REPLACE FUNCTION "public"."preview_document_publication_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "target_document_type_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare d public.document_types%rowtype; result jsonb; effects jsonb; scope_options jsonb; pair text[]; identities jsonb; token text;
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,'settings.documents.write');
 select * into d from public.document_types where id=target_document_type_id and workspace_id=target_workspace_id;
 if d.id is null then raise exception 'document type not found' using errcode='P0002'; end if;
 if d.archived_at is not null then raise exception 'Archived documents cannot be published; restore first' using errcode='PT409',hint='document.archived'; end if;
 -- Only publishing checks that the target still names live places, jobs and people; Unpublish
 -- and Archive must work after a target location, job or person is archived (BELGE-ARSIV review).
 if d.publication_status='draft' then
  perform app_private.assert_document_definition_target(actor_user_id,target_workspace_id,d.lifecycle_settings->'target');
 end if;
 result:=app_private.preview_lifecycle_definition(actor_user_id,target_workspace_id,d.id,'document');
 if d.publication_status='published' then
  select coalesce(jsonb_agg(jsonb_build_object('employee_id',r.employee_id,'employee_name',concat_ws(' ',e.first_name,e.last_name),'employee_revision',e.revision,
    'requirement_id',r.id,'revision',r.lifecycle_revision,'action','pause','deadline_action','pause') order by r.id),'[]') into effects
  from public.employee_onboarding_requirements r join public.employee_profiles e on e.id=r.employee_id and e.workspace_id=r.workspace_id
  where r.workspace_id=target_workspace_id and r.source_id=d.id and r.kind='document' and r.lifecycle_retired_at is null and r.lifecycle_closed_at is null and not r.lifecycle_exempt and not r.lifecycle_assignment_disabled;
  result:=jsonb_set(result,'{employees}',effects);
 end if;
 scope_options:=public.document_definition_target_options_service(actor_user_id,target_workspace_id);
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

-- A document type is never archived and published at once (no such row exists, live or local).
alter table public.document_types
  add constraint document_types_archived_not_published
  check (archived_at is null or publication_status <> 'published');
