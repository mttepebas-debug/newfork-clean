import {
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
import { supabaseClient } from "../lib/supabase";

function client() {
  if (!supabaseClient)
    throw new Error("Acknowledgement storage is not configured");
  return supabaseClient;
}

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
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
        "id,workspace_id,template_id,version_number,title,summary,execution_class,content_text,content_digest,intent_statement,locale,effective_date,required_at_onboarding,blocks_activation,retention_policy_id,status,published_at",
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
  const { data, error } = await client().rpc(
    "save_signature_retention_policy",
    {
      target_workspace_id: workspaceId,
      target_policy_id: policyId ?? null,
      policy_name: policy.name,
      policy_trigger: policy.retention_trigger,
      policy_duration_days: policy.duration_days,
      policy_jurisdiction_scope: policy.jurisdiction_scope,
      policy_authority_reference: policy.authority_reference,
    },
  );
  check(error);
  return String(data);
}

export async function approveSignatureRetentionPolicy(
  workspaceId: string,
  policyId: string,
): Promise<void> {
  const { error } = await client().rpc("approve_signature_retention_policy", {
    target_workspace_id: workspaceId,
    target_policy_id: policyId,
  });
  check(error);
}

export async function setSignatureRetentionPolicyArchived(
  workspaceId: string,
  policyId: string,
  archived: boolean,
): Promise<void> {
  const { error } = await client().rpc(
    "set_signature_retention_policy_archived",
    {
      target_workspace_id: workspaceId,
      target_policy_id: policyId,
      should_archive: archived,
    },
  );
  check(error);
}

export async function saveSignatureTemplateDraft(
  workspaceId: string,
  input: SignatureTemplateDraftInput,
  templateId?: string,
): Promise<string> {
  const template = signatureTemplateDraftInputSchema.parse(input);
  const { data, error } = await client().rpc("save_signature_template_draft", {
    target_workspace_id: workspaceId,
    target_template_id: templateId ?? null,
    template_name: template.title,
    template_summary: template.summary,
    template_content: template.content_text,
    template_intent_statement: template.intent_statement,
    template_locale: template.locale,
    template_effective_date: template.effective_date,
    is_required_at_onboarding: template.required_at_onboarding,
    should_block_activation: template.blocks_activation,
    target_retention_policy_id: template.retention_policy_id,
  });
  check(error);
  return String(data);
}

export async function publishSignatureTemplate(
  workspaceId: string,
  templateId: string,
): Promise<void> {
  const { error } = await client().rpc("publish_signature_template", {
    target_workspace_id: workspaceId,
    target_template_id: templateId,
  });
  check(error);
}

export async function setSignatureTemplateArchived(
  workspaceId: string,
  templateId: string,
  archived: boolean,
): Promise<void> {
  const { error } = await client().rpc("set_signature_template_archived", {
    target_workspace_id: workspaceId,
    target_template_id: templateId,
    should_archive: archived,
  });
  check(error);
}
