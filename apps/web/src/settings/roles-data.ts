import {
  permissionDefinitionSchema,
  workspaceRoleInputSchema,
  workspaceRoleRecordSchema,
  type PermissionDefinition,
  type WorkspaceRoleInput,
  type WorkspaceRoleRecord,
} from "@newfork/shared";
import { supabaseClient } from "../lib/supabase";

function client() {
  if (!supabaseClient) throw new Error("Role storage is not configured");
  return supabaseClient;
}

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
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
  const { data, error } = await client().rpc("save_workspace_role", {
    target_workspace_id: workspaceId,
    target_role_id: roleId ?? null,
    role_name: role.name,
    role_description: role.description,
    role_access_class: role.access_class,
    permission_keys: role.permission_keys,
  });
  check(error);
  return String(data);
}

export async function deleteWorkspaceRole(
  workspaceId: string,
  roleId: string,
): Promise<void> {
  const { error } = await client().rpc("delete_workspace_role", {
    target_workspace_id: workspaceId,
    target_role_id: roleId,
  });
  check(error);
}
