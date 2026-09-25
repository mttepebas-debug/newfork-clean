import {
  expected,
  type ActiveWorkspaceContext,
  type AuthzAction,
  type AuthzTarget,
  type TargetedAuthzAction,
} from "@newfork/shared";

/**
 * May the person signed in do this? The one question every gate on screen asks.
 *
 * - No target: may they do it anywhere in the workspace. The answer is the
 *   authorization core's own (`context.actions`, app_private.actor_actions), so
 *   no rule is rewritten here.
 * - A target (a location, a person's record, request or shift): the matrix
 *   rules from @newfork/shared `expected()`, the twin of the SQL matrix.
 *
 * The API still decides; this only decides what to show.
 */
export function can(
  context: ActiveWorkspaceContext | null | undefined,
  action: AuthzAction,
): boolean;
export function can(
  context: ActiveWorkspaceContext | null | undefined,
  action: TargetedAuthzAction,
  target: AuthzTarget,
): boolean;
export function can(
  context: ActiveWorkspaceContext | null | undefined,
  action: AuthzAction,
  target?: AuthzTarget,
): boolean {
  if (!context) return false;
  if (target === undefined) return context.actions.includes(action);
  return expected(
    {
      workspaceId: context.workspace.id,
      role: context.membership.role,
      // A missing required document holds a person back like unfinished onboarding.
      status: context.documentAccess.restricted ? "restricted" : "active",
      // ponytail: allLocations sends an empty list; that reaches nowhere, which
      // only matters for a manager, whose reach is where they work (M2).
      locationIds: context.locationScope.locationIds,
      permissions: context.permissions,
    },
    action as TargetedAuthzAction,
    target,
  );
}
