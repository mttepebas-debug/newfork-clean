import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { PreBizFrame } from "../shell/prebiz/PreBiz";
import { useAuth } from "./AuthContext";
import { WorkspaceSetupPending } from "./WorkspaceSetupPending";

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
          description="You are signed in. Try again, or pick a different workspace."
        >
          <p className="form-error" role="alert">
            {error}
          </p>
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
    return <Navigate to="/invitations/pending" replace />;
  }
  if (
    workspace !== "none" &&
    context &&
    context.onboarding.status !== "complete"
  ) {
    // Setup belongs to the owner. Other members can be active before it is
    // finished (the owner invites the team in the last step) and wait here,
    // also when they open /onboarding directly.
    if (context.membership.role !== "owner") return <WorkspaceSetupPending />;
    if (workspace === "complete") return <Navigate to="/onboarding" replace />;
  }
  return children;
}
