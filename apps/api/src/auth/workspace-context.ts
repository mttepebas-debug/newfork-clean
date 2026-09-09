import {
  type Permission,
  activeWorkspaceContextFromRow,
  activeWorkspaceRowSchema,
  type ActiveWorkspaceContext,
} from "@newfork/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
  readonly serviceRoleKey?: string;
}

function createRequestClient(
  options: SupabaseResolverOptions,
  accessToken: string,
): SupabaseClient {
  return createClient(options.url, options.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function createSupabaseWorkspaceContextResolver(
  options: SupabaseResolverOptions,
): WorkspaceContextResolver {
  const authClient = createClient(options.url, options.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const serviceClient = options.serviceRoleKey
    ? createClient(options.url, options.serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

  // Concurrent screen reads may verify the same token together. Share only the
  // unfinished network request; never cache a completed identity or permissions.
  const verifying = new Map<
    string,
    ReturnType<typeof authClient.auth.getUser>
  >();
  const verifyUser = (accessToken: string) => {
    let pending = verifying.get(accessToken);
    if (!pending) {
      pending = authClient.auth.getUser(accessToken).finally(() => {
        verifying.delete(accessToken);
      });
      verifying.set(accessToken, pending);
    }
    return pending;
  };

  return {
    async resolve(accessToken, workspaceId = null) {
      const { data: userData, error: userError } =
        await verifyUser(accessToken);
      if (
        userError &&
        ((userError.status ?? 0) >= 500 ||
          userError.status === 429 ||
          userError.name === "AuthRetryableFetchError")
      ) {
        throw Object.assign(
          new Error("Workspace access could not be checked. Please try again."),
          { statusCode: 503 },
        );
      }
      if (userError || !userData.user) return null;

      const requestClient = createRequestClient(options, accessToken);
      const dataClient = serviceClient ?? requestClient;
      const { data, error } = serviceClient
        ? workspaceId
          ? await serviceClient.rpc("resolve_workspace_context_service", {
              actor_user_id: userData.user.id,
              target_workspace_id: workspaceId,
            })
          : await serviceClient.rpc("resolve_active_workspace_service", {
              actor_user_id: userData.user.id,
            })
        : await requestClient.rpc("resolve_active_workspace");
      if (error)
        throw new Error(`Active workspace resolution failed: ${error.message}`);

      const row = activeWorkspaceRowSchema.nullable().parse(data?.[0] ?? null);
      if (!row || row.user_id !== userData.user.id) {
        if (serviceClient && workspaceId) {
          await recordDeniedWorkspaceContext({
            serviceClient,
            actorUserId: userData.user.id,
            workspaceId,
          });
        }
        return null;
      }

      let locationIds: string[] = [];
      if (!row.all_locations) {
        const { data: scopes, error: scopesError } = await dataClient
          .from("membership_location_scopes")
          .select("location_id")
          .eq("membership_id", row.membership_id);
        if (scopesError)
          throw new Error(
            `Location scope resolution failed: ${scopesError.message}`,
          );
        locationIds = (scopes ?? []).map((scope) => String(scope.location_id));
      }

      const context = activeWorkspaceContextFromRow(row, locationIds);
      return {
        ...context,
        workspace: {
          ...context.workspace,
          logo_url: row.workspace_logo_storage_path
            ? dataClient.storage
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
