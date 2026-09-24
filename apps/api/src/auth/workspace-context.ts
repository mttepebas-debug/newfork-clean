import {
  type Permission,
  activeWorkspaceContextFromRow,
  activeWorkspaceRowSchema,
  type ActiveWorkspaceContext,
} from "@newfork/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createUserVerifier } from "./verify-user.js";

export interface WorkspaceContextResolver {
  resolve(
    accessToken: string,
    workspaceId?: string | null,
  ): Promise<ActiveWorkspaceContext | null>;
}

export type WorkspaceAuthorizationDeniedReason =
  "workspace_not_found" | "permission_denied";

export type WorkspaceAuthorizationResult =
  | { readonly context: ActiveWorkspaceContext; readonly denied: null }
  | {
      readonly context: null;
      readonly denied: WorkspaceAuthorizationDeniedReason;
    };

export function bearerToken(authorization: string | undefined): string {
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

export async function resolveAuthorizedWorkspaceContext(input: {
  readonly authorization: string | undefined;
  readonly workspaceId: string;
  readonly permission: Permission;
  readonly resolver: WorkspaceContextResolver | null;
  readonly allowIncompleteOnboarding?: boolean;
}): Promise<ActiveWorkspaceContext | null> {
  const accessToken = bearerToken(input.authorization);
  if (!input.resolver || !accessToken) return null;

  const context = await input.resolver.resolve(accessToken, input.workspaceId);
  if (
    !context ||
    context.workspace.id !== input.workspaceId ||
    context.membership.status !== "active" ||
    context.documentAccess?.restricted ||
    (!input.allowIncompleteOnboarding &&
      context.onboarding.status !== "complete") ||
    !context.permissions.includes(input.permission)
  ) {
    return null;
  }
  return context;
}

export async function resolveWorkspaceAuthorization(input: {
  readonly authorization: string | undefined;
  readonly workspaceId: string;
  readonly permission: Permission;
  readonly resolver: WorkspaceContextResolver | null;
  readonly allowIncompleteOnboarding?: boolean;
}): Promise<WorkspaceAuthorizationResult> {
  const accessToken = bearerToken(input.authorization);
  if (!input.resolver || !accessToken) {
    return { context: null, denied: "workspace_not_found" };
  }

  const context = await input.resolver.resolve(accessToken, input.workspaceId);
  if (
    !context ||
    context.workspace.id !== input.workspaceId ||
    context.membership.status !== "active" ||
    context.documentAccess?.restricted ||
    (!input.allowIncompleteOnboarding &&
      context.onboarding.status !== "complete")
  ) {
    return { context: null, denied: "workspace_not_found" };
  }
  if (!context.permissions.includes(input.permission)) {
    return { context: null, denied: "permission_denied" };
  }
  return { context, denied: null };
}

export async function resolveWorkspaceAnyPermissionAuthorization(input: {
  readonly authorization: string | undefined;
  readonly workspaceId: string;
  readonly anyOf: readonly Permission[];
  readonly resolver: WorkspaceContextResolver | null;
  readonly allowIncompleteOnboarding?: boolean;
}): Promise<WorkspaceAuthorizationResult> {
  const membership = await resolveWorkspaceMembership(input);
  if (!membership.context) return membership;
  if (
    !input.anyOf.some((permission) =>
      membership.context.permissions.includes(permission),
    )
  ) {
    return { context: null, denied: "permission_denied" };
  }
  return membership;
}

export async function resolveWorkspaceMembership(input: {
  readonly authorization: string | undefined;
  readonly workspaceId: string;
  readonly resolver: WorkspaceContextResolver | null;
  readonly allowIncompleteOnboarding?: boolean;
}): Promise<WorkspaceAuthorizationResult> {
  const accessToken = bearerToken(input.authorization);
  if (!input.resolver || !accessToken) {
    return { context: null, denied: "workspace_not_found" };
  }

  const context = await input.resolver.resolve(accessToken, input.workspaceId);
  if (
    !context ||
    context.workspace.id !== input.workspaceId ||
    context.membership.status !== "active" ||
    context.documentAccess?.restricted ||
    (!input.allowIncompleteOnboarding &&
      context.onboarding.status !== "complete")
  ) {
    return { context: null, denied: "workspace_not_found" };
  }
  return { context, denied: null };
}

interface SupabaseResolverOptions {
  readonly url: string;
  readonly anonKey: string;
  readonly serviceRoleKey: string;
}

export function createSupabaseWorkspaceContextResolver(
  options: SupabaseResolverOptions,
): WorkspaceContextResolver {
  const verifyUser = createUserVerifier(
    createClient(options.url, options.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  );
  const serviceClient = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    async resolve(accessToken, workspaceId = null) {
      const user = await verifyUser(accessToken);
      if (!user) return null;

      // One call: the membership, its permissions and location scope, document
      // access, and the actions the authorization core allows somewhere.
      const { data, error } = await serviceClient.rpc(
        "resolve_workspace_context_service",
        { actor_user_id: user.id, target_workspace_id: workspaceId },
      );
      if (error)
        throw new Error(`Workspace context resolution failed: ${error.message}`);

      const row = activeWorkspaceRowSchema.nullable().parse(data?.[0] ?? null);
      if (!row || row.user_id !== user.id) {
        if (workspaceId) {
          await recordDeniedWorkspaceContext({
            serviceClient,
            actorUserId: user.id,
            workspaceId,
          });
        }
        return null;
      }

      const context = activeWorkspaceContextFromRow(row);
      return {
        ...context,
        workspace: {
          ...context.workspace,
          logo_url: row.workspace_logo_storage_path
            ? serviceClient.storage
                .from("workspace-logos")
                .getPublicUrl(row.workspace_logo_storage_path).data.publicUrl
            : null,
        },
      };
    },
  };
}

async function recordDeniedWorkspaceContext(input: {
  readonly serviceClient: SupabaseClient;
  readonly actorUserId: string;
  readonly workspaceId: string;
}): Promise<void> {
  try {
    await input.serviceClient.rpc("record_security_audit_event_service", {
      actor_user_id: input.actorUserId,
      target_workspace_id: null,
      event_type: "tenant.workspace_context_denied",
      surface: "workspace_context.resolve",
      resource_type: "workspace",
      raw_resource_id: input.workspaceId,
      metadata: { reason: "workspace_context_not_resolved" },
    });
  } catch {
    // Authorization must not depend on audit sink availability.
  }
}
