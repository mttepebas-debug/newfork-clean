import {
  documentTypeInputSchema,
  defaultDocumentLifecycleSettings,
  documentPublicationPreviewSchema,
  type DocumentPublicationPreview,
  documentTargetOptionsSchema,
  type DocumentTargetOptions,
  type DocumentTypeInput,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";

export interface DocumentTypesService {
  publicationPreview(input: {
    actorUserId: string;
    workspaceId: string;
    documentTypeId: string;
  }): Promise<DocumentPublicationPreview>;
  publish(input: {
    actorUserId: string;
    workspaceId: string;
    documentTypeId: string;
    revision: number;
    publication_revision: number;
    preview_token: string;
    reason: string;
    targetStatus: "draft" | "published";
  }): Promise<unknown>;
  targetOptions(input: {
    actorUserId: string;
    workspaceId: string;
  }): Promise<DocumentTargetOptions>;
  save(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly documentTypeId?: string;
    readonly documentType: DocumentTypeInput;
  }): Promise<string>;
  setArchived(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly documentTypeId: string;
    readonly archived: boolean;
  }): Promise<void>;
  reorder(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly orderedIds: readonly string[];
  }): Promise<void>;
}

interface RpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export function createDocumentTypesService(options: {
  url: string;
  serviceRoleKey: string;
}): DocumentTypesService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return createDocumentTypesServiceWithClient(client);
}

export function createDocumentTypesServiceWithClient(
  client: RpcClient,
): DocumentTypesService {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }

  return {
    async publicationPreview(input) {
      return documentPublicationPreviewSchema.parse(
        await rpc("preview_document_publication_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_document_type_id: input.documentTypeId,
        }),
      );
    },
    async publish(input) {
      return rpc("set_document_publication_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_document_type_id: input.documentTypeId,
        expected_revision: input.revision,
        expected_publication_revision: input.publication_revision,
        expected_preview_token: input.preview_token,
        publish_reason: input.reason,
        target_status: input.targetStatus,
      });
    },
    async targetOptions(input) {
      return documentTargetOptionsSchema.parse(
        await rpc("document_definition_target_options_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
        }),
      );
    },
    async save(input) {
      const documentType = documentTypeInputSchema.parse(input.documentType);
      return String(
        await rpc("save_document_type_draft_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_document_type_id: input.documentTypeId ?? null,
          expected_revision: documentType.lifecycle_revision ?? null,
          document_payload: {
            ...documentType,
            lifecycle_settings: {
              ...(documentType.lifecycle_settings ?? {
                ...defaultDocumentLifecycleSettings,
                mode: documentType.required_at_onboarding
                  ? "required"
                  : "optional",
              }),
              assignment_scope: "all_active",
            },
          },
        }),
      );
    },
    async setArchived(input) {
      await rpc("set_document_type_archived_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_document_type_id: input.documentTypeId,
        should_archive: input.archived,
      });
    },
    async reorder(input) {
      await rpc("reorder_document_types_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        ordered_ids: [...input.orderedIds],
      });
    },
  };
}
