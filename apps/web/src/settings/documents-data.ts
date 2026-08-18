import {
  documentTypeInputSchema,
  documentTypeSchema,
  type DocumentType,
  type DocumentTypeInput,
} from "@newfork/shared";
import { supabaseClient } from "../lib/supabase";

function client() {
  if (!supabaseClient) throw new Error("Document storage is not configured");
  return supabaseClient;
}

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function listDocumentTypes(
  workspaceId: string,
): Promise<DocumentType[]> {
  const { data, error } = await client()
    .from("document_types")
    .select(
      "id,workspace_id,title,description,required_at_onboarding,requires_review,accepted_formats,tracks_expiry,expiry_warning_days,sort_order,archived_at",
    )
    .eq("workspace_id", workspaceId)
    .order("sort_order")
    .order("title");
  check(error);
  return documentTypeSchema.array().parse(data ?? []);
}

export async function saveDocumentType(
  workspaceId: string,
  input: DocumentTypeInput,
  documentTypeId?: string,
): Promise<string> {
  const documentType = documentTypeInputSchema.parse(input);
  const { data, error } = await client().rpc("save_document_type", {
    target_workspace_id: workspaceId,
    target_document_type_id: documentTypeId ?? null,
    document_title: documentType.title,
    document_description: documentType.description,
    is_required_at_onboarding: documentType.required_at_onboarding,
    is_review_required: documentType.requires_review,
    document_formats: documentType.accepted_formats,
    should_track_expiry: documentType.tracks_expiry,
    warning_days: documentType.expiry_warning_days,
  });
  check(error);
  return String(data);
}

export async function setDocumentTypeArchived(
  workspaceId: string,
  documentTypeId: string,
  archived: boolean,
): Promise<void> {
  const { error } = await client().rpc("set_document_type_archived", {
    target_workspace_id: workspaceId,
    target_document_type_id: documentTypeId,
    should_archive: archived,
  });
  check(error);
}

export async function reorderDocumentTypes(
  workspaceId: string,
  orderedIds: readonly string[],
): Promise<void> {
  const { error } = await client().rpc("reorder_document_types", {
    target_workspace_id: workspaceId,
    ordered_ids: [...orderedIds],
  });
  check(error);
}
