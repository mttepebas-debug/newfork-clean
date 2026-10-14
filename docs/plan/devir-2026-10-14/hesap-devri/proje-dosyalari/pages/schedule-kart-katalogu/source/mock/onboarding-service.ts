// Demo backend for the account-level pages: the workspace hub and its status
// pages, owner setup (/onboarding) and employee onboarding (/welcome). These
// pages speak for the account rather than for Harbor & Vine's day-to-day, so
// they answer /v1/context and /v1/account/workspaces their own way. The routes
// are registered only on these atlas pages; on every other page nothing here
// exists and the fallbacks in api.ts (and the other areas) answer as before.
import { ApiError, type Handler } from "./api";
import { currentPage } from "../pages";
import { domainStore } from "./store";
import { HARBOR, acceptUploads, noContext } from "./hub-onboarding-shared";
import { employeeCaseRoutes, harborCase, type EmployeeCase } from "./hub-onboarding-employee";
import { hubRoutesForPage } from "./hub-onboarding-hub";
import { ownerSetupRoutes } from "./hub-onboarding-owner";

type Route = (method: string, path: string, handler: Handler) => void;

export function onboardingRoutes(route: Route): void {
  const page = currentPage().id;
  if (page === "workspace-hub") {
    hubRoutesForPage(route);
    return;
  }
  if (page === "owner-onboarding") {
    ownerSetupRoutes(route);
    return;
  }
  if (page === "employee-onboarding") employeeWelcomeRoutes(route);
}

/**
 * Maria Lopez, invited to Harbor & Vine and not through onboarding yet: her
 * only membership is pending, so there is no workspace context to open.
 */
function employeeWelcomeRoutes(route: Route): void {
  const store = domainStore<{ cases: Record<string, EmployeeCase> }>("employee-welcome", () => ({
    cases: { [HARBOR.id]: harborCase() },
  }));
  acceptUploads();
  // PAGES 1.4: the invitation link. The token's last word picks the state the
  // server would answer (valid, expired, revoked, replaced, declined, accepted).
  const inviteState = (token: unknown) => {
    const word = String(token ?? "").split("-").pop() ?? "";
    return ["expired", "revoked", "replaced", "declined", "accepted"].includes(word) ? word : "valid";
  };
  route("POST", "/v1/invitations/preview", ({ body }) => ({
    state: inviteState(body?.token), workspaceName: HARBOR.name, emailHint: "m***@harborvine.test",
    expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  }));
  route("POST", "/v1/invitations/accept", ({ body }) => {
    if (inviteState(body?.token) !== "valid") throw new ApiError(409, { code: "invitation_unavailable" });
    return { workspaceId: HARBOR.id };
  });
  route("GET", "/v1/context", () => noContext());
  route("GET", "/v1/account/workspaces", () =>
    Object.values(store.data.cases).map((onboarding) => ({
      id: onboarding.workspace_id, name: onboarding.workspace_name, role: "employee",
      status: onboarding.case_status === "approved" ? "active" : "pending",
      isActive: false, onboarding: { status: "complete", currentStep: 4, revision: 1 },
      lifecycleStatus: "active", accessRemoved: false, lastUsedAt: null,
      closureEffectiveAt: null, defaultClosureEffectiveAt: null, pendingOwnershipTransfer: null,
    })));
  employeeCaseRoutes(route, {
    cases: () => store.data.cases,
    save: () => store.save(),
    // Leaving drops the case; the hub lists what is left.
    left: () => undefined,
  });
}
