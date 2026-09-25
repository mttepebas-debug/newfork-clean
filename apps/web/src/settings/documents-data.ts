import {
  documentTypeInputSchema,
  documentTypeSchema,
  documentTargetOptionsSchema,
  documentDefinitionPreviewSchema,
  documentPublicationPreviewSchema,
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

async function request(
  workspaceId: string,
  path: string,
  init: RequestInit = {},
) {
  const storage = client();
  const token =
    (await storage.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error("A current session is required");
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:9999" : "")}/v1/workspaces/${workspaceId}/document-types${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    },
  );
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok)
    throw new Error(
      typeof body === "object" && body && "error" in body
        ? String(body.error)
        : "Document type operation failed",
    );
  return body;
}

export async function listDocumentTypes(
  workspaceId: string,
): Promise<DocumentType[]> {
  const { data, error } = await client()
    .from("document_types")
    .select(
      "id,workspace_id,title,description,required_at_onboarding,requires_review,accepted_formats,tracks_expiry,expiry_warning_days,expiry_schedule_impact,sort_order,archived_at,lifecycle_settings,lifecycle_revision,publication_status,publication_revision,published_at",
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
  const body = (await request(
    workspaceId,
    documentTypeId ? `/${documentTypeId}` : "",
    {
      method: documentTypeId ? "PUT" : "POST",
      body: JSON.stringify(documentType),
    },
  )) as { id?: unknown };
  if (!body.id) throw new Error("Document type save result is unavailable");
  return String(body.id);
}

export async function getDocumentTargetOptions(workspaceId: string) {
  return documentTargetOptionsSchema.parse(
    await request(workspaceId, "/target-options"),
  );
}
export async function previewDocumentDefinition(
  workspaceId: string,
  id: string,
) {
  return documentDefinitionPreviewSchema.parse(
    await request(workspaceId, `/${id}/preview`, { method: "POST" }),
  );
}
export async function applyDocumentDefinition(
  workspaceId: string,
  id: string,
  command: { revision: number; preview_token: string; reason: string },
) {
  return request(workspaceId, `/${id}/apply`, {
    method: "POST",
    body: JSON.stringify(command),
  });
}

export async function setDocumentTypeArchived(
  workspaceId: string,
  documentTypeId: string,
  archived: boolean,
): Promise<void> {
  await request(workspaceId, `/${documentTypeId}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  });
}

export async function reorderDocumentTypes(
  workspaceId: string,
  orderedIds: readonly string[],
): Promise<void> {
  await request(workspaceId, "/reorder", {
    method: "POST",
    body: JSON.stringify({ orderedIds: [...orderedIds] }),
  });
}

export async function previewDocumentPublication(
  workspaceId: string,
  id: string,
) {
  return documentPublicationPreviewSchema.parse(
    await request(workspaceId, `/${id}/publication-preview`, {
      method: "POST",
    }),
  );
}
export async function publishDocumentType(
  workspaceId: string,
  id: string,
  command: {
    revision: number;
    publication_revision: number;
    preview_token: string;
    reason: string;
  },
  action: "publish" | "unpublish",
) {
  return request(workspaceId, `/${id}/${action}`, {
    method: "POST",
    body: JSON.stringify(command),
  });
}
