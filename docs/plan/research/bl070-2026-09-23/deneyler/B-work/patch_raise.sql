create or replace function app_private.guard_document_requirement_publication() returns trigger
language plpgsql security definer set search_path='' as $g$
begin
 if new.kind='document' and new.source_id is not null and not exists(
  select 1 from public.document_types d where d.id=new.source_id and d.workspace_id=new.workspace_id and d.publication_status='published'
 ) then raise exception 'EXPERIMENT: document definition is not published' using errcode='PT409'; end if;
 return new;
end; $g$;
do $d$
declare body text;
begin
 body:=pg_get_functiondef('public.initialize_employee_onboarding_service(uuid,uuid)'::regprocedure);
 if strpos(body,'and document.archived_at is null')=0 then raise exception 'anchor'; end if;
 body:=replace(body,'and document.archived_at is null','and document.archived_at is null and document.publication_status=''published''');
 execute body;
end $d$;
