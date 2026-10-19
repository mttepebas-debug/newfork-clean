-- ROL-CIFT slice 5.2 (design §4.6): nobody sees management's view of themselves. The documents to review,
-- the management list, leave out the reader's own document waiting for review: they follow it in their
-- own documents. Their other documents stay listed, as on anybody's record.

CREATE OR REPLACE FUNCTION "public"."list_employee_document_lifecycle_service"("actor_user_id" "uuid", "target_workspace_id" "uuid", "self_only" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
 perform app_private.authorize(actor_user_id,target_workspace_id,case when self_only then 'documents.self' else 'documents.read' end,
  target_locations=>case when self_only then null else app_private.scope_set(actor_user_id,target_workspace_id,'documents.read') end);
 if self_only is null then raise exception 'document audience required' using errcode='22023'; end if;
 return (select coalesce(jsonb_agg(app_private.document_obligation_json(app_private.document_view(actor_user_id,r)) order by r.sort_order,r.id),'[]')
 from public.employee_onboarding_requirements r where r.workspace_id=target_workspace_id and r.kind in ('document','acknowledgement')
 and (not self_only or r.lifecycle_user_id=actor_user_id)
 -- One's own document waiting for review is never in one's list to review (ROL-CIFT 5.2).
 and (self_only or r.lifecycle_user_id is distinct from actor_user_id or not exists (
  select 1 from public.employee_document_submissions s where s.id=r.submitted_document_id and s.state='pending_review'))
 and app_private.document_row_readable(actor_user_id,r));
end;
$$;
