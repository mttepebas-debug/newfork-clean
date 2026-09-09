import {
  documentTypeInputSchema,
  type DocumentTypeInput,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";

export interface DocumentTypesService {
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
    async save(input) {
      const documentType = documentTypeInputSchema.parse(input.documentType);
      return String(
        await rpc("save_document_type_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_document_type_id: input.documentTypeId ?? null,
          document_title: documentType.title,
          document_description: documentType.description,
          is_required_at_onboarding: documentType.required_at_onboarding,
          is_review_required: documentType.requires_review,
          document_formats: documentType.accepted_formats,
          should_track_expiry: documentType.tracks_expiry,
          warning_days: documentType.expiry_warning_days,
          schedule_impact: documentType.expiry_schedule_impact,
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
