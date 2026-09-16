import {
  documentDefinitionPreviewSchema,
  documentTargetOptionsSchema,
  signatureRetentionPolicyInputSchema,
  signatureRetentionPolicySchema,
  signatureTemplateDraftInputSchema,
  signatureTemplateSchema,
  signatureTemplateVersionSchema,
  type SignatureRetentionPolicy,
  type SignatureRetentionPolicyInput,
  type SignatureTemplate,
  type SignatureTemplateDraftInput,
  type SignatureTemplateVersion,
} from "@newfork/shared";
import { developmentBearerToken, supabaseClient } from "../lib/supabase";

function client() {
  if (!supabaseClient)
    throw new Error("Acknowledgement storage is not configured");
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
    (await storage.auth.getSession()).data.session?.access_token ??
    developmentBearerToken();
  if (!token) throw new Error("A current session is required");
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:9999" : "")}/v1/workspaces/${workspaceId}${path}`,
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
        : "Signature settings operation failed",
    );
  return body;
}

export interface SignatureSettingsData {
  readonly policies: SignatureRetentionPolicy[];
  readonly templates: SignatureTemplate[];
  readonly versions: SignatureTemplateVersion[];
}

export async function listSignatureSettings(
  workspaceId: string,
): Promise<SignatureSettingsData> {
  const [policyResult, templateResult, versionResult] = await Promise.all([
    client()
      .from("signature_retention_policies")
      .select(
        "id,workspace_id,name,retention_trigger,duration_days,jurisdiction_scope,authority_reference,status,approved_at,archived_at",
      )
      .eq("workspace_id", workspaceId)
      .order("name"),
    client()
      .from("signature_templates")
      .select("id,workspace_id,name,archived_at")
      .eq("workspace_id", workspaceId)
      .order("name"),
    client()
      .from("signature_template_versions")
      .select(
        "id,workspace_id,template_id,version_number,title,summary,execution_class,content_text,content_digest,intent_statement,locale,effective_date,required_at_onboarding,blocks_activation,retention_policy_id,status,published_at,lifecycle_settings,lifecycle_revision",
      )
      .eq("workspace_id", workspaceId)
      .order("version_number", { ascending: false }),
  ]);
  check(policyResult.error);
  check(templateResult.error);
  check(versionResult.error);
  return {
    policies: signatureRetentionPolicySchema
      .array()
      .parse(policyResult.data ?? []),
    templates: signatureTemplateSchema.array().parse(templateResult.data ?? []),
    versions: signatureTemplateVersionSchema
      .array()
      .parse(versionResult.data ?? []),
  };
}

export async function saveSignatureRetentionPolicy(
  workspaceId: string,
  input: SignatureRetentionPolicyInput,
  policyId?: string,
): Promise<string> {
  const policy = signatureRetentionPolicyInputSchema.parse(input);
  const body = (await request(
    workspaceId,
    policyId
      ? `/signature-retention-policies/${policyId}`
      : "/signature-retention-policies",
    {
      method: policyId ? "PUT" : "POST",
      body: JSON.stringify(policy),
    },
  )) as { id?: unknown };
  if (!body.id) throw new Error("Retention policy save result is unavailable");
  return String(body.id);
}

export async function approveSignatureRetentionPolicy(
  workspaceId: string,
  policyId: string,
): Promise<void> {
  await request(
    workspaceId,
    `/signature-retention-policies/${policyId}/approve`,
    {
      method: "POST",
    },
  );
}

export async function unapproveSignatureRetentionPolicy(
  workspaceId: string,
  policyId: string,
): Promise<void> {
  await request(
    workspaceId,
    `/signature-retention-policies/${policyId}/unapprove`,
    {
      method: "POST",
    },
  );
}

export async function setSignatureRetentionPolicyArchived(
  workspaceId: string,
  policyId: string,
  archived: boolean,
): Promise<void> {
  await request(
    workspaceId,
    `/signature-retention-policies/${policyId}/archive`,
    {
      method: "PATCH",
      body: JSON.stringify({ archived }),
    },
  );
}

export async function saveSignatureTemplateDraft(
  workspaceId: string,
  input: SignatureTemplateDraftInput,
  templateId?: string,
): Promise<string> {
  const template = signatureTemplateDraftInputSchema.parse(input);
  const body = (await request(
    workspaceId,
    templateId
      ? `/signature-templates/${templateId}/draft`
      : "/signature-templates",
    {
      method: templateId ? "PUT" : "POST",
      body: JSON.stringify(template),
    },
  )) as { id?: unknown };
  if (!body.id)
    throw new Error("Acknowledgement template save result is unavailable");
  return String(body.id);
}

export async function publishSignatureTemplate(
  workspaceId: string,
  templateId: string,
): Promise<void> {
  await request(workspaceId, `/signature-templates/${templateId}/publish`, {
    method: "POST",
  });
}

export async function unpublishSignatureTemplate(
  workspaceId: string,
  templateId: string,
): Promise<void> {
  await request(workspaceId, `/signature-templates/${templateId}/unpublish`, {
    method: "POST",
  });
}

export async function setSignatureTemplateArchived(
  workspaceId: string,
  templateId: string,
  archived: boolean,
): Promise<void> {
  await request(workspaceId, `/signature-templates/${templateId}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  });
}

export async function getPolicyTargetOptions(workspaceId: string) {
  return documentTargetOptionsSchema.parse(
    await request(workspaceId, "/signature-templates/target-options"),
  );
}
export async function previewPolicyDefinition(
  workspaceId: string,
  versionId: string,
) {
  return documentDefinitionPreviewSchema.parse(
    await request(workspaceId, `/signature-versions/${versionId}/preview`, {
      method: "POST",
    }),
  );
}
export async function applyPolicyDefinition(
  workspaceId: string,
  versionId: string,
  input: { revision: number; preview_token: string; reason: string },
) {
  return request(workspaceId, `/signature-versions/${versionId}/apply`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
