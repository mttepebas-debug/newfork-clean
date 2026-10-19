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

-- A document type is never archived and published at once (no such row exists, live or local).
alter table public.document_types
  add constraint document_types_archived_not_published
  check (archived_at is null or publication_status <> 'published');
