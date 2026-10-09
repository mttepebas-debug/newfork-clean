import { documentAssignmentImpactSchema } from "@newfork/shared";
import {
  documentDetailSchema,
  documentObligationSchema,
  documentReviewCommandSchema,
  employeeOnboardingDocumentBucket,
  type DocumentReviewCommand,
} from "@newfork/shared";
import { apiRequest, supabaseClient } from "../lib/supabase";

export type DocumentAudience = { workspaceId: string; selfOnly: boolean };
function client() {
  if (!supabaseClient) throw new Error("Document storage is not configured");
  return supabaseClient;
}
function root(audience: DocumentAudience) {
  return audience.selfOnly
    ? `/v1/me/workspaces/${audience.workspaceId}/documents`
    : `/v1/workspaces/${audience.workspaceId}/employee-documents`;
}
export const documentQueryKey = (
  audience: DocumentAudience,
  userId: string,
  requirementId?: string,
) => [
  "document-lifecycle",
  userId,
  audience.workspaceId,
  audience.selfOnly ? "self" : "manager",
  ...(requirementId ? [requirementId] : []),
];
export async function listDocuments(audience: DocumentAudience) {
  return documentObligationSchema
    .array()
    .parse(await apiRequest(client(), root(audience)));
}
export async function getDocumentAccess(workspaceId: string) {
  const result = (await apiRequest(
    client(),
    `${root({ workspaceId, selfOnly: true })}/access`,
  )) as { restricted?: unknown };
  if (typeof result.restricted !== "boolean")
    throw new Error("Document access could not be checked");
  return { restricted: result.restricted };
}
export async function getDocument(
  audience: DocumentAudience,
  requirementId: string,
) {
  return documentDetailSchema.parse(
    await apiRequest(client(), `${root(audience)}/${requirementId}`),
  );
}
export async function reviewDocument(
  audience: DocumentAudience,
  requirementId: string,
  input: DocumentReviewCommand,
) {
  return apiRequest(client(), `${root(audience)}/${requirementId}/review`, {
    method: "POST",
    body: JSON.stringify(documentReviewCommandSchema.parse(input)),
  });
}
export async function downloadDocument(
  audience: DocumentAudience,
  requirementId: string,
  submissionId: string,
  fileId: string,
) {
  const data = (await apiRequest(
    client(),
    `${root(audience)}/${requirementId}/submissions/${submissionId}/files/${fileId}/download`,
  )) as { url: string };
  window.open(data.url, "_blank", "noopener,noreferrer");
}
export async function setDocumentExemption(
  audience: DocumentAudience,
  requirementId: string,
  input: { revision: number; exempt: boolean; reason: string },
) {
  return apiRequest(client(), `${root(audience)}/${requirementId}/exemption`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export async function setDocumentTimezone(
  audience: DocumentAudience,
  requirementId: string,
  input: { employee_revision: number; timezone: string },
) {
  return apiRequest(client(), `${root(audience)}/${requirementId}/timezone`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export async function deferInitialDocument(
  audience: DocumentAudience,
  requirementId: string,
  input: { revision: number; reason: string },
) {
  return apiRequest(client(), `${root(audience)}/${requirementId}/defer`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export async function acknowledgeDocument(
  audience: DocumentAudience,
  requirementId: string,
  input: {
    revision: number;
    typed_name: string;
    content_digest: string;
    idempotency_key: string;
  },
) {
  return apiRequest(
    client(),
    `${root(audience)}/${requirementId}/acknowledge`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
export async function uploadDocument(
  audience: DocumentAudience,
  requirementId: string,
  revision: number,
  file: File,
) {
  const storage = client();
  const body = { filename: file.name, sizeBytes: file.size };
  const upload = (await apiRequest(
    storage,
    `${root(audience)}/${requirementId}/upload-url`,
    { method: "POST", body: JSON.stringify(body) },
  )) as { path: string; token: string };
  const { error } = await storage.storage
    .from(employeeOnboardingDocumentBucket)
    .uploadToSignedUrl(upload.path, upload.token, file, {
      contentType: file.type,
      upsert: false,
    });
  if (error) throw new Error(error.message);
  return apiRequest(storage, `${root(audience)}/${requirementId}/confirm`, {
    method: "POST",
    body: JSON.stringify({ ...body, path: upload.path, revision }),
  });
}
export async function submitDocument(
  audience: DocumentAudience,
  requirementId: string,
  input: {
    revision: number;
    submission_id: string;
    expiry_date: string | null;
    metadata: Record<string, string | number | null>;
  },
) {
  return apiRequest(client(), `${root(audience)}/${requirementId}/submit`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function withdrawDocumentAcknowledgement(
  audience: DocumentAudience,
  requirementId: string,
  revision: number,
) {
  return apiRequest(client(), `${root(audience)}/${requirementId}/withdraw`, {
    method: "POST",
    body: JSON.stringify({ revision }),
  });
}

export async function removeDocumentDraftFile(
  audience: DocumentAudience,
  requirementId: string,
  input: { revision: number; submission_id: string; file_id: string },
) {
  return apiRequest(
    client(),
    `${root(audience)}/${requirementId}/remove-draft-file`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function extendDocumentDeadline(
  audience: DocumentAudience,
  requirementId: string,
  input: { revision: number; additional_days: number; reason: string },
) {
  return apiRequest(
    client(),
    `${root(audience)}/${requirementId}/extend-deadline`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function previewEmployeeDocumentAssignments(
  workspaceId: string,
  employeeId: string,
  locationIds: string[],
  jobIds: string[],
) {
  return documentAssignmentImpactSchema.parse(
    await apiRequest(
      client(),
      `/v1/workspaces/${workspaceId}/employee-documents/${employeeId}/assignment-preview`,
      {
        method: "POST",
        body: JSON.stringify({ location_ids: locationIds, job_ids: jobIds }),
      },
    ),
  );
}
