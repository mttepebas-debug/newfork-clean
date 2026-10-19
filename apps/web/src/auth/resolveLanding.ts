import type {
  ActiveWorkspaceContext,
  WorkspaceRole,
  WorkspaceSummary,
} from "@newfork/shared";
import { can } from "./can";
import { membershipClass } from "./access";

export const hubPath = "/workspaces";
/** "Active invitation found": the first screen of an open while one waits. */
export const invitationsPath = "/invitations";

/** Where a sign-in, a sign-up or a membership change puts the account. */
export type Landing =
  /** An invitation waits and this open has not put it in front of the account yet. */
  | { readonly kind: "invitations"; readonly path: typeof invitationsPath }
  /** The account owes a decision, or belongs nowhere yet. The hub says which. */
  | { readonly kind: "hub"; readonly path: typeof hubPath }
  /** One workspace to work in, and the page inside it the role can open. */
  | {
      readonly kind: "workspace";
      readonly path: string;
      readonly workspaceId: string;
    };

export type LandingInput = {
  /** How many invitations are waiting for this email. */
  readonly pendingInvitationCount?: number;
  /** This open already showed them: answered, joined, or "Not now". */
  readonly invitationAnswered?: boolean;
  readonly workspaces?: readonly WorkspaceSummary[];
  /** The workspace already loaded, when there is one; it names the page. */
  readonly context?: ActiveWorkspaceContext | null;
};

/**
 * Workspaces the account can actually work in. A workspace whose setup is
 * unfinished is not one of them: it is an open item the account still has to
 * decide about.
 */
export function readyWorkspaces(
  workspaces: readonly WorkspaceSummary[],
): WorkspaceSummary[] {
  return workspaces.filter(
    (workspace) =>
      workspace.status === "active" &&
      workspace.onboarding.status === "complete",
  );
}

/** Setups the account started and never finished, employee and employer alike. */
export function unfinishedWorkspaces(
  workspaces: readonly WorkspaceSummary[],
): WorkspaceSummary[] {
  return workspaces.filter(
    (workspace) =>
      workspace.status === "pending" ||
      (workspace.status === "active" &&
        workspace.onboarding.status !== "complete"),
  );
}

export function workspaceLandingPathForRole(role: WorkspaceRole): string {
  return role === "employee" ? "/app/employee-hub" : "/app/workspace";
}

/** The page inside a workspace this person can open, by the core's answer. */
export function appLandingPath(
  context: ActiveWorkspaceContext | null,
): string {
  if (!context) return hubPath;
  if (membershipClass(context.membership) === "employee")
    return workspaceLandingPathForRole(membershipClass(context.membership));
  if (can(context, "workspace.read"))
    return workspaceLandingPathForRole(membershipClass(context.membership));
  if (can(context, "schedule.read")) return "/app/schedule";
  return hubPath;
}

/**
 * Where "Back to Home" goes from a page the API refused (`NoAccessState`).
 * Not `/app`: for a schedule-only person that lands right back on Schedule, and
 * the card and the page would hand them to each other. Employee Hub for an
 * employee the core lets in; Workspace for whoever else can read it; never the page that
 * refused; otherwise the hub, which every signed-in account can open.
 */
export function noAccessHomePath(
  context: ActiveWorkspaceContext | null | undefined,
  refusedPath: string,
): string {
  const home =
    (context?.membership ? membershipClass(context.membership) : undefined) === "employee"
      ? can(context, "employee_hub.read")
        ? workspaceLandingPathForRole("employee")
        : hubPath
      : can(context, "workspace.read")
        ? workspaceLandingPathForRole("manager")
        : hubPath;
  return refusedPath.replace(/\/+$/, "") === home ? hubPath : home;
}

/**
 * KARARLAR "Girişten sonra yönlendirme": while an invitation waits, it is the
 * first screen of every open of the app, before any workspace (BL-624). The
 * first rule of `resolveLanding`, and the question `ProtectedRoute` asks before
 * it shows any page.
 */
export function invitationsComeFirst(
  input: Pick<LandingInput, "pendingInvitationCount" | "invitationAnswered">,
): boolean {
  return (input.pendingInvitationCount ?? 0) > 0 && !input.invitationAnswered;
}

/**
 * Where an account lands: the hub's hand-off, the workspace switcher, the
 * invitation screen's "Not now". A sign-in goes to `/app`, where
 * `ProtectedRoute` asks `invitationsComeFirst` and `appLandingPath` names the
 * page. The first rule that matches wins, so reading it top to bottom is
 * reading the product decision.
 */
export function resolveLanding(input: LandingInput): Landing {
  const workspaces = input.workspaces ?? [];
  const ready = readyWorkspaces(workspaces);

  // A waiting invitation is answered first, with or without a workspace to work
  // in; "Not now" is offered only to somebody who has one.
  if (invitationsComeFirst(input))
    return { kind: "invitations", path: invitationsPath };

  // Nowhere to work yet, but a setup to finish: a decision, and the hub is
  // where decisions live.
  if (ready.length === 0 && unfinishedWorkspaces(workspaces).length > 0)
    return hub();

  // Somewhere to work: the one used last. An unfinished setup waits in the hub.
  const recent = mostRecentlyUsed(ready);
  if (recent) return workspaceLanding(recent, input.context);

  // Nothing ready, nothing waiting: the hub's empty hand.
  return hub();
}

function hub(): Landing {
  return { kind: "hub", path: hubPath };
}

function workspaceLanding(
  workspace: WorkspaceSummary,
  context: ActiveWorkspaceContext | null | undefined,
): Landing {
  // The loaded context names the page only when it is this workspace's.
  const path =
    context && context.workspace.id === workspace.id
      ? appLandingPath(context)
      : workspaceLandingPathForRole(workspace.role);
  return { kind: "workspace", path, workspaceId: workspace.id };
}

/**
 * The one the account used last. `lastUsedAt` answers it once the switcher
 * writes it; until then the saved default is the only thing that knows, and a
 * stable order is better than an arbitrary one.
 */
function mostRecentlyUsed(
  workspaces: readonly WorkspaceSummary[],
): WorkspaceSummary | null {
  return workspaces.reduce<WorkspaceSummary | null>((best, candidate) => {
    if (!best) return candidate;
    const byUse = usedAt(candidate) - usedAt(best);
    if (byUse !== 0) return byUse > 0 ? candidate : best;
    return candidate.name.localeCompare(best.name) < 0 ? candidate : best;
  }, null);
}

function usedAt(workspace: WorkspaceSummary): number {
  if (workspace.lastUsedAt) return Date.parse(workspace.lastUsedAt);
  return workspace.isActive ? 1 : 0;
}
