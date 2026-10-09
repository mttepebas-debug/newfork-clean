create or replace function app_private.guard_document_requirement_publication() returns trigger
language plpgsql security definer set search_path='' as $g$
begin
 if new.kind='document' and new.source_id is not null and not exists(
  select 1 from public.document_types d where d.id=new.source_id and d.workspace_id=new.workspace_id and d.publication_status='published'
 ) then raise exception 'EXPERIMENT: document definition is not published' using errcode='PT409'; end if;
 return new;
end; $g$;
