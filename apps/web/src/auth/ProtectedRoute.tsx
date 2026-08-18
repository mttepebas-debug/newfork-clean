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
  const { authenticated, context, ready } = useAuth();
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

  if (workspace !== "none" && !context)
    return <Navigate to="/account/workspaces" replace />;
  if (
    workspace === "complete" &&
    context?.membership.role === "owner" &&
    context.onboarding.status === "incomplete"
  )
    return <Navigate to="/onboarding" replace />;

  return children;
}
