import {
  signatureRetentionPolicyInputSchema,
  signatureTemplateDraftInputSchema,
  type SignatureRetentionPolicyInput,
  type SignatureTemplateDraftInput,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";

export interface SignatureSettingsService {
  saveRetentionPolicy(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly policyId?: string;
    readonly policy: SignatureRetentionPolicyInput;
  }): Promise<string>;
  approveRetentionPolicy(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly policyId: string;
  }): Promise<void>;
  unapproveRetentionPolicy(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly policyId: string;
  }): Promise<void>;
  setRetentionPolicyArchived(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly policyId: string;
    readonly archived: boolean;
  }): Promise<void>;
  saveTemplateDraft(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly templateId?: string;
    readonly template: SignatureTemplateDraftInput;
  }): Promise<string>;
  publishTemplate(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly templateId: string;
  }): Promise<void>;
  unpublishTemplate(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly templateId: string;
  }): Promise<void>;
  setTemplateArchived(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly templateId: string;
    readonly archived: boolean;
  }): Promise<void>;
}

interface RpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export function createSignatureSettingsService(options: {
  url: string;
  serviceRoleKey: string;
}): SignatureSettingsService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return createSignatureSettingsServiceWithClient(client);
}

export function createSignatureSettingsServiceWithClient(
  client: RpcClient,
): SignatureSettingsService {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }

  return {
    async saveRetentionPolicy(input) {
      const policy = signatureRetentionPolicyInputSchema.parse(input.policy);
      return String(
        await rpc("save_signature_retention_policy_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_policy_id: input.policyId ?? null,
          policy_name: policy.name,
          policy_trigger: policy.retention_trigger,
          policy_duration_days: policy.duration_days,
          policy_jurisdiction_scope: policy.jurisdiction_scope,
          policy_authority_reference: policy.authority_reference,
        }),
      );
    },
    async approveRetentionPolicy(input) {
      await rpc("approve_signature_retention_policy_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_policy_id: input.policyId,
      });
    },
    async unapproveRetentionPolicy(input) {
      await rpc("unapprove_signature_retention_policy_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_policy_id: input.policyId,
      });
    },
    async setRetentionPolicyArchived(input) {
      await rpc("set_signature_retention_policy_archived_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_policy_id: input.policyId,
        should_archive: input.archived,
      });
    },
    async saveTemplateDraft(input) {
      const template = signatureTemplateDraftInputSchema.parse(input.template);
      return String(
        await rpc("save_signature_template_draft_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_template_id: input.templateId ?? null,
          template_name: template.title,
          template_summary: template.summary,
          template_content: template.content_text,
          template_intent_statement: template.intent_statement,
          template_locale: template.locale,
          template_effective_date: template.effective_date,
          is_required_at_onboarding: template.required_at_onboarding,
          should_block_activation: template.blocks_activation,
          target_retention_policy_id: template.retention_policy_id,
        }),
      );
    },
    async publishTemplate(input) {
      await rpc("publish_signature_template_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_template_id: input.templateId,
      });
    },
    async unpublishTemplate(input) {
      await rpc("unpublish_signature_template_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_template_id: input.templateId,
      });
    },
    async setTemplateArchived(input) {
      await rpc("set_signature_template_archived_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_template_id: input.templateId,
        should_archive: input.archived,
      });
    },
  };
}
