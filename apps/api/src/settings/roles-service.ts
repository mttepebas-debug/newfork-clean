import {
  workspaceRoleInputSchema,
  type WorkspaceRoleInput,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";

export interface RolesService {
  save(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly roleId?: string;
    readonly role: WorkspaceRoleInput;
  }): Promise<string>;
  delete(input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly roleId: string;
  }): Promise<void>;
}

interface RpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export function createRolesService(options: {
  url: string;
  serviceRoleKey: string;
}): RolesService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return createRolesServiceWithClient(client);
}

export function createRolesServiceWithClient(client: RpcClient): RolesService {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }

  return {
    async save(input) {
      const role = workspaceRoleInputSchema.parse(input.role);
      return String(
        await rpc("save_workspace_role_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_role_id: input.roleId ?? null,
          role_name: role.name,
          role_description: role.description,
          role_access_class: role.access_class,
          permission_keys: role.permission_keys,
        }),
      );
    },
    async delete(input) {
      await rpc("delete_workspace_role_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_role_id: input.roleId,
      });
    },
  };
}
