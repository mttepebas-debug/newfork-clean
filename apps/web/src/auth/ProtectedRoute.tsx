import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { PreBizFrame } from "../shell/prebiz/PreBiz";
import { useAuth } from "./AuthContext";
import { hubPath } from "./resolveLanding";
import { WorkspaceSetupPending } from "./WorkspaceSetupPending";
import { membershipClass } from "./access";

type WorkspaceRequirement = "none" | "any" | "complete";

export function ProtectedRoute({
  children,
  workspace = "none",
}: {
  readonly children: ReactNode;
  readonly workspace?: WorkspaceRequirement;
}) {
  const { authenticated, context, error, ready, refresh } = useAuth();
  const location = useLocation();
  // An invitation no longer stands between an account and its work: if there is
  // somewhere to land, it lands there and the invitation waits in Workspaces.

  if (!ready)
    return <main className="auth-loading" aria-label="Loading workspace" />;

  if (!authenticated) {
    return (
      <Navigate
        to="/sign-in"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  if (workspace !== "none" && !context) {
    if (error) {
      return (
        // Sign out lives in the frame's account block, so this is not a dead end.
        <PreBizFrame
          titleId="workspace-error-title"
          title="That workspace didn't load"
          // The server's own sentence is not for the screen. It said things like
          // "invalid session or membership", which reads as an accusation and
          // tells nobody what to do next.
          description="Something went wrong on our side, not yours. Try again, or pick a different workspace."
        >
          <div className="pb-footer">
            <button
              className="pb-btn pb-btn-primary"
              type="button"
              onClick={() => void refresh()}
            >
              Try again
            </button>
          </div>
        </PreBizFrame>
      );
    }
    // Landing, not a deliberate visit: the hub may hand the account straight
    // to a workspace instead of asking which one.
    return <Navigate to={hubPath} replace state={{ landing: true }} />;
  }
  if (
    workspace !== "none" &&
    context &&
    context.onboarding.status !== "complete"
  ) {
    // Setup belongs to the owner. Other members can be active before it is
    // finished (the owner invites the team in the last step) and wait here,
    // also when they open /onboarding directly.
    if (membershipClass(context.membership) !== "owner") return <WorkspaceSetupPending />;
    if (workspace === "complete") return <Navigate to={hubPath} replace />;
  }
  return children;
}
