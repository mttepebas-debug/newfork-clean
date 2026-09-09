import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "./AuthContext";

type WorkspaceRequirement = "none" | "any" | "complete";

export function ProtectedRoute({
  children,
  workspace = "none",
}: {
  readonly children: ReactNode;
  readonly workspace?: WorkspaceRequirement;
}) {
  const { authenticated, context, error, ready, refresh, signOut } = useAuth();
  const location = useLocation();

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
        <main className="auth-recovery" aria-labelledby="workspace-error-title">
          <section className="sign-in-panel">
            <p className="product-mark">NEWFORK</p>
            <h1 id="workspace-error-title">Workspace unavailable</h1>
            <p className="muted">
              Your account is signed in, but the workspace could not be loaded.
            </p>
            <p className="form-error" role="alert">
              {error}
            </p>
            <div className="auth-recovery-actions">
              <button
                className="nf-button"
                type="button"
                onClick={() => void refresh()}
              >
                Try again
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </div>
          </section>
        </main>
      );
    }
    return <Navigate to="/invitations/pending" replace />;
  }
  if (
    workspace === "complete" &&
    context &&
    context.onboarding.status !== "complete"
  ) {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}
