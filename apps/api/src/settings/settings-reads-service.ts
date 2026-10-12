import { createClient } from "@supabase/supabase-js";
import {
  settingsReadSchemas,
  type SettingsRead,
  type SettingsReadKind,
} from "@newfork/shared";
import { rpcFailure } from "../http-error";

/** Each Settings read is one `*_service` that decides who may read it (FB-6.1.9). */
const serviceFunction: Record<SettingsReadKind, string> = {
  locations: "list_settings_locations_service",
  jobs: "read_settings_jobs_service",
  "shift-types": "list_settings_shift_types_service",
  "shift-labels": "list_settings_shift_labels_service",
  roles: "read_role_workspace_service",
  "document-types": "list_settings_document_types_service",
  acknowledgements: "read_signature_settings_service",
};

export interface SettingsReadsService {
  read<K extends SettingsReadKind>(
    kind: K,
    input: { readonly actorUserId: string; readonly workspaceId: string },
  ): Promise<SettingsRead<K>>;
}

interface RpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message: string; code?: string; hint?: string | null; details?: string | null } | null;
  }>;
}

export function createSettingsReadsService(options: {
  url: string;
  serviceRoleKey: string;
}): SettingsReadsService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as RpcClient;
  return settingsReadsService(client);
}

export function settingsReadsService(client: RpcClient): SettingsReadsService {
  return {
    async read(kind, input) {
      const { data, error } = await client.rpc(serviceFunction[kind], {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
      });
      if (error) throw rpcFailure(error);
      return settingsReadSchemas[kind].parse(data) as SettingsRead<typeof kind>;
    },
  };
}
