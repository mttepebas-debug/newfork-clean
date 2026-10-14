import type {
  ActiveWorkspaceContext,
  WorkspaceRole,
  WorkspaceSummary,
} from "@newfork/shared";
import { can } from "./can";

export const hubPath = "/workspaces";

/** Where a sign-in, a sign-up or a membership change puts the account. */
export type Landing =
  /** A usable invitation token is in the URL: it is answered before anything else. */
  | { readonly kind: "invitation"; readonly path: string }
  /** The account owes a decision, or belongs nowhere yet. The hub says which. */
  | { readonly kind: "hub"; readonly path: typeof hubPath }
  /** One workspace to work in, and the page inside it the role can open. */
  | {
      readonly kind: "workspace";
      readonly path: string;
      readonly workspaceId: string;
    };

export type LandingInput = {
  /** An invitation token carried by the URL, already validated as present. */
  readonly inviteToken?: string | null;
  /** How many invitations are waiting for this email. */
  readonly pendingInvitationCount?: number;
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
  if (context.membership.role === "employee")
    return workspaceLandingPathForRole(context.membership.role);
  if (can(context, "workspace.read"))
    return workspaceLandingPathForRole(context.membership.role);
  if (can(context, "schedule.read")) return "/app/schedule";
  return hubPath;
}

/**
 * Where "Back to Home" goes from a page the API refused (`NoAccessState`).
 * Not `/app`: for a schedule-only person that lands right back on Schedule, and
 * the card and the page would hand them to each other. Employee Hub for an
 * employee; Workspace for whoever else can read it; never the page that
 * refused; otherwise the hub, which every signed-in account can open.
 */
export function noAccessHomePath(
  context: ActiveWorkspaceContext | null | undefined,
  refusedPath: string,
): string {
  const home =
    context?.membership?.role === "employee"
      ? workspaceLandingPathForRole("employee")
      : can(context, "workspace.read")
        ? workspaceLandingPathForRole("manager")
        : hubPath;
  return refusedPath === home ? hubPath : home;
}

/**
 * The one place that decides where an account lands. Every sign-in, sign-up and
 * membership change asks this and nothing else; the first rule that matches
 * wins, so reading it top to bottom is reading the product decision.
 */
export function resolveLanding(input: LandingInput): Landing {
  const workspaces = input.workspaces ?? [];
  const ready = readyWorkspaces(workspaces);

  // An invitation link is the reason this tab is open. It outranks everything,
  // including a workspace the account could otherwise land in.
  if (input.inviteToken)
    return {
      kind: "invitation",
      path: `/invite/accept?token=${encodeURIComponent(input.inviteToken)}`,
    };

  // Nowhere to work yet, but something is waiting: an invitation to answer or a
  // setup to finish. Both are decisions, and the hub is where decisions live.
  if (ready.length === 0) {
    if ((input.pendingInvitationCount ?? 0) > 0) return hub();
    if (unfinishedWorkspaces(workspaces).length > 0) return hub();
  }

  // One workspace, so there is nothing to choose. An invitation or an unfinished
  // setup does not stand in the way here: it waits in the hub and says so in the
  // app.
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
