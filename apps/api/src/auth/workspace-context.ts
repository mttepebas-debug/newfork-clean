import {
  type AuthzAction,
  type Permission,
  activeWorkspaceContextFromRow,
  activeWorkspaceRowSchema,
  type ActiveWorkspaceContext,
} from "@newfork/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createUserVerifier } from "./verify-user.js";
import { HttpError } from "../http-error.js";

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

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** No session was sent at all (BL-076): sign in, whatever the workspace. */
export function signedOut(): HttpError {
  return new HttpError("Sign in required", 401, { reason: "session.required" });
}

export function notMember(): HttpError {
  return new HttpError("Workspace not found", 404, { reason: "authz.not_member" });
}

/**
 * Who is asking, in the workspace they named (null: the one they last chose).
 * One call for the membership and the actions the authorization core allows.
 * An unknown workspace and somebody else's get the same answer: not a member.
 */
export async function resolveActor(
  authorization: string | undefined,
  workspaceId: string | null,
  resolver: WorkspaceContextResolver | null,
): Promise<ActiveWorkspaceContext> {
  const accessToken = bearerToken(authorization);
  if (!resolver) throw notMember();
  if (!accessToken) throw signedOut();
  if (workspaceId !== null && !uuid.test(workspaceId)) throw notMember();
  const context = await resolver.resolve(accessToken, workspaceId);
  if (!context || (workspaceId !== null && context.workspace.id !== workspaceId))
    throw notMember();
  return context;
}

/**
 * May they do this somewhere in the workspace? Reads the core's list
 * (app_private.actor_actions); no rule is worked out here. Where exactly is
 * the database's to answer when the work is done.
 */
export function authorize(
  context: ActiveWorkspaceContext,
  action: AuthzAction,
): ActiveWorkspaceContext {
  if (context.actions.includes(action)) return context;
  // ponytail: one reason for "nowhere here"; the core's finer reason (rank,
  // missing permission) needs a database call, add it when a screen tells them apart.
  throw new HttpError("Not allowed", 403, { reason: "authz.out_of_scope", detail: action });
}

export async function resolveWorkspaceAuthorization(input: {
  readonly authorization: string | undefined;
  readonly workspaceId: string;
  readonly permission: Permission;
  readonly resolver: WorkspaceContextResolver | null;
  readonly allowIncompleteOnboarding?: boolean;
}): Promise<WorkspaceAuthorizationResult> {
  const accessToken = bearerToken(input.authorization);
  if (!input.resolver) return { context: null, denied: "workspace_not_found" };
  if (!accessToken) throw signedOut();

  const context = await input.resolver.resolve(accessToken, input.workspaceId);
  if (
    !context ||
    context.workspace.id !== input.workspaceId ||
    context.membership.status !== "active" ||
    context.documentAccess.restricted ||
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
  if (!input.resolver) return { context: null, denied: "workspace_not_found" };
  if (!accessToken) throw signedOut();

  const context = await input.resolver.resolve(accessToken, input.workspaceId);
  if (
    !context ||
    context.workspace.id !== input.workspaceId ||
    context.membership.status !== "active" ||
    context.documentAccess.restricted ||
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
