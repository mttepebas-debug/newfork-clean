import {
  permissionDefinitionSchema,
  workspaceRoleInputSchema,
  workspaceRoleRecordSchema,
  type PermissionDefinition,
  type WorkspaceRoleInput,
  type WorkspaceRoleRecord,
} from "@newfork/shared";
import { developmentBearerToken, supabaseClient } from "../lib/supabase";

function client() {
  if (!supabaseClient) throw new Error("Role storage is not configured");
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
  const database = client();
  const [permissionResult, roleResult, grantResult, memberResult] =
    await Promise.all([
      database
        .from("permissions")
        .select("key,label,category,description,custom_grantable,sort_order")
        .order("sort_order"),
      database
        .from("workspace_roles")
        .select(
          "id,workspace_id,name,description,system_key,access_class,sort_order,created_at,updated_at",
        )
        .eq("workspace_id", workspaceId)
        .order("sort_order")
        .order("name"),
      database
        .from("workspace_role_permissions")
        .select("role_id,permission_key")
        .eq("workspace_id", workspaceId),
      database
        .from("workspace_memberships")
        .select("role_id")
        .eq("workspace_id", workspaceId)
        .eq("status", "active"),
    ]);

  check(permissionResult.error);
  check(roleResult.error);
  check(grantResult.error);
  check(memberResult.error);

  const permissionsByRole = new Map<string, string[]>();
  for (const grant of grantResult.data ?? []) {
    const roleId = String(grant.role_id);
    const grants = permissionsByRole.get(roleId) ?? [];
    grants.push(String(grant.permission_key));
    permissionsByRole.set(roleId, grants);
  }

  const membersByRole = new Map<string, number>();
  for (const membership of memberResult.data ?? []) {
    const roleId = String(membership.role_id);
    membersByRole.set(roleId, (membersByRole.get(roleId) ?? 0) + 1);
  }

  return {
    permissions: permissionDefinitionSchema
      .array()
      .parse(permissionResult.data ?? []),
    roles: workspaceRoleRecordSchema.array().parse(
      (roleResult.data ?? []).map((role) => ({
        ...role,
        permission_keys: permissionsByRole.get(String(role.id)) ?? [],
        member_count: membersByRole.get(String(role.id)) ?? 0,
      })),
    ),
  };
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
