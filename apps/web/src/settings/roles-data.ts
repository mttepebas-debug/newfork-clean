import {
  workspaceRoleInputSchema,
  type PermissionDefinition,
  type WorkspaceRoleInput,
  type WorkspaceRoleRecord,
} from "@newfork/shared";
import { supabaseClient } from "../lib/supabase";

import { readSettings } from "../lib/settings-read";
function client() {
  if (!supabaseClient) throw new Error("Role storage is not configured");
  return supabaseClient;
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
    `${import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:9999" : "")}/v1/workspaces/${workspaceId}/roles${path}`,
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
        : "Role operation failed",
    );
  return body;
}

export async function loadRoleWorkspace(workspaceId: string): Promise<{
  readonly permissions: PermissionDefinition[];
  readonly roles: WorkspaceRoleRecord[];
}> {
  return readSettings(workspaceId, "roles");
}

export async function saveWorkspaceRole(
  workspaceId: string,
  input: WorkspaceRoleInput,
  roleId?: string,
): Promise<string> {
  const role = workspaceRoleInputSchema.parse(input);
  const body = (await request(workspaceId, roleId ? `/${roleId}` : "", {
    method: roleId ? "PUT" : "POST",
    body: JSON.stringify(role),
  })) as { id?: unknown };
  if (!body.id) throw new Error("Role save result is unavailable");
  return String(body.id);
}

export async function deleteWorkspaceRole(
  workspaceId: string,
  roleId: string,
): Promise<void> {
  await request(workspaceId, `/${roleId}`, {
    method: "DELETE",
  });
}
